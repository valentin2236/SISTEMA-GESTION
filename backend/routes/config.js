import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import logger from "../utils/logger.js";

const router = Router();

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

// ── Asegurar tabla ──────────────────────────────────────────
export async function ensureConfigTable() {
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// ── GET /api/config ─────────────────────────────────────────
// Devuelve toda la config EXCEPTO la API key (nunca al frontend)
router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT clave, valor FROM configuracion`, [], (err, rows) =>
        err ? reject(err) : resolve(rows)
      );
    });

    const cfg = {};
    for (const row of rows) {
      // Nunca devolver la API key al frontend
      if (row.clave === "anthropic_api_key") continue;
      try { cfg[row.clave] = JSON.parse(row.valor); }
      catch { cfg[row.clave] = row.valor; }
    }

    // Indicar si hay key configurada (sin revelarla)
    const keyRow = await get(
      `SELECT valor FROM configuracion WHERE clave = 'anthropic_api_key'`
    );
    cfg.anthropic_key_configurada = !!(keyRow?.valor);

    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// ── PUT /api/config ─────────────────────────────────────────
// Guarda o actualiza claves. Solo admin.
router.put("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const data = req.body;
    if (typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "FORMATO_INVALIDO" });
    }

    for (const [clave, valor] of Object.entries(data)) {
      const valorStr = typeof valor === "string" ? valor : JSON.stringify(valor);
      await run(
        `INSERT INTO configuracion (clave, valor, actualizado_en)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(clave) DO UPDATE SET
           valor = excluded.valor,
           actualizado_en = excluded.actualizado_en`,
        [clave, valorStr]
      );
    }

    const claves = Object.keys(data).map(k => k === 'anthropic_api_key' ? 'anthropic_api_key (oculta)' : k);
    registrarAuditoria(req.user.email, 'CAMBIAR_CONFIG', claves.join(', '));

    res.json({ ok: true });
  } catch (e) {
    logger.error('Error actualizando config', { error: e.message });
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// ── GET /api/config/anthropic-key ───────────────────────────
// Solo para uso interno del backend — devuelve la key real.
// NO exponer en el frontend.
export async function getAnthropicKey() {
  try {
    const row = await get(
      `SELECT valor FROM configuracion WHERE clave = 'anthropic_api_key'`
    );
    return row?.valor || process.env.ANTHROPIC_API_KEY || null;
  } catch {
    return process.env.ANTHROPIC_API_KEY || null;
  }
}


// ── GET /api/config/test-ia ──────────────────────────────────
// Hace un ping mínimo a Anthropic para verificar que la key es válida
router.get("/test-ia", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      return res.status(402).json({ ok: false, details: "Sin API key configurada" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // modelo más barato para el test
        max_tokens: 10,
        messages: [{ role: "user", content: "di solo: ok" }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(200).json({
        ok: false,
        details: err?.error?.message || `HTTP ${response.status}`,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, details: e.message });
  }
});
export default router;
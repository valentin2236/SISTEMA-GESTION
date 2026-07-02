import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = Router();

// =====================================
// HELPERS
// =====================================

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

// =====================================
// LISTAR
// GET /api/notificaciones
// =====================================

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT *
      FROM notificaciones
      ORDER BY id DESC
      LIMIT 20
    `);

    res.json(rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "ERROR_NOTIFICACIONES",
    });

  }
});

// =====================================
// CREAR
// POST /api/notificaciones
// =====================================

router.post("/", requireAuth, async (req, res) => {
  try {

    const {
      titulo,
      mensaje,
      tipo = "info",
    } = req.body;

    await run(
      `
      INSERT INTO notificaciones (
        titulo,
        mensaje,
        tipo
      )
      VALUES (?, ?, ?)
    `,
      [
        titulo,
        mensaje,
        tipo,
      ]
    );

    res.status(201).json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "ERROR_CREAR_NOTIFICACION",
    });

  }
});

// =====================================
// MARCAR LEIDA
// PUT /api/notificaciones/:id/leida
// =====================================

router.put("/:id/leida", requireAuth, async (req, res) => {
  try {

    await run(
      `
      UPDATE notificaciones
      SET leida = 1
      WHERE id = ?
    `,
      [req.params.id]
    );

    res.json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "ERROR_MARCAR_LEIDA",
    });

  }
});

// =====================================
// AUTO-REFRESH (reglas automáticas)
// POST /api/notificaciones/refresh
// También exportado para llamarse internamente
// =====================================

export async function autoRefreshNotificaciones() {
  try {
    // ── 1. Predicción de quiebre de stock ──────────────────
    const productos = await all(`
      SELECT id, nombre, sku, stock FROM productos
      WHERE activo = 1 AND stock >= 0
    `);
    const velocidades = await all(`
      SELECT vi.producto_id,
             SUM(vi.cantidad) as vendido_30d
      FROM venta_items vi
      JOIN ventas v ON v.id = vi.venta_id
      WHERE v.fecha >= date('now', '-30 days')
      GROUP BY vi.producto_id
    `);
    const velMap = {};
    for (const v of velocidades) velMap[v.producto_id] = Number(v.vendido_30d) / 30;

    for (const p of productos) {
      const vel = velMap[p.id] || 0;
      if (vel <= 0) continue;
      const dias = Math.floor(p.stock / vel);

      let tipo = null;
      let titulo = null;
      let mensaje = null;

      if (dias <= 2) {
        tipo = 'error';
        titulo = `⛔ Quiebre inminente: ${p.nombre}`;
        mensaje = `Solo quedan ${p.stock} u. en stock. Al ritmo actual se agota en ${dias} día${dias !== 1 ? 's' : ''}.`;
      } else if (dias <= 7) {
        tipo = 'warning';
        titulo = `⚠️ Stock crítico: ${p.nombre}`;
        mensaje = `Quedan ${p.stock} u. Se agota en ~${dias} días. Considerá reponer pronto.`;
      }

      if (!tipo) continue;

      // No duplicar: verificar si ya existe una notificación no leída del mismo producto
      const existe = await new Promise((res, rej) =>
        db.get(
          `SELECT id FROM notificaciones WHERE titulo = ? AND leida = 0`,
          [titulo],
          (e, r) => e ? rej(e) : res(r)
        )
      );
      if (existe) continue;

      await run(
        `INSERT INTO notificaciones (titulo, mensaje, tipo) VALUES (?, ?, ?)`,
        [titulo, mensaje, tipo]
      );
    }

    // ── 2. Stock en cero ──────────────────────────────────
    const sinStock = await all(`
      SELECT nombre FROM productos WHERE activo = 1 AND stock = 0 LIMIT 10
    `);
    for (const p of sinStock) {
      const titulo = `📦 Sin stock: ${p.nombre}`;
      const existe = await new Promise((res, rej) =>
        db.get(`SELECT id FROM notificaciones WHERE titulo = ? AND leida = 0`,
          [titulo], (e, r) => e ? rej(e) : res(r))
      );
      if (existe) continue;
      await run(
        `INSERT INTO notificaciones (titulo, mensaje, tipo) VALUES (?, ?, ?)`,
        [titulo, `El producto "${p.nombre}" está en 0 unidades.`, 'warning']
      );
    }

  } catch (e) {
    logger.error('autoRefreshNotificaciones error', { error: e.message });
  }
}

router.post("/refresh", requireAuth, async (_req, res) => {
  await autoRefreshNotificaciones();
  res.json({ ok: true });
});

export default router;
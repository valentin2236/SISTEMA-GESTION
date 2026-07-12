import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

function all(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function get(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function run(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this); }));
}

function argDate() {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

// GET /api/promociones — lista todas (activas o no)
router.get("/", requireAuth, requireRole("admin", "vendedor"), async (req, res) => {
  try {
    const soloActivas = req.query.activas === "1";
    const hoy = argDate();
    const rows = await all(`
      SELECT p.*, pr.nombre AS producto_nombre, pr.precio AS precio_normal, pr.sku
      FROM promociones p
      JOIN productos pr ON pr.id = p.producto_id
      ${soloActivas
        ? `WHERE p.activa = 1
             AND (p.fecha_desde IS NULL OR p.fecha_desde <= ?)
             AND (p.fecha_hasta IS NULL OR p.fecha_hasta >= ?)`
        : ""}
      ORDER BY p.id DESC
    `, soloActivas ? [hoy, hoy] : []);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/promociones/producto/:id — promo activa para un producto
router.get("/producto/:id", requireAuth, async (req, res) => {
  try {
    const hoy = argDate();
    const row = await get(`
      SELECT p.*, pr.nombre AS producto_nombre, pr.precio AS precio_normal
      FROM promociones p
      JOIN productos pr ON pr.id = p.producto_id
      WHERE p.producto_id = ?
        AND p.activa = 1
        AND (p.fecha_desde IS NULL OR p.fecha_desde <= ?)
        AND (p.fecha_hasta IS NULL OR p.fecha_hasta >= ?)
      ORDER BY p.id DESC
      LIMIT 1
    `, [req.params.id, hoy, hoy]);
    res.json(row || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/promociones — crear
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { producto_id, nombre, cantidad, precio_promo, fecha_desde, fecha_hasta } = req.body;
    if (!producto_id || !cantidad || precio_promo == null) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
    const r = await run(`
      INSERT INTO promociones (producto_id, nombre, cantidad, precio_promo, fecha_desde, fecha_hasta)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      producto_id,
      nombre || `Promo ${cantidad}x1`,
      cantidad,
      precio_promo,
      fecha_desde || null,
      fecha_hasta || null,
    ]);
    res.status(201).json({ id: r.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/promociones/:id — activar/desactivar o editar precio
router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { activa, precio_promo, fecha_hasta } = req.body;
    const fields = [];
    const params = [];
    if (activa !== undefined) { fields.push("activa = ?"); params.push(activa ? 1 : 0); }
    if (precio_promo !== undefined) { fields.push("precio_promo = ?"); params.push(precio_promo); }
    if (fecha_hasta !== undefined) { fields.push("fecha_hasta = ?"); params.push(fecha_hasta); }
    if (!fields.length) return res.status(400).json({ error: "Nada que actualizar" });
    params.push(req.params.id);
    await run(`UPDATE promociones SET ${fields.join(", ")} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/promociones/:id
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await run("DELETE FROM promociones WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

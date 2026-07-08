//backend/routes/reportes.js

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Argentina is UTC-3 with no DST
function argDate() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).slice(0, 10);
}
function argDateDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    .slice(0, 10);
}

// KPIs (ya lo tenías, lo dejo por si falta)
router.get('/kpis', requireAuth, requireRole('admin','vendedor'), (req, res) => {
  const sql = `
WITH
hoy AS (
  SELECT ROUND(IFNULL(SUM(total),0), 2) total, COUNT(*) tickets
  FROM ventas
  WHERE DATE(fecha)=DATE(datetime('now', '-3 hours'))
),
sem AS (
  SELECT ROUND(IFNULL(SUM(total),0), 2) total, COUNT(*) tickets
  FROM ventas
  WHERE DATE(fecha)>=DATE(datetime('now', '-3 hours'),'-6 days')
),
mes AS (
  SELECT ROUND(IFNULL(SUM(total),0), 2) total, COUNT(*) tickets
  FROM ventas
  WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m',datetime('now', '-3 hours'))
)

SELECT
(SELECT total FROM hoy) total_hoy,
(SELECT tickets FROM hoy) tickets_hoy,

(SELECT total FROM sem) total_semana,
(SELECT tickets FROM sem) tickets_semana,

(SELECT total FROM mes) total_mes,
(SELECT tickets FROM mes) tickets_mes,

(SELECT COUNT(*) FROM productos) total_productos,
(SELECT COUNT(*) FROM clientes) total_clientes,
(SELECT COUNT(*) FROM productos WHERE stock <= 5) stock_bajo
`;
  db.get(sql, [], (err, row) => err ? res.status(500).json({error:'DB_ERROR', details:err.message}) : res.json(row));
});

// Serie ventas diarias (por si la usás)
router.get('/ventas-diarias', requireAuth, requireRole('admin','vendedor'), (req, res) => {
  const dias = Math.min(Math.max(parseInt(req.query.dias || '14', 10), 1), 90);
  const sql = `
    SELECT DATE(fecha) dia, IFNULL(SUM(total),0) total, COUNT(*) tickets
    FROM ventas
    WHERE DATE(fecha) >= DATE(datetime('now', '-3 hours'),'-${dias-1} days')
    GROUP BY DATE(fecha) ORDER BY dia ASC;
  `;
  db.all(sql, [], (err, rows) => err ? res.status(500).json({error:'DB_ERROR', details:err.message}) : res.json(rows));
});

// Top productos (por si la usás)
router.get('/top-productos', requireAuth, requireRole('admin','vendedor'), (req, res) => {
  const dias = Math.min(Math.max(parseInt(req.query.dias || '30', 10), 1), 365);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 20);
  const sql = `
    SELECT p.id, p.nombre, p.sku,
           SUM(vi.cantidad) cant_vendida,
           SUM(vi.cantidad*vi.precio_unitario) ingreso
    FROM venta_items vi
    JOIN ventas v ON v.id=vi.venta_id
    JOIN productos p ON p.id=vi.producto_id
    WHERE DATE(v.fecha) >= DATE(datetime('now', '-3 hours'),'-${dias-1} days')
    GROUP BY p.id,p.nombre,p.sku
    ORDER BY cant_vendida DESC
    LIMIT ?;
  `;
  db.all(sql, [limit], (err, rows) => err ? res.status(500).json({error:'DB_ERROR', details:err.message}) : res.json(rows));
});

// 🔹 Cierre de caja (DÍA)
router.get('/cierre-caja', requireAuth, requireRole('admin','vendedor'), (req, res) => {
  const fecha = req.query.fecha || argDate();
  const sql = `
    SELECT
      medio_pago,
      COUNT(*)                          AS cantidad,
      IFNULL(SUM(subtotal),0)           AS subtotal,
      IFNULL(SUM(CASE WHEN descuento_tipo='porcentaje' THEN subtotal*descuento_valor/100 ELSE descuento_valor END),0) AS descuentos,
      IFNULL(SUM(total),0)              AS total
    FROM ventas
    WHERE DATE(fecha) = DATE(?)
    GROUP BY medio_pago
  `;
  db.all(sql, [fecha], (err, rows) => {
    if (err) return res.status(500).json({error:'DB_ERROR', details:err.message});
    const totalVentas  = rows.reduce((a,r)=>a+r.total,0);
    const totalTickets = rows.reduce((a,r)=>a+r.cantidad,0);
    const totalDesc    = rows.reduce((a,r)=>a+r.descuentos,0);
    res.json({ fecha, totalVentas, totalTickets, totalDesc, medios: rows });
  });
});


router.get(
  "/ultimas-ventas",
  requireAuth,
  requireRole("admin", "vendedor"),
  (req, res) => {
    const sql = `
      SELECT
        v.id,
        v.fecha,
        v.total,
        COALESCE(c.nombre, 'Consumidor Final') AS cliente
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ORDER BY v.fecha DESC
      LIMIT 10
    `;

    db.all(sql, [], (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: "DB_ERROR",
          details: err.message
        });
      }

      res.json(rows);
    });
  }
);

// Ganancias por período
router.get('/ganancias', requireAuth, requireRole('admin'), (req, res) => {
  const { date_from, date_to } = req.query;

  const desde = date_from || argDateDaysAgo(30);
  const hasta = date_to || argDate();

  const sql = `
    SELECT
      DATE(v.fecha)                                      AS dia,
      COUNT(DISTINCT v.id)                               AS tickets,
      ROUND(SUM(vi.precio_unitario * vi.cantidad), 2)    AS ingresos,
      ROUND(SUM(vi.costo_unitario  * vi.cantidad), 2)    AS costos,
      ROUND(SUM((vi.precio_unitario - vi.costo_unitario) * vi.cantidad), 2) AS ganancia_bruta,
      ROUND(SUM(v.descuento_valor), 2)                   AS descuentos,
      ROUND(SUM(v.total), 2)                             AS total_neto
    FROM ventas v
    JOIN venta_items vi ON vi.venta_id = v.id
    WHERE DATE(v.fecha) BETWEEN DATE(?) AND DATE(?)
    GROUP BY DATE(v.fecha)
    ORDER BY dia ASC
  `;

  db.all(sql, [desde, hasta], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB_ERROR', details: err.message });

    const resumen = {
      desde,
      hasta,
      total_ingresos:     rows.reduce((a, r) => a + r.ingresos, 0),
      total_costos:       rows.reduce((a, r) => a + r.costos, 0),
      total_ganancia:     rows.reduce((a, r) => a + r.ganancia_bruta, 0),
      total_descuentos:   rows.reduce((a, r) => a + r.descuentos, 0),
      total_neto:         rows.reduce((a, r) => a + r.total_neto, 0),
      margen_promedio:    0,
      detalle:            rows
    };

    if (resumen.total_ingresos > 0) {
      resumen.margen_promedio = Math.round(
        (resumen.total_ganancia / resumen.total_ingresos) * 100
      );
    }

    res.json(resumen);
  });
});
export default router;

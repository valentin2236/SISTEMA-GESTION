import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import logger from '../utils/logger.js';

const router = Router();

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function toCSV(rows, columns) {
  if (!rows.length) return '';
  const header = columns.join(',');
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  ).join('\n');
  return `${header}\n${body}`;
}

function sendCSV(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);
}

// GET /api/exportar/ventas?date_from=&date_to=
router.get('/ventas', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const where = [];
    const params = [];

    if (date_from) { where.push(`date(v.fecha) >= date(?)`); params.push(date_from); }
    if (date_to) { where.push(`date(v.fecha) <= date(?)`); params.push(date_to); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await all(`
      SELECT
        v.id, v.fecha, v.usuario, v.subtotal, v.descuento_tipo,
        v.descuento_valor, v.recargo_porcentaje, v.recargo_monto,
        v.total, v.medio_pago, v.pagado, v.cambio, v.nota,
        c.nombre AS cliente
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ${whereSQL}
      ORDER BY datetime(v.fecha) DESC
    `, params);

    const columns = ['id', 'fecha', 'usuario', 'cliente', 'subtotal', 'descuento_tipo',
      'descuento_valor', 'recargo_porcentaje', 'recargo_monto', 'total',
      'medio_pago', 'pagado', 'cambio', 'nota'];

    const csv = toCSV(rows, columns);
    registrarAuditoria(req.user.email, 'EXPORTAR_VENTAS', `${rows.length} registros`);
    sendCSV(res, `ventas-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    logger.error('Error exportando ventas', { error: e.message });
    res.status(500).json({ error: 'EXPORT_ERROR' });
  }
});

// GET /api/exportar/productos
router.get('/productos', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, nombre, descripcion, categoria, sku, precio, costo, stock, activo,
             creado_en, actualizado_en
      FROM productos
      ORDER BY nombre ASC
    `);

    const columns = ['id', 'nombre', 'descripcion', 'categoria', 'sku', 'precio',
      'costo', 'stock', 'activo', 'creado_en', 'actualizado_en'];

    const csv = toCSV(rows, columns);
    registrarAuditoria(req.user.email, 'EXPORTAR_PRODUCTOS', `${rows.length} registros`);
    sendCSV(res, `productos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    logger.error('Error exportando productos', { error: e.message });
    res.status(500).json({ error: 'EXPORT_ERROR' });
  }
});

// GET /api/exportar/clientes
router.get('/clientes', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, nombre, email, telefono, dni, direccion, creado_en
      FROM clientes
      ORDER BY nombre ASC
    `);

    const columns = ['id', 'nombre', 'email', 'telefono', 'dni', 'direccion', 'creado_en'];

    const csv = toCSV(rows, columns);
    registrarAuditoria(req.user.email, 'EXPORTAR_CLIENTES', `${rows.length} registros`);
    sendCSV(res, `clientes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    logger.error('Error exportando clientes', { error: e.message });
    res.status(500).json({ error: 'EXPORT_ERROR' });
  }
});

// GET /api/exportar/inventario
router.get('/inventario', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rows = await all(`
      SELECT ms.id, ms.fecha, ms.tipo, ms.cantidad, ms.stock_anterior,
             ms.stock_nuevo, ms.usuario, ms.motivo, p.nombre AS producto, p.sku
      FROM movimientos_stock ms
      LEFT JOIN productos p ON p.id = ms.producto_id
      ORDER BY datetime(ms.fecha) DESC
      LIMIT 5000
    `);

    const columns = ['id', 'fecha', 'producto', 'sku', 'tipo', 'cantidad',
      'stock_anterior', 'stock_nuevo', 'usuario', 'motivo'];

    const csv = toCSV(rows, columns);
    registrarAuditoria(req.user.email, 'EXPORTAR_INVENTARIO', `${rows.length} registros`);
    sendCSV(res, `inventario-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    logger.error('Error exportando inventario', { error: e.message });
    res.status(500).json({ error: 'EXPORT_ERROR' });
  }
});

// GET /api/exportar/caja?sesion_id=
router.get('/caja', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, usuario_apertura, fecha_apertura, monto_inicial,
             usuario_cierre, fecha_cierre, conteo_efectivo,
             total_ventas_efectivo, total_mov_ingresos, total_mov_egresos,
             efectivo_esperado, diferencia
      FROM caja_sesiones
      ORDER BY id DESC
      LIMIT 1000
    `);

    const columns = ['id', 'usuario_apertura', 'fecha_apertura', 'monto_inicial',
      'usuario_cierre', 'fecha_cierre', 'conteo_efectivo', 'total_ventas_efectivo',
      'total_mov_ingresos', 'total_mov_egresos', 'efectivo_esperado', 'diferencia'];

    const csv = toCSV(rows, columns);
    registrarAuditoria(req.user.email, 'EXPORTAR_CAJA', `${rows.length} registros`);
    sendCSV(res, `caja-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    logger.error('Error exportando caja', { error: e.message });
    res.status(500).json({ error: 'EXPORT_ERROR' });
  }
});

export default router;

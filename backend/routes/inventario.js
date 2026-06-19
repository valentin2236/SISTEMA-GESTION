import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}


// ======================================
// GET MOVIMIENTOS STOCK
// ======================================

router.get(
  '/',
  requireAuth,
  requireRole('admin', 'vendedor'),
  async (req, res) => {

    try {

      const rows = await all(`

        SELECT

          ms.id,
          ms.tipo,
          ms.cantidad,
          ms.stock_anterior,
          ms.stock_nuevo,
          ms.usuario,
          ms.motivo,
          ms.fecha,

          p.nombre,
          p.sku

        FROM movimientos_stock ms

        JOIN productos p
        ON p.id = ms.producto_id

        ORDER BY datetime(ms.fecha) DESC

        LIMIT 200

      `);

      res.json(rows);

    } catch (e) {

      res.status(500).json({
        error: 'DB_ERROR',
        details: e.message
      });

    }

  }
);

export default router;
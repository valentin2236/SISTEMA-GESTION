import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import logger from "../utils/logger.js";

const router = Router();

// =========================
// HELPERS
// =========================

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      err ? reject(err) : resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

// =========================
// LISTAR COMPRAS
// GET /api/compras
// =========================

router.get(
  "/",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const rows = await all(`
        SELECT
          c.*,
          p.nombre AS proveedor_nombre
        FROM compras c
        LEFT JOIN proveedores p
          ON p.id = c.proveedor_id
        ORDER BY c.id DESC
      `);

      res.json(rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "ERROR_LISTAR_COMPRAS",
      });
    }
  }
);

// =========================
// CREAR COMPRA
// POST /api/compras
// =========================

router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const {
        proveedor_id,
        productos = [],
        nota = "",
      } = req.body;

      if (!productos.length) {
        return res.status(400).json({
          error: "SIN_PRODUCTOS",
        });
      }

      let total = 0;

      // validar productos
      for (const item of productos) {
        const productoId = Number(
          item.producto_id || item.id || 0
        );

        if (!productoId) {
          return res.status(400).json({
            error: "PRODUCTO_ID_INVALIDO",
          });
        }

        total +=
          Number(item.cantidad || 0) *
          Number(item.costo_unitario || 0);
      }

      const fecha = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const usuario = req.user?.email || "admin";

      // =========================
      // CREAR COMPRA
      // =========================

      const result = await run(
        `
        INSERT INTO compras (
          proveedor_id,
          total,
          fecha,
          usuario,
          nota
        )
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          proveedor_id || null,
          total,
          fecha,
          usuario,
          nota,
        ]
      );

      const compraId = result.lastID;

      // =========================
      // ITEMS + STOCK
      // =========================

      for (const item of productos) {
        const productoId = Number(
          item.producto_id || item.id
        );

        const cantidad = Number(item.cantidad || 0);

        const costoUnitario = Number(
          item.costo_unitario || item.costo || 0
        );

        await run(
          `
          INSERT INTO compra_items (
            compra_id,
            producto_id,
            cantidad,
            costo_unitario
          )
          VALUES (?, ?, ?, ?)
        `,
          [
            compraId,
            productoId,
            cantidad,
            costoUnitario,
          ]
        );

        const producto = await get(
          `
          SELECT stock
          FROM productos
          WHERE id = ?
        `,
          [productoId]
        );

        const stockAnterior = Number(producto?.stock || 0);

        const stockNuevo =
          stockAnterior + cantidad;

        // actualizar stock

        await run(
          `
          UPDATE productos
          SET stock = ?
          WHERE id = ?
        `,
          [stockNuevo, productoId]
        );

        // movimiento stock

        await run(
          `
          INSERT INTO movimientos_stock (
            producto_id,
            tipo,
            cantidad,
            stock_anterior,
            stock_nuevo,
            usuario,
            motivo
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [
            productoId,
            "compra",
            cantidad,
            stockAnterior,
            stockNuevo,
            usuario,
            `Compra #${compraId}`,
          ]
        );
      }

      registrarAuditoria(usuario, 'CREAR_COMPRA', `Compra #${compraId} - Total $${total}`);
      logger.info('Compra creada', { compraId, total, user: usuario });

      res.status(201).json({
        success: true,
        compra_id: compraId,
      });
    } catch (error) {
      logger.error('Error creando compra', { error: error.message });
      res.status(500).json({
        error: "ERROR_CREAR_COMPRA",
        details: error.message,
      });
    }
  }
);

// GET /api/compras/:id — detalle de una compra con sus ítems
router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const compra = await get(
        `SELECT c.*, p.nombre AS proveedor_nombre
         FROM compras c
         LEFT JOIN proveedores p ON p.id = c.proveedor_id
         WHERE c.id = ?`,
        [id]
      );

      if (!compra) return res.status(404).json({ error: "NOT_FOUND" });

      const items = await all(
        `SELECT
           ci.cantidad,
           ci.costo_unitario,
           (ci.cantidad * ci.costo_unitario) AS subtotal,
           p.nombre,
           p.sku
         FROM compra_items ci
         LEFT JOIN productos p ON p.id = ci.producto_id
         WHERE ci.compra_id = ?`,
        [id]
      );

      res.json({ ...compra, items });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  }
);

export default router;
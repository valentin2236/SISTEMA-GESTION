import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { validateProveedor } from "../utils/validate.js";
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
// LISTAR PROVEEDORES
// GET /api/proveedores
// =========================

router.get(
  "/",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const search = String(req.query.search || "").trim();

      let rows;

      if (search) {
        rows = await all(
          `
          SELECT *
          FROM proveedores
          WHERE nombre LIKE ?
             OR telefono LIKE ?
             OR email LIKE ?
          ORDER BY id DESC
        `,
          [`%${search}%`, `%${search}%`, `%${search}%`]
        );
      } else {
        rows = await all(`
          SELECT *
          FROM proveedores
          ORDER BY id DESC
        `);
      }

      res.json(rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "ERROR_LISTAR_PROVEEDORES",
      });
    }
  }
);

// =========================
// OBTENER PROVEEDOR
// GET /api/proveedores/:id
// =========================

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const proveedor = await get(
        `
        SELECT *
        FROM proveedores
        WHERE id = ?
      `,
        [req.params.id]
      );

      if (!proveedor) {
        return res.status(404).json({
          error: "PROVEEDOR_NO_ENCONTRADO",
        });
      }

      res.json(proveedor);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "ERROR_OBTENER_PROVEEDOR",
      });
    }
  }
);

// =========================
// CREAR PROVEEDOR
// POST /api/proveedores
// =========================

router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const {
        nombre,
        telefono = "",
        email = "",
        direccion = "",
      } = req.body;

      if (!nombre?.trim()) {
        return res.status(400).json({
          error: "NOMBRE_REQUERIDO",
        });
      }

      const result = await run(
        `
        INSERT INTO proveedores (
          nombre,
          telefono,
          email,
          direccion
        )
        VALUES (?, ?, ?, ?)
      `,
        [
          nombre.trim(),
          telefono.trim(),
          email.trim(),
          direccion.trim(),
        ]
      );

      const nuevoProveedor = await get(
        `
        SELECT *
        FROM proveedores
        WHERE id = ?
      `,
        [result.lastID]
      );

      registrarAuditoria(req.user.email, 'CREAR_PROVEEDOR', `${nombre.trim()} (ID: ${result.lastID})`);

      res.status(201).json(nuevoProveedor);
    } catch (error) {
      logger.error('Error creando proveedor', { error: error.message });
      res.status(500).json({
        error: "ERROR_CREAR_PROVEEDOR",
      });
    }
  }
);

// =========================
// EDITAR PROVEEDOR
// PUT /api/proveedores/:id
// =========================

router.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const {
        nombre,
        telefono = "",
        email = "",
        direccion = "",
      } = req.body;

      if (!nombre?.trim()) {
        return res.status(400).json({
          error: "NOMBRE_REQUERIDO",
        });
      }

      const proveedor = await get(
        `
        SELECT *
        FROM proveedores
        WHERE id = ?
      `,
        [req.params.id]
      );

      if (!proveedor) {
        return res.status(404).json({
          error: "PROVEEDOR_NO_ENCONTRADO",
        });
      }

      await run(
        `
        UPDATE proveedores
        SET
          nombre = ?,
          telefono = ?,
          email = ?,
          direccion = ?
        WHERE id = ?
      `,
        [
          nombre.trim(),
          telefono.trim(),
          email.trim(),
          direccion.trim(),
          req.params.id,
        ]
      );

      const actualizado = await get(
        `
        SELECT *
        FROM proveedores
        WHERE id = ?
      `,
        [req.params.id]
      );

      registrarAuditoria(req.user.email, 'EDITAR_PROVEEDOR', `${nombre.trim()} (ID: ${req.params.id})`);

      res.json(actualizado);
    } catch (error) {
      logger.error('Error editando proveedor', { error: error.message });
      res.status(500).json({
        error: "ERROR_EDITAR_PROVEEDOR",
      });
    }
  }
);

// =========================
// ELIMINAR PROVEEDOR
// DELETE /api/proveedores/:id
// =========================

router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const proveedor = await get(
        `
        SELECT *
        FROM proveedores
        WHERE id = ?
      `,
        [req.params.id]
      );

      if (!proveedor) {
        return res.status(404).json({
          error: "PROVEEDOR_NO_ENCONTRADO",
        });
      }

      await run(
        `
        DELETE FROM proveedores
        WHERE id = ?
      `,
        [req.params.id]
      );

      registrarAuditoria(req.user.email, 'ELIMINAR_PROVEEDOR', `${proveedor.nombre} (ID: ${req.params.id})`);

      res.json({
        success: true,
      });
    } catch (error) {
      logger.error('Error eliminando proveedor', { error: error.message });
      res.status(500).json({
        error: "ERROR_ELIMINAR_PROVEEDOR",
      });
    }
  }
);

export default router;
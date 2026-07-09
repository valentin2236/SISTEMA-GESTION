//backend/routes/caja.js

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const router = Router();

// =====================================
// HELPERS
// =====================================

function nowSql() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
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
// SESIÓN ABIERTA
// =====================================

async function getSesionAbierta() {
  return await getOne(`
    SELECT *
    FROM caja_sesiones
    WHERE fecha_cierre IS NULL
    ORDER BY id DESC
    LIMIT 1
  `);
}

// =====================================
// ABRIR CAJA
// POST /api/caja/abrir
// =====================================

router.post(
  "/abrir",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const abierta = await getSesionAbierta();

      if (abierta) {
        return res.status(400).json({
          error: "YA_ABIERTA",
          sesion_id: abierta.id,
        });
      }

      const user = req.user?.nombre || "admin";

      const { monto_inicial = 0 } = req.body;

      const fecha = nowSql();

      const result = await run(
        `
        INSERT INTO caja_sesiones (
          usuario_apertura,
          fecha_apertura,
          monto_inicial
        )
        VALUES (?, ?, ?)
      `,
        [user, fecha, Math.max(0, Number(monto_inicial || 0))],
      );

      registrarAuditoria(
        user,
        "APERTURA_CAJA",
        `Sesión #${result.lastID} - Monto inicial $${monto_inicial}`,
      );

      res.status(201).json({
        ok: true,
        sesion_id: result.lastID,
        fecha,
        usuario: user,
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// =====================================
// ESTADO DE CAJA
// GET /api/caja/estado
// =====================================

router.get(
  "/estado",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const s = await getSesionAbierta();

      if (!s) {
        return res.json({
          abierta: false,
        });
      }

      // ventas agrupadas por método de pago

      const ventasPorMetodo = await all(
        `
        SELECT
          IFNULL(medio_pago, 'efectivo') AS medio_pago,
          IFNULL(SUM(total), 0)          AS total,
          COUNT(*)                        AS tickets
        FROM ventas
        WHERE datetime(fecha) >= datetime(?)
        GROUP BY IFNULL(medio_pago, 'efectivo')
      `,
        [s.fecha_apertura],
      );

      const getMet = (m) =>
        ventasPorMetodo.find((v) => v.medio_pago === m) || { total: 0, tickets: 0 };

      const ventas              = getMet("efectivo");
      const ventasTarjeta       = getMet("tarjeta");
      const ventasTransferencia = getMet("transferencia");
      const ventasCuenta        = getMet("cuenta_corriente");

      // ganancia de la sesión
      const gananciaRow = await get(
        `SELECT ROUND(IFNULL(SUM((vi.precio_unitario - vi.costo_unitario) * vi.cantidad), 0), 2) AS ganancia,
                ROUND(IFNULL(SUM(vi.precio_unitario * vi.cantidad), 0), 2) AS ingresos
         FROM ventas v
         JOIN venta_items vi ON vi.venta_id = v.id
         WHERE datetime(v.fecha) >= datetime(?)`,
        [s.fecha_apertura],
      );

      // movimientos

      const movs = await all(
        `
        SELECT
          id,
          fecha,
          tipo,
          concepto,
          monto
        FROM caja_movimientos
        WHERE sesion_id = ?
        ORDER BY id DESC
      `,
        [s.id],
      );

      const totalIng = movs
        .filter((m) => m.tipo === "ingreso")
        .reduce((a, m) => a + Number(m.monto), 0);

      const totalEgr = movs
        .filter((m) => m.tipo === "egreso")
        .reduce((a, m) => a + Number(m.monto), 0);

      const efectivoEsperado =
        Number(s.monto_inicial || 0) +
        totalIng -
        totalEgr +
        Number(ventas?.total || 0);

      res.json({
        abierta: true,

        sesion: {
          id: s.id,
          fecha_apertura: s.fecha_apertura,
          usuario_apertura: s.usuario_apertura,
          monto_inicial: s.monto_inicial,
        },

        ventas_efectivo:      ventas,
        ventas_tarjeta:       ventasTarjeta,
        ventas_transferencia: ventasTransferencia,
        ventas_cuenta:        ventasCuenta,

        movimientos: movs,

        total_ingresos: totalIng,
        total_egresos:  totalEgr,

        efectivo_esperado: efectivoEsperado,

        ganancia_sesion: Number(gananciaRow?.ganancia || 0),
        ingresos_sesion: Number(gananciaRow?.ingresos || 0),
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// =====================================
// MOVIMIENTO DE CAJA
// POST /api/caja/movimiento
// =====================================

router.post(
  "/movimiento",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const s = await getSesionAbierta();

      if (!s) {
        return res.status(400).json({
          error: "SIN_SESION",
        });
      }

      const { tipo, concepto = "", monto } = req.body;

      const t = String(tipo || "").toLowerCase();

      if (!["ingreso", "egreso"].includes(t)) {
        return res.status(400).json({
          error: "TIPO_INVALIDO",
        });
      }

      const value = Number(monto);

      if (!(value >= 0)) {
        return res.status(400).json({
          error: "MONTO_INVALIDO",
        });
      }

      await run(
        `
        INSERT INTO caja_movimientos (
          sesion_id,
          tipo,
          concepto,
          monto
        )
        VALUES (?, ?, ?, ?)
      `,
        [s.id, t, concepto, value],
      );

      registrarAuditoria(
        req.user?.nombre || "admin",
        t === "ingreso" ? "INGRESO_CAJA" : "EGRESO_CAJA",
        `${concepto} - $${value}`,
      );

      res.status(201).json({
        ok: true,
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// =====================================
// CERRAR CAJA
// POST /api/caja/cerrar
// =====================================

router.post(
  "/cerrar",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const s = await getSesionAbierta();

      if (!s) {
        return res.status(400).json({
          error: "SIN_SESION",
        });
      }

      const user = req.user?.nombre || "admin";

      const { conteo_efectivo = null, observacion = "" } = req.body;

      // ventas efectivo

      const ventas = await getOne(
        `
        SELECT
          IFNULL(SUM(total),0) AS total
        FROM ventas
        WHERE medio_pago = 'efectivo'
          AND datetime(fecha) >= datetime(?)
      `,
        [s.fecha_apertura],
      );

      // movimientos

      const movs = await all(
        `
        SELECT
          tipo,
          monto
        FROM caja_movimientos
        WHERE sesion_id = ?
      `,
        [s.id],
      );

      const totalIng = movs
        .filter((m) => m.tipo === "ingreso")
        .reduce((a, m) => a + Number(m.monto), 0);

      const totalEgr = movs
        .filter((m) => m.tipo === "egreso")
        .reduce((a, m) => a + Number(m.monto), 0);

      const esperado =
        Number(s.monto_inicial || 0) +
        totalIng -
        totalEgr +
        Number(ventas?.total || 0);

      const conteo = conteo_efectivo == null ? null : Number(conteo_efectivo);

      const diff = conteo == null ? null : conteo - esperado;

      await run(
        `
        UPDATE caja_sesiones
        SET
          usuario_cierre = ?,
          fecha_cierre = ?,
          conteo_efectivo = ?,
          total_ventas_efectivo = ?,
          total_mov_ingresos = ?,
          total_mov_egresos = ?,
          efectivo_esperado = ?,
          diferencia = ?
        WHERE id = ?
      `,
        [
          user,
          nowSql(),
          conteo,
          ventas?.total || 0,
          totalIng,
          totalEgr,
          esperado,
          diff,
          s.id,
        ],
      );

      // observación opcional

      if (observacion && observacion.trim()) {
        await run(
          `
          INSERT INTO caja_movimientos (
            sesion_id,
            tipo,
            concepto,
            monto
          )
          VALUES (?, 'ingreso', ?, 0)
        `,
          [s.id, `OBS CIERRE: ${observacion.trim()}`],
        );
      }

      registrarAuditoria(
        user,
        "CIERRE_CAJA",
        `Sesión #${s.id} - Esperado $${esperado} - Diferencia $${diff ?? 0}`,
      );

      res.json({
        ok: true,

        cierre: {
          sesion_id: s.id,
          efectivo_esperado: esperado,
          conteo_efectivo: conteo,
          diferencia: diff,
          ventas_efectivo: ventas?.total || 0,
          ingresos: totalIng,
          egresos: totalEgr,
        },
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// =====================================
// DETALLE CIERRE
// GET /api/caja/cierre/:id
// =====================================

router.get(
  "/cierre/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const s = await getOne(
        `
        SELECT *
        FROM caja_sesiones
        WHERE id = ?
      `,
        [id],
      );

      if (!s) {
        return res.status(404).json({
          error: "NOT_FOUND",
        });
      }

      const movimientos = await all(
        `
        SELECT
          id,
          fecha,
          tipo,
          concepto,
          monto
        FROM caja_movimientos
        WHERE sesion_id = ?
        ORDER BY id ASC
      `,
        [id],
      );

      res.json({
        sesion: s,
        movimientos,
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// =====================================
// HISTORIAL DE CAJAS
// GET /api/caja/historial
// =====================================

router.get(
  "/historial",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const rows = await all(`
        SELECT
          id,
          usuario_apertura,
          usuario_cierre,
          fecha_apertura,
          fecha_cierre,
          monto_inicial,
          total_ventas_efectivo,
          efectivo_esperado,
          conteo_efectivo,
          diferencia
        FROM caja_sesiones
        ORDER BY id DESC
      `);

      res.json(rows);
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "ERROR_HISTORIAL_CAJA",
      });
    }
  },
);

export default router;

import { Router } from "express";
import { db } from "../db.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { autoRefreshNotificaciones } from "./notificaciones.js";

const router = Router();

// utils
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ================== Listar ventas ==================

router.get(
  "/",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const { date_from, date_to, medio } = req.query;

      const limit = Math.min(
        Math.max(parseInt(req.query.limit ?? "50", 10), 1),
        200,
      );

      const offset = Math.max(parseInt(req.query.offset ?? "0", 10), 0);

      const where = [];
      const params = [];

      if (date_from) {
        where.push(`date(fecha) >= date(?)`);
        params.push(date_from);
      }

      if (date_to) {
        where.push(`date(fecha) <= date(?)`);
        params.push(date_to);
      }

      if (
        medio &&
        ["efectivo", "tarjeta", "transferencia"].includes(
          String(medio).toLowerCase(),
        )
      ) {
        where.push(`LOWER(medio_pago) = ?`);
        params.push(String(medio).toLowerCase());
      }

      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const rows = await all(
        `
        SELECT
          id,
          fecha,
          usuario,
          cliente_id,
          IFNULL(subtotal,0) AS subtotal,
          IFNULL(descuento_tipo,'monto') AS descuento_tipo,
          IFNULL(descuento_valor,0) AS descuento_valor,
          IFNULL(recargo_porcentaje,0) AS recargo_porcentaje,
          IFNULL(recargo_monto,0) AS recargo_monto,
          IFNULL(total,0) AS total,
          IFNULL(medio_pago,'efectivo') AS medio_pago,
          IFNULL(pagado,0) AS pagado,
          IFNULL(cambio,0) AS cambio
        FROM ventas
        ${whereSQL}
        ORDER BY datetime(fecha) DESC
        LIMIT ? OFFSET ?
        `,
        [...params, limit, offset],
      );

      res.json(rows);
    } catch (e) {
      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// ================== Helpers ==================

function calcTotals(
  carrito = [],
  descuento = { tipo: "monto", valor: 0 },
  pago = {
    medio: "efectivo",
    monto: null,
    interes_porcentaje: 0,
  },
) {
  const subtotal = carrito.reduce(
    (sum, p) => sum + (Number(p.precio) || 0) * (Number(p.cantidad) || 0),
    0,
  );

  const tipoDesc = descuento?.tipo === "porcentaje" ? "porcentaje" : "monto";

  const valDesc = Math.max(0, Number(descuento?.valor || 0));

  const descMonto =
    tipoDesc === "porcentaje" ? (subtotal * valDesc) / 100 : valDesc;

  const base = Math.max(0, subtotal - Math.min(descMonto, subtotal));

  const medio = [
    "efectivo",
    "tarjeta",
    "transferencia",
    "cuenta_corriente",
  ].includes(String(pago?.medio || "").toLowerCase())
    ? String(pago.medio).toLowerCase()
    : "efectivo";

  const interesPct = Math.max(0, Number(pago?.interes_porcentaje || 0));

  const recargoMonto =
    medio === "tarjeta" && interesPct > 0 ? (base * interesPct) / 100 : 0;

  const total = Math.max(0, base + recargoMonto);

  const montoPago =
    pago?.monto == null ? total : Math.max(0, Number(pago.monto));

  const cambio = medio === "efectivo" ? Math.max(0, Math.round((montoPago - total) * 100) / 100) : 0;

  const pagado = montoPago;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    descuento_tipo: tipoDesc,
    descuento_valor: valDesc,
    recargo_porcentaje: interesPct,
    recargo_monto: Math.round(recargoMonto * 100) / 100,
    total: Math.round(total * 100) / 100,
    medio_pago: medio,
    pagado,
    cambio,
  };
}

// ================== Crear venta ==================

router.post(
  "/",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const {
        carrito = [],
        descuento = {},
        pago = {},
        usuario = null,
        nota = "",
        cliente_id = null,
      } = req.body;

      if (!Array.isArray(carrito) || carrito.length === 0) {
        return res.status(400).json({
          error: "CARRITO_VACIO",
        });
      }

      // Separar ítems libres (id negativo) de productos reales
      const carritoReal = carrito.filter((i) => Number(i.id) > 0);
      const carritoLibre = carrito.filter((i) => Number(i.id) <= 0);

      // Validar stock solo para productos reales
      for (const it of carritoReal) {
        // ... el loop existente de validación de stock
      }

      // Insertar ítems libres sin tocar stock ni productos
      // (se guardan como venta_items con producto_id = NULL)

      // ===============================
      // VALIDAR STOCK
      // ===============================

      for (const it of carritoReal) {
        const producto = await get(
          `SELECT id, nombre, stock
     FROM productos
     WHERE id = ?`,
          [it.id],
        );

        if (!producto) {
          return res.status(400).json({
            error: "PRODUCTO_NO_EXISTE",
          });
        }

        if (Number(producto.stock) < Number(it.cantidad)) {
          return res.status(400).json({
            error: "SIN_STOCK",
            producto: producto.nombre,
            disponible: producto.stock,
          });
        }
      }

      const totals = calcTotals(carrito, descuento, pago);

      // ===============================
      // VALIDAR PAGO
      // ===============================

      if (totals.medio_pago === "efectivo") {
        const montoEntregado = Number(pago?.monto || 0);

        if (montoEntregado <= 0) {
          return res.status(400).json({
            error: "MONTO_REQUERIDO",
          });
        }

        if (montoEntregado < totals.total) {
          return res.status(400).json({
            error: "MONTO_INSUFICIENTE",
            total: totals.total,
          });
        }
      }

      const {
        subtotal,
        descuento_tipo,
        descuento_valor,
        recargo_porcentaje,
        recargo_monto,
        total,
        medio_pago,
        pagado,
        cambio,
      } = totals;

      const ahora = new Date();

      const fecha = ahora.toLocaleString("sv-SE", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const user = usuario || req.user?.email || "cajero";

      const r = await run(
        `
        INSERT INTO ventas (
          total,
          fecha,
          usuario,
          subtotal,
          descuento_tipo,
          descuento_valor,
          recargo_porcentaje,
          recargo_monto,
          medio_pago,
          pagado,
          cambio,
          nota,
          cliente_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          total,
          fecha,
          user,
          subtotal,
          descuento_tipo,
          descuento_valor,
          recargo_porcentaje,
          recargo_monto,
          medio_pago,
          pagado,
          cambio,
          nota,
          cliente_id,
        ],
      );

      const ventaId = r.lastID;

      registrarAuditoria(user, "VENTA", `Venta #${ventaId} - Total $${total}`);

      // ===============================
      // PRODUCTOS REALES
      // ===============================

      for (const it of carritoReal) {
        const prod = await get(`SELECT costo FROM productos WHERE id = ?`, [
          it.id,
        ]);

        await run(
          `INSERT INTO venta_items (
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      costo_unitario,
      descripcion_libre
    )
    VALUES (?, ?, ?, ?, ?, NULL)`,
          [ventaId, it.id, it.cantidad, it.precio, prod?.costo ?? 0],
        );

        const productoActual = await get(
          `
    SELECT stock, nombre
    FROM productos
    WHERE id = ?
    `,
          [it.id],
        );

        const stockAnterior = Number(productoActual?.stock || 0);

        const stockNuevo = Math.max(0, stockAnterior - Number(it.cantidad));

        await run(
          `
    UPDATE productos
    SET stock = ?
    WHERE id = ?
    `,
          [stockNuevo, it.id],
        );

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
            it.id,
            "venta",
            -Math.abs(Number(it.cantidad)),
            stockAnterior,
            stockNuevo,
            user,
            `Venta #${ventaId}`,
          ],
        );
      }

      // ===============================
      // ITEMS LIBRES
      // ===============================

      for (const it of carritoLibre) {
        await run(
          `INSERT INTO venta_items (
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      costo_unitario,
      descripcion_libre
    )
    VALUES (?, NULL, ?, ?, 0, ?)`,
          [ventaId, it.cantidad, it.precio, it.nombre],
        );
      }

      // ── Si el medio de pago es cuenta corriente, registrar la deuda ──
      if (medio_pago === "cuenta_corriente" && cliente_id) {
        await run(
          `INSERT INTO cuentas_corrientes (
       cliente_id, tipo, monto, descripcion, usuario, fecha
     ) VALUES (?, ?, ?, ?, ?, ?)`,
          [cliente_id, "deuda", total, `Venta #${ventaId}`, user, fecha],
        );
      }

      res.status(201).json({
        id: ventaId,
        ...totals,
        fecha,
      });

      // Actualizar notificaciones de stock en background (no bloquea la respuesta)
      autoRefreshNotificaciones().catch(() => {});
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// ================== Obtener venta ==================

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const includeItems = String(req.query.includeItems || "0") === "1";

      const venta = await get(
        `
        SELECT
          id,
          fecha,
          usuario,
          subtotal,
          descuento_tipo,
          descuento_valor,
          recargo_porcentaje,
          recargo_monto,
          total,
          medio_pago,
          pagado,
          cambio,
          nota,
          cliente_id
        FROM ventas
        WHERE id = ?
        `,
        [id],
      );

      if (!venta) {
        return res.status(404).json({
          error: "NOT_FOUND",
        });
      }

      if (!includeItems) {
        return res.json(venta);
      }

      const items = await all(
        `SELECT vi.cantidad,
          vi.precio_unitario,
          COALESCE(p.nombre, vi.descripcion_libre, 'Ítem libre') AS nombre,
          p.sku
   FROM venta_items vi
   LEFT JOIN productos p ON p.id = vi.producto_id
   WHERE vi.venta_id = ?`,
        [id],
      );

      let cliente_nombre = null;
      if (venta.cliente_id) {
        const cli = await get(`SELECT nombre FROM clientes WHERE id = ?`, [
          venta.cliente_id,
        ]);
        cliente_nombre = cli?.nombre || null;
      }

      res.json({ ...venta, items, cliente_nombre });

      res.json({
        ...venta,
        items,
      });
    } catch (e) {
      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// ================== DEVOLUCIÓN PARCIAL ==================
router.post(
  "/:id/devolucion",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const ventaId = Number(req.params.id);
      const { items, restockear = [] } = req.body;
      // items: [{ producto_id, cantidad, precio_unitario, descripcion_libre }]
      // restockear: [producto_id, ...] — los que vuelven al stock

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "ITEMS_REQUERIDOS" });
      }

      const venta = await get(`SELECT * FROM ventas WHERE id = ?`, [ventaId]);
      if (!venta) return res.status(404).json({ error: "VENTA_NO_ENCONTRADA" });

      const user = req.user?.email || "cajero";
      const fecha = new Date().toISOString().slice(0, 19).replace("T", " ");

      // Calcular monto total a devolver
      const montoDevolucion = items.reduce(
        (sum, it) => sum + Number(it.precio_unitario) * Number(it.cantidad),
        0,
      );

      // Insertar registro de devolución
      const r = await run(
        `INSERT INTO devoluciones (
           venta_id, fecha, usuario, monto_total, motivo
         ) VALUES (?, ?, ?, ?, ?)`,
        [ventaId, fecha, user, montoDevolucion, req.body.motivo || ""],
      );
      const devId = r.lastID;

      // Insertar ítems devueltos y manejar stock
      for (const it of items) {
        await run(
          `INSERT INTO devolucion_items (
             devolucion_id, producto_id, cantidad,
             precio_unitario, descripcion_libre
           ) VALUES (?, ?, ?, ?, ?)`,
          [
            devId,
            it.producto_id || null,
            it.cantidad,
            it.precio_unitario,
            it.descripcion_libre || null,
          ],
        );

        // Restock solo si el producto existe y está en la lista
        if (it.producto_id && restockear.includes(Number(it.producto_id))) {
          const prod = await get(`SELECT stock FROM productos WHERE id = ?`, [
            it.producto_id,
          ]);
          if (prod) {
            const stockAnterior = Number(prod.stock);
            const stockNuevo = stockAnterior + Number(it.cantidad);
            await run(`UPDATE productos SET stock = ? WHERE id = ?`, [
              stockNuevo,
              it.producto_id,
            ]);
            await run(
              `INSERT INTO movimientos_stock (
                 producto_id, tipo, cantidad,
                 stock_anterior, stock_nuevo, usuario, motivo
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                it.producto_id,
                "devolucion",
                Number(it.cantidad),
                stockAnterior,
                stockNuevo,
                user,
                `Devolución #${devId} de Venta #${ventaId}`,
              ],
            );
          }
        }
      }

      // Si la venta era cuenta corriente, registrar el crédito
      if (venta.medio_pago === "cuenta_corriente" && venta.cliente_id) {
        await run(
          `INSERT INTO cuentas_corrientes (
             cliente_id, tipo, monto, descripcion, usuario, fecha
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            venta.cliente_id,
            "pago",
            montoDevolucion,
            `Devolución #${devId} de Venta #${ventaId}`,
            user,
            fecha,
          ],
        );
      }

      registrarAuditoria(
        user,
        "DEVOLUCION",
        `Devolución #${devId} de Venta #${ventaId} - $${montoDevolucion}`,
      );

      res.status(201).json({
        id: devId,
        venta_id: ventaId,
        monto_total: montoDevolucion,
        fecha,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// ================== OBTENER DEVOLUCIONES DE UNA VENTA ==================
router.get(
  "/:id/devoluciones",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const ventaId = Number(req.params.id);
      const devs = await all(
        `SELECT d.*, 
          (SELECT json_group_array(json_object(
            'producto_id', di.producto_id,
            'cantidad', di.cantidad,
            'precio_unitario', di.precio_unitario,
            'descripcion_libre', di.descripcion_libre,
            'nombre', IFNULL(p.nombre, di.descripcion_libre)
          ))
          FROM devolucion_items di
          LEFT JOIN productos p ON p.id = di.producto_id
          WHERE di.devolucion_id = d.id
         ) AS items
        FROM devoluciones d
        WHERE d.venta_id = ?
        ORDER BY datetime(d.fecha) DESC`,
        [ventaId],
      );
      // Parsear el JSON de items
      const result = devs.map((d) => ({
        ...d,
        items: d.items ? JSON.parse(d.items) : [],
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// ================== Endpoint público para ticket ==================
router.get("/public/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const venta = await get(
      `SELECT id, fecha, usuario, subtotal, descuento_tipo, descuento_valor,
              recargo_porcentaje, recargo_monto, total, medio_pago,
              pagado, cambio, cliente_id
       FROM ventas WHERE id = ?`,
      [id],
    );

    if (!venta) return res.status(404).json({ error: "NOT_FOUND" });

    const items = await all(
      `SELECT vi.cantidad,
              vi.precio_unitario,
              COALESCE(p.nombre, vi.descripcion_libre, 'Ítem libre') AS nombre,
              p.sku
       FROM venta_items vi
       LEFT JOIN productos p ON p.id = vi.producto_id
       WHERE vi.venta_id = ?`,
      [id],
    );

    // Cliente si tiene
    let cliente_nombre = null;
    if (venta.cliente_id) {
      const cli = await get(`SELECT nombre FROM clientes WHERE id = ?`, [
        venta.cliente_id,
      ]);
      cliente_nombre = cli?.nombre || null;
    }

    res.json({ ...venta, items, cliente_nombre });
  } catch (e) {
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

export default router;

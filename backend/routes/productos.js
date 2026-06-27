// backend/routes/productos.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { getAnthropicKey } from "./config.js";

const router = Router();

// ---------- helpers ----------
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

function parseLimitOffset(q) {
  const limit = Math.min(Math.max(parseInt(q.limit ?? "50", 10), 1), 200);
  const offset = Math.max(parseInt(q.offset ?? "0", 10), 0);
  return { limit, offset };
}

function generarSKU() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

function cleanProduct(body) {
  const skuGenerado = String(body.sku ?? "").trim() || generarSKU();

  const p = {
    nombre: String(body.nombre ?? "").trim(),

    descripcion: String(body.descripcion ?? "").trim() || null,

    categoria: String(body.categoria ?? "").trim() || null,

    costo: Number(body.costo ?? 0),

    precio: Number(body.precio ?? 0),

    stock: Number.isFinite(Number(body.stock)) ? Number(body.stock) : 0,

    sku: skuGenerado,

    imagen: String(body.imagen ?? "").trim() || null,
  };

  if (!p.nombre) throw new Error("VALIDATION_NOMBRE");

  if (!(p.precio >= 0)) throw new Error("VALIDATION_PRECIO");

  if (!(p.stock >= 0)) throw new Error("VALIDATION_STOCK");

  return p;
}

// ---------- Rutas ----------

// GET /api/productos
// Listado público (para POS). Soporta ?search= o ?q=, además de limit/offset.
router.get("/", async (req, res) => {
  try {
    const term = String(req.query.search ?? req.query.q ?? "").trim();
    const { limit, offset } = parseLimitOffset(req.query);

    if (!term) {
      const rows = await all(
        `SELECT id, nombre, sku, categoria, precio, costo, stock, imagen
           FROM productos
           WHERE activo = 1
          ORDER BY nombre ASC
          LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      return res.json(rows);
    }

    const like = `%${term}%`;
    const rows = await all(
      `SELECT id, nombre, sku, categoria, precio, stock, imagen
     FROM productos
    WHERE activo = 1
      AND (
        nombre LIKE ?
        OR sku LIKE ?
        OR sku = ?
      )
    ORDER BY nombre ASC
    LIMIT ? OFFSET ?`,
      [like, like, term, limit, offset],
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// GET /api/productos/:id  (detalle)
router.get("/:id", async (req, res) => {
  try {
    const row = await get(
      `SELECT id, nombre, descripcion, categoria, precio, costo, stock, sku, imagen,
          creado_en, actualizado_en
     FROM productos
    WHERE id = ?
      AND activo = 1`,
      [req.params.id],
    );
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// POST /api/productos  (crear) - protegido
router.post(
  "/",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const p = cleanProduct(req.body);

      const r = await run(
        `INSERT INTO productos (
          nombre,
          descripcion,
          categoria,
          costo,
          precio,
          stock,
          sku,
          imagen,
          creado_en
        )
        VALUES (?,?, ?, ?, ?, ?, ?, ?, datetime('now'))`,

        [
          p.nombre,
          p.descripcion,
          p.categoria,
          p.costo,
          p.precio,
          p.stock,
          p.sku,
          p.imagen,
        ],
      );

      // =====================================
      // OBTENER PRODUCTO NUEVO
      // =====================================

      const nuevo = await get(
        `SELECT
          id,
          nombre,
          descripcion,
          categoria,
          precio,
          costo,
          stock,
          sku,
          imagen
        FROM productos
        WHERE id = ?`,

        [r.lastID],
      );

      // =====================================
      // MOVIMIENTO STOCK INICIAL
      // =====================================

      if (Number(p.stock) > 0) {
        await run(
          `INSERT INTO movimientos_stock (

            producto_id,
            tipo,
            cantidad,
            stock_anterior,
            stock_nuevo,
            usuario,
            motivo

          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`,

          [
            r.lastID,
            "ingreso",
            Number(p.stock),
            0,
            Number(p.stock),
            req.user?.email || "admin",
            "Stock inicial",
          ],
        );
      }

      registrarAuditoria(
        req.user?.email || "admin",
        "CREAR_PRODUCTO",
        `${nuevo.nombre} (SKU: ${nuevo.sku})`,
      );

      res.status(201).json(nuevo);
    } catch (e) {
      console.error(e);

      if (e.message === "VALIDATION_NOMBRE") {
        return res.status(400).json({
          error: "Nombre requerido",
        });
      }

      if (e.message === "VALIDATION_PRECIO") {
        return res.status(400).json({
          error: "Precio inválido",
        });
      }

      if (e.message === "VALIDATION_STOCK") {
        return res.status(400).json({
          error: "Stock inválido",
        });
      }

      if (e?.code === "SQLITE_CONSTRAINT") {
        return res.status(409).json({
          error: "SKU_DUPLICADO",
        });
      }

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message,
      });
    }
  },
);

// PUT /api/productos/:id  (editar) - protegido
router.put(
  "/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const exists = await get(`SELECT id FROM productos WHERE id = ?`, [id]);
      if (!exists) return res.status(404).json({ error: "NOT_FOUND" });

      const p = cleanProduct(req.body);
      await run(
        `UPDATE productos
          SET nombre = ?, descripcion = ?, categoria = ?,costo = ?, precio = ?, stock = ?,
              sku = ?, imagen = ?, actualizado_en = datetime('now')
        WHERE id = ?`,
        [
          p.nombre,
          p.descripcion,
          p.categoria,
          p.costo,
          p.precio,
          p.stock,
          p.sku,
          p.imagen,
          id,
        ],
      );

      const updated = await get(
        `SELECT id, nombre, descripcion, categoria, precio, stock, sku, imagen
         FROM productos WHERE id = ?`,
        [id],
      );

      registrarAuditoria(
        req.user?.email || "admin",
        "EDITAR_PRODUCTO",
        `${updated.nombre} (ID: ${updated.id})`,
      );
      res.json(updated);
    } catch (e) {
      if (e.message === "VALIDATION_NOMBRE")
        return res.status(400).json({ error: "Nombre requerido" });
      if (e.message === "VALIDATION_PRECIO")
        return res.status(400).json({ error: "Precio inválido" });
      if (e.message === "VALIDATION_STOCK")
        return res.status(400).json({ error: "Stock inválido" });
      if (e?.code === "SQLITE_CONSTRAINT")
        return res.status(409).json({ error: "SKU_DUPLICADO" });
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// DELETE /api/productos/:id  (eliminar) - protegido (solo admin)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const exists = await get(
      `
      SELECT id, nombre, sku
      FROM productos
      WHERE id = ?
      `,
      [id],
    );

    if (!exists) {
      return res.status(404).json({
        error: "NOT_FOUND",
      });
    }

    await run(
      `
      UPDATE productos
      SET activo = 0,
          actualizado_en = datetime('now')
      WHERE id = ?
      `,
      [id],
    );

    registrarAuditoria(
      req.user?.email || "admin",
      "DESACTIVAR_PRODUCTO",
      `${exists.nombre} (SKU: ${exists.sku})`,
    );

    res.json({
      ok: true,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "DB_ERROR",
      details: e.message,
    });
  }
});

// PATCH /api/productos/stock/:id  (ajuste por delta) - protegido
router.patch(
  "/stock/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const delta = Number(req.body.delta ?? 0);
      if (!Number.isFinite(delta))
        return res.status(400).json({ error: "DELTA_INVALIDO" });

      const prod = await get(`SELECT id, stock FROM productos WHERE id = ?`, [
        id,
      ]);
      if (!prod) return res.status(404).json({ error: "NOT_FOUND" });

      // Evitar stock negativo
      const nuevo = Math.max(0, (Number(prod.stock) || 0) + delta);
      const stockAnterior = Number(prod.stock || 0);
      await run(
        `UPDATE productos SET stock = ?, actualizado_en = datetime('now') WHERE id = ?`,
        [nuevo, id],
      );
      await run(
        `INSERT INTO movimientos_stock (

    producto_id,
    tipo,
    cantidad,
    stock_anterior,
    stock_nuevo,
    usuario,
    motivo

  )
  VALUES (?, ?, ?, ?, ?, ?, ?)`,

        [
          id,

          "ajuste",

          delta,

          stockAnterior,

          nuevo,

          req.user?.email || "admin",

          "Ajuste manual de stock",
        ],
      );

      const updated = await get(
        `SELECT id, nombre, precio, stock, sku FROM productos WHERE id = ?`,
        [id],
      );
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// POST /api/productos/seed-demo  (opcional) - protegido (solo admin)
router.post(
  "/seed-demo",
  requireAuth,
  requireRole("admin"),
  async (_req, res) => {
    try {
      // Inserta 3 productos demo si no existen
      await run(
        `INSERT OR IGNORE INTO productos (nombre, descripcion, categoria, precio, stock, sku, imagen, creado_en)
       VALUES ('Mouse Gamer XYZ', 'Mouse con RGB y 6 botones', 'Periféricos', 15999.99, 20, 'MOU-XYZ-001', NULL, datetime('now'))`,
      );
      await run(
        `INSERT OR IGNORE INTO productos (nombre, descripcion, categoria, precio, stock, sku, imagen, creado_en)
       VALUES ('Teclado Mecánico ABC', 'Switches azules y retroiluminación', 'Periféricos', 32999.50, 15, 'TEK-ABC-002', NULL, datetime('now'))`,
      );
      await run(
        `INSERT OR IGNORE INTO productos (nombre, descripcion, categoria, precio, stock, sku, imagen, creado_en)
       VALUES ('SSD 480GB', 'SATA III alta velocidad', 'Almacenamiento', 24999.00, 10, 'SSD-480-003', NULL, datetime('now'))`,
      );

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// =====================================
// STOCK BAJO
// =====================================

router.get(
  "/alertas/stock-bajo",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const rows = await all(
        `SELECT
          id,
          nombre,
          sku,
          stock,
          categoria
        FROM productos
        WHERE activo = 1
        AND stock <= 5
        ORDER BY stock ASC`,
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

// =====================================
// IMPORTAR DESDE EXCEL (carga masiva)
// POST /api/productos/importar
// =====================================
router.post(
  "/importar",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const productos = req.body.productos;

      if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ error: "LISTA_VACIA" });
      }

      const resultados = { ok: 0, errores: [], duplicados: 0 };

      for (const row of productos) {
        try {
          const p = cleanProduct(row);

          // Si el SKU ya existe, actualizar en lugar de insertar
          const existe = await get(
            `SELECT id FROM productos WHERE sku = ? AND activo = 1`,
            [p.sku],
          );

          if (existe) {
            await run(
              `UPDATE productos
               SET nombre = ?, descripcion = ?, categoria = ?,
                   costo = ?, precio = ?, stock = ?, imagen = ?,
                   actualizado_en = datetime('now')
               WHERE id = ?`,
              [
                p.nombre,
                p.descripcion,
                p.categoria,
                p.costo,
                p.precio,
                p.stock,
                p.imagen,
                existe.id,
              ],
            );
            resultados.duplicados++;
          } else {
            const r = await run(
              `INSERT INTO productos
                 (nombre, descripcion, categoria, costo, precio, stock, sku, imagen, creado_en)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              [
                p.nombre,
                p.descripcion,
                p.categoria,
                p.costo,
                p.precio,
                p.stock,
                p.sku,
                p.imagen,
              ],
            );
            if (Number(p.stock) > 0) {
              await run(
                `INSERT INTO movimientos_stock
                   (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, usuario, motivo)
                 VALUES (?, 'ingreso', ?, 0, ?, ?, 'Importación Excel')`,
                [r.lastID, p.stock, p.stock, req.user?.email || "admin"],
              );
            }
            resultados.ok++;
          }
        } catch (e) {
          resultados.errores.push({
            fila: row.nombre || "?",
            error: e.message,
          });
        }
      }

      registrarAuditoria(
        req.user?.email || "admin",
        "IMPORTAR_PRODUCTOS",
        `${resultados.ok} creados, ${resultados.duplicados} actualizados`,
      );

      res.status(201).json(resultados);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// =====================================
// EXPORTAR A EXCEL
// GET /api/productos/exportar
// =====================================
router.get(
  "/exportar",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const rows = await all(
        `SELECT id, nombre, descripcion, categoria, sku,
                precio, costo, stock, imagen
         FROM productos
         WHERE activo = 1
         ORDER BY nombre ASC`,
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

// POST /api/productos/analizar-foto

router.post(
  "/analizar-foto",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const { imagen, mimeType } = req.body;
      if (!imagen || !mimeType) {
        return res.status(400).json({ error: "Faltan imagen o mimeType" });
      }

      // Buscar key en DB primero, luego .env como fallback
      const apiKey = await getAnthropicKey();
      if (!apiKey) {
        return res.status(402).json({
          error: "SIN_API_KEY",
          mensaje:
            "Configurá tu API key de Anthropic en Configuración → IA para usar esta función.",
        });
      }

      const prompt = `Analizá esta imagen de una factura o remito de proveedor.
Extraé TODOS los productos/artículos que aparecen listados.
Para cada producto devolvé un objeto JSON con estos campos:
- nombre: string (nombre del producto tal como aparece, limpio y capitalizado)
- precio: number (precio de venta unitario, si no aparece usa 0)
- costo: number (precio de costo o precio de compra unitario, si no aparece usa 0)
- stock: number (cantidad en la factura/remito, si no aparece usa 1)
- categoria: string (intentá inferir la categoría. Si no podés inferir dejá "")

REGLAS:
- Si el documento tiene "precio unitario" y "total", el precio unitario va en "costo".
- Ignorá totales, subtotales, descuentos globales y datos de encabezado (CUIT, fecha, etc.).
- Ignorá cualquier anotación manuscrita.
- Devolvé SOLO un array JSON válido, sin texto adicional, sin markdown, sin backticks.`;

      const response = await apiFetch("/api/productos/analizar-foto", {
        method: "POST",
        body: JSON.stringify({ imagen: fotoBase64, mimeType: fotoMimeType }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.error === "SIN_API_KEY") {
          throw new Error(
            "No hay API key configurada. Andá a Configuración → IA y cargá tu key de Anthropic.",
          );
        }
        if (err.error === "SIN_PRODUCTOS") {
          throw new Error(
            "No se detectaron productos. Probá con una foto más nítida.",
          );
        }
        throw new Error(err.details || err.error || `Error ${response.status}`);
      }

      const data = await response.json();
      const productos = data.productos;
      res.json({ productos });
    } catch (e) {
      console.error("[analizar-foto]", e);
      res.status(500).json({ error: "DB_ERROR", details: e.message });
    }
  },
);

export default router;

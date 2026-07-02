// backend/routes/productos.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFeature } from "../middleware/licencia.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { getAnthropicKey, getGeminiKey, getIAProvider } from "./config.js";

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
  const limit = Math.min(Math.max(parseInt(q.limit ?? "50", 10), 1), 5000);
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

// GET /api/productos/barcode-lookup/:codigo  (solo plan Ultra)
router.get("/barcode-lookup/:codigo", requireAuth, requireFeature("ia"), async (req, res) => {
  const { codigo } = req.params;
  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(codigo)}.json`,
      { headers: { "User-Agent": "SistemaGestionPRO/2.2.4" } }
    );
    const data = await r.json();

    if (data.status !== 1 || !data.product) {
      return res.json({ encontrado: false });
    }

    const p = data.product;
    const nombre =
      p.product_name_es?.trim() ||
      p.product_name?.trim() ||
      p.abbreviated_product_name?.trim() ||
      "";

    const rawCat = p.categories_tags?.[0] || "";
    const categoria = rawCat.replace(/^(en:|es:)/, "").replace(/-/g, " ") || "";

    res.json({
      encontrado: !!nombre,
      nombre,
      categoria,
      imagen: p.image_front_url || p.image_url || "",
      marca: p.brands || "",
    });
  } catch {
    res.json({ encontrado: false });
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

const ANALIZAR_PROMPT = `Analizá esta imagen de una factura o remito de proveedor.
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

async function analizarConAnthropic(imagen, mimeType) {
  const apiKey = await getAnthropicKey();
  if (!apiKey) throw new Error("SIN_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imagen } },
          { type: "text", text: ANALIZAR_PROMPT },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic HTTP ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || "";
  return JSON.parse(text);
}

async function analizarConGemini(imagen, mimeType) {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error("SIN_API_KEY");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imagen } },
            { text: ANALIZAR_PROMPT },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini HTTP ${response.status}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

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

      const provider = await getIAProvider();
      let productos;

      if (provider === "gemini") {
        productos = await analizarConGemini(imagen, mimeType);
      } else {
        productos = await analizarConAnthropic(imagen, mimeType);
      }

      if (!productos || !productos.length) {
        return res.status(422).json({ error: "SIN_PRODUCTOS" });
      }

      res.json({ productos });
    } catch (e) {
      console.error("[analizar-foto]", e);
      if (e.message === "SIN_API_KEY") {
        return res.status(402).json({
          error: "SIN_API_KEY",
          mensaje: "Configurá tu API key en Configuración → IA para usar esta función.",
        });
      }
      res.status(500).json({ error: "AI_ERROR", details: e.message });
    }
  },
);

export default router;

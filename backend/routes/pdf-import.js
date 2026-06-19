// backend/routes/pdf-import.js
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// POST /api/pdf-import/analizar
router.post(
  "/analizar",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {
      const { texto } = req.body;
      if (!texto || !texto.trim()) {
        return res.status(400).json({ error: "TEXTO_VACIO" });
      }

      // Parsear la tabla de productos del texto extraído
      const productos = parsearFactura(texto);

      if (!productos.length) {
        return res.status(422).json({ error: "SIN_PRODUCTOS" });
      }

      res.json({ productos });
    } catch (e) {
      console.error("[pdf-import]", e);
      res.status(500).json({ error: "PARSE_ERROR", details: e.message });
    }
  }
);

/* ── Parser de texto de factura ─────────────────────────────
   Detecta filas de tabla con: cantidad, descripción, precio
   Funciona con facturas AFIP estándar y formatos similares
──────────────────────────────────────────────────────────── */
function parsearFactura(texto) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const productos = [];

  // Palabras clave que indican que una línea NO es un producto
  const ignorar = /subtotal|total|iva|descuento|bonif|percep|iibb|imp\.|neto|entrega|vuelto|saldo|fecha|cuit|factura|remito|recibo|vendedor|condicion|domicilio|localidad|partido/i;

  // Detectar encabezado de tabla para saber qué columnas hay
  // Buscamos la línea que tiene CODIGO/CANTIDAD/DESCRIPCION/PRECIO
  let tieneEncabezado = false;
  let idxEncabezado = -1;
  for (let i = 0; i < lineas.length; i++) {
    if (/codigo.*cantidad.*descrip|cantidad.*descrip.*precio/i.test(lineas[i])) {
      tieneEncabezado = true;
      idxEncabezado = i;
      break;
    }
  }

  // Patrones para detectar filas de productos
  // Patrón 1: CODIGO CANTIDAD DESCRIPCION PRECIO DESCUENTO SUBTOTAL
  // Ej: "107240   6   NOSOTRAS PROT NORM X 20 C/CALE   1398,24   2200   8389,41"
  const patronFactura = /^(\d{4,10})\s+(\d{1,4})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,\/\-]{4,60})\s+([\d.,]+)/i;

  // Patrón 2: CANTIDAD DESCRIPCION PRECIO (sin código)
  // Ej: "6   NOSOTRAS PROT NORM X 20   1398,24"
  const patronSinCodigo = /^(\d{1,4})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,\/\-]{4,60})\s+([\d.,]+(?:\s+[\d.,]+)?)$/i;

  // Patrón 3: DESCRIPCION solo con precio al final
  // Ej: "NOSOTRAS PROT NORM X 20 C/CALE .... 1398,24"
  const patronDescPrecio = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,\/\-]{6,60})\s+([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))$/i;

  const lineasProcesar = tieneEncabezado
    ? lineas.slice(idxEncabezado + 1)
    : lineas;

  for (const linea of lineasProcesar) {
    if (!linea || ignorar.test(linea)) continue;
    if (linea.length < 8) continue;

    let match;

    // Intentar Patrón 1 (con código)
    match = linea.match(patronFactura);
    if (match) {
      const nombre = limpiarNombre(match[3]);
      const costo = parsePrecio(match[4]);
      if (nombre && costo > 0) {
        productos.push({
          nombre,
          precio: 0,
          costo,
          stock: parseInt(match[2]) || 1,
          categoria: inferirCategoria(nombre),
        });
        continue;
      }
    }

    // Intentar Patrón 2 (sin código)
    match = linea.match(patronSinCodigo);
    if (match) {
      const nombre = limpiarNombre(match[2]);
      // El último número es el precio/costo
      const nums = match[3].trim().split(/\s+/);
      const costo = parsePrecio(nums[0]);
      if (nombre && costo > 0) {
        productos.push({
          nombre,
          precio: 0,
          costo,
          stock: parseInt(match[1]) || 1,
          categoria: inferirCategoria(nombre),
        });
        continue;
      }
    }

    // Intentar Patrón 3 (descripción + precio)
    match = linea.match(patronDescPrecio);
    if (match) {
      const nombre = limpiarNombre(match[1]);
      const costo = parsePrecio(match[2]);
      if (nombre && costo > 0 && nombre.split(" ").length >= 2) {
        productos.push({
          nombre,
          precio: 0,
          costo,
          stock: 1,
          categoria: inferirCategoria(nombre),
        });
      }
    }
  }

  // Deduplicar por nombre similar
  const vistos = new Set();
  return productos.filter(p => {
    const key = p.nombre.toLowerCase().slice(0, 20);
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function parsePrecio(str) {
  if (!str) return 0;
  // "1.398,24" → 1398.24 | "1398,24" → 1398.24 | "1398.24" → 1398.24
  const clean = str.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function limpiarNombre(str) {
  return str
    .replace(/\s{2,}/g, " ")
    .replace(/[^\w\s.,\/\-áéíóúñÁÉÍÓÚÑ]/gi, "")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function inferirCategoria(nombre) {
  const n = nombre.toLowerCase();
  if (/coca|pepsi|7up|sprite|fanta|agua|jugo|gaseosa|bebida|cerveza|vino|whisky|fernet/.test(n)) return "Bebidas";
  if (/leche|yogur|queso|manteca|crema|lácteo|lacteo/.test(n)) return "Lácteos";
  if (/pan|galeta|galleta|arroz|fideos|pasta|harina|azucar|sal|aceite|vinagre/.test(n)) return "Almacén";
  if (/jabón|jabon|detergente|lavandina|suavizante|limpiador|desinfect/.test(n)) return "Limpieza";
  if (/shampoo|acondicionador|desodorante|crema|perfume|cosmético|cosmetico/.test(n)) return "Higiene";
  if (/pañal|panal|toalla|nosotras|carefree|tampón|tampon|calipso/.test(n)) return "Higiene";
  if (/remera|pantalon|zapato|ropa|calzado|camisa/.test(n)) return "Indumentaria";
  if (/cable|pila|batería|bateria|electro|foco|lámpara|lampara/.test(n)) return "Electrónica";
  if (/spagheti|spaghetti|tallarín|tallarin|terrabusi|fideos/.test(n)) return "Almacén";
  return "";
}

export default router;
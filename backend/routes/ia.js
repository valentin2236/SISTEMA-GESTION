import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getGeminiKey, getIAProvider, getAnthropicKey } from './config.js';

const router = Router();
router.use(requireAuth);

function dbAll(sql, p = []) {
  return new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
}
function dbGet(sql, p = []) {
  return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
}

async function callGemini(prompt, maxTokens = 700) {
  const key = await getGeminiKey();
  if (!key) throw new Error('Sin API key de Gemini configurada. Ir a Configuración → IA.');
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropic(prompt, maxTokens = 700) {
  const key = await getAnthropicKey();
  if (!key) throw new Error('Sin API key de Anthropic configurada.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

async function callIA(prompt, maxTokens = 700) {
  const provider = await getIAProvider();
  return provider === 'anthropic'
    ? callAnthropic(prompt, maxTokens)
    : callGemini(prompt, maxTokens);
}

// ── POST /api/ia/chat ──────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { pregunta } = req.body || {};
    if (!pregunta?.trim()) return res.status(400).json({ error: 'Pregunta vacía' });

    const [ventasHoy, ventasSemana, topProductos, stockBajo, cajaAbierta, clientesDeuda] =
      await Promise.all([
        dbGet(`SELECT COUNT(*) as cant, COALESCE(SUM(total),0) as total
               FROM ventas WHERE date(creado_en) = date('now')`),
        dbAll(`SELECT date(creado_en) as fecha, COUNT(*) as cant, COALESCE(SUM(total),0) as total
               FROM ventas WHERE creado_en >= date('now','-7 days')
               GROUP BY date(creado_en) ORDER BY fecha DESC`),
        dbAll(`SELECT p.nombre, SUM(vi.cantidad) as unidades, COALESCE(SUM(vi.subtotal),0) as facturado
               FROM venta_items vi
               JOIN productos p ON p.id = vi.producto_id
               JOIN ventas v ON v.id = vi.venta_id
               WHERE v.creado_en >= date('now','-30 days')
               GROUP BY vi.producto_id ORDER BY unidades DESC LIMIT 5`),
        dbAll(`SELECT nombre, sku, stock FROM productos
               WHERE stock <= 5 AND stock >= 0 ORDER BY stock ASC LIMIT 8`),
        dbGet(`SELECT monto_inicial, creado_en FROM cajas
               WHERE cerrado_en IS NULL ORDER BY creado_en DESC LIMIT 1`),
        dbGet(`SELECT COUNT(*) as cant FROM clientes
               WHERE cuenta_corriente = 1 AND saldo_deuda > 0`),
      ]);

    const prompt = `Sos el asistente IA del Sistema de Gestión PRO. Respondé en español, de forma clara y concisa (máximo 5 oraciones). Si te preguntan algo que no está en los datos, indicalo amablemente.

=== DATOS DEL NEGOCIO ===
Ventas hoy: ${ventasHoy?.cant || 0} ventas — Total: $${Number(ventasHoy?.total || 0).toFixed(2)}
Caja: ${cajaAbierta ? `Abierta (saldo inicial $${cajaAbierta.monto_inicial})` : 'Sin caja abierta hoy'}
Clientes con deuda activa: ${clientesDeuda?.cant || 0}

Ventas últimos 7 días:
${ventasSemana.length
  ? ventasSemana.map(v => `  ${v.fecha}: ${v.cant} ventas — $${Number(v.total).toFixed(2)}`).join('\n')
  : '  Sin datos'}

Top 5 productos (últimos 30 días):
${topProductos.length
  ? topProductos.map((p, i) => `  ${i + 1}. ${p.nombre}: ${p.unidades} u. vendidas — $${Number(p.facturado).toFixed(2)}`).join('\n')
  : '  Sin datos'}

Productos con stock bajo (≤5 u.):
${stockBajo.length
  ? stockBajo.map(p => `  ${p.nombre}${p.sku ? ` (${p.sku})` : ''}: ${p.stock} u.`).join('\n')
  : '  Ninguno'}

=== PREGUNTA DEL USUARIO ===
${pregunta.trim()}`;

    const respuesta = await callIA(prompt, 500);
    res.json({ ok: true, respuesta: respuesta.trim() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/ia/reposicion ─────────────────────────────────
router.get('/reposicion', async (req, res) => {
  try {
    const [productos, velocidad] = await Promise.all([
      dbAll(`SELECT id, nombre, sku, stock FROM productos
             WHERE stock <= 10 AND stock >= 0 ORDER BY stock ASC LIMIT 20`),
      dbAll(`SELECT vi.producto_id, SUM(vi.cantidad) as vendido
             FROM venta_items vi
             JOIN ventas v ON v.id = vi.venta_id
             WHERE v.creado_en >= date('now','-30 days')
             GROUP BY vi.producto_id`),
    ]);

    if (!productos.length) {
      return res.json({ ok: true, respuesta: '¡Tu inventario está bien abastecido! No hay productos con stock bajo en este momento.' });
    }

    const velMap = {};
    for (const v of velocidad) velMap[v.producto_id] = Number(v.vendido);

    const lista = productos.map(p => {
      const vel = velMap[p.id] || 0;
      const dias = vel > 0 ? Math.round((p.stock / vel) * 30) : null;
      return `- ${p.nombre}${p.sku ? ` (${p.sku})` : ''}: ${p.stock} u. en stock | ${vel} u. vendidas en 30 días${dias !== null ? ` | duración estimada: ${dias} días` : ' | sin ventas recientes'}`;
    }).join('\n');

    const prompt = `Sos un asesor de inventario para un comercio. Analizá estos productos con stock bajo y generá sugerencias concretas de reposición.

Para cada producto indicá: si es urgente o puede esperar, y cuántas unidades sugerís pedir (basate en la velocidad de ventas). Sé directo y práctico. Respondé en español con viñetas (•).

=== PRODUCTOS CON STOCK BAJO ===
${lista}`;

    const respuesta = await callIA(prompt, 600);
    res.json({ ok: true, respuesta: respuesta.trim() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/ia/descripcion ───────────────────────────────
router.post('/descripcion', async (req, res) => {
  try {
    const { nombre, categoria, precio } = req.body || {};
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    const prompt = `Generá una descripción comercial breve (máximo 60 palabras, 2 oraciones) para un producto de comercio minorista argentino.

Producto: ${nombre}
Categoría: ${categoria || 'General'}
${precio ? `Precio de venta: $${precio}` : ''}

Respondé ÚNICAMENTE con la descripción. Sin título, sin comillas, sin explicaciones adicionales.`;

    const raw = await callIA(prompt, 120);
    const descripcion = raw
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^["']|["']$/g, '')
      .replace(/[*_#>`]/g, '')
      .trim();

    res.json({ ok: true, descripcion });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

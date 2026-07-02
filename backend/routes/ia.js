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
               FROM ventas WHERE date(fecha) = date('now')`),
        dbAll(`SELECT date(fecha) as dia, COUNT(*) as cant, COALESCE(SUM(total),0) as total
               FROM ventas WHERE fecha >= date('now','-7 days')
               GROUP BY date(fecha) ORDER BY dia DESC`),
        dbAll(`SELECT p.nombre, SUM(vi.cantidad) as unidades, COALESCE(SUM(vi.precio_unitario * vi.cantidad),0) as facturado
               FROM venta_items vi
               JOIN productos p ON p.id = vi.producto_id
               JOIN ventas v ON v.id = vi.venta_id
               WHERE v.fecha >= date('now','-30 days')
               GROUP BY vi.producto_id ORDER BY unidades DESC LIMIT 5`),
        dbAll(`SELECT nombre, sku, stock FROM productos
               WHERE stock <= 5 AND stock >= 0 ORDER BY stock ASC LIMIT 8`),
        dbGet(`SELECT monto_inicial, fecha_apertura FROM caja_sesiones
               WHERE fecha_cierre IS NULL ORDER BY fecha_apertura DESC LIMIT 1`),
        dbGet(`SELECT COUNT(DISTINCT cliente_id) as cant FROM cuentas_corrientes`),
      ]);

    const prompt = `Sos el asistente IA del Sistema de Gestión PRO. Respondé en español, de forma clara y concisa (máximo 5 oraciones). Si te preguntan algo que no está en los datos, indicalo amablemente.

=== DATOS DEL NEGOCIO ===
Ventas hoy: ${ventasHoy?.cant || 0} ventas — Total: $${Number(ventasHoy?.total || 0).toFixed(2)}
Caja: ${cajaAbierta ? `Abierta (saldo inicial $${cajaAbierta.monto_inicial})` : 'Sin caja abierta hoy'}
Clientes con cuenta corriente activa: ${clientesDeuda?.cant || 0}

Ventas últimos 7 días:
${ventasSemana.length
  ? ventasSemana.map(v => `  ${v.dia}: ${v.cant} ventas — $${Number(v.total).toFixed(2)}`).join('\n')
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
             WHERE v.fecha >= date('now','-30 days')
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

// ── GET /api/ia/resumen-diario ─────────────────────────────
router.get('/resumen-diario', async (req, res) => {
  try {
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
    const ayer = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });

    const [ventasHoy, ventasAyer, porMedio, topHoy, cajaHoy, stockBajo] = await Promise.all([
      dbGet(`SELECT COUNT(*) as cant, COALESCE(SUM(total),0) as total,
                    COALESCE(AVG(total),0) as ticket_prom
             FROM ventas WHERE date(fecha) = ?`, [hoy]),
      dbGet(`SELECT COUNT(*) as cant, COALESCE(SUM(total),0) as total
             FROM ventas WHERE date(fecha) = ?`, [ayer]),
      dbAll(`SELECT medio_pago, COUNT(*) as cant, COALESCE(SUM(total),0) as total
             FROM ventas WHERE date(fecha) = ?
             GROUP BY medio_pago ORDER BY total DESC`, [hoy]),
      dbAll(`SELECT p.nombre, SUM(vi.cantidad) as uds,
                    COALESCE(SUM(vi.precio_unitario * vi.cantidad),0) as subtotal
             FROM venta_items vi
             JOIN productos p ON p.id = vi.producto_id
             JOIN ventas v ON v.id = vi.venta_id
             WHERE date(v.fecha) = ?
             GROUP BY vi.producto_id ORDER BY uds DESC LIMIT 5`, [hoy]),
      dbGet(`SELECT monto_inicial FROM caja_sesiones
             WHERE date(fecha_apertura) = ? AND fecha_cierre IS NULL LIMIT 1`, [hoy]),
      dbAll(`SELECT nombre, stock FROM productos
             WHERE stock <= 5 AND stock >= 0 ORDER BY stock ASC LIMIT 5`),
    ]);

    const varVentas = ventasAyer?.total > 0
      ? ((( ventasHoy.total - ventasAyer.total) / ventasAyer.total) * 100).toFixed(1)
      : null;

    const mediosStr = porMedio.length
      ? porMedio.map(m => `${m.medio_pago}: ${m.cant} ventas — $${Number(m.total).toFixed(2)}`).join('\n  ')
      : 'Sin ventas';

    const topStr = topHoy.length
      ? topHoy.map((p,i) => `${i+1}. ${p.nombre}: ${p.uds} u. — $${Number(p.subtotal).toFixed(2)}`).join('\n  ')
      : 'Sin datos';

    const stockStr = stockBajo.length
      ? stockBajo.map(p => `${p.nombre}: ${p.stock} u.`).join(', ')
      : 'ninguno';

    const prompt = `Sos el analista de negocio del Sistema de Gestión PRO. Generá un resumen ejecutivo del día de hoy para el dueño del comercio. Usá un tono directo y práctico. Máximo 8 oraciones. Destacá lo más importante: si fue un buen día o no, la comparación con ayer, qué productos se vendieron más, y si hay algo a tener en cuenta (stock bajo, etc.).

=== RESUMEN DEL DÍA (${hoy}) ===
Ventas hoy: ${ventasHoy.cant} tickets — Total: $${Number(ventasHoy.total).toFixed(2)} — Ticket promedio: $${Number(ventasHoy.ticket_prom).toFixed(2)}
Ventas ayer: ${ventasAyer.cant} tickets — Total: $${Number(ventasAyer.total).toFixed(2)}
${varVentas !== null ? `Variación respecto a ayer: ${varVentas > 0 ? '+' : ''}${varVentas}%` : 'Sin datos de ayer para comparar'}
Caja: ${cajaHoy ? 'Abierta (monto inicial $' + cajaHoy.monto_inicial + ')' : 'Sin caja abierta hoy'}

Por medio de pago:
  ${mediosStr}

Top productos del día:
  ${topStr}

Productos con stock bajo (≤5 u.): ${stockStr}`;

    const respuesta = await callIA(prompt, 700);
    res.json({ ok: true, respuesta: respuesta.trim(), fecha: hoy });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/ia/prediccion-stock ───────────────────────────
router.get('/prediccion-stock', async (req, res) => {
  try {
    const [productos, velocidades] = await Promise.all([
      dbAll(`SELECT id, nombre, sku, stock, categoria FROM productos
             WHERE activo = 1 AND stock > 0 ORDER BY nombre ASC`),
      dbAll(`SELECT vi.producto_id,
                    SUM(vi.cantidad) as vendido_30d,
                    COUNT(DISTINCT date(v.fecha)) as dias_con_venta
             FROM venta_items vi
             JOIN ventas v ON v.id = vi.venta_id
             WHERE v.fecha >= date('now', '-30 days')
             GROUP BY vi.producto_id`),
    ]);

    const velMap = {};
    for (const v of velocidades) {
      velMap[v.producto_id] = {
        vendido_30d: Number(v.vendido_30d),
        vel_diaria: Number(v.vendido_30d) / 30,
      };
    }

    const criticos = [];
    const alertas  = [];

    for (const p of productos) {
      const vel = velMap[p.id];
      if (!vel || vel.vel_diaria <= 0) continue;
      const dias = Math.floor(p.stock / vel.vel_diaria);
      if (dias <= 3)  criticos.push({ ...p, dias, vendido_30d: vel.vendido_30d });
      else if (dias <= 10) alertas.push({ ...p, dias, vendido_30d: vel.vendido_30d });
    }

    // Sin movimiento = productos sin ventas en 30 días
    const sinVentas = productos.filter(p => !velMap[p.id]).slice(0, 5);

    if (!criticos.length && !alertas.length) {
      return res.json({
        ok: true,
        respuesta: '✅ ¡Tu inventario está en buenas condiciones! Ningún producto se agota en los próximos 10 días según la velocidad de ventas actual.',
        criticos: [],
        alertas: [],
        sin_ventas: sinVentas,
      });
    }

    const fmt = (arr) => arr.map(p =>
      `• ${p.nombre}${p.sku ? ` (${p.sku})` : ''}: ${p.stock} u. en stock, se agota en ~${p.dias} días (vende ~${p.vendido_30d} u./mes)`
    ).join('\n');

    const prompt = `Sos un analista de inventario para un comercio minorista. Analizá estos productos que se quedarán sin stock próximamente y generá alertas claras y concretas. Priorizá los críticos. Respondé en español con bullets (•). Máximo 10 oraciones en total.

=== QUIEBRE INMINENTE (≤3 días) ===
${criticos.length ? fmt(criticos) : '(ninguno)'}

=== PRÓXIMO A AGOTARSE (4-10 días) ===
${alertas.length ? fmt(alertas) : '(ninguno)'}

Para cada grupo indicá qué tan urgente es reponer y por qué.`;

    const respuesta = await callIA(prompt, 800);
    res.json({
      ok: true,
      respuesta: respuesta.trim(),
      criticos,
      alertas,
      sin_ventas: sinVentas,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

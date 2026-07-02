// backend/routes/arca.js — ARCA (ex-AFIP) Facturación Electrónica
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import logger from '../utils/logger.js';
import { getTicketAcceso, invalidarCache } from '../utils/wsaa.js';
import { solicitarCAE, getUltimoComprobante, TIPOS_COMPROBANTE, TIPOS_DOC } from '../utils/wsfe.js';

const router = Router();

// ── helpers ───────────────────────────────────────────────
function get(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function run(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this); }));
}

async function getArcaCfg() {
  const rows = await new Promise((res, rej) =>
    db.all('SELECT clave, valor FROM configuracion', [], (e, d) => e ? rej(e) : res(d))
  );
  return Object.fromEntries(rows.map(r => [r.clave, r.valor]));
}

function validarCfg(cfg) {
  if (!cfg.arca_cuit)         return 'CUIT no configurado';
  if (!cfg.arca_punto_venta)  return 'Punto de venta no configurado';
  if (!cfg.arca_certificado)  return 'Certificado no configurado';
  if (!cfg.arca_private_key)  return 'Clave privada no configurada';
  return null;
}

// ── GET /api/arca/info — metadatos para el frontend ──────
router.get('/info', requireAuth, async (_req, res) => {
  try {
    const cfg = await getArcaCfg();
    res.json({
      configurado: !!(cfg.arca_cuit && cfg.arca_certificado && cfg.arca_private_key && cfg.arca_punto_venta),
      cuit: cfg.arca_cuit || null,
      punto_venta: cfg.arca_punto_venta || null,
      ambiente: cfg.arca_ambiente || 'homologacion',
      condicion: cfg.arca_condicion || null,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/arca/test — probar conexión WSAA ────────────
router.get('/test', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const cfg = await getArcaCfg();
    const err = validarCfg(cfg);
    if (err) return res.status(400).json({ ok: false, error: err });

    // Forzar nueva autenticación (invalida cache)
    invalidarCache(cfg.arca_cuit, cfg.arca_ambiente || 'homologacion');

    const ta = await getTicketAcceso(
      cfg.arca_cuit,
      cfg.arca_certificado,
      cfg.arca_private_key,
      cfg.arca_ambiente || 'homologacion'
    );

    // Probar WSFE consultando último comprobante tipo C (o B)
    const tipoCbte = cfg.arca_condicion === 'responsable_inscripto' ? 6 : 11;
    const ultimo = await getUltimoComprobante({
      token: ta.token,
      sign: ta.sign,
      cuit: cfg.arca_cuit,
      puntoVenta: Number(cfg.arca_punto_venta),
      tipoComprobante: tipoCbte,
      ambiente: cfg.arca_ambiente || 'homologacion',
    });

    const ambiente = cfg.arca_ambiente || 'homologacion';
    res.json({
      ok: true,
      mensaje: `Conexión exitosa con ARCA (${ambiente}). Último comprobante ${TIPOS_COMPROBANTE[tipoCbte] || tipoCbte}: #${ultimo}.`,
    });
  } catch(e) {
    logger.error('ARCA test error', { error: e.message });
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /api/arca/facturar ───────────────────────────────
// body: { venta_id, tipo_comprobante?, doc_tipo?, doc_nro? }
router.post('/facturar', requireAuth, requireRole('admin', 'vendedor'), async (req, res) => {
  const { venta_id, tipo_comprobante, doc_tipo = 99, doc_nro = 0 } = req.body;

  if (!venta_id) return res.status(400).json({ error: 'Falta venta_id' });

  try {
    const cfg = await getArcaCfg();
    const err = validarCfg(cfg);
    if (err) return res.status(400).json({ error: err });

    const venta = await get(
      'SELECT id, total, cae FROM ventas WHERE id = ?',
      [venta_id]
    );
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    if (venta.cae) {
      return res.status(409).json({ error: 'Esta venta ya tiene CAE asignado', cae: venta.cae });
    }

    // Determinar tipo de comprobante según condición fiscal si no fue especificado
    let tipoCbte = Number(tipo_comprobante);
    if (!tipoCbte) {
      tipoCbte = cfg.arca_condicion === 'responsable_inscripto' ? 6 : 11;
    }

    const ta = await getTicketAcceso(
      cfg.arca_cuit,
      cfg.arca_certificado,
      cfg.arca_private_key,
      cfg.arca_ambiente || 'homologacion'
    );

    const { cae, caeVto, nroComprobante } = await solicitarCAE({
      token: ta.token,
      sign: ta.sign,
      cuit: cfg.arca_cuit,
      puntoVenta: Number(cfg.arca_punto_venta),
      tipoComprobante: tipoCbte,
      docTipo: Number(doc_tipo),
      docNro: String(doc_nro || 0),
      total: venta.total,
      ambiente: cfg.arca_ambiente || 'homologacion',
    });

    // Guardar CAE en la venta
    await run(
      `UPDATE ventas SET cae=?, cae_vto=?, nro_comprobante=?, tipo_comprobante=? WHERE id=?`,
      [cae, caeVto, nroComprobante, tipoCbte, venta_id]
    );

    registrarAuditoria(
      req.user?.email || 'sistema',
      'ARCA_FACTURAR',
      `Venta #${venta_id} → ${TIPOS_COMPROBANTE[tipoCbte]} #${nroComprobante} | CAE: ${cae}`
    );

    logger.info('ARCA: comprobante emitido', { venta_id, tipoCbte, nroComprobante, cae });

    res.json({
      ok: true,
      cae,
      cae_vto: caeVto,
      nro_comprobante: nroComprobante,
      tipo_comprobante: tipoCbte,
      tipo_nombre: TIPOS_COMPROBANTE[tipoCbte] || String(tipoCbte),
      punto_venta: Number(cfg.arca_punto_venta),
    });
  } catch(e) {
    logger.error('ARCA facturar error', { error: e.message, venta_id });
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/arca/comprobante/:ventaId ───────────────────
router.get('/comprobante/:ventaId', requireAuth, async (req, res) => {
  try {
    const venta = await get(
      `SELECT id, total, cae, cae_vto, nro_comprobante, tipo_comprobante,
              fecha, usuario, cliente_id
       FROM ventas WHERE id = ?`,
      [req.params.ventaId]
    );
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const cfg = await getArcaCfg();
    res.json({
      ...venta,
      tipo_nombre: TIPOS_COMPROBANTE[venta.tipo_comprobante] || null,
      punto_venta: cfg.arca_punto_venta ? Number(cfg.arca_punto_venta) : null,
      cuit_emisor: cfg.arca_cuit || null,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

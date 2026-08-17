import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import fetch from 'node-fetch';
import QRCode from 'qrcode';
import { db } from '../db.js';
import logger from '../utils/logger.js';

const router = Router();
const MP_API = 'https://api.mercadopago.com';

function getConfig() {
  return new Promise((res, rej) => {
    db.all('SELECT clave, valor FROM configuracion', [], (e, rows) =>
      e ? rej(e) : res(Object.fromEntries(rows.map(r => [r.clave, r.valor])))
    );
  });
}

function saveConfig(clave, valor) {
  return new Promise((res, rej) => {
    db.run(
      `INSERT INTO configuracion (clave, valor, actualizado_en)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, actualizado_en=excluded.actualizado_en`,
      [clave, valor],
      e => e ? rej(e) : res()
    );
  });
}

// Obtiene la caja (POS) de MP para QR interoperable Transferencias 3.0.
// Busca la caja "sgppos{userId}" (creada por el sistema). Si no existe, crea una nueva
// reutilizando la tienda del primer POS existente en la cuenta.
async function ensureInStorePOS(token) {
  const cfg = await getConfig();

  if (cfg.mp_user_id && cfg.mp_pos_ext_id && cfg.mp_pos_qr) {
    return { userId: cfg.mp_user_id, posExtId: cfg.mp_pos_ext_id, posQr: cfg.mp_pos_qr };
  }

  // Obtener ID del usuario
  const meRes = await fetch(`${MP_API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meRes.ok) throw new Error('No se pudo obtener el ID de usuario de Mercado Pago.');
  const me = await meRes.json();
  const userId = String(me.id);
  const targetExtId = `sgppos${userId}`;

  // Listar todos los POS de la cuenta
  const listRes = await fetch(`${MP_API}/pos?limit=20`, { headers: { Authorization: `Bearer ${token}` } });
  const listData = await listRes.json();
  const posList = listData?.results || [];
  logger.info('MP ensureInStorePOS: cajas encontradas', { count: posList.length, ids: posList.map(p => p.id) });

  // Buscar nuestra caja por external_id
  const myPosInList = posList.find(p => p.external_id === targetExtId);

  if (myPosInList) {
    // Obtener detalles completos para el qr_code
    const detailRes = await fetch(`${MP_API}/pos/${myPosInList.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const detail = await detailRes.json();
    const posQr = detail.qr_code;
    if (!posQr) throw new Error('La caja no tiene QR. Verificá en mercadopago.com.ar → Tu negocio → Código QR.');
    logger.info('MP: caja existente encontrada', { posId: myPosInList.id, posExtId: targetExtId });
    await saveConfig('mp_user_id',    userId);
    await saveConfig('mp_pos_ext_id', targetExtId);
    await saveConfig('mp_pos_qr',     posQr);
    return { userId, posExtId: targetExtId, posQr };
  }

  // No encontramos nuestra caja → usar store_id del primer POS existente para crear una nueva
  let storeId = null;
  if (posList.length > 0) {
    const firstDetail = await (await fetch(`${MP_API}/pos/${posList[0].id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    storeId = firstDetail.store_id;
    logger.info('MP: usando store_id del POS existente', { storeId });
  }

  if (!storeId) {
    throw new Error('No se encontró ninguna tienda en tu cuenta. Creá un punto de venta en mercadopago.com.ar → Tu negocio → Código QR y volvé a intentar.');
  }

  // Crear nueva caja con external_id y fixed_amount: true
  const createRes = await fetch(`${MP_API}/pos`, {
    method: 'POST',
    headers: {
      Authorization:       `Bearer ${token}`,
      'Content-Type':      'application/json',
      'X-Idempotency-Key': targetExtId,
    },
    body: JSON.stringify({
      name:         'Sistema Gestion',
      store_id:     storeId,
      external_id:  targetExtId,
      fixed_amount: true,
    }),
  });
  const newPos = await createRes.json();
  logger.info('MP: crear caja', { status: createRes.status, response: JSON.stringify(newPos).slice(0, 200) });
  if (!createRes.ok) {
    throw new Error(`POS_ERROR ${createRes.status}: ${newPos.message || JSON.stringify(newPos)}`);
  }

  const posQr = newPos.qr_code;
  if (!posQr) throw new Error('La caja nueva no tiene QR. Verificá en mercadopago.com.ar → Tu negocio → Código QR.');

  await saveConfig('mp_user_id',    userId);
  await saveConfig('mp_pos_ext_id', targetExtId);
  await saveConfig('mp_pos_qr',     posQr);
  logger.info('MP: caja nueva creada', { posId: newPos.id, posExtId: targetExtId });

  return { userId, posExtId: targetExtId, posQr };
}

// GET /api/mercadopago/config-estado
router.get('/config-estado', requireAuth, async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json({
      configurado: !!cfg.mp_access_token,
      alias: cfg.mp_alias || '',
      cvu:   cfg.mp_cvu   || '',
    });
  } catch (e) {
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// POST /api/mercadopago/config — guarda Access Token + alias + CVU
router.post('/config', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const token = (req.body?.access_token || '').trim();
    const alias = (req.body?.alias || '').trim();
    const cvu   = (req.body?.cvu   || '').trim();

    if (!token) return res.status(400).json({ error: 'TOKEN_REQUERIDO' });

    const check = await fetch(`${MP_API}/v1/payment_methods`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!check.ok) {
      return res.status(400).json({ error: 'TOKEN_INVALIDO', message: 'El Access Token no es válido. Verificá que sea el token de producción.' });
    }

    await saveConfig('mp_access_token', token);
    // Limpiar cache de caja para que se reconfigure con el nuevo token
    await saveConfig('mp_user_id',    '');
    await saveConfig('mp_pos_ext_id', '');
    await saveConfig('mp_pos_qr',     '');

    if (alias) await saveConfig('mp_alias', alias);
    if (cvu)   await saveConfig('mp_cvu',   cvu);
    logger.info('Mercado Pago configurado');
    res.json({ ok: true });
  } catch (e) {
    logger.error('Error guardando MP config', { error: e.message });
    res.status(500).json({ error: 'CONFIG_ERROR', message: e.message });
  }
});

// POST /api/mercadopago/preferencia — crea orden in-store (Transferencias 3.0); fallback a wallet_purchase
router.post('/preferencia', requireAuth, async (req, res) => {
  try {
    const cfg = await getConfig();
    if (!cfg.mp_access_token) {
      return res.status(400).json({ error: 'MP_NO_CONFIGURADO', message: 'Configurá el Access Token de Mercado Pago en Configuración.' });
    }

    const { monto, descripcion, referencia } = req.body || {};
    if (!monto || monto <= 0) return res.status(400).json({ error: 'MONTO_INVALIDO' });

    const externalRef = referencia || `sgp${Date.now()}`;
    const titulo  = descripcion || 'Venta';
    const montoNum = Number(monto);

    // ── Intento 1: QR in-store Transferencias 3.0 (todas las billeteras) ──
    let instoreError = null;
    try {
      const { userId, posExtId, posQr } = await ensureInStorePOS(cfg.mp_access_token);

      const orderBody = {
        external_reference: externalRef,
        title:              titulo,
        description:        titulo,
        total_amount:       montoNum,
        items: [{
          sku_number:   'VENTA',
          category:     'marketplace',
          title:        titulo,
          description:  titulo,
          unit_price:   montoNum,
          quantity:     1,
          unit_measure: 'unit',
          total_amount: montoNum,
        }],
      };

      const orderRes = await fetch(
        `${MP_API}/instore/qr/seller/collectors/${userId}/pos/${posExtId}/orders`,
        {
          method:  'PUT',
          headers: {
            Authorization:       `Bearer ${cfg.mp_access_token}`,
            'Content-Type':      'application/json',
            'X-Idempotency-Key': externalRef,
          },
          body: JSON.stringify(orderBody),
        }
      );

      if (orderRes.status === 204 || orderRes.ok) {
        // Esperar propagación interbancaria (Coelsa/Transferencias 3.0)
        await new Promise(r => setTimeout(r, 2000));
        const qrDataURL = await QRCode.toDataURL(posQr, {
          width: 400, margin: 2,
          color: { dark: '#0d1b2a', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        logger.info('MP QR in-store generado', { externalRef, posExtId });
        return res.json({ ok: true, externalRef, qr: qrDataURL, modo: 'instore' });
      }

      const orderErr = await orderRes.json().catch(() => ({}));
      instoreError = `ORDER_ERROR ${orderRes.status}: ${orderErr.message || JSON.stringify(orderErr)}`;
      logger.warn('MP in-store orden falló, fallback a wallet_purchase', { error: instoreError });
    } catch (inStoreErr) {
      instoreError = inStoreErr.message;
      logger.warn('MP in-store setup falló, fallback a wallet_purchase', { error: instoreError });
    }

    // ── Intento 2: wallet_purchase (solo app Mercado Pago) ──
    const prefBody = {
      items: [{ title: titulo, quantity: 1, unit_price: montoNum, currency_id: 'ARS' }],
      external_reference: externalRef,
      purpose: 'wallet_purchase',
      expires: true,
      expiration_date_to: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const prefRes = await fetch(`${MP_API}/checkout/preferences`, {
      method:  'POST',
      headers: {
        Authorization:       `Bearer ${cfg.mp_access_token}`,
        'Content-Type':      'application/json',
        'X-Idempotency-Key': externalRef,
      },
      body: JSON.stringify(prefBody),
    });

    const pref = await prefRes.json();
    if (!prefRes.ok) {
      return res.status(500).json({ error: 'MP_ERROR', message: pref.message || 'Error al crear el cobro en Mercado Pago.' });
    }

    const qrDataURL = await QRCode.toDataURL(pref.init_point, {
      width: 300, margin: 2,
      color: { dark: '#0d1b2a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    logger.info('MP QR wallet_purchase generado', { externalRef, instoreError });
    res.json({ ok: true, externalRef, qr: qrDataURL, modo: 'wallet', instoreError });
  } catch (e) {
    logger.error('Error generando QR MP', { error: e.message });
    res.status(500).json({ error: 'QR_ERROR', message: e.message });
  }
});

// GET /api/mercadopago/estado/:externalRef — verifica si el pago fue acreditado
router.get('/estado/:externalRef', requireAuth, async (req, res) => {
  try {
    const cfg = await getConfig();
    if (!cfg.mp_access_token) return res.status(400).json({ error: 'MP_NO_CONFIGURADO' });

    const { externalRef } = req.params;
    const mpRes = await fetch(
      `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}&status=approved&limit=1`,
      { headers: { Authorization: `Bearer ${cfg.mp_access_token}` } }
    );

    const data = await mpRes.json();
    const pagos = data?.results || [];
    const aprobado = pagos.some(p => p.status === 'approved');

    res.json({ pagado: aprobado, pago: aprobado ? pagos[0] : null });
  } catch (e) {
    res.status(500).json({ error: 'ESTADO_ERROR', message: e.message });
  }
});

// DELETE /api/mercadopago/cancelar — elimina la orden pendiente de la caja
router.delete('/cancelar', requireAuth, async (_req, res) => {
  try {
    const cfg = await getConfig();
    if (cfg.mp_access_token && cfg.mp_user_id && cfg.mp_pos_ext_id) {
      await fetch(
        `${MP_API}/instore/qr/seller/collectors/${cfg.mp_user_id}/pos/${cfg.mp_pos_ext_id}/orders`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${cfg.mp_access_token}` } }
      );
    }
  } catch {}
  res.json({ ok: true });
});

export default router;

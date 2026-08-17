import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import logger from '../utils/logger.js';

const router = Router();

function getConfig() {
  return new Promise((res, rej) =>
    db.all('SELECT clave, valor FROM configuracion', [], (e, rows) =>
      e ? rej(e) : res(Object.fromEntries(rows.map(r => [r.clave, r.valor])))
    )
  );
}
function setConfig(clave, valor) {
  return new Promise((res, rej) =>
    db.run(
      `INSERT INTO configuracion (clave, valor, actualizado_en)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, actualizado_en=excluded.actualizado_en`,
      [clave, valor],
      e => e ? rej(e) : res()
    )
  );
}

// GET /api/sistema/setup-status — sin auth, para Electron
router.get('/setup-status', async (_req, res) => {
  try {
    const cfg = await getConfig();
    const configurado = !!(cfg.empresa_nombre && cfg.empresa_nombre.trim());
    res.json({ configurado });
  } catch (e) {
    res.json({ configurado: true }); // si falla, no bloquear
  }
});

// POST /api/sistema/setup — primer inicio, sin auth
router.post('/setup', async (req, res) => {
  try {
    // Solo funciona si aún no está configurado
    const cfg = await getConfig();
    if (cfg.empresa_nombre && cfg.empresa_nombre.trim()) {
      return res.status(400).json({ error: 'YA_CONFIGURADO' });
    }

    const {
      empresa_nombre, empresa_direccion, empresa_cuit, empresa_telefono,
      admin_nombre, admin_email, admin_password,
    } = req.body || {};

    if (!empresa_nombre?.trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
    if (!admin_email?.trim())   return res.status(400).json({ error: 'EMAIL_REQUERIDO' });
    if (!admin_password || admin_password.length < 6)
      return res.status(400).json({ error: 'PASSWORD_CORTA', message: 'La contraseña debe tener al menos 6 caracteres.' });

    // Guardar datos del negocio
    await setConfig('empresa_nombre',    empresa_nombre.trim());
    await setConfig('empresa_direccion', (empresa_direccion || '').trim());
    await setConfig('empresa_cuit',      (empresa_cuit || '').trim());
    await setConfig('empresa_telefono',  (empresa_telefono || '').trim());

    // Actualizar el usuario admin por defecto
    const hash = await bcrypt.hash(admin_password, 10);
    await new Promise((resolve, reject) =>
      db.run(
        `UPDATE usuarios SET nombre=?, email=?, password_hash=? WHERE id = (SELECT id FROM usuarios WHERE rol='admin' ORDER BY id LIMIT 1)`,
        [(admin_nombre || admin_email).trim(), admin_email.trim().toLowerCase(), hash],
        e => e ? reject(e) : resolve()
      )
    );

    logger.info('Primer inicio completado', { empresa: empresa_nombre, email: admin_email });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Error en setup inicial', { error: e.message });
    res.status(500).json({ error: 'SETUP_ERROR', message: e.message });
  }
});

// DELETE /api/sistema/cancelar-mp-local — solo desde localhost, sin auth
router.delete('/cancelar-mp-local', async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip)) {
    return res.status(403).json({ error: 'FORBID' });
  }
  try {
    const cfg = await getConfig();
    if (cfg.mp_access_token && cfg.mp_user_id && cfg.mp_pos_ext_id) {
      const fetch = (await import('node-fetch')).default;
      await fetch(
        `https://api.mercadopago.com/instore/qr/seller/collectors/${cfg.mp_user_id}/pos/${cfg.mp_pos_ext_id}/orders`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${cfg.mp_access_token}` } }
      ).catch(() => {});
    }
  } catch {}
  res.json({ ok: true });
});

export default router;

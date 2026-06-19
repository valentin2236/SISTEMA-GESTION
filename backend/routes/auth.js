import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import logger from '../utils/logger.js';
import { isValidPassword } from '../utils/validate.js';

const router = Router();

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'EMAIL_PASSWORD_REQUERIDOS' });
    }

    const user = await get(
      `SELECT * FROM usuarios WHERE email = ? AND activo = 1`,
      [email]
    );

    if (!user) {
      logger.warn('Login fallido: usuario no encontrado', { email });
      registrarAuditoria(email, 'LOGIN_FALLIDO', 'Usuario no encontrado');
      return res.status(401).json({ error: 'CREDENCIALES_INVALIDAS' });
    }

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      logger.warn('Login fallido: contraseña incorrecta', { email });
      registrarAuditoria(email, 'LOGIN_FALLIDO', 'Contraseña incorrecta');
      return res.status(401).json({ error: 'CREDENCIALES_INVALIDAS' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'JWT_SECRET_NO_CONFIGURADO' });
    }

    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre,
    };

    const token = jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2d',
    });

    registrarAuditoria(user.email, 'LOGIN', 'Inicio de sesión exitoso');
    logger.info('Login exitoso', { email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
    });
  } catch (e) {
    logger.error('Error en login', { error: e.message });
    res.status(500).json({ error: 'AUTH_ERROR' });
  }
});

// POST /api/auth/cambiar-password
router.post('/cambiar-password', requireAuth, async (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body || {};

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: 'CAMPOS_REQUERIDOS', message: 'Se requiere contraseña actual y nueva.' });
    }

    if (!isValidPassword(password_nueva)) {
      return res.status(400).json({ error: 'PASSWORD_DEBIL', message: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const user = await get(`SELECT * FROM usuarios WHERE id = ? AND activo = 1`, [req.user.sub]);
    if (!user) {
      return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    }

    const ok = await bcrypt.compare(password_actual, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'PASSWORD_INCORRECTA', message: 'La contraseña actual es incorrecta.' });
    }

    const hash = await bcrypt.hash(password_nueva, 10);
    await run(`UPDATE usuarios SET password_hash = ? WHERE id = ?`, [hash, req.user.sub]);

    registrarAuditoria(req.user.email, 'CAMBIAR_PASSWORD', 'Contraseña actualizada');
    logger.info('Contraseña cambiada', { email: req.user.email });

    res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });
  } catch (e) {
    logger.error('Error cambiando contraseña', { error: e.message });
    res.status(500).json({ error: 'AUTH_ERROR' });
  }
});

// POST /api/auth/reset-password (admin resetea la password de otro usuario)
router.post('/reset-password', requireAuth, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'ROL_INSUFICIENTE' });
    }

    const { usuario_id, password_nueva } = req.body || {};

    if (!usuario_id || !password_nueva) {
      return res.status(400).json({ error: 'CAMPOS_REQUERIDOS' });
    }

    if (!isValidPassword(password_nueva)) {
      return res.status(400).json({ error: 'PASSWORD_DEBIL', message: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const user = await get(`SELECT id, email FROM usuarios WHERE id = ?`, [usuario_id]);
    if (!user) {
      return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    }

    const hash = await bcrypt.hash(password_nueva, 10);
    await run(`UPDATE usuarios SET password_hash = ? WHERE id = ?`, [hash, usuario_id]);

    registrarAuditoria(req.user.email, 'RESET_PASSWORD', `Reset password de ${user.email}`);
    logger.info('Password reseteada por admin', { admin: req.user.email, target: user.email });

    res.json({ ok: true, message: 'Contraseña reseteada correctamente.' });
  } catch (e) {
    logger.error('Error reseteando contraseña', { error: e.message });
    res.status(500).json({ error: 'AUTH_ERROR' });
  }
});

// GET /api/auth/me — perfil del usuario autenticado
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await get(
      `SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = ? AND activo = 1`,
      [req.user.sub]
    );
    if (!user) return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: 'AUTH_ERROR' });
  }
});

export default router;

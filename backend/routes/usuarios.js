import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { validateUsuario } from '../utils/validate.js';
import logger from '../utils/logger.js';

const router = Router();

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// LISTAR
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const usuarios = await all(`
      SELECT id, nombre, email, rol, activo, creado_en
      FROM usuarios
      ORDER BY nombre
    `);
    res.json(usuarios);
  } catch (e) {
    logger.error('Error listando usuarios', { error: e.message });
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// CREAR
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { nombre, email, password, rol = 'vendedor' } = req.body;

    const errors = validateUsuario(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'VALIDACION', detalles: errors });
    }

    const existe = await get(`SELECT id FROM usuarios WHERE email = ?`, [email]);
    if (existe) {
      return res.status(409).json({ error: 'EMAIL_DUPLICADO', message: 'Ya existe un usuario con ese email.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const r = await run(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES (?, ?, ?, ?, 1)`,
      [nombre.trim(), email.trim(), hash, rol]
    );

    registrarAuditoria(req.user.email, 'CREAR_USUARIO', email);
    logger.info('Usuario creado', { admin: req.user.email, newUser: email });

    res.status(201).json({ id: r.lastID });
  } catch (e) {
    logger.error('Error creando usuario', { error: e.message });
    if (e?.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'EMAIL_DUPLICADO' });
    }
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// EDITAR
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { nombre, email, rol } = req.body;

    const errors = validateUsuario(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'VALIDACION', detalles: errors });
    }

    const existe = await get(`SELECT id FROM usuarios WHERE id = ?`, [req.params.id]);
    if (!existe) {
      return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    }

    await run(
      `UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?`,
      [nombre.trim(), email.trim(), rol, req.params.id]
    );

    registrarAuditoria(req.user.email, 'EDITAR_USUARIO', email);
    res.json({ ok: true });
  } catch (e) {
    logger.error('Error editando usuario', { error: e.message });
    if (e?.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'EMAIL_DUPLICADO' });
    }
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// DESACTIVAR
router.patch('/:id/desactivar', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const user = await get(`SELECT id, email FROM usuarios WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });

    if (user.id === req.user.sub) {
      return res.status(400).json({ error: 'NO_AUTO_DESACTIVAR', message: 'No podés desactivarte a vos mismo.' });
    }

    await run(`UPDATE usuarios SET activo = 0 WHERE id = ?`, [req.params.id]);
    registrarAuditoria(req.user.email, 'DESACTIVAR_USUARIO', `${user.email} (ID ${req.params.id})`);
    res.json({ ok: true });
  } catch (e) {
    logger.error('Error desactivando usuario', { error: e.message });
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// REACTIVAR
router.patch('/:id/reactivar', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const user = await get(`SELECT id, email FROM usuarios WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });

    await run(`UPDATE usuarios SET activo = 1 WHERE id = ?`, [req.params.id]);
    registrarAuditoria(req.user.email, 'REACTIVAR_USUARIO', `${user.email} (ID ${req.params.id})`);
    res.json({ ok: true });
  } catch (e) {
    logger.error('Error reactivando usuario', { error: e.message });
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

export default router;

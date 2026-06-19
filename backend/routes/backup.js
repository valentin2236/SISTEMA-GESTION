import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data.sqlite');
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

const router = Router();

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// POST /api/backup — crear backup
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.sqlite`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    fs.copyFileSync(DB_PATH, backupPath);

    const stats = fs.statSync(backupPath);

    registrarAuditoria(req.user.email, 'BACKUP_CREAR', backupName);
    logger.info(`Backup creado: ${backupName}`, { user: req.user.email });

    res.json({
      ok: true,
      nombre: backupName,
      tamaño: stats.size,
      fecha: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('Error creando backup', { error: e.message });
    res.status(500).json({ error: 'BACKUP_ERROR', message: e.message });
  }
});

// GET /api/backup — listar backups
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          nombre: f,
          tamaño: stats.size,
          fecha: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(files);
  } catch (e) {
    logger.error('Error listando backups', { error: e.message });
    res.status(500).json({ error: 'BACKUP_ERROR', message: e.message });
  }
});

// GET /api/backup/descargar/:nombre — descargar backup
router.get('/descargar/:nombre', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const nombre = path.basename(req.params.nombre);
    const filePath = path.join(BACKUP_DIR, nombre);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'BACKUP_NO_ENCONTRADO' });
    }

    registrarAuditoria(req.user.email, 'BACKUP_DESCARGAR', nombre);
    res.download(filePath, nombre);
  } catch (e) {
    logger.error('Error descargando backup', { error: e.message });
    res.status(500).json({ error: 'BACKUP_ERROR', message: e.message });
  }
});

// POST /api/backup/restaurar/:nombre — restaurar backup
router.post('/restaurar/:nombre', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const nombre = path.basename(req.params.nombre);
    const backupPath = path.join(BACKUP_DIR, nombre);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'BACKUP_NO_ENCONTRADO' });
    }

    ensureBackupDir();
    const preRestoreName = `pre-restauracion-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, preRestoreName));

    fs.copyFileSync(backupPath, DB_PATH);

    registrarAuditoria(req.user.email, 'BACKUP_RESTAURAR', `${nombre} (pre-restore: ${preRestoreName})`);
    logger.warn(`Base de datos restaurada desde ${nombre}`, { user: req.user.email });

    res.json({
      ok: true,
      mensaje: 'Base de datos restaurada. Reiniciá el servidor para aplicar los cambios.',
      backup_previo: preRestoreName,
    });
  } catch (e) {
    logger.error('Error restaurando backup', { error: e.message });
    res.status(500).json({ error: 'BACKUP_ERROR', message: e.message });
  }
});

// DELETE /api/backup/:nombre — eliminar backup
router.delete('/:nombre', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const nombre = path.basename(req.params.nombre);
    const filePath = path.join(BACKUP_DIR, nombre);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'BACKUP_NO_ENCONTRADO' });
    }

    fs.unlinkSync(filePath);
    registrarAuditoria(req.user.email, 'BACKUP_ELIMINAR', nombre);

    res.json({ ok: true });
  } catch (e) {
    logger.error('Error eliminando backup', { error: e.message });
    res.status(500).json({ error: 'BACKUP_ERROR', message: e.message });
  }
});

export default router;

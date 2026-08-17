import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import {
  validateLicenseKey,
  saveLicenseToFile,
  getLicenseStatus,
  getFeatures,
  generateMachineId,
} from '../utils/licencia.js';
import logger from '../utils/logger.js';

const router = Router();

// GET /api/licencia/estado-publico — sin auth, para pantalla de bloqueo
router.get('/estado-publico', async (req, res) => {
  try {
    const status = getLicenseStatus();
    res.json({ ...status, machineId: generateMachineId() });
  } catch (e) {
    logger.error('Error estado-publico', { error: e.message });
    res.status(500).json({ error: 'LICENCIA_ERROR' });
  }
});

// POST /api/licencia/activar-publico — sin auth, para activar desde pantalla bloqueada
router.post('/activar-publico', async (req, res) => {
  try {
    const clave = (req.body?.clave || '').trim();
    if (!clave) return res.status(400).json({ error: 'CLAVE_REQUERIDA' });
    const result = validateLicenseKey(clave);
    if (!result.valid) return res.status(400).json({ error: 'LICENCIA_INVALIDA', message: result.error });
    saveLicenseToFile(clave);
    logger.info('Licencia activada desde pantalla pública', { plan: result.plan });
    res.json({ ok: true, plan: result.plan, expiry: result.expiry, diasRestantes: result.diasRestantes });
  } catch (e) {
    logger.error('Error activando licencia pública', { error: e.message });
    res.status(500).json({ error: 'LICENCIA_ERROR', message: e.message });
  }
});

// GET /api/licencia — estado actual
router.get('/', requireAuth, async (req, res) => {
  try {
    const status = getLicenseStatus();
    res.json(status);
  } catch (e) {
    logger.error('Error obteniendo licencia', { error: e.message });
    res.status(500).json({ error: 'LICENCIA_ERROR' });
  }
});

// POST /api/licencia/activar — activar licencia
router.post('/activar', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const clave = (req.body?.clave || '').trim();
    if (!clave) {
      return res.status(400).json({ error: 'CLAVE_REQUERIDA' });
    }

    const result = validateLicenseKey(clave);

    if (!result.valid) {
      try { registrarAuditoria(req.user.email, 'LICENCIA_FALLIDA', result.error); } catch {}
      return res.status(400).json({
        error: 'LICENCIA_INVALIDA',
        message: result.error,
      });
    }

    try {
      saveLicenseToFile(clave);
    } catch (writeErr) {
      logger.error('Error guardando archivo de licencia', { error: writeErr.message });
      return res.status(500).json({
        error: 'LICENCIA_ERROR',
        message: 'No se pudo guardar la licencia en disco. Verificá permisos de escritura.',
      });
    }

    try { registrarAuditoria(req.user.email, 'LICENCIA_ACTIVADA', `Plan: ${result.plan}, Expira: ${result.expiry}`); } catch {}
    logger.info('Licencia activada', { plan: result.plan, user: req.user.email });

    res.json({
      ok: true,
      plan: result.plan,
      expiry: result.expiry,
      diasRestantes: result.diasRestantes,
    });
  } catch (e) {
    logger.error('Error activando licencia', { error: e.message, stack: e.stack });
    res.status(500).json({ error: 'LICENCIA_ERROR', message: e.message });
  }
});

// GET /api/licencia/features — qué features tiene disponible el plan actual
router.get('/features', requireAuth, (req, res) => {
  try {
    const data = getFeatures();
    res.json(data);
  } catch (e) {
    logger.error('Error obteniendo features', { error: e.message });
    res.status(500).json({ error: 'LICENCIA_ERROR' });
  }
});

export default router;

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import {
  validateLicenseKey,
  saveLicenseToFile,
  getLicenseStatus,
  getFeatures,
} from '../utils/licencia.js';
import logger from '../utils/logger.js';

const router = Router();

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
    const { clave } = req.body;
    if (!clave) {
      return res.status(400).json({ error: 'CLAVE_REQUERIDA' });
    }

    const result = validateLicenseKey(clave);

    if (!result.valid) {
      registrarAuditoria(req.user.email, 'LICENCIA_FALLIDA', result.error);
      return res.status(400).json({
        error: 'LICENCIA_INVALIDA',
        message: result.error,
      });
    }

    saveLicenseToFile(clave);

    registrarAuditoria(req.user.email, 'LICENCIA_ACTIVADA', `Plan: ${result.plan}, Expira: ${result.expiry}`);
    logger.info('Licencia activada', { plan: result.plan, user: req.user.email });

    res.json({
      ok: true,
      plan: result.plan,
      expiry: result.expiry,
      diasRestantes: result.diasRestantes,
    });
  } catch (e) {
    logger.error('Error activando licencia', { error: e.message });
    res.status(500).json({ error: 'LICENCIA_ERROR' });
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

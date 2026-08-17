import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLicensePath() {
  if (process.versions.electron && process.type !== undefined) {
    const userDataPath = process.env.APPDATA || path.join(process.env.HOME || '', '.config');
    const appDir = path.join(userDataPath, 'sistema-gestion-pro');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
    return path.join(appDir, 'license.key');
  }
  return path.join(__dirname, '..', '..', 'license.key');
}

const LICENSE_FILE = getLicensePath();
const SECRET = 'SGP-2024-LICENCIA-SECRETA';
const TRIAL_DAYS = 7;

function getTrialPath() {
  if (process.versions.electron && process.type !== undefined) {
    const userDataPath = process.env.APPDATA || path.join(process.env.HOME || '', '.config');
    const appDir = path.join(userDataPath, 'sistema-gestion-pro');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
    return path.join(appDir, 'trial.json');
  }
  return path.join(__dirname, '..', '..', 'trial.json');
}

export function getTrialInfo() {
  const trialPath = getTrialPath();
  try {
    let data;
    if (!fs.existsSync(trialPath)) {
      data = { startDate: new Date().toISOString() };
      fs.writeFileSync(trialPath, JSON.stringify(data), 'utf8');
    } else {
      data = JSON.parse(fs.readFileSync(trialPath, 'utf8'));
    }
    const elapsed = Math.floor((Date.now() - new Date(data.startDate).getTime()) / 86400000);
    const remaining = Math.max(0, TRIAL_DAYS - elapsed);
    return { startDate: data.startDate, daysElapsed: elapsed, daysRemaining: remaining, expired: elapsed >= TRIAL_DAYS };
  } catch {
    return { startDate: new Date().toISOString(), daysElapsed: 0, daysRemaining: TRIAL_DAYS, expired: false };
  }
}

export function generateMachineId() {
  const data = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown',
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function generateLicenseKey(plan, diasValidos, machineId) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + diasValidos);

  const payload = {
    plan,
    machineId,
    expiry: expiry.toISOString(),
    createdAt: new Date().toISOString(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadB64)
    .digest('hex')
    .slice(0, 16);

  return `SGP-${payloadB64}-${signature}`;
}

export function validateLicenseKey(key) {
  try {
    if (!key || typeof key !== 'string') return { valid: false, error: 'Sin clave de licencia' };

    const parts = key.split('-');
    if (parts.length < 3 || parts[0] !== 'SGP') {
      return { valid: false, error: 'Formato de licencia inválido' };
    }

    const payloadB64 = parts.slice(1, -1).join('-');
    const providedSig = parts[parts.length - 1];

    const expectedSig = crypto
      .createHmac('sha256', SECRET)
      .update(payloadB64)
      .digest('hex')
      .slice(0, 16);

    if (providedSig !== expectedSig) {
      return { valid: false, error: 'Licencia inválida (firma incorrecta)' };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Verificar que la licencia corresponde a esta PC
    if (payload.machineId) {
      const currentId = generateMachineId();
      if (payload.machineId !== currentId) {
        return { valid: false, error: 'Esta licencia fue generada para otra PC.' };
      }
    }

    const expiry = new Date(payload.expiry);

    if (expiry < new Date()) {
      return {
        valid: false,
        error: 'Licencia expirada',
        plan: payload.plan,
        expiry: payload.expiry,
      };
    }

    return {
      valid: true,
      plan: payload.plan,
      expiry: payload.expiry,
      diasRestantes: Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)),
    };
  } catch {
    return { valid: false, error: 'Error validando licencia' };
  }
}

export function getLicenseFromFile() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    return fs.readFileSync(LICENSE_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

export function saveLicenseToFile(key) {
  fs.writeFileSync(LICENSE_FILE, key, 'utf8');
  logger.info('Licencia guardada');
}

export function getLicenseStatus() {
  const key = getLicenseFromFile();
  if (!key) {
    const trial = getTrialInfo();
    return {
      activa: false,
      plan: 'trial',
      trial: true,
      trialExpired: trial.expired,
      diasRestantes: trial.daysRemaining,
      mensaje: trial.expired
        ? 'El período de prueba de 7 días ha vencido.'
        : `Modo de prueba. Quedan ${trial.daysRemaining} día(s).`,
    };
  }
  const result = validateLicenseKey(key);
  return {
    activa: result.valid,
    plan: result.plan || 'trial',
    trial: false,
    trialExpired: false,
    expiry: result.expiry,
    diasRestantes: result.diasRestantes,
    error: result.error,
  };
}

// ══════════════════════════════════════════════
// FEATURES POR PLAN
// ══════════════════════════════════════════════

const PLAN_FEATURES = {
  trial: [
    'pos',
    'productos',
    'caja',
    'clientes',
  ],
  basico: [
    'pos',
    'productos',
    'caja',
    'clientes',
    'inventario',
    'backup',
  ],
  pro: [
    'pos',
    'productos',
    'caja',
    'clientes',
    'inventario',
    'backup',
    'reportes',
    'ganancias',
    'compras',
    'proveedores',
    'exportar',
  ],
  ultra: [
    'pos',
    'productos',
    'caja',
    'clientes',
    'inventario',
    'backup',
    'reportes',
    'ganancias',
    'compras',
    'proveedores',
    'exportar',
    'auditoria',
    'ia',
    'multi_usuario',
    'mercadopago',
    'multicajero',
  ],
};

export function getFeatures() {
  const status = getLicenseStatus();

  // Licencia activa → plan contratado
  if (status.activa) {
    return {
      plan: status.plan,
      activa: true,
      trial: false,
      trialExpired: false,
      expiry: status.expiry,
      diasRestantes: status.diasRestantes,
      features: PLAN_FEATURES[status.plan] || PLAN_FEATURES.basico,
    };
  }

  // Trial activo (no expirado) → Ultra completo
  if (status.trial && !status.trialExpired) {
    return {
      plan: 'ultra',
      activa: false,
      trial: true,
      trialExpired: false,
      diasRestantes: status.diasRestantes,
      features: PLAN_FEATURES.ultra,
    };
  }

  // Trial expirado → sin acceso
  return {
    plan: 'trial',
    activa: false,
    trial: true,
    trialExpired: true,
    diasRestantes: 0,
    features: [],
  };
}

export function hasFeature(feature) {
  const { features } = getFeatures();
  return features.includes(feature);
}

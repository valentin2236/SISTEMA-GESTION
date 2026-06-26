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
    return {
      activa: false,
      plan: 'trial',
      mensaje: 'Sin licencia. Funcionando en modo de prueba.',
    };
  }
  const result = validateLicenseKey(key);
  return {
    activa: result.valid,
    plan: result.plan || 'trial',
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
  ],
};

export function getFeatures() {
  const status = getLicenseStatus();
  const plan = status.activa ? status.plan : 'trial';
  return {
    plan,
    activa: status.activa,
    expiry: status.expiry,
    diasRestantes: status.diasRestantes,
    features: PLAN_FEATURES[plan] || PLAN_FEATURES.trial,
  };
}

export function hasFeature(feature) {
  const { features } = getFeatures();
  return features.includes(feature);
}

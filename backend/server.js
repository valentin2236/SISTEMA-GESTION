import 'dotenv/config';
if (!globalThis.fetch) {
  const mod = await import('node-fetch');
  globalThis.fetch = mod.default;
}
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

import {
  db,
  runMigrations,
  ensureSalesColumns,
  ensureClientColumns,
  ensureStockTables,
  ensureProductColumns,
  ensureVentaItemsCosto,
  ensureVentaItemsLibre,
  ensureVentasArcaColumns,
} from './db.js';

import logger from './utils/logger.js';
import { helmetMiddleware, globalLimiter, sanitizeBody } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireFeature } from './middleware/licencia.js';

// Rutas
import productosRoutes from './routes/productos.js';
import barcodeRoutes from './routes/barcodes.js';
import inventarioRoutes from './routes/inventario.js';
import proveedoresRoutes from './routes/proveedores.js';
import notificacionesRoutes from './routes/notificaciones.js';
import comprasRoutes from './routes/compras.js';
import ventasRoutes from './routes/ventas.js';
import auditoriaRouter from './routes/auditoria.js';
import usuariosRoutes from './routes/usuarios.js';
import reportesRoutes from './routes/reportes.js';
import cajaRoutes from './routes/caja.js';
import configRoutes, { ensureConfigTable } from './routes/config.js';
import clientesRoutes from './routes/clientes.js';
import authRoutes from './routes/auth.js';
import pdfImportRoutes from './routes/pdf-import.js';
import backupRoutes from './routes/backup.js';
import licenciaRoutes from './routes/licencia.js';
import exportarRoutes from './routes/exportar.js';
import iaRoutes from './routes/ia.js';
import arcaRoutes from './routes/arca.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3847;

// ---------- Seguridad ----------
app.use(helmetMiddleware);
app.use(globalLimiter);

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3847,http://127.0.0.1:3847,http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origen no permitido por CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(sanitizeBody);

// ---------- Request logging ----------
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api/')) {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        user: req.user?.email || 'anonymous',
      });
    }
  });
  next();
});

// --- helpers sqlite promisificados ---
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

// --- seed admin si no existe ---
async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL || 'admin@demo.local';
  const pass = process.env.ADMIN_PASS || (process.env.NODE_ENV === 'production'
    ? (() => { logger.error('ADMIN_PASS no definido en producción.'); process.exit(1); })()
    : 'admin123');
  const name = process.env.ADMIN_NAME || 'Admin';

  const user = await get(`SELECT id FROM usuarios WHERE email = ?`, [email]);
  if (!user) {
    const hash = await bcrypt.hash(pass, 10);
    await run(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, creado_en) VALUES (?, ?, ?, 'admin', datetime('now'))`,
      [name, email, hash]
    );
    logger.info(`Admin creado: ${email}`);
  }
}

// ---------- Bootstrapping DB ----------
(async () => {
  try {
    await runMigrations();
    await ensureSalesColumns();
    await ensureClientColumns();
    await ensureStockTables();
    await ensureAdminUser();
    await ensureProductColumns();
    await ensureConfigTable();
    await ensureVentaItemsCosto();
    await ensureVentaItemsLibre();
    await ensureVentasArcaColumns();

    if (!process.env.JWT_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('JWT_SECRET no definido en producción.');
        process.exit(1);
      }
      logger.warn('JWT_SECRET no definido — usando fallback para desarrollo.');
      process.env.JWT_SECRET = 'dev-secret-change-me';
    }

    logger.info('Base de datos inicializada correctamente');
  } catch (e) {
    logger.error('Error inicializando DB', { error: e.message, stack: e.stack });
    process.exit(1);
  }
})();

// ---------- APIs ----------
// Sin restricción de plan (disponibles siempre)
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/config', configRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/licencia', licenciaRoutes);
app.use('/api/reportes', reportesRoutes);

// Restringidas por plan
app.use('/api/inventario', requireFeature('inventario'), inventarioRoutes);
app.use('/api/proveedores', requireFeature('proveedores'), proveedoresRoutes);
app.use('/api/compras', requireFeature('compras'), comprasRoutes);
app.use('/api/auditoria', requireFeature('auditoria'), auditoriaRouter);
app.use('/api/backup', requireFeature('backup'), backupRoutes);
app.use('/api/exportar', requireFeature('exportar'), exportarRoutes);
app.use('/api/pdf-import', requireFeature('ia'), pdfImportRoutes);
app.use('/api/ia', requireFeature('ia'), iaRoutes);
app.use('/api/arca', requireFeature('ia'), arcaRoutes);

// ---------- Static & Home ----------
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (_req, res) => res.redirect('/admin/dashboard.html'));

// ---------- Health ----------
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: process.env.npm_package_version || (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })(),
    uptime: Math.floor(process.uptime()),
  });
});

// ---------- Error handling ----------
app.use(notFoundHandler);
app.use(errorHandler);

// ---------- Proceso global ----------
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { error: String(reason) });
});

const server = app.listen(PORT, () => {
  logger.info(`Servidor corriendo en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.warn(`Puerto ${PORT} ocupado — otro servidor ya está corriendo. Usando el existente.`);
  } else {
    logger.error('Error del servidor', { error: err.message });
    process.exit(1);
  }
});

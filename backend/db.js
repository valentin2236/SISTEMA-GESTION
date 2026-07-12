// backend/db.js
 
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
 
sqlite3.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDBPath() {
  // En Electron empaquetado, guardar la BD en la carpeta de datos del usuario
  // (el ASAR es de solo lectura, no se puede escribir ahí)
  if (process.versions.electron && process.type !== undefined) {
    const userDataPath = process.env.APPDATA || path.join(process.env.HOME || '', '.config');
    const appDir = path.join(userDataPath, 'sistema-gestion-pro');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
    return path.join(appDir, 'data.sqlite');
  }
  return path.join(__dirname, "data.sqlite");
}

export const DB_PATH = getDBPath();
export const db = new sqlite3.Database(DB_PATH);
 
// ==============================
// CORE RUNNERS
// ==============================
 
function execSQL(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}
 
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}
 
// ==============================
// MIGRATIONS
// ==============================
 
export async function runMigrations() {
  const sqlPath = path.join(__dirname, "migrations.sql");
 
  const sql = fs.readFileSync(sqlPath, "utf8");
 
  await execSQL(sql);
}
 
// ==============================
// COLUMN HELPERS
// ==============================
 
async function colExists(table, column) {
  const rows = await all(`PRAGMA table_info(${table})`);
 
  return rows.some((r) => r.name === column);
}
 
async function addColumnIfMissing(table, column, type, defaultVal = null) {
  if (await colExists(table, column)) return;
 
  const def = defaultVal == null ? "" : ` DEFAULT ${defaultVal} `;
 
  await execSQL(`
    ALTER TABLE ${table}
    ADD COLUMN ${column} ${type}${def};
  `);
}
 
// ==============================
// ENSURE SALES COLUMNS
// ==============================
 
export async function ensureSalesColumns() {
  await addColumnIfMissing("ventas", "subtotal", "REAL", "0");
 
  await addColumnIfMissing("ventas", "descuento_tipo", "TEXT", `'monto'`);
 
  await addColumnIfMissing("ventas", "descuento_valor", "REAL", "0");
 
  await addColumnIfMissing("ventas", "medio_pago", "TEXT", `'efectivo'`);
 
  await addColumnIfMissing("ventas", "pagado", "REAL", "0");
 
  await addColumnIfMissing("ventas", "cambio", "REAL", "0");
 
  await addColumnIfMissing("ventas", "nota", "TEXT", `''`);
 
  // interés tarjeta
  await addColumnIfMissing("ventas", "recargo_porcentaje", "REAL", "0");
 
  await addColumnIfMissing("ventas", "recargo_monto", "REAL", "0");
 
  await addColumnIfMissing("ventas", "cliente_id", "INTEGER", null);
}
 
// ==============================
// ENSURE CLIENTES
// ==============================
 
export async function ensureClientColumns() {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE,
      telefono TEXT,
      dni TEXT UNIQUE,
      direccion TEXT,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME
    );
  `);
 
  await addColumnIfMissing("clientes", "email", "TEXT", null);
 
  await addColumnIfMissing("clientes", "telefono", "TEXT", null);
 
  await addColumnIfMissing("clientes", "dni", "TEXT", null);
 
  await addColumnIfMissing("clientes", "direccion", "TEXT", null);
 
  await addColumnIfMissing("clientes", "actualizado_en", "DATETIME", null);
 
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_clientes_nombre
    ON clientes(nombre);
  `);
 
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_clientes_email
    ON clientes(email);
  `);
 
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_clientes_dni
    ON clientes(dni);
  `);
}
 
// ==============================
// ENSURE MOVIMIENTOS STOCK
// ==============================
 
export async function ensureStockTables() {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS movimientos_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      stock_anterior INTEGER DEFAULT 0,
      stock_nuevo INTEGER DEFAULT 0,
      usuario TEXT,
      motivo TEXT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(producto_id)
      REFERENCES productos(id)
    );
  `);
 
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_mov_stock_producto
    ON movimientos_stock(producto_id);
  `);
 
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_mov_stock_fecha
    ON movimientos_stock(fecha);
  `);
}
 
// ==============================
// ENSURE PRODUCTOS
// ==============================
 
export async function ensureProductColumns() {
  await addColumnIfMissing("productos", "activo", "INTEGER", "1");
 
  await addColumnIfMissing("productos", "costo", "REAL", "0");
 
  await addColumnIfMissing("usuarios", "activo", "INTEGER", "1");
}
 
// ==============================
// ENSURE VENTA ITEMS COSTO
// ==============================
 
export async function ensureVentaItemsCosto() {
  await addColumnIfMissing(
    "venta_items",
    "costo_unitario",
    "REAL",
    "0",
  );

  await addColumnIfMissing(
    "venta_items",
    "descripcion_libre",
    "TEXT",
    null,
  );
}


export async function ensureVentaItemsLibre() {
  const cols = await all(`PRAGMA table_info(venta_items)`);

  const productoId = cols.find((c) => c.name === "producto_id");

  if (!productoId || productoId.notnull === 0) {
    return;
  }

  console.log("Migrando venta_items para soportar items libres...");

  await execSQL(`
    ALTER TABLE venta_items RENAME TO venta_items_old;
  `);

  await execSQL(`
    CREATE TABLE venta_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER,
      cantidad INTEGER NOT NULL CHECK(cantidad > 0),
      precio_unitario REAL NOT NULL CHECK(precio_unitario >= 0),
      costo_unitario REAL DEFAULT 0,
      descripcion_libre TEXT,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );
  `);

  await execSQL(`
    INSERT INTO venta_items (
      id,
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      costo_unitario,
      descripcion_libre
    )
    SELECT
      id,
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      COALESCE(costo_unitario,0),
      descripcion_libre
    FROM venta_items_old;
  `);

  await execSQL(`
    DROP TABLE venta_items_old;
  `);

  console.log("venta_items migrada correctamente");
}

// ==============================
// ENSURE VENTAS ARCA COLUMNS
// ==============================

export async function ensureVentasArcaColumns() {
  await addColumnIfMissing("ventas", "cae",              "TEXT",    null);
  await addColumnIfMissing("ventas", "cae_vto",          "TEXT",    null);
  await addColumnIfMissing("ventas", "nro_comprobante",  "INTEGER", null);
  await addColumnIfMissing("ventas", "tipo_comprobante", "INTEGER", null);
}

// ==============================
// TABLAS SINCRÓNICAS (serialize)
// ==============================
 
db.serialize(() => {


  // =========================
  // TABLA CUENTAS CORRIENTES
  // =========================
 
  db.run(`
  CREATE TABLE IF NOT EXISTS cuentas_corrientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    monto REAL NOT NULL,
    descripcion TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario TEXT,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
  )
`);



  // =========================
  // TABLA AUDITORIA
  // =========================
 
  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT,
      accion TEXT NOT NULL,
      detalle TEXT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
 
  // =========================
  // TABLA PROVEEDORES
  // =========================
 
  db.run(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
 
  // =========================
  // TABLA COMPRAS
  // =========================
 
  db.run(`
    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER,
      total REAL DEFAULT 0,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      usuario TEXT,
      nota TEXT
    )
  `);
 
  // =========================
  // TABLA COMPRA ITEMS
  // =========================
 
  db.run(`
    CREATE TABLE IF NOT EXISTS compra_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compra_id INTEGER,
      producto_id INTEGER,
      cantidad INTEGER,
      costo_unitario REAL
    )
  `);
});

// ==============================
// ENSURE CAJA TABLES
// ==============================

export async function ensureCajaTables() {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS caja_sesiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_apertura DATETIME NOT NULL,
      fecha_cierre DATETIME,
      monto_inicial REAL DEFAULT 0,
      monto_final REAL,
      usuario_apertura TEXT,
      usuario_cierre TEXT,
      nota TEXT
    );
  `);

  await execSQL(`
    CREATE TABLE IF NOT EXISTS caja_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sesion_id INTEGER NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      tipo TEXT NOT NULL,
      concepto TEXT,
      monto REAL NOT NULL,
      usuario TEXT,
      FOREIGN KEY (sesion_id) REFERENCES caja_sesiones(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS promociones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 2,
      precio_promo REAL NOT NULL,
      fecha_desde DATE,
      fecha_hasta DATE,
      activa INTEGER NOT NULL DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );
  `);
}
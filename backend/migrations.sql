PRAGMA foreign_keys = ON;

-- Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'vendedor',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Productos
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  precio REAL NOT NULL CHECK(precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  sku TEXT UNIQUE,
  imagen TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME
);

-- Ventas
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL NOT NULL CHECK(total >= 0),
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario TEXT
);

-- Venta Items
CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario REAL NOT NULL CHECK(precio_unitario >= 0),
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_items_prod ON venta_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_sku ON productos(sku);


-- ========================
-- Caja: sesiones y movimientos
-- ========================
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_apertura TEXT NOT NULL,
  fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  monto_inicial REAL NOT NULL DEFAULT 0,

  usuario_cierre TEXT,
  fecha_cierre DATETIME,
  conteo_efectivo REAL,
  total_ventas_efectivo REAL,
  total_mov_ingresos REAL,
  total_mov_egresos REAL,
  efectivo_esperado REAL,
  diferencia REAL
);

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo TEXT NOT NULL CHECK(tipo IN ('ingreso','egreso')),
  concepto TEXT,
  monto REAL NOT NULL CHECK(monto >= 0),
  FOREIGN KEY (sesion_id) REFERENCES caja_sesiones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caja_mov_sesion ON caja_movimientos(sesion_id);

-- ========================
-- Clientes (sin índices aquí; se crean por código luego)
-- ========================
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


CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  titulo TEXT NOT NULL,

  mensaje TEXT NOT NULL,

  tipo TEXT DEFAULT 'info',

  leida INTEGER DEFAULT 0,

  fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id    INTEGER NOT NULL REFERENCES ventas(id),
  fecha       TEXT    NOT NULL,
  usuario     TEXT    NOT NULL,
  monto_total REAL    NOT NULL DEFAULT 0,
  motivo      TEXT
);

CREATE TABLE IF NOT EXISTS devolucion_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucion_id    INTEGER NOT NULL REFERENCES devoluciones(id),
  producto_id      INTEGER REFERENCES productos(id),
  cantidad         INTEGER NOT NULL DEFAULT 1,
  precio_unitario  REAL    NOT NULL DEFAULT 0,
  descripcion_libre TEXT
);
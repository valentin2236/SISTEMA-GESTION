# Sistema de Gestion Comercial PRO

Sistema integral de gestion comercial con punto de venta (POS), control de inventario, caja, clientes, proveedores, compras, reportes y auditoria. Diseñado para comercios minoristas.

## Tecnologias

- **Backend:** Node.js + Express
- **Base de datos:** SQLite
- **Frontend:** HTML/CSS/JS vanilla + SCSS
- **Desktop:** Electron (instalador Windows NSIS)

## Requisitos

- Node.js 18+
- npm 9+

## Instalacion

```bash
npm install
cp .env.example .env
```

Edita `.env` con tus valores (ver seccion Configuracion).

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `npm start` | Inicia el servidor Express |
| `npm run dev` | Servidor con hot-reload + SCSS watch |
| `npm run electron` | Abre la app Electron |
| `npm run dev:electron` | Dev con hot-reload + Electron |
| `npm run build` | Genera instalador Windows |
| `npm run sass` | Compila SCSS a CSS |
| `npm run migrate` | Ejecuta migraciones de BD |

## Configuracion (.env)

```env
PORT=3000
JWT_SECRET=tu-secreto-seguro
JWT_EXPIRES_IN=2d
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASS=contraseña-segura
ADMIN_NAME=Administrador
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

**Importante:** En produccion, `JWT_SECRET` y `ADMIN_PASS` son obligatorios.

## Estructura del proyecto

```
├── backend/
│   ├── server.js          # Entry point del servidor
│   ├── db.js              # Configuracion SQLite + migraciones
│   ├── migrations.sql     # Schema SQL
│   ├── middleware/
│   │   ├── auth.js        # JWT + roles
│   │   ├── security.js    # Helmet, rate limit, sanitizacion
│   │   └── errorHandler.js # Manejo centralizado de errores
│   ├── routes/
│   │   ├── auth.js        # Login, cambio de password
│   │   ├── productos.js   # CRUD productos + importacion
│   │   ├── ventas.js      # POS + devoluciones
│   │   ├── clientes.js    # Clientes + cuenta corriente
│   │   ├── compras.js     # Ordenes de compra
│   │   ├── proveedores.js # CRUD proveedores
│   │   ├── caja.js        # Sesiones de caja
│   │   ├── inventario.js  # Movimientos de stock
│   │   ├── reportes.js    # KPIs y analytics
│   │   ├── auditoria.js   # Log de auditoria
│   │   ├── backup.js      # Backup/restauracion BD
│   │   ├── licencia.js    # Sistema de licencias
│   │   ├── exportar.js    # Exportacion CSV
│   │   ├── config.js      # Configuracion del sistema
│   │   ├── usuarios.js    # Gestion de usuarios
│   │   ├── barcodes.js    # Generacion de codigos de barras
│   │   ├── notificaciones.js
│   │   └── pdf-import.js  # Analisis de facturas con IA
│   └── utils/
│       ├── validate.js    # Validaciones de datos
│       ├── auditoria.js   # Registro de auditoria
│       ├── logger.js      # Winston logging
│       └── licencia.js    # Validacion de licencias
├── public/                # Frontend (HTML/CSS/JS)
│   ├── admin/             # Paginas de administracion
│   ├── js/                # Logica frontend
│   ├── css/               # Estilos compilados
│   ├── scss/              # Fuentes SCSS
│   └── img/               # Imagenes
├── electron/
│   ├── main.js            # Proceso principal Electron
│   └── preload.cjs        # Bridge seguro
├── logs/                  # Logs del sistema (auto-generado)
├── backups/               # Backups de BD (auto-generado)
└── package.json
```

## API Endpoints

### Autenticacion
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| POST | `/api/auth/login` | Iniciar sesion | Publico |
| POST | `/api/auth/cambiar-password` | Cambiar contraseña propia | Auth |
| POST | `/api/auth/reset-password` | Resetear password de otro usuario | Admin |
| GET | `/api/auth/me` | Perfil del usuario actual | Auth |

### Productos
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/productos` | Listar/buscar productos | Publico |
| GET | `/api/productos/:id` | Detalle de producto | Publico |
| POST | `/api/productos` | Crear producto | Auth |
| PUT | `/api/productos/:id` | Editar producto | Auth |
| DELETE | `/api/productos/:id` | Desactivar producto | Admin |
| PATCH | `/api/productos/stock/:id` | Ajustar stock | Auth |
| POST | `/api/productos/importar` | Importacion masiva | Auth |
| GET | `/api/productos/exportar` | Exportar listado | Auth |
| GET | `/api/productos/alertas/stock-bajo` | Alertas stock bajo | Auth |

### Ventas
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/ventas` | Listar ventas | Auth |
| POST | `/api/ventas` | Crear venta | Auth |
| GET | `/api/ventas/:id` | Detalle de venta | Auth |
| POST | `/api/ventas/:id/devolucion` | Devolucion parcial | Auth |
| GET | `/api/ventas/:id/devoluciones` | Ver devoluciones | Auth |
| GET | `/api/ventas/public/:id` | Ticket publico | Publico |

### Clientes
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/clientes` | Listar/buscar clientes | Auth |
| GET | `/api/clientes/:id` | Detalle de cliente | Auth |
| POST | `/api/clientes` | Crear cliente | Auth |
| PUT | `/api/clientes/:id` | Editar cliente | Auth |
| DELETE | `/api/clientes/:id` | Eliminar cliente | Admin |
| GET | `/api/clientes/:id/ventas` | Historial de ventas | Auth |
| GET | `/api/clientes/:id/cuenta-corriente` | Cuenta corriente | Auth |
| POST | `/api/clientes/:id/cuenta-corriente` | Movimiento CC | Auth |

### Compras
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/compras` | Listar compras | Auth |
| POST | `/api/compras` | Crear compra | Admin |
| GET | `/api/compras/:id` | Detalle compra | Auth |

### Proveedores
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/proveedores` | Listar proveedores | Auth |
| POST | `/api/proveedores` | Crear proveedor | Admin |
| PUT | `/api/proveedores/:id` | Editar proveedor | Admin |
| DELETE | `/api/proveedores/:id` | Eliminar proveedor | Admin |

### Caja
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| POST | `/api/caja/abrir` | Abrir sesion | Auth |
| GET | `/api/caja/sesion` | Sesion activa | Auth |
| PUT | `/api/caja/cerrar` | Cerrar sesion | Auth |
| POST | `/api/caja/movimiento` | Ingreso/egreso | Auth |

### Reportes y Exportacion
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/reportes/kpis` | Dashboard KPIs | Auth |
| GET | `/api/reportes/ventas-diarias` | Ventas por dia | Auth |
| GET | `/api/reportes/top-productos` | Productos mas vendidos | Auth |
| GET | `/api/reportes/cierre-caja` | Resumen de cierre | Auth |
| GET | `/api/exportar/ventas` | Exportar ventas CSV | Admin |
| GET | `/api/exportar/productos` | Exportar productos CSV | Admin |
| GET | `/api/exportar/clientes` | Exportar clientes CSV | Admin |
| GET | `/api/exportar/inventario` | Exportar inventario CSV | Admin |
| GET | `/api/exportar/caja` | Exportar caja CSV | Admin |

### Backup
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/backup` | Listar backups | Admin |
| POST | `/api/backup` | Crear backup | Admin |
| GET | `/api/backup/descargar/:nombre` | Descargar backup | Admin |
| POST | `/api/backup/restaurar/:nombre` | Restaurar backup | Admin |
| DELETE | `/api/backup/:nombre` | Eliminar backup | Admin |

### Licencia
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/licencia` | Estado de licencia | Auth |
| POST | `/api/licencia/activar` | Activar licencia | Admin |

### Otros
| Metodo | Ruta | Descripcion | Rol |
|--------|------|-------------|-----|
| GET | `/api/usuarios` | Listar usuarios | Admin |
| POST | `/api/usuarios` | Crear usuario | Admin |
| GET | `/api/auditoria` | Log de auditoria | Admin |
| GET | `/api/notificaciones` | Notificaciones | Auth |
| GET | `/api/barcode/:sku` | Generar codigo de barras | Publico |
| GET | `/health` | Health check | Publico |

## Seguridad

- **Helmet** — Headers de seguridad HTTP
- **Rate limiting** — Proteccion contra fuerza bruta (10 intentos login/15min, 1000 req/15min global)
- **CORS restringido** — Solo origenes permitidos
- **Sanitizacion de input** — Prevencion XSS en todos los campos
- **Limite de body** — 10MB maximo por request
- **JWT** — Tokens con expiracion configurable
- **Bcrypt** — Hash de contraseñas con salt (10 rounds)
- **Roles** — Admin y vendedor con permisos diferenciados
- **Auditoria** — Registro de todas las acciones criticas
- **Logging** — Logs persistentes con rotacion (Winston)

## Roles

| Permiso | Admin | Vendedor |
|---------|-------|----------|
| POS (ventas) | Si | Si |
| Productos (ver/crear/editar) | Si | Si |
| Productos (eliminar) | Si | No |
| Clientes | Si | Si |
| Compras (crear) | Si | No |
| Proveedores (crear/editar/eliminar) | Si | No |
| Usuarios | Si | No |
| Backup/Restauracion | Si | No |
| Exportacion CSV | Si | No |
| Configuracion | Si | No |
| Licencia | Si | No |
| Auditoria | Si | No |

## Licencia de uso

Este software es comercial. Requiere una clave de licencia valida para uso en produccion.

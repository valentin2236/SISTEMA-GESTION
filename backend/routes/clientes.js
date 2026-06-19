import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { validateCliente } from '../utils/validate.js';
import logger from '../utils/logger.js';

const router = Router();

function run(sql, params=[]) {
  return new Promise((resolve, reject)=>{
    db.run(sql, params, function(err){ err ? reject(err) : resolve(this); });
  });
}
function get(sql, params=[]) {
  return new Promise((resolve, reject)=>{
    db.get(sql, params, (err, row)=> err ? reject(err) : resolve(row));
  });
}
function all(sql, params=[]) {
  return new Promise((resolve, reject)=>{
    db.all(sql, params, (err, rows)=> err ? reject(err) : resolve(rows));
  });
}

// GET /api/clientes?search=
router.get('/', requireAuth, requireRole('admin','vendedor'), async (req,res)=>{
  try{
    const term = String(req.query.search||'').trim();
    if (!term){
      const rows = await all(`SELECT id, nombre, email, telefono, dni FROM clientes ORDER BY id DESC LIMIT 50`);
      return res.json(rows);
    }
    const like = `%${term}%`;
    const rows = await all(
      `SELECT id, nombre, email, telefono, dni
         FROM clientes
        WHERE nombre LIKE ? OR email LIKE ? OR dni LIKE ?
        ORDER BY nombre ASC LIMIT 50`,
      [like, like, like]
    );
    res.json(rows);
  }catch(e){
    res.status(500).json({ error:'DB_ERROR', details:e.message });
  }
});

// GET /api/clientes/:id
router.get('/:id', requireAuth, requireRole('admin','vendedor'), async (req,res)=>{
  try{
    const c = await get(`SELECT * FROM clientes WHERE id = ?`, [req.params.id]);
    if (!c) return res.status(404).json({ error:'NOT_FOUND' });
    res.json(c);
  }catch(e){
    res.status(500).json({ error:'DB_ERROR', details:e.message });
  }
});

// POST /api/clientes
router.post('/', requireAuth, requireRole('admin','vendedor'), async (req,res)=>{
  try{
    const errors = validateCliente(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'VALIDACION', detalles: errors });
    }

    const nombre = String(req.body.nombre||'').trim();
    const email = String(req.body.email||'').trim() || null;
    const telefono = String(req.body.telefono||'').trim() || null;
    const dni = String(req.body.dni||'').trim() || null;
    const direccion = String(req.body.direccion||'').trim() || null;

    const r = await run(
      `INSERT INTO clientes (nombre, email, telefono, dni, direccion, creado_en)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [nombre, email, telefono, dni, direccion]
    );
    const nuevo = await get(`SELECT id, nombre, email, telefono, dni, direccion FROM clientes WHERE id = ?`, [r.lastID]);

    registrarAuditoria(req.user.email, 'CREAR_CLIENTE', `${nombre} (ID: ${r.lastID})`);

    res.status(201).json(nuevo);
  }catch(e){
    if (e?.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error:'DUPLICADO_EMAIL_DNI' });
    logger.error('Error creando cliente', { error: e.message });
    res.status(500).json({ error:'DB_ERROR', details:e.message });
  }
});


// ===============================
// HISTORIAL DE COMPRAS CLIENTE
// ===============================

router.get(
  "/:id/ventas",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {

    try {

      const clienteId = req.params.id;

      // verificar cliente
      const cliente = await get(
        `SELECT id, nombre
         FROM clientes
         WHERE id = ?`,
        [clienteId]
      );

      if (!cliente) {

        return res.status(404).json({
          error: "CLIENTE_NO_EXISTE"
        });

      }

      // resumen
      const resumen = await get(
        `
        SELECT
          COUNT(*) AS compras,
          IFNULL(SUM(total), 0) AS total_gastado,
          MAX(fecha) AS ultima_compra
        FROM ventas
        WHERE cliente_id = ?
        `,
        [clienteId]
      );

      // ventas
      const ventas = await all(
        `
        SELECT
          id,
          fecha,
          total,
          medio_pago,
          usuario
        FROM ventas
        WHERE cliente_id = ?
        ORDER BY datetime(fecha) DESC
        `,
        [clienteId]
      );

      res.json({
        cliente,
        resumen,
        ventas
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message
      });

    }
  }
);


// ================== EDITAR CLIENTE ==================
router.put(
  "/:id",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {
    try {

      const { id } = req.params;

      const nombre = String(req.body.nombre || "").trim();
      const email = String(req.body.email || "").trim() || null;
      const telefono = String(req.body.telefono || "").trim() || null;
      const dni = String(req.body.dni || "").trim() || null;
      const direccion = String(req.body.direccion || "").trim() || null;

      if (!nombre) {
        return res.status(400).json({
          error: "NOMBRE_REQUERIDO"
        });
      }

      const cliente = await get(
        `SELECT id FROM clientes WHERE id = ?`,
        [id]
      );

      if (!cliente) {
        return res.status(404).json({
          error: "CLIENTE_NO_ENCONTRADO"
        });
      }

      const valErrors = validateCliente(req.body);
      if (valErrors.length > 0) {
        return res.status(400).json({ error: 'VALIDACION', detalles: valErrors });
      }

      await run(
        `UPDATE clientes
         SET nombre = ?,
             email = ?,
             telefono = ?,
             dni = ?,
             direccion = ?,
             actualizado_en = datetime('now')
         WHERE id = ?`,
        [
          nombre,
          email,
          telefono,
          dni,
          direccion,
          id
        ]
      );

      const actualizado = await get(
        `SELECT * FROM clientes WHERE id = ?`,
        [id]
      );

      registrarAuditoria(req.user.email, 'EDITAR_CLIENTE', `${nombre} (ID: ${id})`);

      res.json(actualizado);

    } catch (e) {

      logger.error('Error editando cliente', { error: e.message });

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message
      });

    }
  }
);

// ================== ELIMINAR CLIENTE ==================
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {

      const { id } = req.params;

      const cliente = await get(
        `SELECT id FROM clientes WHERE id = ?`,
        [id]
      );

      if (!cliente) {
        return res.status(404).json({
          error: "CLIENTE_NO_ENCONTRADO"
        });
      }

      await run(
        `DELETE FROM clientes WHERE id = ?`,
        [id]
      );

      registrarAuditoria(req.user.email, 'ELIMINAR_CLIENTE', `ID: ${id}`);

      res.json({
        success: true
      });

    } catch (e) {

      logger.error('Error eliminando cliente', { error: e.message });

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message
      });

    }
  }
);
// ================== HISTORIAL DE COMPRAS ==================
router.get(
  "/:id/compras",
  requireAuth,
  requireRole("admin", "vendedor"),
  async (req, res) => {

    try {

      const { id } = req.params;

      const cliente = await get(
        `SELECT id, nombre FROM clientes WHERE id = ?`,
        [id]
      );

      if (!cliente) {
        return res.status(404).json({
          error: "CLIENTE_NO_ENCONTRADO"
        });
      }

      const compras = await all(
        `SELECT
            id,
            fecha,
            total,
            medio_pago,
            usuario
         FROM ventas
         WHERE cliente_id = ?
         ORDER BY datetime(fecha) DESC`,
        [id]
      );

      const totalGastado = compras.reduce(
        (sum, c) => sum + Number(c.total || 0),
        0
      );

      res.json({
        cliente,
        total_compras: compras.length,
        total_gastado: totalGastado,
        compras
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message
      });

    }

  }
);

// ================== CUENTA CORRIENTE ==================
router.get(
  "/:id/cuenta-corriente",
  requireAuth,
  requireRole("admin","vendedor"),
  async (req,res) => {

    try {

      const { id } = req.params;

      const movimientos = await all(`
        SELECT *
        FROM cuentas_corrientes
        WHERE cliente_id = ?
        ORDER BY datetime(fecha) DESC
      `,[id]);

      let saldo = 0;

      movimientos.forEach(m => {

        if(m.tipo === "deuda"){
          saldo += Number(m.monto);
        }

        if(m.tipo === "pago"){
          saldo -= Number(m.monto);
        }

      });

      res.json({
        saldo,
        movimientos
      });

    } catch(e){

      res.status(500).json({
        error:"DB_ERROR"
      });

    }

  }
);

// Agregar movimiento a cuenta corriente
router.post(
  "/:id/cuenta-corriente",
  requireAuth,
  requireRole("admin","vendedor"),
  async (req,res)=>{

    const { id } = req.params;

    const {
      tipo,
      monto,
      descripcion
    } = req.body;

    await run(`
      INSERT INTO cuentas_corrientes (
        cliente_id,
        tipo,
        monto,
        descripcion,
        usuario
      )
      VALUES (?,?,?,?,?)
    `,
    [
      id,
      tipo,
      monto,
      descripcion,
      req.user.email
    ]);

    res.json({
      success:true
    });

  }
);


export default router;

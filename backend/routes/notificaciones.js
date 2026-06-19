import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// =====================================
// HELPERS
// =====================================

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

// =====================================
// LISTAR
// GET /api/notificaciones
// =====================================

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT *
      FROM notificaciones
      ORDER BY id DESC
      LIMIT 20
    `);

    res.json(rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "ERROR_NOTIFICACIONES",
    });

  }
});

// =====================================
// CREAR
// POST /api/notificaciones
// =====================================

router.post("/", requireAuth, async (req, res) => {
  try {

    const {
      titulo,
      mensaje,
      tipo = "info",
    } = req.body;

    await run(
      `
      INSERT INTO notificaciones (
        titulo,
        mensaje,
        tipo
      )
      VALUES (?, ?, ?)
    `,
      [
        titulo,
        mensaje,
        tipo,
      ]
    );

    res.status(201).json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "ERROR_CREAR_NOTIFICACION",
    });

  }
});

// =====================================
// MARCAR LEIDA
// PUT /api/notificaciones/:id/leida
// =====================================

router.put("/:id/leida", requireAuth, async (req, res) => {
  try {

    await run(
      `
      UPDATE notificaciones
      SET leida = 1
      WHERE id = ?
    `,
      [req.params.id]
    );

    res.json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "ERROR_MARCAR_LEIDA",
    });

  }
});

export default router;
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

router.get(
  "/",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {

      const limit = Math.min(
        parseInt(req.query.limit || "100", 10),
        500
      );

      const rows = await all(
        `
        SELECT
          id,
          usuario,
          accion,
          detalle,
          fecha
        FROM auditoria
        ORDER BY datetime(fecha) DESC
        LIMIT ?
        `,
        [limit]
      );

      res.json(rows);

    } catch (e) {

      res.status(500).json({
        error: "DB_ERROR",
        details: e.message
      });

    }
  }
);

export default router;
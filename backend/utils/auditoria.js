import { db } from '../db.js';

export function registrarAuditoria(
  usuario,
  accion,
  detalle = ''
) {

  db.run(
    `
      INSERT INTO auditoria
      (
        usuario,
        accion,
        detalle
      )
      VALUES (?, ?, ?)
    `,
    [
      usuario,
      accion,
      detalle
    ],
    (err) => {
      if (err) {
        console.error(
          'Error auditoría:',
          err.message
        );
      }
    }
  );

}
import { hasFeature } from '../utils/licencia.js';

export function requireFeature(feature) {
  return (req, res, next) => {
    if (hasFeature(feature)) {
      next();
    } else {
      res.status(403).json({
        error: 'FEATURE_NO_DISPONIBLE',
        feature,
        message: `Esta función no está incluida en tu plan actual. Contactá al proveedor para activar "${feature}".`,
      });
    }
  };
}

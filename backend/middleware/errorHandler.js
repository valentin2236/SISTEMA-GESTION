import logger from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
  }
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const errorCode = err.errorCode || 'ERROR_INTERNO';

  logger.error(err.message, {
    errorCode,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    user: req.user?.email || 'anonymous',
    stack: err.stack,
  });

  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      error: 'ERROR_INTERNO',
      message: 'Ocurrió un error interno. Contactá al administrador.',
    });
  }

  res.status(statusCode).json({
    error: errorCode,
    message: err.message,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'RUTA_NO_ENCONTRADA',
    message: `La ruta ${req.method} ${req.originalUrl} no existe.`,
  });
}

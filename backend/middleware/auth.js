//backend/middleware/auth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const [, token] = hdr.split(' ');
  if (!token) return res.status(401).json({ error: 'NO_AUTENTICADO' });

  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  }catch(e){
    return res.status(401).json({ error: 'TOKEN_INVALIDO' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.rol) return res.status(403).json({ error:'NO_AUTORIZADO' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error:'ROL_INSUFICIENTE' });
    next();
  };
}

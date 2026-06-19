export const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
export const isPositiveNumber = (v) => typeof v === 'number' && !Number.isNaN(v) && v >= 0;
export const isPositiveInteger = (v) => Number.isInteger(v) && v >= 0;

export function isValidEmail(v) {
  if (typeof v !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function isValidPhone(v) {
  if (typeof v !== 'string') return false;
  const cleaned = v.replace(/[\s\-().+]/g, '');
  return /^\d{6,15}$/.test(cleaned);
}

export function isValidDNI(v) {
  if (typeof v !== 'string') return false;
  const cleaned = v.replace(/[\s\-.]/g, '');
  return /^\d{7,11}$/.test(cleaned);
}

export function isValidPassword(v) {
  if (typeof v !== 'string') return false;
  return v.length >= 6;
}

export function maxLength(v, max) {
  if (typeof v !== 'string') return true;
  return v.length <= max;
}

export function validateProducto(body) {
  const errors = [];
  if (!isNonEmptyString(body.nombre)) errors.push('Nombre es requerido');
  if (body.nombre && !maxLength(body.nombre, 200)) errors.push('Nombre muy largo (máx 200)');
  if (body.descripcion && !maxLength(body.descripcion, 500)) errors.push('Descripción muy larga (máx 500)');
  if (body.categoria && !maxLength(body.categoria, 100)) errors.push('Categoría muy larga (máx 100)');
  if (body.precio !== undefined && !isPositiveNumber(Number(body.precio))) errors.push('Precio debe ser >= 0');
  if (body.stock !== undefined && !isPositiveInteger(Number(body.stock))) errors.push('Stock debe ser entero >= 0');
  if (body.sku && !maxLength(body.sku, 50)) errors.push('SKU muy largo (máx 50)');
  return errors;
}

export function validateCliente(body) {
  const errors = [];
  if (!isNonEmptyString(body.nombre)) errors.push('Nombre es requerido');
  if (body.nombre && !maxLength(body.nombre, 200)) errors.push('Nombre muy largo (máx 200)');
  if (body.email && !isValidEmail(body.email)) errors.push('Email inválido');
  if (body.telefono && !isValidPhone(body.telefono)) errors.push('Teléfono inválido (6-15 dígitos)');
  if (body.dni && !isValidDNI(body.dni)) errors.push('DNI inválido (7-11 dígitos)');
  if (body.direccion && !maxLength(body.direccion, 300)) errors.push('Dirección muy larga (máx 300)');
  return errors;
}

export function validateUsuario(body, isCreating = true) {
  const errors = [];
  if (!isNonEmptyString(body.nombre)) errors.push('Nombre es requerido');
  if (!isNonEmptyString(body.email)) errors.push('Email es requerido');
  if (body.email && !isValidEmail(body.email)) errors.push('Email inválido');
  if (isCreating && !isNonEmptyString(body.password)) errors.push('Contraseña es requerida');
  if (isCreating && body.password && !isValidPassword(body.password)) errors.push('Contraseña debe tener al menos 6 caracteres');
  if (body.rol && !['admin', 'vendedor'].includes(body.rol)) errors.push('Rol debe ser admin o vendedor');
  return errors;
}

export function validateProveedor(body) {
  const errors = [];
  if (!isNonEmptyString(body.nombre)) errors.push('Nombre es requerido');
  if (body.nombre && !maxLength(body.nombre, 200)) errors.push('Nombre muy largo (máx 200)');
  if (body.email && !isValidEmail(body.email)) errors.push('Email inválido');
  if (body.telefono && !isValidPhone(body.telefono)) errors.push('Teléfono inválido');
  if (body.direccion && !maxLength(body.direccion, 300)) errors.push('Dirección muy larga (máx 300)');
  return errors;
}

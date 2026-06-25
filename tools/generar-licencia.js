#!/usr/bin/env node

// =============================================
// GENERADOR DE LICENCIAS — Solo para vos (admin)
// =============================================
// Uso:
//   node tools/generar-licencia.js basico 365 "Negocio de Juan"
//   node tools/generar-licencia.js pro 730 "Ferretería López"
//   node tools/generar-licencia.js ultra 9999 "Cadena MegaStore"
//
// Argumentos:
//   1. Plan: basico | pro | ultra
//   2. Días de validez: número (365 = 1 año, 9999 = ~27 años "perpetua")
//   3. Nombre del cliente (opcional, solo para tu referencia)

import crypto from 'crypto';

const SECRET = 'SGP-2024-LICENCIA-SECRETA';

function generarLicencia(plan, diasValidos) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + diasValidos);

  const payload = {
    plan,
    expiry: expiry.toISOString(),
    createdAt: new Date().toISOString(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadB64)
    .digest('hex')
    .slice(0, 16);

  return `SGP-${payloadB64}-${signature}`;
}

// ── CLI ──
const args = process.argv.slice(2);
const plan = args[0] || 'basico';
const dias = parseInt(args[1]) || 365;
const cliente = args[2] || '(sin nombre)';

if (!['basico', 'pro', 'ultra'].includes(plan)) {
  console.error('Plan inválido. Usá: basico | pro | ultra');
  process.exit(1);
}

const clave = generarLicencia(plan, dias);
const expiry = new Date();
expiry.setDate(expiry.getDate() + dias);

console.log('');
console.log('══════════════════════════════════════════════');
console.log('  LICENCIA GENERADA');
console.log('══════════════════════════════════════════════');
console.log(`  Cliente:    ${cliente}`);
console.log(`  Plan:       ${plan}`);
console.log(`  Válida:     ${dias} días`);
console.log(`  Expira:     ${expiry.toLocaleDateString('es-AR')}`);
console.log(`  Generada:   ${new Date().toLocaleDateString('es-AR')}`);
console.log('──────────────────────────────────────────────');
console.log('');
console.log(`  ${clave}`);
console.log('');
console.log('──────────────────────────────────────────────');
console.log('  Copiá esta clave y dásela al cliente.');
console.log('  El cliente la ingresa en: Configuración → Licencia');
console.log('══════════════════════════════════════════════');
console.log('');

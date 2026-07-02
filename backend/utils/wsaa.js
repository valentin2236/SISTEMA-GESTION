// WSAA — Web Service de Autenticación y Autorización (AFIP/ARCA)
// Genera y cachea el Ticket de Acceso firmando el TRA con PKCS#7
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const forge = require('node-forge');

const TA_CACHE = new Map(); // key: "cuit:ambiente" → { token, sign, expira }

const WSAA_URLS = {
  produccion:  'https://wsaa.afip.gov.ar/ws/services/LoginCms',
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
};

function padL(n) { return String(n).padStart(2, '0'); }

function formatAfipDate(d) {
  // Argentina es UTC-3 todo el año (sin DST)
  const utc = d.getTime();
  const ar = new Date(utc - 3 * 3600 * 1000);
  return `${ar.getUTCFullYear()}-${padL(ar.getUTCMonth()+1)}-${padL(ar.getUTCDate())}T` +
    `${padL(ar.getUTCHours())}:${padL(ar.getUTCMinutes())}:${padL(ar.getUTCSeconds())}-03:00`;
}

function buildTRA(service = 'wsfe') {
  const now = Date.now();
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<loginTicketRequest version="1.0">\n` +
    `  <header>\n` +
    `    <uniqueId>${Math.floor(now / 1000)}</uniqueId>\n` +
    `    <generationTime>${formatAfipDate(new Date(now - 60_000))}</generationTime>\n` +
    `    <expirationTime>${formatAfipDate(new Date(now + 12 * 3600_000))}</expirationTime>\n` +
    `  </header>\n` +
    `  <service>${service}</service>\n` +
    `</loginTicketRequest>`;
}

function signTRA(traXml, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(certPem);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: forge.pki.certificateFromPem(certPem),
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, 'binary').toString('base64');
}

function extractTag(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

export async function getTicketAcceso(cuit, certPem, keyPem, ambiente = 'homologacion') {
  const cacheKey = `${cuit}:${ambiente}`;
  const cached = TA_CACHE.get(cacheKey);
  if (cached && cached.expira > Date.now() + 120_000) {
    return { token: cached.token, sign: cached.sign };
  }

  const wsaaUrl = WSAA_URLS[ambiente] || WSAA_URLS.homologacion;
  const tra = buildTRA('wsfe');
  const cms = signTRA(tra, certPem.trim(), keyPem.trim());

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"\n` +
    `                  xmlns:wsaa="${wsaaUrl}">\n` +
    `  <soapenv:Header/>\n` +
    `  <soapenv:Body>\n` +
    `    <wsaa:loginCms>\n` +
    `      <in0>${cms}</in0>\n` +
    `    </wsaa:loginCms>\n` +
    `  </soapenv:Body>\n` +
    `</soapenv:Envelope>`;

  const resp = await fetch(wsaaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""',
    },
    body: soapBody,
  });

  const xml = await resp.text();
  if (!resp.ok) {
    throw new Error(`WSAA HTTP ${resp.status}: ${xml.slice(0, 300)}`);
  }

  const token = extractTag(xml, 'token');
  const sign  = extractTag(xml, 'sign');

  if (!token || !sign) {
    const faultString = extractTag(xml, 'faultstring') || extractTag(xml, 'FaultString') || '';
    throw new Error(`WSAA sin token. ${faultString || xml.slice(0, 400)}`);
  }

  const expStr = extractTag(xml, 'expirationTime');
  const expira = expStr ? new Date(expStr).getTime() : Date.now() + 12 * 3600_000;

  TA_CACHE.set(cacheKey, { token, sign, expira });
  return { token, sign };
}

export function invalidarCache(cuit, ambiente) {
  TA_CACHE.delete(`${cuit}:${ambiente}`);
}

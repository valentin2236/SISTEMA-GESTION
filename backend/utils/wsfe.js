// WSFE — Web Service de Facturación Electrónica (AFIP/ARCA)
// Obtiene el último comprobante y solicita CAE vía SOAP

const WSFE_URLS = {
  produccion:   'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
};

const NS = 'http://ar.gov.afip.dif.FEV1/';

// Tipos de comprobante disponibles
export const TIPOS_COMPROBANTE = {
  1:  'Factura A',
  6:  'Factura B',
  11: 'Factura C',
  51: 'Factura M',
};

// Tipos de documento
export const TIPOS_DOC = {
  80: 'CUIT',
  86: 'CUIL',
  96: 'DNI',
  99: 'Consumidor Final',
};

function extractTag(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAllTags(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${tag}>`, 'ig');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function authBlock(token, sign, cuit) {
  return `<ar:Auth>
        <ar:Token>${escXml(token)}</ar:Token>
        <ar:Sign>${escXml(sign)}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>`;
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function soapCall(ambiente, action, innerBody) {
  const url = WSFE_URLS[ambiente] || WSFE_URLS.homologacion;
  const envelope = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"\n` +
    `               xmlns:ar="${NS}">\n` +
    `  <soap:Header/>\n` +
    `  <soap:Body>\n` +
    `    ${innerBody}\n` +
    `  </soap:Body>\n` +
    `</soap:Envelope>`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${NS}${action}"`,
    },
    body: envelope,
  });

  const xml = await resp.text();
  if (!resp.ok) throw new Error(`WSFE HTTP ${resp.status}: ${xml.slice(0, 300)}`);
  return xml;
}

function fechaHoy() {
  // YYYYMMDD en hora de Argentina (UTC-3)
  const ar = new Date(Date.now() - 3 * 3600_000);
  const y = ar.getUTCFullYear();
  const m = String(ar.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ar.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export async function getUltimoComprobante({ token, sign, cuit, puntoVenta, tipoComprobante, ambiente }) {
  const xml = await soapCall(ambiente, 'FECompUltimoAutorizado',
    `<ar:FECompUltimoAutorizado>
      ${authBlock(token, sign, cuit)}
      <ar:PtoVta>${puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>`);

  const errCode = extractTag(xml, 'Code');
  const errMsg  = extractTag(xml, 'Msg');
  if (errCode && errCode !== '0') throw new Error(`FECompUltimoAutorizado error ${errCode}: ${errMsg}`);

  const cbteNro = extractTag(xml, 'CbteNro');
  if (cbteNro === null) throw new Error(`FECompUltimoAutorizado: respuesta inesperada. ${xml.slice(0, 300)}`);
  return Number(cbteNro);
}

export async function solicitarCAE({
  token, sign, cuit,
  puntoVenta, tipoComprobante,
  docTipo = 99, docNro = 0,
  total,
  ambiente,
}) {
  const ultimo = await getUltimoComprobante({ token, sign, cuit, puntoVenta, tipoComprobante, ambiente });
  const nroSig = ultimo + 1;

  const totalFmt = Number(total).toFixed(2);
  const fecha = fechaHoy();

  // Para Factura C (monotributistas) y B (resp.inscripto → consumidor):
  // ImpNeto = total, ImpIVA = 0, alicIVA vacío
  const xml = await soapCall(ambiente, 'FECAESolicitar',
    `<ar:FECAESolicitar>
      ${authBlock(token, sign, cuit)}
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${puntoVenta}</ar:PtoVta>
          <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nroSig}</ar:CbteDesde>
            <ar:CbteHasta>${nroSig}</ar:CbteHasta>
            <ar:CbteFch>${fecha}</ar:CbteFch>
            <ar:ImpTotal>${totalFmt}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${totalFmt}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>0.00</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1.00</ar:MonCotiz>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>`);

  // Verificar errores generales
  const faultString = extractTag(xml, 'faultstring') || extractTag(xml, 'FaultString');
  if (faultString) throw new Error(`WSFE Fault: ${faultString}`);

  const resultado = extractTag(xml, 'Resultado');

  // Recolectar observaciones si las hay
  const obs = extractAllTags(xml, 'Msg').join(' | ');

  if (resultado !== 'A') {
    throw new Error(`WSFE rechazó el comprobante (${resultado || '?'}): ${obs || xml.slice(0, 400)}`);
  }

  const cae    = extractTag(xml, 'CAE');
  const caeVto = extractTag(xml, 'CAEFchVto');

  if (!cae) throw new Error(`WSFE no devolvió CAE. Obs: ${obs}`);

  return { cae, caeVto, nroComprobante: nroSig };
}

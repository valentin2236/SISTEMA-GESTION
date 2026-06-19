// public/js/config.js — Configuración completa v2
(function () {

  /* ══════════════════════════════════════════════════════════
     REFS DOM
  ══════════════════════════════════════════════════════════ */
  // Tabs
  const $tabs    = document.querySelectorAll('.cfg-tab');
  const $panels  = document.querySelectorAll('.cfg-panel');

  // Comercio
  const $nombre    = document.getElementById('empresaNombre');
  const $dir       = document.getElementById('empresaDir');
  const $cuit      = document.getElementById('empresaCuit');
  const $telefono  = document.getElementById('empresaTelefono');
  const $logoURL   = document.getElementById('empresaLogo');
  const $logoFile  = document.getElementById('empresaLogoFile');
  const $footer    = document.getElementById('ticketFooter');
  const $preview   = document.getElementById('logoPreview');
  const $logoEmpty = document.getElementById('logoEmpty');
  const $logoInfo  = document.getElementById('logoInfo');
  const $btnQLoGO  = document.getElementById('btnQuitarLogo');

  // Impresora
  const $printer    = document.getElementById('printerSelect');
  const $width      = document.getElementById('ticketWidth');
  const $auto       = document.getElementById('autoPrint');
  const $btnList    = document.getElementById('btnListPrinters');
  const $pHint      = document.getElementById('printersHint');
  const $ticketPrev = document.getElementById('ticketPreview');

  // Moneda
  const $monSimbolo  = document.getElementById('monedaSimbolo');
  const $monCodigo   = document.getElementById('monedaCodigo');
  const $monDecimal  = document.getElementById('monedaDecimal');
  const $monDecimals = document.getElementById('monedaDecimals');
  const $monPosicion = document.getElementById('monedaPosicion');
  const $ivaDefault  = document.getElementById('ivaDefault');
  const $monPreview  = document.getElementById('monedaPreview');

  // Backup
  const $btnExportConfig = document.getElementById('btnExportConfig');
  const $importFile      = document.getElementById('importConfigFile');
  const $importStatus    = document.getElementById('importStatus');
  const $btnLimpiar      = document.getElementById('btnLimpiarConfig');

  // Acciones globales
  const $save    = document.getElementById('btnGuardar');
  const $reset   = document.getElementById('btnRestablecer');
  const $toast   = document.getElementById('cfg-toast');

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function getCfg() {
    try { return JSON.parse(localStorage.getItem('cfg') || '{}'); } catch { return {}; }
  }
  function setCfg(data) {
    localStorage.setItem('cfg', JSON.stringify(data));
  }

  function isElectron() {
    return !!(window.electronAPI && window.electronAPI.getPrinters);
  }

  let toastTimer;
  function toast(msg, type = 'ok') {
    $toast.textContent = msg;
    $toast.className = `cfg-toast cfg-toast--${type} cfg-toast--visible`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $toast.className = 'cfg-toast';
    }, 3000);
  }

  /* ══════════════════════════════════════════════════════════
     TABS
  ══════════════════════════════════════════════════════════ */
  $tabs.forEach($tab => {
    $tab.addEventListener('click', () => {
      $tabs.forEach(t => t.classList.remove('active'));
      $tab.classList.add('active');
      const id = 'tab-' + $tab.dataset.tab;
      $panels.forEach(p => p.style.display = p.id === id ? '' : 'none');
    });
  });

  /* ══════════════════════════════════════════════════════════
     LOGO
  ══════════════════════════════════════════════════════════ */
  function setLogoPreview(src, info) {
    if (src) {
      $preview.src = src;
      $preview.style.display = 'block';
      $logoEmpty.style.display = 'none';
      $btnQLoGO.style.display = 'inline-flex';
    } else {
      $preview.src = '';
      $preview.style.display = 'none';
      $logoEmpty.style.display = 'block';
      $btnQLoGO.style.display = 'none';
    }
    $logoInfo.textContent = info || '';
  }

  $logoFile?.addEventListener('change', () => {
    const file = $logoFile.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast('El archivo es muy grande (máx. 500 KB)', 'error');
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const dataURL = fr.result;
      const cfg = getCfg();
      cfg.empresaLogoData = dataURL;
      setCfg(cfg);
      setLogoPreview(dataURL, `Logo embebido (${Math.round(file.size / 1024)} KB)`);
      toast('Logo cargado desde archivo.');
    };
    fr.readAsDataURL(file);
  });

  $logoURL?.addEventListener('input', () => {
    const url = $logoURL.value.trim();
    const cfg = getCfg();
    if (url) {
      setLogoPreview(url, 'Logo por URL.');
    } else if (cfg.empresaLogoData) {
      setLogoPreview(cfg.empresaLogoData, 'Logo embebido.');
    } else {
      setLogoPreview(null, '');
    }
  });

  $btnQLoGO?.addEventListener('click', () => {
    const cfg = getCfg();
    delete cfg.empresaLogoData;
    cfg.empresaLogo = '';
    setCfg(cfg);
    $logoURL.value = '';
    setLogoPreview(null, '');
    toast('Logo eliminado.');
  });

  /* ══════════════════════════════════════════════════════════
     IMPRESORAS
  ══════════════════════════════════════════════════════════ */
  async function listPrinters() {
    if (!isElectron()) {
      toast('Detección de impresoras solo disponible en la app de escritorio.', 'warn');
      return;
    }
    $btnList.disabled = true;
    $btnList.textContent = 'Buscando…';
    try {
      const list = await window.electronAPI.getPrinters();
      const current = $printer.value;
      $printer.innerHTML = `<option value="">(Seleccionar)</option>` +
        list.map(p => `<option value="${p.name}">${p.isDefault ? '★ ' : ''}${p.name}</option>`).join('');
      if (current) $printer.value = current;
      $pHint.textContent = `${list.length} impresora${list.length !== 1 ? 's' : ''} detectada${list.length !== 1 ? 's' : ''}.`;
      toast(`${list.length} impresoras detectadas.`);
    } catch (e) {
      toast('No se pudo obtener la lista de impresoras.', 'error');
    } finally {
      $btnList.disabled = false;
      $btnList.textContent = '🔍 Detectar';
    }
  }

  /* ══════════════════════════════════════════════════════════
     PREVIEW TICKET
  ══════════════════════════════════════════════════════════ */
  function updateTicketPreview() {
    if (!$ticketPrev) return;
    const cfg = getCfg();
    const nombre = $nombre?.value || cfg.empresaNombre || 'Mi Negocio';
    const dir    = $dir?.value   || cfg.empresaDir    || '';
    const cuit   = $cuit?.value  || cfg.empresaCuit   || '';
    const footer = $footer?.value || cfg.ticketFooter || '';
    const logo   = cfg.empresaLogoData || cfg.empresaLogo || '';
    const width  = $width?.value || cfg.ticketWidth || '80';

    $ticketPrev.innerHTML = `
      <div class="tkt" style="width:${width === '58' ? '200px' : '280px'}">
        ${logo ? `<img src="${logo}" class="tkt-logo" alt="logo">` : ''}
        <p class="tkt-nombre">${nombre}</p>
        ${dir   ? `<p class="tkt-dato">${dir}</p>`  : ''}
        ${cuit  ? `<p class="tkt-dato">CUIT: ${cuit}</p>` : ''}
        <div class="tkt-sep">- - - - - - - - - - - - - - - - -</div>
        <p class="tkt-dato">Producto ejemplo ........... $1.000,00</p>
        <p class="tkt-dato">Producto ejemplo 2 .......... $500,00</p>
        <div class="tkt-sep">- - - - - - - - - - - - - - - - -</div>
        <p class="tkt-total">TOTAL: $1.500,00</p>
        ${footer ? `<p class="tkt-footer">${footer}</p>` : ''}
      </div>`;
  }

  [$nombre, $dir, $cuit, $footer, $width].forEach(el => {
    el?.addEventListener('input', updateTicketPreview);
  });

  /* ══════════════════════════════════════════════════════════
     MONEDA — preview vivo
  ══════════════════════════════════════════════════════════ */
  function updateMonedaPreview() {
    if (!$monPreview) return;
    const sym      = $monSimbolo?.value  || '$';
    const dec      = $monDecimal?.value  || ',';
    const decimals = parseInt($monDecimals?.value ?? '2');
    const pos      = $monPosicion?.value || 'before';

    const miles = dec === ',' ? '.' : ',';
    // Formatea 1234.56 con los separadores elegidos
    const num = (1234.56).toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).replace(/\./g, '〈DOT〉').replace(/,/g, '〈COM〉')
      .replace(/〈DOT〉/g, dec === ',' ? '.' : ',')
      .replace(/〈COM〉/g, dec === ',' ? ',' : '.');

    $monPreview.textContent = pos === 'before' ? `${sym}${num}` : `${num} ${sym}`;
  }

  [$monSimbolo, $monDecimal, $monDecimals, $monPosicion].forEach(el => {
    el?.addEventListener('input', updateMonedaPreview);
    el?.addEventListener('change', updateMonedaPreview);
  });

  /* ══════════════════════════════════════════════════════════
     CARGAR
  ══════════════════════════════════════════════════════════ */
  function load() {
    const cfg = getCfg();

    // Comercio
    $nombre.value   = cfg.empresaNombre  || '';
    $dir.value      = cfg.empresaDir     || '';
    $cuit.value     = cfg.empresaCuit    || '';
    $telefono.value = cfg.empresaTelefono || '';
    $logoURL.value  = cfg.empresaLogo    || '';
    $footer.value   = cfg.ticketFooter   || '';

    if (cfg.empresaLogoData) {
      setLogoPreview(cfg.empresaLogoData, 'Logo embebido.');
    } else if (cfg.empresaLogo) {
      setLogoPreview(cfg.empresaLogo, 'Logo por URL.');
    } else {
      setLogoPreview(null, '');
    }

    // Impresora
    $width.value = cfg.ticketWidth || '80';
    $auto.value  = cfg.autoPrint === 'off' ? 'off' : 'on';
    $printer.innerHTML = `<option value="">(Seleccionar)</option>`;
    if (cfg.printerName) {
      const opt = document.createElement('option');
      opt.value = cfg.printerName;
      opt.textContent = cfg.printerName;
      $printer.appendChild(opt);
      $printer.value = cfg.printerName;
    }

    if (!isElectron()) {
      $btnList?.setAttribute('disabled', 'disabled');
      $pHint.textContent = 'Disponible solo en la app de escritorio.';
    }

    // Moneda
    $monSimbolo.value  = cfg.monedaSimbolo  || '$';
    $monCodigo.value   = cfg.monedaCodigo   || 'ARS';
    $monDecimal.value  = cfg.monedaDecimal  || ',';
    $monDecimals.value = cfg.monedaDecimals ?? '2';
    $monPosicion.value = cfg.monedaPosicion || 'before';
    $ivaDefault.value  = cfg.ivaDefault     ?? '21';

    updateMonedaPreview();
    updateTicketPreview();
  }

  /* ══════════════════════════════════════════════════════════
     GUARDAR
  ══════════════════════════════════════════════════════════ */
  function save() {
    const prev = getCfg();
    const cfg = {
      ...prev,
      // Comercio
      empresaNombre:   $nombre.value.trim(),
      empresaDir:      $dir.value.trim(),
      empresaCuit:     $cuit.value.trim(),
      empresaTelefono: $telefono.value.trim(),
      empresaLogo:     $logoURL.value.trim(),
      ticketFooter:    $footer.value.trim(),
      // Impresora
      printerName: $printer.value || '',
      ticketWidth: $width.value || '80',
      autoPrint:   $auto.value || 'on',
      // Moneda
      monedaSimbolo:  $monSimbolo.value.trim() || '$',
      monedaCodigo:   $monCodigo.value.trim()  || 'ARS',
      monedaDecimal:  $monDecimal.value  || ',',
      monedaDecimals: $monDecimals.value ?? '2',
      monedaPosicion: $monPosicion.value || 'before',
      ivaDefault:     $ivaDefault.value  || '21',
    };
    setCfg(cfg);
    toast('Configuración guardada.');
    updateTicketPreview();
  }

  /* ══════════════════════════════════════════════════════════
     RESTABLECER
  ══════════════════════════════════════════════════════════ */
  function reset() {
    if (!confirm('¿Restablecer toda la configuración? Esta acción no se puede deshacer.')) return;
    localStorage.removeItem('cfg');
    load();
    toast('Configuración restablecida.', 'warn');
  }

  /* ══════════════════════════════════════════════════════════
     BACKUP — EXPORTAR CONFIG
  ══════════════════════════════════════════════════════════ */
  function exportConfig() {
    const cfg = getCfg();
    const json = JSON.stringify(cfg, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `config_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Configuración exportada.');
  }

  /* ══════════════════════════════════════════════════════════
     BACKUP — EXPORTAR DB
  ══════════════════════════════════════════════════════════ */
  async function exportDB() {
    const token = localStorage.getItem('token');
    if (!token) { toast('No estás autenticado.', 'error'); return; }

    $btnExportDB.disabled = true;
    $btnExportDB.textContent = 'Exportando…';

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

      const [productos, clientes, ventas, compras] = await Promise.all([
        fetch('/api/productos?limit=9999', { headers }).then(r => r.json()),
        fetch('/api/clientes?limit=9999',  { headers }).then(r => r.json()),
        fetch('/api/ventas?limit=9999',    { headers }).then(r => r.json()),
        fetch('/api/compras?limit=9999',   { headers }).then(r => r.json()),
      ]);

      const dump = {
        exportado: new Date().toISOString(),
        version: '1.0',
        productos,
        clientes,
        ventas,
        compras,
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `backup_db_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Base de datos exportada.');
    } catch (e) {
      console.error(e);
      toast('Error al exportar. Verificá la conexión.', 'error');
    } finally {
      $btnExportDB.disabled = false;
      $btnExportDB.textContent = 'Exportar .json';
    }
  }

  /* ══════════════════════════════════════════════════════════
     BACKUP — IMPORTAR CONFIG
  ══════════════════════════════════════════════════════════ */
  $importFile?.addEventListener('change', () => {
    const file = $importFile.files?.[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Formato inválido');
        setCfg(data);
        load();
        $importStatus.textContent = '✅ Configuración importada correctamente.';
        toast('Configuración importada.');
      } catch {
        $importStatus.textContent = '❌ Archivo inválido. Debe ser un JSON de configuración exportado desde este sistema.';
        toast('Archivo inválido.', 'error');
      }
    };
    fr.readAsText(file);
  });

  /* ══════════════════════════════════════════════════════════
     LIMPIAR SOLO CONFIG
  ══════════════════════════════════════════════════════════ */
  $btnLimpiar?.addEventListener('click', () => {
    if (!confirm('¿Borrar solo la configuración del sistema? Los datos (ventas, productos, etc.) no se verán afectados.')) return;
    localStorage.removeItem('cfg');
    load();
    toast('Configuración borrada.', 'warn');
  });

  /* ══════════════════════════════════════════════════════════
     BIND EVENTOS
  ══════════════════════════════════════════════════════════ */
  $btnList?.addEventListener('click', listPrinters);
  $save?.addEventListener('click', save);
  $reset?.addEventListener('click', reset);
  $btnExportConfig?.addEventListener('click', exportConfig);

  // Init
  load();


  /* ── Refs IA ── */
const $apiKey       = document.getElementById('anthropicApiKey');
const $btnToggleKey = document.getElementById('btnToggleKey');
const $btnTestKey   = document.getElementById('btnTestKey');
const $keyStatus    = document.getElementById('anthropicKeyStatus');
const $iaEstado     = document.getElementById('cfg-ia-estado');
 
const token = localStorage.getItem('token');
 
async function apiCfg(method, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/config', opts);
  return res;
}
 
/* ── Cargar estado de key desde servidor ── */
async function cargarEstadoIA() {
  if (!token) return;
  try {
    const res = await apiCfg('GET');
    if (!res.ok) return;
    const data = await res.json();
 
    if (data.anthropic_key_configurada) {
      $keyStatus.textContent = '✅ API key configurada en el servidor.';
      $keyStatus.style.color = 'var(--success, green)';
      $iaEstado.style.display = '';
      $iaEstado.innerHTML = `
        <div class="cfg-ia-ok">
          <span>✅ La función de importar desde foto está activa.</span>
          <button id="btnBorrarKey" class="btn btn-outline btn-sm btn-danger-outline">
            🗑 Quitar key
          </button>
        </div>`;
      document.getElementById('btnBorrarKey')?.addEventListener('click', borrarKey);
    } else {
      $keyStatus.textContent = 'Sin key configurada. La función de importar foto estará deshabilitada.';
      $keyStatus.style.color = 'var(--muted)';
      $iaEstado.style.display = 'none';
    }
  } catch (e) {
    console.error('cargarEstadoIA', e);
  }
}
 
/* ── Mostrar/ocultar key ── */
$btnToggleKey?.addEventListener('click', () => {
  const isPass = $apiKey.type === 'password';
  $apiKey.type = isPass ? 'text' : 'password';
  $btnToggleKey.textContent = isPass ? '🙈' : '👁';
});
 
/* ── Probar key ── */
$btnTestKey?.addEventListener('click', async () => {
  const key = $apiKey.value.trim();
  if (!key) {
    $keyStatus.textContent = 'Ingresá una key para probar.';
    $keyStatus.style.color = 'var(--danger)';
    return;
  }
 
  $btnTestKey.disabled = true;
  $btnTestKey.textContent = 'Probando…';
  $keyStatus.textContent = '';
 
  try {
    // Guardamos la key y la probamos en el servidor
    const resSave = await apiCfg('PUT', { anthropic_api_key: key });
    if (!resSave.ok) throw new Error('No se pudo guardar la key');
 
    // Hacemos un ping mínimo a Anthropic desde el backend
    const resTest = await fetch('/api/config/test-ia', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const result = await resTest.json();
 
    if (resTest.ok && result.ok) {
      $keyStatus.textContent = '✅ Key válida y funcionando.';
      $keyStatus.style.color = 'var(--success, green)';
      toast('API key guardada y verificada.');
      cargarEstadoIA();
    } else {
      $keyStatus.textContent = '❌ Key inválida: ' + (result.details || 'error desconocido');
      $keyStatus.style.color = 'var(--danger)';
      // Borrar key inválida del servidor
      await apiCfg('PUT', { anthropic_api_key: '' });
    }
  } catch (e) {
    $keyStatus.textContent = '❌ Error al probar: ' + e.message;
    $keyStatus.style.color = 'var(--danger)';
  } finally {
    $btnTestKey.disabled = false;
    $btnTestKey.textContent = 'Probar';
    $apiKey.value = ''; // limpiar input por seguridad
    $apiKey.type = 'password';
    $btnToggleKey.textContent = '👁';
  }
});
 
/* ── Borrar key ── */
async function borrarKey() {
  if (!confirm('¿Quitar la API key? La función de importar foto quedará deshabilitada.')) return;
  try {
    await apiCfg('PUT', { anthropic_api_key: '' });
    $keyStatus.textContent = 'Key eliminada.';
    $keyStatus.style.color = 'var(--muted)';
    $iaEstado.style.display = 'none';
    toast('API key eliminada.', 'warn');
  } catch (e) {
    toast('Error al eliminar la key.', 'error');
  }
}
 
/* ── Init ── */
cargarEstadoIA();

/* ══════════════════════════════════════════════════════════
   LICENCIA
══════════════════════════════════════════════════════════ */
const $licEstado = document.getElementById('licencia-estado');
const $licClave = document.getElementById('licencia-clave');
const $licMsg = document.getElementById('licencia-msg');
const $btnActivar = document.getElementById('btnActivarLicencia');

async function cargarLicencia() {
  if (!$licEstado || !token) return;
  try {
    const res = await fetch('/api/licencia', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) { $licEstado.innerHTML = '<p class="field-hint">Error consultando licencia</p>'; return; }
    const lic = await res.json();

    if (lic.activa) {
      const planLabels = { basico: 'Básico', pro: 'Profesional', enterprise: 'Enterprise' };
      $licEstado.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(0,214,117,.08);border:1px solid rgba(0,214,117,.25);border-radius:10px">
          <span style="font-size:28px">✅</span>
          <div>
            <strong style="font-size:15px">Licencia activa — Plan ${planLabels[lic.plan] || lic.plan}</strong>
            <p style="font-size:13px;opacity:.7;margin-top:4px">
              Expira: ${new Date(lic.expiry).toLocaleDateString('es-AR')} (${lic.diasRestantes} días restantes)
            </p>
          </div>
        </div>`;
    } else {
      $licEstado.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px">
          <span style="font-size:28px">⚠️</span>
          <div>
            <strong style="font-size:15px">${lic.error || lic.mensaje || 'Sin licencia activa'}</strong>
            <p style="font-size:13px;opacity:.7;margin-top:4px">Ingresá una clave válida para activar el sistema.</p>
          </div>
        </div>`;
    }
  } catch { $licEstado.innerHTML = '<p class="field-hint">Error de conexión</p>'; }
}

$btnActivar?.addEventListener('click', async () => {
  const clave = ($licClave?.value || '').trim();
  if (!clave) { $licMsg.textContent = 'Ingresá una clave de licencia'; $licMsg.style.color = 'var(--danger)'; return; }

  $btnActivar.disabled = true;
  $btnActivar.textContent = 'Activando...';
  $licMsg.textContent = '';

  try {
    const res = await fetch('/api/licencia/activar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ clave }),
    });
    const data = await res.json();

    if (res.ok) {
      $licMsg.textContent = '✅ Licencia activada correctamente';
      $licMsg.style.color = 'var(--success, green)';
      $licClave.value = '';
      toast('Licencia activada');
      cargarLicencia();
    } else {
      $licMsg.textContent = '❌ ' + (data.message || data.error || 'Clave inválida');
      $licMsg.style.color = 'var(--danger)';
    }
  } catch {
    $licMsg.textContent = '❌ Error de conexión';
    $licMsg.style.color = 'var(--danger)';
  } finally {
    $btnActivar.disabled = false;
    $btnActivar.textContent = 'Activar';
  }
});

cargarLicencia();

/* ══════════════════════════════════════════════════════════
   BACKUP DE BD REAL
══════════════════════════════════════════════════════════ */
const $btnCrearBackup = document.getElementById('btnCrearBackup');
const $backupsLista = document.getElementById('backups-lista');

async function cargarBackups() {
  if (!$backupsLista || !token) return;
  try {
    const res = await fetch('/api/backup', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) { $backupsLista.innerHTML = '<p class="field-hint">Error cargando backups</p>'; return; }
    const backups = await res.json();
    if (!backups.length) {
      $backupsLista.innerHTML = '<p class="field-hint">No hay backups todavía. Creá uno para proteger tus datos.</p>';
      return;
    }
    $backupsLista.innerHTML = `
      <table class="tbl" style="font-size:13px">
        <thead><tr><th>Nombre</th><th>Tamaño</th><th>Fecha</th><th style="width:160px">Acciones</th></tr></thead>
        <tbody>${backups.map(b => `
          <tr>
            <td style="font-family:monospace;font-size:12px">${b.nombre}</td>
            <td>${(b.tamaño / 1024).toFixed(0)} KB</td>
            <td>${new Date(b.fecha).toLocaleString('es-AR')}</td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn btn-outline btn-sm" onclick="descargarBackup('${b.nombre}')">⬇</button>
                <button class="btn btn-outline btn-sm" onclick="restaurarBackup('${b.nombre}')">🔄</button>
                <button class="btn btn-outline btn-sm btn-danger-outline" onclick="eliminarBackup('${b.nombre}')">🗑</button>
              </div>
            </td>
          </tr>`).join('')}</tbody>
      </table>`;
  } catch { $backupsLista.innerHTML = '<p class="field-hint">Error de conexión</p>'; }
}

$btnCrearBackup?.addEventListener('click', async () => {
  $btnCrearBackup.disabled = true;
  $btnCrearBackup.textContent = 'Creando...';
  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    if (res.ok) {
      toast('Backup creado: ' + data.nombre);
      cargarBackups();
    } else {
      toast(data.message || 'Error creando backup', 'error');
    }
  } catch { toast('Error de conexión', 'error'); }
  finally {
    $btnCrearBackup.disabled = false;
    $btnCrearBackup.textContent = 'Crear backup';
  }
});

window.descargarBackup = function(nombre) {
  const a = document.createElement('a');
  a.href = `/api/backup/descargar/${nombre}`;
  a.download = nombre;
  const headers = new Headers({ Authorization: 'Bearer ' + token });
  fetch(a.href, { headers }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  });
};

window.restaurarBackup = async function(nombre) {
  if (!confirm(`¿Restaurar la base de datos desde "${nombre}"?\n\nSe creará un backup automático del estado actual antes de restaurar.\n\nDespués de restaurar, reiniciá el servidor.`)) return;
  try {
    const res = await fetch(`/api/backup/restaurar/${nombre}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    if (res.ok) {
      toast(data.mensaje || 'Restaurado correctamente');
      cargarBackups();
    } else {
      toast(data.message || 'Error restaurando', 'error');
    }
  } catch { toast('Error de conexión', 'error'); }
};

window.eliminarBackup = async function(nombre) {
  if (!confirm(`¿Eliminar el backup "${nombre}"?`)) return;
  try {
    const res = await fetch(`/api/backup/${nombre}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      toast('Backup eliminado');
      cargarBackups();
    } else {
      toast('Error eliminando backup', 'error');
    }
  } catch { toast('Error de conexión', 'error'); }
};

cargarBackups();

/* ══════════════════════════════════════════════════════════
   EXPORTAR CSV
══════════════════════════════════════════════════════════ */
window.descargarCSV = async function(tipo) {
  try {
    const res = await fetch(`/api/exportar/${tipo}`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) { toast('Error exportando ' + tipo, 'error'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tipo}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${tipo} exportado correctamente`);
  } catch { toast('Error de conexión', 'error'); }
};

})();
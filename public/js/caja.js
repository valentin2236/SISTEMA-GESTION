// public/js/caja.js — Caja con sistema de pestañas
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

/* ── Utils ── */
function money(n) {
  return (Number(n) || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function horaCorta(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit",
  });
}

function fechaHora(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  return res;
}

/* ── Reloj ── */
function actualizarHora() {
  const el = document.getElementById("caja-hora");
  if (el) el.textContent = new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
setInterval(actualizarHora, 1000);
actualizarHora();

/* ── Sistema de pestañas ── */
function switchTab(tabId) {
  // No navegar a tab bloqueada
  const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (targetBtn?.classList.contains("caja-tab--locked")) return;

  document.querySelectorAll(".caja-tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".caja-tab-panel").forEach(p => p.style.display = "none");

  targetBtn?.classList.add("active");
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.style.display = "";

  if (tabId === "historial") loadHistorial();
}

function setTabsEstado(abierta) {
  const tabMovBtn   = document.getElementById("tab-btn-movimientos");
  const tabCierreBtn= document.getElementById("tab-btn-cierre");

  if (abierta) {
    tabMovBtn?.classList.remove("caja-tab--locked");
    tabCierreBtn?.classList.remove("caja-tab--locked");
  } else {
    tabMovBtn?.classList.add("caja-tab--locked");
    tabCierreBtn?.classList.add("caja-tab--locked");
    // Si estamos en una pestaña bloqueada, volver a estado
    const active = document.querySelector(".caja-tab.active");
    if (active?.dataset.tab === "movimientos" || active?.dataset.tab === "cierre") {
      switchTab("estado");
    }
  }
}

document.querySelectorAll(".caja-tab[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ── DOM refs ── */
const $badge          = document.getElementById("caja-badge");
const $vistaCerrada   = document.getElementById("vista-cerrada");
const $vistaAbierta   = document.getElementById("vista-abierta");
const $montoInicial   = document.getElementById("monto-inicial");
const $btnAbrir       = document.getElementById("btn-abrir");

const $cardEsperado              = document.getElementById("card-esperado");
const $cardVentas                = document.getElementById("card-ventas");
const $cardTickets               = document.getElementById("card-tickets");
const $cardIngresos              = document.getElementById("card-ingresos");
const $cardEgresos               = document.getElementById("card-egresos");
const $cardInicial               = document.getElementById("card-inicial");
const $cardApertura              = document.getElementById("card-apertura");
const $cardUsuario               = document.getElementById("card-usuario");
const $cardTarjeta               = document.getElementById("card-tarjeta");
const $cardTarjetaTickets        = document.getElementById("card-tarjeta-tickets");
const $cardTransferencia         = document.getElementById("card-transferencia");
const $cardTransferenciaTickets  = document.getElementById("card-transferencia-tickets");
const $cardCuenta                = document.getElementById("card-cuenta");
const $cardCuentaTickets         = document.getElementById("card-cuenta-tickets");

const $btnNuevoMov    = document.getElementById("btn-nuevo-mov");
const $formMov        = document.getElementById("form-movimiento");
const $movTipo        = document.getElementById("mov-tipo");
const $movConcepto    = document.getElementById("mov-concepto");
const $movMonto       = document.getElementById("mov-monto");
const $btnAgregarMov  = document.getElementById("btn-agregar-mov");
const $btnCancelarMov = document.getElementById("btn-cancelar-mov");
const $movTbody       = document.getElementById("mov-tbody");

const $conteo         = document.getElementById("conteo");
const $obs            = document.getElementById("obs");
const $btnCerrar      = document.getElementById("btn-cerrar");
const $difPreview     = document.getElementById("diferencia-preview");
const $difValor       = document.getElementById("dif-valor");
const $cierrePreview  = document.getElementById("cierre-resumen-preview");

const $dlg            = document.getElementById("dlg-cierre");
const $cierreResumen  = document.getElementById("cierre-resumen");
const $cierreMovs     = document.getElementById("cierre-movs");
const $btnImprimir    = document.getElementById("btn-imprimir");
const $btnCerrarModal = document.getElementById("btn-cerrar-modal");
const $btnCerrarModal2= document.getElementById("btn-cerrar-modal2");

/* ── Estado global ── */
let estadoActual = null;

/* ── Cargar estado ── */
async function loadEstado() {
  try {
    const res = await api("/api/caja/estado");
    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar el estado de caja" });
      return;
    }
    const data = await res.json();
    estadoActual = data;
    renderEstado(data);
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Sin conexión", text: "No se pudo contactar el servidor" });
  }
}

function renderEstado(data) {
  setTabsEstado(data.abierta);

  if (!data.abierta) {
    $badge.textContent = "Cerrada";
    $badge.className = "caja-badge caja-badge--cerrada";
    $vistaCerrada.style.display = "";
    $vistaAbierta.style.display = "none";
    return;
  }

  $badge.textContent = "Abierta";
  $badge.className = "caja-badge caja-badge--abierta";
  $vistaCerrada.style.display = "none";
  $vistaAbierta.style.display = "";

  const s = data.sesion;

  if ($cardEsperado) $cardEsperado.textContent = `$${money(data.efectivo_esperado)}`;
  if ($cardIngresos) $cardIngresos.textContent = `$${money(data.total_ingresos)}`;
  if ($cardEgresos)  $cardEgresos.textContent  = `$${money(data.total_egresos)}`;
  if ($cardInicial)  $cardInicial.textContent  = `$${money(s.monto_inicial)}`;
  if ($cardApertura) $cardApertura.textContent = fechaHora(s.fecha_apertura);
  if ($cardUsuario)  $cardUsuario.textContent  = s.usuario_apertura;

  // Ventas por método
  const ef = data.ventas_efectivo      || { total: 0, tickets: 0 };
  const ta = data.ventas_tarjeta       || { total: 0, tickets: 0 };
  const tr = data.ventas_transferencia || { total: 0, tickets: 0 };
  const cc = data.ventas_cuenta        || { total: 0, tickets: 0 };

  if ($cardVentas)               $cardVentas.textContent              = `$${money(ef.total)}`;
  if ($cardTickets)              $cardTickets.textContent             = `${ef.tickets} venta${ef.tickets !== 1 ? "s" : ""}`;
  if ($cardTarjeta)              $cardTarjeta.textContent             = `$${money(ta.total)}`;
  if ($cardTarjetaTickets)       $cardTarjetaTickets.textContent      = `${ta.tickets} venta${ta.tickets !== 1 ? "s" : ""}`;
  if ($cardTransferencia)        $cardTransferencia.textContent       = `$${money(tr.total)}`;
  if ($cardTransferenciaTickets) $cardTransferenciaTickets.textContent= `${tr.tickets} venta${tr.tickets !== 1 ? "s" : ""}`;
  if ($cardCuenta)               $cardCuenta.textContent              = `$${money(cc.total)}`;
  if ($cardCuentaTickets)        $cardCuentaTickets.textContent       = `${cc.tickets} venta${cc.tickets !== 1 ? "s" : ""}`;

  const totalVentas  = Number(ef.total) + Number(ta.total) + Number(tr.total) + Number(cc.total);
  const totalTickets = Number(ef.tickets) + Number(ta.tickets) + Number(tr.tickets) + Number(cc.tickets);
  const $cardTotalVentas  = document.getElementById("card-total-ventas");
  const $cardTotalTickets = document.getElementById("card-total-tickets");
  if ($cardTotalVentas)  $cardTotalVentas.textContent  = `$${money(totalVentas)}`;
  if ($cardTotalTickets) $cardTotalTickets.textContent = `${totalTickets} venta${totalTickets !== 1 ? "s" : ""}`;

  renderMovimientos(data.movimientos || []);
  renderCierrePreview(data);
}

function renderMovimientos(movs) {
  if (!$movTbody) return;
  if (!movs.length) {
    $movTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="4">
          <div class="empty-state">
            <span class="empty-icon">📋</span>
            <span>Sin movimientos aún</span>
          </div>
        </td>
      </tr>`;
    return;
  }
  $movTbody.innerHTML = movs.map(m => `
    <tr>
      <td>${horaCorta(m.fecha)}</td>
      <td>
        <span class="mov-badge mov-badge--${m.tipo}">
          ${m.tipo === "ingreso" ? "📈 Ingreso" : "📉 Egreso"}
        </span>
      </td>
      <td>${m.concepto || "–"}</td>
      <td class="right ${m.tipo === 'ingreso' ? 'text-green' : 'text-red'}">
        ${m.tipo === "egreso" ? "-" : "+"}$${money(m.monto)}
      </td>
    </tr>`).join("");
}

function renderCierrePreview(data) {
  if (!$cierrePreview) return;

  const ta = data.ventas_tarjeta       || { total: 0, tickets: 0 };
  const tr = data.ventas_transferencia || { total: 0, tickets: 0 };
  const cc = data.ventas_cuenta        || { total: 0, tickets: 0 };

  const otrosRow = (icono, label, val, tickets) => val > 0 ? `
    <div class="cierre-linea cierre-linea--otro">
      <span>${icono} ${label} <small class="cierre-tickets">${tickets} venta${tickets !== 1 ? "s" : ""}</small></span>
      <span class="cierre-otro-val">$${money(val)}</span>
    </div>` : "";

  const hayOtros = ta.total > 0 || tr.total > 0 || cc.total > 0;

  $cierrePreview.innerHTML = `
    <div class="cierre-linea">
      <span>Monto inicial</span>
      <span>$${money(data.sesion?.monto_inicial)}</span>
    </div>
    <div class="cierre-linea">
      <span>Ventas efectivo</span>
      <span class="text-green">+$${money(data.ventas_efectivo?.total)}</span>
    </div>
    <div class="cierre-linea">
      <span>Ingresos manuales</span>
      <span class="text-green">+$${money(data.total_ingresos)}</span>
    </div>
    <div class="cierre-linea">
      <span>Egresos</span>
      <span class="text-red">-$${money(data.total_egresos)}</span>
    </div>
    <div class="cierre-linea cierre-linea--total">
      <span>💵 Efectivo en caja</span>
      <span>$${money(data.efectivo_esperado)}</span>
    </div>
    ${hayOtros ? `
    <div class="cierre-separador">Cobros fuera de caja</div>
    ${otrosRow("💳", "Tarjeta", ta.total, ta.tickets)}
    ${otrosRow("📲", "Transferencia", tr.total, tr.tickets)}
    ${otrosRow("📒", "Cta. Corriente", cc.total, cc.tickets)}
    ` : ""}`;
}

/* ── Historial ── */
async function loadHistorial() {
  const $tbody = document.getElementById("hist-tbody");
  const $stat  = document.getElementById("hist-stat");
  if (!$tbody) return;

  $tbody.innerHTML = `<tr><td colspan="10">
    <div class="empty-state"><span class="empty-icon">⏳</span><span>Cargando…</span></div>
  </td></tr>`;

  try {
    const res = await api("/api/caja/historial");
    if (!res.ok) throw new Error("error");
    const rows = await res.json();

    if ($stat) $stat.textContent = `${rows.length} sesión${rows.length !== 1 ? "es" : ""}`;

    if (!rows.length) {
      $tbody.innerHTML = `<tr><td colspan="10">
        <div class="empty-state"><span class="empty-icon">📅</span><span>Sin historial aún</span></div>
      </td></tr>`;
      return;
    }

    $tbody.innerHTML = rows.map(r => {
      const dif    = Number(r.diferencia ?? 0);
      const difStr = r.conteo_efectivo != null
        ? `<span class="${dif > 0 ? 'dif-pos' : dif < 0 ? 'dif-neg' : 'dif-cero'}">${dif >= 0 ? "+" : ""}$${money(dif)}</span>`
        : `<span class="dif-cero">–</span>`;

      const estadoBadge = r.fecha_cierre
        ? `<span class="hc-badge hc-badge--closed">Cerrada</span>`
        : `<span class="hc-badge hc-badge--open">Abierta</span>`;

      return `<tr>
        <td class="hc-id">#${r.id}</td>
        <td class="hc-abierta">${fechaHora(r.fecha_apertura)}</td>
        <td>${fechaHora(r.fecha_cierre)}</td>
        <td>${r.usuario_apertura || "–"}</td>
        <td class="right">$${money(r.monto_inicial)}</td>
        <td class="right text-green">$${money(r.total_ventas_efectivo)}</td>
        <td class="right">$${money(r.efectivo_esperado)}</td>
        <td class="right">${r.conteo_efectivo != null ? `$${money(r.conteo_efectivo)}` : "–"}</td>
        <td class="right">${difStr}</td>
        <td class="center hc-stat">${estadoBadge}</td>
      </tr>`;
    }).join("");
  } catch (e) {
    console.error(e);
    $tbody.innerHTML = `<tr><td colspan="10">
      <div class="empty-state"><span class="empty-icon">⚠️</span><span>Error al cargar historial</span></div>
    </td></tr>`;
  }
}

/* ── Diferencia en tiempo real ── */
$conteo?.addEventListener("input", () => {
  if (!estadoActual?.abierta) return;
  const conteo = parseFloat($conteo.value);
  if (isNaN(conteo) || $conteo.value === "") {
    $difPreview.style.display = "none";
    return;
  }
  const esperado = Number(estadoActual.efectivo_esperado || 0);
  const dif = conteo - esperado;
  $difPreview.style.display = "flex";
  $difValor.textContent = `${dif >= 0 ? "+" : ""}$${money(dif)}`;
  $difValor.className = `dif-valor ${dif >= 0 ? "dif-positiva" : "dif-negativa"}`;
});

/* ── Abrir caja ── */
$btnAbrir?.addEventListener("click", async () => {
  const monto = Number($montoInicial?.value || 0);
  if (monto < 0) {
    Swal.fire({ icon: "warning", title: "Monto inválido", text: "El monto inicial no puede ser negativo" });
    return;
  }

  const confirm = await Swal.fire({
    title: "¿Abrir caja?",
    html: `Se iniciará una nueva sesión de caja.<br><br>Monto inicial: <b style="font-size:18px">$${money(monto)}</b>`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "✅ Abrir caja",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#00d875",
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await api("/api/caja/abrir", {
      method: "POST",
      body: JSON.stringify({ monto_inicial: monto }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "YA_ABIERTA") {
        Swal.fire({ icon: "info", title: "Caja ya abierta", text: "Ya hay una sesión activa" });
      } else {
        Swal.fire({ icon: "error", title: "Error", text: data.error || "No se pudo abrir la caja" });
      }
      return;
    }
    await Swal.fire({
      icon: "success", title: "Caja abierta",
      text: `Sesión #${data.sesion_id} iniciada`,
      timer: 1500, showConfirmButton: false,
    });
    loadEstado();
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

/* ── Movimientos ── */
$btnNuevoMov?.addEventListener("click", () => {
  const isOpen = $formMov.style.display !== "none";
  $formMov.style.display = isOpen ? "none" : "";
  $btnNuevoMov.textContent = isOpen ? "+ Agregar" : "✕ Cancelar";
  if (!isOpen) $movConcepto?.focus();
});

$btnCancelarMov?.addEventListener("click", () => {
  $formMov.style.display = "none";
  $btnNuevoMov.textContent = "+ Agregar";
  if ($movConcepto) $movConcepto.value = "";
  if ($movMonto) $movMonto.value = "";
});

$btnAgregarMov?.addEventListener("click", async () => {
  const tipo     = $movTipo?.value;
  const concepto = ($movConcepto?.value || "").trim();
  const monto    = Number($movMonto?.value || 0);

  if (!concepto) {
    Swal.fire({ icon: "warning", title: "Falta el concepto", text: "Describí el movimiento" });
    $movConcepto?.focus();
    return;
  }
  if (monto <= 0) {
    Swal.fire({ icon: "warning", title: "Monto inválido", text: "El monto debe ser mayor a cero" });
    $movMonto?.focus();
    return;
  }

  try {
    const res = await api("/api/caja/movimiento", {
      method: "POST",
      body: JSON.stringify({ tipo, concepto, monto }),
    });
    if (!res.ok) {
      const d = await res.json();
      Swal.fire({ icon: "error", title: "Error", text: d.error || "No se pudo registrar" });
      return;
    }
    if ($movConcepto) $movConcepto.value = "";
    if ($movMonto)    $movMonto.value    = "";
    $formMov.style.display = "none";
    $btnNuevoMov.textContent = "+ Agregar";
    await loadEstado();
    Swal.fire({
      icon: "success",
      title: `${tipo === "ingreso" ? "Ingreso" : "Egreso"} registrado`,
      timer: 1200, showConfirmButton: false,
    });
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

[$movConcepto, $movMonto].forEach(el => {
  el?.addEventListener("keydown", e => {
    if (e.key === "Enter") $btnAgregarMov?.click();
  });
});

/* ── Cerrar caja ── */
$btnCerrar?.addEventListener("click", async () => {
  const conteoVal = $conteo?.value !== "" ? Number($conteo.value) : null;
  const obsVal    = ($obs?.value || "").trim();
  const esperado  = Number(estadoActual?.efectivo_esperado || 0);
  const dif       = conteoVal !== null ? conteoVal - esperado : null;

  const ta = estadoActual?.ventas_tarjeta       || { total: 0, tickets: 0 };
  const tr = estadoActual?.ventas_transferencia || { total: 0, tickets: 0 };
  const cc = estadoActual?.ventas_cuenta        || { total: 0, tickets: 0 };

  const otrosSwal = (icono, label, val, tickets) => val > 0
    ? `<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:13px;opacity:.85">
         <span>${icono} ${label} <span style="opacity:.6;font-size:11px">${tickets} vta${tickets !== 1 ? "s" : ""}</span></span>
         <b>$${money(val)}</b>
       </div>`
    : "";

  const hayOtros = ta.total > 0 || tr.total > 0 || cc.total > 0;

  const htmlEfectivo = conteoVal !== null
    ? `<div style="display:flex;justify-content:space-between">
         <span>💵 Efectivo esperado</span><b>$${money(esperado)}</b>
       </div>
       <div style="display:flex;justify-content:space-between;margin-top:4px">
         <span>Conteo real</span><b>$${money(conteoVal)}</b>
       </div>
       <div style="display:flex;justify-content:space-between;margin-top:4px">
         <span>Diferencia</span>
         <b style="color:${dif >= 0 ? '#00d875' : '#ef4444'}">${dif >= 0 ? "+" : ""}$${money(dif)}</b>
       </div>`
    : `<div style="display:flex;justify-content:space-between">
         <span>💵 Efectivo esperado</span><b>$${money(esperado)}</b>
       </div>
       <div style="opacity:.6;font-size:12px;margin-top:4px">Sin conteo registrado</div>`;

  const htmlOtros = hayOtros
    ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(128,128,128,.25)">
         <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;opacity:.5;margin-bottom:6px">Cobros fuera de caja</div>
         ${otrosSwal("💳", "Tarjeta", ta.total, ta.tickets)}
         ${otrosSwal("📲", "Transferencia", tr.total, tr.tickets)}
         ${otrosSwal("📒", "Cta. Corriente", cc.total, cc.tickets)}
       </div>`
    : "";

  const confirm = await Swal.fire({
    title: "¿Cerrar la caja?",
    html: `<div style="text-align:left">${htmlEfectivo}${htmlOtros}</div><br><small style="opacity:.5">Esta acción finalizará la sesión actual</small>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "🔒 Cerrar caja",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#ef4444",
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await api("/api/caja/cerrar", {
      method: "POST",
      body: JSON.stringify({
        conteo_efectivo: conteoVal,
        observacion: obsVal,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: data.error || "No se pudo cerrar la caja" });
      return;
    }

    let detalle;
    try {
      const r2 = await api(`/api/caja/cierre/${data.cierre.sesion_id}`);
      detalle = await r2.json();
    } catch {
      detalle = { sesion: { ...data.cierre }, movimientos: [] };
    }

    const s    = detalle.sesion;
    const movs = detalle.movimientos || [];

    const difNum   = Number(s.diferencia || 0);
    const difColor = difNum >= 0 ? "#00d875" : "#ef4444";
    const difSign  = difNum >= 0 ? "+" : "";

    $cierreResumen.innerHTML = `
      <div class="cierre-resultado-grid">
        <div class="cr-item">
          <span class="cr-label">Sesión</span>
          <span class="cr-val">#${s.id || s.sesion_id}</span>
        </div>
        <div class="cr-item">
          <span class="cr-label">Apertura</span>
          <span class="cr-val">${fechaHora(s.fecha_apertura)}</span>
        </div>
        <div class="cr-item">
          <span class="cr-label">Cierre</span>
          <span class="cr-val">${fechaHora(s.fecha_cierre)}</span>
        </div>
        <div class="cr-item">
          <span class="cr-label">Monto inicial</span>
          <span class="cr-val">$${money(s.monto_inicial)}</span>
        </div>
        <div class="cr-item">
          <span class="cr-label">Ventas efectivo</span>
          <span class="cr-val text-green">$${money(s.total_ventas_efectivo)}</span>
        </div>
        <div class="cr-item">
          <span class="cr-label">Ingresos</span>
          <span class="cr-val text-green">$${money(s.total_mov_ingresos)}</span>
        </div>
        <div class="cr-item">
          <span class="cr-label">Egresos</span>
          <span class="cr-val text-red">$${money(s.total_mov_egresos)}</span>
        </div>
        <div class="cr-item cr-item--highlight">
          <span class="cr-label">Efectivo esperado</span>
          <span class="cr-val">$${money(s.efectivo_esperado)}</span>
        </div>
        ${s.conteo_efectivo != null ? `
        <div class="cr-item cr-item--highlight">
          <span class="cr-label">Conteo real</span>
          <span class="cr-val">$${money(s.conteo_efectivo)}</span>
        </div>
        <div class="cr-item cr-item--highlight">
          <span class="cr-label">Diferencia</span>
          <span class="cr-val" style="color:${difColor}">
            ${difSign}$${money(difNum)}
          </span>
        </div>` : ""}
      </div>`;

    $cierreMovs.innerHTML = movs.length
      ? movs.map(m => `
          <tr>
            <td>${horaCorta(m.fecha)}</td>
            <td>${m.tipo}</td>
            <td>${m.concepto || "–"}</td>
            <td class="right">$${money(m.monto)}</td>
          </tr>`).join("")
      : `<tr><td colspan="4" class="right">Sin movimientos</td></tr>`;

    $btnImprimir.onclick = () => {
      window.open(
        `/admin/caja-cierre.html?sesion=${encodeURIComponent(s.id || s.sesion_id)}`,
        "_blank"
      );
    };

    const cerrarModal = () => { $dlg.close(); loadEstado(); };
    $btnCerrarModal.onclick  = cerrarModal;
    $btnCerrarModal2.onclick = cerrarModal;

    $dlg.showModal();
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

/* ── Init ── */
switchTab("estado");
loadEstado();

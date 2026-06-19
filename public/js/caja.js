// public/js/caja.js — Caja completa
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

/* ── DOM refs ── */
const $badge          = document.getElementById("caja-badge");
const $vistaCerrada   = document.getElementById("vista-cerrada");
const $vistaAbierta   = document.getElementById("vista-abierta");
const $montoInicial   = document.getElementById("monto-inicial");
const $btnAbrir       = document.getElementById("btn-abrir");

// Cards
const $cardEsperado   = document.getElementById("card-esperado");
const $cardVentas     = document.getElementById("card-ventas");
const $cardTickets    = document.getElementById("card-tickets");
const $cardIngresos   = document.getElementById("card-ingresos");
const $cardEgresos    = document.getElementById("card-egresos");
const $cardInicial    = document.getElementById("card-inicial");
const $cardApertura   = document.getElementById("card-apertura");
const $cardUsuario    = document.getElementById("card-usuario");

// Movimientos
const $btnNuevoMov    = document.getElementById("btn-nuevo-mov");
const $formMov        = document.getElementById("form-movimiento");
const $movTipo        = document.getElementById("mov-tipo");
const $movConcepto    = document.getElementById("mov-concepto");
const $movMonto       = document.getElementById("mov-monto");
const $btnAgregarMov  = document.getElementById("btn-agregar-mov");
const $btnCancelarMov = document.getElementById("btn-cancelar-mov");
const $movTbody       = document.getElementById("mov-tbody");

// Cierre
const $conteo         = document.getElementById("conteo");
const $obs            = document.getElementById("obs");
const $btnCerrar      = document.getElementById("btn-cerrar");
const $difPreview     = document.getElementById("diferencia-preview");
const $difValor       = document.getElementById("dif-valor");
const $cierrePreview  = document.getElementById("cierre-resumen-preview");

// Modal
const $dlg            = document.getElementById("dlg-cierre");
const $cierreResumen  = document.getElementById("cierre-resumen");
const $cierreMovs     = document.getElementById("cierre-movs");
const $btnImprimir    = document.getElementById("btn-imprimir");
const $btnCerrarModal = document.getElementById("btn-cerrar-modal");
const $btnCerrarModal2= document.getElementById("btn-cerrar-modal2");

/* ── Reloj ── */
function actualizarHora() {
  const el = document.getElementById("caja-hora");
  if (el) el.textContent = new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
setInterval(actualizarHora, 1000);
actualizarHora();

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

  // Cards
  if ($cardEsperado) $cardEsperado.textContent = `$${money(data.efectivo_esperado)}`;
  if ($cardVentas)   $cardVentas.textContent   = `$${money(data.ventas_efectivo?.total)}`;
  if ($cardTickets)  $cardTickets.textContent  = `${data.ventas_efectivo?.tickets || 0} tickets`;
  if ($cardIngresos) $cardIngresos.textContent = `$${money(data.total_ingresos)}`;
  if ($cardEgresos)  $cardEgresos.textContent  = `$${money(data.total_egresos)}`;
  if ($cardInicial)  $cardInicial.textContent  = `$${money(s.monto_inicial)}`;
  if ($cardApertura) $cardApertura.textContent = fechaHora(s.fecha_apertura);
  if ($cardUsuario)  $cardUsuario.textContent  = s.usuario_apertura;

  // Movimientos
  renderMovimientos(data.movimientos || []);

  // Preview cierre
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
      <span>Efectivo esperado</span>
      <span>$${money(data.efectivo_esperado)}</span>
    </div>`;
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
    html: `Monto inicial: <b>$${money(monto)}</b>`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Abrir",
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
  $formMov.style.display = $formMov.style.display === "none" ? "" : "none";
  if ($formMov.style.display !== "none") {
    $movConcepto?.focus();
    $btnNuevoMov.textContent = "✕ Cancelar";
  } else {
    $btnNuevoMov.textContent = "+ Nuevo";
  }
});

$btnCancelarMov?.addEventListener("click", () => {
  $formMov.style.display = "none";
  $btnNuevoMov.textContent = "+ Nuevo";
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
    $btnNuevoMov.textContent = "+ Nuevo";
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

// Enter en los campos del form movimiento
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

  const html = conteoVal !== null
    ? `Efectivo esperado: <b>$${money(esperado)}</b><br>
       Conteo real: <b>$${money(conteoVal)}</b><br>
       Diferencia: <b style="color:${dif >= 0 ? '#00d875' : '#ef4444'}">
         ${dif >= 0 ? "+" : ""}$${money(dif)}
       </b>`
    : `Efectivo esperado: <b>$${money(esperado)}</b><br>
       <span style="opacity:.7">Sin conteo registrado</span>`;

  const confirm = await Swal.fire({
    title: "¿Cerrar caja?",
    html,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Cerrar caja",
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

    // Cargar detalle completo para el modal
    let detalle;
    try {
      const r2 = await api(`/api/caja/cierre/${data.cierre.sesion_id}`);
      detalle = await r2.json();
    } catch {
      detalle = { sesion: { ...data.cierre }, movimientos: [] };
    }

    const s    = detalle.sesion;
    const movs = detalle.movimientos || [];

    // Diferencia con color
    const difNum = Number(s.diferencia || 0);
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
loadEstado();
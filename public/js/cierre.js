// public/js/cierre.js
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

/* ── Utils ── */
function money(n) {
  return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

/* ── DOM refs ── */
const $fecha        = document.getElementById("fecha");
const $btnVer       = document.getElementById("btn-ver");
const $btnExp       = document.getElementById("btn-exportar");
const $tbody        = document.getElementById("tbody");
const $totVentas    = document.getElementById("total-ventas");
const $totTickets   = document.getElementById("total-tickets");
const $totDesc      = document.getElementById("total-desc");
const $promedio     = document.getElementById("promedio-ticket");
const $fechaBadge   = document.getElementById("cierre-fecha-badge");

// Fecha por defecto: hoy
if ($fecha) $fecha.valueAsDate = new Date();

/* ── Iconos por medio de pago ── */
const medioIconos = {
  efectivo:         "💵",
  tarjeta:          "💳",
  transferencia:    "📲",
  cuenta_corriente: "📒",
};

const medioLabels = {
  efectivo:         "Efectivo",
  tarjeta:          "Tarjeta",
  transferencia:    "Transferencia",
  cuenta_corriente: "Cuenta Corriente",
};

/* ── Datos actuales (para exportar) ── */
let datosActuales = null;

/* ── Cargar cierre ── */
async function cargar() {
  const f = $fecha?.value;
  if (!f) return;

  // Loading
  if ($tbody) $tbody.innerHTML = `
    <tr><td colspan="6">
      <div class="empty-state">
        <span class="empty-icon">⏳</span>
        <span>Cargando…</span>
      </div>
    </td></tr>`;

  try {
    const res  = await fetch(`/api/reportes/cierre-caja?fecha=${f}`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();

    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar el cierre" });
      return;
    }

    datosActuales = data;
    renderCierre(data, f);

  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}

/* ── Render ── */
function renderCierre(data, fecha) {
  // Badge fecha
  if ($fechaBadge) {
    const [y, m, d] = fecha.split("-");
    $fechaBadge.textContent = `${d}/${m}/${y}`;
  }

  // KPIs
  if ($totVentas)  $totVentas.textContent  = money(data.totalVentas);
  if ($totTickets) $totTickets.textContent = data.totalTickets;
  if ($totDesc)    $totDesc.textContent    = money(data.totalDesc);

  const promedio = data.totalTickets > 0
    ? data.totalVentas / data.totalTickets : 0;
  if ($promedio) $promedio.textContent = money(promedio);

  // Tabla
  if (!$tbody) return;

  if (!data.medios?.length) {
    $tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <span>Sin ventas para esta fecha</span>
        </div>
      </td></tr>`;
    return;
  }

  $tbody.innerHTML = data.medios.map(m => {
    const pct = data.totalVentas > 0
      ? Math.round((m.total / data.totalVentas) * 100) : 0;

    const icono = medioIconos[m.medio_pago] || "💰";
    const label = medioLabels[m.medio_pago] || m.medio_pago;

    return `
      <tr>
        <td>
          <div class="cierre-medio">
            <span class="cierre-medio-icon">${icono}</span>
            <span>${label}</span>
          </div>
        </td>
        <td class="center">${m.cantidad}</td>
        <td class="right">$${money(m.subtotal)}</td>
        <td class="right cierre-desc">
          ${m.descuentos > 0 ? `-$${money(m.descuentos)}` : "–"}
        </td>
        <td class="right cierre-total">$${money(m.total)}</td>
        <td class="right">
          <div class="cierre-pct-wrap">
            <span class="cierre-pct-val">${pct}%</span>
            <div class="cierre-pct-bar">
              <div class="cierre-pct-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join("");
}

/* ── Exportar CSV ── */
$btnExp?.addEventListener("click", () => {
  if (!datosActuales) {
    Swal.fire({ icon: "warning", title: "Sin datos", text: "Cargá un cierre primero" });
    return;
  }

  const fecha = $fecha?.value || "cierre";
  const rows  = [
    ["Medio de pago", "Cant. ventas", "Subtotal", "Descuentos", "Total neto"],
    ...datosActuales.medios.map(m => [
      medioLabels[m.medio_pago] || m.medio_pago,
      m.cantidad,
      money(m.subtotal),
      money(m.descuentos),
      money(m.total),
    ]),
    [],
    ["TOTAL", datosActuales.totalTickets, "", "", money(datosActuales.totalVentas)],
    ["DESCUENTOS", "", "", "", money(datosActuales.totalDesc)],
  ];

  const csv  = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `cierre-${fecha}.csv`;
  a.click();
});

/* ── Eventos ── */
$btnVer?.addEventListener("click", cargar);
$fecha?.addEventListener("keydown", e => { if (e.key === "Enter") cargar(); });

/* ── Init ── */
cargar();
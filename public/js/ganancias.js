// public/js/ganancias.js
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

/* ── Utils ── */
function money(n) {
  return "$\u00a0" + (Number(n) || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
  });
}

function fechaISO(date) {
  return date.toISOString().slice(0, 10);
}

/* ── DOM refs ── */
const $desde      = document.getElementById("desde");
const $hasta      = document.getElementById("hasta");
const $btnAplicar = document.getElementById("btn-aplicar");
const $tbody      = document.getElementById("tbody-ganancias");
const $periodo    = document.getElementById("gan-periodo");

// KPIs
const $kIngresos  = document.getElementById("k-ingresos");
const $kCostos    = document.getElementById("k-costos");
const $kGanancia  = document.getElementById("k-ganancia");
const $kMargen    = document.getElementById("k-margen");
const $kDesc      = document.getElementById("k-descuentos");
const $kNeto      = document.getElementById("k-neto");
const $kTickets   = document.getElementById("k-tickets");

/* ── Fechas por defecto: últimos 30 días ── */
const hoy    = new Date();
const hace30 = new Date(hoy - 30 * 24 * 60 * 60 * 1000);
if ($hasta) $hasta.value = fechaISO(hoy);
if ($desde) $desde.value = fechaISO(hace30);

/* ── Accesos rápidos ── */
document.querySelectorAll(".gan-accesos-rapidos [data-dias]").forEach(btn => {
  btn.addEventListener("click", () => {
    const dias = Number(btn.dataset.dias);
    const desde = new Date(hoy - (dias - 1) * 24 * 60 * 60 * 1000);
    if ($desde) $desde.value = fechaISO(desde);
    if ($hasta) $hasta.value = fechaISO(hoy);
    cargar();
  });
});

$btnAplicar?.addEventListener("click", cargar);

/* ── Chart ── */
let chart     = null;
let tipoChart = "bar";

document.querySelectorAll(".gan-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gan-toggle").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tipoChart = btn.dataset.tipo;
    if (chart) {
      chart.config.type = tipoChart;
      chart.update();
    }
  });
});

function getChartColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    grid:    isDark ? "#1b2741" : "#e5e7eb",
    ticks:   isDark ? "#99a8c6" : "#6b7280",
    legend:  isDark ? "#99a8c6" : "#374151",
  };
}

function buildChart(labels, ingresos, ganancias) {
  const ctx = document.getElementById("chart");
  if (!ctx) return;
  const colors = getChartColors();

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: tipoChart,
    data: {
      labels,
      datasets: [
        {
          label: "Ingresos",
          data: ingresos,
          backgroundColor: "rgba(96, 165, 250, 0.7)",
          borderColor: "#60a5fa",
          borderWidth: 2,
          borderRadius: 4,
          tension: 0.4,
        },
        {
          label: "Ganancia bruta",
          data: ganancias,
          backgroundColor: "rgba(0, 196, 112, 0.7)",
          borderColor: "#00c470",
          borderWidth: 2,
          borderRadius: 4,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: colors.legend, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${money(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.ticks, font: { size: 11 } },
          grid:  { color: colors.grid },
        },
        y: {
          ticks: {
            color: colors.ticks,
            font: { size: 11 },
            callback: v => "$" + Number(v).toLocaleString("es-AR"),
          },
          grid: { color: colors.grid },
        },
      },
    },
  });
}

/* ── Cargar datos ── */
async function cargar() {
  const desde = $desde?.value;
  const hasta = $hasta?.value;

  if (!desde || !hasta) return;

  // Loading en KPIs
  ["k-ingresos","k-costos","k-ganancia","k-descuentos","k-neto"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "…"; });

  try {
    const res = await fetch(
      `/api/reportes/ganancias?date_from=${desde}&date_to=${hasta}`,
      { headers: { Authorization: "Bearer " + token } }
    );

    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: "No se pudieron cargar los datos" });
      return;
    }

    const d = await res.json();

    // KPIs
    if ($kIngresos) $kIngresos.textContent = money(d.total_ingresos);
    if ($kCostos)   $kCostos.textContent   = money(d.total_costos);
    if ($kGanancia) $kGanancia.textContent = money(d.total_ganancia);
    if ($kMargen)   $kMargen.textContent   = `margen ${d.margen_promedio}%`;
    if ($kDesc)     $kDesc.textContent     = money(d.total_descuentos);
    if ($kNeto)     $kNeto.textContent     = money(d.total_neto);

    const totalTickets = (d.detalle || []).reduce((s, r) => s + r.tickets, 0);
    if ($kTickets) $kTickets.textContent = `${totalTickets} tickets`;

    // Badge período
    if ($periodo) {
      $periodo.textContent = `${desde} → ${hasta}`;
    }

    // Tabla
    renderTabla(d.detalle || []);

    // Gráfico
    const labels    = d.detalle.map(r => r.dia);
    const ingresos  = d.detalle.map(r => r.ingresos);
    const ganancias = d.detalle.map(r => r.ganancia_bruta);
    buildChart(labels, ingresos, ganancias);

  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}

/* ── Tabla ── */
function renderTabla(detalle) {
  if (!$tbody) return;

  if (!detalle.length) {
    $tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <span>Sin datos para el período seleccionado</span>
        </div>
      </td></tr>`;
    return;
  }

  $tbody.innerHTML = detalle.map(r => {
    const margen = r.ingresos > 0
      ? Math.round((r.ganancia_bruta / r.ingresos) * 100) : 0;

    const margenClass = margen >= 30 ? "margen-alto"
      : margen >= 15 ? "margen-medio"
      : "margen-bajo";

    return `
      <tr>
        <td class="gan-fecha">${r.dia}</td>
        <td class="center">${r.tickets}</td>
        <td class="right">$${(r.ingresos||0).toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
        <td class="right gan-costos">$${(r.costos||0).toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
        <td class="right gan-desc">$${(r.descuentos||0).toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
        <td class="right gan-ganancia">$${(r.ganancia_bruta||0).toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
        <td class="right">
          <span class="margen-badge ${margenClass}">${margen}%</span>
        </td>
      </tr>`;
  }).join("");
}

/* ── Init ── */
cargar();
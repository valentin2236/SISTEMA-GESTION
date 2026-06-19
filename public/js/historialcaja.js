// public/js/historialcaja.js
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

function money(n) {
  return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fechaHora(f) {
  if (!f) return "–";
  return new Date(f).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function cargar() {
  try {
    const res  = await fetch("/api/caja/historial", {
      headers: { Authorization: "Bearer " + token },
    });
    const rows = await res.json();

    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar el historial" });
      return;
    }

    const $stat = document.getElementById("hc-stat");
    if ($stat) $stat.textContent = `${rows.length} sesión${rows.length !== 1 ? "es" : ""}`;

    const $tbody = document.getElementById("tbody");
    if (!$tbody) return;

    if (!rows.length) {
      $tbody.innerHTML = `
        <tr><td colspan="10">
          <div class="empty-state">
            <span class="empty-icon">📭</span>
            <span>Sin cierres registrados</span>
          </div>
        </td></tr>`;
      return;
    }

    $tbody.innerHTML = rows.map(c => {
      const dif    = Number(c.diferencia);
      const difClass = dif < 0 ? "dif-neg" : dif > 0 ? "dif-pos" : "dif-cero";
      const difSign  = dif > 0 ? "+" : "";
      const abierta  = !c.fecha_cierre;

      return `
        <tr>
          <td class="hc-id">#${c.id}</td>
          <td>${fechaHora(c.fecha_apertura)}</td>
          <td>${abierta ? '<span class="hc-abierta">En curso</span>' : fechaHora(c.fecha_cierre)}</td>
          <td>${c.usuario_cierre || c.usuario_apertura || "–"}</td>
          <td class="right">$${money(c.monto_inicial)}</td>
          <td class="right">$${money(c.total_ventas_efectivo)}</td>
          <td class="right hc-esperado">$${money(c.efectivo_esperado)}</td>
          <td class="right">${c.conteo_efectivo != null ? "$" + money(c.conteo_efectivo) : '<span class="hc-nc">S/C</span>'}</td>
          <td class="right">
            ${c.diferencia != null
              ? `<span class="hc-dif ${difClass}">${difSign}$${money(Math.abs(dif))}</span>`
              : '<span class="hc-nc">–</span>'}
          </td>
          <td class="center">
            ${abierta
              ? '<span class="hc-badge hc-badge--open">Abierta</span>'
              : '<span class="hc-badge hc-badge--closed">Cerrada</span>'}
          </td>
        </tr>`;
    }).join("");

  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}

cargar();
// public/js/admin.js
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) { location.href = "/admin/login.html"; return; }

  const $desde  = document.getElementById("f-desde");
  const $hasta  = document.getElementById("f-hasta");
  const $medio  = document.getElementById("f-medio");
  const $btn    = document.getElementById("btn-filtrar");
  const $tbody  = document.getElementById("ventas-tbody");
  const $excel  = document.getElementById("btnExcel");

  // Fechas por defecto: mes actual
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  if ($desde) $desde.value = primerDia.toISOString().slice(0, 10);
  if ($hasta) $hasta.value = hoy.toISOString().slice(0, 10);

  function money(n) {
    return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  const medioLabels = {
    efectivo:         "💵 Efectivo",
    tarjeta:          "💳 Tarjeta",
    transferencia:    "📲 Transferencia",
    cuenta_corriente: "📒 Cta. Corriente",
  };

  async function api(path) {
    const res = await fetch(path, {
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user_rol");
      location.href = "/admin/login.html";
      return null;
    }
    return res;
  }

  let datosActuales = [];

  async function cargar() {
    $tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span class="empty-icon">⏳</span><span>Cargando…</span></div></td></tr>`;

    const p = new URLSearchParams();
    if ($desde?.value) p.set("date_from", $desde.value);
    if ($hasta?.value) p.set("date_to",   $hasta.value);
    if ($medio?.value) p.set("medio",     $medio.value);
    p.set("limit", "200");

    const res = await api(`/api/ventas?${p.toString()}`);
    if (!res) return;

    if (!res.ok) {
      $tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span class="empty-icon">⚠️</span><span>Error ${res.status}</span></div></td></tr>`;
      return;
    }

    const data = await res.json();
    datosActuales = Array.isArray(data) ? data : [];

    if (!datosActuales.length) {
      $tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span class="empty-icon">📭</span><span>Sin ventas para este período</span></div></td></tr>`;
      actualizarKpis([]);
      return;
    }

    actualizarKpis(datosActuales);
    renderTabla(datosActuales);
  }

  function actualizarKpis(data) {
    const total    = data.reduce((a, v) => a + Number(v.total    || 0), 0);
    const subtotal = data.reduce((a, v) => a + Number(v.subtotal || 0), 0);
    const descuentos = subtotal - total + data.reduce((a, v) => a + Number(v.recargo_monto || 0), 0);
    const prom     = data.length ? total / data.length : 0;

    document.getElementById("cantVentas").textContent      = data.length;
    document.getElementById("totalVentas").textContent     = money(total);
    document.getElementById("ticketPromedio").textContent  = money(prom);
    document.getElementById("totalDescuentos").textContent = money(Math.max(0, descuentos));
  }

  function renderTabla(data) {
    $tbody.innerHTML = data.map(v => {
      const desc = v.descuento_tipo === "porcentaje"
        ? `${v.descuento_valor || 0}%`
        : `$${money(v.descuento_valor || 0)}`;

      const fecha = new Date(v.fecha).toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });

      return `
        <tr>
          <td class="muted-cell">#${v.id}</td>
          <td>${fecha}</td>
          <td>${v.usuario || "—"}</td>
          <td>${medioLabels[v.medio_pago] || v.medio_pago || "—"}</td>
          <td class="right">$${money(v.subtotal)}</td>
          <td class="right ${Number(v.descuento_valor) > 0 ? "ven-desc" : ""}">
            ${Number(v.descuento_valor) > 0 ? `−${desc}` : "—"}
          </td>
          <td class="right ${Number(v.recargo_monto) > 0 ? "ven-recargo" : ""}">
            ${Number(v.recargo_monto) > 0 ? `+$${money(v.recargo_monto)}` : "—"}
          </td>
          <td class="right ven-total">$${money(v.total)}</td>
          <td class="center">
            <a class="btn-edit" href="/ticket.html?id=${v.id}" target="_blank" title="Ver ticket">🧾</a>
          </td>
        </tr>`;
    }).join("");
  }

  /* ── Exportar Excel (CSV) ── */
  $excel?.addEventListener("click", () => {
    if (!datosActuales.length) {
      Swal.fire({ icon: "warning", title: "Sin datos", text: "Filtrá primero para tener ventas." });
      return;
    }
    const rows = [
      ["#", "Fecha", "Usuario", "Medio de pago", "Subtotal", "Descuento", "Recargo", "Total"],
      ...datosActuales.map(v => [
        v.id,
        new Date(v.fecha).toLocaleString("es-AR"),
        v.usuario || "",
        v.medio_pago || "",
        money(v.subtotal),
        v.descuento_tipo === "porcentaje" ? `${v.descuento_valor || 0}%` : money(v.descuento_valor || 0),
        money(v.recargo_monto || 0),
        money(v.total),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a    = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `ventas-${$desde?.value || "export"}.csv`,
    });
    a.click();
  });

  $btn?.addEventListener("click", cargar);
  $desde?.addEventListener("keydown", e => e.key === "Enter" && cargar());
  $hasta?.addEventListener("keydown", e => e.key === "Enter" && cargar());

  cargar();
});
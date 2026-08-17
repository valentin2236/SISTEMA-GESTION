const token = localStorage.getItem("token");

if (!token) {
  location.href = "/admin/login.html";
}

const tbody = document.getElementById("tbodyClientes");
const searchInput = document.getElementById("search");
const btnSoloDeuda = document.getElementById("btn-solo-deuda");

let soloDeuda = false;

const dlgCliente = document.getElementById("dlg-cliente");
const btnNuevo = document.getElementById("btnNuevo");
const cerrarModal = document.getElementById("cerrarModal");

const form = document.getElementById("formCliente");

const clienteId = document.getElementById("clienteId");
const nombre = document.getElementById("nombre");
const email = document.getElementById("email");
const telefono = document.getElementById("telefono");
const dni = document.getElementById("dni");
const direccion = document.getElementById("direccion");

const modalTitle = document.getElementById("modalTitle");
const dlgHistorial = document.getElementById("dlg-historial");
const cerrarHistorial = document.getElementById("cerrarHistorial");
const historialContent = document.getElementById("historialContent");

const dlgCuenta = document.getElementById("dlg-cuenta");
const cerrarCuenta = document.getElementById("cerrarCuenta");
const cuentaContent = document.getElementById("cuentaContent");

// =========================
// CARGAR CLIENTES
// =========================

async function cargarClientes(search = "") {
  try {
    const params = new URLSearchParams({ search });
    if (soloDeuda) params.set("soloDeuda", "1");
    const res = await fetch(`/api/clientes?${params}`, {
      headers: { Authorization: "Bearer " + token },
    });
    const clientes = await res.json();
    renderClientes(clientes);
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: "error",
      title: "Error al cargar",
      text: "No se pudieron cargar los clientes. Verificá tu conexión.",
    });
  }
}

// =========================
// RENDER CLIENTES
// =========================

function money(n) {
  return (Number(n) || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function renderSaldoBadge(saldo) {
  if (saldo > 0) {
    return `<span class="saldo-badge saldo-badge--deuda">Debe $${money(saldo)}</span>`;
  }
  if (saldo < 0) {
    return `<span class="saldo-badge saldo-badge--favor">A favor $${money(Math.abs(saldo))}</span>`;
  }
  return `<span class="saldo-badge saldo-badge--ok">Al día</span>`;
}

function renderClientes(clientes) {
  tbody.innerHTML = "";

  if (!clientes.length) {
    const msg = soloDeuda ? "Ningún cliente tiene saldo pendiente" : "No se encontraron clientes";
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <span class="empty-icon">👥</span>
            <span>${msg}</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  clientes.forEach((cliente) => {
    const saldo = Number(cliente.saldo_cc || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cliente.id}</td>
      <td>
        <div class="cli-nombre-cell">
          <div class="cli-avatar">${cliente.nombre.charAt(0).toUpperCase()}</div>
          <strong>${cliente.nombre}</strong>
        </div>
      </td>
      <td class="copy-cell" title="Click para copiar">${cliente.email || "-"}</td>
      <td class="copy-cell" title="Click para copiar">${cliente.telefono || "-"}</td>
      <td class="copy-cell" title="Click para copiar">${cliente.dni || "-"}</td>
      <td class="col-saldo">${renderSaldoBadge(saldo)}</td>
      <td>
        <div class="cli-actions-row">
          <button class="btn btn-outline btn-sm" data-action="editar" data-id="${cliente.id}" title="Editar cliente">✏️ Editar</button>
          <button class="btn btn-outline btn-sm" data-action="historial" data-id="${cliente.id}" title="Ver historial de compras">📋</button>
          <button class="btn btn-outline btn-sm" data-action="cuenta" data-id="${cliente.id}" data-nombre="${cliente.nombre}" title="Ver cuenta corriente">💳</button>
          <button class="btn btn-outline btn-sm btn-del" data-action="eliminar" data-id="${cliente.id}" title="Eliminar cliente">🗑️</button>
        </div>
      </td>`;

    // Copy cells
    tr.querySelectorAll(".copy-cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        const text = cell.textContent.trim();
        if (text && text !== "-") copiarTexto(text);
      });
    });

    // Action buttons
    tr.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = Number(btn.dataset.id);
        if (action === "editar") editarCliente(id);
        else if (action === "historial") verHistorial(id);
        else if (action === "cuenta") verCuentaCorriente(id, btn.dataset.nombre || "");
        else if (action === "eliminar") eliminarCliente(id);
      });
    });

    tbody.appendChild(tr);
  });
}

function copiarTexto(texto) {
  navigator.clipboard.writeText(texto);
  Swal.fire({
    toast: true,
    position: "top-end",
    icon: "success",
    title: "Copiado al portapapeles",
    timer: 1500,
    showConfirmButton: false,
  });
}

// =========================
// BUSCADOR
// =========================

let searchTimeout;
searchInput.addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => cargarClientes(e.target.value), 300);
});

btnSoloDeuda?.addEventListener("click", () => {
  soloDeuda = !soloDeuda;
  btnSoloDeuda.classList.toggle("active", soloDeuda);
  btnSoloDeuda.textContent = soloDeuda ? "📒 Solo con deuda ✓" : "📒 Solo con deuda";
  cargarClientes(searchInput.value);
});

// =========================
// MODAL
// =========================

btnNuevo.addEventListener("click", () => {
  limpiarFormulario();
  modalTitle.textContent = "👤 Nuevo cliente";
  dlgCliente.showModal();
  setTimeout(() => nombre.focus(), 50);
});

cerrarModal.addEventListener("click", () => dlgCliente.close());

document.getElementById("btn-guardar-cliente")?.addEventListener("click", () => {
  form.requestSubmit();
});

// =========================
// LIMPIAR FORM
// =========================

function limpiarFormulario() {
  clienteId.value = "";
  nombre.value = "";
  email.value = "";
  telefono.value = "";
  dni.value = "";
  direccion.value = "";
}

// =========================
// GUARDAR CLIENTE
// =========================

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    nombre: nombre.value,
    email: email.value,
    telefono: telefono.value,
    dni: dni.value,
    direccion: direccion.value,
  };

  try {
    let url = "/api/clientes";
    let method = "POST";

    if (clienteId.value) {
      url = `/api/clientes/${clienteId.value}`;
      method = "PUT";
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (!res.ok) {
      return Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: result.error || "Verificá los datos e intentá de nuevo",
      });
    }

    dlgCliente.close();
    cargarClientes();

    Swal.fire({
      icon: "success",
      title: clienteId.value ? "Cliente actualizado" : "Cliente creado",
      timer: 1500,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: "error",
      title: "Error de conexión",
      text: "No se pudo guardar el cliente. Verificá tu conexión.",
    });
  }
});

// =========================
// EDITAR CLIENTE
// =========================

async function editarCliente(id) {
  try {
    const res = await fetch(`/api/clientes/${id}`, {
      headers: { Authorization: "Bearer " + token },
    });

    const cliente = await res.json();

    clienteId.value = cliente.id;
    nombre.value = cliente.nombre || "";
    email.value = cliente.email || "";
    telefono.value = cliente.telefono || "";
    dni.value = cliente.dni || "";
    direccion.value = cliente.direccion || "";

    modalTitle.textContent = "✏️ Editar cliente";
    dlgCliente.showModal();
    setTimeout(() => nombre.focus(), 50);
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: "error",
      title: "Error al cargar",
      text: "No se pudo cargar los datos del cliente",
    });
  }
}

// =========================
// ELIMINAR CLIENTE
// =========================

async function eliminarCliente(id) {
  const result = await Swal.fire({
    title: "¿Eliminar este cliente?",
    text: "Se eliminará de forma permanente junto con su historial",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#6b7280",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/clientes/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });

    const data = await res.json();

    if (!res.ok) {
      return Swal.fire({
        icon: "error",
        title: "No se pudo eliminar",
        text: data.error || "El cliente puede tener ventas asociadas",
      });
    }

    cargarClientes();

    Swal.fire({
      icon: "success",
      title: "Cliente eliminado",
      timer: 1500,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: "error",
      title: "Error de conexión",
      text: "No se pudo eliminar el cliente",
    });
  }
}

// =========================
// VER HISTORIAL
// =========================

async function verHistorial(id) {
  try {
    const res = await fetch(`/api/clientes/${id}/compras`, {
      headers: { Authorization: "Bearer " + token },
    });

    const data = await res.json();

    if (!res.ok) {
      return Swal.fire({
        icon: "error",
        title: "Error",
        text: data.error || "No se pudo cargar el historial",
      });
    }

    historialContent.innerHTML = `
      <div class="cli-modal-header">
        <div class="cli-modal-avatar">${data.cliente.nombre.charAt(0).toUpperCase()}</div>
        <div>
          <div class="cli-modal-name">${data.cliente.nombre}</div>
          <div class="cli-modal-sub">Historial de compras</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total compras</div>
          <div class="kpi-value blue">${data.total_compras}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total gastado</div>
          <div class="kpi-value green">$${Number(data.total_gastado).toLocaleString("es-AR")}</div>
        </div>
      </div>

      ${data.compras.length ? `
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th class="right">Total</th>
              <th>Medio</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            ${data.compras.map((c) => `
              <tr>
                <td>${c.id}</td>
                <td>${new Date(c.fecha).toLocaleDateString("es-AR")}</td>
                <td class="right">$${Number(c.total).toLocaleString("es-AR")}</td>
                <td><span class="dash-badge blue">${c.medio_pago}</span></td>
                <td>${c.usuario}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : '<div class="empty-state"><span class="empty-icon">📋</span><span>Sin compras registradas</span></div>'}`;

    dlgHistorial.showModal();
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el historial",
    });
  }
}

// =========================
// VER CUENTA CORRIENTE
// =========================

let _ccClienteId = null;
let _ccClienteNombre = "";

async function verCuentaCorriente(id, clienteNombre = "") {
  _ccClienteId = id;
  try {
    const res = await fetch(`/api/clientes/${id}/cuenta-corriente`, {
      headers: { Authorization: "Bearer " + token },
    });

    const data = await res.json();

    if (!clienteNombre) {
      const resCliente = await fetch(`/api/clientes/${id}`, {
        headers: { Authorization: "Bearer " + token },
      });
      const cliente = await resCliente.json();
      clienteNombre = cliente.nombre || "Cliente";
    }
    _ccClienteNombre = clienteNombre;

    if (!res.ok) throw new Error();

    const saldoColor = data.saldo > 0 ? "var(--danger)" : "var(--accent)";
    const saldoLabel = data.saldo > 0 ? "Debe" : "Al día";

    function ventaIdDesdDesc(desc) {
      const m = /Venta #(\d+)/i.exec(desc || "");
      return m ? m[1] : null;
    }

    cuentaContent.innerHTML = `
      <div class="cli-modal-header">
        <div class="cli-modal-avatar">${clienteNombre.charAt(0).toUpperCase()}</div>
        <div style="flex:1">
          <div class="cli-modal-name">${clienteNombre}</div>
          <div class="cli-modal-sub">Cuenta Corriente</div>
        </div>
        <div class="cli-saldo-box">
          <div class="cli-saldo-label">Saldo</div>
          <div class="cli-saldo-value" style="color:${saldoColor}">
            $${Number(Math.abs(data.saldo)).toLocaleString("es-AR")}
          </div>
          <span class="cli-saldo-status" style="color:${saldoColor}">${saldoLabel}</span>
        </div>
      </div>

      <div class="cli-cuenta-actions">
        <button class="btn btn-primary btn-sm" id="btn-reg-pago" style="flex:1">💵 Registrar pago</button>
        <button class="btn btn-outline btn-sm" id="btn-reg-deuda" style="flex:1">📝 Registrar deuda</button>
        <button class="btn btn-outline btn-sm" id="btn-exportar-pdf" style="flex:1">🖨️ Exportar PDF</button>
      </div>

      ${data.movimientos.length ? `
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th class="right">Monto</th>
              <th>Descripción</th>
              <th style="width:110px"></th>
            </tr>
          </thead>
          <tbody>
            ${data.movimientos.map((m) => {
              const vid = ventaIdDesdDesc(m.descripcion);
              return `
              <tr>
                <td>${new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                <td><span class="dash-badge ${m.tipo === 'pago' ? 'green' : 'red'}">${m.tipo === 'pago' ? '✅ Pago' : '📝 Deuda'}</span></td>
                <td class="right">$${Number(m.monto).toLocaleString("es-AR")}</td>
                <td>${m.descripcion || "-"}${vid ? ` <a href="/ticket.html?id=${vid}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;margin-left:4px">🎫 ticket</a>` : ''}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-outline btn-sm" data-mov-editar="${m.id}" title="Editar">✏️</button>
                  <button class="btn btn-outline btn-sm btn-del" data-mov-eliminar="${m.id}" title="Eliminar">🗑️</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : '<div class="empty-state"><span class="empty-icon">💳</span><span>Sin movimientos</span></div>'}`;

    document.getElementById("btn-reg-pago")?.addEventListener("click", () => registrarMovimiento(id, "pago", clienteNombre));
    document.getElementById("btn-reg-deuda")?.addEventListener("click", () => registrarMovimiento(id, "deuda", clienteNombre));
    document.getElementById("btn-exportar-pdf")?.addEventListener("click", () => exportarPdfCC(data, clienteNombre));

    cuentaContent.querySelectorAll("[data-mov-editar]").forEach(btn => {
      btn.addEventListener("click", () => editarMovimiento(id, btn.dataset.movEditar, data.movimientos, clienteNombre));
    });
    cuentaContent.querySelectorAll("[data-mov-eliminar]").forEach(btn => {
      btn.addEventListener("click", () => eliminarMovimiento(id, btn.dataset.movEliminar, clienteNombre));
    });

    dlgCuenta.showModal();
  } catch (error) {
    Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar la cuenta corriente" });
  }
}

// =========================
// EDITAR MOVIMIENTO CC
// =========================

async function editarMovimiento(clienteId, movId, movimientos, clienteNombre) {
  const mov = movimientos.find(m => String(m.id) === String(movId));
  if (!mov) return;
  const fechaVal = mov.fecha ? mov.fecha.slice(0, 10) : "";
  const { value } = await Swal.fire({
    target: dlgCuenta,
    title: "✏️ Editar movimiento",
    html: `
      <div style="text-align:left;display:flex;flex-direction:column;gap:10px">
        <label style="font-size:13px;font-weight:600">Tipo</label>
        <select id="swal-tipo" class="swal2-input" style="margin:0">
          <option value="deuda" ${mov.tipo==='deuda'?'selected':''}>📝 Deuda</option>
          <option value="pago"  ${mov.tipo==='pago' ?'selected':''}>✅ Pago</option>
        </select>
        <label style="font-size:13px;font-weight:600">Monto *</label>
        <input id="swal-monto" type="number" class="swal2-input" value="${mov.monto}" min="0.01" step="0.01" style="margin:0">
        <label style="font-size:13px;font-weight:600">Descripción</label>
        <input id="swal-desc" type="text" class="swal2-input" value="${mov.descripcion || ''}" style="margin:0">
        <label style="font-size:13px;font-weight:600">Fecha</label>
        <input id="swal-fecha" type="date" class="swal2-input" value="${fechaVal}" style="margin:0">
      </div>`,
    showCancelButton: true,
    confirmButtonText: "Guardar cambios",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#1e8fff",
    preConfirm: () => {
      const monto = document.getElementById("swal-monto").value;
      if (!monto || Number(monto) <= 0) { Swal.showValidationMessage("Monto inválido"); return false; }
      return {
        tipo: document.getElementById("swal-tipo").value,
        monto,
        descripcion: document.getElementById("swal-desc").value,
        fecha: document.getElementById("swal-fecha").value,
      };
    },
  });
  if (!value) return;
  try {
    const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente/${movId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error();
    Swal.fire({ target: dlgCuenta, icon: "success", title: "Movimiento actualizado", timer: 1400, showConfirmButton: false });
    dlgCuenta.close();
    await verCuentaCorriente(clienteId, clienteNombre);
  } catch {
    Swal.fire({ target: dlgCuenta, icon: "error", title: "Error", text: "No se pudo actualizar el movimiento" });
  }
}

// =========================
// ELIMINAR MOVIMIENTO CC
// =========================

async function eliminarMovimiento(clienteId, movId, clienteNombre) {
  const conf = await Swal.fire({
    target: dlgCuenta,
    title: "¿Eliminar este movimiento?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });
  if (!conf.isConfirmed) return;
  try {
    const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente/${movId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error();
    Swal.fire({ target: dlgCuenta, icon: "success", title: "Movimiento eliminado", timer: 1400, showConfirmButton: false });
    dlgCuenta.close();
    await verCuentaCorriente(clienteId, clienteNombre);
  } catch {
    Swal.fire({ target: dlgCuenta, icon: "error", title: "Error", text: "No se pudo eliminar el movimiento" });
  }
}

// =========================
// EXPORTAR PDF CUENTA CORRIENTE
// =========================

function exportarPdfCC(data, clienteNombre) {
  const saldo = data.saldo;
  const fmt = n => Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 });
  const fechaHoy = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const totalDeuda = data.movimientos.filter(m => m.tipo === "deuda").reduce((s, m) => s + Number(m.monto), 0);
  const totalPagos = data.movimientos.filter(m => m.tipo === "pago").reduce((s, m) => s + Number(m.monto), 0);

  const saldoColor = saldo > 0 ? "#dc2626" : "#16a34a";
  const saldoLabel = saldo > 0 ? `Debe $${fmt(Math.abs(saldo))}` : "Al día ✓";

  const filas = data.movimientos.map((m, i) => {
    const fecha = new Date(m.fecha).toLocaleDateString("es-AR");
    const esPago = m.tipo === "pago";
    const monto = fmt(m.monto);
    const desc  = (m.descripcion || "-").replace(/</g, "&lt;");
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="fecha">${fecha}</td>
      <td><span class="badge ${esPago ? 'badge-pago' : 'badge-deuda'}">${esPago ? "Pago" : "Deuda"}</span></td>
      <td class="monto ${esPago ? 'monto-pago' : 'monto-deuda'}">$${monto}</td>
      <td class="desc">${desc}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Cuenta Corriente — ${clienteNombre}</title>
<style>
  :root {
    --ink: #0d1b2a;
    --accent: #1e6fff;
    --red: #dc2626;
    --green: #16a34a;
    --muted: #64748b;
    --border: #e2e8f0;
    --surface: #f8fafc;
  }
  * { margin:0; padding:0; box-sizing:border-box }
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 13px; color: var(--ink); background: #fff; }

  /* ── Toolbar (oculto al imprimir) ── */
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    background: var(--ink); color: #fff;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 32px; gap: 12px;
    print-color-adjust: exact;
  }
  .toolbar-title { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
  .toolbar-actions { display: flex; gap: 8px; }
  .btn-print {
    background: var(--accent); color: #fff; border: none;
    padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity .15s;
  }
  .btn-print:hover { opacity: .85 }
  .btn-close {
    background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.2);
    padding: 8px 16px; border-radius: 8px; font-size: 13px;
    cursor: pointer; transition: background .15s;
  }
  .btn-close:hover { background: rgba(255,255,255,.2) }

  /* ── Página ── */
  .page { max-width: 820px; margin: 32px auto; padding: 0 24px 48px; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid var(--ink); }
  .header-left h1 { font-size: 26px; font-weight: 900; color: var(--ink); letter-spacing: -.02em; }
  .header-left .client { font-size: 17px; font-weight: 600; color: var(--accent); margin-top: 4px; }
  .header-left .meta { font-size: 11px; color: var(--muted); margin-top: 6px; line-height: 1.7; }
  .header-right { text-align: right; }
  .saldo-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 700; }
  .saldo-value { font-size: 30px; font-weight: 900; color: ${saldoColor}; line-height: 1.1; margin-top: 4px; }

  /* ── Resumen chips ── */
  .resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
  .chip { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .chip-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
  .chip-value { font-size: 19px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .chip-value.red { color: var(--red) }
  .chip-value.green { color: var(--green) }
  .chip-value.blue { color: var(--accent) }

  /* ── Tabla ── */
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: var(--ink); }
  th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .06em; }
  th:last-child { width: 38% }
  td { padding: 9px 12px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; }
  tr.even td { background: var(--surface) }
  tr:last-child td { border-bottom: none }
  .fecha { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .badge-pago { background: #dcfce7; color: var(--green) }
  .badge-deuda { background: #fee2e2; color: var(--red) }
  .monto { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .monto-pago { color: var(--green) }
  .monto-deuda { color: var(--red) }
  .desc { color: #334155; }

  /* ── Footer ── */
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); }
  .empty { text-align: center; padding: 32px; color: var(--muted); font-size: 14px; }

  /* ── Print ── */
  @media print {
    .toolbar { display: none !important }
    .page { margin: 0; padding: 24px; }
    body { font-size: 12px }
  }
</style>
</head>
<body>

<div class="toolbar">
  <span class="toolbar-title">📄 Cuenta Corriente — ${clienteNombre}</span>
  <div class="toolbar-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Guardar / Imprimir PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
</div>

<div class="page">

  <div class="header">
    <div class="header-left">
      <h1>Cuenta Corriente</h1>
      <div class="client">${clienteNombre}</div>
      <div class="meta">Emitido: ${fechaHoy}<br>Sistema de Gestión PRO</div>
    </div>
    <div class="header-right">
      <div class="saldo-label">Saldo actual</div>
      <div class="saldo-value">${saldoLabel}</div>
    </div>
  </div>

  <div class="resumen">
    <div class="chip">
      <div class="chip-label">Total deudas</div>
      <div class="chip-value red">$${fmt(totalDeuda)}</div>
    </div>
    <div class="chip">
      <div class="chip-label">Total pagos</div>
      <div class="chip-value green">$${fmt(totalPagos)}</div>
    </div>
    <div class="chip">
      <div class="chip-label">Movimientos</div>
      <div class="chip-value blue">${data.movimientos.length}</div>
    </div>
  </div>

  <div class="section-title">Historial de movimientos</div>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Tipo</th>
        <th style="text-align:right">Monto</th>
        <th>Descripción</th>
      </tr>
    </thead>
    <tbody>
      ${filas || '<tr><td colspan="4" class="empty">Sin movimientos registrados</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <span>Savatek Solutions · Sistema de Gestión PRO</span>
    <span>Generado el ${fechaHoy}</span>
  </div>

</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=680");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

cerrarHistorial.addEventListener("click", () => dlgHistorial.close());
cerrarCuenta.addEventListener("click", () => dlgCuenta.close());

async function registrarMovimiento(clienteId, tipo, clienteNombre) {
  const esPago = tipo === "pago";
  const fechaHoy = new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
  const { value: formValues } = await Swal.fire({
    target: dlgCuenta,
    title: esPago ? "💵 Registrar pago" : "📝 Registrar deuda",
    html: `
      <div style="text-align:left;display:flex;flex-direction:column;gap:12px">
        <label style="font-size:13px;font-weight:600">Monto *</label>
        <input id="swal-monto" type="number" class="swal2-input" placeholder="Ej: 5000" min="1" step="0.01" style="margin:0">
        <label style="font-size:13px;font-weight:600">Descripción</label>
        <input id="swal-desc" type="text" class="swal2-input" placeholder="${esPago ? 'Ej: Pago parcial de deuda' : 'Ej: Compra a crédito'}" style="margin:0">
        <label style="font-size:13px;font-weight:600">Fecha del movimiento</label>
        <input id="swal-fecha" type="date" class="swal2-input" value="${fechaHoy}" max="${fechaHoy}" style="margin:0">
      </div>`,
    showCancelButton: true,
    confirmButtonText: esPago ? "Registrar pago" : "Registrar deuda",
    cancelButtonText: "Cancelar",
    confirmButtonColor: esPago ? "#00d875" : "#ef4444",
    preConfirm: () => {
      const monto = document.getElementById("swal-monto").value;
      const descripcion = document.getElementById("swal-desc").value;
      const fecha = document.getElementById("swal-fecha").value;
      if (!monto || Number(monto) <= 0) {
        Swal.showValidationMessage("Ingresá un monto válido mayor a 0");
        return false;
      }
      if (!fecha) {
        Swal.showValidationMessage("Seleccioná una fecha");
        return false;
      }
      return { monto, descripcion, fecha };
    },
  });

  if (!formValues) return;

  try {
    const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        tipo,
        monto: Number(formValues.monto),
        descripcion: formValues.descripcion,
        fecha: formValues.fecha,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    Swal.fire({
      target: dlgCuenta,
      icon: "success",
      title: esPago ? "Pago registrado" : "Deuda registrada",
      timer: 1500,
      showConfirmButton: false,
    });

    dlgCuenta.close();
    await verCuentaCorriente(clienteId, clienteNombre);
  } catch (error) {
    console.error(error);
    Swal.fire({
      target: dlgCuenta,
      icon: "error",
      title: "Error",
      text: "No se pudo guardar el movimiento",
    });
  }
}

// =========================
// EXPORTAR
// =========================

document.getElementById("btnExportar").addEventListener("click", exportarClientes);

async function exportarClientes() {
  try {
    const res = await fetch("/api/clientes", {
      headers: { Authorization: "Bearer " + token },
    });

    const clientes = await res.json();

    const datos = clientes.map((c) => ({
      ID: c.id,
      Nombre: c.nombre,
      Email: c.email || "",
      Telefono: c.telefono || "",
      DNI: c.dni || "",
      Direccion: c.direccion || "",
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "clientes.xlsx");

    Swal.fire({
      icon: "success",
      title: "Excel exportado",
      timer: 1500,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: "error",
      title: "Error al exportar",
      text: "No se pudieron exportar los clientes",
    });
  }
}

// =========================
// INIT
// =========================

cargarClientes();

const token = localStorage.getItem("token");

if (!token) {
  location.href = "/admin/login.html";
}

const tbody = document.getElementById("tbodyClientes");
const searchInput = document.getElementById("search");

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
    const res = await fetch(`/api/clientes?search=${search}`, {
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

function renderClientes(clientes) {
  tbody.innerHTML = "";

  if (!clientes.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <span class="empty-icon">👥</span>
            <span>No se encontraron clientes</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  clientes.forEach((cliente) => {
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

async function verCuentaCorriente(id, clienteNombre = "") {
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

    if (!res.ok) throw new Error();

    const saldoColor = data.saldo > 0 ? "var(--danger)" : "var(--accent)";
    const saldoLabel = data.saldo > 0 ? "Debe" : "Al día";

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
        <button class="btn btn-primary btn-sm" id="btn-reg-pago" style="flex:1">
          💵 Registrar pago
        </button>
        <button class="btn btn-outline btn-sm" id="btn-reg-deuda" style="flex:1">
          📝 Registrar deuda
        </button>
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
            </tr>
          </thead>
          <tbody>
            ${data.movimientos.map((m) => `
              <tr>
                <td>${new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                <td><span class="dash-badge ${m.tipo === 'pago' ? 'green' : 'red'}">${m.tipo === 'pago' ? '✅ Pago' : '📝 Deuda'}</span></td>
                <td class="right">$${Number(m.monto).toLocaleString("es-AR")}</td>
                <td>${m.descripcion || "-"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : '<div class="empty-state"><span class="empty-icon">💳</span><span>Sin movimientos</span></div>'}`;

    // Event listeners para botones
    document.getElementById("btn-reg-pago")?.addEventListener("click", () => registrarMovimiento(id, "pago", clienteNombre));
    document.getElementById("btn-reg-deuda")?.addEventListener("click", () => registrarMovimiento(id, "deuda", clienteNombre));

    dlgCuenta.showModal();
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar la cuenta corriente",
    });
  }
}

cerrarHistorial.addEventListener("click", () => dlgHistorial.close());
cerrarCuenta.addEventListener("click", () => dlgCuenta.close());

async function registrarMovimiento(clienteId, tipo, clienteNombre) {
  const esPago = tipo === "pago";
  const { value: formValues } = await Swal.fire({
    title: esPago ? "💵 Registrar pago" : "📝 Registrar deuda",
    html: `
      <div style="text-align:left;display:flex;flex-direction:column;gap:12px">
        <label style="font-size:13px;font-weight:600">Monto *</label>
        <input id="swal-monto" type="number" class="swal2-input" placeholder="Ej: 5000" min="1" step="0.01" style="margin:0">
        <label style="font-size:13px;font-weight:600">Descripción</label>
        <input id="swal-desc" type="text" class="swal2-input" placeholder="${esPago ? 'Ej: Pago parcial de deuda' : 'Ej: Compra a crédito'}" style="margin:0">
      </div>`,
    showCancelButton: true,
    confirmButtonText: esPago ? "Registrar pago" : "Registrar deuda",
    cancelButtonText: "Cancelar",
    confirmButtonColor: esPago ? "#00d875" : "#ef4444",
    preConfirm: () => {
      const monto = document.getElementById("swal-monto").value;
      const descripcion = document.getElementById("swal-desc").value;
      if (!monto || Number(monto) <= 0) {
        Swal.showValidationMessage("Ingresá un monto válido mayor a 0");
        return false;
      }
      return { monto, descripcion };
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
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    Swal.fire({
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

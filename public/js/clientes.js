const token = localStorage.getItem("token");

if (!token) {
  location.href = "/admin/login.html";
}

const tbody = document.getElementById("tbodyClientes");
const searchInput = document.getElementById("search");

const modal = document.getElementById("modalCliente");
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
const modalHistorial = document.getElementById("modalHistorial");
const cerrarHistorial = document.getElementById("cerrarHistorial");
const historialContent = document.getElementById("historialContent");

const modalCuenta = document.getElementById("modalCuenta");

const cerrarCuenta = document.getElementById("cerrarCuenta");

const cuentaContent = document.getElementById("cuentaContent");

// =========================
// CARGAR CLIENTES
// =========================

async function cargarClientes(search = "") {
  try {
    const res = await fetch(`/api/clientes?search=${search}`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const clientes = await res.json();

    renderClientes(clientes);
  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudieron cargar los clientes",
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
        <td colspan="6">No hay clientes</td>
      </tr>
    `;

    return;
  }

  clientes.forEach((cliente) => {
    tbody.innerHTML += `
      <tr>

        <td>${cliente.id}</td>

        <td>
          <div class="client-info">
             <div class="client-avatar">
              ${cliente.nombre.charAt(0).toUpperCase()}
            </div>

            <div>
              <strong>${cliente.nombre}</strong>
            </div>
          </div>
        </td>

        <td
          class="copy-cell"
          onclick="copiarTexto('${cliente.email}')"
        >
          ${cliente.email || "-"}
        </td>

        <td class="copy-cell" onclick="copiarTexto('${cliente.telefono}')">
          ${cliente.telefono || "-"}
        </td>

        <td class="copy-cell" onclick="copiarTexto('${cliente.dni}')">
          ${cliente.dni || "-"}
        </td>

        <td>

          <button
            class="btn-edit"
            onclick="editarCliente(${cliente.id})"
          >
            Editar
          </button>

          <button
            class="btn-delete"
            onclick="eliminarCliente(${cliente.id})"
          >
            Eliminar
          </button>


          <button
            class="btn-history"
            onclick="verHistorial(${cliente.id})"
          >
            Historial
          </button>

          <button
            class="btn-account"
            onclick="verCuentaCorriente(${cliente.id}, '${cliente.nombre}')"
          >
             Cuenta
          </button>

        </td>

      </tr>
    `;
  });
}

function copiarTexto(texto) {
  navigator.clipboard.writeText(texto);

  Swal.fire({
    toast: true,
    position: "top-end",
    icon: "success",
    title: "Copiado",
    timer: 1500,
    showConfirmButton: false,
  });
}

window.copiarTexto = copiarTexto;

// =========================
// BUSCADOR
// =========================

searchInput.addEventListener("input", (e) => {
  cargarClientes(e.target.value);
});

// =========================
// MODAL
// =========================

btnNuevo.addEventListener("click", () => {
  limpiarFormulario();

  modalTitle.textContent = "Nuevo Cliente";

  modal.classList.remove("hidden");
});

cerrarModal.addEventListener("click", () => {
  modal.classList.add("hidden");
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
        title: "Error",
        text: result.error || "Ocurrió un error",
      });
    }

    modal.classList.add("hidden");

    cargarClientes();

    Swal.fire({
      icon: "success",
      title: "Cliente guardado",
      timer: 1500,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo guardar el cliente",
    });
  }
});

// =========================
// EDITAR CLIENTE
// =========================

async function editarCliente(id) {
  try {
    const res = await fetch(`/api/clientes/${id}`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const cliente = await res.json();

    clienteId.value = cliente.id;

    nombre.value = cliente.nombre || "";
    email.value = cliente.email || "";
    telefono.value = cliente.telefono || "";
    dni.value = cliente.dni || "";
    direccion.value = cliente.direccion || "";

    modalTitle.textContent = "Editar Cliente";

    modal.classList.remove("hidden");
  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el cliente",
    });
  }
}

window.editarCliente = editarCliente;

// =========================
// ELIMINAR CLIENTE
// =========================

async function eliminarCliente(id) {
  const result = await Swal.fire({
    title: "¿Eliminar cliente?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ff4d4d",
    cancelButtonColor: "#6b7280",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/clientes/${id}`, {
      method: "DELETE",

      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return Swal.fire({
        icon: "error",
        title: "Error",
        text: data.error || "No se pudo eliminar",
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
      title: "Error",
      text: "No se pudo eliminar el cliente",
    });
  }
}

window.eliminarCliente = eliminarCliente;

// =========================
// VER HISTORIAL
// =========================

async function verHistorial(id) {
  try {
    const res = await fetch(`/api/clientes/${id}/compras`, {
      headers: {
        Authorization: "Bearer " + token,
      },
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
    
    <div class="cliente-header">

         <div class="client-avatar lg">
           ${data.cliente.nombre.charAt(0).toUpperCase()}
         </div>

         <div>
           <h3>${data.cliente.nombre}</h3>
           <p>Historial de compras</p>
         </div>

    </div>        
    
    <div class="cliente-kpis">

        <div class="kpi-card">
          <div class="k">Compras</div>
          <div class="v">${data.total_compras}</div>
        </div>

        <div class="kpi-card">
          <div class="k">Gastado</div>
          <div class="v green">
            $ ${Number(data.total_gastado).toLocaleString("es-AR")}
          </div>
        </div>

      </div>

      <table class="historial-table">

        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Total</th>
            <th>Pago</th>
            <th>Usuario</th>
          </tr>
        </thead>

        <tbody>

          ${data.compras
            .map(
              (compra) => `
              <tr>

                <td>${compra.id}</td>

                <td>${compra.fecha}</td>

                <td>
                  $ ${Number(compra.total).toLocaleString("es-AR")}
                </td>

                <td>
                  <span class="badge badge-blue">
                    ${compra.medio_pago}
                  </span>
                </td>

                <td>${compra.usuario}</td>

              </tr>
            `,
            )
            .join("")}

        </tbody>

      </table>
    `;

    modalHistorial.classList.remove("hidden");
  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el historial",
    });
  }
}

window.verHistorial = verHistorial;

async function verCuentaCorriente(id, clienteNombre = "") {
  try {
    const res = await fetch(`/api/clientes/${id}/cuenta-corriente`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();

    if (!clienteNombre) {
      const resCliente = await fetch(`/api/clientes/${id}`, {
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      const cliente = await resCliente.json();

      clienteNombre = cliente.nombre || "Cliente";
    }

    if (!res.ok) {
      throw new Error();
    }

    cuentaContent.innerHTML = `

     <div class="cliente-header">

        <div class="client-avatar lg">
          ${clienteNombre.charAt(0).toUpperCase()}
        </div>

        <div>
          <h3>${clienteNombre}</h3>
          <span>Cuenta Corriente</span>
        </div>

     </div>

      <div class="cuenta-resumen">

        <div class="cuenta-card saldo ${data.saldo > 0 ? "saldo-deudor" : "saldo-ok"}">
          <h3>Saldo Actual</h3>

          <p>
            $ ${Number(data.saldo).toLocaleString("es-AR")}
          </p>
        </div>

      </div>

      <div class="cuenta-actions">

        <button
          class="btn btn-add-deuda"
          onclick="registrarMovimiento(${id}, 'deuda')"
        >
          + Registrar Deuda
        </button>

        <button
          class="btn btn-add-pago"
          onclick="registrarMovimiento(${id}, 'pago')"
        >
          + Registrar Pago
        </button>

      </div>

      <table class="historial-table">

        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Monto</th>
            <th>Descripción</th>
          </tr>
        </thead>

        <tbody>

          ${data.movimientos
            .map(
              (m) => `
              <tr>

                <td>${m.fecha}</td>

                <td>${m.tipo}</td>

                <td>
                  $ ${Number(m.monto).toLocaleString("es-AR")}
                </td>

                <td>${m.descripcion || "-"}</td>

              </tr>
            `,
            )
            .join("")}

        </tbody>

      </table>
    `;

    modalCuenta.classList.remove("hidden");
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar la cuenta corriente",
    });
  }
}

window.verCuentaCorriente = verCuentaCorriente;

cerrarHistorial.addEventListener("click", () => {
  modalHistorial.classList.add("hidden");
});

cerrarCuenta.addEventListener("click", () => {
  modalCuenta.classList.add("hidden");
});

async function registrarMovimiento(clienteId, tipo) {
  const { value: formValues } = await Swal.fire({
    title: tipo === "deuda" ? "Registrar Deuda" : "Registrar Pago",

    html: `
      <input
        id="swal-monto"
        type="number"
        class="swal2-input"
        placeholder="Monto"
      >

      <input
        id="swal-desc"
        type="text"
        class="swal2-input"
        placeholder="Descripción"
      >
    `,

    showCancelButton: true,

    confirmButtonText: "Guardar",

    preConfirm: () => {
      const monto = document.getElementById("swal-monto").value;

      const descripcion = document.getElementById("swal-desc").value;

      if (!monto) {
        Swal.showValidationMessage("Ingresa un monto");
      }

      return {
        monto,
        descripcion,
      };
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

    if (!res.ok) {
      throw new Error(data.error);
    }

    Swal.fire({
      icon: "success",
      title: tipo === "deuda" ? "Deuda registrada" : "Pago registrado",
      timer: 1500,
      showConfirmButton: false,
    });

    await verCuentaCorriente(clienteId);
  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo guardar el movimiento",
    });
  }
}

window.registrarMovimiento = registrarMovimiento;

document
  .getElementById("btnExportar")
  .addEventListener("click", exportarClientes);

async function exportarClientes() {
  try {
    const res = await fetch("/api/clientes", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const clientes = await res.json();

    const datos = clientes.map((c) => ({
      ID: c.id,
      Nombre: c.nombre,
      Email: c.email || "",
      Telefono: c.telefono || "",
      DNI: c.dni || "",
    }));

    const ws = XLSX.utils.json_to_sheet(datos);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Clientes");

    XLSX.writeFile(wb, "clientes.xlsx");
  } catch (error) {
    console.error(error);

    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo exportar",
    });
  }
}
// =========================
// INIT
// =========================

cargarClientes();

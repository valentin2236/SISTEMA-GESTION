const token = localStorage.getItem("token");

if (!token) {
  location.href = "/admin/login.html";
}

const tbody = document.getElementById("tbodyMovimientos");

const buscar = document.getElementById("buscar");
const filtroTipo = document.getElementById("filtroTipo");

const totalMovimientos =
  document.getElementById("total-movimientos");

const totalVentas =
  document.getElementById("total-ventas");

const totalCompras =
  document.getElementById("total-compras");

let movimientosGlobal = [];


// =====================================
// CARGAR MOVIMIENTOS
// =====================================

async function cargarMovimientos() {

  try {

    const res = await fetch("/api/inventario", {

      headers: {
        Authorization: "Bearer " + token,
      },

    });

    const movimientos = await res.json();

    movimientosGlobal = movimientos;

    actualizarResumen();

    aplicarFiltros();

  } catch (error) {

    console.error(error);

  }

}


// =====================================
// FILTROS
// =====================================

function aplicarFiltros() {

  const texto =
    buscar.value.toLowerCase();

  const tipo =
    filtroTipo.value;

  const filtrados =
    movimientosGlobal.filter((m) => {

      const coincideTexto =
        (m.nombre || "")
          .toLowerCase()
          .includes(texto);

      const coincideTipo =
        !tipo || m.tipo === tipo;

      return coincideTexto && coincideTipo;

    });

  renderMovimientos(filtrados);

}


// =====================================
// RENDER
// =====================================

function renderMovimientos(movimientos) {

  tbody.innerHTML = "";

  if (!movimientos.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          Sin movimientos
        </td>
      </tr>
    `;

    return;

  }

  movimientos.forEach((m) => {

    const tipoClass =
      m.tipo === "venta"
        ? "tipo-venta"
        : "tipo-ingreso";

    tbody.innerHTML += `

      <tr>

        <td>
          ${formatearFecha(m.fecha)}
        </td>

        <td>
          ${m.nombre}
        </td>

        <td>
          ${m.sku || "-"}
        </td>

        <td class="${tipoClass}">
          ${m.tipo}
        </td>

        <td>
          ${m.cantidad}
        </td>

        <td>
          ${m.stock_anterior}
        </td>

        <td>
          ${m.stock_nuevo}
        </td>

        <td>
          ${m.usuario || "-"}
        </td>

        <td>
          ${m.motivo || "-"}
        </td>

      </tr>

    `;

  });

}


// =====================================
// RESUMEN
// =====================================

function actualizarResumen() {

  totalMovimientos.textContent =
    movimientosGlobal.length;

  totalVentas.textContent =
    movimientosGlobal.filter(
      (m) => m.tipo === "venta"
    ).length;

  totalCompras.textContent =
    movimientosGlobal.filter(
      (m) => m.tipo === "compra"
    ).length;

}


// =====================================
// FECHA
// =====================================

function formatearFecha(fecha) {

  return new Date(fecha)
    .toLocaleString("es-AR");

}


// =====================================
// EVENTOS FILTROS
// =====================================

buscar.addEventListener(
  "input",
  aplicarFiltros
);

filtroTipo.addEventListener(
  "change",
  aplicarFiltros
);


// =====================================
// LOGOUT
// =====================================

document
  .getElementById("logout")
  .addEventListener("click", (e) => {

    e.preventDefault();

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    location.href =
      "/admin/login.html";

  });


// =====================================
// INIT
// =====================================

cargarMovimientos();
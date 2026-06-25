// public/js/compras.js
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

const rol = localStorage.getItem("user_rol");
if (rol !== "admin") {
  Swal.fire({ icon: "error", title: "Acceso restringido", text: "Necesitás permisos de administrador para acceder a esta sección" }).then(
    () => (location.href = "/admin/dashboard.html"),
  );
}

/* ── Utils ── */
function money(n) {
  return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

async function apiFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(opts.headers || {}),
    },
  });
}

/* ── DOM refs ── */
const $proveedor = document.getElementById("proveedor");
const $nota = document.getElementById("nota");
const $buscar = document.getElementById("buscar-producto");
const $resultados = document.getElementById("resultados");
const $tbody = document.getElementById("tbody-compras");
const $totalCompra = document.getElementById("total-compra");
const $btnGuardar = document.getElementById("btn-guardar");
const $itemsCount = document.getElementById("comp-items-count");
const $tbodyHist = document.getElementById("tbody-historial");
const $btnRecargar = document.getElementById("btn-recargar-historial");

/* ── Estado ── */
let carrito = [];

/* ===================== PROVEEDORES ===================== */
async function cargarProveedores() {
  try {
    const res = await apiFetch("/api/proveedores");
    const data = await res.json();
    if (!$proveedor) return;
    $proveedor.innerHTML =
      `<option value="">— Seleccioná un proveedor —</option>` +
      (Array.isArray(data) ? data : [])
        .map((p) => `<option value="${p.id}">${p.nombre}</option>`)
        .join("");
  } catch (e) {
    console.error(e);
  }
}

/* ===================== BUSCAR PRODUCTOS ===================== */
let searchTimer;
$buscar?.addEventListener("input", (e) => {
  const q = e.target.value.trim();
  if (!q) {
    if ($resultados) $resultados.innerHTML = "";
    return;
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => buscarProductos(q), 250);
});

async function buscarProductos(q) {
  try {
    const res = await apiFetch(
      `/api/productos?search=${encodeURIComponent(q)}&limit=20`,
    );
    const data = await res.json();
    renderResultados(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
  }
}

function renderResultados(productos) {
  if (!$resultados) return;
  if (!productos.length) {
    $resultados.innerHTML = `<div class="comp-sin-resultados">Sin resultados</div>`;
    return;
  }
  $resultados.innerHTML = productos
    .map(
      (p) => `
    <div class="comp-result-card">
      <div class="comp-result-info">
        <div class="comp-result-nombre">${p.nombre}</div>
        <div class="comp-result-meta">
          SKU: ${p.sku || "–"} · Stock actual: <b>${p.stock}</b>
        </div>
      </div>
      <div class="comp-result-precio">$${money(p.precio)}</div>
      <button
        class="btn btn-primary btn-sm"
        onclick="agregarProducto(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${p.costo || p.precio})"
      >
        + Agregar
      </button>
    </div>`,
    )
    .join("");
}

/* ===================== CARRITO ===================== */
function agregarProducto(id, nombre, costo) {
  const existe = carrito.find((p) => p.id === id);
  if (existe) {
    existe.cantidad++;
  } else {
    carrito.push({ id, nombre, costo: Number(costo) || 0, cantidad: 1 });
  }
  // Limpiar búsqueda
  if ($buscar) $buscar.value = "";
  if ($resultados) $resultados.innerHTML = "";
  renderCarrito();
}
window.agregarProducto = agregarProducto;

function renderCarrito() {
  if (!$tbody) return;

  // Actualizar badge
  const total = carrito.reduce((s, p) => s + p.costo * p.cantidad, 0);
  const items = carrito.reduce((s, p) => s + p.cantidad, 0);
  if ($itemsCount)
    $itemsCount.textContent = `${items} ítem${items !== 1 ? "s" : ""}`;
  if ($totalCompra) $totalCompra.textContent = money(total);

  if (!carrito.length) {
    $tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <span class="empty-icon">🛒</span>
            <span>Buscá productos para agregar</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  $tbody.innerHTML = carrito
    .map(
      (p, ix) => `
    <tr>
      <td class="comp-prod-nombre">${p.nombre}</td>
      <td class="right">
        <input
          type="number"
          class="comp-input-inline"
          value="${p.costo}"
          min="0"
          step="0.01"
          onchange="cambiarCosto(${ix}, this.value)"
          title="Costo unitario"
        />
      </td>
      <td class="center">
        <div class="comp-cant-row">
          <button class="btn-cant" onclick="cambiarCantidad(${ix}, ${p.cantidad - 1})">−</button>
          <span class="comp-cant-val">${p.cantidad}</span>
          <button class="btn-cant" onclick="cambiarCantidad(${ix}, ${p.cantidad + 1})">+</button>
        </div>
      </td>
      <td class="right comp-subtotal">$${money(p.costo * p.cantidad)}</td>
      <td>
        <button class="btn-accion btn-del" onclick="eliminarItem(${ix})" title="Quitar">✕</button>
      </td>
    </tr>`,
    )
    .join("");
}

function cambiarCosto(ix, val) {
  carrito[ix].costo = Math.max(0, Number(val) || 0);
  renderCarrito();
}
function cambiarCantidad(ix, val) {
  const v = Math.max(1, Number(val) || 1);
  carrito[ix].cantidad = v;
  renderCarrito();
}
function eliminarItem(ix) {
  carrito.splice(ix, 1);
  renderCarrito();
}
window.cambiarCosto = cambiarCosto;
window.cambiarCantidad = cambiarCantidad;
window.eliminarItem = eliminarItem;

/* ===================== GUARDAR COMPRA ===================== */
$btnGuardar?.addEventListener("click", async () => {
  if (!$proveedor?.value) {
    Swal.fire({
      icon: "warning",
      title: "Falta el proveedor",
      text: "Seleccioná un proveedor antes de continuar",
    });
    return;
  }
  if (!carrito.length) {
    Swal.fire({
      icon: "warning",
      title: "Carrito vacío",
      text: "Agregá al menos un producto",
    });
    return;
  }

  const total = carrito.reduce((s, p) => s + p.costo * p.cantidad, 0);
  const provNombre = $proveedor.options[$proveedor.selectedIndex]?.text || "";

  const confirm = await Swal.fire({
    title: "¿Registrar compra?",
    html: `Proveedor: <b>${provNombre}</b><br>
           ${carrito.length} producto${carrito.length !== 1 ? "s" : ""}<br>
           Total: <b>$${money(total)}</b>`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Registrar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#00d875",
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await apiFetch("/api/compras", {
      method: "POST",
      body: JSON.stringify({
        proveedor_id: $proveedor.value,
        nota: ($nota?.value || "").trim(),
        productos: carrito.map((p) => ({
          id: p.id,
          producto_id: p.id,
          cantidad: p.cantidad,
          costo_unitario: p.costo,
          costo: p.costo,
        })),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: data.error || "No se pudo registrar",
      });
      return;
    }

    await Swal.fire({
      icon: "success",
      title: "Compra registrada",
      html: `Compra <b>#${data.compra_id}</b> guardada.<br>
             El stock fue actualizado automáticamente.`,
      timer: 2500,
      showConfirmButton: false,
    });

    // Limpiar
    carrito = [];
    if ($nota) $nota.value = "";
    if ($proveedor) $proveedor.value = "";
    renderCarrito();
    cargarHistorial();
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

/* ===================== HISTORIAL ===================== */
async function cargarHistorial() {
  try {
    const res = await apiFetch("/api/compras");
    const data = await res.json();
    renderHistorial(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
  }
}

function renderHistorial(compras) {
  if (!$tbodyHist) return;
  if (!compras.length) {
    $tbodyHist.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <span>Sin compras registradas</span>
        </div>
      </td></tr>`;
    return;
  }
  $tbodyHist.innerHTML = compras.slice(0, 20).map(c => {
    const fecha = c.fecha
      ? new Date(c.fecha).toLocaleString("es-AR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      : "–";
    return `
      <tr>
        <td class="hist-id">#${c.id}</td>
        <td>${fecha}</td>
        <td>${c.proveedor_nombre || '<span class="comp-vacio">Sin proveedor</span>'}</td>
        <td>${c.usuario || "–"}</td>
        <td class="comp-nota">${c.nota || '<span class="comp-vacio">–</span>'}</td>
        <td class="right hist-total">$${money(c.total)}</td>
        <td>
          <button class="btn btn-outline btn-sm"
                  onclick="verDetalleCompra(${c.id})">
            Ver
          </button>
        </td>
      </tr>`;
  }).join("");
}

/* ===================== DETALLE COMPRA ===================== */
async function verDetalleCompra(id) {
  try {
    const res = await apiFetch(`/api/compras/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const fecha = data.fecha
      ? new Date(data.fecha).toLocaleString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "–";

    const $titulo = document.getElementById("dlg-compra-titulo");
    const $info = document.getElementById("dlg-compra-info");
    const $items = document.getElementById("dlg-compra-items");
    const $dlg = document.getElementById("dlg-detalle-compra");

    if ($titulo) $titulo.textContent = `Compra #${data.id}`;

    if ($info)
      $info.innerHTML = `
      <div class="comp-detalle-grid">
        <div class="comp-det-item">
          <span class="comp-det-label">Proveedor</span>
          <span class="comp-det-val">${data.proveedor_nombre || "–"}</span>
        </div>
        <div class="comp-det-item">
          <span class="comp-det-label">Fecha</span>
          <span class="comp-det-val">${fecha}</span>
        </div>
        <div class="comp-det-item">
          <span class="comp-det-label">Usuario</span>
          <span class="comp-det-val">${data.usuario || "–"}</span>
        </div>
        <div class="comp-det-item">
          <span class="comp-det-label">Nota</span>
          <span class="comp-det-val">${data.nota || "–"}</span>
        </div>
        <div class="comp-det-item comp-det-total">
          <span class="comp-det-label">Total</span>
          <span class="comp-det-val">$${money(data.total)}</span>
        </div>
      </div>`;

    if ($items) {
      const items = data.items || [];
      $items.innerHTML = items.length
        ? items
            .map(
              (it) => `
            <tr>
              <td>${it.nombre || "–"}</td>
              <td>${it.sku || "–"}</td>
              <td class="center">${it.cantidad}</td>
              <td class="right">$${money(it.costo_unitario)}</td>
              <td class="right" style="font-weight:700;color:var(--accent)">
                $${money(it.subtotal)}
              </td>
            </tr>`,
            )
            .join("")
        : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">
             Sin ítems registrados
           </td></tr>`;
    }

    $dlg?.showModal();
  } catch (e) {
    console.error(e);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el detalle",
    });
  }
}
window.verDetalleCompra = verDetalleCompra;
$btnRecargar?.addEventListener("click", cargarHistorial);

/* ===================== INIT ===================== */
cargarProveedores();
renderCarrito();
cargarHistorial();

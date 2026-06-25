// public/js/proveedores.js
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

const rol = localStorage.getItem("user_rol");
if (rol !== "admin") {
  Swal.fire({ icon: "error", title: "Acceso restringido", text: "Necesitás permisos de administrador para acceder a esta sección" })
    .then(() => location.href = "/admin/dashboard.html");
}

/* ── Utils ── */
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
const $tbody      = document.getElementById("tbody-proveedores");
const $search     = document.getElementById("search");
const $btnNuevo   = document.getElementById("btn-nuevo");
const $statTotal  = document.getElementById("stat-total");
const $dlg        = document.getElementById("dlg-proveedor");
const $dlgTitulo  = document.getElementById("dlg-titulo");
const $btnCerrar  = document.getElementById("btn-cerrar-dlg");
const $btnGuardar = document.getElementById("btn-guardar");
const $provId     = document.getElementById("prov-id");
const $provNombre = document.getElementById("prov-nombre");
const $provTel    = document.getElementById("prov-telefono");
const $provEmail  = document.getElementById("prov-email");
const $provDir    = document.getElementById("prov-direccion");

/* ===================== CARGAR ===================== */
async function cargarProveedores(search = "") {
  try {
    const res  = await apiFetch(`/api/proveedores?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    renderProveedores(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error", text: "No se pudieron cargar los proveedores" });
  }
}

/* ===================== RENDER ===================== */
function renderProveedores(proveedores) {
  if ($statTotal)
    $statTotal.textContent = `${proveedores.length} proveedor${proveedores.length !== 1 ? "es" : ""}`;

  if (!$tbody) return;

  if (!proveedores.length) {
    $tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <span class="empty-icon">🚚</span>
          <span>No hay proveedores. Agregá el primero.</span>
        </div>
      </td></tr>`;
    return;
  }

  $tbody.innerHTML = proveedores.map(p => `
    <tr>
      <td class="prov-id">#${p.id}</td>
      <td><div class="prov-nombre">${p.nombre}</div></td>
      <td>${p.telefono
        ? `<a href="tel:${p.telefono}" class="prov-link">${p.telefono}</a>`
        : '<span class="prov-vacio">–</span>'}</td>
      <td>${p.email
        ? `<a href="mailto:${p.email}" class="prov-link">${p.email}</a>`
        : '<span class="prov-vacio">–</span>'}</td>
      <td class="prov-dir">${p.direccion || '<span class="prov-vacio">–</span>'}</td>
      <td>
        <div class="acciones-row">
          <button class="btn-accion btn-edit"
            onclick="editarProveedor(${p.id})" title="Editar">✏️</button>
          <button class="btn-accion btn-del"
            onclick="eliminarProveedor(${p.id})" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`).join("");
}

/* ===================== BUSCADOR ===================== */
let searchTimer;
$search?.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => cargarProveedores(e.target.value), 280);
});

/* ===================== MODAL ===================== */
function limpiarForm() {
  if ($provId)     $provId.value     = "";
  if ($provNombre) $provNombre.value = "";
  if ($provTel)    $provTel.value    = "";
  if ($provEmail)  $provEmail.value  = "";
  if ($provDir)    $provDir.value    = "";
}

$btnNuevo?.addEventListener("click", () => {
  limpiarForm();
  if ($dlgTitulo) $dlgTitulo.textContent = "Nuevo proveedor";
  $dlg?.showModal();
  setTimeout(() => $provNombre?.focus(), 50);
});

$btnCerrar?.addEventListener("click", () => $dlg?.close());

/* ===================== GUARDAR ===================== */
$btnGuardar?.addEventListener("click", async () => {
  const nombre = ($provNombre?.value || "").trim();
  if (!nombre) {
    Swal.fire({ icon: "warning", title: "Falta el nombre", text: "El nombre es obligatorio" });
    $provNombre?.focus();
    return;
  }

  const data = {
    nombre,
    telefono:  ($provTel?.value   || "").trim(),
    email:     ($provEmail?.value || "").trim(),
    direccion: ($provDir?.value   || "").trim(),
  };

  const isEdit = !!$provId?.value;
  const url    = isEdit ? `/api/proveedores/${$provId.value}` : "/api/proveedores";
  const method = isEdit ? "PUT" : "POST";

  try {
    const res    = await apiFetch(url, { method, body: JSON.stringify(data) });
    const result = await res.json();

    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: result.error || "No se pudo guardar" });
      return;
    }

    $dlg?.close();
    await cargarProveedores($search?.value || "");
    Swal.fire({
      icon: "success",
      title: isEdit ? "Proveedor actualizado" : "Proveedor creado",
      timer: 1400, showConfirmButton: false,
    });
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

// Enter en el form
document.getElementById("form-proveedor")
  ?.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      $btnGuardar?.click();
    }
  });

/* ===================== EDITAR ===================== */
async function editarProveedor(id) {
  try {
    const res = await apiFetch(`/api/proveedores/${id}`);
    if (!res.ok) throw new Error("not found");
    const p = await res.json();

    limpiarForm();
    if ($provId)     $provId.value     = p.id;
    if ($provNombre) $provNombre.value = p.nombre    || "";
    if ($provTel)    $provTel.value    = p.telefono  || "";
    if ($provEmail)  $provEmail.value  = p.email     || "";
    if ($provDir)    $provDir.value    = p.direccion || "";

    if ($dlgTitulo) $dlgTitulo.textContent = "Editar proveedor";
    $dlg?.showModal();
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar el proveedor" });
  }
}
window.editarProveedor = editarProveedor;

/* ===================== ELIMINAR ===================== */
async function eliminarProveedor(id) {
  const confirm = await Swal.fire({
    title: "¿Eliminar proveedor?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar",
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await apiFetch(`/api/proveedores/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      Swal.fire({ icon: "error", title: "Error", text: d.error });
      return;
    }
    await cargarProveedores($search?.value || "");
    Swal.fire({ icon: "success", title: "Proveedor eliminado", timer: 1400, showConfirmButton: false });
  } catch (e) {
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}
window.eliminarProveedor = eliminarProveedor;

/* ===================== INIT ===================== */
cargarProveedores();
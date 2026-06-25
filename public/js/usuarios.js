// public/js/usuarios.js
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
const $tbody     = document.getElementById("tbody-usuarios");
const $btnNuevo  = document.getElementById("btn-nuevo");
const $dlg       = document.getElementById("dlg-usuario");
const $dlgTitulo = document.getElementById("dlg-titulo");
const $btnCerrar = document.getElementById("btn-cerrar-dlg");
const $btnGuardar= document.getElementById("btn-guardar");
const $usrId     = document.getElementById("usr-id");
const $usrNombre = document.getElementById("usr-nombre");
const $usrEmail  = document.getElementById("usr-email");
const $usrPass   = document.getElementById("usr-password");
const $usrRol    = document.getElementById("usr-rol");
const $passHint  = document.getElementById("pass-hint");

/* ===================== CARGAR ===================== */
async function cargarUsuarios() {
  try {
    const res  = await apiFetch("/api/usuarios");
    const data = await res.json();
    renderUsuarios(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error", text: "No se pudieron cargar los usuarios" });
  }
}

/* ===================== RENDER ===================== */
function renderUsuarios(usuarios) {
  if (!$tbody) return;

  if (!usuarios.length) {
    $tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <span class="empty-icon">🔑</span>
          <span>No hay usuarios registrados</span>
        </div>
      </td></tr>`;
    return;
  }

  $tbody.innerHTML = usuarios.map(u => `
    <tr class="${u.activo ? "" : "usr-inactivo"}">
      <td class="usr-id">#${u.id}</td>
      <td>
        <div class="usr-nombre">${u.nombre}</div>
      </td>
      <td class="usr-email">${u.email}</td>
      <td>
        <span class="usr-rol-badge usr-rol-badge--${u.rol}">
          ${u.rol === "admin" ? "🔑 Admin" : "👤 Vendedor"}
        </span>
      </td>
      <td class="center">
        <span class="usr-estado-badge ${u.activo ? "usr-activo" : "usr-desactivo"}">
          ${u.activo ? "🟢 Activo" : "🔴 Inactivo"}
        </span>
      </td>
      <td>
        <div class="acciones-row">
          <button class="btn-accion btn-edit"
            onclick="editarUsuario(${u.id})" title="Editar">✏️</button>
          <button class="btn-accion"
            onclick="resetearPassword(${u.id}, '${u.email}')" title="Resetear contraseña">🔑</button>
          ${u.activo
            ? `<button class="btn-accion btn-del"
                 onclick="cambiarEstado(${u.id}, false)"
                 title="Desactivar">🚫</button>`
            : `<button class="btn-accion btn-act"
                 onclick="cambiarEstado(${u.id}, true)"
                 title="Reactivar">✅</button>`
          }
        </div>
      </td>
    </tr>`).join("");
}

/* ===================== MODAL ===================== */
function limpiarForm() {
  if ($usrId)     $usrId.value     = "";
  if ($usrNombre) $usrNombre.value = "";
  if ($usrEmail)  $usrEmail.value  = "";
  if ($usrPass)   $usrPass.value   = "";
  if ($usrRol)    $usrRol.value    = "vendedor";
}

$btnNuevo?.addEventListener("click", () => {
  limpiarForm();
  if ($dlgTitulo) $dlgTitulo.textContent = "Nuevo usuario";
  if ($passHint)  $passHint.textContent  = "(requerida)";
  if ($usrPass)   $usrPass.required      = true;
  $dlg?.showModal();
  setTimeout(() => $usrNombre?.focus(), 50);
});

$btnCerrar?.addEventListener("click", () => $dlg?.close());

/* ===================== GUARDAR ===================== */
$btnGuardar?.addEventListener("click", async () => {
  const nombre = ($usrNombre?.value || "").trim();
  const email  = ($usrEmail?.value  || "").trim();
  const pass   = ($usrPass?.value   || "").trim();
  const rol    = $usrRol?.value || "vendedor";
  const isEdit = !!$usrId?.value;

  if (!nombre) {
    Swal.fire({ icon: "warning", title: "Falta el nombre" });
    $usrNombre?.focus();
    return;
  }
  if (!email) {
    Swal.fire({ icon: "warning", title: "Falta el email" });
    $usrEmail?.focus();
    return;
  }
  if (!isEdit && !pass) {
    Swal.fire({ icon: "warning", title: "La contraseña es requerida para nuevos usuarios" });
    $usrPass?.focus();
    return;
  }
  if (pass && pass.length < 6) {
    Swal.fire({ icon: "warning", title: "Contraseña muy corta", text: "Mínimo 6 caracteres" });
    $usrPass?.focus();
    return;
  }

  const data = { nombre, email, rol };
  if (pass) data.password = pass;

  const url    = isEdit ? `/api/usuarios/${$usrId.value}` : "/api/usuarios";
  const method = isEdit ? "PUT" : "POST";

  try {
    const res    = await apiFetch(url, { method, body: JSON.stringify(data) });
    const result = await res.json();

    if (!res.ok) {
      Swal.fire({ icon: "error", title: "Error", text: result.error || "No se pudo guardar" });
      return;
    }

    $dlg?.close();
    await cargarUsuarios();
    Swal.fire({
      icon: "success",
      title: isEdit ? "Usuario actualizado" : "Usuario creado",
      timer: 1400, showConfirmButton: false,
    });
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

/* ===================== EDITAR ===================== */
async function editarUsuario(id) {
  try {
    const res  = await apiFetch("/api/usuarios");
    const data = await res.json();
    const u    = data.find(x => x.id === id);
    if (!u) return;

    limpiarForm();
    if ($usrId)     $usrId.value     = u.id;
    if ($usrNombre) $usrNombre.value = u.nombre || "";
    if ($usrEmail)  $usrEmail.value  = u.email  || "";
    if ($usrRol)    $usrRol.value    = u.rol    || "vendedor";
    if ($usrPass)   $usrPass.required = false;
    if ($passHint)  $passHint.textContent = "(dejá vacío para no cambiarla)";
    if ($dlgTitulo) $dlgTitulo.textContent = "Editar usuario";

    $dlg?.showModal();
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar el usuario" });
  }
}
window.editarUsuario = editarUsuario;

/* ===================== CAMBIAR ESTADO ===================== */
async function cambiarEstado(id, activar) {
  const accion = activar ? "reactivar" : "desactivar";
  const titulo = activar ? "¿Reactivar usuario?" : "¿Desactivar usuario?";

  const confirm = await Swal.fire({
    title: titulo,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: activar ? "Reactivar" : "Desactivar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: activar ? "#00d875" : "#ef4444",
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await apiFetch(`/api/usuarios/${id}/${accion}`, { method: "PATCH" });
    if (!res.ok) {
      const d = await res.json();
      Swal.fire({ icon: "error", title: "Error", text: d.error });
      return;
    }
    await cargarUsuarios();
    Swal.fire({
      icon: "success",
      title: activar ? "Usuario reactivado" : "Usuario desactivado",
      timer: 1400, showConfirmButton: false,
    });
  } catch (e) {
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}
window.cambiarEstado = cambiarEstado;

/* ===================== RESET PASSWORD ===================== */
async function resetearPassword(id, email) {
  const { value: password } = await Swal.fire({
    title: '🔑 Resetear contraseña',
    html: `<p style="font-size:14px;margin-bottom:12px">Usuario: <strong>${email}</strong></p>`,
    input: 'password',
    inputPlaceholder: 'Nueva contraseña (mín. 6 caracteres)',
    inputAttributes: { minlength: 6 },
    showCancelButton: true,
    confirmButtonText: 'Resetear',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => {
      if (!value) return 'Ingresá una contraseña';
      if (value.length < 6) return 'Mínimo 6 caracteres';
    },
  });
  if (!password) return;

  try {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ usuario_id: id, password_nueva: password }),
    });
    const data = await res.json();
    if (res.ok) {
      Swal.fire({ icon: 'success', title: 'Contraseña reseteada', text: `Nueva contraseña asignada a ${email}`, timer: 2000, showConfirmButton: false });
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: data.message || data.error });
    }
  } catch {
    Swal.fire({ icon: 'error', title: 'Error de conexión' });
  }
}
window.resetearPassword = resetearPassword;

/* ===================== INIT ===================== */
cargarUsuarios();
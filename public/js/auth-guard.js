// public/js/auth-guard.js
// Uso: <script src="/js/auth-guard.js" data-rol="admin"></script>
// Si data-rol está vacío, solo verifica que haya sesión activa.

(function () {
  const token = localStorage.getItem('token');
  if (!token) {
    location.href = '/admin/login.html';
    return;
  }

  const rolRequerido = document.currentScript?.dataset?.rol;
  const rolUsuario = localStorage.getItem('user_rol');

  if (rolRequerido && rolUsuario !== rolRequerido) {
    alert('No tenés permiso para acceder a esta sección.');
    location.href = '/admin/dashboard.html';
  }
})();
/* ===== SISTEMA GESTIÓN — THEME TOGGLE ===== */
(function () {
  // Aplicar tema guardado antes de renderizar (evita parpadeo)
  const saved = localStorage.getItem('sg-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function () {
    // Insertar botón toggle en todos los headers
    insertToggleButton();
  });

  function insertToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Cambiar tema');
    btn.title = 'Cambiar entre modo claro y oscuro';

    // Actualizar ícono según el tema actual
    const wrap = document.createElement('div');
    wrap.className = 'theme-toggle-wrap';

    const icon = document.createElement('span');
    icon.className = 'theme-icon';
    icon.textContent = getCurrentTheme() === 'dark' ? '☀️' : '🌙';

    wrap.appendChild(icon);
    wrap.appendChild(btn);

    // Intentar insertarlo en el header/nav
    const targets = [
      document.querySelector('.hdr'),
      document.querySelector('.top'),
      document.querySelector('header'),
      document.querySelector('nav'),
      document.querySelector('.links'),
    ];

    const target = targets.find(t => t !== null);
    if (target) {
      target.appendChild(wrap);
    } else {
      // Fallback: esquina superior derecha flotante
      wrap.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;';
      document.body.appendChild(wrap);
    }

    btn.addEventListener('click', toggleTheme.bind(null, icon));
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function toggleTheme(icon) {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sg-theme', next);
    if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
  }

  // Exponer globalmente por si se necesita
  window.sgToggleTheme = toggleTheme;
})();

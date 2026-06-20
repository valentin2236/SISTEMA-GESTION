// =============================================
// NAVBAR / SIDEBAR — Sistema Gestión PRO
// =============================================

(function () {

  // ---- TEMA ----
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  // ---- DATOS DEL USUARIO ----
  const token  = localStorage.getItem("token");
  const rol    = localStorage.getItem("user_rol") || "";
  const nombre = localStorage.getItem("user_nombre") || localStorage.getItem("user_email") || "Usuario";
  const isAdmin = rol === "admin";

  // ---- CFG DEL NEGOCIO ----
  function getCfg() {
    try { return JSON.parse(localStorage.getItem("cfg") || "{}"); } catch { return {}; }
  }

  // ---- BRAND DINÁMICO ----
  function buildBrand() {
    const cfg = getCfg();
    const logoSrc       = cfg.empresaLogoData || cfg.empresaLogo || "";
    const negocioNombre = cfg.empresaNombre || "";

    if (logoSrc) {
      const displayName = negocioNombre || "Mi Negocio";
      return `
        <a class="sidebar-brand" href="/admin/dashboard.html">
          <div class="brand-dot brand-dot--logo">
            <img src="${logoSrc}" alt="${displayName}" class="brand-logo-img" />
          </div>
          <div class="brand-name brand-name--custom">${displayName}</div>
        </a>`;
    }

    if (negocioNombre) {
      const inicial = negocioNombre.charAt(0).toUpperCase();
      return `
        <a class="sidebar-brand" href="/admin/dashboard.html">
          <div class="brand-dot brand-dot--inicial">${inicial}</div>
          <div class="brand-name brand-name--custom">${negocioNombre}</div>
        </a>`;
    }

    return `
      <a class="sidebar-brand" href="/admin/dashboard.html">
        <div class="brand-dot">💼</div>
        <div class="brand-name">Gestión<span>PRO</span></div>
      </a>`;
  }

  // ---- LINKS (feature = null significa sin restricción) ----
  const navGroups = [
    {
      label: "Principal",
      links: [
        { href: "/admin/dashboard.html", icon: "🏠", label: "Inicio", feature: null },
        { href: "/pos.html",             icon: "🧾", label: "Punto de Venta", feature: "pos" },
        { href: "/admin/admin.html",     icon: "📄", label: "Ventas", feature: "pos" },
        { href: "/admin/caja.html",      icon: "💵", label: "Caja", feature: "caja" },
        { href: "/admin/clientes.html",  icon: "👥", label: "Clientes", feature: "clientes" },
      ],
    },
    {
      label: "Inventario",
      links: [
        { href: "/admin/productos.html",  icon: "📦", label: "Productos", feature: "productos" },
        { href: "/admin/inventario.html", icon: "🔍", label: "Movimientos", feature: "inventario" },
      ],
    },
    {
      label: "Administración",
      adminOnly: true,
      links: [
        { href: "/admin/proveedores.html",   icon: "🚚", label: "Proveedores", feature: "proveedores" },
        { href: "/admin/compras.html",       icon: "🛒", label: "Compras", feature: "compras" },
        { href: "/admin/ganancias.html",     icon: "📈", label: "Ganancias", feature: "ganancias" },
        { href: "/admin/cierre.html",        icon: "🧮", label: "Cierre de Caja", feature: "reportes" },
        { href: "/admin/historialcaja.html", icon: "📅", label: "Historial Caja", feature: "reportes" },
        { href: "/admin/usuarios.html",      icon: "🔑", label: "Usuarios", feature: null },
        { href: "/admin/auditoria.html",     icon: "🔍", label: "Auditoría", feature: "auditoria" },
        { href: "/config.html",              icon: "⚙️", label: "Configuración", feature: null },
      ],
    },
  ];

  const currentPath = location.pathname;
  function isActive(href) {
    return currentPath.endsWith(href) || currentPath === href;
  }
  function getInitial(name) {
    return (name || "U").charAt(0).toUpperCase();
  }

  // ---- CONSTRUIR SIDEBAR ----
  function buildSidebar() {
    const sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.id = "sidebar";

    sidebar.innerHTML = `
      ${buildBrand()}
      <nav class="sidebar-nav" id="sidebar-nav"></nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar">${getInitial(nombre)}</div>
          <div class="user-info">
            <div class="user-name">${nombre}</div>
            <div class="user-role">${rol || "usuario"}</div>
          </div>
        </div>
        <div class="sidebar-theme-toggle">
          <span>Modo oscuro</span>
          <button class="toggle-btn" id="theme-toggle-btn"></button>
        </div>
        <button id="sidebar-cambiar-pass" class="btn btn-ghost btn-sm w-full"
                style="justify-content:flex-start;gap:8px">
          🔒 Cambiar contraseña
        </button>
        <button id="sidebar-logout" class="btn btn-ghost btn-sm w-full"
                style="justify-content:flex-start;gap:8px">
          🚪 Cerrar sesión
        </button>
        <div id="sidebar-version" style="text-align:center;font-size:11px;color:var(--muted);padding:4px 0;opacity:.6">v1.0.0</div>
        <div id="sidebar-plan" style="text-align:center;font-size:10px;padding:2px 0 6px;opacity:.7"></div>
      </div>`;

    const nav = sidebar.querySelector("#sidebar-nav");
    const userFeatures = JSON.parse(sessionStorage.getItem("plan_features") || "null");

    navGroups.forEach((group) => {
      if (group.adminOnly && !isAdmin) return;
      const groupEl = document.createElement("div");
      groupEl.className = "sidebar-group";
      groupEl.innerHTML = `<div class="sidebar-group-label">${group.label}</div>`;
      let visibleLinks = 0;
      group.links.forEach((link) => {
        if (link.feature && userFeatures && !userFeatures.includes(link.feature)) return;
        const a = document.createElement("a");
        a.href = link.href;
        a.className = "sidebar-link" + (isActive(link.href) ? " active" : "");
        a.innerHTML = `<span class="link-icon">${link.icon}</span>${link.label}`;
        groupEl.appendChild(a);
        visibleLinks++;
      });
      if (visibleLinks > 0) nav.appendChild(groupEl);
    });

    return sidebar;
  }

  function buildMobileBtn() {
    const btn = document.createElement("button");
    btn.className = "mobile-menu-btn";
    btn.id = "mobile-menu-btn";
    btn.textContent = "☰";
    btn.title = "Menú";
    return btn;
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "sidebar-overlay";
    overlay.style.cssText = `
      display:none; position:fixed; inset:0;
      background:rgba(0,0,0,.4); z-index:99;
      backdrop-filter:blur(2px);
    `;
    return overlay;
  }

  // ================================================================
  // PROGRESS BAR + TRANSICIONES DE PÁGINA
  // ================================================================

  function createProgressBar() {
    const bar = document.createElement("div");
    bar.id = "nav-progress";
    bar.innerHTML = `<div id="nav-progress-fill"></div>`;
    document.body.appendChild(bar);
  }

  function progressStart() {
    const fill = document.getElementById("nav-progress-fill");
    if (!fill) return;
    fill.style.transition = "none";
    fill.style.width = "0%";
    fill.style.opacity = "1";
    requestAnimationFrame(() => {
      fill.style.transition = "width 0.25s ease";
      fill.style.width = "30%";
      setTimeout(() => {
        fill.style.transition = "width 2s ease";
        fill.style.width = "85%";
      }, 250);
    });
  }

  function progressDone() {
    const fill = document.getElementById("nav-progress-fill");
    if (!fill) return;
    fill.style.transition = "width 0.15s ease";
    fill.style.width = "100%";
    setTimeout(() => {
      fill.style.transition = "opacity 0.3s ease";
      fill.style.opacity = "0";
      setTimeout(() => {
        fill.style.transition = "none";
        fill.style.width = "0%";
        fill.style.opacity = "1";
      }, 300);
    }, 150);
  }

  function fadeOutContent(cb) {
    const mc = document.querySelector(".main-content");
    if (!mc) { cb(); return; }
    mc.style.transition = "opacity 0.18s ease, transform 0.18s ease";
    mc.style.opacity = "0";
    mc.style.transform = "translateY(6px)";
    setTimeout(cb, 180);
  }

  function initPageTransitions(nav) {
    nav.addEventListener("click", (e) => {
      const link = e.target.closest("a.sidebar-link");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isActive(href)) return;

      // Guardar scroll del sidebar antes de navegar
      const savedScroll = nav.scrollTop;
      sessionStorage.setItem("sidebar-scroll", savedScroll);

      e.preventDefault();
      progressStart();
      fadeOutContent(() => {
        window.location.href = href;
      });
    });
  }

  function initFadeIn() {
    const mc = document.querySelector(".main-content");
    if (!mc) return;
    mc.style.opacity = "0";
    mc.style.transform = "translateY(8px)";
    mc.style.transition = "none";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mc.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        mc.style.opacity = "1";
        mc.style.transform = "translateY(0)";
      });
    });
    progressDone();
  }

  // ================================================================
  // INIT
  // ================================================================
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("header, .top, .topbar, .hdr").forEach((el) => el.remove());

    const body = document.body;
    const existingContent = Array.from(body.children);

    const mainContent = document.createElement("div");
    mainContent.className = "main-content";
    existingContent.forEach((el) => mainContent.appendChild(el));

    const sidebar   = buildSidebar();
    const mobileBtn = buildMobileBtn();
    const overlay   = buildOverlay();

    body.appendChild(sidebar);
    body.appendChild(mainContent);
    body.appendChild(mobileBtn);
    body.appendChild(overlay);

    createProgressBar();

    // ── FIX SCROLL: restaurar posición del sidebar nav ──
    const sidebarNav = document.getElementById("sidebar-nav");
    const savedScroll = sessionStorage.getItem("sidebar-scroll");
    if (sidebarNav && savedScroll !== null) {
      sidebarNav.scrollTop = parseInt(savedScroll, 10) || 0;
    }

    // Fade in de entrada
    initFadeIn();

    // Interceptar navegación
    initPageTransitions(sidebarNav);

    // ---- TEMA ----
    const toggleBtn = document.getElementById("theme-toggle-btn");
    function updateToggle() {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      if (toggleBtn) toggleBtn.classList.toggle("on", isDark);
    }
    updateToggle();
    toggleBtn?.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      updateToggle();
    });

    // ---- CAMBIAR CONTRASEÑA ----
    document.getElementById("sidebar-cambiar-pass")?.addEventListener("click", async () => {
      if (typeof Swal === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
      }
      const { value: formValues } = await Swal.fire({
        title: '🔒 Cambiar contraseña',
        html:
          '<div style="display:flex;flex-direction:column;gap:12px;text-align:left">' +
          '<label style="font-size:13px;font-weight:600">Contraseña actual</label>' +
          '<input id="swal-pass-actual" type="password" class="swal2-input" placeholder="Contraseña actual" style="margin:0">' +
          '<label style="font-size:13px;font-weight:600">Nueva contraseña</label>' +
          '<input id="swal-pass-nueva" type="password" class="swal2-input" placeholder="Mínimo 6 caracteres" style="margin:0">' +
          '<label style="font-size:13px;font-weight:600">Confirmar nueva contraseña</label>' +
          '<input id="swal-pass-confirm" type="password" class="swal2-input" placeholder="Repetir nueva contraseña" style="margin:0">' +
          '</div>',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Cambiar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          const actual = document.getElementById('swal-pass-actual').value;
          const nueva = document.getElementById('swal-pass-nueva').value;
          const confirm = document.getElementById('swal-pass-confirm').value;
          if (!actual || !nueva || !confirm) {
            Swal.showValidationMessage('Completá todos los campos');
            return false;
          }
          if (nueva.length < 6) {
            Swal.showValidationMessage('La contraseña debe tener al menos 6 caracteres');
            return false;
          }
          if (nueva !== confirm) {
            Swal.showValidationMessage('Las contraseñas no coinciden');
            return false;
          }
          return { password_actual: actual, password_nueva: nueva };
        }
      });
      if (!formValues) return;
      try {
        const res = await fetch('/api/auth/cambiar-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify(formValues),
        });
        const data = await res.json();
        if (res.ok) {
          Swal.fire({ icon: 'success', title: 'Contraseña actualizada', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'Error', text: data.message || data.error });
        }
      } catch {
        Swal.fire({ icon: 'error', title: 'Error de conexión' });
      }
    });

    // ---- LOGOUT ----
    document.getElementById("sidebar-logout")?.addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user_email");
      localStorage.removeItem("user_nombre");
      localStorage.removeItem("user_rol");
      sessionStorage.removeItem("plan_features");
      sessionStorage.removeItem("plan_name");
      location.href = "/admin/login.html";
    });

    // ---- MOBILE ----
    mobileBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay.style.display = sidebar.classList.contains("open") ? "block" : "none";
    });
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.style.display = "none";
    });

    // ---- VERSIÓN + PLAN ----
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(v => {
        const el = document.getElementById('sidebar-version');
        if (el) el.textContent = 'v' + v;
      }).catch(() => {});
    }
    if (token) {
      fetch('/api/licencia/features', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const el = document.getElementById('sidebar-plan');
          if (!el || !data) return;
          const labels = { trial: '🔓 Trial', basico: '📦 Básico', pro: '⭐ Pro', enterprise: '🏢 Enterprise' };
          const colors = { trial: '#f59e0b', basico: '#60a5fa', pro: '#a78bfa', enterprise: '#34d399' };
          el.innerHTML = `<span style="background:${colors[data.plan] || '#666'};color:#000;padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px">${labels[data.plan] || data.plan}</span>`;
        }).catch(() => {});
    }

    // ---- CARGAR FEATURES DEL PLAN ----
    if (token && !sessionStorage.getItem("plan_features")) {
      fetch("/api/licencia/features", {
        headers: { Authorization: "Bearer " + token },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.features) {
            sessionStorage.setItem("plan_features", JSON.stringify(data.features));
            sessionStorage.setItem("plan_name", data.plan);
            // Recargar sidebar con features actualizadas
            const oldNav = document.getElementById("sidebar-nav");
            if (oldNav) {
              oldNav.innerHTML = "";
              const updatedFeatures = data.features;
              navGroups.forEach((group) => {
                if (group.adminOnly && !isAdmin) return;
                const groupEl = document.createElement("div");
                groupEl.className = "sidebar-group";
                groupEl.innerHTML = `<div class="sidebar-group-label">${group.label}</div>`;
                let visibleLinks = 0;
                group.links.forEach((link) => {
                  if (link.feature && !updatedFeatures.includes(link.feature)) return;
                  const a = document.createElement("a");
                  a.href = link.href;
                  a.className = "sidebar-link" + (isActive(link.href) ? " active" : "");
                  a.innerHTML = `<span class="link-icon">${link.icon}</span>${link.label}`;
                  groupEl.appendChild(a);
                  visibleLinks++;
                });
                if (visibleLinks > 0) oldNav.appendChild(groupEl);
              });
              initPageTransitions(oldNav);
            }
          }
        })
        .catch(() => {});
    }

    // ---- NOTIFICACIONES ----
    if (token) {
      fetch("/api/productos/alertas/stock-bajo", {
        headers: { Authorization: "Bearer " + token },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          const productosLink = document.querySelector('.sidebar-link[href="/admin/productos.html"]');
          if (productosLink && data.length > 0) {
            productosLink.innerHTML += `
              <span style="margin-left:auto;background:var(--danger);color:#fff;
                border-radius:99px;padding:1px 7px;font-size:10px;font-weight:700">
                ${data.length}
              </span>`;
          }
        })
        .catch(() => {});
    }
  });

})();

// ---- LOGOUT legacy ----
const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("user_rol");
    window.location.href = "/admin/login.html";
  });
}
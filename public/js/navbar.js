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
        { href: "/admin/promociones.html",   icon: "🏷️", label: "Promociones", feature: null },
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
      <div class="sidebar-alerts" id="sidebar-alerts" style="display:none;padding:8px 12px">
        <button id="btn-sidebar-alerts" class="btn btn-ghost btn-sm w-full"
                style="justify-content:flex-start;gap:8px;color:var(--danger);font-weight:600;position:relative">
          🔔 <span id="alerts-label">Alertas</span>
          <span id="alerts-badge" style="margin-left:auto;background:var(--danger);color:#fff;
            border-radius:99px;padding:1px 7px;font-size:10px;font-weight:700"></span>
        </button>
      </div>
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
  // ANIMACIÓN BIENVENIDA
  // ================================================================
  function showWelcome(nombre) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wcIn  { from { opacity:0; transform:scale(.88) translateY(16px); } to { opacity:1; transform:scale(1) translateY(0); } }
      @keyframes wcOut { from { opacity:1; transform:scale(1); } to { opacity:0; transform:scale(1.04); } }
      @keyframes wcPop { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
      @keyframes wcPulse { 0%,100%{box-shadow:0 0 0 0 rgba(30,143,255,.5)} 50%{box-shadow:0 0 0 18px rgba(30,143,255,0)} }
      #welcome-overlay { position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(6,15,24,.92);backdrop-filter:blur(10px); }
      .wc-card { background:linear-gradient(145deg,#0d1b2a,#0a1628);border:1px solid rgba(30,143,255,.3);border-radius:24px;padding:48px 56px;text-align:center;max-width:380px;width:90%;animation:wcIn .45s cubic-bezier(.34,1.56,.64,1) both;box-shadow:0 32px 80px rgba(0,0,0,.5); }
      .wc-avatar { width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#1e6fff,#0a4fc9);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#fff;margin:0 auto 20px;animation:wcPop .5s .2s cubic-bezier(.34,1.56,.64,1) both,wcPulse 2s 1s ease-in-out infinite; }
      .wc-hola { font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(56,182,255,.7);margin-bottom:6px; }
      .wc-nombre { font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;margin-bottom:8px; }
      .wc-sub { font-size:13px;color:rgba(255,255,255,.38); }
      .wc-bar { height:3px;border-radius:2px;background:rgba(30,143,255,.2);margin-top:28px;overflow:hidden; }
      .wc-bar-fill { height:100%;width:0;background:linear-gradient(90deg,#1e6fff,#38b6ff);border-radius:2px;transition:width 2.2s linear; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    const inicial = (nombre || 'U').charAt(0).toUpperCase();
    overlay.innerHTML = `
      <div class="wc-card">
        <div class="wc-avatar">${inicial}</div>
        <div class="wc-hola">¡Bienvenido/a!</div>
        <div class="wc-nombre">${nombre}</div>
        <div class="wc-sub">Todo listo para empezar</div>
        <div class="wc-bar"><div class="wc-bar-fill" id="wc-bar-fill"></div></div>
      </div>`;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      const fill = document.getElementById('wc-bar-fill');
      if (fill) fill.style.width = '100%';
    });

    setTimeout(() => {
      const card = overlay.querySelector('.wc-card');
      if (card) card.style.animation = 'wcOut .35s ease forwards';
      overlay.style.transition = 'opacity .35s ease';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 380);
    }, 2500);
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

    // ---- ANIMACIÓN DE BIENVENIDA ----
    const welcomeNombre = sessionStorage.getItem('welcome_nombre');
    if (welcomeNombre) {
      sessionStorage.removeItem('welcome_nombre');
      showWelcome(welcomeNombre);
    }

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

    // ---- CAMBIAR IP (solo Electron modo Caja) ----
    if (window.electronAPI?.getMode) {
      window.electronAPI.getMode().then(cfg => {
        if (!cfg || cfg.modo !== 'cliente') return;
        const footer = document.querySelector('.sidebar-footer');
        const logoutBtn = document.getElementById('sidebar-logout');
        if (!footer || !logoutBtn) return;
        const btnIp = document.createElement('button');
        btnIp.className = 'btn btn-ghost btn-sm w-full';
        btnIp.style.cssText = 'justify-content:flex-start;gap:8px';
        btnIp.innerHTML = '🌐 Cambiar IP del servidor';
        btnIp.addEventListener('click', async () => {
          if (typeof Swal === 'undefined') {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
            document.head.appendChild(s);
            await new Promise(r => s.onload = r);
          }
          const { value: newIp } = await Swal.fire({
            title: '🌐 IP del servidor',
            html: `<div style="text-align:left;margin-bottom:8px;font-size:13px;color:var(--muted)">IP actual: <b style="color:var(--accent)">${cfg.ip || '–'}</b></div>
                   <input id="swal-ip-input" class="swal2-input" placeholder="192.168.1.10" value="${cfg.ip || ''}" maxlength="15"/>`,
            showCancelButton: true,
            confirmButtonText: 'Guardar y reconectar',
            cancelButtonText: 'Cancelar',
            focusConfirm: false,
            preConfirm: () => {
              const v = document.getElementById('swal-ip-input').value.trim();
              const valid = /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every(n => Number(n) <= 255);
              if (!valid) { Swal.showValidationMessage('IP inválida — ejemplo: 192.168.1.10'); return false; }
              return v;
            }
          });
          if (!newIp) return;
          await window.electronAPI.setMode('cliente', newIp);
        });
        footer.insertBefore(btnIp, logoutBtn);
      }).catch(() => {});
    }

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
          const labels = { trial: '🔓 Trial', basico: '📦 Básico', pro: '⭐ Pro', ultra: '🚀 Ultra' };
          const colors = { trial: '#f59e0b', basico: '#60a5fa', pro: '#a78bfa', ultra: '#34d399' };
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

    // ---- TRIAL GUARD ----
    (async () => {
      try {
        const r = await fetch('/api/licencia/estado-publico');
        if (!r.ok) return;
        const d = await r.json();
        if (d.trialExpired && !d.activa) {
          location.replace('/admin/bloqueado.html');
          return;
        }
        // Banner cuando quedan 3 días o menos
        if (d.trial && !d.trialExpired && d.diasRestantes <= 3) {
          const urgente = d.diasRestantes <= 1;
          const banner = document.createElement('div');
          banner.id = 'trial-banner';
          banner.style.cssText = [
            'position:fixed;top:0;left:0;right:0;z-index:9998',
            'padding:8px 20px;text-align:center;font-size:12px;font-weight:600',
            'background:' + (urgente ? '#dc2626' : '#d97706'),
            'color:#fff;letter-spacing:.03em;cursor:default',
          ].join(';');
          banner.textContent = d.diasRestantes === 0
            ? '⚠️ Tu período de prueba vence HOY — contactá a Savatek para activar tu licencia.'
            : `⏳ Te quedan ${d.diasRestantes} día${d.diasRestantes === 1 ? '' : 's'} de prueba — contactá a Savatek para continuar.`;
          document.body.insertBefore(banner, document.body.firstChild);
          // empujar contenido para que el banner no tape nada
          const mc = document.querySelector('.main-content');
          const sb = document.getElementById('sidebar');
          if (mc) mc.style.paddingTop = '36px';
          if (sb) sb.style.paddingTop = '36px';
        }
      } catch {}
    })();

    // ---- NOTIFICACIONES SYSTEM-WIDE ----
    if (token) {
      fetch("/api/productos/alertas/stock-bajo", {
        headers: { Authorization: "Bearer " + token },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!Array.isArray(data) || !data.length) return;

          // Badge en link de Productos
          const productosLink = document.querySelector('.sidebar-link[href="/admin/productos.html"]');
          if (productosLink) {
            productosLink.innerHTML += `
              <span style="margin-left:auto;background:var(--danger);color:#fff;
                border-radius:99px;padding:1px 7px;font-size:10px;font-weight:700">
                ${data.length}
              </span>`;
          }

          // Panel de alertas en sidebar
          const alertsContainer = document.getElementById("sidebar-alerts");
          const alertsBadge = document.getElementById("alerts-badge");
          const alertsLabel = document.getElementById("alerts-label");
          if (alertsContainer) {
            alertsContainer.style.display = "block";
            if (alertsBadge) alertsBadge.textContent = data.length;
            if (alertsLabel) alertsLabel.textContent = `Stock bajo (${data.length})`;
          }

          // Click en alertas → mostrar detalle
          document.getElementById("btn-sidebar-alerts")?.addEventListener("click", () => {
            const listHtml = data.slice(0, 10).map(p =>
              `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)">
                <span>${p.nombre}</span>
                <span style="color:var(--danger);font-weight:700">${p.stock} uds</span>
              </div>`
            ).join("");
            if (typeof Swal !== "undefined") {
              Swal.fire({
                title: "⚠️ Stock bajo",
                html: `<div style="text-align:left;max-height:300px;overflow:auto">${listHtml}${data.length > 10 ? `<div style="padding:8px 0;opacity:.6">...y ${data.length - 10} más</div>` : ""}</div>`,
                confirmButtonText: "Ir a Productos",
                showCancelButton: true,
                cancelButtonText: "Cerrar",
                confirmButtonColor: "#ff5c5c",
              }).then(result => {
                if (result.isConfirmed) location.href = "/admin/productos.html";
              });
            } else {
              location.href = "/admin/productos.html";
            }
          });

          // Toast de alerta (solo una vez por sesión)
          const alertKey = "stock_alert_shown_" + new Date().toISOString().slice(0, 10);
          if (!sessionStorage.getItem(alertKey)) {
            sessionStorage.setItem(alertKey, "1");
            if (!document.getElementById("toast-keyframes")) {
              const style = document.createElement("style");
              style.id = "toast-keyframes";
              style.textContent = "@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}";
              document.head.appendChild(style);
            }
            const toast = document.createElement("div");
            toast.id = "stock-toast";
            toast.style.cssText = `
              position:fixed; bottom:20px; right:20px; z-index:9999;
              background:linear-gradient(135deg, #1a1a2e, #16213e);
              border:1px solid var(--danger); border-radius:12px;
              padding:14px 20px; max-width:340px; box-shadow:0 8px 32px rgba(0,0,0,.4);
              animation: slideInRight .3s ease; cursor:pointer;
              display:flex; align-items:center; gap:12px;
            `;
            const criticalCount = data.filter(p => p.stock <= 0).length;
            const lowCount = data.length - criticalCount;
            let msg = `${data.length} producto${data.length > 1 ? "s" : ""} con stock bajo`;
            if (criticalCount > 0) msg += ` (${criticalCount} sin stock)`;
            toast.innerHTML = `
              <span style="font-size:24px">⚠️</span>
              <div>
                <div style="font-weight:700;font-size:13px;color:var(--danger)">Alerta de Stock</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">${msg}</div>
              </div>
              <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;margin-left:auto">✕</button>
            `;
            toast.addEventListener("click", (e) => {
              if (e.target.tagName !== "BUTTON") {
                document.getElementById("btn-sidebar-alerts")?.click();
                toast.remove();
              }
            });
            document.body.appendChild(toast);
            setTimeout(() => { if (toast.parentElement) toast.remove(); }, 8000);
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
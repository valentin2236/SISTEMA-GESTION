// public/js/auditoria.js
(function () {
  const token = localStorage.getItem("token");
  if (!token) { location.href = "/admin/login.html"; return; }

  /* ── DOM ── */
  const $tbody      = document.getElementById("aud-tbody");
  const $desde      = document.getElementById("f-desde");
  const $hasta      = document.getElementById("f-hasta");
  const $usuario    = document.getElementById("f-usuario");
  const $accion     = document.getElementById("f-accion");
  const $buscar     = document.getElementById("f-buscar");
  const $btnFiltrar = document.getElementById("btn-filtrar");
  const $btnLimpiar = document.getElementById("btn-limpiar-filtros");
  const $btnExport  = document.getElementById("btn-exportar-aud");
  const $footer     = document.getElementById("aud-footer");

  /* ── Estado ── */
  let datosCompletos = []; // todos los registros cargados
  let datosFiltrados = []; // después de aplicar filtros cliente

  /* ── Utils ── */
  function money(n) {
    return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  function formatFecha(str) {
    if (!str) return "–";
    const d = new Date(str);
    return d.toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function fechaCorta(str) {
    if (!str) return "–";
    return new Date(str).toLocaleTimeString("es-AR", {
      hour: "2-digit", minute: "2-digit",
    });
  }

  async function api(url) {
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem("token");
      location.href = "/admin/login.html";
      return null;
    }
    return res;
  }

  /* ── Iconos y colores por acción ── */
  const accionConfig = {
    CREAR_PRODUCTO:      { icon: "➕", clase: "aud-tag--create",  label: "Crear producto" },
    EDITAR_PRODUCTO:     { icon: "✏️",  clase: "aud-tag--edit",    label: "Editar producto" },
    DESACTIVAR_PRODUCTO: { icon: "🗑️",  clase: "aud-tag--delete",  label: "Eliminar producto" },
    IMPORTAR_PRODUCTOS:  { icon: "📥",  clase: "aud-tag--import",  label: "Importar productos" },
    CREAR_VENTA:         { icon: "💰",  clase: "aud-tag--create",  label: "Nueva venta" },
    DEVOLUCION:          { icon: "↩️",  clase: "aud-tag--warn",    label: "Devolución" },
    CREAR_CLIENTE:       { icon: "👤",  clase: "aud-tag--create",  label: "Crear cliente" },
    EDITAR_CLIENTE:      { icon: "✏️",  clase: "aud-tag--edit",    label: "Editar cliente" },
    CREAR_COMPRA:        { icon: "🛒",  clase: "aud-tag--import",  label: "Nueva compra" },
    AJUSTE_STOCK:        { icon: "📊",  clase: "aud-tag--edit",    label: "Ajuste stock" },
    LOGIN:               { icon: "🔐",  clase: "aud-tag--info",    label: "Login" },
    LOGOUT:              { icon: "🚪",  clase: "aud-tag--info",    label: "Logout" },
    APERTURA_CAJA:       { icon: "🟢",  clase: "aud-tag--create",  label: "Apertura caja" },
    CIERRE_CAJA:         { icon: "🔴",  clase: "aud-tag--delete",  label: "Cierre caja" },
    CREAR_USUARIO:       { icon: "👤",  clase: "aud-tag--create",  label: "Crear usuario" },
    EDITAR_USUARIO:      { icon: "✏️",  clase: "aud-tag--edit",    label: "Editar usuario" },
  };

  function getAccionCfg(accion) {
    return accionConfig[accion] || { icon: "📋", clase: "aud-tag--info", label: accion };
  }

  /* ── Cargar datos ── */
  async function cargar() {
    $tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">⏳</span><span>Cargando…</span></div></td></tr>`;

    const res = await api("/api/auditoria?limit=500");
    if (!res) return;
    if (!res.ok) {
      $tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">⚠️</span><span>Error al cargar</span></div></td></tr>`;
      return;
    }

    datosCompletos = await res.json();
    poblarFiltros(datosCompletos);
    aplicarFiltros();
  }

  /* ── Poblar selects de usuario y acción ── */
  function poblarFiltros(datos) {
    const usuarios = [...new Set(datos.map(r => r.usuario).filter(Boolean))].sort();
    const acciones = [...new Set(datos.map(r => r.accion).filter(Boolean))].sort();

    $usuario.innerHTML = `<option value="">Todos</option>` +
      usuarios.map(u => `<option value="${u}">${u}</option>`).join("");

    $accion.innerHTML = `<option value="">Todas</option>` +
      acciones.map(a => {
        const cfg = getAccionCfg(a);
        return `<option value="${a}">${cfg.icon} ${cfg.label}</option>`;
      }).join("");
  }

  /* ── Aplicar filtros (cliente-side) ── */
  function aplicarFiltros() {
    const desde   = $desde?.value  || "";
    const hasta   = $hasta?.value  || "";
    const usuario = $usuario?.value || "";
    const accion  = $accion?.value  || "";
    const buscar  = ($buscar?.value || "").toLowerCase().trim();

    datosFiltrados = datosCompletos.filter(r => {
      const fecha = r.fecha ? r.fecha.slice(0, 10) : "";
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (usuario && r.usuario !== usuario) return false;
      if (accion  && r.accion  !== accion)  return false;
      if (buscar  && !(r.detalle || "").toLowerCase().includes(buscar) &&
                     !(r.accion  || "").toLowerCase().includes(buscar) &&
                     !(r.usuario || "").toLowerCase().includes(buscar)) return false;
      return true;
    });

    actualizarKpis(datosFiltrados);
    renderTabla(datosFiltrados);
  }

  /* ── KPIs ── */
  function actualizarKpis(datos) {
    const hoy = new Date().toISOString().slice(0, 10);
    const accionesHoy = datos.filter(r => (r.fecha || "").slice(0, 10) === hoy).length;
    const usuarios    = new Set(datos.map(r => r.usuario).filter(Boolean));
    const ultima      = datos[0];

    document.getElementById("kpi-total").textContent    = datos.length;
    document.getElementById("kpi-usuarios").textContent = usuarios.size;
    document.getElementById("kpi-hoy").textContent      = accionesHoy;

    if (ultima) {
      const cfg = getAccionCfg(ultima.accion);
      document.getElementById("kpi-ultima").textContent      = `${cfg.icon} ${cfg.label}`;
      document.getElementById("kpi-ultima-quien").textContent = `${ultima.usuario || "–"} · ${formatFecha(ultima.fecha)}`;
    } else {
      document.getElementById("kpi-ultima").textContent      = "–";
      document.getElementById("kpi-ultima-quien").textContent = "–";
    }

    if ($footer) {
      $footer.textContent = datos.length
        ? `Mostrando ${datos.length} registro${datos.length !== 1 ? "s" : ""}`
        : "";
    }
  }

  /* ── Render tabla ── */
  function renderTabla(datos) {
    if (!datos.length) {
      $tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">🔍</span><span>Sin registros para los filtros aplicados</span></div></td></tr>`;
      return;
    }

    $tbody.innerHTML = datos.map(r => {
      const cfg = getAccionCfg(r.accion);
      return `
        <tr>
          <td class="muted-cell">${r.id}</td>
          <td class="aud-fecha">${formatFecha(r.fecha)}</td>
          <td class="aud-usuario">
            <span class="aud-avatar">${(r.usuario || "?")[0].toUpperCase()}</span>
            <span>${r.usuario || "–"}</span>
          </td>
          <td>
            <span class="aud-tag ${cfg.clase}">${cfg.icon} ${cfg.label}</span>
          </td>
          <td class="aud-detalle">${r.detalle || "–"}</td>
        </tr>`;
    }).join("");
  }

  /* ── Exportar CSV ── */
  $btnExport?.addEventListener("click", () => {
    if (!datosFiltrados.length) {
      Swal.fire({ icon: "warning", title: "Sin datos", text: "Aplicá filtros primero." });
      return;
    }
    const rows = [
      ["#", "Fecha", "Usuario", "Acción", "Detalle"],
      ...datosFiltrados.map(r => {
        const cfg = getAccionCfg(r.accion);
        return [r.id, formatFecha(r.fecha), r.usuario || "", cfg.label, r.detalle || ""];
      }),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a    = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `auditoria_${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
  });

  /* ── Fechas por defecto: último mes ── */
  const hoy = new Date();
  const hace30 = new Date(hoy);
  hace30.setDate(hoy.getDate() - 30);
  if ($desde) $desde.value = hace30.toISOString().slice(0, 10);
  if ($hasta) $hasta.value = hoy.toISOString().slice(0, 10);

  /* ── Eventos ── */
  $btnFiltrar?.addEventListener("click", aplicarFiltros);
  $btnLimpiar?.addEventListener("click", () => {
    if ($desde)   $desde.value   = hace30.toISOString().slice(0, 10);
    if ($hasta)   $hasta.value   = hoy.toISOString().slice(0, 10);
    if ($usuario) $usuario.value = "";
    if ($accion)  $accion.value  = "";
    if ($buscar)  $buscar.value  = "";
    aplicarFiltros();
  });

  // Enter en el buscador
  $buscar?.addEventListener("keydown", e => { if (e.key === "Enter") aplicarFiltros(); });

  /* ── Init ── */
  cargar();

})();
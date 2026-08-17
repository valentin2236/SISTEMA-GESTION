// public/js/promociones.js
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) { location.href = "/admin/login.html"; return; }

  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  function money(n) {
    return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  const argHoy = new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);

  // ── Referencias DOM ──
  const $tbody      = document.getElementById("promo-tbody");
  const $dlg        = document.getElementById("dlg-promo");
  const $buscar     = document.getElementById("promo-buscar");
  const $resultados = document.getElementById("promo-resultados");
  const $prodId     = document.getElementById("promo-producto-id");
  const $prodLista  = document.getElementById("promo-productos-lista");
  const $tipos      = document.getElementById("promo-tipos");
  const $campoCant  = document.getElementById("campo-cantidad");
  const $cantidad   = document.getElementById("promo-cantidad");
  const $sugerido   = document.getElementById("promo-precio-sugerido");
  const $precio     = document.getElementById("promo-precio");
  const $desde      = document.getElementById("promo-desde");
  const $hasta      = document.getElementById("promo-hasta");
  const $nombre     = document.getElementById("promo-nombre");

  // Lista de productos seleccionados: [{ id, nombre, precio }]
  let _productosSeleccionados = [];
  let _cantActual   = 2;
  let _pagadoActual = 1;

  // ── Cargar lista ──
  async function cargar() {
    const res = await fetch("/api/promociones", { headers });
    if (!res.ok) { $tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span>Error al cargar</span></div></td></tr>`; return; }
    const rows = await res.json();
    if (!rows.length) {
      $tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">🏷️</span><span>Sin promociones cargadas</span></div></td></tr>`;
      return;
    }
    $tbody.innerHTML = rows.map(p => {
      const esGrupo = p.es_grupo && p.productos_grupo && p.productos_grupo.length > 1;
      const nombreProducto = esGrupo
        ? p.productos_grupo.map(g => g.nombre).join(" / ")
        : p.producto_nombre;
      const precioRef = esGrupo
        ? (p.productos_grupo.reduce((s, g) => s + Number(g.precio), 0) / p.productos_grupo.length)
        : Number(p.precio_normal);
      const ahorro   = (precioRef * p.cantidad) - p.precio_promo;
      const vencida  = p.fecha_hasta && p.fecha_hasta < argHoy;
      const estadoBadge = !p.activa
        ? `<span class="badge badge--red">Inactiva</span>`
        : vencida
          ? `<span class="badge badge--yellow">Vencida</span>`
          : `<span class="badge badge--green">Activa</span>`;
      const grupoBadge = esGrupo ? `<span class="badge badge--blue" style="font-size:10px;margin-left:4px">GRUPO</span>` : "";
      return `
        <tr>
          <td><b>${nombreProducto}</b>${grupoBadge}<br><small class="muted">${p.nombre}</small></td>
          <td class="center"><span class="promo-pack-badge">${p.cantidad}×1</span></td>
          <td class="right"><b>$${money(p.precio_promo)}</b></td>
          <td class="right muted">$${money(precioRef * p.cantidad)}</td>
          <td class="right" style="color:var(--accent)">−$${money(ahorro)}</td>
          <td class="center">${p.fecha_hasta || '—'}</td>
          <td class="center">${estadoBadge}</td>
          <td class="center" style="display:flex;gap:6px;justify-content:center">
            <button class="btn btn-outline btn-sm" onclick="togglePromo(${p.id}, ${p.activa})">
              ${p.activa ? '⏸ Pausar' : '▶ Activar'}
            </button>
            <button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="eliminarPromo(${p.id})">🗑</button>
          </td>
        </tr>`;
    }).join("");
  }

  // ── Abrir modal ──
  document.getElementById("btn-nueva-promo")?.addEventListener("click", () => {
    resetModal();
    $desde.value = argHoy;
    $dlg.showModal();
  });
  document.getElementById("btn-cerrar-promo")?.addEventListener("click", () => $dlg.close());
  document.getElementById("btn-cancelar-promo")?.addEventListener("click", () => $dlg.close());

  function resetModal() {
    $buscar.value = "";
    $prodId.value = "";
    $resultados.innerHTML = "";
    _productosSeleccionados = [];
    renderProductosSeleccionados();
    _cantActual = 2; _pagadoActual = 1;
    $precio.value = ""; $sugerido.value = ""; $nombre.value = "";
    $desde.value = ""; $hasta.value = "";
    $campoCant.style.display = "none";
    $tipos.querySelectorAll(".promo-tipo-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
  }

  // ── Render lista de productos seleccionados ──
  function renderProductosSeleccionados() {
    if (!_productosSeleccionados.length) {
      $prodLista.innerHTML = "";
      return;
    }
    $prodLista.innerHTML = _productosSeleccionados.map((p, i) => `
      <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 10px">
        <span style="flex:1;font-size:13px;font-weight:600">${p.nombre}</span>
        <span style="font-size:12px;color:var(--muted)">$${money(p.precio)}</span>
        <button type="button" onclick="quitarProductoPromo(${i})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:15px;padding:0 2px" title="Quitar">✕</button>
      </div>`).join("");
    calcularSugerido();
  }

  window.quitarProductoPromo = (idx) => {
    _productosSeleccionados.splice(idx, 1);
    renderProductosSeleccionados();
  };

  // ── Búsqueda de producto ──
  let _buscarTimer;
  $buscar?.addEventListener("input", () => {
    clearTimeout(_buscarTimer);
    const q = $buscar.value.trim();
    if (q.length < 2) { $resultados.innerHTML = ""; return; }
    _buscarTimer = setTimeout(async () => {
      const res = await fetch(`/api/productos?search=${encodeURIComponent(q)}&limit=8`, { headers });
      if (!res.ok) return;
      const prods = await res.json();
      if (!prods.length) { $resultados.innerHTML = `<div class="promo-dropdown"><div class="promo-drop-item muted">Sin resultados</div></div>`; return; }
      $resultados.innerHTML = `<div class="promo-dropdown">${prods.map(p =>
        `<div class="promo-drop-item" data-id="${p.id}" data-nombre="${p.nombre}" data-precio="${p.precio}">
          <b>${p.nombre}</b> <span class="muted">SKU: ${p.sku || '—'}</span>
          <span style="float:right">$${money(p.precio)}</span>
        </div>`
      ).join("")}</div>`;
    }, 250);
  });

  $resultados?.addEventListener("click", e => {
    const item = e.target.closest(".promo-drop-item[data-id]");
    if (!item) return;
    const id     = Number(item.dataset.id);
    const nombre = item.dataset.nombre;
    const precio = Number(item.dataset.precio);
    // No agregar duplicados
    if (_productosSeleccionados.some(p => p.id === id)) {
      $buscar.value = "";
      $resultados.innerHTML = "";
      return;
    }
    _productosSeleccionados.push({ id, nombre, precio });
    $buscar.value = "";
    $resultados.innerHTML = "";
    // Backward compat: mantener producto_id como el primero
    $prodId.value = _productosSeleccionados[0].id;
    renderProductosSeleccionados();
  });

  // ── Tipos de promo ──
  $tipos?.addEventListener("click", e => {
    const btn = e.target.closest(".promo-tipo-btn");
    if (!btn) return;
    $tipos.querySelectorAll(".promo-tipo-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const esPers = !btn.dataset.cant;
    $campoCant.style.display = esPers ? "" : "none";
    if (!esPers) {
      _cantActual   = Number(btn.dataset.cant);
      _pagadoActual = Number(btn.dataset.pagado);
    }
    calcularSugerido();
  });

  $cantidad?.addEventListener("input", () => {
    _cantActual   = Number($cantidad.value) || 2;
    _pagadoActual = _cantActual - 1;
    calcularSugerido();
  });

  function calcularSugerido() {
    if (!_productosSeleccionados.length) return;
    // Precio promedio de los productos seleccionados
    const precioPromedio = _productosSeleccionados.reduce((s, p) => s + p.precio, 0) / _productosSeleccionados.length;
    const sugerido = _pagadoActual * precioPromedio;
    $sugerido.value = `$${money(sugerido)}`;
    if (!$precio.value) $precio.value = sugerido.toFixed(2);
  }

  $precio?.addEventListener("focus", () => { if (!$precio.value) calcularSugerido(); });

  // ── Guardar ──
  document.getElementById("btn-guardar-promo")?.addEventListener("click", async () => {
    if (!_productosSeleccionados.length) {
      Swal.fire({ icon: "warning", title: "Falta el producto", text: "Buscá y seleccioná al menos un producto", confirmButtonColor: "#00d875" });
      return;
    }
    const esPers = $campoCant.style.display !== "none";
    const cant   = esPers ? Number($cantidad.value) : _cantActual;
    const precio = Number($precio.value);
    if (!cant || cant < 2) { Swal.fire({ icon: "warning", title: "Cantidad inválida", text: "Mínimo 2 unidades", confirmButtonColor: "#00d875" }); return; }
    if (!precio || precio <= 0) { Swal.fire({ icon: "warning", title: "Precio inválido", text: "Ingresá el precio del pack", confirmButtonColor: "#00d875" }); return; }

    const tipoBtn  = $tipos.querySelector(".promo-tipo-btn.active");
    const tipoLabel = tipoBtn?.dataset.cant ? `${tipoBtn.dataset.cant}x${tipoBtn.dataset.pagado}` : `${cant}x1`;
    const esGrupo  = _productosSeleccionados.length > 1;

    const body = {
      producto_id:  _productosSeleccionados[0].id,
      productos:    esGrupo ? _productosSeleccionados.map(p => p.id) : undefined,
      nombre:       $nombre.value.trim() || `Promo ${tipoLabel}${esGrupo ? " (grupo)" : ""}`,
      cantidad:     cant,
      precio_promo: precio,
      fecha_desde:  $desde.value || null,
      fecha_hasta:  $hasta.value || null,
    };

    const res = await fetch("/api/promociones", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json();
      Swal.fire({ icon: "error", title: "Error", text: err.error, confirmButtonColor: "#00d875" });
      return;
    }
    $dlg.close();
    Swal.fire({ icon: "success", title: "Promo creada", timer: 1500, showConfirmButton: false });
    cargar();
  });

  // ── Acciones de tabla ──
  window.togglePromo = async (id, activa) => {
    await fetch(`/api/promociones/${id}`, { method: "PATCH", headers, body: JSON.stringify({ activa: !activa }) });
    cargar();
  };

  window.eliminarPromo = async (id) => {
    const { isConfirmed } = await Swal.fire({
      title: "¿Eliminar promo?", icon: "warning",
      showCancelButton: true, confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar", confirmButtonColor: "#ef4444",
    });
    if (!isConfirmed) return;
    await fetch(`/api/promociones/${id}`, { method: "DELETE", headers });
    cargar();
  };

  cargar();
});
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
  const $prodSel    = document.getElementById("promo-producto-sel");
  const $tipos      = document.getElementById("promo-tipos");
  const $campoCant  = document.getElementById("campo-cantidad");
  const $cantidad   = document.getElementById("promo-cantidad");
  const $sugerido   = document.getElementById("promo-precio-sugerido");
  const $precio     = document.getElementById("promo-precio");
  const $desde      = document.getElementById("promo-desde");
  const $hasta      = document.getElementById("promo-hasta");
  const $nombre     = document.getElementById("promo-nombre");

  // Precio normal del producto seleccionado
  let _precioNormal = 0;
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
      const ahorro   = (p.precio_normal * p.cantidad) - p.precio_promo;
      const vencida  = p.fecha_hasta && p.fecha_hasta < argHoy;
      const estadoBadge = !p.activa
        ? `<span class="badge badge--red">Inactiva</span>`
        : vencida
          ? `<span class="badge badge--yellow">Vencida</span>`
          : `<span class="badge badge--green">Activa</span>`;
      return `
        <tr>
          <td><b>${p.producto_nombre}</b><br><small class="muted">${p.nombre}</small></td>
          <td class="center"><span class="promo-pack-badge">${p.cantidad}×1</span></td>
          <td class="right"><b>$${money(p.precio_promo)}</b></td>
          <td class="right muted">$${money(p.precio_normal * p.cantidad)}</td>
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
    $buscar.value = ""; $prodId.value = ""; $prodSel.style.display = "none";
    $prodSel.textContent = ""; $resultados.innerHTML = "";
    _precioNormal = 0; _cantActual = 2; _pagadoActual = 1;
    $precio.value = ""; $sugerido.value = ""; $nombre.value = "";
    $desde.value = ""; $hasta.value = "";
    $campoCant.style.display = "none";
    $tipos.querySelectorAll(".promo-tipo-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
    _cantActual = 2; _pagadoActual = 1;
  }

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
    $prodId.value        = item.dataset.id;
    _precioNormal        = Number(item.dataset.precio);
    $buscar.value        = "";
    $resultados.innerHTML = "";
    $prodSel.textContent = `✓ ${item.dataset.nombre} — $${money(_precioNormal)} c/u`;
    $prodSel.style.display = "";
    calcularSugerido();
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
    if (!_precioNormal) return;
    const sugerido = _pagadoActual * _precioNormal;
    $sugerido.value = `$${money(sugerido)}`;
    if (!$precio.value) $precio.value = sugerido.toFixed(2);
  }

  // Recalcular si cambia el precio normal (por cambio de producto)
  $precio?.addEventListener("focus", () => { if (!$precio.value) calcularSugerido(); });

  // ── Guardar ──
  document.getElementById("btn-guardar-promo")?.addEventListener("click", async () => {
    if (!$prodId.value) { Swal.fire({ icon: "warning", title: "Falta el producto", text: "Buscá y seleccioná un producto", confirmButtonColor: "#00d875" }); return; }
    const esPers = $campoCant.style.display !== "none";
    const cant   = esPers ? Number($cantidad.value) : _cantActual;
    const precio = Number($precio.value);
    if (!cant || cant < 2) { Swal.fire({ icon: "warning", title: "Cantidad inválida", text: "Mínimo 2 unidades", confirmButtonColor: "#00d875" }); return; }
    if (!precio || precio <= 0) { Swal.fire({ icon: "warning", title: "Precio inválido", text: "Ingresá el precio del pack", confirmButtonColor: "#00d875" }); return; }

    const tipoBtn = $tipos.querySelector(".promo-tipo-btn.active");
    const tipoLabel = tipoBtn?.dataset.cant ? `${tipoBtn.dataset.cant}x${tipoBtn.dataset.pagado}` : `${cant}x1`;

    const body = {
      producto_id: Number($prodId.value),
      nombre:      $nombre.value.trim() || `Promo ${tipoLabel}`,
      cantidad:    cant,
      precio_promo: precio,
      fecha_desde: $desde.value || null,
      fecha_hasta: $hasta.value || null,
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

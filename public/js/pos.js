// public/js/pos.js — POS completo v2
document.addEventListener("DOMContentLoaded", () => {
  /* ===================== Status bar ===================== */
  function ensureStatusBar() {
    let bar = document.getElementById("pos-status");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "pos-status";
      Object.assign(bar.style, {
        position: "fixed",
        left: "10px",
        bottom: "10px",
        zIndex: "9999",
        padding: "8px 12px",
        borderRadius: "10px",
        border: "1px solid #1b2741",
        background: "#111927",
        color: "#e7f0ff",
        font: "12px/1.3 Inter, system-ui, sans-serif",
        boxShadow: "0 6px 18px rgba(0,0,0,.35)",
        maxWidth: "70vw",
        display: "none",
      });
      document.body.appendChild(bar);
    }
    return bar;
  }
  const $status = ensureStatusBar();
  function showStatus(msg, kind = "info") {
    if (!$status) return;
    $status.textContent = msg;
    $status.style.display = "inline-block";
    $status.style.borderColor = kind === "error" ? "#ff5c5c" : "#1b2741";
    $status.style.color = kind === "error" ? "#ffb3b3" : "#e7f0ff";
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => {
      $status.style.display = "none";
    }, 4500);
  }

  /* ===================== Auth / API ===================== */
  let token = localStorage.getItem("token") || null;

  async function api(
    url,
    opts = {},
    { fallbackNoAuth = false, expectJSON = true } = {},
  ) {
    try {
      const headers = { ...(opts.headers || {}) };
      if (token) headers["Authorization"] = "Bearer " + token;
      let res = await fetch(url, { ...opts, headers });
      if (fallbackNoAuth && res.status === 401) {
        const { Authorization, ...rest } = headers;
        res = await fetch(url, { ...opts, headers: rest });
      }
      if (!res.ok) {
        if (res.status === 401 && !fallbackNoAuth) {
          localStorage.removeItem("token");
          localStorage.removeItem("user_email");
          showStatus("Sesión vencida. Redirigiendo...", "error");
          setTimeout(() => (location.href = "/admin/login.html"), 1000);
          return { ok: false, status: 401, data: null };
        }
        const txt = await res.text().catch(() => "");
        showStatus(`Error ${res.status} al consultar ${url}`, "error");
        if (!expectJSON) return res;
        try {
          return { ok: false, status: res.status, data: JSON.parse(txt) };
        } catch {
          return { ok: false, status: res.status, data: null };
        }
      }
      if (!expectJSON) return res;
      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch (e) {
      console.error("API exception", url, e);
      showStatus("No se pudo contactar con el servidor", "error");
      return { ok: false, status: 0, data: null };
    }
  }

  /* ===================== BARCODE LOOKUP ===================== */
  async function lookupBarcode(code) {
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const d = await r.json();
      if (d.status === 1 && d.product) {
        const p = d.product;
        return {
          nombre: p.product_name_es || p.product_name || p.abbreviated_product_name || "",
          categoria: (p.categories_tags?.[0] || "").replace(/^[a-z]{2}:/, ""),
          fuente: "Open Food Facts"
        };
      }
    } catch {}
    try {
      const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
      const d = await r.json();
      if (d.items?.length) {
        const item = d.items[0];
        return { nombre: item.title || "", categoria: item.category || "", fuente: "UPC Item DB" };
      }
    } catch {}
    return null;
  }

  /* ===================== DOM refs ===================== */
  const $buscar = document.getElementById("buscar");
  const $btnBuscar = document.getElementById("btn-buscar");
  const $res = document.getElementById("resultados");
  const $buscarCliente = document.getElementById("buscar-cliente");
  const $btnBuscarCli = document.getElementById("btn-buscar-cliente");
  const $btnNuevoCli = document.getElementById("btn-nuevo-cliente");
  const $clientesRes = document.getElementById("clientes-result");
  const $clienteSel = document.getElementById("cliente-seleccionado");
  const $carritoTbody = document.getElementById("carrito-tbody");
  const $tSubtotal = document.getElementById("t-subtotal");
  const $tTotalGrande = document.getElementById("t-total-grande");
  const $tItems = document.getElementById("t-items");
  const $btnVaciar = document.getElementById("btn-vaciar-carrito");
  const $btnFinalizar = document.getElementById("btn-finalizar");
  const $totalBox = document.querySelector(".total-box");
  const $dlgCliente = document.getElementById("dlg-cliente");
  const $clNombre = document.getElementById("cl-nombre");
  const $clEmail = document.getElementById("cl-email");
  const $clTel = document.getElementById("cl-telefono");
  const $clDni = document.getElementById("cl-dni");
  const $clDir = document.getElementById("cl-direccion");
  const $btnGuardarCli = document.getElementById("btn-guardar-cliente");
  const $btnCerrarCli = document.getElementById("btn-cerrar-cliente");

  // Modal de pago
  const $dlgPago = document.getElementById("dlg-pago");
  const $medioPago = document.getElementById("medio-pago");
  const $lblInteres = document.getElementById("lbl-interes");
  const $interesPct = document.getElementById("interes-pct");
  const $descTipo = document.getElementById("desc-tipo");
  const $descValor = document.getElementById("desc-valor");
  const $lblMonto = document.getElementById("lbl-monto");
  const $montoPago = document.getElementById("monto-pago");
  const $tDesc = document.getElementById("t-desc");
  const $tCambio = document.getElementById("t-cambio");
  const $cashbar = document.getElementById("pago-cashbar");
  const $btnConfirmarPago = document.getElementById("btn-confirmar-pago");

  /* ===================== Estado ===================== */
  const state = {
    cliente: null,
    carrito: [],
    descuentoTipo: "monto",
    descuentoValor: 0,
    medioPago: "efectivo",
    montoPago: 0,
    interesPct: 0,
  };

  /* ===================== Utils ===================== */
  function money(n) {
    return (Number(n) || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
    });
  }

  function updateTotalColor() {
    if (!$totalBox) return;
    $totalBox.classList.remove(
      "efectivo",
      "tarjeta",
      "transferencia",
      "cuenta_corriente",
    );
    const mp = (state.medioPago || "efectivo").toLowerCase();
    $totalBox.classList.add(mp);
  }

  /* ===================== CONTADOR DEL DÍA ===================== */
  async function cargarContadorDia() {
    const el = document.getElementById("ventas-hoy-top");
    if (!el) return;

    const hoy = new Date().toISOString().slice(0, 10); // "2025-06-15"
    const r = await api(
      `/api/ventas?date_from=${hoy}&date_to=${hoy}&limit=200`,
      {},
      { expectJSON: true },
    );

    if (r.ok) {
      const ventas = Array.isArray(r.data) ? r.data : [];
      el.textContent = ventas.length;
      state.ventasHoy = ventas;
      renderHistorial();
    }
  }

  function incrementarContador() {
    const el = document.getElementById("ventas-hoy-top");
    if (!el) return;
    el.textContent = (parseInt(el.textContent) || 0) + 1;
  }

  /* ===================== HISTORIAL DEL DÍA ===================== */
  function renderHistorial() {
    const lista = document.getElementById("historial-lista");
    if (!lista) return;
    const ventas = state.ventasHoy || [];
    if (!ventas.length) {
      lista.innerHTML =
        '<div class="historial-empty">Sin ventas hoy todavía</div>';
      return;
    }
    // Mostrar las últimas 10, más recientes primero
    const recientes = [...ventas].reverse().slice(0, 10);
    lista.innerHTML = recientes
      .map((v) => {
        const hora = v.fecha
          ? new Date(v.fecha).toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--:--";
        const total = money(v.total || v.monto_total || 0);
        const medio = v.medio_pago || v.pago?.medio || "–";
        const iconos = {
          efectivo: "💵",
          tarjeta: "💳",
          transferencia: "📲",
          cuenta_corriente: "📒",
        };
        return `
        <div class="historial-item">
          <div class="historial-hora">${hora}</div>
          <div class="historial-info">
            <span class="historial-id">#${v.id}</span>
            <span class="historial-cliente">${v.cliente_nombre || "Consumidor Final"}</span>
          </div>
          <div class="historial-total">
            <span>${iconos[medio] || "💰"}</span>
            <strong>$${total}</strong>
          </div>
        </div>`;
      })
      .join("");
  }

  function toggleHistorial() {
    const panel = document.getElementById("historial-panel");
    if (!panel) return;
    const abierto = panel.classList.toggle("open");
    const btn = document.getElementById("btn-historial");
    if (btn) btn.textContent = abierto ? "▲ Historial" : "▼ Historial";
    if (abierto) cargarContadorDia();
  }

  /* ===================== PREVIEW TICKET ===================== */
  function renderPreview() {
    const panel = document.getElementById("ticket-preview");
    if (!panel) return;

    const sub = calcSubTotal();
    const desc = Math.min(calcDesc(sub), sub);
    const base = Math.max(0, sub - desc);
    const interesPct =
      state.medioPago === "tarjeta"
        ? Math.max(0, Number(state.interesPct || 0))
        : 0;
    const recargo =
      state.medioPago === "tarjeta" ? (base * interesPct) / 100 : 0;
    const total = Math.max(0, base + recargo);
    const pagado =
      state.medioPago === "efectivo"
        ? Math.max(0, Number(state.montoPago || 0))
        : total;
    const cambio =
      state.medioPago === "efectivo" ? Math.max(0, pagado - total) : 0;

    const cfg = JSON.parse(localStorage.getItem("cfg") || "{}");
    const nombreNegocio = cfg.empresaNombre || "Mi Negocio";
    const ahora = new Date().toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const medioLabels = {
      efectivo: "💵 Efectivo",
      tarjeta: "💳 Tarjeta",
      transferencia: "📲 Transferencia",
      cuenta_corriente: "📒 Cuenta Corriente",
    };

    panel.innerHTML = `
      <div class="ticket-preview-inner">
        <div class="ticket-header">
          <div class="ticket-negocio">${nombreNegocio}</div>
${cfg.empresaDir ? `<div class="ticket-dato">${cfg.empresaDir}</div>` : ""}
${cfg.empresaCuit ? `<div class="ticket-dato">CUIT: ${cfg.empresaCuit}</div>` : ""}
          <div class="ticket-fecha">${ahora}</div>
          ${state.cliente ? `<div class="ticket-cliente">👤 ${state.cliente.nombre}</div>` : ""}
        </div>
        <div class="ticket-items">
          ${
            state.carrito.length
              ? state.carrito
                  .map(
                    (it) => `
              <div class="ticket-item">
                <span class="ticket-item-nombre">${it.nombre}</span>
                <span class="ticket-item-cant">x${it.cantidad}</span>
                <span class="ticket-item-precio">$${money(it.precio * it.cantidad)}</span>
              </div>`,
                  )
                  .join("")
              : '<div class="ticket-empty">Sin productos</div>'
          }
        </div>
        <div class="ticket-totales">
          ${
            desc > 0
              ? `
            <div class="ticket-linea">
              <span>Subtotal</span><span>$${money(sub)}</span>
            </div>
            <div class="ticket-linea ticket-desc">
              <span>Descuento</span><span>-$${money(desc)}</span>
            </div>`
              : ""
          }
          ${
            recargo > 0
              ? `
            <div class="ticket-linea">
              <span>Recargo ${interesPct}%</span><span>+$${money(recargo)}</span>
            </div>`
              : ""
          }
          <div class="ticket-linea ticket-total-line">
            <span>TOTAL</span><span>$${money(total)}</span>
          </div>
          <div class="ticket-linea ticket-medio">
            <span>${medioLabels[state.medioPago] || state.medioPago}</span>
          </div>
          ${
            state.medioPago === "efectivo" && pagado > 0
              ? `
            <div class="ticket-linea">
              <span>Entregado</span><span>$${money(pagado)}</span>
            </div>
            <div class="ticket-linea ticket-cambio">
              <span>Cambio</span><span>$${money(cambio)}</span>
            </div>`
              : ""
          }
        </div>
        <div class="ticket-footer">¡Gracias por su compra!</div>
      </div>`;
  }

  /* ===================== CLIENTES ===================== */
  async function buscarClientes() {
    if (!$clientesRes) return;
    const q = ($buscarCliente?.value || "").trim();
    const url = q
      ? `/api/clientes?search=${encodeURIComponent(q)}`
      : `/api/clientes`;
    const r = await api(url, {}, { fallbackNoAuth: true });
    if (!r.ok) {
      $clientesRes.innerHTML = '<div class="card">Error al buscar</div>';
      return;
    }
    const data = r.data || [];
    $clientesRes.innerHTML = data.length
      ? data
          .map(
            (c) => `
          <div class="card">
            <div class="name">${c.nombre}</div>
            <div class="sku">DNI: ${c.dni || "-"} — ${c.email || ""}</div>
            <div class="row">
              <button class="btn" data-sel-cliente="${c.id}" data-nombre="${c.nombre}">
                Seleccionar
              </button>
            </div>
          </div>`,
          )
          .join("")
      : '<div class="card">Sin resultados</div>';
  }

  $btnBuscarCli?.addEventListener("click", buscarClientes);
  $buscarCliente?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscarClientes();
  });

  $clientesRes?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sel-cliente]");
    if (!btn) return;
    state.cliente = {
      id: Number(btn.dataset.selCliente),
      nombre: btn.dataset.nombre,
    };
    renderCliente();
    renderPreview();
  });

  function renderCliente() {
    if (!$clienteSel) return;
    const top = document.getElementById("cliente-top");
    if (!state.cliente) {
      $clienteSel.innerHTML = `<div class="cliente-empty" style="text-align:center;padding:12px;opacity:.5;font-size:13px">Sin cliente seleccionado<br><small>Se registrará como Consumidor Final</small></div>`;
      if (top) top.textContent = "Consumidor Final";
      return;
    }
    $clienteSel.innerHTML = `
      <div class="cliente-card-pos" style="display:flex;align-items:center;gap:10px;padding:8px 12px;
        background:rgba(0,216,117,.08);border:1px solid rgba(0,216,117,.25);border-radius:10px">
        <div class="cliente-avatar-pos" style="width:36px;height:36px;border-radius:50%;background:var(--accent);
          color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0">
          ${state.cliente.nombre.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <strong style="font-size:14px">${state.cliente.nombre}</strong>
          <div style="font-size:11px;opacity:.7">Cliente #${state.cliente.id}</div>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-quitar-cliente"
          style="font-size:11px;padding:4px 10px;color:var(--danger);border-color:var(--danger)"
          title="Quitar cliente">✕</button>
      </div>`;
    if (top) top.textContent = state.cliente.nombre;

    document.getElementById("btn-quitar-cliente")?.addEventListener("click", () => {
      state.cliente = null;
      renderCliente();
      renderPreview();
    });
  }

  $btnNuevoCli?.addEventListener("click", () => {
    if (!$dlgCliente?.showModal) {
      alert("Tu navegador no soporta <dialog>");
      return;
    }
    [$clNombre, $clEmail, $clTel, $clDni, $clDir].forEach((el) => {
      if (el) el.value = "";
    });
    $dlgCliente.showModal();
  });
  $btnCerrarCli?.addEventListener("click", () => $dlgCliente?.close());
  $btnGuardarCli?.addEventListener("click", async () => {
    if (!token) {
      showStatus("Iniciá sesión para crear clientes.", "error");
      return;
    }
    if (!$clNombre?.value.trim()) {
      alert("Nombre es requerido");
      return;
    }
    const body = {
      nombre: $clNombre.value.trim(),
      email: $clEmail?.value.trim() || null,
      telefono: $clTel?.value.trim() || null,
      dni: $clDni?.value.trim() || null,
      direccion: $clDir?.value.trim() || null,
    };
    const r = await api("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      alert(r.data?.error || "No se pudo crear el cliente");
      return;
    }
    state.cliente = { id: r.data.id, nombre: r.data.nombre };
    renderCliente();
    renderPreview();
    $dlgCliente?.close();
  });

  /* ===================== PRODUCTOS ===================== */
  async function buscarProductos() {
    if (!$res) return;
    const q = ($buscar?.value || "").trim();
    if (!q) {
      $res.innerHTML = "";
      return;
    }
    const r = await api(
      `/api/productos?search=${encodeURIComponent(q)}`,
      {},
      { fallbackNoAuth: true },
    );
    if (!r.ok) {
      $res.innerHTML = `<div class="card">Error al buscar</div>`;
      return;
    }
    const data = r.data || [];
    const esBarcode = /^\d{6,}$/.test(q);
    const exacto = data.find((p) => String(p.sku).trim() === q.trim());
    if (exacto) {
      agregarProducto(exacto.id, exacto.nombre, exacto.precio);
      $buscar.value = "";
      $res.innerHTML = "";
      return;
    }
    // Barcode con un único resultado → auto-agregar sin necesidad de SKU exacto
    if (esBarcode && data.length === 1) {
      const p = data[0];
      if (p.stock > 0) {
        agregarProducto(p.id, p.nombre, p.precio);
        $buscar.value = "";
        $res.innerHTML = "";
        return;
      }
    }
    if (!data.length) {
      if (esBarcode) {
        $res.innerHTML = "";
        $buscar.value = "";
        abrirModalRapido(q);
      } else {
        $res.innerHTML = '<div class="card">Sin resultados</div>';
      }
      return;
    }
    $res.innerHTML = data
      .map(
        (p) => `
      <div class="card">
        <div class="name">${p.nombre}</div>
        <div class="sku">SKU: ${p.sku || ""} ${p.stock != null ? `<span style="margin-left:8px;font-size:11px;${p.stock <= 5 ? 'color:var(--danger);font-weight:700' : 'opacity:.6'}">Stock: ${p.stock}</span>` : ""}</div>
        <div class="row">
          <div class="price">$ ${money(p.precio)}</div>
          <button class="btn" data-add="${p.id}" data-nombre="${p.nombre}" data-precio="${p.precio}" ${p.stock <= 0 ? 'disabled style="opacity:.4"' : ""}>
            ${p.stock <= 0 ? "Sin stock" : "Agregar"}
          </button>
        </div>
      </div>`,
      )
      .join("");
  }

  $btnBuscar?.addEventListener("click", buscarProductos);

  // Live search al tipear
  let _buscarTimer;
  $buscar?.addEventListener("input", () => {
    clearTimeout(_buscarTimer);
    const q = ($buscar.value || "").trim();
    if (!q) { if ($res) $res.innerHTML = ""; return; }
    _buscarTimer = setTimeout(buscarProductos, 220);
  });

  $buscar?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearTimeout(_buscarTimer);
    const q = ($buscar.value || "").trim();
    if (!q) return;
    const esBarcode = /^\d{6,}$/.test(q);
    // Para barcodes: siempre buscar fresh (ignora resultados anteriores)
    if (!esBarcode) {
      const firstBtn = $res?.querySelector("button[data-add]:not([disabled])");
      if (firstBtn) {
        firstBtn.click();
        $buscar.value = "";
        if ($res) $res.innerHTML = "";
        return;
      }
    }
    buscarProductos();
  });

  $res?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-add]");
    if (!btn) return;
    agregarProducto(
      Number(btn.dataset.add),
      btn.dataset.nombre,
      Number(btn.dataset.precio),
    );
  });

  /* ── Widget último producto agregado ── */
  function actualizarUltimoProd() {
    const wrap = document.getElementById("ultimo-prod-wrap");
    if (!wrap) return;
    if (!state.carrito.length) { wrap.style.display = "none"; return; }
    const p = state.carrito[state.carrito.length - 1];
    wrap.style.display = "";
    document.getElementById("ultimo-prod-nombre").textContent = p.nombre;
    document.getElementById("ultimo-prod-cant").textContent   = `×${p.cantidad}`;
    document.getElementById("ultimo-prod-precio").textContent = `$${money(p.precio)}`;
    document.getElementById("ultimo-prod-sub").textContent    = `$${money(p.precio * p.cantidad)}`;
    // Imagen si tiene
    const imgEl = document.getElementById("ultimo-prod-img");
    if (p.imagen) {
      imgEl.innerHTML = `<img src="${p.imagen}" style="width:40px;height:40px;object-fit:cover;border-radius:8px">`;
    } else {
      imgEl.textContent = "📦";
    }
    // Animación flash
    wrap.classList.remove("ultimo-flash");
    void wrap.offsetWidth;
    wrap.classList.add("ultimo-flash");
  }

  async function agregarProducto(id, nombre, precio) {
    const idx = state.carrito.findIndex((i) => i.id === id);
    if (idx >= 0) {
      state.carrito[idx].cantidad += 1;
    } else {
      state.carrito.push({
        id,
        nombre,
        precio,
        precioOriginal: precio,
        cantidad: 1,
      });
    }
    renderCarrito();
    refreshTotals();
    renderPreview();
    actualizarUltimoProd();

    // Verificar stock disponible
    if (id > 0) {
      const r = await api(`/api/productos/${id}`, {}, { expectJSON: true });
      if (r.ok && r.data) {
        const cantEnCarrito = state.carrito.find(i => i.id === id)?.cantidad || 0;
        const stockDisp = r.data.stock - cantEnCarrito;
        if (r.data.stock <= 5) {
          showStatus(`⚠️ Stock bajo: "${nombre}" tiene ${r.data.stock} uds en total (${stockDisp} después de esta venta)`, "error");
        }
        if (stockDisp < 0) {
          showStatus(`🚫 Sin stock suficiente: "${nombre}" solo tiene ${r.data.stock} uds disponibles`, "error");
        }
      }
    }
  }

  /* ===================== CARRITO ===================== */
  function renderCarrito() {
    if (!$carritoTbody) return;
    if (!state.carrito.length) {
      $carritoTbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">
            <div class="empty-state">
              <span class="empty-icon">🛍️</span>
              <span>Buscá un producto para empezar</span>
            </div>
          </td>
        </tr>`;
      const el = document.getElementById("items-top");
      if (el) el.textContent = "0";
      return;
    }

    $carritoTbody.innerHTML = state.carrito
      .map(
        (it, ix) => `
      <tr>
        <td class="td-nombre">${it.nombre}</td>
        <td class="td-precio">
          <span
            class="precio-editable"
            data-ix="${ix}"
            title="Click para editar precio"
          >$ ${money(it.precio)}</span>
          ${
            it.precio !== it.precioOriginal
              ? `<span class="precio-original">$${money(it.precioOriginal)}</span>`
              : ""
          }
        </td>
        <td class="td-cant">
          <button class="btn" data-dec="${ix}">−</button>
          <span
            class="cant-editable"
            data-ix="${ix}"
            title="Click para editar cantidad"
          >${it.cantidad}</span>
          <button class="btn" data-inc="${ix}">+</button>
        </td>
        <td class="right td-subtotal">$ ${money(it.precio * it.cantidad)}</td>
        <td><button class="btn secondary" data-del="${ix}">✕</button></td>
      </tr>`,
      )
      .join("");

    const el = document.getElementById("items-top");
    if (el) el.textContent = state.carrito.reduce((s, p) => s + p.cantidad, 0);
  }

  // Eventos del carrito: +/-, eliminar, edición inline de cantidad y precio
  $carritoTbody?.addEventListener("click", (e) => {
    const dec = e.target.closest("button[data-dec]");
    const inc = e.target.closest("button[data-inc]");
    const del = e.target.closest("button[data-del]");

    if (dec) {
      const i = Number(dec.dataset.dec);
      state.carrito[i].cantidad = Math.max(1, state.carrito[i].cantidad - 1);
      renderCarrito();
      refreshTotals();
      renderPreview();
    }
    if (inc) {
      const i = Number(inc.dataset.inc);
      state.carrito[i].cantidad += 1;
      renderCarrito();
      refreshTotals();
      renderPreview();
    }
    if (del) {
      const i = Number(del.dataset.del);
      state.carrito.splice(i, 1);
      renderCarrito();
      refreshTotals();
      renderPreview();
    }

    // Editar cantidad inline
    const cant = e.target.closest(".cant-editable");
    if (cant) {
      const ix = Number(cant.dataset.ix);
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.value = state.carrito[ix].cantidad;
      input.className = "cant-input-inline";
      cant.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const v = Math.max(1, parseInt(input.value) || 1);
        state.carrito[ix].cantidad = v;
        renderCarrito();
        refreshTotals();
        renderPreview();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          renderCarrito();
        }
      });
    }

    // Editar precio inline
    const precio = e.target.closest(".precio-editable");
    if (precio) {
      const ix = Number(precio.dataset.ix);
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.01";
      input.value = state.carrito[ix].precio;
      input.className = "precio-input-inline";
      precio.closest("td").innerHTML = "";
      precio.closest("td")?.appendChild(input) || precio.replaceWith(input);
      // Reemplazar solo el span
      const td = $carritoTbody.querySelector(
        `tr:nth-child(${ix + 1}) td:nth-child(2)`,
      );
      if (td) {
        td.innerHTML = "";
        td.appendChild(input);
      }
      input.focus();
      input.select();
      const commit = () => {
        const v = Math.max(0, parseFloat(input.value) || 0);
        state.carrito[ix].precio = v;
        renderCarrito();
        refreshTotals();
        renderPreview();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          renderCarrito();
        }
      });
    }
  });

  /* ===================== TOTALES ===================== */
  function calcSubTotal() {
    return state.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  }
  function calcDesc(sub) {
    const v = Math.max(0, Number(state.descuentoValor || 0));
    return state.descuentoTipo === "porcentaje" ? (sub * v) / 100 : v;
  }
  function refreshTotals() {
    const sub = calcSubTotal();
    const items = state.carrito.reduce((s, i) => s + i.cantidad, 0);

    if ($tSubtotal) $tSubtotal.textContent = money(sub);
    if ($tTotalGrande) $tTotalGrande.textContent = money(sub);
    if ($tItems) $tItems.textContent = items;

    if ($dlgPago?.open) refreshModalTotals();
  }

  function refreshModalTotals() {
    const sub = calcSubTotal();
    const desc = Math.min(calcDesc(sub), sub);
    const base = Math.max(0, sub - desc);
    const interesPct =
      state.medioPago === "tarjeta"
        ? Math.max(0, Number(state.interesPct || 0))
        : 0;
    const recargo =
      state.medioPago === "tarjeta" ? (base * interesPct) / 100 : 0;
    const total = Math.max(0, base + recargo);
    const pagado =
      state.medioPago === "efectivo"
        ? Math.max(0, Number(state.montoPago || 0))
        : total;
    const cambio =
      state.medioPago === "efectivo" ? Math.max(0, pagado - total) : 0;

    const $descSub = document.getElementById("t-desc-sub");
    const $modalTotal = document.getElementById("t-modal-total");
    const $lineaDesc = document.getElementById("pago-linea-desc");
    const $lineaRecargo = document.getElementById("pago-linea-recargo");
    const $lineaCambio = document.getElementById("pago-linea-cambio");
    const $tRecargo = document.getElementById("t-recargo");

    if ($descSub) $descSub.textContent = money(sub);
    if ($tDesc) $tDesc.textContent = `-$${money(desc)}`;
    if ($lineaDesc) $lineaDesc.style.display = desc > 0 ? "" : "none";
    if ($tRecargo) $tRecargo.textContent = `+$${money(recargo)}`;
    if ($lineaRecargo) $lineaRecargo.style.display = recargo > 0 ? "" : "none";
    if ($modalTotal) $modalTotal.textContent = money(total);
    if ($tCambio) $tCambio.textContent = money(cambio);
    if ($lineaCambio) $lineaCambio.style.display = state.medioPago === "efectivo" ? "" : "none";

    if ($tTotalGrande) $tTotalGrande.textContent = money(total);

    const labels = {
      efectivo: "💵 Efectivo",
      tarjeta: "💳 Tarjeta",
      transferencia: "📲 Transferencia",
      cuenta_corriente: "📒 Cta. Cte.",
    };
    const top = document.getElementById("metodo-top");
    if (top) top.textContent = labels[state.medioPago] || state.medioPago;
    updateTotalColor();
  }

  $descTipo?.addEventListener("change", () => {
    state.descuentoTipo = $descTipo.value;
    refreshModalTotals();
    renderPreview();
  });
  $descValor?.addEventListener("input", () => {
    state.descuentoValor = Number($descValor.value || 0);
    refreshModalTotals();
    renderPreview();
  });
  $medioPago?.addEventListener("change", () => {
    state.medioPago = $medioPago.value;
    const isCard = state.medioPago === "tarjeta";
    if ($lblInteres) $lblInteres.style.display = isCard ? "" : "none";
    if (!isCard) {
      state.interesPct = 0;
      if ($interesPct) $interesPct.value = "";
    }
    const isCash = state.medioPago === "efectivo";
    if ($lblMonto) $lblMonto.style.display = isCash ? "" : "none";
    if ($cashbar) $cashbar.style.display = isCash ? "" : "none";
    if (!isCash) {
      state.montoPago = 0;
      if ($montoPago) $montoPago.value = "";
    }
    refreshModalTotals();
    renderPreview();
  });

  $interesPct?.addEventListener("input", () => {
    state.interesPct = Number($interesPct.value || 0);
    refreshModalTotals();
    renderPreview();
  });
  $montoPago?.addEventListener("input", () => {
    state.montoPago = Number($montoPago.value || 0);
    refreshModalTotals();
    renderPreview();
  });

  /* ===================== CASHBAR ===================== */
  $cashbar?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const calcTotal = () => {
      const sub = calcSubTotal();
      const desc = Math.min(calcDesc(sub), sub);
      const base = Math.max(0, sub - desc);
      const ip =
        state.medioPago === "tarjeta"
          ? Math.max(0, Number(state.interesPct || 0))
          : 0;
      return Math.max(
        0,
        base + (state.medioPago === "tarjeta" ? (base * ip) / 100 : 0),
      );
    };
    if (btn.classList.contains("qcash-exacto")) {
      const total = calcTotal();
      if ($montoPago) $montoPago.value = total.toFixed(2);
      state.montoPago = total;
      refreshTotals();
      renderPreview();
      $montoPago?.focus();
      $montoPago?.select();
      return;
    }
    const val = Number(btn.dataset.cash || 0);
    if (val > 0) {
      if ($montoPago) $montoPago.value = val.toFixed(2);
      state.montoPago = val;
      refreshTotals();
      renderPreview();
      $montoPago?.focus();
      $montoPago?.select();
    }
  });

  /* ===================== VACIAR ===================== */
  $btnVaciar?.addEventListener("click", () => {
    Swal.fire({
      title: "¿Vaciar el carrito?",
      text: `Se eliminarán ${state.carrito.length} producto${state.carrito.length !== 1 ? "s" : ""} del carrito`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, vaciar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
    }).then((r) => {
      if (!r.isConfirmed) return;
      state.carrito = [];
      renderCarrito();
      refreshTotals();
      renderPreview();
      actualizarUltimoProd();
    });
  });

  /* ===================== ABRIR MODAL DE PAGO ===================== */
  async function abrirModalPago() {
    if (!state.carrito.length) {
      Swal.fire({
        icon: "warning",
        title: "Carrito vacío",
        text: "Agregá al menos un producto",
        confirmButtonColor: "#00d875",
      });
      return;
    }

    // Bloquear venta si la caja no está abierta
    const cajaRes = await api("/api/caja/estado", {}, { fallbackNoAuth: false });
    if (!cajaRes.ok || !cajaRes.data?.abierta) {
      Swal.fire({
        icon: "warning",
        title: "Caja cerrada",
        text: "Abrí la caja antes de realizar ventas",
        confirmButtonColor: "#00d875",
      });
      return;
    }

    state.medioPago = "efectivo";
    state.descuentoTipo = "monto";
    state.descuentoValor = 0;
    state.montoPago = 0;
    state.interesPct = 0;
    if ($medioPago) $medioPago.value = "efectivo";
    if ($descTipo) $descTipo.value = "monto";
    if ($descValor) $descValor.value = "";
    if ($montoPago) $montoPago.value = "";
    if ($interesPct) $interesPct.value = "";
    if ($lblInteres) $lblInteres.style.display = "none";
    if ($lblMonto) $lblMonto.style.display = "";
    if ($cashbar) $cashbar.style.display = "";

    // Reset método de pago visual
    document.querySelectorAll(".pago-metodo-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.metodo === "efectivo");
    });

    // Cliente section
    const $cliSection = document.getElementById("pago-cliente-section");
    if ($cliSection) $cliSection.style.display = "none";
    const $cliResult = document.getElementById("pago-clientes-result");
    if ($cliResult) $cliResult.innerHTML = "";
    const $cliBuscar = document.getElementById("pago-buscar-cliente");
    if ($cliBuscar) $cliBuscar.value = "";
    renderPagoCliente();

    $dlgPago?.showModal();
    refreshModalTotals();
    setTimeout(() => document.getElementById("monto-pago")?.focus(), 50);
  }

  $btnFinalizar?.addEventListener("click", abrirModalPago);
  document.getElementById("btn-cerrar-pago")?.addEventListener("click", () => $dlgPago?.close());

  /* ===================== MODAL ALTA RÁPIDA ===================== */
  const $dlgRapido = document.getElementById("dlg-rapido");
  let _rapidoSku = "";

  async function abrirModalRapido(sku) {
    _rapidoSku = sku;
    const $skuVal = document.getElementById("rapido-sku-val");
    const $nombre = document.getElementById("rapido-nombre");
    const $precio = document.getElementById("rapido-precio");
    const $costo = document.getElementById("rapido-costo");
    const $stock = document.getElementById("rapido-stock");
    const $badge = document.getElementById("rapido-lookup-badge");

    if ($skuVal) $skuVal.textContent = sku;
    if ($nombre) { $nombre.value = ""; $nombre.placeholder = "Buscando en base de datos…"; }
    if ($precio) $precio.value = "";
    if ($costo) $costo.value = "";
    if ($stock) $stock.value = "";
    if ($badge) $badge.style.display = "none";

    $dlgRapido?.showModal();
    setTimeout(() => $nombre?.focus(), 50);

    const info = await lookupBarcode(sku);
    if (_rapidoSku !== sku) return; // modal fue cerrado/reemplazado mientras buscaba
    if (info?.nombre && $nombre) {
      $nombre.value = info.nombre;
      $nombre.placeholder = "Nombre del producto";
      if ($badge) {
        $badge.textContent = `✅ ${info.fuente}`;
        $badge.style.display = "";
      }
      if (document.activeElement === $nombre || !$nombre.value) $precio?.focus();
    } else if ($nombre) {
      $nombre.placeholder = "No encontrado — escribí el nombre";
    }
  }

  document.getElementById("btn-cerrar-rapido")?.addEventListener("click", () => $dlgRapido?.close());

  document.getElementById("btn-confirmar-rapido")?.addEventListener("click", async () => {
    const nombre = (document.getElementById("rapido-nombre")?.value || "").trim();
    const precio = Number(document.getElementById("rapido-precio")?.value || 0);
    const costo = Number(document.getElementById("rapido-costo")?.value || 0);
    const stock = Number(document.getElementById("rapido-stock")?.value || 0);

    if (!nombre) { showStatus("Ingresá el nombre del producto", "error"); return; }
    if (!precio) { showStatus("El precio es obligatorio", "error"); return; }

    const r = await api("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, precio, costo, stock, sku: _rapidoSku })
    });
    if (!r.ok) { showStatus("Error al guardar el producto", "error"); return; }

    $dlgRapido?.close();
    agregarProducto(r.data.id, nombre, precio);
    showStatus(`✅ "${nombre}" creado y agregado al carrito`, "success");
  });

  $dlgRapido?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target?.tagName !== "BUTTON") {
      e.preventDefault();
      document.getElementById("btn-confirmar-rapido")?.click();
    }
    if (e.key === "Escape") $dlgRapido?.close();
  });

  /* ===================== BOTONES MÉTODO DE PAGO ===================== */
  document.querySelectorAll(".pago-metodo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pago-metodo-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const metodo = btn.dataset.metodo;
      state.medioPago = metodo;
      if ($medioPago) $medioPago.value = metodo;

      const isCard = metodo === "tarjeta";
      if ($lblInteres) $lblInteres.style.display = isCard ? "" : "none";
      if (!isCard) { state.interesPct = 0; if ($interesPct) $interesPct.value = ""; }

      const isCash = metodo === "efectivo";
      if ($lblMonto) $lblMonto.style.display = isCash ? "" : "none";
      if ($cashbar) $cashbar.style.display = isCash ? "" : "none";
      if (!isCash) { state.montoPago = 0; if ($montoPago) $montoPago.value = ""; }

      const isCta = metodo === "cuenta_corriente";
      const $cliSection = document.getElementById("pago-cliente-section");
      if ($cliSection) $cliSection.style.display = isCta ? "" : "none";

      refreshModalTotals();
      renderPreview();
      setTimeout(() => {
        if (isCash) document.getElementById("monto-pago")?.focus();
        else if (!isCta) $btnConfirmarPago?.focus();
      }, 50);
    });
  });

  /* ===================== CLIENTE EN MODAL DE PAGO ===================== */
  function renderPagoCliente() {
    const $info = document.getElementById("pago-cliente-info");
    if (!$info) return;
    if (state.cliente) {
      $info.innerHTML = `
        <div class="pago-cliente-ok">
          <div class="avatar">${state.cliente.nombre.charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <strong>${state.cliente.nombre}</strong>
            <div style="font-size:11px;opacity:.7">Cliente #${state.cliente.id}</div>
          </div>
          <button class="btn btn-outline btn-sm" id="pago-quitar-cli"
            style="font-size:11px;padding:4px 10px;color:var(--danger);border-color:var(--danger)">✕</button>
        </div>`;
      document.getElementById("pago-quitar-cli")?.addEventListener("click", () => {
        state.cliente = null;
        renderPagoCliente();
        renderCliente();
      });
    } else {
      $info.innerHTML = '<span class="pago-sin-cliente">Sin cliente seleccionado</span>';
    }
  }

  document.getElementById("pago-btn-buscar-cli")?.addEventListener("click", buscarClienteEnModal);
  document.getElementById("pago-buscar-cliente")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); buscarClienteEnModal(); }
  });

  // Live search cliente en modal
  let _cliModalTimer;
  document.getElementById("pago-buscar-cliente")?.addEventListener("input", () => {
    clearTimeout(_cliModalTimer);
    const q = (document.getElementById("pago-buscar-cliente")?.value || "").trim();
    const $r = document.getElementById("pago-clientes-result");
    if (!q) { if ($r) $r.innerHTML = ""; return; }
    _cliModalTimer = setTimeout(buscarClienteEnModal, 220);
  });

  // Botón para enfocar campo efectivo
  document.getElementById("btn-foco-efectivo")?.addEventListener("click", () => {
    $montoPago?.focus();
    $montoPago?.select();
  });

  async function buscarClienteEnModal() {
    const $input = document.getElementById("pago-buscar-cliente");
    const $result = document.getElementById("pago-clientes-result");
    if (!$result) return;
    const q = ($input?.value || "").trim();
    const url = q ? `/api/clientes?search=${encodeURIComponent(q)}` : `/api/clientes`;
    const r = await api(url, {}, { fallbackNoAuth: true });
    if (!r.ok) { $result.innerHTML = '<div style="font-size:12px;color:var(--danger)">Error buscando</div>'; return; }
    const data = r.data || [];
    $result.innerHTML = data.length
      ? data.slice(0, 5).map(c => `
          <div class="pago-cli-item cli-result-item" data-cli-id="${c.id}" data-cli-nombre="${c.nombre}">
            <span><strong>${c.nombre}</strong> <span style="opacity:.6;font-size:11px">${c.dni || ""}</span></span>
            <span style="color:var(--accent);font-size:12px;font-weight:600">Seleccionar</span>
          </div>`).join("")
      : '<div style="font-size:12px;color:var(--muted);padding:6px">Sin resultados</div>';

    $result.querySelectorAll(".pago-cli-item").forEach(item => {
      item.addEventListener("click", () => {
        state.cliente = { id: Number(item.dataset.cliId), nombre: item.dataset.cliNombre };
        renderPagoCliente();
        renderCliente();
        $result.innerHTML = "";
        if ($input) $input.value = "";
      });
    });
  }

  /* ===================== CONFIRMAR VENTA (desde modal) ===================== */
  $btnConfirmarPago?.addEventListener("click", async () => {
    if (state.medioPago === "cuenta_corriente" && !state.cliente) {
      $dlgPago?.close();
      await Swal.fire({ icon: "warning", title: "Seleccione un cliente", text: "La cuenta corriente requiere un cliente" });
      $dlgPago?.showModal();
      refreshModalTotals();
      return;
    }
    if (state.medioPago === "efectivo") {
      const montoEntregado = Number(state.montoPago || 0);
      const sub = calcSubTotal();
      const desc = Math.min(calcDesc(sub), sub);
      const base = Math.max(0, sub - desc);
      const ip = state.medioPago === "tarjeta" ? Math.max(0, Number(state.interesPct || 0)) : 0;
      const totalVenta = Math.max(0, base + (state.medioPago === "tarjeta" ? (base * ip) / 100 : 0));
      if (montoEntregado <= 0) {
        $dlgPago?.close();
        await Swal.fire({ icon: "warning", title: "Falta el efectivo", text: "Ingresá el monto entregado por el cliente" });
        $dlgPago?.showModal();
        refreshModalTotals();
        return;
      }
      if (montoEntregado < totalVenta) {
        $dlgPago?.close();
        await Swal.fire({ icon: "error", title: "Monto insuficiente", text: "El efectivo recibido es menor al total" });
        $dlgPago?.showModal();
        refreshModalTotals();
        return;
      }
    }

    $btnConfirmarPago.disabled = true;
    $btnConfirmarPago.querySelector("span").textContent = "Procesando...";

    const body = {
      carrito: state.carrito.map((i) => ({
        id: i.id,
        cantidad: i.cantidad,
        precio: i.precio,
        ...(i.esLibre ? { esLibre: true, nombre: i.nombre } : {}),
      })),
      descuento: {
        tipo: state.descuentoTipo,
        valor: Number(state.descuentoValor || 0),
      },
      pago: {
        medio: state.medioPago,
        monto: state.medioPago === "efectivo" ? Number(state.montoPago || 0) : null,
        interes_porcentaje: state.medioPago === "tarjeta" ? Number(state.interesPct || 0) : 0,
      },
      usuario: localStorage.getItem("user_email") || null,
      cliente_id: state.cliente?.id || null,
      nota: "",
    };

    const r = await api(
      "/api/ventas",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { expectJSON: true },
    );

    $btnConfirmarPago.disabled = false;
    $btnConfirmarPago.querySelector("span").textContent = "Confirmar venta";

    $dlgPago?.close();

    if (!r.ok) {
      await Swal.fire({ icon: "error", title: "Error al registrar venta", text: r.data?.error || "Problema con el servidor", confirmButtonColor: "#ff5c5c" });
      $dlgPago?.showModal();
      refreshModalTotals();
      return;
    }

    if (!state.ventasHoy) state.ventasHoy = [];
    state.ventasHoy.push({
      id: r.data.id,
      fecha: new Date().toISOString(),
      total: r.data.total,
      medio_pago: state.medioPago,
      cliente_nombre: state.cliente?.nombre || null,
    });
    incrementarContador();
    renderHistorial();

    const posWrap = document.querySelector(".pos-wrap");
    if (posWrap) {
      posWrap.style.transition = "box-shadow .3s ease";
      posWrap.style.boxShadow = "inset 0 0 80px rgba(0,216,117,.15)";
      setTimeout(() => { posWrap.style.boxShadow = "none"; }, 1200);
    }

    state.carrito = [];
    state.cliente = null;
    state.montoPago = 0;
    state.descuentoValor = 0;
    state.interesPct = 0;
    if ($montoPago) $montoPago.value = "";
    renderCarrito();
    renderCliente();
    refreshTotals();
    renderPreview();
    const topCliente = document.getElementById("cliente-top");
    if (topCliente) topCliente.textContent = "Consumidor Final";
    const topMetodo = document.getElementById("metodo-top");
    if (topMetodo) topMetodo.textContent = "💵 Efectivo";
    updateTotalColor();

    const _ventaId    = r.data.id;
    const _ventaTotal = r.data.total;

    const tok = localStorage.getItem("token") || "";
    const cfg = localStorage.getItem("cfg") || "{}";
    const ticketUrl = `/ticket.html?id=${_ventaId}&auto=1&tok=${encodeURIComponent(tok)}&cfg=${btoa(unescape(encodeURIComponent(cfg)))}`;
    const cfgObj = JSON.parse(cfg || "{}");

    try {
      if (window.electronAPI?.printTicket && cfgObj.autoPrint !== "off") {
        await window.electronAPI.printTicket(ticketUrl, { deviceName: cfgObj.printerName, silent: true, margins: "none", landscape: false });
        Swal.fire({ icon: "success", title: "Venta exitosa", text: "Ticket enviado", timer: 1800, showConfirmButton: false });
      } else {
        window.open(ticketUrl, "_blank");
        Swal.fire({ icon: "success", title: "Venta exitosa", text: "Ticket abierto para imprimir", timer: 1800, showConfirmButton: false });
      }
    } catch (e) {
      console.error("Print error:", e);
      Swal.fire({ icon: "warning", title: "Venta registrada", text: "No se pudo imprimir el ticket", timer: 2200, showConfirmButton: false });
    }

    if ($buscar) { $buscar.value = ""; $buscar.focus(); }
    if (state.arcaHabilitado) setTimeout(() => abrirModalArca(_ventaId, _ventaTotal), 400);
  });

  // Enter en el modal de pago confirma la venta
  $dlgPago?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target?.tagName !== "BUTTON") {
      e.preventDefault();
      $btnConfirmarPago?.click();
    }
  });

  /* ===================== CÓDIGO DE BARRAS ===================== */
  // Foco automático: si el usuario escribe desde cualquier lugar
  // y no está en un input, el foco va a #buscar
  document.addEventListener("keydown", (e) => {
    const tag = (e.target?.tagName || "").toLowerCase();
    const enInput = ["input", "textarea", "select"].includes(tag);

    // ── Atajos de teclado POS ──────────────────────────────
    // F1 → foco búsqueda de productos (o cliente si el modal está abierto en cta. corriente)
    if (e.key === "F1") {
      e.preventDefault();
      if ($dlgPago?.open) {
        const cliSection = document.getElementById("pago-cliente-section");
        if (cliSection && cliSection.style.display !== "none") {
          document.getElementById("pago-buscar-cliente")?.focus();
          return;
        }
      }
      $buscar?.focus();
      $buscar?.select();
      return;
    }
    // F2 / F3 → cantidad último ítem
    if (!enInput && (e.key === "F2" || e.key === "F3")) {
      e.preventDefault();
      if (!state.carrito.length) return;
      const i = state.carrito.length - 1;
      if (e.key === "F2")
        state.carrito[i].cantidad = Math.max(1, state.carrito[i].cantidad - 1);
      if (e.key === "F3") state.carrito[i].cantidad += 1;
      renderCarrito();
      refreshTotals();
      renderPreview();
      actualizarUltimoProd();
      return;
    }
    // F4 → agregar por precio (no si hay otro modal abierto)
    if (e.key === "F4") {
      e.preventDefault();
      if (!$dlgRapido?.open) document.getElementById("btn-precio-libre")?.click();
      return;
    }
    // F8 → vaciar carrito
    if (e.key === "F8") {
      e.preventDefault();
      if (state.carrito.length > 0) $btnVaciar?.click();
      return;
    }
    // F9 → abrir modal pago / confirmar (no si hay modal secundario abierto)
    if (e.key === "F9") {
      e.preventDefault();
      if ($dlgRapido?.open || $dlgPrecioLibre?.open) return;
      if ($dlgPago?.open) {
        $btnConfirmarPago?.click();
      } else if (state.carrito.length > 0) {
        abrirModalPago();
      }
      return;
    }
    // Del/Supr → eliminar último ítem del carrito
    if (!enInput && (e.key === "Delete" || e.key === "Backspace")) {
      if (!state.carrito.length) return;
      e.preventDefault();
      state.carrito.splice(state.carrito.length - 1, 1);
      renderCarrito();
      refreshTotals();
      renderPreview();
      actualizarUltimoProd();
      return;
    }
    // Atajos dentro del modal de pago (métodos + exacto)
    if ($dlgPago?.open && !enInput) {
      const map = { e: "efectivo", t: "tarjeta", r: "transferencia", c: "cuenta_corriente" };
      const metodo = map[e.key.toLowerCase()];
      if (metodo) {
        e.preventDefault();
        const btn = $dlgPago.querySelector(`.pago-metodo-btn[data-metodo="${metodo}"]`);
        btn?.click();
        // Si es cuenta corriente, foco automático al buscador de cliente
        if (metodo === "cuenta_corriente") {
          setTimeout(() => document.getElementById("pago-buscar-cliente")?.focus(), 80);
        }
        return;
      }
      if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        $dlgPago.querySelector(".qcash-exacto")?.click();
        return;
      }
      // Flechas para navegar métodos de pago (todas las direcciones)
      // Solo actúa cuando el foco NO está en un input (guard !enInput ya aplicado)
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
        // Si hay resultados de cliente visibles, ↑↓ los navega
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const clientItems = [...$dlgPago.querySelectorAll(".pago-clientes-result .cli-result-item")];
          if (clientItems.length) {
            e.preventDefault();
            const focused = $dlgPago.querySelector(".cli-result-item.kb-focus");
            let idx = focused ? clientItems.indexOf(focused) : -1;
            focused?.classList.remove("kb-focus");
            idx = e.key === "ArrowDown" ? (idx + 1) % clientItems.length : (idx - 1 + clientItems.length) % clientItems.length;
            clientItems[idx].classList.add("kb-focus");
            clientItems[idx].scrollIntoView({ block: "nearest" });
            return;
          }
        }
        // Cualquier flecha cicla métodos de pago
        e.preventDefault();
        const btns = [...$dlgPago.querySelectorAll(".pago-metodo-btn")];
        const ci = btns.findIndex(b => b.classList.contains("active"));
        const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
        const ni = forward ? (ci + 1) % btns.length : (ci - 1 + btns.length) % btns.length;
        btns[ni]?.click();
        return;
      }
      if (e.key === "Enter") {
        const focused = $dlgPago.querySelector(".cli-result-item.kb-focus");
        if (focused) { e.preventDefault(); focused.click(); return; }
      }
    }

    // Foco automático al escanear: cualquier caracter imprimible
    // que no sea modificador y no estemos en un input
    if (
      !enInput &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      e.key.length === 1 &&
      $buscar
    ) {
      $buscar.focus();
      // No prevenimos el default para que el caracter caiga en el input
    }
  });

  /* ===================== RELOJ ===================== */
  function actualizarHora() {
    const el = document.getElementById("hora-top");
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  setInterval(actualizarHora, 1000);
  actualizarHora();

  /* ===================== SIDEBAR DEL SISTEMA ===================== */
  (function initPOSSidebar() {
    const overlay = document.createElement("div");
    overlay.className = "pos-overlay";
    document.body.appendChild(overlay);

    const btnOpen = document.getElementById("toggle-sidebar-pos");
    if (!btnOpen) return;

    function openSidebar() {
      document.body.classList.add("pos-sidebar-open");
    }
    function closeSidebar() {
      document.body.classList.remove("pos-sidebar-open");
    }

    btnOpen.addEventListener("click", openSidebar);
    overlay.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSidebar();
    });

    const waitForSidebar = (cb) => {
      const el = document.querySelector("body > aside#sidebar");
      if (el) {
        cb(el);
        return;
      }
      const t = setInterval(() => {
        const found = document.querySelector("body > aside#sidebar");
        if (found) {
          clearInterval(t);
          cb(found);
        }
      }, 50);
    };
    waitForSidebar((sidebar) => {
      sidebar.addEventListener("click", (e) => {
        if (e.target.closest("a")) closeSidebar();
      });
    });
  })();

  /* ===================== PRECIO LIBRE ===================== */
  const $dlgPrecioLibre = document.getElementById("dlg-precio-libre");
  const $plDesc = document.getElementById("pl-descripcion");
  const $plPrecio = document.getElementById("pl-precio");
  const $plCantidad = document.getElementById("pl-cantidad");

  document.getElementById("btn-precio-libre")?.addEventListener("click", () => {
    if ($plDesc) $plDesc.value = "";
    if ($plPrecio) $plPrecio.value = "";
    if ($plCantidad) $plCantidad.value = "1";
    $dlgPrecioLibre?.showModal();
    setTimeout(() => $plDesc?.focus(), 50);
  });

  document
    .getElementById("btn-cerrar-precio-libre")
    ?.addEventListener("click", () => { $dlgPrecioLibre?.close(); setTimeout(() => $buscar?.focus(), 50); });

  document
    .getElementById("btn-agregar-precio-libre")
    ?.addEventListener("click", () => {
      const desc = ($plDesc?.value || "").trim();
      const precio = parseFloat($plPrecio?.value || "0");
      const cantidad = Math.max(1, parseInt($plCantidad?.value || "1"));

      if (!desc) {
        $plDesc?.focus();
        showStatus("Ingresá una descripción", "error");
        return;
      }
      if (!precio || precio <= 0) {
        $plPrecio?.focus();
        showStatus("Ingresá un precio válido", "error");
        return;
      }

      // ID negativo para distinguirlo de productos reales
      // Usamos timestamp para que múltiples items libres no colisionen
      const idLibre = -Date.now();

      state.carrito.push({
        id: idLibre,
        nombre: desc,
        precio: precio,
        precioOriginal: precio,
        cantidad: cantidad,
        esLibre: true, // marca para no validar stock en backend
      });

      renderCarrito();
      refreshTotals();
      renderPreview();
      actualizarUltimoProd();
      $dlgPrecioLibre?.close();
      setTimeout(() => $buscar?.focus(), 50);
      showStatus(`"${desc}" agregado al carrito`, "info");
    });

  // Enter en el dialog precio libre
  $dlgPrecioLibre?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target?.tagName !== "BUTTON") {
      e.preventDefault();
      document.getElementById("btn-agregar-precio-libre")?.click();
    }
  });

  /* ===================== DEVOLUCIONES ===================== */
  (function initDevoluciones() {
    const $dlg = document.getElementById("dlg-devolucion");
    const $btnAbrir = document.getElementById("btn-abrir-devolucion");
    const $btnCerrar = document.getElementById("btn-cerrar-devolucion");
    const $btnBuscar = document.getElementById("btn-buscar-venta-dev");
    const $btnConfirm = document.getElementById("btn-confirmar-devolucion");
    const $inputId = document.getElementById("dev-venta-id");
    const $ventaInfo = document.getElementById("dev-venta-info");
    const $paso1 = document.getElementById("dev-paso1");
    const $paso2 = document.getElementById("dev-paso2");
    const $resumen = document.getElementById("dev-resumen");
    const $tbody = document.getElementById("dev-items-tbody");
    const $totalMonto = document.getElementById("dev-total-monto");
    const $motivo = document.getElementById("dev-motivo");

    let ventaActual = null;
    let itemsVenta = [];

    function resetDialog() {
      ventaActual = null;
      itemsVenta = [];
      if ($inputId) $inputId.value = "";
      if ($motivo) $motivo.value = "";
      if ($ventaInfo) $ventaInfo.innerHTML = "";
      if ($paso2) $paso2.style.display = "none";
      if ($paso1) $paso1.style.display = "";
      if ($btnConfirm) $btnConfirm.style.display = "none";
      if ($totalMonto) $totalMonto.textContent = "$0,00";
    }

    $btnAbrir?.addEventListener("click", () => {
      resetDialog();
      $dlg?.showModal();
      setTimeout(() => $inputId?.focus(), 50);
    });

    $btnCerrar?.addEventListener("click", () => $dlg?.close());

    // Buscar venta por ID
    async function buscarVenta() {
      const id = ($inputId?.value || "").trim();
      if (!id) {
        showStatus("Ingresá el número de venta", "error");
        return;
      }

      if ($ventaInfo)
        $ventaInfo.innerHTML = `<div class="dev-loading">Buscando...</div>`;

      const r = await api(
        `/api/ventas/${id}?includeItems=1`,
        {},
        { expectJSON: true },
      );

      if (!r.ok || !r.data) {
        $ventaInfo.innerHTML = `<div class="dev-error">Venta #${id} no encontrada</div>`;
        return;
      }

      ventaActual = r.data;
      itemsVenta = r.data.items || [];

      // Mostrar resumen de la venta
      const fecha = new Date(ventaActual.fecha).toLocaleString("es-AR");
      $ventaInfo.innerHTML = `
      <div class="dev-found">
        <span>✅ Venta #${ventaActual.id}</span>
        <span>${fecha}</span>
        <span>$${money(ventaActual.total)}</span>
        <span>${ventaActual.medio_pago}</span>
      </div>`;

      // Pasar al paso 2
      if ($paso1) $paso1.style.display = "none";
      if ($paso2) $paso2.style.display = "";
      if ($btnConfirm) $btnConfirm.style.display = "";

      renderItemsDevolucion();
    }

    $btnBuscar?.addEventListener("click", buscarVenta);
    $inputId?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") buscarVenta();
    });

    function renderItemsDevolucion() {
      if (!$tbody) return;
      if (!itemsVenta.length) {
        $tbody.innerHTML = `<tr><td colspan="6">Sin ítems</td></tr>`;
        return;
      }

      $tbody.innerHTML = itemsVenta
        .map(
          (it, ix) => `
      <tr>
        <td>
          <input
            type="checkbox"
            class="dev-check"
            data-ix="${ix}"
            checked
          />
        </td>
        <td>${it.nombre || it.descripcion_libre || "–"}</td>
        <td>$${money(it.precio_unitario)}</td>
        <td style="text-align:center">${it.cantidad}</td>
        <td>
          <input
            type="number"
            class="dev-cant field-input"
            data-ix="${ix}"
            min="1"
            max="${it.cantidad}"
            value="${it.cantidad}"
            style="width:60px;text-align:center"
          />
        </td>
        <td>
          ${
            it.producto_id
              ? `<input type="checkbox" class="dev-restock" data-id="${it.producto_id}" checked title="Devolver al stock"/>`
              : `<span style="color:var(--muted);font-size:11px">N/A</span>`
          }
        </td>
      </tr>`,
        )
        .join("");

      $tbody.querySelectorAll(".dev-check, .dev-cant").forEach((el) => {
        el.addEventListener("change", calcularTotalDevolucion);
      });

      calcularTotalDevolucion();
    }

    function calcularTotalDevolucion() {
      let total = 0;
      $tbody?.querySelectorAll("tr").forEach((tr, ix) => {
        const check = tr.querySelector(".dev-check");
        const cant = tr.querySelector(".dev-cant");
        if (check?.checked && itemsVenta[ix]) {
          const c = Math.min(
            Math.max(1, parseInt(cant?.value || "1")),
            itemsVenta[ix].cantidad,
          );
          total += Number(itemsVenta[ix].precio_unitario) * c;
        }
      });
      if ($totalMonto) $totalMonto.textContent = `$${money(total)}`;
    }

    // Confirmar devolución
    $btnConfirm?.addEventListener("click", async () => {
      if (!ventaActual) return;

      const itemsADevolver = [];
      const restockear = [];

      $tbody?.querySelectorAll("tr").forEach((tr, ix) => {
        const check = tr.querySelector(".dev-check");
        const cant = tr.querySelector(".dev-cant");
        const restock = tr.querySelector(".dev-restock");
        if (!check?.checked || !itemsVenta[ix]) return;

        const cantidad = Math.min(
          Math.max(1, parseInt(cant?.value || "1")),
          itemsVenta[ix].cantidad,
        );

        itemsADevolver.push({
          producto_id: itemsVenta[ix].producto_id || null,
          cantidad,
          precio_unitario: itemsVenta[ix].precio_unitario,
          descripcion_libre: itemsVenta[ix].descripcion_libre || null,
        });

        if (restock?.checked && itemsVenta[ix].producto_id) {
          restockear.push(Number(itemsVenta[ix].producto_id));
        }
      });

      if (!itemsADevolver.length) {
        showStatus("Seleccioná al menos un ítem", "error");
        return;
      }

      const montoTotal = itemsADevolver.reduce(
        (s, it) => s + it.precio_unitario * it.cantidad,
        0,
      );

      const confirm = await Swal.fire({
        title: "¿Confirmar devolución?",
        html: `Se reintegrará <b>$${money(montoTotal)}</b> en efectivo.<br>
             ${restockear.length ? `${restockear.length} producto(s) volverán al stock.` : ""}`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Confirmar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#f59e0b",
      });

      if (!confirm.isConfirmed) return;

      const r = await api(
        `/api/ventas/${ventaActual.id}/devolucion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: itemsADevolver,
            restockear,
            motivo: $motivo?.value.trim() || "",
          }),
        },
        { expectJSON: true },
      );

      if (!r.ok) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: r.data?.error || "No se pudo procesar la devolución",
        });
        return;
      }

      await Swal.fire({
        icon: "success",
        title: "Devolución registrada",
        html: `Devolución #${r.data.id}<br>Reintegro: <b>$${money(r.data.monto_total)}</b>`,
        timer: 2500,
        showConfirmButton: false,
      });

      $dlg?.close();
    });
  })();
  /* ===================== HISTORIAL TOGGLE ===================== */
  document
    .getElementById("btn-historial")
    ?.addEventListener("click", toggleHistorial);

  /* ===================== ARCA ===================== */
  // Estado ARCA
  state.arcaHabilitado = false;
  state.arcaInfo = null;

  // Verificar si ARCA está configurado al cargar el POS
  (async () => {
    try {
      const r = await api('/api/arca/info', {}, { expectJSON: true, fallbackNoAuth: false });
      if (r.ok && r.data?.configurado) {
        state.arcaHabilitado = true;
        state.arcaInfo = r.data;
        // Pre-seleccionar tipo de comprobante según condición fiscal
        const sel = document.getElementById('arca-tipo-cbte');
        if (sel && r.data.condicion) {
          if (r.data.condicion === 'responsable_inscripto') sel.value = '6';
          else sel.value = '11'; // monotributista / exento
        }
      }
    } catch { /* ARCA no disponible, se ignora */ }
  })();

  // DOM refs del modal ARCA
  const $dlgArca        = document.getElementById('dlg-arca');
  const $arcaVentaInfo  = document.getElementById('arca-venta-info');
  const $arcaTipoCbte   = document.getElementById('arca-tipo-cbte');
  const $arcaDocTipo    = document.getElementById('arca-doc-tipo');
  const $arcaDocNro     = document.getElementById('arca-doc-nro');
  const $arcaResult     = document.getElementById('arca-result');
  const $btnEmitir      = document.getElementById('btn-emitir-factura');
  const $btnOmitir      = document.getElementById('btn-omitir-arca');
  const $btnCerrarArca  = document.getElementById('btn-cerrar-arca');

  function abrirModalArca(ventaId, ventaTotal) {
    if (!$dlgArca) return;

    // Guardar en state para usarlo al emitir
    state._arcaVentaId    = ventaId;
    state._arcaVentaTotal = ventaTotal;

    // Info de la venta
    if ($arcaVentaInfo) {
      $arcaVentaInfo.innerHTML = `
        <div class="arca-pos-venta-summary">
          <span class="arca-pos-label">Venta <strong>#${ventaId}</strong></span>
          <span class="arca-pos-total">$${money(ventaTotal)}</span>
        </div>`;
    }

    // Reset resultado
    if ($arcaResult) { $arcaResult.style.display = 'none'; $arcaResult.innerHTML = ''; }
    if ($btnEmitir) { $btnEmitir.disabled = false; $btnEmitir.textContent = '🧾 Emitir Factura'; }
    if ($arcaDocNro) { $arcaDocNro.value = ''; $arcaDocNro.style.display = 'none'; }
    if ($arcaDocTipo) $arcaDocTipo.value = '99';

    $dlgArca.showModal();
  }

  // Mostrar/ocultar campo de número de documento según tipo
  $arcaDocTipo?.addEventListener('change', () => {
    const tipo = $arcaDocTipo.value;
    if ($arcaDocNro) {
      $arcaDocNro.style.display = tipo === '99' ? 'none' : '';
      if (tipo !== '99') $arcaDocNro.focus();
    }
  });

  // Emitir factura
  $btnEmitir?.addEventListener('click', async () => {
    const ventaId = state._arcaVentaId;
    if (!ventaId) return;

    const tipoCbte = Number($arcaTipoCbte?.value || 11);
    const docTipo  = Number($arcaDocTipo?.value || 99);
    const docNro   = ($arcaDocNro?.value || '').trim();

    if (docTipo !== 99 && !docNro) {
      showStatus('Ingresá el número de documento', 'error');
      $arcaDocNro?.focus();
      return;
    }

    $btnEmitir.disabled = true;
    $btnEmitir.textContent = '⏳ Emitiendo...';
    if ($arcaResult) { $arcaResult.style.display = 'none'; }

    const r = await api('/api/arca/facturar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venta_id: ventaId,
        tipo_comprobante: tipoCbte,
        doc_tipo: docTipo,
        doc_nro: docNro || 0,
      }),
    }, { expectJSON: true });

    $btnEmitir.disabled = false;
    $btnEmitir.textContent = '🧾 Emitir Factura';

    if ($arcaResult) {
      $arcaResult.style.display = '';
      if (r.ok && r.data?.ok) {
        const d = r.data;
        $arcaResult.innerHTML = `
          <div class="arca-estado arca-estado--ok">
            ✅ Factura emitida correctamente
          </div>
          <div class="arca-cbte-detalle">
            <div class="arca-cbte-row">
              <span>Comprobante</span>
              <strong>${d.tipo_nombre} N° ${String(d.punto_venta).padStart(4,'0')}-${String(d.nro_comprobante).padStart(8,'0')}</strong>
            </div>
            <div class="arca-cbte-row">
              <span>CAE</span>
              <strong class="arca-cae-num">${d.cae}</strong>
            </div>
            <div class="arca-cbte-row">
              <span>Vencimiento CAE</span>
              <strong>${d.cae_vto ? d.cae_vto.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') : '–'}</strong>
            </div>
          </div>`;
        if ($btnEmitir) $btnEmitir.style.display = 'none';
        if ($btnOmitir) $btnOmitir.textContent = 'Cerrar';
      } else {
        const msg = r.data?.error || 'Error al emitir factura';
        $arcaResult.innerHTML = `
          <div class="arca-estado arca-estado--error">
            ❌ ${msg}
          </div>`;
      }
    }
  });

  $btnOmitir?.addEventListener('click', () => {
    $dlgArca?.close();
    if ($btnEmitir) $btnEmitir.style.display = '';
    if ($btnOmitir) $btnOmitir.textContent = 'Omitir';
  });
  $btnCerrarArca?.addEventListener('click', () => {
    $dlgArca?.close();
    if ($btnEmitir) $btnEmitir.style.display = '';
    if ($btnOmitir) $btnOmitir.textContent = 'Omitir';
  });

  /* ===================== INIT ===================== */
  renderCliente();
  renderCarrito();
  refreshTotals();
  updateTotalColor();
  renderPreview();
  cargarContadorDia();

  if (!token) showStatus("Modo sin sesión: funciones limitadas.", "info");
});

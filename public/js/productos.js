// public/js/productos.js — Productos completo v3
const token = localStorage.getItem("token");
if (!token) location.href = "/admin/login.html";

/* ── Utils ── */
function money(n) {
  return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(opts.headers || {}),
    },
  });
  return res;
}

/* ── Barcode lookup ── */
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

async function autocompletarDesdeBarcode(code) {
  if (!code || !/^\d{6,}$/.test(code)) return;
  if ($scanHint) { $scanHint.textContent = "🔍 Buscando en base de datos…"; $scanHint.style.color = "var(--accent)"; }
  const info = await lookupBarcode(code);
  if (info?.nombre) {
    if ($prodNombre && !$prodNombre.value) $prodNombre.value = info.nombre;
    if ($prodCategoria && !$prodCategoria.value && info.categoria) $prodCategoria.value = info.categoria;
    if ($scanHint) { $scanHint.textContent = `✅ Datos de ${info.fuente}`; $scanHint.style.color = "var(--success, green)"; }
  } else {
    if ($scanHint) { $scanHint.textContent = "No encontrado en base de datos — completá manualmente"; $scanHint.style.color = ""; }
  }
  setTimeout(() => {
    if ($scanHint) { $scanHint.textContent = "Apuntá el escáner al código de barras o presioná 📷"; $scanHint.style.color = ""; }
  }, 3000);
}

/* ── DOM refs ── */
const $tbody = document.getElementById("tbody-productos");
const $search = document.getElementById("search");
const $btnNuevo = document.getElementById("btn-nuevo");
const $btnImportar = document.getElementById("btn-importar");
const $btnExportar = document.getElementById("btn-exportar");
const $statTotal = document.getElementById("stat-total");
const $statStockBaj = document.getElementById("stat-stock-bajo");

// Dialog producto
const $dlg = document.getElementById("dlg-producto");
const $dlgTitulo = document.getElementById("dlg-titulo");
const $btnCerrarDlg = document.getElementById("btn-cerrar-dlg");
const $btnGuardar = document.getElementById("btn-guardar");
const $prodId = document.getElementById("prod-id");
const $prodNombre = document.getElementById("prod-nombre");
const $prodSku = document.getElementById("prod-sku");
const $prodCategoria = document.getElementById("prod-categoria");
const $prodPrecio = document.getElementById("prod-precio");
const $prodCosto = document.getElementById("prod-costo");
const $prodStock = document.getElementById("prod-stock");
const $prodDesc = document.getElementById("prod-descripcion");
const $prodImagen = document.getElementById("prod-imagen");
const $prodPreview = document.getElementById("prod-preview");
const $btnEscanear = document.getElementById("btn-escanear");
const $scanHint = document.getElementById("scan-hint");

/* ── Estado ── */
let productosCache = [];
let scannerActivo = false;
let scanBuffer = "";
let scanTimer = null;

let filtros = {
  texto: "",
  categoria: "",
  precioMin: null,
  precioMax: null,
  stock: "",
};

/* ===================== CARGAR PRODUCTOS ===================== */
async function cargarProductos(search = "") {
  try {
    const res = await apiFetch(
      `/api/productos?search=${encodeURIComponent(search)}&limit=5000`,
    );
    const data = await res.json();
    productosCache = Array.isArray(data) ? data : [];
    poblarCategorias(productosCache);
    aplicarFiltros();
  } catch (e) {
    console.error(e);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudieron cargar los productos",
    });
  }
}

function actualizarStats(productos) {
  if ($statTotal)
    $statTotal.textContent = `${productos.length} producto${productos.length !== 1 ? "s" : ""}`;
  const stockBajo = productos.filter((p) => Number(p.stock) <= 5).length;
  if ($statStockBaj) {
    $statStockBaj.textContent = `${stockBajo} stock bajo`;
    $statStockBaj.style.display = stockBajo > 0 ? "" : "none";
  }
}

/* ── Poblar select de categorías ── */
function poblarCategorias(productos) {
  const $sel = document.getElementById("filtro-categoria");
  if (!$sel) return;
  const cats = [
    ...new Set(
      productos
        .map((p) => p.categoria)
        .filter(Boolean)
        .sort(),
    ),
  ];
  const actual = $sel.value;
  $sel.innerHTML =
    `<option value="">Todas las categorías</option>` +
    cats
      .map(
        (c) =>
          `<option value="${c}" ${c === actual ? "selected" : ""}>${c}</option>`,
      )
      .join("");
}

let productosFiltrados = [];

/* ── Aplicar filtros sobre el cache ── */
function aplicarFiltros() {
  let resultado = [...productosCache];

  if (filtros.texto) {
    const t = filtros.texto.toLowerCase();
    resultado = resultado.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(t) ||
        p.sku?.toLowerCase().includes(t) ||
        p.categoria?.toLowerCase().includes(t),
    );
  }

  if (filtros.categoria)
    resultado = resultado.filter((p) => p.categoria === filtros.categoria);

  if (filtros.precioMin !== null && !isNaN(filtros.precioMin))
    resultado = resultado.filter((p) => Number(p.precio) >= filtros.precioMin);

  if (filtros.precioMax !== null && !isNaN(filtros.precioMax))
    resultado = resultado.filter((p) => Number(p.precio) <= filtros.precioMax);

  if (filtros.stock === "ok")
    resultado = resultado.filter((p) => Number(p.stock) > 5);
  if (filtros.stock === "low")
    resultado = resultado.filter(
      (p) => Number(p.stock) > 0 && Number(p.stock) <= 5,
    );
  if (filtros.stock === "out")
    resultado = resultado.filter((p) => Number(p.stock) <= 0);

  productosFiltrados = resultado;
  renderProductos(resultado);
  actualizarStats(resultado);
}

/* ===================== IMPRIMIR CÓDIGOS DE BARRAS ===================== */
function imprimirCodigosBarras() {
  const conSku = productosFiltrados.filter(p => p.sku);
  if (!conSku.length) {
    Swal.fire({ icon: "info", title: "Sin códigos", text: "No hay productos con código de barras en la lista actual.", timer: 2000, showConfirmButton: false });
    return;
  }

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Códigos de barras</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#fff;padding:10mm}
.no-print{margin-bottom:10mm}
.no-print button{padding:8px 20px;font-size:14px;cursor:pointer;background:#1e9de8;color:#fff;border:none;border-radius:6px}
.no-print span{margin-left:12px;font-size:13px;color:#666}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm}
.card{border:1px solid #ccc;border-radius:4px;padding:3mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.nombre{font-size:9px;font-weight:700;margin-bottom:1mm;line-height:1.3;max-height:2.6em;overflow:hidden}
.sku{font-size:8px;color:#666;font-family:monospace;margin-bottom:1mm}
.precio{font-size:11px;font-weight:700;margin-top:2mm}
img{max-width:100%;height:auto;display:block;margin:0 auto}
@media print{@page{margin:8mm}.no-print{display:none}}
</style>
</head><body>
<div class="no-print">
  <button onclick="window.print()">🖨 Imprimir</button>
  <span>${conSku.length} producto${conSku.length !== 1 ? "s" : ""} con código de barras</span>
</div>
<div class="grid">
${conSku.map(p => `<div class="card">
  <div class="nombre">${p.nombre}</div>
  <div class="sku">${p.sku}</div>
  <img src="/api/barcode/${encodeURIComponent(p.sku)}" alt="${p.sku}">
  <div class="precio">$${money(p.precio)}</div>
</div>`).join("\n")}
</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    Swal.fire({ icon: "warning", title: "Bloqueador de popups activo", text: "Permitir ventanas emergentes para este sitio", timer: 3000, showConfirmButton: false });
    return;
  }
  w.document.write(html);
  w.document.close();
}

/* ── Listeners de filtros ── */
let searchTimer;
$search?.addEventListener("input", (e) => {
  filtros.texto = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => cargarProductos(filtros.texto), 280);
});

document.getElementById("filtro-categoria")?.addEventListener("change", (e) => {
  filtros.categoria = e.target.value;
  aplicarFiltros();
});

document.getElementById("filtro-precio-min")?.addEventListener("input", (e) => {
  filtros.precioMin = e.target.value !== "" ? Number(e.target.value) : null;
  aplicarFiltros();
});

document.getElementById("filtro-precio-max")?.addEventListener("input", (e) => {
  filtros.precioMax = e.target.value !== "" ? Number(e.target.value) : null;
  aplicarFiltros();
});

document.getElementById("filtro-stock")?.addEventListener("change", (e) => {
  filtros.stock = e.target.value;
  aplicarFiltros();
});

document
  .getElementById("btn-limpiar-filtros")
  ?.addEventListener("click", () => {
    filtros = {
      texto: "",
      categoria: "",
      precioMin: null,
      precioMax: null,
      stock: "",
    };
    if ($search) $search.value = "";
    const fc = document.getElementById("filtro-categoria");
    if (fc) fc.value = "";
    const fm = document.getElementById("filtro-precio-min");
    if (fm) fm.value = "";
    const fx = document.getElementById("filtro-precio-max");
    if (fx) fx.value = "";
    const fs = document.getElementById("filtro-stock");
    if (fs) fs.value = "";
    aplicarFiltros();
  });

/* ===================== RENDER TABLA ===================== */
function renderProductos(productos) {
  if (!$tbody) return;

  if (!productos.length) {
    $tbody.innerHTML = `
      <tr><td colspan="${window._modoSeleccion?.() ? 9 : 8}">
        <div class="empty-state">
          <span class="empty-icon">📦</span>
          <span>No hay productos que coincidan con los filtros.</span>
        </div>
      </td></tr>`;
    return;
  }

  $tbody.innerHTML = productos
    .map((p) => {
      const stockClass =
        p.stock <= 0 ? "stock-out" : p.stock <= 5 ? "stock-low" : "stock-ok";

      const imgEl = p.imagen
        ? `<img src="${p.imagen}" class="prod-img" onclick="verImagen('${p.imagen}')" alt="${p.nombre}"/>`
        : `<div class="prod-img-placeholder">📦</div>`;

      const chkCol = window._modoSeleccion?.()
        ? `<td class="col-check"><input type="checkbox" data-id="${p.id}" ${window._idsSeleccionados?.().has(String(p.id)) ? 'checked' : ''}></td>`
        : '';

      return `
      <tr>
        ${chkCol}
        <td>${imgEl}</td>
        <td>
          <div class="prod-nombre">${p.nombre}</div>
          ${p.descripcion ? `<div class="prod-desc-preview">${p.descripcion}</div>` : ""}
        </td>
        <td>
          <div class="prod-sku-val">${p.sku || "–"}</div>
          ${
            p.sku
              ? `<img src="/api/barcode/${encodeURIComponent(p.sku)}"
            class="prod-barcode" alt="barcode"
            onclick="verImagen(this.src)"
            onerror="this.style.display='none'"/>`
              : ""
          }
        </td>
        <td>${p.categoria || "–"}</td>
        <td class="right">$${money(p.costo || 0)}</td>
        <td class="right prod-precio">$${money(p.precio)}</td>
        <td class="center">
          <span class="stock-badge ${stockClass}">${p.stock}</span>
        </td>
        <td>
          <div class="acciones-row">
            <button class="btn-accion btn-edit"
              onclick="editarProducto(${p.id})" title="Editar">✏️</button>
            <button class="btn-accion btn-stock-adj"
              onclick="ajustarStock(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')"
              title="Ajustar stock">📊</button>
            <button class="btn-accion btn-del"
              onclick="eliminarProducto(${p.id})" title="Eliminar">🗑️</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

/* ===================== MODAL PRODUCTO ===================== */
function limpiarForm() {
  $prodId.value = "";
  $prodNombre.value = "";
  $prodSku.value = "";
  $prodCategoria.value = "";
  $prodPrecio.value = "";
  $prodCosto.value = "";
  $prodStock.value = "";
  $prodDesc.value = "";
  $prodImagen.value = "";
  if ($prodPreview) {
    $prodPreview.src = "";
    $prodPreview.style.display = "none";
  }
  detenerScanner();
}

$btnNuevo?.addEventListener("click", () => {
  limpiarForm();
  if ($dlgTitulo) $dlgTitulo.textContent = "Nuevo producto";
  $dlg?.showModal();
  setTimeout(() => $prodNombre?.focus(), 50);
});

$btnCerrarDlg?.addEventListener("click", () => {
  detenerScanner();
  $dlg?.close();
});

$prodImagen?.addEventListener("input", () => {
  const val = $prodImagen.value.trim();
  if ($prodPreview) {
    $prodPreview.src = val;
    $prodPreview.style.display = val ? "" : "none";
  }
});

/* ===================== ESCÁNER ===================== */
function activarScanner() {
  scannerActivo = true;
  $prodSku?.focus();
  $prodSku?.select();
  if ($scanHint) {
    $scanHint.textContent = "🟢 Escáner activo — apuntá el lector al código";
    $scanHint.style.color = "var(--accent)";
  }
  if ($btnEscanear) $btnEscanear.textContent = "⏹️";
}

function detenerScanner() {
  scannerActivo = false;
  scanBuffer = "";
  if ($scanHint) {
    $scanHint.textContent =
      "Apuntá el escáner al código de barras o presioná 📷";
    $scanHint.style.color = "";
  }
  if ($btnEscanear) $btnEscanear.textContent = "📷";
}

$btnEscanear?.addEventListener("click", () => {
  if (scannerActivo) detenerScanner();
  else activarScanner();
});

let lastKeyTime = 0;
document.addEventListener("keydown", (e) => {
  if (!$dlg?.open) return;

  const now = Date.now();
  const delta = now - lastKeyTime;
  lastKeyTime = now;

  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const id = document.activeElement?.id || "";
  if (tag === "input" && id !== "prod-sku") return;
  if (tag === "textarea") return;

  if (e.key.length === 1 && delta < 60) {
    clearTimeout(scanTimer);
    scanBuffer += e.key;
    if (id !== "prod-sku" && $prodSku) $prodSku.focus();

    scanTimer = setTimeout(() => {
      if (scanBuffer.length >= 4 && $prodSku) {
        $prodSku.value = scanBuffer;
        $prodSku.style.borderColor = "var(--accent)";
        setTimeout(() => { $prodSku.style.borderColor = ""; }, 1000);
        autocompletarDesdeBarcode(scanBuffer);
      }
      scanBuffer = "";
    }, 80);
  } else {
    scanBuffer = e.key.length === 1 ? e.key : "";
  }
});

/* ===================== SCANNER GLOBAL (página sin modal abierto) ===================== */
let gScanBuf = "";
let gScanTmr = null;
let gScanLast = 0;

document.addEventListener("keydown", (e) => {
  // Solo cuando ningún modal está abierto
  if ($dlg?.open || $dlgCR?.open ||
      document.getElementById("dlg-importar")?.open ||
      document.getElementById("dlg-foto-import")?.open ||
      document.getElementById("dlg-pdf-import")?.open ||
      document.getElementById("dlg-imagen")?.open) return;

  // No interferir con inputs/textarea donde el usuario escribe
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key.length !== 1) { gScanBuf = ""; return; }

  const now = Date.now();
  if (now - gScanLast > 120) gScanBuf = ""; // pausa larga = no es escáner
  gScanLast = now;
  gScanBuf += e.key;

  clearTimeout(gScanTmr);
  gScanTmr = setTimeout(async () => {
    const code = gScanBuf.trim();
    gScanBuf = "";
    if (code.length < 4 || !/^\d{4,}$/.test(code)) return;

    // Buscar en el cache local (viene de la DB)
    const existente = productosCache.find(p => String(p.sku || "").trim() === code);

    if (existente) {
      const r = await Swal.fire({
        icon: "info",
        title: existente.nombre,
        html: `<div style="text-align:left;line-height:2">
          <span style="color:var(--muted);font-size:12px">SKU: ${existente.sku}</span><br>
          <b>Precio de venta:</b> $${money(existente.precio)}<br>
          <b>Costo:</b> $${money(existente.costo || 0)}<br>
          <b>Stock:</b> ${existente.stock}
          ${existente.categoria ? `<br><b>Categoría:</b> ${existente.categoria}` : ""}
        </div>`,
        showCancelButton: true,
        confirmButtonText: "Editar",
        cancelButtonText: "Cerrar",
        confirmButtonColor: "#1e9de8",
      });
      if (r.isConfirmed) editarProducto(existente.id);
    } else {
      // No existe → abrir modal nuevo con SKU y buscar nombre en APIs externas
      limpiarForm();
      if ($dlgTitulo) $dlgTitulo.textContent = "Nuevo producto";
      if ($prodSku) $prodSku.value = code;
      $dlg?.showModal();
      setTimeout(() => {
        $prodNombre?.focus();
        autocompletarDesdeBarcode(code);
      }, 80);
    }
  }, 80);
});

/* ── Lookup manual desde campo SKU ── */
$prodSku?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    autocompletarDesdeBarcode($prodSku.value.trim());
  }
});
$prodSku?.addEventListener("blur", () => {
  autocompletarDesdeBarcode($prodSku.value.trim());
});

/* ===================== GUARDAR PRODUCTO ===================== */
$btnGuardar?.addEventListener("click", async () => {
  const nombre = ($prodNombre?.value || "").trim();
  const precio = Number($prodPrecio?.value || 0);

  if (!nombre) {
    Swal.fire({
      icon: "warning",
      title: "Falta el nombre",
      text: "El nombre es obligatorio",
    });
    $prodNombre?.focus();
    return;
  }
  if (precio < 0) {
    Swal.fire({ icon: "warning", title: "Precio inválido" });
    $prodPrecio?.focus();
    return;
  }

  const data = {
    nombre,
    descripcion: ($prodDesc?.value || "").trim(),
    categoria: ($prodCategoria?.value || "").trim(),
    sku: ($prodSku?.value || "").trim(),
    precio,
    costo: Number($prodCosto?.value || 0),
    stock: Number($prodStock?.value || 0),
    imagen: ($prodImagen?.value || "").trim(),
  };

  const isEdit = !!$prodId?.value;
  const url = isEdit ? `/api/productos/${$prodId.value}` : "/api/productos";
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await apiFetch(url, { method, body: JSON.stringify(data) });
    const result = await res.json();
    if (!res.ok) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: result.error || "No se pudo guardar",
      });
      return;
    }
    detenerScanner();
    $dlg?.close();
    await cargarProductos(filtros.texto);
    Swal.fire({
      icon: "success",
      title: isEdit ? "Producto actualizado" : "Producto creado",
      timer: 1400,
      showConfirmButton: false,
    });
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
});

/* ===================== EDITAR ===================== */
async function editarProducto(id) {
  try {
    const res = await apiFetch(`/api/productos/${id}`);
    if (!res.ok) throw new Error("not found");
    const p = await res.json();

    limpiarForm();
    $prodId.value = p.id;
    $prodNombre.value = p.nombre || "";
    $prodSku.value = p.sku || "";
    $prodCategoria.value = p.categoria || "";
    $prodPrecio.value = p.precio ?? "";
    $prodCosto.value = p.costo ?? "";
    $prodStock.value = p.stock ?? "";
    $prodDesc.value = p.descripcion || "";
    $prodImagen.value = p.imagen || "";

    if (p.imagen && $prodPreview) {
      $prodPreview.src = p.imagen;
      $prodPreview.style.display = "";
    }

    if ($dlgTitulo) $dlgTitulo.textContent = "Editar producto";
    $dlg?.showModal();
  } catch (e) {
    console.error(e);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el producto",
    });
  }
}
window.editarProducto = editarProducto;
window.imprimirCodigosBarras = imprimirCodigosBarras;

/* ===================== ELIMINAR ===================== */
async function eliminarProducto(id) {
  const confirm = await Swal.fire({
    title: "¿Eliminar producto?",
    text: "Se desactivará del catálogo",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar",
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await apiFetch(`/api/productos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      Swal.fire({ icon: "error", title: "Error", text: d.error });
      return;
    }
    await cargarProductos(filtros.texto);
    Swal.fire({
      icon: "success",
      title: "Producto eliminado",
      timer: 1400,
      showConfirmButton: false,
    });
  } catch (e) {
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}
window.eliminarProducto = eliminarProducto;

/* ===================== AJUSTAR STOCK ===================== */
async function ajustarStock(id, nombreProd) {
  const { value } = await Swal.fire({
    title: "Ajustar stock",
    html: `<b>${nombreProd}</b><br><br>
           <input id="swal-delta" type="number" class="swal2-input"
                  placeholder="Ej: 10 para sumar, -5 para restar"/>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    preConfirm: () => {
      const v = document.getElementById("swal-delta")?.value;
      if (!v) {
        Swal.showValidationMessage("Ingresá una cantidad");
        return false;
      }
      return Number(v);
    },
  });
  if (value === undefined) return;

  try {
    const res = await apiFetch(`/api/productos/stock/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ delta: value }),
    });
    if (!res.ok) {
      const d = await res.json();
      Swal.fire({ icon: "error", title: "Error", text: d.error });
      return;
    }
    await cargarProductos(filtros.texto);
    Swal.fire({
      icon: "success",
      title: "Stock actualizado",
      timer: 1400,
      showConfirmButton: false,
    });
  } catch (e) {
    Swal.fire({ icon: "error", title: "Error de conexión" });
  }
}
window.ajustarStock = ajustarStock;

/* ===================== VER IMAGEN ===================== */
function verImagen(src) {
  const dlg = document.getElementById("dlg-imagen");
  const img = document.getElementById("dlg-imagen-src");
  if (img) img.src = src;
  dlg?.showModal();
}
window.verImagen = verImagen;

/* ===================== EXPORTAR EXCEL ===================== */
$btnExportar?.addEventListener("click", async () => {
  try {
    const res = await apiFetch("/api/productos/exportar");
    if (!res.ok) throw new Error("Error al exportar");
    const productos = await res.json();

    const datos = productos.map((p) => ({
      nombre: p.nombre,
      sku: p.sku || "",
      precio: p.precio,
      costo: p.costo || 0,
      stock: p.stock,
      categoria: p.categoria || "",
      descripcion: p.descripcion || "",
      imagen: p.imagen || "",
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    ws["!cols"] = [
      { wch: 30 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 16 },
      { wch: 30 },
      { wch: 40 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(
      wb,
      `productos_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );

    Swal.fire({
      icon: "success",
      title: "Excel exportado",
      text: `${productos.length} productos descargados`,
      timer: 1800,
      showConfirmButton: false,
    });
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error al exportar" });
  }
});

/* ===================== IMPORTAR EXCEL ===================== */
const $dlgImportar = document.getElementById("dlg-importar");
const $importFile = document.getElementById("import-file");
const $importDrop = document.getElementById("import-drop");
const $importPreview = document.getElementById("import-preview");
const $importCount = document.getElementById("import-preview-count");
const $importTbody = document.getElementById("import-preview-tbody");
const $btnConfirmImport = document.getElementById("btn-confirmar-import");
const $btnLimpiarImport = document.getElementById("btn-limpiar-import");
const $importResultado = document.getElementById("import-resultado");

let datosImportar = [];

$btnImportar?.addEventListener("click", () => {
  datosImportar = [];
  if ($importPreview) $importPreview.style.display = "none";
  if ($importResultado) {
    $importResultado.style.display = "none";
    $importResultado.innerHTML = "";
  }
  if ($btnConfirmImport) $btnConfirmImport.disabled = true;
  if ($importFile) $importFile.value = "";
  $dlgImportar?.showModal();
});

$importDrop?.addEventListener("click", () => $importFile?.click());

$importDrop?.addEventListener("dragover", (e) => {
  e.preventDefault();
  $importDrop.classList.add("dragging");
});
$importDrop?.addEventListener("dragleave", () =>
  $importDrop.classList.remove("dragging"),
);
$importDrop?.addEventListener("drop", (e) => {
  e.preventDefault();
  $importDrop.classList.remove("dragging");
  const file = e.dataTransfer?.files?.[0];
  if (file) procesarArchivoImport(file);
});

$importFile?.addEventListener("change", () => {
  const file = $importFile.files?.[0];
  if (file) procesarArchivoImport(file);
});

$btnLimpiarImport?.addEventListener("click", () => {
  datosImportar = [];
  if ($importPreview) $importPreview.style.display = "none";
  if ($importFile) $importFile.value = "";
  if ($btnConfirmImport) $btnConfirmImport.disabled = true;
});

function procesarArchivoImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) {
        Swal.fire({
          icon: "warning",
          title: "Archivo vacío",
          text: "No se encontraron datos",
        });
        return;
      }

      datosImportar = rows
        .map((row) => {
          const get = (...keys) => {
            for (const k of keys) {
              const found = Object.keys(row).find(
                (rk) =>
                  rk
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/\p{Mn}/gu, "") ===
                  k
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/\p{Mn}/gu, ""),
              );
              if (found && row[found] !== "") return String(row[found]).trim();
            }
            return "";
          };
          return {
            nombre: get("nombre", "name", "producto"),
            sku: get("sku", "codigo", "barcode", "cod"),
            precio: get("precio", "price", "pvp"),
            costo: get("costo", "cost", "precio_costo"),
            stock: get("stock", "cantidad", "qty"),
            categoria: get("categoria", "category", "rubro"),
            descripcion: get("descripcion", "description", "detalle"),
            imagen: get("imagen", "image", "foto", "url"),
          };
        })
        .filter((r) => r.nombre);

      if (!datosImportar.length) {
        Swal.fire({
          icon: "warning",
          title: "Sin datos válidos",
          text: "No se encontró una columna 'nombre' en el archivo",
        });
        return;
      }

      if ($importCount)
        $importCount.textContent = `${datosImportar.length} productos encontrados`;

      if ($importTbody)
        $importTbody.innerHTML =
          datosImportar
            .slice(0, 8)
            .map(
              (p) => `
          <tr>
            <td>${p.nombre}</td>
            <td>${p.sku || "<span style='color:var(--muted);font-size:11px'>vacío</span>"}</td>
            <td>${p.precio || "–"}</td>
            <td>${p.costo || "–"}</td>
            <td>${p.stock || "0"}</td>
            <td>${p.categoria || "–"}</td>
          </tr>`,
            )
            .join("") +
          (datosImportar.length > 8
            ? `<tr><td colspan="6" style="text-align:center;color:var(--muted);font-size:11px">
                 … y ${datosImportar.length - 8} más
               </td></tr>`
            : "");

      if ($importPreview) $importPreview.style.display = "";
      if ($btnConfirmImport) $btnConfirmImport.disabled = false;
      if ($importResultado) $importResultado.style.display = "none";
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Error al leer el archivo",
        text: err.message,
      });
    }
  };
  reader.readAsArrayBuffer(file);
}

$btnConfirmImport?.addEventListener("click", async () => {
  if (!datosImportar.length) return;

  $btnConfirmImport.disabled = true;
  $btnConfirmImport.textContent = "Importando…";

  try {
    const res = await apiFetch("/api/productos/importar", {
      method: "POST",
      body: JSON.stringify({ productos: datosImportar }),
    });
    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: "error",
        title: "Error al importar",
        text: data.error,
      });
      return;
    }

    const { ok, duplicados, errores } = data;

    if ($importResultado) {
      $importResultado.style.display = "";
      $importResultado.innerHTML = `
        <div class="import-ok">
          ✅ <strong>${ok}</strong> producto${ok !== 1 ? "s" : ""} creado${ok !== 1 ? "s" : ""}
        </div>
        ${
          duplicados > 0
            ? `<div class="import-dup">🔄 ${duplicados} actualizado${duplicados !== 1 ? "s" : ""} (SKU existente)</div>`
            : ""
        }
        ${
          errores?.length
            ? `<div class="import-err">
               ⚠️ ${errores.length} error${errores.length !== 1 ? "es" : ""}:
               <ul>${errores.map((e) => `<li>${e.fila}: ${e.error}</li>`).join("")}</ul>
             </div>`
            : ""
        }`;
    }

    if ($importPreview) $importPreview.style.display = "none";
    datosImportar = [];
    await cargarProductos(filtros.texto);
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "Error de conexión" });
  } finally {
    if ($btnConfirmImport) {
      $btnConfirmImport.disabled = false;
      $btnConfirmImport.textContent = "📥 Importar productos";
    }
  }
});

/* ============================================================
   IMPORTAR DESDE FOTO — pegá este bloque al final de productos.js
   (antes del último cierre de función si lo tenés en IIFE)
   ============================================================ */

/* ── Refs ── */
const $dlgFoto = document.getElementById("dlg-foto-import");
const $btnAbrirFoto = document.getElementById("btn-importar-foto");
const $btnCerrarFoto = document.getElementById("btn-cerrar-foto");
const $fotoFileInput = document.getElementById("foto-file-input");
const $btnElegir = document.getElementById("btn-foto-elegir");
const $fotoDropArea = document.getElementById("foto-drop-area");
const $fotoPreviewWrap = document.getElementById("foto-preview-wrap");
const $fotoPreviewImg = document.getElementById("foto-preview-img");
const $btnCambiar = document.getElementById("btn-foto-cambiar");
const $btnAnalizar = document.getElementById("btn-foto-analizar");
const $btnAnalizarTxt = document.getElementById("btn-analizar-txt");
const $fotoStep1 = document.getElementById("foto-step-1");
const $fotoStep2 = document.getElementById("foto-step-2");
const $fotoTbody = document.getElementById("foto-tbody");
const $fotoStatus = document.getElementById("foto-status");
const $fotoCount = document.getElementById("foto-result-count");
const $fotoSelectedLbl = document.getElementById("foto-selected-count");
const $btnImportarFoto = document.getElementById("btn-foto-importar");
const $btnVolverFoto = document.getElementById("btn-foto-volver");
const $checkAll = document.getElementById("foto-check-all");

let fotoBase64 = null; // base64 sin prefijo
let fotoMimeType = null;
let fotoProductos = []; // array de productos detectados por Claude

/* ── Abrir / cerrar ── */
$btnAbrirFoto?.addEventListener("click", () => {
  resetFotoModal();
  $dlgFoto.showModal();
});

$btnCerrarFoto?.addEventListener("click", () => $dlgFoto.close());
$dlgFoto?.addEventListener("click", (e) => {
  if (e.target === $dlgFoto) $dlgFoto.close();
});

function resetFotoModal() {
  fotoBase64 = null;
  fotoMimeType = null;
  fotoProductos = [];
  $fotoStep1.style.display = "";
  $fotoStep2.style.display = "none";
  $fotoDropArea.style.display = "";
  $fotoPreviewWrap.style.display = "none";
  $fotoPreviewImg.src = "";
  $fotoTbody.innerHTML = "";
  $fotoStatus.style.display = "none";
  $fotoStatus.textContent = "";
  $fotoFileInput.value = "";
  $btnAnalizar.disabled = false;
  $btnAnalizarTxt.textContent = "🔍 Analizar con IA";
}

/* ── Seleccionar archivo ── */
$btnElegir?.addEventListener("click", () => $fotoFileInput.click());
$btnCambiar?.addEventListener("click", () => {
  $fotoFileInput.value = "";
  $fotoFileInput.click();
});

$fotoFileInput?.addEventListener("change", () => {
  const file = $fotoFileInput.files?.[0];
  if (file) cargarImagenFoto(file);
});

function cargarImagenFoto(file) {
  if (file.size > 5 * 1024 * 1024) {
    mostrarStatusFoto(
      "El archivo supera los 5 MB. Usá una imagen más pequeña.",
      "error",
    );
    return;
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(file.type)) {
    mostrarStatusFoto("Formato no soportado. Usá JPG, PNG o WEBP.", "error");
    return;
  }

  fotoMimeType = file.type;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataURL = e.target.result;
    fotoBase64 = dataURL.split(",")[1]; // solo base64, sin prefijo
    $fotoPreviewImg.src = dataURL;
    $fotoDropArea.style.display = "none";
    $fotoPreviewWrap.style.display = "";
    $fotoStatus.style.display = "none";
  };
  reader.readAsDataURL(file);
}

/* ── Drag & drop (bonus) ── */
$fotoDropArea?.addEventListener("dragover", (e) => {
  e.preventDefault();
  $fotoDropArea.classList.add("foto-drag-over");
});
$fotoDropArea?.addEventListener("dragleave", () =>
  $fotoDropArea.classList.remove("foto-drag-over"),
);
$fotoDropArea?.addEventListener("drop", (e) => {
  e.preventDefault();
  $fotoDropArea.classList.remove("foto-drag-over");
  const file = e.dataTransfer.files?.[0];
  if (file) cargarImagenFoto(file);
});

/* ── Analizar con Claude Vision ── */
$btnAnalizar?.addEventListener("click", async () => {
  if (!fotoBase64) return;

  $btnAnalizar.disabled = true;
  $btnAnalizarTxt.textContent = "⏳ Analizando…";
  $fotoStatus.style.display = "none";

  try {
    const prompt = `Analizá esta imagen de una factura o remito de proveedor.
Extraé TODOS los productos/artículos que aparecen listados.
Para cada producto devolvé un objeto JSON con estos campos:
- nombre: string (nombre del producto tal como aparece, limpio y capitalizado)
- precio: number (precio de venta unitario, si no aparece usa 0)
- costo: number (precio de costo o precio de compra unitario, si no aparece usa 0)
- stock: number (cantidad en la factura/remito, si no aparece usa 1)
- categoria: string (intentá inferir la categoría: Alimentos, Bebidas, Limpieza, Electrónica, Ropa, etc. Si no podés inferir dejá "")

REGLAS IMPORTANTES:
- Si el documento tiene "precio unitario" y "total", el precio unitario va en "costo".
- Si hay IVA incluido y podés calcularlo, poné el precio con IVA en "precio" y sin IVA en "costo".
- Ignorá los totales, subtotales, descuentos globales y datos de encabezado (CUIT, fecha, etc.).
- Devolvé SOLO un array JSON válido, sin texto adicional, sin markdown, sin backticks.

Ejemplo del formato esperado:
[{"nombre":"Coca Cola 500ml","precio":850,"costo":600,"stock":24,"categoria":"Bebidas"},{"nombre":"Detergente Magistral 500ml","precio":1200,"costo":900,"stock":12,"categoria":"Limpieza"}]`;

    const response = await apiFetch("/api/productos/analizar-foto", {
      method: "POST",
      body: JSON.stringify({ imagen: fotoBase64, mimeType: fotoMimeType }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (err.error === "SIN_PRODUCTOS") {
        throw new Error(
          "No se detectaron productos en la imagen. Probá con una foto más nítida.",
        );
      }
      throw new Error(err.details || err.error || `Error ${response.status}`);
    }

    const data = await response.json();
    const productos = data.productos;

    fotoProductos = productos;
    renderTablaFoto(productos);

    $fotoStep1.style.display = "none";
    $fotoStep2.style.display = "";
  } catch (e) {
    console.error("[foto-import]", e);
    mostrarStatusFoto(e.message || "Error al analizar la imagen.", "error");
    $btnAnalizar.disabled = false;
    $btnAnalizarTxt.textContent = "🔍 Analizar con IA";
  }
});

/* ── Renderizar tabla de resultados ── */
function renderTablaFoto(productos) {
  $fotoCount.textContent = `${productos.length} producto${productos.length !== 1 ? "s" : ""} detectado${productos.length !== 1 ? "s" : ""}`;

  $fotoTbody.innerHTML = productos
    .map(
      (p, i) => `
    <tr id="foto-row-${i}">
      <td class="center">
        <input type="checkbox" class="foto-row-check" data-i="${i}" checked />
      </td>
      <td>
        <input class="field-input field-input--sm foto-field" data-i="${i}" data-field="nombre"
               value="${escHtml(p.nombre)}" placeholder="Nombre del producto" />
      </td>
      <td>
        <input class="field-input field-input--sm foto-field" data-i="${i}" data-field="sku"
               value="${escHtml(p.sku || '')}" placeholder="Escanear o escribir" />
      </td>
      <td>
        <input class="field-input field-input--sm foto-field" data-i="${i}" data-field="precio"
               type="number" min="0" step="0.01" value="${p.precio || 0}" />
      </td>
      <td>
        <input class="field-input field-input--sm foto-field" data-i="${i}" data-field="costo"
               type="number" min="0" step="0.01" value="${p.costo || 0}" />
      </td>
      <td>
        <input class="field-input field-input--sm foto-field" data-i="${i}" data-field="stock"
               type="number" min="0" step="1" value="${p.stock || 1}" />
      </td>
      <td>
        <input class="field-input field-input--sm foto-field" data-i="${i}" data-field="categoria"
               value="${escHtml(p.categoria || "")}" placeholder="Categoría" />
      </td>
      <td>
        <button class="btn-accion btn-accion--eliminar foto-row-delete" data-i="${i}"
                title="Eliminar fila">🗑</button>
      </td>
    </tr>
  `,
    )
    .join("");

  actualizarContadorFoto();

  // Sync edits al array
  $fotoTbody.querySelectorAll(".foto-field").forEach((input) => {
    input.addEventListener("input", () => {
      const i = +input.dataset.i;
      const field = input.dataset.field;
      fotoProductos[i][field] = ["precio", "costo", "stock"].includes(field)
        ? parseFloat(input.value) || 0
        : input.value;
    });
  });

  // Eliminar fila
  $fotoTbody.querySelectorAll(".foto-row-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(`foto-row-${btn.dataset.i}`)?.remove();
      actualizarContadorFoto();
    });
  });

  // Check individual → actualizar contador
  $fotoTbody.addEventListener("change", (e) => {
    if (e.target.classList.contains("foto-row-check")) actualizarContadorFoto();
  });
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actualizarContadorFoto() {
  const checks = $fotoTbody.querySelectorAll(".foto-row-check:checked");
  $fotoSelectedLbl.textContent = `${checks.length} seleccionado${checks.length !== 1 ? "s" : ""}`;
  $checkAll.checked =
    checks.length === $fotoTbody.querySelectorAll(".foto-row-check").length;
  $checkAll.indeterminate =
    checks.length > 0 &&
    checks.length < $fotoTbody.querySelectorAll(".foto-row-check").length;
}

$checkAll?.addEventListener("change", () => {
  $fotoTbody
    .querySelectorAll(".foto-row-check")
    .forEach((c) => (c.checked = $checkAll.checked));
  actualizarContadorFoto();
});

/* ── Volver al paso 1 ── */
$btnVolverFoto?.addEventListener("click", () => {
  $fotoStep2.style.display = "none";
  $fotoStep1.style.display = "";
  $fotoDropArea.style.display = "none";
  $fotoPreviewWrap.style.display = "";
  $btnAnalizar.disabled = false;
  $btnAnalizarTxt.textContent = "🔍 Analizar con IA";
});

/* ── Importar al sistema ── */
$btnImportarFoto?.addEventListener("click", async () => {
  const checks = [...$fotoTbody.querySelectorAll(".foto-row-check:checked")];
  if (checks.length === 0) {
    mostrarStatusFoto("Seleccioná al menos un producto para importar.", "warn");
    return;
  }

  $btnImportarFoto.disabled = true;
  $btnImportarFoto.textContent = "Importando…";

  let ok = 0,
    errores = 0;

  for (const check of checks) {
    const i = +check.dataset.i;
    const row = document.getElementById(`foto-row-${i}`);

    // Leer valores actuales desde los inputs de la fila (el user pudo editarlos)
    const nombre    = row?.querySelector('[data-field="nombre"]')?.value?.trim();
    const sku       = row?.querySelector('[data-field="sku"]')?.value?.trim() || "";
    const precio    = parseFloat(row?.querySelector('[data-field="precio"]')?.value) || 0;
    const costo     = parseFloat(row?.querySelector('[data-field="costo"]')?.value)  || 0;
    const stock     = parseInt(row?.querySelector('[data-field="stock"]')?.value)    || 0;
    const categoria = row?.querySelector('[data-field="categoria"]')?.value?.trim()  || "";

    if (!nombre) {
      errores++;
      continue;
    }

    try {
      const res = await apiFetch("/api/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre,
          sku: sku || undefined,
          precio,
          costo,
          stock,
          categoria,
          activo: 1,
        }),
      });

      if (!res.ok) throw new Error();

      ok++;
      // Marcar fila como importada
      if (row) {
        row.style.opacity = "0.4";
        row.style.pointerEvents = "none";
        check.checked = false;
      }
    } catch {
      errores++;
    }
  }

  $btnImportarFoto.disabled = false;
  $btnImportarFoto.textContent = "✅ Importar seleccionados";
  actualizarContadorFoto();

  if (ok > 0) {
    await cargarProductos(); // refrescar la tabla principal
    const msg =
      errores > 0
        ? `${ok} producto${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""}. ${errores} fallaron.`
        : `${ok} producto${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""} correctamente.`;
    mostrarStatusFoto(msg, errores > 0 ? "warn" : "ok");
    if (errores === 0) setTimeout(() => $dlgFoto.close(), 1800);
  } else {
    mostrarStatusFoto(
      "No se pudo importar ningún producto. Revisá la conexión.",
      "error",
    );
  }
});

/* ============================================================
   IMPORTAR DESDE PDF
   Pegá este bloque al final de productos.js
   (después del bloque de importar desde foto)
   ============================================================ */

/* ── Refs PDF ── */
const $dlgPdf         = document.getElementById('dlg-pdf-import');
const $btnAbrirPdf    = document.getElementById('btn-importar-pdf');
const $btnCerrarPdf   = document.getElementById('btn-cerrar-pdf');
const $pdfFileInput   = document.getElementById('pdf-file-input');
const $btnPdfElegir   = document.getElementById('btn-pdf-elegir');
const $btnPdfCambiar  = document.getElementById('btn-pdf-cambiar');
const $pdfDropArea    = document.getElementById('pdf-drop-area');
const $pdfArchivoSel  = document.getElementById('pdf-archivo-seleccionado');
const $pdfArchivoNom  = document.getElementById('pdf-archivo-nombre');
const $pdfArchivoSize = document.getElementById('pdf-archivo-size');
const $pdfAnalizarWrap= document.getElementById('pdf-analizar-wrap');
const $btnPdfAnalizar = document.getElementById('btn-pdf-analizar');
const $btnPdfAnalizarTxt = document.getElementById('btn-pdf-analizar-txt');
const $pdfStep1       = document.getElementById('pdf-step-1');
const $pdfStep2       = document.getElementById('pdf-step-2');
const $pdfTbody       = document.getElementById('pdf-tbody');
const $pdfStatus      = document.getElementById('pdf-status');
const $pdfCount       = document.getElementById('pdf-result-count');
const $pdfSelectedLbl = document.getElementById('pdf-selected-count');
const $btnPdfImportar = document.getElementById('btn-pdf-importar');
const $btnPdfVolver   = document.getElementById('btn-pdf-volver');
const $pdfCheckAll    = document.getElementById('pdf-check-all');

let pdfProductos = [];

/* ── Helpers ── */
function mostrarStatusPdf(msg, tipo = 'ok') {
  $pdfStatus.textContent = msg;
  $pdfStatus.className = `foto-status foto-status--${tipo}`;
  $pdfStatus.style.display = '';
}

function resetPdfModal() {
  pdfProductos = [];
  $pdfStep1.style.display = '';
  $pdfStep2.style.display = 'none';
  $pdfDropArea.style.display = '';
  $pdfArchivoSel.style.display = 'none';
  $pdfAnalizarWrap.style.display = 'none';
  $pdfTbody.innerHTML = '';
  $pdfStatus.style.display = 'none';
  $pdfFileInput.value = '';
  $btnPdfAnalizar.disabled = false;
  $btnPdfAnalizarTxt.textContent = '🔍 Extraer productos';
}

/* ── Abrir / cerrar ── */
$btnAbrirPdf?.addEventListener('click', () => {
  resetPdfModal();
  $dlgPdf.showModal();
});
$btnCerrarPdf?.addEventListener('click', () => $dlgPdf.close());
$dlgPdf?.addEventListener('click', e => { if (e.target === $dlgPdf) $dlgPdf.close(); });

/* ── Seleccionar archivo ── */
$btnPdfElegir?.addEventListener('click', () => $pdfFileInput.click());
$btnPdfCambiar?.addEventListener('click', () => { $pdfFileInput.value = ''; $pdfFileInput.click(); });

$pdfFileInput?.addEventListener('change', () => {
  const file = $pdfFileInput.files?.[0];
  if (file) cargarArchivoPdf(file);
});

/* ── Drag & drop ── */
$pdfDropArea?.addEventListener('dragover', e => { e.preventDefault(); $pdfDropArea.classList.add('foto-drag-over'); });
$pdfDropArea?.addEventListener('dragleave', () => $pdfDropArea.classList.remove('foto-drag-over'));
$pdfDropArea?.addEventListener('drop', e => {
  e.preventDefault();
  $pdfDropArea.classList.remove('foto-drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) cargarArchivoPdf(file);
});

function cargarArchivoPdf(file) {
  if (file.type !== 'application/pdf') {
    mostrarStatusPdf('Solo se aceptan archivos PDF.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    mostrarStatusPdf('El archivo supera los 10 MB.', 'error');
    return;
  }

  $pdfDropArea.style.display = 'none';
  $pdfArchivoSel.style.display = '';
  $pdfArchivoNom.textContent = file.name;
  $pdfArchivoSize.textContent = `${(file.size / 1024).toFixed(0)} KB`;
  $pdfAnalizarWrap.style.display = '';
  $pdfStatus.style.display = 'none';

  // Guardar referencia al archivo
  $btnPdfAnalizar._file = file;
}

/* ── Extraer texto del PDF y analizar ── */
$btnPdfAnalizar?.addEventListener('click', async () => {
  const file = $btnPdfAnalizar._file;
  if (!file) return;

  $btnPdfAnalizar.disabled = true;
  $btnPdfAnalizarTxt.textContent = '⏳ Leyendo PDF…';
  $pdfStatus.style.display = 'none';

  try {
    // Leer PDF con pdf.js (cargado desde CDN)
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let textoCompleto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Reconstruir líneas respetando posición Y
      const items = content.items;
      let ultimaY = null;
      for (const item of items) {
        const y = Math.round(item.transform[5]);
        if (ultimaY !== null && Math.abs(y - ultimaY) > 3) {
          textoCompleto += '\n';
        }
        textoCompleto += item.str + ' ';
        ultimaY = y;
      }
      textoCompleto += '\n';
    }

    if (!textoCompleto.trim()) {
      throw new Error('El PDF no contiene texto extraíble. Puede ser una imagen escaneada — usá la función "Importar desde foto".');
    }

    $btnPdfAnalizarTxt.textContent = '⏳ Detectando productos…';

    // Enviar texto al backend para parsear
    const res = await apiFetch('/api/pdf-import/analizar', {
      method: 'POST',
      body: JSON.stringify({ texto: textoCompleto }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.error === 'SIN_PRODUCTOS') {
        throw new Error('No se detectaron productos. Revisá que el PDF sea una factura o remito con tabla de artículos.');
      }
      throw new Error(err.details || err.error || `Error ${res.status}`);
    }

    const data = await res.json();
    pdfProductos = data.productos;
    renderTablaPdf(pdfProductos);

    $pdfStep1.style.display = 'none';
    $pdfStep2.style.display = '';

  } catch (e) {
    console.error('[pdf-import]', e);
    mostrarStatusPdf(e.message || 'Error al procesar el PDF.', 'error');
    $btnPdfAnalizar.disabled = false;
    $btnPdfAnalizarTxt.textContent = '🔍 Extraer productos';
  }
});

/* ── Render tabla resultados ── */
function renderTablaPdf(productos) {
  $pdfCount.textContent = `${productos.length} producto${productos.length !== 1 ? 's' : ''} detectado${productos.length !== 1 ? 's' : ''}`;

  $pdfTbody.innerHTML = productos.map((p, i) => `
    <tr id="pdf-row-${i}">
      <td class="center">
        <input type="checkbox" class="pdf-row-check" data-i="${i}" checked />
      </td>
      <td>
        <input class="field-input field-input--sm pdf-field" data-i="${i}" data-field="nombre"
               value="${escHtml(p.nombre)}" placeholder="Nombre del producto" />
      </td>
      <td>
        <input class="field-input field-input--sm pdf-field" data-i="${i}" data-field="sku"
               value="${escHtml(p.sku || '')}" placeholder="Escanear o escribir" />
      </td>
      <td>
        <input class="field-input field-input--sm pdf-field" data-i="${i}" data-field="precio"
               type="number" min="0" step="0.01" value="${p.precio || 0}" />
      </td>
      <td>
        <input class="field-input field-input--sm pdf-field" data-i="${i}" data-field="costo"
               type="number" min="0" step="0.01" value="${p.costo || 0}" />
      </td>
      <td>
        <input class="field-input field-input--sm pdf-field" data-i="${i}" data-field="stock"
               type="number" min="0" step="1" value="${p.stock || 1}" />
      </td>
      <td>
        <input class="field-input field-input--sm pdf-field" data-i="${i}" data-field="categoria"
               value="${escHtml(p.categoria || '')}" placeholder="Categoría" />
      </td>
      <td>
        <button class="btn-accion btn-accion--eliminar pdf-row-delete" data-i="${i}" title="Eliminar">🗑</button>
      </td>
    </tr>`).join('');

  actualizarContadorPdf();

  $pdfTbody.querySelectorAll('.pdf-field').forEach(input => {
    input.addEventListener('input', () => {
      const i = +input.dataset.i;
      const field = input.dataset.field;
      pdfProductos[i][field] = ['precio','costo','stock'].includes(field)
        ? parseFloat(input.value) || 0
        : input.value;
    });
  });

  $pdfTbody.querySelectorAll('.pdf-row-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`pdf-row-${btn.dataset.i}`)?.remove();
      actualizarContadorPdf();
    });
  });

  $pdfTbody.addEventListener('change', e => {
    if (e.target.classList.contains('pdf-row-check')) actualizarContadorPdf();
  });
}

function actualizarContadorPdf() {
  const checks = $pdfTbody.querySelectorAll('.pdf-row-check:checked');
  $pdfSelectedLbl.textContent = `${checks.length} seleccionado${checks.length !== 1 ? 's' : ''}`;
  $pdfCheckAll.checked = checks.length === $pdfTbody.querySelectorAll('.pdf-row-check').length;
  $pdfCheckAll.indeterminate = checks.length > 0 && checks.length < $pdfTbody.querySelectorAll('.pdf-row-check').length;
}

$pdfCheckAll?.addEventListener('change', () => {
  $pdfTbody.querySelectorAll('.pdf-row-check').forEach(c => c.checked = $pdfCheckAll.checked);
  actualizarContadorPdf();
});

$btnPdfVolver?.addEventListener('click', () => {
  $pdfStep2.style.display = 'none';
  $pdfStep1.style.display = '';
  $pdfDropArea.style.display = 'none';
  $pdfArchivoSel.style.display = '';
  $pdfAnalizarWrap.style.display = '';
  $btnPdfAnalizar.disabled = false;
  $btnPdfAnalizarTxt.textContent = '🔍 Extraer productos';
});

/* ── Importar al sistema ── */
$btnPdfImportar?.addEventListener('click', async () => {
  const checks = [...$pdfTbody.querySelectorAll('.pdf-row-check:checked')];
  if (!checks.length) {
    mostrarStatusPdf('Seleccioná al menos un producto.', 'warn');
    return;
  }

  $btnPdfImportar.disabled = true;
  $btnPdfImportar.textContent = 'Importando…';

  let ok = 0, errores = 0;

  for (const check of checks) {
    const i = +check.dataset.i;
    const row = document.getElementById(`pdf-row-${i}`);
    const nombre    = row?.querySelector('[data-field="nombre"]')?.value?.trim();
    const sku       = row?.querySelector('[data-field="sku"]')?.value?.trim()       || '';
    const precio    = parseFloat(row?.querySelector('[data-field="precio"]')?.value) || 0;
    const costo     = parseFloat(row?.querySelector('[data-field="costo"]')?.value)  || 0;
    const stock     = parseInt(row?.querySelector('[data-field="stock"]')?.value)    || 0;
    const categoria = row?.querySelector('[data-field="categoria"]')?.value?.trim() || '';

    if (!nombre) { errores++; continue; }

    try {
      const res = await apiFetch('/api/productos', {
        method: 'POST',
        body: JSON.stringify({ nombre, sku: sku || undefined, precio, costo, stock, categoria, activo: 1 }),
      });
      if (!res.ok) throw new Error();
      ok++;
      if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; check.checked = false; }
    } catch { errores++; }
  }

  $btnPdfImportar.disabled = false;
  $btnPdfImportar.textContent = '✅ Importar seleccionados';
  actualizarContadorPdf();

  if (ok > 0) {
    await cargarProductos();
    const msg = errores > 0
      ? `${ok} importado${ok !== 1 ? 's' : ''}. ${errores} fallaron.`
      : `${ok} producto${ok !== 1 ? 's' : ''} importado${ok !== 1 ? 's' : ''} correctamente.`;
    mostrarStatusPdf(msg, errores > 0 ? 'warn' : 'ok');
    if (errores === 0) setTimeout(() => $dlgPdf.close(), 1800);
  } else {
    mostrarStatusPdf('No se pudo importar ningún producto.', 'error');
  }
});

/* ── Helpers ── */
function mostrarStatusFoto(msg, tipo = "ok") {
  $fotoStatus.textContent = msg;
  $fotoStatus.className = `foto-status foto-status--${tipo}`;
  $fotoStatus.style.display = "";
}

/* ══════════════════════════════════════════════
   IA — Descripción automática y Reposición
══════════════════════════════════════════════ */

/* ── Generar descripción con IA ── */
document.getElementById("btn-ia-desc")?.addEventListener("click", async () => {
  const nombre    = $prodNombre?.value?.trim();
  const categoria = $prodCategoria?.value?.trim();
  const precio    = $prodPrecio?.value?.trim();

  if (!nombre) {
    Swal.fire({ icon: "warning", title: "Faltó el nombre", text: "Completá el nombre del producto antes de generar la descripción.", confirmButtonColor: "#1e9de8" });
    return;
  }

  const btn = document.getElementById("btn-ia-desc");
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-ia-icon">⏳</span> Generando…';

  try {
    const r = await apiFetch("/api/ia/descripcion", {
      method: "POST",
      body: JSON.stringify({ nombre, categoria, precio }),
    });
    const d = await r.json();

    if (d.ok && d.descripcion) {
      $prodDesc.value = d.descripcion;
      $prodDesc.style.borderColor = "#1e9de8";
      setTimeout(() => ($prodDesc.style.borderColor = ""), 2000);
    } else {
      Swal.fire({ icon: "error", title: "Error de IA", text: d.error || "No se pudo generar la descripción.", confirmButtonColor: "#1e9de8" });
    }
  } catch {
    Swal.fire({ icon: "error", title: "Sin conexión", text: "No se pudo conectar con el servidor.", confirmButtonColor: "#1e9de8" });
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-ia-icon">🤖</span> Generar con IA';
  }
});

/* ── Sugerencias de reposición ── */
document.getElementById("btn-ia-reposicion")?.addEventListener("click", async () => {
  const panel = document.getElementById("ia-reposicion-panel");
  const body  = document.getElementById("ia-reposicion-body");
  const btn   = document.getElementById("btn-ia-reposicion");

  panel.classList.add("visible");
  body.textContent = "Analizando inventario…";
  btn.disabled = true;

  try {
    const r = await apiFetch("/api/ia/reposicion");
    const d = await r.json();

    if (d.ok) {
      body.textContent = d.respuesta;
    } else {
      body.textContent = "⚠️ " + (d.error || "Error al consultar la IA.");
    }
  } catch {
    body.textContent = "⚠️ Sin conexión con el servidor.";
  } finally {
    btn.disabled = false;
  }
});

/* ===================== CARGA RÁPIDA ===================== */
const $dlgCR          = document.getElementById('dlg-carga-rapida');
const $crCodigo       = document.getElementById('cr-codigo');
const $crBtnBuscar    = document.getElementById('cr-btn-buscar');
const $crStepScan     = document.getElementById('cr-step-scan');
const $crStepForm     = document.getElementById('cr-step-form');
const $crActions      = document.getElementById('cr-actions');
const $crStatus       = document.getElementById('cr-status');
const $crPreviewImg   = document.getElementById('cr-preview-img');
const $crPreviewNombre= document.getElementById('cr-preview-nombre');
const $crPreviewCat   = document.getElementById('cr-preview-cat');
const $crPreviewSku   = document.getElementById('cr-preview-sku');
const $crNombre       = document.getElementById('cr-nombre');
const $crPrecio       = document.getElementById('cr-precio');
const $crCosto        = document.getElementById('cr-costo');
const $crStock        = document.getElementById('cr-stock');
const $crYaExiste     = document.getElementById('cr-ya-existe');
const $crBtnGuardar   = document.getElementById('cr-btn-guardar');
const $crBtnCancelarForm = document.getElementById('cr-btn-cancelar-form');

let crCodigoActual = '';
let crProductoExistenteId = null;

document.getElementById('btn-carga-rapida')?.addEventListener('click', () => {
  resetCargaRapida();
  $dlgCR.showModal();
  setTimeout(() => $crCodigo?.focus(), 80);
});

document.getElementById('btn-cerrar-carga-rapida')?.addEventListener('click', () => {
  $dlgCR.close();
});

function resetCargaRapida() {
  crCodigoActual = '';
  crProductoExistenteId = null;
  $crCodigo.value = '';
  $crStepScan.style.display = '';
  $crStepForm.style.display = 'none';
  $crActions.style.display = 'none';
  $crStatus.style.display = 'none';
  $crYaExiste.style.display = 'none';
  $crNombre.value = '';
  $crPrecio.value = '';
  $crCosto.value = '';
  $crStock.value = '1';
  $crPreviewImg.src = '';
  $crPreviewImg.style.display = 'none';
  document.getElementById('cr-scan-hint').textContent = 'Presioná Enter o el botón para buscar';
}

function crMostrarStatus(msg, tipo = 'ok') {
  $crStatus.textContent = msg;
  $crStatus.className = `cr-status cr-status--${tipo}`;
  $crStatus.style.display = '';
  setTimeout(() => { $crStatus.style.display = 'none'; }, 3000);
}

async function crBuscarCodigo() {
  const codigo = $crCodigo.value.trim();
  if (!codigo) return;
  crCodigoActual = codigo;

  $crBtnBuscar.disabled = true;
  $crBtnBuscar.textContent = '⏳';
  document.getElementById('cr-scan-hint').textContent = 'Buscando…';
  crProductoExistenteId = null;
  $crYaExiste.style.display = 'none';

  try {
    // Verificar si el SKU ya existe en el sistema
    const resLocal = await apiFetch(`/api/productos?search=${encodeURIComponent(codigo)}&limit=5`);
    const locales = await resLocal.json();
    const existente = Array.isArray(locales)
      ? locales.find(p => p.sku === codigo)
      : null;

    if (existente) {
      crProductoExistenteId = existente.id;
      $crNombre.value = existente.nombre || '';
      $crPreviewNombre.textContent = existente.nombre || '';
      $crPreviewCat.textContent = existente.categoria || '';
      $crPreviewSku.textContent = `SKU: ${codigo}`;
      if (existente.imagen) {
        $crPreviewImg.src = existente.imagen;
        $crPreviewImg.style.display = '';
      }
      $crPrecio.value = existente.precio ?? '';
      $crCosto.value = existente.costo ?? '';
      $crStock.value = existente.stock ?? '1';
      $crYaExiste.style.display = '';
    } else {
      // Buscar en Open Food Facts
      const resOFF = await apiFetch(`/api/productos/barcode-lookup/${encodeURIComponent(codigo)}`);
      const off = await resOFF.json();

      if (off.encontrado) {
        $crNombre.value = off.nombre;
        $crPreviewNombre.textContent = off.nombre;
        $crPreviewCat.textContent = [off.marca, off.categoria].filter(Boolean).join(' · ');
        $crPreviewSku.textContent = `SKU: ${codigo}`;
        if (off.imagen) {
          $crPreviewImg.src = off.imagen;
          $crPreviewImg.style.display = '';
        } else {
          $crPreviewImg.style.display = 'none';
        }
      } else {
        $crNombre.value = '';
        $crPreviewNombre.textContent = 'Producto no encontrado en la base de datos';
        $crPreviewCat.textContent = 'Completá el nombre manualmente';
        $crPreviewSku.textContent = `SKU: ${codigo}`;
        $crPreviewImg.style.display = 'none';
      }
      $crPrecio.value = '';
      $crCosto.value = '';
      $crStock.value = '1';
    }

    $crStepForm.style.display = '';
    $crActions.style.display = '';
    setTimeout(() => $crPrecio?.focus(), 50);

  } catch (e) {
    document.getElementById('cr-scan-hint').textContent = '⚠ Error al buscar. Intentá de nuevo.';
  } finally {
    $crBtnBuscar.disabled = false;
    $crBtnBuscar.textContent = 'Buscar';
  }
}

$crBtnBuscar?.addEventListener('click', crBuscarCodigo);
$crCodigo?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); crBuscarCodigo(); } });

// Enter en precio → foco a costo
$crPrecio?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $crCosto?.focus(); } });
// Enter en costo → foco a stock
$crCosto?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $crStock?.focus(); } });
// Enter en stock → guardar
$crStock?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); crGuardar(); } });

$crBtnCancelarForm?.addEventListener('click', () => {
  $crStepForm.style.display = 'none';
  $crActions.style.display = 'none';
  $crCodigo.value = '';
  crCodigoActual = '';
  crProductoExistenteId = null;
  $crYaExiste.style.display = 'none';
  setTimeout(() => $crCodigo?.focus(), 50);
});

async function crGuardar() {
  const nombre = $crNombre.value.trim();
  const precio = Number($crPrecio.value || 0);
  const costo  = Number($crCosto.value  || 0);
  const stock  = Number($crStock.value  || 0);

  if (!nombre) {
    $crNombre.focus();
    crMostrarStatus('⚠ El nombre es obligatorio', 'warn');
    return;
  }
  if (precio <= 0) {
    $crPrecio.focus();
    crMostrarStatus('⚠ Ingresá el precio de venta', 'warn');
    return;
  }

  $crBtnGuardar.disabled = true;
  $crBtnGuardar.textContent = 'Guardando…';

  try {
    let res;
    if (crProductoExistenteId) {
      res = await apiFetch(`/api/productos/${crProductoExistenteId}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre, precio, costo, stock, sku: crCodigoActual }),
      });
    } else {
      res = await apiFetch('/api/productos', {
        method: 'POST',
        body: JSON.stringify({
          nombre, precio, costo, stock,
          sku: crCodigoActual,
          imagen: $crPreviewImg.src || '',
          activo: 1,
        }),
      });
    }

    if (!res.ok) {
      const d = await res.json();
      crMostrarStatus('⚠ ' + (d.error || 'Error al guardar'), 'error');
      return;
    }

    crMostrarStatus(`✅ "${nombre}" guardado`, 'ok');
    cargarProductos();

    // Limpiar para el siguiente producto
    setTimeout(() => {
      $crStepForm.style.display = 'none';
      $crActions.style.display = 'none';
      $crCodigo.value = '';
      crCodigoActual = '';
      crProductoExistenteId = null;
      $crNombre.value = '';
      $crPrecio.value = '';
      $crCosto.value = '';
      $crStock.value = '1';
      $crPreviewImg.src = '';
      $crPreviewImg.style.display = 'none';
      $crYaExiste.style.display = 'none';
      $crCodigo?.focus();
    }, 800);

  } catch {
    crMostrarStatus('⚠ Error de conexión', 'error');
  } finally {
    $crBtnGuardar.disabled = false;
    $crBtnGuardar.textContent = '✅ Guardar y continuar';
  }
}

$crBtnGuardar?.addEventListener('click', crGuardar);

/* ===================== INIT ===================== */
cargarProductos();

// Mostrar botón Carga Rápida solo si el plan tiene feature 'ia' (Ultra)
(async () => {
  try {
    const res = await apiFetch('/api/licencia/features');
    const data = await res.json();
    const tieneIA = Array.isArray(data.features) && data.features.includes('ia');
    const btnCR = document.getElementById('btn-carga-rapida');
    if (btnCR) btnCR.style.display = tieneIA ? '' : 'none';
  } catch {
    const btnCR = document.getElementById('btn-carga-rapida');
    if (btnCR) btnCR.style.display = 'none';
  }
})();

/* ===================== MODO SELECCIÓN ===================== */
(function() {
  let modoSeleccion = false;
  let idsSeleccionados = new Set();

  const $btnSel      = document.getElementById('btn-seleccionar');
  const $barra       = document.getElementById('barra-seleccion');
  const $selCount    = document.getElementById('sel-count');
  const $chkTodos    = document.getElementById('chk-todos');
  const $colChecks   = document.querySelectorAll('.col-check');

  function getIdsArray() { return [...idsSeleccionados].map(Number); }

  function actualizarBarra() {
    const n = idsSeleccionados.size;
    $selCount.textContent = `${n} seleccionado${n !== 1 ? 's' : ''}`;
    $barra.style.display  = modoSeleccion ? '' : 'none';
    const btns = $barra.querySelectorAll('.sel-btn');
    btns.forEach(b => b.disabled = n === 0);
  }

  function activarModo() {
    modoSeleccion = true;
    idsSeleccionados.clear();
    $btnSel.textContent = '✕ Salir';
    $btnSel.classList.add('btn-danger');
    // Mostrar columna checkbox en header
    document.querySelectorAll('.col-check').forEach(el => el.style.display = '');
    // Re-render para incluir checkboxes en filas
    filtrarYMostrar();
    actualizarBarra();
  }

  function desactivarModo() {
    modoSeleccion = false;
    idsSeleccionados.clear();
    $btnSel.textContent = '☑️ Seleccionar';
    $btnSel.classList.remove('btn-danger');
    document.querySelectorAll('.col-check').forEach(el => el.style.display = 'none');
    filtrarYMostrar();
    actualizarBarra();
  }

  $btnSel?.addEventListener('click', () => modoSeleccion ? desactivarModo() : activarModo());
  document.getElementById('sel-btn-cancelar')?.addEventListener('click', desactivarModo);

  // Checkbox maestro
  $chkTodos?.addEventListener('change', () => {
    const checks = $tbody.querySelectorAll('input[type=checkbox][data-id]');
    checks.forEach(c => {
      c.checked = $chkTodos.checked;
      if ($chkTodos.checked) idsSeleccionados.add(c.dataset.id);
      else idsSeleccionados.delete(c.dataset.id);
    });
    actualizarBarra();
  });

  // Delegación de clicks en checkboxes de fila
  $tbody.addEventListener('change', e => {
    if (!e.target.matches('input[type=checkbox][data-id]')) return;
    if (e.target.checked) idsSeleccionados.add(e.target.dataset.id);
    else idsSeleccionados.delete(e.target.dataset.id);
    // Actualizar estado del maestro
    const todos = $tbody.querySelectorAll('input[type=checkbox][data-id]');
    $chkTodos.indeterminate = idsSeleccionados.size > 0 && idsSeleccionados.size < todos.length;
    $chkTodos.checked = idsSeleccionados.size === todos.length && todos.length > 0;
    actualizarBarra();
  });

  // Exponer para que renderProductos pueda usarlo
  window._modoSeleccion    = () => modoSeleccion;
  window._idsSeleccionados = () => idsSeleccionados;

  /* ---------- Ajustar stock masivo ---------- */
  document.getElementById('sel-btn-stock')?.addEventListener('click', () => {
    const n = idsSeleccionados.size;
    if (!n) return;
    document.getElementById('asm-count').textContent = n;
    document.getElementById('asm-cantidad').value = '';
    document.getElementById('asm-status').style.display = 'none';
    document.getElementById('dlg-ajustar-stock-masivo').showModal();
  });

  document.getElementById('asm-btn-aplicar')?.addEventListener('click', async () => {
    const operacion = document.getElementById('asm-operacion').value;
    const cantidad  = Number(document.getElementById('asm-cantidad').value ?? 0);
    const $st       = document.getElementById('asm-status');
    const $btn      = document.getElementById('asm-btn-aplicar');

    if (isNaN(cantidad) || cantidad < 0) {
      $st.textContent = '⚠ Ingresá una cantidad válida.';
      $st.style.display = ''; $st.style.background = 'rgba(239,68,68,.12)'; $st.style.color = 'var(--danger)';
      return;
    }
    $btn.disabled = true; $btn.textContent = '⏳ Aplicando…';
    try {
      const r = await apiFetch('/api/productos/ajustar-stock-masivo', {
        method: 'PUT', body: JSON.stringify({ operacion, cantidad, ids: getIdsArray() })
      });
      const d = await r.json();
      if (d.ok) {
        $st.textContent = `✅ Stock actualizado en ${d.afectados} productos.`;
        $st.style.background = 'rgba(0,196,112,.12)'; $st.style.color = 'var(--accent)';
        $st.style.display = '';
        setTimeout(() => { document.getElementById('dlg-ajustar-stock-masivo').close(); desactivarModo(); cargarProductos(); }, 1400);
      } else {
        $st.textContent = '❌ ' + (d.error || 'Error'); $st.style.background = 'rgba(239,68,68,.12)'; $st.style.color = 'var(--danger)'; $st.style.display = '';
      }
    } catch { $st.textContent = 'Error de conexión.'; $st.style.display = ''; }
    finally { $btn.disabled = false; $btn.textContent = '✅ Aplicar'; }
  });

  /* ---------- Cambiar categoría masivo ---------- */
  document.getElementById('sel-btn-cat')?.addEventListener('click', async () => {
    const n = idsSeleccionados.size;
    if (!n) return;
    document.getElementById('cc-count').textContent = n;
    document.getElementById('cc-categoria-nueva').value = '';
    document.getElementById('cc-status').style.display = 'none';
    // Poblar categorías existentes
    const cats = [...new Set(productosCache.map(p => p.categoria).filter(Boolean))].sort();
    document.getElementById('cc-categoria-existente').innerHTML =
      '<option value="">— Elegir existente —</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('dlg-cambiar-cat').showModal();
  });

  document.getElementById('cc-btn-aplicar')?.addEventListener('click', async () => {
    const catExistente = document.getElementById('cc-categoria-existente').value;
    const catNueva     = document.getElementById('cc-categoria-nueva').value.trim();
    const cat = catNueva || catExistente;
    const $st = document.getElementById('cc-status');
    const $btn = document.getElementById('cc-btn-aplicar');
    if (!cat) {
      $st.textContent = '⚠ Seleccioná o escribí una categoría.';
      $st.style.display = ''; $st.style.background = 'rgba(239,68,68,.12)'; $st.style.color = 'var(--danger)';
      return;
    }
    $btn.disabled = true; $btn.textContent = '⏳ Aplicando…';
    try {
      const r = await apiFetch('/api/productos/cambiar-categoria-masivo', {
        method: 'PUT', body: JSON.stringify({ categoria: cat, ids: getIdsArray() })
      });
      const d = await r.json();
      if (d.ok) {
        $st.textContent = `✅ Categoría actualizada en ${d.afectados} productos.`;
        $st.style.background = 'rgba(0,196,112,.12)'; $st.style.color = 'var(--accent)'; $st.style.display = '';
        setTimeout(() => { document.getElementById('dlg-cambiar-cat').close(); desactivarModo(); cargarProductos(); }, 1400);
      } else {
        $st.textContent = '❌ ' + (d.error || 'Error'); $st.style.background = 'rgba(239,68,68,.12)'; $st.style.color = 'var(--danger)'; $st.style.display = '';
      }
    } catch { $st.textContent = 'Error de conexión.'; $st.style.display = ''; }
    finally { $btn.disabled = false; $btn.textContent = '✅ Aplicar'; }
  });

  /* ---------- Actualizar precios desde selección ---------- */
  document.getElementById('sel-btn-precios')?.addEventListener('click', async () => {
    const n = idsSeleccionados.size;
    if (!n) return;
    // Abrir modal de actualizar precios en modo "ids"
    document.getElementById('ap-filtro-row').style.display = 'none';
    document.getElementById('ap-cat-row').style.display    = 'none';
    document.getElementById('ap-sel-info').style.display   = '';
    document.getElementById('ap-sel-count').textContent    = n;
    document.getElementById('ap-preview-wrap').style.display = 'none';
    document.getElementById('ap-status').style.display     = 'none';
    document.getElementById('ap-btn-aplicar').disabled     = true;
    document.getElementById('ap-pct-precio').value         = '';
    document.getElementById('ap-pct-costo').value          = '';
    // Marcar que viene de selección
    document.getElementById('dlg-actualizar-precios').dataset.modo = 'ids';
    document.getElementById('dlg-actualizar-precios').showModal();
  });

  // También resetear el modal cuando se abre desde el botón normal
  document.getElementById('btn-actualizar-precios')?.addEventListener('click', () => {
    document.getElementById('ap-filtro-row').style.display = '';
    document.getElementById('ap-sel-info').style.display   = 'none';
    document.getElementById('dlg-actualizar-precios').dataset.modo = 'normal';
  });

  // Parchar el preview y aplicar para que usen ids cuando corresponde
  const _getApBody = () => {
    const modo = document.getElementById('dlg-actualizar-precios').dataset.modo;
    const pctPrecio = Number(document.getElementById('ap-pct-precio').value || 0);
    const pctCosto  = Number(document.getElementById('ap-pct-costo').value  || 0);
    if (modo === 'ids') {
      return { porcentaje_precio: pctPrecio, porcentaje_costo: pctCosto, filtro: 'ids', ids: getIdsArray() };
    }
    return {
      porcentaje_precio: pctPrecio, porcentaje_costo: pctCosto,
      filtro: document.getElementById('ap-filtro').value,
      categoria: document.getElementById('ap-categoria').value,
    };
  };
  window._getApBody = _getApBody;
})();

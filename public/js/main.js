const $tbody = document.getElementById('tbody');
const $btnCargar = document.getElementById('btn-cargar');
const $btnCrear = document.getElementById('btn-crear');
const $btnVender = document.getElementById('btn-vender');
const $ventaRes = document.getElementById('venta-res');

// Estado de paginación/orden
let state = { page: 1, limit: 5, q: '', sort: 'id', order: 'desc' };

// Helper para normalizar respuesta Paso 1 (array) o Paso 2 ({data:[]})
function getDataArray(payload) {
  return Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : []);
}

async function cargarProductos() {
  const qs = new URLSearchParams(state).toString();
  const res = await fetch(`/api/productos?${qs}`);
  const payload = await res.json();
  const productos = getDataArray(payload);

  $tbody.innerHTML = productos
    .map(p => `<tr><td>${p.id}</td><td>${p.nombre}</td><td>${p.precio}</td><td>${p.stock}</td></tr>`)
    .join('');

  if (!Array.isArray(payload)) {
    console.log(`Página ${payload.page} de ${payload.total_pages}`);
  }
}

async function crearDemo() {
  await fetch('/api/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Auriculares BT',
      descripcion: 'Bluetooth 5.0',
      categoria: 'Audio',
      precio: 19999,
      stock: 8,
      sku: `BT-${Date.now()}`
    })
  });
  // No recargo automáticamente: que el usuario decida cuándo ver con “Cargar productos”
}

async function venderDemo() {
  // 1) Intentar encontrar por SKU del mouse demo
  let mouse = null;

  // Buscar por query para reducir datos
  const resMouse = await fetch(`/api/productos?q=mouse`);
  const payloadMouse = await resMouse.json();
  const candidatos = getDataArray(payloadMouse);

  // Prioridad por SKU exacto de la semilla
  mouse = candidatos.find(p => p.sku === 'MOU-XYZ-001')
       || candidatos.find(p => String(p.nombre).toLowerCase().includes('mouse gamer'))
       || null;

  if (!mouse) {
    alert('No encontré el Mouse Gamer XYZ. Asegurate de tener las semillas o crea un producto mouse.');
    return;
  }

  // 2) Crear la venta con ese producto
  const venta = await fetch('/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuario: 'demo',
      carrito: [{ id: mouse.id, cantidad: 1, precio: mouse.precio }]
    })
  });
  const data = await venta.json();
  $ventaRes.textContent = JSON.stringify(data, null, 2);

  // Opcional: actualizar la vista si querés reflejar el stock
  // await cargarProductos();
}

// Eventos
$btnCargar?.addEventListener('click', cargarProductos);
$btnCrear?.addEventListener('click', crearDemo);
$btnVender?.addEventListener('click', venderDemo);

// ⚠️ Ya no cargamos automáticamente al entrar
// cargarProductos();

// public/js/notificaciones.js
// Requiere: #btnNotif, #notifCount, #notifDropdown en el HTML

(function () {
  const token = localStorage.getItem("token");

  const btnNotif      = document.getElementById("btnNotif");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifCount    = document.getElementById("notifCount");

  if (!btnNotif || !notifDropdown || !notifCount) return; // página sin notif

  let notificaciones = [];

  /* ── Utils ── */
  function timeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60)   return "Hace un momento";
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return new Date(dateStr).toLocaleDateString("es-AR");
  }

  const tipoIcono = {
    info:    "ℹ️",
    warning: "⚠️",
    error:   "🔴",
    success: "✅",
  };

  /* ── Render ── */
  function render() {
    const noLeidas = notificaciones.filter(n => !n.leida);

    // Badge: solo muestra no leídas, oculta si son 0
    notifCount.textContent = noLeidas.length || "";
    notifCount.style.display = noLeidas.length ? "flex" : "none";

    if (!notificaciones.length) {
      notifDropdown.innerHTML = `
        <div class="notif-empty">
          <span>Sin notificaciones</span>
        </div>`;
      return;
    }

    notifDropdown.innerHTML = `
      <div class="notif-header">
        <span class="notif-header-title">Notificaciones</span>
        ${noLeidas.length
          ? `<button class="notif-mark-all" id="btnMarcarTodas">Marcar todas leídas</button>`
          : ""}
      </div>
      ${notificaciones.map(n => `
        <div class="notif-item ${n.leida ? "notif-item--leida" : ""}" data-id="${n.id}">
          <span class="notif-item-icon">${tipoIcono[n.tipo] || "🔔"}</span>
          <div class="notif-item-body">
            <div class="notif-item-titulo">${n.titulo || ""}</div>
            <div class="notif-item-msg">${n.mensaje || ""}</div>
            <div class="notif-item-time">${timeAgo(n.created_at || n.fecha)}</div>
          </div>
          ${!n.leida ? `<button class="notif-item-check" data-id="${n.id}" title="Marcar leída">✓</button>` : ""}
        </div>
      `).join("")}
    `;

    // Evento: marcar una leída
    notifDropdown.querySelectorAll(".notif-item-check").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        marcarLeida(Number(btn.dataset.id));
      });
    });

    // Evento: marcar todas leídas
    const btnTodas = document.getElementById("btnMarcarTodas");
    if (btnTodas) {
      btnTodas.addEventListener("click", e => {
        e.stopPropagation();
        marcarTodasLeidas();
      });
    }
  }

  /* ── API ── */
  async function cargar() {
    try {
      const res = await fetch("/api/notificaciones", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) return;
      notificaciones = await res.json();
      render();
    } catch (err) {
      console.error("notificaciones:", err);
    }
  }

  async function marcarLeida(id) {
    try {
      await fetch(`/api/notificaciones/${id}/leida`, {
        method: "PUT",
        headers: { Authorization: "Bearer " + token },
      });
      const n = notificaciones.find(x => x.id === id);
      if (n) n.leida = 1;
      render();
    } catch (err) {
      console.error("marcarLeida:", err);
    }
  }

  async function marcarTodasLeidas() {
    const noLeidas = notificaciones.filter(n => !n.leida);
    await Promise.all(noLeidas.map(n => marcarLeida(n.id)));
  }

  /* ── Toggle dropdown ── */
  btnNotif.addEventListener("click", e => {
    e.stopPropagation();
    const abierto = notifDropdown.style.display === "block";
    notifDropdown.style.display = abierto ? "none" : "block";
    if (!abierto) cargar(); // refresca al abrir
  });

  // Cerrar al hacer click afuera
  document.addEventListener("click", e => {
    if (!btnNotif.contains(e.target) && !notifDropdown.contains(e.target)) {
      notifDropdown.style.display = "none";
    }
  });

  /* ── Init ── */
  cargar();
  // Polling cada 2 minutos para actualizar el badge
  setInterval(cargar, 120_000);

})();
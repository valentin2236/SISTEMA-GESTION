/* ══════════════════════════════════════════════
   Chat IA flotante — Sistema Gestión PRO
   Se auto-inicializa al incluirse en cualquier página.
   Requiere plan Ultra + API key configurada.
══════════════════════════════════════════════ */

(function () {
  const TOKEN = () => localStorage.getItem('token');

  // ── Crear DOM ────────────────────────────────
  function buildWidget() {
    const wrap = document.createElement('div');
    wrap.id = 'ia-chat-wrap';
    wrap.innerHTML = `
      <button id="ia-chat-toggle" title="Asistente IA" aria-label="Abrir chat IA">
        <span class="ia-icon-closed">🤖</span>
        <span class="ia-icon-open" style="display:none">✕</span>
      </button>

      <div id="ia-chat-panel" aria-hidden="true">
        <div class="ia-panel-head">
          <span class="ia-panel-title">🤖 Asistente IA</span>
          <span class="ia-panel-sub">Preguntá sobre tu negocio</span>
        </div>

        <div id="ia-chat-msgs"></div>

        <div class="ia-panel-foot">
          <textarea
            id="ia-chat-input"
            placeholder="Ej: ¿Cuánto vendí hoy? ¿Qué productos tienen poco stock?"
            rows="2"
          ></textarea>
          <button id="ia-chat-send">Enviar</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  // ── Helpers ──────────────────────────────────
  function addMsg(text, role) {
    const msgs = document.getElementById('ia-chat-msgs');
    const div = document.createElement('div');
    div.className = `ia-msg ia-msg-${role}`;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function setLoading(on) {
    const btn = document.getElementById('ia-chat-send');
    if (btn) btn.disabled = on;
    if (on) {
      const msgs = document.getElementById('ia-chat-msgs');
      const dot = document.createElement('div');
      dot.className = 'ia-msg ia-msg-ia ia-loading';
      dot.id = 'ia-typing';
      dot.innerHTML = '<span></span><span></span><span></span>';
      msgs.appendChild(dot);
      msgs.scrollTop = msgs.scrollHeight;
    } else {
      document.getElementById('ia-typing')?.remove();
    }
  }

  async function sendMsg() {
    const input = document.getElementById('ia-chat-input');
    const pregunta = input.value.trim();
    if (!pregunta) return;

    addMsg(pregunta, 'user');
    input.value = '';
    setLoading(true);

    try {
      const r = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ pregunta }),
      });
      const d = await r.json();
      setLoading(false);
      if (d.ok) {
        addMsg(d.respuesta, 'ia');
      } else {
        addMsg(`⚠️ ${d.error || 'Error al consultar la IA'}`, 'error');
      }
    } catch {
      setLoading(false);
      addMsg('⚠️ Sin conexión con el servidor.', 'error');
    }
  }

  // ── Eventos ──────────────────────────────────
  function bindEvents() {
    const toggle = document.getElementById('ia-chat-toggle');
    const panel  = document.getElementById('ia-chat-panel');
    const input  = document.getElementById('ia-chat-input');
    const send   = document.getElementById('ia-chat-send');

    let open = false;

    toggle.addEventListener('click', () => {
      open = !open;
      panel.classList.toggle('ia-panel-open', open);
      panel.setAttribute('aria-hidden', !open);
      toggle.querySelector('.ia-icon-closed').style.display = open ? 'none' : '';
      toggle.querySelector('.ia-icon-open').style.display  = open ? '' : 'none';
      if (open) {
        const msgs = document.getElementById('ia-chat-msgs');
        if (!msgs.children.length) {
          addMsg('¡Hola! Soy tu asistente IA. Puedo decirte cuánto vendiste, qué productos tienen poco stock, cuáles son los más vendidos, y más. ¿En qué te ayudo?', 'ia');
        }
        setTimeout(() => input.focus(), 150);
      }
    });

    send.addEventListener('click', sendMsg);

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
  }

  // ── Init ─────────────────────────────────────
  function init() {
    if (document.getElementById('ia-chat-wrap')) return;
    buildWidget();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

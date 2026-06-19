// public/js/login.js

document.addEventListener("DOMContentLoaded", () => {

  // ==========================================
  // ELEMENTOS
  // ==========================================

  const $frm = document.getElementById("frm");
  const $email = document.getElementById("email");
  const $pass = document.getElementById("pass");
  const $msg = document.getElementById("msg");

  const $btnLogout = document.getElementById("btn-logout");
  const $who = document.getElementById("who");

  const togglePass = document.getElementById("toggle-pass");

  // ==========================================
  // MOSTRAR / OCULTAR CONTRASEÑA
  // ==========================================

  togglePass?.addEventListener("click", () => {

    $pass.type =
      $pass.type === "password"
        ? "text"
        : "password";

    togglePass.textContent =
      $pass.type === "password"
        ? "👁️"
        : "🙈";
  });

  // ==========================================
  // ESTADO DE SESIÓN
  // ==========================================

  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("user_email");

  if ($who) {
    $who.textContent =
      token && userEmail
        ? `Sesión activa: ${userEmail}`
        : "Sin sesión activa";
  }

  // ==========================================
  // LOGIN
  // ==========================================

  $frm?.addEventListener("submit", async (e) => {

    e.preventDefault();

    if ($msg) {
      $msg.textContent = "Iniciando sesión...";
    }

    try {

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: $email.value.trim(),
          password: $pass.value
        })
      });

      const data = await res.json();

      if (!res.ok) {

        if ($msg) {
          $msg.textContent =
            data?.error || "Credenciales inválidas";
        }

        return;
      }

      // ==========================================
      // GUARDAR DATOS USUARIO
      // ==========================================

      localStorage.setItem("token", data.token);

      localStorage.setItem(
        "user_email",
        data.user?.email || $email.value.trim()
      );

      localStorage.setItem(
        "user_nombre",
        data.user?.nombre || ""
      );

      localStorage.setItem(
        "user_rol",
        data.user?.rol || ""
      );

      if ($msg) {
        $msg.textContent = "Acceso correcto. Redirigiendo...";
      }

      setTimeout(() => {
        location.href = "/admin/dashboard.html";
      }, 500);

    } catch (error) {

      console.error(error);

      if ($msg) {
        $msg.textContent =
          "No se pudo contactar con el servidor";
      }
    }
  });

  // ==========================================
  // LOGOUT
  // ==========================================

  $btnLogout?.addEventListener("click", () => {

    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_nombre");
    localStorage.removeItem("user_rol");

    if ($who) {
      $who.textContent = "Sin sesión activa";
    }

    if ($msg) {
      $msg.textContent = "Sesión cerrada.";
    }
  });

  // ==========================================
  // FRASES ROTATIVAS
  // ==========================================

  const frases = [
    "El futuro de tu negocio comienza hoy.",
    "Controlá todas tus ventas desde un solo lugar.",
    "Gestioná stock, clientes y caja fácilmente.",
    "Tomá decisiones con información en tiempo real.",
    "Más control para tu empresa.",
    "Tecnología diseñada para crecer con vos.",
    "Toda tu gestión centralizada.",
    "Impulsá el crecimiento de tu negocio."
  ];

  const msgEl =
    document.getElementById("rotating-message");

  if (msgEl) {

    let current = 0;

    setInterval(() => {

      msgEl.classList.add("hide");

      setTimeout(() => {

        current =
          (current + 1) % frases.length;

        msgEl.textContent =
          frases[current];

        msgEl.classList.remove("hide");

      }, 500);

    }, 5000);
  }

  // ==========================================
  // DATOS DE EMPRESA
  // ==========================================

  const cfg = JSON.parse(
    localStorage.getItem("cfg") || "{}"
  );

  const companyName =
    document.getElementById("company-name");

  const companyLogo =
    document.getElementById("company-logo");

  if (companyName && cfg.empresaNombre) {
    companyName.textContent =
      cfg.empresaNombre;
  }

  if (companyLogo) {

    if (cfg.empresaLogoData) {

      companyLogo.src =
        cfg.empresaLogoData;

    } else if (cfg.empresaLogo) {

      companyLogo.src =
        cfg.empresaLogo;

    } else {

      companyLogo.src = "/img/logo-savatek.png";
    }
  }

});
let cachedUser = null;
let cachedTeam = null;

async function api(method, path, body) {
  const opts = {
    method,
    credentials: "include",
    headers: {},
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let data = {};
  try {
    const res = await fetch(path, opts);
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      return { ok: false, error: data.error || "No se pudo conectar con el servidor." };
    }
    return { ok: data.ok !== false, ...data };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor. ¿Está corriendo python server.py?" };
  }
}

function cacheSession(data) {
  cachedUser = data.user || null;
  cachedTeam = data.team || null;
  return cachedUser;
}

async function refreshSession() {
  const data = await api("GET", "/api/me");
  if (!data.ok) {
    cachedUser = null;
    cachedTeam = null;
    return null;
  }
  return cacheSession(data);
}

const authReady = refreshSession();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function createUser(data, password) {
  const res = await api("POST", "/api/registro", { ...data, password });
  if (res.ok) cacheSession(res);
  return res;
}

async function login(email, password) {
  const res = await api("POST", "/api/login", { correo: email, password });
  if (res.ok) cacheSession(res);
  return res;
}

async function resetPassword(email, password) {
  return api("POST", "/api/recuperar", { correo: email, password });
}

function currentUser() {
  return cachedUser;
}

async function logout() {
  await api("POST", "/api/logout");
  cachedUser = null;
  cachedTeam = null;
}

async function updateUser(data) {
  const res = await api("PATCH", "/api/me", data);
  if (res.ok) cacheSession(res);
  return res.ok;
}

function userTeam() {
  return cachedTeam;
}

async function createTeam(nombre) {
  const res = await api("POST", "/api/equipo", { nombre });
  if (res.ok) cacheSession(res);
  return res;
}

async function joinTeam(rawCode) {
  const res = await api("POST", "/api/equipo/unirse", { codigo: rawCode });
  if (res.ok) cacheSession(res);
  return res;
}

async function leaveTeam() {
  const res = await api("POST", "/api/equipo/salir");
  if (res.ok) cacheSession(res);
  return res;
}

function trimFormFields(form) {
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.type === "password" || el.type === "file" || el.type === "checkbox") return;
    el.value = el.value.trim();
  });
}

function invalidRequired(form) {
  trimFormFields(form);
  const bad = [];
  form.querySelectorAll("[required]").forEach((el) => {
    const ok = el.checkValidity();
    el.classList.toggle("is-invalid", !ok);
    el.setAttribute("aria-invalid", ok ? "false" : "true");
    if (!ok) bad.push(el);
  });
  return bad;
}

function watchRequired(form, submitBtn) {
  const sync = () => {
    if (submitBtn) submitBtn.disabled = !form.checkValidity();
  };
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (el.classList?.contains("is-invalid") && el.checkValidity()) {
      el.classList.remove("is-invalid");
      el.setAttribute("aria-invalid", "false");
    }
    sync();
  });
  form.addEventListener("change", sync);
  sync();
}

function setupPasswordToggles(root = document) {
  root.querySelectorAll(".pass-wrap").forEach((wrap) => {
    const input = wrap.querySelector("input");
    const btn = wrap.querySelector(".pass-toggle");
    if (!input || !btn) return;

    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });
}

function setupMobileMenu() {
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  if (!menuBtn || !mobileMenu) return;

  menuBtn.addEventListener("click", () => {
    document.body.classList.toggle("menu-open");
  });
  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => document.body.classList.remove("menu-open"));
  });
}

function pageFile() {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  return file === "" ? "index.html" : file;
}

function applySessionNav() {
  const user = currentUser();
  if (!user) return;

  document.body.classList.add("is-logged");
  const file = pageFile();
  const hash = (location.hash || "").replace("#", "");
  const items = [
    { href: "perfil.html#solicitud", key: "solicitud", label: "Solicitud" },
    { href: "perfil.html#equipo", key: "equipo", label: "Equipo" },
    { href: "perfil.html#perfil", key: "perfil", label: "Perfil" },
  ];

  let active = "";
  if (file === "perfil.html") {
    active = ["solicitud", "equipo", "perfil"].includes(hash) ? hash : "solicitud";
  }

  const linksHtml = items
    .map(
      (item) =>
        `<a href="${item.href}"${item.key === active ? ' class="active"' : ""}>${item.label}</a>`
    )
    .join("");

  function bindAuthLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href") || "";
        if (!href || href === "#") return;
        document.body.classList.remove("menu-open");
        if (href.includes("perfil.html#") && pageFile() === "perfil.html") {
          e.preventDefault();
          const next = "#" + href.split("#")[1];
          if (location.hash !== next) history.pushState(null, "", next);
          window.dispatchEvent(new Event("hashchange"));
          window.scrollTo(0, 0);
          return;
        }
        if (href.includes(".html")) {
          e.preventDefault();
          window.location.href = href;
        }
      });
    });
  }

  const navLinks = document.querySelector(".nav-links");
  if (navLinks) {
    navLinks.innerHTML = linksHtml;
    bindAuthLinks(navLinks);
  }

  const mobile = document.getElementById("mobileMenu");
  if (mobile) {
    mobile.innerHTML =
      linksHtml + `<a href="#" class="mobile-register" id="navLogoutMobile">Cerrar sesión</a>`;
    bindAuthLinks(mobile);
  }

  document.querySelectorAll(".nav-login, a[href='login.html']").forEach((el) => {
    if (el.classList.contains("mobile-register")) return;
    el.style.display = "none";
  });

  const rightCta = document.querySelector(".nav-right a.nav-cta");
  const hasLogout = document.getElementById("logoutBtn") || document.getElementById("navLogout");
  if (rightCta && !hasLogout) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-cta";
    btn.id = "navLogout";
    btn.textContent = "Cerrar sesión";
    rightCta.replaceWith(btn);
  } else if (rightCta && rightCta.getAttribute("href") === "registro.html") {
    rightCta.style.display = "none";
  }

  function salir(e) {
    e.preventDefault();
    logout().then(() => {
      window.location.href = "index.html";
    });
  }
  document.getElementById("navLogout")?.addEventListener("click", salir);
  document.getElementById("navLogoutMobile")?.addEventListener("click", salir);

  const heroBtn = document.querySelector(".hero-acts .btn");
  if (heroBtn) {
    heroBtn.href = "perfil.html#solicitud";
    heroBtn.innerHTML = `<span class="brkt">&lt;</span> Ir a mi cuenta <span class="brkt">/&gt;</span>`;
  }
  const bottomCta = document.querySelector(".cta a.btn");
  if (bottomCta) {
    bottomCta.href = "perfil.html#solicitud";
    bottomCta.textContent = "Ir a mi cuenta";
  }
}

authReady.then(() => applySessionNav());

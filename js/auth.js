const DB_KEY = "tigrehack_usuarios";
const SESSION_KEY = "tigrehack_sesion";

async function hashPassword(password) {
  const bytes = new TextEncoder().encode("tigrehack::" + password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUsers() {
  return JSON.parse(localStorage.getItem(DB_KEY) || "{}");
}

function writeUsers(users) {
  localStorage.setItem(DB_KEY, JSON.stringify(users));
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function findUser(email) {
  return readUsers()[normalizeEmail(email)] || null;
}

async function createUser(data, password) {
  const required = [
    "nombre",
    "apellido",
    "correo",
    "telefono",
    "genero",
    "universidad",
    "carrera",
    "graduacion",
    "nivel",
    "talla",
    "github",
  ];
  for (const key of required) {
    if (!String(data[key] || "").trim()) {
      return { ok: false, error: "Llena todos los campos obligatorios." };
    }
  }
  if (!data.reglamento || !data.estudiante) {
    return { ok: false, error: "Acepta el reglamento y confirma que eres estudiante." };
  }
  if (!password || String(password).length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const email = normalizeEmail(data.correo);
  const users = readUsers();
  if (users[email]) return { ok: false, error: "Ya existe una cuenta con este correo." };

  users[email] = {
    ...data,
    correo: email,
    equipoCodigo: "",
    passwordHash: await hashPassword(password),
    creadoEn: new Date().toISOString(),
  };
  writeUsers(users);
  return { ok: true };
}

async function login(email, password) {
  const user = findUser(email);
  if (!user) return { ok: false, error: "No encontramos una cuenta con ese correo." };

  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) return { ok: false, error: "Contraseña incorrecta." };

  localStorage.setItem(SESSION_KEY, normalizeEmail(email));
  return { ok: true, user };
}

async function resetPassword(email, password) {
  const users = readUsers();
  const key = normalizeEmail(email);
  if (!users[key]) return { ok: false, error: "No encontramos una cuenta con ese correo." };

  users[key].passwordHash = await hashPassword(password);
  writeUsers(users);
  return { ok: true };
}

function currentUser() {
  const email = localStorage.getItem(SESSION_KEY);
  return email ? findUser(email) : null;
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
}

function updateUser(data) {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return false;
  const users = readUsers();
  users[email] = { ...users[email], ...data, correo: email };
  writeUsers(users);
  return true;
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

const TEAMS_KEY = "tigrehack_equipos";
const TEAM_MAX = 4;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function readTeams() {
  return JSON.parse(localStorage.getItem(TEAMS_KEY) || "{}");
}

function writeTeams(teams) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
}

function newTeamCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function userTeam() {
  const user = currentUser();
  if (!user?.equipoCodigo) return null;
  return readTeams()[user.equipoCodigo] || null;
}

function createTeam(nombre) {
  const user = currentUser();
  if (!user) return { ok: false, error: "Inicia sesión para crear un equipo." };
  if (userTeam()) return { ok: false, error: "Ya estás en un equipo." };

  const nombreLimpio = String(nombre || "").trim();
  if (!nombreLimpio) return { ok: false, error: "Escribe el nombre del equipo." };
  if (nombreLimpio.length < 2) return { ok: false, error: "El nombre debe tener al menos 2 letras." };

  const teams = readTeams();
  let codigo = newTeamCode();
  while (teams[codigo]) codigo = newTeamCode();

  const team = {
    codigo,
    nombre: nombreLimpio,
    capitan: user.correo,
    miembros: [user.correo],
    creadoEn: new Date().toISOString(),
  };
  teams[codigo] = team;
  writeTeams(teams);
  updateUser({ equipoCodigo: codigo });
  return { ok: true, team };
}

function joinTeam(rawCode) {
  const user = currentUser();
  if (!user) return { ok: false, error: "Inicia sesión para unirte a un equipo." };
  if (userTeam()) return { ok: false, error: "Ya estás en un equipo." };

  const codigo = String(rawCode || "").trim().toUpperCase();
  if (codigo.length !== 6) return { ok: false, error: "El código tiene 6 letras." };
  const teams = readTeams();
  const team = teams[codigo];
  if (!team) return { ok: false, error: "Ese código no existe." };
  if (team.miembros.includes(user.correo)) return { ok: true, team };
  if (team.miembros.length >= TEAM_MAX) {
    return { ok: false, error: "Ese equipo ya tiene 4 personas." };
  }

  team.miembros.push(user.correo);
  writeTeams(teams);
  updateUser({ equipoCodigo: codigo });
  return { ok: true, team };
}

function leaveTeam() {
  const user = currentUser();
  if (!user?.equipoCodigo) return { ok: false, error: "No estás en un equipo." };

  const teams = readTeams();
  const team = teams[user.equipoCodigo];
  if (team) {
    team.miembros = team.miembros.filter((correo) => correo !== user.correo);
    if (!team.miembros.length) {
      delete teams[user.equipoCodigo];
    } else if (team.capitan === user.correo) {
      team.capitan = team.miembros[0];
    }
    writeTeams(teams);
  }
  updateUser({ equipoCodigo: "" });
  return { ok: true };
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
    logout();
    window.location.href = "index.html";
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applySessionNav);
} else {
  applySessionNav();
}

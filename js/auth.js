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
  const email = normalizeEmail(data.correo);
  const users = readUsers();
  if (users[email]) return { ok: false, error: "Ya existe una cuenta con este correo." };

  users[email] = {
    ...data,
    correo: email,
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

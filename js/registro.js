const form = document.getElementById("regForm");
const note = document.getElementById("regNote");
const done = document.getElementById("regDone");
const doneMsg = document.getElementById("doneMsg");

setupMobileMenu();
setupPasswordToggles();

if (currentUser()) {
  window.location.replace("perfil.html");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  note.textContent = "";

  if (!form.checkValidity()) {
    const first = form.querySelector(":invalid");
    first.focus();
    first.scrollIntoView({ behavior: "smooth", block: "center" });
    note.textContent = "Faltan datos obligatorios. Revisa los campos marcados con *";
    return;
  }

  if (form.password.value !== form.password2.value) {
    note.textContent = "Las contraseñas no coinciden.";
    form.password2.focus();
    return;
  }

  const datos = {};
  form.querySelectorAll("input, select").forEach((input) => {
    if (input.type === "password" || input.name === "password" || input.name === "password2") return;
    datos[input.name] = input.type === "checkbox" ? input.checked : input.value.trim();
  });

  const res = await createUser(datos, form.password.value);
  if (!res.ok) {
    note.innerHTML = `${res.error} <a href="login.html">Inicia sesión</a>`;
    return;
  }

  await login(datos.correo, form.password.value);

  form.hidden = true;
  document.querySelector(".reg-head").hidden = true;
  done.hidden = false;
  doneMsg.textContent = `Gracias ${datos.nombre}, tu cuenta quedó creada. La próxima vez solo inicia sesión con ${datos.correo} y no tendrás que llenar nada de nuevo.`;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

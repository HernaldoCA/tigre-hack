const form = document.getElementById("regForm");
const note = document.getElementById("regNote");
const done = document.getElementById("regDone");
const doneMsg = document.getElementById("doneMsg");
const submitBtn = form.querySelector('button[type="submit"]');

setupMobileMenu();
setupPasswordToggles();
watchRequired(form, submitBtn);

if (currentUser()) {
  window.location.replace("perfil.html");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  note.className = "reg-note";
  note.textContent = "";

  const bad = invalidRequired(form);
  if (bad.length) {
    submitBtn.disabled = true;
    bad[0].focus();
    bad[0].scrollIntoView({ behavior: "smooth", block: "center" });
    note.textContent =
      bad.length === 1
        ? "Falta un campo obligatorio."
        : `Faltan ${bad.length} campos obligatorios. Llena los que tienen *.`;
    return;
  }

  if (form.password.value !== form.password2.value) {
    form.password2.classList.add("is-invalid");
    note.textContent = "Las contraseñas no coinciden.";
    form.password2.focus();
    return;
  }

  const datos = {};
  form.querySelectorAll("input, select").forEach((input) => {
    if (input.type === "password" || input.name === "password" || input.name === "password2") return;
    datos[input.name] = input.type === "checkbox" ? input.checked : input.value.trim();
  });

  submitBtn.disabled = true;
  const res = await createUser(datos, form.password.value);
  if (!res.ok) {
    note.innerHTML = `${res.error} <a href="login.html">Inicia sesión</a>`;
    submitBtn.disabled = !form.checkValidity();
    return;
  }

  await login(datos.correo, form.password.value);

  form.hidden = true;
  document.querySelector(".reg-head").hidden = true;
  done.hidden = false;
  doneMsg.textContent = `Gracias ${datos.nombre}, tu cuenta quedó creada. La próxima vez solo inicia sesión con ${datos.correo} y no tendrás que llenar nada de nuevo.`;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

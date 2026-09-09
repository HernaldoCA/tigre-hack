const EVENT_DATE = new Date("2027-05-07T17:00:00");

function pad(n) {
  return String(n).padStart(2, "0");
}

function setDigits(id, n) {
  const el = document.getElementById(id);
  const text = pad(n);
  if (el.dataset.value === text) return;
  el.dataset.value = text;
  el.replaceChildren(
    ...[...text].map((digit) => {
      const slot = document.createElement("span");
      slot.textContent = digit;
      return slot;
    })
  );
}

const monthsBlock = document.getElementById("cd-months-block");
const monthsSep = document.getElementById("cd-months-sep");

// Meses completos que faltan; el resto se muestra como días.
function monthsUntil(from, to) {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  const marker = new Date(from);
  marker.setMonth(marker.getMonth() + months);
  if (marker > to) months--;
  return Math.max(0, months);
}

function tick() {
  const now = new Date();
  const diff = EVENT_DATE - now;

  if (diff <= 0) {
    ["cd-months", "cd-days", "cd-hours", "cd-mins", "cd-secs"].forEach((id) => {
      setDigits(id, 0);
    });
    return;
  }

  const months = monthsUntil(now, EVENT_DATE);
  const afterMonths = new Date(now);
  afterMonths.setMonth(afterMonths.getMonth() + months);
  const rest = EVENT_DATE - afterMonths;

  const days = Math.floor(rest / 86400000);
  const hours = Math.floor((rest % 86400000) / 3600000);
  const mins = Math.floor((rest % 3600000) / 60000);
  const secs = Math.floor((rest % 60000) / 1000);

  const showMonths = months > 0;
  monthsBlock.hidden = !showMonths;
  monthsSep.hidden = !showMonths;

  setDigits("cd-months", months);
  setDigits("cd-days", days);
  setDigits("cd-hours", hours);
  setDigits("cd-mins", mins);
  setDigits("cd-secs", secs);
}

tick();
setInterval(tick, 1000);

const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");

function closeMenu() {
  document.body.classList.remove("menu-open");
}

menuBtn.addEventListener("click", () => {
  document.body.classList.toggle("menu-open");
});
mobileMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

const sectionNav = document.querySelectorAll('.nav-links a[href^="#"], .mobile-menu a[href^="#"]');

function setActiveSection(id) {
  const hash = "#" + id;
  sectionNav.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
}

function navHeight() {
  const nav = document.querySelector("nav");
  return nav ? nav.getBoundingClientRect().height : 0;
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - navHeight();
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

document.querySelectorAll('a[href="#home"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    setActiveSection("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  });
});

sectionNav.forEach((link) => {
  if (link.getAttribute("href") === "#home") return;
  link.addEventListener("click", (e) => {
    const id = link.getAttribute("href").slice(1);
    if (id === "schedule") {
      e.preventDefault();
      closeMenu();
      setActiveSection("schedule");
      scrollToSection("schedule");
      history.replaceState(null, "", "#schedule");
      return;
    }
    setActiveSection(id);
  });
});

const scheduleSection = document.getElementById("schedule");
const board = scheduleSection?.querySelector(".schedule-board");
if (scheduleSection && board) {
  const STEP = 320;

  function maxScroll() {
    return Math.max(0, board.scrollWidth - board.clientWidth);
  }

  function atStart() {
    return board.scrollLeft <= 1;
  }

  function atEnd() {
    return board.scrollLeft >= maxScroll() - 1;
  }

  function scrollTrack(dir) {
    board.scrollBy({ left: dir * STEP, behavior: "smooth" });
  }

  window.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    const rect = scheduleSection.getBoundingClientRect();
    if (rect.bottom < 80 || rect.top > window.innerHeight - 80) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollTrack(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollTrack(-1);
    }
  });

  board.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY < 0 && atStart()) return;
      if (e.deltaY > 0 && atEnd()) return;
      e.preventDefault();
      board.scrollLeft += e.deltaY;
    },
    { passive: false }
  );
}

document.querySelectorAll(".faq-q").forEach((question) => {
  question.addEventListener("click", () => {
    question.parentElement.classList.toggle("open");
  });
});

const statNums = document.querySelectorAll(".stat-num");
const statObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      statObserver.unobserve(el);

      const target = Number(el.dataset.count);
      const steps = 45;
      let step = 0;
      const timer = setInterval(() => {
        step++;
        el.textContent = Math.round((target * step) / steps);
        if (step >= steps) {
          el.textContent = target;
          clearInterval(timer);
        }
      }, 22);
    });
  },
  { threshold: 0.4 }
);
statNums.forEach((el) => statObserver.observe(el));

const navIds = new Set(
  [...sectionNav].map((link) => link.getAttribute("href").slice(1))
);
const sections = [...document.querySelectorAll("section[id]")].filter((section) =>
  navIds.has(section.id)
);

function syncNavFromScroll() {
  let current = "home";
  sections.forEach((section) => {
    if (window.scrollY >= section.offsetTop - 140) current = section.id;
  });
  setActiveSection(current);
}

syncNavFromScroll();
window.addEventListener("scroll", syncNavFromScroll, { passive: true });

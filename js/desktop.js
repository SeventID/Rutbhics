// Web Desktop — window manager, taskbar, start menu, jam (WIB).
// Semua aplikasi terdaftar di APPS (lihat js/apps.js untuk isi tiap aplikasi).
(function () {
  "use strict";

  var APPS = window.APPS || {};
  var zTop = 10;
  var winCount = 0;
  var openWins = {}; // appId -> elemen window

  var windowsEl = document.getElementById("windows");
  var iconsEl = document.getElementById("desktop-icons");
  var taskEl = document.getElementById("task-buttons");
  var startMenu = document.getElementById("start-menu");
  var startGrid = document.getElementById("start-grid");
  var startSearch = document.getElementById("start-search");

  function appList() {
    return Object.keys(APPS).map(function (id) { return { id: id, def: APPS[id] }; });
  }

  function focusWin(id) {
    var w = openWins[id];
    if (!w) return;
    zTop += 1;
    w.style.zIndex = zTop;
    document.querySelectorAll(".task-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.app === id && !w.classList.contains("hidden-win"));
    });
  }

  function renderTaskbar() {
    taskEl.innerHTML = "";
    Object.keys(openWins).forEach(function (id) {
      var b = document.createElement("button");
      b.className = "task-btn";
      b.dataset.app = id;
      b.textContent = APPS[id].emoji + " " + APPS[id].title;
      b.addEventListener("click", function () {
        var w = openWins[id];
        if (w.classList.contains("hidden-win")) {
          w.classList.remove("hidden-win");
          focusWin(id);
        } else if (parseInt(w.style.zIndex, 10) === zTop) {
          w.classList.add("hidden-win");
          b.classList.remove("active");
        } else {
          focusWin(id);
        }
      });
      taskEl.appendChild(b);
    });
  }

  function openApp(id) {
    var def = APPS[id];
    if (!def) return;
    if (openWins[id]) {
      openWins[id].classList.remove("hidden-win");
      focusWin(id);
      return;
    }
    var w = document.createElement("section");
    w.className = "window";
    w.style.left = (60 + (winCount % 5) * 36) + "px";
    w.style.top = (40 + (winCount % 5) * 30) + "px";
    winCount += 1;
    w.innerHTML =
      '<div class="win-header"><span>' + def.emoji + '</span>' +
      '<span class="win-title">' + def.title + '</span>' +
      '<button class="win-btn" data-act="min" title="Minimize">—</button>' +
      '<button class="win-btn close" data-act="close" title="Tutup">✕</button></div>' +
      '<div class="win-body"></div>';
    var body = w.querySelector(".win-body");
    def.render(body);
    w.querySelector('[data-act="min"]').addEventListener("click", function () {
      w.classList.add("hidden-win");
      renderTaskbar();
    });
    w.querySelector('[data-act="close"]').addEventListener("click", function () {
      w.remove();
      delete openWins[id];
      renderTaskbar();
    });
    w.addEventListener("pointerdown", function () { focusWin(id); });
    makeDraggable(w, w.querySelector(".win-header"));
    windowsEl.appendChild(w);
    openWins[id] = w;
    focusWin(id);
    renderTaskbar();
    startMenu.classList.add("hidden");
  }

  function makeDraggable(win, handle) {
    var dx = 0, dy = 0, dragging = false;
    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".win-btn")) return;
      dragging = true;
      dx = e.clientX - win.offsetLeft;
      dy = e.clientY - win.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var x = Math.max(0, Math.min(e.clientX - dx, window.innerWidth - 120));
      var y = Math.max(0, Math.min(e.clientY - dy, window.innerHeight - 100));
      win.style.left = x + "px";
      win.style.top = y + "px";
    });
    handle.addEventListener("pointerup", function () { dragging = false; });
  }

  // Ikon desktop + menu Start
  function renderLaunchers(filter) {
    var q = (filter || "").toLowerCase();
    iconsEl.innerHTML = "";
    startGrid.innerHTML = "";
    appList().forEach(function (a) {
      if (q && a.def.title.toLowerCase().indexOf(q) === -1) return;
      var icon = document.createElement("button");
      icon.className = "desk-icon";
      icon.innerHTML = '<span class="emoji">' + a.def.emoji + '</span><span>' + a.def.title + '</span>';
      icon.addEventListener("click", function () { openApp(a.id); });
      iconsEl.appendChild(icon);
      var s = document.createElement("button");
      s.className = "start-app";
      s.innerHTML = '<span class="emoji">' + a.def.emoji + '</span><span>' + a.def.title + '</span>';
      s.addEventListener("click", function () { openApp(a.id); });
      startGrid.appendChild(s);
    });
  }

  document.getElementById("start-btn").addEventListener("click", function () {
    startMenu.classList.toggle("hidden");
    if (!startMenu.classList.contains("hidden")) startSearch.focus();
  });
  startSearch.addEventListener("input", function () { renderLaunchers(startSearch.value); });
  document.addEventListener("click", function (e) {
    if (!startMenu.classList.contains("hidden") &&
        !e.target.closest("#start-menu") && !e.target.closest("#start-btn")) {
      startMenu.classList.add("hidden");
    }
  });

  // Jam WIB (Asia/Jakarta) — live tiap detik
  var timeFmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
  });
  var dateFmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric"
  });
  function tick() {
    var now = new Date();
    document.getElementById("clock-time").textContent = timeFmt.format(now);
    document.getElementById("clock-date").textContent = dateFmt.format(now);
  }
  tick();
  setInterval(tick, 1000);

  // Sesi login: tampilkan pengguna & tombol keluar di menu Start.
  try {
    var sessUser = sessionStorage.getItem("wd-session");
    var nameEl = document.getElementById("start-username");
    var logoutBtn = document.getElementById("logout-btn");
    if (nameEl) nameEl.textContent = sessUser ? "Masuk sebagai " + sessUser : "";
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      try { sessionStorage.removeItem("wd-session"); } catch (e) {}
      location.href = "login.html";
    });
  } catch (e) {}

  renderLaunchers("");
})();

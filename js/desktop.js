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
      '<button class="win-btn" data-act="max" title="Maximize">⛶</button>' +
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
    w.querySelector('[data-act="max"]').addEventListener("click", function () {
      toggleMax(w);
      var btn = w.querySelector('[data-act="max"]');
      btn.title = w._snapState === "max" ? "Restore" : "Maximize";
      btn.textContent = w._snapState === "max" ? "❐" : "⛶";
    });
    w.addEventListener("pointerdown", function () { focusWin(id); });
    makeDraggable(w, w.querySelector(".win-header"));
    windowsEl.appendChild(w);
    openWins[id] = w;
    focusWin(id);
    renderTaskbar();
    startMenu.classList.add("hidden");
  }

  // ---------- Maximize + snap kiri/kanan (ala Windows) ----------
  var TASKBAR_H = 52; // sama dengan tinggi #taskbar di CSS
  function workArea() {
    return { w: window.innerWidth, h: Math.max(0, window.innerHeight - TASKBAR_H) };
  }
  function saveRect(win) {
    win._prevRect = {
      left: win.style.left, top: win.style.top,
      width: win.style.width, height: win.style.height
    };
  }
  function restoreWin(win) {
    var r = win._prevRect;
    if (!r) return;
    win.style.left = r.left; win.style.top = r.top;
    win.style.width = r.width; win.style.height = r.height;
    win._prevRect = null; win._snapState = null;
    win.classList.remove("maximized");
    win.classList.remove("snapped-left");
    win.classList.remove("snapped-right");
  }
  function applyState(win, state) {
    // Simpan rect asal hanya sekali: dari snap ke maximize (atau sebaliknya)
    // restore tetap kembali ke ukuran/posisi semula, bukan ke keadaan snap.
    if (!win._snapState) saveRect(win);
    var a = workArea();
    win._snapState = state;
    win.classList.remove("maximized");
    win.classList.remove("snapped-left");
    win.classList.remove("snapped-right");
    if (state === "max") {
      win.classList.add("maximized");
      win.style.left = "0px"; win.style.top = "0px";
      win.style.width = a.w + "px"; win.style.height = a.h + "px";
    } else {
      win.classList.add(state === "left" ? "snapped-left" : "snapped-right");
      win.style.left = (state === "left" ? 0 : Math.floor(a.w / 2)) + "px";
      win.style.top = "0px";
      win.style.width = Math.floor(a.w / 2) + "px";
      win.style.height = a.h + "px";
    }
  }
  function toggleMax(win) {
    if (win._snapState === "max") restoreWin(win);
    else applyState(win, "max");
  }
  // Jendela maximize/snap mengikuti ukuran layar saat window di-resize.
  window.addEventListener("resize", function () {
    Object.keys(openWins).forEach(function (id) {
      var w = openWins[id];
      if (w._snapState) applyState(w, w._snapState);
    });
  });

  function makeDraggable(win, handle) {
    var dx = 0, dy = 0, dragging = false, startX = 0, startY = 0;
    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".win-btn")) return;
      startX = e.clientX; startY = e.clientY;
      // Jendela maximize/snap yang diseret: kembalikan dulu ke ukuran
      // semula, lalu letakkan di bawah kursor (seperti Windows).
      if (win._snapState) {
        var pw = parseInt(win._prevRect.width, 10) || 640;
        restoreWin(win);
        win.style.left = Math.max(0, e.clientX - Math.floor(pw / 2)) + "px";
        dx = Math.floor(pw / 2);
        dy = e.clientY - win.offsetTop;
      } else {
        dx = e.clientX - win.offsetLeft;
        dy = e.clientY - win.offsetTop;
      }
      dragging = true;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var x = Math.max(0, Math.min(e.clientX - dx, window.innerWidth - 120));
      var y = Math.max(0, Math.min(e.clientY - dy, window.innerHeight - 100));
      win.style.left = x + "px";
      win.style.top = y + "px";
    });
    handle.addEventListener("pointerup", function (e) {
      dragging = false;
      if (!e) return;
      // Snap hanya bila pointer benar-benar diseret (bukan klik biasa),
      // dan dilepas dalam 8px dari tepi layar: kiri/kanan = setengah
      // layar, atas = maximize.
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 5) return;
      if (e.clientX <= 8) applyState(win, "left");
      else if (e.clientX >= window.innerWidth - 8) applyState(win, "right");
      else if (e.clientY <= 8) applyState(win, "max");
    });
    handle.addEventListener("dblclick", function (e) {
      if (e.target.closest(".win-btn")) return;
      toggleMax(win);
    });
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

  // Pengaturan tersimpan (diatur lewat aplikasi Pengaturan): wallpaper & tema.
  try {
    var wallEl = document.getElementById("wallpaper");
    var savedWp = localStorage.getItem("wd-wallpaper");
    if (wallEl && savedWp && window.WALLPAPERS && window.WALLPAPERS[savedWp]) {
      wallEl.style.background = window.WALLPAPERS[savedWp].bg;
    }
    if (localStorage.getItem("wd-theme") === "light") {
      document.body.classList.add("light-theme");
    }
  } catch (e) {}

  // ---------- Notifikasi & pusat kontrol (taskbar) ----------
  // Notifikasi tersimpan di localStorage (wd-notifs); mode jangan-ganggu di wd-dnd.
  function notifStore(fallback) {
    try {
      var raw = localStorage.getItem("wd-notifs");
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function notifSave(list) {
    try { localStorage.setItem("wd-notifs", JSON.stringify(list)); } catch (e) { /* abaikan */ }
  }
  var notifs = notifStore([]);
  function isDnd() {
    try { return localStorage.getItem("wd-dnd") === "1"; } catch (e) { return false; }
  }
  function timeWIB() {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date());
  }
  var notifBtn = document.getElementById("notif-btn");
  var notifBadge = document.getElementById("notif-badge");
  var notifPanel = document.getElementById("notif-panel");
  var notifListEl = document.getElementById("notif-list");
  var toastWrap = document.getElementById("toast-wrap");

  function unreadCount() {
    return notifs.filter(function (n) { return !n.read; }).length;
  }
  function drawNotifs() {
    var unread = unreadCount();
    if (unread > 0) {
      notifBadge.textContent = unread > 9 ? "9+" : String(unread);
      notifBadge.classList.remove("hidden");
    } else {
      notifBadge.classList.add("hidden");
    }
    notifListEl.innerHTML = "";
    if (!notifs.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Belum ada notifikasi.";
      notifListEl.appendChild(empty);
      return;
    }
    notifs.slice().reverse().forEach(function (n) {
      var row = document.createElement("div");
      row.className = "notif-item" + (n.read ? "" : " unread");
      var t = document.createElement("span");
      t.className = "notif-text";
      t.textContent = n.text;
      var time = document.createElement("span");
      time.className = "notif-time";
      time.textContent = n.time;
      row.appendChild(t);
      row.appendChild(time);
      notifListEl.appendChild(row);
    });
  }
  function showToast(text) {
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    toast.addEventListener("click", function () { toast.remove(); });
    toastWrap.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4000);
  }
  function pushNotif(text, opts) {
    opts = opts || {};
    notifs.push({ text: text, time: timeWIB(), read: false });
    if (notifs.length > 30) notifs = notifs.slice(-30);
    notifSave(notifs);
    drawNotifs();
    if (!opts.silent && !isDnd()) showToast(text);
  }
  function markAllRead() {
    notifs.forEach(function (n) { n.read = true; });
    notifSave(notifs);
    drawNotifs();
  }
  notifBtn.addEventListener("click", function () {
    var willOpen = notifPanel.classList.contains("hidden");
    notifPanel.classList.toggle("hidden");
    startMenu.classList.add("hidden");
    if (willOpen) markAllRead();
  });
  document.addEventListener("click", function (e) {
    if (!notifPanel.classList.contains("hidden") &&
        !e.target.closest("#notif-panel") && !e.target.closest("#notif-btn")) {
      notifPanel.classList.add("hidden");
    }
  });
  document.getElementById("notif-clear").addEventListener("click", function () {
    notifs = [];
    notifSave(notifs);
    drawNotifs();
  });
  var ccTheme = document.getElementById("cc-theme");
  function refreshThemeBtn() {
    ccTheme.textContent = document.body.classList.contains("light-theme")
      ? "🌙 Ganti ke gelap" : "☀️ Ganti ke terang";
  }
  ccTheme.addEventListener("click", function () {
    var light = document.body.classList.toggle("light-theme");
    try { localStorage.setItem("wd-theme", light ? "light" : "dark"); } catch (e) {}
    refreshThemeBtn();
  });
  var ccDnd = document.getElementById("cc-dnd");
  function refreshDndBtn() {
    ccDnd.textContent = isDnd() ? "🔕 Jangan ganggu: aktif" : "🔔 Jangan ganggu: nonaktif";
  }
  ccDnd.addEventListener("click", function () {
    try { localStorage.setItem("wd-dnd", isDnd() ? "0" : "1"); } catch (e) {}
    refreshDndBtn();
  });
  document.getElementById("cc-settings").addEventListener("click", function () {
    notifPanel.classList.add("hidden");
    openApp("settings");
  });
  document.getElementById("cc-test").addEventListener("click", function () {
    pushNotif("Ini notifikasi tes dari pusat kontrol.");
  });
  refreshThemeBtn();
  refreshDndBtn();
  drawNotifs();
  if (!notifs.length) {
    pushNotif("Selamat datang di Rutbhics! Ketuk lonceng di taskbar untuk notifikasi & pusat kontrol.");
  }

  renderLaunchers("");
})();

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

  // ---------- Mode multi-bahasa (Indonesia/Inggris) ----------
  // Bahasa tersimpan di localStorage ("wd-lang"); bawaan Indonesia.
  // Tahap ini menerjemahkan shell desktop (tombol Start, menu Start,
  // taskbar, judul jendela, widget jam/kalender, panel notifikasi &
  // pusat kontrol). Isi dalam aplikasi masih Bahasa Indonesia.
  var LANGS = ["id", "en"];
  var lang = "id";
  try {
    var savedLang = localStorage.getItem("wd-lang");
    if (LANGS.indexOf(savedLang) !== -1) lang = savedLang;
  } catch (e) {}
  window.LANG = lang;
  var TITLES = {
    chat: { id: "Obrolan", en: "Chat" },
    browser: { id: "Peramban", en: "Browser" },
    notes: { id: "Catatan", en: "Notes" },
    calc: { id: "Kalkulator", en: "Calculator" },
    files: { id: "Files", en: "Files" },
    settings: { id: "Pengaturan", en: "Settings" },
    music: { id: "Musik", en: "Music" },
    terminal: { id: "Terminal", en: "Terminal" },
    gambar: { id: "Gambar", en: "Drawing" }
  };
  var DICT = {
    start: { id: "Mulai", en: "Start" },
    search: { id: "Cari aplikasi...", en: "Search apps..." },
    logout: { id: "Keluar", en: "Log out" },
    session: { id: "Masuk sebagai ", en: "Signed in as " },
    noNotifs: { id: "Belum ada notifikasi.", en: "No notifications yet." },
    testNotif: { id: "Ini notifikasi tes dari pusat kontrol.", en: "This is a test notification from the control center." },
    welcomeNotif: { id: "Selamat datang di Rutbhics! Ketuk lonceng di taskbar untuk notifikasi & pusat kontrol.", en: "Welcome to Rutbhics! Tap the bell in the taskbar for notifications & control center." },
    toDark: { id: "🌙 Ganti ke gelap", en: "🌙 Switch to dark" },
    toLight: { id: "☀️ Ganti ke terang", en: "☀️ Switch to light" },
    dndOn: { id: "🔕 Jangan ganggu: aktif", en: "🔕 Do not disturb: on" },
    dndOff: { id: "🔔 Jangan ganggu: nonaktif", en: "🔔 Do not disturb: off" },
    clearAll: { id: "Hapus semua", en: "Clear all" },
    notifTitle: { id: "Notifikasi", en: "Notifications" },
    ccTitle: { id: "Pusat kontrol", en: "Control center" },
    openSettings: { id: "Buka Pengaturan", en: "Open Settings" },
    sendTest: { id: "Kirim notifikasi tes", en: "Send test notification" },
    min: { id: "Minimize", en: "Minimize" },
    max: { id: "Maximize", en: "Maximize" },
    restore: { id: "Restore", en: "Restore" },
    close: { id: "Tutup", en: "Close" },
    todayBtn: { id: "Hari ini", en: "Today" },
    pickHint: { id: "Ketuk tanggal untuk memilih.", en: "Tap a date to select it." },
    picked: { id: "Dipilih: ", en: "Selected: " }
  };
  function localeFor() { return lang === "en" ? "en-US" : "id-ID"; }
  function t(key) { return (DICT[key] && DICT[key][lang]) || key; }
  function displayTitle(id) {
    return (TITLES[id] && TITLES[id][lang]) || (APPS[id] && APPS[id].title) || id;
  }

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
      b.textContent = APPS[id].emoji + " " + displayTitle(id);
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
      '<span class="win-title">' + displayTitle(id) + '</span>' +
      '<button class="win-btn" data-act="min" title="' + t("min") + '">—</button>' +
      '<button class="win-btn" data-act="max" title="' + t("max") + '">⛶</button>' +
      '<button class="win-btn close" data-act="close" title="' + t("close") + '">✕</button></div>' +
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
      btn.title = w._snapState === "max" ? t("restore") : t("max");
      btn.textContent = w._snapState === "max" ? "❐" : "⛶";
    });
    w.addEventListener("pointerdown", function () { focusWin(id); });
    makeDraggable(w, w.querySelector(".win-header"));
    makeResizable(w);
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

  // ---------- Resize tepi jendela (drag) ----------
  // Pegangan di tepi kanan, bawah, dan pojok kanan-bawah. Ukuran minimum
  // 320x240 (sama dengan min-width/min-height CSS); jendela tidak
  // diperbesar melewati area kerja. Jendela maximize/snap tidak bisa
  // di-resize (pegangan disembunyikan CSS + dijaga di sini).
  function makeResizable(win) {
    ["e", "s", "se"].forEach(function (mode) {
      var h = document.createElement("div");
      h.className = "win-resize " + mode;
      h.addEventListener("pointerdown", function (e) {
        if (win._snapState) return;
        e.preventDefault();
        var startW = win.offsetWidth, startH = win.offsetHeight;
        var startX = e.clientX, startY = e.clientY;
        var maxW = Math.max(320, window.innerWidth - win.offsetLeft);
        var maxH = Math.max(240, window.innerHeight - TASKBAR_H - win.offsetTop);
        try { h.setPointerCapture(e.pointerId); } catch (err) {}
        function onMove(ev) {
          var w = startW, hh = startH;
          if (mode === "e" || mode === "se") w = Math.max(320, Math.min(maxW, startW + ev.clientX - startX));
          if (mode === "s" || mode === "se") hh = Math.max(240, Math.min(maxH, startH + ev.clientY - startY));
          win.style.width = w + "px";
          win.style.height = hh + "px";
        }
        function onUp() {
          h.removeEventListener("pointermove", onMove);
          h.removeEventListener("pointerup", onUp);
        }
        h.addEventListener("pointermove", onMove);
        h.addEventListener("pointerup", onUp);
      });
      win.appendChild(h);
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
      icon.innerHTML = '<span class="emoji">' + a.def.emoji + '</span><span>' + displayTitle(a.id) + '</span>';
      icon.addEventListener("click", function () { openApp(a.id); });
      iconsEl.appendChild(icon);
      var s = document.createElement("button");
      s.className = "start-app";
      s.innerHTML = '<span class="emoji">' + a.def.emoji + '</span><span>' + displayTitle(a.id) + '</span>';
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
  var timeFmt = new Intl.DateTimeFormat(localeFor(), {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
  });
  var dateFmt = new Intl.DateTimeFormat(localeFor(), {
    timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric"
  });
  function tick() {
    var now = new Date();
    document.getElementById("clock-time").textContent = timeFmt.format(now);
    document.getElementById("clock-date").textContent = dateFmt.format(now);
    // Widget jam ikut diperbarui tiap detik (setelah widget dibuat di bawah).
    if (typeof widgetTimeEl !== "undefined" && widgetTimeEl) {
      widgetTimeEl.textContent = widgetTimeFmt.format(now);
      widgetDateEl.textContent = widgetDateFmt.format(now);
    }
  }
  tick();
  setInterval(tick, 1000);

  // ---------- Widget jam/kalender desktop ----------
  // Pojok kanan atas desktop (di bawah jendela, di atas wallpaper):
  // jam WIB live tiap detik + tanggal + kalender bulan berjalan.
  // Kalender bisa digeser bulan (◀ ▶), "Hari ini" kembali ke bulan
  // berjalan, dan tanggal bisa diketuk untuk dipilih.
  var widgetTimeFmt = new Intl.DateTimeFormat(localeFor(), {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  var widgetDateFmt = new Intl.DateTimeFormat(localeFor(), {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  var MONTHS = {
    id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
    en: ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"]
  };
  var DOW = {
    id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  };
  var widgetEl = document.createElement("section");
  widgetEl.id = "desktop-widget";
  var widgetTimeEl = document.createElement("div");
  widgetTimeEl.className = "widget-time";
  var widgetDateEl = document.createElement("div");
  widgetDateEl.className = "widget-date";
  var calHead = document.createElement("div");
  calHead.className = "cal-head";
  var calPrev = document.createElement("button");
  calPrev.className = "cal-nav"; calPrev.textContent = "◀";
  var calTitle = document.createElement("div");
  calTitle.className = "cal-title";
  var calNext = document.createElement("button");
  calNext.className = "cal-nav"; calNext.textContent = "▶";
  var calGrid = document.createElement("div");
  calGrid.className = "cal-grid";
  var calTodayBtn = document.createElement("button");
  calTodayBtn.className = "cal-nav widget-today"; calTodayBtn.textContent = t("todayBtn");
  var calSel = document.createElement("div");
  calSel.className = "widget-sel";
  calSel.textContent = t("pickHint");
  calHead.appendChild(calPrev); calHead.appendChild(calTitle); calHead.appendChild(calNext);
  widgetEl.appendChild(widgetTimeEl); widgetEl.appendChild(widgetDateEl);
  widgetEl.appendChild(calHead); widgetEl.appendChild(calGrid);
  widgetEl.appendChild(calTodayBtn); widgetEl.appendChild(calSel);
  document.body.appendChild(widgetEl);

  var calView = new Date(); calView.setDate(1);
  var calSelected = null;
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function renderCalendar() {
    var y = calView.getFullYear(), m = calView.getMonth();
    calTitle.textContent = MONTHS[lang][m] + " " + y;
    calGrid.innerHTML = "";
    var today = new Date();
    DOW[lang].forEach(function (d) {
      var h = document.createElement("div");
      h.className = "cal-dow"; h.textContent = d;
      calGrid.appendChild(h);
    });
    var firstDay = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    for (var i = 0; i < firstDay; i++) {
      var blank = document.createElement("span");
      blank.className = "cal-empty";
      calGrid.appendChild(blank);
    }
    for (var d = 1; d <= days; d++) {
      (function (day) {
        var b = document.createElement("button");
        b.className = "cal-day";
        b.textContent = String(day);
        var dt = new Date(y, m, day);
        if (sameDay(dt, today)) b.classList.add("today");
        if (calSelected && sameDay(dt, calSelected)) b.classList.add("selected");
        b.addEventListener("click", function () {
          calSelected = dt;
          calSel.textContent = t("picked") + widgetDateFmt.format(dt);
          renderCalendar();
        });
        calGrid.appendChild(b);
      })(d);
    }
  }
  calPrev.addEventListener("click", function () { calView.setMonth(calView.getMonth() - 1); renderCalendar(); });
  calNext.addEventListener("click", function () { calView.setMonth(calView.getMonth() + 1); renderCalendar(); });
  calTodayBtn.addEventListener("click", function () {
    calView = new Date(); calView.setDate(1);
    renderCalendar();
  });
  function updateWidgetClock() {
    var now = new Date();
    widgetTimeEl.textContent = widgetTimeFmt.format(now);
    widgetDateEl.textContent = widgetDateFmt.format(now);
  }
  updateWidgetClock();
  renderCalendar();

  // Sesi login: tampilkan pengguna & tombol keluar di menu Start.
  try {
    var sessUser = sessionStorage.getItem("wd-session");
    var nameEl = document.getElementById("start-username");
    var logoutBtn = document.getElementById("logout-btn");
    if (nameEl) nameEl.textContent = sessUser ? t("session") + sessUser : "";
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      // Cabut juga cookie sesi server bila ada (L7): pakai sendBeacon agar
      // request tidak gugur saat pindah halaman; fallback fetch keepalive.
      // Best-effort: gagal = abaikan, logout lokal tetap bersih, tanpa
      // error ke pengguna.
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon("/api/auth/logout");
        } else if (typeof fetch === "function") {
          fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(function () {});
        }
      } catch (e) {}
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
      empty.textContent = t("noNotifs");
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
      ? t("toDark") : t("toLight");
  }
  ccTheme.addEventListener("click", function () {
    var light = document.body.classList.toggle("light-theme");
    try { localStorage.setItem("wd-theme", light ? "light" : "dark"); } catch (e) {}
    refreshThemeBtn();
  });
  var ccDnd = document.getElementById("cc-dnd");
  function refreshDndBtn() {
    ccDnd.textContent = isDnd() ? t("dndOn") : t("dndOff");
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
    pushNotif(t("testNotif"));
  });
  refreshThemeBtn();
  refreshDndBtn();
  drawNotifs();
  if (!notifs.length) {
    pushNotif(t("welcomeNotif"));
  }

  // Terapkan bahasa: perbarui semua label shell + widget + jendela
  // yang sedang terbuka, lalu simpan pilihan. Dipanggil sekali saat
  // load dan setiap kali bahasa diganti (dari Pengaturan).
  function applyLang(next) {
    if (LANGS.indexOf(next) !== -1) lang = next;
    try { localStorage.setItem("wd-lang", lang); } catch (e) {}
    window.LANG = lang;
    try { if (document.documentElement) document.documentElement.lang = lang; } catch (e) {}
    var startBtn = document.getElementById("start-btn");
    if (startBtn) {
      startBtn.title = t("start");
      var lbl = document.getElementById("start-btn-label");
      if (lbl) lbl.textContent = t("start");
    }
    if (startSearch) startSearch.placeholder = t("search");
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.textContent = t("logout");
    var nt = document.getElementById("notif-title");
    if (nt) nt.textContent = t("notifTitle");
    var ct = document.getElementById("cc-title");
    if (ct) ct.textContent = t("ccTitle");
    var nc = document.getElementById("notif-clear");
    if (nc) nc.textContent = t("clearAll");
    var cs = document.getElementById("cc-settings");
    if (cs) cs.textContent = t("openSettings");
    var ctest = document.getElementById("cc-test");
    if (ctest) ctest.textContent = t("sendTest");
    var nameEl2 = document.getElementById("start-username");
    if (nameEl2 && typeof sessUser !== "undefined" && sessUser) {
      nameEl2.textContent = t("session") + sessUser;
    }
    // Format tanggal/waktu mengikuti locale bahasa.
    timeFmt = new Intl.DateTimeFormat(localeFor(), {
      timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
    });
    dateFmt = new Intl.DateTimeFormat(localeFor(), {
      timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric"
    });
    widgetTimeFmt = new Intl.DateTimeFormat(localeFor(), {
      timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    widgetDateFmt = new Intl.DateTimeFormat(localeFor(), {
      timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
    tick();
    if (typeof updateWidgetClock === "function") updateWidgetClock();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof calSel !== "undefined" && calSel) {
      calSel.textContent = calSelected ? t("picked") + widgetDateFmt.format(calSelected) : t("pickHint");
    }
    if (typeof calTodayBtn !== "undefined" && calTodayBtn) {
      calTodayBtn.textContent = t("todayBtn");
    }
    if (typeof refreshThemeBtn === "function") refreshThemeBtn();
    if (typeof refreshDndBtn === "function") refreshDndBtn();
    if (typeof drawNotifs === "function") drawNotifs();
    renderLaunchers("");
    renderTaskbar();
    // Judul + tombol jendela yang sedang terbuka.
    Object.keys(openWins).forEach(function (id) {
      var w = openWins[id];
      var titleEl = w.querySelector(".win-title");
      if (titleEl) titleEl.textContent = displayTitle(id);
      ["min", "max", "close"].forEach(function (act) {
        var b = w.querySelector('[data-act="' + act + '"]');
        if (!b) return;
        if (act === "max") b.title = w._snapState === "max" ? t("restore") : t("max");
        else b.title = t(act);
      });
    });
  }
  window.setLang = applyLang;

  applyLang(lang);
  renderLaunchers("");
})();

// Web Desktop — aplikasi bawaan: Obrolan, Peramban, Catatan, Kalkulator, Files, Pengaturan, Musik, Terminal, Gambar.
// Data Obrolan, Catatan, Files & Musik tersimpan di localStorage perangkat yang membuka web ini.
(function () {
  "use strict";

  function store(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* abaikan */ }
  }
  function el(html) {
    var t = document.createElement("div");
    t.innerHTML = html;
    return t.firstElementChild;
  }

  // ---------- Kamus isi aplikasi (Indonesia/Inggris) ----------
  // Bahasa dibaca dari window.LANG (diatur desktop.js) atau
  // localStorage "wd-lang". Teks aplikasi mengikuti bahasa saat
  // aplikasi dibuka; Pengaturan merender ulang seketika saat bahasa
  // diganti, aplikasi lain yang sudah terbuka perlu dibuka lagi.
  function langNow() {
    try {
      var l = (typeof window !== "undefined" && window.LANG) || localStorage.getItem("wd-lang") || "id";
      return l === "en" ? "en" : "id";
    } catch (e) { return "id"; }
  }
  var TR = {
    chatPlaceholder: { id: "Tulis pesan...", en: "Write a message..." },
    chatSend: { id: "Kirim", en: "Send" },
    chatHintOff: { id: "Kontak ini menjawab pakai AI Larprouter bila server lokal rutbhics + .env sudah disiapkan.", en: "This contact replies with Larprouter AI once the local rutbhics server + .env are set up." },
    chatHintOn: { id: "AI aktif (model {model}).", en: "AI is active (model {model})." },
    chatHintSetup: { id: "AI belum aktif — isi LARPROUTER_API_KEY di .env, lalu jalankan ulang rutbhics.", en: "AI is not active yet — put LARPROUTER_API_KEY in .env, then restart rutbhics." },
    chatNoFetch: { id: "Browser ini tidak mendukung fetch, jadi AI tidak bisa dihubungi.", en: "This browser does not support fetch, so the AI cannot be reached." },
    chatAiInactive: { id: "AI belum aktif: isi LARPROUTER_API_KEY di berkas .env (salin dari .env.example), lalu jalankan ulang rutbhics.", en: "AI is not active: put LARPROUTER_API_KEY in the .env file (copy from .env.example), then restart rutbhics." },
    chatAiFail: { id: "AI gagal: ", en: "AI failed: " },
    chatAiUnreach: { id: "AI gagal dihubungi (status {status}). Coba lagi nanti.", en: "AI could not be reached (status {status}). Try again later." },
    chatAiLocalOnly: { id: "AI hanya jalan lewat server lokal rutbhics (bukan halaman statis). Jalankan `rutbhics` di perangkat ini, pastikan .env sudah diisi, lalu buka lagi.", en: "AI only runs through the local rutbhics server (not a static page). Run `rutbhics` on this device, make sure .env is filled in, then reopen." },
    browserPlaceholder: { id: "Ketik alamat situs, mis. wikipedia.org", en: "Type a site address, e.g. wikipedia.org" },
    browserGo: { id: "Kunjungi", en: "Visit" },
    browserHint: { id: "Catatan: banyak situs besar (Google, YouTube, dll.) memblokir tampil di dalam frame, jadi halaman bisa tampak kosong. Itu batasan teknis browser, bukan bug aplikasi ini.", en: "Note: many big sites (Google, YouTube, etc.) block being shown inside a frame, so the page may look empty. That is a browser limitation, not a bug in this app." },
    notesPlaceholder: { id: "Tulis catatanmu di sini...", en: "Write your notes here..." },
    notesSave: { id: "Simpan", en: "Save" },
    notesSaved: { id: "Tersimpan ✓", en: "Saved ✓" },
    filesUp: { id: "↑ Naik", en: "↑ Up" },
    filesNewFolder: { id: "Folder Baru", en: "New Folder" },
    filesNewFile: { id: "Berkas Baru", en: "New File" },
    filesEmpty: { id: "Folder ini kosong. Buat folder atau berkas baru dari tombol di atas.", en: "This folder is empty. Create a new folder or file with the buttons above." },
    filesDelete: { id: "Hapus", en: "Delete" },
    filesSave: { id: "Simpan", en: "Save" },
    filesSaved: { id: "Tersimpan ✓", en: "Saved ✓" },
    filesNewFolderName: { id: "Folder baru", en: "New folder" },
    filesNewFileName: { id: "Berkas baru.txt", en: "New file.txt" },
    settingsTitle: { id: "Personalisasi desktop", en: "Personalize desktop" },
    settingsWallpaper: { id: "Wallpaper", en: "Wallpaper" },
    settingsTheme: { id: "Tema", en: "Theme" },
    settingsDark: { id: "🌙 Gelap", en: "🌙 Dark" },
    settingsLight: { id: "☀️ Terang", en: "☀️ Light" },
    settingsReset: { id: "Kembalikan bawaan", en: "Restore defaults" },
    settingsHint: { id: "Pengaturan tersimpan di perangkat ini dan langsung diterapkan saat desktop dibuka lagi.", en: "Settings are saved on this device and applied again when the desktop is reopened." },
    musicPlay: { id: "▶ Putar", en: "▶ Play" },
    musicPause: { id: "⏸ Jeda", en: "⏸ Pause" },
    musicVolume: { id: "Volume", en: "Volume" },
    musicAddPlaceholder: { id: "Tempel URL audio/video, mis. https://.../lagu.mp3", en: "Paste an audio/video URL, e.g. https://.../song.mp3" },
    musicAdd: { id: "Tambah", en: "Add" },
    musicDelete: { id: "Hapus", en: "Delete" },
    musicHint: { id: "Trek demo butuh internet. Trek tambahan tersimpan di perangkat ini.", en: "Demo tracks need internet. Extra tracks are saved on this device." },
    musicLoadError: { id: "Gagal memuat media ini. Periksa URL atau koneksi internet, lalu coba trek lain.", en: "Failed to load this media. Check the URL or internet connection, then try another track." },
    termPlaceholder: { id: "Ketik help untuk daftar perintah...", en: "Type help for a list of commands..." },
    termHint: { id: "Perintah semu saja — terminal ini tidak menjalankan program di perangkat.", en: "Pseudo-commands only — this terminal does not run programs on the device." },
    termWelcome: { id: "Selamat datang di Terminal Rutbhics! Ketik help untuk daftar perintah.", en: "Welcome to the Rutbhics Terminal! Type help for a list of commands." },
    termHelpTitle: { id: "Perintah yang tersedia:", en: "Available commands:" },
    termHelpHelp: { id: "  help   - tampilkan daftar perintah ini", en: "  help   - show this list of commands" },
    termHelpAbout: { id: "  about  - tentang Rutbhics", en: "  about  - about Rutbhics" },
    termHelpEcho: { id: "  echo   - tampilkan teks, mis. echo halo", en: "  echo   - print text, e.g. echo hello" },
    termHelpDate: { id: "  date   - tanggal & jam sekarang (WIB)", en: "  date   - current date & time (WIB)" },
    termHelpClear: { id: "  clear  - bersihkan layar terminal", en: "  clear  - clear the terminal screen" },
    termAbout1: { id: "Rutbhics — desktop komputer di dalam browser.", en: "Rutbhics — a computer desktop inside the browser." },
    termAbout2: { id: "Dibangun dengan HTML, CSS, dan JavaScript murni, tanpa framework.", en: "Built with pure HTML, CSS, and JavaScript, no frameworks." },
    termAbout3: { id: "Terminal ini hanya perintah semu: tidak menjalankan program atau mengakses berkas sistem.", en: "This terminal only has pseudo-commands: it does not run programs or access system files." },
    termNotFound: { id: "perintah tidak ditemukan: {name} — ketik help untuk daftar perintah.", en: "command not found: {name} — type help for a list of commands." },
    gambarEraser: { id: "🧽 Penghapus", en: "🧽 Eraser" },
    gambarThin: { id: "Tipis", en: "Thin" },
    gambarMedium: { id: "Sedang", en: "Medium" },
    gambarThick: { id: "Tebal", en: "Thick" },
    gambarClear: { id: "🗑 Hapus", en: "🗑 Clear" },
    gambarDownload: { id: "⬇ Unduh PNG", en: "⬇ Download PNG" },
    gambarAutoSave: { id: "Gambar tersimpan otomatis di perangkat ini.", en: "Drawings save automatically on this device." },
    gambarCleared: { id: "Kanvas dibersihkan dan tersimpan ✓", en: "Canvas cleared and saved ✓" },
    gambarSaved: { id: "Tersimpan ✓ (otomatis di perangkat ini)", en: "Saved ✓ (automatically on this device)" }
  };
  function tr(key) {
    var d = TR[key];
    return (d && d[langNow()]) || key;
  }

  // ---------- Obrolan (gaya WhatsApp, demo lokal) ----------
  var CONTACTS = [
    { id: "teman", name: { id: "Teman", en: "Friend" }, hello: { id: "Hai! Lagi ngapain?", en: "Hey! What are you up to?" } },
    { id: "grup", name: { id: "Grup Keluarga", en: "Family Group" }, hello: { id: "Selamat datang di grup keluarga!", en: "Welcome to the family group!" } },
    { id: "bot", name: { id: "Bot Asisten", en: "Assistant Bot" }, hello: { id: "Halo! Aku Bot Asisten Rutbhics. Tulis pesan, nanti aku balas.", en: "Hi! I'm the Rutbhics Assistant Bot. Write a message and I'll reply." } }
  ];
  // Persona AI per kontak Obrolan (dikirim sebagai system prompt ke /api/chat).
  // Catatan jujur: Teman & Grup Keluarga tetap BUKAN orang sungguhan — mereka
  // adalah persona AI. Chat antar pengguna beneran butuh backend server
  // (tahap berikutnya, belum dikerjakan).
  var PERSONAS = {
    id: {
      teman: "Kamu adalah Teman, teman akrab pengguna di aplikasi chat Rutbhics. Jawab santai seperti teman mengobrol, singkat, dan dalam Bahasa Indonesia.",
      grup: "Kamu adalah anggota Grup Keluarga di aplikasi chat Rutbhics. Jawab hangat seperti anggota keluarga yang mengobrol di grup, singkat, dan dalam Bahasa Indonesia.",
      bot: "Kamu adalah Bot Asisten di desktop Rutbhics. Jawab singkat, jelas, dan dalam Bahasa Indonesia."
    },
    en: {
      teman: "You are Teman, the user's close friend in the Rutbhics chat app. Reply casually like a friend chatting, briefly, and in English.",
      grup: "You are a member of the Family Group in the Rutbhics chat app. Reply warmly like a family member chatting in the group, briefly, and in English.",
      bot: "You are the Assistant Bot on the Rutbhics desktop. Reply briefly, clearly, and in English."
    }
  };
  function renderChat(body) {
    var data = store("wd-chat", {});
    CONTACTS.forEach(function (c) { if (!data[c.id]) data[c.id] = [{ from: "them", text: c.hello[langNow()] }]; });
    var active = CONTACTS[0].id;
    var wrap = el('<div class="chat-wrap"></div>');
    var listEl = el('<div class="chat-contacts"></div>');
    var mainEl = el('<div class="chat-main"></div>');
    var msgsEl = el('<div class="chat-msgs"></div>');
    var inputRow = el('<div class="chat-input"></div>');
    var input = el('<input type="text" placeholder="' + tr("chatPlaceholder") + '">');
    var send = el('<button class="btn-primary">' + tr("chatSend") + '</button>');
    inputRow.appendChild(input); inputRow.appendChild(send);
    // Hint status AI (semua kontak Obrolan memakai AI Larprouter).
    // Kunci API tidak pernah ada di browser: browser hanya memanggil
    // /api/chat di server lokal, kunci dibaca server dari .env.
    var botHint = tr("chatHintOff");
    var hintEl = el('<p class="hint bot-hint"></p>');
    mainEl.appendChild(msgsEl); mainEl.appendChild(inputRow); mainEl.appendChild(hintEl);
    wrap.appendChild(listEl); wrap.appendChild(mainEl);
    body.appendChild(wrap);

    function drawContacts() {
      listEl.innerHTML = "";
      CONTACTS.forEach(function (c) {
        var b = el('<button class="chat-contact' + (c.id === active ? " active" : "") + '">' + c.name[langNow()] + "</button>");
        b.addEventListener("click", function () { active = c.id; drawContacts(); drawMsgs(); });
        listEl.appendChild(b);
      });
    }
    function drawMsgs() {
      msgsEl.innerHTML = "";
      data[active].forEach(function (m) {
        var d = el('<div class="msg ' + (m.from === "me" ? "me" : "them") + '"></div>');
        d.textContent = m.text;
        msgsEl.appendChild(d);
      });
      msgsEl.scrollTop = msgsEl.scrollHeight;
      hintEl.textContent = botHint;
      hintEl.style.display = "";
    }
    function pushAI(text) {
      data[active].push({ from: "them", text: text });
      save("wd-chat", data);
      drawMsgs();
    }
    // Semua kontak Obrolan -> AI Larprouter lewat proxy server lokal
    // (/api/chat), masing-masing dengan persona-nya sendiri.
    function sendToAI() {
      var history = data[active].slice(-20).map(function (m) {
        return { role: m.from === "me" ? "user" : "assistant", content: m.text };
      });
      if (typeof fetch !== "function") {
        pushAI(tr("chatNoFetch"));
        return;
      }
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, system: PERSONAS[langNow()][active] })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      }).then(function (res) {
        if (res.ok && res.body && res.body.reply) { pushAI(res.body.reply); }
        else if (res.body && res.body.error === "bot_ai_tidak_aktif") {
          pushAI(tr("chatAiInactive"));
        }
        else if (res.body && res.body.message) { pushAI(tr("chatAiFail") + res.body.message); }
        else { pushAI(tr("chatAiUnreach").replace("{status}", res.status)); }
      }).catch(function () {
        pushAI(tr("chatAiLocalOnly"));
      });
    }
    function sendMsg() {
      var text = input.value.trim();
      if (!text) return;
      data[active].push({ from: "me", text: text });
      input.value = "";
      save("wd-chat", data);
      drawMsgs();
      sendToAI();
    }
    send.addEventListener("click", sendMsg);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") sendMsg(); });
    drawContacts();
    drawMsgs();
    // Status AI dari server lokal (diabaikan bila halaman dibuka statis).
    try {
      if (typeof fetch === "function") {
        fetch("/api/chat").then(function (r) { return r.json(); }).then(function (s) {
          if (s && s.active) botHint = tr("chatHintOn").replace("{model}", s.model);
          else botHint = tr("chatHintSetup");
          drawMsgs();
        }).catch(function () { /* tetap pakai hint bawaan */ });
      }
    } catch (e) { /* abaikan */ }
  }

  // ---------- Peramban ----------
  function renderBrowser(body) {
    var bar = el('<div class="browser-bar"></div>');
    var input = el('<input type="text" placeholder="' + tr("browserPlaceholder") + '">');
    var go = el('<button class="btn-primary">' + tr("browserGo") + '</button>');
    bar.appendChild(input); bar.appendChild(go);
    var links = el('<div class="quick-links"></div>');
    ["wikipedia.org", "openstreetmap.org", "example.com"].forEach(function (u) {
      var c = el('<button class="chip">' + u + "</button>");
      c.addEventListener("click", function () { openUrl(u); });
      links.appendChild(c);
    });
    var frame = el('<iframe class="browser-frame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>');
    var hint = el('<p class="hint"></p>');
    hint.textContent = tr("browserHint");
    body.appendChild(bar); body.appendChild(links); body.appendChild(frame); body.appendChild(hint);
    function openUrl(raw) {
      var u = raw.trim();
      if (!u) return;
      if (/\s/.test(u) || u.indexOf(".") === -1) {
        frame.src = "https://duckduckgo.com/?q=" + encodeURIComponent(u);
      } else {
        frame.src = /^https?:\/\//i.test(u) ? u : "https://" + u;
      }
      input.value = frame.src;
    }
    go.addEventListener("click", function () { openUrl(input.value); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") openUrl(input.value); });
    frame.src = "https://example.com";
  }

  // ---------- Catatan ----------
  function renderNotes(body) {
    var area = el('<textarea class="notes-area" placeholder="' + tr("notesPlaceholder") + '"></textarea>');
    area.value = store("wd-notes", "");
    var btn = el('<button class="btn-primary" style="margin-top:10px">' + tr("notesSave") + '</button>');
    var ok = el('<span class="hint" style="margin-left:10px"></span>');
    btn.addEventListener("click", function () {
      save("wd-notes", area.value);
      ok.textContent = tr("notesSaved");
      setTimeout(function () { ok.textContent = ""; }, 2000);
    });
    body.appendChild(area); body.appendChild(btn); body.appendChild(ok);
  }

  // ---------- Kalkulator ----------
  function renderCalc(body) {
    var disp = el('<div class="calc-display">0</div>');
    var grid = el('<div class="calc-grid"></div>');
    var cur = "0", prev = null, op = null, fresh = true;
    function show(v) { disp.textContent = v; }
    function compute() {
      var a = parseFloat(prev), b = parseFloat(cur);
      if (op === "+") return a + b;
      if (op === "-") return a - b;
      if (op === "×") return a * b;
      if (op === "÷") return b === 0 ? "Error" : a / b;
      return b;
    }
    function press(k) {
      if (/^[0-9.]$/.test(k)) {
        if (fresh) { cur = k === "." ? "0." : k; fresh = false; }
        else if (!(k === "." && cur.indexOf(".") !== -1)) { cur = cur === "0" && k !== "." ? k : cur + k; }
        show(cur);
      } else if (k === "C") {
        cur = "0"; prev = null; op = null; fresh = true; show(cur);
      } else if (k === "=") {
        if (op !== null) { cur = String(compute()); prev = null; op = null; fresh = true; show(cur); }
      } else {
        if (op !== null && !fresh) { cur = String(compute()); }
        prev = cur; op = k; fresh = true; show(cur);
      }
    }
    ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "C", "+", "="].forEach(function (k) {
      var b = el("<button>" + k + "</button>");
      if (["÷", "×", "-", "+"].indexOf(k) !== -1) b.className = "op";
      if (k === "=") b.className = "eq";
      b.addEventListener("click", function () { press(k); });
      grid.appendChild(b);
    });
    body.appendChild(disp); body.appendChild(grid);
  }

  // ---------- Files (penjelajah berkas virtual, data lokal) ----------
  // Struktur: { name, type: "folder"|"file", children: [], content: "" }
  function defaultFS() {
    var en = langNow() === "en";
    return {
      name: "", type: "folder", children: [
        { name: en ? "Documents" : "Dokumen", type: "folder", children: [
          { name: en ? "Welcome.txt" : "Selamat datang.txt", type: "file",
            content: en ? "Welcome to Rutbhics Files!\n\nThis is a virtual file explorer: folders and text files you create are saved on this device (localStorage), so they stay when the page is reopened.\n\nTry: create a new folder, create a new file, open a file to edit its contents, or delete what you don't need." : "Selamat datang di Files Rutbhics!\n\nIni penjelajah berkas virtual: folder dan berkas teks yang kamu buat tersimpan di perangkat ini (localStorage), jadi tetap ada saat halaman dibuka lagi.\n\nCoba: buat folder baru, buat berkas baru, buka berkas untuk mengedit isinya, atau hapus yang tidak perlu." },
          { name: en ? "About Rutbhics.txt" : "Tentang Rutbhics.txt", type: "file",
            content: en ? "Rutbhics is a desktop app inside the browser.\nBuilt with pure HTML, CSS, and JavaScript — no frameworks." : "Rutbhics adalah aplikasi desktop di dalam browser.\nDibangun dengan HTML, CSS, dan JavaScript murni — tanpa framework." }
        ]},
        { name: en ? "Pictures" : "Gambar", type: "folder", children: [] },
        { name: en ? "Music" : "Musik", type: "folder", children: [] }
      ]
    };
  }
  function renderFiles(body) {
    var root = store("wd-files", null) || defaultFS();
    if (!root.children) root = defaultFS();
    save("wd-files", root);
    var path = []; // array nama folder dari root
    var bar = el('<div class="files-bar"></div>');
    var pathEl = el('<span class="files-path">/</span>');
    var upBtn = el('<button class="chip">' + tr("filesUp") + '</button>');
    var newFolderBtn = el('<button class="btn-primary">' + tr("filesNewFolder") + '</button>');
    var newFileBtn = el('<button class="btn-primary">' + tr("filesNewFile") + '</button>');
    bar.appendChild(pathEl); bar.appendChild(upBtn);
    bar.appendChild(newFolderBtn); bar.appendChild(newFileBtn);
    var listEl = el('<div class="files-list"></div>');
    var viewEl = el('<div class="files-view"></div>');
    body.appendChild(bar); body.appendChild(listEl); body.appendChild(viewEl);

    function currentFolder() {
      var node = root;
      path.forEach(function (name) {
        var next = null;
        node.children.forEach(function (c) {
          if (c.type === "folder" && c.name === name) next = c;
        });
        if (next) node = next;
      });
      return node;
    }
    function persist() { save("wd-files", root); }
    function uniqueName(base, folder) {
      var name = base, i = 2;
      function exists(n) {
        return folder.children.some(function (c) { return c.name === n; });
      }
      while (exists(name)) { name = base + " (" + i + ")"; i += 1; }
      return name;
    }
    function draw() {
      var folder = currentFolder();
      pathEl.textContent = "/" + path.join("/");
      listEl.innerHTML = "";
      viewEl.innerHTML = "";
      if (!folder.children.length) {
        var empty = el('<p class="hint"></p>');
        empty.textContent = tr("filesEmpty");
        listEl.appendChild(empty);
        return;
      }
      folder.children.forEach(function (item) {
        var row = el('<div class="file-row"></div>');
        var icon = el('<span class="file-icon"></span>');
        icon.textContent = item.type === "folder" ? "📁" : "📄";
        var nameBtn = el('<button class="file-name"></button>');
        nameBtn.textContent = item.name;
        nameBtn.addEventListener("click", function () { openItem(item); });
        var del = el('<button class="chip">' + tr("filesDelete") + '</button>');
        del.addEventListener("click", function () {
          folder.children = folder.children.filter(function (c) { return c !== item; });
          persist(); draw();
        });
        row.appendChild(icon); row.appendChild(nameBtn); row.appendChild(del);
        listEl.appendChild(row);
      });
    }
    function openItem(item) {
      if (item.type === "folder") { path.push(item.name); draw(); return; }
      viewEl.innerHTML = "";
      var title = el('<p class="files-view-title"></p>');
      title.textContent = item.name;
      var area = el('<textarea class="files-editor"></textarea>');
      area.value = item.content || "";
      var saveBtn = el('<button class="btn-primary">' + tr("filesSave") + '</button>');
      var ok = el('<span class="hint" style="margin-left:10px"></span>');
      saveBtn.addEventListener("click", function () {
        item.content = area.value; persist();
        ok.textContent = tr("filesSaved");
        setTimeout(function () { ok.textContent = ""; }, 2000);
      });
      viewEl.appendChild(title); viewEl.appendChild(area);
      viewEl.appendChild(saveBtn); viewEl.appendChild(ok);
    }
    upBtn.addEventListener("click", function () {
      if (path.length) { path.pop(); draw(); }
    });
    newFolderBtn.addEventListener("click", function () {
      var folder = currentFolder();
      var name = uniqueName(tr("filesNewFolderName"), folder);
      folder.children.push({ name: name, type: "folder", children: [] });
      persist(); draw();
    });
    newFileBtn.addEventListener("click", function () {
      var folder = currentFolder();
      var name = uniqueName(tr("filesNewFileName"), folder);
      folder.children.push({ name: name, type: "file", content: "" });
      persist(); draw();
    });
    draw();
  }

  // ---------- Pengaturan (wallpaper & tema, tersimpan lokal) ----------
  // Kunci wd-wallpaper / wd-theme disimpan sebagai string mentah (bukan JSON),
  // supaya desktop.js bisa membacanya langsung dengan getItem.
  var WALLPAPERS = {
    malam: { name: { id: "Ungu Malam", en: "Purple Night" },
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(99, 102, 241, .45), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(34, 211, 238, .30), transparent 60%), linear-gradient(160deg, #0f172a, #1e1b4b 55%, #0b1120)" },
    senja: { name: { id: "Senja Jingga", en: "Orange Dusk" },
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(251, 146, 60, .45), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(244, 63, 94, .30), transparent 60%), linear-gradient(160deg, #431407, #7c2d12 55%, #1c1917)" },
    hutan: { name: { id: "Hutan Hijau", en: "Green Forest" },
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(52, 211, 153, .40), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(163, 230, 53, .25), transparent 60%), linear-gradient(160deg, #052e16, #14532d 55%, #022c22)" },
    laut: { name: { id: "Laut Biru", en: "Blue Sea" },
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(56, 189, 248, .45), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(45, 212, 191, .30), transparent 60%), linear-gradient(160deg, #082f49, #0c4a6e 55%, #020617)" }
  };
  window.WALLPAPERS = WALLPAPERS;
  function applyWallpaper(id) {
    var w = document.getElementById("wallpaper");
    var p = WALLPAPERS[id];
    if (w && p) w.style.background = p.bg;
  }
  function applyTheme(theme) {
    document.body.classList.toggle("light-theme", theme === "light");
  }
  function renderSettings(body) {
    var curWp = "malam", curTheme = "dark";
    try {
      curWp = localStorage.getItem("wd-wallpaper") || "malam";
      curTheme = localStorage.getItem("wd-theme") || "dark";
    } catch (e) {}
    if (!WALLPAPERS[curWp]) curWp = "malam";

    body.appendChild(el('<h3 class="settings-title">' + tr("settingsTitle") + '</h3>'));
    body.appendChild(el('<p class="settings-head">' + tr("settingsWallpaper") + '</p>'));
    var grid = el('<div class="wp-grid"></div>');
    Object.keys(WALLPAPERS).forEach(function (id) {
      var b = el('<button class="wp-swatch' + (id === curWp ? " active" : "") + '"></button>');
      b.style.background = WALLPAPERS[id].bg;
      b.title = WALLPAPERS[id].name[langNow()];
      var lbl = el('<span class="wp-label"></span>');
      lbl.textContent = WALLPAPERS[id].name[langNow()];
      b.appendChild(lbl);
      b.addEventListener("click", function () {
        curWp = id;
        try { localStorage.setItem("wd-wallpaper", id); } catch (e) {}
        applyWallpaper(id);
        grid.querySelectorAll(".wp-swatch").forEach(function (s) { s.classList.remove("active"); });
        b.classList.add("active");
      });
      grid.appendChild(b);
    });
    body.appendChild(grid);

    body.appendChild(el('<p class="settings-head">' + tr("settingsTheme") + '</p>'));
    var row = el('<div class="theme-row"></div>');
    var darkBtn = el('<button class="chip theme-btn' + (curTheme === "dark" ? " active" : "") + '">' + tr("settingsDark") + '</button>');
    var lightBtn = el('<button class="chip theme-btn' + (curTheme === "light" ? " active" : "") + '">' + tr("settingsLight") + '</button>');
    function setTheme(t) {
      curTheme = t;
      try { localStorage.setItem("wd-theme", t); } catch (e) {}
      applyTheme(t);
      darkBtn.classList.toggle("active", t === "dark");
      lightBtn.classList.toggle("active", t === "light");
    }
    darkBtn.addEventListener("click", function () { setTheme("dark"); });
    lightBtn.addEventListener("click", function () { setTheme("light"); });
    row.appendChild(darkBtn); row.appendChild(lightBtn);
    body.appendChild(row);

    // Bahasa (Indonesia/Inggris, tersimpan lokal). Diterapkan oleh
    // desktop.js (window.setLang); panel ini dirender ulang seketika
    // dalam bahasa baru, aplikasi lain yang sudah terbuka perlu
    // dibuka lagi.
    body.appendChild(el('<p class="settings-head">Bahasa / Language</p>'));
    var langRow = el('<div class="theme-row"></div>');
    var curLang = "id";
    try { curLang = window.LANG || localStorage.getItem("wd-lang") || "id"; } catch (e) {}
    if (curLang !== "id" && curLang !== "en") curLang = "id";
    var idBtn = el('<button class="chip theme-btn' + (curLang === "id" ? " active" : "") + '">🇮🇩 Indonesia</button>');
    var enBtn = el('<button class="chip theme-btn' + (curLang === "en" ? " active" : "") + '">🇬🇧 English</button>');
    function setLangUI(l) {
      if (typeof window.setLang === "function") window.setLang(l);
      idBtn.classList.toggle("active", l === "id");
      enBtn.classList.toggle("active", l === "en");
      body.innerHTML = "";
      renderSettings(body);
    }
    idBtn.addEventListener("click", function () { setLangUI("id"); });
    enBtn.addEventListener("click", function () { setLangUI("en"); });
    langRow.appendChild(idBtn); langRow.appendChild(enBtn);
    body.appendChild(langRow);

    var reset = el('<button class="btn-primary" style="margin-top:18px">' + tr("settingsReset") + '</button>');
    reset.addEventListener("click", function () {
      try { localStorage.removeItem("wd-wallpaper"); localStorage.removeItem("wd-theme"); } catch (e) {}
      applyWallpaper("malam");
      setTheme("dark");
      var sw = grid.querySelectorAll(".wp-swatch");
      sw.forEach(function (s) { s.classList.remove("active"); });
      if (sw[0]) sw[0].classList.add("active");
    });
    body.appendChild(reset);
    body.appendChild(el('<p class="hint">' + tr("settingsHint") + '</p>'));
  }

  // ---------- Musik (player audio & video mini) ----------
  // Trek demo diputar dari URL publik (butuh internet). Trek tambahan
  // (URL audio/video apa pun) tersimpan di localStorage perangkat.
  var DEMO_TRACKS = [
    { title: "SoundHelix Song 1 (demo)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", type: "audio" },
    { title: "SoundHelix Song 2 (demo)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", type: "audio" },
    { title: "Flower — demo video (MDN)", url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", type: "video" }
  ];
  function guessType(url) {
    var u = url.split("?")[0].toLowerCase();
    if (/\.(mp4|webm|mov|mkv)$/.test(u)) return "video";
    return "audio";
  }
  function fmtTime(s) {
    if (!isFinite(s)) return "0:00";
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  function renderMusic(body) {
    var custom = store("wd-music", []);
    if (!Array.isArray(custom)) custom = [];
    var tracks = DEMO_TRACKS.concat(custom);
    var current = 0;
    var media = null; // elemen <audio> atau <video> yang sedang aktif

    var stage = el('<div class="music-stage"></div>');
    var titleEl = el('<p class="music-title"></p>');
    var audioEl = el('<audio class="music-media" preload="metadata"></audio>');
    var videoEl = el('<video class="music-media hidden" preload="metadata"></video>');
    stage.appendChild(titleEl);
    stage.appendChild(audioEl);
    stage.appendChild(videoEl);
    var errEl = el('<p class="music-error hidden"></p>');
    stage.appendChild(errEl);

    var controls = el('<div class="music-controls"></div>');
    var prevBtn = el('<button class="chip">⏮</button>');
    var playBtn = el('<button class="btn-primary">' + tr("musicPlay") + '</button>');
    var nextBtn = el('<button class="chip">⏭</button>');
    var timeEl = el('<span class="music-time">0:00 / 0:00</span>');
    controls.appendChild(prevBtn); controls.appendChild(playBtn);
    controls.appendChild(nextBtn); controls.appendChild(timeEl);

    var seek = el('<input class="music-seek" type="range" min="0" max="100" value="0">');
    var volRow = el('<div class="music-volrow"></div>');
    var volLabel = el('<span class="hint" style="margin:0">' + tr("musicVolume") + '</span>');
    var vol = el('<input class="music-vol" type="range" min="0" max="100" value="80">');
    volRow.appendChild(volLabel); volRow.appendChild(vol);

    var listEl = el('<div class="music-list"></div>');

    var addRow = el('<div class="music-add"></div>');
    var urlInput = el('<input type="text" placeholder="' + tr("musicAddPlaceholder") + '">');
    var addBtn = el('<button class="btn-primary">' + tr("musicAdd") + '</button>');
    addRow.appendChild(urlInput); addRow.appendChild(addBtn);

    body.appendChild(stage); body.appendChild(controls);
    body.appendChild(seek); body.appendChild(volRow);
    body.appendChild(listEl); body.appendChild(addRow);
    body.appendChild(el('<p class="hint">' + tr("musicHint") + '</p>'));

    function currentTrack() { return tracks[current]; }
    function tryPlay() {
      if (!media) return;
      try {
        var p = media.play();
        if (p && p.then) {
          p.then(function () { playBtn.textContent = tr("musicPause"); }).catch(function () {});
        } else {
          playBtn.textContent = tr("musicPause");
        }
      } catch (e) { /* abaikan: pengguna bisa menekan Putar */ }
    }
    function setMedia() {
      audioEl.pause();
      videoEl.pause();
      var t = currentTrack();
      var isVideo = t.type === "video";
      audioEl.classList.toggle("hidden", isVideo);
      videoEl.classList.toggle("hidden", !isVideo);
      media = isVideo ? videoEl : audioEl;
      media.src = t.url;
      media.volume = vol.value / 100;
      titleEl.textContent = (isVideo ? "🎬 " : "🎵 ") + t.title;
      errEl.classList.add("hidden");
      playBtn.textContent = tr("musicPlay");
      seek.value = 0;
      timeEl.textContent = "0:00 / 0:00";
      drawList();
    }
    function playTrack(i) {
      current = (i + tracks.length) % tracks.length;
      setMedia();
      tryPlay();
    }
    function drawList() {
      listEl.innerHTML = "";
      tracks.forEach(function (t, i) {
        var row = el('<div class="music-row' + (i === current ? " active" : "") + '"></div>');
        var name = el('<button class="music-name"></button>');
        name.textContent = (t.type === "video" ? "🎬 " : "🎵 ") + t.title;
        name.addEventListener("click", function () { playTrack(i); });
        row.appendChild(name);
        if (i >= DEMO_TRACKS.length) {
          var del = el('<button class="chip">' + tr("musicDelete") + '</button>');
          del.addEventListener("click", function () {
            custom = custom.filter(function (c) { return c.url !== t.url; });
            save("wd-music", custom);
            tracks = DEMO_TRACKS.concat(custom);
            if (current >= tracks.length) current = tracks.length - 1;
            setMedia();
          });
          row.appendChild(del);
        }
        listEl.appendChild(row);
      });
    }
    function bindMediaEvents(m) {
      m.addEventListener("timeupdate", function () {
        if (m.duration) seek.value = Math.floor(m.currentTime / m.duration * 100);
        timeEl.textContent = fmtTime(m.currentTime) + " / " + fmtTime(m.duration);
      });
      m.addEventListener("loadedmetadata", function () {
        timeEl.textContent = fmtTime(m.currentTime) + " / " + fmtTime(m.duration);
      });
      m.addEventListener("ended", function () { playTrack(current + 1); });
      m.addEventListener("error", function () {
        errEl.textContent = tr("musicLoadError");
        errEl.classList.remove("hidden");
        playBtn.textContent = tr("musicPlay");
      });
    }
    bindMediaEvents(audioEl);
    bindMediaEvents(videoEl);

    playBtn.addEventListener("click", function () {
      if (!media) return;
      if (media.paused) {
        tryPlay();
      } else {
        media.pause();
        playBtn.textContent = tr("musicPlay");
      }
    });
    prevBtn.addEventListener("click", function () { playTrack(current - 1); });
    nextBtn.addEventListener("click", function () { playTrack(current + 1); });
    seek.addEventListener("input", function () {
      if (media && media.duration) media.currentTime = seek.value / 100 * media.duration;
    });
    vol.addEventListener("input", function () {
      if (media) media.volume = vol.value / 100;
    });
    addBtn.addEventListener("click", function () {
      var url = urlInput.value.trim();
      if (!url) return;
      var title = url.split("/").pop().split("?")[0] || url;
      try { title = decodeURIComponent(title); } catch (e) {}
      custom.push({ title: title, url: url, type: guessType(url) });
      save("wd-music", custom);
      tracks = DEMO_TRACKS.concat(custom);
      urlInput.value = "";
      drawList();
    });
    urlInput.addEventListener("keydown", function (e) { if (e.key === "Enter") addBtn.click(); });

    setMedia();
  }

  // ---------- Terminal (perintah semu, tanpa akses sistem) ----------
  // Hanya 5 perintah: help, about, echo, date, clear. Tidak menjalankan
  // program apa pun dan tidak membaca/menulis berkas di perangkat.
  function renderTerminal(body) {
    var wrap = el('<div class="term-wrap"></div>');
    var out = el('<div class="term-output"></div>');
    var row = el('<div class="term-input-row"></div>');
    var prompt = el('<span class="term-prompt">rutbhics:~$</span>');
    var input = el('<input class="term-input" type="text" placeholder="' + tr("termPlaceholder") + '">');
    row.appendChild(prompt); row.appendChild(input);
    wrap.appendChild(out); wrap.appendChild(row);
    body.appendChild(wrap);
    body.appendChild(el('<p class="hint">' + tr("termHint") + '</p>'));

    var history = [];
    var histIdx = 0;

    function print(text) {
      var line = el('<div class="term-line"></div>');
      line.textContent = text;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }
    function printCmd(cmd) {
      var line = el('<div class="term-line term-cmd"></div>');
      line.textContent = "rutbhics:~$ " + cmd;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }
    function wibDate() {
      try {
        return new Intl.DateTimeFormat(langNow() === "en" ? "en-US" : "id-ID", {
          timeZone: "Asia/Jakarta", weekday: "long", day: "numeric",
          month: "long", year: "numeric", hour: "2-digit",
          minute: "2-digit", second: "2-digit", hour12: false
        }).format(new Date()) + " WIB";
      } catch (e) { return new Date().toString(); }
    }
    function run(raw) {
      var cmd = raw.trim();
      if (!cmd) return;
      printCmd(cmd);
      var parts = cmd.split(/\s+/);
      var name = parts[0].toLowerCase();
      var arg = parts.slice(1).join(" ");
      if (name === "help") {
        print(tr("termHelpTitle"));
        print(tr("termHelpHelp"));
        print(tr("termHelpAbout"));
        print(tr("termHelpEcho"));
        print(tr("termHelpDate"));
        print(tr("termHelpClear"));
      } else if (name === "about") {
        print(tr("termAbout1"));
        print(tr("termAbout2"));
        print(tr("termAbout3"));
      } else if (name === "echo") {
        print(arg);
      } else if (name === "date") {
        print(wibDate());
      } else if (name === "clear") {
        out.innerHTML = "";
      } else {
        print(tr("termNotFound").replace("{name}", name));
      }
    }

    print(tr("termWelcome"));
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var v = input.value;
        if (v.trim()) { history.push(v); histIdx = history.length; }
        input.value = "";
        run(v);
      } else if (e.key === "ArrowUp") {
        if (history.length && histIdx > 0) {
          histIdx -= 1;
          input.value = history[histIdx];
        }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (histIdx < history.length - 1) {
          histIdx += 1;
          input.value = history[histIdx];
        } else {
          histIdx = history.length;
          input.value = "";
        }
        e.preventDefault();
      }
    });
    wrap.addEventListener("click", function () { input.focus(); });
    input.focus();
  }

  // ---------- Gambar (kanvas coret-coret + simpan) ----------
  // Gambar tersimpan otomatis di localStorage ("wd-gambar", data URL PNG)
  // setiap goresan selesai, jadi tidak hilang saat jendela ditutup.
  // Tombol Unduh menyimpan PNG ke perangkat lewat tautan unduhan.
  function renderGambar(body) {
    var wrap = el('<div class="gambar-wrap"></div>');
    var tools = el('<div class="gambar-tools"></div>');
    var canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 500;
    canvas.className = "gambar-canvas";
    var ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var status = el('<p class="hint">' + tr("gambarAutoSave") + '</p>');

    var color = "#111111";
    var size = 4;
    var erasing = false;

    function mkBtn(text, cls) {
      var b = document.createElement("button");
      b.className = cls || "gambar-btn";
      b.textContent = text;
      tools.appendChild(b);
      return b;
    }
    function markActive(group, active) {
      group.forEach(function (b) { b.classList.toggle("active", b === active); });
    }
    var colorBtns = ["#111111", "#ef4444", "#22c55e", "#3b82f6", "#eab308", "#ffffff"].map(function (c) {
      var b = document.createElement("button");
      b.className = "gambar-color";
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", function () {
        color = c; erasing = false;
        markActive(colorBtns, b);
        markActive([eraserBtn], null);
      });
      tools.appendChild(b);
      return b;
    });
    markActive(colorBtns, colorBtns[0]);
    var eraserBtn = mkBtn(tr("gambarEraser"), "gambar-btn");
    eraserBtn.addEventListener("click", function () {
      erasing = true;
      markActive(colorBtns, null);
      markActive([eraserBtn], eraserBtn);
    });
    var sizeBtns = [[2, tr("gambarThin")], [5, tr("gambarMedium")], [12, tr("gambarThick")]].map(function (s) {
      var b = mkBtn(s[1], "gambar-btn");
      b.addEventListener("click", function () {
        size = s[0];
        markActive(sizeBtns, b);
      });
      return b;
    });
    markActive(sizeBtns, sizeBtns[1]);
    var clearBtn = mkBtn(tr("gambarClear"), "gambar-btn");
    clearBtn.addEventListener("click", function () {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      save("wd-gambar", canvas.toDataURL("image/png"));
      status.textContent = tr("gambarCleared");
    });
    var dlBtn = mkBtn(tr("gambarDownload"), "btn-primary");
    dlBtn.addEventListener("click", function () {
      var a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "gambar.png";
      a.click();
    });

    var saved = store("wd-gambar", null);
    if (saved) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0); };
      img.src = saved;
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    var drawing = false, lastX = 0, lastY = 0;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
      };
    }
    canvas.addEventListener("pointerdown", function (e) {
      drawing = true;
      var p = pos(e);
      lastX = p.x; lastY = p.y;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.strokeStyle = erasing ? "#ffffff" : color;
      ctx.lineWidth = size;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    });
    function endStroke() {
      if (!drawing) return;
      drawing = false;
      save("wd-gambar", canvas.toDataURL("image/png"));
      status.textContent = tr("gambarSaved");
    }
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);

    wrap.appendChild(tools);
    wrap.appendChild(canvas);
    wrap.appendChild(status);
    body.appendChild(wrap);
  }

  window.APPS = {
    chat: { emoji: "💬", title: "Obrolan", render: renderChat },
    browser: { emoji: "🌐", title: "Peramban", render: renderBrowser },
    notes: { emoji: "📝", title: "Catatan", render: renderNotes },
    calc: { emoji: "🧮", title: "Kalkulator", render: renderCalc },
    files: { emoji: "📁", title: "Files", render: renderFiles },
    settings: { emoji: "⚙️", title: "Pengaturan", render: renderSettings },
    music: { emoji: "🎵", title: "Musik", render: renderMusic },
    terminal: { emoji: "💻", title: "Terminal", render: renderTerminal },
    gambar: { emoji: "🎨", title: "Gambar", render: renderGambar }
  };
})();


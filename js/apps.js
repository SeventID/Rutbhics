// Web Desktop — aplikasi bawaan: Obrolan, Peramban, Catatan, Kalkulator, Files, Pengaturan, Musik.
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

  // ---------- Obrolan (gaya WhatsApp, demo lokal) ----------
  var CONTACTS = [
    { id: "teman", name: "Teman", hello: "Hai! Lagi ngapain?" },
    { id: "grup", name: "Grup Keluarga", hello: "Selamat datang di grup keluarga!" },
    { id: "bot", name: "Bot Asisten", hello: "Halo! Aku bot demo. Tulis pesan, nanti aku balas." }
  ];
  var REPLIES = ["Siap, noted!", "Oke, lanjut!", "Haha, bener juga.", "Menarik, ceritain lagi dong.", "Otw!"];
  function renderChat(body) {
    var data = store("wd-chat", {});
    CONTACTS.forEach(function (c) { if (!data[c.id]) data[c.id] = [{ from: "them", text: c.hello }]; });
    var active = CONTACTS[0].id;
    var wrap = el('<div class="chat-wrap"></div>');
    var listEl = el('<div class="chat-contacts"></div>');
    var mainEl = el('<div class="chat-main"></div>');
    var msgsEl = el('<div class="chat-msgs"></div>');
    var inputRow = el('<div class="chat-input"></div>');
    var input = el('<input type="text" placeholder="Tulis pesan...">');
    var send = el('<button class="btn-primary">Kirim</button>');
    inputRow.appendChild(input); inputRow.appendChild(send);
    mainEl.appendChild(msgsEl); mainEl.appendChild(inputRow);
    wrap.appendChild(listEl); wrap.appendChild(mainEl);
    body.appendChild(wrap);

    function drawContacts() {
      listEl.innerHTML = "";
      CONTACTS.forEach(function (c) {
        var b = el('<button class="chat-contact' + (c.id === active ? " active" : "") + '">' + c.name + "</button>");
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
    }
    function sendMsg() {
      var text = input.value.trim();
      if (!text) return;
      data[active].push({ from: "me", text: text });
      input.value = "";
      save("wd-chat", data);
      drawMsgs();
      var reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      setTimeout(function () {
        data[active].push({ from: "them", text: reply });
        save("wd-chat", data);
        drawMsgs();
      }, 900);
    }
    send.addEventListener("click", sendMsg);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") sendMsg(); });
    drawContacts();
    drawMsgs();
  }

  // ---------- Peramban ----------
  function renderBrowser(body) {
    var bar = el('<div class="browser-bar"></div>');
    var input = el('<input type="text" placeholder="Ketik alamat situs, mis. wikipedia.org">');
    var go = el('<button class="btn-primary">Kunjungi</button>');
    bar.appendChild(input); bar.appendChild(go);
    var links = el('<div class="quick-links"></div>');
    ["wikipedia.org", "openstreetmap.org", "example.com"].forEach(function (u) {
      var c = el('<button class="chip">' + u + "</button>");
      c.addEventListener("click", function () { openUrl(u); });
      links.appendChild(c);
    });
    var frame = el('<iframe class="browser-frame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>');
    var hint = el('<p class="hint">Catatan: banyak situs besar (Google, YouTube, dll.) memblokir tampil di dalam frame, jadi halaman bisa tampak kosong. Itu batasan teknis browser, bukan bug aplikasi ini.</p>');
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
    var area = el('<textarea class="notes-area" placeholder="Tulis catatanmu di sini..."></textarea>');
    area.value = store("wd-notes", "");
    var btn = el('<button class="btn-primary" style="margin-top:10px">Simpan</button>');
    var ok = el('<span class="hint" style="margin-left:10px"></span>');
    btn.addEventListener("click", function () {
      save("wd-notes", area.value);
      ok.textContent = "Tersimpan ✓";
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
    return {
      name: "", type: "folder", children: [
        { name: "Dokumen", type: "folder", children: [
          { name: "Selamat datang.txt", type: "file",
            content: "Selamat datang di Files Rutbhics!\n\nIni penjelajah berkas virtual: folder dan berkas teks yang kamu buat tersimpan di perangkat ini (localStorage), jadi tetap ada saat halaman dibuka lagi.\n\nCoba: buat folder baru, buat berkas baru, buka berkas untuk mengedit isinya, atau hapus yang tidak perlu." },
          { name: "Tentang Rutbhics.txt", type: "file",
            content: "Rutbhics adalah aplikasi desktop di dalam browser.\nDibangun dengan HTML, CSS, dan JavaScript murni — tanpa framework." }
        ]},
        { name: "Gambar", type: "folder", children: [] },
        { name: "Musik", type: "folder", children: [] }
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
    var upBtn = el('<button class="chip">↑ Naik</button>');
    var newFolderBtn = el('<button class="btn-primary">Folder Baru</button>');
    var newFileBtn = el('<button class="btn-primary">Berkas Baru</button>');
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
        var empty = el('<p class="hint">Folder ini kosong. Buat folder atau berkas baru dari tombol di atas.</p>');
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
        var del = el('<button class="chip">Hapus</button>');
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
      var saveBtn = el('<button class="btn-primary">Simpan</button>');
      var ok = el('<span class="hint" style="margin-left:10px"></span>');
      saveBtn.addEventListener("click", function () {
        item.content = area.value; persist();
        ok.textContent = "Tersimpan ✓";
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
      var name = uniqueName("Folder baru", folder);
      folder.children.push({ name: name, type: "folder", children: [] });
      persist(); draw();
    });
    newFileBtn.addEventListener("click", function () {
      var folder = currentFolder();
      var name = uniqueName("Berkas baru.txt", folder);
      folder.children.push({ name: name, type: "file", content: "" });
      persist(); draw();
    });
    draw();
  }

  // ---------- Pengaturan (wallpaper & tema, tersimpan lokal) ----------
  // Kunci wd-wallpaper / wd-theme disimpan sebagai string mentah (bukan JSON),
  // supaya desktop.js bisa membacanya langsung dengan getItem.
  var WALLPAPERS = {
    malam: { name: "Ungu Malam",
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(99, 102, 241, .45), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(34, 211, 238, .30), transparent 60%), linear-gradient(160deg, #0f172a, #1e1b4b 55%, #0b1120)" },
    senja: { name: "Senja Jingga",
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(251, 146, 60, .45), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(244, 63, 94, .30), transparent 60%), linear-gradient(160deg, #431407, #7c2d12 55%, #1c1917)" },
    hutan: { name: "Hutan Hijau",
      bg: "radial-gradient(600px 400px at 20% 15%, rgba(52, 211, 153, .40), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(163, 230, 53, .25), transparent 60%), linear-gradient(160deg, #052e16, #14532d 55%, #022c22)" },
    laut: { name: "Laut Biru",
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

    body.appendChild(el('<h3 class="settings-title">Personalisasi desktop</h3>'));
    body.appendChild(el('<p class="settings-head">Wallpaper</p>'));
    var grid = el('<div class="wp-grid"></div>');
    Object.keys(WALLPAPERS).forEach(function (id) {
      var b = el('<button class="wp-swatch' + (id === curWp ? " active" : "") + '"></button>');
      b.style.background = WALLPAPERS[id].bg;
      b.title = WALLPAPERS[id].name;
      var lbl = el('<span class="wp-label"></span>');
      lbl.textContent = WALLPAPERS[id].name;
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

    body.appendChild(el('<p class="settings-head">Tema</p>'));
    var row = el('<div class="theme-row"></div>');
    var darkBtn = el('<button class="chip theme-btn' + (curTheme === "dark" ? " active" : "") + '">🌙 Gelap</button>');
    var lightBtn = el('<button class="chip theme-btn' + (curTheme === "light" ? " active" : "") + '">☀️ Terang</button>');
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

    var reset = el('<button class="btn-primary" style="margin-top:18px">Kembalikan bawaan</button>');
    reset.addEventListener("click", function () {
      try { localStorage.removeItem("wd-wallpaper"); localStorage.removeItem("wd-theme"); } catch (e) {}
      applyWallpaper("malam");
      setTheme("dark");
      var sw = grid.querySelectorAll(".wp-swatch");
      sw.forEach(function (s) { s.classList.remove("active"); });
      if (sw[0]) sw[0].classList.add("active");
    });
    body.appendChild(reset);
    body.appendChild(el('<p class="hint">Pengaturan tersimpan di perangkat ini dan langsung diterapkan saat desktop dibuka lagi.</p>'));
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
    var playBtn = el('<button class="btn-primary">▶ Putar</button>');
    var nextBtn = el('<button class="chip">⏭</button>');
    var timeEl = el('<span class="music-time">0:00 / 0:00</span>');
    controls.appendChild(prevBtn); controls.appendChild(playBtn);
    controls.appendChild(nextBtn); controls.appendChild(timeEl);

    var seek = el('<input class="music-seek" type="range" min="0" max="100" value="0">');
    var volRow = el('<div class="music-volrow"></div>');
    var volLabel = el('<span class="hint" style="margin:0">Volume</span>');
    var vol = el('<input class="music-vol" type="range" min="0" max="100" value="80">');
    volRow.appendChild(volLabel); volRow.appendChild(vol);

    var listEl = el('<div class="music-list"></div>');

    var addRow = el('<div class="music-add"></div>');
    var urlInput = el('<input type="text" placeholder="Tempel URL audio/video, mis. https://.../lagu.mp3">');
    var addBtn = el('<button class="btn-primary">Tambah</button>');
    addRow.appendChild(urlInput); addRow.appendChild(addBtn);

    body.appendChild(stage); body.appendChild(controls);
    body.appendChild(seek); body.appendChild(volRow);
    body.appendChild(listEl); body.appendChild(addRow);
    body.appendChild(el('<p class="hint">Trek demo butuh internet. Trek tambahan tersimpan di perangkat ini.</p>'));

    function currentTrack() { return tracks[current]; }
    function tryPlay() {
      if (!media) return;
      try {
        var p = media.play();
        if (p && p.then) {
          p.then(function () { playBtn.textContent = "⏸ Jeda"; }).catch(function () {});
        } else {
          playBtn.textContent = "⏸ Jeda";
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
      playBtn.textContent = "▶ Putar";
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
          var del = el('<button class="chip">Hapus</button>');
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
        errEl.textContent = "Gagal memuat media ini. Periksa URL atau koneksi internet, lalu coba trek lain.";
        errEl.classList.remove("hidden");
        playBtn.textContent = "▶ Putar";
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
        playBtn.textContent = "▶ Putar";
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

  window.APPS = {
    chat: { emoji: "💬", title: "Obrolan", render: renderChat },
    browser: { emoji: "🌐", title: "Peramban", render: renderBrowser },
    notes: { emoji: "📝", title: "Catatan", render: renderNotes },
    calc: { emoji: "🧮", title: "Kalkulator", render: renderCalc },
    files: { emoji: "📁", title: "Files", render: renderFiles },
    settings: { emoji: "⚙️", title: "Pengaturan", render: renderSettings },
    music: { emoji: "🎵", title: "Musik", render: renderMusic }
  };
})();

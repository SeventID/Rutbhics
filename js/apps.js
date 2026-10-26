// Web Desktop — aplikasi bawaan v1: Obrolan, Peramban, Catatan, Kalkulator.
// Data Obrolan & Catatan tersimpan di localStorage perangkat yang membuka web ini.
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

  window.APPS = {
    chat: { emoji: "💬", title: "Obrolan", render: renderChat },
    browser: { emoji: "🌐", title: "Peramban", render: renderBrowser },
    notes: { emoji: "📝", title: "Catatan", render: renderNotes },
    calc: { emoji: "🧮", title: "Kalkulator", render: renderCalc }
  };
})();

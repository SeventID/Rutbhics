// Tes klien P2 (DOM sim): L7 logout desktop, P2d iframe, P2e localStorage.
// Port S11 dari staging P2 (dirapikan: path root repo + seleksi hint Catatan
// disesuaikan baris pencarian P3); perilaku yang diuji tidak berubah.
// Mode lewat env L7MODE: beacon (default, ikut tes apps) | fetch | none
// (dua terakhir hanya menguji L7 dengan stub berbeda).
"use strict";
var fs = require("fs");
var WORK = require("path").join(__dirname, ".."); // root repo (port S11 dari staging P2)

function ClassList() { this._s = new Set(); }
ClassList.prototype.add = function () { for (var i = 0; i < arguments.length; i++) this._s.add(arguments[i]); };
ClassList.prototype.remove = function () { for (var i = 0; i < arguments.length; i++) this._s.delete(arguments[i]); };
ClassList.prototype.toggle = function (c, force) {
  if (force === undefined) force = !this._s.has(c);
  if (force) this._s.add(c); else this._s.delete(c);
  return force;
};
ClassList.prototype.contains = function (c) { return this._s.has(c); };

function FakeEl(tag) {
  this.tag = tag || "div";
  this.children = [];
  this.handlers = {};
  this.textContent = "";
  this.style = {};
  this.value = "";
  this.classList = new ClassList();
  var self = this;
  Object.defineProperty(this, "className", {
    get: function () { return Array.from(self.classList._s).join(" "); },
    set: function (v) { self.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  Object.defineProperty(this, "firstElementChild", { get: function () { return self.children[0] || null; } });
  Object.defineProperty(this, "innerHTML", {
    set: function (v) {
      self.children = [];
      var s = String(v);
      var m = s.match(/^<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(?:>([^<]*)<\/\w*>|\/?>)$/);
      if (m) {
        var child = new FakeEl(m[1]);
        var attrs = m[2] || "";
        var am;
        var re = /([\w-]+)="([^"]*)"/g;
        while ((am = re.exec(attrs)) !== null) {
          if (am[1] === "class") child.className = am[2];
          else child[am[1]] = am[2];
        }
        if (m[3] !== undefined) child.textContent = m[3];
        child._parent = self;
        self.children = [child];
      }
    },
    get: function () { return ""; }
  });
  if (tag === "canvas") {
    this._ctx = { fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
      fillRect: function () {}, beginPath: function () {}, moveTo: function () {},
      lineTo: function () {}, stroke: function () {}, drawImage: function () {}, clearRect: function () {} };
    this.getContext = function () { return self._ctx; };
    this.toDataURL = function () { return "data:image/png;base64,AAAA"; };
    this.width = 800; this.height = 500;
  }
}
FakeEl.prototype.appendChild = function (c) { c._parent = this; this.children.push(c); return c; };
FakeEl.prototype.remove = function () {
  if (this._parent) {
    var i = this._parent.children.indexOf(this);
    if (i !== -1) this._parent.children.splice(i, 1);
  }
};
FakeEl.prototype.addEventListener = function (t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); };
FakeEl.prototype.fire = function (type, ev) {
  ev = ev || {};
  if (ev.target === undefined) ev.target = this;
  if (ev.preventDefault === undefined) ev.preventDefault = function () {};
  (this.handlers[type] || []).forEach(function (f) { f(ev); });
};
FakeEl.prototype.querySelector = function (sel) {
  var all = walkAll(this, []);
  for (var i = 0; i < all.length; i += 1) {
    var el = all[i];
    if (sel[0] === "." && el.classList.contains(sel.slice(1))) return el;
    var m = sel.match(/^\[data-act="([^"]+)"\]$/);
    if (m && el["data-act"] === m[1]) return el;
    if (sel === el.tag) return el;
  }
  return null;
};
FakeEl.prototype.querySelectorAll = function (sel) {
  var out = [];
  var walk = function (el) {
    if (sel[0] === "." && el.classList.contains(sel.slice(1))) out.push(el);
    el.children.forEach(walk);
  };
  this.children.forEach(walk);
  return out;
};
FakeEl.prototype.contains = function () { return true; };

function walkAll(root, out) { out.push(root); root.children.forEach(function (c) { walkAll(c, out); }); return out; }
function findAll(root, pred) { return walkAll(root, []).filter(pred); }
function byClass(root, cls) { return findAll(root, function (e) { return e.classList.contains(cls); }); }
function byText(root, text) { return findAll(root, function (e) { return e.textContent === text; }); }
function byPlaceholder(root, ph) { return findAll(root, function (e) { return e.placeholder === ph; }); }
function byTag(root, tag) { return findAll(root, function (e) { return e.tag === tag; }); }

function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); process.exit(1); }
  console.log("OK: " + msg);
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var L7MODE = process.env.L7MODE || "beacon";
var storage = {};
var failStore = false;
var fetched = [];
var beacons = [];
var fetchCalls = [];

var idCache = {};
var bodyEl = new FakeEl("body");
global.window = { LANG: "id", addEventListener: function () {}, APPS: {} };
global.document = {
  createElement: function (tag) { return new FakeEl(tag); },
  getElementById: function (id) {
    if (id === "store-warning") {
      var found = findAll(bodyEl, function (e) { return e.id === "store-warning"; });
      return found[0] || null;
    }
    if (!idCache[id]) idCache[id] = new FakeEl("div");
    return idCache[id];
  },
  body: bodyEl,
  addEventListener: function () {}
};
global.localStorage = {
  getItem: function (k) { return storage[k] === undefined ? null : storage[k]; },
  setItem: function (k, v) { if (failStore) throw new Error("QuotaExceededError"); storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; }
};
var sessStore = {};
global.sessionStorage = {
  getItem: function (k) { return sessStore[k] === undefined ? null : sessStore[k]; },
  setItem: function (k, v) { sessStore[k] = String(v); },
  removeItem: function (k) { delete sessStore[k]; }
};
global.location = { href: "" };
global.Image = function () {};
if (L7MODE === "beacon") {
  Object.defineProperty(global, "navigator", { value: { sendBeacon: function (url) { beacons.push(url); return true; } }, configurable: true, writable: true });
} else {
  Object.defineProperty(global, "navigator", { value: {}, configurable: true, writable: true });
}
if (L7MODE !== "none") {
  global.fetch = function (url, opts) {
    fetchCalls.push({ url: url, opts: opts || {} });
    fetched.push(url);
    function ok(body, status) {
      return Promise.resolve({ ok: (status || 200) >= 200 && (status || 200) < 300, status: status || 200, json: function () { return Promise.resolve(body); } });
    }
    if (url === "/api/auth/me") return ok({ user: { username: "budi" } });
    if (url === "/api/chat" && opts && opts.method === "POST") return ok({ reply: "halo balasan" });
    if (url === "/api/chat") return ok({ active: true, model: "larprouter:deepseek-v4.1-flash" });
    return ok({});
  };
}

eval(fs.readFileSync(WORK + "/js/apps.js", "utf8"));

async function testApps() {
  // P2d: iframe Peramban
  var bBody = new FakeEl("div");
  global.window.APPS.browser.render(bBody);
  var frame = byClass(bBody, "browser-frame")[0];
  assert(!!frame, "(P2d) iframe Peramban dirender");
  assert(frame.sandbox.indexOf("allow-same-origin") === -1, "(P2d) sandbox TANPA allow-same-origin: " + frame.sandbox);
  assert(frame.sandbox.indexOf("allow-scripts") !== -1 && frame.sandbox.indexOf("allow-forms") !== -1, "(P2d) sandbox tetap allow-scripts + allow-forms");
  var bInput = byTag(bBody, "input")[0];
  var bGo = byClass(bBody, "btn-primary")[0];
  bInput.value = "example.com";
  bGo.fire("click");
  assert(frame.src === "https://example.com", "(P2d) Peramban tetap memuat situs eksternal (src=" + frame.src + ")");
  var chip = byClass(bBody, "chip")[0];
  chip.fire("click");
  assert(frame.src === "https://wikipedia.org", "(P2d) quick-link tetap jalan (src=" + frame.src + ")");

  // P2e-cap: 250 pesan -> kirim 1 (+ balasan AI) -> tersisa 200, terlama terbuang
  var seed = [];
  for (var i = 0; i < 250; i += 1) seed.push({ from: "them", text: "m" + i });
  storage["wd-chat"] = JSON.stringify({ teman: seed });
  var cBody = new FakeEl("div");
  global.window.APPS.chat.render(cBody);
  await sleep(100);
  var cInput = byPlaceholder(cBody, "Tulis pesan...")[0];
  assert(!!cInput, "(P2e) kolom tulis chat ditemukan");
  var cRow = cInput._parent;
  var cSend = cRow.children.filter(function (c) { return c.tag === "button"; })[0];
  cInput.value = "baru";
  cSend.fire("click");
  await sleep(200);
  var stored = JSON.parse(storage["wd-chat"]);
  assert(stored.teman.length === 200, "(P2e) wd-chat dibatasi 200 (dapat " + stored.teman.length + ")");
  assert(stored.teman[0].text === "m52", "(P2e) pesan terlama terbuang (pertama tersisa m52, dapat " + stored.teman[0].text + ")");
  assert(stored.teman[stored.teman.length - 1].text === "halo balasan", "(P2e) pesan baru + balasan tetap tersimpan");

  // P2e-fail: setItem throw -> banner muncul, tidak ada klaim tersimpan
  failStore = true;
  var gBody = new FakeEl("div");
  global.window.APPS.gambar.render(gBody);
  var clearBtn = byText(gBody, "🗑 Hapus")[0];
  assert(!!clearBtn, "(P2e) tombol Hapus Gambar ditemukan");
  clearBtn.fire("click");
  var gStatus = byClass(gBody, "hint")[0];
  assert(gStatus.textContent.indexOf("Gagal menyimpan gambar") !== -1, "(P2e) status Gambar = gagal (bukan 'tersimpan ✓'): " + gStatus.textContent);
  var banner = global.document.getElementById("store-warning");
  assert(!!banner && banner.textContent.indexOf("Penyimpanan lokal gagal") !== -1, "(P2e) banner peringatan simpan-gagal tampil");
  var nBody = new FakeEl("div");
  global.window.APPS.notes.render(nBody);
  var nArea = byClass(nBody, "notes-area")[0];
  var nBtn = byClass(nBody, "btn-primary")[0];
  // P3 menambah baris pencarian (hint pertama = hitungan pencarian di dalam
  // searchRow); status simpan adalah hint anak langsung body.
  var nOk = byClass(nBody, "hint").filter(function (e) { return e._parent === nBody; })[0];
  nArea.value = "catatan gagal";
  nBtn.fire("click");
  assert(nOk.textContent.indexOf("Gagal menyimpan") !== -1, "(P2e) status Catatan = gagal (bukan 'Tersimpan ✓'): " + nOk.textContent);
  failStore = false;

  // P2e-success: jalur normal tidak rusak
  var gBody2 = new FakeEl("div");
  global.window.APPS.gambar.render(gBody2);
  byText(gBody2, "🗑 Hapus")[0].fire("click");
  assert(byClass(gBody2, "hint")[0].textContent.indexOf("tersimpan ✓") !== -1, "(P2e) jalur sukses Gambar tetap 'tersimpan ✓'");
  console.log("SEMUA TES APPS (P2d+P2e) LOLOS");
}

async function testL7() {
  sessStore["wd-session"] = "budi";
  eval(fs.readFileSync(WORK + "/js/desktop.js", "utf8"));
  var logoutBtn = idCache["logout-btn"];
  assert(!!logoutBtn, "(L7) tombol logout ditemukan");
  logoutBtn.fire("click");
  await sleep(50);
  if (L7MODE === "beacon") {
    assert(beacons.indexOf("/api/auth/logout") !== -1, "(L7-beacon) sendBeacon(/api/auth/logout) dipanggil");
  } else if (L7MODE === "fetch") {
    var f = fetchCalls.filter(function (c) { return c.url === "/api/auth/logout" && c.opts.method === "POST"; });
    assert(f.length === 1 && f[0].opts.keepalive === true, "(L7-fetch) fallback fetch POST keepalive dipanggil");
  } else {
    assert(true, "(L7-none) tanpa beacon/fetch: tidak throw");
  }
  assert(sessStore["wd-session"] === undefined, "(L7) wd-session dibersihkan");
  assert(global.location.href === "login.html", "(L7) redirect ke login.html");
  console.log("TES L7 (" + L7MODE + ") LOLOS");
}

async function main() {
  if (L7MODE === "beacon") await testApps();
  await testL7();
  console.log("SEMUA TES KLIEN LOLOS (" + L7MODE + ")");
  process.exit(0);
}
main().catch(function (e) { console.error("FAIL: " + (e && e.stack || e)); process.exit(1); });

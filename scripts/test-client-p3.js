// Tes DOM sim P3: Catatan (autosave + pencarian) dan resize jendela.
// Port S11 dari staging P3 (dirapikan: path root repo saja).
// Murni Node, tanpa dependensi. Memuat js/apps.js lalu js/desktop.js
// dari pohon work/ dengan stub DOM minimal.
"use strict";
var fs = require("fs");
var path = require("path");

var WORK = path.join(__dirname, ".."); // root repo (port S11 dari staging P3)
var failures = 0;
function check(cond, msg) {
  if (cond) console.log("OK: " + msg);
  else { console.error("FAIL: " + msg); failures += 1; }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ---------- Stub DOM ----------
function ClassList() { this._s = new Set(); }
ClassList.prototype.add = function () { for (var i = 0; i < arguments.length; i++) this._s.add(arguments[i]); };
ClassList.prototype.remove = function () { for (var i = 0; i < arguments.length; i++) this._s.delete(arguments[i]); };
ClassList.prototype.toggle = function (c, force) {
  if (force === undefined) force = !this._s.has(c);
  if (force) this._s.add(c); else this._s.delete(c);
  return force;
};
ClassList.prototype.contains = function (c) { return this._s.has(c); };

var VOID_TAGS = { input: 1, br: 1, hr: 1, img: 1, link: 1, meta: 1 };
function parseFragment(html) {
  var roots = [];
  var stack = [];
  var re = /<\/?([a-zA-Z][\w-]*)\s*([^>]*?)\/?>|([^<]+)/g;
  var m;
  function attach(el) {
    if (stack.length) stack[stack.length - 1].appendChild(el);
    else roots.push(el);
  }
  while ((m = re.exec(html)) !== null) {
    if (m[3] !== undefined) {
      var txt = m[3];
      if (stack.length && txt.trim() !== "") stack[stack.length - 1].textContent += txt;
      continue;
    }
    var isClose = html[m.index + 1] === "/";
    var tag = m[1].toLowerCase();
    if (isClose) {
      while (stack.length && stack[stack.length - 1].tag !== tag) stack.pop();
      stack.pop();
      continue;
    }
    var el = new FakeEl(tag);
    var attrs = m[2] || "";
    var am;
    var are = /([\w-]+)="([^"]*)"/g;
    while ((am = are.exec(attrs)) !== null) {
      if (am[1] === "class") el.className = am[2];
      else el[am[1]] = am[2];
    }
    attach(el);
    if (!VOID_TAGS[tag]) stack.push(el);
  }
  return roots;
}

function FakeEl(tag) {
  this.tag = tag || "div";
  this.children = [];
  this.handlers = {};
  this.textContent = "";
  this.style = {};
  this.value = "";
  this.dataset = {};
  this.classList = new ClassList();
  this.selectionStart = 0;
  this.selectionEnd = 0;
  var self = this;
  Object.defineProperty(this, "className", {
    get: function () { return Array.from(self.classList._s).join(" "); },
    set: function (v) { self.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  Object.defineProperty(this, "firstElementChild", { get: function () { return self.children[0] || null; } });
  Object.defineProperty(this, "innerHTML", {
    set: function (v) {
      self.children = [];
      var roots = parseFragment(String(v));
      roots.forEach(function (c) { c._parent = self; self.children.push(c); });
    },
    get: function () { return ""; }
  });
  Object.defineProperty(this, "offsetLeft", { get: function () { return parseInt(self.style.left, 10) || 0; } });
  Object.defineProperty(this, "offsetTop", { get: function () { return parseInt(self.style.top, 10) || 0; } });
  Object.defineProperty(this, "offsetWidth", { get: function () { return parseInt(self.style.width, 10) || 640; } });
  Object.defineProperty(this, "offsetHeight", { get: function () { return parseInt(self.style.height, 10) || 440; } });
}
FakeEl.prototype.appendChild = function (c) { c._parent = this; this.children.push(c); return c; };
FakeEl.prototype.remove = function () {
  if (this._parent) {
    var i = this._parent.children.indexOf(this);
    if (i !== -1) this._parent.children.splice(i, 1);
    this._parent = null;
  }
};
FakeEl.prototype.addEventListener = function (t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); };
FakeEl.prototype.removeEventListener = function (t, f) {
  var arr = this.handlers[t] || [];
  var i = arr.indexOf(f);
  if (i !== -1) arr.splice(i, 1);
};
FakeEl.prototype.fire = function (type, ev) {
  ev = ev || {};
  if (ev.target === undefined) ev.target = this;
  if (ev.preventDefault === undefined) ev.preventDefault = function () {};
  if (ev.stopPropagation === undefined) ev.stopPropagation = function () {};
  (this.handlers[type] || []).slice().forEach(function (f) { f(ev); });
};
FakeEl.prototype.setPointerCapture = function () {};
FakeEl.prototype.focus = function () {};
FakeEl.prototype.setSelectionRange = function (s, e) { this.selectionStart = s; this.selectionEnd = e; };
FakeEl.prototype.closest = function () { return null; };
FakeEl.prototype._walk = function (out) {
  var self = this;
  this.children.forEach(function (c) { out.push(c); c._walk(out); });
  return out;
};
function matchSel(el, sel) {
  if (sel[0] === ".") {
    var parts = sel.slice(1).split(".");
    return parts.every(function (c) { return el.classList.contains(c); });
  }
  var dm = sel.match(/^\[data-act="([^"]+)"\]$/);
  if (dm) return el["data-act"] === dm[1];
  return el.tag === sel;
}
FakeEl.prototype.querySelectorAll = function (sel) {
  return this._walk([]).filter(function (el) { return matchSel(el, sel); });
};
FakeEl.prototype.querySelector = function (sel) {
  var all = this.querySelectorAll(sel);
  return all.length ? all[0] : null;
};

var idMap = {};
var docBody = new FakeEl("body");
function findById(root, id) {
  if (root.id === id) return root;
  for (var i = 0; i < root.children.length; i++) {
    var f = findById(root.children[i], id);
    if (f) return f;
  }
  return null;
}
global.document = {
  createElement: function (tag) { return new FakeEl(tag); },
  getElementById: function (id) {
    if (id === "store-warning") return findById(docBody, id);
    if (!idMap[id]) idMap[id] = new FakeEl("div");
    return idMap[id];
  },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  body: docBody,
  documentElement: new FakeEl("html")
};
global.window = {
  LANG: "id",
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: function () {}
};
var storage = {};
var failKeys = {};
global.localStorage = {
  getItem: function (k) { return storage[k] === undefined ? null : storage[k]; },
  setItem: function (k, v) {
    if (failKeys[k]) throw new Error("quota penuh (simulasi)");
    storage[k] = String(v);
  },
  removeItem: function (k) { delete storage[k]; }
};
global.sessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
global.setInterval = function () { return 0; };
global.location = { href: "", replace: function () {} };
global.fetch = function () {
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
};

// ---------- Muat kode ----------
eval(fs.readFileSync(path.join(WORK, "js", "apps.js"), "utf8"));
check(window.APPS && Object.keys(window.APPS).length === 9, "apps.js: 9 aplikasi terdaftar");
check(window.WALLPAPERS && Object.keys(window.WALLPAPERS).length === 4, "apps.js: 4 wallpaper");
eval(fs.readFileSync(path.join(WORK, "js", "desktop.js"), "utf8"));
var iconsEl = document.getElementById("desktop-icons");
var windowsEl = document.getElementById("windows");
check(iconsEl.children.length === 9, "desktop.js: 9 ikon desktop dirender");

// ---------- Item 1: Catatan ----------
async function testNotes() {
  var body = new FakeEl("div");
  window.APPS.notes.render(body);
  var searchRow = body.children[0];
  var search = searchRow.children[0];
  var nextBtn = searchRow.children[1];
  var count = searchRow.children[2];
  var area = body.children[1];
  var btn = body.children[2];
  var ok = body.children[3];
  check(search.classList.contains("notes-search"), "notes: kolom pencarian ada");
  check(area.classList.contains("notes-area"), "notes: textarea ada");
  check(btn.textContent === "Simpan", "notes: tombol Simpan tetap ada");

  // Pencarian: 3 hasil, navigasi melintasi + melingkar
  area.value = "apel mangga apel jeruk apel";
  search.value = "apel";
  search.fire("input");
  check(count.textContent === "Hasil 1 dari 3", "notes: cari 'apel' -> Hasil 1 dari 3 (dapat: " + count.textContent + ")");
  check(area.selectionStart === 0 && area.selectionEnd === 4, "notes: seleksi hasil pertama 0-4");
  nextBtn.fire("click");
  check(count.textContent === "Hasil 2 dari 3" && area.selectionStart === 12 && area.selectionEnd === 16, "notes: Berikutnya -> hasil ke-2 (12-16)");
  nextBtn.fire("click");
  check(count.textContent === "Hasil 3 dari 3" && area.selectionStart === 23 && area.selectionEnd === 27, "notes: Berikutnya -> hasil ke-3 (23-27)");
  nextBtn.fire("click");
  check(count.textContent === "Hasil 1 dari 3" && area.selectionStart === 0, "notes: Berikutnya melingkar ke hasil pertama");
  search.value = "naga";
  search.fire("input");
  check(count.textContent === "Tidak ditemukan", "notes: cari 'naga' -> Tidak ditemukan");
  search.value = "";
  search.fire("input");
  check(count.textContent === "", "notes: pencarian kosong membersihkan hitungan");

  // Autosave (debounce): ketik saja, tanpa klik
  area.value = "catatan autosave";
  area.fire("input");
  check(storage["wd-notes"] === undefined || JSON.parse(storage["wd-notes"] || "null") !== "catatan autosave", "notes: sebelum debounce belum tersimpan");
  await sleep(950);
  check(storage["wd-notes"] === JSON.stringify("catatan autosave"), "notes: autosave tersimpan setelah debounce");
  check(ok.textContent === "Tersimpan otomatis ✓", "notes: status autosave jujur (dapat: " + ok.textContent + ")");

  // Tombol Simpan: seketika
  area.value = "catatan manual";
  btn.fire("click");
  check(storage["wd-notes"] === JSON.stringify("catatan manual"), "notes: tombol Simpan menyimpan seketika");
  check(ok.textContent === "Tersimpan ✓", "notes: status tombol Simpan tetap 'Tersimpan ✓'");

  // Gagal simpan: status jujur, bukan klaim tersimpan
  failKeys["wd-notes"] = true;
  area.value = "catatan gagal";
  btn.fire("click");
  check(ok.textContent === "Gagal menyimpan (penyimpanan lokal penuh?)", "notes: gagal simpan -> status gagal (bukan klaim tersimpan)");
  failKeys["wd-notes"] = false;
}

// ---------- Item 2: Resize jendela ----------
function testResize() {
  // Buka Catatan lewat ikon desktop (indeks 2: chat, browser, notes)
  iconsEl.children[2].fire("click");
  check(windowsEl.children.length === 1, "resize: jendela terbuka lewat ikon");
  var win = windowsEl.children[0];
  var handles = win._walk([]).filter(function (e) { return e.classList.contains("win-resize"); });
  check(handles.length === 3, "resize: 3 pegangan (e/s/se) dibuat");
  function handle(mode) {
    return handles.filter(function (h) {
      if (mode === "se") return h.classList.contains("se");
      return h.classList.contains(mode) && !h.classList.contains("se");
    })[0];
  }
  var se = handle("se"), eH = handle("e");
  check(!!se && !!eH, "resize: pegangan se + e ditemukan");

  // Gerak tanpa pointerdown: tidak berubah
  se.fire("pointermove", { clientX: 900, clientY: 700 });
  check(win.style.width === undefined && win.style.height === undefined, "resize: tanpa pointerdown tidak berubah");

  // Drag pojok: +100/+100 dari 640x440
  se.fire("pointerdown", { clientX: 700, clientY: 480, pointerId: 1 });
  se.fire("pointermove", { clientX: 800, clientY: 580 });
  se.fire("pointerup", {});
  check(win.style.width === "740px" && win.style.height === "540px", "resize: drag pojok -> 740x540 (dapat: " + win.style.width + "x" + win.style.height + ")");

  // Jepit minimum: seret jauh ke kiri/atas
  se.fire("pointerdown", { clientX: 800, clientY: 580, pointerId: 1 });
  se.fire("pointermove", { clientX: -1000, clientY: -1000 });
  se.fire("pointerup", {});
  check(win.style.width === "320px" && win.style.height === "240px", "resize: jepit minimum 320x240 (dapat: " + win.style.width + "x" + win.style.height + ")");

  // Tepi kanan saja: hanya lebar berubah
  eH.fire("pointerdown", { clientX: 400, clientY: 300, pointerId: 1 });
  eH.fire("pointermove", { clientX: 450, clientY: 900 });
  eH.fire("pointerup", {});
  check(win.style.width === "370px" && win.style.height === "240px", "resize: tepi kanan hanya ubah lebar (dapat: " + win.style.width + "x" + win.style.height + ")");

  // Jendela maximize/snap: resize diabaikan (guard JS)
  win._snapState = "max";
  se.fire("pointerdown", { clientX: 400, clientY: 300, pointerId: 1 });
  se.fire("pointermove", { clientX: 900, clientY: 900 });
  se.fire("pointerup", {});
  check(win.style.width === "370px" && win.style.height === "240px", "resize: jendela maximize/snap tidak bisa di-resize");
  win._snapState = null;

  // Regresi drag: header masih bisa menggeser jendela
  var header = win.querySelector(".win-header");
  check(!!header, "resize: header ditemukan (querySelector)");
  var l0 = win.style.left, t0 = win.style.top;
  header.fire("pointerdown", { clientX: 100, clientY: 60, pointerId: 1 });
  header.fire("pointermove", { clientX: 200, clientY: 160 });
  header.fire("pointerup", { clientX: 200, clientY: 160 });
  check(win.style.left !== l0 && win.style.top !== t0, "resize: drag header tetap jalan (posisi berubah)");
}

(async function () {
  await testNotes();
  testResize();
  // Pemeriksaan statis
  var css = fs.readFileSync(path.join(WORK, "css", "style.css"), "utf8");
  check(css.includes(".win-resize.e") && css.includes(".window.maximized .win-resize"), "css: aturan win-resize + sembunyikan saat maximize ada");
  var apps = fs.readFileSync(path.join(WORK, "js", "apps.js"), "utf8");
  check(apps.includes("800") && apps.includes("notesAutoSaved"), "apps.js: debounce autosave + status autosave ada");
  if (failures) { console.error("KLIEN GAGAL: " + failures + " cek"); process.exit(1); }
  console.log("KLIEN LOLOS");
})();

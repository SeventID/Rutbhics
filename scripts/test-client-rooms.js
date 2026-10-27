// Tes DOM sim ruang privat: opsi ruang + gembok, baris tambah anggota,
// dropdown visibilitas, hint 403.
// Port S11 dari staging ruang privat (dirapikan: path root repo saja).
// Murni Node, tanpa dependensi. Memuat js/apps.js lalu js/desktop.js
// dari pohon work/ dengan stub DOM minimal.
"use strict";
var fs = require("fs");
var path = require("path");

var WORK = path.join(__dirname, ".."); // root repo (port S11 dari staging ruang privat)
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

// ---------- Tes klien: ruang privat ----------
var fs = require("fs");
var path = require("path");
var WORK = path.join(__dirname, ".."); // root repo (port S11 dari staging ruang privat)
var failures = 0;
function check2(cond, msg) {
  if (cond) console.log("OK: " + msg);
  else { console.error("FAIL: " + msg); failures += 1; }
}
function sleep2(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

eval(fs.readFileSync(path.join(WORK, "js", "apps.js"), "utf8"));
check2(window.APPS && window.APPS.chat, "apps.js: aplikasi Obrolan terdaftar");

// Fetch skenario: me + rooms + perilaku messages/members bisa diubah per skenario
var scenario = {
  me: "alice",
  rooms: [
    { id: "umum", name: "Umum", visibility: "public" },
    { id: "rahasia", name: "Rahasia", visibility: "private", createdBy: "alice", members: ["alice"] },
  ],
  msg403: false,   // bila true: GET messages -> 403 bukan_anggota
  postMsg403: false, // bila true: POST messages -> 403 bukan_anggota
  lastPost: null,  // {url, body} terakhir
};
global.fetch = function (url, opts) {
  opts = opts || {};
  var method = opts.method || "GET";
  url = String(url).split("?")[0]; // klien selalu menambah ?since= pada GET messages
  function resp(ok, status, body) {
    return Promise.resolve({ ok: ok, status: status, json: function () { return Promise.resolve(body); } });
  }
  if (url === "/api/auth/providers") return resp(true, 200, { password: true, google: false, github: false });
  if (url === "/api/auth/me") {
    return resp(true, 200, scenario.me ? { user: { username: scenario.me } } : {});
  }
  if (url === "/api/rooms" && method === "GET") return resp(true, 200, { rooms: scenario.rooms });
  if (url === "/api/rooms" && method === "POST") {
    scenario.lastPost = { url: url, body: JSON.parse(opts.body || "{}") };
    return resp(true, 200, { room: { id: "ruang-baru", name: scenario.lastPost.body.name, visibility: scenario.lastPost.body.visibility } });
  }
  var mm = url.match(/^\/api\/rooms\/([^/]+)\/messages$/);
  if (mm && method === "GET") {
    if (scenario.msg403) return resp(false, 403, { error: "bukan_anggota" });
    return resp(true, 200, { messages: [], seq: 0 });
  }
  if (mm && method === "POST") {
    scenario.lastPost = { url: url, body: JSON.parse(opts.body || "{}") };
    if (scenario.postMsg403) return resp(false, 403, { error: "bukan_anggota" });
    return resp(true, 200, { message: { seq: 1, user: scenario.me, text: scenario.lastPost.body.text, time: 1 } });
  }
  var mb = url.match(/^\/api\/rooms\/([^/]+)\/members$/);
  if (mb && method === "POST") {
    scenario.lastPost = { url: url, body: JSON.parse(opts.body || "{}") };
    return resp(true, 200, { ok: true, room: { id: "rahasia", members: ["alice", "bob"] } });
  }
  return resp(false, 404, { error: "tidak_ditemukan" });
};

// Cari elemen multi-user dari body render: [wrap [listEl, mainEl]]
function findMulti(body) {
  var wrap = body.children[0];
  var mainEl = wrap.children[1];
  var multiEl = null;
  for (var i = 0; i < mainEl.children.length; i++) {
    if (mainEl.children[i].className.indexOf("chat-multi") !== -1) multiEl = mainEl.children[i];
  }
  // multiEl children: [authBox, roomRow, multiMsgs, multiInputRow, createRow, memberRow, multiHint]
  return {
    wrap: wrap, mainEl: mainEl, multiEl: multiEl,
    roomRow: multiEl.children[1],
    multiMsgs: multiEl.children[2],
    multiInputRow: multiEl.children[3],
    createRow: multiEl.children[4],
    memberRow: multiEl.children[5],
    multiHint: multiEl.children[6],
  };
}
function clickMulti(body) {
  var wrap = body.children[0];
  var listEl = wrap.children[0];
  listEl.children[0].fire("click"); // tombol "👥 Multi-User"
}

async function main2() {
  // --- Skenario A: alice = pembuat ruang privat ---
  var bodyA = new FakeEl("div");
  window.APPS.chat.render(bodyA);
  clickMulti(bodyA);
  await sleep2(50);
  var mA = findMulti(bodyA);
  var roomSelect = mA.roomRow.children[1];
  check2(roomSelect.children.length === 2, "A: 2 opsi ruang (umum + rahasia)");
  check2(roomSelect.children[0].textContent === "Umum", "A: opsi publik tanpa gembok");
  check2(roomSelect.children[1].textContent === "🔒 Rahasia", "A: opsi privat bergembok 🔒");
  check2(mA.memberRow.style.display === "none", "A: di ruang publik, baris tambah anggota tersembunyi");
  // Pindah ke ruang privat (pembuat) -> baris tambah anggota muncul
  roomSelect.value = "rahasia";
  roomSelect.fire("change");
  await sleep2(50);
  check2(mA.memberRow.style.display !== "none", "A: di ruang privat sebagai pembuat, baris tambah anggota tampil");
  // Tambah anggota bob
  var memberInput = mA.memberRow.children[0];
  var memberBtn = mA.memberRow.children[1];
  memberInput.value = "bob";
  memberBtn.fire("click");
  await sleep2(50);
  check2(scenario.lastPost && scenario.lastPost.url === "/api/rooms/rahasia/members"
    && scenario.lastPost.body.username === "bob", "A: klik tambah anggota -> POST members {username: bob}");
  check2(mA.multiHint.textContent === "Anggota ditambahkan.", "A: hint sukses tambah anggota");
  // Dropdown visibilitas di form buat ruang
  var visSelect = mA.createRow.children[1];
  check2(visSelect.tag === "select" && visSelect.children.length === 2
    && visSelect.children[0].value === "public" && visSelect.children[1].value === "private",
    "A: dropdown visibilitas Publik/Privat ada");
  check2(visSelect.value === "public" || visSelect.value === "", "A: default dropdown Publik");
  var newRoomInput = mA.createRow.children[0];
  var createBtn = mA.createRow.children[2];
  newRoomInput.value = "Ruang Baru";
  visSelect.value = "private";
  createBtn.fire("click");
  await sleep2(50);
  check2(scenario.lastPost && scenario.lastPost.url === "/api/rooms"
    && scenario.lastPost.body.name === "Ruang Baru" && scenario.lastPost.body.visibility === "private",
    "A: buat ruang mengirim visibility=private");

  // --- Skenario B: bob = anggota biasa (bukan pembuat) ---
  scenario.me = "bob";
  scenario.rooms = [
    { id: "umum", name: "Umum", visibility: "public" },
    { id: "rahasia", name: "Rahasia", visibility: "private", createdBy: "alice", members: ["alice", "bob"] },
  ];
  var bodyB = new FakeEl("div");
  window.APPS.chat.render(bodyB);
  clickMulti(bodyB);
  await sleep2(50);
  var mB = findMulti(bodyB);
  var roomSelectB = mB.roomRow.children[1];
  check2(roomSelectB.children[1].textContent === "🔒 Rahasia", "B: anggota biasa tetap melihat gembok 🔒");
  roomSelectB.value = "rahasia";
  roomSelectB.fire("change");
  await sleep2(50);
  check2(mB.memberRow.style.display === "none", "B: di ruang privat sebagai anggota biasa, baris tambah anggota tersembunyi");

  // --- Skenario C: fetchMulti 403 -> pesan sopan, bukan crash/kosong ---
  scenario.me = "alice";
  roomSelect.value = "umum";
  roomSelect.fire("change");
  await sleep2(50);
  scenario.msg403 = true;
  roomSelect.value = "rahasia";
  roomSelect.fire("change");
  await sleep2(50);
  check2(mA.multiHint.textContent === "Ruang privat ini hanya bisa diakses anggotanya.",
    "C: fetch 403 -> hint 'hanya bisa diakses anggotanya' (dapat: " + mA.multiHint.textContent + ")");
  scenario.msg403 = false;

  // --- Skenario D: kirim pesan 403 -> pesan bukan anggota ---
  scenario.postMsg403 = true;
  var multiInput = mA.multiInputRow.children[0];
  var multiSend = mA.multiInputRow.children[1];
  multiInput.value = "halo";
  multiSend.fire("click");
  await sleep2(50);
  check2(mA.multiHint.textContent === "Kamu bukan anggota ruang privat ini.",
    "D: kirim 403 -> hint 'bukan anggota' (dapat: " + mA.multiHint.textContent + ")");
  scenario.postMsg403 = false;

  console.log(failures === 0 ? "SEMUA LOLOS" : failures + " KEGAGALAN");
  process.exit(failures === 0 ? 0 : 1);
}
main2().catch(function (e) { console.error("FATAL: " + (e && e.stack ? e.stack : e)); process.exit(2); });

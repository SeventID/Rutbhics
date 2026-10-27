// Helpers bersama rangkaian tes repo Rutbhics (S11). Murni Node, tanpa
// dependensi. Dipakai scripts/test-*.js; TIDAK mengubah perilaku server.
// Sumber pohon tes: root repo, atau S11_TREE_SRC bila disetel (dipakai
// scripts/test-negative-gate.js untuk menjalankan rangkaian terhadap
// salinan bin yang sengaja dimutasi).
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const child_process = require("node:child_process");

const REPO_ROOT = path.join(__dirname, "..");
const TREE_SRC = process.env.S11_TREE_SRC || REPO_ROOT;
const DUMMY_PASSWORD = "rahasia123";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Salin pohon paket (bin/js/css/scripts + index/login.html) dari TREE_SRC
// ke direktori tree baru di bawah tmp. config/.env opsional ditulis bila
// diberikan (nilai dummy saja).
function makeTree(tmp, name, opts) {
  opts = opts || {};
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const d of ["bin", "js", "css", "scripts"]) {
    const src = path.join(TREE_SRC, d);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dir, d), { recursive: true });
  }
  for (const f of ["index.html", "login.html"]) {
    const src = path.join(TREE_SRC, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  }
  if (opts.config !== undefined) fs.writeFileSync(path.join(dir, "config.json"), typeof opts.config === "string" ? opts.config : JSON.stringify(opts.config));
  if (opts.envFile !== undefined) fs.writeFileSync(path.join(dir, ".env"), opts.envFile);
  return dir;
}

// agent:false = tiap request membuka koneksi baru. Tanpa ini, agent Node
// memakai ulang soket keep-alive ke relay yang sudah ditutup, sehingga
// tes "relay mati" lolos semu (request lewat koneksi lama yang masih hidup).
function req(port, method, p, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const r = http.request({ host: opts.host || "127.0.0.1", port, method, path: p, headers: opts.headers || {}, agent: false }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

function jsonBody(obj) { return JSON.stringify(obj); }

async function waitHealth(port, tries, host) {
  for (let i = 0; i < (tries || 30); i += 1) {
    try {
      const r = await req(port, "GET", "/health", { host });
      if (r.status === 200) return true;
    } catch (e) { /* belum siap */ }
    await sleep(300);
  }
  return false;
}

async function waitDead(port, tries, host) {
  for (let i = 0; i < (tries || 20); i += 1) {
    try { await req(port, "GET", "/health", { host }); } catch (e) { return true; }
    await sleep(250);
  }
  return false;
}

// 0.0.0.0/:: adalah alamat listen ("semua interface"), bukan alamat yang
// bisa dihubungi klien; health-check/wait-dead memakai loopback untuknya.
function connectHost(host) {
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  return host;
}

// Jalankan server dari tree (cwd == tree). Mengembalikan { child, port, dir, logFile }.
// Melempar bila server tidak siap atau EADDRINUSE (server lama masih hidup).
async function startServer(dir, port, host, env) {
  const logFile = path.join(dir, "server.log");
  const out = fs.openSync(logFile, "w");
  const child = child_process.spawn(process.execPath,
    [path.join(dir, "bin", "rutbhics.js"), "--port", String(port), "--host", host || "127.0.0.1"],
    { cwd: dir, env: Object.assign({}, process.env, env || {}), stdio: ["ignore", out, out] });
  const srv = { child, port, dir, logFile, host: host || "127.0.0.1" };
  if (!(await waitHealth(port, 30, connectHost(srv.host)))) {
    try { child.kill(); } catch (e) {}
    throw new Error("server port " + port + " tidak siap; log: " + readLog(dir));
  }
  if (readLog(dir).includes("EADDRINUSE")) {
    try { child.kill(); } catch (e) {}
    throw new Error("server port " + port + " EADDRINUSE (server lama masih hidup!)");
  }
  return srv;
}

async function stopServer(srv) {
  if (!srv) return true;
  try { srv.child.kill(); } catch (e) {}
  const dead = await waitDead(srv.port, 20, connectHost(srv.host));
  return dead;
}

function readLog(dir) {
  try { return fs.readFileSync(path.join(dir, "server.log"), "utf8"); } catch (e) { return ""; }
}

// Relay TCP murni Node (pengganti socat): meneruskan byte apa adanya dari
// relayPort ke targetPort. Dipakai sebagai simulasi reverse proxy (Nginx).
function startRelay(relayPort, targetPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((src) => {
      const dst = net.connect(targetPort, "127.0.0.1");
      src.pipe(dst); dst.pipe(src);
      const kill = () => { try { src.destroy(); } catch (e) {} try { dst.destroy(); } catch (e) {} };
      src.on("error", kill); dst.on("error", kill);
    });
    server.once("error", reject);
    server.listen(relayPort, "127.0.0.1", () => resolve(server));
  });
}

function stopRelay(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    try { server.close(() => resolve()); } catch (e) { resolve(); }
    setTimeout(resolve, 1000);
  });
}

function parseToken(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
  for (const c of list) {
    const m = String(c).match(/rutbhics_token=([^;]+)/);
    if (m) return m[1];
  }
  return "";
}

// Register lalu login (field identifier, bukan username) untuk pengguna
// dummy; mengembalikan token sesi login (melempar bila kosong).
async function registerLogin(port, username, extraHeaders) {
  const base = { headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}) };
  const reg = await req(port, "POST", "/api/auth/register", { headers: base.headers, body: jsonBody({ username, password: DUMMY_PASSWORD, email: username + "@contoh.test" }) });
  if (reg.status !== 200) throw new Error("register " + username + " -> " + reg.status + " " + reg.body);
  const login = await req(port, "POST", "/api/auth/login", { headers: base.headers, body: jsonBody({ identifier: username, password: DUMMY_PASSWORD }) });
  if (login.status !== 200) throw new Error("login " + username + " -> " + login.status + " " + login.body);
  const tok = parseToken(login.headers["set-cookie"]);
  if (!tok) throw new Error("token login " + username + " kosong");
  return tok;
}

function cookieHeader(token) { return "rutbhics_token=" + token; }

function chatBody(model) {
  const b = { messages: [{ role: "user", content: "halo" }] };
  if (model) b.model = model;
  return jsonBody(b);
}

// POST /api/chat dengan sesi cookie (tanpa Origin bila tidak diberikan).
function chatPost(port, token, model, extraHeaders) {
  const headers = Object.assign({ "Content-Type": "application/json" }, extraHeaders || {});
  if (token) headers.Cookie = cookieHeader(token);
  return req(port, "POST", "/api/chat", { headers, body: chatBody(model) });
}

// Pencatat cek: check(cond, msg) dan ok(actual, expected, msg).
function makeChecks() {
  const c = { pass: 0, fail: 0 };
  c.check = (cond, msg) => {
    if (cond) { c.pass += 1; console.log("PASS: " + msg); }
    else { c.fail += 1; console.error("FAIL: " + msg); }
  };
  c.ok = (actual, expected, msg) => {
    c.check(actual === expected, msg + " (harap " + expected + ", dapat " + actual + ")");
  };
  c.okBody = (body, needle, msg) => {
    c.check(String(body).includes(needle), msg + " (body memuat " + needle + ")");
  };
  c.summary = (name) => {
    console.log("== RINGKASAN " + name + ": PASS=" + c.pass + " FAIL=" + c.fail + " ==");
    return c.fail;
  };
  return c;
}

module.exports = {
  REPO_ROOT, TREE_SRC, DUMMY_PASSWORD,
  sleep, mkTmp, makeTree, req, jsonBody, waitHealth, waitDead, connectHost,
  startServer, stopServer, readLog, startRelay, stopRelay,
  parseToken, registerLogin, cookieHeader, chatBody, chatPost, makeChecks,
};

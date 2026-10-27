#!/usr/bin/env node
// Rutbhics — server lokal, tanpa dependensi.
// Pakai: rutbhics [--port 8080]  atau  PORT=8080 rutbhics
//        rutbhics --setup   (tanya & simpan kunci Larprouter ke .env folder kerja)
// Lalu buka http://localhost:8080 di browser.
//
// Selain berkas statis, server ini menyediakan:
//   POST /api/chat — proxy ke Larprouter (chat completions) untuk semua
//   kontak di aplikasi Obrolan (Teman, Grup Keluarga, Bot Asisten, dengan
//   persona masing-masing). Klien boleh menyertakan "model" di body untuk
//   memilih model per percakapan; tanpa itu dipakai LARPROUTER_MODEL.
//   GET /api/models — daftar model (live dari Larprouter bila kunci ada,
//   kalau tidak daftar cadangan).
//   /api/rooms + /api/rooms/:id/messages — chat multi-user (ruang + pesan
//   di berkas rutbhics-chat.json di folder kerja). Sengaja TIDAK dibatasi
//   loopback: perangkat lain di jaringan harus bisa ikut. Membaca ruang
//   dan pesan terbuka; membuat ruang dan mengirim pesan wajib login.
//   /api/auth/* — akun pengguna multi-metode: username/email/HP +
//   kata sandi (hash scrypt + salt, di rutbhics-users.json) dan OAuth
//   Google/GitHub (bila client id/secret ada di environment). Sesi
//   memakai cookie httpOnly 30 hari; nama pengirim pesan selalu username
//   terverifikasi, bukan lagi klaim bebas.
//   Kunci API TIDAK PERNAH dikirim ke browser: kunci
//   dibaca server dari variabel lingkungan atau berkas .env lokal.
//   Salin .env.example menjadi .env, isi LARPROUTER_API_KEY, lalu jalankan
//   ulang. Berkas .env tidak pernah dilayani sebagai berkas statis dan
//   tidak boleh di-commit (sudah ada di .gitignore).
"use strict";
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

// ---------- .env lokal (tanpa dependensi) ----------
// Urutan: variabel lingkungan yang sudah ada menang; .env hanya mengisi
// yang kosong. Dicari dulu di folder kerja (cwd), lalu di folder paket.
function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const eq = t.indexOf("=");
      if (eq === -1) return;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    });
  } catch (e) { /* berkas .env opsional */ }
}
loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(ROOT, ".env"));

const LARPROUTER_BASE = (process.env.LARPROUTER_BASE_URL || "https://larprouter.com/v1").replace(/\/+$/, "");
const LARPROUTER_MODEL = process.env.LARPROUTER_MODEL || "deepseek-v4.1-flash";
// Daftar cadangan bila /api/models tidak bisa mengambil daftar live.
const FALLBACK_MODELS = [
  "deepseek-v4.1-flash",
  "claude-opus-4-7-1m",
  "deepseek-v4.1-flash-1017-abliterated",
  "deepseek-v4.1-flash-fast",
  "glm-5.3",
  "glm-5.3-flash"
];
const LARPROUTER_KEY = process.env.LARPROUTER_API_KEY || "";
const API_KEY_CONFIGURED = LARPROUTER_KEY.length > 0;

function parsePort(argv) {
  let port = parseInt(process.env.PORT, 10);
  const i = argv.indexOf("--port");
  if (i !== -1 && argv[i + 1]) port = parseInt(argv[i + 1], 10);
  if (!port || port < 1 || port > 65535) port = 8080;
  return port;
}

function isLoopback(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body_terlalu_besar")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------- Proxy Bot AI -> Larprouter ----------
function handleChat(req, res) {
  // Hanya dari perangkat ini: kunci dibayar pemiliknya, jangan sampai
  // dipakai perangkat lain yang se-jaringan.
  if (!isLoopback(req)) {
    sendJson(res, 403, { error: "forbidden", message: "Endpoint /api/chat hanya untuk pemakaian lokal." });
    return;
  }
  if (req.method === "GET") {
    sendJson(res, 200, { active: API_KEY_CONFIGURED, model: LARPROUTER_MODEL });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_tidak_didukung" });
    return;
  }
  if (!API_KEY_CONFIGURED) {
    sendJson(res, 503, {
      error: "bot_ai_tidak_aktif",
      message: "Bot AI belum aktif: isi LARPROUTER_API_KEY di berkas .env (salin dari .env.example), lalu jalankan ulang rutbhics."
    });
    return;
  }
  readBody(req, 65536).then((raw) => {
    let input;
    try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
    const msgs = Array.isArray(input.messages) ? input.messages : [];
    const clean = msgs
      .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") {
      sendJson(res, 400, { error: "pesan_tidak_valid" });
      return;
    }
    // Persona dikirim klien (per kontak Obrolan); dibatasi 500 karakter.
    // Server lokal milik pengguna sendiri, jadi ini bukan celah keamanan.
    const systemPrompt = typeof input.system === "string" && input.system.trim()
      ? input.system.slice(0, 500)
      : "Kamu adalah Bot Asisten di desktop Rutbhics. Jawab singkat, jelas, dan dalam Bahasa Indonesia.";
    // Model bisa dipilih klien per percakapan; dibatasi 200 karakter.
    // Tanpa itu dipakai model bawaan server (LARPROUTER_MODEL).
    const reqModel = typeof input.model === "string" && input.model.trim()
      ? input.model.trim().slice(0, 200)
      : LARPROUTER_MODEL;
    const payload = JSON.stringify({
      model: reqModel,
      max_tokens: 1024,
      messages: [{ role: "system", content: systemPrompt }].concat(clean)
    });
    const target = new URL(LARPROUTER_BASE + "/chat/completions");
    const upMod = target.protocol === "http:" ? http : https;
    let responded = false;
    const replyOnce = (status, obj) => {
      if (responded) return;
      responded = true;
      sendJson(res, status, obj);
    };
    const up = upMod.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: "Bearer " + LARPROUTER_KEY
      },
      timeout: 60000
    }, (upRes) => {
      const chunks = [];
      upRes.on("data", (c) => chunks.push(c));
      upRes.on("end", () => {
        let data = null;
        try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { /* abaikan */ }
        if (upRes.statusCode !== 200 || !data || !data.choices ||
            !data.choices[0] || !data.choices[0].message) {
          const detail = data && data.error && data.error.message
            ? String(data.error.message).slice(0, 300)
            : "Larprouter tidak mengembalikan jawaban.";
          replyOnce(502, { error: "larprouter_gagal", message: detail });
          return;
        }
        replyOnce(200, { reply: data.choices[0].message.content, model: reqModel });
      });
    });
    up.on("timeout", () => { up.destroy(new Error("timeout")); });
    up.on("error", () => {
      replyOnce(502, {
        error: "larprouter_gagal",
        message: "Tidak bisa menghubungi Larprouter. Periksa koneksi internet / LARPROUTER_BASE_URL di .env."
      });
    });
    up.write(payload);
    up.end();
  }).catch(() => { sendJson(res, 400, { error: "body_tidak_valid" }); });
}

// ---------- Daftar model -> Larprouter ----------
// GET /api/models (loopback saja, seperti /api/chat): daftar model live
// dari Larprouter bila kunci ada; kalau tidak, daftar cadangan.
function handleModels(req, res) {
  if (!isLoopback(req)) {
    sendJson(res, 403, { error: "forbidden", message: "Endpoint /api/models hanya untuk pemakaian lokal." });
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_tidak_didukung" });
    return;
  }
  let responded = false;
  const once = (obj) => { if (!responded) { responded = true; sendJson(res, 200, obj); } };
  const fallback = () => once({ models: FALLBACK_MODELS.slice(), source: "fallback" });
  if (!API_KEY_CONFIGURED) { fallback(); return; }
  const target = new URL(LARPROUTER_BASE + "/models");
  const mod = target.protocol === "http:" ? http : https;
  const up = mod.request({
    method: "GET",
    hostname: target.hostname,
    port: target.port || (target.protocol === "http:" ? 80 : 443),
    path: target.pathname + target.search,
    headers: { Authorization: "Bearer " + LARPROUTER_KEY },
    timeout: 15000
  }, (upRes) => {
    const chunks = [];
    upRes.on("data", (c) => chunks.push(c));
    upRes.on("end", () => {
      let data = null;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { /* abaikan */ }
      const ids = data && Array.isArray(data.data) ? data.data
        .map((m) => (m && typeof m.id === "string" ? m.id : null))
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 100) : [];
      if (upRes.statusCode !== 200 || !ids.length) { fallback(); return; }
      once({ models: ids, source: "live" });
    });
  });
  up.on("timeout", () => { up.destroy(new Error("timeout")); });
  up.on("error", () => fallback());
  up.end();
}

// ---------- Chat multi-user (ruang + pesan, via berkas JSON) ----------
// Pesan tinggal di berkas rutbhics-chat.json di folder kerja (bertahan
// saat server di-restart, tidak hilang saat package di-update). Batas:
// 20 ruang, 500 pesan terakhir per ruang, nama 30 karakter, teks 2000.
// Sengaja tanpa gate loopback (berbeda dengan /api/chat): perangkat lain
// di jaringan harus bisa membaca/mengirim. Tahap 1 tanpa akun server.
const CHAT_FILE = path.join(process.cwd(), "rutbhics-chat.json");
let chatData = { rooms: [{ id: "umum", name: "Umum" }], messages: { umum: [] }, seq: 0 };
try {
  const raw = fs.readFileSync(CHAT_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && Array.isArray(parsed.rooms) && parsed.messages && typeof parsed.seq === "number") chatData = parsed;
} catch (e) { /* mulai kosong */ }
if (!chatData.rooms.some((r) => r.id === "umum")) chatData.rooms.unshift({ id: "umum", name: "Umum" });
if (!Array.isArray(chatData.messages.umum)) chatData.messages.umum = [];
function saveChat() {
  try { fs.writeFileSync(CHAT_FILE, JSON.stringify(chatData)); } catch (e) { /* tetap jalan di memori */ }
}
function slugRoom(name) {
  let s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!s) s = "ruang";
  let id = s, i = 2;
  while (chatData.rooms.some((r) => r.id === id)) { id = s + "-" + i; i += 1; }
  return id;
}
function handleRooms(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["api","rooms",id?,"messages"?]
  if (req.method === "GET" && parts.length === 2) {
    sendJson(res, 200, { rooms: chatData.rooms });
    return;
  }
  if (req.method === "POST" && parts.length === 2) {
    const me = sessionUser(req);
    if (!me) { sendJson(res, 401, { error: "login_diperlukan" }); return; }
    readBody(req, 65536).then((raw) => {
      let input;
      try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length > 50) { sendJson(res, 400, { error: "nama_ruang_tidak_valid" }); return; }
      if (chatData.rooms.length >= 20) { sendJson(res, 400, { error: "ruang_penuh" }); return; }
      const room = { id: slugRoom(name), name: name.slice(0, 50) };
      chatData.rooms.push(room);
      chatData.messages[room.id] = [];
      saveChat();
      sendJson(res, 200, { room });
    }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
    return;
  }
  if (parts.length === 4 && parts[3] === "messages") {
    const roomId = decodeURIComponent(parts[2]);
    if (!/^[a-z0-9-]{1,50}$/.test(roomId) || !chatData.messages[roomId]) {
      sendJson(res, 404, { error: "ruang_tidak_ditemukan" });
      return;
    }
    if (req.method === "GET") {
      const since = parseInt(url.searchParams.get("since"), 10) || 0;
      const msgs = chatData.messages[roomId].filter((m) => m.seq > since).slice(-200);
      sendJson(res, 200, { messages: msgs, seq: chatData.seq });
      return;
    }
    if (req.method === "POST") {
      const me = sessionUser(req);
      if (!me) { sendJson(res, 401, { error: "login_diperlukan" }); return; }
      readBody(req, 65536).then((raw) => {
        let input;
        try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
        const text = typeof input.text === "string" ? input.text.trim() : "";
        if (!text || text.length > 2000) {
          sendJson(res, 400, { error: "pesan_tidak_valid" });
          return;
        }
        chatData.seq += 1;
        const msg = { seq: chatData.seq, user: me.username, text: text.slice(0, 2000), time: Date.now() };
        chatData.messages[roomId].push(msg);
        if (chatData.messages[roomId].length > 500) chatData.messages[roomId] = chatData.messages[roomId].slice(-500);
        saveChat();
        sendJson(res, 200, { message: msg });
      }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
      return;
    }
  }
  sendJson(res, 404, { error: "tidak_ditemukan" });
}

// ---------- Akun pengguna (login/register multi-metode) ----------
// Akun disimpan di rutbhics-users.json di folder kerja (bertahan saat
// server di-restart). Metode: (1) username/email/HP + kata sandi
// (hash scrypt + salt di server), (2) OAuth Google/GitHub bila
// client id/secret tersedia di environment. Sesi memakai cookie
// httpOnly (30 hari); membaca ruang/pesan tetap terbuka, tapi membuat
// ruang dan mengirim pesan wajib login.
const USERS_FILE = path.join(process.cwd(), "rutbhics-users.json");
let usersData = { users: [], sessions: {} };
try {
  const raw = fs.readFileSync(USERS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && Array.isArray(parsed.users) && parsed.sessions && typeof parsed.sessions === "object") usersData = parsed;
} catch (e) { /* mulai kosong */ }
function saveUsers() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(usersData)); } catch (e) { /* tetap jalan di memori */ }
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return "scrypt:" + salt + ":" + hash;
}
function checkPassword(pw, stored) {
  try {
    const parts = stored.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const hash = crypto.scryptSync(pw, parts[1], 64);
    const want = Buffer.from(parts[2], "hex");
    return hash.length === want.length && crypto.timingSafeEqual(hash, want);
  } catch (e) { return false; }
}
function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email || "", phone: u.phone || "", provider: u.provider || "local" };
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  usersData.sessions[token] = { userId, expires: Date.now() + 30 * 24 * 3600 * 1000 };
  saveUsers();
  return token;
}
function sessionUser(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("rutbhics_token="));
  if (!m) return null;
  const token = m.slice("rutbhics_token=".length);
  const sess = usersData.sessions[token];
  if (!sess || sess.expires < Date.now()) return null;
  return usersData.users.find((u) => u.id === sess.userId) || null;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", "rutbhics_token=" + token + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000");
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "rutbhics_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}
function normPhone(raw) {
  return (raw || "").replace(/[\s\-()]/g, "");
}
function validUsername(name) { return /^[A-Za-z0-9_.-]{3,30}$/.test(name); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validPhone(phone) { return /^\+?\d{8,15}$/.test(phone); }
function slugUsername(name) {
  let s = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!s) s = "pengguna";
  if (s.length > 30) s = s.slice(0, 30);
  let out = s, i = 2;
  while (usersData.users.some((u) => u.username.toLowerCase() === out.toLowerCase())) { out = s + "-" + i; i += 1; }
  return out;
}
// Throttle login: maks 10 gagal per IP per 10 menit.
const loginFails = {};
function loginBlocked(ip) {
  const rec = loginFails[ip];
  if (!rec) return false;
  if (Date.now() - rec.first > 10 * 60 * 1000) { delete loginFails[ip]; return false; }
  return rec.count >= 10;
}
function noteLoginFail(ip) {
  const now = Date.now();
  const rec = loginFails[ip];
  if (!rec || now - rec.first > 10 * 60 * 1000) loginFails[ip] = { count: 1, first: now };
  else rec.count += 1;
}
function oauthConfig(provider) {
  if (provider === "google") {
    return process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET } : null;
  }
  if (provider === "github") {
    return process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? { id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET } : null;
  }
  return null;
}
function oauthBase(req) {
  return (process.env.OAUTH_REDIRECT_BASE || "").replace(/\/$/, "") || ("http://" + req.headers.host);
}
const oauthStates = {};
function httpsPostForm(urlStr, params, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = new URLSearchParams(params).toString();
    const r = https.request({
      method: "POST", hostname: u.hostname, path: u.pathname + u.search,
      headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }, extraHeaders || {})
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
          else reject(new Error("oauth_status_" + res.statusCode));
        } catch (e) { reject(e); }
      });
    });
    r.on("error", reject);
    r.write(body);
    r.end();
  });
}
function httpsGetJson(urlStr, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const r = https.request({
      method: "GET", hostname: u.hostname, path: u.pathname + u.search,
      headers: Object.assign({ "User-Agent": "Rutbhics" }, extraHeaders || {})
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
          else reject(new Error("oauth_status_" + res.statusCode));
        } catch (e) { reject(e); }
      });
    });
    r.on("error", reject);
    r.end();
  });
}
function oauthFail(res, msg) {
  res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>Login gagal</h1><p>" + msg + "</p><p><a href='/'>Kembali ke Rutbhics</a></p>");
}
function handleAuth(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["api","auth",...]
  const action = parts[2] || "";
  if (req.method === "GET" && action === "providers" && parts.length === 3) {
    sendJson(res, 200, { password: true, google: !!oauthConfig("google"), github: !!oauthConfig("github") });
    return;
  }
  if (req.method === "GET" && action === "me" && parts.length === 3) {
    const u = sessionUser(req);
    if (!u) { sendJson(res, 401, { error: "login_diperlukan" }); return; }
    sendJson(res, 200, { user: publicUser(u) });
    return;
  }
  if (req.method === "POST" && action === "logout" && parts.length === 3) {
    const cookie = req.headers.cookie || "";
    const m = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("rutbhics_token="));
    if (m) delete usersData.sessions[m.slice("rutbhics_token=".length)];
    saveUsers();
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && action === "register" && parts.length === 3) {
    readBody(req, 65536).then((raw) => {
      let input;
      try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
      const username = typeof input.username === "string" ? input.username.trim() : "";
      const email = typeof input.email === "string" ? input.email.trim() : "";
      const phone = normPhone(typeof input.phone === "string" ? input.phone : "");
      const password = typeof input.password === "string" ? input.password : "";
      if (!validUsername(username)) { sendJson(res, 400, { error: "username_tidak_valid" }); return; }
      if (email && !validEmail(email)) { sendJson(res, 400, { error: "email_tidak_valid" }); return; }
      if (phone && !validPhone(phone)) { sendJson(res, 400, { error: "hp_tidak_valid" }); return; }
      if (!password || password.length < 8) { sendJson(res, 400, { error: "password_terlalu_pendek" }); return; }
      if (usersData.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) { sendJson(res, 400, { error: "username_sudah_dipakai" }); return; }
      if (email && usersData.users.some((u) => (u.email || "").toLowerCase() === email.toLowerCase())) { sendJson(res, 400, { error: "email_sudah_dipakai" }); return; }
      if (phone && usersData.users.some((u) => u.phone === phone)) { sendJson(res, 400, { error: "hp_sudah_dipakai" }); return; }
      const user = { id: crypto.randomBytes(16).toString("hex"), username, email, phone, passHash: hashPassword(password), provider: "local", providerId: "", createdAt: Date.now() };
      usersData.users.push(user);
      const token = createSession(user.id);
      setSessionCookie(res, token);
      sendJson(res, 200, { user: publicUser(user) });
    }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
    return;
  }
  if (req.method === "POST" && action === "login" && parts.length === 3) {
    const ip = (req.socket && req.socket.remoteAddress) || "unknown";
    if (loginBlocked(ip)) { sendJson(res, 429, { error: "terlalu_banyak_percobaan" }); return; }
    readBody(req, 65536).then((raw) => {
      let input;
      try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
      const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
      const phoneId = normPhone(identifier);
      const password = typeof input.password === "string" ? input.password : "";
      const user = usersData.users.find((u) =>
        u.username.toLowerCase() === identifier.toLowerCase() ||
        (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
        (u.phone && phoneId && u.phone === phoneId));
      if (!user || !user.passHash || !checkPassword(password, user.passHash)) {
        noteLoginFail(ip);
        sendJson(res, 401, { error: "kredensial_salah" });
        return;
      }
      delete loginFails[ip];
      const token = createSession(user.id);
      setSessionCookie(res, token);
      sendJson(res, 200, { user: publicUser(user) });
    }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
    return;
  }
  if (req.method === "GET" && (action === "google" || action === "github") && parts.length === 3) {
    const cfg = oauthConfig(action);
    if (!cfg) { sendJson(res, 400, { error: "oauth_tidak_dikonfigurasi" }); return; }
    Object.keys(oauthStates).forEach((k) => { if (Date.now() - oauthStates[k].createdAt > 10 * 60 * 1000) delete oauthStates[k]; });
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates[state] = { provider: action, createdAt: Date.now() };
    const redirectUri = oauthBase(req) + "/api/auth/" + action + "/callback";
    let target;
    if (action === "google") {
      target = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encodeURIComponent(cfg.id)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&response_type=code&scope=" + encodeURIComponent("openid email profile")
        + "&state=" + state;
    } else {
      target = "https://github.com/login/oauth/authorize?client_id=" + encodeURIComponent(cfg.id)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&scope=" + encodeURIComponent("read:user user:email")
        + "&state=" + state;
    }
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }
  if (req.method === "GET" && (action === "google" || action === "github") && parts.length === 4 && parts[3] === "callback") {
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const rec = oauthStates[state];
    delete oauthStates[state];
    if (!rec || rec.provider !== action || Date.now() - rec.createdAt > 10 * 60 * 1000 || !code) {
      oauthFail(res, "Tautan login tidak valid atau sudah kedaluwarsa. Coba lagi dari Rutbhics.");
      return;
    }
    const cfg = oauthConfig(action);
    if (!cfg) { oauthFail(res, "Login ini belum dikonfigurasi di server."); return; }
    const redirectUri = oauthBase(req) + "/api/auth/" + action + "/callback";
    (async () => {
      try {
        let profile;
        if (action === "google") {
          const tok = await httpsPostForm("https://oauth2.googleapis.com/token", {
            code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri, grant_type: "authorization_code"
          });
          if (!tok.access_token) throw new Error("no_token");
          const info = await httpsGetJson("https://www.googleapis.com/oauth2/v3/userinfo", { Authorization: "Bearer " + tok.access_token });
          profile = { providerId: String(info.sub || ""), username: info.name || info.email || "", email: info.email || "" };
        } else {
          const tok = await httpsPostForm("https://github.com/login/oauth/access_token", {
            client_id: cfg.id, client_secret: cfg.secret, code, redirect_uri: redirectUri
          }, { Accept: "application/json" });
          if (!tok.access_token) throw new Error("no_token");
          const gh = await httpsGetJson("https://api.github.com/user", { Authorization: "Bearer " + tok.access_token, Accept: "application/vnd.github+json" });
          let email = gh.email || "";
          if (!email) {
            try {
              const emails = await httpsGetJson("https://api.github.com/user/emails", { Authorization: "Bearer " + tok.access_token, Accept: "application/vnd.github+json" });
              const primary = (Array.isArray(emails) ? emails : []).find((e) => e.primary && e.verified) || (Array.isArray(emails) ? emails[0] : null);
              email = primary ? primary.email : "";
            } catch (e) { /* email opsional */ }
          }
          profile = { providerId: String(gh.id || ""), username: gh.login || gh.name || "", email };
        }
        if (!profile.providerId) throw new Error("no_profile");
        let user = usersData.users.find((u) => u.provider === action && u.providerId === profile.providerId);
        if (!user) {
          const emailTaken = profile.email && usersData.users.some((u) => (u.email || "").toLowerCase() === profile.email.toLowerCase());
          user = { id: crypto.randomBytes(16).toString("hex"), username: slugUsername(profile.username), email: emailTaken ? "" : (profile.email || ""), phone: "", passHash: "", provider: action, providerId: profile.providerId, createdAt: Date.now() };
          usersData.users.push(user);
          saveUsers();
        }
        const token = createSession(user.id);
        setSessionCookie(res, token);
        res.writeHead(302, { Location: "/" });
        res.end();
      } catch (e) {
        oauthFail(res, "Gagal mengambil profil dari " + (action === "google" ? "Google" : "GitHub") + ". Coba lagi.");
      }
    })();
    return;
  }
  sendJson(res, 404, { error: "tidak_ditemukan" });
}

// Perintah setup mandiri: tanya kunci Larprouter, simpan ke .env folder
// kerja (lokasi permanen yang tidak hilang saat package di-update), lalu
// berhenti — server tidak dijalankan.
if (process.argv.includes("--setup")) {
  try {
    const setup = require(path.join(__dirname, "..", "scripts", "setup-larprouter.js"));
    setup.runSetup(path.join(process.cwd(), ".env"));
  } catch (e) { /* setup tidak pernah menggagalkan perintah */ }
  process.exit(0);
}

const port = parsePort(process.argv.slice(2));
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/chat") { handleChat(req, res); return; }
    if (url.pathname === "/api/models") { handleModels(req, res); return; }
    if (url.pathname === "/api/rooms" || url.pathname.startsWith("/api/rooms/")) { handleRooms(req, res); return; }
    if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) { handleAuth(req, res); return; }
    // Jangan pernah melayani dotfile (termasuk .env) sebagai berkas statis.
    if (url.pathname.startsWith("/.")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Tidak ditemukan");
      return;
    }
    let filePath = path.normalize(path.join(ROOT, url.pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Tidak ditemukan");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Terjadi kesalahan");
  }
});
server.listen(port, () => {
  console.log("Rutbhics berjalan di http://localhost:" + port);
  console.log("Buka alamat itu di browser. Tekan Ctrl+C untuk berhenti.");
  if (API_KEY_CONFIGURED) {
    console.log("Bot AI: aktif (model " + LARPROUTER_MODEL + ")");
  } else {
    console.log("Bot AI: nonaktif — jalankan `rutbhics --setup` atau isi LARPROUTER_API_KEY di .env untuk mengaktifkan AI.");
  }
});

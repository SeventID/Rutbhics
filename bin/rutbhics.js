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
//   loopback: perangkat lain di jaringan harus bisa ikut. Tahap 1 tanpa
//   akun server — nama pengirim adalah klaim perangkat.
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
      readBody(req, 65536).then((raw) => {
        let input;
        try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
        const user = typeof input.user === "string" ? input.user.trim() : "";
        const text = typeof input.text === "string" ? input.text.trim() : "";
        if (!user || user.length > 30 || !text || text.length > 2000) {
          sendJson(res, 400, { error: "pesan_tidak_valid" });
          return;
        }
        chatData.seq += 1;
        const msg = { seq: chatData.seq, user: user.slice(0, 30), text: text.slice(0, 2000), time: Date.now() };
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

#!/usr/bin/env node
// Rutbhics — server lokal, tanpa dependensi.
// Pakai: rutbhics [--port 8080]  atau  PORT=8080 rutbhics
//        rutbhics --setup   (tanya & simpan kunci Larprouter ke .env folder kerja)
// Lalu buka http://localhost:8080 di browser.
//
// Selain berkas statis, server ini menyediakan:
//   POST /api/chat — proxy ke Larprouter (chat completions) untuk semua
//   kontak di aplikasi Obrolan (Teman, Grup Keluarga, Bot Asisten, dengan
//   persona masing-masing). Kunci API TIDAK PERNAH dikirim ke browser: kunci
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
    const payload = JSON.stringify({
      model: LARPROUTER_MODEL,
      max_tokens: 1024,
      messages: [{ role: "system", content: systemPrompt }].concat(clean)
    });
    const target = new URL(LARPROUTER_BASE + "/chat/completions");
    let responded = false;
    const replyOnce = (status, obj) => {
      if (responded) return;
      responded = true;
      sendJson(res, status, obj);
    };
    const up = https.request({
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
        replyOnce(200, { reply: data.choices[0].message.content });
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

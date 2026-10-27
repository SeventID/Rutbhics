#!/usr/bin/env node
// Rutbhics — server lokal, tanpa dependensi.
// Pakai: rutbhics [--port 8080] [--host 127.0.0.1]  atau  PORT=8080 rutbhics
//        rutbhics --setup   (tanya & simpan kunci Larprouter ke .env folder kerja)
// Lalu buka http://localhost:8080 di browser.
//
// Selain berkas statis, server ini menyediakan:
//   POST /api/chat — proxy ke provider AI (chat completions) untuk semua
//   kontak di aplikasi Obrolan (Teman, Grup Keluarga, Bot Asisten, dengan
//   persona masing-masing). Klien boleh menyertakan "model" di body untuk
//   memilih model per percakapan; tanpa itu dipakai model bawaan server.
//   GET /api/models — daftar model gabungan "provider:model" dari semua
//   provider aktif (live dari upstream bila perlu; kalau tidak ada
//   provider aktif, daftar cadangan).
//   config.json (opsional, di folder kerja atau folder paket) — setelan
//   seperti port dan daftar provider AI (Anthropic, Gemini, DeepSeek,
//   OpenAI, Larprouter, ...). Kunci API TIDAK PERNAH di config.json:
//   config hanya menunjuk nama variabel env (apiKeyEnv), kunci dibaca
//   dari .env. Lihat config.example.json. Prioritas port: --port >
//   PORT > config.port > 8080.
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

// ---------- config.json multi-provider (gaya router AI) ----------
// Berkas opsional: folder kerja dulu, lalu folder paket. Bila tidak ada,
// perilaku bawaan persis seperti dulu (hanya Larprouter dari env).
// SKEMA: { port?, providers[] } — provider: { id, name?, type
// ("openai"|"anthropic"|"gemini"), baseUrl, apiKeyEnv (NAMA variabel
// env), models[]?, defaultModel? }. KUNCI TIDAK PERNAH DI config.json:
// bila ada field "apiKey" di config, field itu DIABAIKAN; kunci selalu
// dibaca dari process.env (loader .env di atas).
function loadUserConfig() {
  const files = [path.join(process.cwd(), "config.json"), path.join(ROOT, "config.json")];
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (e) {
      if (e && e.code !== "ENOENT") console.error("[rutbhics] config.json tidak bisa dibaca, diabaikan: " + f);
    }
  }
  return {};
}
const USER_CONFIG = loadUserConfig();

function cleanBaseUrl(u) {
  return (typeof u === "string" ? u.trim() : "").replace(/\/+$/, "");
}
function buildProviders() {
  const list = [];
  const cfgProviders = Array.isArray(USER_CONFIG.providers) ? USER_CONFIG.providers : [];
  // Provider bawaan Larprouter dari env; entri config id "larprouter"
  // menggabungkan baseUrl/models/defaultModel bila ada (env menang
  // untuk baseUrl dan defaultModel bila diset; kunci selalu dari env).
  const cfgLar = cfgProviders.find((p) => p && p.id === "larprouter");
  const lar = {
    id: "larprouter",
    name: "Larprouter",
    type: "openai",
    baseUrl: process.env.LARPROUTER_BASE_URL ? LARPROUTER_BASE : (cfgLar && cleanBaseUrl(cfgLar.baseUrl)) || LARPROUTER_BASE,
    apiKeyEnv: "LARPROUTER_API_KEY",
    key: LARPROUTER_KEY,
    models: [],
    defaultModel: process.env.LARPROUTER_MODEL || (cfgLar && typeof cfgLar.defaultModel === "string" && cfgLar.defaultModel.trim()) || "deepseek-v4.1-flash"
  };
  if (cfgLar && Array.isArray(cfgLar.models)) {
    lar.models = cfgLar.models.filter((m) => typeof m === "string" && m.trim()).slice(0, 100);
  }
  if (cfgLar && typeof cfgLar.name === "string" && cfgLar.name.trim()) lar.name = cfgLar.name;
  list.push(lar);
  const seen = new Set(["larprouter"]);
  for (const p of cfgProviders) {
    if (!p || typeof p !== "object" || p.id === "larprouter") continue;
    if (typeof p.id !== "string" || !p.id.trim()) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (p.type !== "openai" && p.type !== "anthropic" && p.type !== "gemini") continue;
    const baseUrl = cleanBaseUrl(p.baseUrl);
    if (!baseUrl) continue;
    if (typeof p.apiKeyEnv !== "string" || !p.apiKeyEnv.trim()) continue;
    if (p.apiKey !== undefined) {
      console.error('[rutbhics] provider "' + p.id + '": field "apiKey" di config.json diabaikan — kunci hanya dari .env (' + p.apiKeyEnv + ").");
    }
    list.push({
      id: p.id,
      name: (typeof p.name === "string" && p.name.trim()) || p.id,
      type: p.type,
      baseUrl,
      apiKeyEnv: p.apiKeyEnv,
      key: process.env[p.apiKeyEnv] || "",
      models: Array.isArray(p.models) ? p.models.filter((m) => typeof m === "string" && m.trim()).slice(0, 100) : [],
      defaultModel: (typeof p.defaultModel === "string" && p.defaultModel.trim()) || ""
    });
  }
  return list;
}
const PROVIDERS = buildProviders();
function activeProviders() {
  return PROVIDERS.filter((p) => p.key);
}
// Model bawaan server dalam format "provider:model" (untuk dropdown).
function serverDefaultModel() {
  const active = activeProviders();
  if (!active.length) return LARPROUTER_MODEL;
  const lar = active.find((p) => p.id === "larprouter");
  const p = lar || active[0];
  const m = p.defaultModel || (p.models[0] || "");
  return m ? p.id + ":" + m : p.id;
}
// "provider:model" -> provider itu; tanpa prefix -> cari di daftar models
// semua provider aktif; bila tidak ketemu -> provider larprouter (bila
// aktif) atau provider aktif pertama (kompatibilitas lama).
function resolveModel(reqModel) {
  const colon = reqModel.indexOf(":");
  if (colon > 0) {
    const pid = reqModel.slice(0, colon);
    const mid = reqModel.slice(colon + 1);
    const p = PROVIDERS.find((x) => x.id === pid);
    if (!p) return { unknownProvider: true };
    if (!p.key) return { inactiveProvider: true, provider: p };
    return { provider: p, model: mid };
  }
  const active = activeProviders();
  for (const p of active) {
    if (p.models.includes(reqModel) || (p.defaultModel && p.defaultModel === reqModel)) {
      return { provider: p, model: reqModel };
    }
  }
  const lar = active.find((p) => p.id === "larprouter");
  const fallback = lar || active[0];
  if (!fallback) return { unknownProvider: true };
  return { provider: fallback, model: reqModel };
}
// Gabungkan pesan berurutan dengan role sama (Anthropic & Gemini menolak
// role berurutan). Pesan digabung dengan baris kosong ganda.
function mergeRoles(msgs) {
  const out = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}
// Permintaan JSON generik (http/https sesuai protokol) -> { status, data }.
function httpJson(opts) {
  return new Promise((resolve, reject) => {
    const target = new URL(opts.url);
    const mod = target.protocol === "http:" ? http : https;
    const body = opts.body || null;
    const r = mod.request({
      method: opts.method || "GET",
      hostname: target.hostname,
      port: target.port || (target.protocol === "http:" ? 80 : 443),
      path: target.pathname + target.search,
      headers: opts.headers || {},
      timeout: opts.timeoutMs || 60000
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let data = null;
        try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { /* abaikan */ }
        resolve({ status: res.statusCode, data });
      });
    });
    r.on("timeout", () => { r.destroy(new Error("timeout")); });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}
function providerErrorCode(provider) {
  return provider.id === "larprouter" ? "larprouter_gagal" : "provider_gagal";
}
async function callOpenAi(provider, model, systemPrompt, clean) {
  const payload = JSON.stringify({
    model,
    max_tokens: 1024,
    messages: [{ role: "system", content: systemPrompt }].concat(clean)
  });
  const res = await httpJson({
    url: provider.baseUrl + "/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      Authorization: "Bearer " + provider.key
    },
    body: payload,
    timeoutMs: 60000
  });
  const data = res.data;
  if (res.status !== 200 || !data || !data.choices || !data.choices[0] || !data.choices[0].message) {
    const detail = data && data.error && data.error.message
      ? String(data.error.message).slice(0, 300)
      : provider.name + " tidak mengembalikan jawaban.";
    throw new Error(detail);
  }
  return data.choices[0].message.content;
}
async function callAnthropic(provider, model, systemPrompt, clean) {
  const payload = JSON.stringify({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: mergeRoles(clean)
  });
  const res = await httpJson({
    url: provider.baseUrl + "/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "x-api-key": provider.key,
      "anthropic-version": "2023-06-01"
    },
    body: payload,
    timeoutMs: 60000
  });
  const data = res.data;
  const texts = data && Array.isArray(data.content)
    ? data.content.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text)
    : [];
  if (res.status !== 200 || !texts.length) {
    const detail = data && data.error && data.error.message
      ? String(data.error.message).slice(0, 300)
      : provider.name + " tidak mengembalikan jawaban.";
    throw new Error(detail);
  }
  return texts.join("");
}
async function callGemini(provider, model, systemPrompt, clean) {
  const contents = mergeRoles(clean).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const body = {
    contents,
    generationConfig: { maxOutputTokens: 1024 }
  };
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };
  const payload = JSON.stringify(body);
  const res = await httpJson({
    url: provider.baseUrl + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(provider.key),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    },
    body: payload,
    timeoutMs: 60000
  });
  const data = res.data;
  const parts = data && Array.isArray(data.candidates) && data.candidates[0] && data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)
    ? data.candidates[0].content.parts.filter((p) => p && typeof p.text === "string").map((p) => p.text)
    : [];
  if (res.status !== 200 || !parts.length) {
    const detail = data && data.error && data.error.message
      ? String(data.error.message).slice(0, 300)
      : provider.name + " tidak mengembalikan jawaban.";
    throw new Error(detail);
  }
  return parts.join("");
}
async function callProvider(provider, model, systemPrompt, clean) {
  if (provider.type === "anthropic") return callAnthropic(provider, model, systemPrompt, clean);
  if (provider.type === "gemini") return callGemini(provider, model, systemPrompt, clean);
  return callOpenAi(provider, model, systemPrompt, clean);
}
async function fetchOpenAiModels(provider) {
  try {
    const res = await httpJson({
      url: provider.baseUrl + "/models",
      method: "GET",
      headers: { Authorization: "Bearer " + provider.key },
      timeoutMs: 15000
    });
    if (res.status !== 200 || !res.data || !Array.isArray(res.data.data)) return [];
    return res.data.data
      .map((m) => (m && typeof m.id === "string" ? m.id : null))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 100);
  } catch (e) { return []; }
}

function parsePort(argv) {
  // Prioritas: --port > PORT > config.port > 8080 (yang tidak valid dilewati).
  const valid = (n) => Number.isInteger(n) && n >= 1 && n <= 65535;
  const i = argv.indexOf("--port");
  if (i !== -1 && argv[i + 1]) {
    const p = parseInt(argv[i + 1], 10);
    if (valid(p)) return p;
  }
  const e = parseInt(process.env.PORT, 10);
  if (valid(e)) return e;
  const c = parseInt(USER_CONFIG.port, 10);
  if (valid(c)) return c;
  return 8080;
}

function parseHost(argv) {
  // Default loopback (P1-1): server hanya mendengarkan 127.0.0.1 kecuali
  // operator meminta lain lewat --host (mis. 0.0.0.0 untuk LAN).
  const i = argv.indexOf("--host");
  if (i !== -1 && argv[i + 1]) {
    const h = argv[i + 1].trim();
    if (/^[A-Za-z0-9.:-]+$/.test(h)) return h;
    console.error("[rutbhics] --host tidak valid (" + h + "), pakai 127.0.0.1.");
  }
  return "127.0.0.1";
}

function isLoopback(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

// Origin yang diizinkan untuk endpoint loopback (/api/chat, /api/models):
// tanpa Origin, atau Origin dengan host loopback (localhost/127.0.0.1/::1,
// skema http/https, port berapa pun). Origin asing ditolak — gate loopback
// saja tidak cukup karena request browser korban juga berasal dari
// loopback (P1-2).
function isLoopbackOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch (e) { return false; }
}

// Header keamanan dasar (P2a) untuk SEMUA respons. CSP sengaja belum
// ditambah: skrip inline di index.html/login.html akan rusak.
function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, securityHeaders()));
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
// ---------- Proxy Bot AI -> multi-provider (config.json) ----------
function handleChat(req, res) {
  // Hanya dari perangkat ini: kunci dibayar pemiliknya, jangan sampai
  // dipakai perangkat lain yang se-jaringan.
  if (!isLoopback(req)) {
    sendJson(res, 403, { error: "forbidden", message: "Endpoint /api/chat hanya untuk pemakaian lokal." });
    return;
  }
  if (!isLoopbackOrigin(req)) {
    sendJson(res, 403, { error: "origin_tidak_diizinkan", message: "Origin tidak diizinkan untuk endpoint lokal." });
    return;
  }
  if (req.method === "GET") {
    const active = activeProviders();
    sendJson(res, 200, { active: active.length > 0, model: serverDefaultModel() });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_tidak_didukung" });
    return;
  }
  if (!activeProviders().length) {
    sendJson(res, 503, {
      error: "bot_ai_tidak_aktif",
      message: "Bot AI belum aktif: isi kunci API provider di berkas .env (salin dari .env.example), lalu jalankan ulang rutbhics."
    });
    return;
  }
  readBody(req, 65536).then(async (raw) => {
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
    // Tanpa itu dipakai model bawaan server (provider:model).
    const reqModelRaw = typeof input.model === "string" && input.model.trim()
      ? input.model.trim().slice(0, 200)
      : "";
    let resolved;
    if (reqModelRaw) {
      resolved = resolveModel(reqModelRaw);
    } else {
      const active = activeProviders();
      const lar = active.find((p) => p.id === "larprouter");
      const p = lar || active[0];
      let m = p.defaultModel || (p.models[0] || "");
      if (!m && p.type === "openai") {
        const live = await fetchOpenAiModels(p);
        if (live.length) m = live[0];
      }
      if (!m) { sendJson(res, 400, { error: "model_tidak_ditemukan" }); return; }
      resolved = { provider: p, model: m };
    }
    if (!resolved || resolved.unknownProvider) {
      sendJson(res, 400, { error: "provider_tidak_dikenal" });
      return;
    }
    if (resolved.inactiveProvider) {
      sendJson(res, 503, {
        error: "provider_tidak_aktif",
        message: "Provider " + resolved.provider.name + " belum dikonfigurasi kuncinya di .env."
      });
      return;
    }
    const replyModel = reqModelRaw || (resolved.provider.id + ":" + resolved.model);
    try {
      const reply = await callProvider(resolved.provider, resolved.model, systemPrompt, clean);
      sendJson(res, 200, { reply, model: replyModel });
    } catch (e) {
      sendJson(res, 502, {
        error: providerErrorCode(resolved.provider),
        message: (e && e.message ? String(e.message) : resolved.provider.name + " tidak mengembalikan jawaban.").slice(0, 300)
      });
    }
  }).catch(() => { sendJson(res, 400, { error: "body_tidak_valid" }); });
}

// ---------- Daftar model -> Larprouter ----------
// GET /api/models (loopback saja, seperti /api/chat): daftar model live
// dari Larprouter bila kunci ada; kalau tidak, daftar cadangan.
// ---------- Daftar model gabungan dari semua provider aktif ----------
// GET /api/models (loopback saja, seperti /api/chat): "provider:model"
// hanya dari provider yang kuncinya ada. Provider openai dengan models
// kosong diambil live dari {baseUrl}/models; anthropic/gemini wajib dari
// config. Bila gabungan kosong, kembali ke daftar cadangan lama.
async function handleModels(req, res) {
  if (!isLoopback(req)) {
    sendJson(res, 403, { error: "forbidden", message: "Endpoint /api/models hanya untuk pemakaian lokal." });
    return;
  }
  if (!isLoopbackOrigin(req)) {
    sendJson(res, 403, { error: "origin_tidak_diizinkan", message: "Origin tidak diizinkan untuk endpoint lokal." });
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_tidak_didukung" });
    return;
  }
  const active = activeProviders();
  if (!active.length) {
    sendJson(res, 200, { models: FALLBACK_MODELS.slice(), source: "fallback" });
    return;
  }
  const combined = [];
  let usedLive = false;
  const liveJobs = [];
  for (const p of active) {
    if (p.models.length) {
      for (const m of p.models) combined.push(p.id + ":" + m);
    } else if (p.type === "openai") {
      liveJobs.push(p);
    }
  }
  if (liveJobs.length) {
    const results = await Promise.all(liveJobs.map((p) => fetchOpenAiModels(p)));
    results.forEach((ids, i) => {
      if (ids.length) usedLive = true;
      for (const m of ids) combined.push(liveJobs[i].id + ":" + m);
    });
  }
  const deduped = combined.filter((v, i, a) => a.indexOf(v) === i).slice(0, 200);
  if (!deduped.length) {
    sendJson(res, 200, { models: FALLBACK_MODELS.slice(), source: "fallback" });
    return;
  }
  sendJson(res, 200, { models: deduped, source: usedLive ? "live" : "config" });
}

// ---------- Chat multi-user (ruang + pesan, via berkas JSON) ----------
// Pesan tinggal di berkas rutbhics-chat.json di folder kerja (bertahan
// saat server di-restart, tidak hilang saat package di-update). Batas:
// 20 ruang, 500 pesan terakhir per ruang, nama 30 karakter, teks 2000.
// Sengaja tanpa gate loopback (berbeda dengan /api/chat): perangkat lain
// di jaringan harus bisa membaca/mengirim. Tahap 1 tanpa akun server.
const CHAT_FILE = path.join(process.cwd(), "rutbhics-chat.json");
// ---------- Persistensi atomik + backup (P1-3) ----------
// Tulis lewat berkas temp + rename agar crash di tengah tulis tidak
// meninggalkan berkas setengah. .bak hanya ditimpa bila berkas lama
// masih valid (supaya backup tidak pernah berisi data korup). Gagal
// simpan dicatat ke stderr, tidak ditelan diam-diam.
function backupIfValid(file) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    fs.copyFileSync(file, file + ".bak");
  } catch (e) { /* berkas lama hilang/korup: jangan timpa backup */ }
}
function atomicSave(file, data) {
  const tmp = file + ".tmp-" + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data));
    backupIfValid(file);
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("[rutbhics] GAGAL menyimpan " + file + ": " + (e && e.message ? e.message : e));
    try { fs.unlinkSync(tmp); } catch (e2) { /* abaikan */ }
  }
}
function loadJsonWithBackup(file, validate) {
  const tryParse = (f) => {
    try {
      const p = JSON.parse(fs.readFileSync(f, "utf8"));
      return validate(p) ? p : null;
    } catch (e) { return null; }
  };
  const data = tryParse(file);
  if (data) return data;
  const bak = tryParse(file + ".bak");
  if (bak) {
    console.error("[rutbhics] PERINGATAN: " + file + " rusak/tidak valid, dipulihkan dari " + file + ".bak");
    return bak;
  }
  if (fs.existsSync(file)) {
    console.error("[rutbhics] PERINGATAN KERAS: " + file + " rusak dan tidak ada backup valid — mulai dari data kosong.");
  }
  return null;
}
let chatData = { rooms: [{ id: "umum", name: "Umum" }], messages: { umum: [] }, seq: 0 };
const loadedChat = loadJsonWithBackup(CHAT_FILE, (x) => x && Array.isArray(x.rooms) && x.messages && typeof x.seq === "number");
if (loadedChat) chatData = loadedChat;
if (!chatData.rooms.some((r) => r.id === "umum")) chatData.rooms.unshift({ id: "umum", name: "Umum" });
if (!Array.isArray(chatData.messages.umum)) chatData.messages.umum = [];
function saveChat() {
  atomicSave(CHAT_FILE, chatData);
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
const loadedUsers = loadJsonWithBackup(USERS_FILE, (x) => x && Array.isArray(x.users) && x.sessions && typeof x.sessions === "object");
if (loadedUsers) usersData = loadedUsers;
pruneSessions(true);
function saveUsers() {
  atomicSave(USERS_FILE, usersData);
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
  if (!sess) return null;
  if (sess.expires < Date.now()) { delete usersData.sessions[token]; return null; }
  return usersData.users.find((u) => u.id === sess.userId) || null;
}
// Prune sesi kedaluwarsa (P1-5): hapus dari memori; simpan hanya bila
// diminta (agar operasi baca tidak memicu tulis tiap request).
function pruneSessions(persist) {
  const now = Date.now();
  let removed = 0;
  for (const tk of Object.keys(usersData.sessions)) {
    if (!usersData.sessions[tk] || usersData.sessions[tk].expires < now) {
      delete usersData.sessions[tk];
      removed += 1;
    }
  }
  if (removed && persist) saveUsers();
  return removed;
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
// Throttle registrasi: maks 5 percobaan per IP per jam (P1-4). Dihitung
// untuk percobaan berformat valid (termasuk yang gagal karena duplikat)
// agar enumerasi akun ikut terhambat; format tidak valid tidak dihitung.
const registerAttempts = {};
function registerBlocked(ip) {
  const rec = registerAttempts[ip];
  if (!rec) return false;
  if (Date.now() - rec.first > 60 * 60 * 1000) { delete registerAttempts[ip]; return false; }
  return rec.count >= 5;
}
function noteRegisterAttempt(ip) {
  const now = Date.now();
  const rec = registerAttempts[ip];
  if (!rec || now - rec.first > 60 * 60 * 1000) registerAttempts[ip] = { count: 1, first: now };
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
  res.writeHead(400, Object.assign({ "Content-Type": "text/html; charset=utf-8" }, securityHeaders()));
  res.end("<h1>Login gagal</h1><p>" + msg + "</p><p><a href='/'>Kembali ke Rutbhics</a></p>");
}
function handleAuth(req, res) {
  pruneSessions(false);
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
  if (req.method === "POST" && action === "logout-all" && parts.length === 3) {
    const me = sessionUser(req);
    if (!me) { sendJson(res, 401, { error: "login_diperlukan" }); return; }
    let revoked = 0;
    for (const tk of Object.keys(usersData.sessions)) {
      if (usersData.sessions[tk] && usersData.sessions[tk].userId === me.id) {
        delete usersData.sessions[tk];
        revoked += 1;
      }
    }
    saveUsers();
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true, revoked });
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
      const regIp = (req.socket && req.socket.remoteAddress) || "unknown";
      if (registerBlocked(regIp)) { sendJson(res, 429, { error: "pendaftaran_dibatasi" }); return; }
      noteRegisterAttempt(regIp);
      // Pesan generik (P1-4): jangan bocorkan field mana yang sudah dipakai.
      if (usersData.users.some((u) => u.username.toLowerCase() === username.toLowerCase())
        || (email && usersData.users.some((u) => (u.email || "").toLowerCase() === email.toLowerCase()))
        || (phone && usersData.users.some((u) => u.phone === phone))) {
        sendJson(res, 400, { error: "pendaftaran_gagal" });
        return;
      }
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
    res.writeHead(302, Object.assign({ Location: target }, securityHeaders()));
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
        res.writeHead(302, Object.assign({ Location: "/" }, securityHeaders()));
        res.end();
      } catch (e) {
        oauthFail(res, "Gagal mengambil profil dari " + (action === "google" ? "Google" : "GitHub") + ". Coba lagi.");
      }
    })();
    return;
  }
  sendJson(res, 404, { error: "tidak_ditemukan" });
}

// Perintah setup mandiri: tanya kunci Larprouter (dan model bawaan),
// simpan ke .env folder kerja (lokasi permanen yang tidak hilang saat
// package di-update), lalu berhenti — server tidak dijalankan.
if (process.argv.includes("--setup")) {
  try {
    const setup = require(path.join(__dirname, "..", "scripts", "setup-larprouter.js"));
    setup.runSetup(path.join(process.cwd(), ".env"), { askModel: true });
  } catch (e) { /* setup tidak pernah menggagalkan perintah */ }
  process.exit(0);
}

const port = parsePort(process.argv.slice(2));
const host = parseHost(process.argv.slice(2));
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/chat") { handleChat(req, res); return; }
    if (url.pathname === "/api/models") { handleModels(req, res); return; }
    if (url.pathname === "/api/rooms" || url.pathname.startsWith("/api/rooms/")) { handleRooms(req, res); return; }
    if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) { handleAuth(req, res); return; }
    // Jangan pernah melayani dotfile (termasuk .env) sebagai berkas statis.
    if (url.pathname.startsWith("/.")) {
      res.writeHead(404, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, securityHeaders()));
      res.end("Tidak ditemukan");
      return;
    }
    // Jangan pernah melayani berkas data server sebagai berkas statis
    // (P0-1): saat folder kerja == folder paket, berkas ini ada di ROOT
    // dan bukan dotfile, jadi aturan dotfile saja tidak cukup. Aturan
    // awalan juga menutupi .bak/.tmp-* dari persistensi atomik.
    const BLOCKED_DATA = ["rutbhics-chat.json", "rutbhics-users.json", "config.json"];
    let decodedPath = url.pathname;
    try { decodedPath = decodeURIComponent(url.pathname); } catch (e) { /* pakai mentah */ }
    const baseName = path.basename(decodedPath);
    if (BLOCKED_DATA.some((n) => baseName === n || baseName.startsWith(n + "."))) {
      res.writeHead(404, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, securityHeaders()));
      res.end("Tidak ditemukan");
      return;
    }
    let filePath = path.normalize(path.join(ROOT, url.pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, securityHeaders()));
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, securityHeaders()));
        res.end("Tidak ditemukan");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, Object.assign({ "Content-Type": MIME[ext] || "application/octet-stream" }, securityHeaders()));
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, securityHeaders()));
    res.end("Terjadi kesalahan");
  }
});
setInterval(() => pruneSessions(true), 60 * 60 * 1000).unref();
server.listen(port, host, () => {
  console.log("Rutbhics berjalan di http://" + host + ":" + port + (host === "0.0.0.0" ? " (semua interface)" : ""));
  if (host === "0.0.0.0") {
    console.log("PERINGATAN: server terbuka ke jaringan — pakai firewall/reverse proxy, jangan biarkan port terbuka ke internet tanpa perlindungan.");
  }
  console.log("Buka alamat itu di browser. Tekan Ctrl+C untuk berhenti.");
  const activeIds = activeProviders().map((p) => p.id);
  if (activeIds.length) {
    console.log("Bot AI: aktif (model " + serverDefaultModel() + ")");
    console.log("Penyedia AI aktif: " + activeIds.join(", "));
  } else {
    console.log("Bot AI: nonaktif — jalankan `rutbhics --setup` atau isi kunci API provider di .env untuk mengaktifkan AI.");
    console.log("Penyedia AI aktif: tidak ada");
  }
});

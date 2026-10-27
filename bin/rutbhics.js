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
//   Akses digate mode AI_ACCESS (S1): local = loopback saja tanpa login,
//   login = wajib sesi (lihat resolveAiAccessMode + README Deployment).
//   GET /api/models — daftar model gabungan "provider:model" dari semua
//   provider aktif (live dari upstream bila perlu; kalau tidak ada
//   provider aktif, daftar cadangan). Gate sama seperti /api/chat.
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
// Nama model tidak boleh mengandung ":" (S2, P3-N8): parsing
// "provider:model" memotong di ":" pertama, jadi model ber-":" tidak
// bisa dipakai utuh (terutama sebagai nama tanpa prefix). Entri yang
// ditolak dicatat di log startup dan tidak dipakai. Entri non-string
// atau kosong tetap dibuang diam-diam seperti sebelumnya.
function validModelName(m, owner) {
  if (typeof m !== "string" || !m.trim()) return false;
  if (m.includes(":")) {
    console.error('[rutbhics] ' + owner + ': nama model "' + m + '" mengandung ":", ditolak (tidak bisa dipakai dalam format "provider:model").');
    return false;
  }
  return true;
}
function buildProviders() {
  const list = [];
  const cfgProviders = Array.isArray(USER_CONFIG.providers) ? USER_CONFIG.providers : [];
  // Provider bawaan Larprouter dari env; entri config id "larprouter"
  // menggabungkan baseUrl/models/defaultModel bila ada (env menang
  // untuk baseUrl dan defaultModel bila diset; kunci selalu dari env).
  const cfgLar = cfgProviders.find((p) => p && p.id === "larprouter");
  let cfgLarDefault = "";
  if (cfgLar && typeof cfgLar.defaultModel === "string" && cfgLar.defaultModel.trim()) {
    if (cfgLar.defaultModel.includes(":")) {
      console.error('[rutbhics] provider "larprouter": defaultModel "' + cfgLar.defaultModel + '" mengandung ":", diabaikan.');
    } else {
      cfgLarDefault = cfgLar.defaultModel.trim();
    }
  }
  const lar = {
    id: "larprouter",
    name: "Larprouter",
    type: "openai",
    baseUrl: process.env.LARPROUTER_BASE_URL ? LARPROUTER_BASE : (cfgLar && cleanBaseUrl(cfgLar.baseUrl)) || LARPROUTER_BASE,
    apiKeyEnv: "LARPROUTER_API_KEY",
    key: LARPROUTER_KEY,
    models: [],
    defaultModel: process.env.LARPROUTER_MODEL || cfgLarDefault || "deepseek-v4.1-flash"
  };
  if (cfgLar && Array.isArray(cfgLar.models)) {
    lar.models = cfgLar.models.filter((m) => validModelName(m, 'provider "larprouter"')).slice(0, 100);
  }
  if (cfgLar && typeof cfgLar.name === "string" && cfgLar.name.trim()) lar.name = cfgLar.name;
  list.push(lar);
  const seen = new Set(["larprouter"]);
  for (const p of cfgProviders) {
    if (!p || typeof p !== "object" || p.id === "larprouter") continue;
    if (typeof p.id !== "string" || !p.id.trim()) continue;
    // Id dipakai dalam format "provider:model" (resolveModel memotong di
    // ":" pertama): ":" akan memecah parsing, spasi dan "/" merusak
    // pencocokan/pembacaan. Provider bermasalah diabaikan dengan
    // peringatan; server tetap jalan dengan provider lain.
    if (/[:\s/]/.test(p.id)) {
      console.error('[rutbhics] provider "' + p.id + '": id tidak valid (tidak boleh mengandung ":", spasi, atau "/"), diabaikan.');
      continue;
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (p.type !== "openai" && p.type !== "anthropic" && p.type !== "gemini") continue;
    const baseUrl = cleanBaseUrl(p.baseUrl);
    if (!baseUrl) continue;
    if (typeof p.apiKeyEnv !== "string" || !p.apiKeyEnv.trim()) continue;
    if (p.apiKey !== undefined) {
      console.error('[rutbhics] provider "' + p.id + '": field "apiKey" di config.json diabaikan — kunci hanya dari .env (' + p.apiKeyEnv + ").");
    }
    let pDefault = (typeof p.defaultModel === "string" && p.defaultModel.trim()) || "";
    if (pDefault.includes(":")) {
      console.error('[rutbhics] provider "' + p.id + '": defaultModel "' + pDefault + '" mengandung ":", diabaikan.');
      pDefault = "";
    }
    list.push({
      id: p.id,
      name: (typeof p.name === "string" && p.name.trim()) || p.id,
      type: p.type,
      baseUrl,
      apiKeyEnv: p.apiKeyEnv,
      key: process.env[p.apiKeyEnv] || "",
      models: Array.isArray(p.models) ? p.models.filter((m) => validModelName(m, 'provider "' + p.id + '"')).slice(0, 100) : [],
      defaultModel: pDefault
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
// Model yang diminta harus ada di models[]/defaultModel provider itu
// (S2, P1-N1). Provider openai dengan models kosong divalidasi terhadap
// daftar live (cache 5 menit); bila daftar live gagal diambil, model
// ditolak (bukan diteruskan tak tervalidasi).
async function isModelAllowed(p, mid) {
  if (p.models.includes(mid)) return true;
  if (p.defaultModel && p.defaultModel === mid) return true;
  if (p.type === "openai" && !p.models.length) {
    const live = await fetchOpenAiModels(p);
    return live.includes(mid);
  }
  return false;
}
// "provider:model" -> provider itu + validasi allowlist; tanpa prefix ->
// cari di daftar models semua provider aktif (termasuk daftar live
// provider openai kosong); bila tidak ketemu -> { unknownModel }
// (bukan lagi jatuh ke provider pertama dengan string apa adanya).
async function resolveModel(reqModel) {
  const colon = reqModel.indexOf(":");
  if (colon > 0) {
    const pid = reqModel.slice(0, colon);
    const mid = reqModel.slice(colon + 1);
    const p = PROVIDERS.find((x) => x.id === pid);
    if (!p) return { unknownProvider: true };
    if (!p.key) return { inactiveProvider: true, provider: p };
    if (await isModelAllowed(p, mid)) return { provider: p, model: mid };
    return { unknownModel: true, provider: p };
  }
  const active = activeProviders();
  for (const p of active) {
    if (p.models.includes(reqModel) || (p.defaultModel && p.defaultModel === reqModel)) {
      return { provider: p, model: reqModel };
    }
  }
  for (const p of active) {
    if (p.type === "openai" && !p.models.length) {
      const live = await fetchOpenAiModels(p);
      if (live.includes(reqModel)) return { provider: p, model: reqModel };
    }
  }
  return { unknownModel: true };
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
// Cache daftar model live OpenAI (S2): 5 menit per provider, agar
// validasi model + /api/models tidak memanggil upstream tiap request.
// Hanya hasil sukses yang di-cache; gagal fetch tidak di-cache (request
// berikutnya mencoba lagi, dan validasi model lalu menolak -> 400).
const openAiModelsCache = new Map();
async function fetchOpenAiModels(provider) {
  const cached = openAiModelsCache.get(provider.id);
  if (cached && Date.now() - cached.at < 300000) return cached.ids;
  try {
    const res = await httpJson({
      url: provider.baseUrl + "/models",
      method: "GET",
      headers: { Authorization: "Bearer " + provider.key },
      timeoutMs: 15000
    });
    if (res.status !== 200 || !res.data || !Array.isArray(res.data.data)) return [];
    const ids = res.data.data
      .map((m) => (m && typeof m.id === "string" ? m.id : null))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 100);
    openAiModelsCache.set(provider.id, { at: Date.now(), ids });
    return ids;
  } catch (e) { return []; }
}

function parsePort(argv) {
  // Prioritas: --port > PORT > config.port > 8080. Nilai harus numerik
  // penuh ("8080abc" ditolak, bukan dipotong jadi 8080); yang tidak
  // valid dilewati dengan peringatan (seperti --host).
  const valid = (n) => Number.isInteger(n) && n >= 1 && n <= 65535;
  const strictNum = (v) => {
    if (typeof v === "number") return valid(v) ? v : null;
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return valid(n) ? n : null;
  };
  const i = argv.indexOf("--port");
  if (i !== -1 && argv[i + 1] !== undefined) {
    const p = strictNum(argv[i + 1]);
    if (p !== null) return p;
    console.error('[rutbhics] --port tidak valid ("' + argv[i + 1] + '"), dilewati.');
  }
  if (process.env.PORT !== undefined) {
    const p = strictNum(process.env.PORT);
    if (p !== null) return p;
    console.error('[rutbhics] PORT tidak valid ("' + process.env.PORT + '"), dilewati.');
  }
  if (USER_CONFIG.port !== undefined) {
    const p = strictNum(USER_CONFIG.port);
    if (p !== null) return p;
    console.error("[rutbhics] config.port tidak valid, dilewati.");
  }
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

// Gate mode login (S1): alamat socket TIDAK berperan sama sekali —
// Origin dapat dipalsukan klien lewat proxy, jadi tidak boleh menjadi
// pengecualian tanpa login. Tanpa sesi -> 401 untuk SEMUA varian Origin;
// ada sesi + (tanpa Origin ATAU Origin PERSIS == Host header,
// skema+host+port) -> izinkan; ada sesi + Origin lain (termasuk Origin
// loopback port lain, mis. localhost:9999 ke server localhost:8080) ->
// 403 (defense-in-depth CSRF; SameSite=Lax menahan cookie lintas SITE,
// bukan lintas ORIGIN — dua port localhost adalah satu site, jadi cookie
// tetap terkirim dari halaman loopback port lain, A2-01).
// Mengembalikan null bila diizinkan, atau {status, error, message}.
function aiAccessLogin(req) {
  const me = sessionUser(req);
  if (!me) return { status: 401, error: "login_diperlukan", message: "Endpoint AI memerlukan login." };
  const origin = req.headers.origin;
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if ((u.protocol === "http:" || u.protocol === "https:") && u.host !== "" && u.host === (req.headers.host || "").trim().toLowerCase()) return null;
  } catch (e) { /* jatuh ke 403 */ }
  return { status: 403, error: "origin_tidak_diizinkan", message: "Origin tidak diizinkan untuk endpoint AI." };
}

// Cek Origin exact-origin untuk POST tulis (P2b, A2-01): lolos bila tanpa
// Origin (klien non-browser), atau Origin PERSIS == Host header
// (skema+host+port). Situs asing selalu ditolak, dan halaman loopback
// port lain juga ditolak: SameSite=Lax menahan cookie lintas SITE, bukan
// lintas ORIGIN, jadi halaman localhost port lain masih membawa cookie
// sesi. Akses LAN via IP tetap jalan karena klien selalu same-origin;
// split-hosting (desktop statis dari port lain) mendapat 403 pada tulis —
// layani desktop dari server yang sama.
function hostNameOf(hostHeader) {
  const h = (hostHeader || "").trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? h : h.slice(1, end);
  }
  return h.split(":")[0];
}
function isSameOriginWrite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.host !== "" && u.host === (req.headers.host || "").trim().toLowerCase();
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

// ---------- Proxy Bot AI -> multi-provider (config.json) ----------
// Provider bawaan Larprouter termasuk dalam daftar provider; klien
// memilih model lewat "provider:model" atau model bawaan server.
function handleChat(req, res) {
  if (aiAccessMode === "local") warnProxyOnce(req);
  // Gate akses AI (S1): mode login -> aiAccessLogin (socket diabaikan);
  // mode local -> perilaku lama PERSIS (gate socket + gate Origin).
  if (aiAccessMode === "login") {
    const gate = aiAccessLogin(req);
    if (gate) { sendJson(res, gate.status, { error: gate.error, message: gate.message }); return; }
  } else {
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
    // Model divalidasi terhadap allowlist provider (S2): tak dikenal
    // -> 400 model_tidak_dikenal (bukan diteruskan ke upstream).
    // Tanpa itu dipakai model bawaan server (provider:model).
    const reqModelRaw = typeof input.model === "string" && input.model.trim()
      ? input.model.trim().slice(0, 200)
      : "";
    let resolved;
    if (reqModelRaw) {
      resolved = await resolveModel(reqModelRaw);
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
    if (resolved.unknownModel) {
      sendJson(res, 400, { error: "model_tidak_dikenal", message: "Model tidak tersedia untuk provider yang diminta." });
      return;
    }
    if (resolved.inactiveProvider) {
      sendJson(res, 503, {
        error: "provider_tidak_aktif",
        message: "Provider " + resolved.provider.name + " belum dikonfigurasi kuncinya di .env."
      });
      return;
    }
    // Kuota AI (S4): hanya pengguna login; pemakaian anonim mode local
    // dibebaskan (hanya mungkin dari perangkat pemilik sendiri).
    // Dihitung attempt: lolos gate S1 + allowlist S2, diteruskan ke
    // provider — ditempatkan di sini, setelah semua validasi model dan
    // sebelum callProvider, tanpa await di antaranya.
    const quotaUser = sessionUser(req);
    if (quotaUser) {
      const quotaErr = aiQuotaCheck(quotaUser);
      if (quotaErr) { sendJson(res, quotaErr.status, { error: quotaErr.error, message: quotaErr.message }); return; }
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
  if (aiAccessMode === "local") warnProxyOnce(req);
  // Gate akses AI (S1, sama seperti /api/chat).
  if (aiAccessMode === "login") {
    const gate = aiAccessLogin(req);
    if (gate) { sendJson(res, gate.status, { error: gate.error, message: gate.message }); return; }
  } else {
    if (!isLoopback(req)) {
      sendJson(res, 403, { error: "forbidden", message: "Endpoint /api/models hanya untuk pemakaian lokal." });
      return;
    }
    if (!isLoopbackOrigin(req)) {
      sendJson(res, 403, { error: "origin_tidak_diizinkan", message: "Origin tidak diizinkan untuk endpoint lokal." });
      return;
    }
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
// di jaringan harus bisa membaca/mengirim. Membaca ruang/pesan terbuka;
// membuat ruang dan mengirim pesan wajib login (akun server).
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
// Dasar slug bersama (dipakai slugRoom + slugUsername di bawah): huruf
// kecil, ganti selain a-z0-9 dengan "-", pangkas "-" di ujung; kosong
// -> fallback. (Perilaku lama dipertahankan: slugUsername memotong
// 30 karakter setelah ini; slugRoom tanpa batas panjang.)
function slugBase(name, fallback) {
  let s = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || fallback;
}
function slugRoom(name) {
  let s = slugBase(name, "ruang");
  let id = s, i = 2;
  while (chatData.rooms.some((r) => r.id === id)) { id = s + "-" + i; i += 1; }
  return id;
}
// ---------- Visibilitas ruang (privat) ----------
// Ruang lama tanpa field visibility = publik (kompatibilitas mundur,
// tanpa migrasi data). Ruang privat hanya terlihat/dibaca/ditulis
// anggotanya; pembuat selalu dianggap anggota (juga bila members
// entah bagaimana tidak mencantumkannya). Serialisasi: publik hanya
// {id, name, visibility}; privat untuk anggota ditambah createdBy +
// members; non-anggota tidak pernah menerima objek ruang privat.
function roomVisibility(room) {
  return room && room.visibility === "private" ? "private" : "public";
}
function roomIsMember(room, username) {
  if (!username) return false;
  if (room && room.createdBy === username) return true;
  return !!(room && Array.isArray(room.members) && room.members.includes(username));
}
function roomViewFor(room, me) {
  if (roomVisibility(room) === "public") {
    return { id: room.id, name: room.name, visibility: "public" };
  }
  if (me && roomIsMember(room, me.username)) {
    return { id: room.id, name: room.name, visibility: "private", createdBy: room.createdBy || "", members: Array.isArray(room.members) ? room.members.slice() : [] };
  }
  return null;
}
function handleRooms(req, res) {
  if (req.method === "POST" && !isSameOriginWrite(req)) {
    sendJson(res, 403, { error: "origin_tidak_diizinkan" });
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["api","rooms",id?,"messages"?]
  if (req.method === "GET" && parts.length === 2) {
    const me = sessionUser(req);
    const rooms = [];
    for (const room of chatData.rooms) {
      const view = roomViewFor(room, me);
      if (view) rooms.push(view);
    }
    sendJson(res, 200, { rooms });
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
      let visibility = "public";
      if (input.visibility !== undefined && input.visibility !== null && input.visibility !== "") {
        if (input.visibility !== "public" && input.visibility !== "private") { sendJson(res, 400, { error: "visibilitas_tidak_valid" }); return; }
        visibility = input.visibility;
      }
      if (chatData.rooms.length >= 20) { sendJson(res, 400, { error: "ruang_penuh" }); return; }
      // Batas ruang per pengguna (S4): 5 ruang/pengguna, di samping cap
      // global 20 yang tidak berubah. Dihitung dari createdBy (username
      // pembuat); ruang lama tanpa createdBy tidak dihitung ke siapa pun.
      const ownedRooms = chatData.rooms.filter((r) => r.createdBy === me.username).length;
      if (ownedRooms >= 5) { sendJson(res, 429, { error: "batas_ruang_per_pengguna", message: "Batas ruang per pengguna tercapai (maks 5 ruang)." }); return; }
      const room = { id: slugRoom(name), name: name.slice(0, 50), visibility, createdBy: me.username };
      if (visibility === "private") room.members = [me.username];
      chatData.rooms.push(room);
      chatData.messages[room.id] = [];
      saveChat();
      sendJson(res, 200, { room: roomViewFor(room, me) });
    }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
    return;
  }
  if (parts.length === 4 && parts[3] === "messages") {
    const roomId = decodeURIComponent(parts[2]);
    if (!/^[a-z0-9-]{1,50}$/.test(roomId) || !chatData.messages[roomId]) {
      sendJson(res, 404, { error: "ruang_tidak_ditemukan" });
      return;
    }
    const room = chatData.rooms.find((r) => r.id === roomId);
    if (roomVisibility(room) === "private") {
      const gateMe = sessionUser(req);
      if (!gateMe) { sendJson(res, 401, { error: "login_diperlukan" }); return; }
      if (!roomIsMember(room, gateMe.username)) { sendJson(res, 403, { error: "bukan_anggota" }); return; }
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
        // Rate limit pesan per pengguna (S4): burst 10/menit + 100/jam,
        // dihitung dari pesan yang tersimpan saja; baca tidak dibatasi.
        const rateErr = msgRateCheck(me.id);
        if (rateErr) { sendJson(res, rateErr.status, { error: rateErr.error, message: rateErr.message }); return; }
        chatData.seq += 1;
        const msg = { seq: chatData.seq, user: me.username, text: text.slice(0, 2000), time: Date.now() };
        chatData.messages[roomId].push(msg);
        msgRateNote(me.id);
        if (chatData.messages[roomId].length > 500) chatData.messages[roomId] = chatData.messages[roomId].slice(-500);
        saveChat();
        sendJson(res, 200, { message: msg });
      }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
      return;
    }
  }
  if (req.method === "POST" && parts.length === 4 && parts[3] === "members") {
    const me = sessionUser(req);
    if (!me) { sendJson(res, 401, { error: "login_diperlukan" }); return; }
    const roomId = decodeURIComponent(parts[2]);
    const room = chatData.rooms.find((r) => r.id === roomId);
    if (!room || !chatData.messages[roomId]) { sendJson(res, 404, { error: "ruang_tidak_ditemukan" }); return; }
    if (roomVisibility(room) === "public") { sendJson(res, 400, { error: "ruang_publik" }); return; }
    if (room.createdBy !== me.username) { sendJson(res, 403, { error: "bukan_pembuat" }); return; }
    readBody(req, 65536).then((raw) => {
      let input;
      try { input = JSON.parse(raw); } catch (e) { sendJson(res, 400, { error: "json_tidak_valid" }); return; }
      const username = typeof input.username === "string" ? input.username.trim() : "";
      if (!username) { sendJson(res, 400, { error: "username_tidak_valid" }); return; }
      const user = usersData.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user) { sendJson(res, 404, { error: "pengguna_tidak_ditemukan" }); return; }
      if (!Array.isArray(room.members)) room.members = room.createdBy ? [room.createdBy] : [];
      if (!room.members.includes(user.username)) {
        room.members.push(user.username);
        saveChat();
      }
      sendJson(res, 200, { ok: true, room: roomViewFor(room, me) });
    }).catch(() => sendJson(res, 400, { error: "body_tidak_valid" }));
    return;
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
// Scrypt dummy (A2-02): menyamakan waktu respons gagal yang tidak
// menjalankan scrypt asli (login tak-dikenal, register duplikat) dengan
// jalur scrypt asli (~109ms). Input tetap, bukan password kiriman, agar
// waktunya tidak bergantung pada input penyerang; hasil dibuang — bukan
// hash yang disimpan atau dibandingkan. Parameter sama persis dengan
// produksi: scryptSync(pw, salt, 64) tanpa opsi (default N16384/r8/p1).
function dummyScrypt() {
  crypto.scryptSync("rutbhics-dummy-password", "rutbhics-dummy-salt", 64);
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
  let s = slugBase(name, "pengguna");
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
// Throttle tahan proxy (S3, P1-N3): IP klien untuk throttle login/register.
// TRUSTED_PROXIES = daftar alamat proxy tepercaya, dipisahkan koma
// (default loopback saja: 127.0.0.1, ::1 — tanpa rentang CIDR pada tahap
// ini, hanya pencocokan persis). Bila alamat socket adalah proxy tepercaya
// DAN header X-Forwarded-For ada, pakai entri pertamanya sebagai IP klien;
// bila tidak, XFF diabaikan total — klien langsung yang memalsukan XFF
// tidak boleh menggeser anggaran orang lain. Dengan Nginx yang menimpa
// XFF menjadi $remote_addr, XFF hanya berisi satu entri (klien asli).
// Entri dipakai apa adanya (trim) sebagai kunci bucket throttle saja —
// tidak pernah dipakai untuk kontrol akses — dan tidak divalidasi
// formatnya; proxy yang menambahkan port akan membuat bucket per port,
// jadi konfigurasikan proxy mengirim IP polos. Alamat loopback yang
// dipetakan IPv4 (::ffff:127.0.0.1) dinormalisasi ke bentuk IPv4-nya agar
// cocok dengan daftar tepercaya.
function normProxyIp(a) {
  let s = (a || "").trim().toLowerCase();
  if (s.startsWith("::ffff:") && s.slice(7).includes(".")) s = s.slice(7);
  return s;
}
function trustedProxies() {
  const raw = (process.env.TRUSTED_PROXIES || "").trim();
  if (!raw) return ["127.0.0.1", "::1"];
  return raw.split(",").map((s) => normProxyIp(s)).filter(Boolean);
}
function clientIp(req) {
  const sock = (req.socket && req.socket.remoteAddress) || "unknown";
  if (!trustedProxies().includes(normProxyIp(sock))) return sock;
  const xff = req.headers["x-forwarded-for"];
  if (!xff) return sock;
  const first = xff.split(",")[0].trim();
  return first || sock;
}
// Throttle login per AKUN (S3): di samping per IP, agar serangan terhadap
// satu akun tidak mengunci semua akun (dan sebaliknya). Ambang sama
// dengan throttle IP: 10 gagal per akun per 10 menit. Kunci: "u:<id>"
// untuk pengguna yang ditemukan (username/email/HP apa pun yang dipakai
// menuju akun yang sama), "i:<identifier>" untuk identifier tak dikenal
// — agar percobaan terhadap nama yang belum terdaftar tidak mengunci akun
// yang baru dibuat kemudian (kuncinya berbeda).
const loginFailsByAccount = {};
function loginAccountBlocked(key) {
  const rec = loginFailsByAccount[key];
  if (!rec) return false;
  if (Date.now() - rec.first > 10 * 60 * 1000) { delete loginFailsByAccount[key]; return false; }
  return rec.count >= 10;
}
function noteLoginAccountFail(key) {
  const now = Date.now();
  const rec = loginFailsByAccount[key];
  if (!rec || now - rec.first > 10 * 60 * 1000) loginFailsByAccount[key] = { count: 1, first: now };
  else rec.count += 1;
}
// ---------- Kuota AI + batas penyalahgunaan (S4, P1-N2) ----------
// Kuota AI per pengguna per hari: env AI_QUOTA_PER_DAY (default 50;
// "0" = tanpa batas; nilai tak valid/negatif -> default 50). Hari =
// tanggal lokal server (YYYY-MM-DD), reset otomatis berganti hari.
// Yang dihitung adalah attempt: panggilan chat yang lolos gate S1 +
// allowlist S2 dan diteruskan ke provider (gagal provider tetap
// dihitung). Hitungan disimpan di rutbhics-users.json (ikut saveUsers
// atomik) pada tiap increment; hitungan di memori otoritatif selama
// proses berjalan, sehingga kuota hari berjalan bertahan saat restart.
// Hanya pengguna login yang dikenai kuota; pemakaian AI anonim mode
// local dibebaskan karena hanya mungkin dari perangkat pemilik sendiri
// (gate socket memblokir non-loopback) — kuota adalah kontrol multi-user.
function localDay(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function aiQuotaLimit() {
  const raw = (process.env.AI_QUOTA_PER_DAY || "").trim();
  if (raw === "0") return 0;
  if (!/^\d+$/.test(raw)) return 50;
  return parseInt(raw, 10);
}
function aiQuotaCheck(user) {
  const limit = aiQuotaLimit();
  if (limit === 0) return null;
  if (!usersData.aiQuota || typeof usersData.aiQuota !== "object") usersData.aiQuota = {};
  const today = localDay(new Date());
  let rec = usersData.aiQuota[user.id];
  if (!rec || rec.date !== today) { rec = { date: today, count: 0 }; usersData.aiQuota[user.id] = rec; }
  if (rec.count >= limit) {
    return { status: 429, error: "kuota_habis", message: "Kuota AI harian habis (" + limit + " panggilan/hari). Coba lagi besok." };
  }
  rec.count += 1;
  saveUsers();
  return null;
}
// Rate limit pesan per pengguna (S4): burst 10/menit + sustained
// 100/jam, dihitung dari pesan yang tersimpan saja (baca tidak
// dibatasi). Hanya di memori (window waktu berlalu sendiri); restart
// mengatur ulang window — dapat diterima karena batas ini anti-spam,
// bukan akuntansi. Array timestamp per pengguna dibatasi cap jam
// (maks ~100 entri).
const msgRateByUser = {};
function msgRateCheck(userId) {
  const now = Date.now();
  let arr = msgRateByUser[userId];
  if (!Array.isArray(arr)) arr = msgRateByUser[userId] = [];
  arr = arr.filter((t) => t > now - 3600000);
  msgRateByUser[userId] = arr;
  const minute = arr.filter((t) => t > now - 60000).length;
  if (minute >= 10) return { status: 429, error: "pesan_terlalu_cepat", message: "Terlalu banyak pesan dalam satu menit (maks 10). Tunggu sebentar." };
  if (arr.length >= 100) return { status: 429, error: "batas_pesan_per_jam", message: "Batas pesan per jam tercapai (maks 100). Coba lagi nanti." };
  return null;
}
function msgRateNote(userId) {
  if (!Array.isArray(msgRateByUser[userId])) msgRateByUser[userId] = [];
  msgRateByUser[userId].push(Date.now());
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
// Cookie pengikat OAuth (A2-03, anti login CSRF): lihat komentar di
// initiate. Nilai pengikat acak terpisah dari state, disimpan di record
// state; callback wajib membawa cookie yang cocok.
function oauthBindCookie(bind) {
  return "rutbhics_oauth_bind=" + bind + "; HttpOnly; SameSite=Lax; Max-Age=600; Path=/api/auth/";
}
function clearOAuthBindCookie() {
  return "rutbhics_oauth_bind=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/api/auth/";
}
// Perbandingan pengikat waktu-konstan (bila panjang sama); panjang beda
// -> tidak valid. Cookie hilang -> string kosong -> tidak valid.
function oauthBindMatches(cookieVal, stored) {
  if (typeof cookieVal !== "string" || typeof stored !== "string") return false;
  const a = Buffer.from(cookieVal, "utf8"), b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
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
function oauthFail(res, msg, extraHeaders) {
  res.writeHead(400, Object.assign({ "Content-Type": "text/html; charset=utf-8" }, securityHeaders(), extraHeaders || {}));
  res.end("<h1>Login gagal</h1><p>" + msg + "</p><p><a href='/'>Kembali ke Rutbhics</a></p>");
}
function handleAuth(req, res) {
  pruneSessions(false);
  if (req.method === "POST" && !isSameOriginWrite(req)) {
    sendJson(res, 403, { error: "origin_tidak_diizinkan" });
    return;
  }
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
      const regIp = clientIp(req);
      if (registerBlocked(regIp)) { sendJson(res, 429, { error: "pendaftaran_dibatasi" }); return; }
      noteRegisterAttempt(regIp);
      // Pesan generik (P1-4): jangan bocorkan field mana yang sudah dipakai.
      if (usersData.users.some((u) => u.username.toLowerCase() === username.toLowerCase())
        || (email && usersData.users.some((u) => (u.email || "").toLowerCase() === email.toLowerCase()))
        || (phone && usersData.users.some((u) => u.phone === phone))) {
        // A2-02: jalur baru menjalankan hashPassword (scrypt) — samakan
        // waktu 400 duplikat dengan scrypt dummy sebelum pesan generik.
        // Berjalan SETELAH pemeriksaan throttle register (429 tak berubah).
        dummyScrypt();
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
    const ip = clientIp(req);
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
      const accountKey = user ? ("u:" + user.id) : ("i:" + identifier.toLowerCase());
      if (loginAccountBlocked(accountKey)) { sendJson(res, 429, { error: "terlalu_banyak_percobaan" }); return; }
      if (!user || !user.passHash || !checkPassword(password, user.passHash)) {
        // A2-02: checkPassword tidak berjalan bila pengguna tidak
        // ditemukan / tanpa passHash (short-circuit di atas) — jalankan
        // scrypt dummy agar 401 tak-dikenal setara waktunya dengan 401
        // salah password. Tanpa ini, selisih ~100ms membocorkan
        // eksistensi identifier. Berjalan SETELAH kedua pemeriksaan
        // throttle (429 tidak berubah waktunya).
        if (!user || !user.passHash) dummyScrypt();
        noteLoginFail(ip);
        noteLoginAccountFail(accountKey);
        sendJson(res, 401, { error: "kredensial_salah" });
        return;
      }
      delete loginFails[ip];
      delete loginFailsByAccount[accountKey];
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
    // Pengikat OAuth ke browser pemrakarsa (A2-03, anti login CSRF):
    // nilai acak TERPISAH dari state — bukan hash state, agar bocornya
    // state via Referer/log tidak otomatis membocorkan pengikat.
    // Cookie: HttpOnly, SameSite=Lax (callback adalah navigasi GET
    // top-level lintas situs dari provider; Strict tidak mengirim cookie
    // dan merusak alur), Max-Age 600 (sejajar expiry state 10 menit),
    // Path /api/auth/ (mencakup initiate + callback). Tanpa flag Secure
    // untuk sekarang, konsisten dengan cookie sesi yang belum Secure —
    // S5 nantinya harus mencakup cookie ini juga.
    const bind = crypto.randomBytes(16).toString("hex");
    oauthStates[state] = { provider: action, createdAt: Date.now(), bind };
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
    res.writeHead(302, Object.assign({ Location: target, "Set-Cookie": oauthBindCookie(bind) }, securityHeaders()));
    res.end();
    return;
  }
  if (req.method === "GET" && (action === "google" || action === "github") && parts.length === 4 && parts[3] === "callback") {
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const rec = oauthStates[state];
    delete oauthStates[state];
    // Pengikatan browser (A2-03): cookie pengikat wajib ada DAN sama
    // dengan nilai yang tersimpan untuk state ini. Kegagalan memakai
    // 400 generik yang SAMA dengan state-tidak-valid (tidak membocorkan
    // cek mana yang gagal). Sekali pakai dipertahankan: state sudah
    // dihapus di atas pada SETIAP percobaan callback.
    // Initiate kedua menimpa cookie dengan bind terbaru, sehingga state
    // pertama menjadi tidak dapat dipakai (diterima — selesaikan alur
    // terbaru). Callback dari browser/profil berbeda -> 400.
    const bindHdr = (req.headers.cookie || "").split(";").map((s) => s.trim()).find((s) => s.startsWith("rutbhics_oauth_bind="));
    const bindVal = bindHdr ? bindHdr.slice("rutbhics_oauth_bind=".length) : "";
    if (!rec || rec.provider !== action || Date.now() - rec.createdAt > 10 * 60 * 1000 || !code || !oauthBindMatches(bindVal, rec.bind)) {
      oauthFail(res, "Tautan login tidak valid atau sudah kedaluwarsa. Coba lagi dari Rutbhics.", { "Set-Cookie": clearOAuthBindCookie() });
      return;
    }
    const cfg = oauthConfig(action);
    if (!cfg) { oauthFail(res, "Login ini belum dikonfigurasi di server.", { "Set-Cookie": clearOAuthBindCookie() }); return; }
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
        // Bersihkan cookie pengikat best-effort (state sudah hangus).
        res.setHeader("Set-Cookie", [res.getHeader("Set-Cookie"), clearOAuthBindCookie()]);
        res.writeHead(302, Object.assign({ Location: "/" }, securityHeaders()));
        res.end();
      } catch (e) {
        oauthFail(res, "Gagal mengambil profil dari " + (action === "google" ? "Google" : "GitHub") + ". Coba lagi.", { "Set-Cookie": clearOAuthBindCookie() });
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

// Mode akses AI (S1, P0-N1): eksplisit lewat env AI_ACCESS ("local"|"login").
// Bila tidak disetel, diturunkan dari --host: host non-loopback ->
// "login", selain itu "local". PERHATIAN: mode turunan TIDAK dapat
// mendeteksi reverse proxy — server --host 127.0.0.1 yang di-proxy
// tetap ber-mode local; di balik proxy/domain publik, operator WAJIB
// menyetel AI_ACCESS=login secara eksplisit (lihat README Deployment).
// Nilai tak valid -> peringatan + pakai mode turunan.
function isLoopbackHostName(h) {
  const s = (h || "").trim().toLowerCase();
  return s === "127.0.0.1" || s === "::1" || s === "localhost" || s === "::ffff:127.0.0.1";
}
function resolveAiAccessMode(host) {
  const v = (process.env.AI_ACCESS || "").trim().toLowerCase();
  if (v === "local" || v === "login") return v;
  if (v) console.error("[rutbhics] AI_ACCESS tidak valid, pakai mode turunan dari --host.");
  return isLoopbackHostName(host) ? "local" : "login";
}
// Peringatan proxy sekali per proses (S1, log saja — tidak mengubah akses):
// dalam mode local, request AI dengan tanda proxy (X-Forwarded-For /
// X-Real-IP hadir, atau Host/Origin non-loopback) menandakan server
// kemungkinan sedang di-proxy; operator harus pindah ke mode login.
// Best-effort: Origin loopback PALSU lewat proxy TIDAK terdeteksi,
// itulah mengapa local + proxy dilarang tanpa pengecualian.
let proxyWarningShown = false;
function warnProxyOnce(req) {
  if (proxyWarningShown) return;
  const xff = req.headers["x-forwarded-for"];
  const xrip = req.headers["x-real-ip"];
  let hostNonLoop = false;
  if (req.headers.host) {
    try { hostNonLoop = !isLoopbackHostName(hostNameOf(req.headers.host)); } catch (e) {}
  }
  let originNonLoop = false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.protocol === "http:" || u.protocol === "https:") {
        const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        originNonLoop = h !== "" && h !== "localhost" && h !== "127.0.0.1" && h !== "::1";
      }
    } catch (e) {}
  }
  if (!xff && !xrip && !hostNonLoop && !originNonLoop) return;
  proxyWarningShown = true;
  console.error("[rutbhics] PERINGATAN KERAS: tanda proxy teramati pada request AI (header tanda-proxy hadir atau Host/Origin non-loopback) dalam mode local — hanya indikator, bukan bukti proxy; tidak dipakai untuk memberi akses. Server kemungkinan sedang di-proxy; kunci AI berisiko terbuka. Pindah ke mode login (AI_ACCESS=login).");
}
let aiAccessMode = "local";

const port = parsePort(process.argv.slice(2));
const host = parseHost(process.argv.slice(2));
aiAccessMode = resolveAiAccessMode(host);
console.log("[rutbhics] AI access mode: " + aiAccessMode + (aiAccessMode === "local" ? " (loopback only, must not be proxied)" : " (session required)"));
console.log("[rutbhics] TRUSTED_PROXIES: " + trustedProxies().join(", ") + " (XFF hanya dipercaya dari daftar ini)");
if (aiAccessMode === "local" && (process.env.AI_ACCESS || "").trim().toLowerCase() === "local" && !isLoopbackHostName(host)) {
  console.error("[rutbhics] PERINGATAN KERAS: mode local dipilih eksplisit (AI_ACCESS=local) dengan host non-loopback (" + host + ") — server dapat dijangkau jaringan; bila server ini diekspos lewat proxy/domain publik, kunci AI terbuka. Pindah ke mode login (AI_ACCESS=login). Mode tetap local sesuai pilihan operator.");
}
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/chat") { handleChat(req, res); return; }
    if (url.pathname === "/api/models") { handleModels(req, res); return; }
    // Health check terbuka (P2h): hanya {ok:true}, tanpa data apa pun.
    // Sengaja TANPA gate loopback agar load balancer/monitor bisa memanggil.
    if (url.pathname === "/health") { sendJson(res, 200, { ok: true }); return; }
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

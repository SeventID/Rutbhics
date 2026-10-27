// Tes A2-06: timeout + cap byte panggilan upstream (OAuth + AI).
// Gaya S11, Node murni, tanpa dependensi. Dijalankan lewat `npm test`.
// - OAuth (httpsPostForm/httpsGetJson): timeout 15 dtk + cap 256KB.
//   Diuji lewat alur callback penuh pada SALINAN tree yang URL provider
//   hardcoded-nya diganti ke mock HTTPS lokal — presedennya sama dengan
//   test-negative-gate.js (mutasi salinan staging, bukan bin repo).
//   Yang diuji (logika timeout/cap) tidak berubah oleh penggantian URL.
//   Mock HTTPS memakai sertifikat self-signed yang dibuat saat jalan
//   (openssl); tanpa openssl, seksi OAuth di-SKIP eksplisit (bukan lolos
//   semu). Server rutbhics anak memakai NODE_TLS_REJECT_UNAUTHORIZED=0
//   HANYA untuk proses tes itu (bukan kode produksi).
// - AI (httpJson): cap 2MB, timeout 60 dtk dipertahankan (bukan 15 dtk —
//   respons lambat yang sah dari provider tidak boleh dipatahkan).
//   Diuji lewat provider config lokal (baseUrl mock HTTP, tanpa mutasi).
// - TIDAK ADA request ke provider asli mana pun (semua mock lokal).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const child_process = require("node:child_process");
const H = require("./test-harness.js");

const C = H.makeChecks();
const AI_MOCK = 8661;
const OAUTH_MOCK = 8662;
const SRV_AI = 8663;
const SRV_OAUTH = 8664;
const OAUTH_ENV = {
  GOOGLE_CLIENT_ID: "dummy-id", GOOGLE_CLIENT_SECRET: "dummy-secret",
  GITHUB_CLIENT_ID: "dummy-id", GITHUB_CLIENT_SECRET: "dummy-secret",
  NODE_TLS_REJECT_UNAUTHORIZED: "0"
};
const BIND = "rutbhics_oauth_bind";

let aiChatMode = "ok";
let aiModelsMode = "ok";
let oauthBigAborted = false;

function bigStream(res, onAbort) {
  // Alirkan >2MB (33 x 64KB) dengan jeda 20ms per chunk agar pemutusan
  // klien di tengah stream TERAMATI (bukan selesai dulu di buffer):
  // cap OAuth 256KB terpicu di chunk ~4, cap AI 2MB di chunk ~32.
  // Bila klien destroy sebelum selesai, onAbort dipanggil (bukti cap
  // benar-benar memutus stream, bukan buffering penuh lalu gagal).
  res.writeHead(200, { "Content-Type": "application/json" });
  res.on("error", () => {});
  const chunk = "x".repeat(65536);
  let i = 0, done = false;
  res.on("close", () => { if (!done && onAbort) onAbort(); });
  (function next() {
    if (done || res.destroyed) return;
    try {
      if (i === 0) res.write('{"data":"' + chunk);
      else if (i < 32) res.write(chunk);
      else { res.write(chunk); res.end('"}'); done = true; return; }
      i += 1;
      setTimeout(next, 20);
    } catch (e) { done = true; }
  })();
}

function bigModelsStream(res) {
  // Daftar model VALID yang raksasa (>2MB): pada bin tanpa cap, fetch
  // berhasil mem-parse dan mocklist:m-big TERDAFTAR (cek B gagal);
  // pada bin terperbaiki, cap memutus sebelum parse (cek B lolos).
  res.writeHead(200, { "Content-Type": "application/json" });
  res.on("error", () => {});
  const chunk = '{"id":"m-big1"},'.repeat(4096); // 16 x 4096 = 65536 byte persis
  let i = 0, done = false;
  (function next() {
    if (done || res.destroyed) return;
    try {
      if (i === 0) res.write('{"data":[' + chunk);
      else if (i < 32) res.write(chunk);
      else { res.write(chunk); res.end('{"id":"zend"}]}'); done = true; return; }
      i += 1;
      setTimeout(next, 20);
    } catch (e) { done = true; }
  })();
}

function aiMockHandler(req, res) {
  res.on("error", () => {});
  if (req.url === "/chat/completions") {
    let b = "";
    req.on("data", (c) => { b += c; });
    req.on("end", () => {
      if (aiChatMode === "big") { bigStream(res); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "halo dari mock" } }] }));
    });
  } else if (req.url === "/models") {
    if (aiModelsMode === "big") { bigModelsStream(res); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "m1" }] }));
  } else { res.writeHead(404); res.end(); }
}

function oauthMockHandler(req, res) {
  res.on("error", () => {});
  req.on("error", () => {});
  const u = req.url || "";
  if (u === "/g/token-hang" || u === "/g/userinfo-hang") {
    // Sengaja tidak pernah merespons: timeout 15 dtk server yang diuji
    // harus memutusnya (bukan menggantung selamanya).
    return;
  }
  if (u === "/g/token-big" || u === "/g/userinfo-big") { bigStream(res, () => { oauthBigAborted = true; }); return; }
  if (u === "/g/token-ok" || u === "/gh/token-ok") {
    let b = "";
    req.on("data", (c) => { b += c; });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ access_token: "dummy-token" }));
    });
    return;
  }
  if (u === "/g/userinfo-ok") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sub: "oauth-test-1", name: "OAuth Test", email: "oauth@test.local" }));
    return;
  }
  if (u === "/gh/user-ok") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: 4242, login: "ghtest", email: "gh@test.local" }));
    return;
  }
  res.writeHead(404); res.end();
}

function setCookies(headers) {
  const sc = headers["set-cookie"] || [];
  return Array.isArray(sc) ? sc : [sc];
}

async function initiate(port, provider) {
  const r = await H.req(port, "GET", "/api/auth/" + provider, {});
  const loc = r.headers.location || "";
  const state = (loc.match(/state=([0-9a-f]+)/) || [])[1] || "";
  const bindCookie = setCookies(r.headers).find((s) => s.startsWith(BIND + "=")) || "";
  const bind = bindCookie.split(";")[0].split("=")[1] || "";
  return { status: r.status, location: loc, state, bind, cookies: setCookies(r.headers) };
}

// Penjaga 40 dtk: bila timeout produksi regresi (tidak pernah gagal),
// suite tidak menggantung selamanya di CI — sentinel gagal keras.
async function callback(port, provider, state, bind) {
  const headers = {};
  if (bind) headers.Cookie = BIND + "=" + bind;
  const t0 = Date.now();
  const raced = await Promise.race([
    H.req(port, "GET", "/api/auth/" + provider + "/callback?state=" + state + "&code=dummy-code", { headers })
      .then((r) => ({ timedOut: false, status: r.status, body: r.body, headers: r.headers })),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 40000))
  ]);
  raced.ms = Date.now() - t0;
  return raced;
}

function oauthTree(tmp, name, repl) {
  const dir = H.makeTree(tmp, name, {});
  const binPath = path.join(dir, "bin", "rutbhics.js");
  let src = fs.readFileSync(binPath, "utf8");
  for (const [from, to] of repl) {
    C.check(src.includes(from), name + ": basis mengandung URL " + from);
    src = src.split(from).join(to);
  }
  fs.writeFileSync(binPath, src);
  return dir;
}

async function oauthScenario(tmp, name, provider, repl, expect) {
  const dir = oauthTree(tmp, name, repl);
  const srv = await H.startServer(dir, SRV_OAUTH, "127.0.0.1", OAUTH_ENV);
  try {
    oauthBigAborted = false;
    const init = await initiate(SRV_OAUTH, provider);
    C.ok(init.status, 302, name + ": initiate -> 302");
    C.check(/^[0-9a-f]{32}$/.test(init.state), name + ": state 32 hex");
    C.check(/^[0-9a-f]{32}$/.test(init.bind), name + ": bind 32 hex");
    const cb = await callback(SRV_OAUTH, provider, init.state, init.bind);
    C.check(!cb.timedOut, name + ": callback kembali (tidak menggantung >40 dtk)");
    if (cb.timedOut) return;
    C.ok(cb.status, expect.status, name + ": callback -> " + expect.status);
    if (expect.body) C.okBody(cb.body, expect.body, name + ": body memuat " + expect.body);
    if (expect.msMin !== undefined) C.check(cb.ms >= expect.msMin, name + ": durasi >= " + expect.msMin + "ms (dapat " + cb.ms + "ms)");
    if (expect.msMax !== undefined) C.check(cb.ms < expect.msMax, name + ": durasi < " + expect.msMax + "ms (dapat " + cb.ms + "ms)");
    if (expect.abort) C.check(oauthBigAborted, name + ": mock dibatalkan di tengah stream (cap memutus, bukan buffering penuh)");
    if (expect.after) await expect.after(cb);
    C.ok((await H.req(SRV_OAUTH, "GET", "/health")).status, 200, name + ": server tetap hidup sesudahnya");
  } finally {
    await H.stopServer(srv);
  }
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-a2-06-");
  const servers = [];
  let aiMock = null;
  let oauthMock = null;
  try {
    aiMock = http.createServer(aiMockHandler);
    await new Promise((resolve) => aiMock.listen(AI_MOCK, "127.0.0.1", resolve));

    // ===== A. AI: cap 2MB + positif + server selamat =====
    const treeAI = H.makeTree(tmp, "tree-ai", { config: { providers: [
      { id: "mockai", name: "MockAI", type: "openai", baseUrl: "http://127.0.0.1:" + AI_MOCK, apiKeyEnv: "MOCKAI_KEY", models: ["mock-model"], defaultModel: "mock-model" },
      { id: "mocklist", name: "MockList", type: "openai", baseUrl: "http://127.0.0.1:" + AI_MOCK, apiKeyEnv: "MOCKAI_KEY", models: [] }
    ] } });
    const srvAI = await H.startServer(treeAI, SRV_AI, "127.0.0.1", { MOCKAI_KEY: "dummy-key" });
    servers.push(srvAI);
    const chatBody = (model) => H.jsonBody({ messages: [{ role: "user", content: "hai" }], model });
    const chatHeaders = { "Content-Type": "application/json" };

    aiChatMode = "big";
    const tBig0 = Date.now();
    const big = await H.req(SRV_AI, "POST", "/api/chat", { headers: chatHeaders, body: chatBody("mockai:mock-model") });
    const bigMs = Date.now() - tBig0;
    C.ok(big.status, 502, "A: chat mock raksasa >2MB -> 502 (jalur yang sudah ada, bukan crash/OOM)");
    C.okBody(big.body, "provider_gagal", "A: error body provider_gagal");
    C.okBody(big.body, "terlalu besar", "A: pesan menyebut cap (bukan gagal generik)");
    C.check(bigMs < 10000, "A: cap gagal cepat <10 dtk (dapat " + bigMs + "ms)");
    C.ok((await H.req(SRV_AI, "GET", "/health")).status, 200, "A: server tetap hidup sesudah cap");
    aiChatMode = "ok";
    const ok = await H.req(SRV_AI, "POST", "/api/chat", { headers: chatHeaders, body: chatBody("mockai:mock-model") });
    C.ok(ok.status, 200, "A: chat mock kecil -> 200 (cap tidak merusak positif)");
    C.okBody(ok.body, "halo dari mock", "A: balasan mock utuh");

    // ===== B. Daftar model live: cap 2MB -> fallback, lalu positif =====
    // Urutan penting: gagal TIDAK di-cache (5 menit hanya untuk sukses),
    // jadi big dulu lalu ok pada server yang sama tetap valid.
    aiModelsMode = "big";
    const tM0 = Date.now();
    const modelsBig = await H.req(SRV_AI, "GET", "/api/models", {});
    const modelsBigMs = Date.now() - tM0;
    C.ok(modelsBig.status, 200, "B: models live raksasa -> 200 (gagal fetch ditangani, bukan crash)");
    C.check(!modelsBig.body.includes("mocklist:"), "B: daftar raksasa TIDAK dipakai (live fetch gagal karena cap)");
    C.check(modelsBig.body.includes("mockai:mock-model"), "B: provider config tetap terdaftar");
    C.check(modelsBigMs < 10000, "B: cap models gagal cepat <10 dtk (dapat " + modelsBigMs + "ms)");
    aiModelsMode = "ok";
    const modelsOk = await H.req(SRV_AI, "GET", "/api/models", {});
    C.ok(modelsOk.status, 200, "B: models live kecil -> 200");
    C.okBody(modelsOk.body, "mocklist:m1", "B: daftar live kecil dipakai");
    await H.stopServer(srvAI);
    servers.splice(servers.indexOf(srvAI), 1);

    // ===== C. OAuth: butuh sertifikat self-signed (openssl) =====
    let oauthAvailable = true;
    try {
      child_process.execSync("openssl req -x509 -newkey rsa:2048 -keyout " + path.join(tmp, "key.pem") +
        " -out " + path.join(tmp, "cert.pem") + " -days 1 -nodes -subj \"/CN=localhost\"", { stdio: "ignore" });
    } catch (e) { oauthAvailable = false; }
    if (!oauthAvailable) {
      console.log("SKIP: seksi OAuth (openssl tidak tersedia untuk sertifikat mock lokal)");
    } else {
      oauthMock = https.createServer({
        key: fs.readFileSync(path.join(tmp, "key.pem")),
        cert: fs.readFileSync(path.join(tmp, "cert.pem"))
      }, oauthMockHandler);
      await new Promise((resolve) => oauthMock.listen(OAUTH_MOCK, "127.0.0.1", resolve));
      const M = "https://127.0.0.1:" + OAUTH_MOCK;

      await oauthScenario(tmp, "C1-token-hang", "google", [
        ["https://oauth2.googleapis.com/token", M + "/g/token-hang"],
        ["https://www.googleapis.com/oauth2/v3/userinfo", M + "/g/userinfo-ok"]
      ], { status: 400, body: "Login gagal", msMin: 14000, msMax: 30000 });

      await oauthScenario(tmp, "C2-token-big", "google", [
        ["https://oauth2.googleapis.com/token", M + "/g/token-big"],
        ["https://www.googleapis.com/oauth2/v3/userinfo", M + "/g/userinfo-ok"]
      ], { status: 400, body: "Login gagal", msMax: 10000, abort: true });

      await oauthScenario(tmp, "C3-userinfo-hang", "google", [
        ["https://oauth2.googleapis.com/token", M + "/g/token-ok"],
        ["https://www.googleapis.com/oauth2/v3/userinfo", M + "/g/userinfo-hang"]
      ], { status: 400, body: "Login gagal", msMin: 14000, msMax: 30000 });

      await oauthScenario(tmp, "C4-userinfo-big", "google", [
        ["https://oauth2.googleapis.com/token", M + "/g/token-ok"],
        ["https://www.googleapis.com/oauth2/v3/userinfo", M + "/g/userinfo-big"]
      ], { status: 400, body: "Login gagal", msMax: 10000, abort: true });

      // C5: sukses Google penuh (token-ok + userinfo-ok) — alur positif
      // tidak rusak oleh timeout/cap; pertama kalinya sukses OAuth
      // teruji tanpa provider asli.
      await oauthScenario(tmp, "C5-google-ok", "google", [
        ["https://oauth2.googleapis.com/token", M + "/g/token-ok"],
        ["https://www.googleapis.com/oauth2/v3/userinfo", M + "/g/userinfo-ok"]
      ], { status: 302, after: async (cb) => {
        C.check((cb.headers.location || "") === "/", "C5-google-ok: sukses -> 302 ke /");
        const sc = setCookies(cb.headers);
        C.check(sc.some((s) => s.startsWith("rutbhics_token=")), "C5-google-ok: cookie sesi disetel");
        C.check(sc.some((s) => s.startsWith(BIND + "=;") && s.includes("Max-Age=0")), "C5-google-ok: cookie pengikat dibersihkan");
        const tok = (sc.find((s) => s.startsWith("rutbhics_token=")) || "").split(";")[0];
        const me = await H.req(SRV_OAUTH, "GET", "/api/auth/me", { headers: { Cookie: tok } });
        C.ok(me.status, 200, "C5-google-ok: sesi baru berlaku (GET /api/auth/me -> 200)");
      } });

      // C6: sukses GitHub penuh (token-ok + user-ok).
      await oauthScenario(tmp, "C6-github-ok", "github", [
        ["https://github.com/login/oauth/access_token", M + "/gh/token-ok"],
        ["https://api.github.com/user\"", M + "/gh/user-ok\""]
      ], { status: 302, after: async (cb) => {
        C.check((cb.headers.location || "") === "/", "C6-github-ok: sukses -> 302 ke /");
        const sc = setCookies(cb.headers);
        C.check(sc.some((s) => s.startsWith("rutbhics_token=")), "C6-github-ok: cookie sesi disetel");
        C.check(sc.some((s) => s.startsWith(BIND + "=;") && s.includes("Max-Age=0")), "C6-github-ok: cookie pengikat dibersihkan");
      } });
    }
  } finally {
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    if (aiMock) { try { if (aiMock.closeAllConnections) aiMock.closeAllConnections(); aiMock.close(); } catch (e) {} }
    if (oauthMock) { try { if (oauthMock.closeAllConnections) oauthMock.closeAllConnections(); oauthMock.close(); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-a2-06");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-a2-06 ERROR: " + (e && e.stack || e)); process.exit(1); });

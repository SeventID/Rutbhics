// Tes A2-07: Cache-Control no-store untuk /api/* + X-Frame-Options SAMEORIGIN.
// Gaya S11, Node murni, tanpa dependensi. Dijalankan lewat `npm test`.
// - no-store: SEMUA respons /api/* (sukses maupun error, termasuk gerbang
//   awal 401 dan 404 rute API tak dikenal yang jatuh ke penyajian statis).
// - XFO SAMEORIGIN: SEMUA respons (API + statis).
// - Cakupan dibuktikan dari sisi negatif: /health (bukan /api/*), halaman
//   statis, berkas js, dan 404 dotfile TIDAK membawa no-store.
// - CSP TIDAK diuji di sini (S12, butuh uji browser nyata).
"use strict";

const H = require("./test-harness.js");

const C = H.makeChecks();
const SRV = 8671;

function noStore(r, label) {
  C.check((r.headers["cache-control"] || "") === "no-store",
    label + ": Cache-Control no-store (dapat " + (r.headers["cache-control"] || "(absen)") + ")");
}
function xfo(r, label) {
  C.check((r.headers["x-frame-options"] || "") === "SAMEORIGIN",
    label + ": X-Frame-Options SAMEORIGIN (dapat " + (r.headers["x-frame-options"] || "(absen)") + ")");
}
function notNoStore(r, label) {
  C.check((r.headers["cache-control"] || "") !== "no-store",
    label + ": Cache-Control bukan no-store (dapat " + (r.headers["cache-control"] || "(absen)") + ")");
}
function both(r, label) { noStore(r, label); xfo(r, label); }

async function main() {
  const tmp = H.mkTmp("rutbhics-test-a2-07-");
  let srv = null;
  try {
    const dir = H.makeTree(tmp, "tree", {});
    srv = await H.startServer(dir, SRV, "127.0.0.1", { AI_ACCESS: "login" });
    const json = { "Content-Type": "application/json" };

    // ===== A. Tanpa sesi, mode login: gerbang awal ikut membawa header =====
    const chat401 = await H.req(SRV, "GET", "/api/chat", {});
    C.ok(chat401.status, 401, "A: GET /api/chat tanpa sesi -> 401");
    both(chat401, "A: GET /api/chat tanpa sesi");
    const models401 = await H.req(SRV, "GET", "/api/models", {});
    C.ok(models401.status, 401, "A: GET /api/models tanpa sesi -> 401");
    both(models401, "A: GET /api/models tanpa sesi");
    const login401 = await H.req(SRV, "POST", "/api/auth/login", {
      headers: json, body: H.jsonBody({ identifier: "tidakada", password: "salah1234" })
    });
    C.ok(login401.status, 401, "A: POST /api/auth/login salah -> 401");
    both(login401, "A: POST /api/auth/login salah");
    const unknown404 = await H.req(SRV, "GET", "/api/tidak-ada", {});
    C.ok(unknown404.status, 404, "A: GET /api/tidak-ada -> 404");
    both(unknown404, "A: GET /api/tidak-ada (rute API jatuh ke statis)");

    // ===== B. Dengan sesi: sukses + tulis + AI diproses ikut membawa header =====
    const reg = await H.req(SRV, "POST", "/api/auth/register", {
      headers: json, body: H.jsonBody({ username: "a207user", password: H.DUMMY_PASSWORD, email: "a207user@contoh.test" })
    });
    C.ok(reg.status, 200, "B: POST /api/auth/register -> 200");
    both(reg, "B: POST /api/auth/register");
    const login = await H.req(SRV, "POST", "/api/auth/login", {
      headers: json, body: H.jsonBody({ identifier: "a207user", password: H.DUMMY_PASSWORD })
    });
    C.ok(login.status, 200, "B: POST /api/auth/login benar -> 200");
    both(login, "B: POST /api/auth/login benar");
    const tok = H.parseToken(login.headers["set-cookie"]);
    C.check(!!tok, "B: cookie sesi didapat dari login");
    const ck = { Cookie: H.cookieHeader(tok) };
    const rooms = await H.req(SRV, "GET", "/api/rooms", { headers: ck });
    C.ok(rooms.status, 200, "B: GET /api/rooms bersesi -> 200");
    both(rooms, "B: GET /api/rooms bersesi");
    const create = await H.req(SRV, "POST", "/api/rooms", {
      headers: Object.assign({}, json, ck), body: H.jsonBody({ name: "Ruang Header", visibility: "public" })
    });
    C.ok(create.status, 200, "B: POST /api/rooms bersesi -> 200");
    both(create, "B: POST /api/rooms bersesi");
    const chat503 = await H.chatPost(SRV, tok);
    C.ok(chat503.status, 503, "B: POST /api/chat bersesi tanpa kunci -> 503");
    both(chat503, "B: POST /api/chat bersesi (diproses, tanpa kunci)");

    // ===== C. Bukan /api/*: XFO ada, no-store TIDAK ada (bukti cakupan) =====
    const health = await H.req(SRV, "GET", "/health", {});
    C.ok(health.status, 200, "C: GET /health -> 200");
    xfo(health, "C: GET /health");
    notNoStore(health, "C: GET /health (bukan /api/*)");
    const index = await H.req(SRV, "GET", "/", {});
    C.ok(index.status, 200, "C: GET / (index.html) -> 200");
    xfo(index, "C: GET / (index.html)");
    notNoStore(index, "C: GET / (index.html)");
    const js = await H.req(SRV, "GET", "/js/desktop.js", {});
    C.ok(js.status, 200, "C: GET /js/desktop.js -> 200");
    xfo(js, "C: GET /js/desktop.js");
    notNoStore(js, "C: GET /js/desktop.js");
    const dot = await H.req(SRV, "GET", "/.env", {});
    C.ok(dot.status, 404, "C: GET /.env -> 404 (dotfile diblokir)");
    xfo(dot, "C: GET /.env");
    notNoStore(dot, "C: GET /.env (bukan /api/*)");
  } finally {
    if (srv) { try { await H.stopServer(srv); } catch (e) {} }
    try { require("node:fs").rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-a2-07");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-a2-07 ERROR: " + (e && e.stack || e)); process.exit(1); });

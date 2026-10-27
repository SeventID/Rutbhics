// Tes regresi A2-03 — OAuth state tidak terikat browser (login CSRF)
// (Tahap 4 audit #2, item 3).
// Akar: initiate menyetel state = {provider, createdAt} di map server
// TANPA cookie apa pun; callback siapa pun yang memegang state URL bisa
// dipakai dari browser mana pun (repro audit T08/T09: state "browser A"
// dipakai callback "browser B" tanpa cookie -> 400 DAN state hangus,
// yang membuktikan sekali-pakai + expiry baik, tapi pengikatan hilang).
// Perbaikan: initiate menyetel cookie pengikat acak terpisah dari state
// (bukan hash state); callback wajib membawa cookie yang cocok dengan
// nilai tersimpan untuk state itu, kalau tidak 400 generik yang SAMA
// dengan state-tidak-valid; state tetap hangus pada setiap percobaan.
// Gaya S11: Node murni, dummy saja, server dimatikan sendiri.
// BATAS UJI YANG JUJUR: alur sukses penuh (code asli -> fetch provider
// -> sesi) secara eksplisit NOT RUN — butuh aplikasi OAuth asli + code
// asli. TIDAK ADA code palsu dikirim ke Google/GitHub asli: semua
// callback di sini gagal SEBELUM fetch provider mana pun (tanpa code,
// atau state/bind tidak valid). Yang dibuktikan: penerbitan cookie
// pengikat yang benar, penolakan cookie salah/hilang/lintas-browser,
// sekali-pakai yang dipertahankan, dan tidak ada mode gagal baru pada
// jalur cookie-cocok-tanpa-code (400 generik identik dengan perilaku
// pra-perbaikan). Cabang bind-lolos + code-asli hanya teruji oleh E2E
// OAuth asli.
// Dijalankan: node scripts/test-a2-03.js (lewat `npm test`).
"use strict";

const H = require("./test-harness.js");
const C = H.makeChecks();

const OAUTH_ENV = {
  GOOGLE_CLIENT_ID: "dummy-google-id",
  GOOGLE_CLIENT_SECRET: "dummy-google-secret",
  GITHUB_CLIENT_ID: "dummy-github-id",
  GITHUB_CLIENT_SECRET: "dummy-github-secret",
};
const BIND = "rutbhics_oauth_bind";
const GENERIC = "tidak valid";

function setCookies(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}
function cookieVal(cookies, name) {
  const c = cookies.find((s) => s.startsWith(name + "="));
  return c ? c.split(";")[0].slice(name.length + 1) : null;
}
function cookieStr(cookies, name) {
  return cookies.find((s) => s.startsWith(name + "=")) || "";
}

async function initiate(port, provider) {
  const r = await H.req(port, "GET", "/api/auth/" + provider, {});
  const cookies = setCookies(r.headers);
  const loc = r.headers.location || "";
  let state = "";
  let redirectUri = "";
  try {
    const u = new URL(loc);
    state = u.searchParams.get("state") || "";
    redirectUri = u.searchParams.get("redirect_uri") || "";
  } catch (e) {}
  return { r, cookies, loc, state, redirectUri, bind: cookieVal(cookies, BIND) };
}

function checkBindCookieAttrs(cookies, label) {
  const s = cookieStr(cookies, BIND);
  C.check(s.length > 0, label + ": cookie pengikat disetel");
  C.check(s.includes("HttpOnly"), label + ": cookie HttpOnly");
  C.check(s.includes("SameSite=Lax"), label + ": cookie SameSite=Lax (bukan Strict — callback lintas situs)");
  C.check(s.includes("Max-Age=600"), label + ": cookie Max-Age=600 (sejajar expiry state 10 menit)");
  C.check(s.includes("Path=/api/auth/"), label + ": cookie Path=/api/auth/");
  // Keputusan spesifikasi: tanpa flag Secure untuk sekarang, konsisten
  // dengan cookie sesi yang belum Secure — S5 nantinya harus mencakup
  // cookie ini juga DAN memperbarui cek ini.
  C.check(!s.includes("Secure"), label + ": cookie tanpa Secure (keputusan kini; S5 mengubah ini)");
  C.check(!cookies.some((c) => c.startsWith("rutbhics_token=")), label + ": initiate tidak menyetel cookie sesi");
}

async function callback(port, provider, state, cookieHeader) {
  const headers = {};
  if (cookieHeader) headers.Cookie = cookieHeader;
  return H.req(port, "GET", "/api/auth/" + provider + "/callback?state=" + encodeURIComponent(state), { headers });
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-a2-03-");
  const servers = [];
  try {
    const tree = H.makeTree(tmp, "tree-main");
    const srv = await H.startServer(tree, 8581, "127.0.0.1", OAUTH_ENV);
    servers.push(srv);

    // ===== A. Initiate google: 302 + cookie pengikat benar =====
    const g = await initiate(8581, "google");
    C.ok(g.r.status, 302, "A: initiate google -> 302");
    C.check(g.loc.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"), "A: 302 ke host provider Google hardcoded");
    C.check(/^[0-9a-f]{32}$/.test(g.state), "A: state 32 hex acak");
    C.ok(g.redirectUri, "http://127.0.0.1:8581/api/auth/google/callback", "A: redirect_uri callback google benar");
    C.check(g.loc.includes("client_id=dummy-google-id"), "A: client_id dummy Google dipakai");
    C.check(/^[0-9a-f]{32}$/.test(g.bind || ""), "A: bind 32 hex acak terpisah dari state");
    C.check(g.bind !== g.state, "A: bind != state (bukan turunan state)");
    checkBindCookieAttrs(g.cookies, "A");

    // ===== B. Initiate github: 302 + cookie pengikat benar =====
    const h = await initiate(8581, "github");
    C.ok(h.r.status, 302, "B: initiate github -> 302");
    C.check(h.loc.startsWith("https://github.com/login/oauth/authorize?"), "B: 302 ke host provider GitHub hardcoded");
    C.check(/^[0-9a-f]{32}$/.test(h.state), "B: state 32 hex acak");
    C.ok(h.redirectUri, "http://127.0.0.1:8581/api/auth/github/callback", "B: redirect_uri callback github benar");
    checkBindCookieAttrs(h.cookies, "B");

    // ===== C. Cookie cocok + state sah + tanpa code -> 400 + hangus =====
    const c1 = await callback(8581, "google", g.state, BIND + "=" + g.bind);
    C.ok(c1.status, 400, "C: callback cookie-cocok tanpa code -> 400");
    C.okBody(c1.body, GENERIC, "C: body 400 generik (tidak membocorkan cek mana yang gagal)");
    C.check(cookieStr(setCookies(c1.headers), BIND).includes("Max-Age=0"), "C: callback gagal membersihkan cookie pengikat (Max-Age=0)");
    const c1b = await callback(8581, "google", g.state, BIND + "=" + g.bind);
    C.ok(c1b.status, 400, "C: panggilan ulang state sama -> 400 (sekali pakai dipertahankan)");

    // ===== D. Cookie SALAH + state sah -> 400 + hangus =====
    const d0 = await initiate(8581, "google");
    const d1 = await callback(8581, "google", d0.state, BIND + "=00000000000000000000000000000000");
    C.ok(d1.status, 400, "D: callback cookie-salah + state sah -> 400");
    C.okBody(d1.body, GENERIC, "D: body 400 generik (sama dengan state-tidak-valid)");
    C.check(cookieStr(setCookies(d1.headers), BIND).includes("Max-Age=0"), "D: callback gagal membersihkan cookie pengikat");
    const d1b = await callback(8581, "google", d0.state, BIND + "=" + d0.bind);
    C.ok(d1b.status, 400, "D: panggilan ulang dengan cookie benar pun -> 400 (state sudah hangus)");

    // ===== E. TANPA cookie + state sah -> 400 + hangus =====
    const e0 = await initiate(8581, "github");
    const e1 = await callback(8581, "github", e0.state, null);
    C.ok(e1.status, 400, "E: callback tanpa cookie + state sah -> 400");
    C.okBody(e1.body, GENERIC, "E: body 400 generik");
    const e1b = await callback(8581, "github", e0.state, BIND + "=" + e0.bind);
    C.ok(e1b.status, 400, "E: panggilan ulang dengan cookie benar pun -> 400 (state sudah hangus)");

    // ===== F. Repro lintas-browser audit (T08/T09) =====
    const fa = await initiate(8581, "google"); // "browser A"
    const f1 = await callback(8581, "google", fa.state, null); // "browser B" tanpa cookie A
    C.ok(f1.status, 400, "F: state browser A dipakai callback browser B (tanpa cookie) -> 400");
    const fb = await initiate(8581, "google"); // "browser B" punya bind sendiri
    const fa2 = await initiate(8581, "google"); // state A segar
    const f2 = await callback(8581, "google", fa2.state, BIND + "=" + fb.bind); // cookie B untuk state A
    C.ok(f2.status, 400, "F: state A + cookie browser B -> 400 (bind tidak cocok meski cookie ada)");
    const f2b = await callback(8581, "google", fa2.state, BIND + "=" + fa2.bind);
    C.ok(f2b.status, 400, "F: panggilan ulang state A dengan cookie benar pun -> 400 (hangus)");

    // ===== G. Initiate ganda: state pertama tak dapat dipakai =====
    const g1 = await initiate(8581, "github");
    const g2 = await initiate(8581, "github"); // menimpa cookie dengan bind terbaru
    const gg1 = await callback(8581, "github", g1.state, BIND + "=" + g2.bind);
    C.ok(gg1.status, 400, "G: state pertama + cookie initiate kedua -> 400 (diterima: selesaikan alur terbaru)");
    const gg2 = await callback(8581, "github", g2.state, BIND + "=" + g2.bind);
    C.ok(gg2.status, 400, "G: state terbaru + cookie terbaru tanpa code -> 400 generik (alur terbaru utuh sampai cek code)");
    C.okBody(gg2.body, GENERIC, "G: body 400 generik");

    // ===== H. State tak dikenal + cookie apa pun -> 400 (tanpa exception) =====
    const h1 = await callback(8581, "google", "0123456789abcdef0123456789abcdef", BIND + "=0123456789abcdef0123456789abcdef");
    C.ok(h1.status, 400, "H: state tak dikenal -> 400");
    C.okBody(h1.body, GENERIC, "H: body 400 generik");

    // ===== I. Initiate tanpa konfigurasi OAuth -> 400 (perilaku lama) =====
    const treeNC = H.makeTree(tmp, "tree-noconfig");
    const srvNC = await H.startServer(treeNC, 8582, "127.0.0.1", {});
    servers.push(srvNC);
    const nc = await H.req(8582, "GET", "/api/auth/google", {});
    C.ok(nc.status, 400, "I: initiate tanpa konfigurasi -> 400");
    C.okBody(nc.body, "oauth_tidak_dikonfigurasi", "I: body oauth_tidak_dikonfigurasi");
    C.check(setCookies(nc.headers).length === 0, "I: initiate gagal tidak menyetel cookie apa pun");
    await H.stopServer(srvNC);
    servers.splice(servers.indexOf(srvNC), 1);
  } finally {
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    try { require("node:fs").rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-a2-03");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-a2-03 ERROR: " + (e && e.stack || e)); process.exit(1); });

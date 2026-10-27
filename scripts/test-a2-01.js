// Tes regresi A2-01 — CSRF exact-Origin (Tahap 4 audit #2, item 1).
// Akar: SameSite=Lax menahan cookie lintas SITE, bukan lintas ORIGIN —
// dua port localhost adalah satu site, jadi halaman loopback port lain
// membawa cookie sesi, dan pengecualian Origin-loopback lama meloloskannya.
// Perbaikan: POST tulis + endpoint AI mode login mensyaratkan Origin
// PERSIS == Host header (skema+host+port), atau tanpa Origin.
// Gaya S11: Node murni, dummy saja, server dimatikan sendiri.
// Dijalankan: node scripts/test-a2-01.js (lewat `npm test`).
"use strict";

const H = require("./test-harness.js");
const C = H.makeChecks();

async function main() {
  const tmp = H.mkTmp("rutbhics-test-a2-01-");
  const servers = [];
  try {
    // ===== A. Mode login: POST tulis (rooms + auth) =====
    const treeA = H.makeTree(tmp, "tree-a");
    const srvA = await H.startServer(treeA, 8561, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvA);
    const victim = await H.registerLogin(8561, "korbanA");
    await H.registerLogin(8561, "penyerangA");
    const roomRes = await H.req(8561, "POST", "/api/rooms", { headers: { Cookie: H.cookieHeader(victim), "Content-Type": "application/json" }, body: H.jsonBody({ name: "privatA", visibility: "private" }) });
    C.ok(roomRes.status, 200, "A: korban membuat ruang privat -> 200");
    const roomId = JSON.parse(roomRes.body).room.id;
    const HOST = "127.0.0.1:8561";
    const ck = { Cookie: H.cookieHeader(victim), "Content-Type": "application/json" };
    const withOrigin = (origin) => Object.assign({}, ck, { Origin: origin });

    // Tiga varian repro audit (dulu 200, kini 403). Korban adalah pembuat
    // ruang + penyerang sudah terdaftar, jadi tanpa gate ketiganya 200 —
    // 403 di sini hanya bisa berasal dari gate exact-Origin.
    C.ok((await H.req(8561, "POST", "/api/rooms/" + roomId + "/members", { headers: withOrigin("http://localhost:9999"), body: H.jsonBody({ username: "penyerangA" }) })).status, 403, "A KUNCI: sesi korban + Origin loopback port lain POST tambah-anggota -> 403 (dulu 200)");
    C.ok((await H.req(8561, "POST", "/api/rooms/" + roomId + "/messages", { headers: withOrigin("http://localhost:9999"), body: H.jsonBody({ text: "palsu" }) })).status, 403, "A KUNCI: sesi korban + Origin loopback port lain POST pesan -> 403 (dulu 200)");
    C.ok((await H.req(8561, "POST", "/api/auth/logout", { headers: { Cookie: H.cookieHeader(victim), Origin: "http://localhost:9999" } })).status, 403, "A KUNCI: sesi korban + Origin loopback port lain POST logout -> 403 (dulu 200)");
    // Logout palsu TIDAK tereksekusi: sesi korban tetap sah.
    C.ok((await H.req(8561, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(victim) } })).status, 200, "A: sesi korban tetap sah setelah logout palsu ditolak");
    // Penyerang TIDAK menjadi anggota ruang privat.
    const listV = await H.req(8561, "GET", "/api/rooms", { headers: { Cookie: H.cookieHeader(victim) } });
    const mine = JSON.parse(listV.body).rooms.find((r) => r.id === roomId);
    C.check(mine && !mine.members.includes("penyerangA"), "A: penyerang TIDAK menjadi anggota ruang privat");
    // Port-exactness: hostname sama, port lain -> 403 (aturan hostname
    // saja masih meloloskan kasus ini — itulah yang ditutup A2-01).
    C.ok((await H.req(8561, "POST", "/api/rooms/" + roomId + "/members", { headers: withOrigin("http://127.0.0.1:9999"), body: H.jsonBody({ username: "penyerangA" }) })).status, 403, "A: sesi korban + Origin host sama port lain -> 403 (exact-Origin incl. port)");
    // Origin asing tetap 403.
    C.ok((await H.req(8561, "POST", "/api/rooms/" + roomId + "/members", { headers: withOrigin("https://jahat.test"), body: H.jsonBody({ username: "penyerangA" }) })).status, 403, "A: sesi korban + Origin asing POST tambah-anggota -> 403");
    // Positif: Origin == Host -> 200; tanpa Origin -> 200.
    C.ok((await H.req(8561, "POST", "/api/rooms/" + roomId + "/members", { headers: withOrigin("http://" + HOST), body: H.jsonBody({ username: "penyerangA" }) })).status, 200, "A: sesi korban + Origin == Host POST tambah-anggota -> 200");
    C.ok((await H.req(8561, "POST", "/api/rooms/" + roomId + "/messages", { headers: ck, body: H.jsonBody({ text: "asli" }) })).status, 200, "A: sesi korban + tanpa Origin POST pesan -> 200");
    // Login adalah POST tulis juga: Origin == Host -> 200, palsu -> 403
    // (gate berjalan SEBELUM pemeriksaan kredensial).
    C.ok((await H.req(8561, "POST", "/api/auth/login", { headers: { Origin: "http://" + HOST, "Content-Type": "application/json" }, body: H.jsonBody({ identifier: "penyerangA", password: H.DUMMY_PASSWORD }) })).status, 200, "A: login + Origin == Host -> 200");
    C.ok((await H.req(8561, "POST", "/api/auth/login", { headers: { Origin: "http://localhost:9999", "Content-Type": "application/json" }, body: H.jsonBody({ identifier: "penyerangA", password: H.DUMMY_PASSWORD }) })).status, 403, "A: login + Origin loopback port lain -> 403");

    // ===== B. Mode login: endpoint AI =====
    const chatBody = H.jsonBody({ messages: [{ role: "user", content: "halo" }] });
    C.ok((await H.req(8561, "POST", "/api/chat", { headers: withOrigin("http://localhost:9999"), body: chatBody })).status, 403, "B: login+sesi POST chat Origin loopback port lain -> 403");
    C.ok((await H.req(8561, "POST", "/api/chat", { headers: withOrigin("http://" + HOST), body: chatBody })).status, 503, "B: login+sesi POST chat Origin == Host -> diproses (503 tanpa kunci, bukan 403)");
    C.ok((await H.req(8561, "POST", "/api/chat", { headers: ck, body: chatBody })).status, 503, "B: login+sesi POST chat tanpa Origin -> diproses (klien non-browser)");
    C.ok((await H.req(8561, "POST", "/api/chat", { headers: { Origin: "http://localhost:9999", "Content-Type": "application/json" }, body: chatBody })).status, 401, "B: login+tanpa sesi POST chat Origin apa pun -> 401");
    C.ok((await H.req(8561, "GET", "/api/models", { headers: { Origin: "http://localhost:9999", Cookie: H.cookieHeader(victim) } })).status, 403, "B: login+sesi GET models Origin loopback port lain -> 403");
    C.ok((await H.req(8561, "GET", "/api/models", { headers: { Origin: "http://" + HOST, Cookie: H.cookieHeader(victim) } })).status, 200, "B: login+sesi GET models Origin == Host -> 200");
    await H.stopServer(srvA);
    servers.splice(servers.indexOf(srvA), 1);

    // ===== C. Mode local TIDAK berubah (gate loopback utuh) =====
    const treeC = H.makeTree(tmp, "tree-c");
    const srvC = await H.startServer(treeC, 8562, "127.0.0.1", {});
    servers.push(srvC);
    C.ok((await H.req(8562, "POST", "/api/chat", { headers: { Origin: "http://localhost:8562", "Content-Type": "application/json" }, body: chatBody })).status, 503, "C: local tanpa login POST chat Origin loopback -> diproses (gate local utuh)");
    C.ok((await H.req(8562, "POST", "/api/chat", { headers: { Origin: "http://localhost:9999", "Content-Type": "application/json" }, body: chatBody })).status, 503, "C: local tanpa login POST chat Origin loopback port lain -> diproses (local = trust perangkat-sendiri)");
    C.ok((await H.req(8562, "GET", "/api/models", { headers: { Origin: "http://localhost:8562" } })).status, 200, "C: local tanpa login GET models Origin loopback -> 200");
    C.ok((await H.req(8562, "GET", "/api/chat", { headers: { Origin: "https://jahat.test" } })).status, 403, "C: local tanpa login GET chat Origin asing -> 403 (tetap)");
    await H.stopServer(srvC);
    servers.splice(servers.indexOf(srvC), 1);
  } finally {
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    try { require("node:fs").rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-a2-01");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL test-a2-01:", (e && e.stack) || e); process.exit(1); });

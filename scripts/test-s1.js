// Tes S1: mode akses AI eksplisit (AI_ACCESS local/login) + matriks 7 baris
// + validasi sesi + cakupan rute + regresi mode local.
// Port dari tests/test-tahap1-s1-matrix.sh (staging S0+S1) ke Node murni;
// relay socat diganti relay TCP Node (harness). Nilai dummy saja.
// Dijalankan: node scripts/test-s1.js (lewat `npm test`).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const H = require("./test-harness.js");

const C = H.makeChecks();

async function loginOnly(port, username) {
  const r = await H.req(port, "POST", "/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    body: H.jsonBody({ identifier: username, password: H.DUMMY_PASSWORD }),
  });
  if (r.status !== 200) throw new Error("login " + username + " -> " + r.status);
  const tok = H.parseToken(r.headers["set-cookie"]);
  if (!tok) throw new Error("token login " + username + " kosong");
  return tok;
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-s1-");
  const servers = [];
  const relays = [];
  try {
    // ===== A. MODE LOGIN via relay (simulasi Nginx) =====
    const loginTree = H.makeTree(tmp, "login-tree");
    const srvA = await H.startServer(loginTree, 8471, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvA);
    C.check(H.readLog(loginTree).includes("AI access mode: login"), "A: log mode login");
    const relayA = await H.startRelay(8472, 8471);
    relays.push(relayA);
    const R = 8472; // via relay
    const chatNoProv = { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }] }) };
    C.ok((await H.req(R, "POST", "/api/chat", chatNoProv)).status, 401, "A: login+tanpa login POST chat tanpa Origin");
    C.ok((await H.req(R, "GET", "/api/chat")).status, 401, "A: login+tanpa login GET chat tanpa Origin");
    C.ok((await H.req(R, "GET", "/api/models")).status, 401, "A: login+tanpa login GET models tanpa Origin");
    const forged = { headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" }, body: chatNoProv.body };
    C.ok((await H.req(R, "POST", "/api/chat", forged)).status, 401, "A KUNCI: login+tanpa login POST chat Origin PALSU loopback via relay");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Origin: "http://localhost:8080" } })).status, 401, "A KUNCI: login+tanpa login GET models Origin PALSU via relay");
    C.ok((await H.req(R, "GET", "/api/chat", { headers: { Origin: "http://localhost:8080" } })).status, 401, "A KUNCI: login+tanpa login GET chat Origin PALSU via relay");
    const pubNo = { headers: { Origin: "https://rutbhics.test", "Content-Type": "application/json" }, body: chatNoProv.body };
    C.ok((await H.req(R, "POST", "/api/chat", pubNo)).status, 401, "A: login+tanpa login POST chat Origin publik");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Origin: "https://rutbhics.test" } })).status, 401, "A: login+tanpa login GET models Origin publik");
    const evilNo = { headers: { Origin: "https://jahat.test", "Content-Type": "application/json" }, body: chatNoProv.body };
    C.ok((await H.req(R, "POST", "/api/chat", evilNo)).status, 401, "A: login+tanpa login POST chat Origin jahat");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Origin: "https://jahat.test" } })).status, 401, "A: login+tanpa login GET models Origin jahat");

    const tok = await H.registerLogin(R, "matriks");
    const pubOk = { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tok), "Content-Type": "application/json" }, body: chatNoProv.body };
    C.ok((await H.req(R, "POST", "/api/chat", pubOk)).status, 503, "A: login+sesi POST chat Origin publik diizinkan (503 tanpa kunci)");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tok) } })).status, 200, "A: login+sesi GET models Origin publik diizinkan");
    C.ok((await H.req(R, "GET", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tok) } })).status, 200, "A: login+sesi GET chat Origin publik diizinkan");
    const evilOk = { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tok), "Content-Type": "application/json" }, body: chatNoProv.body };
    C.ok((await H.req(R, "POST", "/api/chat", evilOk)).status, 403, "A: login+sesi POST chat Origin asing");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tok) } })).status, 403, "A: login+sesi GET models Origin asing");
    C.ok((await H.req(R, "GET", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tok) } })).status, 403, "A: login+sesi GET chat Origin asing");
    C.ok((await H.chatPost(R, tok)).status, 503, "A: login+sesi POST chat tanpa Origin diizinkan (klien non-browser)");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tok) } })).status, 200, "A: login+sesi GET models tanpa Origin diizinkan");
    C.ok((await H.req(R, "GET", "/api/chat", { headers: { Cookie: H.cookieHeader(tok) } })).status, 200, "A: login+sesi GET chat tanpa Origin diizinkan");
    const loopOk = { headers: { Origin: "http://localhost:8080", Cookie: H.cookieHeader(tok), "Content-Type": "application/json" }, body: chatNoProv.body };
    C.ok((await H.req(R, "POST", "/api/chat", loopOk)).status, 503, "A: login+sesi POST chat Origin loopback diizinkan");
    C.ok((await H.req(R, "GET", "/api/models", { headers: { Origin: "http://localhost:8080", Cookie: H.cookieHeader(tok) } })).status, 200, "A: login+sesi GET models Origin loopback diizinkan");

    // ===== B. VALIDASI SESI (langsung, tree yang sama) =====
    const D = 8471;
    C.ok((await H.chatPost(D, "sampahacak123")).status, 401, "B: cookie acak sampah POST chat -> 401");
    C.ok((await H.req(D, "GET", "/api/models", { headers: { Cookie: H.cookieHeader("sampahacak123") } })).status, 401, "B: cookie acak sampah GET models -> 401");
    const tokCabut = await H.registerLogin(D, "cabut");
    await H.req(D, "POST", "/api/auth/logout", { headers: { Cookie: H.cookieHeader(tokCabut) } });
    C.ok((await H.req(D, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokCabut) } })).status, 401, "B: token pasca-logout -> 401");
    const tokA = await H.registerLogin(D, "cabutall");
    const tokB = await loginOnly(D, "cabutall");
    await H.req(D, "POST", "/api/auth/logout-all", { headers: { Cookie: H.cookieHeader(tokA) } });
    C.ok((await H.req(D, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokA) } })).status, 401, "B: token A pasca-logout-all -> 401");
    C.ok((await H.req(D, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokB) } })).status, 401, "B: token B pasca-logout-all -> 401");
    await H.stopRelay(relayA);
    relays.splice(relays.indexOf(relayA), 1);
    C.check(await H.stopServer(srvA), "B: server login-tree berhenti");
    servers.splice(servers.indexOf(srvA), 1);

    // ===== B2. TOKEN KEDALUWARSA (tree segar, restart sungguhan) =====
    const expTree = H.makeTree(tmp, "exp-tree");
    const srvE = await H.startServer(expTree, 8473, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvE);
    const tokExp = await H.registerLogin(8473, "kadaluwarsa");
    C.ok((await H.req(8473, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokExp) } })).status, 200, "B2: sanity token segar -> 200");
    C.check(await H.stopServer(srvE), "B2: server berhenti sebelum suntik expired");
    servers.splice(servers.indexOf(srvE), 1);
    const usersFile = path.join(expTree, "rutbhics-users.json");
    const usersData = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const userExp = usersData.users.find((u) => u.username === "kadaluwarsa");
    if (!userExp) throw new Error("B2: user kadaluwarsa tidak ditemukan");
    usersData.sessions = {};
    usersData.sessions[tokExp] = { userId: userExp.id, expires: 1 };
    fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));
    const srvE2 = await H.startServer(expTree, 8473, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvE2);
    C.ok((await H.req(8473, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokExp) } })).status, 401, "B2: token kedaluwarsa GET models -> 401");
    C.ok((await H.chatPost(8473, tokExp)).status, 401, "B2: token kedaluwarsa POST chat -> 401");
    C.check(await H.stopServer(srvE2), "B2: server exp berhenti");
    servers.splice(servers.indexOf(srvE2), 1);

    // ===== C. CAKUPAN RUTE (login-tree dinyalakan lagi) =====
    const srvC = await H.startServer(loginTree, 8471, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvC);
    C.ok((await H.req(8471, "GET", "/api/chat?x=1")).status, 401, "C: query string /api/chat?x=1 ikut digate");
    C.ok((await H.req(8471, "GET", "/api/models?provider=x")).status, 401, "C: query string /api/models ikut digate");
    C.ok((await H.req(8471, "HEAD", "/api/chat")).status, 401, "C: HEAD /api/chat ikut digate (bukan 405 lolos)");
    C.ok((await H.req(8471, "GET", "/api/chat/")).status, 404, "C: trailing slash /api/chat/ TIDAK mencapai handler (404 statis)");
    C.ok((await H.req(8471, "GET", "/api/models/")).status, 404, "C: trailing slash /api/models/ TIDAK mencapai handler (404)");
    C.ok((await H.req(8471, "GET", "/API/CHAT")).status, 404, "C: varian kapital /API/CHAT tidak mencapai handler");
    C.check(await H.stopServer(srvC), "C: server berhenti");
    servers.splice(servers.indexOf(srvC), 1);

    // ===== D. LANGSUNG + LOGIN + Origin publik =====
    const directTree = H.makeTree(tmp, "direct-tree");
    const srvD = await H.startServer(directTree, 8474, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvD);
    const tokD = await H.registerLogin(8474, "langsung");
    C.ok((await H.req(8474, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokD), "Content-Type": "application/json" }, body: chatNoProv.body })).status, 503, "D: langsung+sesi POST chat Origin publik (gate socket lama tidak memblokir)");
    C.ok((await H.req(8474, "GET", "/api/models", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokD) } })).status, 200, "D: langsung+sesi GET models Origin publik");
    C.check(await H.stopServer(srvD), "D: server berhenti");
    servers.splice(servers.indexOf(srvD), 1);

    // ===== E. MODE TURUNAN + EKSPLISIT =====
    const derivTree = H.makeTree(tmp, "deriv-tree");
    const srvE1 = await H.startServer(derivTree, 8475, "0.0.0.0", {});
    servers.push(srvE1);
    C.check(H.readLog(derivTree).includes("AI access mode: login"), "E: turunan host non-loopback -> login");
    C.ok((await H.req(8475, "POST", "/api/chat", { headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" }, body: chatNoProv.body })).status, 401, "E: turunan login tanpa login + Origin loopback -> 401");
    C.check(await H.stopServer(srvE1), "E: server turunan berhenti");
    servers.splice(servers.indexOf(srvE1), 1);
    const srvE2b = await H.startServer(derivTree, 8476, "0.0.0.0", { AI_ACCESS: "local" });
    servers.push(srvE2b);
    C.check(H.readLog(derivTree).includes("AI access mode: local"), "E: explicit-local + non-loopback -> mode tetap local");
    C.check(H.readLog(derivTree).includes("PERINGATAN KERAS: mode local dipilih eksplisit"), "E: peringatan keras startup explicit-local");
    const binText = fs.readFileSync(path.join(derivTree, "bin", "rutbhics.js"), "utf8");
    C.check(binText.includes('return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";'), "E: isLoopback verbatim (cabang socket local tak berubah)");
    C.check(binText.includes("Endpoint /api/chat hanya untuk pemakaian lokal"), "E: cabang 403 socket local masih ada di bin");
    C.check(await H.stopServer(srvE2b), "E: server explicit-local berhenti");
    servers.splice(servers.indexOf(srvE2b), 1);
    const srvE3 = await H.startServer(derivTree, 8477, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvE3);
    C.check(H.readLog(derivTree).includes("AI access mode: login"), "E: explicit-login mengalahkan turunan local");
    C.ok((await H.req(8477, "POST", "/api/chat", { headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" }, body: chatNoProv.body })).status, 401, "E: explicit-login tanpa login + Origin loopback -> 401");
    C.check(await H.stopServer(srvE3), "E: server explicit-login berhenti");
    servers.splice(servers.indexOf(srvE3), 1);
    const srvE4 = await H.startServer(derivTree, 8478, "127.0.0.1", { AI_ACCESS: "bogus" });
    servers.push(srvE4);
    C.check(H.readLog(derivTree).includes("AI_ACCESS tidak valid"), "E: AI_ACCESS tak valid diperingatkan");
    C.check(H.readLog(derivTree).includes("AI access mode: local"), "E: AI_ACCESS tak valid -> mode turunan local");
    C.check(!H.readLog(derivTree).includes("bogus"), "E: nilai AI_ACCESS tak valid TIDAK tercetak di log");
    C.check(await H.stopServer(srvE4), "E: server bogus berhenti");
    servers.splice(servers.indexOf(srvE4), 1);

    // ===== F. MODE LOCAL (regresi) =====
    const localTree = H.makeTree(tmp, "local-tree");
    const srvF = await H.startServer(localTree, 8479, "127.0.0.1", {});
    servers.push(srvF);
    C.check(H.readLog(localTree).includes("AI access mode: local"), "F: log mode local");
    C.ok((await H.req(8479, "POST", "/api/chat", { headers: { Origin: "http://localhost:8479", "Content-Type": "application/json" }, body: chatNoProv.body })).status, 503, "F: local POST chat Origin loopback tanpa login diproses");
    C.ok((await H.req(8479, "GET", "/api/models", { headers: { Origin: "http://localhost:8479" } })).status, 200, "F: local GET models Origin loopback tanpa login");
    C.ok((await H.req(8479, "GET", "/api/chat", { headers: { Origin: "http://localhost:8479" } })).status, 200, "F: local GET chat Origin loopback tanpa login");
    C.ok((await H.req(8479, "GET", "/api/chat", { headers: { Origin: "http://localhost:8479", "X-Forwarded-For": "203.0.113.9" } })).status, 200, "F: local request bertanda XFF tetap diproses (peringatan hanya log)");
    const warnCount = (H.readLog(localTree).match(/PERINGATAN KERAS: tanda proxy teramati/g) || []).length;
    C.ok(warnCount, 1, "F: peringatan proxy tepat 1x per proses");
    C.check(!H.readLog(localTree).includes("rutbhics_token"), "F: tidak ada cookie di log");
    C.check(!H.readLog(localTree).includes("203.0.113.9"), "F: nilai header XFF TIDAK tercetak di log");
    C.ok((await H.req(8479, "GET", "/health")).status, 200, "F: regresi /health");
    C.ok((await H.req(8479, "GET", "/")).status, 200, "F: regresi GET /");
    C.ok((await H.req(8479, "GET", "/rutbhics-users.json")).status, 404, "F: regresi berkas data statis diblokir");
    C.ok((await H.req(8479, "GET", "/config.json")).status, 404, "F: regresi config.json diblokir");
    const tokF = await H.registerLogin(8479, "regresi");
    const roomRes = await H.req(8479, "POST", "/api/rooms", { headers: { Cookie: H.cookieHeader(tokF), "Content-Type": "application/json" }, body: H.jsonBody({ name: "Ruang Tes 2", visibility: "private" }) });
    C.ok(roomRes.status, 200, "F: regresi buat ruang privat");
    let rid = "";
    try { rid = JSON.parse(roomRes.body).room.id; } catch (e) {}
    C.check(!!rid, "F: RID ruang privat diperoleh (" + rid + ")");
    if (rid) {
      C.ok((await H.req(8479, "GET", "/api/rooms/" + rid + "/messages")).status, 401, "F: regresi ruang privat tanpa login -> 401");
      C.ok((await H.req(8479, "POST", "/api/rooms/" + rid + "/messages", { headers: { Cookie: H.cookieHeader(tokF), "Content-Type": "application/json" }, body: H.jsonBody({ text: "halo anggota" }) })).status, 200, "F: regresi tulis ruang privat oleh anggota");
    }
    C.check(await H.stopServer(srvF), "F: server local berhenti");
    servers.splice(servers.indexOf(srvF), 1);

    // ===== G. THROTTLE (hitungan persis, tree segar) =====
    const thrTree = H.makeTree(tmp, "throttle-tree");
    const srvG = await H.startServer(thrTree, 8480, "127.0.0.1", {});
    servers.push(srvG);
    for (const u of ["rega", "regb", "regc", "regd", "rege"]) {
      const r = await H.req(8480, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: u, password: H.DUMMY_PASSWORD }) });
      C.ok(r.status, 200, "G: register " + u + " -> 200");
    }
    C.ok((await H.req(8480, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: "regf", password: H.DUMMY_PASSWORD }) })).status, 429, "G: throttle register ke-6/jam/IP -> 429");
    for (let i = 0; i < 10; i += 1) {
      await H.req(8480, "POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ identifier: "rega", password: "salah1234" }) });
    }
    C.ok((await H.req(8480, "POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ identifier: "rega", password: "salah1234" }) })).status, 429, "G: throttle login gagal ke-11 -> 429");
    C.check(await H.stopServer(srvG), "G: server throttle berhenti");
    servers.splice(servers.indexOf(srvG), 1);
  } finally {
    for (const r of relays) { try { await H.stopRelay(r); } catch (e) {} }
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s1");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL test-s1: " + (e && e.stack || e)); process.exit(2); });

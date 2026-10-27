// Tes S3: throttle tahan proxy (TRUSTED_PROXIES + XFF) + throttle per akun.
// Port dari tests/test-tahap1-s3.sh (staging S3) ke Node murni; relay socat
// diganti relay TCP Node (harness). Nilai dummy saja (IP TEST-NET).
// Dijalankan: node scripts/test-s3.js (lewat `npm test`).
"use strict";

const fs = require("node:fs");
const net = require("node:net");
const H = require("./test-harness.js");

const C = H.makeChecks();
const CT = { "Content-Type": "application/json" };

async function reg(port, user, xff, host) {
  const headers = Object.assign({}, CT);
  if (xff) headers["X-Forwarded-For"] = xff;
  const r = await H.req(port, "POST", "/api/auth/register", { host, headers, body: H.jsonBody({ username: user, password: H.DUMMY_PASSWORD, email: user + "@contoh.test" }) });
  return r.status;
}
async function failLogin(port, identifier, xff, host) {
  const headers = Object.assign({}, CT);
  if (xff) headers["X-Forwarded-For"] = xff;
  const r = await H.req(port, "POST", "/api/auth/login", { host, headers, body: H.jsonBody({ identifier, password: "salah123" }) });
  return r.status;
}
async function okLogin(port, identifier, xff, host) {
  const headers = Object.assign({}, CT);
  if (xff) headers["X-Forwarded-For"] = xff;
  const r = await H.req(port, "POST", "/api/auth/login", { host, headers, body: H.jsonBody({ identifier, password: H.DUMMY_PASSWORD }) });
  return r.status;
}
async function ipv6Available() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(0, "::1", () => { s.close(() => resolve(true)); });
  });
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-s3-");
  const servers = [];
  const relays = [];
  try {
    // ===== A. RELAY + XFF (proxy tepercaya default) =====
    const treeA = H.makeTree(tmp, "tree-a");
    const srvA = await H.startServer(treeA, 8511, "127.0.0.1", {});
    servers.push(srvA);
    const relayA = await H.startRelay(8512, 8511);
    relays.push(relayA);
    const A = 8512;
    C.ok(await reg(A, "userA", "203.0.113.10"), 200, "A: reg userA via XFF .10");
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(A, "userA", "203.0.113.10"), 401, "A: login gagal userA via XFF .10 ke-" + i);
    C.ok(await failLogin(A, "userA", "203.0.113.10"), 429, "A: login gagal ke-11 via XFF .10 -> 429");
    C.ok(await reg(A, "userZ", "203.0.113.20"), 200, "A: reg userZ via XFF .20");
    C.ok(await failLogin(A, "userZ", "203.0.113.20"), 401, "A: login gagal userZ via XFF .20 -> 401 (anggaran .10 tidak memblokir .20)");
    for (const u of ["userB", "userC", "userD", "userE"]) C.ok(await reg(A, u, "203.0.113.10"), 200, "A: reg " + u + " via XFF .10");
    C.ok(await reg(A, "userF", "203.0.113.10"), 429, "A: reg ke-6 via XFF .10 -> 429 (anggaran register .10 habis)");
    C.ok(await reg(A, "userF", "203.0.113.20"), 200, "A: reg userF via XFF .20 -> 200 (anggaran register terpisah)");
    C.ok(await reg(A, "userG", "203.0.113.30, 10.0.0.1"), 200, "A: reg via XFF multi-entri (entri pertama .30)");
    for (const u of ["userH", "userI", "userJ", "userK"]) C.ok(await reg(A, u, "203.0.113.30"), 200, "A: reg " + u + " via XFF .30");
    C.ok(await reg(A, "userL", "203.0.113.30"), 429, "A: reg ke-6 via XFF .30 -> 429");
    C.ok(await reg(A, "userM", "10.0.0.1"), 200, "A: reg via XFF 10.0.0.1 -> 200 (entri kedua header multi-entri tidak pernah dipakai)");
    await H.stopRelay(relayA);
    relays.splice(relays.indexOf(relayA), 1);
    C.check(await H.stopServer(srvA), "A: server berhenti");
    servers.splice(servers.indexOf(srvA), 1);

    // ===== B. RELAY TANPA XFF (tetap per loopback) =====
    const treeB = H.makeTree(tmp, "tree-b");
    const srvB = await H.startServer(treeB, 8513, "127.0.0.1", {});
    servers.push(srvB);
    const relayB = await H.startRelay(8514, 8513);
    relays.push(relayB);
    const B = 8514;
    C.ok(await reg(B, "userG", null), 200, "B: reg userG via relay tanpa XFF");
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(B, "userG", null), 401, "B: login gagal userG via relay tanpa XFF ke-" + i);
    C.ok(await failLogin(B, "userG", null), 429, "B: login gagal ke-11 via relay tanpa XFF -> 429");
    C.ok(await failLogin(8513, "userG", null), 429, "B: login gagal langsung (tanpa relay) -> 429 (satu ember loopback)");
    await H.stopRelay(relayB);
    relays.splice(relays.indexOf(relayB), 1);
    C.check(await H.stopServer(srvB), "B: server berhenti");
    servers.splice(servers.indexOf(srvB), 1);

    // ===== C1. LANGSUNG + XFF PALSU via ::1 (TRUSTED_PROXIES=127.0.0.1 saja) =====
    if (await ipv6Available()) {
      const treeC1 = H.makeTree(tmp, "tree-c1");
      const srvC1 = await H.startServer(treeC1, 8515, "::1", { TRUSTED_PROXIES: "127.0.0.1" });
      servers.push(srvC1);
      C.ok(await reg(8515, "userH", null, "::1"), 200, "C1: reg userH via ::1 tanpa XFF");
      for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(8515, "userH", "203.0.113.99", "::1"), 401, "C1: login gagal userH via ::1 + XFF palsu ke-" + i);
      C.ok(await failLogin(8515, "userH", "203.0.113.99", "::1"), 429, "C1: login gagal ke-11 via ::1 + XFF palsu -> 429");
      C.ok(await failLogin(8515, "userH", "203.0.113.98", "::1"), 429, "C1: XFF palsu lain tetap 429 (nilai XFF tidak mengubah ember)");
      C.ok(await failLogin(8515, "userH", null, "::1"), 429, "C1: tanpa XFF tetap 429 (ember yang sama)");
      C.check(await H.stopServer(srvC1), "C1: server berhenti");
      servers.splice(servers.indexOf(srvC1), 1);
    } else {
      console.log("SKIP C1: loopback IPv6 (::1) tidak tersedia di lingkungan ini");
    }

    // ===== C2. LANGSUNG + XFF PALSU (TRUSTED_PROXIES tidak memuat loopback) =====
    const treeC2 = H.makeTree(tmp, "tree-c2");
    const srvC2 = await H.startServer(treeC2, 8516, "127.0.0.1", { TRUSTED_PROXIES: "203.0.113.1" });
    servers.push(srvC2);
    C.check(H.readLog(treeC2).includes("TRUSTED_PROXIES: 203.0.113.1"), "C2: log TRUSTED_PROXIES kustom tercetak");
    C.ok(await reg(8516, "userI", null), 200, "C2: reg userI langsung tanpa XFF");
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(8516, "userI", "203.0.113.99"), 401, "C2: login gagal userI langsung + XFF palsu ke-" + i);
    C.ok(await failLogin(8516, "userI", "203.0.113.99"), 429, "C2: login gagal ke-11 langsung + XFF palsu -> 429");
    C.ok(await failLogin(8516, "userI", null), 429, "C2: tanpa XFF tetap 429 (ember yang sama)");
    C.ok(await failLogin(8516, "userI", "203.0.113.98"), 429, "C2: XFF palsu lain tetap 429");
    C.check(await H.stopServer(srvC2), "C2: server berhenti");
    servers.splice(servers.indexOf(srvC2), 1);

    // ===== D. THROTTLE PER AKUN (isolasi dari throttle IP) =====
    const treeD = H.makeTree(tmp, "tree-d");
    const srvD = await H.startServer(treeD, 8517, "127.0.0.1", {});
    servers.push(srvD);
    const relayD = await H.startRelay(8518, 8517);
    relays.push(relayD);
    const D = 8518;
    C.ok(await reg(D, "userA", "203.0.113.30"), 200, "D: reg userA via XFF .30");
    C.ok(await reg(D, "userB", "203.0.113.31"), 200, "D: reg userB via XFF .31");
    for (let n = 40; n <= 49; n += 1) C.ok(await failLogin(D, "userA", "203.0.113." + n), 401, "D: login gagal userA via XFF ." + n + " (IP selalu segar)");
    C.ok(await failLogin(D, "userA", "203.0.113.50"), 429, "D: login gagal userA via IP segar .50 -> 429 (HARUS dari throttle AKUN)");
    C.ok(await okLogin(D, "userB", "203.0.113.51"), 200, "D: login BENAR userB via IP segar -> 200 (akun B tidak terpengaruh)");
    C.ok(await okLogin(D, "userA", "203.0.113.52"), 429, "D: login BENAR userA -> 429 (akun A terblokir meski password benar)");
    for (let n = 60; n <= 69; n += 1) C.ok(await failLogin(D, "hantu", "203.0.113." + n), 401, "D: login gagal identifier tak dikenal hantu via XFF ." + n);
    C.ok(await failLogin(D, "hantu", "203.0.113.70"), 429, "D: identifier tak dikenal ke-11 -> 429 (ember per-identifier)");
    C.ok(await reg(D, "hantu", "203.0.113.71"), 200, "D: reg hantu (nama yang tadi ditebak) -> 200");
    C.ok(await okLogin(D, "hantu", "203.0.113.72"), 200, "D: login BENAR hantu -> 200 (kunci u:id != i:identifier, tidak ada lockout bawaan)");
    await H.stopRelay(relayD);
    relays.splice(relays.indexOf(relayD), 1);
    C.check(await H.stopServer(srvD), "D: server berhenti");
    servers.splice(servers.indexOf(srvD), 1);

    // ===== E. REGRESI HITUNGAN LAMA (langsung, tanpa proxy) =====
    const treeE = H.makeTree(tmp, "tree-e");
    const srvE = await H.startServer(treeE, 8519, "127.0.0.1", {});
    servers.push(srvE);
    C.ok(await reg(8519, "userR", null), 200, "E: reg userR");
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(8519, "userR", null), 401, "E: login gagal userR ke-" + i);
    C.ok(await failLogin(8519, "userR", null), 429, "E: login gagal ke-11 -> 429 (hitungan lama persis)");
    for (const u of ["userS", "userT", "userU", "userV"]) C.ok(await reg(8519, u, null), 200, "E: reg " + u);
    C.ok(await reg(8519, "userW", null), 429, "E: reg ke-6 -> 429 (hitungan lama persis)");
    C.ok((await H.req(8519, "GET", "/")).status, 200, "E: GET / -> 200");
    C.ok((await H.req(8519, "GET", "/health")).status, 200, "E: GET /health -> 200");
    C.ok((await H.req(8519, "GET", "/rutbhics-users.json")).status, 404, "E: berkas data statis diblokir");
    C.ok((await H.req(8519, "GET", "/config.json")).status, 404, "E: config.json diblokir");
    C.ok((await H.req(8519, "GET", "/api/rooms")).status, 200, "E: GET /api/rooms -> 200");
    C.check(await H.stopServer(srvE), "E: server berhenti");
    servers.splice(servers.indexOf(srvE), 1);

    // ===== E2. REGRESI ROOMS =====
    const treeE2 = H.makeTree(tmp, "tree-e2");
    const srvE2 = await H.startServer(treeE2, 8520, "127.0.0.1", {});
    servers.push(srvE2);
    const tokRoom = await H.registerLogin(8520, "userRoom");
    const roomRes = await H.req(8520, "POST", "/api/rooms", { headers: { Cookie: H.cookieHeader(tokRoom), "Content-Type": "application/json" }, body: H.jsonBody({ name: "Ruang S3b", visibility: "private" }) });
    C.ok(roomRes.status, 200, "E2: buat ruang privat -> 200");
    let rid = "";
    try { rid = JSON.parse(roomRes.body).room.id; } catch (e) {}
    C.check(!!rid, "E2: RID ruang privat diperoleh (" + rid + ")");
    if (rid) {
      C.ok((await H.req(8520, "GET", "/api/rooms/" + rid + "/messages")).status, 401, "E2: ruang privat tanpa login -> 401");
      C.ok((await H.req(8520, "POST", "/api/rooms/" + rid + "/messages", { headers: { Cookie: H.cookieHeader(tokRoom), "Content-Type": "application/json" }, body: H.jsonBody({ text: "halo anggota" }) })).status, 200, "E2: tulis ruang privat oleh anggota -> 200");
    }
    C.check(await H.stopServer(srvE2), "E2: server berhenti");
    servers.splice(servers.indexOf(srvE2), 1);

    // ===== F. SPOT-CHECK S1 (AI_ACCESS=login + relay) =====
    const treeF = H.makeTree(tmp, "tree-f");
    const srvF = await H.startServer(treeF, 8521, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvF);
    const relayF = await H.startRelay(8522, 8521);
    relays.push(relayF);
    const F = 8522;
    const tokF = await H.registerLogin(F, "s1user");
    const forgedChat = { headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }] }) };
    C.ok((await H.req(F, "POST", "/api/chat", forgedChat)).status, 401, "F: relay tanpa login + Origin palsu POST chat -> 401");
    C.ok((await H.req(F, "GET", "/api/models", { headers: { Origin: "http://localhost:8080" } })).status, 401, "F: relay tanpa login + Origin palsu GET models -> 401");
    C.ok((await H.req(F, "GET", "/api/chat", { headers: { Origin: "http://localhost:8080" } })).status, 401, "F: relay tanpa login + Origin palsu GET chat -> 401");
    C.ok((await H.req(F, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokF), "Content-Type": "application/json" }, body: forgedChat.body })).status, 503, "F: sesi sah + Origin publik -> 503 diproses");
    C.ok((await H.req(F, "GET", "/api/models", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokF) } })).status, 200, "F: sesi sah + Origin publik GET models -> 200");
    C.ok((await H.req(F, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tokF), "Content-Type": "application/json" }, body: forgedChat.body })).status, 403, "F: sesi sah + Origin asing POST chat -> 403");
    C.ok((await H.req(F, "GET", "/api/models", { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tokF) } })).status, 403, "F: sesi sah + Origin asing GET models -> 403");
    await H.stopRelay(relayF);
    relays.splice(relays.indexOf(relayF), 1);
    C.check(await H.stopServer(srvF), "F: server berhenti");
    servers.splice(servers.indexOf(srvF), 1);

    // ===== G. SPOT-CHECK S2 (allowlist model) =====
    const treeG = H.makeTree(tmp, "tree-g", { config: { providers: [
      { id: "openai", type: "openai", baseUrl: "http://127.0.0.1:9", apiKeyEnv: "DUMMY_OPENAI_KEY", models: ["m1"] },
    ] } });
    const srvG = await H.startServer(treeG, 8523, "127.0.0.1", { DUMMY_OPENAI_KEY: "dummy" });
    servers.push(srvG);
    const mahalG = await H.req(8523, "POST", "/api/chat", { headers: { Origin: "http://localhost:8523", "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }], model: "openai:mahal-sekali" }) });
    C.ok(mahalG.status, 400, "G: model fiktif openai:mahal-sekali -> 400");
    C.okBody(mahalG.body, "model_tidak_dikenal", "G: body model_tidak_dikenal");
    C.ok((await H.req(8523, "POST", "/api/chat", { headers: { Origin: "http://localhost:8523", "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }], model: "openai:m1" }) })).status, 502, "G: model dikenal openai:m1 -> diproses (502 upstream tak terjangkau)");
    C.ok((await H.req(8523, "POST", "/api/chat", { headers: { Origin: "http://localhost:8523", "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }] }) })).status, 502, "G: tanpa parameter model -> diproses (bawaan jalan)");
    C.check(await H.stopServer(srvG), "G: server berhenti");
    servers.splice(servers.indexOf(srvG), 1);
  } finally {
    for (const r of relays) { try { await H.stopRelay(r); } catch (e) {} }
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s3");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL test-s3: " + (e && e.stack || e)); process.exit(2); });

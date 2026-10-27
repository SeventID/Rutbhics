// Tes S4: kuota AI per pengguna + rate limit pesan + batas ruang.
// Port dari tests/test-tahap1-s4.sh (staging S4) ke Node murni; relay
// socat diganti relay TCP Node (harness). Provider dummy menunjuk
// upstream tak terjangkau (502 = attempt diproses, bukan 200 semu).
// Ambang sustained 100/jam TIDAK dites live di sini (butuh ~10 menit);
// lihat scripts/test-s4-sustained-manual.js + MANIFEST.
// Dijalankan: node scripts/test-s4.js (lewat `npm test`).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const H = require("./test-harness.js");

const C = H.makeChecks();
const DUMMY_CONFIG = { providers: [{ id: "dummy", name: "Dummy", type: "openai", baseUrl: "http://127.0.0.1:9/", apiKeyEnv: "DUMMY_KEY", models: ["m1"], defaultModel: "m1" }] };
const DUMMY_ENV = "DUMMY_KEY=dummy-test-value\n";

async function postMsg(port, token, room, text) {
  const r = await H.req(port, "POST", "/api/rooms/" + room + "/messages", { headers: { Cookie: H.cookieHeader(token), "Content-Type": "application/json" }, body: H.jsonBody({ text }) });
  return r.status;
}
async function mkRoom(port, token, name, visibility) {
  const b = { name };
  if (visibility) b.visibility = visibility;
  const r = await H.req(port, "POST", "/api/rooms", { headers: { Cookie: H.cookieHeader(token), "Content-Type": "application/json" }, body: H.jsonBody(b) });
  return r;
}
function localDayString(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-s4-");
  const servers = [];
  const relays = [];
  try {
    // ===== A. KUOTA AI (AI_QUOTA_PER_DAY=3, mode login) =====
    const quotaTree = H.makeTree(tmp, "quota-tree", { config: DUMMY_CONFIG, envFile: DUMMY_ENV });
    const srvQ = await H.startServer(quotaTree, 8531, "127.0.0.1", { AI_ACCESS: "login", AI_QUOTA_PER_DAY: "3" });
    servers.push(srvQ);
    const tokC = await H.registerLogin(8531, "kuotaC");
    C.ok((await H.chatPost(8531, tokC, "dummy:tidak-ada")).status, 400, "A: kuota model tak dikenal -> 400 (tidak menghabiskan kuota)");
    for (let i = 1; i <= 3; i += 1) C.ok((await H.chatPost(8531, tokC, "dummy:m1")).status, 502, "A: kuotaC attempt " + i + " -> 502");
    const habisC = await H.chatPost(8531, tokC, "dummy:m1");
    C.ok(habisC.status, 429, "A: kuotaC attempt 4 -> 429 (batas 3)");
    C.okBody(habisC.body, "kuota_habis", "A: body kuota_habis");
    C.ok((await H.req(8531, "GET", "/api/chat", { headers: { Cookie: H.cookieHeader(tokC) } })).status, 200, "A: GET chat saat kuota habis tetap 200 (tidak dihitung)");
    C.ok((await H.req(8531, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokC) } })).status, 200, "A: GET models saat kuota habis tetap 200");
    const tokA = await H.registerLogin(8531, "kuotaA");
    for (let i = 1; i <= 3; i += 1) C.ok((await H.chatPost(8531, tokA, "dummy:m1")).status, 502, "A: kuotaA attempt " + i + " -> 502");
    C.ok((await H.chatPost(8531, tokA, "dummy:m1")).status, 429, "A: kuotaA attempt 4 -> 429");
    const tokB = await H.registerLogin(8531, "kuotaB");
    C.ok((await H.chatPost(8531, tokB, "dummy:m1")).status, 502, "A: kuotaB (pengguna lain) attempt 1 -> 502 (tidak terpengaruh)");
    C.check(await H.stopServer(srvQ), "A: server berhenti (persistensi)");
    servers.splice(servers.indexOf(srvQ), 1);
    const srvQ2 = await H.startServer(quotaTree, 8531, "127.0.0.1", { AI_ACCESS: "login", AI_QUOTA_PER_DAY: "3" });
    servers.push(srvQ2);
    C.ok((await H.chatPost(8531, tokA, "dummy:m1")).status, 429, "A: persistensi setelah restart kuotaA tetap 429");
    const usersData = JSON.parse(fs.readFileSync(path.join(quotaTree, "rutbhics-users.json"), "utf8"));
    const userA = usersData.users.find((u) => u.username === "kuotaA");
    const recA = usersData.aiQuota && userA && usersData.aiQuota[userA.id];
    C.check(!!recA && recA.count === 3, "A: berkas users memuat aiQuota kuotaA count 3 (dapat " + JSON.stringify(recA) + ")");
    C.check(await H.stopServer(srvQ2), "A: server berhenti (ganti hari)");
    servers.splice(servers.indexOf(srvQ2), 1);
    const usersData2 = JSON.parse(fs.readFileSync(path.join(quotaTree, "rutbhics-users.json"), "utf8"));
    const userA2 = usersData2.users.find((u) => u.username === "kuotaA");
    usersData2.aiQuota[userA2.id].date = localDayString(new Date(Date.now() - 86400000));
    fs.writeFileSync(path.join(quotaTree, "rutbhics-users.json"), JSON.stringify(usersData2));
    const srvQ3 = await H.startServer(quotaTree, 8531, "127.0.0.1", { AI_ACCESS: "login", AI_QUOTA_PER_DAY: "3" });
    servers.push(srvQ3);
    C.ok((await H.chatPost(8531, tokA, "dummy:m1")).status, 502, "A: ganti hari kuotaA pulih -> 502");
    C.check(await H.stopServer(srvQ3), "A: server berhenti");
    servers.splice(servers.indexOf(srvQ3), 1);

    // ===== A2. ANONIM LOCAL DIBEBASKAN, LOGIN LOCAL DIKENAI KUOTA =====
    const localTree = H.makeTree(tmp, "local-tree", { config: DUMMY_CONFIG, envFile: DUMMY_ENV });
    const srvL = await H.startServer(localTree, 8532, "127.0.0.1", { AI_QUOTA_PER_DAY: "3" });
    servers.push(srvL);
    C.check(H.readLog(localTree).includes("AI access mode: local"), "A2: log mode local");
    for (let i = 1; i <= 5; i += 1) {
      C.ok((await H.req(8532, "POST", "/api/chat", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ model: "dummy:m1", messages: [{ role: "user", content: "halo" }] }) })).status, 502, "A2: anonim local attempt " + i + " tanpa login -> 502 (tidak kena kuota)");
    }
    const tokL = await H.registerLogin(8532, "localL");
    for (let i = 1; i <= 3; i += 1) C.ok((await H.chatPost(8532, tokL, "dummy:m1")).status, 502, "A2: login local attempt " + i + " -> 502");
    C.ok((await H.chatPost(8532, tokL, "dummy:m1")).status, 429, "A2: login local attempt 4 -> 429 (login local DIKENAI kuota)");
    C.check(await H.stopServer(srvL), "A2: server berhenti");
    servers.splice(servers.indexOf(srvL), 1);

    // ===== A3. ENV KUOTA: 0 = tanpa batas; bogus/-5 = default 50 =====
    const env0Tree = H.makeTree(tmp, "env0-tree", { config: DUMMY_CONFIG, envFile: DUMMY_ENV });
    const srvE0 = await H.startServer(env0Tree, 8533, "127.0.0.1", { AI_ACCESS: "login", AI_QUOTA_PER_DAY: "0" });
    servers.push(srvE0);
    const tokE0 = await H.registerLogin(8533, "envnol");
    let all502 = true;
    for (let i = 0; i < 5; i += 1) { if ((await H.chatPost(8533, tokE0, "dummy:m1")).status !== 502) all502 = false; }
    C.check(all502, "A3: AI_QUOTA_PER_DAY=0 lima attempt semua 502 (tanpa batas)");
    C.check(await H.stopServer(srvE0), "A3: server env0 berhenti");
    servers.splice(servers.indexOf(srvE0), 1);
    for (const [name, val, port] of [["envbogus", "bogus", 8534], ["envneg", "-5", 8535]]) {
      const tree = H.makeTree(tmp, name + "-tree", { config: DUMMY_CONFIG, envFile: DUMMY_ENV });
      const srv = await H.startServer(tree, port, "127.0.0.1", { AI_ACCESS: "login", AI_QUOTA_PER_DAY: val });
      servers.push(srv);
      const tok = await H.registerLogin(port, name);
      let n502 = 0;
      for (let i = 0; i < 50; i += 1) { if ((await H.chatPost(port, tok, "dummy:m1")).status === 502) n502 += 1; }
      C.ok(n502, 50, "A3: AI_QUOTA_PER_DAY=" + val + " 50 attempt -> 502 (default 50)");
      C.ok((await H.chatPost(port, tok, "dummy:m1")).status, 429, "A3: AI_QUOTA_PER_DAY=" + val + " attempt 51 -> 429");
      C.check(await H.stopServer(srv), "A3: server " + name + " berhenti");
      servers.splice(servers.indexOf(srv), 1);
    }

    // ===== B. RATE LIMIT PESAN (burst 10/menit, per pengguna) =====
    const msgTree = H.makeTree(tmp, "msg-tree");
    const srvM = await H.startServer(msgTree, 8536, "127.0.0.1", {});
    servers.push(srvM);
    const tokMA = await H.registerLogin(8536, "pesanA");
    const tokMB = await H.registerLogin(8536, "pesanB");
    for (let i = 1; i <= 10; i += 1) C.ok(await postMsg(8536, tokMA, "umum", "pesan " + i), 200, "B: pesanA pesan " + i + " -> 200");
    const burst11 = await H.req(8536, "POST", "/api/rooms/umum/messages", { headers: { Cookie: H.cookieHeader(tokMA), "Content-Type": "application/json" }, body: H.jsonBody({ text: "pesan 11" }) });
    C.ok(burst11.status, 429, "B: pesanA pesan 11 dalam menit yang sama -> 429");
    C.okBody(burst11.body, "pesan_terlalu_cepat", "B: body pesan_terlalu_cepat");
    C.ok(await postMsg(8536, tokMB, "umum", "dari B"), 200, "B: pesanB (pengguna lain) -> 200 (tidak terpengaruh)");
    C.ok((await H.req(8536, "GET", "/api/rooms/umum/messages", { headers: { Cookie: H.cookieHeader(tokMA) } })).status, 200, "B: baca pesan oleh A yang kena limit -> 200");
    C.ok((await H.req(8536, "GET", "/api/rooms/umum/messages")).status, 200, "B: baca pesan anonim -> 200");
    // Jendela pesan hanya memori: restart mengatur ulang (bukan akuntansi).
    C.check(await H.stopServer(srvM), "B: server berhenti (jendela memori)");
    servers.splice(servers.indexOf(srvM), 1);
    const srvM2 = await H.startServer(msgTree, 8536, "127.0.0.1", {});
    servers.push(srvM2);
    C.ok(await postMsg(8536, tokMA, "umum", "setelah restart"), 200, "B: setelah restart, pesanA bisa kirim lagi (window memori ter-reset)");
    C.check(await H.stopServer(srvM2), "B: server berhenti");
    servers.splice(servers.indexOf(srvM2), 1);
    console.log("CATATAN: ambang sustained 100/jam TIDAK dites live di rantai ini (butuh ~10 menit jeda burst); lihat scripts/test-s4-sustained-manual.js + MANIFEST.");

    // ===== C. BATAS RUANG PER PENGGUNA (5) + CAP GLOBAL 20 =====
    const roomTree = H.makeTree(tmp, "room-tree");
    const srvR = await H.startServer(roomTree, 8537, "127.0.0.1", {});
    servers.push(srvR);
    const tokRA = await H.registerLogin(8537, "ruangA");
    for (let i = 1; i <= 5; i += 1) C.ok((await mkRoom(8537, tokRA, "RuangA" + i)).status, 200, "C: ruangA ruang publik " + i + " -> 200");
    const room6 = await mkRoom(8537, tokRA, "RuangA6");
    C.ok(room6.status, 429, "C: ruangA ruang ke-6 -> 429");
    C.okBody(room6.body, "batas_ruang_per_pengguna", "C: body batas_ruang_per_pengguna");
    const tokRB = await H.registerLogin(8537, "ruangB");
    C.ok((await mkRoom(8537, tokRB, "RuangB1")).status, 200, "C: ruangB (pengguna lain) ruang -> 200 (slot global belum penuh)");
    const tokRC = await H.registerLogin(8537, "ruangC");
    for (let i = 1; i <= 4; i += 1) C.ok((await mkRoom(8537, tokRC, "RuangC" + i)).status, 200, "C: ruangC ruang publik " + i + " -> 200");
    C.ok((await mkRoom(8537, tokRC, "RuangCPriv", "private")).status, 200, "C: ruangC ruang privat ke-5 -> 200 (privat ikut dihitung)");
    C.ok((await mkRoom(8537, tokRC, "RuangC6")).status, 429, "C: ruangC ruang ke-6 -> 429 (privat sudah dihitung)");
    C.check(fs.readFileSync(path.join(roomTree, "rutbhics-chat.json"), "utf8").includes('"createdBy":"ruangA"'), "C: ruang publik baru menyimpan createdBy");
    C.check(await H.stopServer(srvR), "C: server berhenti");
    servers.splice(servers.indexOf(srvR), 1);
    const capTree = H.makeTree(tmp, "cap-tree");
    const srvCap = await H.startServer(capTree, 8538, "127.0.0.1", {});
    servers.push(srvCap);
    for (const u of ["cap1", "cap2", "cap3"]) {
      const tok = await H.registerLogin(8538, u);
      for (let i = 1; i <= 5; i += 1) C.ok((await mkRoom(8538, tok, "R" + u + "_" + i)).status, 200, "C: cap " + u + " ruang " + i + " -> 200");
    }
    const tokCap4 = await H.registerLogin(8538, "cap4");
    for (let i = 1; i <= 4; i += 1) C.ok((await mkRoom(8538, tokCap4, "Rcap4_" + i)).status, 200, "C: cap cap4 ruang " + i + " -> 200");
    const capFull = await mkRoom(8538, tokCap4, "Rcap4_5");
    C.ok(capFull.status, 400, "C: cap global ruang ke-21 total -> 400 (cap4 baru 4, bukan batas per-pengguna)");
    C.okBody(capFull.body, "ruang_penuh", "C: body ruang_penuh");
    C.check(await H.stopServer(srvCap), "C: server cap berhenti");
    servers.splice(servers.indexOf(srvCap), 1);

    // ===== E. REGRESI S1/S2/S3 + STATIC/HEALTH/ROOMS =====
    const regTree = H.makeTree(tmp, "reg-tree", { config: DUMMY_CONFIG, envFile: DUMMY_ENV });
    const srvReg = await H.startServer(regTree, 8539, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvReg);
    const relayReg = await H.startRelay(8540, 8539);
    relays.push(relayReg);
    const RB = 8540;
    const forgedBody = H.jsonBody({ model: "dummy:m1", messages: [{ role: "user", content: "halo" }] });
    C.ok((await H.req(RB, "POST", "/api/chat", { headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" }, body: forgedBody })).status, 401, "E: S1 relay tanpa login + Origin palsu POST chat -> 401");
    C.ok((await H.req(RB, "GET", "/api/models", { headers: { Origin: "http://localhost:8080" } })).status, 401, "E: S1 relay tanpa login + Origin palsu GET models -> 401");
    C.ok((await H.req(RB, "GET", "/api/chat", { headers: { Origin: "http://localhost:8080" } })).status, 401, "E: S1 relay tanpa login + Origin palsu GET chat -> 401");
    const tokR = await H.registerLogin(RB, "regU");
    C.ok((await H.req(RB, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokR), "Content-Type": "application/json" }, body: forgedBody })).status, 502, "E: S1 sesi sah + Origin publik diizinkan -> 502 diproses");
    C.ok((await H.req(RB, "GET", "/api/models", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokR) } })).status, 200, "E: S1 sesi sah + Origin publik GET models -> 200");
    C.ok((await H.req(RB, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tokR), "Content-Type": "application/json" }, body: forgedBody })).status, 403, "E: S1 sesi sah + Origin asing -> 403");
    const s2bad = await H.req(RB, "POST", "/api/chat", { headers: { Cookie: H.cookieHeader(tokR), "Content-Type": "application/json" }, body: H.jsonBody({ model: "dummy:tidak-ada", messages: [{ role: "user", content: "halo" }] }) });
    C.ok(s2bad.status, 400, "E: S2 model fiktif -> 400");
    C.okBody(s2bad.body, "model_tidak_dikenal", "E: S2 body memuat model_tidak_dikenal");
    C.ok((await H.chatPost(RB, tokR, "dummy:m1")).status, 502, "E: S2 model dikenal -> 502 diproses (bukan 400)");
    C.ok((await H.req(RB, "GET", "/api/models", { headers: { Cookie: H.cookieHeader(tokR) } })).status, 200, "E: S1 sesi sah GET models tanpa Origin -> 200");
    await H.stopRelay(relayReg);
    relays.splice(relays.indexOf(relayReg), 1);
    let relayDead = false;
    try { await H.req(RB, "GET", "/api/chat", { headers: { Cookie: H.cookieHeader(tokR) } }); } catch (e) { relayDead = true; }
    C.check(relayDead, "E: relay mati -> koneksi gagal (bukan false pass)");
    C.check(await H.stopServer(srvReg), "E: server reg berhenti");
    servers.splice(servers.indexOf(srvReg), 1);
    const thrTree = H.makeTree(tmp, "thr-tree");
    const srvT = await H.startServer(thrTree, 8541, "127.0.0.1", {});
    servers.push(srvT);
    const tokT = await H.registerLogin(8541, "thrU");
    C.check(!!tokT, "E: token thrU diperoleh");
    async function failLogin(port, identifier, xff) {
      const headers = { "Content-Type": "application/json" };
      if (xff) headers["X-Forwarded-For"] = xff;
      const r = await H.req(port, "POST", "/api/auth/login", { headers, body: H.jsonBody({ identifier, password: "salah123" }) });
      return r.status;
    }
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(8541, "tidakada"), 401, "E: S3 login gagal ke-" + i + " -> 401");
    C.ok(await failLogin(8541, "tidakada"), 429, "E: S3 login gagal ke-11 -> 429");
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(8541, "xffA", "203.0.113.55"), 401, "E: S3 XFF tepercaya gagal ke-" + i + " -> 401");
    C.ok(await failLogin(8541, "xffB", "203.0.113.56"), 401, "E: S3 XFF tepercaya IP berbeda + identifier baru -> 401 (ember per IP XFF)");
    C.ok(await failLogin(8541, "xffC", "203.0.113.55"), 429, "E: S3 XFF tepercaya IP sama + identifier baru -> 429 (ember IP penuh)");
    for (let i = 0; i < 4; i += 1) {
      await H.req(8541, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: "thrU", password: H.DUMMY_PASSWORD, email: "thrU@contoh.test" }) });
    }
    C.ok((await H.req(8541, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: "thrU2", password: H.DUMMY_PASSWORD, email: "thrU2@contoh.test" }) })).status, 429, "E: S3 register percobaan ke-6/jam/IP -> 429");
    C.check(await H.stopServer(srvT), "E: server thr berhenti");
    servers.splice(servers.indexOf(srvT), 1);
    const thr2Tree = H.makeTree(tmp, "thr2-tree");
    const srvT2 = await H.startServer(thr2Tree, 8542, "127.0.0.1", { TRUSTED_PROXIES: "10.0.0.5" });
    servers.push(srvT2);
    for (let i = 1; i <= 10; i += 1) C.ok(await failLogin(8542, "tidakada2", "1.2.3.4"), 401, "E: S3 XFF tak tepercaya gagal ke-" + i + " -> 401");
    C.ok(await failLogin(8542, "tidakada3", "5.6.7.8"), 429, "E: S3 XFF tak tepercaya IP berbeda + identifier baru tetap 429 (XFF diabaikan, ember = socket)");
    C.check(await H.stopServer(srvT2), "E: server thr2 berhenti");
    servers.splice(servers.indexOf(srvT2), 1);
    const miscTree = H.makeTree(tmp, "misc-tree");
    const srvX = await H.startServer(miscTree, 8543, "127.0.0.1", {});
    servers.push(srvX);
    C.ok((await H.req(8543, "GET", "/")).status, 200, "E: regresi GET / -> 200");
    C.ok((await H.req(8543, "GET", "/health")).status, 200, "E: regresi GET /health -> 200");
    C.ok((await H.req(8543, "GET", "/rutbhics-users.json")).status, 404, "E: regresi users statis -> 404");
    C.ok((await H.req(8543, "GET", "/rutbhics-chat.json")).status, 404, "E: regresi chat statis -> 404");
    C.ok((await H.req(8543, "GET", "/config.json")).status, 404, "E: regresi config statis -> 404");
    C.ok((await H.req(8543, "GET", "/api/rooms")).status, 200, "E: regresi GET rooms publik -> 200");
    const tokM = await H.registerLogin(8543, "miscU");
    const privRes = await H.req(8543, "POST", "/api/rooms", { headers: { Cookie: H.cookieHeader(tokM), "Content-Type": "application/json" }, body: H.jsonBody({ name: "RuangPriv", visibility: "private" }) });
    let privId = "";
    try { privId = JSON.parse(privRes.body).room.id; } catch (e) {}
    C.check(!!privId, "E: ruang privat dibuat (" + privId + ")");
    if (privId) C.ok((await H.req(8543, "GET", "/api/rooms/" + privId + "/messages")).status, 401, "E: regresi baca ruang privat anonim -> 401");
    C.check(await H.stopServer(srvX), "E: server misc berhenti");
    servers.splice(servers.indexOf(srvX), 1);
  } finally {
    for (const r of relays) { try { await H.stopRelay(r); } catch (e) {} }
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s4");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL test-s4: " + (e && e.stack || e)); process.exit(2); });

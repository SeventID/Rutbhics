// Tes S2: allowlist model + live-list openai kosong + cache 5 menit +
// penolakan model ber-':' di config + spot-check S1.
// Port dari tests/test-tahap1-s2.sh (staging S2) ke Node murni; server
// fake OpenAI berjalan di dalam berkas ini (tanpa socat/curl).
// Dijalankan: node scripts/test-s2.js (lewat `npm test`).
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const H = require("./test-harness.js");

const C = H.makeChecks();
const CHAT = { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }] }) };

function chatWith(port, model, origin, extraHeaders) {
  const headers = Object.assign({ "Content-Type": "application/json" }, extraHeaders || {});
  if (origin) headers.Origin = origin;
  const b = { messages: [{ role: "user", content: "halo" }] };
  if (model) b.model = model;
  return H.req(port, "POST", "/api/chat", { headers, body: H.jsonBody(b) });
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-s2-");
  const servers = [];
  const relays = [];
  let fake = null;
  let fakeHits = 0;
  try {
    // Server fake OpenAI: /models (hitung hit) + /chat/completions (sukses).
    fake = http.createServer((req, res) => {
      if (req.url === "/models") {
        fakeHits += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "live-a" }, { id: "live-b" }] }));
      } else if (req.url === "/chat/completions") {
        let b = "";
        req.on("data", (c) => { b += c; });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "jawaban-palsu" } }] }));
        });
      } else { res.writeHead(404); res.end(); }
    });
    await new Promise((resolve) => fake.listen(8490, "127.0.0.1", resolve));

    // ===== A. ALLOWLIST + LIVE LIST + CACHE =====
    const treeA = H.makeTree(tmp, "tree-a", { config: { providers: [
      { id: "openai", type: "openai", baseUrl: "http://127.0.0.1:9", apiKeyEnv: "DUMMY_OPENAI_KEY", models: ["m1"] },
      { id: "fakelive", type: "openai", baseUrl: "http://127.0.0.1:8490", apiKeyEnv: "DUMMY_FAKE_KEY", models: [] },
      { id: "fakefail", type: "openai", baseUrl: "http://127.0.0.1:9", apiKeyEnv: "DUMMY_FAIL_KEY", models: [] },
      { id: "tanpaku", type: "openai", baseUrl: "http://127.0.0.1:9", apiKeyEnv: "DUMMY_TIDAK_ADA", models: ["x"] },
    ] } });
    const srvA = await H.startServer(treeA, 8491, "127.0.0.1", { DUMMY_OPENAI_KEY: "dummy1", DUMMY_FAKE_KEY: "dummy2", DUMMY_FAIL_KEY: "dummy3" });
    servers.push(srvA);
    const A = 8491;
    const oA = "http://localhost:8491";
    C.ok((await chatWith(A, "openai:m1", oA)).status, 502, "A: model dikenal openai:m1 -> diproses (502 upstream tak terjangkau)");
    const mahal = await chatWith(A, "openai:mahal-sekali", oA);
    C.ok(mahal.status, 400, "A: model fiktif openai:mahal-sekali -> 400 (bukan 502)");
    C.okBody(mahal.body, "model_tidak_dikenal", "A: error body model_tidak_dikenal");
    C.ok((await chatWith(A, "tidak-kenal", oA)).status, 400, "A: model tanpa prefix tak dikenal -> 400");
    C.ok((await chatWith(A, "m1", oA)).status, 502, "A: model tanpa prefix dikenal (m1) -> diproses 502");
    const noProv = await chatWith(A, "tidakada:m1", oA);
    C.ok(noProv.status, 400, "A: provider tak dikenal -> 400");
    C.okBody(noProv.body, "provider_tidak_dikenal", "A: error body provider_tidak_dikenal");
    C.ok((await chatWith(A, "tanpaku:x", oA)).status, 503, "A: provider tanpa kunci -> 503 (cabang lama utuh)");
    C.ok((await chatWith(A, null, oA)).status, 502, "A: model bawaan tanpa parameter -> tetap jalan (502 upstream)");
    const liveOk = await chatWith(A, "fakelive:live-a", oA);
    C.ok(liveOk.status, 200, "A: live-list fakelive:live-a -> 200");
    C.okBody(liveOk.body, '"model":"fakelive:live-a"', "A: resolved model fakelive:live-a");
    const liveOk2 = await chatWith(A, "fakelive:live-a", oA);
    C.ok(liveOk2.status, 200, "A: validasi live-list kedua -> 200");
    C.ok(fakeHits, 1, "A: cache 2x validasi live-list hanya 1 panggilan upstream (hits=" + fakeHits + ")");
    C.ok((await chatWith(A, "fakelive:tidak-ada", oA)).status, 400, "A: live-list model di luar daftar -> 400");
    C.ok(fakeHits, 1, "A: cache validasi gagal tetap pakai cache (hits tetap 1)");
    C.ok((await chatWith(A, "live-b", oA)).status, 200, "A: bare form konsultasi live-list live-b -> 200");
    C.ok(fakeHits, 1, "A: cache bare live-list pakai cache (hits tetap 1)");
    C.ok((await chatWith(A, "fakefail:apa-saja", oA)).status, 400, "A: live-list gagal diambil -> 400 (bukan diteruskan)");
    C.check(await H.stopServer(srvA), "A: server berhenti");
    servers.splice(servers.indexOf(srvA), 1);

    // ===== B. MODEL BER-':' DI CONFIG =====
    const treeB = H.makeTree(tmp, "tree-b", { config: { providers: [
      { id: "buruk", type: "openai", baseUrl: "http://127.0.0.1:8490", apiKeyEnv: "DUMMY_BURUK_KEY", models: ["baik", "je:lek"], defaultModel: "de:fault" },
    ] } });
    const srvB = await H.startServer(treeB, 8492, "127.0.0.1", { DUMMY_BURUK_KEY: "dummy" });
    servers.push(srvB);
    C.check(H.readLog(treeB).includes("je:lek"), "B: startup memperingatkan model je:lek");
    C.check(H.readLog(treeB).includes("de:fault"), "B: startup memperingatkan defaultModel de:fault");
    const defB = await chatWith(8492, null, "http://localhost:8492");
    C.ok(defB.status, 200, "B: tanpa parameter -> 200");
    C.okBody(defB.body, '"model":"buruk:baik"', "B: defaultModel ber-':' jatuh ke models[0] (buruk:baik)");
    C.ok((await chatWith(8492, "buruk:baik", "http://localhost:8492")).status, 200, "B: model config baik -> 200");
    C.ok((await chatWith(8492, "buruk:je:lek", "http://localhost:8492")).status, 400, "B: model ber-':' ditolak -> 400");
    C.check(await H.stopServer(srvB), "B: server berhenti");
    servers.splice(servers.indexOf(srvB), 1);

    // ===== C. SPOT-CHECK S1 + S2 (login via relay) =====
    const treeC = H.makeTree(tmp, "tree-c", { config: { providers: [
      { id: "openai", type: "openai", baseUrl: "http://127.0.0.1:9", apiKeyEnv: "DUMMY_OPENAI_KEY", models: ["m1"] },
    ] } });
    const srvC = await H.startServer(treeC, 8493, "127.0.0.1", { AI_ACCESS: "login", DUMMY_OPENAI_KEY: "dummy1" });
    servers.push(srvC);
    const relayC = await H.startRelay(8494, 8493);
    relays.push(relayC);
    const RC = 8494;
    C.ok((await H.req(RC, "POST", "/api/chat", { headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" }, body: CHAT.body })).status, 401, "C: S1 relay tanpa login + Origin palsu POST chat -> 401");
    C.ok((await H.req(RC, "GET", "/api/models", { headers: { Origin: "http://localhost:8080" } })).status, 401, "C: S1 relay tanpa login + Origin palsu GET models -> 401");
    const tokC = await H.registerLogin(8493, "spot");
    C.ok((await H.req(RC, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokC), "Content-Type": "application/json" }, body: CHAT.body })).status, 502, "C: S1 sesi sah + Origin publik -> 502 diproses");
    C.ok((await H.req(RC, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://jahat.test", Cookie: H.cookieHeader(tokC), "Content-Type": "application/json" }, body: CHAT.body })).status, 403, "C: S1 sesi sah + Origin asing -> 403");
    C.ok((await H.req(RC, "POST", "/api/chat", { headers: { Host: "rutbhics.test", Origin: "https://rutbhics.test", Cookie: H.cookieHeader(tokC), "Content-Type": "application/json" }, body: H.jsonBody({ messages: [{ role: "user", content: "halo" }], model: "openai:mahal-sekali" }) })).status, 400, "C: gate lolos + allowlist menolak mahal-sekali -> 400 (urutan gate -> allowlist benar)");
    await H.stopRelay(relayC);
    relays.splice(relays.indexOf(relayC), 1);
    C.check(await H.stopServer(srvC), "C: server berhenti");
    servers.splice(servers.indexOf(srvC), 1);

    // ===== D. MODE LOCAL + REGRESI RINGAN =====
    const treeD = H.makeTree(tmp, "tree-d", { config: { providers: [
      { id: "openai", type: "openai", baseUrl: "http://127.0.0.1:9", apiKeyEnv: "DUMMY_OPENAI_KEY", models: ["m1"] },
    ] } });
    const srvD = await H.startServer(treeD, 8495, "127.0.0.1", { DUMMY_OPENAI_KEY: "dummy1" });
    servers.push(srvD);
    C.ok((await chatWith(8495, null, "http://localhost:8495")).status, 502, "D: local tanpa login tetap jalan (502 upstream)");
    C.ok((await H.req(8495, "GET", "/health")).status, 200, "D: regresi /health 200");
    C.ok((await H.req(8495, "GET", "/rutbhics-users.json")).status, 404, "D: regresi berkas data statis 404");
    C.ok((await H.req(8495, "GET", "/api/rooms")).status, 200, "D: regresi GET rooms 200");
    for (let i = 1; i <= 5; i += 1) {
      const r = await H.req(8495, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: "user" + i, password: H.DUMMY_PASSWORD, email: "user" + i + "@contoh.test" }) });
      C.ok(r.status, 200, "D: register user" + i + " -> 200");
    }
    C.ok((await H.req(8495, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: "user6", password: H.DUMMY_PASSWORD, email: "user6@contoh.test" }) })).status, 429, "D: regresi register ke-6 -> 429");
    // user1 sudah terdaftar di loop di atas; login saja (register ulang
    // akan 400 duplikat dan memakan anggaran throttle).
    const loginD = await H.req(8495, "POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ identifier: "user1", password: H.DUMMY_PASSWORD }) });
    const tokD = H.parseToken(loginD.headers["set-cookie"]);
    C.check(!!tokD, "D: token user1 diperoleh");
    C.ok((await H.req(8495, "POST", "/api/rooms", { headers: { Cookie: H.cookieHeader(tokD), "Content-Type": "application/json" }, body: H.jsonBody({ name: "Ruang S2" }) })).status, 200, "D: login user1 buat ruang -> 200");
    C.check(await H.stopServer(srvD), "D: server berhenti");
    servers.splice(servers.indexOf(srvD), 1);
  } finally {
    for (const r of relays) { try { await H.stopRelay(r); } catch (e) {} }
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    if (fake) { try { fake.close(); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s2");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL test-s2: " + (e && e.stack || e)); process.exit(2); });

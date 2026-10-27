// Tes MANUAL ambang sustained 100/jam (S4) — TIDAK masuk rantai `npm test`
// karena memakan waktu ~10 menit (10 batch x 10 pesan, jeda 61 detik antar
// batch DAN sebelum pesan ke-101 agar ambang burst 10/menit tidak terpicu).
// Jalankan: node scripts/test-s4-sustained-manual.js
// Harapan: 100 pesan pertama -> 200; pesan ke-101 dalam jam yang sama ->
// 429 batas_pesan_per_jam. Nilai dummy saja.
"use strict";

const H = require("./test-harness.js");
const C = H.makeChecks();

async function main() {
  const tmp = H.mkTmp("rutbhics-test-s4-sustained-");
  let srv = null;
  try {
    const tree = H.makeTree(tmp, "sustained-tree");
    srv = await H.startServer(tree, 8551, "127.0.0.1", {});
    const tok = await H.registerLogin(8551, "sustainedU");
    let sent = 0;
    for (let batch = 1; batch <= 10; batch += 1) {
      for (let i = 1; i <= 10; i += 1) {
        const r = await H.req(8551, "POST", "/api/rooms/umum/messages", { headers: { Cookie: H.cookieHeader(tok), "Content-Type": "application/json" }, body: H.jsonBody({ text: "batch " + batch + " pesan " + i }) });
        C.ok(r.status, 200, "sustained: batch " + batch + " pesan " + i + " -> 200");
        sent += 1;
      }
      if (batch < 10) {
        console.log("sustained: jeda 61 detik (batch " + batch + " selesai, total " + sent + ")");
        await H.sleep(61000);
      }
    }
    // KOREKSI pacing (temuan run pertama): pesan ke-101 harus dikirim SETELAH
    // jeda 61 detik dari batch 10, kalau tidak jendela burst 10/menit masih
    // berisi 10 pesan batch 10 dan yang terpicu adalah pesan_terlalu_cepat,
    // bukan batas_pesan_per_jam. Jeda ini membersihkan jendela menit
    // sementara 100 pesan tetap di dalam jendela jam.
    console.log("sustained: jeda 61 detik sebelum pesan ke-101 (membersihkan jendela burst)");
    await H.sleep(61000);
    const over = await H.req(8551, "POST", "/api/rooms/umum/messages", { headers: { Cookie: H.cookieHeader(tok), "Content-Type": "application/json" }, body: H.jsonBody({ text: "pesan 101" }) });
    C.ok(over.status, 429, "sustained: pesan ke-101 dalam jam yang sama -> 429");
    C.okBody(over.body, "batas_pesan_per_jam", "sustained: body batas_pesan_per_jam");
  } finally {
    if (srv) { try { await H.stopServer(srv); } catch (e) {} }
    try { require("node:fs").rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s4-sustained-manual");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL sustained-manual: " + (e && e.stack || e)); process.exit(2); });

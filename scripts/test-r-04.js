// Tes R-04: pemeriksaan prefix statis exact-or-separator (defense-in-depth).
// Gaya S11, Node murni, tanpa dependensi. Dijalankan lewat `npm test`.
//
// JUJUR TENTANG APA YANG DIBUKTIKAN TES INI:
// - Audit MEMBUKTIKAN pola lama saat ini TIDAK dapat dieksploitasi via HTTP
//   (FP-01: router melakukan `new URL(req.url)` SEBELUM handler statis, dan
//   parser URL menormalkan segmen dot — semua 11 probe traversal/blocklist
//   -> 404, termasuk berkas sibling yang namanya berawalan nama ROOT).
//   Jadi perbaikan ini adalah PENGERASAN defense-in-depth, BUKAN penutupan
//   kerentanan traversal live. Tes ini TIDAK mengklaim sebaliknya.
// - Konsekuensinya, bukti UTAMA tes ini adalah white-box atas bin pohon
//   yang diuji (bukan main): bentuk exact-or-separator ada, bentuk
//   startsWith(ROOT) telanjang untuk pemeriksaan statis tidak ada. Probe
//   HTTP sibling tidak dicoba karena ia 404 pada kedua versi (lama maupun
//   baru) sehingga tidak dapat membedakan — mencoba dan mengklaimnya
//   sebagai bukti akan menyesatkan.
// - Bukti SEKUNDER adalah regresi live: penyajian statis tetap jalan
//   (index, js, dotfile 404, traversal 404, /health 200).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const H = require("./test-harness.js");

const C = H.makeChecks();
const SRV = 8691;

async function main() {
  // ===== W. White-box atas bin pohon yang diuji =====
  const binSrc = fs.readFileSync(path.join(__dirname, "..", "bin", "rutbhics.js"), "utf8");
  const fixedRe = /filePath\s*!==\s*ROOT\s*&&\s*!filePath\.startsWith\(ROOT\s*\+\s*path\.sep\)/;
  C.check(fixedRe.test(binSrc),
    "W: bin mengandung pemeriksaan exact-or-separator (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep))");
  C.check(!/!filePath\.startsWith\(ROOT\)\)/.test(binSrc),
    "W: bin TIDAK mengandung bentuk startsWith(ROOT) telanjang untuk pemeriksaan statis");
  const joinIdx = binSrc.indexOf("path.normalize(path.join(ROOT, url.pathname))");
  const fixedIdx = binSrc.search(fixedRe);
  C.check(joinIdx !== -1 && fixedIdx !== -1 && fixedIdx > joinIdx,
    "W: pemeriksaan exact-or-separator terletak sesudah konstruksi filePath statis (bukan di tempat lain)");
  C.check(!/SWEEP_INTERVAL|R04_TEST_SEAM/.test(binSrc),
    "W: tidak ada seam/kenop tes pada pemeriksaan ini");

  // ===== L. Regresi live: penyajian statis tetap jalan =====
  const tmp = H.mkTmp("rutbhics-test-r-04-");
  let srv = null;
  try {
    const dir = H.makeTree(tmp, "tree", {});
    srv = await H.startServer(dir, SRV, "127.0.0.1", { AI_ACCESS: "login" });
    const index = await H.req(SRV, "GET", "/", {});
    C.ok(index.status, 200, "L: GET / -> 200 (indeks direktori via cabang === ROOT tetap jalan)");
    const js = await H.req(SRV, "GET", "/js/desktop.js", {});
    C.ok(js.status, 200, "L: GET /js/desktop.js -> 200");
    const login = await H.req(SRV, "GET", "/login.html", {});
    C.ok(login.status, 200, "L: GET /login.html -> 200");
    const dot = await H.req(SRV, "GET", "/.env", {});
    C.ok(dot.status, 404, "L: GET /.env -> 404 (dotfile tetap diblokir)");
    const trav = await H.req(SRV, "GET", "/%2e%2e/%2e%2e/etc/passwd", {});
    C.ok(trav.status, 404, "L: GET traversal ternormalisasi -> 404 (tetap)");
    const data = await H.req(SRV, "GET", "/rutbhics-users.json", {});
    C.ok(data.status, 404, "L: GET berkas data server -> 404 (blocklist P0-1 tetap)");
    const health = await H.req(SRV, "GET", "/health", {});
    C.ok(health.status, 200, "L: GET /health -> 200 (jalur non-statis tetap)");
  } finally {
    if (srv) { try { await H.stopServer(srv); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-r-04");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-r-04 ERROR: " + (e && e.stack || e)); process.exit(1); });

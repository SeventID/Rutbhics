// Tes A2-08: penyapuan berkala map throttle/state (gabung interval prune
// sesi per jam). Gaya S11, Node murni, tanpa dependensi. Dijalankan
// lewat `npm test`.
//
// PERNYATAAN JUJUR TENTANG APA YANG DIUJI DI SINI — BACA DULU:
// Pewaktuan per-jam itu sendiri NOT RUN live: menunggunya butuh satu
// jam, dan menambahkan kenop env khusus-tes ke kode produksi untuk
// mempersingkat interval DITOLAK (preseden penolakan seam tes di kode
// produksi sejak A2-06). Penyapuan juga TIDAK DAPAT dibedakan lewat
// HTTP dari pemeriksaan malas: entri kedaluwarsa sudah ditolak dan
// dibersihkan secara malas, jadi tidak ada respons HTTP yang berubah
// karena penyapuan. Konsekuensinya, tes ini membuktikan:
//  (a) white-box atas bin yang SEDANG DIUJI (pohon tree, bukan main):
//      fungsi sapuan ada, terhubung ke interval per-jam YANG SAMA
//      dengan prune sesi (bukan interval kedua), mencakup kelima map,
//      dan memakai predikat kedaluwarsa yang PERSIS sama dengan
//      pemeriksaan malas (medan + konstanta + perbandingan `>` yang
//      sama) — sehingga sapuan tidak mungkin menghapus entri dalam
//      jendela;
//  (b) smoke live: perilaku login/register/throttle/OAuth tidak
//      berubah oleh penambahan sapuan (sapuan belum berjalan karena
//      intervalnya per jam — smoke ini adalah regresi, bukan bukti
//      sapuan berjalan).
//  Catatan struktur: bila fungsi sapuan tidak ada sama sekali, asersi
//  isi dilewati (bukan dihitung lolos) — 2 cek keberadaan dan kabel
//  interval tetap menggagalkan tes; pada implementasi parsial (fungsi
//  ada tapi cakupan/predikat tidak lengkap), asersi isi berjalan dan
//  menggagalkan sesuai kekurangannya.
// Semantik keamanan TIDAK bergantung pada sapuan: semua keputusan
// blokir tetap ditegakkan pemeriksaan malas.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const H = require("./test-harness.js");

const C = H.makeChecks();
const SRV = 8681;

function sweepBody(src) {
  const start = src.indexOf("function sweepStaleMaps()");
  C.check(start !== -1, "W: fungsi sweepStaleMaps ada di bin");
  if (start === -1) return "";
  const end = src.indexOf("\n}\n", start);
  C.check(end !== -1, "W: fungsi sweepStaleMaps tertutup rapi");
  if (end === -1) return "";
  return src.slice(start, end + 3);
}

async function main() {
  const tmp = H.mkTmp("rutbhics-test-a2-08-");
  let srv = null;
  try {
    const dir = H.makeTree(tmp, "tree", {});
    const binSrc = fs.readFileSync(path.join(dir, "bin", "rutbhics.js"), "utf8");

    // ===== W. White-box: fungsi sapuan + predikat yang sama persis =====
    const body = sweepBody(binSrc);
    if (body) {
      for (const m of ["loginFails", "loginFailsByAccount", "registerAttempts", "oauthStates", "msgRateByUser"]) {
        C.check(body.includes(m), "W: sapuan mencakup map " + m);
      }
      // Predikat kedaluwarsa PERSIS sama dengan pemeriksaan malas:
      // medan + konstanta + `>` yang sama (bukan nilai lain).
      C.check(body.includes("now - loginFails[k].first > 10 * 60 * 1000"),
        "W: sapuan loginFails memakai jendela 10 menit yang sama");
      C.check(body.includes("now - loginFailsByAccount[k].first > 10 * 60 * 1000"),
        "W: sapuan loginFailsByAccount memakai jendela 10 menit yang sama");
      C.check(body.includes("now - registerAttempts[k].first > 60 * 60 * 1000"),
        "W: sapuan registerAttempts memakai jendela 1 jam yang sama");
      C.check(body.includes("now - oauthStates[k].createdAt > 10 * 60 * 1000"),
        "W: sapuan oauthStates memakai jendela 10 menit yang sama");
      C.check(body.includes("t > now - 3600000"),
        "W: sapuan msgRateByUser memakai filter 1 jam yang sama");
      // Batas cakupan: sapuan tidak menyentuh data lain.
      C.check(!body.includes("aiQuota"), "W: sapuan TIDAK menyentuh aiQuota");
      C.check(!body.includes("usersData.sessions"), "W: sapuan TIDAK menyentuh sesi (itu tugas pruneSessions)");
      // Tidak ada seam env untuk pewaktuan sapuan.
      C.check(!binSrc.includes("SWEEP_INTERVAL"), "W: tidak ada kenop env SWEEP_INTERVAL di bin");
    }

    // ===== W2. White-box: interval gabungan, bukan interval kedua =====
    const intervals = (binSrc.match(/setInterval\(/g) || []).length;
    C.ok(intervals, 1, "W2: tepat SATU setInterval di bin (tidak ada interval kedua)");
    const ivStart = binSrc.indexOf("setInterval(");
    const ivEnd = binSrc.indexOf(").unref();", ivStart);
    const ivStmt = ivStart !== -1 && ivEnd !== -1 ? binSrc.slice(ivStart, ivEnd) : "";
    C.check(ivStmt.includes("pruneSessions(true)") && ivStmt.includes("sweepStaleMaps()"),
      "W2: callback interval yang sama memanggil pruneSessions DAN sweepStaleMaps");
    C.check(ivStmt.includes("60 * 60 * 1000"), "W2: interval tetap per jam (60 * 60 * 1000)");

    // ===== S. Smoke live: perilaku tidak berubah =====
    srv = await H.startServer(dir, SRV, "127.0.0.1", { AI_ACCESS: "login" });
    const json = { "Content-Type": "application/json" };
    const reg = await H.req(SRV, "POST", "/api/auth/register", {
      headers: json, body: H.jsonBody({ username: "a208user", password: H.DUMMY_PASSWORD, email: "a208user@contoh.test" })
    });
    C.ok(reg.status, 200, "S: POST /api/auth/register baru -> 200");
    const dup = await H.req(SRV, "POST", "/api/auth/register", {
      headers: json, body: H.jsonBody({ username: "a208user", password: H.DUMMY_PASSWORD, email: "lain@contoh.test" })
    });
    C.ok(dup.status, 400, "S: POST /api/auth/register duplikat -> 400");
    C.check((dup.body || "").includes("pendaftaran_gagal"), "S: duplikat memakai pesan generik pendaftaran_gagal");
    const login = await H.req(SRV, "POST", "/api/auth/login", {
      headers: json, body: H.jsonBody({ identifier: "a208user", password: H.DUMMY_PASSWORD })
    });
    C.ok(login.status, 200, "S: POST /api/auth/login benar -> 200");
    // Throttle login tetap ditegakkan pemeriksaan malas: 10 gagal -> 401, ke-11 -> 429.
    for (let i = 1; i <= 10; i += 1) {
      const w = await H.req(SRV, "POST", "/api/auth/login", {
        headers: json, body: H.jsonBody({ identifier: "a208user", password: "salah1234" })
      });
      C.ok(w.status, 401, "S: login salah ke-" + i + " -> 401");
    }
    const blocked = await H.req(SRV, "POST", "/api/auth/login", {
      headers: json, body: H.jsonBody({ identifier: "a208user", password: "salah1234" })
    });
    C.ok(blocked.status, 429, "S: login salah ke-11 -> 429 (throttle utuh)");
    const oauth = await H.req(SRV, "GET", "/api/auth/google", {});
    C.ok(oauth.status, 400, "S: GET /api/auth/google tanpa konfigurasi -> 400");
    C.check((oauth.body || "").includes("oauth_tidak_dikonfigurasi"), "S: OAuth tanpa konfigurasi memakai pesan yang benar");
    const health = await H.req(SRV, "GET", "/health", {});
    C.ok(health.status, 200, "S: GET /health sesudah semua smoke -> 200 (server hidup)");
  } finally {
    if (srv) await H.stopServer(srv);
  }
  C.summary("test-a2-08");
}

main().catch((e) => { console.error("test-a2-08 GAGAL:", e && e.stack ? e.stack : e); process.exit(1); });

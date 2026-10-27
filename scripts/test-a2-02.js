// Tes regresi A2-02 — Enumerasi akun via timing login (Tahap 4 audit #2, item 2).
// Akar: checkPassword (scryptSync ~109ms) hanya berjalan bila pengguna
// ditemukan; identifier tak dikenal kembali tanpa scrypt (2–3ms), dan
// register duplikat kembali tanpa hash (baru -> scrypt + 200). Selisih
// ~100ms membocorkan eksistensi username/email/HP.
// Perbaikan: login tak-dikenal / tanpa passHash menjalankan scrypt dummy
// (input tetap, hasil dibuang, parameter sama dengan produksi), dan
// register duplikat menjalankan hash dummy yang sama — keduanya SETELAH
// pemeriksaan throttle, sebelum respons generik yang tak berubah.
// Gaya S11: Node murni, dummy saja, server dimatikan sendiri.
// Ambang timing: selisih median < 40ms. Alasan: sebelum perbaikan selisih
// ~100ms (109 vs 2); sesudah perbaikan kedua jalur menjalankan satu
// scrypt identik (~109ms) sehingga sisa diferensial hanya lookup scan,
// JSON, catatan memori, dan satu tulis berkas di jalur register baru —
// semuanya satu digit ms di loopback; sebaran scrypt yang teramati
// ~10ms. 40ms memberi ~4x ruang atas sebaran itu tapi tetap jauh di
// bawah sinyal 100ms dari dummy yang hilang. Median (bukan rata-rata)
// dipakai agar satu outlier (GC/jeda) tidak menggagalkan. Bila ambang ini
// terbukti rapuh di mesin lain, respons yang benar adalah N lebih besar,
// bukan ambang lebih lebar.
// Dijalankan: node scripts/test-a2-02.js (lewat `npm test`).
"use strict";

const H = require("./test-harness.js");
const C = H.makeChecks();

const J = { "Content-Type": "application/json" };
const WRONG = "salahsalah";

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function timed(port, method, path, opts) {
  const t0 = Date.now();
  const r = await H.req(port, method, path, opts);
  return { r, ms: Date.now() - t0 };
}

const loginReq = (port, identifier, password) =>
  timed(port, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier, password }) });
const regReq = (port, body, extraHeaders) =>
  timed(port, "POST", "/api/auth/register", { headers: Object.assign({}, J, extraHeaders || {}), body: H.jsonBody(body) });

async function main() {
  const tmp = H.mkTmp("rutbhics-test-a2-02-");
  const servers = [];
  try {
    // ===== F. Fungsional login + register (port 8571) =====
    // Anggaran throttle server ini: login gagal 4 (< 10), register 4 (< 5).
    const treeF = H.makeTree(tmp, "tree-f");
    const srvF = await H.startServer(treeF, 8571, "127.0.0.1", {});
    servers.push(srvF);
    await H.registerLogin(8571, "korban2");
    C.ok((await H.req(8571, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "korban2", password: H.DUMMY_PASSWORD }) })).status, 200, "F: login benar -> 200");
    const kwU = await H.req(8571, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "korban2", password: WRONG }) });
    C.ok(kwU.status, 401, "F: login ada-salah (username) -> 401");
    C.okBody(kwU.body, "kredensial_salah", "F: login ada-salah pesan generik");
    const kwE = await H.req(8571, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "korban2@contoh.test", password: WRONG }) });
    C.ok(kwE.status, 401, "F: login ada-salah (email) -> 401");
    C.okBody(kwE.body, "kredensial_salah", "F: login ada-salah (email) pesan generik");
    const unU = await H.req(8571, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "hantu2", password: WRONG }) });
    C.ok(unU.status, 401, "F: login tak-dikenal (username) -> 401");
    C.okBody(unU.body, "kredensial_salah", "F: login tak-dikenal pesan IDENTIK dengan ada-salah");
    const unE = await H.req(8571, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "hantu2@contoh.test", password: WRONG }) });
    C.ok(unE.status, 401, "F: login tak-dikenal (email) -> 401");
    C.okBody(unE.body, "kredensial_salah", "F: login tak-dikenal (email) pesan generik");
    C.ok((await H.req(8571, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "baru2", password: H.DUMMY_PASSWORD, email: "baru2@contoh.test" }) })).status, 200, "F: register baru -> 200");
    const dupU = await H.req(8571, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "korban2", password: H.DUMMY_PASSWORD, email: "lain2@contoh.test" }) });
    C.ok(dupU.status, 400, "F: register duplikat username -> 400");
    C.okBody(dupU.body, "pendaftaran_gagal", "F: register duplikat username pesan generik");
    const dupE = await H.req(8571, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "lain2", password: H.DUMMY_PASSWORD, email: "korban2@contoh.test" }) });
    C.ok(dupE.status, 400, "F: register duplikat email -> 400");
    C.okBody(dupE.body, "pendaftaran_gagal", "F: register duplikat email pesan generik");
    await H.stopServer(srvF);
    servers.splice(servers.indexOf(srvF), 1);

    // ===== P. Duplikat phone + throttle register tak berubah (port 8572) =====
    // Anggaran: register 6 percobaan (5 lolos, ke-6 -> 429).
    const treeP = H.makeTree(tmp, "tree-p");
    const srvP = await H.startServer(treeP, 8572, "127.0.0.1", {});
    servers.push(srvP);
    C.ok((await H.req(8572, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "hp2", password: H.DUMMY_PASSWORD, email: "hp2@contoh.test", phone: "081234567890" }) })).status, 200, "P: register dengan phone -> 200");
    const dupP = await H.req(8572, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "hpLain", password: H.DUMMY_PASSWORD, email: "hplain@contoh.test", phone: "081234567890" }) });
    C.ok(dupP.status, 400, "P: register duplikat phone -> 400");
    C.okBody(dupP.body, "pendaftaran_gagal", "P: register duplikat phone pesan generik");
    for (let i = 1; i <= 3; i += 1) {
      C.ok((await H.req(8572, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "pbaru" + i, password: H.DUMMY_PASSWORD, email: "pbaru" + i + "@contoh.test" }) })).status, 200, "P: register baru ke-" + (2 + i) + " -> 200 (throttle belum penuh)");
    }
    const reg6 = await H.req(8572, "POST", "/api/auth/register", { headers: J, body: H.jsonBody({ username: "pbaru6", password: H.DUMMY_PASSWORD, email: "pbaru6@contoh.test" }) });
    C.ok(reg6.status, 429, "P: register percobaan ke-6 -> 429 (throttle register tak berubah)");
    C.okBody(reg6.body, "pendaftaran_dibatasi", "P: register ke-6 pesan throttle");
    await H.stopServer(srvP);
    servers.splice(servers.indexOf(srvP), 1);

    // ===== T. Throttle login tak berubah (port 8573) =====
    const treeT = H.makeTree(tmp, "tree-t");
    const srvT = await H.startServer(treeT, 8573, "127.0.0.1", {});
    servers.push(srvT);
    await H.registerLogin(8573, "korbanT");
    for (let i = 1; i <= 10; i += 1) {
      C.ok((await H.req(8573, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "hantuT", password: WRONG }) })).status, 401, "T: login gagal ke-" + i + " -> 401");
    }
    const fail11 = await H.req(8573, "POST", "/api/auth/login", { headers: J, body: H.jsonBody({ identifier: "hantuT", password: WRONG }) });
    C.ok(fail11.status, 429, "T: login gagal ke-11 -> 429 (throttle login tak berubah, dummy tetap dihitung)");
    C.okBody(fail11.body, "terlalu_banyak_percobaan", "T: login ke-11 pesan throttle");
    await H.stopServer(srvT);
    servers.splice(servers.indexOf(srvT), 1);

    // ===== L. Timing login: ada-salah vs tak-dikenal, 2 ronde server segar =====
    // Per ronde: 5 + 5 sampel = 10 gagal (batas: semua masih 401; ke-11
    // akan 429). Urutan diselang-seling dan giliran pertama dibalik per
    // ronde agar efek pemanasan tidak menguntungkan satu kelompok.
    for (let round = 1; round <= 2; round += 1) {
      const port = round === 1 ? 8574 : 8575;
      const tree = H.makeTree(tmp, "tree-l" + round);
      const srv = await H.startServer(tree, port, "127.0.0.1", {});
      servers.push(srv);
      await H.registerLogin(port, "korbanL");
      const known = [];
      const unknown = [];
      const order = round === 1 ? ["k", "u"] : ["u", "k"];
      for (let i = 0; i < 5; i += 1) {
        for (const kind of order) {
          if (kind === "k") {
            const s = await loginReq(port, "korbanL", WRONG);
            C.ok(s.r.status, 401, "L" + round + ": sampel ada-salah ke-" + (i + 1) + " -> 401");
            known.push(s.ms);
          } else {
            const s = await loginReq(port, "hantuL", WRONG);
            C.ok(s.r.status, 401, "L" + round + ": sampel tak-dikenal ke-" + (i + 1) + " -> 401");
            unknown.push(s.ms);
          }
        }
      }
      const medK = median(known);
      const medU = median(unknown);
      const diff = Math.abs(medK - medU);
      console.log("L" + round + ": ada-salah ms=[" + known.join(",") + "] median=" + medK + " | tak-dikenal ms=[" + unknown.join(",") + "] median=" + medU + " | selisih=" + diff);
      C.check(diff < 40, "L" + round + " KUNCI: selisih median login < 40ms (dapat " + diff + "ms; sebelum perbaikan ~100ms)");
      await H.stopServer(srv);
      servers.splice(servers.indexOf(srv), 1);
    }

    // ===== R. Timing register: duplikat vs baru, 2 ronde (menutup NOT RUN audit) =====
    // Register throttle 5/IP/jam: tiap sampel memakai X-Forwarded-For
    // berbeda (socket loopback tepercaya secara default) sehingga tiap
    // sampel punya ember sendiri dan tidak ada 429 yang meracuni waktu.
    for (let round = 1; round <= 2; round += 1) {
      const port = round === 1 ? 8576 : 8577;
      const tree = H.makeTree(tmp, "tree-r" + round);
      const srv = await H.startServer(tree, port, "127.0.0.1", {});
      servers.push(srv);
      await H.registerLogin(port, "korbanR");
      const dup = [];
      const fresh = [];
      const order = round === 1 ? ["d", "n"] : ["n", "d"];
      for (let i = 0; i < 5; i += 1) {
        for (const kind of order) {
          const xff = { "X-Forwarded-For": "10.9.8." + (i * 2 + (kind === "d" ? 1 : 2)) };
          if (kind === "d") {
            const s = await regReq(port, { username: "korbanR", password: H.DUMMY_PASSWORD, email: "dupR" + i + "@contoh.test" }, xff);
            C.ok(s.r.status, 400, "R" + round + ": sampel duplikat ke-" + (i + 1) + " -> 400");
            dup.push(s.ms);
          } else {
            const s = await regReq(port, { username: "baruR" + round + "_" + i, password: H.DUMMY_PASSWORD, email: "baruR" + round + "_" + i + "@contoh.test" }, xff);
            C.ok(s.r.status, 200, "R" + round + ": sampel baru ke-" + (i + 1) + " -> 200");
            fresh.push(s.ms);
          }
        }
      }
      const medD = median(dup);
      const medN = median(fresh);
      const diff = Math.abs(medD - medN);
      console.log("R" + round + ": duplikat ms=[" + dup.join(",") + "] median=" + medD + " | baru ms=[" + fresh.join(",") + "] median=" + medN + " | selisih=" + diff);
      C.check(diff < 40, "R" + round + " KUNCI: selisih median register < 40ms (dapat " + diff + "ms)");
      await H.stopServer(srv);
      servers.splice(servers.indexOf(srv), 1);
    }
  } finally {
    for (const s of servers) { try { await H.stopServer(s); } catch (e) {} }
    try { require("node:fs").rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-a2-02");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-a2-02 ERROR: " + (e && e.stack || e)); process.exit(1); });

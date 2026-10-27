// Tes S8: scrypt async (A2-09) — event loop tidak lagi diblokir login/register.
// Gaya S11, Node murni, tanpa dependensi. Dijalankan lewat `npm test`.
//
// Latar: audit mengukur scryptSync ~109ms dan memblokir event loop selama
// itu — satu login/register membuat SELURUH server macet (chat, rooms,
// health ikut tertunda). Perbaikan: crypto.scrypt async (threadpool libuv)
// dengan parameter dan format hash yang TIDAK berubah (default N16384/r8/p1,
// keylen 64, format "scrypt:<salt hex>:<hash hex>"), sehingga hash lama
// (scryptSync) tetap terverifikasi byte-identik dan latensi login ~100ms
// dipertahankan — yang hilang hanya pemblokiran loop, bukan biaya scrypt.
// Dummy A2-02 WAJIB ikut async: dummy sync akan tetap memblokir loop pada
// jalur tak-dikenal dan menggagalkan tujuan S8 tepat di jalur itu.
//
// Bukti utama (N): selagi satu login scrypt in-flight, /health selesai
// SEBELUM login selesai — pada kode sync lama hal itu mustahil (loop
// terblokir; health hanya bisa dijawab sesudah callback login kembali).
// Penjaga anti-lolos-semua: login pemicu WAJIB berstatus scrypt (200/401)
// DAN memakan waktu >= 40ms — bila login kena throttle 429 (jalur cepat
// tanpa scrypt), health-duluan akan lolos semu dan tes ini menolaknya.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const H = require("./test-harness.js");

const C = H.makeChecks();
const P = { FMT: 8702, NB: 8703, FUNC: 8704, THR: 8705 };
const JSONH = { "Content-Type": "application/json" };
const OLD_PW = "KataSandiLama1";
const NEW_PW = "KataSandiBaru1";

function stripLineComments(src) {
  return src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
}

async function timed(promise) {
  const t0 = Date.now();
  const r = await promise;
  return { t: Date.now() - t0, r };
}

async function main() {
  // ===== W. White-box atas bin pohon yang diuji =====
  const binSrc = fs.readFileSync(path.join(__dirname, "..", "bin", "rutbhics.js"), "utf8");
  const code = stripLineComments(binSrc);
  C.check(binSrc.includes("util.promisify(crypto.scrypt)"),
    "W: bin memakai crypto.scrypt async via promisify");
  C.check(!code.includes("scryptSync"),
    "W: tidak ada scryptSync tersisa di kode (di luar komentar)");
  C.check(/async function hashPassword/.test(binSrc),
    "W: hashPassword async");
  C.check(/async function checkPassword/.test(binSrc),
    "W: checkPassword async");
  C.check(/async function dummyScrypt/.test(binSrc),
    "W: dummyScrypt async (bukan hanya hash/check)");
  C.check(binSrc.includes("await hashPassword(") && binSrc.includes("await checkPassword(") && binSrc.includes("await dummyScrypt("),
    "W: ketiga call site menunggu hasil async (hash/check/dummy)");
  C.check(!/S8_TEST_SEAM/.test(binSrc),
    "W: tidak ada seam/kenop tes S8");

  const tmp = H.mkTmp("rutbhics-test-s8-");
  const servers = [];
  try {
    // ===== F. Kompatibilitas format: hash lama (scryptSync) tetap valid =====
    const treeF = H.makeTree(tmp, "tree-fmt", {});
    const salt = crypto.randomBytes(16).toString("hex");
    const oldHash = "scrypt:" + salt + ":" + crypto.scryptSync(OLD_PW, salt, 64).toString("hex");
    fs.writeFileSync(path.join(treeF, "rutbhics-users.json"), JSON.stringify({
      users: [{ id: "s8lama-id", username: "s8lama", email: "", phone: "", passHash: oldHash, provider: "local", providerId: "", createdAt: Date.now() }],
      sessions: {},
    }));
    const srvF = await H.startServer(treeF, P.FMT, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvF);
    const loginOld = await H.req(P.FMT, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8lama", password: OLD_PW }) });
    C.ok(loginOld.status, 200, "F: login hash lama (scryptSync) -> 200 (format lama tetap terverifikasi)");
    const loginOldWrong = await H.req(P.FMT, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8lama", password: "salah-salah1" }) });
    C.ok(loginOldWrong.status, 401, "F: login hash lama password salah -> 401");
    const regNew = await H.req(P.FMT, "POST", "/api/auth/register", { headers: JSONH, body: H.jsonBody({ username: "s8baru", password: NEW_PW }) });
    C.ok(regNew.status, 200, "F: register pengguna baru (hash async) -> 200");
    const stored = JSON.parse(fs.readFileSync(path.join(treeF, "rutbhics-users.json"), "utf8"));
    const baru = stored.users.find((u) => u.username === "s8baru");
    C.check(!!baru && /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/.test(baru.passHash || ""),
      "F: passHash baru berformat scrypt:<salt 32 hex>:<hash 128 hex> (format tidak berubah)");
    const loginNew = await H.req(P.FMT, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8baru", password: NEW_PW }) });
    C.ok(loginNew.status, 200, "F: login hash baru (async) -> 200");

    // ===== N. Bukti non-blocking: health selesai SEBELUM login scrypt =====
    const treeN = H.makeTree(tmp, "tree-nb", {});
    const srvN = await H.startServer(treeN, P.NB, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvN);
    const regN = await H.req(P.NB, "POST", "/api/auth/register", { headers: JSONH, body: H.jsonBody({ username: "s8nb", password: H.DUMMY_PASSWORD }) });
    C.ok(regN.status, 200, "N: register pengguna uji non-blocking -> 200");
    // N1: jalur scrypt nyata (login benar).
    const loginP = timed(H.req(P.NB, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8nb", password: H.DUMMY_PASSWORD }) }));
    const healthP = timed(H.req(P.NB, "GET", "/health", {}));
    const [loginN, healthN] = await Promise.all([loginP, healthP]);
    C.ok(loginN.r.status, 200, "N1: login pemicu -> 200 (bukan jalur cepat throttle)");
    C.check(loginN.t >= 40, "N1: login pemicu memakan waktu >= 40ms (scrypt benar berjalan, bukan lolos semu; dapat " + loginN.t + "ms)");
    C.check(healthN.t < loginN.t, "N1: /health selesai SEBELUM login scrypt (" + healthN.t + "ms < " + loginN.t + "ms) — loop tidak terblokir");
    C.check(healthN.t < 100, "N1: /health selagi scrypt in-flight < 100ms (dapat " + healthN.t + "ms)");
    // N2: jalur dummy (login tak-dikenal) — dummy WAJIB ikut async.
    const loginU = timed(H.req(P.NB, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8takada", password: H.DUMMY_PASSWORD }) }));
    const healthU = timed(H.req(P.NB, "GET", "/health", {}));
    const [loginNU, healthNU] = await Promise.all([loginU, healthU]);
    C.ok(loginNU.r.status, 401, "N2: login tak-dikenal pemicu -> 401 (bukan jalur cepat throttle)");
    C.check(loginNU.t >= 40, "N2: login tak-dikenal memakan waktu >= 40ms (dummy scrypt benar berjalan; dapat " + loginNU.t + "ms)");
    C.check(healthNU.t < loginNU.t, "N2: /health selesai SEBELUM login dummy (" + healthNU.t + "ms < " + loginNU.t + "ms) — dummy ikut async");
    // N3: dua login bersamaan tetap dua-duanya 200 (threadpool, bukan antrean loop).
    const [c1, c2] = await Promise.all([
      H.req(P.NB, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8nb", password: H.DUMMY_PASSWORD }) }),
      H.req(P.NB, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8nb", password: H.DUMMY_PASSWORD }) }),
    ]);
    C.ok(c1.status, 200, "N3: login bersamaan #1 -> 200");
    C.ok(c2.status, 200, "N3: login bersamaan #2 -> 200");

    // ===== U. Fungsional register/login tetap utuh =====
    const treeU = H.makeTree(tmp, "tree-func", {});
    const srvU = await H.startServer(treeU, P.FUNC, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvU);
    const regU = await H.req(P.FUNC, "POST", "/api/auth/register", { headers: JSONH, body: H.jsonBody({ username: "s8func", password: H.DUMMY_PASSWORD }) });
    C.ok(regU.status, 200, "U: register -> 200");
    const dupU = await H.req(P.FUNC, "POST", "/api/auth/register", { headers: JSONH, body: H.jsonBody({ username: "s8func", password: H.DUMMY_PASSWORD }) });
    C.ok(dupU.status, 400, "U: register duplikat -> 400");
    C.okBody(dupU.body, "pendaftaran_gagal", "U: register duplikat memakai pesan generik");
    const loginU2 = await H.req(P.FUNC, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8func", password: H.DUMMY_PASSWORD }) });
    C.ok(loginU2.status, 200, "U: login benar -> 200");
    const loginW = await H.req(P.FUNC, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8func", password: "salah-salah1" }) });
    C.ok(loginW.status, 401, "U: login salah password -> 401");
    const loginX = await H.req(P.FUNC, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8tidakada", password: H.DUMMY_PASSWORD }) });
    C.ok(loginX.status, 401, "U: login tak-dikenal -> 401");

    // ===== T. Throttle login tetap bekerja (server terpisah, bucket bersih) =====
    const treeT = H.makeTree(tmp, "tree-thr", {});
    const srvT = await H.startServer(treeT, P.THR, "127.0.0.1", { AI_ACCESS: "login" });
    servers.push(srvT);
    let tenth = null;
    for (let i = 0; i < 10; i++) {
      tenth = await H.req(P.THR, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8thr", password: "salah-salah1" }) });
    }
    C.ok(tenth.status, 401, "T: 10x login salah -> 401 (belum throttle)");
    const eleventh = await H.req(P.THR, "POST", "/api/auth/login", { headers: JSONH, body: H.jsonBody({ identifier: "s8thr", password: "salah-salah1" }) });
    C.ok(eleventh.status, 429, "T: login salah ke-11 -> 429 (throttle tetap bekerja)");
  } finally {
    for (const srv of servers) { try { await H.stopServer(srv); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s8");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-s8 ERROR: " + (e && e.stack || e)); process.exit(1); });

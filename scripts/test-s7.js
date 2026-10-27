// Tes S7: lockfile PID instance-tunggal (A2-05) — satu cwd, satu proses server.
// Gaya S11, Node murni, tanpa dependensi. Dijalankan lewat `npm test`.
//
// Latar: audit membuktikan dua proses satu cwd last-writer-wins dan
// menghilangkan data (server A membuat race1, server B membuat race2 dari
// memori yang belum mengenal race1; setelah restart hanya race2 yang ada).
// Lockfile mencegah kecelakaan itu: proses kedua menolak start.
// Perbaikan permanen multi-instance tetap Tahap 2 SQLite, bukan lock ini.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const H = require("./test-harness.js");

const C = H.makeChecks();
const P = { A: 8695, A2: 8696, B: 8697, C: 8698, D: 8699, E: 8700 };
const BIN = (dir) => path.join(dir, "bin", "rutbhics.js");
const LOCK = (dir) => path.join(dir, ".rutbhics.lock");
function lockContent(dir) {
  try { return fs.readFileSync(LOCK(dir), "utf8").trim(); } catch (e) { return null; }
}

function spawnRaw(dir, port, extraArgs) {
  const args = [BIN(dir), "--port", String(port), "--host", "127.0.0.1"].concat(extraArgs || []);
  const child = cp.spawn(process.execPath, args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  return { child, out: () => out, err: () => err };
}

function waitExit(child, ms) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) { done = true; try { child.kill("SIGKILL"); } catch (e) {} resolve(null); }
    }, ms);
    child.on("exit", (code, signal) => {
      if (!done) { done = true; clearTimeout(t); resolve({ code, signal }); }
    });
  });
}

async function waitPortDead(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await H.req(port, "GET", "/health", {}); } catch (e) { return true; }
    await H.sleep(200);
  }
  return false;
}

async function main() {
  // ===== W. White-box atas bin pohon yang diuji =====
  const binSrc = fs.readFileSync(path.join(__dirname, "..", "bin", "rutbhics.js"), "utf8");
  C.check(binSrc.includes(".rutbhics.lock"),
    "W: bin memakai lockfile .rutbhics.lock (awalan titik -> dotfile 404)");
  C.check(/writeFileSync\(LOCK_FILE[\s\S]*?flag:\s*"wx"/.test(binSrc),
    "W: akuisisi memakai flag wx (eksklusif, atomik)");
  C.check(binSrc.includes("process.kill(") && binSrc.includes(", 0)"),
    "W: pemeriksaan hidup memakai process.kill(pid, 0)");
  const acqIdx = binSrc.indexOf("acquireLock();");
  const chatIdx = binSrc.indexOf("loadJsonWithBackup(CHAT_FILE");
  const usersIdx = binSrc.indexOf("loadJsonWithBackup(USERS_FILE");
  C.check(acqIdx !== -1 && chatIdx !== -1 && usersIdx !== -1 && acqIdx < chatIdx && acqIdx < usersIdx,
    "W: acquireLock() dipanggil SEBELUM load users/chat (proses ditolak tidak menyentuh data)");
  C.check(!/S7_TEST_SEAM|RUTBHICS_NO_LOCK/.test(binSrc),
    "W: tidak ada seam/kenop tes pada lock");

  const tmp = H.mkTmp("rutbhics-test-s7-");
  let srvA = null;
  try {
    // ===== A. Proses kedua di cwd sama ditolak =====
    const treeA = H.makeTree(tmp, "tree-a", {});
    srvA = await H.startServer(treeA, P.A, "127.0.0.1", { AI_ACCESS: "login" });
    C.check(fs.existsSync(LOCK(treeA)), "A: lockfile dibuat saat server jalan");
    C.ok(lockContent(treeA), String(srvA.child.pid),
      "A: lockfile berisi PID server pertama");
    const reg = await H.req(P.A, "POST", "/api/auth/register", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ username: "s7keep", password: H.DUMMY_PASSWORD }) });
    C.ok(reg.status, 200, "A: register pengguna penjaga data -> 200");
    const usersBefore = fs.readFileSync(path.join(treeA, "rutbhics-users.json"), "utf8");
    const dot = await H.req(P.A, "GET", "/.rutbhics.lock", {});
    C.ok(dot.status, 404, "A: GET /.rutbhics.lock -> 404 (dotfile, tidak dilayani)");
    const second = spawnRaw(treeA, P.A2, []);
    const r2 = await waitExit(second.child, 15000);
    C.check(r2 !== null && r2.code !== 0 && r2.code !== null,
      "A: proses kedua exit non-zero (ditolak, bukan menggantung)");
    C.okBody(second.err(), "sudah berjalan", "A: pesan penolakan menyebut server sudah berjalan");
    C.okBody(second.err(), String(srvA.child.pid), "A: pesan penolakan menyebut PID server pertama");
    C.okBody(second.err(), ".rutbhics.lock", "A: pesan penolakan menyebut lockfile");
    C.ok(lockContent(treeA), String(srvA.child.pid),
      "A: lockfile TIDAK diubah proses kedua (tetap PID pertama)");
    const healthA = await H.req(P.A, "GET", "/health", {});
    C.ok(healthA.status, 200, "A: server pertama tetap sehat sesudah penolakan");
    let dead8696 = false;
    try { await H.req(P.A2, "GET", "/health", {}); } catch (e) { dead8696 = true; }
    C.check(dead8696, "A: port proses kedua mati (tidak pernah listen)");
    C.ok(fs.readFileSync(path.join(treeA, "rutbhics-users.json"), "utf8"), usersBefore,
      "A: berkas data TIDAK berubah oleh proses kedua (tidak ada save)");
    const loginKeep = await H.req(P.A, "POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: H.jsonBody({ identifier: "s7keep", password: H.DUMMY_PASSWORD }) });
    C.ok(loginKeep.status, 200, "A: login pengguna penjaga tetap 200 sesudah penolakan");

    // ===== G. Mode --setup melewati lock (bukan ditolak) =====
    // Di lingkungan tanpa terminal pengendali, setup mengambil jalur
    // non-interaktif dan langsung exit 0. Bila terminal tersedia (developer
    // menjalankan npm test di terminalnya sendiri), setup akan bertanya —
    // kasus ini di-SKIP eksplisit agar suite tidak menggantung (preseden
    // SKIP test-s3 untuk IPv6 yang tidak tersedia).
    let hasTty = false;
    try { const fd = fs.openSync("/dev/tty", "r+"); hasTty = true; fs.closeSync(fd); } catch (e) { hasTty = false; }
    if (hasTty) {
      console.log("SKIP: kasus --setup dilewati (terminal interaktif tersedia; setup akan bertanya)");
    } else {
      const setup = spawnRaw(treeA, 0, ["--setup"]);
      // spawnRaw selalu menambah --port/--host; --setup mengabaikannya
      // (cabang setup keluar sebelum server dibuat).
      const rSetup = await waitExit(setup.child, 15000);
      C.check(rSetup !== null && rSetup.code === 0,
        "G: --setup saat server berjalan -> exit 0 (lock dilewati, bukan ditolak)");
      C.ok(lockContent(treeA), String(srvA.child.pid),
        "G: --setup tidak mengubah lock server");
      const healthG = await H.req(P.A, "GET", "/health", {});
      C.ok(healthG.status, 200, "G: server tetap sehat sesudah --setup");
    }
    C.check(await H.stopServer(srvA), "A: server pertama berhenti (SIGTERM)");
    srvA = null;
    C.check(!fs.existsSync(LOCK(treeA)), "A: lockfile hilang sesudah berhenti bersih");

    // ===== B. Lock basi (PID mati) dicuri + peringatan =====
    const treeB = H.makeTree(tmp, "tree-b", {});
    const dummy = cp.spawn(process.execPath, ["-e", ""]);
    const deadPid = dummy.pid;
    await waitExit(dummy, 5000);
    fs.writeFileSync(LOCK(treeB), String(deadPid));
    const srvB = await H.startServer(treeB, P.B, "127.0.0.1", { AI_ACCESS: "login" });
    C.ok(lockContent(treeB), String(srvB.child.pid),
      "B: lock basi dicuri (lockfile kini PID server baru)");
    C.okBody(H.readLog(treeB), "basi", "B: log memuat peringatan lock basi");
    C.check(await H.stopServer(srvB), "B: server basi berhenti");
    C.check(!fs.existsSync(LOCK(treeB)), "B: lockfile hilang sesudah berhenti bersih");

    // ===== C. Lock sampah ditolak =====
    const treeC = H.makeTree(tmp, "tree-c", {});
    fs.writeFileSync(LOCK(treeC), "bukan-pid");
    const garbage = spawnRaw(treeC, P.C, []);
    const rC = await waitExit(garbage.child, 15000);
    C.check(rC !== null && rC.code !== 0 && rC.code !== null,
      "C: lock sampah -> exit non-zero (ditolak, tidak auto-hapus)");
    C.okBody(garbage.err(), "tak dikenal", "C: pesan menyebut data tak dikenal + remedi manual");
    let deadC = false;
    try { await H.req(P.C, "GET", "/health", {}); } catch (e) { deadC = true; }
    C.check(deadC, "C: port lock-sampah mati (server tidak jalan)");
    C.ok(lockContent(treeC), "bukan-pid",
      "C: lock sampah TIDAK dihapus proses yang ditolak");

    // ===== D. SIGTERM membersihkan lock (kasus khusus stopServer) =====
    const treeD = H.makeTree(tmp, "tree-d", {});
    const srvD = await H.startServer(treeD, P.D, "127.0.0.1", { AI_ACCESS: "login" });
    C.check(fs.existsSync(LOCK(treeD)), "D: lockfile ada saat jalan");
    C.check(await H.stopServer(srvD), "D: server berhenti (SIGTERM)");
    C.check(!fs.existsSync(LOCK(treeD)), "D: lockfile hilang sesudah SIGTERM");

    // ===== E. Crash SIGKILL meninggalkan lock; start berikut mencuri =====
    const treeE = H.makeTree(tmp, "tree-e", {});
    const srvE = await H.startServer(treeE, P.E, "127.0.0.1", { AI_ACCESS: "login" });
    const pidE1 = srvE.child.pid;
    try { srvE.child.kill("SIGKILL"); } catch (e) {}
    C.check(await waitPortDead(P.E, 10000), "E: port mati sesudah SIGKILL");
    C.check(fs.existsSync(LOCK(treeE)), "E: lockfile TERTINGGAL sesudah crash (SIGKILL tak bisa bersih)");
    C.ok(lockContent(treeE), String(pidE1),
      "E: lockfile crash masih berisi PID lama");
    const srvE2 = await H.startServer(treeE, P.E, "127.0.0.1", { AI_ACCESS: "login" });
    C.ok(lockContent(treeE), String(srvE2.child.pid),
      "E: start sesudah crash mencuri lock (PID baru)");
    C.okBody(H.readLog(treeE), "basi", "E: log start sesudah crash memuat peringatan lock basi");
    C.check(await H.stopServer(srvE2), "E: server sesudah crash berhenti");
    C.check(!fs.existsSync(LOCK(treeE)), "E: lockfile hilang sesudah berhenti bersih");
  } finally {
    if (srvA) { try { await H.stopServer(srvA); } catch (e) {} }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  const fail = C.summary("test-s7");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-s7 ERROR: " + (e && e.stack || e)); process.exit(1); });

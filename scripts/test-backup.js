// Tes skrip backup P3: salinan byte-identik + manifest + mode .env 600 +
// penolakan direktori di dalam folder aplikasi + gagal bila tidak ada data.
// Port S11 dari staging P3 (dirapikan: path root repo saja).
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");

var WORK = path.join(__dirname, ".."); // root repo (port S11 dari staging P3)
var failures = 0;
function check(cond, msg) {
  if (cond) console.log("OK: " + msg);
  else { console.error("FAIL: " + msg); failures += 1; }
}
function runBackup(cwd, args) {
  return cp.spawnSync(process.execPath, [path.join(WORK, "scripts", "backup.js")].concat(args), {
    cwd: cwd, encoding: "utf8", timeout: 30000
  });
}
function main() {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rutbhics-p3bak-"));
  try {
    // Kasus 1: semua berkas ada (+ .bak) -> salinan lengkap
    var cwd1 = path.join(tmp, "cwd1");
    fs.mkdirSync(cwd1, { recursive: true });
    fs.writeFileSync(path.join(cwd1, "rutbhics-users.json"), JSON.stringify({ users: [{ username: "budi" }] }));
    fs.writeFileSync(path.join(cwd1, "rutbhics-users.json.bak"), JSON.stringify({ users: [] }));
    fs.writeFileSync(path.join(cwd1, "rutbhics-chat.json"), JSON.stringify({ rooms: [] }));
    fs.writeFileSync(path.join(cwd1, ".env"), "LARPROUTER_API_KEY=dummy\n");
    var r1 = runBackup(cwd1, ["--dir", path.join(tmp, "backups")]);
    check(r1.status === 0, "backup lengkap -> exit 0 (stderr: " + (r1.stderr || "").trim().split("\n").pop() + ")");
    var subs = fs.readdirSync(path.join(tmp, "backups")).filter(function (n) { return n.indexOf("rutbhics-backup-") === 0; });
    check(subs.length === 1, "backup lengkap -> satu direktori bertimestamp");
    var dest = path.join(tmp, "backups", subs[0]);
    for (var f of ["rutbhics-users.json", "rutbhics-users.json.bak", "rutbhics-chat.json", ".env"]) {
      check(fs.existsSync(path.join(dest, f)), "backup lengkap -> " + f + " tersalin");
      if (f !== ".env") {
        check(fs.readFileSync(path.join(dest, f), "utf8") === fs.readFileSync(path.join(cwd1, f), "utf8"), "backup lengkap -> " + f + " byte-identik");
      }
    }
    var mode = fs.statSync(path.join(dest, ".env")).mode & 0o777;
    check(mode === 0o600, "backup lengkap -> salinan .env mode 600 (dapat: " + mode.toString(8) + ")");
    var man = JSON.parse(fs.readFileSync(path.join(dest, "manifest.json"), "utf8"));
    check(man.files.length === 4 && man.createdAt, "backup lengkap -> manifest.json 4 berkas + timestamp");

    // Kasus 2: direktori di dalam folder aplikasi -> ditolak
    var r2 = runBackup(cwd1, ["--dir", path.join(WORK, "dilarang")]);
    check(r2.status === 1 && r2.stderr.includes("DITOLAK"), "backup ke dalam folder aplikasi -> exit 1 + DITOLAK");
    check(!fs.existsSync(path.join(WORK, "dilarang")), "backup ke dalam folder aplikasi -> tidak ada direktori dibuat");

    // Kasus 3: tidak ada berkas data -> gagal
    var cwd3 = path.join(tmp, "cwd3");
    fs.mkdirSync(cwd3, { recursive: true });
    var r3 = runBackup(cwd3, ["--dir", path.join(tmp, "backups3")]);
    check(r3.status === 1 && r3.stderr.includes("GAGAL"), "backup tanpa data -> exit 1 + GAGAL");

    // Kasus 4: hanya .env -> sukses parsial
    var cwd4 = path.join(tmp, "cwd4");
    fs.mkdirSync(cwd4, { recursive: true });
    fs.writeFileSync(path.join(cwd4, ".env"), "LARPROUTER_API_KEY=dummy\n");
    var r4 = runBackup(cwd4, ["--dir", path.join(tmp, "backups4")]);
    check(r4.status === 0, "backup hanya .env -> exit 0");
    var subs4 = fs.readdirSync(path.join(tmp, "backups4")).filter(function (n) { return n.indexOf("rutbhics-backup-") === 0; });
    var dest4 = path.join(tmp, "backups4", subs4[0]);
    check(fs.existsSync(path.join(dest4, ".env")) && !fs.existsSync(path.join(dest4, "rutbhics-users.json")), "backup hanya .env -> hanya .env tersalin");
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  if (failures) { console.error("BACKUP GAGAL: " + failures + " cek"); process.exit(1); }
  console.log("BACKUP LOLOS");
}
main();

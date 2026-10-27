// Skrip cadangan manual Rutbhics: menyalin berkas data + .env ke direktori
// backup bertimestamp DI LUAR folder aplikasi (agar tidak ikut dilayani
// sebagai berkas statis). Dijalankan manual:
//   node scripts/backup.js [--dir <direktori-root-backup>]
//   RUTBHICS_BACKUP_DIR=<dir> node scripts/backup.js
// Penjadwalan otomatis (cron/systemd) TIDAK dipasang oleh skrip ini —
// itu keputusan operator. Lihat README bagian Backup.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const NAMES = ["rutbhics-users.json", "rutbhics-chat.json", ".env"];

function parseDir(argv) {
  const i = argv.indexOf("--dir");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  if (process.env.RUTBHICS_BACKUP_DIR) return process.env.RUTBHICS_BACKUP_DIR;
  return path.join(os.homedir(), "rutbhics-backup");
}
function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
// Sumber mengikuti prioritas server: folder kerja dulu, lalu folder paket.
function pickSource(name) {
  const cwdFile = path.join(process.cwd(), name);
  if (fs.existsSync(cwdFile)) return cwdFile;
  const pkgFile = path.join(ROOT, name);
  if (fs.existsSync(pkgFile)) return pkgFile;
  return null;
}
function main() {
  const root = parseDir(process.argv.slice(2));
  const dest = path.join(root, "rutbhics-backup-" + stamp(new Date()));
  // Jangan pernah menulis backup di dalam folder aplikasi: isinya (.env,
  // hash pengguna) bisa dilayani handler statis bila berada di ROOT.
  const resolved = path.resolve(dest);
  const rootResolved = path.resolve(ROOT);
  if (resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)) {
    console.error("[backup] DITOLAK: direktori backup tidak boleh di dalam folder aplikasi (" + ROOT + ") — berkasnya bisa dilayani sebagai berkas statis.");
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), files: [] };
  let copied = 0;
  for (const name of NAMES) {
    const src = pickSource(name);
    if (!src) { console.error("[backup] lewati (tidak ditemukan): " + name); continue; }
    const targets = [src];
    const bak = src + ".bak";
    if (fs.existsSync(bak)) targets.push(bak);
    for (const t of targets) {
      const base = path.basename(t);
      const out = path.join(dest, base);
      fs.copyFileSync(t, out);
      if (base === ".env") { try { fs.chmodSync(out, 0o600); } catch (e) {} }
      manifest.files.push({ name: base, source: t });
      copied += 1;
      console.log("[backup] disalin: " + t + " -> " + out);
    }
  }
  if (!copied) {
    console.error("[backup] GAGAL: tidak ada berkas yang disalin (jalankan dari folder kerja server).");
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
  fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("[backup] selesai: " + copied + " berkas di " + dest);
}
main();

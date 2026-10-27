// Uji negatif S11 (kriteria selesai): rangkaian test-s1 HARUS gagal bila
// gate S1 sengaja dilonggarkan. Caranya: salin pohon repo ke direktori
// temp, mutasi SATU baris bin (aiAccessLogin menganggap semua request
// punya sesi), lalu jalankan scripts/test-s1.js dengan S11_TREE_SRC
// menunjuk pohon termutasi. Uji ini mengharapkan test-s1 GAGAL (exit != 0)
// dan baris FAIL menyebut Origin PALSU (tes kunci). Bila test-s1 lolos
// terhadap bin termutasi, berarti rangkaian tidak menangkap regresi -> FAIL.
// Dijalankan: node scripts/test-negative-gate.js (lewat `npm test`).
// Catatan: lolosnya test-s1 terhadap bin normal sudah dibuktikan oleh
// giliran test-s1 sendiri dalam rantai `npm test` sebelum berkas ini.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const child_process = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const NEEDLE = "function aiAccessLogin(req) {\n  const me = sessionUser(req);";
const MUTANT = 'function aiAccessLogin(req) {\n  const me = { id: "mutan" }; // MUTASI UJI NEGATIF (bukan kode produksi)';

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rutbhics-neg-"));
  try {
    const tree = path.join(tmp, "neg-tree");
    fs.mkdirSync(tree, { recursive: true });
    for (const d of ["bin", "js", "css", "scripts"]) fs.cpSync(path.join(ROOT, d), path.join(tree, d), { recursive: true });
    for (const f of ["index.html", "login.html"]) {
      const src = path.join(ROOT, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tree, f));
    }
    const binFile = path.join(tree, "bin", "rutbhics.js");
    const binText = fs.readFileSync(binFile, "utf8");
    if (!binText.includes(NEEDLE)) {
      console.error("FAIL: pola gate tidak ditemukan di bin (mutasi tidak diterapkan; bin berubah?)");
      process.exit(1);
    }
    fs.writeFileSync(binFile, binText.replace(NEEDLE, MUTANT));
    console.log("mutasi diterapkan: aiAccessLogin menganggap semua request punya sesi");
    const r = child_process.spawnSync(process.execPath, [path.join(ROOT, "scripts", "test-s1.js")], {
      cwd: ROOT, encoding: "utf8", timeout: 300000,
      env: Object.assign({}, process.env, { S11_TREE_SRC: tree }),
    });
    const out = (r.stdout || "") + (r.stderr || "");
    const failed = r.status !== 0;
    const keyFailed = out.includes("FAIL") && out.includes("PALSU");
    console.log("test-s1 terhadap bin termutasi: exit=" + r.status + ", ada FAIL=" + out.includes("FAIL") + ", FAIL menyebut PALSU=" + keyFailed);
    if (!failed) {
      console.error("FAIL: test-s1 LOLOS terhadap gate yang dilonggarkan — rangkaian tidak menangkap regresi!");
      process.exit(1);
    }
    if (!keyFailed) {
      console.error("FAIL: test-s1 gagal, tetapi bukan pada tes kunci Origin PALSU — periksa output di atas");
      process.exit(1);
    }
    console.log("NEGATIF LOLOS: rangkaian menangkap regresi gate (gagal pada tes kunci Origin PALSU)");
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

main();

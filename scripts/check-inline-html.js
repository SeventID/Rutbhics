// Pemeriksaan skrip inline HTML (S11): ekstrak blok <script> tanpa src dari
// index.html/login.html lalu jalankan `node --check` atas masing-masing.
// Hanya pemeriksaan sintaks (tidak dieksekusi), jadi global browser tidak
// masalah. Blok kosong dilewati. Keluar 1 bila ada blok gagal.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const child_process = require("node:child_process");

const ROOT = path.join(__dirname, "..");
let failures = 0;
let checked = 0;
let skipped = 0;

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rutbhics-inline-"));
  try {
    for (const file of ["index.html", "login.html"]) {
      const html = fs.readFileSync(path.join(ROOT, file), "utf8");
      const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;
      let m;
      let idx = 0;
      while ((m = re.exec(html)) !== null) {
        idx += 1;
        const code = m[1];
        if (!code.trim()) { skipped += 1; console.log("SKIP: " + file + " blok skrip #" + idx + " kosong"); continue; }
        const tmpFile = path.join(tmp, file.replace(".html", "") + "-inline-" + idx + ".js");
        fs.writeFileSync(tmpFile, code);
        const r = child_process.spawnSync(process.execPath, ["--check", tmpFile], { encoding: "utf8" });
        checked += 1;
        if (r.status === 0) console.log("OK: " + file + " blok skrip #" + idx + " lolos node --check");
        else { console.error("FAIL: " + file + " blok skrip #" + idx + " gagal node --check:\n" + (r.stderr || "")); failures += 1; }
      }
      if (idx === 0) console.log("INFO: " + file + " tidak punya blok skrip inline");
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  console.log("INLINE-HTML: " + checked + " blok diperiksa, " + skipped + " dilewati, " + failures + " gagal");
  process.exit(failures ? 1 : 0);
}

main();

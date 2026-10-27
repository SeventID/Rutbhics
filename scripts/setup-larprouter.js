// Setup kunci Larprouter untuk Rutbhics — dipakai postinstall npm dan
// perintah `rutbhics --setup`. Murni Node, tanpa dependensi.
//
// Perilaku:
// - Bila berkas .env target sudah berisi LARPROUTER_API_KEY: dilewati.
// - Bila tidak ada terminal interaktif (CI, instalasi non-interaktif):
//   dilewati diam-diam, install tetap jalan.
// - Bila interaktif: tanya "Apakah Anda punya API Larprouter? (y/n)".
//   Jawab y -> minta kunci (ketikan disembunyikan bila memungkinkan),
//   tulis ke .env target. Jawab selain y -> lanjut tanpa AI.
// - Fungsi ini TIDAK PERNAH melempar: kegagalan apa pun berarti "lewati",
//   dan kunci tidak pernah dicetak ke layar.
"use strict";

const fs = require("node:fs");
const child_process = require("node:child_process");

function envHasKey(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.split(/\r?\n/).some(function (line) {
      const m = line.match(/^\s*LARPROUTER_API_KEY\s*=\s*(.+)\s*$/);
      return m && m[1].trim().length > 0;
    });
  } catch (e) {
    return false;
  }
}

function writeKey(file, key) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { text = ""; }
  const lines = text ? text.split(/\r?\n/) : [];
  let replaced = false;
  const out = lines.map(function (line) {
    if (/^\s*LARPROUTER_API_KEY\s*=/.test(line)) {
      replaced = true;
      return "LARPROUTER_API_KEY=" + key;
    }
    return line;
  });
  if (!replaced) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("LARPROUTER_API_KEY=" + key);
  }
  // Buang baris kosong berlebih di akhir, lalu akhiri dengan newline.
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  fs.writeFileSync(file, out.join("\n") + "\n", "utf8");
}

// Baca satu baris dari file descriptor (terminal), tanpa buffering rumit.
function readLine(fd) {
  const buf = Buffer.alloc(1);
  let line = "";
  for (;;) {
    let n = 0;
    try { n = fs.readSync(fd, buf, 0, 1, null); } catch (e) { break; }
    if (n === 0) break; // EOF
    const ch = buf.toString("utf8");
    if (ch === "\n") break;
    if (ch !== "\r") line += ch;
  }
  return line;
}

function setEcho(fd, on) {
  try {
    child_process.spawnSync("stty", [on ? "echo" : "-echo"], {
      stdio: [fd, "ignore", "ignore"]
    });
  } catch (e) { /* stty tidak tersedia: ketikan tetap terlihat, tidak fatal */ }
}

function runSetup(targetEnv) {
  try {
    if (envHasKey(targetEnv)) {
      console.log("Rutbhics: API Larprouter sudah tersimpan, setup dilewati.");
      return "already";
    }
    // Cari terminal: /dev/tty dulu (jalan meski stdin npm tertutup),
    // lalu stdin bila itu TTY. Tanpa keduanya -> instalasi non-interaktif.
    let fd = null;
    let ownFd = false;
    try {
      fd = fs.openSync("/dev/tty", "r+");
      ownFd = true;
    } catch (e) {
      if (process.stdin && process.stdin.isTTY) fd = process.stdin.fd;
    }
    if (fd === null || fd === undefined) {
      console.log("Rutbhics: setup Larprouter dilewati (instalasi non-interaktif). Jalankan `rutbhics --setup` kapan saja untuk mengaktifkan AI.");
      return "skipped";
    }
    try {
      fs.writeSync(fd, "Apakah Anda punya API Larprouter? (y/n): ");
      const answer = readLine(fd).trim().toLowerCase();
      if (["y", "ya", "iya", "yes"].indexOf(answer) === -1) {
        console.log("Rutbhics: lanjut tanpa AI. Nanti bisa diaktifkan lewat `rutbhics --setup` atau dengan mengisi LARPROUTER_API_KEY di .env.");
        return "declined";
      }
      fs.writeSync(fd, "Masukkan API Larprouter Anda: ");
      setEcho(fd, false);
      let key = "";
      try { key = readLine(fd).trim(); }
      finally { setEcho(fd, true); fs.writeSync(fd, "\n"); }
      if (!key) {
        console.log("Rutbhics: kunci kosong, setup dilewati.");
        return "empty";
      }
      writeKey(targetEnv, key);
      console.log("Rutbhics: API Larprouter tersimpan di " + targetEnv + ". Jalankan ulang rutbhics untuk mengaktifkan AI.");
      return "saved";
    } finally {
      if (ownFd) { try { fs.closeSync(fd); } catch (e) {} }
    }
  } catch (e) {
    // Jangan pernah gagalkan install / perintah karena setup.
    console.log("Rutbhics: setup Larprouter dilewati (" + (e && e.message ? e.message : "gagal") + "). Jalankan `rutbhics --setup` untuk mencoba lagi.");
    return "failed";
  }
}

module.exports = { runSetup: runSetup };

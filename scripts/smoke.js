// Smoke test server Rutbhics (dipakai `npm test` + gerbang rilis).
// Murni Node, tanpa dependensi. Menyalin pohon repo ke direktori temp,
// menjalankan server dari sana (cwd == folder paket, kondisi P0-1),
// lalu memeriksa perilaku kunci lewat HTTP. Nilai dummy saja.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const child_process = require("node:child_process");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("OK: " + msg);
  else { console.error("FAIL: " + msg); failures += 1; }
}

function req(port, method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: headers || {} }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

async function waitReady(port, tries) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await req(port, "GET", "/");
      if (r.status === 200) return true;
    } catch (e) { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rutbhics-smoke-"));
  try {
    for (const d of ["bin", "js", "css", "scripts"]) {
      fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    }
    for (const f of ["index.html", "login.html"]) {
      const src = path.join(ROOT, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
    }
    // Berkas data dummy: harus TIDAK PERNAH dilayani (P0-1).
    fs.writeFileSync(path.join(tmp, "rutbhics-users.json"), JSON.stringify({ users: [{ username: "korban", token: "RAHASIA-DUMMY" }] }));
    fs.writeFileSync(path.join(tmp, "rutbhics-chat.json"), JSON.stringify({ rooms: [] }));
    fs.writeFileSync(path.join(tmp, "config.json"), JSON.stringify({ providers: [] }));

    const ports = [8251, 8252, 8253];
    let port = 0;
    let child = null;
    for (const p of ports) {
      child = child_process.spawn(process.execPath, [path.join(tmp, "bin", "rutbhics.js"), "--port", String(p)], { cwd: tmp, stdio: "ignore" });
      if (await waitReady(p, 12)) { port = p; break; }
      try { child.kill(); } catch (e) {}
      child = null;
    }
    if (!port) { console.error("FAIL: server tidak siap di port manapun"); process.exit(1); }
    try {
      const home = await req(port, "GET", "/");
      check(home.status === 200, "GET / -> 200");
      check(home.headers["x-content-type-options"] === "nosniff", "header nosniff ada di /");
      check(home.headers["referrer-policy"] === "strict-origin-when-cross-origin", "header Referrer-Policy ada di /");
      for (const f of ["rutbhics-users.json", "rutbhics-chat.json", "config.json"]) {
        const r = await req(port, "GET", "/" + f);
        check(r.status === 404 && !r.body.includes("RAHASIA-DUMMY"), "GET /" + f + " -> 404, tanpa bocor");
      }
      const rooms = await req(port, "GET", "/api/rooms");
      check(rooms.status === 200, "GET /api/rooms -> 200");
      // S11: login memakai field `identifier` (bukan `username`) dan menguji
      // kredensial benar-salah yang sesungguhnya. Smoke lama lolos 401 dengan
      // alasan salah: login membaca `identifier`, jadi kiriman `username`
      // menghasilkan identifier kosong, bukan kredensial yang diuji.
      const regSm = await req(port, "POST", "/api/auth/register", { "Content-Type": "application/json" }, JSON.stringify({ username: "smokeuser", password: "rahasia123", email: "smokeuser@contoh.test" }));
      check(regSm.status === 200, "POST /api/auth/register pengguna smoke -> 200");
      const loginOk = await req(port, "POST", "/api/auth/login", { "Content-Type": "application/json" }, JSON.stringify({ identifier: "smokeuser", password: "rahasia123" }));
      check(loginOk.status === 200, "POST /api/auth/login kredensial benar -> 200");
      const loginBad = await req(port, "POST", "/api/auth/login", { "Content-Type": "application/json" }, JSON.stringify({ identifier: "smokeuser", password: "salahsalah" }));
      check(loginBad.status === 401, "POST /api/auth/login kredensial salah -> 401");
      const loginUnknown = await req(port, "POST", "/api/auth/login", { "Content-Type": "application/json" }, JSON.stringify({ identifier: "tidakada", password: "salahsalah" }));
      check(loginUnknown.status === 401, "POST /api/auth/login identifier tak dikenal -> 401");
      const chat = await req(port, "POST", "/api/chat", { "Content-Type": "application/json" }, JSON.stringify({ messages: [{ role: "user", content: "halo" }] }));
      check((chat.status === 502 || chat.status === 503) && chat.body.includes("error"), "POST /api/chat tanpa kunci -> 502/503 jujur");
      const models = await req(port, "GET", "/api/models");
      check(models.status === 200, "GET /api/models -> 200");
      let healthOk = false;
      try { const h = await req(port, "GET", "/health"); healthOk = h.status === 200 && JSON.parse(h.body).ok === true; } catch (e) {}
      check(healthOk, "GET /health -> 200 {ok:true}");
    } finally {
      try { child.kill(); } catch (e) {}
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  if (failures) { console.error("SMOKE GAGAL: " + failures + " cek"); process.exit(1); }
  console.log("SMOKE LOLOS");
}

main().catch((e) => { console.error("SMOKE ERROR: " + (e && e.stack || e)); process.exit(1); });

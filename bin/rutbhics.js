#!/usr/bin/env node
// Rutbhics — server statis lokal, tanpa dependensi.
// Pakai: rutbhics [--port 8080]  atau  PORT=8080 rutbhics
// Lalu buka http://localhost:8080 di browser.
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function parsePort(argv) {
  let port = parseInt(process.env.PORT, 10);
  const i = argv.indexOf("--port");
  if (i !== -1 && argv[i + 1]) port = parseInt(argv[i + 1], 10);
  if (!port || port < 1 || port > 65535) port = 8080;
  return port;
}

const port = parsePort(process.argv.slice(2));
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let filePath = path.normalize(path.join(ROOT, url.pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Tidak ditemukan");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Terjadi kesalahan");
  }
});
server.listen(port, () => {
  console.log("Rutbhics berjalan di http://localhost:" + port);
  console.log("Buka alamat itu di browser. Tekan Ctrl+C untuk berhenti.");
});

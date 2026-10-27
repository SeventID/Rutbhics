// Postinstall npm: tawarkan setup kunci Larprouter saat install interaktif.
// TIDAK PERNAH menggagalkan install: segala kegagalan berarti "lewati".
"use strict";
try {
  const path = require("node:path");
  const setup = require("./setup-larprouter.js");
  // Target: .env di folder paket (dipakai server sebagai cadangan bila
  // folder kerja tidak punya .env). Upgrade npm mengganti folder paket,
  // jadi kunci di sini bisa hilang saat update — pengguna bisa menjalankan
  // `rutbhics --setup` dari folder kerjanya untuk salinan yang permanen.
  setup.runSetup(path.join(__dirname, "..", ".env"));
} catch (e) { /* abaikan: install tetap lanjut */ }
process.exit(0);

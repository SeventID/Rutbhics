<div align="center">

# 🖥️ Rutbhics

**Desktop komputer di dalam browser: window manager, taskbar, menu Start, dan aplikasi yang berjalan langsung di halaman web.**

Tanpa build step, tanpa framework — murni HTML + CSS + JavaScript vanilla.

[![npm version](https://img.shields.io/npm/v/rutbhics)](https://www.npmjs.com/package/rutbhics)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## 🚀 Mulai cepat

**Lewat npm** (butuh Node.js):

```bash
npm install -g rutbhics
rutbhics
# lalu buka http://localhost:8080
```

Port bisa diubah: `rutbhics --port 3000` atau `PORT=3000 rutbhics`.
Tanpa install permanen: `npx rutbhics`.

Akses dari perangkat lain: secara bawaan server hanya mendengarkan
localhost. Untuk LAN, jalankan `rutbhics --host 0.0.0.0` lalu buka
`http://<IP-perangkat-server>:8080` dari perangkat lain. Untuk akses
internet, JANGAN membuka port langsung — pakai reverse proxy (mis. Nginx)
+ HTTPS + firewall.

**Tanpa install** — buka `index.html` langsung di browser, atau dari terminal:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Saat install interaktif, installer bertanya: "Apakah Anda punya API
Larprouter? (y/n)". Jawab `y` lalu masukkan kunci (ketikan disembunyikan)
maka AI di Obrolan langsung aktif; jawab selain `y` maka install lanjut
tanpa AI. Instalasi non-interaktif (CI, skrip) dilewati otomatis tanpa
menghentikan install. Catatan: kunci dari installer tersimpan di `.env`
folder paket — saat package di-update, folder itu diganti dan kunci bisa
hilang. Untuk salinan permanen, jalankan `rutbhics --setup` dari folder
kerjamu (kunci tersimpan di `.env` folder itu, yang selalu dimenangkan
server atas `.env` folder paket).

## 🧩 Aplikasi

| Aplikasi | Fungsinya |
| --- | --- |
| 💬 **Obrolan** | Chatting gaya WhatsApp: daftar kontak, kirim pesan, balasan AI (lihat Bot AI), plus mode 👥 Multi-User. Riwayat tersimpan di `localStorage` perangkat. |
| 🌐 **Peramban** | Mini browser berbasis iframe + kolom alamat + tautan cepat. Catatan: banyak situs besar memblokir tampil di iframe (X-Frame-Options). |
| 📝 **Catatan** | Catatan teks tersimpan di `localStorage`. |
| 🔢 **Kalkulator** | Operasi dasar tanpa `eval`. |
| 📁 **Files** | Penjelajah berkas virtual (folder, berkas teks, edit, hapus), tersimpan di `localStorage`. |
| ⚙️ **Pengaturan** | Ganti wallpaper (4 pilihan) dan tema terang/gelap, tersimpan di `localStorage` dan diterapkan saat desktop dibuka lagi. Juga tempat mengganti bahasa (Indonesia/Inggris). |
| 🎵 **Musik** | Player audio & video mini: putar/jeda, trek sebelum/sesudah, geser posisi, volume, daftar putar. Trek demo dari URL publik (butuh internet); trek tambahan (URL audio/video apa pun) bisa ditambahkan dan tersimpan di `localStorage`. |
| 💻 **Terminal** | Terminal web dengan perintah semu: help, about, echo, date, clear + riwayat tombol panah. |
| 🎨 **Gambar** | Kanvas coret-coret 800×500: 6 warna + penghapus, 3 ukuran kuas, unduh PNG; gambar tersimpan otomatis di `localStorage`. |

Di desktop juga ada **widget jam/kalender** (pojok kanan atas): jam WIB live
tiap detik, tanggal lengkap, dan kalender bulan berjalan yang bisa dinavigasi.
Jendela mendukung **maximize** (tombol ⛶ / double-click header) dan **snap**
kiri/kanan/atas dengan drag ke tepi layar.

## 🔐 Login & penggunaan sebagai server

Rutbhics bisa dijalankan sebagai server web statis (mis. `python3 -m http.server`,
Nginx, atau hosting statis apa pun) — tidak butuh backend.

- Buka halaman utama: pengunjung diarahkan ke `login.html`.
- Bila halaman dilayani server `rutbhics` (bukan hosting statis),
  `login.html` menampilkan login/daftar AKUN SERVER (username/email/HP +
  kata sandi, atau Google/GitHub bila dikonfigurasi) — dan begitu masuk,
  chat multi-user langsung mengenalimu tanpa login lagi (cukup login
  sekali di halaman pertama). Di hosting statis tanpa server, tetap
  berlaku akun lokal perangkat seperti di bawah; tautan "Pakai akun lokal
  perangkat" selalu tersedia di form server.
- Kunjungan pertama (akun lokal): buat akun perangkat (nama pengguna + kata sandi).
  Akun tersimpan lokal di perangkat itu (kata sandi di-hash SHA-256 bila
  konteks aman, fallback hash sederhana bila tidak).
- Setelah masuk, desktop terkunci di balik sesi tab itu; keluar lewat
  tombol **Keluar** di menu Start.
- Catatan jujur: kunci ini hanya pengaman demo sisi klien, bukan
  autentikasi server sungguhan. Untuk akun multi-pengguna yang aman,
  diperlukan backend (mis. Node + database + sesi) di tahap berikutnya.

## 🔔 Notifikasi & pusat kontrol (taskbar)

- Tombol lonceng 🔔 di taskbar dengan badge jumlah notifikasi belum dibaca.
- Panel notifikasi: daftar notifikasi (waktu WIB), hapus semua, dan
  otomatis tandai sudah dibaca saat panel dibuka. Notifikasi tersimpan di
  `localStorage`, maksimal 30 terbaru.
- Pusat kontrol di panel yang sama: ganti tema terang/gelap (tersambung ke
  Pengaturan lewat `localStorage`), mode Jangan Ganggu (mematikan toast
  pop-up), tombol buka Pengaturan, dan tombol kirim notifikasi tes.
- Toast pop-up muncul tiap notifikasi baru (kecuali mode Jangan Ganggu
  aktif), hilang sendiri setelah 4 detik atau saat diklik.

## 📂 Struktur

```
index.html        — shell: wallpaper, ikon desktop, taskbar, menu Start, panel notifikasi & pusat kontrol, widget jam/kalender
login.html        — halaman login (login server bila dilayani rutbhics, fallback akun lokal) + kunci desktop
css/style.css     — seluruh tampilan desktop & aplikasi
js/desktop.js     — window manager (drag, minimize, focus, taskbar, jam WIB, terapkan pengaturan tersimpan, notifikasi & pusat kontrol, maximize & snap)
js/apps.js        — aplikasi bawaan (obrolan, peramban, catatan, kalkulator, files, pengaturan, musik, terminal, gambar)
package.json      — metadata package npm + perintah `rutbhics`
bin/rutbhics.js   — server lokal (tanpa dependensi) untuk perintah `rutbhics`, termasuk proxy Bot AI (/api/chat) dan chat multi-user
config.example.json — contoh config.json multi-provider (tanpa kunci)
.env.example      — contoh konfigurasi lokal Bot AI (kunci API, base URL, model; tanpa nilai asli)
.gitignore        — menjaga .env dan config.json tidak masuk repo
```

## 🤖 Bot AI (Larprouter)

Semua kontak di aplikasi Obrolan (Teman, Grup Keluarga, Bot Asisten) menjawab
memakai AI Larprouter (OpenAI-compatible), bukan lagi balasan demo acak —
masing-masing dengan persona-nya sendiri (teman akrab, anggota keluarga,
asisten). Catatan jujur: mereka tetap persona AI, bukan orang sungguhan;
chat antar pengguna beneran ada di mode "👥 Multi-User" (lihat di bawah).

Cara mengaktifkan:

1. Salin `.env.example` menjadi `.env` di folder tempat kamu menjalankan `rutbhics`.
2. Isi `LARPROUTER_API_KEY` dengan kunci Larprouter-mu.
3. Jalankan ulang `rutbhics`, buka Obrolan, pilih kontak mana pun.

Catatan:

- Model AI: tidak dipilih di web — server memakai model bawaan
  `deepseek-v4.1-flash` (bisa diubah lewat `LARPROUTER_MODEL` di `.env`,
  atau `defaultModel` di `config.json`; model utama `claude-opus-4-7-1m`
  bisa dipakai begitu kreditnya cukup). Daftar model server tersedia lewat
  `GET /api/models` (loopback-only), tapi tidak lagi ditampilkan sebagai
  dropdown di Obrolan; pilihan model lama yang tersimpan di perangkat
  (`wd-model`) dibersihkan otomatis saat Obrolan dibuka.
- Multi-bahasa chat: dropdown "Bahasa balasan" di Obrolan — bisa "Ikuti
  bahasa UI" atau dipilih sendiri (Indonesia, Inggris, Jepang, Korea,
  Mandarin, Arab, Spanyol, Prancis, Jerman, Portugis); persona AI
  disesuaikan dengan bahasa yang dipilih, pilihan tersimpan di perangkat
  (`wd-chat-lang`).
- Kunci tidak pernah masuk repo, tidak pernah dikirim ke browser: browser hanya
  memanggil `POST /api/chat` di server lokal, kunci dibaca server dari `.env`.
  Server juga tidak pernah melayani berkas `.env` sebagai berkas statis, dan
  endpoint `/api/chat` hanya menerima koneksi dari perangkat itu sendiri.
- Tanpa `.env` (atau bila halaman dibuka sebagai situs statis tanpa server
  lokal), Bot Asisten memberi tahu cara mengaktifkannya, bukan berpura-pura
  menjawab pakai AI.

## 👥 Chat multi-user

Obrolan juga punya mode multi-user (tombol "👥 Multi-User" di atas daftar
kontak): pesan disimpan di server `rutbhics` dan terlihat semua perangkat
yang membuka server yang sama.

Cara memakai:

1. Jalankan `rutbhics` di satu perangkat (ini servernya).
2. Dari perangkat lain di jaringan yang sama, buka `http://<IP-perangkat-server>:8080`.
3. Buka Obrolan → "👥 Multi-User" — bila sudah login di halaman pertama,
   pane langsung mengenalimu tanpa login lagi; bila belum (mis. sesi habis
   atau masuk lewat akun lokal), masuk/daftar di pane ini — lalu pilih/buat
   ruang, kirim pesan. Pesan baru diambil tiap 3 detik.

Catatan jujur (tahap 1):

- Nama pengirim kini username terverifikasi lewat akun server (lihat
  Akun pengguna di bawah) — bukan lagi nama klaim bebas. Membaca ruang
  dan pesan tetap terbuka tanpa login.
- Pesan tersimpan di berkas `rutbhics-chat.json` di folder tempat `rutbhics`
  dijalankan (bertahan saat server di-restart); maksimal 20 ruang dan 500
  pesan terakhir per ruang.
- Endpoint AI (`/api/chat`, `/api/models`) tetap hanya menerima koneksi
  lokal, supaya kunci Larprouter tidak bisa dipakai perangkat lain.

## 👤 Akun pengguna (login/register)

Membaca ruang dan pesan tetap terbuka, tapi membuat ruang dan mengirim
pesan wajib login — nama pengirim selalu username terverifikasi dari
akun server, bukan lagi klaim bebas. Pintu loginnya adalah halaman pertama
(`login.html`) bila dilayani server `rutbhics`; form masuk/daftar di dalam
pane "👥 Multi-User" tetap ada sebagai cadangan (mis. sesi kedaluwarsa
atau masuk lewat akun lokal). Di hosting statis tanpa server, login
desktop tetap akun lokal per perangkat.

Metode yang tersedia:

1. **Username, email, atau HP + kata sandi.** Daftar dengan username
   (3–30 karakter), email dan HP opsional, kata sandi minimal 8
   karakter. Masuk bisa memakai username, email, atau nomor HP mana
   pun yang didaftarkan. Kata sandi disimpan sebagai hash scrypt +
   salt di berkas `rutbhics-users.json` di folder kerja (bukan hash
   browser seperti login lokal). Sesi memakai cookie httpOnly 30 hari.
   Login dibatasi 10 percobaan gagal per IP per 10 menit.
2. **Google / GitHub (OAuth).** Tombolnya muncul di pane multi-user
   hanya bila server dikonfigurasi. Caranya: buat OAuth app
   (Google Cloud Console → Credentials → OAuth client ID, atau GitHub
   Settings → Developer settings → OAuth Apps), lalu jalankan server
   dengan environment:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan/atau
     `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - Redirect URI yang didaftarkan di provider harus persis
     `<alamat-server>/api/auth/google/callback` (atau
     `/api/auth/github/callback`), misalnya
     `http://192.168.1.5:8080/api/auth/google/callback` — alamat yang
     dipakai membuka Rutbhics harus sama dengan yang didaftarkan.
     Bila perlu, paksa basisnya lewat `OAUTH_REDIRECT_BASE`
     (mis. `OAUTH_REDIRECT_BASE=http://192.168.1.5:8080 rutbhics`).
   Akun OAuth dikenali dari ID provider (bukan email), jadi email yang
   sudah dipakai akun lain tidak akan membajak akun tersebut.

Catatan jujur (tahap ini): belum ada verifikasi email, lupa kata
sandi, atau ganti kata sandi — itu tahap berikutnya bila dibutuhkan.

## 🔌 config.json multi-provider (gaya router AI)

Tanpa `config.json`, Rutbhics hanya memakai Larprouter dari `.env`
(perilaku lama, tidak berubah). Dengan `config.json`, chat bisa memakai
API Anthropic, Gemini, DeepSeek, OpenAI, Larprouter, dan provider lain
bertipe sama — seperti router AI lain.

Cara memakai:

1. Salin `config.example.json` menjadi `config.json` di folder tempat
   kamu menjalankan `rutbhics` (server memuat `config.json` dari
   folder kerja dulu, lalu folder paket; berkas ini di `.gitignore`,
   jadi tidak ikut commit — polanya sama seperti `.env`).
2. Isi kunci API-nya di `.env` (bukan di `config.json`!), sesuai nama
   variabel di field `apiKeyEnv` tiap provider (mis. `ANTHROPIC_API_KEY`).
3. Jalankan ulang `rutbhics`, buka Obrolan — chat memakai model bawaan
   server (`LARPROUTER_MODEL` / `defaultModel` provider; format
   `provider:model` di sisi server, mis. `anthropic:claude-sonnet-4-5`).

Skema `config.json`:

- `port` (opsional): port server. Prioritas port: flag `--port` >
  env `PORT` > `config.port` > `8080`.
- `providers[]`: tiap provider berisi:
  - `id`: pengenal unik (mis. `anthropic`, `deepseek`).
  - `name`: nama tampilan (opsional).
  - `type`: `openai` (kompatibel OpenAI: OpenAI, DeepSeek,
    Larprouter, dan sejenisnya), `anthropic`, atau `gemini`.
  - `baseUrl`: alamat dasar API (tanpa garis miring akhir).
  - `apiKeyEnv`: NAMA variabel env berisi kunci (mis.
    `ANTHROPIC_API_KEY`). Inilah satu-satunya cara server mendapat
    kunci — field `apiKey` di dalam `config.json` (bila ada)
    DIABAIKAN dan server mencatat peringatan saat start.
  - `models[]`: daftar model provider itu. Untuk provider `openai`
    yang `models`-nya kosong, server mengambil live dari
    `{baseUrl}/models`; untuk `anthropic`/`gemini`, daftar model
    wajib dari config.
  - `defaultModel` (opsional): model bawaan provider itu.

Perilaku:

- `GET /api/models` (tetap loopback-only) mengembalikan daftar
  gabungan `provider:model` hanya dari provider yang kuncinya ada;
  provider tanpa kunci tidak muncul. Bila tidak ada provider aktif,
  kembali ke daftar cadangan lama.
- `POST /api/chat` (tetap loopback-only): model `provider:model`
  diarahkan ke provider itu; model tanpa prefix dicari di daftar
  model semua provider aktif; bila tidak ketemu, dipakai provider
  larprouter (kompatibilitas lama). Provider ber-prefix yang tidak
  dikenal menghasilkan 400. Balasan JSON tetap `{reply, model}`.
- Provider `larprouter` bawaan tetap dibangun dari env
  (`LARPROUTER_API_KEY`, `LARPROUTER_BASE_URL`, `LARPROUTER_MODEL`);
  bila config punya provider id `larprouter`, `baseUrl`/`models`/
  `defaultModel`-nya digabungkan bila ada, kunci tetap dari env.
- Saat start, server mencatat daftar id provider yang aktif (tanpa
  nilai kunci) di log.

## 🚀 Deployment (VPS)

Jalankan server di loopback, lalu ekspos lewat reverse proxy + HTTPS.
Jangan membuka port aplikasi langsung ke internet.

**systemd** (`/etc/systemd/system/rutbhics.service`):

```ini
[Unit]
Description=Rutbhics web desktop
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/rutbhics
ExecStart=/usr/bin/node bin/rutbhics.js --host 127.0.0.1 --port 8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Lalu `systemctl daemon-reload && systemctl enable --now rutbhics`.
Berkas `.env` dibaca dari WorkingDirectory (jangan commit berkas ini).

**Nginx** (cuplikan `server` HTTPS):

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

HTTPS: `certbot --nginx -d namadomain.example` (atau DNS-01 bila perlu).
Untuk deployment publik, setel `OAUTH_REDIRECT_BASE=https://namadomain.example`
di `.env` agar callback OAuth tidak bergantung pada header Host.

**Backup** (manual, ke lokasi di luar folder aplikasi):

```sh
node scripts/backup.js                 # -> ~/rutbhics-backup/rutbhics-backup-YYYYMMDD-HHmmss/
node scripts/backup.js --dir /var/backups/rutbhics
```

Menyalin `rutbhics-users.json`, `rutbhics-chat.json`, `.env` (plus
`.bak` bila ada) dari folder kerja — atau folder paket bila tidak ada di
folder kerja — beserta `manifest.json` (daftar berkas + sumbernya).
Salinan `.env` ditulis mode 600. Direktori backup di dalam folder
aplikasi ditolak (berkasnya bisa dilayani sebagai berkas statis).
Memulihkan: salin kembali berkasnya ke folder kerja lalu restart server.
Penjadwalan otomatis (cron/systemd) tidak dipasang — pasang sendiri
bila perlu.

Berkas `.bak` di folder yang sama adalah cadangan generasi terakhir bila
berkas utama korup.

**Health & log:**

```sh
curl https://namadomain.example/health   # -> {"ok":true}
journalctl -u rutbhics -f
```

Catatan: throttle login/register memakai IP socket mentah dan TIDAK
memercayai `X-Forwarded-For` (sengaja, agar tidak bisa dipalsukan) — di
balik proxy bersama, semua pengguna berbagi satu anggaran throttle.

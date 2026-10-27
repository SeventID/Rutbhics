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
  `GET /api/models` (akses mengikuti mode AI_ACCESS di bagian Deployment:
  mode local = browser lokal tanpa login, mode login = wajib login),
  tapi tidak lagi ditampilkan sebagai
  dropdown di Obrolan; pilihan model lama yang tersimpan di perangkat
  (`wd-model`) dibersihkan otomatis saat Obrolan dibuka.
- Validasi model (allowlist): model yang diminta lewat `POST /api/chat`
  harus ada di `models[]`/`defaultModel` provider yang bersangkutan —
  model tak dikenal ditolak 400 (bukan diteruskan ke upstream sampai
  502). Provider `openai` dengan `models` kosong divalidasi terhadap
  daftar live `{baseUrl}/models` (cache 5 menit); bila daftar live
  gagal diambil, model ditolak 400.
- Multi-bahasa chat: dropdown "Bahasa balasan" di Obrolan — bisa "Ikuti
  bahasa UI" atau dipilih sendiri (Indonesia, Inggris, Jepang, Korea,
  Mandarin, Arab, Spanyol, Prancis, Jerman, Portugis); persona AI
  disesuaikan dengan bahasa yang dipilih, pilihan tersimpan di perangkat
  (`wd-chat-lang`).
- Kunci tidak pernah masuk repo, tidak pernah dikirim ke browser: browser hanya
  memanggil `POST /api/chat` di server lokal, kunci dibaca server dari `.env`.
  Server juga tidak pernah melayani berkas `.env` sebagai berkas statis, dan
  endpoint `/api/chat` menerima browser lokal tanpa login (mode local)
  atau pengguna yang sudah login (mode login) — lihat mode AI_ACCESS di
  bagian Deployment.
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
   Login dibatasi 10 percobaan gagal per IP per 10 menit, dan 10
   percobaan gagal per akun per 10 menit (S3).
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

- `GET /api/models` (akses mengikuti mode AI_ACCESS di bagian
  Deployment) mengembalikan daftar
  gabungan `provider:model` hanya dari provider yang kuncinya ada;
  provider tanpa kunci tidak muncul. Bila tidak ada provider aktif,
  kembali ke daftar cadangan lama.
- `POST /api/chat` (akses mengikuti mode AI_ACCESS di bagian
  Deployment): model `provider:model`
  diarahkan ke provider itu; model tanpa prefix dicari di daftar
  model semua provider aktif (termasuk daftar live provider `openai`
  kosong); bila tidak ketemu, ditolak 400 `model_tidak_dikenal`
  (bukan lagi dipakai provider pertama dengan string apa adanya).
  Provider ber-prefix yang tidak dikenal menghasilkan 400
  `provider_tidak_dikenal`; provider tanpa kunci menghasilkan 503.
  Balasan JSON tetap `{reply, model}`.
- Batasan nama model: `models[]`/`defaultModel` di `config.json`
  tidak boleh mengandung `:` — parsing `provider:model` memotong di
  `:` pertama, jadi model ber-`:` tidak bisa dipakai utuh. Entri
  yang melanggar ditolak saat startup dengan peringatan jelas dan
  tidak dipakai (`defaultModel` yang ditolak berarti provider itu
  memakai `models[0]`/daftar live sebagai bawaan).
- Provider `larprouter` bawaan tetap dibangun dari env
  (`LARPROUTER_API_KEY`, `LARPROUTER_BASE_URL`, `LARPROUTER_MODEL`);
  bila config punya provider id `larprouter`, `baseUrl`/`models`/
  `defaultModel`-nya digabungkan bila ada, kunci tetap dari env.
- Saat start, server mencatat daftar id provider yang aktif (tanpa
  nilai kunci) di log.

## 🚀 Deployment (VPS)

> **Akses endpoint AI (`/api/chat`, `/api/models`) — mode eksplisit S1
> (menggantikan gate loopback lama yang runtuh di balik reverse proxy,
> P0-N1).**
>
> **Prioritas konfigurasi (eksplisit):** `AI_ACCESS=local` atau
> `AI_ACCESS=login` yang disetel operator = pilihan utama, mengalahkan
> segalanya. Bila tidak disetel: host loopback → `local`; host
> non-loopback → `login`. Log startup menampilkan mode efektif
> (`AI access mode: ...`).
>
> - **Mode `local` (default pemakaian perangkat sendiri):** perilaku lama
>   PERSIS — gate socket loopback + gate Origin loopback, tanpa login.
> - **Mode `login` (wajib di balik proxy/domain publik):** alamat socket
>   TIDAK berperan. Tanpa sesi login → 401 untuk SEMUA varian Origin
>   (tanpa Origin, Origin loopback palsu, Origin domain publik, Origin
>   jahat). Ada sesi + (tanpa Origin ATAU Origin PERSIS == Host header,
>   skema+host+port) → diizinkan. Ada sesi + Origin lain (termasuk Origin
>   loopback port lain) → 403. Konsekuensi yang disengaja: browser LAN/jarak jauh dan skrip
>   WAJIB login (akun server) untuk memakai Bot AI; `GET /api/chat`
>   (status) ikut digate dengan aturan yang sama. Tidak ada flag mode
>   lain: `AI_ACCESS` sudah cukup.
>
> **CSRF exact-Origin (A2-01):** POST tulis (`/api/rooms`, `/api/auth`)
>   dan endpoint AI mode login mensyaratkan Origin PERSIS == Host header
>   (skema+host+port), atau tanpa Origin untuk klien non-browser.
>   Deployment standar (desktop dilayani server yang sama, fetch URL
>   relatif) tidak berubah; LAN via IP tidak berubah (Origin host ==
>   Host IP). Split-hosting (desktop statis dari port lain) mendapat 403
>   pada tulis — layani desktop dari server yang sama.
>
> **Pengikatan state OAuth ke browser (A2-03):** saat initiate
>   (`GET /api/auth/google|github`), server menyetel cookie pengikat
>   HttpOnly `rutbhics_oauth_bind` (SameSite=Lax, Max-Age 600 detik,
>   Path `/api/auth/`, tanpa flag Secure untuk sekarang — S5 nantinya
>   harus mencakup cookie ini juga); callback wajib membawa cookie yang
>   cocok dengan nilai yang tersimpan untuk state itu, kalau tidak 400
>   generik yang sama dengan state-tidak-valid, dan state tetap hangus
>   (sekali pakai dipertahankan). Initiate kedua menimpa cookie sehingga
>   state pertama menjadi tidak dapat dipakai — selesaikan alur terbaru.
>
> **Batas upstream (A2-06):** panggilan OAuth dibatasi timeout 15 detik
>   dan respons 256KB; respons AI dibatasi 2MB (timeout AI tetap 60
>   detik). Pelanggaran batas gagal lewat jalur yang sudah ada (OAuth
>   -> halaman gagal login; AI -> 502 `provider_gagal`), bukan hang
>   atau OOM. Provider lambat yang sah tidak terpengaruh selama di
>   bawah batas ini.
>
> **Header respons (A2-07):** semua respons `/api/*` membawa
>   `Cache-Control: no-store` (diterapkan terpusat di handler utama,
>   sehingga gerbang 401/403, halaman gagal OAuth, redirect, dan 404
>   rute API ikut tercakup; respons statis dan `/health` sengaja tidak
>   membawa no-store), dan semua respons membawa `X-Frame-Options:
>   SAMEORIGIN` (desktop tidak pernah dibingkai lintas-origin secara
>   sah). CSP tetap S12 dan tidak dikerjakan di sini.
>
> **Penyapuan map throttle/state (A2-08):** pada interval prune sesi
>   per jam yang sama, server ikut menyapu entri kedaluwarsa dari
>   `loginFails`, `loginFailsByAccount`, `registerAttempts`,
>   `oauthStates`, dan array rate pesan yang sudah kosong — memakai
>   jendela yang PERSIS sama dengan pemeriksaan malas (login 10 menit,
>   register 1 jam, state OAuth 10 menit, rate pesan 1 jam), sehingga
>   tidak ada entri dalam jendela yang terhapus. Sapuan ini hanya
>   kebersihan memori; semua keputusan blokir tetap ditegakkan
>   pemeriksaan malas, bukan oleh sapuan.
>
> **Lockfile instance-tunggal (S7):** server mengakuisisi `.rutbhics.lock`
>   di folder kerja SEBELUM memuat berkas data (dengan `wx` eksklusif).
>   Proses kedua di folder yang sama menolak start dengan pesan jelas
>   (bukan menimpa data). Lock basi (PID sudah mati, mis. sesudah crash
>   SIGKILL) dicuri dengan peringatan; lock berisi data tak dikenal
>   ditolak agar berkas asing tidak dihapus. Keluar bersih (SIGINT/SIGTERM)
>   menghapus lock; mode `--setup` melewati lock. Edge: PID usang yang
>   dipakai ulang proses tak terkait akan menolak start secara keliru
>   (jarang) — hapus lockfile manual. Multi-instance sejati tetap hanya
>   mungkin lewat Tahap 2 SQLite.
>
> **Scrypt async (S8):** hash/check/dummy scrypt kini memakai
>   `crypto.scrypt` async (threadpool libuv) — login/register tidak lagi
>   memblokir event loop ~109ms; request lain (health, chat, rooms)
>   tetap dilayani selagi hash berjalan. Parameter dan format TIDAK
>   berubah (default N16384/r8/p1, keylen 64, `scrypt:<salt>:<hash>`)
>   sehingga hash lama tetap terverifikasi dan latensi login ~100ms
>   dipertahankan; dummy A2-02 ikut async agar jalur tak-dikenal tidak
>   menjadi satu-satunya jalur yang masih memblokir loop. Pada login
>   bersamaan, scrypt mengantre di threadpool (default 4) — tertunda,
>   bukan memblokir loop.
>
> **PERINGATAN TEGAS:** `AI_ACCESS=local` yang disetel eksplisit TETAP
> BERBAHAYA bila server diekspos lewat reverse proxy/domain publik —
> kunci AI menjadi terbuka; operator yang mengekspos server WAJIB memakai
> mode `login`. Mode `local` hanya untuk pemakaian perangkat sendiri
> TANPA proxy — tidak boleh diletakkan di balik proxy atau diekspos,
> tanpa pengecualian. Mode turunan tidak dapat mendeteksi proxy:
> server `--host 127.0.0.1` yang di-proxy tetap ber-mode local.
>
> **Peringatan runtime (dua lapis, log saja — tidak mengubah akses):**
> mode `local` + `AI_ACCESS=local` eksplisit + host non-loopback →
> peringatan keras di log startup (mode tetap local sesuai pilihan
> operator). Mode `local` + request AI bertanda proxy (header
> `X-Forwarded-For`/`X-Real-IP` hadir, atau Host/Origin non-loopback)
> → peringatan keras di log SEKALI per proses bahwa tanda proxy teramati
> dan server kemungkinan sedang di-proxy; operator harus pindah ke mode
> login. **Tanda ini hanya INDIKATOR, bukan bukti:** header proxy dapat
> dipalsukan pada koneksi langsung, dan deteksi ini best-effort —
> Origin loopback PALSU lewat proxy TIDAK terdeteksi. Tanda proxy TIDAK
> PERNAH dipakai sebagai dasar memberi akses; akses hanya ditentukan
> mode + sesi. Log hanya mencatat mode + kategori (mis. "header
> tanda-proxy hadir", "Host non-loopback") — tanpa nilai header, tanpa
> cookie sesi, tanpa token, tanpa API key.
>
> Untuk deployment VPS di bawah ini (Nginx di depan `--host 127.0.0.1`),
> setel `AI_ACCESS=login` (mis. `Environment=AI_ACCESS=login` di unit
> systemd, atau di `.env` — dibaca dari WorkingDirectory).

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
  # WAJIB MENIMPA (bukan menambah): $remote_addr, bukan
  # $proxy_add_x_forwarded_for — lihat penjelasan di bawah.
  proxy_set_header X-Forwarded-For $remote_addr;
}
```

**Throttle di balik proxy (S3) — baca sebelum memakai Nginx di atas.**
Throttle login/register dihitung per IP klien. Bila server diakses lewat
proxy, IP socket yang dilihat server adalah alamat proxy itu sendiri,
sehingga tanpa penanganan semua pengguna berbagi satu anggaran throttle
(satu penyerang dapat mengunci login/registrasi semua orang). S3
memperbaikinya dengan aturan berikut:

- `TRUSTED_PROXIES` (env, default loopback saja: `127.0.0.1,::1`)
  adalah daftar alamat proxy tepercaya, dipisahkan koma, pencocokan
  persis (tanpa rentang CIDR pada tahap ini). Bila alamat socket ada di
  daftar ini DAN header `X-Forwarded-For` ada, entri pertamanya dipakai
  sebagai IP klien untuk throttle. Bila alamat socket tidak ada di daftar
  ini, `X-Forwarded-For` diabaikan total — klien langsung yang memalsukan
  header itu tidak boleh menggeser anggaran orang lain.
- **Cuplikan Nginx di atas WAJIB menimpa `X-Forwarded-For` menjadi
  `$remote_addr`.** Nilai default Nginx, `$proxy_add_x_forwarded_for`,
  justru MENAMBAH (append): klien dapat mengirim `X-Forwarded-For`
  palsu, dan entri palsu itu menjadi entri pertama yang dibaca server —
  throttle salah sasaran. Dengan menimpa menjadi `$remote_addr`,
  `X-Forwarded-For` hanya berisi satu entri: IP asli klien. Untuk proxy
  di alamat lain (bukan loopback), setel `TRUSTED_PROXIES` ke alamat
  proxy itu (mis. di unit systemd: `Environment=TRUSTED_PROXIES=10.0.0.5`,
  atau di `.env`); untuk Nginx di host yang sama, default loopback sudah
  cukup.
- Login juga dibatasi **per akun**: 10 percobaan gagal per akun per
  10 menit, di samping batas per IP. Jadi serangan terhadap satu akun
  tidak mengunci semua akun, dan satu IP tidak bisa membanjiri satu akun
  tanpa batas.
- Batas lama tidak berubah: login 10 gagal/IP/10 menit, registrasi
  5 percobaan/IP/jam — hanya saja "IP" kini berarti IP klien yang
  sudah memperhitungkan proxy tepercaya.
- Catatan batas: koneksi langsung dari loopback berbagi kelas kepercayaan
  dengan proxy loopback (keduanya tidak dapat dibedakan dari alamat
  socket saja) — host server sendiri diasumsikan tepercaya. Bila itu
  tidak dapat diterima, jalankan proxy di alamat khusus dan persempit
  `TRUSTED_PROXIES` ke alamat itu saja.

**Kuota AI + batas penyalahgunaan (S4).**

- Kuota AI per pengguna per hari: env `AI_QUOTA_PER_DAY` (default 50
  panggilan/hari/akun; `0` = tanpa batas; nilai tak valid/negatif =
  default 50). Hari = tanggal lokal server (YYYY-MM-DD), reset otomatis
  berganti hari. Yang dihitung adalah attempt: panggilan chat yang lolos
  gate S1 + allowlist S2 dan diteruskan ke provider — gagal provider
  tetap dihitung. Habis → 429 `kuota_habis` dengan pesan jelas.
  Hitungan disimpan di `rutbhics-users.json` (ikut simpan atomik) pada
  tiap increment, sehingga kuota hari berjalan bertahan saat restart.
  Hanya pengguna login yang dikenai kuota; pemakaian AI anonim mode
  local dibebaskan karena hanya mungkin dari perangkat pemilik sendiri
  (gate socket memblokir non-loopback) — kuota adalah kontrol multi-user.
- Rate limit pesan per pengguna: burst 10/menit + 100/jam, dihitung dari
  pesan yang tersimpan saja (baca tidak dibatasi). Melebihi → 429
  (`pesan_terlalu_cepat` / `batas_pesan_per_jam`). Hanya di memori;
  restart mengatur ulang window.
- Batas ruang per pengguna: 5 ruang/pengguna, di samping cap global 20
  yang tidak berubah. Dihitung dari `createdBy` (username pembuat);
  ruang lama tanpa `createdBy` (mis. ruang `umum`) tidak dihitung ke
  siapa pun. Ruang ke-6 → 429 `batas_ruang_per_pengguna` dengan pesan
  jelas. Semua ruang baru (publik maupun privat) menyimpan `createdBy`.

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
folder kerja — beserta `manifest.json` (daftar berkas cadangan, hanya basename — A2-12).
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

Catatan: throttle login/register memakai IP klien yang sudah
memperhitungkan proxy tepercaya (S3): `X-Forwarded-For` hanya dipercaya
bila koneksi datang dari alamat di `TRUSTED_PROXIES` (default loopback
saja); dari alamat lain header itu diabaikan total. Lihat penjelasan
"Throttle di balik proxy (S3)" di bawah cuplikan Nginx di atas.

## 🧪 Pengujian

Rangkaian regresi repo (S11, zero-dependency, Node saja) dijalankan dengan:

```sh
npm test
```

Isi rantai: `node --check` atas semua JS (server, klien, skrip, tes) +
`smoke.js` + rangkaian server + rangkaian klien + pemeriksaan skrip
inline HTML + uji negatif. Semua tes memakai nilai dummy dan mematikan
server/relay-nya sendiri; tidak ada kunci, token, atau data pengguna asli
di berkas tes.

| Berkas | Cakupan |
| --- | --- |
| `scripts/smoke.js` | Dasar: `/`, header keamanan, berkas data statis 404, rooms, login `identifier` (benar 200 / salah 401 / tak dikenal 401), chat tanpa kunci 502/503, models, health |
| `scripts/test-s1.js` | Gate AI S1: mode local/login, matriks 7 baris untuk chat POST + GET status + models, Origin palsu via relay TCP Node, validasi sesi (sampah, logout, logout-all, kedaluwarsa), cakupan rute, mode turunan/eksplisit, peringatan proxy |
| `scripts/test-s2.js` | Allowlist S2: provider/model dikenal & fiktif, live-list + cache 5 menit, nama model ber-`:` di config, urutan gate-lalu-allowlist |
| `scripts/test-s3.js` | Throttle S3: hitungan persis login/register, XFF tepercaya vs tak tepercaya, throttle per-akun, `TRUSTED_PROXIES` kustom |
| `scripts/test-s4.js` | Kuota S4: habis -> 429 + persistensi restart + ganti hari, pengecualian anonim local, env `0`/bogus/negatif, burst pesan 10/menit, batas ruang 5/pengguna + cap global 20 |
| `scripts/test-client-p2.js` | DOM sim P2: logout desktop (L7), sandbox iframe, cap chat 200, banner gagal simpan |
| `scripts/test-client-p3.js` | DOM sim P3: autosave + pencarian Catatan, resize jendela |
| `scripts/test-client-rooms.js` | DOM sim ruang privat: opsi + gembok, baris tambah anggota, dropdown visibilitas, hint 403 |
| `scripts/test-backup.js` | Skrip backup: salinan byte-identik, manifest, mode `.env` 600, penolakan direktori di dalam folder aplikasi |
| `scripts/check-inline-html.js` | Ekstrak blok `<script>` inline dari `index.html`/`login.html` lalu `node --check` masing-masing |
| `scripts/test-negative-gate.js` | Uji negatif: melonggarkan gate S1 di salinan staging, rangkaian test-s1 HARUS gagal pada tes kunci Origin PALSU |
| `scripts/test-harness.js` | Utilitas bersama tes server (bukan tes sendiri): tree temp, server, relay TCP Node murni, register/login |

Menjalankan satu berkas saja: `node scripts/test-s1.js` (dan seterusnya).
Variasi mode logout desktop: `L7MODE=fetch node scripts/test-client-p2.js`
atau `L7MODE=none ...` (default beacon; ketiganya dijalankan `npm test`).
Relay socat pada skrip staging lama diganti relay TCP Node murni di
`test-harness.js`, jadi CI tidak butuh instalasi apt.

**Lokasi rangkaian:** rangkaian tinggal di `scripts/` (bukan `tests/`)
karena field `files` di `package.json` sudah mencakup `scripts/` — jadi
rangkaian ikut terkirim dalam paket npm dan `npm test` tetap lolos dari
paket terinstal, bukan hanya dari repo.

**Ambang sustained 100/jam (sisa yang diketahui):** ambang burst
10/menit dites live, dan kedua ambang dievaluasi `msgRateCheck` yang
sama pada setiap pesan tersimpan, tetapi ambang 100/jam yang sustained
TIDAK dites live dalam rantai cepat (butuh ~10 menit jeda burst).
Tes manualnya tersedia terpisah — JANGAN dimasukkan ke `npm test`:

```sh
node scripts/test-s4-sustained-manual.js   # ~10 menit: 100 pesan -> 200, pesan ke-101 -> 429 batas_pesan_per_jam
```

**Yang TIDAK dicakup rangkaian ini:** render browser sungguhan
(DOM sim memakai stub, bukan browser), alur OAuth end-to-end (butuh
aplikasi OAuth asli), uji beban/konkurensi, dan tes sustained 100/jam
di atas (manual). Usulan (belum diimplementasikan, butuh persetujuan):
seam injeksi untuk jendela rate-limit (mis. env khusus tes) agar ambang
jam bisa dites cepat tanpa mengubah perilaku produksi.

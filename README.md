# Rutbhics

Desktop komputer di dalam browser: window manager, taskbar, menu Start, dan
aplikasi yang berjalan langsung di halaman web — tanpa build step, tanpa
framework, murni HTML + CSS + JavaScript vanilla (seefisien mungkin).

## Cara menjalankan

Buka `index.html` langsung di browser, atau dari terminal:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

## Install lewat npm

```bash
npm install -g rutbhics
rutbhics
# lalu buka http://localhost:8080
```

Port bisa diubah: `rutbhics --port 3000` atau `PORT=3000 rutbhics`.
Tanpa install permanen: `npx rutbhics`.

Saat install interaktif, installer bertanya: "Apakah Anda punya API
Larprouter? (y/n)". Jawab `y` lalu masukkan kunci (ketikan disembunyikan)
maka AI di Obrolan langsung aktif; jawab selain `y` maka install lanjut
tanpa AI. Instalasi non-interaktif (CI, skrip) dilewati otomatis tanpa
menghentikan install. Catatan: kunci dari installer tersimpan di `.env`
folder paket — saat package di-update, folder itu diganti dan kunci bisa
hilang. Untuk salinan permanen, jalankan `rutbhics --setup` dari folder
kerjamu (kunci tersimpan di `.env` folder itu, yang selalu dimenangkan
server atas `.env` folder paket).

## Login & penggunaan sebagai server

Rutbhics bisa dijalankan sebagai server web statis (mis. `python3 -m http.server`,
Nginx, atau hosting statis apa pun) — tidak butuh backend.

- Buka halaman utama: pengunjung diarahkan ke `login.html`.
- Kunjungan pertama: buat akun perangkat (nama pengguna + kata sandi).
  Akun tersimpan lokal di perangkat itu (kata sandi di-hash SHA-256 bila
  konteks aman, fallback hash sederhana bila tidak).
- Setelah masuk, desktop terkunci di balik sesi tab itu; keluar lewat
  tombol **Keluar** di menu Start.
- Catatan jujur: kunci ini hanya pengaman demo sisi klien, bukan
  autentikasi server sungguhan. Untuk akun multi-pengguna yang aman,
  diperlukan backend (mis. Node + database + sesi) di tahap berikutnya.

## Aplikasi v1

- **Obrolan** — aplikasi chatting gaya WhatsApp (daftar kontak, kirim pesan,
  balasan otomatis). Riwayat tersimpan di `localStorage` perangkat.
- **Peramban** — mini browser berbasis iframe + kolom alamat + tautan cepat.
  Catatan: banyak situs besar memblokir tampil di iframe (X-Frame-Options).
- **Catatan** — catatan teks tersimpan di `localStorage`.
- **Kalkulator** — operasi dasar tanpa `eval`.
- **Files** — penjelajah berkas virtual (folder, berkas teks, edit, hapus),
  tersimpan di `localStorage`.
- **Pengaturan** — ganti wallpaper (4 pilihan) dan tema terang/gelap,
  tersimpan di `localStorage` dan diterapkan saat desktop dibuka lagi.
- **Musik** — player audio & video mini: putar/jeda, trek sebelum/
  sesudah, geser posisi, volume, daftar putar. Trek demo dari URL publik
  (butuh internet); trek tambahan (URL audio/video apa pun) bisa
  ditambahkan dan tersimpan di `localStorage`.

## Notifikasi & pusat kontrol (taskbar)

- Tombol lonceng 🔔 di taskbar dengan badge jumlah notifikasi belum dibaca.
- Panel notifikasi: daftar notifikasi (waktu WIB), hapus semua, dan
  otomatis tandai sudah dibaca saat panel dibuka. Notifikasi tersimpan di
  `localStorage`, maksimal 30 terbaru.
- Pusat kontrol di panel yang sama: ganti tema terang/gelap (tersambung ke
  Pengaturan lewat `localStorage`), mode Jangan Ganggu (mematikan toast
  pop-up), tombol buka Pengaturan, dan tombol kirim notifikasi tes.
- Toast pop-up muncul tiap notifikasi baru (kecuali mode Jangan Ganggu
  aktif), hilang sendiri setelah 4 detik atau saat diklik.

## Peta jalan (roadmap)

Urutan pembangunan berikutnya (satu item per jadwal build):

1. Aplikasi Files (penjelajah berkas virtual + localStorage) — selesai 26 Okt 2026
2. Aplikasi Pengaturan (ganti wallpaper, tema terang/gelap) — selesai 26 Okt 2026
3. Notifikasi & pusat kontrol di taskbar — selesai 26 Okt 2026
4. Musik/video player mini — selesai 26 Okt 2026
5. Terminal web (perintah semu: help, about, echo, date) — selesai 26 Okt 2026
11. Bot AI di Obrolan (Larprouter via proxy lokal + .env) — selesai 26 Okt 2026 (dimajukan atas permintaan langsung)
12. Chat multi-user beneran (backend server: akun + pesan real-time) — berikutnya, belum dikerjakan
6. Mode jendela maximize + snap kiri/kanan
7. Aplikasi Gambar (kanvas coret-coret + simpan)
8. Widget jam/kalender di desktop
9. Mode multi-bahasa (Indonesia/Inggris)
10. Halaman login/pengguna + profil — selesai 26 Okt 2026 (dimajukan atas permintaan langsung)

> Nama proyek: **Rutbhics** (dipilih Kang Mas, 26 Okt 2026).

## Struktur

```
index.html        — shell: wallpaper, ikon desktop, taskbar, menu Start, panel notifikasi & pusat kontrol
login.html        — halaman login (akun lokal perangkat) + kunci desktop
css/style.css     — seluruh tampilan desktop & aplikasi
js/desktop.js     — window manager (drag, minimize, focus, taskbar, jam WIB, terapkan pengaturan tersimpan, notifikasi & pusat kontrol)
js/apps.js        — aplikasi bawaan (obrolan, peramban, catatan, kalkulator, files, pengaturan, musik)
package.json      — metadata package npm + perintah `rutbhics`
bin/rutbhics.js   — server lokal (tanpa dependensi) untuk perintah `rutbhics`, termasuk proxy Bot AI (/api/chat)
.env.example      — contoh konfigurasi lokal Bot AI (kunci API, base URL, model; tanpa nilai asli)
.gitignore        — menjaga .env tidak masuk repo
```

## Bot AI (Larprouter)

Semua kontak di aplikasi Obrolan (Teman, Grup Keluarga, Bot Asisten) menjawab
memakai AI Larprouter (OpenAI-compatible), bukan lagi balasan demo acak —
masing-masing dengan persona-nya sendiri (teman akrab, anggota keluarga,
asisten). Catatan jujur: mereka tetap persona AI, bukan orang sungguhan;
chat antar pengguna beneran butuh backend server (tahap berikutnya).

Cara mengaktifkan:

1. Salin `.env.example` menjadi `.env` di folder tempat kamu menjalankan `rutbhics`.
2. Isi `LARPROUTER_API_KEY` dengan kunci Larprouter-mu.
3. Jalankan ulang `rutbhics`, buka Obrolan, pilih kontak mana pun.

Catatan:

- Multi-model: daftar model diambil live dari Larprouter lewat
  `GET /api/models` (daftar cadangan bila gagal); di Obrolan ada dropdown
  model di atas kolom tulis — pilihan tersimpan di perangkat (`wd-model`)
  dan dikirim sebagai field `model` di `POST /api/chat`. Model bawaan server
  tetap `deepseek-v4.1-flash` (bisa diubah lewat `LARPROUTER_MODEL` di `.env`;
  model utama `claude-opus-4-7-1m` bisa dipilih begitu kreditnya cukup).
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
- Chat multi-user beneran (antar pengguna lewat server) belum ada — itu tahap
  berikutnya dan butuh backend terpisah.


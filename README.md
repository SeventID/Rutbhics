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

## Peta jalan (roadmap)

Urutan pembangunan berikutnya (satu item per jadwal build):

1. Aplikasi Files (penjelajah berkas virtual + localStorage) — selesai 26 Okt 2026
2. Aplikasi Pengaturan (ganti wallpaper, tema terang/gelap) — selesai 26 Okt 2026
3. Notifikasi & pusat kontrol di taskbar
4. Musik/video player mini
5. Terminal web (perintah semu: help, about, echo, date)
6. Mode jendela maximize + snap kiri/kanan
7. Aplikasi Gambar (kanvas coret-coret + simpan)
8. Widget jam/kalender di desktop
9. Mode multi-bahasa (Indonesia/Inggris)
10. Halaman login/pengguna + profil — selesai 26 Okt 2026 (dimajukan atas permintaan langsung)

> Nama proyek: **Rutbhics** (dipilih Kang Mas, 26 Okt 2026).

## Struktur

```
index.html        — shell: wallpaper, ikon desktop, taskbar, menu Start
login.html        — halaman login (akun lokal perangkat) + kunci desktop
css/style.css     — seluruh tampilan desktop & aplikasi
js/desktop.js     — window manager (drag, minimize, focus, taskbar, jam WIB, terapkan pengaturan tersimpan)
js/apps.js        — aplikasi bawaan (obrolan, peramban, catatan, kalkulator, files, pengaturan)
```

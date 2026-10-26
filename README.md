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

## Aplikasi v1

- **Obrolan** — aplikasi chatting gaya WhatsApp (daftar kontak, kirim pesan,
  balasan otomatis). Riwayat tersimpan di `localStorage` perangkat.
- **Peramban** — mini browser berbasis iframe + kolom alamat + tautan cepat.
  Catatan: banyak situs besar memblokir tampil di iframe (X-Frame-Options).
- **Catatan** — catatan teks tersimpan di `localStorage`.
- **Kalkulator** — operasi dasar tanpa `eval`.

## Peta jalan (roadmap)

Urutan pembangunan berikutnya (satu item per jadwal build):

1. Aplikasi Files (penjelajah berkas virtual + localStorage)
2. Aplikasi Pengaturan (ganti wallpaper, tema terang/gelap)
3. Notifikasi & pusat kontrol di taskbar
4. Musik/video player mini
5. Terminal web (perintah semu: help, about, echo, date)
6. Mode jendela maximize + snap kiri/kanan
7. Aplikasi Gambar (kanvas coret-coret + simpan)
8. Widget jam/kalender di desktop
9. Mode multi-bahasa (Indonesia/Inggris)
10. Halaman login/pengguna + profil

> Nama proyek: **Rutbhics** (dipilih Kang Mas, 26 Okt 2026).

## Struktur

```
index.html        — shell: wallpaper, ikon desktop, taskbar, menu Start
css/style.css     — seluruh tampilan desktop & aplikasi
js/desktop.js     — window manager (drag, minimize, focus, taskbar, jam WIB)
js/apps.js        — aplikasi bawaan (obrolan, peramban, catatan, kalkulator)
```

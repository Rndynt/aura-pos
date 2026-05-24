# AuraPoS — Panduan Printer

## Printer yang Didukung

| Tipe | Koneksi | Catatan |
|------|---------|---------|
| **Printer Bluetooth BLE** | Bluetooth | Rekomendasi: Epson TM-P20II, Xprinter XP-P303A, Goojprt PT-210 |
| **Print via Browser** | Tanpa perangkat | Fallback ke dialog print browser |
| **Printer LAN/Network** | Jaringan lokal | Fitur lanjutan (coming soon) |

---

## Cara Menghubungkan Printer Bluetooth

### Persyaratan
- Browser **Chrome** atau **Edge** di Android/Windows/macOS/ChromeOS.
- Bluetooth aktif di perangkat.
- Printer dinyalakan dan dalam mode pairing.

### Langkah Pairing

1. Buka AuraPoS → menu → **Printers** (atau `/printers`).
2. Klik tombol **"Hubungkan Printer Bluetooth"**.
3. Browser akan menampilkan daftar perangkat Bluetooth di sekitar.
4. Pilih printer Anda dari daftar (biasanya bernama "PT-210", "MPT-II", atau sesuai merek).
5. Klik **"Pasangkan"**.
6. Printer siap digunakan.

### Jika Printer Tidak Muncul di Daftar

- Pastikan Bluetooth aktif di perangkat.
- Pastikan printer dalam mode pairing (lampu berkedip).
- Coba matikan dan nyalakan printer.
- Pastikan tidak ada perangkat lain yang sudah terhubung ke printer.
- Di Android: buka **Pengaturan → Bluetooth → Lupakan Perangkat** untuk printer ini, lalu coba pairing ulang.

---

## Cara Mencetak Struk

Struk otomatis dicetak setelah pembayaran berhasil. Jika printer mati atau terjadi error saat itu, struk masuk ke **Print Queue**.

### Cetak Ulang Struk

1. Buka **Local Orders** → cari transaksi yang ingin dicetak ulang.
2. Klik tombol **"Cetak Ulang"**.
3. Pastikan printer terhubung sebelum mencetak.

### Mencetak Tiket Dapur

Tiket dapur dicetak otomatis setelah order dikonfirmasi. Jika gagal, tiket tetap tersimpan di Print Queue dan bisa dicetak ulang.

---

## Format Struk

Struk AuraPoS menggunakan format ESC/POS yang kompatibel dengan sebagian besar printer thermal 58mm dan 80mm. Struk berisi:

- Nama dan alamat toko
- Nomor transaksi
- Tanggal dan waktu
- Daftar item beserta harga
- Total, pajak, dan biaya layanan
- Metode pembayaran
- Kembalian (jika tunai)
- Catatan (jika ada)

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Printer tidak terhubung | Matikan/nyalakan Bluetooth, coba hubungkan ulang |
| Struk tidak keluar | Pastikan kertas thermal terpasang dengan benar |
| Tulisan struk samar | Kertas mungkin terbalik; balik gulungan kertas |
| Printer putus tiba-tiba | Printer akan dicoba reconnect otomatis saat cetak berikutnya |
| Browser tidak support | Gunakan Chrome atau Edge versi terbaru |

---

## Catatan Penting

- Koneksi Bluetooth ke printer **tidak memerlukan internet** — struk tetap bisa dicetak saat offline.
- Jika berganti browser atau perangkat, Anda perlu melakukan pairing ulang.
- Web Bluetooth tidak tersedia di Firefox atau Safari.

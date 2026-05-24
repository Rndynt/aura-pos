# AuraPoS — Panduan Mode Offline

## Apa itu Mode Offline?

AuraPoS dirancang untuk tetap berfungsi meskipun koneksi internet terputus. Kasir tetap dapat membuat transaksi, dan data akan disinkronkan otomatis saat internet kembali.

---

## Cara Menginstal AuraPoS sebagai Aplikasi (PWA)

1. Buka browser (Chrome atau Edge) di tablet/HP/laptop kasir.
2. Kunjungi URL AuraPoS Anda (contoh: `https://app.aurapos.my.id/pos`).
3. Di Chrome: klik ikon **"Instal"** di pojok kanan atas address bar, atau klik menu ⋮ → **"Instal AuraPoS Terminal"**.
4. Di Edge: klik menu ⋯ → **"Aplikasi"** → **"Instal situs ini sebagai aplikasi"**.
5. Aplikasi akan muncul di layar utama / taskbar seperti aplikasi biasa.
6. Setelah terinstal, AuraPoS bisa dibuka **tanpa browser** dan **tanpa internet**.

---

## Indikator Status Koneksi

Di bagian atas layar, ada indikator status yang menunjukkan kondisi koneksi:

| Indikator | Warna | Artinya |
|-----------|-------|---------|
| **Online** | Hijau | Koneksi normal, transaksi langsung masuk server |
| **Syncing (N)** | Kuning | Sedang menyinkronkan N transaksi offline |
| **Offline** | Abu-abu | Tidak ada internet — transaksi disimpan lokal |
| **Need Review** | Merah | Ada transaksi yang perlu perhatian (lihat bagian Konflik) |

---

## Transaksi Saat Offline

Saat offline, kasir **tetap bisa**:
- Membuka halaman `/pos`
- Melihat produk dan kategori (dari cache terakhir)
- Membuat order baru
- Menerima pembayaran (tunai, kartu, e-wallet)
- Mencetak struk ke printer Bluetooth

Transaksi offline disimpan di perangkat dengan nomor sementara, contoh:
```
OFF-ABC123-20260524-0001
```

Nomor ini bisa digunakan sebagai referensi sementara untuk kasir.

---

## Setelah Internet Kembali

1. Indikator berubah dari **Offline** ke **Syncing**.
2. Semua transaksi offline dikirim ke server secara otomatis.
3. Nomor transaksi berubah ke nomor resmi dari server (contoh: `ORD-2026-0142`).
4. Indikator berubah ke **Online** (hijau) jika semua berhasil.

Anda juga bisa **memaksa sinkronisasi manual** dengan mengklik widget **SyncStatus** di header.

---

## Melihat Transaksi Offline

1. Buka menu → **Local Orders** (atau kunjungi `/local-orders`).
2. Di sini Anda bisa melihat semua transaksi offline beserta statusnya:
   - **Pending** — menunggu sinkronisasi
   - **Synced** — sudah berhasil masuk server
   - **Failed** — gagal, perlu dicoba ulang
   - **Conflict** — ada konflik, perlu ditinjau

---

## Batasan Mode Offline

- Data produk diperbarui dari server saat online. Jika terlalu lama offline, produk baru atau perubahan harga mungkin belum tersedia.
- Banner **"Data mungkin sudah lama"** akan muncul jika cache produk berusia lebih dari 6 jam.
- Maksimal 100 transaksi bisa disimpan lokal sebelum memerlukan sinkronisasi.

---

## Tips untuk Kasir

- **Jangan tutup aplikasi** saat ada transaksi pending — biarkan sinkronisasi selesai dulu.
- Jika struk tidak tercetak, gunakan tombol **Cetak Ulang** di detail transaksi.
- Jika ada masalah sinkronisasi, hubungi pemilik toko atau lihat panduan **SYNC_ERROR_GUIDE.md**.

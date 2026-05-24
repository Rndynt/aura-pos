# AuraPoS — Panduan Mengatasi Error Sinkronisasi

## Mengapa Sinkronisasi Bisa Gagal?

Sinkronisasi bisa gagal karena beberapa alasan:

1. **Koneksi internet terputus** selama proses sinkronisasi.
2. **Perubahan data di server** saat perangkat sedang offline (harga berubah, produk dihapus, dll).
3. **Server down** atau sedang maintenance.
4. **Error validasi** — data transaksi tidak valid di server.

AuraPoS **tidak akan menghapus transaksi** yang gagal sinkron. Semua transaksi disimpan aman di perangkat sampai berhasil masuk server.

---

## Melihat Status Sinkronisasi

### Widget Sync di Header
Widget di pojok kanan atas menampilkan:
- **P:0** = Pending (menunggu sync)
- **F:0** = Failed (gagal)
- **C:0** = Conflict (konflik)

Klik widget ini untuk memulai sync manual.

### Halaman Local Orders
Buka menu → **Local Orders** untuk melihat semua transaksi dan statusnya.

### Halaman Sync Conflicts
Buka menu → **Sync Conflicts** untuk melihat detail konflik yang memerlukan perhatian.

---

## Jenis Error dan Cara Mengatasinya

### 1. Pending (Menunggu Sync)
**Tanda:** P:N di widget (N > 0)
**Artinya:** Transaksi belum dikirim ke server karena offline atau sedang antri.
**Solusi:** Tunggu atau klik widget untuk sync manual saat internet tersedia.

---

### 2. Failed (Gagal)
**Tanda:** F:N di widget berwarna merah
**Artinya:** Transaksi sudah dicoba beberapa kali tapi gagal.
**Solusi:**
1. Pastikan internet terhubung.
2. Klik widget → sync akan dicoba ulang secara otomatis.
3. Jika terus gagal setelah 8 kali percobaan, hubungi admin.

---

### 3. Conflict (Konflik)
**Tanda:** C:N di widget berwarna merah
**Artinya:** Ada ketidakcocokan antara data offline dan kondisi server.

#### Jenis Konflik

| Konflik | Artinya | Apa yang Terjadi |
|---------|---------|-----------------|
| **Harga Berubah** | Harga produk berubah saat offline | Order tetap diterima, tercatat sebagai audit |
| **Stok Tidak Cukup** | Stok habis saat order disinkronkan | Order diterima tapi dicatat, cek stok manual |
| **Produk Tidak Aktif** | Produk sudah dinonaktifkan | Order ditolak, perlu review admin |
| **Produk Tidak Ditemukan** | Produk sudah dihapus | Order ditolak, perlu review admin |
| **Order Duplikat** | Order sudah pernah masuk | Diterima sebagai replay (aman) |
| **Pembayaran Duplikat** | Pembayaran sudah tercatat | Diterima sebagai replay (aman) |
| **Fitur Dinonaktifkan** | Fitur toko dimatikan saat offline | Order ditolak, hubungi pemilik |
| **Meja Tidak Tersedia** | Meja sudah dipakai terminal lain | Review dan sesuaikan manual |

#### Cara Menyelesaikan Konflik

**Untuk Owner/Manager:**
1. Buka menu → **Sync Conflicts**.
2. Periksa setiap konflik.
3. Klik **"Resolved"** jika sudah diselesaikan secara manual.
4. Klik **"Ignored"** jika konflik bisa diabaikan.

---

## Apa yang Tidak Boleh Dilakukan

- **Jangan hapus data browser** (clear cache, clear site data) jika masih ada transaksi pending — transaksi akan hilang.
- **Jangan ganti akun** sebelum sinkronisasi selesai.
- **Jangan tutup aplikasi** paksa saat indikator menunjukkan "Syncing".

---

## Ketika Butuh Bantuan

Jika sinkronisasi terus gagal setelah mencoba langkah di atas:

1. Catat **nomor transaksi offline** (format: OFF-...).
2. Screenshot halaman Local Orders atau Sync Conflicts.
3. Hubungi admin atau dukungan teknis dengan informasi tersebut.

Transaksi **tidak akan hilang** — data aman di perangkat sampai berhasil disinkronkan.

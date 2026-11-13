# DMC FLOW — Web Kasir Kantin Sekolah

**DMC FLOW** adalah aplikasi web operasional kantin sekolah. **D-PAY** adalah dompet saldo digital untuk akun siswa dan guru. QR digunakan sebagai identitas akun; saldo tetap di PostgreSQL dan pembayaran D-PAY membutuhkan PIN transaksi.

## Stack dan arsitektur

- **Frontend:** Vue 3, TypeScript, Vite, CSS responsif; struktur komponen mengikuti Atomic Design (`components/atoms`, `molecules`, `organisms`).
- **Backend:** Express + TypeScript REST API, validasi Zod, JWT, bcrypt, RBAC dan audit log.
- **Database:** PostgreSQL. Konfigurasi menargetkan database existing `lms_fishal` dengan schema terisolasi `dpay`; schema/tabel LMS di `public` tidak perlu dihapus atau diubah.
- **Backend architecture:** domain/application/use-cases/infrastructure/HTTP, validasi server-side dan akses ditolak secara default.

## Fitur

- Kasir menerima **scan SKU** melalui barcode scanner yang bertindak sebagai keyboard atau mengetik SKU secara manual. Tekan Enter untuk menambahkan produk.
- Metode pembayaran **Tunai** atau **QR D-PAY**. Tunai menyimpan nominal uang diterima dan kembalian serta tidak memotong saldo. D-PAY memindai QR siswa/guru, memvalidasi PIN, saldo, status, harga dan stok lalu memotong wallet.
- **Shift kasir:** kasir wajib membuka shift sebelum transaksi. Modal awal default **Rp500.000** (dapat diubah saat membuka shift). Akun kasir dan waktu pembukaan dicatat otomatis. Kas yang diharapkan, kas fisik akhir, selisih, serta catatan penutupan tersimpan. Admin dapat melihat shift dan menutup shift terbuka dengan izin khusus.
- Akun siswa/guru, QR unik yang bisa dirotasi/dicabut, saldo wallet dan mutasi.
- CRUD produk, SKU unik, harga, kategori, stok; perubahan stok setelah produk dibuat melalui stok opname.
- Top-up, riwayat transaksi, laporan harian/mingguan/bulanan, pengeluaran, ekspor CSV, role/permission custom, audit log.
- Checkout mengunci saldo/stok dan mencatat penjualan, item, debit wallet/ledger (untuk D-PAY), serta stok dalam satu transaksi database. Kunci idempotensi membantu menghindari pemrosesan ganda ketika request yang sama diulang.

## 1. Prasyarat

- Node.js 20+ dan npm.
- PostgreSQL berjalan; user DB harus diizinkan membuat schema di database `lms_fishal`.
- Kamera HP kasir. Akses kamera dari perangkat lain memerlukan HTTPS pada browser modern.

## 2. Setup database existing

Ekstrak ZIP, lalu dari folder proyek jalankan:

```bash
bash scripts/setup-local.sh
```

Script meminta host, port, user, nama database, dan password PostgreSQL secara interaktif. Default host/user/database adalah `127.0.0.1`, `fishal`, dan `lms_fishal`. Password dibaca secara tersembunyi, di-URL-encode, tidak dicetak ke terminal, dan `.env` diberi permission `600`. JWT secret dibuat acak. Rahasia tidak dibundel dalam ZIP.

Script tidak membuat atau menghapus database, dan tidak mengubah `public.users`. Semua tabel DMC FLOW dibuat dalam schema `dpay`.

## 3. Jalankan lokal

Terminal 1 — backend:

```bash
cd backend
npm install
npm run db:init
npm run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5173`. Backend API berjalan di `http://localhost:8000/api`; health check di `http://localhost:8000/api/health`. Di lokal Vite meneruskan `/api` ke backend.

## 4. Akun demo (development only)

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@dpay.local` | `SuperAdmin123!` |
| Admin | `admin@dpay.local` | `Admin123!` |
| Kasir | `kasir@dpay.local` | `Kasir123!` |
| Pelanggan siswa | `siswa@dpay.local` | `Siswa123!` |
| Pelanggan guru | `guru@dpay.local` | `Guru123!` |

PIN demo siswa/guru: `4321`. `npm run db:init` mengatur ulang password akun demo; jangan jalankan seed pada sistem produksi yang sudah berisi akun sungguhan. Ganti/hapus akun demo sebelum penggunaan sekolah.

## 5. Alur shift dan pembayaran

1. Kasir login dan membuka menu **Kasir & pembayaran**.
2. Jika belum punya shift aktif, kasir mengisi modal awal (default Rp500.000) dan membuka shift. User ID dan timestamp pembuka dicatat otomatis oleh server.
3. Kasir memindai barcode SKU atau mengetik SKU secara manual lalu menekan Enter. Pemindaian SKU yang sama berulang menambah jumlah.
4. Pilih metode:
   - **Tunai:** masukkan jumlah uang yang diterima; aplikasi menghitung kembalian. Saldo D-PAY pelanggan tidak berubah.
   - **QR D-PAY:** pindai QR akun lewat kamera atau masukkan token QR, verifikasi nama/saldo, lalu pemilik akun memasukkan PIN. Server memvalidasi ulang identitas, status, PIN, harga, stok dan saldo.
5. Transaksi berhasil mencatat struk dan mengurangi stok. Untuk D-PAY, saldo dan ledger juga berubah dalam transaksi database yang sama.
6. Saat tutup shift, kasir memasukkan jumlah uang tunai fisik. Kas yang diharapkan dihitung dari modal awal + penjualan tunai − pengeluaran yang tertaut ke shift; selisih disimpan. Admin dengan izin `shifts.manage` bisa menutup shift terbuka dengan alasan yang diaudit.

## 6. Hosting dan Cloudflare Tunnel (`cloudflared`)

**Cloudflare Tunnel tidak menonaktifkan kebijakan CORS browser.** CORS ditentukan oleh origin yang dilihat browser, sehingga jika frontend dan API beda origin, API harus mengizinkan origin frontend yang tepat.

### Rekomendasi: satu origin untuk frontend dan API

Gunakan `VITE_API_BASE_URL=/api`. Atur reverse proxy/tunnel sehingga `https://kantin.domain-sekolah.sch.id/api/*` diteruskan ke Express port `8000`, sedangkan path lainnya dilayani oleh web server frontend. Dengan request `/api` relatif, browser melihat satu origin sehingga CORS browser tidak diperlukan untuk request tersebut.

Contoh ingress untuk demo lokal satu hostname:

```yaml
ingress:
  - hostname: kantin.domain-sekolah.sch.id
    path: /api/.*
    service: http://127.0.0.1:8000
  - hostname: kantin.domain-sekolah.sch.id
    service: http://127.0.0.1:4173
  - service: http_status:404
```

Pada contoh, port `4173` harus menjalankan frontend build/preview atau web server yang melayani hasil build. Untuk production, gunakan web server statis/proxy yang dikonfigurasi dengan benar; jangan gunakan server development Vite sebagai server publik jangka panjang. Jangan mengekspos PostgreSQL melalui tunnel publik. Simpan credential tunnel di mesin server, bukan dalam Git/ZIP.

### Jika frontend dan API berbeda hostname

Contoh frontend `https://kantin.example.sch.id` dan API `https://api-kantin.example.sch.id`. Bangun frontend dengan `VITE_API_BASE_URL=https://api-kantin.example.sch.id/api`, lalu pada `backend/.env` isi `FRONTEND_URL=https://kantin.example.sch.id` menggunakan origin frontend persis, tanpa path dan tanpa wildcard. Beberapa origin tepercaya dipisahkan dengan koma.

CORS production hanya menerima origin yang tercantum pada `FRONTEND_URL`; localhost hanya dilonggarkan saat `NODE_ENV` bukan `production`. Setelah mengubah environment atau API URL, restart backend dan build ulang frontend.

## 7. Pemeriksaan

Backend dari folder `backend/`:

```bash
npm run typecheck
npm test
npm run build
```

Frontend dari folder `frontend/`:

```bash
npm run typecheck
npm run build
```

## 8. Catatan sebelum pilot sekolah

Ini adalah MVP/starter. Sebelum transaksi riil, lakukan uji integrasi PostgreSQL, review keamanan, backup/restore, HTTPS, audit, pemulihan PIN, refund/void, batas dan verifikasi top-up, kebijakan privasi data siswa, rekonsiliasi kas, serta prosedur operasional penutupan shift. Akun demo hanya untuk development. Pendaftaran akun siswa/guru harus diselaraskan dengan proses verifikasi data resmi sekolah.

## 9. Perbaikan menu akun, QR, dan top-up

Versi 1.0.1 memperbaiki handler aksi yang sebelumnya belum didefinisikan di halaman **Akun & QR siswa/guru**. Tombol top-up sekarang mengirim request ke API, memperbarui saldo dan menyegarkan daftar setelah backend mengonfirmasi transaksi. Rotasi/cabut QR, perubahan status akun, dan perubahan role juga memiliki handler serta penanganan error. Role khusus dapat ditetapkan melalui endpoint perubahan role jika role tersebut sudah ada dan pengguna memiliki izin yang diperlukan.

Pemeriksaan sederhana untuk mencegah handler/endpoint utama terhapus secara tidak sengaja dapat dijalankan dari root proyek:

```bash
node scripts/check-account-actions.mjs
```

Petunjuk pengujian manual ada pada `docs/BUGFIX_ACCOUNT_QR_TOPUP.md`.


## Troubleshooting: akses HP dalam Wi-Fi yang sama

Untuk pengembangan lokal dari HP:

1. Pastikan `backend/.env` berisi `NODE_ENV=development` dan `FRONTEND_URL` tidak memakai wildcard `*`.
2. Pastikan `frontend/.env.local` berisi `VITE_API_BASE_URL=/api` agar request memakai Vite proxy dan tidak mengarah ke `localhost` milik HP.
3. Jalankan backend di komputer (`npm run dev`, port `8000`) dan frontend (`npm run dev`, port `5173`). Vite dan Express di konfigurasi ini bind ke `0.0.0.0`.
4. Cari IP LAN komputer dengan `hostname -I`, lalu buka di HP: `http://<IP-KOMPUTER>:5173`. Jangan gunakan `http://localhost:5173` dari HP karena itu menunjuk ke HP sendiri.
5. Jika gagal, periksa firewall komputer dan log backend. Origin HTTP dari localhost serta rentang IPv4 privat hanya diperbolehkan saat `NODE_ENV=development`. Di production, isi `FRONTEND_URL` dengan origin frontend yang persis, misalnya `https://kantin.contoh.sch.id`.

Jika fetch tidak dapat mencapai API, frontend menampilkan pesan konektivitas yang memeriksa alamat API, jaringan, dan firewall. CORS bukan perlu dinonaktifkan: gunakan `/api` melalui proxy untuk dev/same-origin, atau daftar origin production secara eksplisit.

## Validasi PIN transaksi

PIN salah mengembalikan HTTP `422` dengan pesan `Mohon maaf, PIN salah.` agar tidak dianggap sebagai sesi login kedaluwarsa. Form pembayaran menampilkan pesan inline, mengosongkan input PIN, dan mempertahankan QR akun serta sesi kasir agar dapat mencoba lagi. Setelah lima percobaan gagal, sistem tetap menerapkan penguncian sementara.

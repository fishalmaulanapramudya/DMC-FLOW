# DMC FLOW / D-PAY REST API — Referensi ringkas

Base path: `/api`. Endpoint terproteksi memerlukan `Authorization: Bearer <JWT>`. Checkout memerlukan shift aktif; `paymentMethod` harus `cash` atau `qr_wallet`.

| Method | Endpoint | Fungsi / izin |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/login` | Login dan keluarkan JWT |
| POST | `/auth/register` | Registrasi siswa/guru; role selalu `pelanggan`, memerlukan PIN transaksi |
| GET | `/auth/me` | Profil dan permission sesi |
| GET/POST | `/products` | Daftar / buat produk (`products.view` / `products.manage`) |
| GET | `/products/sku/:sku` | Resolusi SKU aktif (`pos.access`) |
| PATCH/DELETE | `/products/:id` | Ubah / nonaktifkan produk (`products.manage`) |
| GET | `/shifts/current` | Shift aktif milik kasir (`pos.access`) |
| POST | `/shifts/open` | Buka shift dan catat modal awal otomatis berdasarkan pengguna login (`shifts.open`) |
| POST | `/shifts/close` | Tutup shift sendiri, hitung kas yang diharapkan dan selisih (`shifts.close`) |
| GET | `/shifts` | Riwayat seluruh shift (`shifts.view`) |
| POST | `/shifts/:id/admin-close` | Penutupan shift oleh admin dengan catatan audit (`shifts.manage`) |
| POST | `/pos/identify` | Validasi QR aktif dan tampilkan ringkasan akun (`pos.access`) |
| POST | `/pos/checkout` | Checkout atomik: `cash` tanpa debit wallet atau `qr_wallet` dengan QR + PIN (`pos.access`) |
| GET/POST | `/users` | Cari / buat akun (`users.view` / `users.manage`) |
| PATCH | `/users/:id/status` | Suspend / aktifkan akun (`users.manage`) |
| PATCH | `/users/:id/role` | Ubah role (`roles.manage`) |
| POST | `/users/:id/qr/rotate` | Terbitkan token QR baru (`users.manage`) |
| POST | `/users/:id/qr/revoke` | Cabut QR (`users.manage`) |
| GET | `/wallet/me` | Saldo dan QR akun sendiri |
| GET | `/wallet/me/transactions` | Ledger saldo akun sendiri |
| GET | `/wallet/users/:id/transactions` | Ledger akun pilihan (`wallet.view`) |
| POST | `/wallet/topups` | Top-up saldo atomik (`wallet.topup`) |
| GET | `/sales/mine` | Riwayat transaksi milik akun pelanggan |
| GET | `/sales` | Riwayat penjualan per periode (`sales.view`) |
| GET | `/sales/:id` | Detail transaksi milik sendiri atau role berizin |
| GET | `/dashboard?period=day\|week\|month` | Ringkasan (`dashboard.view`) |
| GET | `/reports?period=day\|week\|month` | Laporan periode (`reports.view`) |
| GET/POST | `/expenses` | Daftar / catat pengeluaran (`expenses.view` / `expenses.manage`) |
| GET/POST | `/stock-opname` | Daftar / simpan stok opname (`stock.view` / `stock.manage`) |
| GET | `/audit-logs` | Riwayat audit (`audit.view`) |
| GET/POST | `/roles` | Daftar role/permission atau buat role (`roles.manage`) |
| PUT | `/roles/:id/permissions` | Mengganti permission role (`roles.manage`) |

## Contoh checkout tunai

```json
{
  "paymentMethod": "cash",
  "cashReceived": 20000,
  "items": [{ "sku": "SKU-001", "qty": 2 }],
  "idempotencyKey": "unique-request-key"
}
```

## Contoh checkout D-PAY

```json
{
  "paymentMethod": "qr_wallet",
  "qrToken": "token-dari-qr-akun",
  "transactionPin": "PIN-dimasukkan-pemilik-akun",
  "items": [{ "sku": "SKU-001", "qty": 2 }],
  "idempotencyKey": "unique-request-key"
}
```

Server mengunci shift, produk dan wallet yang diperlukan dalam transaksi database. Nominal produk dihitung dari database, bukan dari harga yang dikirim frontend. QR adalah identitas akun; saldo tidak disimpan di dalam gambar QR.

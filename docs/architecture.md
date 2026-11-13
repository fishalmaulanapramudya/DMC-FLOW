# DMC FLOW / D-PAY — Catatan arsitektur dan keamanan

## Gambaran sistem

```text
Browser kasir / akun siswa-guru (Vue 3 + TypeScript)
   ├─ scan SKU produk
   ├─ kamera browser untuk scan QR akun
   └─ JWT Bearer / HTTPS
          ↓
Express REST API (TypeScript)
   ├─ Zod request validation
   ├─ JWT + pemuatan ulang status user/role/permission
   ├─ permission checks (deny by default)
   ├─ application use cases
   ├─ repository PostgreSQL / audit trail
   └─ schema PostgreSQL `dpay` di database existing `lms_fishal`
```

## Data isolation

Seluruh SQL D-Pay dibuat di `dpay.*`. Backend memakai `search_path=dpay,public`, sehingga query tanpa nama schema mengutamakan tabel D-Pay. Jangan mengubah `public.users` milik LMS. Konfigurasi database berada di `backend/.env` dan tidak boleh di-commit.

## Checkout QR

1. Scanner barcode mengirim string SKU; frontend meminta data produk dari server lalu memasukkannya ke keranjang.
2. Kamera kasir membaca QR yang berisi token acak. `/api/pos/identify` memvalidasi bahwa QR aktif dan akun siswa/guru aktif.
3. Sebelum debit, pembeli memasukkan PIN transaksi. Server memverifikasi hash PIN.
4. Backend memulai transaksi PostgreSQL, mengambil advisory lock untuk idempotency key, mengunci QR, wallet dan produk yang relevan, lalu membaca ulang harga dan stok dari database.
5. Server menolak QR/akun tidak aktif, SKU tidak diketahui/nonaktif, stok kurang, saldo kurang, dan PIN salah. Lima PIN salah mengunci percobaan 15 menit.
6. Pada transaksi yang valid, `sales`, `sale_items`, `stock_movements`, `wallets`, `wallet_transactions`, dan waktu pemakaian QR ditulis dalam satu transaksi. Error membatalkan semua perubahan.
7. Idempotency key membantu mencegah debit ganda saat request pembayaran yang sama diulang.

## Model data utama

- `dpay.users` → role, profile, wallet, QR token.
- `dpay.user_profiles` menyimpan jenis akun `student`/`teacher`, nomor induk dan kelas/unit.
- `dpay.account_qr_tokens` menyimpan token QR acak; tidak menyimpan saldo pada QR.
- `dpay.wallet_transactions` adalah ledger perubahan saldo dengan arah, nominal, saldo sebelum/sesudah dan referensi transaksi.
- `dpay.sales` → `dpay.sale_items`; rincian SKU/nama/harga disimpan sebagai snapshot. Penjualan menyimpan metode `qr_wallet`, bukan token QR, agar token rahasia tidak tersimpan pada riwayat transaksi.
- `dpay.products`, `dpay.stock_movements`, `dpay.stock_opnames` menangani inventori.
- `dpay.expenses` mencatat biaya operasional terpisah dari top-up saldo dan penjualan.
- `dpay.roles`, `dpay.permissions`, `dpay.role_permissions` menyimpan RBAC.
- `dpay.audit_logs` mencatat aktivitas penting.

## RBAC dan Zero Trust

Empat role bawaan: `superadmin`, `admin`, `kasir`, dan `pelanggan`. `superadmin` memperoleh seluruh permission dan tidak dapat diturunkan hak aksesnya lewat editor role. Role lain memakai daftar izin eksplisit yang diperiksa oleh middleware pada tiap request. Middleware membaca status akun dan izin terbaru dari PostgreSQL, sehingga perubahan izin berlaku pada request berikutnya. Tombol/menu yang disembunyikan di frontend bukan pengganti pemeriksaan di backend.

## Catatan MVP

Beberapa route masih memuat sebagian orkestrasi aplikasi. Sebelum produksi, pisahkan seluruh use case dari controller, tambah test integrasi database dan tes concurrency, rate limiting khusus kegagalan PIN, mekanisme reset PIN terverifikasi, rotasi secret, HTTPS wajib, backup/restore, monitoring, refund/void, dan rekonsiliasi keuangan. Kamera web memerlukan secure context (HTTPS untuk perangkat selain localhost). Tidak ada debit offline.


## Brand & deployment notes (DMC FLOW / D-PAY)

DMC FLOW is the school canteen web/POS product; D-PAY is the account wallet and QR-based balance payment method. Frontend components are grouped using Atomic Design levels (`components/atoms`, `components/molecules`, `components/organisms`). Use a same-origin `/api` reverse proxy when possible for Cloudflare Tunnel hosting. Cloudflare Tunnel does not bypass browser CORS; with separate domains set the exact frontend origin in `FRONTEND_URL`. Do not expose PostgreSQL publicly. Cash checkout requires a cashier shift and writes cash received/change without debiting a wallet. A D-PAY checkout scans an account QR, requires transaction PIN, and debits wallet/ledger atomically. Shift closing reconciles opening float + cash sales - shift-linked expenses against physical closing cash.


## Product brand and hosting

DMC FLOW is the school canteen web/POS product; D-PAY is the QR-based wallet/payment method. Frontend reusable UI is grouped by Atomic Design level (`components/atoms`, `components/molecules`, `components/organisms`); the main page composition remains in `App.vue` and can be decomposed incrementally. Prefer same-origin `/api` reverse proxy for Cloudflare Tunnel deployment. Cloudflare Tunnel does not bypass browser CORS: for distinct frontend/API origins, allow only the exact frontend origin via `FRONTEND_URL`. Do not expose PostgreSQL publicly. Cash checkout requires an active cashier shift and records cash received/change without debiting a wallet. D-PAY checkout scans an account QR, requires a transaction PIN, and debits wallet/ledger atomically. Shift reconciliation is opening float + cash sales - shift-linked expenses compared to closing physical cash.

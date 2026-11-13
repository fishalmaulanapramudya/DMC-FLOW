# DMC FLOW

DMC FLOW adalah aplikasi operasional kantin sekolah berbasis web yang menggabungkan sistem kasir, dompet digital siswa/guru, dan manajemen keuangan sekolah dalam satu platform.

Project ini terdiri dari:
- Frontend Vue 3 + TypeScript + Vite
- Backend Express + TypeScript
- Database PostgreSQL
- Sistem wallet D-PAY, QR, shift kasir, dan role-based access control

## Ringkasan fitur

- Kasir dapat melakukan checkout produk dengan scan SKU atau input manual
- Metode pembayaran tunai dan wallet D-PAY
- QR account untuk siswa/guru dengan validasi PIN transaksi
- Manajemen saldo wallet, top-up, mutasi, dan histori transaksi
- Shift kasir dengan modal awal, tutup shift, dan rekonsiliasi kas
- CRUD produk, stok, kategori, serta laporan penjualan
- Role dan permission berdasarkan akses pengguna
- Audit log dan keamanan dasar seperti JWT, bcrypt, CORS, rate limiting, dan helmet

## Stack teknologi

- Frontend: Vue 3, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- Auth & security: JWT, bcryptjs, helmet, CORS, rate limiting
- Validation: Zod

## Struktur proyek

```text
.
├── backend/
│   ├── src/
│   ├── sql/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── docs/
├── scripts/
├── README.md
└── .gitignore
```

## Prasyarat

- Node.js 20+
- npm
- PostgreSQL yang sudah berjalan
- Browser modern untuk akses kamera QR dan transaksi

## Persiapan environment

Buat file environment backend dari template:

```bash
cd backend
cp .env.example .env
```

Contoh konfigurasi dasar:

```env
NODE_ENV=development
PORT=8000
FRONTEND_URL=http://localhost:5173,http://127.0.0.1:5173
DATABASE_URL=postgresql://username:password@127.0.0.1:5432/db_name
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
JWT_EXPIRES_IN=8h
BCRYPT_ROUNDS=12
DATABASE_SSL=false
```

Untuk frontend, salin template apabila diperlukan:

```bash
cd frontend
cp .env.example .env
```

## Setup database

Project ini mendukung setup database lokal dengan script yang sudah disediakan:

```bash
bash scripts/setup-local.sh
```

Script tersebut akan membantu menyiapkan konfigurasi database dan environment secara interaktif. Pastikan database PostgreSQL sudah aktif dan user memiliki hak akses ke database yang dipakai.

## Menjalankan project secara lokal

Terminal 1 - backend:

```bash
cd backend
npm install
npm run db:init
npm run dev
```

Terminal 2 - frontend:

```bash
cd frontend
npm install
npm run dev
```

Setelah itu, buka:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## Akun demo

Akun demo hanya untuk lingkungan development.

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@dpay.local | SuperAdmin123! |
| Admin | admin@dpay.local | Admin123! |
| Kasir | kasir@dpay.local | Kasir123! |
| Siswa | siswa@dpay.local | Siswa123! |
| Guru | guru@dpay.local | Guru123! |

PIN demo siswa/guru: 4321

## Alur utama aplikasi

1. Kasir login ke sistem
2. Buka shift kasir sebelum transaksi
3. Tambahkan item produk ke keranjang
4. Pilih metode pembayaran:
   - Tunai
   - D-PAY QR
5. Validasi saldo, stok, dan PIN transaksi
6. Simpan transaksi dan laporan penjualan
7. Tutup shift dan rekonsiliasi kas

## Verifikasi dan build

Backend:

```bash
cd backend
npm run typecheck
npm test
npm run build
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

## Catatan proyek

- Untuk pengembangan lokal dari perangkat lain di jaringan yang sama, gunakan IP LAN komputer, bukan `localhost` dari HP.
- Pastikan `NODE_ENV=development` dan `FRONTEND_URL` hanya berisi origin yang dibolehkan.
- Di production, gunakan origin frontend yang spesifik, bukan wildcard `*`.
- Jangan mengekspos PostgreSQL ke internet publik.

## Dokumentasi tambahan

Dokumen detail tersedia di folder `docs/`:
- `docs/api-reference.md`
- `docs/architecture.md`
- `docs/BUGFIX_ACCOUNT_QR_TOPUP.md`
- `docs/BUGFIX_PIN_SESSION_LAN_CORS.md`
- `docs/cloudflared-deployment.md`

## Lisensi

Project ini digunakan untuk kebutuhan internal / pengembangan aplikasi kantin sekolah dan dapat disesuaikan sesuai kebutuhan organisasi.

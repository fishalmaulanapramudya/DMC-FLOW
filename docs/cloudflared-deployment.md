# Hosting DMC FLOW dengan Cloudflare Tunnel

## Pilihan yang disarankan: satu domain / same origin

Contoh domain: `https://kantin.domain-sekolah.sch.id`.

1. Jalankan backend hanya di localhost, port 8000.
2. Build frontend dengan `VITE_API_BASE_URL=/api`.
3. Sajikan `frontend/dist` dari web server lokal (contoh server statis pada port 4173 untuk demo; untuk production gunakan web server statis/proxy yang sesuai).
4. Atur `cloudflared` untuk mengirim path `/api/*` ke backend port 8000 dan path lainnya ke frontend server.
5. Isi `FRONTEND_URL` pada `backend/.env` dengan origin penuh situs, contoh `https://kantin.domain-sekolah.sch.id`, walaupun frontend dan API satu origin. Restart backend.
6. Pastikan browser bisa membuka `https://kantin.domain-sekolah.sch.id/api/health` dan website di domain yang sama.

Contoh ingress:

```yaml
ingress:
  - hostname: kantin.domain-sekolah.sch.id
    path: /api/.*
    service: http://127.0.0.1:8000
  - hostname: kantin.domain-sekolah.sch.id
    service: http://127.0.0.1:4173
  - service: http_status:404
```

Sesuaikan port `4173` dengan web server frontend yang benar-benar berjalan. Jangan membuka port PostgreSQL ke internet.

## Dua hostname terpisah

Jika frontend dan API memakai hostname terpisah, build frontend menggunakan URL API penuh, misalnya `VITE_API_BASE_URL=https://api-kantin.domain-sekolah.sch.id/api`, dan isi `FRONTEND_URL=https://kantin.domain-sekolah.sch.id` (origin frontend, tanpa path). Untuk beberapa origin tepercaya, pisahkan dengan koma.

## CORS dan keamanan

Cloudflare Tunnel adalah transport/proxy; ia tidak menonaktifkan CORS browser. Produksi hanya mengizinkan origin yang tercantum persis pada `FRONTEND_URL`. Jangan menambahkan `*` pada aplikasi yang mengelola saldo siswa. `localhost` dan alamat IP privat LAN hanya dilonggarkan ketika `NODE_ENV=development`; di production, origin harus cocok persis dengan `FRONTEND_URL`. Gunakan HTTPS untuk kamera QR, batasi akses server dan credential tunnel, buat backup PostgreSQL, dan ganti seluruh kredensial demo sebelum pilot sekolah.

# DMC FLOW — Perbaikan PIN dan akses HP LAN

## Perbaikan PIN transaksi

- PIN salah dari endpoint checkout mengembalikan HTTP `422`, bukan `401`.
- Respons validasi adalah `Mohon maaf, PIN salah.`
- Frontend menampilkan pesan inline, membersihkan input PIN, mempertahankan akun QR terpilih dan sesi kasir.
- Percobaan salah ke-5 tetap dapat menghasilkan HTTP `429` dengan pesan penguncian selama 15 menit.
- Sesi hanya dikeluarkan bila respons `401` memang menyatakan autentikasi/token tidak valid atau kedaluwarsa.

## Akses dari HP pada Wi-Fi yang sama

1. Di `frontend/.env.local`, gunakan `VITE_API_BASE_URL=/api`. Jangan set URL API ke `http://localhost:8000/api` untuk akses dari HP.
2. Backend `.env` lokal sebaiknya menggunakan `NODE_ENV=development`. CORS development mengizinkan localhost/loopback dan alamat IPv4 privat LAN (10/8, 172.16/12, 192.168/16 serta link-local) melalui HTTP. Tidak ada wildcard origin.
3. Jalankan backend dan frontend di komputer yang sama.
4. Jalankan `hostname -I` pada komputer dan buka `http://<IP-LAN-KOMPUTER>:5173` di HP.
5. Jika jaringan masih gagal, cek firewall, apakah HP dan komputer benar-benar pada jaringan/subnet yang sama, serta log backend.

## Production / Cloudflare Tunnel

- Set `NODE_ENV=production`.
- Isi `FRONTEND_URL` hanya dengan origin tepercaya, dipisahkan koma bila ada lebih dari satu, tanpa path seperti `/api`.
- Dianjurkan frontend dan API satu origin dengan `/api` diproxy ke backend. Cloudflare Tunnel sendiri tidak menghapus aturan CORS browser.
- Gunakan HTTPS untuk akses kamera QR di browser HP.

## Perubahan kode utama

- `backend/src/interfaces/http/routes/pos.ts`: status salah PIN `422` agar tidak tertangkap penanganan logout global.
- `backend/src/app.ts`: CORS development untuk origin loopback/private LAN secara terbatas; production tetap exact-origin.
- `backend/src/interfaces/http/middleware/errors.ts`: log CORS spesifik dan respons terdiagnosis.
- `frontend/src/services/api.ts`: diagnosis konektivitas yang lebih jelas dan fallback `/api` bila URL dev `localhost` salah dipakai di HP.
- `frontend/src/App.vue`: pesan inline, mengosongkan PIN salah, fokus kembali ke input PIN, sesi tetap aktif.

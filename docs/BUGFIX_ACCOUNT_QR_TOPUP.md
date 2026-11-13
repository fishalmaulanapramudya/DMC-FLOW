# DMC FLOW — Perbaikan Menu Akun, QR, dan Top-up

## Masalah yang diperbaiki

- Handler frontend untuk `openTopup`, `submitTopup`, dan `toggleUserStatus` sebelumnya tidak didefinisikan meskipun dipakai oleh template. Tombol terlihat, tetapi klik dapat menghasilkan error runtime.
- Alur perubahan role menggunakan ekspresi inline tanpa penanganan error dan berpotensi gagal diam-diam.
- Tombol aksi tidak mencegah klik berulang saat request berjalan.
- Endpoint perubahan role sebelumnya hanya menerima empat role bawaan, sehingga role khusus yang dibuat melalui pengaturan permission tidak dapat ditetapkan dari menu akun.

## Perubahan

- Top-up membuka modal, memvalidasi nominal di frontend, mengirim `POST /api/wallet/topups`, memperbarui saldo lokal, menutup modal hanya setelah server berhasil, serta menyegarkan daftar/ringkasan. Error refresh setelah transaksi berhasil tidak dilaporkan seolah-olah top-up gagal.
- Ubah status akun aktif/ditangguhkan melalui `PATCH /api/users/:id/status` dengan konfirmasi.
- Rotasi QR, pencabutan QR, dan perubahan role menggunakan busy state, penanganan error, dan penyegaran daftar.
- Perubahan role di backend menerima role key bawaan maupun role khusus yang ada di database, tetap melakukan lookup role di database dan mempertahankan aturan pembatasan untuk role admin/superadmin/kasir.
- Tombol submit akun dan top-up dinonaktifkan selama request berjalan untuk mengurangi pengiriman ganda dari klik berulang.

## Cara menguji manual

1. Login sebagai Super Admin atau Admin yang memiliki izin `users.view`, `users.manage`, dan `wallet.topup`.
2. Buka **Akun & QR siswa/guru**.
3. Buat akun baru dengan role Pelanggan, jenis Siswa atau Guru, serta PIN transaksi.
4. Pastikan QR dapat dibuka dan PNG dapat diunduh.
5. Klik aksi Top-up, pilih nominal cepat atau masukkan nominal lain minimal Rp1.000, lalu konfirmasi.
6. Pastikan modal tertutup, saldo pada tabel bertambah, dan top-up tercatat dalam `dpay.wallet_transactions` dengan `type='topup'`.
7. Terbitkan ulang QR, pastikan QR baru tampil; cabut QR dan pastikan status berubah menjadi dicabut.
8. Aktifkan/nonaktifkan akun dan pastikan status berubah.
9. Uji akun tanpa izin `wallet.topup`: endpoint harus mengembalikan HTTP 403.

## Catatan validasi

Pemeriksaan parse TypeScript dilakukan terhadap blok `<script setup>` di `frontend/src/App.vue`. Build penuh Vue/TypeScript dan uji integrasi PostgreSQL harus dijalankan pada komputer pengembangan setelah dependency npm tersedia, karena npm registry tidak dapat diakses dari lingkungan pembuatan paket ini.

# Atomic Design — Frontend DMC FLOW

Folder komponen mengikuti level Atomic Design:

- `atoms/`: elemen paling kecil dan reusable, misalnya `BrandMark.vue`.
- `molecules/`: gabungan atom untuk satu tugas UI, misalnya `PaymentMethodSwitch.vue`.
- `organisms/`: area UI besar yang bisa diekstrak lebih lanjut (POS panel, shift panel, navigation).

Halaman aplikasi masih dirakit di `App.vue`; komponen baru memakai struktur Atomic Design dan menjadi titik awal untuk memecah bagian yang lebih besar tanpa mengubah alur bisnis.

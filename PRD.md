# PRD Crown & Catalyst: Single-player offline

## Ringkasan

Crown & Catalyst adalah game strategi single-player yang menggabungkan catur, kartu skill, hero, dan boss dungeon. Pemain mengendalikan bidak putih melawan AI hitam. Produk tahap ini berfokus pada pengalaman frontend yang utuh, bisa dimainkan offline, menyimpan progres lokal, dan mempertahankan art style prototipe.

## Tujuan produk

1. Membuat satu alur yang jelas dari menu ke dungeon, pertarungan, hadiah, dan progres berikutnya.
2. Memisahkan layar, aturan, dan data agar konten bisa dikembangkan tanpa menulis ulang game.
3. Menjaga pertandingan adil dan dapat dipahami: biaya, resource, efek, giliran, target, dan hasil tampil konsisten.
4. Mendukung desktop dan layar sentuh melalui web app responsif.
5. Menyediakan permainan lokal tanpa akun, server, atau koneksi jaringan.

## Bukan tujuan tahap ini

- Multiplayer, invite link, matchmaking, ranking, chat, akun, dan sinkronisasi cloud.
- Pembayaran nyata, iklan, analitik online, atau layanan backend.
- Mengganti art direction pixel/retro navy, plum/lavender, krem, dengan aksen merah muda dan biru lembut.
- Menambah hero, kartu, boss, atau fitur gameplay baru tanpa brief terpisah.

## Pengguna utama

Pemain kasual yang menyukai catur, kombinasi taktis, dan progres RPG; ingin dapat memulai permainan cepat, memahami efek sebelum menggunakannya, lalu melanjutkan dungeon dari perangkat yang sama.

## Alur utama

1. Pemain membuka menu utama dan melihat progres dungeon serta hero aktif.
2. Pemain membuka peta dungeon atau daftar hero.
3. Pemain memilih boss yang terbuka dan memulai duel dengan hero aktif.
4. Pemain menggerakkan bidak, memainkan kartu yang terjangkau, serta memakai skill/ultimate ketika EN mencukupi.
5. Pemain menang dengan skakmat. Hasil seri dan kalah ditampilkan dengan opsi ulang atau kembali ke menu.
6. Kemenangan memberi hadiah, membuka lantai berikutnya, dan menyimpan progres lokal.

## Persyaratan fungsional

### Menu, dungeon, dan hero

- **FR-01:** Tampilkan layar utama dengan progres lantai, ringkasan boss berikutnya, hero aktif, dan navigasi ke dungeon/hero.
- **FR-02:** Tampilkan tiga boss yang sudah ada. Boss terkunci sampai syarat progres sebelumnya tercapai. Aturan boss terlihat sebelum duel.
- **FR-03:** Tampilkan enam hero, termasuk Liora si Penjaga Benteng, dengan potret, peran, skill, ultimate, kelebihan, dan kelemahan.
- **FR-04:** Semua hero tetap dapat dipilih pada build pengembangan ini; jangan mengembalikan lock/pembelian yang menghambat pengujian tanpa permintaan eksplisit. Sistem koin dan reward yang sudah ada tetap dapat ditampilkan sesuai perilaku prototipe.
- **FR-05:** Pertahankan progres kampanye, hero pilihan, koin, dan boss yang ditaklukkan setelah reload melalui penyimpanan lokal.
- **FR-24:** Dari menu Hero, pemain dapat menyusun loadout berisi tepat 10 kartu non-Joker pilihan dan 1 kartu Joker pilihan. Loadout disimpan lokal, divalidasi saat memuat save lama/rusak, dan menjadi satu-satunya pool kartu untuk tangan, penggantian kartu, dan putar ulang sepanjang duel. Aturan tangan 3 kartu unik serta bobot tarik Joker yang sudah ada tetap berlaku.

### Pertarungan

- **FR-06:** Pertahankan aturan catur legal: langkah, skak, skakmat, kebuntuan, rokade, en passant, dan promosi. Pemain memilih promosi pion putih menjadi ratu, benteng, gajah, atau kuda.
- **FR-07:** AI boss hanya memilih langkah legal. Perilaku dan aturan khusus boss berjalan setelah giliran putih sesuai prototipe.
- **FR-08:** Tangan berisi tiga kartu acak tanpa duplikat dalam tangan. Tiga Joker tetap langka dengan bobot tarik 0,2 dibanding kartu biasa berbobot 1.
- **FR-09:** Kartu membayar mana. Mana dimulai pada 0, bertambah 1 per langkah catur putih yang selesai, dan maksimal 6. Biaya kartu ditampilkan sebagai mana. Biaya dasar Joker adalah 5 mana.
- **FR-10:** Skill hero berbiaya 2 EN dan ultimate berbiaya 5 EN. EN putih maksimal 5; nilai awal dan efek hero mengikuti data hero.
- **FR-11:** Paling banyak satu kartu berbiaya 0 mana dapat dimainkan setiap giliran. Efek kartu yang memberi EN tetap memengaruhi EN, bukan mana, kecuali aturan konten secara eksplisit menyatakan sebaliknya.
- **FR-12:** Kartu yang memerlukan target masuk ke mode target yang terlihat. Klik ulang atau Escape membatalkan dan mengembalikan mana yang dibayar.
- **FR-13:** Skill hero yang memerlukan target juga dapat dibatalkan sebelum target dikonfirmasi tanpa menghabiskan EN.
- **FR-14:** Efek kartu, skill, ultimate, dan boss tidak boleh membuat raja tetap dalam skak tanpa langkah legal untuk menyelamatkannya, atau meniadakan validasi legal catur.
- **FR-15:** Pengguna dapat membatalkan satu putaran putih-hitam dan memulai ulang duel seperti pada prototipe.
- **FR-16:** Suara dapat dinyalakan/dimatikan. Preferensi suara berlaku di sesi berikutnya jika penyimpanan lokal tersedia.
- **FR-17 (P1):** Pemain dapat melanjutkan duel aktif setelah reload dengan state yang konsisten, termasuk efek tertunda dan posisi papan.

### Antarmuka dan aksesibilitas

- **FR-18:** Pertahankan struktur dan art style pixel/retro dari salinan dungeon aktif; perubahan arsitektur tidak menjadi alasan untuk redesign.
- **FR-19:** Semua tombol memiliki fungsi nyata, label yang jelas, state aktif/nonaktif, dan fokus keyboard yang terlihat.
- **FR-20:** Status giliran, hasil validasi, target aktif, biaya yang belum cukup, dan hasil pertandingan dapat diketahui tanpa hanya mengandalkan warna atau animasi.
- **FR-21:** Layout tetap terbaca di desktop dan ponsel tanpa konten penting tertutup atau kartu bertabrakan.
- **FR-22:** Animasi menghormati preferensi reduced motion dan tidak menjadi satu-satunya pembawa informasi.
- **FR-23:** Perisai bidak, Jerat, Blokade, Segel Petak, Benteng Prisma, Jerat Senyap, dan Embun Pelindung bertahan selama dua fase balasan boss. Saat Beku dan Mata Air tetap satu balasan. Efek menampilkan sisa balasan; penghitungan berkurang setelah fase boss selesai, termasuk saat balasan dilewati.

## Aturan resource yang terlihat pemain

| Resource | Digunakan untuk | Diperoleh | Batas |
|---|---|---|---:|
| Mana | Memainkan kartu skill | +1 per langkah catur putih | 6 |
| EN | Skill dan ultimate hero | Efek permainan dan karakter sesuai aturan yang sudah ada | 5 |

Biaya target tahap ini: skill hero 2 EN, ultimate hero 5 EN, dan Joker 5 mana sebelum surcharge khusus hero. Jika implementasi prototipe memiliki interaksi biaya tambahan, tampilkan biaya final yang benar sebelum pemain mengaktifkan kartu.

## Kebutuhan nonfungsional

- **NFR-01:** Bisa dijalankan dari build statis dan tidak membutuhkan backend untuk bermain.
- **NFR-02:** Aturan inti dapat dipanggil tanpa membuat DOM atau mengakses browser global.
- **NFR-03:** Save lokal dinormalisasi, berversi, dan aman terhadap JSON yang rusak atau field yang hilang.
- **NFR-04:** Tidak ada request jaringan saat menjalankan loop gameplay. Aset game tersedia dari paket lokal.
- **NFR-05:** Gunakan semantik HTML, navigasi keyboard, dan status teks yang dapat dibaca teknologi bantu.
- **NFR-06:** Perubahan struktur mempertahankan aset dan prototipe lama selama migrasi.

## Kriteria penerimaan

1. Aplikasi baru terbuka ke menu dan menyelesaikan satu run dungeon tanpa server.
2. Enam hero, tiga boss, seluruh kartu aktif yang sudah ada, serta art portrait tetap terhubung ke data yang benar.
3. Pemain dapat melakukan langkah legal, menggunakan resource yang benar, menyelesaikan target kartu/hero, promosi pilihan, pembatalan, undo, restart, dan melihat akhir pertandingan.
4. Reload mempertahankan progres kampanye; save tidak valid jatuh ke progres awal yang dapat dimainkan.
5. Tampilan tetap mengikuti prototipe aktif dan dapat digunakan dengan mouse, keyboard, dan layar sentuh.
6. `chess-rpg.html` dan `chess-rpg-dungeon.html` tetap tersedia sebagai referensi selama migrasi.
7. Hero roster dan deck builder memakai data konten yang ada; pemain dapat memilih 10 kartu biasa + 1 Joker, menyimpan pilihan setelah reload, dan hanya melihat kartu loadout itu saat duel.

## Ukuran keberhasilan tahap

- Alur menu → duel → reward/progres berjalan lokal.
- Tidak ada fitur multiplayer atau backend yang menjadi dependency agar mode single-player berfungsi.
- Pengembang dapat menambah atau mengubah data hero/kartu/boss di satu sumber konten tanpa menyalin angka ke UI.

# PRD Crown & Catalyst

## Ringkasan

Crown & Catalyst mempertahankan campaign dungeon single-player yang dapat dimainkan offline. Mode PvP 1v1 opsional menghubungkan dua browser langsung melalui WebRTC. Pemain mengendalikan putih atau hitam dengan hero, deck, kartu, resource, dan aturan catur yang simetris. Aplikasi tidak membutuhkan akun atau backend.

## Tujuan produk

1. Membuat satu alur yang jelas dari menu ke dungeon, pertarungan, hadiah, dan progres berikutnya.
2. Memisahkan layar, aturan, dan data agar konten bisa dikembangkan tanpa menulis ulang game.
3. Menjaga pertandingan adil dan dapat dipahami: biaya, resource, efek, giliran, target, dan hasil tampil konsisten.
4. Mendukung desktop dan layar sentuh melalui web app responsif.
5. Menyediakan campaign lokal tanpa akun/server; mode PvP opsional berjalan langsung antara dua browser.

## Bukan tujuan tahap ini

- Matchmaking, ranking, chat, akun, dan sinkronisasi cloud. PvP terbatas pada duel langsung yang dimulai dan disinyalkan pemain sendiri.
- Pembayaran nyata, iklan, analitik online, atau layanan backend.
- Mengganti art direction pixel/retro navy, plum/lavender, krem, dengan aksen merah muda dan biru lembut.
- Menambah hero, kartu, atau fitur gameplay di luar permintaan eksplisit. Campaign sepuluh boss ini mengikuti permintaan terbaru.

## Pengguna utama

Pemain kasual yang menyukai catur, kombinasi taktis, dan progres RPG; ingin dapat memulai permainan cepat, memahami efek sebelum menggunakannya, lalu melanjutkan dungeon dari perangkat yang sama.

## Alur utama

1. Pemain membuka menu utama dan melihat progres dungeon serta hero aktif.
2. Pemain memilih chapter di peta dunia, lalu memilih lantai yang terbuka.
3. Empat lantai standar diikuti boss pada lantai kelima; boss memiliki skill unik yang ditampilkan sebelum duel.
4. Pemain menggerakkan bidak, memainkan kartu yang terjangkau, serta memakai skill/ultimate ketika EN mencukupi.
5. Pemain menang dengan skakmat. Hasil seri dan kalah ditampilkan dengan opsi ulang atau kembali ke menu.
6. Kemenangan first-clear memberi hadiah dan membuka lantai berikutnya; chapter berikutnya menunggu boss chapter sebelumnya dikalahkan.

## Persyaratan fungsional

### Menu, dungeon, dan hero

- **FR-01:** Tampilkan layar utama dengan progres lantai, ringkasan boss berikutnya, hero aktif, dan navigasi ke dungeon/hero.
- **FR-02:** Tampilkan sepuluh boss campaign pada detail lantai kelima masing-masing. Skill unik boss terlihat sebelum duel dan dijalankan melalui aturan battle.
- **FR-03:** Tampilkan enam hero, termasuk Liora si Penjaga Benteng, dengan potret, peran, skill, ultimate, kelebihan, dan kelemahan.
- **FR-04:** Semua hero tetap dapat dipilih pada build pengembangan ini; jangan mengembalikan lock/pembelian yang menghambat pengujian tanpa permintaan eksplisit. Sistem koin dan reward yang sudah ada tetap dapat ditampilkan sesuai perilaku prototipe.
- **FR-05:** Pertahankan progres lantai campaign, hero pilihan, dan koin setelah reload melalui penyimpanan lokal. Migrasikan save boss lama tanpa menghilangkan progres/koin.
- **FR-24:** Dari menu Hero, pemain dapat menyusun loadout berisi tepat 10 kartu non-Joker pilihan dan 1 kartu Joker pilihan. Loadout disimpan lokal, divalidasi saat memuat save lama/rusak, dan menjadi satu-satunya pool kartu untuk tangan, penggantian kartu, dan putar ulang sepanjang duel. Aturan tangan 3 kartu unik serta bobot tarik Joker yang sudah ada tetap berlaku.
- **FR-25:** Campaign memiliki 10 chapter × 5 lantai. Lantai 1–4 berisi pertarungan standar; lantai 5 melawan boss dengan skill unik. Lantai dan chapter terkunci sampai prasyarat sebelumnya selesai, khususnya chapter selanjutnya baru terbuka setelah boss dikalahkan. Tampilkan 10 lokasi di enam region daratan; tidak ada marker di air.

### Pertarungan

- **FR-06:** Pertahankan aturan catur legal: langkah, skak, skakmat, kebuntuan, rokade, en passant, dan promosi. Campaign mempromosikan pion putih menjadi ratu, benteng, gajah, atau kuda; PvP mendukung promosi untuk kedua warna.
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

## Mode PvP 1v1

- **FR-26:** Mode PvP opsional tidak mengubah campaign single-player; campaign tetap dapat dimainkan offline.
- **FR-27:** Kedua pemain memilih satu dari enam hero dan deck valid berisi 10 kartu non-Joker serta 1 Joker sebelum memilih warna. Host bermain putih, tamu bermain hitam.
- **FR-28:** Koneksi dimulai lewat SDP offer/answer yang disalin-tempel manual. Aplikasi memakai STUN dan WebRTC DataChannel langsung; tidak ada akun, backend, matchmaking, server signaling, atau TURN relay.
- **FR-29:** Host mengelola state otoritatif dan random source; tamu mengirim command pada gilirannya dan menerima snapshot state setelah command diterapkan.
- **FR-30:** Kedua sisi memakai aturan catur legal yang sama, termasuk skak, skakmat, remis, rokade, en passant, promosi, target kartu/hero, pembatalan, undo, dan restart.
- **FR-31:** Semua 37 kartu dan seluruh aksi keenam hero berlaku untuk kedua warna. Kartu memakai mana, sedangkan skill/ultimate hero memakai EN; biaya dan efek mengikuti sumber data serta aturan domain bersama.
- **FR-32:** Status koneksi, kode SDP, error, giliran, resource kedua sisi, tangan lawan, aksi yang tersedia, target aktif, dan hasil duel dapat dibaca tanpa mengandalkan warna saja.

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
- **NFR-04:** Campaign tidak membuat request jaringan saat gameplay. Saat pemain memulai PvP, koneksi langsung memakai STUN dan WebRTC DataChannel tanpa API pertandingan atau server signaling.
- **NFR-05:** Gunakan semantik HTML, navigasi keyboard, dan status teks yang dapat dibaca teknologi bantu.
- **NFR-06:** Perubahan struktur mempertahankan aset dan prototipe lama selama migrasi.

## Kriteria penerimaan

1. Aplikasi baru terbuka ke menu dan menyelesaikan satu run dungeon tanpa server.
2. Enam hero, sepuluh boss dengan skill unik, seluruh kartu aktif, dan art portrait terhubung ke sumber data yang benar.
3. Pemain dapat melakukan langkah legal, menggunakan resource yang benar, menyelesaikan target kartu/hero, promosi pilihan, pembatalan, undo, restart, dan melihat akhir pertandingan.
4. Reload mempertahankan progres kampanye; save tidak valid jatuh ke progres awal yang dapat dimainkan.
5. Tampilan tetap mengikuti prototipe aktif dan dapat digunakan dengan mouse, keyboard, dan layar sentuh.
6. `chess-rpg.html` dan `chess-rpg-dungeon.html` tetap tersedia sebagai referensi selama migrasi.
7. Hero roster dan deck builder memakai data konten yang ada; pemain dapat memilih 10 kartu biasa + 1 Joker, menyimpan pilihan setelah reload, dan hanya melihat kartu loadout itu saat duel.
8. Campaign berisi 50 lantai berurutan; boss kelima membuka chapter berikutnya, semua marker berada di darat, dan tidak ada marker di air.
9. Dua browser dapat memulai duel lewat pertukaran SDP manual, membentuk koneksi WebRTC, menjalankan command bergantian, dan menerima state papan/resource yang sama.
10. PvP memakai loadout dan resource per warna serta menyelesaikan kartu, aksi hero, promosi, undo, restart, remis, dan skakmat dengan aturan yang sama untuk kedua sisi.
11. PvP tidak menambahkan backend, akun, matchmaking, TURN relay, atau layanan signaling; kampanye tidak memerlukan jaringan.

## Ukuran keberhasilan tahap

- Alur menu → duel → reward/progres campaign berjalan lokal.
- Tidak ada fitur multiplayer atau backend yang menjadi dependency agar mode single-player berfungsi.
- Pengembang dapat menambah atau mengubah data hero/kartu/boss di satu sumber konten tanpa menyalin angka ke UI.

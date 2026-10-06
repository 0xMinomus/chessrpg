# PRD Crown & Catalyst: campaign offline dan duel PvP online

## Ringkasan

Crown & Catalyst adalah game strategi catur, kartu, hero, dan dungeon. Campaign tetap berjalan offline tanpa server; mode PvP online pilihan menghubungkan dua pemain melalui PeerJS dan WebRTC.

## Tujuan produk

1. Membuat satu alur yang jelas dari menu ke dungeon, pertarungan, hadiah, dan progres berikutnya.
2. Memisahkan layar, aturan, dan data agar konten bisa dikembangkan tanpa menulis ulang game.
3. Menjaga pertandingan adil dan dapat dipahami: biaya, resource, efek, giliran, target, dan hasil tampil konsisten.
4. Mendukung desktop dan layar sentuh melalui web app responsif.
5. Kampanye lokal tetap tersedia tanpa jaringan; PvP online baru membuka koneksi saat dipilih pemain.
6. Mendukung duel 1v1 melalui matchmaking terbuka atau kode ruang, dengan pilihan warna dan loadout masing-masing.

## Bukan tujuan tahap ini

- Akun, sinkronisasi cloud, chat, leaderboard, pembayaran, dan backend otoritatif.
- Iklan atau analitik online.
- Mengganti art direction pixel/retro navy, plum/lavender, krem, dengan aksen merah muda dan biru lembut.
- Menambah hero, kartu, atau fitur gameplay di luar permintaan eksplisit. Campaign sepuluh boss ini mengikuti permintaan terbaru.

## Pengguna utama

Pemain kasual yang menyukai catur dan strategi. Mereka dapat bermain campaign lokal atau menantang pemain lain dalam duel online dengan hero dan deck masing-masing.

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

### Pertandingan PvP online

- **FR-26:** Online menawarkan dua jalur: matchmaking dengan pilihan putih, hitam, atau acak; dan ruang lima digit (termasuk nol di depan) yang dapat dibuat atau dimasuki. Di ruang privat, kedua pemain memilih warna dan menyatakan siap; duel dimulai setelah keduanya siap.
- **FR-27:** Duel memakai hero aktif dan loadout 10 kartu non-Joker + 1 Joker. Kedua klien menerima profil dan seed yang sama, lalu menarik tangan secara deterministik.
- **FR-28:** Kedua warna memakai aturan catur, resource, kartu, efek hero, promosi, dan menyerah yang simetris. Penerima memvalidasi ulang setiap aksi berurutan sebelum memperbarui state.
- **FR-29:** Papan selalu menghadap warna lokal. Pemain melihat asal dan tujuan yang dipilih lawan secara langsung. Premove dapat dibuat saat giliran lawan, lalu divalidasi ulang saat giliran lokal tiba; langkah yang tidak lagi legal dibatalkan.
- **FR-30:** Pemain dapat menyerah dan kembali ke lobi setelah pertandingan berakhir. Koneksi putus atau reload mengakhiri duel; state pertandingan online tidak dipulihkan.
- **FR-31:** Ketiga kartu online ditata rapat bersama papan agar bisa dipilih tanpa scroll terpisah pada viewport desktop dan ponsel.

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

- **NFR-01:** Campaign dapat dijalankan dari build statis tanpa backend. PvP online memerlukan koneksi ke layanan signaling PeerJS dan kanal WebRTC.
- **NFR-02:** Aturan inti dapat dipanggil tanpa membuat DOM atau mengakses browser global.
- **NFR-03:** Save lokal dinormalisasi, berversi, dan aman terhadap JSON yang rusak atau field yang hilang.
- **NFR-04:** Mode offline tidak mengirim request jaringan. Mode online hanya memulai signaling setelah pemain memilih matchmaking, membuat ruang, atau memasukkan kode ruang.
- **NFR-05:** Gunakan semantik HTML, navigasi keyboard, dan status teks yang dapat dibaca teknologi bantu.
- **NFR-06:** Perubahan struktur mempertahankan aset dan prototipe lama selama migrasi.
- **NFR-07:** Peer pemilik `cc-arena-1` mengoordinasikan matchmaking dan meneruskan pesan. Tidak ada backend otoritatif untuk mencegah kecurangan; koneksi WebRTC/TURN tidak dijamin.

## Kriteria penerimaan

1. Aplikasi baru terbuka ke menu dan menyelesaikan satu run dungeon tanpa server.
2. Enam hero, sepuluh boss dengan skill unik, seluruh kartu aktif, dan art portrait terhubung ke sumber data yang benar.
3. Pemain dapat melakukan langkah legal, menggunakan resource yang benar, menyelesaikan target kartu/hero, promosi pilihan, pembatalan, undo, restart, dan melihat akhir pertandingan.
4. Reload mempertahankan progres kampanye; save tidak valid jatuh ke progres awal yang dapat dimainkan.
5. Tampilan tetap mengikuti prototipe aktif dan dapat digunakan dengan mouse, keyboard, dan layar sentuh.
6. `chess-rpg.html` dan `chess-rpg-dungeon.html` tetap tersedia sebagai referensi selama migrasi.
7. Hero roster dan deck builder memakai data konten yang ada; pemain dapat memilih 10 kartu biasa + 1 Joker, menyimpan pilihan setelah reload, dan hanya melihat kartu loadout itu saat duel.
8. Campaign berisi 50 lantai berurutan; boss kelima membuka chapter berikutnya, semua marker berada di darat, dan tidak ada marker di air.
9. Dua browser dapat tersambung lewat antrean dan kode ruang, memilih warna, memulai duel, lalu melihat state papan yang sama setelah aksi.
10. Premove yang legal saat antrean dibuat dijalankan setelah giliran tiba atau dibatalkan bila perubahan papan membuatnya tidak legal.
11. Campaign offline tidak mengirim request jaringan; pencarian lawan atau ruang hanya memakai signaling setelah dipilih pemain.
12. Di kedua browser, layar duel menampilkan tiga kartu tanpa scroll terpisah, membalik papan untuk pemain hitam, dan memperlihatkan pilihan langkah lawan.


## Ukuran keberhasilan tahap

- Alur menu → duel → reward/progres berjalan lokal.
- PvP online bersifat pilihan dan tidak boleh menjadi dependency campaign single-player.
- Pengembang dapat menambah atau mengubah data hero/kartu/boss di satu sumber konten tanpa menyalin angka ke UI.

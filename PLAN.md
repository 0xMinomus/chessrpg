# Rencana implementasi frontend single-player

## Cara menggunakan rencana ini

Saat pengguna menyebut `PLAN.md` sebagai tugas, termasuk hanya mengirim nama file, agent membaca semua Markdown repository seperti yang diwajibkan `AGENTS.md`, lalu menuntaskan seluruh fase yang belum selesai dalam urutan di bawah. Pengecualian: pengguna secara jelas meminta ringkasan, penjelasan, atau review. Agent menjaga kedua prototipe HTML tetap utuh, memperbarui checklist setelah menyelesaikan kriteria, dan tidak menunggu persetujuan antar fase.

## Sasaran

Pindahkan prototipe dungeon aktif menjadi aplikasi frontend single-player offline yang modular, tetap mempertahankan perilaku dan art style yang ada, serta tidak membutuhkan layanan online.

## Batas

- Sumber perilaku dan visual: `chess-rpg-dungeon.html`.
- Pembanding aturan catur dasar: `chess-rpg.html` dan `GAMES.md`.
- Jangan menimpa atau menghapus kedua prototipe.
- Jangan mengubah aturan game atau konten kecuali diperlukan untuk menjaga kesesuaian eksplisit dengan `PRD.md` dan permintaan terbaru.
- Tidak ada backend, akun, multiplayer, atau request jaringan saat gameplay.

## Fase

### 0. Audit dan baseline

- [x] Baca seluruh file Markdown repository dan petakan konflik dokumentasi.
- [x] Catat layar, alur, state, resource, roster hero/boss, kartu, AI, efek, save, aset, serta interaksi pada `chess-rpg-dungeon.html`.
- [x] Pastikan perbedaan antara dokumentasi `GAMES.md` dan resource model dungeon tercatat: kartu = mana; skill/ultimate = EN.
- [x] Susun daftar perilaku yang harus tetap identik selama pemindahan.

**Selesai bila:** daftar fitur dan perilaku sumber telah dipetakan, termasuk pilihan promosi, efek Joker, undo, restart, audio, dan save kampanye.

Catatan: prototipe aktif dibaca sebagai sumber. Konflik dokumentasi tercatat: `GAMES.md` masih menyebut kartu memakai EN, sedangkan aturan dungeon memakai mana untuk kartu dan EN untuk skill/ultimate; pemisahan itu yang dipakai aplikasi baru. Perilaku yang harus tetap identik: 37 kartu (Joker berbobot 0,2), 6 hero, 3 boss + aturan reward, tangan 3 kartu tanpa duplikat, satu kartu 0 mana per giliran, biaya skill 2 EN / ultimate 5 EN, durasi efek 1 atau 2 balasan boss, undo satu putaran penuh, restart, promosi pion putih, audio sintetis, save kampanye `crown-catalyst-dungeon-v1`.

### 1. Fondasi app statis

- [x] Siapkan proyek Vite + TypeScript sesuai `ARCHITECTURE.md`.
- [x] Buat entry point baru untuk aplikasi dan folder sumber domain, konten, application, adapters, UI, styles, dan aset sesuai kebutuhan aktual.
- [x] Pindahkan atau rujuk portrait dan aset lokal dari aplikasi baru tanpa menghapus file sumber.
- [x] Buat build awal yang dapat menyajikan layar prototipe aktif di aplikasi baru.

**Selesai bila:** aplikasi baru dapat dijalankan dan dibuild secara lokal, semua aset tampil, serta dua HTML prototipe lama tetap utuh.

Catatan: `index.html` + `src/main.ts` menjadi entry baru; atlas potret disalin ke `public/assets/hero-potraits-new.png` tanpa menghapus `hero-potraits-new.png` di root. `npm run build` (tsc + vite) hijau; `npm run preview` menyajikan build statis. Kedua HTML prototipe tidak disentuh.

### 2. Ekstraksi konten dan state game

- [x] Pindahkan definisi kartu, hero, boss, biaya, rarity, dan aturan khusus ke sumber konten bertipe.
- [x] Bentuk model state untuk campaign dan battle tanpa referensi ke DOM atau browser global.
- [x] Pisahkan state sementara UI seperti pilihan target, modal promosi, dan navigasi dari aturan domain.
- [x] Jadikan random source eksplisit untuk draw kartu dan keputusan AI.

**Selesai bila:** setiap konten hanya didefinisikan sekali dan seluruh state penting dapat dibentuk tanpa membuat elemen HTML.

Catatan: konten verbatim di `src/content/{cards,heroes,bosses}.ts`. `BattleState` di `src/domain/battle/state.ts` tidak menyentuh DOM/`localStorage`/`Math.random`; undian kartu dan keputusan AI menerima `RandomSource`. State UI (promosi dialog, focus petak, navigasi hub, timer`) hidup di `src/main.ts` dan komponen `src/ui`.

### 3. Ekstraksi game core dan use case

- [x] Pindahkan validasi catur dan transisi langkah ke modul domain chess.
- [x] Pindahkan pembayaran mana untuk kartu, EN untuk hero, batas resource, biaya surcharge, efek skill, efek Joker, serta resolusi boss ke domain battle.
- [x] Pertahankan validasi keselamatan raja pada semua langkah dan efek yang mengubah papan.
- [x] Pindahkan AI hitam ke modul terpisah yang menerima state dan legal moves.
- [x] Sediakan use case untuk memulai duel, memainkan kartu, menggunakan hero action, mengirim langkah, undo, restart, menang, kalah, remis, dan mengklaim reward.

**Selesai bila:** handler UI tidak berisi aturan atau pembayaran resource, dan semua aksi permainan lewat command/use case yang memvalidasi state.

Catatan: `src/domain/chess/*` (generator langkah, keselamatan raja, rokade, en passant, promosi), `src/domain/battle/{resources,effects,ai,result,commands}.ts`, `src/domain/campaign/progress.ts`, dan `src/application/*`. `src/adapters/chess-rules.ts` menjembatani representasi bidak battle (`id` string) ke mesin catur (`id` number) tanpa mengubah aturan. `npm run smoke` menjalankan 81 pemeriksaan perilaku domain/application tanpa DOM (langkah legal, mana +1, surcharge, cancel refund, undo, restart, reroll, skill/ultimate + cancel gratis, durasi FR-23, hadiah sekali, save rusak, 12 duel penuh, AI legal).

### 4. Bangun UI dari modul baru

- [x] Pindahkan layar menu, dungeon, hero roster, battle, promosi, dan hasil duel ke UI modular.
- [x] Hubungkan render ke state dan event UI ke command aplikasi.
- [x] Pertahankan art style, layout utama, animasi, suara, dan affordance dari prototipe dungeon aktif.
- [x] Pastikan kartu, skill, ultimate, telegraph boss, riwayat langkah, efek aktif, dan indikator kedua resource membaca nilai domain yang sama.
- [x] Pastikan keyboard, focus state, label kontrol, layar sentuh, dan reduced motion bekerja.

**Selesai bila:** seluruh alur single-player dapat diselesaikan dari menu sampai hasil duel tanpa bergantung pada file prototipe.

Catatan: layar di `src/ui/screens/*`, papan `src/ui/board/board.ts`, kartu `src/ui/cards/cards.ts`, panel hero `src/ui/hero/hero.ts`, peta boss `src/ui/dungeon/dungeon.ts`. `src/main.ts` hanya meneruskan intent ke `application/*` dan merender snapshot; biaya, saldo resource, legal moves, dan durasi efek dibaca dari domain. Gaya pixel/retro tetap di `src/styles/{tokens,game}.css` dengan `prefers-reduced-motion` dan `focus-visible`.

### 5. Save lokal dan ketahanan offline

- [x] Pindahkan baca/tulis campaign ke adapter penyimpanan lokal dengan schema version.
- [x] Normalisasi data lama, field hilang, nilai tidak valid, dan JSON rusak ke fallback yang dapat dimainkan.
- [x] Pertahankan key save lama atau migrasikan secara eksplisit tanpa menghilangkan progres pengguna.
- [x] Pastikan runtime tidak memerlukan API atau aset remote.
- [ ] Implementasikan resume battle sebagai fitur P1 setelah campaign save dan alur inti stabil. (P1, ditunda)

**Selesai bila:** progres lokal bertahan setelah reload dan kerusakan save tidak membuat menu atau game gagal dibuka.

Catatan: `src/adapters/browser-storage.ts` memakai key yang sama dengan prototipe (`crown-catalyst-dungeon-v1`) plus key terpisah untuk preferensi suara (`crown-catalyst-sound-v1`, FR-16). Normalisasi ada di `normalizeCampaign` (JSON rusak, field hilang, koin negatif, id tak dikenal) dan diuji di `npm run smoke`. Tidak ada request jaringan saat gameplay: aset hanya `public/assets`. Resume battle (FR-17, P1) sengaja ditunda; progres kampanye sudah persisten.

### 6. Penyelesaian dan penerimaan

- [x] Jalankan build/check statis yang tersedia dan perbaiki kegagalan.
- [x] Buka aplikasi baru pada browser dan lakukan smoke walkthrough: menu, pilih hero, pilih boss, langkah legal, tangkapan, kartu berbiaya mana, satu kartu gratis, skill berbiaya EN, ultimate berbiaya EN, target/cancel, promosi, undo, restart, hasil duel, reward, reload save.
- [x] Periksa desktop dan viewport ponsel, navigasi keyboard, tidak ada error console, serta semua aset lokal.
- [x] Bandingkan hasil dengan prototipe dungeon aktif dan selesaikan semua perbedaan yang tidak diminta.
- [x] Laporkan file utama, hasil build/walkthrough, dan batas yang masih sengaja ditunda.

**Selesai bila:** kriteria penerimaan `PRD.md` terpenuhi, build berhasil, walkthrough di atas selesai, dan prototipe asli tetap tersedia.

Catatan: seluruh gate hijau dan dapat diulang.

- `npm run verify`: tsc, domain smoke 95, campaign 26, boss skills 11, chess parity 8, render 55, build, dan `verify:dist`; pola request jaringan tidak ditemukan.
- `npm run verify:layout`: 11 viewport dari 320×780 hingga 1920×1080: 64/64 petak dapat diklik, 10 marker dan lima lantai muat, tanpa overflow horizontal, tumpang tindih label, atau error console. Ponsel/tablet menggulir vertikal.
- `npm run verify:flow`: PASS 91 pada run terakhir; jumlah assertion mengikuti cabang opsional. Uji mencakup 10 marker darat yang dapat dipilih, peta beranda pada 320px, urutan lantai/chapter terkunci, deck/hero, langkah/kartu/skill, serta save/migrasi; tanpa request eksternal, response 4xx/5xx, atau error console. Simulasi duel 60 langkah tidak mencapai hasil alami dan dicatat sebagai CATATAN, bukan gagal.
- `npm run shots:card`: tangkapan layar tangan kartu pada status siap / terkunjuk / target untuk pemeriksaan visual.

Bug yang ditemukan dan diperbaiki pada tahap ini: papan terpotong/tidak bisa diklik di landscape dan ponsel (container query tak terisi + rail bertumpuk), panel hero menimpa label EN/mana di rail sempit, favicon 404, teks pembatalan ultimate salah menyebut skill, catatan deck salah menyebut kartu gratis, navigasi panah memakai state roving alih-alih petak yang difokuskan, dan potret baris atlas atas ikut bergeser.

Tambahan lanjutan (permintaan pengguna): seluruh teks yang ter-double-encode akibat penulisan ulang UTF-8 lewat PowerShell dipulihkan di `main.ts`, `render.ts`, dan `screens/battle.ts` (audit: `node scripts/mojibake-check.mjs`); deskripsi "Fokus cadangan" dikoreksi menjadi memotong mana; gaya kartu, ikon, dan palet diambil dari `cards.html` (katalog desain) ke `src/styles/cards.css`, `src/ui/cards/cards.ts`, dan `src/ui/cards/icons.ts`.

Perbedaan yang disengaja: piece id battle memakai string dengan registri adapter ke id number mesin catur; polyfill preload Vite dimatikan agar tidak ada request jaringan saat gameplay; `target-cancel` adalah tombol batal eksplisit tambahan untuk target hero (prototipe hanya Escape).

Permintaan lanjutan: battle PC muat satu layar tanpa scroll. Panel hero pindah ke rail kiri sesuai prototipe; kartu memakai `clamp(...vh)`, papan memakai sisa baris `1fr`. Pemeriksaan terbaru: frame papan 512px pada 1920×1080, 384px pada 1440×900, dan 243px pada 1280×720; seluruh ukuran lolos. Ponsel/tablet tetap memakai scroll vertikal dan kini diuji mulai 320px.

### 7. Campaign 10 chapter

- [x] Susun 10 chapter berurutan, masing-masing lima lantai; lantai kelima menjadi boss.
- [x] Kunci urutan lantai dan chapter berikutnya sampai boss chapter sebelumnya dikalahkan.
- [x] Beri sepuluh boss aturan unik yang benar-benar diresolusikan battle engine.
- [x] Sebarkan marker ke enam area peta; uji warna piksel di lokasi marker agar tidak berada di laut.
- [x] Simpan clear lantai secara berurutan dan migrasikan progres save lama tanpa menghapus koin atau progres chapter.
- [x] Perbarui PRD, arsitektur, pemeriksaan browser, dan catatan implementasi.

**Selesai bila:** 50 lantai dapat diakses sesuai urutan, tiap boss memiliki skill unik, chapter baru terkunci sampai boss sebelumnya clear, dan seluruh marker berada di daratan.

Catatan: `npm run verify` PASS (95 domain, 26 campaign, 11 skill boss, 8 parity, 55 render); `npm run verify:flow` PASS 91 pada run terakhir (assertion cabang opsional); `npm run verify:layout` PASS 11 viewport. Walkthrough memeriksa marker di home, chapter terkunci/terbuka, serta migrasi save boss lama; hasil duel penuh memakai uji domain karena walkthrough acak 60 langkah tidak menghasilkan terminal state.

Design read: layar operasi campaign untuk game strategi single-player pixel-art; ENERGY 2 / RHYTHM 2 / MOTION 1. Peta mobile memakai rasio 1:1 yang sesuai dengan aset sumber; lima lantai berjajar pada desktop agar tombol mulai tetap terlihat, lalu menumpuk pada ponsel; marker minimum 44×44 menjaga target sentuh. Palet pixel navy/plum/krem/coral dipertahankan dari prototipe.
Permintaan lanjutan: efek cast di atas papan untuk 12 skill/ultimate hero dengan motif visual unik per aksi dan lima keluarga efek kartu menurut `CardKind`. Efek hanya dipicu setelah resolusi berhasil; `prefers-reduced-motion` menggantinya dengan fade 120ms. Pemeriksaan: `npm run verify:combat-fx` memeriksa seluruh pemetaan hero/kartu; `npm run verify:browser` memeriksa animasi cast, aksesibilitas gerak, build, layout, dan walkthrough.


## Keputusan implementasi untuk agent

- Kerjakan fase secara berurutan dalam sesi eksekusi yang sama. Gunakan commit boundary alami pada perubahan besar jika pengguna meminta commit; jangan membuat commit sendiri tanpa permintaan.
- Pertahankan perilaku dan konten saat memindahkan. Jika ditemukan bug yang tidak tercakup permintaan atau PRD, catat dan jangan diam-diam mengubah aturan.
- Tandai checkbox hanya setelah kriteria fase benar-benar tercapai. Jika alat atau lingkungan menghalangi fase, lanjutkan pekerjaan independen dan laporkan blocker spesifik.
- Jangan menambah layanan online atau mengubah ruang lingkup menjadi multiplayer.

# Arsitektur Crown & Catalyst

## Tujuan

Dokumen ini menetapkan arah teknis untuk menjadikan `chess-rpg-dungeon.html` aplikasi game single-player yang terstruktur, tetap bisa dimainkan offline, dan lebih mudah dikembangkan. Multiplayer, akun online, dan layanan backend berada di luar cakupan.

## Kondisi dan keputusan utama

- `chess-rpg.html` adalah prototipe asli dan arsip yang harus tetap utuh.
- `chess-rpg-dungeon.html` adalah prototipe aktif yang menjadi acuan tampilan dan perilaku untuk aplikasi single-player.
- Prototipe aktif berisi HTML, CSS, data konten, state, aturan, AI, penyimpanan, dan render dalam satu file. Implementasi berikutnya dipisahkan bertahap tanpa mengubah perilaku game yang telah disetujui.
- Target awal adalah web app statis yang dapat berjalan lokal. Gunakan Vite dan TypeScript dengan DOM vanilla. Pertahankan pendekatan DOM langsung selama kebutuhan UI masih tercukupi; tambahkan framework hanya jika pekerjaan konkret menunjukkan manfaat yang jelas.
- Game core tidak bergantung pada browser, DOM, audio, atau `localStorage`. UI dan adapter browser berkomunikasi dengan core melalui command dan hasil state.

## Batas modul

```text
src/
  content/
    cards.ts
    heroes.ts
    bosses.ts
  domain/
    chess/
      board.ts
      moves.ts
      promotion.ts
    battle/
      state.ts
      commands.ts
      resources.ts
      effects.ts
      result.ts
    campaign/
      progress.ts
  application/
    start-battle.ts
    play-card.ts
    use-hero-action.ts
    submit-move.ts
    undo-turn.ts
  adapters/
    browser-storage.ts
    browser-audio.ts
    random.ts
  ui/
    screens/
    board/
    cards/
    hero/
    dungeon/
    render.ts
  styles/
    tokens.css
    game.css
public/
  assets/
```

Sesuaikan pemecahan file dengan ukuran modul saat implementasi; daftar ini batas kepemilikan kode, bukan kewajiban membuat satu file untuk setiap nama.

## Aturan dependensi

1. `content` mendefinisikan data statis dan tidak mengimpor UI.
2. `domain` menerima state, command, dan dependency eksplisit seperti sumber angka acak; domain tidak membaca global browser.
3. `application` mengorkestrasi domain dengan penyimpanan dan audio melalui adapter.
4. `ui` menampilkan state dan mengirim command. UI tidak menetapkan sendiri hasil langkah atau biaya resource.
5. `adapters` menjadi satu-satunya pemilik akses ke browser API seperti `localStorage`, Web Audio, dan random source.

## Model permainan

- State battle mencakup papan, giliran, riwayat, loadout kartu terpilih, tangan kartu, resource, efek tertunda, state hero, state boss, status pertandingan, dan state pemilihan target/promosi.
- Perubahan state dilakukan melalui command bernama, misalnya `movePiece`, `playCard`, `useHeroSkill`, `useHeroUltimate`, `undoTurn`, dan `restartBattle`.
- Domain memvalidasi command dan mengembalikan state baru serta hasil yang dapat ditampilkan UI. Jangan menaruh aturan game di event handler atau template HTML.
- Pengundian kartu dan pilihan AI menerima random source eksplisit. Ini menjaga jalur acak dapat direproduksi saat debugging dan tidak mengikat domain ke `Math.random` global.
- Data kartu, hero, dan boss tinggal di `content`; angka biaya, rarity, skill, kelemahan, aturan boss, dan hadiah tidak disalin ke komponen UI.
- UI papan menerima snapshot state dan memancarkan input pemain. Renderer hanya menerjemahkan state menjadi DOM; renderer tidak mengubah state permainan.

## Resource dan aturan acuan

Aturan berikut mengikuti permintaan terbaru dan prototipe dungeon aktif:

- **Mana** membayar kartu. Mana bertambah 1 setelah setiap langkah catur putih yang benar-benar dilakukan dan kapasitasnya 6.
- **EN** membayar skill serta ultimate hero. Skill berbiaya 2 EN, ultimate 5 EN, dan kapasitas EN putih 5.
- Hero menentukan EN awal dan dapat mengubah efek resource sesuai data hero. Kartu juga dapat menghasilkan atau mengubah EN sebagai efek.
- Tangan terdiri dari 3 kartu yang ditarik dari loadout pemain (10 kartu non-Joker + 1 Joker). Satu kartu berbiaya 0 mana dapat dimainkan per giliran. Kartu Joker tetap langka dan biaya dasarnya 5 mana; biaya hero yang berlaku ditambahkan melalui aturan biaya terpusat.
- Permainan mempertahankan catur legal, termasuk rokade, en passant, keselamatan raja, dan pilihan promosi pion putih menjadi ratu, benteng, gajah, atau kuda.
- Semua efek yang memindahkan, menghapus, membangkitkan, atau melindungi bidak tetap melewati validasi keselamatan raja.

Jika biaya atau aturan berubah melalui permintaan pengguna, perbarui sumber data dan dokumen terkait dalam satu perubahan yang konsisten.

## Persistensi offline

- Progres kampanye, hero aktif, deck kartu terpilih, koin, dan boss yang sudah dikalahkan disimpan melalui adapter browser dengan key berversi.
- Validasi dan normalisasi data saat membaca save. Save rusak atau versi tidak dikenal harus memiliki fallback yang dapat dimainkan tanpa merusak sesi.
- Penyimpanan battle aktif/resume setelah reload adalah fitur P1, bukan alasan untuk mengikat domain pada `localStorage`.
- Semua aset yang diperlukan untuk bermain harus tersedia lokal atau dicache oleh aplikasi statis; gameplay tidak membuat request ke API.

## Struktur dan migrasi

Mulai dari fondasi aplikasi baru di dalam repository. Pindahkan perilaku dari `chess-rpg-dungeon.html` sedikit demi sedikit dan pertahankan kedua file HTML prototipe sampai aplikasi baru melewati kriteria penerimaan. Jangan melakukan rewrite visual bersamaan dengan ekstraksi domain.

## Batas yang sengaja ditunda

Tidak ada akun, sinkronisasi cloud, multiplayer, matchmaking, chat, leaderboard online, pembayaran, atau backend pada target ini. Kode domain tetap dapat dipakai ulang oleh mode lain kelak, tetapi jangan menambahkan abstraksi jaringan sebelum mode tersebut diminta.

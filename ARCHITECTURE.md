# Arsitektur ChessRPG

## Tujuan

Dokumen ini menetapkan arah teknis untuk aplikasi campaign single-player yang tetap dapat dimainkan offline, dengan duel PvP online sebagai mode pilihan. Domain game tidak bergantung pada DOM, penyimpanan browser, atau jaringan.

## Kondisi dan keputusan utama

- `chess-rpg.html` adalah prototipe asli dan arsip yang harus tetap utuh.
- `chess-rpg-dungeon.html` adalah prototipe aktif dan acuan tampilan/perilaku campaign single-player; mode PvP baru mempertahankan gaya visual dan memakai aturan/data konten bersama.
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
    dungeon.ts
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
    pvp/
      state.ts
      rules.ts
      cards.ts
      hero.ts
      commands.ts
    online/
      protocol.ts
      matchmaking.ts
  application/
    start-battle.ts
    play-card.ts
    use-hero-action.ts
    submit-move.ts
    undo-turn.ts
    online-session.ts
  adapters/
    browser-storage.ts
    browser-audio.ts
    random.ts
    peerjs-network.ts
  ui/
    screens/
      online.ts
    board/
    cards/
    hero/
    dungeon/
    render.ts
  styles/
    tokens.css
    game.css
    online.css
public/
  assets/
```

Sesuaikan pemecahan file dengan ukuran modul saat implementasi; daftar ini batas kepemilikan kode, bukan kewajiban membuat satu file untuk setiap nama.

## Aturan dependensi

1. `content` mendefinisikan data statis dan tidak mengimpor UI.
2. `domain` menerima state, command, dan dependency eksplisit seperti sumber angka acak; domain tidak membaca global browser.
3. `application` mengorkestrasi domain dengan penyimpanan dan audio melalui adapter.
4. `ui` menampilkan state dan mengirim command. UI tidak menetapkan sendiri hasil langkah atau biaya resource.
5. `adapters` menjadi pemilik akses ke API browser dan jaringan; adaptor jaringan hanya dimuat setelah pemain memilih mode online.
6. `online-session` mengelola matchmaking, ruang, relay, urutan pesan, dan sinkronisasi; domain PvP memvalidasi setiap aksi di kedua klien.

## Model permainan

- State battle mencakup papan, giliran, riwayat, loadout kartu terpilih, tangan kartu, resource, efek tertunda, state hero, state boss, status pertandingan, dan state pemilihan target/promosi.
- Perubahan state dilakukan melalui command bernama, misalnya `movePiece`, `playCard`, `useHeroSkill`, `useHeroUltimate`, `undoTurn`, dan `restartBattle`.
- Domain memvalidasi command dan mengembalikan state baru serta hasil yang dapat ditampilkan UI. Jangan menaruh aturan game di event handler atau template HTML.
- Pengundian kartu dan pilihan AI menerima random source eksplisit. Ini menjaga jalur acak dapat direproduksi saat debugging dan tidak mengikat domain ke `Math.random` global.
- Data kartu, hero, dan boss tinggal di `content`; angka biaya, rarity, skill, kelemahan, aturan boss, dan hadiah tidak disalin ke komponen UI.
- UI papan menerima snapshot state dan memancarkan input pemain. Renderer hanya menerjemahkan state menjadi DOM; renderer tidak mengubah state permainan.
- `domain/pvp` menjalankan putih dan hitam sebagai pemain simetris, termasuk resource, kartu, aksi hero, promosi, dan menyerah. Seed pertandingan dan aksi berurutan membuat kedua klien membangun state yang sama serta memvalidasi ulang langkah yang diterima.
- Pemilihan petak dan premove dikirim sebagai pesan UI/sesi; domain memvalidasi ulang langkah saat giliran tiba. PeerJS membawa pesan ruang dan matchmaking melalui data channel WebRTC.

- Data campaign mendefinisikan 10 chapter dan 50 lantai berurutan pada satu sumber. Tiap chapter memiliki empat lantai standar dan boss di lantai kelima; boss yang dikalahkan membuka chapter berikutnya.
- Progres campaign menyimpan ID lantai yang telah ditaklukkan sebagai prefiks berurutan. `startBattle` menolak lantai terkunci; adapter browser memigrasikan save lama tiga boss serta mempertahankan proyeksi kompatibilitasnya.

## Resource dan aturan acuan campaign

Aturan berikut mengikuti permintaan terbaru dan prototipe dungeon aktif:

- **Mana** membayar kartu. Dalam campaign, mana bertambah 1 setelah langkah catur putih yang selesai; di PvP, pemain aktif mendapat 1 mana setelah langkahnya selesai. Batas mana masing-masing sisi 6.
- **EN** membayar skill serta ultimate hero. Skill berbiaya 2 EN, ultimate 5 EN, dan batas EN masing-masing sisi 5.
- Hero menentukan EN awal dan dapat mengubah efek resource sesuai data hero. Kartu juga dapat menghasilkan atau mengubah EN sebagai efek.
- Tangan terdiri dari 3 kartu yang ditarik dari loadout pemain (10 kartu non-Joker + 1 Joker). Satu kartu berbiaya 0 mana dapat dimainkan per giliran. Kartu Joker tetap langka dan biaya dasarnya 5 mana; biaya hero yang berlaku ditambahkan melalui aturan biaya terpusat.
- Permainan mempertahankan catur legal, termasuk rokade, en passant, keselamatan raja, dan pilihan promosi pion menjadi ratu, benteng, gajah, atau kuda. Campaign mempromosikan pion putih; PvP mendukung kedua warna.
- Semua efek yang memindahkan, menghapus, membangkitkan, atau melindungi bidak tetap melewati validasi keselamatan raja.

Jika biaya atau aturan berubah melalui permintaan pengguna, perbarui sumber data dan dokumen terkait dalam satu perubahan yang konsisten.

## Persistensi offline

- Progres kampanye menyimpan clear lantai berurutan (`clearedFloorIds`), hero aktif, deck kartu, dan koin melalui adapter browser dengan key berversi. Adapter memigrasikan save lama yang berisi boss kalah dan mempertahankan kompatibilitas baca mundur untuk tiga boss lama.
- Penyimpanan battle aktif/resume setelah reload adalah fitur P1, bukan alasan untuk mengikat domain pada `localStorage`.
- Semua aset permainan tersedia lokal. Mode offline tidak mengirim request; mode online baru membuka signaling PeerJS dan kanal data WebRTC setelah pemain memulai pencarian atau membuat/menggabungkan ruang.
- Pertandingan online tidak disimpan; memuat ulang atau menutup tab mengakhiri sesi dan memutus peer.

## Struktur dan migrasi

Mulai dari fondasi aplikasi baru di dalam repository. Pindahkan perilaku dari `chess-rpg-dungeon.html` sedikit demi sedikit dan pertahankan kedua file HTML prototipe sampai aplikasi baru melewati kriteria penerimaan. Jangan melakukan rewrite visual bersamaan dengan ekstraksi domain.

## Batas yang sengaja ditunda

Campaign tetap bisa dimainkan tanpa akun, server, atau koneksi jaringan. Duel online memakai PeerJS/WebRTC tanpa backend otoritatif: satu peer tetap menjadi koordinator/relay matchmaking, kedua klien memvalidasi aksi dengan domain deterministik yang sama, dan tidak ada perlindungan terhadap klien curang atau jaminan koneksi TURN. Akun, sinkronisasi cloud, chat, leaderboard, dan pembayaran tetap di luar cakupan.

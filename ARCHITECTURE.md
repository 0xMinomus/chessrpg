# Arsitektur ChessRPG

## Tujuan

Dokumen ini menetapkan arah teknis untuk aplikasi game statis ChessRPG. Campaign dungeon tetap single-player dan dapat dimainkan offline. Atas permintaan pengguna, aplikasi juga menyediakan duel PvP 1v1 opsional melalui koneksi WebRTC langsung. Akun, matchmaking, layanan signaling/backend, dan relay TURN tetap di luar cakupan.

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
    pvp/
      state.ts
      commands.ts
    campaign/
      progress.ts
  application/
    start-battle.ts
    play-card.ts
    use-hero-action.ts
    submit-move.ts
    pvp.ts
  adapters/
    browser-storage.ts
    webrtc.ts
    random.ts
  ui/
    screens/
      pvp.ts
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
5. `adapters` menjadi satu-satunya pemilik akses ke browser API seperti `localStorage`, Web Audio, random source, dan WebRTC.

## Model permainan

- State battle mencakup papan, giliran, riwayat, loadout kartu terpilih, tangan kartu, resource, efek tertunda, state hero, state boss, status pertandingan, dan state pemilihan target/promosi.
- Perubahan state dilakukan melalui command bernama, misalnya `movePiece`, `playCard`, `useHeroSkill`, `useHeroUltimate`, `undoTurn`, dan `restartBattle`.
- Domain memvalidasi command dan mengembalikan state baru serta hasil yang dapat ditampilkan UI. Jangan menaruh aturan game di event handler atau template HTML.
- Pengundian kartu dan pilihan AI menerima random source eksplisit. Ini menjaga jalur acak dapat direproduksi saat debugging dan tidak mengikat domain ke `Math.random` global.
- Data kartu, hero, dan boss tinggal di `content`; angka biaya, rarity, skill, kelemahan, aturan boss, dan hadiah tidak disalin ke komponen UI.
- UI papan menerima snapshot state dan memancarkan input pemain. Renderer hanya menerjemahkan state menjadi DOM; renderer tidak mengubah state permainan.

- Data campaign mendefinisikan 10 chapter dan 50 lantai berurutan pada satu sumber. Tiap chapter memiliki empat lantai standar dan boss di lantai kelima; boss yang dikalahkan membuka chapter berikutnya.
- Progres campaign menyimpan ID lantai yang telah ditaklukkan sebagai prefiks berurutan. `startBattle` menolak lantai terkunci; adapter browser memigrasikan save lama tiga boss serta mempertahankan proyeksi kompatibilitasnya.

### Mode PvP langsung

- Mode PvP memakai state dan command simetris per warna, tetapi data hero, kartu, biaya, serta aturan catur tetap bersumber dari modul yang sama dengan campaign.
- Host bermain putih dan menjadi otoritas state serta pengundian kartu. Tamu bermain hitam dan mengirim intent; host mengirim snapshot hasil kembali melalui WebRTC DataChannel.
- Kedua pemain memilih hero dan deck sebelum koneksi. Mereka bertukar SDP offer/answer secara manual; STUN membantu koneksi langsung. Tidak ada akun, server pertandingan, matchmaking, signaling service, atau TURN relay.
- PvP memerlukan konektivitas jaringan saat pemain memulai duel; campaign single-player tetap offline dan tidak bergantung pada koneksi tersebut.

## Resource dan aturan acuan

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
- Aset game campaign tersedia dari paket lokal; campaign tidak membuat request jaringan selama gameplay. PvP yang dimulai pemain menggunakan STUN dan WebRTC langsung untuk koneksi serta pertukaran state, tanpa API server.

## Struktur dan migrasi

Mulai dari fondasi aplikasi baru di dalam repository. Pindahkan perilaku dari `chess-rpg-dungeon.html` sedikit demi sedikit dan pertahankan kedua file HTML prototipe sampai aplikasi baru melewati kriteria penerimaan. Jangan melakukan rewrite visual bersamaan dengan ekstraksi domain.

## Batas yang sengaja ditunda

Tidak ada akun, sinkronisasi cloud, matchmaking, chat, leaderboard online, pembayaran, backend, signaling server, atau TURN relay. PvP langsung 1v1 adalah satu-satunya pengecualian jaringan yang diminta; jangan membuat campaign single-player bergantung padanya.

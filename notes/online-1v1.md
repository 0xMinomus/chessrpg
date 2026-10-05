---
title: Duel online 1v1
aliases:
  - Online PvP
  - Crown & Catalyst PvP
tags:
  - crown-catalyst
  - online-pvp
---

# Duel online 1v1

Mode PvP menghubungkan dua browser tanpa mengubah campaign single-player. Campaign tetap berjalan offline. Duel online memerlukan internet untuk signaling PeerJS dan koneksi WebRTC.

## Alur pemain

1. Buka menu **Online**. App memakai hero aktif dan deck tersimpan.
2. Deck harus berisi 10 kartu non-Joker dan 1 Joker yang berbeda.
3. Pilih antrean matchmaking atau buat/gabung ruang. Kode ruang terdiri dari lima digit; nol di depan tetap bagian dari kode.
4. Pilih putih, hitam, atau acak. Kedua pemain harus siap sebelum ruang dimulai.
5. Kedua browser membentuk state dari profil pemain dan seed yang sama. Setiap aksi berurutan divalidasi di kedua sisi.

## Struktur

- [[src/domain/pvp/state.ts]] dan [[src/domain/pvp/rules.ts]] memodelkan pertandingan simetris dan draw kartu deterministik.
- [[src/domain/pvp/cards.ts]], [[src/domain/pvp/hero.ts]], dan [[src/domain/pvp/commands.ts]] memvalidasi aksi game.
- [[src/domain/online/protocol.ts]] mendefinisikan aksi, kode ruang, pilihan warna, dan pesan.
- [[src/domain/online/matchmaking.ts]] memasangkan pemain dan menentukan warna.
- [[src/adapters/peerjs-network.ts]] membungkus PeerJS dan data channel.
- [[src/application/online-session.ts]] mengelola matchmaking, ruang, relay, urutan aksi, dan premove.
- [[src/ui/screens/online.ts]] dan [[src/styles/online.css]] menyediakan layar responsif.

PeerJS dimuat melalui dynamic import saat pemain memulai pencarian atau membuat/menggabung ruang. Jalur campaign tidak membuka signaling.

## Jaringan dan batas

- Matchmaking memakai peer ber-ID tetap `cc-arena-1`. Browser yang berhasil memiliki ID itu bertindak sebagai koordinator dan meneruskan pesan pertandingan. Peer tersebut dapat pula menjadi salah satu pemain.
- Ruang privat memakai PeerJS ID `cc-room-<kode>`. Setelah koneksi dibuat, kedua pemain mengirim aksi lewat WebRTC data channel.
- Tidak ada backend otoritatif. Setiap klien menjalankan aturan lokal; protokol tidak dapat mencegah klien yang dimodifikasi mengirim state palsu.
- Matchmaking bergantung pada browser koordinator yang tetap tersambung. Jika koordinator menutup tab, koneksi yang melewatinya terputus.
- Koneksi WebRTC bergantung pada signaling dan kondisi jaringan. Implementasi tidak menjamin koneksi pada semua NAT atau jaringan, dan tidak menyediakan server TURN milik proyek.
- Match online tidak disimpan atau dipulihkan setelah reload. Keluar atau koneksi putus mengakhiri sesi.
- Tidak ada akun, sinkronisasi cloud, chat, atau leaderboard.

## Pemeriksaan

- `npm run verify:pvp` menjalankan smoke domain untuk determinisme, aksi kedua warna, promosi, target kartu, rokade, hasil, premove, matchmaking, dan kode ruang.
- `npm run verify` mencakup typecheck, smoke, build, dan pemeriksaan bundle.
- `npm run verify:browser` menguji layar campaign offline. Uji alur dua peer memerlukan internet dan dijalankan terpisah dari pemeriksaan offline.

## Rujukan

- [[PRD]]
- [[ARCHITECTURE]]
- [[PLAN]]
- [[README]]

## Riwayat

- Implementasi online PvP 1v1: domain simetris, antrean matchmaking, ruang privat, adapter PeerJS/WebRTC, aksi berurutan, serta UI responsif; campaign tetap offline.
- Verifikasi: `npm run verify` lulus. Uji dua browser mencakup matchmaking, ruang privat, gerak, premove, kartu target, dan menyerah; layout diuji di 320 dan 390 px. Reload campaign hanya meminta aset same-origin dan tidak memuat chunk PeerJS.

# Crown & Catalyst — Panduan Game

Dokumen ini merangkum aturan dan isi prototipe web yang ada di [chess-rpg.html](chess-rpg.html).

## Konsep dan tujuan

Crown & Catalyst menggabungkan catur standar dengan skill berbentuk kartu. Pemain mengendalikan putih melawan AI hitam. Menangkan pertandingan dengan skakmat; jika pihak yang giliran tidak punya langkah legal dan tidak sedang skak, hasilnya remis.

## Alur dan aturan

- **Papan:** catur 8×8 dengan susunan awal standar. Langkah legal, skak, skakmat, rokade, en passant, dan promosi pion menjadi ratu, benteng, gajah, atau kuda didukung; promosi pion AI otomatis menjadi ratu. Raja tidak bisa ditangkap; efek kartu tidak menghapus satu-satunya langkah legal untuk keluar dari skak.
- **Giliran:** pada giliran putih, pilih bidak lalu petak tujuan yang menyala. Skill umumnya bisa dipakai sebelum langkah catur dan tidak menggantikan langkah itu. **Relay Bidak** dan **Tumbal Pion** menghabiskan langkah. Setelah putih bergerak, AI membuat satu langkah hitam.
- **Kartu:** tangan berisi 3 kartu acak dari dek 37 kartu, tanpa duplikat dalam tangan. Tiga kartu **Joker** langka memiliki bobot tarik 0,2; kartu lain berbobot 1. Kartu yang selesai dipakai langsung diganti dari dek. Beberapa kartu butuh target di papan; ikuti status target, klik kartu aktif lagi atau tekan `Esc` untuk membatalkan. Pembatalan mengembalikan energinya.
- **Energi putih:** mulai **3/5**. Menangkap bidak memberi **+1 EN**; kapasitas maksimum 5. Biaya kartu tertera di kartu. Kartu yang tidak terjangkau energinya dinonaktifkan. Hanya **1 kartu 0 EN per giliran**.
- **Putar ulang:** putaran pertama seluruh tangan gratis; putaran kedua berbiaya **1 EN**. Batas dasar 2 putaran per giliran. **Kartu Keberuntungan** memberi 1 putaran tambahan, yang tetap berbiaya 1 EN.
- **Lawan:** energi hitam mulai **2/5** dengan kapasitas maksimum 5. AI bergantian menyiapkan **Perisai** dan **Gangguan**, lalu mencoba memakainya setelah langkah hitam dengan biaya 2 EN. Jika belum mampu, ia menahan rencana sambil mengisi energi. **Pajak Mantra** menaikkan biaya berikutnya menjadi 3 EN. Energi hitam bertambah saat menangkap dan saat skill belum dapat dipakai. Rencana dan energi lawan terlihat di panel telegraph.
- **Akhir pertandingan:** skakmat menang/kalah; kebuntuan remis. Tombol **Batalkan giliran** mengembalikan satu putaran putih-hitam, dan **Mulai ulang** memulai dari posisi awal.

## Dek skill (37 kartu)

Biaya tertulis dalam EN. Durasi seperti “langkah berikutnya” atau “balasan” hanya berlaku untuk kesempatan itu, lalu efek hilang.

### Serang — 10 kartu

| Kartu | Biaya | Efek |
|---|---:|---|
| Tempo Ganda | 3 | Tangkapan putih berikutnya memberi satu langkah putih tambahan. |
| Taktik Presisi | 1 | Tangkapan putih berikutnya memberi +1 EN ekstra. |
| Tanda Buru | 1 | Tandai bidak hitam selain raja; tangkap pada langkah putih berikutnya untuk +1 EN. |
| Tembus Perisai | 2 | Tangkapan putih berikutnya menembus Perisai hitam. Habis setelah satu langkah putih. |
| Pukulan Guntur | 2 | Jika langkah putih berikutnya memberi skak, kurangi 1 EN lawan. |
| Serbu Pion | 2 | Pion pilihan dapat menangkap lurus satu petak pada langkah berikutnya. |
| Gentar | 2 | Bidak hitam pilihan selain raja tidak dapat menangkap pada balasan berikutnya. |
| Tanda Pion | 0 | Tandai pion hitam; tangkap pada langkah putih berikutnya untuk +1 EN. |
| Gentar Pion | 0 | Pion hitam pilihan tidak dapat menangkap pada balasan berikutnya. |
| Jerat | 3 | Bidak hitam pilihan selain raja tidak dapat bergerak pada balasan berikutnya. |

### Bertahan — 6 kartu

| Kartu | Biaya | Efek |
|---|---:|---|
| Perisai Bidak | 2 | Lindungi bidak putih selain raja dari satu tangkapan lawan. |
| Tangkis Arus | 2 | Batalkan Gangguan aktif dan pulihkan 1 EN, atau siapkan pantulan untuk Gangguan berikutnya (+1 EN). |
| Balas Tusuk | 1 | Jika lawan menangkap pada balasan berikutnya, pulihkan 1 EN. |
| Bangkit Balik | 1 | Jika langkah hitam berikutnya memberi skak, pulihkan 2 EN. |
| Blokade | 2 | Tutup satu petak kosong; hitam tidak dapat mendarat di sana pada balasan berikutnya. |
| Tameng Pion | 0 | Lindungi satu pion putih dari satu tangkapan lawan. |

### Mantra — 11 kartu

| Kartu | Biaya | Efek |
|---|---:|---|
| Jejak Kuda | 2 | Bidak putih pilihan selain raja bergerak dengan pola kuda pada langkah berikutnya. |
| Kuras Inti | 2 | Kurangi 2 EN lawan; jika energinya di bawah 2, skill yang disiapkan tertunda. |
| Langkah Pion | 2 | Pion putih pilihan boleh maju 2 petak dari posisi mana pun pada langkah berikutnya. |
| Lintah Arkanum | 2 | Pada tangkapan berikutnya, curi 1 EN lawan jika tersedia dan pulihkan 1 EN. |
| Pajak Mantra | 1 | Skill lawan berikutnya berbiaya +1 EN. |
| Penawar | 2 | Batalkan skill/rencana lawan yang aktif; jika tidak ada, kurangi 1 EN lawan. |
| Relay Bidak | 3 | Tukar posisi dua bidak putih selain raja; menghabiskan langkah dan tidak boleh membiarkan raja skak. |
| Langkah Bayangan | 2 | Bidak putih pilihan selain raja berpindah ke petak kosong dalam radius 2, tanpa menangkap. |
| Prisma Gerak | 2 | Gajah atau benteng putih pilihan memakai pola gerak jenis lainnya pada langkah berikutnya. |
| Belok Benteng | 1 | Benteng putih pilihan juga boleh bergerak diagonal satu petak pada langkah berikutnya. |
| Denyut Pion | 0 | Jika langkah pion putih berikutnya memberi skak, kurangi 1 EN lawan. |

### Konsumsi — 7 kartu

| Kartu | Biaya | Efek |
|---|---:|---|
| Ransum Fokus | 1 | Pulihkan 2 EN, maksimal 5. |
| Fokus Cadangan | 1 | Skill berikutnya berbiaya 1 EN lebih murah, minimum 0. |
| Arus Sunyi | 1 | Jika langkah putih berikutnya bukan tangkapan, pulihkan 1 EN. |
| Rongsokan | 1 | Tangkapan sebelum giliran putih berikutnya memberi putih +1 EN. |
| Tumbal Pion | 1 | Korbankan pion putih untuk +3 EN; menghabiskan langkah dan tidak boleh membuka skak pada raja. |
| Kartu Keberuntungan | 1 | Tambahkan satu putaran tangan pada giliran ini; putaran tambahan tetap berbiaya 1 EN. |
| Napas Pion | 0 | Jika langkah putih berikutnya adalah pion tanpa tangkapan, pulihkan 1 EN. |

### Joker — 3 kartu langka

Semua Joker berbiaya dasar **5 EN**. Peluang tarik per kartu seperlima kartu biasa; tangan tetap tidak memiliki duplikat.

| Kartu | Biaya | Efek |
|---|---:|---|
| Kebangkitan Phoenix | 5 | Bangkitkan bidak putih non-ratu bernilai tertinggi yang gugur ke petak kosong di dua baris awal. Penempatan tidak boleh menghilangkan semua langkah untuk menyelamatkan raja. Efek ini tidak menggantikan langkah catur putih. |
| Lipatan Dimensi | 5 | Pilih bidak putih selain raja. Pada langkah catur berikutnya, bidak itu dapat berpindah ke petak kosong mana pun tanpa menangkap. Langkah tetap mengikuti aturan legal dan keselamatan raja. |
| Titah Pemusnah | 5 | Hapus satu bidak hitam selain raja dan ratu. Ini bukan tangkapan dan tidak memberi energi tangkapan. |

## AI, antarmuka, dan suara

AI memilih langkah legal dengan kecenderungan mengambil bidak, memberi skak, mempromosikan pion, dan rokade; ada unsur acak agar pola tidak selalu sama. Perisai AI melindungi bidak hitam bernilai tertinggi yang terancam (atau bidak tertinggi jika tidak ada ancaman). Gangguan menguras 1 EN putih setelah langkah putih berikutnya; **Tangkis Arus** dapat memantulkannya.

Kartu menampilkan jenis, biaya, deskripsi, dan status siap/aktif/terkunci. Efek aktif ditampilkan di bawah papan; riwayat langkah berada di kanan. Animasi kartu, langkah, dan tangkapan serta bunyi sintetis dapat dinikmati atau dimatikan dari tombol suara. Prototipe ini satu file HTML, berjalan lokal di browser, tanpa multiplayer atau penyimpanan pertandingan.

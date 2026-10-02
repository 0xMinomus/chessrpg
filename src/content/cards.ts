// Sumber data kartu tunggal (Fase 2 PLAN.md).
// Disalin verbatim dari `skillPool` di chess-rpg-dungeon.html (baris 988-1026).
// Aturan ekonomi (AGENTS.md): `cost` kartu dibayar dengan MANA, bukan EN.

export type CardKind = 'spell' | 'offense' | 'defense' | 'consumable' | 'joker';

export interface CardDef {
  readonly id: string;
  readonly name: string;
  /** Biaya dalam mana. */
  readonly cost: number;
  readonly kind: CardKind;
  readonly tag: string;
  readonly icon: string;
  readonly desc: string;
  /**
   * Bobot undian. Hanya kartu Joker yang mendefinisikannya di prototipe (0.2);
   * kartu lain memakai bobot default 1 (lihat `cardWeight`).
   */
  readonly weight?: number;
}

/** Bobot undian default untuk kartu non-Joker (prototipe: `skill.weight || 1`). */
export const CARD_DEFAULT_WEIGHT = 1;

/** Biaya dasar kartu Joker sebelum surcharge hero (FR-09; prototipe: cost 5). */
export const JOKER_BASE_COST = 5;

export function cardWeight(card: CardDef): number {
  return card.weight ?? CARD_DEFAULT_WEIGHT;
}

export const CARDS: readonly CardDef[] = [
  { id:'lancer', name:'Jejak kuda', cost:2, kind:'spell', tag:'Mantra', icon:'lancer', desc:'Pilih bidak selain raja. Langkah berikutnya mengikuti pola kuda.' },
  { id:'tempo', name:'Tempo ganda', cost:3, kind:'offense', tag:'Serang', icon:'tempo', desc:'Tangkapan putih berikutnya memberi satu langkah tambahan.' },
  { id:'ration', name:'Ransum fokus', cost:1, kind:'consumable', tag:'Konsumsi', icon:'ration', desc:'Pulihkan 2 EN. Kapasitas energi adalah 5.' },
  { id:'ward', name:'Perisai bidak', cost:2, kind:'defense', tag:'Bertahan', icon:'ward', desc:'Pilih bidak selain raja. Boss tidak dapat menangkapnya selama 2 balasan.' },
  { id:'disrupt', name:'Kuras inti', cost:2, kind:'spell', tag:'Mantra', icon:'disrupt', desc:'Kurangi 2 EN lawan. Di bawah 2 EN, skill tertunda.' },
  { id:'focus', name:'Taktik presisi', cost:1, kind:'offense', tag:'Serang', icon:'focus', desc:'Tangkapan putih berikutnya memulihkan 1 EN tambahan.' },
  { id:'pawnstep', name:'Langkah pion', cost:2, kind:'spell', tag:'Mantra', icon:'pawnstep', desc:'Pilih pion. Ia dapat maju 2 petak dari rank mana pun.' },
  { id:'mark', name:'Tanda buru', cost:1, kind:'offense', tag:'Serang', icon:'mark', desc:'Tandai bidak hitam. Menangkapnya sebelum giliran hitam memberi +1 EN.' },
  { id:'pierce', name:'Tembus perisai', cost:2, kind:'offense', tag:'Serang', icon:'pierce', desc:'Tangkapan berikutnya menembus Perisai lawan. Habis jika tidak menangkap.' },
  { id:'shock', name:'Pukulan guntur', cost:2, kind:'offense', tag:'Serang', icon:'shock', desc:'Langkah putih berikutnya yang memberi skak menguras 1 EN lawan.' },
  { id:'leech', name:'Lintah arkanum', cost:2, kind:'spell', tag:'Mantra', icon:'leech', desc:'Tangkapan berikutnya mencuri 1 EN lawan jika ia memilikinya.' },
  { id:'surcharge', name:'Pajak mantra', cost:1, kind:'spell', tag:'Mantra', icon:'surcharge', desc:'Skill lawan berikutnya berbiaya 1 EN lebih mahal.' },
  { id:'counterspell', name:'Penawar', cost:2, kind:'spell', tag:'Mantra', icon:'counterspell', desc:'Batalkan skill aktif dan rencana lawan. Jika kosong, kurangi 1 EN.' },
  { id:'parry', name:'Tangkis arus', cost:2, kind:'defense', tag:'Bertahan', icon:'parry', desc:'Jika Gangguan lawan aktif berikutnya, batalkan drain dan pulihkan 1 EN.' },
  { id:'riposte', name:'Balas tusuk', cost:1, kind:'defense', tag:'Bertahan', icon:'riposte', desc:'Jika lawan menangkap pada balasan berikutnya, pulihkan 1 EN.' },
  { id:'reserve', name:'Fokus cadangan', cost:1, kind:'consumable', tag:'Konsumsi', icon:'reserve', desc:'Kartu berikutnya berbiaya 1 mana lebih murah.' },
  { id:'quiet', name:'Arus sunyi', cost:1, kind:'consumable', tag:'Konsumsi', icon:'quiet', desc:'Jika langkah putih berikutnya bukan tangkapan, pulihkan 1 EN.' },
  { id:'lastLaugh', name:'Bangkit balik', cost:1, kind:'defense', tag:'Bertahan', icon:'lastLaugh', desc:'Jika langkah hitam berikutnya memberi skak, pulihkan 2 EN.' },
  { id:'salvage', name:'Rongsokan', cost:1, kind:'consumable', tag:'Konsumsi', icon:'salvage', desc:'Tangkapan sebelum giliranmu berikutnya memberi putih +1 EN.' },
  { id:'relay', name:'Relay bidak', cost:3, kind:'spell', tag:'Mantra', icon:'relay', desc:'Tukar posisi dua bidak putih selain raja. Menghabiskan langkah.' },
  { id:'phase', name:'Langkah bayangan', cost:2, kind:'spell', tag:'Mantra', icon:'phase', desc:'Pilih bidak. Pindah ke petak kosong dalam jarak 2, tanpa menangkap.' },
  { id:'prism', name:'Prisma gerak', cost:2, kind:'spell', tag:'Mantra', icon:'prism', desc:'Pilih gajah atau benteng. Langkah berikutnya memakai pola yang lain.' },
  { id:'pawnraid', name:'Serbu pion', cost:2, kind:'offense', tag:'Serang', icon:'pawnraid', desc:'Pilih pion. Ia dapat menangkap lurus satu petak pada langkah berikutnya.' },
  { id:'rookbend', name:'Belok benteng', cost:1, kind:'spell', tag:'Mantra', icon:'rookbend', desc:'Pilih benteng. Langkah berikutnya juga boleh diagonal satu petak.' },
  { id:'stagger', name:'Gentar', cost:2, kind:'offense', tag:'Serang', icon:'stagger', desc:'Bidak hitam pilihanmu tak dapat menangkap pada balasan berikutnya.' },
  { id:'snare', name:'Jerat', cost:3, kind:'offense', tag:'Serang', icon:'snare', desc:'Bidak hitam pilihanmu tak dapat bergerak selama 2 balasan boss.' },
  { id:'sacrifice', name:'Tumbal pion', cost:1, kind:'consumable', tag:'Konsumsi', icon:'sacrifice', desc:'Korbankan satu pion putih untuk memulihkan 3 EN. Memakai langkah.' },
  { id:'blockade', name:'Blokade', cost:2, kind:'defense', tag:'Bertahan', icon:'blockade', desc:'Pilih petak kosong. Lawan tak dapat mendarat di sana selama 2 balasan boss.' },
  { id:'fortune', name:'Kartu keberuntungan', cost:1, kind:'consumable', tag:'Konsumsi', icon:'fortune', desc:'Tambahkan satu putar ulang. Putaran ekstra tetap berbiaya 1 EN.' },
  { id:'pawnBreath', name:'Napas pion', cost:0, kind:'consumable', tag:'Konsumsi', icon:'quiet', desc:'Pulihkan 1 EN jika langkah putih berikutnya adalah pion tanpa tangkapan.' },
  { id:'pawnGuard', name:'Tameng pion', cost:0, kind:'defense', tag:'Bertahan', icon:'ward', desc:'Pilih pion putih. Boss tidak dapat menangkapnya selama 2 balasan.' },
  { id:'pawnMark', name:'Tanda pion', cost:0, kind:'offense', tag:'Serang', icon:'mark', desc:'Tandai pion hitam. Tangkap pada langkah putih berikutnya untuk +1 EN.' },
  { id:'pawnStagger', name:'Gentar pion', cost:0, kind:'offense', tag:'Serang', icon:'stagger', desc:'Pilih pion hitam. Ia tak dapat menangkap pada balasan berikutnya.' },
  { id:'pawnPulse', name:'Denyut pion', cost:0, kind:'spell', tag:'Mantra', icon:'shock', desc:'Jika pion putih memberi skak pada langkah berikutnya, kurangi 1 EN lawan.' },
  { id:'phoenix', name:'Kebangkitan Phoenix', cost:5, kind:'joker', tag:'Joker', icon:'salvage', weight:0.2, desc:'Bangkitkan bidak putih non-ratu bernilai tertinggi yang gugur ke petak kosong di dua baris awal, tanpa menghilangkan jalan keluar dari skak.' },
  { id:'fold', name:'Lipatan Dimensi', cost:5, kind:'joker', tag:'Joker', icon:'phase', weight:0.2, desc:'Pilih bidak putih selain raja. Pada langkah berikutnya, bidak itu dapat berpindah ke petak kosong mana pun tanpa menangkap.' },
  { id:'edict', name:'Titah Pemusnah', cost:5, kind:'joker', tag:'Joker', icon:'shock', weight:0.2, desc:'Hapus satu bidak hitam selain raja dan ratu. Ini bukan tangkapan.' },
];

export const cardById: Readonly<Record<string, CardDef>> = Object.fromEntries(
  CARDS.map(function(card) { return [card.id, card]; }),
);

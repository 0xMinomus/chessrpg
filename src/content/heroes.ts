// Sumber data hero tunggal (Fase 2 PLAN.md).
// Disalin verbatim dari `heroRoster` di chess-rpg-dungeon.html (baris 1028-1035).
// Aturan ekonomi (AGENTS.md): skill/ultimate hero dibayar dengan EN, bukan mana.

/** Biaya EN untuk skill hero (prototipe: HERO_SKILL_ENERGY_COST = 2). */
export const HERO_SKILL_ENERGY_COST = 2;
/** Biaya EN untuk ultimate hero (prototipe: HERO_ULTIMATE_ENERGY_COST = 5). */
export const HERO_ULTIMATE_ENERGY_COST = 5;
/**
 * Kapasitas EN putih (prototipe memakai literal 5 di semua clamp `Math.min(5, ...)`).
 */
export const EN_CAP = 5;
/**
 * Kapasitas mana (prototipe: HERO_MANA_CAP = 6; diganti nama sesuai spesifikasi
 * migrasi, nilainya tidak berubah).
 */
export const MANA_CAP = 6;

export interface HeroDef {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly startEnergy: number;
  readonly skillName: string;
  readonly skillDescription: string;
  readonly ultimateName: string;
  readonly ultimateDescription: string;
  readonly strength: string;
  readonly weakness: string;
  readonly skillAction: string;
  readonly ultimateAction: string;
  readonly portrait: string;
  /** Bonus EN tiap tangkapan (Bara). Tidak ada = aturan default domain battle. */
  readonly captureBonus?: number;
  /** Surcharge kartu Serang (Nila). */
  readonly offenseSurcharge?: number;
  /** Surcharge kartu Joker (Saka). */
  readonly jokerSurcharge?: number;
  /**
   * EN yang dipulihkan tiap tangkapan; 0 berarti tangkapan tidak memulihkan EN
   * (Veyra). Tidak ada = aturan default domain battle.
   */
  readonly captureEnergy?: number;
}

export const HEROES: readonly HeroDef[] = [
  { id:'arunika', name:'Arunika', role:'Penjelajah Rembulan', startEnergy:4, skillName:'Pergeseran Rembulan', skillDescription:'Pilih bidak putih non-raja; ia dapat berpindah sampai 2 petak ke petak kosong.', ultimateName:'Gerbang Lintas', ultimateDescription:'Pilih bidak putih non-raja untuk berpindah ke petak kosong mana pun.', strength:'Mulai pertarungan dengan 4 EN.', weakness:'Skill uniknya membutuhkan 2 EN.', skillAction:'phase', ultimateAction:'fold', portrait:'arunika' },
  { id:'bara', name:'Bara', role:'Pemecah Garis', startEnergy:2, skillName:'Nyala Pemburu', skillDescription:'Tangkapan berikutnya memulihkan 1 EN tambahan.', ultimateName:'Titah Bara', ultimateDescription:'Hapus satu bidak hitam selain raja dan ratu tanpa menghitungnya sebagai tangkapan.', strength:'Tangkapan memulihkan 1 EN tambahan.', weakness:'Memulai pertarungan dengan 2 EN.', skillAction:'focus', ultimateAction:'smite', portrait:'bara', captureBonus:1 },
  { id:'nila', name:'Nila', role:'Penjaga Embun', startEnergy:3, skillName:'Embun Pelindung', skillDescription:'Pilih satu bidak putih non-raja. Boss tidak dapat menangkapnya selama 2 balasan.', ultimateName:'Mata Air', ultimateDescription:'Lindungi semua bidak putih dari satu balasan boss.', strength:'Membatalkan Gangguan pertama yang menguras EN.', weakness:'Kartu Serang berbiaya 1 EN tambahan.', skillAction:'ward', ultimateAction:'aegis', portrait:'nila', offenseSurcharge:1 },
  { id:'saka', name:'Saka', role:'Taktisi Pion', startEnergy:3, skillName:'Langkah Pelopor', skillDescription:'Pilih pion putih agar dapat maju dua petak dari posisi mana pun.', ultimateName:'Pawai Bidak', ultimateDescription:'Semua pion putih dapat maju dua petak dari posisinya pada langkah berikutnya.', strength:'Langkah pion memulihkan 1 EN.', weakness:'Kartu Joker berbiaya 1 EN tambahan.', skillAction:'pawnstep', ultimateAction:'pawnrush', portrait:'saka', jokerSurcharge:1 },
  { id:'veyra', name:'Veyra', role:'Pengikat Waktu', startEnergy:3, skillName:'Jerat Senyap', skillDescription:'Bidak hitam pilihan tidak dapat bergerak selama 2 balasan boss.', ultimateName:'Saat Beku', ultimateDescription:'Lewati satu balasan boss setelah langkah putih berikutnya.', strength:'Jerat menahan seluruh langkah bidak target selama 2 balasan boss.', weakness:'Tangkapan tidak memulihkan EN.', skillAction:'snare', ultimateAction:'skip', portrait:'veyra', captureEnergy:0 },
  { id:'liora', name:'Liora', role:'Penjaga Benteng', startEnergy:3, skillName:'Segel Petak', skillDescription:'Pilih satu petak kosong. Boss tidak dapat mendarat di sana selama 2 balasan boss.', ultimateName:'Benteng Prisma', ultimateDescription:'Pilih petak kosong untuk membentuk blokade silang pada petak itu dan hingga empat petak kosong di sisinya selama 2 balasan boss.', strength:'Dapat menutup hingga lima petak pendaratan boss sekaligus selama 2 balasan.', weakness:'Blokade membutuhkan petak kosong.', skillAction:'blockade', ultimateAction:'citadel', portrait:'liora' },
];

export function heroById(id: string): HeroDef {
  return HEROES.find(function(hero) { return hero.id === id; }) ?? HEROES[0];
}

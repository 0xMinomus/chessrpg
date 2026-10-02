// Sumber data boss tunggal (Fase 2 PLAN.md).
// Disalin verbatim dari `bossRoster` di chess-rpg-dungeon.html (baris 1039-1043).

export type BossRuleKey = 'shield' | 'drain' | 'seal';

export interface BossDef {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly subtitle: string;
  readonly description: string;
  readonly rule: string;
  readonly ruleKey: BossRuleKey;
  /** Hadiah koin untuk kemenangan pertama atas boss ini. */
  readonly reward: number;
}

export const BOSSES: readonly BossDef[] = [
  { id:'bastion', name:'Pengawal Bastion', glyph:'♜', subtitle:'Lantai 01 / Penjaga', description:'Benteng tua yang menukar baja dengan waktu.', rule:'Perisai berpindah ke bidak hitam terkuat setelah setiap balasan.', ruleKey:'shield', reward:15 },
  { id:'ash', name:'Pemangsa Abu', glyph:'♛', subtitle:'Lantai 02 / Penguras', description:'Ratu abu menyalakan Gangguan setelah setiap balasan.', rule:'Langkah putih berikutnya kehilangan 1 EN.', ruleKey:'drain', reward:20 },
  { id:'rift', name:'Peramal Retakan', glyph:'♞', subtitle:'Lantai 03 / Pengunci', description:'Peramal meretakkan papan dan menyegel satu petak kosong.', rule:'Satu petak kosong terkunci untuk langkah putih berikutnya.', ruleKey:'seal', reward:25 },
];

export function bossById(id: string): BossDef {
  return BOSSES.find(function(boss) { return boss.id === id; }) ?? BOSSES[0];
}

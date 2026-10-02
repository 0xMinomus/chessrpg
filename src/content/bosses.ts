// Data boss campaign; efek tiap rule dijalankan oleh domain battle.

export type BossRuleKey =
  | 'shield'
  | 'drain'
  | 'seal'
  | 'mana-tax'
  | 'capture-leech'
  | 'snare'
  | 'card-silence'
  | 'hero-silence'
  | 'blight'
  | 'rally';

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
  { id:'bastion', name:'Pengawal Bastion', glyph:'♜', subtitle:'Boss Chapter 01', description:'Benteng tua yang menukar baja dengan waktu.', rule:'Perisai berpindah ke bidak hitam terkuat setelah setiap balasan.', ruleKey:'shield', reward:15 },
  { id:'ash', name:'Pemangsa Abu', glyph:'♛', subtitle:'Boss Chapter 02', description:'Ratu abu menyalakan Gangguan setelah setiap balasan.', rule:'Langkah putih berikutnya kehilangan 1 EN.', ruleKey:'drain', reward:20 },
  { id:'rift', name:'Peramal Retakan', glyph:'♞', subtitle:'Boss Chapter 03', description:'Peramal meretakkan papan dan menyegel satu petak kosong.', rule:'Satu petak kosong terkunci untuk langkah putih berikutnya.', ruleKey:'seal', reward:25 },
  { id:'cinder', name:'Jenderal Bara', glyph:'♝', subtitle:'Boss Chapter 04', description:'Jenderal bara membakar persediaan mana di akhir balasannya.', rule:'Kurangi 1 mana setelah balasan boss.', ruleKey:'mana-tax', reward:30 },
  { id:'mire', name:'Lintah Rawa', glyph:'♜', subtitle:'Boss Chapter 05', description:'Lintah rawa tumbuh kuat setiap kali bidakmu tertangkap.', rule:'Saat menangkap bidak putih, pulihkan 1 EN boss dan kurangi 1 EN putih.', ruleKey:'capture-leech', reward:35 },
  { id:'wraith', name:'Penjaga Jerat', glyph:'♞', subtitle:'Boss Chapter 06', description:'Penjaga jerat menahan satu bidak putih pada giliran berikutnya.', rule:'Kunci gerak satu bidak putih non-raja selama satu giliran.', ruleKey:'snare', reward:40 },
  { id:'oracle', name:'Siren Senyap', glyph:'♛', subtitle:'Boss Chapter 07', description:'Siren senyap meredam kartu skill pada giliran berikutnya.', rule:'Kartu skill tidak dapat dimainkan selama satu giliran putih.', ruleKey:'card-silence', reward:45 },
  { id:'tempest', name:'Orakel Patah', glyph:'♝', subtitle:'Boss Chapter 08', description:'Orakel memutus hubungan hero dengan skill dan ultimate-nya.', rule:'Skill dan ultimate hero terkunci selama satu giliran putih.', ruleKey:'hero-silence', reward:50 },
  { id:'blight', name:'Ratu Pembusuk', glyph:'♜', subtitle:'Boss Chapter 09', description:'Ratu pembusuk merusak aliran mana setelah setiap balasan.', rule:'Langkah putih berikutnya tidak menghasilkan mana.', ruleKey:'blight', reward:55 },
  { id:'eclipse', name:'Raja Gerhana', glyph:'♚', subtitle:'Boss Chapter 10', description:'Raja gerhana mengumpulkan energi tiap kali membalas.', rule:'Boss memperoleh 1 EN tambahan setelah setiap balasan.', ruleKey:'rally', reward:60 },
];


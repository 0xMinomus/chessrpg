import { BOSSES, type BossRuleKey } from './bosses.ts';

export type MapRegion = 'west' | 'north' | 'east' | 'central' | 'inner-east' | 'south';

export interface DungeonChapterDef {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly area: MapRegion;
  readonly mapPosition: { readonly x: number; readonly y: number };
  readonly bossId: string;
}

export interface DungeonFloorDef {
  readonly id: string;
  readonly chapterId: string;
  readonly chapterNumber: number;
  readonly floorNumber: number;
  readonly name: string;
  readonly glyph: string;
  readonly subtitle: string;
  readonly description: string;
  readonly rule: string;
  readonly ruleKey: BossRuleKey | 'none';
  readonly reward: number;
  readonly isBoss: boolean;
}

export const CHAPTERS: readonly DungeonChapterDef[] = [
  { id: 'chapter-01', number: 1, name: 'Benteng Bastion', area: 'west', mapPosition: { x: 15, y: 40 }, bossId: 'bastion' },
  { id: 'chapter-02', number: 2, name: 'Kuil Abu', area: 'west', mapPosition: { x: 26, y: 75 }, bossId: 'ash' },
  { id: 'chapter-03', number: 3, name: 'Puncak Embun', area: 'north', mapPosition: { x: 54, y: 17 }, bossId: 'rift' },
  { id: 'chapter-04', number: 4, name: 'Kawah Bara', area: 'north', mapPosition: { x: 71, y: 18 }, bossId: 'cinder' },
  { id: 'chapter-05', number: 5, name: 'Hutan Akar', area: 'east', mapPosition: { x: 90, y: 25 }, bossId: 'mire' },
  { id: 'chapter-06', number: 6, name: 'Retakan Tengah', area: 'east', mapPosition: { x: 90, y: 70 }, bossId: 'wraith' },
  { id: 'chapter-07', number: 7, name: 'Menara Senyap', area: 'central', mapPosition: { x: 45, y: 50 }, bossId: 'oracle' },
  { id: 'chapter-08', number: 8, name: 'Kepulauan Kabut', area: 'central', mapPosition: { x: 63, y: 58 }, bossId: 'tempest' },
  { id: 'chapter-09', number: 9, name: 'Teluk Pualam', area: 'inner-east', mapPosition: { x: 81, y: 45 }, bossId: 'blight' },
  { id: 'chapter-10', number: 10, name: 'Rimba Selatan', area: 'south', mapPosition: { x: 51, y: 86 }, bossId: 'eclipse' },
];

const ENCOUNTER_NAMES = ['Penjaga', 'Patroli', 'Pengawal', 'Komandan'] as const;
const ENCOUNTER_GLYPHS = ['♟', '♞', '♝', '♜'] as const;

function makeChapterFloors(chapter: DungeonChapterDef): DungeonFloorDef[] {
  const floors: DungeonFloorDef[] = [];
  const boss = BOSSES.find((candidate) => candidate.id === chapter.bossId);
  if (!boss) throw new Error('Boss chapter tidak ditemukan: ' + chapter.bossId);

  for (let floorNumber = 1; floorNumber <= 4; floorNumber += 1) {
    const encounterIndex = floorNumber - 1;
    floors.push({
      id: chapter.id + '-floor-0' + floorNumber,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      floorNumber,
      name: ENCOUNTER_NAMES[encounterIndex],
      glyph: ENCOUNTER_GLYPHS[encounterIndex],
      subtitle: 'Lantai 0' + floorNumber + ' / 05',
      description: 'Tembus barisan ' + chapter.name + ' dan lindungi raja putih.',
      rule: 'Pertarungan catur standar tanpa skill khusus boss.',
      ruleKey: 'none',
      reward: 5,
      isBoss: false,
    });
  }

  floors.push({
    id: boss.id,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    floorNumber: 5,
    name: boss.name,
    glyph: boss.glyph,
    subtitle: 'Lantai 05 / Boss',
    description: boss.description,
    rule: boss.rule,
    ruleKey: boss.ruleKey,
    reward: boss.reward,
    isBoss: true,
  });
  return floors;
}

export const DUNGEON_FLOORS: readonly DungeonFloorDef[] = CHAPTERS.flatMap(makeChapterFloors);
export const FLOOR_IDS: readonly string[] = DUNGEON_FLOORS.map((floor) => floor.id);
export const LEGACY_BOSS_IDS: readonly string[] = BOSSES.slice(0, 3).map((boss) => boss.id);

const floorsById: Record<string, DungeonFloorDef> = {};
for (const floor of DUNGEON_FLOORS) floorsById[floor.id] = floor;
export const DUNGEON_FLOOR_BY_ID: Readonly<Record<string, DungeonFloorDef>> = floorsById;

export interface ChapterMapItem {
  id: string;
  number: number;
  name: string;
  areaLabel: string;
  x: number;
  y: number;
  unlocked: boolean;
  cleared: boolean;
  clearedFloorCount: number;
  selected: boolean;
}

export interface FloorListItem {
  id: string;
  chapterNumber: number;
  floorNumber: number;
  name: string;
  glyph: string;
  subtitle: string;
  reward: number;
  unlocked: boolean;
  cleared: boolean;
  selected: boolean;
  description: string;
  rule: string;
  isBoss: boolean;
  lockReason: string;
}

export interface DungeonPageView {
  chapters: ChapterMapItem[];
  selectedChapter: ChapterMapItem;
  floors: FloorListItem[];
  detail: FloorListItem;
  deckReady?: boolean;
}

function chapterState(chapter: ChapterMapItem): string {
  if (chapter.cleared) return 'Selesai';
  if (chapter.unlocked) return 'Terbuka';
  return 'Terkunci';
}

function floorState(floor: FloorListItem): string {
  if (floor.cleared) return 'Selesai';
  if (floor.unlocked) return 'Terbuka';
  return 'Terkunci';
}

export function renderChapterMapMarkers(chapters: ChapterMapItem[]): string {
  return chapters
    .map(function (chapter) {
      return (
        '<button class="dungeon-map-marker chapter-map-marker' +
        (chapter.selected ? ' selected' : '') +
        (chapter.cleared ? ' defeated' : '') +
        (chapter.unlocked ? '' : ' locked') +
        '" type="button" data-command="select-chapter" data-chapter-id="' +
        chapter.id +
        '" style="--map-x:' +
        chapter.x +
        '%;--map-y:' +
        chapter.y +
        '%" aria-label="Chapter ' +
        String(chapter.number).padStart(2, '0') +
        ', ' +
        chapter.name +
        ', ' +
        chapter.areaLabel +
        ', ' +
        chapterState(chapter) +
        '" aria-pressed="' +
        String(chapter.selected) +
        '">' +
        String(chapter.number).padStart(2, '0') +
        '</button>'
      );
    })
    .join('');
}

export function renderFloorList(floors: FloorListItem[]): string {
  return floors
    .map(function (floor) {
      const state = floorState(floor);
      return (
        '<button class="floor-node' +
        (floor.selected ? ' selected' : '') +
        (floor.cleared ? ' cleared' : '') +
        (floor.unlocked ? '' : ' locked') +
        (floor.isBoss ? ' boss-floor' : '') +
        '" type="button" data-command="select-floor" data-floor-id="' +
        floor.id +
        '" aria-label="Lantai ' +
        String(floor.floorNumber).padStart(2, '0') +
        ', ' +
        floor.name +
        ', ' +
        state +
        '" aria-pressed="' +
        String(floor.selected) +
        '">' +
        '<span class="floor-node-index">' +
        String(floor.floorNumber).padStart(2, '0') +
        '</span><span class="boss-glyph floor-node-glyph" aria-hidden="true">' +
        floor.glyph +
        '</span><span class="floor-node-copy"><strong>' +
        floor.name +
        '</strong><small>' +
        (floor.isBoss ? 'Boss · ' : '') +
        floor.reward +
        ' koin</small></span><span class="floor-node-state">' +
        state +
        '</span></button>'
      );
    })
    .join('');
}

export function renderFloorDetail(floor: FloorListItem, deckReady = true): string {
  const state = floorState(floor);
  const actionLabel = !floor.unlocked
    ? 'Selesaikan prasyarat'
    : !deckReady
      ? 'Lengkapi deck'
      : floor.cleared
        ? 'Ulangi lantai'
        : 'Mulai lantai';
  const command = floor.unlocked && !deckReady ? 'open-deck' : 'start-floor';
  return (
    '<div class="floor-detail-heading"><span class="eyebrow">Chapter ' +
    String(floor.chapterNumber).padStart(2, '0') +
    ' · Lantai ' +
    String(floor.floorNumber).padStart(2, '0') +
    '</span><span class="floor-detail-state">' +
    state +
    '</span></div>' +
    '<div class="floor-detail-identity"><span class="boss-glyph floor-detail-glyph" aria-hidden="true">' +
    floor.glyph +
    '</span><div><span class="feature-kicker">' +
    (floor.isBoss ? 'Boss chapter' : 'Pertarungan standar') +
    '</span><h3>' +
    floor.name +
    '</h3></div></div><p>' +
    floor.description +
    '</p><p class="boss-rule"><strong>' +
    (floor.isBoss ? 'Skill unik boss:' : 'Aturan:') +
    '</strong> ' +
    floor.rule +
    '</p>' +
    (floor.lockReason
      ? '<p class="floor-lock-reason">' + floor.lockReason + '</p>'
      : '') +
    '<div class="floor-detail-facts"><div><span>Hadiah clear pertama</span><strong>' +
    floor.reward +
    ' koin</strong></div><div><span>Status</span><strong>' +
    state +
    '</strong></div></div>' +
    '<button class="hub-button primary" type="button" data-command="' +
    command +
    '" data-floor-id="' +
    floor.id +
    '" aria-label="' +
    actionLabel +
    ' ' +
    floor.name +
    '"' +
    (floor.unlocked ? '' : ' disabled') +
    '>' +
    actionLabel +
    '</button>'
  );
}

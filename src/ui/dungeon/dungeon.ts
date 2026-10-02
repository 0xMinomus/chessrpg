// Komponen dungeon: daftar boss terkunci/terbuka + detail aturan + mulai duel.
// Status kunci dihitung pemanggil dari progres kampanye.

export interface BossListItem {
  id: string;
  name: string;
  glyph: string;
  subtitle: string;
  reward: number;
  unlocked: boolean;
  defeated: boolean;
  selected: boolean;
}

export interface BossDetailView extends BossListItem {
  description: string;
  rule: string;
}

const BOSS_MAP_POSITIONS: Record<string, { x: number; y: number }> = {
  bastion: { x: 18, y: 40 },
  ash: { x: 48, y: 82 },
  rift: { x: 50, y: 53 },
};

function bossState(item: BossListItem): string {
  if (item.defeated) return 'Selesai';
  if (item.unlocked) return 'Terbuka';
  return 'Terkunci';
}

export function renderBossMapMarkers(items: BossListItem[]): string {
  return items
    .map(function (boss, index) {
      const position = BOSS_MAP_POSITIONS[boss.id];
      if (!position) return '';
      const state = bossState(boss);
      return (
        '<button class="dungeon-map-marker' +
        (boss.selected ? ' selected' : '') +
        (boss.defeated ? ' defeated' : '') +
        '" type="button" data-command="select-boss" data-boss-id="' +
        boss.id +
        '" style="--map-x:' +
        position.x +
        '%;--map-y:' +
        position.y +
        '%" aria-label="' +
        boss.name +
        ', ' +
        state +
        '" aria-pressed="' +
        String(boss.selected) +
        '"' +
        (boss.unlocked ? '' : ' disabled') +
        '>' +
        String(index + 1).padStart(2, '0') +
        '</button>'
      );
    })
    .join('');
}

export function renderBossList(items: BossListItem[]): string {
  return items
    .map(function (boss) {
      const state = bossState(boss);
      return (
        '<button class="boss-node' +
        (boss.selected ? ' selected' : '') +
        '" type="button" data-command="select-boss" data-boss-id="' +
        boss.id +
        '" aria-label="' +
        boss.name +
        ', ' +
        boss.subtitle +
        ', ' +
        state +
        '" aria-pressed="' +
        String(boss.selected) +
        '"' +
        (boss.unlocked ? '' : ' disabled') +
        '>' +
        '<span class="boss-glyph" aria-hidden="true">' +
        boss.glyph +
        '</span>' +
        '<span><strong>' +
        boss.name +
        '</strong><small>' +
        boss.subtitle +
        ' · Hadiah ' +
        boss.reward +
        ' koin</small></span>' +
        '<span class="boss-node-state">' +
        state +
        '</span></button>'
      );
    })
    .join('');
}

export function renderBossDetail(boss: BossDetailView, deckReady = true): string {
  const canStart = boss.unlocked;
  const actionLabel = !deckReady && boss.unlocked
    ? 'Lengkapi deck'
    : boss.defeated
      ? 'Ulangi lantai'
      : boss.unlocked
        ? 'Mulai pertarungan'
        : 'Kalahkan boss sebelumnya';
  const state = boss.defeated ? 'Selesai' : boss.unlocked ? 'Terbuka' : 'Terkunci';
  return (
    '<div class="boss-detail-heading"><span class="eyebrow">Detail dungeon</span><span class="boss-detail-state">' +
    state +
    '</span></div>' +
    '<div class="boss-detail-identity"><span class="boss-glyph" aria-hidden="true">' +
    boss.glyph +
    '</span><div>' +
    '<span class="feature-kicker">' +
    boss.subtitle +
    '</span><h3>' +
    boss.name +
    '</h3></div></div><p>' +
    boss.description +
    '</p>' +
    '<p class="boss-rule"><strong>Keunikan:</strong> ' +
    boss.rule +
    '</p><div class="boss-detail-facts"><div><span>Hadiah penyelesaian</span><strong>' +
    boss.reward +
    ' koin</strong></div><div><span>Status</span><strong>' +
    state +
    '</strong></div></div>' +
    '<button class="hub-button primary" type="button" data-command="' +
    (deckReady ? 'start-boss' : boss.unlocked ? 'open-deck' : 'start-boss') +
    '" aria-label="' +
    actionLabel +
    ' melawan ' +
    boss.name +
    '"' +
    (canStart ? '' : ' disabled') +
    '>' +
    actionLabel +
    '</button>'
  );
}

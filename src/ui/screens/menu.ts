// Layar beranda: progres lantai, boss berikutnya, hero aktif, navigasi.

import { renderBossMapMarkers } from '../dungeon/dungeon.ts';

export interface MenuHeroSummary {
  id: string;
  name: string;
  role: string;
  portrait: string;
  skillName: string;
  skillDescription: string;
  ultimateName: string;
  ultimateDescription: string;
  strength: string;
  weakness: string;
}

export interface MenuBossSummary {
  name: string;
  description: string;
  rule: string;
}

export interface MenuFloorSummary {
  id: string;
  name: string;
  glyph: string;
  subtitle: string;
  reward: number;
  unlocked: boolean;
  defeated: boolean;
  selected: boolean;
  description: string;
  rule: string;
}

export interface MenuView {
  coins: number;
  clearedCount: number;
  totalFloors: number;
  allCleared: boolean;
  nextBoss: MenuBossSummary;
  selectedBoss: MenuFloorSummary;
  lastClearedBoss: MenuFloorSummary | null;
  floorProgress: MenuFloorSummary[];
  activeHero: MenuHeroSummary;
  heroCount: number;
  cardCount: number;
}

export function renderMenuPage(view: MenuView): string {
  const selectedBoss = view.selectedBoss;
  const selectedBossState = selectedBoss.defeated
    ? 'Selesai'
    : selectedBoss.unlocked
      ? 'Terbuka'
      : 'Terkunci';
  const floorProgress = view.floorProgress
    .map(function (floor) {
      const state = floor.defeated ? 'Selesai' : floor.unlocked ? 'Terbuka' : 'Terkunci';
      return (
        '<button class="home-floor-step' +
        (floor.selected ? ' selected' : '') +
        '" type="button" data-command="select-boss" data-boss-id="' +
        floor.id +
        '" aria-label="Pilih ' +
        floor.name +
        ', ' +
        state +
        ', hadiah ' +
        floor.reward +
        ' koin" aria-pressed="' +
        String(floor.selected) +
        '"' +
        (floor.unlocked ? '' : ' disabled') +
        '><span class="home-floor-glyph" aria-hidden="true">' +
        floor.glyph +
        '</span><span class="home-floor-copy"><small>' +
        floor.subtitle +
        '</small><strong>' +
        floor.name +
        '</strong></span><small class="home-floor-state">' +
        state +
        '</small><small class="home-floor-reward">Hadiah ' +
        floor.reward +
        ' koin</small></button>'
      );
    })
    .join('');
  const lastRun = view.lastClearedBoss
    ? '<div class="home-last-run-boss"><span class="home-floor-glyph" aria-hidden="true">' +
      view.lastClearedBoss.glyph +
      '</span><div><strong>' +
      view.lastClearedBoss.name +
      '</strong><small>' +
      view.lastClearedBoss.subtitle +
      ' · Selesai</small></div></div><div class="home-last-run-reward"><span>Hadiah diperoleh</span><strong>' +
      view.lastClearedBoss.reward +
      ' koin</strong></div>'
    : '<div class="home-last-run-empty"><span class="home-run-mark" aria-hidden="true">◇</span><strong>Belum ada lantai selesai</strong><p>Tantangan berikutnya: ' +
      selectedBoss.name +
      ' · ' +
      selectedBoss.subtitle +
      '</p><div class="home-last-run-reward"><span>Hadiah clear pertama</span><strong>' +
      selectedBoss.reward +
      ' koin</strong></div></div>';
  const campaignFacts = [
    { mark: '♜', label: 'Penjaga', value: view.totalFloors + ' lantai', note: 'Tantangan menara' },
    { mark: '♙', label: 'Hero', value: view.heroCount + ' tersedia', note: 'Semua terbuka untuk diuji' },
    { mark: '✦', label: 'Kartu', value: view.cardCount + ' kartu', note: 'Koleksi skill dungeon' },
    { mark: 'M', label: 'Mana', value: 'Untuk kartu', note: 'Pulih setelah langkah putih' },
    { mark: 'EN', label: 'Energi', value: 'Untuk hero', note: 'Skill dan ultimate' },
    { mark: '◈', label: 'Hadiah boss', value: selectedBoss.reward + ' koin', note: 'Hadiah clear pertama' },
  ]
    .map(function (fact) {
      return (
        '<div class="home-campaign-fact"><span class="home-fact-mark" aria-hidden="true">' +
        fact.mark +
        '</span><div><small>' +
        fact.label +
        '</small><strong>' +
        fact.value +
        '</strong><span>' +
        fact.note +
        '</span></div></div>'
      );
    })
    .join('');
  return (
    '<section class="hub-page home-page" aria-labelledby="hub-home-title">' +
    '<div class="hub-page-heading home-page-heading"><div><span class="eyebrow">Perjalanan berikutnya</span>' +
    '<h2 id="hub-home-title">' +
    (view.allCleared ? 'Menara ditaklukkan' : 'Menara menunggu.') +
    '</h2>' +
    '<p>' +
    (view.allCleared
      ? 'Semua lantai telah ditaklukkan. Ulangi lantai mana pun untuk bertarung kembali.'
      : 'Pilih hero, kalahkan ' + view.totalFloors + ' lantai, dan raih hadiah.') +
    '</p></div></div>' +
    '<div class="home-dashboard">' +
    '<section class="home-world-panel hub-frame" aria-label="Peta dunia dan boss terpilih"><div class="home-world-map">' +
    '<img class="home-world-image" src="/assets/broken-crescent-pixel-map.png" alt="Peta pixel-art Broken Crescent dengan pulau dan jalur antardaerah." width="1254" height="1254" />' +
    '<div class="dungeon-map-markers" role="group" aria-label="Pilih boss pada peta">' +
    renderBossMapMarkers(view.floorProgress) +
    '</div></div><article class="home-selected-boss"><div class="home-selected-heading"><span class="eyebrow">Menara terpilih</span><span class="home-boss-state">' +
    selectedBossState +
    '</span></div><div class="home-selected-identity"><span class="home-selected-glyph" aria-hidden="true">' +
    selectedBoss.glyph +
    '</span><div><small>' +
    selectedBoss.subtitle +
    '</small><h3>' +
    selectedBoss.name +
    '</h3></div></div><p class="home-selected-description">' +
    selectedBoss.description +
    '</p><div class="home-selected-rule"><span>Keunikan</span><p>' +
    selectedBoss.rule +
    '</p></div><div class="home-selected-reward"><span>Hadiah clear pertama</span><strong>' +
    selectedBoss.reward +
    ' koin</strong></div><button class="hub-button primary" type="button" data-command="nav" data-screen="dungeon">Buka peta dungeon</button></article></section>' +
    '<section class="home-hero-panel hub-frame" aria-labelledby="home-hero-title"><div class="home-panel-heading"><span class="eyebrow" id="home-hero-title">Hero terpilih</span></div>' +
    '<div class="home-hero-identity"><span class="hero-face home-hero-face" data-portrait="' +
    view.activeHero.portrait +
    '" role="img" aria-label="Potret ' +
    view.activeHero.name +
    '"></span><div class="home-hero-summary"><span class="feature-kicker">Hero aktif</span><h3 id="home-active-hero-name">' +
    view.activeHero.name +
    '</h3><p>' +
    view.activeHero.role +
    '</p><button class="hub-button" type="button" data-command="nav" data-screen="heroes">Ganti hero</button></div></div>' +
    '<div class="home-hero-abilities"><div class="home-hero-ability"><span class="home-ability-mark" aria-hidden="true">◇</span><div><small>Skill</small><strong>' +
    view.activeHero.skillName +
    '</strong><p>' +
    view.activeHero.skillDescription +
    '</p></div></div><div class="home-hero-ability"><span class="home-ability-mark ultimate" aria-hidden="true">✦</span><div><small>Ultimate</small><strong>' +
    view.activeHero.ultimateName +
    '</strong><p>' +
    view.activeHero.ultimateDescription +
    '</p></div></div></div><div class="home-hero-traits"><div><small>Kekuatan</small><p>' +
    view.activeHero.strength +
    '</p></div><div><small>Kelemahan</small><p>' +
    view.activeHero.weakness +
    '</p></div></section>' +
    '<section class="home-floor-progress hub-frame" aria-labelledby="home-floor-progress-title"><div class="home-floor-progress-heading"><span class="eyebrow" id="home-floor-progress-title">Progres menara saat ini</span><strong>' +
    view.clearedCount +
    ' dari ' +
    view.totalFloors +
    ' lantai ditaklukkan</strong></div><div class="home-floor-list" role="group" aria-label="Progres lantai dungeon">' +
    floorProgress +
    '</div><button class="hub-button primary home-start-button" type="button" data-command="start-boss" aria-label="Mulai pertarungan melawan ' +
    selectedBoss.name +
    '"' +
    (selectedBoss.unlocked ? '' : ' disabled') +
    '>' +
    (selectedBoss.defeated ? 'Ulangi tantangan menara' : 'Mulai tantangan menara') +
    '</button></section>' +
    '<section class="home-codex-panel hub-frame" aria-labelledby="home-codex-title"><div class="home-panel-heading"><span class="eyebrow" id="home-codex-title">Catatan perjalanan</span></div><div class="home-campaign-facts">' +
    campaignFacts +
    '</div></section>' +
    '<section class="home-last-run hub-frame" aria-labelledby="home-last-run-title"><div class="home-panel-heading"><span class="eyebrow" id="home-last-run-title">Lantai terakhir</span></div>' +
    lastRun +
    '<button class="hub-button" type="button" data-command="nav" data-screen="dungeon">Lihat progres dungeon</button></section></div></section>'
  );
}

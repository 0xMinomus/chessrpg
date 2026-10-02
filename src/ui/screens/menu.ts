// Layar beranda: progres campaign, peta chapter, hero aktif, navigasi.

import { renderChapterMapMarkers } from '../dungeon/dungeon.ts';
import type { ChapterMapItem, FloorListItem } from '../dungeon/dungeon.ts';

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

export interface MenuView {
  coins: number;
  clearedCount: number;
  totalFloors: number;
  allCleared: boolean;
  chapters: ChapterMapItem[];
  selectedChapter: ChapterMapItem;
  nextFloor: FloorListItem;
  selectedFloor: FloorListItem;
  lastClearedFloor: FloorListItem | null;
  floorProgress: FloorListItem[];
  activeHero: MenuHeroSummary;
  heroCount: number;
  cardCount: number;
  deckReady?: boolean;
}

function floorState(floor: FloorListItem): string {
  if (floor.cleared) return 'Selesai';
  if (floor.unlocked) return 'Terbuka';
  return 'Terkunci';
}

export function renderMenuPage(view: MenuView): string {
  const selectedFloor = view.selectedFloor;
  const selectedChapter = view.selectedChapter;
  const deckReady = view.deckReady !== false;
  const floorProgress = view.floorProgress
    .map(function (floor) {
      const state = floorState(floor);
      return (
        '<button class="home-floor-step' +
        (floor.selected ? ' selected' : '') +
        (floor.isBoss ? ' boss-floor' : '') +
        '" type="button" data-command="select-floor" data-floor-id="' +
        floor.id +
        '" aria-label="Pilih lantai ' +
        String(floor.floorNumber).padStart(2, '0') +
        ', ' +
        floor.name +
        ', ' +
        state +
        ', hadiah ' +
        floor.reward +
        ' koin" aria-pressed="' +
        String(floor.selected) +
        '"><span class="home-floor-glyph" aria-hidden="true">' +
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
  const lastRun = view.lastClearedFloor
    ? '<div class="home-last-run-boss"><span class="home-floor-glyph" aria-hidden="true">' +
      view.lastClearedFloor.glyph +
      '</span><div><strong>' +
      view.lastClearedFloor.name +
      '</strong><small>Chapter ' +
      String(view.lastClearedFloor.chapterNumber).padStart(2, '0') +
      ' · Lantai ' +
      String(view.lastClearedFloor.floorNumber).padStart(2, '0') +
      ' · Selesai</small></div></div><div class="home-last-run-reward"><span>Hadiah diperoleh</span><strong>' +
      view.lastClearedFloor.reward +
      ' koin</strong></div>'
    : '<div class="home-last-run-empty"><span class="home-run-mark" aria-hidden="true">◇</span><strong>Belum ada lantai selesai</strong><p>Tantangan pertama: ' +
      view.nextFloor.name +
      ' · Chapter ' +
      String(view.nextFloor.chapterNumber).padStart(2, '0') +
      '</p><div class="home-last-run-reward"><span>Hadiah clear pertama</span><strong>' +
      view.nextFloor.reward +
      ' koin</strong></div></div>';
  const campaignFacts = [
    { mark: '♜', label: 'Campaign', value: '10 chapter', note: '50 lantai berurutan' },
    { mark: '♙', label: 'Hero', value: view.heroCount + ' tersedia', note: 'Semua terbuka untuk diuji' },
    { mark: '✦', label: 'Kartu', value: view.cardCount + ' kartu', note: 'Koleksi skill dungeon' },
    { mark: 'M', label: 'Mana', value: 'Untuk kartu', note: 'Pulih setelah langkah putih' },
    { mark: 'EN', label: 'Energi', value: 'Untuk hero', note: 'Skill dan ultimate' },
    { mark: '◈', label: 'Hadiah lantai', value: selectedFloor.reward + ' koin', note: 'Clear pertama' },
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
  const startCommand = deckReady ? 'start-floor' : 'open-deck';
  const startLabel = !selectedFloor.unlocked
    ? 'Selesaikan prasyarat'
    : !deckReady
      ? 'Lengkapi deck sebelum duel'
      : selectedFloor.cleared
        ? 'Ulangi lantai'
        : 'Mulai lantai';
  return (
    '<section class="hub-page home-page" aria-labelledby="hub-home-title">' +
    '<div class="hub-page-heading home-page-heading"><div><span class="eyebrow">Perjalanan berikutnya</span>' +
    '<h2 id="hub-home-title">' +
    (view.allCleared ? 'Semua chapter selesai' : 'Peta campaign terbuka.') +
    '</h2><p>' +
    (view.allCleared
      ? 'Semua lantai telah ditaklukkan. Pilih lantai mana pun untuk bermain kembali.'
      : 'Selesaikan lima lantai tiap chapter. Boss di lantai kelima membuka chapter selanjutnya.') +
    ' Tantangan berikutnya: Chapter ' +
    String(view.nextFloor.chapterNumber).padStart(2, '0') +
    ' · Lantai ' +
    String(view.nextFloor.floorNumber).padStart(2, '0') +
    '.</p></div></div>' +
    '<div class="home-dashboard">' +
    '<section class="home-world-panel hub-frame" aria-label="Peta dunia dan chapter terpilih"><div class="home-world-map">' +
    '<img class="home-world-image" src="/assets/broken-crescent-pixel-map.png" alt="Peta pixel-art Broken Crescent dengan pulau dan jalur antardaerah." width="1254" height="1254" />' +
    '<div class="dungeon-map-markers" role="group" aria-label="Pilih chapter pada peta">' +
    renderChapterMapMarkers(view.chapters) +
    '</div></div><article class="home-selected-boss"><div class="home-selected-heading"><span class="eyebrow">Chapter terpilih</span><span class="home-boss-state">' +
    (selectedChapter.cleared ? 'Selesai' : selectedChapter.unlocked ? 'Terbuka' : 'Terkunci') +
    '</span></div><div class="home-selected-identity"><span class="home-selected-glyph" aria-hidden="true">' +
    String(selectedChapter.number).padStart(2, '0') +
    '</span><div><small>Chapter ' +
    String(selectedChapter.number).padStart(2, '0') +
    ' · ' +
    selectedChapter.areaLabel +
    '</small><h3>' +
    selectedChapter.name +
    '</h3></div></div><p class="home-selected-description">Pilihan: lantai ' +
    String(selectedFloor.floorNumber).padStart(2, '0') +
    ' / 05 · ' +
    selectedFloor.name +
    '.</p><div class="home-selected-rule"><span>' +
    (selectedFloor.isBoss ? 'Skill unik boss' : 'Tantangan') +
    '</span><p>' +
    selectedFloor.rule +
    '</p></div><div class="home-selected-reward"><span>Hadiah clear pertama</span><strong>' +
    selectedFloor.reward +
    ' koin</strong></div><button class="hub-button primary" type="button" data-command="nav" data-screen="dungeon">Buka peta chapter</button></article></section>' +
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
    '<section class="home-floor-progress hub-frame" aria-labelledby="home-floor-progress-title"><div class="home-floor-progress-heading"><span class="eyebrow" id="home-floor-progress-title">Progres Chapter ' +
    String(selectedChapter.number).padStart(2, '0') +
    '</span><strong>' +
    view.clearedCount +
    ' dari ' +
    view.totalFloors +
    ' lantai campaign selesai</strong></div><div class="home-floor-list" role="group" aria-label="Lima lantai chapter terpilih">' +
    floorProgress +
    '</div><button class="hub-button primary home-start-button" type="button" data-command="' +
    startCommand +
    '" data-floor-id="' +
    selectedFloor.id +
    '" aria-label="' +
    startLabel +
    ' ' +
    selectedFloor.name +
    '"' +
    (selectedFloor.unlocked ? '' : ' disabled') +
    '>' +
    startLabel +
    '</button></section>' +
    '<section class="home-codex-panel hub-frame" aria-labelledby="home-codex-title"><div class="home-panel-heading"><span class="eyebrow" id="home-codex-title">Catatan perjalanan</span></div><div class="home-campaign-facts">' +
    campaignFacts +
    '</div></section>' +
    '<section class="home-last-run hub-frame" aria-labelledby="home-last-run-title"><div class="home-panel-heading"><span class="eyebrow" id="home-last-run-title">Lantai terakhir</span></div>' +
    lastRun +
    '<button class="hub-button" type="button" data-command="nav" data-screen="dungeon">Lihat progres campaign</button></section></div></section>'
  );
}

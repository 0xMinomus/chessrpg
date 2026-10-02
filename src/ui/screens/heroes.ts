// Layar hero dan deck: roster memakai data hero, loadout hanya mengirim intent.

export type HeroMenuTab = 'roster' | 'deck';
export type DeckFilter = 'all' | 'offense' | 'defense' | 'spell' | 'consumable' | 'joker';
export type DeckCardKind = 'offense' | 'defense' | 'spell' | 'consumable' | 'joker';

export interface HeroRosterItem {
  id: string;
  name: string;
  role: string;
  portrait: string;
  startEnergy: number;
  energyCap: number;
  stateLabel: string;
  selected: boolean;
  active: boolean;
}

export interface HeroDetailPanel {
  id: string;
  name: string;
  role: string;
  portrait: string;
  startEnergy: number;
  energyCap: number;
  skillName: string;
  skillCost: number;
  skillDesc: string;
  ultimateName: string;
  ultimateCost: number;
  ultimateDesc: string;
  strength: string;
  weakness: string;
  active: boolean;
  stateMessage: string;
}

export interface DeckCardItem {
  id: string;
  name: string;
  cost: number;
  kind: DeckCardKind;
  tag: string;
  desc: string;
  icon: string;
  selected: boolean;
  disabled: boolean;
}

export interface DeckHeroSummary {
  name: string;
  role: string;
  portrait: string;
  skillName: string;
  ultimateName: string;
}

export interface HeroesPageView {
  tab: HeroMenuTab;
  filter: DeckFilter;
  roster: HeroRosterItem[];
  detail: HeroDetailPanel;
  deck: {
    cards: DeckCardItem[];
    selectedCards: DeckCardItem[];
    regularCount: number;
    jokerCount: number;
    regularLimit: number;
    jokerLimit: number;
    totalCardCount: number;
    complete: boolean;
    notice: string | null;
    activeHero: DeckHeroSummary;
  };
}

const FILTERS: { id: DeckFilter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'offense', label: 'Serang' },
  { id: 'defense', label: 'Bertahan' },
  { id: 'spell', label: 'Mantra' },
  { id: 'consumable', label: 'Konsumsi' },
  { id: 'joker', label: 'Joker' },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHeroTabs(view: HeroesPageView): string {
  return (
    '<div class="hero-menu-tabs" role="group" aria-label="Menu hero">' +
    '<button class="hero-menu-tab' +
    (view.tab === 'roster' ? ' active' : '') +
    '" type="button" data-command="hero-tab" data-tab="roster" aria-pressed="' +
    String(view.tab === 'roster') +
    '"><span>Roster hero</span><small>' +
    String(view.roster.length).padStart(2, '0') +
    ' PILIHAN</small></button>' +
    '<button class="hero-menu-tab' +
    (view.tab === 'deck' ? ' active' : '') +
    '" type="button" data-command="hero-tab" data-tab="deck" aria-pressed="' +
    String(view.tab === 'deck') +
    '"><span>Deck</span><small>' +
    view.deck.regularLimit +
    ' KARTU · ' +
    view.deck.jokerLimit +
    ' JOKER</small></button></div>'
  );
}

function renderHeroRosterCard(hero: HeroRosterItem): string {
  return (
    '<button class="hero-card' +
    (hero.selected ? ' selected' : '') +
    (hero.active ? ' active-hero' : '') +
    '" type="button" data-command="select-hero" data-hero-id="' +
    escapeHtml(hero.id) +
    '" aria-label="' +
    escapeHtml(hero.name + ', ' + hero.role + ', EN awal ' + hero.startEnergy + ' dari ' + hero.energyCap + ', ' + hero.stateLabel) +
    '" aria-pressed="' +
    String(hero.selected) +
    '"><span class="hero-card-face-wrap"><span class="hero-face hero-card-face" data-portrait="' +
    escapeHtml(hero.portrait) +
    '" role="img" aria-label="Potret ' +
    escapeHtml(hero.name) +
    '"></span></span><span class="hero-card-copy"><strong>' +
    escapeHtml(hero.name) +
    '</strong><small>' +
    escapeHtml(hero.role) +
    '</small><span class="hero-card-energy"><span>EN AWAL</span><b>' +
    String(hero.startEnergy).padStart(2, '0') +
    '<i>/' +
    String(hero.energyCap).padStart(2, '0') +
    '</i></b></span></span><span class="hero-card-state">' +
    escapeHtml(hero.stateLabel) +
    '</span></button>'
  );
}

function renderMetric(label: string, value: number, max: number, kind: string): string {
  const ratio = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    '<div class="hero-meter ' +
    kind +
    '" aria-label="' +
    escapeHtml(label + ' ' + value + ' dari ' + max) +
    '"><span>' +
    escapeHtml(label) +
    '</span><span class="hero-meter-track" aria-hidden="true"><i style="width:' +
    ratio +
    '%"></i></span><strong>' +
    String(value).padStart(2, '0') +
    '<small>/' +
    String(max).padStart(2, '0') +
    '</small></strong></div>'
  );
}

function renderHeroDetails(view: HeroesPageView): string {
  const detail = view.detail;
  const action =
    '<button class="hub-button primary" type="button" data-command="choose-hero"' +
    (detail.active ? ' disabled' : '') +
    '>' +
    (detail.active ? '✓ Hero aktif' : 'Pilih hero ini') +
    '</button>';

  return (
    '<article class="hero-detail hub-frame" aria-label="Detail hero terpilih"><div class="hero-detail-heading"><span class="eyebrow hero-detail-kicker">Hero terpilih</span>' +
    (detail.active ? '<span class="hero-active-mark">AKTIF</span>' : '') +
    '</div><div class="hero-detail-head"><span class="hero-face hero-detail-face" data-portrait="' +
    escapeHtml(detail.portrait) +
    '" role="img" aria-label="Potret ' +
    escapeHtml(detail.name) +
    '"></span><div class="hero-detail-identity"><h3>' +
    escapeHtml(detail.name) +
    '</h3><span class="hero-detail-role">' +
    escapeHtml(detail.role) +
    '</span></div></div>' +
    '<section class="hero-stat-panel" aria-label="Resource hero"><div class="hero-section-label">Stat dasar</div>' +
    renderMetric('EN awal', detail.startEnergy, detail.energyCap, 'energy') +
    renderMetric('Skill utama', detail.skillCost, detail.energyCap, 'skill') +
    renderMetric('Ultimate', detail.ultimateCost, detail.energyCap, 'ultimate') +
    '</section><div class="hero-ability-list"><section class="hero-ability"><div class="hero-ability-heading"><span>Skill utama</span><small>' +
    detail.skillCost +
    ' EN</small></div><strong>' +
    escapeHtml(detail.skillName) +
    '</strong><p>' +
    escapeHtml(detail.skillDesc) +
    '</p></section><section class="hero-ability"><div class="hero-ability-heading"><span>Ultimate</span><small>' +
    detail.ultimateCost +
    ' EN</small></div><strong>' +
    escapeHtml(detail.ultimateName) +
    '</strong><p>' +
    escapeHtml(detail.ultimateDesc) +
    '</p></section></div><div class="hero-traits"><p><strong>Kelebihan</strong><span>' +
    escapeHtml(detail.strength) +
    '</span></p><p><strong>Kelemahan</strong><span>' +
    escapeHtml(detail.weakness) +
    '</span></p></div><div class="hero-detail-actions">' +
    action +
    '<span class="hero-detail-state">' +
    escapeHtml(detail.stateMessage) +
    '</span></div></article>'
  );
}

function renderCardIcon(card: DeckCardItem): string {
  return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#icon-' + escapeHtml(card.icon) + '"/></svg>';
}

function renderDeckCard(card: DeckCardItem): string {
  const status = card.selected ? 'TERPILIH' : card.disabled ? 'SLOT PENUH' : 'TAMBAHKAN';
  const action = card.selected ? 'Lepas ' : 'Pilih ';
  const rarity = card.kind === 'joker' ? ' · LANGKA' : '';
  const limitNote = card.disabled
    ? card.kind === 'joker'
      ? ' Slot Joker sudah terisi.'
      : ' Sepuluh slot kartu pilihan sudah terisi.'
    : '';
  return (
    '<button class="deck-card kind-' +
    card.kind +
    (card.selected ? ' selected' : '') +
    (card.disabled ? ' at-capacity' : '') +
    '" type="button" data-command="toggle-deck-card" data-card-id="' +
    escapeHtml(card.id) +
    '" aria-label="' +
    escapeHtml(action + card.name + '. ' + card.desc + ' Biaya ' + card.cost + ' mana.' + (card.selected ? ' Terpilih.' : limitNote)) +
    '" aria-pressed="' +
    String(card.selected) +
    '"' +
    (card.disabled ? ' disabled' : '') +
    '><span class="deck-card-art">' +
    renderCardIcon(card) +
    '</span><span class="deck-card-copy"><span class="deck-card-meta">' +
    escapeHtml(card.tag.toUpperCase() + rarity) +
    '<b>' +
    String(card.cost).padStart(2, '0') +
    ' MANA</b></span><strong>' +
    escapeHtml(card.name) +
    '</strong><span class="deck-card-description">' +
    escapeHtml(card.desc) +
    '</span></span><span class="deck-card-action" aria-hidden="true">' +
    (card.selected ? '✓' : card.disabled ? '—' : '+') +
    '</span><span class="deck-card-status">' +
    status +
    '</span></button>'
  );
}

function renderSelectedCard(card: DeckCardItem, index: number): string {
  return (
    '<li><button class="deck-selected-card kind-' +
    card.kind +
    '" type="button" data-command="toggle-deck-card" data-card-id="' +
    escapeHtml(card.id) +
    '" aria-label="Lepas ' +
    escapeHtml(card.name) +
    ' dari deck"><span class="deck-selected-index">' +
    String(index + 1).padStart(2, '0') +
    '</span><span class="deck-selected-icon">' +
    renderCardIcon(card) +
    '</span><span class="deck-selected-copy"><strong>' +
    escapeHtml(card.name) +
    '</strong><small>' +
    escapeHtml(card.tag) +
    ' · ' +
    String(card.cost).padStart(2, '0') +
    ' mana</small></span><span class="deck-selected-remove" aria-hidden="true">−</span></button></li>'
  );
}

function renderDeckBuilder(view: HeroesPageView): string {
  const deck = view.deck;
  const filters = FILTERS.map(function (filter) {
    return (
      '<button class="deck-filter' +
      (view.filter === filter.id ? ' active' : '') +
      '" type="button" data-command="deck-filter" data-filter="' +
      filter.id +
      '" aria-pressed="' +
      String(view.filter === filter.id) +
      '">' +
      filter.label +
      '</button>'
    );
  }).join('');
  const selected = deck.selectedCards.map(renderSelectedCard).join('');
  const cards = deck.cards.map(renderDeckCard).join('');
  const notice = deck.notice
    ? '<p class="deck-notice" role="status">' + escapeHtml(deck.notice) + '</p>'
    : '';

  return (
    '<div class="deck-builder-layout"><section class="deck-catalog hub-frame" aria-labelledby="deck-catalog-title"><div class="deck-panel-heading"><div><span class="eyebrow">Pustaka taktis</span><h3 id="deck-catalog-title">Pilih kartu</h3></div><span class="deck-catalog-total">' +
    deck.totalCardCount +
    ' KARTU</span></div><p class="deck-rules-copy">Pilih ' +
    deck.regularLimit +
    ' kartu non-Joker dan ' +
    deck.jokerLimit +
    ' Joker. Biaya kartu dibayar dengan mana.</p><div class="deck-filters" role="group" aria-label="Filter jenis kartu">' +
    filters +
    '</div><div class="deck-card-grid" role="group" aria-label="Koleksi kartu">' +
    (cards || '<p class="deck-empty">Tidak ada kartu pada kategori ini.</p>') +
    '</div></section><aside class="deck-loadout hub-frame" aria-labelledby="deck-loadout-title"><div class="deck-panel-heading"><div><span class="eyebrow">Loadout duel</span><h3 id="deck-loadout-title">Deck terpilih</h3></div><span class="deck-ready-mark' +
    (deck.complete ? ' ready' : '') +
    '" aria-label="' +
    (deck.complete ? 'Deck lengkap' : 'Deck belum lengkap') +
    '">' +
    (deck.complete ? 'SIAP' : 'ATUR') +
    '</span></div><div class="deck-slot-counts"><div class="deck-slot-count"><span>Kartu bebas</span><strong>' +
    String(deck.regularCount).padStart(2, '0') +
    '<small> / ' +
    deck.regularLimit +
    '</small></strong></div><div class="deck-slot-count joker-count"><span>Joker</span><strong>' +
    String(deck.jokerCount).padStart(2, '0') +
    '<small> / ' +
    deck.jokerLimit +
    '</small></strong></div></div>' +
    notice +
    '<ol class="deck-selected-list" aria-label="Kartu yang dibawa">' +
    selected +
    '</ol><div class="deck-loadout-footer"><div class="deck-active-hero"><span class="hero-face deck-active-face" data-portrait="' +
    escapeHtml(deck.activeHero.portrait) +
    '" role="img" aria-label="Potret ' +
    escapeHtml(deck.activeHero.name) +
    '"></span><div><small>HERO AKTIF</small><strong>' +
    escapeHtml(deck.activeHero.name) +
    '</strong><span>' +
    escapeHtml(deck.activeHero.role) +
    '</span></div></div><p>Deck dan progres disimpan otomatis di perangkat ini.</p></div></aside></div>'
  );
}

export function renderHeroesPage(view: HeroesPageView): string {
  const isDeck = view.tab === 'deck';
  const heading = isDeck ? 'Atur deck' : 'Pilih hero';
  const description = isDeck
    ? 'Racik ' + view.deck.regularLimit + ' kartu pilihan dan ' + view.deck.jokerLimit + ' Joker untuk dibawa ke duel berikutnya.'
    : 'Setiap hero punya skill, ultimate, kekuatan, dan kelemahan sendiri.';
  const main = isDeck
    ? renderDeckBuilder(view)
    : '<div class="heroes-layout"><section class="hero-roster-panel hub-frame" aria-label="Daftar hero"><div class="hero-roster-heading"><span class="eyebrow">Roster bertarung</span><span>' +
      String(view.roster.length).padStart(2, '0') +
      ' HERO</span></div><div class="hero-roster" role="group" aria-label="Daftar hero">' +
      view.roster.map(renderHeroRosterCard).join('') +
      '</div><div class="hero-loadout-link"><div><span>Loadout pertarungan</span><strong>' +
      view.deck.regularCount +
      '/' +
      view.deck.regularLimit +
      ' kartu · ' +
      view.deck.jokerCount +
      '/' +
      view.deck.jokerLimit +
      ' Joker</strong></div><button type="button" data-command="hero-tab" data-tab="deck">Atur deck <span aria-hidden="true">→</span></button></div></section>' +
      renderHeroDetails(view) +
      '</div>';

  return (
    '<section class="hub-page heroes-page' +
    (isDeck ? ' deck-page' : '') +
    '" aria-labelledby="hub-heroes-title"><div class="hub-page-heading hero-page-heading"><div><span class="eyebrow">Crown &amp; Catalyst / Persiapan</span><h2 id="hub-heroes-title">' +
    heading +
    '</h2><p>' +
    description +
    '</p></div>' +
    renderHeroTabs(view) +
    '</div>' +
    main +
    '</section>'
  );
}

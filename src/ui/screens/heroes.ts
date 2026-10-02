// Layar daftar hero: roster 6 hero + detail skill/ultimate/kelebihan/kekurangan.

export interface HeroRosterItem {
  id: string;
  name: string;
  role: string;
  portrait: string;
  cost: number;
  stateLabel: string;
  selected: boolean;
}

export interface HeroDetailPanel {
  id: string;
  name: string;
  role: string;
  portrait: string;
  skillName: string;
  skillCost: number;
  skillDesc: string;
  ultimateName: string;
  ultimateCost: number;
  ultimateDesc: string;
  strength: string;
  weakness: string;
  owned: boolean;
  active: boolean;
  canAfford: boolean;
  cost: number;
  stateMessage: string;
}

export interface HeroesPageView {
  roster: HeroRosterItem[];
  detail: HeroDetailPanel;
}

export function renderHeroesPage(view: HeroesPageView): string {
  const detail = view.detail;
  const action = detail.owned
    ? '<button class="hub-button primary" type="button" data-command="choose-hero"' +
      (detail.active ? ' disabled' : '') +
      '>' +
      (detail.active ? 'Hero aktif' : 'Pilih hero') +
      '</button>'
    : '<button class="hub-button primary" type="button" data-command="buy-hero"' +
      (detail.canAfford ? '' : ' disabled') +
      '>Beli · ' +
      detail.cost +
      ' koin</button>';
  const cards = view.roster
    .map(function (hero) {
      return (
        '<button class="hero-card' +
        (hero.selected ? ' selected' : '') +
        '" type="button" data-command="select-hero" data-hero-id="' +
        hero.id +
        '" aria-label="' +
        hero.name +
        ', ' +
        hero.role +
        ', ' +
        hero.stateLabel +
        '" aria-pressed="' +
        String(hero.selected) +
        '">' +
        '<span class="hero-face hero-card-face" data-portrait="' +
        hero.portrait +
        '" role="img" aria-label="Potret ' +
        hero.name +
        '"></span>' +
        '<strong>' +
        hero.name +
        '</strong><small>' +
        hero.role +
        '</small>' +
        '<span class="hero-card-state">' +
        hero.stateLabel +
        '</span></button>'
      );
    })
    .join('');
  return (
    '<section class="hub-page heroes-page" aria-labelledby="hub-heroes-title">' +
    '<div class="hub-page-heading"><div><span class="eyebrow">Enam gaya bertarung</span>' +
    '<h2 id="hub-heroes-title">Pilih hero</h2>' +
    '<p>Setiap hero punya skill, ultimate, kekuatan, dan kelemahan sendiri.</p></div></div>' +
    '<div class="heroes-layout"><div class="hero-roster hub-frame" role="group" aria-label="Daftar hero">' +
    cards +
    '</div>' +
    '<article class="hero-detail hub-frame" aria-label="Detail hero"><span class="eyebrow hero-detail-kicker">Hero terpilih</span><div class="hero-detail-head">' +
    '<span class="hero-face hero-detail-face" data-portrait="' +
    detail.portrait +
    '" role="img" aria-label="Potret ' +
    detail.name +
    '"></span>' +
    '<div><h3>' +
    detail.name +
    '</h3><span class="hero-detail-role">' +
    detail.role +
    '</span></div></div>' +
    '<div class="hero-ability-list"><section class="hero-ability"><div class="hero-ability-heading"><span>Skill utama</span><small>' +
    detail.skillCost +
    ' EN</small></div><strong>' +
    detail.skillName +
    '</strong><p>' +
    detail.skillDesc +
    '</p></section><section class="hero-ability"><div class="hero-ability-heading"><span>Ultimate</span><small>' +
    detail.ultimateCost +
    ' EN</small></div><strong>' +
    detail.ultimateName +
    '</strong><p>' +
    detail.ultimateDesc +
    '</p></section></div>' +
    '<div class="hero-traits"><p><strong>Kelebihan</strong><span>' +
    detail.strength +
    '</span></p><p><strong>Kelemahan</strong><span>' +
    detail.weakness +
    '</span></p></div>' +
    '<div class="hero-detail-actions">' +
    action +
    '<span class="hero-detail-state">' +
    detail.stateMessage +
    '</span></div></article></div></section>'
  );
}

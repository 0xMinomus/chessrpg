// Panel hero battle: EN, mana kartu, skill 2 EN, ultimate 5 EN.
// Mode target/cancel hanya mengubah tampilan; EN dibayar saat konfirmasi domain.

export const HERO_SKILL_COST = 2;
export const HERO_ULTIMATE_COST = 5;
export const HERO_EN_CAP = 5;
export const HERO_MANA_CAP = 6;

export interface HeroPanelView {
  portrait: string;
  heroName: string;
  role: string;
  kingState: string;
  energy: number;
  heroMana: number;
  skillName: string;
  skillDesc: string;
  ultimateName: string;
  ultimateDesc: string;
  skillTargeting: boolean;
  ultimateTargeting: boolean;
  skillDisabled: boolean;
  ultimateDisabled: boolean;
  skillHint: string;
  ultimateHint: string;
  freeSkillState: string;
}

function pips(current: number, cap: number): string {
  let html = '';
  for (let i = 0; i < cap; i += 1) {
    html += '<span class="energy-pip' + (i < current ? ' on' : '') + '"></span>';
  }
  return html;
}

export function renderHeroPanel(view: HeroPanelView): string {
  const manaPct = Math.max(0, Math.min(100, (view.heroMana / HERO_MANA_CAP) * 100));
  const skillLabel = view.skillTargeting ? 'Pilih target…' : view.skillName;
  const ultimateLabel = view.ultimateTargeting ? 'Pilih target…' : view.ultimateName;
  return (
    '<div class="hero-loadout"><section class="player-skill-profile" aria-label="Profil pemain dan energi putih">' +
    '<div class="player-profile-heading">' +
    '<span class="player-profile-avatar hero-face" data-portrait="' +
    view.portrait +
    '" role="img" aria-label="Potret ' +
    view.heroName +
    '"></span>' +
    '<span class="player-profile-copy"><span class="micro-label">HERO / PUTIH</span><strong>' +
    view.heroName +
    '</strong><small>' +
    view.kingState +
    '</small></span></div>' +
    '<div class="energy-hud" role="group" aria-label="Energi skill hero putih">' +
    '<span class="hud-label">Energi skill hero</span>' +
    '<div class="energy-row"><span class="energy-emblem" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13.5 2.5 5.7 13h5.2l-.4 8.5L18.3 11h-5.2z"/></svg></span>' +
    '<div class="energy-track" aria-hidden="true">' +
    pips(view.energy, HERO_EN_CAP) +
    '</div>' +
    '<strong class="energy-number">' +
    view.energy +
    ' / ' +
    HERO_EN_CAP +
    '</strong></div>' +
    '<span class="hud-subtext">Satu segmen = 1 EN</span>' +
    '<div class="free-card-note" aria-label="Jatah kartu putih tanpa biaya energi">' +
    '<span class="free-token">0 EN</span><span>1 / giliran</span><strong aria-live="polite">' +
    view.freeSkillState +
    '</strong></div></div>' +
    '<div class="card-mana-hud" aria-label="Mana kartu"><span>Mana kartu</span><strong>' +
    view.heroMana +
    ' / ' +
    HERO_MANA_CAP +
    '</strong>' +
    '<div class="hero-mana-meter" role="meter" aria-label="Mana kartu" aria-valuemin="0" aria-valuemax="' +
    HERO_MANA_CAP +
    '" aria-valuenow="' +
    view.heroMana +
    '"><span style="width:' +
    manaPct +
    '%"></span></div></div></section>' +
    '<div class="hero-action-panel" aria-label="Skill dan ultimate hero">' +
    '<button class="hero-action-button' +
    (!view.skillDisabled && !view.skillTargeting ? ' is-ready' : '') +
    (view.skillTargeting ? ' is-targeting' : '') +
    '" type="button" data-command="hero-skill" title="' +
    view.skillDesc +
    ' Biaya ' +
    HERO_SKILL_COST +
    ' EN."' +
    (view.skillDisabled ? ' disabled' : '') +
    ' aria-label="' +
    (view.skillTargeting ? 'Batalkan target skill tanpa memakai EN' : 'Aktifkan skill ' + view.skillName + ', biaya ' + HERO_SKILL_COST + ' EN. ' + view.skillHint) +
    '"><span>Skill · <b>' +
    HERO_SKILL_COST +
    '</b> EN</span><strong>' +
    skillLabel +
    '</strong></button>' +
    '<button class="hero-action-button ultimate' +
    (!view.ultimateDisabled && !view.ultimateTargeting ? ' is-ready' : '') +
    (view.ultimateTargeting ? ' is-targeting' : '') +
    '" type="button" data-command="hero-ultimate" title="' +
    view.ultimateDesc +
    ' Biaya ' +
    HERO_ULTIMATE_COST +
    ' EN."' +
    (view.ultimateDisabled ? ' disabled' : '') +
    ' aria-label="' +
    (view.ultimateTargeting
      ? 'Batalkan target ultimate tanpa memakai EN'
      : 'Aktifkan ultimate ' + view.ultimateName + ', biaya ' + HERO_ULTIMATE_COST + ' EN. ' + view.ultimateHint) +
    '"><span>Ultimate · <b>' +
    HERO_ULTIMATE_COST +
    '</b> EN</span><strong>' +
    ultimateLabel +
    '</strong></button></div></div>'
  );
}

// Layar battle: komposisi papan + kartu + hero + telegraph + ledger.
// Menerima snapshot state; tidak menghitung langkah/efek/biaya.

import { renderBoard } from '../board/board.ts';
import type { BoardViewState } from '../board/board.ts';
import { renderHand, renderReroll } from '../cards/cards.ts';
import type { CardSlotView, RerollView } from '../cards/cards.ts';
import { renderHeroPanel } from '../hero/hero.ts';
import type { HeroPanelView } from '../hero/hero.ts';

export interface TelegraphView {
  title: string;
  copy: string;
  state: string;
}

export interface LedgerEntryView {
  numberLabel: string;
  detail: string;
}

export interface LedgerView {
  countLabel: string;
  empty: boolean;
  emptyText: string;
  entries: LedgerEntryView[];
}

export interface BattleChromeView {
  floorLabel: string;
  turnLabel: string;
  opponentName: string;
  opponentRule: string;
  opponentType: string;
  stageLabel: string;
  turnFlag: string;
  turnFlagClass: string;
  boardStatus: string;
  armyState: string;
  pieceCount: string;
  captureCount: string;
  enemyKingState: string;
  kingState: string;
  runNote: string;
  enemyEnergyNumber: string;
  enemyEnergyPips: number;
  enemyEnergyNote: string;
  effectChips: { text: string; enemy: boolean }[];
  footerState: string;
  undoDisabled: boolean;
  soundOn: boolean;
  canInteract: boolean;
}

export interface PromotionView {
  open: boolean;
  message: string;
}

export interface BattlePageView {
  chrome: BattleChromeView;
  board: BoardViewState;
  hero: HeroPanelView;
  slots: CardSlotView[];
  reroll: RerollView;
  telegraph: TelegraphView;
  ledger: LedgerView;
  promotion: PromotionView;
}

function energyPips(current: number, cap: number): string {
  let html = '';
  for (let i = 0; i < cap; i += 1) {
    html += '<span class="energy-pip' + (i < current ? ' on' : '') + '"></span>';
  }
  return html;
}

function effectStrip(chips: { text: string; enemy: boolean }[]): string {
  if (chips.length === 0) return '<span class="effect-empty">Tidak ada efek aktif.</span>';
  return chips
    .map(function (chip) {
      return '<span class="effect-chip' + (chip.enemy ? ' enemy-effect' : '') + '">' + chip.text + '</span>';
    })
    .join('');
}

function ledgerList(view: LedgerView): string {
  if (view.empty) return '<p class="empty-ledger">' + view.emptyText + '</p>';
  return (
    '<ol class="move-list">' +
    view.entries
      .map(function (entry) {
        return '<li><span>' + entry.numberLabel + '</span><span>' + entry.detail + '</span></li>';
      })
      .join('') +
    '</ol>'
  );
}

export function renderBattlePage(view: BattlePageView): string {
  const chrome = view.chrome;
  const promotion = view.promotion.open
    ? '<dialog class="promotion-dialog" open aria-labelledby="promotion-title" aria-describedby="promotion-message">' +
      '<span class="eyebrow">Promosi pion</span><h2 id="promotion-title">Pilih bidak pengganti</h2>' +
      '<p id="promotion-message">' +
      view.promotion.message +
      '</p>' +
      '<div class="promotion-options" role="group" aria-label="Pilihan bidak promosi">' +
      '<button class="promotion-choice" type="button" data-command="promotion" data-promotion="q" aria-label="Promosikan menjadi ratu"><span class="promotion-piece" aria-hidden="true">♕</span><span>Ratu</span></button>' +
      '<button class="promotion-choice" type="button" data-command="promotion" data-promotion="r" aria-label="Promosikan menjadi benteng"><span class="promotion-piece" aria-hidden="true">♖</span><span>Benteng</span></button>' +
      '<button class="promotion-choice" type="button" data-command="promotion" data-promotion="b" aria-label="Promosikan menjadi gajah"><span class="promotion-piece" aria-hidden="true">♗</span><span>Gajah</span></button>' +
      '<button class="promotion-choice" type="button" data-command="promotion" data-promotion="n" aria-label="Promosikan menjadi kuda"><span class="promotion-piece" aria-hidden="true">♘</span><span>Kuda</span></button>' +
      '</div></dialog>'
    : '';
  return (
    '<header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">♔</div>' +
    '<div class="brand-copy"><h1>ChessRPG</h1><p>Takhta taktis / mode dungeon</p></div></div>' +
    '<div class="hud-box"><span class="hud-label">Lantai</span><span class="hud-value">' +
    chrome.floorLabel +
    '</span></div>' +
    '<div class="hud-box"><span class="hud-label">Langkah</span><span class="hud-value">' +
    chrome.turnLabel +
    '</span></div>' +
    '<div class="top-actions">' +
    '<button class="utility-button" type="button" data-command="nav" data-screen="menu" aria-label="Kembali ke menu dungeon">Menu</button>' +
    '<button class="utility-button sound-button" type="button" data-command="sound" aria-label="Suara permainan" title="Aktifkan atau nonaktifkan suara permainan." aria-pressed="' +
    (chrome.soundOn ? 'true' : 'false') +
    '">Suara: ' +
    (chrome.soundOn ? 'ON' : 'OFF') +
    '</button>' +
    '<button class="utility-button" type="button" data-command="undo" aria-label="Batalkan satu giliran penuh"' +
    (chrome.undoDisabled ? ' disabled' : '') +
    '>Batalkan giliran</button>' +
    '<button class="utility-button" type="button" data-command="restart" aria-label="Mulai ulang permainan" title="Mulai permainan dari posisi awal">Mulai ulang</button>' +
    '</div></header>' +
    '<main class="game-layout">' +
    '<aside class="enemy-skill-profile" aria-label="Profil lawan dan energi hitam">' +
    '<div class="enemy-profile-heading"><span class="enemy-profile-avatar" aria-hidden="true">♚</span>' +
    '<span class="enemy-profile-copy"><span class="eyebrow">' +
    chrome.opponentType +
    '</span><strong>' +
    chrome.opponentName +
    '</strong><small>' +
    chrome.opponentRule +
    '</small></span></div>' +
    '<section class="enemy-energy" aria-label="Energi lawan"><div class="enemy-energy-head">' +
    '<span class="micro-label">Energi hitam</span><strong>' +
    chrome.enemyEnergyNumber +
    '</strong></div>' +
    '<div class="energy-track" aria-hidden="true">' +
    energyPips(chrome.enemyEnergyPips, 5) +
    '</div>' +
    '<p class="enemy-energy-note">' +
    chrome.enemyEnergyNote +
    '</p></section></aside>' +
    '<aside class="rail hero-rail" aria-label="Status pasukan putih">' +
    '<h2 class="rail-heading">Pasukan putih <small>' +
    chrome.armyState +
    '</small></h2>' +
    '<div class="stat-grid" aria-label="Statistik pertandingan">' +
    '<div class="stat-cell"><span>Bidak aktif</span><strong>' +
    chrome.pieceCount +
    '</strong></div>' +
    '<div class="stat-cell"><span>Tangkapan</span><strong>' +
    chrome.captureCount +
    '</strong></div>' +
    '<div class="stat-cell"><span>Raja lawan</span><strong>' +
    chrome.enemyKingState +
    '</strong></div>' +
    '<div class="stat-cell"><span>Mode lawan</span><strong style="font-size:12px">CPU</strong></div></div>' +
    '<div class="run-note"><span class="run-note-mark" aria-hidden="true"></span><p>' +
    chrome.runNote +
    '</p></div>' +
    '</aside>' +
    '<section class="board-panel" aria-labelledby="board-title"><div class="board-heading"><div>' +
    '<span class="eyebrow">' +
    chrome.stageLabel +
    '</span><h2 id="board-title">Papan pertempuran</h2></div>' +
    '<div class="turn-flag ' +
    chrome.turnFlagClass +
    '" aria-live="polite">' +
    chrome.turnFlag +
    '</div></div>' +
    '<div class="board-stage"><div class="board-frame"><div class="board' +
    (view.board.targeting ? ' is-targeting' : '') +
    '" role="grid" aria-label="Papan catur 8 kali 8">' +
    renderBoard(view.board) +
    '</div></div></div>' +
    '<div class="board-status-row"><p class="board-status">' +
    chrome.boardStatus +
    '</p><span class="board-hint">64 petak / klik atau keyboard</span></div>' +
    '<div class="effect-strip" aria-live="polite">' +
    effectStrip(chrome.effectChips) +
    '</div></section>' +
    '<aside class="rail battle-rail" aria-label="Telegraph lawan dan catatan pertandingan">' +
    '<section class="enemy-signal" aria-live="polite" aria-label="Skill lawan berikutnya">' +
    '<span class="signal-mark" aria-hidden="true">!</span>' +
    '<div class="signal-copy"><span class="eyebrow">Telegraph lawan</span><strong>' +
    view.telegraph.title +
    '</strong><p>' +
    view.telegraph.copy +
    '</p></div>' +
    '<span class="signal-state">' +
    view.telegraph.state +
    '</span></section>' +
    '<section class="move-ledger" aria-labelledby="ledger-title"><div class="ledger-top">' +
    '<h3 id="ledger-title">Catatan langkah</h3><span>' +
    view.ledger.countLabel +
    '</span></div>' +
    ledgerList(view.ledger) +
    '</section></aside>' +
    '<section class="rail skill-rail" aria-label="Hero dan tangan kartu">' +
    '<div class="hero-dock" aria-label="Hero dan kemampuan">' +
    '<aside class="skill-tools" aria-label="Profil pemain dan energi putih">' +
    renderHeroPanel(view.hero) +
    '</aside>' +
    (view.hero.skillTargeting || view.hero.ultimateTargeting
      ? '<button class="target-cancel" type="button" data-command="cancel-target" aria-label="Batalkan target aktif dan kembalikan resource">Batalkan target</button>'
      : '') +
    '</div>' +
    '<div class="skill-list" role="list" aria-label="Tiga kartu skill">' +
    renderHand(view.slots) +
    '</div>' +
    renderReroll(view.reroll) +
    '<p class="deck-note">Kartu dibayar mana (maks 6). Tangkapan putih memulihkan 1 EN. Putar ulang: giliran pertama gratis, berikutnya 1 EN.</p>' +
    '</section></main>' +
    promotion
  );
}

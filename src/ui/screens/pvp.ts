// Layar PvP 1v1: lobby (buat/gabung + sinyal SDP) dan duel simetris.
// Hanya render state; aturan dan koneksi ada di domain/application.

import { renderBoard } from '../board/board.ts';
import type { BoardViewState } from '../board/board.ts';
import { renderHand } from '../cards/cards.ts';
import type { CardSlotView } from '../cards/cards.ts';

export type PvpRole = 'host' | 'guest';
export type PvpColor = 'w' | 'b';

export interface PvpHeroOption {
  id: string;
  name: string;
  portrait: string;
  role: string;
}

export interface PvpLobbyView {
  role: PvpRole | null;
  color: PvpColor | null;
  signal: string | null;
  signalKind: 'offer' | 'answer' | null;
  status: string;
  busy: boolean;
  error: string | null;
  remoteSignal: string;
  heroes: PvpHeroOption[];
  selectedHeroId: string;
  deckReady: boolean;
  connected: boolean;
  deckCount: number;
  loadoutLocked: boolean;
}

export interface PvpOpponentView {
  color: PvpColor;
  name: string;
  portrait: string;
  role: string;
  energy: number;
  mana: number;
  skillName: string;
  skillCost: number;
  ultimateName: string;
  ultimateCost: number;
}

export interface PvpSelfView {
  color: PvpColor;
  role: string;
  name: string;
  portrait: string;
  energy: number;
  mana: number;
  skillName: string;
  skillCost: number;
  ultimateName: string;
  ultimateCost: number;
  skillDisabled: boolean;
  ultimateDisabled: boolean;
  skillTargeting: boolean;
  ultimateTargeting: boolean;
}

export interface PvpDuelView {
  turnLabel: string;
  turnFlag: string;
  turnFlagClass: string;
  boardStatus: string;
  board: BoardViewState;
  self: PvpSelfView;
  opponent: PvpOpponentView;
  slots: CardSlotView[];
  opponentSlots: CardSlotView[];
  rerollAvailable: boolean;
  rerollLabel: string;
  rerollCost: number;
  canUndo: boolean;
  canRestart: boolean;
  canCancelTarget: boolean;
  connectionStatus: string;
  error: string | null;
  soundEnabled: boolean;
  localTurn: boolean;
  gameOver: boolean;
  winnerText: string;
  promotionOpen: boolean;
  promotionMessage: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function energyPips(current: number, cap: number): string {
  let html = '';
  for (let i = 0; i < cap; i += 1) {
    html += '<span class="energy-pip' + (i < current ? ' on' : '') + '"></span>';
  }
  return html;
}

export function renderPvpLobby(view: PvpLobbyView): string {
  const locked = view.loadoutLocked || view.role !== null || view.busy || view.connected;
  const heroOptions = view.heroes
    .map(function (hero) {
      return (
        '<button class="pvp-hero' +
        (view.selectedHeroId === hero.id ? ' selected' : '') +
        '" type="button" data-command="pvp-hero" data-hero-id="' +
        escape(hero.id) +
        '" aria-pressed="' +
        String(view.selectedHeroId === hero.id) +
        '"' +
        (locked ? ' disabled' : '') +
        '><span class="hero-face pvp-hero-face" data-portrait="' +
        escape(hero.portrait) +
        '" role="img" aria-label="Potret ' +
        escape(hero.name) +
        '"></span><strong>' +
        escape(hero.name) +
        '</strong><small>' +
        escape(hero.role) +
        '</small></button>'
      );
    })
    .join('');
  const localLabel = view.role === 'host'
    ? 'Tawaranmu: bagikan ke pemain Hitam'
    : view.role === 'guest'
      ? 'Jawabanmu: bagikan ke pemain Putih'
      : 'Kode milikmu: bagikan ke lawan';
  const remoteLabel = view.role === 'host'
    ? 'Jawaban lawan: tempel dari pemain Hitam'
    : view.role === 'guest'
      ? 'Tawaran lawan: tempel dari pemain Putih'
      : 'Kode lawan: tempel di sini';
  const applyDisabled = !view.role || view.busy || view.connected || (view.role === 'host' && !view.signal);

  return (
    '<section class="hub-page pvp-page" aria-labelledby="pvp-title" aria-busy="' +
    String(view.busy) +
    '">' +
    '<h2 id="pvp-title">Multiplayer 1vs1</h2>' +
    '<p class="pvp-intro">Pilih hero dan deck sebelum membuat koneksi. Putih mengirim tawaran, Hitam mengirim jawaban, lalu Putih menerapkan jawaban. Kartu memakai mana; aksi hero memakai EN.</p>' +
    '<div id="pvp-connection-status" class="pvp-status" role="status" aria-live="polite" aria-atomic="true">' +
    escape(view.status) +
    '</div>' +
    (view.error
      ? '<p class="pvp-error" role="alert">' + escape(view.error) + '</p>'
      : '') +
    '<div class="pvp-layout">' +
    '<section class="pvp-panel hub-frame pvp-loadout-panel" aria-labelledby="pvp-hero-title">' +
    '<h3 id="pvp-hero-title">Hero dan deck kamu</h3>' +
    '<div class="pvp-hero-grid">' +
    heroOptions +
    '</div>' +
    '<div class="pvp-deck-summary"><strong>Deck: ' +
    view.deckCount +
    ' kartu</strong><span>' +
    (view.deckReady ? 'Siap dipakai.' : 'Lengkapi deck sebelum menyambungkan.') +
    '</span></div>' +
    '<button class="hub-button" type="button" data-command="pvp-select-deck"' +
    (locked ? ' disabled' : '') +
    '>Atur deck</button>' +
    (locked ? '<p class="pvp-role-note">Hero, deck, dan warna dikunci selama sesi. Tinggalkan sesi untuk memilih ulang.</p>' : '') +
    '</section>' +
    '<section class="pvp-panel hub-frame" aria-labelledby="pvp-role-title">' +
    '<h3 id="pvp-role-title">Pilih warna dan mulai koneksi</h3>' +
    '<div class="pvp-role-grid">' +
    '<button class="hub-button' +
    (view.role === 'host' ? ' primary' : '') +
    '" type="button" data-command="pvp-host"' +
    (locked || !view.deckReady ? ' disabled' : '') +
    '>Putih: buat tawaran</button>' +
    '<button class="hub-button' +
    (view.role === 'guest' ? ' primary' : '') +
    '" type="button" data-command="pvp-join"' +
    (locked || !view.deckReady ? ' disabled' : '') +
    '>Hitam: gabung</button>' +
    '</div>' +
    (view.role ? '<p class="pvp-role-note">Kamu bermain sebagai <strong>' + (view.color === 'w' ? 'Putih' : 'Hitam') + '</strong>.</p>' : '') +
    '<p class="pvp-role-note">Biarkan halaman ini terbuka selama bertukar kode. Kirim kode lengkap lewat aplikasi pesan yang kalian gunakan.</p>' +
    '<button class="hub-button" type="button" data-command="pvp-leave">Tinggalkan sesi</button>' +
    '</section>' +
    '<section class="pvp-panel hub-frame pvp-signals-panel" aria-labelledby="pvp-signal-title">' +
    '<h3 id="pvp-signal-title">Tukar kode koneksi</h3>' +
    '<div class="pvp-signal-fields"><div class="pvp-signal-field">' +
    '<label class="pvp-signal-label" for="pvp-local-signal">' +
    localLabel +
    '</label><textarea id="pvp-local-signal" class="pvp-signal" readonly rows="6" spellcheck="false" aria-describedby="pvp-local-signal-help">' +
    escape(view.signal ?? '') +
    '</textarea>' +
    '<p id="pvp-local-signal-help" class="pvp-signal-help">' +
    (view.signal
      ? 'Salin seluruh kode, termasuk baris terakhir.'
      : view.busy
        ? 'Sedang menyiapkan kode koneksi.'
        : view.role === 'guest'
          ? 'Jawaban muncul setelah tawaran lawan diterapkan.'
          : 'Tawaran muncul setelah kamu memilih Putih.') +
    '</p>' +
    '<button class="hub-button" type="button" data-command="pvp-copy-signal"' +
    (view.signal ? '' : ' disabled') +
    '>Salin kode milikmu</button></div>' +
    '<div class="pvp-signal-field">' +
    '<label class="pvp-signal-label" for="pvp-remote-signal">' +
    remoteLabel +
    '</label><textarea id="pvp-remote-signal" class="pvp-signal pvp-signal-input" rows="6" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Tempel seluruh kode lawan" aria-describedby="pvp-remote-signal-help"' +
    (!view.role || view.busy || view.connected ? ' disabled' : '') +
    '>' +
    escape(view.remoteSignal) +
    '</textarea>' +
    '<p id="pvp-remote-signal-help" class="pvp-signal-help">Tempel kode tanpa mengubah atau memotong isinya.</p>' +
    '<button class="hub-button primary" type="button" data-command="pvp-apply-signal"' +
    (applyDisabled ? ' disabled' : '') +
    '>' +
    (view.busy ? 'Menyiapkan koneksi...' : view.role === 'host' ? 'Terapkan jawaban lawan' : 'Terapkan tawaran lawan') +
    '</button></div></div>' +
    '</section></div>' +
    '<p class="hub-footnote">Koneksi langsung antarbrowser (WebRTC), tanpa akun atau backend. Tanpa server TURN, NAT simetris atau firewall ketat dapat menghalangi koneksi. Jika gagal, tinggalkan sesi lalu coba jaringan lain.</p>' +
    '</section>'
  );
}

export function renderPvpDuel(view: PvpDuelView): string {
  const promotion = view.promotionOpen && view.localTurn
    ? '<dialog id="pvp-promotion-dialog" class="promotion-dialog pvp-promotion-dialog" aria-modal="true" aria-labelledby="pvp-promotion-title" aria-describedby="pvp-promotion-message">' +
      '<h2 id="pvp-promotion-title">Pilih bidak pengganti</h2><p id="pvp-promotion-message">' +
      escape(view.promotionMessage) +
      '</p><div class="promotion-options" role="group" aria-label="Pilihan bidak promosi">' +
      '<button class="promotion-choice" type="button" data-command="pvp-promotion" data-promotion="q"><span class="promotion-piece" aria-hidden="true">♕</span><span>Ratu</span></button>' +
      '<button class="promotion-choice" type="button" data-command="pvp-promotion" data-promotion="r"><span class="promotion-piece" aria-hidden="true">♖</span><span>Benteng</span></button>' +
      '<button class="promotion-choice" type="button" data-command="pvp-promotion" data-promotion="b"><span class="promotion-piece" aria-hidden="true">♗</span><span>Gajah</span></button>' +
      '<button class="promotion-choice" type="button" data-command="pvp-promotion" data-promotion="n"><span class="promotion-piece" aria-hidden="true">♘</span><span>Kuda</span></button>' +
      '</div></dialog>'
    : '';
  const opponentHand = view.opponentSlots.map(function (slot) {
    return '<li class="pvp-opponent-card"><div><strong>' +
      escape(slot.card.name) +
      '</strong><span>' +
      slot.cost +
      ' mana</span></div><p>' +
      escape(slot.card.desc) +
      '</p></li>';
  }).join('');

  return (
    '<header class="topbar pvp-topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">♔</div>' +
    '<div class="brand-copy"><h1>ChessRPG</h1><p>Takhta taktis / mode 1vs1</p></div></div>' +
    '<div class="hud-box"><span class="hud-label">Giliran</span><span class="hud-value">' +
    escape(view.turnLabel) +
    '</span></div>' +
    '<div class="top-actions">' +
    '<button class="utility-button" type="button" data-command="pvp-undo"' +
    (view.canUndo ? '' : ' disabled') +
    '>Batalkan giliran</button>' +
    '<button class="utility-button" type="button" data-command="pvp-restart"' +
    (view.canRestart ? '' : ' disabled') +
    '>Mulai ulang duel</button>' +
    '<button class="utility-button sound-button" type="button" data-command="sound" aria-pressed="' +
    String(view.soundEnabled) +
    '">Suara: ' +
    (view.soundEnabled ? 'ON' : 'OFF') +
    '</button>' +
    '<button class="utility-button" type="button" data-command="pvp-leave">Tinggalkan</button>' +
    '</div></header>' +
    '<main class="pvp-duel-layout">' +
    '<div class="pvp-duel-status"><p class="pvp-status" role="status" aria-live="polite" aria-atomic="true">' +
    escape(view.connectionStatus) +
    '</p>' +
    (view.error ? '<p class="pvp-error" role="alert">' + escape(view.error) + '</p>' : '') +
    '</div>' +
    '<aside class="pvp-side pvp-side-opponent" aria-labelledby="pvp-opponent-title">' +
    '<h2 id="pvp-opponent-title">Lawan / ' +
    (view.opponent.color === 'w' ? 'Putih' : 'Hitam') +
    '</h2><div class="pvp-hero-profile"><span class="hero-face pvp-opp-face" data-portrait="' +
    escape(view.opponent.portrait) +
    '" role="img" aria-label="Potret ' +
    escape(view.opponent.name) +
    '"></span><div><strong>' +
    escape(view.opponent.name) +
    '</strong><small>' +
    escape(view.opponent.role) +
    '</small></div></div>' +
    '<div class="pvp-resource"><span>EN</span><div class="energy-track" aria-hidden="true">' +
    energyPips(view.opponent.energy, 5) +
    '</div><strong>' +
    view.opponent.energy +
    '/5</strong></div>' +
    '<div class="pvp-resource pvp-resource-mana"><span>Mana</span><strong>' +
    view.opponent.mana +
    '/6</strong></div>' +
    '<div class="pvp-opponent-actions" aria-label="Aksi hero lawan"><div><span>Skill / ' +
    view.opponent.skillCost +
    ' EN</span><strong>' +
    escape(view.opponent.skillName) +
    '</strong></div><div><span>Ultimate / ' +
    view.opponent.ultimateCost +
    ' EN</span><strong>' +
    escape(view.opponent.ultimateName) +
    '</strong></div></div>' +
    '<h3>Tangan lawan</h3><ul class="pvp-opponent-hand">' +
    opponentHand +
    '</ul></aside>' +
    '<section class="board-panel pvp-board-panel" aria-labelledby="pvp-board-title">' +
    '<div class="board-heading"><div>' +
    '<h2 id="pvp-board-title">Papan pertempuran</h2><small>Giliran ' +
    escape(view.turnLabel) +
    '</small></div><div class="turn-flag ' +
    escape(view.turnFlagClass) +
    '" aria-live="polite">' +
    escape(view.turnFlag) +
    '</div></div>' +
    '<div class="board-stage"><div class="board-frame"><div class="board' +
    (view.board.targeting ? ' is-targeting' : '') +
    '" role="grid" aria-label="Papan catur 8 kali 8">' +
    renderBoard(view.board) +
    '</div></div></div>' +
    '<div class="board-status-row"><p class="board-status" role="status" aria-live="polite" aria-atomic="true">' +
    escape(view.boardStatus) +
    '</p>' +
    (view.canCancelTarget
      ? '<button class="target-cancel" type="button" data-command="pvp-cancel-target">Batalkan target</button>'
      : '') +
    '</div>' +
    (view.gameOver
      ? '<div class="pvp-winner" role="status">' + escape(view.winnerText) + '</div>'
      : '') +
    '</section>' +
    '<aside class="pvp-side pvp-side-self" aria-labelledby="pvp-self-title">' +
    '<h2 id="pvp-self-title">Kamu / ' +
    (view.self.color === 'w' ? 'Putih' : 'Hitam') +
    '</h2><div class="pvp-hero-profile"><span class="hero-face pvp-opp-face" data-portrait="' +
    escape(view.self.portrait) +
    '" role="img" aria-label="Potret ' +
    escape(view.self.name) +
    '"></span><div><strong>' +
    escape(view.self.name) +
    '</strong><small>' +
    escape(view.self.role) +
    '</small></div></div>' +
    '<div class="pvp-resource"><span>EN</span><div class="energy-track" aria-hidden="true">' +
    energyPips(view.self.energy, 5) +
    '</div><strong>' +
    view.self.energy +
    '/5</strong></div>' +
    '<div class="pvp-resource pvp-resource-mana"><span>Mana</span><strong>' +
    view.self.mana +
    '/6</strong></div>' +
    '<p class="pvp-resource-note">Kartu: mana / hero: EN</p>' +
    '<button class="hero-action-button' +
    (!view.self.skillDisabled && !view.self.skillTargeting ? ' is-ready' : '') +
    (view.self.skillTargeting ? ' is-targeting' : '') +
    '" type="button" data-command="pvp-hero-skill" aria-pressed="' +
    String(view.self.skillTargeting) +
    '"' +
    (view.self.skillDisabled ? ' disabled' : '') +
    '><span>Skill / <b>' +
    view.self.skillCost +
    '</b> EN</span><strong>' +
    escape(view.self.skillTargeting ? 'Pilih target...' : view.self.skillName) +
    '</strong></button>' +
    '<button class="hero-action-button ultimate' +
    (!view.self.ultimateDisabled && !view.self.ultimateTargeting ? ' is-ready' : '') +
    (view.self.ultimateTargeting ? ' is-targeting' : '') +
    '" type="button" data-command="pvp-hero-ultimate" aria-pressed="' +
    String(view.self.ultimateTargeting) +
    '"' +
    (view.self.ultimateDisabled ? ' disabled' : '') +
    '><span>Ultimate / <b>' +
    view.self.ultimateCost +
    '</b> EN</span><strong>' +
    escape(view.self.ultimateTargeting ? 'Pilih target...' : view.self.ultimateName) +
    '</strong></button></aside>' +
    '<section class="rail pvp-hand-rail" aria-labelledby="pvp-hand-title">' +
    '<div class="pvp-hand-heading"><h2 id="pvp-hand-title">Tangan kartu kamu</h2>' +
    '<button class="roll-availability" type="button" data-command="pvp-reroll" aria-label="Putar kartu. ' +
    escape(view.rerollLabel) +
    '. Biaya ' +
    view.rerollCost +
    ' EN."' +
    (view.rerollAvailable ? '' : ' disabled') +
    '><span class="roll-counter">Putar kartu</span><small class="roll-caption">' +
    escape(view.rerollLabel) +
    '</small></button></div>' +
    '<div class="skill-list" role="list" aria-label="Tiga kartu kamu">' +
    renderHand(view.slots, 'pvp-card') +
    '</div></section></main>' +
    promotion
  );
}

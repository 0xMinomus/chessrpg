import { renderBoard } from '../board/board.ts';
import type { BoardViewState, PieceColor } from '../board/board.ts';
import { renderHand, renderReroll } from '../cards/cards.ts';
import type { CardSlotView, RerollView } from '../cards/cards.ts';

export interface OnlinePlayerSetup {
  heroName: string;
  deckStatus: string;
}

export interface OnlineHomeView {
  mode: 'home';
  status: string;
  error?: string;
}

export interface OnlineQueueView {
  mode: 'matchmaking';
  status: string;
  connectionText: string;
  color: PieceColor | 'random';
  player: OnlinePlayerSetup;
  error?: string;
  busy?: boolean;
}

export interface OnlineRoomView {
  mode: 'room';
  status: string;
  connectionText: string;
  roomCode: string;
  color: PieceColor | 'random';
  player: OnlinePlayerSetup;
  error?: string;
  busy?: boolean;
}

export interface OnlinePromotionView {
  open: boolean;
  message: string;
}

export interface OnlinePageBattleView {
  mode: 'battle';
  board: BoardViewState;
  localHeroName: string;
  localColor: PieceColor;
  opponentHeroName: string;
  opponentColor: PieceColor;
  mana: number;
  energy: number;
  turn: string;
  status: string;
  connectionText: string;
  roomCode: string;
  slots: CardSlotView[];
  reroll: RerollView;
  promotion: OnlinePromotionView;
  localPremove: { from: [number, number]; to: [number, number] } | null;
  remoteSelection: { from: [number, number]; to: [number, number] } | null;
  skillLabel: string;
  ultimateLabel: string;
  skillDisabled?: boolean;
  ultimateDisabled?: boolean;
  skillTargeting?: boolean;
  ultimateTargeting?: boolean;
  canExit?: boolean;
}

export type OnlinePageView = OnlineHomeView | OnlineQueueView | OnlineRoomView | OnlinePageBattleView;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, function (character) {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    if (character === '"') return '&quot;';
    return '&#39;';
  });
}


function colorChoices(selected: PieceColor | 'random', disabled = false): string {
  return (
    '<fieldset class="online-color-picker"><legend>Pilih warna bidak</legend>' +
    ([['w', 'Putih'], ['random', 'Acak'], ['b', 'Hitam']] as const)
      .map(function (choice) {
        const checked = selected === choice[0];
        return '<label class="online-color-option' + (checked ? ' selected' : '') + '"><input type="radio" name="online-color" data-command="online-color-pick" data-pick="' + choice[0] + '" value="' + choice[0] + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="online-color-swatch ' + choice[0] + '" aria-hidden="true"></span><span>' + choice[1] + '</span></label>';
      })
      .join('') +
    '</fieldset>'
  );
}

function playerSummary(player: OnlinePlayerSetup): string {
  return '<dl class="online-loadout"><div><dt>Hero dipilih</dt><dd>' + escapeHtml(player.heroName) + '</dd></div><div><dt>Dek</dt><dd>' + escapeHtml(player.deckStatus) + '</dd></div></dl>';
}

function errorNotice(error: string | undefined): string {
  return error ? '<p class="online-error" role="alert">' + escapeHtml(error) + '</p>' : '';
}

function home(view: OnlineHomeView): string {
  return '<main class="online-page online-home" aria-labelledby="online-title"><section class="online-intro"><span class="eyebrow">Tantangan langsung</span><h1 id="online-title">Pertandingan online</h1><p>Hadapi pemain lain. Pilih cara bertanding, lalu sambungkan dua papan.</p><p class="online-status" aria-live="polite">' + escapeHtml(view.status) + '</p>' + errorNotice(view.error) + '</section><section class="online-actions" aria-label="Pilih mode pertandingan"><button class="online-action online-action-primary" type="button" data-command="online-matchmaking"><strong>Temukan lawan</strong><span>Masuk antrean pertandingan terbuka.</span></button><button class="online-action" type="button" data-command="online-create-room"><strong>Buat ruang</strong><span>Bagikan kode 5 digit kepada lawan.</span></button><form class="online-join" data-online-join><label for="online-room-code">Kode ruang</label><div><input id="online-room-code" name="roomCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{5}" minlength="5" maxlength="5" placeholder="Contoh: 48217" aria-describedby="online-code-help"><button class="online-action-button" type="submit" data-command="online-join-room">Gabung</button></div><small id="online-code-help">Masukkan tepat 5 digit dari pemilik ruang.</small></form></section></main>';
}

function queue(view: OnlineQueueView): string {
  return '<main class="online-page online-setup" aria-labelledby="online-title"><header class="online-page-head"><div><span class="eyebrow">Antrean lawan</span><h1 id="online-title">Siapkan pertandingan</h1></div><p class="online-status" aria-live="polite">' + escapeHtml(view.status) + '</p></header><div class="online-setup-grid"><section class="online-setup-panel" aria-label="Pilihan warna dan koneksi">' + colorChoices(view.color) + '<p class="online-connection" role="status">' + escapeHtml(view.connectionText) + '</p>' + errorNotice(view.error) + '<div class="online-button-row"><button class="online-action-button online-primary" type="button" data-command="online-ready"' + (view.busy ? ' disabled' : '') + '>Siap mencari</button><button class="online-action-button online-secondary" type="button" data-command="online-cancel">Batal</button></div></section><aside class="online-setup-panel online-loadout-panel" aria-label="Loadout pertandingan">' + playerSummary(view.player) + '<p class="online-note">Pencarian menunggu lawan yang juga siap. Koneksi dapat memerlukan beberapa saat.</p></aside></div></main>';
}

function room(view: OnlineRoomView): string {
  const code = escapeHtml(view.roomCode);
  return (
    '<main class="online-page online-setup" aria-labelledby="online-title">' +
    '<header class="online-page-head"><div><span class="eyebrow">Ruang tantangan</span><h1 id="online-title">Undang lawan</h1></div><p class="online-status" aria-live="polite">' +
    escapeHtml(view.status) +
    '</p></header><div class="online-setup-grid"><section class="online-setup-panel online-room-code-panel" aria-label="Kode ruang">' +
    '<p class="online-code-label">Kode ruang · bagikan kepada lawan</p><strong class="online-room-code" aria-label="Kode ruang ' +
    code.split('').join(' ') +
    '">' +
    code +
    '</strong><button class="online-action-button online-secondary" type="button" data-command="online-copy-code">Salin kode</button><p class="online-connection" role="status">' +
    escapeHtml(view.connectionText) +
    '</p>' +
    errorNotice(view.error) +
    '<div class="online-button-row"><button class="online-action-button online-primary" type="button" data-command="online-ready"' +
    (view.busy ? ' disabled' : '') +
    '>Siap</button><button class="online-action-button online-secondary" type="button" data-command="online-cancel">Batalkan ruang</button></div></section><aside class="online-setup-panel online-loadout-panel" aria-label="Pilihan pemain">' +
    colorChoices(view.color, view.busy === true) +
    playerSummary(view.player) +
    '<p class="online-note">Lawan akan tersambung setelah membuka kode ini. Tetap di ruang sampai status koneksi berubah.</p></aside></div></main>'
  );
}

function promotion(view: OnlinePromotionView): string {
  if (!view.open) return '';
  return '<dialog class="promotion-dialog online-promotion" open aria-labelledby="online-promotion-title" aria-describedby="online-promotion-message"><span class="eyebrow">Langkah terakhir</span><h2 id="online-promotion-title">Pilih bidak promosi</h2><p id="online-promotion-message">' + escapeHtml(view.message) + '</p><div class="promotion-options" role="group" aria-label="Pilihan bidak promosi"><button class="promotion-choice" type="button" data-command="promotion" data-promotion="q" aria-label="Promosikan menjadi ratu"><span class="promotion-piece" aria-hidden="true">♕</span><span>Ratu</span></button><button class="promotion-choice" type="button" data-command="promotion" data-promotion="r" aria-label="Promosikan menjadi benteng"><span class="promotion-piece" aria-hidden="true">♖</span><span>Benteng</span></button><button class="promotion-choice" type="button" data-command="promotion" data-promotion="b" aria-label="Promosikan menjadi gajah"><span class="promotion-piece" aria-hidden="true">♗</span><span>Gajah</span></button><button class="promotion-choice" type="button" data-command="promotion" data-promotion="n" aria-label="Promosikan menjadi kuda"><span class="promotion-piece" aria-hidden="true">♘</span><span>Kuda</span></button></div></dialog>';
}

function battle(view: OnlinePageBattleView): string {
  const perspective = view.localColor === 'b' ? 'Hitam' : 'Putih';
  const actions =
    '<div class="online-board-actions"><button class="online-action-button" type="button" data-command="hero-skill"' +
    (view.skillDisabled ? ' disabled' : '') +
    '>' +
    escapeHtml(view.skillLabel) +
    '</button><button class="online-action-button" type="button" data-command="hero-ultimate"' +
    (view.ultimateDisabled ? ' disabled' : '') +
    '>' +
    escapeHtml(view.ultimateLabel) +
    '</button><button class="online-action-button online-danger" type="button" data-command="resign"' +
    (view.board.disabled ? ' disabled' : '') +
    '>Menyerah</button>' +
    (view.localPremove
      ? '<button class="online-action-button online-secondary" type="button" data-command="online-clear-premove">Batalkan premove</button>'
      : '') +
    (view.canExit
      ? '<button class="online-action-button online-secondary" type="button" data-command="online-exit">Kembali ke lobi</button>'
      : '') +
    '</div>';
  return (
    '<main class="online-battle" aria-label="Pertandingan online"><header class="online-battle-head"><div class="online-match-title"><span class="eyebrow">Ruang ' +
    escapeHtml(view.roomCode) +
    '</span><h1>Pertandingan</h1></div><p class="online-connection" role="status" aria-live="polite">' +
    escapeHtml(view.connectionText) +
    '</p><div class="online-turn" aria-live="polite"><span>Giliran</span><strong>' +
    escapeHtml(view.turn) +
    '</strong></div></header><div class="online-player-strip"><section class="online-player local-player" aria-label="Pemain lokal"><span class="online-piece-color ' +
    view.localColor +
    '" aria-hidden="true"></span><div><small>' +
    perspective +
    ' · Anda</small><strong>' +
    escapeHtml(view.localHeroName) +
    '</strong></div><span class="online-resource">Mana <b>' +
    view.mana +
    '</b></span><span class="online-resource">Energi <b>' +
    view.energy +
    '</b></span></section><span class="online-versus" aria-hidden="true">VS</span><section class="online-player opponent-player" aria-label="Lawan"><span class="online-piece-color ' +
    view.opponentColor +
    '" aria-hidden="true"></span><div><small>' +
    (view.opponentColor === 'w' ? 'Putih' : 'Hitam') +
    ' · Lawan</small><strong>' +
    escapeHtml(view.opponentHeroName) +
    '</strong></div></section></div><div class="online-battle-grid"><section class="online-board-panel" aria-label="Papan dan status pertandingan"><div class="online-board-frame"><div class="board' +
    (view.board.targeting ? ' is-targeting' : '') +
    '" role="grid" aria-label="Papan catur, orientasi ' +
    perspective.toLowerCase() +
    '">' +
    renderBoard({ ...view.board, perspective: view.localColor, remoteSelection: view.remoteSelection, premove: view.localPremove }) +
    '</div></div><p class="online-board-status" aria-live="polite">' +
    escapeHtml(view.status) +
    '</p><p class="online-annotation-key">Garis putus-putus: pilihan atau premove lawan · Garis ganda: premove Anda</p>' +
    actions +
    (view.skillTargeting || view.ultimateTargeting || view.board.targeting
      ? '<button class="online-action-button online-secondary" type="button" data-command="cancel-target"' +
        (view.board.disabled ? ' disabled' : '') +
        '>Batalkan target</button>'
      : '') +
    '</section><aside class="online-hand-panel" aria-label="Tangan kartu"><div class="online-hand-heading"><h2>Kartu</h2><span>Mana ' +
    view.mana +
    '</span></div><div class="online-card-hand" role="list">' +
    renderHand(view.slots) +
    '</div>' +
    renderReroll(view.reroll) +
    '</aside></div></main>' +
    promotion(view.promotion)
  );
}

export function renderOnlinePage(view: OnlinePageView): string {
  if (view.mode === 'home') return home(view);
  if (view.mode === 'matchmaking') return queue(view);
  if (view.mode === 'room') return room(view);
  return battle(view);
}

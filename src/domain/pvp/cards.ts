// Kartu PvP: semua efek warna-relatif (caster vs lawan), port semantik
// dari domain/battle/effects.ts tanpa asumsi "putih = manusia".
//
// Kontrak: fungsi-fungsi di sini dipanggil lewat command di commands.ts dan
// tidak memakai state UI. Setiap efek menulis state imutabel.

import type { Board, Piece } from '../chess/board.ts';
import { coord, isInCheck as chessIsInCheck } from '../chess/moves.ts';
import {
  EN_CAP,
  isBusy,
  otherColor,
  sideOf,
  type Color,
  type PvpDeps,
  type PvpState,
} from './state.ts';
import {
  canPlayPvpCard,
  clearPvpPieceEffects,
  concludePvpMove,
  currentPvpCardCost,
  findRevivalPiece,
  gainPvpEnergy,
  hasPvpEdictTarget,
  hasPvpJokerTarget,
  losePvpEnergy,
  patchEffects,
  payPvpCardCost,
  pvpRevivalTargets,
  refundPvpCardCost,
  replacePvpHandSlot,
  updatePvpCastlingRights,
} from './rules.ts';
export const PIECE_NAMES: Record<string, string> = {
  k: 'raja',
  q: 'ratu',
  r: 'benteng',
  b: 'gajah',
  n: 'kuda',
  p: 'pion',
};

export const TARGET_CARD_IDS = [
  'lancer',
  'ward',
  'pawnstep',
  'mark',
  'phase',
  'prism',
  'pawnraid',
  'rookbend',
  'stagger',
  'snare',
  'sacrifice',
  'blockade',
  'relay',
  'pawnGuard',
  'pawnMark',
  'pawnStagger',
  'fold',
  'edict',
  'phoenix',
] as const;

const TARGET_PROMPTS: Record<string, (c: Color, o: Color) => string> = {
  lancer: function (c) { return 'Pilih bidak ' + colorName(c) + ' selain raja untuk bergerak seperti kuda.'; },
  ward: function (c) { return 'Pilih bidak ' + colorName(c) + ' selain raja untuk dilindungi.'; },
  pawnstep: function (c) { return 'Pilih pion ' + colorName(c) + ' untuk langkah ganda.'; },
  mark: function (_c, o) { return 'Pilih bidak ' + colorName(o) + ' selain raja untuk ditandai.'; },
  phase: function (c) { return 'Pilih bidak ' + colorName(c) + ' selain raja untuk berpindah.'; },
  fold: function (c) { return 'Pilih bidak ' + colorName(c) + ' selain raja untuk Lipatan Dimensi.'; },
  prism: function (c) { return 'Pilih gajah atau benteng ' + colorName(c) + '.'; },
  pawnraid: function (c) { return 'Pilih pion ' + colorName(c) + ' yang dapat menangkap lurus.'; },
  rookbend: function (c) { return 'Pilih benteng ' + colorName(c) + '.'; },
  stagger: function (_c, o) { return 'Pilih bidak ' + colorName(o) + ' selain raja untuk digentarkan.'; },
  snare: function (_c, o) { return 'Pilih bidak ' + colorName(o) + ' selain raja untuk dijerat.'; },
  sacrifice: function (c) { return 'Pilih pion ' + colorName(c) + ' yang akan dikorbankan. Ini memakai langkahmu.'; },
  pawnGuard: function (c) { return 'Pilih pion ' + colorName(c) + ' untuk ditamengi.'; },
  pawnMark: function (_c, o) { return 'Pilih pion ' + colorName(o) + ' untuk ditandai.'; },
  pawnStagger: function (_c, o) { return 'Pilih pion ' + colorName(o) + ' yang tak dapat menangkap pada balasan.'; },
  blockade: function () { return 'Pilih petak kosong untuk ditutup selama 2 balasan lawan.'; },
  relay: function (c) { return 'Pilih bidak ' + colorName(c) + ' pertama untuk ditukar.'; },
  edict: function (_c, o) { return 'Pilih satu bidak ' + colorName(o) + ' selain raja dan ratu untuk dihapus.'; },
  phoenix: function (c) {
    const rank = c === 'w' ? 'dua baris awal putih' : 'dua baris awal hitam';
    return 'Pilih petak kosong di ' + rank + ' untuk menempatkan bidak yang bangkit.';
  },
};

export function colorName(color: Color): string {
  return color === 'w' ? 'putih' : 'hitam';
}

export function pieceAt(board: Board, row: number, col: number): Piece | null {
  return board[row][col];
}

export function findPieceSquare(board: Board, pieceId: number): [number, number] | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.id === pieceId) return [row, col];
    }
  }
  return null;
}

export interface PvpCardPlayResult {
  state: PvpState;
  ok: boolean;
  message: string;
  /** True bila resolusi target menghabiskan langkah (relay, tumbal). */
  moveConsumed: boolean;
}

function fail(state: PvpState, message: string): PvpCardPlayResult {
  return { state: { ...state, status: message }, ok: false, message, moveConsumed: false };
}

function completeTargetCard(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  message: string,
  selected: [number, number] | null,
): PvpState {
  const slot = state.activeSlot;
  const cleared: PvpState = {
    ...state,
    activeSide: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected,
    status: message,
  };
  if (slot == null) return cleared;
  return replacePvpHandSlot(cleared, deps, color, slot, state.sides[color].hand[slot]);
}

export function playPvpCard(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  slot: number,
): PvpCardPlayResult {
  const side = sideOf(state, color);
  const id = side.hand[slot];
  const card = id ? deps.cards[id] : undefined;
  if (!card) return fail(state, state.status);
  if (state.gameOver) return fail(state, state.status);
  if (state.activeSide === color && state.activeSlot === slot) {
    // Klik kartu yang sedang aktif = batalkan target.
    return cancelPvpTarget(state, deps, color);
  }
  if (isBusy(state, color)) return fail(state, state.status);
  const hero = deps.heroes[side.heroId] ?? Object.values(deps.heroes)[0];
  const playable = canPlayPvpCard(state, color, card, hero);
  if (!playable.ok) return fail(state, playable.reason);
  if (id === 'ration' && side.energy >= EN_CAP) {
    return fail(state, 'Energi sudah penuh. Simpan Ransum fokus.');
  }
  if (id === 'fortune' && side.bonusRerolls) {
    return fail(state, 'Bonus putar ulang giliran ini sudah dipakai.');
  }
  if (id === 'reserve' && side.effects.reserveArmed) {
    return fail(state, 'Fokus cadangan sudah menunggu kartu berikutnya.');
  }
  if (id === 'surcharge' && sideOf(state, otherColor(color)).effects.surcharge) {
    return fail(state, 'Pajak mantra sudah terpasang pada lawan.');
  }
  const flat = state.board.flat();
  if (
    id === 'sacrifice' &&
    !flat.some(function (piece) {
      return piece != null && piece.side === color && piece.type === 'p';
    })
  ) {
    return fail(state, 'Tidak ada pion sendiri yang bisa dikorbankan.');
  }
  if (
    id === 'relay' &&
    flat.filter(function (piece) {
      return piece != null && piece.side === color && piece.type !== 'k';
    }).length < 2
  ) {
    return fail(state, 'Relay membutuhkan dua bidak sendiri selain raja.');
  }
  if (
    id === 'pawnGuard' &&
    !flat.some(function (piece) {
      return piece != null && piece.side === color && piece.type === 'p';
    })
  ) {
    return fail(state, 'Tidak ada pion sendiri yang bisa dilindungi.');
  }
  if (
    (id === 'pawnMark' || id === 'pawnStagger') &&
    !flat.some(function (piece) {
      return piece != null && piece.side === otherColor(color) && piece.type === 'p';
    })
  ) {
    return fail(state, 'Tidak ada pion lawan yang bisa ditargetkan.');
  }
  if (id === 'phoenix' && pvpRevivalTargets(state, color).length === 0) {
    return fail(state, 'Belum ada bidak sendiri non-ratu yang bisa dibangkitkan.');
  }
  if (id === 'fold' && !hasPvpJokerTarget(state.board, color)) {
    return fail(state, 'Tidak ada bidak sendiri selain raja untuk dipindahkan.');
  }
  if (id === 'edict' && !hasPvpEdictTarget(state.board, otherColor(color))) {
    return fail(state, 'Tidak ada bidak lawan selain raja dan ratu untuk dihapus.');
  }
  const cost = currentPvpCardCost(card, hero, side.effects.reserveArmed);
  const discountUsed = side.effects.reserveArmed;
  const paid = payPvpCardCost(state, color, card, hero);
  if ((TARGET_CARD_IDS as readonly string[]).indexOf(id) !== -1) {
    const prompt = TARGET_PROMPTS[id](color, otherColor(color));
    const targeted: PvpState = {
      ...paid,
      activeSide: color,
      activeSkill: id,
      activeSlot: slot,
      activeSkillCost: cost,
      activeSkillDiscounted: discountUsed,
      selected: null,
      relayFirstId: null,
      status: prompt + ' Tekan Batal untuk mengembalikan mana.',
    };
    return { state: targeted, ok: true, message: targeted.status, moveConsumed: false };
  }
  const next = applyPvpInstantCard(paid, deps, color, slot);
  return { state: next, ok: true, message: next.status, moveConsumed: false };
}

/** Efek kartu tanpa target: pasang flag + status (cerminan applyInstantCard). */
export function applyPvpInstantCard(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  slot: number,
): PvpState {
  const id = state.sides[color].hand[slot];
  const other = otherColor(color);
  let next = state;
  if (id === 'tempo') {
    next = patchEffects(next, color, { tempoArmed: true });
    next = { ...next, status: 'Tempo ganda siap. Tangkapan berikutnya memberi satu langkah tambahan.' };
  }
  if (id === 'ration') {
    const before = sideOf(next, color).energy;
    next = gainPvpEnergy(next, color, 2);
    next = { ...next, status: 'Ransum pulih ' + (sideOf(next, color).energy - before) + ' EN.' };
  }
  if (id === 'disrupt') {
    next = applyPvpDisrupt(next, color);
  }
  if (id === 'focus') {
    next = patchEffects(next, color, { focusCaptureArmed: true });
    next = { ...next, status: 'Taktik presisi siap: tangkapan berikutnya memberi +1 EN.' };
  }
  if (id === 'pierce') {
    next = patchEffects(next, color, { pierceArmed: true });
    next = { ...next, status: 'Tembus perisai siap untuk satu langkah.' };
  }
  if (id === 'shock') {
    next = patchEffects(next, color, { shockArmed: true });
    next = { ...next, status: 'Pukulan guntur siap: berikan skak pada langkah berikutnya.' };
  }
  if (id === 'leech') {
    next = patchEffects(next, color, { leechArmed: true });
    next = { ...next, status: 'Lintah arkanum siap pada tangkapan berikutnya.' };
  }
  if (id === 'surcharge') {
    next = patchEffects(next, other, { surcharge: 1 });
    next = { ...next, status: 'Skill lawan berikutnya membutuhkan +1 EN.' };
  }
  if (id === 'counterspell') {
    const enemySide = sideOf(next, other);
    const hadPlan = Boolean(
      enemySide.effects.wardPieceId ?? enemySide.effects.parryArmed,
    );
    next = patchEffects(next, other, { wardPieceId: null, wardTurns: 0, parryArmed: false });
    if (!hadPlan) next = losePvpEnergy(next, other, 1);
    next = {
      ...next,
      status: hadPlan
        ? 'Perisai dan rencana lawan dipatahkan.'
        : 'Tidak ada rencana aktif. Inti lawan kehilangan 1 EN.',
    };
  }
  if (id === 'parry') {
    next = patchEffects(next, color, { parryArmed: true });
    next = { ...next, status: 'Tangkis arus siap menghadapi Kuras inti berikutnya.' };
  }
  if (id === 'riposte') {
    next = patchEffects(next, color, { riposteArmed: true });
    next = { ...next, status: 'Balas tusuk siap pada tangkapan lawan berikutnya.' };
  }
  if (id === 'reserve') {
    next = patchEffects(next, color, { reserveArmed: true });
    next = { ...next, status: 'Fokus cadangan: kartu berikutnya lebih murah 1 mana.' };
  }
  if (id === 'quiet') {
    next = patchEffects(next, color, { quietArmed: true });
    next = { ...next, status: 'Arus sunyi: langkah tanpa tangkapan memulihkan 1 EN.' };
  }
  if (id === 'pawnBreath') {
    next = patchEffects(next, color, { pawnBreathArmed: true });
    next = { ...next, status: 'Napas pion siap: langkah pion tanpa tangkapan memulihkan 1 EN.' };
  }
  if (id === 'pawnPulse') {
    next = patchEffects(next, color, { pawnPulseArmed: true });
    next = { ...next, status: 'Denyut pion siap: skak dari pion menguras 1 EN lawan.' };
  }
  if (id === 'lastLaugh') {
    next = patchEffects(next, color, { lastLaughArmed: true });
    next = { ...next, status: 'Bangkit balik siap jika lawan memberi skak.' };
  }
  if (id === 'salvage') {
    next = patchEffects(next, color, { salvageArmed: true });
    next = { ...next, status: 'Rongsokan siap: tangkapan berikutnya memberi +1 EN.' };
  }
  if (id === 'fortune') {
    next = patchEffects(next, color, {});
    next = {
      ...next,
      sides: {
        ...next.sides,
        [color]: { ...next.sides[color], bonusRerolls: 1 },
      },
      status: 'Satu putar ulang ekstra tersedia giliran ini.',
    };
  }
  return replacePvpHandSlot(next, deps, color, slot, id);
}

/** Kuras inti (disrupt): −2 EN lawan; ditangkis parry, dibatalkan pasif Nila. */
export function applyPvpDisrupt(state: PvpState, color: Color): PvpState {
  const other = otherColor(color);
  const enemySide = sideOf(state, other);
  let next = state;
  if (enemySide.effects.parryArmed) {
    next = patchEffects(next, other, { parryArmed: false });
    next = gainPvpEnergy(next, other, 1);
    return { ...next, status: 'Kuras inti dipantulkan Tangkis arus. Lawan pulih 1 EN.' };
  }
  if (state.sides[other].heroId === 'nila' && !enemySide.effects.drainBlockedOnce) {
    next = patchEffects(next, other, { drainBlockedOnce: true });
    return { ...next, status: 'Embun Nila membatalkan Kuras inti pertama.' };
  }
  next = losePvpEnergy(next, other, 2);
  return { ...next, status: 'Inti lawan kehilangan 2 EN.' };
}

/** Batalkan target kartu aktif; kembalikan mana. */
export function cancelPvpTarget(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpCardPlayResult {
  if (state.activeSide !== color || !state.activeSkill) {
    return fail(state, state.status);
  }
  if (state.activeSkill.indexOf('hero:') === 0) {
    const label = state.activeSkill.indexOf('hero:ultimate:') === 0 ? 'Ultimate' : 'Skill';
    const cleared: PvpState = {
      ...state,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
      status: 'Target ' + label.toLowerCase() + ' hero dibatalkan.',
    };
    return { state: cleared, ok: true, message: cleared.status, moveConsumed: false };
  }
  const card = deps.cards[state.activeSkill];
  const name = card ? card.name : state.activeSkill;
  let next = refundPvpCardCost(state, color, state.activeSkillCost);
  if (state.activeSkillDiscounted) {
    next = patchEffects(next, color, { reserveArmed: true });
  }
  next = {
    ...next,
    activeSide: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected: null,
    status: name + ' dibatalkan. Mana dikembalikan.',
  };
  return { state: next, ok: true, message: next.status, moveConsumed: false };
}

/** Resolusi target kartu pada petak papan (warna-relatif). */
export function resolvePvpTarget(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  row: number,
  col: number,
): PvpCardPlayResult {
  const id = state.activeSkill;
  if (!id) return fail(state, state.status);
  if (state.activeSide !== color) return fail(state, state.status);
  const other = otherColor(color);
  const piece = pieceAt(state.board, row, col);
  if (id === 'phoenix') {
    const targets = pvpRevivalTargets(state, color);
    const allowed = targets.some(function (square) {
      return square[0] === row && square[1] === col;
    });
    if (!allowed) {
      return fail(state, 'Pilih petak kosong di dua baris awal sendiri yang aman dari skak.');
    }
    const revival = pvpRevivalPick(state, color);
    if (!revival) return fail(state, 'Belum ada bidak sendiri non-ratu yang gugur untuk dibangkitkan.');
    const placed = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    placed[row][col] = { ...revival.piece };
    const graveyard = state.graveyard[color].slice();
    graveyard.splice(revival.index, 1);
    const done = completeTargetCard(
      { ...state, board: placed, graveyard: { ...state.graveyard, [color]: graveyard } },
      deps,
      color,
      PIECE_NAMES[revival.piece.type] + ' ' + colorName(color) + ' bangkit di ' + coord(row, col) + '.',
      null,
    );
    return { state: done, ok: true, message: done.status, moveConsumed: false };
  }
  if (id === 'edict') {
    if (!piece || piece.side !== other || piece.type === 'k' || piece.type === 'q') {
      return fail(state, 'Pilih satu bidak ' + colorName(other) + ' selain raja dan ratu.');
    }
    const cleared = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    cleared[row][col] = null;
    let enPassant = state.enPassant;
    const enPassantPawnRow = enPassant ? enPassant[0] + (other === 'b' ? 1 : -1) : -1;
    if (piece.type === 'p' && enPassant && row === enPassantPawnRow && col === enPassant[1]) {
      enPassant = null;
    }
    const castling = updatePvpCastlingRights(state.castling, piece, [row, col], null, [row, col]);
    let next: PvpState = { ...state, board: cleared, enPassant, castling };
    next = clearPvpPieceEffects(next, piece);
    const done = completeTargetCard(
      next,
      deps,
      color,
      PIECE_NAMES[piece.type] + ' ' + colorName(other) + ' dihapus. Ini bukan tangkapan.',
      null,
    );
    return { state: done, ok: true, message: done.status, moveConsumed: false };
  }
  if (id === 'relay') {
    return resolvePvpRelay(state, deps, color, row, col, piece);
  }
  if (id === 'blockade') {
    if (piece) return fail(state, 'Blokade hanya dapat menutup petak kosong.');
    const done = completeTargetCard(
      patchEffects(state, color, { blockadeSquare: [row, col], blockadeTurns: 2 }),
      deps,
      color,
      'Blokade dipasang di ' + coord(row, col) + ' selama 2 balasan lawan.',
      null,
    );
    return { state: done, ok: true, message: done.status, moveConsumed: false };
  }
  const enemyTarget =
    id === 'mark' || id === 'stagger' || id === 'snare' || id === 'pawnMark' || id === 'pawnStagger';
  const wants = enemyTarget ? other : color;
  if (!piece || piece.side !== wants) {
    return fail(
      state,
      enemyTarget
        ? 'Pilih bidak ' + colorName(other) + ' selain raja.'
        : 'Pilih bidak ' + colorName(color) + ' yang sesuai.',
    );
  }
  if (
    piece.type === 'k' &&
    ['lancer', 'ward', 'phase', 'fold', 'mark', 'stagger', 'snare'].indexOf(id) !== -1
  ) {
    return fail(state, 'Skill ini tidak menargetkan raja.');
  }
  if (['pawnGuard', 'pawnMark', 'pawnStagger'].indexOf(id) !== -1 && piece.type !== 'p') {
    return fail(state, 'Kartu ini hanya menargetkan pion.');
  }
  if ((id === 'pawnstep' || id === 'pawnraid') && piece.type !== 'p') {
    return fail(state, 'Skill ini hanya menargetkan pion.');
  }
  if (id === 'prism' && piece.type !== 'b' && piece.type !== 'r') {
    return fail(state, 'Prisma gerak hanya menargetkan gajah atau benteng.');
  }
  if (id === 'rookbend' && piece.type !== 'r') {
    return fail(state, 'Belok benteng hanya menargetkan benteng.');
  }
  if (id === 'sacrifice') {
    if (piece.type !== 'p') return fail(state, 'Tumbal pion hanya dapat mengorbankan pion.');
    const removed = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    removed[row][col] = null;
    if (chessIsInCheck(removed, color)) {
      return fail(state, 'Pion itu menjaga raja dari skak. Pilih pion lain.');
    }
    const sacrificed: PvpState = {
      ...state,
      board: removed,
      enPassant: null,
      lastMove: null,
      ply: state.ply + 1,
      history: state.history.concat([
        {
          color,
          piece: 'p',
          from: coord(row, col),
          to: coord(row, col),
          capture: false,
          captured: null,
          castle: null,
          promotion: null,
          note: 'Tumbal pion: +3 EN',
        },
      ]),
    };
    const withEnergy = {
      ...sacrificed,
      sides: {
        ...sacrificed.sides,
        [color]: {
          ...sacrificed.sides[color],
          energy: Math.min(EN_CAP, sacrificed.sides[color].energy + 3),
        },
      },
    };
    const hero = deps.heroes[state.sides[color].heroId] ?? Object.values(deps.heroes)[0];
    const done = completeTargetCard(withEnergy, deps, color, 'Pion dikorbankan. Pulih 3 EN.', null);
    const concluded = concludePvpMove(done, color, hero, null, false);
    return { state: concluded, ok: true, message: concluded.status, moveConsumed: true };
  }
  let next: PvpState = state;
  if (id === 'lancer') next = patchEffects(next, color, { knightTargetId: piece.id });
  if (id === 'ward' || id === 'pawnGuard') {
    next = patchEffects(next, color, { wardPieceId: piece.id, wardTurns: 2 });
  }
  if (id === 'pawnstep') next = patchEffects(next, color, { pawnStepId: piece.id });
  if (id === 'mark' || id === 'pawnMark') next = patchEffects(next, color, { markedPieceId: piece.id });
  if (id === 'phase') next = patchEffects(next, color, { phaseTargetId: piece.id });
  if (id === 'fold') next = patchEffects(next, color, { phaseTargetId: piece.id, phaseJokerId: piece.id });
  if (id === 'prism') {
    next = patchEffects(next, color, { prismTargetId: piece.id, prismType: piece.type === 'b' ? 'r' : 'b' });
  }
  if (id === 'pawnraid') next = patchEffects(next, color, { pawnRaidId: piece.id });
  if (id === 'rookbend') next = patchEffects(next, color, { rookBendId: piece.id });
  if (id === 'stagger' || id === 'pawnStagger') {
    next = patchEffects(next, color, { staggerPieceId: piece.id });
  }
  if (id === 'snare') next = patchEffects(next, color, { snarePieceId: piece.id, snareTurns: 2 });
  const wantsMoveNow =
    ['lancer', 'pawnstep', 'phase', 'fold', 'prism', 'pawnraid', 'rookbend'].indexOf(id) !== -1;
  const card = deps.cards[id];
  let message = (card ? card.name : id) + ' siap di ' + coord(row, col) + '. Gerakkan bidak ini.';
  if (id === 'fold') {
    message = 'Lipatan dimensi siap di ' + coord(row, col) + '. Pindahkan ke petak kosong mana pun.';
  }
  if (id === 'ward' || id === 'pawnGuard') {
    message = 'Perisai melindungi ' + coord(row, col) + ' selama 2 balasan lawan.';
  }
  if (id === 'mark' || id === 'pawnMark') {
    message = 'Tanda buru dipasang di ' + coord(row, col) + '. Tangkap untuk +1 EN.';
  }
  if (id === 'stagger' || id === 'pawnStagger') {
    message = 'Bidak di ' + coord(row, col) + ' tak dapat menangkap pada balasan.';
  }
  if (id === 'snare') {
    message = 'Bidak di ' + coord(row, col) + ' terjerat selama 2 balasan lawan.';
  }
  const done = completeTargetCard(next, deps, color, message, wantsMoveNow ? [row, col] : null);
  return { state: done, ok: true, message: done.status, moveConsumed: false };
}

/** Relay bidak: pilih dua bidak sendiri (non-raja) untuk bertukar posisi. */
function resolvePvpRelay(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  row: number,
  col: number,
  secondPiece: Piece | null,
): PvpCardPlayResult {
  if (!state.relayFirstId) {
    if (!secondPiece || secondPiece.side !== color || secondPiece.type === 'k') {
      return fail(state, 'Relay: pilih bidak ' + colorName(color) + ' selain raja.');
    }
    const next: PvpState = {
      ...state,
      relayFirstId: secondPiece.id,
      selected: [row, col],
      status: 'Pilih bidak ' + colorName(color) + ' kedua untuk bertukar posisi.',
    };
    return { state: next, ok: true, message: next.status, moveConsumed: false };
  }
  const from = findPieceSquare(state.board, state.relayFirstId);
  if (
    !from ||
    !secondPiece ||
    secondPiece.side !== color ||
    secondPiece.type === 'k' ||
    secondPiece.id === state.relayFirstId
  ) {
    return fail(state, 'Pilih bidak ' + colorName(color) + ' kedua yang berbeda dari raja.');
  }
  const firstPiece = state.board[from[0]][from[1]];
  if (!firstPiece) {
    return fail(state, 'Pilih bidak ' + colorName(color) + ' kedua yang berbeda dari raja.');
  }
  const swapped = state.board.map(function (boardRow) {
    return boardRow.slice();
  });
  swapped[from[0]][from[1]] = secondPiece;
  swapped[row][col] = firstPiece;
  if (chessIsInCheck(swapped, color)) {
    return fail(state, 'Pertukaran itu membiarkan raja dalam skak. Pilih bidak lain.');
  }
  let castling = updatePvpCastlingRights(state.castling, firstPiece, from, null, [row, col]);
  castling = updatePvpCastlingRights(castling, secondPiece, [row, col], null, from);
  const cleared: PvpState = {
    ...state,
    board: swapped,
    castling,
    enPassant: null,
    lastMove: { from: [from[0], from[1]], to: [row, col] },
    ply: state.ply + 1,
    history: state.history.concat([
      {
        color,
        piece: firstPiece.type,
        from: coord(from[0], from[1]),
        to: coord(row, col),
        capture: false,
        captured: null,
        castle: null,
        promotion: null,
        note: 'Relay bidak',
      },
    ]),
  };
  const done = completeTargetCard(cleared, deps, color, 'Relay selesai. Lawan bergerak.', null);
  const hero = deps.heroes[state.sides[color].heroId] ?? Object.values(deps.heroes)[0];
  const concluded = concludePvpMove(done, color, hero, null, false);
  return { state: concluded, ok: true, message: concluded.status, moveConsumed: true };
}

function pvpRevivalPick(state: PvpState, color: Color): { index: number; piece: Piece } | null {
  return findRevivalPiece(state.graveyard[color]);
}

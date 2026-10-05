// Aturan PvP: langkah legal (pola gerak + filter efek warna-relatif),
// commit langkah, pemicu pasca-langkah, durasi efek, hasil akhir, dan
// resource (mana/EN/undian deterministik).
//
// Semua logika di sini memakai parameter warna; tidak ada asumsi
// "putih = pemain lokal". Kedua klien menjalankan fungsi yang sama dengan
// urutan command identik sehingga state selalu cocok.

import type { Board, Piece, PieceType } from '../chess/board.ts';
import {
  captureAt as chessCaptureAt,
  coord as chessCoord,
  enPassantSquareForMove,
  isInCheck as chessIsInCheck,
  rawLegalMovesFrom,
  simulateMove as chessSimulateMove,
  updateCastlingRights as updateChessCastlingRights,
  type CastlingRights,
  type ChessMove,
  type MoveState,
} from '../chess/moves.ts';
import { isPromotionRank } from '../chess/promotion.ts';
import {
  EN_CAP,
  MANA_CAP,
  otherColor,
  sideOf,
  heroOf,
  type PvpCardDef,
  type PvpDeps,
  type PvpHeroDef,
  type PvpMove,
  type PvpState,
  type Color,
} from './state.ts';


export function updatePvpCastlingRights(
  rights: CastlingRights,
  piece: Piece,
  from: [number, number],
  captured: Piece | null,
  to: [number, number],
): CastlingRights {
  const updated: CastlingRights = {
    w: { ...rights.w },
    b: { ...rights.b },
  };
  updateChessCastlingRights(updated, piece, from[0], from[1], captured, to[0], to[1]);
  return updated;
}
// --- Undian kartu deterministik -------------------------------------------------

/** PRNG mulberry32 murni; konsumsi eksplisit per undian. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sumber acak deterministik milik state: seed + jumlah undian sejauh ini. */
export function pvpRandom(state: PvpState): () => number {
  const generator = mulberry32(state.seed);
  let remaining = state.drawSeq;
  const stream: number[] = [];
  return function (): number {
    while (stream.length <= remaining) {
      stream.push(generator());
    }
    const value = stream[remaining];
    remaining += 1;
    return value;
  };
}

/** Buat state dengan drawSeq maju sejumlah undian (jaga determinisme). */
export function withDraws(state: PvpState, count: number): PvpState {
  return { ...state, drawSeq: state.drawSeq + count };
}

function cardList(deps: PvpDeps, deckCardIds: string[]): PvpCardDef[] {
  const cards = deckCardIds
    .map(function (id) {
      return deps.cards[id];
    })
    .filter(function (card): card is PvpCardDef {
      return card !== undefined;
    });
  return cards.length > 0 ? cards : Object.values(deps.cards);
}

function drawCard(cards: PvpCardDef[], excluded: string[], rng: () => number): string {
  const options = cards.filter(function (card) {
    return excluded.indexOf(card.id) === -1;
  });
  const totalWeight = options.reduce(function (total, card) {
    return total + (card.weight ?? 1);
  }, 0);
  let roll = rng() * totalWeight;
  for (let i = 0; i < options.length; i += 1) {
    roll -= options[i].weight ?? 1;
    if (roll < 0) return options[i].id;
  }
  return options[options.length - 1].id;
}

/** Tangan awal 3 kartu unik untuk satu pemain; majukan drawSeq 3 langkah. */
export function makePvpHand(
  state: PvpState,
  deps: PvpDeps,
  deckCardIds: string[],
): { hand: [string, string, string]; state: PvpState } {
  const hand: string[] = [];
  const blocked: string[] = [];
  let rng = pvpRandom(state);
  while (hand.length < 3) {
    hand.push(drawCard(cardList(deps, deckCardIds), blocked.concat(hand), rng));
  }
  return {
    hand: [hand[0], hand[1], hand[2]],
    state: withDraws(state, 3),
  };
}

/** Ganti satu slot tangan setelah kartu terpakai; majukan drawSeq 1 langkah. */
export function replacePvpHandSlot(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  slot: number,
  oldId: string | null,
): PvpState {
  const side = sideOf(state, color);
  const old = oldId ? deps.cards[oldId] : undefined;
  const freeUsed = side.freeSkillUsedThisTurn || (old != null && old.cost === 0);
  const excluded = side.hand.filter(function (_id, index) {
    return index !== slot;
  });
  if (oldId) excluded.push(oldId);
  const nextHand = side.hand.slice();
  nextHand[slot] = drawCard(cardList(deps, side.deckCardIds), excluded, pvpRandom(state));
  return {
    ...withDraws(state, 1),
    sides: {
      ...state.sides,
      [color]: { ...side, hand: nextHand, freeSkillUsedThisTurn: freeUsed },
    },
  };
}

// --- Resource -------------------------------------------------------------------

export function currentPvpCardCost(card: PvpCardDef, hero: PvpHeroDef, reserveArmed: boolean): number {
  const surcharge =
    (card.kind === 'offense' ? hero.offenseSurcharge ?? 0 : 0) +
    (card.kind === 'joker' ? hero.jokerSurcharge ?? 0 : 0);
  return Math.max(0, card.cost + surcharge - (reserveArmed ? 1 : 0));
}

export interface PvpCardPlayability {
  ok: boolean;
  reason: string;
}

export function canPlayPvpCard(
  state: PvpState,
  color: Color,
  card: PvpCardDef,
  hero: PvpHeroDef,
): PvpCardPlayability {
  const side = sideOf(state, color);
  if (card.cost === 0 && side.freeSkillUsedThisTurn) {
    return { ok: false, reason: 'Jatah satu kartu 0 mana per giliran sudah dipakai.' };
  }
  const cost = currentPvpCardCost(card, hero, side.effects.reserveArmed);
  if (side.mana < cost) {
    return {
      ok: false,
      reason: 'Butuh ' + cost + ' mana; mana sekarang ' + side.mana + ' / ' + MANA_CAP + '.',
    };
  }
  return { ok: true, reason: '' };
}

export function payPvpCardCost(state: PvpState, color: Color, card: PvpCardDef, hero: PvpHeroDef): PvpState {
  const side = sideOf(state, color);
  const cost = currentPvpCardCost(card, hero, side.effects.reserveArmed);
  return {
    ...state,
    sides: {
      ...state.sides,
      [color]: {
        ...side,
        mana: side.mana - cost,
        effects: { ...side.effects, reserveArmed: false },
      },
    },
  };
}

export function refundPvpCardCost(state: PvpState, color: Color, amount: number): PvpState {
  const side = sideOf(state, color);
  return {
    ...state,
    sides: {
      ...state.sides,
      [color]: { ...side, mana: Math.min(MANA_CAP, side.mana + amount) },
    },
  };
}

export function gainPvpMana(state: PvpState, color: Color, amount: number): PvpState {
  const side = sideOf(state, color);
  return {
    ...state,
    sides: {
      ...state.sides,
      [color]: { ...side, mana: Math.min(MANA_CAP, side.mana + amount) },
    },
  };
}

export function gainPvpEnergy(state: PvpState, color: Color, amount: number): PvpState {
  const side = sideOf(state, color);
  return {
    ...state,
    sides: {
      ...state.sides,
      [color]: { ...side, energy: Math.min(EN_CAP, side.energy + amount) },
    },
  };
}

export function losePvpEnergy(state: PvpState, color: Color, amount: number): PvpState {
  const side = sideOf(state, color);
  return {
    ...state,
    sides: {
      ...state.sides,
      [color]: { ...side, energy: Math.max(0, side.energy - amount) },
    },
  };
}

export function pvpRerollLimit(state: PvpState, color: Color): number {
  return 2 + sideOf(state, color).bonusRerolls;
}

export function pvpRerollCost(state: PvpState, color: Color): number {
  return sideOf(state, color).rollsThisTurn === 0 ? 0 : 1;
}

// --- Langkah legal ---------------------------------------------------------------

/** MoveState pola-gerak milik satu warna (hook efek kartu/hero). */
export function patternState(state: PvpState, color: Color): MoveState {
  const effects = sideOf(state, color).effects;
  return {
    board: state.board,
    castling: state.castling,
    enPassant: state.enPassant,
    knightTargetId: effects.knightTargetId,
    prismTargetId: effects.prismTargetId,
    prismType: effects.prismType,
    phaseTargetId: effects.phaseTargetId,
    phaseJokerId: effects.phaseJokerId,
    pawnStepId: effects.pawnStepId,
    heroPawnRushIds: effects.pawnRushIds,
    pawnRaidId: effects.pawnRaidId,
    rookBendId: effects.rookBendId,
  };
}

function sameSquare(a: [number, number] | null, row: number, col: number): boolean {
  return a !== null && a[0] === row && a[1] === col;
}

/**
 * Semua langkah legal satu warna setelah filter efek (ward/pierce/snare/
 * stagger/blockade/aegis), dengan jalan keluar darurat saat skak
 * (cerminan battleLegalMoves domain PvE).
 */
export function pvpLegalMoves(state: PvpState, color: Color): ChessMove[] {
  const mods = patternState(state, color);
  const opponent = sideOf(state, otherColor(color));
  const result: ChessMove[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.side !== color) continue;
      for (const move of rawLegalMovesFrom(mods, row, col)) {
        result.push(move);
      }
    }
  }
  const allowed = result.filter(function (move) {
    const moving = state.board[move.from[0]][move.from[1]];
    if (!moving) return false;
    const captured = chessCaptureAt(mods, move);
    if (opponent.effects.snarePieceId === moving.id) return false;
    if (opponent.effects.staggerPieceId === moving.id && captured) return false;
    if (sameSquare(opponent.effects.blockadeSquare, move.to[0], move.to[1])) return false;
    if (
      opponent.effects.heroBlockadeSquares.some(function (square) {
        return square[0] === move.to[0] && square[1] === move.to[1];
      })
    ) {
      return false;
    }
    if (captured && opponent.effects.aegisActive) return false;
    if (captured && captured.id === opponent.effects.wardPieceId) {
      return sideOf(state, color).effects.pierceArmed;
    }
    return true;
  });
  if (allowed.length > 0 || result.length === 0 || !chessIsInCheck(state.board, color)) {
    return allowed;
  }
  return result.filter(function (move) {
    const blockedCard = sameSquare(opponent.effects.blockadeSquare, move.to[0], move.to[1]);
    const blockedHero = opponent.effects.heroBlockadeSquares.some(function (square) {
      return square[0] === move.to[0] && square[1] === move.to[1];
    });
    return !blockedCard && !blockedHero;
  });
}

export function pvpLegalMovesFrom(
  state: PvpState,
  row: number,
  col: number,
): ChessMove[] {
  const piece = state.board[row][col];
  if (!piece) return [];
  return pvpLegalMoves(state, piece.side).filter(function (move) {
    return move.from[0] === row && move.from[1] === col;
  });
}

// --- Commit langkah ---------------------------------------------------------------

/** Hapus semua referensi efek yang menunjuk bidak ini (tertangkap/terhapus). */
export function clearPvpPieceEffects(state: PvpState, piece: Piece): PvpState {
  const next: PvpState = { ...state, sides: { ...state.sides } };
  for (const color of ['w', 'b'] as const) {
    const effects = next.sides[color].effects;
    let changed = false;
    const patch = { ...effects };
    if (patch.knightTargetId === piece.id) { patch.knightTargetId = null; changed = true; }
    if (patch.pawnStepId === piece.id) { patch.pawnStepId = null; changed = true; }
    if (patch.pawnRaidId === piece.id) { patch.pawnRaidId = null; changed = true; }
    if (patch.phaseTargetId === piece.id) { patch.phaseTargetId = null; patch.phaseJokerId = null; changed = true; }
    if (patch.prismTargetId === piece.id) { patch.prismTargetId = null; patch.prismType = null; changed = true; }
    if (patch.rookBendId === piece.id) { patch.rookBendId = null; changed = true; }
    if (patch.wardPieceId === piece.id) { patch.wardPieceId = null; patch.wardTurns = 0; changed = true; }
    if (patch.snarePieceId === piece.id) { patch.snarePieceId = null; patch.snareTurns = 0; changed = true; }
    if (patch.staggerPieceId === piece.id) { patch.staggerPieceId = null; changed = true; }
    if (patch.markedPieceId === piece.id) { patch.markedPieceId = null; changed = true; }
    if (changed) {
      next.sides[color] = { ...next.sides[color], effects: patch };
    }
  }
  return next;
}

export interface PvpCommittedMove {
  state: PvpState;
  captured: Piece | null;
}

/**
 * Terapkan langkah ke papan + tangkapan (cerminan commitBattleMove PvE,
 * warna-relatif): hak rokade, en passant, riwayat, kuburan, EN tangkapan.
 */
export function commitPvpMove(state: PvpState, deps: PvpDeps, move: PvpMove, color: Color): PvpCommittedMove {
  const mods = patternState(state, color);
  const chessMove: ChessMove = {
    from: move.from,
    to: move.to,
    castle: move.castle,
    enPassant: move.enPassant,
    phase: move.phase,
    promotion: move.promotion,
  };
  const fromRow = move.from[0];
  const fromCol = move.from[1];
  const toRow = move.to[0];
  const toCol = move.to[1];
  const moving = state.board[fromRow][fromCol];
  if (!moving) return { state, captured: null };
  const originalType = moving.type;
  const promotion =
    originalType === 'p' && isPromotionRank(color, toRow) ? (move.promotion ?? 'q') : null;
  const captured = chessCaptureAt({ ...mods, enPassant: state.enPassant }, chessMove);

  let next: PvpState = { ...state };
  const castling = updatePvpCastlingRights(state.castling, moving, move.from, captured, move.to);
  const wasPawnDouble =
    moving.type === 'p' &&
    !move.phase &&
    fromCol === toCol &&
    Math.abs(toRow - fromRow) === 2;
  next = {
    ...next,
    castling,
    board: chessSimulateMove(next.board, chessMove),
    enPassant: wasPawnDouble ? enPassantSquareForMove(moving, fromRow, fromCol, toRow) : null,
    lastMove: { from: [fromRow, fromCol], to: [toRow, toCol] },
    ply: next.ply + 1,
    history: next.history.concat([
      {
        color,
        piece: originalType,
        from: chessCoord(fromRow, fromCol),
        to: chessCoord(toRow, toCol),
        capture: Boolean(captured),
        captured: captured ? captured.type : null,
        castle: move.castle ?? null,
        promotion,
        enPassant: move.enPassant === true,
      },
    ]),
  };
  if (captured) {
    next = {
      ...next,
      captures: { ...next.captures, [color]: next.captures[color] + 1 },
      graveyard: {
        ...next.graveyard,
        [captured.side]: next.graveyard[captured.side].concat([{ ...captured }]),
      },
    };
    const hero = heroOf(next, deps, color);
    if (hero.captureEnergy !== 0) {
      next = gainPvpEnergy(next, color, 1 + (hero.captureBonus ?? 0));
    }
    if (sideOf(next, color).effects.focusCaptureArmed) {
      next = gainPvpEnergy(next, color, 1);
      next = patchEffects(next, color, { focusCaptureArmed: false });
    }
    if (sideOf(next, color).effects.markedPieceId === captured.id) {
      next = gainPvpEnergy(next, color, 1);
      next = patchEffects(next, color, { markedPieceId: null });
    }
    if (sideOf(next, color).effects.leechArmed) {
      if (sideOf(next, otherColor(color)).energy > 0) {
        next = losePvpEnergy(next, otherColor(color), 1);
        next = gainPvpEnergy(next, color, 1);
      }
      next = patchEffects(next, color, { leechArmed: false });
    }
    const opponent = otherColor(color);
    if (sideOf(next, opponent).effects.riposteArmed) {
      next = gainPvpEnergy(next, opponent, 1);
      next = patchEffects(next, opponent, { riposteArmed: false });
    }
    for (const owner of ['w', 'b'] as const) {
      if (sideOf(next, owner).effects.salvageArmed) {
        next = gainPvpEnergy(next, owner, 1);
        next = patchEffects(next, owner, { salvageArmed: false });
      }
    }
  }
  if (next.sides[color].effects.knightTargetId === moving.id) {
    next = patchEffects(next, color, { knightTargetId: null });
  }
  if (next.sides[color].effects.pawnStepId === moving.id) {
    next = patchEffects(next, color, { pawnStepId: null });
  }
  if (next.sides[color].effects.pawnRaidId === moving.id) {
    next = patchEffects(next, color, { pawnRaidId: null });
  }
  if (next.sides[color].effects.phaseTargetId === moving.id) {
    next = patchEffects(next, color, { phaseTargetId: null, phaseJokerId: null });
  }
  if (next.sides[color].effects.prismTargetId === moving.id) {
    next = patchEffects(next, color, { prismTargetId: null, prismType: null });
  }
  if (next.sides[color].effects.rookBendId === moving.id) {
    next = patchEffects(next, color, { rookBendId: null });
  }
  if (next.sides[color].effects.pawnRushIds !== null) {
    next = patchEffects(next, color, { pawnRushIds: null });
  }
  if (captured) {
    next = clearPvpPieceEffects(next, captured);
  }
  next = {
    ...next,
    selected: null,
    activeSide: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
  };
  return { state: next, captured };
}

export function patchEffects(
  state: PvpState,
  color: Color,
  patch: Partial<PvpState['sides']['w']['effects']>,
): PvpState {
  return {
    ...state,
    sides: {
      ...state.sides,
      [color]: {
        ...state.sides[color],
        effects: { ...state.sides[color].effects, ...patch },
      },
    },
  };
}

/**
 * Pemicu setelah langkah sendiri (cerminan applyWhiteMoveTriggers PvE):
 * guntur, sunyi, napas pion, denyut pion, mana +1, pasif Saka, kedaluwarsa
 * leech/pierce.
 */
export function applyPvpMoveTriggers(
  state: PvpState,
  color: Color,
  hero: PvpHeroDef,
  captured: Piece | null,
  movedPiece: boolean,
): PvpState {
  const other = otherColor(color);
  const effects = sideOf(state, color).effects;
  let next: PvpState = { ...state };
  if (movedPiece && effects.shockArmed) {
    if (chessIsInCheck(next.board, other)) {
      next = losePvpEnergy(next, other, 1);
      next = {
        ...next,
        status: 'Pukulan guntur: skak menguras 1 EN lawan.',
      };
    }
    next = patchEffects(next, color, { shockArmed: false });
  }
  if (movedPiece && effects.quietArmed) {
    if (!captured) next = gainPvpEnergy(next, color, 1);
    next = patchEffects(next, color, { quietArmed: false });
  }
  const lastOwnMove = movedPiece ? next.history[next.history.length - 1] : undefined;
  const movedPawn = Boolean(
    lastOwnMove && lastOwnMove.color === color && lastOwnMove.piece === 'p' && !lastOwnMove.note,
  );
  if (movedPiece) next = gainPvpMana(next, color, 1);
  if (hero.id === 'saka' && movedPawn) next = gainPvpEnergy(next, color, 1);
  if (movedPiece && effects.pawnBreathArmed) {
    if (movedPawn && !captured) {
      const before = sideOf(next, color).energy;
      next = gainPvpEnergy(next, color, 1);
      next = {
        ...next,
        status:
          sideOf(next, color).energy > before
            ? 'Napas pion memulihkan 1 EN.'
            : 'Napas pion terpakai; energi sudah penuh.',
      };
    }
    next = patchEffects(next, color, { pawnBreathArmed: false });
  }
  if (movedPiece && effects.pawnPulseArmed) {
    if (movedPawn && chessIsInCheck(next.board, other)) {
      next = losePvpEnergy(next, other, 1);
      next = {
        ...next,
        status: 'Denyut pion menguras 1 EN lawan.',
      };
    }
    next = patchEffects(next, color, { pawnPulseArmed: false });
  }
  if (movedPiece && effects.leechArmed && !captured) {
    next = patchEffects(next, color, { leechArmed: false });
  }
  if (movedPiece) next = patchEffects(next, color, { pierceArmed: false });
  return next;
}

/**
 * Susutkan efek yang dihitung per "balasan lawan" setelah lawan selesai
 * bergerak (cerminan advanceBossReplyEffects + clear pasca-fase PvE).
 */
export function tickSideEffects(state: PvpState, color: Color): PvpState {
  const effects = sideOf(state, color).effects;
  let next: PvpState = state;
  const patch: Partial<PvpState['sides']['w']['effects']> = {
    markedPieceId: null,
    staggerPieceId: null,
    parryArmed: false,
    riposteArmed: false,
    salvageArmed: false,
    aegisActive: false,
    extraMovePending: false,
  };
  if (effects.lastLaughArmed) {
    if (chessIsInCheck(state.board, color)) {
      next = gainPvpEnergy(next, color, 2);
    }
    patch.lastLaughArmed = false;
  }
  if (effects.wardTurns > 0) {
    patch.wardTurns = effects.wardTurns - 1;
    if (patch.wardTurns === 0) patch.wardPieceId = null;
  }
  if (effects.snareTurns > 0) {
    patch.snareTurns = effects.snareTurns - 1;
    if (patch.snareTurns === 0) patch.snarePieceId = null;
  }
  if (effects.blockadeTurns > 0) {
    patch.blockadeTurns = effects.blockadeTurns - 1;
    if (patch.blockadeTurns === 0) patch.blockadeSquare = null;
  }
  if (effects.heroBlockadeTurns > 0) {
    patch.heroBlockadeTurns = effects.heroBlockadeTurns - 1;
    if (patch.heroBlockadeTurns === 0) {
      patch.heroBlockadeSquares = [];
      patch.heroBlockadeName = '';
    }
  }
  return patchEffects(next, color, patch);
}

/**
 * Cek hasil untuk warna yang akan bergerak: skakmat/remis/lanjut.
 * Tanpa hadiah koin (mode online tidak menulis progres kampanye).
 */
export function checkPvpOutcome(state: PvpState, color: Color): PvpState {
  const moves = pvpLegalMoves(state, color);
  const checked = chessIsInCheck(state.board, color);
  if (moves.length > 0) {
    if (checked) {
      return {
        ...state,
        status: color === 'w' ? 'Skak. Lindungi raja putih.' : 'Skak. Lindungi raja hitam.',
      };
    }
    return state.status.startsWith('Skak.')
      ? { ...state, status: color === 'w' ? 'Giliran putih. Raja tidak lagi diskak.' : 'Giliran hitam. Raja tidak lagi diskak.' }
      : state;
  }
  return {
    ...state,
    gameOver: true,
    winner: checked ? otherColor(color) : null,
    status: checked
      ? color === 'w'
        ? 'Skakmat. Raja putih tumbang.'
        : 'Skakmat. Raja hitam tumbang.'
      : 'Remis. Tidak ada langkah legal.',
  };
}

/**
 * Akhiri langkah satu warna: pemicu + tempo + Saat Beku + hasil + ganti
 * giliran. Dipakai setelah move biasa maupun kartu penghabis langkah.
 */
export function concludePvpMove(
  state: PvpState,
  color: Color,
  hero: PvpHeroDef,
  captured: Piece | null,
  movedPiece = true,
): PvpState {
  const other = otherColor(color);
  let next = applyPvpMoveTriggers(state, color, hero, captured, movedPiece);
  const effects = sideOf(next, color).effects;
  if (captured && effects.tempoArmed) {
    next = patchEffects(next, color, { tempoArmed: false, extraMovePending: true });
    const outcome = checkPvpOutcome(next, other);
    if (outcome.gameOver) return outcome;
    return {
      ...outcome,
      turn: color,
      status: 'Tempo ganda aktif. ' + (color === 'w' ? 'Putih' : 'Hitam') + ' bergerak sekali lagi.',
    };
  }
  if (effects.skipOpponentTurn) {
    next = patchEffects(next, color, { skipOpponentTurn: false });
    next = tickSideEffects(next, color);
    const outcome = checkPvpOutcome(next, other);
    if (outcome.gameOver) return outcome;
    return {
      ...outcome,
      turn: color,
      status: 'Saat Beku: balasan lawan dilewati.',
    };
  }
  if (effects.extraMovePending) {
    next = patchEffects(next, color, { extraMovePending: false });
  }
  next = tickSideEffects(next, other);
  next = checkPvpOutcome(next, other);
  if (next.gameOver) return next;
  next = {
    ...next,
    turn: other,
    turnNo: next.turnNo + (other === 'w' ? 1 : 0),
    sides: {
      ...next.sides,
      [color]: { ...next.sides[color], bonusRerolls: 0 },
      [other]: {
        ...next.sides[other],
        rollsThisTurn: 0,
        bonusRerolls: 0,
        freeSkillUsedThisTurn: false,
      },
    },
    status:
      next.status.indexOf('Skak.') === 0
        ? next.status
        : other === 'w'
          ? 'Giliran putih. Pilih langkah berikutnya.'
          : 'Giliran hitam. Pilih langkah berikutnya.',
  };
  return next;
}

/** Kebangkitan Phoenix: bidak non-ratu bernilai tertinggi di kuburan sendiri. */
export function findRevivalPiece(graveyard: Piece[]): { index: number; piece: Piece } | null {
  const values: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  let best: { index: number; piece: Piece } | null = null;
  for (let i = graveyard.length - 1; i >= 0; i -= 1) {
    const piece = graveyard[i];
    if (piece.type !== 'q' && (!best || values[piece.type] > values[best.piece.type])) {
      best = { index: i, piece };
    }
  }
  return best;
}

/** Petak dua baris awal sendiri yang aman untuk kebangkitan Phoenix. */
export function pvpRevivalTargets(state: PvpState, color: Color): [number, number][] {
  const revival = findRevivalPiece(state.graveyard[color]);
  if (!revival) return [];
  const targets: [number, number][] = [];
  const rows = color === 'w' ? [6, 7] : [0, 1];
  for (const row of rows) {
    for (let col = 0; col < 8; col += 1) {
      if (state.board[row][col]) continue;
      const next = state.board.map(function (boardRow) {
        return boardRow.slice();
      });
      next[row][col] = { ...revival.piece };
      const placed = { ...state, board: next };
      if (!chessIsInCheck(next, color) || pvpLegalMoves(placed, color).length > 0) {
        targets.push([row, col]);
      }
    }
  }
  return targets;
}

export function hasPvpJokerTarget(board: Board, color: Color): boolean {
  return board.some(function (row) {
    return row.some(function (piece) {
      return piece != null && piece.side === color && piece.type !== 'k';
    });
  });
}

export function hasPvpEdictTarget(board: Board, color: Color): boolean {
  return board.some(function (row) {
    return row.some(function (piece) {
      return piece != null && piece.side === color && piece.type !== 'k' && piece.type !== 'q';
    });
  });
}

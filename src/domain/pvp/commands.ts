// Command bernama PvP: satu-satunya jalan mengubah PvpState.
// UI memanggil command; domain memvalidasi. Cermin command domain/battle
// tetapi warna-relatif dan tanpa AI/boss/undo.

import { isPromotionRank } from '../chess/promotion.ts';
import {
  heroOf,
  isBusy,
  otherColor,
  sideOf,
  type Color,
  type PvpDeps,
  type PvpMove,
  type PvpState,
} from './state.ts';
import {
  checkPvpOutcome,
  commitPvpMove,
  concludePvpMove,
  pvpLegalMovesFrom,
  pvpRerollCost,
  pvpRerollLimit,
  replacePvpHandSlot,
} from './rules.ts';
import {
  cancelPvpTarget,
  playPvpCard,
  resolvePvpTarget,
} from './cards.ts';
import {
  resolvePvpHeroTarget,
  usePvpHeroSkill,
  usePvpHeroUltimate,
} from './hero.ts';
import type { PvpCommandResult } from './state.ts';

function fail(state: PvpState, message: string): PvpCommandResult {
  return { state: { ...state, status: message }, ok: false, message };
}

function inBounds(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 8 && col >= 0 && col < 8;
}

/** Pilih bidak sendiri untuk melihat langkah legal. */
export function selectPvpPiece(
  state: PvpState,
  color: Color,
  row: number,
  col: number,
): PvpCommandResult {
  if (!inBounds(row, col)) return fail(state, 'Petak di luar papan.');
  if (isBusy(state, color) || state.pendingPromotion) {
    return { state, ok: false, message: state.status };
  }
  const piece = state.board[row][col];
  if (!piece || piece.side !== color) {
    return fail(state, 'Pilih bidak sendiri terlebih dahulu.');
  }
  const moves = pvpLegalMovesFrom(state, row, col);
  const status =
    moves.length > 0 ? 'Pilih petak tujuan yang menyala.' : 'Bidak ini belum memiliki langkah legal.';
  return { state: { ...state, selected: [row, col], status }, ok: true, message: status };
}

/**
 * Langkah bidak sendiri (atau tahap promosi). Tak mengubah giliran bila
 * langkah tidak valid.
 */
export function movePvpPiece(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  from: [number, number],
  to: [number, number],
): PvpCommandResult {
  if (isBusy(state, color)) return { state, ok: false, message: state.status };
  if (
    !Number.isInteger(from[0]) ||
    from[0] < 0 ||
    from[0] > 7 ||
    !Number.isInteger(from[1]) ||
    from[1] < 0 ||
    from[1] > 7 ||
    !Number.isInteger(to[0]) ||
    to[0] < 0 ||
    to[0] > 7 ||
    !Number.isInteger(to[1]) ||
    to[1] < 0 ||
    to[1] > 7
  ) {
    return fail(state, 'Petak di luar papan.');
  }
  const moving = state.board[from[0]][from[1]];
  if (!moving || moving.side !== color) return fail(state, 'Pilih bidak sendiri terlebih dahulu.');
  if (state.pendingPromotion) {
    return { state, ok: false, message: 'Pilih bidak promosi terlebih dahulu.' };
  }
  const moves = pvpLegalMovesFrom(state, from[0], from[1]);
  const chosen = moves.find(function (move) {
    return move.to[0] === to[0] && move.to[1] === to[1];
  });
  if (!chosen) return fail(state, 'Langkah itu tidak legal untuk bidak ini.');
  const pvpMove: PvpMove = {
    from: [chosen.from[0], chosen.from[1]],
    to: [chosen.to[0], chosen.to[1]],
    castle: chosen.castle,
    enPassant: chosen.enPassant,
    phase: chosen.phase,
  };
  if (moving && moving.type === 'p' && isPromotionRank(color, chosen.to[0])) {
    const staged: PvpMove = { from: pvpMove.from, to: pvpMove.to };
    if (chosen.castle) staged.castle = chosen.castle;
    if (chosen.enPassant) staged.enPassant = true;
    if (chosen.phase) staged.phase = true;
    const message = 'Pion mencapai baris terakhir. Pilih bidak promosi.';
    return {
      state: { ...state, pendingPromotion: { side: color, move: staged }, status: message },
      ok: true,
      message,
    };
  }
  return finishPvpMove(state, deps, color, pvpMove);
}

function finishPvpMove(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  move: PvpMove,
): PvpCommandResult {
  const committed = commitPvpMove(state, deps, move, color);
  const hero = heroOf(committed.state, deps, color);
  const next = concludePvpMove(committed.state, color, hero, committed.captured);
  return { state: next, ok: true, message: next.status };
}

/** Konfirmasi promosi pion (q/r/b/n). */
export function choosePvpPromotion(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  piece: 'q' | 'r' | 'b' | 'n',
): PvpCommandResult {
  const pending = state.pendingPromotion;
  if (
    !pending ||
    pending.side !== color ||
    state.gameOver ||
    state.turn !== color ||
    state.activeSide !== null
  ) {
    return { state, ok: false, message: state.status };
  }
  if (['q', 'r', 'b', 'n'].indexOf(piece) === -1) {
    return fail(state, 'Pilihan promosi tidak valid.');
  }
  const move: PvpMove = { ...pending.move, promotion: piece };
  const cleared: PvpState = { ...state, pendingPromotion: null };
  return finishPvpMove(cleared, deps, color, move);
}

export interface PvpPremove {
  color: Color;
  from: [number, number];
  to: [number, number];
}

/** Validate a move intent while the opponent is still to move. */
export function queuePvpPremove(
  state: PvpState,
  color: Color,
  from: [number, number],
  to: [number, number],
): { ok: boolean; premove: PvpPremove | null; message: string } {
  if (state.gameOver || state.turn === color || state.pendingPromotion || state.activeSide !== null) {
    return { ok: false, premove: null, message: 'Premove tidak tersedia sekarang.' };
  }
  if (!inBounds(from[0], from[1]) || !inBounds(to[0], to[1]) || (from[0] === to[0] && from[1] === to[1])) {
    return { ok: false, premove: null, message: 'Petak premove tidak valid.' };
  }
  const piece = state.board[from[0]][from[1]];
  if (!piece || piece.side !== color) {
    return { ok: false, premove: null, message: 'Pilih bidak sendiri untuk premove.' };
  }
  const canMove = pvpLegalMovesFrom(state, from[0], from[1]).some(function (move) {
    return move.to[0] === to[0] && move.to[1] === to[1];
  });
  if (!canMove) return { ok: false, premove: null, message: 'Langkah premove belum legal.' };
  return {
    ok: true,
    premove: { color, from: [from[0], from[1]], to: [to[0], to[1]] },
    message: 'Premove disimpan; langkah dicek ulang saat giliranmu.',
  };

}
/** Revalidate a saved intent against the board after the opponent moves. */
export function executePvpPremove(
  state: PvpState,
  deps: PvpDeps,
  premove: PvpPremove,
): PvpCommandResult {
  if (state.turn !== premove.color) {
    return { state, ok: false, message: 'Giliran premove belum tiba.' };
  }
  return movePvpPiece(state, deps, premove.color, premove.from, premove.to);
}

/** Aktifkan kartu tangan (target atau instan); klik slot aktif = batal. */
export function playPvpCardCommand(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  slot: number,
): PvpCommandResult {
  const result = playPvpCard(state, deps, color, slot);
  return { state: result.state, ok: result.ok, message: result.message };
}

/** Selesaikan target kartu / hero pada petak papan. */
export function resolvePvpTargetCommand(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  row: number,
  col: number,
): PvpCommandResult {
  if (!inBounds(row, col)) return fail(state, 'Petak di luar papan.');
  if (state.gameOver || state.activeSide !== color || !state.activeSkill) {
    return { state, ok: false, message: state.status };
  }
  if (state.activeSkill.indexOf('hero:') === 0) {
    const heroResult = resolvePvpHeroTarget(state, color, row, col);
    if (!heroResult.ok) {
      return { state: heroResult.state, ok: false, message: heroResult.message };
    }
    if (heroResult.needsOutcome) {
      const other = otherColor(color);
      const outcome = checkPvpOutcome(heroResult.state, other);
      return { state: outcome, ok: true, message: outcome.status };
    }
    return { state: heroResult.state, ok: true, message: heroResult.message };
  }
  const cardResult = resolvePvpTarget(state, deps, color, row, col);
  return { state: cardResult.state, ok: cardResult.ok, message: cardResult.message };
}

/** Batalkan target aktif. */
export function cancelPvpTargetCommand(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpCommandResult {
  const result = cancelPvpTarget(state, deps, color);
  return { state: result.state, ok: result.ok, message: result.message };
}

/** Putar ulang seluruh tangan (atomik). */
export function rerollPvpHand(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpCommandResult {
  if (isBusy(state, color)) return { state, ok: false, message: state.status };
  const side = sideOf(state, color);
  const limit = pvpRerollLimit(state, color);
  if (side.rollsThisTurn >= limit) {
    return fail(
      state,
      'Jatah putar ulang seluruh tangan giliran ini sudah habis (' + limit + '/' + limit + ').',
    );
  }
  const cost = pvpRerollCost(state, color);
  if (side.energy < cost) {
    return fail(state, 'Putar ulang seluruh tangan membutuhkan 1 EN; energimu belum cukup.');
  }
  let next: PvpState = {
    ...state,
    sides: {
      ...state.sides,
      [color]: {
        ...side,
        energy: side.energy - cost,
        rollsThisTurn: side.rollsThisTurn + 1,
      },
    },
  };
  for (let slot = 0; slot < 3; slot += 1) {
    next = replacePvpHandSlot(next, deps, color, slot, next.sides[color].hand[slot]);
  }
  return {
    state: { ...next, status: 'Tangan diputar ulang.' },
    ok: true,
    message: 'Tangan diputar ulang.',
  };
}

/** Skill hero (2 EN; +1 bila pajak mantra aktif). */
export function usePvpSkillCommand(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpCommandResult {
  const result = usePvpHeroSkill(state, deps, color);
  return { state: result.state, ok: result.ok, message: result.message };
}

/** Ultimate hero (5 EN). */
export function usePvpUltimateCommand(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpCommandResult {
  const result = usePvpHeroUltimate(state, deps, color);
  return { state: result.state, ok: result.ok, message: result.message };
}

/** Ketukan petak: routing target, langkah, seleksi / batal seleksi. */
export function tapPvpSquare(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
  row: number,
  col: number,
): PvpCommandResult {
  if (!inBounds(row, col)) return fail(state, 'Petak di luar papan.');
  if (state.gameOver) return { state, ok: false, message: state.status };
  if (state.activeSide === color && state.activeSkill) {
    return resolvePvpTargetCommand(state, deps, color, row, col);
  }
  if (state.pendingPromotion) {
    return { state, ok: false, message: 'Pilih bidak promosi terlebih dahulu.' };
  }
  if (state.turn !== color) {
    return { state, ok: false, message: 'Tunggu giliranmu.' };
  }
  const selected = state.selected;
  const piece = state.board[row][col];
  if (selected && selected[0] === row && selected[1] === col) {
    return { state: { ...state, selected: null }, ok: true, message: state.status };
  }
  if (selected) {
    const moves = pvpLegalMovesFrom(state, selected[0], selected[1]);
    const target = moves.find(function (move) {
      return move.to[0] === row && move.to[1] === col;
    });
    if (target) {
      return movePvpPiece(state, deps, color, [selected[0], selected[1]], [row, col]);
    }
  }
  if (piece && piece.side === color) {
    return selectPvpPiece(state, color, row, col);
  }
  return { state: { ...state, selected: null }, ok: false, message: state.status };
}

/** Serah diri: lawan menang. */
export function resignPvp(state: PvpState, color: Color): PvpState {
  if (state.gameOver) return state;
  return {
    ...state,
    gameOver: true,
    winner: otherColor(color),
    activeSide: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected: null,
    pendingPromotion: null,
    status:
      (color === 'w' ? 'Putih' : 'Hitam') + ' menyerah. ' +
      (otherColor(color) === 'w' ? 'Putih' : 'Hitam') + ' menang.',
  };
}

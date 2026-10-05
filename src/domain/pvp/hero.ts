// Skill & ultimate hero PvP (warna-relatif). Biaya EN: skill 2, ultimate 5
// (+1 EN bila Pajak Mantra lawan aktif pada skill). Target dipilih lewat
// resolvePvTarget pada kartu aktif bertipe 'hero:*'.

import { coord } from '../chess/moves.ts';
import type { Piece } from '../chess/board.ts';
import {
  SKILL_ENERGY_COST,
  ULTIMATE_ENERGY_COST,
  otherColor,
  sideOf,
  type Color,
  type PvpDeps,
  type PvpState,
} from './state.ts';
import {
  clearPvpPieceEffects,
  patchEffects,
  pvpLegalMoves,
  updatePvpCastlingRights,
} from './rules.ts';
import { PIECE_NAMES } from './cards.ts';
import { isInCheck as chessIsInCheck } from '../chess/moves.ts';

export interface PvpHeroActionResult {
  state: PvpState;
  ok: boolean;
  message: string;
  /** True bila resolusi menghabiskan langkah (Titah Bara). */
  needsOutcome: boolean;
}

/** Biaya EN skill/ultimate untuk warna ini (termasuk pajak mantra lawan). */
export function heroActionCost(state: PvpState, color: Color, ultimate: boolean): number {
  const base = ultimate ? ULTIMATE_ENERGY_COST : SKILL_ENERGY_COST;
  const surcharge = ultimate ? 0 : sideOf(state, color).effects.surcharge;
  return base + surcharge;
}

export function usePvpHeroSkill(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpHeroActionResult {
  const side = sideOf(state, color);
  const hero = deps.heroes[side.heroId] ?? Object.values(deps.heroes)[0];
  const cost = heroActionCost(state, color, false);
  if (state.gameOver || state.turn !== color || state.activeSide !== null || state.pendingPromotion !== null) {
    return { state, ok: false, message: state.status, needsOutcome: false };
  }
  if (side.energy < cost) {
    return {
      state: { ...state, status: 'Butuh ' + cost + ' EN; energimu belum cukup.' },
      ok: false,
      message: 'Butuh ' + cost + ' EN; energimu belum cukup.',
      needsOutcome: false,
    };
  }
  if (hero.skillAction === 'focus') {
    const paid = payHeroAction(state, color, cost);
    return {
      state: patchEffects(paid, color, { focusCaptureArmed: true }),
      ok: true,
      message: 'Nyala Pemburu siap: tangkapan berikutnya memulihkan 1 EN tambahan.',
      needsOutcome: false,
    };
  }
  const prompt = heroSkillPrompt(hero.skillAction, color);
  return {
    state: {
      ...state,
      activeSide: color,
      activeSkill: 'hero:skill:' + hero.skillAction,
      activeSlot: null,
      activeSkillCost: cost,
      activeSkillDiscounted: false,
      selected: null,
      relayFirstId: null,
      status: prompt + ' Tekan Batal.',
    },
    ok: true,
    message: prompt,
    needsOutcome: false,
  };
}

export function usePvpHeroUltimate(
  state: PvpState,
  deps: PvpDeps,
  color: Color,
): PvpHeroActionResult {
  const side = sideOf(state, color);
  const hero = deps.heroes[side.heroId] ?? Object.values(deps.heroes)[0];
  const cost = ULTIMATE_ENERGY_COST;
  if (state.gameOver || state.turn !== color || state.activeSide !== null || state.pendingPromotion !== null) {
    return { state, ok: false, message: state.status, needsOutcome: false };
  }
  if (side.energy < cost) {
    return {
      state: { ...state, status: 'Butuh 5 EN untuk ultimate.' },
      ok: false,
      message: 'Butuh 5 EN untuk ultimate.',
      needsOutcome: false,
    };
  }
  const paid: PvpState = payHeroAction(state, color, cost);
  if (hero.ultimateAction === 'pawnrush') {
    const pawns = state.board
      .flat()
      .filter(function (piece) {
        return piece != null && piece.side === color && piece.type === 'p';
      })
      .map(function (piece) {
        return (piece as Piece).id;
      });
    if (pawns.length === 0) {
      return { state, ok: false, message: 'Tidak ada pion untuk Pawai Bidak.', needsOutcome: false };
    }
    return {
      state: patchEffects(paid, color, { pawnRushIds: pawns }),
      ok: true,
      message: 'Pawai Bidak siap: semua pion dapat maju dua petak dari posisinya.',
      needsOutcome: false,
    };
  }
  if (hero.ultimateAction === 'aegis') {
    return {
      state: patchEffects(paid, color, { aegisActive: true }),
      ok: true,
      message: 'Mata Air melindungi semua bidak ' + (color === 'w' ? 'putih' : 'hitam') + ' dari satu balasan.',
      needsOutcome: false,
    };
  }
  if (hero.ultimateAction === 'skip') {
    return {
      state: patchEffects(paid, color, { skipOpponentTurn: true }),
      ok: true,
      message: 'Saat Beku siap: balasan lawan dilewati setelah langkah berikutnya.',
      needsOutcome: false,
    };
  }
  const prompt = heroUltimatePrompt(hero.ultimateAction, color);
  return {
    state: {
      ...state,
      activeSide: color,
      activeSkill: 'hero:ultimate:' + hero.ultimateAction,
      activeSlot: null,
      activeSkillCost: ULTIMATE_ENERGY_COST,
      activeSkillDiscounted: false,
      selected: null,
      relayFirstId: null,
      status: prompt + ' Tekan Batal.',
    },
    ok: true,
    message: prompt,
    needsOutcome: false,
  };
}

/** Potong EN untuk aksi hero instan + konsumsi pajak mantra (skill saja). */
function payHeroAction(state: PvpState, color: Color, cost: number): PvpState {
  const side = sideOf(state, color);
  const surchargeUsed = side.effects.surcharge > 0;
  const next: PvpState = {
    ...state,
    sides: {
      ...state.sides,
      [color]: { ...side, energy: Math.max(0, side.energy - cost) },
    },
  };
  return surchargeUsed ? patchEffects(next, color, { surcharge: 0 }) : next;
}

function heroSkillPrompt(action: string, color: Color): string {
  const prompts: Record<string, string> = {
    ward: 'Pilih bidak ' + (color === 'w' ? 'putih' : 'hitam') + ' selain raja.',
    snare: 'Pilih bidak lawan selain raja.',
    pawnstep: 'Pilih pion ' + (color === 'w' ? 'putih' : 'hitam') + '.',
    phase: 'Pilih bidak ' + (color === 'w' ? 'putih' : 'hitam') + ' selain raja.',
    blockade: 'Pilih petak kosong.',
  };
  return prompts[action] ?? 'Pilih target.';
}

function heroUltimatePrompt(action: string, color: Color): string {
  const prompts: Record<string, string> = {
    fold: 'Pilih bidak ' + (color === 'w' ? 'putih' : 'hitam') + ' selain raja.',
    smite: 'Pilih bidak lawan selain raja dan ratu.',
    citadel: 'Pilih petak kosong.',
  };
  return prompts[action] ?? 'Pilih target.';
}

/** Resolusi target skill/ultimate hero pada petak papan. */
export function resolvePvpHeroTarget(
  state: PvpState,
  color: Color,
  row: number,
  col: number,
): PvpHeroActionResult {
  const id = state.activeSkill ?? '';
  const other = otherColor(color);
  const piece: Piece | null = state.board[row][col];
  const cost =
    state.activeSkillCost > 0
      ? state.activeSkillCost
      : id.indexOf('hero:ultimate:') === 0
        ? ULTIMATE_ENERGY_COST
        : heroActionCost(state, color, false);
  if (state.gameOver || state.activeSide !== color || !id) {
    return { state, ok: false, message: state.status, needsOutcome: false };
  }
  const fail = function (message: string): PvpHeroActionResult {
    return { state: { ...state, status: message }, ok: false, message, needsOutcome: false };
  };
  const done = function (next: PvpState, needsOutcome: boolean): PvpHeroActionResult {
    const paid = payHeroAction(next, color, cost);
    return { state: paid, ok: true, message: paid.status, needsOutcome };
  };
  if (id === 'hero:skill:blockade' || id === 'hero:ultimate:citadel') {
    if (piece) return fail('Blokade hanya dapat dipasang pada petak kosong.');
    const citadelOffsets: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    const squares =
      id === 'hero:ultimate:citadel'
        ? citadelOffsets
            .map(function (offset) {
              return [row + offset[0], col + offset[1]] as [number, number];
            })
            .filter(function (square) {
              return (
                square[0] >= 0 &&
                square[0] < 8 &&
                square[1] >= 0 &&
                square[1] < 8 &&
                !state.board[square[0]][square[1]]
              );
            })
        : [[row, col] as [number, number]];
    const enemyMoves = pvpLegalMoves(state, other);
    const enemyHasAnswer =
      chessIsInCheck(state.board, other) ||
      enemyMoves.some(function (move) {
        return !squares.some(function (square) {
          return move.to[0] === square[0] && move.to[1] === square[1];
        });
      });
    if (!enemyHasAnswer) {
      return fail('Blokade itu akan menutup semua langkah lawan dan menghasilkan remis. Pilih petak lain.');
    }
    const cleared: PvpState = {
      ...state,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
    };
    const blocked = patchEffects(cleared, color, {
      heroBlockadeSquares: squares,
      heroBlockadeTurns: 2,
      heroBlockadeName: id === 'hero:ultimate:citadel' ? 'Benteng Prisma' : 'Segel Petak',
    });
    const message =
      id === 'hero:ultimate:citadel'
        ? 'Benteng Prisma menutup ' + squares.length + ' petak dari pendaratan lawan selama 2 balasan.'
        : 'Segel Petak menutup ' + coord(row, col) + ' dari pendaratan lawan selama 2 balasan.';
    return done({ ...blocked, status: message }, false);
  }
  if (id === 'hero:skill:phase' || id === 'hero:ultimate:fold') {
    if (!piece || piece.side !== color || piece.type === 'k') {
      return fail('Pilih bidak ' + (color === 'w' ? 'putih' : 'hitam') + ' selain raja.');
    }
    let next: PvpState = {
      ...state,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
    };
    next = patchEffects(next, color, { phaseTargetId: piece.id });
    if (id === 'hero:ultimate:fold') next = patchEffects(next, color, { phaseJokerId: piece.id });
    return done(
      {
        ...next,
        status:
          id === 'hero:ultimate:fold'
            ? 'Gerbang Lintas aktif untuk ' + PIECE_NAMES[piece.type] + '.'
            : 'Pergeseran Rembulan aktif untuk ' + PIECE_NAMES[piece.type] + '.',
      },
      false,
    );
  }
  if (id === 'hero:skill:ward') {
    if (!piece || piece.side !== color || piece.type === 'k') {
      return fail('Pilih bidak ' + (color === 'w' ? 'putih' : 'hitam') + ' selain raja.');
    }
    const cleared: PvpState = {
      ...state,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
    };
    return done(
      patchEffects(cleared, color, { wardPieceId: piece.id, wardTurns: 2 }),
      false,
    );
  }
  if (id === 'hero:skill:pawnstep') {
    if (!piece || piece.side !== color || piece.type !== 'p') {
      return fail('Pilih pion ' + (color === 'w' ? 'putih' : 'hitam') + '.');
    }
    const cleared: PvpState = {
      ...state,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
    };
    return done(patchEffects(cleared, color, { pawnStepId: piece.id }), false);
  }
  if (id === 'hero:skill:snare') {
    if (!piece || piece.side !== other || piece.type === 'k') {
      return fail('Pilih bidak lawan selain raja.');
    }
    const cleared: PvpState = {
      ...state,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
    };
    return done(patchEffects(cleared, color, { snarePieceId: piece.id, snareTurns: 2 }), false);
  }
  if (id === 'hero:ultimate:smite') {
    if (!piece || piece.side !== other || piece.type === 'k' || piece.type === 'q') {
      return fail('Titah Bara hanya menargetkan bidak lawan selain raja dan ratu.');
    }
    const cleared = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    cleared[row][col] = null;
    let next: PvpState = {
      ...state,
      board: cleared,
      castling: updatePvpCastlingRights(state.castling, piece, [row, col], null, [row, col]),
      enPassant: null,
      activeSide: null,
      activeSkill: null,
      activeSlot: null,
      activeSkillCost: 0,
      activeSkillDiscounted: false,
      relayFirstId: null,
      selected: null,
    };
    next = clearPvpPieceEffects(next, piece);
    return done(
      {
        ...next,
        status:
          'Titah Bara menghapus ' + PIECE_NAMES[piece.type] + ' lawan tanpa menghitungnya sebagai tangkapan.',
      },
      true,
    );
  }
  return { state, ok: false, message: state.status, needsOutcome: false };
}

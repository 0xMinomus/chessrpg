// AI boss hitam: pilih langkah, skill bergantian, dan aturan boss.
//
// Cerminan chooseComputerMove / resolveEnemySkill / applyBossRule prototipe:
// - AI hanya memilih dari langkah legal (hasil filter efek battle).
// - Skor: acak + nilai tangkapan + skak + promosi + rokade, lalu acak top-4.
// - Skill lawan bergantian Perisai ('ward') / Gangguan ('siphon') seharga
//   2 EN + surcharge Pajak Mantra; telegraph terbaca dari state.

import {
  ENEMY_SKILL_BASE_COST,
  PIECE_VALUES,
  type BattleDeps,
  type BattleState,
  type BossDef,
  type Move,
  type Piece,
  type Square,
} from './state.ts';
import { battleLegalMoves } from './effects.ts';

/**
 * Pilih langkah hitam. Cerminan chooseComputerMove: bobot tangkapan
 * (12 + 4*nilai korban − 0,8*nilai penggerak), +7 memberi skak, +16 promosi
 * pion, +2 rokade, dasar acak*2, lalu ambil acak dari 4 teratas.
 */
export function chooseComputerMove(
  state: BattleState,
  deps: BattleDeps,
  moves: Move[],
): Move {
  const chess = deps.chess;
  const scored = moves.map(function (move) {
    const moving = state.board[move.from[0]][move.from[1]];
    const captured = chess.captureAt(state.board, state.enPassant, move);
    const next = chess.simulateMove(state.board, move);
    let score = deps.rng.next() * 2;
    if (captured && moving) {
      score += 12 + PIECE_VALUES[captured.type] * 4 - PIECE_VALUES[moving.type] * 0.8;
    }
    if (chess.isInCheck(next, 'w')) score += 7;
    if (moving && move.to[0] === 7 && moving.type === 'p') score += 16;
    if (move.castle) score += 2;
    return { move, score };
  });
  scored.sort(function (a, b) {
    return b.score - a.score;
  });
  const top = scored.slice(0, Math.min(4, scored.length));
  return top[Math.floor(deps.rng.next() * top.length)].move;
}

/**
 * Guard blokade hero: tolak petak yang menutup SEMUA jawaban boss
 * (menghasilkan remis). Skak dikecualikan — jawaban skak selalu diizinkan.
 */
export function blockadeAllowsBossMove(
  state: BattleState,
  deps: BattleDeps,
  squares: Square[],
): boolean {
  if (deps.chess.isInCheck(state.board, 'b')) return true;
  return battleLegalMoves(state, deps, 'b').some(function (move) {
    return !squares.some(function (square) {
      return move.to[0] === square[0] && move.to[1] === square[1];
    });
  });
}

function highestValueBlack(order: Piece[]): Piece | null {
  const sorted = order.slice().sort(function (a, b) {
    return PIECE_VALUES[b.type] - PIECE_VALUES[a.type];
  });
  return sorted.length > 0 ? sorted[0] : null;
}

/**
 * Resolusi skill lawan setelah langkah hitam. Cerminan resolveEnemySkill:
 * tangkapan hitam +1 EN; Perisai melindungi bidak terancam bernilai tertinggi
 * (atau tertinggi bila tak ada ancaman, dan tidak saat sedang skak); Gangguan
 * mempersenjatai drain (Tangkis Arus memantulkan +1 EN putih); gagal aktivasi
 * +1 EN dan rencana dipulihkan dari indeks giliran.
 */
export function resolveEnemySkill(
  state: BattleState,
  deps: BattleDeps,
  captured: boolean,
): BattleState {
  const chess = deps.chess;
  let next: BattleState = captured
    ? { ...state, enemyEnergy: Math.min(5, state.enemyEnergy + 1) }
    : state;
  const skill = next.enemyPreparedSkill;
  const skillCost = ENEMY_SKILL_BASE_COST + next.enemySurcharge;
  let activated = false;
  if (skill && next.enemyEnergy >= skillCost) {
    if (skill === 'siphon') {
      if (next.parryArmed) {
        next = {
          ...next,
          energy: Math.min(5, next.energy + 1),
          parryArmed: false,
        };
      } else {
        next = { ...next, enemyDrainArmed: true };
      }
      activated = true;
    } else if (skill === 'ward' && !chess.isInCheck(next.board, 'b')) {
      const threatened = battleLegalMoves({ ...next }, deps, 'w')
        .map(function (move) {
          return chess.captureAt(next.board, next.enPassant, move);
        })
        .filter(function (piece): piece is Piece {
          return piece != null && piece.color === 'b' && piece.type !== 'k';
        });
      const pool =
        threatened.length > 0
          ? threatened
          : next.board
              .flat()
              .filter(function (piece): piece is Piece {
                return piece != null && piece.color === 'b' && piece.type !== 'k';
              });
      const pick = highestValueBlack(pool);
      if (pick) {
        next = { ...next, enemyWardPieceId: pick.id };
        activated = true;
      }
    }
  }
  if (activated) {
    next = {
      ...next,
      enemyEnergy: next.enemyEnergy - skillCost,
      enemySurcharge: 0,
      enemyPreparedSkill: next.enemySkillIndex === 0 ? 'ward' : 'siphon',
      enemySkillIndex: next.enemySkillIndex === 0 ? 1 : 0,
    };
  } else {
    const restored =
      !next.enemyPreparedSkill
        ? ((next.enemySkillIndex === 0 ? 'ward' : 'siphon') as 'ward' | 'siphon')
        : next.enemyPreparedSkill;
    next = {
      ...next,
      enemyEnergy: Math.min(5, next.enemyEnergy + 1),
      parryArmed: false,
      enemyPreparedSkill: restored,
    };
  }
  if (next.enemyEnergy < 2 && !next.enemyPreparedSkill) {
    next = {
      ...next,
      enemyPreparedSkill: next.enemySkillIndex === 0 ? 'ward' : 'siphon',
    };
  }
  return next;
}

/**
 * Aturan khusus boss setelah fase hitam. Cerminan applyBossRule:
 * shield = ward ke bidak hitam terkuat; drain = drain dipersenjatai;
 * seal = satu petak tengah kosong disegel untuk langkah putih berikutnya.
 */
export function applyBossRule(state: BattleState, deps: BattleDeps, boss: BossDef): BattleState {
  if (boss.ruleKey === 'shield') {
    const targets = state.board
      .flat()
      .filter(function (piece): piece is Piece {
        return piece != null && piece.color === 'b' && piece.type !== 'k';
      })
      .sort(function (a, b) {
        return PIECE_VALUES[b.type] - PIECE_VALUES[a.type];
      });
    return { ...state, enemyWardPieceId: targets.length > 0 ? targets[0].id : null };
  }
  if (boss.ruleKey === 'drain') {
    return { ...state, enemyDrainArmed: true };
  }
  const legal = battleLegalMoves(state, deps, 'w');
  const candidates: Square[] = [];
  for (let row = 2; row <= 5; row += 1) {
    for (let col = 2; col <= 5; col += 1) {
      if (state.board[row][col]) continue;
      if (
        legal.some(function (move) {
          return move.to[0] !== row || move.to[1] !== col;
        })
      ) {
        candidates.push([row, col]);
      }
    }
  }
  return {
    ...state,
    bossSealedSquare:
      candidates.length > 0
        ? candidates[Math.floor(deps.rng.next() * candidates.length)]
        : null,
  };
}

export type EnemyPlanKind = 'ward-active' | 'drain-active' | 'siphon-telegraph' | 'ward-telegraph' | 'disrupted';

export interface EnemyTelegraph {
  kind: EnemyPlanKind;
  /** Biaya skill berikutnya (2 + surcharge). */
  cost: number;
  /** True bila lawan mampu membayar biaya saat ini. */
  ready: boolean;
  surcharge: number;
  energy: number;
}

/** Ringkasan data telegraph lawan untuk UI (tanpa string tampilan). */
export function describeEnemyPlan(state: BattleState): EnemyTelegraph {
  const cost = ENEMY_SKILL_BASE_COST + state.enemySurcharge;
  if (state.enemyWardPieceId) {
    return { kind: 'ward-active', cost, ready: true, surcharge: state.enemySurcharge, energy: state.enemyEnergy };
  }
  if (state.enemyDrainArmed) {
    return { kind: 'drain-active', cost, ready: true, surcharge: state.enemySurcharge, energy: state.enemyEnergy };
  }
  if (state.enemyPreparedSkill === 'siphon') {
    return {
      kind: 'siphon-telegraph',
      cost,
      ready: state.enemyEnergy >= cost,
      surcharge: state.enemySurcharge,
      energy: state.enemyEnergy,
    };
  }
  if (state.enemyPreparedSkill === 'ward') {
    return {
      kind: 'ward-telegraph',
      cost,
      ready: state.enemyEnergy >= cost,
      surcharge: state.enemySurcharge,
      energy: state.enemyEnergy,
    };
  }
  return { kind: 'disrupted', cost, ready: false, surcharge: state.enemySurcharge, energy: state.enemyEnergy };
}

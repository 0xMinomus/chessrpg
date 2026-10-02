// Hasil pertandingan: skakmat menang/kalah, remis, dan hadiah first-clear.
//
// checkOutcome murni terhadap BattleState; klaim progres dilakukan
// claimBattleReward agar game core tidak menyentuh penyimpanan.

import {
  type BattleDeps,
  type BattleState,
  type OpponentDef,
  type Color,
} from './state.ts';
import { battleLegalMoves } from './effects.ts';
import {
  claimFloorReward,
  type Campaign,
  type RewardClaim,
} from '../campaign/progress.ts';

export interface OutcomeCheck {
  state: BattleState;
  ended: boolean;
  /** True bila kemenangan ini kemenangan pertama atas boss tersebut. */
  firstClear: boolean;
  alreadyCleared: boolean;
}

/**
 * Cek skakmat / remis untuk sisi yang akan bergerak.
 * Kemenangan putih menandai dungeonRewarded dan menambahkan suffix status
 * ('+N koin' first-clear vs 'sudah ditaklukkan'), koinnya sendiri lewat
 * claimBattleReward di application.
 */
export function checkOutcome(
  state: BattleState,
  deps: BattleDeps,
  side: Color,
  opponent: OpponentDef,
  alreadyCleared: boolean,
): OutcomeCheck {
  const moves = battleLegalMoves(state, deps, side);
  const checked = deps.chess.isInCheck(state.board, side);
  if (moves.length > 0) {
    if (!checked) return { state, ended: false, firstClear: false, alreadyCleared };
    const status = side === 'w' ? 'Skak. Lindungi raja putih.' : 'Skak. Raja lawan terancam.';
    return { state: { ...state, status }, ended: false, firstClear: false, alreadyCleared };
  }
  let next: BattleState = {
    ...state,
    gameOver: true,
    winner: checked ? (side === 'w' ? 'b' : 'w') : null,
    status: checked
      ? side === 'w'
        ? 'Skakmat. Raja putih tumbang.'
        : 'Skakmat. Raja hitam tumbang.'
      : 'Remis. Tidak ada langkah legal.',
  };
  let firstClear = false;
  if (next.winner === 'w' && !next.dungeonRewarded) {
    next = { ...next, dungeonRewarded: true };
    firstClear = !alreadyCleared;
    next = {
      ...next,
      status: firstClear
        ? next.status + ' +' + opponent.reward + ' koin.'
        : next.status + ' Lantai ini sudah ditaklukkan sebelumnya.',
    };
  }
  return { state: next, ended: true, firstClear, alreadyCleared };
}

/**
 * Terapkan hadiah first-clear ke kampanye setelah duel dimenangkan putih.
 * No-op bila duel belum dimenangkan / sudah diberi hadiah / boss sudah
 * ditaklukkan sebelumnya.
 */
export function claimBattleReward(
  campaign: Campaign,
  battle: BattleState,
  opponent: OpponentDef,
  floorOrder: readonly string[],
): RewardClaim {
  if (battle.winner !== 'w' || !battle.dungeonRewarded) {
    return { campaign, firstClear: false };
  }
  return claimFloorReward(campaign, battle.floorId, opponent.reward, floorOrder);
}

// Hasil pertandingan: skakmat menang/kalah, remis, dan hadiah first-clear.
//
// checkOutcome murni terhadap BattleState; mutasi kampanye (koin +
// defeatedBosses) dilakukan claimBattleReward agar game core tidak
// menyentuh penyimpanan. Kombinasinya setara updateOutcome prototipe.

import {
  type BattleDeps,
  type BattleState,
  type BossDef,
  type Color,
} from './state.ts';
import { battleLegalMoves } from './effects.ts';
import {
  claimReward,
  type Campaign,
  type RewardClaim,
} from '../campaign/progress.ts';

export interface OutcomeCheck {
  state: BattleState;
  ended: boolean;
  /** True bila kemenangan ini kemenangan pertama atas boss tersebut. */
  firstClear: boolean;
  alreadyDefeated: boolean;
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
  boss: BossDef,
  alreadyDefeated: boolean,
): OutcomeCheck {
  const moves = battleLegalMoves(state, deps, side);
  const checked = deps.chess.isInCheck(state.board, side);
  if (moves.length > 0) {
    if (!checked) return { state, ended: false, firstClear: false, alreadyDefeated };
    const status = side === 'w' ? 'Skak. Lindungi raja putih.' : 'Skak. Raja lawan terancam.';
    return { state: { ...state, status }, ended: false, firstClear: false, alreadyDefeated };
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
    firstClear = !alreadyDefeated;
    next = {
      ...next,
      status: firstClear
        ? next.status + ' +' + boss.reward + ' koin.'
        : next.status + ' Boss ini sudah ditaklukkan sebelumnya.',
    };
  }
  return { state: next, ended: true, firstClear, alreadyDefeated };
}

/**
 * Terapkan hadiah first-clear ke kampanye setelah duel dimenangkan putih.
 * No-op bila duel belum dimenangkan / sudah diberi hadiah / boss sudah
 * ditaklukkan sebelumnya.
 */
export function claimBattleReward(
  campaign: Campaign,
  battle: BattleState,
  boss: BossDef,
): RewardClaim {
  if (battle.winner !== 'w' || !battle.dungeonRewarded) {
    return { campaign, firstClear: false };
  }
  return claimReward(campaign, boss.id, boss.reward);
}

// Use case mulai / ulangi / klaim hadiah duel.
// Tanpa DOM; penyimpanan + audio diterima sebagai parameter adapter.

import type { CampaignStore } from '../adapters/browser-storage.ts';
import type { AudioPort } from './play-card.ts';
import type { Campaign } from '../domain/campaign/progress.ts';
import { isBossUnlocked } from '../domain/campaign/progress.ts';
import type { BattleDeps, BattleState, BossDef } from '../domain/battle/state.ts';
import { createInitialBattle } from '../domain/battle/state.ts';
import { restartBattle } from '../domain/battle/commands.ts';
import { claimBattleReward } from '../domain/battle/result.ts';
import { makeHand } from '../domain/battle/resources.ts';

export type StartBattleResult =
  | { ok: true; battle: BattleState; message: string }
  | { ok: false; battle: null; message: string };

/** Mulai duel hero vs boss yang terbuka. Gagal tanpa state bila id tak dikenal / terkunci. */
export function startBattle(
  deps: BattleDeps,
  bossOrder: string[],
  campaign: Campaign,
  heroId: string,
  bossId: string,
): StartBattleResult {
  const hero = deps.heroes[heroId];
  const boss = deps.bosses[bossId];
  if (!hero) return { ok: false, battle: null, message: 'Hero tidak dikenal.' };
  if (!boss) return { ok: false, battle: null, message: 'Boss tidak dikenal.' };
  if (!isBossUnlocked(bossOrder, campaign, bossId)) {
    return { ok: false, battle: null, message: 'Lantai boss masih terkunci.' };
  }
  const battle = createInitialBattle({
    hero,
    boss,
    board: deps.chess.initialBoard(),
    hand: makeHand([], deps),
  });
  return { ok: true, battle, message: battle.status };
}

/** Mulai ulang duel dengan hero + boss yang sama (tanpa audio, seperti prototipe). */
export function restartBattleFlow(battle: BattleState, deps: BattleDeps): StartBattleResult {
  const result = restartBattle(battle, deps);
  return { ok: true, battle: result.state, message: result.message };
}

export interface RewardFlowResult {
  campaign: Campaign;
  firstClear: boolean;
  saved: boolean;
  message: string;
}

/** Klaim hadiah first-clear ke kampanye + simpan lewat adapter storage. */
export function claimBattleRewardFlow(
  campaign: Campaign,
  battle: BattleState,
  boss: BossDef,
  store: CampaignStore,
  _audio: AudioPort,
): RewardFlowResult {
  const claimed = claimBattleReward(campaign, battle, boss);
  if (!claimed.firstClear) {
    return { campaign, firstClear: false, saved: false, message: 'Tidak ada hadiah baru.' };
  }
  const saved = store.save(claimed.campaign);
  return {
    campaign: claimed.campaign,
    firstClear: true,
    saved,
    message: 'Hadiah ' + boss.reward + ' koin diklaim.',
  };
}

// Use case mulai / ulangi / klaim hadiah duel.
// Tanpa DOM; penyimpanan + audio diterima sebagai parameter adapter.

import type { CampaignStore } from '../adapters/browser-storage.ts';
import type { AudioPort } from './play-card.ts';
import type { Campaign } from '../domain/campaign/progress.ts';
import { isFloorUnlocked } from '../domain/campaign/progress.ts';
import type { BattleDeps, BattleState, OpponentDef } from '../domain/battle/state.ts';
import { createInitialBattle } from '../domain/battle/state.ts';
import { restartBattle } from '../domain/battle/commands.ts';
import { claimBattleReward } from '../domain/battle/result.ts';
import { makeHand } from '../domain/battle/resources.ts';
import { deckSelectionStatus, type DeckCatalog } from '../domain/campaign/deck.ts';

export type StartBattleResult =
  | { ok: true; battle: BattleState; message: string }
  | { ok: false; battle: null; message: string };

/** Mulai duel pada lantai terbuka. Lantai terkunci atau id asing tidak membuat state. */
export function startBattle(
  deps: BattleDeps,
  floorOrder: readonly string[],
  campaign: Campaign,
  heroId: string,
  floorId: string,
): StartBattleResult {
  const hero = deps.heroes[heroId];
  const opponent = deps.opponents[floorId];
  if (!hero) return { ok: false, battle: null, message: 'Hero tidak dikenal.' };
  if (!opponent) return { ok: false, battle: null, message: 'Lantai tidak dikenal.' };
  if (!isFloorUnlocked(floorOrder, campaign, floorId)) {
    return { ok: false, battle: null, message: 'Lantai masih terkunci.' };
  }
  const deckCatalog: DeckCatalog = {
    regularCardIds: Object.values(deps.cards)
      .filter(function (card) {
        return card.kind !== 'joker';
      })
      .map(function (card) {
        return card.id;
      }),
    jokerCardIds: Object.values(deps.cards)
      .filter(function (card) {
        return card.kind === 'joker';
      })
      .map(function (card) {
        return card.id;
      }),
  };
  if (!deckSelectionStatus(campaign.deckCardIds, deckCatalog).complete) {
    return { ok: false, battle: null, message: 'Deck harus berisi 10 kartu non-Joker dan 1 Joker.' };
  }
  const battle = createInitialBattle({
    hero,
    opponent,
    board: deps.chess.initialBoard(),
    hand: makeHand([], deps, campaign.deckCardIds),
    deckCardIds: campaign.deckCardIds,
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
  opponent: OpponentDef,
  floorOrder: readonly string[],
  store: CampaignStore,
  _audio: AudioPort,
): RewardFlowResult {
  const claimed = claimBattleReward(campaign, battle, opponent, floorOrder);
  if (!claimed.firstClear) {
    return { campaign, firstClear: false, saved: false, message: 'Tidak ada hadiah baru.' };
  }
  const saved = store.save(claimed.campaign);
  return {
    campaign: claimed.campaign,
    firstClear: true,
    saved,
    message: 'Hadiah ' + opponent.reward + ' koin diklaim.',
  };
}

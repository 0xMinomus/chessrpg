// Bootstrap aplikasi (Fase 4 integrasi): compose content + domain + application
// + adapters ke UI modular. Handler di file ini HANYA meneruskan intent ke
// command/use case dan merender snapshot state; tidak ada aturan catur,
// pembayaran resource, atau efek kartu di sini.

import { renderApp } from './ui/render.ts';
import type { AppShellView, ScreenName } from './ui/render.ts';
import type { CaptureFx, LegalMoveRef } from './ui/board/board.ts';
import type { CardMeta, CardSlotView, RerollView } from './ui/cards/cards.ts';
import { HERO_MANA_CAP, HERO_SKILL_COST, HERO_ULTIMATE_COST } from './ui/hero/hero.ts';
import type { MenuView } from './ui/screens/menu.ts';
import type { DungeonPageView } from './ui/screens/dungeon.ts';
import type { DeckFilter, HeroMenuTab, HeroesPageView } from './ui/screens/heroes.ts';
import type { BattlePageView, LedgerEntryView } from './ui/screens/battle.ts';
import type { ResultView } from './ui/screens/result.ts';
import type { BossListItem } from './ui/dungeon/dungeon.ts';

import { CARDS, cardById } from './content/cards.ts';
import { EN_CAP, HEROES, heroById as contentHeroById } from './content/heroes.ts';
import { BOSSES, bossById as contentBossById } from './content/bosses.ts';

import type { BattleDeps, BattleState, CommandResult } from './domain/battle/state.ts';
import { canUndo } from './domain/battle/commands.ts';
import { battleLegalMovesFrom } from './domain/battle/effects.ts';
import { canPlayCard, currentCardCost, rerollCost, rerollLimit } from './domain/battle/resources.ts';
import { describeEnemyPlan } from './domain/battle/ai.ts';
import {
  chooseHero as chooseHeroProgress,
  isBossUnlocked,
  nextBossId as nextBossProgress,
  DECK_JOKER_LIMIT,
  DECK_REGULAR_LIMIT,
  deckSelectionStatus,
  toggleDeckCard,
  type DeckCatalog,
  type Campaign,
} from './domain/campaign/index.ts';
import {
  advanceBlackReplyFlow,
  cancelTargetFlow,
  claimBattleRewardFlow,
  choosePromotionFlow,
  playCardFlow,
  rerollHandFlow,
  resolveCardTargetFlow,
  resolveHeroTargetFlow,
  restartBattleFlow,
  startBattle,
  tapSquareFlow,
  undoTurnFlow,
  useHeroSkillFlow,
  useHeroUltimateFlow,
} from './application/index.ts';

import { createBrowserAudio } from './adapters/browser-audio.ts';
import { createCampaignStore, createLocalStorageBacking } from './adapters/browser-storage.ts';
import { MathRandom } from './adapters/random.ts';
import { chessRulesAdapter } from './adapters/chess-rules.ts';

// ---------- Dependency wiring (satu sumber data; tidak ada angka di UI) ----------

const HERO_IDS = HEROES.map(function (hero) {
  return hero.id;
});
const BOSS_IDS = BOSSES.map(function (boss) {
  return boss.id;
});
const DECK_CATALOG: DeckCatalog = {
  regularCardIds: CARDS.filter(function (card) {
    return card.kind !== 'joker';
  }).map(function (card) {
    return card.id;
  }),
  jokerCardIds: CARDS.filter(function (card) {
    return card.kind === 'joker';
  }).map(function (card) {
    return card.id;
  }),
};

const deps: BattleDeps = {
  chess: chessRulesAdapter,
  rng: new MathRandom(),
  cards: Object.fromEntries(
    CARDS.map(function (card) {
      return [card.id, { id: card.id, name: card.name, cost: card.cost, kind: card.kind, weight: card.weight }];
    }),
  ),
  heroes: Object.fromEntries(
    HEROES.map(function (hero) {
      return [
        hero.id,
        {
          id: hero.id,
          name: hero.name,
          startEnergy: hero.startEnergy,
          skillAction: hero.skillAction,
          ultimateAction: hero.ultimateAction,
          offenseSurcharge: hero.offenseSurcharge,
          jokerSurcharge: hero.jokerSurcharge,
          captureBonus: hero.captureBonus,
          captureEnergy: hero.captureEnergy,
        },
      ];
    }),
  ),
  bosses: Object.fromEntries(
    BOSSES.map(function (boss) {
      return [boss.id, { id: boss.id, ruleKey: boss.ruleKey, reward: boss.reward }];
    }),
  ),
};

const store = createCampaignStore(createLocalStorageBacking());
const audio = createBrowserAudio(createLocalStorageBacking());

// ---------- State aplikasi ----------

interface AppState {
  screen: ScreenName;
  campaign: Campaign;
  heroDetailsId: string;
  heroesTab: HeroMenuTab;
  deckFilter: DeckFilter;
  deckNotice: string | null;
  selectedBossId: string;
  battle: BattleState | null;
  focusSquare: [number, number];
  soundEnabled: boolean;
  rewardText: string | null;
  blackTimer: number | null;
  /** Efek tangkapan sesaat untuk animasi papan (state visual, bukan aturan). */
  captureFx: CaptureFx | null;
  captureFxTimer: number | null;
}

const PIECE_NAMES: Record<string, string> = {
  k: 'raja',
  q: 'ratu',
  r: 'benteng',
  b: 'gajah',
  n: 'kuda',
  p: 'pion',
};
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function coord(row: number, col: number): string {
  return FILES[col] + String(8 - row);
}

function cardMeta(id: string): CardMeta {
  const card = cardById[id];
  if (!card) {
    return {
      id,
      name: 'Kartu rusak',
      cost: 0,
      kind: 'spell',
      tag: 'Mantra',
      desc: 'Kartu ini tidak ada di dek dan dibuang.',
      icon: 'shock',
    };
  }
  return {
    id: card.id,
    name: card.name,
    cost: card.cost,
    kind: card.kind,
    tag: card.tag,
    desc: card.desc,
    icon: card.icon,
  };
}

function activeHeroOf(state: AppState) {
  return contentHeroById(state.campaign.selectedHero);
}

function bossOf(battle: BattleState) {
  return contentBossById(battle.bossId);
}

// ---------- Pembangun view per layar ----------

function buildMenuView(state: AppState): MenuView {
  const hero = activeHeroOf(state);
  const allCleared = state.campaign.defeatedBosses.length >= BOSSES.length;
  const next = contentBossById(nextBossProgress(BOSS_IDS, state.campaign));
  const floorProgress = BOSSES.map(function (boss) {
    return {
      id: boss.id,
      name: boss.name,
      glyph: boss.glyph,
      subtitle: boss.subtitle,
      reward: boss.reward,
      unlocked: isBossUnlocked(BOSS_IDS, state.campaign, boss.id),
      defeated: state.campaign.defeatedBosses.indexOf(boss.id) !== -1,
      selected: boss.id === state.selectedBossId,
      description: boss.description,
      rule: boss.rule,
    };
  });
  const selectedBoss = floorProgress.find(function (boss) {
    return boss.selected;
  }) ?? floorProgress[0];
  const lastClearedId = state.campaign.defeatedBosses[state.campaign.defeatedBosses.length - 1];
  const lastClearedBoss = lastClearedId
    ? floorProgress.find(function (boss) {
        return boss.id === lastClearedId;
      }) ?? null
    : null;
  return {
    coins: state.campaign.coins,
    clearedCount: state.campaign.defeatedBosses.length,
    totalFloors: BOSSES.length,
    allCleared,
    nextBoss: { name: next.name, description: next.description, rule: next.rule },
    selectedBoss,
    lastClearedBoss,
    floorProgress,
    activeHero: {
      id: hero.id,
      name: hero.name,
      role: hero.role,
      portrait: hero.portrait,
      skillName: hero.skillName,
      skillDescription: hero.skillDescription,
      ultimateName: hero.ultimateName,
      ultimateDescription: hero.ultimateDescription,
      strength: hero.strength,
      weakness: hero.weakness,
    },
    heroCount: HEROES.length,
    cardCount: CARDS.length,
    deckReady: deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG).complete,
  };
}

function buildDungeonView(state: AppState): DungeonPageView {
  const items: BossListItem[] = BOSSES.map(function (boss) {
    return {
      id: boss.id,
      name: boss.name,
      glyph: boss.glyph,
      subtitle: boss.subtitle,
      reward: boss.reward,
      unlocked: isBossUnlocked(BOSS_IDS, state.campaign, boss.id),
      defeated: state.campaign.defeatedBosses.indexOf(boss.id) !== -1,
      selected: boss.id === state.selectedBossId,
    };
  });
  const detail = contentBossById(state.selectedBossId);
  const unlocked = isBossUnlocked(BOSS_IDS, state.campaign, detail.id);
  const defeated = state.campaign.defeatedBosses.indexOf(detail.id) !== -1;
  return {
    items,
    deckReady: deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG).complete,
    detail: {
      id: detail.id,
      name: detail.name,
      glyph: detail.glyph,
      subtitle: detail.subtitle,
      reward: detail.reward,
      unlocked,
      defeated,
      selected: true,
      description: detail.description,
      rule: detail.rule,
    },
  };
}

function buildHeroesView(state: AppState): HeroesPageView {
  const deckStatus = deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG);
  const selectedDeckIds = new Set(state.campaign.deckCardIds);
  const selectedDeckCards = CARDS.filter(function (card) {
    return selectedDeckIds.has(card.id);
  });
  const hero = contentHeroById(state.campaign.selectedHero);
  const roster = HEROES.map(function (hero) {
    const active = hero.id === state.campaign.selectedHero;
    return {
      id: hero.id,
      name: hero.name,
      role: hero.role,
      portrait: hero.portrait,
      startEnergy: hero.startEnergy,
      energyCap: EN_CAP,
      stateLabel: active ? 'Dipakai' : 'Dimiliki',
      selected: hero.id === state.heroDetailsId,
      active,
    };
  });
  const detail = contentHeroById(state.heroDetailsId);
  const active = state.campaign.selectedHero === detail.id;
  return {
    roster,
    detail: {
      id: detail.id,
      name: detail.name,
      role: detail.role,
      portrait: detail.portrait,
      startEnergy: detail.startEnergy,
      energyCap: EN_CAP,
      skillName: detail.skillName,
      skillCost: HERO_SKILL_COST,
      skillDesc: detail.skillDescription,
      ultimateName: detail.ultimateName,
      ultimateCost: HERO_ULTIMATE_COST,
      ultimateDesc: detail.ultimateDescription,
      strength: detail.strength,
      weakness: detail.weakness,
      active,
      stateMessage: active ? 'Hero ini sudah dipilih.' : 'Hero ini bisa langsung dipakai.',
    },
    tab: state.heroesTab,
    filter: state.deckFilter,
    deck: {
      cards: CARDS.filter(function (card) {
        return state.deckFilter === 'all' || card.kind === state.deckFilter;
      }).map(function (card) {
        const selected = selectedDeckIds.has(card.id);
        return {
          id: card.id,
          name: card.name,
          cost: card.cost,
          kind: card.kind,
          tag: card.tag,
          desc: card.desc,
          icon: card.icon,
          selected,
          disabled:
            !selected &&
            (card.kind === 'joker'
              ? deckStatus.jokerCount >= DECK_JOKER_LIMIT
              : deckStatus.regularCount >= DECK_REGULAR_LIMIT),
        };
      }),
      selectedCards: selectedDeckCards.map(function (card) {
        return {
          id: card.id,
          name: card.name,
          cost: card.cost,
          kind: card.kind,
          tag: card.tag,
          desc: card.desc,
          icon: card.icon,
          selected: true,
          disabled: false,
        };
      }),
      regularCount: deckStatus.regularCount,
      jokerCount: deckStatus.jokerCount,
      regularLimit: DECK_REGULAR_LIMIT,
      jokerLimit: DECK_JOKER_LIMIT,
      totalCardCount: CARDS.length,
      complete: deckStatus.complete,
      notice: state.deckNotice,
      activeHero: {
        name: hero.name,
        role: hero.role,
        portrait: hero.portrait,
        skillName: hero.skillName,
        ultimateName: hero.ultimateName,
      },
    },
  };
}

function cardSlots(battle: BattleState, hero: ReturnType<typeof contentHeroById>): CardSlotView[] {
  const busy = battle.thinking || battle.gameOver || battle.turn !== 'w';
  return battle.hand.map(function (id, slot) {
    const card = cardById[id];
    const cost = card ? currentCardCost(card, hero, battle.reserveArmed) : 0;
    const targeting = battle.activeSkill === id && battle.activeSlot === slot;
    const playability = card
      ? canPlayCard(battle, card, hero)
      : { ok: false, reason: 'Kartu ini tidak ada di dek dan dibuang.' };
    const freeLocked = card != null && card.cost === 0 && battle.freeSkillUsedThisTurn && !targeting;
    const unaffordable = card != null && battle.heroMana < cost;
    const locked = busy || (battle.activeSkill !== null && !targeting) || (!targeting && !playability.ok);
    let stateLabel = 'SIAP';
    let actionLabel = 'AKTIFKAN';
    if (targeting) {
      stateLabel = 'PILIH TARGET';
      actionLabel = 'BATALKAN';
    } else if (freeLocked) {
      stateLabel = 'GRATIS TERPAKAI';
      actionLabel = 'TUNGGU GILIRAN';
    } else if (unaffordable) {
      stateLabel = 'BUTUH ' + cost + ' MANA';
      actionLabel = 'MANA ' + battle.heroMana + '/' + HERO_MANA_CAP;
    } else if (card != null && card.cost === 0) {
      stateLabel = 'GRATIS · 1 GILIRAN';
    } else if (card != null && cost !== card.cost) {
      stateLabel = 'SURCHARGE ' + (cost - card.cost) + ' MANA';
    }
    return { card: cardMeta(id), cost, targeting, locked, stateLabel, actionLabel, unaffordable: unaffordable && !targeting };
  });
}

function rerollView(battle: BattleState): RerollView {
  const limit = rerollLimit(battle);
  const available = battle.rollsThisTurn < limit;
  const cost = rerollCost(battle);
  const busy = battle.gameOver || battle.thinking || battle.turn !== 'w' || battle.activeSkill !== null;
  return {
    available,
    label: !available
      ? 'PUTAR ULANG HABIS'
      : cost > 0
        ? 'PUTAR KARTU • 1 EN'
        : 'PUTAR KARTU • GRATIS',
    caption: available
      ? cost > 0
        ? 'Biaya 1 EN • putaran ' + (battle.rollsThisTurn + 1) + ' dari ' + limit
        : 'Gratis • putaran 1 dari ' + limit
      : 'Jatah giliran ini habis',
    disabled: busy || !available || battle.energy < cost,
    reason: available
      ? cost > 0
        ? 'Ganti ketiga kartu dengan biaya 1 EN. Putaran ' + (battle.rollsThisTurn + 1) + ' dari ' + limit + '.'
        : 'Ganti ketiga kartu gratis. Putaran pertama tiap giliran.'
      : 'Jatah putar ulang giliran ini sudah habis (' + limit + '/' + limit + ').',
  };
}

/**
 * Telegraph dibaca dari data domain (describeEnemyPlan) agar biaya skill lawan
 * dan status kesiapan hanya punya satu sumber angka.
 */
function telegraph(battle: BattleState): BattlePageView['telegraph'] {
  const plan = describeEnemyPlan(battle);
  const cost = String(plan.cost);
  if (plan.kind === 'ward-active') {
    return {
      title: 'Perisai lawan aktif',
      copy: 'Biday hitam terlindungi untuk satu balasan.',
      state: 'AKTIF',
    };
  }
  if (plan.kind === 'drain-active') {
    return {
      title: 'Gangguan lawan aktif',
      copy: 'Setelah langkah putih berikutnya, lawan menguras 1 EN.',
      state: 'AWAS',
    };
  }
  if (plan.kind === 'siphon-telegraph') {
    return {
      title: 'Lawan menyiapkan Gangguan',
      copy:
        'Jika memiliki ' +
        cost +
        ' EN saat giliran hitam, lawan menguras 1 EN setelah langkahmu.',
      state: plan.ready ? 'SIAP' : 'MENGISI',
    };
  }
  if (plan.kind === 'ward-telegraph') {
    return {
      title: 'Lawan menyiapkan Perisai',
      copy: 'Jika memiliki ' + cost + ' EN, melindungi biday hitam bernilai tertinggi yang terancam.',
      state: plan.ready ? 'SIAP' : 'MENGISI',
    };
  }
  return {
    title: 'Rencana lawan terganggu',
    copy: 'Kuras inti menunda skill berikutnya; perhatikan energi lawan.',
    state: 'TERTUNDA',
  };
}

function ledger(battle: BattleState): BattlePageView['ledger'] {
  if (battle.history.length === 0) {
    return {
      countLabel: 'Belum ada langkah',
      empty: true,
      emptyText: 'Putih membuka pertandingan. Pilih satu bidak di papan.',
      entries: [],
    };
  }
  const entries: LedgerEntryView[] = battle.history
    .slice(-6)
    .reverse()
    .map(function (item, index) {
      const number = Math.ceil((battle.history.length - index) / 2);
      const detail =
        (item.note ??
          (item.castle
            ? item.castle === 'k'
              ? 'rokade sisi raja'
              : 'rokade sisi ratu'
            : (PIECE_NAMES[item.piece] ?? item.piece) + (item.capture ? ' x ' : ' ke ') + item.to)) +
        (item.promotion ? ' = ' + (PIECE_NAMES[item.promotion] ?? item.promotion) : '');
      return { numberLabel: pad2(number) + (item.color === 'w' ? 'P' : 'H'), detail };
    });
  return { countLabel: battle.history.length + ' setengah-langkah', empty: false, emptyText: '', entries };
}

function effectChips(battle: BattleState): { text: string; enemy: boolean }[] {
  const chips: { text: string; enemy: boolean }[] = [];
  const add = function (text: string, enemy = false): void {
    chips.push({ text, enemy });
  };
  if (battle.heroAegisActive) add('Mata Air • semua bidak terlindungi');
  if (battle.playerWardPieceId) add('Perisai putih • ' + battle.playerWardTurns + ' balasan boss');
  if (battle.enemyWardPieceId) add('Perisai hitam • target terlindungi', true);
  if (battle.markedEnemyId) add('Tanda buru • tangkap untuk +1 EN');
  if (battle.staggerId) add('Gentar • tak dapat menangkap', true);
  if (battle.snareId) add('Jerat • ' + battle.snareTurns + ' balasan boss tak dapat bergerak', true);
  if (battle.blockadeSquare) {
    add(
      'Blokade ' +
        coord(battle.blockadeSquare[0], battle.blockadeSquare[1]) +
        ' • ' +
        battle.blockadeTurns +
        ' balasan boss',
    );
  }
  if (battle.heroBlockadeSquares.length > 0) {
    add(
      battle.heroBlockadeName +
        ' • ' +
        battle.heroBlockadeSquares.length +
        ' petak / ' +
        battle.heroBlockadeTurns +
        ' balasan boss',
    );
  }
  if (battle.bossSealedSquare) {
    add('Retakan ' + coord(battle.bossSealedSquare[0], battle.bossSealedSquare[1]) + ' • petak tersegel', true);
  }
  if (battle.enemyDrainArmed) add('Gangguan • langkahmu berikutnya −1 EN', true);
  if (battle.enemySurcharge > 0) add('Pajak mantra • skill lawan +' + battle.enemySurcharge + ' EN', true);
  if (battle.reserveArmed) add('Fokus cadangan • kartu berikutnya −1 mana');
  if (battle.tempoArmed) add('Tempo ganda • tangkapan memberi langkah ekstra');
  if (battle.knightTargetId) add('Jejak kuda • reluctantly seperti kuda');
  if (battle.pawnStepId) add('Langkah pion • maju 2 petak');
  if (battle.pawnRaidId) add('Serbu pion • tangkap lurus 1 petak');
  if (battle.phaseTargetId || battle.phaseJokerId) add('Langkah bayangan • pindah 2 petak');
  if (battle.prismTargetId) add('Prisma gerak • pola gerak ditukar');
  if (battle.rookBendId) add('Belok benteng • diagonal 1 petak');
  if (battle.pierceArmed) add('Tembus perisai • tangkapan menembus ward');
  if (battle.shockArmed) add('Pukulan guntur • skak menguras 1 EN lawan');
  if (battle.quietArmed) add('Arus sunyi • langkah tanpa tangkapan +1 EN');
  if (battle.focusCaptureArmed) add('Taktik presisi • tangkapan +1 EN');
  if (battle.leechArmed) add('Lintas arkanum • tangkap 1 EN lawan');
  if (battle.salvageArmed) add('Rongsokan • tangkapan +1 EN');
  if (battle.parryArmed) add('Tangkis arus • pantulan Gangguan siap');
  if (battle.riposteArmed) add('Balas tusuk • tangkapan lawan +1 EN');
  if (battle.lastLaughArmed) add('Bangkit balik • skak hitam +2 EN');
  if (battle.pawnBreathArmed) add('Napas pion • pion tanpa tangkapan +1 EN');
  if (battle.pawnPulseArmed) add('Denyut pion • skak pion −1 EN lawan');
  if (battle.heroPawnRushIds) add('Pawai bidak • semua pion maju 2 petak');
  if (battle.relayFirstId) add('Relay bidak • pilih bidak kedua');
  return chips;
}

function legalMovesFor(battle: BattleState): LegalMoveRef[] {
  if (!battle.selected || battle.activeSkill) return [];
  return battleLegalMovesFrom(battle, deps, battle.selected[0], battle.selected[1]).map(function (move) {
    return { from: [move.from[0], move.from[1]], to: [move.to[0], move.to[1]] };
  });
}

function buildBattleView(state: AppState): BattlePageView | null {
  const battle = state.battle;
  if (!battle) return null;
  const boss = bossOf(battle);
  const bossIndex = BOSSES.findIndex(function (item) {
    return item.id === boss.id;
  });
  const hero = activeHeroOf(state);
  const busy = battle.thinking || battle.gameOver || battle.turn !== 'w';
  const skillTargeting = (battle.activeSkill ?? '').indexOf('hero:skill:') === 0;
  const ultimateTargeting = (battle.activeSkill ?? '').indexOf('hero:ultimate:') === 0;
  const whitePieces = battle.board.flat().filter(function (piece) {
    return piece !== null && piece.color === 'w';
  }).length;
  const whiteInCheck = deps.chess.isInCheck(battle.board, 'w');
  const blackInCheck = deps.chess.isInCheck(battle.board, 'b');
  return {
    chrome: {
      floorLabel: pad2(bossIndex + 1) + ' / Menara',
      turnLabel: pad2(battle.turnNo),
      bossName: boss.name,
      bossRule: boss.rule,
      stageLabel: boss.subtitle,
      turnFlag: battle.gameOver
        ? battle.winner === 'w'
          ? 'Putih menang'
          : battle.winner === 'b'
            ? 'Hitam menang'
            : 'Remis'
        : battle.thinking
          ? 'Hitam berpikir'
          : battle.turn === 'w'
            ? 'Giliran putih'
            : 'Giliran hitam',
      turnFlagClass: battle.gameOver
        ? 'game-over'
        : battle.thinking
          ? 'thinking'
          : battle.turn === 'w'
            ? 'player-turn'
            : '',
      boardStatus: battle.status,
      armyState: battle.gameOver ? (battle.winner === 'w' ? 'MENANG' : 'SELESAI') : 'SIAP',
      pieceCount: pad2(whitePieces),
      captureCount: pad2(battle.captures.w),
      enemyKingState: blackInCheck ? 'SKAK' : 'AMAN',
      kingState: whiteInCheck ? 'Raja sedang diskak.' : 'Raja belum terancam.',
      runNote: 'Buka jalur, jaga raja, lalu pakai skill untuk merebut tempo.',
      enemyEnergyNumber: pad2(battle.enemyEnergy) + ' / 05',
      enemyEnergyPips: battle.enemyEnergy,
      enemyEnergyNote: battle.enemyPreparedSkill
        ? 'Butuh 2 EN • berikutnya: ' + (battle.enemyPreparedSkill === 'ward' ? 'Perisai' : 'Gangguan')
        : 'Rencana lawan terganggu • butuh 2 EN.',
      effectChips: effectChips(battle),
      footerState: battle.gameOver
        ? battle.winner === 'w'
          ? 'Putih menang / mulai ulang untuk bermain lagi'
          : battle.winner === 'b'
            ? 'Hitam menang / mulai ulang untuk bermain lagi'
            : 'Remis / mulai ulang untuk bermain lagi'
        : 'Papan standar / lawan sederhana',
      undoDisabled: !canUndo(battle),
      soundOn: state.soundEnabled,
      canInteract: !busy,
    },
    board: {
      board: battle.board,
      selected: battle.selected,
      legalMoves: legalMovesFor(battle),
      lastMove: battle.lastMove,
      captureFx: state.captureFx,
      focusSquare: state.focusSquare,
      whiteInCheck,
      blackInCheck,
      enemyWardPieceId: battle.enemyWardPieceId,
      playerWardPieceId: battle.playerWardPieceId,
      markedEnemyId: battle.markedEnemyId,
      staggerId: battle.staggerId,
      snareId: battle.snareId,
      snareTurns: battle.snareTurns,
      blockadeSquare: battle.blockadeSquare,
      blockadeTurns: battle.blockadeTurns,
      heroBlockadeSquares: battle.heroBlockadeSquares,
      heroBlockadeTurns: battle.heroBlockadeTurns,
      heroBlockadeName: battle.heroBlockadeName,
      bossSealedSquare: battle.bossSealedSquare,
      targeting: battle.activeSkill !== null,
      disabled: busy,
    },
    hero: {
      portrait: hero.portrait,
      heroName: hero.name,
      role: hero.role,
      kingState: whiteInCheck ? 'Raja sedang diskak.' : 'Menunggu langkah pembuka.',
      energy: battle.energy,
      heroMana: battle.heroMana,
      skillName: hero.skillName,
      skillDesc: hero.skillDescription,
      ultimateName: hero.ultimateName,
      ultimateDesc: hero.ultimateDescription,
      skillTargeting,
      ultimateTargeting,
      skillDisabled:
        busy ||
        (battle.energy < HERO_SKILL_COST && !skillTargeting) ||
        (battle.activeSkill !== null && !skillTargeting),
      ultimateDisabled:
        busy ||
        (battle.energy < HERO_ULTIMATE_COST && !ultimateTargeting) ||
        (battle.activeSkill !== null && !ultimateTargeting),
      skillHint: battle.energy < HERO_SKILL_COST ? 'Butuh ' + HERO_SKILL_COST + ' EN.' : 'Siap dipakai.',
      ultimateHint:
        battle.energy < HERO_ULTIMATE_COST ? 'Butuh ' + HERO_ULTIMATE_COST + ' EN.' : 'Siap dipakai.',
      freeSkillState: battle.freeSkillUsedThisTurn ? 'TERPAKAI' : 'SIAP',
    },
    slots: cardSlots(battle, hero),
    reroll: rerollView(battle),
    telegraph: telegraph(battle),
    ledger: ledger(battle),
    promotion: {
      open: battle.pendingPromotion !== null,
      message: battle.pendingPromotion
        ? 'Pion putih mencapai ' +
          coord(battle.pendingPromotion.to[0], battle.pendingPromotion.to[1]) +
          '. Pilih bidak promosi.'
        : 'Pilih bidak untuk promosi pion.',
    },
  };
}

function buildResultView(state: AppState): ResultView | null {
  const battle = state.battle;
  if (!battle || !battle.gameOver) return null;
  const boss = bossOf(battle);
  const progress =
    state.campaign.defeatedBosses.length + ' dari ' + BOSSES.length + ' lantai ditaklukkan';
  const heading =
    battle.winner === 'w'
      ? 'Skakmat. Raja hitam tumbang.'
      : battle.winner === 'b'
        ? 'Skakmat. Raja putih tumbang.'
        : 'Remis. Tidak ada langkah legal.';
  const summary =
    battle.winner === 'w'
      ? 'Kemenangan atas ' + boss.name + ' (' + boss.subtitle + ').'
      : battle.winner === 'b'
        ? 'Kekalahan dari ' + boss.name + '. Pelajari polannya lalu coba lagi.'
        : 'Duel melawan ' + boss.name + ' berakhir tanpa pemenang.';
  return {
    title: 'Hasil duel',
    heading,
    summary,
    rewardText: state.rewardText,
    progressText: progress,
    canReplay: true,
    undoDisabled: !canUndo(battle),
  };
}

function statusFor(state: AppState): string {
  if (state.battle && (state.screen === 'battle' || state.screen === 'result')) return state.battle.status;
  if (state.screen === 'dungeon') {
    return (
      'Peta dungeon. ' + state.campaign.defeatedBosses.length + ' dari ' + BOSSES.length + ' lantai ditaklukkan.'
    );
  }
  if (state.screen === 'heroes') {
    if (state.heroesTab === 'deck') {
      const deck = deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG);
      return 'Deck: ' + deck.regularCount + ' dari ' + DECK_REGULAR_LIMIT + ' kartu dan ' + deck.jokerCount + ' dari ' + DECK_JOKER_LIMIT + ' Joker.';
    }
    return 'Daftar hero. Hero aktif: ' + activeHeroOf(state).name + '.';
  }
  return 'Menu utama. ' + state.campaign.defeatedBosses.length + ' dari ' + BOSSES.length + ' lantai ditaklukkan.';
}

function buildShell(state: AppState): AppShellView {
  return {
    screen: state.screen,
    coins: state.campaign.coins,
    statusText: statusFor(state),
    menu: state.screen === 'menu' ? buildMenuView(state) : null,
    dungeon: state.screen === 'dungeon' ? buildDungeonView(state) : null,
    heroes: state.screen === 'heroes' ? buildHeroesView(state) : null,
    battle: state.screen === 'battle' ? buildBattleView(state) : null,
    result: state.screen === 'result' ? buildResultView(state) : null,
  };
}

// ---------- Bootstrap + orkestrasi alur ----------

function main(): void {
  const root = document.getElementById('app');
  if (!root) return;
  const campaign = store.load(HERO_IDS, BOSS_IDS, DECK_CATALOG);
  const state: AppState = {
    screen: 'menu',
    campaign,
    heroDetailsId: campaign.selectedHero,
    heroesTab: 'roster',
    deckFilter: 'all',
    deckNotice: null,
    selectedBossId: nextBossProgress(BOSS_IDS, campaign),
    battle: null,
    focusSquare: [7, 0],
    soundEnabled: audio.isEnabled(),
    rewardText: null,
    blackTimer: null,
    captureFx: null,
    captureFxTimer: null,
  };

  function render(): void {
    renderApp(root as HTMLElement, buildShell(state));
  }

  function clearBlackTimer(): void {
    if (state.blackTimer !== null) {
      window.clearTimeout(state.blackTimer);
      state.blackTimer = null;
    }
  }

  function clearCaptureFx(): void {
    if (state.captureFxTimer !== null) {
      window.clearTimeout(state.captureFxTimer);
      state.captureFxTimer = null;
    }
    state.captureFx = null;
  }

  /**
   * Ambil efek tangkapan dari langkah terakhir di riwayat supaya papan bisa
   * beranimasi sebentar. murni visual: tidak memengaruhi state duel.
   */
  function armCaptureFx(battle: BattleState): void {
    clearCaptureFx();
    const last = battle.history[battle.history.length - 1];
    if (!last || !last.capture || !battle.lastMove) return;
    const movedPiece = findPieceByCoord(battle, battle.lastMove.to);
    if (!movedPiece || !last.captured) return;
    // En passant menaruh korban di petak lateral (satu baris dengan asal);
    // tangkapan biasa menaruh korban di petak tujuan.
    const victimAt: [number, number] = last.enPassant === true
      ? [battle.lastMove.from[0], battle.lastMove.to[1]]
      : [battle.lastMove.to[0], battle.lastMove.to[1]];
    state.captureFx = {
      from: [battle.lastMove.from[0], battle.lastMove.from[1]],
      to: [battle.lastMove.to[0], battle.lastMove.to[1]],
      victimAt,
      attackerId: movedPiece.id,
      color: movedPiece.color,
      piece: movedPiece.type,
      victimColor: movedPiece.color === 'w' ? 'b' : 'w',
      victimPiece: last.captured,
    };
    state.captureFxTimer = window.setTimeout(function () {
      state.captureFxTimer = null;
      state.captureFx = null;
    }, 460);
  }

  function findPieceByCoord(battle: BattleState, square: [number, number]) {
    return battle.board[square[0]][square[1]];
  }

  function scheduleBlackReply(): void {
    const current = state.battle;
    if (!current || current.gameOver || !current.thinking || state.blackTimer !== null) return;
    state.blackTimer = window.setTimeout(function () {
      state.blackTimer = null;
      const battle = state.battle;
      if (!battle || !battle.thinking || battle.gameOver) return;
      const alreadyDefeated = state.campaign.defeatedBosses.indexOf(battle.bossId) !== -1;
      state.battle = advanceBlackReplyFlow(battle, deps, audio, alreadyDefeated).battle;
      settle();
    }, 520);
  }

  /** Efek setelah setiap perubahan state duel: hadiah, layar hasil, jadwal balasan hitam. */
  function settle(): void {
    const battle = state.battle;
    if (!battle) {
      render();
      return;
    }
    // Undo dari layar hasil mengembalikan duel ke papan.
    if (!battle.gameOver && state.screen === 'result') state.screen = 'battle';
    if (battle.gameOver) {
      clearBlackTimer();
      if (battle.winner === 'w' && battle.dungeonRewarded && state.rewardText === null) {
        const flow = claimBattleRewardFlow(state.campaign, battle, bossOf(battle), store, audio);
        state.campaign = flow.campaign;
        state.rewardText = flow.firstClear
          ? 'Hadiah ' + bossOf(battle).reward + ' koin masuk ke dompet.'
          : 'Boss ini pernah ditaklukkan sebelumnya. Tidak ada koin baru.';
        if (flow.firstClear) state.selectedBossId = nextBossProgress(BOSS_IDS, state.campaign);
      }
      state.screen = 'result';
      clearCaptureFx();
      render();
      return;
    }
    armCaptureFx(battle);
    render();
    scheduleBlackReply();
  }

  function applyResult(result: CommandResult): void {
    state.battle = result.state;
    settle();
  }

  function focusSquareButton(row: number, col: number): void {
    const el = (root as HTMLElement).querySelector(
      'button.square[data-row="' + row + '"][data-col="' + col + '"]',
    );
    if (el instanceof HTMLElement) el.focus();
  }

  function startDuel(bossId: string): void {
    if (!deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG).complete) {
      state.screen = 'heroes';
      state.heroesTab = 'deck';
      state.deckNotice = 'Loadout harus berisi ' + DECK_REGULAR_LIMIT + ' kartu non-Joker dan ' + DECK_JOKER_LIMIT + ' Joker sebelum duel.';
      render();
      window.scrollTo(0, 0);
      return;
    }
    clearBlackTimer();
    state.rewardText = null;
    const result = startBattle(deps, BOSS_IDS, state.campaign, state.campaign.selectedHero, bossId);
    if (!result.ok || !result.battle) {
      render();
      return;
    }
    state.selectedBossId = bossId;
    state.battle = result.battle;
    state.focusSquare = [7, 0];
    state.screen = 'battle';
    clearCaptureFx();
    audio.play('reveal');
    render();
    window.scrollTo(0, 0);
  }

  function handleHubCommand(command: string, target: HTMLElement): boolean {
    switch (command) {
      case 'nav': {
        const next = target.dataset['screen'];
        if (next === 'menu' || next === 'dungeon' || next === 'heroes') {
          clearBlackTimer();
          audio.play('toggle');
          state.screen = next;
          if (next === 'heroes') {
            state.heroesTab = 'roster';
            state.deckNotice = null;
          }
          render();
          return true;
        }
        return true;
      }
      case 'select-hero': {
        const id = target.dataset['heroId'];
        if (id) {
          audio.play('select');
          state.heroDetailsId = id;
          render();
        }
        return true;
      }
      case 'hero-tab': {
        const tab = target.dataset['tab'];
        if (tab === 'roster' || tab === 'deck') {
          state.heroesTab = tab;
          state.deckNotice = null;
          audio.play('toggle');
          render();
        }
        return true;
      }
      case 'deck-filter': {
        const filter = target.dataset['filter'];
        if (
          filter === 'all' ||
          filter === 'offense' ||
          filter === 'defense' ||
          filter === 'spell' ||
          filter === 'consumable' ||
          filter === 'joker'
        ) {
          state.deckFilter = filter;
          render();
        }
        return true;
      }
      case 'toggle-deck-card': {
        const id = target.dataset['cardId'];
        if (!id) return true;
        const previous = state.campaign.deckCardIds;
        const next = toggleDeckCard(previous, id, DECK_CATALOG);
        const unchanged = previous.length === next.length && previous.every(function (cardId, index) {
          return cardId === next[index];
        });
        if (unchanged) {
          const card = cardById[id];
          state.deckNotice = card?.kind === 'joker'
            ? 'Slot Joker sudah terisi. Lepas Joker terpilih untuk menggantinya.'
            : 'Sepuluh slot kartu pilihan sudah terisi. Lepas satu kartu untuk menggantinya.';
          render();
          return true;
        }
        state.campaign = { ...state.campaign, deckCardIds: next };
        const complete = deckSelectionStatus(next, DECK_CATALOG).complete;
        const saved = store.save(state.campaign);
        state.deckNotice = complete
          ? saved
            ? 'Deck lengkap dan tersimpan. Siap dibawa ke duel.'
            : 'Deck lengkap untuk sesi ini; penyimpanan browser tidak tersedia.'
          : 'Lengkapi ' + DECK_REGULAR_LIMIT + ' kartu non-Joker dan ' + DECK_JOKER_LIMIT + ' Joker untuk bertarung.';
        audio.play('select');
        render();
        return true;
      }
      case 'open-deck': {
        state.screen = 'heroes';
        state.heroesTab = 'deck';
        state.deckNotice = 'Lengkapi ' + DECK_REGULAR_LIMIT + ' kartu non-Joker dan ' + DECK_JOKER_LIMIT + ' Joker sebelum duel.';
        render();
        return true;
      }
      case 'choose-hero': {
        state.campaign = chooseHeroProgress(state.campaign, state.heroDetailsId, HERO_IDS);
        audio.play('select');
        store.save(state.campaign);
        render();
        return true;
      }
      case 'select-boss': {
        const id = target.dataset['bossId'];
        if (id && isBossUnlocked(BOSS_IDS, state.campaign, id)) {
          audio.play('select');
          state.selectedBossId = id;
          render();
        }
        return true;
      }
      case 'start-boss': {
        startDuel(state.selectedBossId);
        return true;
      }
      case 'replay': {
        if (state.battle) startDuel(state.battle.bossId);
        return true;
      }
      case 'sound': {
        audio.setEnabled(!state.soundEnabled);
        state.soundEnabled = audio.isEnabled();
        render();
        return true;
      }
      default:
        return false;
    }
  }

  let lastCardHoverAt = 0;
  root.addEventListener('pointerover', function (event) {
    if (event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>('.skill-card');
    if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
    const now = Date.now();
    if (now - lastCardHoverAt < 55) return;
    lastCardHoverAt = now;
    audio.play('cardHover');
  });
  root.addEventListener('pointermove', function (event) {
    if (
      event.pointerType === 'touch' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !(event.target instanceof Element)
    ) return;
    const card = event.target.closest<HTMLElement>('.skill-card.is-ready');
    const button = card?.querySelector<HTMLButtonElement>('.card-play');
    if (!card || !button || button.disabled) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', (y * -4).toFixed(2) + 'deg');
    card.style.setProperty('--tilt-y', (x * 5).toFixed(2) + 'deg');
  });
  root.addEventListener('pointerout', function (event) {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>('.skill-card');
    const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.skill-card') : null;
    if (card && card !== next) {
      card.style.removeProperty('--tilt-x');
      card.style.removeProperty('--tilt-y');
    }
  });

  root.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target.closest('[data-command]') : null;
    if (!(target instanceof HTMLElement)) return;
    const command = target.dataset['command'];
    if (!command) return;
    if (handleHubCommand(command, target)) return;

    const battle = state.battle;
    if (!battle) {
      render();
      return;
    }
    const alreadyDefeated = state.campaign.defeatedBosses.indexOf(battle.bossId) !== -1;

    switch (command) {
      case 'square': {
        const row = Number(target.dataset['row']);
        const col = Number(target.dataset['col']);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 7 || col < 0 || col > 7) {
          render();
          return;
        }
        state.focusSquare = [row, col];
        if (!battle.pendingPromotion) {
          if (battle.activeSkill && (battle.activeSkill ?? '').indexOf('hero:') === 0) {
            applyResult(resolveHeroTargetFlow(battle, deps, row, col, audio, alreadyDefeated));
          } else if (battle.activeSkill) {
            applyResult(resolveCardTargetFlow(battle, deps, row, col, audio, alreadyDefeated));
          } else {
            applyResult(tapSquareFlow(battle, deps, row, col, audio, alreadyDefeated));
          }
        } else {
          render();
        }
        if (state.screen === 'battle') focusSquareButton(row, col);
        return;
      }
      case 'card': {
        const slot = Number(target.dataset['slot']);
        if (Number.isInteger(slot)) applyResult(playCardFlow(battle, deps, slot, audio));
        return;
      }
      case 'hero-skill': {
        applyResult(useHeroSkillFlow(battle, deps, audio));
        return;
      }
      case 'hero-ultimate': {
        applyResult(useHeroUltimateFlow(battle, deps, audio));
        return;
      }
      case 'reroll': {
        applyResult(rerollHandFlow(battle, deps, audio));
        return;
      }
      case 'cancel-target': {
        applyResult(cancelTargetFlow(battle, deps, audio));
        return;
      }
      case 'promotion': {
        const choice = target.dataset['promotion'];
        if (choice === 'q' || choice === 'r' || choice === 'b' || choice === 'n') {
          applyResult(choosePromotionFlow(battle, deps, choice, audio, alreadyDefeated));
        }
        return;
      }
      case 'undo': {
        clearBlackTimer();
        audio.play('undo');
        applyResult(undoTurnFlow(battle));
        return;
      }
      case 'restart': {
        clearBlackTimer();
        audio.play('restart');
        state.rewardText = null;
        const restarted = restartBattleFlow(battle, deps);
        if (restarted.ok && restarted.battle) state.battle = restarted.battle;
        state.screen = 'battle';
        render();
        return;
      }
      default:
        render();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (state.screen !== 'battle' || !state.battle) return;
      const battle = state.battle;
      if (battle.pendingPromotion) {
        event.preventDefault();
        return;
      }
      if (battle.activeSkill) {
        event.preventDefault();
        state.battle = cancelTargetFlow(battle, deps, audio).state;
        render();
        return;
      }
      if (battle.selected) {
        event.preventDefault();
        state.battle = { ...battle, selected: null, status: 'Pilihan dibatalkan. Pilih bidak putih.' };
        render();
      }
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = arrows[event.key];
    if (!delta) return;
    if (!(event.target instanceof Element)) return;
    const square = event.target.closest<HTMLElement>('.square');
    if (!square) return;
    event.preventDefault();
    // Geser dari petak yang benar-benar difokuskan, bukan dari state roving,
    // supaya keyboard tetap benar setelah render atau klik di petak lain.
    const fromRow = Number(square.dataset['row']);
    const fromCol = Number(square.dataset['col']);
    const anchor =
      Number.isInteger(fromRow) && Number.isInteger(fromCol) ? ([fromRow, fromCol] as [number, number]) : state.focusSquare;
    const row = Math.max(0, Math.min(7, anchor[0] + delta[0]));
    const col = Math.max(0, Math.min(7, anchor[1] + delta[1]));
    state.focusSquare = [row, col];
    render();
    focusSquareButton(row, col);
  });

  render();
}

main();

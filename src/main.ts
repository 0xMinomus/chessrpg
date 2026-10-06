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
import type { DungeonPageView } from './ui/dungeon/dungeon.ts';
import type { DeckFilter, HeroMenuTab, HeroesPageView } from './ui/screens/heroes.ts';
import type { BattlePageView, LedgerEntryView } from './ui/screens/battle.ts';
import type { ResultView } from './ui/screens/result.ts';
import type { ChapterMapItem, FloorListItem } from './ui/dungeon/dungeon.ts';
import type { OnlinePageView } from './ui/screens/online.ts';
import type { BoardGrid } from './ui/board/board.ts';

import { OnlineSessionController } from './application/index.ts';
import type { OnlinePlayerProfile, OnlineSessionSnapshot } from './application/index.ts';
import type { PvpAction } from './domain/online/protocol.ts';
import { isInCheck as isPvpInCheck } from './domain/chess/moves.ts';
import {
  canPlayPvpCard,
  currentPvpCardCost,
  pvpLegalMovesFrom,
  pvpRerollCost,
  pvpRerollLimit,
} from './domain/pvp/rules.ts';
import { heroActionCost } from './domain/pvp/hero.ts';
import { heroOf, otherColor as otherPvpColor, sideOf, type PvpDeps, type PvpState } from './domain/pvp/state.ts';
import { playCardCastFx, playHeroCastFx } from './ui/combat-fx.ts';

import { CARDS, cardById } from './content/cards.ts';
import { EN_CAP, HEROES, heroById as contentHeroById } from './content/heroes.ts';
import { CHAPTERS, DUNGEON_FLOORS, DUNGEON_FLOOR_BY_ID, FLOOR_IDS, LEGACY_BOSS_IDS } from './content/dungeon.ts';

import type { BattleDeps, BattleState, CommandResult } from './domain/battle/state.ts';
import { canUndo } from './domain/battle/commands.ts';
import { battleLegalMovesFrom } from './domain/battle/effects.ts';
import { canPlayCard, currentCardCost, rerollCost, rerollLimit } from './domain/battle/resources.ts';
import { describeEnemyPlan } from './domain/battle/ai.ts';
import {
  chooseHero as chooseHeroProgress,
  isFloorUnlocked,
  nextFloorId,
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
const AREA_LABELS: Record<string, string> = {
  west: 'Barat',
  north: 'Utara',
  east: 'Timur',
  central: 'Tengah',
  'inner-east': 'Timur dalam',
  south: 'Selatan',
};
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
  opponents: Object.fromEntries(
    DUNGEON_FLOORS.map(function (floor) {
      return [
        floor.id,
        { id: floor.id, ruleKey: floor.ruleKey, reward: floor.reward, isBoss: floor.isBoss },
      ];
    }),
  ),
};

const pvpDeps: PvpDeps = {
  cards: deps.cards,
  heroes: Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      {
        ...deps.heroes[hero.id],
        skillName: hero.skillName,
        ultimateName: hero.ultimateName,
      },
    ]),
  ),
};

const store = createCampaignStore(createLocalStorageBacking(), LEGACY_BOSS_IDS);
const audio = createBrowserAudio(createLocalStorageBacking());

// ---------- State aplikasi ----------

interface AppState {
  screen: ScreenName;
  campaign: Campaign;
  heroDetailsId: string;
  heroesTab: HeroMenuTab;
  deckFilter: DeckFilter;
  deckNotice: string | null;
  selectedChapterId: string;
  selectedFloorId: string;
  battle: BattleState | null;
  onlineSelectedSquare: [number, number] | null;
  onlinePremoveDraft: boolean;
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

function floorView(state: AppState, floorId: string): FloorListItem {
  const floor = DUNGEON_FLOOR_BY_ID[floorId] ?? DUNGEON_FLOORS[0];
  const floorIndex = FLOOR_IDS.indexOf(floor.id);
  const previous = floorIndex > 0 ? DUNGEON_FLOOR_BY_ID[FLOOR_IDS[floorIndex - 1]] : null;
  const unlocked = isFloorUnlocked(FLOOR_IDS, state.campaign, floor.id);
  const lockReason = unlocked || !previous
    ? ''
    : previous.isBoss
      ? 'Kalahkan boss Chapter ' + pad2(previous.chapterNumber) + ' untuk membuka chapter ini.'
      : 'Selesaikan Lantai ' + pad2(previous.floorNumber) + ' sebelumnya.';
  return {
    id: floor.id,
    chapterNumber: floor.chapterNumber,
    floorNumber: floor.floorNumber,
    name: floor.name,
    glyph: floor.glyph,
    subtitle: floor.subtitle,
    reward: floor.reward,
    unlocked,
    cleared: state.campaign.clearedFloorIds.indexOf(floor.id) !== -1,
    selected: state.selectedFloorId === floor.id,
    description: floor.description,
    rule: floor.rule,
    isBoss: floor.isBoss,
    lockReason,
  };
}

function chapterView(state: AppState, chapterId: string): ChapterMapItem {
  const chapter = CHAPTERS.find((item) => item.id === chapterId) ?? CHAPTERS[0];
  const chapterFloors = DUNGEON_FLOORS.filter((floor) => floor.chapterId === chapter.id);
  const clearedFloorCount = chapterFloors.filter(
    (floor) => state.campaign.clearedFloorIds.indexOf(floor.id) !== -1,
  ).length;
  return {
    id: chapter.id,
    number: chapter.number,
    name: chapter.name,
    areaLabel: AREA_LABELS[chapter.area],
    x: chapter.mapPosition.x,
    y: chapter.mapPosition.y,
    unlocked: isFloorUnlocked(FLOOR_IDS, state.campaign, chapterFloors[0].id),
    cleared: clearedFloorCount === chapterFloors.length,
    clearedFloorCount,
    selected: state.selectedChapterId === chapter.id,
  };
}

function buildMenuView(state: AppState): MenuView {
  const hero = activeHeroOf(state);
  const chapters = CHAPTERS.map((chapter) => chapterView(state, chapter.id));
  const selectedChapter = chapters.find((chapter) => chapter.selected) ?? chapters[0];
  const chapterFloors = DUNGEON_FLOORS.filter(
    (floor) => floor.chapterId === selectedChapter.id,
  );
  const floorProgress = chapterFloors.map((floor) => floorView(state, floor.id));
  const selectedFloor =
    floorProgress.find((floor) => floor.selected) ??
    floorProgress.find((floor) => floor.unlocked) ??
    floorProgress[0];
  const nextFloor = floorView(state, nextFloorId(FLOOR_IDS, state.campaign));
  const lastClearedId = state.campaign.clearedFloorIds[state.campaign.clearedFloorIds.length - 1];
  const lastClearedFloor = lastClearedId ? floorView(state, lastClearedId) : null;
  return {
    coins: state.campaign.coins,
    clearedCount: state.campaign.clearedFloorIds.length,
    totalFloors: DUNGEON_FLOORS.length,
    allCleared: state.campaign.clearedFloorIds.length === DUNGEON_FLOORS.length,
    chapters,
    selectedChapter,
    nextFloor,
    selectedFloor,
    lastClearedFloor,
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
  const chapters = CHAPTERS.map((chapter) => chapterView(state, chapter.id));
  const selectedChapter = chapters.find((chapter) => chapter.selected) ?? chapters[0];
  const floors = DUNGEON_FLOORS
    .filter((floor) => floor.chapterId === selectedChapter.id)
    .map((floor) => floorView(state, floor.id));
  const detail =
    floors.find((floor) => floor.selected) ??
    floors.find((floor) => floor.unlocked) ??
    floors[0];
  return {
    chapters,
    selectedChapter,
    floors,
    detail,
    deckReady: deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG).complete,
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
  if (battle.bossSnareId) add('Jerat boss • bidak putih ini tidak dapat bergerak', true);
  if (battle.bossCardSilence) add('Segel boss • kartu skill dibungkam sampai langkah berikutnya', true);
  if (battle.bossHeroSilence) add('Senyap boss • skill hero dibungkam sampai langkah berikutnya', true);
  if (battle.bossBlightArmed) add('Hawar boss • langkah berikutnya tidak menghasilkan mana', true);
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
  const floor = DUNGEON_FLOOR_BY_ID[battle.floorId] ?? DUNGEON_FLOORS[0];
  const chapter = CHAPTERS.find((item) => item.id === floor.chapterId) ?? CHAPTERS[0];
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
      floorLabel: 'Chapter ' + pad2(floor.chapterNumber) + ' · ' + pad2(floor.floorNumber) + '/05',
      turnLabel: pad2(battle.turnNo),
      opponentName: floor.name,
      opponentRule: floor.rule,
      opponentType: floor.isBoss ? 'BOSS / CPU' : 'LAWAN / CPU',
      stageLabel: chapter.name + ' · ' + floor.subtitle,
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
      runNote: floor.isBoss
        ? 'Skill boss: ' + floor.rule
        : 'Lantai standar. Buka jalur, jaga raja, dan gunakan skill untuk merebut tempo.',
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
        : floor.isBoss
          ? 'Boss chapter / pertarungan catur'
          : 'Lantai standar / pertarungan catur',
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
      bossSnareId: battle.bossSnareId,
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
        battle.bossHeroSilence ||
        (battle.energy < HERO_SKILL_COST && !skillTargeting) ||
        (battle.activeSkill !== null && !skillTargeting),
      ultimateDisabled:
        busy ||
        battle.bossHeroSilence ||
        (battle.energy < HERO_ULTIMATE_COST && !ultimateTargeting) ||
        (battle.activeSkill !== null && !ultimateTargeting),
      skillHint: battle.bossHeroSilence
        ? 'Boss membungkam skill hero hingga langkah berikutnya.'
        : battle.energy < HERO_SKILL_COST
          ? 'Butuh ' + HERO_SKILL_COST + ' EN.'
          : 'Siap dipakai.',
      ultimateHint: battle.bossHeroSilence
        ? 'Boss membungkam ultimate hingga langkah berikutnya.'
        : battle.energy < HERO_ULTIMATE_COST
          ? 'Butuh ' + HERO_ULTIMATE_COST + ' EN.'
          : 'Siap dipakai.',
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
  const floor = DUNGEON_FLOOR_BY_ID[battle.floorId] ?? DUNGEON_FLOORS[0];
  const progress =
    state.campaign.clearedFloorIds.length + ' dari ' + DUNGEON_FLOORS.length + ' lantai ditaklukkan';
  const heading =
    battle.winner === 'w'
      ? 'Skakmat. Raja hitam tumbang.'
      : battle.winner === 'b'
        ? 'Skakmat. Raja putih tumbang.'
        : 'Remis. Tidak ada langkah legal.';
  const opponentLabel = (floor.isBoss ? 'boss ' : 'lawan ') + floor.name;
  const summary =
    battle.winner === 'w'
      ? 'Kemenangan atas ' + opponentLabel + ' · Chapter ' + pad2(floor.chapterNumber) + ', lantai ' + pad2(floor.floorNumber) + '.'
      : battle.winner === 'b'
        ? 'Kekalahan dari ' + opponentLabel + '. Pelajari polanya lalu coba lagi.'
        : 'Duel melawan ' + opponentLabel + ' berakhir tanpa pemenang.';
  const nextId = nextFloorId(FLOOR_IDS, state.campaign);
  const nextFloor = DUNGEON_FLOOR_BY_ID[nextId];
  const continueFloorId =
    battle.winner === 'w' && nextFloor && nextFloor.id !== battle.floorId && isFloorUnlocked(FLOOR_IDS, state.campaign, nextFloor.id)
      ? nextFloor.id
      : null;
  const continueLabel = continueFloorId && nextFloor
    ? 'Lanjut ke ' + (nextFloor.isBoss ? 'boss ' : 'lantai ') + nextFloor.name
    : null;
  return {
    title: 'Hasil duel',
    heading,
    summary,
    rewardText: state.rewardText,
    progressText: progress,
    canReplay: true,
    continueFloorId,
    continueLabel,
    undoDisabled: !canUndo(battle),
  };
}

function onlineCardSlots(battle: PvpState, color: 'w' | 'b'): CardSlotView[] {
  const side = sideOf(battle, color);
  const hero = heroOf(battle, pvpDeps, color);
  return side.hand.map(function (id, slot) {
    const card = pvpDeps.cards[id];
    const targeting = battle.activeSide === color && battle.activeSkill === id && battle.activeSlot === slot;
    const playable = card ? canPlayPvpCard(battle, color, card, hero) : { ok: false, reason: 'Kartu tidak dikenal.' };
    const cost = card ? currentPvpCardCost(card, hero, side.effects.reserveArmed) : 0;
    const freeLocked = card !== undefined && card.cost === 0 && side.freeSkillUsedThisTurn && !targeting;
    const unaffordable = card !== undefined && side.mana < cost;
    const locked =
      battle.gameOver ||
      battle.turn !== color ||
      battle.pendingPromotion !== null ||
      (battle.activeSide !== null && !targeting) ||
      (!targeting && !playable.ok);
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
      actionLabel = 'MANA ' + side.mana + '/6';
    } else if (card && card.cost === 0) {
      stateLabel = 'GRATIS · 1 GILIRAN';
    } else if (card && cost !== card.cost) {
      stateLabel = 'SURCHARGE ' + (cost - card.cost) + ' MANA';
    }
    return {
      card: cardMeta(id),
      cost,
      targeting,
      locked,
      stateLabel,
      actionLabel,
      unaffordable: unaffordable && !targeting,
    };
  });
}

function onlineRerollView(battle: PvpState, color: 'w' | 'b'): RerollView {
  const side = sideOf(battle, color);
  const limit = pvpRerollLimit(battle, color);
  const available = side.rollsThisTurn < limit;
  const cost = pvpRerollCost(battle, color);
  const busy = battle.gameOver || battle.turn !== color || battle.activeSide !== null || battle.pendingPromotion !== null;
  return {
    available,
    label: !available ? 'PUTAR ULANG HABIS' : cost > 0 ? 'PUTAR KARTU • 1 EN' : 'PUTAR KARTU • GRATIS',
    caption: available
      ? cost > 0
        ? 'Biaya 1 EN • putaran ' + (side.rollsThisTurn + 1) + ' dari ' + limit
        : 'Gratis • putaran 1 dari ' + limit
      : 'Jatah giliran ini habis',
    disabled: busy || !available || side.energy < cost,
    reason: available
      ? cost > 0
        ? 'Ganti ketiga kartu dengan biaya 1 EN.'
        : 'Ganti ketiga kartu gratis.'
      : 'Jatah putar ulang giliran ini sudah habis (' + limit + '/' + limit + ').',
  };
}

function buildOnlineView(state: AppState, session: OnlineSessionSnapshot): OnlinePageView {
  if (session.mode === 'battle' && session.battle && session.localColor && session.opponent) {
    const battle = session.battle;
    const color = session.localColor;
    const other = otherPvpColor(color);
    const local = sideOf(battle, color);
    const opponent = sideOf(battle, other);
    const localHero = heroOf(battle, pvpDeps, color);
    const opponentHero = heroOf(battle, pvpDeps, other);
    const skillCost = heroActionCost(battle, color, false);
    const ultimateCost = heroActionCost(battle, color, true);
    const localTurn = battle.turn === color;
    const selected = state.onlineSelectedSquare;
    const selectedPiece = selected ? battle.board[selected[0]][selected[1]] : null;
    const legalMoves =
      selected && selectedPiece?.side === color && battle.activeSide === null && !battle.pendingPromotion
        ? pvpLegalMovesFrom(battle, selected[0], selected[1]).map((move) => ({
            from: [move.from[0], move.from[1]] as [number, number],
            to: [move.to[0], move.to[1]] as [number, number],
          }))
        : [];
    const board: BoardGrid = battle.board.map((row) =>
      row.map((piece) => (piece ? { type: piece.type, color: piece.side, id: String(piece.id) } : null)),
    );
    const skillTargeting = battle.activeSkill?.startsWith('hero:skill:') ?? false;
    const ultimateTargeting = battle.activeSkill?.startsWith('hero:ultimate:') ?? false;
    const remote = session.remoteSelection;
    const remoteSelection = remote?.from
      ? { from: remote.from, to: remote.to ?? remote.from }
      : session.remotePremove;
    const terminal = battle.gameOver || session.error !== null;
    return {
      mode: 'battle',
      board: {
        board,
        selected,
        legalMoves,
        lastMove: battle.lastMove,
        captureFx: null,
        focusSquare: selected ?? (color === 'w' ? [7, 0] : [0, 7]),
        whiteInCheck: isPvpInCheck(battle.board, 'w'),
        blackInCheck: isPvpInCheck(battle.board, 'b'),
        enemyWardPieceId: opponent.effects.wardPieceId === null ? null : String(opponent.effects.wardPieceId),
        playerWardPieceId: local.effects.wardPieceId === null ? null : String(local.effects.wardPieceId),
        markedEnemyId: local.effects.markedPieceId === null ? null : String(local.effects.markedPieceId),
        staggerId: local.effects.staggerPieceId === null ? null : String(local.effects.staggerPieceId),
        snareId: local.effects.snarePieceId === null ? null : String(local.effects.snarePieceId),
        snareTurns: local.effects.snareTurns,
        bossSnareId: null,
        blockadeSquare: local.effects.blockadeSquare,
        blockadeTurns: local.effects.blockadeTurns,
        heroBlockadeSquares: local.effects.heroBlockadeSquares,
        heroBlockadeTurns: local.effects.heroBlockadeTurns,
        heroBlockadeName: local.effects.heroBlockadeName,
        bossSealedSquare: null,
        targeting: battle.activeSide === color && battle.activeSkill !== null,
        disabled: battle.gameOver || session.error !== null,
        perspective: color,
        remoteSelection,
        premove: session.localPremove,
      },
      localHeroName: localHero.name,
      localColor: color,
      opponentHeroName: opponentHero.name,
      opponentColor: other,
      mana: local.mana,
      energy: local.energy,
      turn: battle.gameOver
        ? battle.winner === null
          ? 'Remis'
          : battle.winner === color
            ? 'Anda menang'
            : 'Lawan menang'
        : localTurn
          ? 'Giliran Anda'
          : 'Giliran lawan',
      status: session.status || battle.status,
      connectionText: session.error ?? session.connectionText,
      roomCode: session.roomCode,
      slots: onlineCardSlots(battle, color),
      reroll: onlineRerollView(battle, color),
      promotion: {
        open: battle.pendingPromotion !== null,
        message: battle.pendingPromotion
          ? 'Pion mencapai ' + coord(battle.pendingPromotion.move.to[0], battle.pendingPromotion.move.to[1]) + '. Pilih bidak promosi.'
          : 'Pilih bidak untuk promosi pion.',
      },
      localPremove: session.localPremove,
      remoteSelection,
      skillLabel: localHero.skillName + ' · ' + skillCost + ' EN',
      ultimateLabel: localHero.ultimateName + ' · ' + ultimateCost + ' EN',
      skillDisabled:
        !localTurn ||
        battle.gameOver ||
        battle.pendingPromotion !== null ||
        battle.activeSide !== null ||
        local.energy < skillCost,
      ultimateDisabled:
        !localTurn ||
        battle.gameOver ||
        battle.pendingPromotion !== null ||
        battle.activeSide !== null ||
        local.energy < ultimateCost,
      skillTargeting,
      ultimateTargeting,
      canExit: terminal,
    };
  }
  const deck = deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG);
  const setupPlayer = {
    heroName: activeHeroOf(state).name,
    deckStatus: deck.complete
      ? deck.regularCount + '/' + DECK_REGULAR_LIMIT + ' kartu · ' + deck.jokerCount + '/' + DECK_JOKER_LIMIT + ' Joker'
      : deck.regularCount + '/' + DECK_REGULAR_LIMIT + ' kartu · ' + deck.jokerCount + '/' + DECK_JOKER_LIMIT + ' Joker · belum lengkap',
  };
  const status = session.status || (session.mode === 'home' ? 'Pilih mode pertandingan.' : '');
  if (session.mode === 'matchmaking') {
    return {
      mode: 'matchmaking',
      status,
      connectionText: session.connectionText,
      color: session.colorPick,
      player: setupPlayer,
      error: session.error ?? undefined,
      busy: session.busy,
    };
  }
  if (session.mode === 'room') {
    return {
      mode: 'room',
      status,
      connectionText: session.connectionText,
      roomCode: session.roomCode,
      color: session.colorPick,
      player: setupPlayer,
      error: session.error ?? undefined,
      busy: session.busy,
    };
  }
  return { mode: 'home', status, error: session.error ?? undefined };
}

function statusFor(state: AppState, session: OnlineSessionSnapshot): string {
  if (state.screen === 'online') return session.battle ? session.status || session.battle.status : session.error ?? session.status;
  if (state.battle && (state.screen === 'battle' || state.screen === 'result')) return state.battle.status;
  if (state.screen === 'dungeon') {
    return (
      'Peta campaign. ' + state.campaign.clearedFloorIds.length + ' dari ' + DUNGEON_FLOORS.length + ' lantai ditaklukkan.'
    );
  }
  if (state.screen === 'heroes') {
    if (state.heroesTab === 'deck') {
      const deck = deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG);
      return 'Deck: ' + deck.regularCount + ' dari ' + DECK_REGULAR_LIMIT + ' kartu dan ' + deck.jokerCount + ' dari ' + DECK_JOKER_LIMIT + ' Joker.';
    }
    return 'Daftar hero. Hero aktif: ' + activeHeroOf(state).name + '.';
  }
  return 'Menu utama. ' + state.campaign.clearedFloorIds.length + ' dari ' + DUNGEON_FLOORS.length + ' lantai ditaklukkan.';
}

function buildShell(state: AppState, session: OnlineSessionSnapshot): AppShellView {
  return {
    screen: state.screen,
    coins: state.campaign.coins,
    statusText: statusFor(state, session),
    menu: state.screen === 'menu' ? buildMenuView(state) : null,
    dungeon: state.screen === 'dungeon' ? buildDungeonView(state) : null,
    heroes: state.screen === 'heroes' ? buildHeroesView(state) : null,
    battle: state.screen === 'battle' ? buildBattleView(state) : null,
    online: state.screen === 'online' ? buildOnlineView(state, session) : null,
    result: state.screen === 'result' ? buildResultView(state) : null,
  };
}

// ---------- Bootstrap + orkestrasi alur ----------

function main(): void {
  const root = document.getElementById('app');
  if (!root) return;
  const campaign = store.load(HERO_IDS, FLOOR_IDS, DECK_CATALOG);
  const nextFloor = DUNGEON_FLOOR_BY_ID[nextFloorId(FLOOR_IDS, campaign)] ?? DUNGEON_FLOORS[0];
  const state: AppState = {
    screen: 'menu',
    campaign,
    heroDetailsId: campaign.selectedHero,
    heroesTab: 'roster',
    deckFilter: 'all',
    deckNotice: null,
    selectedChapterId: nextFloor.chapterId,
    selectedFloorId: nextFloor.id,
    battle: null,
    onlineSelectedSquare: null,
    onlinePremoveDraft: false,
    focusSquare: [7, 0],
    soundEnabled: audio.isEnabled(),
    rewardText: null,
    blackTimer: null,
    captureFx: null,
    captureFxTimer: null,
  };
  const onlineSession = new OnlineSessionController(pvpDeps, function () {
    render();
  });


  function render(): void {
    const snapshot = onlineSession.snapshot;
    if (
      state.onlinePremoveDraft &&
      snapshot.battle &&
      snapshot.localColor &&
      snapshot.battle.turn === snapshot.localColor &&
      !snapshot.localPremove
    ) {
      state.onlineSelectedSquare = null;
      state.onlinePremoveDraft = false;
    }
    renderApp(root as HTMLElement, buildShell(state, snapshot));
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
      const alreadyCleared = state.campaign.clearedFloorIds.indexOf(battle.floorId) !== -1;
      state.battle = advanceBlackReplyFlow(battle, deps, audio, alreadyCleared).battle;
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
        const floor = DUNGEON_FLOOR_BY_ID[battle.floorId] ?? DUNGEON_FLOORS[0];
        const flow = claimBattleRewardFlow(state.campaign, battle, floor, FLOOR_IDS, store, audio);
        state.campaign = flow.campaign;
        state.rewardText = flow.firstClear
          ? 'Hadiah ' + floor.reward + ' koin masuk ke dompet.'
          : 'Lantai ini pernah diselesaikan. Tidak ada koin baru.';
        if (flow.firstClear) {
          const next = DUNGEON_FLOOR_BY_ID[nextFloorId(FLOOR_IDS, state.campaign)] ?? DUNGEON_FLOORS[0];
          state.selectedChapterId = next.chapterId;
          state.selectedFloorId = next.id;
        }
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

  function startDuel(floorId: string): void {
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
    const result = startBattle(deps, FLOOR_IDS, state.campaign, state.campaign.selectedHero, floorId);
    if (!result.ok || !result.battle) {
      render();
      return;
    }
    const floor = DUNGEON_FLOOR_BY_ID[floorId];
    state.selectedChapterId = floor.chapterId;
    state.selectedFloorId = floorId;
    state.battle = result.battle;
    state.focusSquare = [7, 0];
    state.screen = 'battle';
    clearCaptureFx();
    audio.play('reveal');
    render();
    window.scrollTo(0, 0);
  }

  function onlineProfile(): OnlinePlayerProfile | null {
    const deck = deckSelectionStatus(state.campaign.deckCardIds, DECK_CATALOG);
    if (!deck.complete) {
      state.screen = 'heroes';
      state.heroesTab = 'deck';
      state.deckNotice =
        'Loadout harus berisi ' +
        DECK_REGULAR_LIMIT +
        ' kartu non-Joker dan ' +
        DECK_JOKER_LIMIT +
        ' Joker sebelum duel online.';
      render();
      window.scrollTo(0, 0);
      return null;
    }
    return {
      heroId: state.campaign.selectedHero,
      deckCardIds: state.campaign.deckCardIds.slice(),
    };
  }

  function clearOnlineSelection(): void {
    state.onlineSelectedSquare = null;
    state.onlinePremoveDraft = false;
    onlineSession.setSelection({ from: null, to: null });
  }

  function submitOnlineAction(action: PvpAction): void {
    state.onlineSelectedSquare = null;
    state.onlinePremoveDraft = false;
    onlineSession.setSelection({ from: null, to: null });
    onlineSession.submitAction(action);
    render();
  }

  function selectOnlineSquare(square: [number, number], premove: boolean): void {
    state.onlineSelectedSquare = square;
    state.onlinePremoveDraft = premove;
    onlineSession.setSelection({ from: square, to: null });
    render();
    focusSquareButton(square[0], square[1]);
  }

  function handleOnlineSquare(row: number, col: number): void {
    const session = onlineSession.snapshot;
    const battle = session.battle;
    const color = session.localColor;
    if (!battle || !color || session.error || battle.gameOver || battle.pendingPromotion) {
      render();
      return;
    }
    state.focusSquare = [row, col];
    if (battle.activeSide === color && battle.activeSkill) {
      submitOnlineAction({ kind: 'card-target', row, col });
      return;
    }
    const piece = battle.board[row][col];
    const selected = state.onlineSelectedSquare;
    if (battle.turn !== color) {
      if (!state.onlinePremoveDraft || !selected) {
        if (piece?.side === color) selectOnlineSquare([row, col], true);
        else render();
        return;
      }
      if (selected[0] === row && selected[1] === col) {
        clearOnlineSelection();
        render();
        return;
      }
      if (piece?.side === color) {
        selectOnlineSquare([row, col], true);
        return;
      }
      const legal = pvpLegalMovesFrom(battle, selected[0], selected[1]).some(
        (move) => move.to[0] === row && move.to[1] === col,
      );
      if (!legal) {
        render();
        return;
      }
      onlineSession.setSelection({ from: selected, to: [row, col] });
      const result = onlineSession.queuePremove(selected, [row, col]);
      if (!result.ok) {
        onlineSession.setSelection({ from: selected, to: null });
      }
      render();
      return;
    }
    if (selected && !state.onlinePremoveDraft) {
      if (selected[0] === row && selected[1] === col) {
        clearOnlineSelection();
        render();
        return;
      }
      const legal = pvpLegalMovesFrom(battle, selected[0], selected[1]).some(
        (move) => move.to[0] === row && move.to[1] === col,
      );
      if (legal) {
        submitOnlineAction({ kind: 'move', from: selected, to: [row, col] });
        return;
      }
    }
    if (piece?.side === color) {
      selectOnlineSquare([row, col], false);
      return;
    }
    clearOnlineSelection();
    render();
  }

  function handleOnlineCommand(command: string, target: HTMLElement): boolean {
    if (command === 'online-color-pick') {
      const pick = target.dataset['pick'];
      if (pick === 'w' || pick === 'b' || pick === 'random') onlineSession.setColorPick(pick);
      return true;
    }
    if (command === 'online-matchmaking' || command === 'online-create-room') {
      const profile = onlineProfile();
      if (!profile) return true;
      state.screen = 'online';
      state.onlineSelectedSquare = null;
      state.onlinePremoveDraft = false;
      if (command === 'online-matchmaking') onlineSession.openMatchmaking(profile);
      else void onlineSession.createRoom(profile);
      render();
      window.scrollTo(0, 0);
      return true;
    }
    if (command === 'online-ready') {
      const session = onlineSession.snapshot;
      if (session.mode === 'room') onlineSession.readyRoom();
      else if (session.mode === 'matchmaking') void onlineSession.findMatch();
      return true;
    }
    if (command === 'online-cancel' || command === 'online-exit') {
      onlineSession.cancel();
      state.onlineSelectedSquare = null;
      state.onlinePremoveDraft = false;
      state.screen = 'online';
      render();
      return true;
    }
    if (command === 'online-copy-code') {
      const roomCode = onlineSession.snapshot.roomCode;
      if (roomCode && navigator.clipboard) {
        void navigator.clipboard.writeText(roomCode).then(function () {
          const live = root?.querySelector<HTMLElement>('#live-message');
          if (live) live.textContent = 'Kode ruang disalin.';
        }).catch(function () {});
      }
      return true;
    }
    if (command === 'online-clear-premove') {
      onlineSession.clearPremove();
      state.onlineSelectedSquare = null;
      state.onlinePremoveDraft = false;
      render();
      return true;
    }
    if (state.screen !== 'online' || !onlineSession.snapshot.battle) return false;
    switch (command) {
      case 'square': {
        const row = Number(target.dataset['row']);
        const col = Number(target.dataset['col']);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 7 || col < 0 || col > 7) {
          render();
          return true;
        }
        handleOnlineSquare(row, col);
        return true;
      }
      case 'card': {
        const slot = Number(target.dataset['slot']);
        if (Number.isInteger(slot) && slot >= 0 && slot <= 2) submitOnlineAction({ kind: 'card', slot });
        return true;
      }
      case 'reroll':
        submitOnlineAction({ kind: 'reroll' });
        return true;
      case 'hero-skill':
        submitOnlineAction({ kind: 'hero-skill' });
        return true;
      case 'hero-ultimate':
        submitOnlineAction({ kind: 'hero-ultimate' });
        return true;
      case 'promotion': {
        const piece = target.dataset['promotion'];
        if (piece === 'q' || piece === 'r' || piece === 'b' || piece === 'n') {
          submitOnlineAction({ kind: 'promotion', piece });
        }
        return true;
      }
      case 'cancel-target':
        submitOnlineAction({ kind: 'cancel-target' });
        return true;
      case 'resign':
        submitOnlineAction({ kind: 'resign' });
        return true;
      default:
        return false;
    }
  }

  function handleHubCommand(command: string, target: HTMLElement): boolean {
    switch (command) {
      case 'nav': {
        const next = target.dataset['screen'];
        if (next === 'menu' || next === 'dungeon' || next === 'heroes' || next === 'online') {
          clearBlackTimer();
          if (state.screen === 'online' && next !== 'online') {
            onlineSession.cancel();
            state.onlineSelectedSquare = null;
            state.onlinePremoveDraft = false;
          }
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
      case 'select-chapter': {
        const id = target.dataset['chapterId'];
        const chapter = CHAPTERS.find((item) => item.id === id);
        if (chapter) {
          const floors = DUNGEON_FLOORS.filter((floor) => floor.chapterId === chapter.id);
          const next = floors.find((floor) => state.campaign.clearedFloorIds.indexOf(floor.id) === -1) ?? floors[floors.length - 1];
          state.selectedChapterId = chapter.id;
          state.selectedFloorId = next.id;
          audio.play('select');
          render();
        }
        return true;
      }
      case 'select-floor': {
        const id = target.dataset['floorId'];
        const floor = id ? DUNGEON_FLOOR_BY_ID[id] : undefined;
        if (floor) {
          state.selectedChapterId = floor.chapterId;
          state.selectedFloorId = floor.id;
          audio.play('select');
          render();
        }
        return true;
      }
      case 'start-floor':
        startDuel(target.dataset['floorId'] ?? state.selectedFloorId);
        return true;
      case 'continue-floor':
        if (target.dataset['floorId']) startDuel(target.dataset['floorId']);
        return true;
      case 'replay':
        if (state.battle) startDuel(state.battle.floorId);
        return true;
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

  root.addEventListener('submit', function (event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-online-join]')) return;
    event.preventDefault();
    const input = form.elements.namedItem('roomCode');
    const profile = onlineProfile();
    if (!(input instanceof HTMLInputElement) || !profile) return;
    state.screen = 'online';
    state.onlineSelectedSquare = null;
    state.onlinePremoveDraft = false;
    void onlineSession.joinRoom(input.value.trim(), profile);
    render();
  });
  root.addEventListener('change', function (event) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.dataset['command'] === 'online-color-pick'
    ) {
      handleOnlineCommand('online-color-pick', target);
    }
  });
  window.addEventListener('pagehide', function () {
    onlineSession.dispose();
  }, { once: true });

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
    if (command === 'online-join-room' || command === 'online-color-pick') return;
    if (state.screen === 'online' && handleOnlineCommand(command, target)) return;
    if (handleHubCommand(command, target)) return;

    const battle = state.battle;
    if (!battle) {
      render();
      return;
    }
    const alreadyCleared = state.campaign.clearedFloorIds.indexOf(battle.floorId) !== -1;

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
          const activeSkill = battle.activeSkill;
          if (activeSkill && activeSkill.indexOf('hero:') === 0) {
            const result = resolveHeroTargetFlow(battle, deps, row, col, audio, alreadyCleared);
            applyResult(result);
            if (result.ok) playHeroCastFx(root, activeSkill.slice(activeSkill.lastIndexOf(':') + 1));
          } else if (activeSkill) {
            const card = cardById[activeSkill];
            const result = resolveCardTargetFlow(battle, deps, row, col, audio, alreadyCleared);
            applyResult(result);
            if (result.ok && card) playCardCastFx(root, card.kind);
          } else {
            applyResult(tapSquareFlow(battle, deps, row, col, audio, alreadyCleared));
          }
        } else {
          render();
        }
        if (state.screen === 'battle') focusSquareButton(row, col);
        return;
      }
      case 'card': {
        const slot = Number(target.dataset['slot']);
        if (Number.isInteger(slot)) {
          const cardId = battle.hand[slot];
          const card = cardId ? cardById[cardId] : undefined;
          const wasTargeting = battle.activeSkill !== null && battle.activeSlot === slot;
          const result = playCardFlow(battle, deps, slot, audio);
          applyResult(result);
          if (result.ok && !wasTargeting && result.state.activeSkill === null && card) {
            playCardCastFx(root, card.kind);
          }
        }
        return;
      }
      case 'hero-skill': {
        const wasTargeting = (battle.activeSkill ?? '').indexOf('hero:skill:') === 0;
        const action = activeHeroOf(state).skillAction;
        const result = useHeroSkillFlow(battle, deps, audio);
        applyResult(result);
        if (result.ok && !wasTargeting && result.state.activeSkill === null) playHeroCastFx(root, action);
        return;
      }
      case 'hero-ultimate': {
        const wasTargeting = (battle.activeSkill ?? '').indexOf('hero:ultimate:') === 0;
        const action = activeHeroOf(state).ultimateAction;
        const result = useHeroUltimateFlow(battle, deps, audio);
        applyResult(result);
        if (result.ok && !wasTargeting && result.state.activeSkill === null) playHeroCastFx(root, action);
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
          applyResult(choosePromotionFlow(battle, deps, choice, audio, alreadyCleared));
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
      if (state.screen === 'online') {
        const session = onlineSession.snapshot;
        if (session.battle && session.localColor) {
          if (session.battle.pendingPromotion) {
            event.preventDefault();
            return;
          }
          if (session.battle.activeSide === session.localColor && session.battle.activeSkill) {
            event.preventDefault();
            submitOnlineAction({ kind: 'cancel-target' });
            return;
          }
          if (state.onlineSelectedSquare) {
            event.preventDefault();
            clearOnlineSelection();
            render();
          }
        } else if (session.mode !== 'home') {
          event.preventDefault();
          onlineSession.cancel();
          state.onlineSelectedSquare = null;
          state.onlinePremoveDraft = false;
          render();
        }
        return;
      }
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
    const orientation = state.screen === 'online' && onlineSession.snapshot.localColor === 'b' ? -1 : 1;
    const row = Math.max(0, Math.min(7, anchor[0] + delta[0] * orientation));
    const col = Math.max(0, Math.min(7, anchor[1] + delta[1] * orientation));
    state.focusSquare = [row, col];
    render();
    focusSquareButton(row, col);
  });

  render();
}

main();

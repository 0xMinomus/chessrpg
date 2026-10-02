import { CARDS, HEROES } from '../src/content/index.ts';
import { DUNGEON_FLOORS } from '../src/content/dungeon.ts';
import { chessRulesAdapter } from '../src/adapters/chess-rules.ts';
import { applyBossRule } from '../src/domain/battle/ai.ts';
import { runBlackReply } from '../src/domain/battle/commands.ts';
import {
  applyPendingEnemyDrain,
  applyWhiteMoveTriggers,
  battleLegalMoves,
  battleLegalMovesFrom,
  commitBattleMove,
} from '../src/domain/battle/effects.ts';
import { canPlayCard } from '../src/domain/battle/resources.ts';
import { createInitialBattle, type BattleDeps, type Board, type OpponentRuleKey, type Piece } from '../src/domain/battle/state.ts';
import { useHeroSkillFlow, useHeroUltimateFlow } from '../src/application/index.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(name);
  }
}

const rules: OpponentRuleKey[] = [
  'shield',
  'drain',
  'seal',
  'mana-tax',
  'capture-leech',
  'snare',
  'card-silence',
  'hero-silence',
  'blight',
  'rally',
];

const decks = CARDS.map((card) => card.id);
const hand: [string, string, string] = [decks[0], decks[1], decks[2]];
const bossFloors = DUNGEON_FLOORS.filter((floor) => floor.isBoss);

function makeDeps(randomValue = 0): BattleDeps {
  return {
    chess: chessRulesAdapter,
    rng: { next: () => randomValue },
    cards: Object.fromEntries(CARDS.map((card) => [card.id, {
      id: card.id,
      name: card.name,
      cost: card.cost,
      kind: card.kind,
      weight: card.weight,
    }])),
    heroes: Object.fromEntries(HEROES.map((hero) => [hero.id, {
      id: hero.id,
      name: hero.name,
      startEnergy: hero.startEnergy,
      skillAction: hero.skillAction,
      ultimateAction: hero.ultimateAction,
      offenseSurcharge: hero.offenseSurcharge,
      jokerSurcharge: hero.jokerSurcharge,
      captureBonus: hero.captureBonus,
      captureEnergy: hero.captureEnergy,
    }])),
    opponents: Object.fromEntries(DUNGEON_FLOORS.map((floor) => [floor.id, {
      id: floor.id,
      ruleKey: floor.ruleKey,
      reward: floor.reward,
      isBoss: floor.isBoss,
    }])),
  };
}

function floorFor(ruleKey: OpponentRuleKey) {
  const floor = bossFloors.find((candidate) => candidate.ruleKey === ruleKey);
  if (!floor) throw new Error('Boss rule tidak ditemukan: ' + ruleKey);
  return floor;
}

function makeBattle(
  ruleKey: OpponentRuleKey,
  options: { board?: Board; heroMana?: number; energy?: number; enemyEnergy?: number; randomValue?: number } = {},
) {
  const floor = floorFor(ruleKey);
  const deps = makeDeps(options.randomValue ?? 0);
  const opponent = deps.opponents[floor.id];
  const battle = createInitialBattle({
    board: options.board ?? deps.chess.initialBoard(),
    hero: deps.heroes.arunika,
    opponent,
    hand,
    deckCardIds: decks,
  });
  return {
    deps,
    opponent,
    battle: {
      ...battle,
      heroMana: options.heroMana ?? battle.heroMana,
      energy: options.energy ?? battle.energy,
      enemyEnergy: options.enemyEnergy ?? battle.enemyEnergy,
    },
  };
}

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
}

const ruleIds = new Set(bossFloors.map((floor) => floor.ruleKey));
check('sepuluh boss membawa sepuluh skill yang berbeda', bossFloors.length === 10 && ruleIds.size === 10 && rules.every((rule) => ruleIds.has(rule)));

{
  const board = emptyBoard();
  board[7][7] = { type: 'k', color: 'w', id: 'white-king' };
  board[1][4] = { type: 'r', color: 'w', id: 'white-rook' };
  board[0][4] = { type: 'q', color: 'b', id: 'black-queen' };
  board[0][7] = { type: 'k', color: 'b', id: 'black-king' };
  const { battle, deps, opponent } = makeBattle('shield', { board });
  const threatened = (state: typeof battle) => battleLegalMoves(state, deps, 'w').some(
    (move) => move.from[0] === 1 && move.from[1] === 4 && move.to[0] === 0 && move.to[1] === 4,
  );
  const warded = applyBossRule(battle, deps, opponent);
  check('shield: bidak bernilai tertinggi mendapat ward dan tangkapan ditolak',
    warded.enemyWardPieceId === 'black-queen' && threatened(battle) && !threatened(warded));
}

{
  const { battle, deps, opponent } = makeBattle('drain');
  const draining = applyBossRule(battle, deps, opponent);
  const afterMove = applyPendingEnemyDrain(draining, deps.heroes.arunika);
  check('drain: boss mengurangi 1 EN hero pada langkah putih berikutnya',
    draining.enemyDrainArmed && afterMove.energy === battle.energy - 1 && !afterMove.enemyDrainArmed);
}

{
  const { battle, deps, opponent } = makeBattle('seal', { randomValue: 0.99 });
  const target = applyBossRule(battle, deps, opponent);
  const before = battleLegalMoves(battle, deps, 'w');
  const after = battleLegalMoves(target, deps, 'w');
  const sealed = target.bossSealedSquare;
  check('seal: menutup langkah legal menuju petak yang dipilih',
    sealed !== null && before.some((move) => move.to[0] === sealed[0] && move.to[1] === sealed[1]) &&
      !after.some((move) => move.to[0] === sealed[0] && move.to[1] === sealed[1]));
}

{
  const { battle, deps, opponent } = makeBattle('mana-tax', { heroMana: 3 });
  const taxed = applyBossRule(battle, deps, opponent);
  check('mana-tax: mengambil satu mana yang sudah dimiliki hero', taxed.heroMana === 2);
}

{
  const board = emptyBoard();
  board[7][7] = { type: 'k', color: 'w', id: 'white-king' };
  board[1][0] = { type: 'q', color: 'w', id: 'white-queen' };
  board[0][0] = { type: 'r', color: 'b', id: 'black-rook' };
  board[0][7] = { type: 'k', color: 'b', id: 'black-king' };
  const { battle, deps } = makeBattle('capture-leech', { board });
  const afterReply = runBlackReply({ ...battle, turn: 'b' }, deps, false);
  const lastMove = afterReply.history[afterReply.history.length - 1];
  check('capture-leech: tangkapan boss menguras 1 EN tambahan dari hero',
    Boolean(lastMove && lastMove.color === 'b' && lastMove.capture) && afterReply.energy === battle.energy - 1);
}

{
  const { battle, deps, opponent } = makeBattle('snare', { randomValue: 0 });
  const snared = applyBossRule(battle, deps, opponent);
  let target: Piece | null = null;
  let otherWhiteMoves = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = battle.board[row][col];
      if (piece?.id === snared.bossSnareId) target = piece;
      if (piece?.color === 'w' && piece.type !== 'k' && piece.id !== snared.bossSnareId) {
        otherWhiteMoves += battleLegalMovesFrom(snared, deps, row, col).length;
      }
    }
  }
  let targetMoves = 0;
  if (target) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (snared.board[row][col]?.id === target.id) targetMoves = battleLegalMovesFrom(snared, deps, row, col).length;
      }
    }
  }
  check('snare: bidak putih terpilih tidak dapat bergerak sementara bidak lain tetap legal',
    target !== null && targetMoves === 0 && otherWhiteMoves > 0);
}

{
  const { battle, deps, opponent } = makeBattle('card-silence', { heroMana: 6 });
  const silenced = applyBossRule(battle, deps, opponent);
  const card = deps.cards[hand[0]];
  const playability = canPlayCard(silenced, card, deps.heroes.arunika);
  check('card-silence: menolak kartu meski mana mencukupi', silenced.bossCardSilence && !playability.ok);
}

{
  const { battle, deps, opponent } = makeBattle('hero-silence', { energy: 5 });
  const silenced = applyBossRule(battle, deps, opponent);
  const skill = useHeroSkillFlow(silenced, deps);
  const ultimate = useHeroUltimateFlow(silenced, deps);
  check('hero-silence: menolak skill dan ultimate tanpa menghabiskan EN',
    silenced.bossHeroSilence && !skill.ok && !ultimate.ok && skill.state.energy === 5 && ultimate.state.energy === 5);
}

{
  const { battle, deps, opponent } = makeBattle('blight', { heroMana: 2 });
  const blighted = applyBossRule(battle, deps, opponent);
  const move = battleLegalMoves(blighted, deps, 'w')[0];
  if (!move) throw new Error('Tidak ada langkah putih untuk menguji blight.');
  const committed = commitBattleMove(blighted, deps, move, 'w');
  const afterMove = applyWhiteMoveTriggers(committed.state, deps, committed.captured, true);
  check('blight: meniadakan mana langkah putih lalu menghabiskan charge',
    afterMove.heroMana === 2 && !afterMove.bossBlightArmed);
}

{
  const { battle, deps, opponent } = makeBattle('rally', { enemyEnergy: 3 });
  const rallied = applyBossRule(battle, deps, opponent);
  check('rally: menambah 1 EN boss', rallied.enemyEnergy === 4);
}

console.log('PASS ' + passed + ' / FAIL ' + failed);
if (failures.length > 0) {
  for (const failure of failures) console.error('FAIL ' + failure);
  throw new Error(failures.length + ' boss-skill assertion(s) failed.');
}

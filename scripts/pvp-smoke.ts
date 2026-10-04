// Deterministic domain regressions. Run: npm run pvp (no DOM or transport).
import { CARDS, HEROES } from '../src/content/index.ts';
import { chessRulesAdapter } from '../src/adapters/chess-rules.ts';
import { SeededRandom } from '../src/adapters/random.ts';
import {
  cancelTarget, canPlayCard, canUndo, choosePromotion, currentCardCost, heroActionCost,
  legalMoves, movePiece, playCard, rerollHand, resolveTarget, restartPvp, selectPiece,
  tapSquare, undoTurn, useHeroSkill, useHeroUltimate,
} from '../src/domain/pvp/commands.ts';
import {
  clonePvpState, createInitialPvp, otherColor, snapshotPvp,
  type Board, type Color, type Piece, type PvpCommandResult, type PvpDeps,
  type PvpState, type Square,
} from '../src/domain/pvp/state.ts';

const deps: PvpDeps = {
  chess: chessRulesAdapter,
  rng: new SeededRandom(20261004),
  cards: Object.fromEntries(CARDS.map((card) => [card.id, card])),
  heroes: Object.fromEntries(HEROES.map((hero) => [hero.id, hero])),
};
const deck = CARDS.map((card) => card.id);
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failures.push(name + (detail ? ' :: ' + detail : ''));
}
function command(name: string, result: PvpCommandResult): PvpState {
  check(name, result.ok, result.message);
  return result.state;
}
function square(color: Color, row: number, col: number): Square {
  return [color === 'w' ? row : 7 - row, col];
}
function fresh(board: Board = deps.chess.initialBoard()): PvpState {
  return createInitialPvp({
    whiteHeroId: 'arunika', blackHeroId: 'bara', whiteDeck: deck, blackDeck: deck, board,
  }, deps);
}
function fixture(color: Color, heroId = 'arunika'): PvpState {
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  const positions: [number, number, Piece['type'], boolean, string][] = [
    [7, 4, 'k', true, 'own-king'], [0, 4, 'k', false, 'enemy-king'],
    [4, 3, 'p', true, 'own-pawn'], [3, 4, 'p', false, 'enemy-pawn'],
    [5, 0, 'r', true, 'own-rook'], [5, 2, 'b', true, 'own-bishop'],
    [2, 6, 'n', false, 'enemy-knight'],
  ];
  for (const [row, col, type, own, id] of positions) {
    const at = square(color, row, col);
    board[at[0]][at[1]] = { type, color: own ? color : otherColor(color), id };
  }
  const state = fresh(board);
  state.turn = color;
  state.castling = { w: { k: false, q: false }, b: { k: false, q: false } };
  state.sides[color] = { ...state.sides[color], heroId, energy: 2, mana: 6 };
  state.sides[otherColor(color)] = { ...state.sides[otherColor(color)], heroId: 'arunika', energy: 3 };
  state.anchor = snapshotPvp(state);
  return state;
}
function cardState(color: Color, id: string): PvpState {
  const state = fixture(color);
  state.sides[color] = { ...state.sides[color], hand: [id, 'ration', 'focus'] };
  if (id === 'pawnraid') {
    const old = square(color, 3, 4);
    const target = square(color, 3, 3);
    state.board[target[0]][target[1]] = state.board[old[0]][old[1]];
    state.board[old[0]][old[1]] = null;
  }
  if (id === 'phoenix') {
    state.sides[color].graveyard = [
      { id: 'dead-pawn', type: 'p', color }, { id: 'dead-rook', type: 'r', color },
      { id: 'dead-queen', type: 'q', color },
    ];
  }
  state.anchor = snapshotPvp(state);
  return state;
}
function move(state: PvpState, color: Color, from: Square, to: Square, name: string): PvpState {
  return command(name, movePiece(state, deps, square(color, ...from), square(color, ...to)));
}
function allows(state: PvpState, color: Color, from: Square, to: Square): boolean {
  const start = square(color, ...from);
  const end = square(color, ...to);
  return legalMoves(state, deps, color).some((candidate) =>
    candidate.from[0] === start[0] && candidate.from[1] === start[1] &&
    candidate.to[0] === end[0] && candidate.to[1] === end[1]);
}

{
  const state = fresh();
  check('initial sides have distinct three-card hands', ['w', 'b'].every((color) => {
    const hand = state.sides[color as Color].hand;
    return hand.every((id) => Boolean(deps.cards[id])) && new Set(hand).size === 3;
  }));
  check('hero starting resources', state.sides.w.energy === 4 && state.sides.b.energy === 2 && state.sides.w.mana === 0);
  check('20 white moves', legalMoves(state, deps, 'w').length === 20);
  check('20 black moves', legalMoves(state, deps, 'b').length === 20);
  check('wrong-color move rejected', !movePiece(state, deps, [1, 4], [3, 4]).ok);
  check('bad squares rejected', !tapSquare(state, deps, -1, 0).ok && !selectPiece(state, deps, 8, 2).ok &&
    !resolveTarget(state, deps, 1.5, 0).ok && !movePiece(state, deps, [9, 0], [0, 0]).ok);
  check('bad slots rejected', !playCard(state, deps, -1).ok && !playCard(state, deps, 3).ok && !playCard(state, deps, NaN).ok);
  let next = command('white e4', movePiece(state, deps, [6, 4], [4, 4]));
  next = command('black e5', movePiece(next, deps, [1, 4], [3, 4]));
  check('both sides gain move mana', next.sides.w.mana === 1 && next.sides.b.mana === 1);
  check('undo available after both moves', canUndo(next));
  const selected = command('selection does not dirty undo', selectPiece(next, deps, 7, 6));
  check('selection permits undo', canUndo(selected));
  next = command('undo black ply', undoTurn(selected));
  check('undo black board and turn', next.turn === 'b' && next.board[1][4]?.type === 'p' && next.board[3][4] === null);
  next = command('undo white ply', undoTurn(next));
  check('undo initial resources', next.turn === 'w' && next.sides.w.mana === 0 && !canUndo(next));
}

for (const color of ['w', 'b'] as const) {
  const enemy = otherColor(color);
  const label = color + ': ';
  // Every card executes its actual effect in both perspectives.
  for (const card of CARDS) {
    let state = cardState(color, card.id);
    state = command(label + card.id + ' play', playCard(state, deps, 0));
    const targetById: Record<string, Square> = {
      lancer: [4, 3], ward: [4, 3], pawnstep: [4, 3], mark: [3, 4],
      phase: [4, 3], fold: [4, 3], prism: [5, 2], pawnraid: [4, 3], rookbend: [5, 0],
      stagger: [3, 4], snare: [3, 4], sacrifice: [4, 3], blockade: [4, 4],
      relay: [5, 0], pawnGuard: [4, 3], pawnMark: [3, 4], pawnStagger: [3, 4],
      phoenix: [6, 0], edict: [2, 6],
    };
    const target = targetById[card.id];
    if (target) {
      state = command(label + card.id + ' target', resolveTarget(state, deps, ...square(color, ...target)));
      if (card.id === 'relay') state = command(label + 'relay second', resolveTarget(state, deps, ...square(color, 5, 2)));
    }
    check(label + card.id + ' consumed and replaced', state.activeSkill === null && state.sides[color].hand[0] !== card.id);
    const armed: Record<string, keyof PvpState['sides']['w']> = {
      tempo: 'tempoArmed', focus: 'focusArmed', pierce: 'pierceArmed', shock: 'shockArmed',
      leech: 'leechArmed', parry: 'parryArmed', riposte: 'riposteArmed', reserve: 'reserveArmed',
      quiet: 'quietArmed', pawnBreath: 'pawnBreathArmed', pawnPulse: 'pawnPulseArmed',
      lastLaugh: 'lastLaughArmed', salvage: 'salvageArmed',
    };
    if (armed[card.id]) check(label + card.id + ' armed', state.sides[color][armed[card.id]] === true);
    if (card.cost === 0) check(label + card.id + ' free quota consumed', state.sides[color].freeCardUsedThisTurn);
    const patternMoves: Record<string, [Square, Square]> = {
      lancer: [[4, 3], [2, 2]], pawnstep: [[4, 3], [2, 3]],
      phase: [[4, 3], [2, 3]], fold: [[4, 3], [1, 0]],
      prism: [[5, 2], [5, 3]], pawnraid: [[4, 3], [3, 3]], rookbend: [[5, 0], [4, 1]],
    };
    const pattern = patternMoves[card.id];
    if (pattern) {
      check(label + card.id + ' changes legal move', allows(state, color, ...pattern));
      state = move(state, color, ...pattern, label + card.id + ' modified move');
      if (card.id === 'phase') check(label + 'phase is not pawn double', state.enPassant === null);
      check(label + card.id + ' movement hook consumed',
        state.sides[color].knightTargetId === null && state.sides[color].phaseTargetId === null &&
        state.sides[color].prismTargetId === null && state.sides[color].pawnStepId === null &&
        state.sides[color].pawnRaidId === null && state.sides[color].rookBendId === null);
    }
    if (['ward', 'pawnGuard'].includes(card.id)) check(label + card.id + ' prevents capture', !allows(state, enemy, [4, 4], [3, 3]));
    if (['stagger', 'pawnStagger'].includes(card.id)) {
      check(label + card.id + ' prevents capture', !allows(state, enemy, [4, 4], [3, 3]));
      check(label + card.id + ' allows quiet move', allows(state, enemy, [4, 4], [3, 4]));
    }
    if (card.id === 'snare') check(label + 'snare freezes target', !legalMoves(state, deps, enemy).some((candidate) => {
      const at = square(color, 3, 4);
      return candidate.from[0] === at[0] && candidate.from[1] === at[1];
    }));
    if (card.id === 'blockade') check(label + 'blockade prevents landing', !allows(state, enemy, [4, 4], [3, 4]));
    if (card.id === 'ration') check(label + 'ration grants EN', state.sides[color].energy === 4);
    if (card.id === 'disrupt') check(label + 'disrupt drains opponent', state.sides[enemy].energy === 1);
    if (card.id === 'surcharge') check(label + 'surcharge targets opponent', state.sides[enemy].skillSurcharge === 1 && heroActionCost(state, false, enemy) === 3);
    if (card.id === 'counterspell') check(label + 'empty counterspell drains', state.sides[enemy].energy === 2);
    if (card.id === 'fortune') {
      check(label + 'fortune adds reroll', state.sides[color].bonusRerolls === 1);
      for (let roll = 0; roll < 3; roll += 1) state = command(label + 'fortune reroll ' + roll, rerollHand(state, deps));
      check(label + 'fortune fourth rejected', !rerollHand(state, deps).ok && state.sides[color].energy === 0);
    }
    if (card.id === 'phoenix') {
      const at = square(color, 6, 0);
      check(label + 'phoenix highest nonqueen', state.board[at[0]][at[1]]?.id === 'dead-rook' && state.sides[color].graveyard.length === 2);
    }
    if (card.id === 'edict') {
      const at = square(color, 2, 6);
      check(label + 'edict is not capture or move', state.board[at[0]][at[1]] === null && state.captures[color] === 0 && state.turn === color && state.ply === 0);
    }
    if (card.id === 'sacrifice') {
      const at = square(color, 4, 3);
      check(label + 'sacrifice consumes move no mana gain', state.board[at[0]][at[1]] === null && state.sides[color].energy === 5 && state.sides[color].mana === 5 && state.turn === enemy);
    }
    if (card.id === 'relay') {
      const at = square(color, 5, 0);
      check(label + 'relay swaps and consumes move', state.board[at[0]][at[1]]?.id === 'own-bishop' && state.turn === enemy && state.sides[color].mana === 3);
    }
    if (['tempo', 'focus', 'mark', 'pawnMark', 'leech', 'salvage'].includes(card.id)) {
      state = move(state, color, [4, 3], [3, 4], label + card.id + ' capture');
      check(label + card.id + ' capture resources', state.captures[color] === 1 && state.sides[enemy].graveyard[0]?.id === 'enemy-pawn');
      if (card.id === 'tempo') check(label + 'tempo extra move', state.turn === color && !state.sides[color].tempoArmed);
      else check(label + card.id + ' bonus EN', state.sides[color].energy === 4);
      if (card.id === 'leech') check(label + 'leech opponent drain', state.sides[enemy].energy === 2);
    }
    if (['quiet', 'pawnBreath'].includes(card.id)) {
      state = move(state, color, [4, 3], [3, 3], label + card.id + ' quiet pawn');
      check(label + card.id + ' quiet EN', state.sides[color].energy === 3);
    }
    if (card.id === 'shock') {
      state = move(state, color, [5, 0], [0, 0], label + 'shock check');
      check(label + 'shock drains on check', state.sides[enemy].energy === 2 && !state.sides[color].shockArmed);
    }
    if (card.id === 'pawnPulse') {
      const at = square(color, 0, 4);
      state.board[at[0]][at[1]] = null;
      const king = square(color, 2, 2);
      state.board[king[0]][king[1]] = { type: 'k', color: enemy, id: 'enemy-king' };
      state = move(state, color, [4, 3], [3, 3], label + 'pawnPulse check');
      check(label + 'pawnPulse drains on pawn check', state.sides[enemy].energy === 2);
    }
    if (card.id === 'reserve') {
      state = command(label + 'reserve discounted ration', playCard(state, deps, 1));
      check(label + 'reserve discount spent', state.sides[color].mana === 5 && !state.sides[color].reserveArmed);
    }
    if (['riposte', 'lastLaugh', 'parry'].includes(card.id)) {
      state = move(state, color, [5, 2], [4, 1], label + card.id + ' pass turn');
      if (card.id === 'riposte') {
        state = move(state, color, [3, 4], [4, 3], label + 'enemy capture');
        check(label + 'riposte defender bonus', state.sides[color].energy === 3 && !state.sides[color].riposteArmed);
      }
      if (card.id === 'parry') {
        state.sides[enemy].hand = ['disrupt', 'ration', 'focus'];
        state.sides[enemy].mana = 6;
        state = command(label + 'enemy drain parried', playCard(state, deps, 0));
        check(label + 'parry prevents drain and restores EN', state.sides[color].energy === 3 && !state.sides[color].parryArmed);
      }
      if (card.id === 'lastLaugh') {
        const at = square(color, 2, 6);
        state.board[at[0]][at[1]] = { type: 'r', color: enemy, id: 'enemy-rook' };
        state = move(state, color, [2, 6], [7, 6], label + 'enemy check');
        check(label + 'lastLaugh check refund', state.sides[color].energy === 4 && !state.sides[color].lastLaughArmed);
      }
    }
    if (card.id === 'pierce') {
      state.effects.wards = [{ owner: enemy, pieceId: 'enemy-pawn', turns: 2 }];
      check(label + 'pierce bypasses ward', allows(state, color, [4, 3], [3, 4]));
      state = move(state, color, [4, 3], [3, 3], label + 'pierce quiet expiry');
      check(label + 'pierce expires on quiet move', !state.sides[color].pierceArmed);
    }
  }

  // Hero actions use EN, remain independent of card mana, and are symmetric.
  for (const hero of HEROES) {
    for (const ultimate of [false, true]) {
      let state = fixture(color, hero.id);
      state.sides[color].energy = 5;
      const result = ultimate ? useHeroUltimate(state, deps) : useHeroSkill(state, deps);
      state = command(label + hero.id + (ultimate ? ' ultimate' : ' skill'), result);
      const action = ultimate ? hero.ultimateAction : hero.skillAction;
      const targets: Record<string, Square> = { phase: [4, 3], fold: [4, 3], ward: [4, 3], pawnstep: [4, 3], snare: [3, 4], blockade: [4, 4], citadel: [4, 4], smite: [2, 6] };
      if (targets[action]) state = command(label + hero.id + ' resolve ' + action, resolveTarget(state, deps, ...square(color, ...targets[action])));
      check(label + hero.id + ' EN cost ' + action, state.sides[color].energy === (ultimate ? 0 : 3) && state.sides[color].mana === 6);
      if (['phase', 'fold', 'pawnstep'].includes(action)) {
        const target: Square = action === 'fold' ? [1, 0] : [2, 3];
        check(label + action + ' legal hero pattern', allows(state, color, [4, 3], target));
        state = move(state, color, [4, 3], target, label + 'hero ' + action + ' move');
        check(label + action + ' hero hook spent', state.sides[color].heroPlan === null);
      }
      if (action === 'focus') {
        state = move(state, color, [4, 3], [3, 4], label + 'hero focus capture');
        check(label + 'Bara capture bonuses capped', state.sides[color].energy === 5 && state.sides[color].heroPlan === null);
      }
      if (action === 'ward') check(label + 'hero ward blocks capture', !allows(state, enemy, [4, 4], [3, 3]));
      if (action === 'aegis') check(label + 'hero aegis blocks capture', !allows(state, enemy, [4, 4], [3, 3]));
      if (action === 'snare') check(label + 'hero snare installed', state.effects.snares[0]?.turns === 2);
      if (action === 'blockade' || action === 'citadel') check(label + action + ' blocks squares', state.effects.blockades.length === (action === 'citadel' ? 3 : 1));
      if (action === 'smite') {
        const at = square(color, 2, 6);
        check(label + 'smite removes without capture', state.board[at[0]][at[1]] === null && state.captures[color] === 0);
      }
      if (action === 'pawnrush') {
        state = move(state, color, [4, 3], [2, 3], label + 'pawnrush double');
        check(label + 'pawnrush clears next move, Saka EN passive', state.sides[color].heroPawnRushIds === null && state.sides[color].energy === 1);
      }
      if (action === 'skip') {
        state = move(state, color, [4, 3], [3, 3], label + 'skip reply');
        check(label + 'skip keeps mover turn once', state.turn === color && !state.sides[color].skipNextOpponentReply);
        state = move(state, color, [3, 3], [2, 3], label + 'skip followup');
        check(label + 'skip not repeated', state.turn === enemy);
      }
    }
  }

  {
    let state = cardState(color, 'ward');
    state.sides[color].reserveArmed = true;
    const started = command(label + 'discount target begin', playCard(state, deps, 0));
    check(label + 'discount exact charge', started.sides[color].mana === 5);
    check(label + 'invalid target leaves charge pending', !resolveTarget(started, deps, ...square(color, 0, 4)).ok);
    state = command(label + 'discount target cancel', cancelTarget(started, deps));
    check(label + 'cancel restores mana discount and card', state.sides[color].mana === 6 && state.sides[color].reserveArmed && state.sides[color].hand[0] === 'ward');
    state.sides[color].hand = ['pawnGuard', 'pawnBreath', 'focus'];
    const free = command(label + 'free target begin', playCard(state, deps, 0));
    state = command(label + 'free target cancel', cancelTarget(free, deps));
    check(label + 'free cancel does not consume quota', !state.sides[color].freeCardUsedThisTurn);
    state = command(label + 'free instant accepted', playCard(state, deps, 1));
    check(label + 'second free rejected', !playCard(state, deps, 0).ok && !canPlayCard(state.sides[color], deps.cards.pawnGuard, deps.heroes.arunika).ok);
  }
  {
    let state = fixture(color);
    state.effects.wards = [{ owner: color, pieceId: 'own-pawn', turns: 2 }];
    state.effects.staggers = [{ owner: color, pieceId: 'enemy-pawn', turns: 1 }];
    state = move(state, color, [5, 2], [4, 1], label + 'timed own move');
    check(label + 'effects survive owners move', state.effects.wards[0]?.turns === 2 && state.effects.staggers[0]?.turns === 1);
    state = move(state, enemy, [7, 4], [7, 3], label + 'timed first reply');
    check(label + 'effects age first enemy reply', state.effects.wards[0]?.turns === 1 && state.effects.staggers.length === 0);
    state = move(state, color, [4, 1], [5, 2], label + 'timed second own move');
    check(label + 'effects do not age own reply', state.effects.wards[0]?.turns === 1);
    state = move(state, enemy, [7, 3], [7, 4], label + 'timed second enemy reply');
    check(label + 'ward expires exactly second reply', state.effects.wards.length === 0);
  }
  {
    let state = fixture(color, 'bara');
    state.sides[color].energy = 3;
    state.sides[color].skillSurcharge = 1;
    state = command(label + 'taxed hero focus', useHeroSkill(state, deps));
    check(label + 'hero tax consumed only on skill', state.sides[color].energy === 0 && state.sides[color].skillSurcharge === 0);
    state = fixture(color);
    state.sides[color].skillSurcharge = 1;
    const targeted = command(label + 'taxed target staged', useHeroSkill({ ...state, sides: { ...state.sides, [color]: { ...state.sides[color], energy: 3 } } }, deps));
    state = command(label + 'taxed target cancelled', cancelTarget(targeted, deps));
    check(label + 'hero cancel retains energy tax', state.sides[color].energy === 3 && state.sides[color].skillSurcharge === 1);
  }
  {
    let state = cardState(color, 'counterspell');
    state.sides[enemy].heroPlan = { action: 'phase', pieceId: 'enemy-pawn' };
    state.sides[enemy].phaseTargetId = 'enemy-knight';
    state.effects.wards = [{ owner: enemy, pieceId: 'enemy-pawn', turns: 2, hero: true }, { owner: enemy, pieceId: 'enemy-knight', turns: 2 }];
    state = command(label + 'counterspell cancels hero', playCard(state, deps, 0));
    check(label + 'counterspell preserves card effects', state.sides[enemy].heroPlan === null && state.sides[enemy].phaseTargetId === 'enemy-knight' && state.effects.wards.length === 1 && state.sides[enemy].energy === 3);
    state = fixture(color, 'nila');
    state.turn = enemy;
    state.sides[enemy].hand = ['disrupt', 'disrupt', 'focus'];
    state.sides[enemy].mana = 6;
    state = command(label + 'Nila first drain', playCard(state, deps, 0));
    check(label + 'Nila blocks once', state.sides[color].energy === 2 && state.sides[color].nilaDrainBlocked);
    state = command(label + 'Nila second drain', playCard(state, deps, 1));
    check(label + 'Nila second drain applies', state.sides[color].energy === 0);
  }
  {
    let state = fixture(color);
    const enemyPawn = square(color, 3, 4);
    state.board[enemyPawn[0]][enemyPawn[1]] = null;
    const pawnFrom = square(color, 1, 0);
    state.board[pawnFrom[0]][pawnFrom[1]] = { type: 'p', color, id: 'promoter' };
    state = move(state, color, [1, 0], [0, 0], label + 'promotion staging');
    check(label + 'promotion blocks other commands', state.pendingPromotion !== null && !playCard(state, deps, 0).ok && !rerollHand(state, deps).ok && !useHeroSkill(state, deps).ok);
    check(label + 'invalid promotion rejected', !choosePromotion(state, deps, 'k' as 'q').ok);
    state = command(label + 'underpromotion', choosePromotion(state, deps, 'n'));
    const at = square(color, 0, 0);
    check(label + 'underpromotion color and history', state.board[at[0]][at[1]]?.type === 'n' && state.board[at[0]][at[1]]?.color === color && state.history.at(-1)?.promotion === 'n' && state.turn === enemy);
  }
  {
    let state = fixture(color);
    state.effects.wards = [{ owner: enemy, pieceId: 'enemy-pawn', turns: 2 }];
    state = move(state, color, [5, 2], [4, 1], label + 'capture guard turn');
    state.castling[enemy] = { k: true, q: true };
    check(label + 'no bogus castle without rook', !legalMoves(state, deps, enemy).some((candidate) => candidate.castle));
    const restarted = command(label + 'restart from other turn', restartPvp(state, deps));
    check(label + 'restart reset and preserved decks/heroes', restarted.turn === 'w' && restarted.ply === 0 && restarted.past.length === 0 && restarted.effects.wards.length === 0 && restarted.sides[color].deckCardIds.join() === deck.join() && restarted.board.flat().filter(Boolean).length === 32);
  }
  {
    let state = cardState(color, 'leech');
    state.sides[enemy].energy = 0;
    state = command(label + 'empty leech play', playCard(state, deps, 0));
    state = move(state, color, [4, 3], [3, 4], label + 'empty leech capture');
    check(label + 'leech cannot create stolen EN', state.sides[color].energy === 3);
    state = fixture(color, 'veyra');
    state = move(state, color, [4, 3], [3, 4], label + 'Veyra capture');
    check(label + 'Veyra capture restores no EN', state.sides[color].energy === 2);
  }
  {
    let state = fixture(color);
    const ownKing = square(color, 7, 4);
    const ownPawn = square(color, 4, 3);
    const blocker = square(color, 6, 4);
    const attacker = square(color, 3, 4);
    state.board[ownPawn[0]][ownPawn[1]] = null;
    state.board[blocker[0]][blocker[1]] = { type: 'p', color, id: 'pinned-pawn' };
    state.board[attacker[0]][attacker[1]] = { type: 'r', color: enemy, id: 'pin-rook' };
    state.sides[color].hand = ['sacrifice', 'relay', 'fold'];
    state = command(label + 'pinned sacrifice begin', playCard(state, deps, 0));
    check(label + 'sacrifice cannot expose king', !resolveTarget(state, deps, ...blocker).ok && state.board[blocker[0]][blocker[1]]?.id === 'pinned-pawn');
    state = command(label + 'pinned sacrifice cancel', cancelTarget(state, deps));
    state = command(label + 'pinned fold begin', playCard(state, deps, 2));
    state = command(label + 'pinned fold target', resolveTarget(state, deps, ...blocker));
    check(label + 'teleport keeps king safety', !movePiece(state, deps, blocker, square(color, 5, 5)).ok && state.board[ownKing[0]][ownKing[1]]?.type === 'k');
  }
  {
    const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    const king = square(color, 7, 4);
    const rook = square(color, 7, 7);
    const enemyKing = square(color, 0, 4);
    board[king[0]][king[1]] = { type: 'k', color, id: 'castle-king' };
    board[rook[0]][rook[1]] = { type: 'r', color, id: 'castle-rook' };
    board[enemyKing[0]][enemyKing[1]] = { type: 'k', color: enemy, id: 'castle-enemy' };
    let state = fresh(board);
    state.turn = color;
    state.effects.snares = [{ owner: enemy, pieceId: 'castle-rook', turns: 2 }];
    check(label + 'snared rook cannot castle', !allows(state, color, [7, 4], [7, 6]));
    state.effects.snares = [];
    state = move(state, color, [7, 4], [7, 6], label + 'legal castle');
    const landing = square(color, 7, 5);
    check(label + 'castling moves rook and revokes rights', state.board[landing[0]][landing[1]]?.id === 'castle-rook' && !state.castling[color].k && !state.castling[color].q);
  }
  {
    let state = fixture(color);
    const previous = state.sides[color].hand.slice();
    state = command(label + 'reroll distinct hand', rerollHand(state, deps));
    check(label + 'reroll excludes prior hand', state.sides[color].hand.every((id) => !previous.includes(id)) && new Set(state.sides[color].hand).size === 3);
    state = command(label + 'reroll paid second', rerollHand(state, deps));
    check(label + 'ordinary third reroll blocked', !rerollHand(state, deps).ok && state.sides[color].energy === 1);
  }
  {
    for (const mate of [false, true]) {
      const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
      const king = square(color, 0, 0);
      const ownKing = square(color, 2, 2);
      const queen = square(color, mate ? 2 : 3, mate ? 1 : 2);
      board[king[0]][king[1]] = { type: 'k', color: enemy, id: 'result-enemy-king' };
      board[ownKing[0]][ownKing[1]] = { type: 'k', color, id: 'result-own-king' };
      board[queen[0]][queen[1]] = { type: 'q', color, id: 'result-own-queen' };
      let state = fresh(board);
      state.turn = color;
      const from: Square = mate ? [2, 1] : [3, 2];
      const target: Square = mate ? [1, 1] : [2, 1];
      state = move(state, color, from, target, label + (mate ? 'mate' : 'stalemate'));
      check(label + 'terminal outcome ' + mate, state.gameOver && state.winner === (mate ? color : null));
    }
  }
  {
    let state = cardState(color, 'fold');
    state = command(label + 'fold promotion begin', playCard(state, deps, 0));
    state = command(label + 'fold promotion target', resolveTarget(state, deps, ...square(color, 4, 3)));
    state = move(state, color, [4, 3], [0, 3], label + 'fold promotion staging');
    check(label + 'phase metadata survives promotion staging', state.pendingPromotion?.phase === true);
    state = command(label + 'fold promotion finish', choosePromotion(state, deps, 'b'));
    check(label + 'phase promotion no en passant', state.pendingPromotion === null && state.enPassant === null && state.sides[color].phaseTargetId === null);
  }
}

{
  let state = fresh();
  state = command('mate f3', movePiece(state, deps, [6, 5], [5, 5]));
  state = command('mate e5', movePiece(state, deps, [1, 4], [3, 4]));
  state = command('mate g4', movePiece(state, deps, [6, 6], [4, 6]));
  state = command('mate Qh4', movePiece(state, deps, [0, 3], [4, 7]));
  check('black checkmate outcome and undo', state.gameOver && state.winner === 'b' && canUndo(state));
  check('terminal move blocked', !movePiece(state, deps, [6, 0], [5, 0]).ok);
  const undone = command('undo terminal ply', undoTurn(state));
  check('undo mate returns playable black turn', !undone.gameOver && undone.turn === 'b');
  const restarted = command('restart terminal match', restartPvp(state, deps));
  check('terminal restart clears outcome', !restarted.gameOver && restarted.winner === null);
}
{
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  board[0][0] = { type: 'k', color: 'b', id: 'draw-bk' };
  board[2][2] = { type: 'k', color: 'w', id: 'draw-wk' };
  board[3][2] = { type: 'q', color: 'w', id: 'draw-wq' };
  let state = command('stalemate Qb6', movePiece(fresh(board), deps, [3, 2], [2, 1]));
  check('stalemate result', state.gameOver && state.winner === null && !deps.chess.isInCheck(state.board, 'b'));
}
{
  let state = fresh();
  state = command('en passant e4', movePiece(state, deps, [6, 4], [4, 4]));
  state = command('en passant a6', movePiece(state, deps, [1, 0], [2, 0]));
  state = command('en passant e5', movePiece(state, deps, [4, 4], [3, 4]));
  state = command('en passant d5', movePiece(state, deps, [1, 3], [3, 3]));
  state = command('en passant capture', movePiece(state, deps, [3, 4], [2, 3]));
  check('en passant removes correct pawn', state.board[3][3] === null && state.board[2][3]?.color === 'w' && state.history.at(-1)?.enPassant === true && state.sides.b.graveyard.length === 1);
}
{
  let state = fresh();
  state = command('clone seed move', movePiece(state, deps, [6, 4], [4, 4]));
  state.sides.w.heroPlan = { action: 'phase', pieceId: state.board[4][4]!.id };
  state.effects.blockades = [{ owner: 'w', square: [3, 3], turns: 2 }];
  const copy = clonePvpState(state);
  copy.board[4][4]!.type = 'q';
  copy.sides.w.heroPlan!.pieceId = 'mutated';
  copy.sides.w.hand[0] = 'mutated';
  copy.effects.blockades[0].square[0] = 0;
  copy.past[0].board[6][4]!.type = 'q';
  copy.anchor!.sides.w.deckCardIds[0] = 'mutated';
  check('clone isolates board sides effects snapshots', state.board[4][4]?.type === 'p' && state.sides.w.heroPlan.pieceId !== 'mutated' && state.sides.w.hand[0] !== 'mutated' && state.effects.blockades[0].square[0] === 3 && state.past[0].board[6][4]?.type === 'p' && state.anchor!.sides.w.deckCardIds[0] !== 'mutated');
  const dirty = rerollHand(state, deps).state;
  check('free reroll invalidates undo even unchanged energy', !canUndo(dirty));
}
{
  check('hero offense surcharge and reserve clamp', currentCardCost(deps.cards.pawnMark, deps.heroes.nila, false) === 1 && currentCardCost(deps.cards.pawnMark, deps.heroes.nila, true) === 0);
  check('hero joker surcharge', currentCardCost(deps.cards.fold, deps.heroes.saka, false) === 6);
}

console.log('pvp smoke: ' + passed + ' passed, ' + failures.length + ' failed');
for (const failure of failures) console.log('  FAIL: ' + failure);
if (failures.length > 0 && 'process' in globalThis) {
  const process = globalThis.process as { exitCode: number };
  process.exitCode = 1;
}

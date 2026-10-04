// Command bernama duel PvP simetris: seleksi, langkah, promosi, kartu, hero,
// reroll, undo, dan perpindahan giliran. Kedua warna dikelola oleh pemain
// manusia; tidak ada AI di modul ini.

import {
  EN_CAP,
  HERO_SKILL_COST,
  HERO_ULTIMATE_COST,
  MANA_CAP,
  activeSide,
  otherColor,
  createInitialPvp,
  restorePvpSnapshot,
  snapshotPvp,
  type CardDef,
  type Color,
  type HeroDef,
  type Move,
  type Piece,
  type PieceType,
  type PromotionChoice,
  type PvpCommandResult,
  type PvpDeps,
  type PvpState,
  type SideState,
  type Square,
} from './state.ts';

const PIECE_NAMES: Record<PieceType, string> = {
  k: 'raja',
  q: 'ratu',
  r: 'benteng',
  b: 'gajah',
  n: 'kuda',
  p: 'pion',
};

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

function heroOf(deps: PvpDeps, side: SideState): HeroDef {
  return deps.heroes[side.heroId] ?? Object.values(deps.heroes)[0];
}

function busy(state: PvpState): boolean {
  return state.gameOver;
}

function fail(state: PvpState, message: string): PvpCommandResult {
  return { state: { ...state, status: message }, ok: false, message };
}

function sideLabel(color: Color): string {
  return color === 'w' ? 'putih' : 'hitam';
}

// ---------- Filter efek lintas sisi ----------

function pieceWarded(state: PvpState, pieceId: string | null): boolean {
  if (!pieceId) return false;
  return state.effects.wards.some(function (ward) {
    return ward.pieceId === pieceId;
  });
}

function pieceSnared(state: PvpState, pieceId: string | null): boolean {
  if (!pieceId) return false;
  return state.effects.snares.some(function (snare) {
    return snare.pieceId === pieceId;
  });
}

function pieceStaggered(state: PvpState, pieceId: string | null): boolean {
  if (!pieceId) return false;
  return state.effects.staggers.some(function (stagger) {
    return stagger.pieceId === pieceId;
  });
}

function aegisActive(state: PvpState, color: Color): boolean {
  return state.effects.aegis.some(function (aegis) {
    return aegis.color === color && aegis.turns > 0;
  });
}

function squareBlockaded(state: PvpState, color: Color, square: Square): boolean {
  return state.effects.blockades.some(function (blockade) {
    return blockade.owner === color && blockade.square[0] === square[0] && blockade.square[1] === square[1];
  });
}

/** Langkah legal untuk `color` setelah filter efek kartu/hero. */
export function legalMoves(state: PvpState, deps: PvpDeps, color: Color): Move[] {
  const chess = deps.chess;
  const side = state.sides[color];
  const plan = side.heroPlan;
  const mods = {
    castling: state.castling,
    enPassant: state.enPassant,
    knightTargetId: side.knightTargetId,
    phaseTargetId: side.phaseTargetId ?? (plan?.action === 'phase' || plan?.action === 'fold' ? plan.pieceId : null),
    phaseJokerId: side.phaseJokerId ?? (plan?.action === 'fold' ? plan.pieceId : null),
    prismTargetId: side.prismTargetId,
    prismType: side.prismType,
    pawnStepId: side.pawnStepId ?? (plan?.action === 'pawnstep' ? plan.pieceId : null),
    pawnRaidId: side.pawnRaidId,
    rookBendId: side.rookBendId,
    heroPawnRushIds: side.heroPawnRushIds,
  };
  const base = chess.baseMoves(state.board, mods, color);
  return base.filter(function (move) {
    const moving = state.board[move.from[0]][move.from[1]];
    if (!moving) return false;
    const captured = chess.captureAt(state.board, state.enPassant, move);
    if (captured?.type === 'k') return false;
    if (pieceSnared(state, moving.id)) return false;
    if (captured && pieceStaggered(state, moving.id)) return false;
    if (captured && pieceWarded(state, captured.id) && !side.pierceArmed) return false;
    if (captured && aegisActive(state, otherColor(color))) return false;
    if (squareBlockaded(state, otherColor(color), move.to)) return false;
    if (move.castle) {
      const rook = state.board[move.from[0]][move.castle === 'k' ? 7 : 0];
      if (!rook || rook.color !== color || rook.type !== 'r' || pieceSnared(state, rook.id)) return false;
      const rookLanding: Square = [move.from[0], move.castle === 'k' ? 5 : 3];
      if (squareBlockaded(state, otherColor(color), rookLanding)) return false;
    }
    return true;
  });
}


export function legalMovesFrom(
  state: PvpState,
  deps: PvpDeps,
  row: number,
  col: number,
): Move[] {
  if (!validSquare(row, col)) return [];
  const piece = state.board[row][col];
  if (!piece) return [];
  return legalMoves(state, deps, piece.color).filter(function (move) {
    return move.from[0] === row && move.from[1] === col;
  });
}

export function findPieceSquare(board: PvpState['board'], pieceId: string): Square | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.id === pieceId) return [row, col];
    }
  }
  return null;
}

/** Hapus efek bertarget bidak saat bidak itu hilang. */
function clearPieceEffects(state: PvpState, piece: Piece): PvpState {
  const next: PvpState = { ...state };
  next.effects = {
    wards: next.effects.wards.filter(function (effect) {
      return effect.pieceId !== piece.id;
    }),
    snares: next.effects.snares.filter(function (effect) {
      return effect.pieceId !== piece.id;
    }),
    staggers: next.effects.staggers.filter(function (effect) {
      return effect.pieceId !== piece.id;
    }),
    blockades: next.effects.blockades,
    marks: next.effects.marks.filter(function (effect) {
      return effect.pieceId !== piece.id;
    }),
    aegis: next.effects.aegis,
  };
  const side = state.sides[piece.color];
  const patch: Partial<SideState> = {};
  if (side.knightTargetId === piece.id) patch.knightTargetId = null;
  if (side.phaseTargetId === piece.id) patch.phaseTargetId = null;
  if (side.phaseJokerId === piece.id) patch.phaseJokerId = null;
  if (side.prismTargetId === piece.id) {
    patch.prismTargetId = null;
    patch.prismType = null;
  }
  if (side.pawnStepId === piece.id) patch.pawnStepId = null;
  if (side.pawnRaidId === piece.id) patch.pawnRaidId = null;
  if (side.rookBendId === piece.id) patch.rookBendId = null;
  if (side.heroPlan?.pieceId === piece.id) patch.heroPlan = null;
  if (side.heroPawnRushIds?.includes(piece.id)) {
    patch.heroPawnRushIds = side.heroPawnRushIds.filter(function (id) { return id !== piece.id; });
  }
  if (Object.keys(patch).length) {
    next.sides = { ...next.sides, [piece.color]: { ...next.sides[piece.color], ...patch } };
  }
  return next;
}

// ---------- Resource & kartu ----------

export function currentCardCost(card: { cost: number; kind: string }, hero: HeroDef, reserveArmed: boolean): number {
  const surcharge =
    (card.kind === 'offense' ? hero.offenseSurcharge ?? 0 : 0) +
    (card.kind === 'joker' ? hero.jokerSurcharge ?? 0 : 0);
  return Math.max(0, card.cost + surcharge - (reserveArmed ? 1 : 0));
}

export function canPlayCard(side: SideState, card: CardDef, hero: HeroDef): { ok: boolean; reason: string } {
  if (card.cost === 0 && side.freeCardUsedThisTurn) {
    return { ok: false, reason: 'Jatah satu kartu 0 mana per giliran sudah dipakai.' };
  }
  const cost = currentCardCost(card, hero, side.reserveArmed);
  if (side.mana < cost) {
    return { ok: false, reason: 'Butuh ' + cost + ' mana; mana sekarang ' + side.mana + ' / ' + MANA_CAP + '.' };
  }
  return { ok: true, reason: '' };
}

export function heroActionCost(state: PvpState, ultimate: boolean, color: Color = state.turn): number {
  return ultimate ? HERO_ULTIMATE_COST : HERO_SKILL_COST + state.sides[color].skillSurcharge;
}

function drawCard(deps: PvpDeps, deckCardIds: string[], excluded: string[]): string {
  const options = deckCardIds
    .map(function (id) {
      return deps.cards[id];
    })
    .filter(function (card): card is CardDef {
      return card !== undefined && excluded.indexOf(card.id) === -1;
    });
  const totalWeight = options.reduce(function (total, card) {
    return total + (card.weight ?? 1);
  }, 0);
  let roll = deps.rng.next() * totalWeight;
  for (let i = 0; i < options.length; i += 1) {
    roll -= options[i].weight ?? 1;
    if (roll < 0) return options[i].id;
  }
  return options.length ? options[options.length - 1].id : '';
}

export function makePvpHand(excluded: string[], deps: PvpDeps, deckCardIds: string[]): [string, string, string] {
  const hand: string[] = [];
  const blocked = excluded.slice();
  while (hand.length < 3) {
    hand.push(drawCard(deps, deckCardIds, blocked.concat(hand)));
  }
  return [hand[0], hand[1], hand[2]];
}

function replaceSlot(state: PvpState, deps: PvpDeps, slot: number): PvpState {
  const side = activeSide(state);
  const excluded = side.hand;
  const next = side.hand.slice();
  next[slot] = drawCard(deps, side.deckCardIds, excluded);
  return {
    ...state,
    sides: {
      ...state.sides,
      [state.turn]: { ...side, hand: [next[0], next[1], next[2]] as [string, string, string] },
    },
    dealtSlot: slot,
  };
}

function sideWith(state: PvpState, color: Color, patch: Partial<SideState>): PvpState {
  return { ...state, sides: { ...state.sides, [color]: { ...state.sides[color], ...patch } } };
}

function gainEnergy(state: PvpState, color: Color, amount: number): PvpState {
  return sideWith(state, color, { energy: Math.min(EN_CAP, state.sides[color].energy + amount) });
}

function loseEnergy(state: PvpState, color: Color, amount: number): PvpState {
  return sideWith(state, color, { energy: Math.max(0, state.sides[color].energy - amount) });
}

// PvP has no boss-only Gangguan: parry and Nila guard incoming EN drain.
function drainEnergy(state: PvpState, deps: PvpDeps, color: Color, amount: number): PvpState {
  const side = state.sides[color];
  if (side.parryArmed) {
    return gainEnergy(sideWith(state, color, { parryArmed: false }), color, 1);
  }
  if (heroOf(deps, side).id === 'nila' && !side.nilaDrainBlocked) {
    return sideWith(state, color, { nilaDrainBlocked: true });
  }
  return loseEnergy(state, color, amount);
}

function validSquare(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 8 && col >= 0 && col < 8;
}

function cancelOpponentHero(state: PvpState, deps: PvpDeps): PvpState {
  const opponent = otherColor(state.turn);
  const side = state.sides[opponent];
  const effects = state.effects;
  const hadPlan = Boolean(side.heroPlan || side.heroPawnRushIds || side.skipNextOpponentReply) ||
    effects.wards.some(function (effect) { return effect.owner === opponent && effect.hero; }) ||
    effects.snares.some(function (effect) { return effect.owner === opponent && effect.hero; }) ||
    effects.blockades.some(function (effect) { return effect.owner === opponent && effect.hero; }) ||
    effects.aegis.some(function (effect) { return effect.color === opponent && effect.hero; });
  if (!hadPlan) return drainEnergy(state, deps, opponent, 1);
  const next = sideWith(state, opponent, { heroPlan: null, heroPawnRushIds: null, skipNextOpponentReply: false });
  return {
    ...next,
    effects: {
      ...effects,
      wards: effects.wards.filter(function (effect) { return effect.owner !== opponent || !effect.hero; }),
      snares: effects.snares.filter(function (effect) { return effect.owner !== opponent || !effect.hero; }),
      blockades: effects.blockades.filter(function (effect) { return effect.owner !== opponent || !effect.hero; }),
      aegis: effects.aegis.filter(function (effect) { return effect.color !== opponent || !effect.hero; }),
    },
  };
}

function gainMana(state: PvpState, color: Color, amount: number): PvpState {
  return sideWith(state, color, { mana: Math.min(MANA_CAP, state.sides[color].mana + amount) });
}

// ---------- Efek kartu instan (tanpa target) ----------

const TARGET_CARD_IDS = [
  'lancer', 'ward', 'pawnstep', 'mark', 'phase', 'prism', 'pawnraid', 'rookbend',
  'stagger', 'snare', 'sacrifice', 'blockade', 'relay', 'pawnGuard', 'pawnMark',
  'pawnStagger', 'fold', 'edict', 'phoenix',
];

export function hasTargetCard(id: string): boolean {
  return TARGET_CARD_IDS.indexOf(id) !== -1;
}

const CARD_TARGET_PROMPTS: Record<string, string> = {
  lancer: 'Pilih bidak sendiri selain raja untuk bergerak seperti kuda.',
  ward: 'Pilih bidak sendiri selain raja untuk dilindungi.',
  pawnstep: 'Pilih pion sendiri untuk langkah ganda.',
  mark: 'Pilih bidak lawan selain raja untuk ditandai.',
  phase: 'Pilih bidak sendiri selain raja untuk berpindah.',
  fold: 'Pilih bidak sendiri selain raja untuk Lipatan Dimensi.',
  prism: 'Pilih gajah atau benteng sendiri.',
  pawnraid: 'Pilih pion sendiri yang dapat menangkap lurus.',
  rookbend: 'Pilih benteng sendiri.',
  stagger: 'Pilih bidak lawan selain raja untuk digentarkan.',
  snare: 'Pilih bidak lawan selain raja untuk dijerat.',
  sacrifice: 'Pilih pion sendiri yang akan dikorbankan. Ini memakai langkahmu.',
  pawnGuard: 'Pilih pion sendiri untuk ditamengi.',
  pawnMark: 'Pilih pion lawan untuk ditandai.',
  pawnStagger: 'Pilih pion lawan yang tak dapat menangkap pada balasan.',
  blockade: 'Pilih petak kosong untuk ditutup selama 2 balasan lawan.',
  relay: 'Pilih bidak pertama untuk ditukar.',
  edict: 'Pilih satu bidak lawan selain raja dan ratu untuk dihapus.',
  phoenix: 'Pilih petak kosong di dua baris awal untuk menempatkan bidak yang bangkit.',
};

function applyInstantCard(state: PvpState, deps: PvpDeps, slot: number): PvpState {
  const side = activeSide(state);
  const id = side.hand[slot];
  const color = state.turn;
  let next: PvpState = state;
  const setSide = function (patch: Partial<SideState>): void {
    next = sideWith(next, color, patch);
  };
  if (id === 'tempo') setSide({ tempoArmed: true });
  if (id === 'ration') next = gainEnergy(next, color, 2);
  if (id === 'disrupt') next = drainEnergy(next, deps, otherColor(color), 2);
  if (id === 'focus') setSide({
    focusArmed: true,
    heroPlan: side.heroPlan?.action === 'focus' ? null : side.heroPlan,
  });
  if (id === 'pierce') setSide({ pierceArmed: true });
  if (id === 'shock') setSide({ shockArmed: true });
  if (id === 'leech') setSide({ leechArmed: true });
  if (id === 'surcharge') {
    next = sideWith(next, otherColor(color), { skillSurcharge: 1 });
  }
  if (id === 'counterspell') {
    next = cancelOpponentHero(next, deps);
  }
  if (id === 'parry') setSide({ parryArmed: true });
  if (id === 'riposte') setSide({ riposteArmed: true });
  if (id === 'reserve') setSide({ reserveArmed: true });
  if (id === 'quiet') setSide({ quietArmed: true });
  if (id === 'pawnBreath') setSide({ pawnBreathArmed: true });
  if (id === 'pawnPulse') setSide({ pawnPulseArmed: true });
  if (id === 'lastLaugh') setSide({ lastLaughArmed: true });
  if (id === 'salvage') setSide({ salvageArmed: true });
  if (id === 'fortune') setSide({ bonusRerolls: 1 });
  return replaceSlot(next, deps, slot);
}

// ---------- Langkah & pergantian giliran ----------

function advanceEffects(state: PvpState, completedColor: Color): PvpState {
  const tick = <T extends { owner: Color; turns: number }>(effects: T[]): T[] =>
    effects.map(function (effect) {
      return effect.owner === completedColor ? effect : { ...effect, turns: effect.turns - 1 };
    }).filter(function (effect) { return effect.turns > 0; });
  return {
    ...state,
    effects: {
      wards: tick(state.effects.wards),
      snares: tick(state.effects.snares),
      staggers: tick(state.effects.staggers),
      blockades: tick(state.effects.blockades),
      marks: state.effects.marks,
      aegis: state.effects.aegis.map(function (effect) {
        return effect.color === completedColor ? effect : { ...effect, turns: effect.turns - 1 };
      }).filter(function (effect) { return effect.turns > 0; }),
    },
  };
}

/**
 * Akhiri giliran pemain aktif dan serahkan ke lawan. Dipanggil setelah
 * langkah catur selesai (atau efek yang menghabiskan langkah seperti
 * Tumbal/Relay). Pemicu akhir giliran (mana +1, guntur, sunyi, dsb.) diterapkan
 * di sini.
 */
export function finishTurn(state: PvpState, deps: PvpDeps, captured: Piece | null, movedPiece: boolean): PvpState {
  const color = state.turn;
  const side = activeSide(state);
  const hero = heroOf(deps, side);
  let next: PvpState = state;
  // Guntur: skak menguras 1 EN lawan.
  if (side.shockArmed) {
    if (deps.chess.isInCheck(next.board, otherColor(color))) {
      next = drainEnergy(next, deps, otherColor(color), 1);
    }
    next = sideWith(next, color, { shockArmed: false });
  }
  if (side.quietArmed) {
    if (!captured) next = gainEnergy(next, color, 1);
    next = sideWith(next, color, { quietArmed: false });
  }
  const lastMove = next.history[next.history.length - 1];
  const movedPawn = Boolean(lastMove && lastMove.piece === 'p' && !lastMove.note);
  if (movedPiece) next = gainMana(next, color, 1);
  if (hero.id === 'saka' && movedPawn) next = gainEnergy(next, color, 1);
  if (side.pawnBreathArmed) {
    if (movedPawn && !captured) next = gainEnergy(next, color, 1);
    next = sideWith(next, color, { pawnBreathArmed: false });
  }
  if (side.pawnPulseArmed) {
    if (movedPawn && deps.chess.isInCheck(next.board, otherColor(color))) {
      next = drainEnergy(next, deps, otherColor(color), 1);
    }
    next = sideWith(next, color, { pawnPulseArmed: false });
  }
  if (side.leechArmed && !captured) next = sideWith(next, color, { leechArmed: false });
  next = sideWith(next, color, { pierceArmed: false, heroPawnRushIds: null });

  // A reply counts only once the opponent actually finishes its turn.
  const opponent = otherColor(color);
  if (next.sides[opponent].lastLaughArmed && deps.chess.isInCheck(next.board, opponent)) {
    next = gainEnergy(next, opponent, 2);
    next = sideWith(next, opponent, { lastLaughArmed: false });
  }
  const outcome = checkOutcome({
    ...next, turn: opponent, turnNo: next.turnNo + (opponent === 'w' ? 1 : 0),
  }, deps);
  if (outcome.state.gameOver) return finishPvpTurn(outcome.state);
  if (captured && next.sides[color].tempoArmed) {
    next = sideWith(next, color, { tempoArmed: false });
    return finishPvpTurn({ ...next, status: 'Tempo ganda aktif. ' + sideLabel(color) + ' bergerak sekali lagi.' });
  }

  next = advanceEffects(next, color);
  next = { ...next, effects: { ...next.effects, marks: next.effects.marks.filter(function (mark) { return mark.owner !== color; }) } };
  next = sideWith(next, opponent, {
    parryArmed: false,
    riposteArmed: false,
    salvageArmed: false,
    lastLaughArmed: false,
    rollsThisTurn: 0,
    bonusRerolls: 0,
    freeCardUsedThisTurn: false,
  });
  let newTurn = opponent;
  if (next.sides[color].skipNextOpponentReply) {
    next = sideWith(next, color, { skipNextOpponentReply: false });
    next = advanceEffects(next, opponent);
    next = sideWith(next, color, {
      parryArmed: false, riposteArmed: false, salvageArmed: false, lastLaughArmed: false,
      rollsThisTurn: 0, bonusRerolls: 0, freeCardUsedThisTurn: false,
    });
    newTurn = color;
  }
  next = {
    ...next,
    turn: newTurn,
    turnNo: next.turnNo + (opponent === 'w' || newTurn === color ? 1 : 0),
    status: 'Giliran ' + sideLabel(newTurn) + '. Pilih langkah.',
  };
  return finishPvpTurn(checkOutcome(next, deps).state);
}

function checkOutcome(state: PvpState, deps: PvpDeps): PvpCommandResult {
  const color = state.turn;
  const moves = legalMoves(state, deps, color);
  const checked = deps.chess.isInCheck(state.board, color);
  if (moves.length > 0) {
    if (!checked) return { state, ok: true, message: state.status };
    const status = 'Skak. Lindungi raja ' + sideLabel(color) + '.';
    return { state: { ...state, status }, ok: true, message: status };
  }
  const next: PvpState = {
    ...state,
    gameOver: true,
    winner: checked ? otherColor(color) : null,
    status: checked
      ? 'Skakmat. Raja ' + sideLabel(color) + ' tumbang.'
      : 'Remis. Tidak ada langkah legal.',
  };
  return { state: next, ok: true, message: next.status };
}

function finishPvpTurn(state: PvpState): PvpState {
  const past = state.anchor ? state.past.concat([state.anchor]) : state.past;
  const next: PvpState = { ...state, past };
  return { ...next, anchor: snapshotPvp(next) };
}

function commitMove(state: PvpState, deps: PvpDeps, move: Move, color: Color): { state: PvpState; captured: Piece | null } {
  const chess = deps.chess;
  const moving = state.board[move.from[0]][move.from[1]];
  if (!moving) return { state, captured: null };
  const originalType = moving.type;
  const promotion = originalType === 'p' && (move.to[0] === 0 || move.to[0] === 7) ? (move.promotion ?? 'q') : null;
  const captured = chess.captureAt(state.board, state.enPassant, move);

  let next: PvpState = { ...state };
  if (captured) {
    next = {
      ...next,
      sides: {
        ...next.sides,
        [captured.color]: {
          ...next.sides[captured.color],
          graveyard: next.sides[captured.color].graveyard.concat([{ ...captured }]),
        },
      },
    };
  }
  const wasPawnDouble = moving.type === 'p' && !move.phase && move.from[1] === move.to[1] && !captured &&
    move.to[0] - move.from[0] === (color === 'w' ? -2 : 2);
  next = {
    ...next,
    castling: chess.reduceCastlingRights(next.castling, moving, move.from, captured, move.to),
    board: chess.simulateMove(next.board, move),
    enPassant: wasPawnDouble ? [(move.from[0] + move.to[0]) / 2, move.from[1]] : null,
    lastMove: { from: [move.from[0], move.from[1]], to: [move.to[0], move.to[1]] },
    ply: next.ply + 1,
    history: next.history.concat([
      {
        color,
        piece: originalType,
        from: chess.coord(move.from[0], move.from[1]),
        to: chess.coord(move.to[0], move.to[1]),
        capture: Boolean(captured),
        captured: captured ? captured.type : null,
        castle: move.castle ?? null,
        promotion,
        enPassant: move.enPassant === true,
      },
    ]),
  };
  // Tangkapan: EN + trigger fokus/mark/leech milik pemain aktif.
  if (captured) {
    next = { ...next, captures: { ...next.captures, [color]: next.captures[color] + 1 } };
    const side = next.sides[color];
    const hero = heroOf(deps, side);
    next = gainEnergy(next, color, hero.captureEnergy === 0 ? 0 : 1 + (hero.captureBonus ?? 0));
    if (side.focusArmed || side.heroPlan?.action === 'focus') {
      next = gainEnergy(next, color, 1);
      next = sideWith(next, color, {
        focusArmed: false,
        heroPlan: side.heroPlan?.action === 'focus' ? null : side.heroPlan,
      });
    }
    const mark = next.effects.marks.find(function (m) {
      return m.pieceId === captured.id && m.owner === color;
    });
    if (mark) {
      next = gainEnergy(next, color, 1);
      next = {
        ...next,
        effects: { ...next.effects, marks: next.effects.marks.filter(function (m) { return m !== mark; }) },
      };
    }
    if (side.leechArmed) {
      const opponent = otherColor(color);
      const before = next.sides[opponent].energy;
      if (before > 0) {
        next = drainEnergy(next, deps, opponent, 1);
        if (next.sides[opponent].energy < before) next = gainEnergy(next, color, 1);
      }
      next = sideWith(next, color, { leechArmed: false });
    }
    if (side.salvageArmed) {
      next = gainEnergy(next, color, 1);
      next = sideWith(next, color, { salvageArmed: false });
    }
    const defender = next.sides[otherColor(color)];
    if (defender.riposteArmed) {
      next = gainEnergy(next, otherColor(color), 1);
      next = sideWith(next, otherColor(color), { riposteArmed: false });
    }
    if (defender.salvageArmed) {
      next = gainEnergy(next, otherColor(color), 1);
      next = sideWith(next, otherColor(color), { salvageArmed: false });
    }
  }
  // Bersihkan hook pola gerak yang sudah terpakai.
  const sideAfter = next.sides[color];
  const clearHooks: Partial<SideState> = {};
  if (sideAfter.knightTargetId === moving.id) clearHooks.knightTargetId = null;
  if (sideAfter.pawnStepId === moving.id) clearHooks.pawnStepId = null;
  if (sideAfter.pawnRaidId === moving.id) clearHooks.pawnRaidId = null;
  if (sideAfter.phaseTargetId === moving.id) {
    clearHooks.phaseTargetId = null;
    clearHooks.phaseJokerId = null;
  }
  if (sideAfter.prismTargetId === moving.id) {
    clearHooks.prismTargetId = null;
    clearHooks.prismType = null;
  }
  if (sideAfter.rookBendId === moving.id) clearHooks.rookBendId = null;
  if (sideAfter.heroPlan?.pieceId === moving.id) clearHooks.heroPlan = null;
  if (Object.keys(clearHooks).length) next = sideWith(next, color, clearHooks);
  if (captured) next = clearPieceEffects(next, captured);
  next = {
    ...next,
    selected: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
  };
  return { state: next, captured };
}

// ---------- Command publik ----------

export function selectPiece(state: PvpState, deps: PvpDeps, row: number, col: number): PvpCommandResult {
  if (!validSquare(row, col)) return fail(state, 'Petak tidak valid.');
  if (busy(state) || state.pendingPromotion || state.activeSkill) {
    return { state, ok: false, message: state.status };
  }
  const piece = state.board[row][col];
  if (!piece || piece.color !== state.turn) {
    return fail(state, 'Pilih bidak ' + sideLabel(state.turn) + ' terlebih dahulu.');
  }
  const moves = legalMovesFrom(state, deps, row, col);
  const status = moves.length > 0 ? 'Pilih petak tujuan yang menyala.' : 'Bidak ini belum memiliki langkah legal.';
  return { state: { ...state, selected: [row, col], status }, ok: true, message: status };
}

export function movePiece(
  state: PvpState,
  deps: PvpDeps,
  from: [number, number],
  to: [number, number],
): PvpCommandResult {
  if (!validSquare(from[0], from[1]) || !validSquare(to[0], to[1])) return fail(state, 'Petak tidak valid.');
  if (state.board[from[0]][from[1]]?.color !== state.turn) return fail(state, 'Bukan giliran bidak ini.');
  if (busy(state) || state.pendingPromotion || state.activeSkill) {
    return { state, ok: false, message: state.status };
  }
  const moves = legalMovesFrom(state, deps, from[0], from[1]);
  const chosen = moves.find(function (move) {
    return move.to[0] === to[0] && move.to[1] === to[1];
  });
  if (!chosen) return fail(state, 'Langkah itu tidak legal untuk bidak ini.');
  const moving = state.board[chosen.from[0]][chosen.from[1]];
  if (moving && moving.type === 'p' && (chosen.to[0] === 0 || chosen.to[0] === 7)) {
    const staged: Move = {
      from: [chosen.from[0], chosen.from[1]],
      to: [chosen.to[0], chosen.to[1]],
    };
    if (chosen.castle) staged.castle = chosen.castle;
    if (chosen.enPassant) staged.enPassant = true;
    if (chosen.phase) staged.phase = true;
    return {
      state: { ...state, pendingPromotion: staged, status: 'Pion mencapai baris terakhir. Pilih bidak promosi.' },
      ok: true,
      message: 'Pilih bidak promosi.',
    };
  }
  const committed = commitMove(state, deps, chosen, state.turn);
  const next = finishTurn(committed.state, deps, committed.captured, true);
  return { state: next, ok: true, message: next.status };
}

export function choosePromotion(state: PvpState, deps: PvpDeps, piece: PromotionChoice): PvpCommandResult {
  const pending = state.pendingPromotion;
  if (!pending || busy(state)) return { state, ok: false, message: state.status };
  if (['q', 'r', 'b', 'n'].indexOf(piece) === -1) return fail(state, 'Pilihan promosi tidak valid.');
  const move: Move = { ...pending, promotion: piece };
  const cleared: PvpState = { ...state, pendingPromotion: null };
  const committed = commitMove(cleared, deps, move, state.turn);
  const next = finishTurn(committed.state, deps, committed.captured, true);
  return { state: next, ok: true, message: next.status };
}

export function playCard(state: PvpState, deps: PvpDeps, slot: number): PvpCommandResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 3) return fail(state, 'Slot kartu tidak valid.');
  const side = activeSide(state);
  const id = side.hand[slot];
  const card = id ? deps.cards[id] : undefined;
  if (!card) return { state, ok: false, message: state.status };
  if (busy(state) || state.pendingPromotion || state.activeSkill) {
    if (state.activeSkill && state.activeSlot === slot) return cancelTarget(state, deps);
    return fail(state, state.activeSkill ? 'Selesaikan target atau batalkan kartu aktif.' : state.status);
  }
  const hero = heroOf(deps, side);
  const playable = canPlayCard(side, card, hero);
  if (!playable.ok) return fail(state, playable.reason);
  if (id === 'reserve' && side.reserveArmed) return fail(state, 'Fokus cadangan sudah menunggu skill berikutnya.');
  if (id === 'surcharge' && state.sides[otherColor(state.turn)].skillSurcharge) return fail(state, 'Pajak mantra sudah terpasang.');
  const cost = currentCardCost(card, hero, side.reserveArmed);
  const discountUsed = side.reserveArmed;
  const paid: PvpState = sideWith(state, state.turn, {
    mana: side.mana - cost,
    reserveArmed: false,
  });
  if (hasTargetCard(id)) {
    const prompt = CARD_TARGET_PROMPTS[id] ?? 'Pilih target.';
    const targeted: PvpState = {
      ...paid,
      activeSkill: id,
      activeSlot: slot,
      activeSkillCost: cost,
      activeSkillDiscounted: discountUsed,
      relayFirstId: null,
      selected: null,
      status: prompt + ' Tekan Batal untuk mengembalikan mana.',
    };
    return { state: targeted, ok: true, message: targeted.status };
  }
  const next = applyInstantCard(sideWith(paid, state.turn, {
    freeCardUsedThisTurn: side.freeCardUsedThisTurn || card.cost === 0,
  }), deps, slot);
  return { state: next, ok: true, message: next.status };
}

function completeTarget(state: PvpState, deps: PvpDeps, status: string, selected: Square | null): PvpState {
  const slot = state.activeSlot;
  if (slot == null) return { ...state, status };
  const card = state.activeSkill ? deps.cards[state.activeSkill] : undefined;
  state = sideWith(state, state.turn, {
    freeCardUsedThisTurn: activeSide(state).freeCardUsedThisTurn || card?.cost === 0,
  });
  const cleared: PvpState = {
    ...state,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected,
    status,
  };
  return replaceSlot(cleared, deps, slot);
}

export function resolveTarget(state: PvpState, deps: PvpDeps, row: number, col: number): PvpCommandResult {
  if (!validSquare(row, col)) return fail(state, 'Petak tidak valid.');
  if (busy(state) || state.pendingPromotion) return { state, ok: false, message: state.status };
  const id = state.activeSkill;
  if (!id) return { state, ok: false, message: state.status };
  if (id.indexOf('hero:') === 0) return resolveHeroTarget(state, deps, row, col);
  if (state.activeSlot == null) return { state, ok: false, message: state.status };
  const color = state.turn;
  const side = activeSide(state);
  const chess = deps.chess;
  const piece = state.board[row][col];

  if (id === 'phoenix') {
    const graveyard = side.graveyard;
    let best: Piece | null = null;
    for (const p of graveyard) {
      if (p.type !== 'q' && (!best || PIECE_VALUES[p.type] > PIECE_VALUES[best.type])) best = p;
    }
    if (!best) return fail(state, 'Belum ada bidak non-ratu yang gugur untuk dibangkitkan.');
    if (piece) return fail(state, 'Pilih petak kosong di dua baris awal.');
    const homeRows = color === 'w' ? [6, 7] : [0, 1];
    if (homeRows.indexOf(row) === -1) return fail(state, 'Pilih petak kosong di dua baris awal.');
    const placed = state.board.map(function (boardRow) { return boardRow.slice(); });
    placed[row][col] = { ...best };
    if (chess.isInCheck(placed, color) && legalMoves({ ...state, board: placed }, deps, color).length === 0) {
      return fail(state, 'Penempatan itu menghilangkan semua langkah untuk menyelamatkan raja.');
    }
    const nextSide: SideState = {
      ...side,
      graveyard: side.graveyard.filter(function (p) { return p !== best; }),
    };
    const done = completeTarget(
      { ...state, board: placed, sides: { ...state.sides, [color]: nextSide } },
      deps,
      PIECE_NAMES[best.type] + ' bangkit di ' + chess.coord(row, col) + '.',
      null,
    );
    return { state: done, ok: true, message: done.status };
  }
  if (id === 'edict') {
    const opponent = otherColor(color);
    if (!piece || piece.color !== opponent || piece.type === 'k' || piece.type === 'q') {
      return fail(state, 'Pilih satu bidak lawan selain raja dan ratu.');
    }
    const cleared = state.board.map(function (boardRow) { return boardRow.slice(); });
    cleared[row][col] = null;
    if (chess.isInCheck(cleared, color) && legalMoves({ ...state, board: cleared }, deps, color).length === 0) {
      return fail(state, 'Penghapusan itu menghilangkan semua langkah untuk menyelamatkan raja.');
    }
    let next: PvpState = {
      ...state, board: cleared,
      castling: chess.reduceCastlingRights(state.castling, piece, [row, col], piece, [row, col]),
      enPassant: piece.type === 'p' && state.enPassant?.[1] === col &&
        row === state.enPassant[0] + (piece.color === 'w' ? -1 : 1) ? null : state.enPassant,
    };
    next = clearPieceEffects(next, piece);
    const done = completeTarget(next, deps, PIECE_NAMES[piece.type] + ' lawan dihapus. Ini bukan tangkapan.', null);
    const outcome = checkOutcome({ ...done, turn: opponent }, deps);
    const final = outcome.state.gameOver ? finishPvpTurn(outcome.state) : done;
    return { state: final, ok: true, message: final.status };
  }
  if (id === 'relay') {
    if (!state.relayFirstId) {
      if (!piece || piece.color !== color || piece.type === 'k') {
        return fail(state, 'Pilih bidak sendiri selain raja.');
      }
      return {
        state: { ...state, relayFirstId: piece.id, selected: [row, col], status: 'Pilih bidak kedua untuk ditukar.' },
        ok: true,
        message: state.status,
      };
    }
    const from = findPieceSquare(state.board, state.relayFirstId);
    if (!from || !piece || piece.color !== color || piece.type === 'k' || piece.id === state.relayFirstId) {
      return fail(state, 'Pilih bidak kedua yang berbeda dari raja.');
    }
    const first = state.board[from[0]][from[1]];
    if (!first) return fail(state, 'Pilih bidak kedua yang berbeda dari raja.');
    const swapped = state.board.map(function (boardRow) { return boardRow.slice(); });
    swapped[from[0]][from[1]] = piece;
    swapped[row][col] = first;
    if (chess.isInCheck(swapped, color)) {
      return fail(state, 'Pertukaran itu membiarkan raja dalam skak.');
    }
    let castling = chess.reduceCastlingRights(state.castling, first, from, null, [row, col]);
    castling = chess.reduceCastlingRights(castling, piece, [row, col], null, from);
    const swappedState: PvpState = {
      ...state,
      board: swapped,
      castling,
      enPassant: null,
      lastMove: { from: [from[0], from[1]], to: [row, col] },
      ply: state.ply + 1,
      history: state.history.concat([
        { color, piece: first.type, from: chess.coord(from[0], from[1]), to: chess.coord(row, col), capture: false, captured: null, castle: null, promotion: null, note: 'Relay bidak' },
      ]),
    };
    const done = completeTarget(swappedState, deps, 'Relay selesai. Lawan bergerak.', null);
    const final = finishTurn(done, deps, null, false);
    return { state: final, ok: true, message: final.status };
  }
  if (id === 'blockade') {
    if (piece) return fail(state, 'Blokade hanya dapat menutup petak kosong.');
    const next: PvpState = {
      ...state,
      effects: {
        ...state.effects,
        blockades: state.effects.blockades.concat([{ owner: color, square: [row, col], turns: 2 }]),
      },
    };
    const done = completeTarget(next, deps, 'Blokade dipasang di ' + chess.coord(row, col) + ' selama 2 balasan.', null);
    return { state: done, ok: true, message: done.status };
  }
  const enemyTarget = ['mark', 'stagger', 'snare', 'pawnMark', 'pawnStagger'].indexOf(id) !== -1;
  const targetColor = enemyTarget ? otherColor(color) : color;
  if (!piece || piece.color !== targetColor) {
    return fail(state, enemyTarget ? 'Pilih bidak lawan selain raja.' : 'Pilih bidak sendiri yang sesuai.');
  }
  if (piece.type === 'k' && ['lancer', 'ward', 'phase', 'fold', 'mark', 'stagger', 'snare'].indexOf(id) !== -1) {
    return fail(state, 'Skill ini tidak menargetkan raja.');
  }
  if (['pawnGuard', 'pawnMark', 'pawnStagger'].indexOf(id) !== -1 && piece.type !== 'p') {
    return fail(state, 'Kartu gratis ini hanya menargetkan pion.');
  }
  if (id === 'pawnstep' || id === 'pawnraid') {
    if (piece.type !== 'p') return fail(state, 'Skill ini hanya menargetkan pion.');
  }
  if (id === 'prism' && piece.type !== 'b' && piece.type !== 'r') {
    return fail(state, 'Prisma gerak hanya menargetkan gajah atau benteng.');
  }
  if (id === 'rookbend' && piece.type !== 'r') return fail(state, 'Belok benteng hanya menargetkan benteng.');
  if (id === 'sacrifice') {
    if (piece.type !== 'p') return fail(state, 'Tumbal pion hanya dapat mengorbankan pion.');
    const removed = state.board.map(function (boardRow) { return boardRow.slice(); });
    removed[row][col] = null;
    if (chess.isInCheck(removed, color)) return fail(state, 'Pion itu menjaga raja dari skak.');
    const sacrificed: PvpState = {
      ...state,
      board: removed,
      enPassant: null,
      lastMove: null,
      ply: state.ply + 1,
      history: state.history.concat([
        { color, piece: 'p', from: chess.coord(row, col), to: chess.coord(row, col), capture: false, captured: null, castle: null, promotion: null, note: 'Tumbal pion: +3 EN' },
      ]),
    };
    const after = gainEnergy(clearPieceEffects(sacrificed, piece), color, 3);
    const done = completeTarget(after, deps, 'Pion dikorbankan. Pulih 3 EN, lalu giliran lawan.', null);
    const final = finishTurn(done, deps, null, false);
    return { state: final, ok: true, message: final.status };
  }
  // Pasang hook / efek.
  let next: PvpState = state;
  if (id === 'lancer') next = sideWith(next, color, { knightTargetId: piece.id });
  if (id === 'ward' || id === 'pawnGuard') {
    next = { ...next, effects: { ...next.effects, wards: next.effects.wards.concat([{ owner: color, pieceId: piece.id, turns: 2 }]) } };
  }
  if (id === 'pawnstep') next = sideWith(next, color, {
    pawnStepId: piece.id,
    heroPlan: side.heroPlan?.action === 'pawnstep' ? null : side.heroPlan,
  });
  if (id === 'mark' || id === 'pawnMark') {
    next = { ...next, effects: { ...next.effects, marks: next.effects.marks.concat([{ owner: color, pieceId: piece.id }]) } };
  }
  if (id === 'phase' || id === 'fold') next = sideWith(next, color, {
    phaseTargetId: piece.id,
    phaseJokerId: id === 'fold' ? piece.id : null,
    heroPlan: side.heroPlan?.action === 'phase' || side.heroPlan?.action === 'fold' ? null : side.heroPlan,
  });
  if (id === 'prism') next = sideWith(next, color, { prismTargetId: piece.id, prismType: piece.type === 'b' ? 'r' : 'b' });
  if (id === 'pawnraid') next = sideWith(next, color, { pawnRaidId: piece.id });
  if (id === 'rookbend') next = sideWith(next, color, { rookBendId: piece.id });
  if (id === 'stagger' || id === 'pawnStagger') {
    next = { ...next, effects: { ...next.effects, staggers: next.effects.staggers.concat([{ owner: color, pieceId: piece.id, turns: 1 }]) } };
  }
  if (id === 'snare') {
    next = { ...next, effects: { ...next.effects, snares: next.effects.snares.concat([{ owner: color, pieceId: piece.id, turns: 2 }]) } };
  }
  const wantsMoveNow = ['lancer', 'pawnstep', 'phase', 'fold', 'prism', 'pawnraid', 'rookbend'].indexOf(id) !== -1;
  const card = deps.cards[id];
  const message = (card ? card.name : id) + ' siap di ' + chess.coord(row, col) + '.';
  const done = completeTarget(next, deps, message, wantsMoveNow ? [row, col] : null);
  return { state: done, ok: true, message: done.status };
}

function beginHeroTarget(state: PvpState, targetId: string, prompt: string): PvpState {
  return {
    ...state,
    activeSkill: 'hero:' + targetId,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    selected: null,
    status: prompt + ' Tekan Esc untuk batal.',
  };
}

function resolveHeroTarget(state: PvpState, deps: PvpDeps, row: number, col: number): PvpCommandResult {
  const id = state.activeSkill ?? '';
  const color = state.turn;
  const piece = state.board[row][col];
  const ultimate = id.indexOf('hero:ultimate:') === 0;
  const cost = heroActionCost(state, ultimate);
  if (activeSide(state).energy < cost) return fail(state, 'EN belum cukup untuk target hero.');
  const failTarget = function (message: string): PvpCommandResult {
    return { state: { ...state, status: message }, ok: false, message };
  };
  const doneHero = function (next: PvpState): PvpCommandResult {
    return { state: next, ok: true, message: next.status };
  };
  const completeHero = function (next: PvpState, status: string, selected: Square | null): PvpState {
    const paid = sideWith(next, color, {
      energy: next.sides[color].energy - cost,
      skillSurcharge: ultimate ? next.sides[color].skillSurcharge : 0,
    });
    return { ...paid, activeSkill: null, activeSlot: null, selected, status };
  };
  if (id === 'hero:skill:blockade' || id === 'hero:ultimate:citadel') {
    if (piece) return failTarget('Blokade hanya dapat dipasang pada petak kosong.');
    const offsets: Square[] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    const squares = id === 'hero:ultimate:citadel'
      ? offsets.map(function (offset) { return [row + offset[0], col + offset[1]] as Square; })
        .filter(function (square) { return square[0] >= 0 && square[0] < 8 && square[1] >= 0 && square[1] < 8 && !state.board[square[0]][square[1]]; })
      : [[row, col] as Square];
    const blocked: PvpState = {
      ...state,
      effects: {
        ...state.effects,
        blockades: state.effects.blockades.concat(squares.map(function (square) {
          return { owner: color, square, turns: 2, hero: true };
        })),
      },
    };
    return doneHero(completeHero(blocked, 'Blokade dipasang selama 2 balasan.', null));
  }
  if (id === 'hero:skill:phase' || id === 'hero:ultimate:fold') {
    if (!piece || piece.color !== color || piece.type === 'k') return failTarget('Pilih bidak sendiri selain raja.');
    const next = sideWith(state, color, {
      phaseTargetId: null, phaseJokerId: null,
      heroPlan: { action: id === 'hero:ultimate:fold' ? 'fold' : 'phase', pieceId: piece.id },
    });
    return doneHero(completeHero(next, 'Teleport siap untuk ' + PIECE_NAMES[piece.type] + '.', null));
  }
  if (id === 'hero:skill:ward') {
    if (!piece || piece.color !== color || piece.type === 'k') return failTarget('Pilih bidak sendiri selain raja.');
    const next: PvpState = {
      ...state,
      effects: { ...state.effects, wards: state.effects.wards.concat([{ owner: color, pieceId: piece.id, turns: 2, hero: true }]) },
    };
    return doneHero(completeHero(next, 'Perisai menjaga ' + PIECE_NAMES[piece.type] + ' selama 2 balasan.', null));
  }
  if (id === 'hero:skill:pawnstep') {
    if (!piece || piece.color !== color || piece.type !== 'p') return failTarget('Pilih pion sendiri.');
    return doneHero(completeHero(sideWith(state, color, {
      pawnStepId: null, heroPlan: { action: 'pawnstep', pieceId: piece.id },
    }), 'Langkah ganda siap untuk pion.', null));
  }
  if (id === 'hero:skill:snare') {
    if (!piece || piece.color !== otherColor(color) || piece.type === 'k') return failTarget('Pilih bidak lawan selain raja.');
    const next: PvpState = {
      ...state,
      effects: { ...state.effects, snares: state.effects.snares.concat([{ owner: color, pieceId: piece.id, turns: 2, hero: true }]) },
    };
    return doneHero(completeHero(next, 'Bidak lawan terjerat selama 2 balasan.', null));
  }
  if (id === 'hero:ultimate:smite') {
    if (!piece || piece.color !== otherColor(color) || piece.type === 'k' || piece.type === 'q') {
      return failTarget('Pilih bidak lawan selain raja dan ratu.');
    }
    const cleared = state.board.map(function (boardRow) { return boardRow.slice(); });
    cleared[row][col] = null;
    if (deps.chess.isInCheck(cleared, color) && legalMoves({ ...state, board: cleared }, deps, color).length === 0) {
      return fail(state, 'Penghapusan itu menghilangkan semua langkah untuk menyelamatkan raja.');
    }
    let next: PvpState = {
      ...state, board: cleared,
      castling: deps.chess.reduceCastlingRights(state.castling, piece, [row, col], piece, [row, col]),
      enPassant: piece.type === 'p' && state.enPassant?.[1] === col &&
        row === state.enPassant[0] + (piece.color === 'w' ? -1 : 1) ? null : state.enPassant,
    };
    next = clearPieceEffects(next, piece);
    const done = completeHero(next, PIECE_NAMES[piece.type] + ' lawan dihapus tanpa dihitung tangkapan.', null);
    const outcome = checkOutcome({ ...done, turn: otherColor(color) }, deps);
    return doneHero(outcome.state.gameOver ? finishPvpTurn(outcome.state) : done);
  }
  return { state, ok: false, message: state.status };
}

export function useHeroSkill(state: PvpState, deps: PvpDeps): PvpCommandResult {
  if (state.activeSkill && state.activeSkill.indexOf('hero:skill:') === 0) return cancelTarget(state, deps);
  if (busy(state) || state.pendingPromotion || state.activeSkill) return fail(state, state.activeSkill ? 'Selesaikan target aktif atau tekan Esc.' : state.status);
  const side = activeSide(state);
  const hero = heroOf(deps, side);
  const cost = heroActionCost(state, false);
  if (side.energy < cost) return fail(state, 'Skill butuh ' + cost + ' EN; energi sekarang ' + side.energy + ' / 5.');
  if (hero.skillAction === 'focus') {
    const status = 'Skill siap: tangkapan berikutnya +1 EN.';
    const next = sideWith(state, state.turn, {
      energy: side.energy - cost, skillSurcharge: 0, focusArmed: false,
      heroPlan: { action: 'focus', pieceId: null },
    });
    return { state: { ...next, status }, ok: true, message: status };
  }
  const prompts: Record<string, string> = {
    phase: 'Pilih bidak sendiri selain raja untuk berpindah.',
    ward: 'Pilih bidak sendiri selain raja untuk dilindungi.',
    pawnstep: 'Pilih pion sendiri.',
    snare: 'Pilih bidak lawan selain raja untuk dijerat.',
    blockade: 'Pilih petak kosong untuk diblokade.',
  };
  const target = prompts[hero.skillAction];
  if (!target) return { state, ok: false, message: state.status };
  const next = beginHeroTarget(state, 'skill:' + hero.skillAction, target);
  return { state: next, ok: true, message: next.status };
}

export function useHeroUltimate(state: PvpState, deps: PvpDeps): PvpCommandResult {
  if (state.activeSkill && state.activeSkill.indexOf('hero:ultimate:') === 0) return cancelTarget(state, deps);
  if (busy(state) || state.pendingPromotion || state.activeSkill) return fail(state, state.activeSkill ? 'Selesaikan target aktif atau tekan Esc.' : state.status);
  const side = activeSide(state);
  const hero = heroOf(deps, side);
  if (side.energy < HERO_ULTIMATE_COST) return fail(state, 'Ultimate butuh ' + HERO_ULTIMATE_COST + ' EN; energi sekarang ' + side.energy + ' / 5.');
  const color = state.turn;
  if (hero.ultimateAction === 'aegis') {
    const next = sideWith(state, color, { energy: Math.max(0, side.energy - HERO_ULTIMATE_COST) });
    return {
      state: { ...next, effects: { ...next.effects, aegis: next.effects.aegis.concat([{ color, turns: 1, hero: true }]) }, status: 'Mata Air melindungi semua bidak dari satu balasan.' },
      ok: true,
      message: 'Mata Air melindungi semua bidak dari satu balasan.',
    };
  }
  if (hero.ultimateAction === 'pawnrush') {
    const pawns = state.board.flat().filter(function (p) { return p != null && p.color === color && p.type === 'p'; }).map(function (p) { return (p as Piece).id; });
    if (!pawns.length) return fail(state, 'Tidak ada pion untuk Pawai Bidak.');
    const next = sideWith(state, color, { energy: Math.max(0, side.energy - HERO_ULTIMATE_COST), heroPawnRushIds: pawns });
    const status = 'Pawai Bidak siap untuk semua pion.';
    return { state: { ...next, status }, ok: true, message: status };
  }
  if (hero.ultimateAction === 'skip') {
    const next = sideWith(state, color, { energy: Math.max(0, side.energy - HERO_ULTIMATE_COST), skipNextOpponentReply: true });
    const status = 'Saat Beku siap: balasan lawan dilewati.';
    return { state: { ...next, status }, ok: true, message: status };
  }
  const prompts: Record<string, string> = {
    fold: 'Pilih bidak sendiri selain raja untuk teleport.',
    smite: 'Pilih bidak lawan selain raja dan ratu untuk dihapus.',
    citadel: 'Pilih petak kosong sebagai pusat blokade silang.',
  };
  const target = prompts[hero.ultimateAction];
  if (!target) return { state, ok: false, message: state.status };
  const next = beginHeroTarget(state, 'ultimate:' + hero.ultimateAction, target);
  return { state: next, ok: true, message: next.status };
}

export function cancelTarget(state: PvpState, _deps: PvpDeps): PvpCommandResult {
  if (!state.activeSkill) return { state, ok: false, message: state.status };
  if (state.activeSkill.indexOf('hero:') === 0) {
    return {
      state: { ...state, activeSkill: null, selected: null, status: 'Target hero dibatalkan. Tidak ada EN yang terpakai.' },
      ok: true,
      message: 'Target dibatalkan.',
    };
  }
  if (state.activeSlot == null) return { state, ok: false, message: state.status };
  const side = activeSide(state);
  const refund = Math.min(MANA_CAP, side.mana + state.activeSkillCost);
  let next: PvpState = sideWith(state, state.turn, { mana: refund });
  if (state.activeSkillDiscounted) next = sideWith(next, state.turn, { reserveArmed: true });
  next = {
    ...next,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected: null,
    status: 'Kartu dibatalkan. Mana dikembalikan.',
  };
  return { state: next, ok: true, message: next.status };
}

export function rerollHand(state: PvpState, deps: PvpDeps): PvpCommandResult {
  const side = activeSide(state);
  if (busy(state) || state.pendingPromotion || state.activeSkill) return { state, ok: false, message: state.status };
  const limit = 2 + side.bonusRerolls;
  if (side.rollsThisTurn >= limit) return fail(state, 'Jatah putar ulang giliran ini sudah habis.');
  const cost = side.rollsThisTurn === 0 ? 0 : 1;
  if (side.energy < cost) return fail(state, 'Putar ulang membutuhkan 1 EN; energimu belum cukup.');
  const previous = side.hand.slice();
  const hand = makePvpHand(previous, deps, side.deckCardIds);
  const next: PvpState = sideWith(state, state.turn, {
    energy: side.energy - cost,
    rollsThisTurn: side.rollsThisTurn + 1,
    hand,
  });
  return {
    state: { ...next, dealtSlot: 'all', status: 'Tiga kartu baru dibagikan.' },
    ok: true,
    message: 'Tangan baru dibagikan.',
  };
}

function equalGameplay(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(function (key) { return equalGameplay(left[key], right[key]); });
}

function sameAnchorForUndo(state: PvpState): boolean {
  const start = state.anchor;
  if (!start || state.activeSkill || state.pendingPromotion) return false;
  return (Object.keys(start) as (keyof typeof start)[]).every(function (key) {
    return key === 'status' || key === 'selected' || equalGameplay(state[key], start[key]);
  });
}

export function canUndo(state: PvpState): boolean {
  return state.past.length > 0 && sameAnchorForUndo(state);
}

export function undoTurn(state: PvpState): PvpCommandResult {
  if (!canUndo(state)) return { state, ok: false, message: state.status };
  const snapshot = state.past[state.past.length - 1];
  const restored = restorePvpSnapshot(state, snapshot);
  const next: PvpState = {
    ...restored,
    past: state.past.slice(0, -1),
    status: 'Giliran terakhir dibatalkan.',
  };
  return { state: { ...next, anchor: snapshotPvp(next) }, ok: true, message: 'Giliran dibatalkan.' };
}

/** Restart from standard chess setup, preserving both chosen heroes and decks. */
export function restartPvp(state: PvpState, deps: PvpDeps): PvpCommandResult {
  const fresh = createInitialPvp({
    whiteHeroId: state.sides.w.heroId,
    blackHeroId: state.sides.b.heroId,
    whiteDeck: state.sides.w.deckCardIds,
    blackDeck: state.sides.b.deckCardIds,
    board: deps.chess.initialBoard(),
  }, deps);
  return { state: fresh, ok: true, message: fresh.status };
}

export function tapSquare(state: PvpState, deps: PvpDeps, row: number, col: number): PvpCommandResult {
  if (!validSquare(row, col)) return fail(state, 'Petak tidak valid.');
  if (busy(state) || state.pendingPromotion) return { state, ok: false, message: state.status };
  if (state.activeSkill) return resolveTarget(state, deps, row, col);
  const piece = state.board[row][col];
  if (state.selected) {
    const moves = legalMovesFrom(state, deps, state.selected[0], state.selected[1]);
    const chosen = moves.find(function (move) { return move.to[0] === row && move.to[1] === col; });
    if (chosen) return movePiece(state, deps, [chosen.from[0], chosen.from[1]], [row, col]);
  }
  if (piece && piece.color === state.turn) {
    if (state.selected && state.selected[0] === row && state.selected[1] === col) {
      return { state: { ...state, selected: null, status: 'Pilihan dibatalkan.' }, ok: true, message: 'Pilihan dibatalkan.' };
    }
    return selectPiece(state, deps, row, col);
  }
  if (state.selected) return fail(state, 'Petak itu tidak legal.');
  return fail(state, 'Pilih bidak ' + sideLabel(state.turn) + ' terlebih dahulu.');
}

// State duel PvP 1v1 simetris: kedua pemain punya hero, deck, EN, mana, dan
// tangan kartu. Berbeda dari domain/battle (asimetris putih=manusia vs hitam=AI),
// di sini kedua warna identik dan giliran bergantian antar pemain manusia.
//
// Tetap mematuhi ARCHITECTURE.md: tanpa DOM/global; random lewat RandomSource;
// catur lewat ChessRules (adaptor yang sudah simetris per warna).

import type {
  CardDef,
  CastlingRights,
  ChessRules,
  HeroDef,
  RandomSource,
} from '../battle/state.ts';
export type { CardDef, HeroDef } from '../battle/state.ts';

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionChoice = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  type: PieceType;
  color: Color;
  id: string;
}

export type Board = (Piece | null)[][];
export type Square = [number, number];

export interface Move {
  from: Square;
  to: Square;
  promotion?: PromotionChoice;
  castle?: 'k' | 'q';
  enPassant?: boolean;
  phase?: boolean;
}

export {
  ENERGY_CAP as EN_CAP,
  HERO_MANA_CAP as MANA_CAP,
  HERO_SKILL_ENERGY_COST as HERO_SKILL_COST,
  HERO_ULTIMATE_ENERGY_COST as HERO_ULTIMATE_COST,
} from '../battle/state.ts';

/** Resource + flag tertunda milik SATU pemain (perspektif pemiliknya). */
export interface SideState {
  heroId: string;
  deckCardIds: string[];
  energy: number;
  mana: number;
  hand: [string, string, string];
  rollsThisTurn: number;
  bonusRerolls: number;
  freeCardUsedThisTurn: boolean;
  /** Surcharge yang dibayar saat pemain ini memakai skill (kartu Pajak Mantra). */
  skillSurcharge: number;
  nilaDrainBlocked: boolean;
  /** Rencana hero dipisahkan dari hook kartu agar Penawar tidak menghapus kartu. */
  heroPlan: { action: 'focus' | 'phase' | 'fold' | 'pawnstep'; pieceId: string | null } | null;
  // --- Flag sekali pakai (armed) ---
  tempoArmed: boolean;
  focusArmed: boolean;
  pierceArmed: boolean;
  shockArmed: boolean;
  leechArmed: boolean;
  parryArmed: boolean;
  riposteArmed: boolean;
  reserveArmed: boolean;
  quietArmed: boolean;
  pawnBreathArmed: boolean;
  pawnPulseArmed: boolean;
  lastLaughArmed: boolean;
  salvageArmed: boolean;
  skipNextOpponentReply: boolean;
  // --- Hook pola gerak (target bidak milik pemain ini) ---
  knightTargetId: string | null;
  phaseTargetId: string | null;
  phaseJokerId: string | null;
  prismTargetId: string | null;
  prismType: 'b' | 'r' | null;
  pawnStepId: string | null;
  pawnRaidId: string | null;
  rookBendId: string | null;
  heroPawnRushIds: string[] | null;
  /** Bidak milik pemain ini yang gugur (untuk kebangkitan Phoenix). */
  graveyard: Piece[];
}

/** Efek bertarget yang hidup di papan dan berlaku lintas sisi. */
export interface TimedEffect {
  /** Pemilik efek (sisi yang memasangnya). */
  owner: Color;
  /** Sisa balasan lawan sebelum kedaluwarsa. */
  turns: number;
  hero?: boolean;
}

export interface WardEffect extends TimedEffect {
  pieceId: string;
}
export interface SnareEffect extends TimedEffect {
  pieceId: string;
}
export interface StaggerEffect extends TimedEffect {
  pieceId: string;
}
export interface BlockadeEffect extends TimedEffect {
  square: Square;
}
export interface MarkEffect {
  pieceId: string;
  owner: Color;
}
export interface AegisEffect {
  color: Color;
  turns: number;
  hero?: boolean;
}

export interface PvpEffects {
  /** Bidak yang dilindungi (tak bisa ditangkap). */
  wards: WardEffect[];
  /** Bidak yang terjerat (tak bisa bergerak). */
  snares: SnareEffect[];
  /** Bidak yang digentarkan (tak bisa menangkap) — satu balasan. */
  staggers: StaggerEffect[];
  /** Petak yang diblokade lawan pemilik (lawan tak bisa mendarat). */
  blockades: BlockadeEffect[];
  /** Bidak yang ditandai: menangkapnya memberi +1 EN ke pemilik. */
  marks: MarkEffect[];
  /** Sisi yang seluruh bidaknya kebal tangkapan (Mata Air). */
  aegis: AegisEffect[];
}

export interface HistoryEntry {
  color: Color;
  piece: PieceType;
  from: string;
  to: string;
  capture: boolean;
  captured?: PieceType | null;
  castle?: 'k' | 'q' | null;
  promotion?: PromotionChoice | null;
  enPassant?: boolean;
  note?: string;
}

export interface PvpDeps {
  chess: ChessRules;
  rng: RandomSource;
  cards: Record<string, CardDef>;
  heroes: Record<string, HeroDef>;
}

export interface PvpState {
  board: Board;
  turn: Color;
  castling: CastlingRights;
  enPassant: Square | null;
  sides: Record<Color, SideState>;
  effects: PvpEffects;
  /** Slot kartu yang baru dibagikan ('all' = seluruh tangan); hook animasi UI. */
  dealtSlot: number | 'all' | null;
  selected: Square | null;
  pendingPromotion: Move | null;
  activeSkill: string | null;
  activeSlot: number | null;
  activeSkillCost: number;
  activeSkillDiscounted: boolean;
  relayFirstId: string | null;
  lastMove: { from: Square; to: Square } | null;
  history: HistoryEntry[];
  captures: Record<Color, number>;
  ply: number;
  turnNo: number;
  gameOver: boolean;
  winner: Color | null;
  status: string;
  past: PvpSnapshot[];
  anchor: PvpSnapshot | null;
}

export type PvpSnapshot = Omit<PvpState, 'past' | 'anchor' | 'dealtSlot'>;

export interface PvpCommandResult {
  state: PvpState;
  ok: boolean;
  message: string;
}

export function otherColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

function cloneBoard(board: Board): Board {
  return board.map(function (row) {
    return row.map(function (piece) {
      return piece ? { type: piece.type, color: piece.color, id: piece.id } : null;
    });
  });
}

function cloneSquare(square: Square): Square {
  return [square[0], square[1]];
}

function cloneSide(side: SideState): SideState {
  return {
    ...side,
    deckCardIds: side.deckCardIds.slice(),
    hand: [side.hand[0], side.hand[1], side.hand[2]],
    heroPlan: side.heroPlan ? { ...side.heroPlan } : null,
    heroPawnRushIds: side.heroPawnRushIds ? side.heroPawnRushIds.slice() : null,
    graveyard: side.graveyard.map(function (piece) { return { ...piece }; }),
  };
}

function cloneCore(core: PvpSnapshot): PvpSnapshot {
  return {
    ...core,
    board: cloneBoard(core.board),
    castling: { w: { ...core.castling.w }, b: { ...core.castling.b } },
    enPassant: core.enPassant ? cloneSquare(core.enPassant) : null,
    sides: { w: cloneSide(core.sides.w), b: cloneSide(core.sides.b) },
    effects: {
      wards: core.effects.wards.map(function (effect) { return { ...effect }; }),
      snares: core.effects.snares.map(function (effect) { return { ...effect }; }),
      staggers: core.effects.staggers.map(function (effect) { return { ...effect }; }),
      blockades: core.effects.blockades.map(function (effect) { return { ...effect, square: cloneSquare(effect.square) }; }),
      marks: core.effects.marks.map(function (effect) { return { ...effect }; }),
      aegis: core.effects.aegis.map(function (effect) { return { ...effect }; }),
    },
    selected: core.selected ? cloneSquare(core.selected) : null,
    pendingPromotion: core.pendingPromotion
      ? { ...core.pendingPromotion, from: cloneSquare(core.pendingPromotion.from), to: cloneSquare(core.pendingPromotion.to) }
      : null,
    lastMove: core.lastMove ? { from: cloneSquare(core.lastMove.from), to: cloneSquare(core.lastMove.to) } : null,
    history: core.history.map(function (entry) { return { ...entry }; }),
    captures: { ...core.captures },
  };
}

export function clonePvpState(state: PvpState): PvpState {
  return {
    ...snapshotPvp(state),
    dealtSlot: state.dealtSlot,
    past: state.past.map(cloneCore),
    anchor: state.anchor ? cloneCore(state.anchor) : null,
  };
}

export function snapshotPvp(state: PvpState): PvpSnapshot {
  const { past: _past, anchor: _anchor, dealtSlot: _dealtSlot, ...core } = state;
  return cloneCore(core);
}

function restoreSnapshot(state: PvpState, snapshot: PvpSnapshot): PvpState {
  return { ...cloneCore(snapshot), dealtSlot: null, past: state.past, anchor: state.anchor };
}

export interface InitialPvpInput {
  whiteHeroId: string;
  blackHeroId: string;
  whiteDeck: string[];
  blackDeck: string[];
  board: Board;
}

function drawDeckHand(
  deps: { rng: RandomSource; cards: Record<string, CardDef> },
  deckCardIds: string[],
  excluded: string[],
): [string, string, string] {
  const options = deckCardIds
    .map(function (id) {
      return deps.cards[id];
    })
    .filter(function (card): card is CardDef {
      return card !== undefined && excluded.indexOf(card.id) === -1;
    });
  const hand: string[] = [];
  const blocked = excluded.slice();
  while (hand.length < 3 && options.length > 0) {
    const pool = options.filter(function (card) {
      return blocked.indexOf(card.id) === -1;
    });
    const totalWeight = pool.reduce(function (total, card) {
      return total + (card.weight ?? 1);
    }, 0);
    let roll = deps.rng.next() * totalWeight;
    let chosen = pool[0];
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight ?? 1;
      if (roll < 0) {
        chosen = pool[i];
        break;
      }
    }
    if (!chosen) break;
    hand.push(chosen.id);
    blocked.push(chosen.id);
  }
  return [hand[0] ?? '', hand[1] ?? '', hand[2] ?? ''];
}

function emptySide(heroId: string, deckCardIds: string[], hand: [string, string, string], energy: number): SideState {
  return {
    heroId,
    deckCardIds: deckCardIds.slice(),
    energy,
    mana: 0,
    hand: [hand[0], hand[1], hand[2]],
    rollsThisTurn: 0,
    bonusRerolls: 0,
    freeCardUsedThisTurn: false,
    skillSurcharge: 0,
    nilaDrainBlocked: false,
    heroPlan: null,
    tempoArmed: false,
    focusArmed: false,
    pierceArmed: false,
    shockArmed: false,
    leechArmed: false,
    parryArmed: false,
    riposteArmed: false,
    reserveArmed: false,
    quietArmed: false,
    pawnBreathArmed: false,
    pawnPulseArmed: false,
    lastLaughArmed: false,
    salvageArmed: false,
    skipNextOpponentReply: false,
    knightTargetId: null,
    phaseTargetId: null,
    phaseJokerId: null,
    prismTargetId: null,
    prismType: null,
    pawnStepId: null,
    pawnRaidId: null,
    rookBendId: null,
    heroPawnRushIds: null,
    graveyard: [],
  };
}

export function createInitialPvp(
  input: InitialPvpInput,
  deps: { rng: RandomSource; cards: Record<string, CardDef>; heroes: Record<string, HeroDef> },
): PvpState {
  const whiteHero = deps.heroes[input.whiteHeroId];
  const blackHero = deps.heroes[input.blackHeroId];
  const whiteHand = drawDeckHand(deps, input.whiteDeck, []);
  const blackHand = drawDeckHand(deps, input.blackDeck, []);
  const effects: PvpEffects = { wards: [], snares: [], staggers: [], blockades: [], marks: [], aegis: [] };
  const state: PvpState = {
    board: cloneBoard(input.board),
    turn: 'w',
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    sides: {
      w: emptySide(input.whiteHeroId, input.whiteDeck, whiteHand, whiteHero ? whiteHero.startEnergy : 3),
      b: emptySide(input.blackHeroId, input.blackDeck, blackHand, blackHero ? blackHero.startEnergy : 3),
    },
    effects,
    dealtSlot: null,
    selected: null,
    pendingPromotion: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    lastMove: null,
    history: [],
    captures: { w: 0, b: 0 },
    ply: 0,
    turnNo: 1,
    gameOver: false,
    winner: null,
    status: 'Giliran putih. Pilih langkah pembuka.',
    past: [],
    anchor: null,
  };
  state.anchor = snapshotPvp(state);
  return state;
}

/** Ambil sisi aktif (pemilik giliran). */
export function activeSide(state: PvpState): SideState {
  return state.sides[state.turn];
}

/** Ambil sisi lawan. */
export function inactiveSide(state: PvpState): SideState {
  return state.sides[otherColor(state.turn)];
}

export { restoreSnapshot as restorePvpSnapshot };

// State duel PvP 1v1: dua pemain simetris dengan tangan kartu, mana, EN,
// hero, dan efek warna-relatif. Mesin catur murni di src/domain/chess.
//
// Berbeda dari domain battle PvE (putih=manusia, hitam=boss): di sini kedua
// sisi punya resource yang sama dan semua aturan diberi parameter warna.
// Kedua klien menjalankan engine ini dengan urutan command yang sama sehingga
// state identik; satu-satunya sumber acak adalah seed + drawSeq deterministik.

import type { Board, Piece, PieceType, Side } from '../chess/board.ts';
import { initialBoard, resetPieceIds } from '../chess/board.ts';
import type { CastlingRights } from '../chess/moves.ts';
import { initialCastlingRights } from '../chess/moves.ts';
import type { PromotionChoice } from '../chess/promotion.ts';

export type Color = Side;

export interface PvpMove {
  from: [number, number];
  to: [number, number];
  promotion?: PromotionChoice;
  castle?: 'k' | 'q';
  enPassant?: boolean;
  phase?: boolean;
}

/** Bentuk minimal definisi kartu; dipenuhi src/content/cards.ts. */
export interface PvpCardDef {
  id: string;
  name: string;
  cost: number;
  kind: string;
  weight?: number;
}

/** Bentuk minimal definisi hero; dipenuhi src/content/heroes.ts. */
export interface PvpHeroDef {
  id: string;
  name: string;
  startEnergy: number;
  skillAction: string;
  ultimateAction: string;
  offenseSurcharge?: number;
  jokerSurcharge?: number;
  skillName: string;
  ultimateName: string;
  captureBonus?: number;
  captureEnergy?: number;
}

export interface PvpDeps {
  cards: Record<string, PvpCardDef>;
  heroes: Record<string, PvpHeroDef>;
}

/** Efek satu pemain. Semua referensi bidak memakai id numerik domain catur. */
export interface PvpEffects {
  tempoArmed: boolean;
  focusCaptureArmed: boolean;
  pierceArmed: boolean;
  shockArmed: boolean;
  leechArmed: boolean;
  quietArmed: boolean;
  riposteArmed: boolean;
  salvageArmed: boolean;
  reserveArmed: boolean;
  parryArmed: boolean;
  lastLaughArmed: boolean;
  pawnBreathArmed: boolean;
  pawnPulseArmed: boolean;
  knightTargetId: number | null;
  pawnStepId: number | null;
  pawnRaidId: number | null;
  phaseTargetId: number | null;
  phaseJokerId: number | null;
  prismTargetId: number | null;
  prismType: 'b' | 'r' | null;
  rookBendId: number | null;
  wardPieceId: number | null;
  wardTurns: number;
  snarePieceId: number | null;
  snareTurns: number;
  staggerPieceId: number | null;
  markedPieceId: number | null;
  blockadeSquare: [number, number] | null;
  blockadeTurns: number;
  heroBlockadeSquares: [number, number][];
  heroBlockadeTurns: number;
  heroBlockadeName: string;
  aegisActive: boolean;
  skipOpponentTurn: boolean;
  pawnRushIds: number[] | null;
  extraMovePending: boolean;
  surcharge: number;
  drainBlockedOnce: boolean;
}

export interface PvpSide {
  heroId: string;
  hand: string[];
  deckCardIds: string[];
  mana: number;
  energy: number;
  rollsThisTurn: number;
  bonusRerolls: number;
  freeSkillUsedThisTurn: boolean;
  effects: PvpEffects;
}

export interface PvpHistoryEntry {
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

export interface PvpState {
  board: Board;
  turn: Color;
  castling: CastlingRights;
  enPassant: [number, number] | null;
  sides: Record<Color, PvpSide>;
  /** Kartu aktif (mode target) pemain yang sedang memilih target. */
  activeSide: Color | null;
  activeSkill: string | null;
  activeSlot: number | null;
  activeSkillCost: number;
  activeSkillDiscounted: boolean;
  relayFirstId: number | null;
  selected: [number, number] | null;
  pendingPromotion: { side: Color; move: PvpMove } | null;
  lastMove: { from: [number, number]; to: [number, number] } | null;
  history: PvpHistoryEntry[];
  captures: Record<Color, number>;
  graveyard: Record<Color, Piece[]>;
  ply: number;
  turnNo: number;
  gameOver: boolean;
  winner: Color | null;
  status: string;
  /** Seed PRNG bersama; semua undian kartu memakai seed + drawSeq. */
  seed: number;
  drawSeq: number;
}

export interface PvpCommandResult {
  state: PvpState;
  ok: boolean;
  message: string;
}

export const MANA_CAP = 6;
export const EN_CAP = 5;
export const SKILL_ENERGY_COST = 2;
export const ULTIMATE_ENERGY_COST = 5;

export function freshEffects(): PvpEffects {
  return {
    tempoArmed: false,
    focusCaptureArmed: false,
    pierceArmed: false,
    shockArmed: false,
    leechArmed: false,
    quietArmed: false,
    riposteArmed: false,
    salvageArmed: false,
    reserveArmed: false,
    parryArmed: false,
    lastLaughArmed: false,
    pawnBreathArmed: false,
    pawnPulseArmed: false,
    knightTargetId: null,
    pawnStepId: null,
    pawnRaidId: null,
    phaseTargetId: null,
    phaseJokerId: null,
    prismTargetId: null,
    prismType: null,
    rookBendId: null,
    wardPieceId: null,
    wardTurns: 0,
    snarePieceId: null,
    snareTurns: 0,
    staggerPieceId: null,
    markedPieceId: null,
    blockadeSquare: null,
    blockadeTurns: 0,
    heroBlockadeSquares: [],
    heroBlockadeTurns: 0,
    heroBlockadeName: '',
    aegisActive: false,
    skipOpponentTurn: false,
    pawnRushIds: null,
    extraMovePending: false,
    surcharge: 0,
    drainBlockedOnce: false,
  };
}

export interface InitialPvpInput {
  white: { heroId: string; deckCardIds: string[]; hand: [string, string, string] };
  black: { heroId: string; deckCardIds: string[]; hand: [string, string, string] };
  seed: number;
}

function makeSide(
  input: InitialPvpInput['white'],
  hero: PvpHeroDef,
): PvpSide {
  return {
    heroId: input.heroId,
    hand: [input.hand[0], input.hand[1], input.hand[2]],
    deckCardIds: input.deckCardIds.slice(),
    mana: 0,
    energy: Math.min(EN_CAP, hero.startEnergy),
    rollsThisTurn: 0,
    bonusRerolls: 0,
    freeSkillUsedThisTurn: false,
    effects: freshEffects(),
  };
}

export function createInitialPvp(
  input: InitialPvpInput,
  deps: PvpDeps,
): PvpState {
  resetPieceIds();
  const whiteHero = deps.heroes[input.white.heroId] ?? Object.values(deps.heroes)[0];
  const blackHero = deps.heroes[input.black.heroId] ?? Object.values(deps.heroes)[0];
  return {
    board: initialBoard(),
    turn: 'w',
    castling: initialCastlingRights(),
    enPassant: null,
    sides: {
      w: makeSide(input.white, whiteHero),
      b: makeSide(input.black, blackHero),
    },
    activeSide: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected: null,
    pendingPromotion: null,
    lastMove: null,
    history: [],
    captures: { w: 0, b: 0 },
    graveyard: { w: [], b: [] },
    ply: 0,
    turnNo: 1,
    gameOver: false,
    winner: null,
    status: 'Giliran putih. Pilih langkah pembuka.',
    seed: input.seed,
    drawSeq: 0,
  };
}

function cloneBoard(board: Board): Board {
  return board.map(function (row) {
    return row.map(function (piece) {
      return piece ? { type: piece.type, side: piece.side, id: piece.id } : null;
    });
  });
}

export function clonePvp(state: PvpState): PvpState {
  return {
    ...JSON.parse(JSON.stringify(state)) as PvpState,
    board: cloneBoard(state.board),
  };
}

export function otherColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function sideOf(state: PvpState, color: Color): PvpSide {
  return state.sides[color];
}

export function heroOf(state: PvpState, deps: PvpDeps, color: Color): PvpHeroDef {
  return deps.heroes[state.sides[color].heroId] ?? Object.values(deps.heroes)[0];
}

export function isBusy(state: PvpState, color: Color): boolean {
  return state.gameOver || state.turn !== color || state.activeSide !== null || state.pendingPromotion !== null;
}

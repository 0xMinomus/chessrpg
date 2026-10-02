// Tipe state battle + port injeksi (random, konten, catur).
//
// Battle domain tidak mengimpor DOM, localStorage, window, atau Math.random.
// - Angka acak lewat RandomSource (kontrak sama dengan src/adapters/random.ts).
// - Data kartu/hero/boss dilewat sebagai tabel (satu sumber di src/content/*).
// - Operasi catur lewat ChessRules. Nama + perilaku port ini mencerminkan
//   fungsi prototipe chess-rpg-dungeon.html secara verbatim; modul
//   src/domain/chess/* dapat memenuhi port ini langsung.

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionChoice = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  type: PieceType;
  color: Color;
  id: string;
}

export type Board = (Piece | null)[][];

/** Koordinat papan [baris, kolom], 0-based. Baris 0 = rank 8 hitam. */
export type Square = [number, number];

export interface Move {
  from: Square;
  to: Square;
  promotion?: PromotionChoice;
  castle?: 'k' | 'q';
  enPassant?: boolean;
  phase?: boolean;
}

export interface CastlingRights {
  w: { k: boolean; q: boolean };
  b: { k: boolean; q: boolean };
}

export type CardKind = 'offense' | 'defense' | 'spell' | 'consumable' | 'joker';

/** Bentuk minimal definisi kartu; dipenuhi src/content/cards.ts. */
export interface CardDef {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  /** Bobot tarik; Joker memakai 0.2, kartu biasa 1. */
  weight?: number;
}

/** Bentuk minimal definisi hero; dipenuhi src/content/heroes.ts. */
export interface HeroDef {
  id: string;
  name: string;
  startEnergy: number;
  skillAction: string;
  ultimateAction: string;
  offenseSurcharge?: number;
  jokerSurcharge?: number;
  captureBonus?: number;
  /** 0 = tangkapan tidak memulihkan EN (Veyra). */
  captureEnergy?: number;
}

/** Lawan dan aturan khusus untuk satu lantai dungeon. */
export type OpponentRuleKey =
  | 'none'
  | 'shield'
  | 'drain'
  | 'seal'
  | 'mana-tax'
  | 'capture-leech'
  | 'snare'
  | 'card-silence'
  | 'hero-silence'
  | 'blight'
  | 'rally';

export interface OpponentDef {
  id: string;
  ruleKey: OpponentRuleKey;
  reward: number;
  isBoss: boolean;
}

/**
 * Sumber angka acak eksplisit. next() mengembalikan [0, 1).
 * Nama + kontrak disamakan dengan src/adapters/random.ts agar mudah digabung.
 */
export interface RandomSource {
  next(): number;
}

/** Nilai bidak untuk AI dan pemilihan target, sama seperti prototipe. */
export const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

/** Konstanta aturan battle dari prototipe dungeon aktif. */
export const HERO_SKILL_ENERGY_COST = 2;
export const HERO_ULTIMATE_ENERGY_COST = 5;
export const HERO_MANA_CAP = 6;
export const ENERGY_CAP = 5;
export const ENEMY_SKILL_BASE_COST = 2;

export type EnemyPreparedSkill = 'ward' | 'siphon' | null;

export interface HistoryEntry {
  color: Color;
  piece: PieceType;
  from: string;
  to: string;
  capture: boolean;
  captured?: PieceType | null;
  castle?: 'k' | 'q' | null;
  promotion?: PromotionChoice | null;
  /** True bila tangkapan di petak tujuan adalah en passant (korban di lateral). */
  enPassant?: boolean;
  note?: string;
}

/**
 * Field pergerakan yang dibaca mesin langkah catur.
 * BattleState memenuhi interface ini secara struktural.
 */
export interface MovementMods {
  knightTargetId: string | null;
  phaseTargetId: string | null;
  phaseJokerId: string | null;
  prismTargetId: string | null;
  prismType: 'b' | 'r' | null;
  pawnStepId: string | null;
  pawnRaidId: string | null;
  rookBendId: string | null;
  heroPawnRushIds: string[] | null;
  castling: CastlingRights;
  enPassant: Square | null;
}

/**
 * Port mesin catur. Cerminan fungsi prototipe (pseudoMoves, simulateMove,
 * isInCheck, captureAt, rawLegalMovesFrom, allLegalMoves, updateCastlingRights)
 * minus filter efek battle (ward/pierce/seal/snare/stagger/blockade/aegis)
 * yang menjadi milik domain battle.
 */
export interface ChessRules {
  initialBoard(): Board;
  coord(row: number, col: number): string;
  isInCheck(board: Board, color: Color): boolean;
  simulateMove(board: Board, move: Move): Board;
  captureAt(board: Board, enPassant: Square | null, move: Move): Piece | null;
  /** Langkah legal satu bidak dengan validasi keselamatan raja, tanpa filter efek. */
  baseMovesFrom(board: Board, mods: MovementMods, row: number, col: number): Move[];
  /** Semua langkah legal satu warna, tanpa filter efek battle. */
  baseMoves(board: Board, mods: MovementMods, color: Color): Move[];
  /** Pure: hak rokade baru setelah bidak bergerak / bidak lawan tertangkap. */
  reduceCastlingRights(
    rights: CastlingRights,
    mover: Piece,
    from: Square,
    captured: Piece | null,
    to: Square,
  ): CastlingRights;
}

export interface BattleDeps {
  chess: ChessRules;
  rng: RandomSource;
  cards: Record<string, CardDef>;
  heroes: Record<string, HeroDef>;
  opponents: Record<string, OpponentDef>;
}

export interface BattleState {
  board: Board;
  turn: Color;
  castling: CastlingRights;
  enPassant: Square | null;
  /** EN putih: membayar skill + ultimate hero. Kapasitas 5. */
  energy: number;
  /** Mana kartu: membayar kartu skill. Mulai 0, +1 per langkah putih, kap 6. */
  heroMana: number;
  hand: string[];
  /** Pool kartu loadout yang dipilih sebelum duel. */
  deckCardIds: string[];
  activeSkill: string | null;
  activeSlot: number | null;
  activeSkillCost: number;
  /** True bila biaya kartu aktif memakai diskon Fokus cadangan (untuk refund). */
  activeSkillDiscounted: boolean;
  knightTargetId: string | null;
  tempoArmed: boolean;
  pawnStepId: string | null;
  pawnRaidId: string | null;
  phaseTargetId: string | null;
  phaseJokerId: string | null;
  prismTargetId: string | null;
  prismType: 'b' | 'r' | null;
  rookBendId: string | null;
  playerWardPieceId: string | null;
  playerWardTurns: number;
  enemyWardPieceId: string | null;
  enemyDrainArmed: boolean;
  focusCaptureArmed: boolean;
  extraMovePending: boolean;
  markedEnemyId: string | null;
  pierceArmed: boolean;
  shockArmed: boolean;
  leechArmed: boolean;
  enemySurcharge: number;
  parryArmed: boolean;
  riposteArmed: boolean;
  reserveArmed: boolean;
  quietArmed: boolean;
  pawnBreathArmed: boolean;
  pawnPulseArmed: boolean;
  freeSkillUsedThisTurn: boolean;
  lastLaughArmed: boolean;
  salvageArmed: boolean;
  staggerId: string | null;
  snareId: string | null;
  snareTurns: number;
  relayFirstId: string | null;
  blockadeSquare: Square | null;
  blockadeTurns: number;
  heroBlockadeSquares: Square[];
  heroBlockadeTurns: number;
  heroBlockadeName: string;
  bonusRerolls: number;
  /** Slot kartu yang baru dibagikan ('all' = seluruh tangan); hook animasi UI. */
  dealtSlot: number | 'all' | null;
  enemyEnergy: number;
  enemyPreparedSkill: EnemyPreparedSkill;
  enemySkillIndex: 0 | 1;
  rollsThisTurn: number;
  selected: Square | null;
  pendingPromotion: Move | null;
  lastMove: { from: Square; to: Square } | null;
  history: HistoryEntry[];
  captures: { w: number; b: number };
  whiteGraveyard: Piece[];
  ply: number;
  turnNo: number;
  thinking: boolean;
  gameOver: boolean;
  winner: Color | null;
  status: string;
  floorId: string;
  heroId: string;
  dungeonRewarded: boolean;
  heroSkipEnemyTurn: boolean;
  heroPawnRushIds: string[] | null;
  heroAegisActive: boolean;
  nilaDrainBlocked: boolean;
  bossSealedSquare: Square | null;
  bossSnareId: string | null;
  bossCardSilence: boolean;
  bossHeroSilence: boolean;
  bossBlightArmed: boolean;
  /**
   * Riwayat snapshot awal ronde untuk undo satu putaran penuh.
   * Dikelola command undoTurn/restartBattle; dikecualikan dari snapshot
   * agar tidak tumbuh eksponensial.
   */
  past: BattleSnapshot[];
  anchor: BattleSnapshot | null;
}

/**
 * Snapshot inti ronde (cerminan snapshotCore prototipe).
 * Field transien visual (dealtSlot, hook animasi) dan stack undo
 * sengaja tidak ikut, sama seperti prototipe.
 */
export type BattleSnapshot = Omit<BattleState, 'past' | 'anchor' | 'dealtSlot'>;

/** Hasil command bernama: UI hanya membaca state + message. */
export interface CommandResult {
  state: BattleState;
  ok: boolean;
  message: string;
}

function cloneSquare(square: Square | null): Square | null {
  return square ? [square[0], square[1]] : null;
}

function cloneBoard(board: Board): Board {
  return board.map(function (row) {
    return row.map(function (piece) {
      return piece ? { type: piece.type, color: piece.color, id: piece.id } : null;
    });
  });
}

/** Deep clone penuh satu BattleState (termasuk stack undo). */
export function cloneBattle(state: BattleState): BattleState {
  return {
    ...JSON.parse(JSON.stringify({ ...state, past: [], anchor: null })) as BattleState,
    board: cloneBoard(state.board),
    past: state.past.map(cloneSnapshot),
    anchor: state.anchor ? cloneSnapshot(state.anchor) : null,
  };
}

function cloneSnapshot(snapshot: BattleSnapshot): BattleSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BattleSnapshot;
}

/** Ambil snapshot inti ronde; daftar field mengikuti snapshotCore prototipe. */
export function snapshotBattle(state: BattleState): BattleSnapshot {
  const snapshot: BattleSnapshot = {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: JSON.parse(JSON.stringify(state.castling)) as CastlingRights,
    enPassant: cloneSquare(state.enPassant),
    energy: state.energy,
    heroMana: state.heroMana,
    hand: state.hand.slice(),
    deckCardIds: state.deckCardIds.slice(),
    activeSkill: state.activeSkill,
    activeSlot: state.activeSlot,
    activeSkillCost: state.activeSkillCost,
    activeSkillDiscounted: state.activeSkillDiscounted,
    knightTargetId: state.knightTargetId,
    tempoArmed: state.tempoArmed,
    pawnStepId: state.pawnStepId,
    pawnRaidId: state.pawnRaidId,
    phaseTargetId: state.phaseTargetId,
    phaseJokerId: state.phaseJokerId,
    prismTargetId: state.prismTargetId,
    prismType: state.prismType,
    rookBendId: state.rookBendId,
    playerWardPieceId: state.playerWardPieceId,
    playerWardTurns: state.playerWardTurns,
    enemyWardPieceId: state.enemyWardPieceId,
    enemyDrainArmed: state.enemyDrainArmed,
    focusCaptureArmed: state.focusCaptureArmed,
    extraMovePending: state.extraMovePending,
    markedEnemyId: state.markedEnemyId,
    pierceArmed: state.pierceArmed,
    shockArmed: state.shockArmed,
    leechArmed: state.leechArmed,
    enemySurcharge: state.enemySurcharge,
    parryArmed: state.parryArmed,
    riposteArmed: state.riposteArmed,
    reserveArmed: state.reserveArmed,
    quietArmed: state.quietArmed,
    pawnBreathArmed: state.pawnBreathArmed,
    pawnPulseArmed: state.pawnPulseArmed,
    freeSkillUsedThisTurn: state.freeSkillUsedThisTurn,
    lastLaughArmed: state.lastLaughArmed,
    salvageArmed: state.salvageArmed,
    staggerId: state.staggerId,
    snareId: state.snareId,
    snareTurns: state.snareTurns,
    relayFirstId: state.relayFirstId,
    blockadeSquare: cloneSquare(state.blockadeSquare),
    blockadeTurns: state.blockadeTurns,
    heroBlockadeSquares: state.heroBlockadeSquares.map(function (square) {
      return [square[0], square[1]] as Square;
    }),
    heroBlockadeTurns: state.heroBlockadeTurns,
    heroBlockadeName: state.heroBlockadeName,
    bonusRerolls: state.bonusRerolls,
    enemyEnergy: state.enemyEnergy,
    enemyPreparedSkill: state.enemyPreparedSkill,
    enemySkillIndex: state.enemySkillIndex,
    rollsThisTurn: state.rollsThisTurn,
    selected: cloneSquare(state.selected),
    pendingPromotion: state.pendingPromotion
      ? JSON.parse(JSON.stringify(state.pendingPromotion)) as Move
      : null,
    lastMove: state.lastMove
      ? {
          from: [state.lastMove.from[0], state.lastMove.from[1]] as Square,
          to: [state.lastMove.to[0], state.lastMove.to[1]] as Square,
        }
      : null,
    history: state.history.map(function (entry) {
      return { ...entry };
    }),
    captures: { w: state.captures.w, b: state.captures.b },
    whiteGraveyard: state.whiteGraveyard.map(function (piece) {
      return { ...piece };
    }),
    ply: state.ply,
    turnNo: state.turnNo,
    thinking: state.thinking,
    gameOver: state.gameOver,
    winner: state.winner,
    status: state.status,
    floorId: state.floorId,
    heroId: state.heroId,
    dungeonRewarded: state.dungeonRewarded,
    heroSkipEnemyTurn: state.heroSkipEnemyTurn,
    heroPawnRushIds: state.heroPawnRushIds ? state.heroPawnRushIds.slice() : null,
    heroAegisActive: state.heroAegisActive,
    nilaDrainBlocked: state.nilaDrainBlocked,
    bossSealedSquare: cloneSquare(state.bossSealedSquare),
    bossSnareId: state.bossSnareId,
    bossCardSilence: state.bossCardSilence,
    bossHeroSilence: state.bossHeroSilence,
    bossBlightArmed: state.bossBlightArmed,
  };
  return snapshot;
}

/** Kembalikan field inti dari snapshot (cerminan restoreCore prototipe). */
export function restoreBattleSnapshot(state: BattleState, snapshot: BattleSnapshot): BattleState {
  const next: BattleState = {
    ...cloneSnapshot(snapshot),
    dealtSlot: null,
    past: state.past,
    anchor: state.anchor,
  };
  return next;
}

export interface InitialBattleInput {
  hero: HeroDef;
  board: Board;
  opponent: OpponentDef;
  hand: [string, string, string];
  deckCardIds: string[];
}

/**
 * State awal duel (cerminan setInitialState prototipe).
 * EN putih = startEnergy hero, mana kartu = 0, EN lawan = 2,
 * rencana lawan awal = Perisai ('ward').
 */
export function createInitialBattle(input: InitialBattleInput): BattleState {
  const fresh: BattleState = {
    board: cloneBoard(input.board),
    turn: 'w',
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    energy: input.hero.startEnergy,
    heroMana: 0,
    hand: [input.hand[0], input.hand[1], input.hand[2]],
    deckCardIds: input.deckCardIds.slice(),
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    knightTargetId: null,
    tempoArmed: false,
    pawnStepId: null,
    pawnRaidId: null,
    phaseTargetId: null,
    phaseJokerId: null,
    prismTargetId: null,
    prismType: null,
    rookBendId: null,
    playerWardPieceId: null,
    playerWardTurns: 0,
    enemyWardPieceId: null,
    enemyDrainArmed: false,
    focusCaptureArmed: false,
    extraMovePending: false,
    markedEnemyId: null,
    pierceArmed: false,
    shockArmed: false,
    leechArmed: false,
    enemySurcharge: 0,
    parryArmed: false,
    riposteArmed: false,
    reserveArmed: false,
    quietArmed: false,
    pawnBreathArmed: false,
    pawnPulseArmed: false,
    freeSkillUsedThisTurn: false,
    lastLaughArmed: false,
    salvageArmed: false,
    staggerId: null,
    snareId: null,
    snareTurns: 0,
    relayFirstId: null,
    blockadeSquare: null,
    blockadeTurns: 0,
    heroBlockadeSquares: [],
    heroBlockadeTurns: 0,
    heroBlockadeName: '',
    bonusRerolls: 0,
    dealtSlot: null,
    enemyEnergy: 2,
    enemyPreparedSkill: 'ward',
    enemySkillIndex: 1,
    rollsThisTurn: 0,
    selected: null,
    pendingPromotion: null,
    lastMove: null,
    history: [],
    captures: { w: 0, b: 0 },
    whiteGraveyard: [],
    ply: 0,
    turnNo: 1,
    thinking: false,
    gameOver: false,
    winner: null,
    status: 'Pilih bidak putih untuk melihat langkah legal.',
    floorId: input.opponent.id,
    heroId: input.hero.id,
    dungeonRewarded: false,
    heroSkipEnemyTurn: false,
    heroPawnRushIds: null,
    heroAegisActive: false,
    nilaDrainBlocked: false,
    bossSealedSquare: null,
    bossSnareId: null,
    bossCardSilence: false,
    bossHeroSilence: false,
    bossBlightArmed: false,
    past: [],
    anchor: null,
  };
  fresh.anchor = snapshotBattle(fresh);
  return fresh;
}

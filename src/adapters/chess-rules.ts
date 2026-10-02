// Adapter ChessRules untuk domain battle: menerjemahkan representasi battle
// (Piece {type,color,id:string}) ke mesin catur domain/chess
// (Piece {type,side,id:number}) dan sebaliknya.
//
// KONTRAK baseMoves/baseMovesFrom (lihat BattleDeps di domain/battle/state.ts):
// mengembalikan langkah legal catur TANPA filter efek battle (segel, ward,
// aegis, snare, stagger, blockade). Filter itu diterapkan domain battle
// sendiri di battleLegalMoves. Karena itu MoveState yang diteruskan ke mesin
// catur hanya membawa hook POLA GERAK (knight/prism/phase/pawnStep/
// pawnRaid/rookBend/heroPawnRush) dan memakai rawLegalMovesFrom (pola +
// keselamatan raja), bukan allLegalMoves.

import {
  rawLegalMovesFrom,
  updateCastlingRights,
  coord as chessCoord,
  isInCheck as chessIsInCheck,
  simulateMove as chessSimulateMove,
  captureAt as chessCaptureAt,
  type CastlingRights as ChessCastlingRights,
  type ChessMove,
} from '../domain/chess/moves.ts';
import type { Board as ChessBoard, Piece as ChessPiece } from '../domain/chess/board.ts';
import { initialBoard as chessInitialBoard } from '../domain/chess/board.ts';
import type {
  Board as BattleBoard,
  CastlingRights as BattleCastlingRights,
  ChessRules,
  Move as BattleMove,
  Piece as BattlePiece,
  Square,
} from '../domain/battle/state.ts';

// --- Registri identitas bidak (string battle <-> number catur) ---
// Papan awal dibuat dari mesin catur sehingga id battle berbentuk 'n<angka>'
// dan round-trip tanpa kehilangan identitas. Id string lain yang dibuat efek
// battle (mis. revival) dipetakan ke nomor segar saat pertama terlihat.

const battleToChess = new Map<string, number>();
const chessToBattle = new Map<number, string>();
let nextFreshId = 1;

function toChessId(battleId: string): number {
  const hit = battleToChess.get(battleId);
  if (hit !== undefined) return hit;
  const parsed = /^n(\d+)$/.exec(battleId);
  let num: number;
  if (parsed) {
    num = Number(parsed[1]);
    if (nextFreshId <= num) nextFreshId = num + 1;
  } else {
    num = nextFreshId;
    nextFreshId += 1;
  }
  battleToChess.set(battleId, num);
  if (!chessToBattle.has(num)) chessToBattle.set(num, battleId);
  return num;
}

function toBattleId(num: number): string {
  const hit = chessToBattle.get(num);
  if (hit !== undefined) return hit;
  const id = 'n' + num;
  chessToBattle.set(num, id);
  battleToChess.set(id, num);
  if (nextFreshId <= num) nextFreshId = num + 1;
  return id;
}

function toChessPiece(piece: BattlePiece): ChessPiece {
  return { type: piece.type, side: piece.color, id: toChessId(piece.id) };
}

function toBattlePiece(piece: ChessPiece): BattlePiece {
  return { type: piece.type, color: piece.side, id: toBattleId(piece.id) };
}

function toChessBoard(board: BattleBoard): ChessBoard {
  return board.map(function (row) {
    return row.map(function (piece) {
      return piece ? toChessPiece(piece) : null;
    });
  });
}

function toBattleBoard(board: ChessBoard): BattleBoard {
  return board.map(function (row) {
    return row.map(function (piece) {
      return piece ? toBattlePiece(piece) : null;
    });
  });
}

function toChessMove(move: BattleMove): ChessMove {
  const out: ChessMove = {
    from: [move.from[0], move.from[1]],
    to: [move.to[0], move.to[1]],
  };
  if (move.castle) out.castle = move.castle;
  if (move.enPassant) out.enPassant = true;
  if (move.phase) out.phase = true;
  if (move.promotion) out.promotion = move.promotion;
  return out;
}

function toBattleMove(move: ChessMove): BattleMove {
  const out: BattleMove = {
    from: [move.from[0], move.from[1]],
    to: [move.to[0], move.to[1]],
  };
  if (move.castle) out.castle = move.castle;
  if (move.enPassant) out.enPassant = true;
  if (move.phase) out.phase = true;
  if (move.promotion && move.promotion !== 'k' && move.promotion !== 'p') {
    out.promotion = move.promotion;
  }
  return out;
}

function cloneRights(rights: BattleCastlingRights): ChessCastlingRights {
  return {
    w: { k: rights.w.k, q: rights.w.q },
    b: { k: rights.b.k, q: rights.b.q },
  };
}

// Bentuk MoveState minimal yang dibutuhkan rawLegalMovesFrom/allLegalMoves.
// Field filter efek battle sengaja dikosongkan (lihat kontrak di atas).
interface PatternOnlyState {
  board: ChessBoard;
  castling: ChessCastlingRights;
  enPassant: [number, number] | null;
  knightTargetId: number | null;
  prismTargetId: number | null;
  prismType: 'b' | 'r' | null;
  phaseTargetId: number | null;
  phaseJokerId: number | null;
  pawnStepId: number | null;
  heroPawnRushIds: readonly number[] | null;
  pawnRaidId: number | null;
  rookBendId: number | null;
  bossSealedSquare: null;
  enemyWardPieceId: null;
  pierceArmed: boolean;
  heroAegisActive: boolean;
  snareId: null;
  staggerId: null;
  blockadeSquare: null;
  heroBlockadeSquares: readonly (readonly [number, number])[];
  playerWardPieceId: null;
}

function patternState(
  board: BattleBoard,
  mods: {
    castling: BattleCastlingRights;
    enPassant: Square | null;
    knightTargetId: string | null;
    phaseTargetId: string | null;
    phaseJokerId: string | null;
    prismTargetId: string | null;
    prismType: 'b' | 'r' | null;
    pawnStepId: string | null;
    pawnRaidId: string | null;
    rookBendId: string | null;
    heroPawnRushIds: string[] | null;
  },
): PatternOnlyState {
  const mapId = function (id: string | null): number | null {
    return id == null ? null : toChessId(id);
  };
  return {
    board: toChessBoard(board),
    castling: cloneRights(mods.castling),
    enPassant: mods.enPassant ? [mods.enPassant[0], mods.enPassant[1]] : null,
    knightTargetId: mapId(mods.knightTargetId),
    prismTargetId: mapId(mods.prismTargetId),
    prismType: mods.prismType,
    phaseTargetId: mapId(mods.phaseTargetId),
    phaseJokerId: mapId(mods.phaseJokerId),
    pawnStepId: mapId(mods.pawnStepId),
    heroPawnRushIds: mods.heroPawnRushIds ? mods.heroPawnRushIds.map(toChessId) : null,
    pawnRaidId: mapId(mods.pawnRaidId),
    rookBendId: mapId(mods.rookBendId),
    bossSealedSquare: null,
    enemyWardPieceId: null,
    pierceArmed: false,
    heroAegisActive: false,
    snareId: null,
    staggerId: null,
    blockadeSquare: null,
    heroBlockadeSquares: [],
    playerWardPieceId: null,
  };
}

export const chessRulesAdapter: ChessRules = {
  initialBoard(): BattleBoard {
    return toBattleBoard(chessInitialBoard());
  },
  coord(row: number, col: number): string {
    return chessCoord(row, col);
  },
  isInCheck(board: BattleBoard, color: 'w' | 'b'): boolean {
    return chessIsInCheck(toChessBoard(board), color);
  },
  simulateMove(board: BattleBoard, move: BattleMove): BattleBoard {
    return toBattleBoard(chessSimulateMove(toChessBoard(board), toChessMove(move)));
  },
  captureAt(
    board: BattleBoard,
    enPassant: Square | null,
    move: BattleMove,
  ): BattlePiece | null {
    const state = patternState(board, {
      castling: { w: { k: false, q: false }, b: { k: false, q: false } },
      enPassant,
      knightTargetId: null,
      phaseTargetId: null,
      phaseJokerId: null,
      prismTargetId: null,
      prismType: null,
      pawnStepId: null,
      pawnRaidId: null,
      rookBendId: null,
      heroPawnRushIds: null,
    });
    const chessMove = toChessMove(move);
    const hit = chessCaptureAt(state, chessMove);
    return hit ? toBattlePiece(hit) : null;
  },
  baseMovesFrom(
    board: BattleBoard,
    mods: Parameters<ChessRules['baseMovesFrom']>[1],
    row: number,
    col: number,
  ): BattleMove[] {
    const state = patternState(board, mods);
    return rawLegalMovesFrom(state, row, col).map(toBattleMove);
  },
  baseMoves(
    board: BattleBoard,
    mods: Parameters<ChessRules['baseMoves']>[1],
    color: 'w' | 'b',
  ): BattleMove[] {
    const state = patternState(board, mods);
    const out: BattleMove[] = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = state.board[row][col];
        if (piece && piece.side === color) {
          const moves = rawLegalMovesFrom(state, row, col);
          for (const move of moves) out.push(toBattleMove(move));
        }
      }
    }
    return out;
  },
  reduceCastlingRights(
    rights: BattleCastlingRights,
    mover: BattlePiece,
    from: Square,
    captured: BattlePiece | null,
    to: Square,
  ): BattleCastlingRights {
    const next = cloneRights(rights);
    updateCastlingRights(
      next,
      toChessPiece(mover),
      from[0],
      from[1],
      captured ? toChessPiece(captured) : null,
      to[0],
      to[1],
    );
    return { w: { k: next.w.k, q: next.w.q }, b: { k: next.b.k, q: next.b.q } };
  },
};

// Model papan catur (domain murni, tanpa DOM/browser).
// Setup awal identik dengan `initialBoard` di chess-rpg-dungeon.html.
//
// PERBEDAAN BENTUK vs prototipe (dimandatkan spesifikasi migrasi, bukan bug):
// prototipe memakai `{ type, color: 'w' | 'b', id: '<color>-<type>-<row>-<col>' }`
// dengan id string yang tidak unik setelah bidak bergerak. Di sini bidak memakai
// `{ type, side, id: number }` dengan counter monotonik sehingga setiap objek
// bidak punya identitas stabil untuk efek kartu yang menarget id bidak.

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Side = 'w' | 'b';

export interface Piece {
  type: PieceType;
  side: Side;
  id: number;
}

export type Board = (Piece | null)[][];

let nextPieceId = 1;

/** Mengembalikan counter id (berguna untuk test deterministik). */
export function resetPieceIds(): void {
  nextPieceId = 1;
}

export function createPiece(type: PieceType, side: Side): Piece {
  const piece: Piece = { type, side, id: nextPieceId };
  nextPieceId += 1;
  return piece;
}

export function emptyBoard(): Board {
  return Array.from({ length: 8 }, function() { return Array<Piece | null>(8).fill(null); });
}

/** Susunan standar: hitam di baris 0-1, putih di baris 6-7. */
export function initialBoard(): Board {
  const board = emptyBoard();
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let col = 0; col < 8; col += 1) {
    board[0][col] = createPiece(backRank[col], 'b');
    board[1][col] = createPiece('p', 'b');
    board[6][col] = createPiece('p', 'w');
    board[7][col] = createPiece(backRank[col], 'w');
  }
  return board;
}

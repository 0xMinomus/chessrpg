// Paritas adapter catur: membuktikan papan battle dan mesin catur domain
// agrees untuk langkah, tangkapan, dan simulasi (tanpa DOM).
//
// Jalankan: node --experimental-strip-types scripts/chess-parity.ts

import { resetPieceIds, initialBoard as chessInitialBoard } from '../src/domain/chess/board.ts';
import type { Board as ChessBoard } from '../src/domain/chess/board.ts';
import { rawLegalMovesFrom, simulateMove } from '../src/domain/chess/moves.ts';
import { chessRulesAdapter } from '../src/adapters/chess-rules.ts';
import type { Board as BattleBoard } from '../src/domain/battle/state.ts';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.log('  FAIL: ' + name + (detail ? ' :: ' + detail : ''));
  }
}

/** Papan domain memakai `side`, papan battle memakai `color`. Samakan keduanya. */
function signature(board: BattleBoard | ChessBoard): string {
  return board
    .flat()
    .map(function (piece) {
      if (!piece) return '.';
      const side = (piece as { side?: string; color?: string }).side ?? (piece as { color: string }).color;
      return piece.type + side;
    })
    .join('');
}

function main(): void {
  resetPieceIds();
  const battleBoard = chessRulesAdapter.initialBoard();
  const chessBoard = chessInitialBoard();
  check('adapter: papan awal identik', signature(battleBoard) === signature(chessBoard));

  const mods = {
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    knightTargetId: null,
    phaseTargetId: null,
    phaseJokerId: null,
    prismTargetId: null,
    prismType: null,
    pawnStepId: null,
    pawnRaidId: null,
    rookBendId: null,
    heroPawnRushIds: null,
  } as Parameters<typeof chessRulesAdapter.baseMovesFrom>[1];

  let compared = 0;
  let mismatches = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const adapterMoves = chessRulesAdapter.baseMovesFrom(battleBoard, mods, row, col);
      const domainMoves = rawLegalMovesFrom(
        { board: chessBoard, ...mods } as Parameters<typeof rawLegalMovesFrom>[0],
        row,
        col,
      );
      const a = adapterMoves
        .map(function (m) {
          return m.from.join('') + '-' + m.to.join('') + (m.castle ?? '') + (m.enPassant ? 'e' : '');
        })
        .sort()
        .join('|');
      const b = domainMoves
        .map(function (m) {
          return m.from.join('') + '-' + m.to.join('') + (m.castle ?? '') + (m.enPassant ? 'e' : '');
        })
        .sort()
        .join('|');
      compared += 1;
      if (a !== b) {
        mismatches += 1;
        console.log('  mismatch di ' + row + ',' + col + ' adapter=' + a + ' domain=' + b);
      }
    }
  }
  check('adapter: langkah legal sama di 64 petak', mismatches === 0, compared + ' petak diperiksa');

  // Simulasi langkah: papan hasil harus sama.
  const sample = { from: [6, 4] as [number, number], to: [4, 4] as [number, number] };
  const viaAdapter = chessRulesAdapter.simulateMove(battleBoard, sample);
  const viaDomain = simulateMove(chessBoard, sample);
  check('adapter: simulasi langkah identik', signature(viaAdapter) === signature(viaDomain));

  // Tangkapan biasa: pion hitam b7 (1,1) menangkap pion putih a6 (2,0).
  resetPieceIds();
  const board2 = chessRulesAdapter.initialBoard();
  board2[2][0] = { type: 'p', color: 'w', id: 'n800' };
  const capture = { from: [1, 1] as [number, number], to: [2, 0] as [number, number] };
  check(
    'adapter: captureAt menemukan target',
    chessRulesAdapter.captureAt(board2, null, capture)?.color === 'w',
  );
  const afterCapture = chessRulesAdapter.simulateMove(board2, capture);
  check(
    'adapter: petak tangkapan kosong setelah capture',
    afterCapture[2][0] !== null && afterCapture[2][0].color === 'b' && afterCapture[1][1] === null,
  );

  // En passant: pion putih e2-e4 (2,4)->(4,4) melewati (3,4); pion hitam d4
  // (4,3) menangkap ke e3 (3,4) dan mengambil pion yang lewat.
  resetPieceIds();
  const ep = chessRulesAdapter.initialBoard();
  ep[4][3] = { type: 'p', color: 'b', id: 'n901' };
  ep[2][4] = { type: 'p', color: 'w', id: 'n902' };
  const whiteDouble = { from: [2, 4] as [number, number], to: [4, 4] as [number, number] };
  const afterDouble = chessRulesAdapter.simulateMove(ep, whiteDouble);
  check('adapter: pion putih maju dua petak', afterDouble[4][4] !== null && afterDouble[2][4] === null);
  const blackEp = { from: [4, 3] as [number, number], to: [3, 4] as [number, number], enPassant: true };
  const captured = chessRulesAdapter.captureAt(afterDouble, [3, 4], blackEp);
  check(
    'adapter: captureAt en passant mengambil pion lateral',
    captured?.color === 'w' && captured.id === 'n902',
    JSON.stringify(captured),
  );
  const afterEp = chessRulesAdapter.simulateMove(afterDouble, blackEp);
  check(
    'adapter: simulasi en passant mengosongkan petak pion yang tertangkap',
    afterEp[3][4] !== null && afterEp[3][4].color === 'b' && afterEp[4][4] === null,
  );

  console.log('PASS ' + passed + ' / FAIL ' + failed);
  if (failed > 0) {
    (globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1;
  }
}

main();

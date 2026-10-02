// Papan catur 8x8: render + highlight. Tanpa aturan game.
// Menerima snapshot + legalMoves dari game core; tidak menghitung langkah.

export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type PieceColor = 'w' | 'b';

export interface BoardPiece {
  type: PieceType;
  color: PieceColor;
  id: string;
}

export type BoardGrid = (BoardPiece | null)[][];

export interface LegalMoveRef {
  from: [number, number];
  to: [number, number];
}

export interface CaptureFx {
  from: [number, number];
  to: [number, number];
  victimAt: [number, number];
  attackerId: string;
  color: PieceColor;
  piece: PieceType;
  /** Bidak yang jatuh: glyph-nya yang menghilang di petak korban. */
  victimColor: PieceColor;
  victimPiece: PieceType;
}

export interface BoardViewState {
  board: BoardGrid;
  selected: [number, number] | null;
  legalMoves: LegalMoveRef[];
  lastMove: { from: [number, number]; to: [number, number] } | null;
  captureFx: CaptureFx | null;
  focusSquare: [number, number];
  whiteInCheck: boolean;
  blackInCheck: boolean;
  enemyWardPieceId: string | null;
  playerWardPieceId: string | null;
  markedEnemyId: string | null;
  staggerId: string | null;
  snareId: string | null;
  snareTurns: number;
  bossSnareId: string | null;
  blockadeSquare: [number, number] | null;
  blockadeTurns: number;
  heroBlockadeSquares: [number, number][];
  heroBlockadeTurns: number;
  heroBlockadeName: string;
  bossSealedSquare: [number, number] | null;
  targeting: boolean;
  disabled: boolean;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const SYMBOLS: Record<PieceColor, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const PIECE_NAMES: Record<PieceType, string> = {
  k: 'raja',
  q: 'ratu',
  r: 'benteng',
  b: 'gajah',
  n: 'kuda',
  p: 'pion',
};

export function coord(row: number, col: number): string {
  return FILES[col] + String(8 - row);
}

function markerSvg(kind: string): string {
  const marks: Record<string, string> = {
    shield: '<path d="M12 2 20 5v6c0 5-3 8-8 11-5-3-8-6-8-11V5zM8 12l3 3 5-6"/>',
    mark: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    stagger: '<path d="m3 17 5-5 4 3 8-9M16 6h4v4M4 21h16"/>',
    snare: '<path d="M4 5h16M4 19h16M6 5v4l6 5 6-5V5M6 19v-4l6-5 6 5v4"/>',
    block: '<path d="M4 5h16M4 12h16M4 19h16M7 3v18M12 3v18M17 3v18"/>',
  };
  const path = marks[kind];
  if (!path) return '';
  return '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' + path + '</svg>';
}

function sameSquare(a: [number, number] | null, row: number, col: number): boolean {
  return a !== null && a[0] === row && a[1] === col;
}

function inList(list: [number, number][], row: number, col: number): boolean {
  return list.some(function (sq) {
    return sq[0] === row && sq[1] === col;
  });
}

export function renderBoard(state: BoardViewState): string {
  const legalByTarget = new Map<string, boolean>();
  const captureByTarget = new Map<string, boolean>();
  for (const move of state.legalMoves) {
    const key = move.to[0] + ',' + move.to[1];
    legalByTarget.set(key, true);
    const target = state.board[move.to[0]][move.to[1]];
    if (target) captureByTarget.set(key, true);
  }
  let html = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      const key = row + ',' + col;
      const isSelected = state.selected !== null && state.selected[0] === row && state.selected[1] === col;
      const isHint = legalByTarget.get(key) === true;
      const isCaptureHint = captureByTarget.get(key) === true;
      const inCheck =
        piece !== null && piece.type === 'k' && ((piece.color === 'w' && state.whiteInCheck) || (piece.color === 'b' && state.blackInCheck));
      const enemyProtected = piece !== null && piece.id === state.enemyWardPieceId;
      const playerProtected = piece !== null && piece.id === state.playerWardPieceId;
      const marked = piece !== null && piece.id === state.markedEnemyId;
      const staggered = piece !== null && piece.id === state.staggerId;
      const snared = piece !== null && piece.id === state.snareId;
      const bossSnared = piece !== null && piece.id === state.bossSnareId;
      const bossSealed = sameSquare(state.bossSealedSquare, row, col);
      const cardBlocked = sameSquare(state.blockadeSquare, row, col);
      const heroBlocked = inList(state.heroBlockadeSquares, row, col);
      const blocked = cardBlocked || bossSealed || heroBlocked;
      const fx = state.captureFx;
      const captureOrigin = fx !== null && fx.from[0] === row && fx.from[1] === col;
      const captureImpact = fx !== null && fx.to[0] === row && fx.to[1] === col && piece !== null && piece.id === fx.attackerId;
      const captureVictim = fx !== null && fx.victimAt[0] === row && fx.victimAt[1] === col;
      const ghost = captureVictim && fx ? SYMBOLS[fx.victimColor][fx.victimPiece] : '';
      const ghostClass = captureVictim && fx ? 'capture-ghost shattering ' + (fx.victimColor === 'w' ? 'white' : 'black') : 'capture-ghost';
      const classes = ['square', (row + col) % 2 === 0 ? 'light' : 'dark'];
      if (isSelected) classes.push('selected');
      if (state.lastMove !== null && state.lastMove.from[0] === row && state.lastMove.from[1] === col) classes.push('last-from');
      if (state.lastMove !== null && state.lastMove.to[0] === row && state.lastMove.to[1] === col) classes.push('last-to');
      if (inCheck) classes.push('in-check');
      if (enemyProtected) classes.push('enemy-ward');
      if (playerProtected) classes.push('player-ward');
      if (marked) classes.push('marked-piece');
      if (staggered) classes.push('staggered-piece');
      if (snared) classes.push('snared-piece');
      if (bossSnared) classes.push('boss-snared-piece');
      if (blocked) classes.push('blocked-target');
      if (captureOrigin) classes.push('capture-origin');
      if (captureImpact) classes.push('capture-impact');
      if (isHint && !isCaptureHint) classes.push('move-hint');
      if (isHint && isCaptureHint) classes.push('capture-hint');
      const marker = enemyProtected || playerProtected ? 'shield' : marked ? 'mark' : staggered ? 'stagger' : snared || bossSnared ? 'snare' : blocked ? 'block' : null;
      const labels: string[] = [];
      if (enemyProtected || playerProtected) labels.push('terlindungi perisai');
      if (marked) labels.push('ditandai untuk diburu');
      if (staggered) labels.push('tak dapat menangkap pada balasan lawan');
      if (snared) labels.push('terjerat, tak dapat bergerak selama ' + state.snareTurns + ' balasan boss');
      if (bossSnared) labels.push('terjerat boss, tidak dapat bergerak pada giliran ini');
      if (cardBlocked) labels.push('petak diblokade selama ' + state.blockadeTurns + ' balasan boss');
      if (heroBlocked) labels.push(state.heroBlockadeName + ' diblokade selama ' + state.heroBlockadeTurns + ' balasan boss');
      if (bossSealed) labels.push('petak disegel boss untuk langkah berikutnya');
      const position = coord(row, col);
      const ariaLabel =
        position +
        (piece ? ', ' + (piece.color === 'w' ? 'putih ' : 'hitam ') + PIECE_NAMES[piece.type] : ', kosong') +
        (labels.length ? ', ' + labels.join(', ') : '');
      const tabIndex = state.focusSquare[0] === row && state.focusSquare[1] === col ? '0' : '-1';
      html +=
        '<button type="button" class="' +
        classes.join(' ') +
        '" role="gridcell" data-command="square" data-row="' +
        row +
        '" data-col="' +
        col +
        '" tabindex="' +
        tabIndex +
        '" aria-label="' +
        ariaLabel +
        '"' +
        (state.disabled ? ' disabled' : '') +
        '>' +
        '<span class="coordinate" aria-hidden="true">' +
        (col === 0 ? String(8 - row) : row === 7 ? FILES[col] : '') +
        '</span>' +
        '<span class="piece' +
        (piece ? (piece.color === 'w' ? ' white' : ' black') : '') +
        '" aria-hidden="true">' +
        (piece ? SYMBOLS[piece.color][piece.type] : '') +
        '</span>' +
        '<span class="capture-effect' +
        (captureImpact || captureVictim ? ' active' : '') +
        '" aria-hidden="true"><span class="' +
        ghostClass +
        '">' +
        ghost +
        '</span><span class="capture-burst"></span></span>' +
        '<span class="square-status' +
        (marker ? ' active' : '') +
        (enemyProtected ? ' enemy' : '') +
        '" aria-hidden="true">' +
        (marker ? markerSvg(marker) : '') +
        '</span></button>';
    }
  }
  return html;
}

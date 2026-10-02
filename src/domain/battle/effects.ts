// Resolusi efek kartu / skill / ultimate: flag tertunda, target papan,
// pengubahan bidak, dan pemicu fase putih. Semua penempatan / penghapusan
// bidak melewati validasi keselamatan raja. Durasi FR-23 (ward, snare,
// blockade, heroBlockade 2 balasan boss; aegis 1 balasan) dihitung lewat
// advanceBossReplyEffects setelah fase boss, termasuk saat balasan dilewati.

import {
  ENERGY_CAP,
  HERO_MANA_CAP,
  PIECE_VALUES,
  type BattleDeps,
  type BattleState,
  type Board,
  type Color,
  type HeroDef,
  type Move,
  type Piece,
  type PieceType,
  type Square,
} from './state.ts';
import { gainEnergy, gainEnemyEnergy, loseEnemyEnergy, replaceHandSlot } from './resources.ts';

export const PIECE_NAMES: Record<PieceType, string> = {
  k: 'raja',
  q: 'ratu',
  r: 'benteng',
  b: 'gajah',
  n: 'kuda',
  p: 'pion',
};

export function findPieceSquare(board: Board, pieceId: string): Square | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.id === pieceId) return [row, col];
    }
  }
  return null;
}

/**
 * Langkah legal satu warna setelah filter efek battle.
 * Cerminan allLegalMoves prototipe: segel boss, ward + pierce, aegis,
 * snare, stagger, blockade kartu, hero blockade, ward putih, plus jalur
 * darurat keluar-skak bila filter menutup semua jawaban skak.
 */
export function battleLegalMoves(state: BattleState, deps: BattleDeps, color: Color): Move[] {
  const chess = deps.chess;
  const result = chess.baseMoves(state.board, state, color);
  const allowed = result.filter(function (move) {
    const moving = state.board[move.from[0]][move.from[1]];
    if (!moving) return false;
    const captured = chess.captureAt(state.board, state.enPassant, move);
    if (color === 'w') {
      if (state.bossSnareId === moving.id) return false;
      if (
        state.bossSealedSquare &&
        move.to[0] === state.bossSealedSquare[0] &&
        move.to[1] === state.bossSealedSquare[1]
      ) {
        return false;
      }
      return !captured || captured.id !== state.enemyWardPieceId || state.pierceArmed;
    }
    if (state.heroAegisActive && captured && captured.color === 'w') return false;
    if (state.snareId === moving.id) return false;
    if (state.staggerId === moving.id && captured) return false;
    if (
      state.blockadeSquare &&
      move.to[0] === state.blockadeSquare[0] &&
      move.to[1] === state.blockadeSquare[1]
    ) {
      return false;
    }
    if (
      state.heroBlockadeSquares.some(function (square) {
        return move.to[0] === square[0] && move.to[1] === square[1];
      })
    ) {
      return false;
    }
    return !captured || captured.id !== state.playerWardPieceId;
  });
  if (allowed.length > 0 || result.length === 0 || !chess.isInCheck(state.board, color)) {
    return allowed;
  }
  return result.filter(function (move) {
    const onHeroBlockade = state.heroBlockadeSquares.some(function (square) {
      return move.to[0] === square[0] && move.to[1] === square[1];
    });
    const onCardBlockade =
      state.blockadeSquare != null &&
      move.to[0] === state.blockadeSquare[0] &&
      move.to[1] === state.blockadeSquare[1];
    return !onHeroBlockade && !onCardBlockade;
  });
}

export function battleLegalMovesFrom(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
): Move[] {
  const piece = state.board[row][col];
  if (!piece) return [];
  return battleLegalMoves(state, deps, piece.color).filter(function (move) {
    return move.from[0] === row && move.from[1] === col;
  });
}

/** Hapus semua efek bertarget-bidak saat bidak itu hilang dari papan. */
export function clearPieceEffects(state: BattleState, piece: Piece): BattleState {
  const next = { ...state };
  if (piece.id === next.knightTargetId) next.knightTargetId = null;
  if (piece.id === next.pawnStepId) next.pawnStepId = null;
  if (piece.id === next.pawnRaidId) next.pawnRaidId = null;
  if (piece.id === next.phaseTargetId) next.phaseTargetId = null;
  if (piece.id === next.phaseJokerId) next.phaseJokerId = null;
  if (piece.id === next.prismTargetId) {
    next.prismTargetId = null;
    next.prismType = null;
  }
  if (piece.id === next.rookBendId) next.rookBendId = null;
  if (piece.id === next.playerWardPieceId) {
    next.playerWardPieceId = null;
    next.playerWardTurns = 0;
  }
  if (piece.id === next.enemyWardPieceId) next.enemyWardPieceId = null;
  if (piece.id === next.markedEnemyId) next.markedEnemyId = null;
  if (piece.id === next.staggerId) next.staggerId = null;
  if (piece.id === next.snareId) {
    next.snareId = null;
    next.snareTurns = 0;
  }
  if (piece.id === next.bossSnareId) next.bossSnareId = null;
  return next;
}

export interface CommittedMove {
  state: BattleState;
  captured: Piece | null;
}

/**
 * Terapkan langkah catur ke papan + efek tangkapan.
 * Cerminan commitMove prototipe (tanpa timer/FX/audio).
 */
export function commitBattleMove(
  state: BattleState,
  deps: BattleDeps,
  move: Move,
  color: Color,
): CommittedMove {
  const chess = deps.chess;
  const hero: HeroDef = deps.heroes[state.heroId] ?? Object.values(deps.heroes)[0];
  const fromRow = move.from[0];
  const fromCol = move.from[1];
  const toRow = move.to[0];
  const toCol = move.to[1];
  const moving = state.board[fromRow][fromCol];
  if (!moving) return { state, captured: null };
  const originalType = moving.type;
  const promotion =
    originalType === 'p' && (toRow === 0 || toRow === 7) ? (move.promotion ?? 'q') : null;
  const captured = chess.captureAt(state.board, state.enPassant, move);

  let next: BattleState = { ...state };
  if (captured && color === 'b' && captured.color === 'w' && captured.type !== 'q') {
    next = { ...next, whiteGraveyard: next.whiteGraveyard.concat([{ ...captured }]) };
  }
  const wasPawnDouble = moving.type === 'p' && Math.abs(toRow - fromRow) === 2;
  next = {
    ...next,
    castling: chess.reduceCastlingRights(next.castling, moving, move.from, captured, move.to),
    board: chess.simulateMove(next.board, move),
    enPassant: wasPawnDouble ? [(fromRow + toRow) / 2, fromCol] : null,
    lastMove: { from: [fromRow, fromCol], to: [toRow, toCol] },
    ply: next.ply + 1,
    history: next.history.concat([
      {
        color,
        piece: originalType,
        from: chess.coord(fromRow, fromCol),
        to: chess.coord(toRow, toCol),
        capture: Boolean(captured),
        captured: captured ? captured.type : null,
        castle: move.castle ?? null,
        promotion,
        enPassant: move.enPassant === true,
      },
    ]),
  };
  if (captured) {
    next = { ...next, captures: { w: next.captures.w, b: next.captures.b } };
    next.captures[color] += 1;
    if (color === 'w') {
      next = gainEnergy(next, hero.captureEnergy === 0 ? 0 : 1 + (hero.captureBonus ?? 0));
      if (next.focusCaptureArmed) {
        next = gainEnergy(next, 1);
        next = { ...next, focusCaptureArmed: false };
      }
      if (next.markedEnemyId === captured.id) {
        next = gainEnergy(next, 1);
        next = { ...next, markedEnemyId: null };
      }
      if (next.leechArmed) {
        if (next.enemyEnergy > 0) {
          next = loseEnemyEnergy(next, 1);
          next = gainEnergy(next, 1);
        }
        next = { ...next, leechArmed: false };
      }
    } else if (next.riposteArmed) {
      next = gainEnergy(next, 1);
      next = { ...next, riposteArmed: false };
    }
    if (next.salvageArmed) {
      next = gainEnergy(next, 1);
      next = { ...next, salvageArmed: false };
    }
  }
  if (next.knightTargetId === moving.id) next = { ...next, knightTargetId: null };
  if (next.pawnStepId === moving.id) next = { ...next, pawnStepId: null };
  if (next.pawnRaidId === moving.id) next = { ...next, pawnRaidId: null };
  if (next.phaseTargetId === moving.id) next = { ...next, phaseTargetId: null };
  if (next.phaseJokerId === moving.id) next = { ...next, phaseJokerId: null };
  if (next.prismTargetId === moving.id) {
    next = { ...next, prismTargetId: null, prismType: null };
  }
  if (next.rookBendId === moving.id) next = { ...next, rookBendId: null };
  if (captured) next = clearPieceEffects(next, captured);
  next = {
    ...next,
    selected: null,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
  };
  return { state: next, captured };
}

/**
 * Paruh pertama afterWhiteMove prototipe: pemicu yang memakai langkah putih
 * (guntur, sunyi, mana +1, Saka, napas, denyut, lintah, tembus).
 */
export function applyWhiteMoveTriggers(
  state: BattleState,
  deps: BattleDeps,
  captured: Piece | null,
  movedPiece: boolean,
): BattleState {
  const chess = deps.chess;
  const hero: HeroDef = deps.heroes[state.heroId] ?? Object.values(deps.heroes)[0];
  let next: BattleState = { ...state, turn: 'b', bossSealedSquare: null, heroPawnRushIds: null };
  if (next.shockArmed) {
    if (chess.isInCheck(next.board, 'b')) {
      next = loseEnemyEnergy(next, 1);
      if (next.enemyEnergy < 2) next = { ...next, enemyPreparedSkill: null };
      next = { ...next, status: 'Pukulan guntur: skak menguras 1 EN lawan.' };
    }
    next = { ...next, shockArmed: false };
  }
  if (next.quietArmed) {
    if (!captured) next = gainEnergy(next, 1);
    next = { ...next, quietArmed: false };
  }
  const lastWhiteMove = next.history[next.history.length - 1];
  const movedPawn = Boolean(lastWhiteMove && lastWhiteMove.piece === 'p' && !lastWhiteMove.note);
  if (movedPiece && !next.bossBlightArmed) next = { ...next, heroMana: Math.min(HERO_MANA_CAP, next.heroMana + 1) };
  next = {
    ...next,
    bossBlightArmed: false,
    bossSnareId: null,
    bossCardSilence: false,
    bossHeroSilence: false,
  };
  if (hero.id === 'saka' && movedPawn) next = gainEnergy(next, 1);
  if (next.pawnBreathArmed) {
    if (movedPawn && !captured) {
      const before = next.energy;
      next = gainEnergy(next, 1);
      next = {
        ...next,
        status:
          next.energy > before
            ? 'Napas pion memulihkan 1 EN.'
            : 'Napas pion terpakai; energi sudah penuh.',
      };
    }
    next = { ...next, pawnBreathArmed: false };
  }
  if (next.pawnPulseArmed) {
    if (movedPawn && chess.isInCheck(next.board, 'b')) {
      next = loseEnemyEnergy(next, 1);
      if (next.enemyEnergy < 2) next = { ...next, enemyPreparedSkill: null };
      next = { ...next, status: 'Denyut pion menguras 1 EN lawan.' };
    }
    next = { ...next, pawnPulseArmed: false };
  }
  if (next.leechArmed && !captured) next = { ...next, leechArmed: false };
  next = { ...next, pierceArmed: false };
  return next;
}

/** Gangguan lawan yang menunggu langkah putih: blokir Embun Nila atau −1 EN. */
export function applyPendingEnemyDrain(state: BattleState, hero: HeroDef): BattleState {
  if (!state.enemyDrainArmed) return state;
  let next = state;
  if (hero.id === 'nila' && !next.nilaDrainBlocked) {
    next = {
      ...next,
      nilaDrainBlocked: true,
      status: 'Embun Nila membatalkan Gangguan pertama.',
    };
  } else {
    next = { ...next, energy: Math.max(0, next.energy - 1) };
  }
  return { ...next, enemyDrainArmed: false };
}

/**
 * Kurangi durasi efek 2-balasan (ward, snare, blockade, heroBlockade).
 * Dipanggil setelah fase boss selesai, termasuk saat balasan dilewati.
 */
export function advanceBossReplyEffects(state: BattleState): BattleState {
  let next = state;
  if (next.playerWardTurns > 0) next = { ...next, playerWardTurns: next.playerWardTurns - 1 };
  if (next.playerWardTurns === 0) next = { ...next, playerWardPieceId: null };
  if (next.snareTurns > 0) next = { ...next, snareTurns: next.snareTurns - 1 };
  if (next.snareTurns === 0) next = { ...next, snareId: null };
  if (next.blockadeTurns > 0) next = { ...next, blockadeTurns: next.blockadeTurns - 1 };
  if (next.blockadeTurns === 0) next = { ...next, blockadeSquare: null };
  if (next.heroBlockadeTurns > 0) {
    next = { ...next, heroBlockadeTurns: next.heroBlockadeTurns - 1 };
  }
  if (next.heroBlockadeTurns === 0) {
    next = { ...next, heroBlockadeSquares: [], heroBlockadeName: '' };
  }
  return next;
}

interface RevivalPick {
  index: number;
  piece: Piece;
}

function findRevivalPiece(whiteGraveyard: Piece[]): RevivalPick | null {
  let best: RevivalPick | null = null;
  for (let i = whiteGraveyard.length - 1; i >= 0; i -= 1) {
    const piece = whiteGraveyard[i];
    if (
      piece.color === 'w' &&
      piece.type !== 'q' &&
      (!best || PIECE_VALUES[piece.type] > PIECE_VALUES[best.piece.type])
    ) {
      best = { index: i, piece };
    }
  }
  return best;
}

/** Petak kosong dua baris awal putih yang aman untuk kebangkitan Phoenix. */
export function revivalTargets(
  state: BattleState,
  deps: BattleDeps,
  revival: RevivalPick | null,
): Square[] {
  if (!revival) return [];
  const targets: Square[] = [];
  for (let row = 6; row <= 7; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (state.board[row][col]) continue;
      const next = state.board.map(function (boardRow) {
        return boardRow.slice();
      });
      next[row][col] = { ...revival.piece };
      if (
        !deps.chess.isInCheck(next, 'w') ||
        battleLegalMoves({ ...state, board: next }, deps, 'w').length > 0
      ) {
        targets.push([row, col]);
      }
    }
  }
  return targets;
}

export function canReviveWhitePiece(state: BattleState, deps: BattleDeps): boolean {
  return revivalTargets(state, deps, findRevivalPiece(state.whiteGraveyard)).length > 0;
}

export function hasWhiteJokerTarget(board: Board): boolean {
  return board.some(function (row) {
    return row.some(function (piece) {
      return piece != null && piece.color === 'w' && piece.type !== 'k';
    });
  });
}

export function hasBlackJokerTarget(board: Board): boolean {
  return board.some(function (row) {
    return row.some(function (piece) {
      return piece != null && piece.color === 'b' && piece.type !== 'k' && piece.type !== 'q';
    });
  });
}

export const TARGET_CARD_IDS = [
  'lancer',
  'ward',
  'pawnstep',
  'mark',
  'phase',
  'prism',
  'pawnraid',
  'rookbend',
  'stagger',
  'snare',
  'sacrifice',
  'blockade',
  'relay',
  'pawnGuard',
  'pawnMark',
  'pawnStagger',
  'fold',
  'edict',
  'phoenix',
] as const;

export const CARD_TARGET_PROMPTS: Record<string, string> = {
  lancer: 'Pilih bidak putih selain raja untuk bergerak seperti kuda.',
  ward: 'Pilih bidak putih selain raja untuk dilindungi.',
  pawnstep: 'Pilih pion putih untuk langkah ganda.',
  mark: 'Pilih bidak hitam selain raja untuk ditandai.',
  phase: 'Pilih bidak putih selain raja untuk berpindah.',
  fold: 'Pilih bidak putih selain raja untuk Lipatan Dimensi.',
  prism: 'Pilih gajah atau benteng putih.',
  pawnraid: 'Pilih pion putih yang dapat menangkap lurus.',
  rookbend: 'Pilih benteng putih.',
  stagger: 'Pilih bidak hitam selain raja untuk digentarkan.',
  snare: 'Pilih bidak hitam selain raja untuk dijerat.',
  sacrifice: 'Pilih pion putih yang akan dikorbankan. Ini memakai langkahmu.',
  pawnGuard: 'Pilih pion putih untuk ditamengi.',
  pawnMark: 'Pilih pion hitam untuk ditandai.',
  pawnStagger: 'Pilih pion hitam yang tak dapat menangkap pada balasan.',
  blockade: 'Pilih petak kosong untuk ditutup selama 2 balasan boss.',
  relay: 'Pilih bidak putih pertama untuk ditukar.',
  edict: 'Pilih satu bidak hitam selain raja dan ratu untuk dihapus.',
  phoenix: 'Pilih petak kosong di dua baris awal putih untuk menempatkan bidak yang bangkit.',
};

/** Efek kartu tanpa target: pasang flag + status (cerminan activateSkill). */
export function applyInstantCard(state: BattleState, deps: BattleDeps, slot: number): BattleState {
  const id = state.hand[slot];
  let next = state;
  if (id === 'tempo') {
    next = {
      ...next,
      tempoArmed: true,
      status: 'Tempo ganda siap. Tangkapan berikutnya memberi satu langkah tambahan.',
    };
  }
  if (id === 'ration') {
    const before = next.energy;
    next = gainEnergy(next, 2);
    next = {
      ...next,
      status: 'Ransum pulih ' + (next.energy - before) + ' EN; biaya bersih +1 EN.',
    };
  }
  if (id === 'disrupt') {
    next = loseEnemyEnergy(next, 2);
    if (next.enemyEnergy < 2) next = { ...next, enemyPreparedSkill: null };
    next = {
      ...next,
      status: 'Inti lawan kehilangan 2 EN. Skill tertunda bila energinya di bawah 2.',
    };
  }
  if (id === 'focus') {
    next = {
      ...next,
      focusCaptureArmed: true,
      status: 'Taktik presisi siap: tangkapan berikutnya memberi +1 EN.',
    };
  }
  if (id === 'pierce') {
    next = {
      ...next,
      pierceArmed: true,
      status: 'Tembus perisai siap untuk satu langkah putih.',
    };
  }
  if (id === 'shock') {
    next = {
      ...next,
      shockArmed: true,
      status: 'Pukulan guntur siap: berikan skak pada langkah berikutnya.',
    };
  }
  if (id === 'leech') {
    next = {
      ...next,
      leechArmed: true,
      status: 'Lintah arkanum siap pada tangkapan berikutnya.',
    };
  }
  if (id === 'surcharge') {
    next = {
      ...next,
      enemySurcharge: 1,
      status: 'Skill lawan berikutnya membutuhkan +1 EN.',
    };
  }
  if (id === 'counterspell') {
    const hadPlan = Boolean(
      next.enemyPreparedSkill ?? next.enemyWardPieceId ?? next.enemyDrainArmed,
    );
    next = { ...next, enemyPreparedSkill: null, enemyWardPieceId: null, enemyDrainArmed: false };
    if (!hadPlan) next = loseEnemyEnergy(next, 1);
    next = {
      ...next,
      status: hadPlan
        ? 'Skill aktif dan rencana lawan dipatahkan.'
        : 'Tidak ada rencana aktif. Inti lawan kehilangan 1 EN.',
    };
  }
  if (id === 'parry') {
    if (next.enemyDrainArmed) {
      next = { ...next, enemyDrainArmed: false };
      next = gainEnergy(next, 1);
      next = { ...next, status: 'Gangguan dipantulkan. Pulih 1 EN.' };
    } else {
      next = {
        ...next,
        parryArmed: true,
        status: 'Tangkis arus siap menghadapi Gangguan berikutnya.',
      };
    }
  }
  if (id === 'riposte') {
    next = {
      ...next,
      riposteArmed: true,
      status: 'Balas tusuk siap pada tangkapan lawan berikutnya.',
    };
  }
  if (id === 'reserve') {
    next = {
      ...next,
      reserveArmed: true,
      status: 'Fokus cadangan: kartu skill berikutnya lebih murah 1 mana.',
    };
  }
  if (id === 'quiet') {
    next = {
      ...next,
      quietArmed: true,
      status: 'Arus sunyi: langkah putih tanpa tangkapan memulihkan 1 EN.',
    };
  }
  if (id === 'pawnBreath') {
    next = {
      ...next,
      pawnBreathArmed: true,
      status: 'Napas pion siap: langkah pion tanpa tangkapan memulihkan 1 EN.',
    };
  }
  if (id === 'pawnPulse') {
    next = {
      ...next,
      pawnPulseArmed: true,
      status: 'Denyut pion siap: skak dari pion menguras 1 EN lawan.',
    };
  }
  if (id === 'lastLaugh') {
    next = {
      ...next,
      lastLaughArmed: true,
      status: 'Bangkit balik siap jika lawan memberi skak.',
    };
  }
  if (id === 'salvage') {
    next = {
      ...next,
      salvageArmed: true,
      status: 'Rongsokan siap: tangkapan berikutnya memberi +1 EN.',
    };
  }
  if (id === 'fortune') {
    next = {
      ...next,
      bonusRerolls: 1,
      status: 'Satu putar ulang ekstra tersedia giliran ini.',
    };
  }
  return replaceHandSlot(next, deps, slot, id);
}

function completeTargetCard(
  state: BattleState,
  deps: BattleDeps,
  status: string,
  selected: Square | null,
): BattleState {
  const slot = state.activeSlot;
  if (slot == null) return { ...state, status };
  const oldId = state.hand[slot];
  const cleared: BattleState = {
    ...state,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected,
    status,
  };
  return replaceHandSlot(cleared, deps, slot, oldId);
}

function finishRelay(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
  secondPiece: Piece | null,
): { state: BattleState; consumed: boolean } {
  const chess = deps.chess;
  if (!state.relayFirstId) {
    if (!secondPiece || secondPiece.color !== 'w' || secondPiece.type === 'k') {
      return {
        state: { ...state, status: 'Relay: pilih bidak putih selain raja.' },
        consumed: false,
      };
    }
    return {
      state: {
        ...state,
        relayFirstId: secondPiece.id,
        selected: [row, col],
        status: 'Pilih bidak putih kedua untuk bertukar posisi.',
      },
      consumed: false,
    };
  }
  const from = findPieceSquare(state.board, state.relayFirstId);
  if (
    !from ||
    !secondPiece ||
    secondPiece.color !== 'w' ||
    secondPiece.type === 'k' ||
    secondPiece.id === state.relayFirstId
  ) {
    return {
      state: { ...state, status: 'Pilih bidak putih kedua yang berbeda dari raja.' },
      consumed: false,
    };
  }
  const firstPiece = state.board[from[0]][from[1]];
  if (!firstPiece) {
    return {
      state: { ...state, status: 'Pilih bidak putih kedua yang berbeda dari raja.' },
      consumed: false,
    };
  }
  const swapped = state.board.map(function (boardRow) {
    return boardRow.slice();
  });
  swapped[from[0]][from[1]] = secondPiece;
  swapped[row][col] = firstPiece;
  if (chess.isInCheck(swapped, 'w')) {
    return {
      state: { ...state, status: 'Pertukaran itu membiarkan raja dalam skak. Pilih bidak lain.' },
      consumed: false,
    };
  }
  let castling = chess.reduceCastlingRights(
    state.castling,
    firstPiece,
    from,
    null,
    [row, col],
  );
  castling = chess.reduceCastlingRights(castling, secondPiece, [row, col], null, from);
  const swappedState: BattleState = {
    ...state,
    board: swapped,
    castling,
    enPassant: null,
    lastMove: { from: [from[0], from[1]], to: [row, col] },
    ply: state.ply + 1,
    history: state.history.concat([
      {
        color: 'w',
        piece: firstPiece.type,
        from: chess.coord(from[0], from[1]),
        to: chess.coord(row, col),
        capture: false,
        captured: null,
        castle: null,
        promotion: null,
        note: 'Relay bidak',
      },
    ]),
  };
  return {
    state: completeTargetCard(swappedState, deps, 'Relay selesai. Lawan bergerak.', null),
    consumed: true,
  };
}

export interface TargetResolution {
  state: BattleState;
  ok: boolean;
  message: string;
  /** True bila resolusi menghabiskan langkah putih (relay, tumbal). */
  whiteMoveConsumed: boolean;
  /** True bila pemanggil harus mengecek hasil sisi hitam (Titah Bara). */
  needsBlackOutcome: boolean;
}

/**
 * Resolusi target kartu + penerusan target hero.
 * Cerminan handleSkillTarget / handleHeroTarget prototipe.
 */
export function resolveCardTarget(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
): TargetResolution {
  const chess = deps.chess;
  const id = state.activeSkill;
  const fail = function (message: string): TargetResolution {
    return { state: { ...state, status: message }, ok: false, message, whiteMoveConsumed: false, needsBlackOutcome: false };
  };
  if (!id) {
    return {
      state,
      ok: false,
      message: state.status,
      whiteMoveConsumed: false,
      needsBlackOutcome: false,
    };
  }
  // Target hero tidak memakai slot tangan (activeSlot null, EN belum terpakai).
  if (id.indexOf('hero:') === 0) return resolveHeroTarget(state, deps, row, col);
  if (state.activeSlot == null) {
    return {
      state,
      ok: false,
      message: state.status,
      whiteMoveConsumed: false,
      needsBlackOutcome: false,
    };
  }
  const piece = state.board[row][col];
  if (id === 'phoenix') {
    const revival = findRevivalPiece(state.whiteGraveyard);
    if (!revival) {
      return fail('Belum ada bidak putih non-ratu yang gugur untuk dibangkitkan.');
    }
    if (row < 6 || state.board[row][col]) {
      return fail('Pilih petak kosong di salah satu dari dua baris awal putih.');
    }
    const placed = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    placed[row][col] = { ...revival.piece };
    if (
      chess.isInCheck(placed, 'w') &&
      battleLegalMoves({ ...state, board: placed }, deps, 'w').length === 0
    ) {
      return fail('Penempatan itu menghilangkan semua langkah untuk menyelamatkan raja. Pilih petak lain.');
    }
    const graveyard = state.whiteGraveyard.slice();
    graveyard.splice(revival.index, 1);
    const done = completeTargetCard(
      { ...state, board: placed, whiteGraveyard: graveyard },
      deps,
      PIECE_NAMES[revival.piece.type] + ' putih bangkit di ' + chess.coord(row, col) + '.',
      null,
    );
    return { state: done, ok: true, message: done.status, whiteMoveConsumed: false, needsBlackOutcome: false };
  }
  if (id === 'edict') {
    if (!piece || piece.color !== 'b' || piece.type === 'k' || piece.type === 'q') {
      return fail('Pilih satu bidak hitam selain raja dan ratu.');
    }
    const cleared = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    cleared[row][col] = null;
    let enPassant = state.enPassant;
    if (piece.type === 'p' && enPassant && row === enPassant[0] + 1 && col === enPassant[1]) {
      enPassant = null;
    }
    let castling = state.castling;
    if (piece.type === 'r' && row === 0) {
      castling = chess.reduceCastlingRights(
        castling,
        piece,
        [row, col],
        piece,
        [row, col],
      );
    }
    let next: BattleState = { ...state, board: cleared, enPassant, castling };
    next = clearPieceEffects(next, piece);
    const done = completeTargetCard(
      next,
      deps,
      PIECE_NAMES[piece.type] + ' hitam dihapus. Ini bukan tangkapan.',
      null,
    );
    return { state: done, ok: true, message: done.status, whiteMoveConsumed: false, needsBlackOutcome: false };
  }
  if (id === 'relay') {
    const relay = finishRelay(state, deps, row, col, piece);
    return {
      state: relay.state,
      ok: relay.consumed || relay.state.relayFirstId !== state.relayFirstId,
      message: relay.state.status,
      whiteMoveConsumed: relay.consumed,
      needsBlackOutcome: false,
    };
  }
  if (id === 'blockade') {
    if (piece) return fail('Blokade hanya dapat menutup petak kosong.');
    const done = completeTargetCard(
      { ...state, blockadeSquare: [row, col], blockadeTurns: 2 },
      deps,
      'Blokade dipasang di ' + chess.coord(row, col) + ' selama 2 balasan boss.',
      null,
    );
    return { state: done, ok: true, message: done.status, whiteMoveConsumed: false, needsBlackOutcome: false };
  }
  const enemyTarget =
    id === 'mark' || id === 'stagger' || id === 'snare' || id === 'pawnMark' || id === 'pawnStagger';
  if (!piece || piece.color !== (enemyTarget ? 'b' : 'w')) {
    return fail(enemyTarget ? 'Pilih bidak hitam selain raja.' : 'Pilih bidak putih yang sesuai.');
  }
  if (piece.type === 'k' && ['lancer', 'ward', 'phase', 'fold', 'mark', 'stagger', 'snare'].indexOf(id) !== -1) {
    return fail('Skill ini tidak menargetkan raja.');
  }
  if (['pawnGuard', 'pawnMark', 'pawnStagger'].indexOf(id) !== -1 && piece.type !== 'p') {
    return fail('Kartu gratis ini hanya menargetkan pion.');
  }
  if (id === 'pawnstep' || id === 'pawnraid') {
    if (piece.type !== 'p') return fail('Skill ini hanya menargetkan pion.');
  }
  if (id === 'prism' && piece.type !== 'b' && piece.type !== 'r') {
    return fail('Prisma gerak hanya menargetkan gajah atau benteng.');
  }
  if (id === 'rookbend' && piece.type !== 'r') {
    return fail('Belok benteng hanya menargetkan benteng.');
  }
  if (id === 'sacrifice') {
    if (piece.type !== 'p') return fail('Tumbal pion hanya dapat mengorbankan pion.');
    const removed = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    removed[row][col] = null;
    if (chess.isInCheck(removed, 'w')) {
      return fail('Pion itu menjaga raja dari skak. Pilih pion lain.');
    }
    const sacrificed: BattleState = {
      ...state,
      board: removed,
      enPassant: null,
      energy: Math.min(ENERGY_CAP, state.energy + 3),
      lastMove: null,
      ply: state.ply + 1,
      history: state.history.concat([
        {
          color: 'w',
          piece: 'p',
          from: chess.coord(row, col),
          to: chess.coord(row, col),
          capture: false,
          captured: null,
          castle: null,
          promotion: null,
          note: 'Tumbal pion: +3 EN',
        },
      ]),
    };
    const done = completeTargetCard(
      sacrificed,
      deps,
      'Pion dikorbankan. Pulih 3 EN, lalu giliran lawan.',
      null,
    );
    return { state: done, ok: true, message: done.status, whiteMoveConsumed: true, needsBlackOutcome: false };
  }
  let next: BattleState = state;
  if (id === 'lancer') next = { ...next, knightTargetId: piece.id };
  if (id === 'ward' || id === 'pawnGuard') {
    next = { ...next, playerWardPieceId: piece.id, playerWardTurns: 2 };
  }
  if (id === 'pawnstep') next = { ...next, pawnStepId: piece.id };
  if (id === 'mark') next = { ...next, markedEnemyId: piece.id };
  if (id === 'pawnMark') next = { ...next, markedEnemyId: piece.id };
  if (id === 'phase') next = { ...next, phaseTargetId: piece.id };
  if (id === 'fold') next = { ...next, phaseTargetId: piece.id, phaseJokerId: piece.id };
  if (id === 'prism') {
    next = { ...next, prismTargetId: piece.id, prismType: piece.type === 'b' ? 'r' : 'b' };
  }
  if (id === 'pawnraid') next = { ...next, pawnRaidId: piece.id };
  if (id === 'rookbend') next = { ...next, rookBendId: piece.id };
  if (id === 'stagger') next = { ...next, staggerId: piece.id };
  if (id === 'pawnStagger') next = { ...next, staggerId: piece.id };
  if (id === 'snare') next = { ...next, snareId: piece.id, snareTurns: 2 };
  const wantsMoveNow =
    ['lancer', 'pawnstep', 'phase', 'fold', 'prism', 'pawnraid', 'rookbend'].indexOf(id) !== -1;
  const card = deps.cards[id];
  let message = (card ? card.name : id) + ' siap di ' + chess.coord(row, col) + '. Gerakkan bidak ini.';
  if (id === 'fold') {
    message = 'Lipatan dimensi siap di ' + chess.coord(row, col) + '. Pindahkan bidak ini ke petak kosong mana pun.';
  }
  if (id === 'ward' || id === 'pawnGuard') {
    message = 'Perisai melindungi ' + chess.coord(row, col) + ' selama 2 balasan boss.';
  }
  if (id === 'mark') message = 'Tanda buru dipasang di ' + chess.coord(row, col) + '.';
  if (id === 'pawnMark') {
    message = 'Pion hitam di ' + chess.coord(row, col) + ' ditandai. Tangkap sekarang untuk +1 EN.';
  }
  if (id === 'stagger') message = 'Bidak di ' + chess.coord(row, col) + ' tak dapat menangkap pada balasan.';
  if (id === 'pawnStagger') {
    message = 'Pion di ' + chess.coord(row, col) + ' tak dapat menangkap pada balasan.';
  }
  if (id === 'snare') message = 'Bidak di ' + chess.coord(row, col) + ' terjerat selama 2 balasan boss.';
  const done = completeTargetCard(next, deps, message, wantsMoveNow ? [row, col] : null);
  return { state: done, ok: true, message: done.status, whiteMoveConsumed: false, needsBlackOutcome: false };
}

/** Masuk mode target hero tanpa memakai EN (EN dipakai saat konfirmasi). */
export function beginHeroTarget(state: BattleState, targetId: string, prompt: string): BattleState {
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

/** Selesaikan target hero: potong 2 EN (skill) / 5 EN (ultimate). */
export function completeHeroTarget(
  state: BattleState,
  status: string,
  selected: Square | null,
): BattleState {
  const isUltimate = (state.activeSkill ?? '').indexOf('hero:ultimate:') === 0;
  return {
    ...state,
    energy: Math.max(0, state.energy - (isUltimate ? 5 : 2)),
    activeSkill: null,
    activeSlot: null,
    selected,
    status,
  };
}

/** Resolusi target skill / ultimate hero. Cerminan handleHeroTarget. */
export function resolveHeroTarget(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
): TargetResolution {
  const chess = deps.chess;
  const id = state.activeSkill ?? '';
  const fail = function (message: string): TargetResolution {
    return { state: { ...state, status: message }, ok: false, message, whiteMoveConsumed: false, needsBlackOutcome: false };
  };
  const done = function (next: BattleState): TargetResolution {
    return { state: next, ok: true, message: next.status, whiteMoveConsumed: false, needsBlackOutcome: false };
  };
  const piece = state.board[row][col];
  if (id === 'hero:skill:blockade' || id === 'hero:ultimate:citadel') {
    if (piece) return fail('Blokade Liora hanya dapat dipasang pada petak kosong.');
    const citadelOffsets: Square[] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    const squares =
      id === 'hero:ultimate:citadel'
        ? citadelOffsets
            .map(function (offset) {
              return [row + offset[0], col + offset[1]] as Square;
            })
            .filter(function (square) {
              return (
                square[0] >= 0 &&
                square[0] < 8 &&
                square[1] >= 0 &&
                square[1] < 8 &&
                !state.board[square[0]][square[1]]
              );
            })
        : [[row, col] as Square];
    const bossMoves = battleLegalMoves(state, deps, 'b');
    const bossHasAnswer =
      chess.isInCheck(state.board, 'b') ||
      bossMoves.some(function (move) {
        return !squares.some(function (square) {
          return move.to[0] === square[0] && move.to[1] === square[1];
        });
      });
    if (!bossHasAnswer) {
      return fail('Blokade itu akan menutup semua langkah boss dan menghasilkan remis. Pilih petak lain.');
    }
    const blocked: BattleState = {
      ...state,
      heroBlockadeSquares: squares,
      heroBlockadeTurns: 2,
      heroBlockadeName: id === 'hero:ultimate:citadel' ? 'Benteng Prisma' : 'Segel Petak',
    };
    const effect =
      id === 'hero:ultimate:citadel'
        ? 'Benteng Prisma menutup ' + squares.length + ' petak dari pendaratan boss selama 2 balasan.'
        : 'Segel Petak menutup ' + chess.coord(row, col) + ' dari pendaratan boss selama 2 balasan.';
    return done(completeHeroTarget(blocked, effect, null));
  }
  if (id === 'hero:skill:phase' || id === 'hero:ultimate:fold') {
    if (!piece || piece.color !== 'w' || piece.type === 'k') {
      return fail('Pilih bidak putih selain raja.');
    }
    let next: BattleState = { ...state, phaseTargetId: piece.id };
    if (id === 'hero:ultimate:fold') next = { ...next, phaseJokerId: piece.id };
    return done(
      completeHeroTarget(
        next,
        id === 'hero:ultimate:fold'
          ? 'Gerbang Lintas aktif untuk ' + PIECE_NAMES[piece.type] + '.'
          : 'Pergeseran Rembulan aktif untuk ' + PIECE_NAMES[piece.type] + '.',
        null,
      ),
    );
  }
  if (id === 'hero:skill:ward') {
    if (!piece || piece.color !== 'w' || piece.type === 'k') {
      return fail('Pilih bidak putih selain raja.');
    }
    return done(
      completeHeroTarget(
        { ...state, playerWardPieceId: piece.id, playerWardTurns: 2 },
        'Embun Pelindung menjaga ' + PIECE_NAMES[piece.type] + ' selama 2 balasan boss.',
        null,
      ),
    );
  }
  if (id === 'hero:skill:pawnstep') {
    if (!piece || piece.color !== 'w' || piece.type !== 'p') return fail('Pilih pion putih.');
    return done(
      completeHeroTarget(
        { ...state, pawnStepId: piece.id },
        'Langkah Pelopor siap untuk pion terpilih.',
        null,
      ),
    );
  }
  if (id === 'hero:skill:snare') {
    if (!piece || piece.color !== 'b' || piece.type === 'k') {
      return fail('Pilih bidak hitam selain raja.');
    }
    return done(
      completeHeroTarget(
        { ...state, snareId: piece.id, snareTurns: 2 },
        'Jerat Senyap mengikat ' + PIECE_NAMES[piece.type] + ' selama 2 balasan boss.',
        null,
      ),
    );
  }
  if (id === 'hero:ultimate:smite') {
    if (!piece || piece.color !== 'b' || piece.type === 'k' || piece.type === 'q') {
      return fail('Titah Bara hanya menargetkan bidak hitam selain raja dan ratu.');
    }
    const cleared = state.board.map(function (boardRow) {
      return boardRow.slice();
    });
    cleared[row][col] = null;
    let castling = state.castling;
    if (piece.type === 'r' && row === 0) {
      castling = chess.reduceCastlingRights(castling, piece, [row, col], piece, [row, col]);
    }
    let next: BattleState = { ...state, board: cleared, enPassant: null, castling };
    next = clearPieceEffects(next, piece);
    next = completeHeroTarget(
      next,
      'Titah Bara menghapus ' + PIECE_NAMES[piece.type] + ' hitam tanpa menghitungnya sebagai tangkapan.',
      null,
    );
    return {
      state: next,
      ok: true,
      message: next.status,
      whiteMoveConsumed: false,
      needsBlackOutcome: true,
    };
  }
  return {
    state,
    ok: false,
    message: state.status,
    whiteMoveConsumed: false,
    needsBlackOutcome: false,
  };
}

/** Nyala Pemburu (Bara): tangkapan berikutnya +1 EN. */
export function applyBaraSkill(state: BattleState): BattleState {
  return {
    ...state,
    energy: Math.max(0, state.energy - 2),
    focusCaptureArmed: true,
    status: 'Nyala Pemburu siap: tangkapan berikutnya memulihkan 1 EN tambahan.',
  };
}

/** Mata Air (Nila): semua bidak putih kebal tangkapan selama 1 balasan. */
export function applyAegisUltimate(state: BattleState): BattleState {
  return {
    ...state,
    energy: Math.max(0, state.energy - 5),
    heroAegisActive: true,
    status: 'Mata Air melindungi semua bidak putih dari satu balasan.',
  };
}

/** Pawai Bidak (Saka): semua pion boleh maju dua petak; null bila tak ada pion. */
export function applyPawnRushUltimate(state: BattleState): BattleState | null {
  const pawns = state.board
    .flat()
    .filter(function (piece) {
      return piece != null && piece.color === 'w' && piece.type === 'p';
    })
    .map(function (piece) {
      return (piece as Piece).id;
    });
  if (pawns.length === 0) return null;
  return {
    ...state,
    energy: Math.max(0, state.energy - 5),
    heroPawnRushIds: pawns,
    status: 'Pawai Bidak siap: semua pion dapat maju dua petak dari posisinya.',
  };
}

/** Saat Beku (Veyra): balasan boss dilewati setelah langkah putih berikutnya. */
export function applySkipUltimate(state: BattleState): BattleState {
  return {
    ...state,
    energy: Math.max(0, state.energy - 5),
    heroSkipEnemyTurn: true,
    status: 'Saat Beku siap: balasan boss dilewati setelah langkah putih berikutnya.',
  };
}

/** Nilai EN yang pulih dari Ransum Fokus (untuk pesan biaya bersih). */
export function rationGain(state: BattleState): number {
  return Math.min(ENERGY_CAP, state.energy + 2) - state.energy;
}

export { gainEnergy, gainEnemyEnergy };

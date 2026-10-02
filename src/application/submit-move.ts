// Use case langkah: seleksi, kirim langkah, promosi, dan balasan hitam.
// Fase hitam (runBlackReply) dipanggil UI setelah jeda "berpikir".

import type {
  BattleDeps,
  BattleState,
  CommandResult,
  PromotionChoice,
} from '../domain/battle/state.ts';
import {
  choosePromotion,
  movePiece,
  runBlackReply,
  selectPiece,
  tapSquare,
} from '../domain/battle/commands.ts';
import type { AudioPort } from './play-card.ts';
import { noAudio } from './play-card.ts';

function captureSoundFor(battle: BattleState, audio: AudioPort): void {
  const last = battle.history[battle.history.length - 1];
  if (last) audio.play(last.capture ? 'capture' : 'move');
}

export function selectPieceFlow(
  battle: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
): CommandResult {
  return selectPiece(battle, deps, row, col);
}

/** Tangani klik petak beserta feedback audio untuk seleksi, langkah, dan gagal. */
export function tapSquareFlow(
  battle: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
  audio: AudioPort = noAudio,
  alreadyDefeated = false,
): CommandResult {
  const result = tapSquare(battle, deps, row, col, alreadyDefeated);
  if (!result.ok) {
    if (result.message !== battle.status) audio.play('error');
    return result;
  }
  if (result.state.history.length > battle.history.length) {
    captureSoundFor(result.state, audio);
  } else if (result.state.selected !== battle.selected) {
    audio.play(result.state.selected ? 'select' : 'toggle');
  }
  return result;
}

/** Kirim langkah putih; tahap promosi bila pion mencapai baris terakhir. */
export function submitMoveFlow(
  battle: BattleState,
  deps: BattleDeps,
  from: [number, number],
  to: [number, number],
  audio: AudioPort = noAudio,
  alreadyDefeated = false,
): CommandResult {
  const result = movePiece(battle, deps, from, to, alreadyDefeated);
  if (!result.ok || result.state.pendingPromotion) return result;
  captureSoundFor(result.state, audio);
  return result;
}

/** Konfirmasi promosi pion putih menjadi q/r/b/n. */
export function choosePromotionFlow(
  battle: BattleState,
  deps: BattleDeps,
  piece: PromotionChoice,
  audio: AudioPort = noAudio,
  alreadyDefeated = false,
): CommandResult {
  const result = choosePromotion(battle, deps, piece, alreadyDefeated);
  if (!result.ok) return result;
  audio.play('promotion');
  const last = result.state.history[result.state.history.length - 1];
  if (last?.capture) audio.play('capture');
  return result;
}

export interface BlackReplyResult {
  battle: BattleState;
  moved: boolean;
}

/**
 * Jalankan balasan hitam. Bunyi langkah/tangkapan + bunyi skill lawan bila
 * EN lawan turun (tepat saat skill Perisai/Gangguan aktif, seperti prototipe).
 */
export function advanceBlackReplyFlow(
  battle: BattleState,
  deps: BattleDeps,
  audio: AudioPort = noAudio,
  alreadyDefeated = false,
): BlackReplyResult {
  if (battle.gameOver || battle.turn !== 'b') return { battle, moved: false };
  const enemyBefore = battle.enemyEnergy;
  const historyBefore = battle.history.length;
  const next = runBlackReply(battle, deps, alreadyDefeated);
  const last = next.history[next.history.length - 1];
  if (next.history.length > historyBefore && last && last.color === 'b') {
    audio.play(last.capture ? 'capture' : 'move');
  }
  if (next.enemyEnergy < enemyBefore) audio.play('enemy');
  return { battle: next, moved: true };
}

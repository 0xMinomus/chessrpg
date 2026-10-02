// Use case kartu: mainkan, selesaikan target, batalkan, putar ulang.
// Memetakan hasil command domain ke efek audio lewat port AudioPort.

import type { SoundKind } from '../adapters/browser-audio.ts';
import type {
  BattleDeps,
  BattleState,
  CommandResult,
} from '../domain/battle/state.ts';
import {
  cancelTarget,
  playCard,
  rerollHand,
  resolveTarget,
} from '../domain/battle/commands.ts';

export interface AudioPort {
  play(kind: SoundKind): void;
}

export const noAudio: AudioPort = {
  play() {
    /* tanpa audio */
  },
};

function isResourceFailure(message: string): boolean {
  return (
    message.indexOf('Butuh ') === 0 ||
    message.indexOf('membutuhkan ') !== -1 ||
    message.indexOf('belum cukup') !== -1 ||
    message.indexOf('Energi sudah penuh') === 0
  );
}

/**
 * Mainkan kartu di slot tangan. Sukses → bunyi skill; toggle batal lewat
 * klik kartu aktif → bunyi toggle; gagal resource → bunyi error.
 */
export function playCardFlow(
  battle: BattleState,
  deps: BattleDeps,
  slot: number,
  audio: AudioPort = noAudio,
): CommandResult {
  const wasTargetingSlot = battle.activeSkill != null && battle.activeSlot === slot;
  const result = playCard(battle, deps, slot);
  if (!result.ok) {
    if (isResourceFailure(result.message)) audio.play('error');
    return result;
  }
  audio.play(wasTargetingSlot ? 'toggle' : 'skill');
  return result;
}

/**
 * Selesaikan target kartu / hero pada petak (row, col).
 * alreadyDefeated dibaca dari campaign.defeatedBosses untuk teks status.
 */
export function resolveCardTargetFlow(
  battle: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
  audio: AudioPort = noAudio,
  alreadyDefeated = false,
): CommandResult {
  const result = resolveTarget(battle, deps, row, col, alreadyDefeated);
  if (result.ok) audio.play('skill');
  return result;
}

/** Batalkan target aktif (refund mana kartu / gratis untuk hero). */
export function cancelTargetFlow(
  battle: BattleState,
  deps: BattleDeps,
  audio: AudioPort = noAudio,
): CommandResult {
  const result = cancelTarget(battle, deps);
  if (result.ok) audio.play('toggle');
  return result;
}

/** Putar ulang seluruh tangan: putaran pertama gratis, berikutnya 1 EN. */
export function rerollHandFlow(
  battle: BattleState,
  deps: BattleDeps,
  audio: AudioPort = noAudio,
): CommandResult {
  const result = rerollHand(battle, deps);
  if (!result.ok) {
    if (isResourceFailure(result.message)) audio.play('error');
    return result;
  }
  audio.play('roll');
  return result;
}

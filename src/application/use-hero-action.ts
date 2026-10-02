// Use case aksi hero: skill (2 EN), ultimate (5 EN), dan resolusi targetnya.

import type {
  BattleDeps,
  BattleState,
  CommandResult,
} from '../domain/battle/state.ts';
import { resolveTarget, useHeroSkill, useHeroUltimate } from '../domain/battle/commands.ts';
import type { AudioPort } from './play-card.ts';
import { noAudio } from './play-card.ts';

/** Skill hero: sukses → skill; EN kurang → error. */
export function useHeroSkillFlow(
  battle: BattleState,
  deps: BattleDeps,
  audio: AudioPort = noAudio,
): CommandResult {
  const wasTargeting = (battle.activeSkill ?? '').indexOf('hero:skill:') === 0;
  const result = useHeroSkill(battle, deps);
  if (!result.ok) {
    if (result.message.indexOf('membutuhkan ') !== -1) audio.play('error');
    return result;
  }
  audio.play(wasTargeting ? 'toggle' : 'skill');
  return result;
}

/** Ultimate hero: sukses → skill; EN kurang → error. */
export function useHeroUltimateFlow(
  battle: BattleState,
  deps: BattleDeps,
  audio: AudioPort = noAudio,
): CommandResult {
  const wasTargeting = (battle.activeSkill ?? '').indexOf('hero:ultimate:') === 0;
  const result = useHeroUltimate(battle, deps);
  if (!result.ok) {
    if (result.message.indexOf('membutuhkan ') !== -1) audio.play('error');
    return result;
  }
  audio.play(wasTargeting ? 'toggle' : 'skill');
  return result;
}

/** Selesaikan target skill / ultimate hero pada petak (row, col). */
export function resolveHeroTargetFlow(
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

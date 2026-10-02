// Use case undo: batalkan satu putaran putih-hitam penuh.

import type { BattleState, CommandResult } from '../domain/battle/state.ts';
import { canUndo, undoTurn } from '../domain/battle/commands.ts';

export function canUndoFlow(battle: BattleState): boolean {
  return canUndo(battle);
}

/** Batalkan giliran terakhir (tanpa bunyi, seperti prototipe). */
export function undoTurnFlow(battle: BattleState): CommandResult {
  return undoTurn(battle);
}

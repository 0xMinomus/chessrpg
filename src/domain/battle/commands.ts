// Command bernama battle: satu-satunya jalan mengubah BattleState.
// Setiap command memvalidasi state dan mengembalikan {state, ok, message}.
// UI / application tidak menghitung aturan sendiri: seleksi, langkah,
// kartu, hero, promosi, undo, restart, dan fase hitam semua lewat sini.

import {
  HERO_SKILL_ENERGY_COST,
  HERO_ULTIMATE_ENERGY_COST,
  createInitialBattle,
  restoreBattleSnapshot,
  snapshotBattle,
  type BattleDeps,
  type BattleState,
  type CommandResult,
  type HeroDef,
  type Move,
  type Piece,
  type PromotionChoice,
} from './state.ts';
import {
  canPlayCard,
  currentCardCost,
  gainEnergy,
  makeHand,
  payCardCost,
  refundCardCost,
  rerollCost,
  rerollLimit,
} from './resources.ts';
import {
  advanceBossReplyEffects,
  applyAegisUltimate,
  applyBaraSkill,
  applyInstantCard,
  applyPawnRushUltimate,
  applyPendingEnemyDrain,
  applySkipUltimate,
  applyWhiteMoveTriggers,
  battleLegalMoves,
  battleLegalMovesFrom,
  beginHeroTarget,
  canReviveWhitePiece,
  commitBattleMove,
  hasBlackJokerTarget,
  hasWhiteJokerTarget,
  resolveCardTarget,
  CARD_TARGET_PROMPTS,
  TARGET_CARD_IDS,
} from './effects.ts';
import { applyBossRule, chooseComputerMove, resolveEnemySkill } from './ai.ts';
import { checkOutcome } from './result.ts';

function heroOf(deps: BattleDeps, state: BattleState): HeroDef {
  return deps.heroes[state.heroId] ?? Object.values(deps.heroes)[0];
}

function busy(state: BattleState): boolean {
  return state.gameOver || state.thinking || state.turn !== 'w';
}

function fail(state: BattleState, message: string): CommandResult {
  return { state: { ...state, status: message }, ok: false, message };
}

/** Arsipkan awal ronde + reset counter giliran (cerminan finishFullTurn). */
export function finishFullTurn(state: BattleState): BattleState {
  const past = state.anchor ? state.past.concat([state.anchor]) : state.past;
  const next: BattleState = {
    ...state,
    past,
    turnNo: state.turnNo + 1,
    rollsThisTurn: 0,
    bonusRerolls: 0,
    freeSkillUsedThisTurn: state.gameOver ? state.freeSkillUsedThisTurn : false,
  };
  return { ...next, anchor: snapshotBattle(next) };
}

function sameAnchorForUndo(state: BattleState): boolean {
  const start = state.anchor;
  if (!start || state.ply !== start.ply) return false;
  return (
    state.energy === start.energy &&
    JSON.stringify(state.hand) === JSON.stringify(start.hand) &&
    state.activeSkill === start.activeSkill &&
    state.knightTargetId === start.knightTargetId &&
    state.tempoArmed === start.tempoArmed &&
    state.rollsThisTurn === start.rollsThisTurn &&
    state.enemyEnergy === start.enemyEnergy &&
    JSON.stringify(state.blockadeSquare) === JSON.stringify(start.blockadeSquare) &&
    state.blockadeTurns === start.blockadeTurns &&
    JSON.stringify(state.heroBlockadeSquares) === JSON.stringify(start.heroBlockadeSquares) &&
    state.heroBlockadeTurns === start.heroBlockadeTurns &&
    state.heroBlockadeName === start.heroBlockadeName &&
    state.snareTurns === start.snareTurns &&
    state.enemyDrainArmed === start.enemyDrainArmed &&
    state.playerWardPieceId === start.playerWardPieceId &&
    state.playerWardTurns === start.playerWardTurns &&
    state.heroMana === start.heroMana
  );
}

export function canUndo(state: BattleState): boolean {
  return (
    state.past.length > 0 && !state.thinking && (state.turn === 'w' || state.gameOver) && sameAnchorForUndo(state)
  );
}

/** Batalkan satu putaran putih-hitam penuh (cerminan undoTurn prototipe). */
export function undoTurn(state: BattleState): CommandResult {
  if (!canUndo(state)) return { state, ok: false, message: state.status };
  const snapshot = state.past[state.past.length - 1];
  const restored = restoreBattleSnapshot(state, snapshot);
  const next: BattleState = {
    ...restored,
    past: state.past.slice(0, -1),
    status: 'Giliran terakhir dibatalkan.',
  };
  return {
    state: { ...next, anchor: snapshotBattle(next) },
    ok: true,
    message: 'Giliran terakhir dibatalkan.',
  };
}

/** Ulangi duel dari posisi awal dengan hero + boss yang sama. */
export function restartBattle(prev: BattleState, deps: BattleDeps): CommandResult {
  const hero = deps.heroes[prev.heroId] ?? Object.values(deps.heroes)[0];
  const boss = deps.bosses[prev.bossId] ?? Object.values(deps.bosses)[0];
  const fresh = createInitialBattle({
    hero,
    boss,
    board: deps.chess.initialBoard(),
    hand: makeHand([], deps),
  });
  return { state: fresh, ok: true, message: fresh.status };
}

/**
 * Lanjutan setelah langkah putih dikomit (cerminan afterWhiteMove tanpa
 * penjadwalan timer): pemicu putih → skakmat hitam → tempo → drain →
 * Saat Beku → serahkan ke hitam (thinking=true agar UI menjadwalkan
 * runBlackReply).
 */
export function continueAfterWhiteMove(
  state: BattleState,
  deps: BattleDeps,
  captured: Piece | null,
  movedPiece: boolean,
  alreadyDefeated: boolean,
): BattleState {
  const hero = heroOf(deps, state);
  const boss = deps.bosses[state.bossId] ?? Object.values(deps.bosses)[0];
  let next = applyWhiteMoveTriggers(state, deps, captured, movedPiece);
  const outcome = checkOutcome(next, deps, 'b', boss, alreadyDefeated);
  next = outcome.state;
  if (outcome.ended) {
    next = { ...next, enemyWardPieceId: null, enemyDrainArmed: false };
    return finishFullTurn(next);
  }
  if (captured && next.tempoArmed) {
    return {
      ...next,
      tempoArmed: false,
      extraMovePending: true,
      enemyWardPieceId: null,
      turn: 'w',
      status: 'Tempo ganda aktif. Putih bergerak sekali lagi.',
    };
  }
  next = { ...next, enemyWardPieceId: null, extraMovePending: false };
  next = applyPendingEnemyDrain(next, hero);
  if (next.heroSkipEnemyTurn) {
    next = advanceBossReplyEffects({ ...next, heroSkipEnemyTurn: false });
    next = {
      ...next,
      markedEnemyId: null,
      staggerId: null,
      parryArmed: false,
      riposteArmed: false,
      salvageArmed: false,
      enemyDrainArmed: false,
      enemyWardPieceId: null,
      heroAegisActive: false,
      turn: 'w',
      status: 'Saat Beku: balasan boss dilewati.',
    };
    return finishFullTurn(next);
  }
  return { ...next, thinking: true, status: 'Lawan sedang memilih langkah.' };
}

/**
 * Fase hitam penuh (cerminan inti playBlackMove): AI bergerak, skill lawan,
 * Bangkit Balik, susut durasi, aturan boss, hasil sisi putih, arsip ronde.
 */
export function runBlackReply(
  state: BattleState,
  deps: BattleDeps,
  alreadyDefeated: boolean,
): BattleState {
  if (state.gameOver) return state;
  const boss = deps.bosses[state.bossId] ?? Object.values(deps.bosses)[0];
  let next = state;
  const moves = battleLegalMoves(next, deps, 'b');
  if (moves.length === 0) {
    next = { ...next, thinking: false };
    const outcome = checkOutcome(next, deps, 'b', boss, alreadyDefeated);
    return finishFullTurn(outcome.state);
  }
  const move = chooseComputerMove(next, deps, moves);
  const committed = commitBattleMove(next, deps, move, 'b');
  next = committed.state;
  next = resolveEnemySkill(next, deps, committed.captured != null);
  if (next.lastLaughArmed) {
    if (deps.chess.isInCheck(next.board, 'w')) next = gainEnergy(next, 2);
    next = { ...next, lastLaughArmed: false };
  }
  next = advanceBossReplyEffects(next);
  next = {
    ...next,
    markedEnemyId: null,
    staggerId: null,
    parryArmed: false,
    riposteArmed: false,
    salvageArmed: false,
    heroAegisActive: false,
    thinking: false,
    turn: 'w',
  };
  const outcome = checkOutcome(next, deps, 'w', boss, alreadyDefeated);
  next = outcome.state;
  if (outcome.ended) {
    next = { ...next, enemyDrainArmed: false, enemyWardPieceId: null };
  } else {
    next = {
      ...next,
      status:
        next.status.indexOf('Skak.') === 0 ? next.status : 'Giliran putih. Pilih langkah berikutnya.',
    };
    next = applyBossRule(next, deps, boss);
  }
  return finishFullTurn(next);
}

/** Pilih bidak putih untuk melihat langkah legal. */
export function selectPiece(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
): CommandResult {
  if (busy(state) || state.pendingPromotion || state.activeSkill) {
    return { state, ok: false, message: state.status };
  }
  const piece = state.board[row][col];
  if (!piece || piece.color !== 'w') {
    return fail(state, 'Pilih bidak putih terlebih dahulu.');
  }
  const moves = battleLegalMovesFrom(state, deps, row, col);
  const status =
    moves.length > 0
      ? 'Pilih petak tujuan yang menyala.'
      : 'Bidak ini belum memiliki langkah legal.';
  return { state: { ...state, selected: [row, col], status }, ok: true, message: status };
}

/** Kirim langkah putih dari petak asal ke tujuan (atau tahap promosi). */
export function movePiece(
  state: BattleState,
  deps: BattleDeps,
  from: [number, number],
  to: [number, number],
  alreadyDefeated = false,
): CommandResult {
  if (busy(state)) return { state, ok: false, message: state.status };
  if (state.pendingPromotion) {
    return { state, ok: false, message: 'Pilih bidak promosi terlebih dahulu.' };
  }
  if (state.activeSkill) {
    return fail(state, 'Selesaikan target atau batalkan kartu aktif.');
  }
  const moves = battleLegalMovesFrom(state, deps, from[0], from[1]);
  const chosen = moves.find(function (move) {
    return move.to[0] === to[0] && move.to[1] === to[1];
  });
  if (!chosen) {
    return fail(state, 'Langkah itu tidak legal untuk bidak ini.');
  }
  const moving = state.board[chosen.from[0]][chosen.from[1]];
  if (moving && moving.type === 'p' && (chosen.to[0] === 0 || chosen.to[0] === 7)) {
    const staged: Move = {
      from: [chosen.from[0], chosen.from[1]],
      to: [chosen.to[0], chosen.to[1]],
    };
    if (chosen.castle) staged.castle = chosen.castle;
    if (chosen.enPassant) staged.enPassant = true;
    const message = 'Pion mencapai baris terakhir. Pilih bidak promosi.';
    return {
      state: { ...state, pendingPromotion: staged, status: message },
      ok: true,
      message,
    };
  }
  const committed = commitBattleMove(state, deps, chosen, 'w');
  const next = continueAfterWhiteMove(committed.state, deps, committed.captured, true, alreadyDefeated);
  return { state: next, ok: true, message: next.status };
}

/** Konfirmasi promosi pion putih (q/r/b/n). */
export function choosePromotion(
  state: BattleState,
  deps: BattleDeps,
  piece: PromotionChoice,
  alreadyDefeated = false,
): CommandResult {
  const pending = state.pendingPromotion;
  if (!pending) return { state, ok: false, message: state.status };
  if (['q', 'r', 'b', 'n'].indexOf(piece) === -1) {
    return fail(state, 'Pilihan promosi tidak valid.');
  }
  const move: Move = { ...pending, promotion: piece };
  const cleared: BattleState = { ...state, pendingPromotion: null };
  const committed = commitBattleMove(cleared, deps, move, 'w');
  const next = continueAfterWhiteMove(committed.state, deps, committed.captured, true, alreadyDefeated);
  return { state: next, ok: true, message: next.status };
}

/** Aktifkan kartu tangan: masuk mode target atau langsung terapkan efek. */
export function playCard(state: BattleState, deps: BattleDeps, slot: number): CommandResult {
  const id = state.hand[slot];
  const card = id ? deps.cards[id] : undefined;
  if (!card) return { state, ok: false, message: state.status };
  if (state.activeSkill && state.activeSlot === slot) return cancelTarget(state, deps);
  if (busy(state)) return { state, ok: false, message: state.status };
  if (state.activeSkill) {
    return fail(state, 'Selesaikan target atau batalkan kartu aktif.');
  }
  const hero = heroOf(deps, state);
  const playable = canPlayCard(state, card, hero);
  if (!playable.ok) return fail(state, playable.reason);
  if (id === 'ration' && state.energy >= 5) {
    return fail(state, 'Energi sudah penuh. Simpan Ransum fokus.');
  }
  if (id === 'fortune' && state.bonusRerolls) {
    return fail(state, 'Bonus putar ulang giliran ini sudah dipakai.');
  }
  if (id === 'reserve' && state.reserveArmed) {
    return fail(state, 'Fokus cadangan sudah menunggu skill berikutnya.');
  }
  if (id === 'surcharge' && state.enemySurcharge) {
    return fail(state, 'Pajak mantra sudah terpasang.');
  }
  if (id === 'parry' && !state.enemyDrainArmed && state.enemyPreparedSkill !== 'siphon') {
    return fail(state, 'Tangkis arus menunggu telegraph Gangguan.');
  }
  const flat = state.board.flat();
  if (
    id === 'sacrifice' &&
    !flat.some(function (piece) {
      return piece != null && piece.color === 'w' && piece.type === 'p';
    })
  ) {
    return fail(state, 'Tidak ada pion putih yang bisa dikorbankan.');
  }
  if (
    id === 'relay' &&
    flat.filter(function (piece) {
      return piece != null && piece.color === 'w' && piece.type !== 'k';
    }).length < 2
  ) {
    return fail(state, 'Relay membutuhkan dua bidak putih selain raja.');
  }
  if (
    id === 'pawnGuard' &&
    !flat.some(function (piece) {
      return piece != null && piece.color === 'w' && piece.type === 'p';
    })
  ) {
    return fail(state, 'Tidak ada pion putih yang bisa dilindungi.');
  }
  if (
    (id === 'pawnMark' || id === 'pawnStagger') &&
    !flat.some(function (piece) {
      return piece != null && piece.color === 'b' && piece.type === 'p';
    })
  ) {
    return fail(state, 'Tidak ada pion hitam yang bisa ditargetkan.');
  }
  if (id === 'phoenix' && !canReviveWhitePiece(state, deps)) {
    return fail(state, 'Belum ada bidak putih non-ratu yang bisa dibangkitkan.');
  }
  if (id === 'fold' && !hasWhiteJokerTarget(state.board)) {
    return fail(state, 'Tidak ada bidak putih selain raja untuk dipindahkan.');
  }
  if (id === 'edict' && !hasBlackJokerTarget(state.board)) {
    return fail(state, 'Tidak ada bidak hitam selain raja dan ratu untuk dihapus.');
  }
  const cost = currentCardCost(card, hero, state.reserveArmed);
  const discountUsed = state.reserveArmed;
  const paid = payCardCost(state, card, hero);
  if ((TARGET_CARD_IDS as readonly string[]).indexOf(id) !== -1) {
    const prompt = CARD_TARGET_PROMPTS[id] ?? 'Pilih target.';
    const targeted: BattleState = {
      ...paid,
      activeSkill: id,
      activeSlot: slot,
      activeSkillCost: cost,
      activeSkillDiscounted: discountUsed,
      selected: null,
      relayFirstId: null,
      status: prompt + ' Tekan Batal untuk mengembalikan mana.',
    };
    return { state: targeted, ok: true, message: targeted.status };
  }
  const next = applyInstantCard(paid, deps, slot);
  return { state: next, ok: true, message: next.status };
}

/** Selesaikan target kartu / hero pada petak papan. */
export function resolveTarget(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
  alreadyDefeated = false,
): CommandResult {
  if (!state.activeSkill) return { state, ok: false, message: state.status };
  const resolution = resolveCardTarget(state, deps, row, col);
  if (!resolution.ok) {
    return { state: resolution.state, ok: false, message: resolution.message };
  }
  if (resolution.needsBlackOutcome) {
    const boss = deps.bosses[resolution.state.bossId] ?? Object.values(deps.bosses)[0];
    const outcome = checkOutcome(resolution.state, deps, 'b', boss, alreadyDefeated);
    const next = outcome.ended ? finishFullTurn(outcome.state) : outcome.state;
    return { state: next, ok: true, message: next.status };
  }
  if (resolution.whiteMoveConsumed) {
    const next = continueAfterWhiteMove(
      resolution.state,
      deps,
      null,
      false,
      alreadyDefeated,
    );
    return { state: next, ok: true, message: next.status };
  }
  return { state: resolution.state, ok: true, message: resolution.message };
}

/** Batalkan target aktif; kartu mengembalikan mana, hero gratis. */
export function cancelTarget(state: BattleState, deps: BattleDeps): CommandResult {
  if (!state.activeSkill) return { state, ok: false, message: state.status };
  if (state.activeSkill.indexOf('hero:') === 0) {
    const label = state.activeSkill.indexOf('hero:ultimate:') === 0 ? 'Ultimate' : 'Skill';
    const message = 'Target ' + label.toLowerCase() + ' hero dibatalkan. Tidak ada EN yang terpakai.';
    return {
      state: { ...state, activeSkill: null, selected: null, status: message },
      ok: true,
      message,
    };
  }
  if (state.activeSlot == null) return { state, ok: false, message: state.status };
  const card = deps.cards[state.activeSkill];
  const name = card ? card.name : state.activeSkill;
  let next = refundCardCost(state, state.activeSkillCost);
  if (state.activeSkillDiscounted) next = { ...next, reserveArmed: true };
  next = {
    ...next,
    activeSkill: null,
    activeSlot: null,
    activeSkillCost: 0,
    activeSkillDiscounted: false,
    relayFirstId: null,
    selected: null,
    status: name + ' dibatalkan. Mana dikembalikan.',
  };
  return { state: next, ok: true, message: next.status };
}

/** Putar ulang seluruh tangan (atomik; animasi kocok milik UI). */
export function rerollHand(state: BattleState, deps: BattleDeps): CommandResult {
  if (busy(state) || state.activeSkill) return { state, ok: false, message: state.status };
  const limit = rerollLimit(state);
  if (state.rollsThisTurn >= limit) {
    return fail(
      state,
      'Jatah putar ulang seluruh tangan giliran ini sudah habis (' + limit + '/' + limit + ').',
    );
  }
  const cost = rerollCost(state);
  if (state.energy < cost) {
    return fail(state, 'Putar ulang seluruh tangan membutuhkan 1 EN; energimu belum cukup.');
  }
  const previousHand = state.hand.slice();
  const next: BattleState = {
    ...state,
    dealtSlot: null,
    energy: state.energy - cost,
    rollsThisTurn: state.rollsThisTurn + 1,
  };
  const redrawn: BattleState = {
    ...next,
    hand: [previousHand[0], previousHand[1], previousHand[2]],
  };
  const hand = makeHand(previousHand, deps);
  const done: BattleState = {
    ...redrawn,
    hand: [hand[0], hand[1], hand[2]],
    dealtSlot: 'all',
    status: 'Tiga kartu baru dibagikan. Biaya putar tadi ' + (cost > 0 ? '1 EN.' : 'gratis.'),
  };
  return { state: done, ok: true, message: done.status };
}

/** Skill hero (2 EN): langsung atau masuk mode target. */
export function useHeroSkill(state: BattleState, deps: BattleDeps): CommandResult {
  if (state.activeSkill && state.activeSkill.indexOf('hero:skill:') === 0) {
    return cancelTarget(state, deps);
  }
  if (busy(state)) return { state, ok: false, message: state.status };
  if (state.activeSkill) {
    return fail(state, 'Selesaikan target yang aktif atau tekan Esc.');
  }
  const hero = heroOf(deps, state);
  if (state.energy < HERO_SKILL_ENERGY_COST) {
    return fail(
      state,
      'Skill ' + hero.name + ' membutuhkan ' + HERO_SKILL_ENERGY_COST + ' EN; energi sekarang ' + state.energy + ' / 5.',
    );
  }
  if (hero.skillAction === 'focus') {
    const next = applyBaraSkill(state);
    return { state: next, ok: true, message: next.status };
  }
  if (hero.skillAction === 'phase') {
    const next = beginHeroTarget(state, 'skill:phase', 'Pilih bidak putih selain raja untuk Pergeseran Rembulan.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.skillAction === 'ward') {
    const next = beginHeroTarget(state, 'skill:ward', 'Pilih bidak putih selain raja untuk dilindungi Embun Pelindung.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.skillAction === 'pawnstep') {
    const next = beginHeroTarget(state, 'skill:pawnstep', 'Pilih pion putih untuk Langkah Pelopor.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.skillAction === 'snare') {
    const next = beginHeroTarget(state, 'skill:snare', 'Pilih bidak hitam selain raja untuk diikat Jerat Senyap.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.skillAction === 'blockade') {
    const next = beginHeroTarget(state, 'skill:blockade', 'Pilih satu petak kosong untuk Segel Petak.');
    return { state: next, ok: true, message: next.status };
  }
  return { state, ok: false, message: state.status };
}

/** Ultimate hero (5 EN): langsung atau masuk mode target. */
export function useHeroUltimate(state: BattleState, deps: BattleDeps): CommandResult {
  if (state.activeSkill && state.activeSkill.indexOf('hero:ultimate:') === 0) {
    return cancelTarget(state, deps);
  }
  if (busy(state)) return { state, ok: false, message: state.status };
  if (state.activeSkill) {
    return fail(state, 'Selesaikan target yang aktif atau tekan Esc.');
  }
  const hero = heroOf(deps, state);
  if (state.energy < HERO_ULTIMATE_ENERGY_COST) {
    return fail(
      state,
      'Ultimate membutuhkan ' + HERO_ULTIMATE_ENERGY_COST + ' EN; energi sekarang ' + state.energy + ' / 5.',
    );
  }
  if (hero.ultimateAction === 'fold') {
    const next = beginHeroTarget(state, 'ultimate:fold', 'Pilih bidak putih selain raja untuk Gerbang Lintas.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.ultimateAction === 'smite') {
    const next = beginHeroTarget(state, 'ultimate:smite', 'Pilih bidak hitam selain raja dan ratu untuk Titah Bara.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.ultimateAction === 'citadel') {
    const next = beginHeroTarget(state, 'ultimate:citadel', 'Pilih petak kosong sebagai pusat Benteng Prisma.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.ultimateAction === 'aegis') {
    const next = applyAegisUltimate(state);
    return { state: next, ok: true, message: next.status };
  }
  if (hero.ultimateAction === 'pawnrush') {
    const next = applyPawnRushUltimate(state);
    if (!next) return fail(state, 'Tidak ada pion putih untuk Pawai Bidak.');
    return { state: next, ok: true, message: next.status };
  }
  if (hero.ultimateAction === 'skip') {
    const next = applySkipUltimate(state);
    return { state: next, ok: true, message: next.status };
  }
  return { state, ok: false, message: state.status };
}

/**
 * Satu ketukan petak papan (cerminan squareClicked): routing target,
 * eksekusi langkah, seleksi / batal seleksi. Widgets keyboard + sentuh
 * memanggil ini agar handler UI bebas aturan.
 */
export function tapSquare(
  state: BattleState,
  deps: BattleDeps,
  row: number,
  col: number,
  alreadyDefeated = false,
): CommandResult {
  if (state.gameOver || state.thinking || state.turn !== 'w' || state.pendingPromotion) {
    return { state, ok: false, message: state.status };
  }
  if (state.activeSkill) return resolveTarget(state, deps, row, col, alreadyDefeated);
  const piece = state.board[row][col];
  if (state.selected) {
    const moves = battleLegalMovesFrom(state, deps, state.selected[0], state.selected[1]);
    const chosen = moves.find(function (move) {
      return move.to[0] === row && move.to[1] === col;
    });
    if (chosen) {
      return movePiece(state, deps, [chosen.from[0], chosen.from[1]], [row, col], alreadyDefeated);
    }
  }
  if (piece && piece.color === 'w') {
    if (state.selected && state.selected[0] === row && state.selected[1] === col) {
      const message = 'Pilihan dibatalkan. Pilih bidak putih.';
      return { state: { ...state, selected: null, status: message }, ok: true, message };
    }
    return selectPiece(state, deps, row, col);
  }
  if (state.selected) return fail(state, 'Petak itu tidak legal. Pilih petak yang menyala.');
  return fail(state, 'Pilih bidak putih terlebih dahulu.');
}

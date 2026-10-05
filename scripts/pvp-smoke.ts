// Smoke test engine PvP (Node, tanpa DOM): permainan simetris penuh dari
// dua sisi + determinisme dua klien + kartu/hero/promosi/serah.
//
// Jalankan: node --experimental-strip-types scripts/pvp-smoke.ts

import { CARDS, HEROES } from '../src/content/index.ts';
import { resetPieceIds } from '../src/domain/chess/board.ts';
import {
  createInitialPvp,
  type PvpDeps,
  type PvpState,
} from '../src/domain/pvp/state.ts';
import {
  pvpLegalMoves,
  checkPvpOutcome,
  makePvpHand,
} from '../src/domain/pvp/rules.ts';
import {
  movePvpPiece,
  choosePvpPromotion,
  tapPvpSquare,
  playPvpCardCommand,
  resolvePvpTargetCommand,
  usePvpSkillCommand,
  rerollPvpHand,
  resignPvp,
  queuePvpPremove,
  executePvpPremove,
} from '../src/domain/pvp/commands.ts';
import { generateRoomCode, isValidRoomCode, resolveColors, roomPeerId } from '../src/domain/online/protocol.ts';
import { createQueue, enqueue, pairNext } from '../src/domain/online/matchmaking.ts';

const deps: PvpDeps = {
  cards: Object.fromEntries(CARDS.map(function (card) { return [card.id, card]; })),
  heroes: Object.fromEntries(HEROES.map(function (hero) { return [hero.id, hero]; })),
};

const WHITE_DECK = ['lancer', 'tempo', 'ration', 'ward', 'disrupt', 'focus', 'pawnstep', 'mark', 'pierce', 'shock'];
const BLACK_DECK = ['leech', 'surcharge', 'counterspell', 'parry', 'riposte', 'reserve', 'quiet', 'lastLaugh', 'salvage', 'relay'];

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log('ok  - ' + label);
  } else {
    failures += 1;
    console.log('FAIL - ' + label);
  }
}

/** Game baru dengan tangan acak (deterministik dari seed). */
function freshGame(seed = 12345): PvpState {
  resetPieceIds();
  const base = createInitialPvp(
    {
      white: { heroId: 'arunika', deckCardIds: WHITE_DECK, hand: ['x', 'x', 'x'] },
      black: { heroId: 'bara', deckCardIds: BLACK_DECK, hand: ['x', 'x', 'x'] },
      seed,
    },
    deps,
  );
  const { hand: wHand, state: s1 } = makePvpHand(base, deps, WHITE_DECK);
  const { hand: bHand, state: s2 } = makePvpHand(s1, deps, BLACK_DECK);
  return {
    ...s2,
    sides: {
      w: { ...s2.sides.w, hand: [wHand[0], wHand[1], wHand[2]] },
      b: { ...s2.sides.b, hand: [bHand[0], bHand[1], bHand[2]] },
    },
  };
}

function withHands(state: PvpState, w: string[], b: string[]): PvpState {
  return {
    ...state,
    sides: {
      w: { ...state.sides.w, hand: w.slice() },
      b: { ...state.sides.b, hand: b.slice() },
    },
  };
}

function move(state: PvpState, color: 'w' | 'b', from: [number, number], to: [number, number]): PvpState {
  const result = movePvpPiece(state, deps, color, from, to);
  if (!result.ok) throw new Error('langkah tak terduga ilegal: ' + color + ' ' + JSON.stringify(from) + '->' + JSON.stringify(to) + ' (' + result.message + ')');
  return result.state;
}

// --- 1. Determinisme: dua klien identik dari command sequence yang sama ---
{
  let a = freshGame();
  let b = freshGame();
  assert(JSON.stringify(a) === JSON.stringify(b), 'dua klien identik setelah inisialisasi (seed sama)');
  const differentSeed = freshGame(54321);
  assert(
    JSON.stringify(a.sides.w.hand) !== JSON.stringify(differentSeed.sides.w.hand),
    'seed berbeda menghasilkan tangan awal berbeda',
  );
  const seq: { c: 'w' | 'b'; from: [number, number]; to: [number, number] }[] = [
    { c: 'w', from: [6, 4], to: [4, 4] }, // e4
    { c: 'b', from: [1, 4], to: [3, 4] }, // e5
    { c: 'w', from: [7, 6], to: [5, 5] }, // Nf3
    { c: 'b', from: [0, 1], to: [2, 2] }, // Nc6
    { c: 'w', from: [7, 5], to: [4, 2] }, // Bc4
    { c: 'b', from: [0, 6], to: [2, 5] }, // Nf6
  ];
  for (const step of seq) {
    a = move(a, step.c, step.from, step.to);
    b = move(b, step.c, step.from, step.to);
  }
  assert(JSON.stringify(a) === JSON.stringify(b), 'dua klien identik setelah 6 langkah (determinisme)');
  assert(a.history.length === 6, 'riwayat 6 langkah');
  assert(a.sides.w.mana === 3, 'mana putih +1 per langkah putih (3 langkah)');
  assert(a.sides.b.mana === 3, 'mana hitam +1 per langkah hitam (3 langkah)');
  assert(a.turn === 'w', 'giliran kembali ke putih setelah 6 ply');
}

// --- 2. Captures, energy, graveyard color, and premove revalidation ---
{
  let g = freshGame();
  g = move(g, 'w', [6, 4], [4, 4]); // e4
  g = move(g, 'b', [1, 3], [3, 3]); // d5
  g = move(g, 'w', [7, 6], [5, 5]); // Nf3
  g = move(g, 'b', [3, 3], [4, 4]); // dxe4
  assert(g.sides.b.energy === 4, 'tangkapan hitam memberi Bara 2 EN (bonus hero)');
  assert(g.captures.b === 1 && g.graveyard.w[0]?.type === 'p', 'tangkapan hitam masuk kuburan putih');
  let premoveBase = freshGame();
  const queued = queuePvpPremove(premoveBase, 'b', [0, 1], [2, 2]); // Nb8-c6
  assert(queued.ok && queued.premove !== null, 'premove lawan antre saat giliran putih');
  premoveBase = move(premoveBase, 'w', [6, 4], [4, 4]); // e4
  const executed = queued.premove ? executePvpPremove(premoveBase, deps, queued.premove) : null;
  assert(executed !== null && executed.ok && executed.state.turn === 'w', 'premove legal dijalankan saat giliran tiba');
  let changingBoard = freshGame();
  changingBoard = move(changingBoard, 'w', [6, 3], [4, 3]); // d4
  changingBoard = move(changingBoard, 'b', [1, 4], [3, 4]); // e5
  changingBoard = move(changingBoard, 'w', [6, 0], [5, 0]); // a3
  const capturePremove = queuePvpPremove(changingBoard, 'w', [4, 3], [3, 4]); // dxe5
  assert(capturePremove.ok && capturePremove.premove !== null, 'premove menangkap bidak yang sedang di e5');
  changingBoard = move(changingBoard, 'b', [3, 4], [4, 4]); // e4, target e5 kosong
  const invalidated =
    capturePremove.premove === null ? null : executePvpPremove(changingBoard, deps, capturePremove.premove);
  assert(invalidated !== null && !invalidated.ok && invalidated.state.turn === 'w', 'premove dibatalkan jika langkah lawan mengubah legalitas');
}

// --- 3. Langkah tidak legal ditolak; skak terdeteksi ---
// --- 2. Langkah tidak legal ditolak; skak terdeteksi ---
{
  let g = freshGame();
  const bad = movePvpPiece(g, deps, 'w', [6, 0], [5, 5]);
  assert(!bad.ok, 'langkah ilegal putih ditolak');
  g = move(g, 'w', [6, 4], [4, 4]);
  g = move(g, 'b', [1, 4], [3, 4]);
  g = move(g, 'w', [7, 3], [3, 7]); // Qh5: menyerang f7, belum skak
  g = move(g, 'b', [0, 1], [2, 2]); // Nc6
  g = move(g, 'w', [7, 5], [4, 2]); // Bc4
  const checked = checkPvpOutcome(g, 'b');
  assert(checked.status.indexOf('Skak') !== 0, 'belum skak sebelum Qxf7');
  g = move(g, 'b', [0, 6], [2, 5]); // Nf6
  const mated = movePvpPiece(g, deps, 'w', [3, 7], [1, 5]); // Qxf7#
  const tempoMate = movePvpPiece(
    {
      ...g,
      sides: { ...g.sides, w: { ...g.sides.w, effects: { ...g.sides.w.effects, tempoArmed: true } } },
    },
    deps,
    'w',
    [3, 7],
    [1, 5],
  );
  assert(tempoMate.ok && tempoMate.state.gameOver && tempoMate.state.winner === 'w', 'skakmat terdeteksi sebelum bonus Tempo memberi langkah');
  const skippedMate = movePvpPiece(
    {
      ...g,
      sides: { ...g.sides, w: { ...g.sides.w, effects: { ...g.sides.w.effects, skipOpponentTurn: true } } },
    },
    deps,
    'w',
    [3, 7],
    [1, 5],
  );
  assert(skippedMate.ok && skippedMate.state.gameOver && skippedMate.state.winner === 'w', 'skakmat terdeteksi sebelum Saat Beku melewati giliran');
  assert(mated.state.gameOver && mated.state.winner === 'w', 'skakmat putih via Qxf7');
  const after = tapPvpSquare(mated.state, deps, 'b', 0, 0);
  assert(!after.ok, 'input ditolak setelah gameOver');
}

// --- 3. Kartu instan + jatah kartu 0-mana ---
{
  const g = withHands(freshGame(), ['ration', 'pawnBreath', 'pawnGuard'], ['quiet', 'reserve', 'salvage']);
  const ready = { ...g, sides: { ...g.sides, w: { ...g.sides.w, mana: 1 } } };
  const ration = playPvpCardCommand(ready, deps, 'w', 0);
  assert(ration.ok && ration.state.sides.w.energy === 5, 'Ransum memulihkan EN ke kapasitas (4->5)');
  const free = playPvpCardCommand(ration.state, deps, 'w', 1);
  assert(free.ok, 'kartu 0-mana pertama bisa dimainkan');
  const free2 = playPvpCardCommand(free.state, deps, 'w', 2);
  assert(!free2.ok, 'kartu 0-mana kedua ditolak (jatah per giliran)');
}

// --- 4. Kartu target: ward memblokir tangkapan 2 balasan lalu kadaluwarsa ---
{
  let g = withHands(freshGame(), ['ward', 'ration', 'focus'], ['quiet', 'reserve', 'salvage']);
  g = { ...g, sides: { ...g.sides, w: { ...g.sides.w, mana: 2 } } };
  const played = playPvpCardCommand(g, deps, 'w', 0);
  assert(played.ok && played.state.activeSkill === 'ward', 'Ward masuk mode target');
  const cancelled = playPvpCardCommand(played.state, deps, 'w', 0);
  assert(cancelled.ok && cancelled.state.activeSkill === null && cancelled.state.sides.w.mana === 2, 'kartu target bisa dibatalkan tanpa biaya');
  const targeted = resolvePvpTargetCommand(played.state, deps, 'w', 6, 4);
  assert(targeted.ok, 'Ward terpasang di pion e2');
  g = move(targeted.state, 'w', [6, 4], [4, 4]); // e4 (ward mengikuti pion)
  const pawnId = g.sides.w.effects.wardPieceId;
  assert(pawnId !== null, 'wardPieceId terisi');
  g = move(g, 'b', [1, 3], [3, 3]); // d5 (balasan 1: ward 2->1)
  assert(g.sides.w.effects.wardTurns === 1, 'ward berkurang setelah balasan pertama');
  const blocked = movePvpPiece(g, deps, 'b', [3, 3], [4, 4]); // dxe4 diblokir
  assert(!blocked.ok, 'tangkapan bidak berward ditolak');
  const pawnStill = g.board[4][4];
  assert(pawnStill != null && pawnStill.id === pawnId, 'pion berward selamat');
  g = move(g, 'w', [7, 1], [5, 2]); // Nc3
  const stillBlocked = movePvpPiece(g, deps, 'b', [3, 3], [4, 4]);
  assert(!stillBlocked.ok, 'masih diblokir pada balasan kedua');
  g = move(g, 'b', [0, 6], [2, 5]); // Nf6 (balasan 2: ward habis)
  assert(g.sides.w.effects.wardTurns === 0 && g.sides.w.effects.wardPieceId === null, 'ward kadaluwarsa setelah 2 balasan');
  g = move(g, 'w', [6, 3], [5, 3]); // d3
  const unblocked = movePvpPiece(g, deps, 'b', [3, 3], [4, 4]);
  assert(unblocked.ok, 'tangkapan legal setelah ward habis');
}

// --- 5. Skill hero target: EN terpotong saat selesai, pola phase aktif ---
{
  const g = freshGame();
  const res = usePvpSkillCommand(g, deps, 'w');
  assert(res.ok && res.state.activeSkill === 'hero:skill:phase', 'skill hero masuk mode target');
  const targeted = resolvePvpTargetCommand(res.state, deps, 'w', 7, 1);
  assert(targeted.ok && targeted.state.sides.w.energy === 2, 'EN 4-2=2 terpotong saat target selesai');
  assert(targeted.state.sides.w.effects.phaseTargetId !== null, 'phaseTargetId terpasang');
  const phaseMoves = pvpLegalMoves(targeted.state, 'w').filter(function (m) {
    return m.from[0] === 7 && m.from[1] === 1 && m.phase === true;
  });
  assert(phaseMoves.length > 0, 'bidak ber-phase punya langkah teleport 2 petak');
  let phased = freshGame();
  const phasePawn = phased.board[6][4];
  if (phasePawn === null) throw new Error('pion e2 hilang');
  phased = {
    ...phased,
    sides: {
      ...phased.sides,
      w: { ...phased.sides.w, effects: { ...phased.sides.w.effects, phaseTargetId: phasePawn.id } },
    },
  };
  const phaseDouble = movePvpPiece(phased, deps, 'w', [6, 4], [4, 3]);
  assert(phaseDouble.ok && phaseDouble.state.enPassant === null, 'teleport phase dua baris tidak membuka en passant');
}

// --- 6. Reroll: pertama gratis, kedua 1 EN, batas 2 ---
{
  const g = freshGame();
  const handBefore = g.sides.w.hand.join(',');
  const r1 = rerollPvpHand(g, deps, 'w');
  assert(r1.ok && r1.state.sides.w.hand.join(',') !== handBefore, 'reroll mengganti tangan');
  assert(r1.state.sides.w.rollsThisTurn === 1 && r1.state.sides.w.energy === 4, 'reroll pertama gratis');
  const r2 = rerollPvpHand(r1.state, deps, 'w');
  assert(r2.ok && r2.state.sides.w.energy === 3, 'reroll kedua memakan 1 EN');
  const r3 = rerollPvpHand(r2.state, deps, 'w');
  assert(!r3.ok, 'reroll ketiga ditolak (batas 2)');
  const resigned = resignPvp(r2.state, 'w');
  assert(resigned.gameOver && resigned.winner === 'b', 'serah diri: lawan menang');
}

// --- 7. Matchmaking: pasangan + warna ---
{
  const rng = (function () { let s = 42; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
  let q = createQueue();
  q = enqueue(q, { peerId: 'A', pick: 'w', heroId: 'arunika', deckCardIds: WHITE_DECK });
  assert(pairNext(q, rng).pair === null, 'satu pemain belum bisa dipasangkan');
  q = enqueue(q, { peerId: 'B', pick: 'b', heroId: 'bara', deckCardIds: BLACK_DECK });
  const { pair } = pairNext(q, rng);
  assert(pair !== null && pair.host.peerId === 'A', 'dua pemain terpasangkan, host = antrian pertama');
  assert(pair !== null && pair.hostColor === 'w' && pair.guestColor === 'b', 'preferensi berbeda dihormati');
  const samePick = resolveColors('w', 'w', function () { return 0.1; });
  assert(samePick[0] === 'w' && samePick[1] === 'b', 'preferensi sama diputus acak');
  const oneRandom = resolveColors('random', 'b', function () { return 0.1; });
  assert(oneRandom[0] === 'w' && oneRandom[1] === 'b', 'random mengisi warna sisa');
  assert(generateRoomCode(function () { return 0.000075; }) === '00007', 'kode room mempertahankan nol di depan');
  assert(generateRoomCode(function () { return 1; }) === '99999', 'kode room membatasi hasil ke lima digit');
  assert(isValidRoomCode('00007') && !isValidRoomCode('1234') && !isValidRoomCode('123456'), 'validasi kode room tepat lima digit');
  assert(roomPeerId('00007') === 'cc-room-00007', 'id peer room mempertahankan format kode');
}

// --- 8. Promosi pion hitam ---
{
  let g = freshGame();
  g = move(g, 'w', [6, 3], [4, 3]); // d4
  g = move(g, 'b', [1, 3], [3, 3]); // d5
  g = move(g, 'w', [6, 2], [4, 2]); // c4
  g = move(g, 'b', [3, 3], [4, 2]); // dxc4
  g = move(g, 'w', [7, 6], [5, 5]); // Nf3
  g = move(g, 'b', [4, 2], [5, 2]); // c3
  g = move(g, 'w', [6, 4], [5, 4]); // e3
  g = move(g, 'b', [5, 2], [6, 2]); // c2
  g = move(g, 'w', [6, 6], [5, 6]); // g3
  g = withHands(g, ['ration', 'focus', 'ward'], ['relay', 'quiet', 'reserve']);
  g = { ...g, sides: { ...g.sides, b: { ...g.sides.b, mana: 6 } } };
  const promoAttempt = movePvpPiece(g, deps, 'b', [6, 2], [7, 3]); // cxd1=?
  assert(
    promoAttempt.ok && promoAttempt.state.pendingPromotion !== null && promoAttempt.state.pendingPromotion.side === 'b',
    'pion hitam memicu dialog promosi (cxd1)',
  );
  const blockedCard = playPvpCardCommand(promoAttempt.state, deps, 'b', 0);
  assert(!blockedCard.ok && blockedCard.state.pendingPromotion !== null, 'kartu tidak dapat dipakai saat promosi tertunda');
  const blockedSkill = usePvpSkillCommand(promoAttempt.state, deps, 'b');
  assert(!blockedSkill.ok && blockedSkill.state.pendingPromotion !== null, 'skill hero tidak dapat dipakai saat promosi tertunda');
  const promoted = choosePvpPromotion(promoAttempt.state, deps, 'b', 'q');
  assert(promoted.ok, 'promosi ratu hitam sah');
  const queen = promoted.state.board[7][3];
  assert(queen != null && queen.type === 'q' && queen.side === 'b', 'ratu hitam berada di d1');
}

{
  const stale = { ...freshGame(), status: 'Skak. Lindungi raja hitam.' };
  const cleared = checkPvpOutcome(stale, 'w');
  assert(cleared.status === 'Giliran putih. Raja tidak lagi diskak.', 'status skak dibersihkan setelah raja lepas dari skak');
}
{
  let g = withHands(freshGame(), ['relay', 'ration', 'focus'], ['quiet', 'reserve', 'salvage']);
  g = { ...g, sides: { ...g.sides, w: { ...g.sides.w, mana: 3 } } };
  const selectedCard = playPvpCardCommand(g, deps, 'w', 0);
  const firstRook = resolvePvpTargetCommand(selectedCard.state, deps, 'w', 7, 0);
  assert(selectedCard.ok && firstRook.ok && firstRook.state.relayFirstId !== null, 'Relay menerima pemilihan bidak pertama');
  const swapped = resolvePvpTargetCommand(firstRook.state, deps, 'w', 7, 7);
  assert(
    swapped.ok && !swapped.state.castling.w.q && !swapped.state.castling.w.k,
    'Relay menghapus hak rokade kedua benteng yang berpindah',
  );
}
{
  let white = withHands(freshGame(), ['edict', 'ration', 'focus'], ['quiet', 'reserve', 'salvage']);
  white = { ...white, sides: { ...white.sides, w: { ...white.sides.w, mana: 6 } } };
  const whiteCard = playPvpCardCommand(white, deps, 'w', 0);
  const blackRookRemoved = resolvePvpTargetCommand(whiteCard.state, deps, 'w', 0, 7);
  assert(
    whiteCard.ok && blackRookRemoved.ok && blackRookRemoved.state.board[0][7] === null && !blackRookRemoved.state.castling.b.k,
    'Titah Pemusnah putih menghapus hak rokade benteng hitam',
  );
  let black = withHands(freshGame(), ['quiet', 'reserve', 'salvage'], ['edict', 'ration', 'focus']);
  black = {
    ...black,
    turn: 'b',
    sides: { ...black.sides, b: { ...black.sides.b, mana: 6 } },
  };
  const blackCard = playPvpCardCommand(black, deps, 'b', 0);
  const whiteRookRemoved = resolvePvpTargetCommand(blackCard.state, deps, 'b', 7, 0);
  assert(
    blackCard.ok && whiteRookRemoved.ok && whiteRookRemoved.state.board[7][0] === null && !whiteRookRemoved.state.castling.w.q,
    'Titah Pemusnah hitam menghapus hak rokade benteng putih',
  );
}

console.log('');
if (failures > 0) {
  console.log('PVP SMOKE FAIL: ' + failures + ' kegagalan');
  process.exit(1);
} else {
  console.log('PVP SMOKE PASS');
}

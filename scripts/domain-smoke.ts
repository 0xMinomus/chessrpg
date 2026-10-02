// Smoke test domain (Node, tanpa DOM): menjalankan alur duel nyata dari
// src/domain + src/content untuk membuktikan aturan inti tanpa browser.
//
// Jalankan: node --experimental-strip-types scripts/domain-smoke.ts
// (Node 22+; bila experimental-strip-types tidak tersedia, gunakan Vite/vitest.)

import { CARDS, HEROES, BOSSES } from '../src/content/index.ts';
import { DUNGEON_FLOORS, FLOOR_IDS, LEGACY_BOSS_IDS } from '../src/content/dungeon.ts';
import { chessRulesAdapter } from '../src/adapters/chess-rules.ts';
import { SeededRandom } from '../src/adapters/random.ts';
import { tapSquare, canUndo, restartBattle, cancelTarget } from '../src/domain/battle/commands.ts';
import { battleLegalMovesFrom, advanceBossReplyEffects } from '../src/domain/battle/effects.ts';
import {
  chooseHero,
  isFloorUnlocked,
  nextFloorId,
  defaultCampaign,
  deckSelectionStatus,
  normalizeCampaign,
  toggleDeckCard,
  type Campaign,
} from '../src/domain/campaign/index.ts';
import {
  advanceBlackReplyFlow,
  claimBattleRewardFlow,
  playCardFlow,
  resolveCardTargetFlow,
  rerollHandFlow,
  startBattle,
  undoTurnFlow,
  useHeroSkillFlow,
  useHeroUltimateFlow,
} from '../src/application/index.ts';
import type { BattleDeps, BattleState } from '../src/domain/battle/state.ts';

const deps: BattleDeps = {
  chess: chessRulesAdapter,
  rng: new SeededRandom(20261002),
  cards: Object.fromEntries(CARDS.map((c) => [c.id, { id: c.id, name: c.name, cost: c.cost, kind: c.kind, weight: c.weight }])),
  heroes: Object.fromEntries(
    HEROES.map((h) => [
      h.id,
      {
        id: h.id,
        name: h.name,
        startEnergy: h.startEnergy,
        skillAction: h.skillAction,
        ultimateAction: h.ultimateAction,
        offenseSurcharge: h.offenseSurcharge,
        jokerSurcharge: h.jokerSurcharge,
        captureBonus: h.captureBonus,
        captureEnergy: h.captureEnergy,
      },
    ]),
  ),
  opponents: Object.fromEntries(
    DUNGEON_FLOORS.map((floor) => [
      floor.id,
      { id: floor.id, ruleKey: floor.ruleKey, reward: floor.reward, isBoss: floor.isBoss },
    ]),
  ),
};
const HERO_IDS = HEROES.map((h) => h.id);
const DECK_CATALOG = {
  regularCardIds: CARDS.filter((card) => card.kind !== 'joker').map((card) => card.id),
  jokerCardIds: CARDS.filter((card) => card.kind === 'joker').map((card) => card.id),
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
  }
}

/** Jalankan satu langkah putih pertama yang legal (bukan pion di tengah). */
function firstLegalWhiteMove(battle: BattleState): { from: [number, number]; to: [number, number] } | null {
  for (let row = 7; row >= 0; row -= 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = battle.board[row][col];
      if (!piece || piece.color !== 'w' || piece.type === 'p') continue;
      const moves = battleLegalMovesFrom(battle, deps, row, col);
      if (moves.length > 0) {
        const move = moves[0];
        return { from: [move.from[0], move.from[1]], to: [move.to[0], move.to[1]] };
      }
    }
  }
  return null;
}

function runWhiteTurn(battle: BattleState): BattleState {
  let state = battle;
  for (let attempt = 0; attempt < 3 && !state.gameOver && state.turn === 'w'; attempt += 1) {
    const move = firstLegalWhiteMove(state);
    if (!move) break;
    const result = tapSquare(state, deps, move.from[0], move.from[1]);
    state = result.state;
    const target = tapSquare(state, deps, move.to[0], move.to[1]);
    state = target.state;
    if (state.pendingPromotion) break;
    if (state.thinking) {
      state = advanceBlackReplyFlow(state, deps).battle;
    }
  }
  return state;
}

function main(): void {
  // 1. Konten
  check('konten: 37 kartu', CARDS.length === 37, String(CARDS.length));
  check('konten: 6 hero', HEROES.length === 6);
  check('konten: 10 boss chapter', BOSSES.length === 10);
  check('konten: Joker berbobot 0.2', CARDS.filter((c) => c.kind === 'joker').every((c) => c.weight === 0.2));
  check('konten: biaya Joker dasar 5', CARDS.filter((c) => c.kind === 'joker').every((c) => c.cost === 5));

  // 2. Kampanye + save
  const fresh = defaultCampaign(HERO_IDS, DECK_CATALOG);
  check('kampanye: koin awal 30', fresh.coins === 30);
  check('kampanye: semua hero terbuka', fresh.ownedHeroes.length === 6);
  check('kampanye: hero awal arunika', fresh.selectedHero === 'arunika');
  check('deck: default berisi 10 kartu biasa + 1 Joker', fresh.deckCardIds.length === 11 && deckSelectionStatus(fresh.deckCardIds, DECK_CATALOG).complete);
  check('deck: pilihan default hanya dari koleksi kartu', fresh.deckCardIds.every((id) => CARDS.some((card) => card.id === id)));
  check('kampanye: lantai 2 terkunci', !isFloorUnlocked(FLOOR_IDS, fresh, FLOOR_IDS[1]));
  const corrupted = normalizeCampaign('{bukan json', HERO_IDS, FLOOR_IDS, LEGACY_BOSS_IDS, DECK_CATALOG);
  check('save rusak: fallback default', corrupted.coins === 30 && corrupted.selectedHero === 'arunika');
  const partial = normalizeCampaign(
    { coins: -5, clearedFloorIds: [FLOOR_IDS[0], 'tidak-ada'] },
    HERO_IDS,
    FLOOR_IDS,
    LEGACY_BOSS_IDS,
    DECK_CATALOG,
  );
  check('save parsial: koin di-clamp', partial.coins === 0);
  check('save parsial: ID lantai tak dikenal dibuang', partial.clearedFloorIds.join() === FLOOR_IDS[0]);
  check('save lama: deck default ditambahkan', deckSelectionStatus(partial.deckCardIds, DECK_CATALOG).complete);
  const invalidDeck = normalizeCampaign(
    { deckCardIds: DECK_CATALOG.regularCardIds.concat(DECK_CATALOG.jokerCardIds) },
    HERO_IDS,
    FLOOR_IDS,
    LEGACY_BOSS_IDS,
    DECK_CATALOG,
  );
  check('save: loadout dibatasi menjadi 10 kartu biasa + 1 Joker', invalidDeck.deckCardIds.length === 11 && deckSelectionStatus(invalidDeck.deckCardIds, DECK_CATALOG).complete);
  const removedCard = fresh.deckCardIds[0];
  const incompleteDeck = toggleDeckCard(fresh.deckCardIds, removedCard, DECK_CATALOG);
  check('deck: kartu biasa dapat dilepas', incompleteDeck.length === 10 && !incompleteDeck.includes(removedCard));
  check('deck: jumlah wajib terdeteksi', !deckSelectionStatus(incompleteDeck, DECK_CATALOG).complete);
  check('deck: kartu biasa tidak melewati batas', toggleDeckCard(fresh.deckCardIds, DECK_CATALOG.regularCardIds[10], DECK_CATALOG).length === 11);
  check('deck: Joker tidak melewati batas', toggleDeckCard(fresh.deckCardIds, DECK_CATALOG.jokerCardIds[1], DECK_CATALOG).length === 11);
  const incompleteStart = startBattle(
    deps,
    FLOOR_IDS,
    { ...fresh, deckCardIds: incompleteDeck },
    'arunika',
    FLOOR_IDS[0],
  );
  check('duel: deck tidak lengkap ditolak', !incompleteStart.ok && incompleteStart.battle === null);
  const lockedStart = startBattle(deps, FLOOR_IDS, fresh, 'arunika', FLOOR_IDS[1]);
  check('duel: startBattle menolak lantai terkunci', !lockedStart.ok && lockedStart.battle === null);

  // 3. Mulai duel
  const started = startBattle(deps, FLOOR_IDS, fresh, 'arunika', FLOOR_IDS[0]);
  check('duel: dimulai', started.ok && started.battle !== null);
  let battle = started.battle as BattleState;
  check('duel: EN awal hero 4', battle.energy === 4, String(battle.energy));
  check('duel: mana awal 0', battle.heroMana === 0);
  check('duel: EN lawan 2', battle.enemyEnergy === 2);
  check('duel: tangan 3 kartu unik', battle.hand.length === 3 && new Set(battle.hand).size === 3);
  check('duel: tangan hanya dari deck terpilih', battle.hand.every((id) => fresh.deckCardIds.includes(id)));
  check('duel: papan 32 bidak', battle.board.flat().filter(Boolean).length === 32);

  // 4. Langkah legal + mana +1
  const move = firstLegalWhiteMove(battle);
  check('langkah: ada langkah legal', move !== null);
  if (move) {
    const picked = tapSquare(battle, deps, move.from[0], move.from[1]);
    check('langkah: seleksi bidak', picked.state.selected !== null);
    check(
      'langkah: destination menyala',
      battleLegalMovesFrom(picked.state, deps, move.from[0], move.from[1]).length > 0,
    );
    const moved = tapSquare(picked.state, deps, move.to[0], move.to[1]);
    check('langkah:_EN naik setelah langkah', moved.state.energy >= battle.energy);
    check('langkah: mana +1', moved.state.heroMana === 1, String(moved.state.heroMana));
    check('langkah: giliran hitam thinking', moved.state.thinking === true);
    check('langkah: thinking bukan input pemain', moved.state.turn === 'b');
    const replied = advanceBlackReplyFlow(moved.state, deps).battle;
    check('balasan: giliran kembali ke putih', replied.turn === 'w' && replied.thinking === false);
    check('balasan: giliran naik', replied.turnNo === 2, String(replied.turnNo));
    check('balasan: ada langkah hitam', replied.history.some((h) => h.color === 'b'));
    battle = replied;
  }

  // 5. Undo satu putaran penuh
  check('undo: tersedia setelah satu putaran', canUndo(battle) === true);
  const undone = undoTurnFlow(battle);
  check('undo: ok', undone.ok);
  check('undo: giliran kembali ke 1', undone.state.turnNo === 1, String(undone.state.turnNo));
  check('undo: papan kosong dari langkah', undone.state.history.length === 0);
  check('undo: mana kembali 0', undone.state.heroMana === 0, String(undone.state.heroMana));
  check('undo: tak bisa undo dua kali', canUndo(undone.state) === false);
  battle = undone.state;

  // 6. Restart
  const restarted = restartBattle(battle, deps);
  check('restart: papan awal 32 bidak', restarted.state.board.flat().filter(Boolean).length === 32);
  check('restart: giliran 1', restarted.state.turnNo === 1);
  check('restart: pool kartu terpilih dipertahankan', restarted.state.deckCardIds.join() === fresh.deckCardIds.join() && restarted.state.hand.every((id) => fresh.deckCardIds.includes(id)));

  // 7. Reroll: putaran pertama gratis, berikutnya 1 EN
  const beforeReroll = battle.hand.join();
  const beforeEnergy = battle.energy;
  const rerolled = rerollHandFlow(battle, deps);
  check('reroll: gratis pertama', rerolled.ok && rerolled.state.energy === beforeEnergy);
  check('reroll: tangan diganti', rerolled.state.hand.join() !== beforeReroll);
  check('reroll: hanya menggunakan kartu deck', rerolled.state.hand.every((id) => fresh.deckCardIds.includes(id)));
  const reroll2 = rerollHandFlow(rerolled.state, deps);
  check('reroll: putaran kedua 1 EN', reroll2.ok && reroll2.state.energy === beforeEnergy - 1);
  const reroll3 = rerollHandFlow(reroll2.state, deps);
  check('reroll: jatah habis', reroll3.ok === false);
  battle = reroll2.state;

  // 8. Kartu: biaya mana, target, cancel refund (setelah satu langkah putih mana = 1)
  battle = runWhiteTurn(battle);
  if (battle.thinking) battle = advanceBlackReplyFlow(battle, deps).battle;
  const manaCard = battle.hand.findIndex((id) => {
    const card = deps.cards[id];
    return card && card.cost > 0 && battle.heroMana >= card.cost;
  });
  check('kartu: ada kartu terjangkau', manaCard !== -1);
  if (manaCard !== -1) {
    const card = deps.cards[battle.hand[manaCard]];
    const cost = card.cost;
    const manaBefore = battle.heroMana;
    const played = playCardFlow(battle, deps, manaCard);
    check('kartu: pengganti hanya berasal dari deck', played.state.hand.every((id) => fresh.deckCardIds.includes(id)));
    check('kartu: biaya dipotong dari mana', played.state.heroMana === manaBefore - cost, String(played.state.heroMana));
    if (played.state.activeSkill !== null) {
      const cancelledResult = cancelTarget(played.state, deps);
      check(
        'kartu: cancel mengembalikan mana',
        cancelledResult.state.heroMana === manaBefore,
        String(cancelledResult.state.heroMana),
      );
      check('kartu: cancel membersihkan target', cancelledResult.state.activeSkill === null);
    } else {
      check('kartu: efek instan diterapkan', played.state.hand.length === 3);
    }
  }

  // 9. Hero skill 2 EN / ultimate 5 EN + cancel tanpa bayar
  for (const hero of HEROES) {
    const campaign: Campaign = chooseHero(fresh, hero.id, HERO_IDS);
    const duel = startBattle(deps, FLOOR_IDS, campaign, hero.id, FLOOR_IDS[0]);
    check('hero ' + hero.id + ': duel dimulai', duel.ok && duel.battle !== null);
    if (!duel.ok || !duel.battle) continue;
    const before = duel.battle.energy;
    const skill = useHeroSkillFlow(duel.battle, deps);
    check('hero ' + hero.id + ': skill ok', skill.ok, skill.message);
    if (skill.state.activeSkill && skill.state.activeSkill.indexOf('hero:skill:') === 0) {
      const cancelled = cancelTarget(skill.state, deps);
      check('hero ' + hero.id + ': cancel skill tanpa EN', cancelled.state.energy === before, String(cancelled.state.energy));
    } else if (skill.ok) {
      check('hero ' + hero.id + ': skill instan biaya 2 EN', skill.state.energy === before - 2, String(skill.state.energy));
    }
    // Ultimate butuh 5 EN: hero startEnergy 4 tidak cukup -> harus ditolak.
    const ultimate = useHeroUltimateFlow(duel.battle, deps);
    if (duel.battle.energy < 5) {
      check('hero ' + hero.id + ': ultimate ditolak bila EN < 5', ultimate.ok === false);
    } else {
      check('hero ' + hero.id + ': ultimate ok', ultimate.ok, ultimate.message);
      if (ultimate.state.activeSkill && ultimate.state.activeSkill.indexOf('hero:ultimate:') === 0) {
        const cancelled = cancelTarget(ultimate.state, deps);
        check('hero ' + hero.id + ': cancel ultimate tanpa EN', cancelled.state.energy === duel.battle.energy);
      } else if (ultimate.ok) {
        check('hero ' + hero.id + ': ultimate instan biaya 5 EN', ultimate.state.energy === duel.battle.energy - 5);
      }
    }
  }

  // 10. Fr-23: durasi efek boss-reply = 2 (ward/snare/blockade) dan 1 (aegis/skip)
  const nila = startBattle(deps, FLOOR_IDS, fresh, 'nila', FLOOR_IDS[0]);
  if (nila.ok && nila.battle) {
    const withWard = { ...nila.battle, playerWardPieceId: nila.battle.board[7][4]?.id ?? null, playerWardTurns: 2 };
    const stepped = advanceBossReplyEffects(withWard);
    check('FR-23: ward menyisa 1 balasan', stepped.playerWardTurns === 1, String(stepped.playerWardTurns));
    const stepped2 = advanceBossReplyEffects(stepped);
    check('FR-23: ward habis setelah 2 balasan', stepped2.playerWardTurns === 0);
  }

  let campaign: Campaign = {
    ...defaultCampaign(HERO_IDS, DECK_CATALOG),
    clearedFloorIds: FLOOR_IDS.slice(0, 4),
  };
  const winBattle: BattleState = {
    ...(startBattle(deps, FLOOR_IDS, campaign, 'arunika', 'bastion').battle as BattleState),
    gameOver: true,
    winner: 'w',
    dungeonRewarded: true,
  };
  const store = {
    load: () => campaign,
    save: (next: Campaign) => {
      campaign = next;
      return true;
    },
  };
  const first = claimBattleRewardFlow(campaign, winBattle, deps.opponents['bastion'], FLOOR_IDS, store, { play() {} });
  check('hadiah: first-clear menambah koin', first.campaign.coins === 45, String(first.campaign.coins));
  check('hadiah: boss chapter tercatat sebagai lantai kelima', first.campaign.clearedFloorIds.length === 5 && first.campaign.clearedFloorIds[4] === 'bastion');
  check('hadiah: boss membuka lantai pertama chapter berikutnya', isFloorUnlocked(FLOOR_IDS, first.campaign, FLOOR_IDS[5]));
  check('hadiah: nextFloorId menuju chapter berikutnya', nextFloorId(FLOOR_IDS, first.campaign) === FLOOR_IDS[5]);
  const again = claimBattleRewardFlow(first.campaign, winBattle, deps.opponents['bastion'], FLOOR_IDS, store, { play() {} });
  check('hadiah: tidak double', again.firstClear === false && again.campaign.coins === 45);

  // 12. Menjalankan banyak duel penuh: tidak boleh error/exception
  let crashes = 0;
  for (let i = 0; i < 12; i += 1) {
    try {
      const hero = HEROES[i % HEROES.length];
      const boss = BOSSES[i % BOSSES.length];
      // Semua boss bisa dipilih langsung di build uji; engine duel tetap sama.
      const chapterProgress = FLOOR_IDS.slice(0, FLOOR_IDS.indexOf(boss.id));
      const duel = startBattle(deps, FLOOR_IDS, { ...fresh, clearedFloorIds: chapterProgress }, hero.id, boss.id);
      if (!duel.ok || !duel.battle) {
        crashes += 1;
        failures.push('loop duel ' + i + ': startBattle menolak ' + hero.id + ' vs ' + boss.id);
        continue;
      }
      let state: BattleState = duel.battle;
      for (let turn = 0; turn < 24 && !state.gameOver; turn += 1) {
        // pakai skill kalau EN cukup untuk menambah variasi
        if (turn % 3 === 0 && state.energy >= 2) state = useHeroSkillFlow(state, deps).state;
        if (turn % 4 === 0) state = playCardFlow(state, deps, turn % 3).state;
        if (state.activeSkill) state = resolveCardTargetFlow(state, deps, 4, 4).state;
        state = runWhiteTurn(state);
        if (state.thinking) state = advanceBlackReplyFlow(state, deps).battle;
        if (state.gameOver && state.winner === 'w') {
          const claim = claimBattleRewardFlow(
            { ...fresh, clearedFloorIds: FLOOR_IDS.slice(0, FLOOR_IDS.indexOf(state.floorId)) },
            state,
            deps.opponents[state.floorId],
            FLOOR_IDS,
            store,
            { play() {} },
          );
          campaign = claim.campaign;
        }
      }
      if (restartBattle(state, deps).ok === false) crashes += 1;
    } catch (error) {
      crashes += 1;
      failures.push('loop duel ' + i + ' melempar: ' + String(error));
    }
  }
  check('duel penuh x12: tanpa exception', crashes === 0, String(crashes));

  // 13. AI hanya langkah legal + uniformly random hanya lewat RandomSource
  {
    const duel = startBattle(deps, FLOOR_IDS, fresh, 'arunika', FLOOR_IDS[0]);
    const b = duel.battle as BattleState;
    const boardBefore = JSON.stringify(b.board);
    const blackMoves = battleLegalMovesFrom(b, deps, 1, 4);
    check('AI: kandidat langkah hitam legal', blackMoves.length >= 0);
    check('AI: papan awal utuh sebelum balasan', JSON.stringify(b.board) === boardBefore);
    // AI baru bergerak setelah langkah putih (giliran jadi 'b' + thinking).
    const opening = firstLegalWhiteMove(b);
    let afterWhite: BattleState = b;
    if (opening) {
      afterWhite = tapSquare(tapSquare(b, deps, opening.from[0], opening.from[1]).state, deps, opening.to[0], opening.to[1]).state;
    }
    const reply = advanceBlackReplyFlow(afterWhite, deps);
    check('AI: giliran hitam thinking setelah langkah putih', afterWhite.thinking === true);
    check('AI: balasan menghasilkan langkah hitam', reply.battle.history.some((h) => h.color === 'b'));
    check(
      'AI: raja hitam masih ada setelah balasan',
      reply.battle.board.flat().some((p) => p !== null && p.color === 'b' && p.type === 'k'),
    );
    check(
      'AI: raja putih masih ada setelah balasan',
      reply.battle.board.flat().some((p) => p !== null && p.color === 'w' && p.type === 'k'),
    );
  }

  console.log('PASS ' + passed + ' / FAIL ' + failed);
  for (const failure of failures) console.log('  FAIL: ' + failure);
  if (failed > 0) {
    // Non-zero exit tanpa menarik @types/node ke proyek ini.
    (globalThis as { process?: { exitCode?: number } }).process &&
      ((globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1);
  }
}

main();

// Render UI murni (tanpa DOM) untuk layer yang tidak butuh browser: layer hasil
// duel dan layer menu. Hanya memeriksa string markup dan atribut penting.
//
// Jalankan: node --experimental-strip-types scripts/render-check.ts

import { renderResultPage } from '../src/ui/screens/result.ts';
import { renderMenuPage } from '../src/ui/screens/menu.ts';
import { renderDungeonPage } from '../src/ui/screens/dungeon.ts';
import { renderHeroesPage } from '../src/ui/screens/heroes.ts';
import { renderHand, renderReroll } from '../src/ui/cards/cards.ts';
import { renderCardIconDefs, CARD_ICON_SYMBOLS, REROLL_ICON } from '../src/ui/cards/icons.ts';
import { renderBoard } from '../src/ui/board/board.ts';
import type { BoardGrid } from '../src/ui/board/board.ts';
import { CHAPTERS, DUNGEON_FLOORS } from '../src/content/dungeon.ts';
import type { ChapterMapItem, FloorListItem } from '../src/ui/dungeon/dungeon.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failures.push(name + (detail ? ' :: ' + detail : ''));
}

// 1. Layar hasil: kemenangan membuka tantangan berikutnya; kekalahan tidak.
const win = renderResultPage({
  title: 'Hasil duel',
  heading: 'Skakmat. Raja hitam tumbang.',
  summary: 'Kemenangan atas Pengawal Bastion · Chapter 01, lantai 01.',
  rewardText: 'Hadiah 5 koin masuk ke dompet.',
  progressText: '1 dari 50 lantai ditaklukkan',
  canReplay: true,
  continueFloorId: 'chapter-01-floor-02',
  continueLabel: 'Lanjut ke lantai Patroli',
  undoDisabled: true,
});
check('hasil: judul dan skakmat tampil', win.includes('Hasil duel') && win.includes('Raja hitam tumbang'));
check('hasil: hadiah dan progres campaign tampil', win.includes('Hadiah 5 koin') && win.includes('1 dari 50 lantai'));
check('hasil: lanjut ke lantai terbuka', win.includes('data-command="continue-floor" data-floor-id="chapter-01-floor-02"'));
check('hasil: tombol ulangi dan undo nonaktif', win.includes('data-command="replay"') && win.includes('data-command="undo" disabled'));
check('hasil: ada role status', win.includes('role="status"'));

const lose = renderResultPage({
  title: 'Hasil duel',
  heading: 'Skakmat. Raja putih tumbang.',
  summary: 'Kekalahan dari Pengawal Bastion.',
  rewardText: null,
  progressText: '0 dari 50 lantai ditaklukkan',
  canReplay: true,
  continueFloorId: null,
  continueLabel: null,
  undoDisabled: false,
});
check('hasil kalah: tanpa hadiah dan tanpa lanjut', !lose.includes('result-reward') && !lose.includes('data-command="continue-floor"'));
check('hasil kalah: undo aktif', lose.includes('data-command="undo"') && !lose.includes('data-command="undo" disabled'));

function chapterView(chapterNumber: number, unlocked: boolean, cleared: boolean, selected: boolean): ChapterMapItem {
  const chapter = CHAPTERS[chapterNumber - 1];
  if (!chapter) throw new Error('Chapter fixture tidak ditemukan: ' + chapterNumber);
  return {
    id: chapter.id,
    number: chapter.number,
    name: chapter.name,
    areaLabel: chapter.area,
    x: chapter.mapPosition.x,
    y: chapter.mapPosition.y,
    unlocked,
    cleared,
    clearedFloorCount: cleared ? 5 : 0,
    selected,
  };
}

function floorView(
  floorId: string,
  unlocked: boolean,
  cleared: boolean,
  selected: boolean,
): FloorListItem {
  const floor = DUNGEON_FLOORS.find((candidate) => candidate.id === floorId);
  if (!floor) throw new Error('Floor fixture tidak ditemukan: ' + floorId);
  return {
    id: floor.id,
    chapterNumber: floor.chapterNumber,
    floorNumber: floor.floorNumber,
    name: floor.name,
    glyph: floor.glyph,
    subtitle: floor.subtitle,
    reward: floor.reward,
    unlocked,
    cleared,
    selected,
    description: floor.description,
    rule: floor.rule,
    isBoss: floor.isBoss,
    lockReason: unlocked ? '' : 'Selesaikan lantai sebelumnya terlebih dahulu.',
  };
}

const chapterViews = CHAPTERS.map((chapter) =>
  chapterView(chapter.number, chapter.number === 1, false, chapter.number === 1),
);
const firstChapterFloors = DUNGEON_FLOORS
  .filter((floor) => floor.chapterId === CHAPTERS[0].id)
  .map((floor) => floorView(floor.id, floor.floorNumber === 1, false, floor.floorNumber === 1));
const firstFloor = firstChapterFloors[0];
const firstBoss = firstChapterFloors[4];
if (!firstFloor || !firstBoss) throw new Error('Fixture chapter pertama harus berisi lima lantai.');
const menuView = {
  coins: 30,
  clearedCount: 0,
  totalFloors: 50,
  allCleared: false,
  chapters: chapterViews,
  selectedChapter: chapterViews[0],
  nextFloor: firstFloor,
  selectedFloor: firstFloor,
  lastClearedFloor: null,
  floorProgress: firstChapterFloors,
  activeHero: {
    id: 'arunika',
    name: 'Arunika',
    role: 'Penjelajah Rembulan',
    portrait: 'arunika',
    skillName: 'Pergeseran Rembulan',
    skillDescription: 'Berpindah sampai dua petak.',
    ultimateName: 'Gerbang Lintas',
    ultimateDescription: 'Berpindah ke petak kosong mana pun.',
    strength: 'Mulai dengan 4 EN.',
    weakness: 'Skill membutuhkan 2 EN.',
  },
  heroCount: 6,
  cardCount: 37,
};

// 2. Menu: chapter map, lima lantai, state campaign awal.
const menu = renderMenuPage(menuView);
check('menu: campaign awal 0 dari 50', menu.includes('0 dari 50'));
check('menu: lantai pertama menjadi tantangan berikutnya', menu.includes('Tantangan berikutnya: Chapter 01') && menu.includes('Lantai 01'));
check('menu: hero dan potret aktif tampil', menu.includes('Arunika') && menu.includes('data-portrait="arunika"'));
check('menu: lima lantai chapter memakai data lantai', (menu.match(/class="home-floor-step[^"]*"/g) ?? []).length === 5);
check('menu: sepuluh chapter ditampilkan pada peta lokal', menu.includes('src="/assets/broken-crescent-pixel-map.png"') && (menu.match(/<button class="dungeon-map-marker/g) ?? []).length === 10);
check('menu: marker memilih chapter dan lantai pertama', menu.includes('data-command="select-chapter" data-chapter-id="chapter-01"') && menu.includes('data-floor-id="chapter-01-floor-01"'));
const bossPreviewMenu = renderMenuPage({
  ...menuView,
  selectedFloor: firstBoss,
  floorProgress: firstChapterFloors.map((floor) => ({ ...floor, selected: floor.id === firstBoss.id })),
});
check('menu: boss lantai lima punya skill unik', bossPreviewMenu.includes('Skill unik boss') && bossPreviewMenu.includes(firstBoss.name) && bossPreviewMenu.includes(firstBoss.rule));
const homeStartButton = menu.match(/<button\b[^>]*data-command="start-floor"[^>]*>/)?.[0] ?? '';
check('menu: lantai pertama dapat dimulai', homeStartButton.includes('data-command="start-floor"') && !/\sdisabled(?:\s|>)/.test(homeStartButton));

const clearedChapters = CHAPTERS.map((chapter) => chapterView(chapter.number, true, true, chapter.number === 10));
const finalChapter = CHAPTERS[CHAPTERS.length - 1];
if (!finalChapter) throw new Error('Fixture chapter terakhir tidak ditemukan.');
const finalChapterFloors = DUNGEON_FLOORS
  .filter((floor) => floor.chapterId === finalChapter.id)
  .map((floor) => floorView(floor.id, true, true, floor.isBoss));
const finalBoss = finalChapterFloors[4];
if (!finalBoss) throw new Error('Fixture boss chapter terakhir tidak ditemukan.');
const cleared = renderMenuPage({
  ...menuView,
  coins: 90,
  clearedCount: 50,
  allCleared: true,
  chapters: clearedChapters,
  selectedChapter: clearedChapters[clearedChapters.length - 1],
  nextFloor: firstFloor,
  selectedFloor: finalBoss,
  lastClearedFloor: finalBoss,
  floorProgress: finalChapterFloors,
});
check('menu selesai: campaign 50 lantai', cleared.includes('Semua chapter selesai') && cleared.includes('50 dari 50'));
check('menu selesai: lima status lantai selesai', (cleared.match(/class="home-floor-state">Selesai/g) ?? []).length === 5);
check('menu selesai: chapter dan hadiah terakhir berasal dari konten', cleared.includes(finalBoss.name) && cleared.includes(finalBoss.reward + ' koin'));

// 3. Dungeon: 10 chapter, lima lantai, boss chapter kelima tetap terkunci.
const dungeon = renderDungeonPage({
  chapters: chapterViews,
  selectedChapter: chapterViews[0],
  floors: firstChapterFloors,
  detail: firstBoss,
});
check('dungeon: sepuluh marker chapter pada peta lokal', dungeon.includes('src="/assets/broken-crescent-pixel-map.png"') && (dungeon.match(/<button class="dungeon-map-marker/g) ?? []).length === 10);
check('dungeon: tersedia tepat lima lantai', (dungeon.match(/<button class="floor-node[^"]*"/g) ?? []).length === 5);
check('dungeon: boss tampil dengan skill unik', dungeon.includes('Boss chapter') && dungeon.includes('Skill unik boss:') && dungeon.includes(firstBoss.rule));
check('dungeon: boss terkunci dan CTA tidak aktif', dungeon.includes('Selesaikan lantai sebelumnya terlebih dahulu.') && dungeon.includes('data-command="start-floor"') && dungeon.includes('disabled'));

// 4. Heroes: roster + detail + biaya EN
const heroPageView = {
  tab: 'roster' as const,
  filter: 'all' as const,
  roster: [
    {
      id: 'arunika',
      name: 'Arunika',
      role: 'Penjelajah Rembulan',
      portrait: 'arunika',
      startEnergy: 4,
      energyCap: 5,
      stateLabel: 'Dipakai',
      selected: true,
      active: true,
    },
    {
      id: 'liora',
      name: 'Liora',
      role: 'Penjaga Benteng',
      portrait: 'liora',
      startEnergy: 3,
      energyCap: 5,
      stateLabel: 'Dimiliki',
      selected: false,
      active: false,
    },
  ],
  detail: {
    id: 'liora',
    name: 'Liora',
    role: 'Penjaga Benteng',
    portrait: 'liora',
    startEnergy: 3,
    energyCap: 5,
    skillName: 'Segel Petak',
    skillCost: 2,
    skillDesc: 'Pilih satu petak kosong.',
    ultimateName: 'Benteng Prisma',
    ultimateCost: 5,
    ultimateDesc: 'Blokade silang.',
    strength: 'Menutup lima petak.',
    weakness: 'Butuh petak kosong.',
    active: false,
    stateMessage: 'Hero ini bisa langsung dipakai.',
  },
  deck: {
    cards: [
      {
        id: 'ward',
        name: 'Perisai bidak',
        cost: 2,
        kind: 'defense' as const,
        tag: 'Bertahan',
        desc: 'Pilih bidak selain raja.',
        icon: 'ward',
        selected: true,
        disabled: false,
      },
      {
        id: 'edict',
        name: 'Titah Pemusnah',
        cost: 5,
        kind: 'joker' as const,
        tag: 'Joker',
        desc: 'Hapus satu bidak hitam.',
        icon: 'shock',
        selected: false,
        disabled: true,
      },
    ],
    selectedCards: [
      {
        id: 'ward',
        name: 'Perisai bidak',
        cost: 2,
        kind: 'defense' as const,
        tag: 'Bertahan',
        desc: 'Pilih bidak selain raja.',
        icon: 'ward',
        selected: true,
        disabled: false,
      },
    ],
    regularCount: 10,
    jokerCount: 1,
    regularLimit: 10,
    jokerLimit: 1,
    totalCardCount: 37,
    complete: true,
    notice: null,
    activeHero: {
      name: 'Arunika',
      role: 'Penjelajah Rembulan',
      portrait: 'arunika',
      skillName: 'Pergeseran Rembulan',
      ultimateName: 'Gerbang Lintas',
    },
  },
};
const heroes = renderHeroesPage(heroPageView);
const deckPage = renderHeroesPage({ ...heroPageView, tab: 'deck' });
check(
  'heroes: 2 kartu roster',
  (heroes.match(/data-command="select-hero"/g) ?? []).length === 2,
  String((heroes.match(/data-command="select-hero"/g) ?? []).length),
);
check('heroes: skill 2 EN', heroes.includes('Skill utama</span><small>2 EN') && heroes.includes('Segel Petak'));
check('heroes: ultimate 5 EN', heroes.includes('Ultimate</span><small>5 EN') && heroes.includes('Benteng Prisma'));
check('heroes: selected state is exposed', heroes.includes('aria-pressed="true"'));
check('heroes: hero nonaktif bisa dipilih', heroes.includes('data-command="choose-hero"') && !heroes.includes('data-command="choose-hero" disabled'));
check('heroes: mode deck tersedia', heroes.includes('data-command="hero-tab" data-tab="deck"'));
check('deck: slot 10 + 1 Joker ditampilkan', deckPage.includes('>10<small> / 10') && deckPage.includes('>01<small> / 1'));
check('deck: kartu dibayar dengan mana', deckPage.includes('02 MANA'));
check('deck: Joker berbobot slot khusus dan nonaktif saat penuh', deckPage.includes('kind-joker') && deckPage.includes('data-card-id="edict"') && deckPage.includes('disabled'));
check('deck: loadout terpilih bisa dilepas', deckPage.includes('aria-label="Lepas Perisai bidak dari deck"'));

// 5. Kartu: markup mengikuti katalog cards.html (bingkai notched, ikon, biaya mana)
const slot = {
  card: {
    id: 'ward',
    name: 'Perisai bidak',
    cost: 2,
    kind: 'defense' as const,
    tag: 'Bertahan',
    desc: 'Pilih bidak selain raja. Boss tidak dapat menangkapnya selama 2 balasan.',
    icon: 'ward',
  },
  cost: 2,
  targeting: false,
  locked: false,
  stateLabel: 'SIAP',
  actionLabel: 'KLIK UNTUK AKTIF',
};
const hand = renderHand([slot, { ...slot, cost: 0, targeting: true, stateLabel: 'PILIH TARGET' }]);
check('kartu: kelas jenis', hand.includes('kind-defense'));
check('kartu: bingkai notched', hand.includes('--card-notch:polygon('));
check('kartu: judges-panel', hand.includes('class="card-top"'));
check('kartu: label jenis', hand.includes('Bertahan'));
check('kartu: biaya mana', hand.includes('02 MANA'));
check('kartu: biaya gratis 0 mana', hand.includes('0 MANA'));
check('kartu: ikon per kartu', hand.includes('<use href="#icon-ward"/>'));
check('kartu: judul', hand.includes('Perisai bidak'));
check('kartu: deskripsi', hand.includes('Boss tidak dapat menangkapnya'));
check('kartu: baris status', hand.includes('KLIK UNTUK AKTIF') && hand.includes('PILIH TARGET'));
check('kartu: target ditandai', hand.includes('is-targeting') && hand.includes('aria-pressed="true"'));
check('kartu: tombol punya aria-label', hand.includes('aria-label="Perisai bidak.'));
check('kartu: nama bidak disanitize', !renderHand([{ ...slot, card: { ...slot.card, name: '<img>' } }]).includes('<img>'));
const locked = renderHand([{ ...slot, locked: true, stateLabel: 'BUTUH 2 MANA' }]);
check('kartu terkunci: tombol disabled', locked.includes('disabled'));
check('kartu terkunci: kelas is-locked', locked.includes('is-locked'));
const unaffordable = renderHand([{ ...slot, locked: true, unaffordable: true, stateLabel: 'BUTUH 2 MANA' }]);
check('kartu kurang mana: state abu dan nonaktif', unaffordable.includes('is-unaffordable') && unaffordable.includes('disabled'));

const captureBoard: BoardGrid = Array.from({ length: 8 }, function () {
  return Array.from({ length: 8 }, function () {
    return null;
  });
});
captureBoard[4][4] = { type: 'r' as const, color: 'w' as const, id: 'attacker' };
const captureMarkup = renderBoard({
  board: captureBoard,
  selected: null,
  legalMoves: [],
  lastMove: { from: [4, 3], to: [4, 4] },
  captureFx: {
    from: [4, 3], to: [4, 4], victimAt: [4, 4], attackerId: 'attacker',
    color: 'w', piece: 'r', victimColor: 'b', victimPiece: 'n',
  },
  focusSquare: [7, 0],
  whiteInCheck: false,
  blackInCheck: false,
  enemyWardPieceId: null,
  playerWardPieceId: null,
  markedEnemyId: null,
  staggerId: null,
  snareId: null,
  snareTurns: 0,
  blockadeSquare: null,
  blockadeTurns: 0,
  heroBlockadeSquares: [],
  heroBlockadeTurns: 0,
  heroBlockadeName: '',
  bossSnareId: null,
  bossSealedSquare: null,
  targeting: false,
  disabled: false,
});
check('tangkapan: ghost menampilkan bidak korban yang tepat', captureMarkup.includes('capture-ghost shattering black">♞'));

const defs = renderCardIconDefs();
check('ikon: symbol terdefinisi', Object.keys(CARD_ICON_SYMBOLS).length === 29, String(Object.keys(CARD_ICON_SYMBOLS).length));
check('ikon: blok defs dirender', defs.includes('id="icon-ward"') && defs.includes('viewBox="0 0 64 64"'));
check('ikon: defs disembunyikan', defs.includes('class="icon-defs"'));
const reroll = renderReroll({
  available: true,
  label: 'PUTAR KARTU • GRATIS',
  caption: 'Gratis • putaran 1 dari 2',
  disabled: false,
  reason: 'Ganti ketiga kartu gratis.',
});
check('putar kartu: path SVG baru dirender langsung', reroll.includes('<svg viewBox="0 0 24 24"') && reroll.includes(REROLL_ICON));
check('putar kartu: aria-label', reroll.includes('aria-label="PUTAR KARTU • GRATIS.'));

console.log('PASS ' + passed + ' / FAIL ' + failures.length);
for (const failure of failures) console.log('  FAIL: ' + failure);
if (failures.length > 0) {
  (globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1;
}

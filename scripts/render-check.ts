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

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failures.push(name + (detail ? ' :: ' + detail : ''));
}

// 1. Layar hasil: menang dengan hadiah, kalah, remis
const win = renderResultPage({
  title: 'Hasil duel',
  heading: 'Skakmat. Raja hitam tumbang.',
  summary: 'Kemenangan atas Pengawal Bastion (Lantai 01 / Penjaga).',
  rewardText: 'Hadiah 15 koin masuk ke dompet.',
  progressText: '1 dari 3 lantai ditaklukkan',
  canReplay: true,
  undoDisabled: true,
});
check('hasil: judul hasil', win.includes('Hasil duel'));
check('hasil: heading skakmat', win.includes('Raja hitam tumbang'));
check('hasil: hadiah tampil', win.includes('Hadiah 15 koin'));
check('hasil: progres tampil', win.includes('1 dari 3 lantai'));
check('hasil: tombol ulangi ada', win.includes('data-command="replay"'));
check('hasil: undo nonaktif', win.includes('data-command="undo"') && win.includes('disabled'));
check('hasil: ada role status', win.includes('role="status"'));

const lose = renderResultPage({
  title: 'Hasil duel',
  heading: 'Skakmat. Raja putih tumbang.',
  summary: 'Kekalahan dari Pengawal Bastion.',
  rewardText: null,
  progressText: '0 dari 3 lantai ditaklukkan',
  canReplay: true,
  undoDisabled: false,
});
check('hasil kalah: tidak ada hadiah', !lose.includes('result-reward'));
check('hasil kalah: undo aktif', lose.includes('data-command="undo"') && !lose.includes('data-command="undo" disabled'));

// 2. Menu: state belum selesai
const menu = renderMenuPage({
  coins: 30,
  clearedCount: 0,
  totalFloors: 3,
  allCleared: false,
  nextBoss: { name: 'Pengawal Bastion', description: 'Benteng tua.', rule: 'Perisai berpindah.' },
  selectedBoss: {
    id: 'bastion', name: 'Pengawal Bastion', glyph: '♜', subtitle: 'Lantai 01 / Penjaga', reward: 15,
    unlocked: true, defeated: false, selected: true, description: 'Benteng tua.', rule: 'Perisai berpindah.',
  },
  lastClearedBoss: null,
  floorProgress: [
    { id: 'bastion', name: 'Pengawal Bastion', glyph: '♜', subtitle: 'Lantai 01 / Penjaga', reward: 15, unlocked: true, defeated: false, selected: true, description: 'Benteng tua.', rule: 'Perisai berpindah.' },
    { id: 'ash', name: 'Pemangsa Abu', glyph: '♛', subtitle: 'Lantai 02 / Penguras', reward: 20, unlocked: false, defeated: false, selected: false, description: 'Ratu abu.', rule: 'Menguras EN.' },
    { id: 'rift', name: 'Peramal Retakan', glyph: '♞', subtitle: 'Lantai 03 / Pengunci', reward: 25, unlocked: false, defeated: false, selected: false, description: 'Retakan papan.', rule: 'Segel petak.' },
  ],
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
});
check('menu: 0 dari 3 lantai', menu.includes('0 dari 3'));
check('menu: boss berikutnya tampil', menu.includes('Pengawal Bastion'));
check('menu: hero aktif tampil', menu.includes('Arunika'));
check('menu: potret via data-portrait', menu.includes('data-portrait="arunika"'));
check('menu: tiga lantai progres memakai data boss', (menu.match(/class="home-floor-step(?: selected)?"/g) ?? []).length === 3);
check('menu: lantai terkunci tetap diberi status', menu.includes('Terkunci'));
check('menu: peta dunia lokal dan tiga marker boss tampil', menu.includes('src="/assets/broken-crescent-pixel-map.png"') && (menu.match(/<button class="dungeon-map-marker/g) ?? []).length === 3);
check('menu: marker dan kartu memilih boss yang sama', (menu.match(/data-command="select-boss" data-boss-id="bastion"/g) ?? []).length === 2);
check('menu: mulai tantangan memakai boss terpilih', menu.includes('data-command="start-boss" aria-label="Mulai pertarungan melawan Pengawal Bastion"'));
check('menu: skill dan ultimate memakai deskripsi hero', menu.includes('Berpindah sampai dua petak.') && menu.includes('Berpindah ke petak kosong mana pun.'));
check('menu: fakta koleksi berasal dari data game', menu.includes('37 kartu') && menu.includes('6 tersedia'));
check('menu: riwayat kosong menampilkan tantangan dan hadiah aktual', menu.includes('Belum ada lantai selesai') && menu.includes('Tantangan berikutnya: Pengawal Bastion') && menu.includes('15 koin'));

const cleared = renderMenuPage({
  coins: 90,
  clearedCount: 3,
  totalFloors: 3,
  allCleared: true,
  nextBoss: { name: 'Peramal Retakan', description: 'x', rule: 'y' },
  selectedBoss: {
    id: 'rift', name: 'Peramal Retakan', glyph: '♞', subtitle: 'Lantai 03 / Pengunci', reward: 25,
    unlocked: true, defeated: true, selected: true, description: 'x', rule: 'y',
  },
  lastClearedBoss: {
    id: 'rift', name: 'Peramal Retakan', glyph: '♞', subtitle: 'Lantai 03 / Pengunci', reward: 25,
    unlocked: true, defeated: true, selected: true, description: 'x', rule: 'y',
  },
  floorProgress: [
    { id: 'bastion', name: 'Pengawal Bastion', glyph: '♜', subtitle: 'Lantai 01 / Penjaga', reward: 15, unlocked: true, defeated: true, selected: false, description: 'Benteng tua.', rule: 'Perisai berpindah.' },
    { id: 'ash', name: 'Pemangsa Abu', glyph: '♛', subtitle: 'Lantai 02 / Penguras', reward: 20, unlocked: true, defeated: true, selected: false, description: 'Ratu abu.', rule: 'Menguras EN.' },
    { id: 'rift', name: 'Peramal Retakan', glyph: '♞', subtitle: 'Lantai 03 / Pengunci', reward: 25, unlocked: true, defeated: true, selected: true, description: 'Retakan papan.', rule: 'Segel petak.' },
  ],
  activeHero: {
    id: 'liora',
    name: 'Liora',
    role: 'Penjaga Benteng',
    portrait: 'liora',
    skillName: 'Segel Petak',
    skillDescription: 'Kunci petak kosong selama dua balasan.',
    ultimateName: 'Benteng Prisma',
    ultimateDescription: 'Bentuk blokade silang selama dua balasan.',
    strength: 'Menutup lima petak.',
    weakness: 'Membutuhkan petak kosong.',
  },
  heroCount: 6,
  cardCount: 37,
});
check('menu selesai: judul menara', cleared.includes('Menara ditaklukkan'));
check('menu selesai: 3 dari 3', cleared.includes('3 dari 3'));
check('menu selesai: tiga status lantai selesai', (cleared.match(/class="home-floor-state">Selesai/g) ?? []).length === 3);
check('menu selesai: riwayat terakhir memakai boss dan hadiah aktual', cleared.includes('Peramal Retakan') && cleared.includes('25 koin'));

// 3. Dungeon: kunci + detail
const dungeon = renderDungeonPage({
  items: [
    {
      id: 'bastion',
      name: 'Pengawal Bastion',
      glyph: '♜',
      subtitle: 'Lantai 01 / Penjaga',
      reward: 15,
      unlocked: true,
      defeated: false,
      selected: true,
    },
    {
      id: 'ash',
      name: 'Pemangsa Abu',
      glyph: '♛',
      subtitle: 'Lantai 02 / Penguras',
      reward: 20,
      unlocked: false,
      defeated: false,
      selected: false,
    },
  ],
  detail: {
    id: 'bastion',
    name: 'Pengawal Bastion',
    glyph: '♜',
    subtitle: 'Lantai 01 / Penjaga',
    reward: 15,
    unlocked: true,
    defeated: false,
    selected: true,
    description: 'Benteng tua.',
    rule: 'Perisai berpindah.',
  },
});
check('dungeon: label mulai', dungeon.includes('Mulai pertarungan'));
check('dungeon: aturan boss tampil', dungeon.includes('Keunikan:'));
check('dungeon: hadiah koin tampil', dungeon.includes('Hadiah 15 koin'));
check('dungeon: boss terkunci nonaktif', dungeon.includes('Terkunci'));
check('dungeon: memakai aset peta lokal dengan alt', dungeon.includes('src="/assets/broken-crescent-pixel-map.png"') && dungeon.includes('alt="Peta pixel-art dunia'));
check('dungeon: satu marker per boss pada view', (dungeon.match(/<button class="dungeon-map-marker/g) ?? []).length === 2);
check('dungeon: marker membuka pilihan boss yang sama', dungeon.includes('data-command="select-boss" data-boss-id="bastion" style="--map-x:18%;--map-y:40%"'));
check('dungeon: marker boss terkunci nonaktif', dungeon.includes('data-boss-id="ash" style="--map-x:48%;--map-y:82%" aria-label="Pemangsa Abu, Terkunci" aria-pressed="false" disabled>02</button>'));

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

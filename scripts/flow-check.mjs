// Smoke walkthrough: chapter map, ten land markers, locked progression, duel,
// standard chess/card/hero actions, save migration and continuation.


import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const OUT = join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', 'flow-check');
mkdirSync(OUT, { recursive: true });
const executablePath =
  process.env.CHROMIUM_PATH ??
  join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failures.push(name + (detail ? ' :: ' + detail : ''));
}

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => {
  const proto = window.AudioContext?.prototype;
  if (!proto) return;
  const createOscillator = proto.createOscillator;
  window.__ccSoundOscillators = 0;
  proto.createOscillator = function () {
    window.__ccSoundOscillators += 1;
    return createOscillator.call(this);
  };
});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const remoteRequests = [];
page.on('request', (r) => {
  if (!r.url().startsWith(URL) && !r.url().startsWith('data:')) remoteRequests.push(r.url());
});
const failedResponses = [];
page.on('response', (r) => {
  if (r.status() >= 400) failedResponses.push(r.status() + ' ' + r.url());
});

await page.goto(URL, { waitUntil: 'load' });
const homeTerrain = await page.evaluate(async () => {
  const image = document.querySelector('.home-world-image');
  if (!(image instanceof HTMLImageElement)) return [];
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return [];
  context.drawImage(image, 0, 0);
  const isOcean = (red, green, blue) => blue > red * 1.4 && blue > green * 1.12 && red < 100 && green < 180;
  return Array.from(document.querySelectorAll('.home-world-map .dungeon-map-marker')).map((marker) => {
    const x = Math.round((Number.parseFloat(marker.style.getPropertyValue('--map-x')) / 100) * image.naturalWidth);
    const y = Math.round((Number.parseFloat(marker.style.getPropertyValue('--map-y')) / 100) * image.naturalHeight);
    const center = context.getImageData(x, y, 1, 1).data;
    let ocean = 0;
    let samples = 0;
    for (let row = -3; row <= 3; row += 1) {
      for (let column = -3; column <= 3; column += 1) {
        const pixel = context.getImageData(x + column, y + row, 1, 1).data;
        if (isOcean(pixel[0], pixel[1], pixel[2])) ocean += 1;
        samples += 1;
      }
    }
    return {
      chapter: marker.getAttribute('data-chapter-id'),
      x: Number.parseFloat(marker.style.getPropertyValue('--map-x')),
      y: Number.parseFloat(marker.style.getPropertyValue('--map-y')),
      centerRgb: Array.from(center.slice(0, 3)),
      oceanRatio: ocean / samples,
    };
  });
});
check(
  'sepuluh marker chapter berada di daratan',
  homeTerrain.length === 10 && homeTerrain.every((marker) => marker.oceanRatio < 0.25),
  JSON.stringify(homeTerrain),
);


// 1. Menu
check('menu terbuka', await page.getByRole('heading', { name: 'Peta campaign terbuka.' }).isVisible());
check('koin 30 tampil', (await page.locator('.hub-wallet strong').textContent()) === '30');
const homeMapState = await page.locator('.home-world-image').evaluate(async (image) => {
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
});
check('peta beranda lokal termuat', homeMapState.width > 0 && homeMapState.height > 0, JSON.stringify(homeMapState));
await page.setViewportSize({ width: 320, height: 780 });
const homeMapLayout = await page.evaluate(() => {
  const stage = document.querySelector('.home-world-map');
  const stageRect = stage?.getBoundingClientRect();
  const markers = Array.from(stage?.querySelectorAll('.dungeon-map-marker') ?? []);
  return {
    markers: markers.length,
    markersFit: Boolean(stageRect) && markers.every((marker) => {
      const rect = marker.getBoundingClientRect();
      return rect.left >= stageRect.left - 1 && rect.right <= stageRect.right + 1 &&
        rect.top >= stageRect.top - 1 && rect.bottom <= stageRect.bottom + 1;
    }),
    touchTargets: markers.every((marker) => {
      const style = getComputedStyle(marker);
      return Number.parseFloat(style.minWidth) >= 44 && Number.parseFloat(style.minHeight) >= 44;
    }),
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
  };
});
check(
  'peta beranda muat dan marker punya target sentuh penuh pada 320px',
  homeMapLayout.markers === 10 && homeMapLayout.markersFit && homeMapLayout.touchTargets &&
    homeMapLayout.noHorizontalOverflow,
  JSON.stringify(homeMapLayout),
);
await page.setViewportSize({ width: 1440, height: 900 });
const allChapterMarkers = page.locator('.home-world-map .dungeon-map-marker');
for (let index = 0; index < await allChapterMarkers.count(); index += 1) {
  const marker = allChapterMarkers.nth(index);
  const chapterId = await marker.getAttribute('data-chapter-id');
  await marker.click();
  check('marker ' + chapterId + ' dapat dipilih', (await marker.getAttribute('aria-pressed')) === 'true');
}
const secondChapterMarker = page.locator('.home-world-map .dungeon-map-marker[data-chapter-id="chapter-02"]');
check(
  'chapter kedua terkunci tetapi bisa dipreview',
  (await secondChapterMarker.getAttribute('class')).includes('locked') && !(await secondChapterMarker.isDisabled()),
);
await secondChapterMarker.click();
check(
  'lantai chapter terkunci tidak dapat dimulai',
  (await page.locator('.home-selected-boss h3').textContent()) === 'Kuil Abu' &&
    (await page.locator('.home-start-button').isDisabled()),
);
await page.locator('.home-world-map .dungeon-map-marker[data-chapter-id="chapter-01"]').click();
check(
  'chapter pertama menyelaraskan marker dan lantai terpilih',
  (await page.locator('.home-selected-boss h3').textContent()) === 'Benteng Bastion' &&
    (await page.locator('.home-floor-step.selected').getAttribute('data-floor-id')) === 'chapter-01-floor-01',
);
check('CTA lantai pertama aktif', await page.locator('.home-start-button').isEnabled());

// 2. Hero roster 6 + potret termuat
await page.getByRole('button', { name: 'Hero', exact: true }).click();
const heroCards = page.locator('.hero-card');
check('6 hero tampil', (await heroCards.count()) === 6, String(await heroCards.count()));
const portraitState = await page.evaluate(async () => {
  const faces = Array.from(document.querySelectorAll('.hero-card-face'));
  if (!faces.length) return { total: 0, loaded: 0 };
  await Promise.all(
    faces.map((face) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = getComputedStyle(face).backgroundImage.slice(5, -2);
      }),
    ),
  );
  return { total: faces.length, loaded: faces.length };
});
check('potret 6 termuat', portraitState.total === 6 && portraitState.loaded === 6, JSON.stringify(portraitState));

// pilih hero non-default lalu kembali ke Arunika
await page.locator('.hero-card', { hasText: 'Liora' }).click();
await page.getByRole('button', { name: 'Pilih hero' }).click();
check('hero Liora dipilih', (await page.evaluate(() => JSON.parse(localStorage.getItem('crown-catalyst-dungeon-v1')).selectedHero)) === 'liora');
await page.locator('.hero-card', { hasText: 'Arunika' }).click();
await page.getByRole('button', { name: 'Pilih hero' }).click();

// Deck builder: slot tepat 10 kartu non-Joker + 1 Joker, tersimpan dan dipakai saat duel.
await page.locator('.hero-menu-tab[data-tab="deck"]').click();
check('37 kartu tersedia di deck builder', (await page.locator('.deck-card').count()) === 37);
check('loadout awal berisi 10 kartu + 1 Joker', (await page.locator('.deck-selected-card').count()) === 11);
check('batas jenis tampak pada panel loadout', (await page.locator('.deck-slot-count').nth(0).textContent()).includes('10') && (await page.locator('.deck-slot-count').nth(1).textContent()).includes('1'));
check('kartu lain nonaktif saat 10 slot reguler terisi', (await page.locator('.deck-card:not(.kind-joker):disabled').count()) > 0);
check('Joker lain nonaktif saat slot Joker terisi', (await page.locator('.deck-card.kind-joker:disabled').count()) === 2);

const removedDeckCard = page.locator('.deck-card.selected:not(.kind-joker)').first();
const removedDeckCardId = await removedDeckCard.getAttribute('data-card-id');
await removedDeckCard.focus();
await page.keyboard.press('Enter');
check('kartu dapat dilepas dari slot reguler dengan keyboard', (await page.locator('.deck-slot-count').nth(0).textContent()).includes('09'));
const availableRegularCardIds = await page.locator('.deck-card:not(.kind-joker):not(.selected):not(:disabled)').evaluateAll((cards) =>
  cards.map((card) => card.getAttribute('data-card-id')).filter(Boolean),
);
const addedDeckCardId = availableRegularCardIds.find((id) => id !== removedDeckCardId) ?? null;
if (addedDeckCardId) await page.locator(`.deck-card[data-card-id="${addedDeckCardId}"]`).click();
check('kartu pengganti mengisi slot tanpa melewati batas', (await page.locator('.deck-card.selected:not(.kind-joker)').count()) === 10);
check('pilihan lama dilepas dan pilihan baru disimpan',
  removedDeckCardId !== null && addedDeckCardId !== null &&
    (await page.locator(`.deck-card[data-card-id="${removedDeckCardId}"]`).getAttribute('aria-pressed')) === 'false' &&
    (await page.locator(`.deck-card[data-card-id="${addedDeckCardId}"]`).getAttribute('aria-pressed')) === 'true');
const savedDeck = await page.evaluate(() => JSON.parse(localStorage.getItem('crown-catalyst-dungeon-v1')).deckCardIds);
check('save menyimpan 10 kartu reguler + 1 Joker',
  savedDeck.length === 11 && savedDeck.filter((id) => ['phoenix', 'fold', 'edict'].includes(id)).length === 1);
await page.locator('.deck-filter[data-filter="joker"]').focus();
await page.keyboard.press('Enter');
check('filter deck dapat dipakai dengan keyboard',
  (await page.locator('.deck-card').count()) === 3 && await page.locator('.deck-filter[data-filter="joker"]').getAttribute('aria-pressed') === 'true');
await page.locator('.deck-filter[data-filter="all"]').click();
await page.screenshot({ path: join(OUT, 'deck-builder.png') });
await page.reload({ waitUntil: 'load' });
await page.getByRole('button', { name: 'Hero', exact: true }).click();
await page.locator('.hero-menu-tab[data-tab="deck"]').click();
check('deck terpilih tetap ada setelah reload',
  (await page.locator('.deck-card.selected:not(.kind-joker)').count()) === 10 &&
    (await page.locator('.deck-card.selected.kind-joker').count()) === 1);

// Cek roster + deck pada desktop, tablet, dan ponsel.
for (const width of [320, 390, 720, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  const deckFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('deck tidak overflow horizontal pada ' + width + 'px', deckFits);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: join(OUT, 'deck-builder-mobile.png') });
await page.setViewportSize({ width: 1440, height: 900 });
await page.locator('.hero-menu-tab[data-tab="roster"]').click();
for (const width of [320, 390, 720, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  const rosterFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('roster tidak overflow horizontal pada ' + width + 'px', rosterFits);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: join(OUT, 'hero-roster-mobile.png'), fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: join(OUT, 'hero-roster.png') });

// CTA yang diakses saat loadout belum lengkap membawa pemain langsung ke deck editor.
await page.locator('.hero-menu-tab[data-tab="deck"]').click();
const temporarilyRemoved = page.locator('.deck-card.selected:not(.kind-joker)').first();
const temporarilyRemovedId = await temporarilyRemoved.getAttribute('data-card-id');
await temporarilyRemoved.click();
await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
check('dungeon menawarkan atur deck sebelum duel',
  await page.locator('.floor-detail [data-command="open-deck"]').count() === 1);
await page.locator('.floor-detail [data-command="open-deck"]').click();
check('CTA dungeon membuka deck editor', await page.locator('.deck-builder-layout').isVisible());
if (temporarilyRemovedId) await page.locator(`.deck-card[data-card-id="${temporarilyRemovedId}"]`).click();
check('loadout dapat dilengkapi kembali', (await page.locator('.deck-selected-card').count()) === 11);

// 3. Peta 10 chapter, lima lantai, dan gerbang chapter.
await page.getByRole('button', { name: 'Dungeon' }).click();
check('lima lantai tampil', (await page.locator('.floor-node').count()) === 5);
const mapImage = await page.locator('.dungeon-map-image').evaluate(async (image) => {
  await image.decode();
  return { source: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight };
});
check(
  'peta dunia lokal termuat',
  mapImage.source === '/assets/broken-crescent-pixel-map.png' && mapImage.width > 0 && mapImage.height > 0,
  JSON.stringify(mapImage),
);
check('sepuluh marker chapter tampil', (await page.locator('.dungeon-map-marker').count()) === 10);
await page.locator('.dungeon-map-marker[data-chapter-id="chapter-02"]').click();
check(
  'lantai chapter berikutnya terkunci sebelum boss',
  (await page.locator('.floor-node').count()) === 5 &&
    (await page.locator('.floor-detail [data-command="start-floor"]').isDisabled()),
);
await page.locator('.dungeon-map-marker[data-chapter-id="chapter-01"]').click();
await page.locator('.floor-node[data-floor-id="chapter-01-floor-02"]').click();
check('lantai berikutnya terkunci sampai lantai sebelumnya selesai',
  await page.locator('.floor-detail [data-command="start-floor"]').isDisabled());
await page.locator('.floor-node[data-floor-id="chapter-01-floor-01"]').click();
check('lantai pertama terbuka', await page.locator('.floor-detail [data-command="start-floor"]').isEnabled());

// 4. Mulai duel
await page.locator('.floor-detail [data-command="start-floor"]').click();
await page.waitForSelector('.square');
const selectedDeckForBattle = await page.evaluate(() => JSON.parse(localStorage.getItem('crown-catalyst-dungeon-v1')).deckCardIds);
const openingHandIds = await page.locator('.skill-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-id')));
check('tangan awal duel hanya berasal dari deck pilihan',
  openingHandIds.length === 3 && openingHandIds.every((id) => selectedDeckForBattle.includes(id)));
const pieceCount = () =>
  page.evaluate(
    () => Array.from(document.querySelectorAll('.square .piece')).filter((p) => p.textContent.trim()).length,
  );
check('64 petak', (await page.locator('.square').count()) === 64);
check('32 bidak', (await pieceCount()) === 32, String(await pieceCount()));
check('EN hero 4/5', (await page.locator('.energy-number').first().textContent()).includes('4'));
const heroDockLayout = await page.evaluate(() => {
  const profile = document.querySelector('.hero-dock .player-skill-profile')?.getBoundingClientRect();
  const actions = document.querySelector('.hero-dock .hero-action-panel')?.getBoundingClientRect();
  return Boolean(profile && actions && profile.width > 0 && actions.width > 0 && actions.left >= profile.right - 1);
});
check('hero + skill + ultimate di box bawah berurutan', heroDockLayout);
const affordabilityMatchesMana = await page.evaluate(() => {
  const mana = Number.parseInt(document.querySelector('.card-mana-hud strong')?.textContent ?? '0', 10);
  return Array.from(document.querySelectorAll('.skill-card')).every((card) => {
    const cost = Number.parseInt(card.querySelector('.card-cost')?.textContent ?? '0', 10);
    const unaffordable = card.classList.contains('is-unaffordable');
    const disabled = card.querySelector('.card-play')?.disabled ?? false;
    return unaffordable === (cost > mana) && (!unaffordable || disabled);
  });
});
check('kartu kekurangan mana abu dan nonaktif', affordabilityMatchesMana);
const rerollCardStyle = await page.locator('.roll-availability').evaluate((button) => ({
  border: getComputedStyle(button).borderLeftWidth,
  fill: getComputedStyle(button.querySelector('svg')).fill,
  stroke: getComputedStyle(button.querySelector('svg')).stroke,
}));
check('putar kartu: bingkai utuh dan ikon refresh solid', rerollCardStyle.border === '4px' && rerollCardStyle.fill !== 'none' && rerollCardStyle.stroke === 'none');
const oscillatorCount = await page.evaluate(() => window.__ccSoundOscillators ?? 0);
await page.locator('.skill-card').first().hover();
check('hover kartu memicu sound effect', (await page.evaluate(() => window.__ccSoundOscillators ?? 0)) > oscillatorCount);

// 5. Langkah legal + mana +1
const manaBefore = await page.locator('.card-mana-hud strong').textContent();
await page.locator('.square[data-row="6"][data-col="4"]').click();
check('petak tujuan menyala', (await page.locator('.square.move-hint, .square.capture-hint').count()) > 0);
await page.locator('.square[data-row="4"][data-col="4"]').click();
await page.waitForTimeout(1200);
const manaAfter = await page.locator('.card-mana-hud strong').textContent();
check('mana +1 setelah langkah', manaBefore !== manaAfter, manaBefore + ' -> ' + manaAfter);
check('ledger terisi', (await page.locator('.move-list li').count()) >= 2);
const turnFlag = (await page.locator('.turn-flag').textContent()).toLowerCase();
check('giliran putih kembali', turnFlag.includes('putih'), turnFlag);

// 5b. Undo satu putaran penuh (dicek tepat setelah satu putaran, agar deterministik)
const plyBeforeUndo = await page.locator('.move-list li').count();
check('undo tersedia setelah satu putaran', await page.locator('[data-command="undo"]').isEnabled());
await page.locator('[data-command="undo"]').click();
await page.waitForTimeout(200);
const plyAfterUndo = await page.locator('.move-list li').count();
check('undo mengosongkan langkah', plyAfterUndo === 0, plyBeforeUndo + ' -> ' + plyAfterUndo);
check('undo: langkah kembali ke 01', (await page.locator('.hud-value').nth(1).textContent()).includes('01'));
check('undo: mana kembali 0', (await page.locator('.card-mana-hud strong').textContent()).includes('0'));

// Mainkan ulang langkah pembuka supaya keadaan duel normal untuk uji kartu.
await page.locator('.square[data-row="6"][data-col="4"]').click();
await page.locator('.square[data-row="4"][data-col="4"]').click();
await page.waitForTimeout(1200);

// 6. Kartu: accrue mana, main, target, cancel refund
const cardSlots = page.locator('.skill-card .card-play');
check('3 kartu', (await cardSlots.count()) === 3);
check(
  'kartu menampilkan biaya mana',
  (await page.locator('.card-cost').first().textContent()).includes('MANA'),
  await page.locator('.card-cost').first().textContent(),
);

// Kumpulkan mana dengan beberapa langkah pion agar pasti ada kartu terjangkau.
for (let move = 0; move < 3; move += 1) {
  const pawn = `.square[data-row="${5 - move}"][data-col="4"]`;
  if ((await page.locator(pawn).count()) === 0) continue;
  await page.locator(pawn).click();
  const targets = page.locator('.square.move-hint, .square.capture-hint');
  if ((await targets.count()) === 0) {
    await page.keyboard.press('Escape');
    continue;
  }
  await targets.first().click();
  await page.waitForTimeout(1200);
}

let pendingTargetCardCast = null;

const enabledSlots = [];
for (let i = 0; i < 3; i += 1) {
  if (!(await cardSlots.nth(i).isDisabled())) enabledSlots.push(i);
}
if (enabledSlots.length === 0) {
  // Tidak ada kartu terjangkau: label status harus menjelaskan alasannya (FR-20).
  const labels = await page.locator('.card-state span').allTextContents();
  check(
    'kartu terkunci menjelaskan biaya mana',
    labels.some((label) => /BUTUH|GRATIS/.test(label)),
    labels.join(' | '),
  );
} else {
  const chosenSlot = enabledSlots[0];
  const chosenCard = page.locator('.skill-card').nth(chosenSlot);
  const cardBounds = await chosenCard.boundingBox();
  if (cardBounds) {
    await page.mouse.move(cardBounds.x + cardBounds.width * 0.16, cardBounds.y + cardBounds.height * 0.2);
    const tilt = await chosenCard.evaluate((card) => ({
      x: getComputedStyle(card).getPropertyValue('--tilt-x').trim(),
      y: getComputedStyle(card).getPropertyValue('--tilt-y').trim(),
    }));
    check('kartu mengikuti posisi kursor dengan tilt ringan', Boolean(tilt.x && tilt.y && (tilt.x !== '0deg' || tilt.y !== '0deg')));
  } else {
    check('kartu mengikuti posisi kursor dengan tilt ringan', false, 'kartu tidak terlihat');
  }
  const chosenCost = Number.parseInt(await page.locator('.skill-card').nth(chosenSlot).locator('.card-cost').textContent(), 10);
  const chosenCardId = await chosenCard.getAttribute('data-card-id');
  const chosenKind = (await chosenCard.getAttribute('class'))
    .split(/\s+/)
    .find((name) => name.startsWith('kind-'))
    ?.slice('kind-'.length);
  await cardSlots.nth(chosenSlot).click();
  await page.waitForTimeout(120);
  const targeting = (await page.locator('.board.is-targeting').count()) > 0;
  check('kartu bisa dimainkan', true);
  if (targeting) {
    pendingTargetCardCast = { slot: chosenSlot, id: chosenCardId, kind: chosenKind };
  } else {
    const cardFx = page.locator('.combat-cast-fx[data-effect="card-' + chosenKind + '"]');
    const cardFxCount = await cardFx.count();
    const cardMotion = cardFxCount
      ? await cardFx.locator('i').first().evaluate((element) => ({
          name: getComputedStyle(element).animationName,
          duration: getComputedStyle(element).animationDuration,
        }))
      : null;
    check(
      'cast kartu menampilkan animasi keluarga ' + chosenKind,
      cardFxCount === 1 && cardMotion?.name !== 'none' && cardMotion?.duration === '0.72s',
    );
    await page.screenshot({ path: join(OUT, 'combat-cast-card.png') });
  }
  if (targeting) {
    const manaPaid = await page.locator('.card-mana-hud strong').textContent();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const manaBack = await page.locator('.card-mana-hud strong').textContent();
    check(
      'kartu target dibatalkan + mana kembali',
      chosenCost === 0 ? manaPaid === manaBack : manaPaid !== manaBack,
      manaPaid + ' -> ' + manaBack,
    );
    check('status pembatalan tampil', (await page.locator('.board-status').textContent()).includes('dibatalkan'));

    // Batalkan lewat klik ulang pada kartu yang sama (jalur kedua FR-12).
    await cardSlots.nth(chosenSlot).click();
    await page.waitForTimeout(120);
    const manaAfterPlay = await page.locator('.card-mana-hud strong').textContent();
    await cardSlots.nth(chosenSlot).click();
    await page.waitForTimeout(150);
    check(
      'klik ulang kartu membatalkan + refund',
      chosenCost === 0
        ? (await page.locator('.card-mana-hud strong').textContent()) === manaAfterPlay
        : (await page.locator('.card-mana-hud strong').textContent()) !== manaAfterPlay,
      manaAfterPlay + ' -> ' + (await page.locator('.card-mana-hud strong').textContent()),
    );
  }
}

// 7. Skill hero + cancel tanpa EN
const enBefore = await page.locator('.energy-number').first().textContent();
await page.locator('[data-command="hero-skill"]').click();
const skillTargeting = (await page.locator('[data-command="hero-skill"].is-targeting').count()) > 0;
if (skillTargeting) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check('cancel skill tanpa EN', (await page.locator('.energy-number').first().textContent()) === enBefore);
  check('status cancel hero tampil', (await page.locator('.board-status').textContent()).includes('dibatalkan'));
}
// Konfirmasi target skill untuk memastikan animasi muncul setelah cast, bukan saat batal.
await page.locator('[data-command="hero-skill"]').click();
const phaseTarget = await page.locator('.square').evaluateAll((squares) => {
  const target = squares.find(
    (square) => square.querySelector('.piece.white') && !square.getAttribute('aria-label')?.includes('raja'),
  );
  return target ? { row: target.dataset.row, col: target.dataset.col } : null;
});
const phaseTargeting = (await page.locator('[data-command="hero-skill"].is-targeting').count()) > 0;
check('skill Arunika masuk mode target', phaseTargeting);
check('skill Arunika menemukan bidak putih non-raja', Boolean(phaseTarget));
if (phaseTargeting && phaseTarget) {
  await page.locator(`.square[data-row="${phaseTarget.row}"][data-col="${phaseTarget.col}"]`).click();
  const boardFrameWidth = await page.locator('.board-frame').evaluate((element) => element.getBoundingClientRect().width);
  const phaseFx = page.locator('.combat-cast-fx[data-effect="hero-phase"]');
  const phaseFxCount = await phaseFx.count();
  const phaseMotion = phaseFxCount
    ? await phaseFx.locator('i').first().evaluate((element) => ({
        name: getComputedStyle(element).animationName,
        duration: getComputedStyle(element).animationDuration,
        parentDuration: getComputedStyle(element.parentElement).animationDuration,
        width: element.getBoundingClientRect().width,
      }))
    : null;
  check(
    'cast skill menampilkan efek fase dengan animasi',
    phaseFxCount === 1 && phaseMotion?.name === 'cast-orbit' && phaseMotion.duration === '0.72s' &&
      phaseMotion.width >= boardFrameWidth * 0.62 && phaseMotion.parentDuration === '0.78s',
    JSON.stringify({ phaseFxCount, phaseMotion, boardFrameWidth }),
  );
  await page.screenshot({ path: join(OUT, 'combat-cast-hero.png') });
}
await page.waitForTimeout(820);
check('efek cast dibersihkan setelah animasi penuh', (await page.locator('.combat-cast-fx').count()) === 0);
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.locator('[data-command="hero-skill"]').click();
const reducedPhaseTarget = await page.locator('.square').evaluateAll((squares) => {
  const target = squares.find(
    (square) => square.querySelector('.piece.white') && !square.getAttribute('aria-label')?.includes('raja'),
  );
  return target ? { row: target.dataset.row, col: target.dataset.col } : null;
});
if (reducedPhaseTarget) {
  await page.locator(`.square[data-row="${reducedPhaseTarget.row}"][data-col="${reducedPhaseTarget.col}"]`).click();
}
const reducedPhaseFx = page.locator('.combat-cast-fx[data-effect="hero-phase"]');
const reducedPhaseMotion = (await reducedPhaseFx.count())
  ? await reducedPhaseFx.locator('i').first().evaluate((element) => ({
      name: getComputedStyle(element).animationName,
      duration: getComputedStyle(element).animationDuration,
    }))
  : null;
check(
  'reduced-motion mengubah cast menjadi fade 120ms',
  Boolean(reducedPhaseTarget) && reducedPhaseMotion?.name === 'cast-fx-life' &&
    reducedPhaseMotion.duration === '0.12s',
);
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.waitForTimeout(320);

if (pendingTargetCardCast) {
  const whiteNonKing = '.square:has(.piece.white):not([aria-label*="raja"])';
  const whitePawn = '.square[aria-label*="putih pion"]';
  const blackNonKing = '.square:has(.piece.black):not([aria-label*="raja"])';
  const blackPawn = '.square[aria-label*="hitam pion"]';
  const cardTargets = {
    lancer: whiteNonKing,
    ward: whiteNonKing,
    pawnstep: whitePawn,
    mark: blackNonKing,
    phase: whiteNonKing,
    prism: '.square[aria-label*="putih gajah"], .square[aria-label*="putih benteng"]',
    pawnraid: whitePawn,
    rookbend: '.square[aria-label*="putih benteng"]',
    stagger: blackNonKing,
    snare: blackNonKing,
    sacrifice: whitePawn,
    blockade: '.square[aria-label*="kosong"]',
    relay: whiteNonKing,
    pawnGuard: whitePawn,
    pawnMark: blackPawn,
    pawnStagger: blackPawn,
    fold: whiteNonKing,
    edict: '.square:has(.piece.black):not([aria-label*="raja"]):not([aria-label*="ratu"])',
    phoenix: '.square[aria-label*="kosong"][data-row="6"], .square[aria-label*="kosong"][data-row="7"]',
  };
  await cardSlots.nth(pendingTargetCardCast.slot).click();
  const cardTargeting = (await page.locator('.board.is-targeting').count()) > 0;
  if (cardTargeting && pendingTargetCardCast.id === 'relay') {
    const targets = page.locator(whiteNonKing);
    if (await targets.count() >= 2) {
      await targets.nth(0).click();
      await targets.nth(1).click();
    }
  } else if (cardTargeting) {
    const target = page.locator(cardTargets[pendingTargetCardCast.id] ?? '').first();
    if (await target.count()) await target.click();
  }
  const cardFx = page.locator('.combat-cast-fx[data-effect="card-' + pendingTargetCardCast.kind + '"]');
  const cardFxCount = await cardFx.count();
  const cardMotion = cardFxCount
    ? await cardFx.locator('i').first().evaluate((element) => ({
        name: getComputedStyle(element).animationName,
        duration: getComputedStyle(element).animationDuration,
      }))
    : null;
  check(
    'resolusi kartu target menampilkan animasi keluarga ' + pendingTargetCardCast.kind,
    cardFxCount === 1 && cardMotion?.name !== 'none' && cardMotion?.duration === '0.72s',
  );
  await page.screenshot({ path: join(OUT, 'combat-cast-card.png') });
  if (pendingTargetCardCast.id === 'sacrifice' || pendingTargetCardCast.id === 'relay') {
    await page.waitForFunction(() => (document.querySelector('.turn-flag')?.textContent ?? '').toLowerCase().includes('putih'));
  }
}


// 8. Restart
// 9. Restart
await page.locator('[data-command="restart"]').click();
await page.waitForTimeout(200);
check('restart: 32 bidak', (await pieceCount()) === 32, String(await pieceCount()));
check('restart: langkah 01', (await page.locator('.hud-value').nth(1).textContent()).includes('01'));
check('restart: ledger kosong', (await page.locator('.empty-ledger').count()) === 1);
check('restart: teks status bersih', !(await page.locator('.board-status').textContent()).includes('undefined'));

// 10. Sound toggle tersimpan
await page.locator('.sound-button').click();
check('suara off tersimpan', (await page.evaluate(() => localStorage.getItem('crown-catalyst-sound-v1'))) === '0');
await page.locator('.sound-button').click();

// 11. Keyboard: arrow memindah fokus petak
await page.locator('.square[data-row="7"][data-col="0"]').focus();
check('fokus awal di a1', (await page.evaluate(() => document.activeElement?.getAttribute('data-col'))) === '0');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const focusCol = await page.evaluate(() => document.activeElement?.getAttribute('data-col'));
check('keyboard pindah fokus', focusCol === '1', String(focusCol));
check('focus-visible aktif', await page.evaluate(() => document.activeElement?.matches(':focus-visible') === true));

// 12. Save bertahan setelah reload
const before = await page.evaluate(() => localStorage.getItem('crown-catalyst-dungeon-v1'));
await page.reload({ waitUntil: 'load' });
const after = await page.evaluate(() => localStorage.getItem('crown-catalyst-dungeon-v1'));
check('save bertahan setelah reload', before === after);
check('menu terbuka setelah reload', await page.getByRole('heading', { name: 'Peta campaign terbuka.' }).isVisible());

// 13. Save rusak -> fallback
await page.evaluate(() => localStorage.setItem('crown-catalyst-dungeon-v1', '{broken'));
await page.reload({ waitUntil: 'load' });
check('save rusak tidak crash', await page.getByRole('heading', { name: 'Peta campaign terbuka.' }).isVisible());
check('save rusak -> koin default', (await page.locator('.hub-wallet strong').textContent()) === '30');

// 14. Layar hasil duel: main sampai pertandingan berakhir (maks 60 langkah putih)
{
  await page.evaluate(() => localStorage.removeItem('crown-catalyst-dungeon-v1'));
  await page.goto(URL, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await page.locator('.floor-detail [data-command="start-floor"]').click();
  await page.waitForSelector('.square');
  let ended = false;
  for (let turn = 0; turn < 60 && !ended; turn += 1) {
    if ((await page.locator('.square.move-hint, .square.capture-hint').count()) === 0) {
      const whites = await page.locator('.square .piece.white').evaluateAll((nodes) =>
        nodes
          .map((n) => ({ row: n.closest('.square').dataset.row, col: n.closest('.square').dataset.col }))
          .filter((_, i) => true),
      );
      const target = whites[(turn * 7) % Math.max(1, whites.length)];
      if (!target) break;
      await page.locator(`.square[data-row="${target.row}"][data-col="${target.col}"]`).click();
      if ((await page.locator('.square.move-hint, .square.capture-hint').count()) === 0) {
        await page.keyboard.press('Escape');
        continue;
      }
    }
    await page.locator('.square.move-hint, .square.capture-hint').first().click();
    await page.waitForTimeout(700);
    ended = (await page.locator('.result-panel').count()) > 0;
  }
  if (ended) {
    check('layar hasil tampil', await page.locator('.result-panel').isVisible());
    check(
      'hasil menyebut menang/kalah/remis',
      /tumbang|Tidak ada langkah legal/.test(await page.locator('#result-title').textContent()),
    );
    check(
      'hasil menyertakan progres',
      /lantai ditaklukkan/.test(await page.locator('.result-panel').textContent()),
    );
    check('hasil punya tombol ulangi', (await page.locator('[data-command="replay"]').count()) === 1);
    await page.screenshot({ path: join(OUT, 'result.png') });
  } else {
    console.log('  CATATAN: 60 langkah belum menghasilkan akhir pertandingan (tidak dihitung sebagai gagal)');
  }
}

// 15. Save boss selesai membuka chapter berikutnya di beranda.
{
  const startContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await startContext.addInitScript(() => {
    localStorage.setItem(
      'crown-catalyst-dungeon-v1',
      JSON.stringify({ coins: 45, ownedHeroes: [], selectedHero: 'arunika', defeatedBosses: ['bastion'] }),
    );
  });
  const homeActionPage = await startContext.newPage();
  homeActionPage.on('pageerror', (error) => errors.push('home-start pageerror: ' + error.message));
  await homeActionPage.goto(URL, { waitUntil: 'load' });
  check('clear boss tersimpan membuka progres lima lantai', (await homeActionPage.locator('.home-floor-progress-heading strong').textContent()).includes('5 dari 50'));
  await homeActionPage.locator('.home-world-map .dungeon-map-marker[data-chapter-id="chapter-02"]').click();
  check(
    'chapter setelah boss terbuka dan memilih lantai pertama',
    (await homeActionPage.locator('.home-selected-boss h3').textContent()) === 'Kuil Abu' &&
      (await homeActionPage.locator('.home-floor-step.selected').getAttribute('data-floor-id')) === 'chapter-02-floor-01' &&
      (await homeActionPage.locator('.home-start-button').isEnabled()),
  );
  await homeActionPage.locator('.home-start-button').click();
  await homeActionPage.waitForSelector('.square');
  check(
    'CTA beranda memulai lantai chapter kedua',
    (await homeActionPage.locator('.enemy-profile-copy strong').textContent()) === 'Penjaga' &&
      (await homeActionPage.locator('.board-heading .eyebrow').textContent()).includes('Kuil Abu'),
  );
  await startContext.close();
}

await page.screenshot({ path: join(OUT, 'menu-after-corrupt.png') });
await context.close();
await browser.close();

check('tanpa request eksternal', remoteRequests.length === 0, remoteRequests.slice(0, 3).join(', '));
check('tanpa response 4xx/5xx', failedResponses.length === 0, failedResponses.slice(0, 3).join(', '));
check('tanpa console error', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log('PASS ' + passed + ' / FAIL ' + failures.length);
for (const failure of failures) console.log('  FAIL: ' + failure);
console.log('screenshot: ' + OUT);

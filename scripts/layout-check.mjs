// Responsive Chromium check: campaign chapter map + floor route and clickable chess board.

//
// Jalankan: node scripts/layout-check.mjs

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const OUT = join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', 'layout-check');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '320x780', width: 320, height: 780 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '834x1112', width: 834, height: 1112 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1152x648', width: 1152, height: 648 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

const measure = () => {
  const squares = Array.from(document.querySelectorAll('.square'));
  const clickableIds = new Set();
  const blocked = new Set();
  for (const square of squares) {
    const rect = square.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      blocked.add(square.dataset.row + ':' + square.dataset.col + ' (nol)');
      continue;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || x > innerWidth) continue;
    if (y < 0 || y > innerHeight) continue; // di luar layar: diuji setelah scroll
    const hit = document.elementFromPoint(x, y);
    const id = square.dataset.row + ':' + square.dataset.col;
    if (hit && (hit === square || square.contains(hit))) clickableIds.add(id);
    else blocked.add(id);
  }
  const frame = document.querySelector('.board-frame');
  const panel = document.querySelector('.board-panel');
  const frameRect = frame?.getBoundingClientRect() ?? null;
  const panelRect = panel?.getBoundingClientRect() ?? null;
  const fits =
    frameRect && panelRect
      ? frameRect.height <= panelRect.height + 1 && frameRect.width <= panelRect.width + 1
      : false;
  const square0 = squares[0]?.getBoundingClientRect();
  const desktop = innerWidth >= 1001 && innerWidth > innerHeight;
  const clipped = desktop
    ? ['.topbar', '.enemy-skill-profile', '.hero-rail', '.board-panel', '.battle-rail', '.skill-rail']
        .map((selector) => ({ selector, rect: document.querySelector(selector)?.getBoundingClientRect() }))
        .filter(({ rect }) => rect && (rect.top < -1 || rect.bottom > innerHeight + 1))
        .map(({ selector }) => selector)
    : [];
  return {
    total: squares.length,
    clickableIds: Array.from(clickableIds),
    blocked: Array.from(blocked),
    fits,
    frame: frameRect ? { w: Math.round(frameRect.width), h: Math.round(frameRect.height) } : null,
    panel: panelRect ? { w: Math.round(panelRect.width), h: Math.round(panelRect.height) } : null,
    smallestSquare: square0 ? Math.round(square0.width) : 0,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    needsScroll: document.documentElement.scrollHeight > innerHeight + 1,
    clipped,
    overlaps: findOverlaps(),
  };

  /** Pasangan label penting yang saling menutupi (> 12px² tumpang tindih). */
  function findOverlaps() {
    const selectors = [
    '.board-heading .eyebrow',
    '.board-heading h2',
    '.turn-flag',
    '.board-status',
    '.board-hint',
    '.free-card-note',
    '.hero-action-button.skill',
    '.hero-action-button.ultimate',
    '.card-play',
    '.roll-availability',
    '.target-cancel',
    '.enemy-signal',
  ];
  const nodes = selectors
    .map(function (sel) {
      return { sel, el: document.querySelector(sel) };
    })
    .filter(function (n) {
      return n.el !== null && n.el.getBoundingClientRect().width > 0;
    });
  const found = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i].el.getBoundingClientRect();
      const b = nodes[j].el.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 0 && h > 0 && w * h > 12) {
        found.push(nodes[i].sel + ' x ' + nodes[j].sel + ' (' + Math.round(w * h) + 'px2)');
      }
    }
  }
  return found;
  }
};

// Pakai Chromium yang sudah terpasang di ms-playwright (tanpa unduhan baru).
const executablePath =
  process.env.CHROMIUM_PATH ??
  join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const browser = await chromium.launch({ headless: true, executablePath });
const rows = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
  page.on('requestfailed', (req) => errors.push('requestfailed: ' + req.url()));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(res.status() + ' ' + res.url());
  });

  let campaignLayout = null;
  try {
    await page.goto(URL, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Dungeon', exact: true }).first().click();
    campaignLayout = await page.evaluate(() => {
      const stage = document.querySelector('.dungeon-map-stage');
      const list = document.querySelector('.floor-list');
      const stageRect = stage?.getBoundingClientRect() ?? null;
      const markers = Array.from(document.querySelectorAll('.dungeon-map-marker'));
      const floors = Array.from(document.querySelectorAll('.floor-node'));
      const markersFit = Boolean(stageRect) && markers.length === 10 && markers.every((marker) => {
        const rect = marker.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= stageRect.left - 1 &&
          rect.right <= stageRect.right + 1 && rect.top >= stageRect.top - 1 && rect.bottom <= stageRect.bottom + 1;
      });
      const floorsFit = Boolean(list) && floors.length === 5 && floors.every((floor) =>
        floor.getBoundingClientRect().width > 0 && floor.scrollWidth <= floor.clientWidth + 1,
      );
      return {
        markers: markers.length,
        floors: floors.length,
        markersFit,
        floorsFit,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    if (vp.name === '390x844' || vp.name === '1440x900') {
      await page.screenshot({ path: join(OUT, 'dungeon-' + vp.name + '.png'), fullPage: true });
    }
    await page.locator('.floor-detail [data-command="start-floor"]').click();
    await page.waitForSelector('.square');
    await page.waitForTimeout(250);
  } catch (error) {
    console.log(vp.name.padEnd(11) + ' GAGAL reach board: ' + String(error).split('\n')[0]);
    await page.screenshot({ path: join(OUT, 'fail-' + vp.name + '.png') });
    rows.push({ vp: vp.name, campaignLayout, total: 0, reachable: 0, blockedAfter: [], fits: false, frame: null, panel: null, smallestSquare: 0, errors: errors.length, errorSample: errors.slice(0, 3) });
    await context.close();
    continue;
  }

  const first = await page.evaluate(measure);
  // Petak yang di bawah lipatan layar tetap harus bisa diklik setelah scroll.
  const reachable = new Set(first.clickableIds);
  const scroller = await page.evaluate(() => document.scrollingElement.scrollHeight);
  if (scroller > vp.height) {
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(120);
    const second = await page.evaluate(measure);
    for (const id of second.clickableIds) reachable.add(id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(80);
  }
  const blockedAfter = first.blocked.filter((id) => !reachable.has(id));
  const result = {
    ...first,
    clickableIds: Array.from(reachable),
    reachable: reachable.size,
    blockedAfter,
  };
  if (vp.name === '390x844' || vp.name === '1152x648' || vp.name === '1280x720' || vp.name === '1440x900') {
    await page.screenshot({ path: join(OUT, 'battle-' + vp.name + '.png') });
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(OUT, 'battle-' + vp.name + '-hand.png') });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  rows.push({
    vp: vp.name,
    ...result,
    campaignLayout,
    errors: errors.length,
    errorSample: errors.slice(0, 3),
  });
  await context.close();
}
for (const row of rows) {
  const map = row.campaignLayout;
  if (!map || !map.markersFit || !map.floorsFit || !map.noHorizontalOverflow) {
    console.log('FAIL campaign layout ' + row.vp + ': ' + JSON.stringify(map));
    process.exitCode = 1;
  }
}
await browser.close();

console.log('viewport   click  fits  scroll  clipped  frame        panel       minSq  blocked  overlaps           errors');
for (const row of rows) {
  console.log(
    row.vp.padEnd(11) +
      String((row.reachable ?? 0) + '/' + row.total).padEnd(7) +
      String(row.fits).padEnd(6) +
      String(row.needsScroll === undefined ? '-' : row.needsScroll ? 'YA' : 'tidak').padEnd(8) +
      String(row.clipped?.join(',') || '-').padEnd(9) +
      String(row.frame ? row.frame.w + 'x' + row.frame.h : '-').padEnd(13) +
      String(row.panel ? row.panel.w + 'x' + row.panel.h : '-').padEnd(12) +
      String(row.smallestSquare).padEnd(7) +
      ((row.blockedAfter ?? []).join(',') || '-').padEnd(9) +
      (row.overlaps?.join('; ') || '-').padEnd(19) +
      row.errors,
  );
  for (const sample of row.errorSample) console.log('    ! ' + sample);
  console.log('    campaign: ' + JSON.stringify(row.campaignLayout));
}
console.log('screenshot: ' + OUT);

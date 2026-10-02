// Tangkapan layar kartu pada beberapa status, untuk pemeriksaan visual cepat.
//
// Jalankan: node scripts/card-shots.mjs

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const OUT = join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', 'card-shots');
mkdirSync(OUT, { recursive: true });
const executablePath =
  process.env.CHROMIUM_PATH ??
  join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
await page.getByRole('button', { name: /Mulai pertarungan|Ulangi lantai/ }).first().click();
await page.waitForSelector('.square');

const handShot = async (name) => {
  const list = page.locator('.skill-list');
  await list.scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  await list.screenshot({ path: join(OUT, name + '.png') });
};

const manaText = () => page.locator('.card-mana-hud strong').textContent();

await handShot('01-mana-awal');

// Kumpulkan mana dengan langkah pion yang pasti legal.
for (let move = 0; move < 4; move += 1) {
  const pawn = page.locator('.square[data-row][data-col]').filter({ has: page.locator('.piece.white') });
  const count = await pawn.count();
  if (count === 0) break;
  let advanced = false;
  for (let i = 0; i < count && !advanced; i += 1) {
    await pawn.nth(i).click();
    const hints = page.locator('.square.move-hint, .square.capture-hint');
    if ((await hints.count()) === 0) {
      await page.keyboard.press('Escape');
      continue;
    }
    await hints.first().click();
    advanced = true;
    await page.waitForTimeout(1000);
  }
  if (!advanced) break;
}
console.log('mana setelah langkah:', await manaText());
await handShot('02-mana-terkumpul');

// Mainkan kartu pertama yang terjangkau.
const slots = page.locator('.skill-card .card-play');
for (let i = 0; i < 3; i += 1) {
  if (await slots.nth(i).isDisabled()) continue;
  await slots.nth(i).click();
  await page.waitForTimeout(200);
  console.log('kartu', i, '-> targeting:', (await page.locator('.skill-card.is-targeting').count()) > 0);
  break;
}
await handShot('03-setelah-main');

// Target hero
await page.locator('[data-command="hero-skill"]').click().catch(() => {});
await page.waitForTimeout(200);
await handShot('04-target-hero');
await page.locator('[data-command="cancel-target"]').click().catch(() => {});
await page.waitForTimeout(200);
await handShot('05-setelah-batal');
await page.screenshot({ path: join(OUT, 'battle-full.png'), fullPage: true });

console.log('screenshot: ' + OUT);
await browser.close();

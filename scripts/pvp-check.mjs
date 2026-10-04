// Real WebRTC + production UI: two isolated browser contexts, no signaling server.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const OUT = join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', 'pvp-check');
mkdirSync(OUT, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH ?? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed += 1;
  console.log('PASS ' + name);
}

async function player() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem('crown-catalyst-dungeon-v1', JSON.stringify({
      coins: 30, selectedHero: 'arunika', clearedFloorIds: [],
      deckCardIds: ['ward', 'ration', 'pawnGuard', 'fortune', 'phase', 'focus', 'pawnMark', 'pawnStagger', 'pawnBreath', 'pawnPulse', 'phoenix'],
    }));
    window.__pvpWireState = null;
    const send = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (data) {
      const message = JSON.parse(data);
      if (message.type === 'state') window.__pvpWireState = message.snapshot;
      return send.call(this, data);
    };
    const listen = (channel) => channel.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'state') window.__pvpWireState = message.snapshot;
    });
    const createChannel = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function (...args) {
      const channel = createChannel.apply(this, args);
      listen(channel);
      return channel;
    };
    const NativePeer = RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
      constructor(...args) {
        super(...args);
        this.addEventListener('datachannel', (event) => listen(event.channel));
      }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  return page;
}

const square = (page, row, col) => page.locator(`[data-command="pvp-square"][data-row="${row}"][data-col="${col}"]`);
async function state(page) { return page.evaluate(() => window.__pvpWireState); }
async function sync(host, guest, predicate, args = null) {
  for (const page of [host, guest]) {
    await page.waitForFunction(predicate, args, { timeout: 15000 });
  }
  const [white, black] = await Promise.all([state(host), state(guest)]);
  assert.deepEqual(black, white, 'authoritative state stays synchronized');
}
async function move(page, host, guest, from, to, ply) {
  await square(page, ...from).click();
  await square(page, ...to).click();
  await sync(host, guest, (expected) => window.__pvpWireState?.ply === expected, ply);
}
async function layout(page, width, height, name) {
  await page.setViewportSize({ width, height });
  const metrics = await page.evaluate(() => {
    const board = document.querySelector('.board').getBoundingClientRect();
    const cells = Array.from(document.querySelectorAll('[data-command="pvp-square"]'));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      usable: cells.length === 64 && cells.every((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= board.left - 1 && rect.right <= board.right + 1;
      }),
      boardWidth: board.width,
    };
  });
  check(name + ' keeps all squares inside a readable board', !metrics.overflow && metrics.usable && metrics.boardWidth > 200);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: true });
}

try {
  const host = await player();
  const guest = await player();
  for (const page of [host, guest]) await page.getByRole('button', { name: '1vs1', exact: true }).click();
  await guest.locator('[data-command="pvp-hero"][data-hero-id="saka"]').click();
  await host.locator('[data-command="pvp-host"]').click();
  await host.waitForFunction(() => document.querySelector('#pvp-local-signal').value.includes('a=candidate'), null, { timeout: 20000 });
  const offer = await host.locator('#pvp-local-signal').inputValue();
  check('loadout is locked once negotiation begins', await host.locator('[data-command="pvp-join"]').isDisabled());
  check('host can enter answer after offer is ready', await host.locator('#pvp-remote-signal').isEnabled());
  await host.bringToFront();
  await host.locator('[data-command="pvp-copy-signal"]').click();
  const copied = await host.evaluate(() => navigator.clipboard.readText());
  const normalizeSdp = (signal) => signal.replace(/\r\n?/g, '\n').trim();
  check('generated offer can be copied from the active tab', normalizeSdp(copied) === normalizeSdp(offer));

  await guest.locator('[data-command="pvp-join"]').click();
  await guest.locator('[data-command="pvp-apply-signal"]').click();
  const blankFeedback = await guest.locator('.pvp-error').textContent();
  check('blank SDP shows recovery guidance', (blankFeedback ?? '').includes('Tempel kode SDP'));
  await guest.locator('#pvp-remote-signal').fill('not an SDP');
  await guest.locator('[data-command="pvp-apply-signal"]').click();
  await guest.waitForFunction((previous) => {
    const current = document.querySelector('.pvp-error')?.textContent;
    return Boolean(current && current !== previous);
  }, blankFeedback, { timeout: 5000 });
  check('bad SDP reports an actionable RTC error', await guest.locator('[data-command="pvp-leave"]').isEnabled() && await guest.locator('.pvp-error').textContent() !== blankFeedback);
  await guest.locator('#pvp-remote-signal').fill(offer.trim());
  await guest.locator('[data-command="pvp-apply-signal"]').click();
  await guest.waitForFunction(() => document.querySelector('#pvp-local-signal').value.includes('a=candidate'), null, { timeout: 20000 });
  const answer = await guest.locator('#pvp-local-signal').inputValue();
  await host.locator('#pvp-remote-signal').fill(answer.trim());
  await host.locator('[data-command="pvp-apply-signal"]').click();
  await Promise.all([host.locator('.pvp-duel-layout').waitFor({ timeout: 20000 }), guest.locator('.pvp-duel-layout').waitFor({ timeout: 20000 })]);
  await sync(host, guest, () => window.__pvpWireState?.ply === 0);
  check('trimmed SDP reaches the duel on both peers', (await host.locator('.turn-flag').textContent()).includes('Giliranmu') && (await guest.locator('.turn-flag').textContent()).includes('Giliran lawan'));
  check('guest hero selection reaches the authoritative loadout', (await state(host)).sides.b.heroId === 'saka');
  check('opponent cannot move out of turn', await square(guest, 1, 1).isDisabled());
  check('both sides expose the opponent hand without playable controls', await host.locator('.pvp-opponent-card').count() === 3 && await guest.locator('.pvp-opponent-hand button').count() === 0);

  await host.locator('[data-command="pvp-hero-skill"]').click();
  await host.keyboard.press('Escape');
  await sync(host, guest, () => window.__pvpWireState?.activeSkill === null);
  check('Escape cancels hero target without spending EN', (await state(host)).sides.w.energy === 4);
  await host.locator('[data-command="pvp-card"][data-slot="2"]').click();
  await host.locator('[data-command="pvp-cancel-target"]').click();
  await sync(host, guest, () => window.__pvpWireState?.activeSkill === null);
  check('cancelling free card preserves the free quota', !(await state(host)).sides.w.freeCardUsedThisTurn);

  await move(host, host, guest, [6, 0], [4, 0], 1);
  check('white completed move earns mana only for white', (await state(host)).sides.w.mana === 1 && (await state(host)).sides.b.mana === 0);
  await guest.locator('[data-command="pvp-undo"]').click();
  await sync(host, guest, () => window.__pvpWireState?.ply === 0);
  check('guest undo restores the last move and resources', (await state(host)).board[6][0]?.type === 'p' && (await state(host)).sides.w.mana === 0);
  await move(host, host, guest, [6, 0], [4, 0], 1);
  await move(guest, host, guest, [1, 1], [3, 1], 2);
  check('black also gains its own mana and hero pawn EN', (await state(host)).sides.b.mana === 1 && (await state(host)).sides.b.energy === 4);
  await host.locator('[data-command="pvp-card"][data-slot="1"]').click();
  await sync(host, guest, () => window.__pvpWireState?.sides.w.mana === 0);
  check('paid card spends mana, resolves EN, and replaces its slot', (await state(host)).sides.w.energy === 5 && (await state(host)).sides.w.hand[1] !== 'ration');
  await move(host, host, guest, [4, 0], [3, 1], 3);
  check('capture and graveyard synchronize', (await state(host)).captures.w === 1 && (await state(host)).sides.b.graveyard[0]?.type === 'p');
  await move(guest, host, guest, [1, 7], [2, 7], 4);
  await host.locator('[data-command="pvp-hero-ultimate"]').click();
  await host.locator('[data-command="pvp-cancel-target"]').click();
  await sync(host, guest, () => window.__pvpWireState?.activeSkill === null);
  check('ultimate cancellation leaves its five EN available', (await state(host)).sides.w.energy === 5);
  await move(host, host, guest, [3, 1], [2, 1], 5);
  await move(guest, host, guest, [2, 7], [3, 7], 6);
  await host.locator('[data-command="pvp-card"][data-slot="0"]').click();
  await sync(host, guest, () => window.__pvpWireState?.activeSkill === 'ward');
  const paidTargetMana = (await state(host)).sides.w.mana;
  await host.locator('[data-command="pvp-cancel-target"]').click();
  await sync(host, guest, () => window.__pvpWireState?.activeSkill === null);
  check('paid target cancellation refunds mana on both peers', (await state(host)).sides.w.mana === paidTargetMana + 2);
  await move(host, host, guest, [2, 1], [1, 1], 7);
  await move(guest, host, guest, [3, 7], [4, 7], 8);
  await square(host, 1, 1).click();
  await square(host, 0, 0).click();
  await host.locator('#pvp-promotion-dialog').waitFor();
  check('only the mover receives the modal promotion choice', await host.locator('#pvp-promotion-dialog').evaluate((dialog) => dialog.matches(':modal')) && await guest.locator('#pvp-promotion-dialog').count() === 0);
  await host.keyboard.press('Escape');
  check('Escape cannot discard a pending promotion', await host.locator('#pvp-promotion-dialog').isVisible());
  await host.locator('[data-command="pvp-promotion"][data-promotion="n"]').click();
  await sync(host, guest, () => window.__pvpWireState?.board[0][0]?.type === 'n' && window.__pvpWireState?.ply === 9);
  check('selected underpromotion synchronizes as a knight', (await state(guest)).board[0][0].color === 'w');

  await layout(host, 1440, 900, 'desktop-white');
  await layout(guest, 390, 844, 'phone-black');
  await layout(host, 320, 780, 'small-phone-white');
  await host.locator('[data-command="pvp-restart"]').click();
  await sync(host, guest, () => window.__pvpWireState?.ply === 0 && window.__pvpWireState?.board[6][0]?.type === 'p');
  check('restart resets both resources and retains both loadouts', (await state(host)).sides.w.mana === 0 && (await state(host)).sides.b.heroId === 'saka');
  await host.locator('[data-command="pvp-reroll"]').click();
  await sync(host, guest, () => window.__pvpWireState?.sides.w.rollsThisTurn === 1);
  check('first reroll does not spend EN', (await state(host)).sides.w.energy === 4);
  await move(host, host, guest, [6, 5], [5, 5], 1);
  await move(guest, host, guest, [1, 4], [3, 4], 2);
  await move(host, host, guest, [6, 6], [4, 6], 3);
  await move(guest, host, guest, [0, 3], [4, 7], 4);
  await sync(host, guest, () => window.__pvpWireState?.gameOver === true);
  check('checkmate enables terminal undo', await host.locator('[data-command="pvp-undo"]').isEnabled());
  await host.locator('[data-command="pvp-undo"]').click();
  await sync(host, guest, () => window.__pvpWireState?.ply === 3 && !window.__pvpWireState?.gameOver);
  check('terminal undo restores a playable position', (await state(host)).turn === 'b');
  await host.locator('[data-command="pvp-leave"]').click();
  await guest.locator('.pvp-page').waitFor();
  check('leaving exits the duel on the other peer', await guest.locator('.pvp-duel-layout').count() === 0);
  check('walkthrough has no browser errors', errors.length === 0);
  console.log(`PvP browser: ${passed} passed, 0 failed; screenshots: ${OUT}`);
} finally {
  await browser.close();
}

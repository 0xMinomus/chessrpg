import { chromium } from 'playwright-core';
import { join } from 'node:path';

const URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:4173/';
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
];
const EXPECTED = [
  ['arunika', '0px 0px'],
  ['bara', '50% 0px'],
  ['nila', '100% 0px'],
  ['saka', '0px 100%'],
  ['veyra', '50% 100%'],
  ['liora', '100% 100%'],
];
const executablePath =
  process.env.CHROMIUM_PATH ??
  join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const browser = await chromium.launch({ headless: true, executablePath });
let failures = 0;

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Hero', exact: true }).first().click();
    await page.waitForSelector('.hero-card-face');

    const result = await page.evaluate(async () => {
      const faces = Array.from(document.querySelectorAll('.hero-card-face'));
      const firstStyle = faces[0] ? getComputedStyle(faces[0]) : null;
      const assetUrl = firstStyle?.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      const image = new Image();
      if (assetUrl) {
        image.src = assetUrl;
        await image.decode();
      }
      return {
        cellSize: assetUrl ? [image.naturalWidth / 3, image.naturalHeight / 2] : null,
        faces: faces.map((face) => {
          const rect = face.getBoundingClientRect();
          const style = getComputedStyle(face);
          return {
            id: face.dataset.portrait,
            width: rect.width,
            height: rect.height,
            position: style.backgroundPosition,
          };
        }),
      };
    });

    const issues = [];
    if (result.faces.length !== EXPECTED.length) issues.push('expected 6 portrait faces, got ' + result.faces.length);
    if (!result.cellSize || Math.abs(result.cellSize[0] - result.cellSize[1]) > 1) {
      issues.push('portrait atlas cells are not square: ' + JSON.stringify(result.cellSize));
    }
    for (let index = 0; index < Math.min(result.faces.length, EXPECTED.length); index += 1) {
      const face = result.faces[index];
      const [id, position] = EXPECTED[index];
      if (face.id !== id) issues.push('portrait order mismatch at ' + index + ': ' + face.id);
      if (face.position !== position) issues.push(id + ' atlas position is ' + face.position + ', expected ' + position);
      if (Math.abs(face.width - face.height) > 1) {
        issues.push(id + ' portrait viewport is cropped: ' + Math.round(face.width) + 'x' + Math.round(face.height));
      }
    }

    if (issues.length) {
      failures += 1;
      console.error('FAIL ' + viewport.name + ': ' + issues.join('; '));
    } else {
      console.log('PASS ' + viewport.name + ': 6 complete atlas portraits');
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures) process.exitCode = 1;

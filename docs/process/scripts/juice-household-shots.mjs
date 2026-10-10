// Screenshots of the drawer's Juice block for each household (Just me / Couple / Family) at
// 1440 and 390 px, light and dark, plus a 360 px layout check. docs/process/juice-household.md.
//
//   NODE_PATH=<dir with playwright>/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node docs/process/scripts/juice-household-shots.mjs [outDir]
//
// Starts its own server (test/e2e/harness.js), opens a San Francisco role from the demo board,
// expands the Juice block and clicks each household. Prints the waterfall rows it saw.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium, startServer } from '../../../test/e2e/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'screenshots', 'juice-household'));
fs.mkdirSync(OUT, { recursive: true });

const pw = await loadPlaywright();
if (!pw) { console.error('playwright not found (set NODE_PATH)'); process.exit(2); }
const server = await startServer();
const browser = await pw.chromium.launch({ executablePath: findChromium() });
const problems = [];
try {
  for (const [width, height] of [[1440, 900], [390, 844], [360, 740]]) {
    for (const scheme of width === 360 ? ['light'] : ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push(`${width} ${scheme} pageerror: ${e.message}`));
      await page.goto(`${server.baseUrl}/#c=anthropic&sort=juice`, { waitUntil: 'networkidle' });
      await page.locator('#resultsList .card .juice-badge').first().waitFor({ timeout: 15000 });
      // Open the first card's role through the URL (phones keep the list in a bottom sheet).
      // Prefer the juiciest San Francisco-only role (the user's example); else the first card.
      const id = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#resultsList .card')];
        const sf = cards.find((c) => /, San Francisco, CA$/.test(c.getAttribute('aria-label') || '') && c.querySelector('.juice-badge'));
        return (sf || cards[0]).dataset.id;
      });
      const badge = () => page.evaluate((jobId) => document.querySelector(`#resultsList .card[data-id="${CSS.escape(jobId)}"] .juice-badge`)?.textContent || null, id);
      const badges = {};
      await page.evaluate((jobId) => { location.hash = `${location.hash.slice(1)}&job=${encodeURIComponent(jobId)}`; }, id);
      const block = page.locator('#drawer .d-juice');
      await block.waitFor({ timeout: 10000 });
      await block.locator('details.juice-details > summary').click();
      for (const label of ['Just me', 'Couple', 'Family']) {
        await block.locator('.juice-household').getByRole('button', { name: label }).click();
        await page.waitForFunction((l) => document.querySelector('#drawer .juice-household [aria-pressed="true"]')?.textContent === l, label, { timeout: 10000 });
        const sec = page.locator('#drawer .d-juice');
        await sec.scrollIntoViewIfNeeded();
        const rows = await sec.locator('.wf-row').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
        const head = (await sec.locator('details.juice-details > summary').innerText()).replace(/\s+/g, ' ').trim();
        const box = await sec.boundingBox();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) problems.push(`${width} ${scheme} ${label}: horizontal page scroll`);
        if (box && box.x + box.width > width + 1) problems.push(`${width} ${scheme} ${label}: Juice block wider than the viewport`);
        badges[label] = await badge();
        console.log(`${width} ${scheme} ${label}: ${head} | card badge ${badges[label]}\n  ${rows.join('\n  ')}`);
        if (width !== 360) await sec.screenshot({ path: path.join(OUT, `juice-${label.toLowerCase().replace(/\s+/g, '-')}-${width}-${scheme}.png`) });
      }
      // The choice persists (localStorage) and re-scores the cards behind the drawer.
      if (badges['Just me'] && badges['Just me'] === badges.Family) problems.push(`${width} ${scheme}: card badge did not change with the household (${badges.Family})`);
      const stored = await page.evaluate(() => localStorage.getItem('melon-seek.household.v1'));
      if (stored !== '"family"') problems.push(`${width} ${scheme}: household not persisted (${stored})`);
      await block.locator('.juice-household').getByRole('button', { name: 'Just me' }).click();
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no problems');
process.exit(problems.length ? 1 : 0);

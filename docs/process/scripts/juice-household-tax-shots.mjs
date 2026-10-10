// Drawer Juice block at 390 px for a Couple and a Family in San Francisco (household tax rules
// applied) and Madrid (taxed as a single filer: Spain's household rules are not modeled), to
// check the tax row's one-line household note. docs/process/juice-household.md.
//
//   NODE_PATH=<dir with playwright>/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node docs/process/scripts/juice-household-tax-shots.mjs [outDir]
//
// No snapshot board has a salaried Madrid role, so the Madrid case is a SCREENSHOT FIXTURE: the
// /api/jobs response is intercepted and one copy of a real role is added with a Madrid location
// and a €90,000 salary ("[fixture]" in its id). Juice is computed by the app as usual.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium, startServer } from '../../../test/e2e/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'screenshots', 'juice-household'));
fs.mkdirSync(OUT, { recursive: true });
const FIXTURE_ID = 'anthropic:[fixture]-madrid';

const pw = await loadPlaywright();
if (!pw) { console.error('playwright not found (set NODE_PATH)'); process.exit(2); }
const server = await startServer();
const browser = await pw.chromium.launch({ executablePath: findChromium() });
const problems = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', deviceScaleFactor: 1 });
  await ctx.route('**/api/jobs?*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const base = body.jobs.find((j) => j.salary && j.salary.currency === 'USD');
    if (base) {
      body.jobs.push({
        ...base, id: FIXTURE_ID, title: `${base.title} (Madrid fixture)`,
        locations: [{ name: 'Madrid, Spain', rawName: 'Madrid', city: 'Madrid', region: null, country: 'ES', remote: false, lat: 40.4168, lng: -3.7038 }],
        remote: false,
        salary: { ...base.salary, min: 80000, max: 100000, mid: 90000, currency: 'EUR' },
      });
    }
    await route.fulfill({ response: res, json: body });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${server.baseUrl}/#c=anthropic&sort=juice`, { waitUntil: 'networkidle' });
  await page.locator('#resultsList .card .juice-badge').first().waitFor({ timeout: 15000 });
  const sfId = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#resultsList .card')];
    return (cards.find((c) => /, San Francisco, CA$/.test(c.getAttribute('aria-label') || '') && c.querySelector('.juice-badge')) || cards[0]).dataset.id;
  });
  for (const [where, id] of [['sf', sfId], ['madrid', FIXTURE_ID]]) {
    await page.evaluate((jobId) => { location.hash = `c=anthropic&sort=juice&job=${encodeURIComponent(jobId)}`; }, id);
    const block = page.locator('#drawer .d-juice');
    await block.waitFor({ timeout: 10000 });
    const det = block.locator('details.juice-details');
    if (!(await det.evaluate((d) => d.open))) await det.locator(':scope > summary').click();
    for (const label of ['Couple', 'Family']) {
      await page.locator('#drawer .juice-household').getByRole('button', { name: label }).click();
      await page.waitForFunction((l) => document.querySelector('#drawer .juice-household [aria-pressed="true"]')?.textContent === l, label, { timeout: 10000 });
      const sec = page.locator('#drawer .d-juice');
      await sec.scrollIntoViewIfNeeded();
      const head = (await sec.locator('details.juice-details > summary').innerText()).replace(/\s+/g, ' ').trim();
      const tax = (await sec.locator('.wf--tax').innerText()).replace(/\s+/g, ' ').trim();
      const note = await sec.locator('.wf-tax-basis').count() ? await sec.locator('.wf-tax-basis').innerText() : null;
      console.log(`${where} ${label}: ${head}\n  ${tax}\n  note: ${note}`);
      if (where === 'madrid' && note !== 'Taxed as a single filer here (household rules not modeled)') problems.push(`madrid ${label}: note ${note}`);
      if (where === 'sf' && note) problems.push(`sf ${label}: unexpected note ${note}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) problems.push(`${where} ${label}: horizontal scroll`);
      await sec.screenshot({ path: path.join(OUT, `juice-tax-${label.toLowerCase()}-${where}-390.png`) });
    }
    await page.locator('#drawer .juice-household').getByRole('button', { name: 'Just me' }).click();
  }
  await ctx.close();
} finally {
  await browser.close();
  await server.stop();
}
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no problems');
process.exit(problems.length ? 1 : 0);

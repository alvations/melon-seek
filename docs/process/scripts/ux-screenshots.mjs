// UX screenshot + smoke script for melon-seek.
// Usage: PW_DIR=<dir with node_modules/playwright-core> BASE=http://localhost:5180 OUT=<dir> node ux-screenshots.mjs
// Uses the preinstalled Chromium under /opt/pw-browsers (never runs `playwright install`).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const PW_DIR = process.env.PW_DIR || process.cwd();
const require = createRequire(path.join(PW_DIR, 'noop.js'));
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:5180';
const QS = process.env.QS ?? '?mock=1';
const OUT = process.env.OUT || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];

const browser = await chromium.launch({ executablePath: exe });
const errors = [];
async function page(opts) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/tile|Failed to load resource/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await p.route(/tile\.openstreetmap|basemaps|cartocdn|arcgis/, (r) => r.abort());
  return p;
}
const ready = (p) => p.waitForSelector('.card[data-id]', { timeout: 15000 });
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });

// Desktop chart
let p = await page({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await p.goto(`${BASE}/${QS}#c=anthropic`);
await ready(p); await p.waitForTimeout(600);
await shot(p, 'desktop-chart');
// Quick filter popover
await p.click('[data-pop="salary"]'); await p.waitForTimeout(250);
await shot(p, 'desktop-popover-salary');
await p.keyboard.press('Escape');
// Keyword + dept filter via left column, then drawer
await p.click('.fsec .kw >> nth=0');
await p.waitForTimeout(250);
await p.click('.card[data-id] >> nth=0');
await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(400);
await shot(p, 'desktop-drawer');
const pwned = await p.evaluate(() => window.__pwned === true);
if (pwned) errors.push('SECURITY: description script executed');
const hash = await p.evaluate(() => location.hash);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
// Back/forward
await p.goBack(); await p.waitForTimeout(300);
const hashBack = await p.evaluate(() => location.hash);
// Map mode
await p.goto(`${BASE}/${QS}#c=anthropic&m=map`);
await ready(p); await p.waitForTimeout(1200);
await shot(p, 'desktop-map');
// Demo-mode company
await p.goto(`${BASE}/${QS}#c=openai`);
await ready(p); await p.waitForTimeout(600);
await shot(p, 'desktop-demo');
// Empty state
await p.goto(`${BASE}/${QS}#c=anthropic&q=zzzznotfound`);
await p.waitForSelector('.list-empty'); await p.waitForTimeout(400);
await shot(p, 'desktop-empty');
await p.close();

// Dark
p = await page({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await p.goto(`${BASE}/${QS}#c=anthropic&g=department`);
await ready(p); await p.waitForTimeout(600);
await shot(p, 'desktop-dark');
await p.click('.card[data-id] >> nth=2'); await p.waitForTimeout(400);
await shot(p, 'desktop-dark-drawer');
await p.close();

// Mobile
p = await page({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(`${BASE}/${QS}#c=anthropic`);
await ready(p); await p.waitForTimeout(600);
await shot(p, 'mobile-chart');
await p.click('#sheetHandle'); await p.waitForTimeout(400);
await shot(p, 'mobile-sheet');
await p.click('#sheetHandle'); await p.waitForTimeout(300);
await p.click('#filtersToggle'); await p.waitForTimeout(400);
await shot(p, 'mobile-filters');
await p.click('#filtersDone'); await p.waitForTimeout(300);
await p.click('.seg [data-mode="map"]'); await p.waitForTimeout(1000);
await shot(p, 'mobile-map');
await p.close();

// Behaviour checks (desktop)
const checks = {};
p = await page({ viewport: { width: 1440, height: 900 } });
for (const sort of ['salary-desc', 'salary-asc', 'newest', 'title']) {
  await p.goto(`${BASE}/${QS}#c=anthropic&sort=${sort}`);
  await ready(p);
  checks[`sort:${sort}`] = await p.evaluate(() => document.querySelectorAll('.card[data-id]').length > 0);
  await p.goto('about:blank');
}
// Jobs without salary must render (and sort last) — regression for nullsLast.
await p.goto(`${BASE}/${QS}#c=anthropic&sort=salary-asc`);
await ready(p);
checks.noSalaryCardsRender = await p.evaluate(async () => {
  while (document.querySelector('.list-more button')) { document.querySelector('.list-more button').click(); await new Promise((r) => setTimeout(r, 30)); }
  const pills = [...document.querySelectorAll('.card .sal-pill')];
  const none = pills.filter((x) => x.classList.contains('sal-pill--none')).length;
  const firstNone = pills.findIndex((x) => x.classList.contains('sal-pill--none'));
  return { total: pills.length, withoutSalary: none, noneAreLast: none === 0 || pills.slice(firstNone).every((x) => x.classList.contains('sal-pill--none')) };
});
// Deep link to a job: drawer opens with focus inside it, background inert.
const firstId = await p.getAttribute('.card[data-id]', 'data-id');
await p.goto('about:blank');
await p.goto(`${BASE}/${QS}#c=anthropic&job=${encodeURIComponent(firstId)}`);
await p.waitForSelector('.drawer.is-open');
await p.waitForTimeout(300);
checks.deepLinkFocus = await p.evaluate(() => document.getElementById('drawer').contains(document.activeElement));
checks.backgroundInert = await p.evaluate(() => document.getElementById('layout').inert === true);
await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab');
checks.focusTrapped = await p.evaluate(() => document.getElementById('drawer').contains(document.activeElement));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
checks.escClosesAndReturnsFocus = await p.evaluate(() => !document.querySelector('.drawer.is-open') && document.activeElement !== document.body);
checks.badge = (await p.textContent('#dataBadge'))?.trim().split('\n')[0];
checks.slashFocusesSearch = await (async () => { await p.keyboard.press('/'); return p.evaluate(() => document.activeElement.id === 'search'); })();
await p.close();

await browser.close();
console.log(JSON.stringify({ hashAfterDrawer: hash, hashAfterBack: hashBack, checks, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;

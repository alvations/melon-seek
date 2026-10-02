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
  p.on('console', (m) => { if (m.type() === 'error' && !/tile|Failed to load resource|from origin 'null'/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await p.route(/tile\.openstreetmap|basemaps|cartocdn|arcgis/, (r) => r.abort());
  return p;
}
const ready = (p) => p.waitForSelector('.card[data-id]', { timeout: 15000 });
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });

// Desktop chart
let p = await page({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await p.goto(`${BASE}/${QS}#c=anthropic`);
await ready(p); await p.waitForTimeout(600);
await shot(p, 'desktop-chart'); // default view: clusters, grouped by department
await p.goto(`${BASE}/${QS}#c=anthropic&v=ranges`);
await ready(p); await p.waitForTimeout(500);
await shot(p, 'desktop-ranges');
await p.click('#demoBanner summary').catch(() => {});
await p.waitForTimeout(200);
await shot(p, 'desktop-banner-open');
await p.goto(`${BASE}/${QS}#c=anthropic`);
await ready(p); await p.waitForTimeout(400);
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
// Insights mode
await p.goto(`${BASE}/${QS}#c=anthropic&m=insights`);
await ready(p); await p.waitForTimeout(700);
await shot(p, 'desktop-insights');
// Drawer for a posting without salary shows a Compstimate
await p.goto(`${BASE}/${QS}#c=anthropic&sort=salary-asc`);
await ready(p);
await p.evaluate(async () => { while (document.querySelector('.list-more button')) { document.querySelector('.list-more button').click(); await new Promise((r) => setTimeout(r, 30)); } });
const noPay = await p.$('.card:has(.sal-pill--none)');
if (noPay) { await noPay.click(); await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(400); await shot(p, 'desktop-drawer-compstimate'); await p.keyboard.press('Escape'); }
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

// Theme modes: System (OS dark, no attribute), Light forced over an OS-dark browser, Dark forced over OS-light.
for (const [mode, os, stored] of [['system', 'dark', null], ['light', 'dark', 'light'], ['dark', 'light', 'dark']]) {
  const tp = await page({ viewport: { width: 1440, height: 900 }, colorScheme: os });
  await tp.addInitScript((v) => { try { if (v) localStorage.setItem('melon-seek.theme', v); else localStorage.removeItem('melon-seek.theme'); } catch {} }, stored);
  await tp.goto(`${BASE}/${QS}#c=anthropic`);
  await ready(tp); await tp.waitForTimeout(500);
  await shot(tp, `theme-${mode}-chart`);
  await tp.click('.card[data-id] >> nth=1'); await tp.waitForSelector('.drawer.is-open'); await tp.waitForTimeout(350);
  await shot(tp, `theme-${mode}-drawer`);
  await tp.keyboard.press('Escape');
  await tp.click('.topbar .seg [data-mode="map"]'); await tp.waitForTimeout(1200);
  await shot(tp, `theme-${mode}-map`);
  await tp.close();
}
const mp = await page({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
await mp.addInitScript(() => { try { localStorage.setItem('melon-seek.theme', 'dark'); } catch {} });
await mp.goto(`${BASE}/${QS}#c=anthropic`);
await ready(mp); await mp.waitForTimeout(500);
await shot(mp, 'theme-dark-mobile');
await mp.close();

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
checks.insightsRenders = await (async () => { await p.goto(`${BASE}/${QS}#c=anthropic&m=insights`); await ready(p); await p.waitForTimeout(400); return p.evaluate(() => !document.getElementById('insightsHost').hidden && document.getElementById('insightsPanel').childElementCount > 0 && document.getElementById('compHost').childElementCount > 0); })();
checks.themeCycle = await (async () => {
  await p.goto(`${BASE}/${QS}#c=anthropic`); await ready(p);
  await p.evaluate(() => document.activeElement?.blur());
  const seq = [];
  for (let i = 0; i < 3; i++) { await p.keyboard.press('t'); seq.push(await p.evaluate(() => `${document.documentElement.getAttribute('data-theme') || 'system'}:${document.getElementById('themeBtn').getAttribute('aria-label')}`)); }
  return seq;
})();
checks.clusters = await (async () => {
  await p.goto(`${BASE}/${QS}#c=anthropic`); await ready(p); await p.waitForTimeout(400);
  // A bin holding one job opens the drawer (onSelect); use a numbered multi-job bin.
  const bin = await p.$('.ms-chart [data-r][data-i]:not([data-i="-1"]):has(.ms-bin__dot:not(:empty))');
  if (!bin) return 'no bins';
  await bin.click({ force: true }); await p.waitForTimeout(250);
  const chip = (await p.textContent('#areaChipTop'))?.trim();
  const listed = (await p.textContent('#resultsTitle'))?.trim();
  await p.click('#areaChipTop .area-x'); await p.waitForTimeout(250);
  const cleared = await p.evaluate(() => !document.querySelector('#areaChipTop .area-chip') && !document.querySelector('.ms-chart .is-selected'));
  await p.click('[data-view="ranges"]'); await p.waitForTimeout(200);
  const rangesHash = await p.evaluate(() => location.hash);
  await p.click('[data-view="clusters"]'); await p.waitForTimeout(200);
  const clustersHash = await p.evaluate(() => location.hash);
  return { chip, listed, cleared, rangesHash, clustersHash };
})();
checks.payUnclear = await (async () => {
  await p.goto(`${BASE}/${QS}#c=anthropic&sort=salary-asc`); await ready(p);
  await p.evaluate(async () => { while (document.querySelector('.list-more button')) { document.querySelector('.list-more button').click(); await new Promise((r) => setTimeout(r, 30)); } });
  const n = await p.evaluate(() => document.querySelectorAll('.sal-pill--unclear').length);
  if (!n) return { cards: 0 };
  await p.click('.card:has(.sal-pill--unclear) >> nth=0'); await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(300);
  await p.click('#drawer .d-unclear summary'); await p.waitForTimeout(150);
  await shot(p, 'desktop-drawer-pay-unclear');
  const r = await p.evaluate(() => ({ title: document.querySelector('#drawer .d-sal-unclear strong')?.textContent, reason: document.querySelector('#drawer .d-unclear p')?.textContent }));
  await p.keyboard.press('Escape');
  return { cards: n, ...r };
})();
checks.mapPinsInside = await (async () => {
  await p.goto('about:blank');
  await p.goto(`${BASE}/${QS}#c=anthropic&m=map`); await ready(p); await p.waitForTimeout(1500);
  return p.evaluate(() => {
    const hr = document.getElementById('mapHost').getBoundingClientRect();
    const pins = [...document.querySelectorAll('.ms-map .leaflet-marker-icon')].map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height || r.left);
    const out = pins.filter((r) => r.left < hr.left - 1 || r.right > hr.right + 1 || r.top < hr.top - 1 || r.bottom > hr.bottom + 1).length;
    return { pins: pins.length, outside: out };
  });
})();
checks.juice = await (async () => {
  await p.goto('about:blank');
  await p.goto(`${BASE}/${QS}#c=anthropic&sort=juice`); await ready(p); await p.waitForTimeout(300);
  const scored = await p.evaluate(() => document.querySelectorAll('.juice-badge').length);
  if (!scored) return { badges: 0 };
  const firstBadge = (await p.textContent('.card .juice-badge'))?.trim();
  await p.click('[data-pop="more"]'); await p.waitForTimeout(250);
  await shot(p, 'desktop-more-juice');
  await p.click('.popover .kw--juicy'); await p.waitForTimeout(250);
  const juicyOnly = await p.evaluate(() => [...document.querySelectorAll('.card')].every((c) => c.querySelector('.juice--juicy')));
  const hash = await p.evaluate(() => location.hash);
  await p.keyboard.press('Escape');
  await p.click('.card[data-id] >> nth=0'); await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#drawer .d-juice')?.scrollIntoView({ block: 'start' }));
  await p.evaluate(() => { const d = document.querySelector('#drawer .juice-compare'); if (d) d.open = true; });
  await shot(p, 'desktop-drawer-juice');
  await p.click('#drawer .d-juice .seg button >> text=Monthly'); await p.waitForTimeout(150);
  const monthly = (await p.textContent('#drawer .wf--net .wf-value'))?.trim();
  await shot(p, 'desktop-drawer-juice-monthly');
  await p.keyboard.press('Escape');
  return { badges: scored, firstBadge, juicyOnly, hash, monthly };
})();
checks.oneUp = await (async () => {
  const r = {};
  await p.goto('about:blank');
  await p.goto(`${BASE}/${QS}#c=anthropic`); await ready(p); await p.waitForTimeout(300);
  r.saveHiddenWithoutFilters = await p.evaluate(() => document.getElementById('saveSearch').hidden);
  r.cardAges = await p.evaluate(() => [...document.querySelectorAll('.card-age')].slice(0, 6).map((e) => e.textContent));
  r.noGhostWords = await p.evaluate(() => !/\b(ghost|fake)\b/i.test(document.body.innerText));
  // Drawer: fixed section order, budget, pay labels, caption, listing
  await p.click('.card[data-id] >> nth=0'); await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(700);
  r.drawerSections = await p.evaluate(() => [...document.querySelectorAll('#drawer .drawer-scroll > .d-fold')].filter((f) => !f.hidden).map((f) => `${f.querySelector('summary h3').textContent.trim()}${f.open ? '' : ' (collapsed)'}`));
  r.payLabels = await p.evaluate(() => [...document.querySelectorAll('#drawer .pay-label')].map((e) => e.textContent));
  r.caption = await p.evaluate(() => document.querySelector('#drawer .d-pay-caption')?.textContent || null);
  r.listing = await p.evaluate(() => [...document.querySelectorAll('#drawer .listing-lines li')].map((e) => e.textContent));
  await shot(p, 'desktop-drawer-1up');
  // Same role elsewhere -> switch company with filters through the hash; Back returns
  const row = await p.$('#drawer .d-comps:not([hidden]) .ms-comps__row:not(.is-current), #drawer .d-comps:not([hidden]) button');
  if (row) {
    await row.click(); await ready(p); await p.waitForTimeout(400);
    r.compsHash = await p.evaluate(() => location.hash);
    await p.goBack(); await ready(p); await p.waitForTimeout(400);
    r.compsBack = await p.evaluate(() => location.hash);
  } else r.compsHash = 'no comps section';
  await p.keyboard.press('Escape');
  // Save (F5): appears with a filter, saves, shows in the company menu
  await p.goto('about:blank');
  await p.goto(`${BASE}/${QS}#c=anthropic&s=Senior`); await ready(p); await p.waitForTimeout(300);
  r.saveVisibleWithFilter = await p.evaluate(() => !document.getElementById('saveSearch').hidden);
  await shot(p, 'desktop-chart-filtered-save');
  await p.click('#saveSearch'); await p.waitForTimeout(200);
  r.savePressed = await p.getAttribute('#saveSearch', 'aria-pressed');
  await p.click('#companyMenuBtn'); await p.waitForTimeout(250);
  r.savedInMenu = await p.evaluate(() => [...document.querySelectorAll('.saved-row .company-item-name')].map((e) => e.textContent));
  await shot(p, 'desktop-company-menu-saved');
  await p.keyboard.press('Escape');
  await p.click('#saveSearch'); // unsave, leave storage clean
  // CSV (F7) link in the data-badge popover
  await p.click('#dataBadge'); await p.waitForTimeout(200);
  r.csvHref = await p.evaluate(() => document.querySelector('.badge-csv a')?.getAttribute('href') || null);
  await p.keyboard.press('Escape');
  // Insights: Compare companies card
  await p.goto(`${BASE}/${QS}#c=anthropic&m=insights`); await ready(p); await p.waitForTimeout(800);
  r.compareCard = await p.evaluate(() => !document.getElementById('compsCardHost').hidden);
  await shot(p, 'desktop-insights-1up');
  return r;
})();
checks.slashFocusesSearch = await (async () => { await p.keyboard.press('/'); return p.evaluate(() => document.activeElement.id === 'search'); })();
// Description loads lazily (getJobDetail) and is sanitized.
await p.goto('about:blank');
await p.goto(`${BASE}/${QS}#c=anthropic`);
await ready(p);
await p.click('.card[data-id] >> nth=0');
await p.waitForFunction(() => document.querySelector('#drawer .desc') && !document.querySelector('#drawer .desc-skeleton'), null, { timeout: 8000 }).catch(() => {});
checks.descriptionLoaded = await p.evaluate(() => (document.querySelector('#drawer .desc')?.textContent || '').trim().length > 0 || !!document.querySelector('#drawer .desc a'));
checks.noScriptsInDescription = await p.evaluate(() => !document.querySelector('#drawer .desc script, #drawer .desc [onerror], #drawer .desc [onclick]') && window.__pwned !== true);
await p.keyboard.press('Escape');
// Scale: the biggest company (~900 jobs in mock). Time a filter toggle -> painted frame.
const big = QS.includes('mock') ? 'openai' : (process.env.BIG || 'openai');
await p.goto('about:blank');
const t0 = Date.now();
await p.goto(`${BASE}/${QS}#c=${big}`);
await ready(p);
checks.bigLoadMs = Date.now() - t0;
checks.bigJobs = await p.evaluate(() => document.querySelector('#statsLine')?.textContent.trim());
checks.bigFilterToggleMs = await p.evaluate(async () => {
  const kw = document.querySelector('.fsec .kw');
  const s = performance.now();
  kw.click();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return Math.round(performance.now() - s);
});
await p.close();

await browser.close();
console.log(JSON.stringify({ hashAfterDrawer: hash, hashAfterBack: hashBack, checks, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;

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

// ---------------------------------------------------------------------------
// Layout matrix (LAYOUT=0 skips it, LAYOUT_ONLY=1 runs only it). Views × drawer × filter
// column × viewports × themes, plus flows. Screenshots go to LAYOUT_OUT (default OUT/ux-layout).
// ---------------------------------------------------------------------------
const LAYOUT_OUT = process.env.LAYOUT_OUT || path.join(OUT, 'ux-layout');
const layout = { states: 0, failures: [] };
/** Geometry/stacking checks for the current page state; returns a list of problems. */
async function layoutProblems(pg, { view, drawer }) {
  return pg.evaluate(({ view, drawer }) => {
    const bad = [];
    const R = (el) => el && el.getBoundingClientRect();
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) bad.push(`horizontal scroll ${de.scrollWidth}>${de.clientWidth}`);
    // Top bar items must not overlap each other.
    const items = [...document.querySelectorAll('.topbar .brand, #companyMenuBtn, .search, .topbar .seg, #dataBadge, #themeBtn, #refreshBtn')]
      .filter((e) => e.offsetParent !== null && e.getClientRects().length).map((e) => [e.id || e.className.split(' ')[0], R(e)]);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [na, a] = items[i], [nb, b] = items[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(`topbar overlap ${na}/${nb}`);
    }
    const viz = R(document.getElementById('vizArea'));
    if (view === 'map') {
      const host = R(document.getElementById('mapHost')), lc = R(document.querySelector('#mapHost .leaflet-container'));
      if (!lc) bad.push('no leaflet container');
      else {
        if (Math.abs(lc.width - host.width) > 2 || Math.abs(lc.height - host.height) > 2) bad.push(`map not filling host ${lc.width|0}x${lc.height|0} vs ${host.width|0}x${host.height|0}`);
        if (host.width < viz.width - 4 || host.height < viz.height - 4) bad.push(`map host smaller than its area ${host.width|0}x${host.height|0} vs ${viz.width|0}x${viz.height|0}`);
        const pins = [...document.querySelectorAll('#mapHost .leaflet-marker-icon > *')].map(R).filter((r) => r.width);
        if (!pins.length) bad.push('no pins');
        // Leaflet's own size must match its container (stale size = gaps / misplaced pins).
        const lm = document.querySelector('#mapHost .leaflet-container');
        const pane = R(lm.querySelector('.leaflet-map-pane'));
        if (!pane) bad.push('no map pane');
      }
      if (!drawer) {
        for (const sel of ['.leaflet-control-zoom', '.leaflet-bottom.leaflet-left .leaflet-control', '.leaflet-top.leaflet-right .leaflet-control, .leaflet-bottom.leaflet-right .leaflet-control']) {
          const c = document.querySelector(`#mapHost ${sel}`);
          if (!c) continue;
          const r = R(c);
          if (r.left < host.left - 1 || r.right > host.right + 1 || r.top < host.top - 1 || r.bottom > host.bottom + 1) bad.push(`map control clipped: ${sel}`);
        }
      }
    }
    if (view !== 'insights' && view !== 'map') {
      const ch = R(document.getElementById('chartHost'));
      if (ch && (ch.height < 120 || ch.width < 200)) bad.push(`chart too small ${ch.width|0}x${ch.height|0}`);
    }
    if (drawer) {
      const d = document.getElementById('drawer'), dr = R(d);
      if (!d.contains(document.activeElement)) bad.push('focus not in drawer');
      // Nothing from the page (map panes/controls, chart) may paint over the drawer or the scrim.
      const probes = [[dr.left + 12, dr.top + 160], [dr.left + 40, dr.top + dr.height / 2], [dr.left + 12, dr.bottom - 40], [dr.left + dr.width / 2, dr.top + 220]];
      for (const [x, y] of probes) { const e = document.elementFromPoint(x, y); if (e && !d.contains(e)) bad.push(`covered drawer at ${x|0},${y|0} by ${e.className || e.tagName}`); }
      if (dr.left > 40) {
        const e = document.elementFromPoint(Math.max(5, dr.left / 2), viz.top + viz.height / 2);
        if (e && e.id !== 'drawerBackdrop') bad.push(`scrim not on top of page at left: ${e.className || e.tagName}`);
      }
    } else if (document.activeElement === document.body && document.querySelector('.drawer.is-open')) bad.push('drawer state');
    return bad;
  }, { view, drawer });
}
async function setFilters(pg, open) {
  await pg.evaluate((open) => {
    const t = document.getElementById('filtersToggle');
    const isOpen = t.getAttribute('aria-expanded') === 'true';
    if (isOpen !== open) t.click();
  }, open);
  await pg.waitForTimeout(320);
}
async function runLayoutMatrix() {
  fs.mkdirSync(LAYOUT_OUT, { recursive: true });
  const VIEWPORTS = (process.env.VIEWPORTS || '1920x1080,1440x900,1280x800,1024x768,768x1024,390x844').split(',').map((v) => v.split('x').map(Number));
  const VIEWS = [['clusters', ''], ['ranges', '&v=ranges'], ['map', '&m=map'], ['insights', '&m=insights']];
  for (const theme of ['light', 'dark']) for (const [w, hgt] of VIEWPORTS) {
    const pg = await page({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    // Seed recent companies so the top bar shows its widest state (recent pills).
    await pg.addInitScript((t) => { try { localStorage.setItem('melon-seek.theme', t); localStorage.setItem('melon-seek.recent.v1', JSON.stringify(['openai', 'anduril', 'xai', 'anthropic'])); } catch {} }, theme);
    for (const [view, q] of VIEWS) try {
      await pg.goto('about:blank');
      await pg.goto(`${BASE}/${QS}#c=anthropic${q}`); await ready(pg); await pg.waitForTimeout(view === 'map' ? 900 : 300);
      for (const filtersOpen of w >= 1200 ? [true, false] : [false, true]) {
        if (w < 861 && filtersOpen) continue; // phones: filters are a full-screen sheet (mobile workstream)
        await setFilters(pg, filtersOpen);
        if (filtersOpen && w < 1200) { await setFilters(pg, false); continue; } // overlay sheet: checked in flows
        for (const drawer of [false, true]) {
          if (drawer) { await pg.click('.card[data-id] >> nth=0', { force: true }); await pg.waitForSelector('.drawer.is-open'); await pg.waitForTimeout(350); }
          const tag = `${theme}-${w}x${hgt}-${view}-filters${filtersOpen ? 'Open' : 'Closed'}-drawer${drawer ? 'Open' : 'Closed'}`;
          const probs = await layoutProblems(pg, { view, drawer });
          layout.states++;
          if (probs.length) layout.failures.push({ tag, probs });
          if (view === 'map' || (view === 'clusters' && drawer)) await pg.screenshot({ path: path.join(LAYOUT_OUT, `${tag}.png`) });
          if (drawer) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); }
        }
      }
    } catch (e) { layout.failures.push({ tag: `${theme}-${w}x${hgt}-${view}`, probs: [`run error: ${String(e.message || e).split('\n')[0]}`] }); }
    await pg.close();
  }
  // Flows (1440x900 and 1024x768, light)
  for (const [w, hgt] of [[1440, 900], [1024, 768]]) {
    const pg = await page({ viewport: { width: w, height: hgt } });
    const flow = async (name, fn) => { try { const probs = await fn(); layout.states++; if (probs?.length) layout.failures.push({ tag: `flow-${w}-${name}`, probs }); } catch (e) { layout.failures.push({ tag: `flow-${w}-${name}`, probs: [String(e.message || e).split('\n')[0]] }); } };
    await pg.goto(`${BASE}/${QS}#c=anthropic&m=map`); await ready(pg); await pg.waitForTimeout(900);
    const mapSize = () => pg.evaluate(() => { const r = document.querySelector('#mapHost .leaflet-container').getBoundingClientRect(); return `${r.width|0}x${r.height|0}`; });
    const size0 = await mapSize();
    await flow('drawer-repeat', async () => {
      for (let i = 0; i < 5; i++) { await pg.click(`.card[data-id] >> nth=${i}`, { force: true }); await pg.waitForSelector('.drawer.is-open'); await pg.waitForTimeout(250); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250); }
      const s1 = await mapSize();
      return [...(s1 !== size0 ? [`map size drifted ${size0} -> ${s1}`] : []), ...(await layoutProblems(pg, { view: 'map', drawer: false }))];
    });
    await flow('next-prev', async () => {
      await pg.click('.card[data-id] >> nth=0', { force: true }); await pg.waitForSelector('.drawer.is-open'); await pg.waitForTimeout(250);
      const t0 = await pg.textContent('#drawerTitle');
      // V7: arrow/j/k shortcuts only fire from the drawer's scroll area, so use the buttons here.
      await pg.click('#drawerNext'); await pg.waitForTimeout(250);
      const t1 = await pg.textContent('#drawerTitle');
      await pg.click('#drawerPrev'); await pg.waitForTimeout(250);
      const t2 = await pg.textContent('#drawerTitle');
      const probs = await layoutProblems(pg, { view: 'map', drawer: true });
      if (t0 === t1 || t0 !== t2) probs.push(`next/prev titles ${t0} | ${t1} | ${t2}`);
      return probs;
    });
    await flow('resize-with-drawer', async () => {
      await pg.setViewportSize({ width: w - 200, height: hgt - 100 }); await pg.waitForTimeout(500);
      const probs = await layoutProblems(pg, { view: 'map', drawer: true });
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
      probs.push(...(await layoutProblems(pg, { view: 'map', drawer: false })));
      await pg.screenshot({ path: path.join(LAYOUT_OUT, `flow-${w}-resized-map.png`) });
      await pg.setViewportSize({ width: w, height: hgt }); await pg.waitForTimeout(500);
      probs.push(...(await layoutProblems(pg, { view: 'map', drawer: false })));
      return probs;
    });
    await flow('filters-toggle-map', async () => {
      const probs = [];
      for (const open of [w >= 1200 ? false : true, w >= 1200 ? true : false]) {
        await setFilters(pg, open);
        if (!(open && w < 1200)) probs.push(...(await layoutProblems(pg, { view: 'map', drawer: false })));
      }
      await setFilters(pg, w >= 1200);
      return probs;
    });
    await flow('switch-company-with-drawer', async () => {
      await pg.click('.card[data-id] >> nth=0', { force: true }); await pg.waitForSelector('.drawer.is-open'); await pg.waitForTimeout(200);
      await pg.evaluate(() => { location.hash = '#c=openai&m=map'; });
      await ready(pg); await pg.waitForTimeout(900);
      const probs = await layoutProblems(pg, { view: 'map', drawer: false });
      if (await pg.evaluate(() => !!document.querySelector('.drawer.is-open'))) probs.push('drawer stayed open after company switch');
      if (await pg.evaluate(() => document.getElementById('layout').inert)) probs.push('background still inert');
      return probs;
    });
    await flow('deep-link-job-map', async () => {
      const id = await pg.getAttribute('.card[data-id] >> nth=2', 'data-id');
      await pg.goto('about:blank');
      await pg.goto(`${BASE}/${QS}#c=openai&m=map&job=${encodeURIComponent(id)}`); await pg.waitForSelector('.drawer.is-open'); await pg.waitForTimeout(900);
      const probs = await layoutProblems(pg, { view: 'map', drawer: true });
      await pg.screenshot({ path: path.join(LAYOUT_OUT, `flow-${w}-deeplink-map-drawer.png`) });
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
      probs.push(...(await layoutProblems(pg, { view: 'map', drawer: false })));
      return probs;
    });
    await flow('back-forward', async () => {
      await pg.click('.topbar .seg [data-mode="chart"]'); await pg.waitForTimeout(400);
      await pg.click('.card[data-id] >> nth=0', { force: true }); await pg.waitForSelector('.drawer.is-open'); await pg.waitForTimeout(250);
      await pg.goBack(); await pg.waitForTimeout(400); // drawer closes
      const probs = [];
      if (await pg.evaluate(() => !!document.querySelector('.drawer.is-open'))) probs.push('Back did not close drawer');
      await pg.goBack(); await pg.waitForTimeout(900); // back to map
      if (!(await pg.evaluate(() => location.hash.includes('m=map')))) probs.push('Back did not return to map');
      else probs.push(...(await layoutProblems(pg, { view: 'map', drawer: false })));
      await pg.goForward(); await pg.waitForTimeout(500);
      if (!(await pg.evaluate(() => !location.hash.includes('m=map')))) probs.push('Forward did not return to chart');
      return probs;
    });
    await pg.close();
  }
  return layout;
}
if (process.env.LAYOUT !== '0') {
  await runLayoutMatrix();
  console.log(JSON.stringify({ layoutStates: layout.states, layoutFailures: layout.failures }, null, 2));
}
if (process.env.LAYOUT_ONLY === '1') {
  await browser.close();
  console.log(JSON.stringify({ errors }, null, 2));
  process.exit(errors.length || layout.failures.length ? 1 : 0);
}

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
  await p.evaluate(() => { for (const d of document.querySelectorAll('#drawer .juice-details, #drawer .juice-compare')) d.open = true; });
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
  r.savePressed = await p.evaluate(() => document.getElementById('saveSearch').classList.contains('is-saved') && document.getElementById('saveSearch').textContent.trim() === 'Saved');
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
checks.qaFinal = await (async () => {
  await p.goto('about:blank');
  await p.goto(`${BASE}/${QS}#c=anthropic`); await ready(p); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const sec = [...document.querySelectorAll('#filterBody .fsec')].find((d) => d.querySelector('.fsec-title')?.textContent === 'Listed');
    const any = !!sec?.querySelector('.radio-list:not([hidden])');
    const note = [...(sec?.querySelectorAll('.fnote') || [])].find((n) => !n.hidden)?.textContent || null;
    const tip = document.getElementById('dataBadge').title;
    return { listedOptionsShown: any, listedNote: note, badgeTip: tip, doubledPrefix: /live fetch failed:.*live fetch failed/i.test(tip) };
  });
  await p.click('#dataBadge'); await p.waitForTimeout(200);
  r.csvDownloadAttr = await p.evaluate(() => document.querySelector('.badge-csv a')?.getAttribute('download') ?? null);
  await p.keyboard.press('Escape');
  const mp2 = await page({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mp2.goto(`${BASE}/${QS}#c=anthropic`); await ready(mp2); await mp2.waitForTimeout(300);
  r.mobileBadgeLabel = await mp2.evaluate(() => getComputedStyle(document.querySelector('#dataBadge .badge-label'), '::before').content);
  r.mobileTopbarRows = await mp2.evaluate(() => { const ys = ['#companyMenuBtn', '#dataBadge', '#search', '#themeBtn'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)); return ys; });
  await shot(mp2, 'mobile-topbar-badge');
  await mp2.close();
  return r;
})();
checks.wave2 = await (async () => {
  const r = {};
  await p.goto('about:blank');
  await p.goto(`${BASE}/${QS}#c=anthropic`); await ready(p); await p.waitForTimeout(400);
  // UX-1: "Highest pay" by midpoint (USD-only cards, first 12)
  r.sortByMid = await p.evaluate(() => {
    const k = (t) => { const m = t.match(/^\$(\d+(?:\.\d)?)([KM])(?:–(\d+(?:\.\d)?)([KM]))?$/); if (!m) return null; const v = (n, u) => Number(n) * (u === 'M' ? 1e6 : 1e3); const lo = v(m[1], m[2]); const hi = m[3] ? v(m[3], m[4]) : lo; return (lo + hi) / 2; };
    const mids = [...document.querySelectorAll('.card .sal-pill')].slice(0, 12).map((e) => k(e.textContent.trim())).filter((x) => x != null);
    return mids.every((m, i) => i === 0 || m <= mids[i - 1] * 1.02);
  });
  // A11Y-3: one visually hidden h1 and two skip links
  r.h1 = await p.evaluate(() => [...document.querySelectorAll('h1')].map((e) => e.textContent));
  r.skipLinks = await p.evaluate(() => document.querySelectorAll('.skip-link').length);
  // A11Y-2: Seniority popover focuses its first visible control
  await p.click('[data-pop="sen"]'); await p.waitForTimeout(250);
  r.seniorityFocusInPopover = await p.evaluate(() => document.getElementById('popover').contains(document.activeElement));
  await p.keyboard.press('Escape');
  // V7: single-key shortcut ignored while a button has focus
  const theme0 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await p.focus('#filtersToggle'); await p.keyboard.press('t'); await p.waitForTimeout(100);
  r.shortcutIgnoredOnButton = (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === theme0;
  // V6: company menu has no listbox / option roles
  await p.click('#companyMenuBtn'); await p.waitForTimeout(200);
  r.menuRoles = await p.evaluate(() => document.querySelectorAll('#popover [role="listbox"], #popover [role="option"]').length);
  await p.keyboard.press('Escape');
  // UX-2: title matches first, with "N in title"
  await p.goto(`${BASE}/${QS}#c=anthropic&q=machine%20learning`); await ready(p); await p.waitForTimeout(300);
  r.searchTitle = (await p.textContent('#resultsTitle'))?.trim();
  r.firstCardTitleMatches = await p.evaluate(() => /machine/i.test(document.querySelector('.card .card-title')?.textContent || '') && /learning/i.test(document.querySelector('.card .card-title')?.textContent || ''));
  // Drawer: comps directly under the pay block; Juice headline collapsed; V5 toggle keeps focus
  await p.goto(`${BASE}/${QS}#c=anthropic`); await ready(p);
  await p.click('.card[data-id] >> nth=0'); await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(800);
  r.drawerOrder = await p.evaluate(() => [...document.querySelectorAll('#drawer .drawer-scroll > *')].map((e) => e.className.split(' ').find((c) => /^d-(salary|comps|juice|listing|locs|kw|about|desc)$/.test(c))).filter(Boolean));
  if (await p.$('#drawer .juice-details')) {
    await p.click('#drawer .juice-details > summary'); await p.waitForTimeout(150);
    await p.click('#drawer .juice-body [data-period="month"]'); await p.waitForTimeout(100);
    r.juiceToggleKeepsFocus = await p.evaluate(() => document.activeElement?.dataset?.period === 'month');
    r.taxBreakdownVisible = await p.evaluate(() => !!document.querySelector('#drawer .wf--tax .wf-detail')?.offsetParent);
    await shot(p, 'desktop-drawer-wave2');
  }
  await p.keyboard.press('Escape');
  // UX-4: carry location/search to the target company (or toast why not)
  await p.goto(`${BASE}/${QS}#c=anthropic&l=San%20Francisco`); await ready(p);
  await p.click('.card[data-id] >> nth=0'); await p.waitForSelector('.drawer.is-open'); await p.waitForTimeout(900);
  const row = await p.$('#drawer .d-comps:not([hidden]) .ms-comps__row:not(.is-current)');
  if (row) { await row.click(); await ready(p); await p.waitForTimeout(500); r.carryHash = await p.evaluate(() => location.hash); r.carryToast = await p.evaluate(() => document.getElementById('toast').hidden ? null : document.getElementById('toast').textContent); }
  // UX-11: role chip shows once on desktop
  r.roleChipCount = await p.evaluate(() => [...document.querySelectorAll('.area-chip')].filter((e) => e.getClientRects().length).length);
  // V14: a custom board can't borrow a built-in company's name
  await p.goto(`${BASE}/${QS}#c=greenhouse:examplecorp&cn=Anthropic`); await p.waitForTimeout(1500);
  r.customName = await p.evaluate(() => document.querySelector('#companyMenuBtn .company-name')?.textContent);
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
process.exitCode = errors.length || layout.failures.length ? 1 : 0;

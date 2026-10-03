// Replayable checks for the mobile QA fixes (docs/process/fix-frontend.md).
// Usage: start the server (PORT=8791 node server/index.js), then
//   NODE_PATH=<dir with playwright> node docs/process/scripts/fix-frontend-check.mjs [baseUrl]
// Phone emulation matches test/e2e/mobile-qa.e2e.js (iPhone UA, isMobile, hasTouch, DPR 3).
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(path.join(process.env.NODE_PATH || process.cwd(), 'x.js'));
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const SHOTS = path.resolve('docs/screenshots/fix-frontend');
mkdirSync(SHOTS, { recursive: true });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function phone({ hash = 'c=anthropic', viewport = { width: 390, height: 844 }, insets = null } = {}) {
  const context = await browser.newContext({ viewport, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await context.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith('data:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  if (insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  await page.goto(`${BASE}/#${hash}`);
  await page.waitForSelector('#resultsList .card[data-id]', { timeout: 30000 });
  await sleep(800);
  return { context, page, cdp, errors };
}
async function tap(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(450);
}
const chip = async (page, id) => { await page.evaluate((id) => document.querySelector(`#quickChips [data-pop=${id}]`).scrollIntoView({ inline: 'center' }), id); await sleep(200); await tap(page, `#quickChips [data-pop=${id}]`); };
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; });

/** Every point within ±r of the centre (on each axis) that hits `sel` or its descendants. */
async function hitArea(page, sel, idx = 0) {
  return page.evaluate(([sel, idx]) => {
    const el = document.querySelectorAll(sel)[idx];
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const hits = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    // Contiguous extent in each direction from the centre (slop may be asymmetric, e.g. stacked zoom buttons).
    const reach = (dx, dy) => { let d = 0; while (d < 60 && hits(cx + dx * (d + 1), cy + dy * (d + 1))) d++; return d; };
    const w = reach(-1, 0) + reach(1, 0) + 1, h = reach(0, -1) + reach(0, 1) + 1;
    const below = document.elementFromPoint(cx, cy + Math.min(20, reach(0, 1) + 1));
    return { w, h, visual: [Math.round(b.width), Math.round(b.height)], edge: below ? `${below.tagName}.${below.className}` : null };
  }, [sel, idx]);
}

/** Visible text under 12px (rendered font size). */
async function smallText(page) {
  return page.evaluate(() => {
    const out = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('[hidden], .sr-only, [inert]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < 12) out.set(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, fs);
    }
    return [...out.entries()].map(([k, v]) => `${k} ${v}px`);
  });
}

// ---------------------------------------------------------------- M-7, M-11, M-15, M-4
{
  const { context, page } = await phone();
  await tap(page, '#filtersToggle');
  await sleep(200);
  const m = await page.evaluate(() => ({ role: filters.getAttribute('role'), modal: filters.getAttribute('aria-modal'), label: filters.getAttribute('aria-label'),
    inert: ['.topbar', '.quickbar', '#main', '#results'].map((s) => document.querySelector(s).inert) }));
  check('M-7 dialog semantics', m.role === 'dialog' && m.modal === 'true' && m.label === 'Filters', JSON.stringify(m));
  check('M-7 background inert', m.inert.every(Boolean), JSON.stringify(m.inert));
  const trail = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); trail.push(await page.evaluate(() => filters.contains(document.activeElement))); }
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); trail.push(await page.evaluate(() => filters.contains(document.activeElement))); }
  check('M-7 focus trapped', trail.every(Boolean), trail.join(','));
  await tap(page, '#filtersClose');
  const after = await page.evaluate(() => ({ role: filters.getAttribute('role'), inert: document.querySelector('.topbar').inert }));
  check('M-7 cleared on close', after.role === null && after.inert === false, JSON.stringify(after));
  check('M-4 focus after ✕', (await active(page)) === 'filtersToggle', await active(page));

  await chip(page, 'dept');
  await sleep(300);
  const f = await page.evaluate(() => document.activeElement?.closest('.fsec')?.querySelector('.fsec-title')?.textContent);
  check('M-11 chip focuses its section', f === 'Department', String(f));
  const ex = await page.evaluate(() => { const b = document.querySelector('#quickChips [data-pop=dept]'); return [b.getAttribute('aria-expanded'), b.getAttribute('aria-controls')]; });
  check('M-15 chip aria-expanded/controls while open', ex[0] === 'true' && ex[1] === 'filters', ex.join(','));
  await tap(page, '#filtersDone');
  const ex2 = await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').getAttribute('aria-expanded'));
  check('M-15 chip collapsed after close', ex2 === 'false', ex2);
  check('M-4 focus after "Show N roles" returns to the chip', (await page.evaluate(() => document.activeElement?.dataset?.pop)) === 'dept', await active(page));
  await context.close();
}

// ---------------------------------------------------------------- M-3 variants
{
  const { context, page } = await phone();
  const start = await page.evaluate(() => [history.length, location.hash]);
  // Back as the first action with the company menu open: closes it, stays on the site.
  await tap(page, '#companyMenuBtn');
  await page.goBack(); await sleep(600);
  const s1 = await page.evaluate(() => ({ open: !document.querySelector('#popover').hidden, url: location.href, hash: location.hash }));
  check('M-3 Back closes the company menu, stays on site', !s1.open && s1.url.startsWith(BASE) && s1.hash === start[1], JSON.stringify(s1));
  // More: a filter inside, then Back keeps it.
  await chip(page, 'more');
  await page.locator('#popover .pop-body button.kw').first().tap(); await sleep(500);
  const h1 = await page.evaluate(() => location.hash);
  await page.goBack(); await sleep(600);
  const s2 = await page.evaluate(() => ({ open: !document.querySelector('#popover').hidden, hash: location.hash }));
  check('M-3 Back closes More, keeps its filter', !s2.open && s2.hash === h1 && h1 !== start[1], `${h1} -> ${JSON.stringify(s2)}`);
  // Filter sheet: two filters, close with ✕; then one Back undoes the whole sheet visit.
  await chip(page, 'dept');
  const rows = page.locator('#filters .fsec').nth(1).locator('label.check');
  await rows.nth(0).tap(); await sleep(300); await rows.nth(1).tap(); await sleep(400);
  const h2 = await page.evaluate(() => location.hash);
  await tap(page, '#filtersClose'); await sleep(400);
  const h3 = await page.evaluate(() => location.hash);
  check('M-3 ✕ keeps the filters', h3 === h2, `${h2} vs ${h3}`);
  await page.goBack(); await sleep(600);
  const h4 = await page.evaluate(() => location.hash);
  check('M-3 one Back after closing undoes the sheet visit as one step', h4 === h1, `${h4} (expected ${h1})`);
  await context.close();
}

// ---------------------------------------------------------------- M-9, M-16
{
  const { context, page } = await phone();
  await tap(page, '#sheetHandle');
  const h0 = await page.evaluate(() => history.length);
  const id = await page.locator('#resultsList .card[data-id]').first().getAttribute('data-id');
  await tap(page, '#resultsList .card[data-id]');
  await page.waitForSelector('#drawer.is-open');
  await tap(page, '#drawerNext'); await tap(page, '#drawerNext'); await tap(page, '#drawerPrev');
  const h1 = await page.evaluate(() => [history.length, document.querySelector('#drawerPos').textContent]);
  check('M-9 paging adds no history entries', h1[0] === h0 + 1, `history ${h0} -> ${h1[0]} (${h1[1]})`);
  await page.goBack(); await sleep(700);
  const s = await page.evaluate(() => ({ open: document.querySelector('#drawer').classList.contains('is-open'), job: /job=/.test(location.hash), focus: document.activeElement?.dataset?.id || document.activeElement?.tagName }));
  check('M-9 one Back leaves the job page', !s.open && !s.job, JSON.stringify(s));
  // M-16: Back from the first card's page puts focus back on that card.
  await tap(page, `#resultsList .card[data-id="${id}"]`);
  await page.waitForSelector('#drawer.is-open');
  await page.goBack(); await sleep(700);
  const f = await page.evaluate(() => document.activeElement?.dataset?.id || document.activeElement?.tagName);
  check('M-16 focus on the opening card after hardware Back', f === id, `${f} (expected ${id})`);
  await context.close();
}

// ---------------------------------------------------------------- M-18, M-12
{
  const { context, page } = await phone();
  await page.evaluate(() => {
    const vv = window.visualViewport;
    const real = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height').get;
    Object.defineProperty(vv, 'height', { configurable: true, get() { return document.activeElement?.matches('input, textarea, select') ? innerHeight - 336 : real.call(vv); } });
    document.addEventListener('focusin', () => setTimeout(() => vv.dispatchEvent(new Event('resize')), 30));
    document.addEventListener('focusout', () => setTimeout(() => vv.dispatchEvent(new Event('resize')), 30));
  });
  await tap(page, '#search');
  await page.keyboard.type('python', { delay: 30 });
  await sleep(900);
  const g = await page.evaluate(() => ({ title: document.querySelector('#resultsTitle').getBoundingClientRect().bottom, vvh: visualViewport.height, text: document.querySelector('#resultsTitle').textContent, kb: document.body.className }));
  await page.screenshot({ path: path.join(SHOTS, 'kb-search-390.png') });
  check('M-12 count visible above the keyboard', g.title <= g.vvh && /roles?/.test(g.text), JSON.stringify(g));
  await page.fill('#search', 'zzzzqqq'); await sleep(700);
  const t = await page.textContent('#resultsTitle');
  check('M-18 empty search copy', t.trim() === '0 roles', JSON.stringify(t));
  await page.evaluate(() => document.activeElement.blur()); await sleep(300);
  const back = await page.evaluate(() => document.body.classList.contains('kb-search'));
  check('M-12 sheet returns to peek when the keyboard closes', !back, String(back));
  await context.close();
}

// ---------------------------------------------------------------- M-14, M-8 CSV link
{
  const { context, page } = await phone({ hash: 'c=anduril' });
  await tap(page, '#dataBadge');
  await sleep(300);
  const b = await page.evaluate(() => ({ pre: !!document.querySelector('#popover .badge-error'), text: document.querySelector('#popover .badge-details > p')?.textContent }));
  check('M-14 badge error shown once', !b.pre, JSON.stringify(b));
  const csv = await hitArea(page, '#popover .badge-csv a');
  check('M-8 CSV link hit area >= 44px tall', csv && csv.h >= 43, JSON.stringify(csv));
  await page.screenshot({ path: path.join(SHOTS, 'badge-popover-390.png') });
  check('M-13 badge popover text >= 12px', !(await smallText(page)).length, (await smallText(page)).join('; ') || 'none');
  await context.close();
}

// ---------------------------------------------------------------- M-8 chart, M-17, M-13 chart
{
  const { context, page } = await phone();
  await page.waitForSelector('#chartHost .ms-bin');
  const bins = await page.$$eval('#chartHost .ms-bin', (b) => b.length);
  const worst = [];
  for (let i = 0; i < Math.min(bins, 12); i++) { const a = await hitArea(page, '#chartHost .ms-bin', i); if (a) worst.push(a.h); }
  check('M-8 cluster bins 44px tall hit area', worst.length && Math.min(...worst) >= 43, `heights ${worst.join(',')}`);
  check('M-13 chart text >= 12px', !(await smallText(page)).length, (await smallText(page)).join('; ') || 'none');
  await page.screenshot({ path: path.join(SHOTS, 'chart-clusters-390.png') });
  await tap(page, '[data-view="ranges"]');
  await page.waitForSelector('#chartHost .ms-row');
  await sleep(500);
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#chartHost .ms-row')].filter((x) => x.getBoundingClientRect().height);
    const labs = rows.map((x) => x.querySelector('.ms-row__label'));
    return { h: Math.round(rows[0].getBoundingClientRect().height), n: rows.length,
      cut: labs.filter((l) => l.scrollWidth > l.clientWidth + 1).length, w: Math.round(labs[0].clientWidth), sample: labs.slice(0, 4).map((l) => l.textContent) };
  });
  check('M-8 Ranges rows 44px', r.h >= 44, JSON.stringify(r));
  check('M-17 Ranges titles mostly uncut', r.cut <= r.n * 0.2 && r.w > 300, JSON.stringify(r));
  await page.screenshot({ path: path.join(SHOTS, 'chart-ranges-390.png') });
  await context.close();
}

// ---------------------------------------------------------------- M-8 map, M-13 map
{
  const { context, page } = await phone({ hash: 'c=anthropic&m=map' });
  await page.waitForSelector('#mapHost .ms-pin', { timeout: 20000 });
  await sleep(800);
  for (const [name, sel] of [['zoom in', '.leaflet-control-zoom-in'], ['zoom out', '.leaflet-control-zoom-out'], ['Pay', '.ms-modes__btn'], ['Remote', '.ms-remote']]) {
    const a = await hitArea(page, `#mapHost ${sel}`);
    check(`M-8 map ${name} hit area`, a && a.h >= 43 && a.w >= 43, JSON.stringify(a));
  }
  check('M-13 map text >= 12px', !(await smallText(page)).length, (await smallText(page)).join('; ') || 'none');
  await page.screenshot({ path: path.join(SHOTS, 'map-390.png') });
  await context.close();
}

// ---------------------------------------------------------------- M-8 comps + Insights, M-13 drawer/insights
{
  const { context, page } = await phone();
  await tap(page, '#sheetHandle');
  await tap(page, '#resultsList .card[data-id]');
  await page.waitForSelector('#drawer.is-open');
  await sleep(1500);
  const comps = await page.$$eval('#drawer .ms-comps__row', (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)));
  check('M-8 "Same role elsewhere" rows 44px', comps.length && Math.min(...comps) >= 44, comps.join(',') || 'no rows');
  // Scroll through the drawer and collect small text.
  const small = new Set();
  for (let i = 0; i < 12; i++) {
    for (const s of await smallText(page)) small.add(s);
    await page.evaluate(() => document.querySelector('#drawer .drawer-scroll').scrollBy(0, 500)); await sleep(150);
  }
  const juice = page.locator('#drawer .d-juice summary, #drawer .juice-compare > summary').first();
  if (await juice.count()) { await juice.tap().catch(() => {}); await sleep(300); for (const s of await smallText(page)) small.add(s); }
  check('M-13 drawer text >= 12px', !small.size, [...small].join('; ') || 'none');
  await page.screenshot({ path: path.join(SHOTS, 'drawer-390.png') });
  await context.close();
}
{
  const { context, page } = await phone({ hash: 'c=anthropic&m=insights' });
  await page.waitForSelector('#compHost .ms-comp__input', { timeout: 20000 });
  await sleep(800);
  const hs = await page.$$eval('#insightsHost .ms-comp__input, #insightsHost .ms-comp__select', (e) => e.filter((x) => x.getClientRects().length).map((x) => Math.round(x.getBoundingClientRect().height)));
  check('M-8 Insights fields 44px', hs.length && Math.min(...hs) >= 44, hs.join(','));
  const small = new Set();
  for (let i = 0; i < 10; i++) {
    for (const s of await smallText(page)) small.add(s);
    await page.evaluate(() => document.querySelector('#insightsHost').scrollBy(0, 500)); await sleep(150);
  }
  check('M-13 Insights text >= 12px', !small.size, [...small].join('; ') || 'none');
  await context.close();
}

// ---------------------------------------------------------------- M-10, M-1 (landscape with a notch)
{
  const insets = { top: 0, left: 47, right: 47, bottom: 21 };
  const { context, page } = await phone({ viewport: { width: 844, height: 390 }, insets });
  await page.waitForSelector('#chartHost .ms-crow');
  await sleep(500);
  const c = await page.evaluate(() => ({
    swatch: Math.round(document.querySelector('#chartHost .ms-crow__swatch').getBoundingClientRect().left),
    cap: Math.round((document.querySelector('#chartHost .ms-axis__cap') || document.querySelector('#chartHost .ms-crow__name')).getBoundingClientRect().left),
    right: Math.round(document.querySelector('#chartHost').getBoundingClientRect().right),
  }));
  check('M-10 chart inside the safe area', c.swatch >= 47 && c.cap >= 47 && c.right <= 844 - 47, JSON.stringify(c));
  await page.screenshot({ path: path.join(SHOTS, 'safearea-land-chart.png') });
  await page.evaluate(() => document.querySelector('[data-mode="map"]').click());
  await page.waitForSelector('#mapHost .ms-pin', { timeout: 20000 });
  await sleep(1200);
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    return { zoomL: Math.round(r('#mapHost .leaflet-control-zoom').left), remoteL: Math.round(r('#mapHost .ms-remote')?.left ?? 99),
      modesR: Math.round(r('#mapHost .ms-modes').right), attribR: Math.round(r('#mapHost .leaflet-control-attribution')?.right ?? 0),
      sheetTop: Math.round(r('#results').top), pins: [...document.querySelectorAll('#mapHost .ms-pin')].map((p) => Math.round(p.getBoundingClientRect().bottom)),
      remoteB: Math.round(r('#mapHost .ms-remote')?.bottom ?? 0) };
  });
  check('M-10 map controls inside the safe area', m.zoomL >= 47 && m.remoteL >= 47 && m.modesR <= 797 && m.attribR <= 797, JSON.stringify(m));
  check('M-1 pins and Remote above the sheet', m.pins.every((b) => b <= m.sheetTop) && m.remoteB <= m.sheetTop, JSON.stringify(m));
  await page.screenshot({ path: path.join(SHOTS, 'safearea-land-map.png') });
  await context.close();
}

// ---------------------------------------------------------------- desktop 1440x900 regression
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith('data:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/#c=anthropic`);
  await page.waitForSelector('#resultsList .card[data-id]');
  await sleep(800);
  const d = await page.evaluate(() => ({ role: filters.getAttribute('role'), inert: document.querySelector('.topbar').inert, filtersW: Math.round(filters.getBoundingClientRect().width),
    rowLabelW: null, chips: [...document.querySelectorAll('#quickChips [data-pop]')].map((b) => b.getAttribute('aria-controls')) }));
  check('desktop: filters column is not a dialog, nothing inert', d.role === null && !d.inert && d.filtersW > 200, JSON.stringify(d));
  const h0 = await page.evaluate(() => history.length);
  await page.click('#quickChips [data-pop=dept]'); await sleep(300);
  await page.locator('#popover label.check').first().click(); await sleep(300);
  const h1 = await page.evaluate(() => [history.length, location.hash]);
  await page.keyboard.press('Escape'); await sleep(200);
  check('desktop: popover filters push history as before (no overlay entry)', h1[0] === h0 + 1, `${h0} -> ${h1[0]} ${h1[1]}`);
  await page.goBack(); await sleep(500);
  check('desktop: Back undoes the filter as before', (await page.evaluate(() => location.hash)) === '#c=anthropic', await page.evaluate(() => location.hash));
  await page.click('[data-view="ranges"]'); await sleep(600);
  const rr = await page.evaluate(() => { const r = document.querySelector('#chartHost .ms-row'); return { h: Math.round(r.getBoundingClientRect().height), stack: document.querySelector('#chartHost').classList.contains('ms-chart--stack'), labW: Math.round(r.querySelector('.ms-row__label').getBoundingClientRect().width) }; });
  check('desktop: Ranges rows unchanged (22px, side labels)', rr.h === 22 && !rr.stack && rr.labW >= 140, JSON.stringify(rr));
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-ranges.png') });
  await page.click('[data-view="clusters"]'); await sleep(400);
  await page.locator('#resultsList .card[data-id]').first().click();
  await page.waitForSelector('#drawer.is-open'); await sleep(1000);
  const h2 = await page.evaluate(() => history.length);
  await page.click('#drawerNext'); await sleep(200); await page.click('#drawerNext'); await sleep(200);
  const h3 = await page.evaluate(() => history.length);
  const comps = await page.$$eval('#drawer .ms-comps__row', (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)));
  check('desktop: comps rows stay 28px', !comps.length || comps.every((x) => x === 28), comps.join(','));
  check('desktop: drawer paging replaces history', h3 === h2, `${h2} -> ${h3}`);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-drawer.png') });
  check('desktop: no page errors', !errors.length, errors.join(' | ') || 'none');
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

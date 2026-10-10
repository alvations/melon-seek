// Mobile QA e2e checks for the beta site (docs/QA.md "Full QA pass (mobile, beta) 2026-10-10",
// docs/process/qa-mobile-beta.md). The beta site is static only, so these tests serve the built
// dist/ (`npm run build` writes dist/beta/) under /melon-seek/ the way GitHub Pages does, and open
// /melon-seek/beta/. BETA_QA_DIST=<dir> points them at another build. Phone emulation: isMobile +
// hasTouch + DPR 3 with an iPhone UA; gestures are real touch input (page.touchscreen.tap and CDP
// Input.dispatchTouchEvent). Every request to another host is aborted, so the big-tech boards
// (`live: false`) must come from the bundle with no live request at all.
// Tests tagged "[M-n]" encode an open bug from that report and fail until it is fixed; the rest
// guard beta flows that work today.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, assertEq, skip } from './harness.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'qa-mobile-beta');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const PHONE = { width: 390, height: 844 };
const SMALL = { width: 360, height: 740 };
const BIG_TECH = ['netflix', 'google', 'microsoft', 'apple', 'nvidia']; // the first is opened by URL
const KEYBOARD = 336; // simulated on-screen keyboard height (px)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => Number(String(s).replace(/,/g, '').match(/(\d+)/)?.[1]);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
/** Serve the build under /melon-seek/ (gzip, like Pages); null when there is no beta build. */
async function serveBeta() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs', 'apple.json'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(p)] || 'application/octet-stream';
    const body = fs.readFileSync(p);
    if (/text|javascript|json|svg|csv/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' });
      return res.end(zlib.gzipSync(body));
    }
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, base: `${origin}/melon-seek/beta/`, close: () => new Promise((r) => server.close(r)) };
}

/** Simulated on-screen keyboard: visualViewport.height shrinks while a text field has focus. */
const KEYBOARD_INIT = (kb) => {
  const desc = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height');
  Object.defineProperty(VisualViewport.prototype, 'height', {
    configurable: true,
    get() {
      const a = document.activeElement;
      const typing = a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea');
      return typing ? innerHeight - kb : desc.get.call(this);
    },
  });
  const fire = () => setTimeout(() => visualViewport.dispatchEvent(new Event('resize')), 30);
  document.addEventListener('focusin', fire);
  document.addEventListener('focusout', fire);
};

async function openBeta(ctx, { hash = 'c=apple', viewport = PHONE, ua = IOS, colorScheme = 'light', keyboard = false, wait = true } = {}) {
  const st = await serveBeta();
  if (!st) skip('no beta build (npm run build writes dist/beta/)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext({ viewport, userAgent: ua, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme });
  ctx.cleanup.push(() => context.close());
  const external = [];
  await context.route((u) => u.origin !== st.origin, (r) => { external.push(r.request().url()); return r.abort('blockedbyclient'); });
  if (keyboard) await context.addInitScript(KEYBOARD_INIT, KEYBOARD);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && loc && !loc.startsWith(st.origin)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  const cdp = await context.newCDPSession(page);
  await page.goto(`${st.base}${hash ? `#${hash}` : ''}`);
  if (wait) {
    await page.waitForSelector('#resultsList .card[data-id]', { timeout: 60000 });
    await sleep(800);
  }
  return { st, context, page, cdp, errors, external };
}

async function touchDrag(cdp, x0, y0, x1, y1, { steps = 12, stepMs = 16, rest = 150 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }] });
    if (stepMs) await sleep(stepMs);
  }
  if (rest) await sleep(rest);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
}
async function tapSel(page, sel, wait = 450) {
  const b = await page.locator(sel).first().boundingBox();
  assert(b, `${sel} has no box`);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(wait);
}
async function tapBox(page, b, wait = 450) {
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(wait);
}
async function chipIntoView(page, id) {
  await page.evaluate((id) => document.querySelector(`#quickChips [data-pop=${id}]`).scrollIntoView({ inline: 'center' }), id);
  await sleep(250);
}
/** Switch company through the full-width company menu, with touch. */
async function switchTo(page, name) {
  await tapSel(page, '#companyMenuBtn', 700);
  const item = page.locator('#popover .company-item').filter({ has: page.locator('.company-item-name', { hasText: new RegExp(`^${name}$`) }) }).first();
  await item.scrollIntoViewIfNeeded();
  await tapBox(page, await item.boundingBox(), 0);
  await page.waitForFunction((n) => document.querySelector('#companyMenuBtn .company-name')?.textContent === n
    && document.querySelector('#resultsList .card[data-id]') && /role/.test(document.querySelector('#resultsTitle')?.textContent || ''), name, { timeout: 60000 });
  await sleep(600);
}
const sheet = (page) => page.evaluate(() => document.body.dataset.sheet);
async function openSheetFull(page) {
  for (let i = 0; i < 3 && (await sheet(page)) !== 'full'; i++) await tapSel(page, '#sheetHandle');
  assertEq(await sheet(page), 'full', 'results sheet state');
}
/** Swipe the full results list upwards n times (real touch). */
async function swipeList(page, cdp, n) {
  const lr = await page.locator('#resultsList').boundingBox();
  for (let i = 0; i < n; i++) await touchDrag(cdp, lr.x + lr.width / 2, lr.y + lr.height * 0.85, lr.x + lr.width / 2, lr.y + lr.height * 0.1, { steps: 6, stepMs: 8, rest: 0 });
}
/** Index of the first card visible at the top of the list viewport. */
const firstVisibleCard = (page) => page.evaluate(() => {
  const l = document.querySelector('#resultsList');
  const top = l.getBoundingClientRect().top;
  const cards = [...l.querySelectorAll('.card[data-id]')];
  return cards.findIndex((c) => c.getBoundingClientRect().bottom > top + 4);
});
async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 15000 }); } catch { /* evidence only */ }
}

export function registerBetaMobileQaTests(suite) {
  /* ------------------------------------------------------------------ guards (pass today) */

  suite.test('Beta mobile QA: every big-tech board loads from its snapshot with no live request; badge, popover and CSV agree', async (ctx) => {
    const { page, errors, external } = await openBeta(ctx, { hash: `c=${BIG_TECH[0]}` });
    const names = { google: 'Google', microsoft: 'Microsoft', apple: 'Apple', netflix: 'Netflix', nvidia: 'NVIDIA' };
    for (const slug of BIG_TECH) {
      if (slug !== BIG_TECH[0]) await switchTo(page, names[slug]);
      const roles = num(await page.textContent('#resultsTitle'));
      const aria = await page.getAttribute('#dataBadge', 'aria-label');
      assert(/^Data source: saved snapshot from /.test(aria), `${slug}: badge "${aria}"`);
      await tapSel(page, '#dataBadge', 700);
      const pop = await page.evaluate(() => ({
        text: document.querySelector('#popover').innerText,
        refreshShown: [...document.querySelectorAll('#popover button')].some((b) => /Refresh from the live board/.test(b.textContent) && !b.hidden),
        csv: (() => { const a = document.querySelector('#popover .badge-csv a'); return a ? new URL(a.getAttribute('href'), location.href).pathname : null; })(),
        csvH: Math.round(document.querySelector('#popover .badge-csv a')?.getBoundingClientRect().height || 0),
      }));
      assert(/your browser can’t fetch it live/.test(pop.text), `${slug}: popover says it is crawler-only`);
      assert(!pop.refreshShown, `${slug}: "Refresh from the live board" offered for a live: false board`);
      assertEq(pop.csv, `/melon-seek/beta/data/${slug}.csv`, `${slug}: CSV link`);
      assert(pop.csvH >= 44, `${slug}: CSV link is ${pop.csvH}px tall`);
      const lines = await page.evaluate(async (u) => (await (await fetch(u)).text()).split('\n').filter(Boolean).length, pop.csv);
      assertEq(lines, roles + 1, `${slug}: CSV rows (header + roles)`);
      await tapSel(page, '#popover .pop-head .icon-btn');
    }
    assertEq(external.length, 0, `requests to other hosts: ${external.slice(0, 3).join(', ')}`);
    assertEq(errors.length, 0, errors.join(' | '));
  });

  suite.test('Beta mobile QA: Apple (6,105 roles): a filter tap and a sort each answer within a second; "Show N roles" equals the result count', async (ctx) => {
    const { page, errors } = await openBeta(ctx, { hash: 'c=apple' });
    await page.evaluate(() => {
      window.__ev = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push({ n: e.name, d: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    });
    await chipIntoView(page, 'dept');
    await tapSel(page, '#quickChips [data-pop=dept]', 900);
    const row = page.locator('#filters .fsec').nth(1).locator('label.check').first();
    const facet = num((await row.innerText()).split('\n').pop());
    await page.evaluate(() => { window.__ev = []; });
    const b = await row.boundingBox();
    await page.touchscreen.tap(b.x + 40, b.y + b.height / 2);
    await sleep(1500);
    const tapMs = await page.evaluate(() => Math.round(Math.max(0, ...window.__ev.filter((e) => /click|pointer/.test(e.n)).map((e) => e.d))));
    assertEq(num(await page.textContent('#filtersDone')), facet, '"Show N roles" equals the department count');
    assert(tapMs < 1000, `filter tap took ${tapMs} ms to the next paint`);
    await tapSel(page, '#filtersDone', 1200);
    assertEq(num(await page.textContent('#resultsTitle')), facet, 'results title after "Show N roles"');
    await page.evaluate(() => { location.hash = location.hash.replace(/&?d=[^&]*/, ''); });
    await sleep(1200);
    for (const s of ['salary-asc', 'title', 'salary-desc']) {
      const r = await page.evaluate(async (s) => {
        const sel = document.querySelector('#sortBy');
        const before = document.querySelector('#resultsList .card[data-id]')?.dataset.id;
        const t0 = performance.now();
        sel.value = s; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        return { ms: Math.round(performance.now() - t0), changed: before !== document.querySelector('#resultsList .card[data-id]')?.dataset.id };
      }, s);
      assert(r.changed, `sort ${s} did not reorder the list`);
      assert(r.ms < 1000, `sort ${s} took ${r.ms} ms to the next frame`);
    }
    assertEq(errors.length, 0, errors.join(' | '));
  });

  suite.test('Beta mobile QA: Apple results sheet drags peek -> half -> full and the list lazy-loads past the first page', async (ctx) => {
    const { page, cdp } = await openBeta(ctx, { hash: 'c=apple' });
    const handleY = async () => (await page.locator('#sheetHandle').boundingBox()).y + 10;
    await touchDrag(cdp, 195, await handleY(), 195, 420);
    assertEq(await sheet(page), 'half', 'slow drag from peek');
    await touchDrag(cdp, 195, await handleY(), 195, 60);
    assertEq(await sheet(page), 'full', 'drag from half');
    const n0 = await page.$$eval('#resultsList .card[data-id]', (e) => e.length);
    await swipeList(page, cdp, 6);
    const n1 = await page.$$eval('#resultsList .card[data-id]', (e) => e.length);
    assert(n1 > n0, `lazy loading: ${n0} -> ${n1} cards`);
    await tapSel(page, '.topbar .seg [data-mode=map]', 1200);
    assertEq(await sheet(page), 'peek', 'a view change collapses the sheet');
  });

  suite.test('Beta mobile QA: switching between the big boards keeps the JS heap bounded', async (ctx) => {
    const { page, cdp, errors } = await openBeta(ctx, { hash: 'c=netflix' });
    await cdp.send('HeapProfiler.enable');
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(300); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6; };
    const round = ['Apple', 'Microsoft', 'Google', 'NVIDIA'];
    for (const n of round) await switchTo(page, n);
    const first = await heap();
    for (const n of [...round, ...round]) await switchTo(page, n);
    const third = await heap();
    assert(third <= first * 1.25 + 2, `heap grew from ${first.toFixed(1)} MB after one round to ${third.toFixed(1)} MB after three`);
    assertEq(errors.length, 0, errors.join(' | '));
  });

  suite.test('Beta mobile QA: Apple map: one-finger pan and pinch move the map, never the page', async (ctx) => {
    const { page, cdp } = await openBeta(ctx, { hash: 'c=apple&m=map' });
    await page.waitForSelector('#mapHost .ms-pin', { timeout: 30000 });
    await sleep(1200);
    const m = await page.locator('#mapHost').boundingBox();
    const pane = () => page.$eval('#mapHost .leaflet-map-pane', (e) => e.style.transform);
    const p0 = await pane();
    await touchDrag(cdp, m.x + 100, m.y + 120, m.x + 220, m.y + 200, { rest: 50 });
    assert((await pane()) !== p0, 'pan did not move the map');
    const pins0 = await page.$$eval('#mapHost .ms-pin', (e) => e.length);
    const cy = m.y + m.height / 2 - 40;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 165, y: cy, id: 1 }, { x: 225, y: cy, id: 2 }] });
    for (let i = 1; i <= 12; i++) {
      const d = 60 + (200 * i) / 12;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195 - d / 2, y: cy, id: 1 }, { x: 195 + d / 2, y: cy, id: 2 }] });
      await sleep(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(900);
    const pins1 = await page.$$eval('#mapHost .ms-pin', (e) => e.length);
    assert(pins1 !== pins0, `pinch did not change clustering (${pins0} -> ${pins1})`);
    assertEq(JSON.stringify(await page.evaluate(() => [scrollX, scrollY, visualViewport.scale])), '[0,0,1]', 'page scroll / zoom after map gestures');
  });

  /* ------------------------------------------------------------- open bugs (fail today) */

  suite.test('Beta mobile QA: [M-19] changing the sort while scrolled down the list shows the new top results', async (ctx) => {
    const { page, cdp } = await openBeta(ctx, { hash: 'c=apple' });
    await openSheetFull(page);
    await swipeList(page, cdp, 8);
    const deep = await page.$eval('#resultsList', (e) => e.scrollTop);
    assert(deep > 3000, `the list did not scroll deep enough (${deep})`);
    await page.selectOption('#sortBy', 'salary-asc');
    await sleep(1500);
    const idx = await firstVisibleCard(page);
    await shot(page, 'e2e-M-19-sort-while-scrolled');
    assertEq(idx, 0, `after "Lowest pay" the first visible card is #${idx + 1} of the new order (scrollTop ${await page.$eval('#resultsList', (e) => Math.round(e.scrollTop))})`);
  });

  suite.test('Beta mobile QA: [M-20] after scrolling 1,500 Apple roles the list keeps a bounded number of cards in the page', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=apple' });
    await openSheetFull(page);
    const n = await page.evaluate(async () => {
      const l = document.querySelector('#resultsList');
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      const seen = new Set();
      for (let i = 0; i < 2500 && seen.size < 1500; i++) {
        l.scrollTop = l.scrollHeight;
        await raf(); await raf();
        for (const c of l.querySelectorAll('.card[data-id]')) seen.add(c.dataset.id);
        if (!l.querySelector('.list-more')) break; // the whole list is in the page
      }
      return { scrolledPast: seen.size, inPage: l.querySelectorAll('.card[data-id]').length, nodes: document.getElementsByTagName('*').length };
    });
    assert(n.scrolledPast >= 1500, `could only scroll past ${n.scrolledPast} roles`);
    assert(n.inPage <= 600, `${n.inPage} cards (${n.nodes} DOM nodes) stay in the page after scrolling past ${n.scrolledPast} roles`);
  });

  suite.test('Beta mobile QA: [M-21] the company menu shows the current big-tech board without scrolling', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=apple' });
    await tapSel(page, '#companyMenuBtn', 900);
    const g = await page.evaluate(() => {
      const list = document.querySelector('#popover .company-list').getBoundingClientRect();
      const cur = document.querySelector('#popover .company-item[aria-current="true"]');
      const r = cur?.getBoundingClientRect();
      const heading = cur?.closest('[role=group]')?.querySelector('.check-group')?.textContent;
      return { listTop: Math.round(list.top), listBottom: Math.round(list.bottom), curTop: r && Math.round(r.top), curBottom: r && Math.round(r.bottom), heading };
    });
    await shot(page, 'e2e-M-21-company-menu');
    assert(g.curTop != null, 'no current company in the menu');
    assert(g.curTop >= g.listTop && g.curBottom <= g.listBottom, `Apple ✓ is at ${g.curTop}–${g.curBottom}, outside the visible list ${g.listTop}–${g.listBottom} (group "${g.heading}")`);
  });

  suite.test('Beta mobile QA: [M-22] a link to a paused board (#c=amazon) explains it instead of "Offline" and Retry', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=amazon', wait: false });
    await page.waitForFunction(() => /No data|role/.test(document.querySelector('#resultsTitle')?.textContent || ''), null, { timeout: 30000 });
    await sleep(800);
    const s = await page.evaluate(() => ({
      badge: document.querySelector('#dataBadge')?.getAttribute('aria-label'),
      retry: [...document.querySelectorAll('button')].some((b) => /^Retry$/.test(b.textContent.trim()) && b.getClientRects().length),
      text: document.querySelector('#vizArea')?.innerText.replace(/\s+/g, ' ').trim(),
    }));
    await shot(page, 'e2e-M-22-paused-board');
    assert(!/Offline/.test(s.badge || ''), `badge "${s.badge}" for a board the site does not collect`);
    assert(!s.retry, `a Retry button that can never work ("${s.text}")`);
  });

  suite.test('Beta mobile QA: [M-23] big counts are written out: no "999+" map pin, "1 of 6,105" on the job page', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=apple&m=map' });
    await page.waitForSelector('#mapHost .ms-pin', { timeout: 30000 });
    await sleep(1200);
    const capped = await page.$$eval('#mapHost .ms-pin', (e) => e.map((p) => p.textContent.trim()).filter((t) => /999\+/.test(t)));
    await tapSel(page, '.topbar .seg [data-mode=chart]', 1000);
    await tapSel(page, '#sheetHandle');
    await tapSel(page, '#resultsList .card[data-id]', 1200);
    const pos = await page.textContent('#drawerPos');
    const problems = [];
    if (capped.length) problems.push(`map pins capped at "999+": ${capped.join(' | ')}`);
    if (!/ of \d{1,3}(,\d{3})+$/.test(pos)) problems.push(`job page counter reads "${pos}"`);
    assertEq(problems.join('; '), '', 'big counts');
  });

  suite.test('Beta mobile QA: [M-24] with the keyboard up, Location search results in the filter sheet stay above the keyboard', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=apple', keyboard: true });
    await tapSel(page, '#filtersToggle', 800);
    const search = page.locator('#filters .fsec').nth(2).locator('input.fsearch');
    await search.scrollIntoViewIfNeeded();
    await tapBox(page, await search.boundingBox(), 900);
    await page.keyboard.type('san', { delay: 60 });
    await sleep(900);
    const g = await page.evaluate(() => {
      const sec = document.activeElement.closest('.fsec');
      const rows = [...sec.querySelectorAll('label.check')].map((l) => Math.round(l.getBoundingClientRect().bottom));
      return { vvh: visualViewport.height, input: Math.round(document.activeElement.getBoundingClientRect().bottom), rows };
    });
    await page.evaluate((h) => { // draw the simulated keyboard into the screenshot
      const k = document.createElement('div');
      k.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${h}px;background:rgba(60,60,67,.82);z-index:99999`;
      document.body.append(k);
    }, KEYBOARD);
    await shot(page, 'e2e-M-24-keyboard-location-search');
    assert(g.rows.length > 0, 'no matching rows for "san"');
    assert(g.rows[0] <= g.vvh, `the first match ends at ${g.rows[0]}px, under the keyboard (visible height ${g.vvh}px; field ends at ${g.input}px)`);
  });

  suite.test('Beta mobile QA: [M-25] filter-sheet Remote segment, the Juice "How it\'s calculated" link and Market insights rows are 44px touch targets', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=apple' });
    const small = [];
    await chipIntoView(page, 'remote');
    await tapSel(page, '#quickChips [data-pop=remote]', 900);
    for (const b of await page.$$eval('#filters .fsec .seg--block button', (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)))) if (b < 44) small.push(`Remote segment ${b}px`);
    await tapSel(page, '#filtersClose');
    await tapSel(page, '#sheetHandle');
    await tapSel(page, '#resultsList .card[data-id]', 1500);
    await page.evaluate(() => document.querySelector('#drawer .d-juice summary')?.click());
    await sleep(500);
    const link = await page.evaluate(() => { const a = document.querySelector('#drawer .juice-disclaimer a'); if (!a) return null; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return Math.round(r.height); });
    if (link != null && link < 44) small.push(`"How it's calculated" ${link}px`);
    await tapSel(page, '#drawerClose', 600);
    await tapSel(page, '.topbar .seg [data-mode=insights]', 2500);
    await page.waitForSelector('#insightsPanel button', { timeout: 30000 });
    const rows = await page.$$eval('#insightsPanel button', (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)).filter((hgt) => hgt > 0 && hgt < 44));
    if (rows.length) small.push(`${rows.length} Market insights rows ${Math.min(...rows)}px`);
    assertEq(small.join('; '), '', 'touch targets under 44px');
  });

  suite.test('Beta mobile QA: [M-26] the Filters button after a chip: focus is on what the sheet shows', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=apple' });
    await chipIntoView(page, 'remote');
    await tapSel(page, '#quickChips [data-pop=remote]', 800);
    await tapSel(page, '#filtersClose', 500);
    await tapSel(page, '#filtersToggle', 900);
    const g = await page.evaluate(() => {
      const body = document.querySelector('#filterBody').getBoundingClientRect();
      const a = document.activeElement;
      const r = a.getBoundingClientRect();
      return { focus: a.closest('.fsec')?.querySelector('.fsec-title')?.textContent || a.id, top: Math.round(r.top), bottom: Math.round(r.bottom), bodyTop: Math.round(body.top), bodyBottom: Math.round(body.bottom) };
    });
    assert(g.bottom > g.bodyTop && g.top < g.bodyBottom, `focus is on "${g.focus}" at ${g.top}–${g.bottom}, outside the visible sheet ${g.bodyTop}–${g.bodyBottom}`);
  });

  suite.test('Beta mobile QA: [M-27] the Beta pill and the full company name both fit the 360px top bar', async (ctx) => {
    const { page, errors } = await openBeta(ctx, { hash: 'c=microsoft', viewport: SMALL, ua: ANDROID });
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      // The pill is CSS content: by the logo (.brand::after) when the logo shows, else before the company menu.
      const host = [['.brand', '::after'], ['.company-bar', '::before']].map(([sel, pseudo]) => ({ el: document.querySelector(sel), pseudo }))
        .find(({ el, pseudo }) => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el, pseudo).content === '"Beta"');
      const name = document.querySelector('#companyMenuBtn .company-name');
      return {
        channel: document.documentElement.dataset.channel, pill: !!host,
        menu: r('#companyMenuBtn'), badge: r('#dataBadge'), theme: r('#themeBtn'),
        name: name.textContent, nameW: name.clientWidth, nameSW: name.scrollWidth, scrollW: document.documentElement.scrollWidth - innerWidth,
      };
    });
    await shot(page, 'e2e-M-27-topbar-360');
    assertEq(g.channel, 'beta', '<html data-channel>');
    assert(g.pill, 'no visible "Beta" pill in the top bar');
    assert(g.menu.right <= g.badge.left && g.badge.right <= g.theme.left && g.theme.right <= 360, `top bar row overlaps: ${JSON.stringify([g.menu.right, g.badge.left, g.badge.right, g.theme.left, g.theme.right])}`);
    assertEq(g.scrollW, 0, 'horizontal page scroll');
    assertEq(errors.length, 0, errors.join(' | '));
    assert(g.nameSW <= g.nameW + 1, `"${g.name}" is cut off in the company menu button (${g.nameW} of ${g.nameSW} px shown)`);
  });
}

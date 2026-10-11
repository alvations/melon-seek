// Second mobile QA pass on the beta site (docs/QA.md "Full QA pass (mobile, beta) 2026-10-11",
// docs/process/qa-mobile-beta-2.md). Top item: the user's report that the company list doesn't scroll properly on
// the phone beta site, and the audit of every scrolling area that followed.
//
// The beta site is static only, so these tests serve a build (BETA_QA2_DIST, else BETA_QA_DIST, else dist/; `npm run
// build` writes dist/beta/) under /melon-seek/ the way GitHub Pages does, and open /melon-seek/beta/. Every request
// to another host is aborted.
//
// Engines. By default the tests use the suite's Chromium (ctx.browser). BETA_QA2_ENGINE=webkit makes each test
// launch Playwright's WebKit itself (ctx.pw.webkit) with the same phone profile, for the WebKit workflow in
// docs/process/patches/qa-mobile-beta-2-webkit.diff. Gestures:
//   - Chromium: real touch, page.touchscreen.tap and CDP Input.dispatchTouchEvent for swipes;
//   - WebKit: page.touchscreen.tap, and mouse.wheel at the same point in place of a swipe (Playwright has no
//     touch-drag API outside Chromium). A wheel scrolls the innermost scroll box under the pointer and chains by the
//     same overscroll-behavior rules as a touch pan, so the reachability checks mean the same thing; a real iOS
//     swipe is the iOS Simulator job in that workflow.
// Tests tagged "[M-n]" encode an open bug from that report and fail until it is fixed; the rest guard flows that
// work today. Under WebKit, every test runs; none needs CDP. BETA_QA2_WHEEL=1 uses the WebKit gestures (wheel) in
// Chromium too, to check that fallback here.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, assertEq, skip } from './harness.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'qa-mobile-beta-2');
const ENGINE = (process.env.BETA_QA2_ENGINE || 'chromium').toLowerCase();
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
// Viewports. Emulated phones in Chromium have no browser toolbars, so a "390x844" phone shows 844 CSS px. Safari on an
// iPhone 14 shows about 390x664 (bottom tab bar), an iPhone SE about 375x548.
const PHONE = { width: 390, height: 844 };
const SAFARI_14 = { width: 390, height: 664 };
const SAFARI_SE = { width: 375, height: 548 };
const LANDSCAPE = { width: 844, height: 390 };
const SMALL = { width: 360, height: 640 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
/** Serve the build under /melon-seek/ (gzip, like Pages); null when there is no beta build. */
async function serveBeta() {
  const dist = path.resolve(process.env.BETA_QA2_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
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
  return { origin, base: `${origin}/melon-seek/`, close: () => new Promise((r) => server.close(r)) };
}

/** Simulated on-screen keyboard (the first pass's method): visualViewport.height shrinks while a text field has focus. */
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
/** Saved searches in this browser (the format app.js saveSearch() writes), so the menu lists them above the companies. */
const SAVED_INIT = (n) => {
  try {
    const now = new Date(Date.now() - 3 * 864e5).toISOString();
    const pick = [['Google · Software engineering', 'c=google&rf=swe'], ['NVIDIA · Senior', 'c=nvidia&s=Senior'], ['Microsoft · Remote', 'c=microsoft&r=remote'], ['Netflix', 'c=netflix'], ['Apple · Hardware', 'c=apple&d=Hardware']];
    localStorage.setItem('melon.saved', JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `qa${i}`, name: pick[i % pick.length][0], hash: pick[i % pick.length][1], channel: 'beta', createdAt: now, lastSeenAt: now }))));
  } catch { /* storage blocked */ }
};

async function newBrowser(ctx) {
  if (ENGINE !== 'webkit') return ctx.browser;
  if (!ctx.pw?.webkit) skip('BETA_QA2_ENGINE=webkit but Playwright has no WebKit');
  const b = await ctx.pw.webkit.launch();
  ctx.cleanup.push(() => b.close());
  return b;
}

async function openBeta(ctx, { hash = 'c=apple', site = 'beta/', viewport = PHONE, ua = IOS, colorScheme = 'light', keyboard = 0, saved = 0, wait = true, slowOthers = 0 } = {}) {
  const st = await serveBeta();
  if (!st) skip('no beta build (npm run build writes dist/beta/)');
  ctx.cleanup.push(() => st.close());
  const browser = await newBrowser(ctx);
  const context = await browser.newContext({ viewport, userAgent: ua, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => u.origin !== st.origin, (r) => r.abort('blockedbyclient'));
  // slowOthers: other boards' job lists arrive this many ms late, as on a phone's 4G (the open board is not slowed).
  const own = new URLSearchParams(hash).get('c');
  if (slowOthers) await context.route((u) => /\/api\/jobs\/[^/]+\.json$/.test(u.pathname) && !u.pathname.endsWith(`/${own}.json`), async (r) => { await sleep(slowOthers); return r.continue(); });
  if (keyboard) await context.addInitScript(KEYBOARD_INIT, keyboard);
  if (saved) await context.addInitScript(SAVED_INIT, saved);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  let cdp = null;
  if (ENGINE !== 'webkit' && !process.env.BETA_QA2_WHEEL) { try { cdp = await context.newCDPSession(page); } catch { cdp = null; } }
  await page.goto(`${st.base}${site}${hash ? `#${hash}` : ''}`);
  if (wait) {
    await page.waitForSelector('#resultsList .card[data-id]', { timeout: 90000 });
    await sleep(800);
  }
  return { page, cdp, errors };
}

/** A vertical swipe from y0 to y1 at x: real touch in Chromium, a wheel at the start point elsewhere. */
async function swipe(page, cdp, x, y0, y1, { steps = 10, stepMs = 16, rest = 120 } = {}) {
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps, id: 1 }] });
      if (stepMs) await sleep(stepMs);
    }
    if (rest) await sleep(rest);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y0);
    for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, (y0 - y1) / steps); await sleep(stepMs); }
  }
  await sleep(450);
}
async function tapBox(page, b, wait = 450) {
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(wait);
}
async function tapSel(page, sel, wait = 450) {
  const b = await page.locator(sel).first().boundingBox();
  assert(b, `${sel} has no box`);
  await tapBox(page, b, wait);
}
async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 15000 }); } catch { /* evidence only */ }
}
const drawKeyboard = (page, h) => page.evaluate((h) => {
  const k = document.createElement('div');
  k.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${h}px;background:rgba(60,60,67,.82);z-index:99999;pointer-events:none`;
  document.body.append(k);
}, h);

/** The company menu sheet: its body, its list, both scroll offsets, and how much of the last company is visible. */
const menuGeom = (page) => page.evaluate(() => {
  const pop = document.querySelector('#popover'), body = pop.querySelector('.pop-body'), list = pop.querySelector('.company-list');
  const items = [...list.querySelectorAll('.company-item')];
  const last = items[items.length - 1];
  const bottomEdge = visualViewport.height;
  const seen = (e) => {
    const r = e.getBoundingClientRect(), lr = list.getBoundingClientRect(), br = body.getBoundingClientRect();
    const top = Math.max(r.top, lr.top, br.top, 0), bottom = Math.min(r.bottom, lr.bottom, br.bottom, bottomEdge);
    return Math.max(0, bottom - top) / r.height;
  };
  const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  return {
    body: R(body), list: R(list), vvh: Math.round(bottomEdge),
    bodyScroll: [Math.round(body.scrollTop), body.scrollHeight - body.clientHeight],
    listScroll: [Math.round(list.scrollTop), list.scrollHeight - list.clientHeight],
    last: last?.querySelector('.company-item-name')?.textContent, lastSeen: last ? Math.round(seen(last) * 100) / 100 : 0,
    fullRows: items.filter((i) => seen(i) > 0.99).length, rows: items.length,
  };
});
/** Swipe up on the visible part of the company rows until nothing moves (at most `max` swipes). */
async function swipeMenuToEnd(page, cdp, max = 8) {
  let g = await menuGeom(page);
  const x = page.viewportSize().width / 2;
  for (let i = 0; i < max; i++) {
    const top = Math.max(g.list[0], g.body[0]), bottom = Math.min(g.list[1], g.body[1], g.vvh);
    if (bottom - top < 24) break;
    await swipe(page, cdp, x, top + (bottom - top) * 0.85, top + (bottom - top) * 0.15);
    const n = await menuGeom(page);
    const same = n.listScroll[0] === g.listScroll[0] && n.bodyScroll[0] === g.bodyScroll[0];
    g = n;
    if (same) break;
  }
  return g;
}

export function registerBetaMobileQa2Tests(suite) {
  /* ------------------------------------------------------------------ guards (pass today) */

  suite.test('Beta mobile QA 2: portrait phones (390x844, Safari 390x664): a swipe on the company rows brings the last company fully into view, and nothing behind the sheet moves', async (ctx) => {
    const problems = [];
    for (const viewport of [PHONE, SAFARI_14]) {
      const { page, cdp } = await openBeta(ctx, { viewport });
      await tapSel(page, '#companyMenuBtn', 900);
      const g = await swipeMenuToEnd(page, cdp);
      const behind = await page.evaluate(() => [scrollX, scrollY, Math.round(document.querySelector('#chartHost .ms-chart__scroll')?.scrollTop || 0)]);
      if (g.lastSeen < 0.99) problems.push(`${viewport.width}x${viewport.height}: ${g.last} ${Math.round(g.lastSeen * 100)}% visible after swiping (list ${g.listScroll}, sheet body ${g.bodyScroll})`);
      if (behind.some(Boolean)) problems.push(`${viewport.width}x${viewport.height}: the page or the chart behind moved (${behind})`);
      await page.context().close();
    }
    assertEq(problems.join('; '), '', 'company list in portrait');
  });

  suite.test('Beta mobile QA 2: every other phone scroll area reaches its end with the page still (results list at full, filter sheet, More sheet, job page, Insights)', async (ctx) => {
    const { page, cdp } = await openBeta(ctx, { hash: 'c=apple' });
    const x = 195;
    const run = async (label, sel, open, close) => {
      await open();
      await sleep(400);
      const el = page.locator(sel).first();
      const b = await el.boundingBox();
      assert(b, `${label}: ${sel} not on screen`);
      const top = Math.max(0, b.y), bottom = Math.min(b.y + b.height, 844);
      let prev = -1;
      for (let i = 0; i < 14; i++) {
        await swipe(page, cdp, x, top + (bottom - top) * 0.8, top + (bottom - top) * 0.2, { steps: 8, stepMs: 12, rest: 60 });
        const s = await el.evaluate((e) => [Math.round(e.scrollTop), e.scrollHeight - e.clientHeight]);
        if (s[0] >= s[1] - 1 || s[0] === prev) break;
        prev = s[0];
      }
      const s = await el.evaluate((e) => [Math.round(e.scrollTop), e.scrollHeight - e.clientHeight]);
      const pageAt = await page.evaluate(() => [scrollX, scrollY]);
      assert(s[0] > 0, `${label}: did not scroll (${s})`);
      assertEq(JSON.stringify(pageAt), '[0,0]', `${label}: page scroll`);
      await close();
    };
    await run('filter sheet', '#filterBody', () => tapSel(page, '#filtersToggle', 900), () => tapSel(page, '#filtersClose', 600));
    await run('More sheet', '#popover .pop-body', async () => {
      await page.evaluate(() => document.querySelector('#quickChips [data-pop=more]').scrollIntoView({ inline: 'center' }));
      await sleep(300);
      await tapSel(page, '#quickChips [data-pop=more]', 900);
    }, () => tapSel(page, '#popover .pop-head .icon-btn', 500));
    await run('job page', '#drawer .drawer-scroll', async () => {
      await tapSel(page, '#sheetHandle', 600);
      await tapSel(page, '#resultsList .card[data-id]', 1500);
    }, () => tapSel(page, '#drawerClose', 700));
    await run('results list (full sheet)', '#resultsList', async () => {
      for (let i = 0; i < 3 && (await page.evaluate(() => document.body.dataset.sheet)) !== 'full'; i++) await tapSel(page, '#sheetHandle', 500);
    }, () => tapSel(page, '#sheetHandle', 600));
    await run('Insights', '#insightsHost', () => tapSel(page, '.topbar .seg [data-mode=insights]', 3000), () => tapSel(page, '.topbar .seg [data-mode=chart]', 1000));
  });

  /* ------------------------------------------------------------- open bugs (fail today) */

  suite.test('Beta mobile QA 2: [M-28] where the sheet is shorter than the company list (landscape, iPhone SE Safari, keyboard up), a swipe on the rows still reaches the last company', async (ctx) => {
    const cases = [
      { name: 'landscape 844x390', viewport: LANDSCAPE },
      { name: 'iPhone SE Safari 375x548', viewport: SAFARI_SE },
      { name: '360x640 with the keyboard up (300 px)', viewport: SMALL, ua: ANDROID, keyboard: 300 },
      { name: 'landscape 844x390 with 5 saved searches', viewport: LANDSCAPE, saved: 5 },
    ];
    const problems = [];
    for (const c of cases) {
      const { page, cdp } = await openBeta(ctx, { viewport: c.viewport, ua: c.ua || IOS, keyboard: c.keyboard || 0, saved: c.saved || 0 });
      await tapSel(page, '#companyMenuBtn', 900);
      if (c.keyboard) { await tapSel(page, '#popover input.fsearch', 900); }
      const g = await swipeMenuToEnd(page, cdp);
      if (c.keyboard) await drawKeyboard(page, c.keyboard);
      await shot(page, `e2e-M-28-${c.name.replace(/\W+/g, '-')}`);
      if (g.lastSeen < 0.99) problems.push(`${c.name}: after swiping the rows to the end, ${g.last} is ${Math.round(g.lastSeen * 100)}% visible (list ${g.listScroll[0]}/${g.listScroll[1]} px, sheet body ${g.bodyScroll[0]}/${g.bodyScroll[1]} px, list box ${g.list} under a sheet body ${g.body})`);
      await page.context().close();
    }
    assertEq(problems.join(' | '), '', 'company list reachability');
  });

  suite.test('Beta mobile QA 2: [M-29] opening the company menu on a phone does not put focus in its search box (no keyboard over the list)', async (ctx) => {
    const { page } = await openBeta(ctx, { ua: ANDROID });
    await tapSel(page, '#companyMenuBtn', 900);
    const a = await page.evaluate(() => { const e = document.activeElement; return { tag: e.tagName, type: e.type || '', cls: e.className, label: e.getAttribute('aria-label') || '' }; });
    await shot(page, 'e2e-M-29-company-menu-focus');
    assert(!(a.tag === 'INPUT' && /^(search|text)$/.test(a.type)), `focus went to the ${a.type} field "${a.label}" (.${a.cls}); on Android Chrome that opens the keyboard over the list on every open`);
  });

  suite.test('Beta mobile QA 2: [M-30] the open company menu keeps its rows while saved searches load (no rebuild under the finger)', async (ctx) => {
    // Each saved search's board loads when the menu opens (app.js prefetchSaved); on a phone's 4G that takes seconds.
    const { page } = await openBeta(ctx, { saved: 4, slowOthers: 1500 });
    await tapSel(page, '#companyMenuBtn', 0);
    await page.waitForSelector('#popover .company-item');
    await page.evaluate(() => {
      window.__qaRows = [...document.querySelectorAll('#popover .company-list .company-item')];
      window.__qaRebuilds = 0;
      new MutationObserver(() => { window.__qaRebuilds++; }).observe(document.querySelector('#popover .company-list'), { childList: true });
    });
    await sleep(6000);
    await shot(page, 'e2e-M-30-saved-searches-loaded');
    const r = await page.evaluate(() => ({ rebuilds: window.__qaRebuilds, replaced: window.__qaRows.filter((e) => !e.isConnected).length, rows: window.__qaRows.length, saved: document.querySelectorAll('#popover .saved-row').length }));
    assert(r.saved >= 4, `the menu lists ${r.saved} saved searches (expected 4)`);
    assertEq(r.replaced, 0, `${r.replaced} of ${r.rows} company rows were replaced by new nodes while the menu stayed open (${r.rebuilds} list rebuilds); a tap that began on an old row can be lost (iOS Safari cancels a tap whose node left the page)`);
  });

  suite.test('Beta mobile QA 2: [M-31] with the results sheet at half, the chart\'s empty message ("No pay posted for Zurich") stays in the visible part of the chart', async (ctx) => {
    const { page } = await openBeta(ctx, { hash: 'c=google&l=Zurich' });
    await page.waitForSelector('#chartHost .ms-chart__empty:not([hidden])', { timeout: 30000 });
    await tapSel(page, '#sheetHandle', 900);
    const g = await page.evaluate(() => {
      const t = document.querySelector('#chartHost .ms-chart__empty-title');
      const r = t.getBoundingClientRect(), s = document.querySelector('#results').getBoundingClientRect();
      return { text: t.textContent, bottom: Math.round(r.bottom), sheetTop: Math.round(s.top), sheet: document.body.dataset.sheet };
    });
    await shot(page, 'e2e-M-31-empty-message-half-sheet');
    assertEq(g.sheet, 'half', 'sheet state');
    assert(g.bottom <= g.sheetTop, `"${g.text}" ends at ${g.bottom}px, under the half sheet (top ${g.sheetTop}px): the visible chart is blank`);
  });
}

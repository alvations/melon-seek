// Fix lane fix-company-scroll (docs/process/fix-company-scroll.md): on a phone the company menu's bottom
// sheet must scroll to its last company. The user (2026-10-11, own phone, /beta/): "I'm still not able to
// scroll down from the list of company drop down!!".
// Root cause: the sheet had two nested scroll boxes, `.pop-body` (overflow: auto) and inside it
// `.company-list` (max-height: 340px; overflow: auto), both `overscroll-behavior: contain`. Whenever the
// sheet is shorter than its content (small phones, landscape, the keyboard up, or iOS Safari's toolbars),
// the list's lower part sits below the sheet's visible area; a swipe on the list scrolls only the list and
// never chains to `.pop-body`, so the last companies and "Add another company's board" are out of reach.
// The fix: on phones the sheet has ONE scroller, the list, which fills the space under the pinned search.
//
// These tests serve the static build (BETA_QA_DIST or dist/) under /melon-seek/ and skip without a beta
// build. Every case uses only standard Playwright APIs and runs under any engine, except the touch-swipe
// test, which needs Chromium's CDP. Run alone under WebKit (the mobile-webkit workflow):
//   node test/e2e/fix-company-scroll.e2e.js --browser=webkit
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, assert, skip } from './harness.js';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PHONES = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '844x390 landscape', width: 844, height: 390 },
];
const phone = ({ width, height }) => ({ viewport: { width, height }, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const SAVED = [1, 2, 3].map((i) => ({ id: `fcs${i}`, name: `Saved search ${i}`, hash: `q=${['engineer', 'manager', 'designer'][i - 1]}` }));

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. */
async function serveDist() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const body = fs.readFileSync(p);
    const gz = /gzip/.test(req.headers['accept-encoding'] || '') && body.length > 1024;
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gz ? zlib.gzipSync(body) : body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { dist, origin, main: `${origin}/melon-seek/`, beta: `${origin}/melon-seek/beta/`, close: () => new Promise((r) => server.close(r)) };
}
async function setup(ctx) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build writes dist/beta/)');
  ctx.cleanup.push(() => st.close());
  return st;
}

/**
 * A fresh phone page at `url`. `saved` seeds saved searches; `keyboard` (a height in px) stands in a
 * visual viewport that short for the on-screen keyboard (the app reads window.visualViewport; headless
 * engines have no keyboard), so the sheet's keyboard rules (body.kb-open, --vvh) are exercised.
 */
async function open(ctx, st, url, { device, saved = false, keyboard = 0 } = {}) {
  const context = await ctx.browser.newContext({ colorScheme: 'light', ...device });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  await context.addInitScript(({ saved: s, keyboard: kb }) => {
    try { if (s) localStorage.setItem('melon.saved', JSON.stringify(s)); } catch { /* ignore */ }
    if (kb) {
      const vv = new EventTarget();
      Object.assign(vv, { width: innerWidth, height: kb, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
    }
  }, { saved: saved ? SAVED : null, keyboard });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && /role/.test(t.textContent) && !/Loading/.test(t.textContent); }, null, { timeout: 60000 });
  await sleep(300);
  return { page, errors };
}
async function openMenu(page, { type = '', keyboard = 0 } = {}) {
  await page.click('#companyMenuBtn');
  await page.waitForSelector('#popover.popover--company:not([hidden]) .company-list .company-item');
  await sleep(350); // the sheet's entry animation (0.2 s)
  if (type) { await page.fill('#popover input.fsearch', type); await sleep(150); }
  if (keyboard) {
    await page.focus('#popover input.fsearch');
    await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize')));
    await sleep(450); // rafThrottle + revealField's 300 ms
    assert(await page.evaluate(() => document.body.classList.contains('kb-open')), 'the stand-in keyboard sets body.kb-open');
  }
}

/** Geometry of the open sheet, in any engine: scroll boxes, nested max-heights, and what the end of the list shows. */
function sheetGeometry(listSel) {
  const pop = document.querySelector('#popover');
  const list = pop.querySelector(listSel);
  const vv = window.visualViewport;
  const viewBottom = vv ? vv.offsetTop + vv.height : innerHeight;
  const name = (e) => (e === pop ? '#popover' : `.${[...e.classList].join('.')}`);
  const all = [pop, ...pop.querySelectorAll('*')].filter((e) => e.getClientRects().length);
  const scrollBoxes = all.filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY)).map(name);
  const overflowing = all.filter((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible').map(name);
  const nestedMaxHeight = all.filter((e) => e !== pop && getComputedStyle(e).maxHeight !== 'none').map((e) => `${name(e)} ${getComputedStyle(e).maxHeight}`);
  const pr = pop.getBoundingClientRect();
  const r = (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height }; };
  const before = list.scrollTop;
  list.scrollTop = list.scrollHeight;
  const lr = r(list);
  const last = [...list.children].filter((e) => e.getClientRects().length).pop(); // the end of the scroller's content
  const lastItem = [...list.querySelectorAll('.company-item')].pop();
  const out = {
    viewBottom, innerHeight, scrollBoxes, overflowing, nestedMaxHeight,
    sheet: { top: pr.top, bottom: pr.bottom }, list: lr, listScrolls: list.scrollHeight > list.clientHeight + 1,
    last: last ? { ...r(last), text: last.textContent.trim().slice(0, 40) } : null,
    lastItem: lastItem ? r(lastItem) : null,
    page: (document.scrollingElement || document.documentElement).scrollTop,
  };
  list.scrollTop = before;
  return out;
}
function assertSheet(g, label, { scroller = 'company-list' } = {}) {
  const tag = `${label}: ${JSON.stringify({ scrollBoxes: g.scrollBoxes, overflowing: g.overflowing, nested: g.nestedMaxHeight, sheet: g.sheet, list: g.list, last: g.last, viewBottom: g.viewBottom })}`;
  assert(g.scrollBoxes.length === 1 && g.scrollBoxes[0].split('.').includes(scroller), `the ${scroller} is the sheet's one scroll box (${g.scrollBoxes.join(', ')}) — ${tag}`);
  assert(g.overflowing.every((n) => n.split('.').includes(scroller)), `nothing but the ${scroller} clips content (${g.overflowing.join(', ')}) — ${tag}`);
  assert(!g.nestedMaxHeight.length, `no nested max-height box inside the sheet (${g.nestedMaxHeight.join(', ')}) — ${tag}`);
  assert(g.sheet.top >= -0.5 && g.sheet.bottom <= g.viewBottom + 0.5, `the sheet sits inside the visible viewport (${g.sheet.top}–${g.sheet.bottom} of ${g.viewBottom}) — ${tag}`);
  assert(g.list.bottom <= g.viewBottom + 0.5, `the list's bottom edge is on screen — ${tag}`);
  assert(g.list.height >= 80, `the list shows at least two rows (${g.list.height}px) — ${tag}`);
  assert(g.last && g.last.bottom > g.list.top && g.last.bottom <= g.list.bottom + 1, `scrolled to its end, the end of the content is visible — ${tag}`);
  if (g.lastItem) assert(g.lastItem.top >= g.list.top - 0.5 && g.lastItem.bottom <= g.list.bottom + 1, `the last company is fully visible at the end — ${tag}`);
}

export function registerFixCompanyScrollTests(suite) {
  for (const site of ['beta', 'main']) {
    for (const dev of PHONES) {
      suite.test(`Fix company scroll: [${site} ${dev.name}] the company sheet has one scroller and its last company scrolls fully into view`, async (ctx) => {
        const st = await setup(ctx);
        const { page, errors } = await open(ctx, st, st[site], { device: phone(dev) });
        await openMenu(page);
        assertSheet(await page.evaluate(sheetGeometry, '.company-list'), `${site} ${dev.name}`);
        assert(!errors.length, errors.join(' | '));
      });
    }
    suite.test(`Fix company scroll: [${site} 390x844] with saved searches the list still has one scroller and reaches the last company`, async (ctx) => {
      const st = await setup(ctx);
      const { page } = await open(ctx, st, st[site], { device: phone(PHONES[1]), saved: true });
      await openMenu(page);
      assert(await page.locator('#popover .saved-row').count() >= 3, 'the saved searches are listed');
      const g = await page.evaluate(sheetGeometry, '.company-list');
      assert(g.listScrolls, 'with saved searches the list is taller than the sheet');
      assertSheet(g, `${site} saved`);
    });
    suite.test(`Fix company scroll: [${site} 320x568] with a search typed the list keeps one scroller`, async (ctx) => {
      const st = await setup(ctx);
      const { page } = await open(ctx, st, st[site], { device: phone(PHONES[0]), saved: true });
      await openMenu(page, { type: 'e' });
      assertSheet(await page.evaluate(sheetGeometry, '.company-list'), `${site} typed`);
    });
    for (const [dev, kb] of [[PHONES[0], 260], [PHONES[1], 460], [PHONES[3], 200]]) {
      suite.test(`Fix company scroll: [${site} ${dev.name}, keyboard up: ${kb}px visual viewport] the sheet fits above the keyboard and its last company is reachable`, async (ctx) => {
        const st = await setup(ctx);
        const { page } = await open(ctx, st, st[site], { device: phone(dev), saved: true, keyboard: kb });
        await openMenu(page, { keyboard: kb });
        const g = await page.evaluate(sheetGeometry, '.company-list');
        assert(Math.abs(g.viewBottom - kb) < 1, 'the stand-in visual viewport is in effect');
        assertSheet(g, `${site} ${dev.name} keyboard`);
      });
    }
  }

  for (const [id, open_] of [['badge', '#dataBadge'], ['more', '#quickChips [data-pop="more"]']]) {
    suite.test(`Fix company scroll: [beta 320x568] the "${id}" bottom sheet also has one scroller that reaches its end`, async (ctx) => {
      const st = await setup(ctx);
      const { page } = await open(ctx, st, st.beta, { device: phone(PHONES[0]) });
      const btn = page.locator(open_);
      if (!(await btn.isVisible())) skip(`${open_} is not shown`);
      await btn.click();
      await page.waitForSelector(`#popover.popover--${id}:not([hidden])`); await sleep(350);
      assertSheet(await page.evaluate(sheetGeometry, '.pop-body'), `${id} sheet`, { scroller: 'pop-body' });
    });
  }

  suite.test('Fix company scroll: [desktop 1440x900] the company popover is unchanged (340px list box under the search)', async (ctx) => {
    const st = await setup(ctx);
    const { page } = await open(ctx, st, st.beta, { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } });
    await page.click('#companyMenuBtn');
    await page.waitForSelector('#popover.popover--company:not([hidden]) .company-item');
    const s = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const pop = document.querySelector('#popover').getBoundingClientRect();
      return { listMax: cs('#popover .company-list').maxHeight, listOy: cs('#popover .company-list').overflowY, bodyOy: cs('#popover .pop-body').overflowY, width: pop.width, bottomFixed: cs('#popover').bottom };
    });
    assert(s.listMax === '340px' && s.listOy === 'auto' && s.bodyOy === 'auto' && Math.round(s.width) === 340, `desktop popover styles: ${JSON.stringify(s)}`);
  });

  for (const dev of [PHONES[1], PHONES[3]]) suite.test(`Fix company scroll: [beta ${dev.name}, touch] swipes that start on a row, a heading or a gap scroll the list, never the page, and reach the last company (Chromium CDP touch)`, async (ctx) => {
    if (ctx.browser.browserType?.().name() !== 'chromium') skip('real touch events need Chromium CDP');
    const st = await setup(ctx);
    const { page } = await open(ctx, st, st.beta, { device: phone(dev), saved: true });
    await openMenu(page);
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x, y, dy) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (dy * i) / 12 }] }); await sleep(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(700);
    };
    const state = () => page.evaluate(() => ({
      list: document.querySelector('#popover .company-list').scrollTop,
      body: document.querySelector('#popover .pop-body').scrollTop,
      page: (document.scrollingElement || document.documentElement).scrollTop,
      sheet: document.querySelector('#popover').getBoundingClientRect().top,
    }));
    const starts = await page.evaluate(() => {
      const list = document.querySelector('#popover .company-list').getBoundingClientRect();
      const bottom = Math.min(list.bottom, innerHeight);
      const inList = (e) => { const b = e.getBoundingClientRect(); return b.top >= list.top && b.bottom <= bottom - 30; };
      const row = [...document.querySelectorAll('#popover .company-list .company-item')].find(inList);
      const head = [...document.querySelectorAll('#popover .company-list .check-group')].find(inList);
      const pt = (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      return { row: row && pt(row), heading: head && pt(head), gap: { x: list.right - 3, y: list.top + 20 } };
    });
    for (const [what, at] of Object.entries(starts)) {
      if (!at) continue;
      await page.evaluate(() => { document.querySelector('#popover .company-list').scrollTop = 0; });
      const a = await state();
      await swipe(at.x, at.y, Math.min(160, at.y - 10));
      const b = await state();
      assert(b.list > a.list + 30, `a swipe on a ${what} scrolls the list (${a.list} → ${b.list})`);
      assert(b.page === a.page && b.body === a.body && Math.abs(b.sheet - a.sheet) < 1, `a swipe on a ${what} moves nothing else: ${JSON.stringify({ a, b })}`);
    }
    // Swipe on to the end: the last company is reachable by touch alone.
    for (let i = 0; i < 6; i++) await swipe(starts.row.x, starts.row.y + 20, Math.min(260, starts.row.y - 20));
    const g = await page.evaluate(() => {
      const list = document.querySelector('#popover .company-list');
      const last = [...list.querySelectorAll('.company-item')].pop().getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      return { atEnd: list.scrollTop + list.clientHeight >= list.scrollHeight - 2, last: [last.top, last.bottom], list: [lr.top, lr.bottom], innerHeight };
    });
    assert(g.atEnd && g.last[1] <= g.list[1] + 0.5 && g.last[1] <= g.innerHeight, `touch alone brings the last company fully on screen: ${JSON.stringify(g)}`);
  });
}

// Standalone: node test/e2e/fix-company-scroll.e2e.js [--browser=webkit|chromium] [--grep=re]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createSuite, loadPlaywright, findChromium } = await import('./harness.js');
  const engine = (process.argv.find((a) => a.startsWith('--browser=')) || '--browser=chromium').slice(10);
  const grepArg = process.argv.find((a) => a.startsWith('--grep='));
  const pw = await loadPlaywright();
  if (!pw) { console.error('fix-company-scroll: the `playwright` package was not found'); process.exit(2); }
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: findChromium() } : {});
  console.log(`fix-company-scroll: ${engine} ${browser.version()}`);
  const suite = createSuite();
  registerFixCompanyScrollTests(suite);
  const ctx = { data: {}, notes: [], cleanup: [], pw, browser };
  const results = await suite.run(ctx, grepArg ? new RegExp(grepArg.slice(7), 'i') : null);
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

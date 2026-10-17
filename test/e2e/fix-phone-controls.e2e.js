// Fix lane fix-phone-controls (docs/process/fix-phone-controls.md): controls on phones that gave no feedback,
// that a keyboard covered, or that could not be told apart, from the round-3 reviews of the beta site
// (docs/process/qa-mobile-beta-3.md, docs/REVIEW.md "beta review 2026-10-16", docs/process/ux-review-beta-2.md).
// The user, 2026-10-16: "The mobile page on the beta site is totally broken".
//
//   M-43   a tap on a first-page preview card (Amazon) opens the job page at once, with the card's own fields and
//          the rest "loading"; the whole page follows when the list lands, and Back / Escape / the close button work
//          while it loads.
//   A-11   preview cards take the list's keys (ArrowUp/Down, Enter), and focus stays on the same posting's card
//          when the whole list replaces the preview.
//   M-40   checklist rows whose names share a long start can be told apart: the end of the name stays visible
//          (two lines at most), and the whole name is the row's accessible name and its title.
//   A-10   the Company and Department checklists (and the other checklists) are named groups.
//   M-47   in landscape with the keyboard up, the Pay estimate title field moves above the keyboard.
//   UX-56  at side-sheet widths (861–1199 px) the closed filter sheet takes no keyboard focus (inert).
//   UX-57  the chart view's toolbar has 3 controls again: the stats line's Details is folded into the chart notes'
//          Details (the map keeps it, having no chart notes).
//
// Every phone change is checked on the phone-size matrix, test/e2e/phone-sizes.mjs (the user, 2026-10-16: "Make sure
// we check for all phone sizes from iPhone mini to razr to duo or something"): the folded Galaxy Fold (280x653) to
// the Surface Duo spanned (1114x720), the Razr cover screen (352x355) and landscapes.
//
// The tests serve the static build (FPC_DIST, else BETA_QA_DIST, else dist/) under /melon-seek/ the way GitHub Pages
// does (gzip), and skip without a beta build. Taps are real touch: CDP Input.dispatchTouchEvent in Chromium, first
// checked on the results sheet's handle; under WebKit, page.touchscreen.tap. The tests that need Chromium's CDP
// (4x CPU and Slow 4G for M-43) skip on other engines. Run alone, under either engine:
//   node test/e2e/fix-phone-controls.e2e.js [--browser=webkit|chromium] [--grep=re]
// FPC_SHOTS=1 saves a screenshot of each test's last state to docs/screenshots/fix-phone-controls/e2e-*.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, assert, skip } from './harness.js';
import { ALL_SIZES } from './phone-sizes.mjs';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
// The shared phone-size matrix (test/e2e/phone-sizes.mjs: 14 portrait phones and 5 postures), plus the landscapes
// the reviews used (M-47 was found at 844x390).
const named = (re) => ALL_SIZES.find((d) => re.test(d.name));
const P390 = named(/iPhone 13 \/ 14/);
const FOLD = named(/Fold \(folded\)/);
const RAZR_COVER = named(/razr \(cover/);
const DUO = named(/Surface Duo \(one/);
const DUO_SPANNED = named(/spanned/);
const RAZR_LAND = named(/razr \(inner, landscape/);
const EXTRA_LANDSCAPES = [
  { name: 'iPhone 13 / 14 (landscape)', width: 844, height: 390, dpr: 3, ua: IOS },
  { name: 'iPhone SE (1st gen, landscape)', width: 568, height: 320, dpr: 2, ua: IOS },
  { name: 'Galaxy Fold (folded, landscape)', width: 653, height: 280, dpr: 3, ua: ANDROID },
  { name: 'Surface Duo (one screen, landscape)', width: 720, height: 540, dpr: 2.5, ua: ANDROID },
];
const DESKTOP = { name: 'desktop', width: 1440, height: 900, desktop: true };
const D1024 = { name: 'desktop', width: 1024, height: 768, desktop: true };
const tag = (d) => `${d.name} ${d.width}x${d.height}`;
const isPhone = (d) => !d.desktop && d.width <= 860;
const device = (d, extra = {}) => (d.desktop
  ? { viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, ...extra }
  : { viewport: { width: d.width, height: d.height }, userAgent: d.ua || IOS, isMobile: true, hasTouch: true, deviceScaleFactor: d.dpr || 2, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180e3, uploadThroughput: 84e3 };
const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'fix-phone-controls');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const engineOf = (ctx) => ctx.browser.browserType?.().name?.() || 'chromium';

let shared = null;
/** Serve the build under /melon-seek/ (gzip, like Pages); null without a beta build with Amazon's list. */
async function serveDist() {
  if (shared) return shared;
  const dist = path.resolve(process.env.FPC_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs', 'amazon.json'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(u.pathname.slice('/melon-seek/'.length)); } catch { res.writeHead(400); return res.end(); }
    let p = path.join(dist, rel);
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(p)] || 'application/octet-stream';
    const body = fs.readFileSync(p);
    if (/text|javascript|json|svg|csv/.test(type) && body.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' });
      return res.end(zlib.gzipSync(body));
    }
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  shared = { dist, origin, beta: `${origin}/melon-seek/beta/`, main: `${origin}/melon-seek/` };
  return shared;
}

/** The earlier passes' simulated keyboard: the visual viewport is `kb` px shorter while a text field has focus. */
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

async function ready(page, timeout = 120000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(500);
}

/**
 * A fresh page on `d` at `hash` (beta site unless site: 'main'). hold: a RegExp of requests held back until
 * release(); throttle: 4x CPU and Slow 4G (Chromium only); keyboard: a simulated keyboard of that height.
 */
async function open(ctx, d, hash, { site = 'beta', theme = 'light', hold = null, wait = true, throttle = false, keyboard = 0 } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build with Amazon\'s list (npm run build, or FPC_DIST=<dir>)');
  const chromium = engineOf(ctx) === 'chromium';
  if (throttle && !chromium) skip('CPU and network throttling need Chromium\'s CDP');
  const context = await ctx.browser.newContext({ colorScheme: theme, ...device(d) });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  let release = () => {};
  if (hold) {
    const gate = new Promise((r) => { release = r; });
    await context.route(hold, async (route) => { await gate; await route.continue().catch(() => {}); });
  }
  if (keyboard) await context.addInitScript(KEYBOARD_INIT, keyboard);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = chromium ? await context.newCDPSession(page) : null;
  if (throttle) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.goto(`${site === 'main' ? st.main : st.beta}#${hash}`);
  if (wait) await ready(page);
  return { st, page, cdp, errors, release, context };
}

/** A real tap: CDP touch events in Chromium, page.touchscreen elsewhere; a mouse click on a desktop page. */
async function tap(page, cdp, d, x, y) {
  if (d.desktop) return page.mouse.click(x, y);
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  return page.touchscreen.tap(x, y);
}
async function tapSel(page, cdp, d, sel) {
  const b = await page.locator(`${sel} >> visible=true`).first().boundingBox();
  assert(b, `${sel} has no box`);
  await tap(page, cdp, d, b.x + b.width / 2, b.y + b.height / 2);
}
const sheetState = (page) => page.evaluate(() => document.body.dataset.sheet || '');
/** PLAYBOOK "Known traps": the touch path is checked on a control first. A tap on the sheet's handle moves the sheet. */
async function checkTouch(page, cdp, d) {
  const a = await sheetState(page);
  await tapSel(page, cdp, d, '#sheetHandle');
  await sleep(700);
  const b = await sheetState(page);
  assert(a !== b, `a real tap on the results sheet's handle moves the sheet (${a} → ${b}): the touch path works`);
}
/** The first card (preview or list) whose middle is on screen and not covered: { id, x, y, title }. */
function findCard(sel) {
  for (const c of document.querySelectorAll(sel)) {
    const b = c.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + Math.min(b.height / 2, 28);
    if (b.width < 10 || y < 2 || y > innerHeight - 4 || x < 0 || x > innerWidth) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && c.contains(hit)) return { id: c.dataset.previewId || c.dataset.id, x, y, title: c.querySelector('.card-title')?.textContent.trim() };
  }
  return null;
}
/** A preview card in view: on a phone the sheet is raised (peek → half → full) until one shows. */
async function previewCardInView(page, cdp, d) {
  let c = await page.evaluate(findCard, '#resultsList .card[data-preview-id]');
  for (let i = 0; !c && isPhone(d) && i < 2; i++) {
    await tapSel(page, cdp, d, '#sheetHandle');
    await sleep(700);
    c = await page.evaluate(findCard, '#resultsList .card[data-preview-id]');
  }
  return c;
}
/** The drawer's state: open, its title, whether it says it is loading, its hash and focus. */
const drawerState = (page) => page.evaluate(() => {
  const dr = document.querySelector('#drawer');
  const a = document.activeElement;
  return {
    open: !dr.hidden && dr.classList.contains('is-open'),
    title: dr.querySelector('#drawerTitle')?.textContent.trim() || '',
    busy: !!dr.querySelector('[aria-busy="true"]'),
    loading: /Loading/i.test(dr.innerText || ''),
    full: !!dr.querySelector('.d-salary') && !!dr.querySelector('.drawer-foot .apply'),
    pos: dr.querySelector('#drawerPos')?.textContent.trim() || '',
    hash: decodeURIComponent(location.hash),
    path: location.pathname,
    previewing: !!document.querySelector('#resultsList .card[data-preview-id]'),
    focus: !a || a === document.body ? 'body' : a.id ? `#${a.id}` : `${a.tagName.toLowerCase()}[${a.dataset?.id || a.dataset?.previewId || ''}]`,
  };
});
async function shot(page, name) {
  if (!process.env.FPC_SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await page.screenshot({ path: path.join(SHOTS, `e2e-${name}.png`), timeout: 15000 }); } catch { /* evidence only */ }
}
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

/** What a checklist row shows: its parts' visible text (an ellipsized part measured with the canvas). */
function shownRows(sel) {
  const c = document.createElement('canvas').getContext('2d');
  const shown = (el) => {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const cs = getComputedStyle(el);
    if (el.scrollWidth <= el.clientWidth + 1 || cs.overflowX === 'visible') return { text, cut: false };
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let k = text.length;
    while (k > 0 && c.measureText(text.slice(0, k) + '…').width > w) k--;
    return { text: `${text.slice(0, k).trimEnd()}…`, cut: true };
  };
  return [...document.querySelectorAll(sel)].filter((l) => l.getClientRects().length && l.getBoundingClientRect().width > 0).map((label) => {
    const parts = [...label.children].filter((e) => e.getClientRects().length);
    const bits = (parts.length ? parts : [label]).map(shown);
    const row = label.closest('label');
    const input = row?.querySelector('input');
    // The checkbox's name from its <label>: the name, then the count.
    const named = input?.labels?.[0]?.cloneNode(true);
    named?.querySelectorAll('.check-count').forEach((e) => e.remove());
    const lh = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.3;
    return {
      full: label.textContent.replace(/\s+/g, ' ').trim(),
      shown: bits.map((b) => b.text).join(' ').replace(/\s+/g, ' '),
      cut: bits.some((b) => b.cut),
      name: named?.textContent.replace(/\s+/g, ' ').trim() || '',
      value: input?.value || '',
      title: row?.title || label.title || '',
      lines: Math.round(label.getBoundingClientRect().height / lh),
      wrap: label.classList.contains('is-wrap'),
    };
  });
}
/** Press the department list's "Show all N" (the last one under `root`); true when there was one. */
const showAll = (page, root) => page.evaluate((root) => {
  const b = [...document.querySelectorAll(`${root} .more-btn`)].filter((x) => x.getClientRects().length && /Show all/.test(x.textContent)).pop();
  b?.click();
  return !!b;
}, root);
function assertRows(rows, where, { wrapOk = false } = {}) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.shown)) by.set(r.shown, new Set()); by.get(r.shown).add(r.full); }
  const twins = [...by].filter(([, f]) => f.size > 1).map(([v, f]) => `"${v}" stands for ${[...f].map((x) => `"${x}"`).join(' and ')}`);
  assert(!twins.length, `${where}: ${twins.length} visible label(s) stand for more than one name:\n  ${twins.slice(0, 8).join('\n  ')}`);
  const unnamed = rows.filter((r) => r.name.replace(/\s+/g, '') !== r.full.replace(/\s+/g, ''));
  assert(!unnamed.length, `${where}: a row's accessible name is not its whole name: ${unnamed.slice(0, 3).map((r) => `"${r.name}" for "${r.full}"`).join(', ')}`);
  const untitled = rows.filter((r) => r.cut && r.title !== r.full);
  assert(!untitled.length, `${where}: a cut row's title is not its whole name: ${untitled.slice(0, 3).map((r) => `"${r.shown}" (title "${r.title}")`).join(', ')}`);
  const tall = rows.filter((r) => r.lines > 2 && !(wrapOk && r.wrap));
  assert(!tall.length, `${where}: rows taller than two lines: ${tall.slice(0, 3).map((r) => `"${r.full}" (${r.lines})`).join(', ')}`);
}

export function registerFixPhoneControlsTests(suite) {
  // ------------------------------------------------------------------ M-43
  suite.test('Fix phone controls: [M-43] Slow 4G, 4x CPU, 390x844: a tap on an Amazon preview card opens its job page at once (title, details loading); the whole page follows when the list lands; Back returns focus to the card (Chromium CDP touch)', async (ctx) => {
    const d = P390;
    const { page, cdp } = await open(ctx, d, 'c=amazon', { wait: false, throttle: true });
    await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 90000 });
    await checkTouch(page, cdp, d);
    const c = await previewCardInView(page, cdp, d);
    assert(c, 'a preview card is on screen');
    const t0 = Date.now();
    await tap(page, cdp, d, c.x, c.y);
    await sleep(400);
    const s = await drawerState(page);
    if (!s.previewing && !s.open) skip('the whole list landed before the tap (machine too fast for this check)');
    await shot(page, 'M-43-slow-4g-tap');
    assert(s.open, `400 ms after the tap on "${c.title}" the job page is not open: nothing shows the tap was heard (${JSON.stringify(s)})`);
    assert(s.title === c.title, `the job page shows the tapped card's title ("${s.title}" for "${c.title}")`);
    if (s.previewing) assert(s.busy && s.loading, `while the list loads, the job page says its details are loading: ${JSON.stringify(s)}`);
    await page.waitForFunction(() => document.querySelector('#resultsList .card[data-id]'), null, { timeout: 90000 });
    await page.waitForFunction(() => { const dr = document.querySelector('#drawer'); return !dr.querySelector('[aria-busy="true"]') && dr.querySelector('.drawer-foot .apply'); }, null, { timeout: 30000 });
    await sleep(500);
    const f = await drawerState(page);
    console.log(`      the job page opened within 400 ms of the tap; the whole page ${((Date.now() - t0) / 1000).toFixed(1)} s after it`);
    assert(f.open && f.full && f.title === c.title && f.hash.includes(`job=${c.id}`), `the whole job page for the same posting follows: ${JSON.stringify(f)}`);
    assert(f.focus === '#drawerClose', `focus is on the job page's Back button (${f.focus})`);
    await tapSel(page, cdp, d, '#drawerClose');
    await sleep(600);
    const b = await drawerState(page);
    assert(!b.open && !b.hash.includes('job='), `Back closes the job page: ${JSON.stringify(b)}`);
    assert(b.focus === `article[${c.id}]`, `focus returns to the posting's card (${b.focus})`);
  });

  for (const d of [...ALL_SIZES, DESKTOP]) {
    suite.test(`Fix phone controls: [M-43] [${tag(d)}] while Amazon's list loads, a tap on a preview card opens its job page at once; the whole page replaces it when the list lands`, async (ctx) => {
      const { page, cdp, release, errors } = await open(ctx, d, 'c=amazon', { hold: /\/api\/jobs\/amazon\.json/, wait: false });
      const shown = await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 60000 }).then(() => true, () => false);
      if (!shown) { release(); skip('no first-page preview for Amazon in this build'); }
      await sleep(400);
      if (isPhone(d)) await checkTouch(page, cdp, d);
      const c = await previewCardInView(page, cdp, d);
      assert(c, 'a preview card is on screen');
      await tap(page, cdp, d, c.x, c.y);
      await sleep(400);
      const s = await drawerState(page);
      await shot(page, `M-43-${slug(tag(d))}-loading`);
      assert(s.previewing, 'the list is still held back');
      assert(s.open && s.title === c.title, `400 ms after the tap on "${c.title}" its job page is open with its title: ${JSON.stringify(s)}`);
      assert(s.busy && s.loading, `the job page says its details are loading: ${JSON.stringify(s)}`);
      assert(s.hash.includes(`job=${c.id}`), `the job page has its own history entry (${s.hash})`);
      const total = await page.evaluate(() => (/Loading ([\d,]+) roles/.exec(document.querySelector('#resultsTitle').textContent) || [])[1]);
      assert(total && s.pos.endsWith(`of ${total}`), `its place is out of the whole board ("${s.pos}", board ${total})`);
      release();
      await ready(page);
      await page.waitForFunction(() => document.querySelector('#drawer .drawer-foot .apply') && !document.querySelector('#drawer [aria-busy="true"]'), null, { timeout: 30000 });
      const f = await drawerState(page);
      assert(f.open && f.full && f.title === c.title, `the whole job page for "${c.title}" replaces the loading one: ${JSON.stringify(f)}`);
      if (d.desktop) await page.keyboard.press('Escape'); else await tapSel(page, cdp, d, '#drawerClose');
      await sleep(600);
      const b = await drawerState(page);
      assert(!b.open && !b.hash.includes('job='), `the job page closes: ${JSON.stringify(b)}`);
      assert(b.focus === `article[${c.id}]`, `focus is back on the posting's card (${b.focus})`);
      assert(!errors.length, errors.join(' | '));
    });
  }

  for (const [d, how] of [[P390, 'Back button'], [P390, 'browser Back'], [RAZR_COVER, 'Back button'], [DESKTOP, 'Escape']]) {
    suite.test(`Fix phone controls: [M-43] [${tag(d)}] a loading job page closed with the ${how} stays closed when the list lands, and the page stays`, async (ctx) => {
      const { page, cdp, release } = await open(ctx, d, 'c=amazon', { hold: /\/api\/jobs\/amazon\.json/, wait: false });
      const shown = await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 60000 }).then(() => true, () => false);
      if (!shown) { release(); skip('no first-page preview for Amazon in this build'); }
      await sleep(400);
      const c = await previewCardInView(page, cdp, d);
      assert(c, 'a preview card is on screen');
      await tap(page, cdp, d, c.x, c.y);
      await sleep(500);
      const s = await drawerState(page);
      assert(s.open, `the tap opened the job page: ${JSON.stringify(s)}`);
      if (how === 'Escape') await page.keyboard.press('Escape');
      else if (how === 'browser Back') await page.evaluate(() => history.back());
      else await tapSel(page, cdp, d, '#drawerClose');
      await sleep(700);
      const b = await drawerState(page);
      assert(!b.open && !b.hash.includes('job=') && b.path === s.path && b.hash.includes('c=amazon'), `the ${how} closes the job page and keeps the page: ${JSON.stringify(b)}`);
      release();
      await ready(page);
      await sleep(1200);
      const a = await drawerState(page);
      assert(!a.open && !a.hash.includes('job='), `once the list lands the job page stays closed: ${JSON.stringify(a)}`);
    });
  }

  // ------------------------------------------------------------------ A-11
  for (const d of [DESKTOP, D1024, DUO_SPANNED]) {
    suite.test(`Fix phone controls: [A-11] [${tag(d)}] preview cards take the list's keys (ArrowDown/Up, Enter, Escape), and focus stays on the same posting when the whole list replaces the preview`, async (ctx) => {
      const { page, release } = await open(ctx, d, 'c=amazon', { hold: /\/api\/jobs\/amazon\.json/, wait: false });
      const shown = await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 60000 }).then(() => true, () => false);
      if (!shown) { release(); skip('no first-page preview for Amazon in this build'); }
      await sleep(400);
      const ids = await page.evaluate(() => [...document.querySelectorAll('#resultsList .card[data-preview-id]')].slice(0, 6).map((c) => c.dataset.previewId));
      const focused = () => page.evaluate(() => document.activeElement?.dataset?.previewId || document.activeElement?.dataset?.id || (document.activeElement === document.body ? 'body' : document.activeElement?.id || document.activeElement?.tagName));
      await page.evaluate((id) => document.querySelector(`#resultsList .card[data-preview-id="${CSS.escape(id)}"]`).focus(), ids[2]);
      await page.keyboard.press('ArrowDown');
      await sleep(150);
      assert((await focused()) === ids[3], `ArrowDown on preview card 3 moves to card 4 (focus on ${await focused()})`);
      await page.keyboard.press('ArrowUp');
      await sleep(150);
      assert((await focused()) === ids[2], `ArrowUp moves back to card 3 (focus on ${await focused()})`);
      const ring = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { fv: a.matches(':focus-visible'), ring: cs.boxShadow !== 'none' || cs.outlineStyle !== 'none' }; });
      assert(ring.fv && ring.ring, `the focused preview card shows the focus ring: ${JSON.stringify(ring)}`);
      await page.keyboard.press('Enter');
      await sleep(400);
      const s = await drawerState(page);
      assert(s.open && s.busy && s.focus === '#drawerClose', `Enter opens the loading job page with focus on its close button: ${JSON.stringify(s)}`);
      await page.keyboard.press('Escape');
      await sleep(500);
      const e = await drawerState(page);
      assert(!e.open && (await focused()) === ids[2], `Escape closes it and focus returns to preview card 3: ${JSON.stringify(e)}, focus ${await focused()}`);
      await page.keyboard.press('ArrowDown');
      await sleep(150);
      await shot(page, `A-11-${slug(tag(d))}-preview-focus`);
      release();
      await ready(page);
      await sleep(800);
      const after = await page.evaluate(() => { const a = document.activeElement; return a?.matches?.('.card[data-id]') ? a.dataset.id : a === document.body ? 'body' : `${a?.tagName} ${a?.id || a?.className}`; });
      assert(after === ids[3], `focus was on preview card 4 (${ids[3]}); after the whole list landed it is on ${after}`);
      await page.keyboard.press('ArrowDown');
      await sleep(150);
      assert((await focused()) === ids[4], `ArrowDown then goes on in the whole list (focus on ${await focused()})`);
    });
  }

  // ------------------------------------------------------------------ M-40
  for (const d of [...ALL_SIZES, EXTRA_LANDSCAPES[0], DESKTOP]) {
    suite.test(`Fix phone controls: [M-40] [${tag(d)}] Amazon's departments can be told apart in the Department list ("…--Technical" and "…--Non-Tech"), at most two lines each, the whole name spoken`, async (ctx) => {
      const { page, cdp } = await open(ctx, d, 'c=amazon');
      let sel;
      if (isPhone(d)) {
        await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').scrollIntoView({ inline: 'center' }));
        await sleep(200);
        await tapSel(page, cdp, d, '#quickChips [data-pop=dept]');
        await sleep(1000);
        sel = '#filterBody details.fsec[open] .dept-filter label.check .check-label';
      } else {
        await page.click('#quickChips [data-pop=dept]');
        await page.waitForSelector('#popover .dept-filter label.check');
        await sleep(300);
        sel = '#popover .dept-filter label.check .check-label';
      }
      if (await showAll(page, sel.split(' label.check')[0])) await sleep(400);
      const rows = await page.evaluate(shownRows, sel);
      assert(rows.some((r) => /--Technical$/.test(r.full)) && rows.some((r) => /--Non-Tech$/.test(r.full)), `the build has Amazon's two "Project/Program/Product Management--…" departments (${rows.length} rows)`);
      const twin = rows.find((r) => /--Technical$/.test(r.full));
      await page.evaluate(({ sel, full }) => [...document.querySelectorAll(sel)].find((e) => e.textContent.replace(/\s+/g, ' ').trim() === full)?.scrollIntoView({ block: 'center' }), { sel, full: twin.full });
      await shot(page, `M-40-${slug(tag(d))}-amazon`);
      assertRows(rows, `${tag(d)} Amazon`);
    });
  }
  for (const d of [FOLD, P390, DESKTOP]) {
    suite.test(`Fix phone controls: [M-40] [${tag(d)}] Anduril's "Hardware Operations : Supply Chain : …" departments (main site, all of them) can be told apart`, async (ctx) => {
      const st = await serveDist();
      if (!st || !fs.existsSync(path.join(st.dist, 'api', 'jobs', 'anduril.json'))) skip('no Anduril list in this build');
      const { page, cdp } = await open(ctx, d, 'c=anduril', { site: 'main' });
      let root;
      if (isPhone(d)) {
        await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').scrollIntoView({ inline: 'center' }));
        await sleep(200);
        await tapSel(page, cdp, d, '#quickChips [data-pop=dept]');
        await sleep(1000);
        root = '#filterBody details.fsec[open] .dept-filter';
      } else {
        await page.click('#quickChips [data-pop=dept]');
        await page.waitForSelector('#popover .dept-filter label.check');
        root = '#popover .dept-filter';
      }
      if (await showAll(page, root)) await sleep(600);
      const rows = await page.evaluate(shownRows, `${root} label.check .check-label`);
      assert(rows.filter((r) => /^Hardware Operations : Supply Chain : /.test(r.full)).length >= 2, `Anduril has several "Hardware Operations : Supply Chain : …" departments (${rows.length} rows)`);
      await page.evaluate((root) => [...document.querySelectorAll(`${root} .check-label`)].find((e) => /^Hardware Operations : Supply Chain/.test(e.textContent))?.scrollIntoView({ block: 'center' }), root);
      await shot(page, `M-40-${slug(tag(d))}-anduril`);
      assertRows(rows, `${tag(d)} Anduril`, { wrapOk: true });
      console.log(`      ${rows.length} rows: ${rows.filter((r) => r.wrap).length} wrap whole, ${rows.filter((r) => r.cut).length} cut in two parts`);
    });
  }

  // ------------------------------------------------------------------ A-10
  for (const d of [DESKTOP, P390, FOLD]) {
    suite.test(`Fix phone controls: [A-10] [${tag(d)}] the Company and Department checklists (and Location, Seniority, Employment type) are named groups, in the filter panel and the Department menu`, async (ctx) => {
      const { page, cdp } = await open(ctx, d, 'c=google');
      const names = () => page.evaluate(() => [...document.querySelectorAll('#filters [role=group].checklist, #popover [role=group].checklist')].filter((g) => g.getClientRects().length || g.closest('details')).map((g) => {
        const ids = (g.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
        const name = (g.getAttribute('aria-label') || ids.map((id) => document.getElementById(id)?.textContent.trim() || '').join(' ')).trim();
        return { name, first: g.querySelector('input')?.value || '', where: g.closest('#popover') ? 'menu' : 'panel' };
      }));
      if (isPhone(d)) { await tapSel(page, cdp, d, '#filtersToggle'); await sleep(900); }
      await page.evaluate(() => document.querySelectorAll('#filterBody details').forEach((x) => { x.open = true; }));
      await sleep(400);
      const panel = await names();
      const has = (list, n) => list.some((g) => g.name === n);
      assert(has(panel, 'Company') && has(panel, 'Department'), `the panel's Company and Department lists are named: ${JSON.stringify(panel)}`);
      for (const n of ['Location', 'Seniority', 'Employment type']) assert(has(panel, n), `the panel's ${n} list is named: ${JSON.stringify(panel)}`);
      const unnamed = panel.filter((g) => !g.name);
      assert(!unnamed.length, `unnamed checklists: ${JSON.stringify(unnamed)}`);
      if (!isPhone(d)) {
        await page.click('#quickChips [data-pop=dept]');
        await page.waitForSelector('#popover .dept-filter [role=group]');
        const menu = (await names()).filter((g) => g.where === 'menu');
        assert(has(menu, 'Company') && has(menu, 'Department') && menu.every((g) => g.name), `the Department menu's lists are named: ${JSON.stringify(menu)}`);
      }
      await shot(page, `A-10-${slug(tag(d))}-google`);
    });
  }
  suite.test('Fix phone controls: [A-10] [desktop 1440x900] a one-company board\'s Department checklist is named "Department" (its heading is hidden)', async (ctx) => {
    const { page } = await open(ctx, DESKTOP, 'c=amazon');
    const g = await page.evaluate(() => [...document.querySelectorAll('#filters .dept-filter [role=group]')].filter((x) => x.getClientRects().length).map((x) => {
      const ids = (x.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      return (x.getAttribute('aria-label') || ids.map((id) => document.getElementById(id)?.textContent.trim() || '').join(' ')).trim();
    }));
    assert(g.length === 1 && g[0] === 'Department', `Amazon's one visible department checklist is named "Department": ${JSON.stringify(g)}`);
  });

  // ------------------------------------------------------------------ M-47
  const kbOf = (d) => Math.round(d.height > d.width ? Math.min(300, d.height * 0.42) : d.height * 0.49);
  for (const d of [...EXTRA_LANDSCAPES, ...ALL_SIZES]) {
    suite.test(`Fix phone controls: [M-47] [${tag(d)}, keyboard ${kbOf(d)} px] a tap on the Pay estimate title field brings it above the keyboard`, async (ctx) => {
      const kb = kbOf(d);
      const { page, cdp } = await open(ctx, d, 'c=amazon&m=insights', { keyboard: kb });
      await page.waitForSelector('#compHost input.ms-comp__input', { timeout: 60000 });
      await sleep(1200);
      const field = page.locator('#compHost input.ms-comp__input >> visible=true').first();
      await field.evaluate((e) => e.scrollIntoView({ block: 'end' }));
      await sleep(300);
      const b = await field.boundingBox();
      await tap(page, cdp, d, b.x + Math.min(40, b.width / 2), b.y + b.height / 2);
      await sleep(1000);
      const r = await field.evaluate((e) => {
        const b = e.getBoundingClientRect();
        let box = e.parentElement;
        while (box && box !== document.body && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
        const bb = box && box !== document.body ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
        const vv = visualViewport;
        const label = e.labels?.[0]?.getBoundingClientRect();
        return { focused: document.activeElement === e, top: Math.round(b.top), bottom: Math.round(b.bottom), labelTop: label ? Math.round(label.top) : null, vvTop: Math.round(vv.offsetTop), vvBottom: Math.round(vv.offsetTop + vv.height), boxTop: Math.round(bb.top), boxBottom: Math.round(bb.bottom), page: (document.scrollingElement || document.documentElement).scrollTop, innerHeight };
      });
      await shot(page, `M-47-${slug(tag(d))}-keyboard`);
      assert(r.focused, 'the field has focus');
      assert(r.vvBottom < r.innerHeight - 50, `the simulated keyboard is up (${JSON.stringify(r)})`);
      assert(r.top >= r.vvTop && r.bottom <= r.vvBottom, `the field (${r.top}–${r.bottom}) is under the keyboard: only ${r.vvTop}–${r.vvBottom} is visible`);
      assert(r.top >= r.boxTop - 1 && r.bottom <= r.boxBottom + 1, `the field is inside its scroll box (${r.boxTop}–${r.boxBottom}), not clipped: ${JSON.stringify(r)}`);
      assert(r.page === 0, `the page itself did not scroll (${r.page})`);
      // The keyboard goes down: the top bar and the quick filters are back.
      await page.evaluate(() => document.activeElement?.blur());
      await sleep(900);
      const bars = await page.evaluate(() => ['.topbar', '.quickbar'].map((s) => document.querySelector(s).getClientRects().length > 0));
      assert(bars.every(Boolean), `with the keyboard down the top bar and quick filters show again (${bars})`);
    });
  }

  // ------------------------------------------------------------------ UX-56
  for (const d of [D1024, { name: 'desktop', width: 900, height: 700, desktop: true }, { name: 'desktop', width: 1199, height: 800, desktop: true }, DUO_SPANNED, RAZR_LAND]) {
    suite.test(`Fix phone controls: [UX-56] [${tag(d)}] the closed filter side sheet takes no keyboard focus; opened, it does; Escape closes it back to Filters`, async (ctx) => {
      const { page } = await open(ctx, d, 'c=google');
      const closed = await page.evaluate(() => { const r = document.querySelector('#filters').getBoundingClientRect(); return r.right <= 0 || r.left >= innerWidth; });
      assert(closed, 'the filter sheet is closed, off screen, at this width');
      const tabs = async (n) => {
        const hits = [];
        for (let i = 0; i < n; i++) {
          await page.keyboard.press('Tab');
          const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); return { inFilters: !!e.closest('#filters'), name: (e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30), on: r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight }; });
          if (f) hits.push(f);
        }
        return hits;
      };
      const before = await tabs(70);
      const bad = before.filter((f) => f.inFilters || !f.on);
      const inert = await page.evaluate(() => ({ inert: document.querySelector('#filters').inert, hidden: document.querySelector('#filters').getAttribute('aria-hidden') }));
      assert(!bad.length, `Tab stops on controls of the closed, off-screen sheet: ${[...new Set(bad.map((f) => `"${f.name}"`))].join(', ')} (${JSON.stringify(inert)})`);
      assert(inert.inert && inert.hidden === 'true', `the closed sheet is inert and hidden from screen readers: ${JSON.stringify(inert)}`);
      await page.click('#filtersToggle');
      await sleep(500);
      const o = await page.evaluate(() => ({ inert: document.querySelector('#filters').inert, hidden: document.querySelector('#filters').getAttribute('aria-hidden'), focusIn: !!document.activeElement?.closest('#filters') }));
      assert(!o.inert && o.hidden !== 'true' && o.focusIn, `opened, the sheet takes focus: ${JSON.stringify(o)}`);
      await shot(page, `UX-56-${slug(tag(d))}-open`);
      await page.keyboard.press('Escape');
      await sleep(500);
      const c = await page.evaluate(() => ({ inert: document.querySelector('#filters').inert, focus: document.activeElement?.id }));
      assert(c.inert && c.focus === 'filtersToggle', `Escape closes it, inert again, focus on Filters: ${JSON.stringify(c)}`);
    });
  }
  suite.test('Fix phone controls: [UX-56] [desktop 1440x900 ↔ 1024x768] the docked filter column is never inert; resizing to a side sheet makes the closed sheet inert, and back', async (ctx) => {
    const { page } = await open(ctx, DESKTOP, 'c=google');
    const state = () => page.evaluate(() => ({ inert: document.querySelector('#filters').inert, hidden: document.querySelector('#filters').getAttribute('aria-hidden') }));
    let s = await state();
    assert(!s.inert && s.hidden !== 'true', `docked at 1440 px the filter column is live: ${JSON.stringify(s)}`);
    let reach = false;
    for (let i = 0; i < 40 && !reach; i++) { await page.keyboard.press('Tab'); reach = await page.evaluate(() => !!document.activeElement?.closest('#filters')); }
    assert(reach, 'Tab reaches the docked filter column');
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(600);
    s = await state();
    assert(s.inert && s.hidden === 'true', `at 1024 px the closed side sheet is inert: ${JSON.stringify(s)}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(600);
    s = await state();
    assert(!s.inert && s.hidden !== 'true', `back at 1440 px the docked column is live again: ${JSON.stringify(s)}`);
  });
  suite.test('Fix phone controls: [UX-56] [iPhone 390x844] the phone filter sheet still opens as a dialog with focus inside, and closes back to Filters', async (ctx) => {
    const d = P390;
    const { page, cdp } = await open(ctx, d, 'c=google');
    assert(await page.evaluate(() => document.querySelector('#filters').inert), 'the closed phone sheet is inert');
    await tapSel(page, cdp, d, '#filtersToggle');
    await sleep(900);
    const o = await page.evaluate(() => ({ inert: document.querySelector('#filters').inert, role: document.querySelector('#filters').getAttribute('role'), focusIn: !!document.activeElement?.closest('#filters'), mainInert: document.querySelector('#main').inert }));
    assert(!o.inert && o.role === 'dialog' && o.focusIn && o.mainInert, `the open phone sheet is a modal dialog with focus inside: ${JSON.stringify(o)}`);
    await tapSel(page, cdp, d, '#filtersClose');
    await sleep(700);
    const c = await page.evaluate(() => ({ inert: document.querySelector('#filters').inert, focus: document.activeElement?.id, mainInert: document.querySelector('#main').inert }));
    assert(c.inert && !c.mainInert && c.focus === 'filtersToggle', `closed: inert again, the page live, focus on Filters: ${JSON.stringify(c)}`);
  });

  // ------------------------------------------------------------------ UX-57
  const toolbar = () => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const tb = document.querySelector('#vizToolbar');
    return {
      shown: vis(tb),
      controls: [...tb.querySelectorAll('button, select, a[href], input')].filter(vis).map((e) => (e.tagName === 'SELECT' ? 'Group select' : (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24))),
      statsDetails: [...document.querySelectorAll('#statsLine .ms-note__more')].filter(vis).length,
      stats: document.querySelector('#statsLine')?.innerText.replace(/\s+/g, ' ').trim(),
    };
  };
  /** The chart notes' Details items (opened), and the stats line's numbers. */
  const chartNotes = async (page) => {
    const btn = page.locator('#chartHost .ms-note__more >> visible=true').first();
    if (!(await btn.count())) return null;
    if ((await btn.getAttribute('aria-expanded')) !== 'true') { await btn.click(); await sleep(250); }
    return page.evaluate(() => [...document.querySelectorAll('#chartHost .ms-note__list li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
  };
  for (const d of [DESKTOP, D1024, DUO_SPANNED, RAZR_LAND, P390, FOLD, DUO, RAZR_COVER]) {
    suite.test(`Fix phone controls: [UX-57] [${tag(d)}] the chart view's toolbar has 3 controls (no Details on the stats line); its facts are in the chart notes' Details`, async (ctx) => {
      const { page } = await open(ctx, d, 'c=amazon');
      await page.waitForSelector('#chartHost .ms-note__more', { state: 'attached', timeout: 30000 }).catch(() => {});
      await sleep(800);
      const t = await page.evaluate(toolbar);
      await shot(page, `UX-57-${slug(tag(d))}-chart`);
      assert(t.statsDetails === 0, `the stats line has its own Details button (toolbar: ${t.controls.join(', ')})`);
      assert(t.controls.length <= 3, `the chart view's toolbar has ${t.controls.length} controls: ${t.controls.join(', ')}`);
      // The facts stay one tap away wherever the stats line shows: in the chart notes' Details. A short landscape
      // layout shows neither line (styles.css: rows matter more there), and then there is nothing to fold.
      const shown = await page.evaluate(() => ({ stats: document.querySelector('#statsLine').getClientRects().length > 0, notes: (document.querySelector('#chartHost .ms-chart__foot')?.getClientRects().length || 0) > 0 }));
      if (!shown.stats && !shown.notes) { console.log('      note: this layout shows neither the stats line nor the chart notes'); return; }
      assert(shown.notes, `the stats line shows but the chart notes, which hold its facts, do not: ${JSON.stringify(shown)}`);
      const notes = await chartNotes(page);
      assert(notes, 'the chart notes have a Details list');
      assert(notes.some((n) => /^The median is base pay/.test(n)), `the stats line's facts are in the chart notes' Details: ${JSON.stringify(notes)}`);
      assert(notes.some((n) => /^Half of these roles pay between/.test(n)), `the middle half is in the chart notes' Details: ${JSON.stringify(notes)}`);
    });
  }
  suite.test('Fix phone controls: [UX-57] [desktop 1440x900] the folded facts follow a filter and a picked cluster (the stats line\'s count)', async (ctx) => {
    const { page } = await open(ctx, DESKTOP, 'c=amazon');
    const check = async (label) => {
      await sleep(900);
      const count = await page.evaluate(() => document.querySelector('#statsLine .stat--count strong')?.textContent.trim());
      const notes = await chartNotes(page);
      const share = (notes || []).find((n) => /roles show pay/.test(n)) || '';
      assert(count && share.includes(`of ${count} roles show pay`), `${label}: the stats line counts ${count}; the chart notes say "${share}"`);
    };
    await check('the whole board');
    await page.goto('about:blank');
    await page.goto(`${(await serveDist()).beta}#c=amazon&r=remote`);
    await ready(page);
    await check('Remote only');
    const bin = page.locator('#chartHost .ms-bin >> visible=true').first();
    if (await bin.count()) {
      await bin.click();
      await sleep(600);
      const area = await page.evaluate(() => !!document.querySelector('.area-chip'));
      if (area) await check('a picked cluster');
    }
  });
  for (const d of [DESKTOP, P390]) {
    suite.test(`Fix phone controls: [UX-57] [${tag(d)}] in Map view (no chart notes) the stats line keeps its Details, with the same facts`, async (ctx) => {
      const { page } = await open(ctx, d, 'c=amazon&m=map');
      await sleep(1200);
      const t = await page.evaluate(toolbar);
      assert(t.statsDetails === 1, `the map's stats line has its Details: ${JSON.stringify(t)}`);
      const btn = page.locator('#statsLine .ms-note__more');
      await btn.click();
      await sleep(250);
      const items = await page.evaluate(() => [...document.querySelectorAll('#statsLine .ms-note__list li')].map((li) => li.textContent.trim()));
      assert(items.some((n) => /^The median is base pay/.test(n)), `the facts are there: ${JSON.stringify(items)}`);
    });
  }

  // ------------------------------------------------------------------ guards (pass before and after)
  suite.test('Fix phone controls: guard: [desktop 1440x900] with the whole list, ArrowDown moves card to card, Enter opens, Escape closes back to the card', async (ctx) => {
    const { page } = await open(ctx, DESKTOP, 'c=apple');
    const ids = await page.evaluate(() => [...document.querySelectorAll('#resultsList .card[data-id]')].slice(0, 3).map((c) => c.dataset.id));
    await page.evaluate((id) => document.querySelector(`#resultsList .card[data-id="${CSS.escape(id)}"]`).focus(), ids[0]);
    await page.keyboard.press('ArrowDown');
    await sleep(150);
    assert((await page.evaluate(() => document.activeElement?.dataset?.id)) === ids[1], 'ArrowDown moves to the next card');
    await page.keyboard.press('Enter');
    await sleep(500);
    const s = await drawerState(page);
    assert(s.open && s.full && s.focus === '#drawerClose', `Enter opens the job page: ${JSON.stringify(s)}`);
    await page.keyboard.press('Escape');
    await sleep(500);
    assert((await page.evaluate(() => document.activeElement?.dataset?.id)) === ids[1], 'Escape closes it back to the card');
  });
}

// Standalone: node test/e2e/fix-phone-controls.e2e.js [--browser=webkit|chromium] [--grep=re]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createSuite, loadPlaywright, findChromium } = await import('./harness.js');
  const engine = (process.argv.find((a) => a.startsWith('--browser=')) || '--browser=chromium').slice(10);
  const grepArg = process.argv.find((a) => a.startsWith('--grep='));
  const pw = await loadPlaywright();
  if (!pw) { console.error('fix-phone-controls: the `playwright` package was not found'); process.exit(2); }
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: findChromium() } : {});
  console.log(`fix-phone-controls: ${engine} ${browser.version()}`);
  const suite = createSuite();
  registerFixPhoneControlsTests(suite);
  const ctx = { data: {}, notes: [], cleanup: [], pw, browser };
  const results = await suite.run(ctx, grepArg ? new RegExp(grepArg.slice(7), 'i') : null);
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
  if (failed.length) for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(failed.length ? 1 : 0);
}

// Fix lane fix-phone-sizes (docs/process/fix-phone-sizes.md): every phone size and posture in test/e2e/phone-sizes.mjs,
// from the folded Galaxy Fold (280 px) to the Surface Duo spanned (1114 px), the Razr cover screen and landscape.
// The user, 2026-10-16: "The mobile page on the beta site is totally broken" and "Make sure we check for all phone
// sizes from iPhone mini to razr to duo or something".
//
// On each size, for the apple, amazon and google boards of the beta site (PHONE_MATRIX_BOARDS to change), the hard
// checks of test/e2e/webkit/phone-smoke.mjs and more:
//   - no page error; job cards;
//   - the page is no wider than the screen (no horizontal scroll, and innerWidth is the screen's: a phone zooms out a
//     wider page, so innerWidth grows past the screen);
//   - the company name's whole text is visible (scrollWidth <= clientWidth + 0.5, and its text box no wider than its box);
//   - every main control (company menu, search, Filters, Chart / Map / Insights, Clusters / Ranges, Group, Sort, and the
//     results sheet's handle on phone layouts) is on screen and not covered (the element at three points across it is
//     the control);
//   - no control or text box runs past a side of the screen (the Group select and the tagline at 280 px), outside the
//     rows that scroll sideways on purpose;
//   - the first card, the job page (one job open) and the filter sheet each fit the width with no horizontal scroll.
// Then a name sweep (every width from 280 to 860 px), desktop and tablet sizes, and the Surface Duo spanned with its
// hinge emulated (Chromium CDP): chart and filters on the left screen, the list and the job page on the right, and
// nothing on the hinge.
//
// Serves the static build (PHONE_MATRIX_DIST, else BETA_QA_DIST, else dist/) under /melon-seek/ and skips without a beta
// build. Every case uses standard Playwright APIs and runs under any engine except the fold test, which needs
// Chromium's CDP (Emulation.setDeviceMetricsOverride with a displayFeature) and skips elsewhere. Run alone:
//   node test/e2e/phone-matrix.e2e.js [--browser=webkit|chromium] [--grep=re]
// PHONE_MATRIX_SHOTS=<label> saves the Apple board's first screen at every size (light; dark too for the three smallest
// and the Duo spanned) to docs/screenshots/fix-phone-sizes/<label>-*.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, assert, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';

const BOARDS = (process.env.PHONE_MATRIX_BOARDS || 'apple,amazon,google').split(',').map((s) => s.trim()).filter(Boolean);
const SHOTS = process.env.PHONE_MATRIX_SHOTS || '';
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots', 'fix-phone-sizes');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
// The Surface Duo's hinge when spanned: two 540 px screens with 34 px between them.
const DUO = { width: 1114, height: 720, dpr: 2.5, fold: { offset: 540, maskLength: 34 } };
const DESKTOP = [
  { name: 'Desktop 1440x900', width: 1440, height: 900 },
  { name: 'Laptop 1280x800', width: 1280, height: 800 },
  { name: 'Small laptop 1024x768', width: 1024, height: 768 },
  { name: 'Tablet portrait 768x1024', width: 768, height: 1024, touch: true },
];

let shared = null;
/** Serve the build under /melon-seek/ (gzip, like Pages); null without a beta build. One server for the whole run. */
async function serveDist() {
  if (shared) return shared;
  const dist = path.resolve(process.env.PHONE_MATRIX_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html'))) return null;
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
    const gz = /text|javascript|json|svg|csv/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '') && body.length > 1024;
    res.writeHead(200, { 'content-type': type, ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gz ? zlib.gzipSync(body) : body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  shared = { dist, origin, base: `${origin}/melon-seek/`, close: () => new Promise((r) => server.close(r)) };
  return shared;
}

const engineOf = (ctx) => ctx.browser.browserType?.().name?.() || 'chromium';

/**
 * A fresh page for one size: `size` is a phone-sizes.mjs entry, or { width, height, touch } for desktop and tablet.
 * fold: emulate the Duo's hinge (Chromium CDP). Waits until the board's whole list is on screen.
 */
async function open(ctx, size, { board = 'apple', site = 'beta/', colorScheme = 'light', fold = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build writes dist/beta/)');
  const engine = engineOf(ctx);
  const opts = size.ua ? contextFor(size, engine) : { viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, hasTouch: !!size.touch };
  const context = await ctx.browser.newContext({ ...opts, colorScheme });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e && e.message || e).slice(0, 300)}`));
  if (fold) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: size.width, height: size.height, deviceScaleFactor: size.dpr || 1, mobile: true, screenWidth: size.width, screenHeight: size.height,
      displayFeature: { orientation: 'vertical', offset: fold.offset, maskLength: fold.maskLength },
    });
  }
  await page.goto(`${st.base}${site}#c=${board}`, { timeout: 60000 });
  await page.waitForFunction(() => {
    const t = document.querySelector('#resultsTitle');
    return t && !/Loading/.test(t.textContent) && /\d/.test(t.textContent) && document.querySelector('#resultsList .card[data-id]');
  }, null, { timeout: 90000 });
  await sleep(700);
  return { page, errors, context };
}

/** Run in the page: the layout facts the checks read. `want` names the controls expected on screen. */
function measure(want) {
  const W = innerWidth;
  const H = innerHeight;
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), width: +r.width.toFixed(1) }; };
  const results = document.querySelector('#results');
  const phone = !!results && getComputedStyle(results).position === 'fixed';
  const out = { w: W, h: H, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, phone, controls: {} };
  const n = document.querySelector('#companyMenuBtn .company-name');
  if (n) {
    const range = document.createRange();
    range.selectNodeContents(n);
    out.name = { text: n.textContent, scrollW: n.scrollWidth, clientW: n.clientWidth, textW: +range.getBoundingClientRect().width.toFixed(2), boxW: +n.getBoundingClientRect().width.toFixed(2), visible: vis(n), ...box(n) };
  }
  const SEL = {
    'company menu': '#companyMenuBtn', search: '#search', Filters: '#filtersToggle',
    Chart: '.topbar .seg [data-mode="chart"]', Map: '.topbar .seg [data-mode="map"]', Insights: '.topbar .seg [data-mode="insights"]',
    Clusters: '#vizControls [data-view="clusters"]', Ranges: '#vizControls [data-view="ranges"]', Group: '#groupBy',
    Sort: '#sortBy', 'results sheet handle': '#sheetHandle',
  };
  for (const name of want) {
    if (name === 'results sheet handle' && !phone) continue;
    const el = document.querySelector(SEL[name]);
    if (!vis(el)) { out.controls[name] = 'missing or hidden'; continue; }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { out.controls[name] = 'zero size'; continue; }
    if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) { out.controls[name] = `off screen [${Math.round(r.left)}, ${Math.round(r.top)}, ${Math.round(r.right)}, ${Math.round(r.bottom)}] on ${W}x${H}`; continue; }
    const cy = (r.top + r.bottom) / 2;
    const hit = [0.2, 0.5, 0.8].map((f) => document.elementFromPoint(Math.min(W - 1, Math.max(0, r.left + r.width * f)), Math.min(H - 1, Math.max(0, cy))));
    const over = hit.find((t) => t && t !== el && !el.contains(t) && !t.contains(el));
    out.controls[name] = over ? `covered by ${over.tagName.toLowerCase()}${over.id ? `#${over.id}` : ''}${typeof over.className === 'string' && over.className.trim() ? `.${over.className.trim().split(/\s+/)[0]}` : ''}` : 'ok';
  }
  // The one line above the chart on phones (I-2, fix-density): one line, nothing cut off (the lead, 2026-10-17: at 280 px
  // "melon·seek · Beta: adds 7 big-tech car…" ran to x = 313).
  const tl = document.querySelector('#tagline');
  if (vis(tl) && getComputedStyle(tl).display !== 'none' && tl.getBoundingClientRect().width > 0) {
    const tr = tl.getBoundingClientRect();
    out.tagline = { text: tl.innerText.trim(), scrollW: tl.scrollWidth, clientW: tl.clientWidth, left: Math.round(tr.left), right: Math.round(tr.right), lines: Math.round(tr.height / parseFloat(getComputedStyle(tl).lineHeight || '18')) };
  }
  const card = document.querySelector('#resultsList .card[data-id]');
  const list = document.querySelector('#resultsList');
  if (card) out.card = { ...box(card), scrollW: card.scrollWidth, clientW: card.clientWidth };
  if (list) out.list = { scrollW: list.scrollWidth, clientW: list.clientWidth };
  // Controls and text boxes that run past a side of the screen (the Group select and the tagline at 280 px), outside
  // the rows that scroll sideways on purpose (the quick chips) and outside overlays that are closed (the filter
  // slide-over waits off screen at 861–1199 px: fix-phone-controls UX-56).
  const filtersClosed = !document.body.classList.contains('filters-open') && getComputedStyle(document.querySelector('#filters')).position === 'fixed';
  out.sides = [...document.querySelectorAll('body *')].filter((e) => {
    if (!e.getClientRects().length) return false;
    if (!e.matches('button, input, select, a[href], [tabindex="0"]') && ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return false;
    if (e.closest('[hidden], [inert], [aria-hidden="true"], .sr-only, .skip-link, .drawer, .popover') || (filtersClosed && e.closest('#filters'))) return false;
    if (getComputedStyle(e).visibility === 'hidden') return false;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= H) return false;
    for (let p = e.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return false;
    return r.left < -1 || r.right > W + 1;
  }).slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" [${Math.round(r.left)}, ${Math.round(r.right)}]`; });
  return out;
}

/** Problems with one measurement on a screen `screenW` wide. */
function problemsOf(m, screenW, label) {
  const p = [];
  if (m.scrollW > m.w + 1) p.push(`${label}: the page scrolls sideways (${m.scrollW} px wide on ${m.w})`);
  if (m.w > screenW + 1) p.push(`${label}: the page is laid out ${m.w} px wide on a ${screenW} px screen, so the phone zooms it out`);
  if (!m.name || !m.name.visible || m.name.boxW < 1) p.push(`${label}: the company name is not shown (${JSON.stringify(m.name || null)})`);
  else if (m.name.scrollW > m.name.clientW + 0.5 || m.name.textW > m.name.boxW + 0.05) p.push(`${label}: the company name is cut: "${m.name.text}" needs ${m.name.textW} px in a ${m.name.boxW} px box`);
  else if (m.name.left < -0.5 || m.name.right > m.w + 0.5) p.push(`${label}: the company name is off screen (${m.name.left}–${m.name.right} of ${m.w})`);
  for (const [k, v] of Object.entries(m.controls)) if (v !== 'ok') p.push(`${label}: ${k}: ${v}`);
  if (!m.card) p.push(`${label}: no job card`);
  else {
    if (m.card.left < -0.5 || m.card.right > m.w + 0.5) p.push(`${label}: the first card runs off the screen (${m.card.left}–${m.card.right} of ${m.w})`);
    if (m.card.scrollW > m.card.clientW + 1) p.push(`${label}: the first card's content is wider than the card (${m.card.scrollW} > ${m.card.clientW})`);
  }
  if (m.list && m.list.scrollW > m.list.clientW + 1) p.push(`${label}: the results list scrolls sideways (${m.list.scrollW} > ${m.list.clientW})`);
  if (m.tagline && (m.tagline.scrollW > m.tagline.clientW + 0.5 || m.tagline.right > m.w + 0.5)) p.push(`${label}: the line above the chart is cut: "${m.tagline.text}" needs ${m.tagline.scrollW} px in ${m.tagline.clientW}`);
  if (m.sides && m.sides.length) p.push(`${label}: cut at the side of the ${m.w} px screen: ${m.sides.join(' | ')}`);
  return p;
}

const CHART_CONTROLS = ['company menu', 'search', 'Filters', 'Chart', 'Map', 'Insights', 'Clusters', 'Ranges', 'Group', 'Sort', 'results sheet handle'];
const OTHER_CONTROLS = ['company menu', 'search', 'Filters', 'Chart', 'Map', 'Insights', 'Sort', 'results sheet handle'];

/** Run in the page: an overlay (the job page or the filter sheet) and what scrolls sideways inside it. */
function overlayFacts(sel) {
  const el = document.querySelector(sel);
  if (!el || !el.getClientRects().length) return null;
  const r = el.getBoundingClientRect();
  const sideways = [el, ...el.querySelectorAll('*')]
    .filter((e) => e.getClientRects().length && /auto|scroll|hidden/.test(getComputedStyle(e).overflowX) && !e.matches('.sr-only') && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis' && getComputedStyle(e).whiteSpace !== 'nowrap')
    .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${[...e.classList].join('.')} ${e.scrollWidth}>${e.clientWidth}`);
  return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: innerWidth, scrollW: document.documentElement.scrollWidth, sideways, elScrollW: el.scrollWidth, elClientW: el.clientWidth };
}
function overlayProblems(f, what, screenW, label) {
  if (!f) return [`${label}: the ${what} did not open`];
  const p = [];
  if (f.left < -0.5 || f.right > f.w + 0.5) p.push(`${label}: the ${what} runs off the screen (${f.left}–${f.right} of ${f.w})`);
  if (f.scrollW > f.w + 1 || f.w > screenW + 1) p.push(`${label}: with the ${what} open the page is ${f.scrollW} px wide (screen ${screenW})`);
  if (f.elScrollW > f.elClientW + 1) p.push(`${label}: the ${what} is wider than its box (${f.elScrollW} > ${f.elClientW})`);
  if (f.sideways.length) p.push(`${label}: the ${what} scrolls sideways: ${f.sideways.join(', ')}`);
  return p;
}

/** Open the first job, check the job page, close it. */
async function checkDrawer(page, screenW, label) {
  await page.evaluate(() => document.querySelector('#resultsList .card[data-id]').click());
  await page.waitForFunction(() => document.querySelector('#drawer.is-open #drawerTitle'), null, { timeout: 15000 }).catch(() => {});
  await sleep(900); // the slide-in (0.22 s) and the description file
  const f = await page.evaluate(overlayFacts, '#drawer');
  const p = overlayProblems(f, 'job page', screenW, label);
  const ctl = await page.evaluate(() => ['#drawerClose', '.drawer-foot .apply'].map((s) => {
    const el = document.querySelector(s);
    if (!el || !el.getClientRects().length) return `${s} missing`;
    const r = el.getBoundingClientRect();
    return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1 ? `${s} off screen [${Math.round(r.left)}, ${Math.round(r.top)}, ${Math.round(r.right)}, ${Math.round(r.bottom)}]` : null;
  }).filter(Boolean));
  p.push(...ctl.map((c) => `${label}: job page: ${c}`));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#drawer.is-open'), null, { timeout: 5000 }).catch(() => {});
  await sleep(350);
  return p;
}

/** Open the filter sheet (or read the filter column where it is part of the page), check it, close it. */
async function checkFilters(page, screenW, label) {
  const overlay = await page.evaluate(() => getComputedStyle(document.querySelector('#filters')).position === 'fixed');
  if (overlay) {
    await page.locator('#filtersToggle').click();
    await page.waitForFunction(() => document.body.classList.contains('filters-open'), null, { timeout: 5000 }).catch(() => {});
    await sleep(450);
  }
  const f = await page.evaluate(overlayFacts, '#filters');
  const p = overlayProblems(f, overlay ? 'filter sheet' : 'filter column', screenW, label);
  if (overlay) {
    const done = await page.evaluate(() => {
      const el = document.querySelector('#filtersDone');
      if (!el || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 ? `"Show roles" off screen [${Math.round(r.left)}, ${Math.round(r.top)}, ${Math.round(r.right)}, ${Math.round(r.bottom)}]` : null;
    });
    if (done) p.push(`${label}: filter sheet: ${done}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('filters-open'), null, { timeout: 5000 }).catch(() => {});
    await sleep(350);
  }
  return p;
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${SHOTS}-${name}.png`) }).catch(() => {});
}

/** Run in the page: everything with content (a control, a card, the chart, text) that lies on the hinge band [a, b]. */
function onHinge([a, b]) {
  const out = [];
  const W = innerWidth;
  const H = innerHeight;
  for (const e of document.querySelectorAll('body *')) {
    if (!e.getClientRects().length || e.closest('.sr-only, [hidden], .drawer-backdrop, .scrim')) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const content = e.matches('button, input, select, a[href], [tabindex="0"], .card, #vizArea, img, svg:not(svg svg)')
      || [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (!content) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
    // Clipped away by a scrolling or clipping ancestor? Then it is not on screen.
    let clipped = false;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (/auto|scroll|hidden|clip/.test(pcs.overflowX + pcs.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) { clipped = true; break; }
      }
    }
    if (clipped) continue;
    if (r.left < b - 0.5 && r.right > a + 0.5) {
      out.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} [${Math.round(r.left)}–${Math.round(r.right)}] "${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`);
    }
  }
  return [...new Set(out)];
}

export function registerPhoneMatrixTests(suite) {
  for (const size of ALL_SIZES) {
    const dev = `${size.width}x${size.height}`;
    suite.test(`Phone matrix: [${size.name} ${dev}] ${BOARDS.join(', ')}: the page fits the screen, the company name is whole, every main control is on screen and uncovered, and the first card, the job page and the filter sheet fit the width`, async (ctx) => {
      const bad = [];
      for (const board of BOARDS) {
        const { page, errors, context } = await open(ctx, size, { board });
        const label = `${board} ${dev}`;
        bad.push(...problemsOf(await page.evaluate(measure, CHART_CONTROLS), size.width, label));
        if (board === BOARDS[0]) {
          await shot(page, `${slug(size.name)}-${dev}-light`);
          // Map and Insights keep the top bar, the quick bar and the sheet on screen too.
          for (const mode of ['map', 'insights']) {
            await page.locator(`.topbar .seg [data-mode="${mode}"]`).click();
            await sleep(mode === 'map' ? 1500 : 900);
            bad.push(...problemsOf(await page.evaluate(measure, OTHER_CONTROLS), size.width, `${label} ${mode}`));
          }
          await page.locator('.topbar .seg [data-mode="chart"]').click();
          await sleep(900);
        }
        bad.push(...await checkDrawer(page, size.width, label));
        bad.push(...await checkFilters(page, size.width, label));
        bad.push(...errors.map((e) => `${label}: ${e}`));
        await context.close();
      }
      if (SHOTS && (size.width <= 344 || size.width === DUO.width)) {
        const { page, context } = await open(ctx, size, { board: BOARDS[0], colorScheme: 'dark' });
        await shot(page, `${slug(size.name)}-${dev}-dark`);
        await context.close();
      }
      assert(!bad.length, `${bad.length} problem(s):\n  ${bad.join('\n  ')}`);
    });
  }

  // The name sweep: M-45 ("Micros…" at 380–392 px) lived between the matrix's sizes, so every width from 280 to 860.
  suite.test('Phone matrix: the company name is whole at every width from 280 to 860 px, portrait and short (every beta board, and the main site\'s longest names)', async (ctx) => {
    const bad = [];
    const boards = [['beta/', ['microsoft', 'amazon', 'netflix', 'nvidia', 'google', 'apple', 'meta']], ['', ['anthropic', 'shieldai', 'palantir']]];
    for (const [site, slugs] of boards) {
      const phone = { name: 'sweep', width: 390, height: 844, dpr: 2, platform: 'ios', ua: ALL_SIZES.find((s) => s.platform === 'ios').ua };
      const { page, errors, context } = await open(ctx, phone, { board: slugs[0], site });
      for (const board of slugs) {
        if (board !== slugs[0]) {
          await page.evaluate((b) => { location.hash = `c=${b}`; }, board);
          await page.waitForFunction((b) => { const t = document.querySelector('#resultsTitle'); return location.hash.includes(b) && t && !/Loading/.test(t.textContent) && document.querySelector('#companyMenuBtn .company-name')?.textContent.length; }, board, { timeout: 90000 });
          await sleep(500);
        }
        for (const height of [740, 360]) {
          for (let width = 280; width <= 860; width += 4) {
            await page.setViewportSize({ width, height });
            const m = await page.evaluate(() => {
              const n = document.querySelector('#companyMenuBtn .company-name');
              if (!n || !n.getClientRects().length) return { gone: true, w: innerWidth };
              const r = document.createRange();
              r.selectNodeContents(n);
              return { text: n.textContent, textW: r.getBoundingClientRect().width, boxW: n.getBoundingClientRect().width, scrollW: n.scrollWidth, clientW: n.clientWidth, w: innerWidth, pageW: document.documentElement.scrollWidth };
            });
            if (m.gone || m.boxW < 1) bad.push(`${site || 'main '}${board} ${width}x${height}: no company name`);
            else if (m.scrollW > m.clientW + 0.5 || m.textW > m.boxW + 0.05) bad.push(`${site || 'main '}${board} ${width}x${height}: "${m.text}" cut (${m.textW.toFixed(1)} px of text in ${m.boxW.toFixed(1)})`);
            if (m.w > width + 1 || m.pageW > width + 1) bad.push(`${site || 'main '}${board} ${width}x${height}: page laid out ${Math.max(m.w, m.pageW)} px wide`);
          }
        }
      }
      bad.push(...errors);
      await context.close();
    }
    assert(!bad.length, `${bad.length} problem(s):\n  ${bad.slice(0, 40).join('\n  ')}${bad.length > 40 ? `\n  … and ${bad.length - 40} more` : ''}`);
  });

  for (const size of DESKTOP) {
    const dev = `${size.width}x${size.height}`;
    suite.test(`Phone matrix: [${size.name}] desktop and tablet keep the same checks: the page fits, the name is whole, the controls are on screen, the job page and filters fit`, async (ctx) => {
      const { page, errors } = await open(ctx, size, { board: 'apple' });
      const bad = problemsOf(await page.evaluate(measure, CHART_CONTROLS), size.width, dev);
      bad.push(...await checkDrawer(page, size.width, dev));
      bad.push(...await checkFilters(page, size.width, dev));
      bad.push(...errors);
      assert(!bad.length, `${bad.length} problem(s):\n  ${bad.join('\n  ')}`);
    });
  }

  suite.test('Phone matrix: [Surface Duo spanned 1114x720, hinge emulated at 540–574 px] chart and filters on the left screen, the list and the job page on the right, nothing on the hinge (Chromium CDP)', async (ctx) => {
    if (engineOf(ctx) !== 'chromium') skip('emulating the hinge needs Chromium CDP (Emulation.setDeviceMetricsOverride displayFeature)');
    const size = ALL_SIZES.find((s) => s.width === DUO.width && s.height === DUO.height);
    assert(size, 'the matrix lists the Surface Duo spanned (1114x720)');
    const hinge = [DUO.fold.offset, DUO.fold.offset + DUO.fold.maskLength];
    const bad = [];
    for (const board of ['apple', 'amazon']) {
      const { page, errors, context } = await open(ctx, size, { board, fold: DUO.fold });
      const seg = await page.evaluate(() => ({ mq: matchMedia('(horizontal-viewport-segments: 2)').matches, segs: window.viewport?.segments?.map((s) => [s.x, s.width]) || null }));
      assert(seg.mq && seg.segs && seg.segs.length === 2, `the fold emulation took (two viewport segments): ${JSON.stringify(seg)}`);
      const label = `${board} Duo spanned`;
      bad.push(...problemsOf(await page.evaluate(measure, CHART_CONTROLS), size.width, label));
      const where = await page.evaluate(() => Object.fromEntries(['#vizArea', '#results', '.topbar', '.quickbar'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [Math.round(r.left), Math.round(r.right)]]; })));
      if (where['#vizArea'][1] > hinge[0]) bad.push(`${label}: the chart is not on the left screen (${where['#vizArea'].join('–')})`);
      if (where['#results'][0] < hinge[1] || where['#results'][1] > size.width) bad.push(`${label}: the list is not on the right screen (${where['#results'].join('–')})`);
      const main = await page.evaluate(onHinge, hinge);
      if (main.length) bad.push(`${label}: on the hinge: ${main.slice(0, 8).join(' | ')}`);
      if (board === 'apple') await shot(page, 'surface-duo-spanned-hinge-1114x720-light');
      // The job page on the right screen.
      await page.evaluate(() => document.querySelector('#resultsList .card[data-id]').click());
      await page.waitForFunction(() => document.querySelector('#drawer.is-open #drawerTitle'), null, { timeout: 15000 });
      await sleep(900);
      const d = await page.evaluate(() => { const r = document.querySelector('#drawer').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
      if (d[0] < hinge[1] || d[1] > size.width) bad.push(`${label}: the job page is not on the right screen (${d.join('–')})`);
      const job = await page.evaluate(onHinge, hinge);
      if (job.length) bad.push(`${label}, job open: on the hinge: ${job.slice(0, 8).join(' | ')}`);
      if (board === 'apple') await shot(page, 'surface-duo-spanned-hinge-job-1114x720-light');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#drawer.is-open'), null, { timeout: 5000 });
      await sleep(350);
      // The filters on the left screen.
      await page.locator('#filtersToggle').click();
      await page.waitForFunction(() => document.body.classList.contains('filters-open'), null, { timeout: 5000 });
      await sleep(450);
      const f = await page.evaluate(() => { const r = document.querySelector('#filters').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
      if (f[0] < 0 || f[1] > hinge[0]) bad.push(`${label}: the filters are not on the left screen (${f.join('–')})`);
      const fl = await page.evaluate(onHinge, hinge);
      if (fl.length) bad.push(`${label}, filters open: on the hinge: ${fl.slice(0, 8).join(' | ')}`);
      if (board === 'apple') await shot(page, 'surface-duo-spanned-hinge-filters-1114x720-light');
      await page.keyboard.press('Escape');
      await sleep(400);
      // Popovers open on the screen of the control that opened them.
      for (const [what, sel] of [['company menu', '#companyMenuBtn'], ['data badge', '#dataBadge'], ['More', '#quickChips [data-pop="more"]'], ['Department', '#quickChips [data-pop="dept"]']]) {
        const btn = page.locator(sel);
        if (!(await btn.count()) || !(await btn.first().isVisible())) continue;
        await btn.first().click();
        await page.waitForFunction(() => !document.querySelector('#popover').hidden, null, { timeout: 5000 }).catch(() => {});
        await sleep(350);
        const pr = await page.evaluate(() => { const p = document.querySelector('#popover'); if (p.hidden) return null; const r = p.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
        if (pr && pr[0] < hinge[1] && pr[1] > hinge[0]) bad.push(`${label}: the ${what} popover lies across the hinge (${pr.join('–')})`);
        await page.keyboard.press('Escape');
        await sleep(300);
      }
      bad.push(...errors.map((e) => `${label}: ${e}`));
      await context.close();
    }
    assert(!bad.length, `${bad.length} problem(s):\n  ${bad.join('\n  ')}`);
  });
}

// Standalone: node test/e2e/phone-matrix.e2e.js [--browser=webkit|chromium] [--grep=re]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createSuite, loadPlaywright, findChromium } = await import('./harness.js');
  const engine = (process.argv.find((a) => a.startsWith('--browser=')) || '--browser=chromium').slice(10);
  const grepArg = process.argv.find((a) => a.startsWith('--grep='));
  const pw = await loadPlaywright();
  if (!pw) { console.error('phone-matrix: the `playwright` package was not found'); process.exit(2); }
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: findChromium() } : {});
  console.log(`phone-matrix: ${engine} ${browser.version()}`);
  const suite = createSuite();
  registerPhoneMatrixTests(suite);
  const ctx = { data: {}, notes: [], cleanup: [], pw, browser };
  const results = await suite.run(ctx, grepArg ? new RegExp(grepArg.slice(7), 'i') : null);
  await browser.close();
  if (shared) await shared.close();
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

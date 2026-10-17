// Third mobile QA pass on the beta site (docs/process/qa-mobile-beta-3.md, and its "Section for docs/QA.md"): the
// 2026-10-16 whole-board crawl (Amazon 22,179 postings) after fix-density, google-grouping, the salary audit,
// perf-mobile-beta-2, fix6-fresh-data and viz-even.
//
// The beta site is static only, so these tests serve a build (BETA_QA3_DIST, else BETA_QA_DIST, else dist/) under
// /melon-seek/ the way GitHub Pages does, and open /melon-seek/beta/ on an emulated phone (isMobile, hasTouch, DPR 3,
// an iPhone or Android UA). Every request to another host is aborted. Gestures are real touch: page.touchscreen.tap,
// and CDP Input.dispatchTouchEvent with explicit timestamps for flicks, so a slow machine can't turn a flick into a
// slow drag.
//
// Tests tagged "[M-n]" encode an open bug and fail until it is fixed; the others guard flows that work today.
// The text-density tests use the rule of public/viz/note.js (fix-density): one line on the phone, at most 12 visible
// words, nothing cut off. BETA_QA3_SHOTS=1 saves each failing case's screenshot to docs/screenshots/qa-mobile-beta-3/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, skip } from './harness.js';
import { unpackJobs } from '../../public/api.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'qa-mobile-beta-3');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const P390 = { width: 390, height: 844 };
const P360 = { width: 360, height: 740 };
const LAND = { width: 844, height: 390 };
const WORDS = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180e3, uploadThroughput: 84e3 };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const distDir = () => path.resolve(process.env.BETA_QA3_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
let shared = null;
/** Serve the build under /melon-seek/ (gzip, like Pages); null when there is no beta build with the big-tech lists. */
async function serveBeta() {
  if (shared) return shared;
  const dist = distDir();
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
    if (/text|javascript|json|svg|csv/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' });
      return res.end(zlib.gzipSync(body));
    }
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  shared = { origin, base: `${origin}/melon-seek/`, dist };
  return shared;
}

const lists = new Map();
/** A board's postings, unpacked from the build's static list (the same objects the page gets). */
async function boardJobs(st, slug, site = 'beta/') {
  const key = `${site}${slug}`;
  if (!lists.has(key)) {
    const f = path.join(st.dist, site, 'api', 'jobs', `${slug}.json`);
    if (!fs.existsSync(f)) skip(`no ${slug} list in this build`);
    lists.set(key, await unpackJobs(JSON.parse(fs.readFileSync(f, 'utf8'))));
  }
  return lists.get(key);
}

const KEYBOARD_INIT = (kb) => { // the earlier passes' simulated keyboard: visualViewport shrinks while a text field has focus
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

/** A phone page on the beta site (or the main site with site: ''). wait: until the board's cards show. */
async function phone(ctx, { hash = 'c=apple', site = 'beta/', viewport = P390, ua, keyboard = 0, wait = true, throttle = null } = {}) {
  const st = await serveBeta();
  if (!st) skip('no beta build with the big-tech lists (npm run build, or BETA_QA3_DIST=<dir>)');
  const context = await ctx.browser.newContext({ viewport, userAgent: ua || (viewport.width <= 360 ? ANDROID : IOS), isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme: 'light' });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => u.origin !== st.origin, (r) => r.abort('blockedbyclient'));
  if (keyboard) await context.addInitScript(KEYBOARD_INIT, keyboard);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  if (throttle) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', throttle.net || SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.cpu || 4 });
  }
  const go = async (h, settle = 900) => {
    await page.goto('about:blank');
    await page.goto(`${st.base}${site}${h ? `#${h}` : ''}`);
    await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && !/Loading/.test(t.textContent) && /\d|No roles/.test(t.textContent) && (document.querySelector('#resultsList .card[data-id]') || /\b0 roles|No roles/.test(t.textContent)); }, null, { timeout: 90000 });
    await sleep(settle);
  };
  if (wait) await go(hash); else await page.goto(`${st.base}${site}${hash ? `#${hash}` : ''}`);
  return { page, cdp, errors, go, st };
}
async function tapBox(page, b, wait = 450) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(wait); }
async function tapSel(page, sel, wait = 450) {
  const b = await page.locator(`${sel} >> visible=true`).first().boundingBox();
  assert(b, `${sel} has no box`);
  await tapBox(page, b, wait);
}
async function shot(page, name) {
  if (!process.env.BETA_QA3_SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 15000 }); } catch { /* evidence only */ }
}
/** A flick with exact event times (ms apart), however slow each CDP round trip is. */
async function flick(cdp, x, y, dy, { steps = 6, ms = 12 } = {}) {
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: t0 });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps, id: 1 }], timestamp: t0 + (i * ms) / 1000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + (steps * ms + 4) / 1000 });
  await sleep(700);
}
const sheetState = (page) => page.evaluate(() => document.body.dataset.sheet);
async function sheetTo(page, s) { for (let i = 0; i < 4 && (await sheetState(page)) !== s; i++) await tapSel(page, '#sheetHandle', 600); }

/**
 * Each visible element of `sel`: its visible line's text and words (an .ms-note's line, without its Details button),
 * how many line boxes it takes, and whether it is cut off (text-overflow or a text wider than its box).
 */
const measure = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => {
  const b = e.getBoundingClientRect();
  return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]');
}).map((e) => {
  const lineEl = e.classList.contains('ms-note') ? e.querySelector(':scope > .ms-note__line') : e;
  const text = (lineEl?.innerText || '').replace(/\s+/g, ' ').trim();
  const range = document.createRange();
  range.selectNodeContents(lineEl || e);
  const mids = [];
  for (const x of range.getClientRects()) {
    if (x.width < 0.5 || x.height < 0.5) continue;
    const m = x.top + x.height / 2;
    if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m);
  }
  const textW = range.getBoundingClientRect().width, boxW = (lineEl || e).getBoundingClientRect().width;
  return {
    sel: e.className || e.tagName, text,
    words: text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
    lines: mids.length,
    cut: !!lineEl && (lineEl.scrollWidth > lineEl.clientWidth + 1 || (getComputedStyle(lineEl).textOverflow === 'ellipsis' && textW > boxW + 0.01)),
  };
}), sel);
function overBudget(found, where) {
  const bad = [];
  for (const m of found) {
    const why = [m.lines > 1 ? `${m.lines} lines` : '', m.words > WORDS ? `${m.words} words` : '', m.cut ? 'cut off' : ''].filter(Boolean);
    if (why.length) bad.push(`${where} .${String(m.sel).split(' ')[0]}: ${why.join(', ')}: "${m.text.slice(0, 160)}"`);
  }
  return bad;
}
const topPaidId = (page) => page.evaluate(() => document.querySelector('#resultsList .card[data-id]')?.dataset.id);
async function openJob(go, page, id) {
  await go(`c=${String(id).split(':')[0]}&job=${encodeURIComponent(id)}`, 1200);
  await page.waitForSelector('#drawer:not([hidden]) #drawerTitle', { timeout: 20000 });
  await sleep(500);
}

export function registerBetaMobileQa3Tests(suite) {
  /* ------------------------------------------------------------------ guards (pass today) */

  suite.test('Beta mobile QA 3: Amazon on a throttled phone (Slow 4G, 4x CPU): real preview cards under "Loading 22,179 roles…", then the whole list replaces them in place', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=amazon', wait: false, throttle: { cpu: 4 } });
    const st = await serveBeta();
    const total = (await boardJobs(st, 'amazon')).length;
    await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 60000 });
    const pv = await page.evaluate(() => ({ title: document.querySelector('#resultsTitle').textContent, ids: [...document.querySelectorAll('#resultsList .card[data-preview-id]')].slice(0, 10).map((c) => c.dataset.previewId), n: document.querySelectorAll('#resultsList .card[data-preview-id]').length }));
    assert(pv.title.includes(`Loading ${total.toLocaleString('en-US')} roles`), `the header says "Loading ${total.toLocaleString('en-US')} roles…" under the preview: "${pv.title}"`);
    assert(pv.n >= 10, `the preview shows real cards: ${pv.n}`);
    await page.waitForFunction(() => /^[\d,]+ roles$/.test(document.querySelector('#resultsTitle').textContent.trim()), null, { timeout: 90000 });
    await sleep(500);
    const after = await page.evaluate(() => ({ title: document.querySelector('#resultsTitle').textContent, ids: [...document.querySelectorAll('#resultsList .card[data-id]')].slice(0, 10).map((c) => c.dataset.id), left: document.querySelectorAll('#resultsList .card[data-preview-id]').length }));
    assert(after.title.trim() === `${total.toLocaleString('en-US')} roles`, `the whole list landed: "${after.title}"`);
    assert(after.left === 0, `no preview card is left: ${after.left}`);
    assert(JSON.stringify(after.ids) === JSON.stringify(pv.ids), `the list's first cards are the preview's, in the same order:\n  preview ${pv.ids.join(' ')}\n  list    ${after.ids.join(' ')}`);
  });

  suite.test('Beta mobile QA 3: Google on a phone: the Department chip opens the Company list; YouTube gives "Show N roles" equal to the result count; Group by Company draws one row per brand', async (ctx) => {
    const { page, go, errors } = await phone(ctx, { hash: 'c=google' });
    const st = await serveBeta();
    const jobs = await boardJobs(st, 'google');
    const yt = jobs.filter((j) => j.brand === 'YouTube').length;
    const brands = new Set(jobs.map((j) => j.brand).filter(Boolean));
    assert(yt > 0 && brands.size > 1, `the build has Google brands (${[...brands].join(', ')})`);
    await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').scrollIntoView({ inline: 'center' }));
    await sleep(200);
    await tapSel(page, '#quickChips [data-pop=dept]', 1000);
    const row = page.locator('#filterBody label.check', { hasText: /^\s*YouTube/ }).first();
    assert(await row.count(), 'the Department section lists YouTube under Company');
    await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await sleep(250);
    await tapBox(page, await row.boundingBox(), 900);
    const btn = await page.textContent('#filtersDone');
    assert(btn.includes(`Show ${yt.toLocaleString('en-US')} role`), `"Show N roles" counts YouTube's ${yt}: "${btn}"`);
    await tapSel(page, '#filtersDone', 1200);
    const title = await page.textContent('#resultsTitle');
    assert(title.startsWith(`${yt.toLocaleString('en-US')} role`), `the results say ${yt}: "${title}"`);
    await go('g=brand', 1200);
    const rows = await page.$$eval('#chartHost .ms-crow__name', (e) => e.map((x) => x.textContent.trim()));
    for (const b of brands) assert(rows.includes(b), `a chart row for ${b}: ${rows.join(', ')}`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Beta mobile QA 3: the new pay labels fit a 360 phone card: "· 2 levels", "· N places", "from €X", "from PLN"', async (ctx) => {
    const st = await serveBeta();
    if (!st) skip('no beta build');
    const pick = async (slug, f) => (await boardJobs(st, slug)).find(f);
    const cases = [
      ['nvidia', await pick('nvidia', (j) => j.salary?.levels?.length >= 2 && j.salary.kind === 'salary' && j.salary.currency === 'USD'), /· 2 levels$/],
      ['amazon', await pick('amazon', (j) => j.salary?.ranges?.length >= 3), /· \d places$/],
      ['amazon', await pick('amazon', (j) => j.salary?.kind === 'minimum' && j.salary.currency === 'EUR'), /^from €/],
      ['amazon', await pick('amazon', (j) => j.salary?.kind === 'minimum' && j.salary.currency === 'PLN'), /^from PLN/],
    ].filter(([, j]) => j);
    assert(cases.length === 4, `the build has a posting of each shape (${cases.length} of 4)`);
    const { page, go } = await phone(ctx, { hash: 'c=nvidia', viewport: P360 });
    const bad = [];
    for (const [slug, j, want] of cases) {
      await page.goto('about:blank');
      await go(`c=${slug}&q=${encodeURIComponent(j.title)}`, 800);
      await sheetTo(page, 'full');
      const c = await page.evaluate((id) => { const card = document.querySelector(`#resultsList .card[data-id="${CSS.escape(id)}"]`); const p = card?.querySelector('.sal-pill'); if (!p) return null; const r = p.getBoundingClientRect(), cr = card.getBoundingClientRect(); return { text: p.innerText.replace(/\s+/g, ' ').trim(), cut: p.scrollWidth > p.clientWidth + 1, inside: r.right <= cr.right + 0.5 }; }, j.id);
      if (!c) { bad.push(`${j.id}: no card for "${j.title}"`); continue; }
      if (!want.test(c.text) || c.cut || !c.inside) bad.push(`${j.id}: pill "${c.text}" (want ${want}${c.cut ? ', cut off' : ''}${c.inside ? '' : ', outside its card'})`);
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: results-sheet flicks go one snap further (peek -> half on the header, full -> half on the handle), with exact event times', async (ctx) => {
    const { page, cdp } = await phone(ctx, { hash: 'c=apple' });
    const bad = [];
    for (const [from, on, dy, want] of [['peek', '.results-head', -150, 'half'], ['peek', '#sheetHandle', -120, 'half'], ['full', '#sheetHandle', 150, 'half'], ['full', '.results-head', 150, 'half']]) {
      await sheetTo(page, from);
      await sleep(300);
      const b = await page.locator(on).first().boundingBox();
      await flick(cdp, b.x + b.width * 0.55, b.y + b.height / 2, dy, { steps: 6, ms: 12 });
      const got = await sheetState(page);
      if (got !== want) bad.push(`${from} ${dy < 0 ? 'up' : 'down'} on ${on} (${Math.abs(dy)} px in 72 ms): ${got}, want ${want}`);
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: Amazon (22,179 roles) on a phone: a sort and a filter tap each answer within a second, and "Show N roles" equals the result count', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=amazon' });
    const first = () => page.evaluate(() => document.querySelector('#resultsList .card[data-id]')?.dataset.id);
    const before = await first();
    let t0 = Date.now();
    await page.selectOption('#sortBy', 'newest');
    await page.waitForFunction((b) => document.querySelector('#resultsList .card[data-id]')?.dataset.id !== b, before, { timeout: 15000 });
    const tSort = Date.now() - t0;
    await page.evaluate(() => document.querySelector('#quickChips [data-pop=sen]').scrollIntoView({ inline: 'center' }));
    await sleep(250);
    await tapSel(page, '#quickChips [data-pop=sen]', 1000);
    const row = page.locator('#filterBody details.fsec[open] label.check').filter({ hasText: /^\s*Senior/ }).first();
    const b0 = await page.textContent('#filtersDone');
    t0 = Date.now();
    await tapBox(page, await row.boundingBox(), 0);
    await page.waitForFunction((b) => document.querySelector('#filtersDone').textContent !== b, b0, { timeout: 15000 });
    const tTick = Date.now() - t0;
    const want = (await page.textContent('#filtersDone')).match(/[\d,]+/)[0];
    await tapSel(page, '#filtersDone', 1000);
    const title = await page.textContent('#resultsTitle');
    assert(title.startsWith(`${want} role`), `"Show ${want} roles" equals the results: "${title}"`);
    assert(tSort < 1000 && tTick < 1000, `sort ${tSort} ms, filter tap ${tTick} ms (each under 1,000)`);
  });

  suite.test('Beta mobile QA 3: switching between the big boards, Amazon included, keeps the JS heap bounded', async (ctx) => {
    const { page, cdp, go } = await phone(ctx, { hash: 'c=apple' });
    await cdp.send('HeapProfiler.enable');
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(200); return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576; };
    const rounds = [];
    for (let r = 0; r < 3; r++) {
      for (const slug of ['amazon', 'google', 'microsoft', 'apple']) await go(`c=${slug}`, 400);
      rounds.push(await heap());
    }
    assert(rounds[2] < rounds[0] * 1.25 + 5, `the heap after rounds 1-3: ${rounds.map((x) => x.toFixed(1)).join(' / ')} MB (round 3 within 25% of round 1)`);
  });

  suite.test('Beta mobile QA 3: a tap on a stacked Ranges row ("N roles") selects those postings: a chip with the count and the list', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=microsoft&v=ranges' });
    await sleep(800);
    const row = page.locator('#chartHost .ms-row').filter({ has: page.locator('.ms-row__label', { hasText: /^\d+ roles$/ }) }).first();
    assert(await row.count(), 'Microsoft Ranges has a stacked row');
    const n = Number((await row.locator('.ms-row__label').textContent()).match(/\d+/)[0]);
    await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await sleep(300);
    await tapBox(page, await row.locator('.ms-row__bar').boundingBox(), 1200);
    const s = await page.evaluate(() => ({ title: document.querySelector('#resultsTitle').textContent, chip: [...document.querySelectorAll('.area-chip')].map((e) => e.innerText.trim()).filter(Boolean)[0] || '' }));
    assert(s.title.startsWith(`${n} role`) && s.chip.includes(`(${n})`), `the row's ${n} postings: title "${s.title}", chip "${s.chip}"`);
  });

  /* ------------------------------------------------------------------ open bugs (fail today) */

  suite.test('Beta mobile QA 3: [M-33] the job page\'s "Same role elsewhere" captions are one line each on a phone (Amazon, Apple, Google; 390 and 360)', async (ctx) => {
    const bad = [];
    for (const viewport of [P390, P360]) {
      const { page, go } = await phone(ctx, { hash: 'c=amazon', viewport });
      for (const slug of ['amazon', 'apple', 'google']) {
        await go(`c=${slug}`, 600);
        const id = await topPaidId(page);
        await openJob(go, page, `${id}`);
        await page.evaluate(() => { const d = [...document.querySelectorAll('#drawer details.d-fold')].find((x) => /Same role elsewhere/.test(x.querySelector('summary')?.textContent || '')); if (d) d.open = true; });
        await sleep(600);
        const found = await measure(page, '#drawer .comps-note, #drawer .comps-caveat, #drawer .ms-comps__note, #drawer .comps-asof');
        if (!found.length) bad.push(`${slug} ${viewport.width}: no "Same role elsewhere" captions`);
        const over = overBudget(found, `${slug} ${viewport.width}`);
        if (over.length) await shot(page, `e2e-M-33-same-role-elsewhere-${slug}-${viewport.width}`);
        bad.push(...over);
      }
    }
    assert(!bad.length, `${bad.length} caption(s) over the one-line budget:\n  ${bad.join('\n  ')}`);
  });

  suite.test('Beta mobile QA 3: [M-34] the Pay estimate card\'s lines in Insights are one line each on a phone (Amazon, Google; 390 and 360)', async (ctx) => {
    const bad = [];
    for (const viewport of [P390, P360]) {
      const { page, go } = await phone(ctx, { hash: 'c=amazon', viewport });
      for (const slug of ['amazon', 'google']) {
        await go(`c=${slug}&m=insights`, 600);
        await page.waitForSelector('#compHost .ms-comp__explain', { timeout: 60000 });
        await sleep(500);
        const over = overBudget(await measure(page, '#compHost .ms-comp__explain, #compHost .ms-comp__auto, #compHost .ms-comp__accuracy, #compHost .ms-comp__asof'), `${slug} ${viewport.width}`);
        if (over.length) { await page.locator('#compHost .ms-comp__explain').evaluate((e) => e.scrollIntoView({ block: 'center' })); await shot(page, `e2e-M-34-pay-estimate-${slug}-${viewport.width}`); }
        bad.push(...over);
      }
    }
    assert(!bad.length, `${bad.length} line(s) over the budget:\n  ${bad.join('\n  ')}`);
  });

  suite.test('Beta mobile QA 3: [M-35] the Juice explainer above the results list is one line on a phone (390 and 360)', async (ctx) => {
    const bad = [];
    for (const viewport of [P390, P360]) {
      const { page } = await phone(ctx, { hash: 'c=google', viewport });
      await sheetTo(page, 'half');
      const found = await measure(page, '#resultsList .juice-scale');
      assert(found.length, 'the Juice explainer shows on a first visit');
      const over = overBudget(found, `google ${viewport.width}`);
      if (over.length) await shot(page, `e2e-M-35-juice-explainer-${viewport.width}`);
      bad.push(...over);
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: [M-36] the filter sheet\'s notes (salary, location, seniority) are one line each on a phone', async (ctx) => {
    const bad = [];
    for (const [slug, viewport] of [['amazon', P390], ['google', P360]]) {
      const { page } = await phone(ctx, { hash: `c=${slug}`, viewport });
      await tapSel(page, '#filtersToggle', 900);
      await page.evaluate(() => { for (const d of document.querySelectorAll('#filterBody details.fsec')) if (/Salary|Location|Seniority/.test(d.querySelector('summary')?.textContent || '')) d.open = true; });
      await sleep(400);
      const found = await measure(page, '#filterBody .fnote');
      assert(found.length >= 3, `the salary, location and seniority notes are there (${found.length})`);
      const over = overBudget(found, `${slug} ${viewport.width}`);
      if (over.length) await shot(page, `e2e-M-36-filter-notes-${slug}-${viewport.width}`);
      bad.push(...over);
    }
    assert(!bad.length, `${bad.length} note(s) over the budget:\n  ${bad.join('\n  ')}`);
  });

  suite.test('Beta mobile QA 3: [M-37] the job page\'s Juice and Listing lines are one line each on a phone (Apple and NVIDIA top roles, an Amazon minimum)', async (ctx) => {
    const st = await serveBeta();
    if (!st) skip('no beta build');
    const minimum = (await boardJobs(st, 'amazon')).find((j) => j.salary?.kind === 'minimum' && j.salary.currency === 'EUR');
    const { page, go } = await phone(ctx, { hash: 'c=apple', viewport: P390 });
    const bad = [];
    const ids = [];
    for (const slug of ['apple', 'nvidia']) { await go(`c=${slug}`, 500); ids.push([slug, await topPaidId(page)]); }
    if (minimum) ids.push(['amazon', minimum.id]);
    for (const [slug, id] of ids) {
      await go(`c=${slug}`, 300);
      await openJob(go, page, id);
      const over = overBudget(await measure(page, '#drawer .juice-head-net, #drawer .juice-none, #drawer .listing-lines li, #drawer .d-pool'), `${slug} ${id}`);
      if (over.length) await shot(page, `e2e-M-37-juice-listing-${slug}`);
      bad.push(...over);
    }
    assert(!bad.length, `${bad.length} line(s) over the budget:\n  ${bad.join('\n  ')}`);
  });

  suite.test('Beta mobile QA 3: [M-38] the job page\'s percentile line is never cut off on a phone ("Pays more than 72% of Amazon\'s roles in the …")', async (ctx) => {
    const st = await serveBeta();
    if (!st) skip('no beta build');
    const amazonPlaces = (await boardJobs(st, 'amazon')).find((j) => j.salary?.ranges?.length >= 2 && j.salary.currency === 'USD');
    const googleLevels = (await boardJobs(st, 'google')).find((j) => j.salary?.levels?.length >= 2 && j.salary.currency === 'CAD');
    const bad = [];
    for (const [slug, j, viewport] of [['amazon', amazonPlaces, P360], ['google', googleLevels, P390]]) {
      if (!j) continue;
      const { page, go } = await phone(ctx, { hash: `c=${slug}`, viewport });
      await openJob(go, page, j.id);
      const over = overBudget(await measure(page, '#drawer .d-pct-text, #drawer .dist-caption'), `${slug} ${viewport.width} ${j.id}`);
      if (over.length) await shot(page, `e2e-M-38-percentile-${slug}-${viewport.width}`);
      bad.push(...over);
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: [M-39] the data badge popover and the More sheet keep their notes to one line each on a phone', async (ctx) => {
    const { page, go } = await phone(ctx, { hash: 'c=apple', viewport: P390 });
    const bad = [];
    await tapSel(page, '#dataBadge', 900);
    let over = overBudget(await measure(page, '#popover .badge-details > p, #popover .badge-details dd'), 'badge');
    if (over.length) await shot(page, 'e2e-M-39-badge-popover');
    bad.push(...over);
    await go('c=apple', 500);
    await page.evaluate(() => document.querySelector('#quickChips [data-pop=more]').scrollIntoView({ inline: 'center' }));
    await sleep(250);
    await tapSel(page, '#quickChips [data-pop=more]', 900);
    over = overBudget(await measure(page, '#popover .pop-sec .fnote'), 'More');
    if (over.length) await shot(page, 'e2e-M-39-more-sheet');
    bad.push(...over);
    assert(!bad.length, `${bad.length} line(s) over the budget:\n  ${bad.join('\n  ')}`);
  });

  suite.test('Beta mobile QA 3: [M-40] Amazon\'s Department filter on a 390 phone: departments that differ only at the end ("…--Technical", "…--Non-Tech") can be told apart', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=amazon', viewport: P390 });
    await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').scrollIntoView({ inline: 'center' }));
    await sleep(200);
    await tapSel(page, '#quickChips [data-pop=dept]', 1000);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#filterBody details.fsec[open] label.check .check-label')].filter((e) => e.getClientRects().length).map((e) => ({ text: e.textContent.trim(), cut: e.scrollWidth > e.clientWidth + 1, title: e.closest('label')?.title || e.title || '' })));
    // Amazon's two project, program and product management departments ("…--Technical", "…--Non-Tech"; since fix-data-3,
    // UX-32, named "Technical …" and "Non-Technical …"), and any other two labels that start alike.
    const pm = rows.filter((r) => /Project\W+Program\W+(?:and )?Product Management/i.test(r.text));
    assert(pm.length >= 2, `the build has Amazon's two "Project/Program/Product Management" departments (${pm.length})`);
    const twins = rows.filter((r) => rows.some((o) => o !== r && o.text.slice(0, 30) === r.text.slice(0, 30)));
    const lost = twins.filter((r) => r.cut);
    if (lost.length) { await page.locator('#filterBody label.check', { hasText: twins[0].text }).first().evaluate((e) => e.scrollIntoView({ block: 'center' })); await shot(page, 'e2e-M-40-amazon-departments'); }
    assert(!lost.length, `cut to the same visible text: ${lost.map((r) => `"${r.text}"`).join(', ')}`);
  });

  suite.test('Beta mobile QA 3: [M-41] Insights row names are not cut on a 390 phone (short skills and places: "Networking", "Datacenters", "Mountain View")', async (ctx) => {
    const { page, go } = await phone(ctx, { hash: 'c=amazon&m=insights', viewport: P390 });
    const bad = [];
    for (const slug of ['amazon', 'google']) {
      await go(`c=${slug}&m=insights`, 600);
      await page.waitForSelector('#insightsHost .msi-row__name', { timeout: 60000 });
      await sleep(600);
      const cut = await page.evaluate(() => [...document.querySelectorAll('#insightsPanel .msi-row__name')].filter((e) => e.getClientRects().length && e.textContent.trim().length <= 16 && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim()));
      if (cut.length) { await page.evaluate((t) => [...document.querySelectorAll('#insightsPanel .msi-row__name')].find((e) => e.textContent.trim() === t)?.scrollIntoView({ block: 'center' }), cut[0]); await shot(page, `e2e-M-41-insights-names-${slug}`); }
      for (const t of cut) bad.push(`${slug}: "${t}"`);
    }
    assert(!bad.length, `${bad.length} short name(s) cut off:\n  ${bad.join('\n  ')}`);
  });

  suite.test('Beta mobile QA 3: [M-42] a "· N places" card and its job page show the same pay range (Amazon and Microsoft per-place postings)', async (ctx) => {
    const st = await serveBeta();
    if (!st) skip('no beta build');
    const bad = [];
    const { page, go } = await phone(ctx, { hash: 'c=amazon', viewport: P390 });
    for (const slug of ['amazon', 'microsoft']) {
      const jobs = await boardJobs(st, slug);
      const titles = new Map();
      for (const j of jobs) titles.set(j.title, (titles.get(j.title) || 0) + 1);
      const j = jobs.find((x) => x.salary?.ranges?.length >= 2 && titles.get(x.title) === 1 && x.salary.currency === 'USD' && (Math.min(...x.salary.ranges.map((r) => r.min)) < x.salary.min - 1 || Math.max(...x.salary.ranges.map((r) => r.max)) > x.salary.max + 1));
      if (!j) continue;
      await go(`c=${slug}&q=${encodeURIComponent(j.title)}`, 800);
      await sheetTo(page, 'full');
      const pill = await page.evaluate((id) => document.querySelector(`#resultsList .card[data-id="${CSS.escape(id)}"] .sal-pill`)?.innerText.replace(/\s+/g, ' ').trim(), j.id);
      await openJob(go, page, j.id);
      const amt = await page.evaluate(() => document.querySelector('#drawer .d-sal-amt')?.innerText.replace(/\s+/g, ' ').trim());
      const cardRange = (pill || '').split(' · ')[0];
      if (!pill || cardRange !== amt) { bad.push(`${slug} ${j.id} "${j.title}": card "${pill}", job page "${amt}"`); await shot(page, `e2e-M-42-places-${slug}`); }
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: [M-43] a tap on an Amazon preview card answers at once (Slow 4G, 4x CPU): the job opens, or the card says it is opening', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=amazon', wait: false, throttle: { cpu: 4 } });
    await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 60000 });
    await tapSel(page, '#sheetHandle', 900);
    const r = await page.evaluate(() => { const c = document.querySelectorAll('#resultsList .card[data-preview-id]')[1]; if (!c) return null; const b = c.getBoundingClientRect(); return { id: c.dataset.previewId, x: b.left, y: b.top, width: b.width, height: b.height }; });
    assert(r, 'a preview card is on screen at half sheet');
    await tapBox(page, r, 400);
    const fb = await page.evaluate((id) => {
      const c = document.querySelector(`#resultsList .card[data-preview-id="${CSS.escape(id)}"]`);
      const toast = document.querySelector('#toast');
      return { previewing: !!document.querySelector('#resultsList .card[data-preview-id]'), drawer: !document.querySelector('#drawer').hidden, busy: c?.getAttribute('aria-busy') === 'true' || /is-pending|is-opening|is-busy/.test(c?.className || ''), toast: toast && !toast.hidden ? toast.innerText : '' };
    }, r.id);
    if (!fb.previewing) skip('the whole list landed before the tap (machine too fast for this check)');
    await shot(page, 'e2e-M-43-preview-tap');
    assert(fb.drawer || fb.busy || fb.toast, `400 ms after the tap on "${r.id}" nothing shows it was heard: no job page, no busy card, no message (the job opens only when the whole list lands)`);
  });

  suite.test('Beta mobile QA 3: [M-44] after a tap on a map pin, its tooltip is on screen and above the results sheet (or gone) [fix-touch-tips]', async (ctx) => {
    const bad = [];
    for (const slug of ['google', 'apple']) {
      const { page, go } = await phone(ctx, { hash: `c=${slug}&m=map`, viewport: P390 });
      await page.waitForSelector('#mapHost .ms-pin', { timeout: 30000 });
      await sleep(800);
      const n = Math.min(4, await page.locator('#mapHost .ms-pin').count());
      for (let i = 0; i < n; i++) {
        await go(`c=${slug}&m=map`, 1500);
        const pin = page.locator('#mapHost .ms-pin').nth(i);
        await tapBox(page, await pin.boundingBox(), 900);
        const t = await page.evaluate(() => {
          const tip = [...document.querySelectorAll('.leaflet-tooltip')].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && +getComputedStyle(x).opacity > 0.05);
          if (!tip) return null;
          const r = tip.getBoundingClientRect(), sheet = document.querySelector('#results').getBoundingClientRect().top;
          return { text: tip.innerText.replace(/\s+/g, ' ').slice(0, 50), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), vw: innerWidth, sheet: Math.round(sheet) };
        });
        if (t && (t.left < 0 || t.right > t.vw || t.bottom > t.sheet)) {
          bad.push(`${slug} pin ${i} "${t.text}": tooltip ${t.left}..${t.right} on a ${t.vw} px screen, bottom ${t.bottom} under the sheet at ${t.sheet}`);
          await shot(page, `e2e-M-44-map-tooltip-${slug}-${i}`);
        }
      }
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: [M-45] "Microsoft" shows whole in the beta top bar at 380 and 390 px', async (ctx) => {
    const bad = [];
    for (const width of [380, 390]) {
      const { page } = await phone(ctx, { hash: 'c=microsoft', viewport: { width, height: 844 } });
      const m = await page.evaluate(() => { const n = document.querySelector('#companyMenuBtn .company-name'); const r = document.createRange(); r.selectNodeContents(n); return { name: n.textContent, text: r.getBoundingClientRect().width, box: n.getBoundingClientRect().width }; });
      if (m.text > m.box + 0.01) { bad.push(`${width}px: "${m.name}" is ${m.text.toFixed(1)} px in a ${m.box.toFixed(1)} px box, so it shows as "Micros…"`); await shot(page, `e2e-M-45-microsoft-topbar-${width}`); }
    }
    assert(!bad.length, bad.join('\n  '));
  });

  suite.test('Beta mobile QA 3: [M-46] with no pay in view, the stats line still says something (not a lone "Details")', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=google&l=Buenos+Aires', viewport: P390 });
    const s = await page.evaluate(() => ({ title: document.querySelector('#resultsTitle').textContent, line: document.querySelector('#statsLine .ms-note__line')?.innerText.trim() ?? '', all: document.querySelector('#statsLine')?.innerText.replace(/\s+/g, ' ').trim() }));
    assert(/\d+ roles?/.test(s.title), `Buenos Aires has roles on Google: "${s.title}"`);
    if (!s.line) await shot(page, 'e2e-M-46-bare-details');
    assert(s.line.length > 0, `the stats line for ${s.title} with no pay shows only "${s.all}"`);
  });

  suite.test('Beta mobile QA 3: [M-47] in landscape with the keyboard up, the Pay estimate title field stays above the keyboard', async (ctx) => {
    const { page } = await phone(ctx, { hash: 'c=amazon&m=insights', viewport: LAND, keyboard: 190 });
    await page.waitForSelector('#compHost input', { timeout: 60000 });
    await sleep(1500);
    const field = page.locator('#compHost input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]) >> visible=true').first();
    await field.evaluate((e) => e.scrollIntoView({ block: 'end' }));
    await sleep(300);
    await tapBox(page, await field.boundingBox(), 900);
    const r = await field.evaluate((e) => { const b = e.getBoundingClientRect(); return { focused: document.activeElement === e, top: Math.round(b.top), bottom: Math.round(b.bottom), vvh: Math.round(visualViewport.height) }; });
    assert(r.focused, 'the field has focus');
    if (r.bottom > r.vvh) await shot(page, 'e2e-M-47-landscape-keyboard');
    assert(r.bottom <= r.vvh && r.top >= 0, `the field (${r.top}–${r.bottom}) is under the keyboard: only 0–${r.vvh} is visible`);
  });
}

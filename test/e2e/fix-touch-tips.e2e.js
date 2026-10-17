// Fix lane fix-touch-tips (docs/process/fix-touch-tips.md). The user, 2026-10-16, on an iPhone (Safari, /beta/,
// an Amazon drawer's "Same role elsewhere"): "There seems to be a UI/UX bug where the floating box don't go away
// on a mobile." A tap on the Apple row left "$281K median … Click to see these roles" over the section.
//
// Why Chromium alone never showed it: headless Chromium fires `pointerleave` after a touch lifts, moves focus to a
// tapped `tabindex` element (so `blur` later hides the tip) and re-runs hover after a scroll. iOS Safari does none
// of that. After a tap it sends the mouse events it emulates (mouseover, mousemove, with pointer events) to the
// tapped element before the click, and never a leave; when those mouse events make new content appear (a hover
// tip), it treats the tap as the hover and sends no click (WebKit's content-change observer). A tap moves no focus
// to a plain element. So every phone check here plays the iPhone's sequence on any engine (an init script, below):
//   - a real touch tap (Chromium: CDP Input.dispatchTouchEvent touchStart/touchEnd; WebKit: page.touchscreen.tap);
//   - at its touchend, iOS's emulated pointerover/pointermove/mouseover/mousemove (pointerType "mouse") on the
//     element under the finger, before the click, and no click when they showed a tip;
//   - no focus moved by a tap to an element that is not a form field;
//   - scrolls by a touch drag (Chromium) or a wheel at the same point (WebKit); a drag emulates no mouse events.
//
// The rule these tests hold every floating box to (docs/process/fix-touch-tips.md, decision 1):
//   - a hover tip needs a real mouse: a touch, and the mouse events a phone emulates just after one, never open it;
//   - a tap does the item's action at once and shows no tip (chart circles, row labels and Ranges rows, Insights
//     filters, map pins);
//   - where the action takes you to another company's board (Same role elsewhere, Compare companies), or the item
//     has no action (the chart's pay strip), the first tap shows the tip ("Tap again to see these roles"), a second
//     tap on the same item does the action, and the tip closes on a tap anywhere else, a scroll, Esc or the action;
//   - the words follow the input ("Click …" with a mouse, "Tap again …" on touch, "Press Enter …" from the keyboard);
//   - a tip never stays in viewport pixels while its anchor scrolls away;
//   - mouse hover, keyboard, aria and Esc (D-8) work as before on a desktop.
//
// Serves the static build (BETA_QA_DIST or dist/) under /melon-seek/ and skips without a beta build. Runs in the
// suite (node scripts/e2e.js --grep='^Fix touch tips') and alone on any engine:
//   node test/e2e/fix-touch-tips.e2e.js [--browser=webkit|chromium] [--grep=re]
// The finger-wiggle checks need CDP and skip on WebKit.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, assert, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// FTT_PHONE=360x740 runs every 390x844 check at that size instead.
const PHONE = (() => { const m = /^(\d+)x(\d+)$/.exec(process.env.FTT_PHONE || ''); return m ? { width: +m[1], height: +m[2] } : { width: 390, height: 844 }; })();
const SMALL = { width: 360, height: 740 };
const DESKTOP = { width: 1440, height: 900 };
const COMPANY = 'google';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'fix-touch-tips');

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. */
async function serveDist() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(u.pathname.slice('/melon-seek/'.length)); } catch { res.writeHead(400); return res.end(); }
    let p = path.join(dist, rel);
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
  return { origin, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

const engineOf = (ctx) => ctx.browser.browserType().name();

/**
 * A page on the beta build at `hash`. phone: a touch phone (`size`, default PHONE: 390x844) whose taps never move focus to a
 * non-form element (iOS); otherwise a 1440x900 desktop with a mouse.
 */
async function open(ctx, hash, { phone = true, size = PHONE, dark = DARK, device = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build writes dist/beta/; or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const scheme = { colorScheme: dark ? 'dark' : 'light' };
  const context = await ctx.browser.newContext(device ? { ...contextFor(device, engineOf(ctx)), ...scheme } : phone
    ? { viewport: size, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...scheme }
    : { viewport: DESKTOP, deviceScaleFactor: 1, ...scheme });
  if (device) phone = true;
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  if (phone) {
    await context.addInitScript(() => {
      // iOS Safari moves no focus to a tapped element that is not a form field.
      document.addEventListener('mousedown', (e) => { if (!e.target.closest?.('input, select, textarea')) e.preventDefault(); }, true);
      // iOS Safari's emulated mouse events for a tap (not a drag), sent at its touchend, before the click.
      let start = null;
      const tipsShown = () => [...document.querySelectorAll('.ms-viz-tip, .msf-tip, .leaflet-tooltip')].filter((t) => !t.hidden && t.getClientRects().length).length;
      document.addEventListener('touchstart', (e) => { const t = e.touches[0]; start = t ? { x: t.clientX, y: t.clientY, moved: false } : null; }, true);
      document.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) start.moved = true; }, true);
      document.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        if (!t || !start || start.moved) return;
        const x = t.clientX, y = t.clientY, el = document.elementFromPoint(x, y);
        if (!el) return;
        const before = tipsShown();
        const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window };
        const pe = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
        el.dispatchEvent(new PointerEvent('pointerover', pe));
        el.dispatchEvent(new PointerEvent('pointermove', pe));
        el.dispatchEvent(new MouseEvent('mouseover', base));
        el.dispatchEvent(new MouseEvent('mousemove', base));
        if (tipsShown() > before) {
          // The hover showed new content: iOS sends no click for this tap.
          const stop = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
          window.addEventListener('click', stop, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 700);
        }
      }, true);
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${st.beta}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 90000 });
  await sleep(700);
  const company = new URLSearchParams(hash).get('c');
  const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base: st.beta, company });
  if (mode !== 'snapshot') skip(`${company} has no beta snapshot in the build (${mode})`);
  const engine = engineOf(ctx);
  const cdp = phone && engine === 'chromium' ? await context.newCDPSession(page) : null;
  const g = {
    page, base: st.beta, errors, engine,
    /** A real touch tap. */
    async tap(x, y, wait = 350) {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await sleep(50);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else await page.touchscreen.tap(x, y);
      await sleep(wait);
    },
    /** The iPhone's tap (the init script adds its emulated mouse events). */
    async iosTap(x, y) { await g.tap(x, y, 400); },
    /** A scroll: a touch drag from (x, y) by -dy (Chromium), else a wheel at that point. */
    async scroll(x, y, dy) {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (dy * i) / 10, id: 1 }] }); await sleep(16); }
        await sleep(80);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else { await page.mouse.move(x, y); await page.mouse.wheel(0, dy); }
      await sleep(600);
    },
    /** A finger down that moves 2 px (a real finger always does); returns the tips while it is down. null without CDP. */
    async wiggle(x, y) {
      if (!cdp) return null;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 2, y: y + 1, id: 1 }] });
      await sleep(200);
      const down = await tips(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await sleep(300);
      return down;
    },
    /** The point to tap on the nth match of `sel`, scrolled into view first only when it is not fully on screen. */
    async center(sel, nth = 0) {
      const loc = page.locator(sel).nth(nth);
      const moved = await loc.evaluate((e) => {
        const r = e.getBoundingClientRect();
        if (r.top >= 70 && r.bottom <= innerHeight - 130 && r.left >= 0 && r.right <= innerWidth) return false;
        e.scrollIntoView({ block: 'center' });
        return true;
      });
      if (moved) await sleep(300);
      const b = await loc.boundingBox();
      assert(b, `no box for ${sel}`);
      return { x: b.x + Math.min(b.width / 2, 80), y: b.y + b.height / 2, box: b };
    },
    hash: () => page.evaluate(() => decodeURIComponent(location.hash)),
    /**
     * The first match of `sel` (from `from`) that a finger can reach: scrolled into view when needed, its point not
     * under the results sheet, a bar or the drawer's footer. null when none is.
     */
    /** What covers the first match of `sel`: its box and the element at its centre (for the notes). */
    async why(sel) {
      return page.evaluate((sel) => {
        const e = document.querySelector(sel);
        if (!e) return 'none drawn';
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 80), r.top + r.height / 2);
        return `at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}, under ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}${hit.id ? `#${hit.id}` : ''}` : 'nothing (off screen)'}`;
      }, sel);
    },
    async reachable(sel, from = 0, tries = 12) {
      const n = await page.locator(sel).count();
      for (let i = from; i < Math.min(n, from + tries); i++) {
        const p = await page.locator(sel).nth(i).evaluate(async (e) => {
          const at = () => {
            const r = e.getBoundingClientRect();
            const x = r.left + Math.min(r.width / 2, 80), y = r.top + r.height / 2;
            // A tap is in the screen's px (the visual viewport); elementFromPoint in the page's.
            const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0, width: innerWidth, height: innerHeight };
            const sx = x - vv.offsetLeft, sy = y - vv.offsetTop;
            return sx >= 0 && sx < vv.width && sy >= 0 && sy < vv.height && e.contains(document.elementFromPoint(x, y)) ? { x: sx, y: sy, top: r.top - vv.offsetTop, bottom: r.bottom - vv.offsetTop } : null;
          };
          const settle = async () => {
            let last = null;
            for (let k = 0; k < 12; k++) {
              await new Promise((r) => setTimeout(r, 100));
              const t = e.getBoundingClientRect().top;
              if (last != null && Math.abs(t - last) < 0.5) return;
              last = t;
            }
          };
          await settle();
          let hit = at();
          if (!hit) { e.scrollIntoView({ block: 'center' }); await settle(); hit = at(); }
          return hit;
        });
        if (p) return p;
      }
      return null;
    },
  };
  return g;
}

/** The floating boxes on screen: the viz tip, the features tip and Leaflet's tooltip. */
function tips(page) {
  return page.evaluate(() => {
    // In the visual viewport's px: what the screen shows (a page wider than the screen pans it, as on the Razr cover).
    const ox = window.visualViewport?.offsetLeft || 0, oy = window.visualViewport?.offsetTop || 0;
    return [...document.querySelectorAll('.ms-viz-tip, .msf-tip, .leaflet-tooltip')]
      .filter((t) => !t.hidden && t.getClientRects().length && getComputedStyle(t).visibility !== 'hidden' && +getComputedStyle(t).opacity > 0.05)
      .map((t) => { const r = t.getBoundingClientRect(); return { text: t.innerText.replace(/\s+/g, ' ').trim(), left: r.left - ox, top: r.top - oy, right: r.right - ox, bottom: r.bottom - oy }; });
  });
}
const one = (list) => list.map((t) => `"${t.text.slice(0, 90)}" at ${Math.round(t.left)},${Math.round(t.top)}–${Math.round(t.right)},${Math.round(t.bottom)}`).join('; ');

/**
 * Screenshots for docs/screenshots/fix-touch-tips/ when FTT_SHOTS names the state ("before" or "after"):
 * <state>-<name>-<light|dark>.png. FTT_DARK=1 runs every page in the dark theme.
 */
const DARK = process.env.FTT_DARK === '1';
async function shot(page, name) {
  if (!process.env.FTT_SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${process.env.FTT_SHOTS}-${name}-${DARK ? 'dark' : 'light'}.png`) });
}

/** A Google posting with "Same role elsewhere" rows (2+ other companies), its id and the row slugs. */
async function compsPosting(g) {
  const found = await g.page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const { compsForJob } = await import(`${base}/features/comps.js`);
    const market = await api.getMarket();
    const jobs = ((await api.getJobs({ company })).jobs || []).filter((j) => j.salary && j.salary.min > 0);
    jobs.sort((a, b) => (b.extras?.equity ? 1 : 0) - (a.extras?.equity ? 1 : 0));
    for (const j of jobs.slice(0, 600)) {
      let r = null;
      try { r = compsForJob(market, j, { includeSelf: true }); } catch { continue; }
      if (r?.rows?.filter((x) => !x.current).length >= 2) return { id: j.id, slugs: r.rows.map((x) => x.slug) };
    }
    return null;
  }, { base: g.base, company: COMPANY });
  if (!found) skip(`no ${COMPANY} posting has "Same role elsewhere" rows in this build`);
  return found;
}
async function openDrawer(g, id) {
  await g.page.evaluate((id) => { location.hash = `c=${'google'}&job=${encodeURIComponent(id)}`; }, id);
  await g.page.waitForSelector('#drawer .ms-comps__row', { timeout: 30000 });
  await sleep(700);
}

export function registerFixTouchTipsTests(suite) {
  registerSizeMatrix(suite);
  // ---------------------------------------------------------------- Same role elsewhere (the user's report)
  for (const size of [PHONE, SMALL].filter((z, i, a) => a.findIndex((y) => y.width === z.width && y.height === z.height) === i)) {
    const at = `${size.width}x${size.height}`;
    suite.test(`Fix touch tips: Same role elsewhere, a tap on another company shows its tip and "Tap again"; the second tap opens it (${at})`, async (ctx) => {
      const g = await open(ctx, `c=${COMPANY}`, { size });
      const job = await compsPosting(g);
      await openDrawer(g, job.id);
      const i = await g.page.$$eval('#drawer .ms-comps__row', (rs) => rs.findIndex((r) => !r.classList.contains('is-current')));
      const slug = await g.page.$$eval('#drawer .ms-comps__row', (rs, i) => rs[i].querySelector('.ms-comps__label').textContent, i);
      const p = await g.center('#drawer .ms-comps__row', i);
      const h0 = await g.hash();
      await g.iosTap(p.x, p.y);
      const t1 = await tips(g.page);
      await shot(g.page, `comps-tap-p${size.width}`);
      assert(await g.hash() === h0, `the first tap opens nothing yet (hash ${h0} → ${await g.hash()})`);
      assert(t1.length === 1, `the first tap shows one tip for ${slug}: ${one(t1) || 'none'}`);
      assert(/Tap again to see these roles/.test(t1[0].text) && !/click/i.test(t1[0].text), `the tip says "Tap again to see these roles", not "Click": "${t1[0].text}"`);
      assert(t1[0].left >= 0 && t1[0].right <= size.width && t1[0].top >= 0 && t1[0].bottom <= size.height, `the tip is on screen: ${one(t1)}`);
      await g.iosTap(p.x, p.y);
      const h2 = await g.hash();
      assert(/c=/.test(h2) && !/job=/.test(h2) && !h2.includes(`c=${COMPANY}&`), `the second tap on the same row switches company (hash ${h2})`);
      const t2 = await tips(g.page);
      assert(!t2.length, `no tip is left after the switch: ${one(t2)}`);
      assert(!g.errors.length, `page errors: ${g.errors.join('; ')}`);
    });

    suite.test(`Fix touch tips: Same role elsewhere, the iPhone sequence leaves no tip after a tap elsewhere (${at})`, async (ctx) => {
      const g = await open(ctx, `c=${COMPANY}`, { size });
      const job = await compsPosting(g);
      await openDrawer(g, job.id);
      const p = await g.center('#drawer .ms-comps__row.is-current');
      await g.iosTap(p.x, p.y);
      const t1 = await tips(g.page);
      await shot(g.page, `comps-current-tap-p${size.width}`);
      assert(t1.length <= 1, `at most one tip: ${one(t1)}`);
      const e = await g.center('#drawer .d-comps .comps-note');
      await g.tap(e.x, e.y);
      const t2 = await tips(g.page);
      await shot(g.page, `comps-tap-elsewhere-p${size.width}`);
      assert(!t2.length, `a tap on the section's text closes the tip: ${one(t2)}`);
      // A second tap on the same row closes an open tip too (this row opens nothing: it is this company).
      const q = await g.center('#drawer .ms-comps__row.is-current');
      await g.iosTap(q.x, q.y);
      const t3 = await tips(g.page);
      await g.iosTap(q.x, q.y);
      const t4 = await tips(g.page);
      assert(t3.length === 1 && !t4.length, `tap, tap again on this company's row: tip, then none (${t3.length}, ${t4.length}: ${one(t4)})`);
    });
  }

  suite.test(`Fix touch tips: Same role elsewhere, a scroll of the drawer never leaves the tip in viewport pixels (${PHONE.width}x${PHONE.height})`, async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`);
    const job = await compsPosting(g);
    await openDrawer(g, job.id);
    const p = await g.center('#drawer .ms-comps__row.is-current');
    await g.iosTap(p.x, p.y);
    const t1 = await tips(g.page);
    assert(t1.length === 1, `the tap shows the row's tip: ${one(t1) || 'none'}`);
    const e = await g.center('#drawer .d-comps .comps-note');
    // The finger lands on the section's text (not the tip's row) and drags the drawer up by 160 px.
    const before = await g.page.locator('#drawer .ms-comps__row.is-current').boundingBox();
    await g.scroll(e.x, e.y + 4, 160);
    const after = await g.page.locator('#drawer .ms-comps__row.is-current').boundingBox();
    const t2 = await tips(g.page);
    await shot(g.page, `comps-scroll-p${PHONE.width}`);
    assert(Math.abs(after.y - before.y) > 40, `the drawer scrolled (row ${Math.round(before.y)} → ${Math.round(after.y)})`);
    const near = (t) => t.bottom >= after.y - 24 && t.top <= after.y + after.height + 24;
    assert(t2.every(near), `the tip closed or stayed by its row (row now ${Math.round(after.y)}–${Math.round(after.y + after.height)}): ${one(t2)}`);
  });

  suite.test('Fix touch tips: a finger that moves 2 px while down shows no hover tip (Same role elsewhere, chart circle, Ranges row, strip)', async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`);
    if (g.engine !== 'chromium') skip('needs CDP touchMove (Chromium)');
    const bad = [];
    const check = async (what, sel, nth = 0) => {
      const p = await g.center(sel, nth);
      const down = await g.wiggle(p.x, p.y);
      if (down.length) bad.push(`${what}: ${one(down)}`);
    };
    await check('chart circle', '#chartHost .ms-bin:not(.ms-bin--overflow)', 2);
    await check('pay strip', '#chartHost .ms-hist__bin', 6);
    const job = await compsPosting(g);
    await openDrawer(g, job.id);
    await check('Same role elsewhere', '#drawer .ms-comps__row', 0);
    await g.page.evaluate(() => { location.hash = 'c=google&v=ranges'; });
    await g.page.waitForSelector('#chartHost .ms-row', { timeout: 30000 });
    await sleep(800);
    await check('Ranges row', '#chartHost .ms-row', 2);
    assert(!bad.length, `a moving finger opened a tip: ${bad.join(' | ')}`);
  });

  suite.test('Fix touch tips: Same role elsewhere on a desktop: mouse says "Click", the keyboard says "Press Enter", Esc then Esc closes the drawer (D-8)', async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`, { phone: false });
    const job = await compsPosting(g);
    await openDrawer(g, job.id);
    const i = await g.page.$$eval('#drawer .ms-comps__row', (rs) => rs.findIndex((r) => !r.classList.contains('is-current')));
    const p = await g.center('#drawer .ms-comps__row', i);
    await g.page.mouse.move(p.x, p.y);
    await g.page.mouse.move(p.x + 3, p.y);
    await sleep(250);
    const t1 = await tips(g.page);
    await shot(g.page, 'comps-hover-desktop');
    assert(t1.length === 1 && /Click to see these roles/.test(t1[0].text), `hover shows "Click to see these roles": ${one(t1) || 'none'}`);
    const h = await g.center('#drawer .d-comps .comps-note');
    await g.page.mouse.move(h.x, h.y - 60);
    await sleep(250);
    assert(!(await tips(g.page)).length, `leaving the rows hides the tip: ${one(await tips(g.page))}`);
    // Keyboard: focus the list, arrow to another company's row.
    await g.page.focus('#drawer .ms-comps__list');
    let kbd = null;
    for (let k = 0; k < 8; k++) {
      await g.page.keyboard.press('ArrowDown');
      await sleep(150);
      kbd = await g.page.evaluate(() => {
        const list = document.querySelector('#drawer .ms-comps__list');
        const id = list.getAttribute('aria-activedescendant');
        const row = id && document.getElementById(id);
        return { id, role: row?.getAttribute('role'), selected: row?.getAttribute('aria-selected'), current: row?.classList.contains('is-current'), focused: document.activeElement === list };
      });
      if (kbd.id && !kbd.current) break;
    }
    const t2 = await tips(g.page);
    await shot(g.page, 'comps-keyboard-desktop');
    assert(kbd.id && kbd.role === 'option' && kbd.selected === 'true' && kbd.focused, `aria-activedescendant names the active option: ${JSON.stringify(kbd)}`);
    assert(t2.length === 1 && /Press Enter to see these roles/.test(t2[0].text) && !/click|tap/i.test(t2[0].text), `the keyboard tip says "Press Enter", never "Click": ${one(t2) || 'none'}`);
    await g.page.keyboard.press('Escape');
    await sleep(200);
    const s1 = await g.page.evaluate(() => ({ tip: [...document.querySelectorAll('.ms-viz-tip')].some((t) => !t.hidden), open: !!document.querySelector('#drawer.is-open'), ad: document.querySelector('#drawer .ms-comps__list')?.getAttribute('aria-activedescendant') }));
    assert(!s1.tip && s1.open && !s1.ad, `the first Esc clears the list's tip and active row, the drawer stays: ${JSON.stringify(s1)}`);
    await g.page.keyboard.press('Escape');
    await sleep(400);
    assert(!(await g.page.evaluate(() => !!document.querySelector('#drawer.is-open'))), 'the next Esc closes the drawer (D-8)');
  });

  // ---------------------------------------------------------------- the chart
  suite.test(`Fix touch tips: chart, a tap on a circle, a row name or a Ranges row acts at once and leaves no tip (${PHONE.width}x${PHONE.height})`, async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`);
    const p = await g.center('#chartHost .ms-bin:not(.ms-bin--overflow)', 2);
    await g.iosTap(p.x, p.y);
    const t1 = await tips(g.page);
    const chip = await g.page.evaluate(() => [...document.querySelectorAll('.area-chip .area-label')].map((e) => e.textContent).join(' | '));
    await shot(g.page, `chart-circle-tap-p${PHONE.width}`);
    assert(chip, 'the tap selected the circle (an area chip)');
    assert(!t1.length, `no tip after the iPhone tap on a circle: ${one(t1)}`);
    const e = await g.center('#resultsTitle');
    await g.tap(e.x, e.y);
    assert(!(await tips(g.page)).length, 'no tip after a tap elsewhere');
    const l = await g.center('#chartHost .ms-crow__label', 1);
    await g.iosTap(l.x, l.y);
    const t2 = await tips(g.page);
    assert(!t2.length, `no tip after a tap on a row's name: ${one(t2)}`);
    await g.page.evaluate(() => { location.hash = 'c=google&v=ranges'; });
    await g.page.waitForSelector('#chartHost .ms-row', { timeout: 30000 });
    await sleep(800);
    const r = await g.center('#chartHost .ms-row', 3);
    await g.iosTap(r.x, r.y);
    const t3 = await tips(g.page);
    assert(!t3.length, `no tip after the iPhone tap on a Ranges row: ${one(t3)}`);
  });

  suite.test(`Fix touch tips: chart pay strip, a tap shows the bar's tip; a tap elsewhere, the same bar again or a scroll closes it (${PHONE.width}x${PHONE.height})`, async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`);
    const p = await g.center('#chartHost .ms-hist__bin', 6);
    const bin = p.box;
    await g.iosTap(p.x, p.y);
    const t1 = await tips(g.page);
    await shot(g.page, `strip-tap-p${PHONE.width}`);
    assert(t1.length === 1 && /posting/.test(t1[0].text), `a tap on a bar of the strip shows its tip: ${one(t1) || 'none'}`);
    assert(t1[0].left >= 0 && t1[0].right <= PHONE.width && t1[0].top >= 0, `the tip is on screen: ${one(t1)}`);
    assert(t1[0].bottom <= bin.y + 2 || t1[0].top >= bin.y + bin.height - 2, `the tip does not sit under the finger: ${one(t1)} vs bar ${Math.round(bin.y)}–${Math.round(bin.y + bin.height)}`);
    const e = await g.center('#resultsTitle');
    await g.tap(e.x, e.y);
    assert(!(await tips(g.page)).length, `a tap elsewhere closes it: ${one(await tips(g.page))}`);
    await g.iosTap(p.x, p.y);
    await g.iosTap(p.x, p.y);
    assert(!(await tips(g.page)).length, `a second tap on the same bar closes it: ${one(await tips(g.page))}`);
    await g.iosTap(p.x, p.y);
    const row = await g.center('#chartHost .ms-crow', 1);
    await g.scroll(row.x, row.y, 120);
    const after = await g.page.locator('#chartHost .ms-hist__bin').nth(6).boundingBox();
    const t2 = await tips(g.page);
    assert(t2.every((t) => t.bottom >= after.y - 60 && t.top <= after.y + after.height + 60), `after a scroll the tip is closed or by its bar (${Math.round(after.y)}): ${one(t2)}`);
  });

  suite.test('Fix touch tips: chart on a desktop, mouse hover still shows and hides the tips (circle, strip)', async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`, { phone: false });
    const p = await g.center('#chartHost .ms-bin:not(.ms-bin--overflow)', 2);
    await g.page.mouse.move(p.x, p.y);
    await g.page.mouse.move(p.x + 1, p.y);
    await sleep(250);
    const t1 = await tips(g.page);
    await shot(g.page, 'chart-hover-desktop');
    assert(t1.length === 1 && /role/.test(t1[0].text), `hover on a circle shows its tip: ${one(t1) || 'none'}`);
    await g.page.mouse.move(5, 5);
    await sleep(250);
    assert(!(await tips(g.page)).length, 'leaving hides it');
    const s = await g.center('#chartHost .ms-hist__bin', 6);
    await g.page.mouse.move(s.x, s.y);
    await sleep(250);
    const t2 = await tips(g.page);
    assert(t2.length === 1 && /posting/.test(t2[0].text), `hover on the strip shows its tip: ${one(t2) || 'none'}`);
    await g.page.mouse.move(5, 5);
    await sleep(250);
    assert(!(await tips(g.page)).length, 'leaving the strip hides it');
  });

  // ---------------------------------------------------------------- Insights
  suite.test(`Fix touch tips: Compare companies, the first tap shows the tip and "Tap again", the second switches, no tip is left (${PHONE.width}x${PHONE.height})`, async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}&m=insights`);
    await g.page.waitForSelector('#compsCardHost .msi-row', { timeout: 30000 });
    await sleep(500);
    const i = await g.page.$$eval('#compsCardHost .msi-row', (rs) => rs.findIndex((r) => !r.classList.contains('is-current')));
    const p = await g.center('#compsCardHost .msi-row', i);
    const h0 = await g.hash();
    await g.iosTap(p.x, p.y);
    const t1 = await tips(g.page);
    await shot(g.page, `compare-tap-p${PHONE.width}`);
    assert(await g.hash() === h0, `the first tap switches nothing yet (${h0} → ${await g.hash()})`);
    assert(t1.length === 1 && /Tap again to see these roles/.test(t1[0].text) && !/click/i.test(t1[0].text), `the first tap shows the row's tip with "Tap again": ${one(t1) || 'none'}`);
    assert(t1[0].left >= 0 && t1[0].right <= PHONE.width && t1[0].top >= 0, `the tip is on screen: ${one(t1)}`);
    const e = await g.center('#compsCardHost .msi-card__title');
    await g.tap(e.x, e.y);
    assert(!(await tips(g.page)).length, `a tap elsewhere closes it: ${one(await tips(g.page))}`);
    const p2 = await g.center('#compsCardHost .msi-row', i);
    await g.iosTap(p2.x, p2.y);
    await g.iosTap(p2.x, p2.y);
    await sleep(800);
    const h2 = await g.hash();
    assert(h2 !== h0 && !h2.startsWith(`#c=${COMPANY}&`), `the second tap switches company (${h0} → ${h2})`);
    const t2 = await tips(g.page);
    assert(!t2.length, `no tip is left after the switch: ${one(t2)}`);
  });

  suite.test(`Fix touch tips: Insights filters act on the first tap and leave no tip; a desktop mouse still gets the tip (${PHONE.width}x${PHONE.height}, 1440x900)`, async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}&m=insights`);
    await g.page.waitForSelector('#insightsHost .msi-row', { timeout: 30000 });
    await sleep(500);
    const p = await g.center('#insightsHost .msi-row', 1);
    const h0 = await g.hash();
    await g.iosTap(p.x, p.y);
    const t1 = await tips(g.page);
    assert(await g.hash() !== h0, 'the tap filters at once');
    assert(!t1.length, `no tip after the iPhone tap: ${one(t1)}`);
    const d = await open(ctx, `c=${COMPANY}&m=insights`, { phone: false });
    await d.page.waitForSelector('#insightsHost .msi-row', { timeout: 30000 });
    await sleep(500);
    const q = await d.center('#insightsHost .msi-row', 1);
    await d.page.mouse.move(q.x, q.y);
    await d.page.mouse.move(q.x + 2, q.y);
    await sleep(250);
    const t2 = await tips(d.page);
    assert(t2.length === 1, `hover shows the row's tip on a desktop: ${one(t2) || 'none'}`);
    const c = await d.center('#compsCardHost .msi-row:not(.is-current)');
    await d.page.mouse.move(c.x, c.y);
    await d.page.mouse.move(c.x + 2, c.y);
    await sleep(250);
    const t3 = await tips(d.page);
    assert(t3.length === 1 && /Click to see these roles/.test(t3[0].text), `a Compare companies row says "Click to see these roles" to a mouse: ${one(t3) || 'none'}`);
  });

  // ---------------------------------------------------------------- the map
  suite.test(`Fix touch tips: map, a tap on a pin selects its place and opens no tooltip; a focused pin's tooltip stays on screen (${PHONE.width}x${PHONE.height})`, async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}&m=map`);
    await g.page.waitForSelector('#mapHost .ms-pin', { timeout: 30000 });
    await sleep(1500);
    // The results sheet down to its peek, so the pins are not under it.
    for (let k = 0; k < 3 && await g.page.evaluate(() => (document.body.dataset.sheet || 'peek') !== 'peek'); k++) {
      const hd = await g.page.locator('#sheetHandle').boundingBox();
      await g.tap(hd.x + hd.width / 2, hd.y + hd.height / 2, 600);
    }
    const pins = await g.page.$$eval('#mapHost .leaflet-marker-icon', (els) => els.map((e) => {
      const b = e.querySelector('.ms-pin')?.getBoundingClientRect();
      if (!b) return null;
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      return { x, y, ok: document.elementFromPoint(x, y)?.closest('.leaflet-marker-icon') === e };
    }).filter(Boolean));
    const pin = pins.find((p) => p.ok);
    assert(pin, `a pin on screen above the sheet: ${JSON.stringify(pins.slice(0, 5))}`);
    await g.iosTap(pin.x, pin.y);
    const t1 = await tips(g.page);
    const chip = await g.page.evaluate(() => [...document.querySelectorAll('.area-chip .area-label')].map((e) => e.textContent).join(' | '));
    await shot(g.page, `map-pin-tap-p${PHONE.width}`);
    assert(chip, 'the tap selected the pin\'s place (an area chip)');
    assert(!t1.length, `no tooltip after the iPhone tap on a pin: ${one(t1)}`);
    // Keyboard, on fresh phone pages (Google, Apple: the boards whose pins ran off): every pin's tooltip, on
    // focus, sits inside the map and the screen.
    for (const board of [COMPANY, 'apple']) {
      const k = await open(ctx, `c=${board}&m=map`);
      await k.page.waitForSelector('#mapHost .ms-pin', { timeout: 30000 });
      await sleep(1500);
      const out = await k.page.evaluate(async () => {
        const map = document.querySelector('#mapHost').getBoundingClientRect();
        const bad = [];
        let n = 0;
        for (const icon of [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].slice(0, 40)) {
          const b = icon.querySelector('.ms-pin')?.getBoundingClientRect();
          if (!b || b.right < map.left || b.left > map.right || b.bottom < map.top || b.top > map.bottom) continue;
          icon.focus({ preventScroll: true });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const t = [...document.querySelectorAll('#mapHost .leaflet-tooltip')].pop(); // the last: one closing may still fade
          if (!t) continue;
          n++;
          const r = t.getBoundingClientRect();
          if (r.left < Math.max(0, map.left) - 1 || r.right > Math.min(innerWidth, map.right) + 1 || r.top < map.top - 1 || r.bottom > map.bottom + 1) {
            bad.push(`${t.innerText.split('\n')[1] || ''}: ${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}–${Math.round(r.bottom)} (map ${Math.round(map.left)}–${Math.round(map.right)} × ${Math.round(map.top)}–${Math.round(map.bottom)})`);
          }
          icon.blur();
        }
        return { n, bad };
      });
      if (board === COMPANY && process.env.FTT_SHOTS) {
        // The screenshot: Bengaluru's pin, whose tooltip ran 107 px off a 390 px phone.
        await k.page.evaluate(async () => {
          for (const icon of document.querySelectorAll('#mapHost .leaflet-marker-icon')) {
            icon.focus({ preventScroll: true });
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            if ([...document.querySelectorAll('#mapHost .leaflet-tooltip')].pop()?.innerText.includes('Bengaluru')) return;
            icon.blur();
          }
        });
        await sleep(300);
        await shot(k.page, `map-pin-keyboard-p${PHONE.width}`);
      }
      assert(out.n > 0, `${board}: a focused pin opens its tooltip`);
      assert(!out.bad.length, `${board}: ${out.bad.length} of ${out.n} pin tooltips run off the map: ${out.bad.slice(0, 4).join('; ')}`);
    }
  });

  // ---------------------------------------------------------------- words a touch can reach
  suite.test('Fix touch tips: words that a tap can reach (keywords, household, pay labels, chart rows, legend, Save)', async (ctx) => {
    const g = await open(ctx, `c=${COMPANY}`);
    const bad = [];
    // Chart row names: "tap or click", never a bare "Click".
    const titles = await g.page.$$eval('#chartHost .ms-crow__label', (els) => els.map((e) => e.title));
    if (titles.some((t) => /(^|\. )Click to/.test(t))) bad.push(`a chart row's name says "Click to": ${titles.find((t) => /(^|\. )Click to/.test(t))}`);
    const job = await compsPosting(g);
    await openDrawer(g, job.id);
    const d = await g.page.evaluate(() => {
      const kw = document.querySelector('#drawer .d-kw');
      const labels = [...document.querySelectorAll('#drawer .pay-label')].map((e) => ({ text: e.textContent, title: e.title }));
      const details = [...document.querySelectorAll('#drawer .d-pay-note .ms-note__list li')].map((e) => e.textContent).join(' | ');
      return { kw: kw ? kw.querySelector('summary, h3, .fsec-head, button')?.textContent || kw.textContent.slice(0, 60) : null, labels, details };
    });
    if (d.kw && /click/i.test(d.kw)) bad.push(`the Keywords heading says "click": "${d.kw}"`);
    const more = await g.center('#drawer .d-pay-note .ms-note__more');
    await g.tap(more.x, more.y);
    await shot(g.page, `drawer-pay-details-p${PHONE.width}`);
    for (const l of d.labels) if (l.title && !d.details.includes(l.title.replace(/\.$/, ''))) bad.push(`pay label "${l.text}": its meaning "${l.title}" is only in a hover title (Details: ${d.details.slice(0, 120)})`);
    // Juice household: the picked household's meaning in one line under its buttons.
    const juice = await g.page.$('#drawer .juice-details');
    if (juice) {
      await g.page.evaluate(() => { document.querySelector('#drawer .juice-details').open = true; });
      await sleep(300);
      const hh = await g.page.evaluate(() => {
        const note = document.querySelector('#drawer .juice-hh-note');
        const on = document.querySelector('#drawer .juice-household [aria-pressed="true"]');
        if (!note) return { note: null, on: on?.textContent };
        const lh = parseFloat(getComputedStyle(note).lineHeight) || 16;
        return { note: note.textContent, lines: Math.round(note.getBoundingClientRect().height / lh), on: on?.textContent };
      });
      if (!hh.note) bad.push(`no line says who "${hh.on}" means (only a hover title)`);
      else if (hh.lines > 1) bad.push(`the household line wraps to ${hh.lines} lines: "${hh.note}"`);
      await g.page.evaluate(() => document.querySelector('#drawer .juice-details').scrollIntoView({ block: 'start' }));
      await sleep(300);
      await shot(g.page, `drawer-juice-household-p${PHONE.width}`);
      // Each household's line fits the phone in full (no ellipsis), after a tap on its button.
      if (hh.note) {
        for (const key of ['couple', 'family', 'single']) {
          await g.page.evaluate(() => { const j = document.querySelector('#drawer .juice-details'); if (j) j.open = true; });
          const b = await g.center(`#drawer .juice-household [data-household="${key}"]`);
          await g.tap(b.x, b.y, 500);
          const fit = await g.page.evaluate(() => {
            const j = document.querySelector('#drawer .juice-details');
            if (j) j.open = true;
            const n = document.querySelector('#drawer .juice-hh-note');
            return n && { text: n.textContent, cut: n.scrollWidth > n.clientWidth + 1 };
          });
          if (!fit) bad.push(`no household line after a tap on "${key}"`);
          else if (fit.cut) bad.push(`the household line is cut off on a ${PHONE.width} px phone: "${fit.text}"`);
        }
      }
    } else ctx.notes.push('fix-touch-tips: the posting has no Juice; the household line was not checked');
    // The Ranges legend's striped key: no "hover".
    await g.page.evaluate(() => { location.hash = 'c=google&v=ranges'; });
    await g.page.waitForSelector('#chartHost .ms-row', { timeout: 30000 });
    await sleep(600);
    const stripe = await g.page.$eval('#chartHost', (h) => h.querySelector('.ms-legend__span')?.title || '');
    if (/hover/i.test(stripe)) bad.push(`the striped key says "hover": ${stripe}`);
    // Save: "Press again to remove", not "click".
    await g.page.evaluate(() => { location.hash = 'c=google&q=engineer'; });
    await sleep(900);
    const save = await g.page.$('#saveSearch:not([hidden])');
    if (save) {
      await save.evaluate((b) => b.click());
      await sleep(400);
      const t = await save.evaluate((b) => b.title);
      if (!/Press again to remove/.test(t) || /click/i.test(t)) bad.push(`the saved search's button says: "${t}"`);
      await save.evaluate((b) => b.click());
    } else ctx.notes.push('fix-touch-tips: the Save button was hidden; its words were not checked');
    assert(!bad.length, bad.join(' | '));
  });
}

/**
 * Every phone size and posture in test/e2e/phone-sizes.mjs (the user, 2026-10-16: "Make sure we check for all phone
 * sizes from iPhone mini to razr to duo or something"): each kind of tip, by the iPhone's tap, on one page.
 *   - Same role elsewhere: the first tap's tip says "Tap again", is fully on screen, and a tap elsewhere closes it;
 *   - Compare companies: the same;
 *   - the chart's pay strip: a tap's tip is fully on screen, and a tap elsewhere closes it;
 *   - a chart circle and a map pin: the tap acts and leaves no tip;
 *   - every focused map pin's tooltip (the keyboard) inside the part of the map on screen.
 * An item no finger can reach at that size (under the sheet, off the page) is noted, not failed.
 */
function registerSizeMatrix(suite) {
  for (const device of ALL_SIZES) {
    suite.test(`Fix touch tips: every tip by touch on ${device.name} (${device.width}x${device.height})`, async (ctx) => {
      const g = await open(ctx, `c=${COMPANY}`, { device });
      const vw = device.width, vh = device.height;
      const bad = [], missed = [];
      const onScreen = (t) => t.left >= -0.5 && t.right <= vw + 0.5 && t.top >= -0.5 && t.bottom <= vh + 0.5;
      const elsewhere = async () => {
        const e = await g.reachable('#chartHost .ms-note__line, #chartHost .ms-crow__sub');
        if (e) await g.tap(e.x, e.y);
      };
      // The results sheet down to its peek (a circle's or a pin's selection raises it over the page), by its handle.
      const lowerSheet = async () => {
        for (let k = 0; k < 3 && await g.page.evaluate(() => (document.body.dataset.sheet || 'peek') !== 'peek'); k++) {
          const hd = await g.page.locator('#sheetHandle').boundingBox();
          if (!hd) break;
          const vv = await g.page.evaluate(() => [window.visualViewport?.offsetLeft || 0, window.visualViewport?.offsetTop || 0]);
          await g.tap(hd.x + hd.width / 2 - vv[0], hd.y + hd.height / 2 - vv[1], 600);
        }
      };
      // The chart's pay strip shows its tip.
      const bar = await g.reachable('#chartHost .ms-hist__bin', 6);
      if (bar) {
        await g.iosTap(bar.x, bar.y);
        const t = await tips(g.page);
        if (t.length !== 1 || !onScreen(t[0])) bad.push(`strip: ${t.length} tips, want 1 on screen: ${one(t)}`);
        await elsewhere();
        if ((await tips(g.page)).length) bad.push(`strip: a tap elsewhere left ${one(await tips(g.page))}`);
      } else missed.push(`pay strip (${await g.why('#chartHost .ms-hist__bin')})`);
      // A chart circle acts at once (after the strip: its selection raises the results sheet over the chart).
      await lowerSheet();
      const circle = await g.reachable('#chartHost .ms-bin:not(.ms-bin--overflow)', 1, 40);
      if (circle) {
        await g.iosTap(circle.x, circle.y);
        const t = await tips(g.page);
        if (t.length) bad.push(`circle: a tip after the tap: ${one(t)}`);
        await g.page.evaluate(() => document.querySelector('.area-chip .area-x')?.click());
        await sleep(300);
      } else missed.push(`chart circle (${await g.why('#chartHost .ms-bin:not(.ms-bin--overflow)')})`);
      // Same role elsewhere.
      await lowerSheet();
      const job = await compsPosting(g);
      await openDrawer(g, job.id);
      const row = await g.reachable('#drawer .ms-comps__row:not(.is-current)');
      if (row) {
        const h0 = await g.hash();
        await g.iosTap(row.x, row.y);
        const t = await tips(g.page);
        if (await g.hash() !== h0) bad.push('Same role elsewhere: the first tap switched company');
        else if (t.length !== 1 || !/Tap again to see these roles/.test(t[0].text) || !onScreen(t[0])) bad.push(`Same role elsewhere: want one tip on screen saying "Tap again": ${one(t) || 'none'}`);
        const note = await g.reachable('#drawer .d-comps .comps-note');
        if (note) {
          await g.tap(note.x, note.y);
          if ((await tips(g.page)).length) bad.push(`Same role elsewhere: a tap elsewhere left ${one(await tips(g.page))}`);
        }
      } else missed.push(`Same role elsewhere row (${await g.why('#drawer .ms-comps__row:not(.is-current)')})`);
      // Compare companies.
      await g.page.evaluate(() => { location.hash = 'c=google&m=insights'; });
      await g.page.waitForFunction(() => !document.querySelector('#drawer.is-open') && document.querySelector('#compsCardHost:not([hidden]) .msi-row') && document.querySelector('#insightsHost .msi-row'), null, { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      await lowerSheet();
      const cmp = await g.reachable('#compsCardHost .msi-row:not(.is-current)');
      if (cmp) {
        const h0 = await g.hash();
        await g.iosTap(cmp.x, cmp.y);
        const t = await tips(g.page);
        if (await g.hash() !== h0) bad.push('Compare companies: the first tap switched company');
        else if (t.length !== 1 || !/Tap again/.test(t[0].text) || !onScreen(t[0])) bad.push(`Compare companies: want one tip on screen saying "Tap again": ${one(t) || 'none'}`);
        const head = await g.reachable('#compsCardHost .msi-card__title');
        if (head) {
          await g.tap(head.x, head.y);
          if ((await tips(g.page)).length) bad.push(`Compare companies: a tap elsewhere left ${one(await tips(g.page))}`);
        }
      } else missed.push(`Compare companies row (${await g.why('#compsCardHost .msi-row:not(.is-current)')})`);
      // The map: a focused pin's tooltip stays inside the part of the map on screen; a tap opens none.
      await g.page.evaluate(() => { location.hash = 'c=google&m=map'; });
      await g.page.waitForSelector('#mapHost .ms-pin', { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      await lowerSheet();
      await sleep(1300); // a keyboard focus right after a tap counts as that tap (TOUCH_GRACE_MS): wait it out
      const out = await g.page.evaluate(async () => {
        const map = document.querySelector('#mapHost').getBoundingClientRect();
        const lo = { left: Math.max(0, map.left), right: Math.min(innerWidth, map.right), top: Math.max(0, map.top), bottom: Math.min(innerHeight, map.bottom) };
        const res = { n: 0, bad: [] };
        for (const icon of [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].slice(0, 40)) {
          const b = icon.querySelector('.ms-pin')?.getBoundingClientRect();
          if (!b || b.right < lo.left || b.left > lo.right || b.bottom < lo.top || b.top > lo.bottom) continue;
          icon.focus({ preventScroll: true });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const t = [...document.querySelectorAll('#mapHost .leaflet-tooltip')].pop();
          if (t) {
            res.n++;
            const r = t.getBoundingClientRect();
            if (r.left < lo.left - 1 || r.right > lo.right + 1 || r.top < lo.top - 1 || r.bottom > lo.bottom + 1) {
              res.bad.push(`${(t.innerText.split('\n')[1] || '').slice(0, 40)}: ${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}–${Math.round(r.bottom)} (map on screen ${Math.round(lo.left)}–${Math.round(lo.right)} × ${Math.round(lo.top)}–${Math.round(lo.bottom)})`);
            }
          }
          icon.blur();
        }
        return res;
      });
      for (const b of out.bad) bad.push(`map pin tooltip (keyboard) off the map: ${b}`);
      if (!out.n) missed.push('a focused map pin');
      const pin = await g.reachable('#mapHost .leaflet-marker-icon .ms-pin');
      if (pin) {
        await g.iosTap(pin.x, pin.y);
        const t = await tips(g.page);
        if (t.length) bad.push(`map: a tooltip after the tap on a pin: ${one(t)}`);
      } else missed.push(`map pin (${await g.why('#mapHost .leaflet-marker-icon .ms-pin')})`);
      if (missed.length) ctx.notes.push(`fix-touch-tips ${device.name} ${device.width}x${device.height}: no finger can reach ${missed.join(', ')}`);
      assert(!bad.length, bad.join(' | '));
      assert(!g.errors.length, `page errors: ${g.errors.join('; ')}`);
    });
  }
}

// Standalone: node test/e2e/fix-touch-tips.e2e.js [--browser=webkit|chromium] [--grep=re]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createSuite, loadPlaywright, findChromium } = await import('./harness.js');
  const engine = (process.argv.find((a) => a.startsWith('--browser=')) || '--browser=chromium').slice(10);
  const grepArg = process.argv.find((a) => a.startsWith('--grep='));
  const pw = await loadPlaywright();
  if (!pw) { console.error('fix-touch-tips: the `playwright` package was not found'); process.exit(2); }
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: findChromium() } : {});
  console.log(`fix-touch-tips: ${engine} ${browser.version()}`);
  const suite = createSuite();
  registerFixTouchTipsTests(suite);
  const ctx = { data: {}, notes: [], cleanup: [], pw, browser };
  const results = await suite.run(ctx, grepArg ? new RegExp(grepArg.slice(7), 'i') : null);
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  if (ctx.notes.length) console.log(`\nnotes:\n  * ${[...new Set(ctx.notes)].join('\n  * ')}`);
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

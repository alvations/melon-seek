// Fix lane fix-ui-6 (docs/process/fix-ui-6.md): round 4's leftovers on the card, the job page, the filter sheet, the
// layout over 860 px and the map, at every size of test/e2e/phone-sizes.mjs where the item is about size (the user,
// 2026-10-16: "Make sure we check for all phone sizes from iPhone mini to razr to duo or something"):
//   B-1 under every grouping the card names the key its dot is coloured for, first, beside the dot (UX-50's pattern under
//       Group by Location and by Level);
//   B-2 the job page's level badge sits 10 px after the text before it (and the tag 6 px after the badge), with no "·" at
//       a line's start or end and nothing cut when the badge starts a line (M-51);
//   B-3 on touch screens over 860 px the filter sheet's "Show N roles" steps aside while the keyboard is up, as on phones,
//       and is back when it closes;
//   B-4 a tap on Filters starts the sheet's slide as soon on a touch screen over 860 px as on a phone;
//   B-5 on short touch screens over 860 px (Razr inner landscape 1005x412, iPhone Pro Max landscape 932x430) the chart is
//       as tall as with a mouse, and nothing scrolls;
//   B-6 from 861 px up the search box keeps a usable width and its words ("Search roles" or more), Refresh button or not;
//   B-7 on the map's first view no price pin, its pointer included, is under the map's own controls or the attribution,
//       with a basemap (tiles answered with a blank image, as a real phone loads them) at every size.
// Serves the static build (FUI6_DIST, else BETA_QA_DIST, else dist/) under /melon-seek/ the way GitHub Pages does, and
// skips without a beta build. Expected values come from the board's own list (public/api.js unpackJobs of the build's
// files) and the page's geometry, not from the code under test. FUI6_SHOTS=<label> saves screenshots to
// docs/screenshots/fix-ui-6/<label>-*.png. Run alone: node test/e2e/fix-ui-6.e2e.js [--grep=re]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, assert, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { unpackJobs } from '../../public/api.js';
import { displayLevel, levelLabel } from '../../public/features/roles.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT_LABEL = process.env.FUI6_SHOTS || '';
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots', 'fix-ui-6');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const DESKTOP = { name: 'Desktop', width: 1440, height: 900 };
const LAPTOP = { name: 'Small laptop', width: 1024, height: 768 };
const at = (w, h) => { const d = ALL_SIZES.find((s) => s.width === w && s.height === h); assert(d, `test/e2e/phone-sizes.mjs lists ${w}x${h}`); return d; };
const label = (d) => `${d.name} ${d.width}x${d.height}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let shared = null;
/** Serve the build under /melon-seek/ (gzip, like Pages); null without a beta build. One server for the run. */
async function serveDist() {
  if (shared) return shared;
  const dist = path.resolve(process.env.FUI6_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
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

const lists = new Map();
/** A board's postings, unpacked from the build's static list (the objects the page gets). Skips without it. */
async function boardJobs(st, board, site = 'beta/') {
  const key = `${site}${board}`;
  if (!lists.has(key)) {
    const f = path.join(st.dist, site, 'api', 'jobs', `${board}.json`);
    if (!fs.existsSync(f)) skip(`no ${board} list in this build`);
    lists.set(key, await unpackJobs(JSON.parse(fs.readFileSync(f, 'utf8'))));
  }
  return lists.get(key);
}

/** A 256x256 light grey PNG: the stand-in basemap tile (the sandbox cannot reach tile.openstreetmap.org). */
const TILE = (() => {
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + 256 * 3, 228); row[0] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: 256 }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
})();

/**
 * A fresh page: `size` is a phone-sizes.mjs entry (touch, its DPR and user agent), or { width, height } for a mouse.
 * mouse: true opens a phone entry's viewport with a mouse instead (pointer: fine). tiles: answer basemap tiles.
 */
async function open(ctx, size, { hash = 'c=apple', site = 'beta/', mouse = false, tiles = false, init = null, colorScheme = 'light' } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build writes dist/beta/)');
  const opts = size.ua && !mouse ? contextFor(size, 'chromium') : { viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 };
  const context = await ctx.browser.newContext({ ...opts, colorScheme });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => {
    if (tiles && /^https:\/\/tile\.openstreetmap\.org\//.test(r.request().url())) return r.fulfill({ status: 200, contentType: 'image/png', body: TILE, headers: { 'access-control-allow-origin': '*' } });
    return r.abort('blockedbyclient');
  });
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e && e.message || e).slice(0, 300)}`));
  const go = async (h) => {
    await page.goto(`${st.base}${site}#${h}`, { timeout: 60000 });
    await ready(page);
  };
  await go(hash);
  return { st, context, page, errors, go };
}
/** The board's list is in: the count, and a card. */
const ready = (page) => page.waitForFunction(() => {
  const t = document.querySelector('#resultsTitle');
  return t && !/Loading/.test(t.textContent) && /\d/.test(t.textContent) && document.querySelector('#resultsList .card[data-id]');
}, null, { timeout: 90000 }).then(() => sleep(500));
async function shot(page, name) {
  if (!SHOT_LABEL) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${SHOT_LABEL}-${name}.png`), timeout: 15000 }).catch(() => {});
}

/* ------------------------------------------------------------------------------------------------------------- B-1 */

/** What a card's meta line must name first for its grouping, and the key its dot's colour stands for. */
function cardWant(job, dim) {
  const dept = job.department || 'No department';
  if (dim === 'brand') { const b = job.brand || job.companyName || 'No company'; return { key: b, first: `${b} · ${dept}`, cls: 'card-dept' }; }
  if (dim === 'seniority') { const k = displayLevel(job); return { key: k, first: `${levelLabel(k)} · ${dept}`, cls: 'card-dept' }; }
  if (dim === 'location') {
    const locs = job.locations || [];
    const on = locs.find((l) => l && !l.remote);
    const key = on ? on.city || on.name || 'Unknown' : job.remote || locs.some((l) => l?.remote) ? 'Remote' : 'Unknown';
    const named = on ? (on.city && on.region ? `${on.city}, ${on.region}` : on.name) : null;
    return { key, first: named, cls: 'card-loc', startsWith: true };
  }
  return { key: dept, first: dept, cls: 'card-dept' };
}

/* ------------------------------------------------------------------------------------------------------------- B-2 */

/**
 * The job page's meta line: where its level badge and tag sit, and M-51's "·" rules. For a badge or tag on the line of
 * the item before it: the gap from that item's last text to the badge's box; for one that starts a line: how far it is
 * from the line's visible left edge (the clip M-51 puts there).
 */
function metaFacts() {
  const m = document.querySelector('#drawer .d-meta');
  if (!m || !m.getClientRects().length) return null;
  const mr = m.getBoundingClientRect();
  const cs = getComputedStyle(m);
  const inset = cs.clipPath && cs.clipPath !== 'none' ? parseFloat((cs.clipPath.match(/inset\(([^)]*)\)/)?.[1] || '0').split(/\s+/)[3] || '0') : 0;
  const clipL = mr.left + inset;
  const out = { items: [], problems: [] };
  const lastText = (el) => {
    const nodes = [];
    const walk = (n) => { if (n.nodeType === 3) { if (n.textContent.trim() && !n.parentElement.closest('.sep')) nodes.push(n); return; } for (const c of n.childNodes) walk(c); };
    walk(el);
    const t = nodes.pop();
    if (!t) return el.getBoundingClientRect();
    const r = document.createRange();
    r.selectNodeContents(t);
    const rs = [...r.getClientRects()].filter((x) => x.width > 0.5);
    return rs.length ? rs[rs.length - 1] : el.getBoundingClientRect();
  };
  for (const el of m.querySelectorAll(':scope > .sen, :scope > .tag')) {
    const a = el.getBoundingClientRect();
    if (!a.width) continue;
    let prev = el.previousElementSibling;
    while (prev && !prev.getClientRects().length) prev = prev.previousElementSibling;
    const want = el.classList.contains('sen') ? 10 : 6;
    const name = `${el.classList.contains('sen') ? 'level' : 'tag'} "${el.textContent.trim()}"`;
    const pb = prev?.getBoundingClientRect();
    const mid = (a.top + a.bottom) / 2;
    if (pb && mid >= pb.top && mid <= pb.bottom) {
      const gap = a.left - (prev.matches('.sen, .tag') ? pb.right : lastText(prev).right);
      out.items.push({ inline: true, gap: Math.round(gap * 10) / 10 });
      if (Math.abs(gap - want) > 1.5) out.problems.push(`the ${name} sits ${gap.toFixed(1)} px after "${prev.textContent.replace('·', '').trim()}" (want ${want})`);
    } else {
      out.items.push({ inline: false, left: Math.round((a.left - clipL) * 10) / 10 });
      if (a.left < clipL - 0.5) out.problems.push(`the ${name} starts a line and the line's clip cuts ${(clipL - a.left).toFixed(1)} px of it`);
      else if (a.left - clipL > 1.5) out.problems.push(`the ${name} starts a line ${(a.left - clipL).toFixed(1)} px in from the text above it`);
    }
  }
  // M-51: no "·" shows at a line's start or end (a wrapped line's leading "·" is clipped away).
  const bits = [];
  const walk = (n) => {
    if (n.nodeType === 3) {
      if (!n.textContent.trim()) return;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.width > 0.5) bits.push({ sep: n.textContent.trim() === '·', l: x.left, r: x.right, mid: x.top + x.height / 2 });
      return;
    }
    for (const c of n.childNodes) walk(c);
  };
  walk(m);
  const lines = [];
  for (const b of bits) { let L = lines.find((x) => Math.abs(x.mid - b.mid) < 6); if (!L) lines.push((L = { mid: b.mid, bits: [] })); L.bits.push(b); }
  for (const L of lines) {
    const seen = L.bits.filter((b) => b.r > clipL + 0.5).sort((a, b) => a.l - b.l);
    if (seen.length && seen[0].sep) out.problems.push('a line starts with "·"');
    if (seen.length && seen[seen.length - 1].sep) out.problems.push('a line ends with "·"');
  }
  out.text = m.innerText.replace(/\s+/g, ' ').trim();
  return out;
}

/* ------------------------------------------------------------------------------------------------------------- B-3 */

/**
 * A stand-in on-screen keyboard (headless engines have none): while a text field has focus, the visual viewport is
 * `k` px shorter, and it says so with a resize event (the matrix's M-52 stand-in).
 */
const KEYBOARD = (k) => {
  const desc = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height');
  Object.defineProperty(VisualViewport.prototype, 'height', {
    configurable: true,
    get() { const a = document.activeElement; return a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea') ? innerHeight - k : desc.get.call(this); },
  });
  const fire = () => setTimeout(() => visualViewport.dispatchEvent(new Event('resize')), 30);
  document.addEventListener('focusin', fire);
  document.addEventListener('focusout', fire);
};
/** Where "Show N roles" is: 'hidden', or its box and what the visual viewport shows. */
const doneBox = (page) => page.evaluate(() => {
  const b = document.querySelector('#filtersDone');
  if (!b || !b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') return 'hidden';
  const r = b.getBoundingClientRect();
  const top = visualViewport.offsetTop || 0;
  const x = Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)), y = Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2));
  const t = document.elementFromPoint(x, y);
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewTop: Math.round(top), viewBottom: Math.round(top + visualViewport.height), hit: !!t && (t === b || b.contains(t)) };
});
/** Open the filter sheet with a tap, and wait until its slide has ended. */
async function openFilters(page) {
  const b = await page.locator('#filtersToggle >> visible=true').first().boundingBox();
  assert(b, 'no Filters button');
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForFunction(() => document.body.classList.contains('filters-open') || getComputedStyle(document.querySelector('#filters')).position !== 'fixed', null, { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector('#filters').getAnimations().some((a) => a.playState === 'running'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
}

/* ------------------------------------------------------------------------------------------------------------- B-4 */

/**
 * In the page: from the tap on Filters to the start of the sheet's slide: the start time of its transform transition
 * (the frame it began in, on the document timeline, the clock of event times), read when its transitionrun arrives (the
 * event itself can wait behind later work). The tap is the touchstart's (or pointerdown's) time.
 */
const SLIDE_CLOCK = () => {
  window.__fui6 = { tap: null, run: null };
  addEventListener('touchstart', (e) => { if (e.target.closest?.('#filtersToggle') && window.__fui6.tap == null) window.__fui6.tap = e.timeStamp; }, { capture: true, passive: true });
  addEventListener('pointerdown', (e) => { if (e.target.closest?.('#filtersToggle') && window.__fui6.tap == null) window.__fui6.tap = e.timeStamp; }, { capture: true, passive: true });
  addEventListener('transitionrun', (e) => {
    if (e.target.id !== 'filters' || e.propertyName !== 'transform' || window.__fui6.run != null) return;
    const a = e.target.getAnimations().find((x) => x.transitionProperty === 'transform');
    if (!a) { window.__fui6.run = e.timeStamp; return; }
    if (a.startTime != null) window.__fui6.run = a.startTime;
    else a.ready.then(() => { window.__fui6.run = a.startTime ?? e.timeStamp; });
  }, true);
};
/** One tap on Filters on a fresh page of `size`: ms from the tap to the slide's start. */
async function slideStart(ctx, size, board) {
  const { page, context } = await open(ctx, size, { hash: `c=${board}`, init: { fn: SLIDE_CLOCK } });
  await sleep(1200);
  const b = await page.locator('#filtersToggle >> visible=true').first().boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForFunction(() => window.__fui6.run != null, null, { timeout: 8000 }).catch(() => {});
  const t = await page.evaluate(() => window.__fui6);
  await context.close();
  return t.run != null && t.tap != null ? t.run - t.tap : null;
}
const median = (v) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/* ------------------------------------------------------------------------------------------------------------- B-7 */

/** In the page: price pins whose tag or pointer (to the place) is under a map control or outside the map. */
function pinsCovered() {
  const host = document.querySelector('#mapHost');
  const m = host.getBoundingClientRect();
  const sheet = document.querySelector('#results')?.getBoundingClientRect();
  // A phone's results sheet over the map's foot: the map shows down to the sheet's top.
  const bottom = Math.min(m.bottom, sheet && sheet.left < m.right - 1 && sheet.right > m.left + 1 && sheet.top > m.top ? sheet.top : Infinity, innerHeight);
  const ctl = [...host.querySelectorAll('.leaflet-control')]
    .filter((e) => !e.classList.contains('ms-map__offline-note') && !e.classList.contains('ms-map__unplaced') && e.getClientRects().length)
    .map((e) => ({ name: e.classList.contains('leaflet-control-attribution') ? 'the attribution' : e.classList.contains('ms-remote') ? 'Remote' : e.classList.contains('ms-modes') ? 'Pay | Juice' : e.classList.contains('leaflet-control-zoom') ? 'zoom' : String(e.className).split(' ')[0], r: e.getBoundingClientRect() }))
    .filter((c) => c.r.width > 0 && c.r.height > 0);
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const out = [];
  let n = 0;
  for (const p of host.querySelectorAll('.ms-pin')) {
    const b = p.getBoundingClientRect();
    if (!b.width) continue;
    if (b.top >= bottom) continue; // wholly under a phone's results sheet: not on the first view
    n++;
    // The pointer (.ms-pin::after) reaches 7 px under the tag, to the place.
    const tip = { left: (b.left + b.right) / 2 - 5, right: (b.left + b.right) / 2 + 5, top: b.bottom, bottom: b.bottom + 7 };
    const what = p.innerText.replace(/\s+/g, ' ').trim().slice(0, 30);
    const under = ctl.filter((c) => hit(b, c.r)).map((c) => c.name);
    const tipUnder = ctl.filter((c) => !under.includes(c.name) && hit(tip, c.r)).map((c) => `${c.name} (its pointer)`);
    if (under.length || tipUnder.length) out.push(`"${what}" under ${[...under, ...tipUnder].join(', ')}`);
    else if (b.top < m.top - 0.5 || b.left < m.left - 0.5 || b.right > m.right + 0.5 || tip.bottom > bottom + 0.5) out.push(`"${what}" runs out of the map`);
  }
  return { n, out };
}

export function registerFixUi6Tests(suite) {
  /* ----------------------------------------------------------------------------------------------------------- B-1 */
  suite.test('fix-ui-6: [B-1] under every grouping each card names the key its dot is coloured for first, beside the dot, and cards of one key share one colour (Google, Apple, Amazon; desktop and 390 px)', async (ctx) => {
    const bad = [];
    let checked = 0;
    for (const size of [DESKTOP, at(390, 844)]) {
      for (const [board, dims] of [['google', ['none', 'department', 'brand', 'location', 'seniority']], ['apple', ['location', 'seniority']], ['amazon', ['location', 'seniority']]]) {
        const { st, page, errors, context } = await open(ctx, size, { hash: `c=${board}` });
        const jobs = await boardJobs(st, board);
        const byId = new Map(jobs.map((j) => [j.id, j]));
        for (const dim of dims) {
          if (dim === 'brand' && new Set(jobs.map((j) => j.brand).filter(Boolean)).size < 2) continue;
          await page.evaluate((g) => { location.hash = `${location.hash.replace(/^#/, '').replace(/(^|&)g=[^&]*/g, '')}&g=${g}`; }, dim);
          await page.waitForFunction((g) => document.querySelector('#groupBy')?.value === (g === 'none' ? 'none' : g), dim, { timeout: 15000 }).catch(() => {});
          await sleep(900);
          const cards = await page.$$eval('#resultsList .card[data-id]', (els) => els.slice(0, 40).map((c) => {
            const meta = c.querySelector('.card-meta');
            const dot = meta.querySelector('.card-dot');
            const first = dot?.nextElementSibling;
            return { id: c.dataset.id, dot: dot?.style.getPropertyValue('--dot').trim(), cls: first?.className || '', text: first?.textContent || '' };
          }));
          const colour = new Map();
          for (const c of cards) {
            const j = byId.get(c.id);
            if (!j) continue;
            checked++;
            const w = cardWant(j, dim);
            const ok = c.cls === w.cls && (w.startsWith ? w.first == null || c.text.startsWith(w.first) : c.text === w.first);
            if (!ok) bad.push(`${board} ${size.width}px g=${dim} ${c.id}: beside the dot "${c.text}" (${c.cls}), want ${w.startsWith ? 'a start of ' : ''}"${w.first}" (${w.cls})`);
            if (!colour.has(w.key)) colour.set(w.key, new Set());
            colour.get(w.key).add(c.dot);
          }
          for (const [k, set] of colour) if (set.size > 1) bad.push(`${board} ${size.width}px g=${dim}: cards of "${k}" have ${set.size} dot colours`);
          if (dim === 'location' && size === DESKTOP && board === 'amazon') await shot(page, `B-1-cards-location-${board}`);
          if (dim === 'seniority' && size === DESKTOP && board === 'apple') await shot(page, `B-1-cards-level-${board}`);
        }
        bad.push(...errors);
        await context.close();
      }
    }
    assert(checked > 200, `only ${checked} cards read`);
    assert(!bad.length, `${bad.length} card(s) name another key beside their dot:\n  ${bad.slice(0, 14).join('\n  ')}`);
  });

  /* ----------------------------------------------------------------------------------------------------------- B-2 */
  for (const size of [...ALL_SIZES, DESKTOP, LAPTOP]) {
    suite.test(`fix-ui-6: [B-2] [${label(size)}] the job page's level badge sits 10 px after the text before it and the tag 6 px after the badge; one that starts a line is whole and level with the text, and no "·" starts or ends a line (Amazon, Meta)`, async (ctx) => {
      const { page, errors } = await open(ctx, size, { hash: 'c=amazon' });
      const bad = [];
      let inline = 0, starts = 0;
      for (const board of ['amazon', 'meta']) {
        if (board !== 'amazon') await page.evaluate((b) => { location.hash = `c=${b}`; }, board).then(() => ready(page));
        const id = await page.evaluate(() => document.querySelector('#resultsList .card[data-id]')?.dataset.id);
        assert(id, `${board}: no card`);
        await page.evaluate((id) => { location.hash = `c=${id.split(':')[0]}&job=${encodeURIComponent(id)}`; }, id);
        await page.waitForFunction(() => !document.querySelector('#drawer').hidden && document.querySelector('#drawer .d-meta'), null, { timeout: 30000 });
        await sleep(500);
        for (let k = 0; k < 5; k++) {
          if (k) {
            const pos = await page.textContent('#drawerPos');
            await page.evaluate(() => document.querySelector('#drawerNext').click());
            await page.waitForFunction((p) => document.querySelector('#drawerPos')?.textContent !== p, pos, { timeout: 15000 }).catch(() => {});
            await sleep(350);
          }
          const f = await page.evaluate(metaFacts);
          if (!f) { bad.push(`${board} role ${k + 1}: no meta line`); continue; }
          inline += f.items.filter((x) => x.inline).length;
          starts += f.items.filter((x) => !x.inline).length;
          for (const p of f.problems) bad.push(`${board} role ${k + 1} ("${f.text.slice(0, 70)}"): ${p}`);
        }
      }
      if (bad.length || [280, 390, 1440].includes(size.width)) await shot(page, `B-2-meta-${slug(size.name)}-${size.width}x${size.height}`);
      assert(inline + starts > 0, 'no level badge read');
      assert(!bad.length && !errors.length, `${bad.length} problem(s) (${inline} badge(s) on the line before them, ${starts} starting a line):\n  ${[...bad, ...errors].slice(0, 10).join('\n  ')}`);
    });
  }

  /* ----------------------------------------------------------------------------------------------------------- B-3 */
  for (const size of ALL_SIZES) {
    suite.test(`fix-ui-6: [B-3] [${label(size)}] with the keyboard up in the filter sheet, "Show N roles" is out of the way (hidden, or above the keyboard), and back on screen when it closes`, async (ctx) => {
      const k = Math.round(size.height * 0.5);
      const { page, errors } = await open(ctx, size, { hash: 'c=apple', init: { fn: KEYBOARD, arg: k } });
      const bad = [];
      await openFilters(page);
      const before = await doneBox(page);
      if (before === 'hidden' || !before.hit || before.bottom > before.viewBottom + 1) bad.push(`before typing, "Show N roles" is not on screen: ${JSON.stringify(before)}`);
      const field = await page.evaluate(() => {
        const f = [...document.querySelectorAll('#filters input')].find((e) => !/checkbox|radio|range|hidden/.test(e.type) && e.getClientRects().length);
        if (!f) return null;
        f.id ||= 'fui6-field';
        return `#${CSS.escape(f.id)}`;
      });
      assert(field, 'no text field in the filter sheet');
      await page.focus(field);
      await sleep(900); // the stand-in keyboard's resize, then revealField after 300 ms
      const up = await doneBox(page);
      if (up !== 'hidden' && up.bottom > up.viewBottom + 1) bad.push(`with the keyboard up (${up.viewBottom} px of screen left), "Show N roles" is under it at y ${up.top}–${up.bottom}`);
      if (bad.length) await shot(page, `B-3-keyboard-${slug(size.name)}-${size.width}x${size.height}`);
      await page.evaluate(() => document.activeElement?.blur());
      await sleep(900);
      const after = await doneBox(page);
      if (after === 'hidden' || !after.hit || after.bottom > after.viewBottom + 1) bad.push(`with the keyboard closed, "Show N roles" is not back on screen: ${JSON.stringify(after)}`);
      assert(!bad.length && !errors.length, `${label(size)}: ${[...bad, ...errors].join('; ')}`);
    });
  }

  /* ----------------------------------------------------------------------------------------------------------- B-4 */
  suite.test('fix-ui-6: [B-4] a tap on Filters starts the sheet\'s slide on touch screens over 860 px (932x430, 1005x412, 1114x720) within 1.25x the phone\'s time (390x844) plus one frame, and within 250 ms (Amazon and Apple, medians of 3)', async (ctx) => {
    const wide = ALL_SIZES.filter((s) => s.width > 860 && s.height < s.width);
    const phone = at(390, 844);
    const bad = [];
    const rows = [];
    for (const board of ['apple', 'amazon']) {
      const p = [];
      for (let i = 0; i < 3; i++) p.push(await slideStart(ctx, phone, board));
      const base = median(p);
      assert(base != null, `${board}: the phone's sheet never started its slide`);
      for (const size of wide) {
        const v = [];
        for (let i = 0; i < 3; i++) v.push(await slideStart(ctx, size, board));
        const m = median(v);
        rows.push(`${board} ${size.width}x${size.height} ${m == null ? 'never' : `${Math.round(m)} ms`} (phone ${Math.round(base)} ms)`);
        if (m == null || m > Math.max(base * 1.25 + 17, base + 17) || m > 250) bad.push(rows[rows.length - 1]);
      }
    }
    console.log(`      slide starts: ${rows.join('; ')}`);
    assert(!bad.length, `the sheet starts late: ${bad.join('; ')}`);
  });

  /* ----------------------------------------------------------------------------------------------------------- B-5 */
  suite.test('fix-ui-6: [B-5] on short touch screens over 860 px (1005x412, 932x430) the chart is as tall as with a mouse (no shorter than before M-52), and nothing scrolls (Apple, Amazon, Google)', async (ctx) => {
    const sizes = ALL_SIZES.filter((s) => s.width > 860 && s.height <= 500);
    assert(sizes.length >= 2, 'the short over-860 px sizes');
    const bad = [];
    const rows = [];
    const geometry = (page) => page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
      const main = document.querySelector('#main');
      const se = document.scrollingElement;
      return {
        chart: Math.round((r('#chartHost')?.height || 0) * 10) / 10,
        scroll: { doc: se.scrollHeight - se.clientHeight, main: main.scrollHeight - main.clientHeight, body: document.body.scrollHeight - innerHeight, wide: se.scrollWidth - innerWidth },
        sortTop: Math.round(r('#sortBy')?.top ?? -1), statsTop: Math.round(r('#statsLine')?.top ?? -1),
      };
    });
    for (const size of sizes) {
      for (const board of ['apple', 'amazon', 'google']) {
        const t = await open(ctx, size, { hash: `c=${board}` });
        const touch = await geometry(t.page);
        if (board === 'apple') await shot(t.page, `B-5-chart-${size.width}x${size.height}-touch`);
        await t.context.close();
        const m = await open(ctx, size, { hash: `c=${board}`, mouse: true });
        const mouse = await geometry(m.page);
        await m.context.close();
        rows.push(`${board} ${size.width}x${size.height}: chart ${touch.chart} px with touch, ${mouse.chart} px with a mouse`);
        if (touch.chart < mouse.chart - 1) bad.push(`${board} ${size.width}x${size.height}: the chart is ${touch.chart} px with touch, ${mouse.chart} px with a mouse`);
        for (const [what, v] of Object.entries(touch.scroll)) if (v > 1) bad.push(`${board} ${size.width}x${size.height}: with touch the ${what} scrolls by ${v} px`);
        if (Math.abs(touch.sortTop - touch.statsTop) > 1) bad.push(`${board} ${size.width}x${size.height}: the Sort (top ${touch.sortTop}) is not level with the stats line (top ${touch.statsTop})`);
        bad.push(...t.errors, ...m.errors);
      }
    }
    console.log(`      ${rows.join('; ')}`);
    assert(!bad.length, bad.join('; '));
  });

  /* ----------------------------------------------------------------------------------------------------------- B-6 */
  for (const [site, board, why] of [['beta/', 'anthropic', 'a board with a Refresh button'], ['', 'anthropic', 'the main site, Refresh button'], ['beta/', 'microsoft', 'the longest built-in name'], ['beta/', 'amazon', 'the largest role count']]) {
    suite.test(`fix-ui-6: [B-6] [${site ? 'beta' : 'main site'} ${board}: ${why}] from 861 to 1440 px the search box is at least 200 px wide and shows its words ("Search roles" or more), with touch and with a mouse, and the top bar fits`, async (ctx) => {
      const widths = [];
      for (let w = 861; w < 1200; w += 6) widths.push(w);
      widths.push(1199, 1200, 1280, 1366, 1440);
      const bad = [];
      for (const mouse of [false, true]) {
        const base = mouse ? { width: 861, height: 800 } : { ...at(932, 430), width: 861 };
        const { page, errors } = await open(ctx, base, { hash: `c=${board}`, site, mouse });
        for (const w of widths) {
          await page.setViewportSize({ width: w, height: base.height });
          await sleep(220);
          const r = await page.evaluate(() => {
            const s = document.querySelector('#search');
            const tb = document.querySelector('.topbar');
            return { w: Math.round(s.getBoundingClientRect().width), ph: s.placeholder, refresh: !document.querySelector('#refreshBtn').hidden, over: Math.max(tb.scrollWidth - tb.clientWidth, document.documentElement.scrollWidth - innerWidth) };
          });
          const words = /^Search (roles|titles)/.test(r.ph);
          if (r.w < 200 || !words || r.over > 1) {
            bad.push(`${mouse ? 'mouse' : 'touch'} ${w}px${r.refresh ? ' (Refresh)' : ''}: search ${r.w} px "${r.ph}"${r.over > 1 ? `, the top bar ${r.over} px too wide` : ''}`);
            if (bad.length === 1) await shot(page, `B-6-search-${site ? 'beta' : 'main'}-${board}-${w}`);
          }
        }
        if (board === 'anthropic' && site) { await page.setViewportSize({ width: 861, height: base.height }); await sleep(300); await shot(page, `B-6-topbar-861-${mouse ? 'mouse' : 'touch'}`); }
        bad.push(...errors);
      }
      assert(!bad.length, `${bad.length} width(s):\n  ${bad.slice(0, 12).join('\n  ')}`);
    });
  }

  /* ----------------------------------------------------------------------------------------------------------- B-7 */
  for (const size of ALL_SIZES) {
    suite.test(`fix-ui-6: [B-7] [${label(size)}] on the map's first view, with a basemap, no price pin or its pointer is under the attribution, Remote, Pay | Juice or zoom, and none runs out of the map (Apple, Netflix, Meta)`, async (ctx) => {
      const bad = [];
      for (const board of ['apple', 'netflix', 'meta']) {
        const { page, context, errors } = await open(ctx, size, { hash: `c=${board}&m=map`, tiles: true });
        await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 }).catch(() => {});
        await page.waitForFunction(() => document.querySelector('#mapHost .leaflet-tile-loaded'), null, { timeout: 15000 }).catch(() => {});
        await sleep(2500);
        const r = await page.evaluate(pinsCovered);
        if (!r.n) bad.push(`${board}: no pin on the first view`);
        if (r.out.length) { bad.push(`${board}: ${r.out.join('; ')}`); await shot(page, `B-7-map-${board}-${size.width}x${size.height}`); }
        if (size.width === 352 && board === 'apple') await shot(page, `B-7-map-razr-cover-${board}`);
        bad.push(...errors);
        await context.close();
      }
      assert(!bad.length, `${label(size)}: ${bad.join(' | ')}`);
    });
  }
}

// Standalone: node test/e2e/fix-ui-6.e2e.js [--grep=re]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createSuite, loadPlaywright, findChromium } = await import('./harness.js');
  const grepArg = process.argv.find((a) => a.startsWith('--grep='));
  const pw = await loadPlaywright();
  if (!pw) { console.error('fix-ui-6: the `playwright` package was not found'); process.exit(2); }
  const browser = await pw.chromium.launch({ executablePath: findChromium() });
  console.log(`fix-ui-6: chromium ${browser.version()}`);
  const suite = createSuite();
  registerFixUi6Tests(suite);
  const ctx = { data: {}, notes: [], cleanup: [], pw, browser };
  const results = await suite.run(ctx, grepArg ? new RegExp(grepArg.slice(7), 'i') : null);
  await browser.close();
  if (shared) await shared.close();
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

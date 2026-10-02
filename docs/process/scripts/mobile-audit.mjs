// Mobile audit for melon-seek: layout checks + throttled perf + gesture frame times.
// usage: node audit.mjs <baseUrl> <label> [--perf] [--layout] [--shots=<dir>]
// Chromium only (no WebKit in /opt/pw-browsers): iOS is emulated by UA + viewport + touch.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright') /* NODE_PATH=<dir>/node_modules */;

const [base, label = 'run'] = process.argv.slice(2);
const flags = new Set(process.argv.slice(4));
const shotArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotArg ? shotArg.slice(8) : null;
const doPerf = flags.has('--perf') || !flags.has('--layout');
const doLayout = flags.has('--layout') || !flags.has('--perf');
const companies = (process.argv.find((a) => a.startsWith('--co=')) || '--co=anthropic,anduril').slice(5).split(',');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DEVICES = [
  { name: 'android-360x740', viewport: { width: 360, height: 740 }, ua: ANDROID },
  { name: 'iphone-390x844', viewport: { width: 390, height: 844 }, ua: IOS },
  { name: 'iphone-430x932', viewport: { width: 430, height: 932 }, ua: IOS },
  { name: 'iphone-land-844x390', viewport: { width: 844, height: 390 }, ua: IOS },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = () => {
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  window.__marks = {};
  const mo = new MutationObserver(() => {
    const t = performance.now();
    const ch = document.querySelector('#chartHost');
    if (!window.__marks.viz && ((ch && !ch.hidden && ch.querySelector('svg, .ms-row, .ms-bin')) || document.querySelector('#mapHost:not([hidden]) .leaflet-marker-icon'))) window.__marks.viz = t;
    if (!window.__marks.cards && document.querySelector('#resultsList .card[data-id]')) window.__marks.cards = t;
    if (window.__marks.viz && window.__marks.cards) mo.disconnect();
  });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
  window.__frames = null;
  window.__startFrames = () => { const f = window.__frames = []; let last = performance.now(); const loop = (t) => { if (window.__frames !== f) return; f.push(t - last); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
  window.__stopFrames = () => { const f = window.__frames || []; window.__frames = null; return f; };
};

async function newPage(dev, { scheme = 'light', throttle = 0 } = {}) {
  const context = await browser.newContext({ viewport: dev.viewport, userAgent: dev.ua, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme: scheme, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  if (throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return { context, page, cdp, errors };
}

async function waitReady(page, timeout = 30000) {
  await page.waitForFunction(() => document.querySelector('#resultsList .card[data-id]') && document.querySelector('#resultsTitle strong'), null, { timeout });
}

/* ------------------------------------------------------------- layout */
const LAYOUT = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return null; if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return null; return r; };
  const reachable = (el, r) => { const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2)); const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t) || t.contains(el)); };
  const desc = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); const tx = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24); return tx ? `${s} "${tx}"` : s; };
  const owner = (el) => (el.closest('.leaflet-container, .ms-chart, .ms-viz, #chartHost, #mapHost') ? 'viz' : el.closest('#insightsHost') ? 'features' : 'shell');
  const small = { shell: [], viz: [], features: [] };
  const seen = new Set();
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex="0"], label.check, label.radio, .leaflet-marker-icon')) {
    if (seen.has(el)) continue; seen.add(el);
    const r = vis(el); if (!r) continue;
    if (el.matches('input') && el.closest('label.check, label.radio, label.switch-row')) continue; // label is the target
    if (el.matches('.range')) continue; // thumb checked separately
    if (!reachable(el, r)) continue;
    if (Math.min(r.width, r.height) < 44 - 0.5) small[owner(el)].push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const smallText = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const tSeen = new Set();
  while (tw.nextNode()) {
    const n = tw.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || tSeen.has(el)) continue; tSeen.add(el);
    if (el.closest('.sr-only, [hidden], svg, script, style, .leaflet-control-attribution')) continue;
    const r = vis(el); if (!r) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs > 0 && fs < 12 - 0.01) smallText.push(`${owner(el)}:${desc(el)} ${fs}px`);
  }
  const inputs = [];
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea')) {
    if (!el.getClientRects().length) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) inputs.push(`${desc(el)} ${fs}px`);
  }
  // overflow: page scroll width, and elements poking out of the viewport that no ancestor clips
  const overflowEls = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); if (!r.width || r.right <= vw + 1) continue;
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.position === 'fixed') { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1) { clipped = true; break; } } }
    if (!clipped && getComputedStyle(el).position !== 'fixed') overflowEls.push(desc(el));
  }
  // fixed/sticky overlaps
  const fixed = [...document.querySelectorAll('body *')].filter((el) => { const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'sticky') && vis(el) && !el.matches('.scrim, .drawer-backdrop, .toast:not(.is-on)'); });
  const overlaps = [];
  for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) {
    const a = fixed[i], b = fixed[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix > 2 && iy > 2) overlaps.push(`${desc(a)} x ${desc(b)} (${Math.round(iy)}px)`);
  }
  const viz = document.querySelector('#vizArea:not([hidden])')?.getBoundingClientRect();
  const sheet = document.querySelector('#results')?.getBoundingClientRect();
  return {
    scrollW: document.documentElement.scrollWidth - vw, overflowEls: overflowEls.slice(0, 6),
    smallShell: small.shell.length, smallViz: small.viz.length, smallFeatures: small.features.length, smallSamples: small.shell.slice(0, 12), smallVizSamples: small.viz.slice(0, 4),
    smallText: smallText.length, smallTextSamples: smallText.slice(0, 10), inputsUnder16: inputs,
    overlaps, vizH: viz ? Math.round(viz.height) : null, vizVisibleH: viz && sheet ? Math.round(Math.max(0, Math.min(viz.bottom, sheet.top) - viz.top)) : null, sheetTop: sheet ? Math.round(sheet.top) : null,
  };
};

async function layoutAudit(dev, scheme) {
  const { context, page, errors } = await newPage(dev, { scheme });
  const out = {};
  const shot = async (n) => { if (SHOTS) try { await page.screenshot({ path: path.join(SHOTS, `${dev.name}-${scheme}-${n}.png`), timeout: 8000 }); } catch (e) { console.error('shot', n, String(e).slice(0, 80)); } };
  try {
    await page.goto(`${base}#c=anthropic`, { waitUntil: 'domcontentloaded' });
    await waitReady(page); await sleep(600);
    out.chart = await page.evaluate(LAYOUT); await shot('chart');
    // sheet: open fully via whatever the UI offers (tap handle)
    await page.tap('#sheetHandle').catch(() => {}); await sleep(450);
    out.sheet = await page.evaluate(LAYOUT); await shot('sheet');
    await page.tap('#sheetHandle').catch(() => {}); await sleep(450);
    // filters
    await page.tap('#filtersToggle'); await sleep(450);
    out.filters = await page.evaluate(LAYOUT); await shot('filters');
    const done = await page.$('#filtersDone'); if (done && await done.isVisible()) await done.tap(); else await page.keyboard.press('Escape');
    await sleep(400);
    // drawer
    const id = await page.$eval('#resultsList .card[data-id]', (c) => c.dataset.id);
    await page.evaluate((i) => { location.hash = location.hash.replace(/&?job=[^&]*/, '') + `&job=${encodeURIComponent(i)}`; }, id);
    await page.waitForSelector('#drawer.is-open'); await sleep(500);
    out.drawer = await page.evaluate(LAYOUT); await shot('drawer');
    await page.goBack(); await sleep(500);
    out.backClosesDrawer = await page.evaluate(() => document.querySelector('#drawer').hidden || !document.querySelector('#drawer').classList.contains('is-open'));
    // map
    await page.tap('.seg [data-mode="map"]'); await page.waitForSelector('#mapHost .leaflet-marker-icon', { timeout: 15000 }).catch(() => {}); await sleep(900);
    out.map = await page.evaluate(LAYOUT); await shot('map');
    out.mapTouchAction = await page.evaluate(() => { const m = document.querySelector('.leaflet-container'); return m ? getComputedStyle(m).touchAction : null; });
    // insights
    await page.tap('.seg [data-mode="insights"]'); await sleep(900);
    out.insights = await page.evaluate(LAYOUT); await shot('insights');
    // search focus: keyboard simulation (visual viewport shrink is not emulated; check font-size + position)
    out.searchFont = await page.$eval('#search', (e) => getComputedStyle(e).fontSize);
    out.errors = errors.slice(0, 5);
  } catch (e) { out.fail = String(e).slice(0, 300); await shot('fail'); }
  await context.close();
  return out;
}

/* --------------------------------------------------------------- perf */
async function touchDrag(cdp, page, from, to, steps = 18, stepMs = 16) {
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, y = from.y + (to.y - from.y) * i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y) });
    await sleep(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function framesDuring(page, fn) {
  await page.evaluate(() => window.__startFrames()); await sleep(100);
  await fn(); await sleep(450);
  const f = await page.evaluate(() => window.__stopFrames());
  f.shift();
  return { worst: Math.round(Math.max(0, ...f)), over50: f.filter((d) => d > 50).length, frames: f.length };
}

async function perfAudit(dev, company) {
  const { context, page, cdp, errors } = await newPage(dev, { throttle: 4 });
  const res = { device: dev.name, company };
  try {
    const t0 = Date.now();
    await page.goto(`${base}#c=${company}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, 60000);
    await sleep(3500); // let post-load work drain
    const m = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
      const lt = window.__lt.slice().sort((a, b) => a[0] - b[0]);
      const ready = Math.max(window.__marks.viz || 0, window.__marks.cards || 0);
      // TTI ~ end of the last long task that ends after the UI is ready and is followed by >= 2 s quiet.
      let tti = ready;
      for (const [s, d] of lt) { if (s + d > tti && s - tti < 2000) tti = s + d; }
      const tbt = lt.filter(([s]) => s > (fcp || 0)).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
      return { fcp: Math.round(fcp), viz: Math.round(window.__marks.viz || 0), cards: Math.round(window.__marks.cards || 0), tti: Math.round(tti), longTasks: lt.length, maxTask: Math.round(Math.max(0, ...lt.map((x) => x[1]))), tbt: Math.round(tbt), dom: document.querySelectorAll('*').length, cardsInDom: document.querySelectorAll('#resultsList .card').length };
    });
    Object.assign(res, m);
    const vw = dev.viewport.width, vh = dev.viewport.height;
    const lt0 = await page.evaluate(() => window.__lt.length);
    // 1) drag the sheet up from its handle, then back down
    const hb = await page.$eval('#sheetHandle', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: r.height > 0 }; });
    if (hb.vis) {
      res.sheetUp = await framesDuring(page, () => touchDrag(cdp, page, { x: hb.x, y: hb.y }, { x: hb.x, y: Math.max(80, hb.y - vh * 0.55) }));
      res.sheetTopAfterDrag = await page.$eval('#results', (e) => Math.round(e.getBoundingClientRect().top));
      // 2) scroll the list (ensure open first)
      await page.evaluate(() => { if (!document.body.classList.contains('sheet-open') && !document.body.dataset.sheet) document.querySelector('#sheetHandle').click(); }); await sleep(500);
      const lb = await page.$eval('#resultsList', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y0: Math.min(r.bottom - 20, innerHeight - 30), y1: Math.max(r.top + 20, 120) }; });
      res.listScroll = await framesDuring(page, async () => { for (let k = 0; k < 3; k++) await touchDrag(cdp, page, { x: lb.x, y: lb.y0 }, { x: lb.x, y: lb.y1 }, 14, 16); });
      res.listScrollTop = await page.$eval('#resultsList', (e) => Math.round(e.scrollTop));
      res.cardsAfterScroll = await page.evaluate(() => document.querySelectorAll('#resultsList .card').length);
    }
    // 3) map pan
    await page.evaluate(() => { const b = document.querySelector('#sheetHandle'); if (document.body.classList.contains('sheet-open') || ['full', 'half'].includes(document.body.dataset.sheet)) b.click(); });
    await page.evaluate(() => document.querySelector('.seg [data-mode="map"]').click());
    await page.waitForSelector('#mapHost .leaflet-marker-icon', { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    const mb = await page.$eval('#mapHost', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, 300) / 2 + 20 }; });
    const before = await page.evaluate(() => scrollY + document.scrollingElement.scrollTop);
    res.mapPan = await framesDuring(page, () => touchDrag(cdp, page, { x: mb.x - 80, y: mb.y }, { x: mb.x + 80, y: mb.y + 60 }));
    res.pageScrolledDuringPan = (await page.evaluate(() => scrollY + document.scrollingElement.scrollTop)) !== before;
    res.gestureLongTasks = (await page.evaluate(() => window.__lt.length)) - lt0;
    res.wallMs = Date.now() - t0;
  } catch (e) { res.fail = String(e).slice(0, 300); }
  res.errors = errors.slice(0, 3);
  await context.close();
  return res;
}

const report = { label, base, at: new Date().toISOString(), layout: {}, perf: [] };
if (doLayout) {
  for (const dev of DEVICES) for (const scheme of ['light', 'dark']) {
    report.layout[`${dev.name}-${scheme}`] = await layoutAudit(dev, scheme);
    process.stderr.write(`layout ${dev.name} ${scheme} done\n`);
  }
}
if (doPerf) {
  for (const dev of [DEVICES[0], DEVICES[1]]) for (const co of companies) {
    report.perf.push(await perfAudit(dev, co));
    process.stderr.write(`perf ${dev.name} ${co} done\n`);
  }
}
const outFile = path.join(process.env.OUT_DIR || process.cwd(), `report-${label}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(outFile);
await browser.close();

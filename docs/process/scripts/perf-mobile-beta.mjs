// Mobile performance audit for the beta site (docs/process/perf-mobile-beta.md). It extends
// perf-mobile.mjs (the main site's harness) for the big-tech boards:
//   - default companies apple, google, nvidia, microsoft, netflix and anduril, on /melon-seek/beta/;
//   - each long task is attributed: the CPU profile's samples inside the trace task, by phase
//     (innermost listed function) and by self time;
//   - a filter change and two sorts per company, besides the drawer, Insights and the map;
//   - the job list's transfer size per company, and the leak check cycles the four big boards.
// usage: NODE_PATH=<dir>/node_modules node perf-mobile-beta.mjs <baseUrl ending in /beta/> <label>
//          [--co=apple,google,...] [--net=fast4g,slow4g] [--no-extras] [--no-leak] [--leak-only]
// Device: 390x844, isMobile, touch, DPR 3, Android UA, 4x CPU, CDP Network.emulateNetworkConditions.
// Off-site hosts are routed through CDP Fetch (Playwright's route() disables the HTTP cache):
// map tiles get a 1x1 PNG, Google Fonts and the live board APIs are failed (Anduril: the
// CORS-failure path, so its bundled list, as in perf-mobile.md's "bundled path" table).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [base, label = 'run'] = process.argv.slice(2);
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const companies = arg('co', 'apple,google,nvidia,microsoft,netflix,anduril').split(',');
const nets = arg('net', 'fast4g,slow4g').split(',');
const EXTRAS = !process.argv.includes('--no-extras');
const LEAK = !process.argv.includes('--no-leak');
const LEAK_ONLY = process.argv.includes('--leak-only');
const TIMELINE = process.argv.includes('--timeline'); // every cold main-thread task >= 10 ms, attributed

// Chrome DevTools presets (Slow 4G is the preset formerly called "Fast 3G").
const NET = {
  slow4g: { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  fast4g: { offline: false, latency: 165, downloadThroughput: 1012500, uploadThroughput: 168750 },
};
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SWITCH = { apple: 'microsoft', microsoft: 'apple', google: 'nvidia', nvidia: 'google', netflix: 'apple', anduril: 'apple' };
const LEAK_CYCLE = ['google', 'nvidia', 'microsoft', 'apple'];
const loadavg = () => os.loadavg().map((x) => x.toFixed(2)).join(' ');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const INIT = () => {
  window.__marks = {};
  window.__raf = 0;
  const _raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => _raf((t) => { window.__raf++; cb(t); });
  const mo = new MutationObserver(() => {
    const t = performance.now();
    const ch = document.querySelector('#chartHost');
    if (!window.__marks.viz && ch && !ch.hidden && ch.querySelector('svg, .ms-row, .ms-bin')) {
      window.__marks.viz = t;
      _raf(() => setTimeout(() => { window.__marks.vizPaint = performance.now(); }, 0)); // next frame after the chart DOM
    }
    if (!window.__marks.cards && document.querySelector('#resultsList .card[data-id]')) {
      window.__marks.cards = t;
      _raf(() => setTimeout(() => { window.__marks.cardsPaint = performance.now(); }, 0));
    }
  });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
};

const LOAD_METRICS = () => ({
  fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
  chart: Math.round(window.__marks.vizPaint || window.__marks.viz || 0),
  cards: Math.round(window.__marks.cardsPaint || window.__marks.cards || 0),
  ready: Math.round(Math.max(window.__marks.vizPaint || window.__marks.viz || 0, window.__marks.cardsPaint || window.__marks.cards || 0)),
  dom: document.querySelectorAll('*').length,
});

function kindOf(type, url) {
  if (/tile\.openstreetmap|basemaps\.cartocdn/.test(url)) return 'tiles';
  if (type === 'Font' || /fonts\.(gstatic|googleapis)|\.woff2?(\?|$)/.test(url)) return 'fonts';
  if (type === 'Script') return 'js';
  if (type === 'Stylesheet') return 'css';
  if (/\.json(\?|$)/.test(url) || /boards-api|ashbyhq|api\.lever/.test(url)) return 'json';
  if (type === 'Document') return 'html';
  return 'other';
}

/** Network log via CDP: per-request kind + encoded bytes. */
function netLog(cdp) {
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, type: e.type, bytes: 0, ok: null, cached: false, t: e.timestamp }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.type = e.type; r.cached = !!(e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromServiceWorker); } });
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.cached = true; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.ok = true; r.end = e.timestamp; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) r.ok = false; });
  return {
    reset() { reqs.clear(); },
    summary() {
      const out = {};
      for (const r of reqs.values()) {
        const k = kindOf(r.type, r.url);
        const o = (out[k] ||= { n: 0, kB: 0, cached: 0, failed: 0 });
        o.n++; o.kB += r.bytes / 1000; if (r.cached) o.cached++; if (r.ok === false) o.failed++;
      }
      for (const o of Object.values(out)) o.kB = Math.round(o.kB);
      return out;
    },
    /** Transfer kB of the company's job list (and of every other api/ JSON, by path). */
    api() {
      const out = {};
      for (const r of reqs.values()) { const m = r.url.match(/\/(api\/[^?#]+\.json)/); if (m) out[m[1]] = Math.round(r.bytes / 100) / 10; }
      return out;
    },
    list() { return [...reqs.values()]; },
    waterfall() {
      const all = [...reqs.values()]; const t0 = Math.min(...all.map((r) => r.t));
      return all.sort((a, b) => a.t - b.t).map((r) => `${Math.round((r.t - t0) * 1000)}-${r.end ? Math.round((r.end - t0) * 1000) : 'x'} ${kindOf(r.type, r.url)} ${Math.round(r.bytes / 100) / 10}kB ${r.cached ? '(cache) ' : ''}${r.url.replace(/^https?:\/\/[^/]+\/(melon-seek\/)?/, '').slice(0, 70)}`);
    },
  };
}

// Main-thread tasks from a Chrome trace (RunTask on CrRendererMain), the source DevTools uses.
// The Long Tasks API misses work that runs as a promise continuation of fetch() (getJobs' unpack,
// vet and juice), so it is not used.
async function traceStart(cdp) {
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'loading', 'v8'], excludedCategories: ['*'] } });
}
async function traceStop(cdp) {
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  const chunks = [];
  for (;;) { const c = await cdp.send('IO.read', { handle: stream, size: 1 << 22 }); chunks.push(c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data); if (c.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  const ev = JSON.parse(chunks.join(''));
  const events = Array.isArray(ev) ? ev : ev.traceEvents;
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.set(`${e.pid}:${e.tid}`, true);
  const count = new Map();
  for (const e of events) if (e.name === 'RunTask' && e.ph === 'X' && names.has(`${e.pid}:${e.tid}`)) count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) || 0) + 1);
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  const navs = events.filter((e) => e.name === 'navigationStart' && `${e.pid}:${e.tid}` === main && e.args?.data?.isLoadingMainFrame && /^https?:/.test(e.args.data.documentLoaderURL || '')).map((e) => e.ts).sort((a, b) => a - b);
  const tasks = events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && `${e.pid}:${e.tid}` === main).map((e) => [e.ts, e.dur / 1000]);
  // Inside each task: GC, layout, style, parse (for attribution beside the JS profile).
  const inner = events.filter((e) => e.ph === 'X' && `${e.pid}:${e.tid}` === main && ['Layout', 'UpdateLayoutTree', 'Paint', 'MajorGC', 'MinorGC', 'V8.GC_MC_BACKGROUND_MARKING', 'ParseHTML', 'v8.compile', 'v8.parseOnBackground', 'EvaluateScript', 'v8.compileModule', 'PrePaint', 'Layerize'].includes(e.name)).map((e) => [e.ts, e.dur / 1000, e.name]);
  return { tasks, inner, navStart: navs.length ? navs[0] : null };
}

/** Long tasks (>= 50 ms) in [from, to] ms after navStart: n, max, TBT, the >= 100 ms ones, raw. */
function longTasks(tr, from = 0, to = Infinity) {
  const lt = tr.tasks.map(([ts, d]) => [(ts - tr.navStart) / 1000, d, ts]).filter(([s, d]) => d >= 50 && s >= from && s <= to).sort((a, b) => a[0] - b[0]);
  return { n: lt.length, max: Math.round(Math.max(0, ...lt.map((x) => x[1]))), tbt: Math.round(lt.reduce((a, [, d]) => a + d - 50, 0)), list: lt.filter((x) => x[1] >= 100).map(([s, d]) => `${Math.round(s)}+${Math.round(d)}`).join(' '), raw: lt };
}
/** TTI: from the later of first chart / cards, extend over long tasks until 2 s of quiet. */
function ttiFrom(ready, lt) {
  let tti = ready;
  for (const [s, d] of lt) { if (s + d > tti && s - tti < 2000) tti = s + d; }
  return Math.round(tti);
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}

// Phases: a sample counts once, for the innermost listed frame.
const PHASES = ['getJson', 'unpackJobs', 'bundled', 'vetSalaries', 'attachJuiceAll', 'withJuice', 'rejuice', 'prepare', 'roleFamily', 'readableTitle',
  'disambiguateLocations', 'markVisit', 'derive', 'sortJobs', 'computeColorKeys', 'renderTopbar', 'renderQuickbar', 'renderFilterPanel', 'renderKpis', 'renderResults',
  'paintWindow', 'buildWindow', 'renderViz', 'renderInsights', 'openDrawer', 'drawerContent', 'render', 'createMap', 'createChart'];

/** Samples of a CPU profile with absolute timestamps (µs, the trace clock). */
function samplesOf(profile) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const out = [];
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i] || 0;
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    out.push({ t, dt, id: profile.samples[i] });
  }
  return { byId, parent, out };
}
function phaseOf(s, id) {
  while (id != null) {
    const f = s.byId.get(id).callFrame.functionName;
    if (PHASES.includes(f)) return f;
    id = s.parent.get(id);
  }
  return null;
}
const selfKey = (cf) => `${cf.functionName || '(anon)'} ${cf.url ? cf.url.split('/').slice(-2).join('/') : ''}${cf.url ? ':' + (cf.lineNumber + 1) : ''}`;
/** Phase and self-time totals for samples in [t0, t1] µs (whole profile by default). */
function attribute(s, t0 = -Infinity, t1 = Infinity, top = 5) {
  const phases = {}; const self = new Map(); let all = 0;
  for (const x of s.out) {
    if (x.t < t0 || x.t > t1) continue;
    const cf = s.byId.get(x.id).callFrame;
    if (cf.functionName === '(idle)') continue;
    all += x.dt;
    const ph = cf.functionName === '(garbage collector)' ? 'gc' : cf.functionName === '(program)' ? '(program)' : phaseOf(s, x.id) || 'other';
    phases[ph] = (phases[ph] || 0) + x.dt;
    self.set(selfKey(cf), (self.get(selfKey(cf)) || 0) + x.dt);
  }
  const r = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v > 0));
  return { all: Math.round(all), phases: r(phases), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${Math.round(v)}ms ${k}`) };
}
/** Each long task >= 100 ms in the window, with what ran in it. */
function attributeTasks(tr, s, from, to) {
  const lt = longTasks(tr, from, to).raw.filter((x) => x[1] >= 100);
  return lt.map(([start, d, ts]) => {
    const a = s ? attribute(s, ts, ts + d * 1000, 4) : null;
    const inner = {};
    for (const [its, idur, name] of tr.inner) if (its >= ts && its < ts + d * 1000) inner[name] = (inner[name] || 0) + idur;
    const nonJs = Object.entries(inner).filter(([, v]) => v >= 5).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
    return { at: Math.round(start), ms: Math.round(d), phases: a && Object.entries(a.phases).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', '), top: a && a.top, nonJs };
  });
}

// CDP Fetch interception for off-site hosts only.
async function routeOffsite(cdp) {
  await cdp.send('Fetch.enable', { patterns: ['tile.openstreetmap.org', 'basemaps.cartocdn.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'boards-api.greenhouse.io', 'api.ashbyhq.com', 'api.lever.co'].map((h) => ({ urlPattern: `*${h}*` })) });
  cdp.on('Fetch.requestPaused', async (e) => {
    const url = e.request.url;
    if (/tile\.openstreetmap|basemaps\.cartocdn/.test(url)) return cdp.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'image/png' }, { name: 'access-control-allow-origin', value: '*' }], body: PNG.toString('base64') }).catch(() => {});
    cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: /fonts\./.test(url) ? 'InternetDisconnected' : 'Failed' }).catch(() => {});
  });
}

async function newPage(net) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|ERR_FAILED|Failed to load resource|tile\.openstreetmap/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  await routeOffsite(cdp);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NET[net]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  return { context, page, cdp, errors, net: netLog(cdp) };
}

const readyFor = (slug) => `#resultsList .card[data-id^="${slug}:"]`;
async function waitReady(page, slug, timeout = 120000) {
  await page.waitForSelector(readyFor(slug), { timeout, state: 'attached' });
  await page.waitForFunction(() => window.__marks.vizPaint || document.documentElement.dataset.mode !== 'chart', null, { timeout: 30000 }).catch(() => {});
}
const heapMB = async (cdp, gc = false) => { if (gc) { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); } const m = await metrics(cdp); return +(m.JSHeapUsedSize / 1e6).toFixed(1); };
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** Run fn and report wall ms (throttled); long tasks come from the trace afterwards (windows). */
let windows = [];
async function timed(page, fn, key, settle = 1500) {
  const t0 = await page.evaluate(() => performance.now());
  await fn();
  const t1 = await page.evaluate(() => performance.now());
  await sleep(settle);
  windows.push([key, t0, t1 + settle]);
  return { ms: Math.round(t1 - t0) };
}

async function loadRun(company, net) {
  const { context, page, cdp, errors, net: nl } = await newPage(net);
  const res = { company, net, loadavg: loadavg() };
  windows = [];
  try {
    // ---- cold
    await traceStart(cdp);
    await cdp.send('Profiler.start');
    await page.goto(`${base}#c=${company}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, company);
    await sleep(3000);
    const prof = (await cdp.send('Profiler.stop')).profile;
    const ctr = await traceStop(cdp);
    const cs = samplesOf(prof);
    const m = await page.evaluate(LOAD_METRICS);
    const all = longTasks(ctr, 0);
    res.cold = { ...m, tti: ttiFrom(m.ready, all.raw), longTasks: all.n, maxTask: all.max, tbt: longTasks(ctr, m.fcp || 0).tbt, tasks: attributeTasks(ctr, cs, 0, Infinity), cpu: attribute(cs, -Infinity, Infinity, 12) };
    if (TIMELINE) res.cold.timeline = ctr.tasks.map(([ts, d]) => [(ts - ctr.navStart) / 1000, d, ts]).filter(([s, d]) => d >= 10 && s >= 0).sort((x, y) => x[0] - y[0]).map(([s, d, ts]) => `${Math.round(s)}+${Math.round(d)} ${Object.entries(attribute(cs, ts, ts + d * 1000, 3).phases).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    res.cold.heapMB = await heapMB(cdp);
    res.cold.req = nl.summary();
    res.cold.api = nl.api();
    res.cold.waterfall = nl.waterfall();
    // ---- idle 10 s
    const a = await metrics(cdp); const raf0 = await page.evaluate(() => window.__raf); nl.reset();
    await sleep(10000);
    const b = await metrics(cdp); const raf1 = await page.evaluate(() => window.__raf);
    res.idle = { taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000), scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000), layouts: b.LayoutCount - a.LayoutCount, styles: b.RecalcStyleCount - a.RecalcStyleCount, rafs: raf1 - raf0, requests: nl.list().length };
    // ---- warm: a new navigation in the same context (HTTP cache, max-age=600 like GitHub Pages)
    await page.goto('about:blank');
    nl.reset();
    await traceStart(cdp);
    await cdp.send('Profiler.start');
    await page.goto(`${base}#c=${company}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, company);
    await sleep(3000);
    // keep tracing and profiling through the interactions below (same navigation)
    res.warm = await page.evaluate(LOAD_METRICS);
    windows.push(['warm', 0, res.warm.ready + 3000]);
    res.warm.heapMB = await heapMB(cdp);
    res.warm.req = nl.summary();
    if (EXTRAS) {
      // ---- drawer: tap the first card, until its description replaces the skeleton
      nl.reset();
      res.drawer = await timed(page, async () => {
        await page.evaluate(() => document.querySelector('#resultsList .card[data-id]').click());
        await page.waitForSelector('#drawer.is-open', { timeout: 20000 });
        await page.waitForFunction(() => { const d = document.querySelector('#drawer'); return d && !d.querySelector('.desc-skeleton'); }, null, { timeout: 30000 });
      }, 'drawer');
      res.drawer.req = nl.summary();
      await page.keyboard.press('Escape'); await sleep(800);
      // ---- filter change: the first department in the filter sheet (as a person taps it), then Show N roles
      res.filter = await timed(page, async () => {
        await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').click());
        await page.waitForSelector('#filters .fsec label.check', { timeout: 20000 });
        await page.evaluate(async (np) => {
          const inp = document.querySelector('#filters .fsec:nth-of-type(2) label.check input') || document.querySelector('#filters label.check input');
          inp.click();
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        });
        await page.evaluate(() => document.querySelector('#filtersDone').click());
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      }, 'filter');
      // and the cost of one checkbox tap alone (Event Timing would need a real tap; this is click to next frame)
      res.filterTap = await page.evaluate(async () => {
        document.querySelector('#quickChips [data-pop=dept]').click();
        await new Promise((r) => setTimeout(r, 600));
        const inp = document.querySelector('#filters .fsec:nth-of-type(2) label.check input') || document.querySelector('#filters label.check input');
        const t0 = performance.now();
        inp.click(); // un-tick
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        const ms = Math.round(performance.now() - t0);
        document.querySelector('#filtersDone').click();
        return { ms };
      });
      await sleep(1500);
      // ---- sorts on the full list
      for (const s of ['salary-asc', 'title']) {
        res[`sort-${s}`] = await timed(page, async () => {
          await page.evaluate(async (s) => {
            const sel = document.querySelector('#sortBy');
            sel.value = s; sel.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
          }, s);
        }, `sort-${s}`);
      }
      await page.evaluate(() => { const sel = document.querySelector('#sortBy'); sel.value = 'salary-desc'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(1500);
      // ---- Insights
      nl.reset();
      res.insights = await timed(page, async () => {
        await page.evaluate(() => document.querySelector('.seg [data-mode="insights"]').click());
        await page.waitForFunction(() => { const h = document.querySelector('#insightsHost'); return h && !h.hidden && h.querySelectorAll('*').length > 20; }, null, { timeout: 30000 });
      }, 'insights');
      res.insights.req = nl.summary(); res.insights.dom = await page.evaluate(() => document.querySelectorAll('*').length);
      // ---- map
      nl.reset();
      res.map = await timed(page, async () => {
        await page.evaluate(() => document.querySelector('.seg [data-mode="map"]').click());
        await page.waitForSelector('#mapHost .leaflet-marker-icon', { timeout: 30000, state: 'attached' });
      }, 'map');
      await sleep(1500);
      res.map.req = nl.summary(); res.map.dom = await page.evaluate(() => document.querySelectorAll('*').length);
      await page.evaluate(() => document.querySelector('.seg [data-mode="chart"]').click()); await sleep(1500);
    }
    // ---- company switch, then back
    const other = SWITCH[company];
    for (const [k, slug] of [['switch', other], ['switchBack', company]]) {
      nl.reset();
      res[k] = await timed(page, async () => {
        await page.evaluate((s) => { location.hash = `c=${s}`; }, slug);
        await waitReady(page, slug);
      }, k);
      res[k].to = slug; res[k].req = nl.summary();
    }
    const wprof = (await cdp.send('Profiler.stop')).profile;
    const tr = await traceStop(cdp);
    const ws = samplesOf(wprof);
    for (const [key, t0, t1] of windows) {
      const lt = longTasks(tr, t0, t1);
      const o = res[key];
      Object.assign(o, { longTasks: lt.n, maxTask: lt.max, tbt: lt.tbt, tasks: attributeTasks(tr, ws, t0, t1) });
      if (key === 'warm') Object.assign(o, { tti: ttiFrom(o.ready, lt.raw), tbt: longTasks(tr, o.fcp || 0, t1).tbt });
      o.cpu = attribute(ws, tr.navStart + t0 * 1000, tr.navStart + t1 * 1000, 6);
    }
    res.heapEndMB = await heapMB(cdp, true);
  } catch (e) { res.fail = String(e).slice(0, 300); }
  res.errors = errors.slice(0, 4);
  await context.close();
  return res;
}

async function leakRun(net) {
  const { context, page, cdp, errors } = await newPage(net);
  const res = { net, loadavg: loadavg(), heap: [], dom: [], ms: [] };
  try {
    await page.goto(`${base}#c=apple`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, 'apple'); await sleep(2000);
    res.heap.push(await heapMB(cdp, true)); res.dom.push(await page.evaluate(() => document.querySelectorAll('*').length));
    for (let i = 0; i < 10; i++) {
      const slug = LEAK_CYCLE[i % LEAK_CYCLE.length];
      const t0 = Date.now();
      await page.evaluate((s) => { location.hash = `c=${s}`; }, slug);
      await waitReady(page, slug); res.ms.push(Date.now() - t0); await sleep(1500);
      res.heap.push(await heapMB(cdp, true)); res.dom.push(await page.evaluate(() => document.querySelectorAll('*').length));
    }
    const m = await metrics(cdp);
    res.listeners = m.JSEventListeners; res.nodes = m.Nodes; res.documents = m.Documents;
  } catch (e) { res.fail = String(e).slice(0, 300); }
  res.errors = errors.slice(0, 4);
  await context.close();
  return res;
}

const report = { label, base, at: new Date().toISOString(), loadavgStart: loadavg(), runs: [], leak: [] };
const outFile = path.join(process.env.OUT_DIR || process.cwd(), `perf-${label}.json`);
for (const net of nets) {
  if (!LEAK_ONLY) for (const co of companies) {
    const x = await loadRun(co, net);
    report.runs.push(x);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    process.stderr.write(`${label} ${net} ${co} [load ${x.loadavg}]: cold fcp ${x.cold?.fcp} cards ${x.cold?.cards} chart ${x.cold?.chart} tti ${x.cold?.tti} max ${x.cold?.maxTask} tbt ${x.cold?.tbt} heap ${x.cold?.heapMB} | warm chart ${x.warm?.chart} max ${x.warm?.maxTask} | drawer ${x.drawer?.ms}/${x.drawer?.maxTask} filter ${x.filter?.ms}/${x.filter?.maxTask} sort ${x['sort-salary-asc']?.ms}/${x['sort-salary-asc']?.maxTask} insights ${x.insights?.ms}/${x.insights?.maxTask} map ${x.map?.ms}/${x.map?.maxTask} | switch ${x.switch?.ms}/${x.switch?.maxTask} back ${x.switchBack?.ms}/${x.switchBack?.maxTask} ${x.fail || ''} ${x.errors?.length ? 'ERR ' + x.errors[0] : ''}\n`);
  }
  if (LEAK || LEAK_ONLY) { const l = await leakRun(net); report.leak.push(l); fs.writeFileSync(outFile, JSON.stringify(report, null, 2)); process.stderr.write(`leak ${net} [load ${l.loadavg}]: heap ${l.heap.join(' ')} | dom ${l.dom.join(' ')} | ms ${l.ms.join(' ')} ${l.fail || ''}\n`); }
}
report.loadavgEnd = loadavg();
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(outFile);
await browser.close();

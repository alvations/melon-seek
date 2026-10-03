// Mobile performance audit for the static build (docs/process/perf-mobile.md).
// usage: NODE_PATH=<dir>/node_modules node perf-mobile.mjs <baseUrl> <label> [--co=anthropic,anduril,openai]
//          [--net=slow4g,fast4g] [--live=<dir with gh-<slug>.json>] [--runs=1] [--no-extras]
// Emulates a mid-range phone: 390x844, isMobile, touch, DPR 3, Android UA, 4x CPU throttle,
// CDP Network.emulateNetworkConditions. Per company and network profile, in one browser context:
//   cold load -> 10 s idle -> warm reload -> drawer -> Insights -> map -> company switch and back
// and once per network profile a leak check (10 company switches, GC, heap after each).
// Off-site hosts can't be reached from the sandbox, so they are routed:
//   board APIs (greenhouse/ashby/lever): aborted = the CORS/network failure path (bundled list), or,
//     with --live, Greenhouse is answered from gh-<slug>.json (perf-mobile-gh-fixture.mjs) after the
//     delay the profile would need to download its gzip size (route.fulfill bypasses throttling);
//   map tiles: a 1x1 PNG (counted as "tiles"); Google Fonts: aborted (counted as failed "fonts").
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [base, label = 'run'] = process.argv.slice(2);
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const companies = arg('co', 'anthropic,anduril,openai').split(',');
const nets = arg('net', 'slow4g').split(',');
const liveDir = arg('live', '');
const RUNS = Number(arg('runs', '1'));
const EXTRAS = !process.argv.includes('--no-extras');
const LEAK = !process.argv.includes('--no-leak');

// Chrome DevTools presets (Slow 4G is the preset formerly called "Fast 3G").
const NET = {
  slow4g: { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  fast4g: { offline: false, latency: 165, downloadThroughput: 1012500, uploadThroughput: 168750 },
};
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SWITCH = { anthropic: 'openai', anduril: 'anthropic', openai: 'anduril' };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const INIT = () => {
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
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
    if (!window.__marks.cards && document.querySelector('#resultsList .card[data-id]')) window.__marks.cards = t;
  });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
};

const LOAD_METRICS = () => {
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  const lt = window.__lt.slice().sort((a, b) => a[0] - b[0]);
  const ready = Math.max(window.__marks.vizPaint || window.__marks.viz || 0, window.__marks.cards || 0);
  let tti = ready;
  for (const [s, d] of lt) { if (s + d > tti && s - tti < 2000) tti = s + d; }
  const tbt = lt.filter(([s]) => s > (fcp || 0)).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
  return {
    fcp: Math.round(fcp), chart: Math.round(window.__marks.vizPaint || window.__marks.viz || 0), cards: Math.round(window.__marks.cards || 0),
    ltApiTti: Math.round(tti), ltApiN: lt.length, ltApiMax: Math.round(Math.max(0, ...lt.map((x) => x[1]))), ltApiTbt: Math.round(tbt),
    dom: document.querySelectorAll('*').length, ready: Math.round(ready),
  };
};
/** Merge trace long tasks into a LOAD_METRICS result. */
function withTrace(m, tr) {
  const lt = longTasks(tr, m.fcp || 0);
  const all = longTasks(tr, 0);
  return { ...m, tti: ttiFrom(m.ready, all.raw), longTasks: all.n, maxTask: all.max, tbt: lt.tbt, tasks: all.list };
}

function kindOf(type, url) {
  if (/tile\.openstreetmap|basemaps\.cartocdn/.test(url)) return 'tiles';
  if (type === 'Font' || /fonts\.(gstatic|googleapis)/.test(url)) return 'fonts';
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
    list() { return [...reqs.values()]; },
    waterfall() {
      const all = [...reqs.values()]; const t0 = Math.min(...all.map((r) => r.t));
      return all.sort((a, b) => a.t - b.t).map((r) => `${Math.round((r.t - t0) * 1000)}-${r.end ? Math.round((r.end - t0) * 1000) : 'x'} ${kindOf(r.type, r.url)} ${Math.round(r.bytes / 100) / 10}kB ${r.cached ? '(cache) ' : ''}${r.url.replace(/^https?:\/\/[^/]+\/(melon-seek\/)?/, '').slice(0, 70)}`);
    },
  };
}

// Main-thread tasks from a Chrome trace (RunTask on CrRendererMain), the source DevTools uses.
// The Long Tasks API misses work that runs as a promise continuation of fetch() (getJobs' unpack,
// vet, juice and normalize), so its numbers are kept only for comparison (ltApi*).
async function traceStart(cdp) {
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'loading'], excludedCategories: ['*'] } });
}
async function traceStop(cdp) {
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let buf = '';
  for (;;) { const c = await cdp.send('IO.read', { handle: stream, size: 1 << 22 }); buf += c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data; if (c.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  const ev = JSON.parse(buf);
  const events = Array.isArray(ev) ? ev : ev.traceEvents;
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.set(`${e.pid}:${e.tid}`, true);
  const count = new Map();
  for (const e of events) if (e.name === 'RunTask' && e.ph === 'X' && names.has(`${e.pid}:${e.tid}`)) count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) || 0) + 1);
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  const navs = events.filter((e) => e.name === 'navigationStart' && `${e.pid}:${e.tid}` === main && e.args?.data?.isLoadingMainFrame && /^https?:/.test(e.args.data.documentLoaderURL || '')).map((e) => e.ts).sort((a, b) => a - b);
  const tasks = events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && `${e.pid}:${e.tid}` === main).map((e) => [e.ts, e.dur / 1000]);
  return { tasks, navStart: navs.length ? navs[0] : null };
}
/** Long tasks (>= 50 ms) in [from, to] ms after navStart: n, max, TBT (sum of task - 50), list of the >= 100 ms ones. */
function longTasks(tr, from = 0, to = Infinity) {
  const lt = tr.tasks.map(([ts, d]) => [(ts - tr.navStart) / 1000, d]).filter(([s, d]) => d >= 50 && s >= from && s <= to).sort((a, b) => a[0] - b[0]);
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

/** Inclusive time of the load phases (a sample counts once, for the innermost listed frame). */
const PHASES = ['unpackJobs', 'bundled', 'fetchLiveInBrowser', 'normalizeJobs', 'vetSalaries', 'attachJuiceAll', 'prepare', 'roleFamily', 'render', 'renderList', 'scheduleViz', 'update', 'loadLib', 'annotate'];
function phaseTimes(profile) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const out = {};
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    let id = profile.samples[i];
    const leaf = byId.get(id).callFrame.functionName;
    if (leaf === '(idle)' || leaf === '(program)') continue;
    out.all = (out.all || 0) + dt;
    if (leaf === '(garbage collector)') { out.gc = (out.gc || 0) + dt; continue; }
    while (id != null) {
      const f = byId.get(id).callFrame.functionName;
      if (PHASES.includes(f)) { out[f] = (out[f] || 0) + dt; break; }
      id = parent.get(id);
    }
  }
  for (const k in out) out[k] = Math.round(out[k]);
  return out;
}

/** Self time per function from a CPU profile (ms of throttled wall time), top n. */
function topFunctions(profile, n = 12) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const cf = node.callFrame;
    if (['(idle)', '(program)'].includes(cf.functionName)) continue;
    const key = `${cf.functionName || '(anon)'} ${cf.url ? cf.url.split('/').slice(-2).join('/') : ''}${cf.url ? ':' + (cf.lineNumber + 1) : ''}`;
    self.set(key, (self.get(key) || 0) + dt);
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)}ms ${k}`);
}

// CDP Fetch interception for off-site hosts only. (Playwright's route() would disable the HTTP
// cache for the whole context, which makes every "warm" load cold.)
async function routeOffsite(cdp, net) {
  await cdp.send('Fetch.enable', { patterns: ['tile.openstreetmap.org', 'basemaps.cartocdn.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'boards-api.greenhouse.io', 'api.ashbyhq.com', 'api.lever.co'].map((h) => ({ urlPattern: `*${h}*` })) });
  cdp.on('Fetch.requestPaused', async (e) => {
    const url = e.request.url;
    const fail = (errorReason) => cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason }).catch(() => {});
    if (/tile\.openstreetmap|basemaps\.cartocdn/.test(url)) return cdp.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'image/png' }, { name: 'access-control-allow-origin', value: '*' }], body: PNG.toString('base64') }).catch(() => {});
    if (/fonts\./.test(url)) return fail('InternetDisconnected');
    const m = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/]+)\/jobs/);
    const slug = m && { anthropic: 'anthropic', andurilindustries: 'anduril' }[m[1]];
    const file = liveDir && slug && path.join(liveDir, `gh-${slug}.json`);
    if (!file || !fs.existsSync(file)) return fail('Failed'); // = blocked by CORS/network
    const body = fs.readFileSync(file);
    const gz = zlib.gzipSync(body).length;
    await sleep(NET[net].latency * 2 + (gz / NET[net].downloadThroughput) * 1000); // TCP+TLS RTTs + transfer
    cdp.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: body.toString('base64') }).catch(() => {}); // may be aborted by the app's 12 s timeout
  });
}

async function newPage(net) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|ERR_FAILED|Failed to load resource|tile\.openstreetmap/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  await routeOffsite(cdp, net);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NET[net]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  return { context, page, cdp, errors, net: netLog(cdp) };
}

const readyFor = (slug) => `#resultsList .card[data-id^="${slug}:"]`;
async function waitReady(page, slug, timeout = 90000) {
  await page.waitForSelector(readyFor(slug), { timeout, state: 'attached' });
  await page.waitForFunction(() => window.__marks.vizPaint || document.documentElement.dataset.mode !== 'chart', null, { timeout: 30000 }).catch(() => {});
}
const heapMB = async (cdp, gc = false) => { if (gc) await cdp.send('HeapProfiler.collectGarbage'); const m = await metrics(cdp); return +(m.JSHeapUsedSize / 1e6).toFixed(1); };

/** Run fn and report wall ms (throttled); long tasks come from the trace afterwards (windows). */
let windows = [];
async function timed(page, fn, key) {
  const t0 = await page.evaluate(() => performance.now());
  await fn();
  const t1 = await page.evaluate(() => performance.now());
  await sleep(1500);
  windows.push([key, t0, t1 + 1500]);
  return { ms: Math.round(t1 - t0) };
}

async function loadRun(company, net) {
  const { context, page, cdp, errors, net: nl } = await newPage(net);
  const res = { company, net };
  windows = [];
  try {
    // ---- cold
    await traceStart(cdp);
    await cdp.send('Profiler.start');
    await page.goto(`${base}#c=${company}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, company);
    await sleep(3000);
    const prof = (await cdp.send('Profiler.stop')).profile;
    res.cold = withTrace(await page.evaluate(LOAD_METRICS), await traceStop(cdp));
    res.cold.heapMB = await heapMB(cdp);
    res.cold.req = nl.summary();
    res.cold.waterfall = nl.waterfall();
    res.cold.top = topFunctions(prof);
    res.cold.phases = phaseTimes(prof);
    res.cold.mode = await page.evaluate(() => document.querySelector('.data-badge, #dataBadge')?.textContent?.trim().slice(0, 40) || null);
    // ---- idle 10 s
    const a = await metrics(cdp); const raf0 = await page.evaluate(() => window.__raf); nl.reset();
    await sleep(10000);
    const b = await metrics(cdp); const raf1 = await page.evaluate(() => window.__raf);
    res.idle = { taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000), scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000), layouts: b.LayoutCount - a.LayoutCount, styles: b.RecalcStyleCount - a.RecalcStyleCount, rafs: raf1 - raf0, requests: nl.list().length };
    // ---- warm: a new navigation in the same context (HTTP cache, max-age=600 like GitHub Pages;
    // page.reload() would revalidate every request)
    await page.goto('about:blank');
    nl.reset();
    await traceStart(cdp);
    await cdp.send('Profiler.start');
    await page.goto(`${base}#c=${company}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, company);
    await sleep(3000);
    const wprof = (await cdp.send('Profiler.stop')).profile;
    // keep tracing through the interactions below (same navigation)
    res.warm = await page.evaluate(LOAD_METRICS);
    res.warm.phases = phaseTimes(wprof);
    res.warm.top = topFunctions(wprof);
    windows.push(['warm', 0, res.warm.ready + 3000]);
    res.warm.heapMB = await heapMB(cdp);
    res.warm.req = nl.summary();
    res.warm.waterfall = nl.waterfall();
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
    const tr = await traceStop(cdp);
    for (const [key, a, b] of windows) {
      const lt = longTasks(tr, a, b);
      if (key === 'warm') Object.assign(res.warm, { tti: ttiFrom(res.warm.ready, lt.raw), longTasks: lt.n, maxTask: lt.max, tbt: longTasks(tr, res.warm.fcp || 0, b).tbt, tasks: lt.list });
      else Object.assign(res[key], { longTasks: lt.n, maxTask: lt.max, tbt: lt.tbt, tasks: lt.list });
    }
    res.heapEndMB = await heapMB(cdp, true);
  } catch (e) { res.fail = String(e).slice(0, 300); }
  res.errors = errors.slice(0, 4);
  await context.close();
  return res;
}

async function leakRun(net) {
  const { context, page, cdp, errors } = await newPage(net);
  const res = { net, heap: [], dom: [] };
  try {
    await page.goto(`${base}#c=anthropic`, { waitUntil: 'domcontentloaded' });
    await waitReady(page, 'anthropic'); await sleep(2000);
    res.heap.push(await heapMB(cdp, true)); res.dom.push(await page.evaluate(() => document.querySelectorAll('*').length));
    const cycle = ['anduril', 'openai', 'anthropic'];
    for (let i = 0; i < 10; i++) {
      const slug = cycle[i % 3];
      await page.evaluate((s) => { location.hash = `c=${s}`; }, slug);
      await waitReady(page, slug); await sleep(1200);
      res.heap.push(await heapMB(cdp, true)); res.dom.push(await page.evaluate(() => document.querySelectorAll('*').length));
    }
    const m = await metrics(cdp);
    res.listeners = m.JSEventListeners; res.nodes = m.Nodes; res.documents = m.Documents;
  } catch (e) { res.fail = String(e).slice(0, 300); }
  res.errors = errors.slice(0, 4);
  await context.close();
  return res;
}

const report = { label, base, live: !!liveDir, at: new Date().toISOString(), runs: [], leak: [] };
for (const net of nets) {
  for (const co of companies) for (let r = 0; r < RUNS; r++) {
    const x = await loadRun(co, net);
    report.runs.push(x);
    process.stderr.write(`${label} ${net} ${co} #${r + 1}: cold fcp ${x.cold?.fcp} chart ${x.cold?.chart} tti ${x.cold?.tti} max ${x.cold?.maxTask} tbt ${x.cold?.tbt} | warm chart ${x.warm?.chart} tti ${x.warm?.tti} max ${x.warm?.maxTask} | switch ${x.switch?.ms}/${x.switch?.maxTask} back ${x.switchBack?.ms}/${x.switchBack?.maxTask} ${x.fail || ''}\n`);
  }
  if (LEAK) { const l = await leakRun(net); report.leak.push(l); process.stderr.write(`leak ${net}: ${l.heap.join(' ')} ${l.fail || ''}\n`); }
}
const outFile = path.join(process.env.OUT_DIR || process.cwd(), `perf-${label}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(outFile);
await browser.close();

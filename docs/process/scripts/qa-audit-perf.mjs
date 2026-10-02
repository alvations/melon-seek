// Perf audit: server vs static, per company, desktop vs throttled phone.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const MODES = { server: 'http://127.0.0.1:5311/', static: 'http://127.0.0.1:5310/melon-seek/' };
const COMPANIES = [['anthropic', 'Anthropic', 'anduril', 'Anduril'], ['anduril', 'Anduril', 'openai', 'OpenAI'], ['openai', 'OpenAI', 'anthropic', 'Anthropic']];
const DEVICES = { desktop: { viewport: { width: 1440, height: 900 }, cpu: 1 }, phone: { viewport: { width: 390, height: 844 }, cpu: 4, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const INIT = () => {
  window.__m = { long: [], marks: {} };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const mark = (k, sel) => { if (!window.__m.marks[k] && document.querySelector(sel)) window.__m.marks[k] = Math.round(performance.now()); };
  const mo = new MutationObserver(() => {
    mark('chart', '#chartHost .ms-crow__band, #chartHost .ms-row__bar');
    mark('cards', '#resultsList .card[data-id]');
    mark('filters', '#filterBody button.kw');
  });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const rows = [];
for (const [mode, base] of Object.entries(MODES)) for (const [dev, d] of Object.entries(DEVICES)) for (const [slug, name, next, nextName] of COMPANIES) {
  const ctx = await browser.newContext({ viewport: d.viewport, isMobile: d.isMobile, hasTouch: d.hasTouch, deviceScaleFactor: d.deviceScaleFactor || 1 });
  await ctx.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  if (d.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: d.cpu });
  const reqs = new Map(); const bytes = { script: 0, json: 0, css: 0, other: 0, n: 0 };
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, mime: e.response.mimeType, type: e.type }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (!r) return; bytes.n++; const k = /javascript/.test(r.mime) || r.type === 'Script' ? 'script' : /json/.test(r.mime) ? 'json' : /css/.test(r.mime) ? 'css' : 'other'; bytes[k] += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${base}#c=${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__m.marks.chart && window.__m.marks.cards && window.__m.marks.filters, null, { timeout: 120000 });
  const marks = await page.evaluate(() => ({ ...window.__m.marks, fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0) }));
  await page.waitForTimeout(1500);
  const loadBytes = { ...bytes };
  // filter interaction: click a narrowing skill chip, time to new results title painted
  const filterMs = await page.evaluate(async () => {
    const total = document.querySelectorAll('#resultsList .card').length;
    const btn = [...document.querySelectorAll('#filterBody button.kw')].find((b) => +b.querySelector('.kw-count')?.textContent > 0) ;
    const before = document.querySelector('#resultsTitle').textContent;
    const t = performance.now(); btn.click();
    await new Promise((res) => { const tick = () => (document.querySelector('#resultsTitle').textContent !== before ? requestAnimationFrame(() => res()) : requestAnimationFrame(tick)); tick(); setTimeout(res, 10000); });
    return Math.round(performance.now() - t);
  });
  // clear
  await page.evaluate(() => document.querySelector('#clearAll')?.click()); await page.waitForTimeout(800);
  // drawer open
  const drawerMs = await page.evaluate(async () => {
    const card = document.querySelector('#resultsList .card[data-id]'); const t = performance.now(); card.click();
    await new Promise((res) => { const tick = () => (document.querySelector('#drawer:not([hidden]) #drawerTitle') ? requestAnimationFrame(() => res()) : requestAnimationFrame(tick)); tick(); setTimeout(res, 10000); });
    return Math.round(performance.now() - t);
  });
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  // company switch via hash (same code path as the menu: set({c}) -> loadJobs)
  const switchMs = await page.evaluate(async (nx) => {
    const t = performance.now(); const p = new URLSearchParams(location.hash.slice(1)); p.set('c', nx); location.hash = p.toString();
    await new Promise((res) => { const tick = () => (document.querySelector(`#resultsList .card[data-id^="${nx}:"]`) && document.querySelector('#chartHost .ms-crow__band, #chartHost .ms-row__bar') ? requestAnimationFrame(() => res()) : requestAnimationFrame(tick)); tick(); setTimeout(res, 60000); });
    return Math.round(performance.now() - t);
  }, next);
  const long = await page.evaluate(() => window.__m.long);
  const pm = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const row = { mode, dev, slug, fcp: marks.fcp, chart: marks.chart, cards: marks.cards, filtersReady: marks.filters, filterMs, drawerMs, switchTo: next, switchMs,
    jsKB: Math.round(loadBytes.script / 1024), jsonKB: Math.round(loadBytes.json / 1024), cssKB: Math.round(loadBytes.css / 1024), reqs: loadBytes.n,
    longN: long.length, longMax: Math.max(0, ...long), longSum: long.reduce((a, b) => a + b, 0), heapMB: Math.round(pm.JSHeapUsedSize / 1048576), nodes: pm.Nodes };
  rows.push(row); console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(process.env.PERF_OUT || 'perf.json', JSON.stringify(rows, null, 1));

// Replayable screenshot harness for public/viz/demo.html (viz workstream).
//
// Serves public/ plus /vendor/leaflet/ -> node_modules/leaflet/dist on a tiny
// built-in HTTP server, then drives Chromium via Playwright, blocking basemap
// tile hosts so the offline fallback is exercised.
//
// Usage:  node docs/process/scripts/viz-screenshots.mjs [outDir]
// Env:    PLAYWRIGHT_MODULE  path to playwright's index.mjs (default: tries
//                            `playwright`, then /opt/node-tools/node_modules/playwright/index.mjs)
//         CHROMIUM           browser binary (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome)
// Never run `playwright install`; use the preinstalled Chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PUB = path.join(ROOT, 'public');
const LEAFLET = path.join(ROOT, 'node_modules/leaflet/dist');
const OUT = path.resolve(process.argv[2] || 'viz-shots');
const PORT = +process.env.PORT || 5199;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function loadPlaywright() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs'].filter(Boolean)) {
    try { return await import(m); } catch {}
  }
  throw new Error('playwright not found; set PLAYWRIGHT_MODULE');
}

const SHOTS = [
  // clusters view (default)
  { name: 'clusters-light', q: '' },
  { name: 'clusters-light-hover', q: 'hl=7', hover: 'auto' },
  { name: 'clusters-dark', q: 'groupBy=seniority', dark: true },
  { name: 'clusters-dark-location-1000', q: 'groupBy=location&n=1000', dark: true,
    eval: `(()=>{const t=performance.now();__viz.chart.update(__viz.jobs,{groupBy:"department"});const ms=performance.now()-t;__viz.chart.update(__viz.jobs,{groupBy:"location"});return "clusters render ms "+ms.toFixed(1)+", circles "+document.querySelectorAll(".ms-bin").length})()` },
  { name: 'clusters-all-roles', q: 'groupBy=none' },
  { name: 'clusters-mobile-light', q: '', w: 390, h: 800 },
  // ranges (detail) view
  { name: 'chart-light', q: 'view=ranges&colorBy=department&hl=5' },
  { name: 'chart-dark-grouped', q: 'view=ranges&groupBy=seniority&colorBy=location', dark: true, hover: [700, 300] },
  { name: 'chart-dark-1000-scrolled', q: 'view=ranges&groupBy=department&colorBy=seniority&n=1000', dark: true, scroll: 3000,
    eval: `(()=>{const t=performance.now();__viz.chart.update(__viz.jobs,{view:"ranges",groupBy:"location",colorBy:"department"});const ms=performance.now()-t;__viz.chart.update(__viz.jobs,{view:"ranges",groupBy:"department",colorBy:"seniority"});return "full render ms "+ms.toFixed(1)+", rows "+document.querySelectorAll(".ms-row").length})()` },
  { name: 'chart-mobile-dark', q: 'view=ranges&colorBy=location&groupBy=seniority', w: 390, h: 800, dark: true },
  // map
  { name: 'map-light-hover', q: 'mode=map&hl=3', wait: 5000, hover: [478, 300] },
  { name: 'map-dark', q: 'mode=map', dark: true, wait: 5000 },
  { name: 'map-light-us', q: 'mode=map', wait: 5000, eval: `(()=>{__viz.map.leaflet.setView([38,-100],4,{animate:false});return document.querySelectorAll(".ms-pin").length+" pins"})()` },
];

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/vendor/leaflet/') ? path.join(LEAFLET, u.slice(16)) : path.join(PUB, u);
  if (!f.startsWith(PUB) && !f.startsWith(LEAFLET)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT);

const { chromium } = await loadPlaywright();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let failed = 0;
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: s.w || 1280, height: s.h || 820 }, colorScheme: s.dark ? 'dark' : 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route(/basemaps\.cartocdn\.com|openstreetmap\.org/, r => r.abort()); // simulate offline tiles
  await page.goto(`http://localhost:${PORT}/viz/demo.html?${s.q}`);
  await page.waitForTimeout(s.wait || 900);
  if (s.hover === 'auto') { // hover the largest circle
    const box = await page.evaluate(() => { const b = [...document.querySelectorAll('.ms-bin')].sort((a, c) => c.offsetWidth - a.offsetWidth)[0]?.getBoundingClientRect(); return b && [b.x + b.width / 2, b.y + b.height / 2]; });
    if (box) { await page.mouse.move(...box); await page.waitForTimeout(300); }
  } else if (s.hover) { await page.mouse.move(...s.hover); await page.waitForTimeout(300); }
  if (s.scroll) { await page.evaluate(y => { document.querySelector('.ms-chart__scroll').scrollTop = y; }, s.scroll); await page.waitForTimeout(200); }
  const info = s.eval ? await page.evaluate(s.eval) : '';
  const file = path.join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file });
  if (errors.length) failed++;
  console.log(`${s.name}: ${errors.length ? 'ERRORS ' + errors.join(' | ') : 'ok'}${info ? ' · ' + info : ''} -> ${file}`);
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);

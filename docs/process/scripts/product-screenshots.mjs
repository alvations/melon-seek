// Screenshot harness for public/features/demo.html (Compstimate + Market insights).
//
// Serves <repo>/public with a tiny node:http static server on a free port, drives
// a preinstalled Chromium with Playwright, and writes PNGs to $OUT_DIR
// (default: <os tmp>/melon-seek-features-shots). Never downloads browsers.
//
//   # once, outside the repo (no repo dependency is added):
//   mkdir -p "$SCRATCH/pw" && cd "$SCRATCH/pw" && npm init -y && \
//     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.56.0
//   # run (from that dir so `playwright` resolves, or set PLAYWRIGHT_MODULE):
//   cd "$SCRATCH/pw" && OUT_DIR="$SCRATCH/shots" node /path/to/repo/docs/process/scripts/product-screenshots.mjs
//
// Env: OUT_DIR, CHROMIUM_PATH (else newest /opt/pw-browsers/chromium-*/chrome-linux/chrome),
//      PLAYWRIGHT_MODULE (path to playwright's index.js), ONLY (comma list of shot names),
//      MARKET_JSON (a real market.json from `node scripts/build-market.js --out f`; served at
//      /__fixtures/market.json for the "compare-real-*" shots, which are skipped without it).
// Exits non-zero if the page logs a console error or throws.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), 'melon-seek-features-shots');
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_MODULE) tries.push(process.env.PLAYWRIGHT_MODULE);
  const req = createRequire(path.join(process.cwd(), 'noop.js'));
  for (const name of ['playwright', 'playwright-core']) { try { tries.push(req.resolve(name)); } catch { /* next */ } }
  for (const t of tries) {
    try { const m = await import(pathToFileURL(t).href); const pw = m.chromium ? m : m.default; if (pw?.chromium) return pw; } catch { /* next */ }
  }
  throw new Error('playwright not found: run from a dir with playwright installed or set PLAYWRIGHT_MODULE');
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) { const p = path.join(root, d, 'chrome-linux', 'chrome'); if (fs.existsSync(p)) return p; }
  return undefined;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__fixtures/market.json' && process.env.MARKET_JSON) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      fs.createReadStream(process.env.MARKET_JSON).pipe(res);
      return;
    }
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const SHOTS = [
  { name: 'desktop-light', viewport: [1360, 1000], query: 'theme=light', full: true },
  { name: 'desktop-dark', viewport: [1360, 1000], query: 'theme=dark', full: true },
  { name: 'fallback-light', viewport: [1360, 1000], query: 'theme=light&tokens=none', full: true },
  { name: 'fallback-dark', viewport: [1360, 1000], query: 'theme=dark&tokens=none', full: true },
  { name: 'sidebar-narrow', viewport: [820, 1400], query: 'theme=light&layout=narrow', full: true },
  { name: 'mobile', viewport: [390, 844], query: 'theme=light', full: true },
  { name: 'mobile-comp', viewport: [390, 844], query: 'theme=light', element: '.ms-comp' },
  { name: 'mobile-insights-dark', viewport: [390, 844], query: 'theme=dark', element: '.ms-insights:not(.ms-compare)' },
  { name: 'wide-comp', viewport: [1100, 900], query: 'theme=light&layout=wide', element: '.ms-comp' },
  { name: 'comp-staff-research', viewport: [1360, 1000], query: `theme=light&q=${encodeURIComponent(JSON.stringify({ title: 'Research Engineer', seniority: 'Staff+', location: 'San Francisco' }))}`, element: '.ms-comp' },
  { name: 'comp-london-dark', viewport: [1360, 1000], query: `theme=dark&q=${encodeURIComponent(JSON.stringify({ title: 'Account Executive', location: 'London' }))}`, element: '.ms-comp' },
  { name: 'comp-nomatch', viewport: [1360, 1000], query: `theme=light&q=${encodeURIComponent(JSON.stringify({ title: 'Pastry Chef' }))}`, element: '.ms-comp' },
  { name: 'filtered-hover', viewport: [1360, 1000], query: `theme=light&filter=${encodeURIComponent(JSON.stringify({ type: 'skill', value: 'Python' }))}`, hover: '.msi-rows--box .msi-row' },
  { name: 'focus-keyboard', viewport: [1360, 1000], query: 'theme=dark', focusRows: 3 },
  { name: 'no-pay', viewport: [1360, 800], query: 'theme=light&company=nopay', full: true },
  { name: 'empty', viewport: [1360, 600], query: 'theme=light&company=empty', full: false },
  // v2: published accuracy + compare companies
  { name: 'v2-comp-accuracy', viewport: [1360, 1000], query: 'theme=light', element: '.ms-comp' },
  { name: 'v2-comp-lowacc-dark', viewport: [1360, 1000], query: 'theme=dark&accuracy=31', element: '.ms-comp' },
  { name: 'v2-compare-demo', viewport: [1360, 1000], query: 'theme=light', element: '.ms-compare' },
  { name: 'v2-compare-real-light', viewport: [1360, 1000], query: 'theme=light&market=/__fixtures/market.json&marketCompany=anthropic', element: '.ms-compare', needs: 'MARKET_JSON' },
  { name: 'v2-compare-real-dark', viewport: [1360, 1000], query: 'theme=dark&market=/__fixtures/market.json&marketCompany=openai', element: '.ms-compare', needs: 'MARKET_JSON' },
  { name: 'v2-compare-real-narrow', viewport: [820, 1200], query: 'theme=light&layout=narrow&market=/__fixtures/market.json&marketCompany=anduril', element: '.ms-compare', needs: 'MARKET_JSON' },
];

const pw = await loadPlaywright();
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/features/demo.html`;
const browser = await pw.chromium.launch({ executablePath: findChromium(), headless: true });
const errors = [];
try {
  for (const s of SHOTS) {
    if (ONLY.length && !ONLY.includes(s.name)) continue;
    if (s.needs && !process.env[s.needs]) { console.log('skip', s.name, `(needs ${s.needs})`); continue; }
    const page = await browser.newPage({ viewport: { width: s.viewport[0], height: s.viewport[1] }, deviceScaleFactor: 2 });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${s.name}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
    await page.goto(`${base}?${s.query}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ms-insights__title');
    if (s.hover) { await page.hover(s.hover); await page.waitForTimeout(120); }
    if (s.focusRows) {
      await page.focus('.msi-row');
      for (let i = 1; i < s.focusRows; i++) await page.keyboard.press('Tab');
      // A keyboard Tab makes :focus-visible true; nudge once more so the tooltip shows for the focused row.
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
      await page.waitForTimeout(120);
    }
    const file = path.join(OUT, `features-${s.name}.png`);
    if (s.element) await page.locator(s.element).screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: !!s.full });
    console.log('wrote', file);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }

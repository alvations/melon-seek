// fix-phone-controls: the first-page preview's timings are unchanged (perf-mobile-beta-2's record: Amazon's first
// cards about 2 s on Fast 4G at 4x CPU, 390x844). Usage, with Playwright on NODE_PATH:
//   node docs/process/scripts/fix-phone-controls-timing.mjs --dist <build> [--runs 3] [--net fast|slow]
// Prints, per run: the first preview card, the first card of the whole list, and the 1-minute load average.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dist = path.resolve(arg('dist', 'dist'));
const runs = Number(arg('runs', 3));
const NET = {
  fast: { offline: false, latency: 165, downloadThroughput: 1.01e6, uploadThroughput: 0.7e6 },
  slow: { offline: false, latency: 562.5, downloadThroughput: 180e3, uploadThroughput: 84e3 },
}[arg('net', 'fast')];
const req = createRequire(import.meta.url);
const pwPath = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'playwright')).find((p) => fs.existsSync(p)) || 'playwright';
const { chromium } = req(pwPath);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((q, res) => {
  const u = new URL(q.url, 'http://x');
  let p = path.join(dist, decodeURIComponent(u.pathname.replace(/^\/melon-seek\//, '')));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(dist) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  const type = MIME[path.extname(p)] || 'application/octet-stream';
  const body = fs.readFileSync(p);
  if (/text|javascript|json|svg/.test(type) && /gzip/.test(q.headers['accept-encoding'] || '')) { res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' }); return res.end(zlib.gzipSync(body)); }
  res.writeHead(200, { 'content-type': type });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await context.route((u) => !u.href.startsWith(origin), (r) => r.abort('blockedbyclient'));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', NET);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const load = os.loadavg()[0].toFixed(1);
    const t0 = Date.now();
    await page.goto(`${origin}/melon-seek/beta/#c=amazon`);
    await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 120000 });
    const tp = Date.now() - t0;
    await page.waitForSelector('#resultsList .card[data-id]', { timeout: 180000 });
    const tl = Date.now() - t0;
    console.log(`run ${i + 1}: first preview card ${(tp / 1000).toFixed(2)} s, whole list ${(tl / 1000).toFixed(2)} s (load ${load})`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

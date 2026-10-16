#!/usr/bin/env node
// Phone smoke test of a static build, printed to the job log (artifacts can't always be read): for each engine and
// board, the page errors, console errors, failed requests and what the first screen holds. The user, 2026-10-16:
// "The mobile page on the beta site is totally broken"; Chromium's phone profile looked fine, so this runs WebKit too.
//
//   node test/e2e/webkit/phone-smoke.mjs --dist dist [--out phone-smoke] [--engines webkit,chromium] [--boards apple,amazon,google,meta]
//
// Exit 1 when any engine shows a page error, no job cards, a horizontal scroll, or a board that never loads.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIST = path.resolve(arg('dist', 'dist'));
const OUT = path.resolve(arg('out', 'phone-smoke'));
const ENGINES = arg('engines', 'webkit,chromium').split(',');
const BOARDS = arg('boards', 'apple,amazon,google,meta,microsoft').split(',');
fs.mkdirSync(OUT, { recursive: true });

let pw;
try { pw = await import('playwright'); } catch {
  pw = createRequire(path.join(process.env.NODE_PATH || process.cwd(), 'x.js'))('playwright');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(404); return res.end(); }
  let p = path.join(DIST, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
  if (p !== DIST && !p.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const bad = [];
for (const engine of ENGINES) {
  const launchOpts = engine === 'chromium' && fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {};
  const browser = await pw[engine].launch(launchOpts);
  for (const [dev, profile] of [['iPhone 13', pw.devices['iPhone 13']], ['iPhone SE', pw.devices['iPhone SE']]]) {
    const { defaultBrowserType, ...ctxOpts } = profile;
    if (engine === 'chromium') delete ctxOpts.isMobile; // Chromium takes isMobile; keep the rest the same
    for (const board of BOARDS) {
      const ctx = await browser.newContext({ ...ctxOpts, ...(engine === 'chromium' ? { isMobile: true } : {}) });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(`pageerror: ${String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ').slice(0, 500)}`));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text().slice(0, 300)}`); });
      page.on('requestfailed', (r) => { if (r.url().startsWith(origin)) errs.push(`requestfailed: ${r.url().slice(origin.length)} ${r.failure() && r.failure().errorText}`); });
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(origin)) errs.push(`http ${r.status()}: ${r.url().slice(origin.length)}`); });
      const t0 = Date.now();
      let loaded = true;
      await page.goto(`${origin}/melon-seek/beta/#c=${board}`, { waitUntil: 'load', timeout: 60000 }).catch((e) => { loaded = false; errs.push(`goto: ${e.message}`); });
      // The first cards, or 25 s.
      await page.waitForFunction(() => document.querySelectorAll('[data-id].card, .card[data-id], .results .card').length > 0, null, { timeout: 25000 }).catch(() => {});
      const ms = Date.now() - t0;
      await page.waitForTimeout(1500);
      const s = await page.evaluate(() => {
        const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
        const cards = [...document.querySelectorAll('.results .card, .card[data-id]')];
        const chart = document.querySelector('.ms-chart, #viz, .viz');
        const title = document.querySelector('h1, .brand, header');
        return {
          cards: cards.length, cardsOnScreen: cards.filter(vis).length,
          scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight,
          chartOnScreen: vis(chart), chartH: chart ? Math.round(chart.getBoundingClientRect().height) : 0,
          company: (document.querySelector('[data-company-button], .company-button, #company-btn') || {}).textContent?.trim().slice(0, 40) || null,
          text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
          headerOnScreen: vis(title),
        };
      }).catch((e) => ({ err: e.message }));
      const shot = path.join(OUT, `${engine}-${dev.replace(/\W+/g, '')}-${board}.png`);
      await page.screenshot({ path: shot }).catch(() => {});
      const pageErrors = errs.filter((e) => e.startsWith('pageerror') || e.startsWith('goto'));
      const problems = [
        ...pageErrors,
        ...(!loaded ? ['page did not load'] : []),
        ...(s.err ? [`evaluate: ${s.err}`] : []),
        ...(!s.err && s.cards === 0 ? ['no job cards'] : []),
        ...(!s.err && s.scrollW > s.w + 1 ? [`horizontal scroll ${s.scrollW} > ${s.w}`] : []),
      ];
      const line = `${problems.length ? 'FAIL' : 'ok  '} ${engine.padEnd(8)} ${dev.padEnd(9)} ${board.padEnd(9)} ${String(ms).padStart(6)} ms  cards ${s.cards} (${s.cardsOnScreen} on screen)  chart ${s.chartOnScreen ? `${s.chartH}px` : 'off'}  scroll ${s.scrollW}/${s.w}`;
      console.log(line);
      for (const e of [...new Set(errs)].slice(0, 12)) console.log(`       ${e}`);
      if (problems.length) { bad.push(line); console.log(`       text: ${s.text || ''}`); }
      await ctx.close();
    }
  }
  await browser.close();
}
server.close();
console.log(bad.length ? `phone-smoke: ${bad.length} failing page(s)` : 'phone-smoke: every page loaded with cards, no page error, no horizontal scroll');
process.exit(bad.length ? 1 : 0);

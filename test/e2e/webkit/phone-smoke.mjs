#!/usr/bin/env node
// Phone smoke test of a static build, printed to the job log (artifacts can't always be read): for each engine and
// board, the page errors, console errors, failed requests and what the first screen holds. The user, 2026-10-16:
// "The mobile page on the beta site is totally broken"; Chromium's phone profile looked fine, so this runs WebKit too.
//
//   node test/e2e/webkit/phone-smoke.mjs --dist dist [--out phone-smoke] [--engines webkit,chromium] [--boards apple,amazon,google,meta]
//                                        [--sizes all|phones|postures|<name substring>,...]
//
// Sizes come from test/e2e/phone-sizes.mjs (the user, 2026-10-16: "Make sure we check for all phone sizes from
// iPhone mini to razr to duo or something"): every phone from the folded Galaxy Fold (280 px) to the Surface Duo
// spanned (1114 px), the Razr cover screen, and landscape.
//
// Exit 1 when any page shows a page error, no job cards, a horizontal scroll, a main control (company menu, search,
// Filters, view switch, results sheet) off screen or covered, or a board that never loads. Controls pushed off
// screen and cut text are counted and listed (they fail too when a main control is involved).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PHONES, POSTURES, ALL_SIZES, contextFor } from '../phone-sizes.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIST = path.resolve(arg('dist', 'dist'));
const OUT = path.resolve(arg('out', 'phone-smoke'));
const ENGINES = arg('engines', 'webkit,chromium').split(',');
const BOARDS = arg('boards', 'apple,amazon,google,meta,microsoft').split(',');
const SIZES_ARG = arg('sizes', 'all');
const SIZES = SIZES_ARG === 'all' ? ALL_SIZES : SIZES_ARG === 'phones' ? PHONES : SIZES_ARG === 'postures' ? POSTURES
  : ALL_SIZES.filter((d) => SIZES_ARG.split(',').some((n) => d.name.toLowerCase().includes(n.trim().toLowerCase())));
void fileURLToPath;
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
  for (const size of SIZES) {
    const dev = `${size.width}x${size.height}`;
    for (const board of BOARDS) {
      const ctx = await browser.newContext(contextFor(size, engine));
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
          company: (document.querySelector('#companyMenuBtn') || {}).textContent?.trim().slice(0, 40) || null,
          text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
          headerOnScreen: vis(title),
          // The main controls: on screen, and the top element at their centre is the control itself.
          controls: Object.fromEntries([['company menu', '#companyMenuBtn'], ['search', '#search'], ['Filters', '#filtersToggle'],
            ['view switch', '.topbar-right .seg button, .seg[aria-label="View"] button'],
            // The results sheet is the phone layout's (860 px wide or less); wider pages show the list beside the chart.
            ...(innerWidth <= 860 ? [['results sheet', '#sheetHandle']] : [])].map(([name, sel]) => {
            const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length);
            if (!el) return [name, 'missing'];
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return [name, 'hidden'];
            if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) return [name, `off screen [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`];
            const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)), Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2)));
            if (top && top !== el && !el.contains(top) && !top.contains(el)) return [name, `covered by ${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}${top.className && typeof top.className === 'string' ? '.' + top.className.trim().split(/\s+/)[0] : ''}`];
            return [name, 'ok'];
          })),
          // Controls on screen vertically but cut off at the sides (outside sideways-scrolling rows, which scroll on purpose).
          offscreen: [...document.querySelectorAll('a[href], button, input, select, [role="button"], [tabindex="0"]')].filter((e) => {
            if (!e.getClientRects().length) return false;
            const r = e.getBoundingClientRect();
            if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) return false;
            for (let p = e.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return false; }
            if (e.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
            return r.left < -1 || r.right > innerWidth + 1;
          }).slice(0, 6).map((e) => `${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)} [${Math.round(e.getBoundingClientRect().left)},${Math.round(e.getBoundingClientRect().right)}]`),
          // Text cut by its own box (sub-pixel), on screen.
          cut: [...document.querySelectorAll('body *')].filter((e) => {
            if (!e.firstChild || e.children.length > 2 || !e.textContent.trim()) return false;
            const r = e.getBoundingClientRect();
            // Screen-reader-only text (1 px boxes, clipped on purpose) is not cut text.
            if (r.width <= 2 || r.height <= 2 || e.closest('.sr-only, .visually-hidden, .skip-link')) return false;
            if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
            const cs = getComputedStyle(e);
            return (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 0.5;
          }).slice(0, 8).map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)),
        };
      }).catch((e) => ({ err: e.message }));
      // Errors up to here are the app's. Playwright's screenshot adds a <style> (caret: 'hide') that WebKit's CSP
      // check refuses and logs ("Refused to apply a stylesheet …"): that one is the harness, printed apart.
      const appErrs = errs.splice(0);
      const shot = path.join(OUT, `${engine}-${size.name.replace(/\W+/g, '-').replace(/-+$/, '')}-${dev}-${board}.png`);
      await page.screenshot({ path: shot }).catch(() => {});
      const shotErrs = errs.splice(0);
      errs.push(...appErrs);
      const pageErrors = errs.filter((e) => e.startsWith('pageerror') || e.startsWith('goto'));
      const problems = [
        ...pageErrors,
        ...(!loaded ? ['page did not load'] : []),
        ...(s.err ? [`evaluate: ${s.err}`] : []),
        ...(!s.err && s.cards === 0 ? ['no job cards'] : []),
        ...(!s.err && s.scrollW > s.w + 1 ? [`horizontal scroll ${s.scrollW} > ${s.w}`] : []),
        // On a phone the browser zooms out a page wider than the screen: innerWidth grows past the screen's width.
        ...(!s.err && s.w > size.width + 1 ? [`page wider than the ${size.width} px screen (laid out at ${s.w} px, so the phone zooms it out)`] : []),
        ...(!s.err ? Object.entries(s.controls || {}).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k}: ${v}`) : []),
      ];
      const line = `${problems.length ? 'FAIL' : 'ok  '} ${engine.padEnd(8)} ${size.name.padEnd(34)} ${dev.padEnd(9)} ${board.padEnd(9)} ${String(ms).padStart(6)} ms  cards ${s.cards} (${s.cardsOnScreen} on screen)  chart ${s.chartOnScreen ? `${s.chartH}px` : 'off'}  scroll ${s.scrollW}/${s.w}`;
      console.log(line);
      for (const e of [...new Set(errs)].slice(0, 12)) console.log(`       ${e}`);
      for (const e of [...new Set(shotErrs)].slice(0, 3)) console.log(`       (during the screenshot, harness) ${e}`);
      for (const p of problems.filter((x) => !errs.includes(x))) console.log(`       problem: ${p}`);
      if (s.offscreen && s.offscreen.length) console.log(`       controls cut at the sides: ${s.offscreen.join(' | ')}`);
      if (s.cut && s.cut.length) console.log(`       text cut: ${s.cut.map((t) => JSON.stringify(t)).join(' | ')}`);
      if (problems.length) { bad.push(line); console.log(`       text: ${s.text || ''}`); }
      await ctx.close();
    }
  }
  await browser.close();
}
server.close();
console.log(bad.length ? `phone-smoke: ${bad.length} failing page(s)` : 'phone-smoke: every page loaded with cards, no page error, no horizontal scroll');
process.exit(bad.length ? 1 : 0);

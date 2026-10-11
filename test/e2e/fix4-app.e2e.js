// fix4-app lane (docs/process/fix4-app.md). M-32: on the iPhone SE (real Mobile Safari, the iOS Simulator job of
// .github/workflows/webkit-phone.yml, test/e2e/webkit/ios-sim-menu.mjs) the company sheet stayed 449px tall from
// y=70 while the keyboard left a visual viewport 321px tall from y=28, and the last companies could not be
// reached. Chromium cannot open a real keyboard, so this test fakes what Safari reported: a 375x667 phone whose
// visualViewport is 321px tall at offsetTop 28, with innerHeight shrunk as well (349px), as the SE does.
// It serves the static build (BETA_QA_DIST, else dist/) under /melon-seek/, and skips without one.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

async function serveDist() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(u.pathname.slice('/melon-seek/'.length)); } catch { res.writeHead(400); return res.end(); }
    let p = path.join(dist, rel);
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((r) => server.close(r)) };
}

/** A controllable stand-in for window.visualViewport, installed before the app reads it. */
const FAKE_VV = `(() => {
  const vv = new EventTarget();
  let st = { h: innerHeight, t: 0 };
  const realInner = Object.getOwnPropertyDescriptor(window, 'innerHeight') || Object.getOwnPropertyDescriptor(Window.prototype, 'innerHeight');
  let inner = null;
  Object.defineProperties(vv, {
    height: { get: () => st.h }, width: { get: () => document.documentElement.clientWidth }, offsetTop: { get: () => st.t },
    offsetLeft: { get: () => 0 }, pageTop: { get: () => st.t + scrollY }, pageLeft: { get: () => 0 }, scale: { get: () => 1 },
  });
  Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  Object.defineProperty(window, 'innerHeight', { get: () => (inner != null ? inner : realInner.get.call(window)), configurable: true });
  window.__kb = (h, t, ih) => { st = { h, t }; inner = ih; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); };
})();`;

export function registerFix4AppTests(suite) {
  for (const [site, label] of [['beta/', 'beta'], ['', 'main']]) {
    suite.test(`fix4-app: [M-32] ${label} site, iPhone SE keyboard up: the company sheet fits the visual viewport and its list reaches the last company`, async (ctx) => {
      const st = await serveDist();
      if (!st) skip('no build with a beta copy (npm run build, or BETA_QA_DIST=<dir>)');
      ctx.cleanup.push(() => st.close());
      const context = await ctx.browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      ctx.cleanup.push(() => context.close());
      await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
      await context.addInitScript(FAKE_VV);
      const page = await context.newPage();
      await page.goto(`${st.origin}/melon-seek/${site}#c=${site ? 'apple' : 'anthropic'}`);
      await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 90000 });
      await sleep(500);
      await page.locator('#companyMenuBtn').tap();
      await page.waitForSelector('#popover.popover--company:not([hidden]) .company-list .company-item', { timeout: 15000 });
      await sleep(400);
      const input = page.locator('#popover.popover--company input').first();
      assert(await input.count(), 'the company sheet has a search box');
      await input.focus();
      // What Mobile Safari reported on the iPhone SE with the keyboard up (run 38150084751).
      await page.evaluate(() => window.__kb(321, 28, 349));
      await sleep(1200);
      const g = await page.evaluate(() => {
        const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
        const pop = document.querySelector('#popover');
        const list = pop.querySelector('.company-list');
        list.scrollTop = list.scrollHeight;
        const items = [...list.querySelectorAll('.company-item')];
        return { pop: r(pop), list: r(list), last: items.length ? r(items[items.length - 1]) : null, name: items[items.length - 1]?.textContent.trim().slice(0, 30), kb: document.body.classList.contains('kb-open') };
      });
      const top = 28, bottom = 28 + 321;
      assert(g.pop[0] >= top - 1 && g.pop[1] <= bottom + 1, `sheet ${g.pop[0]}-${g.pop[1]} in a visual viewport ${top}-${bottom} (kb-open ${g.kb})`);
      await sleep(300);
      const last = await page.evaluate(() => { const items = [...document.querySelectorAll('#popover .company-list .company-item')]; const b = items[items.length - 1].getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; });
      assert(last[0] >= top - 1 && last[1] <= bottom + 1 && last[1] <= g.list[1] + 1, `the last company "${g.name}" sits at ${last[0]}-${last[1]}, outside the visible ${top}-${Math.min(bottom, g.list[1])}`);
    });
  }
}

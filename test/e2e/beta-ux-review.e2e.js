// UX and frontend design review of the beta site (docs/process/ux-review-beta.md). Chromium against the
// static build: the build (BETA_QA_DIST, else dist/ from `npm run build`) is served under /melon-seek/
// like GitHub Pages, and the tests open /melon-seek/beta/. Other hosts are aborted (no basemap).
// Each test tagged "[UX-n]" encodes an objective layout, contrast or size problem from that review
// and fails until it is fixed. Matters of taste are in the log, not here. Every test skips when the
// build or the board it needs is missing.
//   node scripts/e2e.js --grep='^Beta UX review'
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';

const VIEWPORTS = {
  d1440: { viewport: { width: 1440, height: 900 } },
  d1280: { viewport: { width: 1280, height: 800 } },
  d1024: { viewport: { width: 1024, height: 768 } },
  t768: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  p390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. */
async function serveDist() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

async function ready(page, timeout = 60000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(500);
}

/** One server per test; `visit(vp, theme, hash)` opens a fresh context on /beta/#<hash>. */
async function session(ctx) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  return {
    async visit(vp, theme, hash) {
      const context = await ctx.browser.newContext({ ...VIEWPORTS[vp], colorScheme: theme });
      ctx.cleanup.push(() => context.close().catch(() => {}));
      await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
      const page = await context.newPage();
      await page.goto(`${st.beta}/#${hash}`);
      await ready(page);
      const company = hash.match(/c=([^&]+)/)?.[1];
      if (company) {
        const mode = await page.evaluate(async ({ base, company }) => (await import(`${base}/api.js`)).getJobs({ company }).then((r) => r.jobs.length ? r.mode : 'empty'), { base: st.beta, company });
        if (mode !== 'snapshot') { await context.close(); skip(`${company} has no snapshot in this build (${mode})`); }
      }
      return { page, close: () => context.close() };
    },
  };
}

/** WCAG contrast of an element's text against its first opaque background (alpha-blended). */
const CONTRAST_FN = `(el) => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const stack = [];
  for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } }
  let bg = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
  const fg = blend(parse(getComputedStyle(el).color), bg);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

export function registerBetaUxReviewTests(suite) {
  // ------------------------------------------------------------------ UX-15
  suite.test('Beta UX review: [UX-15] the stats line never cuts a stat off ("half between $200K and $270", "mostly Goo…")', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const vp of ['d1440', 'd1280', 'd1024']) {
      for (const c of ['google', 'nvidia', 'apple']) {
        const { page, close } = await s.visit(vp, 'light', `c=${c}`);
        const cut = await page.evaluate(() => {
          const line = document.querySelector('#statsLine');
          const lr = line.getBoundingClientRect();
          return [...line.querySelectorAll('.stat')].filter((st) => getComputedStyle(st).display !== 'none').flatMap((st) => {
            const r = st.getBoundingClientRect();
            const hidden = r.right > lr.right + 0.5 || st.scrollWidth > st.clientWidth + 1;
            return hidden ? [`"${st.textContent.trim()}" (shown ${Math.max(0, Math.round(Math.min(r.right, lr.right) - r.left))} of ${Math.round(st.scrollWidth)} px)`] : [];
          });
        });
        for (const x of cut) bad.push(`${vp} ${c}: ${x}`);
        await close();
      }
    }
    assert(!bad.length, `stats clipped by the stats line's overflow: hidden:\n  ${bad.join('\n  ')}`);
  });

  // ------------------------------------------------------------------ UX-16
  suite.test('Beta UX review: [UX-16] a card shows its whole location ("Santa Clara, …" behind a long department)', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const vp of ['d1440', 'd1280', 'd1024', 'p390']) {
      for (const c of ['nvidia', 'microsoft']) {
        const { page, close } = await s.visit(vp, 'light', `c=${c}`);
        if (vp === 'p390') { await page.locator('#sheetHandle').tap(); await sleep(700); }
        const cut = await page.$$eval('#resultsList article.card .card-loc', (els) => els.slice(0, 12)
          .filter((e) => e.getBoundingClientRect().width && e.scrollWidth > e.clientWidth + 1)
          .map((e) => `"${e.textContent}" ${e.clientWidth}/${e.scrollWidth}px beside "${e.parentElement.querySelector('.card-dept')?.textContent}"`));
        for (const x of cut) bad.push(`${vp} ${c}: ${x}`);
        await close();
      }
    }
    assert(!bad.length, `card locations truncated with an ellipsis (${bad.length}):\n  ${bad.slice(0, 12).join('\n  ')}`);
  });

  // ------------------------------------------------------------------ UX-17
  suite.test('Beta UX review: [UX-17] the chart\'s edge chips ("‹12", "›19") stay on screen and clear of the row label', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const vp of ['p390', 'd1440', 'd1024']) {
      for (const c of ['google', 'apple']) {
        const { page, close } = await s.visit(vp, 'light', `c=${c}`);
        const r = await page.evaluate(() => {
          const out = [];
          const W = document.documentElement.clientWidth;
          // fix-ui-6 (2026-10-24): what is on screen, inside every box that clips it. The chart's rows scroll in a box
          // the notes line sits under; a row partly past that box's bottom has its chip clipped away, not drawn on the
          // line (Google at p390: "‹1" at y 658–676 under a box that ends at 654, measured as touching the line).
          const shown = (el, q) => {
            let v = { left: q.left, right: q.right, top: q.top, bottom: q.bottom };
            for (let e = el.parentElement; e; e = e.parentElement) {
              if (getComputedStyle(e).overflow === 'visible') continue;
              const b = e.getBoundingClientRect();
              v = { left: Math.max(v.left, b.left), right: Math.min(v.right, b.right), top: Math.max(v.top, b.top), bottom: Math.min(v.bottom, b.bottom) };
            }
            return v.right - v.left > 0.5 && v.bottom - v.top > 0.5 ? v : null;
          };
          const texts = [];
          const walker = document.createTreeWalker(document.querySelector('#chartHost'), NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            if (!n.textContent.trim() || n.parentElement.closest('.ms-bin')) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const box of rg.getClientRects()) { const q = shown(n.parentElement, box); if (q) texts.push({ t: n.textContent.trim(), q }); }
          }
          for (const ch of document.querySelectorAll('.ms-bin__chip')) {
            const all = ch.getBoundingClientRect();
            if (!all.width) continue;
            if (all.left < -0.5 || all.right > W + 0.5) out.push(`"${ch.textContent}" runs off the screen [${Math.round(all.left)}, ${Math.round(all.right)}] of ${W}`);
            const r = shown(ch, all);
            if (!r) continue;
            for (const { t, q } of texts) {
              if (q.bottom <= r.top || q.top >= r.bottom) continue;
              const gap = q.right <= r.left ? r.left - q.right : q.left >= r.right ? q.left - r.right : -1;
              if (gap < 2) out.push(`"${ch.textContent}" touches "${t}" (gap ${gap.toFixed(1)} px)`);
            }
          }
          return out;
        });
        for (const x of r) bad.push(`${vp} ${c}: ${x}`);
        await close();
      }
    }
    assert(!bad.length, `edge chips clipped or colliding (${bad.length}):\n  ${[...new Set(bad)].slice(0, 12).join('\n  ')}`);
  });

  // ------------------------------------------------------------------ UX-18
  suite.test('Beta UX review: [UX-18] the Snapshot badge text has at least 4.5:1 contrast (light and dark)', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const theme of ['light', 'dark']) {
      for (const vp of ['d1440', 'p390']) {
        const { page, close } = await s.visit(vp, theme, 'c=apple');
        const badge = page.locator('#dataBadge');
        assert(await badge.isVisible(), 'the data badge is visible');
        const ratio = await badge.evaluate(new Function(`return ${CONTRAST_FN}`)());
        const text = (await badge.innerText()).trim().split('\n')[0];
        if (ratio < 4.5) bad.push(`${vp} ${theme}: "${text}" ${ratio.toFixed(2)}:1`);
        await close();
      }
    }
    assert(!bad.length, `Snapshot badge under 4.5:1: ${bad.join('; ')}`);
  });

  // ------------------------------------------------------------------ UX-19
  // fix4-app (docs/process/fix4-app.md): UX-19 is split by owner, the reviewer's checks unchanged. The top bar
  // (Beta tag, logo) is public/styles.css; the map's Pay/Juice and zoom controls are public/viz/viz.css (fix4-viz).
  // The tap area is the box plus its ::before hit area (negative insets), the fix the reviewer allowed ("a ::before
  // hit box") and the one M-27 measures (test/e2e/fix-beta-app.e2e.js); a pseudo-element with no content adds nothing.
  const tapSizes = (page) => async (sel) => page.$$eval(sel, (els) => els.filter((e) => e.getBoundingClientRect().width).map((e) => {
    const r = e.getBoundingClientRect();
    const a = getComputedStyle(e, '::before');
    const out = (v) => (a.content && a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(v) || 0) : 0);
    return { name: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24), w: Math.round(r.width + out(a.left) + out(a.right)), h: Math.round(r.height + out(a.top) + out(a.bottom)) };
  }));
  suite.test('Beta UX review: [UX-19] phone tap targets are at least 44 px (Beta tag, logo)', async (ctx) => {
    const s = await session(ctx);
    const { page } = await s.visit('p390', 'light', 'c=apple');
    const sizes = tapSizes(page);
    const found = [...await sizes('.beta-tag'), ...await sizes('a.brand')];
    assert(found.length >= 2, `found the Beta tag and the logo (${found.length})`);
    const small = found.filter((t) => t.w < 44 || t.h < 44);
    assert(!small.length, `tap targets under 44x44 px at 390x844: ${small.map((t) => `"${t.name}" ${t.w}x${t.h}`).join(', ')}`);
  });

  suite.test('Beta UX review: [UX-19 map] phone tap targets are at least 44 px (map Pay/Juice and zoom)', async (ctx) => {
    const s = await session(ctx);
    const { page } = await s.visit('p390', 'light', 'c=apple');
    const sizes = tapSizes(page);
    await page.locator('button[data-mode=map]').tap();
    await page.waitForSelector('#mapHost .ms-modes__btn', { timeout: 20000 });
    await sleep(800);
    const found = [...await sizes('#mapHost .ms-modes__btn'), ...await sizes('#mapHost .leaflet-control-zoom a')];
    assert(found.length >= 3, `found the Pay/Juice and zoom controls (${found.length})`);
    const small = found.filter((t) => t.w < 44 || t.h < 44);
    assert(!small.length, `tap targets under 44x44 px at 390x844: ${small.map((t) => `"${t.name}" ${t.w}x${t.h}`).join(', ')}`);
  });

  // ------------------------------------------------------------------ UX-20
  suite.test('Beta UX review: [UX-20] no text under 12 px in Insights (pay estimate scale and comparable roles)', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const vp of ['d1440', 'd1024']) {
      const { page, close } = await s.visit(vp, 'light', 'c=apple&m=insights');
      await page.waitForFunction(() => document.querySelector('#compHost')?.innerText.length > 50, null, { timeout: 30000 });
      await sleep(800);
      const small = await page.evaluate(() => [...document.querySelectorAll('#insightsHost *')].filter((e) => {
        if (!e.getBoundingClientRect().width || e.closest('[hidden]')) return false;
        if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
        return parseFloat(getComputedStyle(e).fontSize) < 12;
      }).map((e) => `"${e.textContent.trim().slice(0, 40)}" ${getComputedStyle(e).fontSize}`));
      for (const x of [...new Set(small)].slice(0, 6)) bad.push(`${vp}: ${x}`);
      await close();
    }
    assert(!bad.length, `Insights text under 12 px:\n  ${bad.join('\n  ')}`);
  });

  // ------------------------------------------------------------------ UX-21
  suite.test('Beta UX review: [UX-21] the search box shows its whole placeholder ("Search titles, t")', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const vp of ['d1440', 'd1280', 'd1024', 't768', 'p390']) {
      const { page, close } = await s.visit(vp, 'light', 'c=google');
      const r = await page.$eval('#search', (inp) => {
        const cs = getComputedStyle(inp);
        const cv = document.createElement('canvas').getContext('2d');
        cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const need = cv.measureText(inp.placeholder).width;
        const have = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { need: Math.ceil(need), have: Math.floor(have), text: inp.placeholder };
      });
      if (r.need > r.have) bad.push(`${vp}: "${r.text}" needs ${r.need} px, the box has ${r.have} px`);
      await close();
    }
    assert(!bad.length, `search placeholder clipped:\n  ${bad.join('\n  ')}`);
  });

  // ------------------------------------------------------------------ guard (passes today)
  suite.test('Beta UX review: no horizontal page scroll on any viewport or theme (Apple, NVIDIA)', async (ctx) => {
    const s = await session(ctx);
    const bad = [];
    for (const vp of Object.keys(VIEWPORTS)) {
      for (const theme of ['light', 'dark']) {
        for (const c of ['apple', 'nvidia']) {
          const { page, close } = await s.visit(vp, theme, `c=${c}`);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (over > 0) bad.push(`${vp} ${theme} ${c}: ${over} px`);
          await close();
        }
      }
    }
    assert(!bad.length, `horizontal scroll: ${bad.join(', ')}`);
  });
}

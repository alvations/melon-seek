// Methodology pages in a real browser (docs/process/methodology-ux.md): the guide at /methodology/
// (docs/METHODOLOGY_GUIDE.md with build-time charts, scripts/methodology.js) and the technical
// reference at /methodology/reference/ (docs/LIVABILITY.md), served by the real server that
// scripts/e2e.js starts (same renderer as the static build).
// Registered in scripts/e2e.js; run alone with: node scripts/e2e.js --grep=Methodology
// E2E_SHOTS=1 also writes docs/screenshots/methodology/*.png (guide and reference, 1440 and 390,
// light and dark, plus close-ups of three charts).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, assertEq, skip } from './harness.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'methodology');
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const FIGURES = ['formula', 'waterfall', 'households', 'score-curve', 'grades', 'tax-split', 'sources', 'confidence'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isExternal = (url, base) => !!url && !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:');

async function referenceIds() {
  const { mdToHtml } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'md.js')).href);
  return mdToHtml(fs.readFileSync(path.join(ROOT, 'docs', 'LIVABILITY.md'), 'utf8')).headings.map((h) => h.id);
}
const guideFigures = () => {
  const f = path.join(ROOT, 'docs', 'METHODOLOGY_GUIDE.md');
  return fs.existsSync(f) ? [...new Set([...fs.readFileSync(f, 'utf8').matchAll(/\{\{figure:([\w-]+)\}\}/g)].map((m) => m[1]))] : null;
};

/** A page with error, CSP-violation and HTTP-failure collection. `theme` sets the app's saved theme first. */
async function openPage(ctx, rel, { viewport = DESKTOP, colorScheme = 'light', theme = null } = {}) {
  const context = await ctx.browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => isExternal(u.href, ctx.baseUrl), (r) => r.abort('blockedbyclient'));
  await context.addInitScript((t) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    if (t) { try { localStorage.setItem('melon-seek.theme', t); } catch { /* ignore */ } }
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (!isExternal(r.url(), ctx.baseUrl) && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(`${ctx.baseUrl}${rel}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return { context, page, errors };
}
const cspViolations = (page) => page.evaluate(() => window.__csp || []);

export function registerMethodologyTests(suite) {
  suite.test('Methodology: guide and reference have no horizontal overflow at 1440 and 390 px', async (ctx) => {
    for (const rel of ['/methodology/', '/methodology/reference/']) {
      for (const viewport of [DESKTOP, PHONE, { width: 360, height: 740 }]) {
        const { page, context } = await openPage(ctx, rel, { viewport });
        const m = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          // Figures never spill out of their card (tables scroll inside their own box).
          spill: [...document.querySelectorAll('.mf')].filter((f) => f.scrollWidth > f.clientWidth + 1).map((f) => f.id),
        }));
        assert(m.sw <= m.cw, `${rel} at ${viewport.width}px: page scrolls sideways (${m.sw} > ${m.cw})`);
        assertEq(m.spill.join(','), '', `${rel} at ${viewport.width}px: figures overflow`);
        await context.close();
      }
    }
  });

  suite.test('Methodology: every figure renders; charts have <title> and <desc>; text stays readable on phones', async (ctx) => {
    const used = guideFigures();
    if (!used) skip('docs/METHODOLOGY_GUIDE.md not written yet (methodology/ is the reference)');
    for (const viewport of [DESKTOP, PHONE]) {
      const { page, context } = await openPage(ctx, '/methodology/', { viewport });
      const r = await page.evaluate((names) => {
        const figs = names.map((n) => {
          const el = document.querySelector(`figure[data-figure="${n}"]`);
          const box = el && el.getBoundingClientRect();
          return { n, ok: !!el && box.width > 200 && box.height > 60 };
        });
        const charts = [...document.querySelectorAll('svg[role="img"]')].map((s) => {
          const ids = (s.getAttribute('aria-labelledby') || '').split(/\s+/);
          const box = s.getBoundingClientRect();
          return {
            id: ids[0], title: (s.querySelector(':scope > title') || {}).textContent || '', desc: (s.querySelector(':scope > desc') || {}).textContent || '',
            labelled: ids.length === 2 && ids.every((id) => document.getElementById(id) && s.contains(document.getElementById(id))), w: box.width, h: box.height,
          };
        });
        // The score curve spans the plot (it once rendered as an 18 px stub, public/styles.css icon rule).
        const plot = document.querySelector('#fig-score-curve svg.mf-plot');
        const curve = plot && plot.querySelector('path.mf-curve');
        const pb = plot && plot.getBoundingClientRect(), cb = curve && curve.getBoundingClientRect();
        const small = [...document.querySelectorAll('.mf text, .mf p, .mf span, .mf li, .mf td, .mf th, .mf dt, .mf dd, .mf strong, .mf summary, .mf figcaption')]
          .filter((e) => e.getClientRects().length && e.textContent.trim() && !e.closest('.sr-only, details:not([open]) > :not(summary)'))
          .map((e) => [e.textContent.trim().slice(0, 30), parseFloat(getComputedStyle(e).fontSize)]).filter(([, px]) => px < 12);
        return { figs, charts, curve: pb && cb ? { plotW: pb.width, w: cb.width, h: cb.height, plotH: pb.height } : null, small };
      }, used);
      for (const f of r.figs) assert(f.ok, `${viewport.width}px: figure ${f.n} missing or empty`);
      assert(r.charts.length >= 7, `${viewport.width}px: ${r.charts.length} charts`);
      for (const c of r.charts) {
        assert(c.title.length > 8 && c.desc.length > 20, `${c.id}: <title>/<desc> present`);
        assert(c.labelled, `${c.id}: aria-labelledby points at its own title and desc`);
        assert(c.w > 100 && c.h > 10, `${c.id}: drawn (${Math.round(c.w)}×${Math.round(c.h)})`);
      }
      assert(r.curve, 'score curve path');
      assert(r.curve.w >= 0.9 * r.curve.plotW, `${viewport.width}px: the curve spans the plot (${Math.round(r.curve.w)} of ${Math.round(r.curve.plotW)} px)`);
      assert(r.curve.h >= 0.9 * r.curve.plotH, `${viewport.width}px: the curve rises through the plot (${Math.round(r.curve.h)} of ${Math.round(r.curve.plotH)} px)`);
      assertEq(JSON.stringify(r.small), '[]', `${viewport.width}px: figure text under 12 px`);
      await context.close();
    }
  });

  suite.test('Methodology: no literal "{{", "undefined" or "NaN" on the pages', async (ctx) => {
    for (const rel of ['/methodology/', '/methodology/reference/']) {
      const { page, context } = await openPage(ctx, rel);
      const text = await page.evaluate(() => {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('code, pre').forEach((c) => c.remove());
        return clone.textContent;
      });
      assert(!text.includes('{{'), `${rel}: literal "{{"`);
      assert(!/\bundefined\b|\bNaN\b/.test(text), `${rel}: "undefined" or "NaN" in the text`);
      await context.close();
    }
  });

  suite.test('Methodology: #1-the-formula lands on the formula section, and old reference anchors still land', async (ctx) => {
    for (const viewport of [DESKTOP, PHONE]) {
      const { page, context } = await openPage(ctx, '/methodology/#1-the-formula', { viewport });
      await sleep(400);
      const r = await page.evaluate(() => {
        const h = document.getElementById('1-the-formula');
        const bar = document.querySelector('.doc-top').getBoundingClientRect();
        return h && { top: h.getBoundingClientRect().top, bar: bar.bottom, text: h.textContent, tag: h.tagName, scrolled: window.scrollY };
      });
      assert(r, '#1-the-formula exists');
      assert(/formula/i.test(r.text) && r.tag === 'H2', `lands on the formula heading (${r.tag} "${r.text}")`);
      assert(r.scrolled > 100, 'the page scrolled to it');
      assert(r.top >= r.bar - 1 && r.top <= r.bar + 160, `${viewport.width}px: heading just below the sticky bar (top ${Math.round(r.top)}, bar ${Math.round(r.bar)})`);
      await context.close();
    }
    const ids = await referenceIds();
    const { page } = await openPage(ctx, '/methodology/');
    const missing = await page.evaluate((list) => list.filter((id) => !document.getElementById(id)), ids);
    assertEq(missing.join(', '), '', 'every reference heading id also exists on the guide');
    for (const id of ['score-curve-and-grades', '3-tax-model', '42-rent-by-number-of-bedrooms'].filter((x) => ids.includes(x))) {
      await page.goto(`${ctx.baseUrl}/methodology/#${id}`);
      await sleep(300);
      const r = await page.evaluate((x) => { const b = document.getElementById(x).getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; }, id);
      assert(r.top >= 0 && r.bottom <= r.vh, `#${id} scrolls into view (top ${Math.round(r.top)} of ${r.vh})`);
    }
  });

  suite.test('Methodology: the reference page has every docs/LIVABILITY.md heading and links back to the guide', async (ctx) => {
    const ids = await referenceIds();
    const { page } = await openPage(ctx, '/methodology/reference/');
    const r = await page.evaluate((list) => ({
      missing: list.filter((id) => !/^H[1-6]$/.test((document.getElementById(id) || {}).tagName || '')),
      guide: !!document.querySelector('.doc-top a[href="../"]'),
      back: [...document.querySelectorAll('a')].some((a) => a.textContent.includes('Back to the jobs') && a.getAttribute('href') === '../../'),
      toc: document.querySelectorAll('.doc-toc a').length,
    }), ids);
    assertEq(r.missing.join(', '), '', 'reference headings');
    assert(r.guide && r.back, 'links to the guide and back to the jobs');
    assert(r.toc >= 5, 'contents list');
  });

  suite.test('Methodology: the drawer\'s "How it\'s calculated" link opens the guide on the formula', async (ctx) => {
    const context = await ctx.browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
    ctx.cleanup.push(() => context.close());
    await context.route((u) => isExternal(u.href, ctx.baseUrl), (r) => r.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.goto(`${ctx.baseUrl}/#c=anthropic`);
    await page.locator('#resultsTitle strong').first().waitFor({ timeout: 30000 });
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      const card = page.locator('#resultsList .card').nth(i);
      if (!(await card.count())) break;
      await card.click(); await sleep(700);
      found = (await page.locator('#drawer details.juice-details').count()) > 0;
    }
    if (!found) skip('no role with a Juice Score in the first cards');
    const juice = page.locator('#drawer details.juice-details');
    if (!(await juice.evaluate((d) => d.open))) await juice.locator(':scope > summary').click();
    const link = juice.locator('.juice-disclaimer a');
    const href = await link.evaluate((a) => a.href);
    assertEq(new URL(href).pathname + new URL(href).hash, '/methodology/#1-the-formula', 'link target');
    const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await popup.waitForLoadState('load'); await sleep(400);
    const r = await popup.evaluate(() => {
      const h = document.getElementById('1-the-formula');
      return { path: location.pathname, hash: location.hash, top: h ? h.getBoundingClientRect().top : null, guide: !!document.querySelector('.g-main'), figures: document.querySelectorAll('figure[data-figure]').length };
    });
    assertEq(r.path + r.hash, '/methodology/#1-the-formula', 'opened page');
    assert(r.top !== null && r.top >= 0 && r.top < 250, `formula heading in view (top ${r.top})`);
    if (guideFigures()) assert(r.guide && r.figures >= 8, 'the guide, with its charts');
    await popup.close();
  });

  suite.test('Methodology: dark mode follows the system and the saved theme (theme-init.js parity)', async (ctx) => {
    const cases = [
      { colorScheme: 'dark', theme: null, dark: true },
      { colorScheme: 'light', theme: 'dark', dark: true },
      { colorScheme: 'dark', theme: 'light', dark: false },
      { colorScheme: 'light', theme: null, dark: false },
    ];
    for (const rel of ['/methodology/', '/methodology/reference/']) {
      for (const c of cases) {
        const { page, context } = await openPage(ctx, rel, c);
        const r = await page.evaluate(() => {
          const lum = (rgb) => { const [r, g, b] = (rgb.match(/[\d.]+/g) || [0, 0, 0]).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
          const t = document.querySelector('svg.mf-svg text.mf-t');
          const fig = document.querySelector('.mf');
          return {
            bg: lum(getComputedStyle(document.body).backgroundColor), text: lum(getComputedStyle(document.body).color),
            chartText: t ? lum(getComputedStyle(t).fill) : null, figBg: fig ? lum(getComputedStyle(fig).backgroundColor) : null,
          };
        });
        const where = `${rel} system ${c.colorScheme}, saved ${c.theme || 'none'}`;
        if (c.dark) {
          assert(r.bg < 0.15 && r.text > 0.7, `${where}: dark page (bg ${r.bg.toFixed(2)}, text ${r.text.toFixed(2)})`);
          if (r.chartText !== null) assert(r.chartText > 0.7 && r.figBg < 0.2, `${where}: dark charts`);
        } else {
          assert(r.bg > 0.9 && r.text < 0.2, `${where}: light page`);
          if (r.chartText !== null) assert(r.chartText < 0.2 && r.figBg > 0.9, `${where}: light charts`);
        }
        await context.close();
      }
    }
  });

  suite.test('Methodology: no console errors, failed requests or CSP violations', async (ctx) => {
    for (const rel of ['/methodology/', '/methodology/reference/', '/methodology/#1-the-formula']) {
      for (const [viewport, colorScheme] of [[DESKTOP, 'light'], [PHONE, 'dark']]) {
        const { page, errors, context } = await openPage(ctx, rel, { viewport, colorScheme });
        await sleep(300);
        const csp = await cspViolations(page);
        assertEq([...errors, ...csp.map((v) => `CSP: ${v}`)].join('\n'), '', `${rel} at ${viewport.width}px ${colorScheme}`);
        await context.close();
      }
    }
  });

  suite.test('Methodology: screenshots (E2E_SHOTS=1 writes docs/screenshots/methodology/)', async (ctx) => {
    if (!process.env.E2E_SHOTS) skip('set E2E_SHOTS=1 to write the screenshots');
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const [name, rel] of [['guide', '/methodology/'], ['reference', '/methodology/reference/']]) {
      for (const viewport of [DESKTOP, PHONE]) {
        for (const colorScheme of ['light', 'dark']) {
          const { page, context } = await openPage(ctx, rel, { viewport, colorScheme });
          await page.screenshot({ path: path.join(SHOTS, `${name}-${viewport.width}-${colorScheme}.png`) });
          await context.close();
        }
      }
    }
    for (const [viewport, colorScheme] of [[DESKTOP, 'light'], [PHONE, 'dark']]) {
      const { page, context } = await openPage(ctx, '/methodology/', { viewport, colorScheme });
      for (const fig of ['score-curve', 'tax-split', 'households', 'formula']) {
        const el = page.locator(`#fig-${fig}`);
        if (await el.count()) await el.screenshot({ path: path.join(SHOTS, `figure-${fig}-${viewport.width}-${colorScheme}.png`) });
      }
      await context.close();
    }
  });
}

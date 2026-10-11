// Accessibility review of the beta site, 2026-10-11 (docs/REVIEW.md "beta review 2026-10-11",
// docs/process/review-beta.md). Chromium against the static build's beta copy, served under
// /melon-seek/ like GitHub Pages (ROOT/dist by default; E2E_DIST=<dir> serves another build).
// Each test encodes one finding (A-n) or the residual of an earlier one (V8) and FAILS until it
// is fixed. Every test skips when the build (or the beta data it needs) is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serveDist() {
  const dist = path.resolve(process.env.E2E_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
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
  return { origin, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

async function openBeta(ctx, hash, { viewport = DESKTOP, colorScheme = 'light', ...opts } = {}) {
  const st = await serveDist();
  if (!st) skip('dist/beta/ not built (npm run build, or set E2E_DIST)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1, ...opts });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${st.beta}/#${hash}`);
  await ready(page);
  return { st, context, page };
}
async function ready(page, timeout = 90000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(500);
}
async function needCompany(page, slug) {
  const ok = await page.evaluate((s) => !!document.querySelector(`#resultsList .card[data-id^="${s}:"]`), slug);
  if (!ok) skip(`no ${slug} roles in this build`);
}

export function registerBetaA11yTests(suite) {
  suite.test('[A-1] beta a11y: a result card exposes its team and level to screen readers, not only title, pay and place', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=microsoft');
    await needCompany(page, 'microsoft');
    const r = await page.evaluate(() => {
      const card = document.querySelector('#resultsList .card');
      const ids = (card.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const desc = ids.map((id) => document.getElementById(id)?.textContent || '').join(' ');
      const spoken = `${card.getAttribute('aria-label') || ''} ${desc}`;
      return { spoken, dept: card.querySelector('.card-dept')?.textContent || '', level: card.querySelector('.sen')?.textContent || '', age: card.querySelector('.card-age, .card-age-top')?.textContent || '' };
    });
    assert(r.dept && r.spoken.includes(r.dept), `the card's name and description leave out its team "${r.dept}": "${r.spoken}"`);
    assert(r.level && r.spoken.includes(r.level), `the card's name and description leave out its level "${r.level}": "${r.spoken}"`);
  });

  suite.test('[A-2] beta a11y: the data badge popover takes keyboard focus when it opens', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=apple');
    await page.focus('#dataBadge');
    await page.keyboard.press('Enter');
    await sleep(400);
    const open = await page.evaluate(() => !document.querySelector('#popover').hidden);
    assert(open, 'the popover did not open');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('#popover'));
    await page.keyboard.press('Tab');
    const afterTab = await page.evaluate(() => `${document.activeElement.tagName}#${document.activeElement.id} inPopover=${!!document.activeElement.closest('#popover')}`);
    assert(inside, `focus stayed on the badge; the next Tab went to ${afterTab}, so the popover's Close and "Download CSV" are only reachable after the whole page`);
  });

  suite.test('[A-3] beta a11y: at 200% zoom (640 x 450 CSS px) the company menu still shows the company name', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=microsoft', { viewport: { width: 640, height: 450 } });
    const r = await page.evaluate(() => { const e = document.querySelector('#companyMenuBtn .company-name'); return { text: e.textContent, shown: e.clientWidth, need: e.scrollWidth }; });
    assert(r.shown >= r.need - 1, `"${r.text}" gets ${r.shown}px of the ${r.need}px it needs (the beta tag and the Snapshot badge take the row)`);
  });

  suite.test('[A-4] beta a11y: the Snapshot badge text has 4.5:1 contrast in the light theme', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=apple');
    const ratio = await page.evaluate(() => {
      const badge = document.querySelector('#dataBadge');
      const label = badge.querySelector('.badge-label');
      const parse = (c) => c.match(/[\d.]+/g).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const before = getComputedStyle(label, '::before');
      const fg = parse(before.content && before.content !== 'none' ? before.color : getComputedStyle(label).color);
      const bg = parse(getComputedStyle(badge).backgroundColor);
      const a = L(fg), b = L(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    assert(ratio >= 4.5, `Snapshot badge text is ${ratio.toFixed(2)}:1 (12.5px semibold needs 4.5:1)`);
  });

  suite.test('[A-5] beta a11y: the results list holds only list items (no role=none children in the <ol>)', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=google');
    const bad = await page.evaluate(() => [...document.querySelector('#resultsList').children]
      .filter((c) => c.tagName !== 'LI' || (c.getAttribute('role') && c.getAttribute('role') !== 'listitem'))
      .map((c) => `${c.tagName}.${c.className} role=${c.getAttribute('role')}`));
    assert(!bad.length, `#resultsList has children that are not list items: ${[...new Set(bad)].join(', ')}`);
  });

  suite.test('[A-6] beta a11y: every part of a Juice breakdown row is inside a cell (tax split, rent basis)', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=nvidia');
    await page.locator('#resultsList .card').first().click();
    await sleep(1500);
    await page.evaluate(() => document.querySelectorAll('#drawer details').forEach((d) => { d.open = true; }));
    await sleep(800);
    const has = await page.locator('#drawer .waterfall [role=row]').count();
    if (!has) skip('the first NVIDIA role has no Juice breakdown');
    const stray = await page.evaluate(() => [...document.querySelectorAll('#drawer .waterfall [role=row]')].flatMap((row) => [...row.children]
      .filter((c) => !['rowheader', 'cell', 'gridcell', 'columnheader'].includes(c.getAttribute('role')) && c.getAttribute('aria-hidden') !== 'true')
      .map((c) => `${c.className}: "${c.textContent.trim().slice(0, 50)}"`)));
    assert(!stray.length, `row content outside any cell (skipped in table navigation): ${stray.join(' | ')}`);
  });

  suite.test('[A-7] beta a11y: Insights has no two region landmarks with the same name', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=nvidia&m=insights');
    await sleep(2500);
    const dupes = await page.evaluate(() => {
      const names = [...document.querySelectorAll('section[aria-label], section[aria-labelledby], [role=region]')]
        .filter((e) => e.getClientRects().length)
        .map((e) => e.getAttribute('aria-label') || document.getElementById(e.getAttribute('aria-labelledby'))?.textContent?.trim() || '');
      return names.filter((n, i) => n && names.indexOf(n) !== i);
    });
    assert(!dupes.length, `duplicate region names: ${dupes.join(', ')}`);
  });

  suite.test('[V8] beta a11y: the salary range sliders are at least 24px tall (WCAG 2.5.8)', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=apple');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#filters .range')].filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().height)));
    if (!sizes.length) skip('no salary sliders visible');
    assert(sizes.every((h) => h >= 24), `slider heights ${sizes.join(', ')}px`);
  });
}

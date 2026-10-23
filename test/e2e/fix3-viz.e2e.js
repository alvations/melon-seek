// fix3-viz lane e2e checks (docs/process/fix3-viz.md): the beta persona review, 2026-10-11
// (docs/process/lead.md "Beta, stage 1c"), BP-2 (chart side), BP-13 (chart side) and the map's pin
// names. The beta checks run against the static build's beta copy (dist/beta/, `npm run build`),
// served under /melon-seek/ like GitHub Pages; the main-site checks run against the server that
// scripts/e2e.js starts. Map tiles are blocked, so the map is in its offline look (place names
// under the pins). Each check skips when the board it needs is missing or has no such roles.
// The Location-filter checks need app.js to hand its filter to the chart and map
// (docs/process/patches/fix3-viz-app-places.diff).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serve ROOT/dist under /melon-seek/ (the GitHub Pages layout) on a free port; null without a beta build. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
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

/** A fresh page on `base` (the beta build, or the e2e server) at `hash`; outside hosts are aborted. */
async function openAt(ctx, base, hash, { phone = false, locale = 'en-US' } = {}) {
  const context = await ctx.browser.newContext(phone
    ? { viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale }
    : { viewport: DESKTOP, deviceScaleFactor: 1, locale });
  ctx.cleanup.push(() => context.close());
  const origin = new URL(base).origin;
  await context.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${base}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 60000 });
  await sleep(800);
  return page;
}
async function openBeta(ctx, hash, opts) {
  const st = await serveDist();
  if (!st) skip('dist/beta/ not built (npm run build)');
  ctx.cleanup.push(() => st.close());
  const page = await openAt(ctx, st.beta, hash, opts);
  return { st, page };
}
/** Skip unless `company` is a real (snapshot) board in the beta build. */
async function needBoard(page, base, company) {
  const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base, company });
  if (mode !== 'snapshot') skip(`${company} has no beta snapshot in dist/beta (${mode})`);
}

/** The stats line's pay share (its title: "W of N postings include a pay range …") and median. */
async function statsLine(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('#statsLine .stat')];
    const share = items.find((s) => /show pay/.test(s.textContent));
    const m = share && /([\d,]+) of ([\d,]+) postings include a pay range/.exec(share.title || '');
    const med = items.find((s) => /median/.test(s.textContent) && !/half between/.test(s.textContent));
    return {
      text: document.querySelector('#statsLine')?.innerText.replace(/\s+/g, ' ') || '',
      withSalary: m ? Number(m[1].replace(/,/g, '')) : null,
      n: m ? Number(m[2].replace(/,/g, '')) : null,
      median: med ? (med.querySelector('strong')?.textContent || '').trim() : null,
    };
  });
}
/** What the chart says: its notes line, its empty message, its median caption and its rows. */
async function chartSays(page) {
  await page.locator('#chartHost .ms-chart__foot, #chartHost .ms-chart__empty:not([hidden])').first().waitFor({ timeout: 20000 });
  return page.evaluate(() => {
    const host = document.querySelector('#chartHost');
    const vis = (e) => e && !e.hidden && e.getClientRects().length > 0;
    const empty = host.querySelector('.ms-chart__empty');
    const foot = host.querySelector('.ms-chart__foot');
    return {
      foot: vis(foot) ? foot.textContent : '',
      empty: vis(empty) ? empty.textContent : '',
      cap: host.querySelector('.ms-hist__cap')?.textContent || '',
      rows: [...host.querySelectorAll('.ms-crow__label')].map((l) => l.getAttribute('aria-label') || ''),
      plotted: (/^([\d,]+) (?:postings? )?with (?:salary|pay)/.exec(vis(foot) ? foot.textContent : '') || [])[1] ?? null,
    };
  });
}
const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));

async function mapReady(page) {
  await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 30000 });
  await sleep(1500);
}
/** Every pin: its accessible name, the text on the pill and its place name if one shows. */
async function pins(page) {
  return page.$$eval('#mapHost .ms-pin-icon', (icons) => icons.map((p) => {
    const lab = p.querySelector('.ms-pin__label');
    const shown = lab && getComputedStyle(lab).display !== 'none' && lab.getClientRects().length > 0;
    return { name: p.getAttribute('aria-label') || '', pill: p.querySelector('.ms-pin__price')?.textContent || '', label: shown ? lab.textContent : null };
  }));
}
/** Place names that overlap another name or pin, or leave the map. */
async function labelClashes(page) {
  return page.evaluate(() => {
    const host = document.querySelector('#mapHost').getBoundingClientRect();
    const vis = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length; };
    const all = [...document.querySelectorAll('#mapHost .ms-pin')].map((p) => ({ p, r: p.getBoundingClientRect() }));
    const labs = all.map(({ p }) => p.querySelector('.ms-pin__label')).filter((l) => l && vis(l)).map((l) => ({ l, r: l.getBoundingClientRect(), own: l.closest('.ms-pin') }));
    const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    const out = [];
    labs.forEach((a, i) => {
      if (a.r.left < host.left - 1 || a.r.right > host.right + 1) out.push(`"${a.l.textContent}" leaves the map`);
      labs.forEach((b, j) => { if (j > i && hit(a.r, b.r)) out.push(`"${a.l.textContent}" overlaps "${b.l.textContent}"`); });
      for (const { p, r } of all) if (p !== a.own && hit(a.r, r)) out.push(`"${a.l.textContent}" runs through pin "${p.textContent}"`);
    });
    return out;
  });
}

export function registerFixViz3Tests(suite) {
  /* ------------------------------------------------------------- BP-2 chart */

  suite.test('Fix viz 3: [BP-2] Google, Location = Zurich: the chart plots no US or Munich pay and says how many it left out', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=google&l=Zurich');
    await needBoard(page, st.beta, 'google');
    const s = await statsLine(page);
    if (s.withSalary == null) skip(`no pay share in the stats line ("${s.text}")`);
    const c = await chartSays(page);
    const plotted = num(c.plotted) ?? 0;
    assertEq(plotted, s.withSalary, `the stats line says "${s.text}", the chart "${c.foot || c.empty}" (rows ${JSON.stringify(c.rows)})`);
    if (!s.withSalary) {
      assert(!c.rows.some((r) => /median \$/.test(r)), `no pay is posted for Zurich, but the chart has medians: ${JSON.stringify(c.rows)}`);
      assert(/another country/.test(c.empty + c.foot), `the chart should say why nothing is plotted: "${c.empty}" / "${c.foot}"`);
    }
    // Every salaried role the filter shows but the chart leaves out is counted.
    const left = num((/([\d,]+) (?:postings? )?(?:with|list|lists) pay (?:posted )?for another country/.exec(c.empty + ' ' + c.foot) || [])[1]);
    assert(left > 0, `the US and Munich ranges should be counted as left out: "${c.empty}" / "${c.foot}"`);
  });

  // No minimum (qa-suite-beta T-19): NVIDIA posts no German pay, so since BP-2's fix a €110,000 minimum left 0 Munich
  // roles and this test skipped on every run. The minimum on cards is fix3-app's [BP-2] test.
  suite.test('Fix viz 3: [BP-2] NVIDIA, Munich, Senior and Staff+: no Polish pay on the chart, and the chart says what it left out', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=nvidia&l=Munich&s=Senior&s=Staff%2B');
    await needBoard(page, st.beta, 'nvidia');
    const s = await statsLine(page);
    if (s.withSalary == null || s.n < 2) skip(`no such roles ("${s.text}")`);
    const c = await chartSays(page);
    assertEq(num(c.plotted) ?? 0, s.withSalary, `the stats line says "${s.text}", the chart "${c.foot || c.empty}"`);
    if (s.withSalary && s.median) assert(c.cap.includes(s.median), `one median on the screen: the stats line "${s.median}", the chart "${c.cap}"`);
    if (!s.withSalary) {
      assert(!c.rows.some((r) => /median /.test(r)), `no pay is posted for Munich, but the chart has medians: ${JSON.stringify(c.rows)}`);
      const left = num((/([\d,]+) (?:postings? )?(?:with|list|lists) pay (?:posted )?for another country/.exec(c.empty + ' ' + c.foot) || [])[1]);
      assert(left > 0, `the Polish ranges listed in Munich should be counted as left out: "${c.empty}" / "${c.foot}"`);
    }
  });

  /* ------------------------------------------------------------ BP-13 chart */

  suite.test('Fix viz 3: [BP-13] Anthropic: the chart\'s median is the stats line\'s (base pay, no on-target earnings), on both sites', async (ctx) => {
    const st = await serveDist();
    if (st) ctx.cleanup.push(() => st.close());
    const bases = [ctx.baseUrl, ...(st ? [st.beta] : [])];
    let checked = 0;
    for (const base of bases) {
      const page = await openAt(ctx, base, 'c=anthropic');
      const s = await statsLine(page);
      const c = await chartSays(page);
      if (!s.median || !c.cap) continue;
      checked++;
      assert(c.cap.includes(s.median), `${base}: the stats line says ${s.median} median, the chart "${c.cap}"`);
      assert(/base pay/i.test(c.cap), `${base}: the chart should say which median it is ("base pay"): "${c.cap}"`);
    }
    if (!checked) skip('no median on the Anthropic board');
  });

  /* ------------------------------------------------------------ map pin names */

  suite.test('Fix viz 3: [map] Apple, Location = Austin: only Austin is pinned, and the tooltip counts roles listed elsewhere', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=apple&m=map&l=Austin');
    await needBoard(page, st.beta, 'apple');
    await mapReady(page);
    const ps = await pins(page);
    const other = ps.filter((p) => !/Austin/.test(p.name.split(':')[0]));
    assertEq(other.length, 0, `pins for places outside the filter: ${JSON.stringify(other.map((p) => p.name))}`);
    assert(ps.length >= 1, 'an Austin pin');
    await page.locator('#mapHost .ms-pin').first().hover();
    const tip = await page.locator('.ms-map-tip').first().innerText({ timeout: 5000 });
    assert(/also listed/i.test(tip), `the tooltip should count roles also listed in other places: "${tip.replace(/\s+/g, ' ')}"`);
  });

  suite.test('Fix viz 3: [map] Google, Location = Dublin: no pins for Mountain View, Warsaw or other co-listed places', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=google&m=map&l=Dublin');
    await needBoard(page, st.beta, 'google');
    await mapReady(page);
    const ps = await pins(page);
    const bad = ps.filter((p) => /Mountain View|Warsaw|New York|London|Madrid/.test(p.name.split(':')[0]));
    assertEq(bad.length, 0, `co-listed places are pinned: ${JSON.stringify(bad.map((p) => p.name))}`);
    assert(ps.some((p) => /^Dublin/.test(p.name)), `a Dublin pin: ${JSON.stringify(ps.map((p) => p.name))}`);
  });

  suite.test('Fix viz 3: [map] phone, German: every pin shows its place name, and counts read "1.1K", not "1.117"', async (ctx) => {
    const cases = [
      ['apple', 'c=apple&m=map', 'de-DE'],
      ['google', 'c=google&m=map&mc=juice&l=Columbus', 'en-US'],
      ['nvidia', 'c=nvidia&m=map', 'en-US'],
    ];
    for (const [company, hash, locale] of cases) {
      const { st, page } = await openBeta(ctx, hash, { phone: true, locale });
      await needBoard(page, st.beta, company);
      await mapReady(page);
      const ps = await pins(page);
      const nameless = ps.filter((p) => !p.label);
      assertEq(nameless.length, 0, `${hash}: pins without a place name: ${JSON.stringify(nameless.map((p) => `${p.pill} (${p.name})`))}`);
      const clashes = await labelClashes(page);
      assert(!clashes.length, `${hash}: ${clashes.join('; ')}`);
      const long = ps.filter((p) => /\d[.,]\d{3}/.test(p.pill));
      assertEq(long.length, 0, `${hash}: pin counts in full: ${JSON.stringify(long.map((p) => p.pill))}`);
    }
  });
}

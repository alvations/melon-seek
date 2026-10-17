// fix-viz-5 lane e2e checks (docs/process/fix-viz-5.md): the chart and the map, round 3. Chromium against the static
// build (BETA_QA_DIST, else dist/), served under /melon-seek/ like GitHub Pages; other hosts are aborted, so the map is
// in its offline look. Each test names its finding and fails on fbdad58's build; each skips when the build, the board or
// the kind of posting it needs is missing. Phones use test/e2e/phone-sizes.mjs (every size from the folded Fold, 280 px,
// to the Surface Duo spanned, the Razr cover screen and landscape) and real touch (CDP Input.dispatchTouchEvent).
// Pure parts: test/fix-viz-5.test.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const MAIN = new Set(['anthropic', 'anduril', 'openai', 'palantir', 'scaleai', 'shieldai', 'xai', 'cohere']);

let served = null;
/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. One server per run. */
async function serveDist() {
  if (served) return served;
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
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
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  served = { origin, dist, base: (c) => `${origin}/melon-seek${MAIN.has(c) ? '' : '/beta'}` };
  return served;
}

/**
 * A fresh page at `#<hash>`, its list loaded; skips unless the board is a snapshot board in this build.
 * device: an entry of phone-sizes.mjs (a phone context, with touch), else `viewport` on a desktop.
 */
async function open(ctx, hash, { dark = false, viewport = DESKTOP, phone = false, device = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  const company = new URLSearchParams(hash).get('c');
  if (company && !fs.existsSync(path.join(st.dist, MAIN.has(company) ? '' : 'beta', 'api', 'jobs', `${company}.json`))) skip(`no ${company} list in this build`);
  const opts = device ? contextFor(device) : phone ? { viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport, deviceScaleFactor: 1 };
  const context = await ctx.browser.newContext({ ...opts, colorScheme: dark ? 'dark' : 'light' });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const base = st.base(company || '');
  await page.goto(`${base}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 120000 });
  await sleep(700);
  if (company) {
    const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base, company });
    if (mode !== 'snapshot') skip(`${company} has no snapshot in this build (${mode})`);
  }
  return { page, base, context };
}

/** Scroll the (windowed) chart through, calling `collect(host)` (a function source run in the page) at each step. */
async function scrollCollect(page, collectSrc, step = 400) {
  return page.evaluate(`(async () => {
    const collect = ${collectSrc};
    const host = document.querySelector('#chartHost');
    const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
    const H = parseFloat(body.style.height) || 0;
    const out = new Map();
    for (let y = 0; y <= H + ${step}; y += ${step}) {
      if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const [k, v] of collect(host)) out.set(k, v);
    }
    return [...out.values()];
  })()`);
}

/** In the page: the drawn circles of every Clusters row, and the plot's geometry from its ticks and gridlines. */
const READ_CIRCLES = `(() => {
  const host = document.querySelector('#chartHost');
  const money = (t) => { const m = /\\$([\\d.]+)([KM]?)/.exec(t || ''); return m ? +m[1] * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1) : null; };
  const ticks = [...host.querySelectorAll('.ms-axis__tick')].map((t) => ({ v: money(t.textContent), px: parseFloat(t.style.left) })).filter((t) => t.v != null);
  const grid = [...host.querySelectorAll('.ms-chart__gridline')].map((g) => parseFloat(g.style.left));
  const rows = [...host.querySelectorAll('.ms-crow')].map((row) => ({
    name: row.querySelector('.ms-crow__name').firstChild.textContent.trim(),
    circles: [...row.querySelectorAll('.ms-bin:not(.ms-bin--overflow)')].map((b) => ({ n: +b.dataset.n, at: +b.dataset.at, d: parseFloat(b.querySelector('.ms-bin__dot').style.width), label: b.querySelector('.ms-bin__dot').textContent.trim() })),
  }));
  const P = host.querySelector('.ms-chart__body').dataset;
  return { ticks, plotL: Math.min(...grid), plotR: Math.max(...grid), rows, planN: P.planN ? +P.planN : null, rMax: P.rMax ? +P.rMax : null, edge: P.edge != null ? +P.edge : null };
})()`;

export function registerFixViz5Tests(suite) {
  /* ------------------------------------------------------------- Clusters: V-33, V-34 */

  for (const [company, viewport, phone] of [['amazon', DESKTOP, false], ['google', DESKTOP, false], ['anduril', DESKTOP, false], ['amazon', PHONE, true]]) {
    suite.test(`fix-viz-5: [V-33] Clusters draws the plan it made, at the drawn sizes, on a settled plan (${company}, ${phone ? 390 : 1440} px)`, async (ctx) => {
      const { page, base } = await open(ctx, `c=${company}`, { viewport, phone });
      await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 });
      const g0 = await page.evaluate(READ_CIRCLES);
      const r = await page.evaluate(async ({ base, company, g }) => {
        const chart = await import(`${base}/viz/chart.js`);
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company })).jobs || [];
        const { plotted } = chart.chartPay(jobs);
        const [a, z] = [g.ticks[0], g.ticks[g.ticks.length - 1]];
        const x = (v) => a.px + ((v - a.v) / (z.v - a.v)) * (z.px - a.px);
        const pxPer = (z.px - a.px) / (z.v - a.v);
        const d0 = a.v + (g.plotL - a.px) / pxPer, d1 = a.v + (g.plotR - a.px) / pxPer;
        const named = new Set(g.rows.map((r) => r.name).filter((n) => !/^\d[\d,]* more /.test(n)));
        const all = g.rows.flatMap((r) => r.circles);
        const largest = Math.max(...all.map((c) => c.n));
        // Before fix-viz-5 the chart exported no scale: replay its own sqrt rule at the drawn largest.
        const rMax = g.rMax ?? Math.max(...all.map((c) => c.d)) / 2, M = g.planN ?? largest, edge = g.edge ?? Math.max(0, rMax - 6);
        const rad = chart.circleRadius ? (n) => chart.circleRadius(n, M, { rMax }) : (n) => Math.max(Math.min(4.5, rMax), rMax * Math.sqrt(n / M));
        const xd = (v) => Math.min(g.plotR - edge, Math.max(g.plotL + edge, x(v)));
        const bad = [];
        for (const row of g.rows) {
          const fold = /^\d[\d,]* more /.test(row.name);
          const items = plotted.filter((p) => { const k = chart.keyOf(p.job, 'department'); return (fold ? !named.has(k) : k === row.name) && p.mid >= d0 - 1 && p.mid <= d1 + 1; });
          const plan = chart.placeCircles(items, { x: xd, need: (p, q) => Math.max(24, rad(p) + rad(q) + 2) }).map((c) => c.items.length).join(',');
          const got = row.circles.map((c) => c.n).join(',');
          if (plan !== got) bad.push(`${row.name}: drawn ${got}, the plan at the drawn sizes ${plan}`);
          for (const c of row.circles) if (Math.abs(c.d - 2 * rad(c.n)) > 0.6) { bad.push(`${row.name}: a ${c.n}-posting circle is ${c.d} px, its size is ${(2 * rad(c.n)).toFixed(1)}`); break; }
        }
        return { bad, largest, M, rows: g.rows.length };
      }, { base, company, g: g0 });
      assert(r.rows > 0, 'no Clusters rows');
      assert(r.largest <= r.M, `the largest circle (${r.largest} postings) is above the count its sizes were planned for (${r.M})`);
      assert(!r.bad.length, `the circles are not the plan at the sizes they are drawn at: ${r.bad.slice(0, 3).join('; ')}`);
    });
  }

  suite.test('fix-viz-5: [V-34] a circle\'s size tells one posting from a group: no group is drawn at a one-posting size, and 20+ is clearly bigger (every big-tech board, 1440 and 390)', async (ctx) => {
    const bad = [], share = [];
    for (const company of ['amazon', 'apple', 'google', 'meta', 'microsoft', 'nvidia', 'netflix']) {
      for (const phone of [false, true]) {
        const { page, context } = await open(ctx, `c=${company}`, { phone });
        await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 });
        const g = await page.evaluate(READ_CIRCLES);
        await context.close();
        const all = g.rows.flatMap((r) => r.circles.map((c) => ({ ...c, row: r.name })));
        const ones = all.filter((c) => c.n === 1);
        if (!ones.length) continue;
        const d1 = Math.max(...ones.map((c) => c.d));
        const groupsAtOne = all.filter((c) => c.n >= 2 && c.d <= d1 + 0.5 && !c.label);
        const big = all.filter((c) => c.n >= 20 && c.d < d1 + 2 && !c.label);
        const floor = Math.min(...all.filter((c) => c.n >= 2).map((c) => c.d));
        share.push(`${company} ${phone ? 390 : 1440}: ${all.filter((c) => c.n >= 2 && c.d <= floor + 0.5).length} of ${all.length} at the group floor`);
        if (groupsAtOne.length) bad.push(`${company} ${phone ? 390 : 1440}: ${groupsAtOne.length} circles of 2+ postings are drawn ${d1} px, the size of one posting (e.g. ${groupsAtOne[0].row}: ${groupsAtOne[0].n})`);
        if (big.length) bad.push(`${company} ${phone ? 390 : 1440}: ${big.length} circles of 20+ postings are within 2 px of a one-posting circle (e.g. ${big[0].row}: ${big[0].n} at ${big[0].d} px)`);
      }
    }
    assert(!bad.length, `${bad.join('; ')} (${share.join(', ')})`);
  });

  suite.test('fix-viz-5: [UX-42, UX-43] counts fit inside their circles with 2 px of air, and an edge chip says its count ("›1")', async (ctx) => {
    const bad = [];
    for (const [company, phone] of [['microsoft', false], ['nvidia', false], ['google', false], ['amazon', false], ['nvidia', true], ['amazon', true]]) {
      const { page, context } = await open(ctx, `c=${company}`, { phone });
      await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 });
      const r = await page.evaluate(() => {
        const out = { wide: [], bare: [] };
        for (const dot of document.querySelectorAll('#chartHost .ms-bin:not(.ms-bin--overflow) .ms-bin__dot')) {
          const t = dot.textContent.trim();
          if (!t) continue;
          const range = document.createRange(); range.selectNodeContents(dot);
          const tw = range.getBoundingClientRect().width, dw = dot.getBoundingClientRect().width;
          if (tw > dw - 4) out.wide.push(`"${t}" ${tw.toFixed(1)} px in ${dw.toFixed(1)}`);
        }
        for (const c of document.querySelectorAll('#chartHost .ms-bin__chip')) if (/^[‹›]$/.test(c.textContent.trim())) out.bare.push(c.textContent.trim());
        return out;
      });
      await context.close();
      if (r.wide.length) bad.push(`${company} ${phone ? 390 : 1440}: ${r.wide.slice(0, 3).join(', ')}`);
      if (r.bare.length) bad.push(`${company} ${phone ? 390 : 1440}: ${r.bare.length} bare edge chips ("${r.bare[0]}")`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-viz-5: [UX-40] every chart row\'s sub-line has one form, "N roles · $X" (Amazon 1440 and 390, Google by company)', async (ctx) => {
    const bad = [];
    for (const [hash, phone] of [['c=amazon', false], ['c=amazon', true], ['c=google&g=brand', false], ['c=apple&g=seniority', true]]) {
      const { page, context } = await open(ctx, hash, { phone });
      await page.waitForSelector('#chartHost .ms-crow', { timeout: 60000 });
      const subs = await page.$$eval('#chartHost .ms-crow__sub', (es) => es.map((e) => e.textContent.trim()));
      await context.close();
      const off = subs.filter((t) => !/^[\d,]+ roles? · ((on-target |from |posted )?\$[\d.]+[KM]?( in [\w ]+|, several countries’ pay)?|no pay (listed|posted for here))$/.test(t));
      if (off.length) bad.push(`${hash} ${phone ? 390 : 1440}: ${off.slice(0, 3).map((t) => `"${t}"`).join(', ')}`);
    }
    assert(!bad.length, `sub-lines in another form: ${bad.join('; ')}`);
  });

  suite.test('fix-viz-5: [V-42] the middle-half band\'s edge clears 3:1 against the chart, and its values are in the row\'s name (Amazon, light and dark)', async (ctx) => {
    const bad = [];
    for (const dark of [false, true]) {
      const { page, context } = await open(ctx, 'c=amazon', { dark });
      await page.waitForSelector('#chartHost .ms-crow__band', { timeout: 60000 });
      const r = await page.evaluate(() => {
        const cv = document.createElement('canvas').getContext('2d');
        const solid = (s) => { const cm = String(s).match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?/); if (cm) return [cm[1] * 255, cm[2] * 255, cm[3] * 255, cm[4] == null ? 1 : +cm[4]]; cv.fillStyle = '#000'; cv.fillStyle = s; const h = cv.fillStyle; if (h.startsWith('#')) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; } const m = h.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : [0, 0, 0, 0]; };
        const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const out = [];
        const bg = solid(getComputedStyle(document.querySelector('#chartHost')).backgroundColor);
        for (const row of document.querySelectorAll('#chartHost .ms-crow')) {
          const band = row.querySelector('.ms-crow__band');
          if (!band) continue;
          const edge = (getComputedStyle(band).boxShadow.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i) || [])[1];
          const words = `${row.getAttribute('aria-label') || ''} ${row.querySelector('.ms-crow__label')?.getAttribute('aria-label') || ''}`;
          out.push({ name: row.querySelector('.ms-crow__name').firstChild.textContent.trim(), edge: edge ? ratio(solid(edge), bg) : 0, said: /middle half \$[\d.]+[KM]? to \$[\d.]+[KM]?/.test(words) });
        }
        return out;
      });
      await context.close();
      for (const x of r) {
        if (x.edge < 3) bad.push(`${dark ? 'dark' : 'light'} "${x.name}": edge ${x.edge.toFixed(2)}:1`);
        if (!x.said) bad.push(`${dark ? 'dark' : 'light'} "${x.name}": its name does not give the middle half`);
      }
      if (!r.length) skip('no bands');
    }
    assert(!bad.length, bad.slice(0, 6).join('; '));
  });

  suite.test('fix-viz-5: [A-8] the fold row is an option without aria-expanded, says in its name whether it is folded, and Enter opens and folds it (Google, keyboard)', async (ctx) => {
    const { page } = await open(ctx, 'c=google');
    await page.waitForSelector('#chartHost .ms-crow__fold', { timeout: 60000 }).catch(() => skip('no fold row'));
    const name = () => page.evaluate(() => { const f = document.querySelector('#chartHost .ms-crow__fold')?.closest('.ms-crow__label'); return f ? { label: f.getAttribute('aria-label'), expanded: f.hasAttribute('aria-expanded'), rows: document.querySelectorAll('#chartHost .ms-crow').length } : null; });
    const a = await name();
    assert(a && !a.expanded, 'the fold row carries aria-expanded on an option');
    assert(/folded into one row; Enter shows each/.test(a.label), `its name does not say it is folded: "${a.label}"`);
    await page.focus('#chartHost .ms-chart__body');
    // Down to the fold row, then Enter.
    for (let i = 0; i < 12; i++) {
      const on = await page.evaluate(() => { const id = document.querySelector('#chartHost .ms-chart__body').getAttribute('aria-activedescendant'); return !!id && !!document.getElementById(id)?.querySelector('.ms-crow__fold'); });
      if (on) break;
      await page.keyboard.press('ArrowDown');
      await sleep(60);
    }
    await page.keyboard.press('Enter');
    await sleep(400);
    const b = await name();
    assert(b.rows > a.rows && /shown one by one below; Enter folds them/.test(b.label), `Enter did not open it, or its name does not say so: ${b.rows} rows, "${b.label}"`);
    const active = await page.evaluate(() => document.getElementById(document.querySelector('#chartHost .ms-chart__body').getAttribute('aria-activedescendant'))?.getAttribute('aria-label') || '');
    assert(/more /.test(active), `aria-activedescendant left the fold row: "${active}"`);
  });

  suite.test('fix-viz-5: [D-44] Group by Location leads with the big places; small ones fold into "N more places", and every place is reachable (Amazon, Apple, Google; Clusters and Ranges)', async (ctx) => {
    const bad = [];
    for (const company of ['amazon', 'apple', 'google']) {
      const { page, context } = await open(ctx, `c=${company}&g=location`);
      await page.waitForSelector('#chartHost .ms-crow', { timeout: 60000 });
      const rows = await page.$$eval('#chartHost .ms-crow', (rs) => rs.map((r) => ({ label: r.getAttribute('aria-label') || '', name: r.querySelector('.ms-crow__name').firstChild.textContent.trim() })));
      const n = (l) => Number((l.replace(/,/g, '').match(/(\d+) roles?/) || [])[1]);
      const fold = rows.find((r) => /^\d[\d,]* more places$/.test(r.name));
      if (!fold) bad.push(`${company}: no "N more places" row (${rows.length} rows)`);
      const lead = rows.slice(0, rows.indexOf(fold) < 0 ? 8 : rows.indexOf(fold));
      const tiny = lead.filter((r) => n(r.label) < 3);
      if (tiny.length) bad.push(`${company}: ${tiny.length} kept rows with 1–2 roles (${tiny[0].label.slice(0, 60)})`);
      // Ranges by Location: groups by size.
      await page.evaluate(() => { location.hash = location.hash.replace(/&?v=[^&]*/, '') + '&v=ranges'; });
      await page.waitForSelector('#chartHost .ms-group', { timeout: 60000 });
      await sleep(500);
      const counts = await page.$$eval('#chartHost .ms-group .ms-group__count', (es) => es.slice(0, 6).map((e) => +e.textContent.replace(/,/g, '')));
      if (counts.some((c, i) => i && c > counts[i - 1])) bad.push(`${company} Ranges: groups not by size (${counts.join(', ')})`);
      await context.close();
    }
    assert(!bad.length, bad.join('; '));
  });

  /* --------------------------------------------------------------- Ranges: V-38, UX-41, UX-59 */

  suite.test('fix-viz-5: [V-38] a Ranges bar is thicker the more postings its row holds, within its row (Amazon, Google; 1440 and 390)', async (ctx) => {
    const bad = [];
    for (const [company, phone] of [['amazon', false], ['google', false], ['google', true]]) {
      const { page, context } = await open(ctx, `c=${company}&v=ranges`, { phone });
      await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
      const rows = await scrollCollect(page, `(host) => [...host.querySelectorAll('.ms-row')].map((r) => { const b = r.querySelector('.ms-row__bar'); return [r.dataset.idx, { n: +r.dataset.n, h: b.getBoundingClientRect().height, rowH: r.offsetHeight, plain: b.className === 'ms-row__bar' && !b.hidden }]; })`, 1200);
      await context.close();
      const plain = rows.filter((r) => r.plain && r.h > 0);
      const one = plain.filter((r) => r.n === 1), busy = plain.filter((r) => r.n >= 100);
      if (!one.length || !busy.length) continue;
      const tOne = Math.max(...one.map((r) => r.h)), tBusy = Math.min(...busy.map((r) => r.h));
      if (!(tBusy >= tOne + 4)) bad.push(`${company} ${phone ? 390 : 1440}: rows of 100+ postings are ${tBusy} px, rows of one ${tOne} px`);
      const over = plain.filter((r) => r.h > r.rowH - 6);
      if (over.length) bad.push(`${company}: ${over.length} bars leave under 3 px above and below in their row`);
      // Monotone: more postings never a thinner bar.
      const byN = plain.slice().sort((a, b) => a.n - b.n);
      if (byN.some((r, i) => i && r.h + 0.01 < byN[i - 1].h)) bad.push(`${company} ${phone ? 390 : 1440}: a busier row has a thinner bar`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-viz-5: [UX-41] a stacked Ranges row is named by its roles and says its count once (Microsoft, 1440 and 390)', async (ctx) => {
    const bad = [];
    for (const phone of [false, true]) {
      const { page, context } = await open(ctx, 'c=microsoft&v=ranges', { phone });
      await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
      const rows = await scrollCollect(page, `(host) => [...host.querySelectorAll('.ms-row')].filter((r) => +r.dataset.n > 1).map((r) => [r.dataset.idx, { n: +r.dataset.n, label: r.querySelector('.ms-row__label').textContent, count: r.querySelector('.ms-row__count'), countShown: (() => { const c = r.querySelector('.ms-row__count'); return !!c && getComputedStyle(c).visibility !== 'hidden'; })() }])`, 1500);
      await context.close();
      if (!rows.length) skip('no stacked rows');
      const counted = rows.filter((r) => /^\d[\d,]* roles\b/.test(r.label));
      if (counted.length) bad.push(`${phone ? 390 : 1440}: ${counted.length} stacked rows named by their count ("${counted[0].label}")`);
      const unshown = rows.filter((r) => !r.countShown);
      if (unshown.length) bad.push(`${phone ? 390 : 1440}: ${unshown.length} stacked rows show no count by the bar`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-viz-5: [UX-59] the Ranges axis holds the rows the list leads with (Amazon and Google, 1440 and 390: at most 3 of the first 10 run past it; all 10 did on Amazon, 8 on Google)', async (ctx) => {
    const bad = [];
    for (const [company, phone] of [['amazon', false], ['amazon', true], ['google', false]]) {
      const { page, context } = await open(ctx, `c=${company}&v=ranges`, { phone });
      await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
      const r = await page.evaluate(() => [...document.querySelectorAll('#chartHost .ms-row')].sort((a, b) => +a.dataset.idx - +b.dataset.idx).slice(0, 10).map((x) => !!x.querySelector('.ms-row__over--hi')));
      await context.close();
      const past = r.filter(Boolean).length;
      if (past > 3) bad.push(`${company} ${phone ? 390 : 1440}: ${past} of the first 10 rows run past the axis`);
    }
    assert(!bad.length, bad.join('; '));
  });

  /* --------------------------------------------------------------- pay as posted: V-41, V-48, MR-28 */

  suite.test('fix-viz-5: [V-41] a stated minimum reads "from" and fades, shift pay says so, in the bar\'s name and tip; neither stacks with a plain range (Amazon)', async (ctx) => {
    const bad = [];
    for (const [q, kind, want] of [['Area Manager, FC Operations', 'minimum', /from \$[\d.]+K, the posted minimum base pay/], ['Retail Lead Associate (Reduced-Time)', 'shiftPay', /includes the top shift pay/]]) {
      const { page, base, context } = await open(ctx, `c=amazon&v=ranges&q=${encodeURIComponent(q)}`);
      const n = await page.evaluate(async ({ base, kind }) => {
        const { notBasePay } = await import(`${base}/features/shared.js`);
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
        return typeof notBasePay === 'function' ? jobs.filter((j) => notBasePay(j) === kind).length : jobs.filter((j) => (kind === 'minimum' ? j.salary?.kind === 'minimum' : j.salary?.includesShiftDifferential)).length;
      }, { base, kind });
      if (!n) continue;
      await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
      const rows = await page.$$eval('#chartHost .ms-row', (rs) => rs.map((r) => ({ label: r.getAttribute('aria-label') || '', bar: r.querySelector('.ms-row__bar').className })));
      const mine = rows.filter((r) => want.test(r.label));
      if (!mine.length) { bad.push(`"${q}": no bar says ${want} (${rows[0]?.label.slice(0, 120)})`); await context.close(); continue; }
      if (kind === 'minimum' && !mine.every((r) => /--min/.test(r.bar))) bad.push(`"${q}": a minimum's bar is not open-ended (${mine[0].bar})`);
      const i = rows.indexOf(mine[0]);
      await page.locator('#chartHost .ms-row').nth(i).hover({ force: true });
      await sleep(250);
      const tip = await page.evaluate(() => document.querySelector('.ms-viz-tip:not([hidden])')?.innerText.replace(/\n+/g, ' / ') || '');
      if (!(kind === 'minimum' ? /^From /.test(tip) && /minimum base pay/.test(tip) : /Includes top shift pay/.test(tip))) bad.push(`"${q}": the tip reads "${tip.slice(0, 160)}"`);
      if (kind === 'minimum') {
        const legend = await page.evaluate(() => document.querySelector('#chartHost .ms-chart__legend')?.textContent || '');
        if (!/Fading: a posted minimum/.test(legend)) bad.push(`no legend key for minimums ("${legend.slice(-80)}")`);
      }
      await context.close();
    }
    // Never stacked with a plain range of the same figures.
    {
      const { page, base, context } = await open(ctx, 'c=amazon');
      const mixed = await page.evaluate(async ({ base }) => {
        const chart = await import(`${base}/viz/chart.js`);
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
        const { plotted } = chart.chartPay(jobs);
        for (const p of plotted) p.key = chart.keyOf(p.job, 'department');
        const kindOf = (p) => (p.job.salary.kind === 'minimum' ? 'minimum' : p.job.salary.includesShiftDifferential ? 'shiftPay' : '');
        return chart.stackRanges(plotted).filter((st) => new Set(st.items.map(kindOf)).size > 1).length;
      }, { base });
      await context.close();
      if (mixed) bad.push(`${mixed} Ranges rows stack a minimum or shift pay with plain ranges`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-viz-5: [V-48] on-target earnings have a legend key, and an on-target range over two levels is dashed and striped (NVIDIA)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=nvidia&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
    const n = await page.evaluate(async ({ base }) => {
      const { chartPay, spanTiers } = await import(`${base}/viz/chart.js`);
      const p = chartPay((await (await import(`${base}/api.js`)).getJobs({ company: 'nvidia' })).jobs || []).plotted.filter((x) => x.ote);
      return { ote: p.length, spans: p.filter((x) => spanTiers(x.job)?.kind === 'levels').length };
    }, { base });
    if (!n.ote) skip('no on-target earnings on NVIDIA');
    const legend = await page.evaluate(() => document.querySelector('#chartHost .ms-chart__legend')?.textContent || '');
    assert(/Dashed: on-target earnings[\d,]+/.test(legend.replace(/\s+/g, ' ')), `no key for the dashed bars: "${legend.slice(-90)}"`);
    if (!n.spans) return;
    const rows = await scrollCollect(page, `(host) => [...host.querySelectorAll('.ms-row')].filter((r) => /on-target earnings/.test(r.getAttribute('aria-label') || '') && /spans \\d+ levels/.test(r.getAttribute('aria-label') || '')).map((r) => [r.dataset.idx, r.querySelector('.ms-row__bar').className])`, 400);
    assert(rows.length && rows.every((c) => /--ote/.test(c) && /--span/.test(c)), `on-target spans are not dashed and striped: ${rows.slice(0, 3).join(' | ')}`);
  });

  suite.test('fix-viz-5: [MR-28] the chart caption, its row medians and the stats line leave out stated minimums, shift pay and part-time pay, keep them on the chart, and say so (Amazon)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=amazon');
    await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 });
    const r = await page.evaluate(async ({ base }) => {
      const chart = await import(`${base}/viz/chart.js`);
      const { formatMoney } = await import(`${base}/viz/palette.js`);
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
      const { plotted } = chart.chartPay(jobs);
      const nb = (j) => j.salary.kind === 'minimum' || j.salary.includesShiftDifferential === true || j.salary.partTime === true;
      const base_ = plotted.filter((p) => !p.ote && !nb(p.job)).map((p) => p.mid).sort((a, b) => a - b);
      const q = (s, f) => { const pos = (s.length - 1) * f, i = Math.floor(pos), g = pos - i; return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * g : s[i]; };
      const host = document.querySelector('#chartHost');
      const circles = [...host.querySelectorAll('.ms-bin')].reduce((s, b) => s + (+b.dataset.n || parseInt(b.getAttribute('aria-label'), 10) || 0), 0);
      return {
        want: formatMoney(q(base_, 0.5)), left: plotted.filter((p) => nb(p.job)).length, plotted: plotted.length, circles,
        cap: host.querySelector('.ms-hist__cap')?.textContent || '', stats: document.querySelector('#statsLine .stat--median strong')?.textContent || '',
        details: [...host.querySelectorAll('.ms-chart__foot .ms-note__list li')].map((li) => li.textContent).join(' | '),
      };
    }, { base });
    if (!r.left) skip('no stated minimums, shift pay or part-time pay on Amazon');
    assert(r.cap.includes(r.want), `the chart caption reads "${r.cap}", the base-pay median is ${r.want}`);
    assert(r.stats === r.want, `the stats line reads ${r.stats}, the base-pay median is ${r.want}`);
    assert(r.circles === r.plotted, `${r.circles} postings in the circles, ${r.plotted} with pay: every posting stays on the chart`);
    assert(/stated minimum/.test(r.details) && /not in the medians/.test(r.details), `the notes' Details do not say what the medians leave out: "${r.details.slice(0, 300)}"`);
  });

  /* --------------------------------------------------------------- axis, legend and words at every size */

  suite.test('fix-viz-5: [V-46, UX-61] at every phone size the chart says its axis is US dollars a year, with the median, on one line (Google; Amazon at 390)', async (ctx) => {
    const bad = [];
    // Landscape phones hide the strip, and the axis caption carries the median: Apple's and Microsoft's label columns
    // are the narrowest there.
    const land = ALL_SIZES.filter((d) => d.width > d.height && d.height < 500);
    const cases = [...ALL_SIZES.map((d) => ['google', d]), ['amazon', ALL_SIZES.find((d) => d.width === 390)], ...land.flatMap((d) => [['apple', d], ['microsoft', d]])];
    for (const [company, d] of cases) {
      for (const v of ['clusters', 'ranges']) {
        if (company === 'google' && v === 'ranges' && d.width > 430) continue;
        const { page, context } = await open(ctx, `c=${company}${v === 'ranges' ? '&v=ranges' : ''}`, { device: d });
        await page.waitForSelector('#chartHost .ms-axis__tick', { timeout: 60000 }).catch(() => {});
        const r = await page.evaluate(() => {
          const host = document.querySelector('#chartHost');
          const vis = (e) => { if (!e) return false; const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
          const cap = [host.querySelector('.ms-chart__caprow'), host.querySelector('.ms-axis__cap')].find(vis);
          if (!cap) return { none: true };
          const range = document.createRange(); range.selectNodeContents(cap);
          const mids = [];
          for (const x of range.getClientRects()) { if (x.width < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((y) => Math.abs(y - m) < 6)) mids.push(m); }
          const cut = cap.scrollWidth > cap.clientWidth + 0.5;
          const med = [...host.querySelectorAll('.ms-chart__capmed, .ms-hist__cap')].find(vis);
          return { text: cap.textContent, lines: mids.length, cut, median: med ? med.textContent : '' };
        });
        await context.close();
        const tag = `${company} ${v} ${d.name} ${d.width}x${d.height}`;
        if (r.none) { bad.push(`${tag}: no axis caption on screen`); continue; }
        if (!/US dollars a year|Yearly pay, US dollars/.test(r.text)) bad.push(`${tag}: "${r.text}"`);
        if (r.lines > 1 || r.cut) bad.push(`${tag}: the caption takes ${r.lines} lines${r.cut ? ', cut' : ''} ("${r.text}")`);
        if (!/median|Median/.test(r.median)) bad.push(`${tag}: no median caption`);
      }
    }
    assert(!bad.length, bad.slice(0, 8).join('; '));
  });

  suite.test('fix-viz-5: [cuts] the Ranges legend keys, the fold arrow and the map\'s Pay line are whole at 280, 320, 390 and 540 px (Amazon)', async (ctx) => {
    const bad = [];
    const sizes = ALL_SIZES.filter((d) => [280, 320, 390, 540].includes(d.width));
    for (const d of sizes) {
      for (const hash of ['c=amazon&v=ranges', 'c=amazon', 'c=amazon&m=map']) {
        const { page, context } = await open(ctx, hash, { device: d });
        if (hash.includes('m=map')) { await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 }).catch(() => {}); await sleep(4500); } else await page.waitForSelector('#chartHost .ms-bin, #chartHost .ms-row', { timeout: 60000 });
        const r = await page.evaluate(() => {
          const cut = (e) => { const r = document.createRange(); r.selectNodeContents(e); const t = r.getBoundingClientRect(), b = e.getBoundingClientRect(); return e.scrollWidth > e.clientWidth + 0.5 || t.right > b.right + 0.5; };
          const out = [];
          for (const k of document.querySelectorAll('#chartHost .ms-legend__key, #chartHost .ms-legend__spankey')) if (k.getBoundingClientRect().width && cut(k)) out.push(`legend key "${k.textContent}"`);
          for (const f of document.querySelectorAll('#chartHost .ms-crow__fold')) { const r = f.getBoundingClientRect(), row = f.closest('.ms-crow__label').getBoundingClientRect(); if (!r.width || r.right > row.right + 0.5) out.push('the fold arrow is cut'); }
          const pay = document.querySelector('#mapHost .ms-modes__paywhat .ms-note__line');
          if (pay && pay.getBoundingClientRect().width) {
            // Line boxes of the visible text (the line and the Details button), grouped by their middle.
            const mids = [];
            const walk = document.createTreeWalker(pay.closest('.ms-modes__paywhat'), NodeFilter.SHOW_TEXT);
            for (let t = walk.nextNode(); t; t = walk.nextNode()) {
              if (!t.textContent.trim() || t.parentElement.closest('[hidden]') || !t.parentElement.getClientRects().length) continue;
              const rr = document.createRange(); rr.selectNodeContents(t);
              for (const x of rr.getClientRects()) { if (x.width < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((y) => Math.abs(y - m) < 6)) mids.push(m); }
            }
            const lines = mids.length;
            if (lines > 1) out.push(`the map's Pay line takes ${lines} lines`);
            const marks = [...document.querySelectorAll('#mapHost .ms-modes__mark')].map((m) => m.getBoundingClientRect()).filter((m) => m.width);
            if (marks.some((m, i) => i && m.left < marks[i - 1].right + 2)) out.push('the Pay scale\'s dollar marks touch');
          }
          return out;
        });
        await context.close();
        for (const x of r) bad.push(`${hash} ${d.name} ${d.width}x${d.height}: ${x}`);
      }
    }
    assert(!bad.length, bad.slice(0, 8).join('; '));
  });

  suite.test('fix-viz-5: [D-51] on a desktop the Ranges legend shows every key without a sideways scroll, and on a phone its pattern keys come first (NVIDIA, Amazon, Google)', async (ctx) => {
    const bad = [];
    for (const company of ['nvidia', 'amazon', 'google']) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, null]) {
        const { page, context } = await open(ctx, `c=${company}&v=ranges`, viewport ? { viewport } : { phone: true });
        await page.waitForSelector('#chartHost .ms-chart__legend', { timeout: 60000 });
        await sleep(400);
        const r = await page.locator('#chartHost .ms-chart__legend').evaluate((e) => {
          const box = e.getBoundingClientRect();
          const kids = [...e.children].map((c) => ({ t: c.textContent.trim(), right: c.getBoundingClientRect().right, kind: c.matches('.ms-legend__span, .ms-legend__kind') }));
          const firstColour = kids.findIndex((k) => !k.kind);
          return { out: kids.filter((k) => k.right > box.right + 0.5).map((k) => k.t.slice(0, 30)), scroll: e.scrollWidth > e.clientWidth + 1, late: kids.filter((k, i) => k.kind && i > firstColour).map((k) => k.t.slice(0, 30)) };
        });
        await context.close();
        const tag = `${company} ${viewport ? viewport.width : 'phone 390'}`;
        if (viewport && (r.scroll || r.out.length)) bad.push(`${tag}: keys out of view (${r.out.join(', ')})`);
        if (r.late.length) bad.push(`${tag}: pattern keys after the colours (${r.late.join(', ')})`);
      }
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-viz-5: [A-8, 280 px] a real tap on the fold row opens it and its arrow stays whole (Google, Galaxy Fold folded)', async (ctx) => {
    const d = ALL_SIZES.find((x) => x.width === 280);
    const { page, context } = await open(ctx, 'c=google', { device: d });
    await page.waitForSelector('#chartHost .ms-crow__fold', { timeout: 60000 }).catch(() => skip('no fold row'));
    const before = await page.$$eval('#chartHost .ms-crow', (rs) => rs.length);
    const lab = page.locator('#chartHost .ms-crow__label:has(.ms-crow__fold)');
    await lab.scrollIntoViewIfNeeded();
    const b = await lab.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 40, y: b.y + b.height / 2, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    const after = await page.evaluate(() => ({ rows: document.querySelectorAll('#chartHost .ms-crow').length, arrow: document.querySelector('#chartHost .ms-crow__fold')?.textContent, label: document.querySelector('#chartHost .ms-crow__fold')?.closest('.ms-crow__label')?.getAttribute('aria-label') || '' }));
    assert(after.rows > before && after.arrow === '▴', `a tap did not open the fold row: ${before} -> ${after.rows} rows, arrow "${after.arrow}"`);
    assert(/shown one by one below/.test(after.label), `its name does not say it is open: "${after.label}"`);
  });

  /* ------------------------------------------------------------------- map: V-43 to V-45, the Razr cover */

  suite.test('fix-viz-5: [V-43] a pin whose median rests on under a quarter of its postings says "k of n" on the pin (Amazon, world view)', async (ctx) => {
    const { page } = await open(ctx, 'c=amazon&m=map');
    await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
    await sleep(4800);
    const pins = await page.evaluate(() => [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].map((m) => ({ a: m.getAttribute('aria-label') || '', t: m.querySelector('.ms-pin')?.innerText.replace(/\n+/g, ' ') || '' })));
    const bad = [];
    let low = 0;
    for (const { a, t } of pins) {
      const m = /: ([\d,]+) postings?, median (\$[\d.]+[KM]?) from ([\d,]+) with pay/.exec(a);
      if (!m) continue;
      const n = +m[1].replace(/,/g, ''), k = +m[3].replace(/,/g, '');
      if (k / n < 0.25) { low++; if (!/\bof\b/.test(t) || !/%/.test(a)) bad.push(`"${t}" (${a})`); }
    }
    if (!low) skip('no pin priced from under a quarter of its postings');
    assert(!bad.length, `a pin's pill reads as the median of all its postings: ${bad.join('; ')}`);
  });

  suite.test('fix-viz-5: [V-44] the map counts the postings that list no place, in one line (Meta)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=meta&m=map');
    const n = await page.evaluate(async ({ base }) => ((await (await import(`${base}/api.js`)).getJobs({ company: 'meta' })).jobs || []).filter((j) => !(j.locations || []).length && !j.remote).length, { base });
    if (!n) skip('every Meta posting lists a place');
    await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
    await sleep(1500);
    const r = await page.evaluate(() => { const e = document.querySelector('#mapHost .ms-map__unplaced'); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { text: e.textContent, h: b.height }; });
    assert(r && new RegExp(`^${n} postings? lists? no place`).test(r.text), `no count of the ${n} postings with no place: ${JSON.stringify(r)}`);
    assert(r.h <= 26, `the line takes ${r.h} px`);
  });

  suite.test('fix-viz-5: [V-45] a place pinned at its state\'s or country\'s centre says it is approximate (NVIDIA "United States", "Texas, US")', async (ctx) => {
    const { page } = await open(ctx, 'c=nvidia&m=map');
    await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
    await sleep(2500);
    const r = await page.evaluate(async () => {
      const base = location.pathname.replace(/[^/]*$/, '');
      const { locationPrecision } = await import(`${base}lib/geo.js`);
      const jobs = (await (await import(`${base}api.js`)).getJobs({ company: 'nvidia' })).jobs || [];
      const wide = jobs.flatMap((j) => j.locations || []).filter((l) => !l.remote && ['region', 'country'].includes(locationPrecision(l)));
      const names = [...new Set(wide.map((l) => l.name))];
      // The pins led by such a place (its name first in the pin's name).
      const pins = [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].map((m) => m.getAttribute('aria-label') || '').filter((a) => names.some((n) => a.startsWith(`${n}:`) || a.startsWith(`${n} and`) || a.startsWith(`${n},`)));
      return { wide: wide.length, ex: names.slice(0, 3), pins: pins.map((a) => a.slice(0, 140)) };
    });
    if (!r.wide || !r.pins.length) skip('no pin led by a state- or country-only place');
    const plain = r.pins.filter((a) => !/approximate/.test(a));
    assert(!plain.length, `pins of places pinned at a state's or country's centre (${r.ex.join(', ')}) do not say approximate: ${plain.join(' | ')}`);
  });

  suite.test('fix-viz-5: [Razr, M-50] on the map\'s first view every price pin can be tapped: none is under the map\'s own controls (Razr cover 352x355, 320x568, 280x653, 812x375)', async (ctx) => {
    const at = (w, h) => ALL_SIZES.find((x) => x.width === w && x.height === h);
    const bad = [];
    for (const [d, boards] of [[at(352, 355), ['apple', 'amazon', 'google', 'microsoft']], [at(320, 568), ['apple', 'meta', 'netflix']], [at(280, 653), ['apple', 'meta', 'anduril']], [at(812, 375), ['anduril']]]) {
      for (const company of boards) {
        const { page, context } = await open(ctx, `c=${company}&m=map`, { device: d });
        await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 }).catch(() => {});
        await sleep(5000);
        // mobile QA 4's M-50 rule: a pin is reachable when a tap at its middle row lands on it; the sandbox's "Basemap
        // unavailable" note is looked through (real phones have a basemap); pins wholly under the results sheet are not counted.
        const r = await page.evaluate(() => {
          const m = document.querySelector('#mapHost').getBoundingClientRect();
          const sheet = document.querySelector('#results')?.getBoundingClientRect();
          const bottom = Math.min(m.bottom, sheet ? sheet.top : Infinity, innerHeight);
          const out = [];
          let n = 0;
          for (const p of document.querySelectorAll('#mapHost .ms-pin')) {
            const b = (p.querySelector('.ms-pin__price, .ms-pin__count') || p).getBoundingClientRect();
            if (!b.width || b.top >= bottom || b.bottom <= m.top) continue;
            n++;
            const reach = [0.15, 0.5, 0.85].some((fx) => { const x = b.left + b.width * fx, y = b.top + b.height / 2; if (x < 0 || x >= innerWidth || y >= bottom) return false; const t = document.elementsFromPoint(x, y).find((e) => !e.closest('.ms-map__offline-note')); return t && (t === p || p.contains(t)); });
            if (!reach) { const t = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2).find((e) => !e.closest('.ms-map__offline-note')); out.push(`"${p.innerText.replace(/\s+/g, ' ').trim().slice(0, 30)}" under ${t ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : '?'}`); }
          }
          return { n, out };
        });
        await context.close();
        if (!r.n) bad.push(`${company} ${d.width}x${d.height}: no pin on the first view`);
        if (r.out.length) bad.push(`${company} ${d.width}x${d.height}: ${r.out.join('; ')}`);
      }
    }
    assert(!bad.length, bad.join('; '));
  });
}

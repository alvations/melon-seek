// viz-even's measurement (docs/process/viz-even.md §5), with viz-review-beta-2's numbers (§3, V-33, V-34, V-38), for a
// served build. Read-only. viz-even's own copy lived in its scratchpad; fix-viz-5 (docs/process/fix-viz-5.md) wrote
// this one from it, so before and after are measured the same way.
//
//   PLAYWRIGHT_MODULE=<.../playwright/index.mjs> node docs/process/scripts/viz-even-measure.mjs <origin> <chart.js> <out.json> [boards...]
//
// <origin> serves a build under /melon-seek/ (scripts/cycle/serve.mjs); <chart.js> is served in place of that build's
// viz/chart.js with a hook that records what Clusters and Ranges draw. Per board, at 1440x900 and 390x844 (phone):
//   Clusters: circles, circles drawn the size of a one-posting circle (and the largest count among them), circles at
//     the smallest group size, rows whose circles are not the plan at the drawn sizes (V-33), posted bands ("modes": one
//     exact midpoint on 3+ postings and 5% of the row) sharing a circle;
//   Ranges: rows, postings, and by $25K band of midpoint the share of rows, of postings and of ink (bar thickness),
//     with the total variation between rows and postings and between ink and postings (V-38).
import fs from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const chromium = pw.chromium || pw.default?.chromium;

const [origin, chartFile, outFile, ...want] = process.argv.slice(2);
const BETA = ['amazon', 'apple', 'google', 'meta', 'microsoft', 'nvidia', 'netflix'];
const MAIN = ['anthropic', 'anduril'];
const boards = want.length ? want : [...BETA, ...MAIN];

const CL_ANCHOR = "    renderGridlines(ticks, x, gridFrag);\n    grid.replaceChildren(gridFrag);\n    body.style.height = (cRows.length * rowH + 8) + 'px';";
const RG_ANCHOR = "    renderGridlines(nt.ticks, x, gridFrag);\n    grid.replaceChildren(gridFrag);\n    body.style.height = (y + 8) + 'px';";
let src = fs.readFileSync(chartFile, 'utf8');
if (!src.includes(CL_ANCHOR) || !src.includes(RG_ANCHOR)) throw new Error('hook anchors not found');
src = src.replace(CL_ANCHOR, `    globalThis.__veC = { width, narrow, d0, d1, plotL, plotW, rows: cRows.map((r) => ({ name: r.name, mids: r.items.map((p) => p.mid), bins: r.bins.map((b) => ({ overflow: b.overflow || null, start: b.start, end: b.end, mids: b.items.map((p) => p.mid) })) })) };\n${CL_ANCHOR}`);
src = src.replace(RG_ANCHOR, `    globalThis.__veR = { width, d0, d1, plotL, plotW, rows: itemByRow.map((p) => ({ mid: p.mid, n: p.n || 1 })) };\n${RG_ANCHOR}`);

function modesOf(mids) {
  const n = mids.length, c = new Map();
  for (const m of mids) { const k = Math.round(m / 100) * 100; c.set(k, (c.get(k) || 0) + 1); }
  const min = Math.max(3, Math.ceil(n * 0.05));
  return [...c].filter(([, k]) => k >= min).map(([v, k]) => ({ v, k }));
}
const tv = (a, b) => Object.keys({ ...a, ...b }).reduce((s, k) => s + Math.abs((a[k] || 0) - (b[k] || 0)), 0) / 2;

const out = {};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  for (const slug of boards) {
    const base = `${origin}/melon-seek${BETA.includes(slug) ? '/beta' : ''}`;
    out[slug] = {};
    for (const [vw, vh] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, ...(vw < 500 ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort('blockedbyclient'));
      await ctx.route('**/viz/chart.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: src }));
      const page = await ctx.newPage();
      await page.goto(`${base}/#c=${slug}`);
      await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 120000 });
      await page.waitForFunction(() => globalThis.__veC, null, { timeout: 60000 });
      await page.waitForTimeout(600);
      const C = await page.evaluate(() => globalThis.__veC);
      const dom = await page.evaluate(() => [...document.querySelectorAll('.ms-crow')].map((row) => [...row.querySelectorAll('.ms-bin:not(.ms-bin--overflow)')].map((b) => ({ n: +b.dataset.n, d: parseFloat(b.querySelector('.ms-bin__dot').style.width), label: b.querySelector('.ms-bin__dot').textContent.trim() }))).flat());
      const ones = dom.filter((c) => c.n === 1), d1 = ones.length ? Math.max(...ones.map((c) => c.d)) : null;
      const groups = dom.filter((c) => c.n >= 2);
      const gFloor = groups.length ? Math.min(...groups.map((c) => c.d)) : null;
      const atOne = d1 == null ? [] : groups.filter((c) => c.d <= d1 + 0.5 && !c.label);
      let modesMerged = 0, modesTotal = 0;
      for (const r of C.rows) {
        const modes = modesOf(r.mids);
        modesTotal += modes.length;
        for (const b of r.bins.filter((x) => !x.overflow)) { const k = modes.filter((m) => m.v >= b.start && m.v <= b.end).length; if (k >= 2) modesMerged += k; }
      }
      const o = out[slug][vw] = {
        circles: dom.length, singles: ones.length, singleD: d1, groupFloorD: gFloor,
        groupsAtSingleSize: atOne.length, groupsAtSingleSizeMaxN: atOne.length ? Math.max(...atOne.map((c) => c.n)) : 0,
        atSmallestSize: dom.filter((c) => c.d <= Math.min(...dom.map((x) => x.d)) + 0.5).length,
        groupsAtGroupFloor: groups.filter((c) => c.d <= gFloor + 0.5).length,
        twentyPlusAtSingleSize: d1 == null ? 0 : groups.filter((c) => c.n >= 20 && c.d <= d1 + 0.5 && !c.label).length,
        modesMerged, modesTotal,
      };
      // Ranges
      await page.evaluate(() => { globalThis.__veR = null; });
      await page.locator('[data-view="ranges"]').first().click();
      await page.waitForFunction(() => globalThis.__veR, null, { timeout: 60000 });
      await page.waitForTimeout(500);
      const R = await page.evaluate(() => globalThis.__veR);
      const thick = await page.evaluate(async () => {
        // every row's bar thickness, scrolled through (rows are windowed)
        const host = document.querySelector('#chartHost');
        const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
        const seen = {};
        for (let y = 0; y <= parseFloat(body.style.height) + 1200; y += 1200) {
          if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          for (const r of host.querySelectorAll('.ms-row')) seen[r.dataset.idx] = parseFloat(r.querySelector('.ms-row__bar').style.height) || 8;
        }
        return seen;
      });
      const band = (m) => String(Math.floor(m / 25000) * 25);
      const rowsBy = {}, postsBy = {}, inkBy = {};
      let ink = 0;
      R.rows.forEach((r, i) => { const t = thick[i] ?? 8; ink += t; });
      const nRows = R.rows.length, nPosts = R.rows.reduce((s, r) => s + r.n, 0);
      R.rows.forEach((r, i) => { const k = band(r.mid); rowsBy[k] = (rowsBy[k] || 0) + 1 / nRows; postsBy[k] = (postsBy[k] || 0) + r.n / nPosts; inkBy[k] = (inkBy[k] || 0) + (thick[i] ?? 8) / ink; });
      const ones1 = R.rows.filter((r) => r.n === 1);
      o.ranges = {
        rows: nRows, postings: nPosts, oneRowsShareOfRows: ones1.length / nRows, oneRowsShareOfPostings: ones1.length / nPosts,
        oneRowsShareOfInk: R.rows.reduce((s, r, i) => s + (r.n === 1 ? (thick[i] ?? 8) : 0), 0) / ink,
        tvRowsVsPostings: tv(rowsBy, postsBy), tvInkVsPostings: tv(inkBy, postsBy),
      };
      await ctx.close();
      console.log(`${slug} ${vw}: circles ${o.circles}, singles ${o.singles} (${o.singleD} px), groups at a single's size ${o.groupsAtSingleSize} (max n ${o.groupsAtSingleSizeMaxN}), 20+ at it ${o.twentyPlusAtSingleSize}, at the smallest size ${o.atSmallestSize}, modes sharing ${modesMerged}/${modesTotal}; ranges ${nRows} rows, TV rows ${(o.ranges.tvRowsVsPostings * 100).toFixed(0)}%, ink ${(o.ranges.tvInkVsPostings * 100).toFixed(0)}%, one-posting rows ${(o.ranges.oneRowsShareOfRows * 100).toFixed(0)}% of rows, ${(o.ranges.oneRowsShareOfInk * 100).toFixed(0)}% of ink, ${(o.ranges.oneRowsShareOfPostings * 100).toFixed(0)}% of postings`);
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));

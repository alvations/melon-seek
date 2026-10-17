// Beta data-visualisation review, round 3, 2026-10-16 (docs/process/viz-review-beta-2.md). Chromium against
// the static build: BETA_QA_DIST (the lead's build), else dist/ from `npm run build`, served under /melon-seek/
// like GitHub Pages. Other hosts are aborted, so the map is in its offline look.
// Every test is tagged with a finding ID ("[V-33]") and encodes an open problem: it fails on the reviewed build
// (cycle-beta6-dist, d98a9f0, the 2026-10-16 crawl) and passes once the finding is fixed. Each test skips when
// the build, the board or the kind of posting it needs is missing, so a later crawl without them never fails it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. */
async function serveDist() {
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, main: `${origin}/melon-seek`, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh page at `<site>/#<hash>`, results loaded; skips unless `company` is a snapshot board there. */
async function open(ctx, hash, { site = 'beta', dark = false, phone = false, viewport = DESKTOP } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext(phone
    ? { viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' }
    : { viewport, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const base = site === 'beta' ? st.beta : st.main;
  await page.goto(`${base}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 120000 });
  await sleep(800);
  const company = new URLSearchParams(hash).get('c');
  if (company) {
    const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base, company });
    if (mode !== 'snapshot') skip(`${company} has no snapshot in this build (${mode})`);
  }
  return { st, page, base };
}

/** Scroll the (windowed) chart until `find()` (a function source run in the page) returns a truthy value. */
async function scrollFind(page, findSrc, step = 300) {
  return page.evaluate(`(async () => {
    const find = ${findSrc};
    const host = document.querySelector('#chartHost');
    const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
    const H = parseFloat(body.style.height) || 0;
    for (let y = 0; y <= H + ${step}; y += ${step}) {
      if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hit = find(host);
      if (hit) return hit;
    }
    return null;
  })()`);
}

export function registerBetaVizReviewTests2(suite) {
  /* --------------------------------------------------------------- Clusters */

  suite.test('Beta viz review 2: [V-33] Clusters circles are drawn at the sizes they were planned with (Amazon, 1440 px: no circle holds two peaks the same rule keeps apart)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=amazon');
    await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 });
    const r = await page.evaluate(async ({ base }) => {
      const { chartPay, keyOf, placeCircles, circleRadius } = await import(`${base}/viz/chart.js`);
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
      const { plotted } = chartPay(jobs);
      const host = document.querySelector('#chartHost');
      const money = (t) => { const m = /\$([\d.]+)([KM]?)/.exec(t || ''); return m ? +m[1] * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1) : null; };
      const ticks = [...host.querySelectorAll('.ms-axis__tick')].map((t) => ({ v: money(t.textContent), px: parseFloat(t.style.left) })).filter((t) => t.v != null);
      const [a, z] = [ticks[0], ticks[ticks.length - 1]];
      const x = (v) => a.px + ((v - a.v) / (z.v - a.v)) * (z.px - a.px);
      const grid = [...host.querySelectorAll('.ms-chart__gridline')].map((g) => parseFloat(g.style.left));
      const plotL = Math.min(...grid), plotR = Math.max(...grid);
      const d0 = a.v + (plotL - a.px) / ((z.px - a.px) / (z.v - a.v)), d1 = a.v + (plotR - a.px) / ((z.px - a.px) / (z.v - a.v));
      const rows = [...host.querySelectorAll('.ms-crow')];
      const names = rows.map((row) => row.querySelector('.ms-crow__name').firstChild.textContent.trim());
      const named = new Set(names.filter((n) => !/^\d[\d,]* more /.test(n)));
      const drawn = rows.map((row) => [...row.querySelectorAll('.ms-bin:not(.ms-bin--overflow)')].map((b) => ({ n: +b.dataset.n, at: +b.dataset.at, d: parseFloat(b.querySelector('.ms-bin__dot').style.width) })));
      let maxN = Math.max(...drawn.flat().map((c) => c.n));
      let rMax = Math.max(...drawn.flat().map((c) => c.d)) / 2, rMin = Math.min(4.5, rMax), edge = Math.max(0, rMax - 6);
      let rad = (n) => Math.max(rMin, rMax * Math.sqrt(n / maxN));
      // fix-viz-5 (V-34 changed the size scale): when the chart exports its scale and says what its sizes were drawn
      // against (the body's data-plan-n, data-r-max, data-edge), replay with those, so the check stays "the drawn
      // circles are the plan at the drawn sizes" whatever the scale.
      const P = host.querySelector('.ms-chart__body')?.dataset || {};
      if (typeof circleRadius === 'function' && P.planN) {
        maxN = +P.planN; rMax = +P.rMax; edge = +P.edge;
        rad = (n) => circleRadius(n, maxN, { rMax });
      }
      const xd = (v) => Math.min(plotR - edge, Math.max(plotL + edge, x(v)));
      const bad = [];
      rows.forEach((row, i) => {
        const fold = /^\d[\d,]* more /.test(names[i]);
        const items = plotted.filter((p) => { const k = keyOf(p.job, 'department'); return (fold ? !named.has(k) : k === names[i]) && p.mid >= d0 - 1 && p.mid <= d1 + 1; });
        const plan = placeCircles(items, { x: xd, need: (p, q) => Math.max(24, rad(p) + rad(q) + 2) });
        const want = plan.map((g) => g.items.length).join(','), got = drawn[i].map((c) => c.n).join(',');
        if (want !== got) {
          const big = drawn[i].find((c) => !plan.some((g) => g.items.length === c.n));
          bad.push(`${names[i]}: drawn ${drawn[i].length} circles (${got}), the same rule at the drawn sizes (largest ${maxN}) gives ${plan.length} (${want})${big ? `; the drawn ${big.n}-posting circle at $${Math.round(big.at / 100) / 10}K splits into ${plan.filter((g) => g.at >= big.at - 40000 && g.at <= big.at + 40000).map((g) => `${g.items.length} at $${Math.round(g.at / 100) / 10}K`).join(' and ')}` : ''}`);
        }
      });
      return { rows: rows.length, bad };
    }, { base });
    assert(r.rows > 0, 'no Clusters rows drawn');
    assert(!r.bad.length, `the circle plan did not settle before drawing: ${r.bad.join('; ')}`);
  });

  suite.test('Beta viz review 2: [V-34] Clusters: a circle of 20+ postings is not drawn the same size as a circle of one, unless it shows its count (Amazon)', async (ctx) => {
    const { page } = await open(ctx, 'c=amazon');
    await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 });
    const r = await page.evaluate(() => {
      const cs = [...document.querySelectorAll('#chartHost .ms-crow')].flatMap((row) => [...row.querySelectorAll('.ms-bin:not(.ms-bin--overflow)')].map((b) => ({
        row: row.querySelector('.ms-crow__name').firstChild.textContent.trim(), n: +b.dataset.n, at: +b.dataset.at,
        d: Math.round(b.querySelector('.ms-bin__dot').getBoundingClientRect().width * 10) / 10, label: b.querySelector('.ms-bin__dot').textContent.trim(),
      })));
      const ones = cs.filter((c) => c.n === 1);
      if (!ones.length) return { skip: true };
      const d1 = Math.max(...ones.map((c) => c.d));
      const same = cs.filter((c) => c.n >= 20 && c.d <= d1 + 0.5 && !c.label);
      return { n: cs.length, d1, same: same.sort((p, q) => q.n - p.n).slice(0, 4).map((c) => `${c.row}: ${c.n} postings at $${Math.round(c.at / 100) / 10}K`), count: same.length };
    });
    if (r.skip) skip('no one-posting circle on the chart');
    assert(!r.count, `${r.count} circles of 20 or more postings are drawn ${r.d1} px wide with no count, the size of a one-posting circle: ${r.same.join('; ')}`);
  });

  /* ----------------------------------------------------------------- Ranges */

  suite.test('Beta viz review 2: [V-35] Ranges: a striped bar is a span over several levels or places, and a one-place bar names its place (Amazon)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=amazon&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
    const n = await page.evaluate(async ({ base }) => {
      const { chartPay, spanTiers } = await import(`${base}/viz/chart.js`);
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
      return chartPay(jobs).plotted.filter((p) => { const s = spanTiers(p.job); return s && s.kind === 'places' && s.span === false; }).length;
    }, { base });
    if (!n) skip('no Amazon posting plotted at one of its places\' ranges');
    const hit = await scrollFind(page, `(host) => { const r = [...host.querySelectorAll('.ms-row')].find((row) => /one of \\d+ places/.test(row.getAttribute('aria-label') || '')); return r ? r.dataset.idx : null; }`);
    if (hit == null) skip('no one-place row found');
    const row = page.locator(`#chartHost .ms-row[data-idx="${hit}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.hover({ force: true });
    await sleep(200);
    const r = await page.evaluate(({ idx }) => {
      const row = document.querySelector(`#chartHost .ms-row[data-idx="${idx}"]`);
      const tip = document.querySelector('.ms-viz-tip:not([hidden])');
      const subs = tip ? [...tip.querySelectorAll('.ms-tip__sub')].map((e) => e.textContent) : [];
      const head = subs.find((t) => /places/.test(t)) || '';
      const value = tip?.querySelector('.ms-tip__value')?.textContent || '';
      // The tier whose figures are the bar's: "Seattle: $287,500.00 – $350,000.00"
      const tiers = subs.filter((t) => /^[^:]+: /.test(t)).map((t) => ({ label: t.split(':')[0], text: t }));
      const nums = (t) => (t.match(/[\d,]+(?:\.\d+)?/g) || []).map((v) => Math.round(+v.replace(/,/g, ''))).filter((v) => v >= 1000);
      const own = tiers.find((t) => nums(t.text).join('-') === nums(value).join('-'));
      return {
        label: row.getAttribute('aria-label'), striped: row.querySelector('.ms-row__bar').classList.contains('ms-row__bar--span'),
        legend: document.querySelector('#chartHost .ms-chart__legend')?.textContent || '', head, own: own?.label || null, tip: tip?.innerText.replace(/\n+/g, ' / ') || '',
      };
    }, { idx: hit });
    const legendSaysOne = /one place|one of/i.test(r.legend);
    assert(!r.striped || legendSaysOne, `"${r.label}" is one place's posted range but is drawn striped, and the legend says "Striped: several levels or places" (${n} such bars on the board)`);
    assert(r.own && r.head.includes(r.own), `the tooltip does not say which place the bar's range is for (the bar is ${r.own || 'one of the listed'}'s range): "${r.tip.slice(0, 240)}"`);
  });

  suite.test('Beta viz review 2: [V-38] Ranges: a row of 100+ postings with one posted range is drawn differently from a row of one (Google)', async (ctx) => {
    const { page } = await open(ctx, 'c=google&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
    const big = await scrollFind(page, `(host) => { const r = [...host.querySelectorAll('.ms-row')].find((row) => +row.dataset.n >= 100); return r ? r.dataset.idx : null; }`);
    if (big == null) skip('no row of 100+ postings');
    const r = await page.evaluate(({ idx }) => {
      const look = (row) => { const bar = row.querySelector('.ms-row__bar'), cs = getComputedStyle(bar), rr = bar.getBoundingClientRect(); return { h: Math.round(rr.height * 10) / 10, rowH: row.offsetHeight, o: cs.opacity, img: cs.backgroundImage, marks: row.querySelectorAll('.ms-row__bar, .ms-row__dot').length }; };
      const a = document.querySelector(`#chartHost .ms-row[data-idx="${idx}"]`);
      const rows = [...document.querySelectorAll('#chartHost .ms-row')];
      const shown = (row) => { const bar = row.querySelector('.ms-row__bar'), dot = row.querySelector('.ms-row__dot'); return !bar.hidden && !dot.hidden && bar.getBoundingClientRect().height > 0 && !row.querySelector('.ms-row__over'); };
      const one = rows.find((row) => +row.dataset.n === 1 && shown(row) && row.querySelector('.ms-row__bar').className === a.querySelector('.ms-row__bar').className);
      return one ? { n: +a.dataset.n, a: look(a), b: look(one), label: a.getAttribute('aria-label') } : null;
    }, { idx: big });
    if (!r) skip('no one-posting row with the same kind of bar on screen');
    assert(JSON.stringify(r.a) !== JSON.stringify(r.b), `"${r.label}" (${r.n} postings) is drawn exactly like a one-posting row (bar ${r.a.h} px high in a ${r.a.rowH} px row, opacity ${r.a.o}); only its "×${r.n}" text differs`);
  });

  suite.test('Beta viz review 2: [V-48] Ranges: on-target earnings have a legend key, and an OTE range over two levels is still drawn as OTE (NVIDIA)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=nvidia&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
    const n = await page.evaluate(async ({ base }) => {
      const { chartPay, spanTiers } = await import(`${base}/viz/chart.js`);
      const p = chartPay((await (await import(`${base}/api.js`)).getJobs({ company: 'nvidia' })).jobs || []).plotted.filter((x) => x.ote);
      return { ote: p.length, spans: p.filter((x) => spanTiers(x.job)).length };
    }, { base });
    if (!n.ote) skip('no on-target earnings on NVIDIA');
    const legend = await page.evaluate(() => document.querySelector('#chartHost .ms-chart__legend')?.textContent || '');
    const row = n.spans ? await scrollFind(page, `(host) => { const r = [...host.querySelectorAll('.ms-row')].find((x) => /on-target earnings/.test(x.getAttribute('aria-label') || '') && /spans \\d+ levels/.test(x.getAttribute('aria-label') || '')); return r ? { label: r.getAttribute('aria-label').slice(0, 120), cls: r.querySelector('.ms-row__bar').className } : null; }`, 400) : null;
    const bad = [];
    if (!/on-target|dashed/i.test(legend)) bad.push(`${n.ote} on-target-earnings bars are dashed, but the legend has no key for them ("${legend.slice(-60)}")`);
    if (row && !/--ote/.test(row.cls)) bad.push(`"${row.label}" is on-target earnings but is drawn striped like a base-pay span (${row.cls}; ${n.spans} such bars)`);
    assert(!bad.length, bad.join('; '));
  });

  /* --------------------------------------------------------- Group by Location */

  suite.test('Beta viz review 2: [V-36] Group by Location: a city\'s row uses the range posted for that city (Amazon and Microsoft per-place ranges)', async (ctx) => {
    const bad = [];
    for (const company of ['amazon', 'microsoft']) {
      const { page, base } = await open(ctx, `c=${company}&g=location`);
      await page.waitForSelector('#chartHost .ms-crow', { timeout: 60000 });
      const want = await page.evaluate(async ({ base, company }) => {
        const { chartPay, locationRowKey, payCoversRow } = await import(`${base}/viz/chart.js`);
        const { toUSD, formatMoney } = await import(`${base}/viz/palette.js`);
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company })).jobs || [];
        const { plotted } = chartPay(jobs);
        const median = (s) => { s = s.slice().sort((p, q) => p - q); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
        const curs = new Map(); for (const p of plotted) curs.set(p.cur, (curs.get(p.cur) || 0) + 1);
        const rows = new Map();
        for (const p of plotted) {
          const k = locationRowKey(p.job);
          if (!payCoversRow(p.job, k) || p.ote) continue;
          const r = rows.get(k) || rows.set(k, { n: 0, other: 0, own: [] }).get(k);
          r.n++;
          const s = p.job.salary, rs = (s.ranges || []).filter((x) => Array.isArray(x.locations));
          const loc = (p.job.locations || []).find((l) => l && !l.remote && (l.city || l.name) === k);
          const mine = loc && rs.length > 1 && rs.find((x) => x.locations.includes(loc.rawName || loc.name));
          if (mine && (Number(mine.min) !== s.min || Number(mine.max ?? mine.min) !== s.max)) { r.other++; r.own.push(toUSD((Number(mine.min) + Number(mine.max ?? mine.min)) / 2, String(mine.currency || p.cur))); } else r.own.push(p.mid);
        }
        const cand = [...rows].filter(([, r]) => r.n >= 10 && r.other >= 5).map(([k, r]) => ({ k, n: r.n, other: r.other, own: formatMoney(median(r.own)) })).sort((p, q) => q.other - p.other);
        return cand.slice(0, 2);
      }, { base, company });
      for (const w of want) {
        const shown = await scrollFind(page, `(host) => { const r = [...host.querySelectorAll('.ms-crow')].find((row) => row.querySelector('.ms-crow__name')?.firstChild?.textContent.trim() === ${JSON.stringify(w.k)}); return r ? r.querySelector('.ms-crow__label').title : null; }`);
        if (!shown) continue;
        const m = /median (\$[\d.]+[KM]?)/.exec(shown)?.[1];
        if (m !== w.own) bad.push(`${company} "${shown.split('. ')[0]}": ${w.other} of its ${w.n} postings with pay are drawn at another place's range; ${w.k}'s own posted ranges give a median of ${w.own}`);
      }
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('Beta viz review 2: [V-39] one Location filter, one median: the chart caption, the stats line and the map pin agree (Microsoft, Mountain View)', async (ctx) => {
    const { page } = await open(ctx, 'c=microsoft&l=Mountain%20View');
    await page.waitForSelector('#chartHost .ms-hist__cap', { timeout: 60000 });
    const chart = await page.evaluate(() => /\$[\d.]+[KM]?/.exec(document.querySelector('#chartHost .ms-hist__cap').textContent)?.[0]);
    const stats = await page.evaluate(() => /(\$[\d.]+[KM]?) base pay median/.exec(document.body.innerText)?.[1] || null);
    await page.evaluate(() => { location.hash = location.hash.replace(/(^#|&)m=[^&]*/, '') + '&m=map'; });
    await page.locator('#mapHost .leaflet-marker-icon').first().waitFor({ state: 'attached', timeout: 60000 });
    await sleep(1500);
    const pin = await page.evaluate(() => [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].map((m) => m.getAttribute('aria-label') || '').find((a) => /^Mountain View/.test(a)) || null);
    const pinMed = /median (\$[\d.]+[KM]?)/.exec(pin || '')?.[1] || null;
    if (!chart || !stats || !pinMed) skip(`a figure is missing (chart ${chart}, stats ${stats}, pin "${pin}")`);
    assert(chart === stats && stats === pinMed, `Location = Mountain View: the chart caption says "Median base pay ${chart}" (each posting's Mountain View range), the stats line "${stats} base pay median" and the map pin "${pin}" (the postings' headline ranges, the Redmond band for most)`);
  });

  suite.test('Beta viz review 2: [V-40] Compstimate and Insights price a place at the range posted for it (Microsoft "Software Engineer" in New York)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=microsoft');
    const r = await page.evaluate(async ({ base }) => {
      const { estimateComp } = await import(`${base}/features/compstimate.js`);
      const { hotLocations, MIN_SAMPLE } = await import(`${base}/features/insights.js`);
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'microsoft' })).jobs || [];
      const city = 'New York';
      // The same board with each posting's pay replaced by the range it posts for New York, when it posts one.
      let changed = 0;
      const here = jobs.map((j) => {
        const s = j.salary, rs = (s?.ranges || []).filter((x) => Array.isArray(x.locations));
        const loc = (j.locations || []).find((l) => l && !l.remote && l.city === city);
        const mine = loc && rs.length > 1 && rs.find((x) => x.locations.includes(loc.rawName || loc.name));
        if (!mine || (Number(mine.min) === s.min && Number(mine.max ?? mine.min) === s.max)) return j;
        changed++;
        const min = Number(mine.min), max = Number(mine.max ?? mine.min);
        return { ...j, salary: { ...s, min, max, mid: (min + max) / 2 } };
      });
      const q = { title: 'Software Engineer', location: city };
      const a = estimateComp(jobs, q), b = estimateComp(here, q);
      const hot = (list) => hotLocations(list, { limit: 50, minSalaried: MIN_SAMPLE }).find((h) => h.location === city)?.median ?? null;
      return { changed, est: [[a.low, a.mid, a.high], [b.low, b.mid, b.high]], hot: [hot(jobs), hot(here)] };
    }, { base });
    if (!r.changed) skip('no Microsoft posting lists its own New York range');
    const k = (v) => (v == null ? '—' : `$${Math.round(v / 1000)}K`);
    const est = (e) => `${k(e[0])}–${k(e[2])}, mid ${k(e[1])}`;
    assert(JSON.stringify(r.est[0]) === JSON.stringify(r.est[1]) && r.hot[0] === r.hot[1], `${r.changed} postings post a New York range of their own, but Compstimate says ${est(r.est[0])} for "Software Engineer" in New York (${est(r.est[1])} with their New York ranges) and Insights' New York median is ${k(r.hot[0])} (${k(r.hot[1])} with them)`);
  });

  suite.test('Beta viz review 2: [V-41] Ranges: a posted minimum and pay that includes the top shift differential say so, as the cards do (Amazon)', async (ctx) => {
    const bad = [];
    for (const [q, want, what] of [['Area Manager, FC Operations', /minimum|from /i, 'a posted minimum ("from €46K" on the card)'], ['Retail Lead Associate (Reduced-Time)', /shift/i, 'pay that includes the highest shift differential ("Incl. top shift pay" on the card)']]) {
      const { page, base } = await open(ctx, `c=amazon&v=ranges&q=${encodeURIComponent(q)}`);
      const has = await page.evaluate(async ({ base, q }) => {
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
        return jobs.filter((j) => j.title?.startsWith(q) && j.salary && (j.salary.kind === 'minimum' || j.salary.includesShiftDifferential)).length;
      }, { base, q });
      if (!has) continue;
      await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
      await page.locator('#chartHost .ms-row').first().hover({ force: true });
      await sleep(200);
      const tip = await page.evaluate(() => document.querySelector('.ms-viz-tip:not([hidden])')?.innerText.replace(/\n+/g, ' / ') || '');
      const label = await page.evaluate(() => document.querySelector('#chartHost .ms-row')?.getAttribute('aria-label') || '');
      if (!want.test(tip) && !want.test(label)) bad.push(`"${q}" is ${what}, but the bar's tooltip reads "${tip.slice(0, 140)}"`);
    }
    if (!bad.length) return;
    assert(false, bad.join('; '));
  });

  suite.test('Beta viz review 2: [V-42] Clusters: the P25–P75 band clears 3:1 against the chart, or its values are written down (Amazon, light and dark)', async (ctx) => {
    const bad = [];
    for (const dark of [false, true]) {
      const { page } = await open(ctx, 'c=amazon', { dark });
      await page.waitForSelector('#chartHost .ms-crow__band', { timeout: 60000 });
      const r = await page.evaluate(() => {
        const cv = document.createElement('canvas').getContext('2d');
        const solid = (s) => { const cm = String(s).match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?/); if (cm) return [cm[1] * 255, cm[2] * 255, cm[3] * 255, cm[4] == null ? 1 : +cm[4]]; cv.fillStyle = '#000'; cv.fillStyle = s; const h = cv.fillStyle; if (h.startsWith('#')) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; } const m = h.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : [0, 0, 0, 0]; };
        const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const bgOf = (e) => { for (let n = e.parentElement; n; n = n.parentElement) { const c = solid(getComputedStyle(n).backgroundColor); if (c[3] > 0.99) return c; } return [255, 255, 255, 1]; };
        const out = [];
        for (const row of document.querySelectorAll('#chartHost .ms-crow')) {
          const band = row.querySelector('.ms-crow__band');
          if (!band) continue;
          const bg = bgOf(band), c = solid(getComputedStyle(band).backgroundColor);
          const fill = c.slice(0, 3).map((v, i) => v * c[3] + bg[i] * (1 - c[3]));
          const words = `${row.getAttribute('aria-label') || ''} ${row.querySelector('.ms-crow__label')?.title || ''} ${row.querySelector('.ms-crow__sub')?.textContent || ''}`;
          out.push({ name: row.querySelector('.ms-crow__name').firstChild.textContent.trim(), r: ratio(fill, bg), said: /P25|P75|quartile|middle half|25th|75th/i.test(words) });
        }
        return out;
      });
      const low = r.filter((x) => x.r < 3 && !x.said);
      if (low.length) bad.push(`${dark ? 'dark' : 'light'}: ${low.length} of ${r.length} rows' P25–P75 bands at ${Math.min(...low.map((x) => x.r)).toFixed(2)}–${Math.max(...low.map((x) => x.r)).toFixed(2)}:1, their values written nowhere (e.g. "${low[0].name}")`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('Beta viz review 2: [V-46] phone: the chart says its axis is US dollars a year (Amazon, 390 px)', async (ctx) => {
    const bad = [];
    for (const hash of ['c=amazon', 'c=amazon&v=ranges']) {
      const { page } = await open(ctx, hash, { phone: true });
      await page.waitForSelector('#chartHost .ms-axis__tick', { timeout: 60000 });
      const r = await page.evaluate(() => {
        const host = document.querySelector('#chartHost');
        const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
        const shown = [...host.querySelectorAll('*')].filter((e) => e.children.length === 0 && vis(e)).map((e) => e.textContent).join(' ');
        return { year: /a year|yearly|\/yr|per year/i.test(shown), usd: /US\$|US dollars|USD/i.test(shown), ticks: [...host.querySelectorAll('.ms-axis__tick')].map((t) => t.textContent).join(' ') };
      });
      if (!r.year || !r.usd) bad.push(`${hash}: axis "${r.ticks}" with no visible "a year" or "US$" (chart.js renders its narrow caption "US$ a year, converted" only when the label column is wider than 0, and on a phone it is 0)`);
    }
    assert(!bad.length, bad.join('; '));
  });

  /* -------------------------------------------------------------------- map */

  suite.test('Beta viz review 2: [V-43] map: a pin priced from under a tenth of its postings says so on the pin (Amazon "Sydney, Melbourne and 9 more": 5 of 434)', async (ctx) => {
    const { page } = await open(ctx, 'c=amazon&m=map');
    await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
    await sleep(4800);
    const pins = await page.evaluate(() => [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].map((m) => ({ a: m.getAttribute('aria-label') || '', t: m.querySelector('.ms-pin')?.innerText.replace(/\n+/g, ' ') || '' })));
    const bad = [];
    for (const { a, t } of pins) {
      const m = /: ([\d,]+) postings?, median (\$[\d.]+[KM]?) from ([\d,]+) with pay/.exec(a);
      if (!m) continue;
      const n = +m[1].replace(/,/g, ''), k = +m[3].replace(/,/g, '');
      if (k / n < 0.1 && !/of|with pay|paid/i.test(t)) bad.push(`pill "${t}" (${a}: ${(100 * k / n).toFixed(1)}% of its postings)`);
    }
    if (!pins.length) skip('no pins');
    assert(!bad.length, `a pin's pill reads as the median of all its postings: ${bad.join('; ')}`);
  });

  suite.test('Beta viz review 2: [V-44] map: postings with no place are counted somewhere on the map (Meta)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=meta&m=map');
    const n = await page.evaluate(async ({ base }) => ((await (await import(`${base}/api.js`)).getJobs({ company: 'meta' })).jobs || []).filter((j) => !(j.locations || []).length && !j.remote).length, { base });
    if (!n) skip('every Meta posting lists a place');
    await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
    await sleep(4800);
    const text = await page.evaluate(() => document.querySelector('#mapHost').innerText.replace(/\s+/g, ' '));
    assert(/no (location|place)|not on the map|without a (place|location)|unknown location/i.test(text), `${n} Meta postings list no place, are on no pin and not in Remote, and the map does not say so ("${text.slice(0, 160)}")`);
  });

  suite.test('Beta viz review 2: [V-45] map: a town is not pinned and named as another city 33 km away (Amazon "Cajamar, Sao Paulo, BRA" as "Sao Paulo, Brazil")', async (ctx) => {
    const { page, base } = await open(ctx, 'c=amazon');
    const r = await page.evaluate(async ({ base }) => {
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
      const hits = [];
      for (const j of jobs) for (const l of j.locations || []) if (/^Cajamar\b/i.test(l.rawName || '')) hits.push(`${l.rawName} -> ${l.name} (${l.lat}, ${l.lng})`);
      return { n: hits.length, ex: hits[0] };
    }, { base });
    if (!r.n) skip('no Cajamar posting');
    assert(!/^Sao Paulo/i.test(r.ex.split(' -> ')[1]), `${r.n} postings in Cajamar are pinned and named as São Paulo city, 33 km away: ${r.ex}`);
  });

  suite.test('Beta viz review 2: [V-37] Ranges grouped by Location: a place\'s group holds only pay posted for that place (Google London, NVIDIA Munich)', async (ctx) => {
    const bad = [];
    for (const [company, place] of [['google', 'London'], ['nvidia', 'Munich'], ['google', 'Zurich']]) {
      const { page, base } = await open(ctx, `c=${company}&v=ranges&g=location`);
      await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
      const want = await page.evaluate(async ({ base, company, place }) => {
        const { chartPay, keyOf, payCoversRow } = await import(`${base}/viz/chart.js`);
        const { formatMoney } = await import(`${base}/viz/palette.js`);
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company })).jobs || [];
        const inGroup = chartPay(jobs).plotted.filter((p) => keyOf(p.job, 'location') === place);
        const own = inGroup.filter((p) => payCoversRow(p.job, place) && !p.ote).map((p) => p.mid).sort((p, q) => p - q);
        const n = own.length, med = n ? (n % 2 ? own[(n - 1) / 2] : (own[n / 2 - 1] + own[n / 2]) / 2) : null;
        return { inGroup: inGroup.length, elsewhere: inGroup.length - inGroup.filter((p) => payCoversRow(p.job, place)).length, own: med == null ? null : formatMoney(med) };
      }, { base, company, place });
      if (!want.elsewhere) continue;
      const head = await scrollFind(page, `(host) => { const h = [...host.querySelectorAll('.ms-group')].find((g) => g.querySelector('.ms-group__title')?.textContent === ${JSON.stringify(place)}); return h ? h.textContent : null; }`, 400);
      if (!head) continue;
      const m = /median (\$[\d.]+[KM]?)/.exec(head)?.[1] || null;
      if (m !== want.own) bad.push(`${company} "${head}": ${want.elsewhere} of its ${want.inGroup} bars are pay posted for another place (${want.own ? `${place}'s own pay has a median of ${want.own}` : `none is pay for ${place}`})`);
    }
    assert(!bad.length, bad.join('; '));
  });
}

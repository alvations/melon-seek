// fix-qa4 lane e2e checks (docs/process/fix-qa4.md): the visible side of desktop QA round 4's findings
// (docs/process/qa-desktop-beta-4.md; its red tests are test/e2e/beta-desktop-qa-4.e2e.js), on the static build (dist/,
// or BETA_QA_DIST=<dist>) served under /melon-seek/ like GitHub Pages:
//   D-52 the Pay estimate for a city keeps the city's one-range postings, and its "Most comparable roles" show the pay
//        it used, named for the place when it is one place's row;
//   D-48 the drawer's rank line says "In the top 1%" / "In the lowest 1%" unless no role pays more / less, on one line
//        at every phone size of test/e2e/phone-sizes.mjs;
//   D-50 a "Pay unclear" posting's estimate stops at the maximum the posting states, its line one line at every size;
//   D-47 a board that isn't on the site, or fails to load, leaves no chart or map of the previous board behind;
//   D-49 Download CSV: what each pay figure is, the card's range, every posted row, and a README per site.
// Expected figures are worked out in the page from the board's own list (public/api.js getJobs), not by the code
// under test. FQA4_SHOTS=<tag> saves screenshots to docs/screenshots/fix-qa4/<tag>-*.png. Each check skips when the
// build or the board it needs is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { scanText, CAPTION_SEL } from './fix-phone-text.e2e.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'fix-qa4');
const SHOT_TAG = process.env.FQA4_SHOTS || '';
async function shot(page, name, locator = null) {
  if (!SHOT_TAG) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${SHOT_TAG}-${name}.png`);
  await (locator ? locator.screenshot({ path: file, timeout: 8000 }) : page.screenshot({ path: file, timeout: 8000 })).catch(() => {});
}

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta copy. `status(path)` may fail a file. */
async function serveDist({ status = null } = {}) {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p;
    try { p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length))); } catch { res.writeHead(400); return res.end(); }
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    const code = status ? status(u.pathname) : 0;
    if (code) { res.writeHead(code); return res.end('x'); }
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, main: `${origin}/melon-seek`, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh context (desktop, or a phone size of phone-sizes.mjs) on `<site>/#<hash>`, ready. */
async function open(ctx, hash, { size = null, site = 'beta', status = null } = {}) {
  const st = await serveDist({ status });
  if (!st) skip('no build with a beta copy (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext(size ? contextFor(size, 'chromium') : { viewport: DESKTOP, deviceScaleFactor: 1, colorScheme: 'light' });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  if (hash != null) await go(page, st, hash, site);
  return { st, page, errors };
}
async function go(page, st, hash, site = 'beta') {
  await page.goto(`${site === 'beta' ? st.beta : st.main}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 110000 });
  await sleep(500);
}
/** The board as the app loads it, reduced to what the checks read; skips without a snapshot. */
async function board(page, st, company, site = 'beta') {
  const d = await page.evaluate(async ({ base, company }) => {
    const res = await (await import(`${base}/api.js`)).getJobs({ company });
    return {
      mode: res.mode,
      jobs: res.jobs.map((j) => ({
        id: j.id, title: j.title, seniority: j.seniority || null, salaryFlag: j.salaryFlag || null, salaryRaw: j.salaryRaw || null,
        locations: (j.locations || []).map((l) => ({ name: l.name || '', rawName: l.rawName || l.name || '', city: l.city || null, country: l.country || null, remote: !!l.remote })),
        salary: j.salary ? {
          min: j.salary.min, max: j.salary.max, currency: j.salary.currency, kind: j.salary.kind || null, termWeeks: j.salary.termWeeks || null, partTime: !!j.salary.partTime,
          ranges: Array.isArray(j.salary.ranges) ? j.salary.ranges.map((r) => ({ label: r.label || '', min: r.min, max: r.max, currency: r.currency || null, locations: r.locations || [] })) : [],
        } : null,
      })),
    };
  }, { base: site === 'beta' ? st.beta : st.main, company });
  if (d.mode !== 'snapshot' || !d.jobs.length) skip(`${company} has no snapshot in this build (${d.mode})`);
  return d.jobs;
}
async function drawer(page, st, company, id, site = 'beta') {
  await go(page, st, `c=${company}&job=${encodeURIComponent(id)}`, site);
  await page.waitForSelector('#drawer.is-open', { timeout: 30000 });
  await sleep(900);
}
/** The one-line rule of the density guard (fix-phone-text scanText) for `sel`, at most `maxLines` lines. */
async function oneLine(page, sel, maxLines = 1) {
  const r = await page.evaluate(scanText, { roots: [sel], captionSel: `${CAPTION_SEL}, ${sel}`, allow: [], words: 12, maxLines });
  return [...r.lines.map((m) => `${m.lines} lines, ${m.words} words: "${m.text}"`), ...r.cut.map((m) => `cut by ${m.over} px: "${m.text}"`)];
}

/* --------------------------------------------------------------- D-48: the rank line's roles */

/** Full-time US base pay in US dollars, as the drawer's pool holds it (QA round 4's reading), highest first. */
function rankPool(jobs) {
  const mid = (j) => (j.salary.min + (j.salary.max ?? j.salary.min)) / 2;
  return jobs.filter((j) => j.salary && j.salary.currency === 'USD' && !j.salary.termWeeks && !j.salary.partTime && (j.salary.kind === 'salary' || j.salary.kind === 'hourly')
    && j.seniority !== 'Intern' && j.locations.length && j.locations.every((l) => l.country === 'US')).sort((a, b) => mid(b) - mid(a));
}
const RANK_RE = /^(In the top 1% of|In the lowest 1% of|Pays more than \d+% of) Amazon’s roles( in the US)?$/;

export function registerFixQa4Tests(suite) {
  /* ------------------------------------------------------------- D-52 */
  suite.test('fix-qa4: [D-52] the Pay estimate for Microsoft "Software Engineer" in New York lists each role at the range it used (the New York row), named for New York', async (ctx) => {
    const { st, page, errors } = await open(ctx, 'c=microsoft&m=insights');
    const jobs = await board(page, st, 'microsoft');
    await page.waitForSelector('#compHost input[id^="comp-t"]', { timeout: 30000 }); await sleep(600);
    await page.locator('#compHost select[id^="comp-s"]').selectOption('').catch(() => {});
    await page.locator('#compHost input[id^="comp-t"]').fill('Software Engineer'); await sleep(900);
    const sel = page.locator('#compHost select[id^="comp-l"]');
    const v = await sel.evaluate((s) => [...s.options].find((o) => o.value === 'New York')?.value);
    if (v == null) skip('no New York in the Location list');
    await sel.selectOption(v); await sleep(1500);
    const items = await page.$$eval('#compHost .ms-comp__item', (els) => els.map((e) => ({ id: e.dataset.key.replace(/^comp:/, ''), pay: e.querySelector('.ms-comp__item-pay').textContent.trim(), meta: e.querySelector('.ms-comp__item-meta').textContent.trim(), label: e.getAttribute('aria-label') })));
    if (!items.length) skip('no comparables listed');
    const fmt = await page.evaluate(async (base) => { const { formatMoney } = await import(`${base}/features/shared.js`); return [100000, 160000, 261000].map(formatMoney); }, st.beta);
    assertEq(fmt.join(' '), '$100K $160K $261K', 'formatMoney');
    const k = (n) => `$${Math.round(n / 1000)}K`;
    // US dollars, as the widget writes a range (payRange: "$160K–$261K").
    const range = (a, b) => (k(a) === k(b) ? k(a) : `${k(a)}–${k(b)}`);
    const bad = [];
    let rowsSeen = 0;
    for (const it of items) {
      const j = jobs.find((x) => x.id === it.id);
      const ny = new Set(j.locations.filter((l) => l.city === 'New York' && !l.remote).map((l) => l.rawName));
      const own = j.salary.ranges.filter((r) => r.locations.some((x) => ny.has(x)));
      const want = own.length ? [Math.min(...own.map((r) => r.min)), Math.max(...own.map((r) => r.max ?? r.min))] : [j.salary.min, j.salary.max];
      const text = range(want[0], want[1]);
      if (it.pay !== text) bad.push(`${it.id}: shows ${it.pay}, used ${text}${own.length ? ' (its New York row)' : ''}`);
      if (own.length) { rowsSeen += 1; if (!/^Posted for New York/.test(it.meta) || !/the range posted for New York/.test(it.label)) bad.push(`${it.id}: "${it.meta}" does not name New York's row`); }
    }
    if (!rowsSeen) skip('no listed comparable posts a New York row');
    await shot(page, 'D-52-microsoft-new-york-comparables', page.locator('#compHost'));
    assert(!bad.length, bad.join('; '));
    assert(!errors.length, errors.join(' | '));
  });

  /* ------------------------------------------------------------- D-47 */
  suite.test('fix-qa4: [D-47] the map is hidden too behind "This board isn\'t on this site", and the next board shows its chart again', async (ctx) => {
    const { st, page, errors } = await open(ctx, 'c=netflix');
    await board(page, st, 'netflix');
    await page.waitForSelector('#chartHost .ms-crow', { timeout: 30000 });
    await page.goto(`${st.beta}/#c=tesla`); await sleep(2500);
    const chartGone = await page.evaluate(() => document.querySelector('#chartHost').hidden);
    await shot(page, 'D-47-tesla-after-netflix-chart');
    assert(chartGone, 'the chart is hidden behind "This board isn\'t on this site"');
    await go(page, st, 'c=netflix&m=map');
    await page.waitForSelector('#mapHost .leaflet-container, #mapHost .ms-map', { timeout: 30000 }).catch(() => {});
    await sleep(800);
    await page.goto(`${st.beta}/#c=tesla&m=map`); await sleep(2500);
    const gone = await page.evaluate(() => ({ map: document.querySelector('#mapHost').hidden, chart: document.querySelector('#chartHost').hidden, msg: document.querySelector('#vizOverlay')?.textContent || '' }));
    await shot(page, 'D-47-tesla-after-netflix-map');
    assert(gone.map && gone.chart, `map hidden ${gone.map}, chart hidden ${gone.chart}`);
    assert(/isn.t on this site/.test(gone.msg), `overlay: "${gone.msg.slice(0, 80)}"`);
    await go(page, st, 'c=netflix');
    await page.waitForSelector('#chartHost .ms-crow', { timeout: 30000 });
    const back = await page.evaluate(() => ({ hidden: document.querySelector('#chartHost').hidden, rows: document.querySelectorAll('#chartHost .ms-crow').length, overlay: document.querySelector('#vizOverlay').hidden }));
    assert(!back.hidden && back.rows > 0 && back.overlay, `back on Netflix: chart hidden ${back.hidden}, ${back.rows} rows, overlay hidden ${back.overlay}`);
    assert(!errors.length, errors.join(' | '));
  });

  /* ------------------------------------------------------------- D-49 */
  suite.test('fix-qa4: [D-49] Download CSV gives the card\'s range, what the figure is and every posted row; the beta README names the careers sites', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const jobs = await board(page, st, 'amazon');
    const parse = (text) => {
      const out = []; let row = [], f = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); out.push(row); row = []; f = ''; } else if (ch !== '\r') f += ch;
      }
      const [head, ...rows] = out;
      return new Map(rows.map((r) => [r[0], Object.fromEntries(head.map((h, i) => [h, r[i]]))]));
    };
    const csv = parse(await (await page.request.get(`${st.beta}/data/amazon.csv`)).text());
    const j = jobs.find((x) => x.id === 'amazon:10371179') || jobs.find((x) => x.salary && x.salary.kind === 'salary' && x.salary.ranges.length >= 3 && x.salary.ranges.every((r) => r.locations.length));
    if (!j) skip('no Amazon posting with three place rows');
    await go(page, st, `c=amazon&q=${encodeURIComponent(j.title)}`);
    const card = page.locator(`#resultsList .card[data-id="${j.id}"] .sal-pill`);
    if (!(await card.count())) skip(`"${j.title}" is not in the first page of its own search`);
    const pill = (await card.innerText()).split('\n')[0].trim();
    const r = csv.get(j.id);
    assert(r, `${j.id} is in amazon.csv`);
    const k = (n) => Math.round(Number(n) / 1000);
    const m = /\$(\d+)K–(\d+)K/.exec(pill);
    assert(m && k(r.salary_min) === Number(m[1]) && k(r.salary_max) === Number(m[2]), `card "${pill}", CSV ${r.salary_min}-${r.salary_max}`);
    assertEq(r.salary_kind, 'salary', 'salary_kind');
    const listed = r.salary_ranges.split(' | ');
    assertEq(listed.length, j.salary.ranges.length, `every posted row: "${r.salary_ranges}"`);
    for (const x of j.salary.ranges) assert(listed.some((e) => e.startsWith(`${x.label}: ${Math.round(x.min)}-${Math.round(x.max ?? x.min)} `)), `row "${x.label}" in "${r.salary_ranges}"`);
    const min = jobs.find((x) => x.salary && x.salary.kind === 'minimum');
    if (min) assert(csv.get(min.id).salary_kind === 'minimum' && csv.get(min.id).salary_max === '', `${min.id}: ${JSON.stringify(csv.get(min.id))}`);
    const beta = await (await page.request.get(`${st.beta}/data/README.txt`)).text();
    const main = await (await page.request.get(`${st.main}/data/README.txt`)).text();
    assert(/Amazon Jobs \(amazon\.jobs\)/.test(beta) && /Big-tech pay is base pay only/.test(beta), 'the beta README names amazon.jobs and says base pay only');
    assert(!/own job board\s*\(Greenhouse, Ashby or Lever\)/.test(beta), 'the beta README does not say every row is from Greenhouse, Ashby or Lever');
    assert(/own job board\s*\(Greenhouse, Ashby or Lever\)/.test(main) && !/Amazon/.test(main), 'the main README is the main site\'s');
    assert(/salary_kind/.test(main) && /salary_kind/.test(beta), 'both explain salary_kind');
  });

  /* ------------------------------------------------------------- D-50, desktop: the main site's Anduril */
  suite.test('fix-qa4: [D-50] Anduril\'s "Pay unclear" postings on the main site are estimated no higher than the maximum they state', async (ctx) => {
    const { st, page, errors } = await open(ctx, 'c=anduril', { site: 'main' });
    const jobs = await board(page, st, 'anduril', 'main');
    const flagged = jobs.filter((j) => j.salaryFlag && j.salaryRaw && (j.salaryFlag.codes || []).every((c) => c === 'below_min' || c === 'range_ratio'));
    if (!flagged.length) skip('no Anduril posting whose maximum passed the checks');
    const bad = [];
    for (const j of flagged.slice(0, 4)) {
      await drawer(page, st, 'anduril', j.id, 'main');
      const amt = await page.locator('#drawer .d-comp-amt').textContent().catch(() => '');
      const m = /about \$([\d.]+)([KM])/.exec(amt || '');
      if (!m) continue;
      const v = Number(m[1]) * (m[2] === 'M' ? 1e6 : 1e3);
      if (v > j.salaryRaw.max + 999) bad.push(`${j.id}: "${amt}" over the stated ${j.salaryRaw.max}`);
      const note = (await page.locator('#drawer .d-comp-note').first().textContent()).trim();
      if (v >= Math.floor(j.salaryRaw.max / 1000) * 1000 && !/capped at (the posted|its) maximum/i.test(note)) bad.push(`${j.id}: capped, but the line reads "${note}"`);
    }
    assert(!bad.length, bad.join('; '));
    assert(!errors.length, errors.join(' | '));
  });

  /* ------------------------------------------------------------- every phone size: D-48 and D-50 */
  for (const size of ALL_SIZES) {
    suite.test(`fix-qa4: [D-48] ${size.name} ${size.width}x${size.height}: the rank line of Amazon's #11 from the top and the bottom says top or lowest 1% (not "The highest/lowest pay"), on one line`, async (ctx) => {
      const { st, page, errors } = await open(ctx, 'c=amazon', { size });
      const pool = rankPool(await board(page, st, 'amazon'));
      if (pool.length < 2000) skip(`only ${pool.length} full-time US postings with pay`);
      const bad = [];
      for (const [j, end] of [[pool[10], 'top'], [pool[pool.length - 11], 'bottom']]) {
        await drawer(page, st, 'amazon', j.id);
        const el = page.locator('#drawer .d-pct-text');
        if (!(await el.count())) { bad.push(`${j.id} (${end}): no rank line`); continue; }
        await el.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await sleep(300);
        const text = (await el.textContent()).trim();
        if (!RANK_RE.test(text)) bad.push(`${j.id} (#11 from the ${end}): "${text}"`);
        for (const m of await oneLine(page, '#drawer .d-pct-text')) bad.push(`${j.id}: ${m}`);
        if (end === 'top' && (size.width === 280 || size.width === 1114)) await shot(page, `D-48-${size.width}x${size.height}-top`, page.locator('#drawer .d-salary'));
      }
      assert(!bad.length, `${size.name}: ${bad.join('; ')}`);
      assert(!errors.length, errors.join(' | '));
    });
  }
  for (const size of ALL_SIZES) {
    suite.test(`fix-qa4: [D-50] ${size.name} ${size.width}x${size.height}: netflix:790298021069's estimate stops at the $464K it states, and its line is one line`, async (ctx) => {
      const id = 'netflix:790298021069';
      const { st, page, errors } = await open(ctx, 'c=netflix', { size });
      const j = (await board(page, st, 'netflix')).find((x) => x.id === id);
      if (!j || !j.salaryFlag || !j.salaryRaw) skip(`${id} is not a "Pay unclear" posting today`);
      await drawer(page, st, 'netflix', id);
      const amt = (await page.locator('#drawer .d-comp-amt').textContent().catch(() => '')).trim();
      const m = /about \$([\d.]+)([KM])/.exec(amt);
      if (!m) skip(`no estimate for ${id} ("${amt}")`);
      const v = Number(m[1]) * (m[2] === 'M' ? 1e6 : 1e3);
      const bad = [];
      if (v > j.salaryRaw.max + 999) bad.push(`"${amt}" is above the $${j.salaryRaw.max.toLocaleString()} it states`);
      const top = (await page.locator('#drawer .d-comp-top').textContent()).replace(/\s+/g, ' ');
      const hi = /–\$?([\d.]+)K/.exec(top);
      if (hi && Number(hi[1]) * 1e3 > j.salaryRaw.max + 999) bad.push(`the range "${top}" runs past it`);
      const note = page.locator('#drawer .d-comp-note').first();
      await note.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await sleep(300);
      if (!/capped at (the posted|its) maximum/i.test(await note.textContent())) bad.push(`the line reads "${(await note.textContent()).trim()}"`);
      for (const msg of await oneLine(page, '#drawer .d-comp-note')) bad.push(msg);
      // Its Details say what the similar roles suggest and what the posting states.
      await note.locator('.ms-note__more').click({ timeout: 5000 }).catch(() => {});
      await sleep(200);
      const det = (await note.locator('.ms-note__list').textContent().catch(() => '')) || '';
      if (!/Similar roles suggest about \$\d+K/.test(det) || !/states up to \$464K/.test(det)) bad.push(`Details: "${det.slice(0, 200)}"`);
      if (size.width === 280 || size.width === 390 || size.width === 1114) await shot(page, `D-50-${size.width}x${size.height}`, page.locator('#drawer .d-salary'));
      assert(!bad.length, `${size.name}: ${bad.join('; ')}`);
      assert(!errors.length, errors.join(' | '));
    });
  }
}

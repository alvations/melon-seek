// fix-qa4 lane e2e checks (docs/process/fix-qa4.md): the visible side of desktop QA round 4's findings
// (docs/process/qa-desktop-beta-4.md; its red tests are test/e2e/beta-desktop-qa-4.e2e.js), on the static build (dist/,
// or BETA_QA_DIST=<dist>) served under /melon-seek/ like GitHub Pages:
//   D-52 the Pay estimate for a city keeps the city's one-range postings, and its "Most comparable roles" show the pay
//        it used, named for the place when it is one place's row;
//   D-48 the drawer's rank line says "In the top 1%" / "In the lowest 1%" unless no role pays more / less, on one line
//        at every phone size of test/e2e/phone-sizes.mjs;
//   D-50 a "Pay unclear" posting's estimate stops at the maximum the posting states, its line one line at every size;
//   D-47 a board that isn't on the site, or fails to load, leaves no chart or map of the previous board behind;
//   D-49 Download CSV: what each pay figure is, the card's range, every posted row, and a README per site;
//   UX-51 pay that includes the top shift differential says so on its card ("$18.05–19.70/hour", "up to $19.70/hour",
//        "with top shift pay"), on one line at every phone size (docs/process/ux-review-beta-2.md); MR-35 its tip
//        keeps the stated base pay's cents;
//   UX-50 under Group by Company, the card names the company beside its company-coloured dot.
// Expected figures are worked out in the page from the board's own list (public/api.js getJobs), not by the code
// under test. FQA4_SHOTS=<tag> saves screenshots to docs/screenshots/fix-qa4/<tag>-*.png. Each check skips when the
// build or the board it needs is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { scanText, CAPTION_SEL } from './fix-phone-text.e2e.js';
import { unpackJobs } from '../../public/api.js';

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
        brand: j.brand || j.companyName || null, department: j.department || null,
        locations: (j.locations || []).map((l) => ({ name: l.name || '', rawName: l.rawName || l.name || '', city: l.city || null, country: l.country || null, remote: !!l.remote })),
        salary: j.salary ? {
          min: j.salary.min, max: j.salary.max, currency: j.salary.currency, kind: j.salary.kind || null, termWeeks: j.salary.termWeeks || null, partTime: !!j.salary.partTime,
          originalInterval: j.salary.originalInterval || null, shift: !!j.salary.includesShiftDifferential,
          statedBase: j.salary.statedBase ? { min: j.salary.statedBase.min, currency: j.salary.statedBase.currency || j.salary.currency } : null,
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

/* --------------------------------------------------------------- D-50: the phone sizes' case */

/**
 * The posting the phone sizes check D-50 on, by its property (qa-ci-6): a "Pay unclear" posting whose maximum passed
 * the checks (flagged only below_min or range_ratio, in US dollars a year, as the Anduril test above reads them) and
 * whose estimate the app caps at that maximum. QA round 4 used netflix:790298021069 ($71,040–$464,000, the 2026-10-16
 * crawl). It is gone from the 2026-10-23 crawls, where no beta board has a "Pay unclear" posting with stated pay, so
 * the main site's boards are searched too (beta boards first). Found once per run at desktop width, since an
 * estimate does not depend on the screen; null when no posting has the property.
 */
async function cappedCase(ctx) {
  if (ctx.data.fixQa4D50 !== undefined) return ctx.data.fixQa4D50;
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  const slugsOf = (dir) => (fs.existsSync(path.join(dir, 'api', 'companies.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'api', 'companies.json'), 'utf8')).map((c) => c.slug) : []);
  const main = slugsOf(dist);
  const cands = [];
  // The beta boards (the beta copy also lists the main site's boards), then the main site's.
  for (const [site, slugs] of [['beta', slugsOf(path.join(dist, 'beta')).filter((s) => !main.includes(s))], ['main', main]]) {
    for (const slug of slugs) {
      const file = path.join(dist, site === 'beta' ? 'beta' : '', 'api', 'jobs', `${slug}.json`);
      if (!fs.existsSync(file)) continue;
      const body = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (body.mode !== 'snapshot') continue;
      for (const j of unpackJobs(body)) {
        const raw = j.salaryRaw;
        if (!j.salaryFlag || !raw || raw.currency !== 'USD' || raw.interval !== 'year' || !(raw.max >= 15000)) continue;
        if (!(j.salaryFlag.codes || []).every((c) => c === 'below_min' || c === 'range_ratio')) continue;
        cands.push({ company: slug, site, id: j.id, max: raw.max });
      }
    }
  }
  let found = null;
  if (cands.length) {
    const { st, page } = await open(ctx, null);
    for (const c of cands.slice(0, 12)) {
      await drawer(page, st, c.company, c.id, c.site);
      const amt = (await page.locator('#drawer .d-comp-amt').textContent().catch(() => '')) || '';
      const m = /about \$([\d.]+)([KM])/.exec(amt);
      if (m && Number(m[1]) * (m[2] === 'M' ? 1e6 : 1e3) >= Math.floor(c.max / 1000) * 1000) { found = c; break; }
    }
  }
  ctx.data.fixQa4D50 = found;
  return found;
}

/* --------------------------------------------------------------- D-48: the rank line's roles */

/** Full-time US base pay in US dollars, as the drawer's pool holds it (QA round 4's reading), highest first. */
function rankPool(jobs) {
  const mid = (j) => (j.salary.min + (j.salary.max ?? j.salary.min)) / 2;
  return jobs.filter((j) => j.salary && j.salary.currency === 'USD' && !j.salary.termWeeks && !j.salary.partTime && (j.salary.kind === 'salary' || j.salary.kind === 'hourly')
    && j.seniority !== 'Intern' && j.locations.length && j.locations.every((l) => l.country === 'US')).sort((a, b) => mid(b) - mid(a));
}
const RANK_RE = /^(In the top 1% of|In the lowest 1% of|Pays more than \d+% of) Amazon’s roles( in the US)?$/;

/* --------------------------------------------------------------- UX-51: shift pay on the card */

/** Amazon's shift-pay postings of each shape: a stated base (part-time), one figure (part-time, full-time), a range. */
function shiftPicks(jobs) {
  const sh = jobs.filter((j) => j.salary && j.salary.shift && j.salary.ranges.length < 2 && j.salary.kind !== 'minimum');
  return {
    base: sh.find((j) => j.salary.partTime && j.salary.statedBase && j.salary.statedBase.min < j.salary.max),
    onePart: sh.find((j) => j.salary.partTime && !j.salary.statedBase && j.salary.min === j.salary.max),
    oneFull: sh.find((j) => !j.salary.partTime && !j.salary.statedBase && j.salary.min === j.salary.max),
    range: sh.find((j) => !j.salary.partTime && !j.salary.statedBase && j.salary.min !== j.salary.max),
  };
}
/** "$18.05–19.70/hour" -> [18.05, 19.7]; "up to $21.05/hour" -> [null, 21.05]; "$56–60K" -> [56000, 60000]; "up to $48.9K". */
function pillNumbers(text) {
  const up = /^up to /.test(text || '');
  const m = /\$([\d.,]+)(K|M)?(?:–\$?([\d.,]+)(K|M)?)?/.exec(text || '');
  if (!m) return null;
  const unit = (u) => (u === 'M' ? 1e6 : u === 'K' ? 1e3 : 1);
  const hiU = m[4] || m[2];
  const a = Number(m[1].replace(/,/g, '')) * unit(m[2] || hiU);
  const b = m[3] ? Number(m[3].replace(/,/g, '')) * unit(hiU) : a;
  return up ? [null, a] : [a, b];
}
/**
 * The card of `j` from a search for its title in its own place (Amazon posts the same title for many stores), its pill,
 * the line under it and the pill's tip, each measured. A phone's first screen may be the preview list (data-preview-id).
 */
async function cardPay(page, st, j) {
  const city = j.locations.find((l) => l.city && !l.remote)?.city;
  await go(page, st, `c=amazon&q=${encodeURIComponent(j.title)}${city ? `&l=${encodeURIComponent(city)}` : ''}`);
  const sel = `#resultsList .card[data-id="${j.id}"], #resultsList .card[data-preview-id="${j.id}"]`;
  await page.waitForSelector(sel, { timeout: 30000 }).catch(() => {});
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const one = (e) => {
      if (!e) return null;
      const r = document.createRange(); r.selectNodeContents(e);
      const mids = [];
      for (const x of r.getClientRects()) { if (x.width < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((t) => Math.abs(t - m) < 4)) mids.push(m); }
      const b = e.getBoundingClientRect(), cb = c.getBoundingClientRect();
      return { text: e.textContent.trim(), lines: mids.length, cut: e.scrollWidth > e.clientWidth + 0.5, inside: b.left >= cb.left - 0.5 && b.right <= cb.right + 0.5 };
    };
    const pill = c.querySelector('.sal-pill');
    return { pill: one(pill), sub: one(c.querySelector('.sal-sub')), tip: pill?.title || '', vw: document.documentElement.clientWidth, cardRight: c.getBoundingClientRect().right };
  }, sel);
}
/** What a shift posting's card must say, worked out from the posting (not by the app's code). */
function shiftWant(j) {
  const s = j.salary, hourly = s.partTime && s.originalInterval === 'hour';
  const base = s.statedBase && s.statedBase.currency === s.currency && s.statedBase.min < s.max ? Math.min(s.statedBase.min, s.min) : null;
  const lo = base ?? (s.min === s.max ? null : s.min);
  const f = hourly ? 2080 : 1;
  return { lo: lo == null ? null : lo / f, hi: s.max / f, hourly, base: base != null };
}
function shiftCheck(c, j, where) {
  if (!c) return [`${where}: ${j.id} is not in the first page of its own search`];
  const bad = [];
  const w = shiftWant(j), got = pillNumbers(c.pill?.text);
  const near = (a, b) => (a == null || b == null ? a === b : Math.abs(a - b) <= Math.max(0.006, Math.abs(b) * (w.hourly ? 0.0005 : 0.012)));
  if (!got || !near(got[0], w.lo) || !near(got[1], w.hi)) bad.push(`${j.id}: the pill reads "${c.pill?.text}", want ${w.lo == null ? 'up to ' : `${w.lo}–`}${w.hi}${w.hourly ? '/hour' : ' a year'}${w.base ? ' (from the stated base)' : ''}`);
  if (w.hourly && !/\/hour$/.test(c.pill?.text || '')) bad.push(`${j.id}: "${c.pill?.text}" is not per hour`);
  if (w.lo == null && !/^up to /.test(c.pill?.text || '')) bad.push(`${j.id}: one posted figure that includes the top shift differential reads "${c.pill?.text}", not "up to …"`);
  if (c.sub?.text !== 'with top shift pay') bad.push(`${j.id}: the line under the pill reads "${c.sub?.text ?? ''}", not "with top shift pay"`);
  if (!/highest shift differential/.test(c.tip)) bad.push(`${j.id}: the pill's tip "${c.tip}" does not say it includes the highest shift differential`);
  if (w.base) {
    // MR-35: the stated base keeps its posted cents ("$18.05/hour", never "$18/hour").
    const b = (j.salary.statedBase.min / 2080).toFixed(2).replace(/\.00$/, '');
    if (!c.tip.includes(`Base pay starts at $${b}/hour`)) bad.push(`${j.id}: the tip does not give the stated base as posted ($${b}/hour): "${c.tip}"`);
  }
  for (const [k, e] of [['pill', c.pill], ['line under it', c.sub]]) if (e && (e.lines > 1 || e.cut || !e.inside)) bad.push(`${j.id}: the ${k} "${e.text}" ${e.lines > 1 ? `takes ${e.lines} lines` : e.cut ? 'is cut' : 'runs out of the card'}`);
  return bad;
}

export function registerFixQa4Tests(suite) {
  /* ------------------------------------------------------------- UX-51 */
  suite.test('fix-qa4: [UX-51] Amazon\'s shift pay says so on the card: from the stated base, "up to" one figure, "with top shift pay", the tip; the drawer heading agrees', async (ctx) => {
    const { st, page, errors } = await open(ctx, 'c=amazon');
    const picks = shiftPicks(await board(page, st, 'amazon'));
    if (!picks.base || !picks.onePart) skip('no Amazon shift-pay posting with a stated base, or with one figure');
    const bad = [];
    for (const [k, j] of Object.entries(picks)) {
      if (!j) continue;
      const c = await cardPay(page, st, j);
      bad.push(...shiftCheck(c, j, k));
      if (k === 'base' && c) await shot(page, 'UX-51-amazon-shift-base-card', page.locator(`#resultsList .card[data-id="${j.id}"], #resultsList .card[data-preview-id="${j.id}"]`).first());
      if (!c) continue;
      // The drawer heading reads the same figure, in its own words for the unit (" an hour").
      await drawer(page, st, 'amazon', j.id);
      const amt = (await page.locator('#drawer .d-sal-amt').textContent().catch(() => '')).trim();
      const want = (c.pill.text || '').replace(/\/hour$/, ' an hour');
      if (amt !== want) bad.push(`${j.id}: the drawer heading reads "${amt}", the card "${c.pill.text}"`);
    }
    assert(!bad.length, bad.join('; '));
    assert(!errors.length, errors.join(' | '));
  });

  /* ------------------------------------------------------------- UX-50 */
  suite.test('fix-qa4: [UX-50] under Group by Company, each card names its company first, beside the company-coloured dot (Google)', async (ctx) => {
    const { st, page, errors } = await open(ctx, 'c=google&g=brand');
    const jobs = await board(page, st, 'google');
    if (new Set(jobs.map((j) => j.brand).filter(Boolean)).size < 2) skip('Google names one company today');
    await page.waitForSelector('#resultsList .card[data-id]', { timeout: 30000 });
    const read = () => page.$$eval('#resultsList .card[data-id]', (els) => els.slice(0, 40).map((c) => ({ id: c.dataset.id, dept: c.querySelector('.card-dept')?.textContent || '' })));
    const cards = await read();
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const bad = [];
    for (const c of cards) {
      const j = byId.get(c.id);
      const want = `${j.brand || 'No company'} · ${j.department || 'No department'}`;
      if (c.dept !== want) bad.push(`${c.id}: "${c.dept}", want "${want}"`);
    }
    await shot(page, 'UX-50-google-company-cards', page.locator('#resultsList'));
    // Grouped by department (the default), the card names the department alone, as before.
    await go(page, st, 'c=google');
    await page.waitForSelector('#resultsList .card[data-id]', { timeout: 30000 });
    for (const c of (await read()).slice(0, 10)) { const j = byId.get(c.id); if (c.dept !== (j.department || 'No department')) bad.push(`department grouping, ${c.id}: "${c.dept}"`); }
    assert(cards.length >= 5, `${cards.length} cards`);
    assert(!bad.length, bad.slice(0, 8).join('; '));
    assert(!errors.length, errors.join(' | '));
  });

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
    suite.test(`fix-qa4: [UX-51] ${size.name} ${size.width}x${size.height}: a shift-pay card's pill ("$18.05–19.70/hour") and its line "with top shift pay" fit one line each`, async (ctx) => {
      const { st, page, errors } = await open(ctx, 'c=amazon', { size });
      const { base, onePart } = shiftPicks(await board(page, st, 'amazon'));
      if (!base) skip('no Amazon shift-pay posting with a stated base');
      const bad = [];
      for (const j of [base, onePart].filter(Boolean)) {
        const c = await cardPay(page, st, j);
        bad.push(...shiftCheck(c, j, size.name).filter((m) => !/tip/.test(m)));
        if (c && c.cardRight > c.vw + 0.5) bad.push(`${j.id}: the card runs ${Math.round(c.cardRight - c.vw)} px past the screen`);
        if (j === base && c && (size.width === 280 || size.width === 390) && SHOT_TAG) {
          // The phone list is a bottom sheet: open it, then the card itself, for the picture.
          for (let i = 0; i < 3; i++) {
            const open = await page.evaluate(() => (document.body.dataset.sheet || 'peek') === 'full' || !document.querySelector('#sheetHandle')?.getClientRects().length);
            if (open) break;
            await page.locator('#sheetHandle').click({ timeout: 3000 }).catch(() => {});
            await sleep(500);
          }
          const card = page.locator(`#resultsList .card[data-id="${j.id}"], #resultsList .card[data-preview-id="${j.id}"]`).first();
          await card.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await sleep(300);
          await shot(page, `UX-51-${size.width}x${size.height}`, card);
        }
      }
      assert(!bad.length, `${size.name}: ${bad.join('; ')}`);
      assert(!errors.length, errors.join(' | '));
    });
  }
  for (const size of ALL_SIZES) {
    suite.test(`fix-qa4: [D-50] ${size.name} ${size.width}x${size.height}: a "Pay unclear" posting's estimate stops at the maximum it states, and its line is one line`, async (ctx) => {
      const c = await cappedCase(ctx);
      if (!c) skip('no "Pay unclear" posting in this build whose estimate is capped at the maximum it states');
      const { id, company, site } = c;
      const { st, page, errors } = await open(ctx, `c=${company}`, { size, site });
      const j = (await board(page, st, company, site)).find((x) => x.id === id);
      if (!j || !j.salaryFlag || !j.salaryRaw) skip(`${id} is not a "Pay unclear" posting in this build`);
      await drawer(page, st, company, id, site);
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
      if (!/Similar roles suggest about \$\d+K/.test(det) || !new RegExp(`states up to \\$${Math.round(j.salaryRaw.max / 1000)}K`).test(det)) bad.push(`Details: "${det.slice(0, 200)}"`);
      if (size.width === 280 || size.width === 390 || size.width === 1114) await shot(page, `D-50-${size.width}x${size.height}`, page.locator('#drawer .d-salary'));
      assert(!bad.length, `${size.name}: ${bad.join('; ')}`);
      assert(!errors.length, errors.join(' | '));
    });
  }
}

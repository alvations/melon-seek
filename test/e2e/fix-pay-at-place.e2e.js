// fix-pay-at-place lane e2e checks (docs/process/fix-pay-at-place.md), on the beta copy of the static build (dist/beta/,
// or BETA_QA_DIST=<dist>) served under /melon-seek/ like GitHub Pages, with the 2026-10-16 crawl. Since the salary
// audit, Amazon, Apple and Microsoft postings carry one posted range per place (salary.ranges[].locations). Round-3
// reviewers found views that priced a place at the posting's headline range, another city's row:
//   V-36 Clusters by Location, V-37 Ranges by Location, V-39 the stats line and the map pin, V-40 Compstimate and
//   Insights, UX-37 / M-42 / D-45 the drawer heading, V-35 striped bars, MR-34 the "Several pay ranges" chip, and QA
//   round 3's D-39 ("· N places" counted ranges, Remote rows lost their state) and D-40 (no "Pay by place" for
//   internships); UX-52 (the place count as a muted line under the pill), and every phone size.
// The expected figures are worked out in the page from the board's own list (public/api.js getJobs) by an
// independent reading of the rule, not by the code under test: a place's own row of salary.ranges, else the
// posting's one range when the place is in a country that uses its currency; none for a place listed in no row.
// Each check skips when the build or the board it needs is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'fix-pay-at-place');

// The user, 2026-10-16: "Make sure we check for all phone sizes from iPhone mini to razr to duo or something"
// (test/e2e/phone-sizes.mjs on the branch; used when present, else this copy of its list).
const SIZES_FALLBACK = [
  ['Galaxy Fold (folded)', 280, 653, 3], ['iPhone SE (1st gen)', 320, 568, 2], ['Galaxy Z Fold 5 (cover)', 344, 882, 2.625],
  ['Galaxy S8 / small Android', 360, 740, 4], ['Galaxy Z Flip 5', 360, 880, 3], ['iPhone 13 mini', 375, 812, 3], ['iPhone SE (3rd gen)', 375, 667, 2],
  ['iPhone 15 / 16', 393, 852, 3], ['iPhone 13 / 14', 390, 844, 3], ['Pixel 8', 412, 915, 2.625], ['Motorola razr (inner, open)', 412, 1005, 2.625],
  ['iPhone 15 Pro Max', 430, 932, 3], ['Surface Duo (one screen)', 540, 720, 2.5], ['Galaxy Z Fold 5 (open)', 690, 829, 2.625],
  ['Motorola razr (cover screen)', 352, 355, 3], ['Surface Duo (spanned, two screens)', 1114, 720, 2.5],
].map(([name, width, height, dpr]) => ({ name, width, height, dpr }));
async function phoneSizes() {
  const f = path.join(ROOT, 'test', 'e2e', 'phone-sizes.mjs');
  if (fs.existsSync(f)) {
    try {
      const m = await import(new URL(`file://${f}`).href);
      const all = [...(m.PHONES || []), ...(m.POSTURES || [])].filter((d) => d.width < d.height || /spanned|cover/i.test(d.name));
      if (all.length) return all;
    } catch { /* the fallback list */ }
  }
  return SIZES_FALLBACK;
}

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
  return { origin, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

async function openBeta(ctx, hash, { size = null } = {}) {
  const st = await serveDist();
  if (!st) skip('dist/beta/ not built (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext(size
    ? { viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true, deviceScaleFactor: Math.min(2, size.dpr || 2) }
    : { viewport: DESKTOP, deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${st.beta}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 120000 });
  await sleep(800);
  const company = new URLSearchParams(hash).get('c');
  const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base: st.beta, company });
  if (mode !== 'snapshot') skip(`${company} has no beta snapshot in the build (${mode})`);
  return { page, base: st.beta };
}

/**
 * Installs window.__own in the page: the independent reference. own(job, locs) -> { min, max, mid (approx USD) } or
 * null: the rows of salary.ranges whose locations name one of `locs` (spanned), else, for a posting with no ranges,
 * its headline when a place is in a country whose currency is the pay's; never another place's row.
 */
async function installReference(page, base) {
  await page.evaluate(async ({ base }) => {
    const pal = await import(`${base}/viz/palette.js`);
    const usd = (v, c) => { const r = pal.FX_TO_USD[String(c || 'USD').toUpperCase()]; return r == null ? v : v * r; };
    window.__own = (job, locs) => {
      const s = job.salary;
      if (!s || !locs.length) return null;
      const cur = String(s.currency || 'USD').toUpperCase();
      const rows = (s.ranges || []).filter((r) => r && Number.isFinite(Number(r.min)));
      if (rows.length) {
        const mine = rows.filter((r) => Array.isArray(r.locations) && locs.some((l) => r.locations.includes(l.rawName || l.name)));
        if (!mine.length) return null;
        const c = String(mine[0].currency || cur).toUpperCase();
        const lo = Math.min(...mine.map((r) => Number(r.min))), hi = Math.max(...mine.map((r) => Number(r.max ?? r.min)));
        const mid = lo === s.min && hi === s.max && c === cur ? s.mid : (lo + hi) / 2;
        return { min: usd(lo, c), max: usd(hi, c), mid: usd(mid, c) };
      }
      const home = (l) => (l.country ? pal.COUNTRY_CURRENCY[String(l.country).toUpperCase()] : null);
      // A one-range posting's pay is for the places it was posted for (salary.places, when the posting lists one of
      // them: DQ-27), in its pay line's country (salary.country: VT-5), in a currency that place uses.
      const name = (l) => l.rawName || l.name;
      const posted = Array.isArray(s.places) && job.locations.some((l) => s.places.includes(name(l))) ? new Set(s.places) : null;
      const cc = /^[A-Z]{2}$/i.test(String(s.country || '')) && job.locations.some((l) => l.country === s.country) ? s.country : null;
      const ok = (l) => (!posted || posted.has(name(l))) && (!cc || !l.country || l.country === cc) && (!home(l) || home(l) === cur);
      return locs.some(ok) ? { min: usd(s.min, cur), max: usd(s.max, cur), mid: usd(s.mid ?? (s.min + s.max) / 2, cur) } : null;
    };
    window.__median = (v) => { const s = v.slice().sort((a, b) => a - b); if (!s.length) return null; const p = (s.length - 1) / 2, i = Math.floor(p); return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (p - i) : s[i]; };
    window.__money = pal.formatMoney;
  }, { base });
}

/** Every windowed row of the chart (scrolled through): its aria-label, or a group header's title and median. */
async function allRows(page, sel) {
  return page.evaluate(async (sel) => {
    const host = document.querySelector('#chartHost');
    const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
    const seen = new Map();
    for (let y = 0; y <= parseFloat(body.style.height) + 600; y += 400) {
      if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const r of host.querySelectorAll(sel)) {
        const k = r.style.top + '|' + (r.querySelector('.ms-group__title, .ms-crow__name')?.textContent || r.getAttribute('aria-label') || '');
        if (!seen.has(k)) seen.set(k, { name: (r.querySelector('.ms-group__title, .ms-crow__name')?.firstChild?.textContent || '').trim(), aria: r.getAttribute('aria-label') || '', label: r.querySelector('.ms-crow__label')?.getAttribute('aria-label') || '', median: r.querySelector('.ms-group__median')?.textContent || '' });
      }
    }
    return [...seen.values()];
  }, sel);
}

/** The pay block of the open drawer: heading, the line under it, Pay by place rows, chips and Details. */
async function drawerPay(page) {
  await page.locator('#drawer .d-sal-amt').waitFor({ timeout: 30000 });
  return page.evaluate(() => {
    const d = document.querySelector('#drawer');
    return {
      amt: d.querySelector('.d-sal-amt')?.textContent.trim() || '',
      sub: d.querySelector('.d-sal-amt + .muted')?.textContent.trim() || '',
      places: [...d.querySelectorAll('.d-sal-places .d-tiers li')].map((li) => [...li.children].map((c) => c.textContent.trim())),
      chips: [...d.querySelectorAll('.pay-label')].map((c) => ({ text: c.textContent.trim(), title: c.title || '' })),
      details: [...d.querySelectorAll('.d-pay-note .ms-note__list li')].map((li) => li.textContent.trim()),
      pct: d.querySelector('.d-pct-text')?.textContent.trim() || '',
    };
  });
}

/** The card of `id` in the list (found by searching its title), with its pill, the line under it and its title box. */
async function cardOf(page, id) {
  return page.evaluate((id) => {
    const c = document.querySelector(`#resultsList .card[data-id="${CSS.escape(id)}"]`);
    if (!c) return null;
    const pill = c.querySelector('.sal-pill'), sub = c.querySelector('.sal-sub'), title = c.querySelector('.card-title');
    const r = (e) => (e ? e.getBoundingClientRect().toJSON() : null);
    return { pill: pill?.textContent.trim() || '', sub: sub?.textContent.trim() || '', tip: pill?.title || '', card: r(c), pillBox: r(pill), subBox: r(sub), titleBox: r(title), titleLines: title ? Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight || '20')) : 0 };
  }, id);
}

export function registerFixPayAtPlaceTests(suite) {
  suite.test('fix-pay-at-place: [V-36] Amazon and Microsoft Clusters by Location price each row at its own place', async (ctx) => {
    for (const [company, places] of [['amazon', ['Nashville', 'Jersey City']], ['microsoft', ['Mountain View', 'New York']]]) {
      const { page, base } = await openBeta(ctx, `c=${company}&g=location`);
      await page.waitForSelector('#chartHost .ms-crow', { timeout: 60000 });
      await installReference(page, base);
      const want = await page.evaluate(async ({ base, company, places }) => {
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company })).jobs || [];
        const firstPlace = (j) => (j.locations || []).find((l) => l && !l.remote);
        const out = {};
        for (const p of places) {
          const here = jobs.filter((j) => firstPlace(j)?.city === p);
          const base_ = here.filter((j) => j.salary && j.salary.kind !== 'ote');
          const mids = base_.map((j) => window.__own(j, j.locations.filter((l) => l && !l.remote && l.city === p))).filter(Boolean).map((r) => r.mid);
          const head = base_.map((j) => j.salary.mid);
          out[p] = { n: here.length, median: window.__money(window.__median(mids)), headline: window.__money(window.__median(head)), priced: mids.length };
        }
        return out;
      }, { base, company, places });
      const rows = await allRows(page, '.ms-crow');
      for (const p of places) {
        if (!want[p].n) continue;
        const row = rows.find((r) => r.name === p);
        assert(row, `${company}: a ${p} row (${rows.length} rows)`);
        assert(row.label.includes(`median ${want[p].median}`), `${company} ${p}: "${row.label}" should read median ${want[p].median} (its own range), not the headline ${want[p].headline}`);
      }
    }
  });

  suite.test('fix-pay-at-place: [V-37] Google Ranges by Location: London\'s median is London pay only, never US ranges', async (ctx) => {
    const { page, base } = await openBeta(ctx, 'c=google&v=ranges&g=location');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
    await installReference(page, base);
    const want = await page.evaluate(async ({ base }) => {
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'google' })).jobs || [];
      const out = {};
      for (const p of ['London', 'Zurich']) {
        const here = jobs.filter((j) => j.salary && (j.locations || []).find((l) => l && !l.remote)?.city === p);
        const own = here.map((j) => window.__own(j, j.locations.filter((l) => l && l.city === p))).filter(Boolean);
        out[p] = { n: here.length, priced: own.length, usd: here.filter((j) => j.salary.currency === 'USD').length, median: own.length ? window.__money(window.__median(own.map((r) => r.mid))) : null };
      }
      return out;
    }, { base });
    if (!want.London.n) skip('no Google role listed in London first');
    const heads = await allRows(page, '.ms-group');
    for (const p of ['London', 'Zurich']) {
      const h = heads.find((g) => g.name === p);
      if (!want[p].priced) { assert(!h, `${p}: no group from other countries' pay (${h?.median})`); continue; }
      assert(h, `a ${p} group`);
      assert(h.median.includes(want[p].median), `${p} group "${h.median}" should be its own pay's median ${want[p].median} (${want[p].usd} US-paid roles left out)`);
    }
  });

  suite.test('fix-pay-at-place: [V-39] Microsoft, Location = Mountain View: chart caption = stats line = map pin, at the posted SF Bay Area range', async (ctx) => {
    const hash = 'c=microsoft&l=Mountain%20View';
    const { page, base } = await openBeta(ctx, hash);
    await page.waitForSelector('#chartHost .ms-hist__sub', { timeout: 60000 });
    await installReference(page, base);
    const want = await page.evaluate(async ({ base }) => {
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'microsoft' })).jobs || [];
      // The places the filter takes in: Mountain View, and (I-6) a location with no city in the US or California, a
      // remote one only on a remote-only posting.
      const takes = (j, l) => l && (l.city === 'Mountain View' || (!l.city && l.country === 'US' && (!l.region || l.region === 'CA')
        && (!l.remote || !j.locations.some((x) => x && !x.remote && x.city))));
      const mids = jobs.filter((j) => j.salary && j.salary.kind !== 'ote' && j.locations.some((l) => takes(j, l)))
        .map((j) => window.__own(j, j.locations.filter((l) => takes(j, l)))).filter(Boolean).map((r) => r.mid);
      return window.__money(window.__median(mids));
    }, { base });
    const caption = (await page.locator('#chartHost .ms-hist__sub').innerText()).trim();
    const statsMedian = (await page.locator('#statsLine .stat--median strong').innerText()).trim();
    const { page: mp } = await openBeta(ctx, `${hash}&m=map`);
    await mp.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
    await sleep(1200);
    const pin = await mp.$$eval('#mapHost .ms-pin-icon', (icons) => icons.map((p) => ({ name: p.getAttribute('aria-label') || '', price: p.querySelector('.ms-pin__price')?.textContent || '' })).find((p) => /^Mountain View/.test(p.name)) || null);
    assert(pin, 'a Mountain View pin');
    assertEq(caption, want, 'chart caption: the median of the ranges posted for Mountain View');
    assertEq(statsMedian, want, 'stats line');
    assertEq(pin.price, want, 'map pin');
  });

  suite.test('fix-pay-at-place: [V-40] Compstimate and Insights price New York at New York\'s own ranges (Microsoft, Amazon)', async (ctx) => {
    const { page, base } = await openBeta(ctx, 'c=microsoft&m=insights');
    await installReference(page, base);
    const r = await page.evaluate(async ({ base }) => {
      const cs = await import(`${base}/features/compstimate.js`);
      const out = {};
      for (const company of ['microsoft', 'amazon']) {
        const jobs = (await (await import(`${base}/api.js`)).getJobs({ company })).jobs || [];
        const title = company === 'microsoft' ? 'Software Engineer' : 'Software Development Engineer';
        const est = cs.estimateComp(jobs, { title, location: 'New York' });
        // The same estimate with every comparable at its headline (what the old code did), for the record.
        const ny = jobs.filter((j) => j.salary && j.salary.kind !== 'ote' && j.locations.some((l) => l.city === 'New York'));
        const own = ny.map((j) => window.__own(j, j.locations.filter((l) => l.city === 'New York'))).filter(Boolean).map((x) => x.mid);
        out[company] = { mid: est.mid, low: est.low, high: est.high, n: est.n, nyMedian: window.__money(window.__median(own)), headMedian: window.__money(window.__median(ny.map((j) => j.salary.mid))) };
      }
      return out;
    }, { base });
    assert(r.microsoft.mid >= 195000, `Microsoft Software Engineer in New York: mid ${r.microsoft.mid} (the U.S. range gave $177K; New York's own ranges about $211K)`);
    assert(r.amazon.mid >= 180000, `Amazon SDE in New York: mid ${r.amazon.mid} (the headline rows gave $169K; New York's own about $186K)`);
    // Insights' Hot locations card, as drawn.
    await page.waitForSelector('.msi-rows [aria-label*="median pay"]', { timeout: 60000 });
    const ny = await page.$$eval('.msi-rows [aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')).find((a) => /^New York\b.*median pay/.test(a)) || null);
    if (!ny) skip('New York is not among Microsoft\'s top locations today');
    assert(ny.includes(`median pay ${r.microsoft.nyMedian}`), `Insights: "${ny}" should read ${r.microsoft.nyMedian} (New York's own ranges), not ${r.microsoft.headMedian}`);
  });

  suite.test('fix-pay-at-place: [UX-37, M-42, D-45, UX-52] a range per place: the drawer heading is the card\'s span, the place count a muted line', async (ctx) => {
    const cases = [['amazon', 'amazon:10371179', '$60K–129K', '5 places', 'Bellevue'], ['amazon', 'amazon:10371388', '$148K–220K', '3 places', 'Austin'], ['microsoft', 'microsoft:1970393556650765', '$102K–261K', null, 'Redmond']];
    for (const [company, id, range, count, rankPlace] of cases) {
      const { page } = await openBeta(ctx, `c=${company}&job=${encodeURIComponent(id)}`);
      const d = await drawerPay(page);
      assertEq(d.amt, range, `${id}: the drawer heading is the card's span`);
      assert(/\d+ places/.test(d.sub) && (!count || d.sub.startsWith(count)), `${id}: the line under it counts the places: "${d.sub}"`);
      assert(d.places.length >= 2, `${id}: Pay by place lists each range (${JSON.stringify(d.places)})`);
      assert(d.details.some((t) => t.includes(`posted for ${rankPlace}`)), `${id}: the Details name whose range the rank and strip use (${rankPlace}): ${JSON.stringify(d.details)}`);
      // The card (UX-52: the range alone in the pill, the count under it) is checked at every phone size below.
    }
  });

  suite.test('fix-pay-at-place: [D-39] "· N places" counts distinct places, and each Remote row keeps its state (amazon:10568868, amazon:10420739)', async (ctx) => {
    const { page, base } = await openBeta(ctx, `c=amazon&job=${encodeURIComponent('amazon:10568868')}`);
    const job = await page.evaluate(async ({ base }) => {
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'amazon' })).jobs || [];
      const pick = (id) => { const j = jobs.find((x) => x.id === id); return j ? { ranges: j.salary?.ranges || [], zones: j.salary?.zones } : null; };
      return { ads: pick('amazon:10568868'), seattle: pick('amazon:10420739') };
    }, { base });
    if (!job.ads) skip('amazon:10568868 is not on the board today');
    const d = await drawerPay(page);
    const labels = d.places.map((p) => p[0]);
    assert(labels.every((l) => /^Remote \([A-Z]{2}(, [A-Z]{2})*\)$/.test(l)), `each Remote row names its state(s): ${JSON.stringify(labels)}`);
    const states = labels.flatMap((l) => /\(([^)]*)\)/.exec(l)[1].split(', '));
    assertEq(new Set(states).size, states.length, `one label per state: ${JSON.stringify(labels)}`);
    // The posting's own six rows (its stored pay table: "USA, CA, Virtual Location - California" … "USA, WA, …"), in
    // four distinct ranges (DQ-33: identical figures are one range that lists every place).
    if (job.ads.zones === 4) assertEq(states.slice().sort().join(','), 'CA,IL,NJ,NY,VA,WA', 'every posted row\'s place is listed');
    assertEq(labels.length, job.ads.ranges.length, 'every posted range is listed (none dropped)');
    assertEq(job.ads.ranges.length, job.ads.zones, 'one range per distinct posted row');
    assert(d.sub.startsWith(`${states.length} places`), `the count is the distinct places (${states.length}): "${d.sub}"`);
    if (job.seattle) {
      const { page: p2 } = await openBeta(ctx, `c=amazon&job=${encodeURIComponent('amazon:10420739')}`);
      const s = await drawerPay(p2);
      assert(/^2 ranges/.test(s.sub), `one place with two posted rows says "2 ranges", not "2 places": "${s.sub}"`);
    }
  });

  suite.test('fix-pay-at-place: [D-40] an internship with a range per place shows its span and Pay by place (amazon:10502807)', async (ctx) => {
    const { page } = await openBeta(ctx, `c=amazon&job=${encodeURIComponent('amazon:10502807')}`);
    const d = await drawerPay(page);
    if (!d.amt) skip('amazon:10502807 is not on the board today');
    assertEq(d.amt, '$40K–44K/year', 'the span of its places\' yearly rates');
    assert(d.places.some(([name, pay]) => /Mt Juliet/.test(name) && pay === '$40K/year'), `Mt Juliet's own rate is listed: ${JSON.stringify(d.places)}`);
  });

  suite.test('fix-pay-at-place: [V-35] Amazon Ranges: one place\'s row is never striped, and its tip names the place', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=amazon&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 60000 });
    const striped = await page.$$eval('#chartHost .ms-row__bar--span', (b) => b.length);
    assertEq(striped, 0, 'no Amazon bar is a span of several places\' ranges or levels');
    const legend = await page.$$eval('#chartHost .ms-legend__span', (e) => e.length);
    assertEq(legend, 0, 'so the legend has no striped key');
    const aria = await page.$$eval('#chartHost .ms-row', (rows) => rows.map((r) => r.getAttribute('aria-label') || ''));
    assert(aria.some((a) => /the range posted for /.test(a)), `a bar says which place its range is for: ${aria.slice(0, 3).join(' | ')}`);
    const row = page.locator('#chartHost .ms-row').filter({ has: page.locator('.ms-row__label') }).first();
    const one = await page.$$eval('#chartHost .ms-row', (rows) => rows.findIndex((r) => (r.dataset.n || '1') === '1' && /the range posted for /.test(r.getAttribute('aria-label') || '')));
    if (one >= 0) {
      const r1 = page.locator('#chartHost .ms-row').nth(one);
      await r1.scrollIntoViewIfNeeded();
      await r1.hover();
      await sleep(300);
      const tip = await page.evaluate(() => [...document.querySelectorAll('.ms-viz-tip')].find((t) => !t.hidden)?.textContent || '');
      assert(/Posted for /.test(tip), `the tooltip names the place: "${tip}"`);
    }
    void row;
  });

  suite.test('fix-pay-at-place: [MR-34] "Several pay ranges" says the figure is one of them when it is (microsoft:1970393556619327)', async (ctx) => {
    const { page } = await openBeta(ctx, `c=microsoft&job=${encodeURIComponent('microsoft:1970393556619327')}`);
    const d = await drawerPay(page);
    const chip = d.chips.find((c) => c.text === 'Several pay ranges');
    if (!chip) skip('microsoft:1970393556619327 has no "Several pay ranges" chip today');
    assert(!/span of all of them|lowest to the highest/.test(chip.title), `chip: "${chip.title}"`);
    assert(/one of them/.test(chip.title), `chip: "${chip.title}"`);
  });

  suite.test('fix-pay-at-place: [phones] the pill, its place count and the title fit on every phone size, 280 px to the Duo spanned', async (ctx) => {
    const sizes = await phoneSizes();
    const bad = [];
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const size of sizes) {
      const { page } = await openBeta(ctx, 'c=amazon&q=Senior%20Financial%20Analyst%2C%20Engineering%20Capex', { size });
      await page.waitForSelector('#resultsList .card[data-id]', { timeout: 60000 });
      const c = await cardOf(page, 'amazon:10371179');
      if (!c) { bad.push(`${size.name}: card not listed`); continue; }
      const w = await page.evaluate(() => ({ vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
      // The Razr cover screen (352x355) lays the page out 495 px wide on the base build too: the phone-sizes lane's
      // finding, not this card's. There the card must fit the page; elsewhere the screen.
      const room = w.sw > w.vw + 1 ? w.sw : w.vw;
      if (c.card.right > room + 0.5 || c.card.left < -0.5) bad.push(`${size.name}: the card is wider than the ${room === w.vw ? 'screen' : 'page'}`);
      if (w.sw > w.vw + 1) ctx.notes.push(`fix-pay-at-place phones: ${size.name} scrolls sideways (${w.sw} > ${w.vw}) on the base build too, not from the card`);
      // UX-52: the place count is out of the pill, so the pill is the range alone (it took 154-179 of 366 px).
      if (c.pillBox.width > Math.max(96, 0.4 * c.card.width)) bad.push(`${size.name}: the pill is ${Math.round(c.pillBox.width)} px of a ${Math.round(c.card.width)} px card`);
      if (c.pill !== '$60K–129K') bad.push(`${size.name}: pill "${c.pill}"`);
      if (c.sub !== '5 places') bad.push(`${size.name}: count line "${c.sub}"`);
      if (c.pillBox.right > c.card.right + 0.5 || c.pillBox.left < c.card.left) bad.push(`${size.name}: pill outside the card`);
      if (c.subBox && (c.subBox.right > c.card.right + 0.5)) bad.push(`${size.name}: count outside the card`);
      if (c.titleBox && c.pillBox && c.titleBox.right > c.pillBox.left + 0.5 && c.titleBox.top < c.pillBox.bottom && c.titleBox.bottom > c.pillBox.top) bad.push(`${size.name}: title runs under the pill`);
      if (c.titleLines > (size.width < 330 ? 5 : 4)) bad.push(`${size.name}: title wraps to ${c.titleLines} lines`);
      if (/^(Galaxy Fold|Motorola razr \(cover|iPhone 13 mini$|Surface Duo \(spanned)/.test(size.name)) {
        // The phone list is a bottom sheet: open it, then the card itself.
        for (let i = 0; i < 3; i++) {
          const open = await page.evaluate(() => (document.body.dataset.sheet || 'peek') === 'full' || !document.querySelector('#sheetHandle')?.getClientRects().length);
          if (open) break;
          await page.locator('#sheetHandle').click().catch(() => {});
          await sleep(500);
        }
        const card = page.locator('#resultsList .card[data-id="amazon:10371179"]');
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await card.screenshot({ path: path.join(SHOTS, `e2e-card-${size.width}x${size.height}.png`) }).catch(() => {});
      }
    }
    assert(!bad.length, bad.join('; '));
  });
}

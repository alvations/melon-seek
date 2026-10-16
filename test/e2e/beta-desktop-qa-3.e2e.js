// Beta desktop QA, third pass (docs/process/qa-desktop-beta-3.md, its "Section for docs/QA.md": "Full QA pass
// (desktop, beta) 2026-10-16"). Desktop Chromium at 1440x900 against the static build: the build (BETA_QA_DIST,
// else dist/ from `npm run build`) is served under /melon-seek/ like GitHub Pages, so the tests open
// /melon-seek/beta/ (and /melon-seek/ for the main site).
// Tests tagged "[D-n]" encode an open bug from that report and fail until it is fixed; the rest guard round-3
// behaviour that works today (bundle-only boards, the Amazon first-page preview, viz-even's stacked bands).
// Each [D-n] test reads the build's own data (public/api.js getJobs, as the UI sees it), so it keeps testing
// the same defect when the crawl changes, and passes when the defect is gone from both the data and the screen.
// Every test skips when the build (or the data it needs) is missing. Other hosts are aborted.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const BIG_TECH = ['amazon', 'apple', 'google', 'meta', 'microsoft', 'nvidia', 'netflix'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. `delay(url)` may hold a response (ms). */
async function serveDist({ delay = null } = {}) {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p;
    try { p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length))); } catch { res.writeHead(400); return res.end(); }
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const ms = delay ? delay(u.pathname) : 0;
    if (ms) await sleep(ms);
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { dist, origin, main: `${origin}/melon-seek`, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh desktop context. `hash` opens `<site>/#<hash>` and waits for the results; null opens nothing. */
async function open(ctx, hash = 'c=apple', { site = 'beta', viewport = DESKTOP, delay = null } = {}) {
  const st = await serveDist({ delay });
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext({ viewport, colorScheme: 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  const external = [];
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => { external.push(r.request().url()); return r.abort('blockedbyclient'); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && loc && !loc.startsWith(st.origin)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  if (hash != null) await go(page, st, hash, site);
  return { st, context, page, errors, external };
}
async function go(page, st, hash, site = 'beta') {
  await page.goto(`${site === 'beta' ? st.beta : st.main}/#${hash}`);
  await ready(page);
}
async function ready(page, timeout = 90000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(400);
}
const section = (page, title) => page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: title }) });

/** The app's own jobs for a company (public/api.js getJobs, as the UI sees them), reduced to what the tests read. */
async function appJobs(page, st, company, site = 'beta') {
  return page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const res = await api.getJobs({ company });
    return {
      mode: res.mode,
      jobs: res.jobs.map((j) => ({
        id: j.id, title: j.title, seniority: j.seniority || null, flag: j.salaryFlag || null,
        locations: (j.locations || []).map((l) => l.name || l.rawName || ''),
        salary: j.salary ? {
          min: j.salary.min, max: j.salary.max, currency: j.salary.currency, kind: j.salary.kind || null, text: j.salary.text || '',
          termWeeks: j.salary.termWeeks || null, partTime: !!j.salary.partTime, originalInterval: j.salary.originalInterval || null,
          ranges: Array.isArray(j.salary.ranges) ? j.salary.ranges.map((r) => ({ label: r.label || '', min: r.min, max: r.max, locations: r.locations || [] })) : [],
        } : null,
      })),
    };
  }, { base: site === 'beta' ? st.beta : st.main, company });
}
async function needBoard(page, st, company, site = 'beta') {
  const d = await appJobs(page, st, company, site);
  if (d.mode !== 'snapshot' || !d.jobs.length) skip(`${company} has no snapshot in this build (${d.mode})`);
  return d;
}
async function openDrawer(page, st, company, id) {
  await page.goto(`${st.beta}/#c=${company}&job=${encodeURIComponent(id)}`); await ready(page);
  await page.waitForSelector('#drawer.is-open', { timeout: 20000 }); await sleep(800);
  await page.evaluate(() => document.querySelectorAll('#drawer details').forEach((d) => { d.open = true; })); await sleep(300);
}

/** Every option of the left column's Location filter, fully expanded: [{ label, count, group }]. */
async function locationOptions(page) {
  const sec = section(page, 'Location');
  for (let k = 0; k < 3; k++) {
    const more = sec.locator('.more-btn');
    if (!(await more.count()) || !(await more.first().isVisible()) || !/Show all/.test(await more.first().innerText())) break;
    await more.first().click(); await sleep(300);
  }
  return sec.locator('.checklist').first().evaluate((list) => {
    const out = [];
    let group = '';
    for (const n of list.children) {
      if (n.classList.contains('check-group')) group = n.textContent.trim();
      else if (n.matches('label.check')) out.push({ label: n.querySelector('.check-label').textContent.trim(), count: Number(n.querySelector('.check-count').textContent.replace(/,/g, '')), group });
    }
    return out;
  });
}

export function registerBetaDesktopQa3Tests(suite) {
  // ---------------------------------------------------------------- guards (pass today)
  suite.test('Beta desktop QA 3: the seven big-tech boards come from the bundle only, with a Snapshot badge and no other host', async (ctx) => {
    const { st, page, errors, external } = await open(ctx, 'c=google');
    await needBoard(page, st, 'google');
    for (const c of BIG_TECH) {
      if (c !== 'google') await go(page, st, `c=${c}`);
      const d = await appJobs(page, st, c);
      assertEq(d.mode, 'snapshot', `${c}: data mode`);
      const badge = (await page.locator('#dataBadge').innerText()).replace(/\n/g, ' ');
      assert(/Snapshot/.test(badge) && !/Live/.test(badge), `${c}: badge reads "${badge}"`);
    }
    assert(!external.length, `requests to other hosts: ${external.slice(0, 3).join(', ')}`);
    await page.click('#companyMenuBtn'); await sleep(400);
    const menu = await page.locator('#popover').innerText();
    for (const name of ['Amazon', 'Apple', 'Google', 'Meta', 'Microsoft', 'NVIDIA', 'Netflix']) assert(menu.includes(name), `the company menu lists ${name}`);
    assert(!/Tesla/.test(menu), 'Tesla is not in the menu');
    assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  });

  suite.test('Beta desktop QA 3: Amazon shows real first cards under "Loading 22,179 roles…", then the list keeps them in order', async (ctx) => {
    const { st, page } = await open(ctx, null, { delay: (p) => (/\/beta\/api\/jobs\/amazon\.json$/.test(p) ? 6000 : 0) });
    if (!fs.existsSync(path.join(st.dist, 'beta', 'api', 'preview', 'amazon.json'))) skip('no Amazon preview in this build');
    await page.goto(`${st.beta}/#c=amazon`);
    await page.waitForFunction(() => /Loading [\d,]+ roles/.test(document.querySelector('#resultsTitle')?.textContent || '') && document.querySelectorAll('#resultsList .card[data-preview-id]').length > 5, null, { timeout: 30000 });
    const pv = await page.$$eval('#resultsList .card[data-preview-id]', (cs) => cs.map((c) => c.dataset.previewId));
    await ready(page); await sleep(500);
    await page.evaluate(() => { document.querySelector('#resultsList').scrollTop = 0; }); await sleep(300);
    const full = await page.$$eval('#resultsList .card[data-id]', (cs) => cs.map((c) => c.dataset.id));
    const n = Math.min(pv.length, full.length);
    assert(n >= 20, `preview ${pv.length} cards, list ${full.length}`);
    assertEq(full.slice(0, n).join(','), pv.slice(0, n).join(','), 'the list starts with the preview\'s postings');
  });

  suite.test('Beta desktop QA 3: a Ranges row of identical posted bands (×N) lists exactly its N postings', async (ctx) => {
    const { st, page } = await open(ctx, 'c=microsoft&v=ranges');
    await needBoard(page, st, 'microsoft');
    const row = page.locator('#chartHost .ms-row[aria-label*="roles with the same posted range"]').first();
    if (!(await row.count())) skip('no stacked Ranges row');
    const label = await row.getAttribute('aria-label');
    const k = Number(label.match(/^([\d,]+) roles/)[1].replace(/,/g, ''));
    await row.click(); await sleep(800);
    const n = Number((await page.locator('#resultsTitle').innerText()).replace(/,/g, '').match(/(\d+)\s+role/)[1]);
    assertEq(n, k, `"${label}" lists`);
  });

  // ---------------------------------------------------------------- open bugs (fail until fixed)
  suite.test('Beta desktop QA 3: [D-38] a Google Fellow (the company\'s senior engineering level) is not treated as an intern, and its posted pay is shown', async (ctx) => {
    const { st, page } = await open(ctx, 'c=google');
    const { jobs } = await needBoard(page, st, 'google');
    // "Fellow, <team>" is Google's top individual-contributor title, not a fellowship ("Fellowship", "Fellows Program").
    const fellows = jobs.filter((j) => /^fellow\b/i.test(j.title) && !/fellowship|fellows program|student|graduate|phd/i.test(j.title));
    if (!fellows.length) skip('no Google "Fellow, …" title in this crawl');
    const bad = fellows.filter((j) => j.seniority === 'Intern' || (j.flag && (j.flag.codes || []).includes('junior_high')));
    if (bad.length) {
      const j = bad[0];
      await openDrawer(page, st, 'google', j.id);
      const pay = (await page.locator('#drawer .d-salary').innerText()).replace(/\n+/g, ' / ');
      assert(false, `"${j.title}" (${j.id}): level ${j.seniority}; ${j.flag ? `quarantined: "${j.flag.reason}"` : 'not quarantined'}; the drawer shows "${pay.slice(0, 200)}"`);
    }
  });

  suite.test('Beta desktop QA 3: [D-39] an Amazon card that says "· N places" names N different places, and its Pay by place repeats no name', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const { jobs } = await needBoard(page, st, 'amazon');
    const rep = jobs.filter((j) => j.salary && j.salary.ranges.length > 1 && new Set(j.salary.ranges.map((r) => r.label)).size < j.salary.ranges.length);
    if (!rep.length) return; // no posting gives one place several rows under one name
    // Prefer a remote posting: its rows are per state, and the state is what the reader needs.
    const j = rep.find((x) => x.salary.ranges.every((r) => /^Remote$/.test(r.label))) || rep[0];
    await openDrawer(page, st, 'amazon', j.id);
    const names = await page.locator('#drawer .d-sal-places .d-tier-name').allInnerTexts();
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert(!dup.length, `"${j.title}" (${j.id}): Pay by place lists ${names.map((n) => `"${n}"`).join(', ')}; ${rep.length} Amazon postings have rows that share a place name (posted: ${j.salary.text.slice(0, 80)})`);
  });

  suite.test('Beta desktop QA 3: [D-40] an internship with pay posted per place shows its Pay by place', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const found = [];
    for (const c of BIG_TECH) {
      const { jobs, mode } = await appJobs(page, st, c);
      if (mode !== 'snapshot') continue;
      for (const j of jobs) if (j.salary && (j.salary.termWeeks > 0 || (j.salary.partTime && j.salary.originalInterval === 'hour')) && j.salary.ranges.length > 1 && new Set(j.salary.ranges.map((r) => `${r.min}-${r.max}`)).size > 1) found.push({ c, j });
    }
    if (!found.length) skip('no term or part-time posting with different pay per place in this crawl');
    const { c, j } = found[0];
    await openDrawer(page, st, c, j.id);
    const pay = (await page.locator('#drawer .d-salary').innerText()).replace(/\n+/g, ' / ');
    const rows = j.salary.ranges.map((r) => `${r.label} ${r.min}–${r.max}`).join('; ');
    assert(/Pay by place/.test(pay), `"${j.title}" (${j.id}) posts ${rows}, but the drawer shows only "${pay.slice(0, 140)}"`);
  });

  suite.test('Beta desktop QA 3: [D-41] "St.", "St" and "Saint" are one spelling, and two towns of one name show their states', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const bad = [];
    for (const c of ['amazon', 'google']) {
      if (c !== 'amazon') await go(page, st, `c=${c}`);
      const d = await appJobs(page, st, c);
      if (d.mode !== 'snapshot') continue;
      const opts = await locationOptions(page);
      const by = new Map();
      for (const o of opts) {
        const m = o.label.match(/^(.*?)(?:, ([A-Z]{2}|[A-Z][a-z].*))?$/);
        const base = m[1].toLowerCase().replace(/^(st\.?|saint)\s+/, 'st ');
        const k = `${o.group}|${base}`;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(o);
      }
      for (const v of by.values()) {
        if (v.length < 2 || !v.some((o) => /^(st\.?|saint)\s/i.test(o.label))) continue;
        const bare = v.filter((o) => !/, [A-Z]{2}$/.test(o.label));
        if (bare.length) bad.push(`${c}: ${v.map((o) => `"${o.label}" (${o.count})`).join(' / ')}`);
      }
    }
    assert(!bad.length, `one name, several spellings, no state: ${bad.join('; ')}`);
  });

  suite.test('Beta desktop QA 3: [D-42] a US state-only place is not named like the city beside it ("New York, US" next to "New York")', async (ctx) => {
    const { st, page } = await open(ctx, 'c=nvidia');
    await needBoard(page, st, 'nvidia');
    const opts = await locationOptions(page);
    const labels = new Set(opts.map((o) => o.label));
    const clash = opts.filter((o) => {
      const m = o.label.match(/^(.+), US$/);
      return m && [...labels].some((l) => l !== o.label && (l === m[1] || l.startsWith(`${m[1]}, `)));
    }).map((o) => `"${o.label}" (${o.count}) next to ${[...labels].filter((l) => l !== o.label && (l === o.label.slice(0, -4) || l.startsWith(`${o.label.slice(0, -4)}, `))).map((l) => `"${l}"`).join(', ')}`);
    assert(!clash.length, `state-only places read like the city: ${clash.join('; ')}`);
  });

  suite.test('Beta desktop QA 3: [D-43] the chart names a range end in the millions as the card does ("$1.07M", not "$1.1M")', async (ctx) => {
    const { st, page } = await open(ctx, 'c=netflix&v=ranges');
    const { jobs } = await needBoard(page, st, 'netflix');
    const ends = new Set();
    for (const j of jobs) if (j.salary && j.salary.currency === 'USD') for (const v of [j.salary.min, j.salary.max]) if (v >= 999500 && v < 1e7) ends.add(`$${+(v / 1e6).toFixed(2)}M`);
    if (!ends.size) skip('no Netflix range end in the millions');
    // Every bar in the list (the Ranges list is windowed: scroll it through).
    const labels = new Set();
    const host = page.locator('#chartHost .ms-chart__scroll');
    for (let y = 0, k = 0; k < 40; k++, y += 600) {
      for (const l of await page.$$eval('#chartHost .ms-row', (rs) => rs.map((r) => r.getAttribute('aria-label') || ''))) labels.add(l);
      const more = await host.evaluate((el, top) => { el.scrollTop = top; return el.scrollTop + el.clientHeight < el.scrollHeight; }, y).catch(() => false);
      await sleep(120);
      if (!more) break;
    }
    const bad = [...labels].filter((l) => (l.match(/\$\d+(?:\.\d+)?M/g) || []).some((t) => !ends.has(t)));
    assert(!bad.length, `range ends in the millions the posting doesn't state (card: ${[...ends].join(', ')}): ${bad.slice(0, 3).map((l) => `"${l}"`).join('; ')}`);
  });
}

// Beta desktop QA, second pass (docs/QA.md "Full QA pass (desktop, beta) 2026-10-11",
// docs/process/qa-desktop-beta-2.md). Desktop Chromium at 1440x900 against the static build: the build
// (BETA_QA_DIST, else dist/ from `npm run build`) is served under /melon-seek/ like GitHub Pages, so the
// tests open /melon-seek/beta/ (and /melon-seek/ for the main site).
// Tests tagged "[D-n]" encode an open bug from that report and fail until it is fixed; the rest guard
// fix wave 3 behaviour that works today. Every test skips when the build (or the data it needs) is
// missing. Other hosts are aborted, so the map runs without its basemap ("Basemap unavailable · pins
// still work"), which is the state D-31 needs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const BIG_TECH = ['apple', 'google', 'nvidia', 'microsoft', 'netflix'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. */
async function serveDist() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
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
  return { dist, origin, main: `${origin}/melon-seek`, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh desktop context. `hash` opens `<site>/#<hash>` and waits for the results; null opens nothing. */
async function open(ctx, hash = 'c=apple', { site = 'beta', viewport = DESKTOP } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext({ viewport, colorScheme: 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
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
  return { st, context, page, errors };
}
async function go(page, st, hash, site = 'beta') {
  await page.goto(`${site === 'beta' ? st.beta : st.main}/#${hash}`);
  await ready(page);
}
async function ready(page, timeout = 60000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(400);
}
async function count(page) {
  const m = (await page.locator('#resultsTitle').innerText()).replace(/,/g, '').match(/(\d+)\s+role/);
  assert(m, 'no role count in the results title');
  return Number(m[1]);
}
const section = (page, title) => page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: title }) });

/** The app's own jobs for a company (public/api.js getJobs, as the UI sees them), reduced by `pick`. */
async function appJobs(page, st, company, site = 'beta') {
  return page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const res = await api.getJobs({ company });
    return {
      mode: res.mode,
      fetchedAt: res.fetchedAt,
      jobs: res.jobs.map((j) => ({
        id: j.id, title: j.title, updatedAt: j.updatedAt || null, postedAt: j.postedAt || null, firstSeenAt: j.firstSeenAt || null, ageDays: j.ageDays,
        salary: j.salary ? { text: j.salary.text || '', currency: j.salary.currency, levels: j.salary.levels || null } : null,
      })),
    };
  }, { base: site === 'beta' ? st.beta : st.main, company });
}
async function needBoard(page, st, company, site = 'beta') {
  const d = await appJobs(page, st, company, site);
  if (d.mode !== 'snapshot' || !d.jobs.length) skip(`${company} has no snapshot in this build (${d.mode})`);
  return d;
}

/** The Location filter of the left column, fully expanded: [{ label, count, group }]. */
async function locationOptions(page) {
  const sec = section(page, 'Location');
  const more = sec.locator('.more-btn');
  if (await more.count() && await more.isVisible() && /Show all/.test(await more.innerText())) { await more.click(); await sleep(300); }
  return sec.locator('.checklist').evaluate((list) => {
    const out = [];
    let group = '';
    for (const n of list.children) {
      if (n.classList.contains('check-group')) group = n.textContent.trim();
      else if (n.matches('label.check')) out.push({ label: n.querySelector('.check-label').textContent, count: Number(n.querySelector('.check-count').textContent.replace(/,/g, '')), group });
    }
    return out;
  });
}

/** Map pins: { text, n } with n the postings a pin holds (from its accessible name, else "4.9K jobs"). */
async function mapPins(page) {
  return page.$$eval('#mapHost .leaflet-marker-icon', (ms) => ms.map((m) => {
    const pin = m.querySelector('.ms-pin');
    if (!pin) return null;
    const label = m.getAttribute('aria-label') || '';
    const text = pin.innerText.replace(/\s+/g, ' ').trim();
    let n = null;
    const a = label.replace(/,/g, '').match(/(\d+)\s+(?:postings?|jobs?|roles?)/i);
    if (a) n = Number(a[1]);
    else {
      const t = text.match(/(\d+(?:\.\d+)?)(K?)\s*(?:jobs?)?/);
      if (t) n = Number(t[1]) * (t[2] ? 1000 : 1);
    }
    const r = m.getBoundingClientRect();
    return { text, label, n, x: r.left, y: r.top };
  }).filter(Boolean));
}

export function registerBetaDesktopQa2Tests(suite) {
  // ---------------------------------------------------------------- guards (pass today)
  suite.test('Beta desktop QA 2: fix wave 3 holds on the big-tech boards (Remote Any = Remote + On-site, country search, British spellings)', async (ctx) => {
    const { st, page, errors } = await open(ctx, 'c=google');
    await needBoard(page, st, 'google');
    for (const c of BIG_TECH) {
      if (c !== 'google') await go(page, st, `c=${c}`);
      const seg = await section(page, 'Remote').locator('button').evaluateAll((bs) => bs.map((b) => Number(b.innerText.replace(/[^\d]/g, ''))));
      assertEq(seg.length, 3, `${c}: Remote has Any, Remote and On-site`);
      assertEq(seg[1] + seg[2], seg[0], `${c}: Remote ${seg[1]} + On-site ${seg[2]} = Any ${seg[0]} (BP-17)`);
    }
    await go(page, st, 'c=google');
    const inp = section(page, 'Location').locator('input').first();
    await inp.fill('Ireland'); await sleep(500);
    const shown = await section(page, 'Location').locator('label.check').evaluateAll((ls) => ls.filter((l) => l.offsetParent).map((l) => l.querySelector('.check-label').textContent));
    assert(shown.includes('Dublin'), `Location search "Ireland" on Google lists ${JSON.stringify(shown)} (BP-6)`);
    await go(page, st, 'c=google&q=data%20centre'); const uk = await count(page);
    await go(page, st, 'c=google&q=data%20center'); const us = await count(page);
    assert(uk > 0 && uk === us, `"data centre" ${uk} vs "data center" ${us} (BP-12)`);
    assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  });

  suite.test('Beta desktop QA 2: the Juice waterfall adds up and Monthly is Yearly / 12 on a big-tech role', async (ctx) => {
    const { st, page } = await open(ctx, 'c=microsoft&sort=juice');
    await needBoard(page, st, 'microsoft');
    await page.locator('#resultsList .card[data-id]').first().click();
    await page.waitForSelector('#drawer.is-open'); await sleep(800);
    const juice = page.locator('#drawer .d-juice');
    if (!(await juice.locator('.waterfall').count())) skip('first Microsoft role by Juice has no waterfall');
    await juice.locator('details.juice-details > summary').click(); await sleep(300);
    const num = (s) => { const m = s.replace(/,/g, '').match(/(−|-)?\$(\d+)/); return m ? (m[1] ? -1 : 1) * Number(m[2]) : NaN; };
    const read = async () => juice.locator('.wf-row .wf-value').allInnerTexts();
    const y = (await read()).map(num);
    assertEq(y.length, 5, 'gross, tax, rent, living, left');
    assert(Math.abs(y[0] + y[1] + y[2] + y[3] - y[4]) <= 200, `yearly waterfall ${y.join(' ')} does not add up`);
    await juice.locator('button[data-period="month"]').click(); await sleep(400);
    const m = (await read()).map(num);
    assert(Math.abs(m[0] * 12 - y[0]) <= 0.01 * y[0] + 120, `monthly gross ${m[0]} × 12 vs yearly ${y[0]}`);
  });

  suite.test('Beta desktop QA 2: the map Remote control equals the Remote filter on NVIDIA and Microsoft', async (ctx) => {
    const { st, page } = await open(ctx, 'c=nvidia&m=map');
    await needBoard(page, st, 'nvidia');
    for (const c of ['nvidia', 'microsoft']) {
      if (c !== 'nvidia') await go(page, st, `c=${c}&m=map`);
      await sleep(1200);
      await page.locator('#mapHost button', { hasText: 'Remote' }).first().click(); await sleep(800);
      const fromMap = await count(page);
      await go(page, st, `c=${c}&r=remote`);
      assertEq(fromMap, await count(page), `${c}: map Remote vs the Remote filter`);
    }
  });

  // ---------------------------------------------------------------- open bugs (fail until fixed)
  suite.test('Beta desktop QA 2: [D-31] after a map pin click, no pin swallows the rest of the board (offline basemap)', async (ctx) => {
    const { st, page } = await open(ctx, 'c=apple&m=map');
    const { jobs } = await needBoard(page, st, 'apple');
    await sleep(2000);
    const world = await mapPins(page);
    if (world.length < 3) skip(`only ${world.length} pins at the world view`);
    const worldMax = Math.max(...world.map((p) => p.n || 0));
    // The smallest pin that holds more than one posting (a one-posting pin opens the drawer instead).
    const target = world.filter((p) => p.n > 1).sort((a, b) => a.n - b.n)[0];
    assert(target, 'no pin with more than one posting');
    const pin = page.locator('#mapHost .leaflet-marker-icon').filter({ has: page.locator('.ms-pin') }).nth(world.indexOf(target)).locator('.ms-pin');
    await pin.click(); await sleep(2500);
    const listed = await count(page);
    const after = await mapPins(page);
    const big = after.filter((p) => p.n > worldMax);
    assert(!big.length, `clicked "${target.text}" (the list shows ${listed} roles); the map then shows ${after.length} pin(s), and ${big.map((p) => `"${p.text}"`).join(', ')} hold${big.length === 1 ? 's' : ''} more postings than any pin at the world view (${worldMax}; the board has ${jobs.length}): pins off-screen were merged into it`);
  });

  suite.test('Beta desktop QA 2: [D-32] Apple store and mall names are not listed as places', async (ctx) => {
    const { st, page } = await open(ctx, 'c=apple');
    await needBoard(page, st, 'apple');
    const STORE = /\b(Centre|Center|Mall|Strasse|Straße)$|^(VillageMall|Highcross|Touchwood|Champs[- ]Élysées|Opéra|Parly 2|Sainte-Catherine|Fukuoka Tenjin|Antara)\b/;
    const opts = (await locationOptions(page)).filter((o) => o.group !== 'United States' && STORE.test(o.label));
    assert(!opts.length, `store names in the Location filter: ${opts.map((o) => `${o.group} / ${o.label} (${o.count})`).join(', ')}`);
  });

  suite.test('Beta desktop QA 2: [D-33] one drawer gives one age: "Updated" and "Listed" agree when both are the same day', async (ctx) => {
    const { st, page, context } = await open(ctx, 'c=google');
    const { jobs, fetchedAt } = await needBoard(page, st, 'google');
    const fetched = Date.parse(fetchedAt);
    if (!Number.isFinite(fetched)) skip('no fetchedAt on the Google list');
    const day = 864e5;
    // A posting whose update and listing are the same calendar day, and a time within a day of the crawl
    // at which "Updated N days ago" (counted now) and "Listed M days ago" (counted at the crawl) differ.
    let pick = null;
    for (let h = 1; h < 24 && !pick; h++) {
      const now = fetched + h * 3600e3;
      for (const j of jobs) {
        const listed = j.postedAt || j.firstSeenAt;
        if (!j.updatedAt || !listed || j.ageDays == null) continue;
        if (new Date(j.updatedAt).toISOString().slice(0, 10) !== new Date(listed).toISOString().slice(0, 10)) continue;
        if (Math.floor((now - Date.parse(j.updatedAt)) / day) !== j.ageDays) { pick = { j, now }; break; }
      }
    }
    if (!pick) skip('no Google posting whose two ages can differ');
    await page.clock.setFixedTime(new Date(pick.now));
    await page.goto(`${st.beta}/#c=google&job=${encodeURIComponent(pick.j.id)}`); await ready(page);
    await page.waitForSelector('#drawer.is-open', { timeout: 15000 }); await sleep(800);
    await page.evaluate(() => document.querySelectorAll('#drawer details').forEach((d) => { d.open = true; })); await sleep(500);
    const text = await page.locator('#drawer').innerText();
    const upd = text.match(/Updated (\d+) days? ago/), lst = text.match(/Listed (\d+) days? ago[^\n]*/);
    if (!upd || !lst) skip(`drawer shows ${upd ? '' : 'no "Updated N days ago"'} ${lst ? '' : 'no "Listed N days ago"'}`);
    assertEq(upd[1], lst[1].match(/\d+/)[0], `"${pick.j.title}" at ${new Date(pick.now).toISOString()}: "Updated ${upd[1]} days ago" next to "${lst[0].trim()}"`);
    void context;
  });

  suite.test('Beta desktop QA 2: [D-34] a Microsoft range that names two IC levels shows the pay by level', async (ctx) => {
    const { st, page } = await open(ctx, 'c=microsoft');
    const { jobs } = await needBoard(page, st, 'microsoft');
    const multi = jobs.filter((j) => j.salary && new Set((j.salary.text.match(/\bIC\s?\d\b/g) || []).map((x) => x.replace(/\s/g, ''))).size >= 2);
    if (!multi.length) skip('no Microsoft pay text with two IC levels');
    const job = multi.find((j) => !(j.salary.levels && j.salary.levels.length > 1)) || multi[0];
    await page.goto(`${st.beta}/#c=microsoft&job=${encodeURIComponent(job.id)}`); await ready(page);
    await page.waitForSelector('#drawer.is-open', { timeout: 15000 }); await sleep(800);
    const pay = (await page.locator('#drawer .d-salary').innerText()).replace(/\n+/g, ' / ');
    const without = multi.filter((j) => !(j.salary.levels && j.salary.levels.length > 1)).length;
    assert(/Pay by level/i.test(pay), `"${job.title}" (${job.salary.text.slice(0, 120)}) shows "${pay.slice(0, 160)}"; ${without} of ${multi.length} such Microsoft postings have no level breakdown`);
  });

  suite.test('Beta desktop QA 2: [D-35] a beta board linked on the main site points to the beta site', async (ctx) => {
    const { st, page } = await open(ctx, null);
    await page.goto(`${st.main}/#c=apple`);
    await page.waitForFunction(() => /isn’t on this site|isn't on this site|Couldn’t load|No roles/i.test(document.querySelector('#main')?.innerText || ''), null, { timeout: 30000 });
    await sleep(500);
    const text = (await page.locator('#main').innerText()).replace(/\n+/g, ' | ');
    const hrefs = await page.$$eval('#main a[href]', (a) => a.map((x) => x.href));
    const toBeta = hrefs.some((h) => { try { return new URL(h).pathname.startsWith('/melon-seek/beta/'); } catch { return false; } });
    assert(toBeta, `main site #c=apple says "${(text.match(/This board[^|]*\|[^|]*/) || [text.slice(0, 160)])[0].trim()}" with no link to /melon-seek/beta/, where Apple is listed`);
  });

  suite.test('Beta desktop QA 2: [D-36] Google lists one place under one Location label (no "Moncks Corner, US" next to "Moncks Corner, SC")', async (ctx) => {
    const { st, page } = await open(ctx, 'c=google');
    await needBoard(page, st, 'google');
    const opts = (await locationOptions(page)).filter((o) => o.group === 'United States');
    const byCity = new Map();
    for (const o of opts) {
      const m = o.label.match(/^(.+), ([A-Z]{2})$/);
      if (!m) continue;
      const city = m[1].replace(/ Creek$/, '');
      if (!byCity.has(city)) byCity.set(city, []);
      byCity.get(city).push(`${o.label} (${o.count})`);
    }
    // A city with a "<City>, US" label (no state) next to a "<City>, <state>" label is one place split in two.
    const split = [...byCity.values()].filter((v) => v.length > 1 && v.some((x) => /, US \(/.test(x)));
    assert(!split.length, `one place under several labels: ${split.map((v) => v.join(' + ')).join('; ')}`);
  });

  suite.test('Beta desktop QA 2: [D-37] the beta methodology and share pages say they are beta', async (ctx) => {
    const { st } = await open(ctx, null);
    const bad = [];
    for (const p of ['methodology/', 'c/apple/', 'c/google/']) {
      const r = await fetch(`${st.beta}/${p}`);
      if (r.status !== 200) { bad.push(`/beta/${p}: ${r.status}`); continue; }
      const html = await r.text();
      const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      if (!/beta/i.test(title) && !/<html[^>]*data-channel="beta"/.test(html)) bad.push(`/beta/${p}: title "${title}", no beta channel mark`);
    }
    assert(!bad.length, bad.join('; '));
  });
}

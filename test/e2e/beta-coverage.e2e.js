// Test-suite QA for the beta site (docs/process/qa-suite-beta.md, 2026-10-23): the features of /melon-seek/beta/ that
// no other group covered on the big-tech boards, found by the coverage map in that log. Each test checks behaviour
// against numbers computed from the build's own lists (public/api.js getJobs, the jobs the page shows, and
// viz/palette.js toUSD, the page's own conversion), never a count pinned to one crawl.
//   - every beta board (from the registry, so a board added later is covered) is in the build, and its count on
//     screen equals its list and its CSV: a board the build dropped fails here instead of skipping everywhere [T-5];
//   - Apply on every board, Amazon and Meta included, goes to the posting on that company's own host [T-1];
//   - per board: the pay filter (minimum, maximum, "only with pay") [T-2], the Listed filter and the Juice grades
//     [T-16], and every sort (Highest pay, Lowest pay, Most juice, Title A–Z) [T-3];
//   - search lists title matches first on the big boards [T-6];
//   - a deep link survives a reload, and Back / Forward walk the filter history, on Amazon [T-7];
//   - at every size in phone-sizes.mjs, the phone flow a job seeker uses: the list opens full, a tapped card opens
//     its job page, the Back button and the browser's Back close it, and a tapped filter row gives "Show N roles"
//     equal to its own count and to the list it shows [T-8]. One board per size, in turn, so all seven boards are
//     covered on phones without loading each board at every size (the runtime finding, T-11).
// Serves the build (E2E_DIST, else BETA_QA_DIST, else dist/) under /melon-seek/ with one server for the file (gzip
// cached once per file). Skips without a beta build. Other hosts are aborted.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { COMPANIES } from '../../server/companies.js';

const DESKTOP = { width: 1440, height: 900 };
/** The boards the beta site shows: the registry's non-paused beta companies. */
const BETA = COMPANIES.filter((c) => c.channel === 'beta' && !c.paused);
const MAIN_BOARD = 'anduril';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

let shared = null;
/** One server for the file. Bodies are read and gzipped once (Amazon's list is 6.8 MB; gzipping it per load costs CPU). */
async function serveDist() {
  if (shared) return shared;
  const dist = path.resolve(process.env.E2E_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const cache = new Map();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(u.pathname.slice('/melon-seek/'.length)); } catch { res.writeHead(400); return res.end(); }
    let p = path.join(dist, rel);
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(p)] || 'application/octet-stream';
    let e = cache.get(p);
    if (!e) {
      const body = fs.readFileSync(p);
      e = { body, gz: /text|javascript|json|svg|csv/.test(type) && body.length > 1024 ? zlib.gzipSync(body) : null };
      cache.set(p, e);
    }
    const gz = e.gz && /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'content-type': type, ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gz ? e.gz : e.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  shared = { dist, origin, beta: `${origin}/melon-seek/beta`, main: `${origin}/melon-seek` };
  return shared;
}

/** A fresh context: `device` (a phone-sizes.mjs entry) or a desktop viewport. `hash` opens `<site>/#<hash>`. */
async function open(ctx, { device = null, viewport = DESKTOP, hash = null, site = 'beta' } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or E2E_DIST=<dir>)');
  const engine = ctx.browser.browserType?.().name?.() || 'chromium';
  const opts = device ? contextFor(device, engine) : { viewport, deviceScaleFactor: 1 };
  const context = await ctx.browser.newContext({ ...opts, colorScheme: 'light' });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  const external = [];
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => { external.push(r.request().url()); return r.abort('blockedbyclient'); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e && e.message || e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && (!loc || !loc.startsWith(st.origin))) return;
    errors.push(`console.error: ${m.text().slice(0, 300)}`);
  });
  const base = (s = site) => (s === 'beta' ? st.beta : st.main);
  if (hash != null) await go(page, `${base()}/#${hash}`);
  return { st, context, page, errors, external, base };
}
/** Load a URL and wait for the whole list (not Amazon's first-page preview). */
async function go(page, url) {
  await page.goto(url, { timeout: 60000 });
  await ready(page);
}
async function ready(page, timeout = 90000) {
  await page.waitForFunction(() => {
    const t = document.querySelector('#resultsTitle');
    return t && !/Loading/.test(t.textContent) && /\d\s+role|No roles/.test(t.textContent.replace(/,/g, ''))
      && (document.querySelector('#resultsList .card[data-id]') || /\b0 roles|No roles/.test(t.textContent));
  }, null, { timeout });
  await sleep(300);
}
/**
 * Change the hash in place (the board stays loaded) and wait for the list to follow: for the count or the first card
 * to change (at most `wait` ms: a sort that keeps the first card, or a filter that keeps the count, changes neither),
 * then for two frames and the list.
 */
async function hashTo(page, h, wait = 4000) {
  const before = await page.evaluate(() => document.querySelector('#resultsTitle')?.textContent + '|' + document.querySelector('#resultsList .card[data-id]')?.dataset.id);
  await page.evaluate((x) => { location.hash = x; }, h);
  await page.waitForFunction((b) => document.querySelector('#resultsTitle')?.textContent + '|' + document.querySelector('#resultsList .card[data-id]')?.dataset.id !== b, before, { timeout: wait, polling: 50 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
  await ready(page);
}
async function count(page) {
  const m = (await page.locator('#resultsTitle').innerText()).replace(/,/g, '').match(/(\d+)\s+role/);
  if (!m && /No roles/.test(await page.locator('#resultsTitle').innerText())) return 0;
  assert(m, `no role count in the results title ("${await page.locator('#resultsTitle').innerText()}")`);
  return Number(m[1]);
}
const params = async (page) => new URLSearchParams(await page.evaluate(() => location.hash.slice(1)));
const cardIds = (page, n = 30) => page.$$eval('#resultsList .card[data-id]', (els, k) => els.slice(0, k).map((e) => e.dataset.id), n);

/**
 * In the page: the board's jobs as the app gets them, with the approx-USD pay the page filters and sorts on
 * (public/app.js prepare(): min ??= max, max ??= min, mid ??= (min + max) / 2, each through toUSD). Returns a summary,
 * not 22,179 jobs. `ids` asks for those jobs' pay and titles.
 */
function boardFacts(page, base, company, ids = []) {
  return page.evaluate(async ({ base, company, ids }) => {
    // One getJobs per board and page (Amazon's list is 22,179 postings): kept on the window for the next call.
    window.__bcJobs ??= {};
    const key = `${base}|${company}`;
    if (!window.__bcJobs[key]) {
      const api = await import(`${base}/api.js`);
      window.__bcJobs[key] = await api.getJobs({ company });
    }
    const { toUSD } = await import(`${base}/viz/palette.js`);
    const res = window.__bcJobs[key];
    const usd = (j) => {
      const s = j.salary;
      if (!s || (s.min == null && s.max == null)) return null;
      const min = s.min ?? s.max, max = s.max ?? s.min, mid = s.mid ?? (min + max) / 2;
      const u = { min: toUSD(min, s.currency), max: toUSD(max, s.currency), mid: toUSD(mid, s.currency) };
      return Number.isFinite(u.min) && Number.isFinite(u.max) ? u : null;
    };
    // Listing age as prepare() reads it: ageDays when the list has it, else days since updatedAt.
    const now = Date.now();
    const age = (j) => ('ageDays' in j ? (Number.isFinite(j.ageDays) ? j.ageDays : null) : (Date.parse(j.updatedAt || '') ? Math.max(0, Math.floor((now - Date.parse(j.updatedAt)) / 864e5)) : null));
    // BN-6 (fix-app-6): a posted minimum ("from €31,100") states no top, so a pay floor never hides it.
    const jobs = res.jobs.map((j) => ({ id: j.id, url: j.url || null, team: j.team || '', title: j.title, usd: usd(j), age: age(j), minimum: j.salary?.kind === 'minimum' }));
    const paid = jobs.filter((j) => j.usd);
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const want = new Set(ids);
    return {
      mode: res.mode, n: jobs.length, paid: paid.length,
      medMax: med(paid.map((j) => j.usd.max)), medMin: med(paid.map((j) => j.usd.min)),
      maxMid: paid.length ? Math.max(...paid.map((j) => j.usd.mid)) : null,
      minMid: paid.length ? Math.min(...paid.map((j) => j.usd.mid)) : null,
      maxes: paid.map((j) => j.usd.max), mins: paid.map((j) => j.usd.min), minimums: paid.map((j) => j.minimum),
      ages: jobs.map((j) => j.age),
      pick: jobs.filter((j) => want.has(j.id)),
      sampleIds: [jobs[0], jobs[Math.floor(jobs.length / 2)], jobs[jobs.length - 1]].filter(Boolean).map((j) => j.id),
      urls: Object.fromEntries([jobs[0], jobs[Math.floor(jobs.length / 2)], jobs[jobs.length - 1]].filter(Boolean).map((j) => [j.id, j.url])),
    };
  }, { base, company, ids });
}
async function needBoard(page, base, slug) {
  const f = await boardFacts(page, base, slug);
  assert(f.mode === 'snapshot' || f.mode === 'cache', `${slug}: the build serves it as "${f.mode}", not its snapshot`);
  assert(f.n > 0, `${slug}: no postings in the build`);
  return f;
}
/** Records in a CSV, counting quoted newlines as part of their field (RFC 4180). */
function csvRecords(text) {
  let n = 0, q = false, any = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') q = !q;
    else if (c === '\n' && !q) { if (any) n++; any = false; continue; }
    if (c !== '\r') any = true;
  }
  return n + (any ? 1 : 0);
}
const roundTo = (x, step) => Math.round(x / step) * step;
const allowedHosts = (c) => new Set([...(c.postingHosts || []), ...(c.postingPrefixes || []).map((p) => new URL(p).hostname)].map((h) => h.replace(/^www\./, '')));

/** A real tap at an element's centre (phones), a click elsewhere. */
async function tap(page, locator, { dx = null } = {}) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const b = await locator.boundingBox();
  assert(b, 'nothing to tap (no box)');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const x = b.x + (dx == null ? b.width / 2 : Math.min(dx, b.width - 2)), y = b.y + b.height / 2;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}

export function registerBetaCoverageTests(suite) {
  /* ------------------------------------------------------------------ the build and every board */

  suite.test(`Beta coverage: the build has every beta board (${BETA.map((c) => c.name).join(', ')}) and Anduril on the main site; each one's count on screen equals its list and its CSV`, async (ctx) => {
    const { st, page, errors, external, base } = await open(ctx);
    const missing = BETA.filter((c) => !fs.existsSync(path.join(st.dist, 'beta', 'api', 'jobs', `${c.slug}.json`))).map((c) => c.slug);
    assertEq(missing.join(', '), '', 'beta boards the build does not publish (their tests would only skip)');
    const bad = [];
    let betaExternal = 0;
    for (const [site, slug] of [...BETA.map((c) => ['beta', c.slug]), ['main', MAIN_BOARD]]) {
      if (site === 'main') betaExternal = external.length; // the main site's boards are live: the browser asks Greenhouse
      await go(page, `${base(site)}/#c=${slug}`);
      const f = await needBoard(page, base(site), slug);
      const shown = await count(page);
      if (shown !== f.n) bad.push(`${site} ${slug}: the page says ${shown} roles, the list has ${f.n}`);
      const csv = await page.evaluate(async (u) => { const r = await fetch(u); return r.ok ? r.text() : null; }, `${base(site)}/data/${slug}.csv`);
      if (csv == null) bad.push(`${site} ${slug}: no CSV`);
      else if (csvRecords(csv) !== f.n + 1) bad.push(`${site} ${slug}: the CSV has ${csvRecords(csv) - 1} rows for ${f.n} roles`);
    }
    assertEq(bad.length, 0, bad.join('; '));
    assertEq(betaExternal, 0, `the beta boards asked other hosts: ${external.slice(0, 3).join(', ')}`);
    assertEq(errors.length, 0, errors.slice(0, 3).join(' | '));
  });

  suite.test('Beta coverage: Apply on every big-tech board (Amazon and Meta too) opens the posting on that company\'s own careers host, in a new tab', async (ctx) => {
    const { page, base } = await open(ctx, { hash: `c=${BETA[0].slug}` });
    const bad = [];
    let checked = 0;
    for (const c of BETA) {
      const f = await needBoard(page, base(), c.slug);
      const hosts = allowedHosts(c);
      for (const id of f.sampleIds) {
        await go(page, `${base()}/#c=${c.slug}&job=${encodeURIComponent(id)}`);
        await page.waitForSelector('#drawer.is-open #drawerTitle', { timeout: 20000 });
        const a = await page.evaluate(() => {
          const x = document.querySelector('#drawer a.apply');
          return x ? { href: x.getAttribute('href'), target: x.getAttribute('target'), rel: x.getAttribute('rel') || '', host: x.querySelector('.apply-host')?.textContent || '' } : null;
        });
        if (!f.urls[id]) { if (a) bad.push(`${c.slug} ${id}: an Apply link for a posting with no link`); continue; }
        if (!a) { bad.push(`${c.slug} ${id}: no Apply link (the posting links to ${f.urls[id]})`); continue; }
        checked++;
        const host = new URL(a.href).hostname.replace(/^www\./, '');
        if (!hosts.has(host)) bad.push(`${c.slug} ${id}: Apply goes to ${host}, not ${[...hosts].join(' or ')}`);
        if (a.href !== f.urls[id]) bad.push(`${c.slug} ${id}: Apply is ${a.href}, the posting is ${f.urls[id]}`);
        if (a.target !== '_blank' || !/noopener/.test(a.rel)) bad.push(`${c.slug} ${id}: Apply target "${a.target}" rel "${a.rel}"`);
        if (a.host !== host) bad.push(`${c.slug} ${id}: the host under Apply reads "${a.host}", the link goes to ${host}`);
      }
    }
    assert(checked >= BETA.length, `only ${checked} Apply links checked`);
    assertEq(bad.length, 0, bad.join('; '));
  });

  /* ------------------------------------------------------------------ filters, sorts, search */

  /** The pay filter: minimum, maximum and "only with pay", against each posting's approx-USD pay. */
  async function payFilter(page, base, c, f, bad) {
    if (f.paid < 20) { bad.push(`only ${f.paid} roles with pay`); return; }
    const lo = roundTo(f.medMax, 10000), hi = roundTo(f.medMin, 10000);
    const wantMin = f.maxes.filter((x, i) => x >= lo || f.minimums[i]).length;
    const wantMax = f.mins.filter((x) => x <= hi).length;
    await hashTo(page, `c=${c.slug}&smin=${lo}`);
    let got = await count(page);
    if (got !== wantMin) bad.push(`pay at least $${lo}: ${got} roles shown, ${wantMin} have a top approx-USD pay that high or are a posted minimum`);
    const ids = await cardIds(page, 40);
    const g = await boardFacts(page, base, c.slug, ids);
    for (const j of g.pick) if (!j.usd || (j.usd.max < lo && !j.minimum)) bad.push(`${j.id} is listed under "at least $${lo}" with ${j.usd ? `$${Math.round(j.usd.max)} at most` : 'no pay'}`);
    await hashTo(page, `c=${c.slug}&smax=${hi}`);
    got = await count(page);
    if (got !== wantMax) bad.push(`pay up to $${hi}: ${got} roles shown, ${wantMax} have a lowest approx-USD pay that low`);
    await hashTo(page, `c=${c.slug}&so=1`);
    got = await count(page);
    if (got !== f.paid) bad.push(`only roles with pay: ${got} shown, ${f.paid} have pay`);
    await hashTo(page, `c=${c.slug}`);
    if ((await count(page)) !== f.n) bad.push(`clearing the pay filter shows ${await count(page)} of ${f.n}`);
  }
  /** Listed (past 7, 30 and 90 days; hide 180+) against each posting's age; each Juice grade against its own count. */
  async function listedAndJuice(page, c, f, bad) {
    const known = f.ages.filter((a) => a != null).length;
    if (!known) bad.push('no posting has a listing date: the Listed filter is unchecked');
    for (const p of known ? [7, 30, 90] : []) {
      await hashTo(page, `c=${c.slug}&p=${p}`);
      const want = f.ages.filter((a) => a != null && a <= p).length;
      const got = await count(page);
      if (got !== want) bad.push(`listed in the past ${p} days: ${got} shown, ${want} postings are that young`);
    }
    if (known) {
      await hashTo(page, `c=${c.slug}&ho=1`);
      const want = f.ages.filter((a) => a == null || a < 180).length;
      const got = await count(page);
      if (got !== want) bad.push(`hide 180+ days: ${got} shown, ${want} postings are younger (or undated)`);
    }
    await hashTo(page, `c=${c.slug}`);
    // The Juice grades live in the "More" popover (its quick chip), not in the filter column.
    await page.locator('#quickChips [data-pop=more]').click();
    await page.waitForSelector('#popover .kw--juice', { timeout: 10000 }).catch(() => {});
    const g = await page.evaluate(() => ({
      grades: Object.fromEntries([...document.querySelectorAll('#popover .kw--juice')].map((b) => [b.firstChild.textContent, Number(b.querySelector('.kw-count').textContent.replace(/,/g, ''))])),
      note: [...document.querySelectorAll('#popover .fnote')].map((n) => n.textContent).find((t) => /Juice Score/.test(t)) || '',
    }));
    await page.keyboard.press('Escape');
    await sleep(300);
    if (Object.keys(g.grades).length !== 3) { bad.push(`Juice grade buttons ${JSON.stringify(g.grades)}`); return; }
    const scored = Number((g.note.replace(/,/g, '').match(/(\d+) of \d+ have a Juice Score/) || [])[1] ?? NaN);
    const sum = Object.values(g.grades).reduce((a, b) => a + b, 0);
    if (Number.isFinite(scored) && sum !== scored) bad.push(`the grades count ${sum} roles, the note says ${scored} have a Juice Score`);
    for (const [grade, n] of Object.entries(g.grades)) {
      await hashTo(page, `c=${c.slug}&jg=${grade}`);
      const got = await count(page);
      if (got !== n) bad.push(`Juice ${grade} counts ${n}, the list shows ${got}`);
    }
    await hashTo(page, `c=${c.slug}`);
  }
  /** Every sort: Highest and Lowest pay by approx-USD mid (no pay last), Most juice by the cards' scores, Title A–Z. */
  async function sorts(page, base, c, f, bad) {
    for (const sort of ['salary-asc', 'salary-desc']) {
      await hashTo(page, `c=${c.slug}&sort=${sort}`, 2000);
      const ids = await cardIds(page, 30);
      const g = await boardFacts(page, base, c.slug, ids);
      const by = new Map(g.pick.map((j) => [j.id, j]));
      const mids = ids.map((id) => by.get(id)?.usd?.mid ?? null);
      const extreme = sort === 'salary-desc' ? f.maxMid : f.minMid;
      if (mids[0] == null || Math.abs(mids[0] - extreme) > 1) bad.push(`${sort}: the first role pays $${Math.round(mids[0])} (mid), the board's ${sort === 'salary-desc' ? 'highest' : 'lowest'} is $${Math.round(extreme)}`);
      for (let i = 1; i < mids.length; i++) {
        const a = mids[i - 1], b = mids[i];
        if (a == null && b != null) { bad.push(`${sort}: a role with no pay (#${i}) before one with pay (#${i + 1})`); break; }
        if (a != null && b != null && (sort === 'salary-desc' ? b > a + 0.5 : b < a - 0.5)) { bad.push(`${sort}: #${i} $${Math.round(a)} then #${i + 1} $${Math.round(b)} (${ids[i - 1]}, ${ids[i]})`); break; }
      }
    }
    // Most juice: the cards' own scores (the badge reads "🍉 <score> · <grade>"), highest first, unscored last.
    await hashTo(page, `c=${c.slug}&sort=juice`, 2000);
    const scores = await page.$$eval('#resultsList .card[data-id]', (e) => e.slice(0, 30).map((x) => {
      const m = /🍉\s*(\d+)/.exec(x.querySelector('.juice-badge')?.textContent || '');
      return m ? Number(m[1]) : null;
    }));
    for (let i = 1; i < scores.length; i++) {
      const a = scores[i - 1], b = scores[i];
      if ((a == null && b != null) || (a != null && b != null && b > a)) { bad.push(`juice: #${i} scores ${a}, #${i + 1} scores ${b}`); break; }
    }
    if (scores[0] == null && (await page.$$eval('.juice-badge', (e) => e.length)) > 0) bad.push('juice: the first card has no Juice Score');
    await hashTo(page, `c=${c.slug}&sort=title`, 2000);
    const titles = await page.$$eval('#resultsList .card[data-id] .card-title', (e) => e.slice(0, 30).map((x) => x.textContent));
    const sorted = await page.evaluate((t) => t.slice().sort((a, b) => a.localeCompare(b)), titles);
    if (JSON.stringify(titles) !== JSON.stringify(sorted)) bad.push(`title: "${titles.find((t, i) => t !== sorted[i])}" is out of order`);
  }

  for (const c of BETA) {
    suite.test(`Beta coverage: [${c.slug}] the pay filter (minimum, maximum, only with pay), the Listed filter and the Juice grades give exactly the roles the data says, and every sort (Highest pay, Lowest pay, Most juice, Title A–Z) orders the list by it`, async (ctx) => {
      const { page, errors, base } = await open(ctx, { hash: `c=${c.slug}` });
      const f = await needBoard(page, base(), c.slug);
      const bad = [];
      await payFilter(page, base(), c, f, bad);
      await listedAndJuice(page, c, f, bad);
      await sorts(page, base(), c, f, bad);
      assertEq(bad.length, 0, bad.slice(0, 12).join('; '));
      assertEq(errors.length, 0, errors.slice(0, 3).join(' | '));
    });
  }

  suite.test('Beta coverage: a search lists the roles whose title (or team) has the word before the roles that match it elsewhere (Amazon, Apple, Google)', async (ctx) => {
    const { page, errors, base } = await open(ctx, { hash: 'c=amazon' });
    const bad = [];
    let tried = 0;
    for (const slug of ['amazon', 'apple', 'google']) {
      await go(page, `${base()}/#c=${slug}`);
      await needBoard(page, base(), slug);
      // A word some titles have and many other roles match elsewhere (department, team, place, keywords).
      for (const word of ['security', 'hardware', 'cloud', 'design', 'data', 'machine', 'operations', 'finance']) {
        await hashTo(page, `c=${slug}&q=${word}`);
        const n = await count(page);
        if (n < 10) continue;
        const ids = await cardIds(page, 60);
        const g = await boardFacts(page, base(), slug, ids);
        const by = new Map(g.pick.map((j) => [j.id, j]));
        const shownTitles = await page.$$eval('#resultsList .card[data-id] .card-title', (e) => e.slice(0, 60).map((x) => x.textContent));
        const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${word}`, 'iu');
        const strong = ids.map((id, i) => re.test(`${shownTitles[i] || ''} ${by.get(id)?.title || ''} ${by.get(id)?.team || ''}`));
        if (!strong.some(Boolean) || strong.every(Boolean)) continue; // need both kinds on the first page to test the order
        tried++;
        const firstWeak = strong.indexOf(false);
        const late = strong.findIndex((s, i) => s && i > firstWeak);
        if (late >= 0) bad.push(`${slug} "${word}": #${late + 1} "${shownTitles[late]}" has the word in its title but comes after #${firstWeak + 1} "${shownTitles[firstWeak]}", which does not`);
        break;
      }
    }
    assert(tried >= 2, `the order was checked on ${tried} boards only (no word gave both kinds of match)`);
    assertEq(bad.length, 0, bad.join('; '));
    assertEq(errors.length, 0, errors.slice(0, 3).join(' | '));
  });

  suite.test('Beta coverage: on Amazon a deep link with filters, sort and view survives a reload, and Back / Forward walk the filter history', async (ctx) => {
    const { page, errors, base } = await open(ctx, { hash: 'c=amazon' });
    await needBoard(page, base(), 'amazon');
    const total = await count(page);
    // A department through the real checkbox (a history entry), then a sort through the real select.
    const dep = page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: 'Department' }) }).locator('label.check').first();
    const want = Number((await dep.locator('.check-count').innerText()).replace(/,/g, ''));
    await dep.click();
    await page.waitForFunction((n) => !document.querySelector('#resultsTitle')?.textContent.replace(/,/g, '').includes(`${n} role`), total, { timeout: 15000 });
    await ready(page);
    assertEq(await count(page), want, 'a Department row gives its own count');
    await page.selectOption('#sortBy', 'salary-asc');
    await page.click('.topbar .seg [data-mode="insights"]').catch(() => {});
    await sleep(800);
    await page.click('.topbar .seg [data-mode="chart"]');
    await page.click('#vizControls [data-view="ranges"]').catch(() => {});
    await sleep(800);
    const h1 = await params(page);
    const first1 = (await cardIds(page, 1))[0];
    assert(h1.get('d') && h1.get('sort') === 'salary-asc', `the hash keeps the filter and the sort: ${h1}`);
    await page.reload();
    await ready(page);
    const h2 = await params(page);
    for (const k of ['c', 'd', 'sort', 'v', 'm']) assertEq(h2.get(k), h1.get(k), `after a reload, ${k}`);
    assertEq(await count(page), want, 'after a reload, the count');
    assertEq((await cardIds(page, 1))[0], first1, 'after a reload, the first role');
    // Back from the filtered list to the whole board, Forward to the filter again.
    let backs = 0;
    while (backs < 8 && (await params(page)).get('d')) { await page.goBack(); await sleep(700); backs++; }
    assert(!(await params(page)).get('d'), `Back ${backs} times never left the Department filter`);
    await ready(page);
    assertEq(await count(page), total, 'Back to the unfiltered board');
    await page.goForward(); await sleep(700); await ready(page);
    let fwd = 1;
    while (fwd < 8 && !(await params(page)).get('d')) { await page.goForward(); await sleep(700); fwd++; }
    assert((await params(page)).get('d') === h1.get('d'), 'Forward brings the Department filter back');
    await ready(page);
    assertEq(await count(page), want, 'Forward to the filtered count');
    assertEq(errors.length, 0, errors.slice(0, 3).join(' | '));
  });

  /* ------------------------------------------------------------------ phones: every size */

  ALL_SIZES.forEach((d, i) => {
    const board = BETA[i % BETA.length];
    suite.test(`Beta coverage: [${d.name} ${d.width}x${d.height}] ${board.slug}: the list opens full, a tapped card opens its job page, the Back button and the browser's Back close it, and a tapped filter row's "Show N roles" equals its count and the list`, async (ctx) => {
      const { page, errors, base } = await open(ctx, { device: d, hash: `c=${board.slug}` });
      const f = await needBoard(page, base(), board.slug);
      const bad = [];
      const fit = await page.evaluate(() => ({ w: innerWidth, sw: screen.width, scrollW: document.documentElement.scrollWidth, phone: getComputedStyle(document.querySelector('#results')).position === 'fixed' }));
      if (fit.scrollW > fit.w + 1 || fit.w > fit.sw + 1) bad.push(`the page is ${fit.scrollW} px wide in a ${fit.w} px layout on a ${fit.sw} px screen`);
      // The results sheet (phone layouts): the handle opens it to full.
      if (fit.phone) {
        for (let k = 0; k < 3 && (await page.evaluate(() => document.body.dataset.sheet)) !== 'full'; k++) { await tap(page, page.locator('#sheetHandle')); await sleep(600); }
        const s = await page.evaluate(() => document.body.dataset.sheet);
        if (s !== 'full') bad.push(`three taps on the sheet handle leave the list at "${s}"`);
      }
      // A tapped card opens its job page; the Back button closes it.
      const card = page.locator('#resultsList .card[data-id]').first();
      const cardTitle = (await card.locator('.card-title').innerText()).trim();
      await tap(page, card.locator('.card-title'));
      const opened = await page.waitForSelector('#drawer.is-open #drawerTitle', { timeout: 15000 }).then(() => true, () => false);
      if (!opened) bad.push('a tap on the first card did not open its job page');
      else {
        await sleep(500);
        const t = (await page.locator('#drawerTitle').innerText()).trim();
        if (t !== cardTitle) bad.push(`the job page is "${t}", the tapped card "${cardTitle}"`);
        if (!(await params(page)).get('job')) bad.push('the open job is not in the address (no Back to the list)');
        await tap(page, page.locator('#drawerClose'));
        const closed = await page.waitForFunction(() => !document.querySelector('#drawer.is-open'), null, { timeout: 5000 }).then(() => true, () => false);
        if (!closed) bad.push('the job page\'s Back button did not close it');
        if ((await params(page)).get('job')) bad.push('after Back the address still names the job');
        await sleep(700); // the job page slides out (0.22 s) and focus returns to the card, as a person would wait
      }
      // The browser's Back closes a job page too, and stays on the board.
      const second = page.locator('#resultsList .card[data-id]').nth(1);
      if (await second.count()) {
        await tap(page, second.locator('.card-title'));
        if (await page.waitForSelector('#drawer.is-open', { timeout: 15000 }).then(() => true, () => false)) {
          await sleep(400);
          await page.goBack();
          const closed = await page.waitForFunction(() => !document.querySelector('#drawer.is-open'), null, { timeout: 5000 }).then(() => true, () => false);
          if (!closed) bad.push('the browser\'s Back did not close the job page');
          const h = await params(page);
          if (h.get('c') !== board.slug) bad.push(`the browser's Back left the board (hash "${h}")`);
          await sleep(700); // the job page slides out before the next tap (on a wide touch screen it covers Filters' tap)
        } else bad.push('a tap on the second card did not open its job page');
      }
      // Filters: a tapped Seniority row (every board has one) gives "Show N roles" = its count, then that list. The full
      // results sheet covers the top bar's Filters chip, so the list goes back down first, as a person would do it.
      if (fit.phone) {
        for (let k = 0; k < 3 && !['peek', 'half'].includes(await page.evaluate(() => document.body.dataset.sheet)); k++) { await tap(page, page.locator('#sheetHandle')); await sleep(600); }
      }
      await tap(page, page.locator('#filtersToggle'));
      await page.waitForSelector('#filterBody details.fsec', { timeout: 5000 }).catch(() => {});
      await sleep(400);
      // The phone's filter sheet is built when it opens, and a section's rows when that section opens.
      await page.evaluate(() => { for (const x of document.querySelectorAll('#filterBody details.fsec')) if (/Seniority/.test(x.querySelector('summary')?.textContent || '')) x.open = true; });
      await sleep(500);
      const row = page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: 'Seniority' }) }).locator('label.check').first();
      if (!(await row.count())) bad.push(`the filter sheet has no Seniority row (sections: ${await page.$$eval('#filterBody details.fsec summary', (e) => e.map((x) => x.textContent.trim()).join(', '))})`);
      else {
        const want = Number((await row.locator('.check-count').innerText()).replace(/,/g, ''));
        await tap(page, row, { dx: 40 });
        await sleep(900);
        const done = page.locator('#filtersDone');
        if (await done.isVisible().catch(() => false)) {
          const label = (await done.innerText()).replace(/,/g, '');
          const n = Number(label.match(/(\d+)/)?.[1]);
          if (n !== want) bad.push(`"${label.trim()}" after the row that counts ${want}`);
          await tap(page, done);
          await sleep(900);
        }
        await ready(page);
        const shown = await count(page);
        if (shown !== want) bad.push(`the list shows ${shown} roles after the Seniority row that counts ${want}`);
        if (want >= f.n) bad.push(`the Seniority row counts ${want} of ${f.n}: it narrowed nothing`);
      }
      assertEq(bad.length, 0, bad.join('; '));
      assertEq(errors.length, 0, errors.slice(0, 3).join(' | '));
    });
  });
}

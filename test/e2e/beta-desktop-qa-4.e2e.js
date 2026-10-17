// Beta desktop QA, fourth pass (docs/process/qa-desktop-beta-4.md, its "Section for docs/QA.md": "Full QA pass
// (desktop, beta) 2026-10-17"). Desktop Chromium against the static build: the build (BETA_QA_DIST, else dist/ from
// `npm run build`) is served under /melon-seek/ like GitHub Pages, so the tests open /melon-seek/beta/.
// Tests tagged "[D-n]" encode an open bug from that report and fail until it is fixed; the rest guard fix wave 5
// behaviour that works today (one span on the card and in the drawer, Pay by place for an internship, the
// preview card that opens its job at once, the inert side sheet at 1024 px).
// Each [D-n] test reads the build's own data (public/api.js getJobs, as the UI sees it), so it keeps testing the
// same defect when the crawl changes, and passes when the defect is gone from both the data and the screen.
// Every test skips when the build (or the data it needs) is missing. Other hosts are aborted.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };

/** Serve the build (BETA_QA_DIST or ROOT/dist) under /melon-seek/; null without a beta build. `status(url)` may fail a file. */
async function serveDist({ delay = null, status = null } = {}) {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p;
    try { p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length))); } catch { res.writeHead(400); return res.end(); }
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    const code = status ? status(u.pathname) : 0;
    if (code) { res.writeHead(code); return res.end('x'); }
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
async function open(ctx, hash = 'c=apple', { site = 'beta', viewport = DESKTOP, delay = null, status = null } = {}) {
  const st = await serveDist({ delay, status });
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
    if (/Failed to load resource/.test(m.text())) return;
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

/** The app's own jobs for a company (public/api.js getJobs, as the UI sees them), reduced to what the tests read. */
async function appJobs(page, st, company, site = 'beta') {
  return page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const res = await api.getJobs({ company });
    return {
      mode: res.mode,
      jobs: res.jobs.map((j) => ({
        id: j.id, title: j.title, seniority: j.seniority || null, remote: !!j.remote,
        locations: (j.locations || []).map((l) => ({ name: l.name || l.rawName || '', country: l.country || null })),
        salary: j.salary ? {
          min: j.salary.min, max: j.salary.max, currency: j.salary.currency, kind: j.salary.kind || null,
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
/** "$60K–129K" or "$152K–237K" -> [60000, 129000] (K and M ends; the first end takes the second's unit when bare). */
function parseRange(text) {
  const m = /\$([\d.]+)([KM]?)(?:\s*[–-]\s*\$?([\d.]+)([KM]?))?/.exec(text || '');
  if (!m) return null;
  const unit = (u) => (u === 'M' ? 1e6 : u === 'K' ? 1e3 : 1);
  const hiU = m[4] || m[2];
  const lo = Number(m[1]) * unit(m[2] || hiU);
  return [lo, m[3] ? Number(m[3]) * unit(hiU) : lo];
}

export function registerBetaDesktopQa4Tests(suite) {
  // ---------------------------------------------------------------- guards (pass today)
  suite.test('Beta desktop QA 4: a posting with pay per place shows one span on its card and as its drawer headline, with the place count under it', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const { jobs } = await needBoard(page, st, 'amazon');
    const j = jobs.find((x) => x.salary && x.salary.ranges.length >= 3 && x.salary.ranges.every((r) => r.locations.length) && !x.salary.termWeeks && !x.salary.partTime && x.salary.kind !== 'minimum');
    if (!j) skip('no Amazon posting with three place rows');
    await go(page, st, `c=amazon&q=${encodeURIComponent(j.title)}`);
    const card = page.locator(`#resultsList .card[data-id="${j.id}"]`);
    if (!(await card.count())) skip(`"${j.title}" is not in the first page of its own search`);
    const pill = (await card.locator('.sal-pill').innerText()).trim();
    await card.click();
    await page.waitForSelector('#drawer.is-open', { timeout: 20000 }); await sleep(800);
    const amt = (await page.locator('#drawer .d-sal-amt').innerText()).trim();
    assertEq(amt, pill.split('\n')[0].trim(), `"${j.title}" (${j.id}): the drawer headline vs the card`);
    const top = await page.locator('#drawer .d-salary').innerText();
    assert(/\d+ (places|ranges)/.test(top) && /Pay by place/.test(top), `the pay block names the count and lists Pay by place: "${top.slice(0, 160)}"`);
  });

  suite.test('Beta desktop QA 4: at 1024 px the closed filter sheet is inert, and Tab never lands off screen', async (ctx) => {
    const { page } = await open(ctx, 'c=amazon', { viewport: { width: 1024, height: 768 } });
    const inert = await page.$eval('#filters', (f) => f.inert);
    assert(inert, 'the closed filter sheet is inert');
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const x = await page.evaluate(() => { const r = document.activeElement?.getBoundingClientRect(); return r ? r.right : 1; });
      assert(x > 0, `Tab ${i + 1} moved focus off screen (right edge at ${x}px)`);
    }
  });

  // Lead decision (2026-10-16, re-stated for D-46 on 2026-10-17): the card and the drawer headline present every posted
  // row ("we must present them as they are and not cut anything"), including a row tied to no place the posting lists;
  // only the pricing of a place (payAt) leaves such a row out. This guard keeps that: the rows are listed and counted.
  suite.test('Beta desktop QA 4: a pay row tied to no listed place is still listed under Pay by place and inside the card\'s range (lead decision 2026-10-16)', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const found = [];
    for (const c of ['amazon', 'apple', 'microsoft']) {
      const { jobs, mode } = await appJobs(page, st, c);
      if (mode !== 'snapshot') continue;
      for (const j of jobs) {
        const s = j.salary;
        if (!s || s.ranges.length < 2 || s.kind === 'minimum' || s.termWeeks || s.partTime || j.remote) continue;
        if (j.locations.some((l) => /remote/i.test(l.name))) continue;
        const own = s.ranges.filter((r) => r.locations.length), none = s.ranges.filter((r) => !r.locations.length);
        if (own.length && none.length && none.every((r) => r.label)) found.push({ c, j, none });
      }
    }
    if (!found.length) skip('no posting has a pay row tied to no listed place today');
    const { c, j, none } = found.find((f) => f.c === 'amazon' && f.none.length >= 2) || found[0];
    await go(page, st, `c=${c}&q=${encodeURIComponent(j.title)}`);
    const card = page.locator(`#resultsList .card[data-id="${j.id}"]`);
    if (!(await card.count())) skip(`"${j.title}" is not in the first page of its own search`);
    const pill = (await card.locator('.sal-pill').innerText()).replace(/\n+/g, ' ').trim();
    const shown = parseRange(pill);
    const s = j.salary;
    const alo = Math.min(s.min, ...s.ranges.map((r) => +r.min)), ahi = Math.max(s.max, ...s.ranges.map((r) => +(r.max ?? r.min)));
    const near = (a, b) => Math.abs(a - b) <= Math.max(1000, b * 0.01);
    assert(shown && near(shown[0], alo) && near(shown[1], ahi), `${j.id}: the card reads "${pill}", not the span of every posted row ($${Math.round(alo / 1000)}K–${Math.round(ahi / 1000)}K)`);
    await card.click();
    await page.waitForSelector('#drawer.is-open', { timeout: 20000 }); await sleep(800);
    const names = await page.locator('#drawer .d-sal-places .d-tier-name').allInnerTexts();
    const missing = none.filter((r) => !names.some((n) => n.includes(r.label)));
    assert(!missing.length, `${j.id}: Pay by place lists ${names.map((n) => `"${n}"`).join(', ')}, without the posted row(s) ${missing.map((r) => `"${r.label}"`).join(', ')}`);
  });

  // ---------------------------------------------------------------- open bugs (fail until fixed)
  suite.test('Beta desktop QA 4: [D-47] after switching to a board that is not on the site, or fails to load, the previous board\'s chart is not left behind the message', async (ctx) => {
    const { st, page } = await open(ctx, 'c=netflix', { status: (p) => (/\/beta\/api\/jobs\/apple\.json$/.test(p) ? 500 : 0) });
    await needBoard(page, st, 'netflix');
    await page.waitForSelector('#chartHost .ms-crow', { timeout: 30000 });
    const left = async () => page.evaluate(() => {
      const host = document.querySelector('#chartHost');
      if (host.hidden || host.inert || host.getAttribute('aria-hidden') === 'true') return [];
      return [...host.querySelectorAll('.ms-crow')].map((r) => r.getAttribute('aria-label') || '').slice(0, 2);
    });
    const bad = [];
    await page.goto(`${st.beta}/#c=tesla`); await sleep(2500);
    let rows = await left();
    if (rows.length) bad.push(`#c=tesla ("This board isn’t on this site") still draws Netflix's chart: ${rows.map((r) => `"${r}"`).join(', ')}`);
    await go(page, st, 'c=google');
    await page.goto(`${st.beta}/#c=apple`); await sleep(4000);
    rows = await left();
    if (rows.length) bad.push(`Apple ("Couldn’t load this board") still draws Google's chart: ${rows.map((r) => `"${r}"`).join(', ')}`);
    assert(!bad.length, bad.join('; '));
  });

  suite.test('Beta desktop QA 4: [D-48] the drawer says "The highest pay" or "The lowest pay" only when no role on the board pays more or less', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const { jobs } = await needBoard(page, st, 'amazon');
    // Full-time US base pay in US dollars, as the drawer's pool (likePool, payPool) would hold.
    const mid = (j) => (j.salary.min + (j.salary.max ?? j.salary.min)) / 2;
    const pool = jobs.filter((j) => j.salary && j.salary.currency === 'USD' && !j.salary.termWeeks && !j.salary.partTime && (j.salary.kind === 'salary' || j.salary.kind === 'hourly')
      && j.seniority !== 'Intern' && j.locations.length && j.locations.every((l) => l.country === 'US')).sort((a, b) => mid(b) - mid(a));
    if (pool.length < 2000) skip(`only ${pool.length} full-time US postings with pay`);
    const bad = [];
    for (const [k, j, word] of [[30, pool[30], 'highest'], [30, pool[pool.length - 31], 'lowest']]) {
      const more = pool.filter((x) => (word === 'highest' ? mid(x) > mid(j) : mid(x) < mid(j))).length;
      await page.goto(`${st.beta}/#c=amazon&job=${encodeURIComponent(j.id)}`); await ready(page);
      await page.waitForSelector('#drawer.is-open', { timeout: 20000 }); await sleep(900);
      const line = (await page.locator('#drawer .d-pct-text, #drawer .d-pct').first().innerText().catch(() => '')).trim();
      if (new RegExp(`The ${word} pay`).test(line)) bad.push(`${j.id} "${j.title}" ($${Math.round(j.salary.min / 1000)}K–${Math.round(j.salary.max / 1000)}K) reads "${line}", but ${more} full-time US roles at Amazon pay ${word === 'highest' ? 'more' : 'less'} (it is #${k + 1} from the ${word === 'highest' ? 'top' : 'bottom'})`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('Beta desktop QA 4: [D-49] Download CSV says what each pay figure is (a minimum, on-target earnings, one place\'s row), and its README names the big-tech sources', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const amazon = await needBoard(page, st, 'amazon');
    const nvidia = await appJobs(page, st, 'nvidia');
    /** RFC 4180 rows of a served CSV, as { header, rows: Map(id -> cells) }. */
    const csv = async (slug) => {
      const res = await page.request.get(`${st.beta}/data/${slug}.csv`);
      assertEq(res.status(), 200, `${slug}.csv`);
      const text = await res.text();
      const out = []; let row = [], f = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); out.push(row); row = []; f = ''; } else if (ch !== '\r') f += ch;
      }
      return { header: out[0], rows: new Map(out.slice(1).map((r) => [r[0], r])) };
    };
    const bad = [];
    const readme = await (await page.request.get(`${st.beta}/data/README.txt`)).text();
    if (/own job board\s*\(Greenhouse, Ashby or Lever\)/.test(readme)) bad.push('the README says every row comes from a board "(Greenhouse, Ashby or Lever)", but the beta CSVs hold Amazon, Apple, Google, Meta, Microsoft, NVIDIA and Netflix from their own careers sites');
    const a = await csv('amazon');
    const says = (cells, re) => cells.some((c, i) => i > 2 && re.test(c));
    const min = amazon.jobs.find((j) => j.salary && j.salary.kind === 'minimum');
    if (min && a.rows.has(min.id) && !says(a.rows.get(min.id), /minimum/i)) bad.push(`${min.id} "${min.title}" is a posted minimum ("from …" on the card), but its CSV row is salary_min ${a.rows.get(min.id)[7]}, salary_max ${a.rows.get(min.id)[8]} with nothing saying so (columns: ${a.header.join(', ')})`);
    const span = (s) => [Math.min(s.min, ...s.ranges.map((r) => +r.min)), Math.max(s.max, ...s.ranges.map((r) => +(r.max ?? r.min)))];
    const place = amazon.jobs.find((j) => j.salary && j.salary.ranges.length >= 3 && j.salary.ranges.every((r) => r.locations.length) && j.salary.kind === 'salary' && (span(j.salary)[0] < j.salary.min || span(j.salary)[1] > j.salary.max));
    if (place && a.rows.has(place.id)) {
      const r = a.rows.get(place.id), [lo, hi] = span(place.salary);
      const named = place.salary.ranges.some((x) => says(r.slice(7), new RegExp(x.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
      if (!(Number(r[7]) === lo && Number(r[8]) === hi) && !named) bad.push(`${place.id} "${place.title}" shows ${place.salary.ranges.length} places' ranges ($${Math.round(lo / 1000)}K–${Math.round(hi / 1000)}K on the card), but its CSV row is ${r[7]}–${r[8]}, one place's row, unnamed`);
    }
    if (nvidia.mode === 'snapshot') {
      const n = await csv('nvidia');
      const ote = nvidia.jobs.find((j) => j.salary && j.salary.kind === 'ote');
      if (ote && n.rows.has(ote.id) && !says(n.rows.get(ote.id), /on-target|\bote\b|commission/i)) bad.push(`${ote.id} "${ote.title}" is on-target earnings (base plus commission), but its CSV row reads as base pay (${n.rows.get(ote.id)[7]}–${n.rows.get(ote.id)[8]}; the README: "posted BASE pay range … Equity and bonus excluded")`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('Beta desktop QA 4: [D-50] a "Pay unclear" posting\'s estimate does not run past the maximum the posting itself states', async (ctx) => {
    const { st, page } = await open(ctx, 'c=netflix');
    const flagged = [];
    for (const [c, site] of [['amazon', 'beta'], ['apple', 'beta'], ['google', 'beta'], ['meta', 'beta'], ['microsoft', 'beta'], ['nvidia', 'beta'], ['netflix', 'beta'], ['anduril', 'main']]) {
      const ids = await page.evaluate(async ({ base, c }) => {
        const api = await import(`${base}/api.js`);
        const res = await api.getJobs({ company: c });
        return res.mode === 'snapshot' ? res.jobs.filter((j) => j.salaryFlag).map((j) => j.id) : [];
      }, { base: site === 'beta' ? st.beta : st.main, c });
      for (const id of ids) flagged.push({ c, site, id });
    }
    if (!flagged.length) skip('no "Pay unclear" posting in this build');
    const bad = [];
    for (const { c, site, id } of flagged) {
      await page.goto(`${site === 'beta' ? st.beta : st.main}/#c=${c}&job=${encodeURIComponent(id)}`); await ready(page);
      await page.waitForSelector('#drawer.is-open', { timeout: 20000 }); await sleep(900);
      await page.evaluate(() => document.querySelectorAll('#drawer details').forEach((d) => { d.open = true; })); await sleep(200);
      const pay = (await page.locator('#drawer .d-salary').innerText()).replace(/\n+/g, ' ');
      const parsed = /As parsed:[^\d]*([\d,.]+)\s*[-–]\s*\$?([\d,.]+)/.exec(pay);
      const est = /about \$([\d.]+)([KM])/.exec(pay);
      if (!parsed || !est) continue;
      const max = Number(parsed[2].replace(/,/g, ''));
      const v = Number(est[1]) * (est[2] === 'M' ? 1e6 : 1e3);
      if (max >= 15000 && v > max + 999) bad.push(`${id}: "As parsed: ${parsed[1]} – ${parsed[2]}", yet "about $${est[1]}${est[2]}"`);
    }
    assert(!bad.length, `the estimate shown in place of a posting's unclear pay is above the posting's own maximum: ${bad.join('; ')}`);
  });
}

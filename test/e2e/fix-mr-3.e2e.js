// fix-mr-3 (fix wave 5, 2026-10-23; docs/process/fix-mr-3.md): the methodology and data fixes, checked on the built site.
// Chromium against the static build (BETA_QA_DIST, else dist/ from `npm run build`), served under /melon-seek/ like GitHub
// Pages; other hosts are aborted. Each test finds its case in the build's own data (public/api.js getJobs, as the UI sees
// it), so it keeps testing the same rule on a new crawl, and skips when the case is gone. Tests are tagged with the
// finding they encode (docs/process/methodology-review-beta-2.md); each failed on 05263e8 with the 2026-10-16 crawl.
// "[phone]" measures every line this lane added or changed at every entry of test/e2e/phone-sizes.mjs with
// fix-phone-text's own scanner (scanText): one line, or two below 360 px (its linesAt rule), at most 12 words, never cut.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { scanText, CAPTION_SEL } from './fix-phone-text.e2e.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const linesAt = (width) => (width < 360 ? 2 : 1); // fix-phone-text's rule

let shared = null;
/** Serve the build under /melon-seek/ (gzip, like Pages); null without a beta build. One server for the whole file. */
async function serveDist() {
  if (shared) return shared;
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p;
    try { p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length))); } catch { res.writeHead(400); return res.end(); }
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(p)] || 'application/octet-stream';
    const body = fs.readFileSync(p);
    const gz = /text|javascript|json|svg|csv/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '') && body.length > 1024;
    res.writeHead(200, { 'content-type': type, ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gz ? zlib.gzipSync(body) : body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  shared = { origin, dist, beta: `${origin}/melon-seek/beta`, main: `${origin}/melon-seek` };
  return shared;
}

/** A fresh page on the beta site; `device` is a phone-sizes.mjs entry, else a 1440 desktop. */
async function open(ctx, { device = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  const engine = ctx.browser.browserType?.().name() || 'chromium';
  const context = await ctx.browser.newContext(device ? { ...contextFor(device, engine), colorScheme: 'light' } : { viewport: DESKTOP, colorScheme: 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { st, page, errors };
}
const ready = (page) => page.waitForFunction(() => {
  const t = document.querySelector('#resultsTitle');
  return t && !/Loading/.test(t.textContent) && /\d/.test(t.textContent) && document.querySelector('#resultsList .card[data-id]');
}, null, { timeout: 120000 });
/** Load the board (a full page load). */
async function board(page, st, hash) {
  await page.goto('about:blank');
  await page.goto(`${st.beta}/#${hash}`);
  await ready(page);
  await sleep(600);
}
/** Open a job on the loaded board (a hash change: the list stays loaded), every fold and Details open. */
async function job(page, slug, id, title) {
  await page.evaluate((h) => { location.hash = h; }, `c=${slug}&job=${encodeURIComponent(id)}`);
  await page.waitForFunction((t) => document.querySelector('#drawer.is-open #drawerTitle')?.textContent.trim() === t, title, { timeout: 30000 });
  await sleep(700);
  await page.evaluate(() => { for (const d of document.querySelectorAll('#drawer details')) d.open = true; });
  await sleep(300);
}
const text = (page, sel) => page.locator(sel).first().evaluate((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => null);

/** The app's own jobs for a board (getJobs, Juice attached), reduced in the page by `pick` (a function source). */
async function appJobs(page, st, company, pick) {
  const r = await page.evaluate(`(async () => {
    const api = await import(${JSON.stringify(`${st.beta}/api.js`)});
    const shared = await import(${JSON.stringify(`${st.beta}/features/shared.js`)});
    const palette = await import(${JSON.stringify(`${st.beta}/viz/palette.js`)});
    const res = await api.getJobs({ company: ${JSON.stringify(company)} });
    const pick = ${pick};
    return { mode: res.mode, jobs: res.jobs.map((j) => pick(j, shared, palette)).filter(Boolean) };
  })()`);
  if (r.mode !== 'snapshot') skip(`${company} has no snapshot in this build (${r.mode})`);
  return r.jobs;
}

/* ---------------------------------------------------------------- the cases, found in the build's data */

// An internship paid by the month with no stated length (MR-38), in US dollars.
const UNSTATED_MONTH = `(j, sh) => sh.isTermUnstated(j) && j.salary.originalInterval === 'month' && j.salary.currency === 'USD' && !(j.salary.ranges && j.salary.ranges.length > 1)
  ? { id: j.id, title: j.title, min: j.salary.min, max: j.salary.max, juice: !!(j.juice && j.juice.best) } : null`;
// One paid by the hour (MR-38).
const UNSTATED_HOUR = `(j, sh) => sh.isTermUnstated(j) && j.salary.originalInterval === 'hour' && !(j.salary.ranges && j.salary.ranges.length > 1)
  ? { id: j.id, title: j.title, min: j.salary.min, max: j.salary.max, cur: j.salary.currency } : null`;
// Fixed-term pay in another currency, per month (MR-33): a term of known or unstated length.
const FOREIGN_MONTH_TERM = `(j, sh, pal) => j.salary && j.salary.currency !== 'USD' && pal.hasFx(j.salary.currency) && j.salary.originalInterval === 'month' && (j.salary.termWeeks > 0 || sh.isTermUnstated(j)) && !(j.salary.ranges && j.salary.ranges.length > 1)
  ? { id: j.id, title: j.title, min: j.salary.min, max: j.salary.max, cur: j.salary.currency, usdMin: pal.toUSD(j.salary.min, j.salary.currency), usdMax: pal.toUSD(j.salary.max, j.salary.currency), unstated: sh.isTermUnstated(j) } : null`;
// A stated yearly figure (MR-37, Austria).
const STATED_ANNUAL = `(j) => j.salary && j.salary.statedAnnual ? { id: j.id, title: j.title, ...j.salary.statedAnnual, text: j.salary.text } : null`;

async function pickOne(page, st, slug, pick, what) {
  const list = await appJobs(page, st, slug, pick);
  if (!list.length) skip(`no ${what} on ${slug} in this build`);
  return list[0];
}

/* ---------------------------------------------------------------- the tests */

export function registerFixMr3Tests(suite) {
  suite.test('fix-mr-3: [MR-38] an internship paid by the month with no stated length shows its monthly pay as fixed-term pay, and Juice per month only', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    await board(page, st, 'c=meta');
    const c = await pickOne(page, st, 'meta', UNSTATED_MONTH, 'monthly internship with no stated length');
    await job(page, 'meta', c.id, c.title);
    const amt = await text(page, '#drawer .d-sal-amt');
    const lo = Math.round(c.min / 12), hi = Math.round(c.max / 12);
    const want = (v) => `$${v.toLocaleString('en-US')}`;
    assert(new RegExp(`^\\${want(lo)}(–${hi.toLocaleString('en-US')})? a month$`).test(amt), `${c.id}: the pay reads "${amt}", not the posted ${want(lo)}–${hi.toLocaleString('en-US')} a month`);
    assertEq(await text(page, '#drawer .d-sal-top .muted'), 'USD · length not stated', `${c.id} pay sub-line`);
    assertEq(await text(page, '#drawer .d-annual'), 'Fixed-term pay, not a yearly salary', `${c.id} pay note`);
    const note = await text(page, '#drawer .d-pay-note');
    assert(/doesn’t say how long the internship lasts/.test(note), `${c.id}: the pay Details don't say the length is not stated: "${note.slice(0, 200)}"`);
    assert(!/per year|Annualized/.test(await text(page, '#drawer .d-salary')), `${c.id}: the pay block still reads as a yearly salary`);
    if (c.juice) {
      assertEq(await page.locator('#drawer .d-juice [data-period]').count(), 0, `${c.id}: the Juice block offers a Yearly or Whole term view of pay with no stated length`);
      const head = await text(page, '#drawer .juice-head-net');
      assert(/\/mo left .* while it lasts$/.test(head), `${c.id}: Juice headline "${head}"`);
      assert(/doesn’t say how long the internship lasts, so Juice is shown per month while it lasts/.test(await text(page, '#drawer .juice-where')), `${c.id}: the Juice block doesn't say why it is monthly`);
    }
    // The card's pill shows the posted monthly pay too (shared helper postedTerm).
    const card = page.locator(`#resultsList .card[data-id="${c.id}"] .sal-pill`);
    if (await card.count()) assert(/\/month$/.test((await card.first().innerText()).trim()), `${c.id}: the card reads "${await card.first().innerText()}"`);
    assert(!errors.length, errors.join('; '));
  });

  suite.test('fix-mr-3: [MR-38] an internship paid by the hour with no stated length shows its hourly rate, not a yearly salary', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=nvidia');
    const c = await pickOne(page, st, 'nvidia', UNSTATED_HOUR, 'hourly internship with no stated length');
    await job(page, 'nvidia', c.id, c.title);
    const amt = await text(page, '#drawer .d-sal-amt');
    assert(/ an hour$/.test(amt), `${c.id}: the pay reads "${amt}"`);
    assert(/^USD · .*, length not stated$/.test(await text(page, '#drawer .d-sal-top .muted')), `${c.id} pay sub-line: "${await text(page, '#drawer .d-sal-top .muted')}"`);
    assertEq(await text(page, '#drawer .d-annual'), 'Paid by the hour', `${c.id} pay note`);
  });

  suite.test('fix-mr-3: [MR-38] nothing is dropped: every board lists the same postings, and every internship of unstated length keeps its pay', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=amazon');
    const bad = [];
    for (const slug of ['amazon', 'meta', 'nvidia', 'microsoft', 'apple', 'anduril']) {
      const all = await appJobs(page, st, slug, '(j, sh) => ({ paid: !!j.salary, unstated: sh.isTermUnstated(j), fixed: sh.isFixedTerm(j), intern: sh.isInternLike(j) })');
      const list = JSON.parse(fs.readFileSync(path.join(st.dist, 'beta', 'api', 'jobs', `${slug}.json`), 'utf8')).jobs.length;
      if (all.length !== list) bad.push(`${slug}: ${all.length} postings in the app, ${list} in the list`);
      const un = all.filter((x) => x.unstated);
      if (un.some((x) => !x.paid || !x.fixed || !x.intern)) bad.push(`${slug}: an internship of unstated length lost its pay or its kind`);
      ctx.notes.push(`fix-mr-3 MR-38: ${slug} ${all.length} postings, ${all.filter((x) => x.paid).length} with pay, ${un.length} internships of unstated length shown as fixed-term pay`);
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-mr-3: [MR-33] converted fixed-term pay uses the interval it was posted in ("≈ $X a month"), not an unlabelled year', async (ctx) => {
    const { st, page } = await open(ctx);
    const seen = [];
    for (const slug of ['amazon', 'microsoft']) {
      await board(page, st, `c=${slug}`);
      const list = await appJobs(page, st, slug, FOREIGN_MONTH_TERM);
      for (const c of [list.find((x) => x.unstated), list.find((x) => !x.unstated)].filter(Boolean)) {
        await job(page, slug, c.id, c.title);
        const line = await text(page, '#drawer .dist-approx');
        const lo = Math.round(c.usdMin / 12), hi = Math.round(c.usdMax / 12);
        const amt = lo === hi ? `$${lo.toLocaleString('en-US')}` : `$${lo.toLocaleString('en-US')}–${hi.toLocaleString('en-US')}`;
        assert(line && line.startsWith(`≈ ${amt} a month`), `${c.id} (${c.cur} a month${c.unstated ? ', length not stated' : ''}): the converted line reads "${line}", want "≈ ${amt} a month …"`);
        assert(/ rates$/.test(line), `${c.id}: "${line}" lost its rates link`);
        seen.push(c.id);
      }
    }
    if (!seen.length) skip('no foreign fixed-term monthly pay in this build');
  });

  suite.test('fix-mr-3: [MR-37] Austria\'s stated yearly figure says so, and its Details quote the posting and its payments', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=amazon');
    const c = await pickOne(page, st, 'amazon', STATED_ANNUAL, 'stated annual figure');
    await job(page, 'amazon', c.id, c.title);
    assertEq(await text(page, '#drawer .d-annual'), 'Stated as a yearly figure', `${c.id} pay note`);
    const note = await text(page, '#drawer .d-pay-note');
    assert(note.includes(`As posted: ${c.text.replace(/[.\s]+$/, '')}`), `${c.id}: no "As posted" quote in the pay Details: "${note.slice(0, 300)}"`);
    const monthly = `€${Number(c.monthly).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (Number.isInteger(c.paymentsPerYear)) assert(note.includes(`paid as ${c.paymentsPerYear} monthly payments of ${monthly}, not 12`), `${c.id}: the Details don't name the ${c.paymentsPerYear} payments: "${note.slice(0, 400)}"`);
    else assert(note.includes(`Its monthly row is ${monthly}`), `${c.id}: the Details don't name the monthly row: "${note.slice(0, 400)}"`);
  });

  suite.test('fix-mr-3: [MR-39] the stats line\'s median is the main currency\'s (US pay on Amazon), says "(US)", and equals that median, as the chart caption does', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=amazon&m=map');
    const pay = await appJobs(page, st, 'amazon', `(j, sh, pal) => j.salary && j.salary.kind !== 'ote' && pal.hasFx(j.salary.currency || 'USD') ? { cur: String(j.salary.currency || 'USD').toUpperCase(), mid: pal.toUSD(j.salary.mid, j.salary.currency || 'USD') } : null`);
    const curs = new Set(pay.map((p) => p.cur));
    if (curs.size < 2) skip('Amazon\'s pay is in one currency in this build');
    const us = pay.filter((p) => p.cur === 'USD').map((p) => p.mid).sort((a, b) => a - b);
    const q = (v, p) => { const h = (v.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return v[lo] + (v[hi] - v[lo]) * (h - lo); };
    const median = q(us, 0.5);
    const shown = await text(page, '#statsLine .stat--median');
    const fmt = await page.evaluate(async ([u, m]) => (await import(u)).formatMoney(m), [`${st.beta}/viz/palette.js`, median]);
    assertEq(shown, `${fmt} base pay median (US)`, 'Amazon stats line median');
    const details = await text(page, '#statsLine');
    assert(new RegExp(`median of the ${us.length.toLocaleString('en-US')} roles paid in the US; ${(pay.length - us.length).toLocaleString('en-US')} roles paid in other currencies are left out`).test(details), `the stats Details don't say whose median it is: "${details.slice(0, 400)}"`);
    // The chart's caption has the same median on the same basis ("Median base pay $149K US"; chart.js headPay).
    await board(page, st, 'c=amazon&m=chart');
    await page.waitForSelector('#chartHost .ms-hist__sub', { timeout: 60000 });
    assertEq((await text(page, '#chartHost .ms-hist__sub')), `${fmt} US`, 'Amazon chart caption median');
    assert(/Pay in the US only: [\d,]+ postings with pay for other countries are on the chart, not in the median/.test(await page.locator('#chartHost .ms-hist__cap').getAttribute('title')), 'the chart caption\'s tip does not say whose median it is');
    // A board whose pay is in one currency keeps its plain line.
    for (const slug of ['netflix', 'meta']) {
      await board(page, st, `c=${slug}&m=map`);
      const one = new Set((await appJobs(page, st, slug, '(j) => j.salary && j.salary.kind !== "ote" ? String(j.salary.currency || "USD").toUpperCase() : null')));
      const line = await text(page, '#statsLine .stat--median');
      if (one.size === 1) assert(/base pay median$/.test(line), `${slug} (one currency): "${line}"`);
      else assert(/base pay median \(/.test(line), `${slug} (${[...one].join(', ')}): "${line}" doesn't say whose median`);
    }
  });

  suite.test('fix-mr-3: [MR-39] Insights\' median and middle half are of the main currency\'s roles, and say "in the US"', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=amazon&m=insights');
    await page.waitForSelector('.msi-stats', { timeout: 60000 });
    const tiles = await page.$$eval('.msi-stat', (els) => els.map((e) => [e.querySelector('.msi-stat__label')?.textContent.trim(), e.querySelector('.msi-stat__note')?.textContent.trim()]));
    const med = tiles.find(([l]) => l === 'Median base pay');
    const mid = tiles.find(([l]) => l === 'Middle half');
    assert(med && /^of [\d,]+ in the US$/.test(med[1]), `Median tile note: ${JSON.stringify(med)}`);
    assert(mid && mid[1] === 'of roles in the US', `Middle half tile note: ${JSON.stringify(mid)}`);
    const pub = tiles.find(([l]) => l === 'Pay published');
    const n = Number(med[1].replace(/\D/g, '')), all = Number(pub[1].split(' of ')[0].replace(/\D/g, ''));
    assert(n < all, `the median's ${n} roles should be the US ones of the ${all} with pay`);
    assert(/The median and middle half are of the [\d,]+ roles paid in the US/.test(await text(page, '.ms-insights__sub')), 'the Insights Details don\'t say whose median the tiles show');
  });

  suite.test('fix-mr-3: [MR-29] Google\'s chart notes say once, in their Details, that departments are read from titles; Amazon\'s do not', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=google&m=chart');
    await page.waitForSelector('#chartHost .ms-note', { timeout: 30000 });
    const want = 'Google doesn’t publish departments, so its roles are grouped by what their titles say.';
    const notes = await page.$$eval('#chartHost .ms-note', (els) => els.map((e) => e.textContent));
    assertEq(notes.filter((t) => t.includes(want)).length, 1, 'the chart notes\' Details say departments come from titles');
    // No new visible control: the sentence is in the Details list, which is closed until asked.
    const visible = await page.$$eval('#chartHost .ms-note__list', (els, w) => els.some((e) => !e.hidden && e.textContent.includes(w)), want);
    assert(!visible, 'the sentence is shown outside the closed Details list');
    await board(page, st, 'c=amazon&m=chart');
    await page.waitForSelector('#chartHost .ms-note', { timeout: 30000 });
    assert(!(await page.$$eval('#chartHost .ms-note', (els) => els.some((e) => /grouped by what their titles say/.test(e.textContent)))), 'Amazon publishes departments; its notes say they come from titles');
  });

  suite.test('fix-mr-3: [MR-41] the Mid chip\'s tip names the board\'s own mid level (Amazon "II", Google "III")', async (ctx) => {
    const { st, page } = await open(ctx);
    for (const [slug, ex, never] of [['amazon', '“II”', '“III”'], ['google', '“III”', null]]) {
      await board(page, st, `c=${slug}`);
      const c = await pickOne(page, st, slug, '(j) => j.seniority === "Mid" && j.seniorityBasis === "title" ? { id: j.id, title: j.title } : null', 'stated mid-level posting');
      await job(page, slug, c.id, c.title);
      const tip = await page.locator('#drawer .sen--mid').first().getAttribute('title');
      assert(tip && tip.includes(ex), `${slug}: the Mid tip is "${tip}", want ${ex}`);
      if (never) assert(!tip.includes(never), `${slug}: the Mid tip names ${never}, which is Senior on ${slug}`);
    }
  });

  suite.test('fix-mr-3: [MR-40] Microsoft\'s Garden City, Fort Lee and Paramus postings are placed in their towns and priced at the NYC-metro range', async (ctx) => {
    const { st, page } = await open(ctx);
    await board(page, st, 'c=microsoft');
    const towns = { 'Garden City': [40.7268, -73.6343], 'Fort Lee': [40.8509, -73.9701], Paramus: [40.9445, -74.0754] };
    const list = await appJobs(page, st, 'microsoft', `(j) => { const l = (j.locations || []).find((x) => ['Garden City', 'Fort Lee', 'Paramus'].includes(x.city) && ['NY', 'NJ'].includes(x.region)); return l && j.salary ? { id: j.id, title: j.title, city: l.city, lat: l.lat, lng: l.lng, raw: l.rawName || l.name, ranges: (j.salary.ranges || []).map((r) => ({ min: r.min, max: r.max, locations: r.locations || [] })), min: j.salary.min, max: j.salary.max } : null; }`);
    if (!list.length) skip('no Microsoft posting in Garden City, Fort Lee or Paramus in this build');
    const bad = [];
    for (const c of list) {
      const [lat, lng] = towns[c.city];
      if (Math.abs(c.lat - lat) > 0.01 || Math.abs(c.lng - lng) > 0.01) bad.push(`${c.id}: ${c.city} at ${c.lat},${c.lng}`);
      // With another place outside the area, the town's own range is the higher NYC-metro one (SB-5); alone, the headline is.
      const own = c.ranges.find((r) => r.locations.includes(c.raw));
      const top = c.ranges.length ? Math.max(...c.ranges.map((r) => r.max)) : c.max;
      if (c.ranges.length > 1 && (!own || own.max !== top)) bad.push(`${c.id}: ${c.city} is priced at ${own ? `${own.min}–${own.max}` : 'no row'}, not the NYC-metro range (top ${top})`);
    }
    ctx.notes.push(`fix-mr-3 MR-40: ${list.length} Microsoft postings in Garden City, Fort Lee or Paramus`);
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-mr-3: [MR-26] the methodology\'s sources table does not call the postings "update due" on the build', async (ctx) => {
    const { st, page } = await open(ctx);
    for (const site of [st.beta, st.main]) {
      await page.goto(`${site}/methodology/`);
      // The sources table (§7), not the worked example's waterfall, which has a "Gross pay" row too.
      const row = await page.locator('tr:has(td[data-label="Refreshed"])', { has: page.locator('th', { hasText: /^Gross pay$/ }) }).first().textContent({ timeout: 10000 }).catch(() => null);
      if (row == null) skip('the methodology page has no sources table in this build');
      assert(!/update due/.test(row), `${site}/methodology/: "${row.replace(/\s+/g, ' ').trim()}"`);
      assert(/Daily/.test(row), `${site}/methodology/: the Gross pay row lost its cadence: "${row}"`);
    }
  });

  // [phone] Every line this lane added or changed, at every phone size: the drawer's pay lines for a monthly internship
  // of unstated length (Meta), a foreign fixed-term line (Amazon), Austria's stated yearly figure (Amazon), the stats
  // line (Amazon) and Insights' tiles (Amazon).
  for (const d of ALL_SIZES) {
    suite.test(`fix-mr-3: [phone] ${d.name} ${d.width}x${d.height}: the new and changed pay lines and the stats line are ${linesAt(d.width) === 1 ? 'one line' : 'at most two lines'}, never cut`, async (ctx) => {
      const { st, page, errors } = await open(ctx, { device: d });
      const bad = [];
      const measure = async (sel, where) => {
        if (!(await page.locator(sel).count())) { bad.push(`${where}: ${sel} not shown`); return; }
        const r = await page.evaluate(scanText, { roots: [sel], captionSel: `${CAPTION_SEL}, ${sel}`, allow: [], words: 12, maxLines: linesAt(d.width) });
        for (const m of r.lines) bad.push(`${where} ${m.sel}: ${m.lines} lines, ${m.words} words: "${m.text}"`);
        for (const m of r.cut) bad.push(`${where} ${m.sel}: cut by ${m.over} px: "${m.text}"`);
      };
      await board(page, st, 'c=amazon');
      await measure('#statsLine', 'Amazon stats line');
      // The chart's median caption: the strip's (a label column) or the axis line above the strip (a phone).
      const capSel = (await page.locator('#chartHost .ms-chart__caprow:not([hidden])').count()) ? '#chartHost .ms-chart__caprow' : '#chartHost .ms-hist__cap, #chartHost .ms-axis__cap';
      if (await page.locator(capSel).count()) await measure(capSel, 'Amazon chart caption');
      const term = (await appJobs(page, st, 'amazon', FOREIGN_MONTH_TERM))[0];
      const annual = (await appJobs(page, st, 'amazon', STATED_ANNUAL))[0];
      if (term) { await job(page, 'amazon', term.id, term.title); await measure('#drawer .dist-approx', term.id); await measure('#drawer .d-sal-top .muted', term.id); }
      if (annual) { await job(page, 'amazon', annual.id, annual.title); await measure('#drawer .d-annual', annual.id); }
      await board(page, st, 'c=amazon&m=insights');
      await page.waitForSelector('.msi-stats', { timeout: 60000 });
      await measure('.msi-stat__note', 'Insights tiles');
      await board(page, st, 'c=meta');
      const un = (await appJobs(page, st, 'meta', UNSTATED_MONTH))[0];
      if (un) {
        await job(page, 'meta', un.id, un.title);
        for (const sel of ['#drawer .d-sal-top .muted', '#drawer .d-annual', '#drawer .d-pay-note', '#drawer .juice-head-net']) if (sel !== '#drawer .juice-head-net' || un.juice) await measure(sel, un.id);
      }
      assert(!bad.length, bad.join('; '));
      assert(!errors.length, errors.join('; '));
    });
  }
}

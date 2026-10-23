// fix-data-6 (fix wave 6, 2026-10-23; docs/process/fix-data-6.md): G-1, K-1, P-1, P-2, R-1, R-2 and R-3, checked on the
// built site. Chromium against the static build (BETA_QA_DIST, else dist/ from `npm run build`), served under /melon-seek/
// like GitHub Pages; other hosts are aborted. Each test finds its case in the build's own data (public/api.js getJobs, as
// the UI sees it) where it can, and skips when the case is gone from a later crawl. Each failed on the build of 00bd52c
// with the 2026-10-16 crawl. "[phone]" measures every line this lane added or changed at every entry of
// test/e2e/phone-sizes.mjs with fix-phone-text's own scanner (scanText): one line, or two below 360 px (its linesAt rule),
// at most 12 words, never cut.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { scanText, CAPTION_SEL } from './fix-phone-text.e2e.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const linesAt = (width) => (width < 360 ? 2 : 1); // fix-phone-text's rule
const SIZE = (w, h) => ALL_SIZES.find((d) => d.width === w && d.height === h) || { name: `${w}x${h}`, width: w, height: h, mobile: w < 800, touch: w < 800, dpr: 2 };

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

/**
 * The map's Leaflet instance, kept as window.__fd6Maps when app.js loads Leaflet (window.L): its markers' own
 * coordinates are where a pin is drawn, whatever the zoom.
 */
const LEAFLET_HOOK = () => {
  let real;
  Object.defineProperty(window, 'L', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      if (v && v.Map && v.Map.addInitHook && !v.__fd6) { v.__fd6 = true; v.Map.addInitHook(function hook() { (window.__fd6Maps ||= []).push(this); }); }
    },
  });
};

/** A fresh page on the beta site; `device` is a phone-sizes.mjs entry, else a 1440 desktop. */
async function open(ctx, { device = null, init = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  const engine = ctx.browser.browserType?.().name() || 'chromium';
  const context = await ctx.browser.newContext(device ? { ...contextFor(device, engine), colorScheme: 'light' } : { viewport: DESKTOP, colorScheme: 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  if (init) await context.addInitScript(init);
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
/** Open a job on the loaded board (a hash change: the list stays loaded), every fold open (not Details). */
async function job(page, hash, title) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((t) => document.querySelector('#drawer.is-open #drawerTitle')?.textContent.trim() === t, title, { timeout: 30000 });
  await sleep(700);
  await page.evaluate(() => { for (const d of document.querySelectorAll('#drawer details')) d.open = true; });
  await sleep(300);
}
const text = (page, sel) => page.locator(sel).first().evaluate((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => null);

/** The app's own jobs for a board (getJobs, Juice attached), reduced in the page by `pick` (a function source). */
async function appJobs(page, st, company, pick) {
  if (!page.url().startsWith(st.origin)) await page.goto(`${st.beta}/#c=netflix`);
  const r = await page.evaluate(`(async () => {
    const api = await import(${JSON.stringify(`${st.beta}/api.js`)});
    const res = await api.getJobs({ company: ${JSON.stringify(company)} });
    const pick = ${pick};
    return { mode: res.mode, jobs: res.jobs.map((j) => pick(j)).filter(Boolean) };
  })()`);
  if (r.mode !== 'snapshot') skip(`${company} has no snapshot in this build (${r.mode})`);
  return r.jobs;
}
const noErrors = (errors) => assert(!errors.length, `page errors: ${errors.join(' | ')}`);
const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
/** Lines, words and cuts of the elements `sel` matches, with fix-phone-text's scanner; [] when they pass. */
async function lineProblems(page, sel, where) {
  if (!(await page.locator(sel).count())) return [`${where}: nothing matches ${sel}`];
  const width = await page.evaluate(() => innerWidth);
  const res = await page.evaluate(scanText, { roots: [sel], captionSel: `${CAPTION_SEL}, ${sel}`, allow: [], words: 12, maxLines: linesAt(width) });
  return [...res.lines.map((m) => `${where} ${m.sel}: ${m.lines} lines, ${m.words} words: "${m.text}"`), ...res.cut.map((m) => `${where} ${m.sel}: cut by ${m.over} px: "${m.text}"`)];
}

/* ---------------------------------------------------------------- the cases */

const SF_BAY = { lat: 37.6, lng: -122.2 }; // server/salary.js PAY_AREAS 'sf-bay' (75 km)
// G-1: the towns and their own coordinates (server/geo.js); before the fix both were at California's centre (36.12,-119.68).
const BAY_TOWNS = [
  { slug: 'amazon', city: 'East Palo Alto', at: { lat: 37.4688, lng: -122.1411 } },
  { slug: 'meta', city: 'Burlingame', at: { lat: 37.5841, lng: -122.3661 } },
];
// P-1: a posting whose one range was posted for some of its places (salary.places), under a Location filter it lists.
const P1_CASES = [
  { slug: 'amazon', id: 'amazon:10487128', l: 'Atlanta', where: 'Tempe' },
  { slug: 'apple', id: 'apple:200609322-0157', l: 'Austin', where: 'San Jose' },
  { slug: 'amazon', id: 'amazon:10373614', l: 'Austin', where: 'Herndon and Seattle' },
];
// P-2: the drawer's heading gives the posted yearly figure exactly.
const P2_CASES = [
  { slug: 'amazon', id: 'amazon:10448661', exact: '€46,400', short: '€46K' },
  { slug: 'microsoft', id: 'microsoft:1970393556619327', exact: '$119,800–234,700', short: '$120K–235K' },
  { slug: 'meta', id: 'meta:1055258313794341', exact: '$100,610–144,602', short: '$101K–145K' },
];
const K1_ZERO = 'google:114416552819729094'; // "Canada: $99000 (CAD) + 0% bonus target"

async function titleOf(page, st, slug, id) {
  const [t] = await appJobs(page, st, slug, `(j) => j.id === ${JSON.stringify(id)} ? j.title : null`);
  if (!t) skip(`${id} is not on ${slug} in this build`);
  return t;
}

/** P-1 on one device: the card's pill, its tip and accessible name, and the drawer's line and caption. */
async function checkP1(ctx, device) {
  const { st, page, errors } = await open(ctx, { device });
  const bad = [];
  for (const c of P1_CASES) {
    const title = await titleOf(page, st, c.slug, c.id).catch(() => null);
    if (!title) continue;
    await board(page, st, `c=${c.slug}&l=${encodeURIComponent(c.l)}&q=${encodeURIComponent(title)}`);
    const card = page.locator(`#resultsList .card[data-id="${c.id}"]`);
    if (!(await card.count())) { bad.push(`${c.id}: no card under ${c.l}`); continue; }
    const pill = (await card.locator('.sal-pill').first().innerText()).replace(/\s+/g, ' ').trim();
    const aria = await card.getAttribute('aria-label');
    if (pill !== `Pay posted for ${c.where} only`) bad.push(`${c.id} pill "${pill}"`);
    if (!aria.includes(`is the pay posted for ${c.where}, not for ${c.l}`)) bad.push(`${c.id} aria "${aria.slice(0, 160)}"`);
    if (/posted for the US/.test(`${pill} ${aria}`)) bad.push(`${c.id} still names the country`);
    await job(page, `c=${c.slug}&l=${encodeURIComponent(c.l)}&q=${encodeURIComponent(title)}&job=${encodeURIComponent(c.id)}`, title);
    const line = await text(page, '#drawer .d-pay-note .ms-note__line');
    if (![`Posted for ${c.where}, not ${c.l}`, `Posted for ${c.where} only`].includes(line) && !line?.startsWith(`Posted for ${c.where.split(' and ')[0]}`)) bad.push(`${c.id} drawer line "${line}"`);
    const cap = await page.locator('#drawer .d-pay-caption').first().textContent().catch(() => '');
    if (!cap.includes(`This pay is posted for ${c.where}, not for ${c.l}.`)) bad.push(`${c.id} caption "${cap}"`);
    bad.push(...await lineProblems(page, '#drawer .d-pay-note', `${c.id} ${device?.name || 'desktop'}`));
  }
  noErrors(errors);
  return bad;
}

/** P-2 on one device: the heading is one line, the exact figure where it fits (always from 375 px), else the card's. */
async function checkP2(ctx, device, { mustBeExact = true } = {}) {
  const { st, page, errors } = await open(ctx, { device });
  const bad = [];
  for (const c of P2_CASES) {
    const title = await titleOf(page, st, c.slug, c.id).catch(() => null);
    if (!title) continue;
    await board(page, st, `c=${c.slug}&q=${encodeURIComponent(title)}`);
    await job(page, `c=${c.slug}&q=${encodeURIComponent(title)}&job=${encodeURIComponent(c.id)}`, title);
    const amt = await text(page, '#drawer .d-sal-amt');
    if (mustBeExact ? amt !== c.exact : ![c.exact, c.short].includes(amt)) bad.push(`${c.id} heading "${amt}" (want ${c.exact}${mustBeExact ? '' : ` or ${c.short}`})`);
    bad.push(...await lineProblems(page, '#drawer .d-sal-amt', `${c.id} ${device?.name || 'desktop'}`).then((p) => p.map((m) => m.replace(/2 lines/, '2 lines (the heading must be one)'))));
    const lines = await page.locator('#drawer .d-sal-amt').first().evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); const m = []; for (const x of r.getClientRects()) { const y = Math.round(x.top + x.height / 2); if (!m.some((t) => Math.abs(t - y) < 6)) m.push(y); } return m.length; });
    if (lines !== 1) bad.push(`${c.id} heading on ${lines} lines`);
  }
  noErrors(errors);
  return bad;
}

/** K-1 on one device: no bonus chip for "+ 0% bonus target"; a stated target reads as posted; chips are never cut. */
async function checkK1(ctx, device) {
  const { st, page, errors } = await open(ctx, { device });
  const bad = [];
  const title = await titleOf(page, st, 'google', K1_ZERO);
  await board(page, st, `c=google&q=${encodeURIComponent(title)}`);
  await job(page, `c=google&q=${encodeURIComponent(title)}&job=${encodeURIComponent(K1_ZERO)}`, title);
  const chips = await page.locator('#drawer .pay-label').allInnerTexts();
  if (chips.some((c) => /bonus/i.test(c))) bad.push(`${K1_ZERO}: chips ${JSON.stringify(chips)}`);
  const drawer = await page.locator('#drawer .drawer-scroll').innerText();
  if (/mentions a bonus/.test(drawer)) bad.push(`${K1_ZERO}: "mentions a bonus" in the drawer`);
  // A posting with a stated target: the chip says it as posted.
  const [t] = await appJobs(page, st, 'google', '(j) => j.extras && j.extras.bonus && j.extras.bonusTarget && j.salary && !(j.salary.ranges && j.salary.ranges.length > 1) && !j.salary.kind?.includes("ote") ? { id: j.id, title: j.title, target: j.extras.bonusTarget } : null');
  if (!t) bad.push('no Google posting with a stated bonus target (extras.bonusTarget)');
  else {
    await board(page, st, `c=google&q=${encodeURIComponent(t.title)}`);
    await job(page, `c=google&q=${encodeURIComponent(t.title)}&job=${encodeURIComponent(t.id)}`, t.title);
    const got = await page.locator('#drawer .pay-label').allInnerTexts();
    if (!got.includes(`+ ${t.target} bonus target`)) bad.push(`${t.id}: chips ${JSON.stringify(got)}, want "+ ${t.target} bonus target"`);
    if (got.includes('+ bonus mentioned')) bad.push(`${t.id}: still "+ bonus mentioned"`);
    bad.push(...await lineProblems(page, '#drawer .pay-labels', `${t.id} ${device?.name || 'desktop'}`).then((p) => p.filter((m) => /cut by/.test(m))));
  }
  noErrors(errors);
  return bad;
}

/* ---------------------------------------------------------------- the tests */

export function registerFixData6Tests(suite) {
  suite.test('fix-data-6: [G-1] Amazon\'s East Palo Alto and Meta\'s Burlingame pins are at their own town, in the SF Bay Area, not at California\'s centre', async (ctx) => {
    const { st, page, errors } = await open(ctx, { init: LEAFLET_HOOK });
    for (const t of BAY_TOWNS) {
      await board(page, st, `c=${t.slug}&l=${encodeURIComponent(t.city)}&m=map`);
      await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 60000 });
      await sleep(1500);
      const pins = await page.evaluate(() => {
        const out = [];
        for (const m of window.__fd6Maps || []) m.eachLayer((l) => { if (l.getLatLng && l.getElement?.()) out.push({ ...l.getLatLng(), label: l.getElement().getAttribute('aria-label') || '' }); });
        return out;
      });
      const pin = pins.find((p) => p.label.startsWith(t.city));
      assert(pin, `${t.slug}: no pin named ${t.city} (${pins.map((p) => p.label.slice(0, 40)).join(' | ')})`);
      assert(km(pin, t.at) < 5, `${t.slug} ${t.city} pin at ${pin.lat.toFixed(3)},${pin.lng.toFixed(3)}, ${km(pin, t.at).toFixed(0)} km from the town`);
      assert(km(pin, SF_BAY) <= 75, `${t.city} is ${km(pin, SF_BAY).toFixed(0)} km from the bay: outside the SF Bay Area`);
    }
    noErrors(errors);
  });

  suite.test('fix-data-6: [K-1] "+ 0% bonus target" shows no bonus chip, and a stated bonus target reads as posted (desktop, 412x915, 375x812)', async (ctx) => {
    const bad = [];
    for (const d of [null, SIZE(412, 915), SIZE(375, 812)]) bad.push(...(await checkK1(ctx, d)).map((m) => `${d?.name || 'desktop'}: ${m}`));
    assert(!bad.length, bad.join('\n'));
  });

  suite.test('fix-data-6: [P-1] under a Location filter, pay posted for some of the posting\'s places names them, not the country (1114x720, 375x812, 352x355)', async (ctx) => {
    const bad = [];
    for (const d of [SIZE(1114, 720), SIZE(375, 812), SIZE(352, 355)]) bad.push(...(await checkP1(ctx, d)).map((m) => `${d.name}: ${m}`));
    assert(!bad.length, bad.join('\n'));
  });

  suite.test('fix-data-6: [P-2] the job page gives the posted yearly figure exactly, on one line (280x653, 375x812, 1280x800)', async (ctx) => {
    const bad = [];
    for (const [d, exact] of [[SIZE(1280, 800), true], [SIZE(375, 812), true], [SIZE(280, 653), false]]) bad.push(...(await checkP2(ctx, d, { mustBeExact: exact })).map((m) => `${d.name}: ${m}`));
    assert(!bad.length, bad.join('\n'));
  });

  suite.test('fix-data-6: [P-2] a range per place lists each place\'s posted range exactly (Pay by place)', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    const [j] = await appJobs(page, st, 'apple', '(j) => j.salary && !j.salary.originalInterval && Array.isArray(j.salary.ranges) && j.salary.ranges.length > 1 && j.salary.ranges.every((r) => r.min % 1000 && (r.locations || []).length) ? { id: j.id, title: j.title, ranges: j.salary.ranges.map((r) => [r.min, r.max]) } : null');
    if (!j) skip('no Apple posting with a range per place that is not whole thousands');
    await board(page, st, `c=apple&q=${encodeURIComponent(j.title)}`);
    await job(page, `c=apple&q=${encodeURIComponent(j.title)}&job=${encodeURIComponent(j.id)}`, j.title);
    const pays = await page.locator('#drawer .d-sal-places .d-tier-pay').allInnerTexts();
    assert(pays.length, 'no Pay by place rows');
    const fmt = (n) => n.toLocaleString('en-US');
    for (const [lo, hi] of j.ranges) assert(pays.some((p) => p.includes(`$${fmt(lo)}–${fmt(hi)}`)), `no row "$${fmt(lo)}–${fmt(hi)}" in ${JSON.stringify(pays)}`);
    assert(!pays.some((p) => /\dK\b/.test(p)), `a rounded row: ${JSON.stringify(pays)}`);
    noErrors(errors);
  });

  suite.test('fix-data-6: [R-1] Same role elsewhere for Google\'s Technical Account Manager I in Toronto is not priced against Amazon\'s delivery-station associates', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    const [j] = await appJobs(page, st, 'google', '(j) => /^Technical Account Manager I, Google Cloud Consulting/.test(j.title) && (j.locations || []).some((l) => l.city === "Toronto") ? { id: j.id, title: j.title } : null');
    if (!j) skip('no Google Technical Account Manager I in Toronto in this build');
    await board(page, st, `c=google&q=${encodeURIComponent(j.title)}`);
    await job(page, `c=google&q=${encodeURIComponent(j.title)}&job=${encodeURIComponent(j.id)}`, j.title);
    await page.locator('#drawer .ms-comps__row, #drawer .ms-comps__note').first().waitFor({ timeout: 30000 }).catch(() => {});
    const rows = await page.locator('#drawer .ms-comps__row').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
    const amazon = rows.filter((r) => /^Amazon/.test(r));
    const median = (r) => Number((/median \$([\d.]+)K/.exec(r) || [])[1] || 1e9);
    assert(!amazon.some((r) => median(r) < 60), `Amazon priced as a delivery-station associate: ${amazon.join(' | ')}`);
    noErrors(errors);
  });

  suite.test('fix-data-6: [R-2] Amazon\'s Lead Associate cards are Mid, not Senior, and the Senior filter leaves them out', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    const leads = await appJobs(page, st, 'amazon', '(j) => /^(Retail )?Lead Associate\\b/.test(j.title) ? { id: j.id, title: j.title, s: j.seniority } : null');
    if (!leads.length) skip('no Amazon Lead Associate in this build');
    assert(leads.every((j) => j.s === 'Mid'), `stored levels ${JSON.stringify([...new Set(leads.map((j) => j.s))])}`);
    await board(page, st, `c=amazon&q=${encodeURIComponent('Lead Associate')}`);
    const chips = await page.locator('#resultsList .card .sen').allInnerTexts();
    assert(chips.length && !chips.some((c) => /senior/i.test(c)), `level chips ${JSON.stringify([...new Set(chips)])}`);
    await board(page, st, `c=amazon&q=${encodeURIComponent('Lead Associate')}&s=Senior`);
    const titles = await page.locator('#resultsList .card .card-title').allInnerTexts().catch(() => []);
    assert(!titles.some((t) => /^(Retail )?Lead Associate\b/.test(t)), `under Senior: ${titles.slice(0, 5).join(' | ')}`);
    noErrors(errors);
  });

  suite.test('fix-data-6: [R-3] Meta\'s data-center subject matter experts are compared as data-center roles, not AI tutors', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    const [j] = await appJobs(page, st, 'meta', '(j) => /Subject Matter Expert/.test(j.title) && /Data Center/.test(j.department || "") ? { id: j.id, title: j.title } : null');
    if (!j) skip('no Meta data-center subject matter expert in this build');
    await board(page, st, `c=meta&q=${encodeURIComponent(j.title)}`);
    await job(page, `c=meta&q=${encodeURIComponent(j.title)}&job=${encodeURIComponent(j.id)}`, j.title);
    const drawer = await page.locator('#drawer .drawer-scroll').innerText();
    assert(!/AI tutors/i.test(drawer), `the drawer compares ${j.id} with AI tutors`);
    noErrors(errors);
  });

  for (const d of ALL_SIZES) {
    suite.test(`fix-data-6: [phone] ${d.name} ${d.width}x${d.height}: the P-1 pay line, the P-2 heading and the K-1 chips are one line (two below 360 px), never cut`, async (ctx) => {
      const bad = [...await checkP1(ctx, d).then((b) => b.filter((m) => /lines|cut|words/.test(m))), ...await checkP2(ctx, d, { mustBeExact: d.width >= 360 }), ...await checkK1(ctx, d).then((b) => b.filter((m) => /cut/.test(m)))];
      assert(!bad.length, bad.join('\n'));
    });
  }
}

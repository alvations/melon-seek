// fix-juice-6 (2026-10-24; docs/process/fix-juice-6.md): the Juice section's words, checked on the built beta site.
// Persona wave 2 (docs/process/persona-beta-2-35-44.md, -25-34.md, -55-plus.md, -45-54.md) found:
//   J-1 the tax rows read "state or local tax" for Ontario's provincial tax and Italy's regional surcharge, and
//       "social security" for UK National Insurance and Canada's CPP and EI;
//   J-2 "Family here means one earner; each person is taxed separately here" read as a contradiction;
//   J-3 Juice went back to Yearly on every visit, while the household was remembered;
//   J-4 "Rind", "Dry", "Clusters / Ranges" and the chart's "‹2" / "›13" chips were not explained;
//   J-5 a card's Juice grade was for another place than the one the card names first (Google "New York, NY +1"
//       graded for Chicago, Meta's "Los Angeles" for Seattle).
// Chromium against the static build (BETA_QA_DIST, else dist/), served under /melon-seek/ like GitHub Pages; other
// hosts are aborted. Each test finds its case in the build's own data (public/api.js getJobs, as the UI sees it), so it
// keeps testing the same rule on a new crawl, and skips when the case is gone. The drawer tests run at 280x653 (Galaxy
// Fold), 375x812 (iPhone 13 mini), 352x355 (Motorola razr cover) and 1280x800, for Ontario, Italy, the UK, Germany and
// a US state. "[phone]" measures every line this lane added or changed at every size of test/e2e/phone-sizes.mjs with
// fix-phone-text's own scanner: one line, at most 12 words, never cut. The expected words come from
// public/features/juice-drawer.js, the module the app uses, so a test checks the rule, not a copy of a string.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { scanText, CAPTION_SEL } from './fix-phone-text.e2e.js';
import { taxRowNames, householdTaxLine, PERIOD_KEY, gradeMeaning, gradeShort } from '../../public/features/juice-drawer.js';
import { extractConst } from '../../scripts/refresh/lib.js';
import { taxFor } from '../../server/juice.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const SIZE = (name) => ALL_SIZES.find((d) => d.name === name);
const DESKTOP = { name: 'Desktop', width: 1280, height: 800, desktop: true };
/** The brief's four sizes. */
const SIZES = [SIZE('Galaxy Fold (folded)'), SIZE('iPhone 13 mini'), SIZE('Motorola razr (cover screen)'), DESKTOP];
/** The places, by the Juice city they are scored in, and the boards to look on (smallest first). */
const PLACES = [
  { key: 'toronto-on-ca', name: 'Ontario (Toronto)' },
  { key: 'milan-it', name: 'Italy (Milan)' },
  { key: 'london-gb', name: 'the UK (London)' },
  { key: 'munich-de', alt: 'berlin-de', name: 'Germany (Munich)' },
  { key: 'new-york-ny-us', alt: 'atlanta-ga-us', name: 'a US state (New York)' },
];
const BOARDS = ['netflix', 'meta', 'nvidia', 'microsoft', 'google', 'apple', 'amazon'];
const HH_KEY = 'melon-seek.household.v1';
/** The household line's variants, from app.js HOUSEHOLDS (a literal: [key, label, tip, bedrooms, people, line variants]). */
const HOUSEHOLD_LINES = Object.fromEntries((extractConst(fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), 'HOUSEHOLDS') || []).map((x) => [x[0], [].concat(x[5])]));

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
  shared = { origin, dist, beta: `${origin}/melon-seek/beta` };
  return shared;
}

/** A fresh context on the beta site at `device` (a phone-sizes.mjs entry, or DESKTOP). `household` is stored first. */
async function open(ctx, device, { household = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  const engine = ctx.browser.browserType?.().name() || 'chromium';
  const opts = device.desktop ? { viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1 } : contextFor(device, engine);
  const context = await ctx.browser.newContext({ ...opts, colorScheme: 'light' });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  if (household) await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } }, [HH_KEY, household]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { st, context, page, errors };
}
const ready = (page) => page.waitForFunction(() => {
  const t = document.querySelector('#resultsTitle');
  return t && !/Loading/.test(t.textContent) && /\d/.test(t.textContent) && document.querySelector('#resultsList .card[data-id]');
}, null, { timeout: 120000 });

/** Open a job by a full page load, with its Juice waterfall open; null when the job page has no Juice. */
async function openJuice(page, st, c) {
  await page.goto('about:blank');
  await page.goto(`${st.beta}/#c=${c.slug}&job=${encodeURIComponent(c.id)}`);
  await page.waitForSelector('#drawer.is-open:not([hidden]) #drawerTitle', { timeout: 120000 });
  const has = await page.waitForSelector('#drawer .d-juice details.juice-details', { timeout: 30000 }).then(() => true, () => false);
  if (!has) return null;
  await page.evaluate(() => { const d = document.querySelector('#drawer details.juice-details'); if (d) d.open = true; });
  await page.waitForSelector('#drawer .d-juice .waterfall', { timeout: 10000 });
  await sleep(500); // the lines' fit (fitLine's ResizeObserver) settles
  return true;
}

/* ---------------------------------------------------------------- the cases, found in the build's data once */

let casesPromise = null;
/**
 * One job per place: yearly pay (Monthly / Yearly toggle), one scored place, its best place in that city. Read with
 * the app's own api.js in a page, board by board, smallest first. Also J-5's cards: a posting scored at more than one
 * place whose best place is not the first place the card would name (the first of its pay places).
 */
function findCases(ctx) {
  if (!casesPromise) casesPromise = (async () => {
    const { st, page } = await open(ctx, DESKTOP);
    await page.goto(`${st.beta}/`);
    const out = { places: {}, j5: {}, rindDry: null };
    for (const slug of BOARDS) {
      const r = await page.evaluate(async ({ beta, slug, keys }) => {
        const api = await import(`${beta}/api.js`);
        const shared = await import(`${beta}/features/shared.js`);
        const res = await api.getJobs({ company: slug });
        if (res.mode !== 'snapshot') return null;
        const places = {};
        let j5 = null, rindDry = null;
        for (const j of res.jobs) {
          const b = j.juice?.best;
          if (!b || !j.salary || j.salary.termWeeks || j.salary.partTime || shared.isTermUnstated?.(j) || shared.isFixedTerm?.(j)) continue;
          if (j.juice.byLocation.length === 1 && keys.includes(b.city) && !places[b.city]) places[b.city] = { slug, id: j.id, title: j.title, city: b.city, jur: b.inputs?.tax?.jurisdiction || null };
          if (!rindDry && (b.grade === 'Rind' || b.grade === 'Dry')) rindDry = { slug, id: j.id, title: j.title, grade: b.grade };
          if (!j5 && j.juice.byLocation.length > 1) {
            const pay = shared.payLocations(j);
            const first = (pay && pay.length ? pay : j.locations)[0];
            const graded = j.locations.find((l) => l && l.name === b.locationName);
            if (first && graded && first !== graded && j.locations.indexOf(first) < j.locations.indexOf(graded)) {
              const named = (l) => (l.city && l.region ? `${l.city}, ${l.region}` : l.name);
              j5 = { slug, id: j.id, title: j.title, graded: named(graded), first: named(first), gradedCity: graded.city || graded.name, score: b.score, grade: b.grade };
            }
          }
        }
        return { places, j5, rindDry };
      }, { beta: st.beta, slug, keys: PLACES.flatMap((p) => [p.key, p.alt].filter(Boolean)) });
      if (!r) continue;
      for (const [k, v] of Object.entries(r.places)) if (!out.places[k]) out.places[k] = v;
      if (r.j5) out.j5[slug] = r.j5;
      if (!out.rindDry && r.rindDry) out.rindDry = r.rindDry;
    }
    await page.context().close().catch(() => {});
    return out;
  })();
  return casesPromise;
}
async function placeCase(ctx, p) {
  const all = await findCases(ctx);
  return all.places[p.key] || (p.alt && all.places[p.alt]) || null;
}
/** { country, region } of a found case (its best place's tax keys, else its city key). */
function jurOf(c) {
  if (Array.isArray(c.jur) && c.jur.length) {
    const country = c.jur[0];
    const reg = c.jur.find((k) => k.startsWith(`${country}-`) && !k.includes('-LOCAL-'));
    return { country, region: reg ? reg.slice(country.length + 1) : null };
  }
  const parts = c.city.split('-');
  return { country: parts.at(-1).toUpperCase(), region: ['US', 'CA'].includes(parts.at(-1).toUpperCase()) ? parts.at(-2).toUpperCase() : null };
}

/** fix-phone-text's scanner on `sel`: lines over one, over 12 words, or cut. */
async function oneLine(page, sel, where) {
  const r = await page.evaluate(scanText, { roots: [sel], captionSel: `${CAPTION_SEL}, ${sel}`, allow: [], words: 12, maxLines: 1 });
  return [...r.lines.map((m) => `${where} ${m.sel}: ${m.lines} lines, ${m.words} words: "${m.text}"`), ...r.cut.map((m) => `${where} ${m.sel}: cut by ${m.over} px: "${m.text}"`)];
}
/** The Tax row's lines: [{ part, text }] (each part's own line), or the old single line as part null. */
const taxLines = (page) => page.evaluate(() => [...document.querySelectorAll('#drawer .wf--tax .wf-detail:not(.wf-tax-basis)')]
  .map((e) => ({ part: e.dataset.part || null, text: (e.textContent || '').replace(/\s+/g, ' ').trim() })));
const nameOf = (text) => text.replace(/\s+−?[$€£¥₹][\d,.]+(\/mo|\/yr| total)?$/, '').trim();

/* ---------------------------------------------------------------- the tests */

export function registerFixJuice6Tests(suite) {
  for (const d of SIZES) {
    suite.test(`fix-juice-6: [J-1] ${d.width}x${d.height}: each tax row is named as its country names it (Ontario, Italy, the UK, Germany, a US state), one line each`, async (ctx) => {
      const { st, page, errors } = await open(ctx, d);
      const bad = [];
      let checked = 0;
      for (const p of PLACES) {
        const c = await placeCase(ctx, p);
        if (!c) { ctx.notes.push(`fix-juice-6 [J-1]: no ${p.name} job with Juice in this build`); continue; }
        if (!(await openJuice(page, st, c))) { bad.push(`${c.id}: no Juice on the job page`); continue; }
        const jur = jurOf(c);
        const names = taxRowNames(jur);
        const lines = await taxLines(page);
        for (const l of lines) {
          const n = nameOf(l.text);
          const want = l.part ? names[l.part] : null;
          if (!want || !want.includes(n)) bad.push(`${p.name} ${c.id}: the Tax row reads "${l.text}", not ${l.part ? `one of ${JSON.stringify(names[l.part])}` : `a row of its own (${JSON.stringify(names)})`}`);
          if (jur.country !== 'US' && /state or local tax|social security/.test(l.text)) bad.push(`${p.name} ${c.id}: "${l.text}"`);
        }
        if (jur.country === 'US' && !lines.some((l) => l.part === 'regional' && /^state( or |\/)local/.test(l.text))) bad.push(`${p.name} ${c.id}: no "state or local tax" row (${JSON.stringify(lines)})`);
        bad.push(...await oneLine(page, '#drawer .wf--tax .wf-detail', `${p.name} ${c.id}`));
        checked += 1;
      }
      if (!checked) skip('none of the five places has a job with Juice in this build');
      assert(!bad.length, bad.join('; '));
      assert(!errors.length, errors.join('; '));
    });

    suite.test(`fix-juice-6: [J-2] ${d.width}x${d.height}: a family's tax line says how the country taxes one earner, never "each person is taxed separately", one line`, async (ctx) => {
      const { st, page, errors } = await open(ctx, d, { household: 'family' });
      const bad = [];
      let checked = 0;
      for (const p of PLACES) {
        const c = await placeCase(ctx, p);
        if (!c || !(await openJuice(page, st, c))) continue;
        const jur = jurOf(c);
        const basis = taxFor(100000, { country: jur.country, region: jur.region }, { household: 'family' }).basis;
        const want = householdTaxLine('family', basis, jur);
        const got = await page.locator('#drawer .wf-tax-basis').first().textContent().catch(() => null);
        const line = (got || '').replace(/\s+/g, ' ').trim();
        if (!want.includes(line)) bad.push(`${p.name} ${c.id}: the tax line reads "${line}", not one of ${JSON.stringify(want)}`);
        if (/separately|one earner;/.test(line)) bad.push(`${p.name} ${c.id}: "${line}"`);
        const hh = ((await page.locator('#drawer .juice-hh-note').first().textContent().catch(() => '')) || '').trim();
        if (!HOUSEHOLD_LINES.family.includes(hh)) bad.push(`${p.name} ${c.id}: the household line reads "${hh}", not one of ${JSON.stringify(HOUSEHOLD_LINES.family)}`);
        const tip = await page.locator('#drawer .juice-household [data-household="family"]').getAttribute('title');
        if (/filing jointly/.test(tip || '')) bad.push(`${p.name}: the Family button's tip still says "${tip}"`);
        bad.push(...await oneLine(page, '#drawer .wf-tax-basis, #drawer .juice-hh-note', `${p.name} ${c.id}`));
        checked += 1;
      }
      if (!checked) skip('none of the five places has a job with Juice in this build');
      assert(!bad.length, bad.join('; '));
      assert(!errors.length, errors.join('; '));
    });

    suite.test(`fix-juice-6: [J-3] ${d.width}x${d.height}: Monthly is remembered across job pages and visits, like the household`, async (ctx) => {
      const a = await placeCase(ctx, PLACES[0]) || await placeCase(ctx, PLACES[4]);
      const b = await placeCase(ctx, PLACES[2]) || await placeCase(ctx, PLACES[3]) || a;
      if (!a) skip('no job with Juice in this build');
      const { st, page, errors } = await open(ctx, d);
      await openJuice(page, st, a);
      await page.locator('#drawer .d-juice .juice-household [data-household="couple"]').click();
      await sleep(600);
      await page.evaluate(() => { const x = document.querySelector('#drawer details.juice-details'); if (x) x.open = true; });
      await page.locator('#drawer .d-juice [data-period="month"]').click();
      await sleep(300);
      assertEq(await page.locator('#drawer .d-juice [data-period="month"]').getAttribute('aria-pressed'), 'true', 'Monthly is picked');
      assertEq(await page.evaluate((k) => localStorage.getItem(k), PERIOD_KEY), JSON.stringify('month'), `localStorage ${PERIOD_KEY}`);
      // Another visit (a new page load), another job: Couple and Monthly both kept.
      await openJuice(page, st, b);
      assertEq(await page.locator('#drawer .d-juice [data-household="couple"]').getAttribute('aria-pressed'), 'true', 'the household is remembered (as before)');
      assertEq(await page.locator('#drawer .d-juice [data-period="month"]').getAttribute('aria-pressed'), 'true', `Monthly is remembered on ${b.id} after a reload`);
      const head = (await page.locator('#drawer .juice-head-net').textContent()).trim();
      assert(/\/mo left for a couple in /.test(head), `the headline is monthly: "${head}"`);
      // Yearly is remembered the same way.
      await page.locator('#drawer .d-juice [data-period="year"]').click();
      await sleep(200);
      await openJuice(page, st, a);
      assertEq(await page.locator('#drawer .d-juice [data-period="year"]').getAttribute('aria-pressed'), 'true', 'Yearly is remembered');
      // A bad stored value reads as the default, as the household's does.
      await page.evaluate((k) => localStorage.setItem(k, '"fortnightly"'), PERIOD_KEY);
      await openJuice(page, st, a);
      assertEq(await page.locator('#drawer .d-juice [data-period="year"]').getAttribute('aria-pressed'), 'true', 'an unknown stored value falls back to Yearly');
      assert(!errors.length, errors.join('; '));
    });
  }

  for (const d of [SIZE('iPhone 13 mini'), DESKTOP]) {
    suite.test(`fix-juice-6: [J-4] ${d.width}x${d.height}: the grades say what they mean in the card's badge and the job page; Clusters, Ranges and the chart's edge chips are explained`, async (ctx) => {
      const all = await findCases(ctx);
      const c = all.rindDry;
      if (!c) skip('no Rind or Dry job in this build');
      const { st, page, errors } = await open(ctx, d);
      await page.goto(`${st.beta}/#c=${c.slug}&q=${encodeURIComponent(c.title)}`);
      await ready(page);
      await sleep(600);
      const badges = await page.locator('#resultsList .card .juice-badge').evaluateAll((els) => els.slice(0, 8).map((e) => ({ text: e.textContent.trim(), title: e.title, aria: e.getAttribute('aria-label') })));
      assert(badges.length, `no Juice badges for "${c.title}"`);
      const bad = [];
      for (const x of badges) {
        const m = /(\d+) · (\w+)/.exec(x.text);
        if (!m) { bad.push(`badge "${x.text}"`); continue; }
        const meaning = gradeMeaning(m[2]).replace(/ \(.*$/, '');
        if (!x.title.startsWith(`${m[1]} · ${m[2]}`) || !x.title.includes(meaning)) bad.push(`the "${x.text}" badge's tip doesn't start with what ${m[2]} means: "${x.title.slice(0, 160)}"`);
        if (!(x.aria || '').includes(meaning)) bad.push(`the "${x.text}" badge's accessible name doesn't say what ${m[2]} means: "${x.aria}"`);
      }
      // The job page: the score's tip and the Juice text say what its grade means.
      await openJuice(page, st, c);
      const pill = await page.locator('#drawer .juice-score').evaluate((e) => ({ text: e.textContent.trim(), title: e.title }));
      const g = /· (\w+)/.exec(pill.text)?.[1];
      const meaning = gradeMeaning(g).replace(/ \(.*$/, '');
      if (!pill.title.startsWith(`${pill.text}: ${meaning}`)) bad.push(`the job page's "${pill.text}" tip: "${pill.title.slice(0, 160)}"`);
      const where = (await page.locator('#drawer .juice-where').textContent()).replace(/\s+/g, ' ');
      if (!where.includes(`${g} means ${gradeShort(g)}`)) bad.push(`the Juice text doesn't say what ${g} means: "${where.slice(0, 200)}"`);
      // The Juice filter's Dry chip says Rind is counted there.
      const dry = await page.locator('.kw--juice.kw--dry').first().getAttribute('title').catch(() => null);
      if (dry != null && !/Rind/.test(dry)) bad.push(`the Dry filter's tip doesn't say Rind is counted there: "${dry}"`);
      // The chart's view switch: a plain tip on each button.
      await page.goto(`${st.beta}/#c=google`);
      await ready(page);
      const views = await page.locator('[data-view]').evaluateAll((els) => els.map((e) => ({ v: e.dataset.view, title: e.title })));
      const cl = views.find((v) => v.v === 'clusters')?.title || '', ra = views.find((v) => v.v === 'ranges')?.title || '';
      if (!/^Clusters: each bubble is a group of roles with about the same pay/.test(cl)) bad.push(`Clusters tip: "${cl}"`);
      if (!/^Ranges: one bar for each role/.test(ra)) bad.push(`Ranges tip: "${ra}"`);
      // The edge chips ("‹2", "›13"): an accessible name and a tip that say what they are.
      let chip = null;
      for (const slug of ['google', 'amazon', 'microsoft']) {
        if (slug !== 'google') { await page.goto(`${st.beta}/#c=${slug}`); await ready(page); }
        await page.waitForSelector('#chartHost .ms-bin', { timeout: 60000 }).catch(() => {});
        // fix-data-6: the visible chips only. A hash-only goto keeps the previous board's chart in the page for a moment
        // (its chips laid out at 0×0), so the first chip in the DOM could be that board's ("›1" from Microsoft) while the
        // hover below lands on Google's.
        await page.locator('#chartHost .ms-bin--overflow:visible').first().waitFor({ timeout: 15000 }).catch(() => {});
        chip = await page.locator('#chartHost .ms-bin--overflow:visible').first().evaluate((e) => ({ text: e.textContent.trim(), aria: e.getAttribute('aria-label') })).catch(() => null);
        if (chip) break;
      }
      if (!chip) ctx.notes.push('fix-juice-6 [J-4]: no edge chip on Google, Amazon or Microsoft in this build; the chip words were not checked');
      else {
        const side = chip.text.startsWith('›') ? 'right' : 'left';
        if (!new RegExp(`past the ${side} edge of the chart`).test(chip.aria || '')) bad.push(`the "${chip.text}" chip's accessible name: "${chip.aria}"`);
        if (d.desktop) {
          // Its tip (the chart's own, on hover) says the same.
          await page.locator('#chartHost .ms-bin--overflow:visible').first().hover();
          await sleep(300);
          const tip = await page.locator('.ms-viz-tip:not([hidden])').first().textContent().catch(() => '');
          if (!new RegExp(`paid (above|below) .*, past the ${side} edge of the chart`).test(tip || '')) bad.push(`the "${chip.text}" chip's tip: "${(tip || '').slice(0, 160)}"`);
        }
      }
      assert(!bad.length, bad.join('; '));
      assert(!errors.length, errors.join('; '));
    });

    suite.test(`fix-juice-6: [J-5] ${d.width}x${d.height}: a card's Juice grade is for the place the card names first, and its tip and accessible name say the place`, async (ctx) => {
      const all = await findCases(ctx);
      const cases = Object.values(all.j5);
      if (!cases.length) skip('no posting scored at several places with its best place listed after its first in this build');
      const { st, page, errors } = await open(ctx, d);
      const bad = [];
      for (const c of cases) {
        await page.goto('about:blank');
        await page.goto(`${st.beta}/#c=${c.slug}&q=${encodeURIComponent(c.title)}`);
        await ready(page);
        await sleep(400);
        const card = page.locator(`#resultsList .card[data-id="${c.id}"]`);
        if (!(await card.count())) { bad.push(`${c.slug} ${c.id}: no card for "${c.title}"`); continue; }
        const r = await card.evaluate((e) => ({ loc: e.querySelector('.card-loc')?.textContent.trim(), badge: e.querySelector('.juice-badge')?.textContent.trim(), title: e.querySelector('.juice-badge')?.title, aria: e.querySelector('.juice-badge')?.getAttribute('aria-label') }));
        const grade = `${c.score} · ${c.grade}`;
        if (!(r.loc || '').startsWith(c.graded)) bad.push(`${c.slug} ${c.id}: the card reads "${r.loc}" and its Juice "${r.badge}" is for ${c.graded}`);
        if (!(r.title || '').startsWith(`${grade}, for ${c.gradedCity}`)) bad.push(`${c.slug} ${c.id}: the badge's tip doesn't start "${grade}, for ${c.gradedCity}": "${(r.title || '').slice(0, 120)}"`);
        if (!(r.aria || '').includes(`${c.grade}, for ${c.gradedCity}`)) bad.push(`${c.slug} ${c.id}: the badge's accessible name doesn't name ${c.gradedCity}: "${r.aria}"`);
        bad.push(...await oneLine(page, `#resultsList .card[data-id="${c.id}"] .juice-badge`, `${c.slug} ${c.id} badge`));
      }
      assert(!bad.length, bad.join('; '));
      assert(!errors.length, errors.join('; '));
    });
  }

  // [phone] Every line this lane added or changed, at every size: the Tax row's lines and the household lines for a
  // family in Ontario (the longest names: "federal income tax", "provincial tax", "CPP and EI") and the UK.
  for (const d of [...ALL_SIZES, DESKTOP]) {
    suite.test(`fix-juice-6: [phone] ${d.name} ${d.width}x${d.height}: the Tax row's lines and the household lines are one line each, never cut`, async (ctx) => {
      const cases = [await placeCase(ctx, PLACES[0]), await placeCase(ctx, PLACES[4]), await placeCase(ctx, PLACES[2])].filter(Boolean);
      if (!cases.length) skip('no Ontario, US or UK job with Juice in this build');
      const { st, page, errors } = await open(ctx, d, { household: 'family' });
      const bad = [];
      for (const c of cases) {
        if (!(await openJuice(page, st, c))) continue;
        for (const period of ['year', 'month']) {
          const b = page.locator(`#drawer .d-juice [data-period="${period}"]`);
          if (await b.count()) { await b.click(); await sleep(400); }
          bad.push(...await oneLine(page, '#drawer .wf--tax .wf-detail, #drawer .juice-hh-note', `${c.id} ${period}`));
        }
      }
      assert(!bad.length, bad.join('; '));
      assert(!errors.length, errors.join('; '));
    });
  }
}

// Fix wave 3, app lane (docs/process/fix3-app.md): the app-shell side of the beta persona review's
// findings BP-1 to BP-17 (docs/process/lead.md "Beta, stage 1c"; docs/process/persona-beta-*.md) and the
// beta landing. Each test is tagged with the finding it encodes.
// Like the beta suites, these serve the static build (BETA_QA_DIST or dist/, `npm run build`) under
// /melon-seek/ and open /melon-seek/ and /melon-seek/beta/; every test skips without a beta build. Fields
// the data lane adds (salary.partTime, sections.preferred) are injected into a bundled list with a route
// fixture (the list unpacked with public/api.js unpackJobs), so these tests do not wait for that lane.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PHONE = { viewport: { width: 390, height: 844 }, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lib = (rel) => import(pathToFileURL(path.join(ROOT, 'public', rel)).href);
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

/** The bundled list of `slug` on a site, unpacked (plain Job objects), or null. */
async function plainList(st, slug, site = 'beta') {
  const file = path.join(st.dist, ...(site === 'beta' ? ['beta'] : []), 'api', 'jobs', `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const { unpackJobs } = await lib('api.js');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { format, shared, dict, columns, ...body } = raw; // eslint-disable-line no-unused-vars
  return { ...body, jobs: unpackJobs(raw) };
}
/** A job's description record from the build (sections move there for big boards): { name, body } or null. */
async function descRecord(st, job, site = 'beta') {
  const { sanitizeJobId } = await lib('api.js');
  const name = `${sanitizeJobId(job)}.json`;
  const file = path.join(st.dist, ...(site === 'beta' ? ['beta'] : []), 'api', 'desc', job.company, name);
  return fs.existsSync(file) ? { name, body: JSON.parse(fs.readFileSync(file, 'utf8')) } : null;
}

/**
 * A fresh context and page. `lists: { 'beta/apple': body }` serves those bundled lists instead of the
 * build's (a route fixture); `routes: [[RegExp, body]]` any other JSON; other hosts are aborted.
 */
async function open(ctx, st, { url, device = { viewport: DESKTOP, deviceScaleFactor: 1 }, lists = {}, routes = [], storageState, wait = true } = {}) {
  const context = await ctx.browser.newContext({ colorScheme: 'light', ...device, ...(storageState ? { storageState } : {}) });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  for (const [key, body] of Object.entries(lists)) {
    const [site, slug] = key.split('/');
    const re = new RegExp(`/melon-seek/${site === 'beta' ? 'beta/' : ''}api/jobs/${slug}\\.json$`);
    await context.route(re, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }));
  }
  for (const [re, body] of routes) await context.route(re, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && loc && !loc.startsWith(st.origin)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  if (url) { await page.goto(url); if (wait) await ready(page); }
  return { context, page, errors };
}
async function ready(page) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && /role/.test(t.textContent) && !/Loading/.test(t.textContent); }, null, { timeout: 60000 });
  await sleep(500);
}
async function setup(ctx) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build writes dist/beta/)');
  ctx.cleanup.push(() => st.close());
  return st;
}
const params = async (page) => new URLSearchParams(await page.evaluate(() => location.hash.slice(1)));
const roleCount = async (page) => Number((await page.locator('#resultsTitle strong').innerText()).replace(/\D/g, ''));
const noErrors = (errors) => assert(!errors.length, errors.join(' | '));
async function openDrawerFor(page, id) {
  await page.evaluate((jid) => { location.hash = `${location.hash.replace(/&?job=[^&]*/, '')}&job=${encodeURIComponent(jid)}`; }, id);
  await page.waitForSelector('#drawer.is-open'); await sleep(500);
}
/** Switch company through the company menu, as a person does. */
async function switchTo(page, name, slug) {
  await page.click('#companyMenuBtn'); await sleep(300);
  await page.locator('#popover .company-item').filter({ has: page.locator('.company-item-name', { hasText: new RegExp(`^${name}$`) }) }).click();
  await page.waitForFunction((s) => location.hash.includes(`c=${s}`) && document.querySelector('#resultsTitle strong'), slug, { timeout: 60000 });
  await sleep(900);
}
/** Type into the Location search of the desktop filter panel; returns the listed place labels. */
async function locationSearch(page, text) {
  const sec = page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: 'Location' }) });
  const input = sec.locator('input.fsearch');
  await input.fill(text); await sleep(250);
  return sec.locator('.check-label').allInnerTexts();
}
const COUNTRY_SENTENCE = { US: 'the US', GB: 'the UK' };

export function registerFix3AppTests(suite) {
  suite.test('Fix3 app: [BP-1] a yearly-rate internship reads "€47,000 a year (13-week internship)", never "Fixed-term pay"; Juice agrees', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'google');
    if (!body) skip('no Google list');
    const job = body.jobs.find((j) => j.salary?.termWeeks > 0 && !j.salary.termWeeksMax && j.salary.min === j.salary.max
      && !['hour', 'day', 'week', 'month', 'term'].includes(j.salary.originalInterval) && j.salary.kind !== 'stipend' && /intern/i.test(j.title));
    if (!job) skip('no yearly-rate internship on Google');
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=google&q=${encodeURIComponent(job.title)}&sort=title` });
    const card = page.locator(`#resultsList .card[data-id="${job.id}"]`);
    const amount = `${{ EUR: '€', USD: '$', GBP: '£' }[job.salary.currency] ?? `${job.salary.currency} `}${job.salary.min.toLocaleString('en-US')}`;
    const tip = await card.locator('.sal-pill').getAttribute('title');
    assertEq(tip, `${amount} a year (${job.salary.termWeeks}-week internship)`, 'card pay tooltip');
    assert(!/fixed-term/i.test(await card.getAttribute('aria-label')), 'the card is not named fixed-term pay');
    await openDrawerFor(page, job.id);
    const amt = (await page.locator('#drawer .d-sal-amt').innerText()).trim();
    assertEq(amt, `${amount} a year`, 'pay block amount');
    const sub = (await page.locator('#drawer .d-sal-top .muted').first().innerText()).trim();
    assert(sub.includes(`${job.salary.termWeeks}-week internship`), `pay block subline "${sub}"`);
    const block = await page.locator('#drawer .d-salary').innerText();
    assert(!/Fixed-term pay, not a yearly salary/.test(block), `no fixed-term label on a yearly rate: ${block}`);
    // Juice treats it as the yearly rate the pay block shows, for the internship's weeks.
    const juice = page.locator('#drawer .d-juice');
    if (await juice.count()) {
      await juice.locator('summary').click(); await sleep(200);
      const where = await juice.locator('.juice-where').innerText();
      assert(new RegExp(`internship lasts about ${job.salary.termWeeks} weeks`).test(where), `Juice says how long the internship lasts: "${where}"`);
      const dollars = (s) => Number(String(s).replace(/[^\d]/g, ''));
      await juice.locator('[data-period="month"]').click(); await sleep(200);
      const month = dollars(await juice.locator('.wf--gross .wf-value').innerText());
      await juice.locator('[data-period="term"]').click(); await sleep(200);
      const gross = await juice.locator('.wf--gross .wf-value').innerText();
      assert(/total$/.test(gross.trim()), `whole-term gross "${gross}"`);
      const want = (12 * job.salary.termWeeks) / 52; // the yearly rate for the internship's weeks
      assert(Math.abs(dollars(gross) / month - want) < 0.05 * want, `whole term ${gross} is ${job.salary.termWeeks} weeks of the yearly rate (monthly $${month})`);
    }
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-1] pay stated per week or for the whole term stays fixed-term pay; a term amount is the posted one', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'anthropic');
    const weekly = body?.jobs.find((j) => j.salary?.originalInterval === 'week' && j.salary.termWeeks > 0);
    const term = body?.jobs.find((j) => j.salary?.originalInterval === 'term' && j.salary.termWeeks > 0);
    if (!weekly && !term) skip('no weekly or whole-term pay on Anthropic');
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=anthropic` });
    if (weekly) {
      await openDrawerFor(page, weekly.id);
      assert(/ a week$/.test((await page.locator('#drawer .d-sal-amt').innerText()).trim()), 'weekly amount');
      assert(/Fixed-term pay, not a yearly salary/.test(await page.locator('#drawer .d-salary').innerText()), 'weekly pay is fixed-term pay');
      await page.keyboard.press('Escape'); await sleep(300);
    }
    if (term) {
      await openDrawerFor(page, term.id);
      const amt = (await page.locator('#drawer .d-sal-amt').innerText()).trim();
      const posted = (term.salary.text.match(/\$[\d,]+/) || [''])[0];
      assert(posted && amt.startsWith(posted), `a whole-term amount is the posted one: "${amt}" (posted ${term.salary.text})`);
      assert(/Fixed-term pay, not a yearly salary/.test(await page.locator('#drawer .d-salary').innerText()), 'term pay is fixed-term pay');
    }
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-2] under a Location filter, a card whose pay is for another country says "Pay posted for … only" and sorts as no pay', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'google');
    if (!body) skip('no Google list');
    const { payLocations, pricedPlaces, placeLabel, countryInSentence } = await lib('features/shared.js');
    const inZurich = body.jobs.filter((j) => j.salary && (j.locations || []).some((l) => l.city === 'Zurich'));
    const foreign = inZurich.filter((j) => !payLocations(j).some((l) => l.city === 'Zurich' || (l.country === 'CH' && !l.city)));
    if (!foreign.length) skip('no Zurich role paid for another country');
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=google&l=Zurich&sort=salary-desc` });
    const n = await roleCount(page);
    const pills = await page.$$eval('#resultsList .card[data-id]', (els) => els.map((e) => ({ id: e.dataset.id, pill: e.querySelector('.sal-pill')?.textContent || '' })));
    for (const j of foreign) {
      const c = pills.find((p) => p.id === j.id);
      if (!c) continue; // past the first page
      // P-4 (fix-data-6): the places with posted pay follow the posting's rows (payLocations, as payAt does): a Munich row
      // beside a US row is pay posted for Munich (google:108135834237969094). The card names those places, or, when none
      // is in the country picked, their countries.
      const countries = [...new Set(payLocations(j).map((l) => String(l.country || '').toUpperCase()).filter(Boolean))];
      const byCountry = !countries.length ? null : `Pay posted for ${countries.length > 2 ? 'other countries' : countries.map((cc) => COUNTRY_SENTENCE[cc] || countryInSentence(cc)).join(' and ')} only`;
      const priced = (j.salary.ranges?.length || j.salary.places?.length) ? pricedPlaces(j) : [];
      const byPlace = priced.length ? `Pay posted for ${placeLabel(priced)} only` : null;
      assert(/^Pay posted for .+ only$/.test(c.pill), `${j.id} (${j.salary.currency}) card pill "${c.pill}"`);
      const wants = [byCountry, byPlace].filter(Boolean);
      if (wants.length) assert(wants.includes(c.pill), `${j.id} names the places or countries its pay is posted for: "${c.pill}", want ${wants.map((w) => `"${w}"`).join(' or ')}`);
    }
    // "Highest pay" sorts them with the roles that list no pay here: after every role with pay for Zurich.
    const firstForeign = pills.findIndex((p) => /^Pay posted for/.test(p.pill) || /^(No salary|No pay listed)$/.test(p.pill));
    const lastPaid = pills.map((p) => !/^Pay posted for|^No salary$|^No pay listed$|^Pay unclear$/.test(p.pill)).lastIndexOf(true);
    assert(firstForeign < 0 || lastPaid < firstForeign, `paid-for-Zurich roles come first (last paid #${lastPaid}, first not #${firstForeign} of ${n})`);
    // The stats line agrees: no share of pay posted for Zurich from US pay.
    assert(/show pay for Zurich/.test(await page.locator('#statsLine').innerText()), 'stats line names Zurich');
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-2] NVIDIA, Munich and a €110K+ minimum: no card passes the minimum on another country\'s pay; the box says what it left out', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'nvidia');
    if (!body) skip('no NVIDIA list');
    const { payLocations } = await lib('features/shared.js');
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=nvidia&l=Munich&smin=126000` });
    const ids = await page.$$eval('#resultsList .card[data-id]', (els) => els.map((e) => e.dataset.id));
    const byId = new Map(body.jobs.map((j) => [j.id, j]));
    for (const id of ids) {
      const j = byId.get(id);
      assert(j?.salary, `${id} has pay`);
      assert(payLocations(j).some((l) => l.city === 'Munich' || (l.country === 'DE' && !l.city)), `${id} passed the Munich pay filter on ${j.salary.currency} pay for ${payLocations(j).map((l) => l.name).join(', ')}`);
    }
    const plnHere = body.jobs.filter((j) => j.salary?.currency === 'PLN' && (j.locations || []).some((l) => l.city === 'Munich' || (l.country === 'DE' && !l.city)));
    if (plnHere.length) {
      await page.click('[data-pop="salary"]'); await sleep(400);
      const note = await page.locator('#popover .salary-nopay').textContent(); // fix-phone-text: the sentence is in its Details
      assert(/pay is posted for another country/.test(note), `the pay filter says it hides pay posted for another country: "${note}"`);
    }
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-2] Juice is never shown for a place from another country\'s pay, and the drawer says why', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'nvidia');
    const pln = body?.jobs.find((j) => j.salary?.currency === 'PLN' && (j.locations || []).length);
    if (!pln) skip('no Polish pay on NVIDIA');
    // A Polish range listed for Poland (no city with living costs) and Munich: the old Juice fell back to
    // Munich from the Polish pay (currencyMismatch).
    pln.locations = [{ name: 'Poland', country: 'PL', city: null, region: null, remote: false, lat: 52, lng: 19 },
      { name: 'Munich, Germany', city: 'Munich', country: 'DE', region: 'BY', remote: false, lat: 48.14, lng: 11.58 }];
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=nvidia&l=Munich&q=${encodeURIComponent(pln.title)}`, lists: { 'beta/nvidia': body } });
    const card = page.locator(`#resultsList .card[data-id="${pln.id}"]`);
    assertEq(await card.count(), 1, 'the role stays listed under Munich');
    assertEq(await card.locator('.juice-badge').count(), 0, 'no Juice badge from Polish pay in Munich');
    assertEq((await card.locator('.sal-pill').innerText()).trim(), 'Pay posted for Poland only', 'card pill');
    await openDrawerFor(page, pln.id);
    const txt = await page.locator('#drawer .drawer-scroll').innerText();
    assert(!/applied as posted/.test(txt), 'no "applied as posted" fallback');
    assert(/This pay is posted for Poland, not for Munich\./.test(await page.locator('#drawer .d-pay-caption').innerText()), 'the pay block says where its pay is for');
    assert(/No Juice/.test(txt) && /Poland/.test(txt), `the drawer says why there is no Juice: ${(txt.match(/No Juice[^\n]*/) || [''])[0]}`);
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-2] without a filter, a card leads with a place its pay is for', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'google');
    const { payLocations } = await lib('features/shared.js');
    const job = body?.jobs.find((j) => j.salary && (j.locations || []).length > 1 && !payLocations(j).includes(j.locations[0]) && payLocations(j).length < j.locations.length && payLocations(j)[0]?.city);
    if (!job) skip('no Google role listed first in a country its pay is not for');
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=google&q=${encodeURIComponent(job.title)}&sort=title` });
    const loc = (await page.locator(`#resultsList .card[data-id="${job.id}"] .card-loc`).innerText()).trim();
    // fix-juice-6 J-5: among the pay's places, the one its Juice grade is for comes first, so any of them may lead.
    const pay = payLocations(job).filter((l) => l.city);
    assert(pay.some((l) => loc.startsWith(l.city)), `card location "${loc}" starts with a place its pay is for: ${pay.map((l) => l.city).join(', ')} (${job.salary.currency} pay; listed ${job.locations.map((l) => l.name).join(' | ')})`);
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-6] a Location search for a country or a local name lists its cities', async (ctx) => {
    const st = await setup(ctx);
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=google` });
    const ireland = await locationSearch(page, 'Ireland');
    assert(ireland.includes('Dublin'), `"Ireland" lists Dublin: ${ireland.join(', ')}`);
    const canada = await locationSearch(page, 'Canada');
    assert(canada.includes('Toronto'), `"Canada" lists Toronto: ${canada.join(', ')}`);
    const zh = await locationSearch(page, 'Zürich');
    assert(zh.includes('Zurich'), `"Zürich" lists Zurich: ${zh.join(', ')}`);
    const mu = await locationSearch(page, 'München');
    assert(mu.includes('Munich'), `"München" lists Munich: ${mu.join(', ')}`);
    const de = await locationSearch(page, 'Germany');
    assert(de.includes('Munich') && de.length > 1, `"Germany" lists its cities: ${de.join(', ')}`);
    const nv = await open(ctx, st, { url: `${st.beta}/#c=nvidia` });
    const il = await locationSearch(nv.page, 'Israel');
    assert(il.includes('Tel Aviv') && il.length >= 3, `"Israel" lists Tel Aviv and more: ${il.join(', ')}`);
    const be = await locationSearch(page, 'Belgium');
    assert(be.includes('Brussels'), `"Belgium" lists Brussels: ${be.join(', ')}`);
    const none = await locationSearch(page, 'Atlantis');
    assertEq(none.length, 0, 'a place that is nowhere still finds nothing');
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-9] part-time hourly pay shows the hourly rate as posted; a yearly figure says "if full-time"; no Juice, and why', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'apple');
    const job = body?.jobs.find((j) => /part/i.test(j.employmentType || '') && j.salary?.originalInterval === 'hour' && j.salary.min !== j.salary.max);
    if (!job) skip('no part-time hourly Apple role');
    job.salary.partTime = true; // what the data lane adds (shared decision 4)
    const lo = job.salary.min / 2080, hi = job.salary.max / 2080;
    const cents = (v) => Math.abs(v - Math.round(v)) >= 0.005;
    const f = (v) => (cents(lo) || cents(hi) ? v.toFixed(2) : String(Math.round(v)));
    const hourly = `$${f(lo)}–${f(hi)}`;
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=apple&q=${encodeURIComponent(job.title)}&sort=title`, lists: { 'beta/apple': body } });
    const card = page.locator(`#resultsList .card[data-id="${job.id}"]`);
    assertEq((await card.locator('.sal-pill').innerText()).trim(), `${hourly}/hour`, 'card shows the hourly rate');
    assertEq(await card.locator('.juice-badge').count(), 0, 'no Juice badge from a full-time year');
    await openDrawerFor(page, job.id);
    assertEq((await page.locator('#drawer .d-sal-amt').innerText()).trim(), `${hourly} an hour`, 'drawer shows the hourly rate');
    const block = await page.locator('#drawer .d-salary').innerText();
    // fix-density: the line reads "If full-time: $X–Y a year"; the 2,080 hours are in the pay block's Details.
    assert(/If full-time: \$[\d,]+–[\d,]+ a year/.test(block), `the yearly figure says "if full-time": ${block}`);
    assert(/If full-time \(2,080 hours\): \$[\d,]+–[\d,]+ a year/.test(await page.locator('#drawer .d-pay-note .ms-note__list').textContent()), 'the Details give the 2,080 hours');
    assert(/part-time/i.test(block), 'says part-time');
    const txt = await page.locator('#drawer .drawer-scroll').innerText();
    assert(/No Juice/.test(txt) && /hours/.test(txt), `the drawer says why there is no Juice: ${(txt.match(/No Juice[^\n]*/) || [''])[0]}`);
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-10] a place carries across boards by the place, not by each board\'s label ("Columbus, OH" -> "Columbus")', async (ctx) => {
    const st = await setup(ctx);
    const google = await plainList(st, 'google');
    const apple = await plainList(st, 'apple');
    if (!google || !apple) skip('no Google or Apple list');
    // The case needs one place under two labels: Apple lists two places of that name, so its key carries
    // the region ("Columbus, OH": public/app.js disambiguateLocations), while Google lists only that one
    // and keys it by the bare city ("Columbus"). On 2026-10-11 that was Columbus, OH (Apple also listed
    // Columbus, GA). On the 2026-10-16 crawl Apple lists Columbus, OH only, so both boards key it
    // "Columbus" and a link to "Columbus, OH" finds no Apple role; the case is then the place of this
    // shape the boards list most that day (Cambridge, MA: Apple also lists Cambridge, England).
    const variants = (b) => {
      const m = new Map(); // city -> Map("region|country" -> { tag, n })
      for (const j of b.jobs) for (const l of j.locations || []) {
        if (!l || l.remote || !l.city) continue;
        const v = m.get(l.city) || new Map();
        const k = `${l.region || ''}|${l.country || ''}`;
        v.set(k, { tag: l.region || l.country, n: (v.get(k)?.n || 0) + 1 });
        m.set(l.city, v);
      }
      return m;
    };
    const va = variants(apple), vg = variants(google);
    const cases = [];
    for (const [city, a] of va) {
      const g = vg.get(city);
      if (city === 'Washington' || a.size < 2 || !g || g.size !== 1) continue; // "Washington" always carries its region
      const [[k, { n }]] = [...g];
      if (a.get(k)?.tag) cases.push({ city, tag: a.get(k).tag, n: Math.min(n, a.get(k).n) });
    }
    if (!cases.length) skip('no place that Apple labels "City, Region" and Google labels "City"');
    cases.sort((x, y) => (y.city === 'Columbus') - (x.city === 'Columbus') || y.n - x.n || x.city.localeCompare(y.city));
    const { city, tag } = cases[0];
    const appleKey = `${city}, ${tag}`;
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=apple&l=${encodeURIComponent(appleKey)}` });
    assert(await roleCount(page) > 0, `Apple's own label "${appleKey}" lists its roles`);
    await switchTo(page, 'Google', 'google');
    const l = (await params(page)).getAll('l');
    assertEq(l.join(), city, `Google's own key for ${appleKey}`);
    const t = await page.locator('#toast').innerText();
    assert(new RegExp(`Kept ${city}`).test(t) && !/[Dd]ropped/.test(t), `toast "${t}"`);
    assert(await roleCount(page) > 0, `Google's ${city} roles are listed`);
    // Back to Apple: Google's "${city}" is that one place there, not both of Apple's places of that name.
    await switchTo(page, 'Apple', 'apple');
    assertEq((await params(page)).getAll('l').join(), appleKey, 'Apple\'s key for the same place');
    noErrors(errors);
  });

  // qa-ci-6: the boards by their property, from the build in front of the test: Munich at the first and the last board,
  // not at the one between. Microsoft, the board between since BP-10, lists one Munich posting on 2026-10-23.
  suite.test('Fix3 app: [BP-10] a filter a board does not have is set aside, and put back at the next board that has it', async (ctx) => {
    const st = await setup(ctx);
    const names = new Map(JSON.parse(fs.readFileSync(path.join(st.dist, 'beta', 'api', 'companies.json'), 'utf8')).map((c) => [c.slug, c.name]));
    const lists = new Map();
    const listOf = async (slug) => { if (!lists.has(slug)) lists.set(slug, names.has(slug) ? await plainList(st, slug) : null); return lists.get(slug); };
    const has = (b, c) => b.jobs.some((j) => (j.locations || []).some((l) => l.city === c));
    const pick = async (slugs, want) => { for (const s of slugs) { const b = await listOf(s); if (b && has(b, 'Munich') === want) return s; } return null; };
    const from = await pick(['google', 'apple', 'nvidia', 'amazon'], true);
    const back = await pick(['openai', 'anthropic', 'cohere', 'shieldai'].filter((s) => s !== from), true);
    const mid = await pick(['microsoft', 'netflix', 'meta', 'xai', 'scaleai', 'anduril'], false);
    if (!from || !back || !mid) skip('needs Munich at two boards of the beta site and a third board without it');
    // The person's own place at the board between: its most common city.
    const cities = new Map();
    for (const j of (await listOf(mid)).jobs) for (const l of j.locations || []) if (l.city && !l.remote) cities.set(l.city, (cities.get(l.city) || 0) + 1);
    const own = [...cities].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!own) skip(`${names.get(mid)} lists no city`);
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=${from}&l=Munich` });
    await switchTo(page, names.get(mid), mid);
    assertEq((await params(page)).getAll('l').join(), '', `${names.get(mid)} has no Munich`);
    const t1 = await page.locator('#toast').innerText();
    assert(new RegExp(`[Dd]ropped Munich \\(not at ${names.get(mid)}\\) for now`).test(t1), `drop toast "${t1}"`);
    await switchTo(page, names.get(back), back);
    assertEq((await params(page)).getAll('l').join(), 'Munich', `Munich is back at ${names.get(back)}`);
    const t2 = await page.locator('#toast').innerText();
    assert(/[Pp]ut back Munich/.test(t2), `restore toast "${t2}"`);
    // fix-app-6 (BN-5): a place the person adds in between is added to what was set aside, which still comes back where
    // it exists ("for now", as the toast said); only Clear all or the Location Reset drops it.
    await switchTo(page, names.get(mid), mid);
    await page.evaluate((own) => { location.hash = location.hash.replace(/&?l=[^&]*/g, '') + `&l=${encodeURIComponent(own)}`; }, own); await sleep(800);
    await switchTo(page, names.get(from), from);
    assert((await params(page)).getAll('l').includes('Munich'), 'Munich, set aside "for now", is lost once another place is picked');
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-12] British and American spellings find the same roles (centre, defence, programme, organisation)', async (ctx) => {
    const st = await setup(ctx);
    const count = async (page, site, slug, q) => {
      await page.goto(`${site}/#c=${slug}&q=${encodeURIComponent(q)}`); await ready(page);
      return roleCount(page);
    };
    const { page, errors } = await open(ctx, st, {});
    for (const [site, slug, uk, us] of [[st.beta, 'google', 'data centre', 'data center'], [st.beta, 'google', 'programme manager', 'program manager'],
      [st.beta, 'google', 'organisation', 'organization'], [st.main, 'anduril', 'defence', 'defense'], [st.beta, 'apple', 'colour', 'color']]) {
      const a = await count(page, site, slug, uk), b = await count(page, site, slug, us);
      assert(b > 0, `${slug} "${us}" finds roles`);
      assertEq(a, b, `${slug}: "${uk}" and "${us}" find the same roles`);
    }
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-13] the stats line names its median "base pay median" and leaves on-target earnings out', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'anthropic');
    if (!body?.jobs.some((j) => j.salary?.kind === 'ote')) skip('no on-target earnings on Anthropic');
    const { toUSD, formatMoney } = await lib('viz/palette.js');
    // fix-mr-3 (MR-39): with pay in two or more currencies, the median is the main currency's (shared.js mainPayCurrency).
    const { mainPayCurrency } = await lib('features/shared.js');
    const base = body.jobs.filter((j) => j.salary && j.salary.kind !== 'ote');
    const main = mainPayCurrency(base.map((j) => j.salary.currency));
    const mids = base.filter((j) => !main || String(j.salary.currency || 'USD').toUpperCase() === main).map((j) => toUSD(j.salary.mid ?? (j.salary.min + j.salary.max) / 2, j.salary.currency)).filter(Number.isFinite).sort((a, b) => a - b);
    const q = (mids.length - 1) * 0.5;
    const median = mids[Math.floor(q)] + (mids[Math.ceil(q)] - mids[Math.floor(q)]) * (q - Math.floor(q));
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=anthropic` });
    const stat = page.locator('#statsLine .stat', { hasText: 'base pay median' });
    assertEq(await stat.count(), 1, `stats line: ${await page.locator('#statsLine').innerText()}`);
    assertEq((await stat.locator('strong').innerText()).trim(), formatMoney(median), 'the median of base pay only');
    assert(/on-target earnings/.test(await stat.getAttribute('title')), 'the tooltip says on-target earnings are left out');
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-14] "What they look for" shows "Required" and "Nice to have" when the posting has preferred qualifications', async (ctx) => {
    const st = await setup(ctx);
    // In the list (xAI keeps its sections in the bundled list) and in a description file (Google's move there).
    const xai = await plainList(st, 'xai');
    const job = xai?.jobs.find((j) => j.sections?.fit?.length >= 2);
    if (!job) skip('no xAI role with fit bullets in the list');
    job.sections.preferred = ['Experience with large-scale training runs', 'A published paper'];
    const google = await plainList(st, 'google');
    let g = null, rec = null;
    for (const j of (google?.jobs || []).slice(0, 50)) { rec = await descRecord(st, j); if (rec?.body.sections?.fit?.length) { g = j; break; } }
    const routes = [];
    if (g) {
      rec.body.sections.preferred = ['A master’s degree'];
      routes.push([new RegExp(`/api/desc/google/${rec.name.replace(/[.~]/g, '\\$&')}$`), rec.body]);
    }
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=xai`, lists: { 'beta/xai': xai }, routes });
    await openDrawerFor(page, job.id);
    const about = page.locator('#drawer .d-about');
    const heads = await about.locator('h5').allTextContents(); // the section may start folded (drawer budget)
    assertEq(heads.join(' | '), 'Required | Nice to have', 'sub-headings');
    const look = await about.textContent();
    assert(look.includes('What they look for') && look.includes('A published paper') && look.includes(job.sections.fit[0]), 'both lists are shown');
    // Without preferred qualifications, the list is as before: no sub-headings. The posting must have
    // no preferred list of its own: on the 2026-10-16 crawl 261 of xAI's 303 roles with fit bullets
    // have one (the first, "Application Security Engineer", has 9), and those rightly show both.
    const plain = xai.jobs.find((j) => j !== job && j.sections?.fit?.length && !j.sections?.preferred?.length);
    if (plain) {
      await page.keyboard.press('Escape'); await sleep(300);
      await openDrawerFor(page, plain.id);
      assertEq(await page.locator('#drawer .d-about h5').count(), 0, 'no sub-headings without a preferred list');
    }
    if (g) {
      await page.goto(`${st.beta}/#c=google&job=${encodeURIComponent(g.id)}`); await ready(page);
      await page.waitForSelector('#drawer.is-open'); await sleep(1500);
      const txt = await page.locator('#drawer .d-about').textContent();
      assert(txt.includes('A master’s degree') && txt.includes('Nice to have'), `preferred bullets that arrive with the description: ${txt.slice(0, 200)}`);
    }
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-16] one drawer, one age rule: "Updated" and "Listed" round the same way, in words', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'anthropic');
    const job = body?.jobs.find((j) => 'ageDays' in j);
    if (!job) skip('no Anthropic role');
    const t = new Date(Date.now() - 1.6 * 864e5).toISOString();
    Object.assign(job, { postedAt: t, updatedAt: t, ageDays: 1, ageIsMinimum: false, firstSeenAt: null });
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=anthropic`, lists: { 'beta/anthropic': body } });
    await openDrawerFor(page, job.id);
    assertEq((await page.locator('#drawer .d-updated').innerText()).trim(), 'Updated 1 day ago', 'updated');
    assert(/^Listed 1 day ago/.test((await page.locator('#drawer .listing-lines li').first().innerText()).trim()), 'listed');
    noErrors(errors);
  });

  suite.test('Fix3 app: [BP-17] the Remote filter: On-site counts the roles that are not remote, so Any = Remote + On-site', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'microsoft');
    if (!body) skip('no Microsoft list');
    const remote = body.jobs.filter((j) => j.remote).length;
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=microsoft` });
    const sec = page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: 'Remote' }) });
    const counts = Object.fromEntries(await sec.locator('button').evaluateAll((bs) => bs.map((b) => [b.firstElementChild.textContent, Number(b.querySelector('.seg-count').textContent)])));
    assertEq(counts.Any, body.jobs.length, 'Any');
    assertEq(counts.Remote, remote, 'Remote');
    assertEq(counts['On-site'], body.jobs.length - remote, 'On-site is every role that is not remote');
    await sec.locator('button', { hasText: 'On-site' }).click(); await sleep(600);
    assertEq(await roleCount(page), body.jobs.length - remote, 'the On-site filter lists them');
    noErrors(errors);
  });

  suite.test('Fix3 app: [beta landing] a first visit to /beta/ opens the first Big tech board; the main site still opens on its first company', async (ctx) => {
    const st = await setup(ctx);
    const companies = JSON.parse(fs.readFileSync(path.join(st.dist, 'beta', 'api', 'companies.json'), 'utf8'));
    const first = companies.find((c) => c.live === false);
    if (!first) skip('no big-tech board in the beta build');
    const b = await open(ctx, st, { url: `${st.beta}/` });
    assertEq((await params(b.page)).get('c'), first.slug, 'beta opens on the first Big tech board');
    assert((await b.page.locator('#companyMenuBtn .company-name').innerText()).trim() === first.name, 'the company button names it');
    const m = await open(ctx, st, { url: `${st.main}/` });
    const mainFirst = JSON.parse(fs.readFileSync(path.join(st.dist, 'api', 'companies.json'), 'utf8'))[0].slug;
    assertEq((await params(m.page)).get('c'), mainFirst, 'the main site is unchanged');
    // A return visit still reopens the last view (I-4), on beta too.
    await b.page.goto(`${st.beta}/#c=netflix`); await ready(b.page);
    await b.page.goto(`${st.beta}/`); await ready(b.page);
    assertEq((await params(b.page)).get('c'), 'netflix', 'return visit reopens the last company');
    const ph = await open(ctx, st, { url: `${st.beta}/`, device: PHONE });
    const name = ph.page.locator('#companyMenuBtn .company-name');
    assert(await name.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'the phone shows the whole company name');
    noErrors([...b.errors, ...m.errors, ...ph.errors]);
  });
}

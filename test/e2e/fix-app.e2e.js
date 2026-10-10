// App-shell fixes from the persona review of the main site (docs/process/fix-app.md; findings P-n and
// I-n in docs/process/lead.md, "Persona review of the main site", and docs/process/persona-stable-*.md).
// Each test is tagged with the finding it encodes. They run against the real server that scripts/e2e.js
// starts (snapshot data); fields the pay-data lane adds (salary.kind 'ote', salary.termWeeks) are
// injected into /api/jobs with a route fixture, so these tests do not wait for that lane. The last
// test also serves dist/ under /melon-seek/ and /melon-seek/beta/ when a build is present.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lib = (rel) => import(pathToFileURL(path.join(ROOT, 'public', rel)).href);
const isExternal = (url, base) => !!url && !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:');

/**
 * Open the app. `patch(slug, body)` may rewrite a /api/jobs?company= answer (fixture fields);
 * `storage` seeds localStorage before the app runs; `phone` uses a 390x844 touch phone.
 */
async function openFx(ctx, { hash = 'c=anthropic', phone = false, viewport = null, patch = null, storage = null, base = ctx.baseUrl, storageState } = {}) {
  const context = await ctx.browser.newContext({
    ...(phone ? { viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: viewport || DESKTOP, deviceScaleFactor: 1 }),
    ...(storageState ? { storageState } : {}),
  });
  ctx.cleanup.push(() => context.close());
  const origin = new URL(base).origin;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.route((u) => isExternal(u.href, origin), (r) => r.abort('blockedbyclient'));
  if (patch) {
    await context.route(/\/api\/jobs\?company=/, async (route) => {
      const r = await route.fetch();
      const body = await r.json();
      const slug = new URL(route.request().url()).searchParams.get('company');
      patch(slug, body);
      route.fulfill({ response: r, body: JSON.stringify(body) });
    });
  }
  if (storage) await context.addInitScript((kv) => { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, storage);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && isExternal(loc, origin)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(`${base}/${hash ? `#${hash}` : ''}`);
  await ready(page);
  return { context, page, errors, base };
}
async function ready(page) {
  await page.locator('#resultsTitle strong').first().waitFor({ timeout: 30000 });
  await sleep(500);
}
const params = async (page) => new URLSearchParams(await page.evaluate(() => location.hash.slice(1)));
const cardTexts = (page, sel) => page.locator(`#resultsList .card ${sel}`).allInnerTexts();
const noErrors = (errors) => assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);

async function apiJobs(ctx, slug) {
  const key = `fixapp:${slug}`;
  if (ctx.data[key]) return ctx.data[key];
  const r = await fetch(`${ctx.baseUrl}/api/jobs?company=${slug}`);
  ctx.data[key] = await r.json();
  return ctx.data[key];
}
async function needReal(ctx, slug) {
  const res = await apiJobs(ctx, slug);
  if (res.mode === 'demo') skip(`${slug} is demo data here`);
  return res.jobs;
}
async function openCard(page, id) {
  const card = id ? page.locator(`#resultsList .card[data-id="${id}"]`) : page.locator('#resultsList .card[data-id]').first();
  await card.click();
  await page.locator('#drawer .d-title').waitFor({ timeout: 8000 });
  await sleep(500);
}
async function openJuice(page) {
  const jd = page.locator('#drawer details.juice-details');
  await jd.waitFor({ state: 'attached', timeout: 5000 });
  if (!(await jd.evaluate((e) => e.open))) await jd.locator(':scope > summary').click();
  await page.locator('#drawer .waterfall').waitFor({ timeout: 5000 });
}
const moneyOf = (t) => Number(String(t).replace(/[^\d.]/g, '')) * (/^\s*[−-]/.test(t) ? -1 : 1);
/** The Location filter section's rows: [{ label, count }]. */
async function locationRows(page) {
  return page.locator('#filterBody details.fsec').filter({ has: page.locator('.fsec-title', { hasText: /^Location$/ }) })
    .locator('label.check').evaluateAll((els) => els.map((e) => ({ label: e.querySelector('.check-label').textContent, count: Number(e.querySelector('.check-count').textContent) })));
}
const filterSec = (page, title) => page.locator('#filterBody details.fsec').filter({ has: page.locator('.fsec-title', { hasText: new RegExp(`^${title}$`) }) });

/** Serve ROOT/dist under /melon-seek/ (Pages layout), or null without a build. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.csv': 'text/csv' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
    if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/melon-seek`, close: () => new Promise((r) => server.close(r)) };
}

/* Fixtures for the pay-data lane's fields (docs/process/lead.md "How this wave works" 3 and 4). */
const markOte = (slug, body) => { if (slug === 'anthropic') for (const j of body.jobs) if (j.salary && j.department === 'Sales') j.salary.kind = 'ote'; };
const markTerm = (slug, body) => { if (slug === 'anthropic') for (const j of body.jobs) if (j.salary && j.salary.kind === 'stipend' && j.salary.originalInterval === 'week') j.salary.termWeeks = 17; };

export function registerFixAppTests(suite) {
  suite.test('Fix app: [P-1] on-target earnings are labelled as such on the card, the pay block and Juice; never "Posted base pay"', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic&d=Sales', patch: markOte });
    const tags = await cardTexts(page, '.tag--pay');
    assert(tags.length > 0 && tags.every((t) => t.trim() === 'On-target earnings'), `card tags ${JSON.stringify(tags.slice(0, 3))}`);
    const pillTip = await page.locator('#resultsList .card .sal-pill').first().getAttribute('title');
    assertEq(pillTip, 'On-target earnings (base plus commission at target)', 'pay pill tooltip');
    const stats = await page.locator('#statsLine').innerText();
    assert(/median on-target earnings/.test(stats), `stats line pools no base pay with on-target pay: "${stats}"`);
    await openCard(page);
    const cap = await page.locator('#drawer .d-pay-caption').innerText();
    assert(cap.includes('On-target earnings (base plus commission at target)') && !/Posted base pay/.test(cap), `caption "${cap}"`);
    assert(!(await page.locator('#drawer .pay-label', { hasText: 'bonus' }).count()), 'no "+ bonus mentioned" on on-target pay');
    if (await page.locator('#drawer .d-juice').count()) {
      await openJuice(page);
      const where = await page.locator('#drawer .juice-where').innerText();
      assert(/assumes commission at target/.test(where), `Juice note "${where}"`);
    }
    noErrors(errors);
  });

  suite.test('Fix app: [P-2] the drawer estimate shows no accuracy claim at low confidence, and builds no level or place text of its own', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    const { readableTitle } = await lib('features/roles.js');
    const noPay = jobs.filter((j) => !j.salary && !j.salaryFlag && readableTitle(j.title) === j.title).slice(0, 12);
    if (!noPay.length) skip('no Anthropic role without pay');
    // A board whose back-test error is above 25% makes every estimate "Low confidence".
    const lowMeta = (slug, body) => { if (body.meta) body.meta.compstimate = { ...(body.meta.compstimate || {}), medianAbsPctError: 31, n: 400 }; };
    const { page, errors } = await openFx(ctx, { hash: `c=anthropic&job=${encodeURIComponent(noPay[0].id)}`, patch: lowMeta });
    await page.locator('#drawer .d-title').waitFor({ timeout: 8000 }); await sleep(600);
    const comp = page.locator('#drawer .d-comp');
    if (!(await comp.count())) skip('no estimate for this role');
    const t = (await comp.innerText()).replace(/\s+/g, ' ');
    assert(/low confidence/i.test(t), `forced low confidence: "${t}"`);
    assert(!/Typically within/.test(t), `accuracy claim next to low confidence: "${t}"`);
    assert(/^Pay estimate/i.test(t), `plain label: "${t.slice(0, 40)}"`);
    // The basis line: the estimate's own (est.basis) when it returns one, else "Based on N similar roles at Anthropic" with no app-built level or place.
    const est = await page.evaluate(async ({ id }) => {
      const api = await import('./api.js'); const m = await import('./features/compstimate.js');
      const res = await api.getJobs({ company: 'anthropic' });
      const r = m.compstimateForJob(res.jobs, res.jobs.find((j) => j.id === id));
      return { basis: typeof r.basis === 'string' ? r.basis : null };
    }, { id: noPay[0].id });
    if (est.basis) assert(t.includes(est.basis.replace(/\.$/, '')), `drawer basis "${t}" is not the estimate's "${est.basis}"`);
    else assert(/Based on \d[\d,]* similar roles? at Anthropic\. An estimate/.test(t), `app-built level/place in the basis line: "${t}"`);
    noErrors(errors);
  });

  suite.test('Fix app: [P-3] "Mid" shows as "Level not stated" on cards, the drawer, the Seniority filter (last) and saved-search names', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    if (!jobs.some((j) => j.seniority === 'Mid')) skip('no default-level role');
    const { page, errors } = await openFx(ctx);
    const sens = await cardTexts(page, '.card-foot .sen');
    assert(!sens.some((t) => t.trim() === 'Mid'), `a card says "Mid": ${JSON.stringify(sens.slice(0, 5))}`);
    assert(sens.some((t) => t.trim() === 'Level not stated'), 'no card says "Level not stated"');
    const labels = await filterSec(page, 'Seniority').locator('.check-label').allInnerTexts();
    assert(!labels.includes('Mid'), `Seniority filter lists "Mid": ${labels}`);
    assertEq(labels[labels.length - 1], 'Level not stated', `"Level not stated" goes last (${labels.join(', ')})`);
    await filterSec(page, 'Seniority').locator('label.check', { hasText: 'Level not stated' }).click(); await sleep(500);
    assertEq((await params(page)).getAll('s').join(), 'Mid', 'the stored value stays Mid');
    assert(/Level not stated/.test(await page.locator('#quickChips [data-pop=sen]').innerText()), 'quick chip label');
    await page.click('#saveSearch'); await sleep(300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melon.saved') || '[]'));
    assert(saved[0] && /Level not stated/.test(saved[0].name) && !/\bMid\b/.test(saved[0].name), `saved name "${saved[0]?.name}"`);
    await openCard(page);
    assertEq((await page.locator('#drawer .d-meta .sen').innerText()).trim(), 'Level not stated', 'drawer level');
    noErrors(errors);
  });

  suite.test('Fix app: [P-4] "intern" matches whole words, not International or Internal', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic&q=intern' });
    const titles = await cardTexts(page, '.card-title');
    assert(titles.length > 0, 'no result for "intern"');
    const bad = titles.filter((t) => /\binternation|\binternal/i.test(t) && !/\bintern(s|ships?)?\b/i.test(t));
    assert(!bad.length, `"intern" matched inside words: ${bad.slice(0, 4).join(' | ')}`);
    const interns = jobs.filter((j) => j.seniority === 'Intern').length;
    assert(titles.length <= interns + 2, `${titles.length} results for "intern" (${interns} intern-level roles)`);
    // A half-typed word still matches word starts.
    await page.fill('#search', 'softw'); await sleep(700);
    assert(/^\d/.test(await page.locator('#resultsTitle').innerText()) && (await page.locator('#resultsList .card').count()) > 0, '"softw" finds Software roles');
    noErrors(errors);
  });

  suite.test('Fix app: [P-4] while searching, "Best match" is the default; an explicit sort is strict', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    const { toUSD } = await lib('viz/palette.js');
    const mid = new Map(jobs.map((j) => [j.id, j.salary ? toUSD((j.salary.min + j.salary.max) / 2, j.salary.currency) : null]));
    const age = new Map(jobs.map((j) => [j.id, j.ageDays ?? null]));
    const ids = (page) => page.locator('#resultsList .card[data-id]').evaluateAll((els) => els.map((e) => e.dataset.id));
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic&q=engineer' });
    assertEq(await page.inputValue('#sortBy'), 'best', 'default sort while searching');
    assertEq((await page.locator('#sortBy option').first().innerText()).trim(), 'Best match', 'first option');
    for (const [sort, key, dir] of [['salary-desc', mid, -1], ['salary-asc', mid, 1], ['newest', age, 1]]) {
      if (sort === 'newest' && !(await page.locator('#sortBy option[value=newest]').count())) continue;
      await page.selectOption('#sortBy', sort); await sleep(500);
      const vals = (await ids(page)).map((id) => key.get(id));
      const known = vals.filter((v) => v != null);
      for (let i = 1; i < known.length; i++) assert(dir * (known[i] - known[i - 1]) >= -1, `${sort} is not strict at #${i}: ${known.slice(Math.max(0, i - 2), i + 1).map(Math.round).join(', ')}`);
    }
    await page.fill('#search', ''); await sleep(600);
    assert(!(await page.locator('#sortBy option[value=best]').count()), '"Best match" offered without a search');
    noErrors(errors);
  });

  suite.test('Fix app: [P-5] the salary box reads £, k, A$, AUD, 60000 and 400, says what it understood, and keeps values below the floor', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { toUSD } = await lib('viz/palette.js');
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic' });
    const box = filterSec(page, 'Salary').locator('input.range-val').first();
    assertEq((await filterSec(page, 'Salary').locator('.range-vals > label > span').first().innerText()).trim(), 'Min $/yr', 'Min label');
    const k = (n) => Math.round(n / 1000) * 1000;
    const cases = [
      ['£80,000', k(toUSD(80000, 'GBP')), /£80,000 ≈ \$108K a year/],
      ['£250,000', k(toUSD(250000, 'GBP')), /£250,000 ≈ \$337K/],
      ['80k', 80000, /below the lowest pay listed here/],
      ['A$350k', k(toUSD(350000, 'AUD')), /A\$350,000 ≈ \$245K/],
      ['AUD 350000', k(toUSD(350000, 'AUD')), /A\$350,000 ≈/],
      ['60000', 60000, /below the lowest pay/],
      ['400', 400000, /“400” read as \$400K a year/],
    ];
    for (const [typed, want, note] of cases) {
      await box.fill(typed); await box.press('Enter'); await sleep(450);
      assertEq(Number((await params(page)).get('smin')), want, `"${typed}" -> smin`);
      const read = await filterSec(page, 'Salary').locator('.salary-read').innerText();
      assert(note.test(read), `"${typed}": understood "${read}"`);
    }
    const nopay = await filterSec(page, 'Salary').locator('.salary-nopay').innerText();
    assert(/\d+ roles? that lists? no pay (is|are) hidden while a pay filter is on/.test(nopay), `no-pay note "${nopay}"`);
    await box.fill('lots'); await box.press('Enter'); await sleep(300);
    assert(/isn’t a pay figure/.test(await filterSec(page, 'Salary').locator('.salary-read').innerText()), 'junk is answered');
    assertEq(Number((await params(page)).get('smin')), 400000, 'junk keeps the bound');
    noErrors(errors);
  });

  suite.test('Fix app: [P-6] stats line: "mostly" only above half; a city filter takes pay only where it applies (payLocations)', async (ctx) => {
    const jobs = await needReal(ctx, 'anduril');
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic' });
    const s0 = await page.locator('#statsLine').innerText();
    assert(!/mostly/.test(s0), `"mostly" at under half: "${s0}"`);
    assert(!/list pay|middle 50%/.test(s0), `jargon in the stats line: "${s0}"`);
    const { payLocations } = await lib('features/shared.js');
    const sydney = jobs.filter((j) => (j.locations || []).some((l) => l.city === 'Sydney'));
    if (!sydney.length) skip('no Anduril role lists Sydney');
    const local = sydney.filter((j) => j.salary && payLocations(j).some((l) => l.city === 'Sydney' || (!l.city && l.country === 'AU')));
    await page.goto(`${ctx.baseUrl}/#c=anduril&l=Sydney`); await ready(page);
    const s1 = await page.locator('#statsLine').innerText();
    if (!local.length) assert(!/median/.test(s1) && /\b0% show pay/.test(s1), `US pay shown as a Sydney figure: "${s1}"`);
    noErrors(errors);
  });

  suite.test('Fix app: [P-7] with a Location filter, the Juice badge, "Most juice" and the drawer use the picked place and say the household', async (ctx) => {
    await needReal(ctx, 'anduril');
    const { page, errors } = await openFx(ctx, { hash: 'c=anduril' });
    // A city that many multi-city roles list but is not their best Juice place (Juice is attached in the browser).
    const city = await page.evaluate(async () => {
      const api = await import('./api.js');
      const res = await api.getJobs({ company: 'anduril' });
      const tally = new Map();
      for (const j of res.jobs) {
        const by = j.juice?.byLocation || [];
        if (by.length < 2) continue;
        for (const e of by) if (e.cityName && e.cityName === e.locationName?.split(',')[0] && e.cityName !== j.juice.best.cityName) tally.set(e.cityName, (tally.get(e.cityName) || 0) + 1);
      }
      return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    });
    if (!city) skip('no multi-city Juice roles');
    await page.goto(`${ctx.baseUrl}/#c=anduril&l=${encodeURIComponent(city)}&sort=juice`); await ready(page);
    const tips = await page.locator('#resultsList .card .juice-badge').evaluateAll((els) => els.slice(0, 12).map((e) => e.title));
    assert(tips.length, `no Juice badges under l=${city}`);
    const off = tips.filter((t) => !t.includes(city));
    assert(!off.length, `a badge is for another place than ${city}: ${off[0]}`);
    assert(tips.every((t) => /for one person in /.test(t)), `badge says the household: ${tips[0]}`);
    await openCard(page);
    const head = await page.locator('#drawer .juice-head-net').innerText();
    assert(head.includes(city) && /left for one person in /.test(head), `drawer headline "${head}"`);
    noErrors(errors);
  });

  suite.test('Fix app: [P-8] fixed-term pay shows as posted ("$3,850/week", "for about 17 weeks"); Juice covers only the term', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    const fellow = jobs.find((j) => j.salary?.kind === 'stipend' && j.salary.originalInterval === 'week');
    if (!fellow) skip('no weekly stipend on the board');
    const { page, errors } = await openFx(ctx, { hash: `c=anthropic&q=${encodeURIComponent('Fellows Program')}`, patch: markTerm });
    const pill = (await page.locator(`#resultsList .card[data-id="${fellow.id}"] .sal-pill`).innerText()).trim();
    assertEq(pill, '$3,850/week', 'card pill');
    await openCard(page, fellow.id);
    assertEq((await page.locator('#drawer .d-sal-amt').innerText()).trim(), '$3,850 a week', 'drawer amount');
    assert(/for about 17 weeks/.test(await page.locator('#drawer .d-sal-top').innerText()), 'term length');
    assertEq(await page.locator('#drawer .d-pct-text').count(), 0, 'no percentile for fixed-term pay');
    if (await page.locator('#drawer .d-juice').count()) {
      await openJuice(page);
      assert(/covers only that term/.test(await page.locator('#drawer .juice-where').innerText()), 'Juice says it covers the term');
      const periods = await page.locator('#drawer .d-juice [data-period]').allInnerTexts();
      assertEq(periods.join('|'), 'Monthly|Whole term', 'no yearly figure for fixed-term pay');
    }
    noErrors(errors);
  });

  suite.test('Fix app: [P-12] a saved search\'s "N new" marks exactly those cards New, listed first, after a visit in between', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const hash = 'c=anthropic&ks=Python';
    const { page, context, base } = await openFx(ctx, { hash });
    await page.click('#saveSearch'); await sleep(300);
    // Make 2 of its roles new since it was last opened, and record a visit to the company after that.
    const ids = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('melon.saved'));
      const newIds = s[0].seen.slice(0, 2);
      s[0].seen = s[0].seen.slice(2); s[0].lastSeenAt = '2026-09-01T00:00:00Z';
      localStorage.setItem('melon.saved', JSON.stringify(s));
      localStorage.setItem('melon.seen.anthropic', JSON.stringify(new Date().toISOString())); // visited since
      return newIds;
    });
    const storageState = await context.storageState();
    const { page: p2 } = await openFx(ctx, { hash: 'c=anthropic', base, storageState });
    assertEq(await p2.locator('#resultsList .tag--new').count(), 0, 'no New tags from the company visit');
    await p2.click('#companyMenuBtn'); await sleep(400);
    const row = p2.locator('#popover .saved-row').first();
    assert(/2 new/.test(await row.innerText()), `saved row "${(await row.innerText()).replace(/\n/g, ' ')}"`);
    await row.locator('.company-item').click(); await sleep(800);
    const tagged = await p2.locator('#resultsList .card:has(.tag--new)').evaluateAll((els) => els.map((e) => e.dataset.id));
    assertEq(JSON.stringify([...tagged].sort()), JSON.stringify([...ids].sort()), 'the counted roles are the New ones');
    const first = await p2.locator('#resultsList .card[data-id]').evaluateAll((els) => els.slice(0, 2).map((e) => e.dataset.id));
    assertEq(JSON.stringify([...first].sort()), JSON.stringify([...ids].sort()), 'new roles listed first');
    assert(/2 new roles since you last opened this search/.test(await p2.locator('#toast').innerText()), 'toast says where they are');
  });

  suite.test('Fix app: [P-15] Couple says it means one earner, married and filing jointly', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic&l=San+Francisco', storage: { 'melon-seek.household.v1': JSON.stringify('couple') } });
    await openCard(page);
    if (!(await page.locator('#drawer .d-juice').count())) skip('no Juice on the first San Francisco role');
    await openJuice(page);
    const how = await page.locator('#drawer .wf-tax-basis').innerText();
    assert(/one earner, married and filing jointly/.test(how) && /couple can keep more than one person/.test(how), `tax note "${how}"`);
    assert(/left for a couple in /.test(await page.locator('#drawer .juice-head-net').innerText()), 'headline names the household');
    noErrors(errors);
  });

  suite.test('Fix app: [P-16] text bugs: single figures, no "0% percentile", no repeated meta or country, one empty-state message', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    const gbp = jobs.find((j) => j.salary?.currency === 'GBP');
    const fellow = jobs.find((j) => j.salary?.kind === 'stipend');
    const dup = jobs.find((j) => j.salary && j !== gbp && j !== fellow);
    const patch = (slug, body) => {
      if (slug !== 'anthropic') return;
      for (const j of body.jobs) {
        if (j.id === gbp?.id) { j.salary.min = j.salary.max = 32600; j.salary.mid = 32600; }
        if (j.id === dup?.id) { j.department = 'Revenue'; j.team = 'Revenue'; j.employmentType = 'Intern'; j.seniority = 'Intern'; j.locations = [{ name: 'Canada', country: 'CA', city: null, region: null, remote: false }]; }
      }
    };
    const { page, errors } = await openFx(ctx, { hash: `c=anthropic&job=${encodeURIComponent(gbp.id)}`, patch });
    await page.locator('#drawer .d-title').waitFor({ timeout: 8000 }); await sleep(400);
    const pay = await page.locator('#drawer .d-salary').innerText();
    assert(!/\$(\d+)K–\1K/.test(pay), `a single figure shown as a range: "${pay.replace(/\n/g, ' ')}"`);
    assert(!/percentile/.test(pay), 'no "percentile" jargon');
    await page.keyboard.press('Escape'); await sleep(300);
    if (fellow) {
      await page.goto(`${ctx.baseUrl}/#c=anthropic&job=${encodeURIComponent(fellow.id)}`); await page.locator('#drawer .d-title').waitFor({ timeout: 8000 }); await sleep(400);
      const t = await page.locator('#drawer .d-salary').innerText();
      assert(!/\b0%|more than 0/.test(t), `"0%" on a stipend: "${t.replace(/\n/g, ' ')}"`);
      await page.keyboard.press('Escape'); await sleep(300);
    }
    await page.goto(`${ctx.baseUrl}/#c=anthropic&job=${encodeURIComponent(dup.id)}`); await page.locator('#drawer .d-title').waitFor({ timeout: 8000 }); await sleep(400);
    const meta = await page.locator('#drawer .d-meta').innerText();
    assertEq((meta.match(/Revenue/g) || []).length, 1, `"Revenue" once in "${meta}"`);
    assertEq((meta.match(/Intern/g) || []).length, 1, `"Intern" once in "${meta}"`);
    const loc = await page.locator('#drawer .loc-list').innerText();
    assertEq((loc.match(/Canada/g) || []).length, 1, `"Canada" once in "${loc}"`);
    await page.keyboard.press('Escape'); await sleep(300);
    // Empty state: one message, naming the search.
    await page.fill('#search', 'zzqqxx'); await sleep(900);
    const overlay = page.locator('#vizOverlay');
    assert(await overlay.isVisible(), 'empty-state overlay');
    assertEq(await overlay.locator('.state-card').count(), 1, 'one message');
    assert(/“zzqqxx”/.test(await overlay.innerText()) && !/salary range/.test(await overlay.innerText()), `message names the search: "${await overlay.innerText()}"`);
    const bg = await overlay.evaluate((e) => getComputedStyle(e).backgroundColor);
    assert(!/rgba\(.*, 0\.\d+\)/.test(bg), `overlay is see-through (${bg}): the chart's own note shows through`);
    noErrors(errors);
  });

  suite.test('Fix app: [P-16] phone drawer: Back reads "Back", unlike the Previous role arrow', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx, { phone: true });
    await page.evaluate(() => document.querySelector('#resultsList .card[data-id]').click());
    await page.locator('#drawer .d-title').waitFor({ timeout: 8000 }); await sleep(400);
    assertEq((await page.locator('#drawerClose').innerText()).trim(), 'Back', 'close button text');
    assert(await page.locator('#drawerClose .back-label').isVisible(), 'the word is visible');
    noErrors(errors);
  });

  suite.test('Fix app: [P-18] Juice: monthly rows to $10 and yearly to $100 that add up; the headline follows the period; the bar is green', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx);
    await openCard(page);
    await openJuice(page);
    const rows = async () => (await page.locator('#drawer .waterfall .wf-value').allInnerTexts()).map(moneyOf);
    await page.locator('#drawer .d-juice').getByRole('button', { name: 'Monthly' }).click(); await sleep(200);
    const m = await rows();
    assert(m.every((v) => Math.abs(v) % 10 === 0), `monthly not to $10: ${m}`);
    assertEq(m[0] - Math.abs(m[1]) - Math.abs(m[2]) - Math.abs(m[3]), m[4], `monthly rows add up (${m.join(' | ')})`);
    assert(/\/mo left/.test(await page.locator('#drawer .juice-head-net').innerText()), 'headline per month');
    await page.locator('#drawer .d-juice').getByRole('button', { name: 'Yearly' }).click(); await sleep(200);
    const y = await rows();
    assert(y.every((v) => Math.abs(v) % 100 === 0), `yearly not to $100: ${y}`);
    assertEq(y[0] - Math.abs(y[1]) - Math.abs(y[2]) - Math.abs(y[3]), y[4], `yearly rows add up (${y.join(' | ')})`);
    assert(/\/yr left/.test(await page.locator('#drawer .juice-head-net').innerText()), 'headline per year');
    const [bar, accent] = await page.evaluate(() => [getComputedStyle(document.querySelector('#drawer .wf--net .wf-bar')).backgroundColor,
      (() => { const d = document.createElement('div'); d.style.color = 'var(--ms-accent)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })()]);
    assertEq(bar, accent, '"Juice left" bar colour is the app\'s green');
    noErrors(errors);
  });

  suite.test('Fix app: [I-1] switching company keeps the search, pay bounds and filters that exist there; drops the rest with a toast', async (ctx) => {
    const oa = await needReal(ctx, 'openai');
    const { keyOf } = await lib('viz/chart.js');
    const hasSales = oa.some((j) => keyOf(j, 'department') === 'Sales');
    const { page, errors } = await openFx(ctx, { hash: 'c=anthropic&q=engineer&smin=200000&d=Sales&l=London' });
    await page.click('#companyMenuBtn'); await sleep(300);
    await page.locator('#popover .company-item').filter({ has: page.locator('.company-item-name', { hasText: /^OpenAI$/ }) }).click();
    await page.waitForFunction(() => location.hash.includes('c=openai') && document.querySelector('#resultsTitle strong'), null, { timeout: 20000 }); await sleep(800);
    const h = await params(page);
    assertEq(h.get('q'), 'engineer', 'search kept');
    assertEq(h.get('smin'), '200000', 'pay bound kept');
    assertEq(h.getAll('l').join(), 'London', 'London (exists at OpenAI) kept');
    assertEq(h.getAll('d').join(), hasSales ? 'Sales' : '', 'Sales kept only if OpenAI has it');
    const t = await page.locator('#toast').innerText();
    assert(/^Kept /.test(t) && (hasSales || /dropped Sales \(not at OpenAI\)/.test(t)), `toast "${t}"`);
    noErrors(errors);
  });

  suite.test('Fix app: [I-2] one line says what the site is; the brand shows on phones', async (ctx) => {
    const { page, errors } = await openFx(ctx);
    const line = page.locator('#tagline');
    assert(await line.isVisible(), 'tagline visible on desktop');
    assert(/Pay, and what’s left after tax and rent, for \d+ companies’ open roles/.test(await line.innerText()), `tagline "${await line.innerText()}"`);
    const { page: ph } = await openFx(ctx, { phone: true });
    assert(await ph.locator('.brand img').isVisible(), 'brand mark on the phone');
    assert(/^melon·seek/.test((await ph.locator('#tagline').innerText()).trim()), 'name in the phone line');
    noErrors(errors);
  });

  suite.test('Fix app: [I-3] plain words: stats, ages, company menu, Apply, tax lines, Juice badge, employment types', async (ctx) => {
    await needReal(ctx, 'anduril');
    const { page, errors } = await openFx(ctx, { hash: 'c=anduril' });
    const ages = await cardTexts(page, '.card-age');
    assert(ages.length && ages.every((a) => /^(Listed (today|.+ ago)|Listed at least .+ ago|Always-open posting)$/.test(a.trim())), `card ages ${JSON.stringify(ages.slice(0, 4))}`);
    const badges = await cardTexts(page, '.juice-badge');
    assert(!badges.some((b) => b.includes('≈')), `"≈" before a score: ${badges.find((b) => b.includes('≈'))}`);
    if (badges.length) {
      const scale = await page.locator('#resultsList .juice-scale').innerText();
      assert(/Juicy: \$\d+K or more a year · Ripe: \$\d+K–\d+K · Dry: under \$\d+K · Rind: nothing left/.test(scale), `Juice scale on the cards' first use: "${scale}"`);
    }
    const stats = await page.locator('#statsLine').innerText();
    assert(/show pay/.test(stats) && !/list pay|middle 50%/.test(stats), `stats words "${stats}"`);
    await page.click('#companyMenuBtn'); await sleep(300);
    const menu = await page.locator('#popover').innerText();
    assert(!/GREENHOUSE|ASHBY|LEVER|andurilindustries/i.test(menu.replace(/Greenhouse, Ashby or Lever/g, '')), `job-board jargon in the menu: "${menu.slice(0, 200)}"`);
    assert(/Choose a company or a saved search/.test(menu), 'menu title');
    await page.keyboard.press('Escape'); await sleep(200);
    const emp = await filterSec(page, 'Employment type').locator('.check-label').allInnerTexts();
    assert(!emp.some((e) => /\bEOR\b|^Unspecified$/.test(e)), `employment types ${emp}`);
    await openCard(page);
    assert(/^Apply on Anduril’s careers site/.test((await page.locator('#drawer .apply-label').innerText()).trim()), 'Apply names the company');
    if (await page.locator('#drawer .d-juice').count()) {
      await openJuice(page);
      const tax = await page.locator('#drawer .wf--tax .wf-detail').first().innerText();
      assert(!/regional|\bsocial \$/.test(tax), `tax words "${tax}"`);
    }
    noErrors(errors);
  });

  suite.test('Fix app: [I-4] Save is labelled on phones, says it saves in this browser, and a return visit reopens the last view', async (ctx) => {
    await needReal(ctx, 'openai');
    const { page, errors, base } = await openFx(ctx, { phone: true, hash: 'c=openai&q=engineer' });
    const save = page.locator('#saveSearch');
    assertEq((await save.innerText()).trim(), 'Save', 'Save label on the phone');
    assert(await save.locator('span').isVisible(), 'the word is visible');
    await save.tap(); await sleep(300);
    assert(/in this browser/.test(await page.locator('#toast').innerText()), 'toast says where saves live');
    await page.goto(`${base}/`); await ready(page);
    const h = await params(page);
    assert(h.get('c') === 'openai' && h.get('q') === 'engineer', `return visit opened "${h}"`);
    noErrors(errors);
  });

  suite.test('Fix app: [I-5] phone quickbar: active chips come first and are fully in view next to Save', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx, { phone: true, hash: 'c=anthropic&s=Senior&r=remote' });
    const geo = await page.evaluate(() => {
      const row = document.querySelector('#quickChips').getBoundingClientRect();
      const save = document.querySelector('#saveSearch').getBoundingClientRect();
      const act = [...document.querySelectorAll('#quickChips .chip.is-active')].map((c) => c.getBoundingClientRect());
      return { row: [row.left, row.right], save: save.left, act: act.map((r) => [r.left, r.right]) };
    });
    assert(geo.act.length === 2, `active chips ${geo.act.length}`);
    for (const [l, r] of geo.act) assert(l >= geo.row[0] - 1 && r <= geo.row[1] + 1 && r <= geo.save, `an active chip is cut off: ${l}-${r} in ${geo.row} (Save at ${geo.save})`);
    noErrors(errors);
  });

  suite.test('Fix app: [I-6] Location lists the busiest places first; a city pick finds postings that list only its country or region', async (ctx) => {
    const jobs = await needReal(ctx, 'anthropic');
    const target = jobs.find((j) => j.salary && !(j.locations || []).some((l) => l.city === 'London'));
    const patch = (slug, body) => { if (slug === 'anthropic') for (const j of body.jobs) if (j.id === target.id) j.locations = [{ name: 'United Kingdom', country: 'GB', city: null, region: null, remote: false }]; };
    const { page, errors } = await openFx(ctx, { patch });
    const rows = await locationRows(page);
    const london = rows.find((r) => r.label === 'London');
    assert(london, `London is behind "Show all": ${rows.map((r) => `${r.label} ${r.count}`).join(', ')}`);
    const smaller = rows.filter((r) => r.count < london.count);
    assert(rows.length <= 10 || smaller.length < rows.length, 'collapsed list is capped');
    await page.goto(`${ctx.baseUrl}/#c=anthropic&l=London`); await ready(page);
    const ids = await page.locator('#resultsList .card[data-id]').evaluateAll((els) => els.map((e) => e.dataset.id));
    const n = Number((await page.locator('#resultsTitle strong').innerText()).replace(/\D/g, ''));
    assert(ids.includes(target.id) || n > ids.length, `"United Kingdom" posting not found under London (${n} roles)`);
    noErrors(errors);
  });

  suite.test('Fix app: [I-7] at 125% zoom (1152 px) the view switch keeps its words, "Add board" is never "+", and small text is 12 px or more', async (ctx) => {
    await needReal(ctx, 'anthropic');
    const { page, errors } = await openFx(ctx, { viewport: { width: 1152, height: 720 } });
    const words = await page.locator('.topbar .seg button span').evaluateAll((els) => els.map((e) => (e.getClientRects().length ? e.textContent : '')));
    assertEq(words.join('|'), 'Chart|Map|Insights', 'view switch words');
    const add = page.locator('#addBoardBtn');
    if (await add.isVisible()) assert(/Add board/.test(await add.innerText()), 'Add board shows its label');
    const small = await page.evaluate(() => {
      const out = [];
      for (const sel of ['.check-count', '.kw-count', '.seg-count', '.card-age', '.card-foot .tag', '.card-foot .sen', '.juice-badge', '.company-count', '.fsec-badge', '.range-vals > label > span', '.check-group']) {
        for (const el of document.querySelectorAll(sel)) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12 && el.getClientRects().length) { out.push(`${sel} ${fs}px`); break; } }
      }
      return out;
    });
    assert(!small.length, `text under 12 px: ${small.join(', ')}`);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no horizontal scroll at 1152');
    noErrors(errors);
  });

  suite.test('Fix app: static build: /melon-seek/ and /melon-seek/beta/ load with the fixes and no console errors', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('no dist/ build (npm run build)');
    try {
      for (const sub of ['', '/beta']) {
        if (sub && !fs.existsSync(path.join(ROOT, 'dist', 'beta', 'index.html'))) continue;
        const { page, errors } = await openFx(ctx, { base: `${st.base}${sub}`, hash: 'c=anthropic&q=intern' });
        const titles = await cardTexts(page, '.card-title');
        assert(!titles.some((t) => /\bInternational|\bInternal\b/.test(t)), `${sub || '/'}: "intern" matched inside words`);
        assert(await page.locator('#tagline').isVisible(), `${sub || '/'}: tagline`);
        assert(!(await cardTexts(page, '.card-foot .sen')).includes('Mid'), `${sub || '/'}: "Mid" on a card`);
        noErrors(errors);
        // Phones show the logo now (I-2): the beta site keeps one "Beta" pill, beside it.
        const { page: ph, errors: phErr } = await openFx(ctx, { base: `${st.base}${sub}`, hash: 'c=cohere', phone: true });
        // The pill was CSS content; since the beta fix wave (shared decision 3) it is the .beta-tag link.
        const pills = await ph.evaluate(() => ['.brand', '.company-bar'].map((s) => {
          const c = getComputedStyle(document.querySelector(s), s === '.brand' ? '::after' : '::before').content;
          return c && c !== 'none' && c !== 'normal' ? 1 : 0;
        }).reduce((a, b) => a + b, 0)
          + [...document.querySelectorAll('.topbar a.beta-tag')].filter((a) => a.getClientRects().length && a.textContent.trim() === 'Beta').length);
        assertEq(pills, sub ? 1 : 0, `${sub || '/'}: "Beta" pills on the phone`);
        assert(await ph.locator('.brand img').isVisible(), `${sub || '/'}: logo on the phone`);
        noErrors(phErr);
      }
    } finally { await st.close(); }
  });
}

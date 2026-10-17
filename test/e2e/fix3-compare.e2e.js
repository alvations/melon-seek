// Fix wave 3, compare lane (docs/process/fix3-compare.md): comparisons within one country (BP-3),
// role families (BP-4), a stated mid level (BP-7) and Compare companies' "why a level is missing".
// Like the other beta suites these serve the static build (BETA_QA_DIST or dist/, `npm run build`)
// under /melon-seek/ and open /melon-seek/ and /melon-seek/beta/; every test skips without a beta
// build. Expected texts come from the pure helpers (public/features/comps.js) run on the build's own
// market.json, so the tests follow the data. The "Pays more than N%" line and the drawer's "nothing
// to compare" note need docs/process/patches/fix3-compare-same-country.diff (public/app.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PHONE = { viewport: { width: 390, height: 844 }, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

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
  const { unpackJobs } = await imp('public/api.js');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return unpackJobs(raw).map((j) => ({ ...j, company: j.company || slug }));
}
const marketOf = (st, site = 'beta') => JSON.parse(fs.readFileSync(path.join(st.dist, ...(site === 'beta' ? ['beta'] : []), 'api', 'market.json'), 'utf8'));

async function open(ctx, st, { url, device = { viewport: DESKTOP, deviceScaleFactor: 1 } } = {}) {
  const context = await ctx.browser.newContext({ colorScheme: 'light', ...device });
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
  if (url) { await page.goto(url); await ready(page); }
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
/** Open a posting's drawer and wait for "Same role elsewhere" to settle; its note text ('' when hidden). */
async function drawerComps(page, base, slug, id) {
  await page.goto(`${base}/#c=${slug}&job=${encodeURIComponent(id)}`); await ready(page);
  await page.waitForSelector('#drawer.is-open', { timeout: 30000 });
  await page.waitForFunction(() => { const s = document.querySelector('#drawer .d-comps'); return !s || s.hidden || !s.querySelector('.sk'); }, null, { timeout: 30000 });
  await sleep(300);
  // fix-phone-text M-33: the note's sentence (compsNote) is the first fact behind the section's one-line Details.
  return page.evaluate(() => { const s = document.querySelector('#drawer .d-comps'); return s && !s.hidden ? (s.querySelector('.comps-note .ms-note__list li')?.textContent || s.querySelector('.comps-note')?.textContent || '') : ''; });
}
/** The Insights "Compare companies" card, rendered. */
async function compareCard(page) {
  await page.waitForSelector('#compsCardHost .ms-compare', { timeout: 30000 });
  await sleep(300);
  return page.locator('#compsCardHost .ms-compare');
}
async function cardText(card) {
  return card.evaluate((el) => ({
    sub: el.querySelector('.msi-card__sub')?.textContent || '',
    foot: el.querySelector('.msi-compare__foot')?.textContent || '',
    levels: el.querySelector('.msi-compare__levels')?.hidden ? '' : el.querySelector('.msi-compare__levels')?.textContent || '',
    rows: [...el.querySelectorAll('.msi-row__name')].map((x) => x.textContent),
    empty: el.querySelector('.msi-empty')?.textContent || '',
    family: el.querySelectorAll('select')[0]?.value || '',
    levelOptions: [...(el.querySelectorAll('select')[1]?.options || [])].map((o) => o.value),
  }));
}

export function registerFix3CompareTests(suite) {
  suite.test('Fix3 compare: [BP-3] a Warsaw role\'s "Same role elsewhere" compares Polish pay only, and says so', async (ctx) => {
    const st = await setup(ctx);
    const jobs = await plainList(st, 'google');
    if (!jobs) skip('no Google list in dist/beta');
    const { compsForJob, compsNote } = await imp('public/features/comps.js');
    const { payCountry } = await imp('public/features/shared.js');
    const market = marketOf(st);
    const job = jobs.find((j) => j.salary && payCountry(j) === 'PL' && compsForJob(market, j, { includeSelf: true }).rows.some((r) => r.slug !== 'google'));
    if (!job) skip('no Polish-paid Google role with a same-country peer in this build');
    const res = compsForJob(market, job, { includeSelf: true });
    const { page, errors } = await open(ctx, st);
    const note = await drawerComps(page, st.beta, 'google', job.id);
    assertEq(note, compsNote(res), 'the note');
    assert(/ in Poland/.test(note), `the note names the country: ${note}`);
    const names = await page.$$eval('#drawer .d-comps .ms-comps__label', (e) => e.map((x) => x.textContent));
    assertEq(names.slice().sort().join(), res.rows.map((r) => r.name).sort().join(), 'the chart rows are the same-country rows');
    assert(!names.includes('Netflix'), `no US-only company in a Polish comparison: ${names.join(', ')}`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: [BP-3] "Pays more than N%" ranks a role only among the company\'s roles paid in the same country (needs the app.js patch)', async (ctx) => {
    const st = await setup(ctx);
    const jobs = await plainList(st, 'google');
    if (!jobs) skip('no Google list in dist/beta');
    const { payCountry } = await imp('public/features/shared.js');
    const pl = jobs.filter((j) => j.salary && payCountry(j) === 'PL' && !j.salary.termWeeks && j.salary.kind !== 'stipend' && j.salary.kind !== 'ote' && j.seniority !== 'Intern');
    if (pl.length < 6) skip('fewer than 6 full-time Polish-paid Google roles');
    const us = jobs.find((j) => j.salary && payCountry(j) === 'US' && !j.salary.termWeeks && j.salary.kind === 'salary' && j.seniority !== 'Intern');
    const { page, errors } = await open(ctx, st);
    await drawerComps(page, st.beta, 'google', pl[0].id);
    const text = (await page.locator('#drawer .d-pct-text').textContent()).trim();
    assert(/^(Pays more than \d+% of|The top pay of|The highest pay of|The lowest pay of) Google’s roles in Poland$/.test(text), `Warsaw role: "${text}"`); // fix-density: "that show pay" is in the pay block's Details
    assert(/Ranked among Google’s roles in Poland that show pay/.test(await page.locator('#drawer .d-pay-note .ms-note__list').textContent()), 'the Details say what it ranks among');
    await drawerComps(page, st.beta, 'google', us.id);
    const usText = (await page.locator('#drawer .d-pct-text').textContent()).trim();
    assert(/Google’s roles in the US$/.test(usText), `US role: "${usText}"`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: [BP-3] a Dublin role with no same-country peer says so instead of a US comparison (needs the app.js patch)', async (ctx) => {
    const st = await setup(ctx);
    const jobs = await plainList(st, 'google');
    if (!jobs) skip('no Google list in dist/beta');
    const { compsForJob, compsNote } = await imp('public/features/comps.js');
    const { payCountry } = await imp('public/features/shared.js');
    const { roleFamily } = await imp('public/features/roles.js');
    const market = marketOf(st);
    const job = jobs.find((j) => j.salary && payCountry(j) === 'IE' && roleFamily(j.title, j) && !compsForJob(market, j, { includeSelf: true }).rows.some((r) => r.slug !== 'google'));
    if (!job) skip('every Irish-paid Google role has a same-country peer');
    const { page, errors } = await open(ctx, st);
    const note = await drawerComps(page, st.beta, 'google', job.id);
    const want = compsNote(compsForJob(market, job, { includeSelf: true }));
    assertEq(note, want, 'the drawer says there is nothing to compare in Ireland');
    assert(/in Ireland, so there is nothing to compare yet\. Pay for other countries isn[’']t used\.$/.test(note), note); // UX-61: curly apostrophe
    assertEq(await page.locator('#drawer .d-comps .ms-comps__row').count(), 0, 'no chart of another country\'s pay');
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: [BP-3] Compare companies names its country and follows the location filter', async (ctx) => {
    const st = await setup(ctx);
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=google&m=insights` });
    let t = await cardText(await compareCard(page));
    assert(/^Posted pay in the US\b/.test(t.sub) && /for the same kind of role/i.test(t.sub), `subtitle: ${t.sub}`); // fix-density: the line, then its Details
    assert(/Only pay for roles in the US is compared\./.test(t.foot), `foot: ${t.foot}`);
    assert(!/every location each company lists/.test(t.foot), 'the old "every location" line is gone');
    await page.goto(`${st.beta}/#c=google&m=insights&l=Dublin`); await ready(page);
    t = await cardText(await compareCard(page));
    assert(/^Posted pay in Ireland\b/.test(t.sub), `subtitle under a Dublin filter: ${t.sub}`);
    assert(!t.rows.includes('Netflix') && !t.rows.includes('OpenAI'), `no US-only company in the Irish comparison: ${t.rows.join(', ')}`);
    if (!t.rows.length) assert(/Ireland/.test(t.empty), `empty state names Ireland: ${t.empty}`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: [BP-4] Hardware & systems at Staff+ is not led by Netflix; chip design is its own family', async (ctx) => {
    const st = await setup(ctx);
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=nvidia&m=insights` });
    const card = await compareCard(page);
    const famSel = card.locator('select').nth(0), levSel = card.locator('select').nth(1);
    await famSel.selectOption('hardware'); await sleep(300);
    if (await levSel.locator('option[value="Staff+"]').count()) { await levSel.selectOption('Staff+'); await sleep(300); }
    let t = await cardText(card);
    assert(t.rows.length > 0, 'hardware rows');
    assert(!t.rows.includes('Netflix'), `Netflix's distributed-systems engineers are software: ${t.rows.join(', ')}`);
    await famSel.selectOption('chip'); await sleep(300);
    await levSel.selectOption(''); await sleep(300);
    t = await cardText(card);
    assert(t.rows.includes('NVIDIA') && t.rows.includes('Apple'), `chip design rows: ${t.rows.join(', ')}`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: [BP-7] a posting that states a mid level ("III", "L4") is compared at Mid level', async (ctx) => {
    const st = await setup(ctx);
    const jobs = await plainList(st, 'google');
    if (!jobs) skip('no Google list in dist/beta');
    const { compsForJob, compsNote } = await imp('public/features/comps.js');
    const { displayLevel } = await imp('public/features/roles.js');
    const market = marketOf(st);
    const mids = jobs.filter((j) => j.salary && displayLevel(j) === 'Mid');
    if (!mids.length) skip('no stated mid level on Google');
    const job = mids.find((j) => compsForJob(market, j).matchedOn === 'family+seniority') || mids[0];
    const res = compsForJob(market, job, { includeSelf: true });
    const { page, errors } = await open(ctx, st);
    const note = await drawerComps(page, st.beta, 'google', job.id);
    assert(!/doesn[’']t state a level/.test(note), `a "Mid" posting is not told it states no level: ${note}`);
    if (res.matchedOn === 'family+seniority') assert(/ at Mid level in /.test(note), note);
    else assert(!note || /^Too few Mid /.test(note), note);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: Compare companies says in one line why a level is missing (beta and main site)', async (ctx) => {
    const st = await setup(ctx);
    const words = { Entry: 'Entry', 'Mid-level': 'Mid', Senior: 'Senior', 'Staff+': 'Staff+', Manager: 'Manager', 'Director+': 'Director+' };
    for (const [base, slug] of [[st.beta, 'apple'], [st.main, 'anthropic']]) {
      const { page, errors } = await open(ctx, st, { url: `${base}/#c=${slug}&m=insights` });
      const card = await compareCard(page);
      if (!(await card.locator('select').nth(0).locator('option[value="design"]').count())) continue; // no Design rows on this site
      await card.locator('select').nth(0).selectOption('design'); await sleep(300);
      const t = await cardText(card);
      const missing = Object.keys(words).filter((l) => !t.levelOptions.includes(l));
      if (!missing.length) { assertEq(t.levels, '', 'nothing to explain'); continue; }
      const list = missing.map((l) => words[l]);
      const head = list.length === 1 ? `${list[0]} isn't` : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]} aren't`;
      assert(t.levels.startsWith(`${head} in the Level list: no company lists pay for 3 or more Design roles at `), `${slug}: "${t.levels}" (missing ${list.join(', ')})`);
      assert(/ in the US\.$/.test(t.levels), t.levels);
      assert(!errors.length, errors.join(' | '));
    }
  });

  suite.test('Fix3 compare: [main site] "Same role elsewhere" and Compare companies name the country; no new control', async (ctx) => {
    const st = await setup(ctx);
    const jobs = await plainList(st, 'anthropic', 'stable');
    if (!jobs) skip('no Anthropic list on the main site');
    const { compsForJob, compsNote } = await imp('public/features/comps.js');
    const market = marketOf(st, 'stable');
    const job = jobs.find((j) => j.salary && compsForJob(market, j).rows.length >= 2);
    if (!job) skip('no Anthropic role with comparisons');
    const { page, errors } = await open(ctx, st);
    const note = await drawerComps(page, st.main, 'anthropic', job.id);
    assertEq(note, compsNote(compsForJob(market, job, { includeSelf: true })), 'note');
    assert(/ in the US/.test(note), note);
    await page.goto(`${st.main}/#c=anthropic&m=insights`); await ready(page);
    const card = await compareCard(page);
    assertEq(await card.locator('select').count(), 2, 'still two pickers: role family and level');
    assert(/in the US/.test((await cardText(card)).sub), 'subtitle names the US');
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix3 compare: [phone 390] the Compare card and its level line fit the screen', async (ctx) => {
    const st = await setup(ctx);
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=google&m=insights`, device: PHONE });
    const card = await compareCard(page);
    if (await card.locator('select').nth(0).locator('option[value="design"]').count()) { await card.locator('select').nth(0).selectOption('design'); await sleep(300); }
    // fix-density: the level line is in the caption's Details list; open it.
    if (await card.locator('.msi-card__sub > .ms-note__more').count()) { await card.locator('.msi-card__sub > .ms-note__more').click(); await sleep(200); }
    const m = await page.evaluate(() => {
      const c = document.querySelector('#compsCardHost .ms-compare');
      const l = c.querySelector('.msi-compare__levels');
      const r = c.getBoundingClientRect();
      const lr = l && !l.hidden ? l.getBoundingClientRect() : null;
      return { scroll: document.scrollingElement.scrollWidth, vw: innerWidth, card: [r.left, r.right], line: lr ? [lr.left, lr.right] : null };
    });
    assert(m.scroll <= m.vw + 1, `page scrolls sideways: ${m.scroll} > ${m.vw}`);
    assert(m.card[0] >= -1 && m.card[1] <= m.vw + 1, `card ${m.card}`);
    if (m.line) assert(m.line[0] >= m.card[0] - 1 && m.line[1] <= m.card[1] + 1, `level line ${m.line} inside the card ${m.card}`);
    assert(!errors.length, errors.join(' | '));
  });
}

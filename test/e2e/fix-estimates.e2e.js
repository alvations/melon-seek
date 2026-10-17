// fix-estimates lane e2e checks (persona review of the main site, 2026-10-10;
// docs/process/fix-estimates.md). One test per finding, against the real server that
// scripts/e2e.js starts, plus the static build under /melon-seek/ and /melon-seek/beta/.
// Drawer copy comes from public/app.js, which this lane changes through
// docs/process/patches/fix-estimates-app.diff; checks that need the patch skip without it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'fix-estimates');
const shoot = process.env.E2E_SHOTS === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lib = (rel) => import(pathToFileURL(path.join(ROOT, 'public', rel)).href);
const isExternal = (url, base) => !!url && !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:');

async function open(ctx, { hash = 'c=anthropic', viewport = DESKTOP, base = ctx.baseUrl } = {}) {
  const context = await ctx.browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light' });
  ctx.cleanup.push(() => context.close());
  const origin = new URL(base).origin;
  await context.route((u) => isExternal(u.href, origin), (r) => r.abort('blockedbyclient'));
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
  await page.locator('#resultsTitle strong').first().waitFor({ timeout: 30000 });
  await sleep(400);
  return { context, page, errors };
}
const noErrors = (errors) => assert(!errors.length, errors.join('\n'));
async function apiJobs(ctx, slug) {
  ctx.data.fe ||= {};
  if (!ctx.data.fe[slug]) ctx.data.fe[slug] = await (await fetch(`${ctx.baseUrl}/api/jobs?company=${slug}`)).json();
  return ctx.data.fe[slug];
}
async function shot(page, name) {
  if (!shoot) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
/** Wait for the Insights estimate widget to render a result. */
async function insights(page) {
  await page.locator('#compHost .ms-comp__result').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#compHost .ms-comp__result')?.childElementCount > 0, null, { timeout: 15000 });
  await sleep(500);
}
const money = (s) => { const m = String(s || '').match(/\$([\d.]+)([KM])?/); return m ? Number(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1) : NaN; };
/** True when the app.js patch (docs/process/patches/fix-estimates-app.diff) is applied. */
const patched = () => /estimateView/.test(fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8'));
/** The first no-pay posting matching `pred`. */
async function noPayJob(ctx, slug, pred) {
  const api = await apiJobs(ctx, slug);
  return (api.jobs || []).find((j) => !j.salary && !j.salaryFlag && pred(j));
}

export function registerFixEstimatesTests(suite) {
  suite.test('fix-estimates: [P-2] Anduril Staff Software Engineer in Sydney: no estimate from US pay, drawer and Insights agree', async (ctx) => {
    const job = await noPayJob(ctx, 'anduril', (j) => /^Staff Software Engineer$/.test(j.title) && (j.locations || []).some((l) => l.city === 'Sydney'))
      || await noPayJob(ctx, 'anduril', (j) => (j.locations || []).length === 1 && j.locations[0].country === 'AU');
    if (!job) skip('no Anduril posting in Australia without pay in this data');
    const { page, errors } = await open(ctx, { hash: `c=anduril&job=${encodeURIComponent(job.id)}` });
    await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
    await sleep(600);
    const block = page.locator('#drawer .d-comp');
    assert(!(await block.count()), `drawer shows an estimate for a Sydney role: "${(await block.count()) ? await block.innerText() : ''}"`);
    let reason = '';
    if (patched()) {
      reason = (await page.locator('#drawer .d-comp-none').innerText()).trim();
      assert(/Australia/.test(reason) && /other countries/.test(reason), `drawer reason "${reason}"`);
    }
    await shot(page, 'after-p2-drawer-sydney');
    // Insights with the same role, level and place: no figure, the same reason.
    await page.keyboard.press('Escape');
    await page.evaluate(() => { location.hash = 'c=anduril&m=insights&l=Sydney&s=Staff%2B'; });
    await insights(page);
    const t = (await page.locator('#compHost').innerText()).replace(/\s+/g, ' ');
    assert(/Not enough comparable roles/.test(t), `Insights shows a figure for Sydney Staff+: "${t.slice(0, 200)}"`);
    if (reason) assert(t.includes(reason), `Insights does not give the drawer's reason "${reason}"`);
    await shot(page, 'after-p2-insights-sydney');
    noErrors(errors);
  });

  suite.test('fix-estimates: [P-2] a Cohere internship gets no estimate from full-time pay', async (ctx) => {
    const job = await noPayJob(ctx, 'cohere', (j) => j.seniority === 'Intern');
    if (!job) skip('no Cohere internship without pay in this data');
    const { compstimateForJob } = await lib('features/compstimate.js');
    const { isInternLike } = await lib('features/shared.js');
    const api = await apiJobs(ctx, 'cohere');
    const r = compstimateForJob(api.jobs, job);
    assert(r.mid == null || r.comparables.every((c) => isInternLike(c)), 'estimate uses full-time comparables');
    const { page, errors } = await open(ctx, { hash: `c=cohere&job=${encodeURIComponent(job.id)}` });
    await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
    await sleep(600);
    if (r.mid == null) assert(!(await page.locator('#drawer .d-comp').count()), 'drawer shows an estimate for an internship with no intern pay');
    await shot(page, 'after-p2-drawer-intern');
    noErrors(errors);
  });

  suite.test('fix-estimates: [P-2] Insights range bar ends are real and contain Low and High; no accuracy figure at low confidence', async (ctx) => {
    const problems = [];
    for (const hash of ['c=anthropic&m=insights', 'c=cohere&m=insights', 'c=anduril&m=insights&s=Staff%2B', 'c=openai&m=insights&l=London']) {
      const { page } = await open(ctx, { hash });
      await insights(page);
      const c = await page.evaluate(() => {
        const root = document.querySelector('#compHost');
        const ends = [...root.querySelectorAll('.ms-comp__range-ends b')].map((b) => b.textContent.trim());
        const scale = [...root.querySelectorAll('.ms-comp__scale span')].map((s) => s.textContent.trim());
        return { ends, scale, conf: root.querySelector('.ms-comp__conf-label')?.textContent || '', acc: root.querySelector('.ms-comp__accuracy')?.textContent || '', title: root.querySelector('.ms-comp__title')?.textContent || '' };
      });
      if (c.title !== 'Pay estimate') problems.push(`${hash}: widget title "${c.title}"`);
      if (!c.ends.length) continue; // not enough comparables
      const [low, high] = c.ends.map(money);
      const [lo, , hi] = [money(c.scale[0]), null, money(c.scale[2])];
      if (!(lo <= low && hi >= high)) problems.push(`${hash}: scale ${c.scale[0]}…${c.scale[2]} does not contain Low ${c.ends[0]} and High ${c.ends[1]}`);
      if (/^Low/.test(c.conf) && /±/.test(c.acc)) problems.push(`${hash}: "${c.acc}" next to "${c.conf}"`);
      if (hash === 'c=anthropic&m=insights') await shot(page, 'after-p2-insights-range');
    }
    assert(!problems.length, problems.join('\n'));
  });

  suite.test('fix-estimates: [P-3, I-9] "Level not stated" in the estimate form, last; no "Compstimate", "≈" or "percentile" on these surfaces', async (ctx) => {
    const { page, errors } = await open(ctx, { hash: 'c=openai&m=insights' });
    await insights(page);
    const opts = await page.locator('#compHost select').nth(1).locator('option').allInnerTexts();
    assert(!opts.some((t) => /^Mid\b/.test(t)), `level options show "Mid": ${opts.join(' | ')}`);
    const i = opts.findIndex((t) => /^Level not stated/.test(t));
    assert(i === opts.length - 1, `"Level not stated" is not last: ${opts.join(' | ')}`);
    for (const sel of ['#compHost', '#compsCardHost', '#insightsPanel']) {
      const t = await page.locator(sel).innerText();
      assert(!/Compstimate|≈|percentile|middle 50%/i.test(t), `${sel} says: ${(t.match(/.{0,40}(Compstimate|≈|percentile|middle 50%).{0,40}/i) || [])[0]}`);
    }
    noErrors(errors);
  });

  suite.test('fix-estimates: [P-2, I-9] the drawer estimate says "Pay estimate", "about $X", and names its comparables', async (ctx) => {
    if (!patched()) skip('needs docs/process/patches/fix-estimates-app.diff (public/app.js)');
    const { compstimateForJob, MIN_COMPARABLES } = await lib('features/compstimate.js');
    const api = await apiJobs(ctx, 'anthropic');
    const job = api.jobs.find((j) => !j.salary && !j.salaryFlag && (() => { const r = compstimateForJob(api.jobs, j); return r.mid != null && r.n >= MIN_COMPARABLES; })());
    if (!job) skip('no Anthropic posting without pay has an estimate');
    const { page, errors } = await open(ctx, { hash: `c=anthropic&job=${encodeURIComponent(job.id)}` });
    await page.locator('#drawer .d-comp').waitFor({ timeout: 8000 });
    const t = (await page.locator('#drawer .d-comp').innerText()).replace(/\s+/g, ' ');
    assert(/^Pay estimate about \$\d/i.test(t), `drawer estimate "${t}"`);
    assert(!/≈|Compstimate|\bMid\b/.test(t), `drawer estimate "${t}"`);
    if (/low confidence/i.test(t)) assert(!/±/.test(t), `accuracy figure at low confidence: "${t}"`);
    await shot(page, 'after-p2-drawer-estimate');
    noErrors(errors);
  });

  suite.test('fix-estimates: [P-6] Market insights: no Sydney median from US pay; no statistic from fewer than 5 roles', async (ctx) => {
    const { page, errors } = await open(ctx, { hash: 'c=anduril&m=insights&l=Sydney' });
    await page.locator('#insightsPanel .msi-rows--loc').waitFor({ timeout: 15000 });
    await sleep(400);
    const row = await page.locator('#insightsPanel .msi-rows--loc .msi-row').filter({ hasText: 'Sydney' }).first().innerText();
    assert(!/\$61K/.test(row), `Sydney row "${row.replace(/\s+/g, ' ')}"`);
    if (patched()) {
      const tile = (await page.locator('#insightsPanel .msi-stat').first().innerText()).replace(/\s+/g, ' ');
      assert(!/\$61K/.test(tile), `median tile "${tile}" uses US pay for Sydney`);
    }
    await shot(page, 'after-p6-insights-sydney');
    // A handful of roles in view: no 100% / 50% share bars, no department boxes.
    await page.evaluate(() => { location.hash = 'c=anthropic&m=insights&q=Policy%20Advocacy'; });
    await page.waitForFunction(() => /match your filters/.test(document.querySelector('#insightsPanel')?.innerText || ''), null, { timeout: 15000 });
    await sleep(400);
    const head = await page.locator('#insightsPanel .ms-insights__sub').innerText();
    const n = Number((head.match(/^(\d+) of/) || [])[1]);
    if (n > 0 && n < 5) {
      const meters = await page.locator('#insightsPanel .msi-meter').count();
      const boxes = await page.locator('#insightsPanel .msi-rows--box .msi-row').count();
      assert(meters === 0 && boxes === 0, `${meters} share bars and ${boxes} boxes from ${n} roles`);
      await shot(page, 'after-p6-insights-tiny');
    }
    noErrors(errors);
  });

  suite.test('fix-estimates: [P-10, I-8] Compare companies: no internship pay in full-time rows, a level choice, and left-out companies named', async (ctx) => {
    const { page, errors } = await open(ctx, { hash: 'c=xai&m=insights' });
    const card = page.locator('#compsCardHost');
    await card.waitFor({ state: 'visible', timeout: 15000 });
    const fam = card.locator('select').first();
    const lvl = card.locator('select').nth(1);
    assert(await lvl.isVisible(), 'no level choice inside the card');
    await fam.selectOption('bizops');
    await sleep(300);
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    assert(!/xAI\s*\d+\s*\$5\dK/.test(text), `xAI business operations still shows internship pay: "${text.slice(0, 300)}"`);
    // fix-density: the foot is in the card caption's Details list.
    // MR-28 (fix-data-3): the foot also names stated minimums, shift-inclusive and part-time hourly pay.
    assert(/Internships, fixed-term programmes(?:,| and) on-target earnings/.test(await card.evaluate((e) => e.textContent)), 'foot does not say what is left out');
    await shot(page, 'after-p10-compare-bizops');
    await fam.selectOption('swe');
    const levels = await lvl.locator('option').allInnerTexts();
    assert(!levels.some((t) => /Level not stated/.test(t)) && !(await lvl.locator('option[value="Mid"]').count()), `level choice offers "Level not stated": ${levels.join(' | ')}`);
    const staff = levels.find((t) => /^Staff\+/.test(t));
    if (staff) {
      await lvl.selectOption('Staff+');
      await sleep(300);
      const t2 = (await card.innerText()).replace(/\s+/g, ' ');
      const note = (await card.locator('.msi-compare__missing').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const rows = await card.locator('button.msi-row').allInnerTexts();
      assert(/xAI[^;.]*\(do(es)?n't state levels for most of these roles\)/.test(note) || rows.some((r) => /^xAI/.test(r.trim())), `xAI vanished from Staff+ with no reason: "${note}"`);
      await shot(page, 'after-i8-compare-staff');
    }
    noErrors(errors);
  });

  suite.test('fix-estimates: [I-8] Compare companies opens on the role-family filter', async (ctx) => {
    if (!patched()) skip('needs docs/process/patches/fix-estimates-app.diff (public/app.js)');
    const { page, errors } = await open(ctx, { hash: 'c=openai&m=insights&rf=policy' });
    const card = page.locator('#compsCardHost');
    await card.waitFor({ state: 'visible', timeout: 15000 });
    await sleep(300);
    assert(await card.locator('select').first().inputValue() === 'policy', `opens on "${await card.locator('select').first().inputValue()}"`);
    await page.evaluate(() => { location.hash = 'c=openai&m=insights&rf=sales&s=Director%2B'; });
    await sleep(800);
    assert(await card.locator('select').first().inputValue() === 'sales', 'does not follow a new role-family filter');
    const lv = await card.locator('select').nth(1).inputValue();
    assert(lv === 'Director+' || lv === '', `level "${lv}"`);
    await shot(page, 'after-i8-compare-follows');
    noErrors(errors);
  });

  suite.test('fix-estimates: [P-11] "Same role elsewhere": sales head is sales; a fellowship is never compared with full-time roles', async (ctx) => {
    const api = await apiJobs(ctx, 'anthropic');
    const head = api.jobs.find((j) => /^Head of National Security Sales/.test(j.title));
    const fellow = api.jobs.find((j) => /^Anthropic Fellows Program/.test(j.title));
    if (!head && !fellow) skip('neither posting is listed in this data');
    const { page, errors } = await open(ctx, { hash: 'c=anthropic' });
    for (const job of [head, fellow].filter(Boolean)) {
      await page.evaluate((id) => { location.hash = `c=anthropic&job=${encodeURIComponent(id)}`; }, job.id);
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
      await sleep(900);
      const sec = page.locator('#drawer .d-comps');
      // fix-phone-text M-33: what is compared (the family) is in the section's Details on a narrow drawer: textContent.
      const text = (await sec.count()) && await sec.isVisible() ? (await sec.textContent()).replace(/\s+/g, ' ') : '';
      assert(!/No other company lists this level/.test(text), `${job.title}: "${text.slice(0, 160)}"`);
      if (job === head && text) assert(/Sales & partnerships/.test(text) && !/Security roles/.test(text), `${job.title}: "${text.slice(0, 160)}"`);
      if (job === fellow && text) assert(/Intern|internships/.test(text), `${job.title} compared with full-time roles: "${text.slice(0, 160)}"`);
      await shot(page, job === head ? 'after-p11-natsec-sales' : 'after-p11-fellows');
    }
    noErrors(errors);
  });

  suite.test('fix-estimates: static build at /melon-seek/ and /melon-seek/beta/: Insights estimate and Compare render, desktop and phone, no errors', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('dist/ not built (npm run build)');
    ctx.cleanup.push(() => st.close());
    const problems = [];
    for (const sub of ['', '/beta']) {
      if (sub && !fs.existsSync(path.join(ROOT, 'dist', 'beta', 'index.html'))) continue;
      for (const viewport of [DESKTOP, PHONE]) {
        const { page, errors } = await open(ctx, { hash: 'c=anthropic&m=insights', viewport, base: `${st.base}${sub}` });
        await insights(page);
        const title = await page.locator('#compHost .ms-comp__title').innerText();
        if (title !== 'Pay estimate') problems.push(`${sub || '/'} ${viewport.width}: title "${title}"`);
        const card = page.locator('#compsCardHost');
        await card.waitFor({ state: 'visible', timeout: 15000 }).catch(() => problems.push(`${sub || '/'} ${viewport.width}: no Compare card`));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 1) problems.push(`${sub || '/'} ${viewport.width}: ${overflow}px horizontal scroll`);
        if (errors.length) problems.push(`${sub || '/'} ${viewport.width}: ${errors.join('; ')}`);
        if (viewport === PHONE) await shot(page, `after-static${sub.replace('/', '-')}-phone-insights`);
      }
    }
    assert(!problems.length, problems.join('\n'));
  });
}

/** Serve ROOT/dist under /melon-seek/ (the GitHub Pages layout) on a free port; null without a build. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.woff2': 'font/woff2' };
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

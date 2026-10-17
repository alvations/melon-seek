// Beta fix wave, app lane (docs/process/fix-beta-app.md): the app-shell fixes for the beta QA findings
// (docs/QA.md "Full QA pass (desktop, beta)" D-n and "(mobile, beta)" M-n) and the shared decisions.
// Like the beta QA suites, these serve the static build (dist/, `npm run build`) under /melon-seek/ and
// open /melon-seek/ and /melon-seek/beta/; every test skips without a beta build. Fields other lanes add
// (salary.levels, job.pool, job.seniorityBasis) are injected into a bundled list with a route fixture
// (the list unpacked with public/api.js unpackJobs), so these tests do not wait for those lanes.
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
  const { unpackJobs } = await import(pathToFileURL(path.join(ROOT, 'public', 'api.js')).href);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { format, shared, dict, columns, ...body } = raw; // eslint-disable-line no-unused-vars
  return { ...body, jobs: unpackJobs(raw) };
}

/**
 * A fresh context and page. `lists: { 'beta/apple': body }` serves those bundled lists instead of the
 * build's (a route fixture); other hosts are aborted.
 */
async function open(ctx, st, { url, device = { viewport: DESKTOP, deviceScaleFactor: 1 }, lists = {}, storageState } = {}) {
  const context = await ctx.browser.newContext({ colorScheme: 'light', ...device, ...(storageState ? { storageState } : {}) });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  for (const [key, body] of Object.entries(lists)) {
    const [site, slug] = key.split('/');
    const re = new RegExp(`/melon-seek/${site === 'beta' ? 'beta/' : ''}api/jobs/${slug}\\.json$`);
    await context.route(re, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }));
  }
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
const section = (page, title) => page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: title }) });

export function registerFixBetaAppTests(suite) {
  suite.test('Fix beta app: [shared decision 1] levels are shown through displayLevel: "Mid" when the posting states it, "Level not stated" (s=Mid) for the default', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'netflix');
    if (!body) skip('no Netflix list in dist/beta');
    const mids = body.jobs.filter((j) => j.seniority === 'Mid');
    // Since the pay lane's ladders, some Netflix "L4" roles already state a mid level; inject one
    // more on a default role, and expect exactly the stated set under "Mid".
    const isStated = (j) => j.seniorityBasis === 'title' || j.seniorityBasis === 'pay';
    const defaults = mids.filter((j) => !isStated(j));
    if (defaults.length < 2) skip('fewer than 2 default "Mid" roles on Netflix');
    const stated = defaults[0];
    stated.seniorityBasis = 'title'; // what the pay lane stores for a ladder rung that means mid level
    const statedIds = mids.filter(isStated).map((j) => j.id).sort().join();
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=netflix&q=${encodeURIComponent(stated.title)}&sort=title`, lists: { 'beta/netflix': body } });
    const card = page.locator(`#resultsList .card[data-id="${stated.id}"]`);
    assertEq((await card.locator('.card-foot .sen').innerText()).trim(), 'Mid', 'a stated mid level reads "Mid" on its card');
    await page.goto(`${st.beta}/#c=netflix`); await ready(page);
    const labels = await section(page, 'Seniority').locator('.check-label').allInnerTexts();
    assert(labels.includes('Mid') && labels.includes('Level not stated'), `Seniority options ${labels.join(', ')}`);
    assertEq(labels[labels.length - 1], 'Level not stated', '"Level not stated" goes last');
    assert(labels.indexOf('Mid') < labels.indexOf('Senior') || !labels.includes('Senior'), `"Mid" sits in the ladder: ${labels.join(', ')}`);
    await section(page, 'Seniority').locator('label.check', { hasText: 'Level not stated' }).click(); await sleep(500);
    assertEq(new URLSearchParams(await page.evaluate(() => location.hash.slice(1))).getAll('s').join(), 'Mid', 'the link keeps s=Mid for "Level not stated"');
    const ids = await page.$$eval('#resultsList .card[data-id]', (e) => e.map((x) => x.dataset.id));
    assert(!ids.includes(stated.id), 'the stated "Mid" role is not "Level not stated"');
    await section(page, 'Seniority').locator('label.check', { hasText: 'Level not stated' }).click(); await sleep(300);
    await section(page, 'Seniority').locator('label.check', { hasText: /^\s*Mid\s*\d/ }).click(); await sleep(500);
    assertEq(new URLSearchParams(await page.evaluate(() => location.hash.slice(1))).getAll('s').join(), 'Mid-level', 'a stated mid level is s=Mid-level');
    assertEq(await page.$$eval('#resultsList .card[data-id]', (e) => e.map((x) => x.dataset.id).sort().join()), statedIds, 'the "Mid" filter finds exactly the roles that state a mid level');
    await page.click('#saveSearch'); await sleep(300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melon.saved') || '[]'));
    assert(/· Mid$/.test(saved[0]?.name || ''), `saved-search name "${saved[0]?.name}"`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix beta app: [D-21] a range that prices several levels lists them in the pay block instead of "Multiple pay zones"', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'nvidia');
    const job = body?.jobs.find((j) => j.salary && /level\s*\d[\s\S]*level\s*\d/i.test(j.salary.text || ''));
    if (!job) skip('no multi-level NVIDIA range');
    job.salary.levels = [{ label: 'Level 2', min: 184000, max: 287500 }, { label: 'Level 3', min: 224000, max: 356500 }];
    job.salary.zones = 2;
    const { page } = await open(ctx, st, { url: `${st.beta}/#c=nvidia&job=${encodeURIComponent(job.id)}`, lists: { 'beta/nvidia': body } });
    await page.waitForSelector('#drawer.is-open'); await sleep(500);
    // fix-density: one short row per level ("Level 2  $184K–287.5K") under "Pay by level".
    const rows = await page.locator('#drawer .d-sal-levels .d-tiers li').evaluateAll((li) => li.map((e) => [...e.children].map((c) => c.textContent.trim()).join(': ')));
    assertEq(`${(await page.locator('#drawer .d-sal-levels .d-tiers-title').innerText()).trim()}: ${rows.join(' · ')}`, 'Pay by level: Level 2: $184K–287.5K · Level 3: $224K–356.5K', 'pay by level');
    const labels = await page.locator('#drawer .pay-label').allInnerTexts();
    assert(!labels.includes('Multiple pay zones'), `labels ${labels.join(', ')}`);
  });

  suite.test('Fix beta app: [DQ-11] a talent pool says "General application (no specific opening)" on its card and in the drawer', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'netflix');
    if (!body) skip('no Netflix list');
    const pool = body.jobs[0];
    pool.pool = true; // what the sources lane adds
    const { page } = await open(ctx, st, { url: `${st.beta}/#c=netflix&q=${encodeURIComponent(pool.title)}`, lists: { 'beta/netflix': body } });
    const card = page.locator(`#resultsList .card[data-id="${pool.id}"]`);
    assertEq((await card.locator('.tag--pool').innerText()).trim(), 'General application (no specific opening)', 'card label');
    assert(/General application \(no specific opening\)/.test(await card.getAttribute('aria-label')), 'the card is named a general application');
    await card.click(); await page.waitForSelector('#drawer.is-open'); await sleep(400);
    // fix-phone-text M-37: the drawer line is the label; what it means is behind its Details (textContent reads both).
    assert(/^General application \(no specific opening\)/.test((await page.locator('#drawer .d-pool .ms-note__line').innerText()).trim()), 'drawer line');
    assert(/collects applications here for roles that may open later/.test(await page.locator('#drawer .d-pool').textContent()), 'drawer line says what it means');
    await page.keyboard.press('Escape'); await sleep(300);
    const labelled = await page.$$eval('#resultsList .card:has(.tag--pool)', (e) => e.map((x) => x.dataset.id));
    assertEq(labelled.join(), pool.id, 'only the pool is labelled');
  });

  suite.test('Fix beta app: [D-18] a big saved search keeps every match as a compact seen set; only roles added later count as new', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'apple');
    if (!body || body.jobs.length < 2500) skip('Apple has fewer than 2,500 roles here');
    // Save while 3 roles are missing from the board, then load the full board: exactly those 3 are new.
    const fewer = { ...body, jobs: body.jobs.slice(3) };
    const a = await open(ctx, st, { url: `${st.beta}/#c=apple&r=onsite`, lists: { 'beta/apple': fewer } });
    await a.page.click('#saveSearch'); await sleep(400);
    const saved = await a.page.evaluate(() => JSON.parse(localStorage.getItem('melon.saved') || '[]'));
    assert(typeof saved[0]?.seenHash === 'string' && !saved[0].seen, 'a search with more than 2,000 matches stores seenHash');
    assert(saved[0].seenHash.length < saved[0].hash.length + 60000, `seenHash is ${saved[0].seenHash.length} characters`);
    assertEq(saved[0].channel, 'beta', 'the search remembers its site');
    await a.page.click('#companyMenuBtn'); await sleep(500);
    const row = (await a.page.locator('#popover .saved-row').first().innerText()).replace(/\n/g, ' ');
    assert(!/\d[\d,]*\s+new/.test(row), `right after saving: "${row}"`);
    const storageState = await a.context.storageState();
    const onsite = body.jobs.slice(0, 3).filter((j) => (j.locations || []).some((l) => !l.remote)).length;
    const b = await open(ctx, st, { url: `${st.beta}/#c=google`, storageState });
    await b.page.click('#companyMenuBtn');
    await b.page.waitForFunction(() => /new|Apple/.test(document.querySelector('#popover .saved-row')?.textContent || ''), null, { timeout: 30000 });
    await b.page.waitForFunction((n) => !n || /\bnew\b/.test(document.querySelector('#popover .saved-row')?.textContent || ''), onsite, { timeout: 30000 });
    const row2 = (await b.page.locator('#popover .saved-row').first().innerText()).replace(/\n/g, ' ');
    assert(onsite ? new RegExp(`\\b${onsite} new`).test(row2) : !/new/.test(row2), `with the 3 missing roles back: "${row2}" (expected ${onsite} new)`);
  });

  suite.test('Fix beta app: [D-18] an id list cut at 2,000 before the fix shows no "N new"', async (ctx) => {
    const st = await setup(ctx);
    const body = await plainList(st, 'apple');
    if (!body || body.jobs.length < 2500) skip('Apple has fewer than 2,500 roles here');
    const hash = 'c=apple';
    const legacy = [{ id: 'legacy01', name: 'Apple · everything', hash, createdAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-01T00:00:00Z', seen: body.jobs.slice(0, 2000).map((j) => j.id) }];
    const { page } = await open(ctx, st, { url: null });
    await page.goto(`${st.beta}/#c=google`);
    await page.evaluate((v) => localStorage.setItem('melon.saved', JSON.stringify(v)), legacy);
    await page.reload(); await ready(page);
    await page.click('#companyMenuBtn'); await sleep(3000);
    const row = (await page.locator('#popover .saved-row').first().innerText()).replace(/\n/g, ' ');
    assert(!/new/.test(row), `a cut list counts "${row}"`);
  });

  suite.test('Fix beta app: [D-19] saved searches stay on their own site; an old one for a beta company never shows on the main site', async (ctx) => {
    const st = await setup(ctx);
    const { page, context } = await open(ctx, st, { url: `${st.beta}/#c=apple&s=Senior` });
    await page.click('#saveSearch'); await sleep(300);
    await page.goto(`${st.beta}/#c=anthropic&s=Senior`); await ready(page);
    await page.click('#saveSearch'); await sleep(300);
    // An entry from before the fix (no site recorded) for a beta company.
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('melon.saved')); s.push({ id: 'old00001', name: 'Google · Senior', hash: 'c=google&s=Senior', createdAt: '2026-10-09T00:00:00Z', lastSeenAt: '2026-10-09T00:00:00Z', seen: [] }); localStorage.setItem('melon.saved', JSON.stringify(s)); });
    const main = await context.newPage();
    await main.goto(`${st.main}/#c=openai`); await ready(main);
    await main.click('#companyMenuBtn'); await sleep(600);
    assertEq(await main.locator('#popover .saved-row').count(), 0, 'the main site lists none of the beta site\'s searches');
    await main.goto(`${st.main}/#c=anthropic&s=Senior`); await ready(main);
    assertEq((await main.locator('#saveSearch').innerText()).trim(), 'Save', 'a beta-site save does not mark the main site\'s search saved');
    await page.goto(`${st.beta}/#c=netflix`); await ready(page);
    await page.click('#companyMenuBtn'); await sleep(600);
    assertEq(await page.locator('#popover .saved-row').count(), 3, 'the beta site lists its two and the old one');
  });

  suite.test('Fix beta app: [D-19, M-22] a company this site does not list gets a plain message: no badge, no Retry, a way to the company menu', async (ctx) => {
    const st = await setup(ctx);
    const { page, errors } = await open(ctx, st, { url: null });
    // Meta and Amazon were the beta examples while they were paused; since 2026-10-11 beta lists every board, so the
    // main site's big-tech slugs are the cases (and the beta menu must list Meta and Amazon).
    await page.goto(`${st.beta}/#c=apple`); await page.reload();
    await page.waitForFunction(() => /role/.test(document.querySelector('#resultsTitle')?.textContent || ''), null, { timeout: 30000 });
    const betaNames = await page.evaluate(async () => { document.querySelector('#companyMenuBtn').click(); await new Promise((r) => setTimeout(r, 300)); return [...document.querySelectorAll('#popover .company-item-name')].map((e) => e.textContent.toLowerCase()); });
    for (const slug of ['meta', 'amazon']) assert(betaNames.includes(slug), `beta company menu lists ${slug}: ${betaNames.join(', ')}`);
    await page.keyboard.press('Escape'); await sleep(200);
    for (const [base, slug] of [[st.main, 'meta'], [st.main, 'amazon'], [st.main, 'apple']]) {
      await page.goto(`${base}/#c=${slug}`); await page.reload();
      await page.waitForFunction(() => /role/.test(document.querySelector('#resultsTitle')?.textContent || ''), null, { timeout: 30000 });
      await sleep(400);
      const s = await page.evaluate(() => ({
        badge: !document.querySelector('#dataBadge').hidden, text: document.querySelector('#vizArea').innerText.replace(/\s+/g, ' ').trim(),
        retry: [...document.querySelectorAll('button')].some((b) => /retry/i.test(b.textContent) && b.getClientRects().length),
        error: document.querySelectorAll('.state-card--error').length, refresh: !document.querySelector('#refreshBtn').hidden,
        name: document.querySelector('#companyMenuBtn .company-name')?.textContent,
      }));
      assert(!s.badge && !s.retry && !s.error && !s.refresh, `${slug}: ${JSON.stringify(s)}`);
      assert(/This board isn’t on this site/.test(s.text), `${slug}: "${s.text}"`);
      assertEq(s.name, slug[0].toUpperCase() + slug.slice(1), `${slug}: company button`);
      const names = await page.evaluate(async () => { document.querySelector('#companyMenuBtn').click(); await new Promise((r) => setTimeout(r, 300)); return [...document.querySelectorAll('#popover .company-item-name')].map((e) => e.textContent); });
      assert(!names.some((n) => n.toLowerCase() === slug), `${slug} listed in the company menu: ${names.join(', ')}`);
      await page.keyboard.press('Escape'); await sleep(200);
      await page.locator('#vizArea .state-card button', { hasText: 'Choose a company' }).click(); await sleep(300);
      assert(await page.locator('#popover.popover--company').isVisible(), `${slug}: "Choose a company" opens the company menu`);
      await page.keyboard.press('Escape'); await sleep(200);
    }
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix beta app: [D-25, M-21] the company menu lists the big-tech boards first, under "Big tech", with the current one in view', async (ctx) => {
    const st = await setup(ctx);
    const { page } = await open(ctx, st, { url: `${st.beta}/#c=nvidia`, device: PHONE });
    await page.tap('#companyMenuBtn'); await sleep(700);
    const groups = await page.$$eval('#popover .company-list [role=group]', (gs) => gs.map((g) => ({ head: g.querySelector('.check-group').textContent, names: [...g.querySelectorAll('.company-item-name')].map((e) => e.textContent) })));
    assertEq(groups[0]?.head, 'Big tech', 'first group');
    for (const n of ['Google', 'Microsoft', 'Apple', 'Netflix', 'NVIDIA']) assert(groups[0].names.includes(n), `Big tech lacks ${n}`);
    assertEq(groups[1]?.head, 'More companies', 'second group');
    const g = await page.evaluate(() => {
      const l = document.querySelector('#popover .company-list').getBoundingClientRect();
      const c = document.querySelector('#popover .company-item[aria-current="true"]').getBoundingClientRect();
      return c.top >= l.top && c.bottom <= l.bottom;
    });
    assert(g, 'the current board (NVIDIA ✓) is in view');
    const main = await open(ctx, st, { url: `${st.main}/#c=anthropic` });
    await main.page.click('#companyMenuBtn'); await sleep(400);
    assertEq((await main.page.$$eval('#popover .company-list .check-group', (e) => e.map((x) => x.textContent))).join(), 'Companies', 'the main site keeps one list');
  });

  suite.test('Fix beta app: [D-26, D-27, D-28] beta: Refresh hidden on a snapshot-only board, the Beta tag links to the main site, the title says beta; the main site is unchanged', async (ctx) => {
    const st = await setup(ctx);
    const { page } = await open(ctx, st, { url: `${st.beta}/#c=apple` });
    assert(await page.locator('#refreshBtn').isHidden(), 'Refresh on Apple');
    const tag = page.locator('.topbar a.beta-tag');
    assert(await tag.isVisible(), 'Beta tag');
    assertEq((await tag.innerText()).trim(), 'Beta', 'visible text');
    assertEq(new URL(await tag.evaluate((a) => a.href)).pathname, '/melon-seek/', 'it links to the main site');
    assert(/^Beta site\b.*main/i.test(await tag.getAttribute('aria-label')), 'its name says it is the beta site and links back');
    assert(/^melon·seek beta\b/.test(await page.title()), `title "${await page.title()}"`);
    await page.goto(`${st.beta}/#c=anthropic`); await page.reload(); await ready(page);
    assert(await page.locator('#refreshBtn').isVisible(), 'Refresh on a live board (Anthropic) on the beta site');
    await tag.click();
    await page.waitForURL(/\/melon-seek\/(#.*)?$/, { timeout: 15000 }); await ready(page);
    assert(await page.locator('.beta-tag').isHidden(), 'no Beta tag on the main site');
    assertEq(await page.locator('.beta-tag').getAttribute('href'), null, 'and no link to the beta site');
    assert(/^melon·seek — /.test(await page.title()), `main title "${await page.title()}"`);
    assert(await page.locator('#refreshBtn').isVisible(), 'Refresh on the main site');
  });

  suite.test('Fix beta app: [M-20] the windowed list: screen-reader positions, arrow keys across the window, and focus back from the drawer', async (ctx) => {
    const st = await setup(ctx);
    const { page, errors } = await open(ctx, st, { url: `${st.beta}/#c=apple`, device: PHONE });
    for (let i = 0; i < 2; i++) { await page.tap('#sheetHandle'); await sleep(400); }
    // Load past the window size, then look at the list's items.
    await page.evaluate(async () => {
      const l = document.querySelector('#resultsList');
      for (let i = 0; i < 400 && l.querySelectorAll('.card[data-id]').length < 160 && l.scrollHeight < 60000; i++) { l.scrollTop = l.scrollHeight; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
    });
    await sleep(500);
    const info = await page.evaluate(() => {
      const l = document.querySelector('#resultsList');
      const lis = [...l.querySelectorAll(':scope > li')].filter((x) => x.querySelector('.card[data-id]'));
      return { n: lis.length, size: lis[0]?.getAttribute('aria-setsize'), first: Number(lis[0]?.getAttribute('aria-posinset')), contiguous: lis.every((x, i) => Number(x.getAttribute('aria-posinset')) === Number(lis[0].getAttribute('aria-posinset')) + i), title: document.querySelector('#resultsTitle').textContent };
    });
    assert(info.n > 0 && info.n <= 150, `${info.n} cards in the page`);
    assertEq(Number(info.size).toLocaleString('en-US'), info.title.match(/[\d,]+/)[0], 'aria-setsize is the whole result count');
    assert(info.first > 1 && info.contiguous, `the window starts at result ${info.first} and runs on (${JSON.stringify(info)})`);
    // Arrow keys move by result, also past the window's edge.
    await page.evaluate(() => { const l = document.querySelector('#resultsList'); l.scrollTop = 0; });
    await sleep(500);
    await page.locator('#resultsList .card[data-id]').first().focus();
    for (let i = 0; i < 130; i++) await page.keyboard.press('ArrowDown'); // past the first window's end (120 cards)
    await sleep(300);
    const pos = await page.evaluate(() => Number(document.activeElement.closest('li')?.getAttribute('aria-posinset')));
    assertEq(pos, 131, '130 ArrowDowns from the first card');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#drawer.is-open'); await sleep(400);
    assert(/^131 of \d{1,3}(,\d{3})+$/.test(await page.textContent('#drawerPos')), `counter "${await page.textContent('#drawerPos')}"`);
    await page.keyboard.press('Escape'); await sleep(500);
    assertEq(await page.evaluate(() => Number(document.activeElement.closest('li')?.getAttribute('aria-posinset'))), 131, 'focus back on the card');
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Fix beta app: [M-25, M-27] phones: 44px Beta tag and logo tap areas; whole names at 360, 390 and 430; the main site row is unchanged', async (ctx) => {
    const st = await setup(ctx);
    // The tap area of a small mark: its box plus its ::before slop (inset < 0), and a tap in the slop hits it.
    const area = (page, sel) => page.evaluate((sel) => {
      const b = document.querySelector(sel); const r = b.getBoundingClientRect(); const a = getComputedStyle(b, '::before');
      const out = (v) => Math.max(0, -parseFloat(v) || 0);
      const hitAbove = document.elementFromPoint(r.left + r.width / 2, r.top - 7)?.closest(sel) === b;
      return { w: r.width + out(a.left) + out(a.right), h: r.height + out(a.top) + out(a.bottom), hitAbove };
    }, sel);
    const row = (page) => page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const n = document.querySelector('#companyMenuBtn .company-name');
      return { logo: !!r('.brand')?.width, tag: r('.beta-tag'), menu: r('#companyMenuBtn'), badge: r('#dataBadge'), theme: r('#themeBtn'), whole: n.scrollWidth <= n.clientWidth + 1, name: n.textContent, scroll: document.documentElement.scrollWidth - innerWidth };
    });
    const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
    for (const [w, h, c, logo] of [[360, 740, 'microsoft', false], [390, 844, 'microsoft', true], [430, 932, 'netflix', true]]) {
      const { page } = await open(ctx, st, { url: `${st.beta}/#c=${c}`, device: { ...PHONE, viewport: { width: w, height: h }, userAgent: w === 360 ? ANDROID : PHONE.userAgent } });
      const g = await row(page);
      assert(g.whole, `${w}px: "${g.name}" is cut off`);
      assertEq(g.logo, logo, `${w}px: logo shown`);
      assert(g.tag.right <= g.menu.left && g.menu.right <= g.badge.left && g.badge.right <= g.theme.left && g.theme.right <= w && !g.scroll, `${w}px: row overlaps ${JSON.stringify(g)}`);
      const t = await area(page, '.topbar a.beta-tag');
      assert(t.w >= 44 && t.h >= 44 && t.hitAbove, `${w}px: Beta tag tap area ${JSON.stringify(t)}`);
    }
    const main = await open(ctx, st, { url: `${st.main}/#c=anthropic`, device: PHONE });
    const hit = await area(main.page, '.brand');
    assert(hit.h >= 44 && hit.hitAbove, `logo tap area ${JSON.stringify(hit)}`);
    assert(await main.page.locator('.brand img').isVisible() && (await main.page.locator('.beta-tag').isHidden()), 'main site: the logo, no Beta tag');
    assert(/^\s*●?\s*\w{3} \d{1,2}$|^Snapshot · /.test(await main.page.locator('#dataBadge .badge-label').evaluate((e) => getComputedStyle(e, '::before').content.replace(/"/g, ''))), 'main site badge label unchanged');
  });
}

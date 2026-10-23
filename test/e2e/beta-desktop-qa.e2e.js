// Beta desktop QA e2e checks (docs/QA.md "Full QA pass (desktop, beta) 2026-10-10",
// docs/process/qa-desktop-beta.md). Desktop Chromium at 1440x900 against the static build's beta
// copy: dist/beta/ (npm run build) is served under /melon-seek/ like GitHub Pages, so the tests open
// /melon-seek/beta/. One check ([D-20]) starts its own server with MELON_CHANNEL=beta.
// Tests tagged "[D-n]" encode an open bug from that report and are expected to fail until it is
// fixed; the rest guard flows that work today. Every test skips when dist/beta/ (or the beta data
// it needs) is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip, startServer } from './harness.js';
import { BETA_BOARDS, postingHostsOf } from './beta-boards.mjs';
import { COMPANIES } from '../../server/companies.js';

const DESKTOP = { width: 1440, height: 900 };
// Every non-paused beta board, from the registry (T-1: Amazon and Meta were missing from a hand-written list).
const BIG_TECH = BETA_BOARDS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serve ROOT/dist under /melon-seek/ (the GitHub Pages layout) on a free port; null without a beta build. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
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
  return { origin, main: `${origin}/melon-seek`, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh desktop context on the beta site; external hosts are recorded and aborted. */
async function openBeta(ctx, hash = 'c=apple', { viewport = DESKTOP, colorScheme = 'light' } = {}) {
  const st = await serveDist();
  if (!st) skip('dist/beta/ not built (npm run build)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  const external = [];
  const requests = [];
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => { external.push(r.request().url()); r.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('request', (r) => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && loc && !loc.startsWith(st.origin)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  if (hash != null) { await page.goto(`${st.beta}/#${hash}`); await ready(page); }
  return { st, context, page, errors, external, requests };
}
async function ready(page, timeout = 60000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(400);
}
async function count(page) {
  const m = (await page.locator('#resultsTitle').innerText()).replace(/,/g, '').match(/(\d+)\s+role/);
  assert(m, 'no role count in the results title');
  return Number(m[1]);
}
const params = async (page) => new URLSearchParams(await page.evaluate(() => location.hash.slice(1)));
const section = (page, title) => page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: title }) });

/** The app's own jobs for a company (public/api.js getJobs, as the UI sees them). */
async function appJobs(page, st, company) {
  return page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const res = await api.getJobs({ company });
    return {
      mode: res.mode,
      jobs: res.jobs.map((j) => ({
        id: j.id, title: j.title, salary: j.salary ? { min: j.salary.min, max: j.salary.max, currency: j.salary.currency, text: j.salary.text, zones: j.salary.zones } : null,
        locations: (j.locations || []).map((l) => ({ name: l.name, country: l.country, remote: !!l.remote })),
      })),
    };
  }, { base: st.beta, company });
}
async function needBeta(page, st, company) {
  const d = await appJobs(page, st, company);
  if (d.mode !== 'snapshot' || !d.jobs.length) skip(`${company} has no beta snapshot in dist/beta (${d.mode})`);
  return d.jobs;
}

/** The Location filter of the left column, fully expanded: [{ label, count, group }]. */
async function locationOptions(page) {
  const sec = section(page, 'Location');
  const more = sec.locator('.more-btn');
  if (await more.isVisible() && /Show all/.test(await more.innerText())) { await more.click(); await sleep(300); }
  return sec.locator('.checklist').evaluate((list) => {
    const out = [];
    let group = '';
    for (const n of list.children) {
      if (n.classList.contains('check-group')) group = n.textContent.trim();
      else if (n.matches('label.check')) out.push({ label: n.querySelector('.check-label').textContent, count: Number(n.querySelector('.check-count').textContent), group });
    }
    return out;
  });
}
async function openJob(page, st, id) {
  await page.goto(`${st.beta}/#c=${id.split(':')[0]}&job=${encodeURIComponent(id)}`);
  await ready(page);
  await page.waitForSelector('#drawer.is-open', { timeout: 15000 });
  await sleep(600);
}

export function registerBetaDesktopQaTests(suite) {
  // ---------------------------------------------------------------- guards (pass today)
  suite.test('Beta desktop QA: big-tech boards load from the bundle only (Snapshot badge, no live request)', async (ctx) => {
    const { st, page, errors, external, requests } = await openBeta(ctx, null);
    for (const c of BIG_TECH) {
      const e0 = external.length, r0 = requests.length;
      await page.goto(`${st.beta}/#c=${c}`); await ready(page); await sleep(1200);
      const label = await page.locator('#dataBadge .badge-label').innerText();
      assert(/^Snapshot · \w{3} \d{1,2}$/.test(label), `${c}: badge "${label}" (expected "Snapshot · <date>")`);
      assert(!(await page.locator('#dataBadge').getAttribute('class')).includes('is-pending'), `${c}: badge still checking live`);
      assertEq(external.slice(e0).length, 0, `${c}: requests to other hosts (${external.slice(e0).join(', ')})`);
      const lists = requests.slice(r0).filter((u) => /\/api\/jobs\//.test(u)).map((u) => u.replace(/.*\/api\/jobs\//, ''));
      assert(lists.every((u) => u === `${c}.json`), `${c}: unexpected list requests ${lists.join(', ')}`);
      assert(await page.locator('#demoBanner').isHidden(), `${c}: demo banner shown`);
    }
    assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  });

  suite.test('Beta desktop QA: paused and absent companies (the registry\'s paused ones, and Tesla) are nowhere; the main site lists no beta company', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=netflix');
    await page.click('#companyMenuBtn'); await sleep(300);
    const names = await page.$$eval('#popover .company-item-name', (e) => e.map((x) => x.textContent));
    for (const n of COMPANIES.filter((c) => BIG_TECH.includes(c.slug)).map((c) => c.name)) assert(names.includes(n), `company menu lacks ${n}`);
    // Paused companies come from the registry (server/companies.js `paused`), so resuming one needs no edit here.
    const paused = COMPANIES.filter((c) => c.paused);
    for (const n of [...paused.map((c) => c.name), 'Tesla']) assert(!names.includes(n), `company menu lists ${n}`);
    for (const p of [...paused.flatMap((c) => [`beta/api/jobs/${c.slug}.json`, `beta/c/${c.slug}/`, `beta/data/${c.slug}.csv`]), 'c/apple/', 'api/jobs/apple.json']) {
      assertEq((await fetch(`${st.main}/${p}`)).status, 404, `/${p}`);
    }
    const main = await (await fetch(`${st.main}/api/companies.json`)).json();
    assert(!main.some((c) => c.channel === 'beta' || BIG_TECH.includes(c.slug)), `main site companies.json lists ${main.map((c) => c.slug).join(',')}`);
  });

  suite.test('Beta desktop QA: Apple (6,105 roles) facet counts stay consistent and each update lands quickly', async (ctx) => {
    const { st, page, errors } = await openBeta(ctx, 'c=apple');
    await needBeta(page, st, 'apple');
    const total = await count(page);
    const sen = await section(page, 'Seniority').locator('.check-count').evaluateAll((e) => e.reduce((a, x) => a + Number(x.textContent), 0));
    assertEq(sen, total, 'Seniority counts sum to the total');
    const timed = async (label, action, done) => {
      const t0 = Date.now();
      await action();
      await page.waitForFunction(done.fn, done.arg, { timeout: 15000, polling: 50 });
      const ms = Date.now() - t0;
      assert(ms < 4000, `${label} took ${ms} ms on Apple`);
      return ms;
    };
    const dep = section(page, 'Department').locator('label.check').first();
    const n = Number(await dep.locator('.check-count').innerText());
    const before = await page.locator('#resultsTitle').textContent();
    await timed('department filter', () => dep.click(), { fn: (p) => document.querySelector('#resultsTitle').textContent !== p, arg: before });
    assertEq(await count(page), n, 'department pick = its facet count');
    const first = await page.evaluate(() => document.querySelector('#resultsList .card[data-id]').dataset.id);
    await timed('sort Lowest pay', () => page.selectOption('#sortBy', 'salary-asc'), { fn: (p) => document.querySelector('#resultsList .card[data-id]')?.dataset.id !== p, arg: first });
    const rowSig = await page.evaluate(() => document.querySelector('#chartHost .ms-crow')?.getAttribute('aria-label'));
    await timed('Group by Seniority', () => page.selectOption('#groupBy', 'seniority'), { fn: (p) => document.querySelector('#chartHost .ms-crow')?.getAttribute('aria-label') !== p, arg: rowSig });
    await page.click('#clearAll'); await sleep(500);
    assertEq(await count(page), total, 'Clear all restores the board');
    assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  });

  suite.test('Beta desktop QA: Apply opens each big-tech careers host in a new tab', async (ctx) => {
    const { st, page } = await openBeta(ctx, null);
    for (const c of BIG_TECH) {
      await page.goto(`${st.beta}/#c=${c}`); await ready(page);
      await page.locator('#resultsList .card[data-id]').first().click(); await sleep(700);
      const a = page.locator('#drawer a.apply');
      const href = await a.getAttribute('href');
      const host = new URL(href).hostname.replace(/^www\./, '');
      assert(postingHostsOf(c).has(host), `${c}: Apply goes to ${host}, not ${[...postingHostsOf(c)].join(' or ')}`);
      assertEq(await a.getAttribute('target'), '_blank', `${c}: Apply target`);
      assert(/noopener/.test(await a.getAttribute('rel')), `${c}: Apply rel`);
      assert((await a.locator('.apply-host').innerText()) === host, `${c}: host shown under Apply`);
      await page.keyboard.press('Escape'); await sleep(300);
    }
  });

  suite.test('Beta desktop QA: beta share pages /beta/c/<slug>/ have their own titles and open the beta app', async (ctx) => {
    const { st, page } = await openBeta(ctx, null);
    for (const c of BIG_TECH) {
      const r = await fetch(`${st.beta}/c/${c}/`);
      assertEq(r.status, 200, `/beta/c/${c}/`);
      const html = await r.text();
      assert(new RegExp(`<title>[^<]*jobs by salary · [\\d,]+ roles`, 'i').test(html), `${c}: share page title`);
      assert(/<meta name="robots" content="noindex">/.test(html), `${c}: share page is noindex`);
    }
    await page.goto(`${st.beta}/c/netflix/#m=map&ks=Python`);
    await page.waitForURL(/\/melon-seek\/beta\/#/, { timeout: 15000 });
    const p = new URLSearchParams(new URL(page.url()).hash.slice(1));
    assert(p.get('c') === 'netflix' && p.get('ks') === 'Python', `share redirect landed on ${page.url()}`);
  });

  // ---------------------------------------------------------------- open bugs (fail until fixed)
  suite.test('Beta desktop QA: [D-17] NVIDIA and Microsoft cities abroad are not filed under the United States (country codes read as US states)', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=nvidia');
    await needBeta(page, st, 'nvidia');
    const ABROAD = /^(Bengaluru|Hyderabad|Pune|Mumbai|Noida|Gurugram|Tel Aviv|Yokne'am|Ra'anana|Herzliya|Munich|Jakarta)/;
    const bad = [];
    for (const c of ['nvidia', 'microsoft']) {
      if (c !== 'nvidia') { await page.goto(`${st.beta}/#c=${c}`); await ready(page); }
      for (const o of await locationOptions(page)) if (ABROAD.test(o.label) && o.group === 'United States') bad.push(`${c}: ${o.label} (${o.count})`);
    }
    assert(!bad.length, `filed under "United States" in the Location filter: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? ` +${bad.length - 8}` : ''}`);
  });

  suite.test('Beta desktop QA: [D-18] a search saved a moment ago on a big board shows no "N new"', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=apple&r=onsite');
    await needBeta(page, st, 'apple');
    await page.click('#saveSearch'); await sleep(400);
    await page.click('#companyMenuBtn'); await sleep(600);
    const row = (await page.locator('#popover .saved-row').filter({ hasText: 'On-site' }).first().innerText()).replace(/\n/g, ' ');
    assert(!/\d[\d,]*\s+new/.test(row), `saved row "${row}" claims new roles right after saving (Apple has ${await count(page)} matches)`);
  });

  suite.test('Beta desktop QA: [D-19] a search saved on the beta site does not break the main site', async (ctx) => {
    const { st, page, context } = await openBeta(ctx, 'c=apple&s=Senior');
    await needBeta(page, st, 'apple');
    await page.click('#saveSearch'); await sleep(400);
    const main = await context.newPage();
    await main.goto(`${st.main}/#c=anthropic`); await ready(main);
    await main.click('#companyMenuBtn'); await sleep(800);
    const row = main.locator('#popover .saved-row button.company-item').filter({ hasText: 'Apple' }).first();
    if (!(await row.count())) return; // not listed on the main site: fixed
    await row.click(); await sleep(3000);
    await main.waitForLoadState('load');
    const title = await main.locator('#resultsTitle').innerText().catch(() => '');
    const failed = await main.locator('.state-card--error').count();
    assert(!/No data/.test(title) && !failed, `main site opened the beta search "${main.url().replace(st.origin, '')}" into "${title}" (${(await main.locator('#dataBadge').innerText().catch(() => '')).split('\n')[0]})`);
  });

  suite.test('Beta desktop QA: [D-20] server mode with MELON_CHANNEL=beta serves the big-tech snapshots, not demo data', async (ctx) => {
    if (!fs.existsSync(path.join(ROOT, 'data', 'beta', 'snapshots', 'apple.json'))) skip('no data/beta/snapshots/apple.json');
    const srv = await startServer({ env: { MELON_CHANNEL: 'beta' } });
    ctx.cleanup.push(() => srv.stop());
    const list = await (await fetch(`${srv.baseUrl}/api/companies`)).json();
    assert(list.some((c) => c.slug === 'apple'), 'MELON_CHANNEL=beta lists Apple');
    const r = await (await fetch(`${srv.baseUrl}/api/jobs?company=apple`)).json();
    assert(r.mode !== 'demo', `Apple in server mode: mode "${r.mode}", ${r.jobs.length} roles, error "${r.error}" (data/beta/snapshots/apple.json has 6,105)`);
  });

  suite.test('Beta desktop QA: [D-21] a pay range that merges two levels says so in the drawer (NVIDIA "for Level 2, and … for Level 3")', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=nvidia');
    const job = (await needBeta(page, st, 'nvidia')).find((j) => j.salary && /level\s*\d[\s\S]*level\s*\d/i.test(j.salary.text || ''));
    if (!job) skip('no multi-level NVIDIA range');
    await openJob(page, st, job.id);
    const pay = (await page.locator('#drawer .d-salary').innerText()).replace(/\n+/g, ' / ');
    assert(/\b(2|two|several|multiple|both)\s+levels?\b|\blevel\s*\d/i.test(pay), `pay block for "${job.salary.text}" doesn't mention levels: ${pay.slice(0, 200)}`);
  });

  suite.test('Beta desktop QA: [D-22] Google pay for Canada-only roles is not shown as US dollars', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=google');
    const ca = (await needBeta(page, st, 'google')).filter((j) => j.salary && j.locations.length && j.locations.every((l) => l.country === 'CA'));
    if (!ca.length) skip('no Canada-only Google posting with pay');
    const usd = ca.filter((j) => j.salary.currency === 'USD');
    await openJob(page, st, (usd[0] || ca[0]).id);
    const pay = await page.locator('#drawer .d-salary').innerText();
    assert(!usd.length && !/USD · per year/.test(pay), `${usd.length} of ${ca.length} Canada-only Google postings are in USD, e.g. "${usd[0]?.title}" (${usd[0]?.salary.text}) shows "${pay.split('\n').slice(0, 2).join(' ')}"`);
  });

  suite.test('Beta desktop QA: [D-23] the Location filter lists no bare country codes, "Republic of" or "Unknown Region" on the big-tech boards', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=microsoft');
    await needBeta(page, st, 'microsoft');
    const bad = [];
    // fix6-fresh-data: every big-tech board. Google, Meta and Amazon joined beta after D-23 was written,
    // and on the 2026-10-16 crawl Amazon listed bare "PRI" and "Manama, BHR" (now Puerto Rico, Bahrain).
    for (const c of ['microsoft', 'nvidia', 'netflix', 'apple', 'google', 'meta', 'amazon']) {
      if (c !== 'microsoft') { await page.goto(`${st.beta}/#c=${c}`); await ready(page); }
      const opts = await locationOptions(page);
      for (const o of opts) {
        if (/^[A-Z]{2,3}$/.test(o.label) || /^Republic of$/i.test(o.label) || /[֐-׿฀-๿]/.test(o.label) || /^[A-Z]{2}, [A-Z]{2}$/.test(o.label)) bad.push(`${c}: "${o.label}" (${o.count})`);
      }
      if (opts.some((o) => /unknown region/i.test(o.group))) bad.push(`${c}: group "Unknown Region"`);
    }
    assert(!bad.length, `raw location names: ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? ` +${bad.length - 10}` : ''}`);
  });

  suite.test('Beta desktop QA: [D-24] Google\'s default chart has more than one row (every role is "No department")', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=google');
    await needBeta(page, st, 'google');
    await page.waitForSelector('#chartHost .ms-crow'); await sleep(300);
    const rows = await page.$$eval('#chartHost .ms-crow', (r) => r.map((x) => x.getAttribute('aria-label')));
    const depts = await section(page, 'Department').locator('label.check').count();
    assert(rows.length > 1 && depts > 1, `default chart rows: ${rows.length} (${rows[0]}); Department options: ${depts}`);
  });

  suite.test('Beta desktop QA: [D-25] big-tech boards are named in the UI ("Apply on job board", menu group "Other")', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=apple');
    await needBeta(page, st, 'apple');
    await page.click('#companyMenuBtn'); await sleep(300);
    const group = await page.locator('#popover .company-list [role=group]').filter({ has: page.locator('.company-item-name', { hasText: /^Apple$/ }) }).locator('.check-group').innerText();
    await page.keyboard.press('Escape'); await sleep(200);
    await page.locator('#resultsList .card[data-id]').first().click(); await sleep(700);
    const label = await page.locator('#drawer .apply-label').evaluate((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim());
    assert(!/^apply on job board$/i.test(label) && !/^other$/i.test(group.trim()), `Apply reads "${label}"; Apple is listed under "${group}" in the company menu`);
  });

  suite.test('Beta desktop QA: [D-26] the top-bar Refresh does not offer a live refresh on a snapshot-only board', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=apple');
    await needBeta(page, st, 'apple');
    const btn = page.locator('#refreshBtn');
    const offered = (await btn.isVisible()) && (await btn.isEnabled()) && /live board/i.test(`${await btn.getAttribute('title')} ${await btn.getAttribute('aria-label')}`);
    assert(!offered, `Refresh is offered as "${await btn.getAttribute('title')}" on Apple, which can't be fetched live (the badge popover hides its own Refresh)`);
  });

  suite.test('Beta desktop QA: [D-27] the beta label reaches the tab title or screen readers, not only a CSS pill', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=apple');
    const r = await page.evaluate(() => {
      const brand = document.querySelector('.brand');
      const text = [...document.querySelectorAll('.topbar *')].some((e) => [...e.childNodes].some((n) => n.nodeType === 3 && /^\s*beta\s*$/i.test(n.textContent)) && e.getClientRects().length);
      return { title: document.title, aria: brand?.getAttribute('aria-label') || '', text };
    });
    assert(/beta/i.test(r.title) || /beta/i.test(r.aria) || r.text, `tab title "${r.title}", brand name "${r.aria}"; "Beta" exists only as .brand::after`);
  });

  suite.test('Beta desktop QA: [D-28] the beta site links back to the main site', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=apple');
    const hrefs = await page.$$eval('a[href]', (a) => a.map((x) => x.href));
    const back = hrefs.filter((h) => { try { const u = new URL(h); return u.pathname === '/melon-seek/' || u.pathname === '/melon-seek/index.html'; } catch { return false; } });
    assert(back.length, `no link to ${st.main}/ among ${hrefs.length} links (${[...new Set(hrefs.map((h) => h.replace(st.origin, '')))].slice(0, 5).join(', ')})`);
  });

  suite.test('Beta desktop QA: [D-29] the Ranges tooltip names a code-only currency once ("PLN 232K – PLN 470K PLN")', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=nvidia&v=ranges&l=Warsaw');
    const jobs = await needBeta(page, st, 'nvidia');
    if (!jobs.some((j) => j.salary && j.salary.currency === 'PLN')) skip('no PLN pay on NVIDIA');
    await page.waitForSelector('#chartHost .ms-row'); await sleep(300);
    let value = null;
    const rows = page.locator('#chartHost .ms-row');
    for (let i = 0; i < Math.min(8, await rows.count()) && !value; i++) {
      await rows.nth(i).hover(); await sleep(200);
      const v = await page.locator('.ms-viz-tip:not([hidden]) .ms-tip__value').first().innerText().catch(() => '');
      if (/PLN/.test(v)) value = v.trim();
    }
    if (!value) skip('no PLN row in the Warsaw ranges');
    assert(!(value.startsWith('PLN') && value.endsWith('PLN')), `tooltip value "${value}"`);
  });

  suite.test('Beta desktop QA: [D-30] Apple\'s "most new hires start at $X" is not labelled "Multiple pay zones"', async (ctx) => {
    const { st, page } = await openBeta(ctx, 'c=apple');
    const job = (await needBeta(page, st, 'apple')).find((j) => j.salary && /most new hires start at/i.test(j.salary.text || ''));
    if (!job) skip('no Apple posting with "most new hires start at"');
    await openJob(page, st, job.id);
    const labels = await page.locator('#drawer .pay-label').allInnerTexts();
    assert(!labels.includes('Multiple pay zones'), `"${job.title}" (${job.salary.text}) is labelled ${labels.join(', ')}`);
  });
}

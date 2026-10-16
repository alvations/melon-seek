// google-grouping lane e2e checks (docs/process/google-grouping.md). On the beta copy of the static build
// (dist/beta/, or BETA_QA_DIST=<dist>), served under /melon-seek/ like GitHub Pages:
//   - Google grouped by Department shows job-family rows (folded like the other big-tech boards), not brands;
//   - the Group select's Company option shows Google's brands (Google, YouTube, DeepMind, …) as rows;
//   - the Company list inside the Department filter zooms into one subsidiary, in the URL (b=);
//   - other boards are unchanged: no Company option, their own department rows, and a g=brand link
//     falls back to Department.
// Each check skips when the build or the board it needs is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

async function serveDist() {
  const dist = path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html')) || !fs.existsSync(path.join(dist, 'beta', 'api', 'jobs'))) return null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(u.pathname.slice('/melon-seek/'.length)); } catch { res.writeHead(400); return res.end(); }
    let p = path.join(dist, rel);
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

async function openBeta(ctx, hash, { phone = false } = {}) {
  const st = await serveDist();
  if (!st) skip('dist/beta/ not built (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext(phone
    ? { viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: DESKTOP, deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${st.beta}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 90000 });
  await sleep(800);
  const company = new URLSearchParams(hash).get('c');
  const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base: st.beta, company });
  if (mode !== 'snapshot') skip(`${company} has no beta snapshot in the build (${mode})`);
  return page;
}

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.ms-crow__name')].map((n) => n.firstChild.textContent.trim()));
const groupOptions = (page) => page.evaluate(() => [...document.querySelectorAll('#groupBy option')].map((o) => o.value));
const hashOf = (page) => page.evaluate(() => location.hash);
const roleCount = (page) => page.evaluate(() => Number((document.querySelector('#resultsTitle strong')?.textContent || '').replace(/[^\d]/g, '')));
const BRANDS = new Set(['Google', 'YouTube', 'DeepMind', 'Waymo', 'Wing', 'GFiber', 'Verily Life Sciences']);

export function registerGoogleGroupingTests(suite) {
  suite.test('google-grouping: Google grouped by Department shows job-family rows, folded like the other boards', async (ctx) => {
    const page = await openBeta(ctx, 'c=google');
    const r = await rows(page);
    assert(r.length >= 3 && r.length <= 8, `7 rows and a fold at most: ${r}`);
    assert(!r.some((x) => BRANDS.has(x)), `no brand rows under Department: ${r}`);
    assert(r.includes('Software Engineering'), `a job-family row: ${r}`);
    assert(/^\d[\d,]* more departments$/.test(r[r.length - 1]), `the small rows fold into one: ${r[r.length - 1]}`);
    const tip = await page.evaluate(() => document.querySelector('#groupBy option[value="department"]').title);
    assert(/job title/.test(tip) && /Google/.test(tip), `the Department option says where the departments come from: "${tip}"`);
    assert(tip.length <= 70, 'one short line');
  });

  suite.test('google-grouping: the Company grouping shows Google\'s brands as rows, in the URL', async (ctx) => {
    const page = await openBeta(ctx, 'c=google');
    const opts = await groupOptions(page);
    assertEq(opts.slice(0, 2).join(','), 'department,brand', 'Company follows Department in the Group select');
    assertEq(await page.evaluate(() => document.querySelector('#groupBy option[value="brand"]').textContent), 'Company');
    await page.selectOption('#groupBy', 'brand');
    await sleep(800);
    const r = await rows(page);
    assert(r.length >= 2 && r.every((x) => BRANDS.has(x)), `brand rows: ${r}`);
    assert(r.includes('Google') && r.includes('YouTube'), `Google and YouTube rows: ${r}`);
    assert(/(^|[#&])g=brand(&|$)/.test(await hashOf(page)), 'g=brand in the URL');
  });

  suite.test('google-grouping: the Company list in the Department filter zooms into one subsidiary', async (ctx) => {
    const page = await openBeta(ctx, 'c=google');
    const all = await roleCount(page);
    await page.locator('#quickChips [data-pop="dept"]').click();
    await page.waitForSelector('#popover.popover--dept:not([hidden])', { timeout: 10000 });
    const yt = page.locator('#popover .dept-filter label.check', { hasText: 'YouTube' }).first();
    assert(await yt.count(), 'YouTube is in the Company list');
    const want = Number((await yt.locator('.check-count').textContent()).replace(/[^\d]/g, ''));
    await yt.click();
    await sleep(800);
    await page.keyboard.press('Escape');
    await sleep(400);
    assert(/(^|[#&])b=YouTube(&|$)/.test(await hashOf(page)), 'b=YouTube in the URL');
    const n = await roleCount(page);
    assert(n === want && n > 0 && n < all, `${n} YouTube roles (expected ${want} of ${all})`);
    const r = await rows(page);
    assert(!r.some((x) => BRANDS.has(x)) && r.length >= 2, `YouTube's own job-family rows: ${r}`);
    assertEq((await page.locator('#quickChips [data-pop="dept"] .chip-label').textContent()).trim(), 'YouTube', 'the Department chip names the subsidiary');
    // A shared link opens the same view, grouped by Company: one row.
    const again = await openBeta(ctx, 'c=google&b=YouTube&g=brand');
    assertEq((await rows(again)).join(','), 'YouTube', 'one Company row');
  });

  suite.test('google-grouping: phone, the Department sheet lists Google\'s companies first', async (ctx) => {
    const page = await openBeta(ctx, 'c=google', { phone: true });
    await page.locator('#quickChips [data-pop="dept"]').tap();
    await sleep(900);
    const heads = await page.evaluate(() => [...document.querySelectorAll('.dept-filter .check-group')].filter((e) => !e.hidden && e.offsetParent).map((e) => e.textContent));
    assert(heads.includes('Company') && heads.includes('Department'), `Company and Department lists: ${heads}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `no horizontal scroll (${overflow}px)`);
  });

  for (const c of ['apple', 'microsoft', 'amazon']) {
    suite.test(`google-grouping: ${c} is unchanged (no Company option, its own departments, g=brand falls back)`, async (ctx) => {
      const page = await openBeta(ctx, `c=${c}`);
      const opts = await groupOptions(page);
      assertEq(opts.join(','), 'department,location,seniority,none', 'no Company option');
      const r = await rows(page);
      assert(r.length >= 3 && !r.includes('No company'), `department rows: ${r}`);
      assertEq(await page.evaluate(() => document.querySelector('#groupBy option[value="department"]').title), '', 'no "from job titles" note');
      const heads = await page.evaluate(() => { const h = [...document.querySelectorAll('.dept-filter .check-group')]; return h.filter((e) => !e.hidden).length; });
      assertEq(heads, 0, 'no Company list in the Department filter');
      const old = await openBeta(ctx, `c=${c}&g=brand`);
      assertEq((await rows(old)).join('|'), r.join('|'), 'a g=brand link groups by Department');
      assertEq(await old.evaluate(() => document.querySelector('#groupBy').value), 'department');
    });
  }
}

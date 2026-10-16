// viz-even lane e2e checks (docs/process/viz-even.md). The user, 2026-10-11: "Are you sure the salary range of the
// big tech are correct?! They don't look correct and kinda all span too evenly." On the beta copy of the static
// build (dist/beta/, or BETA_QA_DIST=<dist>), served under /melon-seek/ like GitHub Pages, with the real boards:
//   - Clusters: every circle stands at the median midpoint of the postings it holds (within 2 px), not at the
//     centre of a fixed $50K bin, at 1440 and 390 px, grouped by department and by Company (Google);
//   - Ranges: postings with the same posted range are one row with their count ("×95"), every posting is in a
//     row, and the row lists its postings when clicked.
// Each check skips when the build or the board it needs is missing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const TOLERANCE_PX = 2;
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
  return { page, base: st.beta };
}

/**
 * In the page: every Clusters circle on screen against the board's own data (public/api.js getJobs, then
 * chart.js chartPay and keyOf, the chart's own code), grouped along `dim`. A circle's postings are the row's
 * postings with midpoints from its lowest to its highest (data-lo, data-hi; the old chart had none, so its
 * aria-label's "$150K to $200K" bin is used). The axis scale comes from the labelled ticks.
 */
async function circleCheck(page, base, company, dim) {
  return page.evaluate(async ({ base, company, dim }) => {
    const { chartPay, keyOf } = await import(`${base}/viz/chart.js`);
    const jobs = (await (await import(`${base}/api.js`)).getJobs({ company })).jobs || [];
    const { plotted } = chartPay(jobs);
    const host = document.querySelector('#chartHost');
    const money = (t) => { const m = /\$([\d.]+)([KM]?)/.exec(t || ''); return m ? +m[1] * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1) : null; };
    const ticks = [...host.querySelectorAll('.ms-axis__tick')].map((t) => ({ v: money(t.textContent), px: parseFloat(t.style.left) })).filter((t) => t.v != null);
    const [a, b] = [ticks[0], ticks[ticks.length - 1]];
    const x = (v) => a.px + ((v - a.v) / (b.v - a.v)) * (b.px - a.px);
    const grid = [...host.querySelectorAll('.ms-chart__gridline')].map((g) => parseFloat(g.style.left));
    const plotL = Math.min(...grid), plotR = Math.max(...grid);
    const rows = [...host.querySelectorAll('.ms-crow')].map((r) => r.querySelector('.ms-crow__name').firstChild.textContent.trim());
    const named = new Set(rows.filter((n) => !/^\d[\d,]* more /.test(n)));
    const median = (s) => { s = s.slice().sort((p, q) => p - q); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
    const out = { circles: 0, bad: [], worst: 0, evenRows: 0, rows: rows.length };
    for (const row of host.querySelectorAll('.ms-crow')) {
      const name = row.querySelector('.ms-crow__name').firstChild.textContent.trim();
      const fold = /^\d[\d,]* more /.test(name);
      const mids = plotted.filter((p) => { const k = dim === 'none' ? 'All roles' : keyOf(p.job, dim); return fold ? !named.has(k) : k === name; }).map((p) => p.mid);
      const xs = [];
      for (const bin of row.querySelectorAll('.ms-bin:not(.ms-bin--overflow)')) {
        const label = bin.getAttribute('aria-label') || '';
        let lo, hi, inHi;
        if (bin.dataset.lo != null) { lo = +bin.dataset.lo; hi = +bin.dataset.hi; inHi = true; } else {
          const m = /, \$([\d.]+[KM]?) to \$([\d.]+[KM]?)/.exec(label);
          lo = money(`$${m[1]}`); hi = money(`$${m[2]}`); inHi = false;
        }
        const own = mids.filter((v) => v >= lo && (inHi ? v <= hi : v < hi));
        const cx = parseFloat(bin.style.left) + parseFloat(bin.style.width) / 2;
        xs.push(cx);
        out.circles++;
        if (!own.length) { out.bad.push(`${name}: "${label}" holds none of the row's postings`); continue; }
        const want = x(median(own));
        // A circle within a radius of the plot's ends is held inside the plot (V-29): up to 10 px.
        const allowed = want - plotL < 10 || plotR - want < 10 ? 10.5 : 2;
        const off = Math.abs(cx - want);
        out.worst = Math.max(out.worst, off);
        if (off > allowed) out.bad.push(`${name}: "${label}" drawn at ${cx.toFixed(1)}px, its ${own.length} postings' median ${Math.round(median(own)).toLocaleString()} is at ${want.toFixed(1)}px (${off.toFixed(1)}px off)`);
        if (own.length !== parseInt(label.replace(/,/g, ''), 10)) out.bad.push(`${name}: "${label}" says ${parseInt(label, 10)} roles, holds ${own.length}`);
      }
      const gaps = xs.slice(1).map((v, i) => v - xs[i]);
      if (gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) < 1) out.evenRows++;
    }
    return out;
  }, { base, company, dim });
}

export function registerVizEvenTests(suite) {
  for (const [company, hash, phone, dim] of [
    ['google', 'c=google', false, 'department'],
    ['google', 'c=google', true, 'department'],
    ['microsoft', 'c=microsoft', false, 'department'],
    ['amazon', 'c=amazon', true, 'department'],
    ['google', 'c=google&g=brand', false, 'brand'],
  ]) {
    suite.test(`viz-even: Clusters circles stand at their postings' median (${company}, ${dim}, ${phone ? '390' : '1440'} px)`, async (ctx) => {
      const { page, base } = await openBeta(ctx, hash, { phone });
      await page.waitForSelector('#chartHost .ms-bin', { timeout: 30000 });
      const r = await circleCheck(page, base, company, dim);
      assert(r.circles >= r.rows, `circles drawn: ${r.circles} in ${r.rows} rows`);
      assert(!r.bad.length, `${r.bad.length} of ${r.circles} circles are not at their postings' median (within ${TOLERANCE_PX} px): ${r.bad.slice(0, 4).join('; ')}`);
      assert(r.evenRows < r.rows, `every row's circles are evenly spaced (${r.evenRows} of ${r.rows})`);
    });
  }

  suite.test('viz-even: Ranges stacks one posted range into one row with its count (Microsoft, Software Engineering $119,800-$234,700)', async (ctx) => {
    const { page, base } = await openBeta(ctx, 'c=microsoft&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 30000 });
    const want = await page.evaluate(async ({ base }) => {
      const { chartPay, keyOf, spanTiers, isPartTimeHourly } = await import(`${base}/viz/chart.js`);
      const jobs = (await (await import(`${base}/api.js`)).getJobs({ company: 'microsoft' })).jobs || [];
      const { plotted } = chartPay(jobs);
      const n = plotted.filter((p) => p.cur === 'USD' && p.job.salary.min === 119800 && p.job.salary.max === 234700 && keyOf(p.job, 'department') === 'Software Engineering'
        && !p.ote && !spanTiers(p.job) && !isPartTimeHourly(p.job)).length;
      return { n, plotted: plotted.length };
    }, { base });
    if (want.n < 2) skip(`the band is on ${want.n} Software Engineering postings today`);
    // Every row, scrolled through (rows are windowed).
    const rows = await page.evaluate(async () => {
      const host = document.querySelector('#chartHost');
      const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
      const seen = new Map();
      for (let y = 0; y <= parseFloat(body.style.height) + 600; y += 500) {
        if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const r of host.querySelectorAll('.ms-row')) seen.set(r.dataset.idx, { idx: r.dataset.idx, n: r.dataset.n == null ? null : +r.dataset.n, aria: r.getAttribute('aria-label') || '', count: r.querySelector('.ms-row__count')?.textContent || '', label: r.querySelector('.ms-row__label')?.textContent || '' });
      }
      return [...seen.values()];
    });
    const total = rows.reduce((s, r) => s + (r.n ?? 1), 0);
    assertEq(total, want.plotted, 'every posting with pay is in a row');
    assert(rows.length < want.plotted, `${rows.length} rows for ${want.plotted} postings: identical bars are not stacked`);
    // Bars stack only with bars drawn the same way. Since SB-5 (salary-audit-backend) some Microsoft postings carry
    // per-place ranges, drawn striped ("each the range for one of its places"): those stack in a row of their own.
    const PER_PLACE = /each the range for one of its places/;
    const same = rows.filter((r) => /\$120K to \$235K/.test(r.aria) && /Software Engineering/.test(r.aria) && r.n > 1);
    const band = same.filter((r) => !PER_PLACE.test(r.aria));
    assertEq(band.length, 1, `one Software Engineering row for $119,800-$234,700 (${same.map((r) => r.aria).join(' | ')})`);
    assert(same.filter((r) => PER_PLACE.test(r.aria)).length <= 1, `the per-place bars of that band are one row too (${same.map((r) => r.aria).join(' | ')})`);
    const [row] = band;
    assertEq(row.n, want.n, 'its count is every posting with that range');
    assertEq(row.count, `×${want.n}`, 'the count by the bar');
    assert(row.label.startsWith(`${want.n} roles`), `the title column says how many: "${row.label}"`);
    assert(row.aria.startsWith(`${want.n} roles with the same posted range`), `aria-label: "${row.aria}"`);
    // Hover: the tooltip says how many share the range; click: the list shows them.
    await page.evaluate((idx) => {
      const host = document.querySelector('#chartHost');
      const r = host.querySelector(`.ms-row[data-idx="${idx}"]`);
      if (r) r.scrollIntoView({ block: 'center' });
    }, row.idx);
    await sleep(300);
    let el = page.locator(`#chartHost .ms-row[data-idx="${row.idx}"]`);
    if (!(await el.count())) {
      await page.evaluate(async (idx) => {
        const host = document.querySelector('#chartHost'), sc = host.querySelector('.ms-chart__scroll');
        const top = +idx * 22;
        if (host.classList.contains('ms-chart--flow')) scrollTo(0, host.querySelector('.ms-chart__body').getBoundingClientRect().top + scrollY + top - 300); else sc.scrollTop = top - 200;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, row.idx);
      el = page.locator(`#chartHost .ms-row[data-idx="${row.idx}"]`);
    }
    await el.hover();
    await sleep(250);
    const tipText = await page.locator('.ms-viz-tip:not([hidden])').first().innerText();
    assert(new RegExp(`${want.n} postings with this posted range`).test(tipText), `tooltip: "${tipText.replace(/\n/g, ' / ')}"`);
    await el.click();
    await sleep(600);
    const chip = await page.locator('#areaChipTop .area-chip').innerText().catch(() => '');
    assert(new RegExp(`\\(${want.n}\\)`).test(chip), `the list shows the row's postings: chip "${chip}"`);
    const t = (await page.locator('#resultsTitle').innerText()).replace(/,/g, '');
    assertEq(Number((t.match(/(\d+)\s+role/) || [])[1]), want.n, 'listed roles');
  });

  suite.test('viz-even: Ranges keyboard: arrows walk the stacked rows, Enter on one lists its postings, End and Home reach the ends (Netflix)', async (ctx) => {
    const { page } = await openBeta(ctx, 'c=netflix&v=ranges');
    await page.waitForSelector('#chartHost .ms-row', { timeout: 30000 });
    await page.locator('#chartHost .ms-chart__body').focus();
    const active = () => page.evaluate(() => {
      const a = document.querySelector('#chartHost .ms-row.is-active');
      return a ? { idx: +a.dataset.idx, n: a.dataset.n == null ? null : +a.dataset.n, selected: a.getAttribute('aria-selected'), id: a.id, desc: document.querySelector('#chartHost .ms-chart__body').getAttribute('aria-activedescendant') } : null;
    });
    await page.keyboard.press('Home');
    await sleep(200);
    let a = await active();
    assertEq(a?.idx, 0, 'Home: the first row');
    for (let k = 0; k < 80 && !(a.n > 1); k++) { await page.keyboard.press('ArrowDown'); await sleep(60); a = await active(); }
    assert(a.n > 1, `no row of several postings within the first 80 rows (row ${a.idx})`);
    assertEq(a.selected, 'true', 'the active row is selected for screen readers');
    assertEq(a.desc, a.id, 'aria-activedescendant names it');
    await page.keyboard.press('Enter');
    await sleep(600);
    const chip = await page.locator('#areaChipTop .area-chip').innerText().catch(() => '');
    assert(new RegExp(`\\(${a.n}\\)`).test(chip), `Enter lists the row's ${a.n} postings: chip "${chip}"`);
    await page.locator('#chartHost .ms-chart__body').focus();
    await page.keyboard.press('End');
    await sleep(400);
    const last = await active();
    const height = await page.evaluate(() => parseFloat(document.querySelector('#chartHost .ms-chart__body').style.height));
    assert(last && last.idx > a.idx, `End: the last row (${last?.idx})`);
    assert(Math.abs((last.idx + 1) * 22 + 8 - height) < 1, `the last row is the chart's last (${last.idx + 1} rows, ${height}px)`);
  });
}

// Beta data-visualisation review, 2026-10-11 (docs/process/viz-review-beta.md). Desktop Chromium at
// 1440x900 against the static build: BETA_QA_DIST (the lead's build), else dist/ from `npm run build`,
// served under /melon-seek/ like GitHub Pages. Other hosts are aborted, so the map is in its offline
// look (no basemap, place names under the pins).
// Every test is tagged with a finding ID ("[V-16]") and encodes an open problem: it fails on the
// reviewed build and passes once the finding is fixed. Each test skips when the build, the board or
// the kind of posting it needs is missing, so a later crawl without such postings never fails it.
// V-31 (an Apple filter takes 177–346 ms from click to the last chart change) has no test here: it
// passes or fails with the machine's load, so it is recorded in the log only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
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
  return { origin, main: `${origin}/melon-seek`, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh desktop page at `<site>/#<hash>`, results loaded. */
async function open(ctx, hash, { site = 'beta', dark = false, viewport = DESKTOP } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext({ viewport, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${site === 'beta' ? st.beta : st.main}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 90000 });
  await sleep(600);
  return { st, page, base: site === 'beta' ? st.beta : st.main };
}

/** Skip unless `company` is a real (snapshot) board on that site. */
async function needBoard(page, base, company) {
  const mode = await page.evaluate(async ({ base, company }) => (await (await import(`${base}/api.js`)).getJobs({ company })).mode, { base, company });
  if (mode !== 'snapshot') skip(`${company} has no snapshot in this build (${mode})`);
}
/**
 * The app's own jobs (public/api.js getJobs), reduced in the page by `fnSrc` (a function's source).
 * The page's CSP forbids eval, so the expression goes to Playwright as a string (DevTools evaluation).
 */
async function jobsWhere(page, base, company, fnSrc) {
  return page.evaluate(`(async () => { const jobs = (await (await import(${JSON.stringify(`${base}/api.js`)})).getJobs({ company: ${JSON.stringify(company)} })).jobs || []; return (${fnSrc})(jobs); })()`);
}
/** Run `fn(C)` in the page with the colour helpers C (CONTRAST_FN), the same way. */
const withColour = (page, fn) => page.evaluate(`(${fn.toString()})(${CONTRAST_FN})`);

async function mapReady(page) {
  await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 30000 });
  await sleep(4600); // map.js treats the basemap as missing after 4 s, then names the pins
}

/** WCAG contrast of two [r,g,b]. */
const CONTRAST_FN = `(() => {
  const cv = document.createElement('canvas').getContext('2d');
  const solid = (s) => {
    const m = String(s).match(/^rgba?\\(([\\d.]+)[ ,]+([\\d.]+)[ ,]+([\\d.]+)(?:[ ,/]+([\\d.]+))?/);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
    const c = String(s).match(/^color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.]+))?/);
    if (c) return [c[1] * 255, c[2] * 255, c[3] * 255, c[4] == null ? 1 : +c[4]];
    cv.fillStyle = '#000'; cv.fillStyle = s; const h = cv.fillStyle; const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  };
  const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const opac = (e) => { let o = 1; for (let n = e; n && n !== document; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = solid(getComputedStyle(n).backgroundColor); if (c[3] > 0.99) return c; } return [255, 255, 255, 1]; };
  const fillOver = (e, bg) => { const c = solid(getComputedStyle(e).backgroundColor); const a = c[3] * opac(e); return c.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)); };
  return { solid, ratio, bgOf, fillOver };
})()`;

/** Collect every Clusters row's accessible name by scrolling the (windowed) chart. */
async function allClusterRows(page) {
  return page.evaluate(async () => {
    const host = document.querySelector('#chartHost');
    const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
    const seen = new Map();
    const H = parseFloat(body.style.height) || 0;
    for (let y = 0; y <= H + 300; y += 300) {
      if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const r of host.querySelectorAll('.ms-crow')) seen.set(r.querySelector('.ms-crow__name')?.textContent, { aria: r.getAttribute('aria-label') || '', title: r.querySelector('.ms-crow__label')?.title || '', sub: r.querySelector('.ms-crow__sub')?.textContent || '' });
    }
    return [...seen].map(([name, v]) => ({ name, ...v }));
  });
}

/**
 * D-44 (fix-viz-5): Group by Location folds the small places into "N more places"; open it so every place is a row
 * (as fix-pay-at-place's [V-36] checks do). Without it [V-18] never found its London row and skipped on every run
 * since D-44 (qa-suite-beta T-19).
 */
async function openFold(page) {
  const fold = page.locator('#chartHost .ms-crow__label:has(.ms-crow__fold)').first();
  if (!(await fold.count()) || (await fold.locator('.ms-crow__fold').textContent()) === '\u25b4') return;
  await fold.click();
  await page.waitForFunction(() => document.querySelector('#chartHost .ms-crow__fold')?.textContent === '\u25b4', null, { timeout: 15000 });
}

/** Hover each ranges row (up to `max`) and return the tooltips. */
async function rangeTips(page, max = 12) {
  const n = Math.min(max, await page.locator('#chartHost .ms-row').count());
  const out = [];
  for (let i = 0; i < n; i++) {
    await page.locator('#chartHost .ms-row').nth(i).hover({ force: true });
    await sleep(120);
    out.push(await page.evaluate(() => document.querySelector('.ms-viz-tip:not([hidden])')?.innerText.replace(/\n+/g, ' / ') || ''));
  }
  return out;
}

export function registerBetaVizReviewTests(suite) {
  /* ------------------------------------------------------------------ map */

  suite.test('Beta viz review: [V-16] the map\'s pay colour means the same pay everywhere: a $473K pin and a $75K pin are not the same green', async (ctx) => {
    const fills = [];
    for (const [company, place] of [['netflix', 'Los Gatos'], ['google', 'Warsaw']]) {
      const { page, base } = await open(ctx, `c=${company}&m=map&l=${encodeURIComponent(place)}`);
      await needBoard(page, base, company);
      await mapReady(page);
      const pins = await page.$$eval('#mapHost .ms-pin-icon', (icons) => icons.map((p) => ({ name: p.getAttribute('aria-label') || '', bg: p.querySelector('.ms-pin').style.getPropertyValue('--pin-bg') })));
      const paid = pins.find((p) => /median \$/.test(p.name));
      if (!paid) skip(`${company} ${place}: no pin with a pay median (${JSON.stringify(pins)})`);
      fills.push(paid);
    }
    const [a, b] = fills;
    const v = (p) => { const m = /median \$([\d.]+)([KM])/.exec(p.name); return +m[1] * (m[2] === 'M' ? 1000 : 1); };
    if (Math.abs(v(a) - v(b)) < 100) skip(`the two medians are too close to need different colours (${a.name} / ${b.name})`);
    assert(a.bg !== b.bg, `"${a.name}" and "${b.name}" are both drawn ${a.bg}: the pay colour is scaled to the pins on screen (a lone pin is always the same green), and the map has no pay legend`);
  });

  suite.test('Beta viz review: [V-17] a pin whose median rests on one posting with pay says so (Netflix "Warsaw, London and 6 more": 1 of 48)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=netflix&m=map');
    await needBoard(page, base, 'netflix');
    await mapReady(page);
    const pins = await page.$$eval('#mapHost .ms-pin-icon', (icons) => icons.map((p) => ({ name: p.getAttribute('aria-label') || '', pill: p.querySelector('.ms-pin')?.textContent || '' })));
    const bad = [];
    for (let i = 0; i < pins.length; i++) {
      if (!/median \$/.test(pins[i].name)) continue;
      const n = +(/: ([\d,]+) postings?/.exec(pins[i].name)?.[1] || '0').replace(/,/g, '');
      await page.locator('#mapHost .ms-pin-icon').nth(i).locator('.ms-pin__price').hover({ force: true });
      await sleep(250);
      const tip = await page.evaluate(() => [...document.querySelectorAll('.ms-map-tip')].map((t) => t.innerText).join(' '));
      const k = +(/([\d,]+) with salary for here/.exec(tip)?.[1] || '0').replace(/,/g, '');
      if (k && n >= 10 && k / n < 0.1) {
        const said = new RegExp(`\\b${k}\\b[^,]*(?:with (?:pay|salary)|salar)`, 'i');
        if (!said.test(pins[i].name) && !said.test(pins[i].pill)) bad.push(`"${pins[i].name}" (pill "${pins[i].pill}") rests on ${k} of ${n} postings`);
      }
    }
    if (!pins.some((p) => /median \$/.test(p.name))) skip('no pin with a pay median');
    assert(!bad.length, `pins priced from a handful of their postings look like the median of all of them: ${bad.join('; ')}`);
  });

  suite.test('Beta viz review: [V-24] offline map: no place name is drawn for a pin that is off the map (Google, zoomed in twice)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=google&m=map');
    await needBoard(page, base, 'google');
    await mapReady(page);
    for (let i = 0; i < 2; i++) { await page.click('#mapHost .leaflet-control-zoom-in'); await sleep(1400); }
    const floating = await page.evaluate(() => {
      const h = document.querySelector('#mapHost').getBoundingClientRect();
      const on = (r) => r.right > h.left && r.left < h.right && r.bottom > h.top && r.top < h.bottom;
      return [...document.querySelectorAll('#mapHost .ms-pin')].filter((p) => {
        const lab = p.querySelector('.ms-pin__label');
        if (!lab || getComputedStyle(lab).display === 'none') return false;
        return !on(p.getBoundingClientRect()) && on(lab.getBoundingClientRect());
      }).map((p) => p.querySelector('.ms-pin__label').textContent);
    });
    assert(!floating.length, `${floating.length} place names are drawn on the map for pins that are off it, e.g. ${JSON.stringify(floating.slice(0, 5))}`);
  });

  suite.test('Beta viz review: [V-26] a pin placed at its state\'s centre says it is approximate (Google, Location = Haskell, TX)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=google&m=map&l=Haskell');
    await needBoard(page, base, 'google');
    const loc = await jobsWhere(page, base, 'google', `(jobs) => { for (const j of jobs) for (const l of j.locations || []) if (l.city === 'Haskell') return l; return null; }`);
    if (!loc) skip('no Haskell, TX posting in this crawl');
    // Haskell, TX is at 33.16, -99.73; the Texas centre the gazetteer uses is about 31.05, -97.56.
    const km = 6371 * 2 * Math.asin(Math.sqrt(Math.sin(((loc.lat - 33.16) * Math.PI) / 360) ** 2 + Math.cos((loc.lat * Math.PI) / 180) * Math.cos((33.16 * Math.PI) / 180) * Math.sin(((loc.lng + 99.73) * Math.PI) / 360) ** 2));
    if (km < 50) return; // placed at the town: nothing to say
    await mapReady(page);
    const names = await page.$$eval('#mapHost .ms-pin-icon', (icons) => icons.map((p) => p.getAttribute('aria-label') || ''));
    await page.locator('#mapHost .ms-pin__price').first().hover({ force: true });
    await sleep(300);
    const tip = await page.evaluate(() => [...document.querySelectorAll('.ms-map-tip')].map((t) => t.innerText).join(' '));
    assert(/approximate|approx\.|(centre|center) of|somewhere in|exact (place|location)/i.test(names.join(' ') + ' ' + tip), `"Haskell, TX" is pinned ${Math.round(km)} km away at (${loc.lat}, ${loc.lng}), the middle of Texas, and the pin (${JSON.stringify(names)}) and tooltip ("${tip.slice(0, 160)}") present it as the town`);
  });

  suite.test('Beta viz review: [V-28] the Juice legend\'s "no Juice data" swatch matches the no-data pins', async (ctx) => {
    const { page, base } = await open(ctx, 'c=google&m=map&mc=juice');
    await needBoard(page, base, 'google');
    await mapReady(page);
    const r = await withColour(page, (C) => {
      const legend = document.querySelector('#mapHost .ms-modes__legend')?.innerText || '';
      const pin = [...document.querySelectorAll('#mapHost .ms-pin--nosalary')][0];
      if (!pin) return null;
      const fill = C.solid(getComputedStyle(pin).backgroundColor);
      const sat = Math.max(...fill.slice(0, 3)) - Math.min(...fill.slice(0, 3));
      const lum = (fill[0] + fill[1] + fill[2]) / 3;
      return { legend, fill: fill.slice(0, 3).map(Math.round), gray: sat < 12 && lum > 60 && lum < 200 };
    });
    if (!r) skip('no pin without Juice data');
    if (!/gr[ae]y/i.test(r.legend)) return; // the legend no longer names a colour
    assert(r.gray, `the legend says "Gray: no Juice data", but those pins are filled rgb(${r.fill.join(',')}), the same white as a "Dry" pin`);
  });

  /* ---------------------------------------------------------------- chart */

  suite.test('Beta viz review: [V-18] Group by Location: a row for a place no posted pay covers shows no median (Google "London")', async (ctx) => {
    const { page, base } = await open(ctx, 'c=google&g=location');
    await needBoard(page, base, 'google');
    await openFold(page);
    const rows = await allClusterRows(page);
    const london = rows.find((r) => r.name === 'London');
    if (!london) skip('no London row');
    const londonPay = await jobsWhere(page, base, 'google', `(jobs) => jobs.filter((j) => { const on = (j.locations || []).find((l) => !l.remote); return j.salary && on && on.city === 'London' && (j.salary.currency === 'GBP'); }).length`);
    if (londonPay) skip(`${londonPay} London-first postings now post pounds`);
    assert(!/median \$/.test(london.aria), `"${london.aria}": every salaried posting in this row lists pay for another country (US dollars or euros), so the row's median is not London pay`);
  });

  suite.test('Beta viz review: [V-19] the chart says a part-time hourly posting\'s yearly figure is for full-time hours (Apple "US-Genius")', async (ctx) => {
    const { page, base } = await open(ctx, 'c=apple&v=ranges&q=Genius');
    await needBoard(page, base, 'apple');
    const n = await jobsWhere(page, base, 'apple', `(jobs) => jobs.filter((j) => j.salary && j.salary.partTime && /Genius/.test(j.title)).length`);
    if (!n) skip('no part-time Genius posting with pay');
    const tips = await rangeTips(page, 30);
    const pt = tips.filter((t) => /Part-time/.test(t));
    if (!pt.length) skip(`no part-time row among the first ${tips.length}`);
    assert(pt.every((t) => /full[- ]time/i.test(t)), `a part-time posting is plotted at 2,080 hours a year with "${pt[0]}"; the app's own rule (shared decision 4) is "a year if full-time"`);
  });

  suite.test('Beta viz review: [V-20] Ranges: a range that spans two levels is not drawn or described as one posted range (NVIDIA)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=nvidia&v=ranges&q=Senior%20CPU%20Design%20Engineer');
    await needBoard(page, base, 'nvidia');
    const n = await jobsWhere(page, base, 'nvidia', `(jobs) => jobs.filter((j) => j.salary && j.salary.levels && /Senior CPU Design Engineer/.test(j.title)).length`);
    if (!n) skip('no two-level "Senior CPU Design Engineer" posting');
    const tips = await rangeTips(page, 4);
    const legend = await page.evaluate(() => [document.querySelector('#chartHost .ms-chart__legend')?.innerText || '', document.querySelector('#chartHost .ms-chart__foot')?.textContent || ''].join(' '));
    const said = tips.some((t) => /level/i.test(t.split(' / ').slice(0, 3).join(' '))) || /level/i.test(legend);
    assert(said, `the bar runs from Level 4's minimum to Level 5's maximum, and neither the tooltip ("${tips[0]}") nor the legend or notes ("${legend.slice(0, 160)}") say it covers two levels`);
  });

  suite.test('Beta viz review: [V-21] a Group by row that pools several countries\' pay says so (Microsoft, Seniority: Entry $90K below Intern $101K)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=microsoft&g=seniority');
    await needBoard(page, base, 'microsoft');
    const mix = await jobsWhere(page, base, 'microsoft', `(jobs) => { const m = {}; for (const j of jobs) { if (!j.salary) continue; const k = j.seniority === 'Entry' ? 'Entry' : null; if (!k) continue; m[j.salary.currency] = (m[j.salary.currency] || 0) + 1; } return m; }`);
    if (Object.keys(mix).length < 2) skip(`Entry pay is in one currency now (${JSON.stringify(mix)})`);
    const rows = await allClusterRows(page);
    const entry = rows.find((r) => r.name === 'Entry');
    if (!entry) skip('no Entry row');
    const words = `${entry.aria} ${entry.title} ${entry.sub}`;
    assert(/countr|currenc|converted|US only|in the US/i.test(words), `"${entry.aria}" pools ${JSON.stringify(mix)} pay into one median and does not say so (the US-only Entry median is about $127K, the Intern row reads $101K)`);
  });

  suite.test('Beta viz review: [V-22] chart marks clear 3:1 against the chart background (Apple Clusters circles, NVIDIA Ranges bars)', async (ctx) => {
    const bad = [];
    for (const hash of ['c=apple', 'c=nvidia&v=ranges']) {
      const { page, base } = await open(ctx, hash);
      await needBoard(page, base, hash.slice(2).split('&')[0]);
      const r = await withColour(page, (C) => {
        const host = document.querySelector('#chartHost');
        const bg = C.bgOf(host.querySelector('.ms-chart__body'));
        const marks = [...host.querySelectorAll('.ms-bin:not(.ms-bin--overflow) .ms-bin__dot, .ms-row__bar')];
        const vals = marks.map((m) => C.ratio(C.fillOver(m, bg), bg));
        return { n: vals.length, min: Math.min(...vals), max: Math.max(...vals) };
      });
      if (r.n && r.min < 3) bad.push(`${hash}: ${r.n} marks at ${r.min.toFixed(2)}–${r.max.toFixed(2)}:1`);
    }
    assert(!bad.length, `data marks below 3:1: ${bad.join('; ')}`);
  });

  suite.test('Beta viz review: [V-25] category colours stay apart for deuteranopia (Apple Ranges legend)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=apple&v=ranges');
    await needBoard(page, base, 'apple');
    const pairs = await withColour(page, (C) => {
      const items = [...document.querySelectorAll('#chartHost .ms-legend__item')].map((i) => ({ key: i.querySelector('.ms-legend__key').textContent, c: C.solid(getComputedStyle(i.querySelector('.ms-legend__swatch')).backgroundColor).slice(0, 3) }));
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const un = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
      const M = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]; // Machado 2009, deuteranopia
      const sim = (c) => { const l = c.map(lin); return M.map((r) => un(Math.max(0, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2])))); };
      const lab = (c) => { const [r, g, b] = c.map(lin); const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
      const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
      const out = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const d = dE(sim(items[i].c), sim(items[j].c)); if (d < 10) out.push(`"${items[i].key}" vs "${items[j].key}" ΔE ${d.toFixed(1)}`); }
      return { n: items.length, out };
    });
    if (pairs.n < 2) skip('no colour legend');
    assert(!pairs.out.length, `legend colours that look alike with deuteranopia (CIELAB ΔE under 10): ${pairs.out.join('; ')}`);
  });

  suite.test('Beta viz review: [V-27] axis tick labels name the gridline\'s value (Netflix Ranges: "$1.3M" sits at $1.25M)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=netflix&v=ranges');
    await needBoard(page, base, 'netflix');
    const ticks = await page.evaluate(() => [...document.querySelectorAll('#chartHost .ms-axis__tick')].map((t) => ({ px: parseFloat(t.style.left), v: t.textContent })));
    const val = (s) => { const m = /\$([\d.]+)([KM]?)/.exec(s); return m ? +m[1] * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1) : NaN; };
    if (ticks.length < 3) skip('too few ticks');
    // Ticks are evenly spaced in value, so each label must sit where its value falls on the line
    // through the first two ticks.
    const [a, b] = ticks;
    const k = (val(b.v) - val(a.v)) / (b.px - a.px);
    const off = ticks.filter((t) => Math.abs(val(a.v) + (t.px - a.px) * k - val(t.v)) > Math.abs(k) * 2).map((t) => `${t.v} at ${Math.round(val(a.v) + (t.px - a.px) * k).toLocaleString('en-US')}`);
    assert(!off.length, `tick labels that don't match their gridline: ${off.join(', ')} (ticks ${ticks.map((t) => t.v).join(' ')})`);
  });

  suite.test('Beta viz review: [V-29] Clusters: no circle sits on the axis-edge "›" marker, and no bin reaches past the axis (Microsoft, Location, Mountain View)', async (ctx) => {
    const { page, base } = await open(ctx, 'c=microsoft&g=location');
    await needBoard(page, base, 'microsoft');
    const rows = await page.evaluate(async () => {
      const host = document.querySelector('#chartHost');
      const sc = host.querySelector('.ms-chart__scroll'), body = host.querySelector('.ms-chart__body');
      const ticks = [...host.querySelectorAll('.ms-axis__tick')].map((t) => t.textContent);
      const out = [];
      for (let y = 0; y <= parseFloat(body.style.height) + 300; y += 300) {
        if (host.classList.contains('ms-chart--flow')) scrollTo(0, body.getBoundingClientRect().top + scrollY + y - 100); else sc.scrollTop = y;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const row of host.querySelectorAll('.ms-crow')) {
          const chip = row.querySelector('.ms-bin--overflow-hi .ms-bin__chip');
          if (!chip) continue;
          const cr = chip.getBoundingClientRect();
          for (const d of row.querySelectorAll('.ms-bin:not(.ms-bin--overflow) .ms-bin__dot')) {
            const r = d.getBoundingClientRect();
            if (r.right > cr.left + 0.5 && r.left < cr.right) out.push(`${row.querySelector('.ms-crow__name').textContent}: "${d.closest('.ms-bin').getAttribute('aria-label')}" runs into "${chip.closest('.ms-bin').getAttribute('aria-label')}" (axis ends at ${ticks.at(-1)})`);
          }
        }
      }
      return [...new Set(out)];
    });
    assert(!rows.length, rows.slice(0, 4).join('; '));
  });

  /* --------------------------------------------------------------- drawer */

  suite.test('Beta viz review: [V-23] dark mode: every company in "Same role elsewhere" is visible (bar and median tick 3:1)', async (ctx) => {
    const probe = await open(ctx, 'c=google');
    await needBoard(probe.page, probe.base, 'google');
    const id = await jobsWhere(probe.page, probe.base, 'google', `(jobs) => (jobs.find((j) => /^Senior Software Engineer/.test(j.title) && j.salary && j.salary.currency === 'USD') || {}).id || null`);
    if (!id) skip('no Senior Software Engineer posting with US pay');
    const { page } = await open(ctx, `c=google&job=${encodeURIComponent(id)}`, { dark: true });
    await page.locator('.ms-comps__row').first().waitFor({ timeout: 30000 });
    await sleep(600);
    const r = await withColour(page, (C) => {
      const comps = [...document.querySelectorAll('.ms-comps')].pop();
      const bg = C.bgOf(comps);
      return [...comps.querySelectorAll('.ms-comps__row')].map((row) => {
        const bar = row.querySelector('.ms-comps__bar'), med = row.querySelector('.ms-comps__median');
        if (!bar || row.classList.contains('is-current')) return null;
        return { name: row.querySelector('.ms-comps__label').textContent, bar: C.ratio(C.fillOver(bar, bg), bg), tick: C.ratio(C.fillOver(med, bg), bg) };
      }).filter(Boolean);
    });
    const bad = r.filter((x) => Math.max(x.bar, x.tick) < 3).map((x) => `${x.name} bar ${x.bar.toFixed(2)}:1, tick ${x.tick.toFixed(2)}:1`);
    assert(!bad.length, `invisible in dark mode: ${bad.join('; ')}`);
  });

  suite.test('Beta viz review: [V-32] the Juice waterfall\'s Tax, Rent and Living costs bars clear 3:1 against their track, light and dark', async (ctx) => {
    const probe = await open(ctx, 'c=microsoft');
    await needBoard(probe.page, probe.base, 'microsoft');
    const id = await jobsWhere(probe.page, probe.base, 'microsoft', `(jobs) => (jobs.find((j) => j.juice && j.juice.best && j.juice.best.tax > 0 && j.salary) || {}).id || null`);
    if (!id) skip('no Microsoft posting with Juice');
    const bad = [];
    for (const dark of [false, true]) {
      const { page } = await open(ctx, `c=microsoft&job=${encodeURIComponent(id)}`, { dark });
      await page.locator('.juice-details').waitFor({ state: 'attached', timeout: 20000 });
      await page.evaluate(() => { document.querySelector('.juice-details').open = true; });
      await sleep(300);
      const rows = await withColour(page, (C) => [...document.querySelectorAll('.waterfall .wf-row')].map((row) => {
        const track = row.querySelector('.wf-track'), bar = row.querySelector('.wf-bar');
        const t = C.fillOver(track, C.bgOf(track.parentElement));
        return { label: row.querySelector('.wf-label').textContent, r: C.ratio(C.fillOver(bar, t), t) };
      }));
      for (const x of rows) if (/Tax|Rent|Living/.test(x.label) && x.r < 3) bad.push(`${dark ? 'dark' : 'light'} ${x.label} ${x.r.toFixed(2)}:1`);
    }
    assert(!bad.length, `deduction bars that barely show against their track: ${bad.join('; ')}`);
  });

  suite.test('Beta viz review: [V-30] the Juice drawer gives one figure for the place shown ("Compare locations" best = Juice left, every household)', async (ctx) => {
    const probe = await open(ctx, 'c=microsoft');
    await needBoard(probe.page, probe.base, 'microsoft');
    const ids = await jobsWhere(probe.page, probe.base, 'microsoft', `(jobs) => jobs.filter((j) => j.juice && j.juice.byLocation && j.juice.byLocation.length > 1 && j.salary).slice(0, 12).map((j) => j.id)`);
    if (!ids.length) skip('no Microsoft posting with Juice in several places');
    const want = ids.includes('microsoft:1970393556995383') ? ['microsoft:1970393556995383', ...ids.filter((x) => x !== 'microsoft:1970393556995383')] : ids;
    const { page } = await open(ctx, `c=microsoft&job=${encodeURIComponent(want[0])}`);
    const bad = [];
    const money = (s) => { const m = /([−-])?\$([\d,]+)/.exec(s || ''); return m ? (m[1] ? -1 : 1) * +m[2].replace(/,/g, '') : null; };
    for (const id of want.slice(0, 4)) {
      await page.evaluate((h) => { location.hash = h; }, `c=microsoft&job=${encodeURIComponent(id)}`);
      await page.locator('.juice-household [data-household]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
      for (const hh of ['single', 'couple', 'family']) {
        const btn = page.locator(`.juice-household [data-household="${hh}"]`);
        if (!(await btn.count())) continue;
        await page.evaluate(() => { const d = document.querySelector('.juice-details'); if (d) d.open = true; });
        await btn.click({ force: true });
        await sleep(900);
        const r = await page.evaluate(() => {
          const d = document.querySelector('.juice-details'); if (d) d.open = true;
          const left = [...document.querySelectorAll('.waterfall .wf-row')].find((x) => /Juice left/.test(x.textContent))?.querySelector('.wf-value')?.textContent;
          const best = [...document.querySelectorAll('.juice-compare li')].find((li) => /· (best|shown above)/.test(li.textContent));
          return { left, best: best ? best.querySelector('.jc-net')?.textContent : null, name: best?.querySelector('.jc-name')?.textContent };
        });
        if (r.best && money(r.best) !== money(r.left)) bad.push(`${id} ${hh}: "${r.name}" ${r.best} vs Juice left ${r.left}`);
      }
    }
    await page.locator('.juice-household [data-household="single"]').click({ force: true }).catch(() => {});
    assert(!bad.length, `two figures for one place: ${bad.join('; ')}`);
  });
}

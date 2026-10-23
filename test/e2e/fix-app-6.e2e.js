// fix-app-6 (fix wave 6, 2026-10-23; docs/process/fix-app-6.md): the persona reviews' wave-2 findings BN-1 to BN-7, checked
// on the built site. Chromium against the static build (BETA_QA_DIST, else dist/ from `npm run build`), served under
// /melon-seek/ like GitHub Pages; other hosts are aborted. Each test finds its case in the build's own data (the page's
// own filter lists and getJobs), so it keeps testing the same rule on a new crawl, and skips when the case is gone.
// "[phone]" measures every line this lane added or changed at every entry of test/e2e/phone-sizes.mjs with
// fix-phone-text's scanner (scanText): one line, or two below 360 px, never cut.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { ALL_SIZES, contextFor } from './phone-sizes.mjs';
import { scanText, CAPTION_SEL } from './fix-phone-text.e2e.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const linesAt = (width) => (width < 360 ? 2 : 1); // fix-phone-text's rule
const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'fix-app-6');

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
  shared = { origin, dist, beta: `${origin}/melon-seek/beta`, main: `${origin}/melon-seek` };
  return shared;
}

/** A fresh page on the beta site; `device` is a phone-sizes.mjs entry, `viewport` a plain size, else a 1440 desktop. */
async function open(ctx, { device = null, viewport = null, locale = 'en-US' } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  const engine = ctx.browser.browserType?.().name() || 'chromium';
  const base = device ? { ...contextFor(device, engine) } : { viewport: viewport || DESKTOP, deviceScaleFactor: 1 };
  const context = await ctx.browser.newContext({ ...base, colorScheme: 'light', locale });
  ctx.cleanup.push(() => context.close().catch(() => {}));
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { st, page, errors };
}
const ready = (page) => page.waitForFunction(() => {
  const t = document.querySelector('#resultsTitle');
  return t && !/Loading/.test(t.textContent) && /\d/.test(t.textContent) && document.querySelector('#resultsList .card[data-id], #resultsList .list-empty, #resultsList .state-card');
}, null, { timeout: 120000 });
/** Load the board (a full page load). */
async function board(page, st, hash) {
  await page.goto('about:blank');
  await page.goto(`${st.beta}/#${hash}`);
  await ready(page);
  await sleep(600);
}
/** Change the filters on the loaded board (a hash change, as a link or the back button does: the list stays loaded). */
async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((h) => location.hash.slice(1) === h || location.hash.slice(1).length > 0, hash);
  await sleep(700);
  await ready(page);
}
const text = (page, sel) => page.locator(sel).first().evaluate((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => null);
const roleCount = async (page) => Number(((await page.locator('#resultsTitle strong').first().textContent().catch(() => '')) || '').replace(/\D/g, '') || 0);
const params = async (page) => new URLSearchParams(await page.evaluate(() => location.hash.slice(1)));
const noErrors = (errors) => assert(!errors.length, errors.join(' | '));
async function shot(page, name) {
  if (process.env.FIX_APP_6_SHOTS !== '1') return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
}

/** The left column's Location section. */
const locSection = (page) => page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: 'Location' }) });
/** Every option of the desktop Location filter, expanded: [{ key, label, count, checked }]. */
async function locationOptions(page) {
  const sec = locSection(page);
  await sec.evaluate((d) => { d.open = true; });
  for (let k = 0; k < 3; k++) {
    const more = sec.locator('.more-btn');
    if (!(await more.count()) || !(await more.first().isVisible()) || !/Show all/.test(await more.first().innerText())) break;
    await more.first().click(); await sleep(300);
  }
  // `count` is what a pick finds: the place's own postings and (BN-1) those listed only for its country or state.
  return sec.locator('.checklist').first().evaluate((list) => [...list.querySelectorAll('label.check')].map((n) => {
    const own = Number(n.querySelector('.check-count').textContent.replace(/\D/g, ''));
    const wide = Number(n.querySelector('.check-wide')?.textContent.replace(/\D/g, '') || 0);
    return { key: n.querySelector('input').value, label: n.querySelector('.check-label').textContent.trim(), checked: n.querySelector('input').checked, own, wide, count: own + wide };
  }));
}
const searchShown = (page) => locSection(page).locator('.fsearch-wrap').first().evaluate((e) => !e.hidden && e.getBoundingClientRect().height > 0);

/** Switch company through the company menu, as a person does. */
async function switchTo(page, name, slug) {
  await page.click('#companyMenuBtn'); await sleep(400);
  await page.locator('#popover .company-item').filter({ has: page.locator('.company-item-name', { hasText: new RegExp(`^${name}$`) }) }).first().click();
  await page.waitForFunction((s) => location.hash.includes(`c=${s}`) && document.querySelector('#resultsTitle strong'), slug, { timeout: 90000 });
  await ready(page);
  await sleep(900);
}

/** The app's own jobs for a board (getJobs), reduced in the page by `pick` (a function source). */
async function appJobs(page, st, company, pick) {
  const r = await page.evaluate(`(async () => {
    const api = await import(${JSON.stringify(`${st.beta}/api.js`)});
    const roles = await import(${JSON.stringify(`${st.beta}/features/roles.js`)});
    const res = await api.getJobs({ company: ${JSON.stringify(company)} });
    const pick = ${pick};
    return { mode: res.mode, jobs: res.jobs.map((j) => pick(j, roles)).filter(Boolean) };
  })()`);
  if (r.mode !== 'snapshot') skip(`${company} has no snapshot in this build (${r.mode})`);
  return r.jobs;
}

/* ---------------------------------------------------------------- the cases */

// BN-1: the reviewer's three boards, each with a place picked and a pay floor, and places to check by name.
const BN1 = [
  { slug: 'google', place: 'Warsaw', smin: 40000, named: ['Dublin', 'Krakow', 'London'] }, // "PLN 150,000" reads as $40K
  { slug: 'amazon', place: 'Toronto', smin: 50000, named: ['Vancouver', 'Seattle'] },
  { slug: 'apple', place: 'Cupertino', smin: 100000, named: ['Sunnyvale'] },
];

export function registerFixApp6Tests(suite) {
  for (const c of BN1) {
    suite.test(`fix-app-6: [BN-1] ${c.slug} + ${c.place} + $${c.smin / 1000}K: each place's count is the roles shown after picking it alone, and the Location search box stays`, async (ctx) => {
      const { st, page, errors } = await open(ctx);
      const base = `c=${c.slug}&smin=${c.smin}`;
      await board(page, st, `${base}&l=${encodeURIComponent(c.place)}`);
      const opts = await locationOptions(page);
      assert(await searchShown(page), `${c.slug}: the Location search box is hidden with ${opts.length} places listed`);
      const probes = [...c.named.map((k) => opts.find((o) => o.key === k) || { key: k, count: 0 }), ...opts.filter((o) => !o.checked && !c.named.includes(o.key)).slice(0, 4),
        opts.find((o) => o.key === c.place) || { key: c.place, count: 0 }];
      const bad = [];
      for (const o of probes) {
        await go(page, `${base}&l=${encodeURIComponent(o.key)}`);
        const alone = await roleCount(page);
        if (alone !== o.count) bad.push(`${o.key}: listed ${o.count}, alone ${alone}`);
      }
      await go(page, `${base}&l=${encodeURIComponent(c.place)}`);
      await shot(page, `bn1-${c.slug}-${c.place.toLowerCase()}`);
      assert(!bad.length, `${c.slug} + ${c.place} + $${c.smin / 1000}K: ${bad.join('; ')}`);
      noErrors(errors);
    });
  }

  suite.test('fix-app-6: [BN-1] Microsoft: a town lists its own postings, with those listed only for its country or state beside them ("Palmetto 3 +294"); a pick still finds both, and the map\'s pin says the same', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    await board(page, st, 'c=microsoft');
    const opts = await locationOptions(page);
    const wide = opts.filter((o) => o.wide > 0);
    if (!wide.length) skip('no Microsoft place gets postings listed only for its country or state in this build');
    const names = await appJobs(page, st, 'microsoft', `(j) => ({ cities: (j.locations || []).filter((l) => l && l.city && !l.remote).map((l) => l.city) })`);
    const own = (city) => names.filter((j) => j.cities.includes(city)).length;
    const pick = wide.find((o) => /^Palmetto\b/.test(o.label)) || wide.sort((a, b) => a.own - b.own)[0];
    const city = pick.label.split(',')[0];
    assertEq(pick.own, own(city), `${pick.label}: its own count is the postings that name it`);
    await go(page, `c=microsoft&l=${encodeURIComponent(pick.key)}`);
    assertEq(await roleCount(page), pick.own + pick.wide, `${pick.label} ${pick.own} +${pick.wide}: a pick finds both (I-6)`);
    await go(page, `c=microsoft&l=${encodeURIComponent(pick.key)}&m=map`);
    await page.waitForSelector('.ms-pin', { timeout: 60000 });
    await sleep(800);
    const counts = await page.locator('.ms-pin__count, .ms-pin.ms-pin--nosalary .ms-pin__price').allTextContents();
    assert(counts.some((t) => /\d\+\d/.test(t)), `the map's pins read ${counts.join(', ')}: a town's own postings are hidden in its country's`);
    await shot(page, 'bn1-microsoft-wide-map');
    noErrors(errors);
  });

  suite.test('fix-app-6: [BN-2] one foreign currency in view: the stats line, Insights\' tile, the map\'s pin and the chart caption give the median in that currency', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    const bad = [];
    for (const [hash, sym, where] of [['c=amazon&l=Vancouver&s=Intern', 'CA$', 'Amazon interns in Vancouver'], ['c=google&l=Warsaw', 'PLN ', 'Google Warsaw'], ['c=google&l=Dublin', '€', 'Google Dublin'],
      ['c=microsoft&l=Toronto&l=Vancouver&l=Montreal', 'CA$', 'Microsoft Canada']]) {
      await board(page, st, hash);
      if (!(await roleCount(page))) { bad.push(`${where}: no roles (case gone?)`); continue; }
      const med = await text(page, '#statsLine .stat--median strong');
      if (!med) continue; // too few with pay for a median
      if (!med.startsWith(sym)) bad.push(`${where}: the stats line reads "${med}", not ${sym.trim()}`);
      const cap = await text(page, '#chartHost .ms-hist__sub, #chartHost .ms-chart__capmed');
      if (cap && !cap.includes(med)) bad.push(`${where}: the chart caption reads "${cap}", the stats line "${med}"`);
      await go(page, `${hash}&m=insights`);
      await page.waitForSelector('.msi-stat__value', { timeout: 60000 });
      const tile = await text(page, '.msi-stat__value');
      if (tile !== '—' && tile !== med) bad.push(`${where}: Insights' tile reads "${tile}", the stats line "${med}"`);
      if (hash === 'c=amazon&l=Vancouver&s=Intern') await shot(page, 'bn2-amazon-vancouver-interns-insights');
    }
    // The map pin in Toronto (Amazon interns): "$72K · 5" before.
    await board(page, st, 'c=amazon&l=Toronto&s=Intern&m=map');
    await page.waitForSelector('.ms-pin', { timeout: 60000 });
    await sleep(800);
    const pins = await page.locator('.ms-pin__price').allTextContents();
    for (const p of pins) if (/^\$/.test(p.trim())) bad.push(`Amazon interns in Toronto: a map pin reads "${p}"`);
    await shot(page, 'bn2-amazon-toronto-interns-map');
    // Mixed currencies keep MR-39's rule: the main currency's median, and its basis.
    await board(page, st, 'c=amazon');
    const all = await text(page, '#statsLine .stat--median');
    if (!/^\$\d+K base pay median \(US\)$/.test(all || '')) bad.push(`Amazon, whole board: "${all}"`);
    assert(!bad.length, bad.join('; '));
    noErrors(errors);
  });

  for (const locale of ['de-DE', 'fr-FR', 'en-IN', 'de-CH', 'pl-PL']) {
    for (const viewport of [{ width: 375, height: 812 }, { width: 1114, height: 720 }]) {
      suite.test(`fix-app-6: [BN-3] ${locale} ${viewport.width}x${viewport.height}: every count shows once (the stats line, the results title, the Location counts, the chart and the map), on one line`, async (ctx) => {
        const { st, page, errors } = await open(ctx, { viewport, locale });
        const bad = [];
        const dup = /(?:^|[\s(])(\d[\d.,’'   ]*\d)[\s  ]+\1(?=$|[\s)])/;
        const check = async (sel, where) => {
          for (const t of await page.locator(sel).allInnerTexts().catch(() => [])) {
            const s = t.replace(/\s+/g, ' ').trim();
            if (s && dup.test(s)) bad.push(`${where}: "${s.slice(0, 120)}"`);
          }
        };
        for (const slug of ['google', 'amazon']) {
          await board(page, st, `c=${slug}`);
          // The board's count as this locale writes it ("3.821", "3 821" with a narrow no-break space, "3’821").
          const n = (await page.evaluate(() => document.querySelector('#resultsTitle strong')?.textContent || '')).replace(/\s+/g, ' ').replace(/ roles?$/, '').trim();
          const line = (await page.locator('#statsLine .ms-note__line').first().innerText()).replace(/\s+/g, ' ').trim();
          const times = n ? line.split(n).length - 1 : 0;
          if (await page.locator('#statsLine .stat--count').first().isVisible()) { if (times !== 1) bad.push(`${slug} stats line: "${line}" shows ${n} ${times} times`); }
          await check('#statsLine .ms-note__line', `${slug} stats line`);
          await check('#resultsTitle', `${slug} results title`);
          await check('#chartHost .ms-chart__foot .ms-note__line, #chartHost .ms-group__count, #chartHost .ms-hist__sub', `${slug} chart`);
          const r = await page.evaluate(scanText, { roots: ['#statsLine'], captionSel: `${CAPTION_SEL}, #statsLine`, allow: [], words: 14, maxLines: 1 });
          for (const m of r.lines) bad.push(`${slug} ${m.sel}: ${m.lines} lines: "${m.text}"`);
          for (const m of r.cut) bad.push(`${slug} ${m.sel}: cut by ${m.over} px: "${m.text}"`);
          if (viewport.width > 860) {
            await locSection(page).evaluate((d) => { d.open = true; }).catch(() => {});
            await check('#filterBody .check-count', `${slug} filter counts`);
          }
          if (slug === 'google') {
            await go(page, 'c=google&m=map');
            await page.waitForSelector('.ms-pin', { timeout: 60000 }).catch(() => {});
            await sleep(600);
            await check('.ms-pin', 'google map pins');
            await check('.ms-remote', 'google Remote button');
          }
        }
        if (locale === 'de-DE') await shot(page, `bn3-${locale}-${viewport.width}`);
        assert(!bad.length, bad.join('; '));
        noErrors(errors);
      });
    }
  }

  suite.test('fix-app-6: [BN-4] Apple part-time in the DC area: the median is per hour as posted, never a full-time year called "posted pay", and its Details don\'t call it base pay', async (ctx) => {
    const { st, page, errors } = await open(ctx);
    await board(page, st, 'c=apple&e=Part-time');
    const opts = await locationOptions(page);
    const keys = opts.filter((o) => /^(Arlington|Washington|Fairfax|Tysons|McLean)\b/.test(o.label)).map((o) => o.key);
    if (!keys.length) skip('no Apple part-time roles in the DC area in this build');
    const hash = `c=apple&e=Part-time&${keys.map((k) => `l=${encodeURIComponent(k)}`).join('&')}`;
    await go(page, hash);
    const med = await text(page, '#statsLine .stat--median');
    const pts = await appJobs(page, st, 'apple', `(j) => j.salary && j.employmentType === 'Part-time' ? { pt: j.salary.partTime === true && j.salary.originalInterval === 'hour', locs: j.locations.map((l) => l.city) } : null`);
    const here = pts.filter((j) => j.locs.some((c) => /^(Arlington|Washington|Fairfax|Tysons|McLean)$/.test(c)));
    const allHourly = here.length && here.every((j) => j.pt);
    if (allHourly) assert(/^\$\d+\.\d\d\/hour posted pay median$/.test(med || ''), `the stats line reads "${med}", not "$X.XX/hour posted pay median"`);
    else assert(/if full-time/.test(med || ''), `the stats line reads "${med}": a full-time year of part-time pay must say so`);
    const notes = await page.evaluate(() => [...document.querySelectorAll('#chartHost .ms-chart__foot .ms-note__list li, #statsLine .ms-note__list li')].map((l) => l.textContent));
    assert(!notes.some((t) => /^The median is base pay/.test(t)), `Details: "${notes.find((t) => /^The median is base pay/.test(t))}"`);
    const cap = await text(page, '#chartHost .ms-hist__sub, #chartHost .ms-chart__capmed');
    if (cap && allHourly) assert(/\/hour/.test(cap), `chart caption "${cap}"`);
    await shot(page, 'bn4-apple-parttime-dc');
    noErrors(errors);
  });

  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    suite.test(`fix-app-6: [BN-5] ${viewport.width}x${viewport.height}: Kraków set aside at NVIDIA comes back at Google after ticking Warsaw; Clear all drops it, with a toast`, async (ctx) => {
      const { st, page, errors } = await open(ctx, { viewport });
      await board(page, st, 'c=google&l=Krakow');
      if (!(await roleCount(page))) skip('no Google roles in Krakow in this build');
      await switchTo(page, 'NVIDIA', 'nvidia');
      const t1 = await page.locator('#toast').innerText();
      assert(/[Dd]ropped Krakow \(not at NVIDIA\) for now/.test(t1), `drop toast "${t1}"`);
      // Tick Warsaw at NVIDIA (the filter panel on a desktop; a link's change on a phone, as the sheet's tick commits).
      if (viewport.width > 860) {
        await locSection(page).evaluate((d) => { d.open = true; });
        const box = locSection(page).locator('input[value="Warsaw"]');
        if (!(await box.count())) skip('no NVIDIA roles in Warsaw in this build');
        await box.check(); await sleep(800);
      } else {
        await go(page, 'c=nvidia&l=Warsaw');
      }
      assertEq((await params(page)).getAll('l').join(), 'Warsaw', 'Warsaw ticked at NVIDIA');
      await switchTo(page, 'Google', 'google');
      const l = (await params(page)).getAll('l');
      assert(l.includes('Krakow') && l.includes('Warsaw'), `Google: l=${l.join(',')}`);
      const t2 = await page.locator('#toast').innerText();
      assert(/[Pp]ut back Krakow/.test(t2), `toast "${t2}"`);
      await shot(page, `bn5-krakow-back-${viewport.width}`);
      // Set aside again, then Clear all: dropped for good, and the toast says so.
      await switchTo(page, 'NVIDIA', 'nvidia');
      await page.evaluate(() => document.querySelector('#clearAll')?.click());
      await sleep(600);
      const t3 = await page.locator('#toast').innerText();
      assert(/Also dropped Krakow/.test(t3), `Clear all toast "${t3}"`);
      await switchTo(page, 'Google', 'google');
      assert(!(await params(page)).getAll('l').includes('Krakow'), 'Krakow came back after Clear all');
      noErrors(errors);
    });
  }

  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    suite.test(`fix-app-6: [BN-6] ${viewport.width}x${viewport.height}: Amazon in Milan with a €35,000 floor keeps the posted minimums, and the Salary note counts every role it hides`, async (ctx) => {
      const { st, page, errors } = await open(ctx, { viewport });
      await board(page, st, 'c=amazon&l=Milan');
      const before = await roleCount(page);
      if (!before) skip('no Amazon roles in Milan in this build');
      const mins = await appJobs(page, st, 'amazon', `(j) => j.salary && j.salary.kind === 'minimum' && j.locations.some((l) => l.city === 'Milan') ? { id: j.id, min: j.salary.min, cur: j.salary.currency } : null`);
      await go(page, 'c=amazon&l=Milan&smin=41000'); // €35,000 is about $41K at the build's rates
      const after = await roleCount(page);
      const ids = await page.evaluate(() => [...document.querySelectorAll('#resultsList .card[data-id]')].map((c) => c.dataset.id));
      const shownMins = mins.filter((m) => ids.includes(m.id)).length;
      const visible = Math.min(ids.length, mins.length);
      assert(mins.length === 0 || shownMins > 0 || visible === 0, `none of Amazon's ${mins.length} posted minimums in Milan is listed under the floor`);
      // The note counts every role the floor hides.
      const hidden = before - after;
      const note = await page.evaluate(() => {
        const n = [...document.querySelectorAll('.salary-nopay')].find((e) => !e.hidden);
        return n ? n.textContent.replace(/\s+/g, ' ') : '';
      });
      if (viewport.width > 860) assert(new RegExp(`^${hidden.toLocaleString('en-US')} roles? hidden by the pay filter`).test(note.trim()), `Salary note "${note}", ${hidden} hidden (${before} → ${after})`);
      // The empty state names the pay filter too.
      await go(page, 'c=amazon&l=Milan&smin=400000&q=engineer');
      const empty = await page.evaluate(() => [...document.querySelectorAll('.state-card')].find((e) => e.getClientRects().length)?.textContent.replace(/\s+/g, ' ') || '');
      if (empty) assert(/the pay filter/.test(empty), `empty state "${empty}"`);
      await shot(page, `bn6-amazon-milan-${viewport.width}`);
      noErrors(errors);
    });
  }

  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    suite.test(`fix-app-6: [BN-7] ${viewport.width}x${viewport.height}: a Microsoft "Director" posted at M5–M6 is under Director+ too, and its chip names the posted level`, async (ctx) => {
      const { st, page, errors } = await open(ctx, { viewport });
      await board(page, st, 'c=microsoft');
      const two = await appJobs(page, st, 'microsoft', `(j, roles) => { const p = roles.postedLevels(j); return p && p.levels.length > 1 && /director/i.test(j.title) ? { id: j.id, title: j.title, levels: p.levels, text: p.text, own: j.seniority } : null; }`);
      if (!two.length) skip('no Microsoft "Director" posted at two levels in this build');
      const c = two.find((x) => /Atlanta/.test(x.title)) || two[0];
      await go(page, `c=microsoft&q=${encodeURIComponent(c.title)}&s=${encodeURIComponent(c.levels[c.levels.length - 1])}`);
      const ids = await page.evaluate(() => [...document.querySelectorAll('#resultsList .card[data-id]')].map((x) => x.dataset.id));
      assert(ids.includes(c.id), `${c.id} "${c.title}" (${c.text}) is hidden by ${c.levels[c.levels.length - 1]}`);
      await page.evaluate((id) => { location.hash = `${location.hash}&job=${encodeURIComponent(id)}`; }, c.id);
      await page.waitForSelector('#drawer.is-open', { timeout: 30000 }); await sleep(700);
      const chip = await text(page, '#drawer .d-meta .sen');
      assertEq(chip, `${c.own} · ${c.text}`, 'the drawer\'s level chip');
      const r = await page.evaluate(scanText, { roots: ['#drawer .d-meta .sen'], captionSel: '#drawer .d-meta .sen', allow: [], words: 12, maxLines: 1 });
      assert(!r.lines.length && !r.cut.length, `chip: ${JSON.stringify(r)}`);
      await shot(page, `bn7-microsoft-m5m6-${viewport.width}`);
      noErrors(errors);
    });
  }

  // [phone] Every line this lane added or changed, at every phone size: the stats line and the chart caption over Canadian
  // pay (Amazon interns in Vancouver) and over part-time hourly pay (Apple), and Insights' tiles.
  for (const d of ALL_SIZES) {
    suite.test(`fix-app-6: [phone] ${d.name} ${d.width}x${d.height}: the stats line, the chart caption, Insights' tiles and the Location rows' counts are ${linesAt(d.width) === 1 ? 'one line' : 'at most two lines'}, never cut`, async (ctx) => {
      const { st, page, errors } = await open(ctx, { device: d });
      const bad = [];
      const measure = async (sel, where) => {
        if (!(await page.locator(sel).count())) return;
        const r = await page.evaluate(scanText, { roots: [sel], captionSel: `${CAPTION_SEL}, ${sel}`, allow: [], words: 14, maxLines: linesAt(d.width) });
        for (const m of r.lines) bad.push(`${where} ${m.sel}: ${m.lines} lines, ${m.words} words: "${m.text}"`);
        for (const m of r.cut) bad.push(`${where} ${m.sel}: cut by ${m.over} px: "${m.text}"`);
      };
      const caption = async (where) => {
        const capSel = (await page.locator('#chartHost .ms-chart__caprow:not([hidden])').count()) ? '#chartHost .ms-chart__caprow' : '#chartHost .ms-hist__cap, #chartHost .ms-axis__cap';
        await measure(capSel, `${where} chart caption`);
      };
      await board(page, st, 'c=amazon&l=Vancouver&s=Intern');
      await measure('#statsLine', 'Amazon Vancouver interns stats line');
      await caption('Amazon Vancouver interns');
      await board(page, st, 'c=apple&e=Part-time&l=Fairfax&l=McLean&l=Tysons&l=Arlington');
      await measure('#statsLine', 'Apple part-time stats line');
      await caption('Apple part-time');
      await board(page, st, 'c=google&l=Warsaw&m=insights');
      await page.waitForSelector('.msi-stats', { timeout: 60000 });
      await measure('.msi-stat__note', 'Insights tiles');
      // BN-1: a town's own count and its country- or state-wide postings ("3 +294") fit their row, never cut.
      await board(page, st, 'c=microsoft');
      if (await page.locator('#filtersToggle').isVisible().catch(() => false)) { await page.locator('#filtersToggle').click(); await sleep(700); }
      await page.evaluate(() => { for (const x of document.querySelectorAll('#filterBody details.fsec')) if (/Location/.test(x.querySelector('summary')?.textContent || '')) x.open = true; });
      await sleep(500);
      const nums = await page.evaluate(() => [...document.querySelectorAll('#filterBody .check-nums')].filter((e) => e.getClientRects().length).map((e) => {
        const r = e.getBoundingClientRect(), row = e.closest('.check').getBoundingClientRect();
        return { t: e.textContent, over: Math.max(0, r.right - row.right, e.scrollWidth - e.clientWidth), lines: Math.round(r.height / (parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3)) };
      }));
      for (const n of nums) if (n.over > 0.5 || n.lines > 1) bad.push(`Location row count "${n.t}": cut by ${n.over} px, ${n.lines} lines`);
      assert(!bad.length, bad.join('; '));
      noErrors(errors);
    });
  }
}

// fix-data-3 (beta round 3, 2026-10-17; docs/process/fix-data-3.md): the data and backend fixes, checked on the built
// site. Chromium against the static build (BETA_QA_DIST, else dist/ from `npm run build`), served under /melon-seek/
// like GitHub Pages; other hosts are aborted. Each test reads the build's own data (public/api.js getJobs, as the UI
// sees it) to find its case, so it keeps testing the same rule on a new crawl, and skips when the case is gone.
// Tests are tagged with the finding they encode; each failed on f53a270 (the round-3 base) with the 2026-10-16 crawl.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { PHONES } from './phone-sizes.mjs';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2' };

/** Serve the build under /melon-seek/; null without a beta build. */
async function serveDist() {
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
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, beta: `${origin}/melon-seek/beta`, close: () => new Promise((r) => server.close(r)) };
}

/** A fresh page; `hash` opens <beta>/#<hash> and waits for the results. `phone` is a phone-sizes.mjs entry. */
async function open(ctx, hash, { phone = null } = {}) {
  const st = await serveDist();
  if (!st) skip('no beta build (npm run build, or BETA_QA_DIST=<dir>)');
  ctx.cleanup.push(() => st.close());
  const context = await ctx.browser.newContext(phone
    ? { viewport: { width: phone.width, height: phone.height }, deviceScaleFactor: phone.dpr, isMobile: true, hasTouch: true, userAgent: phone.ua, colorScheme: 'light' }
    : { viewport: DESKTOP, colorScheme: 'light', deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  if (hash != null) await go(page, st, hash);
  return { st, page };
}
async function go(page, st, hash) {
  await page.goto(`${st.beta}/#${hash}`);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 120000 });
  await sleep(500);
}
const resultsCount = async (page) => Number(((await page.locator('#resultsTitle').innerText()).replace(/,/g, '').match(/(\d+)\s+role/) || [])[1]);
const hashParams = async (page) => page.evaluate(() => Object.fromEntries([...new URLSearchParams(location.hash.slice(1))].reduce((m, [k, v]) => m.set(k, [...(m.get(k) || []), v]), new Map())));

/** The app's own jobs for a company (getJobs, as the UI sees them, Juice attached), reduced by `pick` (a function source). */
async function appJobs(page, st, company, pick) {
  const r = await page.evaluate(`(async () => {
    const api = await import(${JSON.stringify(`${st.beta}/api.js`)});
    const res = await api.getJobs({ company: ${JSON.stringify(company)} });
    const pick = ${pick};
    return { mode: res.mode, jobs: res.jobs.map(pick).filter(Boolean) };
  })()`);
  if (r.mode !== 'snapshot') skip(`${company} has no snapshot in this build (${r.mode})`);
  return r.jobs;
}

/** A filter section's options in the left column, fully expanded: [{ label, count, wide }]. The Department section holds
 *  the Company list (hidden on a one-company board) before the departments, so its last list is read. `wide`: since
 *  fix-app-6's BN-1 a place shows its own count with the roles listed only for its state or country beside it
 *  ("1 +11"), and a pick lists both. */
async function options(page, title) {
  const sec = page.locator('#filterBody details.fsec').filter({ has: page.locator('summary', { hasText: title }) });
  await sec.first().evaluate((d) => { d.open = true; }); await sleep(200);
  const wrap = sec.locator('.checklist-wrap').last();
  for (let k = 0; k < 3; k++) {
    const more = wrap.locator('.more-btn');
    if (!(await more.count()) || !(await more.first().isVisible()) || !/Show all/.test(await more.first().innerText())) break;
    await more.first().click(); await sleep(300);
  }
  return wrap.locator('.checklist').first().evaluate((list) => [...list.querySelectorAll('label.check')].map((n) => ({
    label: n.querySelector('.check-label').textContent.trim(), count: Number(n.querySelector('.check-count').textContent.replace(/,/g, '')),
    wide: Number(n.querySelector('.check-wide')?.textContent.replace(/\D/g, '') || 0) })));
}

async function openDrawer(page, st, company, id) {
  await go(page, st, `c=${company}&job=${encodeURIComponent(id)}`);
  await page.waitForSelector('#drawer.is-open', { timeout: 20000 }); await sleep(800);
}

/** Lines a text element wraps to (distinct line boxes of its text), and whether it overflows its box. */
const lineCount = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const r = document.createRange(); r.selectNodeContents(el);
  const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
  return { lines: tops.size, cut: el.scrollWidth > el.clientWidth + 1, text: el.textContent };
});

export function registerFixData3Tests(suite) {
  suite.test('fix-data-3: [D-38] Google\'s "Fellow, Core AI Foundations" is Staff+, not quarantined, and its drawer shows the posted $550K', async (ctx) => {
    const { st, page } = await open(ctx, 'c=google');
    const fellows = await appJobs(page, st, 'google', '(j) => /^fellow\\b/i.test(j.title) && !/fellowship|fellows program|student|graduate|phd/i.test(j.title) ? { id: j.id, title: j.title, sen: j.seniority, flag: j.salaryFlag || null, sal: j.salary && [j.salary.min, j.salary.max] } : null');
    if (!fellows.length) skip('no Google "Fellow, …" title in this crawl');
    for (const f of fellows) {
      assert(f.sen !== 'Intern' && !f.flag, `"${f.title}" (${f.id}): level ${f.sen}${f.flag ? `, quarantined (${f.flag.codes})` : ''}`);
      assert(f.sal, `"${f.title}" (${f.id}) shows no posted pay`);
    }
    const f = fellows[0];
    await openDrawer(page, st, 'google', f.id);
    const pay = await page.locator('#drawer .d-sal-amt').innerText();
    assert(/\$550K|\$550,000/.test(pay) || f.sal[0] !== 550000, `the drawer's pay reads "${pay}"`);
    assert(!/Intern/.test(await page.locator('#drawer .d-meta').innerText()), 'the drawer says Intern');
    assert(!(await page.locator('#drawer').innerText()).includes('implausible for an intern'), 'the drawer still says the pay is implausible for an intern');
  });

  suite.test('fix-data-3: [MR-28] the drawer\'s Juice says, in one line on every phone, when gross pay is a posted minimum or includes top shift pay', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const cases = await appJobs(page, st, 'amazon', '(j) => j.juice && j.juice.best && j.salary && (j.salary.kind === "minimum" || j.salary.includesShiftDifferential) ? { id: j.id, kind: j.salary.kind === "minimum" ? "minimum" : "shift" } : null');
    const pick = ['minimum', 'shift'].map((k) => cases.find((c) => c.kind === k)).filter(Boolean);
    if (!pick.length) skip('no Amazon minimum or shift-pay posting with Juice');
    const want = { minimum: 'Gross pay is the posted minimum.', shift: 'Gross pay includes top shift pay.' };
    for (const c of pick) {
      await openDrawer(page, st, 'amazon', c.id);
      await page.evaluate(() => { const d = document.querySelector('#drawer details.juice-details'); if (d) d.open = true; }); await sleep(300);
      const note = page.locator('#drawer .juice-gross');
      assert(await note.count(), `${c.id} (${c.kind}): no gross-pay line in the Juice block`);
      assertEq((await note.innerText()).trim(), want[c.kind], `${c.id} Juice gross line`);
    }
    // A base-pay range has no such line.
    const plain = await appJobs(page, st, 'amazon', '(j) => j.juice && j.juice.best && j.salary && j.salary.kind === "salary" && !j.salary.includesShiftDifferential ? j.id : null');
    if (plain.length) {
      await openDrawer(page, st, 'amazon', plain[0]);
      await page.evaluate(() => { const d = document.querySelector('#drawer details.juice-details'); if (d) d.open = true; }); await sleep(300);
      assertEq(await page.locator('#drawer .juice-gross').count(), 0, `${plain[0]}: a base-pay range says its gross pay is a minimum or includes shift pay`);
    }
    // One line on the narrowest phones and a common one (fix-density rule).
    const bad = [];
    for (const phone of PHONES.filter((p) => [280, 320, 390].includes(p.width))) {
      const { st: s2, page: p2 } = await open(ctx, null, { phone });
      for (const c of pick) {
        await openDrawer(p2, s2, 'amazon', c.id);
        await p2.evaluate(() => { const d = document.querySelector('#drawer details.juice-details'); if (d) d.open = true; }); await sleep(300);
        if (!(await p2.locator('#drawer .juice-gross').count())) { bad.push(`${phone.name}: ${c.id} has no line`); continue; }
        const m = await lineCount(p2, '#drawer .juice-gross');
        if (m.lines !== 1 || m.cut) bad.push(`${phone.name} (${phone.width} px): "${m.text}" takes ${m.lines} lines${m.cut ? ', cut' : ''}`);
      }
    }
    assert(!bad.length, bad.join('; '));
  });

  suite.test('fix-data-3: [no-row] a place the posting lists but prices in no row of its own has no Juice there (lead decision 2026-10-16)', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const bad = [];
    let n = 0;
    for (const c of ['amazon', 'apple', 'microsoft']) {
      const hits = await appJobs(page, st, c, `(j) => {
        const s = j.salary;
        if (!s || !Array.isArray(s.ranges) || !s.ranges.some((r) => Array.isArray(r.locations) && r.locations.length) || !j.juice) return null;
        const tied = new Set(s.ranges.flatMap((r) => r.locations || []));
        const none = j.locations.filter((l) => !l.remote && l.city && !tied.has(l.rawName || l.name) && !(Array.isArray(s.places) && !s.places.includes(l.rawName || l.name)));
        if (!none.length) return null;
        const scored = j.juice.byLocation.filter((e) => none.some((l) => l.name === e.locationName)).map((e) => e.locationName);
        return { id: j.id, title: j.title, none: none.map((l) => l.name), scored };
      }`);
      n += hits.length;
      for (const h of hits) if (h.scored.length) bad.push(`${c} "${h.title}" (${h.id}): Juice at ${h.scored.join(', ')}, which has no pay row`);
    }
    if (!n) skip('no posting lists a place without a pay row of its own');
    assert(!bad.length, `${bad.length} postings get Juice at a place with no pay row: ${bad.slice(0, 4).join('; ')}`);
  });

  // qa-ci-6: the cases come from the board in front of the test. On the 2026-10-16 crawl Google had St. George, SC
  // (written both ways) and St. George, UT; on 2026-10-23 only St. George, SC ("Saint George, SC", 1 posting), which
  // D-16 labels "St. George" with no state, since no other place on the board shares the name.
  suite.test('fix-data-3: [D-41] one place per town however "Saint" is spelled (Google\'s St. George, Amazon\'s St. Louis), with a state when two towns share the name', async (ctx) => {
    const { st, page } = await open(ctx, 'c=google');
    const opts = await options(page, 'Location');
    const fold = (s) => s.toLowerCase().replace(/\./g, '').replace(/^saint\s/, 'st ').replace(/,.*$/, '');
    const saints = opts.filter((o) => /^(st\.?|saint)\s/i.test(o.label));
    const byTown = new Map();
    for (const o of saints) { const k = fold(o.label); byTown.set(k, [...(byTown.get(k) || []), o]); }
    const spelled = [...byTown.values()].filter((v) => new Set(v.map((o) => o.label.replace(/,.*$/, ''))).size > 1);
    assert(!spelled.length, `one town under two spellings: ${spelled.map((v) => v.map((o) => `"${o.label}" (${o.count})`).join(' / ')).join('; ')}`);
    const george = saints.filter((o) => fold(o.label) === 'st george');
    if (george.length) {
      // The towns the board's postings name (each "Saint"/"St"/"St." George, by state): a state tells two apart (D-16).
      const towns = new Set((await appJobs(page, st, 'google', '(j) => j.locations.filter((l) => !l.remote && /^(saint|st\\.?)\\s+george\\b/i.test(l.rawName || "")).map((l) => `${l.region}|${l.country}`).join(";") || null')).join(';').split(';'));
      if (towns.size > 1) assert(george.every((o) => /, [A-Z]{2}$/.test(o.label)), `St. George labels without a state, with ${towns.size} towns of that name on the board: ${george.map((o) => o.label).join(', ')}`);
      else assert(george.length === 1, `one St. George on the board, ${george.length} labels: ${george.map((o) => o.label).join(', ')}`);
      // St. George, SC's postings, however written: under one label, "St. George, SC" or, as the only St. George, "St. George".
      const both = await appJobs(page, st, 'google', '(j) => j.locations.some((l) => /^(saint|st\\.?)\\s+george, sc\\b/i.test(l.rawName || "")) ? j.id : null');
      const sc = both.length ? george.find((o) => /, SC$/.test(o.label)) || (towns.size === 1 ? george[0] : null) : null;
      if (both.length) assert(sc, `no Location label for St. George, SC's ${both.length} postings: ${george.map((o) => o.label).join(', ')}`);
      if (sc) {
        // Both spellings' postings are under the one label (its count also holds the postings that name only the state
        // or the country, as every city's does).
        const keyed = await page.evaluate(async ({ base }) => {
          const res = await (await import(`${base}/api.js`)).getJobs({ company: 'google' });
          return res.jobs.filter((j) => j.locations.some((l) => /^(saint|st\.?)\s+george, sc\b/i.test(l.rawName || ''))).map((j) => j.locations.filter((l) => /george/i.test(l.rawName || '')).map((l) => `${l.city}|${l.region}`).join(','));
        }, { base: st.beta });
        assertEq(new Set(keyed).size, 1, `the ${both.length} postings written "Saint George, SC" and "St George, SC" are one place (${[...new Set(keyed)].join(' / ')})`);
        await go(page, st, `c=google&l=${encodeURIComponent(sc.label)}`);
        assertEq(await resultsCount(page), sc.count + sc.wide, `"${sc.label}" lists its count (${sc.count} +${sc.wide})`);
      }
    }
    await go(page, st, 'c=amazon');
    const az = (await options(page, 'Location')).filter((o) => /^st\.? louis\b/i.test(o.label));
    if (az.length > 1) assert(az.every((o) => /, [A-Z]{2}$/.test(o.label)) && new Set(az.map((o) => o.label.replace(/,.*$/, ''))).size === 1, `Amazon: ${az.map((o) => `"${o.label}"`).join(', ')}`);
  });

  suite.test('fix-data-3: [D-42] NVIDIA\'s state-only places read "New York State" and "Washington State", never like the city beside them', async (ctx) => {
    const { st, page } = await open(ctx, 'c=nvidia');
    await appJobs(page, st, 'nvidia', '(j) => j.id');
    const labels = (await options(page, 'Location')).map((o) => o.label);
    assert(!labels.includes('New York, US') && !labels.includes('Washington, US'), `labels: ${labels.filter((l) => /^(New York|Washington)/.test(l)).join(', ')}`);
    const states = await appJobs(page, st, 'nvidia', '(j) => j.locations.filter((l) => !l.city && !l.remote && l.country === "US" && (l.region === "NY" || l.region === "WA")).map((l) => l.name).join("|") || null');
    if (states.length) assert(states.join('|').split('|').every((n) => /^(New York|Washington) State$/.test(n)), `state-only names: ${[...new Set(states.join('|').split('|'))].join(', ')}`);
  });

  suite.test('fix-data-3: [V-45] Amazon\'s Cajamar is its own place (named and pinned as Cajamar), and "Luxembourg, LUX" is Luxembourg City', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const caj = await appJobs(page, st, 'amazon', '(j) => j.locations.filter((l) => /^Cajamar\\b/i.test(l.rawName || "")).map((l) => [l.name, l.city, l.lat, l.lng])[0] || null');
    if (!caj.length) skip('no Cajamar posting');
    for (const [name, city, lat, lng] of caj) assert(name === 'Cajamar, Brazil' && city === 'Cajamar' && Math.abs(lat + 23.36) < 0.05 && Math.abs(lng + 46.88) < 0.05, `Cajamar reads "${name}" at ${lat}, ${lng}`);
    const opts = await options(page, 'Location');
    const c = opts.find((o) => o.label === 'Cajamar');
    assert(c && c.count >= caj.length, `the Location filter lists Cajamar: ${c ? c.count : 'no'} (want ${caj.length})`);
    const lux = await appJobs(page, st, 'amazon', '(j) => j.locations.filter((l) => l.rawName === "Luxembourg, LUX").map((l) => [l.city, l.lat, l.lng])[0] || null');
    for (const [city, lat] of lux) assert(city === 'Luxembourg' && Math.abs(lat - 49.61) < 0.05, `Luxembourg, LUX: city ${city} at ${lat}`);
  });

  suite.test('fix-data-3: [Town and Country] Amazon lists "Town and Country, MO" as one place, not "Town" and "Country"', async (ctx) => {
    const { st, page } = await open(ctx, 'c=amazon');
    const tc = await appJobs(page, st, 'amazon', '(j) => j.locations.some((l) => /^town and country\\b/i.test(l.rawName || "") || l.rawName === "Town" || /^Country, /.test(l.rawName || "")) ? j.locations.map((l) => l.name).join(" | ") : null');
    if (!tc.length) skip('no Town and Country posting');
    for (const t of tc) assert(t.split(' | ').includes('Town and Country, MO') && !/(^| \| )(Town|Country, MO)( \| |$)/.test(t), `places: ${t}`);
    const labels = (await options(page, 'Location')).map((o) => o.label);
    assert(labels.includes('Town and Country') && !labels.includes('Town') && !labels.includes('Country'), `labels: ${labels.filter((l) => /Town|^Country/.test(l)).join(', ')}`);
  });

  suite.test('fix-data-3: [old links] an old "City, ST" link finds the place the board now labels "City", and the link takes the current label', async (ctx) => {
    const { st, page } = await open(ctx, 'c=google');
    // A city the board labels without its state (one place of that name), with the state its postings name.
    const cand = await page.evaluate(async (base) => {
      const res = await (await import(`${base}/api.js`)).getJobs({ company: 'google' });
      const by = new Map();
      for (const j of res.jobs) for (const l of j.locations) if (l.city && !l.remote && l.country === 'US' && l.region) {
        const k = l.city; if (!by.has(k)) by.set(k, { regions: new Set(), ids: new Set() });
        by.get(k).regions.add(l.region); by.get(k).ids.add(j.id);
      }
      const one = [...by].filter(([, v]) => v.regions.size === 1).sort((a, b) => b[1].ids.size - a[1].ids.size).find(([k]) => k === 'Columbus') || [...by].find(([, v]) => v.regions.size === 1);
      return one ? { city: one[0], region: [...one[1].regions][0], n: one[1].ids.size } : null;
    }, st.beta);
    if (!cand) skip('no single-state US city on Google');
    await go(page, st, `c=google&l=${encodeURIComponent(`${cand.city}, ${cand.region}`)}`);
    const n = await resultsCount(page);
    assert(n > 0, `#l=${cand.city}, ${cand.region} finds nothing on Google, which labels the place "${cand.city}" (${cand.n} postings)`);
    const h = await hashParams(page);
    assertEq((h.l || []).join('|'), cand.city, 'the link now holds the current label');
    // NVIDIA's state, linked under its old label.
    await go(page, st, `c=nvidia&l=${encodeURIComponent('New York, US')}`);
    const hn = await hashParams(page);
    const ny = await appJobs(page, st, 'nvidia', '(j) => j.locations.some((l) => l.name === "New York State") ? j.id : null');
    if (ny.length) assertEq((hn.l || []).join('|'), 'New York State', 'NVIDIA "New York, US" link');
  });

  suite.test('fix-data-3: [UX-32] NVIDIA and Amazon department names read naturally, tell Amazon\'s Technical and Non-Technical apart, and old department links still work', async (ctx) => {
    const { st, page } = await open(ctx, 'c=nvidia');
    await appJobs(page, st, 'nvidia', '(j) => j.id');
    const nv = (await options(page, 'Department')).map((o) => o.label);
    const inverted = nv.filter((l) => /^(Engineer|Architect|Management|Program Manager|Account Manager|Analyst|Specialist|Planner|Designer|Accountant|Attorney|Representative|Administrator), /.test(l) || l === 'Intern');
    assert(!inverted.length, `NVIDIA departments still inverted: ${inverted.slice(0, 6).join(' | ')}`);
    // An old link with NVIDIA's own name still finds the department, under its current name.
    const asic = (await options(page, 'Department')).find((o) => o.label === 'ASIC Engineering');
    if (asic) {
      await go(page, st, `c=nvidia&d=${encodeURIComponent('Engineer, ASIC')}`);
      assertEq(await resultsCount(page), asic.count, 'old d=Engineer, ASIC link');
      assertEq(((await hashParams(page)).d || []).join('|'), 'ASIC Engineering', 'the link takes the current name');
    }
    await go(page, st, 'c=amazon');
    const az = await options(page, 'Department');
    const raw = az.filter((o) => /--/.test(o.label));
    assert(!raw.length, `Amazon departments with "--": ${raw.map((o) => o.label).join(' | ')}`);
    const tech = az.find((o) => /^Technical .*Product Management$/.test(o.label)), non = az.find((o) => /^Non-Technical .*Product Management$/.test(o.label));
    if (tech && non) {
      assert(tech.label.slice(0, 14) !== non.label.slice(0, 14), `"${tech.label}" and "${non.label}" read the same when cut`);
      // An old link with Amazon's own name finds the same postings and takes the current name.
      await go(page, st, `c=amazon&d=${encodeURIComponent('Project/Program/Product Management--Technical')}`);
      assertEq(await resultsCount(page), tech.count, 'old d= link');
      assertEq(((await hashParams(page)).d || []).join('|'), tech.label, 'the link takes the current name');
    }
  });
}

// fix-viz lane e2e checks (docs/process/fix-viz.md): the persona review of the main site,
// 2026-10-10 (docs/process/lead.md), findings P-3, P-6, P-13, P-14, P-16, I-3 and I-10 in the
// chart, the map and the "as of" lines. Runs against the real server that scripts/e2e.js starts;
// map tiles are blocked, so the map is in its offline look (place names under the pins).
// Data-dependent checks skip when the board they need is demo data or has no such roles.
import { assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isExternal = (url, base) => !!url && !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:');

async function open(ctx, { hash = 'c=anthropic', phone = false, household = null } = {}) {
  const context = await ctx.browser.newContext(phone
    ? { viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: DESKTOP, deviceScaleFactor: 1 });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => isExternal(u.href, ctx.baseUrl), (r) => r.abort('blockedbyclient'));
  if (household) await context.addInitScript((hh) => { try { localStorage.setItem('melon-seek.household.v1', JSON.stringify(hh)); } catch { /* private mode */ } }, household);
  const page = await context.newPage();
  await page.goto(`${ctx.baseUrl}/${hash ? `#${hash}` : ''}`);
  await page.locator('#resultsTitle strong').first().waitFor({ timeout: 30000 });
  await sleep(600);
  return page;
}
async function mapReady(page) {
  await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 20000 });
  await sleep(1200);
}
const pinLabels = (page) => page.$$eval('#mapHost .ms-pin-icon', (ps) => ps.map((p) => p.getAttribute('aria-label') || ''));

/** The board through the app's own api.js (so the same jobs the map got). */
async function boardJobs(page, company) {
  return page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const res = await api.getJobs({ company });
    return { mode: res.mode, jobs: res.jobs.map((j) => ({ id: j.id, title: j.title, cur: j.salary ? String(j.salary.currency || 'USD').toUpperCase() : null, locs: (j.locations || []).map((l) => ({ name: l.name, country: l.country, remote: !!l.remote })) })) };
  }, { base: new URL(page.url()).origin, company });
}

export function registerFixVizTests(suite) {
  /* ------------------------------------------------------------------ P-6 map */

  suite.test('Fix viz: [P-6] a map cluster is only "+ N nearby" when its places are near (no New York under San Francisco)', async (ctx) => {
    const page = await open(ctx, { hash: 'c=anthropic&m=map&q=account%20executive', phone: true });
    await mapReady(page);
    const labels = await pinLabels(page);
    const icons = page.locator('#mapHost .ms-pin-icon');
    let best = -1, bn = 0;
    labels.forEach((t, i) => { const m = /: ([\d,]+) posting/.exec(t); const n = m ? Number(m[1].replace(/,/g, '')) : 0; if (n > bn) { bn = n; best = i; } });
    if (best < 0) skip('no pins');
    await icons.nth(best).locator('.ms-pin').tap();
    await sleep(1500);
    const chip = await page.locator('#areaChipTop .area-chip, #areaChipList .area-chip').first().innerText();
    const places = await page.locator('#resultsList .card').evaluateAll((cs) => cs.map((c) => c.innerText));
    // A cluster that reaches across the continent never reads "<one city> + N nearby".
    const far = places.filter((t) => /New York|Washington|Seattle|Boston|Chicago/.test(t)).length;
    if (/San Francisco[^,]*, CA \+ \d+ nearby/.test(chip)) assertEq(far, 0, `"${chip}" lists ${far} roles in New York, Washington or another far city`);
    assert(!labels.some((t) => /nearby/.test(t) && /New York/.test(t) && /San Francisco/.test(t)), `pins ${JSON.stringify(labels)}`);
  });

  suite.test('Fix viz: [P-6] phone map: pin labels never overlap another label or pin, and stay inside the map', async (ctx) => {
    for (const hash of ['c=shieldai&m=map&mc=juice&smin=95000', 'c=anthropic&m=map&mc=juice', 'c=anduril&m=map']) {
      const page = await open(ctx, { hash, phone: true });
      await mapReady(page);
      const bad = await page.evaluate(() => {
        const host = document.querySelector('#mapHost').getBoundingClientRect();
        const vis = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length; };
        const pins = [...document.querySelectorAll('#mapHost .ms-pin')].map((p) => ({ p, r: p.getBoundingClientRect() }));
        const labs = pins.map(({ p }) => p.querySelector('.ms-pin__label')).filter((l) => l && vis(l)).map((l) => ({ l, r: l.getBoundingClientRect(), own: l.closest('.ms-pin') }));
        const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        const out = [];
        labs.forEach((a, i) => {
          if (a.r.left < host.left - 1 || a.r.right > host.right + 1) out.push(`"${a.l.textContent}" leaves the map (${Math.round(a.r.left)}–${Math.round(a.r.right)})`);
          labs.forEach((b, j) => { if (j > i && hit(a.r, b.r)) out.push(`"${a.l.textContent}" overlaps "${b.l.textContent}"`); });
          for (const { p, r } of pins) if (p !== a.own && hit(a.r, r)) out.push(`"${a.l.textContent}" runs through pin "${p.textContent}"`);
        });
        return { out, shown: labs.length, pins: pins.length };
      });
      assert(!bad.out.length, `${hash}: ${bad.out.join('; ')}`);
      assert(bad.shown >= 1, `${hash}: no place names at all (${bad.pins} pins)`);
    }
  });

  suite.test('Fix viz: [P-6] map pins take pay only where it applies (US pay is not pinned on Sydney, London or Ontario)', async (ctx) => {
    const cases = [
      { company: 'anduril', hash: 'c=anduril&m=map', place: /Sydney/, country: 'AU', cur: 'AUD' },
      { company: 'anthropic', hash: 'c=anthropic&m=map&q=fellows', place: /London/, country: 'GB', cur: 'GBP' },
      { company: 'anthropic', hash: 'c=anthropic&m=map&q=fellows', place: /Ontario/, country: 'CA', cur: 'CAD' },
    ];
    let checked = 0;
    for (const c of cases) {
      const page = await open(ctx, { hash: c.hash });
      await mapReady(page);
      const { mode, jobs } = await boardJobs(page, c.company);
      if (mode === 'demo') continue;
      const local = jobs.filter((j) => j.locs.some((l) => l.country === c.country && !l.remote));
      const localPay = local.filter((j) => j.cur === c.cur).length;
      const foreignPay = local.filter((j) => j.cur && j.cur !== c.cur).length;
      if (!foreignPay) continue; // nothing to get wrong
      const pin = (await pinLabels(page)).find((t) => c.place.test(t.split(':')[0]));
      if (!pin) continue;
      checked++;
      if (!localPay) assert(!/median \$/.test(pin), `${c.company} pin "${pin}": ${foreignPay} roles there list pay in another currency only, so the pin has no median`);
    }
    if (!checked) skip('no board here lists foreign-currency pay on a non-US pin');
  });

  suite.test('Fix viz: [P-6] phone: the Juice legend covers less than a sixth of the map', async (ctx) => {
    const page = await open(ctx, { hash: 'c=anthropic&m=map&mc=juice', phone: true });
    await mapReady(page);
    const g = await page.evaluate(() => {
      const box = document.querySelector('#mapHost .ms-modes').getBoundingClientRect();
      const map = document.querySelector('#mapHost').getBoundingClientRect();
      return { share: (box.width * box.height) / (map.width * map.height), h: box.height, mapH: map.height };
    });
    assert(g.share < 1 / 6, `legend covers ${(100 * g.share).toFixed(0)}% of the map (${Math.round(g.h)} of ${Math.round(g.mapH)} px tall)`);
    assert(await page.locator('#mapHost .leaflet-control-zoom').isVisible(), 'zoom buttons visible');
  });

  /* ------------------------------------------------------------------ P-3 chart */

  suite.test('Fix viz: [P-3] Group by Seniority says "Level not stated" (never "Mid"), last, in Clusters and Ranges', async (ctx) => {
    let page = await open(ctx, { hash: 'c=anthropic&g=seniority' });
    const rows = await page.locator('#chartHost .ms-crow__name').allInnerTexts();
    if (!rows.length) skip('no chart rows');
    assert(!rows.includes('Mid'), `clusters rows ${JSON.stringify(rows)}`);
    assertEq(rows[rows.length - 1], 'Level not stated', `clusters rows ${JSON.stringify(rows)}`);
    page = await open(ctx, { hash: 'c=anthropic&v=ranges&g=seniority' });
    await page.locator('#chartHost .ms-group__title').first().waitFor({ timeout: 8000 });
    // Ranges rows are windowed: read the group order from the chart's options instead of the painted heads.
    const groups = await page.$$eval('#chartHost .ms-row[aria-label]', (rs) => [...new Set(rs.map((r) => r.getAttribute('aria-label').split(':')[0]))]);
    assert(!groups.includes('Mid'), `ranges groups ${JSON.stringify(groups)}`);
    const tips = await page.locator('#chartHost .ms-group__title').allInnerTexts();
    assert(!tips.includes('Mid'), `ranges heads ${JSON.stringify(tips)}`);
  });

  /* ------------------------------------------------------------------ P-16 chart text */

  suite.test('Fix viz: [P-16] no matches: the chart adds no second empty message under the app\'s', async (ctx) => {
    const page = await open(ctx, { hash: 'c=anthropic&q=zzqqxxnomatch' });
    await sleep(400);
    const shown = await page.$$eval('#chartHost .ms-chart__empty', (es) => es.filter((e) => !e.hidden && e.offsetParent !== null).map((e) => e.innerText));
    assertEq(shown.length, 0, `chart empty message still shown: ${JSON.stringify(shown)}`);
    assert(!/salary range/.test(shown.join(' ')), 'the chart never blames the salary range');
  });

  suite.test('Fix viz: [P-16] Ranges: a row\'s pay never runs into its title', async (ctx) => {
    const page = await open(ctx, { hash: 'c=anthropic&v=ranges&g=seniority&smin=350000' });
    await page.locator('#chartHost .ms-row').first().waitFor({ timeout: 8000 });
    const bad = await page.$$eval('#chartHost .ms-row', (rs) => rs.map((r) => {
      r.classList.add('is-hover'); // the pay shows on hover and on the highlighted row
      const lab = r.querySelector('.ms-row__label');
      const val = r.querySelector('.ms-row__val');
      const a = lab.getBoundingClientRect(), b = val.getBoundingClientRect();
      r.classList.remove('is-hover');
      const host = r.getBoundingClientRect();
      const overlap = b.left < a.right - 1 && b.right > a.left + 1 && b.top < a.bottom && b.bottom > a.top;
      const out = b.right > host.right + 1 || b.left < host.left - 1;
      return overlap || out ? `${lab.textContent} | ${val.textContent} (${Math.round(b.left)}–${Math.round(b.right)} vs title to ${Math.round(a.right)})` : null;
    }).filter(Boolean));
    assert(!bad.length, `pay overlaps the title: ${bad.slice(0, 4).join('; ')}`);
  });

  /* ------------------------------------------------------------------ I-3 plain words, 12px */

  suite.test('Fix viz: [I-3] chart and map use plain words and at least 12px text on desktop', async (ctx) => {
    let page = await open(ctx, { hash: 'c=anthropic' });
    const cap = await page.locator('#chartHost .ms-axis__cap').innerText();
    assert(!/approx USD|Annual salary|USD \/ yr/.test(cap), `axis caption "${cap}"`);
    const foot = await page.locator('#chartHost .ms-chart__foot').innerText();
    assert(!/non-USD|approx USD/.test(foot), `notes line "${foot}"`);
    const small = await page.evaluate(() => [...document.querySelectorAll('#chartHost .ms-axis__tick, #chartHost .ms-axis__cap, #chartHost .ms-bin__dot, #chartHost .ms-chart__foot, #chartHost .ms-crow__sub, #chartHost .ms-hist__cap')]
      .filter((e) => e.textContent.trim()).map((e) => [e.className, parseFloat(getComputedStyle(e).fontSize)]).filter(([, s]) => s < 12));
    assert(!small.length, `chart text under 12px: ${JSON.stringify(small.slice(0, 5))}`);
    page = await open(ctx, { hash: 'c=anthropic&m=map' });
    await mapReady(page);
    const smallMap = await page.evaluate(() => [...document.querySelectorAll('#mapHost .ms-pin__count, #mapHost .ms-pin__label, #mapHost .ms-map__offline-note, #mapHost .leaflet-control-attribution, #mapHost .ms-remote')]
      .filter((e) => e.textContent.trim() && getComputedStyle(e).display !== 'none').map((e) => [e.className, parseFloat(getComputedStyle(e).fontSize)]).filter(([, s]) => s < 12));
    assert(!smallMap.length, `map text under 12px: ${JSON.stringify(smallMap.slice(0, 5))}`);
  });

  /* ------------------------------------------------------------------ I-10 Juice grades */

  suite.test('Fix viz: [I-10] Juice pins and legend tell the grades apart without colour (fill pattern), no new colours', async (ctx) => {
    const page = await open(ctx, { hash: 'c=anthropic&m=map&mc=juice' });
    await mapReady(page);
    const keys = await page.$$eval('#mapHost .ms-modes__key', (ks) => ks.map((k) => {
      const sw = k.querySelector('.ms-modes__sw'); const s = getComputedStyle(sw);
      const surface = getComputedStyle(document.querySelector('#mapHost .ms-modes')).backgroundColor;
      // How full the swatch is: the ring's own colour (full), the surface (none), or a tint between.
      const fill = s.backgroundColor === s.borderTopColor ? 'full' : s.backgroundColor === surface ? 'none' : 'tint';
      return { text: k.textContent, grade: sw.dataset.grade || null, look: `${s.borderTopStyle}|${fill}`, ring: s.borderTopColor };
    }));
    assertEq(keys.length, 3, 'three grades in the legend');
    assertEq(new Set(keys.map((k) => k.look)).size, 3, `legend swatches differ only by colour: ${JSON.stringify(keys)}`);
    assertEq(new Set(keys.map((k) => k.ring)).size, 1, `one hue for every grade (no new colours): ${JSON.stringify(keys)}`);
    for (const k of keys) assert(/\$/.test(k.text), `legend key "${k.text}" names its dollar threshold`);
    const pins = await page.$$eval('#mapHost .ms-pin--juice', (ps) => ps.map((p) => ({ cls: p.className, grade: p.dataset.grade || null })));
    const graded = pins.filter((p) => p.grade);
    assert(graded.length && graded.length === pins.filter((p) => !/nosalary/.test(p.cls)).length, `juice pins carry their grade: ${JSON.stringify(pins.slice(0, 4))}`);
  });

  /* ------------------------------------------------------------------ P-14 "update due" */

  suite.test('Fix viz: [P-14] the app shows "as of" dates, never "update due" (drawer Juice, comparisons, map legend)', async (ctx) => {
    let page = await open(ctx, { hash: 'c=anthropic&q=research%20engineer', household: 'couple' });
    await page.locator('#resultsList .card').first().click();
    await page.locator('#drawer').waitFor({ state: 'visible', timeout: 5000 });
    await sleep(1500);
    const lines = await page.locator('#drawer .juice-asof, #drawer .comps-asof, #drawer .d-comp-asof').allInnerTexts();
    if (!lines.length) skip('no dated lines in this drawer');
    for (const t of lines) {
      assert(!/update due|due for update/i.test(t), `drawer line "${t}"`);
      assert(!/\bFX\b/.test(t), `drawer line "${t}" says FX`);
    }
    const juice = lines.find((t) => /^Data as of/.test(t));
    if (juice) assert(/rent/.test(juice), `juice line "${juice}"`);
    page = await open(ctx, { hash: 'c=anthropic&m=map&mc=juice', household: 'couple' });
    await mapReady(page);
    const legend = await page.locator('#mapHost .ms-modes__legend').innerText();
    assert(!/update due|due for update|\bFX\b/i.test(legend), `map legend "${legend}"`);
  });

  /* ------------------------------------------------------------------ P-13 rent dates */

  suite.test('Fix viz: [P-13] methodology states the 1-bedroom and the 2- and 3-bedroom rent dates', async (ctx) => {
    const page = await ctx.browser.newPage({ viewport: DESKTOP });
    ctx.cleanup.push(() => page.close());
    await page.goto(`${ctx.baseUrl}/methodology/`);
    const facts = await page.locator('.g-facts').innerText();
    assert(/1-bedroom rents/.test(facts) && /2- and 3-bedroom rents/.test(facts), `hero facts "${facts.replace(/\n/g, ' · ')}"`);
    assert(!/^Rents as of/m.test(facts), `hero still says one date for all rents: "${facts}"`);
    const txt = await page.locator('main').innerText();
    assert(/bedroom data/i.test(txt) || /ratio/i.test(txt), 'the page explains how 2- and 3-bedroom rents are worked out');
  });
}

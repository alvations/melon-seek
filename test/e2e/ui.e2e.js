// Browser e2e checks (Playwright Chromium) against the real server (snapshot data locally,
// demo in a sandbox without snapshots). Selectors come from public/index.html, public/app.js,
// public/viz/*.js and public/features/*.js (read-only); roles/text are preferred, ids are used
// for app-owned containers. Every wait that could reject is registered right before its action
// and wrapped in guarded(), so a failure fails one test, never the whole run.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, assertEq, guarded, skip } from './harness.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const READY_TIMEOUT = 30000;
const PAGE_SIZE = 60; // app.js PAGE

const lib = (rel) => import(pathToFileURL(path.join(ROOT, 'public', rel)).href);

/** Hosts we expect to be unreachable in the sandbox (fonts, map tiles, boards). */
function isExternal(url, baseUrl) {
  return !!url && !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:');
}

async function openApp(ctx, { hash = '', viewport = DESKTOP, colorScheme = 'light', ready = true } = {}) {
  const context = await ctx.browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1, acceptDownloads: true });
  ctx.cleanup.push(() => context.close());
  // Block external hosts up front so the run is deterministic and fast.
  await context.route((url) => isExternal(url.href, ctx.baseUrl), (route) => route.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location() && msg.location().url;
    // Resource-load failures for blocked external hosts are expected here.
    if (/Failed to load resource/.test(msg.text()) && isExternal(loc, ctx.baseUrl)) return;
    errors.push(`console.error: ${msg.text()}${loc ? ` @ ${loc}` : ''}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    const f = req.failure() && req.failure().errorText;
    // Navigations/aborted fetches cancelled by the app itself (company switch) are not errors.
    if (!isExternal(req.url(), ctx.baseUrl) && !/ERR_ABORTED/.test(f || '')) errors.push(`requestfailed: ${req.url()} ${f}`);
  });
  page.on('response', (res) => {
    if (!isExternal(res.url(), ctx.baseUrl) && res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  await page.goto(`${ctx.baseUrl}/${hash ? `#${hash}` : ''}`);
  if (ready) await waitReady(page, 'initial load');
  return { context, page, errors, close: () => context.close() };
}

/** Wait until the results header shows a count ("N roles"). */
async function waitReady(page, where = '') {
  try {
    await page.locator('#resultsTitle strong').first().waitFor({ timeout: READY_TIMEOUT });
  } catch {
    const st = await page.evaluate(() => ({
      title: document.querySelector('#resultsTitle')?.textContent,
      hash: location.hash,
      cards: document.querySelectorAll('#resultsList .card[data-id]').length,
    })).catch(() => ({}));
    throw new Error(`app not ready${where ? ` (${where})` : ''} after ${READY_TIMEOUT}ms: ${JSON.stringify(st)}`);
  }
}

async function resultCount(page) {
  const t = (await page.locator('#resultsTitle').innerText()).replace(/,/g, '');
  const m = t.match(/(\d+)\s+role/);
  assert(m, `could not parse result count from "${t}"`);
  return Number(m[1]);
}

/** Wait for the count to differ from `prev` (render is rAF-scheduled). */
async function countChange(page, prev, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let n = prev;
  while (Date.now() < deadline) {
    n = await resultCount(page).catch(() => prev);
    if (n !== prev) return n;
    await page.waitForTimeout(100);
  }
  return n;
}

const hashParams = (page) => page.evaluate(() => location.hash.slice(1)).then((h) => new URLSearchParams(h));

/** The Chart/Map/Insights toggle in the top bar (data-mode; <html data-mode> also exists, hence the scope). */
function modeBtn(page, mode) {
  return page.locator(`.topbar .seg button[data-mode="${mode}"]`);
}
/** The Clusters | Ranges control in the chart toolbar. */
function viewBtn(page, view) {
  return page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: view === 'ranges' ? 'Ranges' : 'Clusters', exact: true });
}

async function cardIds(page) {
  return page.locator('#resultsList .card[data-id]').evaluateAll((els) => els.map((e) => e.dataset.id));
}

/** The left-panel filter section whose summary title matches `title`. */
function filterSection(page, title) {
  return page.locator('#filterBody details.fsec').filter({ has: page.locator('.fsec-title', { hasText: new RegExp(`^${title}$`) }) });
}

async function apiJobs(ctx, slug) {
  if (ctx.data[slug]) return ctx.data[slug];
  const r = await fetch(`${ctx.baseUrl}/api/jobs?company=${slug}`);
  ctx.data[slug] = await r.json();
  return ctx.data[slug];
}

/**
 * Switch company through the UI: a recent-company pill when one exists, else the
 * searchable company menu (#companyMenuBtn -> popover listbox). Waits for the new
 * company's /api/jobs response and its cards.
 */
async function switchCompany(page, slug, name) {
  const resp = guarded(page.waitForResponse((r) => r.url().includes(`/api/jobs?company=${slug}`), { timeout: 20000 }));
  const pill = page.locator('#companyPills').getByRole('button', { name: new RegExp(`^${name}\\b`) });
  if (await pill.count()) {
    await pill.first().click();
  } else {
    await page.locator('#companyMenuBtn').click();
    const pop = page.locator('#popover.popover--company');
    await pop.waitFor({ state: 'visible', timeout: 5000 });
    await pop.getByRole('searchbox', { name: 'Search companies' }).fill(name);
    await pop.getByRole('option', { name: new RegExp(`^${name}\\b`) }).first().click();
  }
  await resp.done();
  await page.waitForFunction((s) => document.querySelector('#resultsTitle strong')
    && document.querySelector(`#resultsList .card[data-id^="${s}:"]`), slug, { timeout: 15000 });
}

async function noHScroll(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > de.clientWidth + 1 && getComputedStyle(el).position !== 'fixed' && el.offsetParent !== null) {
        offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, bodyScroll: document.body.scrollWidth, offenders: offenders.slice(0, 6) };
  });
}

/** Relative luminance-ish (0..1) of an element's effective background. */
async function luminance(page) {
  return page.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const pick = (el) => { let e = el; while (e) { const v = parse(getComputedStyle(e).backgroundColor); if (v.length && (v.length < 4 || v[3] > 0)) return v; e = e.parentElement; } return [255, 255, 255]; };
    const L = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return { body: L(pick(document.body)), results: L(pick(document.querySelector('#results'))), fg: L(parse(getComputedStyle(document.body).color)) };
  });
}

/** Parse "$352K" / "$1.2M" / "€80K" -> number. */
function parseMoney(t) {
  const m = String(t).replace(/,/g, '').match(/(-?[\d.]+)\s*([KkMm])?/);
  if (!m) return NaN;
  return Number(m[1]) * (/[Kk]/.test(m[2] || '') ? 1e3 : /[Mm]/.test(m[2] || '') ? 1e6 : 1);
}

/** A Skills chip whose facet count is below `total` (so clicking it narrows the list). */
async function narrowingSkill(page, total) {
  const counts = await filterSection(page, 'Skills').locator('button.kw')
    .evaluateAll((els) => els.map((e) => [e.dataset.kw, Number(e.querySelector('.kw-count')?.textContent || 0)]));
  const pick = counts.find(([, c]) => c > 0 && c < total);
  assert(pick, `no Skills chip narrows the list: ${JSON.stringify(counts.slice(0, 5))}`);
  return pick[0];
}

const noErrors = (errors) => assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);

export function registerUiTests(suite) {
  mkdirSync(SHOTS, { recursive: true });

  /* ------------------------------------------------------------- load + chart */

  suite.test('UI: loads with no console errors; chart default = Clusters bands; Ranges shows per-job bars', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      assertEq(await modeBtn(page, 'chart').getAttribute('aria-pressed'), 'true', 'chart mode pressed by default');
      assertEq(await viewBtn(page, 'clusters').getAttribute('aria-pressed'), 'true', 'Clusters pressed by default');
      await page.locator('#chartHost .ms-crow__band').first().waitFor({ timeout: 10000 });
      const bands = await page.locator('#chartHost .ms-crow__band').count();
      assert(bands >= 3, `only ${bands} cluster bands`);
      assert(await page.locator('#mapHost').isHidden(), 'map host should be hidden in chart mode');
      const api = await apiJobs(ctx, 'anthropic');
      assertEq(await resultCount(page), api.jobs.length, 'results count equals API job count with no filters');
      assert((await hashParams(page)).get('c') === 'anthropic', 'hash should contain c=anthropic');
      // The data badge must state the data mode honestly.
      const badge = (await page.locator('#dataBadge .badge-label').innerText()).trim();
      const want = { demo: /demo/i, snapshot: /snapshot/i, cache: /cached/i, live: /live/i }[api.mode];
      assert(want && want.test(badge), `data badge "${badge}" does not reflect mode "${api.mode}"`);
      if (api.mode === 'demo') assert(await page.locator('#demoBanner').isVisible(), 'demo banner visible in demo mode');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, 'chart.png') });
      // Ranges: one bar per salaried job.
      await viewBtn(page, 'ranges').click();
      await page.locator('#chartHost .ms-row__bar').first().waitFor({ timeout: 8000 });
      const rows = await page.locator('#chartHost .ms-row__bar').count();
      assert(rows > 5, `ranges view shows only ${rows} per-job bars`);
      assertEq((await hashParams(page)).get('v'), 'ranges', 'hash v=ranges');
      await viewBtn(page, 'clusters').click();
      await page.waitForTimeout(200);
      assert(!(await hashParams(page)).has('v'), 'Clusters (default) is omitted from the hash');
      noErrors(errors);
    } finally { await close(); }
  });

  /* ---------------------------------------------------------------------- map */

  suite.test('UI: map mode shows price pins, offline basemap note, area chip, Pay|Juice toggle', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      await modeBtn(page, 'map').click();
      assertEq(await modeBtn(page, 'map').getAttribute('aria-pressed'), 'true', 'map pressed');
      await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 10000 });
      const pins = await page.locator('#mapHost .ms-pin').count();
      assert(pins >= 3, `only ${pins} pins`);
      assert(await page.locator('#chartHost').isHidden(), 'chart hidden in map mode');
      const box = await page.locator('#mapHost').boundingBox();
      assert(box && box.width > 300 && box.height > 200, `map host too small ${JSON.stringify(box)}`);
      assertEq((await hashParams(page)).get('m'), 'map', 'hash m=map');
      await page.waitForTimeout(1500);
      const fallback = await page.locator('#mapHost').getByText(/basemap|tiles|offline/i).first().isVisible().catch(() => false);
      assert(fallback, 'no offline/basemap-unavailable note while tiles fail');
      // Every pin inside the visible map after the initial fit (asserted in its own test).
      const geom = await page.evaluate(() => {
        const host = document.querySelector('#mapHost .leaflet-container') || document.querySelector('#mapHost');
        const hr = host.getBoundingClientRect();
        return [...document.querySelectorAll('#mapHost .ms-pin')].map((pin, i) => {
          const r = pin.getBoundingClientRect();
          const inside = r.left >= hr.left - 1 && r.right <= hr.right + 1 && r.top >= hr.top - 1 && r.bottom <= hr.bottom + 1;
          return { i, inside, label: pin.closest('[aria-label]')?.getAttribute('aria-label') || pin.textContent };
        });
      });
      ctx.mapClipped = { clipped: geom.filter((g) => !g.inside), total: geom.length };
      await page.screenshot({ path: path.join(SHOTS, 'map.png') });
      // Pay | Juice pin colouring (viz-owned control inside the map).
      const juiceBtn = page.locator('#mapHost .ms-modes__btn[data-mode="juice"]');
      await juiceBtn.waitFor({ timeout: 5000 });
      assertEq(await page.locator('#mapHost .ms-modes__btn[data-mode="pay"]').getAttribute('aria-checked'), 'true', 'Pay is the default pin colour');
      const bgBefore = await page.locator('#mapHost .ms-pin').evaluateAll((els) => els.map((e) => e.style.getPropertyValue('--pin-bg') || getComputedStyle(e).backgroundColor));
      await juiceBtn.click();
      assertEq(await juiceBtn.getAttribute('aria-checked'), 'true', 'Juice radio checked');
      assert(await page.locator('#mapHost .ms-modes--juice').count() === 1, 'juice legend mode active');
      await page.waitForTimeout(300);
      const bgAfter = await page.locator('#mapHost .ms-pin').evaluateAll((els) => els.map((e) => e.style.getPropertyValue('--pin-bg') || getComputedStyle(e).backgroundColor));
      assert(JSON.stringify(bgBefore) !== JSON.stringify(bgAfter), 'pin colours did not change after switching to Juice');
      await page.screenshot({ path: path.join(SHOTS, 'map-juice.png') });
      await page.locator('#mapHost .ms-modes__btn[data-mode="pay"]').click();
      // Clicking a pin narrows to an area.
      const target = geom.find((g) => g.inside);
      assert(target, 'no pin fully inside the map viewport');
      const before = await resultCount(page);
      await page.locator('#mapHost .ms-pin').nth(target.i).click();
      const areaChip = page.locator('#areaChipTop .area-chip, #areaChipList .area-chip').first();
      await areaChip.waitFor({ timeout: 3000 }).catch(() => {});
      assert(await areaChip.isVisible(), 'clicking a pin should show an area chip');
      const after = await resultCount(page);
      assert(after <= before, `area select should not increase results (${before} -> ${after})`);
      await areaChip.locator('button').click();
      await page.waitForTimeout(300);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: map initial fit keeps every pin inside the visible map', async (ctx) => {
    assert(ctx.mapClipped, 'map test did not run');
    const { clipped, total } = ctx.mapClipped;
    assert(clipped.length === 0, `${clipped.length}/${total} pins outside the visible map after initial fit: ${clipped.map((g) => g.label).join('; ')}`);
  });

  /* ------------------------------------------------------------- company menu */

  suite.test('UI: company menu switches to Anduril and OpenAI (counts match API, recents become pills)', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      // The menu lists every company the API knows.
      const companies = await (await fetch(`${ctx.baseUrl}/api/companies`)).json();
      await page.locator('#companyMenuBtn').click();
      const pop = page.locator('#popover.popover--company');
      await pop.waitFor({ state: 'visible', timeout: 5000 });
      const options = await pop.locator('.company-item').count();
      assert(options >= companies.length, `company menu lists ${options} of ${companies.length} companies`);
      assertEq(await pop.locator('.company-item[aria-selected="true"]').count(), 1, 'exactly one company marked selected');
      await page.keyboard.press('Escape');
      await pop.waitFor({ state: 'hidden', timeout: 3000 });

      for (const [slug, name] of [['anduril', 'Anduril'], ['openai', 'OpenAI']]) {
        await switchCompany(page, slug, name);
        const api = await apiJobs(ctx, slug);
        assertEq(await resultCount(page), api.jobs.length, `${name} results count vs API`);
        assertEq((await hashParams(page)).get('c'), slug, `hash c=${slug}`);
        assert((await page.locator('#companyMenuBtn').innerText()).includes(name), `menu button shows ${name}`);
        const first = (await cardIds(page))[0];
        assert(first && first.startsWith(`${slug}:`), `first card id ${first} should belong to ${slug}`);
      }
      // Previously opened companies are offered as recent pills (desktop >= 1361px shows up to 3).
      const pills = await page.locator('#companyPills button').allInnerTexts();
      assert(pills.some((t) => /Anthropic/.test(t)) && pills.some((t) => /Anduril/.test(t)), `recent pills ${JSON.stringify(pills)}`);
      // Back to Anthropic through the recent pill; search + Enter in the menu also works.
      await switchCompany(page, 'anthropic', 'Anthropic');
      const resp = guarded(page.waitForResponse((r) => r.url().includes('/api/jobs?company=openai'), { timeout: 20000 }));
      await page.locator('#companyMenuBtn').click();
      await page.locator('#popover.popover--company').getByRole('searchbox', { name: 'Search companies' }).fill('open');
      await page.keyboard.press('Enter');
      await resp.done();
      await page.waitForFunction(() => /(^|[#&])c=openai(&|$)/.test(location.hash));
      noErrors(errors);
    } finally { await close(); }
  });

  /* ------------------------------------------------------------------ filters */

  suite.test('UI: salary min filter narrows list; cards satisfy it (approx USD)', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const before = await resultCount(page);
      const lo = filterSection(page, 'Salary').locator('input.range--lo');
      const { min, max } = await lo.evaluate((e) => ({ min: Number(e.min), max: Number(e.max) }));
      assert(max > min, `salary slider domain empty ${min}-${max}`);
      const target = Math.round((min + (max - min) * 0.5) / 5000) * 5000;
      await lo.evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, target);
      const after = await countChange(page, before);
      assert(after < before && after > 0, `salary filter should narrow (before ${before}, after ${after})`);
      const smin = Number((await hashParams(page)).get('smin'));
      assert(smin > 0, 'hash should contain smin');
      const api = await apiJobs(ctx, 'anthropic');
      const byId = new Map(api.jobs.map((j) => [j.id, j]));
      const { toUSD } = await lib('viz/palette.js');
      const usdMax = (j) => toUSD(j.salary.max, j.salary.currency);
      const bad = (await cardIds(page)).filter((id) => { const j = byId.get(id); return !j || !j.salary || usdMax(j) < smin; });
      assert(bad.length === 0, `${bad.length} cards violate salary >= ${smin}: ${bad.slice(0, 3)}`);
      assertEq(after, api.jobs.filter((j) => j.salary && usdMax(j) >= smin).length, 'count vs API-computed salary filter');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: Skills chip narrows list; every remaining job has that skill', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const before = await resultCount(page);
      const chips = filterSection(page, 'Skills').locator('button.kw');
      await chips.first().waitFor({ timeout: 5000 });
      // Pick the most common skill that can actually narrow the list (a chip on every job
      // cannot; that data problem is asserted by the API keyword test).
      const counts = await chips.evaluateAll((els) => els.map((e) => [e.dataset.kw, Number(e.querySelector('.kw-count')?.textContent || 0)]));
      const pick = counts.find(([, c]) => c > 0 && c < before);
      assert(pick, `no Skills chip narrows the list: ${JSON.stringify(counts.slice(0, 5))}`);
      const [skill, chipCount] = pick;
      await filterSection(page, 'Skills').locator(`button.kw[data-kw="${skill}"]`).click();
      const after = await countChange(page, before);
      assertEq(after, chipCount, 'count equals the chip\'s facet count');
      assert(after < before && after > 0, `skill "${skill}" should narrow (before ${before}, after ${after})`);
      assertEq(await filterSection(page, 'Skills').locator(`button.kw[data-kw="${skill}"]`).getAttribute('aria-pressed'), 'true', 'chip pressed');
      const api = await apiJobs(ctx, 'anthropic');
      const byId = new Map(api.jobs.map((j) => [j.id, j]));
      const ids = await cardIds(page);
      assertEq(ids.length, Math.min(after, PAGE_SIZE), `rendered cards vs count (page size ${PAGE_SIZE})`);
      const bad = ids.filter((id) => !byId.get(id)?.keywords.skills.includes(skill));
      assert(bad.length === 0, `${bad.length} cards lack skill "${skill}": ${bad.slice(0, 3)}`);
      assertEq(after, api.jobs.filter((j) => j.keywords.skills.includes(skill)).length, 'count vs API jobs with skill');
      assert((await hashParams(page)).getAll('ks').includes(skill), 'hash has ks');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: department filter', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const before = await resultCount(page);
      const row = filterSection(page, 'Department').locator('label.check').nth(1);
      const dept = (await row.locator('.check-label').innerText()).trim();
      const expectedCount = Number((await row.locator('.check-count').innerText()).trim());
      await row.click();
      const after = await countChange(page, before);
      assert(after < before && after > 0, `department "${dept}" should narrow (${before} -> ${after})`);
      assertEq(after, expectedCount, 'count matches facet count shown next to the checkbox');
      const depts = await page.locator('#resultsList .card .card-dept').allInnerTexts();
      const bad = depts.filter((d) => d.trim() !== dept);
      assert(bad.length === 0, `${bad.length} cards not in "${dept}" (e.g. ${bad[0]})`);
      assert((await hashParams(page)).getAll('d').includes(dept), 'hash has d');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: location filter', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const before = await resultCount(page);
      const rows = filterSection(page, 'Location').locator('label.check');
      let row = null;
      for (let i = 0; i < await rows.count(); i++) {
        if (!/remote/i.test(await rows.nth(i).locator('.check-label').innerText())) { row = rows.nth(i); break; }
      }
      assert(row, 'no location options');
      const loc = (await row.locator('.check-label').innerText()).trim();
      const expectedCount = Number((await row.locator('.check-count').innerText()).trim());
      await row.click();
      const after = await countChange(page, before);
      assert(after < before && after > 0, `location "${loc}" should narrow (${before} -> ${after})`);
      assertEq(after, expectedCount, 'count matches facet count');
      const api = await apiJobs(ctx, 'anthropic');
      const byId = new Map(api.jobs.map((j) => [j.id, j]));
      const bad = (await cardIds(page)).filter((id) => !byId.get(id)?.locations.some((l) => (l.remote ? l.name : l.city || l.name) === loc));
      assert(bad.length === 0, `${bad.length} cards not located in "${loc}": ${bad.slice(0, 3)}`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: "Listed" filter (Past 3 months + Hide 180+ days) round-trips through the hash', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const sec = filterSection(page, 'Listed');
      await sec.locator('summary').click();
      // With no listing ages in the data (no history runs yet), the section shows
      // only an empty-state note (QA L1); verify that instead of the options.
      const apiFirst = await apiJobs(ctx, 'anthropic');
      if (!apiFirst.jobs.some((j) => Number.isFinite(j.ageDays))) {
        await sec.getByText('Listing dates appear after a few daily runs.').waitFor({ timeout: 5000 });
        assertEq(await sec.locator('label.radio:visible').count(), 0, 'no visible Listed options without listing ages');
        noErrors(errors);
        return;
      }
      const labels = (await sec.locator('.radio .check-label').allInnerTexts()).map((t) => t.trim());
      assertEq(JSON.stringify(labels), JSON.stringify(['Any time', 'Past week', 'Past month', 'Past 3 months']), 'Listed options');
      const row = sec.locator('label.radio').filter({ hasText: 'Past 3 months' });
      const facet = Number((await row.locator('.check-count').innerText()).trim());
      const before = await resultCount(page);
      await row.click();
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('p') === '90');
      const after = await countChange(page, before, facet === before ? 500 : 5000);
      assertEq(after, facet, 'Past 3 months count equals its facet count');
      const api = await apiJobs(ctx, 'anthropic');
      const aged = api.jobs.filter((j) => Number.isFinite(j.ageDays)).length;
      if (!aged) ctx.notes.push(`Listed filter: 0/${api.jobs.length} anthropic jobs have ageDays, so every "Listed" window returns 0 roles`);
      else assertEq(after, api.jobs.filter((j) => Number.isFinite(j.ageDays) && j.ageDays <= 90).length, 'count vs API ageDays<=90');
      await sec.locator('label.radio').filter({ hasText: 'Any time' }).click();
      await sec.locator('label.check').filter({ hasText: 'Hide roles open 180+ days' }).click();
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('ho') === '1');
      const old = api.jobs.filter((j) => Number.isFinite(j.ageDays) && j.ageDays >= 180).length;
      await page.waitForTimeout(300);
      assertEq(await resultCount(page), api.jobs.length - old, 'Hide 180+ removes exactly the 180+ day roles');
      noErrors(errors);
    } finally { await close(); }
  });

  /* ------------------------------------------------------------------- drawer */

  suite.test('UI: drawer: Apply link, fixed section order + 3-open budget, honest caption, lazy description via /api/job', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const api = await apiJobs(ctx, 'anthropic');
      const card = page.locator('#resultsList .card[data-id]').first();
      const id = await card.getAttribute('data-id');
      const job = api.jobs.find((j) => j.id === id);
      const title = (await card.locator('.card-title').innerText()).trim();
      const detail = guarded(page.waitForResponse((r) => r.url().includes('/api/job?id='), { timeout: 15000 }));
      await card.click();
      const drawer = page.getByRole('dialog', { name: title });
      await drawer.waitFor({ state: 'visible', timeout: 5000 });
      // Apply
      const apply = drawer.getByRole('link', { name: /apply|open the real/i });
      assert(await apply.isVisible(), 'Apply link not visible');
      assertEq(await apply.getAttribute('href'), job.url, 'apply href = job.url');
      assertEq(await apply.getAttribute('target'), '_blank', 'apply opens in new tab');
      assert(/noopener/.test(await apply.getAttribute('rel') || ''), 'apply rel noopener');
      assertEq((await hashParams(page)).get('job'), id, 'hash job=id');
      // Honest numbers: caption always shown with a posted salary; at most 2 labels.
      if (job.salary) {
        assertEq((await drawer.locator('.d-pay-caption').innerText()).trim(), 'Posted base pay. Equity and bonus aren’t included.', 'honest-number caption');
        const labels = await drawer.locator('.pay-labels .pay-label').count();
        assert(labels <= 2, `${labels} pay labels (max 2)`);
      }
      // Lazy description through /api/job.
      const res = await detail.done();
      assertEq(res.status(), 200, '/api/job status');
      assertEq(new URL(res.url()).searchParams.get('id'), id, '/api/job id');
      const body = await res.json();
      await page.waitForTimeout(500);
      // Section order (ROADMAP §8) and the 3-open budget.
      const folds = await drawer.locator('.drawer-scroll > .d-fold').evaluateAll((els) => els.filter((e) => !e.hidden)
        .map((e) => ({ t: e.querySelector('summary h3').textContent.replace(/click to filter/, '').trim(), open: e.open })));
      const ORDER = [/^Same role elsewhere$/, /^Listing$/, /^Locations?( \(\d+\))?$/, /^Keywords$/, /^About the role$/, /^Full description$/];
      let k = 0;
      for (const f of folds) {
        while (k < ORDER.length && !ORDER[k].test(f.t)) k++;
        assert(k < ORDER.length, `drawer section "${f.t}" out of order or unknown; got ${folds.map((x) => x.t).join(' > ')}`);
      }
      const open = folds.filter((f) => f.open).length;
      assert(open <= 3, `${open} drawer sections open (budget 3): ${folds.map((x) => `${x.t}:${x.open}`).join(', ')}`);
      if (folds.length > 3) assert(folds.slice(3).every((f) => !f.open), 'sections after the 3rd start collapsed');
      const order = await drawer.locator('.drawer-scroll > *').evaluateAll((els) => els.map((e) => e.className));
      assert(order.findIndex((c) => /d-salary/.test(c)) < order.findIndex((c) => /d-fold/.test(c)), 'pay block precedes the folds');
      await page.screenshot({ path: path.join(SHOTS, 'drawer.png') });
      // Open "Full description": the lazily loaded HTML, sanitized.
      const descFold = drawer.locator('.drawer-scroll > .d-fold.d-desc');
      if (body.descriptionHtml) {
        assert(await descFold.isVisible(), 'Full description section hidden although /api/job returned HTML');
        if (!(await descFold.evaluate((e) => e.open))) await descFold.locator('summary').click();
        const text = (await descFold.locator('.desc').innerText()).trim();
        assert(text.length > 50, `description text too short (${text.length})`);
        assertEq(await drawer.locator('script, iframe, [onerror], [onclick]').count(), 0, 'unsanitized content in drawer');
      }
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'hidden', timeout: 3000 });
      assert(!(await hashParams(page)).get('job'), 'Escape clears job from hash');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: salary-gate "Pay unclear": card pill and drawer disclosure with the reason', async (ctx) => {
    let slug = null, job = null;
    for (const s of ['anthropic', 'anduril', 'openai']) {
      const api = await apiJobs(ctx, s);
      job = api.jobs.find((j) => j.salaryFlag && !j.salary);
      if (job) { slug = s; break; }
    }
    if (!job) skip('no quarantined salary (salaryFlag) in anthropic/anduril/openai data (demo mode?)');
    const { page, errors, close } = await openApp(ctx, { hash: `c=${slug}&q=${encodeURIComponent(job.title)}` });
    try {
      const card = page.locator(`#resultsList .card[data-id="${job.id}"]`);
      await card.waitFor({ timeout: 8000 });
      const pill = card.locator('.sal-pill--unclear');
      assertEq((await pill.innerText()).trim(), 'Pay unclear', 'card pill text');
      assertEq(await pill.getAttribute('title'), job.salaryFlag.reason, 'card pill tooltip = salaryFlag.reason');
      await card.click();
      const drawer = page.locator('#drawer');
      await drawer.waitFor({ state: 'visible', timeout: 5000 });
      const block = drawer.locator('.d-sal-unclear');
      assert((await block.innerText()).includes('Pay unclear, see posting'), 'drawer says "Pay unclear, see posting"');
      await block.locator('details.d-unclear > summary').click();
      const why = (await block.locator('details.d-unclear').innerText());
      assert(why.includes(job.salaryFlag.reason), `"Why?" should show the reason "${job.salaryFlag.reason}", got "${why.slice(0, 200)}"`);
      assertEq(await block.getByRole('link', { name: 'Check the posting' }).getAttribute('href'), job.url, 'posting link');
      assertEq(await drawer.locator('.d-pay-caption').count(), 0, 'no posted-pay caption for a quarantined salary');
      noErrors(errors);
    } finally { await close(); }
  });

  /* -------------------------------------------------------------------- juice */

  suite.test('UI: Juice badge on cards, "Most juice" sort, drawer waterfall (Monthly/Yearly)', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      await page.locator('#resultsList .juice-badge').first().waitFor({ timeout: 8000 }).catch(() => {});
      const badges = await page.locator('#resultsList .juice-badge').count();
      assert(badges > 0, 'no Juice badges on the first page of cards (juice not attached?)');
      const txt = await page.locator('#resultsList .juice-badge').first().innerText();
      assert(/^🍉 ≈?\d+ · (Juicy|Ripe|Dry|Rind)$/.test(txt.trim()), `badge text "${txt}"`);
      await page.locator('#sortBy').selectOption('juice');
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('sort') === 'juice');
      await page.waitForTimeout(300);
      const scores = await page.locator('#resultsList .card[data-id]').evaluateAll((els) => els.map((e) => {
        const b = e.querySelector('.juice-badge');
        const m = b && b.textContent.match(/(\d+)/);
        return m ? Number(m[1]) : null;
      }));
      const firstNull = scores.indexOf(null);
      const scored = firstNull < 0 ? scores : scores.slice(0, firstNull);
      assert(scored.length > 0, 'Most juice: first card has no badge');
      assert(firstNull < 0 || scores.slice(firstNull).every((s) => s === null), 'Most juice: an unscored card sorts before a scored one');
      for (let i = 1; i < scored.length; i++) assert(scored[i] <= scored[i - 1], `Most juice not descending at #${i}: ${scored.slice(0, i + 1).join(',')}`);
      // Waterfall in the drawer of the juiciest role.
      await page.locator('#resultsList .card[data-id]').first().click();
      const wf = page.locator('#drawer .d-juice .waterfall');
      await wf.waitFor({ timeout: 5000 });
      const labels = (await wf.locator('.wf-label').allInnerTexts()).map((t) => t.trim());
      assertEq(JSON.stringify(labels), JSON.stringify(['Gross pay', 'Tax', 'Rent', 'Living costs', 'Juice left']), 'waterfall rows');
      const yearly = (await wf.locator('.wf-value').allInnerTexts()).map((t) => t.trim());
      assert(yearly.every((v) => v.endsWith('/yr')), `yearly values ${yearly}`);
      const score = Number((await page.locator('#drawer .juice-score').innerText()).replace(/\D/g, ''));
      assertEq(score, scored[0], 'drawer Juice score equals the card badge');
      await page.locator('#drawer .d-juice').getByRole('button', { name: 'Monthly' }).click();
      const monthly = (await wf.locator('.wf-value').allInnerTexts()).map((t) => t.trim());
      assert(monthly.every((v) => v.endsWith('/mo')), `monthly values ${monthly}`);
      const g = [parseMoney(yearly[0]), parseMoney(monthly[0])];
      assert(Math.abs(g[0] / 12 - g[1]) <= Math.max(1000, g[0] / 12 * 0.06), `monthly gross ${monthly[0]} != yearly ${yearly[0]} / 12`);
      // net = gross - tax - rent - living (within display rounding)
      const [gross, tax, rent, living, net] = yearly.map(parseMoney);
      assert(Math.abs(gross - tax - rent - living - net) <= Math.max(5000, gross * 0.03), `waterfall does not add up: ${yearly.join(' | ')}`);
      assert(await page.locator('#drawer .juice-disclaimer').getByRole('link', { name: /How it.s calculated/ }).isVisible(), 'disclaimer link');
      await page.screenshot({ path: path.join(SHOTS, 'drawer-juice.png') });
      noErrors(errors);
    } finally { await close(); }
  });

  /* --------------------------------------------------------- comps / insights */

  suite.test('UI: "Same role elsewhere" rows; clicking one switches company with rf filter; Back returns', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const { roleFamily } = await lib('features/roles.js');
      const ids = (await cardIds(page)).slice(0, 8);
      let rows = null;
      for (const id of ids) {
        await page.locator(`#resultsList .card[data-id="${id}"]`).click();
        await page.locator('#drawer').waitFor({ state: 'visible', timeout: 5000 });
        const sec = page.locator('#drawer .d-comps');
        if (await sec.count()) {
          await page.waitForFunction(() => { const s = document.querySelector('#drawer .d-comps'); return !s || s.hidden || s.querySelector('.ms-comps__row'); }, null, { timeout: 8000 });
          if (await sec.isVisible() && await sec.locator('.ms-comps__row:not(.is-current)').count()) { rows = sec.locator('.ms-comps__row'); break; }
        }
        await page.keyboard.press('Escape');
        await page.locator('#drawer').waitFor({ state: 'hidden', timeout: 3000 });
      }
      assert(rows, `no "Same role elsewhere" section with other companies in the first ${ids.length} drawers`);
      const n = await rows.count();
      assert(n >= 2, `only ${n} comps rows`);
      assertEq(await rows.locator('.is-current').count() + await page.locator('#drawer .ms-comps__row.is-current').count() > 0, true, 'the current company is one of the rows');
      const jobHash = (await hashParams(page)).get('job');
      const other = page.locator('#drawer .ms-comps__row:not(.is-current)').first();
      const otherName = (await other.locator('.ms-comps__label').innerText()).trim();
      const resp = guarded(page.waitForResponse((r) => r.url().includes('/api/jobs?company='), { timeout: 20000 }));
      await other.click();
      await resp.done();
      await page.waitForFunction(() => { const p = new URLSearchParams(location.hash.slice(1)); return p.get('c') !== 'anthropic' && p.get('rf'); }, null, { timeout: 8000 });
      const hp = await hashParams(page);
      const slug = hp.get('c'), rf = hp.get('rf'), sen = hp.getAll('s');
      await page.waitForFunction((s) => document.querySelector(`#resultsList .card[data-id^="${s}:"], #resultsList .list-empty`), slug, { timeout: 15000 });
      assert((await page.locator('#companyMenuBtn').innerText()).includes(otherName), `company switched to ${otherName}`);
      assert(await page.locator('#areaChipTop .area-chip, #areaChipList .area-chip').filter({ hasText: /^Role:/ }).first().isVisible(), '"Role: …" chip visible');
      const api = await apiJobs(ctx, slug);
      const expected = api.jobs.filter((j) => roleFamily(j.title, j) === rf && (!sen.length || sen.includes(j.seniority))).length;
      assertEq(await resultCount(page), expected, `count for rf=${rf}${sen.length ? ` s=${sen}` : ''} at ${slug}`);
      await page.goBack();
      await page.waitForFunction((j) => new URLSearchParams(location.hash.slice(1)).get('c') === 'anthropic', null, { timeout: 8000 });
      await waitReady(page, 'after Back');
      assertEq((await hashParams(page)).get('job'), jobHash, 'Back restores the drawer job in the hash');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: Insights mode: Compstimate + Market insights + "Compare companies" pick', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      await modeBtn(page, 'insights').click();
      assertEq((await hashParams(page)).get('m'), 'insights', 'hash m=insights');
      await page.locator('#insightsHost').waitFor({ state: 'visible', timeout: 5000 });
      assert(await page.locator('#vizArea').isHidden(), 'chart/map area hidden in insights');
      assert((await page.locator('#compHost').innerText()).trim().length > 20, 'Compstimate card empty');
      assert((await page.locator('#insightsPanel').innerText()).trim().length > 20, 'Market insights card empty');
      const card = page.locator('#compsCardHost');
      await card.waitFor({ state: 'visible', timeout: 10000 });
      assert(await card.getByRole('heading', { name: 'Compare companies' }).isVisible(), 'Compare companies heading');
      const other = card.locator('button.msi-row:not(.is-current)').first();
      await other.waitFor({ timeout: 5000 });
      const key = await other.getAttribute('data-key');
      const slug = key.replace(/^company:/, '');
      const resp = guarded(page.waitForResponse((r) => r.url().includes(`/api/jobs?company=${slug}`), { timeout: 20000 }));
      await other.click();
      await resp.done();
      await page.waitForFunction((s) => { const p = new URLSearchParams(location.hash.slice(1)); return p.get('c') === s && p.get('rf'); }, slug, { timeout: 8000 });
      await page.screenshot({ path: path.join(SHOTS, 'insights.png') });
      noErrors(errors);
    } finally { await close(); }
  });

  /* --------------------------------------------------------------- save + csv */

  suite.test('UI: Save chip appears only with an active filter; saves to the company menu; toggles off', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const save = page.locator('#saveSearch');
      assert(await save.isHidden(), 'Save visible with no filter');
      const chip = filterSection(page, 'Skills').locator('button.kw').first();
      const skill = await chip.getAttribute('data-kw');
      await chip.click();
      await save.waitFor({ state: 'visible', timeout: 3000 });
      assertEq(await save.getAttribute('aria-pressed'), 'false', 'Save not pressed yet');
      assertEq((await save.innerText()).trim(), 'Save', 'label Save');
      await save.click();
      await page.waitForFunction(() => document.querySelector('#saveSearch')?.getAttribute('aria-pressed') === 'true');
      assertEq((await save.innerText()).trim(), 'Saved', 'label Saved');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('melon.saved') || '[]'));
      assertEq(stored.length, 1, 'one saved search in localStorage');
      assert(new URLSearchParams(stored[0].hash).getAll('ks').includes(skill), `saved hash ${stored[0].hash} lacks ks=${skill}`);
      // Clear filters -> Save hides; the company menu lists the saved search; opening it restores the filter.
      await page.locator('#clearAll').click();
      await page.waitForTimeout(300);
      assert(await save.isHidden(), 'Save visible after Clear all');
      await page.locator('#companyMenuBtn').click();
      const pop = page.locator('#popover.popover--company');
      await pop.waitFor({ state: 'visible' });
      assert(await pop.getByText('Saved searches').isVisible(), '"Saved searches" group in the company menu');
      await pop.getByRole('option', { name: stored[0].name }).click();
      await page.waitForFunction((s) => new URLSearchParams(location.hash.slice(1)).getAll('ks').includes(s), skill, { timeout: 5000 });
      await save.waitFor({ state: 'visible' });
      assertEq(await save.getAttribute('aria-pressed'), 'true', 'restored search shows as Saved');
      await save.click();
      await page.waitForFunction(() => document.querySelector('#saveSearch')?.getAttribute('aria-pressed') === 'false');
      assertEq(await page.evaluate(() => JSON.parse(localStorage.getItem('melon.saved') || '[]').length), 0, 'second click removes the saved search');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: data badge "Download CSV" -> /api/export (200, text/csv, one row per job)', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      await page.locator('#dataBadge').click();
      const pop = page.locator('#popover.popover--badge');
      await pop.waitFor({ state: 'visible', timeout: 5000 });
      const link = pop.getByRole('link', { name: 'Download CSV' });
      const href = await link.getAttribute('href');
      assert(/api\/export\?company=anthropic$/.test(href), `CSV href ${href}`);
      const url = new URL(href, page.url()).href;
      const res = await page.request.get(url);
      assertEq(res.status(), 200, 'CSV status');
      assert(/^text\/csv/.test(res.headers()['content-type'] || ''), `content-type ${res.headers()['content-type']}`);
      const text = await res.text();
      const api = await apiJobs(ctx, 'anthropic');
      const header = text.split(/\r?\n/)[0];
      assert(/title/i.test(header) && /url/i.test(header), `CSV header "${header.slice(0, 120)}"`);
      // Count records, honouring quoted newlines.
      let records = 0, inQ = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') inQ = !inQ;
        else if (ch === '\n' && !inQ) records++;
      }
      if (!text.endsWith('\n')) records++;
      assertEq(records - 1, api.jobs.length, 'CSV data rows vs API jobs');
      const dl = guarded(page.waitForEvent('download', { timeout: 10000 }));
      await link.click();
      const download = await dl.done();
      const fname = download.suggestedFilename();
      assert(/anthropic.*\.csv$/.test(fname), `download filename ${fname}`);
      if (fname !== 'anthropic-jobs.csv') ctx.notes.push(`CSV: <a download="anthropic-jobs.csv"> is overridden by the server's Content-Disposition filename "${fname}"`);
      noErrors(errors);
    } finally { await close(); }
  });

  /* ---------------------------------------------------------------- hash state */

  suite.test('UI: URL hash round-trip (reload preserves company, filters, mode; deep link; Back)', async (ctx) => {
    const { page, errors, context, close } = await openApp(ctx);
    try {
      await switchCompany(page, 'openai', 'OpenAI');
      await page.waitForTimeout(300);
      const before = await resultCount(page);
      const skill = await narrowingSkill(page, before);
      await filterSection(page, 'Skills').locator(`button.kw[data-kw="${skill}"]`).click();
      const n1 = await countChange(page, before);
      await filterSection(page, 'Department').locator('label.check').first().click();
      const n2 = await countChange(page, n1);
      await modeBtn(page, 'map').click();
      await page.waitForTimeout(300);
      const hash = await page.evaluate(() => location.hash);
      const ids = await cardIds(page);
      await page.reload();
      await waitReady(page, 'after reload');
      await page.waitForTimeout(500);
      assertEq(await page.evaluate(() => location.hash), hash, 'hash after reload');
      assertEq(await resultCount(page), n2, 'result count after reload');
      assertEq(JSON.stringify(await cardIds(page)), JSON.stringify(ids), 'card order after reload');
      assertEq(await modeBtn(page, 'map').getAttribute('aria-pressed'), 'true', 'map mode after reload');
      assertEq(await filterSection(page, 'Skills').locator(`button.kw[data-kw="${skill}"]`).getAttribute('aria-pressed'), 'true', 'skill chip after reload');
      assertEq(await filterSection(page, 'Department').locator('input[type=checkbox]:checked').count(), 1, 'dept checkbox after reload');
      assert((await page.locator('#companyMenuBtn').innerText()).includes('OpenAI'), 'company after reload');
      // Deep link to a job opens the drawer.
      const jid = ids[0];
      const page2 = await context.newPage();
      await page2.goto(`${ctx.baseUrl}/#c=openai&job=${encodeURIComponent(jid)}`);
      await page2.locator('#drawer').waitFor({ state: 'visible', timeout: 10000 });
      const api = await apiJobs(ctx, 'openai');
      assertEq((await page2.locator('#drawerTitle').innerText()).trim(), api.jobs.find((j) => j.id === jid).title.trim(), 'deep-linked drawer title');
      await page2.close();
      // Back undoes the last discrete change (map -> chart).
      await page.goBack();
      await page.waitForTimeout(500);
      assertEq(await modeBtn(page, 'chart').getAttribute('aria-pressed'), 'true', 'history back restores chart mode');
      noErrors(errors);
    } finally { await close(); }
  });

  /* -------------------------------------------------------------------- theme */

  suite.test('UI: theme toggle cycles System -> Light -> Dark, persists across reload, renders dark', async (ctx) => {
    const { page, errors, close } = await openApp(ctx, { colorScheme: 'light' });
    try {
      const btn = page.locator('#themeBtn');
      assertEq(await btn.getAttribute('aria-label'), 'Theme: System', 'initial theme');
      await btn.click();
      assertEq(await btn.getAttribute('aria-label'), 'Theme: Light', 'after 1 click');
      assertEq(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'data-theme=light');
      await btn.click();
      assertEq(await btn.getAttribute('aria-label'), 'Theme: Dark', 'after 2 clicks');
      assertEq(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'data-theme=dark');
      await page.waitForTimeout(300);
      const lum = await luminance(page);
      assert(lum.body < 0.3 && lum.results < 0.35 && lum.fg > 0.6, `forced dark on a light OS not dark: ${JSON.stringify(lum)}`);
      await page.reload();
      await waitReady(page, 'after reload');
      assertEq(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'dark persisted across reload');
      await page.locator('body').click({ position: { x: 5, y: 600 } }).catch(() => {});
      await page.keyboard.press('t');
      assertEq(await btn.getAttribute('aria-label'), 'Theme: System', '"t" cycles back to System');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: dark mode (OS dark): chart, map, insights, drawer render dark with no page errors', async (ctx) => {
    const { page, errors, close } = await openApp(ctx, { colorScheme: 'dark' });
    try {
      await page.waitForTimeout(500);
      const lum = await luminance(page);
      assert(lum.body < 0.3, `body background not dark (luminance ${lum.body.toFixed(2)})`);
      assert(lum.results < 0.35, `results panel not dark (luminance ${lum.results.toFixed(2)})`);
      assert(lum.fg > 0.6, `body text not light in dark mode (luminance ${lum.fg.toFixed(2)})`);
      await page.screenshot({ path: path.join(SHOTS, 'dark.png') });
      await viewBtn(page, 'ranges').click();
      await page.locator('#chartHost .ms-row__bar').first().waitFor({ timeout: 8000 });
      await modeBtn(page, 'map').click();
      await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 10000 });
      await page.locator('#mapHost .ms-modes__btn[data-mode="juice"]').click();
      await modeBtn(page, 'insights').click();
      await page.locator('#insightsHost').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(800);
      await modeBtn(page, 'chart').click();
      await page.locator('#resultsList .card[data-id]').first().click();
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOTS, 'dark-drawer.png') });
      noErrors(errors);
    } finally { await close(); }
  });

  /* ------------------------------------------------------------------- mobile */

  suite.test('UI: mobile 390x844 renders without horizontal scroll (chart, map, filters, company menu)', async (ctx) => {
    const { page, errors, close } = await openApp(ctx, { viewport: MOBILE });
    try {
      await page.waitForTimeout(500);
      const m = await noHScroll(page);
      assert(m.scrollWidth <= m.clientWidth && m.bodyScroll <= m.clientWidth,
        `horizontal overflow: scrollWidth=${m.scrollWidth} body=${m.bodyScroll} client=${m.clientWidth}; offenders: ${m.offenders.join(', ')}`);
      await page.screenshot({ path: path.join(SHOTS, 'mobile.png') });
      const unnamed = () => page.locator('button:visible').evaluateAll((els) => els
        .filter((b) => !(b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('aria-labelledby') || b.innerText.trim()))
        .map((b) => b.outerHTML.replace(/\s+/g, ' ').slice(0, 110)));
      ctx.mobileUnnamed = await unnamed();
      await modeBtn(page, 'map').click();
      await page.waitForTimeout(500);
      const m2 = await noHScroll(page);
      assert(m2.scrollWidth <= m2.clientWidth, `map mode overflow: ${m2.scrollWidth} > ${m2.clientWidth}; ${m2.offenders.join(', ')}`);
      await page.locator('#filtersToggle').click();
      await page.waitForTimeout(400);
      assert(await page.locator('#filters').isVisible(), 'filters panel opens on mobile');
      ctx.mobileUnnamed.push(...await unnamed());
      const m3 = await noHScroll(page);
      assert(m3.scrollWidth <= m3.clientWidth, `filters open overflow: ${m3.scrollWidth} > ${m3.clientWidth}`);
      await page.locator('#filtersClose').click();
      await page.waitForTimeout(300);
      // The company menu is the only switcher on phones.
      await switchCompany(page, 'openai', 'OpenAI');
      const m4 = await noHScroll(page);
      assert(m4.scrollWidth <= m4.clientWidth, `after company switch overflow: ${m4.scrollWidth} > ${m4.clientWidth}`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: mobile 390x844 buttons keep visible text / accessible names', async (ctx) => {
    assert(ctx.mobileUnnamed, 'mobile test did not run');
    const u = [...new Set(ctx.mobileUnnamed)];
    assert(u.length === 0, `${u.length} visible buttons have no text or accessible name at 390px:\n${u.join('\n')}`);
  });

  /* -------------------------------------------------------------------- misc */

  suite.test('UI: custom board via "Add board" loads jobs', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      await page.getByRole('button', { name: /add board/i }).click();
      const pop = page.locator('#popover');
      await pop.waitFor({ state: 'visible' });
      await pop.getByLabel('Source').selectOption('greenhouse');
      await pop.getByLabel('Board slug').fill('foo');
      await pop.getByLabel(/Display name/).fill('Foo Corp');
      const resp = guarded(page.waitForResponse((r) => r.url().includes('/api/jobs?source=greenhouse&board=foo'), { timeout: 20000 }));
      await pop.getByRole('button', { name: /add & open/i }).click();
      await resp.done();
      await page.waitForFunction(() => /c=greenhouse(%3A|:)foo/.test(location.hash), null, { timeout: 5000 });
      await waitReady(page);
      await page.waitForTimeout(300);
      assert(await resultCount(page) > 0, 'custom board has no results');
      assert((await page.locator('#companyMenuBtn').innerText()).includes('Foo Corp'), 'menu button shows Foo Corp');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: keyboard - Enter on a focused card opens the drawer, Esc closes and restores focus', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const card = page.locator('#resultsList .card[data-id]').nth(1);
      const id = await card.getAttribute('data-id');
      await card.focus();
      await page.keyboard.press('Enter');
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 3000 });
      assertEq((await hashParams(page)).get('job'), id, 'job in hash');
      await page.keyboard.press('Escape');
      await page.locator('#drawer').waitFor({ state: 'hidden', timeout: 3000 });
      assertEq(await page.evaluate(() => document.activeElement?.dataset?.id), id, 'focus returns to the card');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('UI: search box filters by text', async (ctx) => {
    const { page, errors, close } = await openApp(ctx);
    try {
      const before = await resultCount(page);
      const api = await apiJobs(ctx, 'anthropic');
      const word = api.jobs[0].title.split(/[\s,]+/).find((w) => w.length > 4) || 'Engineer';
      await page.getByRole('searchbox', { name: /search roles/i }).fill(word);
      const after = await countChange(page, before);
      assert(after > 0 && after < before, `search "${word}" gave ${after} of ${before}`);
      assert((await page.locator('#resultsList .card-title').allInnerTexts()).length > 0, 'no cards after search');
      noErrors(errors);
    } finally { await close(); }
  });
}

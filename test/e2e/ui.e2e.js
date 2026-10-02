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
    // Menu rows are plain buttons (.company-item; the active one has aria-current).
    await pop.locator('.company-item').filter({ has: page.locator('.company-item-name', { hasText: new RegExp(`^${name}$`) }) }).first().click();
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
      assertEq(await pop.locator('.company-item[aria-current="true"]').count(), 1, 'exactly one company marked current');
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
      // UX-5: the waterfall now sits in a disclosure under a one-line headline.
      const jd = page.locator('#drawer .d-juice details.juice-details');
      await jd.waitFor({ state: 'attached', timeout: 5000 });
      if (!(await jd.evaluate((e) => e.open))) await jd.locator('summary').first().click();
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
      // Insights cards render after the host is shown; give them a moment on a busy run.
      await page.waitForFunction(() => ['#compHost', '#insightsPanel'].every((sel) => (document.querySelector(sel)?.innerText || '').trim().length > 20), null, { timeout: 8000 }).catch(() => {});
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
      // V9: Save/Saved is a label change (+ .is-saved), not aria-pressed.
      assert(!(await save.evaluate((e) => e.classList.contains('is-saved'))), 'Save already marked saved');
      assertEq((await save.innerText()).trim(), 'Save', 'label Save');
      await save.click();
      await page.waitForFunction(() => document.querySelector('#saveSearch')?.classList.contains('is-saved'));
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
      await pop.locator('.company-item').filter({ hasText: stored[0].name }).first().click();
      await page.waitForFunction((s) => new URLSearchParams(location.hash.slice(1)).getAll('ks').includes(s), skill, { timeout: 5000 });
      await save.waitFor({ state: 'visible' });
      assertEq((await save.innerText()).trim(), 'Saved', 'restored search shows as Saved');
      await save.click();
      await page.waitForFunction(() => !document.querySelector('#saveSearch')?.classList.contains('is-saved'));
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
      // Allow the close transition and any re-render 1 s; report where focus went if it is lost.
      await page.waitForFunction((i) => document.activeElement?.dataset?.id === i, id, { timeout: 1000 }).catch(() => {});
      const ae = await page.evaluate(() => { const e = document.activeElement; return { id: e?.dataset?.id, d: `${e?.tagName}${e?.id ? '#' + e.id : ''}.${e?.className}` }; });
      assertEq(ae.id, id, `focus returns to the card (focus is on ${ae.d})`);
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
  registerCompstimateTests(suite);
}

/* ======================================================================
 * Compstimate task force (docs/process/compstimate-taskforce.md §3.3).
 * One test per matrix scenario (T1–T23) plus a drawer = Insights consistency
 * test. Expected pools/memberships come from /api/jobs + Rule 3, never from
 * product's helper. Board filters are set through the hash (the same commit
 * path as the filter panel) except T2, which clicks the real checkbox.
 * ==================================================================== */

// A level word as a title prefix (what LEVEL_PREFIX strips), or the Staff+/Senior+ labels anywhere.
const LEVEL_WORD = /^(intern|entry|junior|jr\.?|mid|senior|sr\.?|staff|principal|lead|director)\b|(staff|senior|director)\+/i;

/** Snapshot of the Insights Compstimate widget. */
function readComp(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#compHost');
    if (!root || !root.querySelector('.ms-comp')) return null;
    const vis = (e) => !!e && e.offsetParent !== null;
    const txt = (sel) => { const e = root.querySelector(sel); return e && vis(e) ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
    const sels = root.querySelectorAll('select');
    const opt = (s) => (s ? { value: s.value, text: (s.selectedOptions[0]?.textContent || '').trim() } : null);
    // Basis: the smallest visible element whose text starts with "Based on ".
    let basis = null;
    for (const e of root.querySelectorAll('*')) {
      const t = e.textContent.replace(/\s+/g, ' ').trim();
      if (vis(e) && /^Based on /.test(t) && (!basis || t.length < basis.length)) basis = t;
    }
    const ends = [...root.querySelectorAll('.ms-comp__range-ends b')].map((b) => b.textContent.trim());
    const resets = [...document.querySelectorAll('a, button')].filter((e) => vis(e) && /^Reset to filters$/i.test(e.textContent.trim()));
    return {
      title: root.querySelector('.ms-comp__input')?.value ?? null,
      location: opt(sels[0]), level: opt(sels[1]),
      hero: txt('.ms-comp__hero'), per: txt('.ms-comp__per'), low: ends[0] ?? null, high: ends[1] ?? null,
      conf: txt('.ms-comp__conf-label'), basis, n: basis && /Based on (\d[\d,]*)/.test(basis) ? Number(basis.match(/Based on (\d[\d,]*)/)[1].replace(/,/g, '')) : null,
      accuracy: txt('.ms-comp__accuracy'), explain: txt('.ms-comp__explain'), auto: txt('.ms-comp__auto'),
      foot: txt('.ms-comp__foot'),
      notEnough: /Not enough comparable roles/i.test(root.textContent), noEstimateYet: /No estimate yet/i.test(root.textContent),
      items: [...root.querySelectorAll('.ms-comp__item')].map((b) => ({ id: (b.dataset.key || '').replace(/^comp:/, ''), meta: b.querySelector('.ms-comp__item-meta')?.textContent.trim() || '' })),
      resetLinks: resets.length,
      text: root.innerText,
    };
  });
}
const numbers = (c) => c && { hero: c.hero, low: c.low, high: c.high, n: c.n, conf: c.conf, ids: c.items.map((i) => i.id).join(',') };
const fields = (c) => c && { title: c.title, location: c.location?.value, locationText: c.location?.text, level: c.level?.value, levelText: c.level?.text };

/** Count widget renders: MutationObserver callbacks on .ms-comp__result that add nodes. */
async function installRenderCounter(page) {
  await page.evaluate(() => {
    const el = document.querySelector('#compHost .ms-comp__result');
    window.__compRenders = 0;
    window.__compSaw = [];
    if (!el || el.__counted) return;
    el.__counted = true;
    new MutationObserver((recs) => {
      if (recs.some((r) => r.addedNodes.length)) {
        window.__compRenders++;
        window.__compSaw.push(el.textContent.slice(0, 80));
      }
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
}
const renders = (page) => page.evaluate(() => window.__compRenders || 0);
const resetRenders = (page) => page.evaluate(() => { window.__compRenders = 0; window.__compSaw = []; });

/** Wait until the widget stops re-rendering (no new render for `quiet` ms). */
async function settle(page, { quiet = 450, max = 8000 } = {}) {
  const t0 = Date.now();
  let last = await renders(page), since = Date.now();
  while (Date.now() - t0 < max) {
    await page.waitForTimeout(100);
    const n = await renders(page);
    if (n !== last) { last = n; since = Date.now(); } else if (Date.now() - since >= quiet) break;
  }
}

/** Open Insights for a company and wait for the widget's first estimate. */
async function openComp(ctx, hash = 'c=anthropic&m=insights', opts = {}) {
  const app = await openApp(ctx, { hash, ...opts });
  await app.page.locator('#compHost .ms-comp__result').waitFor({ state: 'attached', timeout: 15000 });
  await app.page.waitForFunction(() => document.querySelector('#compHost .ms-comp__result')?.childElementCount > 0, null, { timeout: 15000 });
  await installRenderCounter(app.page);
  await settle(app.page);
  await resetRenders(app.page);
  return app;
}

/** Set board filters through the hash (pushState-equivalent; keeps c and m). null deletes a key. */
async function setFilters(page, patch) {
  await page.evaluate((patch) => {
    const p = new URLSearchParams(location.hash.slice(1));
    for (const [k, v] of Object.entries(patch)) {
      p.delete(k);
      if (v == null) continue;
      for (const x of [].concat(v)) p.append(k, x);
    }
    location.hash = p.toString();
  }, patch);
  await settle(page);
}

async function editTitle(page, text) {
  const input = page.locator('#compHost .ms-comp__input');
  await input.fill(text);
  await input.dispatchEvent('change');
  await settle(page);
}
async function pickWidget(page, which, value) {
  const sel = page.locator('#compHost select').nth(which === 'location' ? 0 : 1);
  const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));
  const hit = opts.find((o) => o.v === value) || opts.find((o) => o.t.toLowerCase().startsWith(String(value).toLowerCase()));
  assert(hit, `widget ${which} select has no option "${value}" (options: ${opts.slice(0, 8).map((o) => o.t).join(' | ')})`);
  await sel.selectOption(hit.v);
  await settle(page);
}

const salaried = (jobs) => jobs.filter((j) => j.salary);
const locKeys = (j) => (j.locations || []).map((l) => (l.remote ? l.name || 'Remote' : l.city || l.name));
const byIdOf = (api) => new Map(api.jobs.map((j) => [j.id, j]));
const resetBtn = (page) => page.locator('#compHost').getByRole('button', { name: /^Reset to filters$/i })
  .or(page.locator('#compHost').getByRole('link', { name: /^Reset to filters$/i }));

/** Parse the drawer Compstimate block ("≈ $X ($L–H, conf confidence)" + "Based on N similar roles …"). */
async function readDrawerComp(page) {
  const block = page.locator('#drawer .d-comp');
  if (!(await block.count())) return null;
  const t = (await block.innerText()).replace(/\s+/g, ' ');
  const mid = t.match(/≈\s*(\$[\d.,]+[KM]?)/);
  const rng = t.match(/\((\$[\d.,]+[KM]?)\s*[–-]\s*\$?([\d.,]+[KM]?)/);
  const conf = t.match(/,\s*([A-Za-z]+) confidence\)/);
  const n = t.match(/Based on (\d[\d,]*)/) || t.match(/from (\d[\d,]*) (?:comparable|similar)/);
  return { text: t, mid: mid && parseMoney(mid[1]), low: rng && parseMoney(rng[1]), high: rng && parseMoney('$' + rng[2].replace(/^\$/, '')), conf: conf && conf[1].toLowerCase(), n: n && Number(n[1].replace(/,/g, '')) };
}
const widgetNums = (c) => c && { mid: parseMoney(c.hero), low: parseMoney(c.low), high: parseMoney(c.high), conf: (c.conf || '').replace(/ confidence$/i, '').toLowerCase(), n: c.n };
function sameNums(a, b, label) {
  assert(a && b, `${label}: missing estimate (widget ${JSON.stringify(a)}, drawer ${JSON.stringify(b)})`);
  for (const k of ['mid', 'low', 'high']) assert(Math.abs(a[k] - b[k]) <= 1000, `${label}: ${k} widget ${a[k]} vs drawer ${b[k]}`);
  assertEq(a.n, b.n, `${label}: n`);
  assertEq(a.conf, b.conf, `${label}: confidence`);
}

function registerCompstimateTests(suite) {
  suite.test('Compstimate: T1 baseline (no level word in title, Any level, basis "Based on N similar roles at Anthropic")', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const c = await readComp(page);
      assert(c.title && !LEVEL_WORD.test(c.title), `auto title carries a level word: "${c.title}"`);
      assertEq(c.level.value, '', 'Level value');
      assert(/^Any level$/i.test(c.level.text), `Level text "${c.level.text}"`);
      assert(!/\bat (Intern|Entry|Mid|Senior|Staff\+|Manager|Director\+) level\b/.test(c.explain || ''), `explanation names a level: "${c.explain}"`);
      assert(c.basis && /^Based on \d[\d,]* similar roles at Anthropic\b/.test(c.basis), `basis "${c.basis}"`);
      ctx.compT1 = { fields: fields(c), numbers: numbers(c) };
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T2 Department = Sales narrows (real checkbox); untick restores T1', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const before = await readComp(page);
      const api = await apiJobs(ctx, 'anthropic');
      const byId = byIdOf(api);
      await filterSection(page, 'Department').locator('label.check').filter({ has: page.locator('.check-label', { hasText: /^Sales$/ }) }).first().click();
      await settle(page);
      const c = await readComp(page);
      assert(c.title !== before.title, `title did not change with Department = Sales ("${c.title}")`);
      assert(c.basis && /, Sales$/.test(c.basis), `basis should end ", Sales": "${c.basis}"`);
      const off = c.items.filter((i) => byId.get(i.id)?.department !== 'Sales');
      assert(c.items.length > 0 && off.length === 0, `${off.length}/${c.items.length} comparables outside Sales: ${off.map((i) => i.meta).join(' | ')}`);
      await filterSection(page, 'Department').locator('label.check').filter({ has: page.locator('.check-label', { hasText: /^Sales$/ }) }).first().click();
      await settle(page);
      const back = await readComp(page);
      assertEq(JSON.stringify(numbers(back)), JSON.stringify(numbers(before)), 'untick restores numbers');
      assertEq(JSON.stringify(fields(back)), JSON.stringify(fields(before)), 'untick restores fields');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T3 two departments (Sales + Finance) — basis lists both, comparables only from them', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await setFilters(page, { d: ['Sales', 'Finance'] });
      const c = await readComp(page);
      const byId = byIdOf(await apiJobs(ctx, 'anthropic'));
      assert(c.basis && /Sales/.test(c.basis) && /Finance/.test(c.basis), `basis "${c.basis}"`);
      const off = c.items.filter((i) => !['Sales', 'Finance'].includes(byId.get(i.id)?.department));
      assert(c.items.length && !off.length, `${off.length} comparables outside Sales/Finance: ${off.map((i) => i.meta).join(' | ')}`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T4 seniority — one level shows it; two levels show "Senior or Staff+ (filters)"', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const byId = byIdOf(await apiJobs(ctx, 'anthropic'));
      await setFilters(page, { s: 'Senior' });
      let c = await readComp(page);
      assertEq(c.level.value, 'Senior', 'Level follows s=Senior');
      let off = c.items.filter((i) => byId.get(i.id)?.seniority !== 'Senior');
      assert(c.items.length && !off.length, `${off.length}/${c.items.length} comparables not Senior: ${off.map((i) => i.meta).join(' | ')}`);
      await setFilters(page, { s: ['Senior', 'Staff+'] });
      c = await readComp(page);
      assert(/Senior or Staff\+ \(filters\)/.test(c.level.text), `Level text "${c.level.text}"`);
      off = c.items.filter((i) => !['Senior', 'Staff+'].includes(byId.get(i.id)?.seniority));
      assert(c.items.length && !off.length, `${off.length} comparables outside Senior/Staff+: ${off.map((i) => i.meta).join(' | ')}`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T5 location — London shows London (all comparables list it); "Remote (US)" is not "Any location"', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const byId = byIdOf(await apiJobs(ctx, 'anthropic'));
      await setFilters(page, { l: 'London' });
      let c = await readComp(page);
      assertEq(c.location.value, 'London', 'Location follows l=London');
      const off = c.items.filter((i) => !locKeys(byId.get(i.id) || {}).includes('London'));
      assert(c.items.length && !off.length, `${off.length}/${c.items.length} comparables don't list London: ${off.map((i) => i.meta).join(' | ')}`);
      assert(c.items.every((i) => /London/.test(i.meta)), `comparable meta should show the matching location: ${c.items.map((i) => i.meta).join(' | ')}`);
      await setFilters(page, { l: 'Remote (US)' });
      c = await readComp(page);
      assertEq(c.location.value, 'Remote (US)', 'Location follows l=Remote (US)');
      assert(!/^Any location$/i.test(c.location.text), `Location text "${c.location.text}"`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T6 Remote only — Location shows "Remote (filters)", comparables all remote', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const byId = byIdOf(await apiJobs(ctx, 'anthropic'));
      await setFilters(page, { r: 'remote' });
      const c = await readComp(page);
      assert(/^Remote( \(filters\))?$/.test(c.location.text) && /Remote/.test(c.location.text), `Location text "${c.location.text}"`);
      assert(/\(filters\)/.test(c.location.text) || c.location.value === 'Remote', `Location should read "Remote (filters)" (got "${c.location.text}")`);
      const off = c.items.filter((i) => !byId.get(i.id)?.remote);
      assert(c.items.length && !off.length, `${off.length} comparables not remote: ${off.map((i) => i.meta).join(' | ')}`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T7 London + Senior — "Not enough comparable roles", no figure, no confidence', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await setFilters(page, { l: 'London', s: 'Senior' });
      const c = await readComp(page);
      assert(c.notEnough, `expected "Not enough comparable roles"; got hero ${c.hero}, basis "${c.basis}"`);
      assertEq(c.hero, null, 'no .ms-comp__hero');
      assertEq(c.conf, null, 'no confidence label');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T8 salary filters never change the estimate (0 renders)', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const rec = numbers(await readComp(page));
      await resetRenders(page);
      const lo = filterSection(page, 'Salary').locator('input.range--lo');
      await lo.evaluate((e) => { e.value = '300000'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      await settle(page);
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(rec), 'after min slider $300K');
      await filterSection(page, 'Salary').locator('input.switch').click();
      await settle(page);
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(rec), 'after "listed only"');
      await setFilters(page, { smax: '400000' });
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(rec), 'after smax');
      assertEq(await renders(page), 0, 'widget renders during salary changes');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T9 chips never narrow the pool (edited title: identical; following: title from filtered list, no chip in basis)', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await editTitle(page, 'Research Engineer');
      const rec = numbers(await readComp(page));
      const api = await apiJobs(ctx, 'anthropic');
      const resp = api.jobs.flatMap((j) => j.keywords.responsibilities)[0];
      await setFilters(page, { ks: 'Python' });
      await setFilters(page, { kr: resp });
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(rec), 'edited title: chips change the numbers');
      // Following title on a fresh page.
      await page.evaluate(() => { location.hash = 'c=anthropic&m=insights'; });
      await page.reload(); await waitReady(page); await installRenderCounter(page);
      await page.waitForFunction(() => document.querySelector('#compHost .ms-comp__result')?.childElementCount > 0);
      await setFilters(page, { ks: 'Python' });
      const c = await readComp(page);
      const filtered = api.jobs.filter((j) => j.keywords.skills.includes('Python'));
      assert(c.title && filtered.some((j) => j.title.toLowerCase().includes(c.title.toLowerCase())), `following title "${c.title}" is not a role among the ${filtered.length} Python jobs`);
      assert(c.basis && !/Python/.test(c.basis), `basis names the chip: "${c.basis}"`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T10 search — never used verbatim as the title; typing never flashes "No estimate yet"', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await setFilters(page, { q: 'python' });
      let c = await readComp(page);
      assert(c.title && c.title.toLowerCase() !== 'python', `title is the raw search "${c.title}"`);
      assert(c.hero && !c.noEstimateYet, `no estimate for search "python" (${c.notEnough ? 'not enough' : 'no estimate yet'})`);
      await setFilters(page, { q: 'London' });
      c = await readComp(page);
      assert(c.title && c.title.toLowerCase() !== 'london', `title is the raw search "${c.title}"`);
      await setFilters(page, { q: null });
      await resetRenders(page);
      await page.evaluate(() => {
        window.__commits = 0;
        const wrap = (fn) => function (...a) { const before = location.hash; const r = fn.apply(this, a); if (location.hash !== before) window.__commits++; return r; };
        history.replaceState = wrap(history.replaceState); history.pushState = wrap(history.pushState);
      });
      await page.locator('#search').click();
      await page.keyboard.type('Product Manager', { delay: 50 });
      await settle(page, { quiet: 600 });
      const saw = await page.evaluate(() => window.__compSaw);
      const commits = await page.evaluate(() => window.__commits);
      assert(!saw.some((t) => /No estimate yet/i.test(t)), `"No estimate yet" flashed while typing (${saw.filter((t) => /No estimate yet/i.test(t)).length}×)`);
      const n = await renders(page);
      assert(n <= Math.max(1, commits), `${n} widget renders for ${commits} committed searches`);
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T11 an edited title sticks through filters, search, Clear all, Back, Forward', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await setFilters(page, { s: 'Senior', l: 'London' });
      await editTitle(page, 'Research Engineer');
      assert(await resetBtn(page).first().isVisible(), '"Reset to filters" link not shown after an edit');
      const steps = [
        ['add Department Sales', () => setFilters(page, { d: 'Sales' })],
        ['untick Senior', () => setFilters(page, { s: null })],
        ['change search', () => setFilters(page, { q: 'safety' })],
        ['Clear all', async () => { await page.locator('#clearAll').click(); await settle(page); }],
        ['Back', async () => { await page.goBack(); await settle(page); }],
        ['Forward', async () => { await page.goForward(); await settle(page); }],
      ];
      for (const [name, fn] of steps) {
        await fn();
        assertEq((await readComp(page)).title, 'Research Engineer', `title after "${name}"`);
      }
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T12 edited Location and Level stick through filter changes', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await pickWidget(page, 'location', 'Seattle');
      await pickWidget(page, 'level', 'Staff+');
      for (const patch of [{ l: 'London' }, { l: null }, { s: 'Senior' }, { s: null }]) {
        await setFilters(page, patch);
        const c = await readComp(page);
        assertEq(c.location.value, 'Seattle', `Location after ${JSON.stringify(patch)}`);
        assertEq(c.level.value, 'Staff+', `Level after ${JSON.stringify(patch)}`);
      }
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T13 "Reset to filters" returns every field to the filters (equals a fresh load); T14 at most one link', async (ctx) => {
    const { page, errors, context, close } = await openComp(ctx);
    try {
      await setFilters(page, { s: 'Senior', d: 'Sales' });
      await editTitle(page, 'Research Engineer');
      await pickWidget(page, 'location', 'Seattle');
      let c = await readComp(page);
      assert(c.resetLinks <= 1, `${c.resetLinks} "Reset to filters" links`);
      const link = resetBtn(page).first();
      assert(await link.isVisible(), 'reset link not visible while edited');
      await link.click();
      await settle(page);
      c = await readComp(page);
      assertEq(c.resetLinks, 0, 'reset link hidden after reset');
      const hash = await page.evaluate(() => location.hash);
      const page2 = await context.newPage();
      await page2.goto(`${ctx.baseUrl}/${hash}`);
      await waitReady(page2);
      await page2.waitForFunction(() => document.querySelector('#compHost .ms-comp__result')?.childElementCount > 0, null, { timeout: 15000 });
      await page2.waitForTimeout(800);
      const fresh = await readComp(page2);
      assertEq(JSON.stringify(fields(c)), JSON.stringify(fields(fresh)), 'fields after reset vs fresh load');
      assertEq(JSON.stringify(numbers(c)), JSON.stringify(numbers(fresh)), 'numbers after reset vs fresh load');
      await page2.close();
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T15 drawer equals Insights (AE - DNB with Senior+London set; 3 OpenAI no-salary jobs)', async (ctx) => {
    const cases = [['anthropic', 'anthropic:5391376008', { s: 'Senior', l: 'London' }]];
    const oa = await apiJobs(ctx, 'openai');
    const noSal = oa.jobs.filter((j) => !j.salary);
    for (const i of [0, Math.floor(noSal.length / 2), noSal.length - 1]) if (noSal[i]) cases.push(['openai', noSal[i].id, {}]);
    const problems = [];
    for (const [slug, id, filters] of cases) {
      const api = await apiJobs(ctx, slug);
      const job = api.jobs.find((j) => j.id === id);
      if (!job) { problems.push(`${id} not in /api/jobs`); continue; }
      const { page, close } = await openComp(ctx, `c=${slug}&m=insights`);
      try {
        await setFilters(page, filters);
        const before = await readComp(page);
        await resetRenders(page);
        await setFilters(page, { job: id });
        await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
        await page.waitForTimeout(600);
        const drawer = await readDrawerComp(page);
        const during = await readComp(page);
        if (JSON.stringify(numbers(during)) !== JSON.stringify(numbers(before)) || JSON.stringify(fields(during)) !== JSON.stringify(fields(before))) problems.push(`${id}: opening the drawer changed Insights (${before.title} -> ${during.title})`);
        if (!drawer) { problems.push(`${id}: no drawer Compstimate`); continue; }
        await page.keyboard.press('Escape');
        await page.locator('#drawer').waitFor({ state: 'hidden', timeout: 3000 });
        const onsite = (job.locations || []).find((l) => !l.remote);
        const loc = onsite ? onsite.city || onsite.name : 'Remote';
        await editTitle(page, job.title);
        await pickWidget(page, 'location', loc);
        await pickWidget(page, 'level', job.seniority);
        try { sameNums(widgetNums(await readComp(page)), drawer, `${id} (${job.title} · ${loc} · ${job.seniority})`); } catch (e) { problems.push(e.message); }
      } catch (e) { problems.push(`${id}: ${e.message}`); } finally { await close(); }
    }
    assert(problems.length === 0, problems.join('\n'));
  });

  suite.test('Compstimate: T16 opening a comparable, Esc and a Sort change never touch Insights (0 renders)', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const rec = await readComp(page);
      await resetRenders(page);
      await page.locator('#compHost .ms-comp__item').first().click();
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(400);
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(numbers(rec)), 'after opening a comparable');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(numbers(rec)), 'after Esc');
      await page.locator('#sortBy').selectOption('title');
      await settle(page);
      assertEq(JSON.stringify(numbers(await readComp(page))), JSON.stringify(numbers(rec)), 'after Sort change');
      assertEq(JSON.stringify(fields(await readComp(page))), JSON.stringify(fields(rec)), 'fields unchanged');
      assertEq(await renders(page), 0, 'widget renders');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T17 a drawer keyword chip leaves the drawer estimate unchanged', async (ctx) => {
    const { page, errors, close } = await openComp(ctx, 'c=anthropic&m=insights&job=anthropic%3A5391376008');
    try {
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForTimeout(600);
      const d0 = await readDrawerComp(page);
      assert(d0, 'no drawer Compstimate for the no-salary job');
      const w0 = await readComp(page);
      const chip = page.locator('#drawer .kw').first();
      await chip.scrollIntoViewIfNeeded();
      await chip.click();
      await settle(page);
      const d1 = await readDrawerComp(page);
      assertEq(JSON.stringify(d1 && { ...d1, text: undefined }), JSON.stringify({ ...d0, text: undefined }), 'drawer estimate after a chip');
      const w1 = await readComp(page);
      assertEq(w1.location.value, w0.location.value, 'Insights Location unchanged');
      assertEq(w1.level.value, w0.level.value, 'Insights Level unchanged');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T18 Back/Forward restore the following fields and output exactly (1 render per step)', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      await setFilters(page, { s: 'Senior', l: 'London', q: 'Software Engineer' });
      const A = await readComp(page);
      await page.locator('#clearAll').click();
      await settle(page);
      const B = await readComp(page);
      await resetRenders(page);
      await page.goBack(); await settle(page);
      let c = await readComp(page);
      assertEq(JSON.stringify([fields(c), numbers(c)]), JSON.stringify([fields(A), numbers(A)]), 'Back restores A');
      assertEq(await renders(page), 1, 'renders on Back');
      await resetRenders(page);
      await page.goForward(); await settle(page);
      c = await readComp(page);
      assertEq(JSON.stringify([fields(c), numbers(c)]), JSON.stringify([fields(B), numbers(B)]), 'Forward restores B');
      assertEq(await renders(page), 1, 'renders on Forward');
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T19 company switches re-derive the auto title + accuracy (1 render each); an edited title survives', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      const problems = [];
      for (const slug of ['openai', 'cohere', 'xai']) {
        const meta = (await apiJobs(ctx, slug)).meta?.compstimate;
        await resetRenders(page);
        await setFilters(page, { c: slug });
        await page.waitForFunction((s) => document.querySelector(`#resultsList .card[data-id^="${s}:"]`), slug, { timeout: 20000 });
        await settle(page);
        const c = await readComp(page);
        const r = await renders(page);
        if (r !== 1) problems.push(`${slug}: ${r} renders on switch`);
        if (!c.title || LEVEL_WORD.test(c.title)) problems.push(`${slug}: auto title "${c.title}"`);
        if (meta?.n && !(c.accuracy || '').includes(String(meta.n))) problems.push(`${slug}: accuracy "${c.accuracy}" does not name backtest n=${meta.n}`);
      }
      await editTitle(page, 'Research Engineer');
      for (const slug of ['anthropic', 'openai']) {
        await setFilters(page, { c: slug });
        await page.waitForFunction((s) => document.querySelector(`#resultsList .card[data-id^="${s}:"]`), slug, { timeout: 20000 });
        await settle(page);
        const t = (await readComp(page)).title;
        if (t !== 'Research Engineer') problems.push(`edited title lost on switch to ${slug}: "${t}"`);
      }
      assert(problems.length === 0, problems.join('\n'));
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T20 "Same role elsewhere" -> OpenAI sets rf=swe&s=Senior; Level Senior; basis at OpenAI; Back reopens the drawer', async (ctx) => {
    const { roleFamily } = await lib('features/roles.js');
    const api = await apiJobs(ctx, 'anthropic');
    const job = api.jobs.find((j) => j.salary && j.seniority === 'Senior' && roleFamily(j.title, j) === 'swe');
    assert(job, 'no salaried Senior software engineer at Anthropic');
    const { page, errors, close } = await openComp(ctx, `c=anthropic&m=insights&job=${encodeURIComponent(job.id)}`);
    try {
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
      const row = page.locator('#drawer .ms-comps__row').filter({ hasText: 'OpenAI' }).first();
      await row.waitFor({ timeout: 10000 });
      await row.click();
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('c') === 'openai', null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelector('#resultsList .card[data-id^="openai:"], #resultsList .list-empty'), null, { timeout: 20000 });
      await settle(page);
      const hp = await hashParams(page);
      assertEq(hp.get('rf'), 'swe', 'hash rf');
      assertEq(hp.getAll('s').join(','), 'Senior', 'hash s');
      const c = await readComp(page);
      assertEq(c.level.value, 'Senior', 'Level shows Senior');
      assert(c.basis && /at OpenAI/.test(c.basis) && /Senior/.test(c.basis), `basis "${c.basis}"`);
      await page.goBack();
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('c') === 'anthropic', null, { timeout: 10000 });
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 10000 });
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: T21 cold server — the accuracy line appears within 10 s without user action', async (ctx) => {
    const { mkdtempSync } = await import('node:fs');
    const os = await import('node:os');
    const { startServer } = await import('./harness.js');
    const cache = mkdtempSync(path.join(os.tmpdir(), 'melon-cold-cache-'));
    const hist = mkdtempSync(path.join(os.tmpdir(), 'melon-cold-hist-'));
    const cold = await startServer({ env: { MELON_CACHE_DIR: cache, MELON_HISTORY_DIR: hist } });
    ctx.cleanup.push(() => cold.stop());
    const { page, close } = await openComp({ ...ctx, baseUrl: cold.baseUrl }, 'c=anduril&m=insights');
    try {
      const first = await readComp(page);
      const t0 = Date.now();
      let c = first;
      while (Date.now() - t0 < 10000 && !c.accuracy) { await page.waitForTimeout(500); c = await readComp(page); }
      assert(c.accuracy, `no accuracy line ${Math.round((Date.now() - t0) / 1000)} s after the first estimate (first visit on a cold server)`);
      assertEq(JSON.stringify(fields(c)), JSON.stringify(fields(first)), 'other fields unchanged when the accuracy arrives');
    } finally { await close(); }
  });

  suite.test('Compstimate: T22 FX — USD hero and "*" footnote (Cohere CAD, Anthropic London); drawer says approx USD; salaryUSD == palette toUSD', async (ctx) => {
    const problems = [];
    for (const [hash, label] of [['c=cohere&m=insights', 'Cohere'], ['c=anthropic&m=insights&l=London', 'Anthropic London']]) {
      const { page, close } = await openComp(ctx, hash);
      try {
        const c = await readComp(page);
        if (!/USD/.test(c.per || '')) problems.push(`${label}: hero unit "${c.per}"`);
        if (!c.foot || !/\*/.test(c.foot)) problems.push(`${label}: no "*" converted footnote (foot "${c.foot}")`);
      } finally { await close(); }
    }
    const { page, close } = await openComp(ctx, 'c=anthropic&m=insights&job=anthropic%3A5391376008');
    try {
      await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
      const d = await readDrawerComp(page);
      if (!d || !/approx USD/.test(d.text)) problems.push(`drawer Compstimate lacks "approx USD": "${d && d.text}"`);
    } finally { await close(); }
    const shared = await lib('features/shared.js');
    const { toUSD } = await lib('viz/palette.js');
    for (const slug of ['anthropic', 'openai', 'cohere']) {
      for (const j of salaried((await apiJobs(ctx, slug)).jobs)) {
        const s = shared.salaryUSD(j);
        const mid = (j.salary.min + j.salary.max) / 2;
        const p = toUSD(mid, j.salary.currency);
        if (!s || Math.abs(s.mid - p) > Math.max(1, p * 0.005)) { problems.push(`${slug} ${j.salary.currency}: salaryUSD ${s && Math.round(s.mid)} vs palette ${Math.round(p)}`); break; }
      }
    }
    assert(problems.length === 0, [...new Set(problems)].join('\n'));
  });

  suite.test('Compstimate: T23 no "on this board" copy while a role-defining filter is active', async (ctx) => {
    const { page, errors, close } = await openComp(ctx);
    try {
      for (const patch of [{ d: 'Sales' }, { d: null, s: 'Senior' }, { s: null, l: 'London' }]) {
        await setFilters(page, patch);
        const t = (await readComp(page)).text;
        const i = t.toLowerCase().indexOf('on this board');
        assert(i < 0, `widget says "on this board" with ${JSON.stringify(patch)}: "…${t.slice(Math.max(0, i - 80), i + 20).replace(/\s+/g, ' ')}…"`);
      }
      noErrors(errors);
    } finally { await close(); }
  });

  suite.test('Compstimate: consistency — drawer estimate equals Insights for the same role query (no filters, 3 Anthropic no-salary jobs)', async (ctx) => {
    const api = await apiJobs(ctx, 'anthropic');
    const pool = api.jobs.filter((j) => !j.salary && !j.salaryFlag);
    // Spread picks across the list; a job whose drawer has no estimate (Rule 6) is skipped, until 3 compared.
    const order = [...pool.keys()].sort((a, b) => ((a * 7919) % pool.length) - ((b * 7919) % pool.length));
    const problems = [];
    let compared = 0;
    for (const idx of order) {
      if (compared >= 3) break;
      const job = pool[idx];
      const { page, close } = await openComp(ctx, `c=anthropic&m=insights&job=${encodeURIComponent(job.id)}`);
      try {
        await page.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
        await page.waitForTimeout(600);
        const d = await readDrawerComp(page);
        if (!d) continue; // Rule 6: not enough comparable roles -> no drawer block
        compared++;
        await page.keyboard.press('Escape');
        await page.locator('#drawer').waitFor({ state: 'hidden', timeout: 3000 });
        const onsite = (job.locations || []).find((l) => !l.remote);
        await editTitle(page, job.title);
        await pickWidget(page, 'location', onsite ? onsite.city || onsite.name : 'Remote');
        await pickWidget(page, 'level', job.seniority);
        sameNums(widgetNums(await readComp(page)), d, `${job.title}`);
      } catch (e) { problems.push(`${job.id}: ${e.message}`); } finally { await close(); }
    }
    assert(compared >= 1, 'no no-salary Anthropic job had a drawer estimate');
    assert(problems.length === 0, problems.join('\n'));
  });
}

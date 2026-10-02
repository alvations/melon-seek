// Browser e2e checks (Playwright Chromium) against the real server.
// Selectors come from public/index.html + public/app.js + public/viz/*.js (read-only);
// roles/text are preferred, ids are used for app-owned containers.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { ROOT, assert, assertEq } from './harness.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const DESKTOP = { width: 1440, height: 900 };
const READY_TIMEOUT = 15000;

/** Hosts we expect to be unreachable in the sandbox (fonts, map tiles, boards). */
function isExternal(url, baseUrl) {
  return !!url && !url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:');
}

async function openApp(ctx, { hash = '', viewport = DESKTOP, colorScheme = 'light' } = {}) {
  const context = await ctx.browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
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
    if (!isExternal(req.url(), ctx.baseUrl)) errors.push(`requestfailed: ${req.url()} ${req.failure() && req.failure().errorText}`);
  });
  page.on('response', (res) => {
    if (!isExternal(res.url(), ctx.baseUrl) && res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  await page.goto(`${ctx.baseUrl}/${hash ? `#${hash}` : ''}`);
  await waitReady(page);
  return { context, page, errors, close: () => context.close() };
}

/** Wait until the results header shows a count ("N roles"). */
async function waitReady(page) {
  await page.locator('#resultsTitle strong').first().waitFor({ timeout: READY_TIMEOUT });
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

/** The Chart/Map toggle button in the "View" group. */
function modeBtn(page, mode) {
  return page.getByRole('group', { name: 'View' }).getByRole('button', { name: mode === 'map' ? 'Map' : 'Chart', exact: true });
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

export function registerUiTests(suite) {
  mkdirSync(SHOTS, { recursive: true });

  suite.test('UI: page loads with no console errors; chart default shows bars', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      assertEq(await modeBtn(page, 'chart').getAttribute('aria-pressed'), 'true', 'chart mode pressed by default');
      await page.locator('#chartHost .ms-row__bar').first().waitFor({ timeout: 8000 });
      const bars = await page.locator('#chartHost .ms-row__bar').count();
      assert(bars > 5, `only ${bars} chart bars`);
      assert(await page.locator('#mapHost').isHidden(), 'map host should be hidden in chart mode');
      const n = await resultCount(page);
      const api = await apiJobs(ctx, 'anthropic');
      assertEq(n, api.jobs.length, 'results count equals API job count with no filters');
      assert(/(^|&)c=anthropic(&|$)/.test(await page.evaluate(() => location.hash.slice(1))), 'hash should contain c=anthropic');
      if (api.mode === 'demo') {
        const banner = page.locator('#demoBanner');
        const badge = page.locator('#dataBadge');
        const shown = (await banner.isVisible()) || (await badge.isVisible() && /demo/i.test(await badge.innerText()));
        assert(shown, 'demo mode must be obviously marked in the UI (banner/badge)');
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, 'chart.png') });
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: map mode shows price pins (tiles offline)', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      await modeBtn(page, 'map').click();
      assertEq(await modeBtn(page, 'map').getAttribute('aria-pressed'), 'true', 'map pressed');
      await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 8000 });
      const pins = await page.locator('#mapHost .ms-pin').count();
      assert(pins >= 3, `only ${pins} pins`);
      assert(await page.locator('#chartHost').isHidden(), 'chart hidden in map mode');
      const box = await page.locator('#mapHost').boundingBox();
      assert(box && box.width > 300 && box.height > 200, `map host too small ${JSON.stringify(box)}`);
      assert(/(^|&)m=map(&|$)/.test(await page.evaluate(() => location.hash.slice(1))), 'hash has m=map');
      // Clicking a pin should narrow to an area.
      const before = await resultCount(page);
      await page.locator('#mapHost .ms-pin').last().click({ force: true });
      await page.waitForTimeout(500);
      const areaChip = page.locator('.area-chip').first();
      assert(await areaChip.isVisible().catch(() => false), 'clicking a pin should show an area chip');
      const after = await resultCount(page);
      assert(after <= before, `area select should not increase results (${before} -> ${after})`);
      await areaChip.locator('button').click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, 'map.png') });
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: switching company to Anduril and OpenAI updates results count', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const counts = { anthropic: await resultCount(page) };
      for (const [slug, name] of [['anduril', 'Anduril'], ['openai', 'OpenAI']]) {
        const prev = await resultCount(page);
        await page.locator('#companyPills').getByRole('button', { name: new RegExp(name) }).click();
        const api = await apiJobs(ctx, slug);
        let n = await countChange(page, prev, 8000);
        if (n === prev && api.jobs.length !== prev) throw new Error(`${name}: count stayed ${prev}`);
        await waitReady(page);
        n = await resultCount(page);
        assertEq(n, api.jobs.length, `${name} results count vs API`);
        assert(new RegExp(`(^|&)c=${slug}(&|$)`).test(await page.evaluate(() => location.hash.slice(1))), `hash c=${slug}`);
        assertEq(await page.locator('#companyPills').getByRole('button', { name: new RegExp(name) }).getAttribute('aria-pressed'), 'true', `${name} pill pressed`);
        const first = (await cardIds(page))[0];
        assert(first && first.startsWith(`${slug}:`), `first card id ${first} should belong to ${slug}`);
        counts[slug] = n;
      }
      assert(new Set(Object.values(counts)).size > 1, `counts identical across companies ${JSON.stringify(counts)}`);
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: salary min filter narrows list; cards satisfy it', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const before = await resultCount(page);
      const sec = filterSection(page, 'Salary');
      const lo = sec.locator('input.range--lo');
      const { min, max } = await lo.evaluate((e) => ({ min: Number(e.min), max: Number(e.max) }));
      assert(max > min, `salary slider domain empty ${min}-${max}`);
      const target = Math.round((min + (max - min) * 0.5) / 5000) * 5000;
      await lo.evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, target);
      const after = await countChange(page, before);
      assert(after < before && after > 0, `salary filter should narrow (before ${before}, after ${after})`);
      const hash = await page.evaluate(() => location.hash.slice(1));
      const smin = Number(new URLSearchParams(hash).get('smin'));
      assert(smin > 0, `hash should contain smin (got "${hash}")`);
      const api = await apiJobs(ctx, 'anthropic');
      const byId = new Map(api.jobs.map((j) => [j.id, j]));
      const bad = (await cardIds(page)).filter((id) => { const j = byId.get(id); return !j || !j.salary || j.salary.max < smin; });
      assert(bad.length === 0, `${bad.length} cards violate salary >= ${smin}: ${bad.slice(0, 3)}`);
      const expected = api.jobs.filter((j) => j.salary && j.salary.max >= smin).length;
      assertEq(after, expected, 'count vs API-computed salary filter');
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: Skills chip narrows list; every remaining job has that skill', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const before = await resultCount(page);
      const chip = filterSection(page, 'Skills').locator('button.kw').first();
      await chip.waitFor({ timeout: 5000 });
      const skill = await chip.getAttribute('data-kw');
      await chip.click();
      const after = await countChange(page, before);
      assert(after < before && after > 0, `skill "${skill}" should narrow (before ${before}, after ${after})`);
      assertEq(await filterSection(page, 'Skills').locator(`button.kw[data-kw="${skill}"]`).getAttribute('aria-pressed'), 'true', 'chip pressed');
      const api = await apiJobs(ctx, 'anthropic');
      const byId = new Map(api.jobs.map((j) => [j.id, j]));
      const ids = await cardIds(page);
      assertEq(ids.length, Math.min(after, 60), 'rendered cards vs count (page size 60)');
      const bad = ids.filter((id) => !byId.get(id)?.keywords.skills.includes(skill));
      assert(bad.length === 0, `${bad.length} cards lack skill "${skill}": ${bad.slice(0, 3)}`);
      assertEq(after, api.jobs.filter((j) => j.keywords.skills.includes(skill)).length, 'count vs API jobs with skill');
      assert(new URLSearchParams(await page.evaluate(() => location.hash.slice(1))).getAll('ks').includes(skill), 'hash has ks');
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: department filter', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const before = await resultCount(page);
      const sec = filterSection(page, 'Department');
      const row = sec.locator('label.check').nth(1);
      const dept = (await row.locator('.check-label').innerText()).trim();
      const expectedCount = Number((await row.locator('.check-count').innerText()).trim());
      await row.click();
      const after = await countChange(page, before);
      assert(after < before && after > 0, `department "${dept}" should narrow (${before} -> ${after})`);
      assertEq(after, expectedCount, 'count matches facet count shown next to the checkbox');
      const api = await apiJobs(ctx, 'anthropic');
      const byId = new Map(api.jobs.map((j) => [j.id, j]));
      const bad = (await cardIds(page)).filter((id) => (byId.get(id)?.department || 'Other') !== dept);
      assert(bad.length === 0, `${bad.length} cards not in "${dept}"`);
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: location filter', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const before = await resultCount(page);
      const sec = filterSection(page, 'Location');
      const rows = sec.locator('label.check');
      // Prefer a non-remote city
      let row = null;
      for (let i = 0; i < await rows.count(); i++) {
        const t = await rows.nth(i).locator('.check-label').innerText();
        if (!/remote/i.test(t)) { row = rows.nth(i); break; }
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
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: clicking a result opens drawer with Apply link', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const card = page.locator('#resultsList .card[data-id]').first();
      const id = await card.getAttribute('data-id');
      const title = (await card.locator('.card-title').innerText()).trim();
      await card.click();
      const drawer = page.getByRole('dialog', { name: title });
      await drawer.waitFor({ state: 'visible', timeout: 5000 });
      const apply = drawer.getByRole('link', { name: /apply/i });
      assert(await apply.isVisible(), 'Apply link not visible');
      const api = await apiJobs(ctx, 'anthropic');
      const job = api.jobs.find((j) => j.id === id);
      assertEq(await apply.getAttribute('href'), job.url, 'apply href = job.url');
      assertEq(await apply.getAttribute('target'), '_blank', 'apply opens in new tab');
      assert(/noopener/.test(await apply.getAttribute('rel') || ''), 'apply rel noopener');
      assertEq(new URLSearchParams(await page.evaluate(() => location.hash.slice(1))).get('job'), id, 'hash job=id');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, 'drawer.png') });
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'hidden', timeout: 3000 });
      assert(!new URLSearchParams(await page.evaluate(() => location.hash.slice(1))).get('job'), 'Escape clears job from hash');
      // No script execution from description HTML
      const scripts = await page.locator('#drawer script').count();
      assertEq(scripts, 0, 'drawer contains <script> elements');
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: URL hash round-trip (reload preserves filters, mode, drawer)', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      await page.locator('#companyPills').getByRole('button', { name: /OpenAI/ }).click();
      await page.waitForFunction(() => /(^|[#&])c=openai(&|$)/.test(location.hash));
      await waitReady(page);
      await page.waitForTimeout(300);
      const before = await resultCount(page);
      const chip = filterSection(page, 'Skills').locator('button.kw').first();
      const skill = await chip.getAttribute('data-kw');
      await chip.click();
      const n1 = await countChange(page, before);
      const dept = filterSection(page, 'Department').locator('label.check').first();
      await dept.click();
      const n2 = await countChange(page, n1);
      await modeBtn(page, 'map').click();
      await page.waitForTimeout(300);
      const hash = await page.evaluate(() => location.hash);
      const ids = await cardIds(page);
      await page.reload();
      await waitReady(page);
      await page.waitForTimeout(500);
      assertEq(await page.evaluate(() => location.hash), hash, 'hash after reload');
      assertEq(await resultCount(page), n2, 'result count after reload');
      assertEq(JSON.stringify(await cardIds(page)), JSON.stringify(ids), 'card order after reload');
      assertEq(await modeBtn(page, 'map').getAttribute('aria-pressed'), 'true', 'map mode after reload');
      assertEq(await filterSection(page, 'Skills').locator(`button.kw[data-kw="${skill}"]`).getAttribute('aria-pressed'), 'true', 'skill chip after reload');
      assert(await filterSection(page, 'Department').locator('input[type=checkbox]:checked').count() === 1, 'dept checkbox after reload');
      assertEq(await page.locator('#companyPills').getByRole('button', { name: /OpenAI/ }).getAttribute('aria-pressed'), 'true', 'company after reload');
      // Deep link to a job opens the drawer.
      const jid = ids[0];
      const page2 = await app.context.newPage();
      await page2.goto(`${ctx.baseUrl}/#c=openai&job=${encodeURIComponent(jid)}`);
      await page2.locator('#drawer').waitFor({ state: 'visible', timeout: 8000 });
      const t = await page2.locator('#drawerTitle').innerText();
      const api = await apiJobs(ctx, 'openai');
      assertEq(t.trim(), api.jobs.find((j) => j.id === jid).title.trim(), 'deep-linked drawer title');
      // Back button undoes the last change (map -> chart).
      await page.goBack();
      await page.waitForTimeout(500);
      assertEq(await modeBtn(page, 'chart').getAttribute('aria-pressed'), 'true', 'history back restores chart mode');
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: mobile 390x844 renders without horizontal scroll', async (ctx) => {
    const app = await openApp(ctx, { viewport: { width: 390, height: 844 } });
    try {
      const { page, errors } = app;
      await page.waitForTimeout(500);
      const m = await noHScroll(page);
      assert(m.scrollWidth <= m.clientWidth && m.bodyScroll <= m.clientWidth,
        `horizontal overflow: scrollWidth=${m.scrollWidth} body=${m.bodyScroll} client=${m.clientWidth}; offenders: ${m.offenders.join(', ')}`);
      await page.screenshot({ path: path.join(SHOTS, 'mobile.png') });
      // Map mode and the filter sheet on mobile shouldn't overflow either.
      await modeBtn(page, 'map').click();
      await page.waitForTimeout(500);
      const m2 = await noHScroll(page);
      assert(m2.scrollWidth <= m2.clientWidth, `map mode overflow: ${m2.scrollWidth} > ${m2.clientWidth}; ${m2.offenders.join(', ')}`);
      await page.locator('#filtersToggle').click();
      await page.waitForTimeout(400);
      assert(await page.locator('#filters').isVisible(), 'filters panel opens on mobile');
      const m3 = await noHScroll(page);
      assert(m3.scrollWidth <= m3.clientWidth, `filters open overflow: ${m3.scrollWidth} > ${m3.clientWidth}`);
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: dark mode renders dark (screenshot)', async (ctx) => {
    const app = await openApp(ctx, { colorScheme: 'dark' });
    try {
      const { page, errors } = app;
      await page.waitForTimeout(500);
      const lum = await page.evaluate(() => {
        const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const pick = (el) => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; const v = parse(c); if (v.length && (v.length < 4 || v[3] > 0)) return v; e = e.parentElement; } return [255, 255, 255]; };
        const L = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const fg = parse(getComputedStyle(document.body).color);
        return { body: L(pick(document.body)), results: L(pick(document.querySelector('#results'))), fg: L(fg) };
      });
      assert(lum.body < 0.3, `body background not dark (luminance ${lum.body.toFixed(2)})`);
      assert(lum.results < 0.35, `results panel not dark (luminance ${lum.results.toFixed(2)})`);
      assert(lum.fg > 0.6, `body text not light in dark mode (luminance ${lum.fg.toFixed(2)})`);
      await page.screenshot({ path: path.join(SHOTS, 'dark.png') });
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: custom board via "Add board" loads demo jobs', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      await page.getByRole('button', { name: /add board/i }).click();
      const pop = page.locator('#popover');
      await pop.waitFor({ state: 'visible' });
      await pop.getByLabel('Source').selectOption('greenhouse');
      await pop.getByLabel('Board slug').fill('foo');
      await pop.getByLabel(/Display name/).fill('Foo Corp');
      await pop.getByRole('button', { name: /add & open/i }).click();
      await page.waitForFunction(() => /c=greenhouse%3Afoo|c=greenhouse:foo/.test(location.hash), null, { timeout: 5000 });
      await waitReady(page);
      await page.waitForTimeout(300);
      const n = await resultCount(page);
      assert(n > 0, 'custom board has no results');
      assert(await page.locator('#companyPills').getByRole('button', { name: /Foo Corp/ }).isVisible(), 'Foo Corp pill visible');
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });

  suite.test('UI: search box filters by text', async (ctx) => {
    const app = await openApp(ctx);
    try {
      const { page, errors } = app;
      const before = await resultCount(page);
      const api = await apiJobs(ctx, 'anthropic');
      const word = api.jobs[0].title.split(/[\s,]+/).find((w) => w.length > 4) || 'Engineer';
      await page.getByRole('searchbox', { name: /search roles/i }).fill(word);
      const after = await countChange(page, before);
      assert(after > 0 && after <= before, `search "${word}" gave ${after}`);
      const titles = await page.locator('#resultsList .card-title').allInnerTexts();
      assert(titles.length > 0, 'no cards after search');
      assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
    } finally { await app.close(); }
  });
}

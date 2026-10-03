// Mobile QA e2e checks (docs/QA.md "Full QA pass (mobile) 2026-10-03", docs/process/qa-mobile.md).
// Phone emulation: isMobile + hasTouch + DPR 3 with an iPhone UA; gestures use real touch input
// (page.touchscreen.tap and CDP Input.dispatchTouchEvent). Runs against the real server that
// scripts/e2e.js starts. Tests tagged "[M-n]" encode an open bug from that report and are
// expected to fail until it is fixed; the rest guard flows that work today.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { ROOT, assert, assertEq } from './harness.js';

const SHOTS = path.join(ROOT, 'docs', 'screenshots', 'qa-mobile');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isExternal = (url, base) => !!url && !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:');

async function openPhone(ctx, { hash = 'c=anthropic', viewport = PORTRAIT, colorScheme = 'light' } = {}) {
  const context = await ctx.browser.newContext({ viewport, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => isExternal(u.href, ctx.baseUrl), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && isExternal(loc, ctx.baseUrl)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  const cdp = await context.newCDPSession(page);
  await page.goto(`${ctx.baseUrl}/${hash ? `#${hash}` : ''}`);
  await page.waitForSelector('#resultsList .card[data-id]', { timeout: 30000 });
  await sleep(800);
  return { context, page, cdp, errors };
}

async function touchDrag(cdp, x0, y0, x1, y1, { steps = 12, stepMs = 16, rest = 150 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }] });
    await sleep(stepMs);
  }
  if (rest) await sleep(rest);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
}

async function tapSel(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  assert(b, `${sel} has no box`);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(450);
}

async function chipIntoView(page, id) {
  await page.evaluate((id) => document.querySelector(`#quickChips [data-pop=${id}]`).scrollIntoView({ inline: 'center' }), id);
  await sleep(250);
}

const count = (s) => Number(String(s).replace(/,/g, '').match(/(\d+)/)?.[1]);

export function registerMobileQaTests(suite) {
  mkdirSync(SHOTS, { recursive: true });

  suite.test('Mobile QA: quick chips open the filter sheet at their section; "Show N roles" equals the result count', async (ctx) => {
    const { page, errors } = await openPhone(ctx);
    const titles = { salary: 'Salary', dept: 'Department', loc: 'Location', sen: 'Seniority', remote: 'Remote' };
    for (const [id, title] of Object.entries(titles)) {
      await chipIntoView(page, id);
      await tapSel(page, `#quickChips [data-pop=${id}]`);
      const top = await page.evaluate(() => [...document.querySelectorAll('#filters .fsec')]
        .find((s) => { const r = s.getBoundingClientRect(); return r.top >= 0 && r.top < 200; })?.querySelector('.fsec-title')?.textContent);
      assert(await page.evaluate(() => document.body.classList.contains('filters-open')), `${id}: filter sheet did not open`);
      assertEq(top, title, `${id}: section at the top of the sheet`);
      await tapSel(page, '#filtersClose');
    }
    await chipIntoView(page, 'dept');
    await tapSel(page, '#quickChips [data-pop=dept]');
    const row = page.locator('#filters .fsec').nth(1).locator('label.check').first();
    const facet = count((await row.innerText()).split('\n').pop());
    await row.tap();
    await sleep(600);
    const label = await page.textContent('#filtersDone');
    assertEq(count(label), facet, '"Show N roles" equals the facet count');
    await tapSel(page, '#filtersDone');
    assertEq(count(await page.textContent('#resultsTitle')), facet, 'results title after "Show N roles"');
    assertEq(errors.length, 0, `errors: ${errors.join(' | ')}`);
  });

  suite.test('Mobile QA: salary slider follows a touch drag (smin set, list narrows)', async (ctx) => {
    const { page, cdp } = await openPhone(ctx);
    await tapSel(page, '#filtersToggle');
    const r = await page.locator('#filters .range--lo').boundingBox();
    const before = count(await page.textContent('#filtersDone'));
    await touchDrag(cdp, r.x + 14, r.y + r.height / 2, r.x + r.width * 0.4, r.y + r.height / 2, { rest: 80 });
    const hash = await page.evaluate(() => location.hash);
    assert(/smin=\d+/.test(hash), `smin not in hash: ${hash}`);
    const after = count(await page.textContent('#filtersDone'));
    assert(after < before, `count did not narrow: ${before} -> ${after}`);
  });

  suite.test('Mobile QA: results sheet drags peek -> half -> full; a full list scrolls; a flick down goes one snap', async (ctx) => {
    const { page, cdp } = await openPhone(ctx);
    const state = () => page.evaluate(() => document.body.dataset.sheet);
    const handleY = async () => (await page.locator('#sheetHandle').boundingBox()).y + 10;
    await touchDrag(cdp, 195, await handleY(), 195, 420);
    assertEq(await state(), 'half', 'slow drag from peek');
    await touchDrag(cdp, 195, await handleY(), 195, 60);
    assertEq(await state(), 'full', 'drag from half');
    const lr = await page.locator('#resultsList').boundingBox();
    await touchDrag(cdp, 195, lr.y + lr.height * 0.8, 195, lr.y + lr.height * 0.2, { steps: 8, stepMs: 10, rest: 0 });
    assert((await page.$eval('#resultsList', (e) => e.scrollTop)) > 50, 'full sheet list did not scroll');
    await page.$eval('#resultsList', (e) => { e.scrollTop = 0; });
    const hy = await handleY();
    await touchDrag(cdp, 195, hy, 195, hy + 180, { steps: 3, stepMs: 0, rest: 0 });
    assertEq(await state(), 'half', 'flick down from full');
  });

  suite.test('Mobile QA: card tap opens the full-screen job page; the Back arrow and browser Back both close it', async (ctx) => {
    const { page } = await openPhone(ctx);
    await tapSel(page, '#sheetHandle');
    await tapSel(page, '#resultsList .card[data-id]');
    await page.waitForSelector('#drawer.is-open');
    const box = await page.locator('#drawer').boundingBox();
    assertEq(Math.round(box.width), 390, 'job page width');
    assert(/job=/.test(await page.evaluate(() => location.hash)), 'job= in hash');
    await tapSel(page, '#drawerClose');
    assert(!(await page.evaluate(() => document.querySelector('#drawer').classList.contains('is-open'))), 'Back arrow did not close');
    await tapSel(page, '#resultsList .card[data-id]');
    await page.waitForSelector('#drawer.is-open');
    await page.goBack();
    await sleep(700);
    assert(!(await page.evaluate(() => document.querySelector('#drawer').classList.contains('is-open'))), 'browser Back did not close');
  });

  suite.test('Mobile QA: map one-finger pan and pinch move the map, never the page', async (ctx) => {
    const { page, cdp } = await openPhone(ctx, { hash: 'c=anthropic&m=map' });
    await page.waitForSelector('#mapHost .ms-pin', { timeout: 20000 });
    await sleep(800);
    const m = await page.locator('#mapHost').boundingBox();
    const pane = () => page.$eval('#mapHost .leaflet-map-pane', (e) => e.style.transform);
    const p0 = await pane();
    await touchDrag(cdp, 120, m.y + 150, 260, m.y + 300, { rest: 50 });
    assert((await pane()) !== p0, 'pan did not move the map');
    const pins0 = await page.$$eval('#mapHost .ms-pin', (e) => e.length);
    const cy = m.y + m.height / 2 - 50;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 165, y: cy, id: 1 }, { x: 225, y: cy, id: 2 }] });
    for (let i = 1; i <= 12; i++) {
      const d = 60 + (200 * i) / 12;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195 - d / 2, y: cy, id: 1 }, { x: 195 + d / 2, y: cy, id: 2 }] });
      await sleep(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(900);
    const pins1 = await page.$$eval('#mapHost .ms-pin', (e) => e.length);
    const page0 = await page.evaluate(() => [scrollY, document.scrollingElement.scrollTop, visualViewport.scale]);
    assert(pins1 !== pins0, `pinch did not change clustering (${pins0} -> ${pins1})`);
    assertEq(JSON.stringify(page0), '[0,0,1]', 'page scroll / zoom after map gestures');
  });

  suite.test('Mobile QA: [M-3] browser/hardware Back closes the open filter sheet instead of undoing a filter', async (ctx) => {
    const { page } = await openPhone(ctx);
    await chipIntoView(page, 'dept');
    await tapSel(page, '#quickChips [data-pop=dept]');
    await page.locator('#filters .fsec').nth(1).locator('label.check').first().tap();
    await sleep(600);
    const hash = await page.evaluate(() => location.hash);
    await page.goBack();
    await sleep(800);
    const after = await page.evaluate(() => ({ open: document.body.classList.contains('filters-open'), hash: location.hash }));
    assert(!after.open, `filter sheet still open after Back (hash ${hash} -> ${after.hash})`);
    assertEq(after.hash, hash, 'Back must not undo the filter while closing the sheet');
  });

  suite.test('Mobile QA: [M-4] closing the filter sheet returns focus to its trigger', async (ctx) => {
    const { page } = await openPhone(ctx);
    await tapSel(page, '#filtersToggle');
    await tapSel(page, '#filtersClose');
    const active = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    assertEq(active, 'filtersToggle', 'focus after closing the filter sheet');
  });

  suite.test('Mobile QA: [M-1] landscape 844x390 map keeps every pin and the Remote badge above the results sheet', async (ctx) => {
    const { page } = await openPhone(ctx, { hash: 'c=anthropic&m=map', viewport: LANDSCAPE });
    await page.waitForSelector('#mapHost .ms-pin', { timeout: 20000 });
    await sleep(1200);
    const g = await page.evaluate(() => ({
      sheetTop: document.querySelector('#results').getBoundingClientRect().top,
      pins: [...document.querySelectorAll('#mapHost .ms-pin')].map((p) => Math.round(p.getBoundingClientRect().bottom)),
      remote: document.querySelector('#mapHost .ms-remote')?.getBoundingClientRect().bottom ?? 0,
    }));
    await page.screenshot({ path: path.join(SHOTS, 'e2e-landscape-map.png') });
    const hidden = g.pins.filter((b) => b > g.sheetTop);
    assertEq(hidden.length, 0, `pins under the sheet (sheet top ${Math.round(g.sheetTop)}, pin bottoms ${g.pins.join(',')})`);
    assert(g.remote <= g.sheetTop, `Remote badge bottom ${Math.round(g.remote)} is under the sheet top ${Math.round(g.sheetTop)}`);
  });
}

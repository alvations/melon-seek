// Data badge e2e checks (docs/process/badge-ux.md): the Live / Snapshot / Cached / Demo badge.
// Static build (dist/ from `npm run build`, served under /melon-seek/ like GitHub Pages) with the
// live Greenhouse/Lever boards simulated by Playwright routes: a board that lands after the
// bundled list, one that lands first, one that fails, a quiet (Lever) network failure and a
// `live: false` company. Plus server mode (the real server scripts/e2e.js starts).
// The rule under test: the dot pulses only while something is pending, never in a settled state.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { unpackJobs } from '../../public/api.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const DROP = 5; // the simulated live board has 5 fewer roles than the bundle
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serve ROOT/dist under /melon-seek/ (the GitHub Pages layout) on a free port. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html')) || !fs.existsSync(path.join(dist, 'api', 'jobs'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p = path.join(dist, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
    if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/melon-seek`, close: () => new Promise((r) => server.close(r)) };
}
async function needDist(ctx) {
  const st = await serveDist();
  if (!st) skip('dist/ not built (npm run build)');
  ctx.cleanup.push(() => st.close());
  return st;
}

/** The bundled list of a built-in, unpacked: { mode, jobs }. */
function bundle(slug) {
  const body = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'api', 'jobs', `${slug}.json`), 'utf8'));
  return { mode: body.mode, jobs: unpackJobs(body) };
}
/** A Greenhouse board response made from the bundled list (same ids and pay), minus DROP roles. */
function greenhouseBody(slug) {
  return JSON.stringify({ jobs: bundle(slug).jobs.slice(DROP).map((j) => {
    const local = String(j.id).split(':').pop();
    return {
      id: /^\d+$/.test(local) ? Number(local) : local,
      title: j.title,
      location: { name: (j.locations || []).map((l) => l && l.name).filter(Boolean).join(' | ') },
      departments: j.department ? [{ name: j.department }] : [],
      content: '', absolute_url: j.url, updated_at: j.updatedAt || null, first_published: j.postedAt || null, metadata: [],
      pay_input_ranges: j.salary && j.salary.min != null && j.salary.interval === 'year'
        ? [{ min_cents: Math.round(j.salary.min * 100), max_cents: Math.round((j.salary.max ?? j.salary.min) * 100), currency_type: j.salary.currency || 'USD', title: 'Annual Salary' }] : [],
    };
  }) });
}

const LIVE_HOST = /^https:\/\/(boards-api\.greenhouse\.io|api\.ashbyhq\.com|api\.lever\.co)\//;

/**
 * Open the static build with a simulated live board.
 * live: { delay, status = 200, abort = false } (Greenhouse body from the bundle);
 * bundleDelay: ms added to the bundled api/jobs/<slug>.json; liveFalse: slug marked `live: false`.
 */
async function openStatic(ctx, st, { hash = 'c=anthropic', viewport = DESKTOP, colorScheme = 'light', reducedMotion = 'no-preference', live = { delay: 3000 }, bundleDelay = 0, liveFalse = null } = {}) {
  const context = await ctx.browser.newContext({ viewport, colorScheme, reducedMotion, deviceScaleFactor: 1, ...(viewport.width <= 860 ? { isMobile: true, hasTouch: true } : {}) });
  ctx.cleanup.push(() => context.close());
  const origin = new URL(st.base).origin;
  const liveRequests = [];
  await context.route((u) => u.origin !== origin, async (route) => {
    const url = route.request().url();
    if (!LIVE_HOST.test(url)) return route.abort('blockedbyclient');
    const rec = { url, done: false };
    liveRequests.push(rec);
    await sleep(live.delay);
    rec.done = true;
    if (live.abort) return route.abort('failed').catch(() => {});
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if ((live.status || 200) !== 200) return route.fulfill({ status: live.status, headers, body: '{}' }).catch(() => {});
    const slug = /boards\/([^/]+)\//.exec(url)?.[1] === 'anthropic' ? 'anthropic' : null;
    return route.fulfill({ status: 200, headers, body: slug ? greenhouseBody(slug) : '{"jobs":[]}' }).catch(() => {});
  });
  if (bundleDelay) await context.route(/\/api\/jobs\/[^/]+\.json$/, async (route) => { await sleep(bundleDelay); route.continue().catch(() => {}); });
  if (liveFalse) {
    await context.route(/\/api\/companies\.json$/, async (route) => {
      const r = await route.fetch();
      const list = await r.json();
      for (const c of list) if (c.slug === liveFalse) c.live = false;
      route.fulfill({ response: r, body: JSON.stringify(list) });
    });
  }
  // Record every badge class and every data-source announcement from the very first render.
  await context.addInitScript(() => {
    window.__badge = [];
    window.__said = [];
    const watch = () => {
      const badge = document.querySelector('#dataBadge');
      if (!badge) return;
      new MutationObserver(() => {
        const last = window.__badge[window.__badge.length - 1];
        if (last !== badge.className) window.__badge.push(badge.className);
      }).observe(badge, { attributes: true, attributeFilter: ['class'] });
      new MutationObserver(() => {
        const live = document.querySelector('#dataLive');
        const text = live && live.textContent.trim();
        if (text && window.__said[window.__said.length - 1] !== text) window.__said.push(text);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
      window.__overlayShown = 0;
      const overlay = document.querySelector('#vizOverlay');
      if (overlay) new MutationObserver(() => { if (!overlay.hidden && window.__ready) window.__overlayShown++; }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
    };
    document.addEventListener('DOMContentLoaded', watch);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${st.base}/#${hash}`);
  return { context, page, errors, liveRequests };
}

/** What the badge shows right now. */
const badgeState = (page) => page.evaluate(() => {
  const b = document.querySelector('#dataBadge');
  const lab = b.querySelector('.badge-label');
  const dot = b.querySelector('.badge-dot');
  const before = getComputedStyle(lab, '::before').content;
  const anims = dot.getAnimations();
  return {
    cls: b.className,
    label: lab.textContent,
    shown: before && before !== 'none' && before !== 'normal' ? before.replace(/^"|"$/g, '') : lab.textContent,
    cut: lab.scrollWidth > lab.clientWidth + 1,
    aria: b.getAttribute('aria-label'),
    tip: document.getElementById(b.getAttribute('aria-describedby') || '')?.textContent || '',
    iterations: getComputedStyle(dot).animationIterationCount,
    animName: getComputedStyle(dot).animationName,
    infinite: anims.some((a) => a.effect.getTiming().iterations === Infinity),
    running: anims.filter((a) => a.playState === 'running').length,
  };
});
/** A settled badge: no pending flag and no infinite animation on the dot. */
async function assertSettled(page, what) {
  await sleep(1600); // past the one-off arrival pulse
  const s = await badgeState(page);
  assert(!/is-pending|is-loading/.test(s.cls), `${what}: badge still pending (${s.cls})`);
  assert(!s.infinite && s.iterations !== 'infinite', `${what}: settled badge dot animates forever (${s.animName} x${s.iterations})`);
  assertEq(s.running, 0, `${what}: running dot animations once settled`);
  return s;
}
const popoverText = async (page) => {
  await page.click('#dataBadge');
  await page.locator('#popover.popover--badge').waitFor({ timeout: 5000 });
  const t = (await page.locator('#popover').innerText()).replace(/\s+/g, ' ');
  await page.keyboard.press('Escape');
  return t;
};
const badgeLog = (page) => page.evaluate(() => window.__badge);
const said = (page) => page.evaluate(() => window.__said);
const count = async (page) => Number((await page.locator('#resultsTitle strong').first().innerText()).replace(/\D/g, ''));

export function registerBadgeTests(suite) {
  suite.test('Badge: [static] live board after the bundle: "checking live…" (pulsing), then Live with a steady dot, announced once', async (ctx) => {
    const st = await needDist(ctx);
    const b = bundle('anthropic');
    const { page, errors, liveRequests } = await openStatic(ctx, st, { live: { delay: 3000 } });
    await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
    const p = await badgeState(page);
    assert(liveRequests.some((r) => !r.done), 'pending is shown while the live request is in flight');
    assert(new RegExp(b.mode === 'snapshot' ? 'is-snapshot' : 'is-demo').test(p.cls), `pending badge class ${p.cls}`);
    assert(/checking live…/.test(p.shown) && !p.cut, `pending label "${p.shown}" (cut: ${p.cut})`);
    assert(p.infinite && p.iterations === 'infinite', 'the dot pulses while the live board loads (work in progress)');
    assert(/checking the live board/.test(p.aria), `aria-label "${p.aria}"`);
    assert(/Checking the live board now/.test(p.tip), `tip "${p.tip}"`);
    assertEq(await count(page), b.jobs.length, 'bundle shown first');
    await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
    const s = await assertSettled(page, 'Live');
    assertEq(s.shown, 'Live', 'Live label');
    assertEq(s.aria, 'Data source: live board', 'Live aria-label');
    assert(/^Fetched live from Greenhouse \/ anthropic/.test(s.tip), `Live tip "${s.tip}"`);
    assertEq(await count(page), b.jobs.length - DROP, 'live roles swapped in');
    const log = await badgeLog(page);
    assert(log.some((c) => /is-live.*is-arrived|is-arrived.*is-live/.test(c)), `one arrival pulse class seen (${JSON.stringify(log)})`);
    assertEq(JSON.stringify(await said(page)), JSON.stringify([`Updated from the live board: ${(b.jobs.length - DROP).toLocaleString()} roles.`]), 'one polite announcement');
    assertEq(await page.locator('#dataLive').getAttribute('aria-live'), 'polite', 'announcement region is polite');
    await sleep(600);
    assertEq(await page.locator('#resultsTitle').getAttribute('aria-live'), 'polite', 'results count live region restored');
    assert(await page.locator('#toast').isHidden(), 'no toast for the swap');
    const pop = await popoverText(page);
    assert(/Status Live/.test(pop) && /Roles [\d,]+/.test(pop), `popover "${pop.slice(0, 160)}"`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Badge: [static] live board first: Loading, then Live; never pending, steady dot', async (ctx) => {
    const st = await needDist(ctx);
    const { page, errors } = await openStatic(ctx, st, { live: { delay: 0 }, bundleDelay: 6000 });
    await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
    await assertSettled(page, 'Live (live first)');
    const log = await badgeLog(page);
    assert(!log.some((c) => /is-pending|is-snapshot|is-demo/.test(c)), `no snapshot/pending state when live wins (${JSON.stringify(log)})`);
    assert(!log.some((c) => /is-arrived/.test(c)), 'no arrival pulse without a swap');
    assertEq((await said(page)).length, 0, 'nothing announced without a swap');
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Badge: [static] live board fails after the bundle (HTTP 500): checking, then the snapshot quietly, reason in the popover', async (ctx) => {
    const st = await needDist(ctx);
    const b = bundle('anthropic');
    const { page, errors } = await openStatic(ctx, st, { live: { delay: 2500, status: 500 } });
    await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('#dataBadge').classList.contains('is-pending'), null, { timeout: 20000 });
    const s = await assertSettled(page, 'Snapshot after a failed live board');
    assert(new RegExp(b.mode === 'snapshot' ? 'is-snapshot' : 'is-demo').test(s.cls) && !/is-live/.test(s.cls), `badge ${s.cls}`);
    if (b.mode === 'snapshot') assert(/^Snapshot · /.test(s.shown), `label "${s.shown}"`);
    assert(/HTTP 500/.test(s.tip), `the reason is in the tip: "${s.tip}"`);
    assertEq(await count(page), b.jobs.length, 'the bundled list stays');
    assertEq((await said(page)).length, 0, 'a failed live board is not announced');
    assert(await page.locator('#toast').isHidden(), 'no toast');
    const pop = await popoverText(page);
    assert(/HTTP 500/.test(pop), `popover gives the reason: "${pop.slice(0, 200)}"`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Badge: [static] quiet network failure (Lever) settles to the snapshot with no error text', async (ctx) => {
    const st = await needDist(ctx);
    if (bundle('palantir').mode !== 'snapshot') skip('palantir bundle is demo data here');
    const { page, errors } = await openStatic(ctx, st, { hash: 'c=palantir', live: { delay: 2000, abort: true } });
    await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('#dataBadge').classList.contains('is-pending'), null, { timeout: 20000 });
    const s = await assertSettled(page, 'Snapshot after a quiet CORS failure');
    assert(/is-snapshot/.test(s.cls), s.cls);
    assert(!/fail|error|unreachable/i.test(s.tip), `quiet tip "${s.tip}"`);
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Badge: [static] live: false company: no browser fetch, steady Snapshot, no "Refresh from the live board"', async (ctx) => {
    const st = await needDist(ctx);
    if (bundle('anthropic').mode !== 'snapshot') skip('anthropic bundle is demo data here');
    const { page, errors, liveRequests } = await openStatic(ctx, st, { liveFalse: 'anthropic', live: { delay: 0 } });
    await page.locator('#dataBadge.is-snapshot').waitFor({ timeout: 15000 });
    const s = await assertSettled(page, 'bundle-only Snapshot');
    assertEq(liveRequests.length, 0, 'no live request for a live: false company');
    assert(!(await badgeLog(page)).some((c) => /is-pending/.test(c)), 'never pending');
    assert(/can’t fetch it live/.test(s.tip) && !/fail/i.test(s.tip), `tip "${s.tip}"`);
    await page.click('#dataBadge');
    await page.locator('#popover.popover--badge').waitFor();
    assertEq(await page.locator('#popover button', { hasText: 'Refresh from the live board' }).isVisible(), false, 'no refresh button for a snapshot-only board');
    await page.keyboard.press('Escape');
    assert(!errors.length, errors.join(' | '));
  });

  suite.test('Badge: [static] the swap keeps the user in place: filters, scroll, focused card, chart, drawer, open popover', async (ctx) => {
    const st = await needDist(ctx);
    // 1. Search filter, scrolled list, keyboard focus on a card, chart cluster selected.
    {
      const { page, errors } = await openStatic(ctx, st, { live: { delay: 4500 } });
      await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
      await page.evaluate(() => { window.__ready = true; });
      // qa-ci-6: the cluster and the card by their property, from the list in front of the test. The 3rd cluster held
      // one role on the 2026-10-23 Anthropic lists (it took the 3rd card of a one-card list and waited 30 s). Now: the
      // cluster with the most roles, and its first card from the 3rd on that the simulated live board keeps (it drops
      // the bundle's first DROP roles), so the swap can keep that card in place.
      const bins = page.locator('#chartHost .ms-bin:not(.ms-bin--overflow)');
      const sizes = await bins.evaluateAll((bs) => bs.map((b) => Number(/^(\d+) roles?\b/.exec(b.getAttribute('aria-label') || '')?.[1] || 0)));
      const big = sizes.indexOf(Math.max(0, ...sizes));
      if (big >= 0 && sizes[big] >= 3) { await bins.nth(big).click(); await sleep(400); }
      const selected = await page.locator('#chartHost .is-selected').count();
      await page.locator('#resultsList').evaluate((el) => { el.scrollTop = 240; });
      const dropped = new Set(bundle('anthropic').jobs.slice(0, DROP).map((j) => j.id));
      const ids = await page.locator('#resultsList .card[data-id]').evaluateAll((cs) => cs.map((c) => c.dataset.id));
      const k = ids.findIndex((x, i) => i >= 2 && !dropped.has(x));
      assert(k >= 0, `no third card the live board keeps (cluster sizes ${sizes.join(', ')}; ${ids.length} cards)`);
      const card = page.locator('#resultsList .card[data-id]').nth(k);
      const id = await card.getAttribute('data-id');
      await card.focus();
      const before = { hash: await page.evaluate(() => location.hash), top: await page.locator('#resultsList').evaluate((el) => el.scrollTop) };
      await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
      await sleep(500);
      assertEq(await page.evaluate(() => location.hash), before.hash, 'filters and selection (hash) kept');
      const top = await page.locator('#resultsList').evaluate((el) => el.scrollTop);
      assert(Math.abs(top - before.top) <= 2, `results scroll kept (${before.top} -> ${top})`);
      assertEq(await page.evaluate(() => document.activeElement?.dataset?.id || document.activeElement?.tagName), id, 'focused card keeps focus');
      assertEq(await page.locator('#chartHost .is-selected').count(), selected, 'chart selection kept');
      assertEq(await page.evaluate(() => window.__overlayShown), 0, 'no chart skeleton/overlay flash during the swap');
      assert(!errors.length, errors.join(' | '));
    }
    // 2. Drawer open (and scrolled) during the swap.
    {
      const { page, errors } = await openStatic(ctx, st, { live: { delay: 4500 } });
      await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
      await page.locator('#resultsList .card[data-id]').nth(1).click();
      await page.locator('#drawer.is-open').waitFor();
      const title = await page.locator('#drawer .d-title').innerText();
      const hash = await page.evaluate(() => location.hash);
      await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
      await sleep(400);
      assert(await page.locator('#drawer').isVisible(), 'drawer still open');
      assertEq(await page.locator('#drawer .d-title').innerText(), title, 'same job in the drawer');
      assertEq(await page.evaluate(() => location.hash), hash, 'job hash kept');
      assert(!errors.length, errors.join(' | '));
    }
    // 3. Badge popover open with focus on its button: updated in place, focus kept.
    {
      const { page, errors } = await openStatic(ctx, st, { live: { delay: 4500 } });
      await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
      await page.click('#dataBadge');
      const btn = page.locator('#popover button', { hasText: 'Refresh from the live board' });
      await btn.focus();
      assert(/checking live…/.test(await page.locator('#popover').innerText()), 'popover status says checking live');
      await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
      await sleep(300);
      assert(await page.locator('#popover').isVisible(), 'popover still open');
      assert(/Status\s+Live/.test(await page.locator('#popover').innerText()), 'popover status updated to Live');
      assertEq(await page.evaluate(() => document.activeElement?.textContent), 'Refresh from the live board', 'focus kept on the popover button');
      assert(!errors.length, errors.join(' | '));
    }
  });

  suite.test('Badge: [static] narrow widths and dark mode: label variants fit (1440, 1020, 390, 360), Live and checking text on phones', async (ctx) => {
    const st = await needDist(ctx);
    const want = { 1440: /^(Snapshot|Demo) · checking live…$/, 1020: /^Checking live…$/, 390: /^Checking…$/, 360: /^Checking…$/ };
    for (const [w, re] of Object.entries(want)) {
      const viewport = { width: Number(w), height: Number(w) > 860 ? 900 : 800 };
      const { page, context } = await openStatic(ctx, st, { viewport, colorScheme: Number(w) === 390 ? 'dark' : 'light', live: { delay: 3500 } });
      await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
      const p = await badgeState(page);
      assert(re.test(p.shown) && !p.cut, `${w}px pending label "${p.shown}" (cut: ${p.cut})`);
      const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert(!hscroll, `${w}px: no horizontal scroll while pending`);
      await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
      const s = await assertSettled(page, `${w}px Live`);
      assertEq(s.shown, 'Live', `${w}px Live label`);
      assertEq(s.aria, 'Data source: live board', `${w}px Live aria-label`);
      await context.close();
    }
  });

  suite.test('Badge: [static] reduced motion: no dot animation even while checking live', async (ctx) => {
    const st = await needDist(ctx);
    const { page } = await openStatic(ctx, st, { reducedMotion: 'reduce', live: { delay: 3000 } });
    await page.locator('#dataBadge.is-pending').waitFor({ timeout: 15000 });
    const p = await badgeState(page);
    assertEq(p.animName, 'none', 'no pulse with prefers-reduced-motion');
    assert(/checking live…/.test(p.shown), 'the label still says it is checking');
    await page.locator('#dataBadge.is-live').waitFor({ timeout: 20000 });
    const s = await badgeState(page);
    assertEq(s.animName, 'none', 'no arrival pulse with prefers-reduced-motion');
  });

  suite.test('Badge: [server] Live is steady; keyboard opens and closes the details; name and description', async (ctx) => {
    const context = await ctx.browser.newContext({ viewport: DESKTOP });
    ctx.cleanup.push(() => context.close());
    const origin = new URL(ctx.baseUrl).origin;
    await context.route((u) => u.origin !== origin, (r) => r.abort('blockedbyclient'));
    // The sandbox can't reach the boards, so the server's answer is relabelled as a live fetch.
    await context.route(/\/api\/jobs\?/, async (route) => {
      const r = await route.fetch();
      const body = await r.json();
      route.fulfill({ response: r, body: JSON.stringify({ ...body, mode: 'live', error: null, fetchedAt: new Date().toISOString() }) });
    });
    const page = await context.newPage();
    await page.goto(`${ctx.baseUrl}/#c=anthropic`);
    await page.locator('#dataBadge.is-live').waitFor({ timeout: 30000 });
    const s = await assertSettled(page, 'server Live');
    assertEq(s.aria, 'Data source: live board', 'aria-label');
    assert(/^Fetched live from Greenhouse \/ anthropic/.test(s.tip), `description "${s.tip}"`);
    // Keyboard: Tab from the view switch lands on the badge, with a visible focus ring.
    await page.locator('.seg [data-mode="insights"]').focus();
    await page.keyboard.press('Tab');
    assertEq(await page.evaluate(() => document.activeElement?.id), 'dataBadge', 'Tab reaches the badge');
    const outline = await page.locator('#dataBadge').evaluate((el) => getComputedStyle(el).outlineStyle);
    await page.keyboard.press('Enter');
    await page.locator('#popover.popover--badge').waitFor({ timeout: 5000 });
    assertEq(await page.locator('#dataBadge').getAttribute('aria-expanded'), 'true', 'aria-expanded while open');
    await page.keyboard.press('Escape');
    await sleep(200);
    assert(await page.locator('#popover').isHidden(), 'Escape closes the details');
    assertEq(await page.evaluate(() => document.activeElement?.id), 'dataBadge', 'focus returns to the badge');
    assert(outline !== 'none', `visible focus ring on the badge (outline-style ${outline})`);
  });
}

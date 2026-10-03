// Desktop QA e2e checks (docs/QA.md "Full QA pass (desktop) 2026-10-03", docs/process/qa-desktop.md).
// Desktop Chromium at 1440x900 (one check at 1280x800), against the real server that scripts/e2e.js
// starts; the [D-1] check also serves dist/ (npm run build) under /melon-seek/ like GitHub Pages.
// Tests tagged "[D-n]" encode an open bug from that report and are expected to fail until it is
// fixed; the rest guard flows that work today. Data-dependent checks skip on demo data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isExternal = (url, base) => !!url && !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:');

async function openDesk(ctx, { hash = 'c=anthropic', viewport = DESKTOP, colorScheme = 'light', base = ctx.baseUrl, storageState } = {}) {
  const context = await ctx.browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1, acceptDownloads: true, ...(storageState ? { storageState } : {}) });
  ctx.cleanup.push(() => context.close());
  const origin = new URL(base).origin;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.route((u) => isExternal(u.href, origin), (r) => r.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() && m.location().url;
    if (/Failed to load resource/.test(m.text()) && isExternal(loc, origin)) return;
    errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(`${base}/${hash ? `#${hash}` : ''}`);
  await ready(page);
  return { context, page, errors, base };
}
async function ready(page) {
  await page.locator('#resultsTitle strong').first().waitFor({ timeout: 30000 });
  await sleep(400);
}
async function count(page) {
  const t = (await page.locator('#resultsTitle').innerText()).replace(/,/g, '');
  const m = t.match(/(\d+)\s+role/);
  assert(m, `no count in "${t}"`);
  return Number(m[1]);
}
const params = async (page) => new URLSearchParams(await page.evaluate(() => location.hash.slice(1)));
const cardIds = (page) => page.locator('#resultsList .card[data-id]').evaluateAll((els) => els.map((e) => e.dataset.id));

/** The app's own jobs (through public/api.js) with approx-USD figures from palette.toUSD. */
async function appJobs(page, base, company) {
  return page.evaluate(async ({ base, company }) => {
    const api = await import(`${base}/api.js`);
    const pal = await import(`${base}/viz/palette.js`);
    const res = await api.getJobs({ company });
    return {
      mode: res.mode,
      jobs: res.jobs.map((j) => {
        const s = j.salary && (j.salary.min != null || j.salary.max != null) ? j.salary : null;
        const min = s ? (s.min ?? s.max) : null, max = s ? (s.max ?? s.min) : null, mid = s ? (s.mid ?? (min + max) / 2) : null;
        return {
          id: j.id, title: String(j.title || '').replace(/^\s*\[[^\]]{1,16}\]\s*/, ''), team: j.team, remote: !!j.remote,
          remoteLoc: (j.locations || []).some((l) => l.remote), usdMid: s ? pal.toUSD(mid, s.currency) : null, age: j.ageDays ?? null,
        };
      }),
    };
  }, { base, company });
}
async function needReal(page, base, company) {
  const d = await appJobs(page, base, company);
  if (d.mode === 'demo') skip(`${company} is demo data here`);
  return d.jobs;
}
const nullsLast = (a, b, f) => (a == null || b == null ? (a == null) - (b == null) : f());

/** Serve ROOT/dist under /melon-seek/ (the GitHub Pages layout) on a free port. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html')) || !fs.existsSync(path.join(dist, 'api', 'jobs'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv' };
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

async function dragX(page, x0, x1, y) {
  await page.mouse.move(x0, y); await page.mouse.down();
  await page.mouse.move(x1, y, { steps: 12 }); await page.mouse.up();
  await sleep(500);
}

export function registerDesktopQaTests(suite) {
  // ---------------------------------------------------------------- guards (pass today)
  suite.test('Desktop QA: "Highest pay" orders by approx-USD range midpoint (Anthropic, OpenAI, Anduril)', async (ctx) => {
    const { page, errors, base } = await openDesk(ctx);
    for (const c of ['anthropic', 'openai', 'anduril']) {
      await page.goto(`${base}/#c=${c}`); await ready(page);
      const jobs = new Map((await needReal(page, base, c)).map((j) => [j.id, j]));
      const list = (await cardIds(page)).map((id) => jobs.get(id));
      for (let i = 1; i < list.length; i++) {
        assert(nullsLast(list[i - 1].usdMid, list[i].usdMid, () => list[i].usdMid - list[i - 1].usdMid) <= 0,
          `${c}: card ${i} (${list[i].title}, mid ${list[i].usdMid}) ranks below ${list[i - 1].title} (mid ${list[i - 1].usdMid})`);
      }
    }
    assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  });

  suite.test('Desktop QA: search ranks title/team matches first and "· N in title" counts them', async (ctx) => {
    const { page, base } = await openDesk(ctx);
    const jobs = new Map((await needReal(page, base, 'anthropic')).map((j) => [j.id, j]));
    for (const q of ['engineer', 'safety', 'sales manager']) {
      await page.fill('#search', q); await sleep(700);
      const toks = q.split(/\s+/);
      const strong = (await cardIds(page)).map((id) => { const j = jobs.get(id); return toks.every((t) => `${j.title} ${j.team || ''}`.toLowerCase().includes(t)); });
      const firstWeak = strong.indexOf(false);
      assert(firstWeak === -1 || strong.lastIndexOf(true) < firstWeak, `"${q}": a keyword-only match ranks above a title match`);
      const shown = Number(((await page.locator('#resultsTitle').innerText()).match(/·\s*([\d,]+) in title/) || [])[1]?.replace(/,/g, ''));
      const exp = [...jobs.values()].filter((j) => toks.every((t) => `${j.title} ${j.team || ''}`.toLowerCase().includes(t))).length;
      assertEq(shown, exp, `"${q}": "· N in title"`);
    }
  });

  suite.test('Desktop QA: picking a facet gives exactly its count (department, seniority, skill, juice grade, remote)', async (ctx) => {
    const { page } = await openDesk(ctx);
    const pick = async (loc, label) => {
      const n = Number(await loc.locator('.check-count, .kw-count, .seg-count').first().innerText());
      await loc.click(); await sleep(450);
      assertEq(await count(page), n, `${label} result count vs its facet count`);
    };
    await pick(page.locator('#filterBody details.fsec').filter({ hasText: 'Department' }).locator('label.check').first(), 'department');
    await page.click('#clearAll'); await sleep(300);
    await pick(page.locator('#filterBody details.fsec').filter({ hasText: 'Seniority' }).locator('label.check').nth(2), 'seniority');
    // keyword AND: a second chip's shown count is the result after adding it
    const skills = page.locator('#filterBody details.fsec').filter({ hasText: 'Skills' }).locator('button.kw');
    await pick(skills.nth(1), 'skill (AND with seniority)');
    await page.click('#clearAll'); await sleep(300);
    await page.click('#quickChips [data-pop=more]'); await sleep(300);
    await pick(page.locator('#popover button.kw--juice').first(), 'juice grade');
    await page.keyboard.press('Escape'); await page.click('#clearAll'); await sleep(300);
    await page.click('#quickChips [data-pop=remote]'); await sleep(300);
    await pick(page.locator('#popover .seg button').nth(1), 'remote');
  });

  suite.test('Desktop QA: a chart cluster click adds a chip that filters the list; dismissing it restores the list', async (ctx) => {
    const { page } = await openDesk(ctx);
    const total = await count(page);
    const bins = page.locator('#chartHost .ms-bin:not(.ms-bin--overflow)');
    const labels = await bins.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
    const k = labels.findIndex((l) => parseInt(l) >= 3);
    assert(k >= 0, 'no cluster with 3+ roles');
    const n = parseInt(labels[k]);
    await bins.nth(k).hover(); await sleep(250);
    assert(new RegExp(`^${n} role`).test((await page.locator('.ms-viz-tip').first().innerText()).trim()), 'hover tooltip shows the cluster size');
    await bins.nth(k).click(); await sleep(500);
    assert(new RegExp(`\\(${n}\\)`).test(await page.locator('#areaChipTop .area-chip').innerText()), 'chip shows the cluster size');
    assertEq(await count(page), n, 'list narrowed to the cluster');
    await page.locator('#areaChipTop .area-x').click(); await sleep(400);
    assertEq(await count(page), total, 'list restored');
    assertEq(await page.locator('#chartHost .is-selected').count(), 0, 'chart selection cleared');
  });

  suite.test('Desktop QA: map pin click gives an area chip; Remote control; Pay|Juice legend', async (ctx) => {
    const { page } = await openDesk(ctx, { hash: 'c=anthropic&m=map' });
    await page.locator('#mapHost .ms-pin').first().waitFor({ timeout: 15000 }); await sleep(1200);
    const big = await page.$$eval('#mapHost .ms-pin-icon', (ps) => {
      let best = 0, bn = 0;
      ps.forEach((p, i) => { const n = Number(p.querySelector('.ms-pin__count')?.textContent || 1); if (n > bn) { bn = n; best = i; } });
      return { best, bn, label: ps[best].querySelector('.ms-pin__label').textContent };
    });
    await page.locator('#mapHost .ms-pin-icon').nth(big.best).locator('.ms-pin').click(); await sleep(1200);
    assert((await page.locator('#areaChipTop .area-chip').innerText()).includes(big.label), 'area chip names the pin');
    assertEq(await count(page), big.bn, 'list = pin count');
    await page.click('#clearAll'); await sleep(500);
    const rn = Number((await page.locator('#mapHost .ms-remote__n').innerText()).replace(/,/g, ''));
    await page.locator('#mapHost .ms-remote').click(); await sleep(500);
    assertEq(await count(page), rn, 'Remote control count');
    await page.click('#clearAll'); await sleep(400);
    assert(!(await page.locator('#mapHost .ms-modes__legend').isVisible()), 'legend hidden in Pay mode');
    await page.locator('#mapHost .ms-modes__btn[data-mode=juice]').click(); await sleep(500);
    assertEq(await page.locator('#mapHost .ms-modes__btn[data-mode=juice]').getAttribute('aria-checked'), 'true', 'Juice radio checked');
    assert(await page.locator('#mapHost .ms-modes__legend').isVisible(), 'Juice legend visible');
  });

  suite.test('Desktop QA: drawer next/prev, Copy link, Apply on the ATS host, on-site methodology page', async (ctx) => {
    const { page, base } = await openDesk(ctx);
    await page.locator('#resultsList .card').nth(2).click(); await sleep(700);
    assert(/^3 of /.test(await page.locator('#drawerPos').innerText()), 'opened 3rd card');
    await page.locator('#drawerNext').click(); await sleep(400);
    assert(/^4 of /.test(await page.locator('#drawerPos').innerText()), 'Next');
    for (let i = 0; i < 3; i++) await page.locator('#drawerPrev').click();
    await sleep(400);
    assert(await page.locator('#drawerPrev').isDisabled(), 'Prev disabled at the first role');
    await page.locator('#drawer button[aria-label="Copy link to this role"]').click(); await sleep(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assertEq(clip, await page.evaluate(() => location.href), 'clipboard = URL');
    assert(/job=/.test(clip), 'URL has job=');
    const host = new URL(await page.locator('#drawer a.apply').getAttribute('href')).hostname;
    assert(/greenhouse\.io$/.test(host), `Anthropic Apply host ${host}`);
    assertEq(await page.locator('#drawer a.apply .apply-host').innerText(), host, 'shown host');
    const juice = page.locator('#drawer details.juice-details');
    if (await juice.count()) {
      await juice.locator(':scope > summary').click();
      const link = juice.locator('.juice-disclaimer a');
      assert((await link.evaluate((a) => a.href)).startsWith(new URL(base).origin), 'methodology link is on-site');
      const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
      await popup.waitForLoadState('domcontentloaded');
      assert(await popup.evaluate(() => !!document.getElementById('1-the-formula')), 'methodology page has #1-the-formula');
      await popup.close();
    }
  });

  suite.test('Desktop QA: "Same role elsewhere" keeps location and search; Back reopens the drawer', async (ctx) => {
    const { page } = await openDesk(ctx, { hash: 'c=anthropic&l=San+Francisco&q=engineer' });
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      await page.locator('#resultsList .card').nth(i).click(); await sleep(1500);
      found = await page.evaluate(() => document.querySelectorAll('#drawer .ms-comps__row:not(.is-current)').length > 0);
      if (!found) { await page.keyboard.press('Escape'); await sleep(300); }
    }
    if (!found) skip('no role with comps rows');
    const jobHash = (await params(page)).toString();
    await page.locator('#drawer .ms-comps__row:not(.is-current)').first().click();
    await page.waitForFunction(() => !location.hash.includes('c=anthropic'), null, { timeout: 15000 }); await ready(page);
    const h = await params(page);
    assert(h.get('rf') && h.get('l') === 'San Francisco' && h.get('q') === 'engineer', `context carried: ${h}`);
    assert(/^Role:/.test(await page.locator('#areaChipTop .area-chip').innerText()), 'Role chip');
    await page.goBack(); await ready(page); await page.locator('#drawer .d-title').waitFor({ timeout: 15000 });
    assertEq((await params(page)).toString(), jobHash, 'Back restores the drawer state');
  });

  suite.test('Desktop QA: single-key shortcuts never fire while typing (search, company menu, Add board)', async (ctx) => {
    const { page } = await openDesk(ctx);
    const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('/');
    assert(await page.evaluate(() => document.activeElement?.id === 'search'), '/ focuses search');
    await page.keyboard.type('t/jk'); await sleep(300);
    assertEq(await page.inputValue('#search'), 't/jk', 'typed literally');
    assertEq(await theme(), null, 'theme unchanged');
    await page.fill('#search', ''); await sleep(300);
    await page.click('#companyMenuBtn'); await page.keyboard.type('t'); await sleep(200);
    assertEq(await theme(), null, 'theme unchanged in the company search');
    await page.keyboard.press('Escape');
    await page.click('#addBoardBtn'); await page.locator('#abBoard').type('t/'); await sleep(200);
    assertEq(await page.inputValue('#abBoard'), 't/', 'Add board field typed');
    assertEq(await theme(), null, 'theme unchanged in Add board');
  });

  suite.test('Desktop QA: Back/Forward walk mode, filter, sort and drawer states', async (ctx) => {
    const { page } = await openDesk(ctx);
    const seq = [(await params(page)).toString()];
    await page.locator('.topbar [data-mode=map]').click(); await sleep(600); seq.push((await params(page)).toString());
    await page.locator('#filterBody input[value="Sales"]').check(); await sleep(500); seq.push((await params(page)).toString());
    await page.locator('.topbar [data-mode=chart]').click(); await sleep(500); seq.push((await params(page)).toString());
    await page.selectOption('#sortBy', 'title'); await sleep(500); seq.push((await params(page)).toString());
    await page.locator('#resultsList .card').first().click(); await sleep(600); seq.push((await params(page)).toString());
    for (let i = seq.length - 2; i >= 0; i--) { await page.goBack(); await sleep(600); assertEq((await params(page)).toString(), seq[i], `Back to step ${i}`); }
    assert(await page.locator('#drawer').isHidden(), 'drawer closed at the start');
    for (let i = 1; i < seq.length; i++) { await page.goForward(); await sleep(600); assertEq((await params(page)).toString(), seq[i], `Forward to step ${i}`); }
    assert(await page.locator('#drawer').isVisible(), 'drawer open again');
  });

  // ---------------------------------------------------------------- open bugs (fail until fixed)
  suite.test('Desktop QA: [D-1] static build (Pages) shows canonical location names like server mode', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('dist/ not built (npm run build)');
    ctx.cleanup.push(() => st.close());
    const { page } = await openDesk(ctx, { base: st.base });
    const d = await appJobs(page, st.base, 'anthropic');
    if (d.mode === 'demo') skip('static build has demo data');
    await page.click('#quickChips [data-pop=loc]'); await sleep(400);
    const opts = await page.locator('#popover label.check .check-label').allInnerTexts();
    const raw = opts.filter((o) => /Remote-Friendly|Prefecture|Travel/i.test(o));
    assert(!raw.length, `raw source location strings in the Location filter: ${JSON.stringify(raw)}`);
  });

  suite.test('Desktop QA: [D-2] facet counts follow an active chart cluster / map area', async (ctx) => {
    const { page } = await openDesk(ctx);
    const bins = page.locator('#chartHost .ms-bin:not(.ms-bin--overflow)');
    const labels = await bins.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
    const k = labels.findIndex((l) => parseInt(l) >= 3 && parseInt(l) <= 20);
    await bins.nth(k).click(); await sleep(500);
    const n = await count(page);
    await page.click('#quickChips [data-pop=sen]'); await sleep(400);
    const sum = (await page.locator('#popover label.check .check-count').allInnerTexts()).reduce((a, x) => a + Number(x), 0);
    assertEq(sum, n, `Seniority counts (single-valued) should add up to the ${n} roles in the cluster`);
  });

  suite.test('Desktop QA: [D-3] salary thumbs can be dragged back after the min thumb reaches the right end', async (ctx) => {
    const { page } = await openDesk(ctx);
    const bb = await page.locator('#filterBody .range-wrap').boundingBox();
    const y = bb.y + bb.height / 2;
    await dragX(page, bb.x + 8, bb.x + bb.width + 30, y);
    const stuck = Number((await params(page)).get('smin'));
    await dragX(page, bb.x + bb.width - 8, bb.x + bb.width * 0.3, y);
    const after = Number((await params(page)).get('smin') || 0);
    assert(after < stuck, `min thumb could not be dragged back (smin stays ${after})`);
  });

  suite.test('Desktop QA: [D-4] OpenAI "Remote" means the same thing in the filter and on the map', async (ctx) => {
    const { page, base } = await openDesk(ctx, { hash: 'c=openai&m=map' });
    const jobs = await needReal(page, base, 'openai');
    await page.locator('#mapHost .ms-remote').waitFor({ timeout: 15000 }); await sleep(800);
    const badge = Number((await page.locator('#mapHost .ms-remote__n').innerText()).replace(/,/g, ''));
    await page.click('#quickChips [data-pop=remote]'); await sleep(300);
    await page.locator('#popover .seg button').nth(1).click(); await sleep(500);
    const filter = await count(page);
    const onsiteOnlyRemote = jobs.filter((j) => j.remote && !j.remoteLoc).length;
    assertEq(filter, badge, `Remote filter ${filter} vs map Remote badge ${badge} (${onsiteOnlyRemote} roles flagged remote have only on-site locations)`);
  });

  suite.test('Desktop QA: [D-5] Compstimate title follows the filters after "Reset to filters" + browser Back', async (ctx) => {
    const { page } = await openDesk(ctx, { hash: 'c=anthropic&m=insights' });
    await page.locator('#compHost .ms-comp__result').waitFor(); await sleep(1200);
    await page.locator('#filterBody input[value="Sales"]').check(); await sleep(1000);
    await page.locator('#compHost .ms-comp__input').fill('Account Executive'); await page.keyboard.press('Enter'); await sleep(700);
    await page.locator('#compHost .ms-comp__reset').click(); await sleep(700);
    await page.goBack(); await sleep(1500);
    const title = await page.locator('#compHost .ms-comp__input').inputValue();
    const basis = ((await page.locator('#compHost .ms-comp__result').innerText()).match(/Weighted by similarity to “([^”]*)”/) || [])[1];
    assertEq(title, basis, 'Role title field vs the title the estimate is for');
  });

  suite.test('Desktop QA: [D-6] j / ArrowRight step the drawer right after it opens', async (ctx) => {
    const { page } = await openDesk(ctx);
    await page.locator('#resultsList .card').first().click(); await sleep(700);
    await page.keyboard.press('j'); await sleep(400);
    assert(/^2 of /.test(await page.locator('#drawerPos').innerText()), `j did nothing (focus on #${await page.evaluate(() => document.activeElement.id)})`);
  });

  suite.test('Desktop QA: [D-7] a cluster chip does not outlive its cluster when Group by changes', async (ctx) => {
    const { page } = await openDesk(ctx);
    await page.locator('#chartHost .ms-bin:not(.ms-bin--overflow)').nth(3).click(); await sleep(500);
    await page.selectOption('#groupBy', 'seniority'); await sleep(800);
    const chip = await page.locator('#areaChipTop .area-chip').count();
    const sel = await page.locator('#chartHost .is-selected').count();
    assert(!chip || sel, `chip "${chip ? await page.locator('#areaChipTop .area-chip').innerText() : ''}" still filters the list, but the chart has no such cluster`);
  });

  suite.test('Desktop QA: [D-8] Esc closes the drawer when focus is in the "Same role elsewhere" list', async (ctx) => {
    const { page } = await openDesk(ctx);
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      await page.locator('#resultsList .card').nth(i).click(); await sleep(1500);
      found = await page.locator('#drawer .ms-comps__list').count() > 0;
      if (!found) { await page.keyboard.press('Escape'); await sleep(300); }
    }
    if (!found) skip('no comps list');
    await page.locator('#drawer .ms-comps__list').focus();
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(250); }
    assert(await page.locator('#drawer').isHidden(), 'drawer still open after 3x Esc');
  });

  suite.test('Desktop QA: [D-9] Clusters grouped by Seniority follow the seniority ladder', async (ctx) => {
    const { page } = await openDesk(ctx, { hash: 'c=anthropic&g=seniority' });
    await sleep(600);
    const ladder = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+', 'Unspecified'];
    const rows = await page.locator('#chartHost .ms-crow__name').allInnerTexts();
    const want = [...rows].sort((a, b) => ladder.indexOf(a) - ladder.indexOf(b));
    assert(rows.join() === want.join(), `row order ${JSON.stringify(rows)}, expected ${JSON.stringify(want)}`);
  });

  suite.test('Desktop QA: [D-10] a saved search shows "N new" in a new session before its company is opened', async (ctx) => {
    const { page, context, base } = await openDesk(ctx, { hash: 'c=anthropic&ks=Python&s=Senior' });
    await page.click('#saveSearch'); await sleep(300);
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('melon.saved')); s[0].seen = s[0].seen.slice(2); s[0].lastSeenAt = '2026-09-01T00:00:00Z'; localStorage.setItem('melon.saved', JSON.stringify(s)); });
    const storageState = await context.storageState();
    const { page: p2 } = await openDesk(ctx, { hash: 'c=openai', base, storageState });
    await p2.click('#companyMenuBtn'); await sleep(300);
    const row = await p2.locator('#popover .saved-row').first().innerText();
    assert(/2 new/.test(row), `saved row "${row.replace(/\n/g, ' ')}" has no "2 new"`);
  });

  suite.test('Desktop QA: [D-11] "Newest" is not offered as a working sort when no role has a listing date', async (ctx) => {
    const { page, base } = await openDesk(ctx);
    const jobs = await needReal(page, base, 'anthropic');
    if (jobs.some((j) => j.age != null)) skip('this data has listing dates');
    const opt = page.locator('#sortBy option[value=newest]');
    assert(!(await opt.count()) || await opt.isDisabled(), '"Newest" is selectable but every role has an unknown date (order = board order)');
  });

  suite.test('Desktop QA: [D-12] an unknown sort= in the URL falls back to a visible sort option', async (ctx) => {
    const { page } = await openDesk(ctx, { hash: 'c=anthropic&sort=pay' });
    assertEq(await page.inputValue('#sortBy'), 'salary-desc', 'Sort select value');
  });

  suite.test('Desktop QA: 1280x800 dark: no horizontal scroll, top bar fits, drawer inside the viewport', async (ctx) => {
    const { page, errors } = await openDesk(ctx, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark', hash: 'c=anduril' });
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'horizontal scroll');
    const off = await page.$$eval('.topbar button, .topbar input', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < 0); }).map((e) => e.id || e.className));
    assert(!off.length, `top-bar controls off-screen: ${off.join(', ')}`);
    await page.locator('#resultsList .card').first().click(); await sleep(800);
    const b = await page.locator('#drawer').boundingBox();
    assert(b && b.x + b.width <= 1281 && b.height <= 801, `drawer box ${JSON.stringify(b)}`);
    assert(await page.evaluate(() => Number(getComputedStyle(document.body).backgroundColor.match(/\d+/)[0]) < 60), 'dark background');
    assert(!errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  });
}

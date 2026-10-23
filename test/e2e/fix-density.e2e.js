// fix-density lane (docs/process/fix-density.md). The user, 2026-10-11: the chart's notes line ("564 postings with
// salary · row medians: pay in the US (55 paid elsewhere left out) · 46 on-target earnings, not in the medians ·
// …") was "way too busy and too much on a mobile". The rule (public/viz/note.js): every secondary line around the
// main views shows one line, on a phone and on a desktop, with at most WORDS visible words and nothing cut off;
// every other caveat is behind one "Details" text button (aria-expanded, aria-controls) that opens a short list.
//
// On every big-tech board (the beta site) and Anduril (the main site), at 390x844 and 360x740 and at 1440x900:
// the stats line, the chart's notes line (Clusters and Ranges), the Ranges legend, the phone tagline, the map's Pay
// legend note, the Insights header and card captions, the Pay estimate caption, the drawer's pay block lines and
// the empty state. It serves the static build (BETA_QA_DIST, else dist/) under /melon-seek/, and skips without one.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const WORDS = 12;
const BOARDS = [['amazon', 'beta/'], ['apple', 'beta/'], ['google', 'beta/'], ['nvidia', 'beta/'], ['microsoft', 'beta/'], ['meta', 'beta/'], ['netflix', 'beta/'], ['anduril', '']];
const VIEWPORTS = [['390x844', 390, 844, true], ['360x740', 360, 740, true], ['1440x900', 1440, 900, false]];

function distDir() { return path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist')); }
let shared = null;
async function serveDist() {
  if (shared) return shared;
  const dist = distDir();
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html'))) return null;
  // FIX_DENSITY_ORIGIN=http://127.0.0.1:<port>: test a server already running (the log's before/after runs).
  if (process.env.FIX_DENSITY_ORIGIN) return (shared = { origin: process.env.FIX_DENSITY_ORIGIN.replace(/\/$/, ''), dist });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(u.pathname.slice('/melon-seek/'.length)); } catch { res.writeHead(400); return res.end(); }
    let p = path.join(dist, rel);
    if (p !== dist && !p.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  shared = { origin: `http://127.0.0.1:${server.address().port}`, dist };
  return shared;
}

/** The board's static list, or null when this build has no snapshot of it. */
function boardList(st, site, slug) {
  const f = path.join(st.dist, site, 'api', 'jobs', `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  try { const b = JSON.parse(fs.readFileSync(f, 'utf8')); return b.mode === 'snapshot' && b.jobs?.length ? b : null; } catch { return null; }
}
const jobKey = (slug, id) => (String(id).includes(':') ? String(id) : `${slug}:${id}`);

async function page(ctx, st, [, w, h, mobile]) {
  const context = await ctx.browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme: 'light' });
  ctx.cleanup.push(() => context.close());
  await context.route((u) => !u.href.startsWith(st.origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  return { page: p, errors };
}
async function go(page, url, settle = 700) {
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 90000 });
  await sleep(settle);
}

/**
 * Each visible element of `sel`: its visible line's text and words (an .ms-note's line, without the button),
 * how many line boxes the visible part takes (the closed Details list has none), and whether the line is cut off.
 */
function measure(page, sel) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]');
  }).map((e) => {
    const lineEl = e.classList.contains('ms-note') ? e.querySelector(':scope > .ms-note__line') : e;
    const text = (lineEl?.innerText || '').replace(/\s+/g, ' ').trim();
    const range = document.createRange();
    range.selectNodeContents(e);
    const mids = [];
    for (const x of range.getClientRects()) {
      if (x.width < 0.5 || x.height < 0.5) continue;
      const m = x.top + x.height / 2;
      if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m);
    }
    const btn = e.querySelector(':scope > .ms-note__more');
    return {
      sel, text,
      words: text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
      lines: mids.length,
      cut: !!lineEl && lineEl.scrollWidth > lineEl.clientWidth + 1,
      details: btn ? { expanded: btn.getAttribute('aria-expanded'), controls: btn.getAttribute('aria-controls'), label: btn.textContent.trim() } : null,
    };
  }), sel);
}
function check(found, bad, where, { words = WORDS } = {}) {
  for (const m of found) {
    const why = [m.lines > 1 ? `${m.lines} lines` : '', m.words > words ? `${m.words} words` : '', m.cut ? 'cut off' : '',
      m.details && m.details.expanded !== 'false' ? `Details aria-expanded="${m.details.expanded}" before a click` : ''].filter(Boolean);
    if (why.length) bad.push(`${where} ${m.sel}: ${why.join(', ')}: "${m.text}"`);
  }
}

/** Click (or press `key` on) a note's Details button: it opens a list with `want` in it, and closes again. */
async function details(page, hostSel, { want = null, key = null } = {}) {
  const btn = page.locator(`${hostSel} > .ms-note__more`).first();
  if (!(await btn.count())) return `${hostSel}: no Details button`;
  const listId = await btn.getAttribute('aria-controls');
  const list = page.locator(`[id="${listId}"]`);
  if (!(await list.count())) return `${hostSel}: aria-controls="${listId}" names no element`;
  if (await list.isVisible()) return `${hostSel}: the list shows before a click`;
  if (key) { await btn.focus(); await page.keyboard.press(key); } else await btn.click();
  await sleep(150);
  if ((await btn.getAttribute('aria-expanded')) !== 'true' || !(await list.isVisible())) return `${hostSel}: Details did not open (${key || 'click'})`;
  const text = (await list.innerText()).replace(/\s+/g, ' ');
  if (want && !want.test(text)) return `${hostSel}: the list does not say ${want}: "${text.slice(0, 200)}"`;
  if (key) { await page.keyboard.press(key); } else await btn.click();
  await sleep(150);
  if ((await btn.getAttribute('aria-expanded')) !== 'false' || (await list.isVisible())) return `${hostSel}: Details did not close`;
  return null;
}

export function registerFixDensityTests(suite) {
  for (const [slug, site] of BOARDS) {
    for (const vp of VIEWPORTS) {
      const [label, , , phone] = vp;
      suite.test(`fix-density: ${slug} ${label}: the stats line, the chart's notes (Clusters, Ranges), the legend, the tagline, the map's note and the empty state are one line each, details behind "Details"`, async (ctx) => {
        const st = await serveDist();
        if (!st) skip('no build with a beta copy (npm run build, or BETA_QA_DIST=<dir>)');
        const list = boardList(st, site, slug);
        if (!list) skip(`no ${slug} snapshot in this build`);
        const { page: p, errors } = await page(ctx, st, vp);
        const base = `${st.origin}/melon-seek/${site}`;
        const bad = [];
        await go(p, `${base}#c=${slug}`);
        const stats = await measure(p, '#statsLine');
        const notes = await measure(p, '#chartHost .ms-chart__foot');
        assert(stats.length === 1 && notes.length === 1, `the stats line (${stats.length}) and the chart's notes (${notes.length}) are on screen`);
        check(stats, bad, 'chart');
        check(notes, bad, 'chart');
        if (phone) check(await measure(p, '#tagline'), bad, 'chart');
        // UX-57 (fix-phone-controls): in Chart view the stats line is its one line, and its facts are in the chart
        // notes' Details, so the view has one Details.
        for (const m of notes) if (!m.details) bad.push(`${m.sel}: no Details button`);
        for (const m of stats) if (m.details) bad.push(`${m.sel}: a second Details button in the Chart view (UX-57)`);
        // The facts are still there, one click away (and the exchange rates' date, MR-2).
        const e1 = await details(p, '#chartHost .ms-chart__foot', { want: /Pay is yearly/ });
        if (e1) bad.push(e1);
        const e2 = await details(p, '#chartHost .ms-chart__foot', { want: /show pay/ });
        if (e2) bad.push(e2);
        // Ranges: the notes line and a one-row legend.
        await go(p, `${base}#c=${slug}&v=ranges`);
        check(await measure(p, '#chartHost .ms-chart__foot'), bad, 'ranges');
        const legend = await p.evaluate(() => { const l = document.querySelector('#chartHost .ms-chart__legend'); if (!l || l.hidden) return null; const b = l.getBoundingClientRect(); return { h: Math.round(b.height), scrolls: l.scrollWidth > l.clientWidth + 1, tab: l.tabIndex }; });
        // D-51 (desktop QA round 4, fix-viz-5): from 861 px up the legend wraps so every key shows without a hidden
        // sideways scroll; one row is the phone rule only.
        if (legend && legend.h > 26 && phone) bad.push(`ranges legend: ${legend.h}px tall, more than one row`);
        if (legend && legend.scrolls && legend.tab !== 0) bad.push('ranges legend: scrolls sideways but cannot take keyboard focus');
        // Map: the Pay legend's note.
        await go(p, `${base}#c=${slug}&m=map`, 1800);
        const pay = await measure(p, '#mapHost .ms-modes__paywhat');
        if (!pay.length) bad.push('map: no Pay legend note');
        check(pay, bad, 'map');
        const e3 = await details(p, '#mapHost .ms-modes__paywhat', { want: /exchange rates/ });
        if (e3) bad.push(e3);
        // Empty state: one short body line.
        await go(p, `${base}#c=${slug}&q=zzqxnomatch`, 500);
        const empty = await measure(p, '#vizOverlay .state-card p, #resultsList .state-card p');
        if (!empty.length) bad.push('no empty-state message');
        check(empty, bad, 'empty');
        assert(!bad.length, `${bad.length} line(s) over the budget (one line, ${WORDS} words, nothing cut off):\n  ${bad.join('\n  ')}`);
        assert(!errors.length, errors.join(' | '));
      });

      suite.test(`fix-density: ${slug} ${label}: the Insights and Pay estimate captions and the drawer's pay block lines are one line each, details behind "Details"`, async (ctx) => {
        const st = await serveDist();
        if (!st) skip('no build with a beta copy (npm run build, or BETA_QA_DIST=<dir>)');
        const list = boardList(st, site, slug);
        if (!list) skip(`no ${slug} snapshot in this build`);
        const { page: p, errors } = await page(ctx, st, vp);
        const base = `${st.origin}/melon-seek/${site}`;
        const bad = [];
        await go(p, `${base}#c=${slug}&m=insights`, 600);
        // Amazon's 22,000 postings take a moment to sum up.
        await p.waitForFunction(() => /roles/.test(document.querySelector('#insightsPanel .ms-insights__sub .ms-note__line')?.textContent || ''), null, { timeout: 45000 }).catch(() => {});
        await sleep(400);
        const head = await measure(p, '#insightsPanel .ms-insights__sub');
        assert(head.length === 1, 'the Market insights header is on screen');
        check(head, bad, 'insights');
        check(await measure(p, '#insightsHost .msi-card__sub'), bad, 'insights');
        check(await measure(p, '#compHost .ms-comp__sub'), bad, 'insights');
        const e1 = await details(p, '#insightsPanel .ms-insights__sub', { want: /exchange rates/ });
        if (e1) bad.push(e1);
        // The drawer of the first role in the list (Highest pay), and of a role with no pay.
        await go(p, `${base}#c=${slug}`);
        const first = await p.evaluate(() => document.querySelector('#resultsList .card')?.dataset.id);
        if (first) {
          await go(p, `${base}#c=${slug}&job=${encodeURIComponent(first)}`, 900);
          const lines = [...await measure(p, '#drawer .d-pay-note'), ...await measure(p, '#drawer .d-pct-text'), ...await measure(p, '#drawer .dist-caption'), ...await measure(p, '#drawer .dist-approx'), ...await measure(p, '#drawer .d-annual')];
          if (!lines.length) bad.push('drawer: no pay block lines');
          check(lines, bad, 'drawer');
          check(await measure(p, '#drawer .d-tiers li'), bad, 'drawer');
          const e2 = await details(p, '#drawer .d-pay-note', { want: /How pay is read/ });
          if (e2) bad.push(e2);
        }
        const nopay = list.jobs.find((j) => j.salary == null);
        if (nopay) {
          await go(p, `${base}#c=${slug}&job=${encodeURIComponent(jobKey(slug, nopay.id))}`, 900);
          check(await measure(p, '#drawer .d-comp-note'), bad, 'drawer, no pay');
        }
        assert(!bad.length, `${bad.length} line(s) over the budget (one line, ${WORDS} words, nothing cut off):\n  ${bad.join('\n  ')}`);
        assert(!errors.length, errors.join(' | '));
      });
    }
  }

  // Fix wave 5 (fix5-data's display patch, folded in here): a stated minimum (VT-17) and pay that includes the
  // top shift differential (VT-18) keep the one-line pay caption; the detail is in Details.
  for (const vp of [VIEWPORTS[1], VIEWPORTS[2]]) {
    suite.test(`fix-density: ${vp[0]}: Amazon's minimum and shift-pay roles keep one caption line; "the offer can be higher" and the starting base are under Details`, async (ctx) => {
      const st = await serveDist();
      if (!st) skip('no build with a beta copy (npm run build, or BETA_QA_DIST=<dir>)');
      if (!boardList(st, 'beta/', 'amazon')) skip('no amazon snapshot in this build');
      const { page: p, errors } = await page(ctx, st, vp);
      const base = `${st.origin}/melon-seek/beta/`;
      await go(p, `${base}#c=amazon`);
      const ids = await p.evaluate(async () => {
        const r = await (await import(new URL('api.js', location.href).href)).getJobs({ company: 'amazon' });
        const min = r.jobs.find((j) => j.salary && j.salary.kind === 'minimum');
        const shift = r.jobs.find((j) => j.salary && j.salary.includesShiftDifferential && j.salary.statedBase);
        return { min: min?.id || null, shift: shift?.id || null };
      });
      if (!ids.min && !ids.shift) skip('no minimum or shift-pay Amazon role in this build (fix wave 5 data)');
      const bad = [];
      for (const [id, line, want] of [[ids.min, /^Posted minimum base pay$/, /the offer can be higher/], [ids.shift, /^Posted pay, including shift pay$/, /Base pay starts at/]]) {
        if (!id) continue;
        await go(p, `${base}#c=amazon&job=${encodeURIComponent(id)}`, 900);
        const lines = [...await measure(p, '#drawer .d-pay-note'), ...await measure(p, '#drawer .d-pct-text'), ...await measure(p, '#drawer .dist-caption'), ...await measure(p, '#drawer .dist-approx'), ...await measure(p, '#drawer .d-annual')];
        check(lines, bad, `drawer ${id}`);
        const cap = lines.find((m) => m.sel === '#drawer .d-pay-note');
        if (!cap || !line.test(cap.text)) bad.push(`${id}: caption line "${cap?.text}"`);
        const e = await details(p, '#drawer .d-pay-note', { want });
        if (e) bad.push(`${id}: ${e}`);
      }
      assert(!bad.length, bad.join('\n  '));
      assert(!errors.length, errors.join(' | '));
    });
  }

  suite.test('fix-density: the chart notes\' Details opens and closes from the keyboard (Enter and Space), with aria-expanded, and keeps its caveats', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('no build with a beta copy (npm run build, or BETA_QA_DIST=<dir>)');
    if (!boardList(st, 'beta/', 'google')) skip('no google snapshot in this build');
    const { page: p, errors } = await page(ctx, st, VIEWPORTS[0]);
    await go(p, `${st.origin}/melon-seek/beta/#c=google`);
    const bad = [];
    for (const key of ['Enter', ' ']) {
      const e = await details(p, '#chartHost .ms-chart__foot', { key, want: /converted from another currency at \w{3} \d{4} exchange rates/ });
      if (e) bad.push(`${JSON.stringify(key)}: ${e}`);
    }
    // Every caveat the old line carried is still in the list: the left-out count, the rows' basis, the rates' date.
    const text = await p.locator('#chartHost .ms-chart__foot .ms-note__list').evaluate((e) => e.textContent);
    for (const want of [/with no salary posted/, /median is pay in the US only/, /exchange rates/, /Pay is yearly/]) if (!want.test(text)) bad.push(`the list lost ${want}`);
    // The open state survives a re-render (a filter change re-draws the chart's notes).
    await p.locator('#chartHost .ms-chart__foot > .ms-note__more').click(); await sleep(150);
    await p.selectOption('#groupBy', 'seniority'); await sleep(800);
    if ((await p.locator('#chartHost .ms-chart__foot > .ms-note__more').getAttribute('aria-expanded')) !== 'true') bad.push('the list closed when the chart re-rendered');
    assert(!bad.length, bad.join('\n'));
    assert(!errors.length, errors.join(' | '));
  });
}

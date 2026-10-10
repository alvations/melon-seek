// scripts/methodology.js + scripts/methodology-figures.js: the Juice Score guide (methodology/,
// docs/METHODOLOGY_GUIDE.md with build-time charts) and the technical reference
// (methodology/reference/, docs/LIVABILITY.md as is). Browser checks: test/e2e/methodology.e2e.js.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdToHtml } from '../scripts/md.js';
import * as M from '../scripts/methodology.js';
import * as F from '../scripts/methodology-figures.js';
import * as juice from '../server/juice.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CITIES = JSON.parse(read('data/cities.json'));
const REF = read('docs/LIVABILITY.md');
const GUIDE = fs.existsSync(path.join(ROOT, 'docs', 'METHODOLOGY_GUIDE.md')) ? read('docs/METHODOLOGY_GUIDE.md') : null;
const ctx = F.figureContext({ juice, cities: CITIES });

/** A stub guide with every placeholder of the contract (what the build must be able to fill). */
const STUB = [
  '<!-- description: Stub guide for tests. -->', '# Stub guide', '', 'Intro: {{value:example.gross}} in {{value:example.city}}.', '',
  '## 1. The formula', '', ...F.FIGURES.flatMap((f) => [`{{figure:${f}}}`, '']),
  '## 2. Values', '', ...F.VALUES.map((v) => `- ${v}: {{value:${v}}}`), '',
  '## 5. Limitations', '', '**Pay it doesn\'t count**', '', '- Equity.', '',
  '## 9. The full technical reference', '', 'See [the reference](reference/) and [its tax model](reference/#3-tax-model).', '',
].join('\n');
const stubPage = M.renderGuidePage({ md: STUB, figures: ctx, referenceMd: REF, sha: 'abcdef1234567890' });
const refPage = M.renderReferencePage({ md: REF });
const visibleText = (html) => html.replace(/<code>[^<]*<\/code>/g, '').replace(/<[^>]+>/g, ' ');
const refIds = mdToHtml(REF).headings.map((h) => h.id);

function checkAccessibleCharts(html) {
  const svgs = [...html.matchAll(/<svg class="mf-svg[^"]*" role="img" aria-labelledby="([\w-]+)-t \1-d"/g)].map((m) => m[1]);
  assert.ok(svgs.length >= 7, `charts found: ${svgs.length}`); // waterfall, 3 household bars, score curve, grade ruler, tax split
  for (const id of svgs) {
    assert.match(html, new RegExp(`<title id="${id}-t">[^<]{8,}</title><desc id="${id}-d">[^<]{20,}</desc>`), `${id}: <title> and <desc>`);
  }
  // Every role="img" chart is one of these (none without a title and desc).
  assert.equal((html.match(/role="img"/g) || []).length, svgs.length);
  // Every chart has its numbers outside the picture (a table or the figure's own text).
  for (const name of ['waterfall', 'score-curve', 'tax-split']) assert.match(html, new RegExp(`id="fig-${name}"[\\s\\S]*?Show the numbers[\\s\\S]*?<table>`), `${name}: data table`);
}

test('every figure and value of the placeholder contract renders (stub guide)', () => {
  assert.ok(!stubPage.includes('{{'), 'no literal "{{"');
  assert.doesNotMatch(visibleText(stubPage), /\bundefined\b|\bNaN\b|\[object/);
  for (const f of F.FIGURES) assert.match(stubPage, new RegExp(`<figure class="mf mf--${f}" id="fig-${f}" data-figure="${f}">`), f);
  for (const v of F.VALUES) assert.match(stubPage, new RegExp(`<li>${v.replace(/\./g, '\\.')}: [^<{]+</li>`), v);
  checkAccessibleCharts(stubPage);
  assert.match(stubPage, /<meta name="description" content="Stub guide for tests\.">/);
  assert.match(stubPage, /<a href="\.\.\/">← Back to the jobs<\/a>/, 'link back to the app');
  assert.match(stubPage, /href="reference\/"/, 'link to the technical reference');
  assert.match(stubPage, /build <code>abcdef123456<\/code>/);
});

test('the guide and the reference are CSP-clean and use the site stylesheet, tokens and theme', () => {
  for (const html of [stubPage, refPage]) {
    assert.doesNotMatch(html, /<style\b/i, 'no <style> element (style-src self)');
    assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, 'no inline handlers');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.match(scripts[0][1], /src="(\.\.\/)+theme-init\.js"/, 'only the theme script (dark-mode parity with the app)');
    assert.equal(scripts[0][2].trim(), '');
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/)+styles\.css">/);
  }
  // Chart colours come from classes (site tokens), never from hex in the markup.
  assert.doesNotMatch(stubPage, /\s(fill|stroke)="#/);
  const css = M.METHODOLOGY_CSS;
  assert.doesNotMatch(css, /url\(|@import|https?:/, 'no external assets or fonts');
  for (const sel of [':root:not([data-theme="light"])', ':root[data-theme="dark"]']) assert.ok(css.includes(sel), `dark tokens under ${sel}`);
  assert.match(css, /\.doc-body \.mf svg\.mf-svg \{[^}]*width: 100%/, 'charts override the site\'s 18 px icon rule');
});

test('the score curve is drawn across the whole plot (regression: the site icon rule shrank it to 18 px)', () => {
  const fig = F.renderFigure('score-curve', ctx);
  const plot = /<svg class="mf-plot"([^>]*)>\s*<path class="mf-curve" d="M([^"]+)"/.exec(fig);
  assert.ok(plot, 'nested plot with the curve');
  assert.match(plot[1], /style="width:100%;height:\d+px"/, 'inline size beats the bare-svg rule');
  assert.match(plot[1], /viewBox="0 0 1000 100" preserveAspectRatio="none"/);
  const pts = plot[2].split('L').map((p) => p.split(',').map(Number));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  assert.equal(Math.min(...xs), 0);
  assert.equal(Math.max(...xs), 1000, 'spans the full x range');
  assert.equal(Math.max(...ys), 100, 'starts at score 0');
  assert.ok(Math.min(...ys) < 2, 'reaches the top (score > 98)');
  for (let k = 1; k < pts.length; k++) assert.ok(xs[k] > xs[k - 1] && ys[k] <= ys[k - 1], 'monotone');
});

test('values are the live code\'s numbers', () => {
  const sf = CITIES.cities.find((c) => c.key === F.EXAMPLE.city);
  const j = juice.computeJuice(F.EXAMPLE.salaryUSD, sf, { household: 'single', baselineUSD: CITIES.baseline.nycBasketUSD });
  const v = (k) => F.valueOf(k, ctx);
  assert.equal(v('example.city'), sf.name);
  assert.equal(v('example.gross'), F.usd(j.gross));
  assert.equal(v('example.tax'), F.usd(j.tax));
  assert.equal(v('example.rent'), F.usd(j.rent));
  assert.equal(v('example.living'), F.usd(j.living));
  assert.equal(v('example.net'), F.usd(j.gross - j.tax - j.rent - j.living), 'the waterfall adds up');
  assert.equal(v('example.score'), String(j.score));
  assert.equal(v('example.grade'), j.grade);
  assert.equal(v('cities.count'), String(CITIES.cities.length));
  assert.equal(v('countries.count'), String(new Set(CITIES.cities.map((c) => c.country)).size));
  assert.equal(v('score.k'), F.usd(juice.SCORE_ANCHORS.K));
  assert.equal(v('score.fullGlass'), F.usd(juice.SCORE_ANCHORS.fullGlassUSD));
  assert.equal(v('household.couple.scale'), juice.livingScaleFor('couple').toFixed(2));
  assert.equal(v('fx.asOf'), F.fmtDate(juice.FX_AS_OF));
  const conf = ['high', 'medium', 'low'].map((k) => Number(v(`confidence.${k}`)));
  assert.equal(conf.reduce((a, b) => a + b, 0) + ctx.confidence.none, CITIES.cities.length);
  assert.throws(() => F.valueOf('example.nope', ctx), /unknown placeholder \{\{value:example\.nope\}\}/);
  assert.throws(() => F.renderFigure('nope', ctx), /unknown placeholder \{\{figure:nope\}\}/);
});

test('grade thresholds are rounding-aware: the smallest net whose shown (rounded) score reaches the grade', () => {
  for (const g of juice.GRADES.filter((x) => x.min > 0)) {
    const n = F.netForShownScore(juice, g.min);
    const shown = (x) => Math.round(juice.scoreFromNet(x));
    assert.ok(shown(n) >= g.min && shown(n - 1) < g.min, `${g.label} starts at ${n}`);
    assert.equal(juice.gradeFor(shown(n), n), g.label);
    assert.notEqual(juice.gradeFor(shown(n - 1), n - 1), g.label);
    assert.equal(F.valueOf(`grade.${g.label.toLowerCase()}.net`, ctx), F.usd(n));
    // Same number in the grades and score-curve figures.
    assert.ok(F.renderFigure('grades', ctx).includes(`${F.usd(n)} or more left a year`), `grades figure: ${g.label}`);
    assert.ok(F.renderFigure('score-curve', ctx).includes(`${g.label} starts at ${g.min}: ${F.usd(n)} left a year`), `score curve: ${g.label}`);
  }
  assert.equal(F.netForShownScore(juice, 100), juice.SCORE_ANCHORS.fullGlassUSD, 'same rule as the full glass');
});

test('figures follow the data: a refreshed rent changes the page (nothing is hard-coded)', () => {
  const doc = structuredClone(CITIES);
  const sf = doc.cities.find((c) => c.key === F.EXAMPLE.city);
  sf.rent1brCenterLocal *= 2;
  sf.rent1brCenterUSD *= 2;
  const ctx2 = F.figureContext({ juice, cities: doc });
  assert.notEqual(F.valueOf('example.rent', ctx2), F.valueOf('example.rent', ctx));
  assert.ok(F.renderFigure('waterfall', ctx2).includes(F.valueOf('example.net', ctx2)));
  assert.ok(F.renderFigure('waterfall', ctx2) !== F.renderFigure('waterfall', ctx));
  // Sources: the as-of dates and the refresh cadence come from the data and data/freshness.json.
  sf.sources.rent1brCenterLocal.asOf = '2031-01';
  const fresh = { entries: [{ id: 'rents-1br-quoted', cadence: 'monthly' }] };
  const src = F.renderFigure('sources', F.figureContext({ juice, cities: doc, freshness: fresh }));
  assert.match(src, /Rent, 1 bedroom<\/th>[\s\S]*?–January 2031<\/td><td data-label="Refreshed">Monthly<\/td>/);
});

test('the sources table speaks plain words: agencies spelled out, no stray abbreviations', () => {
  const text = visibleText(F.renderFigure('sources', ctx));
  for (const abbr of ['NSW', 'DWP', 'CSO']) assert.doesNotMatch(text, new RegExp(`\\b${abbr}\\b`), abbr);
  for (const m of text.matchAll(/\b(HUD|ONS|ECB|OECD)\b/g)) {
    // Allowed only right after the spelled-out name, in brackets, or explained.
    assert.match(text.slice(Math.max(0, m.index - 80), m.index + 6), /\(|Organisation/, `${m[1]} explained`);
  }
  assert.doesNotMatch(text, /Big Macs a year|drawer/i, 'no claim about the drawer');
  assert.match(text, /Big Mac index data/, 'exchange rates: their source');
});

test('the real guide renders with every placeholder known and the drawer anchor (skips until it exists)', (t) => {
  if (!GUIDE) return t.skip('docs/METHODOLOGY_GUIDE.md not written yet');
  const html = M.renderGuidePage({ md: GUIDE, figures: ctx, referenceMd: REF });
  assert.ok(!html.includes('{{'));
  assert.match(html, /<h2 id="1-the-formula">/, 'the drawer links to methodology/#1-the-formula');
  for (const f of new Set([...GUIDE.matchAll(/\{\{figure:([\w-]+)\}\}/g)].map((m) => m[1]))) assert.match(html, new RegExp(`data-figure="${f}"`));
  checkAccessibleCharts(html);
  assert.doesNotMatch(visibleText(html), /\bundefined\b|\bNaN\b/);
  for (const id of refIds) assert.match(html, new RegExp(`\\sid="${id}"`), `old link methodology/#${id} still lands on the guide`);
  // The guide's own links into the reference resolve there.
  for (const m of html.matchAll(/href="reference\/#([^"]+)"/g)) assert.ok(refIds.includes(m[1]), `reference/#${m[1]}`);
});

test('anchor map: reference ids the guide links to sit on that section; the rest on the reference index', () => {
  const a = M.guideAnchors({ md: STUB, referenceMd: REF });
  assert.ok(a.guide.has('1-the-formula'));
  assert.ok(!a.index.includes('1-the-formula'), 'the guide has its own #1-the-formula');
  for (const id of refIds) assert.match(stubPage, new RegExp(`\\sid="${id}"`), id);
  assert.match(stubPage, /<span class="g-alias" id="3-tax-model"><\/span>/, 'a reference id the guide links to sits on the linking section');
  assert.ok(a.index.length > 0);
  for (const id of a.index) assert.match(stubPage, new RegExp(`<li id="${id}"><a href="reference/#${id}">`), `${id} lives in the reference index`);
  assert.ok(new Set([...stubPage.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])).size === [...stubPage.matchAll(/\sid="([^"]+)"/g)].length, 'ids are unique');
});

test('the technical reference is docs/LIVABILITY.md as is, one folder down', () => {
  for (const id of refIds) assert.match(refPage, new RegExp(`<h[1-6] id="${id}">`), id);
  const mdTables = (REF.match(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/gm) || []).length;
  assert.equal((refPage.match(/<table>/g) || []).length, mdTables, 'every table');
  assert.match(refPage, /<a href="\.\.\/\.\.\/">← Back to the jobs<\/a>/);
  assert.match(refPage, /<a href="\.\.\/">How it works<\/a>/, 'link to the guide');
  assert.match(refPage, /href="\.\.\/methodology\.css"/);
  if (REF.includes('](../data/cities.json)')) assert.match(refPage, /href="\.\.\/\.\.\/api\/cities\.json"/);
  assert.doesNotMatch(refPage, /href="[^"]*github/i);
});

test('unknown placeholders and a guide without #1-the-formula fail the build loudly', () => {
  const base = '# G\n\n## 1. The formula\n\n';
  assert.throws(() => M.renderGuidePage({ md: `${base}{{figure:nope}}\n`, figures: ctx }), /unknown placeholder \{\{figure:nope\}\}/);
  assert.throws(() => M.renderGuidePage({ md: `${base}Pay {{value:nope}}.\n`, figures: ctx }), /unknown placeholder \{\{value:nope\}\}/);
  assert.throws(() => M.renderGuidePage({ md: `${base}Pay {{vaule:example.gross}}.\n`, figures: ctx }), /unknown placeholder/);
  assert.throws(() => M.renderGuidePage({ md: '# G\n\n## Formula\n\nx', figures: ctx }), (e) => e.code === 'GUIDE_ANCHOR');
});

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-methodology-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('methodologyPages: guide + reference + CSS from the repo; without a guide, methodology/ is the reference', async () => {
  const withGuide = path.join(TMP, 'guide.md');
  fs.writeFileSync(withGuide, STUB);
  const a = await M.methodologyPages({ root: ROOT, guidePath: withGuide, sha: 'x' });
  assert.deepEqual(Object.keys(a.files).sort(), ['index.html', 'methodology.css', 'reference/index.html']);
  assert.deepEqual(a.warnings, []);
  assert.match(a.files['index.html'], /data-figure="waterfall"/);
  const b = await M.methodologyPages({ root: ROOT, guidePath: path.join(TMP, 'missing.md') });
  assert.equal(b.warnings.length, 1);
  assert.match(b.files['index.html'], /<a href="\.\.\/">← Back to the jobs<\/a>/);
  assert.match(b.files['index.html'], /href="\.\.\/styles\.css"/);
  assert.match(b.files['index.html'], /id="1-the-formula"/);
  assert.doesNotMatch(b.files['index.html'], /How it works/, 'no link to a guide that does not exist');
});

test('server mode serves the guide, the reference and the stylesheet like the static build', async (t) => {
  process.env.MELON_CACHE_DIR = path.join(TMP, 'cache');
  process.env.MELON_SNAPSHOT_DIR = path.join(TMP, 'snapshots');
  process.env.MELON_HISTORY_DIR = path.join(TMP, 'history');
  fs.mkdirSync(process.env.MELON_SNAPSHOT_DIR, { recursive: true });
  let mod;
  try { mod = await import('../server/index.js'); } catch (err) { return t.skip(`server not loadable: ${err.message}`); }
  const server = mod.createServer({ log: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const get = (p) => fetch(base + p, { redirect: 'manual' });
    for (const [p, to] of [['/methodology', '/methodology/'], ['/methodology/reference', '/methodology/reference/']]) {
      const r = await get(p);
      assert.equal(r.status, 301, p);
      assert.equal(r.headers.get('location'), to);
    }
    const ref = await get('/methodology/reference/');
    assert.equal(ref.status, 200);
    assert.match(ref.headers.get('content-security-policy') || '', /script-src 'self'/);
    const refHtml = await ref.text();
    for (const id of refIds) assert.ok(refHtml.includes(`id="${id}"`), id);
    const css = await get('/methodology/methodology.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.equal(await css.text(), M.METHODOLOGY_CSS);
    const guide = await get('/methodology/');
    assert.equal(guide.status, 200);
    const html = await guide.text();
    assert.match(html, /id="1-the-formula"/);
    if (GUIDE) assert.match(html, /data-figure="/, 'the guide with its charts');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

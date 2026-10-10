// scripts/refresh/derived.js (generated docs, counts, share card, test pins),
// scripts/refresh/examples.js (the worked-example tables) and
// public/features/freshness.js (the "as of" labels). Offline: everything is
// computed from the repo's own code and data; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as D from '../scripts/refresh/derived.js';
import * as EX from '../scripts/refresh/examples.js';
import * as J from '../server/juice.js';
import * as FR from '../public/features/freshness.js';
import { runRefresh } from '../scripts/refresh/run.js';
import { mdToHtml } from '../scripts/md.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const NOW = new Date('2026-10-10T12:00:00Z');

/** A ctx like lib.js makeContext() builds, reading the repo with per-file overrides (an overlay). */
function ctx(overrides = {}, { registry = { entries: [] }, now = NOW } = {}) {
  const read = (rel) => (rel in overrides ? overrides[rel] : fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const byId = new Map(registry.entries.map((e) => [e.id, e]));
  return {
    root: ROOT, offline: true, dryRun: true, now, today: now.toISOString().slice(0, 10),
    readText: read, readJson: (rel) => JSON.parse(read(rel)), exists: (rel) => rel in overrides || fs.existsSync(path.join(ROOT, rel)),
    entry: (id) => byId.get(id), log: () => {},
    fetchText: async (url) => { throw Object.assign(new Error(`no fixture for ${url}`), { code: 'FIXTURE_MISSING' }); },
  };
}
const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));
const LIV = fs.readFileSync(path.join(ROOT, 'docs', 'LIVABILITY.md'), 'utf8');
const render = (id) => EX.renderBlock(id, J, CITIES);

/* ------------------------------------------------------------ examples.js */

test('examples: tables are computed from computeJuice and cities.json, in the docs format', () => {
  const rows = EX.expectedRows('juice-worked-examples/single', J, CITIES);
  assert.equal(rows.length, EX.WORKED_EXAMPLES.length);
  const sf = J.computeJuice(300000, CITIES.cities.find((c) => c.key === 'san-francisco-ca-us'), { baselineUSD: CITIES.baseline.nycBasketUSD });
  assert.deepEqual(rows[0], ['Software engineer, San Francisco', '300,000 USD', EX.usd(sf.gross), EX.usd(sf.tax), EX.usd(sf.rent), EX.usd(sf.living), EX.usd(sf.net), String(sf.score), `${sf.grade}${sf.estimated ? ' (est.)' : ''}`, sf.confidence]);
  assert.equal(EX.usd(-1352.4), '−$1,352', 'negatives use U+2212 like the hand-written tables');
  const hh = EX.expectedRows('juice-worked-examples/household', J, CITIES);
  assert.equal(hh.length, EX.HOUSEHOLD_EXAMPLES.length * 3);
  assert.equal(hh[0][0], "Research engineer, San Francisco (the user's example)", 'the $675K case is first');
  assert.deepEqual(hh.slice(0, 3).map((r) => r[2]), ['Just me (1 bed)', 'Couple (2 bed)', 'Family (3 bed)']);
  // Score legend: the rounding-aware threshold (what the shown score needs) and GRADES.
  const legend = EX.renderBlock('juice-worked-examples/score-legend', J, CITIES);
  assert.ok(legend.includes(`≥ ${EX.usd(EX.netForShownScore(J, 70))}`) && legend.includes(`100 = ${EX.usd(J.SCORE_ANCHORS.fullGlassUSD)}.`));
  // Tax table: one row per TAX_SOURCES key.
  assert.equal(EX.expectedRows('juice-worked-examples/tax-sources', J, CITIES).length, Object.keys(J.TAX_SOURCES).length);
  // Deterministic.
  for (const b of EX.BLOCKS) assert.equal(render(b), render(b), b);
});

/* ------------------------------------------------------------ marker blocks (auto) */

test('derived: offline, marker blocks are regenerated deterministically and then stay put', async () => {
  const marked = D.insertMarkers(LIV, render);
  assert.deepEqual(D.parseBlocks(marked).map((b) => b.id).sort(), [...EX.BLOCKS].sort(), 'every generated table is wrapped');
  assert.equal(D.insertMarkers(marked, () => { throw new Error('no re-render of marked blocks'); }), marked, 'insertMarkers is idempotent');
  // Doctor one generated row: the module regenerates it ('changed' + writes).
  const stale = marked.replace(/(<!-- freshness:begin juice-worked-examples\/single -->[\s\S]*?\| Software engineer, Austin \| 150,000 USD \| )\$[\d,]+/, '$1$999,999');
  assert.notEqual(stale, marked);
  const r1 = byId(await D.check(ctx({ [D.LIVABILITY]: stale })))['juice-worked-examples'];
  assert.equal(r1.status, 'changed', r1.summary);
  assert.equal(r1.mode, 'auto');
  assert.deepEqual(r1.writes.map((w) => w.file), [D.LIVABILITY]);
  assert.equal(r1.writes[0].content, marked, 'regenerated text equals a fresh render');
  // Run again on its own output: nothing to do, and the same bytes both times.
  const r2 = byId(await D.check(ctx({ [D.LIVABILITY]: r1.writes[0].content })))['juice-worked-examples'];
  assert.equal(r2.status, 'ok', r2.summary);
  assert.equal(r2.writes.length, 0);
  const r3 = byId(await D.check(ctx({ [D.LIVABILITY]: stale })))['juice-worked-examples'];
  assert.equal(r3.writes[0].content, r1.writes[0].content, 'deterministic');
});

test('derived: the worked examples go to the archive every month (a time series of the same jobs)', async () => {
  const r = byId(await D.check(ctx()))['juice-worked-examples'];
  assert.ok(r.archive, 'Result.archive present');
  assert.equal(r.archive.dataset, 'juice-worked-examples');
  assert.equal(r.archive.asOf, '2026-10-10');
  const rows = r.archive.json.rows;
  assert.equal(rows.length, EX.WORKED_EXAMPLES.length + EX.HOUSEHOLD_EXAMPLES.length * 3);
  const sf675 = rows.find((x) => x.table === 'household' && x.amount === 675000 && x.household === 'single');
  const j = EX.exampleJuice(J, CITIES, EX.HOUSEHOLD_EXAMPLES[0], 'single');
  assert.deepEqual([sf675.net, sf675.score, sf675.tax], [j.net, j.score, j.tax], 'the San Francisco $675K case, as computed today');
  assert.ok(sf675.inputsAsOf.rent && sf675.inputsAsOf.tax.length);
  JSON.parse(JSON.stringify(r.archive.json)); // plain JSON
});

test('derived: a hand-edited table header ("Verified 2026-10-02") survives regeneration', () => {
  const custom = '| Key | Rule | As of | Verified 2026-10-02 | Source |';
  const text = LIV.replace(/^\| Key \| Rule \| As of \|[^\n]*$/m, custom);
  assert.ok(text.includes(custom));
  const marked = D.insertMarkers(text, render);
  const block = D.parseBlocks(marked).find((b) => b.id === 'juice-worked-examples/tax-sources');
  assert.ok(block, 'tax table wrapped');
  assert.equal(block.content.split('\n')[0], custom);
  assert.equal(D.replaceBlocks(marked, render).text, marked, 'regeneration keeps the header');
  // A header with a different column count is replaced by the generated one.
  assert.equal(D.keepHeader('juice-worked-examples/tax-sources', render('juice-worked-examples/tax-sources'), '| Key | Rule | As of |'), render('juice-worked-examples/tax-sources'));
});

test('derived: without markers, the hand-written tables are checked (detect) and a doctored row is drift', async () => {
  const doctored = LIV.replace(/^(\| Engineer, Berlin \| 90,000 EUR \| )\$[\d,]+/m, '$1$1');
  const r = byId(await D.check(ctx({ [D.LIVABILITY]: D.parseBlocks(LIV).length ? LIV : doctored })))['juice-worked-examples'];
  if (D.parseBlocks(LIV).length) return; // markers already applied: the auto path is covered above
  assert.equal(r.mode, 'detect');
  assert.equal(r.status, 'drift');
  assert.ok(r.findings.some((f) => /single row 7/.test(f.key) && /Berlin/.test(f.official)), JSON.stringify(r.findings.slice(0, 3)));
});

/* ------------------------------------------------------------ detect rules */

test('derived: detect mode flags a doctored README count', async () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const n = CITIES.cities.length;
  assert.match(readme, new RegExp(`the Juice Score inputs \\(${n} cities\\)`), 'the real README states the real count');
  const doctored = readme.replace(`the Juice Score inputs (${n} cities)`, `the Juice Score inputs (${n - 1} cities)`);
  const r = byId(await D.check(ctx({ 'README.md': doctored })))['readme-counts'];
  assert.equal(r.status, 'drift', r.summary);
  const f = r.findings.find((x) => x.key === 'cities in api/cities.json');
  assert.ok(f, JSON.stringify(r.findings.map((x) => x.key)));
  assert.equal(f.encoded, String(n - 1));
  assert.equal(f.official, String(n));
  // The undoctored README has no finding for that rule.
  const ok = byId(await D.check(ctx()))['readme-counts'];
  assert.ok(!ok.findings.some((x) => x.key === 'cities in api/cities.json'));
});

test('derived: rules compare lists, numbers and anchors; a reworded sentence is an error, not a silent ok', () => {
  const F = { cityCount: 89, stable: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], backtest: { seed: 7, maxN: 9 } };
  const rules = D.README_RULES.filter((r) => ['cities in api/cities.json', 'built-in companies (intro)', 'Compstimate backtest seed and size'].includes(r.key));
  const text = 'the Juice Score inputs (89 cities) **Company switcher** — built-in C, A\n  and B, plus x. seed 7, up to 9 jobs';
  assert.deepEqual(D.runRules(rules, F, () => text), { findings: [], missing: [], checked: 3 });
  const bad = D.runRules(rules, F, () => text.replace('seed 7', 'seed 8').replace('built-in C, A', 'built-in C'));
  assert.deepEqual(bad.findings.map((f) => f.key).sort(), ['Compstimate backtest seed and size', 'built-in companies (intro)']);
  const gone = D.runRules(rules, F, () => 'nothing here');
  assert.equal(gone.missing.length, 3);
  assert.deepEqual(D.nameList('Anthropic, Anduril, OpenAI and\n Shield AI'), ['Anthropic', 'Anduril', 'OpenAI', 'Shield AI']);
});

test('derived: docs-counts reads its figures from the docs, and every rule finds its anchor', async () => {
  const r = byId(await D.check(ctx()))['docs-counts'];
  assert.ok(['ok', 'drift'].includes(r.status), `${r.status}: ${r.summary}`);
  assert.ok(!r.findings.some((f) => /anchor text not found/.test(f.note || '')), `rules without an anchor: ${r.findings.filter((f) => /anchor/.test(f.note || '')).map((f) => f.key).join(', ')}`);
  // A doctored figure is caught.
  const doctored = LIV.replace(/A rounded \*\*100 needs at least \$[\d,]+ net\*\*/, 'A rounded **100 needs at least $400,000 net**');
  const d = byId(await D.check(ctx({ [D.LIVABILITY]: doctored })))['docs-counts'];
  assert.ok(d.findings.some((f) => f.key === 'full glass net' && f.encoded === '400,000'), JSON.stringify(d.findings.map((f) => f.key)));
});

/* ------------------------------------------------------------ methodology, share card, pins */

test('derived: the methodology page never shows marker comments (md.js must drop them)', async () => {
  const dropped = !/freshness:/.test(mdToHtml('a\n\n<!-- freshness:begin x/y -->\n\nb').html);
  const marked = D.insertMarkers(LIV, render);
  const r = byId(await D.check(ctx({ [D.LIVABILITY]: marked })))['methodology-page'];
  assert.equal(r.status, dropped ? 'ok' : 'flag', r.summary);
  if (!dropped) assert.ok(r.findings.some((f) => f.key === 'marker comments visible'));
  // The real doc renders cleanly as it is (fails if markers land before the md.js patch).
  const real = byId(await D.check(ctx()))['methodology-page'];
  assert.equal(real.status, 'ok', `${real.summary} ${JSON.stringify(real.findings)}`);
});

test('derived: share card figures add up and the PNG matches its recorded source', async () => {
  const card = fs.readFileSync(path.join(ROOT, D.OG_CARD), 'utf8');
  const fig = D.cardFigures(card);
  assert.ok(fig.illustrative, 'card says its numbers are illustrative');
  assert.equal(fig.rows.reduce((a, b) => a + b, 0), fig.roles, 'headline count = sum of the rows');
  const ok = byId(await D.check(ctx()))['og-card'];
  assert.ok(['ok', 'stale'].includes(ok.status), `${ok.status}: ${ok.summary} ${JSON.stringify(ok.findings)}`);
  assert.ok(ok.checklist.length >= 3, 'manual entry carries its checklist');
  // Edit the card without re-rendering: drift, with both the hash and the arithmetic findings.
  const edited = card.replace(/(Median <tspan class="t-strong">\$\d+K<\/tspan> · )(\d+)( roles)/, (m, a, n, b) => `${a}${Number(n) + 1}${b}`);
  const r = byId(await D.check(ctx({ [D.OG_CARD]: edited })))['og-card'];
  assert.equal(r.status, 'drift');
  assert.deepEqual(r.findings.map((f) => f.key).sort(), ['card.html changed since the PNG was rendered', 'headline count = sum of rows']);
  // Past its review date with nothing wrong: stale.
  const old = { entries: [{ id: 'og-card', cadence: 'yearly', graceDays: 30, asOf: '2024-01-01', lastChecked: '2024-01-01' }] };
  assert.equal(byId(await D.check(ctx({}, { registry: old })))['og-card'].status, 'stale');
});

test('derived: pinned test values are found; a unit test pinning a data value is drift', async () => {
  assert.deepEqual(D.pinnedJobIds([['t.e2e.js', "x = 'anthropic:5391376008'; open('c=a&job=openai%3A1234567')"]]).map((p) => p.id), ['anthropic:5391376008', 'openai:1234567']);
  const src = fs.readFileSync(path.join(ROOT, 'test', 'juice.test.js'), 'utf8');
  const doctored = /assert\.equal\(DOC\.bigMac\.asOf, '\d{4}-\d{2}-\d{2}'/.test(src)
    ? src.replace(/assert\.equal\(DOC\.bigMac\.asOf, '\d{4}-\d{2}-\d{2}'/, "assert.equal(DOC.bigMac.asOf, '1999-01-01'")
    : `${src}\nassert.equal(DOC.bigMac.asOf, '1999-01-01', 'x');\n`;
  const r = byId(await D.check(ctx({ 'test/juice.test.js': doctored })))['e2e-pinned-values'];
  assert.equal(r.status, 'drift', r.summary);
  assert.ok(r.findings.some((f) => /Big Mac release date/.test(f.key) && f.official === CITIES.bigMac.asOf));
});

test('derived: check() covers every id once, never throws, and runs inside the orchestrator (dry run)', async () => {
  const results = await D.check(ctx());
  assert.deepEqual(results.map((r) => r.id), D.MODULE.ids);
  for (const r of results) assert.ok(['ok', 'changed', 'drift', 'flag', 'stale', 'error', 'skipped'].includes(r.status), `${r.id}: ${r.status}`);
  // A ctx whose reads all fail: error results, no exception.
  const broken = await D.check({ ...ctx(), readText: () => { throw new Error('disk gone'); }, readJson: () => { throw new Error('disk gone'); } });
  assert.equal(broken.length, D.MODULE.ids.length);
  // Through scripts/refresh/run.js: dry run, offline, nothing written.
  const registry = { format: 'melon-freshness-1', entries: D.MODULE.ids.map((id) => ({ id, description: `test entry ${id}`, type: 'derived-at-build', owners: ['x'], consumers: [{ at: 'x', surface: 'docs' }], source: { name: 'code' }, cadence: 'monthly', mode: 'detect', updater: 'scripts/refresh/derived.js', checklist: ['x'], validator: 'x', before: 'none' })) };
  const before = fs.readFileSync(path.join(ROOT, D.LIVABILITY), 'utf8');
  const report = await runRefresh({ registry, modules: [{ name: 'derived', ids: [...D.MODULE.ids], check: D.check }], dryRun: true, offline: true, now: NOW, log: () => {} });
  assert.deepEqual(report.results.map((r) => r.id).sort(), [...D.MODULE.ids].sort());
  assert.ok(!report.written, 'dry run writes nothing');
  assert.equal(fs.readFileSync(path.join(ROOT, D.LIVABILITY), 'utf8'), before);
});

/* ------------------------------------------------------------ the published subset */

test('publicFreshness: client-safe fields only, staleness at build time and a staleAfter date', () => {
  const reg = { format: 'melon-freshness-1', updated: '2026-10-10', entries: [
    { id: 'fx-per-usd', description: 'FX', type: 'fetched', asOf: '2026-07-01', cadence: 'monthly', graceDays: 14, lastChecked: '2026-10-01', source: { name: 'Big Mac data', url: 'https://example.org/x', licence: 'CC BY 4.0' }, owners: ['server/juice.js:45'], checklist: ['secret step'], notes: 'internal' },
    { id: 'tax-us', description: 'US federal', type: 'static-constant-from-a-source', asOf: '2025-01-01', taxYear: 2025, cadence: 'yearly', graceDays: 60, lastChecked: '2025-01-01', source: { name: 'IRS', url: 'https://www.irs.gov/' } },
    { id: 'old', description: 'retired', retired: '2026-01-01', cadence: 'yearly' },
  ] };
  const pub = D.publicFreshness(reg, { now: NOW });
  assert.equal(pub.format, 'melon-freshness-public-1');
  assert.deepEqual(pub.entries.map((e) => e.id), ['fx-per-usd', 'tax-us']);
  const fx = pub.entries[0];
  assert.deepEqual(Object.keys(fx).sort(), ['asOf', 'cadence', 'description', 'id', 'lastChecked', 'source', 'stale', 'staleAfter', 'type']);
  assert.deepEqual(fx.source, { name: 'Big Mac data', url: 'https://example.org/x' });
  assert.equal(fx.stale, false);
  assert.equal(fx.staleAfter, '2026-11-15', 'lastChecked 2026-10-01 + 31 + 14 days');
  assert.equal(pub.entries[1].taxYear, 2025);
  assert.equal(pub.entries[1].stale, true, 'as of and last checked 2025-01-01: past yearly + 60 days');
  assert.ok(!JSON.stringify(pub).includes('secret step') && !JSON.stringify(pub).includes('server/juice.js'));
  const none = D.publicFreshness(null, { now: NOW });
  assert.deepEqual([none.missing, none.entries], [true, []], 'always a document, never a 404');
});

/* ------------------------------------------------------------ public/features/freshness.js */

const PUB = D.publicFreshness({ entries: [
  { id: 'fx-per-usd', description: 'FX', asOf: '2026-07-01', cadence: 'monthly', graceDays: 14, lastChecked: '2026-10-05', source: { name: 'Big Mac data' } },
  { id: 'tax-us', description: 'US federal', asOf: '2026-01-01', taxYear: 2026, cadence: 'yearly', lastChecked: '2026-10-02', source: { name: 'IRS' } },
  { id: 'tax-us-ca', description: 'California', asOf: '2025-01-01', taxYear: 2025, cadence: 'yearly', graceDays: 0, lastChecked: '2025-06-01', source: { name: 'FTB' } },
  { id: 'rents-1br-quoted', description: 'rents', asOf: '2026-05-01', cadence: 'quarterly', lastChecked: '2026-10-02', source: { name: 'Numbeo' } },
  { id: 'cost-index', description: 'cost index', asOf: '2026-05-01', cadence: 'quarterly', lastChecked: '2026-10-02', source: { name: 'Numbeo' } },
  { id: 'compstimate-model', description: 'levels', asOf: '2026-10-02', cadence: 'quarterly', lastChecked: '2026-10-02', source: { name: 'melon-seek' } },
] }, { now: NOW });

test('freshness.js: formats as-of dates', () => {
  assert.equal(FR.formatAsOf('2026-07-01'), 'Jul 2026');
  assert.equal(FR.formatAsOf('2026-07-01', 'day'), '1 Jul 2026');
  assert.equal(FR.formatAsOf('2026-09'), 'Sep 2026');
  assert.equal(FR.formatAsOf('2026'), '2026');
  assert.equal(FR.formatAsOf('2026-10-09T07:00:00.000Z', 'day'), '9 Oct 2026');
  assert.equal(FR.formatAsOf(Date.parse('2026-10-09T07:00:00Z'), 'day'), '9 Oct 2026', 'epoch ms (app data.fetchedAt)');
  assert.equal(FR.formatAsOf('2025 (brackets) / 2026 (SDI)'), '2025 / 2026');
  assert.equal(FR.formatAsOf('FY2026-27'), 'FY2026-27');
  assert.equal(FR.formatAsOf(null), '');
  assert.equal(FR.taxLabel('US-LOCAL-NYC'), 'NYC');
  assert.equal(FR.taxLabel('US'), 'US');
});

test('freshness.js: labels come from the registry, with stale flags on the viewer clock', () => {
  FR.setFreshness(PUB);
  assert.equal(FR.asOf('fx-per-usd'), '2026-07-01');
  assert.equal(FR.asOfLabel('fx-per-usd', { now: NOW }), 'as of Jul 2026');
  assert.equal(FR.isStale('tax-us-ca', NOW), true);
  assert.equal(FR.asOfLabel('tax-us-ca', { now: NOW }), 'as of Jan 2025', 'fix-viz P-14: the app shows the date only');
  assert.equal(FR.asOfLabel('tax-us-ca', { now: NOW, status: true }), 'as of Jan 2025, update due');
  assert.equal(FR.isStale('fx-per-usd', NOW), false);
  assert.equal(FR.isStale('fx-per-usd', new Date('2027-01-01')), true, 'staleAfter is judged on the viewer clock');
  assert.equal(FR.asOfLabel('nope', { fallback: '2026-09' }), 'as of Sep 2026');
  assert.equal(FR.asOfLabel('nope'), '');
  FR.setFreshness(null);
});

test('freshness.js: Juice block line uses the registry for FX and tax, the city record for rent and living costs', () => {
  const sf = CITIES.cities.find((c) => c.key === 'san-francisco-ca-us');
  const ldn = CITIES.cities.find((c) => c.key === 'london-gb');
  const us = J.computeJuice(300000, sf);
  const gb = J.computeJuice(150000, ldn);
  FR.setFreshness(null);
  // No registry: the data's own dates, still a useful line.
  const plain = FR.juiceAsOfText(us, { now: NOW });
  assert.match(plain, /^Data as of: rent \w{3} \d{4} · living costs \w{3} \d{4} · tax /);
  assert.ok(!/exchange rates/.test(plain), 'a USD salary in a USD city needs no exchange-rate line');
  // FX date from the juice inputs (FX_AS_OF), not a pinned month: the monthly refresh moves it.
  assert.match(FR.juiceAsOfText(gb, { now: NOW }), new RegExp(`exchange rates ${FR.formatAsOf(J.FX_AS_OF)}`), 'FX from the juice inputs (FX_AS_OF)');
  // With the registry: tax years from it, and "update due" only when asked (fix-viz P-14).
  FR.setFreshness(PUB);
  const reg = FR.juiceAsOfText(us, { now: NOW, status: true });
  assert.match(reg, /tax US 2026, CA 2025 \(update due\)/, reg);
  assert.doesNotMatch(FR.juiceAsOfText(us, { now: NOW }), /update due/);
  assert.match(reg, new RegExp(`rent ${FR.formatAsOf(us.inputs.rent.source.asOf)}`), 'rent keeps the city record date');
  const items = FR.juiceAsOf(us, { now: NOW });
  assert.deepEqual(items.find((x) => x.key === 'rent').ids, ['rents-1br-quoted']);
  const fam = J.computeJuice(300000, sf, { household: 'family' });
  const famIds = FR.juiceAsOf(fam).find((x) => x.key === 'rent').ids;
  assert.deepEqual(famIds.slice(0, 2), ['rents-1br-quoted', 'rents-bedroom-ratios']);
  // freshness-col-ui-rent-ids.diff adds the ratio's own source family (e.g. rents-us-hud-fmr)
  assert.ok(famIds.slice(2).every((id) => /^rents-[a-z]{2}-[a-z-]+$/.test(id)), famIds.join());
  assert.equal(FR.juiceAsOfText({ score: 1 }), '', 'no inputs, no line');
  FR.setFreshness(null);
});

test('freshness.js: the map legend line spans the inputs of every job shown', () => {
  assert.equal(FR.monthSpan(['2026-09', '2026-08-01', '2026-09']), 'Aug–Sep 2026');
  assert.equal(FR.monthSpan(['2025-12', '2026-02']), 'Dec 2025–Feb 2026');
  assert.equal(FR.monthSpan([]), '');
  FR.setFreshness(null);
  const pick = (k) => CITIES.cities.find((c) => c.key === k);
  const res = [J.computeJuice(200000, pick('san-francisco-ca-us')), J.computeJuice(150000, pick('london-gb'))];
  const t = FR.juiceSpanText(res, { now: NOW });
  assert.match(t, new RegExp(`^As of: rent \\w{3}(–\\w{3})? \\d{4} · living costs .+ · exchange rates ${FR.formatAsOf(J.FX_AS_OF)} · tax \\d{4}(–\\d{4})?$`), t);
  assert.equal(FR.juiceSpanText([]), '');
  FR.setFreshness(PUB);
  assert.match(FR.juiceSpanText(res, { now: NOW, status: true }), /some inputs due for update$/, 'tax-us-ca is stale in PUB');
  assert.doesNotMatch(FR.juiceSpanText(res, { now: NOW }), /due for update/, 'fix-viz P-14: the map legend shows dates only');
  FR.setFreshness(null);
});

test('freshness.js: market comps and Compstimate lines', () => {
  const market = { fx: { asOf: '2026-07-01' }, companies: [{ slug: 'a', fetchedAt: '2026-10-09T07:00:00Z' }, { slug: 'b', fetchedAt: '2026-10-08T07:00:00Z' }, { slug: 'c', fetchedAt: null }] };
  FR.setFreshness(null);
  assert.equal(FR.marketAsOfText(market, ['a']), 'Postings as of 9 Oct 2026 · exchange rates as of Jul 2026');
  assert.equal(FR.marketAsOfText(market), 'Postings as of 8 Oct 2026 to 9 Oct 2026 · exchange rates as of Jul 2026');
  assert.equal(FR.marketAsOfText(null), '');
  assert.equal(FR.compstimateAsOfText({ fetchedAt: Date.parse('2026-10-09T07:00:00Z'), meta: { compstimate: { computedAt: '2026-10-09T08:00:00Z' } } }), 'Postings as of 9 Oct 2026 · accuracy tested 9 Oct 2026');
  FR.setFreshness(PUB);
  assert.match(FR.compstimateAsOfText({ fetchedAt: '2026-10-09' }), /level model Oct 2026$/);
  FR.setFreshness(null);
  assert.equal(FR.compstimateAsOfText({}), '');
});

test('freshness.js: loads once, and degrades gracefully when api/freshness.json is missing', async () => {
  FR.setFreshness(null);
  let calls = 0;
  const missing = await FR.loadFreshness({ refresh: true, fetchImpl: async () => { calls++; return { ok: false, status: 404, json: async () => ({}) }; } });
  assert.equal(missing, null);
  assert.equal(FR.freshnessDoc(), null);
  assert.equal(FR.asOfLabel('fx-per-usd'), '');
  assert.equal(FR.isStale('fx-per-usd'), false);
  const throwing = await FR.loadFreshness({ refresh: true, fetchImpl: async () => { calls++; throw new Error('offline'); } });
  assert.equal(throwing, null);
  const empty = await FR.loadFreshness({ refresh: true, fetchImpl: async () => ({ ok: true, json: async () => D.publicFreshness(null) }) });
  assert.equal(empty, null, 'an empty published registry counts as missing');
  const good = await FR.loadFreshness({ refresh: true, fetchImpl: async (url) => { calls++; assert.equal(url, 'api/freshness.json'); return { ok: true, json: async () => PUB }; } });
  assert.equal(good, PUB);
  const n = calls;
  await FR.loadFreshness({ fetchImpl: async () => { calls++; return null; } });
  assert.equal(calls, n, 'cached after a success');
  assert.equal(FR.asOf('fx-per-usd'), '2026-07-01');
  FR.setFreshness(null);
});

// Monthly checks over job/company data and comp models (scripts/refresh/jobs.js) and the
// product-policy reviews (scripts/refresh/policy.js). Offline: synthetic snapshots in
// test/fixtures/refresh/jobs/ (node test/fixtures/refresh/jobs/make-fixtures.mjs), real
// captures of the live site's api/market.json, api/companies.json and api/meta/*.json
// (2026-10-10), and the Node release schedule (test/fixtures/refresh/policy/).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeContext, STATUSES, MODES } from '../scripts/refresh/lib.js';
import * as jobs from '../scripts/refresh/jobs.js';
import * as policy from '../scripts/refresh/policy.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'refresh', 'jobs');
const NOW = new Date('2026-10-10T12:00:00Z');
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-jobs-')); TMP.push(d); return d; };
const NONE = path.join(FIX, 'does-not-exist');

function envFor({ snapshots = path.join(FIX, 'snapshots'), history = path.join(FIX, 'history'), archive = NONE } = {}) {
  return { MELON_SNAPSHOT_DIR: snapshots, MELON_HISTORY_DIR: history, MELON_BETA_SNAPSHOT_DIR: NONE, MELON_BETA_HISTORY_DIR: NONE, MELON_ARCHIVE_DIR: archive };
}
function ctxFor(moduleName, env, { now = NOW, offline = true, readText = null, fetchJson = null } = {}) {
  const ctx = makeContext({ moduleName, offline, now, env, registry: { format: 'melon-freshness-1', entries: [] }, log: () => {} });
  if (readText) { const orig = ctx.readText; ctx.readText = (rel) => readText(rel, orig); }
  if (fetchJson) { const orig = ctx.fetchJson; ctx.fetchJson = (url, o) => fetchJson(url, orig, o); }
  return ctx;
}
const byId = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));
const keys = (r) => r.findings.map((f) => f.key).join(' | ');

/** Copy the fixture snapshots (or ledgers) to a temp dir, letting `mutate(doc, slug)` doctor each. */
function copyDir(src, mutate) {
  const dir = tmp();
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
    const out = mutate ? mutate(doc, f.replace(/\.json$/, '')) || doc : doc;
    fs.writeFileSync(path.join(dir, f), JSON.stringify(out));
  }
  return dir;
}
function validResults(rs, ids) {
  assert.deepEqual(rs.map((r) => r.id), [...ids], 'one Result per id, in MODULE order');
  for (const r of rs) {
    assert.ok(STATUSES.includes(r.status), `${r.id}: status ${r.status}`);
    assert.ok(MODES.includes(r.mode), `${r.id}: mode ${r.mode}`);
    assert.equal(typeof r.summary, 'string');
    assert.ok(Array.isArray(r.findings) && Array.isArray(r.evidence) && Array.isArray(r.writes), r.id);
    assert.equal(r.writes.length, 0, `${r.id}: these modules never write files`);
    for (const e of r.evidence) assert.ok(String(e.excerpt).length <= 400, `${r.id}: excerpt <= 400 chars`);
  }
}

let BASE = null;
async function baseline() {
  if (!BASE) BASE = byId(await jobs.check(ctxFor('jobs', envFor())));
  return BASE;
}

// ---------------------------------------------------------------- jobs.js

test('jobs: offline check on the fixtures returns one valid Result per id, no alerts on clean data', async () => {
  const rs = await jobs.check(ctxFor('jobs', envFor()));
  validResults(rs, jobs.MODULE.ids);
  const r = byId(rs);
  for (const id of ['job-postings', 'job-salary-parsed', 'job-salary-usd', 'salary-vetting-flags', 'company-aggregates', 'market-comps', 'jobs-aggregates',
    'compstimate-model', 'compstimate-backtest', 'seniority-ladder', 'role-families', 'keyword-lexicons', 'history-ledger', 'job-juice']) {
    assert.equal(r[id].status, 'ok', `${id}: ${r[id].summary}`);
  }
  // The fixtures hold two synthetic boards, so every real built-in company lacks a snapshot.
  assert.equal(r['company-registry'].status, 'flag');
  assert.match(keys(r['company-registry']), /anthropic snapshot/);
  assert.equal(r['job-postings'].sourceAsOf, '2026-10-09', 'sourceAsOf = newest snapshot date');
  assert.equal(r['history-ledger'].sourceAsOf, '2026-10-09');
  assert.match(r['compstimate-backtest'].summary, /dedupe":"role"/, 'uses server/index.js BACKTEST_OPTS');
  assert.match(r['compstimate-model'].summary, /every banded level inside/);
});

test('jobs-aggregates: archive payload is JSON text in melon-jobs-aggregates-1 and round-trips through readPreviousAggregate', async () => {
  const r = (await baseline())['jobs-aggregates'];
  assert.equal(r.archive.dataset, 'jobs-aggregates');
  assert.equal(r.archive.asOf, '2026-10-09');
  assert.equal(typeof r.archive.json, 'string');
  const doc = JSON.parse(r.archive.json);
  assert.equal(doc.format, jobs.AGGREGATES_FORMAT);
  assert.deepEqual(doc.companies.map((c) => c.slug).sort(), ['acme', 'globex']);
  const acme = doc.companies.find((c) => c.slug === 'acme');
  assert.equal(acme.jobs, 56);
  assert.equal(acme.salaried, 56);
  assert.ok(acme.usd.p50 > 0 && acme.usd.p25 <= acme.usd.p50 && acme.usd.p50 <= acme.usd.p75);
  assert.ok(acme.backtest && acme.backtest.n > 0);
  assert.ok(Array.isArray(doc.market.stable.cells) && doc.market.stable.cells.length > 0);
  assert.deepEqual(doc.market.stable.columns, ['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75']);
  assert.ok(doc.families.some((f) => f.family === 'swe' && f.levels.Senior.n === 14));
  assert.equal(doc.levels.reference, 'Mid');
  assert.ok(doc.ledgers['stable/acme'].entries > 0);
  assert.ok(!('familyUnknownExamples' in acme), 'no posting titles in the aggregate');

  const arch = tmp();
  const dir = path.join(arch, 'reference', 'jobs-aggregates');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09-09.json'), r.archive.json);
  fs.writeFileSync(path.join(dir, '2026-09-09~2.json'), JSON.stringify({ data: { ...doc, asOf: '2026-09-09', note: 'second version, wrapped' } }));
  fs.writeFileSync(path.join(dir, '2026-10-20.json'), JSON.stringify({ ...doc, asOf: '2026-10-20' }));
  fs.writeFileSync(path.join(dir, 'README.txt'), 'not a version');
  const prev = jobs.readPreviousAggregate(arch, '2026-10-09');
  assert.equal(prev.asOf, '2026-09-09');
  assert.equal(prev.note, 'second version, wrapped', 'the later revision of the same date wins and wrappers are unwrapped');
  assert.equal(prev.archivedAs, 'reference/jobs-aggregates/2026-09-09~2.json');
  assert.equal(jobs.readPreviousAggregate(arch, '2026-09-01'), null);
  assert.equal(jobs.readPreviousAggregate(NONE, '2026-10-09'), null);
});

test('jobs: never throws on empty or broken inputs; data checks report skipped', async () => {
  const empty = tmp();
  const rs = await jobs.check(ctxFor('jobs', envFor({ snapshots: empty, history: empty })));
  validResults(rs, jobs.MODULE.ids);
  const r = byId(rs);
  for (const id of ['job-postings', 'market-comps', 'compstimate-backtest', 'salary-vetting-flags', 'history-ledger', 'jobs-aggregates', 'job-juice']) assert.equal(r[id].status, 'skipped', `${id}: ${r[id].summary}`);
  assert.equal(r['jobs-aggregates'].archive, undefined, 'no archive payload without data');

  const broken = tmp();
  fs.writeFileSync(path.join(broken, 'acme.json'), '{ not json');
  fs.writeFileSync(path.join(broken, 'globex.json'), JSON.stringify({ company: { slug: 'globex' }, jobs: 'nope' }));
  const rs2 = await jobs.check(ctxFor('jobs', envFor({ snapshots: broken, history: broken })));
  validResults(rs2, jobs.MODULE.ids);
  assert.match(byId(rs2)['job-postings'].summary, /unreadable|no jobs array/);
});

test('jobs: month-over-month drift and flags fire on doctored data (vetting jump, family coverage, job drop, keywords)', async () => {
  const prev = JSON.parse((await baseline())['jobs-aggregates'].archive.json);
  const arch = tmp();
  fs.mkdirSync(path.join(arch, 'reference', 'jobs-aggregates'), { recursive: true });
  fs.writeFileSync(path.join(arch, 'reference', 'jobs-aggregates', '2026-09-09.json'), JSON.stringify({ ...prev, asOf: '2026-09-09' }));
  const snaps = copyDir(path.join(FIX, 'snapshots'), (doc, slug) => {
    if (slug === 'acme') {
      doc.jobs.slice(0, 12).forEach((j) => { j.salary = { ...j.salary, max: 2_500_000, mid: (j.salary.min + 2_500_000) / 2 }; }); // implausible pay -> quarantined
      doc.jobs.slice(20, 30).forEach((j) => { j.title = 'Zzyzx Qwerty Wibble'; j.department = 'Zzz'; });
      doc.jobs.slice(30, 50).forEach((j) => { j.keywords = { ...j.keywords, skills: [] }; });
    }
    if (slug === 'globex') doc.jobs = doc.jobs.slice(0, 20);
  });
  const r = byId(await jobs.check(ctxFor('jobs', envFor({ snapshots: snaps, archive: arch }))));
  assert.match(r['job-postings'].summary, /vs 2026-09-09/);
  assert.equal(r['salary-vetting-flags'].status, 'flag', r['salary-vetting-flags'].summary);
  assert.match(keys(r['salary-vetting-flags']), /acme quarantined share/);
  assert.match(keys(r['salary-vetting-flags']), /acme quarantined share \|.*|acme critical share/);
  assert.equal(r['role-families'].status, 'drift');
  assert.ok(r['role-families'].findings.some((f) => f.key === 'acme no role family' && f.official > 2 && /Zzyzx/.test(f.note)));
  assert.equal(r['job-postings'].status, 'flag');
  assert.ok(r['job-postings'].findings.some((f) => f.key === 'globex jobs' && f.encoded === 56 && f.official === 20));
  assert.equal(r['keyword-lexicons'].status, 'drift');
  assert.equal(r['compstimate-backtest'].status === 'error', false);
});

test('jobs: LEVEL_INDEX drift when a level pays far off the geometric ladder; never written', async () => {
  const snaps = copyDir(path.join(FIX, 'snapshots'), (doc) => {
    for (const j of doc.jobs) if (j.seniority === 'Staff+') j.salary = { ...j.salary, min: j.salary.min * 2, max: j.salary.max * 2, mid: j.salary.mid * 2 };
  });
  const r = byId(await jobs.check(ctxFor('jobs', envFor({ snapshots: snaps }))))['compstimate-model'];
  assert.equal(r.status, 'drift', r.summary);
  const staff = r.findings.find((f) => /Staff\+/.test(f.key));
  assert.match(staff.note, /outside the data's IQR band/);
  assert.equal(r.writes.length, 0);
  assert.ok(r.checklist.length >= 3);
});

test('jobs: seniority defaults, unread level tokens and ladder drift', async () => {
  const snaps = copyDir(path.join(FIX, 'snapshots'), (doc, slug) => {
    for (const j of doc.jobs) {
      if (j.seniority !== 'Mid') { j.title = j.title.replace(/^(Associate|Senior|Staff) /, ''); j.seniority = 'Mid'; }
    }
    if (slug === 'acme') doc.jobs.slice(0, 6).forEach((j) => { j.title = j.title.replace(/^(Software Engineer|Data Scientist)/, '$1 L5'); });
  });
  const r = byId(await jobs.check(ctxFor('jobs', envFor({ snapshots: snaps }))))['seniority-ladder'];
  assert.equal(r.status, 'drift', r.summary);
  const pooled = r.findings.find((f) => /level is a default/.test(f.key));
  assert.equal(pooled.official, 100);
  assert.match(pooled.note, /outnumbers every explicitly levelled posting/);
  assert.ok(r.findings.some((f) => f.key === 'acme unread level tokens' && /L5/.test(f.note)));
});

test('jobs: backtest drift against the live claim and a hand-written doc figure', async () => {
  const claim = { compstimate: { medianAbsPctError: 40, within10Pct: 1, n: 56, seed: 20261002, computedAt: '2026-10-09T08:00:00.000Z' }, history: { since: null, runs: 0 } };
  const ctx = ctxFor('jobs', envFor(), {
    fetchJson: (url, orig, o) => (/\/api\/meta\/acme\.json$/.test(url) ? Promise.resolve({ status: 200, json: claim, url, fetchedAt: '2026-10-10' }) : orig(url, o)),
    readText: (rel, orig) => (rel === 'README.md' ? `${orig(rel)}\nCompstimate is typically within ±47% (tested on 999 listed salaries).\n` : orig(rel)),
  });
  const r = byId(await jobs.check(ctx))['compstimate-backtest'];
  assert.equal(r.status, 'drift', r.summary);
  const acme = r.findings.find((f) => f.key === 'acme median abs % error');
  assert.equal(acme.encoded, 40);
  assert.match(acme.note, /live site shows ±40%/);
  assert.ok(r.findings.some((f) => /^README\.md:\d+ hand-written accuracy$/.test(f.key) && f.official === 'no company matches'));
  assert.ok(r.evidence.some((e) => /api\/meta\/acme\.json$/.test(e.url)));
  assert.ok(r.findings.some((f) => /^docs\/QA\.md:\d+ example accuracy line$/.test(f.key)), 'an "e.g." line is reported as an example, not checked');
});

test('jobs: history ledger and Juice coverage flags', async () => {
  const hist = copyDir(path.join(FIX, 'history'), (l, slug) => { if (slug === 'acme') { l.lastRunAt = '2026-09-20T06:00:00.000Z'; l.runs = 2; } });
  const snaps = copyDir(path.join(FIX, 'snapshots'), (doc, slug) => {
    if (slug === 'acme') for (const j of doc.jobs) j.locations = [{ name: 'Nowhereville', city: 'Nowhereville', region: null, country: 'ZZ', lat: null, lng: null, remote: false }];
  });
  const r = byId(await jobs.check(ctxFor('jobs', envFor({ snapshots: snaps, history: hist }))));
  assert.equal(r['history-ledger'].status, 'flag');
  const acme = r['history-ledger'].findings.find((f) => f.key === 'stable/acme ledger');
  assert.match(acme.note, /days old/);
  assert.match(acme.note, /runs\/day/);
  assert.equal(r['job-juice'].status, 'drift');
  assert.ok(r['job-juice'].findings.some((f) => f.key === 'acme Juice coverage' && f.official === 0 && /Nowhereville/.test(f.note)));
});

test('jobs pure helpers: ladderCheck, bounds, claims, ledger gaps, quantiles', () => {
  const LI = { Entry: 1, Mid: 2, Senior: 3, 'Staff+': 4 };
  const pts = (level, rs) => rs.map((r, i) => ({ level, group: `g${i}`, r }));
  const mk = (points) => {
    const byLevel = {};
    for (const p of points) (byLevel[p.level] ||= []).push(p.r);
    for (const [l, v] of Object.entries(byLevel)) byLevel[l] = { groups: v.length, q25: jobs.quantile(v, 0.25), median: jobs.quantile(v, 0.5), q75: jobs.quantile(v, 0.75) };
    return { reference: 'Mid', points, byLevel };
  };
  const good = jobs.ladderCheck(LI, mk([...pts('Entry', [0.76, 0.8, 0.84]), ...pts('Senior', [1.15, 1.2, 1.25]), ...pts('Staff+', [1.38, 1.44, 1.5])]));
  assert.equal(good.drift, false);
  assert.ok(Math.abs(good.step - 1.2) < 0.03);
  // Senior paying more than Staff+ contradicts the encoded order.
  const bad = jobs.ladderCheck(LI, mk([...pts('Entry', [0.76, 0.8, 0.84]), ...pts('Senior', [1.5, 1.55, 1.6]), ...pts('Staff+', [1.2, 1.22, 1.25])]));
  assert.equal(bad.drift, true);
  assert.ok(bad.contradictions.some((c) => c.lower === 'Senior' && c.higher === 'Staff+'));
  assert.match(jobs.ladderCheck(LI, mk([])).error, /no level pairs/);
  assert.match(jobs.ladderCheck({ Senior: 3 }, mk([])).error, /reference level Mid/);

  assert.equal(jobs.backtestBound(12, 500), 3);
  assert.equal(jobs.backtestBound(20, 30), 12.8);
  assert.equal(jobs.backtestBound(null, 10), null);

  const claims = jobs.findAccuracyClaims('x\nTypically within ±14% (tested on 500 listed salaries)\n(e.g. "Typically within ±9% (tested on 1,200 listed salaries)")');
  assert.deepEqual(claims.map((c) => [c.line, c.pct, c.n, c.example]), [[2, 14, 500, false], [3, 9, 1200, true]]);
  assert.equal(jobs.matchClaim(claims[0], { a: { medianAbsPctError: 13.2, n: 498 } }), 'a');
  assert.equal(jobs.matchClaim(claims[0], { a: { medianAbsPctError: 25, n: 498 } }), null);

  assert.equal(jobs.maxGap(['2026-09-01', '2026-09-02', '2026-09-12'], '2026-09-12T10:00:00Z'), 10);
  assert.equal(jobs.maxGap(['2026-06-01', '2026-09-11', '2026-09-12'], '2026-09-12T10:00:00Z'), 1, 'only the last 60 days count');
  const h = jobs.ledgerHealth({ since: '2026-09-01T00:00:00Z', lastRunAt: '2026-09-11T00:00:00Z', runs: 20, jobs: { a: { f: '2026-09-01T00:00:00Z' }, b: { f: '2026-09-05T00:00:00Z', c: '2026-09-09T00:00:00Z', n: 1 } } }, '2026-09-12T00:00:00Z');
  assert.deepEqual([h.entries, h.open, h.closed, h.reposted, h.runsPerDay, h.ageDays, h.maxGapDays], [2, 1, 1, 1, 2, 1, 4]);

  assert.equal(jobs.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.deepEqual(jobs.dist([100000, 200000, 300000]), { n: 3, p10: 120000, p25: 150000, p50: 200000, p75: 250000, p90: 280000 });
  assert.ok(jobs.LEVEL_TOKEN_RE.test('Software Engineer L5') && jobs.LEVEL_TOKEN_RE.test('Engineer, Level 3') && !jobs.LEVEL_TOKEN_RE.test('Software Engineer, Platform'));
  const demo = jobs.demoMultipliers([['Mid', 0.8], ['Senior', 1.0]], [{ prefix: '', mult: 1 }, { prefix: 'Staff ', mult: 1.5 }]);
  assert.deepEqual(demo.map((d) => [d.level, d.multiplier]), [['Senior', 1.25], ['Staff+', 1.5]]);
});

// ---------------------------------------------------------------- policy.js

test('policy: offline check returns one valid manual Result per id with a checklist and a review date', async () => {
  const rs = await policy.check(ctxFor('policy', envFor()));
  validResults(rs, policy.MODULE.ids);
  for (const r of rs) {
    assert.ok(r.checklist.length >= 2, `${r.id}: checklist`);
    if (r.id !== 'runtime-versions') assert.ok(r.findings.some((f) => f.key === 'review cadence' && /^\d{4}-\d{2}-\d{2}$/.test(f.official)), `${r.id}: review date`);
    assert.equal(r.mode, r.id === 'llm-vet-config' ? 'detect' : 'manual');
  }
  const r = byId(rs);
  for (const id of ['juice-score-anchors', 'juice-grades', 'juice-confidence-rules', 'salary-vetting-bounds', 'salary-interval-factors', 'salary-parser-bounds', 'llm-vet-config', 'listing-freshness-buckets', 'market-comps-policy']) {
    assert.equal(r[id].status, 'ok', `${id}: ${r[id].summary}`);
  }
  assert.ok(['ok', 'flag'].includes(r['runtime-versions'].status), 'schedule read from the fixture');
  assert.ok(r['runtime-versions'].findings.some((f) => /^Node \d+$/.test(f.key)));
  assert.match(keys(r['salary-vetting-bounds']), /within 10% of above_max/);
});

test('policy: a copy that disagrees with the code is flagged (docs, palette, workflow, vet-salaries)', async () => {
  const edits = {
    'docs/LIVABILITY.md': (t) => t.replace('**K = $80,000**', '**K = $90,000**'),
    'docs/VETTING.md': (t) => t.replace('annual max > **$1.2M**', 'annual max > **$1.5M**'),
    '.github/workflows/pages.yml': (t) => t.replace("vars.VET_LLM_MODEL || 'claude-sonnet-5-5'", "vars.VET_LLM_MODEL || 'claude-old-model'"),
    'public/viz/palette.js': (t) => t.replace('JUICE_BREAKS = Object.freeze([45, 70])', 'JUICE_BREAKS = Object.freeze([40, 70])'),
    'scripts/vet-salaries.js': (t) => t.replace('const FACT = { hour: 2080', 'const FACT = { hour: 2000'),
  };
  const ctx = ctxFor('policy', envFor(), { readText: (rel, orig) => (edits[rel] ? edits[rel](orig(rel)) : orig(rel)) });
  const r = byId(await policy.check(ctx));
  assert.equal(r['juice-score-anchors'].status, 'flag');
  assert.match(keys(r['juice-score-anchors']), /LIVABILITY K \(curve section\)/);
  assert.equal(r['salary-vetting-bounds'].status, 'flag');
  assert.ok(r['salary-vetting-bounds'].findings.some((f) => f.key === 'docs/VETTING.md above_max' && f.official === 1_500_000));
  assert.equal(r['llm-vet-config'].status, 'flag');
  assert.equal(r['juice-grades'].status, 'flag');
  assert.equal(r['salary-interval-factors'].status, 'flag');
  assert.equal(r['salary-parser-bounds'].status, 'ok', 'untouched groups stay ok');
});

test('policy: reviews go stale after cadence + grace; the Models API check detects a retired model', async () => {
  const later = byId(await policy.check(ctxFor('policy', envFor(), { now: new Date('2028-06-01T00:00:00Z') })));
  assert.equal(later['salary-parser-bounds'].status, 'stale');
  assert.match(later['salary-parser-bounds'].summary, /PAST DUE/);
  assert.equal(later['market-comps-policy'].status, 'stale');

  const env = { ...envFor(), ANTHROPIC_API_KEY: 'test-key' };
  const gone = async (url) => { assert.match(url, /\/v1\/models\/claude-sonnet-5-5$/); throw Object.assign(new Error('HTTP 404'), { status: 404 }); };
  const r404 = byId(await policy.check(ctxFor('policy', env, { offline: false, fetchJson: (url, orig) => (/anthropic\.com/.test(url) ? gone(url) : ctxFor('policy', envFor()).fetchJson(url)) })));
  assert.equal(r404['llm-vet-config'].status, 'drift');
  const listed = async (url) => ({ status: 200, json: { id: 'claude-sonnet-5-5', type: 'model', display_name: 'Claude Sonnet 5.5' }, url, fetchedAt: '2026-10-10' });
  const rOk = byId(await policy.check(ctxFor('policy', env, { offline: false, fetchJson: (url, orig) => (/anthropic\.com/.test(url) ? listed(url) : ctxFor('policy', envFor()).fetchJson(url)) })));
  assert.equal(rOk['llm-vet-config'].status, 'ok');
});

test('policy pure helpers: Juice distribution, grade mix, near-bound pay, minN suppression, Node EOL', async () => {
  const { scoreFromNet } = await import('../server/juice.js');
  const bests = (nets) => nets.map((net) => ({ net, grade: net <= 0 ? 'Rind' : scoreFromNet(net) >= 70 ? 'Juicy' : scoreFromNet(net) >= 45 ? 'Ripe' : 'Dry' }));
  const fine = policy.juiceDistribution(bests([40000, 60000, 90000, 120000, 150000, 180000, 200000, 210000, 220000, 230000]), { scoreFromNet });
  assert.deepEqual(fine.problems, []);
  const clipped = policy.juiceDistribution(bests([-5000, 500000, 600000, 700000]), { scoreFromNet });
  assert.equal(clipped.at100, 3);
  assert.equal(clipped.rind, 1);
  assert.equal(clipped.problems.length, 3, clipped.problems.join('; '));
  assert.match(policy.gradeMix(bests([200000, 210000, 220000, 50000])).problems[0], /Juicy holds 75%/);

  const VET = { MAX_ANNUAL: 1_200_000, MIN_ANNUAL_FULLTIME: 15000, RATIO_QUARANTINE: 4, MAX_HOURLY_USD: 250 };
  const nb = policy.nearBounds([
    { id: 'a', title: 'x', salary: { min: 1_000_000, max: 1_150_000, currency: 'USD' } },
    { id: 'b', title: 'y', salary: { min: 100000, max: 390000, currency: 'USD' } },
    { id: 'c', title: 'z', salary: { min: 100000, max: 120000, currency: 'USD' } },
  ], { VET, toUSD: (n) => n, isFullTime: () => true });
  assert.deepEqual([nb.n, nb.near.above_max, nb.near.range_ratio, nb.near.below_min, nb.maxUSD, nb.maxRatio], [3, 1, 1, 0, 1150000, 3.9]);

  const board = (slug, rows) => ({ slug, jobs: rows.map(([title, seniority]) => ({ title, seniority, salary: { min: 1, max: 2, mid: 1.5, currency: 'USD' } })) });
  const s = policy.minNSuppression([board('a', [['x', 'Mid'], ['x', 'Mid'], ['x', 'Mid'], ['x', 'Senior']])], { roleFamily: () => 'swe', usdMid: () => 1 }, 3);
  assert.deepEqual([s.n, s.exactSuppressed, s.familySuppressed, s.groups, s.suppressedGroups], [4, 1, 0, 2, 1]);

  const used = policy.nodeVersionsInUse(JSON.stringify({ engines: { node: '>=18' } }), [
    ['.github/workflows/ci.yml', 'jobs:\n  t:\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n      - uses: x\n        with:\n          node-version: ${{ matrix.node }}\n'],
    ['.github/workflows/pages.yml', '          node-version: 22\n'],
  ]);
  assert.deepEqual(used.map((u) => u.major), [18, 20, 22, 22]);
  const sched = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/refresh/policy/node-release-schedule.json'), 'utf8'));
  const eol = policy.nodeEol(used, sched, '2026-10-10');
  assert.deepEqual(eol.map((e) => [e.major, e.end, e.past]), [[18, '2025-04-30', true], [20, '2026-04-30', true], [22, '2027-04-30', false]]);
  assert.equal(eol.find((e) => e.major === 22).where.length, 2);
});

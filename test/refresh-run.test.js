// Monthly refresh orchestrator (scripts/refresh/run.js) and shared helpers (scripts/refresh/lib.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import * as run from '../scripts/refresh/run.js';
import * as lib from '../scripts/refresh/lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-10-10';
const noNet = () => { throw new Error('network used in an offline test'); };

/** A scratch repo with a registry and the files the fake modules touch. */
function scratch(entries, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-run-'));
  const put = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  put('data/freshness.json', JSON.stringify({ format: 'melon-freshness-1', updated: '2026-10-01', entries }));
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  return { dir, read: (rel) => fs.readFileSync(path.join(dir, rel), 'utf8'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const entry = (id, extra = {}) => ({
  id, description: `test entry ${id}`, type: 'static-data', owners: ['x'], consumers: [{ at: 'x', surface: 'tests' }],
  source: { name: 'test', url: 'https://example.org' }, asOf: '2026-09-01', cadence: 'monthly', mode: 'auto',
  updater: 'scripts/refresh/test.js', validator: 'test', before: 'none', lastChecked: '2026-09-15', ...extra,
});
const mod = (name, ids, check) => ({ name, file: `${name}.js`, ids, check });
const res = (id, status, extra = {}) => lib.result(id, 'auto', status, extra);

test('lib: money, percent and figure parsing', () => {
  assert.equal(lib.parseMoney('$184,500'), 184500);
  assert.equal(lib.parseMoney('£12,570'), 12570);
  assert.equal(lib.parseMoney('1.234.567,89 €'), 1234567.89);
  assert.equal(lib.parseMoney('€ 1.234.567'), 1234567);
  assert.equal(lib.parseMoney('$1.2 million'), 1200000);
  assert.equal(lib.parseMoney('55k'), 55000);
  assert.equal(lib.parseMoney('no number'), null);
  assert.equal(lib.parsePercent('6.2%'), 0.062);
  assert.equal(lib.parsePercent('1,45 %'), 0.0145);
  assert.equal(lib.findFigure('The wage base is $184,500 for 2026.', /wage base is (\$[\d,]+)/), 184500);
  assert.equal(lib.findFigure('rate 6.2 percent', /rate ([\d.]+ percent)/, 'percent'), 0.062);
  assert.equal(lib.findFigure('nothing here', /wage base is (\$[\d,]+)/), null);
  assert.ok(lib.sameNumber(0.1 + 0.2, 0.3));
  assert.ok(!lib.sameNumber(184500, 184800));
  assert.ok(lib.sameNumber(184500, 184800, 500));
});

test('lib: extractConst reads literal constants (with INF and references) from source text', () => {
  const src = "const INF = Infinity;\nconst BASE = 1000;\nexport const T = Object.freeze({ a: 1, b: [2, 3] }); // c\nconst B = [[BASE, 0.1], [INF, 0.2]];\nconst S = 'x;y';\nconst F = (x) => x;\n";
  assert.deepEqual(lib.extractConst(src, 'T'), { a: 1, b: [2, 3] });
  assert.deepEqual(lib.extractConst(src, 'B'), [[1000, 0.1], [Infinity, 0.2]]);
  assert.equal(lib.extractConst(src, 'S'), 'x;y');
  assert.equal(lib.extractConst(src, 'NOPE'), undefined);
  const juice = fs.readFileSync(path.join(ROOT, 'server', 'juice.js'), 'utf8');
  const fx = lib.extractConst(juice, 'FX_PER_USD');
  assert.equal(fx.USD, 1);
  assert.ok(fx.GBP > 0 && fx.GBP < 2);
  assert.equal(lib.constLine(juice, 'FX_PER_USD') > 1, true);
});

test('lib: staleness uses the later of asOf and lastChecked, plus cadence and grace', () => {
  const e = { asOf: '2026-01-01', lastChecked: '2026-09-20', cadence: 'monthly', graceDays: 14 };
  assert.equal(lib.staleness(e, new Date('2026-10-10')).overdue, false);
  assert.equal(lib.staleness(e, new Date('2026-11-10')).overdue, true, '31 + 14 days after the last check');
  assert.equal(lib.staleness({ asOf: '2025-01-01', cadence: 'yearly' }, new Date('2026-10-10')).overdue, true, 'default yearly grace 60');
  assert.equal(lib.staleness({ asOf: '2026-01-01', cadence: 'ad-hoc' }, new Date('2030-01-01')).overdue, false);
  assert.equal(lib.daysBetween('2026-10-01', '2026-10-10'), 9);
  assert.equal(lib.parseDate('2026-09').toISOString().slice(0, 10), '2026-09-01');
});

test('lib: offline fetch serves fixtures and refuses the network', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-fix-'));
  try {
    fs.mkdirSync(path.join(dir, 'm'));
    fs.writeFileSync(path.join(dir, 'm', 'a.json'), '{"x":1}');
    fs.writeFileSync(path.join(dir, 'm', 'urls.json'), JSON.stringify({ 'https://example.org/a': 'a.json' }));
    const ctx = lib.makeContext({ moduleName: 'm', offline: true, fixturesDir: dir, fetchImpl: noNet, registry: { entries: [] } });
    assert.deepEqual((await ctx.fetchJson('https://example.org/a')).json, { x: 1 });
    await assert.rejects(ctx.fetchText('https://example.org/b'), (e) => e.code === 'FIXTURE_MISSING');
    assert.equal(await ctx.llm('hi'), null, 'LLM step is a no-op offline / without a key');
    const r = lib.errorResult('x', 'auto', Object.assign(new Error('gone'), { code: 'FIXTURE_MISSING' }));
    assert.equal(r.status, 'skipped');
    assert.equal(lib.errorResult('x', 'auto', new Error('boom')).status, 'error');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('run: ok / changed / thrown / missing / unregistered results, writes only when not dry-run', async () => {
  const s = scratch([entry('a'), entry('b'), entry('c'), entry('d')], { 'data/x.json': '{"v":1}\n' });
  try {
    const modules = [
      mod('one', ['a', 'b'], async (ctx) => [
        res('a', 'ok', { summary: 'same' }),
        res('b', 'changed', { summary: 'new', sourceAsOf: '2026-09-30', writes: [{ file: 'data/x.json', content: '{"v":2}\n' }] }),
        res('zzz', 'ok'),
      ]),
      mod('two', ['c'], async () => { throw new Error('kaboom'); }),
      mod('three', ['d'], async (ctx) => [res('d', 'ok', { summary: `sees ${ctx.readText('data/x.json').trim()}` })]),
    ];
    const dry = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, dryRun: true, log: () => {} });
    const by = Object.fromEntries(dry.results.map((r) => [r.id, r]));
    assert.equal(by.a.status, 'ok');
    assert.equal(by.b.status, 'changed');
    assert.equal(by.c.status, 'error');
    assert.match(by.c.summary, /kaboom/);
    assert.match(by.d.summary, /"v":2/, 'a later module reads an earlier module\'s staged write');
    assert.ok(dry.problems.some((p) => /unregistered id zzz/.test(p)));
    assert.deepEqual(dry.files.sort(), ['data/freshness.json', 'data/x.json']);
    assert.equal(s.read('data/x.json'), '{"v":1}\n', 'dry run writes nothing');
    const wet = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, log: () => {} });
    assert.deepEqual(wet.written.sort(), ['data/freshness.json', 'data/x.json']);
    assert.equal(s.read('data/x.json'), '{"v":2}\n');
    const reg = JSON.parse(s.read('data/freshness.json'));
    const e = Object.fromEntries(reg.entries.map((x) => [x.id, x]));
    assert.equal(e.b.asOf, '2026-09-30', 'changed moves asOf to the source as-of');
    assert.equal(e.b.lastChecked, NOW);
    assert.equal(e.a.asOf, '2026-09-01', 'ok on static data keeps asOf');
    assert.equal(e.a.lastChecked, NOW);
    assert.equal(e.c.lastChecked, '2026-09-15', 'an error confirms nothing');
  } finally { s.cleanup(); }
});

test('run: a staged file that fails validation flags every result that wrote it', async () => {
  const s = scratch([entry('a'), entry('b')], { 'data/x.json': '{}\n', 'lib/y.js': 'export const A = 1;\n' });
  try {
    const modules = [mod('one', ['a', 'b'], async () => [
      res('a', 'changed', { writes: [{ file: 'data/x.json', content: '{ not json' }] }),
      res('b', 'changed', { writes: [{ file: 'lib/y.js', content: 'export const A = ;\n' }] }),
    ])];
    const r = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, log: () => {} });
    const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
    assert.equal(by.a.status, 'flag');
    assert.match(by.a.summary, /not JSON/);
    assert.equal(by.b.status, 'flag');
    assert.match(by.b.summary, /syntax/);
    assert.equal(s.read('data/x.json'), '{}\n');
    assert.equal(s.read('lib/y.js'), 'export const A = 1;\n');
  } finally { s.cleanup(); }
});

test('run: writes outside the repo and writes from non-changed results are refused', async () => {
  const s = scratch([entry('a'), entry('b')]);
  try {
    const modules = [mod('one', ['a', 'b'], async () => [
      res('a', 'changed', { writes: [{ file: '../escape.txt', content: 'x' }] }),
      res('b', 'drift', { writes: [{ file: 'data/z.json', content: '{}' }] }),
    ])];
    const r = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, log: () => {} });
    const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
    assert.equal(by.a.status, 'error');
    assert.equal(by.b.status, 'drift');
    assert.ok(!fs.existsSync(path.join(s.dir, 'data', 'z.json')));
    assert.ok(!fs.existsSync(path.join(path.dirname(s.dir), 'escape.txt')));
  } finally { s.cleanup(); }
});

test('run: entries no module covers get a staleness result with their checklist', async () => {
  const s = scratch([
    entry('m-fresh', { mode: 'manual', updater: 'manual', checklist: ['look'], lastChecked: '2026-10-01' }),
    entry('m-stale', { mode: 'manual', updater: 'manual', checklist: ['look'], asOf: '2025-01-01', lastChecked: '2025-02-01', cadence: 'yearly' }),
    entry('p', { type: 'fetched', cadence: 'daily', updater: 'pipeline: snapshot.yml', asOf: null, lastChecked: null }),
    entry('retired', { mode: 'manual', updater: 'manual', checklist: ['x'], retired: '2026-01-01' }),
  ]);
  try {
    const r = await run.runRefresh({ root: s.dir, modules: [], now: NOW, dryRun: true, log: () => {} });
    const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
    assert.equal(by['m-fresh'].status, 'ok');
    assert.equal(by['m-stale'].status, 'stale');
    assert.deepEqual(by['m-stale'].checklist, ['look']);
    assert.equal(by.p.status, 'ok');
    assert.equal(by.retired, undefined);
    assert.equal(r.alerts, 1);
    const rows = Object.fromEntries(r.staleness.map((x) => [x.id, x]));
    assert.equal(rows['m-stale'].status, 'STALE');
    assert.equal(rows.p.status, 'pipeline');
    const md = run.renderReport(r);
    assert.match(md, /Past due/);
    assert.match(md, /- \[ \] look/);
    assert.match(run.stalenessMarkdown(r.staleness), /\*\*STALE\*\*/);
  } finally { s.cleanup(); }
});

test('run: --only limits modules and ids', async () => {
  const s = scratch([entry('a'), entry('b')]);
  try {
    let calls = 0;
    const modules = [mod('one', ['a'], async () => { calls++; return [res('a', 'ok')]; }), mod('two', ['b'], async () => { calls++; return [res('b', 'ok')]; })];
    const r = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, dryRun: true, only: ['two'], log: () => {} });
    assert.equal(calls, 1);
    assert.deepEqual(r.results.map((x) => x.id), ['b']);
  } finally { s.cleanup(); }
});

test('run: --only still runs derived after a module that changed a file (no stale docs), and not otherwise', async () => {
  assert.deepEqual(run.FOLLOWS_WRITES, ['derived']);
  const s = scratch([entry('a'), entry('d')], { 'data/x.json': '{"v":1}\n' });
  try {
    const ran = [];
    const one = (v) => mod('one', ['a'], async () => { ran.push('one'); return [res('a', v === 1 ? 'ok' : 'changed', { writes: v === 1 ? [] : [{ file: 'data/x.json', content: `{"v":${v}}\n` }] })]; });
    const derived = mod('derived', ['d'], async (ctx) => { ran.push(`derived saw ${ctx.readText('data/x.json').trim()}`); return [res('d', 'ok')]; });
    const r = await run.runRefresh({ root: s.dir, modules: [one(2), derived], now: NOW, retryDelayMs: 0, dryRun: true, only: ['one'], log: () => {} });
    assert.deepEqual(ran, ['one', 'derived saw {"v":2}'], 'derived runs on the overlay, after the change');
    assert.deepEqual(r.results.map((x) => x.id), ['a', 'd']);
    ran.length = 0;
    const r2 = await run.runRefresh({ root: s.dir, modules: [one(1), derived], now: NOW, retryDelayMs: 0, dryRun: true, only: ['one'], log: () => {} });
    assert.deepEqual(ran, ['one'], 'nothing changed: derived is not run');
    assert.deepEqual(r2.results.map((x) => x.id), ['a']);
  } finally { s.cleanup(); }
});

test('run: archive payloads are written with a manifest; reference export reads consts and JSON paths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-arch-'));
  try {
    const m = run.writeArchivePayloads({ results: [{ id: 'jobs-aggregates', archive: { dataset: 'jobs-aggregates', asOf: '2026-10-03', json: '{"n":1}' } }, { id: 'x', archive: { dataset: 'Bad Id', asOf: '2026-10-03', json: '{}' } }] }, dir);
    assert.deepEqual(m.map((x) => x.dataset), ['jobs-aggregates']);
    assert.equal(fs.readFileSync(path.join(dir, 'jobs-aggregates', '2026-10-03.json'), 'utf8'), '{"n":1}\n');
    const s = scratch([entry('fx', { extract: [{ file: 'lib/t.js', const: 'T' }, { file: 'data/d.json', path: 'a.b' }] }), entry('noextract')],
      { 'lib/t.js': 'const INF = Infinity;\nexport const T = Object.freeze({ GBP: 0.75, top: [[INF, 0.4]] });\n', 'data/d.json': '{"a":{"b":[1,2]}}' });
    try {
      const out = path.join(dir, 'ref');
      const man = await run.exportReference(out, { root: s.dir, registry: JSON.parse(s.read('data/freshness.json')), today: NOW });
      assert.deepEqual(man.map((x) => x.dataset), ['fx']);
      const doc = JSON.parse(fs.readFileSync(path.join(out, 'fx.json'), 'utf8'));
      assert.deepEqual(doc.values['lib/t.js#T'], { GBP: 0.75, top: [['Infinity', 0.4]] });
      assert.deepEqual(doc.values['data/d.json#a.b'], [1, 2]);
      assert.equal(doc.asOf, '2026-09-01');
    } finally { s.cleanup(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('run: validateRegistry catches malformed entries', () => {
  const bad = { format: 'melon-freshness-1', entries: [entry('Bad_Id'), entry('a', { type: 'nope', cadence: 'sometimes' }), entry('a'), entry('m', { mode: 'manual', checklist: [] })] };
  const p = run.validateRegistry(bad, { root: ROOT }).join('\n');
  assert.match(p, /Bad_Id: id must be kebab-case/);
  assert.match(p, /type nope/);
  assert.match(p, /cadence sometimes/);
  assert.match(p, /duplicate id/);
  assert.match(p, /manual entries need a checklist/);
  assert.match(p, /updater scripts\/refresh\/test\.js does not exist/);
});

test('run.js CLI: offline dry run over the real registry checks every entry and touches nothing', () => {
  // Run on a copy of the repo (code, data, docs, fixtures), so other work in the tree can't
  // race the "nothing changed" check, and hash every file before and after.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-cli-'));
  try {
    const copy = path.join(tmp, 'repo');
    const skip = new Set(['node_modules', '.git', 'dist', 'tmp', 'snapshots', 'cache', 'history', 'screenshots', 'beta']);
    const keep = ['scripts', 'server', 'public', 'docs', 'data', '.github', 'package.json', 'README.md', path.join('test', 'fixtures', 'refresh')];
    for (const rel of keep) fs.cpSync(path.join(ROOT, rel), path.join(copy, rel), { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
    const hashAll = (dir) => {
      const out = new Map();
      const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, n.name); if (n.isDirectory()) walk(f); else out.set(path.relative(dir, f), crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')); } };
      walk(dir);
      return out;
    };
    const before = hashAll(copy);
    const out = path.join(tmp, 'out');
    // No job snapshots (as in CI, where data/snapshots/ is gitignored): the job-data checks
    // report 'skipped' quickly instead of re-running the backtest on local snapshots.
    const empty = path.join(tmp, 'no-snapshots');
    fs.mkdirSync(empty);
    const env = { ...process.env, ANTHROPIC_API_KEY: '', GITHUB_STEP_SUMMARY: '', MELON_SNAPSHOT_DIR: empty, MELON_BETA_SNAPSHOT_DIR: empty, MELON_HISTORY_DIR: empty, MELON_BETA_HISTORY_DIR: empty, MELON_ARCHIVE_DIR: empty };
    execFileSync(process.execPath, [path.join(copy, 'scripts', 'refresh', 'run.js'), '--dry-run', '--offline', '--now', NOW, '--out', out], { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env, timeout: 120000 });
    const after = hashAll(copy);
    const changed = [...after.keys()].filter((k) => before.get(k) !== after.get(k)).concat([...before.keys()].filter((k) => !after.has(k)));
    assert.deepEqual(changed, [], 'the dry run changed no file');
    const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    const reg = JSON.parse(fs.readFileSync(path.join(copy, 'data', 'freshness.json'), 'utf8'));
    const ids = new Set(report.results.map((r) => r.id));
    for (const e of reg.entries) if (!e.retired) assert.ok(ids.has(e.id), `no result for ${e.id}`);
    for (const r of report.results) assert.ok(lib.STATUSES.includes(r.status), `${r.id}: ${r.status}`);
    assert.ok(fs.existsSync(path.join(out, 'report.md')));
    assert.ok(fs.statSync(path.join(out, 'summary.md')).size < 65536, 'the PR / issue body fits GitHub\'s limit');
    const outcome = JSON.parse(fs.readFileSync(path.join(out, 'outcome.json'), 'utf8'));
    assert.ok(Array.isArray(outcome.files));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('run.js --staleness never fails and prints one row per entry', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'refresh', 'run.js'), '--staleness', '--now', '2030-01-01'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'freshness.json'), 'utf8'));
  assert.match(out, /Data freshness:/);
  assert.match(out, /::warning title=Stale data::/, 'in 2030 something is stale, and it is only a warning');
  assert.equal(out.split('\n').filter((l) => /^\| `/.test(l)).length, reg.entries.filter((e) => !e.retired).length);
});

test('staleness: reviewCadence keeps a human-review clock that lastChecked cannot reset; manual results never bump lastChecked', async () => {
  const e = { asOf: '2025-06-01', lastChecked: '2026-10-01', cadence: 'monthly', reviewCadence: 'yearly' };
  assert.equal(lib.staleness(e, new Date('2026-10-10')).overdue, true, 'reviewed never and asOf + 366 + 60 days passed');
  assert.equal(lib.staleness({ ...e, lastReviewed: '2026-09-01' }, new Date('2026-10-10')).overdue, false);
  const s = scratch([entry('m', { mode: 'manual', updater: 'scripts/refresh/test.js', checklist: ['look'], lastChecked: '2026-01-01' })]);
  try {
    const modules = [mod('one', ['m'], async () => [lib.result('m', 'manual', 'ok', { summary: 'not due' })])];
    await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, log: () => {} });
    const reg = JSON.parse(s.read('data/freshness.json'));
    assert.equal(reg.entries[0].lastChecked, '2026-01-01');
  } finally { s.cleanup(); }
});

test('run: online, a result that errored is retried once and replaced only if the retry could check it', async () => {
  const s = scratch([entry('a'), entry('b'), entry('c')]);
  try {
    let calls = 0;
    const modules = [mod('one', ['a', 'b', 'c'], async () => {
      calls++;
      return calls === 1
        ? [res('a', 'ok'), res('b', 'error', { summary: 'host blip' }), res('c', 'error', { summary: 'down' })]
        : [res('a', 'drift'), res('b', 'ok', { summary: 'fine now' }), res('c', 'error', { summary: 'still down' })];
    })];
    const r = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, dryRun: true, retryDelayMs: 0, fetchImpl: noNet, log: () => {} });
    const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
    assert.equal(calls, 2);
    assert.equal(by.a.status, 'ok', 'a non-error first result is kept');
    assert.equal(by.b.status, 'ok');
    assert.match(by.b.summary, /after one retry/);
    assert.equal(by.c.status, 'error');
    const off = await run.runRefresh({ root: s.dir, modules, now: NOW, retryDelayMs: 0, dryRun: true, offline: true, log: () => {} });
    assert.equal(calls, 3, 'offline runs are never retried');
    assert.ok(off.results.length === 3);
  } finally { s.cleanup(); }
});

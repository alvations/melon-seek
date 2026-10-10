// Data freshness gate (docs/DATA_FRESHNESS.md): the registry data/freshness.json is well
// formed, covers every updater module and every tax jurisdiction, agrees with the data it
// describes (as-of dates the UI shows), and points at files and lines that exist.
//
// Staleness itself only WARNS here (test diagnostics + the CI / Pages step
// `node scripts/refresh/run.js --staleness`), so an overdue dataset never fails the build or
// blocks a deploy. Set FRESHNESS_STRICT=1 to make stale entries fail (e.g. a release checklist).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { validateRegistry, loadModules, stalenessRows, readExtractAsync, runRefresh } from '../scripts/refresh/run.js';
import { taxYearOf } from '../scripts/refresh/registry.js';
import * as JUICE from '../server/juice.js';
import * as PALETTE from '../public/viz/palette.js';

const { TAX_SOURCES, FX_AS_OF: JUICE_FX_AS_OF } = JUICE;
const { FX_AS_OF: PALETTE_FX_AS_OF, FX_PER_USD: PALETTE_FX } = PALETTE;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'freshness.json'), 'utf8'));
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const byId = new Map(REG.entries.map((e) => [e.id, e]));
const live = REG.entries.filter((e) => !e.retired);
const today = new Date().toISOString().slice(0, 10);

test('registry: well formed (ids, types, cadences, modes, sources, checklists, updaters exist)', () => {
  const problems = validateRegistry(REG, { root: ROOT });
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('registry: every updater module is registered, and every module-updated entry has a module result', async () => {
  const mods = await loadModules(path.join(ROOT, 'scripts', 'refresh'));
  const broken = mods.filter((m) => m.loadError).map((m) => `${m.name}: ${m.loadError}`);
  assert.deepEqual(broken, [], 'every module imports');
  const claimed = new Map();
  for (const m of mods.filter((x) => !x.loadError)) {
    for (const id of m.ids) {
      assert.ok(byId.has(id), `module ${m.name} reports ${id}, which is not in data/freshness.json`);
      assert.ok(!claimed.has(id), `${id} is claimed by both ${claimed.get(id)} and ${m.name}`);
      claimed.set(id, m.name);
    }
  }
  for (const e of live) {
    // "scripts/refresh/x.js" or "scripts/refresh/x.js (note)": the module must claim the id
    const m = /^scripts\/refresh\/([\w-]+)\.js\b/.exec(e.updater || '');
    if (!m) continue;
    assert.equal(claimed.get(e.id), m[1], `${e.id}: updater ${e.updater} must list it in MODULE.ids`);
  }
});

test('registry: one tax entry per TAX_SOURCES jurisdiction, with the tax year the code claims', () => {
  for (const [key, src] of Object.entries(TAX_SOURCES)) {
    const e = byId.get(`tax-${key.toLowerCase()}`);
    assert.ok(e, `no registry entry tax-${key.toLowerCase()} for TAX_SOURCES['${key}'] (run node scripts/refresh/registry.js --sync-tax --write)`);
    const { taxYear, asOf } = taxYearOf(src.asOf, key);
    assert.equal(e.taxYear, taxYear, `${e.id} taxYear`);
    assert.equal(e.asOf, asOf, `${e.id} asOf`);
    assert.equal(e.source.url, src.url, `${e.id} source url`);
  }
  for (const e of live.filter((x) => x.group === 'tax')) {
    const key = Object.keys(TAX_SOURCES).find((k) => `tax-${k.toLowerCase()}` === e.id);
    assert.ok(key, `${e.id} has no TAX_SOURCES jurisdiction (retire it)`);
  }
});

test('registry as-of dates match the data the UI reads (FX, Big Mac)', () => {
  const fx = byId.get('fx-per-usd');
  assert.ok(fx, 'fx-per-usd entry');
  assert.equal(fx.asOf, CITIES.fx.asOf, 'registry fx-per-usd asOf = data/cities.json fx.asOf');
  assert.equal(JUICE_FX_AS_OF, CITIES.fx.asOf, 'server/juice.js FX_AS_OF = data/cities.json fx.asOf');
  assert.equal(PALETTE_FX_AS_OF, CITIES.fx.asOf, 'public/viz/palette.js FX_AS_OF = data/cities.json fx.asOf');
  for (const [c, v] of Object.entries(PALETTE_FX)) assert.equal(CITIES.fx.perUSD[c], v, `data/cities.json fx.perUSD.${c} = palette.js FX_PER_USD.${c} (one FX table; scripts/refresh/fx.js writes both)`);
  const bm = byId.get('bigmac-prices');
  assert.ok(bm, 'bigmac-prices entry');
  assert.equal(bm.asOf, CITIES.bigMac.asOf, 'registry bigmac-prices asOf = data/cities.json bigMac.asOf');
});

test('registry: no as-of or last-checked date in the future', () => {
  for (const e of live) {
    if (e.asOf) assert.ok(e.asOf <= today, `${e.id} asOf ${e.asOf} is in the future`);
    if (e.lastChecked) assert.ok(e.lastChecked <= today, `${e.id} lastChecked ${e.lastChecked} is in the future`);
  }
});

test('registry: file:line references point at files and lines that exist', () => {
  const sizes = new Map();
  const lineCount = (f) => {
    if (!sizes.has(f)) { try { sizes.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length); } catch { sizes.set(f, null); } }
    return sizes.get(f);
  };
  const bad = [];
  for (const e of live) {
    for (const ref of [...(e.owners || []), ...(e.consumers || []).map((c) => c.at)]) {
      const m = /^([\w./-]+\.(?:js|mjs|json|md|yml|html|css|sh|py)):(\d+)\b/.exec(ref);
      if (!m) continue;
      const n = lineCount(m[1]);
      if (n == null) bad.push(`${e.id}: ${ref} (no such file)`);
      else if (Number(m[2]) > n) bad.push(`${e.id}: ${ref} (file has ${n} lines)`);
    }
  }
  assert.deepEqual(bad, [], `${bad.join('\n')}\n(run node scripts/refresh/registry.js --lines --write)`);
});

test('registry: every archive extract resolves', async () => {
  const bad = [];
  for (const e of live) for (const spec of e.extract || []) {
    try { const r = await readExtractAsync(spec, ROOT); if (r.error) bad.push(`${e.id}: ${r.error}`); } catch (err) { bad.push(`${e.id}: ${spec.file}: ${err.message}`); }
  }
  assert.deepEqual(bad, []);
});

test('staleness: warn (never fail) on datasets past cadence + grace; FRESHNESS_STRICT=1 fails', (t) => {
  const rows = stalenessRows(REG, new Date());
  const stale = rows.filter((r) => r.status === 'STALE');
  for (const r of stale) t.diagnostic(`STALE ${r.id}: as of ${r.asOf || '-'}, last checked ${r.lastChecked || '-'}, cadence ${r.cadence}`);
  t.diagnostic(`${rows.length} datasets: ${stale.length} stale, ${rows.filter((r) => r.status === 'due soon').length} due soon`);
  if (process.env.FRESHNESS_STRICT === '1') assert.deepEqual(stale.map((r) => r.id), []);
});

test('FX source label: FX_SOURCE (when the code copies export it) names the table data/cities.json uses', () => {
  for (const [name, mod] of [['server/juice.js', JUICE], ['public/viz/palette.js', PALETTE]]) {
    if (!('FX_SOURCE' in mod)) continue; // lands with docs/process/patches/freshness-lead-fx-source.diff
    assert.equal(mod.FX_SOURCE, CITIES.fx.source.name, `${name} FX_SOURCE vs data/cities.json fx.source.name (scripts/refresh/fx.js rewrites both)`);
  }
});

test('staleness gate agrees with the refresh: every id the offline dry run reports stale is past due in the registry', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-gate-'));
  const saved = {};
  for (const k of ['MELON_SNAPSHOT_DIR', 'MELON_HISTORY_DIR', 'MELON_BETA_SNAPSHOT_DIR', 'MELON_BETA_HISTORY_DIR', 'MELON_ARCHIVE_DIR']) { saved[k] = process.env[k]; process.env[k] = empty; }
  try {
    const rep = await runRefresh({ offline: true, dryRun: true, now: today, log: () => {} });
    const gate = new Set(stalenessRows(REG, new Date(`${today}T12:00:00Z`)).filter((r) => r.status === 'STALE').map((r) => r.id));
    const stale = rep.results.filter((r) => r.status === 'stale').map((r) => r.id);
    const missing = stale.filter((id) => !gate.has(id));
    assert.deepEqual(missing, [], `reported stale by the refresh but not by run.js --staleness (the CI / Pages gate and the UI "update due"): ${missing.join(', ')}. Store the module's dueDate (run the refresh) or fix lastChecked.`);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

// Registry maintenance tool (scripts/refresh/registry.js): tax-year labels, TAX_SOURCES sync,
// fragment merges, moved line references, and the generated inventory in docs/DATA_FRESHNESS.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../scripts/refresh/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('taxYearOf: tax-year labels -> the first day the encoded rules apply', () => {
  assert.deepEqual(R.taxYearOf('2026', 'US'), { taxYear: '2026', asOf: '2026-01-01' });
  assert.deepEqual(R.taxYearOf('2026/27', 'GB'), { taxYear: '2026/27', asOf: '2026-04-06' });
  assert.deepEqual(R.taxYearOf('2026-27', 'AU'), { taxYear: '2026-27', asOf: '2026-07-01' });
  assert.deepEqual(R.taxYearOf('FY2026-27', 'IN'), { taxYear: 'FY2026-27', asOf: '2026-04-01' });
  assert.deepEqual(R.taxYearOf('YA2026', 'SG'), { taxYear: 'YA2026', asOf: '2025-01-01' }, 'YA2026 taxes 2025 income');
  assert.equal(R.taxYearOf('2025 (brackets) / 2026 (SDI)', 'US-CA').asOf, '2025-01-01', 'a mixed label counts from its oldest part');
  assert.equal(R.taxYearOf('', 'XX').asOf, null);
});

test('taxEntries: one entry per TAX_SOURCES key, keeping hand-written fields', () => {
  const src = { 'US-NY': { name: 'NY 2026', url: 'https://www.tax.ny.gov/x', asOf: '2026', reviewed: '2026-10-10', verified: true }, GB: { name: 'HMRC', url: 'https://www.gov.uk/x', asOf: '2026/27' } };
  const existing = new Map([['tax-gb', { id: 'tax-gb', checklist: ['mine'], mode: 'detect', updater: 'scripts/refresh/tax.js', lastChecked: '2026-09-01' }]]);
  const [ny, gb] = R.taxEntries(src, existing, { TAX_HOUSEHOLD: { 'US-NY': { basis: 'joint' }, GB: { basis: 'neutral' } } });
  assert.equal(ny.id, 'tax-us-ny');
  assert.equal(ny.asOf, '2026-01-01');
  assert.equal(ny.lastChecked, '2026-10-10', 'TAX_SOURCES.reviewed');
  assert.equal(gb.id, 'tax-gb');
  assert.equal(gb.mode, 'detect', 'hand-written fields are kept');
  assert.equal(gb.lastChecked, '2026-09-01');
  assert.match(gb.notes, /unverified/);
  // one generated checklist (review finding): 6 steps, with the household basis; 3 when household-neutral
  assert.equal(ny.checklist.length, 6);
  assert.match(ny.checklist.join(' '), /NEW tax year/);
  assert.match(ny.checklist.join(' '), /TAX_HOUSEHOLD\['US-NY'\]/);
  assert.equal(gb.checklist.length, 3);
  assert.equal(new Set(ny.checklist).size, ny.checklist.length);
  // TAX_HOUSEHOLD is owned and archived per jurisdiction
  assert.ok(ny.owners.includes("server/juice.js TAX_HOUSEHOLD['US-NY']"));
  assert.deepEqual(ny.extract, [
    { file: 'server/juice.js', const: 'TAX_SOURCES', path: ['US-NY'], as: 'TAX_SOURCES' },
    { file: 'server/juice.js', const: 'TAX_HOUSEHOLD', path: ['US-NY'], as: 'TAX_HOUSEHOLD' },
  ]);
});

test('dedupeRefs: one owner per file + text, the line-numbered one wins; resolveLines leaves prose words alone', () => {
  assert.deepEqual(R.dedupeRefs(["server/juice.js TAX_SOURCES['US-WA']", "server/juice.js:887 TAX_SOURCES['US-WA']", 'server/juice.js RULES.US', 'public/viz/palette.js:128 FX_AS_OF', 'public/viz/palette.js:128 FX_AS_OF']),
    ["server/juice.js:887 TAX_SOURCES['US-WA']", 'server/juice.js RULES.US', 'public/viz/palette.js:128 FX_AS_OF']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-lines-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.js'), 'x\nfunction show() {\n  const drawer = 1;\n}\nexport const LIMIT = 3;\n');
    const reg = { entries: [{ owners: ['a.js:1 drawer width 32 bins', 'a.js:1 LIMIT', 'a.js:1 show (the drawer)'], consumers: [] }] };
    const { reg: out } = R.resolveLines(reg, dir);
    assert.deepEqual(out.entries[0].owners, ['a.js:1 drawer width 32 bins', 'a.js:5 LIMIT', 'a.js:2 show (the drawer)']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('mergeEntries: fragments add and update by id, union owners and consumers, never blank out values', () => {
  const reg = { entries: [{ id: 'a', owners: ['x'], consumers: [{ at: 'f:1', surface: 'chart' }], checklist: ['one'], validator: 'v', notes: 'n1' }] };
  const { reg: out, added, updated } = R.mergeEntries(reg, [
    { id: 'a', owners: ['y'], consumers: [{ at: 'f:1', surface: 'chart' }, { at: 'g:2', surface: 'map' }], checklist: ['two'], validator: '', notes: 'n2' },
    { id: 'b', owners: ['z'] },
  ]);
  assert.deepEqual(added, ['b']);
  assert.deepEqual(updated, ['a']);
  const a = out.entries[0];
  assert.deepEqual(a.owners, ['x', 'y']);
  assert.equal(a.consumers.length, 2);
  assert.deepEqual(a.checklist, ['one', 'two']);
  assert.equal(a.validator, 'v', 'an empty string does not overwrite');
  assert.equal(a.notes, 'n1 n2');
  assert.equal(reg.entries[0].owners.length, 1, 'input not mutated');
});

test('resolveLines: a moved "file:line SYMBOL" reference is re-pointed at the symbol', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'juice.js'), 'utf8').split('\n');
  const line = src.findIndex((l) => /export const FX_PER_USD/.test(l)) + 1;
  const { reg, moved } = R.resolveLines({ entries: [{ id: 'x', owners: ['server/juice.js:1 FX_PER_USD'], consumers: [{ at: `server/juice.js:${line} FX_PER_USD`, surface: 'x' }] }] });
  assert.equal(reg.entries[0].owners[0], `server/juice.js:${line} FX_PER_USD`);
  assert.equal(reg.entries[0].consumers[0].at, `server/juice.js:${line} FX_PER_USD`, 'a correct reference is left alone');
  assert.equal(moved.length, 1);
});

test('docs/DATA_FRESHNESS.md: the generated inventory matches data/freshness.json', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'freshness.json'), 'utf8'));
  const doc = fs.readFileSync(R.DOC_FILE, 'utf8');
  assert.ok(doc.includes(R.DOC_BEGIN) && doc.includes(R.DOC_END), 'markers present');
  assert.equal(R.spliceInventory(doc, R.renderInventory(reg)), doc, 'run: node scripts/refresh/registry.js --docs --write');
  for (const e of reg.entries.filter((x) => !x.retired)) assert.ok(doc.includes(`<code>${e.id}</code>`), `${e.id} listed`);
});

test('surfaceOf maps free-text consumer surfaces onto the UI surfaces', () => {
  assert.equal(R.surfaceOf('drawer Juice block (Tax line: income / regional / social)'), 'drawer Juice block');
  assert.equal(R.surfaceOf('Same role elsewhere'), 'Same role elsewhere');
  assert.equal(R.surfaceOf('map (pay pins)'), 'map');
  assert.equal(R.surfaceOf('tests (tax golden vectors)'), 'tests');
});

test('rollExtracts: a tax-year rename (NAME_2025 -> NAME_2026) is followed; present constants are left alone', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'tmp-roll-'));
  try {
    fs.writeFileSync(path.join(dir, 'x.js'), 'const FR_PASS_2026 = 48060;\nconst KEEP_2026 = 1;\n');
    const rel = path.relative(ROOT, path.join(dir, 'x.js'));
    const { reg, renamed } = R.rollExtracts({ entries: [{ id: 't', extract: [{ file: rel, const: 'FR_PASS_2025', as: 'FR_PASS_2025' }, { file: rel, const: 'KEEP_2026' }] }] });
    assert.deepEqual(renamed, ['t: FR_PASS_2025 -> FR_PASS_2026']);
    assert.deepEqual(reg.entries[0].extract, [{ file: rel, const: 'FR_PASS_2026', as: 'FR_PASS_2026' }, { file: rel, const: 'KEEP_2026' }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

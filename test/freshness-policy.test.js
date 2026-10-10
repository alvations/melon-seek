// Product-policy constants that live in more than one file must agree (docs/DATA_FRESHNESS.md,
// "Duplicated numbers"). These are reviewed by hand on a cadence and never auto-updated, so a
// copy that drifts would silently show users two different rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractConst } from '../scripts/refresh/lib.js';
import { GRADES, SCORE_ANCHORS, SOURCE_CLASSES } from '../server/juice.js';
import { JUICE_BREAKS } from '../public/viz/palette.js';
import { VET } from '../server/vet.js';
import { MAX_ANNUAL } from '../server/salary.js';
import { BACKTEST_SEED } from '../public/features/compstimate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Juice grade cut-offs: palette.js JUICE_BREAKS and the app.js chip copy match server/juice.js GRADES', () => {
  const cuts = GRADES.map((g) => g.min).filter((m) => m > 0).sort((a, b) => a - b);
  assert.deepEqual([...JUICE_BREAKS], cuts);
  const ui = extractConst(src('public/app.js'), 'JUICE_GRADES');
  assert.ok(Array.isArray(ui), 'app.js JUICE_GRADES is a literal');
  const [ripe, juicy] = cuts;
  const tip = Object.fromEntries(ui.map(([g, t]) => [g, t]));
  assert.match(tip.Juicy, new RegExp(`\\b${juicy}\\+`), `Juicy chip says ${juicy}+`);
  assert.match(tip.Ripe, new RegExp(`\\b${ripe}[–-]${juicy - 1}\\b`), `Ripe chip says ${ripe}–${juicy - 1}`);
  assert.match(tip.Dry, new RegExp(`under ${ripe}\\b`), `Dry chip says under ${ripe}`);
});

test('Juice score anchors: palette.js JUICE_ANCHORS matches server/juice.js SCORE_ANCHORS', () => {
  const a = extractConst(src('public/viz/palette.js'), 'JUICE_ANCHORS');
  assert.equal(a.K, SCORE_ANCHORS.K);
  assert.equal(a.fullGlassUSD, SCORE_ANCHORS.fullGlassUSD);
});

test('source classes: scripts/update-col.js copy matches server/juice.js SOURCE_CLASSES', () => {
  assert.deepEqual(extractConst(src('scripts/update-col.js'), 'SOURCE_CLASSES'), [...SOURCE_CLASSES]);
});

test('salary ceiling: the parser bound equals the vetting gate bound', () => {
  assert.equal(MAX_ANNUAL, VET.MAX_ANNUAL);
});

test('Compstimate backtest seed: server and browser use the same one', () => {
  const opts = extractConst(src('server/index.js'), 'BACKTEST_OPTS');
  assert.equal(opts.seed, BACKTEST_SEED);
});

test('households: the app.js switch (labels, bedrooms) matches server/juice.js HOUSEHOLDS', async () => {
  const { HOUSEHOLDS } = await import('../server/juice.js');
  const ui = extractConst(src('public/app.js'), 'HOUSEHOLDS');
  assert.ok(Array.isArray(ui), 'app.js HOUSEHOLDS is a literal');
  assert.deepEqual(ui.map(([k]) => k), Object.keys(HOUSEHOLDS), 'same presets, same order');
  for (const [key, label, , bedrooms] of ui) {
    assert.equal(label, HOUSEHOLDS[key].label, `${key} label`);
    assert.equal(bedrooms, HOUSEHOLDS[key].bedrooms, `${key} bedrooms`);
  }
});

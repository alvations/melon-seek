// Beta fix wave, app lane (docs/process/fix-beta-app.md): shared decision 1, displayLevel(job) in
// public/features/roles.js, and the places that show levels through it (Compstimate's Level select
// and its filters). The browser-side fixes are covered by test/e2e/fix-beta-app.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  displayLevel, levelLabel, levelStated, levelKey, levelFromKey, NOT_STATED, LEVEL_NOT_STATED, MID_STATED_KEY,
  DISPLAY_LEVEL_ORDER, SENIORITY_DISPLAY_ORDER, SENIORITY_LADDER,
} from '../public/features/roles.js';
import { compstimateInputs } from '../public/features/compstimate.js';

test('displayLevel: the stored default "Mid" is "Not stated"; a stated level is shown as stored (shared decision 1)', () => {
  assert.equal(NOT_STATED, 'Not stated');
  assert.equal(LEVEL_NOT_STATED, 'Mid', 'stored data keeps "Mid"');
  assert.equal(displayLevel({ seniority: 'Mid' }), NOT_STATED, 'no basis yet: the default');
  assert.equal(displayLevel({ seniority: 'Mid', seniorityBasis: 'default' }), NOT_STATED);
  assert.equal(displayLevel({ seniority: 'Mid', seniorityBasis: 'title' }), 'Mid', 'Google "III", Netflix "L4"');
  assert.equal(displayLevel({ seniority: 'Mid', seniorityBasis: 'pay' }), 'Mid', 'a pay sentence that names the level');
  for (const l of ['Intern', 'Entry', 'Senior', 'Staff+', 'Manager', 'Director+']) {
    assert.equal(displayLevel({ seniority: l }), l);
    assert.equal(displayLevel({ seniority: l, seniorityBasis: 'default' }), l, `${l}: only "Mid" can be a default`);
  }
  assert.equal(displayLevel({}), NOT_STATED);
  assert.equal(displayLevel(null), NOT_STATED);
  assert.equal(displayLevel({ seniority: NOT_STATED }), NOT_STATED, 'idempotent on a shown value');
});

test('levelLabel reads a displayLevel value: "Level not stated", "Mid", the ladder as is', () => {
  assert.equal(levelLabel(NOT_STATED), 'Level not stated');
  assert.equal(levelLabel(undefined), 'Level not stated');
  assert.equal(levelLabel('Mid'), 'Mid');
  assert.equal(levelLabel(displayLevel({ seniority: 'Mid' })), 'Level not stated');
  assert.equal(levelLabel(displayLevel({ seniority: 'Mid', seniorityBasis: 'title' })), 'Mid');
  // Comparable across companies (market comps): never the default nor "Mid", which mostly is the default.
  assert.equal(levelStated('Mid'), false);
  assert.equal(levelStated(NOT_STATED), false);
  assert.equal(levelStated('Senior'), true);
});

test('levelKey: links and selects keep "Mid" for "Level not stated" (earlier links mean that); a stated mid level is "Mid-level"', () => {
  assert.equal(levelKey(NOT_STATED), 'Mid');
  assert.equal(levelKey('Mid'), MID_STATED_KEY);
  assert.equal(MID_STATED_KEY, 'Mid-level');
  for (const l of DISPLAY_LEVEL_ORDER) assert.equal(levelFromKey(levelKey(l)), l, `${l} round-trips`);
  assert.equal(levelFromKey('Unspecified'), NOT_STATED, 'the old "no level" value');
  assert.equal(levelFromKey('Not stated'), NOT_STATED);
});

test('display order: the ladder with "Mid" in place, then "Level not stated" last; the stored order is unchanged', () => {
  assert.deepEqual(DISPLAY_LEVEL_ORDER, [...SENIORITY_LADDER, NOT_STATED]);
  assert.deepEqual(SENIORITY_DISPLAY_ORDER, ['Intern', 'Entry', 'Senior', 'Staff+', 'Manager', 'Director+', 'Mid']);
});

const job = (id, seniority, extra = {}) => ({
  id, title: 'Software Engineer', department: 'Engineering', seniority, locations: [{ name: 'San Francisco, CA', city: 'San Francisco', country: 'US' }],
  salary: { min: 150000, max: 200000, mid: 175000, currency: 'USD' }, ...extra,
});

test('Compstimate follows the Seniority filter by displayLevel and estimates "Level not stated" on the stored ladder', () => {
  const board = [
    job('a', 'Mid'), job('b', 'Mid'), job('c', 'Mid', { seniorityBasis: 'title' }), job('d', 'Senior'), job('e', 'Senior'),
  ];
  const notStated = compstimateInputs({ s: [NOT_STATED] }, {}, board);
  assert.deepEqual(notStated.pool.map((j) => j.id), ['a', 'b'], 'only the default levels');
  assert.equal(notStated.query.seniority, 'Mid', 'weighted as the stored "Mid", as before');
  assert.equal(notStated.display.seniority, 'Mid', 'the Level select shows "Level not stated" (value levelKey: "Mid")');
  assert.deepEqual(notStated.basisParts, ['Level not stated']);
  const mid = compstimateInputs({ s: ['Mid'] }, {}, board);
  assert.deepEqual(mid.pool.map((j) => j.id), ['c'], 'a stated mid level only');
  assert.equal(mid.display.seniority, MID_STATED_KEY);
  assert.equal(mid.query.seniority, 'Mid');
  for (const v of ['Mid', MID_STATED_KEY, NOT_STATED]) assert.equal(compstimateInputs({}, { seniority: v }, board).query.seniority, 'Mid', `an edited "${v}"`);
  assert.deepEqual(compstimateInputs({}, { seniority: 'Mid' }, board).basisParts.slice(-1), ['Level not stated'], 'a stored "Mid" edit reads "Level not stated"');
  const two = compstimateInputs({ s: [NOT_STATED, 'Senior'] }, {}, board);
  assert.equal(two.labels.seniority, 'Level not stated or Senior (filters)');
});

test('the app shows, filters and names levels through displayLevel (no stored "Mid" reaches people)', () => {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(src, /const senKey = \(j\) => displayLevel\(j\);/);
  assert.doesNotMatch(src, /senLabel\(job\.seniority|j\.seniority \|\| 'Unspecified'|job\.seniority \|\| 'Mid'/, 'a level shown from the stored value');
  // "Level not stated" keeps the link value s=Mid that earlier links and saved searches use.
  assert.match(src, /k === 's' \? levelFromKey\(x\)/);
  assert.match(src, /k === 's' \? levelKey\(x\)/);
});

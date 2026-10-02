// Golden test for the normalization pipeline (perf work must not change output).
// Input: 300 real postings sampled (seeded) from data/snapshots/*.json, stored as
// raw jobs in test/fixtures/golden-raw.json.gz. Expected: sha256 of each
// normalized job (normalizeJobs per company, so vetting is included) in
// test/fixtures/golden-normalize.json.
// A deliberate output change (lexicon edits, new fields) regenerates it with:
//   UPDATE_GOLDEN=1 node --test test/golden-normalize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeJobs } from '../server/normalize.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const INPUT = path.join(FIX, 'golden-raw.json.gz');
const EXPECTED = path.join(FIX, 'golden-normalize.json');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

export function goldenOutputs() {
  const sample = JSON.parse(zlib.gunzipSync(fs.readFileSync(INPUT)).toString('utf8'));
  const byCompany = new Map();
  for (const { company, raw } of sample) {
    if (!byCompany.has(company.slug)) byCompany.set(company.slug, { company, raws: [] });
    byCompany.get(company.slug).raws.push(raw);
  }
  const out = {};
  for (const { company, raws } of byCompany.values()) {
    for (const job of normalizeJobs(raws, company)) out[job.id] = sha(JSON.stringify(job));
  }
  return out;
}

test('normalizeJobs output is byte-identical to the golden hashes (300 real jobs)', () => {
  const got = goldenOutputs();
  assert.equal(Object.keys(got).length, 300);
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(EXPECTED, JSON.stringify(got, null, 1) + '\n');
    return;
  }
  const want = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
  const diff = Object.keys(want).filter((id) => got[id] !== want[id]);
  assert.deepEqual(diff, [], `${diff.length} jobs changed, e.g. ${diff.slice(0, 5).join(', ')}`);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort());
});

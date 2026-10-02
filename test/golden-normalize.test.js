// Golden test for the normalization pipeline (perf work must not change output).
// Input: 300 real postings sampled (seeded) from data/snapshots/*.json, stored as
// raw jobs in test/fixtures/golden-raw.json.gz. Expected: sha256 of each
// normalized job (normalizeJobs per company, so vetting is included) in
// test/fixtures/golden-normalize.json.
// A deliberate output change (lexicon edits, new fields) must also bump
// NORMALIZER_VERSION in server/normalize.js (stored snapshots are then upgraded
// once by the server), then regenerate with:
//   UPDATE_GOLDEN=1 GOLDEN_REASON="what changed" node --test test/golden-normalize.test.js
// Re-baselines: 2026-10-02 initial; norm-3 "UX-3 canonical locations" (geo.js name/rawName).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeJobs, NORMALIZER_VERSION } from '../server/normalize.js';

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
    const prev = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, 'utf8')) : {};
    const history = [...(prev.history || []), { normalizerVersion: NORMALIZER_VERSION, reason: process.env.GOLDEN_REASON || 'unspecified', at: new Date().toISOString() }];
    fs.writeFileSync(EXPECTED, JSON.stringify({ normalizerVersion: NORMALIZER_VERSION, history, hashes: got }, null, 1) + '\n');
    return;
  }
  const file = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
  const want = file.hashes || file;
  const diff = Object.keys(want).filter((id) => got[id] !== want[id]);
  assert.deepEqual(diff, [], `${diff.length} jobs changed, e.g. ${diff.slice(0, 5).join(', ')}. If intended: bump NORMALIZER_VERSION and re-baseline (see header).`);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort());
  assert.equal(file.normalizerVersion, NORMALIZER_VERSION, 'golden hashes were recorded for another NORMALIZER_VERSION: re-baseline');
});

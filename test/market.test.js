import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMarket, percentileSorted, usdMid, MIN_N, BASIS, COLUMNS } from '../scripts/build-market.js';
import { toUSD } from '../public/viz/palette.js';
import { roleFamily } from '../public/features/compstimate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sal = (mid, currency = 'USD') => ({ min: mid - 10000, max: mid + 10000, mid, currency, interval: 'year' });
const job = (title, seniority, salary) => ({ title, seniority, salary });
const payload = (slug, jobs, mode = 'snapshot') => ({ company: { slug, name: slug.toUpperCase(), color: '#000000' }, mode, fetchedAt: '2026-10-01T00:00:00Z', jobs });
const cell = (doc, company, family, seniority) => {
  const c = doc.cells.find((x) => x[0] === company && x[1] === family && x[2] === seniority);
  return c ? Object.fromEntries(doc.columns.map((k, i) => [k, c[i]])) : null;
};

test('percentiles (linear interpolation) and USD midpoints', () => {
  assert.equal(percentileSorted([], 0.5), null);
  assert.equal(percentileSorted([10], 0.25), 10);
  assert.equal(percentileSorted([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentileSorted([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(percentileSorted([100, 200, 300, 400], 0.75), 325);
  assert.equal(usdMid(sal(150000)), 150000);
  assert.equal(usdMid(sal(100000, 'GBP')), toUSD(100000, 'GBP'));
  assert.equal(usdMid(sal(100000, 'XXX')), null, 'unknown currency is skipped');
  assert.equal(usdMid(null), null);
  assert.equal(usdMid({ min: 100, max: 300, currency: 'USD' }), 200, 'mid derived when missing');
});

test('cells: family x seniority and family roll-up, n >= 3, vetted salaries only, USD', () => {
  const swe = 'Software Engineer, Backend';
  assert.equal(roleFamily(swe), 'swe');
  const doc = buildMarket([
    payload('acme', [
      job(swe, 'Senior', sal(200000)), job(swe, 'Senior', sal(220000)), job(swe, 'Senior', sal(240000)), job(swe, 'Senior', sal(260000)),
      job(swe, 'Mid', sal(150000)), job(swe, 'Mid', sal(160000)), // n = 2 at Mid: no cell
      { ...job(swe, 'Senior', null), salaryRaw: sal(9000000), salaryFlag: { codes: ['above_max'] } }, // quarantined
      job('Zzz Qqq', 'Senior', sal(100000)), // no role family
    ]),
    payload('globex', [
      job(swe, 'Senior', sal(100000, 'GBP')), job(swe, 'Senior', sal(110000, 'GBP')), job(swe, 'Senior', sal(120000, 'GBP')),
    ]),
  ], { generatedAt: '2026-10-02T00:00:00Z' });
  assert.equal(doc.format, 'melon-market-1');
  assert.equal(doc.basis, BASIS);
  assert.equal(doc.basis, 'posted base pay ranges');
  assert.equal(doc.currency, 'USD');
  assert.equal(doc.minN, MIN_N);
  assert.equal(doc.mode, 'real');
  assert.deepEqual(doc.columns, [...COLUMNS]);
  const s = cell(doc, 'acme', 'swe', 'Senior');
  assert.deepEqual(s, { company: 'acme', family: 'swe', seniority: 'Senior', n: 4, p25: 215000, median: 230000, p75: 245000 });
  assert.equal(cell(doc, 'acme', 'swe', 'Mid'), null, 'n < 3 dropped');
  assert.equal(cell(doc, 'acme', 'swe', '*').n, 6, 'roll-up includes Mid, excludes quarantined');
  const g = cell(doc, 'globex', 'swe', 'Senior');
  assert.equal(g.median, Math.round(toUSD(110000, 'GBP') / 100) * 100, 'converted to USD');
  for (const c of doc.cells) assert.ok(c[3] >= 3);
  const acme = doc.companies.find((c) => c.slug === 'acme');
  assert.deepEqual([acme.jobs, acme.salaried, acme.used], [8, 7, 6]);
  assert.deepEqual(doc.families, ['swe']);
});

test('demo payloads are used only when no company has real data', () => {
  const swe = 'Software Engineer';
  const three = [job(swe, 'Mid', sal(100000)), job(swe, 'Mid', sal(110000)), job(swe, 'Mid', sal(120000))];
  const mixed = buildMarket([payload('real', three, 'live'), payload('fake', three, 'demo')]);
  assert.deepEqual(mixed.companies.map((c) => c.slug), ['real']);
  assert.equal(mixed.mode, 'real');
  const demoOnly = buildMarket([payload('fake', three, 'demo')]);
  assert.equal(demoOnly.mode, 'demo');
  assert.equal(demoOnly.cells.length, 2);
  assert.equal(buildMarket([]).cells.length, 0);
  assert.equal(buildMarket(null).mode, 'demo');
});

test('deterministic output order', () => {
  const swe = 'Software Engineer';
  const jobs = [job(swe, 'Mid', sal(100000)), job(swe, 'Mid', sal(110000)), job(swe, 'Mid', sal(120000))];
  const a = buildMarket([payload('b', jobs), payload('a', jobs)], { generatedAt: 'x' });
  const b = buildMarket([payload('a', jobs), payload('b', jobs)], { generatedAt: 'x' });
  assert.deepEqual(a.cells, b.cells);
});

test('real snapshots: market.json for the built-ins is <= 150 KB', { skip: !fs.existsSync(path.join(ROOT, 'data', 'snapshots', 'anthropic.json')) && 'no committed snapshots' }, async () => {
  const { vetSalaries } = await import('../server/vet.js');
  const dir = path.join(ROOT, 'data', 'snapshots');
  const payloads = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const snap = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { company: snap.company, mode: 'snapshot', fetchedAt: snap.fetchedAt, jobs: vetSalaries(snap.jobs) };
  });
  const doc = buildMarket(payloads);
  const bytes = Buffer.byteLength(JSON.stringify(doc));
  assert.ok(bytes <= 150 * 1024, `market.json is ${bytes} bytes`);
  assert.ok(doc.cells.length > 50, `${doc.cells.length} cells`);
  assert.ok(doc.companies.length >= 5);
  for (const c of doc.cells) {
    assert.ok(c[3] >= 3);
    assert.ok(c[4] <= c[5] && c[5] <= c[6], 'p25 <= median <= p75');
    assert.ok(c[5] >= 10000 && c[5] <= 5000000, `plausible USD median ${c[5]}`);
  }
});

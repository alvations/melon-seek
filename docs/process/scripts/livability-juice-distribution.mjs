#!/usr/bin/env node
// Juice Score distribution over the real board snapshots (used to tune the score curve).
//
//   node docs/process/scripts/livability-juice-distribution.mjs [snapshotDir]
//
// Loads data/snapshots/*.json (gitignored; `npm run snapshot` or the snapshot workflow
// artifact), runs the vetting gate (quarantined salaries become null, as in the app),
// attaches juice with data/cities.json and prints salary / net / score percentiles, the
// share at 100, grade counts and per-company medians. Pass --old to also score with the
// previous clamped log curve (A = $10K, B = $250K) for a before/after comparison.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'data', 'snapshots'));
const { attachJuiceAll, scoreFromNet, gradeFor, SCORE_ANCHORS } = await import(path.join(ROOT, 'server', 'juice.js'));
const { vetSalaries } = await import(path.join(ROOT, 'server', 'vet.js'));
const cities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));

const oldScore = (n) => (n > 0 ? Math.min(100, (100 * Math.log1p(n / 10000)) / Math.log1p(25)) : 0);
const pct = (arr, p) => {
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo);
};

const rows = [];
let total = 0;
let salaried = 0;
let quarantined = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  let jobs = (Array.isArray(d) ? d : d.jobs).map(({ descriptionHtml, sections, keywords, ...j }) => j);
  total += jobs.length;
  jobs = vetSalaries(jobs);
  quarantined += jobs.filter((j) => j.salaryFlag).length;
  salaried += jobs.filter((j) => j.salary).length;
  attachJuiceAll(jobs, cities, { inputs: 'none' });
  for (const j of jobs) if (j.juice) rows.push({ company: f.replace(/\.json$/, ''), salaryUSD: j.juice.salaryUSD, net: j.juice.best.net });
}

const curves = [['new', (n) => Math.round(scoreFromNet(n))]];
if (args.includes('--old')) curves.push(['old', (n) => Math.round(oldScore(n))]);
console.log(`${total} jobs, ${salaried} salaried after vetting (${quarantined} quarantined), ${rows.length} with juice. Curve: ${JSON.stringify(SCORE_ANCHORS)}`);
console.log(`pct     salaryUSD       net  ${curves.map(([k]) => `${k}`.padStart(5)).join(' ')}`);
for (const p of [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999, 1]) {
  const net = pct(rows.map((r) => r.net), p);
  console.log(`${String(p).padEnd(6)} ${String(Math.round(pct(rows.map((r) => r.salaryUSD), p))).padStart(10)} ${String(Math.round(net)).padStart(9)}  ${curves.map(([, f]) => String(f(net)).padStart(5)).join(' ')}`);
}
for (const [k, f] of curves) {
  const s = rows.map((r) => f(r.net));
  const grades = {};
  for (const [i, r] of rows.entries()) { const g = gradeFor(s[i], r.net); grades[g] = (grades[g] || 0) + 1; }
  console.log(`${k}: score 100 = ${s.filter((x) => x >= 100).length}, >= 90 = ${s.filter((x) => x >= 90).length}, grades ${JSON.stringify(grades)}`);
}
for (const c of [...new Set(rows.map((r) => r.company))]) {
  const n = rows.filter((r) => r.company === c).map((r) => r.net);
  const top = [...n].sort((a, b) => b - a).slice(0, Math.ceil(n.length / 10));
  console.log(`${c.padEnd(10)} ${String(n.length).padStart(5)}  ${curves.map(([k, f]) => `${k} p50 ${f(pct(n, 0.5))} p90 ${f(pct(n, 0.9))} =100 ${n.filter((x) => f(x) >= 100).length} top-decile distinct ${new Set(top.map(f)).size}`).join(' | ')}`);
}

// Role-family hand-check sampler (docs/process/product.md §5, v2).
// Draws 100 real titles from data/snapshots/*.json, stratified over the 8 companies
// (13 each for the first 4 files alphabetically, 12 each for the rest), with a
// seeded mulberry32 PRNG, and prints the family roleFamily() assigns.
//   node docs/process/scripts/product-family-check.mjs 20261004        # table to judge by hand
//   node docs/process/scripts/product-family-check.mjs 20261004 json   # JSON
// Seeds used: 20261002 (check 1), 20261003 (check 2), 20261004 (check 3, final).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = await import(pathToFileURL(path.join(ROOT, 'public/features/roles.js')).href);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(Number(process.argv[2] || 20261004));
const dir = path.join(ROOT, 'data/snapshots');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const out = [];
files.forEach((f, idx) => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f)));
  const jobs = d.jobs.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const k = idx < 4 ? 13 : 12;
  const picked = new Set();
  while (picked.size < Math.min(k, jobs.length)) picked.add(Math.floor(rand() * jobs.length));
  for (const i of [...picked].sort((a, b) => a - b)) {
    out.push({ company: f.replace('.json', ''), title: jobs[i].title, department: jobs[i].department, family: R.roleFamily(jobs[i].title, { department: jobs[i].department }) });
  }
});
if (process.argv[3] === 'json') console.log(JSON.stringify(out));
else out.forEach((r, i) => console.log(String(i + 1).padStart(3), (r.family || '-').padEnd(13), r.company.padEnd(9), r.title, ' || ', r.department));

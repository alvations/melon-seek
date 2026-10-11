// Gate threshold study for the beta vetting (docs/process/vetting-beta.md, summary.md "Runtime gate").
// Runs server/vet.js#vetSalaries with changed thresholds on a COPY of the gate (server/vet.js and
// server/salary.js are copied to a temp dir and their constants replaced there; the repo's gate is
// never edited), over un-quarantined published lists (published-view.mjs --ungated), and scores each
// quarantine against the reviewers' verdicts (this folder's and data/vetting/2026-10-02/).
//
//   node data/vetting/2026-10-11-beta/gate-study.mjs <ungated-dir> [--ids]
//
// A quarantine of a job whose verdict (same parsed min/max) is `correct` is a false positive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const [dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showIds = process.argv.includes('--ids');
if (!dir) { console.error('usage: gate-study.mjs <ungated-dir> [--ids]'); process.exit(2); }

// A copy of the gate whose thresholds come from globalThis.VET_OVERRIDE, plus an optional
// pay_other_country hard check (the pay line names a country none of the job's countries is).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-study-'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}\n');
fs.copyFileSync(path.join(ROOT, 'server', 'salary.js'), path.join(tmp, 'salary.js'));
let vet = fs.readFileSync(path.join(ROOT, 'server', 'vet.js'), 'utf8');
const swap = (from, to) => { if (!vet.includes(from)) throw new Error(`gate-study: server/vet.js changed, cannot find ${JSON.stringify(from)}`); vet = vet.replace(from, to); };
swap('export const VET = Object.freeze({\n  MAX_ANNUAL: 1_200_000,', 'const OV = (globalThis.VET_OVERRIDE || {});\nexport const VET = Object.freeze({\n  MAX_ANNUAL: OV.MAX_ANNUAL ?? 1_200_000,');
swap('  RATIO_QUARANTINE: 4,', '  RATIO_QUARANTINE: OV.RATIO_QUARANTINE ?? 4,');
swap('  MAX_HOURLY_USD: 250,', '  MAX_HOURLY_USD: OV.MAX_HOURLY_USD ?? 250,');
swap('  const tc = titleClass(job && job.title);', "  if (OV.PAY_OTHER_COUNTRY && salary.country && job && Array.isArray(job.locations)) { const cs = [...new Set(job.locations.map((l) => l && l.country).filter(Boolean))]; if (cs.length && !cs.includes(salary.country)) out.push({ code: 'pay_other_country', reason: `the pay line is for ${salary.country}, not for this job's countries (${cs.join(', ')})` }); }\n  const tc = titleClass(job && job.title);");
fs.writeFileSync(path.join(tmp, 'vet.js'), vet);

const lists = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ slug: path.basename(f, '.json'), jobs: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).jobs }));
const verdicts = new Map();
for (const f of [path.join(HERE, 'verdicts.jsonl'), path.join(ROOT, 'data', 'vetting', '2026-10-02', 'verdicts.jsonl')]) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const v = JSON.parse(l);
    const k = `${v.id}|${v.parsed ? v.parsed.min : ''}|${v.parsed ? v.parsed.max : ''}`;
    if (!verdicts.has(k)) verdicts.set(k, v);
  }
}
const VARIANTS = [
  ['shipped', {}],
  ['MAX_ANNUAL $1.5M', { MAX_ANNUAL: 1_500_000 }],
  ['RATIO_QUARANTINE 3.5x', { RATIO_QUARANTINE: 3.5 }],
  ['RATIO_QUARANTINE 3x', { RATIO_QUARANTINE: 3 }],
  ['MAX_HOURLY_USD $350', { MAX_HOURLY_USD: 350 }],
  ['+ pay_other_country check', { PAY_OTHER_COUNTRY: true }],
  ['proposed: $1.5M + pay_other_country', { MAX_ANNUAL: 1_500_000, PAY_OTHER_COUNTRY: true }],
];
let i = 0;
for (const [name, ov] of VARIANTS) {
  globalThis.VET_OVERRIDE = ov;
  const { vetSalaries } = await import(`${pathToFileURL(path.join(tmp, 'vet.js')).href}?v=${i++}`);
  let total = 0; let bad = 0; let fp = 0; let unreviewed = 0;
  const per = []; const ids = [];
  for (const { slug, jobs } of lists) {
    const q = vetSalaries(jobs).filter((j) => j.salaryFlag);
    if (q.length) per.push(`${slug} ${q.length}`);
    total += q.length;
    for (const j of q) {
      const v = verdicts.get(`${j.id}|${j.salaryRaw.min}|${j.salaryRaw.max}`);
      const tag = !v ? 'unreviewed' : v.verdict === 'correct' ? 'FP' : 'bad';
      if (tag === 'FP') fp++; else if (tag === 'bad') bad++; else unreviewed++;
      ids.push(`${j.id}(${tag}:${j.salaryFlag.codes.join('+')})`);
    }
  }
  console.log(`${name.padEnd(36)} quarantined ${String(total).padStart(3)} | bad ${bad} | false positives ${fp} | unreviewed ${unreviewed} | ${per.join(', ')}`);
  if (showIds) console.log(`   ${ids.join(' ')}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// The job lists as the beta site publishes them, for the vetting scan (docs/process/vetting-beta.md).
// Same steps as scripts/build-static.js#readSnapshot: a snapshot from an older normalizer is
// re-derived (relocateJobs(rekeyBoardJobs(jobs).jobs)), then the big-tech adapter fixes
// (upgradeStoredJobs), then the vetting gate (vetSalaries).
//
//   node data/vetting/2026-10-11-beta/published-view.mjs <out-dir> <snapshot.json...> [--ungated]
//
// Writes <out-dir>/<slug>.json ({ ...snapshot, jobs }). With --ungated it also writes
// <out-dir>/ungated/<slug>.json: the same lists with every quarantine undone (salary =
// salaryRaw), for a scan without the gate. Output goes outside the repo (snapshots are not
// committed). On 2026-10-11 the published salaries equal the stored ones for all 16,182 jobs
// (numbers, currency and kind); only norm-8 labels (salary.country, partTime) are added.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
const args = process.argv.slice(2);
const ungated = args.includes('--ungated');
const [outDir, ...files] = args.filter((a) => !a.startsWith('--'));
if (!outDir || !files.length) {
  console.error('usage: published-view.mjs <out-dir> <snapshot.json...> [--ungated]');
  process.exit(2);
}
const { relocateJobs, NORMALIZER_VERSION } = await imp('server', 'normalize.js');
const { vetSalaries } = await imp('server', 'vet.js');
const { rekeyBoardJobs } = await imp('server', 'keywords.js');
const { upgradeStoredJobs } = await imp('server', 'sources', 'upgrade.js');
fs.mkdirSync(outDir, { recursive: true });
if (ungated) fs.mkdirSync(path.join(outDir, 'ungated'), { recursive: true });
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
  const current = parsed.normalizerVersion === NORMALIZER_VERSION;
  const jobs = vetSalaries(upgradeStoredJobs(current ? parsed.jobs : relocateJobs(rekeyBoardJobs(parsed.jobs).jobs)));
  const slug = (parsed.company && parsed.company.slug) || path.basename(f, '.json');
  fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({ ...parsed, jobs }));
  if (ungated) {
    const raw = jobs.map((j) => { if (!j.salaryFlag) return j; const { salaryRaw, salaryFlag, ...rest } = j; return { ...rest, salary: salaryRaw }; });
    fs.writeFileSync(path.join(outDir, 'ungated', `${slug}.json`), JSON.stringify({ ...parsed, jobs: raw }));
  }
  console.log(`${slug}: ${jobs.length} jobs (stored ${parsed.normalizerVersion}${current ? '' : `, re-derived with ${NORMALIZER_VERSION}`}), salaried ${jobs.filter((j) => j.salary).length}, quarantined ${jobs.filter((j) => j.salaryFlag).length}`);
}

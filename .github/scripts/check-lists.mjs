// CI (ci.yml "Static build"): the built job lists, read the way the app reads them (public/api.js
// unpackJobs), not as raw JSON. The raw-JSON jq checks broke when melon-packed-3 (perf-mobile-beta-2)
// stored most jobs as value arrays (CI run 38930131882: "Cannot check whether array has a string key").
//
//   node .github/scripts/check-lists.mjs [dist]
//
// For every list in <dist>/api/jobs and <dist>/beta/api/jobs:
//   - a packed format the app reads (melon-packed-2 or melon-packed-3), with meta.compstimate and meta.history;
//   - it unpacks to an array of job objects;
//   - lists carry no description HTML (descriptions are lazy, one file per job);
//   - Juice is never stored in a list (it is worked out in the browser).
import fs from 'node:fs';
import path from 'node:path';
import { unpackJobs } from '../../public/api.js';

const DIST = process.argv[2] || 'dist';
const FORMATS = new Set(['melon-packed-2', 'melon-packed-3']);
let checked = 0;
const problems = [];

for (const site of [DIST, path.join(DIST, 'beta')]) {
  const dir = path.join(site, 'api', 'jobs');
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const where = path.join(dir, file);
    const body = JSON.parse(fs.readFileSync(where, 'utf8'));
    if (!FORMATS.has(body.format)) problems.push(`${where}: format ${JSON.stringify(body.format)} is not one the app reads`);
    const meta = body.meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !('compstimate' in meta) || !('history' in meta)) {
      problems.push(`${where}: meta has no compstimate and history`);
    }
    let jobs;
    try { jobs = unpackJobs(body); } catch (e) { problems.push(`${where}: does not unpack (${e.message})`); continue; }
    if (!Array.isArray(jobs) || jobs.some((j) => !j || typeof j !== 'object' || Array.isArray(j))) {
      problems.push(`${where}: does not unpack to job objects`);
      continue;
    }
    const html = jobs.filter((j) => j.descriptionHtml).length;
    if (html) problems.push(`${where}: ${html} jobs carry description HTML (descriptions are lazy)`);
    const juice = jobs.filter((j) => 'juice' in j).length;
    if (juice) problems.push(`${where}: ${juice} jobs carry a stored Juice score`);
    checked++;
  }
}

if (!checked) problems.push(`no job lists under ${DIST}/api/jobs`);
for (const p of problems) console.error(`check-lists: ${p}`);
console.log(`check-lists: ${checked} lists read through unpackJobs, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);

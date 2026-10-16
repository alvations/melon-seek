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
// And every first-page preview in <site>/api/preview (perf-mobile-beta-2; scripts/build-static.js#previewList):
//   - the same format rules, with `preview: { total, colorCounts }`;
//   - it unpacks to job objects with no description HTML and no stored Juice;
//   - those are the list's own postings, value for value, and `total` is the list's length.
import fs from 'node:fs';
import path from 'node:path';
import { unpackJobs } from '../../public/api.js';

const DIST = process.argv[2] || 'dist';
const FORMATS = new Set(['melon-packed-2', 'melon-packed-3']);
let checked = 0;
let previews = 0;
const problems = [];
const lists = new Map(); // list file -> unpacked jobs (for the preview checks)

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
    lists.set(where, jobs);
    checked++;
  }
  const pdir = path.join(site, 'api', 'preview');
  if (!fs.existsSync(pdir)) continue;
  for (const file of fs.readdirSync(pdir).filter((f) => f.endsWith('.json')).sort()) {
    const where = path.join(pdir, file);
    const body = JSON.parse(fs.readFileSync(where, 'utf8'));
    if (!FORMATS.has(body.format)) problems.push(`${where}: format ${JSON.stringify(body.format)} is not one the app reads`);
    const pv = body.preview;
    if (!pv || !Number.isInteger(pv.total) || !Array.isArray(pv.colorCounts)) problems.push(`${where}: no preview { total, colorCounts }`);
    let jobs;
    try { jobs = unpackJobs(body); } catch (e) { problems.push(`${where}: does not unpack (${e.message})`); continue; }
    if (!Array.isArray(jobs) || !jobs.length || jobs.some((j) => !j || typeof j !== 'object' || Array.isArray(j))) {
      problems.push(`${where}: does not unpack to job objects`);
      continue;
    }
    if (jobs.some((j) => j.descriptionHtml)) problems.push(`${where}: preview jobs carry description HTML`);
    if (jobs.some((j) => 'juice' in j)) problems.push(`${where}: preview jobs carry a stored Juice score`);
    const list = lists.get(path.join(site, 'api', 'jobs', file));
    if (!list) { problems.push(`${where}: no list ${file} beside it`); continue; }
    if (pv && pv.total !== list.length) problems.push(`${where}: total ${pv.total}, the list has ${list.length}`);
    const byId = new Map(list.map((j) => [j.id, j]));
    const off = jobs.filter((j) => JSON.stringify(j) !== JSON.stringify(byId.get(j.id))).length;
    if (off) problems.push(`${where}: ${off} preview jobs are not the list's own postings`);
    previews++;
  }
}

if (!checked) problems.push(`no job lists under ${DIST}/api/jobs`);
for (const p of problems) console.error(`check-lists: ${p}`);
console.log(`check-lists: ${checked} lists read through unpackJobs${previews ? ` (and ${previews} previews)` : ''}, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);

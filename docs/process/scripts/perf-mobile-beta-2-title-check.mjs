// perf-mobile-beta-2-readable-title-memo.diff: the patched roles.js#readableTitle equals the unpatched one
// for every title of every list of a build, twice (the second pass reads the memo).
// usage: node perf-mobile-beta-2-title-check.mjs <roles.js> <patched roles.js> <dist>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const [a, b, dist] = process.argv.slice(2).map((p) => path.resolve(p));
const A = await import(pathToFileURL(a).href);
const B = await import(pathToFileURL(b).href);
let n = 0;
for (const site of [dist, path.join(dist, 'beta')]) {
  const api = await import(pathToFileURL(path.join(site, 'api.js')).href);
  for (const f of fs.readdirSync(path.join(site, 'api', 'jobs'))) {
    const jobs = api.unpackJobs(JSON.parse(fs.readFileSync(path.join(site, 'api', 'jobs', f), 'utf8')));
    for (let pass = 0; pass < 2; pass++) for (const j of jobs) { assert.equal(B.readableTitle(j.title), A.readableTitle(j.title), j.title); n++; }
  }
}
for (const t of [undefined, null, '', 0, '8. Mixed Signal Design Engineer', 'Forward Deployed Engineer (FDE)']) assert.equal(B.readableTitle(t), A.readableTitle(t));
console.log(`readableTitle identical on ${n} titles`);

// The roles.js memo patch returns exactly what the unpatched module returns, for every title and
// department on every bundled list (both sites): expandTitle, roleFamily, normalizeTitle, inferSeniority.
// usage: node perf-mobile-beta-roles-check.mjs <orig roles.js> <patched roles.js> <dist>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const [orig, patched, dist] = process.argv.slice(2).map((p) => path.resolve(p));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
fs.copyFileSync(orig, path.join(tmp, 'a.mjs')); fs.copyFileSync(patched, path.join(tmp, 'b.mjs'));
const A = await import(pathToFileURL(path.join(tmp, 'a.mjs')).href), B = await import(pathToFileURL(path.join(tmp, 'b.mjs')).href);
const api = await import(pathToFileURL(path.join(dist, 'beta', 'api.js')).href);
let n = 0;
for (const site of [dist, path.join(dist, 'beta')]) {
  for (const f of fs.readdirSync(path.join(site, 'api', 'jobs'))) {
    for (const j of api.unpackJobs(JSON.parse(fs.readFileSync(path.join(site, 'api', 'jobs', f), 'utf8')))) {
      for (const pass of [1, 2]) { // the second pass reads the memo
        for (const t of [j.title, j.department, j.team, '', null]) assert.equal(B.expandTitle(t), A.expandTitle(t));
        assert.equal(B.roleFamily(j.title, j), A.roleFamily(j.title, j));
        assert.deepStrictEqual(B.normalizeTitle(j.title, { department: j.department }), A.normalizeTitle(j.title, { department: j.department }));
        assert.equal(B.inferSeniority(j.title), A.inferSeniority(j.title));
        assert.equal(B.rolePart(j.title), A.rolePart(j.title));
      }
      n++;
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`roles memo: ${n} jobs, identical`);

// Full-scale identity check for perf-mobile-beta-2 (docs/process/perf-mobile-beta-2.md): the OLD api.js
// on the OLD build (melon-packed-2 lists, plain attachJuiceAll) against the NEW api.js on the NEW build
// (melon-packed-3, Juice once per distinct pay and places), getJobs for every company of both sites,
// first load and switch-back: deep-equal and identical JSON (key order). Also the unpacked list files, and
// each first-page preview (api.js#getPreview) against getJobs' own postings.
// Build both with the same MELON_BUILT_AT (listing ages follow it) and the same snapshots.
// usage: node perf-mobile-beta-2-equal-check.mjs <old dist> <new dist> <old api.js (git show 31ad25b:public/api.js)>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const [before, after, oldApi] = process.argv.slice(2).map((p) => path.resolve(p));
let n = 0;
async function load(site, apiFile) {
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    const file = path.join(site, decodeURIComponent(u.split(/[?#]/)[0]));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('{"error":"Not found"}', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return import(`${pathToFileURL(apiFile).href}?eq=${++n}`);
}
const ms = (t) => `${Math.round(performance.now() - t)} ms`;
for (const sub of ['', 'beta']) {
  const B = path.join(before, sub), A = path.join(after, sub);
  const slugs = JSON.parse(fs.readFileSync(path.join(A, 'api', 'companies.json'), 'utf8')).map((c) => c.slug);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(B, 'api', 'companies.json'), 'utf8')).map((c) => c.slug), slugs);
  const oldFile = path.join(B, 'api-old-check.js'); // the old api.js resolves ./lib/ against the OLD build
  fs.copyFileSync(oldApi, oldFile);
  const oldMod = await load(B, oldFile);
  const results = {};
  for (const s of slugs) { const t = performance.now(); results[s] = { old: JSON.stringify(await oldMod.getJobs(s)), tOld: ms(t) }; }
  for (const s of slugs.slice(0, 2)) results[s].oldBack = JSON.stringify(await oldMod.getJobs(s));
  const newMod = await load(A, path.join(A, 'api.js'));
  for (const s of slugs) {
    // The first-page preview (when the build wrote one) holds getJobs' own postings, juice and all.
    const pv = typeof newMod.getPreview === 'function' ? await newMod.getPreview(s) : null;
    const t = performance.now();
    const res = await newMod.getJobs(s);
    const tNew = ms(t);
    if (pv) {
      const byId = new Map(res.jobs.map((j) => [j.id, j]));
      assert.equal(JSON.stringify(pv.jobs), JSON.stringify(pv.jobs.map((j) => byId.get(j.id))), `${s}: preview postings`);
      assert.equal(pv.total, res.jobs.length, `${s}: preview total`);
      console.log(`  ${s}: preview of ${pv.jobs.length} identical to the list's postings`);
    }
    const o = JSON.parse(results[s].old);
    assert.equal(JSON.stringify(res), results[s].old, `${sub || 'stable'} ${s}: key order and values`);
    assert.deepStrictEqual(rtUndefined(res), o, `${sub || 'stable'} ${s}: getJobs result`);
    const rawA = JSON.parse(fs.readFileSync(path.join(A, 'api', 'jobs', `${s}.json`), 'utf8'));
    const rawB = JSON.parse(fs.readFileSync(path.join(B, 'api', 'jobs', `${s}.json`), 'utf8'));
    assert.equal(JSON.stringify(newMod.unpackJobs(rawA)), JSON.stringify(oldMod.unpackJobs(rawB)), `${s}: same list file content`);
    console.log(`${sub || 'stable'} ${s}: ${res.jobs.length} jobs identical (${rawB.format} -> ${rawA.format}; getJobs in node ${results[s].tOld} -> ${tNew})`);
  }
  for (const s of slugs.slice(0, 2)) assert.equal(JSON.stringify(await newMod.getJobs(s)), results[s].oldBack, `${s}: switch-back`);
  fs.rmSync(oldFile);
}
/** JSON drops undefined values; the stored old result went through JSON, so compare the same way. */
function rtUndefined(x) { return JSON.parse(JSON.stringify(x)); }
console.log('all identical');

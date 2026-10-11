// Full-scale identity check on the real builds: the old api.js (e.g. `git show 0ce5280:public/api.js`)
// on build B vs the new api.js on build A, getJobs for every company of both sites (first load and
// switch-back from the LRU), deep-equal and key order. Also: the list files hold the same jobs.
// Pass the same build twice (or two builds with the same MELON_BUILT_AT: listing ages follow it).
// usage: node perf-mobile-beta-equal-check.mjs <dist B> <dist A> <old-api.js>
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
for (const sub of ['', 'beta']) {
  const B = path.join(before, sub), A = path.join(after, sub);
  const slugs = JSON.parse(fs.readFileSync(path.join(A, 'api', 'companies.json'), 'utf8')).map((c) => c.slug);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(B, 'api', 'companies.json'), 'utf8')).map((c) => c.slug), slugs);
  // old api.js must resolve ./lib/ against the BEFORE build
  const oldFile = path.join(B, 'api-old-check.js');
  fs.copyFileSync(oldApi, oldFile);
  const results = {};
  const oldMod = await load(B, oldFile);
  for (const s of slugs) results[s] = { old: await oldMod.getJobs(s) };
  for (const s of slugs.slice(0, 2)) results[s].oldBack = await oldMod.getJobs(s);
  const newMod = await load(A, path.join(A, 'api.js'));
  for (const s of slugs) {
    const res = await newMod.getJobs(s);
    const o = results[s].old;
    assert.deepStrictEqual(res, o, `${sub || 'stable'} ${s}: getJobs result`);
    assert.equal(JSON.stringify(res), JSON.stringify(o), `${sub || 'stable'} ${s}: key order`);
    const rawA = JSON.parse(fs.readFileSync(path.join(A, 'api', 'jobs', `${s}.json`), 'utf8'));
    const rawB = JSON.parse(fs.readFileSync(path.join(B, 'api', 'jobs', `${s}.json`), 'utf8'));
    assert.equal(JSON.stringify(newMod.unpackJobs(rawA)), JSON.stringify(oldMod.unpackJobs(rawB)), `${s}: same list file content`);
    const { vetted, ...sharedA } = rawA.shared;
    const { vetted: _v, ...sharedB } = rawB.shared;
    assert.deepStrictEqual(sharedA, sharedB);
    console.log(`${sub || 'stable'} ${s}: ${res.jobs.length} jobs identical${vetted ? ' (vetted)' : ''}`);
  }
  for (const s of slugs.slice(0, 2)) {
    const back = await newMod.getJobs(s);
    assert.equal(JSON.stringify(back), JSON.stringify(results[s].oldBack), `${s}: switch-back`);
  }
  fs.rmSync(oldFile);
}
console.log('all identical');

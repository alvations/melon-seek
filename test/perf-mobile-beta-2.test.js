// Second beta performance pass (docs/process/perf-mobile-beta-2.md): Amazon's whole board. Two changes
// must not change what the app gets:
//  - melon-packed-3 (scripts/build-static.js#packList, public/api.js#unpackJobs: row arrays, salary
//    extras and ranges as tuples, salary.text by reference, url templates) unpacks to exactly what the
//    31ad25b melon-packed-2 code unpacked, key order included. The reference is a verbatim copy of that
//    code (test/fixtures/packed-2-reference.js);
//  - getJobs (Juice now in time slices) equals unpack -> vetSalaries -> attachJuiceAll, key order included.
// Builds a temp site (the real Anthropic snapshot when present, else the Greenhouse fixture) for the
// built lib/ modules and cities, and runs the BUILT api.js.
// Owner: perf-mobile-beta-2 (public/api.js, scripts/build-static.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = await import(pathToFileURL(path.join(ROOT, 'test', 'fixtures', 'packed-2-reference.js')).href);
const { packList } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build-static.js')).href);
const realFetch = globalThis.fetch;
let TMP, DIST;
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));
const rt = (x) => JSON.parse(JSON.stringify(x)); // what the browser gets: the file, parsed

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-perf-beta2-'));
  DIST = path.join(TMP, 'dist');
  const snaps = path.join(TMP, 'snapshots');
  const empty = path.join(TMP, 'empty');
  fs.mkdirSync(snaps); fs.mkdirSync(empty);
  const real = path.join(ROOT, 'data', 'snapshots', 'anthropic.json');
  if (fs.existsSync(real)) fs.copyFileSync(real, path.join(snaps, 'anthropic.json'));
  else {
    const { mapGreenhouseJob } = await import(pathToFileURL(path.join(ROOT, 'server', 'sources', 'greenhouse.js')).href);
    const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
    const { getCompany } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
    const fx = readJson(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json');
    fs.writeFileSync(path.join(snaps, 'anthropic.json'), JSON.stringify({ mode: 'snapshot', fetchedAt: '2026-10-01T00:00:00.000Z', jobs: normalizeJobs(fx.jobs.map(mapGreenhouseJob), getCompany('anthropic')) }));
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST, '--no-beta'], {
    cwd: ROOT, env: { ...process.env, MELON_SNAPSHOT_DIR: snaps, MELON_HISTORY_DIR: empty, MELON_BETA_SNAPSHOT_DIR: empty, MELON_BETA_HISTORY_DIR: empty, MELON_BETA_COMPANIES: '' }, encoding: 'utf8', timeout: 180000,
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
});

after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

let n = 0;
/** The built api.js, with fetch() served from the site's files plus `extra` { path: body }. */
async function siteApi(extra = {}) {
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = [];
  globalThis.fetch = async (url) => {
    const u = String(url).split(/[?#]/)[0];
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    if (u in extra) return new Response(JSON.stringify(extra[u]), { status: 200, headers: { 'content-type': 'application/json' } });
    const file = path.join(DIST, decodeURIComponent(u));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('{"error":"Not found"}', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return import(`${pathToFileURL(path.join(DIST, 'api.js')).href}?beta2=${++n}`);
}

/** The site's Anthropic jobs as the build meant to ship them (plain, unpacked). */
async function anthropicPlain() {
  const api = await siteApi();
  const raw = readJson(DIST, 'api', 'jobs', 'anthropic.json');
  const { format, shared, dict, columns, ...rest } = raw;
  return { ...rest, jobs: api.unpackJobs(raw) };
}

/**
 * A board like Amazon's, built from real jobs: every melon-packed-3 encoding and every fallback, and
 * many postings that repeat a pay and places (as one requisition posted in many cities).
 */
function amazonLike(base) {
  // Built from the site's jobs (the real Anthropic list, or in CI the 3-posting Greenhouse fixture), with
  // pay and places of its own: 12 pay levels and 8 cities from data/cities.json, so it never depends on
  // how many salaried postings the source has.
  const src = base.jobs.length ? base.jobs : [{ id: 'zz:0', title: 'Engineer', department: 'Engineering', team: null, employmentType: 'Full-time', seniority: 'Senior', locations: [], keywords: { responsibilities: [], fit: [], skills: [] }, sections: { responsibilities: [], fit: [] } }];
  const cities = readJson(ROOT, 'data', 'cities.json');
  const usCities = (Array.isArray(cities) ? cities : cities.cities).filter((c) => c.country === 'US').slice(0, 8);
  assert.equal(usCities.length, 8, 'US cities to place postings in');
  const place = (c) => ({ name: `${c.city}, ${c.region}`, city: c.city, region: c.region, country: 'US', remote: false, rawName: `USA, ${c.region}, ${c.city}` });
  const payOf = (n) => {
    const min = 90000 + n * 10000, max = min + 40000;
    return { min, max, mid: (min + max) / 2, currency: 'USD', interval: 'year', text: `USA - ${min.toLocaleString('en-US')}.00 - ${max.toLocaleString('en-US')}.00 USD annually`, kind: 'base', spread: +(max / min).toFixed(2), zones: 1, source: 'posting' };
  };
  const jobs = [];
  for (let i = 0; i < 600; i++) {
    const b = src[i % src.length];
    const locations = i % 4 === 3 && b.locations.length ? b.locations : [place(usCities[i % 8]), ...(i % 6 === 0 ? [place(usCities[(i + 3) % 8])] : [])];
    const loc = locations[0];
    const id = String(10000 + i);
    const title = i % 41 === 0 ? `Spécialiste ${i % 3}` : i % 37 === 0 ? `Řidič ${i}` : `${b.title} ${i % 9}`;
    const ascii = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const url = i % 23 === 0 ? `https://www.amazon.jobs/en/jobs/${id}/something-else`
      : i % 29 === 0 ? null
        : /^[\x00-\x7f]*$/.test(title) ? `https://www.amazon.jobs/en/jobs/${id}/${ascii(title)}` : `https://www.amazon.jobs/en/jobs/${id}/${encodeURIComponent(title)}`;
    const salary = b.salary && i % 4 === 3 ? { ...b.salary } : payOf(i % 12);
    if (i % 3 === 0) {
      salary.ranges = [
        { min: salary.min, max: salary.max, currency: salary.currency || 'USD', interval: 'year', label: loc.rawName || loc.name },
        { min: (salary.min || 0) + 1000, max: (salary.max || 0) + 1000, currency: 'USD', interval: 'year', label: `Other ${i % 4}` },
      ];
      if (i % 9 === 0) salary.ranges.push({ label: 'key order differs', min: 1, max: 2, currency: 'USD', interval: 'year' });
      if (i % 27 === 0) salary.ranges.push({ min: 1, max: 2, currency: 'USD', interval: 'year', label: 7 });
    }
    if (i % 5 === 0) salary.originalInterval = 'hour';
    if (i % 10 === 0) { salary.partTime = true; if (i % 20 === 0) salary.hoursPerWeek = 20; }
    if (i % 7 === 0) salary.currency = 'CAD';
    const job = { ...b, id: `zz:${id}`, company: 'zz', companyName: 'Zz', title, url, locations, salary };
    if (i % 31 === 0) job.salary = Object.fromEntries(Object.entries(salary).reverse()); // keys in another order
    if (i % 43 === 0) job.salary = null;
    if (i % 47 === 0) job.pool = true;
    if (i % 53 === 0) job.descriptionHtml = '';
    if (i % 59 === 0) job.sections = { responsibilities: ['Lead the team'], fit: [] };
    // google-grouping's fields (server/sources/google.js appends them last): on most jobs, not all.
    if (i % 5 !== 4) { job.departmentBasis = 'title'; job.brand = i % 3 ? 'Google' : 'YouTube'; }
    jobs.push(job);
  }
  return { company: { slug: 'zz', name: 'Zz' }, mode: 'snapshot', fetchedAt: '2026-10-11T00:00:00.000Z', error: null, jobs };
}

test('melon-packed-3 unpacks to exactly the 31ad25b melon-packed-2 output, key order included', async () => {
  const api = await siteApi();
  const anth = await anthropicPlain();
  const lists = [anth, amazonLike(anth)];
  for (const list of lists) {
    const v3 = rt(packList(list, api));
    assert.equal(v3.format, 'melon-packed-3');
    const got = api.unpackJobs(v3);
    const old = ref.unpackJobs(rt(ref.packList(list, 'melon-packed-2')));
    assert.deepStrictEqual(got, old, `${list.company.slug}: same jobs`);
    assert.equal(JSON.stringify(got), JSON.stringify(old), `${list.company.slug}: same key order`);
    // The new decoder still reads the old format the same way.
    assert.equal(JSON.stringify(api.unpackJobs(rt(ref.packList(list, 'melon-packed-2')))), JSON.stringify(old), 'melon-packed-2 still decodes');
    assert.ok(JSON.stringify(v3).length < JSON.stringify(rt(ref.packList(list, 'melon-packed-2'))).length, 'smaller');
  }
  // Not vacuous: the Amazon-like list uses each new encoding, and each fallback.
  const v3 = rt(packList(lists[1], api));
  const rows = v3.jobs.filter(Array.isArray);
  assert.ok(rows.length > 300 && rows.length < 600, `${rows.length} row arrays, some objects`);
  assert.equal(v3.shared.urlTemplate, 'https://www.amazon.jobs/en/jobs/{id}/{slug}');
  const urlAt = v3.shared.rowKeys.indexOf('url');
  const urls = v3.jobs.map((r) => (Array.isArray(r) ? r[urlAt] : r.url));
  assert.ok(urls.filter((u) => u === 0).length > 400, 'templated urls');
  assert.ok(urls.some((u) => typeof u === 'string'), 'urls kept as written where the template does not give them');
  assert.deepEqual(v3.shared.rangeKeys, ['min', 'max', 'currency', 'interval', 'label']);
  const salAt = v3.shared.rowKeys.indexOf('salary');
  const sals = v3.jobs.map((r) => (Array.isArray(r) ? r[salAt] : r.salary)).filter(Boolean);
  const extras = sals.filter((s) => Array.isArray(s) && s.length === v3.shared.salaryKeys.length + 1);
  assert.ok(extras.length > 100, 'salary tuples with extras');
  assert.ok(extras.some((s) => s.at(-1).ranges.some(Array.isArray)) && extras.some((s) => s.at(-1).ranges && s.at(-1).ranges.some((r) => !Array.isArray(r))), 'range tuples and kept range objects');
  assert.ok(sals.some((s) => !Array.isArray(s)), 'a salary in another key order stays an object');
});

test('the built site writes melon-packed-3 lists that unpack like melon-packed-2', async () => {
  const api = await siteApi();
  const raw = readJson(DIST, 'api', 'jobs', 'anthropic.json');
  assert.equal(raw.format, 'melon-packed-3');
  const plain = await anthropicPlain();
  assert.equal(JSON.stringify(api.unpackJobs(raw)), JSON.stringify(ref.unpackJobs(rt(ref.packList(plain, 'melon-packed-2')))));
});

test('getJobs on a melon-packed-3 Amazon-like list (Juice in time slices) equals unpack -> vetSalaries -> attachJuiceAll', async () => {
  const api0 = await siteApi();
  const list = rt(packList(amazonLike(await anthropicPlain()), api0));
  const companies = [...readJson(DIST, 'api', 'companies.json'), { slug: 'zz', name: 'Zz', source: 'amazon', board: 'zz', color: '#ff9900', live: false }];
  const api = await siteApi({ 'api/companies.json': companies, 'api/jobs/zz.json': list });
  const { vetSalaries } = await import(pathToFileURL(path.join(DIST, 'lib', 'vet.js')).href);
  const juice = await import(pathToFileURL(path.join(DIST, 'lib', 'juice.js')).href);
  const expected = vetSalaries(api.unpackJobs(rt(list)));
  juice.attachJuiceAll(expected, readJson(DIST, 'api', 'cities.json'));
  const res = await api.getJobs('zz');
  assert.deepStrictEqual(res.jobs, expected);
  assert.equal(JSON.stringify(res.jobs), JSON.stringify(expected), 'same key order');
  // Not vacuous: scored jobs and a "no Juice" reason.
  assert.ok(res.jobs.filter((j) => j.juice).length > 50, 'scored');
  assert.ok(res.jobs.some((j) => j.juiceMissing && j.juiceMissing.code === 'part-time-hours'));
  // And Anthropic, the real list.
  const real = vetSalaries(api.unpackJobs(readJson(DIST, 'api', 'jobs', 'anthropic.json')));
  juice.attachJuiceAll(real, readJson(DIST, 'api', 'cities.json'));
  assert.equal(JSON.stringify((await api.getJobs('anthropic')).jobs), JSON.stringify(real));
});

test('external-links and betaLeaks read melon-packed-3 urls', async () => {
  const api = await siteApi();
  const { jobUrls } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'external-links.js')).href);
  const { betaLeaks } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build-static.js')).href);
  const plain = amazonLike(await anthropicPlain());
  const v3 = rt(packList(plain, api));
  assert.deepEqual(jobUrls(v3), plain.jobs.map((j) => j.url).filter(Boolean));
  const d = path.join(TMP, 'leak');
  fs.mkdirSync(path.join(d, 'api', 'jobs'), { recursive: true });
  fs.writeFileSync(path.join(d, 'api', 'jobs', 'zz.json'), JSON.stringify(v3));
  assert.ok(betaLeaks(d, ['other']).some((x) => /posting URL on a beta host \(https:\/\/www\.amazon\.jobs\//.test(x)), 'a templated Amazon url is found');
});

test('the 1.5 MB list budget is still measured in melon-packed-2 bytes: the same lists move their sections out', async () => {
  const api = await siteApi();
  const { splitPayload } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build-static.js')).href);
  const base = (await anthropicPlain()).jobs;
  const make = (n) => ({
    company: { slug: 'zz' }, mode: 'snapshot',
    jobs: Array.from({ length: n }, (_, i) => ({ ...base[i % base.length], id: `zz:${i}`, company: 'zz', companyName: 'Zz', url: `https://x.example/jobs/${i}`, descriptionHtml: '<p>x</p>', sections: { responsibilities: [`Do thing ${i % 50}`, 'Lead the team'], fit: ['Five years'] } })),
  });
  const bytes = (p, v3) => JSON.stringify(packList({ ...p, jobs: p.jobs.map(({ descriptionHtml, ...r }) => r) }, api, { v3 })).length;
  let n = 500;
  while (bytes(make(n), false) <= 1_500_000) n += 250;
  const payload = make(n);
  assert.ok(bytes(payload, true) < 1_500_000, 'precondition: melon-packed-3 alone would fit with its sections');
  const out = splitPayload(payload, api);
  assert.equal(out.sectionsMoved, true, 'sections move out, as melon-packed-2 decided');
  assert.ok(api.unpackJobs(rt(out.list)).every((j) => !j.sections.responsibilities.length));
});


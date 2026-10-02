// API-level e2e checks against the real running server.
import { assert, assertEq } from './harness.js';

const SENIORITY = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+'];
const MODES = ['live', 'cache', 'snapshot', 'demo'];

const isStr = (v) => typeof v === 'string';
const isStrOrNull = (v) => v === null || typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);

/** Returns a list of problems with a Job object (empty when it conforms to CONTRACT.md). */
export function validateJob(j, slug) {
  const p = [];
  const f = (cond, msg) => { if (!cond) p.push(msg); };
  f(j && typeof j === 'object', 'job is not an object');
  if (!j || typeof j !== 'object') return p;
  f(isStr(j.id) && j.id.startsWith(`${slug}:`), `id ${JSON.stringify(j.id)} should start with "${slug}:"`);
  f(j.company === slug, `company ${JSON.stringify(j.company)} !== ${slug}`);
  f(isStr(j.companyName) && j.companyName.length > 0, 'companyName missing');
  f(isStr(j.title) && j.title.length > 0, 'title missing');
  f(isStrOrNull(j.department), 'department not string|null');
  f(isStrOrNull(j.team), 'team not string|null');
  f(isStrOrNull(j.employmentType), 'employmentType not string|null');
  f(SENIORITY.includes(j.seniority), `seniority ${JSON.stringify(j.seniority)} not in enum`);
  f(Array.isArray(j.locations), 'locations not array');
  for (const l of j.locations || []) {
    f(l && isStr(l.name), 'location.name missing');
    f(typeof l.remote === 'boolean', `location.remote not boolean (${l && l.name})`);
    f(isNumOrNull(l.lat) && isNumOrNull(l.lng), `location lat/lng not number|null (${l && l.name})`);
    if (isNum(l.lat)) f(l.lat >= -90 && l.lat <= 90 && l.lng >= -180 && l.lng <= 180, `lat/lng out of range (${l.name})`);
    f(l.country === undefined || isStrOrNull(l.country), 'location.country not string|null');
  }
  f(typeof j.remote === 'boolean', 'remote not boolean');
  if (j.salary !== null) {
    const s = j.salary;
    f(s && typeof s === 'object', 'salary not object|null');
    if (s) {
      f(isNum(s.min) && isNum(s.max) && isNum(s.mid), 'salary min/max/mid not numbers');
      f(s.min <= s.max, `salary min ${s.min} > max ${s.max}`);
      f(Math.abs(s.mid - (s.min + s.max) / 2) <= 1, `salary mid ${s.mid} != avg(min,max)`);
      f(isStr(s.currency), 'salary.currency missing');
      f(s.interval === 'year', `salary.interval ${JSON.stringify(s.interval)} (annualized expected "year")`);
      f(s.min >= 10000 && s.max <= 5_000_000, `salary range implausible ${s.min}-${s.max}`);
    }
  }
  f(isStr(j.url) && /^https?:\/\//.test(j.url), 'url not http(s)');
  f(isStrOrNull(j.updatedAt), 'updatedAt not string|null');
  // Lists are lazy (meta.lazy): descriptionHtml comes from /api/job, so it is
  // absent on list jobs; when present it must be a string.
  f(j.descriptionHtml === undefined || isStr(j.descriptionHtml), 'descriptionHtml present but not a string');
  f(j.sections && isStrArr(j.sections.responsibilities) && isStrArr(j.sections.fit), 'sections shape wrong');
  f(j.keywords && isStrArr(j.keywords.responsibilities) && isStrArr(j.keywords.fit) && isStrArr(j.keywords.skills), 'keywords shape wrong');
  if (j.keywords && isStrArr(j.keywords.skills)) {
    f(new Set(j.keywords.skills).size === j.keywords.skills.length, 'keywords.skills not deduped');
  }
  return p;
}

async function getJson(baseUrl, p) {
  const r = await fetch(baseUrl + p);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${p}: non-JSON response (${r.status}): ${text.slice(0, 200)}`); }
  return { status: r.status, body, headers: r.headers };
}

export function registerApiTests(suite) {
  suite.test('API: /api/companies lists anthropic, anduril, openai', async ({ baseUrl }) => {
    const { status, body } = await getJson(baseUrl, '/api/companies');
    assertEq(status, 200, 'status');
    assert(Array.isArray(body), 'body is not an array');
    const slugs = body.map((c) => c.slug);
    for (const s of ['anthropic', 'anduril', 'openai']) assert(slugs.includes(s), `missing ${s}`);
    for (const c of body) {
      for (const k of ['slug', 'name', 'source', 'board', 'color']) assert(isStr(c[k]), `company ${c.slug} missing ${k}`);
    }
    const oa = body.find((c) => c.slug === 'openai');
    assertEq(oa.source, 'ashby', 'openai source');
    assertEq(body.find((c) => c.slug === 'anduril').board, 'andurilindustries', 'anduril board');
  });

  for (const slug of ['anthropic', 'anduril', 'openai']) {
    suite.test(`API: /api/jobs?company=${slug} returns valid Job[]`, async (ctx) => {
      const { status, body } = await getJson(ctx.baseUrl, `/api/jobs?company=${slug}`);
      assertEq(status, 200, 'status');
      assert(MODES.includes(body.mode), `mode ${JSON.stringify(body.mode)} not in ${MODES}`);
      assert(body.company && body.company.slug === slug, 'company.slug mismatch');
      assert(isStrOrNull(body.error), 'error not string|null');
      assert(body.fetchedAt !== undefined, 'fetchedAt missing');
      assert(Array.isArray(body.jobs) && body.jobs.length > 0, 'jobs empty');
      if (body.mode === 'demo') assert(body.jobs.length >= 40, `demo has only ${body.jobs.length} jobs (contract: ~60-150)`);
      const problems = [];
      const ids = new Set();
      for (const j of body.jobs) {
        for (const pr of validateJob(j, slug)) problems.push(`${j.id}: ${pr}`);
        if (ids.has(j.id)) problems.push(`duplicate id ${j.id}`);
        ids.add(j.id);
      }
      const uniq = [...new Set(problems.map((x) => x.replace(/^[^:]+:[^:]+: /, '')))];
      assert(problems.length === 0, `${problems.length} shape problems, e.g.:\n${uniq.slice(0, 8).join('\n')}\nfirst: ${problems[0]}`);
      assert(body.meta && body.meta.lazy && body.meta.lazy.descriptionHtml === true, 'meta.lazy.descriptionHtml !== true');
      assert(body.jobs.every((j) => j.descriptionHtml === undefined), 'list jobs still carry descriptionHtml');
      // /api/job returns the lazily loaded detail for list jobs.
      const sample = [body.jobs[0], body.jobs[Math.floor(body.jobs.length / 2)], body.jobs[body.jobs.length - 1]];
      let nonEmpty = 0;
      for (const j of sample) {
        const d = await getJson(ctx.baseUrl, `/api/job?id=${encodeURIComponent(j.id)}`);
        assertEq(d.status, 200, `/api/job?id=${j.id} status`);
        assertEq(d.body.id, j.id, '/api/job id echo');
        assert(isStr(d.body.descriptionHtml), `/api/job ${j.id}: descriptionHtml not string`);
        if (d.body.descriptionHtml.length) nonEmpty++;
        assert(d.body.sections && isStrArr(d.body.sections.responsibilities) && isStrArr(d.body.sections.fit), `/api/job ${j.id}: sections shape wrong`);
      }
      assert(nonEmpty > 0, '/api/job returned no description for any sampled job');
      const withSalary = body.jobs.filter((j) => j.salary).length;
      const withSkills = body.jobs.filter((j) => j.keywords.skills.length).length;
      const geo = body.jobs.filter((j) => j.locations.some((l) => isNum(l.lat))).length;
      assert(withSalary > body.jobs.length * 0.3, `only ${withSalary}/${body.jobs.length} jobs have salary`);
      assert(withSkills > body.jobs.length * 0.3, `only ${withSkills}/${body.jobs.length} jobs have skills`);
      assert(geo > body.jobs.length * 0.3, `only ${geo}/${body.jobs.length} jobs geocoded`);
      ctx.data[slug] = body;
    });
  }

  suite.test('API: demo data is deterministic across requests', async (ctx) => {
    const a = ctx.data.anthropic;
    assert(a, 'no anthropic data (earlier test failed)');
    if (a.mode !== 'demo') return;
    const { body } = await getJson(ctx.baseUrl, '/api/jobs?company=anthropic');
    assertEq(JSON.stringify(body.jobs.map((j) => j.id)), JSON.stringify(a.jobs.map((j) => j.id)), 'ids differ between calls');
  });

  suite.test('API: custom board ?source=greenhouse&board=foo falls back (demo)', async ({ baseUrl }) => {
    const { status, body } = await getJson(baseUrl, '/api/jobs?source=greenhouse&board=foo&name=Foo%20Corp');
    assertEq(status, 200, 'status');
    assert(MODES.includes(body.mode), `mode ${body.mode}`);
    assert(body.company && body.company.source === 'greenhouse' && body.company.board === 'foo', 'company echo');
    assertEq(body.company.name, 'Foo Corp', 'custom name');
    assert(Array.isArray(body.jobs) && body.jobs.length > 0, 'no jobs for custom board');
    const slug = body.company.slug;
    const problems = body.jobs.flatMap((j) => validateJob(j, slug));
    assert(problems.length === 0, `shape problems: ${problems.slice(0, 5).join('; ')}`);
  });

  suite.test('API: invalid input returns 4xx JSON errors', async ({ baseUrl }) => {
    const a = await getJson(baseUrl, '/api/jobs?company=nope');
    assertEq(a.status, 404, 'unknown company status');
    const b = await getJson(baseUrl, '/api/jobs?source=bogus&board=x');
    assertEq(b.status, 400, 'bad source status');
    const c = await getJson(baseUrl, '/api/jobs?source=greenhouse&board=..%2F..%2Fetc');
    assertEq(c.status, 400, 'path-ish board status');
    const d = await getJson(baseUrl, '/api/jobs');
    assertEq(d.status, 400, 'missing params status');
    const e = await getJson(baseUrl, '/api/job');
    assertEq(e.status, 400, '/api/job without id status');
    const g = await getJson(baseUrl, '/api/job?id=anthropic%3Adefinitely-not-a-job');
    assertEq(g.status, 404, '/api/job unknown id status');
  });

  suite.test('Static: /, /vendor/leaflet/leaflet.js served; no path traversal', async ({ baseUrl }) => {
    const r = await fetch(baseUrl + '/');
    assertEq(r.status, 200, '/ status');
    assert((r.headers.get('content-type') || '').includes('text/html'), '/ content-type');
    const l = await fetch(baseUrl + '/vendor/leaflet/leaflet.js');
    assertEq(l.status, 200, 'leaflet.js status');
    const lc = await fetch(baseUrl + '/vendor/leaflet/leaflet.css');
    assertEq(lc.status, 200, 'leaflet.css status');
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/vendor/leaflet/..%2f..%2f..%2fpackage.json']) {
      const t = await fetch(baseUrl + p);
      const body = await t.text();
      assert(!body.includes('"melon-seek"'), `path traversal leaked package.json via ${p}`);
    }
    const nf = await fetch(baseUrl + '/definitely-missing.js');
    assertEq(nf.status, 404, 'missing static status');
  });
}

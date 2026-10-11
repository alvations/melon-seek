// melon-packed-2 as of 31ad25b, VERBATIM (scripts/build-static.js#packList and public/api.js#unpackJobs
// before docs/process/perf-mobile-beta-2.md): the reference that test/perf-mobile-beta-2.test.js
// compares melon-packed-3 against. Do not edit; it is the old output by definition.
const hasSections = (s) => !!s && ((s.responsibilities || []).length > 0 || (s.fit || []).length > 0);
function commonPrefix(strs) {
  if (!strs.length) return '';
  let p = strs[0];
  for (const s of strs) { while (!s.startsWith(p)) p = p.slice(0, -1); if (!p) break; }
  return p;
}

// melon-packed-2: top-level fields that EVERY job carries are stored once per
// list as columns (the key is written once, not per job); all-boolean columns
// as 0/1; low-cardinality ones as dict indexes (firstSeenAt has one value per
// ledger run). String enums inside salary are dict indexes too. A field missing
// on any job stays inline, so key presence round-trips exactly.
// Also lossless, only where exactly reversible (else the value stays as is):
// ISO timestamps that equal their own toISOString() become epoch ms ('ts');
// salary objects with the list's common key set become value tuples in
// `shared.salaryKeys` order; keywords become [responsibilities, fit, skills].
const COLUMN_KEYS = ['postedAt', 'firstSeenAt', 'ageDays', 'ageIsMinimum', 'freshness', 'repost', 'extras', 'reqId', 'remote', 'updatedAt', 'seniorityBasis'];
// seniorityBasis (norm-7, fix-beta-pay): 'title' | 'pay' | 'default' on every job, one dict index each.
const DICT_COLUMNS = new Set(['firstSeenAt', 'freshness', 'repost', 'extras', 'seniorityBasis']);
const TS_COLUMNS = new Set(['postedAt', 'updatedAt']);
const SALARY_REFS = ['currency', 'interval', 'kind', 'source'];
const KEYWORD_KEYS = ['responsibilities', 'fit', 'skills'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sameKeys = (o, keys) => { const k = Object.keys(o); return k.length === keys.length && keys.every((x) => has(o, x)); };
const exactIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;

/** Pack a plain list payload as PACKED_FORMAT (decoded by public/api.js#unpackJobs). */
function packList(list, PACKED_FORMAT) {
  const index = new Map();
  const dict = [];
  const ref = (v) => {
    if (v == null) return null;
    const k = JSON.stringify(v);
    if (!index.has(k)) { index.set(k, dict.length); dict.push(v); }
    return index.get(k);
  };
  const jobs = list.jobs;
  const first = jobs[0] || {};
  const idPrefix = jobs.length && jobs.every((j) => String(j.id).startsWith(`${j.company}:`) && j.company === first.company) ? `${first.company}:` : '';
  const urls = jobs.map((j) => j.url).filter((u) => typeof u === 'string');
  const urlPrefix = urls.length === jobs.length ? commonPrefix(urls) : '';
  const sameCompany = jobs.every((j) => j.company === first.company && j.companyName === first.companyName);
  if (!sameCompany) throw new Error(`${list.company && list.company.slug}: jobs from more than one company, can't pack`);
  const columns = [];
  for (const key of COLUMN_KEYS) {
    if (!jobs.length || !jobs.every((j) => has(j, key))) continue;
    const vals = jobs.map((j) => j[key]);
    const enc = vals.every((v) => typeof v === 'boolean') ? 'bool' : DICT_COLUMNS.has(key) ? 'dict' : TS_COLUMNS.has(key) ? 'ts' : 'raw';
    const values = enc === 'bool' ? vals.map((v) => (v ? 1 : 0))
      : enc === 'dict' ? vals.map(ref)
      : enc === 'ts' ? vals.map((v) => (exactIso(v) ? Date.parse(v) : v))
      : vals;
    columns.push({ key, enc, values });
  }
  const firstSalary = jobs.find((j) => j.salary && typeof j.salary === 'object' && !Array.isArray(j.salary));
  const salaryKeys = firstSalary ? Object.keys(firstSalary.salary) : [];
  const packed = jobs.map((j) => {
    const { company, companyName, sections, ...r } = j;
    for (const c of columns) delete r[c.key];
    if (r.salary && typeof r.salary === 'object') {
      const sal = { ...r.salary };
      for (const k of SALARY_REFS) if (typeof sal[k] === 'string') sal[k] = ref(sal[k]);
      r.salary = salaryKeys.length && sameKeys(sal, salaryKeys) ? salaryKeys.map((k) => sal[k]) : sal;
    }
    r.id = String(j.id).slice(idPrefix.length);
    r.url = j.url == null ? null : j.url.slice(urlPrefix.length);
    for (const k of ['department', 'team', 'employmentType', 'seniority']) r[k] = ref(j[k]);
    r.locations = (j.locations || []).map(ref);
    const kw = j.keywords || {};
    const kwRefs = { responsibilities: (kw.responsibilities || []).map(ref), fit: (kw.fit || []).map(ref), skills: (kw.skills || []).map(ref) };
    r.keywords = j.keywords && sameKeys(j.keywords, KEYWORD_KEYS) && KEYWORD_KEYS.every((k) => Array.isArray(j.keywords[k])) ? KEYWORD_KEYS.map((k) => kwRefs[k]) : kwRefs;
    if (hasSections(sections)) r.sections = sections;
    return r;
  });
  return { ...list, format: PACKED_FORMAT, shared: { company: first.company, companyName: first.companyName, idPrefix, urlPrefix, salaryKeys }, dict, columns, jobs: packed };
}


export const PACKED_FORMAT = 'melon-packed-2';
const PACKED_FORMATS = new Set(['melon-packed-1', PACKED_FORMAT]);
// (SALARY_REFS: the same list as above, declared once here)
export function unpackJobs(body) {
  if (!body || !PACKED_FORMATS.has(body.format)) return body && Array.isArray(body.jobs) ? body.jobs : [];
  const { shared = {}, dict = [] } = body;
  const at = (i) => (i == null ? null : dict[i]);
  const kw = (k = {}) => (Array.isArray(k)
    ? { responsibilities: (k[0] || []).map(at), fit: (k[1] || []).map(at), skills: (k[2] || []).map(at) }
    : { responsibilities: (k.responsibilities || []).map(at), fit: (k.fit || []).map(at), skills: (k.skills || []).map(at) });
  const columns = body.format === PACKED_FORMAT && Array.isArray(body.columns) ? body.columns : [];
  const salaryKeys = Array.isArray(shared.salaryKeys) ? shared.salaryKeys : [];
  const decode = (c, v) => (c.enc === 'bool' ? (v === 1 ? true : v === 0 ? false : v)
    : c.enc === 'dict' ? at(v)
    : c.enc === 'ts' ? (typeof v === 'number' ? new Date(v).toISOString() : v)
    : v);
  return body.jobs.map((j, i) => {
    const job = { ...j };
    for (const c of columns) job[c.key] = decode(c, c.values[i]);
    if (columns.length || body.format === PACKED_FORMAT) {
      if (Array.isArray(job.salary)) job.salary = Object.fromEntries(salaryKeys.map((k, n) => [k, job.salary[n]]));
      if (job.salary && typeof job.salary === 'object') {
        const sal = { ...job.salary };
        for (const k of SALARY_REFS) if (typeof sal[k] === 'number') sal[k] = at(sal[k]);
        job.salary = sal;
      }
    }
    job.id = (shared.idPrefix || '') + j.id;
    job.company = shared.company;
    job.companyName = shared.companyName;
    job.url = j.url == null ? null : (shared.urlPrefix || '') + j.url;
    for (const k of ['department', 'team', 'employmentType', 'seniority']) job[k] = at(j[k]);
    job.locations = (j.locations || []).map(at);
    job.keywords = kw(j.keywords);
    job.sections = j.sections || { responsibilities: [], fit: [] };
    return job;
  });
}

export { packList };

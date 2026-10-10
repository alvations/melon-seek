#!/usr/bin/env node
// Probe the big-tech career sites from a GitHub-hosted runner (the build
// sandbox has no route to them). Run by .github/workflows/bigtech-probe.yml
// (workflow_dispatch only); everything worth knowing is printed to the job log,
// because artifacts cannot be downloaded from the sandbox.
//
//   node scripts/probe-bigtech.js [--mode recon|full] [--companies google,meta] [--max-jobs N] [--raw '<json>']
//   env: PROBE_MODE, PROBE_COMPANIES, PROBE_MAX_JOBS, PROBE_RAW (same meaning)
//
// recon: robots.txt verdicts for every path the adapters use, then one or two
//        requests per endpoint: status, bytes, CORS/cookie/server headers, the
//        JSON shape and the pay sentences of one posting.
// full:  runs each adapter (server/sources/*) exactly as `snapshot.js --channel
//        beta` would, up to --max-jobs postings (0 = all), then normalizes and
//        vets: job count, pages, bytes, pay coverage, 10 sample pay texts with
//        their parsed result, vet flags, and 2-3 trimmed raw jobs as JSON.
// raw:   extra requests, JSON array of { url, method?, body?, grep? } (hosts
//        limited to the career sites below), for debugging response shapes.
//
// All requests go through server/sources/polite.js: honest User-Agent, about
// 1 request/s per host, backoff on 429/5xx, no retries on 403.
import { AsyncLocalStorage } from 'node:async_hooks';
import { politeRequest, robotsRules, robotsAllows, newStats, BOT_USER_AGENT } from '../server/sources/polite.js';
import { htmlToText } from '../server/sources/util.js';

const args = process.argv.slice(2);
const opt = (name, env, dflt) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] != null) return args[i + 1];
  return process.env[env] != null && process.env[env] !== '' ? process.env[env] : dflt;
};
const MODE = opt('mode', 'PROBE_MODE', 'recon');
const ONLY = opt('companies', 'PROBE_COMPANIES', '').split(/[\s,]+/).filter(Boolean);
const MAX_JOBS = Number(opt('max-jobs', 'PROBE_MAX_JOBS', '0')) || 0;
const RAW = opt('raw', 'PROBE_RAW', '');

const SLUGS = ['amazon', 'netflix', 'microsoft', 'nvidia', 'apple', 'google', 'meta', 'tesla'];
const HOSTS = new Set([
  'www.amazon.jobs', 'amazon.jobs', 'explore.jobs.netflix.net', 'jobs.netflix.com', 'apply.careers.microsoft.com', 'careers.microsoft.com',
  'jobs.careers.microsoft.com', 'nvidia.wd5.myworkdayjobs.com', 'jobs.nvidia.com', 'www.nvidia.com', 'jobs.apple.com', 'www.apple.com',
  'www.google.com', 'careers.google.com', 'www.metacareers.com', 'metacareers.com', 'www.tesla.com',
]);

/* ---------------------------------------------------------------- output */

// Companies run concurrently (different hosts); each run writes to its own
// buffer (AsyncLocalStorage), printed as one block when it finishes.
const als = new AsyncLocalStorage();
const globalOut = [];
const buf = () => als.getStore() || globalOut;
const say = (s = '') => buf().push(String(s));
function flush(title, lines = buf()) {
  console.log(`\n${'='.repeat(100)}\n${title}\n${'='.repeat(100)}\n${lines.join('\n')}`);
  lines.length = 0;
}
async function section(title, fn) {
  const lines = [];
  await als.run(lines, async () => {
    try { await fn(); } catch (err) { say(`probe error: ${err.stack || err.message}`); }
  });
  flush(title, lines);
}
const trim = (s, n = 160) => { const t = String(s).replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n)}…(${t.length})` : t; };

/** Compact JSON shape: keys with types and short values, arrays as [n × shape of first]. */
function shape(v, depth = 0, max = 3) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return depth >= max ? `[${v.length}]` : `[${v.length}× ${v.length ? shape(v[0], depth + 1, max) : '-'}]`;
  if (typeof v === 'object') {
    if (depth >= max) return `{${Object.keys(v).length} keys}`;
    return `{ ${Object.entries(v).slice(0, 60).map(([k, x]) => `${k}: ${shape(x, depth + 1, max)}`).join(', ')} }`;
  }
  if (typeof v === 'string') return JSON.stringify(trim(v, 70));
  return String(v);
}

const PAY_SENT_RE = /[^.\n]*(?:\$|USD|CAD|GBP|EUR|€|£|₹|salary|base pay|pay range|compensation|market range)[^.\n]*\d[^.\n]*(?:\.[^.\n]*){0,1}/gi;
/** Sentences that look like pay statements (money + pay words). */
function paySentences(text, n = 4) {
  const t = String(text || '');
  const seen = new Set();
  const res = [];
  for (const m of t.matchAll(PAY_SENT_RE)) {
    const s = m[0].replace(/\s+/g, ' ').trim();
    if (!/\d{2}/.test(s) || !/(salary|pay|compensation|range|wage|hour)/i.test(s) || seen.has(s)) continue;
    seen.add(s);
    res.push(trim(s, 400));
    if (res.length >= n) break;
  }
  return res;
}

function headerLine(r) {
  const h = r.headers;
  const cookies = typeof h.getSetCookie === 'function' ? h.getSetCookie().map((c) => c.split('=')[0]) : [];
  const bits = [
    `status ${r.status}`, `${r.bytes} bytes`, `type ${h.get('content-type') || '-'}`,
    `server ${h.get('server') || '-'}`, `ACAO ${h.get('access-control-allow-origin') || 'none'}`,
  ];
  if (cookies.length) bits.push(`set-cookie ${cookies.join(',')}`);
  if (h.get('location')) bits.push(`location ${h.get('location')}`);
  if (h.get('retry-after')) bits.push(`retry-after ${h.get('retry-after')}`);
  if (h.get('x-ratelimit-remaining')) bits.push(`ratelimit-remaining ${h.get('x-ratelimit-remaining')}`);
  return bits.join(' | ');
}

async function req(url, o = {}) {
  const t0 = Date.now();
  try {
    const r = await politeRequest(url, { throwOnHttpError: false, retries: 2, label: 'probe', timeoutMs: 45000, maxBytes: 60 * 1024 * 1024, ...o });
    say(`${o.method || 'GET'} ${url}${o.body ? ` body=${trim(typeof o.body === 'string' ? o.body : JSON.stringify(o.body), 300)}` : ''}`);
    say(`  -> ${headerLine(r)} | ${Date.now() - t0} ms`);
    if (!r.ok) say(`  body: ${trim(r.text, 300)}`);
    return r;
  } catch (err) {
    say(`${o.method || 'GET'} ${url}\n  -> ERROR ${err.message}`);
    return null;
  }
}

function asJson(r) {
  if (!r || !r.text) return null;
  try { return JSON.parse(r.text.replace(/^\)\]\}'\s*/, '')); } catch { return null; }
}

/* ---------------------------------------------------------------- robots */

const ROBOT_PATHS = {
  amazon: ['https://www.amazon.jobs', ['/en/search.json?offset=0&result_limit=100&sort=recent', '/en/jobs/3012345/software-dev-engineer', '/en/search?offset=0']],
  netflix: ['https://explore.jobs.netflix.net', ['/api/apply/v2/jobs?domain=netflix.com&start=0&num=10', '/api/apply/v2/jobs/790313362345?domain=netflix.com', '/careers/job/790313362345', '/api/pcsx/search?domain=netflix.com&start=0']],
  microsoft: ['https://apply.careers.microsoft.com', ['/api/pcsx/search?domain=microsoft.com&start=0', '/api/pcsx/position_details?position_id=1970393556625300&domain=microsoft.com&hl=en', '/careers/job/1970393556625300']],
  nvidia: ['https://nvidia.wd5.myworkdayjobs.com', ['/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs', '/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineer_JR2000000', '/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineer_JR2000000', '/NVIDIAExternalCareerSite/siteMap.xml']],
  apple: ['https://jobs.apple.com', ['/api/v1/search', '/api/v1/jobDetails/200600000', '/api/v1/CSRFToken', '/en-us/details/200600000/software-engineer', '/en-us/search?page=2']],
  google: ['https://www.google.com', ['/about/careers/applications/jobs/results/?page=2', '/about/careers/applications/jobs/results/123456789-software-engineer', '/about/careers/applications/_/HiringCportalFrontendUi/data/batchexecute?rpcids=r06xKb']],
  meta: ['https://www.metacareers.com', ['/jobs', '/jobs/', '/graphql', '/api/graphql/', '/jobs/1234567890/', '/profile/job_details/1234567890/', '/jobsearch/sitemap.xml']],
  tesla: ['https://www.tesla.com', ['/cua-api/apps/careers/state', '/careers/search/job/123456', '/careers/search/']],
};
const EXTRA_ROBOTS = { nvidia: ['https://jobs.nvidia.com', ['/api/pcsx/search?domain=nvidia.com&start=0', '/careers/job/893394392298']] };

async function robots(slug) {
  for (const [origin, paths] of [ROBOT_PATHS[slug], EXTRA_ROBOTS[slug]].filter(Boolean)) {
    const r = await req(`${origin}/robots.txt`, { accept: 'text/plain' });
    if (!r) continue;
    if (r.status >= 400) { say(`  robots.txt ${r.status}: everything allowed (RFC 9309 §2.3.1.3)`); continue; }
    const rules = robotsRules(r.text);
    const lines = r.text.split(/\r?\n/);
    const agents = lines.filter((l) => /^\s*user-agent\s*:/i.test(l)).map((l) => l.split(':')[1].trim());
    const sitemaps = lines.filter((l) => /^\s*sitemap\s*:/i.test(l)).map((l) => l.replace(/^\s*sitemap\s*:\s*/i, ''));
    say(`  robots.txt: ${lines.length} lines, user-agents [${[...new Set(agents)].slice(0, 15).join(', ')}${agents.length > 15 ? ', …' : ''}], ${rules.length} rules apply to us (melon-seek or *)`);
    if (sitemaps.length) say(`  sitemaps: ${sitemaps.slice(0, 6).join(' , ')}`);
    const relevant = rules.filter((x) => /career|job|api|search|graphql|wday|cxs|cua|details|position|apply|profile|\/$|^\/\*?$/.test(x.path) || x.path === '/');
    say(`  rules (relevant, up to 40): ${relevant.slice(0, 40).map((x) => `${x.allow ? 'A' : 'D'}:${x.path}`).join('  ') || '(none)'}`);
    for (const p of paths) {
      const v = robotsAllows(rules, p);
      say(`  ${v.allowed ? 'ALLOWED   ' : 'DISALLOWED'} ${p}${v.rule ? `   [${v.rule}]` : ''}`);
    }
  }
}

/* ----------------------------------------------------------------- recon */

const RECON = {
  async amazon() {
    const base = 'https://www.amazon.jobs/en/search.json';
    let r = await req(`${base}?offset=0&result_limit=100&sort=recent`);
    let j = asJson(r);
    if (j) {
      say(`  top-level: ${shape(j, 0, 1)}`);
      say(`  hits=${j.hits} jobs.length=${(j.jobs || []).length}`);
      const job = (j.jobs || [])[0];
      if (job) {
        say(`  job[0]: ${shape(job, 0, 2)}`);
        say(`  pay sentences: ${JSON.stringify(paySentences(htmlToText(`${job.description || ''}\n${job.basic_qualifications || ''}\n${job.preferred_qualifications || ''}`)))}`);
      }
      const withPay = (j.jobs || []).filter((x) => /base pay|pay range|salary/i.test(x.preferred_qualifications || '')).length;
      say(`  first page: ${withPay}/${(j.jobs || []).length} have a pay sentence in preferred_qualifications`);
      const countries = {};
      for (const x of j.jobs || []) countries[x.country_code] = (countries[x.country_code] || 0) + 1;
      say(`  countries on page 1: ${JSON.stringify(countries)}`);
    }
    r = await req(`${base}?offset=9990&result_limit=100&sort=recent`);
    j = asJson(r);
    if (j) say(`  offset 9990: hits=${j.hits} jobs.length=${(j.jobs || []).length}`);
    r = await req(`${base}?offset=0&result_limit=1&sort=recent&normalized_country_code%5B%5D=USA`);
    j = asJson(r);
    if (j) say(`  USA only: hits=${j.hits}`);
  },

  async netflix() {
    const host = 'https://explore.jobs.netflix.net';
    let r = await req(`${host}/api/apply/v2/jobs?domain=netflix.com&start=0&num=10&sort_by=relevance`);
    const j = asJson(r);
    if (j) {
      say(`  top-level: ${shape(j, 0, 1)}`);
      say(`  count=${j.count} positions=${(j.positions || []).length}`);
      const p = (j.positions || [])[0];
      if (p) {
        say(`  position[0]: ${shape(p, 0, 2)}`);
        r = await req(`${host}/api/apply/v2/jobs/${p.id}?domain=netflix.com`);
        const d = asJson(r);
        if (d) {
          say(`  detail: ${shape(d, 0, 1)}`);
          say(`  pay sentences: ${JSON.stringify(paySentences(htmlToText(d.job_description || '')))}`);
        }
      }
    }
    r = await req(`${host}/api/pcsx/search?domain=netflix.com&query=&location=&start=0`);
    const pj = asJson(r);
    if (pj) say(`  pcsx: ${shape(pj, 0, 2)}`);
  },

  async microsoft() {
    const host = 'https://apply.careers.microsoft.com';
    let r = await req(`${host}/api/pcsx/search?domain=microsoft.com&query=&location=&start=0&sort_by=timestamp`);
    const j = asJson(r);
    if (j) {
      say(`  top-level: ${shape(j, 0, 1)}`);
      const data = j.data || {};
      say(`  data: ${shape(data, 0, 1)}`);
      say(`  count=${data.count} positions=${(data.positions || []).length}`);
      const p = (data.positions || [])[0];
      if (p) {
        say(`  position[0]: ${shape(p, 0, 2)}`);
        r = await req(`${host}/api/pcsx/position_details?position_id=${p.id}&domain=microsoft.com&hl=en`);
        const d = asJson(r);
        if (d) {
          say(`  detail: ${shape(d, 0, 1)}`);
          say(`  detail.data: ${shape(d.data || {}, 0, 2)}`);
          say(`  pay sentences: ${JSON.stringify(paySentences(htmlToText((d.data || {}).jobDescription || '')))}`);
        }
      }
    }
    r = await req(`${host}/api/pcsx/search?domain=microsoft.com&query=&location=&start=10&sort_by=timestamp`);
    const j2 = asJson(r);
    if (j2) say(`  page 2: positions=${((j2.data || {}).positions || []).length}`);
  },

  async nvidia() {
    const base = 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite';
    let r = await req(`${base}/jobs`, { method: 'POST', body: { appliedFacets: {}, limit: 20, offset: 0, searchText: '' } });
    const j = asJson(r);
    if (j) {
      say(`  top-level: ${shape(j, 0, 1)}`);
      say(`  total=${j.total} postings=${(j.jobPostings || []).length}`);
      for (const f of j.facets || []) {
        const vals = (f.values || []).flatMap((v) => (v.values ? v.values : [v]));
        say(`  facet ${f.facetParameter} (${f.descriptor}): ${vals.length} values; top ${vals.slice().sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 6).map((v) => `${v.descriptor}=${v.count} [${v.id}]`).join(', ')}`);
      }
      const p = (j.jobPostings || [])[0];
      if (p) {
        say(`  posting[0]: ${shape(p, 0, 2)}`);
        r = await req(`${base}${p.externalPath}`);
        const d = asJson(r);
        if (d) {
          say(`  detail: ${shape(d, 0, 1)}`);
          say(`  jobPostingInfo: ${shape(d.jobPostingInfo || {}, 0, 2)}`);
          say(`  pay sentences: ${JSON.stringify(paySentences(htmlToText((d.jobPostingInfo || {}).jobDescription || '')))}`);
        }
      }
    }
    r = await req(`${base}/jobs`, { method: 'POST', body: { appliedFacets: {}, limit: 20, offset: 1990, searchText: '' } });
    const j2 = asJson(r);
    if (j2) say(`  offset 1990: total=${j2.total} postings=${(j2.jobPostings || []).length}`);
    r = await req(`${base}/jobs`, { method: 'POST', body: { appliedFacets: {}, limit: 20, offset: 2000, searchText: '' } });
    const j3 = asJson(r);
    if (j3) say(`  offset 2000: total=${j3.total} postings=${(j3.jobPostings || []).length}`);
    r = await req('https://jobs.nvidia.com/api/pcsx/search?domain=nvidia.com&query=&location=&start=0');
    const pj = asJson(r);
    if (pj) say(`  jobs.nvidia.com pcsx: ${shape(pj, 0, 2)}`);
  },

  async apple() {
    const host = 'https://jobs.apple.com';
    const body = { query: '', filters: {}, page: 1, locale: 'en-us', sort: 'newest', format: { longDate: 'MMMM D, YYYY', mediumDate: 'MMM D, YYYY' } };
    let r = await req(`${host}/api/v1/search`, { method: 'POST', body });
    const j = asJson(r);
    if (j) {
      say(`  top-level: ${shape(j, 0, 1)}`);
      const res = j.res || j;
      say(`  totalRecords=${res.totalRecords} results=${(res.searchResults || []).length}`);
      const p = (res.searchResults || [])[0];
      if (p) {
        say(`  result[0]: ${shape(p, 0, 2)}`);
        for (const id of [p.id, p.positionId].filter(Boolean)) {
          r = await req(`${host}/api/v1/jobDetails/${encodeURIComponent(id)}?locale=en-us`);
          const d = asJson(r);
          if (d) {
            const x = d.res || d;
            say(`  detail(${id}): ${shape(x, 0, 1)}`);
            say(`  postingFooters: ${trim(JSON.stringify(x.postingFooters || null), 600)}`);
            say(`  pay sentences: ${JSON.stringify(paySentences(htmlToText([x.description, x.jobSummary, x.minimumQualifications, x.preferredQualifications, JSON.stringify(x.postingFooters || '')].join('\n'))))}`);
            break;
          }
        }
      }
    }
    r = await req(`${host}/api/v1/search`, { method: 'POST', body: { ...body, filters: { locations: ['postLocation-USA'] } } });
    const u = asJson(r);
    if (u) say(`  USA only: totalRecords=${(u.res || u).totalRecords}`);
  },

  async google() {
    const base = 'https://www.google.com/about/careers/applications/jobs/results/';
    const r = await req(`${base}?page=1`, { accept: 'text/html' });
    if (r && r.text) {
      const m = /AF_initDataCallback\(\{key: 'ds:1', hash: '\d+', data:(.*?), sideChannel: \{\}\}\);<\/script>/s.exec(r.text);
      say(`  ds:1 found: ${!!m}; AF_initDataCallback keys: ${[...r.text.matchAll(/AF_initDataCallback\(\{key: '([^']+)'/g)].map((x) => x[1]).join(',')}`);
      if (m) {
        const data = JSON.parse(m[1]);
        say(`  ds:1 shape: ${shape(data, 0, 1)}; total=${data[2]} pageSize=${data[3]} jobs=${(data[0] || []).length}`);
        const job = (data[0] || [])[0];
        if (job) {
          job.forEach((v, i) => say(`    [${i}] ${shape(v, 0, 2)}`));
          say(`  pay sentences: ${JSON.stringify(paySentences(htmlToText([job[10], job[3], job[4]].map((x) => (Array.isArray(x) ? x[1] || x[0] : x) || '').join('\n'))))}`);
        }
        const withPay = (data[0] || []).filter((x) => /salary range|base salary/i.test(JSON.stringify(x))).length;
        say(`  page 1: ${withPay}/${(data[0] || []).length} mention a salary range`);
      }
    }
  },

  async meta() {
    const r = await req('https://www.metacareers.com/jobs', { accept: 'text/html' });
    if (r && r.text) {
      const t = r.text;
      say(`  LSD token present: ${/\["LSD",\[\],\{"token":"[^"]+"/.test(t)}; doc_id mentions: ${(t.match(/doc_id/g) || []).length}; scripts: ${(t.match(/<script[^>]+src=/g) || []).length}; ld+json: ${(t.match(/application\/ld\+json/g) || []).length}`);
      say(`  relay operations named: ${[...new Set([...t.matchAll(/([A-Za-z]+Query)_candidate_portalRelayOperation|"(Careers[A-Za-z]+Query)"/g)].map((x) => x[1] || x[2]))].slice(0, 12).join(', ') || '-'}`);
      say(`  job links on page: ${(t.match(/\/jobs\/\d{6,}/g) || []).length}; first: ${(t.match(/\/(?:jobs|profile\/job_details)\/\d{6,}/) || ['-'])[0]}`);
      say(`  title: ${trim((t.match(/<title>([^<]*)<\/title>/) || [])[1] || '-', 120)}`);
    }
  },

  async tesla() {
    await req('https://www.tesla.com/cua-api/apps/careers/state');
    await req('https://www.tesla.com/careers/search/', { accept: 'text/html' });
  },
};

/* ------------------------------------------------------------------ raw */

async function rawRequests(spec) {
  let list;
  try { list = JSON.parse(spec); } catch (err) { console.log(`raw: invalid JSON (${err.message})`); return; }
  for (const x of Array.isArray(list) ? list : [list]) {
    let u;
    try { u = new URL(x.url); } catch { say(`raw: bad url ${x.url}`); continue; }
    if (u.protocol !== 'https:' || !HOSTS.has(u.host)) { say(`raw: host ${u.host} is not one of the career sites; skipped`); continue; }
    const r = await req(u.href, { method: x.method || 'GET', body: x.body, accept: x.accept || '*/*', headers: x.headers || {} });
    if (!r) continue;
    const j = asJson(r);
    if (j) say(`  shape: ${shape(j, 0, x.depth || 3)}`);
    if (x.grep) {
      const re = new RegExp(x.grep, 'g');
      let n = 0;
      for (const m of r.text.matchAll(re)) {
        const at = m.index;
        say(`  grep@${at}: ${trim(r.text.slice(Math.max(0, at - (x.before ?? 80)), at + (x.after ?? 300)), 2000)}`);
        if (++n >= (x.max || 8)) break;
      }
      if (!n) say('  grep: no match');
    } else if (!j) say(`  text: ${trim(r.text, x.chars || 1500)}`);
    if (x.show) for (const path of [].concat(x.show)) {
      const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), j);
      say(`  ${path} = ${trim(JSON.stringify(v), x.chars || 3000)}`);
    }
  }
}

/* ------------------------------------------------------------------ full */

async function full(slug) {
  const { getCompany } = await import('../server/companies.js');
  const { ADAPTERS } = await import('../server/pipeline.js');
  const { normalizeJobs } = await import('../server/normalize.js');
  const { scanCompany } = await import('./vet-salaries.js');
  const company = getCompany(slug);
  if (!company) { say(`no registry entry for ${slug}`); return; }
  const adapter = ADAPTERS[company.source];
  if (!adapter) { say(`no adapter for source ${company.source}`); return; }
  const stats = newStats();
  const t0 = Date.now();
  let raws;
  try {
    const r = await adapter(company.board, { maxJobs: MAX_JOBS || undefined, stats, keepRaw: true, log: (m) => console.log(`[${slug}] ${m}`) });
    raws = Array.isArray(r) ? r : r.jobs;
  } catch (err) {
    say(`FAILED after ${Math.round((Date.now() - t0) / 1000)} s: ${err.message}`);
    say(`requests ${stats.requests}, statuses ${JSON.stringify(stats.statuses)}, bytes ${stats.bytes}, retries ${stats.retries}`);
    for (const n of stats.notes) say(`note: ${n}`);
    return;
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  const jobs = normalizeJobs(raws, company);
  const salaried = jobs.filter((j) => j.salary);
  const quarantined = jobs.filter((j) => j.salaryFlag);
  const json = JSON.stringify({ jobs });
  say(`OK in ${secs} s: ${raws.length} raw jobs, ${jobs.length} normalized; pages ${stats.pages}, details ${stats.details} (errors ${stats.detailErrors}), requests ${stats.requests}, statuses ${JSON.stringify(stats.statuses)}, retries ${stats.retries}`);
  say(`bytes downloaded ${stats.bytes} (${(stats.bytes / 1048576).toFixed(1)} MB); normalized JSON ${json.length} bytes (${(json.length / 1048576).toFixed(1)} MB)`);
  for (const n of stats.notes) say(`note: ${n}`);
  const pct = (n) => (jobs.length ? `${((100 * n) / jobs.length).toFixed(1)}%` : '-');
  const textPay = jobs.filter((j) => j.salary || j.salaryRaw).length;
  say(`pay coverage: ${salaried.length}/${jobs.length} (${pct(salaried.length)}) plotted; ${textPay} parsed incl. ${quarantined.length} quarantined`);
  const byCountry = {};
  for (const j of jobs) { const c = (j.locations[0] && j.locations[0].country) || '?'; const e = byCountry[c] || (byCountry[c] = [0, 0]); e[0]++; if (j.salary) e[1]++; }
  say(`by first-location country (jobs/with pay): ${Object.entries(byCountry).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([c, [n, p]]) => `${c} ${n}/${p}`).join(', ')}`);
  const kinds = {};
  for (const j of salaried) { const k = `${j.salary.currency}/${j.salary.originalInterval || 'year'}/${j.salary.kind}`; kinds[k] = (kinds[k] || 0) + 1; }
  say(`salary kinds: ${JSON.stringify(kinds)}`);
  const remote = jobs.filter((j) => j.remote).length;
  const noLoc = jobs.filter((j) => !j.locations.length).length;
  const geo = jobs.filter((j) => j.locations.some((l) => l.lat != null)).length;
  const noDesc = jobs.filter((j) => !j.descriptionHtml).length;
  say(`remote ${remote}; no location ${noLoc}; geocoded ${geo}; no description ${noDesc}; postedAt ${jobs.filter((j) => j.postedAt).length}; urls ${[...new Set(jobs.map((j) => { try { return new URL(j.url).host; } catch { return 'none'; } }))].join(', ')}`);

  say('\n10 sample pay texts (spread across the board): parsed -> annual');
  const step = Math.max(1, Math.floor(salaried.length / 10));
  for (let i = 0; i < salaried.length && i / step < 10; i += step) {
    const j = salaried[i];
    const s = j.salary;
    say(`  [${j.id}] ${trim(j.title, 60)} @ ${trim(j.locations.map((l) => l.name).join(' | '), 50)}`);
    say(`     text: ${trim(s.text, 220)}`);
    say(`     -> ${s.currency} ${s.min}-${s.max}/yr kind=${s.kind} source=${s.source}${s.originalInterval ? ` from ${s.originalInterval}` : ''} zones=${s.zones} spread=${s.spread}`);
  }
  const multi = salaried.filter((j) => (j.salary.zones || 1) >= 3 || (j.salary.ranges && j.salary.ranges.length > 2)).slice(0, 4);
  say(`\njobs with 3+ pay zones: ${salaried.filter((j) => (j.salary.zones || 1) >= 3).length}`);
  for (const j of multi) say(`  [${j.id}] ${trim(j.title, 50)} -> ${j.salary.min}-${j.salary.max} "${trim(j.salary.text, 200)}"\n     ${JSON.stringify(paySentences(htmlToText(j.descriptionHtml || ''), 6)).slice(0, 1400)}`);
  const unpaid = jobs.filter((j) => !j.salary && !j.salaryRaw && /\b(salary|base pay|pay range|compensation range|market range)\b/i.test(htmlToText(j.descriptionHtml || '')));
  say(`\njobs with pay words but no parsed range: ${unpaid.length}`);
  for (const j of unpaid.slice(0, 6)) say(`  [${j.id}] ${trim(j.title, 60)} @ ${trim(j.locations.map((l) => l.name).join(' | '), 40)}: ${JSON.stringify(paySentences(htmlToText(j.descriptionHtml || ''), 2))}`);

  const recs = scanCompany(jobs);
  const codes = {};
  let critical = 0;
  let blocking = 0;
  for (const r of recs) {
    for (const f of r.flags) codes[f] = (codes[f] || 0) + 1;
    if (r.critical) critical++;
    if (r.critical && r.job.salary) blocking++;
  }
  say(`\nvet flags: ${JSON.stringify(codes)}; critical ${critical}, blocking (published with a critical flag) ${blocking}`);
  for (const j of quarantined.slice(0, 8)) say(`  quarantined [${j.id}] ${trim(j.title, 60)}: ${trim(j.salaryRaw && j.salaryRaw.text, 120)} :: ${trim(j.salaryFlag.reason, 200)}`);
  for (const r of recs.filter((x) => x.flags.some((f) => ['multiple_ranges', 'ratio_over_3', 'missed_salary', 'currency_country_mismatch', 'interval_corrected'].includes(f))).slice(0, 8)) {
    say(`  flagged [${r.job.id}] ${trim(r.job.title, 50)} ${r.flags.join(',')}: ${trim(r.excerpt, 260)}`);
  }

  say('\n3 trimmed raw source records (fixtures; FIXTURE lines are JSON):');
  const hasPay = (x) => !!(x.salary || /salary|base pay|pay range|market range/i.test(x.text || ''));
  const pick = [raws.find(hasPay), raws.find((x) => !hasPay(x)), raws[Math.floor(raws.length / 2)]].filter(Boolean);
  const keep = new Set();
  for (const x of pick) {
    if (keep.has(x.sourceId)) continue;
    keep.add(x.sourceId);
    say(`FIXTURE ${slug} ${JSON.stringify(trimDeep(x._raw || { ...x, html: trimHtml(x.html), text: trim(x.text, 1500) }))}`);
  }
}

/** Long strings (descriptions) trimmed to their head plus the pay paragraphs. */
function trimDeep(v) {
  if (typeof v === 'string') return v.length > 2500 ? trimHtml(v) : v;
  if (Array.isArray(v)) return v.map(trimDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimDeep(x)]));
  return v;
}

/** Keep the pay paragraphs of a description and the first 600 characters. */
function trimHtml(html) {
  const s = String(html || '');
  if (s.length <= 2500) return s;
  // Paragraph-ish chunks that carry pay words, verbatim (tests parse them).
  const chunks = s.split(/(?=<(?:p|li|div|h\d|br)\b)|\n{2,}/i);
  const pay = chunks.filter((c) => /salary|base pay|pay range|market range|compensation|\$\s?\d|USD/i.test(c) && c.length < 2500).slice(0, 4);
  return `${s.slice(0, 600)} […] ${pay.join('')}`;
}

/* ------------------------------------------------------------------ main */

console.log(`probe-bigtech mode=${MODE} companies=${ONLY.join(',') || 'all'} max-jobs=${MAX_JOBS || 'all'} UA="${BOT_USER_AGENT}" node=${process.version} at ${new Date().toISOString()}`);
const slugs = ONLY.length ? SLUGS.filter((s) => ONLY.includes(s)) : SLUGS;
if (RAW) await section('RAW REQUESTS', () => rawRequests(RAW));
if (MODE === 'recon') {
  await Promise.all(slugs.map((slug) => section(`RECON ${slug}`, async () => { await robots(slug); await RECON[slug](); })));
} else if (MODE === 'full') {
  await Promise.all(slugs.map((slug) => section(`FULL ${slug}`, () => full(slug))));
}
console.log(`\nprobe-bigtech done at ${new Date().toISOString()}`);

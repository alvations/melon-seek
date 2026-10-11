// Eightfold career sites (beta channel): Microsoft and NVIDIA ("PCSX" API) and
// Netflix ("classic" apply/v2 API). docs/DATA_SOURCES.md §7.
//
// Both are the JSON calls the sites' own search pages make; they answer
// anonymously (no login, no token). robots.txt on every tenant is
// "Disallow: /" with "Allow: /careers", "Allow: /api/apply", "Allow: /api/pcsx".
//   PCSX     GET /api/pcsx/search?domain=<d>&query=&location=&start=N&sort_by=timestamp
//              -> { data: { count, positions: [{ id, displayJobId, name, locations[],
//                   standardizedLocations[], postedTs, creationTs, department,
//                   workLocationOption, positionUrl }] } }   (10 per page, fixed)
//            GET /api/pcsx/position_details?position_id=<id>&domain=<d>&hl=en
//              -> { data: { jobDescription (HTML), publicUrl, efcustomTextEmploymentType[], … } }
//   classic  GET /api/apply/v2/jobs?domain=<d>&start=N&num=10&sort_by=relevance
//              -> { count, positions: [{ id, name, location, locations[], department,
//                   business_unit, t_create, t_update, display_job_id, canonicalPositionUrl,
//                   job_description: "" (empty in the list) }] }
//            GET /api/apply/v2/jobs/<id>?domain=<d>  -> the position with job_description
// Pay is only in the description text (parsed by server/salary.js in normalize).
// The list carries no description, so each posting costs one detail request;
// at about 1 request/s per host a 2,500-posting board takes ~45 minutes.
import { UpstreamError, htmlToText, str, isoOrNull } from './util.js';
import { politeJson, checkRobots, mapLimit, cookieJar, newStats } from './polite.js';

/** Fixed tenants (board key -> host, Eightfold group id, API flavour). */
export const EIGHTFOLD_BOARDS = Object.freeze({
  microsoft: { host: 'apply.careers.microsoft.com', domain: 'microsoft.com', api: 'pcsx' },
  nvidia: { host: 'jobs.nvidia.com', domain: 'nvidia.com', api: 'pcsx' },
  netflix: { host: 'explore.jobs.netflix.net', domain: 'netflix.com', api: 'classic' },
});

const PAGE = 10; // fixed by the API (num / pageSize are ignored)
const MAX_PAGES = 1500; // runaway guard (15,000 postings)

export function eightfoldSearchUrl(t, start) {
  const q = new URLSearchParams({ domain: t.domain });
  if (t.api === 'pcsx') { q.set('query', ''); q.set('location', ''); q.set('start', String(start)); q.set('sort_by', 'timestamp'); }
  else { q.set('start', String(start)); q.set('num', String(PAGE)); q.set('sort_by', 'relevance'); }
  return `https://${t.host}/api/${t.api === 'pcsx' ? 'pcsx/search' : 'apply/v2/jobs'}?${q}`;
}

export function eightfoldDetailUrl(t, id) {
  const q = new URLSearchParams({ domain: t.domain });
  if (t.api === 'pcsx') return `https://${t.host}/api/pcsx/position_details?position_id=${encodeURIComponent(id)}&${q}&hl=en`;
  return `https://${t.host}/api/apply/v2/jobs/${encodeURIComponent(id)}?${q}`;
}

const seconds = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? new Date(Number(v) * 1000).toISOString() : null);

/** "Los Angeles,California,United States of America" -> "Los Angeles, California, United States of America". */
export function tidyLocation(s) {
  const t = str(s);
  return t ? t.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim() : null;
}

// The recruiter's LinkedIn work-mode tag, as NVIDIA writes it (also "#LI-Hybid", "#LI-Hybrind").
const OFFICE_TAG_RE = /#LI-(?:Hyb\w*|On-?site)\b/i;
/** True when the description carries a hybrid or on-site work-mode tag (DQ-12). */
export function officeTag(html) {
  return OFFICE_TAG_RE.test(String(html || ''));
}

// BP-8 (fix wave 3): NVIDIA's job-family names ("Mgmt, Sys SW", "Program Mgr, Technical",
// "Engineer, SW QA Test Dev"; 69 of its 146 departments) and five Microsoft ones ("Customer
// Success Account Mgmt", "Critical Environment Ops") are internal abbreviations. In plain words:
// phrases first (their meaning comes from the titles filed under them: "Dev Tech SW" holds
// "Developer Technology Engineer" roles, "Prod Planner" "Production Planner"), then single words.
// The board's own wording is kept wherever it is not an abbreviation; ASIC, CAD, IT, HR and UX
// are the fields' own names and stay.
const DEPARTMENT_PHRASES = [
  [/\bDev Relations\b/g, 'Developer Relations'], [/\bDev Ops\b/g, 'DevOps'], [/\bDev Tech\b/g, 'Developer Technology'],
  [/\bTech SW\b/g, 'Technology Software'], [/\bBus Dev\b/g, 'Business Development'], [/\bDoc Ctrl\b/g, 'Document Control'],
  [/\bSys Admin\b/g, 'Systems Administrator'], [/\bMarComm\b/g, 'Marketing Communications'], [/\(Tech\)/g, '(Technical)'],
  [/\bHRBP\b/g, 'HR Business Partner'], [/\(IC\)/g, '(Individual Contributor)'], [/\bRMA\b/g, 'Returns (RMA)'],
  [/\bSMB\b/g, 'Small and Medium Business'],
];
const DEPARTMENT_WORDS = Object.freeze({
  Mgmt: 'Management', Mgr: 'Manager', Mgrs: 'Managers', SW: 'Software', HW: 'Hardware', Sys: 'Systems',
  Eng: 'Engineering', Engng: 'Engineering', Engr: 'Engineer', Bus: 'Business', Dev: 'Development', Ops: 'Operations',
  Apps: 'Applications', Comp: 'Compensation', Mfg: 'Manufacturing', Phys: 'Physical', Prod: 'Production',
  Mktg: 'Marketing', Admin: 'Administrator', Corp: 'Corporate', Rep: 'Representative', QA: 'Quality Assurance',
  PR: 'Public Relations',
});
const DEPARTMENT_WORD_RE = new RegExp(String.raw`(?<![\w(])(${Object.keys(DEPARTMENT_WORDS).join('|')})(?![\w)])`, 'g');

/**
 * An Eightfold department or discipline name in plain words: "Mgmt, Sys SW" -> "Management,
 * Systems Software", "Program Mgr, Technical" -> "Program Manager, Technical", "Customer Success
 * Account Mgmt" -> "Customer Success Account Management", "Mgmt, Sales (Sales)" -> "Management,
 * Sales" (a bracket that repeats the name is dropped). Other names pass through unchanged. Pure.
 */
export function departmentName(name) {
  const s = str(name);
  if (!s) return s;
  let t = s.replace(/\s+/g, ' ').trim();
  for (const [re, rep] of DEPARTMENT_PHRASES) t = t.replace(re, rep);
  t = t.replace(DEPARTMENT_WORD_RE, (w) => DEPARTMENT_WORDS[w]);
  // "Management, Business Development (Business Development)", "Management, IT (IT - Information Technology)".
  t = t.replace(/\s*\(([^()]+)\)/g, (m, inner) => {
    const head = t.slice(0, t.indexOf(m)).toLowerCase();
    const words = inner.split(/\s+-\s+/)[0].toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return words.length && words.every((w) => new RegExp(`\\b${w}\\b`).test(head)) ? '' : m;
  });
  return t;
}

/**
 * Stored Eightfold Jobs (crawled before 2026-10-10) -> the DQ-12 rule of mapEightfoldJob: a
 * posting flagged remote only by workLocationOption, whose description carries NVIDIA's own
 * hybrid or on-site tag and none of whose locations is remote, is not remote. Since fix wave 3
 * also the plain-words department and team names (BP-8, departmentName). Pure.
 */
export function upgradeEightfoldJobs(jobs) {
  return (jobs || []).map((j) => {
    if (!j || !['nvidia', 'microsoft', 'netflix'].includes(j.company)) return j;
    let out = j;
    const department = j.department ? departmentName(j.department) : j.department;
    const team = j.team ? departmentName(j.team) : j.team;
    if (department !== j.department || team !== j.team) out = { ...out, department, team };
    if (j.remote !== true || j.company === 'netflix') return out;
    if ((j.locations || []).some((l) => l && l.remote) || !officeTag(j.descriptionHtml)) return out;
    return { ...out, remote: false };
  });
}

/**
 * Map one Eightfold position (search row merged with its detail, either API
 * flavour) to a RawJob. `t` is the tenant from EIGHTFOLD_BOARDS.
 */
export function mapEightfoldJob(p, t = EIGHTFOLD_BOARDS.microsoft) {
  const pcsx = t.api === 'pcsx';
  const html = String((pcsx ? p.jobDescription : p.job_description) || '');
  // PCSX standardizedLocations ("Redmond, WA, US") geocode better than locations ("United States, Washington, Redmond").
  const raw = pcsx
    ? (Array.isArray(p.standardizedLocations) && p.standardizedLocations.length ? p.standardizedLocations : p.locations)
    : (Array.isArray(p.locations) && p.locations.length ? p.locations : [p.location]);
  const locs = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    const s = tidyLocation(l);
    if (s && !locs.includes(s)) locs.push(s);
  }
  const wlo = String(p.workLocationOption || p.work_location_option || '').toLowerCase();
  let remote = null;
  // DQ-12: NVIDIA tags hybrid and on-site roles in the description ("#LI-Hybrid", "#LI-Onsite").
  // Its own tag wins over workLocationOption "remote_local"; a "Remote" location still counts.
  const tagged = officeTag(html);
  if ((/remote/.test(wlo) && !tagged) || locs.some((l) => /\bremote\b/i.test(l))) remote = true;
  else if (pcsx && tagged) remote = false;
  // Classic lists report every Netflix posting as "onsite"; only PCSX's value is trusted.
  else if (pcsx && /onsite|on-site|hybrid/.test(wlo)) remote = false;
  const site = Array.isArray(p.efcustomTextWorkSite) ? p.efcustomTextWorkSite[0] : null;
  if (pcsx && /remote|100% work from home/i.test(site || '')) remote = true;
  const emp = Array.isArray(p.efcustomTextEmploymentType) ? str(p.efcustomTextEmploymentType[0]) : null;
  let url = str(p.publicUrl) || (p.positionUrl ? `https://${t.host}${p.positionUrl}` : null) || str(p.canonicalPositionUrl);
  if (url) url = url.replace(/[?&]microsite=[^&]*$/, '');
  if (!url) url = `https://${t.host}/careers/job/${p.id}`;
  return {
    sourceId: String(p.id ?? ''),
    title: str(p.posting_name) || str(p.name) || 'Untitled role',
    department: departmentName(str(p.department)),
    team: departmentName(str(p.business_unit) || (Array.isArray(p.efcustomTextTaDisciplineName) ? str(p.efcustomTextTaDisciplineName[0]) : null)),
    employmentType: emp ? emp.replace(/^Full-Time$/i, 'Full-time').replace(/^Part-Time$/i, 'Part-time') : null,
    locationText: locs[0] || '',
    extraLocations: locs.slice(1),
    remote,
    html,
    text: htmlToText(html),
    url,
    updatedAt: seconds(pcsx ? p.postedTs : p.t_update),
    // The requisition's creation (t_create / creationTs); postedTs and t_update move on edits and reposts.
    postedAt: seconds(pcsx ? p.creationTs : p.t_create) || seconds(pcsx ? p.postedTs : p.t_update),
    reqId: str(p.displayJobId) || str(p.display_job_id) || str(p.atsJobId) || str(p.ats_job_id),
    salary: null,
  };
}

/**
 * Fetch every posting of an Eightfold tenant: the search pages, then one
 * detail request per posting (descriptions, and so pay, are only there).
 * Options: maxJobs (probe), stats (polite.newStats()), log, keepRaw, signal,
 * concurrency (detail requests in flight; the 1 request/s spacing still applies).
 * Returns { jobs: RawJob[], stats }.
 */
export async function fetchEightfold(board, opts = {}) {
  const key = typeof board === 'string' ? board : board && board.board;
  const t = EIGHTFOLD_BOARDS[key];
  if (!t) throw new UpstreamError(`eightfold: unknown board "${key}"`, { code: 'bad_board' });
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, concurrency = 2, timeoutMs } = opts;
  const label = `eightfold/${key}`;
  const jar = cookieJar(); // the site's own session cookies (_vs, _vscid): cookieless clients share a tiny bucket
  const common = { label, jar, stats, signal, timeoutMs };
  await checkRobots(`https://${t.host}`, [new URL(eightfoldSearchUrl(t, 0)).pathname + new URL(eightfoldSearchUrl(t, 0)).search, new URL(eightfoldDetailUrl(t, 1)).pathname], { label, stats, signal });

  const rows = [];
  const seen = new Set();
  let total = null;
  for (let page = 0, start = 0; page < MAX_PAGES; page++, start += PAGE) {
    const body = await politeJson(eightfoldSearchUrl(t, start), common);
    stats.pages++;
    const data = t.api === 'pcsx' ? body && body.data : body;
    const positions = data && Array.isArray(data.positions) ? data.positions : null;
    if (!positions) throw new UpstreamError(`${label}: unexpected search response (no positions)`, { code: 'bad_shape' });
    if (total == null && Number.isFinite(Number(data.count))) total = Number(data.count);
    let added = 0;
    for (const p of positions) {
      if (!p || p.id == null || seen.has(String(p.id))) continue;
      seen.add(String(p.id));
      rows.push(p);
      added++;
    }
    if (page % 25 === 0) log(`search page ${page + 1}: ${rows.length}/${total ?? '?'} postings`);
    if (!positions.length || (total != null && start + PAGE >= total) || (maxJobs && rows.length >= maxJobs)) break;
    if (!added && page > 0) { stats.notes.push(`search page ${page + 1} repeated earlier postings; stopped`); break; }
  }
  if (total != null && rows.length < total && !maxJobs) stats.notes.push(`search listed ${rows.length} of ${total} postings`);
  const list = maxJobs ? rows.slice(0, maxJobs) : rows;

  const t0 = Date.now();
  const { results, errors } = await mapLimit(list, concurrency, async (p, i) => {
    const d = await politeJson(eightfoldDetailUrl(t, p.id), { ...common, retries: 3 });
    stats.details++;
    if ((i + 1) % 200 === 0) log(`details ${i + 1}/${list.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    return t.api === 'pcsx' ? d && d.data : d;
  }, { shouldStop: () => signal && signal.aborted });
  stats.detailErrors += errors.length;
  if (errors.length) stats.notes.push(`${errors.length} detail request(s) failed, first: ${errors[0].error.message}`);
  // A board where most details fail is broken, not partially available.
  if (list.length && errors.length > Math.max(5, list.length * 0.2)) {
    throw new UpstreamError(`${label}: ${errors.length}/${list.length} detail requests failed (first: ${errors[0].error.message})`, { code: 'details_failed' });
  }
  const jobs = list.map((p, i) => {
    const merged = { ...p, ...(results[i] || {}) };
    const job = mapEightfoldJob(merged, t);
    if (keepRaw) job._raw = merged;
    return job;
  });
  log(`done: ${jobs.length} postings, ${stats.requests} requests`);
  return { jobs, stats };
}

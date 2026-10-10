// jobs.apple.com (beta channel). docs/DATA_SOURCES.md §7.
//
// POST https://jobs.apple.com/api/v1/search  (the search page's own call; no
// cookie or CSRF token needed, but the body must carry `format`, or the API
// answers 200 with zero results). 20 rows per page, `page` is 1-based,
// res.totalRecords is the board size. Pages sometimes come back empty at random
// mid-board; they are retried.
// GET  https://jobs.apple.com/api/v1/jobDetails/<id>?locale=en-us  (one posting:
// description, qualifications and postingFooters; the "Pay & Benefits" footer
// holds the pay sentence: "The base pay range for this role is between $150,400
// and $277,600, and your base pay will depend on …").
// jobs.apple.com has no robots.txt (it redirects to apple.com/pagenotfound).
//
// Apple publishes pay only for US postings, so detail requests (one per posting,
// ~2 s each server-side) are made for US postings; postings elsewhere keep the
// search row's job summary as their description. This halves a ~2-hour crawl.
import { UpstreamError, htmlToText, str, isoOrNull } from './util.js';
import { politeJson, checkRobots, mapLimit, cookieJar, newStats } from './polite.js';

export const APPLE_ORIGIN = 'https://jobs.apple.com';
const PAGE = 20;
const MAX_PAGES = 800;
const EMPTY_RETRIES = 3;
const FORMAT = { longDate: 'MMMM D, YYYY', mediumDate: 'MMM D, YYYY' };

export function appleSearchBody(page, filters = {}) {
  return { query: '', filters, page, locale: 'en-us', sort: 'newest', format: FORMAT };
}

const isUS = (row) => (Array.isArray(row.locations) ? row.locations : []).some((l) => /united states/i.test(l && l.countryName || '') || /USA$/.test(l && l.countryID || ''));

function locationName(l) {
  if (!l) return null;
  const city = str(l.city);
  const region = str(l.stateProvince);
  const country = str(l.countryName);
  const metro = str(l.name) ? l.name.replace(/\s+Metro Area$/i, '') : null;
  const place = city || metro || str(l.metro);
  return [place, region && region !== place ? region : null, country].filter(Boolean).join(', ') || null;
}

/** The "Pay & Benefits" footer text (HTML) for the posting's location. */
export function applePayFooter(d) {
  const footers = Array.isArray(d && d.postingFooters) ? d.postingFooters : [];
  const want = d && d.selectedLocation && d.selectedLocation.id;
  const order = want ? [...footers.filter((f) => f && f.postLocationId === want), ...footers.filter((f) => f && f.postLocationId !== want)] : footers;
  for (const f of order) {
    const loc = f && f.localizations;
    const items = loc && (loc.en_US || Object.values(loc)[0]);
    for (const it of Array.isArray(items) ? items : []) {
      if (it && /pay/i.test(it.name || '') && it.content) return String(it.content);
    }
  }
  return null;
}

/** Search row (+ optional jobDetails `res`) -> RawJob. */
export function mapAppleJob(row, d = null) {
  const x = d || {};
  const id = String(row.id ?? x.jobNumber ?? '');
  const pathId = id.replace(/^PIPE-/, '');
  const slug = str(row.transformedPostingTitle) || str(x.transformedPostingTitle) || 'job';
  const locs = [];
  for (const l of [x.selectedLocation, ...(Array.isArray(row.locations) ? row.locations : []), ...(Array.isArray(x.locations) ? x.locations : [])]) {
    const n = locationName(l);
    if (n && !locs.includes(n)) locs.push(n);
  }
  const remote = row.homeOffice === true || x.homeOffice === true ? true : (row.homeOffice === false ? false : null);
  if (remote && !locs.some((l) => /remote/i.test(l))) locs.push(`Remote, ${(row.locations && row.locations[0] && row.locations[0].countryName) || 'United States'}`);
  const pay = d ? applePayFooter(d) : null;
  const block = (title, h) => (h ? `${title ? `<h3>${title}</h3>` : ''}<p>${String(h).replace(/\n/g, '<br>')}</p>` : '');
  const html = [
    block(null, x.jobSummary || row.jobSummary),
    block('Description', x.description),
    block('Responsibilities', x.responsibilities),
    block('Minimum Qualifications', x.minimumQualifications),
    block('Preferred Qualifications', x.preferredQualifications),
    pay ? `<h3>Pay &amp; Benefits</h3><p>${pay}</p>` : '',
  ].join('');
  const team = (row.team && str(row.team.teamName)) || (Array.isArray(x.teamNames) ? str(x.teamNames[0]) : null);
  // Managed-pipeline (retail) rows are re-stamped on every request; their date says nothing.
  const pipeline = row.managedPipelineRole === true || x.managedPipelineRole === true;
  const date = pipeline ? null : (isoOrNull(x.postingDateMeta) || isoOrNull(row.postingDate) || null);
  const weekly = Number(row.standardWeeklyHours);
  return {
    sourceId: id,
    title: str(row.postingTitle) || str(x.postingTitle) || 'Untitled role',
    department: team,
    team: Array.isArray(x.teamNames) && x.teamNames[1] ? str(x.teamNames[1]) : null,
    employmentType: Number.isFinite(weekly) && weekly > 0 ? (weekly >= 35 ? 'Full-time' : 'Part-time') : null,
    locationText: locs[0] || '',
    extraLocations: locs.slice(1),
    remote,
    html,
    text: htmlToText(html),
    url: `${APPLE_ORIGIN}/en-us/details/${encodeURIComponent(pathId)}/${encodeURIComponent(slug)}`,
    updatedAt: date,
    postedAt: date,
    reqId: str(x.jobNumber) || str(row.positionId),
    salary: null,
  };
}

/** Fetch the search pages, then details for US postings. Options as fetchEightfold (+ detailsFor: 'us'|'all'). */
export async function fetchApple(board = 'apple', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, concurrency = 2, timeoutMs, detailsFor = 'us' } = opts;
  const label = 'apple';
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs };
  await checkRobots(APPLE_ORIGIN, ['/api/v1/search', '/api/v1/jobDetails/1'], { label, stats, signal });

  const rows = new Map();
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res = null;
    for (let attempt = 0; attempt <= EMPTY_RETRIES; attempt++) {
      const body = await politeJson(`${APPLE_ORIGIN}/api/v1/search`, { ...common, method: 'POST', body: appleSearchBody(page) });
      stats.pages++;
      res = body && (body.res || body);
      if (!res || !Array.isArray(res.searchResults)) throw new UpstreamError(`${label}: unexpected search response`, { code: 'bad_shape' });
      if (total == null && Number(res.totalRecords) > 0) total = Number(res.totalRecords);
      const expectRows = total != null && (page - 1) * PAGE < total;
      if (res.searchResults.length || !expectRows) break;
      stats.notes.push(`page ${page} came back empty (attempt ${attempt + 1}); retried`);
    }
    if (total == null) throw new UpstreamError(`${label}: search returned no postings (totalRecords 0)`, { code: 'empty' });
    for (const r of res.searchResults) if (r && r.id != null && !rows.has(String(r.id))) rows.set(String(r.id), r);
    if (page % 50 === 0) log(`search page ${page}: ${rows.size}/${total}`);
    if (!res.searchResults.length || rows.size >= total || page * PAGE >= total || (maxJobs && rows.size >= maxJobs)) break;
  }
  if (total != null && rows.size < total && !maxJobs) stats.notes.push(`search listed ${rows.size} of ${total} postings`);
  let list = [...rows.values()];
  if (maxJobs) list = list.slice(0, maxJobs);

  const want = list.filter((r) => detailsFor === 'all' || isUS(r));
  log(`details for ${want.length} of ${list.length} postings (${detailsFor})`);
  const t0 = Date.now();
  const { results, errors } = await mapLimit(want, concurrency, async (r, i) => {
    const body = await politeJson(`${APPLE_ORIGIN}/api/v1/jobDetails/${encodeURIComponent(r.id)}?locale=en-us`, { ...common, retries: 3 });
    stats.details++;
    if ((i + 1) % 200 === 0) log(`details ${i + 1}/${want.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    return body && (body.res || body);
  }, { shouldStop: () => signal && signal.aborted });
  stats.detailErrors += errors.length;
  if (errors.length) stats.notes.push(`${errors.length} detail request(s) failed, first: ${errors[0].error.message}`);
  if (want.length && errors.length > Math.max(5, want.length * 0.2)) {
    throw new UpstreamError(`${label}: ${errors.length}/${want.length} detail requests failed (first: ${errors[0].error.message})`, { code: 'details_failed' });
  }
  const detail = new Map(want.map((r, i) => [String(r.id), results[i] || null]));
  const jobs = list.map((r) => {
    const d = detail.get(String(r.id)) || null;
    const job = mapAppleJob(r, d);
    if (keepRaw) job._raw = { row: r, detail: d };
    return job;
  });
  return { jobs, stats };
}

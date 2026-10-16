// Google careers (beta channel). docs/DATA_SOURCES.md §7.
//
// robots.txt on www.google.com disallows every paged results URL
// (/about/careers/applications/jobs/results?page=, …/?page=, ?*&page=), so the
// board is NOT read by paging search results (neither the HTML pages nor the
// search RPC behind them). Instead:
//   1. GET /about/careers/applications/jobs/sitemap.xml: the jobs sitemap Google
//      publishes for crawlers (one <loc> per posting, with lastmod);
//   2. one posting at a time through the careers front-end's own detail RPC,
//      POST /about/careers/applications/_/HiringCportalFrontendUi/data/batchexecute
//      with f.req=[[["sf9Qmf","[\"<id>\"]",null,"generic"]]] (no cookie or
//      token; ~5 KB per posting, against ~1.3 MB for the HTML job page).
// The record is a positional array (no keys); see mapGoogleJob for the slots.
// Pay is text in the "about the job" HTML: "The US base salary range for this
// full-time position is $X-$Y + bonus + equity + benefits."
import { UpstreamError, htmlToText, str, decodeEntitiesOnce } from './util.js';
import { politeRequest, checkRobots, cookieJar, newStats, spreadSample } from './polite.js';
import { deltaPlan, runDetails, conditionalList, rowKey, crawlOptions, planNote, planSummary } from './incremental.js';
import { familyOfTitle } from '../families.js';

export const GOOGLE_ORIGIN = 'https://www.google.com';
export const GOOGLE_BASE = '/about/careers/applications';
export const GOOGLE_SITEMAP = `${GOOGLE_ORIGIN}${GOOGLE_BASE}/jobs/sitemap.xml`;
export const GOOGLE_RPC = `${GOOGLE_ORIGIN}${GOOGLE_BASE}/_/HiringCportalFrontendUi/data/batchexecute`;

/** <loc>…/jobs/results/<id>-<slug>/</loc> entries -> [{ id, slug, lastmod }] (deduped, in order). */
export function parseGoogleSitemap(xml) {
  const out = [];
  const seen = new Set();
  for (const m of String(xml || '').matchAll(/<url>\s*<loc>\s*([^<\s]+)\s*<\/loc>(?:\s*<lastmod>\s*([^<\s]+)\s*<\/lastmod>)?/g)) {
    const u = /\/jobs\/results\/(\d{6,})(?:-([^/?#]*))?/.exec(m[1]);
    if (!u || seen.has(u[1])) continue;
    seen.add(u[1]);
    out.push({ id: u[1], slug: u[2] || '', lastmod: m[2] || null });
  }
  return out;
}

/** Form body for the single-posting RPC. */
export function googleDetailBody(id) {
  const freq = JSON.stringify([[['sf9Qmf', JSON.stringify([String(id)]), null, 'generic']]]);
  return `f.req=${encodeURIComponent(freq)}`;
}

/** batchexecute response -> the posting record (positional array) or null. */
export function parseGoogleDetail(text) {
  const body = String(text || '').replace(/^\)\]\}'\s*/, '');
  let env = null;
  try { env = JSON.parse(body); } catch {
    // rt=c style chunked responses: find the wrb.fr line.
    const line = body.split('\n').find((l) => l.startsWith('[["wrb.fr"'));
    if (line) try { env = JSON.parse(line); } catch {}
  }
  const row = Array.isArray(env) ? env.find((e) => Array.isArray(e) && e[0] === 'wrb.fr' && e[1] === 'sf9Qmf') : null;
  if (!row || typeof row[2] !== 'string') return null;
  let inner;
  try { inner = JSON.parse(row[2]); } catch { return null; }
  let rec = Array.isArray(inner) ? inner[0] : null;
  if (Array.isArray(rec) && Array.isArray(rec[0])) rec = rec[0];
  return Array.isArray(rec) && rec.length > 1 && rec[0] ? rec : null;
}

const htmlAt = (v) => (Array.isArray(v) ? str(v[1]) || str(v[0]) || '' : str(v) || '');

/** A posting title as written: "Databases &amp; Analytics" is "Databases & Analytics" (DQ-16). */
export function googleTitle(v) {
  const t = str(v);
  return t && /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t) ? str(decodeEntitiesOnce(t)) : t;
}

/**
 * Stored Google Jobs -> the current mapping. Pure and idempotent; other companies pass through.
 *   - titles decoded (DQ-16);
 *   - google-grouping (2026-10-11, supersedes D-24's "brand as the department"): `brand` is the
 *     brand Google names on the posting (Google, YouTube, DeepMind, Waymo, …), which every crawl
 *     stored as `team`; `department` is the job family read from the title (server/families.js)
 *     with `departmentBasis: 'title'`, so the chart's department rows are job families like the
 *     other big-tech boards'. A title the classifier cannot read has no department (null).
 * server/normalize.js keeps only the RawJob fields it knows, so this read-time step is also what
 * gives a fresh crawl its `brand` (from the team) when the snapshot is read.
 */
export function upgradeGoogleJobs(jobs) {
  return (jobs || []).map((j) => {
    if (!j || j.company !== 'google') return j;
    const title = googleTitle(j.title) || j.title;
    const brand = j.brand || j.team || null;
    const department = familyOfTitle(title);
    if (title === j.title && brand === j.brand && department === j.department && j.departmentBasis === 'title') return j;
    return { ...j, title, department, departmentBasis: 'title', brand };
  });
}
const secs = (v) => (Array.isArray(v) && Number(v[0]) > 0 ? new Date(Number(v[0]) * 1000).toISOString() : null);

/**
 * Posting record -> RawJob. Slots (observed 2026-10-10, the same layout as the
 * search results): 0 id, 1 title, 2 apply (sign-in) URL, 3 responsibilities
 * [_, html], 4 qualifications [_, html], 7 brand (Google, DeepMind, YouTube…),
 * 9 locations [[display, addresses, city, zip, state, country]…], 10 about the
 * job [_, html] (carries the pay sentence), 12 created [s, ns], 13 updated,
 * 16 1 on remote-eligible reqs. `entry` is the sitemap entry ({ id, slug }).
 * No slot holds a department or team (D-24; the department is the title's job family, see
 * server/families.js): 5 is the brand's company resource name, 8 the
 * language, 11 a list of small integers ([2] on both Technical Program Manager fixtures, null
 * on a general application; probably a job-category code, not mapped until a probe confirms
 * the codes), 14 a timestamp, 15 an apply note, 18 a location note, 19 the minimum
 * qualifications. The sitemap gives only id, slug and lastmod.
 */
export function mapGoogleJob(rec, entry = {}) {
  const id = String(rec[0] ?? entry.id ?? '');
  const about = htmlAt(rec[10]);
  const resp = htmlAt(rec[3]);
  const quals = htmlAt(rec[4]);
  const html = [about, resp ? `<h3>Responsibilities</h3>${resp}` : '', quals ? `<h3>Qualifications</h3>${quals}` : ''].join('');
  const locs = [];
  for (const l of Array.isArray(rec[9]) ? rec[9] : []) {
    const name = Array.isArray(l) ? str(l[0]) : str(l);
    if (name && !locs.includes(name)) locs.push(name);
  }
  const remote = rec[16] === 1 || rec[16] === true || locs.some((l) => /\bremote\b/i.test(l)) ? true : null;
  if (remote && !locs.some((l) => /\bremote\b/i.test(l))) locs.push('Remote');
  const slug = entry.slug || String(rec[1] || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const brand = str(rec[7]);
  return {
    sourceId: id,
    title: googleTitle(rec[1]) || 'Untitled role',
    // D-24: the record has no department, team or category field (see the slot list above). The
    // brand (Google, YouTube, DeepMind, Waymo, …) is the only grouping Google publishes: it is the
    // team and `brand`. google-grouping: the department is the job family the title names, like
    // the other big-tech boards' departments (null when the title does not say).
    department: familyOfTitle(googleTitle(rec[1])),
    departmentBasis: 'title',
    team: brand,
    brand,
    employmentType: /\b(fixed[- ]term|contract)\b/i.test(String(rec[1] || '')) ? 'Contract' : /\bintern(ship)?\b/i.test(String(rec[1] || '')) ? 'Intern' : null,
    locationText: locs[0] || '',
    extraLocations: locs.slice(1),
    remote,
    html,
    text: htmlToText(html),
    url: `${GOOGLE_ORIGIN}${GOOGLE_BASE}/jobs/results/${id}${slug ? `-${slug}` : ''}`,
    updatedAt: secs(rec[13]) || secs(rec[12]),
    postedAt: secs(rec[12]),
    reqId: null,
    salary: null,
  };
}

/** Crawl-state version (server/sources/incremental.js): bump when the detail request changes. */
export const GOOGLE_CRAWL_VERSION = 'google-1';

/** A sitemap entry's change signal: its slug (the title) and <lastmod>. */
export function googleRowKey(e) {
  return rowKey({ slug: e && e.slug, lastmod: (e && e.lastmod) || null });
}

/**
 * Fetch the sitemap, then each posting. Options as fetchEightfold, including the incremental
 * ones (previous, full, refreshDays, now, probeLimit): the sitemap is a conditional request,
 * and a posting's record is fetched only when it is new, its <lastmod> or slug moved, or its
 * cached record is past its refresh age. The sitemap is the whole board (complete); a record
 * that comes back empty is a posting closed since the sitemap was built (`listing.gone`), and
 * one whose request failed is listed but unpublished (`listing.unpublished`: kept open).
 * Returns { jobs, stats, listing, state }.
 */
export async function fetchGoogle(board = 'google', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, concurrency = 2, timeoutMs } = opts;
  const co = crawlOptions(opts);
  const label = 'google';
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs };
  await checkRobots(GOOGLE_ORIGIN, [`${GOOGLE_BASE}/jobs/sitemap.xml`, `${GOOGLE_BASE}/_/HiringCportalFrontendUi/data/batchexecute`], { label, stats, signal });
  const plan = deltaPlan(maxJobs ? null : opts.previous, { version: GOOGLE_CRAWL_VERSION, ...co, full: co.full || !!maxJobs });
  const sm = await conditionalList(GOOGLE_SITEMAP, plan, common, parseGoogleSitemap, { accept: 'application/xml,text/xml' });
  stats.pages++;
  let entries = sm.entries;
  if (!entries.length) throw new UpstreamError(`${label}: the jobs sitemap lists no postings`, { code: 'bad_shape' });
  log(`sitemap: ${entries.length} postings`);
  if (maxJobs) entries = spreadSample(entries, maxJobs); // probe: a spread, not the oldest evergreen posts
  const items = entries.map((e) => ({ e, id: String(e.id), key: googleRowKey(e) }));
  const { details, gone, failed } = await runDetails(plan, items, {
    ...co, concurrency, signal, stats, log, label,
    request: async (x) => {
      const r = await politeRequest(GOOGLE_RPC, {
        ...common, method: 'POST', body: googleDetailBody(x.e.id), retries: 3,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      });
      const rec = parseGoogleDetail(r.text);
      return rec ? { detail: rec } : { gone: true };
    },
  });
  if (gone.length) stats.notes.push(`${gone.length} sitemap posting(s) returned no record (closed since the sitemap was built)`);
  stats.notes.push(planNote(plan, entries.length));
  const jobs = [];
  for (const x of items) {
    const rec = details.get(x.id);
    if (!rec) continue;
    const job = mapGoogleJob(rec, x.e);
    if (keepRaw) job._raw = rec;
    jobs.push(job);
  }
  const listing = { complete: !maxJobs, listed: entries.length, expected: entries.length, gone, unpublished: failed, summary: planSummary(plan, entries.length) };
  return { jobs, stats, listing, state: maxJobs ? null : plan.state({ list: sm.list }) };
}

// amazon.jobs (beta channel). docs/DATA_SOURCES.md §7.
//
// GET https://www.amazon.jobs/en/search.json?offset=N&result_limit=100&sort=recent[&filters]
// is the JSON call behind amazon.jobs/en/search (anonymous; robots.txt only
// disallows /internal paths and AhrefsBot). Each row carries the whole posting
// (description, basic and preferred qualifications), so no detail requests.
//
// One query returns at most 10,000 hits (`hits` is capped at 10000), so the
// board is read in partitions: by country (`normalized_country_code[]`), and a
// country at the cap by `business_category[]` as well. Postings are deduped on
// id_icims. Pay is text at the tail of preferred_qualifications: "The base pay
// for this position ranges from $129,300/year in our lowest geographic market
// up to $223,600/year in our highest geographic market."
import { UpstreamError, htmlToText, str } from './util.js';
import { politeJson, checkRobots, cookieJar, newStats } from './polite.js';

export const AMAZON_ORIGIN = 'https://www.amazon.jobs';
const PAGE = 100;
const CAP = 10000;

/** Search URL. `filters`: { normalized_country_code: 'USA', business_category: 'aws', ... } (one value each). */
export function amazonSearchUrl(offset, filters = {}, { limit = PAGE, facets = false } = {}) {
  const q = new URLSearchParams({ offset: String(offset), result_limit: String(limit), sort: 'recent' });
  for (const [k, v] of Object.entries(filters)) if (v != null) q.append(`${k}[]`, v);
  if (facets) for (const f of ['normalized_country_code', 'business_category']) q.append('facets[]', f);
  return `${AMAZON_ORIGIN}/en/search.json?${q}`;
}

const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
/** "October 10, 2026" -> "2026-10-10T00:00:00.000Z" (UTC date; the site shows no time). */
export function amazonDate(s) {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(String(s || ''));
  if (!m || MONTHS[m[1].toLowerCase()] == null) return null;
  return new Date(Date.UTC(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]))).toISOString();
}

/** Amazon's "- item<br/>- item" text blocks -> HTML with real lists (so sections/keywords see bullets). */
export function amazonBlockHtml(s) {
  const parts = String(s || '').split(/<br\s*\/?>/i);
  let html = '';
  let inList = false;
  for (const raw of parts) {
    const line = raw.trim();
    const bullet = /^[-•*·]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bullet[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

function parseLocations(job) {
  const out = [];
  let remote = null;
  for (const l of Array.isArray(job.locations) ? job.locations : []) {
    let o = l;
    if (typeof l === 'string') { try { o = JSON.parse(l); } catch { o = { normalizedLocation: l }; } }
    if (!o) continue;
    const type = String(o.type || '').toUpperCase();
    const name = str(o.normalizedLocation) || str(o.locationNonStemming) || str(o.location);
    if (/REMOTE|VIRTUAL/.test(type) || /\bvirtual\b|\bremote\b/i.test(name || '')) {
      remote = true;
      const country = str(o.normalizedCountryName) || str(o.normalizedCountryCode);
      const r = country ? `Remote, ${country}` : 'Remote';
      if (!out.includes(r)) out.push(r);
      continue;
    }
    if (type === 'ONSITE' && remote == null) remote = false;
    if (name && !out.includes(name)) out.push(name);
  }
  if (!out.length) {
    const n = str(job.normalized_location) || str(job.location);
    if (n) out.push(n);
  }
  return { locs: out, remote };
}

/** One search.json row -> RawJob. */
export function mapAmazonJob(j) {
  const { locs, remote } = parseLocations(j);
  const html = [
    amazonBlockHtml(j.description),
    j.basic_qualifications ? `<h3>Basic Qualifications</h3>${amazonBlockHtml(j.basic_qualifications)}` : '',
    j.preferred_qualifications ? `<h3>Preferred Qualifications</h3>${amazonBlockHtml(j.preferred_qualifications)}` : '',
  ].join('');
  const sched = str(j.job_schedule_type);
  const dept = str(j.job_category);
  const family = str(j.job_family);
  const posted = amazonDate(j.posted_date);
  return {
    sourceId: String(j.id_icims ?? j.id ?? ''),
    title: (str(j.title) || 'Untitled role').trim(),
    department: dept,
    team: family && family !== dept ? family : null,
    employmentType: sched ? sched.replace(/^full-time$/i, 'Full-time').replace(/^part-time$/i, 'Part-time') : null,
    locationText: locs[0] || '',
    extraLocations: locs.slice(1),
    remote,
    html,
    text: htmlToText(html),
    url: j.job_path ? `${AMAZON_ORIGIN}${j.job_path}` : `${AMAZON_ORIGIN}/en/jobs/${j.id_icims}`,
    updatedAt: posted,
    postedAt: posted,
    reqId: str(j.id_icims),
    salary: null,
  };
}

/**
 * Fetch the whole board in partitions under the 10,000-hit cap. Options:
 * maxJobs (probe), stats, log, keepRaw, signal, partitions (override, tests).
 * Returns { jobs, stats }.
 */
export async function fetchAmazon(board = 'amazon', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, timeoutMs } = opts;
  const label = 'amazon';
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs, maxBytes: 20 * 1024 * 1024 };
  await checkRobots(AMAZON_ORIGIN, ['/en/search.json'], { label, stats, signal });

  const rows = new Map();
  const add = (list) => { let n = 0; for (const j of list || []) { const k = String(j && (j.id_icims ?? j.id)); if (j && !rows.has(k)) { rows.set(k, j); n++; } } return n; };
  const full = () => maxJobs && rows.size >= maxJobs;

  /** Page one partition to the end (or the cap). */
  const crawl = async (filters, hitsHint) => {
    let hits = hitsHint;
    for (let offset = 0; offset < CAP; offset += PAGE) {
      if (full()) return hits;
      const body = await politeJson(amazonSearchUrl(offset, filters), common);
      stats.pages++;
      if (!body || !Array.isArray(body.jobs)) throw new UpstreamError(`${label}: unexpected response (no jobs array)`, { code: 'bad_shape' });
      if (body.error) throw new UpstreamError(`${label}: search error ${JSON.stringify(body.error).slice(0, 160)}`, { code: 'upstream' });
      if (hits == null) hits = Number(body.hits) || 0;
      add(body.jobs);
      if (body.jobs.length < PAGE || offset + PAGE >= hits) break;
    }
    return hits;
  };

  // Partition plan: the facet counts the search page itself asks for.
  const first = await politeJson(amazonSearchUrl(0, {}, { facets: true }), common);
  stats.pages++;
  if (!first || !Array.isArray(first.jobs)) throw new UpstreamError(`${label}: unexpected response (no jobs array)`, { code: 'bad_shape' });
  add(first.jobs);
  const total = Number(first.hits) || 0;
  const facet = (name) => {
    const f = first.facets && first.facets[`${name}_facet`] || (first.facets && first.facets[name]);
    return Array.isArray(f) ? f.map((x) => (Array.isArray(x) ? { value: x[0], count: Number(x[1]) } : x && typeof x === 'object' ? { value: Object.keys(x)[0], count: Number(Object.values(x)[0]) } : null)).filter((x) => x && x.value) : [];
  };
  const countries = opts.partitions ? opts.partitions.countries : facet('normalized_country_code');
  log(`total hits ${total}${total >= CAP ? ' (capped)' : ''}; ${countries.length} country facets`);
  if (total < CAP) {
    await crawl({}, total);
  } else {
    if (!countries.length) stats.notes.push('no country facets returned; the board is read only up to the 10,000-hit cap');
    else {
      for (const c of countries.sort((a, b) => b.count - a.count)) {
        if (full()) break;
        if (c.count < CAP) { await crawl({ normalized_country_code: c.value }, c.count); continue; }
        // A country at the cap (the US): split by business category.
        const sub = await politeJson(amazonSearchUrl(0, { normalized_country_code: c.value }, { facets: true }), common);
        stats.pages++;
        add(sub && sub.jobs);
        const cats = (sub && sub.facets) ? Object.assign(first, { facets: sub.facets }) && facet('business_category') : [];
        let covered = 0;
        for (const b of cats.sort((x, y) => y.count - x.count)) {
          if (full()) break;
          covered += b.count;
          const h = await crawl({ normalized_country_code: c.value, business_category: b.value }, b.count);
          if (h >= CAP) stats.notes.push(`${c.value}/${b.value} still at the cap; first 10,000 only`);
        }
        if (cats.length && covered < c.count) stats.notes.push(`${c.value}: business categories cover ${covered} of ${c.count}+ postings`);
        if (!cats.length) { stats.notes.push(`${c.value}: no category facets; first 10,000 only`); await crawl({ normalized_country_code: c.value }, c.count); }
      }
    }
    if (!countries.length) await crawl({}, total);
  }
  log(`listed ${rows.size} postings in ${stats.pages} pages`);
  let list = [...rows.values()];
  if (maxJobs) list = list.slice(0, maxJobs);
  const jobs = list.map((j) => {
    const job = mapAmazonJob(j);
    if (keepRaw) job._raw = j;
    return job;
  });
  return { jobs, stats };
}

// Raw job (adapter / demo output) -> Job (API shape). See docs/CONTRACT.md.
import { geocodeMany } from './geo.js';
import { extractSections, extractKeywords, jobSeniority, isSalesTitle } from './keywords.js';
import * as keywordsModule from './keywords.js';
import { parseSalary, toJobSalary, currenciesFor, payTerms, mayRelabelPay, payAreas, payAreaOf } from './salary.js';
import { htmlToText, isoOrNull } from './sources/util.js';
import { vetSalaries, salaryChecks } from './vet.js';
import { postingRule } from './companies.js';

/**
 * Version of the normalized output. Bump it whenever normalizeJob(s) output
 * changes on purpose (the golden test, test/golden-normalize.test.js, fails
 * until both the hashes and this version are updated). Snapshots carry it
 * (scripts/snapshot.js); the server re-derives sections/keywords for
 * snapshots with an older version (server/pipeline.js), once per file.
 * History: norm-2 = BUG-5 boilerplate-aware keywords; norm-3 = UX-3 canonical
 * location names (geo.js rawName); norm-4 = features §6a lexicon fixes
 * (14 noisy patterns, near-duplicate chips dropped or renamed); norm-5 = remote
 * locations name the country ("Remote (Canada)", not "Remote (CA)"); norm-6 = pay
 * data fixes from the 2026-10-10 persona review (salary.kind 'ote', salary.termWeeks,
 * term pay, level rules for Account Director / Fellow, keyword patterns and skill
 * order, Canadian cities and location context); norm-7 = beta fix wave pay and levels
 * (docs/process/fix-beta-pay.md: board ladders and job.seniorityBasis, salary.levels,
 * zł/kr/lei and "(CAD)" codes, Google country lines, bonus-target %, Canadian "$", the
 * SF Bay Area / NYC range, union floors, single figures that are not zones); norm-8 = fix
 * wave 3 (docs/process/fix3-data.md: salary.originalInterval 'year' on fixed-term yearly
 * rates, salary.partTime / hoursPerWeek, sections.preferred, "CAD" and other tag fixes, team
 * paragraphs left out of skills, creative and technical directors, Apple store names); norm-9 =
 * fix wave 4 (docs/process/fix4-data.md: salary.places and per-place Juice, the Google manager
 * ladder, Netflix "(L5)" support titles, ZIP-code states, store and data-centre town aliases,
 * another country's pay line is not the job's, NVIDIA "Italy:" sentences, the Netflix internship
 * band, repeated Microsoft level paragraphs, twice-escaped NVIDIA references, http(s) links); norm-10 =
 * fix wave 5 (docs/process/fix5-data.md: Amazon pay rows tied to their places and identical rows one
 * zone, virtual-location rows, salary.kind 'minimum', includesShiftDifferential, statedBase, stated
 * annual figures, "$" in Mexico / Australia / New Zealand / Singapore / Hong Kong, NVIDIA cash
 * compensation as 'ote', Meta salary.country, Amazon "III", Meta leadership and Microsoft IC/M
 * levels, ISO-3 country codes, "20h per week"); norm-11 = the salary audit (docs/process/salary-audit-backend.md:
 * every posted range kept (no cap at 12), Amazon "New York City" rows tied to New York, Microsoft's SF Bay
 * Area / NYC range kept per place for jobs with places inside and outside those areas, Google degree lines
 * and late Microsoft level paragraphs kept as salary.levels, a stored salary kept when trimming cut its
 * pay sentence); norm-12 = fix-data-3 (docs/process/fix-data-3.md: a Fellow rank is Staff+ and its pay is not
 * an intern's, "Data Residency" is not a residency, one "St." spelling in US and Canadian towns, "New York State"
 * and "Washington State", Cajamar and six other Brazilian towns, Luxembourg City, Town and Country, MO); norm-13 =
 * fix-mr-3 (docs/process/fix-mr-3.md, MR-40: 43 New York, New Jersey and Connecticut towns near Manhattan are at their
 * own place, not their state's centre, so Microsoft's NYC-metro range reaches them; T-17: a title's line breaks and runs
 * of whitespace are one space, cleanTitle). Stored
 * snapshots are upgraded with relocateJobs (which also re-derives text-sourced pay, the
 * pay labels and the level, then re-runs the vetting gate) and rekeyBoardJobs.
 */
export const NORMALIZER_VERSION = 'norm-13';

const NO_EXTRAS = Object.freeze({ equity: false, bonus: false });

/**
 * T-17 (fix-mr-3): a job title on one line, as posted. A line break and the spaces around it before a comma or period
 * go ("Partner Development Manager\n, Benelux Partner Team" -> "Partner Development Manager, Benelux Partner Team"),
 * then every run of whitespace is one space and the ends are trimmed. The words and their order are kept exactly; a
 * space the posting itself puts before a comma ("Technician , AWS", Amazon) is kept too. Titles held line breaks
 * that split CSV lines in naive readers and broke one-line places (Meta 1, Amazon 2 on the 2026-10-16 crawl).
 */
export function cleanTitle(title) {
  if (title == null) return '';
  return String(title).replace(/[^\S\r\n]*[\r\n][\s]*(?=[,.])/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * F2 extras: { equity, bonus } from keywords.extractCompExtras (feature-detected,
 * so an older keywords.js still works). Input: the description text plus the
 * source's compensation summary (e.g. Ashby "$310K – $460K • Offers Equity").
 */
export function compExtras(raw, text, title) {
  const fn = keywordsModule.extractCompExtras;
  if (typeof fn !== 'function') return { ...NO_EXTRAS };
  const summary = [raw && raw.compensationSummary, raw && raw.salary && raw.salary.text].filter(Boolean).join('\n');
  const out = safe(() => fn(summary ? `${text}\n${summary}` : text, { title }), NO_EXTRAS);
  return { equity: out.equity === true, bonus: out.bonus === true };
}

function safe(fn, fallback) {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch (err) {
    if (globalThis.process?.env?.DEBUG) console.warn('[normalize]', err);
    return fallback;
  }
}

export function normalizeLocations(raw) {
  const inputs = [raw.locationText, ...(Array.isArray(raw.extraLocations) ? raw.extraLocations : [])]
    .filter((s) => typeof s === 'string' && s.trim());
  const seen = new Set();
  const out = [];
  // P-9: all of the job's location strings are geocoded together, so a bare "Victoria"
  // next to Toronto and Calgary is Victoria, BC (geo.js#geocodeMany).
  const locs = safe(() => geocodeMany(inputs), []);
  for (const loc of Array.isArray(locs) ? locs : []) {
    if (!loc || !loc.name) continue;
    // Dedupe by name, and by resolved city ("San Francisco" == "San Francisco, CA").
    const key = String(loc.name).toLowerCase();
    const cityKey = loc.city && loc.lat != null ? `city:${loc.city}|${loc.country || ''}`.toLowerCase() : null;
    if (seen.has(key) || (cityKey && seen.has(cityKey))) continue;
    seen.add(key);
    if (cityKey) seen.add(cityKey);
    out.push(loc);
  }
  return out;
}

/**
 * Job salary for a raw job (docs/VETTING.md): the structured salary
 * (Greenhouse pay_input_ranges, Ashby compensation, Lever salaryRange) when
 * usable, else the pay statement parsed from the description text. With
 * several structured ranges (raw.payRanges), one in the location's currency
 * is preferred, and the per-tier list is kept as salary.ranges.
 * Per-job only: normalizeJobs then runs the vetting gate over the company.
 */
export function deriveSalary(raw, locations = []) {
  const countries = [...new Set((locations || []).map((l) => l && l.country).filter(Boolean))];
  const html = raw.html || '';
  const text = raw.text || htmlToText(html);
  const ranges = Array.isArray(raw.payRanges) ? raw.payRanges.filter((r) => r && Number.isFinite(r.min) && Number.isFinite(r.max)) : [];
  let structured = raw.salary || null;
  const want = currenciesFor(countries);
  if (structured && ranges.length > 1 && want.length && !want.includes(String(structured.currency).toUpperCase())) {
    const cur = want.find((c) => ranges.some((r) => r.currency === c));
    if (cur) {
      const pick = ranges.filter((r) => r.currency === cur && r.interval === ranges.find((x) => x.currency === cur).interval);
      const lo = Math.min(...pick.map((r) => r.min));
      const hi = Math.max(...pick.map((r) => r.max));
      if (lo > 0 && hi / lo <= 3) structured = { min: lo, max: hi, currency: cur, interval: pick[0].interval, text: pick.map((r) => r.text || `${r.min}–${r.max} ${r.currency}`).join('; ') };
    }
  }
  let salary = toJobSalary(structured, { source: 'structured' });
  // DQ-13: a job whose US locations are all in the SF Bay Area / NYC uses that range.
  const areas = payAreas(locations);
  const parsed = parseSalary(text, { countries, areas }) || (raw.text && html ? parseSalary(htmlToText(html), { countries, areas }) : null);
  // zones (F2): the text's distinct pay ranges merged with the adapter's tier count. Fix wave 5
  // (DQ-33): identical ranges are one zone (three equal Amazon rows are one range, not "3 places").
  const distinctRanges = new Set(ranges.map((r) => `${r.min}|${r.max}|${String(r.currency || '').toUpperCase()}|${r.interval || 'year'}`)).size;
  const adapterZones = Math.max(Number(raw.salary && raw.salary.zones) || 0, distinctRanges);
  const zonesOf = (s) => Math.max(1, s.zones || 1, adapterZones, (parsed && parsed.zones) || 0);
  // P-1 / P-8: on-target earnings and the programme length, from the posting's own words.
  const terms = (s) => payTerms(s, { text, title: raw.title || '', employmentType: raw.employmentType || '', salesRole: isSalesTitle(raw.title) });
  // Structured wins, unless it is implausible and the text gives a plausible
  // pay statement (e.g. adapter unit bugs: JPY pay_input_ranges divided by 100).
  const who = { title: raw.title, employmentType: raw.employmentType };
  const hard = salary ? salaryChecks(who, salary).filter((c) => c.code !== 'junior_high' && c.code !== 'senior_low') : [];
  if (hard.length) {
    const fromText = toJobSalary(parsed, { source: 'text' });
    if (fromText && !salaryChecks(who, fromText).length) return terms({ ...fromText, zones: zonesOf(fromText), structuredRejected: hard.map((c) => c.code) });
  }
  // DQ-33 / VT-15: each range keeps the places it was posted for (ranges[].locations, as Apple's).
  // SB-3 (salary audit): every posted range is kept. A cap at 12 dropped the rows after the twelfth,
  // and with them those places' pay (a snapshot crawled before norm-11 can still lack them).
  if (salary && ranges.length > 1) salary.ranges = ranges.map(({ min, max, currency, interval, label, locations }) => ({ min, max, currency, interval, ...(label ? { label } : {}), ...(Array.isArray(locations) && locations.length ? { locations: [...locations] } : {}) }));
  if (!salary) {
    salary = toJobSalary(parsed, { source: 'text' });
    if (salary) salary = withAreaRanges(salary, parsed, locations);
  }
  if (salary) salary.zones = zonesOf(salary);
  return salary ? terms(salary) : salary;
}

/** A Location's key in salary.ranges[].locations (as Apple's and Amazon's ranges): the source string. */
const placeKey = (l) => l && (l.rawName || l.name);
const placeWords = (locs) => {
  const words = [...new Set(locs.map((l) => (l.remote ? 'Remote' : String(l.city || placeKey(l) || '').split(',')[0].trim())).filter(Boolean))];
  return words.length > 4 ? `${words.slice(0, 3).join(', ')} and ${words.length - 3} more` : words.join(', ');
};

/**
 * SB-5 (salary audit, norm-11): Microsoft posts a national range and a second range for the SF Bay
 * Area and New York City ("... the base pay range for this role in those locations is USD $X - $Y").
 * A job located only in those areas already uses the second range (DQ-13). A job with places both
 * inside and outside them kept only the national range, so its San Francisco or New York place was
 * scored, filtered and shown on the national range. Here both posted ranges are kept, each tied to
 * the job's places it applies to (salary.ranges[].locations, like Apple's and Amazon's): the national
 * range for the job's other places in the pay's country, the area range for its places in the areas.
 * salary.min/max stay the national range (DATA_SOURCES §7a). Annualized like the salary.
 */
export function withAreaRanges(salary, parsed, locations = []) {
  const cr = parsed && parsed.cityRange;
  if (!salary || !cr || !Array.isArray(cr.areas) || !cr.areas.length || (Array.isArray(salary.ranges) && salary.ranges.length)) return salary;
  const country = salary.country || 'US';
  const inCountry = (locations || []).filter((l) => l && placeKey(l) && String(l.country || '').toUpperCase() === country);
  const inArea = inCountry.filter((l) => cr.areas.includes(payAreaOf(l)));
  const others = inCountry.filter((l) => !inArea.includes(l));
  if (!inArea.length || !others.length) return salary;
  const city = toJobSalary({ ...parsed, min: cr.min, max: cr.max, levels: null, zones: 1 }, {});
  if (!city || city.currency !== salary.currency) return salary;
  return {
    ...salary,
    ranges: [
      { label: placeWords(others), min: salary.min, max: salary.max, currency: salary.currency, interval: 'year', locations: others.map(placeKey) },
      { label: placeWords(inArea), min: city.min, max: city.max, currency: city.currency, interval: 'year', locations: inArea.map(placeKey) },
    ],
  };
}

/**
 * Fix wave 4 (DQ-27): `salary.places`, the location strings (Location.rawName) a posting's pay
 * was posted for, when the adapter knows it is only some of the posting's places (Apple posts a
 * requisition's range for its California listing and none for its Texas one). Absent means every
 * place in the pay's country. Only places the job lists are kept; none kept means absent.
 */
export function withPayPlaces(salary, payPlaces, locations = []) {
  if (!salary || !Array.isArray(payPlaces) || !payPlaces.length) return salary;
  const have = new Set((locations || []).map((l) => l && (l.rawName || l.name)).filter(Boolean));
  const places = [...new Set(payPlaces.filter((p) => typeof p === 'string' && have.has(p)))];
  return places.length && places.length < have.size ? { ...salary, places } : salary;
}

/**
 * Re-derive the pay labels of a STORED Job salary (P-1, P-8; snapshots written before
 * norm-6) from the stored posting: kind 'ote', termWeeks and term pay ("$100,000–$167,000
 * USD for the four-month fellowship", which older parsers read as a yearly salary). The
 * stored numbers are kept unless the text salary is that term amount. Same rules as
 * deriveSalary for a fresh posting.
 */
function relabelSalary(sal, { text, title, employmentType, countries }) {
  if (!sal || typeof sal !== 'object') return sal;
  let s = sal;
  if (s.source === 'text' && s.originalInterval !== 'term' && text && mayRelabelPay(text)) {
    const p = parseSalary(text, { countries });
    // The stored yearly figure is the term amount the parser now reads per term.
    if (p && p.interval === 'term' && Math.abs(p.min - s.min) <= 1 && Math.abs(p.max - s.max) <= 1) {
      const t = toJobSalary(p, { source: 'text' });
      if (t) s = { ...t, zones: Math.max(s.zones || 1, t.zones || 1) };
    } else if (p && p.kind === 'ote' && s.kind !== 'ote' && Math.abs((toJobSalary(p) || {}).min - s.min) <= 1) {
      s = { ...s, kind: 'ote' };
    }
  }
  return payTerms(s, { text, title, employmentType, salesRole: isSalesTitle(title) });
}

/** The marker scripts/snapshot.js#trimDescription leaves where it cut a description. */
const TRIMMED_RE = /\[…\] Full description on the posting page\./;

/**
 * The salary a STORED posting gets from the current parser (norm-7, the beta fix wave:
 * DQ-5, DQ-6, DQ-8 levels, DQ-13, DQ-14, DQ-15, D-22, D-30): its text-sourced salary, or
 * its missing one, is derived again from the posting text exactly as deriveSalary does for
 * a fresh posting. Returns undefined when the stored salary is structured (Greenhouse,
 * Ashby, Lever ranges are not stored raw, so only their labels are re-derived).
 */
function rederiveTextSalary(j, text) {
  const sal = j.salary || j.salaryRaw || null;
  if (sal && sal.source !== 'text') return undefined;
  if (!text) return sal ? undefined : null;
  const fresh = deriveSalary({ title: j.title || '', employmentType: j.employmentType || '', text, html: '' }, j.locations || []);
  // The parser no longer reads pay here, but the stored figure fails the gate's hard checks
  // anyway (an old misread such as "$4.6M"): keep it, so the gate keeps it quarantined ("Pay
  // unclear") instead of the upgrade erasing the record. A plausible stored figure that the
  // text no longer supports (a union pay floor) is dropped.
  if (!fresh && sal && salaryChecks({ title: j.title, employmentType: j.employmentType }, sal).length) return undefined;
  // SA-7 (salary audit): a stored description trimmed to fit the snapshot (scripts/snapshot.js
  // trimDescription) may have lost the pay sentence the stored salary was read from; the trimmed text
  // then says nothing about pay, so the stored salary is kept, never erased.
  if (!fresh && sal && TRIMMED_RE.test(text)) return undefined;
  // A text salary that replaced a rejected structured one keeps that record and its zones.
  if (fresh && sal && sal.structuredRejected) return withPayPlaces({ ...fresh, zones: Math.max(fresh.zones || 1, sal.zones || 1), structuredRejected: sal.structuredRejected }, sal.places, j.locations);
  // The places the stored pay was posted for (DQ-27) are the adapter's knowledge, not the text's.
  return sal ? withPayPlaces(fresh, sal.places, j.locations) : fresh;
}

/**
 * Upgrade stored jobs to the current pay and level rules: a text-sourced (or missing)
 * salary is derived again from the posting text, a structured one keeps its numbers and
 * gets the pay labels (salary.kind 'ote', termWeeks), and the level is re-derived from the
 * title and the pay sentence (job.seniority, job.seniorityBasis). The list then goes
 * through the vetting gate again, so a re-derived salary is quarantined like a fresh one.
 * Pure and idempotent; called by relocateJobs, so every snapshot upgrade path
 * (server/pipeline.js, scripts/build-static.js, the archive ingest and the refresh report)
 * gets it with the location upgrade. Pass a whole company's list (the gate's statistics are
 * per company).
 */
export function relabelJobs(jobs) {
  if (!Array.isArray(jobs)) return jobs;
  let changed = false;
  const out = jobs.map((j) => {
    if (!j || typeof j !== 'object') return j;
    const title = typeof j.title === 'string' ? cleanTitle(j.title) : j.title || ''; // T-17: stored titles too
    const html = typeof j.descriptionHtml === 'string' ? j.descriptionHtml : '';
    const text = html ? htmlToText(html) : '';
    const lvl = title ? safe(() => jobSeniority({ title, text, company: j.company || null }), null) : null;
    const next = { ...j };
    if (typeof j.title === 'string' && title && title !== j.title) next.title = title;
    if (lvl) { next.seniority = lvl.level; next.seniorityBasis = lvl.basis; }
    else if (!next.seniorityBasis) next.seniorityBasis = (next.seniority || 'Mid') === 'Mid' ? 'default' : 'title';
    // (Not safe(): a fresh null, "no salary", must replace the stored one.)
    let fresh;
    try { fresh = rederiveTextSalary(j, text); } catch { fresh = undefined; }
    if (fresh !== undefined) {
      delete next.salaryRaw;
      delete next.salaryFlag;
      next.salary = fresh;
    } else if (j.salary || j.salaryRaw) {
      const ctx = { text, title, employmentType: j.employmentType || '', countries: [...new Set((j.locations || []).map((l) => l && l.country).filter(Boolean))] };
      if (j.salary) next.salary = safe(() => relabelSalary(j.salary, ctx), j.salary);
      if (j.salaryRaw) next.salaryRaw = safe(() => relabelSalary(j.salaryRaw, ctx), j.salaryRaw);
    }
    changed = true;
    return next;
  });
  return changed ? vetSalaries(out) : out;
}

/**
 * True when `u` is an https link with no user name, password or port, on one of `rule.hosts`, or under
 * one of `rule.prefixes` (compared on the parsed URL, so "…/careers/../x", "<host>.evil.example" or
 * "https://<host>@evil.example/" cannot pass). No host is named here: this module ships on the stable site.
 */
export function onPostingHost(u, rule) {
  let x;
  try { x = new URL(String(u)); } catch { return false; }
  if (x.protocol !== 'https:' || x.username || x.password || x.port) return false;
  const host = x.hostname.toLowerCase();
  if (rule.hosts.includes(host)) return true;
  const here = `${x.protocol}//${host}${x.pathname}`;
  return rule.prefixes.some((p) => here.startsWith(p));
}

/**
 * S-4 (fix wave 4): a posting link is an absolute http(s) URL, or null ("javascript:…" never reaches the
 * CSV or the JSON). S-4 residual (fix-sec-3): for a beta built-in (its registry entry's `postingHosts` /
 * `postingPrefixes`, server/companies.js#postingRule) it must also be https, with no user name, password or
 * port, on that company's own posting hosts; any other link is dropped (the drawer then says "No link to
 * the posting").
 */
export function postingUrl(u, company = null) {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const x = new URL(u.trim());
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
    const rule = postingRule(company);
    return !rule || onPostingHost(u.trim(), rule) ? u.trim() : null;
  } catch { return null; }
}

export function normalizeJob(raw, company, { boilerplate = null, team = null } = {}) {
  const html = raw.html || '';
  const text = raw.text || htmlToText(html);
  // BUG-5: board boilerplate (About us, scam notice, EEO/visa policy) is left
  // out of section/keyword extraction; descriptionHtml and extras keep it.
  const skip = boilerplate && boilerplate.size && html ? boilerplate : null;
  const kwText = skip && typeof keywordsModule.descriptionText === 'function'
    ? safe(() => keywordsModule.descriptionText(html, { skip }), text)
    : text;
  // Fix wave 3: team and company paragraphs (keywords.js#teamParagraphs) are left out of the
  // skills of a posting with bullet lists.
  const skillText = team && team.size && html && typeof keywordsModule.descriptionText === 'function'
    ? safe(() => keywordsModule.descriptionText(html, { skip: team }), null)
    : null;
  const title = cleanTitle(raw.title) || 'Untitled role'; // T-17: one line, words as posted
  const locations = normalizeLocations(raw);
  const remote = raw.remote === true || locations.some((l) => l && l.remote === true);

  const salary = withPayPlaces(deriveSalary(raw, locations), raw.payPlaces, locations);

  const emptySections = { responsibilities: [], fit: [] };
  const sections = safe(() => extractSections(html, skip ? { skip } : undefined), emptySections);
  const keywords = safe(
    () => extractKeywords({ title, department: raw.department || null, sections, text: kwText, ...(skillText != null ? { skillText } : {}) }),
    { responsibilities: [], fit: [], skills: [] },
  );
  // DQ-3: the title's level on the board's ladder, else the level the pay sentence names.
  const level = safe(() => jobSeniority({ title, text, company: company.slug }), { level: 'Mid', basis: 'default' });
  const extras = compExtras(raw, text, title);

  return {
    id: `${company.slug}:${raw.sourceId}`,
    company: company.slug,
    companyName: company.name,
    title,
    department: raw.department || null,
    team: raw.team || null,
    employmentType: raw.employmentType || null,
    seniority: level.level,
    seniorityBasis: level.basis,                                          // 'title' | 'pay' | 'default'
    locations,
    remote,
    salary,
    url: postingUrl(raw.url, company),                                   // S-4: http(s) only; a beta built-in's own hosts
    updatedAt: raw.updatedAt || null,
    postedAt: isoOrNull(raw.postedAt),                                    // F4
    reqId: raw.reqId != null && raw.reqId !== '' ? String(raw.reqId) : null, // F4 (Greenhouse internal_job_id)
    descriptionHtml: html,
    extras,                                                               // F2
    sections,
    keywords,
  };
}

/**
 * Upgrade stored, already-normalized jobs (snapshots written by an older
 * normalizer) to the current location model: re-geocode each location from its
 * source string (rawName, or the old name, which was the source string), and
 * recompute `remote`. Since norm-6 it also re-derives the pay labels and the level
 * (relabelJobs), so the server (server/pipeline.js), the static build
 * (scripts/build-static.js#readSnapshot) and the archive show the fixes on stored
 * snapshots before the next crawl. Used once per snapshot file version.
 */
export function relocateJobs(jobs) {
  const moved = (jobs || []).map((j) => {
    if (!j || !Array.isArray(j.locations) || !j.locations.length) return j;
    const inputs = j.locations.map((l) => l && (l.rawName || l.name)).filter(Boolean);
    if (!inputs.length) return j;
    const locations = normalizeLocations({ locationText: inputs[0], extraLocations: inputs.slice(1) });
    const remote = j.remote === true || locations.some((l) => l && l.remote === true);
    return { ...j, locations, remote };
  });
  return relabelJobs(moved);
}

export function normalizeJobs(raws, company) {
  const list = (raws || []).filter(Boolean);
  // BUG-5 layer 1: paragraphs shared by >= 50% of this board's postings.
  const bp = keywordsModule.boilerplateParagraphs;
  const boilerplate = typeof bp === 'function' ? safe(() => bp(list.map((r) => r.html || '')), null) : null;
  // Fix wave 3: paragraphs repeated across a board's different roles describe a team, not the role.
  const tp = keywordsModule.teamParagraphs;
  const teamOnly = typeof tp === 'function' ? safe(() => tp(list.map((r) => ({ html: r.html || '', title: r.title }))), null) : null;
  const team = teamOnly && teamOnly.size ? new Set([...(boilerplate || []), ...teamOnly]) : boilerplate;
  let out = [];
  const ids = new Set();
  for (const raw of list) {
    const job = normalizeJob(raw, company, { boilerplate, team });
    if (ids.has(job.id)) continue;
    ids.add(job.id);
    out.push(job);
  }
  // BUG-5 layer 2: a keyword on > 90% of the board's jobs (n >= 20) filters nothing.
  let dropped = null;
  const guard = keywordsModule.dropUbiquitousKeywords;
  if (typeof guard === 'function') {
    const g = safe(() => guard(out), null);
    if (g) { out = g.jobs; dropped = g.dropped; }
  }
  // Salary gate: quarantine implausible or outlier pay (docs/VETTING.md).
  const vetted = vetSalaries(out);
  // Per-board diagnostics for meta.droppedKeywords (non-enumerable: JSON and
  // deepEqual ignore it; callers read jobs.droppedKeywords).
  if (Array.isArray(vetted) && dropped) {
    Object.defineProperty(vetted, 'droppedKeywords', { value: dropped, enumerable: false, configurable: true });
  }
  return vetted;
}

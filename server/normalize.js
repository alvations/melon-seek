// Raw job (adapter / demo output) -> Job (API shape). See docs/CONTRACT.md.
import { geocodeMany } from './geo.js';
import { extractSections, extractKeywords, jobSeniority, isSalesTitle } from './keywords.js';
import * as keywordsModule from './keywords.js';
import { parseSalary, toJobSalary, currenciesFor, payTerms, mayRelabelPay, payAreas } from './salary.js';
import { htmlToText, isoOrNull } from './sources/util.js';
import { vetSalaries, salaryChecks } from './vet.js';

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
 * SF Bay Area / NYC range, union floors, single figures that are not zones). Stored
 * snapshots are upgraded with relocateJobs (which also re-derives text-sourced pay, the
 * pay labels and the level, then re-runs the vetting gate) and rekeyBoardJobs.
 */
export const NORMALIZER_VERSION = 'norm-7';

const NO_EXTRAS = Object.freeze({ equity: false, bonus: false });

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
  // zones (F2): the text's distinct pay ranges merged with the adapter's tier count.
  const adapterZones = Math.max(Number(raw.salary && raw.salary.zones) || 0, ranges.length);
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
  if (salary && ranges.length > 1) salary.ranges = ranges.slice(0, 12).map(({ min, max, currency, interval, label }) => ({ min, max, currency, interval, ...(label ? { label } : {}) }));
  if (!salary) salary = toJobSalary(parsed, { source: 'text' });
  if (salary) salary.zones = zonesOf(salary);
  return salary ? terms(salary) : salary;
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
  // A text salary that replaced a rejected structured one keeps that record and its zones.
  if (fresh && sal && sal.structuredRejected) return { ...fresh, zones: Math.max(fresh.zones || 1, sal.zones || 1), structuredRejected: sal.structuredRejected };
  return fresh;
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
    const title = j.title || '';
    const html = typeof j.descriptionHtml === 'string' ? j.descriptionHtml : '';
    const text = html ? htmlToText(html) : '';
    const lvl = title ? safe(() => jobSeniority({ title, text, company: j.company || null }), null) : null;
    const next = { ...j };
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

export function normalizeJob(raw, company, { boilerplate = null } = {}) {
  const html = raw.html || '';
  const text = raw.text || htmlToText(html);
  // BUG-5: board boilerplate (About us, scam notice, EEO/visa policy) is left
  // out of section/keyword extraction; descriptionHtml and extras keep it.
  const skip = boilerplate && boilerplate.size && html ? boilerplate : null;
  const kwText = skip && typeof keywordsModule.descriptionText === 'function'
    ? safe(() => keywordsModule.descriptionText(html, { skip }), text)
    : text;
  const title = raw.title || 'Untitled role';
  const locations = normalizeLocations(raw);
  const remote = raw.remote === true || locations.some((l) => l && l.remote === true);

  const salary = deriveSalary(raw, locations);

  const emptySections = { responsibilities: [], fit: [] };
  const sections = safe(() => extractSections(html, skip ? { skip } : undefined), emptySections);
  const keywords = safe(
    () => extractKeywords({ title, department: raw.department || null, sections, text: kwText }),
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
    url: raw.url || null,
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
  let out = [];
  const ids = new Set();
  for (const raw of list) {
    const job = normalizeJob(raw, company, { boilerplate });
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

// Raw job (adapter / demo output) -> Job (API shape). See docs/CONTRACT.md.
import { geocode } from './geo.js';
import { extractSections, extractKeywords, inferSeniority } from './keywords.js';
import { parseSalary, toJobSalary, currenciesFor } from './salary.js';
import { htmlToText, isoOrNull } from './sources/util.js';
import { vetSalaries, salaryChecks } from './vet.js';

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
  for (const input of inputs) {
    const locs = safe(() => geocode(input), []);
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
  const parsed = parseSalary(text, { countries }) || (raw.text && html ? parseSalary(htmlToText(html), { countries }) : null);
  // zones (F2): the text's distinct pay ranges merged with the adapter's tier count.
  const adapterZones = Math.max(Number(raw.salary && raw.salary.zones) || 0, ranges.length);
  const zonesOf = (s) => Math.max(1, s.zones || 1, adapterZones, (parsed && parsed.zones) || 0);
  // Structured wins, unless it is implausible and the text gives a plausible
  // pay statement (e.g. adapter unit bugs: JPY pay_input_ranges divided by 100).
  const who = { title: raw.title, employmentType: raw.employmentType };
  const hard = salary ? salaryChecks(who, salary).filter((c) => c.code !== 'junior_high' && c.code !== 'senior_low') : [];
  if (hard.length) {
    const fromText = toJobSalary(parsed, { source: 'text' });
    if (fromText && !salaryChecks(who, fromText).length) return { ...fromText, zones: zonesOf(fromText), structuredRejected: hard.map((c) => c.code) };
  }
  if (salary && ranges.length > 1) salary.ranges = ranges.slice(0, 12).map(({ min, max, currency, interval, label }) => ({ min, max, currency, interval, ...(label ? { label } : {}) }));
  if (!salary) salary = toJobSalary(parsed, { source: 'text' });
  if (salary) salary.zones = zonesOf(salary);
  return salary;
}

export function normalizeJob(raw, company) {
  const html = raw.html || '';
  const text = raw.text || htmlToText(html);
  const title = raw.title || 'Untitled role';
  const locations = normalizeLocations(raw);
  const remote = raw.remote === true || locations.some((l) => l && l.remote === true);

  const salary = deriveSalary(raw, locations);

  const emptySections = { responsibilities: [], fit: [] };
  const sections = safe(() => extractSections(html), emptySections);
  const keywords = safe(
    () => extractKeywords({ title, department: raw.department || null, sections, text }),
    { responsibilities: [], fit: [], skills: [] },
  );
  const seniority = safe(() => inferSeniority(title), 'Mid');

  return {
    id: `${company.slug}:${raw.sourceId}`,
    company: company.slug,
    companyName: company.name,
    title,
    department: raw.department || null,
    team: raw.team || null,
    employmentType: raw.employmentType || null,
    seniority,
    locations,
    remote,
    salary,
    url: raw.url || null,
    updatedAt: raw.updatedAt || null,
    postedAt: isoOrNull(raw.postedAt),                                    // F4
    reqId: raw.reqId != null && raw.reqId !== '' ? String(raw.reqId) : null, // F4 (Greenhouse internal_job_id)
    descriptionHtml: html,
    sections,
    keywords,
  };
}

export function normalizeJobs(raws, company) {
  const out = [];
  const ids = new Set();
  for (const raw of raws || []) {
    if (!raw) continue;
    const job = normalizeJob(raw, company);
    if (ids.has(job.id)) continue;
    ids.add(job.id);
    out.push(job);
  }
  // Salary gate: quarantine implausible or outlier pay (docs/VETTING.md).
  return vetSalaries(out);
}

// Raw job (adapter / demo output) -> Job (API shape). See docs/CONTRACT.md.
import { geocode } from './geo.js';
import { extractSections, extractKeywords, inferSeniority } from './keywords.js';
import { parseSalary, toJobSalary } from './salary.js';
import { htmlToText } from './sources/util.js';

function safe(fn, fallback) {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch (err) {
    if (process.env.DEBUG) console.warn('[normalize]', err);
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
      const key = String(loc.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(loc);
    }
  }
  return out;
}

export function normalizeJob(raw, company) {
  const html = raw.html || '';
  const text = raw.text || htmlToText(html);
  const title = raw.title || 'Untitled role';
  const locations = normalizeLocations(raw);
  const remote = raw.remote === true || locations.some((l) => l && l.remote === true);

  let salary = toJobSalary(raw.salary);
  if (!salary) salary = toJobSalary(parseSalary(text) || (raw.text ? parseSalary(htmlToText(html)) : null));

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
  return out;
}

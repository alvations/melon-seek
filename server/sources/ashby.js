// Ashby job board adapter.
// API: https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
import { fetchJson, UpstreamError, htmlToText, str, isoOrNull } from './util.js';

export function ashbyUrl(board) {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
}

export async function fetchAshby(board, { maxBytes, timeoutMs } = {}) {
  const data = await fetchJson(ashbyUrl(board), { label: `ashby/${board}`, maxBytes, timeoutMs });
  if (!data || !Array.isArray(data.jobs)) throw new UpstreamError(`ashby/${board}: unexpected response (no jobs array)`, { code: 'bad_shape' });
  return data.jobs.filter((j) => j && j.isListed !== false).map(mapAshbyJob);
}

const INTERVALS = { YEAR: 'year', MONTH: 'month', WEEK: 'week', DAY: 'day', HOUR: 'hour' };

function ashbyInterval(s) {
  const m = String(s || '').toUpperCase().match(/(YEAR|MONTH|WEEK|DAY|HOUR)/);
  return m ? INTERVALS[m[1]] : 'year';
}

export function ashbySalary(comp) {
  if (!comp) return null;
  const pools = [];
  if (Array.isArray(comp.summaryComponents)) pools.push(comp.summaryComponents);
  if (Array.isArray(comp.compensationTiers)) {
    for (const t of comp.compensationTiers) if (t && Array.isArray(t.components)) pools.push(t.components);
  }
  for (const pool of pools) {
    const sal = pool.filter((c) => c && /salary/i.test(c.compensationType || '') && (c.minValue != null || c.maxValue != null));
    if (!sal.length) continue;
    const c = sal[0];
    const min = c.minValue != null ? Number(c.minValue) : Number(c.maxValue);
    const max = c.maxValue != null ? Number(c.maxValue) : Number(c.minValue);
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
      currency: (c.currencyCode || 'USD').toUpperCase(),
      interval: ashbyInterval(c.interval),
      text: str(comp.compensationTierSummary) || str(comp.scrapeableCompensationSalarySummary) || null,
    };
  }
  return null;
}

/**
 * Every salary component across compensation tiers, for normalize to pick the
 * one in the job location's currency ("Multiple Ranges" summaries are often
 * in another currency than the location).
 */
export function ashbyPayRanges(comp) {
  if (!comp || !Array.isArray(comp.compensationTiers)) return [];
  const out = [];
  for (const t of comp.compensationTiers) {
    for (const c of (t && Array.isArray(t.components) ? t.components : [])) {
      if (!c || !/salary/i.test(c.compensationType || '') || (c.minValue == null && c.maxValue == null)) continue;
      const min = Number(c.minValue ?? c.maxValue);
      const max = Number(c.maxValue ?? c.minValue);
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      const label = str(t.title) || str(t.tierSummary);
      out.push({ min: Math.min(min, max), max: Math.max(min, max), currency: (c.currencyCode || 'USD').toUpperCase(), interval: ashbyInterval(c.interval), ...(label ? { label: label.slice(0, 60) } : {}) });
    }
  }
  return out;
}

export function mapAshbyJob(j) {
  const html = j.descriptionHtml || '';
  const extraLocations = [];
  for (const s of Array.isArray(j.secondaryLocations) ? j.secondaryLocations : []) {
    const loc = str(typeof s === 'string' ? s : s && (s.location || (s.address && s.address.postalAddress && s.address.postalAddress.addressLocality)));
    if (loc && loc !== j.location && !extraLocations.includes(loc)) extraLocations.push(loc);
  }
  // D-4 (docs/QA.md): a role is remote when Ashby's workplaceType says Remote, or one of its
  // locations does. `isRemote: true` next to on-site-only locations (OpenAI flagged 502 of 833
  // that way) is not enough. A Remote workplace whose locations don't say so gets a "Remote"
  // location, so the location facet, the map's Remote bucket and the Remote filter agree.
  let remote = null;
  const wp = str(j.workplaceType) || '';
  const locRemote = [j.location, ...extraLocations].some((l) => /remote/i.test(l || ''));
  if (/remote/i.test(wp)) {
    remote = true;
    if (!locRemote) extraLocations.push('Remote');
  } else if (locRemote) remote = true;
  else if (wp || j.isRemote === false) remote = false;
  const salary = ashbySalary(j.compensation);
  if (salary && !salary.text) {
    salary.text = `${salary.min.toLocaleString('en-US')}–${salary.max.toLocaleString('en-US')} ${salary.currency}`;
  }
  return {
    sourceId: String(j.id ?? ''),
    title: str(j.title) || 'Untitled role',
    department: str(j.department),
    team: str(j.team),
    employmentType: humanEmployment(j.employmentType),
    locationText: str(j.location) || '',
    extraLocations,
    remote,
    html,
    text: str(j.descriptionPlain) || htmlToText(html),
    url: str(j.jobUrl) || str(j.applyUrl),
    updatedAt: str(j.publishedAt) || str(j.updatedAt),
    postedAt: isoOrNull(j.publishedAt), // F4
    reqId: null,
    salary,
    payRanges: ashbyPayRanges(j.compensation),
    compensationSummary: j.compensation ? str(j.compensation.compensationTierSummary) : null,
  };
}

function humanEmployment(t) {
  const s = str(t);
  if (!s) return null;
  const map = { FullTime: 'Full-time', PartTime: 'Part-time', Intern: 'Intern', Contract: 'Contract', Temporary: 'Temporary' };
  return map[s] || s;
}

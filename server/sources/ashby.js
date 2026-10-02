// Ashby job board adapter.
// API: https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
import { fetchJson, htmlToText, str } from './util.js';

export function ashbyUrl(board) {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
}

export async function fetchAshby(board) {
  const data = await fetchJson(ashbyUrl(board), { label: `ashby/${board}` });
  if (!data || !Array.isArray(data.jobs)) throw new Error(`ashby/${board}: unexpected response (no jobs array)`);
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

export function mapAshbyJob(j) {
  const html = j.descriptionHtml || '';
  const extraLocations = [];
  for (const s of Array.isArray(j.secondaryLocations) ? j.secondaryLocations : []) {
    const loc = str(typeof s === 'string' ? s : s && (s.location || (s.address && s.address.postalAddress && s.address.postalAddress.addressLocality)));
    if (loc && loc !== j.location && !extraLocations.includes(loc)) extraLocations.push(loc);
  }
  let remote = null;
  if (j.isRemote === true || /remote/i.test(j.workplaceType || '')) remote = true;
  else if (j.isRemote === false) remote = false;
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
    salary,
    compensationSummary: j.compensation ? str(j.compensation.compensationTierSummary) : null,
  };
}

function humanEmployment(t) {
  const s = str(t);
  if (!s) return null;
  const map = { FullTime: 'Full-time', PartTime: 'Part-time', Intern: 'Intern', Contract: 'Contract', Temporary: 'Temporary' };
  return map[s] || s;
}

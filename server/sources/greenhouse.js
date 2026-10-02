// Greenhouse job board adapter.
// API: https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
// `content` is entity-escaped HTML; decoded here. Salary is usually embedded in
// the description text (parsed later by normalize), except when the board
// exposes structured `pay_input_ranges` (pay transparency).
import { fetchJson, decodeHtmlContent, htmlToText, str } from './util.js';

export function greenhouseUrl(board) {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true&pay_transparency=true`;
}

export async function fetchGreenhouse(board) {
  const data = await fetchJson(greenhouseUrl(board), { label: `greenhouse/${board}` });
  if (!data || !Array.isArray(data.jobs)) throw new Error(`greenhouse/${board}: unexpected response (no jobs array)`);
  return data.jobs.map(mapGreenhouseJob);
}

function metaValue(metadata, re) {
  if (!Array.isArray(metadata)) return null;
  const m = metadata.find((x) => x && re.test(String(x.name || '')));
  if (!m || m.value == null) return null;
  return Array.isArray(m.value) ? m.value.join(', ') : String(m.value);
}

function payRangeSalary(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  const r = ranges.find((x) => x && (x.min_cents != null || x.max_cents != null));
  if (!r) return null;
  const min = r.min_cents != null ? Number(r.min_cents) / 100 : null;
  const max = r.max_cents != null ? Number(r.max_cents) / 100 : null;
  if (!Number.isFinite(min ?? max)) return null;
  const blurb = `${r.title || ''} ${r.blurb || ''}`.toLowerCase();
  const interval = /hour/.test(blurb) ? 'hour' : /month/.test(blurb) ? 'month' : 'year';
  const currency = (r.currency_type || 'USD').toUpperCase();
  const fmt = (n) => n.toLocaleString('en-US');
  const text = min != null && max != null && min !== max ? `${fmt(min)}–${fmt(max)} ${currency}` : `${fmt(min ?? max)} ${currency}`;
  return { min: min ?? max, max: max ?? min, currency, interval, text };
}

export function mapGreenhouseJob(j) {
  const html = decodeHtmlContent(j.content || '');
  const locationText = str(j.location && j.location.name) || '';
  const extraLocations = [];
  const lower = locationText.toLowerCase();
  for (const o of Array.isArray(j.offices) ? j.offices : []) {
    const cand = str(o && (o.location || o.name));
    if (cand && !lower.includes(cand.toLowerCase()) && !extraLocations.includes(cand)) extraLocations.push(cand);
  }
  const remoteMeta = metaValue(j.metadata, /remote|workplace/i);
  let remote = null;
  if (remoteMeta != null) {
    if (/^(yes|true|remote|fully remote)/i.test(remoteMeta)) remote = true;
    else if (/^(no|false|on-?site|in office)/i.test(remoteMeta)) remote = false;
  }
  return {
    sourceId: String(j.id ?? j.internal_job_id ?? ''),
    title: str(j.title) || 'Untitled role',
    department: str(Array.isArray(j.departments) && j.departments[0] && j.departments[0].name),
    team: null,
    employmentType: metaValue(j.metadata, /employment type|job type|commitment/i),
    locationText,
    extraLocations,
    remote,
    html,
    text: htmlToText(html),
    url: str(j.absolute_url),
    updatedAt: str(j.updated_at) || str(j.first_published),
    salary: payRangeSalary(j.pay_input_ranges),
    metadata: Array.isArray(j.metadata) ? j.metadata : [],
  };
}

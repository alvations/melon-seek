// Greenhouse job board adapter.
// API: https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
// `content` is entity-escaped HTML; decoded here. Salary is usually embedded in
// the description text (parsed later by normalize), except when the board
// exposes structured `pay_input_ranges` (pay transparency).
import { fetchJson, UpstreamError, decodeHtmlContent, htmlToText, str } from './util.js';

export function greenhouseUrl(board) {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true&pay_transparency=true`;
}

export async function fetchGreenhouse(board, { maxBytes, timeoutMs } = {}) {
  const data = await fetchJson(greenhouseUrl(board), { label: `greenhouse/${board}`, maxBytes, timeoutMs });
  if (!data || !Array.isArray(data.jobs)) throw new UpstreamError(`greenhouse/${board}: unexpected response (no jobs array)`, { code: 'bad_shape' });
  return data.jobs.map(mapGreenhouseJob);
}

function metaValue(metadata, re) {
  if (!Array.isArray(metadata)) return null;
  const m = metadata.find((x) => x && re.test(String(x.name || '')));
  if (!m || m.value == null) return null;
  return Array.isArray(m.value) ? m.value.join(', ') : String(m.value);
}

function rangeInterval(r) {
  const hint = `${r.title || ''} ${r.blurb || ''}`.toLowerCase();
  if (/hour/.test(hint)) return 'hour';
  if (/month/.test(hint)) return 'month';
  return 'year';
}

/**
 * `pay_input_ranges` (needs pay_transparency=true): [{min_cents, max_cents,
 * currency_type, title, blurb}], no interval field. Amounts are cents. With
 * several ranges (e.g. per location tier) the salary spans the overall min and
 * max of the ranges that share the first range's currency and interval.
 * Returns null when nothing usable is present (normalize then parses the text).
 */
export function payRangeSalary(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  const usable = ranges
    .filter((x) => x && (x.min_cents != null || x.max_cents != null))
    .map((x) => {
      const lo = x.min_cents != null ? Number(x.min_cents) / 100 : Number(x.max_cents) / 100;
      const hi = x.max_cents != null ? Number(x.max_cents) / 100 : lo;
      return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), currency: String(x.currency_type || 'USD').toUpperCase(), interval: rangeInterval(x), title: x.title };
    })
    .filter((x) => Number.isFinite(x.lo) && Number.isFinite(x.hi) && x.hi > 0);
  if (!usable.length) return null;
  const first = usable[0];
  const same = usable.filter((x) => x.currency === first.currency && x.interval === first.interval);
  const min = Math.min(...same.map((x) => x.lo));
  const max = Math.max(...same.map((x) => x.hi));
  const fmt = (n) => n.toLocaleString('en-US');
  let text = min !== max ? `${fmt(min)}–${fmt(max)} ${first.currency}` : `${fmt(min)} ${first.currency}`;
  if (first.interval !== 'year') text += ` per ${first.interval}`;
  if (same.length > 1) text += ` (${same.length} ranges)`;
  else if (first.title) text = `${first.title}: ${text}`;
  return { min, max, currency: first.currency, interval: first.interval, text };
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

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
  if (/week/.test(hint)) return 'week';
  if (/\bday\b|daily/.test(hint)) return 'day';
  if (/month/.test(hint)) return 'month';
  return 'year';
}

// ISO 4217 currencies without a minor unit: Greenhouse sends whole units in
// *_cents for these (real data: ¥20,454,000 arrived as min_cents 20454000).
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG', 'XAF', 'XOF', 'XPF', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'VUV']);
const MAX_TIER_SPAN = 3;

/** Short display label for a range title ("Annual Salary:" -> "Annual Salary"; sentences dropped). */
function rangeLabel(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim().replace(/[:\s]+$/, '');
  return t && t.length <= 60 ? t : null;
}

/**
 * Per-range list from `pay_input_ranges` (needs pay_transparency=true):
 * [{min_cents, max_cents, currency_type, title, blurb}], no interval field.
 * Amounts are cents, except zero-decimal currencies (JPY, KRW ...).
 */
export function payRanges(ranges) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .filter((x) => x && (x.min_cents != null || x.max_cents != null))
    .map((x) => {
      const currency = String(x.currency_type || 'USD').toUpperCase();
      const div = ZERO_DECIMAL.has(currency) ? 1 : 100;
      const lo = x.min_cents != null ? Number(x.min_cents) / div : Number(x.max_cents) / div;
      const hi = x.max_cents != null ? Number(x.max_cents) / div : lo;
      const label = rangeLabel(x.title);
      return { min: Math.min(lo, hi), max: Math.max(lo, hi), currency, interval: rangeInterval(x), ...(label ? { label } : {}) };
    })
    .filter((x) => Number.isFinite(x.min) && Number.isFinite(x.max) && x.max > 0);
}

/**
 * Structured salary from `pay_input_ranges`. With several ranges (e.g. per
 * location tier) the salary spans the overall min and max of the ranges that
 * share the first range's currency and interval, unless that span is more
 * than 3x (a unit/tier error would then pass as pay): the first range alone
 * is used. Returns null when nothing usable is present (normalize then parses
 * the text). The per-range list is mapGreenhouseJob's `payRanges`.
 */
export function payRangeSalary(ranges) {
  const usable = payRanges(ranges);
  if (!usable.length) return null;
  const first = usable[0];
  let same = usable.filter((x) => x.currency === first.currency && x.interval === first.interval);
  const lo = Math.min(...same.map((x) => x.min));
  const hi = Math.max(...same.map((x) => x.max));
  if (same.length > 1 && lo > 0 && hi / lo > MAX_TIER_SPAN) same = [first];
  const min = Math.min(...same.map((x) => x.min));
  const max = Math.max(...same.map((x) => x.max));
  const fmt = (n) => n.toLocaleString('en-US');
  let text = min !== max ? `${fmt(min)}–${fmt(max)} ${first.currency}` : `${fmt(min)} ${first.currency}`;
  if (first.interval !== 'year') text += ` per ${first.interval}`;
  if (same.length > 1) text += ` (${same.length} ranges)`;
  else if (first.label) text = `${first.label}: ${text}`;
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
    payRanges: payRanges(j.pay_input_ranges),
    metadata: Array.isArray(j.metadata) ? j.metadata : [],
  };
}

// Lever postings adapter.
// API: https://api.lever.co/v0/postings/{board}?mode=json
import { fetchJson, UpstreamError, htmlToText, str, isoOrNull } from './util.js';

export function leverUrl(board) {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;
}

export async function fetchLever(board, { maxBytes, timeoutMs } = {}) {
  const data = await fetchJson(leverUrl(board), { label: `lever/${board}`, maxBytes, timeoutMs });
  if (!Array.isArray(data)) throw new UpstreamError(`lever/${board}: unexpected response (expected an array of postings)`, { code: 'bad_shape' });
  return data.map(mapLeverJob);
}

function leverInterval(s) {
  const v = String(s || '').toLowerCase();
  if (/hour/.test(v)) return 'hour';
  if (/month/.test(v)) return 'month';
  if (/week/.test(v)) return 'week';
  if (/day/.test(v)) return 'day';
  return 'year';
}

export function mapLeverJob(p) {
  const cats = p.categories || {};
  const parts = [];
  if (p.description) parts.push(p.description);
  for (const l of Array.isArray(p.lists) ? p.lists : []) {
    if (!l) continue;
    parts.push(`<h3>${l.text || ''}</h3><ul>${l.content || ''}</ul>`);
  }
  if (p.additional) parts.push(p.additional);
  const html = parts.join('\n');

  const locationText = str(cats.location) || '';
  const extraLocations = [];
  for (const l of Array.isArray(cats.allLocations) ? cats.allLocations : []) {
    const s = str(l);
    if (s && s !== locationText && !extraLocations.includes(s)) extraLocations.push(s);
  }
  let remote = null;
  if (/remote/i.test(p.workplaceType || '')) remote = true;
  else if (/on-?site|hybrid/i.test(p.workplaceType || '')) remote = false;

  let salary = null;
  const sr = p.salaryRange;
  if (sr && (sr.min != null || sr.max != null)) {
    const min = Number(sr.min ?? sr.max);
    const max = Number(sr.max ?? sr.min);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const currency = (sr.currency || 'USD').toUpperCase();
      salary = {
        min: Math.min(min, max), max: Math.max(min, max), currency, interval: leverInterval(sr.interval),
        text: `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')} ${currency}${sr.interval ? ` ${sr.interval}` : ''}`,
      };
    }
  }
  const text = [p.descriptionPlain, htmlToText(parts.slice(p.description ? 1 : 0).join('\n'))].filter(Boolean).join('\n\n') || htmlToText(html);
  return {
    sourceId: String(p.id ?? ''),
    title: str(p.text) || 'Untitled role',
    department: str(cats.department),
    team: str(cats.team),
    employmentType: str(cats.commitment),
    locationText,
    extraLocations,
    remote,
    html,
    text,
    url: str(p.hostedUrl) || str(p.applyUrl),
    updatedAt: p.createdAt ? new Date(Number(p.createdAt)).toISOString() : null,
    postedAt: isoOrNull(p.createdAt), // F4
    reqId: null,
    salary,
  };
}

// "As of" labels for the numbers the UI shows (docs/DATA_FRESHNESS.md).
//
// Loads the published data-freshness registry once: `api/freshness.json`, which
// scripts/build-static.js writes for the static site and server/index.js serves
// at /api/freshness(.json) (both from data/freshness.json through
// scripts/refresh/derived.js#publicFreshness). Every entry is
//   { id, description, asOf, taxYear?, source: { name, url }, cadence, lastChecked, stale, staleAfter }
// keyed by the stable registry id (fx-per-usd, rents-1br-quoted, tax-us-ca, ...).
//
//   loadFreshness()            -> Promise<doc|null>  (cached; null when the file is missing)
//   freshnessDoc()             -> the loaded doc or null (sync)
//   entry(id) / asOf(id)       -> registry entry / its asOf ('YYYY-MM-DD') or null
//   isStale(id, now?)          -> true when past cadence + grace (the viewer's clock, else the build's flag)
//   formatAsOf(date, style?)   -> 'Jul 2026' ('month'), '1 Jul 2026' ('day'), '2026' ('year')
//   asOfLabel(id, opts?)       -> 'as of Jul 2026' (+ ', update due' when stale and opts.status), or '' / opts.fallback
//   juiceAsOf(best)            -> [{ key, label, asOf, ids, stale, ratioAsOf?, bedrooms? }] for a computeJuice result with inputs
//   juiceAsOfText(best)        -> 'Data as of: rent Sep 2026 · living costs Sep 2026 · exchange rates Jul 2026 · tax US 2026, CA 2025'
//   juiceSpanText(bests)       -> 'As of: rent Aug–Sep 2026 · living costs Sep 2026 · exchange rates Jul 2026 · tax 2025–2026' (map legend)
//   marketAsOfText(market, slugs) -> 'Postings as of 9 Oct 2026 · exchange rates as of Jul 2026'
//   compstimateAsOfText({ fetchedAt, meta }) -> 'Postings as of 9 Oct 2026 · accuracy tested 9 Oct 2026'
//
// P-14 (persona review 2026-10-10): job seekers need the date, not our maintenance status, so the
// lines say "as of <month year>" only. `status: true` adds "(update due)" for past-due datasets,
// for maintenance pages (the methodology page shows it in its own sources table).
// P-13: a 2- or 3-bedroom rent is the 1-bedroom rent × an official bedroom ratio, so its line
// names both dates: "rent Sep 2026 (sized for 2 bedrooms with Oct 2025 figures)". The 1-bedroom
// date comes from server/juice.js inputs.rent.base; without it the line names the ratio only.
//
// Degrades gracefully: without the registry (old build, fetch failed) every label
// falls back to the dates the data itself carries (juice inputs, market.json), and a
// label with no date at all is '' so callers can skip it. Pure functions; nothing
// here touches the DOM, so it runs in Node tests too.

export const FRESHNESS_URL = 'api/freshness.json';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

let doc = null;
let byId = new Map();
let pending = null;
let failed = false;

/** Use this registry document (tests, or a caller that already fetched it). null clears it. */
export function setFreshness(next) {
  doc = next && typeof next === 'object' && Array.isArray(next.entries) && next.entries.length ? next : null;
  byId = new Map((doc ? doc.entries : []).filter((e) => e && e.id).map((e) => [e.id, e]));
  return doc;
}

/**
 * Fetch the published registry once (relative URL, so it works under the Pages sub-path
 * and in server mode). Resolves to the doc, or null when it is missing or invalid; a
 * failure is remembered until `refresh: true`.
 */
export function loadFreshness({ fetchImpl = globalThis.fetch, url = FRESHNESS_URL, refresh = false } = {}) {
  if (refresh && failed) pending = null;
  if (!pending) {
    failed = false;
    pending = Promise.resolve()
      .then(() => (typeof fetchImpl === 'function' ? fetchImpl(url, { headers: { accept: 'application/json' } }) : null))
      .then((res) => (res && res.ok ? res.json() : null))
      .catch(() => null)
      .then((json) => { const d = setFreshness(json); failed = !d; return d; });
  }
  return pending;
}

export function freshnessDoc() { return doc; }
export function entry(id) { return byId.get(id) || null; }
export function asOf(id) { const e = entry(id); return (e && e.asOf) || null; }

function isoDay(d) { return new Date(d).toISOString().slice(0, 10); }

/** Stale at `now`: past the entry's staleAfter date (viewer's clock), else the build-time flag. */
export function isStale(id, now = new Date()) {
  const e = entry(id);
  if (!e) return false;
  if (e.staleAfter && /^\d{4}-\d{2}-\d{2}$/.test(e.staleAfter)) return isoDay(now) > e.staleAfter;
  return !!e.stale;
}

/**
 * Human date for an as-of value. ISO 'YYYY', 'YYYY-MM', 'YYYY-MM-DD' or a timestamp;
 * anything else (tax years like '2025/26', 'FY2026-27') is returned trimmed, without
 * parentheticals. style: 'month' (default, 'Jul 2026'), 'day' ('1 Jul 2026'), 'year'.
 */
export function formatAsOf(value, style = 'month') {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) value = new Date(value).toISOString();
  const s = String(value).trim();
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (!m) return s.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const [, y, mo, d] = m;
  if (style === 'year' || !mo) return y;
  const mon = MONTHS[Number(mo) - 1];
  if (!mon) return y;
  if (style === 'day' && d) return `${Number(d)} ${mon} ${y}`;
  return `${mon} ${y}`;
}

/** 'as of Jul 2026' for a registry id ('' or opts.fallback without one); ', update due' when stale and `status`. */
export function asOfLabel(id, { fallback = null, style = 'month', now = new Date(), prefix = 'as of ', status = false } = {}) {
  const e = entry(id);
  const when = e ? (e.asOf || null) : fallback;
  if (!when) return '';
  return `${prefix}${formatAsOf(when, style)}${status && e && isStale(id, now) ? ', update due' : ''}`;
}

/* ------------------------------------------------------------------ Juice */

/** The official bedroom-ratio source family behind an estimated 2-/3-bedroom rent, from its source URL (scripts/refresh/rents.js ids). */
const RATIO_SOURCE_IDS = [
  [/huduser\.gov|services\.arcgis\.com\/VTyQ9soqVukalItT/, 'rents-us-hud-fmr'],
  [/ons\.gov\.uk/, 'rents-gb-ons'],
  [/cso\.ie/, 'rents-ie-rtb'],
  [/stadt-zuerich\.ch/, 'rents-ch-zurich'],
  [/data\.gouv\.fr|observatoires-des-loyers\.org/, 'rents-fr-olap'],
  [/statcan\.gc\.ca/, 'rents-ca-statcan'],
  [/data\.gov\.sg/, 'rents-sg-hdb'],
  [/dcj\.nsw\.gov\.au/, 'rents-nsw-official'],
];

/** Registry ids behind the rent a juice result used (docs/DATA_FRESHNESS.md ids). */
function rentIds(rent) {
  if (!rent || rent.basis === 'override') return [];
  const name = (rent.source && rent.source.name) || '';
  const url = (rent.source && rent.source.url) || '';
  if (rent.class === 'official' && /\bNSW\b/.test(name)) return ['rents-nsw-official'];
  const ids = ['rents-1br-quoted'];
  if ((rent.bedrooms || 1) > 1 || rent.class === 'estimate' || rent.method) {
    ids.push('rents-bedroom-ratios');
    const fam = RATIO_SOURCE_IDS.find(([re]) => re.test(url));
    if (fam && !ids.includes(fam[1])) ids.push(fam[1]);
  }
  return ids;
}

/** 'US' -> 'US'; 'US-CA' -> 'CA'; 'US-LOCAL-NYC' -> 'NYC'; 'GB-SCT' -> 'SCT'. */
export function taxLabel(key) {
  const parts = String(key || '').split('-');
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}
const taxId = (key) => `tax-${String(key).toLowerCase()}`;

/**
 * As-of items for one computeJuice result (job.juice.best, which keeps `inputs`).
 * Rent and living costs carry the city record's own date (cities.json, per city); FX and
 * tax come from the registry, with the juice inputs as the fallback. Each item says
 * whether any registry entry behind it is past due.
 */
export function juiceAsOf(best, { now = new Date() } = {}) {
  const i = best && best.inputs;
  if (!i) return [];
  const out = [];
  const add = (key, label, when, ids) => {
    if (!when) return;
    out.push({ key, label, asOf: when, ids, stale: ids.some((id) => isStale(id, now)) });
  };
  const r = i.rent;
  const rIds = rentIds(r);
  if (rIds.length) {
    const own = (r.source && r.source.asOf) || asOf(rIds[0]);
    // An estimated 2- or 3-bedroom rent: its source date is the bedroom ratio's, not the rent's.
    if ((r.bedrooms || 1) > 1 && r.class === 'estimate' && r.basis !== 'outside' && own) {
      out.push({ key: 'rent', label: 'rent', asOf: (r.base && r.base.asOf) || null, ratioAsOf: own, bedrooms: r.bedrooms, ids: rIds, stale: rIds.some((id) => isStale(id, now)) });
    } else add('rent', 'rent', own, rIds);
  }
  const lIds = ['cost-index', 'nyc-basket', ...(i.household && i.household.key && i.household.key !== 'single' ? ['living-scale'] : [])];
  add('living', 'living costs', (i.costIndex && i.costIndex.source && i.costIndex.source.asOf) || asOf('cost-index'), lIds);
  if (i.fx && i.fx.currency && String(i.fx.currency).toUpperCase() !== 'USD') add('fx', 'exchange rates', asOf('fx-per-usd') || i.fx.asOf, ['fx-per-usd']);
  for (const s of (i.tax && i.tax.sources) || []) {
    if (!s || !s.key) continue;
    const e = entry(taxId(s.key));
    add(`tax:${s.key}`, taxLabel(s.key), e ? (e.taxYear != null ? String(e.taxYear) : e.asOf) : s.asOf, [taxId(s.key)]);
  }
  return out;
}

/** '(sized for 2 bedrooms with Oct 2025 figures)' for an estimated bigger home's rent. */
const sizedText = (bedrooms, ratioWhen) => `sized for ${Number.isFinite(bedrooms) ? `${bedrooms} bedrooms` : 'bigger homes'} with ${ratioWhen} figures`;

/** 'rent Sep 2026 (sized for 2 bedrooms with Oct 2025 figures)', or 'rent Sep 2026'. */
function rentText(x, when, ratioWhen, due = '') {
  if (!ratioWhen) return `rent ${when}${due}`;
  return when ? `rent ${when}${due} (${sizedText(x.bedrooms, ratioWhen)})` : `rent ${sizedText(x.bedrooms, ratioWhen)}${due}`;
}

/** One line for the drawer's Juice block; '' when nothing is dated. `status: true` marks past-due inputs. */
export function juiceAsOfText(best, { now = new Date(), status = false } = {}) {
  const items = juiceAsOf(best, { now });
  if (!items.length) return '';
  const due = (x) => (status && x.stale ? ' (update due)' : '');
  const fmt = (x) => `${formatAsOf(x.asOf)}${due(x)}`;
  const parts = items.filter((x) => !x.key.startsWith('tax:'))
    .map((x) => (x.key === 'rent' ? rentText(x, x.asOf ? formatAsOf(x.asOf) : '', x.ratioAsOf ? formatAsOf(x.ratioAsOf) : '', due(x)) : `${x.label} ${fmt(x)}`));
  const tax = items.filter((x) => x.key.startsWith('tax:'));
  if (tax.length) parts.push(`tax ${tax.map((x) => `${x.label} ${fmt(x)}`).join(', ')}`);
  return `Data as of: ${parts.join(' · ')}`;
}

/** 'Aug–Sep 2026', 'Dec 2025–Feb 2026', 'Sep 2026' for a list of ISO dates/months ('' when none). */
export function monthSpan(list) {
  const months = [...new Set(list.filter(Boolean).map((d) => (/^\d{4}-\d{2}/.exec(String(d)) || [])[0]).filter(Boolean))].sort();
  if (!months.length) return '';
  const a = formatAsOf(months[0]);
  const b = formatAsOf(months[months.length - 1]);
  if (a === b) return a;
  const [am, ay] = a.split(' ');
  const [bm, by] = b.split(' ');
  return ay === by ? `${am}–${bm} ${by}` : `${a}–${b}`;
}

/**
 * One line for many juice results (the map's Juice legend): the span of each input's as-of
 * across the jobs shown, e.g. 'As of: rent Aug–Sep 2026 · living costs Sep 2026 · FX Jul 2026 ·
 * tax 2025–2026', plus ' · some inputs due for update' when a registry entry behind them is stale.
 */
export function juiceSpanText(results, { now = new Date(), status = false } = {}) {
  const rent = [];
  const ratios = [];
  const beds = new Set();
  const living = [];
  const fx = [];
  const years = [];
  let stale = false;
  for (const b of Array.isArray(results) ? results : []) {
    for (const x of juiceAsOf(b, { now })) {
      if (x.stale) stale = true;
      if (x.key === 'rent') {
        if (x.asOf) rent.push(x.asOf);
        if (x.ratioAsOf) { ratios.push(x.ratioAsOf); beds.add(x.bedrooms); }
      } else if (x.key === 'living') living.push(x.asOf);
      else if (x.key === 'fx') fx.push(x.asOf);
      else years.push(...(String(x.asOf).match(/(?:19|20)\d\d/g) || []));
    }
  }
  const parts = [];
  if (rent.length || ratios.length) parts.push(rentText({ bedrooms: beds.size === 1 ? [...beds][0] : 'more' }, monthSpan(rent), monthSpan(ratios)));
  if (living.length) parts.push(`living costs ${monthSpan(living)}`);
  if (fx.length) parts.push(`exchange rates ${monthSpan(fx)}`);
  const ys = [...new Set(years)].sort();
  if (ys.length) parts.push(`tax ${ys[0] === ys[ys.length - 1] ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`}`);
  if (!parts.length) return '';
  return `As of: ${parts.join(' · ')}${status && stale ? ' · some inputs due for update' : ''}`;
}

/* ------------------------------------------------------------------ comps, Compstimate */

function dateSpan(list, style = 'day') {
  const days = [...new Set(list.filter((d) => d != null && d !== '').map((d) => { const t = typeof d === 'number' ? d : Date.parse(d); return Number.isFinite(t) ? isoDay(t) : null; }).filter(Boolean))].sort();
  if (!days.length) return '';
  const a = formatAsOf(days[0], style);
  const b = formatAsOf(days[days.length - 1], style);
  return a === b ? a : `${a} to ${b}`;
}

/** 'Postings as of 9 Oct 2026 · exchange rates as of Jul 2026' for market comps (rows' companies only, when given). */
export function marketAsOfText(market, slugs = null, { status = false } = {}) {
  if (!market || typeof market !== 'object') return '';
  const want = slugs ? new Set(slugs) : null;
  const companies = (Array.isArray(market.companies) ? market.companies : []).filter((c) => c && (!want || want.has(c.slug)));
  const posts = dateSpan(companies.map((c) => c.fetchedAt));
  const fx = asOf('fx-per-usd') || (market.fx && market.fx.asOf) || null;
  const parts = [];
  if (posts) parts.push(`Postings as of ${posts}`);
  if (fx) parts.push(`exchange rates as of ${formatAsOf(fx)}${status && isStale('fx-per-usd') ? ' (update due)' : ''}`);
  return parts.join(' · ');
}

/** 'Postings as of 9 Oct 2026 · accuracy tested 9 Oct 2026' for a Compstimate estimate on one board. */
export function compstimateAsOfText({ fetchedAt = null, meta = null, status = false } = {}) {
  const parts = [];
  const posts = dateSpan([fetchedAt]);
  if (posts) parts.push(`Postings as of ${posts}`);
  const bt = meta && typeof meta === 'object' ? ('compstimate' in meta ? meta.compstimate : meta) : null;
  const tested = bt && bt.computedAt ? dateSpan([bt.computedAt]) : '';
  if (tested) parts.push(`accuracy tested ${tested}`);
  const model = entry('compstimate-model');
  if (model && model.asOf) parts.push(`level model ${formatAsOf(model.asOf)}${status && isStale('compstimate-model') ? ' (update due)' : ''}`);
  return parts.join(' · ');
}

/** Days since an as-of date (null when unknown); for "N days old" style labels. */
export function ageDays(value, now = new Date()) {
  const t = Date.parse(/^\d{4}-\d{2}$/.test(String(value)) ? `${value}-01` : String(value));
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY_MS) : null;
}

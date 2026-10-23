// melon-seek product features: shared pure helpers (stats, FX, formatting) and
// a tiny DOM builder. Pure functions work in Node (node:test) and the browser;
// DOM helpers only touch `document` when called.
//
// FX / money formatting defer to public/viz/palette.js when it provides them
// (so the whole app shows identical numbers) and fall back to local tables.

import * as palette from '../viz/palette.js';

// ---------------------------------------------------------------------------
// FX
// ---------------------------------------------------------------------------

/**
 * FX to USD: exactly palette.js's table (the app's single source), plus a currency it
 * lacks. No rate here may disagree with the palette (task force: one FX table).
 */
export const FX_FALLBACK = Object.freeze({ ...(palette.FX_TO_USD || { USD: 1 }), CNY: 0.1491 });

/**
 * Convert an amount to approximate USD. Uses palette.toUSD when palette knows
 * the currency, else FX_FALLBACK. Unknown currency or bad amount -> null
 * (callers drop such jobs rather than mixing currencies).
 */
export function toUSD(amount, currency = 'USD') {
  const a = Number(amount);
  if (amount == null || !Number.isFinite(a)) return null;
  const c = String(currency || 'USD').toUpperCase();
  if (c === 'USD') return a;
  const paletteKnows = typeof palette.toUSD === 'function' &&
    (typeof palette.hasFx === 'function' ? palette.hasFx(c) : palette.FX_TO_USD?.[c] != null);
  if (paletteKnows) {
    const v = palette.toUSD(a, c);
    if (Number.isFinite(v)) return v;
  }
  const r = FX_FALLBACK[c];
  return r == null ? null : a * r;
}

/**
 * A job's annual pay in USD: { min, mid, max, currency, converted } or null when
 * the job has no usable salary. Uses salary.mid (contract) and falls back to
 * (min+max)/2. Defensive: values that are clearly hourly/monthly get annualized.
 */
export function salaryUSD(job) {
  const s = job && job.salary;
  if (!s) return null;
  let min = num(s.min), max = num(s.max), mid = num(s.mid);
  if (mid == null) mid = min != null && max != null ? (min + max) / 2 : (min ?? max);
  if (mid == null || mid <= 0) return null;
  if (min == null) min = mid;
  if (max == null) max = mid;
  const interval = String(s.interval || 'year').toLowerCase();
  const k = mid < 1000 && /hour/.test(interval) ? 2080 : mid < 30000 && /month/.test(interval) ? 12 : 1;
  const cur = String(s.currency || 'USD').toUpperCase();
  const f = (v) => toUSD(v * k, cur);
  const out = { min: f(Math.min(min, max)), mid: f(mid), max: f(Math.max(min, max)), currency: cur, converted: cur !== 'USD' };
  return out.mid == null ? null : out;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Kinds of pay (shared decisions 3 and 4 of the 2026-10-10 fix lanes)
// ---------------------------------------------------------------------------

/** How on-target earnings are named to people (never "base pay"). */
export const OTE_LABEL = 'On-target earnings (base plus commission at target)';

/**
 * On-target earnings: the posting says its range is base plus commission at target (Anthropic
 * sales postings say "On Target Earnings"). server/salary.js sets salary.kind = 'ote'. It is
 * compared only with other on-target earnings, never pooled with base pay.
 */
export function isOTE(job) { return job?.salary?.kind === 'ote'; }

/** 'ote' for on-target earnings, else 'base'. */
export function payKind(job) { return isOTE(job) ? 'ote' : 'base'; }

/** Units pay for a programme is posted in that are not a year (salary.originalInterval). */
const TERM_UNITS = new Set(['hour', 'day', 'week', 'month']);
/**
 * MR-38 (fix-mr-3): an internship, fellowship, co-op, residency or apprenticeship (level 'Intern') paid by the hour,
 * day, week or month whose posting gives no length (no salary.termWeeks). Its pay is for a term of unstated length:
 * shown as posted ("$6,688–10,800 a month"), never as a yearly salary. On the 2026-10-16 crawl: 180 on the big-tech
 * boards and Anduril (Amazon 91, Meta 35, NVIDIA 34, Microsoft 14, Anduril 5, Apple 1), and Palantir 35, Shield AI 6,
 * xAI 4. Part-time hourly pay (salary.partTime: Amazon's other 2) is shown as its hourly rate already, so it is left to
 * that rule.
 */
export function isTermUnstated(job) {
  const s = job?.salary;
  return !!s && job.seniority === 'Intern' && !(Number(s.termWeeks) > 0) && s.kind !== 'stipend' && s.partTime !== true
    && TERM_UNITS.has(s.originalInterval);
}

/**
 * MR-28 (fix-viz-5): the base-pay rule for every median the browser draws (the chart's rows and caption, the stats
 * line, the map's pins and Remote button, Insights). Why a posted figure is not a posted base-pay range, or null when
 * it is one, in this order (a posting in more than one counts once):
 * - 'minimum': the posting states its figure as the minimum base pay (salary.kind 'minimum', Amazon's "from €46K");
 * - 'shiftPay': the hourly figure includes the highest shift differential (salary.includesShiftDifferential);
 * - 'partTime': part-time pay (salary.partTime), annualized at 2,080 hours.
 * The same rule as scripts/build-market.js notBasePay, which keeps these out of the comparison cells. The postings
 * stay on every chart and list, at their posted pay; only the medians leave them out (and say so). Pure; reads
 * only job.salary.
 */
export function notBasePay(job) {
  const s = job && job.salary;
  if (!s) return null;
  if (s.kind === 'minimum') return 'minimum';
  if (s.includesShiftDifferential === true) return 'shiftPay';
  if (s.partTime === true) return 'partTime';
  return null;
}

/**
 * Pay for a fixed term (a 12-week internship, a 4-month fellowship): salary.termWeeks when the
 * posting states the length, a stipend, or (MR-38) an internship paid by the hour, day, week or
 * month whose length the posting doesn't give. Never a plain yearly salary.
 */
export function isFixedTerm(job) {
  const s = job?.salary;
  return !!s && (Number(s.termWeeks) > 0 || s.kind === 'stipend' || isTermUnstated(job));
}

/**
 * Internships and fixed-term programmes. Their pay is compared only with each other, and
 * full-time comparisons leave them out (persona review 2026-10-10: an intern estimate built from
 * full-time pay; "xAI · Business operations · $52K" from two hourly internships).
 */
export function isInternLike(job) { return job?.seniority === 'Intern' || isFixedTerm(job); }

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function finite(values) {
  const out = [];
  for (const v of values || []) {
    const n = typeof v === 'number' ? (Number.isFinite(v) ? v : null) : num(v);
    if (n != null) out.push(n);
  }
  return out;
}

/**
 * Linear-interpolated percentile (same as numpy's default / R type 7).
 * p in [0,1]. Non-finite values are ignored. Empty -> null.
 *   percentile([1,2,3,4], 0.5) === 2.5
 */
export function percentile(values, p) {
  const v = finite(values).sort((a, b) => a - b);
  if (!v.length) return null;
  const t = Math.max(0, Math.min(1, Number(p) || 0));
  const h = (v.length - 1) * t;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return v[lo] + (v[hi] - v[lo]) * (h - lo);
}

export function median(values) { return percentile(values, 0.5); }

/**
 * MR-39 (fix-mr-3): the pay currency a headline median is for. With pay in two or more currencies in view, the most
 * common one (USD on a tie; a missing currency is USD), which is the chart rows' rule (chart.js mainBasis, V-21), so
 * the stats line, Insights' tiles and the rows compare one country's pay. null with one currency or none: the median
 * then needs no basis. `currencies`: one entry per posting.
 *   mainPayCurrency(['USD', 'USD', 'EUR']) -> 'USD'; mainPayCurrency(['USD']) -> null
 */
export function mainPayCurrency(currencies) {
  const n = new Map();
  for (const c of currencies || []) { const k = String(c || 'USD').toUpperCase(); n.set(k, (n.get(k) || 0) + 1); }
  if (n.size < 2) return null;
  return [...n].sort((a, b) => b[1] - a[1] || (a[0] === 'USD' ? -1 : b[0] === 'USD' ? 1 : 0))[0][0];
}

/**
 * BN-2, BN-4 (fix-app-6): the figure a headline median is (the stats line, Insights' tiles, the chart's caption and the
 * map's pins use it, so they agree). `pool`: one entry per posting whose pay counts, `{ usd, cur, hourly }`: its
 * approx-USD yearly midpoint, its pay currency, and `hourly` for part-time pay posted by the hour (its yearly figure is a
 * year if full-time, 2,080 hours).
 * - The median is MR-39's: with two or more currencies, of the main one's postings (`basis`, mainPayCurrency), and
 *   `left` counts the others.
 * - It is given in the currency of the postings it is of (`cur`), as the cards show their pay: a view paid in Canadian
 *   dollars reads CA$101K, never a bare "$" for converted pay. `local` holds the median and quartiles in `cur` (a year).
 * - `perHour` when every figure is part-time hourly pay: the median is written per hour, as posted ("$28.41/hour").
 *   `fullTime` when only some are: the yearly figure is then partly "a year if full-time".
 * -> { basis, cur, n, left, median, p25, p75 (approx USD a year, for positions and colours), local, perHour, fullTime }
 */
export function headlineMedian(pool) {
  const all = (pool || []).filter((x) => x && x.usd != null && Number.isFinite(x.usd));
  const cur0 = (x) => String(x.cur || 'USD').toUpperCase();
  const basis = mainPayCurrency(all.map(cur0));
  const use = basis ? all.filter((x) => cur0(x) === basis) : all;
  const cur = basis || (use.length ? cur0(use[0]) : 'USD');
  const v = use.map((x) => x.usd).sort((a, b) => a - b);
  const q = (p) => (v.length ? percentile(v, p) : null);
  const median = q(0.5), p25 = q(0.25), p75 = q(0.75);
  const per = palette.FX_PER_USD?.[cur];
  const back = (x) => (x == null ? null : per == null ? x : x * per); // toUSD's inverse (a currency with no rate was never converted)
  const hourly = use.filter((x) => x.hourly).length;
  return { basis, cur, n: v.length, left: all.length - use.length, median, p25, p75, local: { median: back(median), p25: back(p25), p75: back(p75) },
    perHour: use.length > 0 && hourly === use.length, fullTime: hourly > 0 && hourly < use.length };
}

/**
 * BN-2, BN-4: a headlineMedian figure as the cards write pay: "CA$101K", "€81K", "PLN 280K", "$149K"; per hour as posted
 * when `h.perHour` ("$28.41/hour"). `v` is in `h.cur`, a year (default: the median).
 */
export function medianText(h, v = h?.local?.median) {
  if (v == null || !Number.isFinite(v)) return '—';
  const cur = h?.cur || 'USD';
  const yearly = typeof palette.formatCurrency === 'function' ? palette.formatCurrency(v, cur) : formatMoney(v);
  if (!h?.perHour) return yearly;
  const sym = yearly.replace(/[-\d.,]+[KM]?$/, '');
  return `${sym}${(v / 2080).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hour`;
}

const CURRENCY_WORDS = {
  USD: 'US dollars', CAD: 'Canadian dollars', EUR: 'euros', GBP: 'pounds', PLN: 'złoty', CHF: 'Swiss francs', INR: 'rupees',
  JPY: 'yen', AUD: 'Australian dollars', SGD: 'Singapore dollars', MXN: 'Mexican pesos', BRL: 'reais', ILS: 'shekels',
  SEK: 'Swedish kronor', DKK: 'Danish kroner', NOK: 'Norwegian kroner', CZK: 'Czech koruna', RON: 'lei', KRW: 'won',
  HKD: 'Hong Kong dollars', TWD: 'Taiwan dollars', NZD: 'New Zealand dollars', AED: 'dirhams',
};
/** "Canadian dollars", "euros", "US dollars": a currency in a sentence (its code when it has no name here). */
export function currencyWords(cur) {
  const c = String(cur || 'USD').toUpperCase();
  return CURRENCY_WORDS[c] || c;
}

/**
 * Weighted percentile over [value, weight] pairs. Each value sits at the centre
 * of its weight mass ((cum - w/2) / W) and we interpolate between neighbours;
 * below the first / above the last centre clamps to the extreme value.
 * Equal weights reproduce the Hazen percentile. Empty -> null.
 */
export function weightedPercentile(pairs, p) {
  const v = (pairs || [])
    .filter((x) => x && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] > 0)
    .sort((a, b) => a[0] - b[0]);
  if (!v.length) return null;
  if (v.length === 1) return v[0][0];
  const W = v.reduce((s, x) => s + x[1], 0);
  const pos = [];
  let c = 0;
  for (const [, w] of v) { pos.push((c + w / 2) / W); c += w; }
  const t = Math.max(0, Math.min(1, Number(p) || 0));
  if (t <= pos[0]) return v[0][0];
  const last = v.length - 1;
  if (t >= pos[last]) return v[last][0];
  let i = 0;
  while (i < last && pos[i + 1] < t) i++;
  const span = pos[i + 1] - pos[i];
  const f = span > 0 ? (t - pos[i]) / span : 0;
  return v[i][0] + (v[i + 1][0] - v[i][0]) * f;
}

/** Nice axis ticks (delegates to palette.niceTicks when present). */
export function niceTicks(lo, hi, count = 5) {
  if (typeof palette.niceTicks === 'function') return palette.niceTicks(lo, hi, count);
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let x = start; x <= end + step * 1e-9; x += step) ticks.push(+x.toFixed(6));
  return { ticks, step, start, end };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 352500 -> "$352K" (palette.formatMoney when available). null -> "—". */
export function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (typeof palette.formatMoney === 'function') return palette.formatMoney(n);
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 999500) { const m = a / 1e6; return `${sign}$${m >= 10 ? Math.round(m) : +m.toFixed(1)}M`; }
  if (a >= 1000) return `${sign}$${Math.round(a / 1000 - 1e-9)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** Signed money delta: 42000 -> "+$42K", -18000 -> "−$18K" (true minus), ~0 -> "±$0". */
export function formatDelta(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < 500) return '±$0';
  return (n > 0 ? '+' : '−') + formatMoney(Math.abs(n));
}

export function formatPct(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const p = x * 100;
  return (p > 0 && p < 1 ? '<1' : String(Math.round(p))) + '%';
}

// M-23: big counts with thousands separators ("3,848 salaried roles"), as app.js writes them.
export const fmtCount = (n) => (typeof n === 'number' ? n.toLocaleString() : String(n ?? ''));
export function plural(n, word, many = word + 's') { return `${fmtCount(n)} ${n === 1 ? word : many}`; }

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/** Display/filter key for a Location: city (or name); remote entries -> "Remote". */
export function locationKey(loc) {
  if (!loc) return null;
  if (loc.remote) return 'Remote';
  return loc.city || loc.name || null;
}

/**
 * The locations a posting's pay applies to: those in a country that uses the pay's currency.
 * A USD range on a role listed in Costa Mesa, Seattle and Sydney is US pay, so it says nothing
 * about Sydney (persona review 2026-10-10: a "Sydney median" built from US contractor pay).
 * Locations without a country (remote) count. When no location uses the currency, or the job
 * has no pay, every location is returned, since the posting does not say which one is meant.
 * Fix wave 4 narrows it twice, before the currency test:
 *   - DQ-27/DQ-28: when the adapter knows which places the pay was posted for (salary.places, or
 *     the places of salary.ranges), only those: Apple's Cupertino range says nothing about the
 *     requisition's Austin listing, for which Apple posts no pay;
 *   - VT-5: when the pay line names its country (salary.country, "across Ireland is €…"), only
 *     places in that country: Ireland's euro range is not Spain's.
 * Each narrowing is skipped when it would leave no place.
 */
export function payLocations(job) {
  const locs = job?.locations || [];
  const sal = job?.salary;
  const cur = String(sal?.currency || '').toUpperCase();
  if (!cur || !locs.length) return locs;
  let pool = locs;
  const posted = postedPlaces(sal);
  if (posted) {
    const own = locs.filter((l) => l && posted.has(l.rawName || l.name));
    if (own.length) pool = own;
  }
  const map = palette.COUNTRY_CURRENCY || {};
  let hit = pool.filter((l) => !l?.country || map[String(l.country).toUpperCase()] === cur);
  const cc = typeof sal?.country === 'string' && /^[A-Z]{2}$/i.test(sal.country) ? iso(sal.country) : null;
  if (cc && hit.length) {
    const inCountry = hit.filter((l) => !l?.country || iso(l.country) === cc);
    if (inCountry.some((l) => l?.country)) hit = inCountry;
  }
  return hit.length ? hit : pool;
}

/**
 * The location strings a salary was posted for (salary.places, else the places of its per-place rows), or null.
 * Lead decision (2026-10-16, fix-data-3; as server/juice.js postedPlaceSet): a place the posting lists in no row
 * has no posted pay there, even when another row is tied to no listed place (it was "every row tied").
 */
function postedPlaces(sal) {
  if (Array.isArray(sal?.places) && sal.places.length) return new Set(sal.places);
  const rs = Array.isArray(sal?.ranges) ? sal.ranges : [];
  const tied = rs.filter((r) => Array.isArray(r?.locations) && r.locations.length);
  if (tied.length) return new Set(tied.flatMap((r) => r.locations));
  return null;
}

// A currency's home country when exactly one country uses it (USD -> US, CAD -> CA, PLN -> PL;
// not EUR). "UK" is palette.js's alias for GB.
const CURRENCY_HOME = (() => {
  const by = {};
  for (const [cc, cur] of Object.entries(palette.COUNTRY_CURRENCY || { US: 'USD' })) if (cc !== 'UK') (by[cur] ||= []).push(cc);
  return Object.freeze(Object.fromEntries(Object.entries(by).filter(([, v]) => v.length === 1).map(([cur, [cc]]) => [cur, cc])));
})();
const iso = (c) => { const u = String(c || '').toUpperCase(); return u === 'UK' ? 'GB' : u; };

/**
 * The country a posting's pay is for (shared decision 2 of fix wave 3, BP-3: comparisons stay
 * within one country): the ISO code of the first of payLocations(job) that names a country.
 * payLocations keeps remote entries without a country, which Anthropic and Anduril list first, so
 * the first such entry is skipped. With no located place, the currency's home country when only
 * one country uses it ("$" with no place is US pay; a missing currency reads as USD, as everywhere
 * else in the app); else null (a euro range on a remote-only posting is for no one country).
 *   payCountry({ salary: { currency: 'PLN' }, locations: [{ country: 'US' }, { country: 'PL' }] }) -> 'PL'
 *   payCountry({ salary: { currency: 'USD' }, locations: [{ name: 'Remote', remote: true }] })  -> 'US'
 * @returns {string|null}
 */
export function payCountry(job) {
  const loc = payLocations(job).find((l) => l && l.country);
  if (loc) return iso(loc.country);
  const cur = String(job?.salary?.currency || (job?.salary ? 'USD' : '')).toUpperCase();
  return CURRENCY_HOME[cur] || null;
}

/** The roles in `jobs` whose pay is for the same country as `job`'s (payCountry). */
export function samePayCountry(job, jobs) {
  const c = payCountry(job);
  return (jobs || []).filter((j) => j && payCountry(j) === c);
}

/**
 * Where a posting's pay ranks among a pool of comparable roles, counting only roles paid in the
 * same country (BP-3: "Pays more than 1% of Google's roles" for a Warsaw role ranked against US
 * pay). `pool` is the caller's like-for-like pool (app.js payPool: same kind of pay, interns with
 * interns); `mid(j)` is a role's comparable pay. The posting itself is never in its own pool.
 * @returns {{ pct: number|null, n: number, country: string|null, others: number, below: number, above: number }|null}
 *   pct: the share of same-country roles paid less (0..100, rounded), null with fewer than minN of them;
 *   n: how many same-country roles; others: pool roles left out because their pay is for another
 *   country; below / above: how many same-country roles are paid less / more (D-48: pct rounds to 100
 *   or 0 with roles still above or below, so "the highest" or "the lowest" reads from these, rankText).
 *   null when the posting has no comparable pay.
 */
export function payRank(job, pool, { mid = (j) => j?._mid, minN = 5 } = {}) {
  const v = mid(job);
  if (!Number.isFinite(v)) return null;
  const country = payCountry(job);
  const usable = (pool || []).filter((j) => j && j !== job && (job?.id == null || j.id !== job.id) && Number.isFinite(mid(j)));
  let below = 0, above = 0, n = 0;
  for (const j of usable) {
    if (payCountry(j) !== country) continue;
    n += 1;
    const m = mid(j);
    if (m < v) below += 1; else if (m > v) above += 1;
  }
  const pct = n >= minN ? Math.round((below / n) * 100) : null;
  return { pct, n, country, others: usable.length - n, below, above };
}

/**
 * The drawer's rank line for a payRank result (D-48), or null without a percentage. "The highest pay of <among>" and
 * "The lowest pay of <among>" only when no role is paid more, or less; a share that rounds to 100% or 0% with roles
 * still above or below reads "In the top 1% of <among>" or "In the lowest 1% of <among>" (it said "The highest pay"
 * for Amazon's #50). `among` is the pool's name ("Amazon’s roles in the US").
 */
export function rankText(rank, among) {
  if (!rank || rank.pct == null) return null;
  const { pct, below, above } = rank;
  const counted = Number.isFinite(below) && Number.isFinite(above);
  if (counted && above === 0 && below === 0) return `The same pay as the rest of ${among}`;
  if (counted && above === 0) return `The highest pay of ${among}`;
  if (counted && below === 0) return `The lowest pay of ${among}`;
  if (pct >= 100) return `In the top 1% of ${among}`;
  if (pct <= 0) return `In the lowest 1% of ${among}`;
  return `Pays more than ${pct}% of ${among}`;
}

/** True when the posting's pay applies in `country` (a two-letter code): see payLocations. */
export function payAppliesIn(job, country) {
  const c = String(country || '').toUpperCase();
  return !!c && payLocations(job).some((l) => String(l?.country || '').toUpperCase() === c);
}

/** Location keys (locationKey) the posting's pay applies to. */
export function payLocationKeys(job) {
  const out = new Set();
  for (const l of payLocations(job)) { const k = locationKey(l); if (k) out.add(k); }
  if (!out.size && job?.remote) out.add('Remote');
  return [...out];
}


// ---------------------------------------------------------------------------
// Pay at a place (fix-pay-at-place)
// ---------------------------------------------------------------------------

/** The string a Location is named by in salary.ranges[].locations (the posting's own words). */
const placeName = (l) => (l ? l.rawName || l.name : null);
const POSTING = 'posting';
const NO_ROWS = Object.freeze([]);
const PAY_TABLES = new WeakMap();
/** The places a posting's one range covers, read like a Map of Location -> POSTING (cheaper to build). */
class Covered {
  constructor(list) { this.list = list; }
  has(l) { return this.list.includes(l); }
  get(l) { return this.list.includes(l) ? POSTING : undefined; }
  keys() { return this.list[Symbol.iterator](); }
  *[Symbol.iterator]() { for (const l of this.list) yield [l, POSTING]; }
}
const NONE = new Covered(NO_ROWS);

/**
 * The places of a posting that have posted pay, built once per job (again when its salary or
 * locations change): `at` maps a Location to its own rows of salary.ranges, or to POSTING (the
 * posting's one range covers it). A Location missing from `at` has no posted pay.
 *   - A posting with salary.ranges (Amazon's pay table, Apple's footers, Microsoft's SF Bay Area / NYC
 *     range: one range per place, DATA_SOURCES §7a) prices each place on the rows whose `locations`
 *     name it. A place it lists in no row has no posted pay there (the lead decision of 2026-10-16): it
 *     is never priced on another place's row.
 *   - A posting with one range prices the places it applies to (payLocations), in a country that uses
 *     the pay's currency (chart.js payCoversRow, V-18: a US range on a London-only posting is not
 *     London pay).
 */
function payTable(job) {
  const sal = job?.salary || null;
  const locs = Array.isArray(job?.locations) ? job.locations : [];
  const cacheable = !!job && typeof job === 'object';
  const hit = cacheable ? PAY_TABLES.get(job) : null;
  if (hit && hit.sal === sal && hit.locs === locs && hit.n === locs.length && hit.min === sal?.min && hit.max === sal?.max
    && hit.mid === sal?.mid && hit.ranges === sal?.ranges && hit.cur === sal?.currency) return hit;
  const cur = String(sal?.currency || 'USD').toUpperCase();
  const smin = Number(sal?.min ?? sal?.max), smax = Number(sal?.max ?? sal?.min);
  const t = {
    sal, locs, n: locs.length, min: sal?.min, max: sal?.max, mid: sal?.mid, ranges: sal?.ranges, cur: sal?.currency,
    currency: cur, smin, smax, smid: Number.isFinite(Number(sal?.mid)) && sal?.mid !== null ? Number(sal.mid) : (smin + smax) / 2,
    at: NONE, rows: NO_ROWS, one: null, head: undefined,
  };
  if (sal && (sal.min != null || sal.max != null)) {
    t.rows = Array.isArray(sal.ranges) && sal.ranges.length ? sal.ranges.filter((r) => r && Number.isFinite(Number(r.min))) : NO_ROWS;
    if (t.rows.length) {
      const at = new Map();
      for (const l of locs) {
        const name = placeName(l);
        if (!name) continue;
        const own = t.rows.filter((r) => Array.isArray(r.locations) && r.locations.includes(name));
        if (own.length) at.set(l, own);
      }
      t.at = at;
    } else {
      // One range: the places it covers, as a list (most postings; no Map to build).
      const map = palette.COUNTRY_CURRENCY || {};
      const pl = payLocations(job);
      const ok = (l) => { if (!l) return false; const home = l.country ? map[String(l.country).toUpperCase()] : null; return !home || home === cur; };
      t.at = new Covered(pl.every(ok) ? pl : pl.filter(ok));
    }
  }
  if (cacheable) PAY_TABLES.set(job, t);
  return t;
}

/** The job's Locations that `place` names (see payAt). */
function placesOf(locs, place) {
  if (typeof place === 'function') return locs.filter((l) => l && place(l));
  if (typeof place === 'string') return locs.filter((l) => l && (locationKey(l) === place || l.name === place || placeName(l) === place));
  const want = place instanceof Set ? [...place] : Array.isArray(place) ? place : [place];
  return locs.filter((l) => l && want.some((w) => w === l || (w && typeof w === 'object' && placeName(w) && placeName(w) === placeName(l))));
}

/**
 * "Bellevue", "Seattle and Bellevue", "Seattle, Bellevue and 3 more": the places a range was posted for, by city.
 * @param {Array<object>} places Locations
 */
export function placeLabel(places, max = 2) {
  const names = [...new Set((places || []).map((l) => (l?.remote ? l.name || 'Remote' : l?.city || l?.name)).filter(Boolean))];
  if (names.length <= max) return names.length === 2 ? `${names[0]} and ${names[1]}` : names.join('');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/**
 * A payAt result. Results are shared (cached per job and place), so callers never change them. `usd`
 * converts as the chart, the map and the app's stats do (public/viz/palette.js toUSD: a currency without a
 * rate stays unconverted, and `rated` is false), so every view gets the same numbers. `label` is worked out
 * when first read.
 */
class PlacePay {
  constructor(min, max, mid, currency, basis, places, span, rows, ranges, named = true, usd = undefined) {
    const r = palette.FX_TO_USD?.[currency];
    const k = r == null ? 1 : r;
    this.min = min; this.max = max; this.mid = mid; this.currency = currency;
    this.usd = usd !== undefined ? usd : Number.isFinite(min + max + mid) ? { min: min * k, max: max * k, mid: mid * k } : null;
    this.rated = r != null;
    this.basis = basis; this.places = places; this.span = span; this.rows = rows; this.ranges = ranges;
    this._named = named; this._label = null;
  }
  get label() { return this._named ? (this._label ??= placeLabel(this.places)) : ''; }
}

/** The headline range, named for its place when it is one place's row. */
function headPay(t) {
  const { currency: cur, smin, smax } = t;
  const isHead = (r) => String(r.currency || cur).toUpperCase() === cur && Number(r.min) === smin && Number(r.max ?? r.min) === smax;
  const head = t.rows.length ? t.rows.find(isHead) : null;
  const places = [];
  for (const [l, rs] of t.at) if (head ? rs !== POSTING && rs.includes(head) : true) places.push(l);
  const named = !!head && places.length > 0;
  return new PlacePay(smin, smax, t.smid, cur, named ? 'place' : 'posting', places, !head && t.rows.length > 1, t.rows.length, head ? [head] : t.rows, named);
}

/** payAt for one of the job's own Locations (the hot path of the map and Insights): no array work. */
function priceOne(t, l) {
  const e = t.at.get(l);
  if (!e) return null;
  if (e !== POSTING) return priceAt(t, [l]);
  // The posting's one range: the headline's numbers, sharing its US-dollar figures.
  const head = t.head ?? (t.head = headPay(t));
  return new PlacePay(t.smin, t.smax, t.smid, t.currency, 'posting', [l], false, 0, NO_ROWS, true, head.usd);
}

/** The pay posted for `want` (the job's Locations), or null. */
function priceAt(t, want) {
  const priced = want.filter((l) => t.at.has(l));
  if (!priced.length) return null;
  const { currency: cur, smin, smax } = t;
  if (!t.rows.length) return new PlacePay(smin, smax, t.smid, cur, 'posting', priced, false, 0, NO_ROWS);
  const rowCur = (r) => String(r.currency || cur).toUpperCase();
  const rows = [];
  for (const l of priced) for (const r of t.at.get(l)) if (!rows.includes(r)) rows.push(r);
  // One currency: the salary's, else the first row's (no posting mixes them on the 2026-10-16 crawl).
  const c = rows.some((r) => rowCur(r) === cur) ? cur : rowCur(rows[0]);
  const use = rows.filter((r) => rowCur(r) === c);
  const places = priced.filter((l) => t.at.get(l).some((r) => use.includes(r)));
  let min = Infinity, max = -Infinity;
  for (const r of use) { min = Math.min(min, Number(r.min)); max = Math.max(max, Number(r.max ?? r.min)); }
  const mid = c === cur && min === smin && max === smax ? t.smid : (min + max) / 2;
  const distinct = use.length > 1 && new Set(use.map((r) => `${r.min}|${r.max ?? r.min}`)).size > 1;
  return new PlacePay(min, max, mid, c, 'place', places, distinct, t.rows.length, use);
}

/**
 * The pay a posting posted for a place (fix-pay-at-place). Every view that prices a place uses this one
 * helper (the chart's Clusters and Ranges, Group by Location and under a Location filter; the map's pins;
 * the stats line; Compstimate; Insights' hot locations; the drawer's rank and strip), so they agree.
 * Since the salary audit, Amazon, Apple and Microsoft postings carry one range per place
 * (salary.ranges[].locations) and the headline salary.min/max/mid is one of them (Amazon: the primary
 * city's row; Microsoft: the national range) or their span (Apple).
 *
 * @param {object} job
 * @param {null|object|object[]|Set|string|((l: object) => boolean)} place one of the job's Locations, several,
 *   a location key ("Seattle", "Remote"), or a test over job.locations. null: the posting as a whole (its
 *   headline range, named for its place when it is one place's row).
 * @returns {null|Readonly<{ min, max, mid, currency, usd: {min, max, mid}|null, rated: boolean,
 *   basis: 'place'|'posting', places: object[], label: string, span: boolean, rows: number, ranges: object[] }>}
 *   - basis 'place': the range posted for those places (salary.ranges); for several places with different
 *     rows, the span of their rows (`span` true). Captions say "pay posted for <label>".
 *   - basis 'posting': the posting's one range, which covers the places (`span` true when the headline is
 *     itself a span of several places' ranges, Apple's, with place null).
 *   - null when the posting has pay but none for the place: it prices other places in rows of their own but
 *     not this one (the lead decision of 2026-10-16), its one range is pay for another country, or the place
 *     is not one of its places. payMissAt(job, place) says which.
 *   min/max/mid are yearly, in `currency`; `usd` is approx US dollars (palette.js rates; unconverted and
 *   `rated` false without a rate); `rows` counts the posting's per-place ranges (0 without) and `ranges` are
 *   the ones this figure is (the headline's row, or every row for a span). Pure; results
 *   are cached per job and Location and shared, so callers never change them.
 */
export function payAt(job, place = null) {
  const sal = job?.salary;
  if (!sal || (sal.min == null && sal.max == null)) return null;
  const t = payTable(job);
  if (place == null) return t.head ?? (t.head = headPay(t));
  if (typeof place === 'object' && !Array.isArray(place) && !(place instanceof Set) && t.locs.includes(place)) {
    const one = (t.one ||= new Map());
    let r = one.get(place);
    if (r === undefined) { r = priceOne(t, place); one.set(place, r); }
    return r;
  }
  return priceAt(t, placesOf(t.locs, place));
}

/**
 * Why payAt(job, place) is null: 'none' (no pay posted at all), 'unlisted' (not one of the posting's places),
 * 'place' (the posting prices other places in rows of their own, not this one: the lead decision of
 * 2026-10-16), 'country' (its one range is pay for another country). null when there is pay for the place.
 */
export function payMissAt(job, place) {
  const sal = job?.salary;
  if (!sal || (sal.min == null && sal.max == null)) return 'none';
  if (payAt(job, place)) return null;
  const t = payTable(job);
  if (place != null && !placesOf(t.locs, place).length) return 'unlisted';
  return t.rows.length ? 'place' : 'country';
}

/**
 * True when payAt(job, location) is not null, for one of the job's own Locations, without building a result (the hot
 * path of the map's aggregate and the chart's Location rows). Other `place` forms ask payAt.
 */
export function payCovers(job, place) {
  const sal = job?.salary;
  if (!sal || (sal.min == null && sal.max == null)) return false;
  const t = payTable(job);
  if (place && typeof place === 'object' && !Array.isArray(place) && !(place instanceof Set) && t.locs.includes(place)) return t.at.has(place);
  return !!payAt(job, place);
}

/** How many per-place ranges (salary.ranges) a posting prices its places with; 0 for one range. */
export function placeRowCount(job) {
  return job?.salary ? payTable(job).rows.length : 0;
}

/** The posting's Locations that have posted pay (payAt is not null there), in the posting's order. */
export function pricedPlaces(job) {
  const t = payTable(job);
  return t.locs.filter((l) => l && t.at.has(l));
}

let regionNames = null;
/** "GB" -> "UK", "KR" -> "South Korea": a name, not a bare country code. */
export function countryName(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return '';
  if (c === 'US' || c === 'GB') return c === 'GB' ? 'UK' : 'US';
  if (c === 'AE') return 'UAE';
  try { regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); return regionNames.of(c) || c; } catch { return c; }
}

/** The country as it reads inside a sentence: "the US", "the UK", "Australia". */
export function countryInSentence(code) {
  const n = countryName(code);
  return ['US', 'UK', 'UAE', 'Netherlands', 'Philippines'].includes(n) ? `the ${n}` : n;
}

/** Unique location keys for a job (a job listed in SF and NYC counts in both). */
export function jobLocationKeys(job) {
  const out = new Set();
  for (const l of job?.locations || []) { const k = locationKey(l); if (k) out.add(k); }
  if (!out.size && job?.remote) out.add('Remote');
  return [...out];
}

// ---------------------------------------------------------------------------
// DOM (browser only)
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'srcset']);
const BLOCKED_ATTRS = new Set(['srcdoc']);
// Relative URLs, fragments and http(s)/mailto only.
const SAFE_URL = /^(?:https?:|mailto:|[#/?.]|[^:]*$)/i;

/**
 * h('div', { class: 'x', onclick: fn, style: { '--v': '20%' } }, 'text', child)
 * 'svg:path' creates an SVG element. Strings become text nodes (never HTML).
 */
export function h(tag, attrs, ...children) {
  const isSvg = tag.startsWith('svg:');
  const el = isSvg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv;
      }
    } else if (/^on/i.test(k)) {
      // Event handlers only as functions; on* strings are never set as attributes
      // (REVIEW.md L9: no inline-handler injection via data-derived attrs).
      if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (BLOCKED_ATTRS.has(k.toLowerCase()) ||
      (URL_ATTRS.has(k.toLowerCase()) && !SAFE_URL.test(String(v).trim()))) {
      // drop srcdoc and javascript:/data:/vbscript: style URLs
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (!isSvg && (k === 'value' || k === 'checked' || k === 'selected')) {
      el[k] = v;
    } else {
      el.setAttribute(k === 'className' ? 'class' : k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

let uidN = 0;
export function uid(prefix = 'ms') { uidN += 1; return `${prefix}-${uidN.toString(36)}`; }

/**
 * One tooltip per component root. bind(el, () => ({ value, label, rows })) shows
 * it on mouse hover and keyboard focus. Content is set with textContent only.
 * bind(el, getContent, { action: 'see these roles' }) also gives the tip a line saying how
 * to do the item's action, and on touch makes the first tap show the tip ("Tap again to
 * see these roles") and the second tap do the action (fix-touch-tips; see tipCloser below).
 * A touch, or the mouse events a phone emulates after one, never opens a hover tip.
 */
export function createTooltip(root) {
  const tip = h('div', { class: 'msf-tip', role: 'tooltip', id: uid('tip'), hidden: true });
  root.appendChild(tip);
  let owner = null, ownerKind = null;
  const bound = new WeakMap(); // element -> { getContent, opts }
  const closer = tipCloser(() => hide());

  function render(c, kind, action) {
    tip.replaceChildren();
    if (c.value != null) tip.appendChild(h('div', { class: 'msf-tip__value' }, c.value));
    if (c.label != null) tip.appendChild(h('div', { class: 'msf-tip__label' }, c.label));
    if (c.rows && c.rows.length) {
      tip.appendChild(h('dl', { class: 'msf-tip__rows' },
        c.rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
    }
    if (action) tip.appendChild(h('div', { class: 'msf-tip__label msf-tip__hint' }, actionHint(kind, action)));
  }

  /** Set the tip's viewport position; a containing block above it (e.g. a container query box) is allowed for. */
  function moveTo(left, top) {
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    const got = tip.getBoundingClientRect();
    const dx = got.left - Math.round(left), dy = got.top - Math.round(top);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      tip.style.left = `${Math.round(left - dx)}px`;
      tip.style.top = `${Math.round(top - dy)}px`;
    }
  }

  function place(x, y, below) {
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 14, top = below ? y + 8 : y + 16;
    if (left + r.width > vw - 8) left = Math.max(8, x - r.width - 14);
    if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 12);
    moveTo(left, top);
  }

  /** The keyboard tip's spot under its item (also used to follow it when the page scrolls). */
  function placeUnder(el) {
    const r = el.getBoundingClientRect();
    place(r.left + Math.min(r.width / 2, 160), r.bottom, true);
  }

  function show(el, content, kind, x, y) {
    owner = el;
    ownerKind = kind;
    render(content, kind, bound.get(el)?.opts?.action);
    if (kind === 'keyboard') placeUnder(el);
    else if (kind === 'touch') {
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      const p = placeNearTap(el.getBoundingClientRect(), r.width, r.height, x);
      moveTo(p.left, p.top);
    } else place(x, y, false);
    closer.arm({ inside: [el], anchor: el, follow: kind === 'keyboard' ? () => (inView(el) ? (placeUnder(el), true) : false) : null });
  }

  function hide(el) {
    if (el && el !== owner) return;
    tip.hidden = true;
    owner = null;
    ownerKind = null;
    closer.disarm();
  }

  function bind(el, getContent, opts = {}) {
    bound.set(el, { getContent, opts });
    el.addEventListener('pointermove', (e) => { if (!isTouchInput(e)) show(el, getContent(), 'mouse', e.clientX, e.clientY); });
    el.addEventListener('pointerleave', (e) => { if (!isTouchInput(e) && ownerKind !== 'touch') hide(el); });
    el.addEventListener('focus', () => {
      if (!el.matches(':focus-visible')) return;
      show(el, getContent(), 'keyboard');
    });
    el.addEventListener('blur', () => hide(el));
  }

  // Touch on an item bound with { action }: the first tap shows its tip, the second does the action. This runs
  // in the capture phase on the root, so the item's own click handler never sees the first tap.
  const itemOf = (t) => { for (let n = t; n && n !== root; n = n.parentElement) if (bound.has(n)) return n; return null; };
  function onTap(e) {
    if (!isTouchInput(e)) return;
    const el = itemOf(e.target);
    const b = el && bound.get(el);
    if (!b || !b.opts || !b.opts.action) return;
    if (owner === el && !tip.hidden) { hide(); return; } // the second tap: the action runs, the tip goes
    e.preventDefault();
    e.stopImmediatePropagation();
    const r = el.getBoundingClientRect();
    show(el, b.getContent(), 'touch', e.clientX || r.left + r.width / 2);
  }
  root.addEventListener('click', onTap, true);

  return { bind, hide: () => hide(), destroy() { closer.disarm(); root.removeEventListener?.('click', onTap, true); tip.remove(); } };
}

/** Keep keyboard focus on the element with the same data-key across a re-render. */
export function preserveFocus(root, renderFn) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const key = active && root.contains(active) ? active.closest('[data-key]')?.dataset.key : null;
  renderFn();
  if (key == null) return;
  for (const el of root.querySelectorAll('[data-key]')) {
    if (el.dataset.key === key) { el.focus({ preventScroll: true }); break; }
  }
}

// ---------------------------------------------------------------------------
// Floating tips and touch (fix-touch-tips, docs/process/fix-touch-tips.md)
// ---------------------------------------------------------------------------
//
// One rule for every tooltip, tip and hover box (createTooltip above, viz/comps.js, viz/chart.js, viz/map.js):
//   - a hover tip needs a real mouse. A touch, and the mouse events a phone emulates just after one (iOS Safari
//     sends mouseover and mousemove after a tap, and never a pointerleave), never open one;
//   - a tap does what a click does, at once, with no tip, except where the action takes you to another company's
//     board ("Same role elsewhere", Compare companies) or the item has no action (the chart's pay strip): there the
//     first tap shows the tip, which says "Tap again to …", and a second tap on the same item does the action;
//   - an open tip closes on a press anywhere else, a scroll that moves its item, a resize, the page hiding, Esc, or
//     the action. It never waits for a pointerleave;
//   - a tip opened from the keyboard follows its item when the page scrolls, and closes when the item leaves the screen;
//   - the words follow the input: "Click to …" for a mouse, "Tap again to …" for a touch, "Press Enter to …" for keys.

/** A mouse event this soon after a touch is the phone's emulation of that touch, not a mouse (ms). */
export const TOUCH_GRACE_MS = 1000;
const lastInput = { touchAt: -Infinity };
const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  const o = { capture: true, passive: true };
  const touched = () => { lastInput.touchAt = clock(); };
  document.addEventListener('touchstart', touched, o);
  document.addEventListener('touchend', touched, o);
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touched(); }, o);
}

/**
 * True for a touch, and for the mouse and pointer events a phone sends within TOUCH_GRACE_MS of one (iOS's
 * emulated mouse events; Chromium marks its own with sourceCapabilities.firesTouchEvents).
 */
export function isTouchInput(e) {
  if (e && e.pointerType === 'touch') return true;
  if (e && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return true;
  return clock() - lastInput.touchAt < TOUCH_GRACE_MS;
}

/** The tip's line that says how to do the item's action, in the words of the input that opened the tip. */
export function actionHint(kind, action) {
  return kind === 'touch' ? `Tap again to ${action}` : kind === 'keyboard' ? `Press Enter to ${action}` : `Click to ${action}`;
}

/** True while at least `min` of the element's height is on screen, inside every box that clips it. */
export function inView(el, min = 0.5) {
  if (!el || !el.isConnected || typeof getComputedStyle !== 'function') return false;
  const r = el.getBoundingClientRect();
  if (!r.height) return false;
  let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
  let left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
  for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (!/(auto|scroll|hidden|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) continue;
    const c = n.getBoundingClientRect();
    top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom);
    left = Math.max(left, c.left); right = Math.min(right, c.right);
  }
  return right > left && bottom - top >= min * r.height;
}

/**
 * Where a tip opened by a tap goes, in viewport px: above its item, clear of the finger, else below it; centred on
 * the tap's x and kept `pad` px inside the screen. anchor: a DOMRect; w, h: the tip's size.
 */
export function placeNearTap(anchor, w, h, x = anchor.left + anchor.width / 2, { gap = 8, pad = 8 } = {}) {
  // The screen is the visual viewport: a page wider than the screen, or a pinch zoom, pans it over the page.
  const vv = typeof visualViewport !== 'undefined' && visualViewport ? visualViewport : null;
  const sl = vv ? vv.offsetLeft : 0, st = vv ? vv.offsetTop : 0;
  const vw = vv ? vv.width : innerWidth, vh = vv ? vv.height : innerHeight;
  let top = anchor.top - h - gap;
  if (top < st + pad) top = Math.min(anchor.bottom + gap, st + vh - h - pad);
  const left = Math.max(sl + pad, Math.min(x - w / 2, sl + vw - w - pad));
  return { left: Math.round(left), top: Math.round(Math.max(st + pad, top)) };
}

/**
 * Closes an open tip without waiting for a pointerleave (iOS sends none after a tap): on a press outside `inside`,
 * a scroll that moves `anchor` (or removes it), a resize, or the page being hidden. With `follow`, a scroll that
 * moves the anchor calls follow() instead, which re-places the tip and returns false once the anchor has left
 * the screen (that closes it): a keyboard tip stays with its row. close() is called once per arm.
 *   const closer = tipCloser(() => hideTip());
 *   closer.arm({ inside: [list], anchor: row, follow: fromKeys ? () => placeAt(row) : null });
 *   closer.disarm();   // the tip closed some other way
 */
export function tipCloser(close) {
  let on = null;
  const o = { capture: true, passive: true };
  const at = (el) => { if (!el || !el.isConnected) return null; const r = el.getBoundingClientRect(); return [r.left, r.top]; };
  const fire = () => { if (!on) return; disarm(); close(); };
  const onDown = (e) => { if (on && !on.inside.some((el) => el.contains(e.target))) fire(); };
  const onScroll = () => {
    if (!on || !on.anchor) return;
    const now = at(on.anchor);
    if (!now) { fire(); return; }
    if (on.at && Math.abs(now[0] - on.at[0]) < 1 && Math.abs(now[1] - on.at[1]) < 1) return; // another box scrolled
    if (on.follow && on.follow() !== false) { if (on) on.at = at(on.anchor); return; }
    fire();
  };
  const onHide = () => { if (document.visibilityState === 'hidden') fire(); };
  function disarm() {
    if (!on) return;
    on = null;
    document.removeEventListener('pointerdown', onDown, o);
    window.removeEventListener('scroll', onScroll, o);
    window.removeEventListener('resize', fire);
    document.removeEventListener('visibilitychange', onHide);
  }
  return {
    arm({ inside = [], anchor = null, follow = null } = {}) {
      const was = !!on;
      on = { inside: [].concat(inside).filter(Boolean), anchor, follow, at: at(anchor) };
      if (was || typeof document === 'undefined' || typeof window === 'undefined') return;
      document.addEventListener('pointerdown', onDown, o);
      window.addEventListener('scroll', onScroll, o);
      window.addEventListener('resize', fire);
      document.addEventListener('visibilitychange', onHide);
    },
    disarm,
    get armed() { return !!on; },
  };
}

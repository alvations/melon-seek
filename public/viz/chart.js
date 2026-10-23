// melon-seek salary landscape chart.
//
// createChart(container, { onSelect(job), onHover(job|null), onClusterSelect(jobs, label) })
//   -> { update(jobs, { view, groupBy, colorBy, empty?, places?, placeTest? }), highlight(jobId|null),
//        clearSelection(), destroy() }
//
// Empty states (P-16): postings that list no salary get the chart's own note ("N postings
// match, but none list a salary range"). With no postings at all the chart stays blank, because
// the host knows why (a search word, a filter) and says it once; pass `empty` ("text" or
// { title, sub }) to have the chart say it instead.
//
// Group by seniority shows displayLevel(job) through levelLabel (public/features/roles.js, shared
// decision 1 of the beta fix wave): the default 'Mid' reads "Level not stated" and comes last (P-3);
// a stated mid level (seniorityBasis 'title' or 'pay', e.g. Google "III") reads "Mid".
//
// Location filter (BP-2, fix wave 3 shared decision 1): pass `places` (the filter's location keys,
// app.js S.l) and optionally `placeTest(job, location)` (the app's own test). A posting is then
// plotted only when it has pay posted for one of those places, and at that pay (payAt in
// public/features/shared.js: a place's own row of salary.ranges, else the posting's one range in the
// pay currency's countries; fix-pay-at-place); the others stay out of the plot and every median, and
// the notes line counts them ("12 with pay for another country only, left out"). Group by Location
// prices each row at its own place the same way (V-36, V-37), so the chart, the map and the stats line agree.
//
// Medians are base pay (BP-13): ranges with salary.kind 'ote' (on-target earnings, base plus
// commission at target) are plotted but left out of the medians, as in the app's stats line; only
// when nothing else is left does a median use them, and then it says "on-target earnings".
//
// Two views share one approx-USD salary axis, a slim sticky midpoint
// distribution strip, and a muted notes line under the chart:
//
// - "clusters" (default): one calm row per group (department by default;
//   groupBy "none" gives a single "All roles" row). Postings with neighbouring
//   midpoints form one circle, sized by count (sqrt scale) and drawn at their
//   median midpoint (viz-even, placeCircles), over a soft P25–P75 band with a
//   median tick. Click a circle or a row label to call onClusterSelect(jobs, label).
// - "ranges" (detail): one min–max range bar per posted range, with a midpoint dot,
//   sorted by midpoint and optionally grouped into bands. Postings with the same
//   bar are one row with their count (viz-even, stackRanges). Click calls
//   onSelect(job), or onClusterSelect(jobs, label) on a row of several postings.
//
// Plain DOM. Hover and keyboard focus only toggle classes and never re-render.

import {
  colorFor, assignColors, otherColor, slotColor, inkOn, OTHER_KEY, SLOT_COUNT, formatMoney,
  formatCurrency, toUSD, isForeign, hasFx, niceTicks, median, onThemeChange, prefersReducedMotion, isDark, FX_AS_OF,
  FX_SOURCE, COUNTRY_CURRENCY,
} from './palette.js';
import { levelLabel, displayLevel, DISPLAY_LEVEL_ORDER } from '../features/roles.js';
import { OTE_LABEL, payAt, payMissAt, payCovers, placeRowCount, notBasePay } from '../features/shared.js';
import { renderNote } from './note.js';
import { isTouchInput, tipCloser, inView, placeNearTap } from '../features/shared.js';

export const VIEWS = Object.freeze(['clusters', 'ranges']);
export const DEFAULT_VIEW = 'clusters';

const ROW_H = 22;          // ranges: one posting
const ROW_H_NARROW = 44;   // ranges, narrow (phones): title line above the bar, a 44px touch target (M-8, M-17)
const HEAD_H = 30;         // ranges: group band header
const HIST_H = 28;         // distribution strip
const CROW_H = 52;         // clusters: one group row (wide)
const CROW_LABEL_H = 22;   // clusters, narrow: label line above the plot
const CROW_PLOT_H = 44;    // clusters, narrow: plot height
// viz-even: two circles' centres are at least this far apart, so their 24px touch targets never overlap.
const MIN_BIN_PX = 24;
const CIRCLE_GAP = 2;      // viz-even: px of air between two neighbouring circles
// D-9 / P-3: the seniority ladder for Clusters and Ranges, by displayLevel(): the ladder, then the
// default level (NOT_STATED, "Level not stated") last (lead decisions, 2026-10-10).
export const SENIORITY_ORDER = DISPLAY_LEVEL_ORDER;
const ALL_ROLES = 'All roles';

const INTERVAL_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly', term: 'fixed-term' };
const DIM_LABEL = { department: 'department', location: 'location', seniority: 'seniority', brand: 'company' };
// UX-24 fold: groupings whose small rows fold into one "N more …" row, and the row's noun.
// D-44 (fix-viz-5): Location folds too, so the places with the most postings with pay lead and a one-posting place
// never tops the chart with its one posting's pay; every place is still in the "N more places" row.
const FOLD_NOUN = { department: 'departments', brand: 'companies', location: 'places' };
const FOLD_ONE = { department: 'department', brand: 'company', location: 'place' };
// V-21: groupings whose rows compare one country's pay when the board mixes currencies.
const BASIS_DIMS = new Set(['department', 'seniority', 'brand']);

/**
 * Category key for a job along a dimension (seniority: displayLevel(job), the level people see).
 * google-grouping: 'brand' is the company or subsidiary the board names on the posting (Google,
 * YouTube, DeepMind, …; CONTRACT.md "google-grouping"); a posting without one is the board's own.
 */
export function keyOf(job, dim) {
  if (dim === 'department') return job.department || 'No department';
  if (dim === 'brand') return job.brand || job.companyName || 'No company';
  if (dim === 'seniority') return displayLevel(job);
  if (dim === 'location') return primaryLocation(job);
  return 'All';
}

/** What people read for a key: seniority through levelLabel ("Level not stated"), others as is. */
export function groupName(dim, key) {
  return dim === 'seniority' ? levelLabel(key) : key;
}

const senRank = (k) => { const i = SENIORITY_ORDER.indexOf(k); return i < 0 ? SENIORITY_ORDER.length - 1.5 : i; };

/**
 * D-29: a non-US pay range names its currency once. A symbol leaves the code ambiguous, so it is
 * added ("€80K – €100K EUR", "CA$90K – CA$120K CAD"); a currency written with its code already
 * ("PLN 345K – PLN 702K", "CHF 232K – CHF 470K") gets nothing more. US dollars stay "$X – $Y".
 */
export function withCurrencyCode(text, currency) {
  const cur = String(currency || 'USD').toUpperCase().replace(/[^A-Z]/g, '');
  if (!cur || cur === 'USD' || new RegExp(`(^|[^A-Z])${cur}([^A-Z]|$)`).test(text)) return text;
  return `${text} ${cur}`;
}

/**
 * M-23: a count short enough for a pin or a circle: 999, then "1K", "4.5K", "12K", "1.2M". The
 * exact number goes in the accessible name and the tooltip.
 */
export function shortCount(n) {
  const a = Math.round(Math.abs(Number(n) || 0));
  if (a < 1000) return String(a);
  const fmt = (v, unit) => `${v < 10 ? Math.round(v * 10) / 10 : Math.round(v)}${unit}`;
  return a < 999500 ? fmt(a / 1000, 'K') : fmt(a / 1e6, 'M');
}

/**
 * V-27: an axis tick's label names the gridline's own value. formatMoney keeps one decimal of
 * millions (1.25M read "$1.3M", $50K off its gridline); a tick keeps up to two, without trailing
 * zeros: $1.25M, $1.5M, $2M, $12.5K, $250K.
 */
export function formatTick(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  const trim = (n) => String(+n.toFixed(2));
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1000) return `${sign}$${trim(a / 1000)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** "Jul 2026": the month of the fixed exchange rates (FX_AS_OF), for words next to converted pay (MR-2). */
export const FX_MONTH = (() => { const m = /^(\d{4})-(\d{2})/.exec(String(FX_AS_OF || '')); return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}` : String(FX_AS_OF || ''); })();
/** Where the app explains its exchange rates (the methodology page, relative to the app's page). */
export const FX_DOC = 'methodology/#7-how-often-its-updated';
/** The rates' source in a few words ("The Economist Big Mac index source data v2"), for titles. */
export const FX_SOURCE_SHORT = String(FX_SOURCE || '').split(',')[0];

/**
 * V-19, shared decision 4 (app.js): part-time pay posted by the hour. salary.min/max are a full-time
 * year (2,080 hours), so every yearly figure for it says "a year if full-time".
 */
export const isPartTimeHourly = (job) => job?.salary?.partTime === true && job.salary.originalInterval === 'hour';

/**
 * V-20: a range that is not one posted range: several levels priced in one posting (salary.levels,
 * NVIDIA "Level 4" and "Level 5") or one requisition's ranges for several places (salary.ranges,
 * Apple). -> { kind: 'levels'|'places', tiers: [{ label, min, max }] } or null.
 */
export function spanTiers(job) {
  const s = job?.salary;
  if (!s) return null;
  if (Array.isArray(s.levels) && s.levels.length >= 2) return { kind: 'levels', tiers: s.levels };
  // SA-2 (salary audit): Amazon's bar is the row of the posting's own city, not the span of its rows.
  if (Array.isArray(s.ranges) && s.ranges.length >= 2) {
    const span = Math.min(...s.ranges.map((r) => Number(r.min))) === s.min && Math.max(...s.ranges.map((r) => Number(r.max ?? r.min))) === s.max;
    return { kind: 'places', tiers: s.ranges, span };
  }
  return null;
}

/**
 * V-35 (fix-pay-at-place): what a Ranges bar is when it is not one posted range, so only those bars are
 * striped: several levels priced in one posting (salary.levels), or the span of several places' ranges (Apple's
 * headline; several places picked whose rows differ). One place's row is one posted range and is never striped,
 * though the posting lists other places' ranges (2,201 Amazon and 236 Microsoft bars were). `p` is a plotted
 * item; `p.at` is the place's pay when the bar was priced for a place (payAt).
 * -> { kind: 'levels'|'places', tiers: [{ label, min, max }] } | null
 */
export function barSpan(p) {
  const job = p?.job;
  const s = job?.salary;
  if (!s) return null;
  if (Array.isArray(s.levels) && s.levels.length >= 2) return { kind: 'levels', tiers: s.levels };
  if (!p.at && !(Array.isArray(s.ranges) && s.ranges.length >= 2)) return null; // one range: no place span (no payAt pass)
  const at = p.at || payAt(job);
  return at?.span ? { kind: 'places', tiers: at.ranges } : null;
}

/**
 * fix-pay-at-place: which place a bar's range was posted for, in words ("Bellevue"), or '' when the posting has one
 * range for all its places or the bar spans several places' ranges.
 */
export function barPlace(p) {
  if (!p?.at && !(Array.isArray(p?.job?.salary?.ranges) && p.job.salary.ranges.length)) return '';
  const at = p.at || payAt(p.job);
  return at && at.basis === 'place' && !at.span ? at.label : '';
}

/**
 * A plotted item priced at `at` (payAt): the same item when the numbers are the same, else a copy with the place's
 * pay in approx US dollars. Null when there is no pay for the place.
 */
function pricedItem(p, at) {
  if (!at || !at.usd) return null;
  const { min: lo, max: hi, mid } = at.usd;
  if (!isFinite(lo) || !isFinite(hi) || !isFinite(mid)) return null;
  if (lo === p.lo && hi === p.hi && mid === p.mid && at.currency === p.cur) return p; // the same bar: no copy (perf)
  // A copy has its own pattern and stack key (V-47 keeps them on the item): never the original's.
  return { ...p, lo: Math.min(lo, hi), hi: Math.max(lo, hi), mid, cur: at.currency, at, kindDone: false, span: undefined, rk: undefined, rkFor: undefined };
}

/**
 * V-18, V-36, V-37 (fix-pay-at-place): a plotted item as its Location row shows it: priced at the pay posted for
 * the row's place (payAt), never the posting's headline (another city's row). Null when the posting has no pay
 * posted for that place: its one range is another country's pay, or it prices other places but not this one.
 * `key` is the row (locationRowKey), `test` the Location filter's place test (placeMatcher) or null.
 */
export function locationRowItem(p, key, test = null) {
  const job = p.job;
  const locs = (job?.locations || []).filter(Boolean);
  // A posting with no on-site place sits in "Unknown" (or "Remote" with no place at all): its own pay.
  if (key === 'Unknown' && !locs.some((l) => !l.remote)) return p;
  if (key === 'Remote' && !locs.length) return p;
  // The row's place(s) of the job; one place (the usual case) takes payAt's cached path.
  let here = null, any = null;
  for (const l of locs) {
    if (rowKeyOfLoc(l) !== key) continue;
    (any ||= []).push(l);
    if (!test || test(job, l)) (here ||= []).push(l);
  }
  const at = here || any;
  if (!at) return null;
  // A posting with one range is its own figure at every place it covers (no result to build, no copy).
  if (!placeRowCount(job)) return at.some((l) => payCovers(job, l)) ? p : null;
  return pricedItem(p, payAt(job, at.length === 1 ? at[0] : at));
}

/**
 * V-21: the pay basis of a posting: its currency (pay in one currency is for one country or the
 * euro area, so rows compare like with like), USD when none is given. (public/features/shared.js
 * payCountry would name the country, but it inherits payLocations' fallback to every location.)
 */
export const payBasis = (job) => String(job?.salary?.currency || 'USD').toUpperCase();
const BASIS_HOME = (() => {
  const by = {};
  for (const [cc, cur] of Object.entries(COUNTRY_CURRENCY || {})) if (cc !== 'UK') (by[cur] ||= []).push(cc);
  return by;
})();
const COUNTRY_WORD = { US: 'the US', GB: 'the UK', CA: 'Canada', CH: 'Switzerland', JP: 'Japan', KR: 'South Korea', IN: 'India', SG: 'Singapore', AU: 'Australia', NZ: 'New Zealand', IL: 'Israel', AE: 'the UAE', PL: 'Poland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', CZ: 'Czechia', HK: 'Hong Kong', TW: 'Taiwan', CN: 'China', BR: 'Brazil', MX: 'Mexico', ZA: 'South Africa', SA: 'Saudi Arabia', QA: 'Qatar' };
/** "in the US", "in the euro area", "in Poland": where the pay a row compares is for ("median $127K in the US"). */
export function payBasisPlace(cur) {
  const c = String(cur || 'USD').toUpperCase();
  if (c === 'EUR') return 'in the euro area';
  const home = BASIS_HOME[c];
  return home && home.length === 1 ? `in ${COUNTRY_WORD[home[0]] || home[0]}` : `paid in ${c}`;
}
/** The short form for a narrow label: "US", "UK", "EUR", "PLN". */
const basisShort = (cur) => ({ USD: 'US', GBP: 'UK' }[cur] || cur);

/**
 * V-18: the Location row a posting belongs to: its first on-site place (the first one the Location
 * filter takes in, under a filter: NVIDIA's Munich-paid role is a Munich row, not "Italy"), else
 * Remote, else Unknown.
 */
export function locationRowKey(job, test = null) {
  const locs = job?.locations || [];
  const onsite = locs.find((l) => l && !l.remote && (!test || test(job, l)));
  if (onsite) return onsite.city || onsite.name || 'Unknown';
  if (test && locs.some((l) => l?.remote && test(job, l))) return 'Remote';
  return primaryLocation(job);
}
const rowKeyOfLoc = (l) => (l.remote ? 'Remote' : l.city || l.name || 'Unknown');
/**
 * V-18: true when the posting has pay posted for the place its Location row is named for (payAt: that
 * place's own row, or the posting's one range in a currency that place uses; a US range on a
 * London-only posting is not London pay, and a place with no row of its own has none).
 */
export function payCoversRow(job, key) {
  const locs = (job?.locations || []).filter(Boolean);
  if (key === 'Unknown' && !locs.some((l) => !l.remote)) return true;
  if (key === 'Remote' && !locs.length) return true;
  // fix-pay-at-place: the shared rule (payAt): a place's own row, or the posting's one range in that place's country.
  return !!payAt(job, locs.filter((l) => rowKeyOfLoc(l) === key));
}

/**
 * V-21: medians that compare like with like. When the plotted pay is in more than one currency,
 * each row's median, band and tick use the board's main currency (the most postings), or the row's
 * one currency when it has none of the main one; a row of several other currencies says so.
 * -> { stats (basePayStats), basis: currency|null, left: items not in the median }
 */
const basisOf = (p) => p.basis || payBasis(p.job); // payBasis, kept on chartPay's items (V-47)
function basisStats(items, main) {
  if (!main) return { stats: basePayStats(items), basis: null, left: 0 };
  const own = items.filter((p) => basisOf(p) === main);
  if (own.length) return { stats: basePayStats(own), basis: main, left: items.length - own.length };
  const bases = new Set(items.map(basisOf));
  return { stats: basePayStats(items), basis: bases.size === 1 ? [...bases][0] : (items.length ? 'mixed' : null), left: 0 };
}
/** The most common pay currency of the plotted postings when there is more than one, else null. */
function mainBasis(items) {
  const n = new Map();
  for (const p of items) { const b = basisOf(p); n.set(b, (n.get(b) || 0) + 1); }
  if (n.size < 2) return null;
  return [...n].sort((a, b) => b[1] - a[1] || (a[0] === 'USD' ? -1 : 1))[0][0];
}
/**
 * MR-39 (fix-mr-3): the caption's median on the rows' basis. With pay in several currencies it is the main currency's
 * (the rows' rule, and the app's stats line and Insights' tiles: shared.js mainPayCurrency), with `basis` and
 * `basisLeft` (the plotted postings paid in other currencies); the left-out counts by kind stay the whole chart's.
 */
function headPay(items) {
  const all = basePayStats(items);
  const b = basisStats(items, mainBasis(items));
  if (!b.basis || b.basis === 'mixed' || !b.left) return all;
  return { ...all, median: b.stats.median, p25: b.stats.p25, p75: b.stats.p75, n: b.stats.n, basis: b.basis, basisLeft: b.left };
}
/** MR-39: " US" after the caption's median when it is one currency's pay of several ("Median base pay $149K US"). */
const medianBasis = (pay) => (pay?.basis && pay.basis !== 'mixed' && pay.basisLeft ? ` ${basisShort(pay.basis)}` : '');
/** " in the US" after a median, "" when the row has no basis; "mixed" names its currencies. */
const basisWords = (r) => (r.basis === 'mixed' ? ', several countries’ pay' : r.basis ? ` ${payBasisPlace(r.basis)}` : '');
const basisWordsShort = (r) => (r.basis === 'mixed' ? ' mixed' : r.basis ? ` ${basisShort(r.basis)}` : '');
/**
 * MR-28 (fix-viz-5): what a median leaves out, in words, from basePayStats' counts by kind:
 * "285 stated minimums, 636 with top shift pay and 14 with part-time pay" ('' for none).
 */
export function notBaseWords(k = {}) {
  const parts = [];
  if (k.minimum) parts.push(`${k.minimum.toLocaleString()} stated minimum${k.minimum === 1 ? '' : 's'}`);
  if (k.shiftPay) parts.push(`${k.shiftPay.toLocaleString()} with top shift pay`);
  if (k.partTime) parts.push(`${k.partTime.toLocaleString()} with part-time pay`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
}

/**
 * Where a ranges row's pay label goes (P-16): right of the bar, else left of it, else on the bar
 * inside the plot, so it never runs into the title column. `w` is the label's width in px.
 * Returns { side: 'right'|'left'|'in', x } (x = the label's left edge).
 */
export function rowValPlacement({ bx0, bx1, plotL, width, w, gap = 10, pad = 4 }) {
  if (bx1 + gap + w <= width - pad) return { side: 'right', x: bx1 + gap };
  if (bx0 - gap - w >= plotL) return { side: 'left', x: bx0 - gap - w };
  return { side: 'in', x: Math.max(plotL, Math.min(width - pad - w, Math.max(bx0, plotL) + 8)) };
}

/** A location's filter key, as app.js locKey makes it: the city, else the name; remote by its name. */
const placeKeyOf = (l) => (l.remote ? l.name || 'Remote' : l.city || l.name || 'Unknown');
const placeList = (places) => (places == null ? [] : typeof places === 'string' ? [places] : [...places].filter(Boolean));

/**
 * BP-2: the test "this location of the job is one of the filtered places". The host's own
 * `placeTest(job, location)` when it has one (app.js locMatches, which also knows its disambiguated
 * keys and country-wide postings); else a match on the location's key or name. Null with no filter.
 */
export function placeMatcher(places, placeTest = null) {
  if (typeof placeTest === 'function') return placeTest;
  const keys = new Set(placeList(places));
  if (!keys.size) return null;
  return (job, l) => !!l && (keys.has(placeKeyOf(l)) || (!!l.name && keys.has(l.name)));
}

/** How the notes name the filtered places: the one place, else "these places". */
export function placesPhrase(places) {
  const keys = placeList(places);
  return keys.length === 1 ? String(keys[0]) : keys.length ? 'these places' : '';
}

/**
 * BP-2 / BP-13: the postings the chart plots, in approx US dollars.
 *   -> { plotted: [{ job, lo, hi, mid, cur, ote, at }], noSalary, elsewhere, elsewhereIds, otherPlaces, fxCount,
 *        unknownFx, ote }
 * With `places` (and `placeTest`, see placeMatcher) a posting is plotted only when it has pay posted for one
 * of the places (payAt in public/features/shared.js), and at that pay (`at`): SA-5 and fix-pay-at-place, the
 * range its card shows (app.js pickedRange) and the stats line and map count, not the posting's headline
 * range (another city's row). `elsewhere` counts the salaried ones left out (their ids in `elsewhereIds`):
 * pay for another country only, or (`otherPlaces`, the lead decision of 2026-10-16) a posting that prices
 * other places in rows of their own but not these. `ote` marks on-target earnings (salary.kind 'ote'), which
 * basePayStats leaves out of medians.
 */
export function chartPay(jobs, { places = null, placeTest = null } = {}) {
  const test = placeMatcher(places, placeTest);
  const plotted = [];
  let noSalary = 0, fxCount = 0, ote = 0, otherPlaces = 0;
  const unknownFx = new Set(), elsewhereIds = new Set();
  for (const job of jobs || []) {
    const s = job?.salary;
    if (!s || (s.min == null && s.max == null)) { noSalary++; continue; }
    let cur = (s.currency || 'USD').toUpperCase();
    let lo, hi, mid, at = null;
    if (test) {
      const here = (l) => test(job, l);
      at = payAt(job, here);
      if (!at) { elsewhereIds.add(job.id); if (payMissAt(job, here) === 'place') otherPlaces++; continue; }
      cur = at.currency;
      ({ min: lo, max: hi, mid } = at.usd || { min: NaN, max: NaN, mid: NaN });
    } else {
      const min = s.min ?? s.max, max = s.max ?? s.min;
      lo = toUSD(Math.min(min, max), cur); hi = toUSD(Math.max(min, max), cur);
      mid = s.mid != null ? toUSD(s.mid, cur) : (lo + hi) / 2;
    }
    if (!isFinite(lo) || !isFinite(hi) || !isFinite(mid)) { noSalary++; continue; }
    if (isForeign(cur)) { if (hasFx(cur)) fxCount++; else unknownFx.add(cur); }
    const isOte = s.kind === 'ote';
    if (isOte) ote++;
    // MR-28 (fix-viz-5): a stated minimum, shift-inclusive or part-time figure is plotted as posted, and medians leave it out.
    plotted.push({ job, lo, hi, mid, cur, ote: isOte, at, nb: notBasePay(job), basis: payBasis(job) });
  }
  return { plotted, noSalary, elsewhere: elsewhereIds.size, elsewhereIds, otherPlaces, fxCount, unknownFx: [...unknownFx], ote };
}

/**
 * BP-13: median and quartiles of base pay (the midpoints of the items that are not on-target
 * earnings), the same set as the app's stats line. Only when every item is on-target earnings are
 * they used, with `oteOnly` set. `oteLeftOut` counts the on-target items left out.
 * MR-28 (fix-viz-5): base pay is also not a stated minimum, shift-inclusive pay or part-time pay
 * (shared.js notBasePay, the market doc's rule; items carry it as `nb`). They are plotted and left out of the
 * medians, counted by kind in `notBaseLeftOut`; only when nothing else is left are they used, with `notBaseOnly`.
 */
export function basePayStats(items) {
  const base = [], ote = [], nb = [];
  const left = { minimum: 0, shiftPay: 0, partTime: 0 };
  for (const p of items || []) {
    if (!p || p.mid == null || !isFinite(p.mid)) continue;
    const k = p.nb === undefined ? notBasePay(p.job) : p.nb;
    if (k) { nb.push(p.mid); left[k]++; } else (p.ote ? ote : base).push(p.mid);
  }
  const use = (base.length ? base : ote.length ? ote : nb).sort((a, b) => a - b);
  const kept = base.length + ote.length > 0;
  return {
    median: quantile(use, 0.5), p25: quantile(use, 0.25), p75: quantile(use, 0.75), n: use.length,
    oteOnly: !base.length && ote.length > 0, oteLeftOut: base.length ? ote.length : 0,
    notBaseOnly: !kept && nb.length > 0, notBaseLeftOut: kept ? left : { minimum: 0, shiftPay: 0, partTime: 0 },
    notBaseKinds: left,
  };
}

/**
 * viz-even: the circles of one Clusters row, standing where its pay concentrates. The old view put
 * midpoints into fixed-width bins ($50K on a desktop) and drew each circle at its bin's centre, so the
 * circles were evenly spaced whatever the data (the user, 2026-10-11: "kinda all span too evenly"): a
 * posted band could be drawn $25K from its postings, and two bands could share a bin while a bin edge
 * split a third.
 *
 * Here a circle is a run of postings with neighbouring midpoints, drawn at their median midpoint. Start
 * with one group per distinct midpoint; then, closest first, merge two neighbouring groups while their
 * circles would be closer than need(nLeft, nRight) px (their two radii and a gap, never under the touch
 * target). Every posting is in exactly one group: nothing is dropped.
 *   items: [{ mid }] (any order); x(value) -> px (monotonic); need(nA, nB) -> px.
 *   -> [{ items (by midpoint), at: their median midpoint, lo, hi: their lowest and highest }], low to high.
 */
export function placeCircles(items, { x, need }) {
  const runs = circleRuns(items);
  return circlesOf(runs, planRuns(runs, x, need));
}

/** placeCircles' first step, done once per row: the items by midpoint, and the runs of equal midpoints (start, end). */
function circleRuns(items) {
  const s = (items || []).filter((p) => p && isFinite(p.mid)).sort((a, b) => a.mid - b.mid);
  const runs = [];
  for (let i = 0; i < s.length;) {
    let j = i + 1;
    while (j < s.length && s[j].mid === s[i].mid) j++;
    runs.push(i, j);
    i = j;
  }
  return { s, runs };
}
/** The merge itself (placeCircles), on circleRuns' output -> the live groups [{ i, j, at }], low to high. */
function planRuns({ s, runs }, x, need) {
  if (!s.length) return [];
  const medianOf = (i, j) => { const n = j - i, h = i + (n >> 1); return n % 2 ? s[h].mid : (s[h - 1].mid + s[h].mid) / 2; };
  const G = []; // the groups, a linked list in midpoint order: s[i..j) at `at`, drawn at px
  for (let k = 0; k < runs.length; k += 2) {
    const i = runs[k];
    G.push({ i, j: runs[k + 1], at: s[i].mid, px: x(s[i].mid), prev: G.length - 1, next: -1, v: 0, dead: false });
  }
  for (let k = 0; k + 1 < G.length; k++) G[k].next = k + 1;
  // A min-heap of neighbouring pairs that are too close: [gap, left, right, left's version, right's version].
  const heap = [];
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const swap = (a, b) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; };
  const push = (e) => {
    heap.push(e);
    for (let k = heap.length - 1; k > 0;) { const p = (k - 1) >> 1; if (!less(heap[k], heap[p])) break; swap(k, p); k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === k) break;
        swap(k, m); k = m;
      }
    }
    return top;
  };
  const consider = (a) => {
    if (a < 0 || G[a].next < 0) return;
    const ga = G[a], gb = G[ga.next], gap = gb.px - ga.px;
    if (gap < need(ga.j - ga.i, gb.j - gb.i)) push([gap, a, ga.next, ga.v, gb.v]);
  };
  for (let k = 0; k + 1 < G.length; k++) consider(k);
  while (heap.length) {
    const [, a, b, va, vb] = pop();
    const ga = G[a], gb = G[b];
    if (ga.dead || gb.dead || ga.v !== va || gb.v !== vb) continue; // a group changed since: stale
    ga.j = gb.j;
    ga.at = medianOf(ga.i, ga.j);
    ga.px = x(ga.at);
    ga.v++;
    gb.dead = true;
    ga.next = gb.next;
    if (gb.next >= 0) G[gb.next].prev = a;
    consider(ga.prev);
    consider(a);
  }
  return G.filter((g) => !g.dead);
}
const circlesOf = ({ s }, G) => G.map((g) => ({ items: s.slice(g.i, g.j), at: g.at, lo: s[g.i].mid, hi: s[g.j - 1].mid }));
const largestRun = (plan) => { let m = 0; for (const gs of plan) for (const g of gs) if (g.j - g.i > m) m = g.j - g.i; return Math.max(1, m); };

/**
 * V-34 (fix-viz-5): a Clusters circle's radius for `n` postings, when `maxN` is drawn at `rMax`. viz-even sized
 * circles by the square root of their count with a 9 px floor, so on Amazon (largest 1,665) every circle under
 * 123 postings was the same 9 px dot and 1 posting looked like 123 (42–92% of circles on every board). Now:
 * - one posting is a small dot (`rOne`), so a lone posting never looks like a group;
 * - a group's area grows by the same amount for each posting, from the floor (`rMin`, 9 px) to `rMax` at maxN
 *   (d3's scaleRadial): 2 postings 9 px, 20 about 9.6, 123 about 12, 1,665 32 px on Amazon's desktop chart.
 */
export function circleRadius(n, maxN, { rMax = 16, rMin = 4.5, rOne = 3 } = {}) {
  const lo = Math.min(rMin, rMax);
  if (!(n > 1)) return Math.min(rOne, lo);
  const t = Math.min(1, (n - 1) / Math.max(1, maxN - 1));
  return Math.sqrt(lo * lo + (rMax * rMax - lo * lo) * t);
}

/**
 * V-33 (fix-viz-5): plan every row's circles (placeCircles) at the sizes they are drawn at, and stop on a plan that
 * is settled. A circle's size depends on the count it is sized against, and that count on how much the plan merges,
 * so viz-even re-planned until the largest count stopped changing (at most 4 passes). On Amazon's desktop chart it
 * never did: planned against 1,123 the circles are big and two real peaks ($87.4K × 1,123, $107.7K × 542) merge into
 * 1,665; planned against 1,665 they are smaller and stay apart, and so on. It stopped on the merged plan and drew it
 * at the other sizes.
 * Here the plan is always the one at the drawn sizes: sized against `maxN`, its largest circle holds at most maxN
 * postings. When re-planning against the largest count settles, maxN is that count (the largest circle is full size);
 * when it alternates, maxN is the smallest count (found by bisection) at which the plan's largest circle is no bigger,
 * so the plan merges only circles that would touch at the sizes they are drawn at. `edge` keeps the largest drawn
 * circle inside the plot (V-29, 6 px into the chips' gutters).
 *   rows: arrays of { mid } (in-axis items); x(value) -> px; plot: [left, right] px; sizes as circleRadius.
 *   -> { placed: one placeCircles result per row, maxN, largest, edge, plans }
 */
export function settleCircles(rows, { x, plot = null, rMax = 16, rMin = 4.5, rOne = 3, minPx = MIN_BIN_PX, gap = CIRCLE_GAP } = {}) {
  const opt = { rMax, rMin, rOne };
  const prepared = (rows || []).map(circleRuns);
  const edgeOf = (r) => Math.max(0, r - 6);
  const xAt = (edge) => (plot ? (v) => Math.min(plot[1] - edge, Math.max(plot[0] + edge, x(v))) : x);
  let plans = 0;
  const plan = (need, edge) => { plans++; const xd = xAt(edge); return prepared.map((pr) => planRuns(pr, xd, need)); };
  const sized = (M) => (a, b) => Math.max(minPx, circleRadius(a, M, opt) + circleRadius(b, M, opt) + gap);
  const tried = new Map();
  const at = (M) => { if (!tried.has(M)) { const P = plan(sized(M), edgeOf(rMax)); tried.set(M, { P, L: largestRun(P) }); } return tried.get(M); };
  // Start from a plan at full size (what the largest circle can hold), then follow the largest count.
  let M = largestRun(plan(() => 2 * rMax + gap, edgeOf(rMax)));
  let lo = 0, hi = Infinity, best = null;
  for (let k = 0; k < 6; k++) {
    const { L } = at(M);
    if (L === M) { best = M; break; }
    if (L < M) hi = Math.min(hi, M); else lo = Math.max(lo, M);
    if (tried.has(L) || (L > M && L >= hi)) break;
    M = L;
  }
  if (best == null) {
    if (!isFinite(hi)) hi = Math.max(1, ...[...tried.values()].map((t) => t.L));
    while (at(hi).L > hi) hi = at(hi).L; // never draw a circle above its size reference
    for (let k = 0; k < 8 && hi - lo > Math.max(1, hi * 0.02); k++) {
      const mid = Math.round(Math.sqrt(Math.max(1, lo) * hi));
      if (mid <= lo || mid >= hi) break;
      if (at(mid).L <= mid) hi = mid; else lo = mid;
    }
    best = hi;
  }
  let { P, L } = at(best);
  // Inside the plot by the largest drawn circle's own radius (the same plan unless that moves a circle at the edge).
  let edge = edgeOf(rMax);
  const e2 = edgeOf(circleRadius(L, best, opt));
  if (plot && e2 !== edge) {
    const P2 = plan(sized(best), e2);
    if (largestRun(P2) === L) { P = P2; edge = e2; }
  }
  return { placed: prepared.map((pr, k) => circlesOf(pr, P[k])), maxN: best, largest: L, edge, plans };
}

/**
 * viz-even: what makes two Ranges bars the same bar: the colour it is drawn in (`colour`, by default its
 * colour key; every department past the legend's seven is the one "Other" colour), the posted range (its
 * currency and values, converted the same way), the midpoint, and the bar's pattern (on-target earnings,
 * a span of several levels with the same levels, part-time hourly). Two postings with one key draw one bar.
 */
export function rangeKey(p, colour = p.key) {
  const sp = p.span || null;
  const levels = sp && sp.kind === 'levels' ? sp.tiers.map((t) => `${t.label || ''}:${t.min}-${t.max}`).join(',') : '';
  // V-41 (fix-viz-5): a stated minimum, or pay that includes the top shift differential, is never the same bar as a
  // plain posted range of the same figures (shared.js notBasePay).
  const nb = p.nb === undefined ? notBasePay(p.job) : p.nb;
  return [colour ?? '', p.cur, p.lo, p.hi, p.mid, p.ote ? 'ote' : '', sp ? `span:${levels}` : '', p.partTime ? 'pt' : '', nb || ''].join('\u0001');
}

/**
 * V-38 (fix-viz-5): a Ranges bar's thickness in px for a row of `n` postings, when the busiest row holds `maxN`. After
 * viz-even's stacking every distinct range was one 22 px row with the same 8 px bar, so a row of 775 postings looked
 * like a row of one, and rows of one posting took half the chart's height. The bar now thickens with the square root
 * of its count, from 3 px for one posting to 14 px (a 22 px row keeps 4 px above and below).
 */
export function barThickness(n, maxN, { min = 3, max = 14 } = {}) {
  if (!(maxN > 1) || !(n > 1)) return min;
  return Math.round((min + (max - min) * Math.sqrt(Math.min(1, (n - 1) / (maxN - 1)))) * 2) / 2;
}

/**
 * UX-59 (fix-viz-5): the Ranges axis. viz-even's axis ended at P99 of the postings' maximums, and as rows are stacked
 * the list leads with the highest pay, so on Amazon every bar on the first screen ran past it ("›"). The domain is now
 * the robust bounds (robustBounds: P1–P99 with a far-out fence, so one mis-parsed figure cannot stretch it) of the
 * range ends the rows show, each row once, padded and snapped to ticks.
 *   rows: [{ lo, hi, mid? }] -> { d0, d1, ticks }
 */
export function rangesDomain(rows, { count = 5 } = {}) {
  const r = (rows || []).filter((x) => x && isFinite(x.lo) && isFinite(x.hi));
  if (!r.length) return { d0: 0, d1: 1, ticks: [0, 1] };
  const mids = r.map((x) => (x.mid != null && isFinite(x.mid) ? x.mid : (x.lo + x.hi) / 2));
  const [mLo, mHi] = robustBounds(mids);
  const lo = Math.min(mLo, robustBounds(r.map((x) => x.lo))[0]);
  const hi = Math.max(mHi, robustBounds(r.map((x) => x.hi))[1]);
  const pad = Math.max((hi - lo) * AXIS_PAD, 1000);
  // The tightest of a few tick steps, so a coarse step does not add a third of empty axis ($445K to $600K).
  let nt = niceTicks(Math.max(0, lo - pad), hi + pad, count);
  for (let c = count + 1; c <= count + 4; c++) {
    const t = niceTicks(Math.max(0, lo - pad), hi + pad, c);
    if (t.end - t.start < nt.end - nt.start - 1e-6) nt = t;
  }
  const d0 = Math.max(0, nt.start), d1 = nt.end > d0 ? nt.end : d0 + 1;
  return { d0, d1, ticks: nt.ticks.filter((t) => t >= 0) };
}

/** UX-41 (fix-viz-5): a stacked Ranges row's name: its most common title, and how many other postings it holds. */
export function stackTitle(titles) {
  const c = new Map();
  for (const t of titles || []) c.set(t, (c.get(t) || 0) + 1);
  const [top, k] = [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] || ['Untitled', 0];
  const rest = (titles || []).length - k;
  return rest > 0 ? `${top} +${rest.toLocaleString()}` : top;
}

/**
 * viz-even: the Ranges rows. Many postings carry the same posted range (one band per level, repeated over
 * the level's roles: Microsoft's $119,800–$234,700 is on 247 postings), and the old view drew that bar once
 * per posting, rows of identical bars. Postings with the same bar (rangeKey) are now one row with their
 * count; every posting is still in a row, counted, and listed when its row is clicked.
 *   items: plotted items in drawing order -> [{ p: the first, items, n }] in the order of first appearance.
 */
export function stackRanges(items, keyFn = rangeKey) {
  const out = [], byKey = new Map();
  for (const p of items || []) {
    const k = keyFn(p);
    let row = byKey.get(k);
    if (!row) { row = { p, items: [], n: 0 }; byKey.set(k, row); out.push(row); }
    row.items.push(p);
    row.n++;
  }
  return out;
}

function primaryLocation(job) {
  const locs = job.locations || [];
  const onsite = locs.find(l => !l.remote);
  if (onsite) return onsite.city || onsite.name || 'Unknown';
  if (job.remote || locs.some(l => l.remote)) return 'Remote';
  return 'Unknown';
}

function locationText(job) {
  const locs = job.locations || [];
  if (!locs.length) return job.remote ? 'Remote' : '';
  const names = locs.map(l => l.name || l.city).filter(Boolean);
  return names.length > 3 ? `${names.slice(0, 3).join(' · ')} +${names.length - 3}` : names.join(' · ');
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function plural(n, one, many = one + 's') { return `${n.toLocaleString()} ${n === 1 ? one : many}`; }

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, i = Math.floor(pos), f = pos - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i];
}

function parseColor(str) {
  const t = String(str || '').trim();
  let m = t.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = t.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map(h => parseInt(h + h, 16));
  m = t.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/**
 * D-43 (fix-viz-5): a pay figure as the card writes it (app.js rangeEnd, SB-7): a figure in the millions keeps two
 * decimals ("$1.07M", "$1.2M", "$1M"; formatMoney wrote "$1.1M" for $1,066,000 and for $1,090,000), every other one
 * as formatMoney ("$600K"). Approx US dollars, like everything on the chart's axis.
 */
export function formatEnd(v) {
  const a = Math.abs(Number(v));
  if (!(a >= 999500 && a < 1e7)) return formatMoney(v);
  return `${v < 0 ? '-' : ''}$${+(a / 1e6).toFixed(2)}M`;
}
/** "$600K–$1.07M", or one figure when both ends write the same ("$44K"). */
export function formatRange(a, b) {
  const x = formatEnd(a), y = formatEnd(b);
  return x === y ? x : `${x}–${y}`;
}
const moneyRange = (a, b) => `${formatEnd(a)}–${formatEnd(b)}`;
/** viz-even: a circle's pay in words: "$213K", or "$168K–$200K" (its postings' lowest to highest midpoint). */
const binRange = (b) => (formatEnd(b.start) === formatEnd(b.end) ? formatEnd(b.at) : moneyRange(b.start, b.end));
/**
 * viz-even: what a circle stands for: "midpoint $213K" when its postings share one, else their median and
 * range ("midpoints $168K–$200K · median $200K"; `long`, for screen readers: "median $200K, midpoints $168K
 * to $200K").
 */
function midsText(b, long = false) {
  const lo = formatMoney(b.start), hi = formatMoney(b.end), at = formatMoney(b.at);
  if (lo === hi) return `midpoint ${at}`;
  return long ? `median ${at}, midpoints ${lo} to ${hi}` : `midpoints ${lo}–${hi} · median ${at}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-07-01' -> 'Jul 2026'. */
const formatMonth = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || '')); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(iso || ''); };

/**
 * Robust axis bounds: P1..P99, tightened by a Tukey far-out fence (Q1 − 3·IQR,
 * Q3 + 3·IQR) so that with few points one bad value (e.g. a mis-parsed $4.6M)
 * cannot stretch the axis and squash every other row. Returns [lo, hi] of
 * real data values (or interpolated percentiles), never beyond the data.
 */
export function robustBounds(values) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  let lo = quantile(v, 0.01), hi = quantile(v, 0.99);
  const q1 = quantile(v, 0.25), q3 = quantile(v, 0.75);
  const iqr = Math.max(q3 - q1, Math.abs(q3) * 0.1, 1);
  const fLo = q1 - 3 * iqr, fHi = q3 + 3 * iqr;
  if (hi > fHi) { const inl = v.filter(x => x <= fHi); hi = inl.length ? inl[inl.length - 1] : hi; }
  if (lo < fLo) { const inl = v.filter(x => x >= fLo); lo = inl.length ? inl[0] : lo; }
  return [lo, Math.max(lo, hi)];
}
const AXIS_PAD = 0.04;

// Text measurement for sizing the clusters label column (canvas, no layout thrash).
const LABEL_PAD = 16 + 8 + 10 + 12 + 4; // left pad + swatch + gap + right pad + slack
let measureCtx = null;
function textWidth(text, font) {
  try {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return Math.ceil(measureCtx.measureText(String(text)).width);
  } catch { return String(text).length * 7; }
} // pad the robust span by 4% on each side before snapping to ticks
/** UX-17: the width of an axis-edge chip ("›19": its text plus 5px padding a side, at least 18px). */
// UX-43 (fix-viz-5): the chip always says its count ("›1"); a bare "›" read as "next".
const chipWidth = (n, font) => Math.max(18, textWidth(`›${Number(n).toLocaleString()}`, font) + 10);
/**
 * UX-42 (fix-viz-5): a circle's count is drawn in tabular digits (viz.css font-variant-numeric), which canvas text
 * metrics ignore: "118" measured narrower than it draws (22.2 px of text in a 21.5 px circle). Every digit is
 * measured as the widest, "0", and the count needs 2 px of air each side; a circle under 16 px holds none.
 */
export function countFits(n, rad, font = '600 12px system-ui, sans-serif') {
  if (!(n >= 2) || rad < 8) return false;
  const t = shortCount(n);
  const w = textWidth(t.replace(/\d/g, '0'), font) - (rad < 11 ? 0.36 * t.length : 0); // --sm: letter-spacing -.03em
  return w + 4 <= 2 * rad;
}

export function createChart(container, { onSelect, onHover, onClusterSelect } = {}) {
  container.classList.add('ms-chart');
  container.replaceChildren();

  const head = el('div', 'ms-chart__head');
  const legend = el('div', 'ms-chart__legend');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', 'Legend');
  head.append(legend);

  const scroll = el('div', 'ms-chart__scroll');
  const sticky = el('div', 'ms-chart__sticky');
  const hist = el('div', 'ms-chart__hist');
  const axis = el('div', 'ms-chart__axis');
  // V-46 (fix-viz-5): on a phone, the axis's unit and the median caption on one line (renderAxis).
  const capRow = el('div', 'ms-chart__caprow');
  capRow.hidden = true;
  sticky.append(capRow, hist, axis);
  const body = el('div', 'ms-chart__body');
  body.tabIndex = 0;
  body.setAttribute('role', 'listbox');
  const grid = el('div', 'ms-chart__grid');
  const rowsEl = el('div', 'ms-chart__rows');
  grid.setAttribute('aria-hidden', 'true');
  rowsEl.setAttribute('role', 'none');
  body.append(grid, rowsEl);
  scroll.append(sticky, body);

  const foot = el('div', 'ms-chart__foot');
  const empty = el('div', 'ms-chart__empty');
  empty.hidden = true;
  container.append(head, scroll, empty, foot);

  const tip = el('div', 'ms-viz-tip');
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  // fix-touch-tips (features/shared.js "Floating tips and touch"): circles, row names and Ranges rows act on the
  // first tap with no tip; the pay strip's bars show theirs on a tap. A press elsewhere, a scroll that moves the
  // tip's item, or Esc closes any tip; a keyboard tip follows its item.
  let tipKind = null;        // what opened the tip: 'mouse', 'touch' or 'keyboard'
  let histTip = null;        // the strip bar whose tip a tap opened
  const closer = tipCloser(() => { onLeave(); clearHist(); });
  /** Arm the closer for a tip just placed at `anchor`, opened by `kind`; a keyboard tip re-places itself with `place`. */
  function armTip(anchor, kind, inside, place) {
    tipKind = kind;
    closer.arm({ inside: [inside], anchor, follow: kind === 'keyboard' && place ? () => (inView(anchor) ? (place(), true) : false) : null });
  }

  const uid = 'ms-c' + Math.random().toString(36).slice(2, 8);
  let jobs = [];
  let opts = { view: DEFAULT_VIEW, groupBy: 'department', colorBy: 'none' };
  let plotted = [];          // [{ job, lo, hi, mid, cur, key }]
  let highlighted = null;
  let width = 0;
  let raf = 0;
  let outCount = 0;          // postings whose midpoint is beyond the axis domain (shown as ›/‹ markers)
  // ranges view state
  let idxByJob = new Map();  // jobId -> option index (ranges)
  let rowY = [];             // option index -> y (ranges)
  let rowH = ROW_H;          // ranges row height for the current layout
  let itemByRow = [];        // row index -> plotted item
  let hoverIdx = -1;
  let activeIdx = -1;
  // clusters view state
  let cRows = [];            // [{ key, name, all, items, median, p25, p75, color, ink, el, labelEl, bins: [...] }]
  let binByJob = new Map();  // jobId -> bin
  let cActive = null;        // { r, i } (i = -1: the row label)
  let cHover = null;         // bin element
  let selectedKey = null;    // "rowKey\0binStart" or "rowKey\0*"
  let chipFont = '700 12px system-ui, sans-serif'; // the edge chips' font (renderClusters)
  let foldOpen = false;      // UX-24: the "N more departments" row is opened
  let rowNotes = { offRow: 0, basis: null, basisLeft: 0, spans: 0, partTime: 0 }; // notes-line counts from the rows (V-18 to V-21)
  let hostNotes = [];        // UX-57: the host's facts (app.js: the stats line's), listed first in the notes' Details
  let noteStats = null;      // the last render's stats, so setNotes can redo the notes alone

  // ---------- data prep ----------
  // V-47 (fix-viz-5): a view switch or a new Group by draws the same postings at the same pay, so chartPay's items,
  // the medians and the circle plan are kept for the same list and Location filter (payMemo, planMemo).
  let payMemo = null;
  let payVersion = 0;
  function prepare() {
    // BP-2: under a Location filter only pay posted for those places; BP-13: base-pay medians.
    const pk = opts.places ? opts.places.join('\u0001') : '';
    // The app re-derives its list on any change (a Group by, a view switch): the same postings in the same order are
    // the same list.
    const same = payMemo && (payMemo.jobs === jobs || (payMemo.jobs.length === jobs.length && jobs.every((j, i) => j === payMemo.jobs[i])));
    if (!same || payMemo.pk !== pk || payMemo.test !== opts.placeTest) {
      const r = chartPay(jobs, { places: opts.places, placeTest: opts.placeTest });
      payMemo = { jobs, pk, test: opts.placeTest, r, pay: headPay(r.plotted), keyDim: null, v: ++payVersion }; // MR-39
    }
    plotted = payMemo.r.plotted;
    if (payMemo.keyDim !== opts.colorBy) { for (const p of plotted) p.key = keyOf(p.job, opts.colorBy); payMemo.keyDim = opts.colorBy; }
    return { ...payMemo.r, pay: payMemo.pay };
  }

  // ---------- windowed rows (PERF-2) ----------
  // Rows have fixed heights, so each view computes a flat list of { y, h, build, unbuild }
  // items and only the ones within the visible window (plus a buffer) exist in the DOM.
  // A 2,400-posting board therefore builds ~60 rows instead of ~1,800, and scrolling
  // paints new rows in one rAF from a DocumentFragment, with two rect reads per paint.
  const V_BUFFER = 600;
  let vItems = [];
  let vPainted = new Map(); // item index -> element
  let vRaf = 0;
  function vReset() {
    for (const [i] of vPainted) vItems[i]?.unbuild?.();
    vItems = []; vPainted = new Map();
    if (vRaf) { cancelAnimationFrame(vRaf); vRaf = 0; }
    rowsEl.replaceChildren();
  }
  function paint() {
    vRaf = 0;
    const n = vItems.length;
    if (!n || scroll.hidden) return;
    const br = body.getBoundingClientRect();
    let clipTop = 0, clipBot = innerHeight;
    if (!container.classList.contains('ms-chart--flow')) { const sr = scroll.getBoundingClientRect(); clipTop = sr.top; clipBot = sr.bottom; }
    const top = clipTop - br.top - V_BUFFER, bot = clipBot - br.top + V_BUFFER;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (vItems[m].y + vItems[m].h < top) lo = m + 1; else hi = m; }
    let end = lo;
    while (end < n && vItems[end].y <= bot) end++;
    if (end === lo && n) end = Math.min(n, lo + 1);
    for (const [i, e] of vPainted) if (i < lo || i >= end) { e.remove(); vPainted.delete(i); vItems[i].unbuild?.(); }
    const frag = document.createDocumentFragment();
    for (let i = lo; i < end; i++) {
      if (vPainted.has(i)) continue;
      const it = vItems[i];
      const e = it.build();
      e.style.top = it.y + 'px';
      vPainted.set(i, e);
      frag.append(e);
    }
    if (frag.childNodes.length) rowsEl.append(frag);
  }
  const schedulePaint = () => { if (!vRaf && vItems.length) vRaf = requestAnimationFrame(paint); };
  /** Scroll so that [y, y+h] (body coordinates) is visible, then paint synchronously. */
  function scrollToY(y, h, smooth = false) {
    const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    const stickyH = sticky.offsetHeight;
    if (container.classList.contains('ms-chart--flow')) {
      const br = body.getBoundingClientRect();
      const t = br.top + y, b = t + h;
      if (t < stickyH + 8 || b > innerHeight - 8) scrollTo({ top: scrollY + t - innerHeight / 2 + h / 2, behavior });
    } else {
      const top = body.offsetTop + y;
      const viewTop = scroll.scrollTop + stickyH, viewBot = scroll.scrollTop + scroll.clientHeight;
      if (top < viewTop + 4 || top + h > viewBot - 4) {
        const target = top - stickyH - (scroll.clientHeight - stickyH) / 2 + h / 2;
        if (behavior === 'auto') scroll.scrollTop = target; else scroll.scrollTo({ top: target, behavior });
      }
    }
    paint();
    if (behavior === 'smooth') setTimeout(paint, 450); // smooth scroll lands later
  }

  // ---------- render (shared) ----------
  // V-47: the container's font and surface, read once a draw before any row changes (a read after them forced a
  // style pass over the whole chart, several times a draw).
  let curFam = 'system-ui, sans-serif', curSurf = null, histShown = true;
  function render() {
    raf = 0;
    width = scroll.clientWidth || container.clientWidth || 800;
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(container); curFam = cs.fontFamily || curFam; curSurf = parseColor(cs.backgroundColor);
      histShown = getComputedStyle(hist).display !== 'none'; // short screens hide the strip (styles.css), and its median caption
    }
    const stats = prepare();
    const clusters = opts.view === 'clusters';
    container.classList.toggle('ms-chart--clusters', clusters);
    container.classList.toggle('ms-chart--ranges', !clusters);
    body.setAttribute('aria-label', clusters
      ? `Salary clusters by ${opts.groupBy === 'none' ? 'all roles' : DIM_LABEL[opts.groupBy] || opts.groupBy}. Arrow keys move, Enter selects`
      : 'Salary ranges, use arrow keys to move and Enter to open');

    // Keep the keyboard-active option on the same thing across re-renders;
    // never let a stale index point at something else.
    const activeJobId = itemByRow[activeIdx]?.job.id ?? null;
    const activeCKey = cActive ? cKeyOf(cActive.r, cActive.i) : null;
    activeIdx = -1; cActive = null; hoverIdx = -1; cHover = null;
    body.removeAttribute('aria-activedescendant');
    idxByJob = new Map(); rowY = []; itemByRow = []; binByJob = new Map(); cRows = []; outCount = 0;
    rowNotes = { offRow: 0, basis: null, basisLeft: 0, spans: 0, partTime: 0 };
    vReset();
    hideTip();

    const narrow = width < 520;
    container.classList.toggle('ms-chart--narrow', narrow);

    if (!plotted.length) {
      head.hidden = true;
      scroll.hidden = true;
      // P-16: one message, with its real cause. No postings at all: the host says why (search or
      // filters), unless it handed the chart the words.
      const e = opts.empty;
      // BP-2: under a Location filter, ranges posted for another country are not "no salary".
      const msg = jobs.length
        ? (stats.elsewhere
          ? [`No pay posted for ${placesPhrase(opts.places) || 'these places'}`,
            `${plural(jobs.length, 'posting')} match; ${stats.elsewhere.toLocaleString()} ${stats.elsewhere === 1 ? 'lists' : 'list'} pay for ${stats.otherPlaces === stats.elsewhere ? 'other places' : stats.otherPlaces ? 'other places or countries' : 'another country'} only, so the chart leaves ${stats.elsewhere === 1 ? 'it' : 'them'} out.`]
          : ['No published salaries', `${plural(jobs.length, 'posting')} match, but none list a salary range.`])
        : e ? (typeof e === 'string' ? [e, ''] : [e.title || '', e.sub || '']) : null;
      empty.hidden = !msg;
      empty.replaceChildren(...(msg ? [el('div', 'ms-chart__empty-title', msg[0]), msg[1] ? el('div', 'ms-chart__empty-sub', msg[1]) : ''].filter(Boolean) : []));
      renderNotes(stats);
      return;
    }
    scroll.hidden = false;
    empty.hidden = true;

    if (clusters) {
      head.hidden = true;
      renderClusters(stats, narrow);
      if (activeCKey) { const a = cFindKey(activeCKey); if (a) cActive = { r: a.r, i: a.i }; }
    } else {
      renderRanges(stats, narrow);
      const ai = activeJobId != null ? rowOfJob(activeJobId) : undefined;
      if (ai != null) activeIdx = ai; // applied when the row is built
    }
    renderNotes(stats);

    // Scroll mode: scroll internally only when the container constrains height;
    // otherwise flow with the page so the sticky header sticks to the viewport.
    container.classList.remove('ms-chart--flow');
    if (scroll.scrollHeight <= scroll.clientHeight + 1) container.classList.add('ms-chart--flow');
    paint();

    if (highlighted) applyHighlight(highlighted, false);
  }

  function renderNotes(stats) {
    noteStats = stats;
    const { noSalary, fxCount, unknownFx, elsewhere, otherPlaces = 0, pay } = stats;
    const where = placesPhrase(opts.places);
    // fix-density: one line with the two counts a job seeker needs ("564 with pay · 81 without"); every
    // other caveat in the short list behind "Details" (public/viz/note.js), in plain words.
    const line = [];
    if (plotted.length || noSalary) line.push(`${plotted.length.toLocaleString()} with pay${where && plotted.length ? ` for ${where}` : ''}`);
    if (noSalary) line.push(`${noSalary.toLocaleString()} without`);
    const isAre = (n) => (n === 1 ? 'is' : 'are');
    const details = [
      ...hostNotes,
      // BP-2: with a Location filter, the plotted pay is for those places, and the rest is counted.
      elsewhere - otherPlaces ? `${plural(elsewhere - otherPlaces, 'posting')} with pay for another country only ${isAre(elsewhere - otherPlaces)} left out${where ? `: that pay says nothing about pay in ${where}` : ''}` : '',
      // fix-pay-at-place (the lead decision of 2026-10-16): a posting that prices other places in rows of their own has no pay posted here.
      otherPlaces ? `${plural(otherPlaces, 'posting')} with pay posted for other places only ${isAre(otherPlaces)} left out${where ? `: none is posted for ${where}` : ''}` : '',
      // V-18: Group by Location rows hold only the pay posted for their place.
      rowNotes.offRow ? `${plural(rowNotes.offRow, 'posting')} with pay for another place than their row’s ${isAre(rowNotes.offRow)} not in the rows` : '',
      // V-21: rows compare one country's pay when the board mixes currencies.
      rowNotes.basis && rowNotes.basisLeft ? `Each row’s median is pay ${payBasisPlace(rowNotes.basis)} only: ${rowNotes.basisLeft.toLocaleString()} paid elsewhere ${isAre(rowNotes.basisLeft)} on the chart, not in the medians` : '',
      // fix-touch-tips: a row marked "several countries’ pay" (or "mixed") says why here too, not only in its hover title.
      mixedRowsNote(),
      // BP-13: on-target earnings are plotted but not in the medians (the stats line's rule).
      pay?.oteLeftOut ? `${pay.oteLeftOut.toLocaleString()} with on-target earnings (base plus commission) ${isAre(pay.oteLeftOut)} on the chart, not in the medians`
        : pay?.oteOnly ? 'All of this pay is on-target earnings (base plus commission at target)' : '',
      // MR-28 (fix-viz-5): stated minimums, shift-inclusive and part-time pay are posted pay, not base pay ranges.
      notBaseNote(pay),
      // V-20 / V-19: what the Ranges bars that are not one posted yearly range look like.
      rowNotes.spans ? `${rowNotes.spans.toLocaleString()} striped: one posting’s range over several levels or places` : '',
      rowNotes.partTime ? `${rowNotes.partTime.toLocaleString()} part-time hourly, shown as a year if full-time` : '',
      outCount ? `${plural(outCount, 'posting')} past the edge of the chart (›)` : '',
      noSalary ? `${noSalary.toLocaleString()} with no salary posted, so not on the chart` : '',
      unknownFx.length ? `${unknownFx.join(', ')} pay shown unconverted` : '',
      // MR-2: the exchange rates' date in the text itself (a hover title is out of reach on a phone),
      // linked to the methodology section that names their source.
      fxCount ? [`${fxCount.toLocaleString()} converted from another currency at `, fxLink(FX_AS_OF), ', so approximate'] : '',
      plotted.length ? 'Pay is yearly, in approx US dollars' : '',
    ];
    renderNote(foot, { line: line.join(' · '), details, key: 'chart-notes' });
    foot.hidden = !line.length;
  }

  /** MR-28: what the medians leave out, as posted (shared.js notBasePay); '' for none. */
  function notBaseNote(pay) {
    if (!pay) return '';
    if (pay.notBaseOnly) return `None of this pay is a posted base pay range (${notBaseWords(pay.notBaseKinds)}), so the medians are of it as posted`;
    const k = pay.notBaseLeftOut || {}, n = (k.minimum || 0) + (k.shiftPay || 0) + (k.partTime || 0);
    return n ? `${notBaseWords(k)} ${n === 1 ? 'is' : 'are'} on the chart as posted, not in the medians: a stated minimum, or hourly pay with the top shift differential or part-time, is not a base pay range` : '';
  }

  /** The Clusters rows whose median mixes several countries' pay (r.basis 'mixed'), in one sentence; '' for none. */
  function mixedRowsNote() {
    if (opts.view !== 'clusters') return '';
    const names = cRows.filter((r) => r.basis === 'mixed' && !r.fold && r.items?.length).map((r) => r.name);
    if (!names.length) return '';
    const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
    return names.length === 1
      ? `${list} has pay for several countries only, converted to US dollars, so its median mixes them`
      : `${list} have pay for several countries only, converted to US dollars, so their medians mix them`;
  }

  /** MR-2: "Jul 2026 exchange rates" for the rates of `asOf`, a link to the section that names their source. */
  function fxLink(asOf) {
    const month = formatMonth(asOf);
    const a = el('a', 'ms-chart__fx', `${month} exchange rates`);
    a.href = FX_DOC;
    a.title = `Fixed rates as of ${month}: ${FX_SOURCE_SHORT}`;
    return a;
  }

  /** BP-13: what the median caption says ("Median base pay", or on-target earnings when that is all). */
  function medianCaption(pay) {
    return pay?.oteOnly ? 'Median on-target earnings ' : pay?.notBaseOnly ? 'Median posted pay ' : 'Median base pay ';
  }
  function medianTitle(pay) {
    const where = placesPhrase(opts.places);
    const here = where ? ` posted for ${where}` : '';
    if (pay?.oteOnly) return `The middle of the on-target earnings (base plus commission at target) ranges${here}: half are above and half below`;
    if (pay?.notBaseOnly) return `The middle of the posted pay${here}, none of which is a posted base pay range (${notBaseWords(pay.notBaseKinds)}): half are above and half below`;
    const nb = notBaseWords(pay?.notBaseLeftOut);
    const basis = medianBasis(pay) ? `. Pay ${payBasisPlace(pay.basis)} only: ${plural(pay.basisLeft, 'posting')} with pay for other countries ${pay.basisLeft === 1 ? 'is' : 'are'} on the chart, not in the median` : '';
    return `The middle of the base pay ranges${here}: half are above and half below${pay?.oteLeftOut ? `. ${plural(pay.oteLeftOut, 'posting')} with on-target earnings (base plus commission) left out` : ''}${nb ? `. ${nb} left out` : ''}${basis}`;
  }
  /** V-46: the label column a landscape phone's axis caption needs, "US dollars a year · median $214K", in px. */
  function capNeed(pay) {
    const f = `12px ${curFam}`, med = pay?.median ?? median(plotted.map((p) => p.mid));
    return Math.ceil(textWidth('US dollars a year · ', f) + textWidth(`median ${formatMoney(med)}${medianBasis(pay)}`, `600 ${f}`)) + 16 + 6;
  }
  /**
   * V-46, UX-61 (fix-viz-5): what the axis is, in one currency name ("US dollars a year"), as long as fits `w` px:
   * the label column on a desktop (it was cut at 540 px, the Surface Duo), the phone's caption line otherwise.
   */
  function axisCaption(approx, w, font) {
    const variants = approx ? ['Yearly pay, US dollars (converted)', 'US dollars a year, converted', 'US dollars a year'] : ['Yearly pay, US dollars', 'US dollars a year'];
    return variants.find((v) => textWidth(v, font) <= w) || variants[variants.length - 1];
  }

  function renderHist(x, d0, d1, plotL, plotW, labelW, pay) {
    const nb = Math.max(16, Math.min(60, Math.round(plotW / 10)));
    const bw = (d1 - d0) / nb;
    const bins = new Array(nb).fill(0);
    for (const p of plotted) {
      if (p.mid < d0 || p.mid > d1) continue; // overflow is shown by the row markers, not piled into an edge bin
      bins[Math.min(nb - 1, Math.max(0, Math.floor((p.mid - d0) / bw)))]++;
    }
    const maxB = Math.max(...bins);
    hist.replaceChildren();
    hist.style.height = HIST_H + 'px';
    const med = pay?.median ?? median(plotted.map(p => p.mid));
    if (labelW > 0) {
      const cap = el('div', 'ms-hist__cap');
      cap.style.width = labelW + 'px';
      cap.append(el('span', 'ms-hist__title', medianCaption(pay)), el('span', 'ms-hist__sub', `${formatMoney(med)}${medianBasis(pay)}`));
      cap.title = medianTitle(pay);
      hist.append(cap);
    }
    const pxW = plotW / nb;
    bins.forEach((n, i) => {
      if (!n) return;
      const b = el('div', 'ms-hist__bin');
      const h = Math.max(2, Math.round((n / maxB) * (HIST_H - 6)));
      b.style.left = (plotL + i * pxW + (pxW > 4 ? 1 : 0)) + 'px';
      b.style.width = Math.max(1, pxW - (pxW > 4 ? 2 : 0)) + 'px';
      b.style.height = h + 'px';
      b.dataset.n = n;
      b.dataset.a = d0 + i * bw;
      b.dataset.b = d0 + (i + 1) * bw;
      hist.append(b);
    });
    const ml = el('div', 'ms-hist__median');
    ml.style.left = x(Math.min(d1, Math.max(d0, med))) + 'px';
    hist.append(ml);
  }

  function renderAxis(ticks, x, approx, labelW, narrow, pay) {
    axis.replaceChildren();
    const capTitle = approx ? 'Yearly pay in US dollars; pay in other currencies is converted at fixed rates' : 'Yearly pay in US dollars';
    const fam = curFam;
    if (labelW > 0) {
      // I-3: plain words ("Annual salary · approx USD" read as jargon).
      const w = labelW - 16 - 4, f = `12px ${fam}`;
      const cap = el('div', 'ms-axis__cap', axisCaption(approx, w, f));
      if (!histShown) {
        // V-46: a landscape phone hides the strip and its median caption, so the axis caption carries the median too.
        const med = pay?.median ?? median(plotted.map((p) => p.mid));
        const m = `median ${formatMoney(med)}${medianBasis(pay)}`;
        const units = approx ? ['US dollars a year, converted', 'US dollars a year'] : ['US dollars a year'];
        const unit = units.find((u) => textWidth(`${u} · `, f) + textWidth(m, `600 ${f}`) <= w) || units[units.length - 1];
        const mEl = el('span', 'ms-chart__capmed', m);
        mEl.title = medianTitle(pay);
        cap.replaceChildren(unit, el('span', 'ms-chart__capsep', ' · '), mEl);
      }
      cap.title = capTitle;
      cap.style.width = labelW + 'px';
      axis.append(cap);
      capRow.hidden = true;
    } else {
      // V-46 (fix-viz-5): a phone has no label column, so the axis's unit and the median sit on one line above the
      // strip: "US dollars a year · Median base pay $141K", shorter forms when that does not fit.
      const med = pay?.median ?? median(plotted.map((p) => p.mid));
      const room = Math.max(0, width - 24);
      const medFull = `${medianCaption(pay).trim()} ${formatMoney(med)}${medianBasis(pay)}`, medShort = `median ${formatMoney(med)}${medianBasis(pay)}`;
      const cands = [];
      for (const unit of approx ? ['US dollars a year, converted', 'US dollars a year'] : ['US dollars a year']) cands.push([unit, medFull], [unit, medShort]);
      const f = `12px ${fam}`, fb = `600 12px ${fam}`;
      const [unit, m] = cands.find(([u, mm]) => textWidth(`${u} · `, f) + textWidth(mm, fb) <= room) || cands[cands.length - 1];
      const u = el('span', 'ms-chart__capunit', unit);
      u.title = capTitle;
      const mEl = el('span', 'ms-chart__capmed', m);
      mEl.title = medianTitle(pay);
      capRow.replaceChildren(u, el('span', 'ms-chart__capsep', ' · '), mEl);
      capRow.hidden = false;
    }
    const minGap = 60; // label width (~40px) + air, so ticks never touch (DES-6)
    let lastX = -Infinity;
    ticks.forEach(t => {
      const px = x(t);
      if (px - lastX < minGap) return;
      lastX = px;
      const tk = el('div', 'ms-axis__tick', formatTick(t));
      tk.style.left = px + 'px';
      // DES-6: keep edge labels inside the chart (they were clipped at phone width).
      if (px < 24) tk.classList.add('ms-axis__tick--start');
      else if (px > width - 24) tk.classList.add('ms-axis__tick--end');
      axis.append(tk);
    });
  }

  function renderGridlines(ticks, x, frag) {
    for (const t of ticks) {
      const gl = el('div', 'ms-chart__gridline');
      gl.style.left = x(t) + 'px';
      frag.prepend(gl);
    }
  }

  // ======================= clusters view =======================
  function renderClusters(stats, narrow) {
    // Rows first (names, counts, medians), so the label column can be sized to fit them.
    const dim = opts.groupBy;
    const m = new Map();
    const rowOf = k => { if (!m.has(k)) m.set(k, { key: k, name: groupName(dim, k), all: [], items: [], offPay: 0 }); return m.get(k); };
    // V-18: a Location row holds the roles listed there first, but only the pay posted for there.
    const locTest = dim === 'location' ? placeMatcher(opts.places, opts.placeTest) : null;
    const rowKey = (job) => (dim === 'none' ? ALL_ROLES : dim === 'location' ? locationRowKey(job, locTest) : keyOf(job, dim));
    const keyById = new Map();
    for (const job of jobs) { const k = rowKey(job); keyById.set(job.id, k); rowOf(k).all.push(job); }
    let offRow = 0;
    for (const p of plotted) {
      const k = keyById.get(p.job.id) ?? rowKey(p.job);
      // V-36 (fix-pay-at-place): a Location row prices each posting at the pay posted for the row's place
      // (Nashville's own row, not the headline Bellevue row), or leaves it out of the row's pay.
      const q = dim === 'location' ? locationRowItem(p, k, locTest) : p;
      if (!q) { rowOf(k).offPay++; offRow++; continue; }
      rowOf(k).items.push(q);
    }
    cRows = [...m.values()];
    const drawnItems = dim === 'location' ? cRows.flatMap((r) => r.items) : plotted;
    // UX-24: more departments than colours: the 7 with the most postings with pay keep their rows
    // (and colours); the rest fold into one "N more departments" row, which opens on a click.
    let foldRow = null, folded = [];
    if (FOLD_NOUN[dim] && cRows.length > SLOT_COUNT) {
      const rank = cRows.slice().sort((a, b) => b.items.length - a.items.length || b.all.length - a.all.length || String(a.key).localeCompare(String(b.key)));
      const keep = new Set(rank.slice(0, SLOT_COUNT - 1));
      folded = cRows.filter((r) => !keep.has(r));
      foldRow = { key: '\u0001more', name: `${folded.length.toLocaleString()} more ${FOLD_NOUN[dim]}`, all: folded.flatMap((r) => r.all), items: folded.flatMap((r) => r.items), offPay: 0, fold: true };
      cRows = [...cRows.filter((r) => keep.has(r)), foldRow, ...(foldOpen ? folded : [])];
      for (const r of folded) r.inFold = true;
    } else if (!FOLD_NOUN[dim]) foldOpen = false;
    // V-21: rows grouped by department, company or seniority compare one country's pay when the board mixes currencies.
    const main = BASIS_DIMS.has(dim) ? mainBasis(plotted) : null;
    let basisLeft = 0;
    for (const r of cRows) {
      // BP-13: the row's median, quartiles and band are base pay (on-target earnings only when
      // that is all the row has, and then it says so).
      const b = basisStats(r.items, main);
      const ps = b.stats;
      r.basis = main ? b.basis : null; r.basisLeft = b.left;
      if (!r.inFold) basisLeft += b.left;
      r.median = ps.median; r.p25 = ps.p25; r.p75 = ps.p75;
      // MR-28: a row whose pay is all stated minimums (or shift-inclusive or part-time pay) says what its median is of.
      const kind = ps.oteOnly && !stats.pay?.oteOnly ? 'on-target ' : ps.notBaseOnly && !stats.pay?.notBaseOnly ? (ps.notBaseKinds.minimum === ps.n ? 'from ' : 'posted ') : '';
      // BP-2: a row whose ranges are all for another country has no salary posted for here.
      const none = r.offPay || (stats.elsewhere && r.all.some((j) => stats.elsewhereIds.has(j.id))) ? 'no pay posted for here' : 'no pay listed'; // UX-61 (fix-phone-text): the cards' words
      r.noneText = r.items.length ? '' : none;
      // V-42 (fix-viz-5): the band's values, written where a screen reader and a hover reach them.
      r.mid50 = r.items.length && r.p25 != null && r.p75 != null && formatMoney(r.p25) !== formatMoney(r.p75) ? `middle half ${formatMoney(r.p25)} to ${formatMoney(r.p75)}` : '';
      // UX-40 (fix-viz-5): one visible form for every row and width ("1,215 roles · $178K"); the pay's country only when
      // the row's median is another country's pay than the other rows' (each row's basis is in the notes' Details).
      const other = r.basis && r.basis !== main ? basisWords(r) : '';
      r.sub = r.items.length ? `${plural(r.all.length, 'role')} · ${kind}${formatMoney(r.median)}${other}` : `${plural(r.all.length, 'role')} · ${none}`;
      r.subTight = r.items.length && other ? `${plural(r.all.length, 'role')} · ${kind}${formatMoney(r.median)}${basisWordsShort(r)}` : r.sub;
      // The long words, for the accessible names and titles.
      r.subFull = r.items.length ? `${plural(r.all.length, 'role')} · ${kind || ''}median ${formatMoney(r.median)}${basisWords(r)}${r.mid50 ? `, ${r.mid50}` : ''}` : `${plural(r.all.length, 'role')} · ${none}`;
      const why = [];
      const leftNb = ps.notBaseLeftOut, nbN = leftNb.minimum + leftNb.shiftPay + leftNb.partTime;
      if (nbN) why.push(`${notBaseWords(leftNb)} ${nbN === 1 ? 'is' : 'are'} in the circles, not in the median.`);
      else if (ps.notBaseOnly) why.push(`None of this row's pay is a posted base pay range (${notBaseWords(ps.notBaseKinds)}), so its median is of them.`);
      if (r.basisLeft) why.push(`The median is pay ${payBasisPlace(r.basis)} only: ${plural(r.basisLeft, 'posting')} with pay for other countries ${r.basisLeft === 1 ? 'is' : 'are'} in the circles, not in the median.`);
      else if (r.basis === 'mixed') why.push('This row has pay for several countries only, converted to US dollars: its median mixes them.');
      if (r.offPay) why.push(`${plural(r.offPay, 'posting')} here ${r.offPay === 1 ? 'lists' : 'list'} pay for another place only, so ${r.offPay === 1 ? 'it is' : 'they are'} not in this row's pay.`);
      r.why = why.join(' ');
    }
    rowNotes = { ...rowNotes, offRow, basis: main, basisLeft };

    // Label column: wide enough that "N roles · median $XK" always shows in full and the
    // group name fits on at most two lines; capped at 36% of the width (then the subtitle
    // switches to the short "69 · $512K" form instead of truncating).
    let labelW = 0;
    const fam = curFam;
    const NAME_FONT = `600 13px ${fam}`, SUB_FONT = `12px ${fam}`;
    if (!narrow) {
      const maxW = Math.max(150, Math.min(320, Math.round(width * 0.36)));
      let need = 0;
      for (const r of cRows) {
        const nameW = textWidth(r.name, NAME_FONT);
        need = Math.max(need, textWidth(r.sub, SUB_FONT), nameW > 150 ? Math.min(nameW, nameW / 2 + 24) : nameW);
      }
      // BP-13: the median caption ("Median base pay $347K") shows in full too.
      need = Math.max(need, textWidth(`${medianCaption(stats.pay)}${formatMoney(stats.pay?.median)}${medianBasis(stats.pay)}`, `600 ${SUB_FONT}`) - 8);
      labelW = Math.round(Math.max(150, Math.min(maxW, need + LABEL_PAD)));
      // V-46: with the strip hidden (landscape phones) the axis caption carries the median too, on one line.
      if (!histShown) labelW = Math.max(labelW, Math.min(Math.round(width * 0.4), capNeed(stats.pay)));
      for (const r of cRows) if (textWidth(r.sub, SUB_FONT) + LABEL_PAD > labelW) r.sub = r.subTight;
    } else {
      for (const r of cRows) r.sub = r.subTight; // stacked label line: the row's name gives way first
    }
    // Robust domain: P1..P99 of midpoints, padded, snapped to $50K/$100K/$250K ticks.
    const domainItems = drawnItems.length ? drawnItems : plotted;
    const [lo, hi] = domainItems === plotted && payMemo ? (payMemo.midBounds ||= robustBounds(plotted.map((p) => p.mid))) : robustBounds(domainItems.map((p) => p.mid));
    const span = Math.max(1, hi - lo);
    const step = span > 1500000 ? 250000 : span > 300000 ? 100000 : 50000;
    const pad = Math.max(span * AXIS_PAD, 1000);
    const d0 = Math.max(0, Math.floor((lo - pad) / step) * step);
    let d1 = Math.ceil((hi + pad) / step) * step;
    if (d1 <= d0) d1 = d0 + step;
    // UX-17: the "‹12" / "›19" chips sit in their own gutters outside the plot, sized to the widest
    // chip, so they never run off a phone screen or into the row labels.
    const CHIP_FONT = chipFont = `700 12px ${fam}`;
    let chipLo = 0, chipHi = 0;
    for (const r of cRows) {
      let nb = 0, na = 0;
      for (const p of r.items) { if (p.mid < d0) nb++; else if (p.mid > d1) na++; }
      if (nb) chipLo = Math.max(chipLo, chipWidth(nb, CHIP_FONT));
      if (na) chipHi = Math.max(chipHi, chipWidth(na, CHIP_FONT));
    }
    const plotL = (narrow ? 16 : labelW + 16) + (chipLo ? chipLo + 6 : 0);
    const padR = Math.max(narrow ? 16 : 32, chipHi ? chipHi + 6 + (narrow ? 8 : 10) : 0);
    const plotW = Math.max(80, width - plotL - padR);
    // A lone row ("All roles", or a single group) gets more height and bigger circles.
    const solo = cRows.length === 1;
    const x = v => plotL + ((v - d0) / (d1 - d0)) * plotW;
    const xc = v => x(Math.min(d1, Math.max(d0, v)));
    const ticks = [];
    for (let t = d0; t <= d1 + 1; t += step) ticks.push(t);
    container.style.setProperty('--ms-plot-l', plotL + 'px');
    container.style.setProperty('--ms-label-w', labelW + 'px');
    container.classList.remove('ms-chart--stack');
    renderHist(x, d0, d1, plotL, plotW, labelW, stats.pay);
    renderAxis(ticks, x, stats.fxCount > 0, labelW, narrow, stats.pay);

    // viz-even: circles stand where the postings are (placeCircles): each at the median midpoint of the
    // postings it holds, sized by their count, with no two circles touching. V-33 (fix-viz-5): the plan is the one
    // at the drawn sizes (settleCircles), and V-34: one posting is a small dot and each posting adds the same area
    // (circleRadius).
    const plotH = narrow ? (solo ? 72 : CROW_PLOT_H) : (solo ? 92 : CROW_H);
    const rowH = narrow ? CROW_LABEL_H + plotH : plotH;
    const rMax = Math.max(6, Math.min(plotH / 2 - 9, solo ? 30 : 16));
    const sizes = { rMax, rMin: Math.min(4.5, rMax), rOne: Math.min(3, rMax) };
    const inAxis = cRows.map((r) => r.items.filter((p) => p.mid >= d0 && p.mid <= d1));
    // V-47: the same rows on the same axis are the same plan (a view switch and back).
    const planKey = [payMemo?.v, dim, foldOpen, plotL, plotW, d0, d1, rMax].join('|');
    const plan = payMemo?.plan?.key === planKey ? payMemo.plan.value : settleCircles(inAxis, { x, plot: [plotL, plotL + plotW], ...sizes });
    if (payMemo) payMemo.plan = { key: planKey, value: plan };
    const placed = plan.placed;
    // V-29: a circle never runs past the plot into the axis-edge "‹" / "›" chips' gutters (6px out).
    const edge = plan.edge;
    const xd = (v) => Math.min(plotL + plotW - edge, Math.max(plotL + edge, x(v)));
    const radiusAt = (n) => circleRadius(n, plan.maxN, sizes);
    body.dataset.planN = plan.maxN; body.dataset.rMax = rMax; body.dataset.edge = edge; // the drawn sizes' reference (tests)
    cRows.forEach((r, k) => {
      const below = [], above = [];
      for (const p of r.items) { if (p.mid < d0) below.push(p); else if (p.mid > d1) above.push(p); }
      r.bins = placed[k].map((g) => ({ start: g.lo, end: g.hi, center: g.at, at: g.at, cx: xd(g.at), items: g.items, row: r }));
      // Values beyond the axis are never dropped: they become edge overflow markers.
      if (below.length) r.bins.unshift({ start: 'lo', end: d0, center: d0 - 1, overflow: 'lo', items: below.sort((a, b) => a.mid - b.mid), row: r });
      if (above.length) r.bins.push({ start: 'hi', end: d1, center: d1 + 1, overflow: 'hi', items: above.sort((a, b) => b.mid - a.mid), row: r });
      outCount += below.length + above.length;
    });
    // D-9 / P-3: grouped by seniority, rows follow the ladder, "Level not stated" last.
    // UX-24: the "N more departments" row comes after the kept rows, its departments (when open) after it.
    const tier = (r) => (r.fold ? 1 : r.inFold ? 2 : 0);
    cRows.sort((a, b) => tier(a) - tier(b) || (dim === 'seniority' ? senRank(a.key) - senRank(b.key) : 0)
      || (b.items.length ? 1 : 0) - (a.items.length ? 1 : 0)
      || (b.median ?? 0) - (a.median ?? 0) || b.all.length - a.all.length);

    // Color: the row's category color (identity is named by the row label).
    if (dim === 'none') {
      for (const r of cRows) r.color = slotColor(0);
    } else if (foldRow) {
      const top = cRows.filter((r) => tier(r) === 0).map((r) => r.key);
      assignColors(top);
      for (const r of cRows) { r.other = tier(r) > 0; r.color = r.other ? otherColor() : colorFor(r.key); }
    } else {
      // DES-2: rank by salaried (plotted) count, the same rule as the ranges legend and the
      // app's filter/card dots (app.js computeColorKeys), so a department has one color everywhere.
      const byCount = cRows.filter(r => r.items.length).sort((a, b) => b.items.length - a.items.length || String(a.key).localeCompare(String(b.key))).map(r => r.key);
      const top = new Set(byCount.length > SLOT_COUNT ? byCount.slice(0, SLOT_COUNT - 1) : byCount);
      assignColors([...top]);
      for (const r of cRows) { r.other = !top.has(r.key); r.color = r.other ? otherColor() : colorFor(r.key); }
    }
    for (const r of cRows) r.ink = inkOn(r.color);
    // A11Y-1: count labels sit on the row color mixed into the surface (viz.css --_bin-mix);
    // pick their ink from that actual mix so they always clear 4.5:1 (dark "Other" rows were 3.43:1).
    {
      const surf = curSurf || (isDark() ? [22, 26, 33] : [252, 252, 251]);
      for (const r of cRows) {
        const pct = 1; // = viz.css --_bin-mix: V-22, circles are the row colour itself (>= 3:1 on the surface)
        const c = parseColor(r.color) || surf;
        r.restInk = inkOn(toHex(c.map((v, k) => v * pct + surf[k] * (1 - pct))));
      }
    }

    const gridFrag = document.createDocumentFragment();
    cRows.forEach((r, ri) => {
      r.index = ri;
      vItems.push({ y: ri * rowH, h: rowH, build: () => buildCRow(r, ri), unbuild: () => { r.el = r.labelEl = null; for (const b of r.bins) b.el = null; } });
    });
    function buildCRow(r, ri) {
      const row = el('div', r.other ? 'ms-crow ms-crow--other' : 'ms-crow');
      if (ri === cRows.length - 1) row.classList.add('ms-crow--last');
      row.setAttribute('role', 'group');
      const sub = r.sub;
      row.setAttribute('aria-label', `${r.name}, ${r.subFull.replace(' · ', ', ')}`);
      row.style.height = rowH + 'px';
      row.style.setProperty('--c', r.color);
      row.style.setProperty('--c-ink', r.ink);
      row.style.setProperty('--c-rest-ink', r.restInk);
      r.el = row;

      const lab = el('div', 'ms-crow__label');
      lab.setAttribute('role', 'option');
      lab.setAttribute('aria-selected', 'false');
      // A-8 (fix-viz-5): an option cannot carry aria-expanded (axe aria-allowed-attr), so the fold row says in its
      // name whether it is folded and what Enter does.
      const foldWords = r.fold ? (foldOpen ? `, shown one by one below; Enter folds them into one row` : `, folded into one row; Enter shows each ${FOLD_ONE[dim] || 'group'}`) : '';
      lab.setAttribute('aria-label', `${r.name}${foldWords}: all ${plural(r.all.length, 'role')}${r.items.length ? `, ${r.subFull.split(' · ')[1]}` : `, ${r.noneText}`}`);
      lab.id = `${uid}-${ri}-L`;
      lab.dataset.r = ri; lab.dataset.i = -1;
      if (!narrow) lab.style.width = labelW + 'px';
      const sw = el('span', 'ms-crow__swatch');
      const txt = el('span', 'ms-crow__text');
      const nameEl = el('span', 'ms-crow__name', r.name);
      // UX-24: ▾ opens, ▴ folds. fix-viz-5: the arrow is beside the name, not in it, so a cut name keeps it (280 px).
      const headEl = el('span', 'ms-crow__head');
      headEl.append(nameEl);
      if (r.fold) { const f = el('span', 'ms-crow__fold', foldOpen ? '\u25B4' : '\u25BE'); f.setAttribute('aria-hidden', 'true'); headEl.append(f); }
      txt.append(headEl, el('span', 'ms-crow__sub', sub));
      lab.append(sw, txt);
      // fix-touch-tips: words for any input; the row's own caveat (r.why) is also in its accessible name, and
      // what it means is in the chart's Details (renderNotes), which a tap reaches.
      lab.title = r.fold
        ? `${r.name}: ${r.subFull}. Tap or click to ${foldOpen ? 'fold them into one row again' : `show each ${FOLD_ONE[dim] || 'group'}`}${r.why ? `. ${r.why}` : ''}`
        : `${r.name}: ${r.subFull}.${r.why ? ` ${r.why}` : ''} Tap or click to show all ${plural(r.all.length, 'role')}`;
      if (r.why) lab.setAttribute('aria-label', `${lab.getAttribute('aria-label')}. ${r.why}`);
      r.labelEl = lab;
      row.append(lab);

      const plot = el('div', 'ms-crow__plot');
      plot.setAttribute('role', 'none');
      plot.style.top = (narrow ? CROW_LABEL_H : 0) + 'px';
      plot.style.height = plotH + 'px';
      let bandL = null, bandR = null;
      if (r.items.length) {
        const bandH = Math.round(Math.min(2 * rMax + 8, plotH - 10));
        const bx0 = xc(r.p25), bx1 = xc(r.p75);
        const band = el('div', 'ms-crow__band');
        band.setAttribute('aria-hidden', 'true');
        const bw = Math.max(bandH, bx1 - bx0 + bandH * 0.6);
        bandL = (bx0 + bx1) / 2 - bw / 2; bandR = bandL + bw;
        band.style.left = bandL + 'px';
        band.style.width = bw + 'px';
        band.style.height = bandH + 'px';
        band.style.marginTop = (-bandH / 2) + 'px';
        plot.append(band);
        const med = el('div', 'ms-crow__median');
        med.setAttribute('aria-hidden', 'true');
        med.style.left = xc(r.median) + 'px';
        med.style.height = (bandH + 10) + 'px';
        med.style.marginTop = (-(bandH + 10) / 2) + 'px';
        plot.append(med);
      } else {
        const none = el('div', 'ms-crow__none', r.noneText === 'no pay posted for here' ? 'No pay posted for here' : 'No pay listed'); // UX-61: the cards' words
        none.style.left = plotL + 'px';
        plot.append(none);
      }
      const drawn = r.bins.filter((b) => !b.overflow);
      r.bins.forEach((b, bi) => {
        const n = b.items.length;
        if (b.overflow) { const o = overflowMarker(b, ri, bi, plotL, plotW, narrow); plot.append(o); decorateBin(b, ri, bi); return; }
        const rad = radiusAt(n);
        const cx = b.cx;
        // viz-even: the hit area (and a phone's touch slop, M-8) never reaches the next circle's centre.
        const k = drawn.indexOf(b);
        const room = Math.min(k > 0 ? cx - drawn[k - 1].cx : Infinity, k + 1 < drawn.length ? drawn[k + 1].cx - cx : Infinity);
        const hit = Math.max(MIN_BIN_PX, Math.min(room, 2 * rad + 6));
        const bin = el('div', bandL != null && cx >= bandL && cx <= bandR ? 'ms-bin ms-bin--inband' : 'ms-bin');
        bin.setAttribute('role', 'option');
        bin.setAttribute('aria-selected', 'false');
        const approx = b.items.some(p => isForeign(p.cur) && hasFx(p.cur));
        bin.setAttribute('aria-label', `${plural(n, 'role')}, ${midsText(b, true)}${approx ? ' in US dollars, converted' : ''}, ${r.name}`);
        bin.id = `${uid}-${ri}-${bi}`;
        bin.dataset.r = ri; bin.dataset.i = bi;
        // viz-even: the postings' lowest, median and highest midpoint, in approx US dollars (tests read them).
        bin.dataset.lo = b.start; bin.dataset.at = b.at; bin.dataset.hi = b.end; bin.dataset.n = n;
        bin.style.left = (cx - hit / 2) + 'px';
        bin.style.width = hit + 'px';
        bin.style.height = Math.max(hit, 2 * rad + 6) + 'px';
        bin.style.setProperty('--ms-bin-slop', Math.round(Math.min(44, room)) + 'px');
        const dot = el('span', 'ms-bin__dot');
        dot.style.width = dot.style.height = (2 * rad) + 'px';
        // A count only when it fits inside its (solid, V-22) circle; the exact count is in the aria-label.
        // UX-42 (fix-viz-5): measured in the circle's tabular digits, with 2 px of air each side.
        if (countFits(n, rad, chipFont.replace('700', '600'))) {
          dot.textContent = shortCount(n); // M-23: "4.5K"
          if (rad < 11) dot.classList.add('ms-bin__dot--sm');
        }
        if (n === 1) bin.classList.add('ms-bin--one'); // V-34: one posting is a small dot
        bin.append(dot);
        plot.append(bin);
        b.el = bin;
        decorateBin(b, ri, bi);
      });
      if (selectedKey === cKeyOf(ri, -1)) row.classList.add('is-selected');
      if (cActive && cActive.r === ri && cActive.i < 0) markActive(lab);
      row.append(plot);
      return row;
    }
    function decorateBin(b, ri, bi) {
      if (selectedKey === cKeyOf(ri, bi)) b.el.classList.add('is-selected');
      if (highlighted != null && b.items.some(p => p.job.id === highlighted)) b.el.classList.add('is-highlighted');
      if (cActive && cActive.r === ri && cActive.i === bi) markActive(b.el);
    }
    renderGridlines(ticks, x, gridFrag);
    grid.replaceChildren(gridFrag);
    body.style.height = (cRows.length * rowH + 8) + 'px';
  }

  // V-47: which row or circle holds a posting, indexed on first use (a highlight, a kept keyboard position), not on
  // every draw (14,000 map writes on Amazon).
  function rowOfJob(id) {
    if (!idxByJob.size && itemByRow.length) itemByRow.forEach((p, i) => { for (const q of p.stack || [p]) idxByJob.set(q.job.id, i); });
    return idxByJob.get(id);
  }
  function binOfJob(id) {
    if (!binByJob.size && cRows.length) for (const r of cRows) for (const b of r.bins || []) for (const p of b.items) binByJob.set(p.job.id, b);
    return binByJob.get(id);
  }

  function markActive(e) {
    e.classList.add('is-active');
    e.setAttribute('aria-selected', 'true');
    body.setAttribute('aria-activedescendant', e.id);
  }

  // A small "›" (or "‹") chip at the axis edge for postings beyond the domain.
  function overflowMarker(b, ri, bi, plotL, plotW, narrow) {
    const n = b.items.length;
    const hi = b.overflow === 'hi';
    const bin = el('div', `ms-bin ms-bin--overflow ms-bin--overflow-${b.overflow}`);
    bin.setAttribute('role', 'option');
    bin.setAttribute('aria-selected', 'false');
    const vals = b.items.slice(0, 3).map(p => formatMoney(p.mid)).join(', ') + (n > 3 ? `, +${n - 3} more` : '');
    bin.setAttribute('aria-label', `${plural(n, 'role')} ${hi ? 'above' : 'below'} ${formatMoney(b.end)}: ${vals}, ${b.row.name}`);
    bin.id = `${uid}-${ri}-${bi}`;
    bin.dataset.r = ri; bin.dataset.i = bi;
    // UX-17: the chip sits in its gutter, 6px outside the plot, never centred on the edge.
    const w = chipWidth(n, chipFont);
    const left = hi ? plotL + plotW + 6 : plotL - 6 - w;
    bin.style.left = left + 'px';
    bin.style.width = w + 'px';
    bin.style.height = '24px';
    const chip = el('span', 'ms-bin__dot ms-bin__chip', `${hi ? '›' : '‹'}${n.toLocaleString()}`); // UX-43: "›1", never a bare "›"
    bin.append(chip);
    b.el = bin;
    if (selectedKey === cKeyOf(ri, bi)) bin.classList.add('is-selected');
    return bin;
  }

  function cKeyOf(r, i) {
    const row = cRows[r];
    if (!row) return null;
    return i < 0 ? `${row.key}\u0000*` : (row.bins[i] ? `${row.key}\u0000${row.bins[i].start}` : null);
  }
  function cFindKey(key) {
    for (let r = 0; r < cRows.length; r++) {
      if (cKeyOf(r, -1) === key) return { r, i: -1 };
      for (let i = 0; i < cRows[r].bins.length; i++) if (cKeyOf(r, i) === key) return { r, i };
    }
    return null;
  }
  const cEl = (r, i) => (i < 0 ? cRows[r]?.labelEl : cRows[r]?.bins[i]?.el) || null;

  function clusterLabel(r, i) {
    const row = cRows[r];
    if (i < 0) return row.name;
    const b = row.bins[i];
    if (b.overflow) return `${row.name} · ${b.overflow === 'hi' ? 'above' : 'below'} ${formatMoney(b.end)}`;
    return `${row.name} · ${binRange(b)}`;
  }

  function activateCluster(r, i) {
    const row = cRows[r];
    if (!row) return;
    // UX-24: the "N more departments" label opens (and folds) the row instead of selecting 600 roles.
    if (i < 0 && row.fold) { foldOpen = !foldOpen; selectedKey = null; render(); setCActive(cRows.findIndex((x) => x.fold), -1, true); return; }
    rowsEl.querySelectorAll('.is-selected').forEach(n => n.classList.remove('is-selected'));
    selectedKey = cKeyOf(r, i);
    const list = i < 0 ? row.all : row.bins[i].items.map(p => p.job);
    if (i < 0) row.el?.classList.add('is-selected'); else row.bins[i].el?.classList.add('is-selected');
    onClusterSelect?.(list, clusterLabel(r, i));
    if (list.length === 1) onSelect?.(list[0]);
  }

  function showClusterTip(b) {
    const n = b.items.length;
    tip.replaceChildren();
    tip.append(el('div', 'ms-tip__value', plural(n, 'role')));
    const approx = b.items.some(p => isForeign(p.cur) && hasFx(p.cur));
    if (b.overflow) {
      // Beyond the axis: give the real values, one line per posting.
      tip.append(el('div', 'ms-tip__sub', `${b.overflow === 'hi' ? 'above' : 'below'} ${formatMoney(b.end)}, past the edge of the chart${approx ? ' · converted to US$' : ''}`));
      tip.append(el('div', 'ms-tip__title', b.row.name));
      const list = el('ul', 'ms-tip__roles');
      for (const p of b.items.slice(0, 5)) {
        const li = el('li');
        li.append(el('span', 'ms-tip__role', p.job.title || 'Untitled'), el('span', 'ms-tip__n', rangeText(p)));
        list.append(li);
      }
      tip.append(list);
      if (n > 5) tip.append(el('div', 'ms-tip__meta', `+${n - 5} more`));
      tip.hidden = false;
      return;
    }
    tip.append(el('div', 'ms-tip__sub', `${midsText(b)}${approx ? ' · converted to US$' : ''}`));
    tip.append(el('div', 'ms-tip__title', b.row.name));
    const counts = new Map();
    for (const p of b.items) { const t = p.job.title || 'Untitled'; counts.set(t, (counts.get(t) || 0) + 1); }
    const top = [...counts].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
    const list = el('ul', 'ms-tip__roles');
    for (const [t, k] of top.slice(0, 4)) {
      const li = el('li');
      li.append(el('span', 'ms-tip__role', t), el('span', 'ms-tip__n', k > 1 ? `×${k}` : ''));
      list.append(li);
    }
    tip.append(list);
    if (top.length > 4) tip.append(el('div', 'ms-tip__meta', `+${top.length - 4} more titles`));
    tip.hidden = false;
  }

  function setCHover(binEl, evt) {
    if (binEl === cHover) { if (binEl && evt) placeTip(evt.clientX, evt.clientY); return; }
    cHover?.classList.remove('is-hover');
    cHover = binEl;
    if (!binEl) { hideTip(); onHover?.(null); return; }
    binEl.classList.add('is-hover');
    const b = cRows[+binEl.dataset.r].bins[+binEl.dataset.i];
    showClusterTip(b);
    const atBin = () => { const bb = binEl.getBoundingClientRect(); placeTip(bb.right - 6, bb.bottom - 6); };
    if (evt) placeTip(evt.clientX, evt.clientY);
    else atBin();
    armTip(binEl, evt ? 'mouse' : 'keyboard', rowsEl, atBin);
    if (b.items.length === 1) onHover?.(b.items[0].job);
  }

  function setCActive(r, i, announce = true) {
    const prev = rowsEl.querySelector('.is-active');
    prev?.classList.remove('is-active');
    prev?.setAttribute('aria-selected', 'false');
    if (!cRows[r]) { cActive = null; body.removeAttribute('aria-activedescendant'); return; }
    cActive = { r, i };
    if (announce && vItems[r]) scrollToY(vItems[r].y, vItems[r].h);
    const e = cEl(r, i);
    if (!e) { body.removeAttribute('aria-activedescendant'); return; }
    markActive(e);
    if (announce) { if (i >= 0) setCHover(e); else setCHover(null); }
  }

  function onClusterKey(e) {
    if (!cRows.length) return;
    const cur = cActive || { r: 0, i: -2 };
    const row = cRows[cur.r];
    let { r, i } = cur;
    const k = e.key;
    if (k === 'ArrowRight') i = cur.i === -2 ? -1 : Math.min(row.bins.length - 1, cur.i + 1);
    else if (k === 'ArrowLeft') i = Math.max(-1, cur.i - 1);
    else if (k === 'Home') i = -1;
    else if (k === 'End') i = row.bins.length - 1;
    else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp') {
      const d = (k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : k === 'PageDown' ? 5 : -5);
      if (cur.i === -2) { r = 0; i = -1; } else {
        r = Math.max(0, Math.min(cRows.length - 1, cur.r + d));
        if (cur.i < 0 || !cRows[r].bins.length) i = -1;
        else {
          // nearest circle by salary in the target row
          const at = row.bins[cur.i].center;
          let best = 0, bd = Infinity;
          cRows[r].bins.forEach((b, bi) => { const dd = Math.abs(b.center - at); if (dd < bd) { bd = dd; best = bi; } });
          i = best;
        }
      }
    } else if ((k === 'Enter' || k === ' ') && cActive) {
      e.preventDefault();
      activateCluster(cActive.r, cActive.i);
      return;
    } else if (k === 'Escape') { setCHover(null); return; }
    else return;
    e.preventDefault();
    if (i === -2) i = -1;
    setCActive(r, i);
  }

  // ======================= ranges view =======================
  function colorKeys() {
    if (opts.colorBy === 'none') return { top: [], counts: new Map(), ordered: [] };
    const counts = new Map();
    for (const p of plotted) counts.set(p.key, (counts.get(p.key) || 0) + 1);
    const ordered = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || String(a).localeCompare(String(b)));
    // A 9th+ key folds into Other only when there are more than 8 keys.
    const top = ordered.length > SLOT_COUNT ? ordered.slice(0, SLOT_COUNT - 1) : ordered;
    assignColors(top);
    return { top, counts, ordered };
  }

  /** V-47: groups() for the same postings and Group by, with the notes counts it makes. */
  function groups() {
    const memo = payMemo && payMemo.groups?.[opts.groupBy];
    if (memo) { rowNotes = { ...rowNotes, ...memo.notes }; return memo.out; }
    const before = rowNotes;
    const out = groupsOf();
    const notes = {};
    for (const k of ['offRow', 'basis', 'basisLeft']) if (rowNotes[k] !== before[k]) notes[k] = rowNotes[k];
    if (payMemo) (payMemo.groups ||= {})[opts.groupBy] = { out, notes };
    return out;
  }
  function groupsOf() {
    if (opts.groupBy === 'none') return [{ name: null, items: plotted.slice().sort((a, b) => b.mid - a.mid) }];
    const m = new Map();
    // V-37 (fix-pay-at-place): grouped by Location, a posting sits in the row of its first place (the first one
    // the Location filter takes in), as in Clusters (V-18), and its bar is the pay posted for that place
    // (payAt), never another city's or another country's range; with none posted there it is not in the row.
    const byLoc = opts.groupBy === 'location';
    const locTest = byLoc ? placeMatcher(opts.places, opts.placeTest) : null;
    let offRow = 0;
    for (const p of plotted) {
      const k = byLoc ? locationRowKey(p.job, locTest) : keyOf(p.job, opts.groupBy);
      const q = byLoc ? locationRowItem(p, k, locTest) : p;
      if (!q) { offRow++; continue; }
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(q);
    }
    if (byLoc) rowNotes = { ...rowNotes, offRow };
    // BP-13: a group's median is base pay, like the stats line's. V-21: by department or seniority
    // it compares one country's pay when the board mixes currencies (as the Clusters rows do).
    const main = BASIS_DIMS.has(opts.groupBy) ? mainBasis(plotted) : null;
    let left = 0;
    const out = [...m].map(([key, items]) => {
      const b = basisStats(items, main);
      left += b.left;
      return { key, name: groupName(opts.groupBy, key), items: items.sort((a, b) => b.mid - a.mid), median: b.stats.median, onTarget: b.stats.oteOnly, basis: b.basis, basisLeft: b.left };
    });
    rowNotes = { ...rowNotes, basis: main, basisLeft: left };
    if (opts.groupBy === 'seniority') {
      out.sort((a, b) => senRank(a.key) - senRank(b.key) || b.median - a.median);
    } else if (byLoc) {
      // D-44 (fix-viz-5): places with the most postings first, so a one-posting place never leads with its one pay.
      out.sort((a, b) => b.items.length - a.items.length || b.median - a.median || String(a.key).localeCompare(String(b.key)));
    } else {
      out.sort((a, b) => b.median - a.median || b.items.length - a.items.length);
    }
    return out;
  }

  function renderRanges(stats, narrow) {
    const { top, counts, ordered } = colorKeys();
    const topSet = new Set(top);
    const colorOf = p => opts.colorBy === 'none' ? null : (topSet.has(p.key) ? colorFor(p.key) : otherColor());
    // The bars, by group (grouped by Location, each priced for its row's place: V-37).
    const gs = groups();
    const drawn = gs.flatMap((g) => g.items);
    const bars = drawn.length ? drawn : plotted;
    // V-20 / V-19: bars that are not one posted yearly range, counted for the legend and the notes. V-35: only a
    // real span is striped (several levels, or several places' ranges), never one place's row.
    let spans = 0, partTime = 0, ote = 0, minimums = 0;
    for (const p of drawn) {
      if (!p.kindDone) { p.span = barSpan(p); p.partTime = isPartTimeHourly(p.job); p.kindDone = true; } // V-47: once per item
      if (p.span) spans++;
      if (p.partTime) partTime++;
      if (p.ote) ote++;
      if (p.nb === 'minimum') minimums++;
    }
    rowNotes = { ...rowNotes, spans, partTime };
    renderLegend(top, counts, ordered, { spans, ote, minimums });
    head.hidden = legend.hidden;
    // viz-even: postings with the same bar are one row with their count (stackRanges); a row's first posting stands
    // for it (p.stack holds them all, p.n counts them). Stacked before the axis, which is taken from the rows (UX-59).
    const stackKey = (p) => {
      const c = opts.colorBy === 'none' ? null : topSet.has(p.key) ? p.key : OTHER_KEY;
      if (p.rkFor !== c || p.rk === undefined) { p.rkFor = c; p.rk = rangeKey(p, c); } // V-47: a key per item and colour
      return p.rk;
    };
    const sk = `${opts.groupBy}\u0001${opts.colorBy}\u0001${top.join('\u0002')}`;
    const gStacks = payMemo?.stacks?.key === sk ? payMemo.stacks.value : gs.map((g) => stackRanges(g.items, stackKey));
    if (payMemo) payMemo.stacks = { key: sk, value: gStacks };
    const rowsAll = gStacks.flat().map((st) => ({ lo: st.p.lo, hi: st.p.hi, mid: st.p.mid, n: st.n }));
    // V-38 (fix-viz-5): a bar's thickness says how many postings its row stands for.
    const maxStack = rowsAll.reduce((m, r) => Math.max(m, r.n), 1);

    // Narrow (phones): the full-width title sits above its bar, so titles stay readable (M-17).
    rowH = narrow ? ROW_H_NARROW : ROW_H;
    let labelW = narrow ? 0 : Math.round(Math.max(140, Math.min(300, width * 0.3)));
    if (!narrow && !histShown) labelW = Math.max(labelW, Math.min(Math.round(width * 0.4), capNeed(stats.pay))); // V-46
    const valFont = `600 12px ${curFam}`;
    const padR = narrow ? 16 : 28;
    const plotL = narrow ? 12 : labelW + 12;
    container.classList.toggle('ms-chart--stack', narrow);
    const plotW = Math.max(80, width - plotL - padR);
    // UX-59 (fix-viz-5): the domain is the robust ends of the bars the rows show (each row once), so the rows the list
    // leads with, the highest pay, are on the axis; anything beyond gets an edge marker.
    const nt = rangesDomain(rowsAll.length ? rowsAll : bars, { count: Math.max(2, Math.floor(plotW / 90)) });
    const d0 = nt.d0, d1 = nt.d1;
    const x = v => plotL + ((v - d0) / (d1 - d0)) * plotW;
    const xc = v => x(Math.min(d1, Math.max(d0, v)));
    container.style.setProperty('--ms-plot-l', plotL + 'px');
    container.style.setProperty('--ms-label-w', labelW + 'px');

    renderHist(x, d0, d1, plotL, plotW, labelW, stats.pay);
    renderAxis(nt.ticks, x, stats.fxCount > 0, labelW, narrow, stats.pay);

    const gridFrag = document.createDocumentFragment();
    let y = 0;
    let idx = 0;
    let gi = 0;
    gs.forEach((g, gk) => {
      const stacks = gStacks[gk];
      if (g.name != null) {
        const first = gi++ === 0;
        vItems.push({ y, h: HEAD_H, build: () => buildHead(g, first) });
        y += HEAD_H;
        const mx = xc(g.median);
        const line = el('div', 'ms-chart__median');
        line.style.left = mx + 'px';
        line.style.top = (y - 6) + 'px';
        line.style.height = (stacks.length * rowH + 6) + 'px';
        gridFrag.append(line);
      }
      for (const st of stacks) {
        const i = idx++;
        const p = st.p;
        p.stack = st.items;
        p.n = st.n;
        itemByRow[i] = p;
        rowY[i] = y;
        p.group = g.name;
        p.clipped = p.hi > d1 || p.lo < d0;
        // A patterned bar (striped, dashed, fading) keeps 6 px, so its pattern reads (3 px stripes read as dashes).
        p.thick = Math.max(p.span || p.ote || p.nb === 'minimum' ? 6 : 0, barThickness(st.n, maxStack));
        if (p.mid < d0 || p.mid > d1) outCount += st.n;
        vItems.push({ y, h: rowH, build: () => buildRow(p, i) });
        y += rowH;
      }
    });
    // Group bands are visual only (aria-hidden); options carry the group in their name.
    function buildHead(g, first) {
      {
        const h = el('div', first ? 'ms-group ms-group--first' : 'ms-group');
        h.setAttribute('aria-hidden', 'true');
        h.style.height = HEAD_H + 'px';
        const name = el('div', 'ms-group__name');
        if (!narrow) name.style.width = labelW + 'px';
        name.append(el('span', 'ms-group__title', g.name), el('span', 'ms-group__count', g.items.length.toLocaleString()));
        name.title = `${g.name} · ${plural(g.items.length, 'posting')}`;
        h.append(name);
        const mx = xc(g.median);
        const mtext = `${g.onTarget && !stats.pay?.oteOnly ? 'on-target ' : ''}median ${formatMoney(g.median)}${narrow ? basisWordsShort(g) : basisWords(g)}`;
        const ml = el('div', 'ms-group__median', mtext);
        if (g.basisLeft) ml.title = `Pay ${payBasisPlace(g.basis)} only: ${plural(g.basisLeft, 'posting')} with pay for other countries ${g.basisLeft === 1 ? 'is' : 'are'} not in this median`;
        ml.style.left = mx + 'px';
        if (mx > width - textWidth(mtext, `12px ${curFam}`) - 16) ml.classList.add('ms-group__median--left');
        h.append(ml);
        return h;
      }
    }
    function buildRow(p, idx) {
      {
        const r = el('div', 'ms-row');
        r.style.height = rowH + 'px';
        r.dataset.idx = idx;
        r.setAttribute('role', 'option');
        r.setAttribute('aria-selected', 'false');
        r.setAttribute('aria-label', (p.group != null ? `${p.group}: ` : '') + optionName(p));
        r.id = `${uid}-${idx}`;
        r.dataset.n = p.n || 1;
        const lab = el('div', 'ms-row__label', rowTitle(p));
        if (!narrow) lab.style.width = labelW + 'px';
        const bx0 = xc(p.lo), bx1 = xc(p.hi);
        // V-20: a range over several levels or places is striped, on-target earnings dashed. V-48 (fix-viz-5): on-target
        // earnings over several levels are dashed and striped (the span no longer hides that it is on-target pay).
        // V-41: a stated minimum is open to the right ("from €46K"): its bar fades out past the figure.
        const cls = ['ms-row__bar'];
        if (p.span) cls.push('ms-row__bar--span');
        if (p.ote) cls.push('ms-row__bar--ote');
        if (p.nb === 'minimum') cls.push('ms-row__bar--min');
        const bar = el('div', cls.join(' '));
        bar.style.left = bx0 + 'px';
        bar.style.width = Math.max(0, bx1 - bx0) + 'px';
        // V-38 (fix-viz-5): the bar is thicker the more postings its row stands for (barThickness).
        const thick = p.thick || 8;
        bar.style.height = thick + 'px';
        bar.style.marginTop = (-thick / 2) + 'px';
        const dot = el('div', 'ms-row__dot');
        dot.style.left = x(p.mid) + 'px';
        if (p.mid < d0 || p.mid > d1) dot.hidden = true;
        if (p.lo >= d1) bar.hidden = true;  // entirely beyond: the marker alone shows it
        if (p.hi <= d0) bar.hidden = true;
        const c = colorOf(p);
        if (c) { bar.style.backgroundColor = c; dot.style.backgroundColor = c; }
        const text = rangeText(p);
        const val = el('div', 'ms-row__val', text);
        // P-16: never over the title column (it ran into "…Discove$350K–$850K").
        const tw = textWidth(text, valFont) + 2;
        let vp = rowValPlacement({ bx0: Math.max(bx0, plotL), bx1, plotL, width, w: tw });
        if (vp.side === 'in') { vp = { side: 'in', x: Math.max(plotL, Math.min(width - 4 - (tw + 10), Math.max(bx0, plotL) + 8)) }; val.classList.add('ms-row__val--in'); } // + the chip's padding
        else if (vp.side === 'left') val.classList.add('ms-row__val--left');
        val.style.left = vp.x + 'px';
        r.append(lab, bar, dot, val);
        // viz-even: a row of several postings shows their count by its bar ("×247"); the pay label
        // takes its place on hover. On a phone the title line right above the bar says it (viz.css).
        if (p.n > 1) {
          const ct = `×${p.n.toLocaleString()}`;
          const cw = textWidth(ct, valFont) + 2;
          let cp = rowValPlacement({ bx0: Math.max(bx0, plotL), bx1, plotL, width, w: cw });
          const count = el('div', 'ms-row__count', ct);
          count.setAttribute('aria-hidden', 'true');
          if (cp.side === 'in') { cp = { side: 'in', x: Math.max(plotL, Math.min(width - 4 - (cw + 10), Math.max(bx0, plotL) + 8)) }; count.classList.add('ms-row__count--in'); }
          count.style.left = cp.x + 'px';
          r.append(count);
        }
        // Clipped by the axis: a small chevron at the edge (the tooltip has the real values).
        if (p.hi > d1) { const o = el('div', 'ms-row__over ms-row__over--hi', '›'); o.style.left = (x(d1) + 3) + 'px'; o.setAttribute('aria-hidden', 'true'); r.append(o); }
        if (p.lo < d0) { const o = el('div', 'ms-row__over ms-row__over--lo', '‹'); o.style.left = (x(d0) - 11) + 'px'; o.setAttribute('aria-hidden', 'true'); r.append(o); }
        if (idx === activeIdx) markActive(r);
        if (highlighted != null && p.job.id === highlighted) r.classList.add('is-highlighted');
        return r;
      }
    }
    renderGridlines(nt.ticks, x, gridFrag);
    grid.replaceChildren(gridFrag);
    body.style.height = (y + 8) + 'px';
  }

  /** viz-even: what a stacked row's postings share: the one value of `get` they all have, else null. */
  function shared(p, get) {
    const v = get(p.job);
    return (p.stack || [p]).every((q) => get(q.job) === v) ? v : null;
  }

  /** fix-pay-at-place: the one place every posting of a row's bar was posted for ("Bellevue"), or ''. */
  function stackPlace(p) {
    const items = p.stack || [p];
    const first = barPlace(items[0]);
    return first && items.every((q) => barPlace(q) === first) ? first : '';
  }
  /** True when each posting of the row is one place's row, of a posting that lists several places' ranges. */
  function stackPerPlace(p) { return (p.stack || [p]).every((q) => !!barPlace(q) && (q.at || payAt(q.job))?.rows > 1); }

  /**
   * The title column: the posting's title. UX-41 (fix-viz-5): a row of several postings is named by its most common
   * title ("Software Engineer II +5"); its count is said once, by the bar ("×14").
   */
  function rowTitle(p) {
    if (!(p.n > 1)) return p.job.title || 'Untitled';
    return stackTitle(p.stack.map((q) => q.job.title || 'Untitled'));
  }

  function optionName(p) {
    const approx = isForeign(p.cur) && hasFx(p.cur);
    // D-43 (fix-viz-5): the card's figures (two decimals of millions); V-41: a stated minimum is "from" its figure.
    const range = p.nb === 'minimum' ? `from ${formatEnd(p.lo)}, the posted minimum base pay` : Math.round(p.lo / 1000) === Math.round(p.hi / 1000)
      ? formatEnd(p.lo) : `${formatEnd(p.lo)} to ${formatEnd(p.hi)}`;
    const shift = p.nb === 'shiftPay' ? ', includes the top shift pay' : '';
    // V-35 (fix-pay-at-place): a striped bar is a real span (levels, or several places' ranges); a bar that is one
    // place's row says which place.
    const sp = p.span || null;
    const pt = isPartTimeHourly(p.job) ? ', part-time hourly pay shown as a year if full-time' : '';
    if (p.n > 1) {
      // viz-even: a row of several postings with the same posted range.
      const one = stackPlace(p);
      const kind = sp ? (sp.kind === 'levels' ? `, spans ${sp.tiers.length} levels` : ', each over several places\u2019 ranges')
        : one ? `, the range posted for ${one}` : stackPerPlace(p) ? ', each the range posted for one of its places' : '';
      const dept = shared(p, (j) => j.department || null);
      return `${p.n.toLocaleString()} roles with the same posted ${p.nb === 'minimum' ? 'figure' : 'range'}, ${range}${approx ? ' in US dollars, converted' : ''}${p.ote ? ', on-target earnings' : ''}${shift}${kind}${pt}${dept ? ', ' + dept : ''}`;
    }
    const where = [p.job.department, primaryLocation(p.job)].filter(Boolean).join(', ');
    const at = barPlace(p);
    const kind = sp ? `, spans ${sp.tiers.length} ${sp.kind === 'levels' ? 'levels' : 'places\u2019 ranges'}` : at ? `, the range posted for ${at}` : '';
    return `${p.job.title || 'Untitled'}, ${range}${approx ? ' in US dollars, converted' : ''}${p.ote ? ', on-target earnings' : ''}${shift}${kind}${pt}${where ? ', ' + where : ''}`;
  }

  /** viz-even: the list label for a row of several postings ("Software Engineering · $120K–$235K"). */
  function stackLabel(p) {
    const key = p.group != null ? null : opts.colorBy !== 'none' ? shared(p, (j) => keyOf(j, opts.colorBy)) : null;
    const head = p.group != null ? p.group : key != null ? groupName(opts.colorBy, key) : null;
    return `${head ? `${head} · ` : ''}${rangeText(p)}`;
  }

  /** Enter or a click on a Ranges row: one posting opens; a row of several lists them (as a circle does). */
  function activateRange(i) {
    const p = itemByRow[i];
    if (!p) return;
    if (p.n > 1 && onClusterSelect) onClusterSelect(p.stack.map((q) => q.job), stackLabel(p));
    else onSelect?.(p.job);
  }

  function rangeText(p) {
    const pre = isForeign(p.cur) && hasFx(p.cur) ? '≈' : '';
    if (p.nb === 'minimum') return `from ${pre}${formatEnd(p.lo)}`; // V-41: as the card says it
    return pre + formatRange(p.lo, p.hi); // D-43: the card's figures
  }

  function renderLegend(top, counts, ordered, { spans = 0, ote = 0, minimums = 0 } = {}) {
    legend.replaceChildren();
    legend.hidden = opts.colorBy === 'none';
    if (legend.hidden) return;
    // D-51 (fix-viz-5): the pattern keys come first, so a phone's one-row legend (it scrolls sideways) shows them
    // without a scroll; on a desktop the legend wraps (viz.css).
    const patterns = el('span', 'ms-legend__patterns');
    legend.append(patterns);
    // UX-36: with Group "None" the bars are still coloured by department; the legend says it is colour.
    legend.append(el('span', 'ms-legend__title', `Colour: ${DIM_LABEL[opts.colorBy] || opts.colorBy}`));
    const add = (key, n, color) => {
      const item = el('span', 'ms-legend__item');
      const sw = el('span', 'ms-legend__swatch');
      sw.style.background = color;
      item.append(sw, el('span', 'ms-legend__key', key), el('span', 'ms-legend__n', n.toLocaleString()));
      item.title = `${key}: ${plural(n, 'posting')}`;
      legend.append(item);
    };
    for (const k of top) add(groupName(opts.colorBy, k), counts.get(k), colorFor(k));
    const rest = ordered.slice(top.length);
    if (rest.length) add(`${OTHER_KEY} (${rest.length})`, rest.reduce((s, k) => s + counts.get(k), 0), otherColor());
    // V-20: the pattern keys, beside the colours (only when there are such bars): striped spans, V-48 (fix-viz-5)
    // dashed on-target earnings, V-41 a stated minimum that fades out ("from").
    const key = (cls, words, n, title) => {
      // .ms-legend__span is the striped key alone (fix-pay-at-place's tests count it); the others are kinds of pay.
      const item = el('span', cls ? 'ms-legend__kind' : 'ms-legend__span');
      item.append(el('span', `ms-legend__spansw ${cls}`), el('span', 'ms-legend__spankey', words), el('span', 'ms-legend__n', n.toLocaleString()));
      item.title = title;
      legend.insertBefore(item, patterns);
    };
    if (spans) key('', 'Striped: several levels or places', spans, `${plural(spans, 'posting')} whose range runs over several levels (NVIDIA "Level 4" and "Level 5") or several places' ranges. Each bar's tip, and its role's details, list them`);
    if (ote) key('ms-legend__spansw--ote', 'Dashed: on-target earnings', ote, `${plural(ote, 'posting')} posting on-target earnings: base plus commission at target. They are on the chart, not in the medians`);
    if (minimums) key('ms-legend__spansw--min', 'Fading: a posted minimum', minimums, `${plural(minimums, 'posting')} stating a minimum base pay ("from €46K"); the offer can be higher. On the chart, not in the medians`);
    patterns.remove(); // a placeholder: the keys went before it
    // fix-density: the legend is one row that scrolls sideways (viz.css); when it does, the keyboard can scroll it.
    requestAnimationFrame(() => {
      if (legend.scrollWidth > legend.clientWidth + 1) legend.tabIndex = 0; else legend.removeAttribute('tabindex');
    });
  }

  function setHover(i, evt) {
    if (i === hoverIdx) { if (i >= 0 && evt) placeTip(evt.clientX, evt.clientY); return; }
    if (hoverIdx >= 0) rowsEl.querySelector(`.ms-row[data-idx="${hoverIdx}"]`)?.classList.remove('is-hover');
    hoverIdx = i;
    if (i < 0) { hideTip(); onHover?.(null); return; }
    const r = rowsEl.querySelector(`.ms-row[data-idx="${i}"]`);
    r?.classList.add('is-hover');
    showJobTip(itemByRow[i]);
    const atRow = () => { const b = r.getBoundingClientRect(); placeTip(b.left + parseFloat(container.style.getPropertyValue('--ms-plot-l')), b.bottom); };
    if (evt) placeTip(evt.clientX, evt.clientY);
    else if (r) atRow();
    if (r) armTip(r, evt ? 'mouse' : 'keyboard', rowsEl, atRow);
    onHover?.(itemByRow[i].n > 1 ? null : itemByRow[i].job); // viz-even: a row of several postings is no one card
  }

  function showJobTip(p) {
    // fix-pay-at-place: the bar's own posted range (the place's row when it was priced for a place).
    const j = p.job, s = p.at || j.salary;
    tip.replaceChildren();
    const cur = (s.currency || 'USD').toUpperCase();
    const native = s.min === s.max || s.max == null || s.min == null
      ? formatCurrency(s.min ?? s.max, cur)
      : `${formatCurrency(s.min, cur)} – ${formatCurrency(s.max, cur)}`;
    const pt = isPartTimeHourly(j);
    // V-19 (shared decision 4): part-time hourly pay shows the hourly rate it was posted at; the bar
    // is a year if full-time.
    if (p.nb === 'minimum') {
      // V-41 (fix-viz-5): as the card says it ("from €46K").
      tip.append(el('div', 'ms-tip__value', withCurrencyCode(`From ${formatCurrency(s.min ?? s.max, cur)}`, cur)));
      tip.append(el('div', 'ms-tip__sub', 'The posted minimum base pay; the offer can be higher. Not in the medians'));
    } else if (pt) {
      const hourly = (v) => `${cur === 'USD' ? '$' : ''}${(v / 2080).toFixed(2)}`;
      tip.append(el('div', 'ms-tip__value', withCurrencyCode(`${hourly(s.min ?? s.max)}${s.max != null && s.max !== s.min ? ` – ${hourly(s.max)}` : ''} an hour`, cur)));
      tip.append(el('div', 'ms-tip__sub', `Part-time. The bar is ${withCurrencyCode(native, cur)} a year if full-time (2,080 hours)`));
    } else tip.append(el('div', 'ms-tip__value', withCurrencyCode(native, cur)));
    // V-41 (fix-viz-5): pay that includes the top shift differential says so, as the card does.
    if (p.nb === 'shiftPay') {
      const sb = j.salary.statedBase;
      const base = sb && sb.min != null ? `; base pay starts at ${sb.originalInterval === 'hour' ? `${withCurrencyCode(`${String(sb.currency || cur).toUpperCase() === 'USD' ? '$' : ''}${(sb.min / 2080).toFixed(2)}`, String(sb.currency || cur).toUpperCase())} an hour` : withCurrencyCode(formatCurrency(sb.min, String(sb.currency || cur).toUpperCase()), String(sb.currency || cur).toUpperCase())}` : '';
      tip.append(el('div', 'ms-tip__sub', `Includes top shift pay${base}. Not in the medians`));
    } else if (p.nb === 'partTime' && !pt) tip.append(el('div', 'ms-tip__sub', 'Part-time pay. Not in the medians'));
    else if (pt) tip.append(el('div', 'ms-tip__sub', 'Not in the medians'));
    // viz-even: a row of several postings says how many share this posted range.
    const many = p.n > 1;
    if (many) tip.append(el('div', 'ms-tip__sub', `${p.n.toLocaleString()} postings with this posted ${p.nb === 'minimum' ? 'minimum' : 'range'}`));
    // V-20: a range over several levels or places lists each (levels are the same on every posting of a
    // row; places are each posting's own, so a row of several names none). V-35 (fix-pay-at-place): a bar
    // that is one place's row says which place it was posted for.
    const sp = p.span || null;
    const one = many ? stackPlace(p) : barPlace(p);
    const rows = (p.at || payAt(j))?.rows || 0;
    if (sp && many && sp.kind !== 'levels') {
      tip.append(el('div', 'ms-tip__sub', 'Each runs over several places’ ranges'));
    } else if (sp) {
      tip.append(el('div', 'ms-tip__sub', sp.kind === 'levels' ? `One range over ${sp.tiers.length} levels${one ? `, posted for ${one}` : ''}:` : `One range over ${sp.tiers.length} places' ranges:`));
      // A level span priced for another place than the headline (Microsoft's SF Bay Area / NYC range) has levels of its own, not listed.
      const own = sp.kind !== 'levels' || !p.at || (p.at.min === j.salary.min && p.at.max === j.salary.max);
      if (own) for (const t of sp.tiers.slice(0, 4)) tip.append(el('div', 'ms-tip__sub', `${t.label || 'Range'}: ${formatCurrency(t.min, t.currency || cur)} – ${formatCurrency(t.max, t.currency || cur)}`));
      if (own && sp.tiers.length > 4) tip.append(el('div', 'ms-tip__sub', `+${sp.tiers.length - 4} more`));
    } else if (one) {
      tip.append(el('div', 'ms-tip__sub', `Posted for ${one}${rows > 1 ? `; the posting${many ? 's list' : ' lists'} other places’ ranges too` : ''}`));
      // V-35: one posting's bar lists its places' ranges, this bar's own named as above, so the bar is seen as one of them.
      const all = !many && rows > 1 && Array.isArray(j.salary.ranges) ? j.salary.ranges.filter((r) => r && isFinite(Number(r.min))) : [];
      const mine = new Set((p.at || payAt(j))?.ranges || []);
      for (const r of all.slice(0, 4)) tip.append(el('div', 'ms-tip__sub', `${mine.has(r) ? one : r.label || 'Another place'}: ${formatCurrency(r.min, String(r.currency || cur).toUpperCase())} – ${formatCurrency(r.max ?? r.min, String(r.currency || cur).toUpperCase())}`));
      if (all.length > 4) tip.append(el('div', 'ms-tip__sub', `+${all.length - 4} more`));
    } else if (many && stackPerPlace(p)) {
      tip.append(el('div', 'ms-tip__sub', 'Each is the range posted for one of its places'));
    }
    if (isForeign(cur) && hasFx(cur)) tip.append(el('div', 'ms-tip__sub', p.lo === p.hi || p.nb === 'minimum' ? `about ${formatEnd(p.lo)} in US dollars (${FX_MONTH} rates)` : `about ${formatEnd(p.lo)} – ${formatEnd(p.hi)} in US dollars (${FX_MONTH} rates)`));
    const orig = j.salary.originalInterval || (j.salary.interval && j.salary.interval !== 'year' ? j.salary.interval : null);
    if (orig && orig !== 'year' && !pt) tip.append(el('div', 'ms-tip__sub', `A yearly figure worked out from ${INTERVAL_ADJ[orig] || orig} pay`));
    if (p.ote) tip.append(el('div', 'ms-tip__sub', `${OTE_LABEL}, not in the medians`)); // BP-13
    if (p.clipped) tip.append(el('div', 'ms-tip__sub', 'Runs past the edge of the chart (›)'));
    if (many) {
      // The titles, most common first (as a circle's tooltip lists them), and what they all share.
      const counts = new Map();
      for (const q of p.stack) { const t = q.job.title || 'Untitled'; counts.set(t, (counts.get(t) || 0) + 1); }
      const top = [...counts].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
      const list = el('ul', 'ms-tip__roles');
      for (const [t, k] of top.slice(0, 4)) {
        const li = el('li');
        li.append(el('span', 'ms-tip__role', t), el('span', 'ms-tip__n', k > 1 ? `×${k}` : ''));
        list.append(li);
      }
      tip.append(list);
      if (top.length > 4) tip.append(el('div', 'ms-tip__meta', `+${top.length - 4} more titles`));
      const lvl = shared(p, (q) => levelLabel(displayLevel(q)));
      const meta = [shared(p, (q) => q.department || null), lvl, shared(p, (q) => q.employmentType || null)].filter(Boolean).join(' · ');
      if (meta) tip.append(el('div', 'ms-tip__meta', meta));
      tip.hidden = false;
      return;
    }
    tip.append(el('div', 'ms-tip__title', j.title || 'Untitled'));
    const meta = [j.department, locationText(j)].filter(Boolean).join(' · ');
    if (meta) tip.append(el('div', 'ms-tip__meta', meta));
    const meta2 = [levelLabel(displayLevel(j)), j.employmentType].filter(Boolean).join(' · ');
    if (meta2) tip.append(el('div', 'ms-tip__meta', meta2));
    tip.hidden = false;
  }

  function setActive(i, announce = true) {
    const prev = rowsEl.querySelector('.ms-row.is-active');
    prev?.classList.remove('is-active');
    prev?.setAttribute('aria-selected', 'false');
    if (!itemByRow[i]) { activeIdx = -1; body.removeAttribute('aria-activedescendant'); return; }
    activeIdx = i;
    if (announce) scrollToY(rowY[i], rowH);
    const r = rowsEl.querySelector(`.ms-row[data-idx="${i}"]`);
    if (!r) { body.removeAttribute('aria-activedescendant'); return; }
    markActive(r);
    if (announce) setHover(i);
  }

  function onRangesKey(e) {
    const n = itemByRow.length;
    if (!n) return;
    const page = Math.max(1, Math.floor((scroll.clientHeight - sticky.offsetHeight) / rowH) - 1);
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[e.key];
    if (step != null) {
      e.preventDefault();
      setActive(activeIdx < 0 ? 0 : Math.max(0, Math.min(n - 1, activeIdx + step)));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : n - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && activeIdx >= 0) {
      e.preventDefault();
      activateRange(activeIdx);
    } else if (e.key === 'Escape') { setHover(-1); }
  }

  // ---------- shared interaction ----------
  function showBinTip(b) {
    tip.replaceChildren(
      el('div', 'ms-tip__value', plural(+b.dataset.n, 'posting')),
      el('div', 'ms-tip__meta', `midpoint ${moneyRange(+b.dataset.a, +b.dataset.b)}`),
    );
    tip.hidden = false;
  }

  function placeTip(cx, cy) {
    const pad = 14;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = cx + pad, top = cy + pad;
    if (left + tw > innerWidth - 8) left = cx - tw - pad;
    if (top + th > innerHeight - 8) top = cy - th - pad;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  function hideTip() { tip.hidden = true; tipKind = null; histTip = null; closer.disarm(); }

  // A finger, and the mouse events a phone emulates just after a tap, never hover (iOS sends no pointerleave
  // after them, so a tip they opened would stay).
  const onMove = e => {
    if (isTouchInput(e)) return;
    if (opts.view === 'clusters') { setCHover(e.target.closest?.('.ms-bin') || null, e); return; }
    const r = e.target.closest?.('.ms-row');
    setHover(r ? +r.dataset.idx : -1, e);
  };
  const onLeave = (e) => {
    if (e?.type === 'pointerleave' && isTouchInput(e)) return;
    if (opts.view === 'clusters') setCHover(null); else setHover(-1);
  };
  const onClick = e => {
    if (opts.view === 'clusters') {
      const t = e.target.closest?.('.ms-bin, .ms-crow__label');
      if (!t) return;
      const r = +t.dataset.r, i = +t.dataset.i;
      setCActive(r, i, false);
      activateCluster(r, i);
      return;
    }
    const r = e.target.closest?.('.ms-row');
    if (!r) return;
    const p = itemByRow[+r.dataset.idx];
    if (p) { setActive(+r.dataset.idx, false); activateRange(+r.dataset.idx); }
  };
  const onHistMove = e => {
    if (isTouchInput(e)) return;
    const b = e.target.closest?.('.ms-hist__bin');
    hist.querySelectorAll('.ms-hist__bin.is-hover').forEach(n => n !== b && n.classList.remove('is-hover'));
    if (!b) { hideTip(); return; }
    b.classList.add('is-hover');
    showBinTip(b);
    placeTip(e.clientX, e.clientY);
    armTip(b, 'mouse', hist);
  };
  function clearHist() {
    hist.querySelectorAll('.is-hover').forEach(n => n.classList.remove('is-hover'));
    if (histTip || tipKind === 'mouse') hideTip();
  }
  const onHistLeave = (e) => {
    if (isTouchInput(e) || tipKind === 'touch') return;
    hist.querySelectorAll('.is-hover').forEach(n => n.classList.remove('is-hover'));
    hideTip();
  };
  // The strip's bars have no action: on touch a tap shows the bar's tip (the nearest bar to the finger, as the
  // bars are thin), above the strip; a second tap on it, or a tap between bars, closes it.
  const onHistTap = e => {
    if (!isTouchInput(e)) return;
    let b = e.target.closest?.('.ms-hist__bin');
    if (!b) {
      let best = Infinity;
      for (const n of hist.querySelectorAll('.ms-hist__bin')) {
        const r = n.getBoundingClientRect(), d = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
        if (d < best) { best = d; b = n; }
      }
      if (best > 6) b = null;
    }
    const again = b && b === histTip;
    hist.querySelectorAll('.is-hover').forEach(n => n.classList.remove('is-hover'));
    hideTip();
    if (!b || again) return;
    b.classList.add('is-hover');
    showBinTip(b);
    const p = placeNearTap(b.getBoundingClientRect(), tip.offsetWidth, tip.offsetHeight, e.clientX);
    tip.style.transform = `translate(${p.left}px, ${p.top}px)`;
    armTip(b, 'touch', hist);
    histTip = b;
  };
  const onKey = e => (opts.view === 'clusters' ? onClusterKey(e) : onRangesKey(e));

  rowsEl.addEventListener('pointermove', onMove);
  rowsEl.addEventListener('pointerleave', onLeave);
  rowsEl.addEventListener('click', onClick);
  hist.addEventListener('pointermove', onHistMove);
  hist.addEventListener('pointerleave', onHistLeave);
  hist.addEventListener('click', onHistTap);
  body.addEventListener('keydown', onKey);
  body.addEventListener('blur', onLeave);
  // A tip whose item this scroll moves closes (a keyboard tip follows it): the closer (armTip) does both.
  scroll.addEventListener('scroll', () => { schedulePaint(); }, { passive: true });
  const onWinScroll = () => { if (container.classList.contains('ms-chart--flow')) schedulePaint(); };
  addEventListener('scroll', onWinScroll, { passive: true });

  function applyHighlight(id, scrollIt) {
    rowsEl.querySelectorAll('.is-highlighted').forEach(n => n.classList.remove('is-highlighted'));
    if (id == null) return;
    if (opts.view === 'clusters') {
      const b = binOfJob(id);
      if (!b) return;
      const ri = b.row.index;
      if (scrollIt) scrollToY(vItems[ri].y, vItems[ri].h, true);
      b.el?.classList.add('is-highlighted');
      return;
    }
    const i = rowOfJob(id);
    if (i == null) return;
    if (scrollIt) scrollToY(rowY[i], rowH, true);
    rowsEl.querySelector(`.ms-row[data-idx="${i}"]`)?.classList.add('is-highlighted');
  }

  // ---------- lifecycle ----------
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = scroll.clientWidth || container.clientWidth;
    if (Math.abs(w - lastW) >= 1) { lastW = w; schedule(); }
  });
  ro.observe(container);
  const offTheme = onThemeChange(schedule);

  return {
    /**
     * @param {object[]} nextJobs
     * @param {{view?: 'clusters'|'ranges', groupBy?: 'none'|'department'|'location'|'seniority'|'brand',
     *          colorBy?: 'none'|'department'|'location'|'seniority'|'brand',
     *          places?: string[]|null, placeTest?: (job, location) => boolean}} o
     *   view defaults to "clusters". groupBy defaults to "department" in clusters and
     *   "none" in ranges. colorBy applies to the ranges view only; in clusters the
     *   row's category color is named by the row label. places: the Location filter's keys
     *   (app.js S.l), with placeTest the host's own match (BP-2): only pay posted for those
     *   places is plotted (see chartPay).
     */
    update(nextJobs, o = {}) {
      jobs = Array.isArray(nextJobs) ? nextJobs : [];
      const view = VIEWS.includes(o.view) ? o.view : DEFAULT_VIEW;
      if (view !== opts.view) { selectedKey = null; activeIdx = -1; cActive = null; }
      if ((o.groupBy || (view === 'clusters' ? 'department' : 'none')) !== opts.groupBy) foldOpen = false; // UX-24
      opts = {
        view,
        groupBy: o.groupBy || (view === 'clusters' ? 'department' : 'none'),
        colorBy: o.colorBy || 'none',
        empty: o.empty ?? null, // P-16: the host's words when there are no postings (else the chart stays blank)
        places: placeList(o.places).length ? placeList(o.places) : null, // BP-2: the Location filter
        placeTest: placeList(o.places).length && typeof o.placeTest === 'function' ? o.placeTest : null,
      };
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      render();
    },
    highlight(jobId) {
      highlighted = jobId ?? null;
      applyHighlight(highlighted, highlighted != null);
    },
    /**
     * UX-57: the host's facts for the notes' Details (app.js: the stats line's, so the chart view has one
     * Details), listed before the chart's own; only the notes are redone.
     */
    setNotes(items) {
      hostNotes = Array.isArray(items) ? items : [];
      if (noteStats) renderNotes(noteStats);
    },
    /** Clear the selected cluster/row state (visual only; no callback). */
    clearSelection() {
      selectedKey = null;
      rowsEl.querySelectorAll('.is-selected').forEach(n => n.classList.remove('is-selected'));
    },
    get view() { return opts.view; },
    destroy() {
      ro.disconnect();
      offTheme();
      removeEventListener('scroll', onWinScroll);
      closer.disarm();
      if (raf) cancelAnimationFrame(raf);
      vReset();
      tip.remove();
      container.replaceChildren();
      container.classList.remove('ms-chart', 'ms-chart--flow', 'ms-chart--narrow', 'ms-chart--stack', 'ms-chart--clusters', 'ms-chart--ranges');
    },
  };
}

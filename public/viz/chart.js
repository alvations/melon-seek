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
// plotted only when its pay applies to one of those places (payLocations in public/features/shared.js:
// the locations in the pay currency's countries); the others stay out of the plot and every median,
// and the notes line counts them ("12 with pay for another country only, left out").
//
// Medians are base pay (BP-13): ranges with salary.kind 'ote' (on-target earnings, base plus
// commission at target) are plotted but left out of the medians, as in the app's stats line; only
// when nothing else is left does a median use them, and then it says "on-target earnings".
//
// Two views share one approx-USD salary axis, a slim sticky midpoint
// distribution strip, and a muted notes line under the chart:
//
// - "clusters" (default): one calm row per group (department by default;
//   groupBy "none" gives a single "All roles" row). Postings are binned by
//   midpoint and each bin is one circle sized by count (sqrt scale) over a soft
//   P25–P75 band with a median tick. Click a circle or a row label to call
//   onClusterSelect(jobs, label).
// - "ranges" (detail): one min–max range bar per posting, with a midpoint dot,
//   sorted by midpoint and optionally grouped into bands. Click calls onSelect(job).
//
// Plain DOM. Hover and keyboard focus only toggle classes and never re-render.

import {
  colorFor, assignColors, otherColor, slotColor, inkOn, OTHER_KEY, SLOT_COUNT, formatMoney,
  formatCurrency, toUSD, isForeign, hasFx, niceTicks, median, onThemeChange, prefersReducedMotion, isDark, FX_AS_OF,
  FX_SOURCE, COUNTRY_CURRENCY,
} from './palette.js';
import { levelLabel, displayLevel, DISPLAY_LEVEL_ORDER } from '../features/roles.js';
import { payLocations, OTE_LABEL } from '../features/shared.js';
import { renderNote } from './note.js';

export const VIEWS = Object.freeze(['clusters', 'ranges']);
export const DEFAULT_VIEW = 'clusters';

const ROW_H = 22;          // ranges: one posting
const ROW_H_NARROW = 44;   // ranges, narrow (phones): title line above the bar, a 44px touch target (M-8, M-17)
const HEAD_H = 30;         // ranges: group band header
const HIST_H = 28;         // distribution strip
const CROW_H = 52;         // clusters: one group row (wide)
const CROW_LABEL_H = 22;   // clusters, narrow: label line above the plot
const CROW_PLOT_H = 44;    // clusters, narrow: plot height
const BIN_STEPS = [10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000];
const MIN_BIN_PX = 34;     // a bin must be wide enough for a readable, countable circle
// D-9 / P-3: the seniority ladder for Clusters and Ranges, by displayLevel(): the ladder, then the
// default level (NOT_STATED, "Level not stated") last (lead decisions, 2026-10-10).
export const SENIORITY_ORDER = DISPLAY_LEVEL_ORDER;
const ALL_ROLES = 'All roles';

const INTERVAL_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly', term: 'fixed-term' };
const DIM_LABEL = { department: 'department', location: 'location', seniority: 'seniority' };

/** Category key for a job along a dimension (seniority: displayLevel(job), the level people see). */
export function keyOf(job, dim) {
  if (dim === 'department') return job.department || 'No department';
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
 * V-18: true when the posting's pay is posted for the place its Location row is named for: one of
 * its payLocations is that place, and the pay is in that place's currency (payLocations falls back
 * to every location when none matches the currency; a US range on a London-only posting is not
 * London pay).
 */
export function payCoversRow(job, key) {
  const locs = job?.locations || [];
  if (key === 'Unknown' && !locs.some((l) => l && !l.remote)) return true;
  if (key === 'Remote' && !locs.length) return true;
  const cur = payBasis(job);
  return payLocations(job).some((l) => {
    if (!l || rowKeyOfLoc(l) !== key) return false;
    const home = l.country ? COUNTRY_CURRENCY[String(l.country).toUpperCase()] : null;
    return !home || home === cur;
  });
}

/**
 * V-21: medians that compare like with like. When the plotted pay is in more than one currency,
 * each row's median, band and tick use the board's main currency (the most postings), or the row's
 * one currency when it has none of the main one; a row of several other currencies says so.
 * -> { stats (basePayStats), basis: currency|null, left: items not in the median }
 */
function basisStats(items, main) {
  if (!main) return { stats: basePayStats(items), basis: null, left: 0 };
  const own = items.filter((p) => payBasis(p.job) === main);
  if (own.length) return { stats: basePayStats(own), basis: main, left: items.length - own.length };
  const bases = new Set(items.map((p) => payBasis(p.job)));
  return { stats: basePayStats(items), basis: bases.size === 1 ? [...bases][0] : (items.length ? 'mixed' : null), left: 0 };
}
/** The most common pay currency of the plotted postings when there is more than one, else null. */
function mainBasis(items) {
  const n = new Map();
  for (const p of items) { const b = payBasis(p.job); n.set(b, (n.get(b) || 0) + 1); }
  if (n.size < 2) return null;
  return [...n].sort((a, b) => b[1] - a[1] || (a[0] === 'USD' ? -1 : 1))[0][0];
}
/** " in the US" after a median, "" when the row has no basis; "mixed" names its currencies. */
const basisWords = (r) => (r.basis === 'mixed' ? ', several countries’ pay' : r.basis ? ` ${payBasisPlace(r.basis)}` : '');
const basisWordsShort = (r) => (r.basis === 'mixed' ? ' mixed' : r.basis ? ` ${basisShort(r.basis)}` : '');

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
 *   -> { plotted: [{ job, lo, hi, mid, cur, ote }], noSalary, elsewhere, elsewhereIds, fxCount, unknownFx, ote }
 * With `places` (and `placeTest`, see placeMatcher) a posting is plotted only when its pay applies
 * to one of the places (payLocations); `elsewhere` counts the salaried ones left out (their ids in
 * `elsewhereIds`). `ote` marks on-target earnings (salary.kind 'ote'), which basePayStats leaves out
 * of medians.
 */
export function chartPay(jobs, { places = null, placeTest = null } = {}) {
  const test = placeMatcher(places, placeTest);
  const plotted = [];
  let noSalary = 0, fxCount = 0, ote = 0;
  const unknownFx = new Set(), elsewhereIds = new Set();
  for (const job of jobs || []) {
    const s = job?.salary;
    if (!s || (s.min == null && s.max == null)) { noSalary++; continue; }
    const cur = (s.currency || 'USD').toUpperCase();
    let min = s.min ?? s.max, max = s.max ?? s.min;
    // SA-5 (salary audit): under a Location filter, a posting that gives each place its own range
    // (salary.ranges[].locations: Amazon's rows, Apple's footers) is plotted at the range posted for the
    // places picked, the range its card shows (app.js pickedRange), not at the posting's headline range.
    let midNative = s.mid;
    if (test && Array.isArray(s.ranges) && s.ranges.length > 1) {
      const here = s.ranges.filter((r) => r && Array.isArray(r.locations) && Number.isFinite(Number(r.min)) && String(r.currency || cur).toUpperCase() === cur
        && (job.locations || []).some((l) => l && r.locations.includes(l.rawName || l.name) && test(job, l)));
      if (here.length) {
        min = Math.min(...here.map((r) => Number(r.min)));
        max = Math.max(...here.map((r) => Number(r.max ?? r.min)));
        midNative = (min + max) / 2;
      }
    }
    const lo = toUSD(Math.min(min, max), cur), hi = toUSD(Math.max(min, max), cur);
    const mid = midNative != null ? toUSD(midNative, cur) : (lo + hi) / 2;
    if (!isFinite(lo) || !isFinite(hi) || !isFinite(mid)) { noSalary++; continue; }
    if (test && !payLocations(job).some((l) => test(job, l))) { elsewhereIds.add(job.id); continue; }
    if (isForeign(cur)) { if (hasFx(cur)) fxCount++; else unknownFx.add(cur); }
    const isOte = s.kind === 'ote';
    if (isOte) ote++;
    plotted.push({ job, lo, hi, mid, cur, ote: isOte });
  }
  return { plotted, noSalary, elsewhere: elsewhereIds.size, elsewhereIds, fxCount, unknownFx: [...unknownFx], ote };
}

/**
 * BP-13: median and quartiles of base pay (the midpoints of the items that are not on-target
 * earnings), the same set as the app's stats line. Only when every item is on-target earnings are
 * they used, with `oteOnly` set. `oteLeftOut` counts the on-target items left out.
 */
export function basePayStats(items) {
  const base = [], ote = [];
  for (const p of items || []) if (p && p.mid != null && isFinite(p.mid)) (p.ote ? ote : base).push(p.mid);
  const use = (base.length ? base : ote).sort((a, b) => a - b);
  return {
    median: quantile(use, 0.5), p25: quantile(use, 0.25), p75: quantile(use, 0.75), n: use.length,
    oteOnly: !base.length && ote.length > 0, oteLeftOut: base.length ? ote.length : 0,
  };
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

const moneyRange = (a, b) => `${formatMoney(a)}–${formatMoney(b)}`;
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
const chipWidth = (n, font) => Math.max(18, textWidth(n > 1 ? `›${n}` : '›', font) + 10);

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
  sticky.append(hist, axis);
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

  // ---------- data prep ----------
  function prepare() {
    // BP-2: under a Location filter only pay posted for those places; BP-13: base-pay medians.
    const r = chartPay(jobs, { places: opts.places, placeTest: opts.placeTest });
    plotted = r.plotted;
    for (const p of plotted) p.key = keyOf(p.job, opts.colorBy);
    return { ...r, pay: basePayStats(plotted) };
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
  function render() {
    raf = 0;
    width = scroll.clientWidth || container.clientWidth || 800;
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
            `${plural(jobs.length, 'posting')} match; ${stats.elsewhere.toLocaleString()} ${stats.elsewhere === 1 ? 'lists' : 'list'} pay for another country only, so the chart leaves ${stats.elsewhere === 1 ? 'it' : 'them'} out.`]
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
      if (activeJobId != null && idxByJob.has(activeJobId)) activeIdx = idxByJob.get(activeJobId); // applied when the row is built
    }
    renderNotes(stats);

    // Scroll mode: scroll internally only when the container constrains height;
    // otherwise flow with the page so the sticky header sticks to the viewport.
    container.classList.remove('ms-chart--flow');
    if (scroll.scrollHeight <= scroll.clientHeight + 1) container.classList.add('ms-chart--flow');
    paint();

    if (highlighted) applyHighlight(highlighted, false);
  }

  function renderNotes({ noSalary, fxCount, unknownFx, elsewhere, pay }) {
    const where = placesPhrase(opts.places);
    // fix-density: one line with the two counts a job seeker needs ("564 with pay · 81 without"); every
    // other caveat in the short list behind "Details" (public/viz/note.js), in plain words.
    const line = [];
    if (plotted.length || noSalary) line.push(`${plotted.length.toLocaleString()} with pay${where && plotted.length ? ` for ${where}` : ''}`);
    if (noSalary) line.push(`${noSalary.toLocaleString()} without`);
    const isAre = (n) => (n === 1 ? 'is' : 'are');
    const details = [
      // BP-2: with a Location filter, the plotted pay is for those places, and the rest is counted.
      elsewhere ? `${plural(elsewhere, 'posting')} with pay for another country only ${isAre(elsewhere)} left out${where ? `: that pay says nothing about pay in ${where}` : ''}` : '',
      // V-18: Group by Location rows hold only the pay posted for their place.
      rowNotes.offRow ? `${plural(rowNotes.offRow, 'posting')} with pay for another place than their row’s ${isAre(rowNotes.offRow)} not in the rows` : '',
      // V-21: rows compare one country's pay when the board mixes currencies.
      rowNotes.basis && rowNotes.basisLeft ? `Each row’s median is pay ${payBasisPlace(rowNotes.basis)} only: ${rowNotes.basisLeft.toLocaleString()} paid elsewhere ${isAre(rowNotes.basisLeft)} on the chart, not in the medians` : '',
      // BP-13: on-target earnings are plotted but not in the medians (the stats line's rule).
      pay?.oteLeftOut ? `${pay.oteLeftOut.toLocaleString()} with on-target earnings (base plus commission) ${isAre(pay.oteLeftOut)} on the chart, not in the medians`
        : pay?.oteOnly ? 'All of this pay is on-target earnings (base plus commission at target)' : '',
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
    return pay?.oteOnly ? 'Median on-target earnings ' : 'Median base pay ';
  }
  function medianTitle(pay) {
    const where = placesPhrase(opts.places);
    const here = where ? ` posted for ${where}` : '';
    if (pay?.oteOnly) return `The middle of the on-target earnings (base plus commission at target) ranges${here}: half are above and half below`;
    return `The middle of the base pay ranges${here}: half are above and half below${pay?.oteLeftOut ? `. ${plural(pay.oteLeftOut, 'posting')} with on-target earnings (base plus commission) left out` : ''}`;
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
      cap.append(el('span', 'ms-hist__title', medianCaption(pay)), el('span', 'ms-hist__sub', formatMoney(med)));
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

  function renderAxis(ticks, x, approx, labelW, narrow) {
    axis.replaceChildren();
    if (labelW > 0) {
      // I-3: plain words ("Annual salary · approx USD" read as jargon).
      const cap = el('div', 'ms-axis__cap', narrow ? (approx ? 'US$ a year, converted' : 'US$ a year') : (approx ? 'Yearly pay, US$ (converted)' : 'Yearly pay, US$'));
      cap.title = approx ? 'Yearly pay in US dollars; pay in other currencies is converted at fixed rates' : 'Yearly pay in US dollars';
      cap.style.width = labelW + 'px';
      axis.append(cap);
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
      if (dim === 'location' && !payCoversRow(p.job, k)) { rowOf(k).offPay++; offRow++; continue; }
      rowOf(k).items.push(p);
    }
    cRows = [...m.values()];
    // UX-24: more departments than colours: the 7 with the most postings with pay keep their rows
    // (and colours); the rest fold into one "N more departments" row, which opens on a click.
    let foldRow = null, folded = [];
    if (dim === 'department' && cRows.length > SLOT_COUNT) {
      const rank = cRows.slice().sort((a, b) => b.items.length - a.items.length || b.all.length - a.all.length || String(a.key).localeCompare(String(b.key)));
      const keep = new Set(rank.slice(0, SLOT_COUNT - 1));
      folded = cRows.filter((r) => !keep.has(r));
      foldRow = { key: '\u0001more', name: `${folded.length.toLocaleString()} more departments`, all: folded.flatMap((r) => r.all), items: folded.flatMap((r) => r.items), offPay: 0, fold: true };
      cRows = [...cRows.filter((r) => keep.has(r)), foldRow, ...(foldOpen ? folded : [])];
      for (const r of folded) r.inFold = true;
    } else if (dim !== 'department') foldOpen = false;
    // V-21: rows grouped by department or seniority compare one country's pay when the board mixes currencies.
    const main = dim === 'department' || dim === 'seniority' ? mainBasis(plotted) : null;
    let basisLeft = 0;
    for (const r of cRows) {
      // BP-13: the row's median, quartiles and band are base pay (on-target earnings only when
      // that is all the row has, and then it says so).
      const b = basisStats(r.items, main);
      const ps = b.stats;
      r.basis = main ? b.basis : null; r.basisLeft = b.left;
      if (!r.inFold) basisLeft += b.left;
      r.median = ps.median; r.p25 = ps.p25; r.p75 = ps.p75;
      const onTarget = ps.oteOnly && !stats.pay?.oteOnly ? 'on-target ' : '';
      // BP-2: a row whose ranges are all for another country has no salary posted for here.
      const none = r.offPay || (stats.elsewhere && r.all.some((j) => stats.elsewhereIds.has(j.id))) ? ['no salary posted for here', 'no salary here'] : ['no published salary', 'no salary'];
      r.noneText = r.items.length ? '' : none[0];
      r.subFull = r.items.length ? `${plural(r.all.length, 'role')} · ${onTarget}median ${formatMoney(r.median)}${basisWords(r)}` : `${plural(r.all.length, 'role')} · ${none[0]}`;
      r.subShort = r.items.length ? `${r.all.length.toLocaleString()} · ${onTarget}${formatMoney(r.median)}${basisWordsShort(r)}` : `${r.all.length.toLocaleString()} · ${none[1]}`;
      const why = [];
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
    const fam = (typeof getComputedStyle === 'function' && getComputedStyle(container).fontFamily) || 'system-ui, sans-serif';
    const NAME_FONT = `600 13px ${fam}`, SUB_FONT = `12px ${fam}`;
    if (!narrow) {
      const maxW = Math.max(150, Math.min(320, Math.round(width * 0.36)));
      let need = 0;
      for (const r of cRows) {
        const nameW = textWidth(r.name, NAME_FONT);
        need = Math.max(need, textWidth(r.subFull, SUB_FONT), nameW > 150 ? Math.min(nameW, nameW / 2 + 24) : nameW);
      }
      // BP-13: the median caption ("Median base pay $347K") shows in full too.
      need = Math.max(need, textWidth(`${medianCaption(stats.pay)}${formatMoney(stats.pay?.median)}`, `600 ${SUB_FONT}`) - 8);
      labelW = Math.round(Math.max(150, Math.min(maxW, need + LABEL_PAD)));
      for (const r of cRows) r.useShort = textWidth(r.subFull, SUB_FONT) + LABEL_PAD > labelW;
    } else {
      for (const r of cRows) r.useShort = true; // stacked label line: the short form never truncates
    }
    // Robust domain: P1..P99 of midpoints, padded, snapped to $50K/$100K/$250K ticks.
    const [lo, hi] = robustBounds(plotted.map(p => p.mid));
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
    // Bin width: the smallest standard step that leaves room for a readable circle. V-29: bins are
    // aligned to the axis (a whole number of bins from its start, and the axis ends on a bin edge),
    // so no circle is centred on the axis end, past the last gridline.
    const minBinPx = solo ? 46 : MIN_BIN_PX;
    const steps = BIN_STEPS.filter(b => step % b === 0 || b % step === 0);
    const binW = steps.find(b => b * (plotW / (d1 - d0)) >= minBinPx) || steps[steps.length - 1];
    if ((d1 - d0) % binW) d1 = d0 + Math.ceil((d1 - d0) / binW) * binW;
    const x = v => plotL + ((v - d0) / (d1 - d0)) * plotW;
    const xc = v => x(Math.min(d1, Math.max(d0, v)));
    const ticks = [];
    for (let t = d0; t <= d1 + 1; t += step) ticks.push(t);
    container.style.setProperty('--ms-plot-l', plotL + 'px');
    container.style.setProperty('--ms-label-w', labelW + 'px');
    container.classList.remove('ms-chart--stack');
    renderHist(x, d0, d1, plotL, plotW, labelW, stats.pay);
    renderAxis(ticks, x, stats.fxCount > 0, labelW, narrow);

    const pxPer = plotW / (d1 - d0);
    const binPx = binW * pxPer;
    container.style.setProperty('--ms-bin-slop', Math.round(Math.min(44, binPx)) + 'px'); // touch slop never reaches a neighbour (M-8)
    for (const r of cRows) {
      const bm = new Map();
      const below = [], above = [];
      for (const p of r.items) {
        if (p.mid < d0) { below.push(p); continue; }
        if (p.mid > d1) { above.push(p); continue; }
        const start = d0 + Math.min(Math.floor((p.mid - d0) / binW), Math.round((d1 - d0) / binW) - 1) * binW;
        if (!bm.has(start)) bm.set(start, []);
        bm.get(start).push(p);
      }
      r.bins = [...bm].sort((a, b) => a[0] - b[0])
        .map(([start, items]) => ({ start, end: start + binW, center: start + binW / 2, items, row: r }));
      // Values beyond the axis are never dropped: they become edge overflow markers.
      if (below.length) r.bins.unshift({ start: 'lo', end: d0, center: d0 - binW, overflow: 'lo', items: below.sort((a, b) => a.mid - b.mid), row: r });
      if (above.length) r.bins.push({ start: 'hi', end: d1, center: d1 + binW, overflow: 'hi', items: above.sort((a, b) => b.mid - a.mid), row: r });
      outCount += below.length + above.length;
    }
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
      const surf = parseColor(getComputedStyle(container).backgroundColor) || (isDark() ? [22, 26, 33] : [252, 252, 251]);
      for (const r of cRows) {
        const pct = 1; // = viz.css --_bin-mix: V-22, circles are the row colour itself (>= 3:1 on the surface)
        const c = parseColor(r.color) || surf;
        r.restInk = inkOn(toHex(c.map((v, k) => v * pct + surf[k] * (1 - pct))));
      }
    }

    const plotH = narrow ? (solo ? 72 : CROW_PLOT_H) : (solo ? 92 : CROW_H);
    const rowH = narrow ? CROW_LABEL_H + plotH : plotH;
    const rMax = Math.max(6, Math.min(binPx / 2 - 1.5, plotH / 2 - 9, solo ? 30 : 16));
    const rMin = Math.min(4.5, rMax);

    const maxN = Math.max(1, ...cRows.flatMap(r => r.bins.filter(b => !b.overflow).map(b => b.items.length)));
    const gridFrag = document.createDocumentFragment();
    cRows.forEach((r, ri) => {
      r.index = ri;
      for (const b of r.bins) for (const p of b.items) binByJob.set(p.job.id, b);
      vItems.push({ y: ri * rowH, h: rowH, build: () => buildCRow(r, ri), unbuild: () => { r.el = r.labelEl = null; for (const b of r.bins) b.el = null; } });
    });
    function buildCRow(r, ri) {
      const row = el('div', r.other ? 'ms-crow ms-crow--other' : 'ms-crow');
      if (ri === cRows.length - 1) row.classList.add('ms-crow--last');
      row.setAttribute('role', 'group');
      const sub = r.useShort ? r.subShort : r.subFull;
      row.setAttribute('aria-label', `${r.name}, ${r.subFull.replace(' · ', ', ')}`);
      row.style.height = rowH + 'px';
      row.style.setProperty('--c', r.color);
      row.style.setProperty('--c-ink', r.ink);
      row.style.setProperty('--c-rest-ink', r.restInk);
      r.el = row;

      const lab = el('div', 'ms-crow__label');
      lab.setAttribute('role', 'option');
      lab.setAttribute('aria-selected', 'false');
      lab.setAttribute('aria-label', `${r.name}: all ${plural(r.all.length, 'role')}${r.items.length ? `, ${r.subFull.split(' · ')[1]}` : `, ${r.noneText}`}`);
      lab.id = `${uid}-${ri}-L`;
      lab.dataset.r = ri; lab.dataset.i = -1;
      if (!narrow) lab.style.width = labelW + 'px';
      const sw = el('span', 'ms-crow__swatch');
      const txt = el('span', 'ms-crow__text');
      const nameEl = el('span', 'ms-crow__name', r.name);
      if (r.fold) nameEl.append(el('span', 'ms-crow__fold', foldOpen ? ' \u25B4' : ' \u25BE')); // UX-24: ▾ opens, ▴ folds
      txt.append(nameEl, el('span', 'ms-crow__sub', sub));
      lab.append(sw, txt);
      lab.title = r.fold
        ? `${r.name}: ${r.subFull}. Click to ${foldOpen ? 'fold them into one row again' : 'show each department'}${r.why ? `. ${r.why}` : ''}`
        : `${r.name}: ${r.subFull}.${r.why ? ` ${r.why}` : ''} Click to show all ${plural(r.all.length, 'role')}`;
      if (r.fold) lab.setAttribute('aria-expanded', foldOpen ? 'true' : 'false');
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
        const none = el('div', 'ms-crow__none', r.noneText === 'no salary posted for here' ? 'No salary posted for here' : 'No published salaries');
        none.style.left = plotL + 'px';
        plot.append(none);
      }
      r.bins.forEach((b, bi) => {
        const n = b.items.length;
        if (b.overflow) { const o = overflowMarker(b, ri, bi, plotL, plotW, narrow); plot.append(o); decorateBin(b, ri, bi); return; }
        const rad = Math.max(rMin, rMax * Math.sqrt(n / maxN));
        const cx = Math.min(plotL + plotW, Math.max(plotL, x(b.center)));
        const hit = Math.max(24, Math.min(binPx, 2 * rad + 6));
        const bin = el('div', bandL != null && cx >= bandL && cx <= bandR ? 'ms-bin ms-bin--inband' : 'ms-bin');
        bin.setAttribute('role', 'option');
        bin.setAttribute('aria-selected', 'false');
        const approx = b.items.some(p => isForeign(p.cur) && hasFx(p.cur));
        bin.setAttribute('aria-label', `${plural(n, 'role')}, ${formatMoney(b.start)} to ${formatMoney(b.end)}${approx ? ' in US dollars, converted' : ''}, ${r.name}`);
        bin.id = `${uid}-${ri}-${bi}`;
        bin.dataset.r = ri; bin.dataset.i = bi;
        bin.style.left = (cx - hit / 2) + 'px';
        bin.style.width = hit + 'px';
        bin.style.height = Math.max(hit, 2 * rad + 6) + 'px';
        const dot = el('span', 'ms-bin__dot');
        dot.style.width = dot.style.height = (2 * rad) + 'px';
        // A count only when it fits inside its (solid, V-22) circle; the exact count is in the aria-label.
        if (n >= 2 && rad >= 8 && textWidth(shortCount(n), chipFont.replace('700', '600')) + 3 <= 2 * rad) {
          dot.textContent = shortCount(n); // M-23: "4.5K"
          if (rad < 11) dot.classList.add('ms-bin__dot--sm');
        }
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
    const chip = el('span', 'ms-bin__dot ms-bin__chip', (hi ? '›' : '‹') + (n > 1 ? n : ''));
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
    return `${row.name} · ${moneyRange(b.start, b.end)}`;
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
    tip.append(el('div', 'ms-tip__sub', `${moneyRange(b.start, b.end)} midpoint${approx ? ' · converted to US$' : ''}`));
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
    if (evt) placeTip(evt.clientX, evt.clientY);
    else { const bb = binEl.getBoundingClientRect(); placeTip(bb.right - 6, bb.bottom - 6); }
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

  function groups() {
    if (opts.groupBy === 'none') return [{ name: null, items: plotted.slice().sort((a, b) => b.mid - a.mid) }];
    const m = new Map();
    for (const p of plotted) {
      const k = keyOf(p.job, opts.groupBy);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    // BP-13: a group's median is base pay, like the stats line's. V-21: by department or seniority
    // it compares one country's pay when the board mixes currencies (as the Clusters rows do).
    const main = opts.groupBy === 'department' || opts.groupBy === 'seniority' ? mainBasis(plotted) : null;
    let left = 0;
    const out = [...m].map(([key, items]) => {
      const b = basisStats(items, main);
      left += b.left;
      return { key, name: groupName(opts.groupBy, key), items: items.sort((a, b) => b.mid - a.mid), median: b.stats.median, onTarget: b.stats.oteOnly, basis: b.basis, basisLeft: b.left };
    });
    rowNotes = { ...rowNotes, basis: main, basisLeft: left };
    if (opts.groupBy === 'seniority') {
      out.sort((a, b) => senRank(a.key) - senRank(b.key) || b.median - a.median);
    } else {
      out.sort((a, b) => b.median - a.median || b.items.length - a.items.length);
    }
    return out;
  }

  function renderRanges(stats, narrow) {
    const { top, counts, ordered } = colorKeys();
    const topSet = new Set(top);
    const colorOf = p => opts.colorBy === 'none' ? null : (topSet.has(p.key) ? colorFor(p.key) : otherColor());
    // V-20 / V-19: bars that are not one posted yearly range, counted for the legend and the notes.
    let spans = 0, partTime = 0;
    for (const p of plotted) { p.span = spanTiers(p.job); if (p.span) spans++; p.partTime = isPartTimeHourly(p.job); if (p.partTime) partTime++; }
    rowNotes = { ...rowNotes, spans, partTime };
    renderLegend(top, counts, ordered, spans);
    head.hidden = legend.hidden;

    // Narrow (phones): the full-width title sits above its bar, so titles stay readable (M-17).
    rowH = narrow ? ROW_H_NARROW : ROW_H;
    const labelW = narrow ? 0 : Math.round(Math.max(140, Math.min(300, width * 0.3)));
    const valFont = `600 12px ${(typeof getComputedStyle === 'function' && getComputedStyle(container).fontFamily) || 'system-ui, sans-serif'}`;
    const padR = narrow ? 16 : 28;
    const plotL = narrow ? 12 : labelW + 12;
    container.classList.toggle('ms-chart--stack', narrow);
    const plotW = Math.max(80, width - plotL - padR);
    // Robust domain: P1..P99 of midpoints, widened to the robust ends of the bars
    // (P1 of minimums, P99 of maximums) so ordinary ranges are not clipped, then
    // padded and snapped to nice ticks. Anything beyond gets an edge marker.
    const [mLo, mHi] = robustBounds(plotted.map(p => p.mid));
    const lo = Math.min(mLo, robustBounds(plotted.map(p => p.lo))[0]);
    const hi = Math.max(mHi, robustBounds(plotted.map(p => p.hi))[1]);
    const pad = Math.max((hi - lo) * AXIS_PAD, 1000);
    const nt = niceTicks(Math.max(0, lo - pad), hi + pad, Math.max(2, Math.floor(plotW / 90)));
    const d0 = Math.max(0, nt.start), d1 = nt.end > d0 ? nt.end : d0 + 1;
    if (nt.ticks[0] < 0) nt.ticks = nt.ticks.filter(t => t >= 0);
    const x = v => plotL + ((v - d0) / (d1 - d0)) * plotW;
    const xc = v => x(Math.min(d1, Math.max(d0, v)));
    container.style.setProperty('--ms-plot-l', plotL + 'px');
    container.style.setProperty('--ms-label-w', labelW + 'px');

    renderHist(x, d0, d1, plotL, plotW, labelW, stats.pay);
    renderAxis(nt.ticks, x, stats.fxCount > 0, labelW, narrow);

    const gridFrag = document.createDocumentFragment();
    let y = 0;
    let idx = 0;
    let gi = 0;
    for (const g of groups()) {
      if (g.name != null) {
        const first = gi++ === 0;
        vItems.push({ y, h: HEAD_H, build: () => buildHead(g, first) });
        y += HEAD_H;
        const mx = xc(g.median);
        const line = el('div', 'ms-chart__median');
        line.style.left = mx + 'px';
        line.style.top = (y - 6) + 'px';
        line.style.height = (g.items.length * rowH + 6) + 'px';
        gridFrag.append(line);
      }
      for (const p of g.items) {
        const i = idx++;
        itemByRow[i] = p;
        idxByJob.set(p.job.id, i);
        rowY[i] = y;
        p.group = g.name;
        p.clipped = p.hi > d1 || p.lo < d0;
        if (p.mid < d0 || p.mid > d1) outCount++;
        vItems.push({ y, h: rowH, build: () => buildRow(p, i) });
        y += rowH;
      }
    }
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
        if (mx > width - textWidth(mtext, `12px ${(typeof getComputedStyle === 'function' && getComputedStyle(container).fontFamily) || 'system-ui, sans-serif'}`) - 16) ml.classList.add('ms-group__median--left');
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
        const lab = el('div', 'ms-row__label', p.job.title || 'Untitled');
        if (!narrow) lab.style.width = labelW + 'px';
        const bx0 = xc(p.lo), bx1 = xc(p.hi);
        // V-20: a range over several levels or places is striped, on-target earnings dashed.
        const bar = el('div', p.span ? 'ms-row__bar ms-row__bar--span' : p.ote ? 'ms-row__bar ms-row__bar--ote' : 'ms-row__bar');
        bar.style.left = bx0 + 'px';
        bar.style.width = Math.max(0, bx1 - bx0) + 'px';
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

  function optionName(p) {
    const approx = isForeign(p.cur) && hasFx(p.cur);
    const range = Math.round(p.lo / 1000) === Math.round(p.hi / 1000)
      ? formatMoney(p.lo) : `${formatMoney(p.lo)} to ${formatMoney(p.hi)}`;
    const where = [p.job.department, primaryLocation(p.job)].filter(Boolean).join(', ');
    const sp = spanTiers(p.job);
    const kind = sp ? (sp.span === false ? `, one of ${sp.tiers.length} places\u2019 ranges` : `, spans ${sp.tiers.length} ${sp.kind === 'levels' ? 'levels' : 'places\u2019 ranges'}`) : '';
    const pt = isPartTimeHourly(p.job) ? ', part-time hourly pay shown as a year if full-time' : '';
    return `${p.job.title || 'Untitled'}, ${range}${approx ? ' in US dollars, converted' : ''}${p.ote ? ', on-target earnings' : ''}${kind}${pt}${where ? ', ' + where : ''}`;
  }

  function rangeText(p) {
    const pre = isForeign(p.cur) && hasFx(p.cur) ? '≈' : '';
    if (Math.round(p.lo / 1000) === Math.round(p.hi / 1000)) return pre + formatMoney(p.lo);
    return pre + moneyRange(p.lo, p.hi);
  }

  function renderLegend(top, counts, ordered, spans = 0) {
    legend.replaceChildren();
    legend.hidden = opts.colorBy === 'none';
    if (legend.hidden) return;
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
    // V-20: the striped bar's key, beside the colours (only when there are such bars).
    if (spans) {
      const item = el('span', 'ms-legend__span');
      item.append(el('span', 'ms-legend__spansw'), el('span', 'ms-legend__spankey', 'Striped: several levels or places'), el('span', 'ms-legend__n', spans.toLocaleString()));
      item.title = `${plural(spans, 'posting')} whose range runs over several levels (NVIDIA "Level 4" and "Level 5") or several places' ranges: hover a bar for each`;
      legend.append(item);
    }
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
    if (evt) placeTip(evt.clientX, evt.clientY);
    else if (r) { const b = r.getBoundingClientRect(); placeTip(b.left + parseFloat(container.style.getPropertyValue('--ms-plot-l')), b.bottom); }
    onHover?.(itemByRow[i].job);
  }

  function showJobTip(p) {
    const j = p.job, s = j.salary;
    tip.replaceChildren();
    const cur = (s.currency || 'USD').toUpperCase();
    const native = s.min === s.max || s.max == null || s.min == null
      ? formatCurrency(s.min ?? s.max, cur)
      : `${formatCurrency(s.min, cur)} – ${formatCurrency(s.max, cur)}`;
    const pt = isPartTimeHourly(j);
    // V-19 (shared decision 4): part-time hourly pay shows the hourly rate it was posted at; the bar
    // is a year if full-time.
    if (pt) {
      const hourly = (v) => `${cur === 'USD' ? '$' : ''}${(v / 2080).toFixed(2)}`;
      tip.append(el('div', 'ms-tip__value', withCurrencyCode(`${hourly(s.min ?? s.max)}${s.max != null && s.max !== s.min ? ` – ${hourly(s.max)}` : ''} an hour`, cur)));
      tip.append(el('div', 'ms-tip__sub', `Part-time. The bar is ${withCurrencyCode(native, cur)} a year if full-time (2,080 hours)`));
    } else tip.append(el('div', 'ms-tip__value', withCurrencyCode(native, cur)));
    // V-20: a range over several levels or places lists each.
    const sp = spanTiers(j);
    if (sp) {
      tip.append(el('div', 'ms-tip__sub', sp.kind === 'levels' ? `One range over ${sp.tiers.length} levels:` : sp.span === false ? `The range for one place; the posting lists ${sp.tiers.length} places' ranges:` : `One range over ${sp.tiers.length} places' ranges:`));
      for (const t of sp.tiers.slice(0, 4)) tip.append(el('div', 'ms-tip__sub', `${t.label || 'Range'}: ${formatCurrency(t.min, t.currency || cur)} – ${formatCurrency(t.max, t.currency || cur)}`));
      if (sp.tiers.length > 4) tip.append(el('div', 'ms-tip__sub', `+${sp.tiers.length - 4} more`));
    }
    if (isForeign(cur) && hasFx(cur)) tip.append(el('div', 'ms-tip__sub', `about ${formatMoney(p.lo)} – ${formatMoney(p.hi)} in US dollars (${FX_MONTH} rates)`));
    const orig = s.originalInterval || (s.interval && s.interval !== 'year' ? s.interval : null);
    if (orig && orig !== 'year' && !pt) tip.append(el('div', 'ms-tip__sub', `A yearly figure worked out from ${INTERVAL_ADJ[orig] || orig} pay`));
    if (p.ote) tip.append(el('div', 'ms-tip__sub', `${OTE_LABEL}, not in the medians`)); // BP-13
    if (p.clipped) tip.append(el('div', 'ms-tip__sub', 'Runs past the edge of the chart (›)'));
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
      onSelect?.(itemByRow[activeIdx].job);
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

  function hideTip() { tip.hidden = true; }

  const onMove = e => {
    if (opts.view === 'clusters') { setCHover(e.target.closest?.('.ms-bin') || null, e); return; }
    const r = e.target.closest?.('.ms-row');
    setHover(r ? +r.dataset.idx : -1, e);
  };
  const onLeave = () => { if (opts.view === 'clusters') setCHover(null); else setHover(-1); };
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
    if (p) { setActive(+r.dataset.idx, false); onSelect?.(p.job); }
  };
  const onHistMove = e => {
    const b = e.target.closest?.('.ms-hist__bin');
    hist.querySelectorAll('.ms-hist__bin.is-hover').forEach(n => n !== b && n.classList.remove('is-hover'));
    if (!b) { hideTip(); return; }
    b.classList.add('is-hover');
    showBinTip(b);
    placeTip(e.clientX, e.clientY);
  };
  const onHistLeave = () => { hist.querySelectorAll('.is-hover').forEach(n => n.classList.remove('is-hover')); hideTip(); };
  const onKey = e => (opts.view === 'clusters' ? onClusterKey(e) : onRangesKey(e));

  rowsEl.addEventListener('pointermove', onMove);
  rowsEl.addEventListener('pointerleave', onLeave);
  rowsEl.addEventListener('click', onClick);
  hist.addEventListener('pointermove', onHistMove);
  hist.addEventListener('pointerleave', onHistLeave);
  body.addEventListener('keydown', onKey);
  body.addEventListener('blur', onLeave);
  scroll.addEventListener('scroll', () => { if (!tip.hidden) hideTip(); schedulePaint(); }, { passive: true });
  const onWinScroll = () => { if (container.classList.contains('ms-chart--flow')) schedulePaint(); };
  addEventListener('scroll', onWinScroll, { passive: true });

  function applyHighlight(id, scrollIt) {
    rowsEl.querySelectorAll('.is-highlighted').forEach(n => n.classList.remove('is-highlighted'));
    if (id == null) return;
    if (opts.view === 'clusters') {
      const b = binByJob.get(id);
      if (!b) return;
      const ri = b.row.index;
      if (scrollIt) scrollToY(vItems[ri].y, vItems[ri].h, true);
      b.el?.classList.add('is-highlighted');
      return;
    }
    const i = idxByJob.get(id);
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
     * @param {{view?: 'clusters'|'ranges', groupBy?: 'none'|'department'|'location'|'seniority',
     *          colorBy?: 'none'|'department'|'location'|'seniority',
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
      if (raf) cancelAnimationFrame(raf);
      vReset();
      tip.remove();
      container.replaceChildren();
      container.classList.remove('ms-chart', 'ms-chart--flow', 'ms-chart--narrow', 'ms-chart--stack', 'ms-chart--clusters', 'ms-chart--ranges');
    },
  };
}

// melon·seek — application shell.
// Owns state (mirrored in location.hash), data fetching, filters, the results
// list, the job drawer and the company switcher. Rendering of the salary
// chart and the map is delegated to ./viz/* (see docs/CONTRACT.md).

import { colorFor, formatMoney, resetColors, assignColors, otherColor, toUSD, SLOT_COUNT, hasFx, juiceNetForScore, JUICE_BREAKS, FX_AS_OF, FX_SOURCE, FX_PER_USD } from './viz/palette.js';
import { createChart, keyOf, VIEWS, DEFAULT_VIEW, payBasisPlace, medianWording } from './viz/chart.js';
import { renderNote, noteLine, fitLine as fitOneLine } from './viz/note.js';
import { createMap } from './viz/map.js';
import * as api from './api.js';
import { createCompstimateWidget, compstimateForJob, estimateView } from './features/compstimate.js';
import { compsForJob, compsNote, createCompsCard } from './features/comps.js';
import { loadFreshness, freshnessDoc, juiceAsOfText, juiceSpanText, marketAsOfText, compstimateAsOfText, asOf, formatAsOf } from './features/freshness.js';
import { createCompsChart } from './viz/comps.js';
import { roleFamily, FAMILY_LABELS, readableTitle, levelLabel, displayLevel, NOT_STATED, DISPLAY_LEVEL_ORDER, levelKey, levelFromKey, postedLevels } from './features/roles.js';
import { payLocations, payRank, rankText, samePayCountry, countryInSentence, payAt, pricedPlaces, placeLabel, notBasePay, isTermUnstated, mainPayCurrency, headlineMedian, medianText, currencyWords } from './features/shared.js';
import { taxRows, jurisdictionOf, householdTaxLine, PERIOD_KEY, periodOf, shownPeriod, gradeMeaning, gradeShort } from './features/juice-drawer.js';
// ./features/insights.js is imported on first use (Insights mode), see renderInsights.
// api.js: getCompanies, getJobs, getJobDetail (namespace import: tolerate a missing optional export)

// ?mock=1 swaps the data layer for a local generator. Development only: it is
// honoured on localhost only, and the UI always labels it "Mock data".
const MOCK = new URLSearchParams(location.search).has('mock') &&
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const dataApi = MOCK ? await import('./mock-api.js') : api;
/* The site: 'beta' for the dist/beta/ copy (scripts/build-static.js writes <html data-channel="beta">),
   else 'stable'. Both sites share one origin, so what this browser stores is kept per site where it
   matters (saved searches, the last view; D-19). */
const CHANNEL = document.documentElement.dataset.channel === 'beta' ? 'beta' : 'stable';

/* ------------------------------------------------------------------ utils */

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only ever used with static icon markup
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (/^on/i.test(k)) { if (typeof v === 'function') el.addEventListener(k.slice(2), v); } // never inline handlers
    else if (k === 'href' || k === 'src') el.setAttribute(k, safeUrl(v));
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const ICON = {
  cluster: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="10" r="2.2"/><circle cx="12.5" cy="6.5" r="2.2"/><circle cx="13" cy="13.5" r="2.2"/></svg>',
  bookmark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5h8v13l-4-3-4 3z"/></svg>',
  info: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.3v.2"/></svg>',
  pin: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17s5-4.6 5-8.5a5 5 0 0 0-10 0C5 12.4 10 17 10 17Z"/><circle cx="10" cy="8.5" r="1.8"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>',
  chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>',
  ext: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4H4v12h12v-4M11 4h5v5M16 4l-7 7"/></svg>',
  link: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8"/></svg>',
  prev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5"/></svg>',
  next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.3 3.3"/></svg>',
  trash: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>',
  globe: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.5 2.5 2.5 11.5 0 14M10 3c-2.5 2.5-2.5 11.5 0 14"/></svg>',
  alert: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 2.5 16.5h15L10 3Z"/><path d="M10 8v4M10 14.2v.3"/></svg>',
};

const FAMILY_LABEL = {
  swe: 'Software engineering', ml: 'ML & research', data: 'Data', 'eng-manager': 'Engineering management', design: 'Design',
  product: 'Product', program: 'Program & operations', security: 'Security', hardware: 'Hardware', sales: 'Sales & solutions',
  marketing: 'Marketing', support: 'Support', legal: 'Legal & policy', people: 'People & recruiting', finance: 'Finance',
  ...FAMILY_LABELS, // product's taxonomy (features/roles.js) wins
};
// The level ladder (kept identical to roles.js SENIORITY_LADDER and chart.js; scripts/refresh/jobs.js checks).
const SENIORITY_ORDER = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+', 'Unspecified'];
// Shared decision 1 (beta fix wave): people see displayLevel(job) (features/roles.js). The stored default
// 'Mid' is NOT_STATED, "Level not stated", listed last; a stated mid level (Google "III") reads "Mid".
const SENIORITY_SHOWN = DISPLAY_LEVEL_ORDER;
const senKey = (j) => displayLevel(j);
const senLabel = (k) => levelLabel(k);
/**
 * BN-7 (fix-app-6): the levels the Seniority filter finds a posting under: its level, and the other of ours its pay names
 * on the company's own ladder (roles.js postedLevels: Microsoft M5–M6 is Manager and Director+). Cached on the job.
 */
const senKeys = (j) => {
  if (j._senKeys && j._senKeysOf === j.seniority) return j._senKeys;
  const own = senKey(j);
  const p = postedLevels(j);
  const keys = p && p.levels.length > 1 ? [own, ...p.levels.filter((l) => l !== own)] : [own];
  j._senKeysOf = j.seniority; j._senKeys = keys;
  return keys;
};
/**
 * MR-41 (fix-mr-3): a mid level each board names, read on its own ladder (server/keywords.js): Amazon's "III" is
 * Senior and Google's "II" is Entry, so no one numeral holds on every board. Microsoft and NVIDIA name the level in
 * the pay sentence ("IC3 - The typical base pay range …", "… for Level 2"). test/fix-mr-3.test.js reads each one
 * through jobSeniority.
 */
const MID_EXAMPLE = Object.freeze({ google: 'III', amazon: 'II', microsoft: 'IC3', nvidia: 'Level 2', netflix: 'L4', other: ['II', 'L4'] });
const midTip = () => `A mid level the posting names (for example ${[].concat(MID_EXAMPLE[data?.company?.slug] || MID_EXAMPLE.other).map((x) => `“${x}”`).join(' or ')})`;
const SEN_TIP = {
  'Staff+': 'Staff, principal or distinguished level',
  'Director+': 'Director, head of, vice president or chief',
  get Mid() { return midTip(); },
  [NOT_STATED]: 'The posting’s title names no level',
};
/* The Seniority filter in the link (s=, roles.js levelKey): "Level not stated" keeps its old value 'Mid', so
   earlier links and saved searches still mean what they said; a stated mid level is 'Mid-level'. */
// M-36 / UX-60 (fix-phone-text): a filter note is one line; its facts are behind its Details (viz/note.js).
// BN-7 (fix-app-6): the company's own level comes first (VT-8), so the words say so, and a posting whose pay names two
// of these levels counts under both.
const SEN_NOTE = { line: 'What the levels mean', key: 'fnote-sen', details: ['Staff+ means staff, principal and above.', 'Director+ means director, head of, vice president and above.',
  // The main site lists none of these boards (its files name no beta company's postings), so it keeps the general line.
  CHANNEL === 'beta' ? 'Microsoft, Amazon and NVIDIA postings use the company’s own level, so some “Director” titles are Staff+ or Manager.'
    : 'A company’s own level, where a posting names one, comes before the title’s words.',
  'A posting whose pay names two of these levels (Microsoft M5–M6) counts under both.',
  '“Level not stated”: the title names no level.'].filter((x) => CHANNEL === 'beta' || !/Microsoft/.test(x)) };
const SEN_OPTS = { labelOf: senLabel, tipOf: (k) => SEN_TIP[k] || null, note: SEN_NOTE };
/** I-6: what a city pick finds. */
const LOC_NOTE = { line: 'Also finds roles listed for its country', key: 'fnote-loc', details: ['A city also finds roles that list only its country or region, and remote-only roles in its country.'] };
/** Employment types in plain words (I-3): "International EOR" -> "International (employer of record)". */
const empLabel = (k) => (k === 'Unspecified' ? 'Not stated' : String(k).replace(/\s*\bEOR\b/g, ' (employer of record)').trim());
// Hosts users may be sent to (mirrors ALLOWED_HOSTS in scripts/links-policy.js): ATS job pages, map attribution.
const LINK_HOSTS = new Set(['job-boards.greenhouse.io', 'boards.greenhouse.io', 'jobs.ashbyhq.com', 'jobs.lever.co', 'www.openstreetmap.org', 'openstreetmap.org']);
const SOURCE_LABEL = { greenhouse: 'Greenhouse', ashby: 'Ashby', lever: 'Lever' };
const FALLBACK_COMPANIES = [
  { slug: 'anthropic', name: 'Anthropic', source: 'greenhouse', board: 'anthropic', color: '#d97757' },
  { slug: 'anduril', name: 'Anduril', source: 'greenhouse', board: 'andurilindustries', color: '#3b5bdb' },
  { slug: 'openai', name: 'OpenAI', source: 'ashby', board: 'openai', color: '#10a37f' },
];
const BOARDS_KEY = 'melon-seek.boards.v1';
const SOURCES = ['greenhouse', 'ashby', 'lever'];
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
// Phones render a shorter first page (the sheet shows ~4 cards); more load as the list scrolls.
const PAGE = matchMedia('(max-width: 860px)').matches ? 24 : 60;

let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old browser */ }
const countryName = (cc) => {
  if (!cc) return 'Other';
  try { return regionNames?.of(cc) || cc; } catch { return cc; }
};

const CUR_SYM = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', JPY: '¥', INR: '₹', CHF: 'CHF ', SGD: 'S$' };
function money(n, currency = 'USD') {
  if (n == null || !isFinite(n)) return '—';
  if (!currency || currency === 'USD') {
    try { return formatMoney(n); } catch { /* fall through */ }
  }
  const sym = CUR_SYM[currency] ?? `${currency} `;
  const abs = Math.abs(n);
  const body = abs >= 1e6 ? `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M` : abs >= 1e3 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`;
  return sym + body;
}
function salaryRange(s) {
  if (!s) return null;
  if (s.min === s.max || s.max == null) return rangeEnd(s.min, s.currency);
  return moneyRange(s.min, s.max, s.currency);
}
const PER_UNIT = { hour: 'hour', day: 'day', week: 'week', month: 'month' };
const PER_YEAR = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
/** Shared decision 3: pay stated per week, per month or for the whole term (or a stipend) is fixed-term pay, never a yearly salary. */
const isFixedPay = (s) => !!s && (s.originalInterval === 'week' || s.originalInterval === 'month' || s.originalInterval === 'term' || s.kind === 'stipend');
/**
 * Pay for the whole term (originalInterval 'term') is annualized over the term's exact weeks: "for the
 * four-month fellowship" is × 3 (52 ÷ 17.33), while termWeeks is rounded (17). A length that is a whole
 * number of months uses the months, so the posted $100,000 reads back as $100,000, not $98,077.
 */
function termFactor(s) {
  const w = Number(s.termWeeks);
  const m = Math.round((w * 12) / 52);
  return m > 0 && Math.abs((m * 52) / 12 - w) < 0.5 ? 12 / m : 52 / w;
}
/** P-2 (fix-data-6): the posting states this pay as a yearly figure (not annualized from an hourly, daily, weekly or monthly rate). */
const statedYearly = (s) => !!s && (!s.originalInterval || s.originalInterval === 'year') && (!s.interval || s.interval === 'year') && !s.partTime;
/** Two posted amounts, both with cents when either has them: "$22.00–28.88", "$40–55", "$3,850". */
function postedPair(lo, hi, currency) {
  const cents = (v) => Math.abs(v - Math.round(v)) >= 0.005;
  const both = cents(lo) || cents(hi);
  const fmt = (v) => (both ? `${!currency || currency === 'USD' ? '$' : CUR_SYM[currency] ?? `${currency} `}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : postedMoney(Math.round(v), currency));
  const a = fmt(lo), b = fmt(hi);
  return a === b ? a : `${a}–${b.replace(/^[^\d]+/, '')}`;
}
/**
 * P-8 and shared decision 3: pay tied to a programme length (salary.termWeeks), as it was stated.
 * { amount, per, weeks, weeksMax, fixed, toTerm } or null:
 * - fixed (per week, per month, for the whole term, or a stipend): fixed-term pay ("$3,850 a week for about
 *   17 weeks"); per is 'week' | 'month' | 'term';
 * - otherwise a rate for a programme of `weeks` ("€72,000 a year (13-week internship)"); per is 'year',
 *   'hour' or 'day'. termWeeks is the programme's length, for information only.
 * toTerm: what divides the yearly figures (salary.min, Juice) to give the whole term's amount.
 * MR-38 (fix-mr-3): `job` (the posting of `s`) also gives a term of unstated length, an internship paid by the hour,
 * day, week or month whose posting gives no length (shared.js isTermUnstated): `unstated: true`, `weeks` and
 * `toTerm` null. It is shown as posted, never as a yearly salary, and Juice is per month while it lasts.
 */
function postedTerm(s, job = null) {
  const unstated = !!s && !(s.termWeeks > 0) && !!job && isTermUnstated({ seniority: job.seniority, salary: s });
  if (!s || !(s.termWeeks > 0 || unstated)) return null;
  const unit = s.originalInterval === 'term' ? 'term' : PER_UNIT[s.originalInterval] || 'year';
  const f = unit === 'term' ? termFactor(s) : PER_YEAR[unit];
  const lo = s.min / f, hi = s.max / f;
  const amount = unit === 'term' ? postedPair(Math.round(lo), Math.round(hi), s.currency) : postedPair(lo, hi, s.currency);
  if (unstated) return { amount, per: unit, weeks: null, weeksMax: null, fixed: isFixedPay(s), toTerm: null, unstated: true };
  const weeks = Math.round(s.termWeeks), weeksMax = s.termWeeksMax > s.termWeeks ? Math.round(s.termWeeksMax) : null;
  return { amount, per: unit, weeks, weeksMax, fixed: isFixedPay(s), toTerm: unit === 'term' ? f : 52 / s.termWeeks };
}
/** "about 17 weeks" (P-8); MR-38: "a length the posting doesn’t give" when it gives none. */
const termText = (weeks) => (weeks ? `about ${plural(weeks, 'week')}` : 'a length the posting doesn’t give');
/** What a fixed-term programme is called: "internship", "fellowship", … ("programme" when the title doesn't say). */
function programNoun(job) {
  const t = `${job?.title || ''} ${job?.employmentType || ''}`;
  return /\bintern/i.test(t) ? 'internship' : /\bfellow/i.test(t) ? 'fellowship' : /\bco-?op\b/i.test(t) ? 'co-op'
    : /\bresiden/i.test(t) ? 'residency' : /\bapprentic/i.test(t) ? 'apprenticeship' : 'programme';
}
/** "13-week internship", "16–24-week internship". */
// MR-38: "internship, length not stated" for a term of unstated length.
const programText = (job, t) => (t.unstated ? `${programNoun(job)}, length not stated` : `${t.weeksMax ? `${t.weeks}–${t.weeksMax}` : t.weeks}-week ${programNoun(job)}`);
/** " a year", " an hour", " a week", " for the whole term": how the posted amount was stated. */
const perText = (per) => (per === 'term' ? ' for the whole term' : per === 'hour' ? ' an hour' : ` a ${per}`);
/**
 * Shared decision 4: part-time hourly pay (salary.partTime, from the data lane) is shown as the hourly rate
 * it was posted at. salary.min/max stay a full-time year (2,080 hours), so any yearly figure says so.
 * statedHours: the hours a week the posting gives (salary.hoursPerWeek), or null.
 */
const isPartTime = (j) => j?.salary?.partTime === true;
const isPartTimeHourly = (j) => isPartTime(j) && j.salary.originalInterval === 'hour';
function statedHours(j) {
  const v = Number(j?.salary?.hoursPerWeek ?? j?.salary?.weeklyHours);
  return v > 0 && v <= 80 ? v : null;
}
/** P-1: on-target earnings (base plus commission at target; salary.kind from server/salary.js). */
const isOte = (j) => j?.salary?.kind === 'ote';
/** P-8: pay for a fixed term (a fellowship or internship length), never a yearly salary; MR-38: or of unstated length. */
const isTerm = (j) => j?.salary?.termWeeks > 0 || isTermUnstated(j);
const OTE_LABEL = 'On-target earnings (base plus commission at target)';
/* Fix wave 5 (fix5-data, VT-17/VT-18): what the posting says its figure is. One short label on the card
   and in the pay block; the detail is in the label's tip and the pay block's caption. */
const isMinimum = (j) => j?.salary?.kind === 'minimum';
const MINIMUM_TIP = 'The posting states this as the minimum base pay; the offer can be higher';
// MR-35 (fix-qa4): an hourly rate keeps the cents it was posted with ("$18.05/hour"; money() rounded it to "$18/hour").
const hourlyText = (s, v) => `${postedPair(v / 2080, v / 2080, s.currency)}/hour`;
/**
 * UX-51 (fix-qa4): pay that includes the highest shift differential (VT-18, salary.includesShiftDifferential), as the card
 * and the drawer heading show it. A posting that states its base pay runs from that base to the posted rate
 * ("$18.05–19.70/hour"); one posted figure with no base is the top of the pay ("up to $19.70/hour"); a posted range
 * keeps both its ends. { lo, hi, upTo } yearly in salary.currency, or null (no shift pay, on-target earnings, a stated
 * minimum). server/export.js salaryRange writes the same range to the CSV.
 */
function shiftRange(s) {
  if (!s?.includesShiftDifferential || s.kind === 'ote' || s.kind === 'minimum' || !Number.isFinite(s.max)) return null;
  const b = s.statedBase;
  const base = b && String(b.currency || s.currency).toUpperCase() === String(s.currency || 'USD').toUpperCase() && Number.isFinite(b.min) && b.min < s.max ? b.min : null;
  if (base != null) return { lo: Math.min(base, s.min), hi: s.max, upTo: false };
  return { lo: s.min, hi: s.max, upTo: s.min === s.max };
}
/** UX-51: the card's muted line under such a pill. */
const SHIFT_SUB = 'with top shift pay';
/** UX-51: shift pay in the unit it is shown in: part-time hourly pay per hour, other pay per year. `per` " an hour" or "/hour". */
function shiftText(job, sr, per = '/hour') {
  const s = job.salary;
  const hourly = isPartTimeHourly(job);
  const one = (v) => (hourly ? `${postedPair(v / 2080, v / 2080, s.currency)}${per}` : rangeEnd(v, s.currency));
  if (sr.upTo) return `up to ${one(sr.hi)}`;
  return hourly ? `${postedPair(sr.lo / 2080, sr.hi / 2080, s.currency)}${per}` : moneyRange(sr.lo, sr.hi, s.currency);
}
/** VT-18: "Includes the highest shift differential. Base pay starts at $18.35/hour." */
function shiftTip(s) {
  const base = s?.statedBase ? ` Base pay starts at ${s.statedBase.originalInterval === 'hour' ? hourlyText(s.statedBase, s.statedBase.min) : money(s.statedBase.min, s.statedBase.currency)}.` : '';
  return `The posted rate includes the highest shift differential.${base}`;
}

/** "$137K"–"$338K" -> "$137–338K" when units match; one figure when both ends show the same ("$44K", never "$44K–44K"). */
function compactRange(a, b, currency = 'USD') {
  const x = money(a, currency), y = money(b, currency);
  if (x === y) return x;
  const ux = x.slice(-1), uy = y.slice(-1);
  return ux === uy && /[KM]/.test(ux) ? `${x.slice(0, -1)}–${y.replace(/^[^\d]+/, '')}` : `${x}–${y.replace(/^[^\d]+/, '')}`;
}
/**
 * SB-7 (salary audit): a range end in the millions keeps two decimals ("$600K–1.07M", "SEK 1.04M–1.06M"). With
 * one decimal, Netflix's posted $600,000–$1,066,000 read "$600K–1.1M" and Google's SEK 1,000,000–1,030,000 read
 * "SEK 1.0M", one number for a posted range (off by up to 3.9%).
 */
function rangeEnd(n, currency) {
  const a = Math.abs(n);
  if (!(a >= 999500 && a < 1e7)) return money(n, currency);
  const sym = !currency || currency === 'USD' ? '$' : CUR_SYM[currency] ?? `${currency} `;
  return `${n < 0 ? '-' : ''}${sym}${+(a / 1e6).toFixed(2)}M`;
}
/** "$59K–64K", or "$59K" when both ends round to the same figure (P-16). */
function moneyRange(a, b, currency = 'USD') {
  const x = rangeEnd(a, currency), y = rangeEnd(b, currency);
  return x === y ? x : `${x}–${y.replace(/^[^\d]+/, '')}`;
}
/** Exact posted amount with thousands separators: 3850 -> "$3,850", 35.6 -> "$35.60" (P-8). */
function postedMoney(n, currency = 'USD') {
  if (n == null || !isFinite(n)) return '—';
  const sym = !currency || currency === 'USD' ? '$' : CUR_SYM[currency] ?? `${currency} `;
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return sym + Math.abs(n).toLocaleString('en-US', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Juice amounts to the nearest `step` dollars with separators: (5432, 10) -> "$5,430" (P-18). */
function stepMoney(n, step) {
  const v = Math.round(Math.abs(n) / step) * step;
  return `${n < 0 && v ? '−' : ''}$${v.toLocaleString('en-US')}`;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * "5 minutes ago", "3 hours ago", "1 day ago". BP-16: whole units elapsed (floor), the rule the listing
 * age (ageDays, server/history.js) uses, so a drawer never says "Updated 2 d ago" over "Listed 1 day ago"
 * for the same day; and in words, not "h" and "d".
 */
function ago(ts) {
  if (!ts) return null;
  const d = (Date.now() - ts) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return `${plural(Math.floor(d / 60), 'minute')} ago`;
  if (d < 86400) return `${plural(Math.floor(d / 3600), 'hour')} ago`;
  if (d < 86400 * 45) return `${plural(Math.floor(d / 86400), 'day')} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const shortDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const cssId = (id) => (window.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&'));

/** Drop null/false children (Element.replaceChildren would render them as text). */
const nn = (...kids) => kids.filter((k) => k != null && k !== false);

function rafThrottle(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

let toastTimer = 0;
function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => (el.hidden = true), 200); }, ms);
}

/* --------------------------------------------------------------- storage */

function loadBoards() {
  try {
    const v = JSON.parse(localStorage.getItem(BOARDS_KEY) || '[]');
    return Array.isArray(v)
      ? v.filter((b) => b && SOURCES.includes(b.source) && typeof b.board === 'string' && SLUG_RE.test(b.board))
        .map((b) => ({ source: b.source, board: b.board, name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : b.board }))
      : [];
  } catch { return []; }
}
function saveBoards(list) {
  try { localStorage.setItem(BOARDS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------- API */

const isCustomKey = (key) => key.includes(':');

/** Company key -> the selector getJobs() expects. */
function jobsQuery(key) {
  if (!isCustomKey(key)) return { company: key };
  const [source, board] = key.split(':');
  const saved = boards.find((b) => b.source === source && b.board === board);
  return { source, board, name: saved?.name || S.cn || board };
}

/* ----------------------------------------------------------------- state */

const ARRAYS = ['d', 'b', 'l', 's', 'e', 'kr', 'kf', 'ks', 'jg'];
const DEFAULTS = {
  c: '', cn: '', m: 'chart', q: '', smin: null, smax: null, so: false, sc: '', smn: null, smx: null,
  d: [], b: [], l: [], s: [], e: [], r: 'any', p: 0, ho: false, rf: '', kr: [], kf: [], ks: [], jg: [],
  v: DEFAULT_VIEW, g: 'department', sort: 'best', mc: 'pay', job: null,
};
// BN-8 (fix-app-6): `sc` is the currency the pay bounds were typed in, `smn`/`smx` the amounts as typed; `smin`/`smax`
// stay approx US dollars, which the filter compares. A link holds the typed amounts with `sc` ("smin=150000&sc=PLN"); an
// older link (no `sc`) holds dollars and opens the same filter as before.
const FILTER_KEYS = ['q', 'smin', 'smax', 'so', 'sc', 'smn', 'smx', 'd', 'b', 'l', 's', 'e', 'r', 'p', 'ho', 'rf', 'kr', 'kf', 'ks', 'jg'];
const ORDER = ['c', 'cn', 'm', 'q', 'smin', 'smax', 'sc', 'so', 'd', 'b', 'l', 's', 'e', 'r', 'p', 'ho', 'rf', 'kr', 'kf', 'ks', 'jg', 'v', 'g', 'sort', 'mc', 'job'];

let S = structuredClone(DEFAULTS);
let companies = [];
let boards = loadBoards();
let data = { status: 'idle', jobs: [], company: null, mode: null, fetchedAt: null, error: null };
let area = null; // { label, ids:Set } from map onAreaSelect — not shareable, so not in hash
let hoverId = null;
let resultsLimit = PAGE;
let lastHash = '';

/** BN-8: a typed amount in approx US dollars, as the salary box reads it (rounded to $1K). */
const usdOf = (v, cur) => (v == null ? null : !cur || cur === 'USD' ? v : Math.round(toUSD(v, cur) / 1000) * 1000);
/**
 * BN-8: the pay bounds as typed, { cur, min, max }, when they are in force (each typed amount still gives the dollar bound
 * the filter uses); null for bounds in US dollars, or set another way since (the slider, a reset).
 */
function payNative(st = S) {
  if (!st.sc || st.sc === 'USD' || (st.smin == null && st.smax == null)) return null;
  const ok = (usd, nat) => (usd == null ? nat == null : nat != null && usdOf(nat, st.sc) === usd);
  return ok(st.smin, st.smn) && ok(st.smax, st.smx) ? { cur: st.sc, min: st.smn, max: st.smx } : null;
}

/** BN-8: a pay bound ('min' | 'max') as the person typed it ("PLN 150K"), else in US dollars; null when unset. */
function boundText(which, st = S) {
  const nat = payNative(st);
  const v = nat ? nat[which] : st[which === 'min' ? 'smin' : 'smax'];
  return v == null ? null : money(v, nat ? nat.cur : 'USD');
}

function parseHash(hash = location.hash) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''));
  const st = structuredClone(DEFAULTS);
  for (const k of ORDER) {
    if (!p.has(k)) continue;
    if (ARRAYS.includes(k)) st[k] = p.getAll(k).filter(Boolean).map((x) => (k === 's' ? levelFromKey(x) : x));
    else if (k === 'smin' || k === 'smax' || k === 'p') { const n = Number(p.get(k)); st[k] = Number.isFinite(n) && n > 0 ? n : DEFAULTS[k]; }
    else if (k === 'so' || k === 'ho') st[k] = p.get(k) === '1';
    else st[k] = p.get(k);
  }
  if (!['chart', 'map', 'insights'].includes(st.m)) st.m = 'chart';
  if (!['any', 'remote', 'onsite'].includes(st.r)) st.r = 'any';
  if (!['pay', 'juice'].includes(st.mc)) st.mc = DEFAULTS.mc; // D-14: the map's Pay|Juice colouring
  if (!SORTS.includes(st.sort)) st.sort = DEFAULTS.sort; // D-12: an old or hand-edited sort= shows as Highest pay
  if (!VIEWS.includes(st.v)) st.v = DEFAULT_VIEW;
  if (!p.has('g') || !GROUPS.includes(st.g)) st.g = groupDefault(st.v);
  if (st.p === 0) st.p = 0;
  // BN-8: bounds typed in another currency come with it ("smin=150000&sc=PLN"); the filter compares them in dollars.
  const sc = String(st.sc || '').toUpperCase();
  if (sc && sc !== 'USD' && /^[A-Z]{3}$/.test(sc) && hasFx(sc) && (st.smin != null || st.smax != null)) {
    st.sc = sc; st.smn = st.smin; st.smx = st.smax; st.smin = usdOf(st.smn, sc); st.smax = usdOf(st.smx, sc);
  } else { st.sc = ''; st.smn = null; st.smx = null; }
  return st;
}

/** Clusters need a grouping (department); ranges read best ungrouped. */
const groupDefault = (view) => (view === 'ranges' ? 'none' : 'department');
/* google-grouping: "brand" (shown as Company) groups by the company or subsidiary the board names on its
   postings; the option shows only on a board that names more than one (groupBy() below). */
const GROUPS = ['department', 'brand', 'location', 'seniority', 'none'];
/* P-4: 'best' (Best match) is the default. With a search it lists title and team matches first, each
   group by highest pay; without one it is Highest pay. Any sort the person picks is strict. */
const SORTS = ['best', 'salary-desc', 'salary-asc', 'newest', 'title', 'juice'];
/* D-11: "Newest" needs listing dates; with none loaded (every snapshot board today) it is hidden and
   a newest link sorts like the default, as the "Listed" filter hides itself. */
let agesFor = null, agesKnown = false;
function hasListingDates() {
  if (agesFor !== data.jobs) { agesFor = data.jobs; agesKnown = data.jobs.some((j) => j._age != null); }
  return agesKnown;
}
const hasQuery = (st = S) => !!String(st.q || '').trim();
function effectiveSort() {
  const s = S.sort === 'newest' && data.status === 'ready' && !hasListingDates() ? DEFAULTS.sort : S.sort;
  return s === 'best' && !hasQuery() ? 'salary-desc' : s;
}

function serialize(st = S) {
  const p = new URLSearchParams();
  const nat = payNative(st); // BN-8: the bounds as typed, with their currency
  for (const k of ORDER) {
    const v = st[k];
    if (nat && (k === 'smin' || k === 'smax')) { const x = k === 'smin' ? nat.min : nat.max; if (x != null) p.set(k, String(x)); continue; }
    if (k === 'sc') { if (nat) p.set('sc', nat.cur); continue; }
    if (ARRAYS.includes(k)) { for (const x of v) p.append(k, k === 's' ? levelKey(x) : x); continue; }
    if (k === 'g') { if (v !== groupDefault(st.v)) p.set('g', v); continue; }
    if (v == null || v === '' || v === false || v === DEFAULTS[k]) continue;
    if (k === 'cn' && !isCustomKey(st.c)) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  return p.toString();
}

const hashUrl = (str) => location.pathname + location.search + (str ? `#${str}` : '');
function commit({ replace = false } = {}) {
  const str = serialize();
  if (str !== lastHash) {
    lastHash = str;
    // M-3: while a phone overlay owns the top history entry, filter changes rewrite that entry.
    if (overlayHist.open) history.replaceState(history.state, '', hashUrl(str));
    else if (replace) history.replaceState(null, '', hashUrl(str));
    else history.pushState(null, '', hashUrl(str));
  }
}

/* M-3: phone overlays (the filter sheet, the company menu, "More", the badge and board sheets) own
   one history entry while open, so hardware Back / iOS swipe-back closes the overlay instead of
   undoing a filter. Changes made inside the overlay rewrite that entry (commit above); once it is
   gone (Back, or the overlay closed from the UI, which pops it), the changes land as one entry. */
const overlayHist = { open: null, base: null, popping: false, reopen: null };
const wantsOverlayHist = (id) => (id === 'filters' ? isOverlayFilters() : isMobile());
function overlayHistPush(id) {
  if (!wantsOverlayHist(id)) return;
  if (overlayHist.popping) { overlayHist.reopen = id; return; } // a close is still popping its entry
  if (overlayHist.open) { overlayHist.open = id; return; }      // one overlay replaced another: keep the entry
  overlayHist.open = id;
  overlayHist.base = lastHash;
  history.pushState({ msOverlay: id }, '', location.href);
}
/** The overlay was closed from the UI (✕, Done, a tap outside): drop its history entry. */
function overlayHistRelease() {
  if (!overlayHist.open) return;
  if (overlayHist.popping) { overlayHist.reopen = null; return; }
  overlayHist.popping = true;
  if (history.state?.msOverlay) history.back(); else overlayHistLanded();
}
/** The overlay's entry is gone: record what changed inside it as one ordinary entry. */
function overlayHistLanded() {
  const { base, reopen } = overlayHist;
  overlayHist.open = overlayHist.base = overlayHist.reopen = null;
  overlayHist.popping = false;
  const str = serialize();
  lastHash = str;
  if (str !== base) history.pushState(null, '', hashUrl(str));
  else if (serialize(parseHash()) !== str) history.replaceState(null, '', hashUrl(str));
  if (reopen) overlayHistPush(reopen);
}
function onPopState() {
  if (!overlayHist.open) { onHashChange(); return; }
  if (!overlayHist.popping) { // hardware Back / swipe-back with an overlay open: close it, keep the filters
    overlayHist.popping = true;
    if (popover.id) closePopover();
    if (document.body.classList.contains('filters-open')) setFiltersOpen(false);
    overlayHist.reopen = null;
  }
  overlayHistLanded();
}

/** Mutate state, push to history and re-render. */
function set(patch, { replace = false, keepPage = false } = {}) {
  const prevCompany = S.c;
  Object.assign(S, patch);
  if (!keepPage) resultsLimit = PAGE;
  commit({ replace });
  if (S.c !== prevCompany) { loadJobs(); return; }
  scheduleRender();
}

function toggleIn(key, value) {
  const arr = S[key];
  set({ [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] });
}

function clearFilters() {
  const patch = {};
  for (const k of FILTER_KEYS) patch[k] = structuredClone(DEFAULTS[k]);
  clearArea();
  const aside = heldLabels();
  dropHeld(); // BP-10: nothing set aside comes back after Clear all
  $('#search').value = '';
  set(patch);
  heldToast(aside); // BN-5
}

function activeFilterCount(st = S) {
  return (st.q ? 1 : 0) + (st.smin != null || st.smax != null ? 1 : 0) + (st.so ? 1 : 0) + (st.ho ? 1 : 0) + (st.rf ? 1 : 0) +
    st.d.length + st.b.length + st.l.length + st.s.length + st.e.length + (st.r !== 'any' ? 1 : 0) + (st.p ? 1 : 0) +
    st.kr.length + st.kf.length + st.ks.length + st.jg.length;
}

/* ------------------------------------------------------------------ data */

const locKey = (l) => (l.remote ? l.name || 'Remote' : l.city || l.name || 'Unknown');
/* D-16: a bare city key is kept unless it is ambiguous: two places on the board share the name
   (Cambridge, MA / Cambridge, England), or the name alone reads as something else ("Washington" is
   Washington, DC, not the state). Those get ", <region or country>". Run once per loaded board. */
const AMBIGUOUS_CITIES = new Set(['Washington']);
function disambiguateLocations(jobs) {
  const places = new Map(); // bare key -> Set of "region|country"
  for (const j of jobs) for (const l of j.locations) {
    if (l.remote || !l.city) continue;
    const k = locKey(l);
    if (!places.has(k)) places.set(k, new Set());
    places.get(k).add(`${l.region || ''}|${l.country || ''}`);
  }
  const clash = new Set([...places].filter(([k, v]) => v.size > 1 || AMBIGUOUS_CITIES.has(k)).map(([k]) => k));
  if (!clash.size) return;
  for (const j of jobs) {
    let changed = false;
    const keys = j.locations.map((l, i) => {
      const k = j._locKeys[i];
      if (l.remote || !l.city || !clash.has(k)) return k;
      const tag = l.region || l.country;
      if (!tag) return k;
      changed = true;
      return `${k}, ${tag}`;
    });
    if (changed) { j._locAlt = j._locKeys; j._locKeys = keys; } // _locAlt: old bare-city links (l=Washington) still match
  }
}
/* fix-data-3: a link's filter value that no posting here uses is matched to the board's current one for the same
   place or department, so an old link finds what it found before the labels changed:
   - Location: "Columbus, OH" where the board labels Columbus, Ohio "Columbus" (no other Columbus to tell apart);
     NVIDIA's state "New York, US", now "New York State" (D-42); "Saint George, SC", now "St. George, SC" (D-41).
     A value is compared with each place's label, canonical name and posted words, its city with the state or country tag ("Columbus, OH"),
     ignoring case, accents, periods and the "Saint"/"St" spelling, and is replaced only when exactly one label fits.
   - Department: the board's own name ("Engineer, ASIC", "Project/Program/Product Management--Technical") becomes the
     name shown ("ASIC Engineering", UX-32), by the function the data uses (lib/families.js departmentDisplayName,
     loaded only when a link has such a value).
   A value that fits nothing, or several labels, stays as it is. Resolves to true when the filters changed. */
const foldPlace = (s) => foldText(s).replace(/\./g, '').replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();
let familiesLib = null;
async function resolveOldFilterKeys(jobs = data.jobs) {
  if (data.status !== 'ready' || (!S.l.length && !S.d.length)) return false;
  let changed = false;
  if (S.l.length) {
    const used = new Set();
    for (const j of jobs) { for (const k of j._locKeys) used.add(k); if (j._locAlt) for (const k of j._locAlt) used.add(k); }
    const want = new Map(S.l.filter((x) => !used.has(x)).map((x) => [foldPlace(x), new Set()]));
    if (want.size) {
      const add = (alias, key) => { const s = alias ? want.get(foldPlace(alias)) : null; if (s) s.add(key); };
      for (const j of jobs) j.locations.forEach((l, i) => {
        const key = j._locKeys[i];
        if (!l || !key) return;
        add(l.name, key); add(l.rawName, key);
        if (l.remote) return;
        // A city's bare key and its disambiguated form ("Columbus, OH", "Victoria, AU": disambiguateLocations' tag).
        if (l.city) { add(l.city, key); if (l.region || l.country) add(`${l.city}, ${l.region || l.country}`, key); }
        else if (l.country === 'US' && l.region) { // D-42: the state's label before ("New York, US", "District of Columbia, US")
          if (/ State$/.test(l.name || '')) add(`${l.name.slice(0, -6)}, US`, key);
          if (l.region === 'DC') add('District of Columbia, US', key);
        }
      });
      const next = [];
      for (const x of S.l) {
        const fit = used.has(x) ? null : want.get(foldPlace(x));
        const y = fit && fit.size === 1 ? [...fit][0] : x;
        if (y !== x) changed = true;
        if (!next.includes(y)) next.push(y);
      }
      if (changed) S.l = next;
    }
  }
  const shown = S.d.length ? new Set(jobs.map(deptKey)) : null;
  if (shown && S.d.some((x) => !shown.has(x))) {
    const seq = loadSeq;
    const lib = await (familiesLib ||= import('./lib/families.js').catch(() => null));
    if (seq !== loadSeq || !lib?.departmentDisplayName) return changed && (commit({ replace: true }), true);
    const next = [];
    for (const x of S.d) {
      const d = shown.has(x) ? x : lib.departmentDisplayName(x);
      const y = shown.has(d) ? d : x;
      if (y !== x) changed = true;
      if (!next.includes(y)) next.push(y);
    }
    if (changed) S.d = next;
  }
  if (changed) commit({ replace: true });
  return changed;
}
const deptKey = (j) => keyOf(j, 'department'); // same keys the chart colors by
/* google-grouping: the company or subsidiary a board names on its postings (Google's YouTube, DeepMind,
   Waymo, …: Job.brand, CONTRACT.md "google-grouping"), the key of the Company grouping and filter. */
const brandKey = (j) => keyOf(j, 'brand');
let brandsFor = null, brandsSeen = new Map();
/** The board's brands -> postings. */
function boardBrands(jobs = data.jobs) {
  if (brandsFor !== jobs) { brandsFor = jobs; brandsSeen = new Map(); for (const j of jobs) if (j.brand) brandsSeen.set(j.brand, (brandsSeen.get(j.brand) || 0) + 1); }
  return brandsSeen;
}
/** The Company grouping and filter exist only on a board that names more than one company. */
const multiBrand = () => boardBrands().size > 1;
/** The grouping in force: Company only where the board has it (an old link elsewhere groups by the default). */
const groupBy = () => (S.g === 'brand' && !multiBrand() ? groupDefault(S.v) : S.g);
/** Departments the site read from job titles because the board publishes none (Google: departmentBasis 'title'). */
const deptFromTitles = () => data.status === 'ready' && data.jobs.some((j) => j.departmentBasis === 'title');
/** One short line for that (fix-density: secondary text is one line). */
const deptTitleNote = () => `Grouped by job title: ${data.company?.name || 'this board'} doesn’t publish departments`;
/** M-36: the filter sheet's one line (it took 2 lines at 360 px); the reason is in its Details. */
const deptTitleLine = () => ({ line: 'Grouped by job title', details: [`${data.company?.name || 'This board'} doesn’t publish departments, so its roles are grouped by what their titles say.`] });
/** Juice filter key for a juice entry: its grade ("Rind" files under Dry), or null without one. */
const gradeOf = (e) => (e ? (e.grade === 'Rind' ? 'Dry' : e.grade) : null);
/** Juice filter key: the best location's grade, or null without juice. */
const gradeKey = (j) => gradeOf(j.juice?.best);
/**
 * P-7: the Juice entry to show for a job. With a Location filter it is the best of the places the
 * person picked (null when the posting has no Juice there); otherwise the posting's best place.
 */
function shownJuice(j, F = viewSpec) {
  const jb = j?.juice;
  if (!jb?.best) return null;
  if (!F || !F.l.size) return jb.best;
  if (j._jsFor === F) return j._js;
  let best = null;
  for (const e of jb.byLocation || []) {
    const i = j.locations.findIndex((l) => l && l.name === e.locationName);
    if (i < 0 || !(F.l.has(j._locKeys[i]) || (j._locAlt && F.l.has(j._locAlt[i])))) continue;
    if (j._payLocs && !j._payLocs.includes(j.locations[i])) continue; // shared decision 1: never from another country's pay
    if (!best || e.score > best.score || (e.score === best.score && e.net > best.net)) best = e;
  }
  if (best && best.city === jb.best.city && best.locationName === jb.best.locationName) best = jb.best; // keeps its inputs
  j._jsFor = F; j._js = best;
  return best;
}
let viewSpec = null; // the filter spec of the last render (cards, sort and the drawer read Juice through it)
const empKey = (j) => j.employmentType || 'Unspecified';
/**
 * The Juice a posting may show (null for none). Shared decision 1: never computed for a place from another
 * country's pay (juice.js's retired `currencyMismatch` fallback applied a Polish range to Munich "as
 * posted"). Shared decision 4: never from a full-time year of part-time hourly pay, unless the posting
 * states its hours. juiceMissing() says why in the drawer.
 */
function usableJuice(j) {
  const jb = j?.juice;
  if (!jb?.best || jb.best.currencyMismatch) return null;
  if (isPartTime(j) && !statedHours(j)) return null;
  return jb;
}
/**
 * fix-pay-at-place: the pay a posting posted for the places the Location filter picked (payAt in features/shared.js
 * over the places locMatches takes in: a place's own row of salary.ranges, or the posting's one range in that place's
 * country; the chart and the map price a place the same way). Cached per view; null with no filter, no pay, or none
 * posted there (another country's pay, or a place the posting lists in no row: the lead decision of 2026-10-16).
 */
const placePayCache = new WeakMap();
function placePay(j, F = viewSpec) {
  if (!j?._usd || !F?.l.size) return null;
  let m = placePayCache.get(F);
  if (!m) { m = new Map(); placePayCache.set(F, m); }
  let r = m.get(j);
  if (r === undefined) { r = payAt(j, (l) => locMatches(j, F, [l])); m.set(j, r); }
  return r;
}
/** Shared decision 1: true when the posting has pay posted for a place of the Location filter (always, without one). */
const payHere = (j, F = viewSpec) => !!j?._usd && (!F?.l.size || !!placePay(j, F)?.usd);
/** The approx-USD pay that counts in the view: the places' own under a Location filter (placePay), else the posting's. */
const usdHere = (j, F = viewSpec) => (!F?.l.size ? j._usd : placePay(j, F)?.usd || null);

function prepare(jobs, { source = null } = {}) {
  for (const j of jobs) {
    j.locations = Array.isArray(j.locations) ? j.locations : [];
    // D-4: Ashby's isRemote flag sits on on-site-only roles (OpenAI 502 of 833, Cohere 120 of 132).
    // Saved snapshots no longer carry workplaceType, so for Ashby boards a role is remote when one of
    // its locations is (server/sources/ashby.js now adds a "Remote" location for workplaceType Remote).
    if (source === 'ashby') j.remote = j.locations.some((l) => l && l.remote);
    j.keywords = { responsibilities: [], fit: [], skills: [], ...(j.keywords || {}) };
    j.sections = { responsibilities: [], fit: [], ...(j.sections || {}) };
    if (j.salary && j.salary.min == null && j.salary.max == null) j.salary = null;
    if (j.salary) {
      j.salary.min ??= j.salary.max;
      j.salary.max ??= j.salary.min;
      j.salary.mid ??= (j.salary.min + j.salary.max) / 2;
    }
    // Approximate USD for filtering / stats / percentile (display keeps the native currency).
    j._usd = j.salary ? { min: toUSD(j.salary.min, j.salary.currency), max: toUSD(j.salary.max, j.salary.currency), mid: toUSD(j.salary.mid, j.salary.currency) } : null;
    if (j._usd && !(isFinite(j._usd.min) && isFinite(j._usd.max))) j._usd = null;
    j._mid = j._usd ? j._usd.mid : null;
    // Shared decision 1: the places the pay is for (payLocations, features/shared.js); under a Location
    // filter, pay counts only where it applies (filter, sort, stats, Juice), and the card says so.
    j._payLocs = payLocations(j);
    j._ts = j.updatedAt ? Date.parse(j.updatedAt) || null : null;
    // Listing age (F4). v2 jobs carry ageDays (null = unknown: show no age). Pre-v2 data
    // falls back to updatedAt so the age slot and "Listed" filter still work.
    const tagm = typeof j.title === 'string' ? j.title.match(/^\s*\[([^\]]{1,16})\]\s*/) : null;
    if (tagm && !j._rawTitle) { j._rawTitle = j.title; j._titleTag = tagm[1]; j.title = j.title.slice(tagm[0].length) || j.title; }
    // Role abbreviations written out ("RE / RS" -> "Research Engineer / Research Scientist"); the
    // posted title stays searchable and is shown in the drawer when it differs.
    if (j._postedTitle == null && typeof j.title === 'string') {
      j._postedTitle = j._rawTitle || j.title;
      j.title = readableTitle(j.title) || j.title;
    }
    j._age = 'ageDays' in j ? (Number.isFinite(j.ageDays) ? j.ageDays : null)
      : j._ts ? Math.max(0, Math.floor((Date.now() - j._ts) / 864e5)) : null;
    // _family (role family) is filled in after the first paint (fillFamilies), or on first use (famOf).
    // The slot is made here, where it always was, so every job keeps the same shape and key order.
    if (j._family == null) j._family = undefined;
    j.juice = usableJuice(j);
    j._grade = gradeKey(j);
    j._locKeys = j.locations.map(locKey);
    j._hay = [j.title, j._postedTitle !== j.title ? j._postedTitle : null, j.department, j.team, j.employmentType, senKey(j) === NOT_STATED ? null : j.seniority,
      ...j.locations.map((l) => l.name), ...j.keywords.responsibilities, ...j.keywords.fit, ...j.keywords.skills]
      .filter(Boolean).join(' \u0001 ').toLowerCase();
  }
  return jobs;
}

/* Role families (the role-family filter, "Same role elsewhere", Insights) are not needed for the
   first cards and chart, and roleFamily is the biggest part of prepare() on a big board (about
   1.2 s at 4x CPU for Apple's 4,879 roles; docs/process/perf-mobile-beta.md). So a job's family is
   computed on first use (famOf), and fillFamilies fills in the rest in idle time after the first
   paint. Same value as before: roleFamily of the prepared title, with the same ctx comps.js uses,
   so rf filters match its rows (comps.js and compstimate.js compute it the same way when unset). */
const famOf = (j) => (j._family !== undefined ? j._family : (j._family = roleFamily(j.title, j)));
function fillFamilies(jobs) {
  let i = 0;
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50));
  const step = (deadline) => {
    if (data.jobs !== jobs) return; // another board took over (its own fill runs)
    do {
      for (const end = Math.min(jobs.length, i + 25); i < end; i++) famOf(jobs[i]); // about 25 ms at 4x CPU
    } while (i < jobs.length && deadline && !deadline.didTimeout && deadline.timeRemaining() > 20);
    if (i < jobs.length) idle(step);
  };
  idle(step);
}

/* P-4: search words match whole words (with plural and -ing/-er/-ship endings), so "intern" finds
   Intern, Interns and Internship but not International or Internal. A word that the board never uses
   on its own (a half-typed "softw") still matches word starts. Words with symbols ("co-op", "c++")
   match where they start. */
const WORD_ENDINGS = ['s', 'es', 'ed', 'er', 'ers', 'ing', 'ings', 'ship', 'ships', 'ment', 'ments'];
const ENDINGS_RE = `(?:${WORD_ENDINGS.join('|')})?`;
const ALWAYS_WORDS = new Set(['intern', 'entry', 'junior', 'senior', 'staff', 'lead', 'head', 'principal', 'director', 'manager']);
const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const vocabs = new WeakMap(); // jobs array -> Set of the words its roles use
function vocabOf(jobs) {
  let v = vocabs.get(jobs);
  if (!v) {
    v = new Set();
    for (const j of jobs) for (const w of String(j._hay || '').split(WORD_SPLIT)) if (w) v.add(w);
    vocabs.set(jobs, v);
  }
  return v;
}
/**
 * One RegExp per search word (lowercase), for the board `jobs`. BP-12 (shared decision 5): a word also
 * matches its other spelling, British or American ("centre" finds "center", "defense" finds "defence").
 * The other spelling matches only as a whole word with its endings, never as a word start, so "labour"
 * never finds "laboratory".
 */
function queryMatchers(q, jobs = data.jobs) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const vocab = vocabOf(jobs);
  return words.map((t) => {
    const start = '(?:^|[^\\p{L}\\p{N}])';
    if (WORD_SPLIT.test(t)) return new RegExp(start + reEsc(t), 'u');
    const whole = ALWAYS_WORDS.has(t) || vocab.has(t) || WORD_ENDINGS.some((e) => vocab.has(t + e));
    const end = `${ENDINGS_RE}(?![\\p{L}\\p{N}])`;
    const alts = spellingVariants(t).filter((v) => v !== t).map((v) => reEsc(v) + end);
    const own = reEsc(t) + (whole ? end : '');
    return new RegExp(start + (alts.length ? `(?:${[own, ...alts].join('|')})` : own), 'u');
  });
}

/* ---- pure: search words and place names (test/fix3-app.test.js runs this block on its own) ---- */
/** Lower case without accents: "Zürich" -> "zurich", "Straße" -> "strasse", "Łódź" -> "lodz". */
function foldText(s) {
  return String(s ?? '').toLowerCase().replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .normalize('NFD').replace(/\p{M}+/gu, '');
}
/* BP-12: British and American spellings (shared decision 5). Word pairs, then patterns with word lists. */
const SPELLING_PAIRS = new Map();
for (const [uk, us] of [
  ['programme', 'program'], ['defence', 'defense'], ['offence', 'offense'], ['licence', 'license'], ['pretence', 'pretense'], ['practise', 'practice'],
  ['catalogue', 'catalog'], ['dialogue', 'dialog'], ['analogue', 'analog'], ['grey', 'gray'], ['aluminium', 'aluminum'], ['jewellery', 'jewelry'],
  ['mould', 'mold'], ['plough', 'plow'], ['ageing', 'aging'], ['judgement', 'judgment'], ['acknowledgement', 'acknowledgment'], ['enrol', 'enroll'],
  ['enrolment', 'enrollment'], ['fulfil', 'fulfill'], ['fulfilment', 'fulfillment'], ['instalment', 'installment'], ['skilful', 'skillful'],
  ['wilful', 'willful'], ['paediatric', 'pediatric'], ['paediatrics', 'pediatrics'], ['orthopaedic', 'orthopedic'], ['anaesthesia', 'anesthesia'],
  ['anaesthesiology', 'anesthesiology'], ['haematology', 'hematology'], ['gynaecology', 'gynecology'], ['oestrogen', 'estrogen'], ['oesophageal', 'esophageal'],
  ['leukaemia', 'leukemia'], ['encyclopaedia', 'encyclopedia'], ['manoeuvre', 'maneuver'], ['aeroplane', 'airplane'], ['speciality', 'specialty'], ['maths', 'math'],
]) { SPELLING_PAIRS.set(uk, us); SPELLING_PAIRS.set(us, uk); }
const RE_STEMS = ['cent', 'theat', 'met', 'lit', 'fib', 'calib', 'sab', 'spect', 'lust', 'meag', 'somb', 'kilomet', 'centimet', 'millimet', 'micromet', 'nanomet'];
const OUR_STEMS = ['behavi', 'col', 'fav', 'hon', 'lab', 'neighb', 'flav', 'harb', 'hum', 'rum', 'sav', 'savi', 'vap', 'endeav', 'val', 'arm', 'od', 'parl', 'rig', 'splend', 'tum', 'vig', 'clam'];
const OUR_ENDS = ['', 's', 'ed', 'ing', 'al', 'ally', 'ite', 'ites', 'able', 'ful', 'er', 'ers', 'ism', 'ist', 'ists', 'less', 'y', 'hood', 'hoods'];
const LL_STEMS = ['model', 'travel', 'label', 'cancel', 'fuel', 'counsel', 'signal', 'channel', 'level', 'tunnel', 'marshal', 'dial', 'jewel', 'equal',
  'trial', 'total', 'barrel', 'pedal', 'rival', 'panel', 'funnel', 'initial', 'libel', 'marvel', 'parcel', 'spiral', 'stencil', 'towel', 'unravel', 'enamel', 'shovel'];
const LL_ENDS = ['ed', 'ing', 'er', 'ers', 'or', 'ors', 'ous'];
const IZE_ENDS = 'e|es|ed|er|ers|ing|ings|ation|ations|ational|able';
const RE_IZE = new RegExp(`^(\\p{L}{3,})i([sz])(${IZE_ENDS})$`, 'u');
const RE_YZE = /^(\p{L}{2,})y([sz])(e|es|ed|er|ers|ing)$/u;
/** Every spelling of one lower-case word: itself, then its British or American forms. */
function spellingVariants(word) {
  const w = String(word || '').toLowerCase();
  const out = new Set([w]);
  if (w.length < 3 || !/^\p{L}+$/u.test(w)) return [...out];
  for (const [end, add] of [['', ''], ['s', 's'], ['es', 'es']]) {
    if (!w.endsWith(end) || w.length - end.length < 3) continue;
    const alt = SPELLING_PAIRS.get(end ? w.slice(0, -end.length) : w);
    if (alt) out.add(alt + add);
  }
  let m;
  if ((m = /^(\p{L}+?)(re|res|er|ers)$/u.exec(w)) && RE_STEMS.includes(m[1])) out.add(m[1] + { re: 'er', res: 'ers', er: 're', ers: 'res' }[m[2]]);
  for (const stem of OUR_STEMS) {
    for (const [a, b] of [['our', 'or'], ['or', 'our']]) {
      if (w.startsWith(stem + a) && OUR_ENDS.includes(w.slice(stem.length + a.length))) out.add(stem + b + w.slice(stem.length + a.length));
    }
  }
  for (const stem of LL_STEMS) {
    for (const end of LL_ENDS) {
      if (w === `${stem}l${end}`) out.add(stem + end);
      else if (w === stem + end) out.add(`${stem}l${end}`);
    }
  }
  if (w.length >= 6 && (m = RE_IZE.exec(w))) out.add(`${m[1]}i${m[2] === 's' ? 'z' : 's'}${m[3]}`);
  if (w.length >= 6 && (m = RE_YZE.exec(w))) out.add(`${m[1]}y${m[2] === 's' ? 'z' : 's'}${m[3]}`);
  return [...out];
}
/* BP-6: a Location search also finds a country's places, and a city by its local name. Each row is one
   place's names (folded), English first; each country lists the names people type that Intl doesn't give. */
const PLACE_NAMES = [
  ['munich', 'munchen', 'muenchen'], ['cologne', 'koln', 'koeln'], ['vienna', 'wien'], ['zurich', 'zuerich'], ['geneva', 'geneve', 'genf'],
  ['nuremberg', 'nurnberg', 'nuernberg'], ['hanover', 'hannover'], ['frankfurt', 'frankfurt am main'], ['dusseldorf', 'duesseldorf'],
  ['prague', 'praha'], ['warsaw', 'warszawa'], ['krakow', 'cracow'], ['wroclaw', 'breslau'], ['gdansk', 'danzig'], ['lisbon', 'lisboa'],
  ['rome', 'roma'], ['milan', 'milano'], ['naples', 'napoli'], ['turin', 'torino'], ['florence', 'firenze'], ['venice', 'venezia'],
  ['brussels', 'bruxelles', 'brussel'], ['antwerp', 'antwerpen', 'anvers'], ['ghent', 'gent'], ['the hague', 'den haag'], ['copenhagen', 'kobenhavn'],
  ['gothenburg', 'goteborg'], ['moscow', 'moskva'], ['bucharest', 'bucuresti'], ['belgrade', 'beograd'], ['athens', 'athina'], ['seville', 'sevilla'],
  ['bangalore', 'bengaluru'], ['mumbai', 'bombay'], ['gurgaon', 'gurugram'], ['chennai', 'madras'], ['kolkata', 'calcutta'], ['kyiv', 'kiev'],
  ['mexico city', 'ciudad de mexico', 'cdmx'], ['tel aviv', 'tel aviv-yafo', 'tel-aviv', 'jaffa'], ['beijing', 'peking'], ['guangzhou', 'canton'],
  ['ho chi minh city', 'saigon'], ['new york', 'new york city', 'nyc'], ['san francisco', 'sf'], ['washington', 'washington dc'],
];
const COUNTRY_NAMES = {
  US: ['us', 'usa', 'u.s.', 'u.s.a.', 'america', 'united states of america'], GB: ['uk', 'britain', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  NL: ['holland', 'nederland', 'the netherlands'], DE: ['deutschland'], AT: ['osterreich', 'oesterreich'], CH: ['schweiz', 'suisse', 'svizzera', 'swiss'],
  ES: ['espana'], IT: ['italia'], BE: ['belgique', 'belgie'], PL: ['polska'], SE: ['sverige'], NO: ['norge'], DK: ['danmark'], FI: ['suomi'], IE: ['eire'],
  CZ: ['cesko', 'czech republic'], HU: ['magyarorszag'], BR: ['brasil'], KR: ['korea'], AE: ['uae', 'emirates'], TR: ['turkiye', 'turkey'],
  JP: ['nihon', 'nippon'], IN: ['bharat'], CN: ['zhongguo'], GR: ['hellas', 'ellada'], PT: ['portugal'], MX: ['mexico'],
};
/**
 * A Location search: `(label, country) -> boolean` for query `q`. It matches a place's name (accents and
 * local names folded: "Zürich", "München"), and every place in a country the query names ("Ireland",
 * "Deutschland", "UK"). `nameOf(code)` gives a country's English name.
 */
function placeMatcher(q, nameOf = (c) => c) {
  const f = foldText(q).trim();
  const words = new Set([f]);
  const named = (list) => list.some((n) => n === f || (f.length >= 3 && n.startsWith(f)));
  for (const names of PLACE_NAMES) if (named(names)) for (const n of names) words.add(n);
  const codes = new Set();
  if (f.length === 2) codes.add(f.toUpperCase());
  for (const [code, names] of Object.entries(COUNTRY_NAMES)) if (named(names)) codes.add(code);
  const countryNames = new Map();
  return (label, country) => {
    const t = foldText(label);
    for (const w of words) if (t.includes(w)) return true;
    if (!country || country.length !== 2) return false;
    if (codes.has(country)) return true;
    if (f.length < 3) return false;
    if (!countryNames.has(country)) countryNames.set(country, foldText(nameOf(country)));
    const cn = countryNames.get(country);
    return cn.startsWith(f) || cn.includes(` ${f}`);
  };
}
/* ---- end pure ---- */

/* I-6: a city pick also catches postings that list only its country or region ("United Kingdom",
   "Ontario, Canada") or remote work in that country ("Remote (Canada)"): the role can be done there.
   placeIndex maps each city key on the board to its country and region. */
const placeIndexes = new WeakMap();
function placeIndex(jobs = data.jobs) {
  let ix = placeIndexes.get(jobs);
  if (!ix) {
    ix = new Map();
    for (const j of jobs) {
      j.locations.forEach((l, i) => {
        if (!l || l.remote || !l.city || !l.country) return;
        for (const k of [j._locKeys?.[i], j._locAlt?.[i]]) if (k && !ix.has(k)) ix.set(k, { country: String(l.country).toUpperCase(), region: l.region ? String(l.region).toUpperCase() : '' });
      });
    }
    placeIndexes.set(jobs, ix);
  }
  return ix;
}
/** The countries and regions a set of picked location keys covers (city picks only). */
function placeCover(keys, jobs = data.jobs) {
  const ix = placeIndex(jobs);
  const countries = new Set(), regions = new Set();
  for (const k of keys) {
    const p = ix.get(k);
    if (!p) continue;
    countries.add(p.country);
    if (p.region) regions.add(`${p.country}|${p.region}`);
  }
  return { countries, regions };
}
/** A location with no city ("United Kingdom", "Ontario, Canada", "Remote (Canada)") inside the cover. */
function coveredBy(l, cover) {
  // Remote work in a country counts only for a remote-only posting: "San Francisco | Remote (US)" is
  // an SF role first, and counting it for every US city would read as "Austin 55" for 3 Austin roles.
  if (!l || l.city || !l.country || !cover?.countries.size) return false;
  const c = String(l.country).toUpperCase();
  if (!cover.countries.has(c)) return false;
  if (l.remote) return true;
  return !l.region || cover.regions.has(`${c}|${String(l.region).toUpperCase()}`);
}
/** A job location that may stand in for its cities (I-6): no city, and remote only on a remote-only posting. */
const coverLoc = (j, l) => !!l && !l.city && !!l.country && (!l.remote || !j.locations.some((x) => x && !x.remote && x.city));
/** True if one of `locs` (default: all of the job's locations) matches the Location filter. */
function locMatches(j, F, locs = null) {
  if (!F.l.size) return true;
  const list = locs || j.locations;
  for (const l of list) {
    const i = j.locations.indexOf(l);
    if (i < 0) continue;
    if (F.l.has(j._locKeys[i]) || (j._locAlt && F.l.has(j._locAlt[i]))) return true;
    if (coverLoc(j, l) && coveredBy(l, F.lCover)) return true;
  }
  return false;
}

function filterSpec(st = S, jobs = data.jobs) {
  const l = new Set(st.l);
  return {
    q: queryMatchers(st.q, jobs),
    smin: st.smin, smax: st.smax, so: st.so,
    d: new Set(st.d), b: new Set(st.b), l, lCover: l.size ? placeCover(l, jobs) : null, s: new Set(st.s), e: new Set(st.e),
    r: st.r, p: st.p, ho: st.ho, rf: st.rf,
    kw: { responsibilities: st.kr, fit: st.kf, skills: st.ks },
    jg: new Set(st.jg),
  };
}

const salActive = (F) => !!(F.so || F.smin != null || F.smax != null);
/**
 * Why the pay filter hides a posting (null: it passes): 'none' (no pay), 'elsewhere' (shared decision 1: under a Location
 * filter, pay posted only for another country or other places), 'under' (its posted pay is all under the floor), 'over'
 * (all over the ceiling). BN-6 (fix-app-6): a posted minimum ("from €31,100") states no top, so a floor never hides it;
 * pay stated "up to" one figure (top shift pay with no base) states no bottom, so a ceiling never hides it.
 */
function salWhy(j, F) {
  if (!salActive(F)) return null;
  if (!j._usd) return 'none';
  if (!payHere(j, F)) return 'elsewhere';
  const u = usdHere(j, F);
  // A minimum is the posting's statement (salary.kind); a place's own row says so itself where rows carry a kind.
  const rows = F.l.size ? placePay(j, F)?.ranges : null;
  const minimum = rows?.length && rows.some((r) => r && r.kind) ? rows.every((r) => r && r.kind === 'minimum') : isMinimum(j);
  if (F.smin != null && u.max < F.smin && !minimum) return 'under';
  if (F.smax != null && u.min > F.smax && !shiftRange(j.salary)?.upTo) return 'over';
  return null;
}
/** The Juice-grade filter fails (P-7: under a Location filter, the posting's best Juice among the places picked). */
const jgFails = (j, F) => { if (!F.jg.size) return false; const g = gradeOf(shownJuice(j, F)); return !(g && F.jg.has(g)); };
/** The filters judged at the places the Location filter picks (payHere, shownJuice), so BN-1 judges them per place. */
const AT_PLACE = new Set(['l', 'sal', 'jg']);

/** Returns the list of facet names this job fails (empty = passes all). */
function failures(j, F, now) {
  const out = [];
  if (F.q.length && !F.q.every((re) => re.test(j._hay))) out.push('q');
  // Shared decision 1: under a Location filter, pay posted for another country doesn't pass a pay filter.
  if (salWhy(j, F)) out.push('sal');
  if (F.d.size && !F.d.has(deptKey(j))) out.push('d');
  if (F.b.size && !F.b.has(brandKey(j))) out.push('b');
  if (F.l.size && !locMatches(j, F)) out.push('l');
  if (F.s.size && !senKeys(j).some((k) => F.s.has(k))) out.push('s'); // BN-7: either level a posting is hired at
  if (F.e.size && !F.e.has(empKey(j))) out.push('e');
  if (F.r === 'remote' && !j.remote) out.push('r');
  if (F.r === 'onsite' && j.remote) out.push('r'); // BP-17: On-site is a role that isn't open to remote work
  if ((F.p && !(j._age != null && j._age <= F.p)) || (F.ho && j._age != null && j._age >= 180)) out.push('p');
  if (F.rf && famOf(j) !== F.rf) out.push('rf');
  if (jgFails(j, F)) out.push('jg');
  for (const cat of ['responsibilities', 'fit', 'skills']) {
    const sel = F.kw[cat];
    if (sel.length && !sel.every((k) => j.keywords[cat].includes(k))) { out.push('kw'); break; }
  }
  return out;
}

/**
 * One pass over all jobs: the filtered set plus faceted counts, where each
 * facet's counts ignore that facet's own selection (Zillow-style).
 * Keyword clouds are AND, so their counts use the fully filtered set.
 */
function derive() {
  const jobs = data.jobs;
  const F = filterSpec();
  const now = Date.now();
  const filtered = [];
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  viewSpec = F;
  const fc = { d: new Map(), b: new Map(), l: new Map(), lGroup: new Map(), s: new Map(), e: new Map(), r: { any: 0, remote: 0, onsite: 0 },
    p: { 0: 0, 7: 0, 30: 0, 90: 0 }, jg: new Map(), kw: null, salMids: [],
    noPayHidden: 0, elsewhereHidden: 0, only: {} };
  // perf-mobile-beta-2: the keyword counts are for the filter panel's keyword lists only, so they are
  // counted when first read (the same jobs, in the same order: the same Maps). Counting them for every
  // posting at each render was about 0.2 s of Amazon's first render at 4x CPU.
  const kwJobs = [];
  let kw = null;
  Object.defineProperty(fc, 'kw', {
    enumerable: true,
    get() {
      if (!kw) {
        kw = { responsibilities: new Map(), fit: new Map(), skills: new Map() };
        for (const j of kwJobs) for (const cat of ['responsibilities', 'fit', 'skills']) for (const k of j.keywords[cat]) bump(kw[cat], k);
      }
      return kw;
    },
  });
  const covers = coverIndex(jobs);
  const covered = new Map(); // city key -> postings that list only its country or region
  // BN-1 (fix-app-6): the pay filter and the Juice grade are judged at the places the Location filter picks, so for the
  // Location counts they are judged at each counted place: a place's count is what picking it alone shows, whatever
  // else is picked (a facet's counts ignore its own selection). Without them every place counts the same posting.
  const placeJudge = salActive(F) || F.jg.size ? judgeAtPlace(F, jobs) : null;
  fc.salWhy = { none: 0, elsewhere: 0, under: 0, over: 0 };
  for (const j of jobs) {
    const fails = failures(j, F, now);
    const byPlace = !!placeJudge && fails.every((f) => AT_PLACE.has(f));
    if (fails.length > 1 && !byPlace) continue;
    const only = fails.length === 1 ? fails[0] : undefined;
    if (fails.length < 2) {
      if (!only) filtered.push(j); // the chart/map draw the whole filtered set; a cluster/map area narrows the list in render()
      else fc.only[only] = (fc.only[only] || 0) + 1; // P-16: what an empty result is blocked by
      if (only === 'sal') {
        const why = salWhy(j, F);
        fc.salWhy[why]++; // BN-6: every role the pay filter hides, and why
        if (why === 'none') fc.noPayHidden++; // P-5: postings with no pay that the pay filter hides
        else if (why === 'elsewhere') fc.elsewhereHidden++; // shared decision 1: pay posted for another country
      }
    }
    // D-2: with a cluster or map area active, the facet counts describe the roles in that area (the list).
    if (area && !area.ids.has(j.id)) continue;
    if (byPlace) countPlaces(j, placeJudge, covers, covered, fc, bump);
    if (fails.length > 1) continue;
    const counts = (facet) => !only || only === facet;
    if (!only) kwJobs.push(j);
    if (counts('d')) bump(fc.d, deptKey(j));
    if (counts('b')) bump(fc.b, brandKey(j));
    if (counts('l') && !placeJudge) {
      const seen = new Set();
      for (let i = 0; i < j.locations.length; i++) {
        const k = j._locKeys[i];
        if (seen.has(k)) continue;
        seen.add(k);
        bump(fc.l, k);
        const l = j.locations[i];
        if (!fc.lGroup.has(k)) fc.lGroup.set(k, l.remote ? '~remote' : l.country || 'ZZ');
      }
      // I-6: a posting that lists only a country or region counts for its cities too (as picking one
      // finds it); added below to the cities that other roles list, so it adds no new places.
      for (const l of j.locations) {
        if (!coverLoc(j, l)) continue;
        for (const k of covers(l)) if (!seen.has(k)) { seen.add(k); bump(covered, k); }
      }
    }
    if (counts('s')) for (const k of senKeys(j)) bump(fc.s, k); // BN-7: under both of its levels
    if (counts('e')) bump(fc.e, empKey(j));
    if (counts('r')) {
      fc.r.any++;
      if (j.remote) fc.r.remote++; else fc.r.onsite++; // BP-17: Any = Remote + On-site
    }
    if (counts('p')) {
      fc.p[0]++;
      for (const d of [7, 30, 90]) if (j._age != null && j._age <= d) fc.p[d]++;
      if (j._age != null && j._age >= 180) fc.p.old = (fc.p.old || 0) + 1;
    }
    if (counts('sal') && payHere(j, F)) fc.salMids.push(usdHere(j, F).mid);
    if (counts('jg')) { const g = gradeOf(shownJuice(j, F)); if (g) bump(fc.jg, g); }
  }
  // I-6: postings that list only a country or region add to the places other roles list (and to a place picked), so a
  // place's count is what picking it finds. BN-1 (fix-app-6): `lWide` keeps that part apart, so the list shows a town's
  // own postings with the country- or state-wide ones beside them ("Palmetto 3 +294"), not one number of 297.
  fc.lWide = new Map();
  for (const [k, n] of covered) if (fc.l.has(k) || F.l.has(k)) { fc.l.set(k, (fc.l.get(k) || 0) + n); fc.lWide.set(k, n); }
  return { filtered, fc };
}

/**
 * BN-1: `(j, key) -> true` when the posting passes the pay filter and the Juice grade with the Location filter set to
 * that one place (the same salWhy and jgFails, with a spec whose `l` is { key }), so its count is what picking the place
 * alone shows. Specs are made once per place; a posting's answer is shared between places that take in the same of its
 * locations (a country-only posting covers many cities the same way).
 */
function judgeAtPlace(F, jobs) {
  const specs = new Map();
  const specOf = (k) => {
    let s = specs.get(k);
    if (!s) { const l = new Set([k]); s = { ...F, l, lCover: placeCover(l, jobs) }; specs.set(k, s); }
    return s;
  };
  let memoJob = null, memo = null;
  return (j, k) => {
    const Fk = specOf(k);
    if (memoJob !== j) { memoJob = j; memo = new Map(); }
    // Which of its locations the place takes in: its own key (or an old link's), or a country or region that covers it.
    let sig = '';
    for (let i = 0; i < j.locations.length; i++) {
      const l = j.locations[i];
      if (j._locKeys[i] === k || j._locAlt?.[i] === k) sig += `o${i}`;
      else if (coverLoc(j, l) && coveredBy(l, Fk.lCover)) sig += `c${i}`;
    }
    let ok = memo.get(sig);
    if (ok === undefined) { ok = !salWhy(j, Fk) && !jgFails(j, Fk); memo.set(sig, ok); }
    return ok;
  };
}
/** BN-1: one posting's Location counts, each place judged by `judge` (judgeAtPlace); the same keys as the plain count. */
function countPlaces(j, judge, covers, covered, fc, bump) {
  const seen = new Set();
  for (let i = 0; i < j.locations.length; i++) {
    const k = j._locKeys[i];
    if (seen.has(k)) continue;
    seen.add(k);
    const l = j.locations[i];
    if (!fc.lGroup.has(k)) fc.lGroup.set(k, l.remote ? '~remote' : l.country || 'ZZ');
    if (judge(j, k)) bump(fc.l, k);
  }
  for (const l of j.locations) {
    if (!coverLoc(j, l)) continue;
    for (const k of covers(l)) if (!seen.has(k)) { seen.add(k); if (judge(j, k)) bump(covered, k); }
  }
}

/** I-6: (country-or-region location) -> the board's city keys it covers, cached per board. */
const coverIndexes = new WeakMap();
function coverIndex(jobs) {
  let fn = coverIndexes.get(jobs);
  if (!fn) {
    const memo = new Map();
    fn = (l) => {
      const id = `${l.remote ? 'r' : ''}|${l.country}|${l.remote ? '' : l.region || ''}`;
      let keys = memo.get(id);
      if (!keys) {
        keys = [];
        for (const [k, p] of placeIndex(jobs)) if (coveredBy(l, { countries: new Set([p.country]), regions: new Set(p.region ? [`${p.country}|${p.region}`] : []) })) keys.push(k);
        memo.set(id, keys);
      }
      return keys;
    };
    coverIndexes.set(jobs, fn);
  }
  return fn;
}

function salaryDomain() {
  let lo = Infinity, hi = -Infinity;
  const maxes = [];
  for (const j of data.jobs) if (j._usd) { lo = Math.min(lo, j._usd.min); hi = Math.max(hi, j._usd.max); maxes.push(j._usd.max); }
  if (!isFinite(lo)) return null;
  // One mis-parsed or exotic posting ($4.6M) must not squash the slider: cap the domain near
  // the 99th percentile. The max thumb at the cap means "no upper bound", so outliers still match.
  if (maxes.length >= 20) {
    maxes.sort((a, b) => a - b);
    const p99 = quantile(maxes, 0.99);
    if (hi > p99 * 1.3) hi = p99 * 1.15;
  }
  lo = Math.floor(lo / 10000) * 10000;
  hi = Math.ceil(hi / 10000) * 10000;
  if (hi <= lo) hi = lo + 10000;
  return { lo, hi };
}

function sortJobs(list) {
  const out = list.slice();
  const nullsLast = (a, b, f) => (a == null || b == null ? (a == null) - (b == null) : f());
  const eff = effectiveSort();
  // Shared decision 1: under a Location filter, pay posted for another country sorts like no pay, and the rest by
  // the pay posted for the places picked (fix-pay-at-place, the range the card shows).
  const pv = viewSpec?.l.size ? new Map(out.map((j) => [j, payHere(j) ? usdHere(j) : null])) : null;
  const P = pv ? (j) => pv.get(j) : (j) => j._usd;
  switch (eff) {
    case 'salary-asc': out.sort((a, b) => nullsLast(P(a), P(b), () => P(a).mid - P(b).mid || a.title.localeCompare(b.title))); break;
    case 'newest': out.sort((a, b) => nullsLast(a._age, b._age, () => a._age - b._age || a.title.localeCompare(b.title))); break;
    case 'title': out.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'juice': {
      // P-7: with a Location filter, a role's Juice is its best among the places picked.
      const jv = new Map(out.map((j) => [j, shownJuice(j)]));
      out.sort((a, b) => { const x = jv.get(a), y = jv.get(b); return nullsLast(x, y, () => y.score - x.score || y.net - x.net || a.title.localeCompare(b.title)); });
      break;
    }
    default: out.sort((a, b) => nullsLast(P(a), P(b), () => P(b).mid - P(a).mid || P(b).max - P(a).max || a.title.localeCompare(b.title)));
  }
  // P-4: only "Best match" (the default while searching) lists title and team matches first;
  // any sort the person picks is strict.
  if (eff === 'best') {
    const m = queryMatchers(S.q);
    const strong = [], weak = [];
    for (const j of out) (titleMatch(j, m) ? strong : weak).push(j);
    out.splice(0, out.length, ...strong, ...weak);
  }
  // P-12: a saved search opened with new roles lists them first while the sort is the default.
  if (S.sort === 'best' && savedView?.slug === S.c && savedView.ids.size) {
    const fresh = [], rest = [];
    for (const j of out) (savedView.ids.has(j.id) ? fresh : rest).push(j);
    if (fresh.length) return fresh.concat(rest);
  }
  return out;
}
/** True when every search word is in the title or team (`m`: queryMatchers). */
function titleMatch(j, m) {
  const t = `${j.title} ${j.team || ''}`.toLowerCase();
  return m.every((re) => re.test(t));
}

/**
 * Stats line figures. P-6: with a Location filter, a posting's pay counts only when it applies to a
 * picked place (payLocations: a US range listed in Seattle and Sydney says nothing about Sydney).
 * P-1, BP-13: on-target earnings are never pooled with base pay (they count only when nothing else is
 * left), so the median is the base pay median, the same set the chart's median uses (kind !== 'ote').
 * V-39 (fix-pay-at-place): under a Location filter each posting counts at the pay posted for the places picked
 * (usdHere: Microsoft's Mountain View roles at their SF Bay Area range), as the chart caption and the map pin do.
 */
function stats(list, F = viewSpec) {
  const base = [], ote = [], nb = [];
  for (const j of list) {
    if (!payHere(j, F)) continue;
    // MR-28 (fix-viz-5): the chart's rule (features/shared.js notBasePay): a stated minimum, shift-inclusive or
    // part-time figure is shown and counted as pay, and left out of the median unless nothing else is left.
    // MR-39: the currency of the pay that counts (under a Location filter, the places' own range).
    const cur = (F?.l.size ? placePay(j, F)?.currency : j.salary.currency) || 'USD';
    (notBasePay(j) ? nb : isOte(j) ? ote : base).push({ usd: usdHere(j, F).mid, cur, hourly: isPartTimeHourly(j) });
  }
  // MR-39 (fix-mr-3): with pay in two or more currencies in view, the median is the main currency's (the chart rows'
  // rule, V-21: "median $222K in the US"), not every country's pay converted and pooled. BN-2, BN-4 (fix-app-6): it is
  // given in that currency (shared.js headlineMedian: CA$101K over Canadian pay), and per hour when it is all part-time
  // hourly pay; the chart's caption, the map's pins and Insights' tiles use the same helper.
  const use = base.length ? base : ote.length ? ote : nb;
  const hm = headlineMedian(use);
  const depts = new Map();
  for (const j of list) depts.set(deptKey(j), (depts.get(deptKey(j)) || 0) + 1);
  const top = [...depts].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    n: list.length, withSalary: base.length + ote.length + nb.length,
    median: hm.median, p25: hm.p25, p75: hm.p75, top,
    oteOnly: !base.length && ote.length > 0, oteLeftOut: base.length ? ote.length : 0,
    notBaseOnly: !base.length && !ote.length && nb.length > 0, notBaseLeftOut: base.length || ote.length ? nb.length : 0,
    basis: hm.basis, basisN: hm.n, basisLeft: hm.left, cur: hm.cur, local: hm.local, perHour: hm.perHour, fullTime: hm.fullTime, hm,
  };
}

/* --------------------------------------------------------------- loading */

const PREPARE_CHUNK = 300;
const yieldTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
let loadSeq = 0;
let abortCtl = null;

async function loadJobs({ refresh = false } = {}) {
  const seq = ++loadSeq;
  abortCtl?.abort();
  abortCtl = new AbortController();
  clearArea();
  hoverId = null;
  resetColors();
  mapFitPending = true;
  if (savedView && savedView.slug !== S.c) savedView = null; // P-12: a saved search's New marks stay with its company
  data = { status: 'loading', jobs: [], company: companyInfo(S.c), mode: null, fetchedAt: null, error: null };
  preview = null;
  render();
  if (previewable()) dataApi.getPreview?.(jobsQuery(S.c), { signal: abortCtl.signal }).then((p) => showPreview(p, seq)).catch(() => {});
  // Static mode shows the bundled list as soon as it lands, marked `pending` while the live board
  // loads (api.js staticJobs step 1); onUpdate then settles it once (settleLive). It waits until
  // the first list is on screen, so a quick live answer or failure is never dropped mid-prepare.
  let onScreen;
  const shown = new Promise((resolve) => { onScreen = resolve; });
  const onUpdate = (next) => { shown.then(() => { if (seq === loadSeq) settleLive(next, seq); }); };
  try {
    const res = await dataApi.getJobs(jobsQuery(S.c), { refresh, signal: abortCtl.signal, onUpdate });
    if (seq !== loadSeq) return;
    // DQ-7 / D-20 (docs/CONTRACT.md): nothing to show for this company (its saved list didn't load,
    // or a beta board has no snapshot yet). An error with Retry, never an empty board or demo data.
    if (res?.unavailable) throw new Error(res.error || 'This board isn’t available right now.');
    if (!(await applyJobs(res, seq))) return;
    if (refresh) toast(data.mode === 'live' ? 'Fetched fresh from the live board' : bundleOnly(data.company) ? 'This board is only available as a saved snapshot' : 'Live board unreachable — showing fallback data');
  } catch (err) {
    if (err?.name === 'AbortError' || seq !== loadSeq) return;
    // D-19 / M-22: a company this site doesn't list (a beta board on the main site, a paused one) is
    // not an outage: no "Offline" badge and no Retry, just a plain message (status 'unknown').
    const unknown = !isCustomKey(S.c) && err?.status === 404 && /unknown company/i.test(err?.message || '');
    data = { status: unknown ? 'unknown' : 'error', jobs: [], company: companyInfo(S.c), mode: null, fetchedAt: null, error: err?.message || String(err) };
    if (unknown) findOnBeta(S.c, seq);
  }
  settleCarry();
  settleKeep();
  await resolveOldFilterKeys(); // fix-data-3: an old link's place or department label finds the board's current one
  if (seq !== loadSeq) return;
  if (data.status === 'ready') await renderInTwo(seq); else render();
  if (seq !== loadSeq) return;
  if (data.status === 'ready') fillFamilies(data.jobs);
  settleSaved();
  // M-43: a job page opened from a preview card (its own fields, the rest loading) becomes the whole page here.
  if (S.job) openDrawer(S.job, { fromHash: true });
  preview = null;
  onScreen();
}

/* perf-mobile-beta-2: a big board's first page while its list loads. The static build writes the postings
   the default view lists first (api/preview/<slug>.json; api.js#getPreview), so on a phone the first cards
   show in about the time the app takes to start, not after the whole list (Amazon's 22,179 postings: a
   1.14 MB download, then Juice, prepare and the first render). They are the same postings, prepared and
   sorted by the same code, with the chart's colours (the build counts them on the whole board) and the
   same "New" tags (the last visit, read but not yet recorded); only the default view gets one (Highest pay,
   no filter, no search, no saved search). The list says it is still loading; a tapped card opens its job page
   at once with the card's own fields and the rest loading (M-43), and the whole page follows when the list is
   in. Then the whole list replaces it, keeping the place when its first cards are the same, and the focus on
   the same posting's card (A-11). */
let preview = null; // { slug, jobs, total, visit } while shown
const previewing = () => data.status === 'loading' && preview?.slug === S.c && previewable();
/** A posting of the preview on screen (M-43), or null. */
const previewJob = (id) => (previewing() ? preview.jobs.find((j) => j.id === id) || null : null);
/** A result card, from the list or the preview; its posting's id. */
const CARD_SEL = '.card[data-id], .card[data-preview-id]';
const cardId = (c) => c?.dataset.id ?? c?.dataset.previewId;
function previewable() {
  if (!api.isStatic?.() || !S.c || isCustomKey(S.c) || area || effectiveSort() !== 'salary-desc' || colorBy() !== 'department') return false;
  if (savedView && savedView.slug === S.c) return false;
  return FILTER_KEYS.every((k) => (Array.isArray(DEFAULTS[k]) ? !S[k].length : S[k] === DEFAULTS[k]));
}
async function showPreview(p, seq) {
  if (!p || !p.jobs?.length || seq !== loadSeq || data.status !== 'loading') return;
  const jobs = p.jobs;
  prepare(jobs, { source: companyInfo(S.c)?.source || null });
  if (needsRejuice(jobs, juiceHousehold) && !(await rejuice(jobs, juiceHousehold, () => seq !== loadSeq))) return;
  if (seq !== loadSeq || data.status !== 'loading' || !previewable()) return;
  viewSpec = filterSpec(S, jobs);
  setColorKeys(new Map(p.colorCounts));
  preview = { slug: S.c, jobs: sortJobs(jobs), total: p.total, visit: visit.slug === S.c ? visit : readVisit(S.c) };
  renderResults();
}

/** The live fetch behind a `pending` list ended: swap the live board in, or keep the list quietly. */
function settleLive(next, seq) {
  if (data.status !== 'ready' || !data.pending) return;
  const settle = (error) => {
    if (seq !== loadSeq || !data.pending) return;
    data = { ...data, pending: false, error };
    renderTopbar();
    syncPopover();
  };
  if (next?.mode === 'live') {
    // A failed swap must not leave the badge saying "checking live…".
    applyJobs(next, seq, { upgrade: true }).catch((err) => console.error('live update failed', err)).then(() => settle(data.error));
    return;
  }
  // The live board failed: same list; the badge stops checking and the popover gives the reason.
  settle(next?.error ?? null);
}

/** Prepare a getJobs result and make it the current data. false if a newer load took over. */
async function applyJobs(res, seq, { upgrade = false } = {}) {
  // Mobile perf (docs/process/perf-mobile.md): prepare() is per job, so big boards are
  // prepared in chunks that yield, instead of one 0.4 s task on a phone.
  const jobs = Array.isArray(res?.jobs) ? res.jobs : [];
  const source = res?.company?.source || companyInfo(S.c)?.source || null;
  for (let i = 0; i < jobs.length; i += PREPARE_CHUNK) {
    prepare(jobs.slice(i, i + PREPARE_CHUNK), { source });
    await yieldTask();
    if (seq !== loadSeq) return false;
  }
  if (upgrade && (data.status !== 'ready' || data.mode === 'live')) return false;
  // api.js attaches juice for one person; another household is re-attached here (juice.js).
  if (needsRejuice(jobs, juiceHousehold) && !(await rejuice(jobs, juiceHousehold, () => seq !== loadSeq))) {
    if (seq !== loadSeq) return false;
  }
  disambiguateLocations(jobs);
  await yieldTask(); // perf-mobile-beta-2: a separate task from the first render (0.1 s on Amazon's whole board)
  if (seq !== loadSeq || (upgrade && (data.status !== 'ready' || data.mode === 'live'))) return false;
  dataSeq++;
  rememberCompany(S.c);
  data = {
    status: 'ready',
    jobs,
    company: { ...companyInfo(S.c), ...(res?.company || {}) },
    mode: res?.mode || 'live',
    fetchedAt: res?.fetchedAt ? Date.parse(res.fetchedAt) : null,
    error: res?.error || null,
    meta: res?.meta || null,
    pending: !!res?.pending, // static mode: the live board is still loading (api.js getJobs onUpdate)
  };
  markVisit(S.c, data.jobs);
  if (upgrade) {
    // The live board replaces the list on screen: same filters, view, scroll, selection, hover and
    // open drawer (re-resolved by id on render). A focused card keeps focus, and screen readers
    // hear one polite note instead of the results count's live region (docs/process/badge-ux.md).
    data.arrivedAt = performance.now();
    const focusId = document.activeElement?.closest?.('#resultsList .card[data-id]')?.dataset.id;
    const list = $('#resultsList');
    const top = list?.scrollTop ?? 0; // rebuilding the list under a focused card resets its scroll
    settleCarry();
    win.keep = true; // M-19: the same roles, refreshed: the list keeps its place
    quietly($('#resultsTitle'), render);
    fillFamilies(data.jobs);
    if (focusId && !document.activeElement?.closest?.('#resultsList .card')) $(`#resultsList .card[data-id="${cssId(focusId)}"]`)?.focus({ preventScroll: true });
    if (list && Math.abs(list.scrollTop - top) > 1) list.scrollTop = top;
    announce(`Updated from the live board: ${plural(data.jobs.length, 'role')}.`);
  }
  return true;
}

/** Run fn with el's polite live region muted; restored once the accessibility tree has caught up. */
function quietly(el, fn) {
  const was = el?.getAttribute('aria-live');
  if (was) el.setAttribute('aria-live', 'off');
  try { fn(); } finally { if (was) setTimeout(() => el.setAttribute('aria-live', was), 1000); }
}
/** The polite status region for data-source changes (created on the first render, before any use). */
function liveRegion() {
  return $('#dataLive') || document.body.appendChild(h('div', { id: 'dataLive', class: 'sr-only', role: 'status', 'aria-live': 'polite' }));
}
let announceTimer = 0;
function announce(msg) {
  const el = liveRegion();
  el.textContent = msg;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = ''; }, 8000);
}

function companyInfo(key) {
  const builtin = companies.find((c) => c.slug === key);
  if (builtin) return builtin;
  if (isCustomKey(key)) {
    const [source, board] = key.split(':');
    const saved = boards.find((b) => b.source === source && b.board === board);
    let name = saved?.name || S.cn || board;
    if (!saved && companies.some((c) => c.name.toLowerCase() === String(name).toLowerCase().trim())) name = `${name} (custom)`;
    return { slug: key, name, source, board, color: null, custom: true };
  }
  // A slug this site doesn't list (D-19): "amazon" reads "Amazon".
  return { slug: key, name: key ? key.charAt(0).toUpperCase() + key.slice(1) : key, source: null, board: key, color: null };
}
const companyColor = (c) => c?.color || colorFor(c?.slug || c?.board || 'x');

/* ============================================================== RENDER == */

const scheduleRender = rafThrottle(render);
let derived = { filtered: [], fc: null };
let visible = []; // sorted list after map-area filter

let renders = 0;
/** derive, colour keys and sort: the first half of render(). */
function viewOf() {
  const d = data.status === 'ready' ? derive() : { filtered: [], fc: null };
  if (!previewing()) computeColorKeys(d.filtered); // a preview keeps the board's colours (showPreview)
  const listed = area ? d.filtered.filter((j) => area.ids.has(j.id)) : d.filtered;
  return { derived: d, visible: sortJobs(listed) };
}
/**
 * perf-mobile-beta-2: after a load, the filter (derive), the sort and the page are three tasks, not one
 * (Amazon's 22,179 at 4x CPU: 0.8 s in one). The same steps as render(); if anything rendered in
 * between (a tap), that render stands.
 */
async function renderInTwo(seq) {
  const n = renders;
  const stale = () => seq !== loadSeq || renders !== n;
  await yieldTask(); // after applyJobs' last step (markVisit and the rest of the load)
  if (stale()) return;
  const d = derive();
  computeColorKeys(d.filtered);
  await yieldTask();
  if (stale()) return;
  const v = { derived: d, visible: sortJobs(area ? d.filtered.filter((j) => area.ids.has(j.id)) : d.filtered) };
  await yieldTask();
  if (!stale()) render(v);
}
function render(view = null) {
  renders++;
  ({ derived, visible } = view || viewOf());

  document.documentElement.dataset.mode = S.m;
  renderTopbar();
  renderQuickbar();
  if (filtersVisible()) renderFilterPanel(); else filtersDirty = true; // PERF-2: hidden panel syncs when opened
  renderKpis();
  renderResults();
  syncPopover();
  if (drawerJobId && data.status === 'ready') renderDrawerNav();
  rememberView();
  scheduleViz(); // PERF-2: paint cards and stats first, the chart/map when idle
  // Off the startup path but ready before a tap: Insights' module and Leaflet load when the page is idle.
  if (data.status === 'ready' && !idlePrefetched) {
    idlePrefetched = true;
    whenIdle(loadInsights);
    whenIdle(() => { if (typeof L === 'undefined' && !leafletLoading) loadLeaflet().catch(() => { /* retried on Map open */ }); });
  }
}

let filtersDirty = false;
function filtersVisible() {
  const el = $('#filters');
  return !!el && getComputedStyle(el).visibility !== 'hidden' && (!isOverlayFilters() || document.body.classList.contains('filters-open'));
}
let vizIdle = 0;
function scheduleViz() {
  // Non-ready states (loading skeleton, errors) and mode switches paint immediately.
  if (data.status !== 'ready' || vizMode !== S.m) { cancelViz(); vizMode = S.m; renderViz(); return; }
  cancelViz();
  vizIdle = (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(() => { vizIdle = 0; renderViz(); }, { timeout: 150 });
}
function cancelViz() { if (vizIdle) (window.cancelIdleCallback || clearTimeout)(vizIdle); vizIdle = 0; }
let vizMode = null;

/* ---------------------------------------------------------------- topbar */

function renderTopbar() {
  const all = allCompanies();

  // Company switcher: one dropdown button for the active company + up to 3 recent ones as pills.
  const active = all.find((c) => c.slug === S.c) || companyInfo(S.c);
  const pageTitle = $('#pageTitle');
  if (pageTitle) pageTitle.textContent = `${active?.name || 'Company'} jobs by salary — melon·seek${CHANNEL === 'beta' ? ' beta' : ''}`;
  const menuBtn = $('#companyMenuBtn');
  const sig = all.map((c) => c.slug + c.name).join('|') + '§' + S.c + '§' + data.status + data.jobs.length + '§' + recents.join(',');
  if (menuBtn.dataset.sig !== sig) {
    menuBtn.dataset.sig = sig;
    menuBtn.replaceChildren(...nn(h('span', { class: 'dot', style: `--dot:${companyColor(active)}` }), h('span', { class: 'company-name' }, active?.name || 'Choose company'),
      data.status === 'ready' ? h('span', { class: 'company-count' }, data.jobs.length.toLocaleString()) : null, h('span', { class: 'chip-caret', html: ICON.chevron }))); // M-23: "6,105"
    menuBtn.setAttribute('aria-label', `Company: ${active?.name || 'none'}. Choose another company or open a saved search`);
    const recent = recents.filter((slug) => slug !== S.c).map((slug) => all.find((c) => c.slug === slug)).filter(Boolean).slice(0, 3);
    $('#companyPills').replaceChildren(...recent.map((c) => h('button', {
      type: 'button', class: 'company-pill', title: `Switch to ${c.name}, keeping your search and filters`,
      onclick: () => switchCompany(c),
    }, h('span', { class: 'dot', style: `--dot:${companyColor(c)}` }), h('span', { class: 'company-name' }, c.name))));
  }

  for (const b of document.querySelectorAll('.seg [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === S.m));
  const search = $('#search');
  if (document.activeElement !== search && search.value !== S.q) search.value = S.q;

  // Data-mode badge (a button: details open in a popover). Its name is the spoken label and the tip
  // its description; the narrow-width labels (data-short/-tiny/-micro, styles.css) are visual only.
  // Rebuilt only when it changes, so the dot's animation is never restarted by an unrelated render.
  const badge = $('#dataBadge');
  const banner = $('#demoBanner');
  const info = badgeInfo();
  // One soft pulse when the live board has just replaced the list (none with reduced motion).
  const arrived = info?.cls === 'is-live' && data.arrivedAt && performance.now() - data.arrivedAt < 1500;
  badge.className = `data-badge ${info ? info.cls : ''}${arrived ? ' is-arrived' : ''}`;
  badge.hidden = !info;
  liveRegion();
  if (info) {
    const short = info.short || info.label;
    const tiny = info.tiny || short;
    const micro = info.micro || tiny;
    const sig = [info.label, short, tiny, micro, info.sr, info.tip].join('␟');
    if (badge.dataset.sig !== sig) {
      badge.dataset.sig = sig;
      badge.replaceChildren(h('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'badge-label', 'aria-hidden': 'true', 'data-short': short, 'data-tiny': tiny, 'data-micro': micro }, info.label),
        h('span', { class: 'sr-only', id: 'dataBadgeTip' }, info.tip));
      badge.setAttribute('aria-label', `Data source: ${info.sr || info.label}`);
      badge.setAttribute('aria-describedby', 'dataBadgeTip');
      badge.title = info.tip;
    }
  }
  banner.hidden = true;
  if (data.status === 'ready' && (MOCK || data.mode === 'demo')) {
    // One thin muted line; the full explanation and the raw error sit in a disclosure.
    banner.hidden = false;
    const wasOpen = banner.querySelector('details')?.open;
    const short = MOCK ? 'Mock data — not real postings'
      : data.pending ? `Demo data for now — checking the ${data.company?.name || ''} live board…`
        : `Demo data — the ${data.company?.name || ''} board couldn’t be reached`;
    const long = MOCK
      ? 'These roles come from the local development generator (?mock=1, localhost only), not from any job board.'
      : 'So you can still explore the interface, these roles are generated samples — not real postings, salaries or locations.';
    banner.replaceChildren(h('details', { open: !!wasOpen },
      h('summary', null, h('span', { class: 'demo-ico', html: ICON.info }), h('span', { class: 'banner-short' }, short), h('span', { class: 'banner-more' }, 'Details')),
      h('div', { class: 'banner-body' }, h('p', null, long),
        data.error ? h('code', null, data.error) : null,
        MOCK ? null : h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => loadJobs({ refresh: true }) }, 'Try the live board again'))));
  }
  const refresh = $('#refreshBtn');
  // D-26: a snapshot-only board (static `live: false`, the big-tech boards) has no live board to refresh
  // from, as the badge popover already says, and a company this site doesn't list has nothing to refresh.
  refresh.hidden = bundleOnly(data.company) || data.status === 'unknown';
  refresh.disabled = data.status === 'loading';
  refresh.classList.toggle('is-spinning', data.status === 'loading');
}

/**
 * The data badge: { label, short?, tiny?, micro? (narrower widths), cls, sr? (spoken), tip }.
 * The dot pulses only while work is in progress: loading, or `pending` (a bundled list on screen
 * while the live board loads); then the label says "checking live…" too, so the pulse never
 * carries the meaning alone. Live, Snapshot, Cached and Demo are steady.
 */
function badgeInfo() {
  if (data.status === 'loading') return { label: 'Loading', cls: 'is-loading', sr: 'loading', tip: 'Fetching roles…' };
  // UX-26: the person may well be online; say what happened.
  if (data.status === 'error') return { label: 'Couldn’t load', cls: 'is-error', sr: 'the roles couldn’t be loaded', tip: `Couldn’t load this board: ${data.error}` };
  if (data.status === 'unknown') return null; // D-19: not an outage, so no badge
  if (data.status !== 'ready') return null;
  const src = sourceText(data.company);
  const when = data.fetchedAt ? ago(data.fetchedAt) : null;
  const day = data.fetchedAt ? shortDate(data.fetchedAt) : null;
  // The server already says "Live fetch failed: …"; add that prefix only when it's missing.
  const failed = data.error ? (/^live fetch (failed|skipped)/i.test(data.error) ? data.error : `Live fetch failed: ${data.error}`) : '';
  const checking = 'Checking the live board now; the list updates by itself if it answers.';
  if (MOCK) return { label: 'Mock data', short: 'Mock data', tiny: 'Mock', cls: 'is-demo', tip: `Synthetic development data from mock-api.js (?mock=1, localhost only) — not real postings. Simulated mode: ${data.mode}.` };
  switch (data.mode) {
    case 'live': return { label: 'Live', tiny: 'Live', cls: 'is-live', sr: 'live board', tip: `Fetched live from ${src}${when ? ` · ${when}` : ''}.` };
    case 'cache': return { label: when ? `Cached · ${when}` : 'Cached', tiny: 'Cached', micro: 'Cached', cls: 'is-cache', tip: `Served from a recent copy of ${src}${failed ? ` (${failed})` : ''}. Refresh to fetch live.` };
    case 'snapshot': {
      const tip = `Saved snapshot of ${src}${day ? ` from ${day}` : ''}`;
      const sr = `saved snapshot${day ? ` from ${day}` : ''}`;
      if (data.pending) return { label: `Snapshot${day ? ` · ${day}` : ''} · checking live…`, short: 'Snapshot · checking live…', tiny: 'Checking live…', micro: 'Checking…', cls: 'is-snapshot is-pending', sr: `${sr}, checking the live board`, tip: `${tip}. ${checking}` };
      const only = bundleOnly(data.company) ? ' This board is collected by the site’s crawler; your browser can’t fetch it live.' : '';
      const cap = cappedNote();
      // UX-23 asked for a noun in the shortest label ("Saved Oct 11"), but on a 390px phone it leaves the company
      // name "A…" (M-27, A-3): the shortest label stays the date, and the badge's spoken name says "saved snapshot".
      return { label: day ? `Snapshot · ${day}` : 'Snapshot', micro: day || 'Saved', cls: 'is-snapshot', sr, tip: `${tip}${failed ? `. ${failed}` : ''}.${only}${cap ? ` ${cap.tip}` : ''}` };
    }
    case 'demo':
      if (data.pending) return { label: 'Demo data · checking live…', short: 'Demo · checking live…', tiny: 'Checking live…', micro: 'Checking…', cls: 'is-demo is-pending', sr: 'demo data, checking the live board', tip: `Generated sample data, not real postings. ${checking}` };
      return { label: 'Demo data — live board unreachable', short: 'Demo data', tiny: 'Demo', cls: 'is-demo', tip: `Generated sample data, not real postings.${data.error ? ` Error: ${data.error}` : ''}` };
    default: return { label: String(data.mode), cls: '', tip: src };
  }
}
/**
 * A board the crawl fitted to its budget (meta.jobsCapped { kept, total, by, rule }): { total, tip }
 * for the count line and the badge, or null. Amazon: "5,000 of 22,415 posted: the ones with a
 * published pay range, newest first. The rest are on its careers site."
 */
function cappedNote() {
  const c = data.status === 'ready' && data.meta && data.meta.jobsCapped;
  if (!c || !(c.total > c.kept)) return null;
  const which = /salaried/.test(c.rule || '') ? 'the ones with a published pay range first, newest first' : 'the newest';
  // MR-14: the kept postings are salaried first, so their pay share is not the board's; the whole board's
  // share when the snapshot records it (jobsCapped.salaried, scripts/snapshot.js#fitSnapshot).
  const whole = Number.isFinite(Number(c.salaried)) && c.salaried != null && c.total > 0 ? Math.round((Number(c.salaried) / c.total) * 100) : null;
  const share = whole != null ? ` ${whole}% of all ${Number(c.total).toLocaleString()} postings show pay.` : '';
  return { total: c.total, kept: c.kept, whole, salariedFirst: /salaried/.test(c.rule || ''),
    tip: `Showing ${Number(c.kept).toLocaleString()} of the ${Number(c.total).toLocaleString()} roles posted: ${which}.${share} The rest are on ${data.company?.name || 'the company'}’s careers site.` };
}
/** "Greenhouse / anthropic", or "<Name>’s careers site" for a built-in-only source (big-tech beta; UX-31). */
function sourceText(c) {
  if (!c?.source) return '';
  return SOURCE_LABEL[c.source] ? `${SOURCE_LABEL[c.source]} / ${c.board}` : `${c.name || c.board}’s careers site`;
}
/**
 * MR-10: the site a board is read from, as a link. An ATS board's public page; a big-tech board's careers
 * site, from the board's own posting links (the main site's files never name a beta careers host,
 * test/beta-build.test.js).
 */
const BOARD_URL = { greenhouse: (b) => `https://job-boards.greenhouse.io/${b}`, ashby: (b) => `https://jobs.ashbyhq.com/${b}`, lever: (b) => `https://jobs.lever.co/${b}` };
function sourceUrl(c) {
  if (!c?.source) return null;
  if (BOARD_URL[c.source] && c.board && /^[a-z0-9][a-z0-9_.-]*$/i.test(c.board)) return BOARD_URL[c.source](encodeURIComponent(c.board));
  const posting = data.jobs.find((j) => /^https:\/\//.test(String(j?.url || '')))?.url;
  if (!posting) return null;
  try {
    const u = new URL(posting);
    // A shared host (Google's www) is linked at its careers path, never at the host's home page.
    const m = u.pathname.match(/^\/(?:[a-z-]+\/)?careers\//i) || u.pathname.match(/^\/about\/careers\/applications\//i);
    return `${u.origin}${m ? m[0] : '/'}`;
  } catch { return null; }
}
/** UX-27: one date format: "Oct 11, 2026, 07:59 UTC". */
const UTC_TIME = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
const utcTime = (ts) => `${UTC_TIME.format(new Date(ts))} UTC`;
/** MR-11: why a board's count differs from its careers site's own count. */
const COUNT_NOTE = {
  apple: 'Apple’s site lists a role once for each place it is open in; here each role is one, with all its places, so the count is lower than Apple’s.',
};
/** Static build, `live: false` company (docs/CONTRACT.md v3): served from its snapshot only. */
function bundleOnly(c) { return !!(api.isStatic?.() && c?.live === false); }

/** F7: open-data CSV for the current built-in company (server: /api/export, static: data/<slug>.csv). */
function csvLink() {
  const c = data.company;
  if (MOCK || !c?.slug || isCustomKey(S.c) || data.status !== 'ready') return null;
  const href = api.isStatic?.() ? `data/${encodeURIComponent(c.slug)}.csv` : `api/export?company=${encodeURIComponent(c.slug)}`;
  // UX-61: plain words ("Download CSV"). M-39 (fix-phone-text): one line; what the file holds is behind its Details.
  return noteLine({ cls: 'badge-csv', key: 'badge-csv', line: h('a', { href, download: true }, 'Download a spreadsheet (CSV)'), // the server's Content-Disposition names the file
    details: ['Titles, teams, locations and posted pay, with links to the original postings.'] });
}
/**
 * M-39 (fix-phone-text): the badge popover's one line. The whole sentence (badgeInfo().tip), the crawl cadence,
 * the count notes and what the beta site is are behind its Details; a failed live fetch keeps its error visible.
 */
function badgeLine(info) {
  if (!info) return '';
  const failed = !!data.error && /fail|skipped/i.test(info.tip || '');
  if (MOCK) return 'Synthetic test data, not real postings';
  if (data.status !== 'ready') return info.tip;
  switch (data.mode) {
    case 'live': return `Fetched live${data.fetchedAt ? ` ${ago(data.fetchedAt)}` : ''}`;
    case 'cache': return failed ? 'A recent copy: the live fetch failed' : 'A recent copy of the board';
    case 'snapshot': return data.pending ? 'Saved snapshot; checking the live board' : failed ? 'Saved snapshot: the live fetch failed' : 'A saved snapshot, not a live read';
    case 'demo': return data.pending ? 'Sample data; checking the live board' : 'Sample data, not real postings';
    default: return info.tip;
  }
}

function makeBadgeDetails() {
  // Built once per popover; sync() updates it in place, so focus on its button or link survives
  // a re-render (e.g. the live board replacing the snapshot while the popover is open).
  const tip = h('div', { class: 'badge-tip' });
  const dl = h('dl');
  const err = h('pre', { class: 'badge-error', hidden: true });
  const refresh = MOCK ? null : h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--block', onclick: () => { closePopover(false); loadJobs({ refresh: true }); } }, 'Refresh from the live board');
  const csv = h('div');
  // UX-23: what the beta site is, in words a touch screen can read (the Beta tag's hover title). M-39: one line;
  // what the beta adds is in the popover's Details.
  const betaNote = CHANNEL === 'beta' ? h('p', { class: 'muted badge-beta' }, 'This is the beta site. ',
    h('a', { href: new URL('../', location.href).href }, 'Go to the main site')) : null;
  const el = h('div', { class: 'badge-details' }, ...nn(tip, dl, err, refresh, csv, betaNote));
  function sync() {
    const info = badgeInfo();
    const c = data.company || {};
    const url = sourceUrl(c);
    const cap = cappedNote();
    // MR-10: the source is a link, the time has its time zone, and the popover says how often the board is read.
    // UX-61: "sometimes a few hours late" (it named GitHub). M-39 (fix-phone-text): each row is one line; the
    // whole cadence, the count notes and the link are in the popover's Details.
    const cadence = bundleOnly(c) ? 'Read by the site’s crawler about every 6 hours (sometimes a few hours late)'
      : data.mode === 'live' ? 'Read live by your browser when you open the board' : 'Saved copy rebuilt every day; Refresh reads the live board';
    const cadenceShort = bundleOnly(c) ? 'About every 6 hours' : data.mode === 'live' ? 'Live, when you open it' : 'Every day';
    const rows = [
      ['Status', info?.label || '—'],
      ['Source', url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, sourceText(c)) : sourceText(c) || '—'],
      ['Fetched', data.fetchedAt ? utcTime(data.fetchedAt) : '—'],
      ['Updates', cadenceShort],
      ['Roles', cap ? `${data.jobs.length.toLocaleString()} of ${cap.total.toLocaleString()} posted` : data.jobs.length.toLocaleString()],
    ];
    renderNote(tip, { key: 'badge-tip', line: badgeLine(info), details: [
      info?.tip || '',
      data.fetchedAt ? `Fetched ${ago(data.fetchedAt)}, at ${utcTime(data.fetchedAt)}.` : '',
      [`${cadence}. `, docLink(UPDATED_DOC, 'How we collect this')],
      COUNT_NOTE[c.slug] || '',
      cap ? cap.tip : '',
      CHANNEL === 'beta' ? 'The beta site adds big-tech companies’ own careers sites.' : '',
    ] });
    dl.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    // M-14: the raw error, once. M-39 (fix-phone-text): the sentence that carries it is behind Details now, so a
    // failed fetch shows its error here whenever the line says it failed.
    const raw = data.error && (!(info?.tip || '').includes(data.error) || /failed/.test(badgeLine(info))) ? data.error : '';
    err.textContent = raw;
    err.hidden = !raw;
    // A snapshot-only board (static `live: false`) has no live board to refresh from.
    if (refresh) refresh.hidden = bundleOnly(c);
    const link = csvLink();
    const href = link?.querySelector('a')?.getAttribute('href') || '';
    if (csv.dataset.href !== href) { csv.dataset.href = href; csv.replaceChildren(...nn(link)); }
  }
  return { el, sync };
}

function allCompanies() {
  const all = [...companies, ...boards.map((b) => ({ slug: `${b.source}:${b.board}`, name: b.name || b.board, source: b.source, board: b.board, color: null, custom: true }))];
  // A custom board opened from a link is listed; a company this site doesn't list is not (D-19).
  if (S.c && isCustomKey(S.c) && !all.some((c) => c.slug === S.c)) all.push(companyInfo(S.c));
  return all;
}

/** I-1: switching company keeps the search, the pay bounds and every filter that exists there (settleKeep). */
function switchCompany(c) {
  if (!c || c.slug === S.c) return;
  // BP-10: the places picked here, by what they are (placeOf), so the next board can find its own label for them.
  pendingKeep = activeFilterCount() || Object.keys(held).length
    ? { name: c.name, from: data.company?.name || '', places: new Map(S.l.map((x) => [x, data.status === 'ready' ? placeOf(x, data.jobs) : null])) } : null;
  set({ c: c.slug, cn: c.custom ? c.name : '', job: null });
}
let pendingKeep = null;
/**
 * BP-10: filter values a board didn't have, set aside until a board that has them: facet key ->
 * { items: [{ value, place, from }], after } (`after`: the facet's value when they were set aside; `from`: the board
 * where they were in force). BN-5 (fix-app-6): a list facet (places, departments, levels, …) keeps what it set aside
 * while the person ticks or unticks other values, as the toast's "for now" promised; a one-value filter (role family,
 * Remote, listing date) drops it once another value replaces it. Clear all, the facet's Reset and opening a saved
 * search clear it (dropHeld), with a toast that names what was set aside (heldToast).
 */
let held = {};
const facetSnap = (key) => JSON.stringify(key === 'p' ? [S.p, S.ho] : S[key]);
function dropHeld(keys = null) { if (!keys) held = {}; else for (const k of keys) delete held[k]; }
/** BN-5: the values set aside for `keys` (all facets by default), as the toasts name them. */
function heldLabels(keys = null) {
  const out = [];
  for (const [key, hf] of Object.entries(held)) {
    if (keys && !keys.includes(key)) continue;
    for (const it of hf.items) out.push(heldLabel(key, it.value));
  }
  return out;
}
function heldLabel(key, v) {
  if (key === 's') return senLabel(v);
  if (key === 'e') return empLabel(v);
  if (key === 'jg') return `Juice: ${v}`;
  if (key === 'rf') return FAMILY_LABEL[v] || v;
  if (key === 'r') return v === 'remote' ? 'Remote' : 'On-site';
  if (key === 'p') return 'listing date';
  return String(v);
}
/** BN-5: say what Clear all or a Reset dropped of the values set aside at an earlier board. */
function heldToast(labels) {
  if (!labels.length) return;
  const list = labels.length > 3 ? `${labels.slice(0, 3).join(', ')} +${labels.length - 3}` : labels.join(', ');
  toast(`Also dropped ${list}, set aside from an earlier company`, 4500);
}
/** Popover "Reset" keys -> the facets it clears. */
const HELD_OF = { salary: [], dept: ['d', 'b'], loc: ['l'], sen: ['s'], remote: ['r'], more: ['e', 'p', 'kr', 'kf', 'ks', 'jg'] };
/**
 * After a company switch loads: keep the filter values the new board has (a place under the new board's own
 * label), set aside the ones it doesn't, put back ones set aside at an earlier board that this one has, and
 * say what was kept, put back and set aside.
 */
function settleKeep() {
  const k = pendingKeep;
  pendingKeep = null;
  if (!k || data.status !== 'ready') return;
  const jobs = data.jobs;
  const kept = [], dropped = [], back = [];
  // BN-5: a one-value filter drops what it set aside once another value replaced it; a list facet keeps it.
  for (const key of Object.keys(held)) if (!Array.isArray(S[key]) && facetSnap(key) !== held[key].after) delete held[key];
  if (S.q) kept.push(`“${S.q}”`);
  if (S.smin != null || S.smax != null || S.so) kept.push(quickLabel('salary'));
  /* `here(x, place)`: the value to use on this board, or null when it has none. Values in force are kept
     or set aside; values set aside earlier come back where they exist. */
  const keepArr = (key, here, label = (x) => x, placeFor = () => null) => {
    const now = [], aside = [];
    const add = (y, to) => { if (!now.includes(y)) { now.push(y); to.push(label(y)); } };
    for (const x of S[key]) {
      const y = here(x, placeFor(x));
      if (y != null) add(y, kept);
      else { aside.push({ value: x, place: placeFor(x) }); dropped.push(label(x)); }
    }
    const hf = held[key];
    if (hf) hf.items = hf.items.filter((it) => { const y = here(it.value, it.place); if (y == null) return true; add(y, back); return false; });
    if (aside.length) {
      const into = (held[key] ||= { items: [], after: '' });
      for (const it of aside) if (!into.items.some((z) => z.value === it.value)) into.items.push(it);
    }
    S[key] = now;
  };
  const has = (fn) => (x) => (jobs.some((j) => fn(j, x)) ? x : null);
  keepArr('d', has((j, x) => deptKey(j) === x));
  keepArr('b', has((j, x) => j.brand && brandKey(j) === x));
  // A known place keeps to that place ("Cambridge" in Massachusetts never becomes Cambridge, England); a label
  // with no place behind it (an old link) is kept where it still matches.
  keepArr('l', (x, p) => (p ? keyOnBoard(p, jobs) : locOnBoard(x, jobs) ? x : null), (x) => x, (x) => k.places?.get(x) || null);
  keepArr('s', has((j, x) => senKeys(j).includes(x)), senLabel);
  keepArr('e', has((j, x) => empKey(j) === x), empLabel);
  for (const { key, cat } of KW_CATS) keepArr(key, has((j, x) => j.keywords[cat].includes(x)));
  keepArr('jg', has((j, x) => gradeKey(j) === x), (x) => `Juice: ${x}`);
  /* One-value filters: the family, Remote or On-site, and the listing date. */
  const keepOne = (key, on, value, here, label, off) => {
    if (on) {
      if (here(value)) kept.push(label(value));
      else { dropped.push(label(value)); held[key] = { items: [{ value }], after: '' }; off(); }
    } else if (held[key] && here(held[key].items[0].value)) {
      const v = held[key].items[0].value;
      delete held[key];
      back.push(label(v));
      return v;
    }
    return null;
  };
  const rf = keepOne('rf', !!S.rf, S.rf, (v) => jobs.some((j) => famOf(j) === v), (v) => FAMILY_LABEL[v] || v, () => { S.rf = ''; });
  if (rf) S.rf = rf;
  const r = keepOne('r', S.r !== 'any', S.r, (v) => jobs.some((j) => (v === 'remote' ? j.remote : !j.remote)), (v) => (v === 'remote' ? 'Remote' : 'On-site'), () => { S.r = 'any'; });
  if (r) S.r = r;
  const p = keepOne('p', !!(S.p || S.ho), [S.p, S.ho], () => hasListingDates(), () => 'listing date', () => { S.p = 0; S.ho = false; });
  if (p) [S.p, S.ho] = p;
  for (const key of Object.keys(held)) { if (held[key].items.length) held[key].after = facetSnap(key); else delete held[key]; }
  commit({ replace: true });
  const list = (a) => (a.length > 3 ? `${a.slice(0, 3).join(', ')} +${a.length - 3}` : a.join(', '));
  const parts = [kept.length ? `Kept ${list(kept)}` : '', back.length ? `put back ${list(back)}` : '',
    dropped.length ? `dropped ${list(dropped)} (not at ${k.name}) for now` : ''].filter(Boolean);
  if (parts.length) { const t = parts.join(' · '); toast(t[0].toUpperCase() + t.slice(1), dropped.length || back.length ? 4500 : 3000); }
}
/** True when a location key matches a role on `jobs` (its own label, an old bare one, or a country-only posting). */
function locOnBoard(x, jobs) {
  const F = { l: new Set([x]), lCover: placeCover([x], jobs) };
  return jobs.some((j) => locMatches(j, F));
}
/* BP-10: a place by what it is, not by a board's label. Apple keys Columbus, OH as "Columbus, OH" (it also
   lists Columbus, GA) and Google as "Columbus" (disambiguateLocations), so a carried label never matched. */
const placeIndexesByKey = new WeakMap();
function placeKeys(jobs) {
  let ix = placeIndexesByKey.get(jobs);
  if (!ix) {
    ix = { byKey: new Map(), byId: new Map(), byCity: new Map() };
    for (const j of jobs) j.locations.forEach((l, i) => {
      const k = j._locKeys?.[i];
      if (!l || !k || ix.byKey.has(k)) return;
      const p = placeOfLoc(l);
      ix.byKey.set(k, p);
      if (!ix.byId.has(p.id)) ix.byId.set(p.id, k);
      if (p.city) { const list = ix.byCity.get(p.city) || []; if (!list.some((x) => x.key === k)) list.push({ key: k, region: p.region }); ix.byCity.set(p.city, list); }
    });
    placeIndexesByKey.set(jobs, ix);
  }
  return ix;
}
/** { id, city, region } for a location: "c|columbus|OH|US", city "columbus|US"; remote and country-only places by name. */
function placeOfLoc(l) {
  const country = String(l.country || '').toUpperCase(), region = String(l.region || '').toUpperCase();
  if (!l.remote && l.city) { const c = foldText(l.city); return { id: `c|${c}|${region}|${country}`, city: `${c}|${country}`, region }; }
  return { id: `${l.remote ? 'r' : 'n'}|${foldText(l.name || '')}|${country}`, city: null, region };
}
/** The place behind a location key on `jobs`, or null (a key no role there uses as its own label). */
const placeOf = (key, jobs) => placeKeys(jobs).byKey.get(key) || null;
/** This board's label for a place: the same place, or the same city and country when the regions don't disagree. */
function keyOnBoard(p, jobs) {
  const ix = placeKeys(jobs);
  const exact = ix.byId.get(p.id);
  if (exact || !p.city) return exact || null;
  const cands = (ix.byCity.get(p.city) || []).filter((c) => !p.region || !c.region || c.region === p.region);
  return cands.length === 1 ? cands[0].key : null;
}

const RECENT_KEY = 'melon-seek.recent.v1';
let recents = (() => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 4) : []; } catch { return []; } })();
function rememberCompany(slug) {
  recents = [slug, ...recents.filter((x) => x !== slug)].slice(0, 4);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); } catch { /* ignore */ }
}

/** I-3/I-4: saved searches first, then the companies by name (no job-board system headings or slugs), the user's boards, and "Add a board". */
function makeCompanyMenu() {
  const input = h('input', { type: 'search', class: 'fsearch', placeholder: 'Search companies…', 'aria-label': 'Search companies', autocomplete: 'off' });
  const list = h('div', { class: 'company-list' });
  const add = h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--block', title: 'Add another company’s job board (Greenhouse, Ashby or Lever)', onclick: () => togglePopover('board', $('#addBoardBtn')) },
    h('span', { html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>' }), 'Add another company’s board…');
  const el = h('div', { class: 'company-menu' }, h('div', { class: 'fsearch-wrap' }, h('span', { html: ICON.search }), input), list, add);
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('button')?.focus(); } if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); } });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else items[i - 1].focus(); }
  });
  let painted = null;
  function sync() {
    const q = input.value.trim().toLowerCase();
    const all = allCompanies().filter((c) => !q || `${c.name} ${c.board} ${c.source}`.toLowerCase().includes(q));
    const saved = listSaved().filter((x) => !q || x.name.toLowerCase().includes(q));
    // fix-company-scroll: syncPopover runs on every render (a beta board's live check settling, a saved
    // board loading); rebuilding identical rows under a finger can cut a touch scroll short, so only a
    // change repaints.
    // M-30: a saved board loading changes only its "N new" badge, which is updated in place.
    const key = JSON.stringify([S.c, all.map((c) => [c.slug, c.name, c.custom, c.live, companyColor(c)]), saved.map((x) => [x.id, x.name])]);
    if (key === painted && list.childElementCount) {
      for (const x of saved) {
        const row = list.querySelector(`.saved-row[data-saved="${CSS.escape(String(x.id))}"] .company-item`);
        if (!row) continue;
        const n = savedNewCount(x);
        let badge = row.querySelector('.saved-new');
        if (!n) { badge?.remove(); continue; }
        if (!badge) { badge = h('span', { class: 'saved-new' }); row.append(badge); }
        if (badge.textContent !== `${n} new`) badge.textContent = `${n} new`;
      }
      return;
    }
    painted = key;
    // D-25 / M-21: the beta site's big-tech boards (static `live: false`: their own careers sites) come
    // first, under their own heading, instead of last below the fold; the main site keeps one list.
    const builtins = all.filter((c) => !c.custom);
    const bigTech = builtins.filter((c) => c.live === false);
    const groups = [
      ...(bigTech.length ? [['Big tech', bigTech], ['More companies', builtins.filter((c) => c.live !== false)]] : [['Companies', builtins]]),
      ['Your boards', all.filter((c) => c.custom)],
    ].filter(([, items]) => items.length);
    const group = (label, kids) => {
      const id = `cm-${label.replace(/\W+/g, '-').toLowerCase()}`;
      return h('div', { role: 'group', 'aria-labelledby': id }, h('div', { class: 'check-group', id }, label), ...kids);
    };
    list.replaceChildren(...groups.map(([label, items]) => group(label, items.map((c) => h('button', {
      type: 'button', class: 'company-item', 'aria-current': c.slug === S.c ? 'true' : null,
      title: c.slug === S.c ? `${c.name} (open now)` : `Switch to ${c.name}, keeping your search and filters`,
      onclick: () => { closePopover(false); switchCompany(c); $('#companyMenuBtn').focus({ preventScroll: true }); },
    }, h('span', { class: 'dot', style: `--dot:${companyColor(c)}` }), h('span', { class: 'company-item-name' }, c.name),
    c.slug === S.c ? h('span', { class: 'company-item-check', 'aria-hidden': 'true' }, '✓') : null)))));
    if (!groups.length) list.append(h('p', { class: 'fnote' }, 'No matching company — add its job board below.'));
    if (saved.length) {
      list.prepend(group('Saved searches', saved.map((x) => {
        const n = savedNewCount(x);
        return h('div', { class: 'saved-row', dataset: { saved: String(x.id) } },
          h('button', { type: 'button', class: 'company-item', title: x.name, onclick: () => openSaved(x) },
            h('span', { class: 'saved-ico', html: ICON.bookmark }), h('span', { class: 'company-item-name' }, x.name),
            n ? h('span', { class: 'saved-new' }, `${n} new`) : null),
          h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': `Remove saved search ${x.name}`, html: ICON.close, onclick: () => { removeSaved(x.id); sync(); } }));
      })));
    }
  }
  /**
   * M-21: the menu opens with the current company (✓) in view. B-9 (fix-ui-6): a saved search with new roles, listed
   * first, stays in view too: the list scrolls no further than keeps the first such one whole. On the Razr cover screen
   * (a list three rows tall) the menu opened on the current company with the saved search and its "1 new" above, off
   * screen. Saved searches with nothing new leave the current company centred (M-28: five of them in landscape put it,
   * and the end of the list, five rows further away).
   */
  function reveal() {
    const cur = list.querySelector('.company-item[aria-current="true"]');
    if (!cur) return;
    const lr = list.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    if (cr.top >= lr.top && cr.bottom <= lr.bottom) return;
    let d = cr.top - lr.top - Math.max(0, (lr.height - cr.height) / 2);
    const fresh = list.querySelector('.saved-row .saved-new')?.closest('.saved-row');
    if (fresh) d = Math.min(d, fresh.getBoundingClientRect().top - lr.top);
    if (d > 0) list.scrollTop += d;
  }
  return { el, sync, reveal };
}

/* ---- F5: saved searches and "new since your last visit" (localStorage, try/catch) ---- */
const SAVED_KEY = 'melon.saved';
const seenKey = (slug) => `melon.seen.${slug}`;       // last visit ISO (per ROADMAP F5)
const seenIdsKey = (slug) => `melon.seenIds.${slug}`; // ids seen then (fallback when there is no ledger)
const jobCache = new Map(); // slug -> jobs loaded this session (for "N new" counts)
let visit = { slug: null, since: null, seenIds: null };

const lsGet = (k, fallback) => { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: feature degrades */ } };

/** Remember this visit; keep the previous one for the session so "New" stays stable across refreshes. */
/** The last visit to `slug`, as markVisit reads it (nothing is recorded). */
function readVisit(slug) {
  const since = lsGet(seenKey(slug), null);
  const ids = lsGet(seenIdsKey(slug), null);
  return { slug, since: typeof since === 'string' ? since : null, seenIds: Array.isArray(ids) ? new Set(ids) : null };
}
function markVisit(slug, jobs) {
  jobCache.set(slug, jobs);
  if (visit.slug === slug) return;
  visit = readVisit(slug);
  lsSet(seenKey(slug), new Date().toISOString());
  lsSet(seenIdsKey(slug), jobs.map((j) => j.id));
}
/** New = first seen after `since` (ledger), else an id we had not seen at that visit. */
function isNewSince(job, since, seenIds) {
  if (!since) return false;
  if (job.firstSeenAt) return Date.parse(job.firstSeenAt) > Date.parse(since);
  return seenIds ? !seenIds.has(job.id) : false;
}
/* P-12: a saved search's "N new" counts against its own last opening, the cards against the last
   visit to the company. Opening the saved search marks exactly the roles it counted, so the two agree. */
let savedView = null; // { slug, hash, since, seen, ids: Set|null (null until that company's roles load), told }
function savedViewIds() {
  const v = savedView;
  if (!v || v.slug !== S.c) return null;
  if (!v.ids && data.status === 'ready' && data.company?.slug === v.slug) {
    v.ids = new Set(savedNewIds({ hash: v.hash, lastSeenAt: v.since, seen: v.seen, seenHash: v.seenHash }, data.jobs));
    const list = loadSaved(), entry = list.find((y) => y.id === v.id);
    if (entry) { rememberSeen(entry, matchingIds(v.hash, data.jobs)); storeSaved(list); }
  }
  return v.ids;
}
const isNewJob = (job) => {
  const v = visit.slug === S.c ? visit : previewing() ? preview.visit : null; // the preview's: the same reads markVisit makes
  return (!!v && isNewSince(job, v.since, v.seenIds)) || !!savedViewIds()?.has(job.id);
};
/** After a saved search's company loads: say how many new roles it has and where they are. */
function settleSaved() {
  const v = savedView;
  if (!v || v.told || v.slug !== S.c || data.status !== 'ready') return;
  v.told = true;
  const n = savedViewIds()?.size || 0;
  if (n) toast(`${plural(n, 'new role')} since you last opened this search${S.sort === 'best' ? ' — listed first,' : ','} marked New`, 4500);
}

/** Every saved search in this browser, both sites' (the main site and /beta/ share one origin). */
function loadSaved() {
  const v = lsGet(SAVED_KEY, []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.hash === 'string' && typeof x.name === 'string' && x.id).slice(0, 50) : [];
}
const storeSaved = (list) => lsSet(SAVED_KEY, list);
/* D-19: each site lists its own saved searches. A search carries the site it was saved on; one saved
   before that is listed where its company is (so a beta company's search never shows on the main site). */
function savedHere(x) {
  if (x.channel) return x.channel === CHANNEL;
  const slug = parseHash(`#${x.hash}`).c;
  return !slug || isCustomKey(slug) || companies.some((c) => c.slug === slug);
}
/** The saved searches this site lists. */
const listSaved = () => loadSaved().filter(savedHere);

/* D-18: what a saved search matched when it was last opened. Under 2,000 matches it keeps their ids
   (`seen`); a bigger one keeps a compact set (`seenHash`): the 32-bit FNV-1a hash of each id, sorted,
   in base64, about 5.5 characters a role (Apple's 6,105 take 33 KB). Before, the ids were cut at 2,000,
   so a search with more matches showed thousands of "new" roles at once. A hash collision (about 1 in
   700,000 a role at 6,000 matches) hides one new role. */
const SEEN_IDS_MAX = 2000;
function idHash(id) {
  const t = String(id);
  let x = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  return x >>> 0;
}
function packSeen(ids) {
  const a = Uint32Array.from(new Set(Array.from(ids, idHash))).sort();
  const b = new Uint8Array(a.buffer);
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
}
const seenSets = new Map(); // packed string -> Set of id hashes, decoded once
function unpackSeen(packed) {
  let set = seenSets.get(packed);
  if (!set) {
    try {
      const bin = atob(packed);
      const b = new Uint8Array(bin.length - (bin.length % 4));
      for (let i = 0; i < b.length; i++) b[i] = bin.charCodeAt(i);
      set = new Set(new Uint32Array(b.buffer));
    } catch { return null; }
    if (seenSets.size >= 60) seenSets.delete(seenSets.keys().next().value);
    seenSets.set(packed, set);
  }
  return { has: (id) => set.has(idHash(id)) };
}
/** Store what a saved search matches now (`ids`) as what it has seen. */
function rememberSeen(entry, ids) {
  delete entry.seen;
  delete entry.seenHash;
  if (ids.length < SEEN_IDS_MAX) entry.seen = ids; else entry.seenHash = packSeen(ids);
}
/** What a saved search had seen ({ has(id) }), or null when that is unknown (then it counts nothing new). */
function savedSeen(x) {
  if (typeof x.seenHash === 'string') return unpackSeen(x.seenHash);
  if (x.seen instanceof Set) return x.seen;
  // An id list of 2,000 or more is one cut at 2,000 before D-18: it can't tell new roles from unlisted ones.
  return Array.isArray(x.seen) && x.seen.length < SEEN_IDS_MAX ? new Set(x.seen) : null;
}
/** The shareable part of the state a saved search restores: company + filters + sort. */
function searchHash(st = S) {
  const x = structuredClone(DEFAULTS);
  for (const k of ['c', 'cn', 'sort', ...FILTER_KEYS]) x[k] = structuredClone(st[k]);
  return serialize(x);
}
function searchName(st = S) {
  const parts = [];
  if (st.q) parts.push(`“${st.q}”`);
  const sal = quickLabel('salary'); if (sal) parts.push(sal);
  if (st.rf) parts.push(FAMILY_LABEL[st.rf] || st.rf);
  const shown = { s: senLabel, e: empLabel };
  for (const k of ['s', 'b', 'd', 'l', 'ks', 'kr', 'kf', 'jg', 'e']) for (const v of st[k]) parts.push(shown[k] ? shown[k](v) : v);
  if (st.r !== 'any') parts.push(st.r === 'remote' ? 'Remote' : 'On-site');
  if (st.p) parts.push(`listed in the past ${plural(st.p, 'day')}`);
  const name = companyInfo(st.c)?.name || st.c;
  return `${name} · ${parts.slice(0, 3).join(' · ')}${parts.length > 3 ? ` +${parts.length - 3}` : ''}`;
}
const currentSaved = () => { const hsh = searchHash(); return listSaved().find((x) => x.hash === hsh) || null; };
function matchingIds(hash, jobs) {
  const F = filterSpec(parseHash(`#${hash}`), jobs), now = Date.now();
  return jobs.filter((j) => !failures(j, F, now).length).map((j) => j.id);
}
function toggleSave() {
  const existing = currentSaved();
  if (existing) { removeSaved(existing.id); toast('Removed saved search'); renderQuickbar(); return; }
  const now = new Date().toISOString();
  const hash = searchHash();
  const entry = { id: Math.random().toString(36).slice(2, 10), name: searchName(), hash, channel: CHANNEL, createdAt: now, lastSeenAt: now };
  rememberSeen(entry, matchingIds(hash, data.jobs));
  storeSaved([entry, ...loadSaved()].slice(0, 50));
  toast('Saved in this browser. Find it in the company menu, with its new roles', 4000); // I-4: say once where saves live
  renderQuickbar();
}
function removeSaved(id) { storeSaved(loadSaved().filter((x) => x.id !== id)); }
/** The ids a saved search counts as new: its matches first seen after its last opening. */
function savedNewIds(x, jobs) {
  const seen = savedSeen(x);
  const ids = new Set(matchingIds(x.hash, jobs));
  return jobs.filter((j) => ids.has(j.id) && isNewSince(j, x.lastSeenAt, seen)).map((j) => j.id);
}
/** "N new" for a saved search, when that company's jobs are loaded this session. */
function savedNewCount(x) {
  const slug = parseHash(`#${x.hash}`).c;
  const jobs = jobCache.get(slug);
  if (!jobs) return 0;
  return savedNewIds(x, jobs).length;
}
/* D-10: "N new" needs the saved company's roles. The menu fetches the boards of saved searches
   that haven't loaded this session (one request each, at most once), then re-counts in place. */
const savedFetches = new Set();
function prefetchSaved() {
  if (MOCK) return;
  for (const slug of new Set(listSaved().map((x) => parseHash(`#${x.hash}`).c).filter(Boolean))) {
    if (jobCache.has(slug) || savedFetches.has(slug)) continue;
    savedFetches.add(slug);
    (async () => {
      const res = await dataApi.getJobs(jobsQuery(slug));
      if (res?.unavailable) { savedFetches.delete(slug); return; } // nothing loaded (DQ-7): no count; asked again later
      const jobs = Array.isArray(res?.jobs) ? res.jobs : [];
      const source = res?.company?.source || companyInfo(slug)?.source || null;
      for (let i = 0; i < jobs.length; i += PREPARE_CHUNK) { prepare(jobs.slice(i, i + PREPARE_CHUNK), { source }); await yieldTask(); }
      if (needsRejuice(jobs, juiceHousehold)) await rejuice(jobs, juiceHousehold);
      disambiguateLocations(jobs);
      if (!jobCache.has(slug)) jobCache.set(slug, jobs);
      if (popover.id === 'company') syncPopover();
    })().catch(() => { /* offline: the badge just stays off */ });
  }
}
function openSaved(x) {
  closePopover(false);
  const list = loadSaved();
  const next = parseHash(`#${x.hash}`);
  if (!next.c) next.c = S.c;
  const slug = next.c;
  const jobs = jobCache.get(slug);
  const entry = list.find((y) => y.id === x.id);
  // P-12: remember what the menu counted as new before this opening resets the count.
  const before = entry || x;
  savedView = { id: x.id, slug, hash: x.hash, since: before.lastSeenAt, seen: Array.isArray(before.seen) ? [...before.seen] : null,
    seenHash: typeof before.seenHash === 'string' ? before.seenHash : null, ids: jobs ? new Set(savedNewIds(before, jobs)) : null, told: false };
  if (entry) { entry.lastSeenAt = new Date().toISOString(); if (jobs) rememberSeen(entry, matchingIds(x.hash, jobs)); storeSaved(list); }
  // Through set(), not pushState + onHashChange: the menu's history entry may still be popping (M-3).
  if (drawerJobId) closeDrawer();
  pendingKeep = null;
  dropHeld(); // BP-10: a saved search is exactly what it saved
  const same = slug === S.c;
  set({ ...next, job: null });
  if (same) settleSaved();
}

function resetFiltersPatch() {
  const patch = {};
  for (const k of FILTER_KEYS) patch[k] = structuredClone(DEFAULTS[k]);
  return patch;
}

/* -------------------------------------------------------------- quickbar */

const QUICK = [
  { id: 'salary', label: 'Salary' },
  { id: 'dept', label: 'Department' },
  { id: 'loc', label: 'Location' },
  { id: 'sen', label: 'Seniority' },
  { id: 'remote', label: 'Remote' },
  { id: 'more', label: 'More' },
];

function summarize(list, noun) {
  if (!list.length) return null;
  if (list.length === 1) return list[0].length > 22 ? list[0].slice(0, 21) + '…' : list[0];
  return `${noun} · ${list.length}`;
}

function quickLabel(id) {
  switch (id) {
    case 'salary': {
      // BN-8 (fix-app-6): as typed ("PLN 150K+", "£75K+"); the chip, the saved-search name and the kept toast read this.
      const nat = payNative();
      const cur = nat ? nat.cur : 'USD', lo = nat ? nat.min : S.smin, hi = nat ? nat.max : S.smax;
      if (lo != null && hi != null) return compactRange(lo, hi, cur);
      if (lo != null) return `${money(lo, cur)}+`;
      if (hi != null) return `Up to ${money(hi, cur)}`;
      return S.so ? 'Has salary' : null;
    }
    case 'dept': return summarize([...S.b, ...S.d], S.d.length ? 'Departments' : 'Companies'); // google-grouping: Company is in this menu
    case 'loc': return summarize(S.l, 'Locations');
    case 'sen': return summarize(S.s.map(senLabel), 'Seniority');
    case 'remote': return S.r === 'remote' ? 'Remote only' : S.r === 'onsite' ? 'On-site' : null;
    case 'more': {
      const n = S.e.length + (S.p ? 1 : 0) + (S.ho ? 1 : 0) + S.kr.length + S.kf.length + S.ks.length + S.jg.length;
      return n ? `More · ${n}` : null;
    }
  }
  return null;
}

function renderQuickbar() {
  const wrap = $('#quickChips');
  if (!wrap.childElementCount) {
    for (const q of QUICK) {
      wrap.append(h('button', { type: 'button', class: 'chip chip--drop', dataset: { pop: q.id }, 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
        onclick: (e) => togglePopover(q.id, e.currentTarget) },
      h('span', { class: 'chip-label' }, q.label), h('span', { class: 'chip-caret', html: ICON.chevron })));
    }
  }
  let activeSig = '';
  for (const btn of wrap.children) {
    const q = QUICK.find((x) => x.id === btn.dataset.pop);
    const lbl = quickLabel(q.id);
    btn.classList.toggle('is-active', !!lbl);
    btn.querySelector('.chip-label').textContent = lbl || q.label;
    btn.disabled = data.status !== 'ready';
    if (lbl) activeSig += `${q.id}:${lbl}|`;
  }
  // I-5: phones list the active chips first (styles.css); bring them back into view when they change.
  if (wrap.dataset.active !== activeSig) { wrap.dataset.active = activeSig; if (isMobile()) wrap.scrollLeft = 0; }
  syncChipsExpanded();
  const n = activeFilterCount();
  const cnt = $('#filtersCount');
  cnt.hidden = !n;
  cnt.textContent = n;
  // I-5: phones show the Filters chip as its icon and count while filters are on (styles.css), so the active chips fit.
  $('#filtersToggle').setAttribute('aria-label', n ? `Filters, ${n} on` : 'Filters');
  $('#clearAll').hidden = !n && !area;
  // F5: the one new main-view control — only when a filter is active.
  const save = $('#saveSearch');
  // UX-34: no Save for a search with no results (a saved one keeps its button, so it can be removed).
  save.hidden = !n || data.status !== 'ready' || (!visible.length && !currentSaved());
  if (!save.hidden) {
    const on = !!currentSaved();
    save.classList.toggle('is-saved', on); // V9: one pattern — the label changes (Save/Saved), no aria-pressed
    save.querySelector('span:last-child').textContent = on ? 'Saved' : 'Save';
    save.setAttribute('aria-label', on ? 'Saved search — remove it' : 'Save this search');
    save.title = on ? 'Saved in this browser. Press again to remove. Saved searches are in the company menu.' : 'Save this search in this browser; the company menu shows it, with its new roles, next time';
  }

  for (const slot of [$('#areaChipTop'), $('#areaChipList')]) {
    slot.replaceChildren();
    if (S.rf) {
      const label = FAMILY_LABEL[S.rf] || S.rf;
      slot.append(h('span', { class: 'area-chip' }, h('span', { class: 'area-label' }, `Role: ${label}`),
        h('button', { type: 'button', class: 'area-x', 'aria-label': `Clear role filter ${label}`, html: ICON.close, onclick: () => set({ rf: '' }) })));
    }
    if (area) {
      const count = derived.filtered.filter((j) => area.ids.has(j.id)).length;
      slot.append(h('span', { class: 'area-chip' },
        h('span', { class: 'area-ico', html: area.kind === 'cluster' ? ICON.cluster : ICON.pin }), h('span', { class: 'area-label' }, `${area.label} (${count})`),
        h('button', { type: 'button', class: 'area-x', 'aria-label': `Clear area ${area.label}`, html: ICON.close, onclick: () => { clearArea(); scheduleRender(); } })));
    }
  }
}

/* --------------------------------------------------------- filter panel */
// Each control is a small component with persistent DOM and a sync() that
// updates it in place, so focus / slider drags survive re-renders. The left
// column and the quick-filter popovers both mount these components.

function section(title, body, { open = true, badge = null } = {}) {
  const det = h('details', { class: 'fsec', open });
  const sum = h('summary', null, h('span', { class: 'fsec-title' }, title), badge, h('span', { class: 'fsec-caret', html: ICON.chevron }));
  det.append(sum, body.el);
  return { el: det, sync: body.sync, badge };
}

/* P-5: the Min/Max boxes take "£80,000", "80k", "A$350k", "AUD 350000", "60000", "400" ($400K) or
   "$1.2M": a currency symbol or code is converted to approx USD with the app's FX table (palette.js),
   and the box says what it understood ("£80,000 ≈ $108K a year"). Values below the lowest pay on the
   board are kept (they still hide postings with no pay, which the note says). */
const CUR_CODES = [
  [/^(?:us\$|usd)/, 'USD'], [/^(?:a\$|au\$|aud)/, 'AUD'], [/^(?:c\$|ca\$|cad)/, 'CAD'], [/^(?:nz\$|nzd)/, 'NZD'], [/^(?:s\$|sgd)/, 'SGD'],
  [/^(?:hk\$|hkd)/, 'HKD'], [/^(?:£|gbp)/, 'GBP'], [/^(?:€|eur)/, 'EUR'], [/^(?:¥|jpy)/, 'JPY'], [/^(?:₹|inr)/, 'INR'], [/^chf/, 'CHF'],
  [/^(?:₩|krw)/, 'KRW'], [/^(?:₪|ils)/, 'ILS'], [/^(?:zł|zl)/, 'PLN'], [/^(?:sek|nok|dkk|pln|czk|aed|sar|brl|mxn|twd)/, null], [/^\$/, 'USD'],
];
const CUR_TAILS = CUR_CODES.map(([re, cur]) => [new RegExp(`(?:${re.source.slice(1)})$`), cur]);
/**
 * "£80,000" -> { usd: 108000, value: 80000, currency: 'GBP', read: true, given: true }; "" / "any" -> null; not understood
 * -> undefined. BN-8 (fix-app-6): "zł" is PLN ("360 000 zł"), and thousands grouped by spaces, dots or apostrophes
 * ("360 000", "360.000", "360’000") are read; `given` says whether the text named a currency.
 */
function parsePay(txt) {
  let t = String(txt).trim().toLowerCase().replace(/\s+/g, '').replace(/[’']/g, '').replace(/(?:\/|per|a)?(?:yr|year|annum)$/, '');
  if (!t || t === 'any') return null;
  let currency = null;
  for (const [re, cur] of CUR_CODES) {
    const m = t.match(re);
    if (m) { currency = cur || m[0].toUpperCase(); t = t.slice(m[0].length); break; }
  }
  if (!currency) { // a trailing code or symbol: "350000aud", "80k£", "80.000€"
    for (const [re, cur] of CUR_TAILS) {
      const m = t.match(re);
      if (m) { currency = cur || m[0].toUpperCase(); t = t.slice(0, -m[0].length); break; }
    }
  }
  if (currency && !hasFx(currency)) return undefined;
  const m = t.match(/^(\d+(?:[.,]\d+)*)(k|m)?$/);
  if (!m) return undefined;
  let num = m[1];
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, ''); // thousands separators: 80,000 / 80.000
  else num = num.replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  let value = Number(num);
  if (!Number.isFinite(value)) return undefined;
  let read = false;
  if (m[2] === 'm') value *= 1e6;
  else if (m[2] === 'k') value *= 1e3;
  else if (value > 0 && value < 1000) { value *= 1e3; read = true; } // "400" reads as $400K (the box is yearly pay)
  value = Math.round(value);
  const cur = currency || 'USD';
  const usd = usdOf(value, cur);
  return { usd, value, currency: cur, read: read || cur !== 'USD', given: !!currency };
}
/**
 * BN-8: the currency of the pay in view when it is all in one (BN-2's rule: stats' `cur` with no basis), over the roles
 * every other filter leaves (the pay filter aside); null when the view mixes currencies or shows no pay.
 */
function viewPayCurrency() {
  const st = stats(compVisible());
  return st.withSalary && !st.basis ? st.cur : null;
}
/** BN-8: an amount in US dollars as `cur`, rounded to a thousand (a bound the slider set, shown in the typed currency). */
const fromUSDRound = (usd, cur) => (usd == null ? null : Math.round((usd * (FX_PER_USD[cur] ?? 1)) / 1000) * 1000);
/** The last typed bounds and how they were read, shown under the boxes while they stay in force. */
const typedPay = { lo: null, hi: null };

function makeSalary({ compact = false } = {}) {
  const hist = h('div', { class: 'hist', 'aria-hidden': 'true' });
  const lo = h('input', { type: 'range', class: 'range range--lo', 'aria-label': 'Minimum salary', step: 5000 });
  const hi = h('input', { type: 'range', class: 'range range--hi', 'aria-label': 'Maximum salary', step: 5000 });
  const fill = h('div', { class: 'range-fill' });
  const track = h('div', { class: 'range-wrap' }, h('div', { class: 'range-track' }), fill, lo, hi);
  // D-13: the Min/Max boxes take a typed bound ("250k", "$300,000", "£80,000", "any"), committed on change/Enter.
  const valInput = (label) => h('input', { type: 'text', class: 'range-val', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': label,
    title: 'Yearly pay in US dollars. You can type another currency, e.g. £80,000 or A$350k' });
  const minOut = valInput('Min $/yr: minimum yearly pay in US dollars (another currency is converted)');
  const maxOut = valInput('Max $/yr: maximum yearly pay in US dollars (another currency is converted)');
  const vals = h('div', { class: 'range-vals' }, h('label', null, h('span', null, 'Min $/yr'), minOut), h('span', { class: 'range-dash' }, '–'), h('label', null, h('span', null, 'Max $/yr'), maxOut));
  const understood = h('p', { class: 'fnote salary-read', role: 'status', hidden: true });
  const toggle = h('input', { type: 'checkbox', role: 'switch', class: 'switch' });
  const toggleRow = h('label', { class: 'switch-row' }, h('span', null, 'Only show roles with pay'), toggle);
  const noPay = h('div', { class: 'fnote salary-nopay', hidden: true });
  const note = h('div', { class: 'fnote' });
  const empty = h('p', { class: 'fnote' }, 'No pay information on this board.');
  const el = h('div', { class: `salary-ctl${compact ? ' salary-ctl--compact' : ''}` }, hist, track, vals, understood, toggleRow, noPay, note, empty);
  let dom = null;
  let bins = [];
  let junk = ''; // the last text the box could not read

  const onInput = (which) => () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { if (which === 'lo') { a = b; lo.value = a; } else { b = a; hi.value = b; } }
    typedPay[which] = null;
    junk = '';
    // The other bound stays as it is: a typed value beyond the slider's ends is kept.
    let smin = S.smin, smax = S.smax;
    if (which === 'lo') smin = a <= dom.lo ? null : a;
    else { smax = b >= dom.hi ? null : b; if (smin != null && smax != null && smin > smax) smin = smax; }
    // BN-8: bounds typed in another currency stay in it: the moved one is that currency's round amount.
    const nat = payNative();
    if (nat) {
      const smn = which === 'lo' ? fromUSDRound(smin, nat.cur) : smin === S.smin ? nat.min : fromUSDRound(smin, nat.cur);
      const smx = which === 'hi' ? fromUSDRound(smax, nat.cur) : nat.max;
      set({ smin: usdOf(smn, nat.cur), smax: usdOf(smx, nat.cur), smn, smx }, { replace: true });
    } else set({ smin, smax }, { replace: true });
    paint(true);
  };
  lo.addEventListener('input', onInput('lo'));
  hi.addEventListener('input', onInput('hi'));
  // A drag produces many replaceState calls; push one history entry when it ends.
  const settle = () => { lastHash = '__dirty'; commit(); };
  lo.addEventListener('change', settle);
  hi.addEventListener('change', settle);
  const typed = (which) => () => {
    if (!dom) return;
    const raw = (which === 'lo' ? minOut : maxOut).value.trim();
    const v = parsePay(raw);
    if (v === undefined) { junk = raw; paint(true); return; } // not understood: say so, keep the bound in force
    junk = '';
    // BN-8: a bare number takes the currency of the pay in view when it is all in one (BN-2's rule), else dollars.
    if (v && !v.given) {
      const vc = viewPayCurrency();
      if (vc && vc !== 'USD' && hasFx(vc)) Object.assign(v, { currency: vc, usd: usdOf(v.value, vc), read: true, inView: true });
    }
    let a = S.smin, b = S.smax;
    const x = v == null || !(v.usd > 0) ? null : v.usd;
    if (which === 'lo') { a = x; if (a != null && b != null && a > b) b = a; }
    else { b = x; if (a != null && b != null && b < a) a = b; }
    typedPay[which] = x != null && (v.read || x < dom.lo || x > dom.hi) ? { usd: x, raw, v } : null;
    // BN-8: the bounds are kept as typed, in one currency: the one just typed (the other bound is re-expressed in it).
    const was = payNative();
    const cur = x == null ? (was ? was.cur : '') : v.currency === 'USD' ? '' : v.currency;
    let patch = { smin: a, smax: b, sc: cur, smn: null, smx: null };
    if (cur) {
      const other = (usd, prev) => (usd == null ? null : was && was.cur === cur && prev != null && usdOf(prev, cur) === usd ? prev : fromUSDRound(usd, cur));
      const smn = which === 'lo' ? (x == null ? null : v.value) : other(a, was?.min);
      const smx = which === 'hi' ? (x == null ? null : v.value) : other(b, was?.max);
      patch = { sc: cur, smn, smx, smin: usdOf(smn, cur), smax: usdOf(smx, cur) };
    }
    lo.value = patch.smin ?? dom.lo; hi.value = patch.smax ?? dom.hi;
    set(patch);
    paint(true);
  };
  for (const [inp, which] of [[minOut, 'lo'], [maxOut, 'hi']]) {
    inp.addEventListener('change', typed(which));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); typed(which)(); } });
    inp.addEventListener('focus', () => inp.select());
  }
  toggle.addEventListener('change', () => set({ so: toggle.checked }));

  /** "Min: £80,000 ≈ $108K a year", "Min: “400” read as $400K a year", "…, below the lowest pay listed here ($100K)". */
  function readText() {
    if (junk) return `“${junk}” isn’t a pay figure. Try 80k, $120,000 or £80,000.`;
    const out = [];
    for (const [which, cur, name] of [['lo', S.smin, 'Min'], ['hi', S.smax, 'Max']]) {
      const t = typedPay[which];
      if (!t || cur !== t.usd) continue;
      const usd = money(t.usd);
      const how = t.v.inView ? `${postedMoney(t.v.value, t.v.currency)} ≈ ${usd} a year, as the pay here`
        : t.v.currency !== 'USD' ? `${postedMoney(t.v.value, t.v.currency)} ≈ ${usd} a year` : t.v.read ? `“${t.raw}” read as ${usd} a year` : `${usd} a year`;
      const edge = which === 'lo' && t.usd < dom.lo ? `, below the lowest pay listed here (${money(dom.lo)})`
        : which === 'hi' && t.usd > dom.hi ? `, above the highest pay listed here (${money(dom.hi)})` : '';
      out.push(`${name}: ${how}${edge}`);
    }
    return out.join('. ');
  }

  function paint(force = false) {
    if (!dom) return;
    const a = Number(lo.value), b = Number(hi.value);
    const pct = (v) => ((v - dom.lo) / (dom.hi - dom.lo)) * 100;
    fill.style.left = `${pct(a)}%`;
    fill.style.right = `${100 - pct(b)}%`;
    // D-3: once the min thumb is in the right half it goes on top, so a min thumb pushed to the
    // right end (both thumbs together) can still be dragged back; otherwise max stays on top.
    lo.classList.toggle('is-top', pct(a) > 50);
    // The text follows the state, so a typed bound stays exact (the slider snaps to $5K).
    const minShow = boundText('min') ?? 'Any'; // BN-8: as typed ("PLN 150K"), else dollars
    const maxShow = boundText('max') ?? 'Any';
    if (force || document.activeElement !== minOut) minOut.value = minShow;
    if (force || document.activeElement !== maxOut) maxOut.value = maxShow;
    lo.setAttribute('aria-valuetext', minShow);
    hi.setAttribute('aria-valuetext', maxShow);
    const read = readText();
    if (understood.textContent !== read) understood.textContent = read;
    understood.hidden = !read;
    bins.forEach((bar, i) => {
      const x0 = dom.lo + (i / bins.length) * (dom.hi - dom.lo);
      const x1 = dom.lo + ((i + 1) / bins.length) * (dom.hi - dom.lo);
      bar.classList.toggle('is-in', x1 > a && x0 < b);
    });
  }

  function sync() {
    dom = salaryDomain();
    const has = !!dom;
    for (const n of [hist, track, vals, note]) n.hidden = !has;
    empty.hidden = has;
    toggle.checked = S.so;
    // P-5: say when the pay filter hides postings that list no pay. BN-6 (fix-app-6): every role it hides, and why.
    const why = derived.fc?.salWhy || { none: derived.fc?.noPayHidden || 0, elsewhere: derived.fc?.elsewhereHidden || 0, under: 0, over: 0 };
    const hidden = why.none, elsewhere = why.elsewhere; // shared decision 1
    const all = hidden + elsewhere + why.under + why.over;
    const is = (n) => (n === 1 ? 'is' : 'are');
    // M-36 (fix-phone-text): one line, the reasons behind its Details.
    // BN-6: every role it hides is a bigger number ("1,855"), so the line takes shorter words where it would wrap.
    renderNote(noPay, { key: 'fnote-nopay', line: all ? fitOneLine(h('span'), [`${plural(all, 'role')} hidden by the pay filter`, `${all.toLocaleString()} hidden by the pay filter`, `${all.toLocaleString()} hidden by it`]) : '', details: [
      why.under ? `${plural(why.under, 'role')} whose posted pay is all under ${boundText('min')} a year ${is(why.under)} hidden. Posted minimums (“from …”) are kept: their top isn’t stated.` : '',
      why.over ? `${plural(why.over, 'role')} whose posted pay is all over ${boundText('max')} a year ${is(why.over)} hidden.` : '',
      hidden ? `${plural(hidden, 'role')} that ${hidden === 1 ? 'lists' : 'list'} no pay ${is(hidden)} hidden while a pay filter is on.` : '',
      elsewhere ? `${plural(elsewhere, 'role')} whose pay is posted for another country ${is(elsewhere)} hidden${hidden ? ' too' : ' while a pay filter is on'}: that pay isn’t for ${placesPicked()}.` : ''] });
    noPay.hidden = !all;
    if (!has) { understood.hidden = true; return; }
    for (const r of [lo, hi]) { r.min = dom.lo; r.max = dom.hi; }
    if (document.activeElement !== lo) lo.value = S.smin ?? dom.lo;
    if (document.activeElement !== hi) hi.value = S.smax ?? dom.hi;
    // histogram of midpoints (faceted: ignores the salary filter itself)
    const N = compact ? 30 : 26;
    const counts = new Array(N).fill(0);
    for (const m of derived.fc?.salMids || []) counts[Math.min(N - 1, Math.max(0, Math.floor(((m - dom.lo) / (dom.hi - dom.lo)) * N)))]++;
    const max = Math.max(1, ...counts);
    if (bins.length !== N) { bins = counts.map(() => h('span', { class: 'hist-bar' })); hist.replaceChildren(...bins); }
    counts.forEach((c, i) => { bins[i].style.height = `${c ? Math.max(6, (c / max) * 100) : 0}%`; });
    const foreign = data.jobs.filter((j) => j._usd && j.salary.currency && j.salary.currency !== 'USD').length;
    const unclear = data.jobs.filter((j) => j.salaryFlag).length;
    // M-36 / UX-60 (fix-phone-text): one line (it was 30 words and 4 facts); the rest behind its Details.
    renderNote(note, { key: 'fnote-pay', line: 'Matches roles whose range overlaps yours', details: [
      'A role matches if its posted range overlaps the one you set.',
      'You can type another currency (£80,000, A$350k).',
      foreign ? 'All pay is compared in US dollars (converted at approximate rates).' : '',
      unclear ? `${unclear} with unclear pay ${unclear === 1 ? 'is' : 'are'} left out.` : ''] });
    paint();
  }
  return { el, sync };
}

/**
 * M-40: a long option name in two parts, its start and its end ("Project/Program/Product Management--" and
 * "Technical"), split at its last separator (" : ", "--", " - ", "/", ", ") or else its last space. Each part
 * keeps to one line (styles.css .check-part), so the end, which tells similar names apart, wraps under the start
 * instead of being cut; only a start longer than a line is cut. Names that would still look the same (the same
 * start and the same end, as Anduril's "Maritime & Maneuver Dominance : … - Engineering & Operations" rows) are
 * not cut at all: they wrap. The label's text is always the whole name (the checkbox's accessible name), and the
 * row's title has it for a mouse. Short names stay one plain text.
 */
const SPLIT_MIN = 19;
const SPLIT_SEEN = 15; // characters of a part that always show, down to the narrowest phone (280 px: about 24)
const LABEL_SEPS = [' : ', ' – ', ' — ', ' - ', '--', '/', ' | ', ', '];
function splitName(s) {
  if (s.length < SPLIT_MIN) return null;
  let cut = -1;
  for (const sep of LABEL_SEPS) {
    const i = s.lastIndexOf(sep);
    if (i > 0 && i + sep.length < s.length - 2) cut = Math.max(cut, i + sep.trimEnd().length);
  }
  if (cut < 0) cut = s.lastIndexOf(' ');
  if (cut <= 0) return null;
  const head = s.slice(0, cut).trimEnd();
  const rest = s.slice(head.length);
  const tail = rest.trimStart();
  return tail ? { head, gap: rest.slice(0, rest.length - tail.length), tail } : null;
}
/** Each name's label content in a list: its two parts, the whole name wrapping, or the plain name. */
function labelLayouts(names) {
  const splits = names.map(splitName);
  const sig = (p) => `${p.head.slice(0, SPLIT_SEEN)}|${p.tail.slice(0, SPLIT_SEEN)}`;
  const seen = new Map();
  for (const p of splits) if (p) seen.set(sig(p), (seen.get(sig(p)) || 0) + 1);
  return new Map(names.map((name, i) => {
    const p = splits[i];
    if (!p) return [name, { cls: '', parts: [name], long: false }];
    if (seen.get(sig(p)) > 1) return [name, { cls: ' is-wrap', parts: [name], long: true }];
    return [name, { cls: ' is-split', parts: [h('span', { class: 'check-part' }, p.head), p.gap, h('span', { class: 'check-part' }, p.tail)], long: true }];
  }));
}
/**
 * fix-phone-sizes (M-40 meets fix-data-3's names): a split name flows as one wrapping text when that keeps it whole in at
 * most two lines ("Non-Technical Project, Program and" / "Product Management"); on the narrowest phones in 13 px, then
 * 12 px, with tighter row gaps (styles.css .is-flow, .is-snug, .is-snugger). A name that needs more keeps its two
 * one-line parts. Measured after each render and when the list's width changes; the label's text, the checkbox's
 * name and the row's title stay the whole name.
 */
const FIT_STEPS = [['is-flow'], ['is-flow', 'is-snug'], ['is-flow', 'is-snugger']];
function fitCheckLabels(root) {
  let todo = [...root.querySelectorAll('.check-label.is-split')];
  for (const l of todo) l.classList.remove('is-flow', 'is-snug', 'is-snugger');
  if (!todo.length || !root.getBoundingClientRect().width) return;
  const fits = (l) => {
    const r = l.getBoundingClientRect();
    if (!r.width) return false;
    const cs = getComputedStyle(l);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const lines = Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh);
    return lines <= 2 && l.scrollWidth <= l.clientWidth + 0.5;
  };
  for (const step of FIT_STEPS) {
    for (const l of todo) l.classList.add(...step);
    const ok = todo.map(fits);
    todo = todo.filter((l, i) => { if (!ok[i]) l.classList.remove(...step); return !ok[i]; });
    if (!todo.length) break;
  }
}

/** How many options a facet has on the whole board (distinct keys), cached per board. */
const boardOptionCounts = new WeakMap();
function boardOptions(facet) {
  const jobs = data.jobs;
  let m = boardOptionCounts.get(jobs);
  if (!m) { m = new Map(); boardOptionCounts.set(jobs, m); }
  if (!m.has(facet)) {
    const keyOf1 = { d: deptKey, b: brandKey, s: senKey, e: empKey }[facet];
    const keys = new Set();
    for (const j of jobs) { if (facet === 'l') for (const k of j._locKeys || []) keys.add(k); else if (keyOf1) keys.add(keyOf1(j)); }
    m.set(facet, keys.size);
  }
  return m.get(facet);
}

function makeChecklist(facet, { searchable = 'auto', grouped = false, limit = 8, order = null, colorDim = null, labelOf = (k) => k, tipOf = null, note = null, label = null, labelledBy = null } = {}) {
  let query = '';
  let expanded = false;
  const input = h('input', { type: 'search', class: 'fsearch', placeholder: 'Search…', 'aria-label': 'Search options' });
  const searchWrap = h('div', { class: 'fsearch-wrap' }, h('span', { html: ICON.search }), input);
  // A-10: every checklist is a named group ("Company", "Department", "Location", …).
  const list = h('div', { class: 'checklist', role: 'group', 'aria-labelledby': labelledBy, 'aria-label': labelledBy ? null : label });
  const more = h('button', { type: 'button', class: 'link-btn more-btn' });
  const el = h('div', { class: 'checklist-wrap' }, searchWrap, list, more, note ? (typeof note === 'string' ? h('p', { class: 'fnote' }, note) : noteLine({ cls: 'fnote', ...note })) : null);
  input.addEventListener('input', () => { query = input.value.trim().toLowerCase(); sync(); });
  more.addEventListener('click', () => { expanded = !expanded; sync(); });
  list.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (cb) { focusKey = cb.value; toggleIn(facet, cb.value); }
  });
  let focusKey = null;

  function sync() {
    const counts = derived.fc?.[facet] || new Map();
    const selected = new Set(S[facet]);
    // BN-1 (fix-app-6): a place counts its own postings; those listed only for its country or state are beside them.
    const wideOf = facet === 'l' ? derived.fc?.lWide : null;
    let items = [...new Set([...counts.keys(), ...selected])].map((k) => { const w = wideOf?.get(k) || 0; return { key: k, count: (counts.get(k) || 0) - w, wide: w }; })
      .filter((it) => it.count > 0 || it.wide > 0 || selected.has(it.key));
    if (order) items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    else items.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    // BN-1 (fix-app-6): by the board's own options too, so the box doesn't vanish while filters narrow the list.
    const showSearch = searchable === true || (searchable === 'auto' && (items.length > 8 || boardOptions(facet) > 8));
    searchWrap.hidden = !showSearch;
    if (query && grouped) {
      // BP-6: a country ("Ireland", "Deutschland") lists its places; a local name ("München", "Zürich") its city.
      const m = placeMatcher(query, countryName);
      const country = (k) => { const g = derived.fc?.lGroup.get(k); return g && g !== 'ZZ' && g !== '~remote' ? g : null; };
      items = items.filter((it) => m(it.key, country(it.key)) || m(String(labelOf(it.key)), null));
    } else if (query) items = items.filter((it) => it.key.toLowerCase().includes(query) || String(labelOf(it.key)).toLowerCase().includes(query));
    const hadFocus = list.contains(document.activeElement) ? document.activeElement.value : focusKey;
    focusKey = null;

    const layouts = labelLayouts(items.map((it) => String(labelOf(it.key)))); // M-40
    const row = (it) => {
      const id = `f-${facet}-${btoa(unescape(encodeURIComponent(it.key))).replace(/[^a-z0-9]/gi, '')}-${uid}`;
      const name = String(labelOf(it.key));
      const lay = layouts.get(name);
      return h('label', { class: `check${it.count === 0 ? ' is-zero' : ''}`, for: id, title: tipOf?.(it.key) || (lay.long ? name : null) },
        h('input', { type: 'checkbox', id, value: it.key, checked: selected.has(it.key) }),
        h('span', { class: 'check-box', 'aria-hidden': 'true' }),
        colorDim && colorBy() === colorDim && it.key !== 'Remote' && !/^Remote/.test(it.key) ? h('span', { class: 'dot dot--sm', style: `--dot:${vizColor(it.key)}`, 'aria-hidden': 'true' }) : null,
        h('span', { class: `check-label${lay.cls}` }, ...lay.parts), it.wide
          ? h('span', { class: 'check-nums', title: `${plural(it.count, 'role')} listed for ${name}, and ${it.wide.toLocaleString()} listed only for its country or state, which picking ${name} finds too` },
            h('span', { class: 'check-count' }, it.count), h('span', { class: 'check-wide' }, `+${it.wide.toLocaleString()}`))
          : h('span', { class: 'check-count' }, it.count));
    };

    const nodes = [];
    let shown = 0;
    const cap = expanded || query ? Infinity : limit;
    if (grouped) {
      // I-6: the collapsed list shows the places with the most roles (London 47 before Austin 3),
      // still grouped by country; "Show all" lists every place.
      let pick = items;
      if (cap !== Infinity) {
        const top = new Set(items.filter((x) => !selected.has(x.key)).slice(0, cap));
        pick = items.filter((it) => selected.has(it.key) || top.has(it));
      }
      const groups = new Map();
      for (const it of items) {
        const g = derived.fc?.lGroup.get(it.key) || 'ZZ';
        if (!groups.has(g)) groups.set(g, { items: [], total: 0 });
        groups.get(g).total += it.count;
      }
      for (const it of pick) groups.get(derived.fc?.lGroup.get(it.key) || 'ZZ').items.push(it);
      // D-23: places with no known country ('ZZ', which Intl names "Unknown Region") go last, as "Other places".
      const rank = (g) => (g === '~remote' ? 0 : g === 'ZZ' ? 2 : 1);
      const ordered = [...groups].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].total - a[1].total);
      for (const [g, grp] of ordered) {
        if (!grp.items.length) continue;
        nodes.push(h('div', { class: 'check-group' }, g === '~remote' ? 'Remote' : g === 'ZZ' ? 'Other places' : countryName(g)));
        for (const it of grp.items) { nodes.push(row(it)); if (!selected.has(it.key)) shown++; }
      }
      shown += pick.filter((it) => selected.has(it.key)).length;
    } else {
      for (const it of items) { if (shown >= cap && !selected.has(it.key)) continue; nodes.push(row(it)); shown++; }
    }
    if (!items.length) nodes.push(h('p', { class: 'fnote' }, query ? 'No matches' : 'Nothing to filter'));
    list.replaceChildren(...nodes);
    fitCheckLabels(list); // fix-phone-sizes
    const hidden = items.length - shown;
    more.hidden = !(hidden > 0 || (expanded && items.length > limit)) || !!query;
    more.textContent = expanded ? 'Show fewer' : `Show all ${items.length}`;
    if (hadFocus) list.querySelector(`input[value="${cssId(hadFocus)}"]`)?.focus();
  }
  const uid = Math.random().toString(36).slice(2, 7);
  // fix-phone-sizes: refit the long names when the list gets a width (a sheet opening) or a new one (a rotation).
  if ('ResizeObserver' in window) {
    let fitW = 0;
    new ResizeObserver(rafThrottle(() => { const w = Math.round(list.getBoundingClientRect().width); if (w && w !== fitW) { fitW = w; fitCheckLabels(list); } })).observe(list);
  }
  return { el, sync };
}

/**
 * The Department section (filter panel and the Department chip's menu). google-grouping: on a board
 * that names more than one company (Google: YouTube, DeepMind, …), its companies come first, so one
 * subsidiary can be zoomed into without a new section (ROADMAP §8); departments read from job titles
 * say so in one line.
 */
let deptFilterSeq = 0;
function makeDeptFilter({ limit = 8 } = {}) {
  // A-10: the two lists are groups named by their headings (a hidden heading still names its list).
  const n = ++deptFilterSeq;
  const brandHead = h('div', { class: 'check-group', id: `dept-filter-${n}-b` }, 'Company');
  const deptHead = h('div', { class: 'check-group', id: `dept-filter-${n}-d` }, 'Department');
  const brands = makeChecklist('b', { limit: 6, searchable: false, colorDim: 'brand', labelledBy: brandHead.id });
  const depts = makeChecklist('d', { limit, colorDim: 'department', labelledBy: deptHead.id });
  const note = h('div', { class: 'fnote', dataset: { note: 'dept-basis' } });
  return {
    el: h('div', { class: 'dept-filter' }, brandHead, brands.el, deptHead, depts.el, note),
    sync() {
      const many = multiBrand() || S.b.length > 0;
      brandHead.hidden = deptHead.hidden = brands.el.hidden = !many;
      if (many) brands.sync();
      depts.sync();
      note.hidden = !deptFromTitles();
      if (note.hidden) note.replaceChildren(); else renderNote(note, { ...deptTitleLine(), key: 'fnote-dept' });
    },
  };
}

function makeRemote() {
  // BP-17: On-site is a role that isn't open to remote work, so Any = Remote + On-site.
  const opts = [['any', 'Any', null], ['remote', 'Remote', 'Roles open to remote work'], ['onsite', 'On-site', 'Roles not open to remote work']];
  const el = h('div', { class: 'seg seg--block', role: 'group', 'aria-label': 'Remote' });
  const btns = opts.map(([v, label, tip]) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'false', title: tip, onclick: () => set({ r: v }) }, h('span', null, label), h('span', { class: 'seg-count' }));
    el.append(b);
    return [v, b];
  });
  return {
    el,
    sync() {
      for (const [v, b] of btns) {
        b.setAttribute('aria-pressed', String(S.r === v));
        b.querySelector('.seg-count').textContent = derived.fc ? derived.fc.r[v] : '';
      }
    },
  };
}

/** "Listed" (F4): how long a role has been open, plus one checkbox to hide long-open roles. */
function makePosted() {
  const opts = [[0, 'Any time'], [7, 'Past week'], [30, 'Past month'], [90, 'Past 3 months']];
  const list = h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Listed' });
  const name = 'posted-' + Math.random().toString(36).slice(2, 7);
  const rows = opts.map(([v, label]) => {
    const input = h('input', { type: 'radio', name, value: v, onchange: () => set({ p: v }) });
    const count = h('span', { class: 'check-count' });
    list.append(h('label', { class: 'radio' }, input, h('span', { class: 'radio-dot', 'aria-hidden': 'true' }), h('span', { class: 'check-label' }, label), count));
    return [v, input, count];
  });
  const hide = h('input', { type: 'checkbox', onchange: () => set({ ho: hide.checked }) });
  const hideCount = h('span', { class: 'check-count' });
  const hideRow = h('label', { class: 'check' }, hide, h('span', { class: 'check-box', 'aria-hidden': 'true' }), h('span', { class: 'check-label' }, 'Hide roles open 180+ days'), hideCount);
  const empty = h('p', { class: 'fnote' }, 'Listing dates appear after a few daily runs.');
  const clear = h('button', { type: 'button', class: 'link-btn', onclick: () => set({ p: 0, ho: false }) }, 'Clear listing filter');
  return {
    el: h('div', null, list, hideRow, empty, clear),
    sync() {
      // No job carries an age yet (snapshots predate the history ledger): no options, just a note.
      const any = data.jobs.some((j) => j._age != null);
      list.hidden = hideRow.hidden = !any;
      empty.hidden = any;
      clear.hidden = any || !(S.p || S.ho);
      for (const [v, input, count] of rows) { input.checked = S.p === v; count.textContent = derived.fc ? derived.fc.p[v] : ''; }
      hide.checked = S.ho;
      hideCount.textContent = derived.fc?.p.old || 0;
    },
  };
}

const KW_CATS = [
  { cat: 'responsibilities', key: 'kr', title: 'Responsibilities', hint: 'What the work involves' },
  { cat: 'fit', key: 'kf', title: 'Fit', hint: 'What they look for' },
  { cat: 'skills', key: 'ks', title: 'Skills', hint: 'Tools & technologies' },
];

function makeCloud({ cat, key }, { limit = 14 } = {}) {
  let expanded = false;
  const cloud = h('div', { class: 'cloud' });
  const more = h('button', { type: 'button', class: 'link-btn more-btn' });
  const el = h('div', null, cloud, more);
  more.addEventListener('click', () => { expanded = !expanded; sync(); });
  cloud.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kw]');
    if (b) { refocus = b.dataset.kw; toggleIn(key, b.dataset.kw); }
  });
  let refocus = null;
  function sync() {
    const counts = derived.fc?.kw[cat] || new Map();
    const sel = S[key];
    const rest = [...counts].filter(([k]) => !sel.includes(k)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const items = [...sel.map((k) => [k, counts.get(k) || 0, true]), ...rest.map(([k, c]) => [k, c, false])];
    const shown = expanded ? items : items.slice(0, Math.max(limit, sel.length));
    const focusK = cloud.contains(document.activeElement) ? document.activeElement.dataset.kw : refocus;
    refocus = null;
    cloud.replaceChildren(...shown.map(([k, c, on]) => h('button', { type: 'button', class: 'kw', 'aria-pressed': String(on), dataset: { kw: k } },
      h('span', null, k), h('span', { class: 'kw-count' }, c))));
    if (!items.length) cloud.append(h('p', { class: 'fnote' }, 'No keywords for the current roles.'));
    more.hidden = items.length <= limit;
    more.textContent = expanded ? 'Show fewer' : `Show ${items.length - shown.length} more`;
    if (focusK) cloud.querySelector(`button[data-kw="${cssId(focusK)}"]`)?.focus();
  }
  return { el, sync };
}

const JUICE_GRADES = [
  ['Juicy', 'Plenty left after tax, rent and living costs (score 70+)'],
  ['Ripe', 'Comfortable margin (45–69)'],
  ['Dry', 'A thin margin or nothing left (under 45); Rind, nothing left, is counted here'],
];
/** Juice grade chips (OR within the group), with faceted counts. */
function makeJuiceChips() {
  const el = h('div', { class: 'cloud', role: 'group', 'aria-label': 'Juice grade' });
  const btns = JUICE_GRADES.map(([g, tip]) => {
    const b = h('button', { type: 'button', class: `kw kw--juice kw--${g.toLowerCase()}`, title: tip, 'aria-pressed': 'false', onclick: () => toggleIn('jg', g) },
      h('span', null, g), h('span', { class: 'kw-count' }));
    el.append(b);
    return [g, b];
  });
  const note = h('div', { class: 'fnote' });
  return {
    el: h('div', null, el, note),
    sync() {
      for (const [g, b] of btns) {
        b.setAttribute('aria-pressed', String(S.jg.includes(g)));
        b.querySelector('.kw-count').textContent = derived.fc?.jg.get(g) || 0;
      }
      const scored = data.jobs.filter((j) => j.juice).length;
      // M-39 (fix-phone-text): one line; what a score needs is behind its Details.
      renderNote(note, { key: 'fnote-juice', line: scored ? `${scored.toLocaleString()} of ${data.jobs.length.toLocaleString()} have a Juice Score` : 'No Juice Scores for this board yet',
        details: scored ? ['A Juice Score needs a salary and a known city.'] : [] });
    },
  };
}

function makeSwitch(label, key) {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', onchange: () => set({ [key]: input.checked }) });
  return { el: h('label', { class: 'switch-row' }, h('span', null, label), input), sync() { input.checked = !!S[key]; } };
}

let panel = null;
function renderFilterPanel() {
  const body = $('#filterBody');
  if (data.status === 'unknown') { // D-19: nothing is loading, so no skeleton
    panel = null;
    body.replaceChildren(h('p', { class: 'fnote' }, 'No filters: this board isn’t on this site.'));
    return;
  }
  if (data.status === 'error') { // UX-26: nothing is loading any more, so no skeleton
    panel = null;
    body.replaceChildren(h('p', { class: 'fnote' }, 'Filters appear when the roles load.'));
    return;
  }
  if (data.status !== 'ready') {
    if (!body.querySelector('.skeleton-stack')) {
      panel = null;
      body.replaceChildren(h('div', { class: 'skeleton-stack', 'aria-hidden': 'true' },
        ...[70, 40, 90, 55, 80, 35, 65].map((w) => h('div', { class: 'sk sk-line', style: `width:${w}%` }))));
    }
    return;
  }
  if (!panel) {
    const sel = (key) => h('span', { class: 'fsec-badge', dataset: { badge: key } });
    panel = [
      section('Salary', makeSalary(), { badge: sel('sal') }),
      section('Department', makeDeptFilter(), { badge: sel('d') }),
      section('Location', makeChecklist('l', { grouped: true, limit: 10, searchable: 'auto', colorDim: 'location', note: LOC_NOTE, label: 'Location' }), { badge: sel('l') }),
      section('Seniority', makeChecklist('s', { order: SENIORITY_SHOWN, limit: 10, colorDim: 'seniority', ...SEN_OPTS, label: 'Seniority' }), { badge: sel('s') }),
      section('Remote', makeRemote(), { badge: sel('r') }),
      ...KW_CATS.map((k) => section(k.title, makeCloud(k), { badge: sel(k.key) })),
      section('Employment type', makeChecklist('e', { limit: 6, labelOf: empLabel, label: 'Employment type' }), { open: false, badge: sel('e') }),
      section('Listed', makePosted(), { open: false, badge: sel('p') }),
    ];
    body.replaceChildren(...panel.map((s) => s.el));
  }
  for (const s of panel) s.sync();
  const counts = { sal: (S.smin != null || S.smax != null ? 1 : 0) + (S.so ? 1 : 0), d: S.d.length + S.b.length, l: S.l.length, s: S.s.length, r: S.r !== 'any' ? 1 : 0, kr: S.kr.length, kf: S.kf.length, ks: S.ks.length, e: S.e.length, p: (S.p ? 1 : 0) + (S.ho ? 1 : 0) };
  for (const b of body.querySelectorAll('[data-badge]')) {
    const n = counts[b.dataset.badge];
    b.textContent = n || '';
    b.hidden = !n;
  }
  $('#filtersDone').textContent = `Show ${plural(visible.length, 'role')}`;
}

/* ------------------------------------------------------------- popovers */

const popover = { id: null, anchor: null, parts: [] };

function popoverParts(id) {
  switch (id) {
    case 'salary': return [makeSalary({ compact: true })];
    case 'dept': return [makeDeptFilter({ limit: 12 })];
    case 'loc': return [makeChecklist('l', { grouped: true, limit: 14, note: LOC_NOTE, label: 'Location' })];
    case 'sen': return [makeChecklist('s', { order: SENIORITY_SHOWN, limit: 10, ...SEN_OPTS, label: 'Seniority' })];
    case 'remote': return [makeRemote()];
    case 'more': return [
      titled('Pay', makeSwitch('Only show roles with pay', 'so')),
      titled('Juice', makeJuiceChips(), 'What’s left after tax, rent and living'),
      titled('Employment type', makeChecklist('e', { limit: 6, labelOf: empLabel, label: 'Employment type' })),
      titled('Listed', makePosted()),
      ...KW_CATS.map((k) => titled(k.title, makeCloud(k, { limit: 10 }), k.hint)),
    ];
    case 'board': return [makeBoardForm()];
    case 'badge': return [makeBadgeDetails()];
    case 'company': return [makeCompanyMenu()];
  }
  return [];
}
function titled(title, part, hint) {
  return { el: h('div', { class: 'pop-sec' }, h('h3', null, title, hint ? h('span', null, hint) : null), part.el), sync: part.sync };
}

function togglePopover(id, anchor) {
  if (id in CHIP_SECTION && isMobile()) { closePopover(false, { keepHist: true }); openFiltersAt(id, anchor); return; }
  if (popover.id === id) return closePopover();
  closePopover(false, { keepHist: true }); // one overlay replaces another: it keeps the history entry
  const el = $('#popover');
  popover.id = id;
  popover.anchor = anchor;
  popover.parts = popoverParts(id);
  const title = { board: 'Add a company’s job board', badge: 'Where this data comes from', company: 'Choose a company or a saved search' }[id] || QUICK.find((q) => q.id === id)?.label;
  const head = h('div', { class: 'pop-head' }, h('h2', { id: 'popTitle' }, title),
    h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': 'Close', html: ICON.close, onclick: () => closePopover() }));
  const foot = ['board', 'badge', 'company'].includes(id) ? null : h('div', { class: 'pop-foot' },
    h('button', { type: 'button', class: 'link-btn', onclick: () => clearPopoverFacet(id) }, 'Reset'),
    h('button', { type: 'button', class: 'btn btn--primary btn--sm pop-done', onclick: () => closePopover() }, 'Done'));
  el.className = `popover popover--${id}`;
  el.setAttribute('aria-labelledby', 'popTitle');
  el.replaceChildren(...[head, h('div', { class: 'pop-body' }, ...popover.parts.map((p) => p.el)), foot].filter(Boolean));
  el.hidden = false;
  anchor?.setAttribute('aria-expanded', 'true');
  overlayHistPush(id);
  if (id === 'company') prefetchSaved();
  syncPopover();
  positionPopover();
  for (const p of popover.parts) p.reveal?.();
  // M-29: on a phone, focusing the company search would open the keyboard over the list on every open
  // (Android); the current company (else the first row) takes focus instead.
  if (id === 'company' && isMobile()) {
    requestAnimationFrame(() => (el.querySelector('.company-list .company-item[aria-current="true"]') || el.querySelector('.company-list .company-item'))?.focus({ preventScroll: true }));
    return;
  }
  // A-2: a popover with no field or button in its body (the data badge: a link and a hidden Refresh) takes
  // focus on its first link, else on its Close button, so it never leaves focus behind on the opener.
  requestAnimationFrame(() => ([...el.querySelectorAll('.pop-body input:not([type=range]), .pop-body button.kw, .pop-body select, .pop-body .range, .pop-body button:not(.icon-btn), .pop-body label.check input, .pop-body a[href]')]
    .find((x) => x.getClientRects().length && !x.closest('[hidden]')) || el.querySelector('.pop-head .icon-btn'))?.focus({ preventScroll: true }));
}

function clearPopoverFacet(id) {
  const patches = {
    salary: { smin: null, smax: null, so: false }, dept: { d: [], b: [] }, loc: { l: [] }, sen: { s: [] }, remote: { r: 'any' },
    more: { so: false, e: [], p: 0, ho: false, kr: [], kf: [], ks: [], jg: [] },
  };
  const aside = heldLabels(HELD_OF[id] || []);
  dropHeld(HELD_OF[id] || []);
  set(patches[id] || {});
  heldToast(aside); // BN-5
}

function syncPopover() {
  if (!popover.id) return;
  for (const p of popover.parts) p.sync?.();
  const done = $('#popover .pop-done');
  if (done) done.textContent = `See ${plural(visible.length, 'role')}`;
}

/**
 * B-8 (fix-ui-6): the screens side by side, [{ x, width }], or null for one screen: the browser's viewport segments, or
 * the Surface Duo's own two 540 px screens around its 34 px hinge when its browser reports none (styles.css: the same
 * media query, DUO_SPANNED).
 */
const DUO_SPANNED = '(pointer: coarse) and (min-width: 1104px) and (max-width: 1124px) and (orientation: landscape)';
function screenSegments() {
  const segs = window.viewport?.segments;
  if (segs?.length > 1) return segs;
  return matchMedia(DUO_SPANNED).matches ? [{ x: 0, width: 540 }, { x: 574, width: innerWidth - 574 }] : null;
}

function positionPopover() {
  const el = $('#popover');
  if (!popover.anchor || el.hidden) return;
  if (matchMedia('(max-width: 860px)').matches) { el.style.left = el.style.top = ''; return; }
  const r = popover.anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.top = `${r.bottom + 8}px`;
  // fix-phone-sizes: on a dual screen (the Surface Duo spanned) the popover stays on its control's screen, off the hinge.
  const segs = screenSegments();
  const seg = segs ? segs.find((s) => r.left < s.x + s.width) || segs[segs.length - 1] : { x: 0, width: innerWidth };
  el.style.left = `${Math.max(seg.x + 12, Math.min(r.left, seg.x + seg.width - w - 12))}px`;
}

function closePopover(restoreFocus = true, { keepHist = false } = {}) {
  if (!popover.id) return;
  if (!keepHist) overlayHistRelease();
  const anchor = popover.anchor;
  anchor?.setAttribute('aria-expanded', 'false');
  popover.id = null;
  popover.anchor = null;
  popover.parts = [];
  $('#popover').hidden = true;
  if (restoreFocus) anchor?.focus({ preventScroll: true });
}

/* ------------------------------------------------------- add-board form */

function makeBoardForm() {
  // I-3: plain words. The source is the job-board service the company's careers page uses, and the
  // "board slug" is the company's name in that board's web address.
  const source = h('select', { id: 'abSource', required: true },
    h('option', { value: 'greenhouse' }, 'Greenhouse (boards.greenhouse.io)'), h('option', { value: 'ashby' }, 'Ashby (jobs.ashbyhq.com)'), h('option', { value: 'lever' }, 'Lever (jobs.lever.co)'));
  const board = h('input', { id: 'abBoard', required: true, placeholder: 'e.g. stripe', pattern: '[A-Za-z0-9][A-Za-z0-9._\\-]*', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'abBoardHint' });
  const name = h('input', { id: 'abName', placeholder: 'e.g. Stripe', autocomplete: 'off' });
  const hint = h('p', { class: 'fnote', id: 'abBoardHint' });
  const updateHint = () => {
    const slug = board.value.trim() || 'name';
    hint.textContent = `The company’s name in its job-board address: ${{ greenhouse: `boards.greenhouse.io/${slug}`, ashby: `jobs.ashbyhq.com/${slug}`, lever: `jobs.lever.co/${slug}` }[source.value]}`;
  };
  source.addEventListener('change', updateHint);
  board.addEventListener('input', updateHint);
  updateHint();
  const saved = h('div', { class: 'saved-boards' });
  const form = h('form', { class: 'board-form', novalidate: true },
    h('p', { class: 'fnote board-intro' }, 'Add any company whose careers page runs on Greenhouse, Ashby or Lever. You can paste its job-board link.'),
    h('div', { class: 'field' }, h('label', { for: 'abSource' }, 'Source'), source),
    h('div', { class: 'field' }, h('label', { for: 'abBoard' }, 'Board slug'), board, hint),
    h('div', { class: 'field' }, h('label', { for: 'abName' }, 'Display name ', h('span', { class: 'muted' }, '(optional)')), name),
    h('button', { type: 'submit', class: 'btn btn--primary btn--block' }, 'Add & open board'),
    saved);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // A pasted job-board link picks its own source ("jobs.lever.co/acme" -> Lever, acme).
    const typedIn = board.value.trim();
    const host = typedIn.match(/^(?:https?:\/\/)?((?:job-)?boards\.greenhouse\.io|jobs\.ashbyhq\.com|jobs\.lever\.co)\/+/i);
    if (host) source.value = /greenhouse/i.test(host[1]) ? 'greenhouse' : /ashby/i.test(host[1]) ? 'ashby' : 'lever';
    const slug = (host ? typedIn.slice(host[0].length) : typedIn.replace(/^https?:\/\/[^/]+\//, '')).replace(/[/?#].*$/, '');
    if (!slug || !SLUG_RE.test(slug) || /^\.+$/.test(slug)) { board.setAttribute('aria-invalid', 'true'); board.focus(); hint.textContent = 'Enter the company’s name as it appears in its job-board address (letters, numbers, dashes).'; return; }
    const entry = { source: SOURCES.includes(source.value) ? source.value : 'greenhouse', board: slug, name: (name.value.trim() || slug.charAt(0).toUpperCase() + slug.slice(1)).slice(0, 80) };
    boards = [...boards.filter((b) => !(b.source === entry.source && b.board === entry.board)), entry];
    saveBoards(boards);
    closePopover(false);
    dropHeld();
    set({ c: `${entry.source}:${entry.board}`, cn: entry.name, job: null, ...resetFiltersPatch() });
    toast(`Added ${entry.name}`);
  });
  function sync() {
    saved.replaceChildren();
    if (!boards.length) return;
    saved.append(h('h3', null, 'Your boards'));
    for (const b of boards) {
      saved.append(h('div', { class: 'saved-board' },
        h('span', { class: 'dot', style: `--dot:${colorFor(b.board)}` }),
        h('span', { class: 'saved-name', title: `${SOURCE_LABEL[b.source]} board “${b.board}”` }, b.name),
        h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': `Remove ${b.name}`, html: ICON.trash, onclick: () => {
          boards = boards.filter((x) => x !== b);
          saveBoards(boards);
          if (S.c === `${b.source}:${b.board}`) set({ c: defaultCompany(), cn: '', job: null });
          else render();
        } })));
    }
  }
  return { el: form, sync };
}

/* ------------------------------------------------------------------ KPIs */

function renderKpis() {
  // One slim inline stats row: "111 roles · 86% show pay · $341K median · half between $277K and $405K"
  const el = $('#statsLine');
  renderTagline();
  if (data.status === 'loading' || data.status === 'idle') {
    el.replaceChildren(h('span', { class: 'sk sk-line', style: 'width:340px;display:inline-block' }));
    return;
  }
  if (data.status === 'error' || data.status === 'unknown') { el.replaceChildren(); return; }
  const listed = area ? derived.filtered.filter((j) => area.ids.has(j.id)) : derived.filtered;
  const st = stats(listed);
  const total = data.jobs.length;
  const pct = st.n ? Math.round((st.withSalary / st.n) * 100) : 0;
  const here = viewSpec?.l.size ? ' for the places you picked' : '';
  const item = (strong, rest, title, cls = '') => h('span', { class: `stat ${cls}`.trim(), title }, h('strong', null, strong), rest ? ' ' : null, rest || null);
  const ote = st.oteOnly ? 'on-target earnings, ' : '';
  const left = st.oteLeftOut ? `; ${plural(st.oteLeftOut, 'posting')} with on-target earnings (base plus commission) left out` : '';
  const share = st.top && st.n > 1 ? st.top[1] / st.n : 0;
  // MR-14: a board kept to a budget (salaried first) gives the whole board's share, not the kept postings' 100%.
  const capNote = cappedNote();
  const capWhole = capNote && capNote.salariedFirst && capNote.whole != null ? capNote : null;
  const onePlace = viewSpec?.l.size ? (viewSpec.l.size === 1 ? [...viewSpec.l][0] : 'these places') : '';
  // MR-39 (fix-mr-3): which country the median is for, when the pay in view is in more than one currency.
  // The line says it short ("(US)", "(euro area)"), so a filtered desktop line stays within fix-density's 12 words.
  const basisWhere = st.basis ? ` ${payBasisPlace(st.basis)}` : '';
  const basisTip = st.basis ? `; of the ${st.basisN.toLocaleString()} roles paid ${payBasisPlace(st.basis).replace(/^paid /, '')}, as the chart rows compare one country's pay; ${plural(st.basisLeft, 'role')} paid in other currencies left out` : '';
  // fix-density: one line (roles · share with pay · median); the rest in the list behind "Details" (viz/note.js).
  const line = [
    // BN-3 (fix-app-6): the word alone, never a localized number cut off ("3.821 3.821 roles" in de-DE).
    item(st.n.toLocaleString(), st.n === total ? (st.n === 1 ? 'role' : 'roles') : `of ${total.toLocaleString()} roles`, null, 'stat--count'),
    // P-6: with a Location filter, the share counts pay that applies there ("22% show pay for London").
    st.n ? item(capWhole ? `${capWhole.whole}%` : `${pct}%`, capWhole ? `of all ${capWhole.total.toLocaleString()} show pay`
      : capNote?.salariedFirst ? `of the ${capNote.kept.toLocaleString()} kept show pay` : onePlace ? tightWords([`show pay for ${onePlace}`, 'show pay']) : 'show pay',
      `${st.withSalary.toLocaleString()} of ${st.n.toLocaleString()} postings include a pay range${here}${here ? ' (pay posted only for other places or another country is not counted)' : ''}${capNote ? `. ${capNote.tip}` : ''}`, 'stat--share') : null,
    // BP-13: it says which pay the median is of; the chart's median uses the same set.
    // MR-39: with pay in several currencies, the median is the main one's and says where ("base pay median (US)").
    // BN-2 (fix-app-6): in the currency of the pay it is of (CA$101K over Canadian pay; MR-39's main currency when the
    // view mixes them), as the cards show it. BN-4: part-time hourly pay only is per hour, as posted; a median that is
    // partly a full-time year of part-time pay says so, and an annualised figure is never "posted pay".
    st.median != null ? medianItem(st,
      `Half of these roles pay more than this and half less (the middle of each posted range, ${ote || (st.notBaseOnly ? '' : 'base pay, ')}${medianUnitTip(st)}${here}${left}${basisTip})`) : null,
  ].filter(Boolean);
  // M-46 (fix-phone-text): a phone shows only the median, so with no pay in view its line said nothing but "Details".
  const noPay = st.n && st.median == null ? h('span', { class: 'stat stat--nopay' }, st.withSalary ? 'Too few with pay for a median' : 'No pay listed') : null;
  const details = [
    // Phones show the median only (the chart's notes line has the with/without counts), so the share is here too.
    st.n ? `${st.withSalary.toLocaleString()} of ${st.n.toLocaleString()} roles show pay${onePlace ? ` for ${onePlace}` : ''} (${pct}%)` : '',
    st.p25 != null && st.p75 != null && medianText(st.hm, st.local.p25) !== medianText(st.hm, st.local.p75) ? `Half of these roles pay between ${medianText(st.hm, st.local.p25)} and ${medianText(st.hm, st.local.p75)} (the middle of each posted range)` : '',
    // BN-4: "base pay" only when it is (MR-28's stated minimums, shift pay and part-time pay are not).
    st.median != null ? `The median is ${st.oteOnly ? 'on-target earnings' : st.notBaseOnly ? (st.perHour ? 'of part-time pay' : 'of posted pay') : 'base pay'}${basisWhere}, ${medianUnitTip(st)}${here}: half of these roles pay more, half less` : '',
    st.median != null && st.fullTime ? 'Part-time pay posted by the hour counts as a year if full-time (2,080 hours)' : '',
    // MR-39: the median compares one country's pay, as the chart rows do; the rest is counted, not pooled.
    st.median != null && st.basis ? `It is the median of the ${st.basisN.toLocaleString()} roles paid ${payBasisPlace(st.basis).replace(/^paid /, '')}; ${plural(st.basisLeft, 'role')} paid in other currencies ${st.basisLeft === 1 ? 'is' : 'are'} left out, so countries' pay is never pooled` : '',
    st.oteLeftOut ? `${plural(st.oteLeftOut, 'posting')} with on-target earnings (base plus commission) left out of the median` : '',
    // MR-28 (fix-viz-5): as the market comparisons say it (in Chart view the chart's notes say it, with the counts).
    S.m !== 'chart' && st.notBaseLeftOut ? `${plural(st.notBaseLeftOut, 'posting')} with a stated minimum, top shift pay or part-time pay left out of the median (not a base pay range)` : '',
    S.m !== 'chart' && st.notBaseOnly ? 'The median is of stated minimums, top shift pay or part-time pay: none of this pay is a base pay range' : '',
    here ? 'Each role counts at the range posted for the places you picked; pay posted only for other places or another country is not counted' : '',
    capNote ? capNote.tip : '',
    // P-6: "mostly" only for a real majority (it read "mostly Sales" at 19%).
    share > 0.5 ? `Mostly ${st.top[0]}: ${st.top[1].toLocaleString()} of ${st.n.toLocaleString()} roles (${Math.round(share * 100)}%)` : '',
    // MR-29 (fix-mr-3): where the departments are read (the chart rows, the cards): the board publishes none (Google).
    deptFromTitles() ? deptTitleLine().details[0] : '',
  ];
  // UX-57: in Chart view the stats line is its one line, and its facts are listed first in the chart notes'
  // Details (chart.setNotes), so the main view has one Details (ROADMAP §8). The map has no chart notes, so its
  // stats line keeps them; so does Insights.
  const fold = S.m === 'chart' && (!chart || typeof chart.setNotes === 'function');
  statsNotes = details;
  chart?.setNotes?.(fold ? details : []);
  renderNote(el, { line: [...line.flatMap((p, i) => (i ? [h('span', { class: 'stat-sep', 'aria-hidden': 'true' }, '·'), p] : [p])), noPay], details: fold ? [] : details, key: 'stats-line' });
  requestAnimationFrame(fitStatsLine);
}
let statsNotes = []; // UX-57: the stats line's facts, for the chart notes

/** BN-2, BN-4: "in Canadian dollars, as posted", "per hour, as posted", "in US dollars": what the stats line's median is in. */
function medianUnitTip(st) {
  if (st.perHour) return `per hour in ${currencyWords(st.cur)}, as posted`;
  return `in ${currencyWords(st.cur)}${st.cur === 'USD' ? '' : ', as posted'}${st.fullTime ? ', with part-time hourly pay as a year if full-time' : ''}`;
}
/**
 * BN-2, BN-4 (fix-app-6): the stats line's median: "CA$101K base pay median", "$28.41/hour posted pay median", or, when
 * part of it is a full-time year of part-time hourly pay, "$56K median, a year if full-time" (shorter where that would
 * wrap: fitOneLine). MR-39's "(US)" when the view mixes currencies.
 */
function medianItem(st, title) {
  // chart.js medianWording: the chart caption's words too. [long, short]: the short ones only where the line would wrap.
  const w = medianWording(st, 'line');
  const [long, short] = w.words.map((x) => `${x}${w.where}`);
  return h('span', { class: 'stat stat--median', title }, h('strong', null, w.value), ' ', tightWords(short !== long ? [long, short] : [long]));
}
/** A stats-line phrase with a shorter form for a line that would wrap: [long] or [long, short] -> text, or a span fitStatsLine fits. */
function tightWords([long, short]) {
  return short ? h('span', { class: 'stat-fit', dataset: { long, short } }, long) : long;
}
/**
 * BN-4 (fix-app-6): the stats line is one line. Where it would wrap (a desktop layout from 861 px with a long filter, e.g.
 * "10 of 4,851 roles · 100% show pay for these places · $28.50/hour posted pay median" at 932 px), the median's words
 * go short first ("$28.50/hour median"), then the pay share's ("100% show pay"). The long words stay in their tips.
 */
let statsRo = null;
function fitStatsLine() {
  const el = $('#statsLine');
  const line = el?.querySelector('.ms-note__line');
  if (!line) return;
  if (!statsRo && typeof ResizeObserver === 'function') {
    let w = -1;
    statsRo = new ResizeObserver(() => { const now = el.getBoundingClientRect().width; if (Math.abs(now - w) >= 0.5) { w = now; fitStatsLine(); } });
    statsRo.observe(el);
  }
  const lines = () => {
    const mids = [];
    for (const x of line.getClientRects()) { if (x.width < 0.5) continue; const m = Math.round(x.top + x.height / 2); if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m); }
    const r = document.createRange();
    r.selectNodeContents(line);
    for (const x of r.getClientRects()) { if (x.width < 0.5) continue; const m = Math.round(x.top + x.height / 2); if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m); }
    return mids.length;
  };
  // The text itself changes (as note.js fitLine does), so what the line says is what it shows.
  const set = (sel, which) => { for (const x of line.querySelectorAll(`${sel} .stat-fit`)) if (x.textContent !== x.dataset[which]) x.textContent = x.dataset[which]; };
  set('.stat', 'long');
  if (!line.getClientRects().length || lines() <= 1) return;
  set('.stat--median', 'short');
  if (lines() <= 1) return;
  set('.stat--share', 'short');
}

/** I-2: one line on what the site is ("Pay, and what's left after tax and rent, for 8 tech companies' open roles"). */
function renderTagline() {
  const el = $('#tagline');
  if (!el) return;
  const n = companies.filter((c) => !c.custom).length;
  // UX-23: the Beta tag by the logo says it is the beta site and links to the main site.
  const big = CHANNEL === 'beta' ? companies.filter((c) => c.live === false && !c.custom).map((c) => c.name) : [];
  const list = big.length > 1 ? `${big.slice(0, -1).join(', ')} and ${big[big.length - 1]}` : big[0];
  // fix-density: one line; a phone shows a shorter line than the desktop. B-11 (fix-ui-6, persona wave 2 I-1, 5 of 5):
  // the beta line said only what the beta adds ("Beta: adds 7 big-tech careers sites"), not what the site is for, so it
  // says that first, as the main site's line does; what the beta adds (the names) stays in its title.
  // fix-phone-text's guard: at most 12 words on the line (the Duo spanned gives it a row of its own, so the long one shows);
  // the number of companies is in its title.
  const text = big.length ? 'Job postings, their posted pay, and what’s left after tax and rent'
    : `Pay, and what’s left after tax and rent, for ${n ? `${n} companies’` : 'tech companies’'} open roles`;
  const short = big.length ? 'Job postings and their posted pay' : 'Tech pay, after tax and rent';
  if (el.dataset.text !== text) {
    el.dataset.text = text;
    el.title = big.length ? `Job postings and their posted pay, and what’s left after tax and rent, at ${n} companies. Beta: adds ${list} from their own careers sites` : text;
    el.replaceChildren(h('strong', { class: 'tagline-brand' }, 'melon·seek'), h('span', { class: 'tagline-sep', 'aria-hidden': 'true' }, ' · '),
      h('span', { class: 'tagline-long' }, text), h('span', { class: 'tagline-short' }, short),
      // fix-phone-text: the shortest line, for a box too narrow for the others (fitTagline).
      h('span', { class: 'tagline-tiny' }, big.length ? 'Jobs and their posted pay' : 'Pay after tax and rent'));
    requestAnimationFrame(fitTagline);
  }
  document.body.classList.toggle('is-filtered', activeFilterCount() > 0 || !!area);
}

/**
 * fix-phone-text: the tagline is never cut. Its longest line that fits shows: on a desktop the long one, else the
 * short one, else the shortest (at 1280x800 the beta line was 295 px of text in a 273 px box, "…"); on a phone the
 * short one, else the shortest (a folded Fold). If none fits it wraps. The full line is always the tagline's title.
 */
let taglineRo = null;
function fitTagline() {
  const el = $('#tagline');
  if (!el) return;
  if (!taglineRo && typeof ResizeObserver === 'function') {
    let w = -1;
    taglineRo = new ResizeObserver(() => { const now = el.getBoundingClientRect().width; if (Math.abs(now - w) >= 0.5) { w = now; fitTagline(); } });
    taglineRo.observe(el);
  }
  if (!el.getClientRects().length) return;
  const over = () => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const cs = getComputedStyle(el), box = el.getBoundingClientRect();
    return el.scrollWidth > el.clientWidth || r.getBoundingClientRect().width > box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.01;
  };
  const steps = matchMedia('(max-width: 860px)').matches ? ['', 'fit-tiny'] : ['', 'fit-short', 'fit-tiny'];
  el.classList.remove('fit-short', 'fit-tiny', 'fit-wrap');
  for (const c of steps) {
    el.classList.remove('fit-short', 'fit-tiny');
    if (c) el.classList.add(c);
    if (!over()) return;
  }
  el.classList.add('fit-wrap');
}

/* ------------------------------------------------------------------- viz */

let chart = null;
let map = null;
let comp = null;      // Compstimate widget (insights mode)
let insights = null;  // Market insights panel (insights mode)
let dataSeq = 0;      // bumps on every successful fetch
const featSig = { comp: -1, ins: '', comps: '' };
let mapFitPending = true;
let colorKeys = new Set(); // keys the chart gives a slot; others render as Other
const vizSig = { chart: '', map: '' };
let vizError = null;

function ensureViz() {
  try {
    if (S.m === 'chart' && !chart) {
      chart = createChart($('#chartHost'), {
        onSelect: (job) => job && openDrawer(job.id),
        onHover: (job) => hoverFromViz(job),
        onClusterSelect: (jobs, label) => setArea('cluster', jobs, label),
      });
      chart.setNotes?.(statsNotes); // UX-57
    }
    if (S.m === 'map' && !map) {
      // Leaflet (~150 KB) loads on first Map open, not at startup (PERF-3).
      if (typeof L === 'undefined') {
        if (!leafletWaiting) {   // chain once onto the (possibly idle-prefetched) load
          leafletWaiting = true;
          vizError = null;
          loadLeaflet().then(scheduleRender, (err) => { vizError = err; scheduleRender(); }).finally(() => { leafletWaiting = false; });
        }
        return;
      }
      map = createMap($('#mapHost'), {
        onSelect: (job) => job && openDrawer(job.id),
        onAreaSelect: (jobs, label) => setArea('map', jobs, label),
        colorMode: S.mc,
        onColorModeChange: (mode) => set({ mc: mode }), // D-14: kept in the hash like the other view settings
      });
    }
    vizError = null;
  } catch (err) {
    console.error(err);
    vizError = err;
  }
}

let leafletLoading = null;
let leafletWaiting = false;
function loadLeaflet() {
  return leafletLoading ||= new Promise((resolve, reject) => {
    const css = h('link', { rel: 'stylesheet', href: new URL('./vendor/leaflet/leaflet.css', import.meta.url).href });
    document.head.insertBefore(css, document.querySelector('link[href$="viz/viz.css"]')); // viz/app overrides still win
    const js = h('script', { src: new URL('./vendor/leaflet/leaflet.js', import.meta.url).href });
    js.addEventListener('load', () => resolve());
    js.addEventListener('error', () => { leafletLoading = null; js.remove(); reject(new Error('The map library (Leaflet) failed to load.')); });
    document.head.append(js);
  });
}

// Insights' panel module loads on first Insights open (it is not needed for the chart or map).
let createInsights = null;
let insightsLoading = null;
let idlePrefetched = false;
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(() => fn(), { timeout: 4000 }) : setTimeout(fn, 1500));
function loadInsights() {
  insightsLoading ||= import('./features/insights.js')
    // Re-render only if Insights is showing: a prefetch must not rebuild the list (and drop focus).
    .then((m) => { createInsights = m.createInsights; if (S.m === 'insights') scheduleRender(); })
    .catch((err) => { insightsLoading = null; console.error('insights module failed', err); });
}

/** Insights mode: Compstimate (all jobs of the company) + market insights (filtered vs. all). */
function renderInsights() {
  const host = $('#insightsHost');
  host.hidden = S.m !== 'insights' || data.status !== 'ready';
  if (host.hidden) return;
  for (const j of data.jobs) famOf(j); // Compstimate and the comps card read every family (fillFamilies may not be done)
  const ids = derived.filtered.map((j) => j.id).join(',');
  try {
    if (!comp) comp = createCompstimateWidget($('#compHost'), { onSelect: (job) => job && openDrawer(job.id) });
    if (!insights) { if (createInsights) insights = createInsights($('#insightsPanel'), { onFilter: onInsightFilter }); else loadInsights(); }
    // Compstimate task force spec (docs/process/compstimate-taskforce.md §3.2): the widget follows
    // the role-defining filters until the user edits a field; it re-estimates only when its own
    // signature changes, so salary/sort/drawer changes cost nothing (Rule 10).
    comp.setContext({ board: data.jobs, visible: compVisible(), company: data.company?.name || S.c, meta: data.meta, asOf: data.fetchedAt,
      filters: { d: S.d, rf: S.rf, l: S.l, r: S.r, s: S.s } });
    ensureCompMeta();
    // P-6: with a location filter, pay figures use only pay posted for those places (payLocations).
    const sig = `${dataSeq}|${derived.filtered.length}|${ids}|${S.l.join('|')}`;
    if (insights && featSig.ins !== sig) { featSig.ins = sig; insights.update(derived.filtered, data.jobs, { asOf: data.fetchedAt, places: S.l }); }
  } catch (err) { console.error('insights failed', err); }
  // F1: "Compare companies" card (third Insights card), once product's comps module and market data exist.
  // I-8: it follows the view: the role-family and level filters, else the roles in view.
  const cardHost = $('#compsCardHost');
  const compsSig = `${dataSeq}|${S.c}|${S.rf}|${S.s.join('|')}|${S.l.join('|')}|${ids}`;
  if (featSig.comps !== compsSig) {
    featSig.comps = compsSig;
    const view = { company: S.c, jobs: data.jobs, visible: derived.filtered, filters: { rf: S.rf, s: S.s.slice(), l: S.l.slice() } };
    loadMarket().then((market) => {
      if (!market) { cardHost.hidden = true; return; }
      try {
        if (!compsCard) compsCard = createCompsCard(cardHost, { onPickCompany: (slug, filters) => pickCompany(slug, filters) });
        compsCard.update(market, view);
        cardHost.hidden = false;
      } catch (err) { console.warn('createCompsCard failed', err); cardHost.hidden = true; }
    });
  }
}
let compsCard = null;

/** Map an insights click ({type, value}) onto the matching filter toggle. */
function onInsightFilter({ type, value } = {}) {
  if (value == null) return;
  const key = { skill: 'ks', responsibility: 'kr', fit: 'kf', department: 'd', location: 'l' }[type];
  if (!key) return;
  if (type === 'location' && /^remote$/i.test(value)) { set({ r: S.r === 'remote' ? 'any' : 'remote' }); toast(S.r === 'remote' ? 'Showing remote roles' : 'Removed remote filter'); return; }
  toggleIn(key, value);
  toast(S[key].includes(value) ? `Filtering by “${value}”` : `Removed “${value}”`);
}

/**
 * B-12 and B-10 (fix-ui-6, persona wave 2): the phone's results sheet peeks as far as the first card's pay (its title
 * first, and the pay under it where a narrow card puts it there: the 280 px Fold), measured from the card itself, since
 * the grip, the count row, the Juice line and the card's title differ by size and visit; styles.css's --sheet-peek
 * stands until a card is there. With few roles the peek also rises into the room the chart's rows leave (10 roles in 5
 * rows left half the screen blank), never above half the screen, and comes back down when the rows need it. A
 * body-level --sheet-peek, so the chart's box follows; the map and landscape keep the stylesheet's. Written only when it
 * changes by 4 px or more (a write restyles the page).
 */
let sheetPeekSet = null;
function fitSheet() {
  // Measured at the peek only: a raised sheet can show more above the first card (the cover screen's Juice line).
  if (sheetPeekSet != null && /^(half|full)$/.test(document.body.dataset.sheet || '') && S.m !== 'map') return;
  let peek = null;
  const phoneSheet = isMobile() && !matchMedia('(max-height: 500px) and (orientation: landscape), (vertical-viewport-segments: 2)').matches;
  const sheet = $('#results');
  const card = $('#resultsList .card[data-id], #resultsList .card[data-preview-id]');
  if (phoneSheet && S.m !== 'map' && sheet && card) {
    const mark = card.querySelector('.card-pay .sal-pill') || card.querySelector('.card-title');
    const sr = sheet.getBoundingClientRect(), mr = mark.getBoundingClientRect();
    const tr = card.querySelector('.card-title')?.getBoundingClientRect();
    if (mr.height && sr.height) {
      peek = Math.max(64, Math.ceil(Math.max(mr.bottom, tr ? Math.min(tr.bottom, tr.top + 24) : 0) - sr.top + 4));
      const host = $('#chartHost');
      const scroll = host?.querySelector('.ms-chart__scroll'), sticky = host?.querySelector('.ms-chart__sticky'), body = host?.querySelector('.ms-chart__body');
      const h = body ? parseFloat(body.style.height) : NaN;
      if (S.m === 'chart' && data.status === 'ready' && visible.length && !host.hidden && scroll?.clientHeight && Number.isFinite(h) && h > 0) {
        // The scroll box's height at a peek of X is its height now plus (the peek now - X).
        const now = parseFloat(getComputedStyle(document.body).getPropertyValue('--sheet-peek')) || 0;
        const fits = scroll.clientHeight + now - (sticky?.offsetHeight || 0) - h - 8;
        const half = Math.round(innerHeight * 0.5);
        if (fits - peek >= 32) peek = Math.max(peek, Math.min(half, Math.floor(fits)));
      }
    }
  }
  if (peek == null) {
    if (sheetPeekSet != null) { sheetPeekSet = null; document.body.style.removeProperty('--sheet-peek'); }
    return;
  }
  if (sheetPeekSet != null && Math.abs(peek - sheetPeekSet) < 4) return;
  sheetPeekSet = peek;
  document.body.style.setProperty('--sheet-peek', `${peek}px`);
}
const fitSheetSoon = rafThrottle(() => fitSheet());

function renderViz() {
  fitSheetSoon(); // B-10, B-12: after this update has drawn
  renderInsights();
  $('#vizArea').hidden = S.m === 'insights' && data.status === 'ready';
  if (S.m === 'insights' && data.status === 'ready') { $('#vizControls').hidden = true; return; }
  // Phones: the full-screen filter sheet hides the chart/map, so each filter tap skips the
  // (expensive) viz update; setFiltersOpen(false) renders it once when the sheet closes.
  if (data.status === 'ready' && (S.m === 'chart' ? chart : map) && isMobile() && document.body.classList.contains('filters-open')) { vizCovered = true; return; }
  const chartHost = $('#chartHost');
  const mapHost = $('#mapHost');
  const overlay = $('#vizOverlay');
  const wasHidden = mapHost.hidden;
  chartHost.hidden = S.m !== 'chart';
  mapHost.hidden = S.m !== 'map';
  $('#vizControls').hidden = S.m !== 'chart';
  syncGroupSelect();
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === S.v));

  overlay.hidden = true;
  overlay.className = 'viz-overlay';

  if (data.status === 'loading' || data.status === 'idle') {
    overlay.hidden = false;
    overlay.classList.add('is-loading');
    overlay.replaceChildren(h('div', { class: 'chart-skeleton', 'aria-label': 'Loading roles', role: 'status' },
      ...Array.from({ length: 18 }, (_, i) => h('div', { class: 'sk sk-bar', style: `margin-left:${8 + ((i * 37) % 45)}%;width:${14 + ((i * 53) % 22)}%` }))));
    return;
  }
  // D-47 (fix-qa4): a board that isn't on the site, fails to load or has no roles draws nothing, so the previous
  // board's chart or map is hidden (out of sight and of the accessibility tree), not left faded behind the message.
  // The next board that loads shows its own again (the hidden flags above, and a new vizSig).
  const noBoard = () => { chartHost.hidden = true; mapHost.hidden = true; };
  if (data.status === 'error') {
    noBoard();
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ icon: ICON.alert, title: 'Couldn\u2019t load this board', body: data.error || 'Unknown error', action: ['Retry', () => loadJobs()], tone: 'error' }));
    return;
  }
  if (data.status === 'unknown') {
    noBoard();
    overlay.hidden = false;
    overlay.replaceChildren(stateCard(notHereState()));
    return;
  }
  const jobs = derived.filtered;

  if (!data.jobs.length) {
    noBoard();
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ title: 'No open roles on this board', body: 'Try another company from the menu.' }));
    return;
  }
  if (!jobs.length) {
    // P-16: one opaque message that names the real cause (the chart's own empty note stays covered).
    overlay.hidden = false;
    overlay.classList.add('is-empty');
    overlay.replaceChildren(stateCard(emptyState()));
  }

  ensureViz();
  const inst = S.m === 'chart' ? chart : map;
  if (!inst && S.m === 'map' && leafletLoading && !vizError) { // Leaflet still loading: keep the skeleton up
    overlay.hidden = false;
    overlay.classList.add('is-loading');
    overlay.replaceChildren(h('div', { class: 'chart-skeleton', 'aria-label': 'Loading the map', role: 'status' }));
    return;
  }
  if (!inst) {
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ icon: ICON.alert, title: `${S.m === 'chart' ? 'Chart' : 'Map'} unavailable`, body: vizError ? String(vizError.message || vizError) : 'The visualization module failed to load.', tone: 'error' }));
    return;
  }
  if (S.m === 'map' && wasHidden) { try { map.invalidateSize(); } catch { /* ignore */ } }
  // BP-2 (fix wave 3): the chart plots, and the map pins, only pay and places that the Location
  // filter picked (payLocations); placeTest is this file's own match, so disambiguated keys
  // ("Cambridge, MA") and country-wide postings count as they do in the list.
  const F = viewSpec;
  const places = S.l.length ? S.l : null;
  const placeTest = places && F ? (j, l) => locMatches(j, F, [l]) : null;
  const sig = jobs.map((j) => j.id).join(',') + (S.m === 'chart' ? `|${S.v}|${groupBy()}` : `|${S.mc}|${juiceHousehold}`) + `|${S.l.join('|')}`;
  if (vizSig[S.m] !== sig) {
    vizSig[S.m] = sig;
    try {
      if (S.m === 'chart') chart.update(jobs, { view: S.v, groupBy: groupBy(), colorBy: colorBy(), places, placeTest });
      // Fit once per company load (map.js pads by half a pin, lowers minZoom as needed and
      // waits for a hidden container to be sized), and when the Location filter changes;
      // other updates keep the user's viewport.
      else if (mapFitPending) { mapFitPending = false; map.update(jobs, { fit: true, colorMode: S.mc, places, placeTest }); }
      else map.update(jobs, { colorMode: S.mc, places, placeTest });
      if (S.m === 'map') map.setJuiceNote?.(juiceSpanText(jobs.map((j) => j.juice && j.juice.best).filter(Boolean)));
    } catch (err) { console.error('viz update failed', err); }
  }
  highlightViz();
}

/** Colour follows the grouping (department when ungrouped), so the chart has a single colour story. */
const colorBy = () => (groupBy() === 'none' ? 'department' : groupBy());

/**
 * google-grouping: the Group select offers Company only on a board that names more than one, and its
 * Department option says when departments are read from job titles.
 */
function syncGroupSelect() {
  const sel = $('#groupBy');
  let opt = sel.querySelector('option[value="brand"]');
  const many = data.status === 'ready' && multiBrand();
  if (many && !opt) sel.querySelector('option[value="department"]').after(opt = h('option', { value: 'brand' }, 'Company'));
  else if (!many && opt) opt.remove();
  const tip = deptFromTitles() ? deptTitleNote() : '';
  sel.querySelector('option[value="department"]').title = tip;
  sel.title = groupBy() === 'department' ? tip : '';
  sel.value = groupBy();
}

function computeColorKeys(jobs) {
  const dim = colorBy();
  const counts = new Map();
  for (const j of jobs) if (j._usd) { const k = keyOf(j, dim); counts.set(k, (counts.get(k) || 0) + 1); }
  setColorKeys(counts);
}
/** The colour keys for `counts` (key -> postings with pay): the most common get the chart's slots. */
function setColorKeys(counts) {
  colorKeys = new Set();
  const ordered = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || String(a).localeCompare(String(b)));
  const top = ordered.length > SLOT_COUNT ? ordered.slice(0, SLOT_COUNT - 1) : ordered;
  assignColors(top); // same (sticky) slots the chart assigns, so list/filter dots match its legend
  colorKeys = new Set(top);
}

/** Color a job / key the same way the chart does under the current "Color by". */
function vizColor(key) {
  return colorKeys.has(key) ? colorFor(key) : otherColor();
}

function clearChartSelection() { try { chart?.clearSelection?.(); } catch { /* ignore */ } }
/** Drop the map-area / cluster narrowing (and the chart's selected bin with it). */
function clearArea() {
  if (area?.kind === 'cluster') clearChartSelection();
  area = null;
}
/** D-7: a cluster only exists in one grouping and view; regrouping or switching view drops it. */
function dropClusterArea() { if (area?.kind === 'cluster') clearArea(); }

/** Narrow the results list to a map area or chart cluster (replaces any previous one). */
function setArea(kind, jobs, label) {
  if (!jobs?.length) return;
  if (area?.kind === 'cluster' && kind !== 'cluster') clearChartSelection();
  area = { kind, label: label || (kind === 'map' ? 'Selected area' : 'Selected cluster'), ids: new Set(jobs.map((j) => j.id)) };
  resultsLimit = PAGE;
  scheduleRender();
  if (isMobile()) setSheet(true);
}

function highlightViz() {
  const inst = S.m === 'chart' ? chart : map;
  try { inst?.highlight(hoverId ?? drawerJobId ?? null); } catch { /* ignore */ }
}

function hoverFromViz(job) {
  hoverId = job?.id ?? null;
  for (const c of document.querySelectorAll('.card.is-hot')) c.classList.remove('is-hot');
  if (hoverId) $(`.card[data-id="${cssId(hoverId)}"]`)?.classList.add('is-hot');
}

/* P-16: what an empty result is blocked by. Each facet: [label, patch]. */
const FACET_OFF = {
  q: () => [`the search “${S.q}”`, { q: '' }],
  sal: () => ['the pay filter', { smin: null, smax: null, so: false }],
  d: () => ['the department filter', { d: [] }],
  b: () => ['the company filter', { b: [] }],
  l: () => ['the location filter', { l: [] }],
  s: () => ['the level filter', { s: [] }],
  e: () => ['the employment type filter', { e: [] }],
  r: () => [`the ${S.r === 'remote' ? 'Remote' : 'On-site'} filter`, { r: 'any' }],
  p: () => ['the listing date filter', { p: 0, ho: false }],
  rf: () => [`the role filter (${FAMILY_LABEL[S.rf] || S.rf})`, { rf: '' }],
  jg: () => ['the Juice filter', { jg: [] }],
  kw: () => ['the keyword filters', { kr: [], kf: [], ks: [] }],
};
function activeFacets(st = S) {
  const on = [];
  if (st.q) on.push('q');
  if (st.smin != null || st.smax != null || st.so) on.push('sal');
  for (const k of ['d', 'b', 'l', 's', 'e']) if (st[k].length) on.push(k);
  if (st.r !== 'any') on.push('r');
  if (st.p || st.ho) on.push('p');
  if (st.rf) on.push('rf');
  if (st.jg.length) on.push('jg');
  if (st.kr.length || st.kf.length || st.ks.length) on.push('kw');
  return on;
}
/** "a, b and c". */
const andList = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '');
const dropFacet = (f) => () => { const [, patch] = FACET_OFF[f](); if ('q' in patch) $('#search').value = ''; set(patch); };
/** { title, body, action } for an empty result: the one filter to blame, or the one whose removal helps most. */
function emptyState() {
  const on = activeFacets();
  const only = derived.fc?.only || {};
  const why = derived.fc?.salWhy || { none: derived.fc?.noPayHidden || 0, elsewhere: derived.fc?.elsewhereHidden || 0, under: 0, over: 0 };
  const noPay = why.none, elsewhere = why.elsewhere;
  const payNote = [why.under ? `${plural(why.under, 'role')} whose posted pay is all under ${boundText('min')} a year ${why.under === 1 ? 'is' : 'are'} hidden by the pay filter.` : '',
    why.over ? `${plural(why.over, 'role')} whose posted pay is all over ${boundText('max')} a year ${why.over === 1 ? 'is' : 'are'} hidden by the pay filter.` : '',
    noPay ? `${plural(noPay, 'role')} that ${noPay === 1 ? 'lists' : 'list'} no pay ${noPay === 1 ? 'is' : 'are'} hidden by the pay filter.` : '',
    elsewhere ? `${plural(elsewhere, 'role')} whose pay is posted for another country ${elsewhere === 1 ? 'is' : 'are'} hidden by the pay filter.` : ''].filter(Boolean);
  if (on.length === 1) {
    const f = on[0];
    const [label] = FACET_OFF[f]();
    if (f === 'q') return { title: `No roles match “${S.q}”`, body: 'Check the spelling, or try another word.', action: ['Clear the search', dropFacet('q')] };
    if (f === 'sal') return { title: 'No roles in this pay range', body: 'Try a wider range.', details: payNote, action: ['Remove the pay filter', dropFacet('sal')] };
    return { title: 'No roles match', body: `Nothing here fits ${label}.`, action: [`Remove ${label}`, dropFacet(f)] };
  }
  // BN-6 (fix-app-6): every filter that alone empties the list is named (the pay filter included), the one whose
  // removal brings back the most first; the line is fitted to one line, with every count behind Details.
  const blockers = on.filter((f) => only[f] > 0).sort((a, b) => only[b] - only[a]);
  const best = blockers[0];
  if (best) {
    const [label] = FACET_OFF[best]();
    const labels = blockers.map((f) => FACET_OFF[f]()[0]);
    const without = blockers.map((f, i) => `without ${labels[i]}: ${plural(only[f], 'role')}`);
    const first = `Without ${label}: ${plural(only[best], 'role')}.`;
    const body = blockers.length === 1 ? first : fitOneLine(h('span'), [
      `${without.join('; ').replace(/^w/, 'W')}.`,
      `Without ${label}: ${plural(only[best], 'role')}; or remove ${andList(labels.slice(1))}.`,
      `Blocked by ${andList(labels)}.`,
      `Blocked by ${andList(labels.map((x) => x.replace(/^the | filter$| “.*”$/g, '')))}.`]);
    const details = [...(blockers.length > 1 ? without.map((x) => `${x[0].toUpperCase()}${x.slice(1)}.`) : []), ...(blockers.includes('sal') ? payNote : [])];
    return { title: 'No roles match every filter', body, details: details.length ? details : null, action: [`Remove ${label}`, dropFacet(best)] };
  }
  return { title: 'No roles match', body: 'Nothing fits every filter you’ve set.', action: ['Clear filters', clearFilters] };
}

/**
 * D-35: a beta board opened on the main site (a link with /beta/ dropped, an old bookmark). The main site's
 * own files never name a beta company (scripts/build-static.js#betaLeaks), so the beta copy's company list
 * is read on demand; when it lists the board, the message links to it there, keeping the rest of the link.
 */
const BETA_DIR = 'beta'; // the beta copy's folder under the main site (scripts/build-static.js)
function findOnBeta(slug, seq) {
  if (CHANNEL !== 'stable' || !api.isStatic?.() || !slug || isCustomKey(slug)) return;
  // The link is made only after the beta copy has answered, so a build without one never shows it.
  fetch(`${BETA_DIR}/api/companies.json`).then((r) => (r.ok ? r.json() : null)).then((list) => {
    const c = Array.isArray(list) ? list.find((x) => x && x.slug === slug) : null;
    if (!c || seq !== loadSeq || data.status !== 'unknown') return;
    data = { ...data, onBeta: { name: c.name || slug, href: `${BETA_DIR}/${location.hash || `#c=${encodeURIComponent(slug)}`}` } };
    render();
  }).catch(() => { /* no beta copy here: the plain message stays */ });
}

/** D-19 / M-22: the plain message for a company this site doesn't list (no Offline, no Retry). */
function notHereState() {
  const name = data.company?.name || S.c;
  if (data.onBeta) {
    // D-35, keeping D-19's plain message and its way to the company menu.
    return {
      title: 'This board isn’t on this site',
      body: `${data.onBeta.name} is on melon·seek’s beta site.`,
      link: [`Open ${data.onBeta.name} on the beta site`, data.onBeta.href],
      action: ['Choose a company', () => togglePopover('company', $('#companyMenuBtn'))],
    };
  }
  return {
    title: 'This board isn\u2019t on this site',
    body: `${name} isn\u2019t listed here. Choose a company from the menu.`,
    action: ['Choose a company', () => togglePopover('company', $('#companyMenuBtn'))],
  };
}

let stateSeq = 0;
function stateCard({ icon = null, title, body, details = null, action = null, link = null, tone = '' }) {
  // fix-density: one short body line; a caveat (roles a pay filter hides) goes behind "Details" (viz/note.js).
  // A-9 (fix-phone-text): that Details is described by the card's title.
  const hid = `state-title-${++stateSeq}`;
  const more = details && details.filter(Boolean).length ? noteLine({ cls: 'state-note', details, key: `state:${title}`, about: hid }) : null;
  return h('div', { class: `state-card ${tone ? `state-card--${tone}` : ''}` },
    icon ? h('div', { class: 'state-ico', html: icon }) : h('div', { class: 'state-ico state-ico--melon' }, h('img', { src: 'favicon.svg', alt: '' })),
    h('h3', { id: hid }, title), body ? h('p', null, body) : null, more,
    action ? h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: action[1] }, action[0]) : null,
    link ? h('a', { class: 'btn btn--primary btn--sm', href: link[1] }, link[0]) : null);
}

/* --------------------------------------------------------------- results */

let newestOpt = null, bestOpt = null;
function renderResults() {
  const list = $('#resultsList');
  const title = $('#resultsTitle');
  fitSheetSoon(); // B-12: the peek follows the first card, once this render has drawn it
  // D-11: "Newest" is only offered when some loaded role has a listing date (removed, not just hidden:
  // a hidden <option> is still reachable by keyboard on some platforms).
  const sortSel = $('#sortBy');
  newestOpt ??= sortSel.querySelector('option[value="newest"]');
  const dated = data.status !== 'ready' || hasListingDates();
  if (dated && !newestOpt.isConnected) sortSel.querySelector('option[value="title"]').before(newestOpt);
  else if (!dated && newestOpt.isConnected) newestOpt.remove();
  // P-4: "Best match" is offered (and is the default) only while searching.
  bestOpt ??= h('option', { value: 'best' }, 'Best match');
  if (hasQuery() && !bestOpt.isConnected) sortSel.prepend(bestOpt);
  else if (!hasQuery() && bestOpt.isConnected) bestOpt.remove();
  sortSel.value = effectiveSort();
  if ((data.status !== 'ready' && !previewing()) || !visible.length) { win.sig = ''; win.more = null; listIO?.disconnect(); listIO = null; win.previewIds = null; }
  // UX-39 (fix-phone-sizes): while the preview shows, a phone's peeking sheet rises to show its first card
  // (styles.css body.is-previewing); half and full stay where the user put them. Off again when the list lands.
  document.body.classList.toggle('is-previewing', previewing());
  if (previewing()) {
    title.textContent = `Loading ${plural(preview.total, 'role')}…`;
    list.setAttribute('aria-busy', 'true');
    visible = preview.jobs;
    win.sig = `preview|${visible.length}`;
    win.previewIds = visible.map((j) => j.id);
    measureCardFit();
    buildWindow(list);
    return;
  }
  list.removeAttribute('aria-busy');
  if (data.status === 'loading' || data.status === 'idle') {
    title.textContent = 'Loading roles…';
    list.replaceChildren(...Array.from({ length: 7 }, () => h('li', { class: 'card card--sk', 'aria-hidden': 'true' },
      h('div', { class: 'sk sk-line', style: 'width:72%' }), h('div', { class: 'sk sk-line', style: 'width:48%' }), h('div', { class: 'sk sk-line', style: 'width:30%' }))));
    return;
  }
  // UX-26: one message, by the chart (with its Retry); the list only says it has nothing to show.
  if (data.status === 'error') {
    title.textContent = 'No roles';
    list.replaceChildren(h('li', { class: 'list-empty' }, h('p', { class: 'fnote' }, 'No roles to show.')));
    return;
  }
  if (data.status === 'unknown') {
    title.textContent = 'No roles';
    list.replaceChildren(h('li', { class: 'list-empty' }, h('p', { class: 'fnote' }, 'No roles to list.'))); // the message is by the chart
    return;
  }
  const n = visible.length;
  const m = queryMatchers(S.q);
  // M-18: the "· N in title" suffix only when it says something (no "0 roles · 0 in title").
  const inTitle = m.length && n ? visible.filter((j) => titleMatch(j, m)).length || null : null;
  const why = effectiveSort() === 'best' ? 'Best match lists roles whose title or team has your words first; the rest match on skills or keywords'
    : 'Roles whose title or team has your words; the rest match on skills or keywords';
  // A beta board fitted to its budget (data.meta.jobsCapped, scripts/snapshot.js#fitSnapshot) says
  // how much of the careers site it holds: "5,000 roles · of 22,415 posted".
  const cap = n === data.jobs.length ? cappedNote() : null; // the whole list only, not a filtered one
  title.replaceChildren(...nn(h('strong', null, plural(n, 'role')), inTitle != null ? h('span', { class: 'muted', title: why }, ` · ${inTitle.toLocaleString()} in title`) : null,
    cap ? h('span', { class: 'muted', title: cap.tip }, ` · of ${cap.total.toLocaleString()} posted`) : null));
  if (!visible.length) {
    // UX-34: the chart carries the one empty-state message and its button; the list just says 0 roles.
    // On a phone the chart sits under the sheet, so the list keeps the full message there.
    const chartSays = !isMobile() && S.m !== 'insights';
    list.replaceChildren(h('li', { class: 'list-empty' }, chartSays ? h('p', { class: 'fnote' }, data.jobs.length ? 'No roles match. See the message by the chart.' : 'This board has no postings right now.')
      : stateCard(data.jobs.length ? emptyState() : { title: 'No open roles', body: 'This board has no postings right now.' })));
    return;
  }
  // M-19: a new result set (another sort, filter, area or board) starts at the top of the list; the same
  // set re-rendered (a view switch, the live board replacing the snapshot) keeps its place and its pages.
  const sig = `${visible.length}|${visible.map((j) => j.id).join(',')}`;
  // perf-mobile-beta-2: the list that replaces the preview keeps its place when it starts with the same cards.
  if (win.previewIds) { if (win.previewIds.every((id, i) => visible[i]?.id === id)) win.keep = true; win.previewIds = null; }
  const fresh = sig !== win.sig;
  win.sig = sig;
  if (fresh && !win.keep) { win.heights.clear(); toTop(list); }
  else resultsLimit = Math.max(resultsLimit, win.loaded);
  win.keep = false;
  measureCardFit();
  buildWindow(list);
}

/**
 * Scroll the list to its top, also mid-fling: a fling still running would carry on from the top (M-19).
 * One frame of overflow: hidden is not always enough (Chromium's fling can outlive it and land a card
 * or two down), so the top is held for up to HOLD_TOP_MS, and handed back at once if the person
 * touches or scrolls the list again.
 */
const HOLD_TOP_MS = 600;
function toTop(list) {
  if (!list.scrollTop) return;
  list.style.overflowY = 'hidden'; // ends a touch fling (iOS and Chrome stop momentum on a non-scrolling box)
  list.scrollTop = 0;
  let handedBack = false;
  const release = () => {
    if (handedBack) return;
    handedBack = true;
    list.style.overflowY = '';
    list.removeEventListener('touchstart', release);
    list.removeEventListener('wheel', release);
  };
  list.addEventListener('touchstart', release, { passive: true });
  list.addEventListener('wheel', release, { passive: true });
  const until = performance.now() + HOLD_TOP_MS;
  const hold = () => {
    if (handedBack) return;
    if (list.scrollTop) list.scrollTop = 0;
    if (performance.now() < until) requestAnimationFrame(hold);
    else release();
  };
  requestAnimationFrame(hold);
}

/* M-20: the results list keeps only the cards near its viewport in the page: a window of cards between
   two spacers that stand for the cards above and below it, at their measured heights (the average for
   one not yet measured). Up to WINDOW_ALL loaded cards are all kept, so a list of a few pages (and
   find in page) works as before; past that the window holds the cards within a screen or more of the
   view, and at least WINDOW_MIN of them (about 60 either side: 3,500 page nodes, not 30,000). The list
   still has `resultsLimit` cards loaded: "Show N more" and the phones' lazy loading add to it. Each card
   carries aria-posinset/aria-setsize, so a screen reader hears "12 of 6,105" however few are in the page. */
const WINDOW_ALL = 150;
const WINDOW_MIN = 120;
const win = { sig: '', keep: false, loaded: 0, heights: new Map(), width: 0, gap: 8, base: 0, els: new Map(), top: null, bottom: null, more: null, btn: null, previewIds: null };
let listIO = null;

/** Rebuild the list's cards (state changed): the note, the window, the spacers and "Show more". */
function buildWindow(list) {
  listIO?.disconnect();
  listIO = null;
  const cs = getComputedStyle(list);
  win.gap = parseFloat(cs.rowGap) || 0;
  // A-5: every child of the <ol> is a list item (no role=none): the spacers are hidden, the note and
  // "Show more" are real items.
  const note = juiceScaleNote(visible.slice(0, PAGE));
  const spacer = () => h('li', { class: 'list-spacer', 'aria-hidden': 'true' });
  win.top = spacer();
  win.bottom = spacer();
  win.els = new Map();
  win.btn = h('button', { type: 'button', class: 'btn btn--ghost btn--block', onclick: () => loadMore() });
  win.more = h('li', { class: 'list-more' }, win.btn);
  // A-11: a focused preview card hands its focus to the same posting's card when the whole list replaces it.
  const focusId = cardId(document.activeElement?.closest?.('#resultsList .card'));
  // No layout is read until the cards and spacers are back, so the browser never clamps the scroll position.
  const keepTop = list.scrollTop;
  list.replaceChildren(...nn(note, win.top, win.bottom, win.more));
  paintWindow(keepTop);
  if (Math.abs(list.scrollTop - keepTop) > 1) list.scrollTop = keepTop;
  const base = parseFloat(cs.paddingTop) + (note ? note.offsetHeight + win.gap : 0);
  if (Math.abs(base - win.base) > 1) { win.base = base; scheduleWindow(); }
  if (focusId) win.els.get(focusId)?.querySelector('.card')?.focus({ preventScroll: true });
  // Phones: cards render lazily, the next page loads as the list nears its end.
  if (isMobile() && 'IntersectionObserver' in window && visible.length > resultsLimit) {
    // Append 4 cards per frame while the end is near (~500 px of runway per frame): each step
    // stays inside a frame budget at 4x CPU (a card costs 2-4 ms), so scrolling never stalls.
    const more = win.more;
    const near = () => more.isConnected && visible.length > resultsLimit && more.getBoundingClientRect().top - list.getBoundingClientRect().bottom < 600;
    const step = () => { if (!more.isConnected) return; loadMore(4); if (near()) requestAnimationFrame(step); };
    listIO = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) requestAnimationFrame(step); }, { root: list, rootMargin: '0px 0px 600px 0px' });
    listIO.observe(more);
  }
}

/** Load `n` more cards into the list (the scroll position stays put). */
function loadMore(n = PAGE * 2) {
  resultsLimit = Math.min(visible.length, resultsLimit + n);
  paintWindow();
}

const avgHeight = () => {
  let sum = 0, k = 0;
  for (const v of win.heights.values()) { sum += v; k++; }
  return k ? sum / k : 110;
};

/** Show the cards near the list's viewport (window mode), or all loaded ones; keeps the cards already shown. */
function paintWindow(scrollTop = null) {
  const list = $('#resultsList');
  if (!list || !win.more || !win.more.isConnected) return;
  const n = Math.min(resultsLimit, visible.length);
  win.loaded = n;
  const resized = list.clientWidth !== win.width;
  if (resized) { win.width = list.clientWidth; win.heights.clear(); } // card heights follow the column's width
  const gap = win.gap, avg = avgHeight();
  const hOf = (i) => win.heights.get(visible[i].id) ?? avg;
  let start = 0, end = n;
  if (n > WINDOW_ALL) {
    const view = list.clientHeight || innerHeight;
    const over = Math.max(600, view);
    const top = (typeof scrollTop === 'number' ? scrollTop : list.scrollTop) - win.base;
    const lo = top - over, hi = top + view + over;
    let y = 0;
    start = -1;
    for (let i = 0; i < n; i++) {
      y += hOf(i) + gap;
      if (start < 0 && y > lo) start = i;
      if (y >= hi) { end = i + 1; break; }
    }
    if (start < 0) start = Math.max(0, n - 1);
    const short = WINDOW_MIN - (end - start);
    if (short > 0) {
      start = Math.max(0, start - Math.ceil(short / 2));
      end = Math.min(n, start + WINDOW_MIN);
      start = Math.max(0, end - WINDOW_MIN);
    }
  }
  // Cards leaving the page; a focused one hands focus to the list, so it never falls to the page.
  const keep = new Set();
  for (let i = start; i < end; i++) keep.add(visible[i].id);
  for (const [id, li] of win.els) {
    if (keep.has(id)) continue;
    if (li.contains(document.activeElement)) list.focus({ preventScroll: true });
    li.remove();
    win.els.delete(id);
  }
  let prev = win.top;
  const added = [];
  for (let i = start; i < end; i++) {
    const job = visible[i];
    let li = win.els.get(job.id);
    if (!li) { li = card(job, i + 1, previewing() ? preview.total : visible.length); win.els.set(job.id, li); added.push(li); }
    if (prev.nextSibling !== li) prev.after(li);
    prev = li;
  }
  let above = 0, below = 0;
  for (let i = 0; i < start; i++) above += hOf(i) + gap;
  for (let i = end; i < n; i++) below += hOf(i) + gap;
  // A spacer stands for its cards and the gaps after them, less its own gap.
  win.top.style.display = start > 0 ? '' : 'none';
  win.top.style.height = `${Math.max(0, above - gap)}px`;
  win.bottom.style.display = end < n ? '' : 'none';
  win.bottom.style.height = `${Math.max(0, below - gap)}px`;
  const rest = visible.length - n; // in the preview, the cards it has (the rest come with the list)
  win.more.style.display = rest > 0 ? '' : 'none';
  if (rest > 0) win.btn.textContent = `Show ${Math.min(PAGE * 2, rest).toLocaleString()} more of ${rest.toLocaleString()}`;
  else { listIO?.disconnect(); listIO = null; }
  // Measure the new cards (every card after a resize); when that moves the window's edges, place it again.
  let changed = false;
  for (const li of resized ? [...win.els.values()] : added) {
    const id = li.firstElementChild?.dataset.id ?? li.firstElementChild?.dataset.previewId;
    const hgt = li.getBoundingClientRect().height; // not offsetHeight: rounding would shift the content under a scroll
    if (id && hgt && Math.abs((win.heights.get(id) ?? avg) - hgt) > 1) changed = true;
    if (id && hgt) win.heights.set(id, hgt);
  }
  if (changed && n > WINDOW_ALL) scheduleWindow();
}
const scheduleWindow = rafThrottle(() => paintWindow());

/** Focus result `idx` (0-based in `visible`), bringing it into the page first if the window had left it out. */
function focusResult(idx) {
  const job = visible[idx];
  const list = $('#resultsList');
  if (!job || !list || idx >= win.loaded) return false;
  if (!win.els.has(job.id)) {
    let y = win.base;
    const avg = avgHeight();
    for (let i = 0; i < idx; i++) y += (win.heights.get(visible[i].id) ?? avg) + win.gap;
    list.scrollTop = Math.max(0, y - list.clientHeight / 3);
    paintWindow();
  }
  const el = win.els.get(job.id)?.querySelector('.card');
  if (!el) return false;
  el.focus();
  return true;
}

/* I-3: the Juice grades in dollars, once: above the cards the first time they show Juice in this
   browser (kept for that visit). The same scale is in every badge's and the drawer's tooltip. */
const JUICE_SCALE_KEY = 'melon-seek.juiceScale.v1';
let juiceScaleShown = null;
function juiceScaleNote(jobs) {
  if (!jobs.some((j) => shownJuice(j))) return null;
  if (juiceScaleShown === null) {
    try {
      juiceScaleShown = sessionStorage.getItem(JUICE_SCALE_KEY) === '1' || !localStorage.getItem(JUICE_SCALE_KEY);
      if (juiceScaleShown) { localStorage.setItem(JUICE_SCALE_KEY, new Date().toISOString()); sessionStorage.setItem(JUICE_SCALE_KEY, '1'); }
    } catch { juiceScaleShown = true; }
  }
  if (!juiceScaleShown) return null;
  // M-35 / UX-35 (fix-phone-text): one line; the definition and the dollar scale are behind its Details.
  return renderNote(h('li', { class: 'juice-scale' }), { key: 'juice-scale', line: [h('strong', null, '🍉 Juice'), ': what’s left after tax and rent'],
    details: [`Juice is the money left a year after tax, rent and living costs, ${hhFor(juiceHousehold)}.`, `${juiceScaleText()}.`] });
}

const JUICE_TIP = 'Juice: money left a year after tax, rent and living costs';
/** "for one person", "for a couple", "for a family of four" (the household the Juice figures are for). */
const HH_FOR = { single: 'for one person', couple: 'for a couple', family: 'for a family of four' };
const hhFor = (key) => HH_FOR[key] || HH_FOR.single;
/** I-3: the grade scale in dollars, from the same score curve the map legend uses (palette.js). */
function juiceScaleText() {
  const { ripe: r, juicy: j } = juiceScale();
  return `Juicy: ${j} or more a year · Ripe: ${r}–${j.replace(/^\$/, '')} · Dry: under ${r} · Rind: nothing left`;
}
function juiceBadge(job) {
  const b = shownJuice(job);
  if (!b) return null;
  const place = b.locationName || b.cityName;
  // J-5 (fix-juice-6): a posting with several places says which one its grade is for, first in the tip and the
  // accessible name ("63 · Ripe, for Chicago"); locSummary names that place first on the card.
  const at = job.locations.length > 1 ? job.locations.find((l) => l && l.name === b.locationName)?.city || b.cityName || place : null;
  const head = `${b.score} · ${b.grade}${at ? `, for ${at}` : ''}`;
  // J-4: the grade says what it means ("Rind: nothing left …"), before the scale.
  // I-3: no bare "≈" before the score; "estimated" is said in words in the tooltip.
  return h('span', { class: `juice-badge juice--${String(b.grade).toLowerCase()}`,
    title: `${head}: ${gradeMeaning(b.grade, juiceScale())}. ${JUICE_TIP}${isTerm(job) ? ` (while the ${isFixedPay(job.salary) ? 'fixed-term pay' : programNoun(job)} lasts)` : ''}. ${b.grade} ${hhFor(job.juice.household)} in ${place}: ${stepMoney(b.net, 100)} a year left${b.estimated ? ' (some costs estimated)' : ''}. ${juiceScaleText()}.`,
    'aria-label': `Juice Score ${b.score}, ${b.grade}${at ? `, for ${at}` : ''}: ${gradeMeaning(b.grade)}, ${hhFor(job.juice.household)} in ${place}` }, `🍉 ${b.score} · ${b.grade}`);
}

/**
 * Card location: with a Location filter, a matching place comes first (P-7, "a DC list led with
 * Huntsville"). BP-2: otherwise a place the pay is for comes first, so "€148K–151K · Dublin +3" names
 * the place of the pay, never "London +3" for Dublin pay. B-1 (fix-ui-6): `coloured` (the list is coloured by
 * Location) puts the place the card's dot is coloured for first, the chart's key (keyOf 'location': the first on-site
 * place), so the dot sits beside its own place's name.
 */
function locSummary(job, max = 1, { coloured = false } = {}) {
  const named = (l) => (l.remote ? l.name || 'Remote' : l.city && l.region ? `${l.city}, ${l.region}` : l.name);
  let locs = job.locations;
  if (locs.length > 1) {
    const pay = job._usd && job._payLocs && job._payLocs.length < locs.length ? job._payLocs : null;
    const rank = (l) => (viewSpec?.l.size && locMatches(job, viewSpec, [l]) ? 0 : 2) + (pay && !pay.includes(l) ? 1 : 0);
    // J-5 (fix-juice-6): among places of the same rank, the one the Juice grade is for comes first, so the card's
    // grade is for the place it names ("Chicago, IL +1 · 63 · Ripe", not "New York, NY +1"). Nothing is dropped.
    const graded = shownJuice(job)?.locationName || null;
    const g = (l) => (graded && l && l.name === graded ? 0 : 1);
    if (pay || viewSpec?.l.size || graded) locs = locs.map((l, i) => [rank(l), g(l), i, l]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map((x) => x[3]);
    // B-1 (fix-ui-6): under colouring by place the coloured key comes first, so the dot names its place; the badge's
    // tip and accessible name still name the graded place (J-5).
    const key = coloured ? job.locations.find((l) => l && !l.remote) : null;
    if (key && locs[0] !== key) locs = [key, ...locs.filter((l) => l !== key)];
  }
  const names = locs.map(named);
  if (!names.length) return 'Location not listed';
  return names.slice(0, max).join(' · ') + (names.length > max ? ` +${names.length - max}` : '');
}

function topTags(job, n = 3) {
  const tags = [...job.keywords.skills, ...job.keywords.responsibilities, ...job.keywords.fit];
  return [...new Set(tags)].slice(0, n);
}
/* The card's keyword tags: up to `slots`, and only while the foot stays one line (the level and age
   are in words now: "Level not stated", "Listed 16 months ago"). Widths are estimated in characters
   at the cards' 12px text (about 6.3px each; a tag costs its length + 2.5): 52 fit the 1440px results
   column. cardFit() measures the column once per list render. In the narrow tablet column the age
   sits under the pay pill instead (styles.css), so it costs the foot nothing there. */
const cardFit = { chars: 52, ageInFoot: true };
function measureCardFit() {
  const w = $('#resultsList')?.clientWidth || 0;
  if (w > 0) cardFit.chars = Math.max(30, Math.floor((w - 54) / 6.3));
  cardFit.ageInFoot = !matchMedia('(min-width: 861px) and (max-width: 1299px)').matches;
}
function footTags(job, { level, juice, status, ote, age, slots }) {
  const cost = (t) => (t ? String(t).length + 2.5 : 0);
  let used = cost(level) + cost(juice) + cost(status) + (ote ? cost('On-target earnings') : 0) + (age && cardFit.ageInFoot ? String(age).length : 0);
  const out = [];
  for (const t of topTags(job, slots)) {
    if (used + cost(t) > cardFit.chars) break;
    used += cost(t);
    out.push(t);
  }
  return out;
}

/* I-3: card age in words: "Listed 12 days ago", "Listed 16 months ago", and "Always-open posting"
   for one listed two years ago or more (the "13y+" ones); nothing when unknown. */
const ALWAYS_OPEN_DAYS = 730;
function ageText(job) {
  const d = job._age;
  if (d == null) return '';
  if (d >= ALWAYS_OPEN_DAYS) return 'Always-open posting';
  const t = d === 0 ? 'today' : d < 60 ? `${plural(d, 'day')} ago` : `${plural(Math.round(d / 30.44), 'month')} ago`;
  return job.ageIsMinimum && d > 0 ? `Listed at least ${t}` : `Listed ${t}`;
}
// One formatter for every card: toLocaleDateString(undefined, opts) builds a new one per call (about
// 1 ms each at 4x CPU, twice per card). Same output; an invalid date keeps toLocaleDateString's text.
// Made at load, while the job list downloads, not during the first render.
const MONTH_YEAR_OPTS = { month: 'short', year: 'numeric' };
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, MONTH_YEAR_OPTS);
const monthYear = (d) => (Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, MONTH_YEAR_OPTS) : MONTH_YEAR.format(d));
function ageTitle(job) {
  if (job._age == null) return '';
  const since = job.postedAt ? ` (${monthYear(new Date(job.postedAt))})` : '';
  if (job._age >= ALWAYS_OPEN_DAYS) return `Listed ${plural(Math.floor(job._age / 365), 'year')} ago${since}. Some companies keep a posting open to collect applicants for a recurring role.`;
  return `${job.ageIsMinimum ? 'Open at least' : 'Listed'} ${plural(job._age, 'day')}${job.ageIsMinimum ? '' : ' ago'}${since}`;
}

/** The card's single status tag, by priority: Pay changed > New > Reposted. */
function statusTag(job) {
  if (job.payChange?.dir) return h('span', { class: 'tag tag--status', title: `Pay range ${job.payChange.dir === 'up' ? 'raised' : 'lowered'} ${Math.abs(Math.round(job.payChange.pct))}%` }, `Pay ${job.payChange.dir === 'up' ? '↑' : '↓'}`);
  if (isNewJob(job)) return h('span', { class: 'tag tag--status tag--new', title: 'New since your last visit' }, 'New');
  if (job.repost?.count > 0) return h('span', { class: 'tag tag--status', title: `Reposted ${job.repost.count}×` }, 'Reposted');
  return null;
}

/**
 * P-1/P-8: the card's pay pill: as posted for fixed-term pay ("$3,850/week"), the range otherwise.
 * Shared decision 3: a rate for an internship reads as that rate ("€47K", "€47,000 a year (13-week
 * internship)"). Shared decision 4: part-time hourly pay shows the hourly rate. Shared decision 1: under a
 * Location filter, pay that isn't for the picked places reads "Pay posted for the US only" (`elsewhere`).
 */
function payPill(job) {
  const s = job.salary;
  if (!s) return null;
  if (viewSpec?.l.size && job._usd && !payHere(job)) {
    const where = payPlaceText(job);
    const range = payPill({ ...job, _usd: null })?.text || salaryRange(s);
    return { text: `Pay posted for ${where} only`, tip: `${range} is the pay posted for ${where}, not for ${placesPicked()}`, elsewhere: true };
  }
  // UX-22, QA round 3 (fix-pay-at-place): a posting that gives each place its own range, in the unit it was posted
  // in (an internship's yearly rate, a part-time hourly rate): the places' span, or the range of the place picked.
  const ph = isOte(job) || isMinimum(job) ? null : payHeadline(job);
  if (ph) return { text: ph.text, range: ph.range, sub: ph.sub, tip: s.includesShiftDifferential ? `${ph.tip} ${shiftTip(s)}` : ph.tip };
  // UX-51 (fix-qa4): pay that includes the top shift differential says so on the card: from the stated base to the
  // posted rate, or "up to" one posted figure, with "with top shift pay" under the pill.
  const sr = shiftRange(s);
  if (sr) {
    const range = shiftText(job, sr);
    return { text: range, range, sub: SHIFT_SUB, tip: `${isPartTimeHourly(job) ? 'Part-time, paid by the hour. ' : ''}${shiftTip(s)}` };
  }
  if (isPartTimeHourly(job)) {
    const hr = postedPair(s.min / 2080, s.max / 2080, s.currency);
    return { text: `${hr}/hour`, tip: `Part-time, paid by the hour: ${hr} an hour (${postedPair(Math.round(s.min), Math.round(s.max), s.currency)} a year if full-time, 2,080 hours)` };
  }
  const term = postedTerm(s, job); // MR-38: the job gives a term of unstated length
  if (term?.fixed) {
    const text = term.per === 'term' ? `${moneyRange(s.min / term.toTerm, s.max / term.toTerm, s.currency)} total` : `${term.amount}/${term.per}`;
    return { text, tip: `${term.amount}${perText(term.per)} for ${termText(term.weeks)} (fixed-term pay, not a yearly salary)` };
  }
  if (term) {
    const tip = `${term.amount}${perText(term.per)} (${programText(job, term)})`;
    // UX-29: a yearly rate for a fixed term says it is a yearly rate ("€47K/year"), as an hourly one says "/hour".
    return { text: term.per === 'year' ? `${salaryRange(s)}/year` : `${term.amount}/${term.per}`, tip };
  }
  const range = salaryRange(s);
  if (!range) return null;
  if (isOte(job)) return { text: range, tip: OTE_LABEL };
  // VT-17: a stated minimum reads "from €20.1K", never as the pay.
  if (isMinimum(job)) return { text: `from ${money(s.min, s.currency)}`, tip: MINIMUM_TIP };
  // SA-1 (salary audit): a posting that prices several levels ("… for Level 4, and … for Level 5") shows
  // the span of their ranges, which no single level is posted at. The card says so, as a range per place
  // does ("$184K–357K · 2 levels"); the levels themselves are in the tip and the pay block.
  const lv = payLevels(s);
  if (lv) {
    const byLevel = lv.map((l) => `${String(l.label).trim()} ${moneyRange(l.min, l.max ?? l.min, s.currency)}`).join(' · ');
    return { text: `${range} · ${lv.length} levels`, range, sub: `${lv.length} levels`, tip: `${range} runs from the lowest to the highest of ${lv.length} ranges posted for different levels. Pay by level: ${byLevel}` };
  }
  return { text: range, tip: null };
}
/** UX-29: the term of a fixed-term role for the card's first keyword slot: { text: "13-week internship", tip }, or null. */
function cardTerm(job) {
  const t = postedTerm(job.salary, job);
  // MR-38: no length to name (the pill says "/month" and the level chip "Intern").
  if (!t || t.unstated || isPartTimeHourly(job)) return null;
  const text = programText(job, t);
  return { text, tip: t.fixed ? `${t.amount}${perText(t.per)}: fixed-term pay for a ${text}, not a yearly salary` : `${t.amount}${perText(t.per)} for a ${text}` };
}
/**
 * Where the pay is posted, in a sentence (shared decision 1): the places ("Tempe", "Herndon and Seattle", "Seattle,
 * Bellevue and 3 more"), or the pay's own country ("the US", "Germany and Ireland", "other countries"). `max` places
 * are named before "and N more".
 */
function payPlaceText(job, max = 2) {
  // fix-pay-at-place: a posting that prices each place on a row of its own names those places ("Seattle and
  // Bellevue"); one with no row for the place picked has no posted pay there (the lead decision of 2026-10-16).
  // P-1 (fix-data-6): so does one whose one range was posted for some of its places (salary.places): "Pay posted for
  // Tempe only", not "for the US only", for amazon:10487128 under Atlanta. The country is named only when those
  // places are in another country than the places picked ("Pay posted for the US only" under Zurich).
  if ((Array.isArray(job.salary?.ranges) && job.salary.ranges.length) || (Array.isArray(job.salary?.places) && job.salary.places.length)) {
    const own = pricedPlaces(job);
    const here = viewSpec?.l.size ? new Set(job.locations.filter((l) => locMatches(job, viewSpec, [l])).map((l) => l?.country).filter(Boolean)) : null;
    if (own.length && (!here?.size || own.some((l) => here.has(l?.country)))) return placeLabel(own, max);
  }
  const cs = [...new Set((job._payLocs || payLocations(job)).map((l) => l?.country && String(l.country).toUpperCase()).filter(Boolean))];
  if (!cs.length) return 'other places';
  if (cs.length > 2) return 'other countries';
  return cs.map(countryInSentence).join(' and ');
}
/** The places of the Location filter, in a sentence: "Zurich", "Zurich and Geneva", "the places you picked". */
function placesPicked(F = viewSpec) {
  const l = F ? [...F.l] : [];
  return l.length === 1 ? l[0] : l.length === 2 ? `${l[0]} and ${l[1]}` : 'the places you picked';
}

/** DQ-11: a talent pool (job.pool, from the sources lane) collects applications for roles that may open later. */
const isPool = (j) => j?.pool === true;
const POOL_LABEL = 'General application (no specific opening)';
const POOL_TIP = 'The company collects applications here for roles that may open later; it is not one specific job';

/** One result card; `pos` (1-based) and `size` are its place in the whole result list, for screen readers (M-20). */
function card(job, pos = null, size = null) {
  const status = statusTag(job);
  const color = vizColor(keyOf(job, colorBy()));
  const pay = payPill(job);
  const isOpen = job.id === drawerJobId;
  const ote = isOte(job);
  const juice = juiceBadge(job);
  const sen = senKey(job);
  const pool = isPool(job);
  // DQ-11: a talent pool's label takes the keyword slots, and "Level not stated" adds nothing to it.
  const level = pool && sen === NOT_STATED ? null : sen;
  // A-1: a role=button's content is presentational, so the meta row (team, place, Remote) and the foot
  // (level, Juice, tags, status, age) are its description; the name stays short.
  const did = `cd-${String(job.id).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  // UX-50 (fix-qa4), B-1 (fix-ui-6): the dot is coloured for the key the list is coloured by (the chart's legend), so the
  // meta line names that key first, beside it: the company ("YouTube · User Experience and Design"), the place
  // ("Seattle, WA +2 · Software Engineering") or the level ("Senior · Software Engineering"); else the department.
  // The department still gives way first on a narrow card (UX-16): .card-dept shrinks, .card-loc doesn't.
  const dim = colorBy();
  const loc = locSummary(job, 1, { coloured: dim === 'location' });
  // UX-33: no "Remote" tag after a place that already says "Remote (US)".
  const remoteTag = job.remote && !/^remote\b/i.test(loc);
  const term = cardTerm(job);
  const el = h('li', { 'aria-posinset': pos, 'aria-setsize': size }, h('article', {
    class: `card${isOpen ? ' is-open' : ''}`, dataset: previewing() ? { previewId: job.id } : { id: job.id }, tabindex: '0', role: 'button',
    'aria-label': `${job.title}${pool ? `, ${POOL_LABEL}` : ''}, ${pay ? `${pay.text}${pay.tip ? ` (${pay.tip})` : ''}` : job.salaryFlag ? 'pay unclear, see posting' : 'no pay listed'}, ${locSummary(job, 3)}`, style: `--stripe:${color}`,
    'aria-describedby': `${did}-m ${did}-f`,
  },
  h('div', { class: 'card-top' },
    h('h3', { class: 'card-title' }, job.title),
    h('div', { class: 'card-pay' },
      pay ? h('span', { class: `sal-pill${pay.elsewhere ? ' sal-pill--elsewhere' : ''}`, title: pay.tip }, pay.range || pay.text)
        : job.salaryFlag ? h('span', { class: 'sal-pill sal-pill--unclear', title: job.salaryFlag.reason || 'Pay unclear' }, 'Pay unclear')
          : h('span', { class: 'sal-pill sal-pill--none' }, 'No pay listed'),
      // UX-52 (fix-pay-at-place): "5 places" or "2 levels" as a muted line under the pill, not in pay green inside it.
      pay?.sub ? h('span', { class: 'sal-sub', title: pay.tip, 'aria-hidden': 'true' }, pay.sub) : null,
      // The tablet column puts the age here, beside the title's second line (styles.css). UX-33: the same words at every width.
      ageText(job) ? h('span', { class: 'card-age-top', 'aria-hidden': 'true', title: ageTitle(job) }, ageText(job)) : null)),
  h('div', { class: 'card-meta', id: `${did}-m` },
    h('span', { class: 'card-dot', style: `--dot:${color}`, 'aria-hidden': 'true' }),
    ...cardMetaItems(job, dim, loc, remoteTag)),
  h('div', { class: 'card-foot', id: `${did}-f` },
    level ? h('span', { class: `sen sen--${level.toLowerCase().replace(/\W/g, '')}`, title: SEN_TIP[level] || null }, senLabel(level)) : null,
    pool ? h('span', { class: 'tag tag--pool', title: POOL_TIP }, POOL_LABEL) : null,
    juice,
    // P-1: on-target pay takes the first keyword slot (a plain-words label, not a status).
    ote ? h('span', { class: 'tag tag--pay', title: OTE_LABEL }, 'On-target earnings') : null,
    // UX-29: a fixed-term role says its term ("13-week internship") in the first keyword slot.
    term ? h('span', { class: 'tag tag--pay', title: term.tip }, term.text) : null,
    ...footTags(job, { level: level ? senLabel(level) : '', juice: juice?.textContent || '', status: status?.textContent || '', ote: ote || !!term, age: ageText(job), slots: pool ? 0 : Math.max(0, 2 - (juice ? 1 : 0) - (status ? 1 : 0) - (ote ? 1 : 0) - (term ? 1 : 0)) }).map((t) => h('span', { class: 'tag' }, t)),
    status, // at most one status tag, in the second keyword slot (ROADMAP §8)
    ageText(job) ? h('span', { class: 'card-age', title: ageTitle(job) }, ageText(job)) : null)));
  return el;
}

/** The card's meta line after its dot (B-1): the coloured key first, then the department or the place. */
function cardMetaItems(job, dim, loc, remoteTag) {
  const sep = h('span', { class: 'sep', 'aria-hidden': 'true' }, '·');
  const where = [h('span', { class: 'card-loc' }, loc), remoteTag ? h('span', { class: 'tag tag--remote' }, 'Remote') : null];
  if (dim === 'location') return [...where, sep, h('span', { class: 'card-dept' }, deptKey(job))];
  const lead = dim === 'brand' ? brandKey(job) : dim === 'seniority' ? senLabel(senKey(job)) : null;
  return [h('span', { class: 'card-dept' }, lead ? `${lead} · ${deptKey(job)}` : deptKey(job)), sep, ...where];
}

/* ---------------------------------------------------------------- drawer */

let drawerJobId = null;
let drawerReturnFocus = null;

function findJob(id) { return data.jobs.find((j) => j.id === id); }

function openDrawer(id, { fromHash = false, step = false } = {}) {
  // M-43: while a big board's list loads, a preview card's job page opens at once with the card's own fields
  // and the rest loading (drawerLoading); loadJobs opens the whole page for it when the list is in.
  const job = findJob(id) || previewJob(id);
  const loading = !!job && data.status !== 'ready';
  if (!job) {
    if (drawerJobId === id && drawerLoadingShown()) closeDrawer(); // its list never came, or does not have it
    if (fromHash && data.status === 'ready') set({ job: null }, { replace: true });
    return;
  }
  if (!drawerJobId || !drawerReturnFocus) {
    drawerReturnFocus = document.activeElement && document.activeElement !== document.body && !$('#drawer').contains(document.activeElement) ? document.activeElement : null;
  }
  drawerJobId = id;
  setBackgroundInert(true);
  // UX-35: the Juice explainer above the list has done its job once a role is opened; it stays away for this visit.
  if (juiceScaleShown) { juiceScaleShown = false; try { sessionStorage.removeItem(JUICE_SCALE_KEY); } catch { /* storage blocked */ } }
  // M-9: paging next/prev rewrites the job page's entry, so one Back always leaves the job page.
  if (S.job !== id) { S.job = id; commit({ replace: fromHash || step }); }
  const drawer = $('#drawer');
  if (loading) drawer.replaceChildren(...drawerLoading(job));
  else { drawer.replaceChildren(...drawerContent(job)); applyDrawerBudget(); }
  drawer.hidden = false;
  fitApplyLabel(); // M-49
  fitMetaLine(); // B-2
  $('#drawerBackdrop').hidden = false;
  requestAnimationFrame(() => { drawer.classList.add('is-open'); $('#drawerBackdrop').classList.add('is-open'); });
  drawer.scrollTop = 0;
  drawer.querySelector('.drawer-scroll')?.scrollTo(0, 0);
  for (const c of document.querySelectorAll('.card.is-open')) c.classList.remove('is-open');
  $(`.card[data-id="${cssId(id)}"], .card[data-preview-id="${cssId(id)}"]`)?.classList.add('is-open');
  highlightViz();
  renderDrawerNav();
  $('#drawerClose')?.focus({ preventScroll: true }); // always — including deep links and Back/Forward
}
const drawerLoadingShown = () => !!$('#drawer .d-loading');

/**
 * M-49 (fix-phone-sizes): the job page's Apply label is one line, so its footer stays one button high: "Apply on
 * Amazon’s careers site" where it fits, else "Apply on Amazon’s site", else "Apply" (the host stays under it). When the
 * words are shorter, the link's name is still the long label and the host.
 */
function fitApplyLabel() {
  const lab = $('#drawer .apply-label');
  const words = lab?.firstChild;
  if (!lab?.dataset.long || words?.nodeType !== 3 || !lab.getBoundingClientRect().width) return;
  const a = lab.closest('a');
  const lines = () => {
    const r = document.createRange();
    r.selectNodeContents(words);
    const mids = [];
    for (const x of r.getClientRects()) { if (x.width < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((t) => Math.abs(t - m) < 5)) mids.push(m); }
    return mids.length;
  };
  const { long, mid, short } = lab.dataset;
  let pick = short;
  for (const t of [long, mid]) { words.textContent = t; if (lines() <= 1) { pick = t; break; } }
  words.textContent = pick;
  const host = lab.querySelector('.apply-host')?.textContent;
  if (pick === long) a.removeAttribute('aria-label');
  else a.setAttribute('aria-label', host ? `${long}, ${host}` : long);
}

/**
 * B-2 (fix-ui-6): the job page's level badge and tag sit 10 px and 6 px after the item before them on their line, as
 * before M-51; one that starts a line steps in by the 12 px the line's clip takes (styles.css .d-meta), so it lines up
 * with the text and is whole. Each is tried on its line first (.is-inline), then left at 12 px if it starts a line.
 */
function fitMetaLine() {
  for (const m of document.querySelectorAll('#drawer .d-meta')) {
    for (const el of m.querySelectorAll(':scope > .sen, :scope > .tag')) {
      el.classList.add('is-inline');
      const a = el.getBoundingClientRect();
      let prev = el.previousElementSibling;
      while (prev && !prev.getClientRects().length) prev = prev.previousElementSibling;
      const b = prev?.getBoundingClientRect();
      const mid = (a.top + a.bottom) / 2;
      if (!a.width || !b || mid < b.top || mid > b.bottom) el.classList.remove('is-inline');
    }
  }
}

// Everything behind the modal drawer becomes inert (not focusable, hidden from AT).
const behindDrawer = () => [$('.topbar'), $('.quickbar'), $('#layout'), $('.skip-link')];
function setBackgroundInert(on) {
  for (const n of behindDrawer()) if (n) { n.inert = on; if (on) n.setAttribute('aria-hidden', 'true'); else n.removeAttribute('aria-hidden'); }
}

function closeDrawer({ fromHash = false } = {}) {
  if (!drawerJobId) return;
  destroyDrawerComps();
  const closedId = drawerJobId;
  drawerJobId = null;
  const drawer = $('#drawer');
  drawer.classList.remove('is-open');
  $('#drawerBackdrop').classList.remove('is-open');
  setTimeout(() => { if (!drawerJobId) { drawer.hidden = true; $('#drawerBackdrop').hidden = true; } }, 220);
  for (const c of document.querySelectorAll('.card.is-open')) c.classList.remove('is-open');
  if (!fromHash && S.job) { S.job = null; commit(); }
  setBackgroundInert(false);
  highlightViz();
  // The original trigger may have been re-rendered away (e.g. a keyword toggled in the drawer), or
  // left the page with the list's window (M-20): then its card is brought back if it is loaded.
  const target = drawerReturnFocus?.isConnected ? drawerReturnFocus : $(`.card[data-id="${cssId(closedId)}"], .card[data-preview-id="${cssId(closedId)}"]`);
  if (target) target.focus({ preventScroll: true });
  else if (!focusResult(visible.findIndex((j) => j.id === closedId))) $('#resultsList')?.focus({ preventScroll: true });
  drawerReturnFocus = null;
}

function renderDrawerNav() {
  const idx = visible.findIndex((j) => j.id === drawerJobId);
  const prev = $('#drawerPrev'), next = $('#drawerNext'), pos = $('#drawerPos');
  if (!prev) return;
  prev.disabled = idx <= 0;
  next.disabled = idx < 0 || idx >= visible.length - 1;
  const total = previewing() ? preview.total : visible.length; // M-43: the preview is the whole board's first page
  pos.textContent = idx >= 0 ? `${(idx + 1).toLocaleString()} of ${total.toLocaleString()}` : ''; // M-23: "1 of 6,105"
}
function stepDrawer(d) {
  const idx = visible.findIndex((j) => j.id === drawerJobId);
  const nxt = visible[idx + d];
  if (nxt) openDrawer(nxt.id, { step: true });
}

/**
 * The roles a posting's pay is compared with (P-1, P-16): on-target earnings only with on-target
 * earnings and base pay only with base pay; an internship with internships; never fixed-term pay or
 * stipends (a weekly stipend annualized is not a yearly salary). null when there is no fair pool.
 */
function likePool(job) {
  if (!job?._usd || isTerm(job) || job.salary.kind === 'stipend') return null;
  const ote = isOte(job), intern = job.seniority === 'Intern';
  return data.jobs.filter((j) => j._usd && j.id !== job.id && !isTerm(j) && j.salary.kind !== 'stipend' && isOte(j) === ote && (j.seniority === 'Intern') === intern);
}
/** BP-3 (fix wave 3, shared decision 2): of those, only roles whose pay is for the same country (payCountry). */
function payPool(job) {
  const pool = likePool(job);
  const same = pool ? samePayCountry(rankSubject(job), pool) : [];
  return same.length >= 5 ? same : null;
}
/**
 * S-1 (fix-salary-6): the posting as the drawer's rank and strip see it. Under a Location filter whose figure is another
 * country's line (Milan on Italy's €124K–127K, where the headline is Germany's), the pool is that country's roles, so the
 * rank reads "… of Google’s roles in Italy", never Italian pay ranked among German roles. Otherwise the posting itself.
 */
function rankSubject(job) {
  const at = viewSpec?.l.size ? placePay(job) : null;
  const rows = at && at.basis === 'place' && Array.isArray(at.ranges) ? at.ranges : [];
  const cc = rows.length && rows.every((r) => r.country && r.country === rows[0].country) ? rows[0].country : null;
  if (!cc || cc === job.salary?.country) return job;
  const locations = (job.locations || []).filter((l) => String(l?.country || '').toUpperCase() === cc);
  return locations.length ? { ...job, locations, salary: { ...job.salary, country: cc, currency: at.currency, ranges: undefined, places: undefined } } : job;
}
/** What the pool is called in "Pays more than 37% of <noun> at Anthropic". */
const poolNoun = (job) => (job.seniority === 'Intern' ? 'internships' : isOte(job) ? 'roles with on-target earnings' : 'roles');
/** M-38 (fix-phone-text): the noun on a one-line drawer line ("roles"); the full one (poolNoun) is in its Details. */
const shortNoun = (job) => (job.seniority === 'Intern' ? 'internships' : 'roles');
function percentile(job) {
  const pool = likePool(job);
  const own = drawerUSD(job);
  const subject = rankSubject(job); // S-1: the picked line's country
  return pool ? payRank(subject, pool, { mid: (j) => (j === subject ? own?.mid : j._mid) }) : null;
}
/**
 * UX-37 (fix-pay-at-place): the range the drawer's rank and strip use for this role: under a Location filter the range
 * posted for the places picked (placePay), else the posting's headline range (Amazon's search city, Microsoft's U.S.
 * range). The pay block's Details name it.
 */
function drawerUSD(job) {
  return (viewSpec?.l.size && placePay(job)?.usd) || job._usd;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * The drawer's converted line. fix-density: one line ("≈ $53K in US dollars at Jul 2026 rates"; it was "… in approx US
 * dollars for comparison, at Jul 2026 exchange rates", two lines on a phone). The rates' month stays in the line,
 * linked to their source (MR-2). MR-33 (fix-mr-3): fixed-term pay (a term of known or unstated length, postedTerm) is
 * converted at the interval it was posted in ("≈ $5,686–6,000 a month", "≈ $78K a year"), never as an unlabelled
 * year; where that line would wrap, "in US dollars" is left to the tip, so it stays one line on a phone.
 */
function approxLine(job, own, fullTime = '') {
  const title = `In approx US dollars, for comparison. Rates: ${FX_SOURCE}`;
  const term = postedTerm(job.salary, job);
  if (!term) return h('p', { class: 'fnote dist-approx', title }, `≈ ${moneyRange(own.min, own.max)}${fullTime} in US dollars at `, docLink(UPDATED_DOC, `${fxAsOf()} rates`));
  const f = term.per === 'term' ? term.toTerm : PER_YEAR[term.per] || 1;
  const lo = own.min / f, hi = own.max / f;
  const amount = term.per === 'year' || term.per === 'term' ? moneyRange(lo, hi) : term.per === 'hour' ? postedPair(lo, hi, 'USD') : postedPair(Math.round(lo), Math.round(hi), 'USD');
  const usd = h('span', { class: 'dist-approx-usd' }, ' in US dollars');
  return dropWhenWrapped(h('p', { class: 'fnote dist-approx', title }, `≈ ${amount}${perText(term.per)}`, usd, ' at ', docLink(UPDATED_DOC, `${fxAsOf()} rates`)), usd);
}
/**
 * MR-33, MR-38: hide `part` (a span of `el`) while `el` would take more than one line, and show it again when it fits.
 * `el.refitLine()` re-checks after the caller changes the text (the width may not change).
 */
function dropWhenWrapped(el, part) {
  const lines = () => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const mids = [];
    for (const x of r.getClientRects()) { if (x.width < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m); }
    return mids.length;
  };
  const fit = () => { if (!el.isConnected || !el.contains(part)) return; part.hidden = false; if (lines() > 1) part.hidden = true; };
  el.refitLine = fit;
  if (typeof ResizeObserver !== 'function') return el;
  let w = -1;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }
    const now = el.getBoundingClientRect().width;
    if (Math.abs(now - w) < 0.5) return;
    w = now;
    fit();
  });
  ro.observe(el);
  return el;
}

/** Company pay distribution (midpoints, approx USD) with this job's range marked. DOM-built, no HTML strings. */
function salaryDistribution(job) {
  const pool = payPool(job);
  const base = salaryDomain();
  const own = drawerUSD(job); // UX-37: the range the Details name
  const dom = base && own ? { lo: Math.min(base.lo, own.min), hi: Math.max(base.hi, own.max) } : base;
  const mids = (pool || []).map((j) => j._mid).concat(own ? [own.mid] : []).sort((a, b) => a - b);
  const cur = rankSubject(job).salary.currency; // S-1: the currency of the line shown (CAD for Toronto)
  const foreign = cur && cur !== 'USD';
  const fullTime = isPartTimeHourly(job) ? ' a year if full-time' : ''; // shared decision 4
  const approx = foreign && own ? approxLine(job, own, fullTime)
    // MR-1: a currency with no rate in the table is shown as posted, and says why it is left out of comparisons.
    : foreign ? h('p', { class: 'fnote' }, `We can’t convert ${cur} to US dollars yet (no exchange rate), so this pay is left out of charts and comparisons.`) : null;
  if (!pool || !dom || !own) return approx ? h('div', { class: 'd-dist' }, approx) : null;
  const W = 100, H = 40, N = 32;
  const counts = new Array(N).fill(0);
  for (const m of mids) counts[Math.min(N - 1, Math.max(0, Math.floor(((m - dom.lo) / (dom.hi - dom.lo)) * N)))]++;
  const max = Math.max(...counts);
  const x = (v) => ((v - dom.lo) / (dom.hi - dom.lo)) * W;
  const bw = W / N;
  const median = quantile(mids, 0.5);
  const svg = svgEl('svg', { class: 'dist', viewBox: `0 0 ${W} ${H + 12}`, preserveAspectRatio: 'none', role: 'img',
    'aria-label': `Pay of ${mids.length} ${poolNoun(job)}; this role spans ${money(own.min)} to ${money(own.max)}${fullTime}, median ${money(median)}` });
  counts.forEach((c, i) => {
    if (!c) return;
    const hgt = (c / max) * (H - 6);
    const inRange = (i + 1) * bw > x(own.min) && i * bw < x(own.max);
    svg.append(svgEl('rect', { x: (i * bw + 0.15).toFixed(2), y: (H - hgt).toFixed(2), width: (bw - 0.3).toFixed(2), height: hgt.toFixed(2), rx: 0.4, class: `dist-bar${inRange ? ' is-in' : ''}` }));
  });
  svg.append(svgEl('rect', { x: x(own.min).toFixed(2), y: H + 2, width: Math.max(0.8, x(own.max) - x(own.min)).toFixed(2), height: 4, rx: 2, class: 'dist-range' }));
  const mx = x(median).toFixed(2);
  svg.append(svgEl('line', { x1: mx, x2: mx, y1: 0, y2: H, class: 'dist-med', 'vector-effect': 'non-scaling-stroke' }));
  const medLabel = h('span', { class: 'dist-med-label' }, `median ${money(median)}`);
  // fix-density: kept clear of the end labels on a narrow phone ("$10K" ran into "median $49K").
  medLabel.style.left = `clamp(7em, ${Math.min(80, Math.max(20, x(median))).toFixed(1)}%, calc(100% - 7em))`;
  // MR-17: the strip says what it shows (which roles, and which number of each).
  return h('div', { class: 'd-dist' },
    // fix-density: one line; "the middle of each posted range" is in the pay block's Details.
    // M-38 (fix-phone-text): "roles with on-target earnings" made it 2 lines; the full noun is in the pay block's Details.
    h('p', { class: 'fnote dist-caption', title: `The pay of each of ${mids.length.toLocaleString()} ${poolNoun(job)}, at the middle of its posted range; this one is marked` }, `This one among ${mids.length.toLocaleString()} ${shortNoun(job)} at ${data.company?.name || 'this company'}`),
    svg,
    h('div', { class: 'dist-axis' }, h('span', null, money(dom.lo)), medLabel, h('span', null, money(dom.hi))),
    approx);
}

const INTERVAL_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly', year: 'annual', term: 'fixed-term' };

// Drawer waterfall: per year or per month, 'term' for fixed-term pay. J-3 (fix-juice-6): remembered in this browser like
// the household (PERIOD_KEY, read with the same helper and the same fallback to the default).
let juicePeriod = periodOf(lsGet(PERIOD_KEY, 'year'));
const JUICE_DOC = 'methodology/#1-the-formula'; // site page rendered from docs/LIVABILITY.md (scripts/methodology.js); never off-site
// MR-3: the same guide explains posted pay (ranges, levels, part-time and fixed-term pay), the pay estimate,
// the grades and how often the data is read (docs/METHODOLOGY_GUIDE.md §2, §7 and §8).
const PAY_DOC = 'methodology/#how-is-the-posted-pay-read';
const ESTIMATE_DOC = 'methodology/#where-does-a-pay-estimate-come-from';
const UPDATED_DOC = 'methodology/#7-how-often-its-updated';
const docLink = (href, text) => h('a', { class: 'doc-link', href, target: '_blank', rel: 'noopener noreferrer' }, text);
/** MR-2: "Jul 2026", the month of the exchange rates every converted pay figure uses (registry date, else the table's own). */
const fxAsOf = () => formatAsOf(asOf('fx-per-usd') || FX_AS_OF);

/* Household for the Juice Score (docs/LIVABILITY.md §1): who the rent and living costs are for.
   It applies everywhere juice is used (cards, sort, the Juice filter, the map's Juice colouring,
   the drawer and its location comparison) and is remembered in this browser. api.js attaches
   juice for one person; other households are re-attached here with the same juice.js. */
const HOUSEHOLD_KEY = 'melon-seek.household.v1';
const HOUSEHOLDS = [
  // [key, button label, tooltip, bedrooms, people (living-cost row), the one line under the buttons (fix-touch-tips;
  //  J-2, fix-juice-6: variants, longest first, so it is one line at every phone size and says the other adult is not
  //  working; the tooltip names no filing status, which depends on the country)]
  ['single', 'Just me', 'One adult in a 1-bedroom home', 1, 'one person', ['1 adult, 1 bedroom']],
  ['couple', 'Couple', 'Two adults, one earning and the other not working, in a 2-bedroom home', 2, 'two adults',
    ['2 adults, 1 earner (the other not working), 2 bedrooms', '2 adults, 1 working, 2 bedrooms']],
  ['family', 'Family', 'Two adults, one earning and the other not working, and two children, in a 3-bedroom home', 3, 'two adults and two children',
    ['2 adults (1 earner, 1 not working), 2 children, 3 bedrooms', '2 adults (1 working), 2 children, 3 bedrooms', '2 adults (1 working), 2 kids, 3 bedrooms', '2 adults (1 working), 2 kids, 3 beds']],
];
const householdInfo = (key) => HOUSEHOLDS.find(([k]) => k === key) || HOUSEHOLDS[0];
let juiceHousehold = householdInfo(lsGet(HOUSEHOLD_KEY, 'single'))[0];

let juiceLibPromise = null;
/** juice.js plus the cities document (both already loaded by api.js, so this is cached), or null. */
function juiceLib() {
  if (!juiceLibPromise) {
    juiceLibPromise = Promise.all([api.getCities ? api.getCities() : null, import('./lib/juice.js')])
      .then(([cities, mod]) => (cities && typeof mod?.attachJuiceAll === 'function' ? { cities, mod } : null))
      .catch(() => null)
      .then((lib) => { if (!lib) juiceLibPromise = null; return lib; }); // retry next time
  }
  return juiceLibPromise;
}
/** True when some job's juice was computed for another household (no household field = one person). */
const needsRejuice = (jobs, hh) => jobs.some((j) => j && j.juice && (j.juice.household || 'single') !== hh);
/** Re-attach juice for household `hh` (mutates jobs, in chunks). false if juice.js is unavailable or `stale()`. */
async function rejuice(jobs, hh, stale = () => false) {
  const lib = await juiceLib();
  if (!lib || stale()) return false;
  for (let i = 0; i < jobs.length; i += PREPARE_CHUNK) {
    const slice = jobs.slice(i, i + PREPARE_CHUNK);
    try { lib.mod.attachJuiceAll(slice, lib.cities, { household: hh }); } catch { return false; }
    for (const j of slice) { j.juice = usableJuice(j); j._grade = gradeKey(j); }
    await yieldTask();
    if (stale()) return false;
  }
  return true;
}
let householdSeq = 0;
/** Switch the household: re-score every loaded job, then re-render (the drawer keeps focus on the control). */
async function setHousehold(hh) {
  if (hh === juiceHousehold) return;
  juiceHousehold = hh;
  lsSet(HOUSEHOLD_KEY, hh);
  const seq = ++householdSeq, load = loadSeq;
  const stale = () => seq !== householdSeq || load !== loadSeq;
  if (data.status === 'ready' && needsRejuice(data.jobs, hh)) await rejuice(data.jobs, hh, stale);
  if (stale()) return;
  for (const c of jobCache.values()) if (c !== data.jobs && needsRejuice(c, hh)) rejuice(c, hh); // saved-search counts
  render();
  const old = $('#drawer .d-juice');
  const job = drawerJobId ? findJob(drawerJobId) : null;
  if (old && job) {
    const next = juiceBlock(job);
    if (next) {
      next.querySelector('details.juice-details').open = old.querySelector('details.juice-details')?.open ?? true;
      old.replaceWith(next);
      next.querySelector(`[data-household="${hh}"]`)?.focus({ preventScroll: true });
    }
  }
}

/**
 * "Data as of …" note (public/features/freshness.js, docs/DATA_FRESHNESS.md): the data's own
 * dates at once, the published registry's (dates, "update due") when api/freshness.json has loaded.
 */
function asOfNote(cls, text) {
  const p = h('p', { class: `fnote ${cls}` }, text() || '');
  p.hidden = !p.textContent;
  if (!freshnessDoc()) loadFreshness().then(() => { const t = text(); if (t) { p.textContent = t; p.hidden = false; } });
  return p;
}

/**
 * J-1 (fix-juice-6): the city records (data/cities.json), by key, for the tax names of a place other than the posting's
 * best (which keeps its own jurisdiction in `inputs`). api.js has already loaded them for Juice; until they are here,
 * the city key gives the country (features/juice-drawer.js jurisdictionOf).
 */
let cityRecords = null, cityRecordsLoading = false;
function cityRecord(key) {
  if (!cityRecords && !cityRecordsLoading && api.getCities) {
    cityRecordsLoading = true;
    api.getCities().then((doc) => {
      const list = Array.isArray(doc) ? doc : doc?.cities;
      if (Array.isArray(list)) cityRecords = new Map(list.map((c) => [c.key, c]));
    }, () => {}).finally(() => { cityRecordsLoading = false; });
  }
  return cityRecords?.get(key) || null;
}
/** J-4 (fix-juice-6): the grades' yearly breaks in dollars ({ ripe: "$43K", juicy: "$116K" }), from the map legend's curve. */
function juiceScale() {
  const [ripe, juicy] = JUICE_BREAKS;
  return { ripe: money(juiceNetForScore(ripe)), juicy: money(juiceNetForScore(juicy)) };
}

/**
 * Drawer: Juice Score waterfall, plus the other locations in a disclosure.
 * P-7: with a Location filter it is for the best of the places picked, and the headline says which
 * place and household it is for. P-18: monthly amounts to the nearest $10 and yearly to the nearest
 * $100, and the rows add up exactly. P-8: fixed-term pay shows Monthly and Whole term, never a year.
 */
function juiceBlock(job) {
  const jb = job.juice;
  if (!jb?.best) return null;
  const filtered = !!viewSpec?.l.size;
  const picked = filtered ? shownJuice(job) : jb.best;
  const b = picked || jb.best;
  const noneHere = filtered && !picked ? [...viewSpec.l].join(', ') : null;
  const grade = String(b.grade).toLowerCase();
  const others = jb.byLocation.filter((l) => !(l.locationName === b.locationName && l.city === b.city));
  // Labels follow the household the numbers were computed for (it is the chosen one unless juice.js failed to load).
  const [hhKey, , , beds, people] = householdInfo(jb.household || b.household || 'single');
  const term = postedTerm(job.salary, job);
  const place = b.cityName || b.locationName;
  // MR-12 / UX-30: when the costs come from another city than the job's own, the headline names the job's own
  // place; M-37 (fix-phone-text): the stand-in ("using San Jose's rent and living costs") is the fold's first line,
  // so the headline stays one line on a phone.
  const own = String(b.locationName || '').split(',')[0].trim();
  const standIn = b.cityName && own && own.toLowerCase() !== String(b.cityName).toLowerCase();
  const headPlace = standIn ? own : place;
  const headNet = h('span', { class: 'juice-head-net' });
  // MR-38 (fix-mr-3): " while it lasts" (term pay, per month) is left to the Juice text below when the headline would wrap.
  const headWhile = h('span', { class: 'juice-head-while' }, ' while it lasts');
  dropWhenWrapped(headNet, headWhile);
  const body = h('div', { class: 'juice-body' });
  // BP-1: the length is said the way the pay block says it (a yearly rate for a 13-week internship, or
  // fixed-term pay for 17 weeks); the whole term divides the yearly figures as the pay block does.
  const lasts = !term ? null : term.fixed ? `This pay lasts ${termText(term.weeks)}` : `The ${programNoun(job)} lasts ${termText(term.weeks)}`;
  // MR-38: a term of unstated length has no whole term: Juice is per month while it lasts, never a year.
  const termNote = !term ? null : term.unstated
    ? `The posting doesn’t say how long the ${programNoun(job)} lasts, so Juice is shown per month while it lasts. Tax is worked out as if the pay lasted a year, so it may be lower.`
    : `${lasts}, so Juice covers only that term. Tax is worked out as if the pay lasted a year, so it may be lower.`;
  // MR-28 (fix-data-3): one line when the gross pay Juice starts from is not a base-pay range (one line on every phone).
  const grossNote = job.salary?.kind === 'minimum' ? 'Gross pay is the posted minimum.'
    : job.salary?.includesShiftDifferential ? 'Gross pay includes top shift pay.' : null;
  // I15 + shared decision 1: say why the filtered place has no Juice, in the posting's terms.
  const elsewhere = noneHere && !payHere(job) ? payPlaceText(job) : null;
  const where = [
    standIn ? `${own} uses ${b.cityName}’s rent and living costs, the nearest city with cost data.` : null,
    // J-4 (fix-juice-6): the grade says what it means here, where it first shows on the job page.
    `Juice: what’s left after tax, rent and living costs (in US dollars); ${b.grade} means ${gradeShort(b.grade)}.`,
    termNote,
    isOte(job) ? 'The pay is on-target earnings, so this assumes commission at target.' : null,
    b.estimated ? 'Some costs here are estimates.' : null,
    noneHere ? (elsewhere ? `This posting’s pay is for ${elsewhere} only, so there is no Juice for ${noneHere}. This is ${place}, the best place its pay covers.`
      : `There is no rent and living-cost data for ${noneHere} yet. This is ${place}, the best other place the posting lists.`) : null,
  ].filter(Boolean).join(' ');
  // UX-5: one headline line; the waterfall sits in a disclosure so "Same role elsewhere" stays near the top.
  const sec = h('section', { class: 'd-juice', 'aria-labelledby': 'juiceTitle' },
    h('details', { class: 'juice-details' },
      h('summary', null,
        h('span', { id: 'juiceTitle', class: 'juice-title' }, '🍉 Juice'),
        h('span', { class: `juice-score juice--${grade}`, title: `${b.score} · ${b.grade}: ${gradeMeaning(b.grade, juiceScale())}. ${JUICE_TIP}. ${juiceScaleText()}.` }, `${b.score} · ${b.grade}`),
        headNet,
        h('span', { class: 'fsec-caret', html: ICON.chevron })),
      h('p', { class: 'juice-where' }, where),
      body));
  const render = (focusPeriod) => {
    const period = shownPeriod(juicePeriod, term);
    const div = period === 'month' ? 12 : period === 'term' ? term.toTerm : 1;
    const per = period === 'month' ? '/mo' : period === 'term' ? ' total' : '/yr';
    const step = period === 'year' ? 100 : 10;
    const r = (n) => Math.round(n / div / step) * step; // the shown amount, so the rows add up
    const fmt = (n) => stepMoney(n, 1);
    const gv = r(b.gross), tv = r(b.tax), rv = r(b.rent), lv = r(b.living);
    const nv = gv - tv - rv - lv;
    const amt = (n, sign = '') => `${sign}${fmt(Math.abs(n))}${per}`;
    headNet.replaceChildren(`${nv < 0 ? '−' : ''}${fmt(Math.abs(nv))}${per} left ${hhFor(hhKey)} in ${headPlace}`, ...(term && period === 'month' ? [headWhile] : []));
    headNet.refitLine?.();
    const g = Math.max(1, b.gross);
    const seg = (lo, hi) => { const x = Math.max(0, Math.min(g, lo)), z = Math.max(0, Math.min(g, hi)); return `left:${(x / g) * 100}%;width:${Math.max(0, ((z - x) / g) * 100)}%`; };
    const afterTax = b.gross - b.tax, afterRent = afterTax - b.rent;
    const tp = b.taxParts;
    const rentWhere = b.rentBasis === 'override' ? 'your rent' : `${beds}-bedroom, ${b.rentBasis === 'outside' ? 'outside the centre' : 'city centre'}`;
    // How the tax model treated a couple or family here (server/juice.js TAX_HOUSEHOLD).
    const taxBasis = b.inputs?.tax?.basis || b.taxBasis, taxNote = b.inputs?.tax?.note || null;
    // J-1 (fix-juice-6): each part of the tax on a line of its own, named as the country names it ("provincial tax",
    // "National Insurance"; a US row stays "state or local tax"), the first name that fits on one line (fitLine).
    const jur = jurisdictionOf(b, cityRecord(b.city));
    const taxLines = taxRows(tp, jur, (v) => fmt(r(v))).map((t) => fitOneLine(
      h('span', { class: 'wf-detail wf-tax-part', dataset: { part: t.part }, title: t.variants.length > 1 ? t.variants[0] : null }), t.variants));
    // J-2: how that country taxes a one-earner couple or family, in words that can't be read as two earners.
    const how = !(b.tax > 0) ? null : householdTaxLine(hhKey, taxBasis, jur);
    const taxHow = how ? fitOneLine(h('span', { class: 'wf-detail wf-tax-basis', title: [how[0], taxNote].filter(Boolean).join('. ') }), how) : null;
    const rows = [
      ['Gross pay', amt(gv), seg(0, b.gross), 'gross', isOte(job) ? 'on-target earnings: assumes commission at target' : null],
      ['Tax', amt(tv, '−'), seg(afterTax, b.gross), 'tax', taxLines.length ? taxLines : null, taxHow],
      ['Rent', amt(rv, '−'), seg(afterRent, afterTax), 'rent', rentWhere],
      ['Living costs', amt(lv, '−'), seg(b.net, afterRent), 'living', `everyday costs for ${people}, excluding rent`],
      ['Juice left', `${nv < 0 ? '−' : ''}${fmt(Math.abs(nv))}${per}`, seg(0, b.net), nv < 0 ? 'net is-neg' : 'net', null],
    ];
    // MR-38: a term of unstated length shows Monthly only, so the toggle is left out.
    const periods = term?.unstated ? [] : term ? [['month', 'Monthly'], ['term', 'Whole term']] : [['month', 'Monthly'], ['year', 'Yearly']];
    const toggle = !periods.length ? null : h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': 'Show amounts per' },
      ...periods.map(([v, label]) => h('button', {
        type: 'button', 'aria-pressed': String(period === v), dataset: { period: v },
        onclick: () => { juicePeriod = v; lsSet(PERIOD_KEY, v); render(v); }, // V5: re-render this block only and keep focus here; J-3: remembered
      }, label)));
    const household = h('div', { class: 'seg seg--sm juice-household', role: 'group', 'aria-label': 'Household: who the rent and living costs are for' },
      ...HOUSEHOLDS.map(([k, label, tip]) => h('button', {
        type: 'button', 'aria-pressed': String(hhKey === k), dataset: { household: k }, title: tip,
        onclick: () => { setHousehold(k); },
      }, label)));
    // fix-touch-tips: the picked household's meaning in one muted line (a hover title is out of reach on a phone).
    const hhLine = HOUSEHOLDS.find(([k]) => k === hhKey)?.[5] || null;
    body.replaceChildren(...nn(
      h('div', { class: 'juice-controls' }, household, toggle),
      hhLine ? fitOneLine(h('p', { class: 'fnote juice-hh-note' }), hhLine) : null,
      grossNote ? h('p', { class: 'fnote juice-gross' }, grossNote) : null,
      h('div', { class: 'waterfall', role: 'table', 'aria-label': 'Juice breakdown' },
        ...rows.map(([label, value, style, kind, detail, extra]) => h('div', { class: `wf-row ${kind.split(' ').map((k, i) => (i ? k : `wf--${k}`)).join(' ')}`, role: 'row' },
          h('span', { class: 'wf-label', role: 'rowheader' }, label),
          h('span', { class: 'wf-track', role: 'cell', 'aria-hidden': 'true' }, h('span', { class: 'wf-bar', style })),
          h('span', { class: 'wf-value', role: 'cell' }, value),
          // A-6: a row owns only cells, so the details (tax split, rent basis) are a cell of their own.
          detail || extra ? h('span', { class: 'wf-details', role: 'cell' },
            Array.isArray(detail) ? detail : detail ? h('span', { class: 'wf-detail' }, detail) : null,
            extra || null) : null))),
      b.rentBurden != null ? h('p', { class: 'juice-facts' }, 'Rent takes ', h('strong', null, `${Math.round(b.rentBurden * 100)}%`), ' of take-home pay.') : null,
      others.length ? h('details', { class: 'juice-compare' }, h('summary', null, `Compare locations (${others.length + 1})`),
        h('ul', null, ...[b, ...others].map((l) => h('li', null,
          h('span', { class: 'jc-name' }, l.locationName || l.cityName, l === b ? h('span', { class: 'muted' }, filtered && b !== jb.best ? ' · shown above' : ' · best') : null),
          h('span', { class: `juice-grade juice--${String(l.grade).toLowerCase()}` }, `${l.score} ${l.grade}`),
          // V-30: the place shown above reads the headline's figure (rows rounded, then subtracted), not its own rounding.
          h('span', { class: 'jc-net' }, l === b ? `${nv < 0 ? '−' : ''}${fmt(Math.abs(nv))}${per}` : `${l.net < 0 ? '−' : ''}${fmt(Math.abs(r(l.net)))}${per}`))))) : null,
      asOfNote('juice-asof', () => juiceAsOfText(asOfSrc || {})), // rent, living costs, FX and each tax line
      h('p', { class: 'juice-disclaimer' }, 'Estimate, not financial advice. ', h('a', { href: JUICE_DOC, target: '_blank', rel: 'noopener noreferrer' }, 'How it’s calculated')),
    ));
    if (focusPeriod) body.querySelector(`[data-period="${focusPeriod}"]`)?.focus({ preventScroll: true });
  };
  // A place other than the posting's best keeps no `inputs` (api.js payload guard), so its data dates
  // are worked out again for this one posting, with the same juice.js.
  let asOfSrc = b.inputs ? b : null;
  if (!asOfSrc) {
    juiceLib().then((lib) => {
      if (!lib || !sec.isConnected) return;
      const copy = { ...job, juice: null };
      try { lib.mod.attachJuice(copy, lib.cities, { household: hhKey, inputs: 'all' }); } catch { return; }
      asOfSrc = copy.juice?.byLocation.find((e) => e.city === b.city && e.inputs) || null;
      const el = sec.querySelector('.juice-asof');
      const t = asOfSrc ? juiceAsOfText(asOfSrc) : '';
      if (el && t) { el.textContent = t; el.hidden = false; }
    });
  }
  render();
  return sec;
}

/**
 * Shared decisions 1 and 4: when a posting with pay has no Juice, one plain line says why, where the Juice
 * section would be. Nothing when the board has no Juice at all (its cost data didn't load).
 */
function juiceMissing(job) {
  if (job.juice || !job._usd || !data.jobs.some((j) => j.juice)) return null;
  // M-37 (fix-phone-text): one line ("🍉 No Juice: no cost data for this place yet"), the full reason behind its Details.
  const say = (short, text) => h('section', { class: 'd-juice d-juice--none' },
    noteLine({ cls: 'juice-none', key: 'juice-none', line: [h('strong', null, '🍉 No Juice:'), ` ${short}`], details: [`No Juice Score: ${text}`] }));
  if (isPartTime(job) && !statedHours(job)) return say('no hours a week posted', 'this part-time posting gives an hourly rate but not the hours a week, so a year’s take-home pay can’t be worked out.');
  if (!job.locations.some((l) => l && l.city && !l.remote)) return say('the posting names no city', 'the posting names no city, so rent and living costs can’t be worked out.');
  const pay = (job._payLocs || []).filter(Boolean);
  const names = [...new Set(pay.map((l) => l.city || l.name).filter(Boolean))];
  const where = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} or ${names[1]}` : 'the places this pay is for';
  const others = job.locations.some((l) => l && !pay.includes(l));
  return say('no cost data here yet', `there is no rent and living-cost data yet for ${where}${others && names.length <= 2 ? ', where this pay is posted' : ''}.${others ? ' Pay posted for one country isn’t used for another.' : ''}`);
}

/** Salary quarantined by the server's vetting gate (salary null + salaryFlag): say so, keep the reason one click away. */
function payUnclearBlock(job) {
  const raw = job.salaryRaw;
  const rawText = raw?.text || (raw && raw.min != null ? `${money(raw.min, raw.currency)}–${money(raw.max ?? raw.min, raw.currency)}` : null);
  return h('div', { class: 'd-sal-none d-sal-unclear' },
    h('strong', null, 'Pay unclear, see posting'),
    h('span', { class: 'muted' }, ' — the listed figure didn\u2019t pass our sanity checks, so it\u2019s left out of charts and medians.'),
    h('details', { class: 'd-unclear' }, h('summary', null, 'Why?'),
      h('p', null, job.salaryFlag?.reason || 'The pay information looked implausible.'),
      rawText ? h('p', { class: 'muted' }, 'As parsed: ', h('code', null, rawText)) : null,
      h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Check the posting')),
    compstimateBlock(job));
}

/**
 * Shared decision 2 (D-21): salary.levels, when one posting prices several levels (NVIDIA "Level 2 …
 * Level 3", Microsoft "IC4 … IC5"): [{ label, min, max }], yearly, in the salary's currency.
 * Two or more, else null.
 */
function payLevels(s) {
  const lv = Array.isArray(s?.levels) ? s.levels.filter((l) => l && l.label && Number.isFinite(l.min)) : [];
  return lv.length > 1 ? lv : null;
}
/** "$287.5K": a level's ends keep the hundreds the posting states ("287,500 USD"); whole thousands read "$184K". */
function levelMoney(n, currency) {
  const a = Math.abs(n);
  if (!(a >= 1000 && a < 999500) || Math.round(a / 100) % 10 === 0) return money(n, currency);
  const sym = !currency || currency === 'USD' ? '$' : CUR_SYM[currency] ?? `${currency} `;
  return `${n < 0 ? '-' : ''}${sym}${(Math.round(a / 100) / 10).toFixed(1)}K`;
}
/**
 * S-1 (fix-salary-6): the levels the pay block lists. Under a Location filter that picked one posted line, that
 * line's own levels (Norway's IC6 in kroner, the SF Bay Area / NYC range's IC5 and IC6), never another place's; none
 * when that line has none. Otherwise the salary's.
 */
function pickedLevels(sal, ph) {
  const rows = ph?.picked?.rows;
  if (!sal || !Array.isArray(rows) || !rows.length) return sal;
  const own = rows.length === 1 && Array.isArray(rows[0].levels) && rows[0].levels.length > 1 ? rows[0].levels : null;
  return { ...sal, levels: own, currency: own ? rowCurrency(rows[0], sal) : sal.currency };
}
/**
 * S-1 (fix-salary-6): one Details line per pay line the posting gives for a place this role isn't listed in
 * (salary.unlisted): "The posting also gives pay for Spain: €38K–59.7K; this role isn’t listed there." Shown as
 * posted, in its own currency; no figure, filter or Juice uses it.
 */
function unlistedNotes(sal) {
  const us = Array.isArray(sal?.unlisted) ? sal.unlisted.filter((u) => u && Number.isFinite(Number(u.min))) : [];
  return us.map((u) => {
    const cur = rowCurrency(u, sal);
    const lv = Array.isArray(u.levels) && u.levels.length > 1 ? ` (${u.levels.map((l) => `${String(l.label).trim()} ${levelMoneyRange(l.min, l.max ?? l.min, cur)}`).join(', ')})` : '';
    return `The posting also gives pay for ${unlistedName(u)}: ${levelMoneyRange(u.min, u.max ?? u.min, cur)}${lv}; this role isn’t listed there.`;
  });
}
/** "the San Francisco Bay Area and the New York City area", "Spain", "the US": an unlisted line's place in a sentence. */
function unlistedName(u) {
  const areas = (as) => as.map((a) => (a === 'sf-bay' ? 'the San Francisco Bay Area' : a === 'nyc' ? 'the New York City area' : a)).join(' and ');
  if (Array.isArray(u.areas) && u.areas.length) return areas(u.areas);
  if (u.country && Array.isArray(u.outside) && u.outside.length) return `${countryInSentence(u.country)} outside ${areas(u.outside)}`;
  if (u.country) return countryInSentence(u.country);
  return String(u.label || 'another place');
}
/** "$188K–331.2K": a range whose ends keep the hundreds the posting states (levelMoney). */
function levelMoneyRange(a, b, cur) {
  const x = levelMoney(Number(a), cur), y = levelMoney(Number(b), cur);
  return x === y ? x : `${x}–${y.replace(/^[^\d]+/, '')}`;
}
/** "Pay by level: Level 2: $184K–287.5K · Level 3: $224K–356.5K" under the range in the pay block. */
function payLevelsLine(s, job = null) {
  const lv = payLevels(s);
  if (!lv) return null;
  // D-21 (its test pins the text): the levels keep the hundreds the posting states ("$287.5K"). UX-28 asked
  // for the headline's rounding here; see docs/process/fix4-app.md.
  const range = (a, b) => { const x = levelMoney(a, s.currency), y = levelMoney(b, s.currency); return x === y ? x : `${x}–${y.replace(/^[^\d]+/, '')}`; };
  const labels = lv.map((l) => String(l.label).trim());
  const co = data.company?.name || job?.companyName || 'the company';
  // MR-17: the level names are the company's own; "IC" is spelled out where it appears.
  const what = labels.some((l) => /^IC\s?\d/i.test(l)) ? `IC means individual contributor; these are ${co}’s own level names.`
    : labels.some((l) => /^M\s?\d/.test(l)) ? `These are ${co}’s own level names; M is a manager level.` : `These are ${co}’s own level names.`;
  return tierList('Pay by level', lv.map((l) => [String(l.label).trim(), range(l.min, l.max ?? l.min)]), what);
}
/**
 * fix-density: "Pay by level" / "Pay by place" as short rows, one line each ("Level 2  $184K–287.5K"),
 * instead of one paragraph that wrapped to four lines on a phone. `note` (the level names) goes in the
 * pay block's Details (drawerContent).
 */
function tierList(title, rows, note = '') {
  const el = h('div', { class: 'd-sal-levels' }, h('span', { class: 'muted d-tiers-title' }, title),
    h('ul', { class: 'd-tiers' }, ...rows.map(([name, pay]) => h('li', null, h('span', { class: 'd-tier-name', title: name }, name), h('span', { class: 'd-tier-pay' }, pay)))));
  el.dataset.note = note;
  return el;
}
/**
 * UX-22: salary.ranges, when a posting gives its own range for different places (Apple: "$165,800–292,400
 * (Waltham); …"): [{ label, min, max, locations }], yearly. Two or more, else null. S-1 (fix-salary-6): each row in
 * its own currency (rowCurrency), since a posting can price each country on its own line ("Canada: $150000 -
 * $153000 (CAD)", "US: $147000 - $210000 (USD)"); a span is only ever taken over rows in one currency.
 */
function payRanges(s) {
  const rs = Array.isArray(s?.ranges) ? s.ranges.filter((r) => r && Number.isFinite(Number(r.min)) && (r.label || (Array.isArray(r.locations) && r.locations.length))) : [];
  return rs.length > 1 ? rs : null;
}
/** A salary.ranges row's currency: its own, else the salary's. */
const rowCurrency = (r, s) => String(r?.currency || s?.currency || 'USD').toUpperCase();
const rangeLabel = (r) => String((r.label && !/…$/.test(r.label)) || !Array.isArray(r.locations) || !r.locations.length ? r.label || '' : [...new Set(r.locations.map((x) => (/^remote\b/i.test(x) ? 'Remote' : String(x).split(',')[0].trim())))].join(', ')).trim();
const rangeText = (r, cur) => moneyRange(Number(r.min), Number(r.max ?? r.min), r?.currency || cur);
/**
 * "Pay by place: Waltham $166K–292K · Los Angeles, San Diego $175K–309K" under the range in the pay block (UX-22). QA
 * round 3 (fix-pay-at-place): in the unit the pay was posted in (an internship's "$39.7K/year", "$18.50/hour").
 */
function payPlacesLine(s, job = null) {
  const rs = payRanges(s);
  if (!rs) return null;
  const unit = job ? payUnit(job, true) : null; // P-2: each place's row as posted
  const rowCur = (r) => String(r?.currency || s?.currency || 'USD').toUpperCase(); // S-1: each row in its own currency
  const pay = (r) => (unit ? unit.fmt(Number(r.min), Number(r.max ?? r.min), rowCur(r)) : rangeText(r, s.currency));
  // fix-pay-at-place: one line per range, with no place name cut off (rangeName); the pay block's Details list every place.
  // D-39: ranges posted for the same places (Amazon's two hourly rates for Boardman, Hermiston and Umatilla) share one
  // row that names the places once and gives each posted range, "or" between them.
  const rows = new Map();
  for (const r of rs) {
    const k = rangeLabel(r);
    if (!rows.has(k)) rows.set(k, { name: rangeName(r), pays: [] });
    const p = pay(r);
    if (!rows.get(k).pays.includes(p)) rows.get(k).pays.push(p);
  }
  const el = tierList('Pay by place', [...rows.values()].map(({ name, pays }) => [name, pays.length > 1
    ? pays.map((p, i) => h('span', { class: 'd-tier-alt' }, i ? `or ${p}` : p)) : pays[0]]));
  el.classList.add('d-sal-places');
  if (rs.some((r) => rangeName(r) !== rangeLabel(r))) el.dataset.note = `Pay by place, every place: ${rs.map((r) => `${rangeLabel(r)} ${pay(r)}`).join('; ')}.`;
  return el;
}
/**
 * fix-pay-at-place: a range's places in one short line with no name cut: at most two by name, the rest counted
 * ("Fort Worth, Jacksonville and 4 more"). "Remote (IL, NJ, VA)" is one place name.
 */
function rangeName(r) {
  const p = rangeLabel(r).split(/,\s*(?![^()]*\))/).filter(Boolean);
  return p.length > 2 ? `${p.slice(0, 2).join(', ')} and ${p.length - 2} more` : p.join(', ');
}
/**
 * UX-22: the range posted for the places a Location filter picked, when the posting gives each place its own
 * range: { range, label, n, min, max, currency } (yearly), or null (no filter, no ranges, or no picked place in
 * one). fix-pay-at-place: the shared rule (placePay, payAt), the pay the chart, the map and the stats line use.
 */
function pickedRange(job, F = viewSpec) {
  const rs = F?.l.size ? payRanges(job.salary) : null;
  if (!rs) return null;
  const at = placePay(job, F);
  if (!at || at.basis !== 'place') return null;
  return { range: moneyRange(at.min, at.max, at.currency), label: at.label, n: rs.length, min: at.min, max: at.max, currency: at.currency, rows: at.ranges };
}

/**
 * QA round 3 (fix-pay-at-place): the places a posting's ranges are for, one key each: its location strings, and the
 * states of Amazon's virtual-location rows ("Remote (IL, NJ)" is two). A row with no place is its label.
 */
function rangePlaceKeys(r) {
  const keys = [];
  for (const l of r.locations || []) if (!/^remote\b/i.test(l)) keys.push(l);
  const m = /\bRemote \(([^)]*)\)/.exec(r.label || '');
  if (m) for (const st of m[1].split(/,\s*/)) keys.push(`Remote (${st.trim()})`);
  else if ((r.locations || []).some((l) => /^remote\b/i.test(l)) || /^Remote\b/.test(r.label || '')) keys.push('Remote');
  if (!keys.length) keys.push(`?${r.label || ''}|${r.min}|${r.max}`);
  return keys;
}
/**
 * How many places a posting's ranges are for, or 0 when that is not one range per place: two ranges for one place
 * (amazon:10420739, Seattle twice) or rows that share a place (Remote rows whose state is not known).
 */
function placeCount(rs) {
  const seen = new Set();
  for (const r of rs) for (const k of rangePlaceKeys(r)) { if (seen.has(k)) return 0; seen.add(k); }
  return seen.size > 1 ? seen.size : 0;
}

/**
 * QA round 3 (fix-pay-at-place): yearly pay written in the unit it was posted in. { fmt(lo, hi), note }: part-time
 * hourly pay as an hourly rate, fixed-term pay per week, month or for the whole term, a programme's yearly rate with
 * "/year", any other pay as a yearly range. `note` says what the unit is, for tips.
 */
function payUnit(job, exact = false) {
  const s = job.salary, cur0 = s.currency;
  // S-1 (fix-salary-6): fmt(lo, hi, currency) writes a row in its own currency (another country's line).
  if (isPartTimeHourly(job)) return { fmt: (a, b, cur = cur0) => `${postedPair(a / 2080, b / 2080, cur)}/hour`, note: 'Part-time, paid by the hour' };
  const term = postedTerm(s, job);
  // P-2 (fix-data-6): on the job page (`exact`), a yearly figure the posting states is written as posted ("$119,800–234,700").
  const year = (a, b, cur = cur0) => (exact && statedYearly(s) ? postedPair(a, b, cur) : moneyRange(a, b, cur));
  if (!term) return { fmt: year, note: '' };
  const prog = programText(job, term);
  if (term.fixed && term.per === 'term') return { fmt: (a, b, cur = cur0) => `${moneyRange(a / term.toTerm, b / term.toTerm, cur)} total`, note: `fixed-term pay for a ${prog}` };
  if (term.per === 'year') return { fmt: (a, b, cur = cur0) => `${year(a, b, cur)}/year`, note: prog };
  const f = PER_YEAR[term.per] || 1;
  return { fmt: (a, b, cur = cur0) => `${postedPair(a / f, b / f, cur)}/${term.per}`, note: term.fixed ? (term.unstated ? 'fixed-term pay, length not stated' : `fixed-term pay for a ${prog}`) : prog };
}

/**
 * UX-22, UX-37, QA round 3 (fix-pay-at-place): what a posting with a range per place shows on its card and as its
 * drawer heading, in the unit it was posted in: under a Location filter the range posted for the places picked,
 * else the span of its ranges with how many places they are for ("$60K–129K · 5 places"; "· 2 ranges" when they
 * are not one range per place). { text, tip, picked, rankPlace }: `rankPlace` names the place whose range the
 * drawer's rank and strip use (the posting's headline row: Amazon's search city, Microsoft's U.S. range), '' when
 * that is the span. null for a posting with one range.
 */
function payHeadline(job, F = viewSpec, exact = false) {
  const s = job.salary;
  const rs = s ? payRanges(s) : null;
  if (!rs) return null;
  const unit = payUnit(job, exact);
  const rowCur = (r) => String(r?.currency || s?.currency || 'USD').toUpperCase(); // S-1: each row in its own currency
  const byPlace = `Pay by place: ${rs.map((r) => `${rangeLabel(r)} ${unit.fmt(Number(r.min), Number(r.max ?? r.min), rowCur(r))}`).join(' · ')}`;
  const what = unit.note ? ` (${unit.note})` : '';
  const picked = pickedRange(job, F);
  if (picked) { const text = unit.fmt(picked.min, picked.max, picked.currency); return { text, range: text, sub: '', tip: `The range posted for ${picked.label}${what}. ${byPlace}`, picked, rankPlace: picked.label, min: picked.min, max: picked.max, across: false }; }
  // S-1 (fix-salary-6): the span covers the rows in the salary's currency only; another country's line in its own
  // currency is listed in the tip and the drawer's Pay by place, never mixed into the figure.
  const same = rs.filter((r) => rowCur(r) === String(s.currency || 'USD').toUpperCase());
  const lo = Math.min(s.min, ...same.map((r) => Number(r.min))), hi = Math.max(s.max, ...same.map((r) => Number(r.max ?? r.min)));
  const span = unit.fmt(lo, hi);
  const n = placeCount(rs);
  const head = payAt(job);
  const spanned = same.length > 1;
  const whose = head && head.basis === 'place' && !head.span ? (head.ranges.length === 1 && rangeName(head.ranges[0])) || head.label : '';
  return {
    text: `${span} · ${n ? `${n} places` : `${rs.length} ranges`}`, range: span, sub: n ? `${n} places` : `${rs.length} ranges`,
    tip: spanned ? `${span} runs from the lowest to the highest of ${same.length} ranges posted for ${n && same.length === rs.length ? `${n} places` : 'its places'}${what}${same.length < rs.length ? '; other places are paid in another currency' : ''}. ${byPlace}`
      : `${span} is the range posted for ${whose || 'one place'}${what}; the posting gives other places pay in another currency. ${byPlace}`,
    // The headline row's own name ("Bellevue", "Remote (CA)"), which a Location's name ("Remote (US)") would not say.
    picked: null, rankPlace: head && head.basis === 'place' && !head.span ? (head.ranges.length === 1 && rangeName(head.ranges[0])) || head.label : '', min: lo, max: hi, across: spanned,
  };
}

/**
 * MR-34 (fix-pay-at-place): what the "Several pay ranges" chip means for this figure. The posting states more than one
 * range (salary.zones); the figure is one of them (Microsoft's U.S. range when the role has no SF Bay Area or New York
 * place, Amazon's row for its city, Google's line for the role's country), or the span of them all (NVIDIA's five
 * unlabelled lines, two degree lines, Amazon's "lowest geographic market up to … highest").
 */
function severalRangesTip(s) {
  const t = String(s?.text || '');
  const amounts = t.match(/\d[\d,.']*\d|\d/g) || [];
  const span = /;/.test(t) || amounts.length > 2 || /lowest\b[^.]*\bmarket|highest\b[^.]*\bmarket/i.test(t);
  return span ? 'The posting lists different ranges for different places or levels; this figure runs from the lowest to the highest of them'
    : 'The posting lists different ranges for different places or levels; this figure is one of them, as posted';
}

/** At most two muted honest-number labels (ROADMAP F2), in the roadmap's priority order. */
function payLabels(job) {
  const s = job.salary;
  if (!s) return null;
  // fix-pay-at-place: the labels describe the figure shown (payHeadline: a range per place shows its span, or the
  // range of the place picked), not the headline row behind it.
  const ph = isOte(job) || isMinimum(job) ? null : payHeadline(job);
  const lo = ph ? ph.min : s.min, hi = ph ? ph.max : s.max;
  const spread = ph ? (lo > 0 ? hi / lo : null) : s.spread ?? (s.min > 0 ? s.max / s.min : null);
  const across = ph ? (ph.across ? ' (across places)' : '') : payLevels(s) ? ' (across levels)' : '';
  const labels = [
    // Fix wave 5 (VT-17, VT-18): what the figure is comes first.
    isMinimum(job) ? ['Minimum', MINIMUM_TIP] : null,
    s.includesShiftDifferential ? ['Includes top shift pay', shiftTip(s)] : null, // UX-61: no abbreviation
    // D-21: a range that covers several levels lists them (payLevelsLine) instead of a bare "Multiple pay zones".
    // UX-22: a range per place lists them (payPlacesLine) too; UX-31: the chip says what it means.
    s.zones > 1 && !payLevels(s) && !payRanges(s) ? ['Several pay ranges', severalRangesTip(s)] : null,
    spread != null && spread >= 2 ? [`Top is ${spread.toFixed(1).replace(/\.0$/, '')}× the bottom${across}`,
      across ? 'The span runs from the lowest to the highest range the posting gives, so it is wider than any one of them' : 'The top of the range is at least twice the bottom'] : null,
    lo === hi ? ['One number, not a range', ph ? 'The posting gives one number, not a range, for this place' : 'The posting gives one number, not a range'] : null,
    job.extras?.equity ? ['+ equity mentioned', 'The description mentions equity; it isn\u2019t in this figure'] : null,
    // P-1: on-target earnings already include the commission at target, so a "bonus" note would be wrong.
    // K-1 (fix-data-6): a bonus target the posting states as a percentage reads as posted ("+ 20% bonus target"); a stated
    // 0% target is no bonus (no chip); "+ bonus mentioned" is for a bonus with no figure.
    job.extras?.bonus && !isOte(job) ? (job.extras.bonusTarget ? [`+ ${job.extras.bonusTarget} bonus target`, `The posting states a ${job.extras.bonusTarget} bonus target; it isn\u2019t in this figure`]
      : ['+ bonus mentioned', 'The description mentions a bonus; it isn\u2019t in this figure']) : null,
  ].filter(Boolean).slice(0, 2);
  return labels.length ? h('div', { class: 'pay-labels' }, ...labels.map(([t, tip]) => h('span', { class: 'pay-label', title: tip }, t))) : null;
}

/** For postings without pay: an estimate from comparable roles, clearly labelled as such. */
/** Jobs passing every non-salary filter (Compstimate's auto title only; never its pool). Cached per state. */
let compVisCache = { key: null, list: null };
function compVisible() {
  const key = `${dataSeq}|${JSON.stringify(FILTER_KEYS.filter((k) => !['smin', 'smax', 'so', 'sc', 'smn', 'smx'].includes(k)).map((k) => S[k]))}`;
  if (compVisCache.key !== key) {
    const F = filterSpec(S), now = Date.now();
    compVisCache = { key, list: data.jobs.filter((j) => failures(j, F, now).every((f) => f === 'sal')) };
  }
  return compVisCache.list;
}

/** Rule 9: if the backtest wasn't ready (meta.compstimate null), re-request once after ~5 s. */
let compMetaRetry = -1;
function ensureCompMeta() {
  if (data.status !== 'ready' || !data.meta || data.meta.compstimate || compMetaRetry === dataSeq) return;
  compMetaRetry = dataSeq;
  const seq = dataSeq, key = S.c;
  setTimeout(async () => {
    if (seq !== dataSeq) return;
    try {
      const res = await dataApi.getJobs(jobsQuery(key), {});
      if (seq !== dataSeq || !res?.meta?.compstimate) return;
      data.meta = { ...data.meta, compstimate: res.meta.compstimate };
      comp?.setMeta(data.meta);
      scheduleRender();
    } catch { /* keep the line hidden */ }
  }, 5000);
}

/**
 * Drawer estimate for postings without usable pay (Rule 8): title, level and location only,
 * from all salaried jobs of the company, excluding the job. Independent of filters and of the
 * Insights widget. estimateView() (features/compstimate.js) decides what may be shown, the same
 * way for the drawer and Insights (P-2): no other country's pay, no full-time pay for an
 * internship, a basis line that names the comparables, no accuracy figure at low confidence.
 * Without a figure the drawer says why, in one muted line.
 */
function compstimateBlock(job) {
  ensureCompMeta();
  let est = null;
  try { est = compstimateForJob(data.jobs, job); } catch (err) { console.warn('compstimate failed', err); }
  if (!est) return null;
  const v = estimateView(est, { company: data.company?.name || 'this company', meta: data.meta });
  // fix-density: "No pay estimate" and its reason behind "Details" (the reason ran to four lines on a phone).
  if (!v.ok) return v.reason ? noteLine({ cls: 'd-comp-note', key: 'drawer-comp', line: 'No pay estimate either', details: [h('span', { class: 'd-comp-none' }, v.reason)] }) : null;
  // D-50 (fix-qa4): a "Pay unclear" posting whose stated maximum passed the checks is not estimated above it
  // (compstimateForJob caps it); the line says so, and Details give the similar roles' figure before the cap.
  const cap = est.cap;
  return h('div', { class: 'd-comp', role: 'note' },
    h('div', { class: 'd-comp-top' },
      h('span', { class: 'd-comp-label', title: 'Estimated pay from similar roles at this company' }, 'Pay estimate'),
      h('span', { class: 'd-comp-amt' }, `about ${money(est.mid)}`),
      h('span', { class: 'muted' }, `(${money(est.low)}–${money(est.high).replace(/^\$/, '')}, ${v.confidence.toLowerCase()} confidence)`)),
    // fix-density: one line, and the basis, accuracy (MR-17), dates and (MR-3) the method behind "Details".
    noteLine({ cls: 'd-comp-note', key: 'drawer-comp', line: cap ? fitOneLine(h('span'), ['An estimate, capped at the posted maximum', 'Capped at the posted maximum', 'Capped at its maximum']) : 'Not from the posting: an estimate', details: [
      cap ? `Similar roles suggest about ${money(cap.mid)} (${money(cap.low)}–${money(cap.high).replace(/^\$/, '')}). The posting itself states up to ${money(cap.stated.amount, cap.stated.currency)}${cap.stated.currency === 'USD' ? '' : ` (about ${money(cap.max)})`}, a figure that passed our checks, so the estimate stops there.` : '',
      `${v.basis}. ${v.kind === 'ote' ? 'On-target earnings (base plus commission at target), like the roles it is based on. ' : ''}An estimate, not a figure from the posting (in US dollars a year).`,
      v.accuracy ? `${v.accuracy}: in half of the tests the estimate was at least this close to the posted pay.` : v.caution || '',
      asOfNote('d-comp-asof', () => compstimateAsOfText({ fetchedAt: data.fetchedAt, meta: data.meta })),
      docLink(ESTIMATE_DOC, 'How estimates work'),
    ] }));
}

/**
 * fix-density: one short line under the amount ("If full-time: $40,976 a year"); the full note (the 2,080 hours,
 * the stated hours, the posted text) is the element's data-note, which drawerContent puts in the pay block's Details.
 */
function annualLine(line, note) {
  const el = h('div', { class: 'd-annual' }, line);
  el.dataset.note = note;
  return el;
}
function annualNote(sal, job = null) {
  // Shared decision 4: part-time hourly pay is shown as the hourly rate; a yearly figure says it is full time.
  if (job && isPartTimeHourly(job)) {
    const hrs = statedHours(job);
    const year = postedPair(Math.round(sal.min), Math.round(sal.max), sal.currency);
    const atHours = hrs ? ` At the posted ${hrs} hours a week: about ${postedPair(Math.round((sal.min / 2080) * hrs * 52), Math.round((sal.max / 2080) * hrs * 52), sal.currency)} a year.` : '';
    return annualLine(`If full-time: ${year} a year`, `If full-time (2,080 hours): ${year} a year.${atHours}${sal.text ? ` As posted: ${sal.text}` : ''}`);
  }
  // P-8, shared decision 3: pay stated per week, per month or for the whole term is shown as posted and is
  // fixed-term pay. A rate (a year, an hour) for a programme is shown as that rate: no fixed-term label.
  // MR-38 (fix-mr-3): so is an internship's pay per hour, day, week or month when the posting gives no length.
  const unstated = !(sal.termWeeks > 0) && !!job && isTermUnstated({ seniority: job.seniority, salary: sal });
  if (sal.termWeeks > 0 || unstated) {
    const asPosted = sal.text ? `As posted: ${sal.text}` : '';
    const note = !unstated ? asPosted : `${asPosted ? `${asPosted}. ` : ''}The posting doesn’t say how long the ${programNoun(job)} lasts, so this is not turned into a yearly salary.`;
    if (isFixedPay(sal)) return annualLine('Fixed-term pay, not a yearly salary', note);
    const unit = PER_UNIT[sal.originalInterval];
    return unit ? annualLine(`Paid by the ${unit}`, note) : null; // a yearly rate needs no note
  }
  // MR-37 (fix-mr-3): a yearly figure the posting states ("EUR 47'000 gross annually", Austria) is the pay, not 12 × the
  // monthly row it also gives (server/sources/amazon.js statedAnnual, VT-19). The line says so; Details quote the posting.
  const sa = sal.statedAnnual;
  if (sa && Number(sa.amount) > 0) {
    const per = Number(sa.paymentsPerYear), monthly = Number(sa.monthly) > 0 ? postedMoney(Number(sa.monthly), sa.currency || sal.currency) : null;
    const pays = !monthly ? '' : Number.isInteger(per) ? ` It is paid as ${per} monthly payments of ${monthly}, not 12.`
      : ` Its monthly row is ${monthly}, so the year is about ${(Math.round(per * 10) / 10).toLocaleString('en-US')} of those payments, not 12.`;
    const quoted = sal.text ? `As posted: ${sal.text.replace(/[.\s]+$/, '')}.` : `As posted: ${postedMoney(Number(sa.amount), sa.currency || sal.currency)} a year.`;
    return annualLine('Stated as a yearly figure', `${quoted} The yearly figure is the one the posting states.${pays}`);
  }
  const orig = sal.originalInterval || (sal.interval && sal.interval !== 'year' ? sal.interval : null);
  if (!orig) return null;
  // CONTRACT v4 (fix-pay-data P-8): 'term' is pay for the whole programme; termWeeks is its length.
  const what = orig === 'term' && sal.termWeeks ? `pay for a ${sal.termWeeks}-week programme` : `${INTERVAL_ADJ[orig] || orig} pay`;
  const lasts = orig !== 'term' && sal.termWeeks ? `The programme lasts about ${sal.termWeeks} weeks.` : '';
  return annualLine(`Annualized from ${what}`, [sal.text ? `As posted: ${sal.text}.` : '', lasts].filter(Boolean).join(' '));
}

/**
 * M-51 (fix-phone-sizes): one item of the job page's meta line with the "·" before it, so a wrap never leaves a "·"
 * at a line's end; the "·" that starts a line (and the first one) is clipped away (styles.css .d-meta-part).
 */
const metaPart = (t) => h('span', { class: 'd-meta-part' }, h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), t);
/** P-16: "Revenue · Revenue" and "Internships · Internships · Intern [Intern]" once each. */
function metaParts(job) {
  const seen = new Set([String(senLabel(senKey(job))).toLowerCase()]);
  const out = [];
  for (const t of [deptKey(job), job.team, job.employmentType ? empLabel(job.employmentType) : null]) {
    const k = String(t || '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * BN-7 (fix-app-6): the drawer's level chip. A level read from the company's own ladder names it ("Manager · Microsoft
 * M5–M6"), so a "Director" title filed as Manager or Staff+ says why (VT-8).
 */
function senChip(job, sen = senKey(job)) {
  const p = postedLevels(job, { description: true });
  const tip = p ? `${p.text}: the level ${data.company?.name || 'the company'} posts in the pay, which comes before the title’s words${p.levels.length > 1 ? `; it is hired at either, so the Seniority filter finds it under ${p.levels.join(' and ')}` : ''}` : SEN_TIP[sen] || null;
  return h('span', { class: `sen sen--${sen.toLowerCase().replace(/\W/g, '')}`, title: tip }, p ? `${senLabel(sen)} · ${p.text}` : senLabel(sen));
}

/** The drawer's top row: previous / position / next, and close ("‹ Back" on a phone). */
function drawerHead() {
  return h('div', { class: 'drawer-head' },
    h('div', { class: 'drawer-nav' },
      h('button', { type: 'button', class: 'icon-btn icon-btn--sm', id: 'drawerPrev', 'aria-label': 'Previous role', html: ICON.prev, onclick: () => stepDrawer(-1) }),
      h('span', { class: 'drawer-pos', id: 'drawerPos' }),
      h('button', { type: 'button', class: 'icon-btn icon-btn--sm', id: 'drawerNext', 'aria-label': 'Next role', html: ICON.next, onclick: () => stepDrawer(1) })),
    // Phones show this as "‹ Back" at the left of a full-screen page (styles.css); P-16: the word
    // keeps it apart from the "Previous role" arrow next to it.
    h('button', { type: 'button', class: 'icon-btn', id: 'drawerClose', 'aria-label': 'Close details, back to the list (Esc)', html: `<span class="ico-close">${ICON.close}</span><span class="ico-back">${ICON.prev}<span class="back-label">Back</span></span>`, onclick: () => closeDrawer() }));
}

/**
 * M-43: a preview card's job page while the board's whole list loads (Amazon's 22,179 postings take 5–10 s on
 * 4G). It opens at the tap with what the card shows (title, pay, department, level) and says the rest is
 * loading; the pay ranking, Juice and comparisons need the whole board, so they come with the whole page,
 * which loadJobs opens for the same posting when the list is in. Back, Escape and close work as on any job page.
 */
function drawerLoading(job) {
  const company = data.company || {};
  const pay = payPill(job);
  const sen = senKey(job);
  return [drawerHead(), h('div', { class: 'drawer-scroll', tabindex: '0', 'aria-label': 'Role details' },
    h('div', { class: 'd-company' }, h('span', { class: 'dot', style: `--dot:${companyColor(company)}` }), company.name || job.companyName),
    h('h2', { class: 'd-title', id: 'drawerTitle' }, job.title),
    h('div', { class: 'd-meta' }, ...metaParts(job).map(metaPart),
      h('span', { class: `sen sen--${sen.toLowerCase().replace(/\W/g, '')}` }, senLabel(sen))),
    h('div', { class: 'd-loading-pay' }, pay ? h('span', { class: `sal-pill${pay.elsewhere ? ' sal-pill--elsewhere' : ''}`, title: pay.tip }, pay.text)
      : h('span', { class: 'sal-pill sal-pill--none' }, job.salaryFlag ? 'Pay unclear' : 'No pay listed')),
    h('p', { class: 'd-loading', role: 'status' }, 'Loading this role’s details…'),
    h('div', { class: 'd-loading-body', 'aria-busy': 'true', 'aria-hidden': 'true' },
      ...[88, 64, 92, 48, 76].map((w) => h('div', { class: 'sk sk-line', style: `width:${w}%` }))))];
}

function drawerContent(job) {
  const company = data.company || {};
  const coName = company.name || job.companyName;
  const rank = percentile(job);
  const pct = rank ? rank.pct : null;
  const kwCat = KW_CATS.map(({ cat, key, title }) => (job.keywords[cat].length ? h('div', { class: 'kw-group' },
    h('h4', null, title),
    h('div', { class: 'cloud' }, ...job.keywords[cat].map((k) => h('button', {
      type: 'button', class: 'kw', 'aria-pressed': String(S[key].includes(k)), title: S[key].includes(k) ? 'Remove filter' : 'Filter roles by this keyword',
      onclick: (e) => { toggleIn(key, k); e.currentTarget.setAttribute('aria-pressed', String(S[key].includes(k))); toast(S[key].includes(k) ? `Filtering by “${k}”` : `Removed “${k}”`); },
    }, k)))) : null));
  const list = (arr) => h('ul', { class: 'bullets' }, ...arr.map((b) => h('li', null, b)));
  const bullets = (title, arr) => (arr?.length ? h('div', { class: 'd-bullet-group' }, h('h4', null, title), list(arr)) : null);
  // BP-14: a posting's minimum and preferred qualifications (sections.preferred, from the data lane) stay apart.
  const lookFor = () => {
    const req = job.sections.fit || [], pref = job.sections.preferred || [];
    if (!pref.length) return bullets('What they look for', req);
    return h('div', { class: 'd-bullet-group' }, h('h4', null, 'What they look for'),
      req.length ? [h('h5', null, 'Required'), list(req)] : null, h('h5', null, 'Nice to have'), list(pref));
  };
  const bulletsHost = h('div', { class: 'd-bullets' });
  const bulletsFold = fold('d-about', 'About the role', bulletsHost);
  const renderBullets = () => {
    bulletsHost.replaceChildren(...[bullets('What you’ll do', job.sections.responsibilities), lookFor()].filter(Boolean));
    bulletsFold.hidden = !bulletsHost.childElementCount;
    applyDrawerBudget();
  };
  const desc = h('div', { class: 'desc' });
  const descWrap = fold('d-desc is-collapsed', 'Full description', desc);
  queueMicrotask(() => { renderBullets(); fillDescription(job, desc, descWrap, renderBullets); });
  const descToggle = h('button', { type: 'button', class: 'link-btn d-desc-toggle', 'aria-expanded': 'false', onclick: (e) => {
    const c = descWrap.classList.toggle('is-collapsed');
    e.currentTarget.textContent = c ? 'Read full description' : 'Show less';
    e.currentTarget.setAttribute('aria-expanded', String(!c));
  } }, 'Read full description');
  descWrap.append(descToggle);

  const head = drawerHead();

  const sal = job.salary;
  const term = postedTerm(sal, job);
  const noun = poolNoun(job);
  // P-16: no "0% percentile" in big green type; one plain sentence, and none for fixed-term pay.
  const place = rank?.country ? ` in ${countryInSentence(rank.country)}` : '';
  const of = `${coName}’s ${noun}${place}${isOte(job) ? '' : ' that show pay'}`;
  // BP-3: ranked only among roles paid for the same country; with too few of them, say so.
  // fix-density: one line ("Pays more than 72% of Google’s roles in Poland"); what it ranks among is in Details.
  // M-38 (fix-phone-text): the line names the country (BP-3) with the short noun, so it fits one line on a phone;
  // "with on-target earnings" and "that show pay" are in the pay block's Details (pctNote).
  const among = `${coName}’s ${shortNoun(job)}${place}`;
  // D-48 (fix-qa4): "The highest pay" or "The lowest pay" only when no role is paid more or less (rankText); a share
  // that rounds to 100% or 0% reads "In the top 1% of …" or "In the lowest 1% of …".
  const pctText = pct == null ? (rank?.others && place ? `Too few roles${place} show pay to rank this one` : null) : rankText(rank, among);
  const pctShort = !place ? null : pct == null ? 'Too few roles show pay to rank this one' : rankText(rank, `${coName}’s ${shortNoun(job)}`);
  const pctNote = pct == null ? (rank?.others && place ? `Too few of ${coName}’s ${noun}${place} show pay to rank this one. Pay for other countries isn’t used.` : null)
    : `Ranked among ${of}${place ? '; pay for other countries isn’t used' : ''}.`;
  const partHourly = isPartTimeHourly(job);
  // Shared decision 1: under a Location filter, the pay block says when its pay isn't for the places picked.
  const elsewhere = sal && viewSpec?.l.size && job._usd && !payHere(job) ? ` This pay is posted for ${payPlaceText(job)}, not for ${placesPicked()}.` : '';
  const caption = !sal ? null : (isOte(job) ? `${OTE_LABEL}. Equity isn’t included.`
    : isMinimum(job) ? 'Posted minimum base pay; the offer can be higher. Equity and bonus aren’t included.'
    : sal.includesShiftDifferential ? `Posted pay, including the highest shift differential.${sal.statedBase ? shiftTip(sal).replace(/^[^.]*\./, '') : ''} Equity and bonus aren’t included.`
    : partHourly ? 'Posted hourly pay for a part-time role. Equity and bonus aren’t included.'
      : term?.fixed ? 'Fixed-term pay as posted. Equity and bonus aren’t included.' : 'Posted base pay. Equity and bonus aren’t included.') + elsewhere;
  // fix-density: the caption's one line: what the pay is, or, under a Location filter, where it is for.
  // P-1 (fix-data-6): one line at every size; where the places don't fit, "only" stands for the places picked, then one
  // place is named ("Seattle and 3 more"). The whole sentence is in Details (caption).
  const captionLine = !sal ? null : elsewhere ? fitOneLine(h('span'), [`Posted for ${payPlaceText(job)}, not ${placesPicked()}`,
    `Posted for ${payPlaceText(job)} only`, `Posted for ${payPlaceText(job, 1)} only`])
    : isOte(job) ? 'On-target earnings' : isMinimum(job) ? 'Posted minimum base pay' : sal.includesShiftDifferential ? 'Posted pay, including shift pay'
      : partHourly ? 'Posted hourly pay, part-time' : term?.fixed ? 'Fixed-term pay as posted' : 'Posted base pay';
  // UX-22: under a Location filter, the range posted for the place picked.
  // UX-37 (fix-pay-at-place): a posting with a range per place is headed with its card's figure (payHeadline): the
  // span of its ranges ("$60K–129K · 5 places"), or under a Location filter the range posted for the place picked,
  // which the line under it names. The rank and the strip say in Details whose range they use.
  const ph = sal && !isOte(job) && !isMinimum(job) ? payHeadline(job) : null;
  const phExact = ph ? payHeadline(job, viewSpec, true) : null; // P-2: the posted figures, exact
  // Shared decisions 3 and 4: the amount as it was stated. Fixed-term pay: "$3,850 a week · for about 17
  // weeks"; a rate for a programme: "€72,000 a year · 13-week internship"; part-time: "$22.00–28.88 an hour".
  // S-1 (fix-salary-6): under a Location filter, the currency of the line posted for the place picked.
  const cur = ph?.picked?.currency || sal?.currency || 'USD';
  // UX-51 (fix-qa4): shift pay reads as on its card ("$18.05–19.70 an hour", "up to $19.70 an hour").
  const shiftR = sal && !ph ? shiftRange(sal) : null;
  const amountText = !sal ? null : ph ? ph.range : shiftR ? shiftText(job, shiftR, ' an hour') : partHourly ? `${postedPair(sal.min / 2080, sal.max / 2080, sal.currency)} an hour`
    : term ? `${term.amount}${perText(term.per)}` : isMinimum(job) ? `from ${money(sal.min, sal.currency)}` : salaryRange(sal);
  // P-2 (fix-data-6): the heading gives a yearly figure the posting states exactly ("€46,400", "$119,800–234,700"), as
  // fixed-term and part-time pay already are; where that doesn't fit one line (280 px), the card's rounded figure.
  const exactText = !sal || !statedYearly(sal) || shiftR || partHourly || term ? null : phExact ? phExact.range
    : isMinimum(job) ? `from ${postedMoney(sal.min, sal.currency)}` : postedPair(sal.min, sal.max ?? sal.min, sal.currency);
  const subText = !sal ? null : (ph?.picked ? `Posted for ${ph.picked.label} · ` : ph?.sub ? `${ph.sub} · ` : '') + (partHourly ? `${cur} · part-time, paid by the hour`
    : term?.fixed ? `${cur} · ${term.unstated ? 'length not stated' : `for ${termText(term.weeks)}`}` : term ? `${cur} · ${programText(job, term)}` : `${cur} · per year`);
  // Whose range the rank and the strip use: the place picked, the posting's headline row (Bellevue), or its span.
  const rankWhose = !ph ? '' : ph.rankPlace ? `the range posted for ${ph.rankPlace}` : 'the middle of its span';
  let salaryNotes = null, annualEl = null, labelsEl = null;
  const salaryBlock = h('section', { class: 'd-salary' },
    sal ? h('div', { class: 'd-sal-top' },
      h('div', null,
        exactText && exactText !== amountText ? fitOneLine(h('div', { class: 'd-sal-amt' }), [exactText, amountText]) : h('div', { class: 'd-sal-amt' }, amountText),
        h('div', { class: 'muted' }, subText),
        (annualEl = annualNote(sal, job)),
        // QA round 3: "Pay by place" for fixed-term and part-time pay too, in the unit it was posted in.
        ...(salaryNotes = [term || partHourly ? null : payLevelsLine(pickedLevels(sal, ph), job), payPlacesLine(sal, job)])))
      : job.salaryFlag ? payUnclearBlock(job)
        : h('div', { class: 'd-sal-none' }, h('strong', null, 'No pay listed'), compstimateBlock(job)),
    sal ? salaryDistribution(job) : null,
    (labelsEl = sal ? payLabels(job) : null),
    // M-38 (fix-phone-text): one line, never cut ("Pays more than 72% of Amazon’s roles in the …"): where the country
    // doesn't fit, the line drops it (it is in the pay block's Details, pctNote).
    sal && pctText ? fitOneLine(h('p', { class: 'd-pct-text' }), [pctText, pctShort]) : null,
    // fix-density: one line, then the caveats behind "Details" (viz/note.js): the full caption, the level
    // names, what the percentile ranks among and (MR-3) one tap to how pay is read.
    caption ? noteLine({ cls: 'd-pay-note', key: 'drawer-pay', line: captionLine, details: [
      h('span', { class: 'd-pay-caption' }, caption),
      annualEl?.dataset.note || '',
      ...[...(salaryNotes || [])].filter(Boolean).map((e) => e.dataset.note || ''), // the level names; every place of a long Pay by place row
      sal && pctNote ? `${pctNote}${rankWhose ? ` This role is ranked at ${rankWhose}.` : ''}` : '',
      sal && job._usd ? `The strip shows ${coName}’s ${noun} that show pay, each posted range at its middle${rankWhose ? `; this role's is ${rankWhose}` : ''}.` : '',
      // S-1 (fix-salary-6): pay the posting gives for places this role isn't listed in, as posted (salary.unlisted).
      ...unlistedNotes(sal),
      // fix-touch-tips: each label's meaning (its hover title), so a tap or the keyboard can reach it.
      ...(labelsEl ? [...labelsEl.querySelectorAll('.pay-label')].filter((e) => e.title).map((e) => `${e.textContent}: ${e.title.replace(/\.$/, '')}.`) : []),
      h('span', { class: 'd-pay-doc' }, docLink(PAY_DOC, 'How pay is read')),
    ] }) : null);

  const locs = fold('d-locs', job.locations.length > 1 ? `Locations (${job.locations.length})` : 'Location',
    h('ul', { class: 'loc-list' }, ...(job.locations.length ? job.locations.map((l) => {
      const name = l.name || [l.city, l.region].filter(Boolean).join(', ');
      const country = l.country && !l.remote ? countryName(l.country) : '';
      return h('li', null,
        h('span', { class: 'loc-ico', html: l.remote ? ICON.globe : ICON.pin }),
        h('span', null, name),
        // P-16: "Canada · Canada" once.
        country && !String(name).toLowerCase().includes(country.toLowerCase()) ? h('span', { class: 'muted' }, ` · ${country}`) : null);
    }) : [h('li', { class: 'muted' }, 'Not listed')])));

  const foot = h('div', { class: 'drawer-foot' },
    // S-4 residual: a posting whose link was dropped (not http(s), or off its company's own hosts) has no Apply button.
    !applyHost(job.url) ? h('p', { class: 'muted', style: 'flex:1;margin:0;align-self:center' }, 'No link to the posting') :
    h('a', { class: 'btn btn--primary btn--lg apply', href: job.url, target: '_blank', rel: 'noopener noreferrer', title: `Opens ${applyHost(job.url) || 'the posting'} in a new tab` },
      // Demo jobs link to the real board index, not to a real posting — say so. I-3: name the company, not the job-board system.
      // M-49 (fix-phone-sizes): shorter words where the long ones would wrap (fitApplyLabel); the link's name stays the long one.
      h('span', { class: 'apply-label', dataset: data.mode === 'demo' && !MOCK ? { long: `Open ${coName}’s real job board`, mid: `Open ${coName}’s job board`, short: 'Open the job board' } : { long: `Apply on ${coName}’s careers site`, mid: `Apply on ${coName}’s site`, short: 'Apply' } },
        data.mode === 'demo' && !MOCK ? `Open ${coName}’s real job board` : `Apply on ${coName}’s careers site`, applyHost(job.url) ? h('span', { class: 'apply-host' }, applyHost(job.url)) : null), h('span', { html: ICON.ext })),
    h('button', { type: 'button', class: 'btn btn--ghost btn--lg', 'aria-label': 'Copy link to this role', html: ICON.link, onclick: copyLink }));

  const sen = senKey(job);
  return [head, h('div', { class: 'drawer-scroll', tabindex: '0', 'aria-label': 'Role details' },
    h('div', { class: 'd-company' }, h('span', { class: 'dot', style: `--dot:${companyColor(company)}` }), coName,
      data.mode === 'demo' ? h('span', { class: 'tag tag--demo' }, 'Demo') : null),
    h('h2', { class: 'd-title', id: 'drawerTitle' }, job.title),
    job._postedTitle && job._postedTitle.replace(/^\s*\[[^\]]{1,16}\]\s*/, '') !== job.title ? h('div', { class: 'd-posted muted' }, `Posted as “${job._postedTitle}”`) : null,
    // M-37 (fix-phone-text): one line; what a general application is, behind its Details.
    isPool(job) ? noteLine({ cls: 'd-pool', key: 'drawer-pool', line: h('strong', null, POOL_LABEL), details: [`${POOL_TIP}.`] }) : null,
    h('div', { class: 'd-meta' }, ...metaParts(job).map(metaPart),
      senChip(job, sen),
      job._titleTag ? h('span', { class: 'tag', title: `The posting's title starts with “[${job._titleTag}]”, a tag the company adds (often a team or office code)` }, `Tag: ${job._titleTag}`) : null),
    job._ts ? h('div', { class: 'd-updated muted' }, updatedText(job)) : null,
    // Fixed order (ROADMAP §8): pay block → Same role elsewhere → (Juice headline) → Listing → Locations → Keywords → Bullets → Description.
    salaryBlock,
    sameRoleSection(job), // UX-5: directly under the pay block
    juiceBlock(job) || juiceMissing(job), // compact headline; the waterfall is in a disclosure
    listingSection(job),
    locs,
    kwCat.some(Boolean) ? fold('d-kw', ['Keywords ', h('span', { class: 'muted small' }, 'pick one to filter')], ...kwCat) : null, // fix-touch-tips: words for any input
    bulletsFold,
    descWrap), foot];
}

/**
 * D-33: "Updated …" for the drawer. A posting updated on the day it was listed counts its days on the
 * Listing block's clock (ageDays, at the crawl), so one drawer never says "Updated 30 days ago" over
 * "Listed 31 days ago" for the same day.
 */
function updatedText(job) {
  const listed = Date.parse(job.postedAt || job.firstSeenAt || '');
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  if (job._age != null && 'ageDays' in job && !job.ageIsMinimum && Number.isFinite(listed) && job._ts && day(listed) === day(job._ts) && job._age >= 1 && job._age < 45) {
    return `Updated ${plural(job._age, 'day')} ago`;
  }
  return `Updated ${ago(job._ts)}`;
}

/** A drawer section that can collapse (details/summary). */
function fold(cls, title, ...body) {
  const d = h('details', { class: `d-sec d-fold ${cls || ''}`, open: true },
    h('summary', null, h('h3', null, title), h('span', { class: 'fsec-caret', html: ICON.chevron })), ...body);
  d.querySelector('summary').addEventListener('click', () => { d.dataset.touched = '1'; });
  return d;
}
/** If more than 3 sections follow the pay block, the rest start collapsed (unless the user toggled them). */
function applyDrawerBudget() {
  const scroll = $('#drawer .drawer-scroll');
  if (!scroll) return;
  const folds = [...scroll.querySelectorAll(':scope > .d-fold')].filter((f) => !f.hidden);
  folds.forEach((f, i) => { if (!f.dataset.touched) f.open = folds.length <= 3 || i < 3; });
}

/** F4 "Listing": listed / first seen / reposts, and one neutral line for long-open roles. */
function listingSection(job) {
  const lines = [];
  const posted = job.postedAt ? Date.parse(job.postedAt) : null;
  if (job._age != null && 'ageDays' in job) {
    const d = job._age;
    // I-3: months and years in words; "Always-open posting" for one listed two years ago or more.
    const ago = d === 0 ? 'today' : d < 60 ? `${plural(d, 'day')} ago` : d < ALWAYS_OPEN_DAYS ? `${plural(Math.round(d / 30.44), 'month')} ago` : `${plural(Math.floor(d / 365), 'year')} ago`;
    const on = posted ? ` (${new Date(posted).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })})` : '';
    // M-37 (fix-phone-text): one line per fact; what the line can't hold is behind its Details.
    lines.push(job.ageIsMinimum
      ? { line: `Open at least ${ago.replace(/ ago$/, '')}`, details: ['It was already listed when melon-seek started tracking this board.'] }
      : d >= ALWAYS_OPEN_DAYS ? { line: `Always open: listed ${ago}`, details: [posted ? `Listed on ${new Date(posted).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.` : ''] } : `Listed ${ago}${on}`);
  }
  if (job.firstSeenAt) lines.push(`First seen by melon-seek on ${new Date(job.firstSeenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`);
  if (job.repost?.count > 0) lines.push(`Reposted ${job.repost.count}×${job.repost.firstSeenAt ? ` since ${new Date(job.repost.firstSeenAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}`);
  if (job.freshness === 'evergreen' || (job._age != null && job._age >= 180 && 'ageDays' in job)) {
    lines.push({ line: 'Open 180+ days', details: ['Some companies keep a posting open to collect applicants for a recurring role.'] });
  }
  if (!lines.length) return null;
  return fold('d-listing', 'Listing', h('ul', { class: 'listing-lines' }, ...lines.map((t, i) => (typeof t === 'string' ? h('li', null, t)
    : renderNote(h('li'), { ...t, key: `listing-${i}` })))));
}

/* ---- F1: "Same role elsewhere" (product's compsForJob + viz's createCompsChart, loaded lazily) ---- */
let marketPromise = null;
/** The F1 market comps document (api.getMarket(); mock: fixture), fetched once. */
function loadMarket() {
  if (!marketPromise) marketPromise = Promise.resolve(dataApi.getMarket ? dataApi.getMarket() : null).catch(() => null);
  return marketPromise;
}
/** Switch to another company with the matching role family and seniority filters (via the hash; Back returns). */
function pickCompany(slug, filters = {}) {
  if (!slug) return;
  const known = allCompanies().find((c) => c.slug === slug);
  if (drawerJobId) closeDrawer({ fromHash: true });
  // UX-4: keep the user's context (location, remote, search) so the comparison stays like-for-like.
  pendingCarry = { name: known?.name || slug, l: S.l.slice(), r: S.r, q: S.q };
  dropHeld(); // BP-10: Compare companies sets its own filters
  set({ ...resetFiltersPatch(), c: slug, cn: known?.custom ? known.name : '', job: null,
    rf: filters.family || '', s: filters.seniority ? [filters.seniority] : [], l: S.l.slice(), r: S.r, q: S.q });
}
let pendingCarry = null;
/** After the target board loads: drop carried filters that leave no roles (search, then location, then remote). */
function settleCarry() {
  const c = pendingCarry;
  pendingCarry = null;
  if (!c || data.status !== 'ready' || derive().filtered.length) return;
  const dropped = [];
  for (const [key, empty, label] of [['q', '', () => `“${c.q}”`], ['l', [], () => c.l.join(', ')], ['r', 'any', () => (c.r === 'remote' ? 'remote' : 'on-site')]]) {
    const v = S[key];
    if (Array.isArray(v) ? !v.length : v === empty) continue;
    S[key] = structuredClone(empty);
    dropped.push(label());
    if (derive().filtered.length) break;
  }
  commit({ replace: true });
  if (dropped.length) toast(`No ${dropped.join(' / ')} roles at ${c.name} — showing all ${dropped.length === 1 && c.l.length && !S.l.length ? 'locations' : 'matches'}`);
}
/**
 * M-33: the one visible line over "Same role elsewhere": which roles, level and country are compared. Where the
 * role family doesn't fit (a phone), the line is the level and country; the family is in compsNote, its Details.
 */
function compsLine(res) {
  const where = res?.country ? ` in ${countryInSentence(res.country)}` : '';
  const fam = FAMILY_LABELS[res?.family] || res?.family || '';
  const lines = !res?.rows?.length ? [`Nothing to compare yet${where}`]
    : res.level === 'Intern' ? [fam && `${fam} internships${where}`, `Internships and fixed-term roles${where}`]
      : res.matchedOn === 'family+seniority' ? [fam && `${fam}, ${levelLabel(res.level)} level${where}`, `${levelLabel(res.level)} level${where}`]
        : [fam && `${fam}, every full-time level${where}`, `Every full-time level${where}`];
  return fitOneLine(h('span', { class: 'comps-line' }), lines);
}
let drawerComps = null; // V13: one live comps chart at a time (tooltip, ResizeObserver, theme listener)
function destroyDrawerComps() { try { drawerComps?.destroy?.(); } catch { /* ignore */ } drawerComps = null; }
function sameRoleSection(job) {
  destroyDrawerComps();
  if (!job._usd || !famOf(job)) return null;
  const body = h('div', { class: 'comps-body' }, h('div', { class: 'sk sk-line', style: 'width:80%' }), h('div', { class: 'sk sk-line', style: 'width:60%' }));
  const sec = fold('d-comps', 'Same role elsewhere', body);
  loadMarket().then((market) => {
    if (!sec.isConnected && drawerJobId !== job.id) return;
    let res = null;
    try { res = market ? compsForJob(market, job, { includeSelf: true }) : null; } catch (err) { console.warn('compsForJob failed', err); }
    const rows = res?.rows || [];
    if (!rows.some((r) => !r.current)) {
      // BP-3: no other company lists pay for this role in its country; say so (compsNote), never
      // fall back to another country. Without a country (an older market document) it stays hidden.
      const none = res?.country ? compsNote(res) : '';
      if (!none) { sec.hidden = true; applyDrawerBudget(); return; }
      body.replaceChildren(noteLine({ cls: 'comps-note muted', key: 'drawer-comps', line: compsLine(res), details: [none] }));
      return;
    }
    const bySen = res.matchedOn === 'family+seniority';
    const filters = { family: res.family, seniority: bySen ? res.level : null };
    const chartHost = h('div', { class: 'comps-chart' });
    // M-33 (fix-phone-text): one line ("Senior level in the US"), then the caveats behind its Details: what is
    // compared (P-11, compsNote), MR-18's level caveat, the chart's pay basis, the dates and (MR-3) the link.
    body.replaceChildren(
      noteLine({ cls: 'comps-note muted', key: 'drawer-comps', line: compsLine(res), details: [
        compsNote(res),
        bySen ? 'Only postings that state a level count, so companies whose postings rarely state one may be missing.' : '',
        res.kind === 'ote' ? 'On-target earnings (base plus commission at target) a year, in US dollars (converted at approximate rates).'
          : 'Posted base pay a year, in US dollars (converted at approximate rates).',
        asOfNote('comps-asof', () => marketAsOfText(market, rows.map((r) => r.slug))),
        docLink(PAY_DOC, 'How pay is read'),
      ] }),
      chartHost);
    try {
      destroyDrawerComps();
      drawerComps = createCompsChart(chartHost, { onSelect: (slug) => { if (slug && slug !== job.company) pickCompany(slug, filters); } });
      drawerComps.update(rows, { current: job.company, kind: res.kind });
    } catch (err) { console.warn('createCompsChart failed', err); sec.hidden = true; applyDrawerBudget(); }
  });
  return sec;
}

/**
 * Static deploys omit descriptionHtml from the list payload; fetch it on demand
 * with api.getJobDetail(job) and swap the skeleton out when it arrives.
 */
function fillDescription(job, desc, wrap, onSections = () => {}) {
  const toggle = () => wrap.querySelector('.d-desc-toggle');
  const show = (html) => {
    desc.replaceChildren(sanitizeHtml(html, job.url));
    if (!desc.textContent.trim()) { wrap.hidden = true; applyDrawerBudget(); return; }
    wrap.hidden = false;
    if (toggle()) toggle().hidden = false;
  };
  if (job.descriptionHtml) { show(job.descriptionHtml); return; }
  if (typeof dataApi.getJobDetail !== 'function') { wrap.hidden = true; return; }
  wrap.classList.remove('is-collapsed');
  desc.replaceChildren(h('div', { class: 'desc-skeleton', role: 'status', 'aria-label': 'Loading description' },
    ...[92, 80, 86, 60, 74].map((w) => h('div', { class: 'sk sk-line', style: `width:${w}%` }))));
  queueMicrotask(() => { if (toggle()) toggle().hidden = true; });
  Promise.resolve(dataApi.getJobDetail(job)).then((detail) => {
    const html = detail?.descriptionHtml || '';
    job.descriptionHtml = html;
    // BN-7: the posting's text names its own level ("IC5 - The typical base pay range …"): the chip says it now.
    const chip = desc.isConnected ? desc.closest('#drawer')?.querySelector('.d-meta .sen') : null;
    const next = chip && html ? senChip(job) : null;
    if (next && next.textContent !== chip.textContent) { chip.replaceWith(next); fitMetaLine(); } // B-2's spacing for the new chip
    let gotSections = false;
    // fix3-data BP-14: sections.preferred (the posting's "Preferred qualifications") arrives with the others.
    if (detail?.sections) for (const k of ['responsibilities', 'fit', 'preferred']) if (!job.sections[k]?.length && detail.sections[k]?.length) { job.sections[k] = detail.sections[k]; gotSections = true; }
    if (!desc.isConnected) return;
    if (gotSections) onSections(); // lazily-arrived bullets re-render in place
    wrap.classList.add('is-collapsed');
    if (html) show(html);
    else desc.replaceChildren(h('p', { class: 'muted' }, 'No description on this posting. ', postingLink(job)));
  }).catch((err) => {
    console.warn('getJobDetail failed', err);
    if (!desc.isConnected) return;
    desc.replaceChildren(h('p', { class: 'muted' }, 'Couldn\u2019t load the full description. ', postingLink(job)));
  });
}

function postingLink(job) {
  return h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'View the full posting');
}

function copyLink() {
  const url = location.href;
  (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Link copied'), () => toast('Copy failed — use the address bar'));
}

function applyHost(u) {
  if (!/^https?:\/\//i.test(String(u || ''))) return ''; // no link, or not an absolute http(s) one (S-4 residual)
  const x = safeUrl(u);
  if (x === '#') return '';
  try { return new URL(x).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function safeUrl(u, base = location.href) {
  try { const x = new URL(u, base); return ['http:', 'https:'].includes(x.protocol) ? x.href : '#'; } catch { return '#'; }
}

// Allowlist sanitizer: parse inertly (DOMParser never runs scripts), then
// rebuild only safe elements with no attributes except vetted hrefs.
const ALLOWED = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'DIV', 'SPAN', 'BLOCKQUOTE', 'HR', 'CODE', 'PRE', 'SUB', 'SUP', 'SMALL', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LINK', 'META', 'BASE', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'TITLE', 'HEAD']);
function sanitizeHtml(html, baseUrl) {
  // Relative links in third-party HTML resolve against the posting, never against this app.
  const base = safeUrl(baseUrl || '') !== '#' ? safeUrl(baseUrl) : null;
  let src = String(html);
  if (/&lt;\s*\/?\s*[a-z]/i.test(src) && !/<\s*[a-z]/i.test(src)) {
    src = new DOMParser().parseFromString(src, 'text/html').documentElement.textContent; // entity-escaped HTML
  }
  const doc = new DOMParser().parseFromString(src, 'text/html');
  const frag = document.createDocumentFragment();
  const walk = (node, out) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out.append(n.textContent); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (DROP.has(tag)) continue;
      if (!ALLOWED.has(tag)) { walk(n, out); continue; }
      const el = document.createElement(tag === 'H1' || tag === 'H2' ? 'h4' : tag.toLowerCase());
      if (tag === 'A') {
        const raw = n.getAttribute('href') || '';
        const href = base || /^[a-z][a-z0-9+.-]*:/i.test(raw) ? safeUrl(raw, base || undefined) : '#';
        // Link policy (scripts/links-policy.js): only allowlisted hosts stay clickable. Other links in
        // company-written descriptions become text that names where they point, so nothing leaves the site.
        let host = '';
        try { host = new URL(href).hostname; } catch { /* '#' */ }
        if (href !== '#' && LINK_HOSTS.has(host) && href.startsWith('https:')) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer nofollow'; }
        else {
          const span = document.createElement('span');
          span.className = 'desc-offsite';
          walk(n, span);
          const shown = href !== '#' ? href.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
          if (shown && !span.textContent.includes(shown)) span.append(` (${shown})`);
          out.append(span);
          continue;
        }
      }
      walk(n, el);
      out.append(el);
    }
  };
  walk(doc.body, frag);
  return frag;
}

/* --------------------------------------------------------------- mobile */

const isMobile = () => matchMedia('(max-width: 860px)').matches;
/** A touch screen (any width): it has an on-screen keyboard (M-52, fix-phone-sizes). */
const isCoarse = () => matchMedia('(pointer: coarse)').matches;
const isOverlayFilters = () => matchMedia('(max-width: 1199px)').matches;

/* Results bottom sheet (phones). Three snap points on body[data-sheet]: peek (count + sort),
   half and full; `sheet-open` stays set for half/full. CSS owns the snap transforms; a drag
   writes one inline transform per animation frame and reads layout only on pointerdown, so
   the chart/map under the sheet never re-lays out (the sheet overlays them). */
const SHEET = ['peek', 'half', 'full'];
const sheetState = () => document.body.dataset.sheet || 'peek';
function setSheet(state) {
  if (state === true) state = 'half';
  if (!SHEET.includes(state)) state = 'peek';
  document.body.dataset.sheet = state;
  document.body.classList.toggle('sheet-open', state !== 'peek');
  const handle = $('#sheetHandle');
  handle.setAttribute('aria-expanded', String(state !== 'peek'));
  handle.querySelector('.sr-only').textContent = state === 'full' ? 'Collapse results list' : 'Expand results list';
}
const cycleSheet = () => setSheet(SHEET[(SHEET.indexOf(sheetState()) + 1) % SHEET.length]);

function bindSheetDrag() {
  const sheet = $('#results');
  let g = null;           // active gesture
  let frame = 0;
  let swallowClick = false;
  const snaps = () => {   // translateY of each snap point, mirroring the CSS
    const H = sheet.offsetHeight;
    const cs = getComputedStyle(sheet);
    const peek = parseFloat(cs.getPropertyValue('--sheet-peek')) + parseFloat(cs.paddingBottom || 0);
    const half = parseFloat(cs.getPropertyValue('--sheet-half')) || 0.5;
    return { peek: Math.max(0, H - peek), half: Math.max(0, H - innerHeight * half), full: 0 };
  };
  const paint = () => { frame = 0; if (g?.dragging) sheet.style.transform = `translateY(${g.y}px)`; };
  sheet.addEventListener('pointerdown', (e) => {
    if (!isMobile() || !e.isPrimary || e.button > 0) return;
    if (e.target.closest('select, input, .area-chip')) return;
    // A full sheet scrolls its list natively; drag it down by the handle or header.
    if (sheetState() === 'full' && e.target.closest('.cards')) return;
    const s = snaps();
    g = { id: e.pointerId, y0: s[sheetState()], y: s[sheetState()], start: e.clientY, s, dragging: false, hist: [[e.timeStamp, e.clientY]] };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.start;
    if (!g.dragging) {
      if (Math.abs(dy) < 6) return;
      g.dragging = true;
      sheet.classList.add('is-dragging');
      try { sheet.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    g.y = Math.min(g.s.peek + 24, Math.max(0, g.y0 + dy));
    g.hist.push([e.timeStamp, e.clientY]);
    if (g.hist.length > 12) g.hist.shift();
    if (!frame) frame = requestAnimationFrame(paint);
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const { dragging, hist, s, y } = g;
    g = null;
    if (!dragging) return;
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    // Release velocity over the last 100 ms only: a finger that rested before lifting has v = 0.
    const recent = hist.filter(([t]) => e.timeStamp - t <= 100);
    const v = e.type === 'pointercancel' || recent.length < 2 ? 0
      : (recent[recent.length - 1][1] - recent[0][1]) / Math.max(16, e.timeStamp - recent[0][0]); // px/ms, + is down
    const order = SHEET.map((k) => [k, s[k]]);
    let target = order.reduce((a, b) => (Math.abs(b[1] - y) < Math.abs(a[1] - y) ? b : a))[0];
    if (Math.abs(v) > 0.6) { // a flick goes one snap further in its direction
      const ahead = v < 0 ? order.filter(([, p]) => p < y - 1).sort((a, b) => b[1] - a[1]) : order.filter(([, p]) => p > y + 1).sort((a, b) => a[1] - b[1]);
      if (ahead.length) target = ahead[0][0];
    }
    cancelAnimationFrame(frame); frame = 0;
    sheet.classList.remove('is-dragging');
    sheet.style.transform = '';
    setSheet(target);
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  sheet.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}

/* On phones the quick-filter chips open the one full-screen filter sheet at their section.
   "More" keeps its own sheet: it carries Juice, which the filter panel does not have. */
const CHIP_SECTION = { salary: 0, dept: 1, loc: 2, sen: 3, remote: 4 };
function openFiltersAt(id, opener = null) {
  if (filtersDirty || !panel) { filtersDirty = false; renderFilterPanel(); }
  const sec = panel?.[CHIP_SECTION[id]]?.el;
  if (sec) sec.open = true;
  // M-11: the chip's own section takes focus (setFiltersOpen would otherwise focus "Salary").
  setFiltersOpen(true, { opener, focus: sec?.querySelector('summary') });
  if (sec) requestAnimationFrame(() => sec.scrollIntoView({ block: 'start' }));
}

/** B-4 (fix-ui-6): set a custom property on the root only when its value changes (a write restyles the whole page). */
const rootVars = new Map();
function setRootVar(name, value) {
  if (rootVars.get(name) === value) return;
  rootVars.set(name, value);
  document.documentElement.style.setProperty(name, value);
}

/* The on-screen keyboard: iOS keeps the layout viewport, so fixed footers and bottom sheets sit
   under it. visualViewport tells us; body.kb-open lifts sheets to the top and hides the sticky footer. */
function bindKeyboardInsets() {
  const vv = window.visualViewport;
  if (!vv) return;
  // M-32: the keyboard is judged against the tallest view seen with no field focused (the layout viewport),
  // never against innerHeight alone: Mobile Safari on the iPhone SE shrinks innerHeight with the keyboard, so
  // "visual viewport under 78% of innerHeight" never held there and the sheet stayed 449px tall under it.
  let full = Math.max(document.documentElement.clientHeight || 0, innerHeight || 0, vv.height || 0);
  const typing = () => !!document.activeElement?.matches?.('input, textarea, select');
  const measure = () => {
    if (!typing()) full = Math.max(document.documentElement.clientHeight || 0, innerHeight || 0, vv.height || 0);
    else full = Math.max(full, document.documentElement.clientHeight || 0);
    const short = vv.height < full - 120; // any on-screen keyboard takes well over 120px
    // B-3 (fix-ui-6): a touch screen wider than 860 px (a phone in landscape, the Duo spanned) has the keyboard too, so the
    // filter sheet's "Show N roles" footer steps aside as on phones (styles.css); there only while a field is typed in.
    const open = short && (isMobile() ? typing() || (vv.offsetTop || 0) > 0 : isCoarse() && typing());
    document.body.classList.toggle('kb-open', open);
    if (!(short && typing())) document.body.classList.remove('kb-lift'); // M-47: the top bars come back with the keyboard down
    document.body.classList.toggle('kb-search', open && document.activeElement?.id === 'search'); // M-12: lift the peek row
    // B-4 (fix-ui-6): written only when they change. Every write to the root's inline style restyles the whole page (both
    // custom properties are inherited), even with the same value: on a tap on Filters (a focus change) that was two
    // full-page style passes in the frame where the sheet should start sliding, and again at each settle timer.
    setRootVar('--vvh', `${Math.round(vv.height)}px`);
    setRootVar('--vvt', `${Math.max(0, Math.round(vv.offsetTop || 0))}px`); // fix-company-scroll: iOS pans the visual viewport
  };
  const sync = rafThrottle(measure);
  // M-32: iOS can send its last resize before the keyboard animation ends, so measure again once it has settled.
  let settle = [];
  const resync = () => {
    sync();
    for (const t of settle) clearTimeout(t);
    settle = [120, 350, 700].map((ms) => setTimeout(() => requestAnimationFrame(measure), ms));
  };
  vv.addEventListener('resize', resync);
  vv.addEventListener('scroll', resync);
  document.addEventListener('focusin', (e) => {
    resync();
    const t = e.target;
    // M-52 (fix-phone-sizes): touch screens wider than 860 px (a phone in landscape, the Duo) have the keyboard too.
    if ((isMobile() || isCoarse()) && t.matches?.('#filters input, #popover input')) setTimeout(() => revealField(t), 300);
    // M-47: the Pay estimate's fields on any touch screen (a phone in landscape can be wider than 860 px).
    else if ((isMobile() || matchMedia('(hover: none) and (pointer: coarse)').matches) && t.matches?.('#insightsHost input:not([type=checkbox]):not([type=radio]):not([type=range])')) setTimeout(() => revealField(t), 300);
  });
  document.addEventListener('focusout', () => setTimeout(resync, 50));
}

/* M-24: a search or text field in the filter sheet or a popover moves near the top of its scrolling panel,
   so what it finds shows above the on-screen keyboard (the keyboard covers the screen's lower part; iOS keeps
   the layout viewport). Only the panel scrolls, never the page. */
function revealField(el) {
  if (!el?.isConnected || document.activeElement !== el) return;
  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const top = el.closest('.fsearch-wrap, label, .field, .msf-field') || el;
  // The top of what shows: the panel's, or the visual viewport's when iOS has panned it down past the panel's top.
  const vv = window.visualViewport;
  const viewTop = Math.max(box.getBoundingClientRect().top, vv?.offsetTop || 0);
  const delta = top.getBoundingClientRect().top - viewTop - 8;
  if (Math.abs(delta) > 4) box.scrollTop += delta;
  // M-47: in Insights on a short screen (landscape with the keyboard up: 200 px or less to see) the field can
  // still be under the keyboard, below the top bars: they step aside while it is typed in (styles.css
  // body.kb-lift), and come back when it loses focus or the keyboard closes (bindKeyboardInsets).
  const below = vv && el.getBoundingClientRect().bottom > vv.offsetTop + vv.height;
  if (below && el.closest('#insightsHost') && !document.body.classList.contains('kb-lift')) {
    document.body.classList.add('kb-lift');
    el.addEventListener('blur', () => document.body.classList.remove('kb-lift'), { once: true });
    requestAnimationFrame(() => revealField(el));
  }
}

let filtersOpener = null; // the chip or Filters button that opened the overlay sheet (M-4, M-15)
function setFiltersOpen(open, { opener = null, focus = null } = {}) {
  // PERF-2: a panel hidden while the list changed catches up the skipped sync when it opens. B-4 (fix-ui-6): a sheet
  // (below 1200 px) catches up just after the slide's first frame, so the tap's task is short and the slide starts at
  // the next frame; the compositor runs the slide while the panel renders (60–110 ms for Apple and Amazon at load 3).
  const catchUp = open && filtersDirty;
  if (catchUp && !isOverlayFilters()) { filtersDirty = false; renderFilterPanel(); }
  if (isOverlayFilters()) {
    const was = document.body.classList.contains('filters-open');
    document.body.classList.toggle('filters-open', open);
    $('#filtersScrim').hidden = !open;
    syncFiltersInert();
    setFiltersModal(open && isMobile());
    if (open) {
      if (!was || opener) filtersOpener = opener || filtersOpener;
      // M-26: the Filters button opens the sheet at its top, where focus goes (Salary); a chip passes its own section.
      if (!focus) $('#filterBody').scrollTop = 0;
      const giveFocus = () => {
        if (!document.body.classList.contains('filters-open')) return; // closed again meanwhile
        (focus?.isConnected ? focus : $('#filters summary'))?.focus({ preventScroll: true });
      };
      if (catchUp) {
        requestAnimationFrame(() => setTimeout(() => {
          if (filtersDirty && document.body.classList.contains('filters-open')) { filtersDirty = false; renderFilterPanel(); }
          giveFocus();
        }, 0));
      } else setTimeout(giveFocus, 50);
      if (!was) overlayHistPush('filters');
    } else if (was) {
      overlayHistRelease();
      // M-4: back to the control that opened the sheet (focus would otherwise fall to <body>).
      const back = filtersOpener?.isConnected && filtersOpener.getClientRects().length ? filtersOpener : $('#filtersToggle');
      filtersOpener = null;
      back?.focus({ preventScroll: true });
    }
    syncChipsExpanded();
  } else {
    document.body.classList.toggle('filters-collapsed', !open);
    try { localStorage.setItem('melon-seek.filtersCollapsed', open ? '0' : '1'); } catch { /* ignore */ }
  }
  $('#filtersToggle').setAttribute('aria-expanded', String(open));
  if (!open && vizCovered) { vizCovered = false; scheduleRender(); }
  setTimeout(() => { try { map?.invalidateSize(); } catch { /* ignore */ } }, 260);
}

/* UX-56: below 1200 px the filter panel is a sheet that a closed state only moves off screen (the phone's also
   hides it), so while closed it is inert and hidden from screen readers: Tab never lands on its off-screen
   "Reset" or "Show roles". The docked column (1200 px and up) is always live. */
function syncFiltersInert() {
  const f = $('#filters');
  if (!f) return;
  const off = isOverlayFilters() && !document.body.classList.contains('filters-open');
  if (f.inert === off) return;
  f.inert = off;
  if (off) f.setAttribute('aria-hidden', 'true'); else f.removeAttribute('aria-hidden');
}

/* M-7: on phones the filter sheet is full screen, so it is a modal dialog while open: dialog
   semantics, everything behind it inert, and Tab kept inside (bindEvents). Wider screens keep
   the plain labelled <aside> (a docked column, or a side sheet with its scrim). */
let filtersModal = false;
function setFiltersModal(on) {
  if (on === filtersModal) return;
  filtersModal = on;
  const f = $('#filters');
  if (on) { f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true'); } else { f.removeAttribute('role'); f.removeAttribute('aria-modal'); }
  for (const n of [$('.topbar'), $('.quickbar'), $('#main'), $('#results'), ...document.querySelectorAll('.skip-link')]) {
    if (!n) continue;
    n.inert = on;
    if (on) n.setAttribute('aria-hidden', 'true'); else n.removeAttribute('aria-hidden');
  }
}

/** M-15: chips that open the phone filter sheet say so (aria-controls) and report it (aria-expanded). */
function syncChipsExpanded() {
  const sheet = isMobile();
  const open = sheet && document.body.classList.contains('filters-open');
  for (const btn of $('#quickChips').children) {
    const id = btn.dataset.pop;
    const viaSheet = sheet && id in CHIP_SECTION;
    if (viaSheet) btn.setAttribute('aria-controls', 'filters'); else btn.removeAttribute('aria-controls');
    btn.setAttribute('aria-expanded', String(viaSheet ? open && filtersOpener === btn : popover.id === id));
  }
}
let vizCovered = false; // a viz update was skipped under the phone filter sheet
const filtersAreOpen = () => (isOverlayFilters() ? document.body.classList.contains('filters-open') : !document.body.classList.contains('filters-collapsed'));

/* ----------------------------------------------------------------- theme */

const THEME_KEY = 'melon-seek.theme';
const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = {
  system: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="10" rx="1.5"/><path d="M7.5 17h5M10 14v3"/></svg>',
  light: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"/></svg>',
  dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2Z"/></svg>',
};
function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}
function renderThemeBtn() {
  const t = currentTheme();
  const name = t[0].toUpperCase() + t.slice(1);
  const btn = $('#themeBtn');
  btn.innerHTML = THEME_ICON[t]; // static icon markup
  btn.setAttribute('aria-label', `Theme: ${name}`);
  btn.title = `Theme: ${name}${t === 'system' ? ' (follows your OS)' : ''} — press T to change`;
}
function setTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  renderThemeBtn();
  // palette.onThemeChange re-colours chart + map (MutationObserver on data-theme); force the
  // app's own palette-derived colours (card / checklist dots) and the viz to redraw as well.
  vizSig.chart = vizSig.map = '';
  scheduleRender();
  toast(`Theme: ${t[0].toUpperCase() + t.slice(1)}`);
}
const cycleTheme = () => setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]);

/* ---------------------------------------------------------------- events */

/** UX-21: the search box's placeholder fits the box: the long hint where there is room, else "Search roles" (its label). */
const SEARCH_HINT = 'Search titles, teams, skills…';
let hintCanvas = null;
function fitSearchHint() {
  const inp = $('#search');
  if (!inp) return;
  const cs = getComputedStyle(inp);
  if (!inp.clientWidth) return; // not laid out (hidden)
  const have = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  hintCanvas ??= document.createElement('canvas').getContext('2d');
  hintCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  // fix-phone-sizes: "Search" where even "Search roles" is cut (the 119 px box at 320–359 px), and only the magnifier
  // where "Search" is cut too (the one-row landscape bar at 560–639 px); the field's label stays "Search roles".
  const fits = (t) => hintCanvas.measureText(t).width <= have - 2;
  const next = [SEARCH_HINT, 'Search roles', 'Search'].find(fits) || '';
  if (inp.placeholder !== next) inp.placeholder = next;
}

function bindEvents() {
  const search = $('#search');
  fitSearchHint();
  // The box's width follows the top bar (the company name, the badge), not only the window.
  if ('ResizeObserver' in window) new ResizeObserver(rafThrottle(fitSearchHint)).observe(search);
  document.fonts?.ready?.then(fitSearchHint).catch(() => {});
  document.fonts?.ready?.then(() => fitSheetSoon()).catch(() => {}); // B-12: the first card's lines settle with the font
  let searchTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => set({ q: search.value.trim() }, { replace: true }), 120);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; set({ q: '' }, { replace: true }); }
    if (e.key === 'Enter') { lastHash = '__dirty'; commit(); search.blur(); }
  });

  $('.seg [data-mode="insights"]').addEventListener('pointerdown', loadInsights, { passive: true });
  for (const b of document.querySelectorAll('.seg [data-mode]')) b.addEventListener('click', () => {
    set({ m: b.dataset.mode });
    if (isMobile()) setSheet('peek'); // the new view shows first (QA UX-10)
  });
  $('#companyMenuBtn').addEventListener('click', (e) => togglePopover('company', e.currentTarget));
  $('#addBoardBtn').addEventListener('click', (e) => togglePopover('board', e.currentTarget));
  $('#dataBadge').addEventListener('click', (e) => togglePopover('badge', e.currentTarget));
  $('#refreshBtn').addEventListener('click', () => loadJobs({ refresh: true }));
  $('#themeBtn').addEventListener('click', cycleTheme);
  renderThemeBtn();
  $('#groupBy').addEventListener('change', (e) => { dropClusterArea(); set({ g: e.target.value }); });
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === S.v) return;
    dropClusterArea();
    // Keep an explicit grouping; otherwise follow the new view's default.
    set({ v, g: S.g === groupDefault(S.v) ? groupDefault(v) : S.g });
  });
  $('#sortBy').addEventListener('change', (e) => set({ sort: e.target.value }));
  $('#clearAll').addEventListener('click', clearFilters);
  $('#saveSearch').addEventListener('click', toggleSave);
  $('#filtersClear').addEventListener('click', clearFilters);
  $('#filtersToggle').addEventListener('click', (e) => setFiltersOpen(!filtersAreOpen(), { opener: e.currentTarget }));
  $('#filtersClose').addEventListener('click', () => setFiltersOpen(false));
  $('#filtersDone').addEventListener('click', () => setFiltersOpen(false));
  $('#filtersScrim').addEventListener('click', () => setFiltersOpen(false));
  $('#drawerBackdrop').addEventListener('click', () => closeDrawer());
  $('#sheetHandle').addEventListener('click', cycleSheet); // peek -> half -> full -> peek
  bindSheetDrag();
  bindKeyboardInsets();
  $('.results-head').addEventListener('click', (e) => { if (isMobile() && !e.target.closest('select, label')) setSheet(!document.body.classList.contains('sheet-open')); });
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); dropHeld(); set({ ...resetFiltersPatch(), job: null, m: 'chart' }); closeDrawer(); });

  const list = $('#resultsList');
  // M-43 / A-11: a preview card (the first page while a big board's list loads) is a card like the others:
  // a tap or Enter opens its job page at once (openDrawer shows its own fields while the rest loads), and
  // the arrow keys move between cards.
  list.addEventListener('click', (e) => {
    const c = e.target.closest(CARD_SEL);
    if (c) openDrawer(cardId(c));
  });
  list.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const c = e.target.closest(CARD_SEL);
    if (!c) {
      // M-20: focus handed to the list (its card scrolled out of the page) goes on from the first card in view.
      if (e.target === list && step) {
        e.preventDefault();
        const top = list.getBoundingClientRect().top;
        [...list.querySelectorAll(CARD_SEL)].find((x) => x.getBoundingClientRect().bottom > top + 4)?.focus();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(cardId(c)); }
    if (step) {
      e.preventDefault();
      focusResult(visible.findIndex((j) => j.id === cardId(c)) + step); // M-20: by result, not by card in the page
    }
  });
  list.addEventListener('scroll', () => { if (win.loaded > WINDOW_ALL) scheduleWindow(); }, { passive: true });
  const hover = (id) => { if (hoverId === id) return; hoverId = id; highlightViz(); };
  list.addEventListener('mouseover', (e) => { const c = e.target.closest('.card[data-id]'); hover(c ? c.dataset.id : null); });
  list.addEventListener('mouseleave', () => hover(null));
  list.addEventListener('focusin', (e) => { const c = e.target.closest('.card[data-id]'); if (c) hover(c.dataset.id); });
  list.addEventListener('focusout', () => hover(null));

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    // V7 (WCAG 2.1.4): single-character shortcuts fire only when focus is on the page, a card or the
    // drawer's scroll area — never on a button or field — and never with a modifier held.
    const mod = e.metaKey || e.ctrlKey || e.altKey;
    const t = e.target;
    const shortcutOk = !mod && !typing && (t === document.body || t === document.documentElement || t.closest?.('.card, .drawer-scroll') === t || t.id === 'drawer');
    if (e.key === '/' && shortcutOk) { e.preventDefault(); search.focus(); search.select(); return; }
    if ((e.key === 't' || e.key === 'T') && shortcutOk) { cycleTheme(); return; }
    if (e.key === 'Escape' && e.defaultPrevented) return; // V13/D-8: a widget (the comps list) used this Esc for itself
    if (e.key === 'Escape') {
      if (popover.id) { closePopover(); return; }
      if (drawerJobId) { closeDrawer(); return; }
      if (document.body.classList.contains('filters-open')) { setFiltersOpen(false); return; }
      if (document.body.classList.contains('sheet-open')) { setSheet(false); return; }
    }
    // D-6: the drawer opens with focus on its Back/close button, so its own nav buttons accept the step keys too.
    const stepOk = shortcutOk || (!mod && !typing && !!t.closest?.('#drawerClose, #drawerPrev, #drawerNext'));
    if (drawerJobId && stepOk && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'j' || e.key === 'k')) {
      stepDrawer(e.key === 'ArrowRight' || e.key === 'j' ? 1 : -1);
    }
    if (drawerJobId && e.key === 'Tab') trapFocus(e, $('#drawer'));
    // A-2: the data badge's popover sits at the end of the page, so Tab stays inside it while it is open.
    else if (popover.id === 'badge' && e.key === 'Tab') trapFocus(e, $('#popover'));
    else if (filtersModal && !popover.id && e.key === 'Tab') trapFocus(e, $('#filters'));
  });

  document.addEventListener('pointerdown', (e) => {
    if (!popover.id) return;
    if ($('#popover').contains(e.target) || popover.anchor?.contains(e.target)) return;
    closePopover(false);
  });
  addEventListener('resize', rafThrottle(() => {
    positionPopover();
    if (win.more?.isConnected) paintWindow(); // M-20: card heights follow the list's width
    if (document.body.classList.contains('filters-open')) { setFiltersModal(isMobile()); syncChipsExpanded(); } // rotation / resize across 860px
    syncFiltersInert(); // UX-56: across 1200px the panel turns from a docked column into a sheet, and back
    if (drawerJobId) { fitApplyLabel(); fitMetaLine(); } // M-49, B-2: a rotation changes the room for the Apply label and the meta line
    fitSheet(); // B-10, B-12: a rotation changes the first card and the room the chart's rows leave
  }));
  addEventListener('scroll', () => positionPopover(), true);

  addEventListener('popstate', onPopState);
  addEventListener('hashchange', onHashChange);
}

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])')]
    .filter((x) => x.getClientRects().length);
  if (!f.length) { e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (!root.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function onHashChange() {
  const next = parseHash();
  if (!next.c) next.c = S.c;
  const str = serialize(next);
  // The hashchange that trails a popstate we already handled (or our own write): nothing to do.
  // Re-rendering here would rebuild the cards and drop the focus closeDrawer just restored (M-16).
  if (str === lastHash && str === serialize() && (S.job || null) === (drawerJobId || null)) return;
  lastHash = str;
  const companyChanged = next.c !== S.c;
  if (next.g !== S.g || next.v !== S.v) dropClusterArea(); // D-7, also through Back/Forward
  S = next;
  resultsLimit = PAGE;
  if (companyChanged) { closeDrawer({ fromHash: true }); loadJobs(); return; }
  // fix-data-3: a link with an old place or department label on the board already open (places resolve before this render).
  const resolving = data.status === 'ready' && (S.l.length || S.d.length) ? resolveOldFilterKeys() : null;
  render();
  resolving?.then((changed) => { if (changed) render(); });
  if (S.job && S.job !== drawerJobId) openDrawer(S.job, { fromHash: true });
  else if (!S.job && drawerJobId) closeDrawer({ fromHash: true });
}

/* ------------------------------------------------------------------ boot */

/* D-27 / D-28 (shared decision 3): on the beta site the small Beta tag by the logo (index.html .beta-tag)
   links back to the main site, its name says so for screen readers, and the tab title reads "melon·seek beta". */
function markChannel() {
  if (CHANNEL !== 'beta') return;
  document.title = document.title.replace(/^melon·seek(?! beta)/, 'melon·seek beta');
  $('.brand')?.setAttribute('aria-label', 'melon·seek beta home');
  const tag = $('.beta-tag');
  if (!tag) return;
  tag.setAttribute('href', new URL('../', location.href).href); // the main site: dist/beta/ sits under it
  tag.hidden = false;
}

async function boot() {
  markChannel();
  try {
    if (localStorage.getItem('melon-seek.filtersCollapsed') === '1') document.body.classList.add('filters-collapsed');
  } catch { /* ignore */ }
  if (isOverlayFilters()) $('#filtersToggle').setAttribute('aria-expanded', 'false');
  syncFiltersInert();
  bindEvents();
  setSheet('peek');
  S = parseHash();
  // I-4: a return visit with no link reopens the last company and view (not always the first company).
  let restored = false;
  if (!String(location.hash).replace(/^#/, '')) {
    const last = lsGet(LAST_KEY, null);
    if (typeof last === 'string' && last) { S = parseHash(`#${last}`); S.job = null; restored = true; }
  }
  render();
  try {
    const list = await dataApi.getCompanies();
    companies = Array.isArray(list) && list.length ? list : FALLBACK_COMPANIES;
  } catch (err) {
    console.warn('companies failed', err);
    companies = FALLBACK_COMPANIES;
  }
  if (S.c && restored && !companies.some((c) => c.slug === S.c) && !isCustomKey(S.c)) { S = parseHash(''); restored = false; } // a company no longer listed
  if (!S.c) S.c = defaultCompany();
  lastHash = serialize();
  history.replaceState(null, '', location.pathname + location.search + (lastHash ? `#${lastHash}` : ''));
  await loadJobs();
  if (restored && data.status === 'ready' && (activeFilterCount() || S.c !== defaultCompany())) {
    toast(activeFilterCount() ? `Reopened where you left off: ${searchName()}` : `Reopened ${data.company?.name || 'your last company'}, where you left off`, 4000);
  }
}

/**
 * The company a visit without a link opens (and without a last view). Beta landing: the beta site is about
 * the big-tech boards, so it opens on the first Big tech board (the company menu's first group, static
 * `live: false`); the main site opens on its first company, as before.
 */
function defaultCompany() {
  const big = CHANNEL === 'beta' ? companies.find((c) => c.live === false && !c.custom) : null;
  return (big || companies[0])?.slug || 'anthropic';
}

/** I-4: remember the last view (company, filters, sort, mode; not the open role) for the next visit. */
const LAST_KEY = CHANNEL === 'beta' ? 'melon-seek.last.beta.v1' : 'melon-seek.last.v1'; // D-19: each site its own
let lastSaved = null;
function rememberView() {
  if (data.status !== 'ready' || MOCK) return;
  const str = serialize({ ...S, job: null });
  if (str === lastSaved) return;
  lastSaved = str;
  lsSet(LAST_KEY, str);
}

boot();

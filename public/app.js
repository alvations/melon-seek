// melon·seek — application shell.
// Owns state (mirrored in location.hash), data fetching, filters, the results
// list, the job drawer and the company switcher. Rendering of the salary
// chart and the map is delegated to ./viz/* (see docs/CONTRACT.md).

import { colorFor, formatMoney, resetColors, assignColors, otherColor, toUSD, SLOT_COUNT, hasFx, juiceNetForScore, JUICE_BREAKS } from './viz/palette.js';
import { createChart, keyOf, VIEWS, DEFAULT_VIEW } from './viz/chart.js';
import { createMap } from './viz/map.js';
import * as api from './api.js';
import { createCompstimateWidget, compstimateForJob, estimateView } from './features/compstimate.js';
import { compsForJob, compsNote, createCompsCard } from './features/comps.js';
import { loadFreshness, freshnessDoc, juiceAsOfText, juiceSpanText, marketAsOfText, compstimateAsOfText } from './features/freshness.js';
import { createCompsChart } from './viz/comps.js';
import { roleFamily, FAMILY_LABELS, readableTitle, levelLabel, displayLevel, NOT_STATED, DISPLAY_LEVEL_ORDER, levelKey, levelFromKey } from './features/roles.js';
import { payLocations } from './features/shared.js';
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
const SEN_TIP = {
  'Staff+': 'Staff, principal or distinguished level',
  'Director+': 'Director, head of, vice president or chief',
  Mid: 'A mid level the posting names (for example “III” or “L4”)',
  [NOT_STATED]: 'The posting’s title names no level',
};
/* The Seniority filter in the link (s=, roles.js levelKey): "Level not stated" keeps its old value 'Mid', so
   earlier links and saved searches still mean what they said; a stated mid level is 'Mid-level'. */
const SEN_NOTE = 'Staff+ means staff, principal and above. Director+ means director, head of, vice president and above. “Level not stated”: the title names no level.';
const SEN_OPTS = { labelOf: senLabel, tipOf: (k) => SEN_TIP[k] || null, note: SEN_NOTE };
/** I-6: what a city pick finds. */
const LOC_NOTE = 'A city also finds roles that list only its country or region, and remote-only roles in its country.';
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

// Made on first use: building it costs about 0.1 s at 4x CPU, and nothing at first paint needs it.
let regionNames;
const countryName = (cc) => {
  if (!cc) return 'Other';
  if (regionNames === undefined) {
    regionNames = null;
    try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old browser */ }
  }
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
  if (s.min === s.max || s.max == null) return money(s.min, s.currency);
  return moneyRange(s.min, s.max, s.currency);
}
const PER_UNIT = { hour: 'hour', day: 'day', week: 'week', month: 'month' };
/** P-8: fixed-term pay (salary.termWeeks) keeps the posted interval: { amount: "$3,850", per: "week" }, or null. */
function postedTerm(s) {
  if (!s || !(s.termWeeks > 0)) return null;
  const unit = PER_UNIT[s.originalInterval] || null;
  const f = { hour: 2080, day: 260, week: 52, month: 12 }[unit] || 1;
  const lo = s.min / f, hi = s.max / f;
  const a = postedMoney(lo, s.currency), b = postedMoney(hi, s.currency);
  return { amount: a === b ? a : `${a}–${b.replace(/^[^\d]+/, '')}`, per: unit, weeks: Math.round(s.termWeeks) };
}
/** "about 17 weeks" (P-8). */
const termText = (weeks) => `about ${plural(weeks, 'week')}`;
/** P-1: on-target earnings (base plus commission at target; salary.kind from server/salary.js). */
const isOte = (j) => j?.salary?.kind === 'ote';
/** P-8: pay for a fixed term (a fellowship or internship length), never a yearly salary. */
const isTerm = (j) => j?.salary?.termWeeks > 0;
const OTE_LABEL = 'On-target earnings (base plus commission at target)';

/** "$137K"–"$338K" -> "$137–338K" when units match; one figure when both ends show the same ("$44K", never "$44K–44K"). */
function compactRange(a, b) {
  const x = money(a), y = money(b);
  if (x === y) return x;
  const ux = x.slice(-1), uy = y.slice(-1);
  return ux === uy && /[KM]/.test(ux) ? `${x.slice(0, -1)}–${y.replace(/^[^\d]+/, '')}` : `${x}–${y.replace(/^[^\d]+/, '')}`;
}
/** "$59K–64K", or "$59K" when both ends round to the same figure (P-16). */
function moneyRange(a, b, currency = 'USD') {
  const x = money(a, currency), y = money(b, currency);
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

function ago(ts) {
  if (!ts) return null;
  const d = (Date.now() - ts) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 45) return `${Math.round(d / 86400)} d ago`;
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

const ARRAYS = ['d', 'l', 's', 'e', 'kr', 'kf', 'ks', 'jg'];
const DEFAULTS = {
  c: '', cn: '', m: 'chart', q: '', smin: null, smax: null, so: false,
  d: [], l: [], s: [], e: [], r: 'any', p: 0, ho: false, rf: '', kr: [], kf: [], ks: [], jg: [],
  v: DEFAULT_VIEW, g: 'department', sort: 'best', mc: 'pay', job: null,
};
const FILTER_KEYS = ['q', 'smin', 'smax', 'so', 'd', 'l', 's', 'e', 'r', 'p', 'ho', 'rf', 'kr', 'kf', 'ks', 'jg'];
const ORDER = ['c', 'cn', 'm', 'q', 'smin', 'smax', 'so', 'd', 'l', 's', 'e', 'r', 'p', 'ho', 'rf', 'kr', 'kf', 'ks', 'jg', 'v', 'g', 'sort', 'mc', 'job'];

let S = structuredClone(DEFAULTS);
let companies = [];
let boards = loadBoards();
let data = { status: 'idle', jobs: [], company: null, mode: null, fetchedAt: null, error: null };
let area = null; // { label, ids:Set } from map onAreaSelect — not shareable, so not in hash
let hoverId = null;
let resultsLimit = PAGE;
let lastHash = '';

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
  if (!p.has('g') || !['department', 'location', 'seniority', 'none'].includes(st.g)) st.g = groupDefault(st.v);
  if (st.p === 0) st.p = 0;
  return st;
}

/** Clusters need a grouping (department); ranges read best ungrouped. */
const groupDefault = (view) => (view === 'ranges' ? 'none' : 'department');
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
  for (const k of ORDER) {
    const v = st[k];
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
  $('#search').value = '';
  set(patch);
}

function activeFilterCount(st = S) {
  return (st.q ? 1 : 0) + (st.smin != null || st.smax != null ? 1 : 0) + (st.so ? 1 : 0) + (st.ho ? 1 : 0) + (st.rf ? 1 : 0) +
    st.d.length + st.l.length + st.s.length + st.e.length + (st.r !== 'any' ? 1 : 0) + (st.p ? 1 : 0) +
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
const deptKey = (j) => keyOf(j, 'department'); // same keys the chart colors by
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
    if (!best || e.score > best.score || (e.score === best.score && e.net > best.net)) best = e;
  }
  if (best && best.city === jb.best.city && best.locationName === jb.best.locationName) best = jb.best; // keeps its inputs
  j._jsFor = F; j._js = best;
  return best;
}
let viewSpec = null; // the filter spec of the last render (cards, sort and the drawer read Juice through it)
const empKey = (j) => j.employmentType || 'Unspecified';

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
    j.juice = j.juice && j.juice.best ? j.juice : null;
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
/** One RegExp per search word (lowercase), for the board `jobs`. */
function queryMatchers(q, jobs = data.jobs) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const vocab = vocabOf(jobs);
  return words.map((t) => {
    const start = '(?:^|[^\\p{L}\\p{N}])';
    if (WORD_SPLIT.test(t)) return new RegExp(start + reEsc(t), 'u');
    const whole = ALWAYS_WORDS.has(t) || vocab.has(t) || WORD_ENDINGS.some((e) => vocab.has(t + e));
    return new RegExp(start + reEsc(t) + (whole ? `${ENDINGS_RE}(?![\\p{L}\\p{N}])` : ''), 'u');
  });
}

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
    d: new Set(st.d), l, lCover: l.size ? placeCover(l, jobs) : null, s: new Set(st.s), e: new Set(st.e),
    r: st.r, p: st.p, ho: st.ho, rf: st.rf,
    kw: { responsibilities: st.kr, fit: st.kf, skills: st.ks },
    jg: new Set(st.jg),
  };
}

/** Returns the list of facet names this job fails (empty = passes all). */
function failures(j, F, now) {
  const out = [];
  if (F.q.length && !F.q.every((re) => re.test(j._hay))) out.push('q');
  const salActive = F.so || F.smin != null || F.smax != null;
  if (salActive && (!j._usd || (F.smin != null && j._usd.max < F.smin) || (F.smax != null && j._usd.min > F.smax))) out.push('sal');
  if (F.d.size && !F.d.has(deptKey(j))) out.push('d');
  if (F.l.size && !locMatches(j, F)) out.push('l');
  if (F.s.size && !F.s.has(senKey(j))) out.push('s');
  if (F.e.size && !F.e.has(empKey(j))) out.push('e');
  if (F.r === 'remote' && !j.remote) out.push('r');
  if (F.r === 'onsite' && !j.locations.some((l) => !l.remote)) out.push('r');
  if ((F.p && !(j._age != null && j._age <= F.p)) || (F.ho && j._age != null && j._age >= 180)) out.push('p');
  if (F.rf && famOf(j) !== F.rf) out.push('rf');
  if (F.jg.size) { const g = gradeOf(shownJuice(j, F)); if (!(g && F.jg.has(g))) out.push('jg'); }
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
  const fc = { d: new Map(), l: new Map(), lGroup: new Map(), s: new Map(), e: new Map(), r: { any: 0, remote: 0, onsite: 0 },
    p: { 0: 0, 7: 0, 30: 0, 90: 0 }, jg: new Map(), kw: { responsibilities: new Map(), fit: new Map(), skills: new Map() }, salMids: [],
    noPayHidden: 0, only: {} };
  const covers = coverIndex(jobs);
  const covered = new Map(); // city key -> postings that list only its country or region
  for (const j of jobs) {
    const fails = failures(j, F, now);
    if (fails.length > 1) continue;
    const only = fails[0];
    if (!only) filtered.push(j); // the chart/map draw the whole filtered set; a cluster/map area narrows the list in render()
    else fc.only[only] = (fc.only[only] || 0) + 1; // P-16: what an empty result is blocked by
    if (only === 'sal' && !j._usd) fc.noPayHidden++; // P-5: postings with no pay that the pay filter hides
    // D-2: with a cluster or map area active, the facet counts describe the roles in that area (the list).
    if (area && !area.ids.has(j.id)) continue;
    const counts = (facet) => !only || only === facet;
    if (!only) {
      for (const cat of ['responsibilities', 'fit', 'skills']) for (const k of j.keywords[cat]) bump(fc.kw[cat], k);
    }
    if (counts('d')) bump(fc.d, deptKey(j));
    if (counts('l')) {
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
    if (counts('s')) bump(fc.s, senKey(j));
    if (counts('e')) bump(fc.e, empKey(j));
    if (counts('r')) {
      fc.r.any++;
      if (j.remote) fc.r.remote++;
      if (j.locations.some((l) => !l.remote)) fc.r.onsite++;
    }
    if (counts('p')) {
      fc.p[0]++;
      for (const d of [7, 30, 90]) if (j._age != null && j._age <= d) fc.p[d]++;
      if (j._age != null && j._age >= 180) fc.p.old = (fc.p.old || 0) + 1;
    }
    if (counts('sal') && j._usd) fc.salMids.push(j._mid);
    if (counts('jg')) { const g = gradeOf(shownJuice(j, F)); if (g) bump(fc.jg, g); }
  }
  for (const [k, n] of covered) if (fc.l.has(k)) fc.l.set(k, fc.l.get(k) + n);
  return { filtered, fc };
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
  switch (eff) {
    case 'salary-asc': out.sort((a, b) => nullsLast(a._usd, b._usd, () => a._usd.mid - b._usd.mid || a.title.localeCompare(b.title))); break;
    case 'newest': out.sort((a, b) => nullsLast(a._age, b._age, () => a._age - b._age || a.title.localeCompare(b.title))); break;
    case 'title': out.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'juice': {
      // P-7: with a Location filter, a role's Juice is its best among the places picked.
      const jv = new Map(out.map((j) => [j, shownJuice(j)]));
      out.sort((a, b) => { const x = jv.get(a), y = jv.get(b); return nullsLast(x, y, () => y.score - x.score || y.net - x.net || a.title.localeCompare(b.title)); });
      break;
    }
    default: out.sort((a, b) => nullsLast(a._usd, b._usd, () => b._usd.mid - a._usd.mid || b._usd.max - a._usd.max || a.title.localeCompare(b.title)));
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
 * P-1: on-target earnings are never pooled with base pay (they count only when nothing else is left).
 */
function stats(list, F = viewSpec) {
  const base = [], ote = [];
  for (const j of list) {
    if (!j._usd) continue;
    if (F?.l.size && !locMatches(j, F, payLocations(j))) continue;
    (isOte(j) ? ote : base).push(j._mid);
  }
  const mids = (base.length ? base : ote).sort((a, b) => a - b);
  const depts = new Map();
  for (const j of list) depts.set(deptKey(j), (depts.get(deptKey(j)) || 0) + 1);
  const top = [...depts].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    n: list.length, withSalary: base.length + ote.length,
    median: quantile(mids, 0.5), p25: quantile(mids, 0.25), p75: quantile(mids, 0.75), top,
    oteOnly: !base.length && ote.length > 0, oteLeftOut: base.length ? ote.length : 0,
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
  render();
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
  }
  settleCarry();
  settleKeep();
  render();
  if (data.status === 'ready') fillFamilies(data.jobs);
  settleSaved();
  if (S.job) openDrawer(S.job, { fromHash: true });
  onScreen();
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

function render() {
  derived = data.status === 'ready' ? derive() : { filtered: [], fc: null };
  computeColorKeys(derived.filtered);
  const listed = area ? derived.filtered.filter((j) => area.ids.has(j.id)) : derived.filtered;
  visible = sortJobs(listed);

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
  if (data.status === 'error') return { label: 'Offline', cls: 'is-error', tip: `Couldn’t load this board: ${data.error}` };
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
      return { label: day ? `Snapshot · ${day}` : 'Snapshot', micro: day || 'Saved', cls: 'is-snapshot', sr, tip: `${tip}${failed ? `. ${failed}` : ''}.${only}` };
    }
    case 'demo':
      if (data.pending) return { label: 'Demo data · checking live…', short: 'Demo · checking live…', tiny: 'Checking live…', micro: 'Checking…', cls: 'is-demo is-pending', sr: 'demo data, checking the live board', tip: `Generated sample data, not real postings. ${checking}` };
      return { label: 'Demo data — live board unreachable', short: 'Demo data', tiny: 'Demo', cls: 'is-demo', tip: `Generated sample data, not real postings.${data.error ? ` Error: ${data.error}` : ''}` };
    default: return { label: String(data.mode), cls: '', tip: src };
  }
}
/** "Greenhouse / anthropic", or "<Name> careers site" for a built-in-only source (big-tech beta). */
function sourceText(c) {
  if (!c?.source) return '';
  return SOURCE_LABEL[c.source] ? `${SOURCE_LABEL[c.source]} / ${c.board}` : `${c.name || c.board} careers site`;
}
/** Static build, `live: false` company (docs/CONTRACT.md v3): served from its snapshot only. */
function bundleOnly(c) { return !!(api.isStatic?.() && c?.live === false); }

/** F7: open-data CSV for the current built-in company (server: /api/export, static: data/<slug>.csv). */
function csvLink() {
  const c = data.company;
  if (MOCK || !c?.slug || isCustomKey(S.c) || data.status !== 'ready') return null;
  const href = api.isStatic?.() ? `data/${encodeURIComponent(c.slug)}.csv` : `api/export?company=${encodeURIComponent(c.slug)}`;
  return h('p', { class: 'badge-csv' }, h('a', { href, download: true }, 'Download CSV'), // the server's Content-Disposition names the file
    h('span', { class: 'muted' }, ' · titles, teams, locations and posted pay; links to the original postings'));
}

function makeBadgeDetails() {
  // Built once per popover; sync() updates it in place, so focus on its button or link survives
  // a re-render (e.g. the live board replacing the snapshot while the popover is open).
  const tip = h('p');
  const dl = h('dl');
  const err = h('pre', { class: 'badge-error', hidden: true });
  const refresh = MOCK ? null : h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--block', onclick: () => { closePopover(false); loadJobs({ refresh: true }); } }, 'Refresh from the live board');
  const csv = h('div');
  const el = h('div', { class: 'badge-details' }, ...nn(tip, dl, err, refresh, csv));
  function sync() {
    const info = badgeInfo();
    const c = data.company || {};
    const rows = [
      ['Status', info?.label || '—'],
      ['Source', sourceText(c) || '—'],
      ['Fetched', data.fetchedAt ? `${new Date(data.fetchedAt).toLocaleString()} (${ago(data.fetchedAt)})` : '—'],
      ['Roles', data.jobs.length.toLocaleString()],
    ];
    tip.textContent = info?.tip || '';
    dl.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    // M-14: the raw error only when the sentence above doesn't already carry it.
    const raw = data.error && !(info?.tip || '').includes(data.error) ? data.error : '';
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
  pendingKeep = activeFilterCount() ? { name: c.name } : null;
  set({ c: c.slug, cn: c.custom ? c.name : '', job: null });
}
let pendingKeep = null;
/** After a company switch loads: drop the filter values the new board doesn't have, and say what was kept and dropped. */
function settleKeep() {
  const k = pendingKeep;
  pendingKeep = null;
  if (!k || data.status !== 'ready') return;
  const jobs = data.jobs;
  const kept = [], dropped = [];
  if (S.q) kept.push(`“${S.q}”`);
  if (S.smin != null || S.smax != null || S.so) kept.push(quickLabel('salary'));
  const keepArr = (key, exists, label = (x) => x) => {
    if (!S[key].length) return;
    const yes = S[key].filter(exists), no = S[key].filter((x) => !exists(x));
    kept.push(...yes.map(label));
    dropped.push(...no.map(label));
    S[key] = yes;
  };
  const any = (fn) => (x) => jobs.some((j) => fn(j, x));
  keepArr('d', any((j, x) => deptKey(j) === x));
  keepArr('l', (x) => { const F = { l: new Set([x]), lCover: placeCover([x], jobs) }; return jobs.some((j) => locMatches(j, F)); });
  keepArr('s', any((j, x) => senKey(j) === x), senLabel);
  keepArr('e', any((j, x) => empKey(j) === x), empLabel);
  for (const { key, cat } of KW_CATS) keepArr(key, any((j, x) => j.keywords[cat].includes(x)));
  keepArr('jg', any((j, x) => gradeKey(j) === x), (x) => `Juice: ${x}`);
  if (S.rf) {
    const label = FAMILY_LABEL[S.rf] || S.rf;
    if (jobs.some((j) => famOf(j) === S.rf)) kept.push(label); else { dropped.push(label); S.rf = ''; }
  }
  if (S.r !== 'any') {
    const label = S.r === 'remote' ? 'Remote' : 'On-site';
    if (jobs.some((j) => (S.r === 'remote' ? j.remote : j.locations.some((l) => !l.remote)))) kept.push(label); else { dropped.push(label); S.r = 'any'; }
  }
  if (S.p || S.ho) {
    if (hasListingDates()) kept.push('listing date'); else { dropped.push('listing date'); S.p = 0; S.ho = false; }
  }
  commit({ replace: true });
  const list = (a) => (a.length > 3 ? `${a.slice(0, 3).join(', ')} +${a.length - 3}` : a.join(', '));
  if (dropped.length) toast(`${kept.length ? `Kept ${list(kept)} · d` : 'D'}ropped ${list(dropped)} (not at ${k.name})`, 4500);
  else if (kept.length) toast(`Kept ${list(kept)}`, 3000);
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
  function sync() {
    const q = input.value.trim().toLowerCase();
    const all = allCompanies().filter((c) => !q || `${c.name} ${c.board} ${c.source}`.toLowerCase().includes(q));
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
    const saved = listSaved().filter((x) => !q || x.name.toLowerCase().includes(q));
    if (saved.length) {
      list.prepend(group('Saved searches', saved.map((x) => {
        const n = savedNewCount(x);
        return h('div', { class: 'saved-row' },
          h('button', { type: 'button', class: 'company-item', title: x.name, onclick: () => openSaved(x) },
            h('span', { class: 'saved-ico', html: ICON.bookmark }), h('span', { class: 'company-item-name' }, x.name),
            n ? h('span', { class: 'saved-new' }, `${n} new`) : null),
          h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': `Remove saved search ${x.name}`, html: ICON.close, onclick: () => { removeSaved(x.id); sync(); } }));
      })));
    }
  }
  /** M-21: the menu opens with the current company (✓) in view. */
  function reveal() {
    const cur = list.querySelector('.company-item[aria-current="true"]');
    if (!cur) return;
    const lr = list.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    if (cr.top < lr.top || cr.bottom > lr.bottom) list.scrollTop += cr.top - lr.top - Math.max(0, (lr.height - cr.height) / 2);
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
function markVisit(slug, jobs) {
  jobCache.set(slug, jobs);
  if (visit.slug === slug) return;
  const since = lsGet(seenKey(slug), null);
  const ids = lsGet(seenIdsKey(slug), null);
  visit = { slug, since: typeof since === 'string' ? since : null, seenIds: Array.isArray(ids) ? new Set(ids) : null };
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
const isNewJob = (job) => (visit.slug === S.c && isNewSince(job, visit.since, visit.seenIds)) || !!savedViewIds()?.has(job.id);
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
  for (const k of ['s', 'd', 'l', 'ks', 'kr', 'kf', 'jg', 'e']) for (const v of st[k]) parts.push(shown[k] ? shown[k](v) : v);
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
    case 'salary':
      if (S.smin != null && S.smax != null) return compactRange(S.smin, S.smax);
      if (S.smin != null) return `${money(S.smin)}+`;
      if (S.smax != null) return `Up to ${money(S.smax)}`;
      return S.so ? 'Has salary' : null;
    case 'dept': return summarize(S.d, 'Departments');
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
  save.hidden = !n || data.status !== 'ready';
  if (!save.hidden) {
    const on = !!currentSaved();
    save.classList.toggle('is-saved', on); // V9: one pattern — the label changes (Save/Saved), no aria-pressed
    save.querySelector('span:last-child').textContent = on ? 'Saved' : 'Save';
    save.setAttribute('aria-label', on ? 'Saved search — remove it' : 'Save this search');
    save.title = on ? 'Saved in this browser — click to remove. Saved searches are in the company menu.' : 'Save this search in this browser; the company menu shows it, with its new roles, next time';
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
  [/^(?:₩|krw)/, 'KRW'], [/^(?:₪|ils)/, 'ILS'], [/^(?:sek|nok|dkk|pln|czk|aed|sar|brl|mxn|twd)/, null], [/^\$/, 'USD'],
];
const CUR_TAILS = CUR_CODES.map(([re, cur]) => [new RegExp(`(?:${re.source.slice(1)})$`), cur]);
/** "£80,000" -> { usd: 108000, value: 80000, currency: 'GBP', read: true }; "" / "any" -> null; not understood -> undefined. */
function parsePay(txt) {
  let t = String(txt).trim().toLowerCase().replace(/\s+/g, '').replace(/(?:\/|per|a)?(?:yr|year|annum)$/, '');
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
  const usd = cur === 'USD' ? value : Math.round(toUSD(value, cur) / 1000) * 1000;
  return { usd, value, currency: cur, read: read || cur !== 'USD' };
}
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
  const toggleRow = h('label', { class: 'switch-row' }, h('span', null, 'Only show jobs with salary'), toggle);
  const noPay = h('p', { class: 'fnote salary-nopay', hidden: true });
  const note = h('p', { class: 'fnote' });
  const empty = h('p', { class: 'fnote' }, 'No salary information on this board.');
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
    set({ smin, smax }, { replace: true });
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
    let a = S.smin, b = S.smax;
    const x = v == null || !(v.usd > 0) ? null : v.usd;
    if (which === 'lo') { a = x; if (a != null && b != null && a > b) b = a; }
    else { b = x; if (a != null && b != null && b < a) a = b; }
    typedPay[which] = x != null && (v.read || x < dom.lo || x > dom.hi) ? { usd: x, raw, v } : null;
    lo.value = a ?? dom.lo; hi.value = b ?? dom.hi;
    set({ smin: a, smax: b });
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
      const how = t.v.currency !== 'USD' ? `${postedMoney(t.v.value, t.v.currency)} ≈ ${usd} a year` : t.v.read ? `“${t.raw}” read as ${usd} a year` : `${usd} a year`;
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
    const minShow = S.smin == null ? 'Any' : money(S.smin);
    const maxShow = S.smax == null ? 'Any' : money(S.smax);
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
    // P-5: say when the pay filter hides postings that list no pay.
    const hidden = derived.fc?.noPayHidden || 0;
    noPay.textContent = hidden ? `${plural(hidden, 'role')} that ${hidden === 1 ? 'lists' : 'list'} no pay ${hidden === 1 ? 'is' : 'are'} hidden while a pay filter is on.` : '';
    noPay.hidden = !hidden;
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
    note.textContent = `A role matches if its range overlaps yours. You can type another currency (£80,000, A$350k)${foreign ? '; all pay is compared in approx US dollars' : ''}.${unclear ? ` ${unclear} with unclear pay ${unclear === 1 ? 'is' : 'are'} left out.` : ''}`;
    paint();
  }
  return { el, sync };
}

function makeChecklist(facet, { searchable = 'auto', grouped = false, limit = 8, order = null, colorDim = null, labelOf = (k) => k, tipOf = null, note = null } = {}) {
  let query = '';
  let expanded = false;
  const input = h('input', { type: 'search', class: 'fsearch', placeholder: 'Search…', 'aria-label': 'Search options' });
  const searchWrap = h('div', { class: 'fsearch-wrap' }, h('span', { html: ICON.search }), input);
  const list = h('div', { class: 'checklist', role: 'group' });
  const more = h('button', { type: 'button', class: 'link-btn more-btn' });
  const el = h('div', { class: 'checklist-wrap' }, searchWrap, list, more, note ? h('p', { class: 'fnote' }, note) : null);
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
    let items = [...new Set([...counts.keys(), ...selected])].map((k) => ({ key: k, count: counts.get(k) || 0 }))
      .filter((it) => it.count > 0 || selected.has(it.key));
    if (order) items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    else items.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    const showSearch = searchable === true || (searchable === 'auto' && items.length > 8);
    searchWrap.hidden = !showSearch;
    if (query) items = items.filter((it) => it.key.toLowerCase().includes(query) || String(labelOf(it.key)).toLowerCase().includes(query));
    const hadFocus = list.contains(document.activeElement) ? document.activeElement.value : focusKey;
    focusKey = null;

    const row = (it) => {
      const id = `f-${facet}-${btoa(unescape(encodeURIComponent(it.key))).replace(/[^a-z0-9]/gi, '')}-${uid}`;
      return h('label', { class: `check${it.count === 0 ? ' is-zero' : ''}`, for: id, title: tipOf?.(it.key) || null },
        h('input', { type: 'checkbox', id, value: it.key, checked: selected.has(it.key) }),
        h('span', { class: 'check-box', 'aria-hidden': 'true' }),
        colorDim && colorBy() === colorDim && it.key !== 'Remote' && !/^Remote/.test(it.key) ? h('span', { class: 'dot dot--sm', style: `--dot:${vizColor(it.key)}`, 'aria-hidden': 'true' }) : null,
        h('span', { class: 'check-label' }, labelOf(it.key)), h('span', { class: 'check-count' }, it.count));
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
    const hidden = items.length - shown;
    more.hidden = !(hidden > 0 || (expanded && items.length > limit)) || !!query;
    more.textContent = expanded ? 'Show fewer' : `Show all ${items.length}`;
    if (hadFocus) list.querySelector(`input[value="${cssId(hadFocus)}"]`)?.focus();
  }
  const uid = Math.random().toString(36).slice(2, 7);
  return { el, sync };
}

function makeRemote() {
  const opts = [['any', 'Any'], ['remote', 'Remote'], ['onsite', 'On-site']];
  const el = h('div', { class: 'seg seg--block', role: 'group', 'aria-label': 'Remote' });
  const btns = opts.map(([v, label]) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => set({ r: v }) }, h('span', null, label), h('span', { class: 'seg-count' }));
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
  ['Dry', 'Thin margin or less (under 45)'],
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
  const note = h('p', { class: 'fnote' });
  return {
    el: h('div', null, el, note),
    sync() {
      for (const [g, b] of btns) {
        b.setAttribute('aria-pressed', String(S.jg.includes(g)));
        b.querySelector('.kw-count').textContent = derived.fc?.jg.get(g) || 0;
      }
      const scored = data.jobs.filter((j) => j.juice).length;
      note.textContent = scored ? `${scored} of ${data.jobs.length} roles have a Juice Score (needs a salary and a known city).` : 'No Juice Scores for this board yet.';
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
      section('Department', makeChecklist('d', { colorDim: 'department' }), { badge: sel('d') }),
      section('Location', makeChecklist('l', { grouped: true, limit: 10, searchable: 'auto', colorDim: 'location', note: LOC_NOTE }), { badge: sel('l') }),
      section('Seniority', makeChecklist('s', { order: SENIORITY_SHOWN, limit: 10, colorDim: 'seniority', ...SEN_OPTS }), { badge: sel('s') }),
      section('Remote', makeRemote(), { badge: sel('r') }),
      ...KW_CATS.map((k) => section(k.title, makeCloud(k), { badge: sel(k.key) })),
      section('Employment type', makeChecklist('e', { limit: 6, labelOf: empLabel }), { open: false, badge: sel('e') }),
      section('Listed', makePosted(), { open: false, badge: sel('p') }),
    ];
    body.replaceChildren(...panel.map((s) => s.el));
  }
  for (const s of panel) s.sync();
  const counts = { sal: (S.smin != null || S.smax != null ? 1 : 0) + (S.so ? 1 : 0), d: S.d.length, l: S.l.length, s: S.s.length, r: S.r !== 'any' ? 1 : 0, kr: S.kr.length, kf: S.kf.length, ks: S.ks.length, e: S.e.length, p: (S.p ? 1 : 0) + (S.ho ? 1 : 0) };
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
    case 'dept': return [makeChecklist('d', { limit: 12, colorDim: 'department' })];
    case 'loc': return [makeChecklist('l', { grouped: true, limit: 14, note: LOC_NOTE })];
    case 'sen': return [makeChecklist('s', { order: SENIORITY_SHOWN, limit: 10, ...SEN_OPTS })];
    case 'remote': return [makeRemote()];
    case 'more': return [
      titled('Pay', makeSwitch('Only show jobs with salary', 'so')),
      titled('Juice', makeJuiceChips(), 'What’s left after tax, rent and living'),
      titled('Employment type', makeChecklist('e', { limit: 6, labelOf: empLabel })),
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
  requestAnimationFrame(() => [...el.querySelectorAll('.pop-body input:not([type=range]), .pop-body button.kw, .pop-body select, .pop-body .range, .pop-body button:not(.icon-btn), .pop-body label.check input')]
    .find((x) => x.getClientRects().length && !x.closest('[hidden]'))?.focus({ preventScroll: true }));
}

function clearPopoverFacet(id) {
  const patches = {
    salary: { smin: null, smax: null, so: false }, dept: { d: [] }, loc: { l: [] }, sen: { s: [] }, remote: { r: 'any' },
    more: { so: false, e: [], p: 0, ho: false, kr: [], kf: [], ks: [], jg: [] },
  };
  set(patches[id] || {});
}

function syncPopover() {
  if (!popover.id) return;
  for (const p of popover.parts) p.sync?.();
  const done = $('#popover .pop-done');
  if (done) done.textContent = `See ${plural(visible.length, 'role')}`;
}

function positionPopover() {
  const el = $('#popover');
  if (!popover.anchor || el.hidden) return;
  if (matchMedia('(max-width: 860px)').matches) { el.style.left = el.style.top = ''; return; }
  const r = popover.anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.top = `${r.bottom + 8}px`;
  el.style.left = `${Math.max(12, Math.min(r.left, innerWidth - w - 12))}px`;
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
          if (S.c === `${b.source}:${b.board}`) set({ c: companies[0]?.slug || 'anthropic', cn: '', job: null });
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
  const item = (strong, rest, title) => h('span', { class: 'stat', title }, h('strong', null, strong), rest ? ` ${rest}` : null);
  const ote = st.oteOnly ? 'on-target earnings, ' : '';
  const left = st.oteLeftOut ? `; ${plural(st.oteLeftOut, 'posting')} with on-target earnings (base plus commission) left out` : '';
  const share = st.top && st.n > 1 ? st.top[1] / st.n : 0;
  const parts = [
    item(st.n.toLocaleString(), st.n === total ? plural(st.n, 'role').replace(/^[\d,]+ /, '') : `of ${total.toLocaleString()} roles`),
    // P-6: with a Location filter, the share counts pay that applies there ("22% show pay for London").
    st.n ? item(`${pct}%`, viewSpec?.l.size ? `show pay for ${viewSpec.l.size === 1 ? [...viewSpec.l][0] : 'these places'}` : 'show pay',
      `${st.withSalary} of ${st.n} postings include a pay range${here}${here ? ' (a pay range in another country’s currency is not counted)' : ''}`) : null,
    st.median != null ? item(money(st.median), st.oteOnly ? 'median on-target earnings' : 'median',
      `Half of these roles pay more than this and half less (the middle of each posted range, ${ote}approx US dollars${here}${left})`) : null,
    st.p25 != null && st.p75 != null && money(st.p25) !== money(st.p75)
      ? h('span', { class: 'stat', title: `Half of these roles have a pay midpoint between ${money(st.p25)} and ${money(st.p75)}${here}` }, 'half between ', h('strong', null, money(st.p25)), ' and ', h('strong', null, money(st.p75))) : null,
    // P-6: "mostly" only for a real majority (it read "mostly Sales" at 19%).
    share > 0.5 ? h('span', { class: 'stat stat--top', title: `${st.top[1]} of ${st.n} roles (${Math.round(share * 100)}%)` }, 'mostly ', h('strong', null, st.top[0])) : null,
  ].filter(Boolean);
  el.replaceChildren(...parts.flatMap((p, i) => (i ? [h('span', { class: 'stat-sep', 'aria-hidden': 'true' }, '·'), p] : [p])));
}

/** I-2: one line on what the site is ("Pay, and what's left after tax and rent, for 8 tech companies' open roles"). */
function renderTagline() {
  const el = $('#tagline');
  if (!el) return;
  const n = companies.filter((c) => !c.custom).length;
  const text = `Pay, and what’s left after tax and rent, for ${n ? `${n} companies’` : 'tech companies’'} open roles`;
  if (el.dataset.text !== text) {
    el.dataset.text = text;
    el.replaceChildren(h('strong', { class: 'tagline-brand' }, 'melon·seek'), h('span', { class: 'tagline-sep', 'aria-hidden': 'true' }, ' · '), text);
  }
  document.body.classList.toggle('is-filtered', activeFilterCount() > 0 || !!area);
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

function renderViz() {
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
  $('#groupBy').value = S.g;
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
  if (data.status === 'error') {
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ icon: ICON.alert, title: 'Couldn\u2019t load this board', body: data.error || 'Unknown error', action: ['Retry', () => loadJobs()], tone: 'error' }));
    return;
  }
  if (data.status === 'unknown') {
    overlay.hidden = false;
    overlay.replaceChildren(stateCard(notHereState()));
    return;
  }
  const jobs = derived.filtered;

  if (!data.jobs.length) {
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ title: 'No open roles on this board', body: 'The board returned zero postings. Check the slug or try another company.' }));
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
  const sig = jobs.map((j) => j.id).join(',') + (S.m === 'chart' ? `|${S.v}|${S.g}` : `|${S.mc}|${juiceHousehold}`);
  if (vizSig[S.m] !== sig) {
    vizSig[S.m] = sig;
    try {
      if (S.m === 'chart') chart.update(jobs, { view: S.v, groupBy: S.g, colorBy: colorBy() });
      // Fit once per company load (map.js pads by half a pin, lowers minZoom as needed and
      // waits for a hidden container to be sized); plain updates keep the user's viewport.
      else if (mapFitPending) { mapFitPending = false; map.update(jobs, { fit: true, colorMode: S.mc }); }
      else map.update(jobs, { colorMode: S.mc });
      if (S.m === 'map') map.setJuiceNote?.(juiceSpanText(jobs.map((j) => j.juice && j.juice.best).filter(Boolean)));
    } catch (err) { console.error('viz update failed', err); }
  }
  highlightViz();
}

/** Colour follows the grouping (department when ungrouped), so the chart has a single colour story. */
const colorBy = () => (S.g === 'none' ? 'department' : S.g);

function computeColorKeys(jobs) {
  colorKeys = new Set();
  const dim = colorBy();
  const counts = new Map();
  for (const j of jobs) if (j._usd) { const k = keyOf(j, dim); counts.set(k, (counts.get(k) || 0) + 1); }
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
  for (const k of ['d', 'l', 's', 'e']) if (st[k].length) on.push(k);
  if (st.r !== 'any') on.push('r');
  if (st.p || st.ho) on.push('p');
  if (st.rf) on.push('rf');
  if (st.jg.length) on.push('jg');
  if (st.kr.length || st.kf.length || st.ks.length) on.push('kw');
  return on;
}
const dropFacet = (f) => () => { const [, patch] = FACET_OFF[f](); if ('q' in patch) $('#search').value = ''; set(patch); };
/** { title, body, action } for an empty result: the one filter to blame, or the one whose removal helps most. */
function emptyState() {
  const on = activeFacets();
  const only = derived.fc?.only || {};
  const noPay = derived.fc?.noPayHidden || 0;
  const payNote = noPay ? ` ${plural(noPay, 'role')} that ${noPay === 1 ? 'lists' : 'list'} no pay ${noPay === 1 ? 'is' : 'are'} hidden by it.` : '';
  if (on.length === 1) {
    const f = on[0];
    const [label] = FACET_OFF[f]();
    if (f === 'q') return { title: `No roles match “${S.q}”`, body: 'Check the spelling, or try a shorter or different word.', action: ['Clear the search', dropFacet('q')] };
    if (f === 'sal') return { title: 'No roles in this pay range', body: `Try a wider range.${payNote}`, action: ['Remove the pay filter', dropFacet('sal')] };
    return { title: 'No roles match', body: `Nothing here fits ${label}.`, action: [`Remove ${label}`, dropFacet(f)] };
  }
  const best = on.filter((f) => only[f] > 0).sort((a, b) => only[b] - only[a])[0];
  if (best) {
    const [label] = FACET_OFF[best]();
    return { title: 'No roles match every filter', body: `Without ${label} there would be ${plural(only[best], 'role')}.${best === 'sal' ? payNote : ''}`, action: [`Remove ${label}`, dropFacet(best)] };
  }
  return { title: 'No roles match', body: 'Nothing fits every filter you’ve set.', action: ['Clear filters', clearFilters] };
}

/** D-19 / M-22: the plain message for a company this site doesn't list (no Offline, no Retry). */
function notHereState() {
  const name = data.company?.name || S.c;
  return {
    title: 'This board isn\u2019t on this site',
    body: `melon\u00b7seek doesn\u2019t list ${name}\u2019s jobs here. Choose a company from the menu.`,
    action: ['Choose a company', () => togglePopover('company', $('#companyMenuBtn'))],
  };
}

function stateCard({ icon = null, title, body, action = null, tone = '' }) {
  return h('div', { class: `state-card ${tone ? `state-card--${tone}` : ''}` },
    icon ? h('div', { class: 'state-ico', html: icon }) : h('div', { class: 'state-ico state-ico--melon' }, h('img', { src: 'favicon.svg', alt: '' })),
    h('h3', null, title), body ? h('p', null, body) : null,
    action ? h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: action[1] }, action[0]) : null);
}

/* --------------------------------------------------------------- results */

let newestOpt = null, bestOpt = null;
function renderResults() {
  const list = $('#resultsList');
  const title = $('#resultsTitle');
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
  if (data.status !== 'ready' || !visible.length) { win.sig = ''; win.more = null; listIO?.disconnect(); listIO = null; }
  if (data.status === 'loading' || data.status === 'idle') {
    title.textContent = 'Loading roles…';
    list.replaceChildren(...Array.from({ length: 7 }, () => h('li', { class: 'card card--sk', 'aria-hidden': 'true' },
      h('div', { class: 'sk sk-line', style: 'width:72%' }), h('div', { class: 'sk sk-line', style: 'width:48%' }), h('div', { class: 'sk sk-line', style: 'width:30%' }))));
    return;
  }
  if (data.status === 'error') {
    title.textContent = 'No data';
    list.replaceChildren(h('li', { class: 'list-empty' }, stateCard({ icon: ICON.alert, title: 'Board unavailable', body: 'We couldn\u2019t reach the API.', action: ['Retry', () => loadJobs()], tone: 'error' })));
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
  title.replaceChildren(...nn(h('strong', null, plural(n, 'role')), inTitle != null ? h('span', { class: 'muted', title: why }, ` · ${inTitle.toLocaleString()} in title`) : null));
  if (!visible.length) {
    list.replaceChildren(h('li', { class: 'list-empty' }, stateCard(data.jobs.length ? emptyState()
      : { title: 'No open roles', body: 'This board has no postings right now.' })));
    return;
  }
  // M-19: a new result set (another sort, filter, area or board) starts at the top of the list; the same
  // set re-rendered (a view switch, the live board replacing the snapshot) keeps its place and its pages.
  const sig = `${visible.length}|${visible.map((j) => j.id).join(',')}`;
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
const win = { sig: '', keep: false, loaded: 0, heights: new Map(), width: 0, gap: 8, base: 0, els: new Map(), top: null, bottom: null, more: null, btn: null };
let listIO = null;

/** Rebuild the list's cards (state changed): the note, the window, the spacers and "Show more". */
function buildWindow(list) {
  listIO?.disconnect();
  listIO = null;
  const cs = getComputedStyle(list);
  win.gap = parseFloat(cs.rowGap) || 0;
  const note = juiceScaleNote(visible.slice(0, PAGE));
  if (note) note.setAttribute('role', 'none');
  const spacer = () => h('li', { class: 'list-spacer', 'aria-hidden': 'true', role: 'none' });
  win.top = spacer();
  win.bottom = spacer();
  win.els = new Map();
  win.btn = h('button', { type: 'button', class: 'btn btn--ghost btn--block', onclick: () => loadMore() });
  win.more = h('li', { class: 'list-more', role: 'none' }, win.btn);
  const focusId = document.activeElement?.closest?.('#resultsList .card[data-id]')?.dataset.id;
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
    if (!li) { li = card(job, i + 1, visible.length); win.els.set(job.id, li); added.push(li); }
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
  const rest = visible.length - n;
  win.more.style.display = rest > 0 ? '' : 'none';
  if (rest > 0) win.btn.textContent = `Show ${Math.min(PAGE * 2, rest).toLocaleString()} more of ${rest.toLocaleString()}`;
  else { listIO?.disconnect(); listIO = null; }
  // Measure the new cards (every card after a resize); when that moves the window's edges, place it again.
  let changed = false;
  for (const li of resized ? [...win.els.values()] : added) {
    const id = li.firstElementChild?.dataset.id;
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
  return h('li', { class: 'juice-scale' }, h('strong', null, '🍉 Juice'), ` is the money left a year after tax, rent and living costs, ${hhFor(juiceHousehold)}. ${juiceScaleText()}.`);
}

const JUICE_TIP = 'Juice: money left a year after tax, rent and living costs';
/** "for one person", "for a couple", "for a family of four" (the household the Juice figures are for). */
const HH_FOR = { single: 'for one person', couple: 'for a couple', family: 'for a family of four' };
const hhFor = (key) => HH_FOR[key] || HH_FOR.single;
/** I-3: the grade scale in dollars, from the same score curve the map legend uses (palette.js). */
function juiceScaleText() {
  const [ripe, juicy] = JUICE_BREAKS;
  const r = money(juiceNetForScore(ripe)), j = money(juiceNetForScore(juicy));
  return `Juicy: ${j} or more a year · Ripe: ${r}–${j.replace(/^\$/, '')} · Dry: under ${r} · Rind: nothing left`;
}
function juiceBadge(job) {
  const b = shownJuice(job);
  if (!b) return null;
  const place = b.locationName || b.cityName;
  // I-3: no bare "≈" before the score; "estimated" is said in words in the tooltip.
  return h('span', { class: `juice-badge juice--${String(b.grade).toLowerCase()}`,
    title: `${JUICE_TIP}${isTerm(job) ? ' (while the fixed-term pay lasts)' : ''}. ${b.grade} ${hhFor(job.juice.household)} in ${place}: ${stepMoney(b.net, 100)} a year left${b.estimated ? ' (some costs estimated)' : ''}. ${juiceScaleText()}.`,
    'aria-label': `Juice Score ${b.score}, ${b.grade}, ${hhFor(job.juice.household)} in ${place}` }, `🍉 ${b.score} · ${b.grade}`);
}

/** Card location: with a Location filter, a matching place comes first (P-7, "a DC list led with Huntsville"). */
function locSummary(job, max = 1) {
  const named = (l) => (l.remote ? l.name || 'Remote' : l.city && l.region ? `${l.city}, ${l.region}` : l.name);
  let locs = job.locations;
  if (viewSpec?.l.size && locs.length > 1) {
    const hit = locs.filter((l) => locMatches(job, viewSpec, [l]));
    if (hit.length) locs = [...hit, ...locs.filter((l) => !hit.includes(l))];
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
const MONTH_YEAR_OPTS = { month: 'short', year: 'numeric' };
let monthYearFmt = null;
const monthYear = (d) => (Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, MONTH_YEAR_OPTS) : (monthYearFmt ||= new Intl.DateTimeFormat(undefined, MONTH_YEAR_OPTS)).format(d));
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

/** P-1/P-8: the card's pay pill: as posted for fixed-term pay ("$3,850/week"), the range otherwise. */
function payPill(job) {
  const term = postedTerm(job.salary);
  if (term) return { text: term.per ? `${term.amount}/${term.per}` : term.amount, tip: `${term.amount}${term.per ? ` a ${term.per}` : ''} for ${termText(term.weeks)} (fixed-term pay, not a yearly salary)` };
  const range = salaryRange(job.salary);
  if (!range) return null;
  if (isOte(job)) return { text: range, tip: OTE_LABEL };
  return { text: range, tip: null };
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
  const el = h('li', { 'aria-posinset': pos, 'aria-setsize': size }, h('article', {
    class: `card${isOpen ? ' is-open' : ''}`, dataset: { id: job.id }, tabindex: '0', role: 'button',
    'aria-label': `${job.title}${pool ? `, ${POOL_LABEL}` : ''}, ${pay ? `${pay.text}${pay.tip ? ` (${pay.tip})` : ''}` : job.salaryFlag ? 'pay unclear, see posting' : 'salary not listed'}, ${locSummary(job, 3)}`, style: `--stripe:${color}`,
  },
  h('div', { class: 'card-top' },
    h('h3', { class: 'card-title' }, job.title),
    h('div', { class: 'card-pay' },
      pay ? h('span', { class: 'sal-pill', title: pay.tip }, pay.text)
        : job.salaryFlag ? h('span', { class: 'sal-pill sal-pill--unclear', title: job.salaryFlag.reason || 'Pay unclear' }, 'Pay unclear')
          : h('span', { class: 'sal-pill sal-pill--none' }, 'No salary'),
      // The tablet column puts the age here, beside the title's second line (styles.css).
      ageText(job) ? h('span', { class: 'card-age-top', 'aria-hidden': 'true', title: ageTitle(job) }, ageText(job).replace(/^Listed (?!today)/, '')) : null)),
  h('div', { class: 'card-meta' },
    h('span', { class: 'card-dot', style: `--dot:${color}`, 'aria-hidden': 'true' }),
    h('span', { class: 'card-dept' }, deptKey(job)), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
    h('span', { class: 'card-loc' }, locSummary(job, 1)), job.remote ? h('span', { class: 'tag tag--remote' }, 'Remote') : null),
  h('div', { class: 'card-foot' },
    level ? h('span', { class: `sen sen--${level.toLowerCase().replace(/\W/g, '')}`, title: SEN_TIP[level] || null }, senLabel(level)) : null,
    pool ? h('span', { class: 'tag tag--pool', title: POOL_TIP }, POOL_LABEL) : null,
    juice,
    // P-1: on-target pay takes the first keyword slot (a plain-words label, not a status).
    ote ? h('span', { class: 'tag tag--pay', title: OTE_LABEL }, 'On-target earnings') : null,
    ...footTags(job, { level: level ? senLabel(level) : '', juice: juice?.textContent || '', status: status?.textContent || '', ote, age: ageText(job), slots: pool ? 0 : Math.max(0, 2 - (juice ? 1 : 0) - (status ? 1 : 0) - (ote ? 1 : 0)) }).map((t) => h('span', { class: 'tag' }, t)),
    status, // at most one status tag, in the second keyword slot (ROADMAP §8)
    ageText(job) ? h('span', { class: 'card-age', title: ageTitle(job) }, ageText(job)) : null)));
  return el;
}

/* ---------------------------------------------------------------- drawer */

let drawerJobId = null;
let drawerReturnFocus = null;

function findJob(id) { return data.jobs.find((j) => j.id === id); }

function openDrawer(id, { fromHash = false, step = false } = {}) {
  const job = findJob(id);
  if (!job) { if (fromHash && data.status === 'ready') set({ job: null }, { replace: true }); return; }
  if (!drawerJobId || !drawerReturnFocus) {
    drawerReturnFocus = document.activeElement && document.activeElement !== document.body && !$('#drawer').contains(document.activeElement) ? document.activeElement : null;
  }
  drawerJobId = id;
  setBackgroundInert(true);
  // M-9: paging next/prev rewrites the job page's entry, so one Back always leaves the job page.
  if (S.job !== id) { S.job = id; commit({ replace: fromHash || step }); }
  const drawer = $('#drawer');
  drawer.replaceChildren(...drawerContent(job));
  applyDrawerBudget();
  drawer.hidden = false;
  $('#drawerBackdrop').hidden = false;
  requestAnimationFrame(() => { drawer.classList.add('is-open'); $('#drawerBackdrop').classList.add('is-open'); });
  drawer.scrollTop = 0;
  drawer.querySelector('.drawer-scroll')?.scrollTo(0, 0);
  for (const c of document.querySelectorAll('.card.is-open')) c.classList.remove('is-open');
  $(`.card[data-id="${cssId(id)}"]`)?.classList.add('is-open');
  highlightViz();
  renderDrawerNav();
  $('#drawerClose')?.focus({ preventScroll: true }); // always — including deep links and Back/Forward
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
  const target = drawerReturnFocus?.isConnected ? drawerReturnFocus : $(`.card[data-id="${cssId(closedId)}"]`);
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
  pos.textContent = idx >= 0 ? `${(idx + 1).toLocaleString()} of ${visible.length.toLocaleString()}` : ''; // M-23: "1 of 6,105"
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
function payPool(job) {
  if (!job?._usd || isTerm(job) || job.salary.kind === 'stipend') return null;
  const ote = isOte(job), intern = job.seniority === 'Intern';
  const pool = data.jobs.filter((j) => j._usd && j.id !== job.id && !isTerm(j) && j.salary.kind !== 'stipend' && isOte(j) === ote && (j.seniority === 'Intern') === intern);
  return pool.length >= 5 ? pool : null;
}
/** What the pool is called in "Pays more than 37% of <noun> at Anthropic". */
const poolNoun = (job) => (job.seniority === 'Intern' ? 'internships' : isOte(job) ? 'roles with on-target earnings' : 'roles');
function percentile(job) {
  const pool = payPool(job);
  if (!pool) return null;
  return Math.round((pool.filter((j) => j._mid < job._mid).length / pool.length) * 100);
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Company pay distribution (midpoints, approx USD) with this job's range marked. DOM-built, no HTML strings. */
function salaryDistribution(job) {
  const pool = payPool(job);
  const base = salaryDomain();
  const dom = base && job._usd ? { lo: Math.min(base.lo, job._usd.min), hi: Math.max(base.hi, job._usd.max) } : base;
  const mids = (pool || []).map((j) => j._mid).concat(job._usd ? [job._mid] : []).sort((a, b) => a - b);
  const foreign = job.salary.currency && job.salary.currency !== 'USD';
  const approx = foreign ? h('p', { class: 'fnote' }, `≈ ${moneyRange(job._usd.min, job._usd.max)} in approx US dollars for comparison`) : null;
  if (!pool || !dom || !job._usd) return approx ? h('div', { class: 'd-dist' }, approx) : null;
  const W = 100, H = 40, N = 32;
  const counts = new Array(N).fill(0);
  for (const m of mids) counts[Math.min(N - 1, Math.max(0, Math.floor(((m - dom.lo) / (dom.hi - dom.lo)) * N)))]++;
  const max = Math.max(...counts);
  const x = (v) => ((v - dom.lo) / (dom.hi - dom.lo)) * W;
  const bw = W / N;
  const median = quantile(mids, 0.5);
  const svg = svgEl('svg', { class: 'dist', viewBox: `0 0 ${W} ${H + 12}`, preserveAspectRatio: 'none', role: 'img',
    'aria-label': `Pay of ${mids.length} ${poolNoun(job)}; this role spans ${money(job._usd.min)} to ${money(job._usd.max)}, median ${money(median)}` });
  counts.forEach((c, i) => {
    if (!c) return;
    const hgt = (c / max) * (H - 6);
    const inRange = (i + 1) * bw > x(job._usd.min) && i * bw < x(job._usd.max);
    svg.append(svgEl('rect', { x: (i * bw + 0.15).toFixed(2), y: (H - hgt).toFixed(2), width: (bw - 0.3).toFixed(2), height: hgt.toFixed(2), rx: 0.4, class: `dist-bar${inRange ? ' is-in' : ''}` }));
  });
  svg.append(svgEl('rect', { x: x(job._usd.min).toFixed(2), y: H + 2, width: Math.max(0.8, x(job._usd.max) - x(job._usd.min)).toFixed(2), height: 4, rx: 2, class: 'dist-range' }));
  const mx = x(median).toFixed(2);
  svg.append(svgEl('line', { x1: mx, x2: mx, y1: 0, y2: H, class: 'dist-med', 'vector-effect': 'non-scaling-stroke' }));
  const medLabel = h('span', { class: 'dist-med-label' }, `median ${money(median)}`);
  medLabel.style.left = `${Math.min(80, Math.max(20, x(median))).toFixed(1)}%`;
  return h('div', { class: 'd-dist' }, svg,
    h('div', { class: 'dist-axis' }, h('span', null, money(dom.lo)), medLabel, h('span', null, money(dom.hi))),
    approx);
}

const INTERVAL_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly', year: 'annual', term: 'fixed-term' };

let juicePeriod = 'year'; // drawer waterfall: per year or per month (kept for the session); 'term' for fixed-term pay
const JUICE_DOC = 'methodology/#1-the-formula'; // site page rendered from docs/LIVABILITY.md (scripts/methodology.js); never off-site

/* Household for the Juice Score (docs/LIVABILITY.md §1): who the rent and living costs are for.
   It applies everywhere juice is used (cards, sort, the Juice filter, the map's Juice colouring,
   the drawer and its location comparison) and is remembered in this browser. api.js attaches
   juice for one person; other households are re-attached here with the same juice.js. */
const HOUSEHOLD_KEY = 'melon-seek.household.v1';
const HOUSEHOLDS = [
  // [key, button label, tooltip, bedrooms, people (living-cost row)]
  ['single', 'Just me', 'One adult in a 1-bedroom home', 1, 'one person'],
  ['couple', 'Couple', 'Two adults, one earner (married, filing jointly), in a 2-bedroom home', 2, 'two adults'],
  ['family', 'Family', 'Two adults and two children, one earner (married, filing jointly), in a 3-bedroom home', 3, 'two adults and two children'],
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
    for (const j of slice) { j.juice = j.juice && j.juice.best ? j.juice : null; j._grade = gradeKey(j); }
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

/** P-15: how a couple or family was taxed, in plain words (households are always one earner, server/juice.js). */
function taxHowText(hhKey, basis, note) {
  if (hhKey === 'single') return null;
  const who = hhKey === 'couple' ? 'Couple' : 'Family';
  if (basis === 'joint') return `${who} here means one earner, married and filing jointly${hhKey === 'family' ? ', with two children' : ''}. Joint tax rates are why a couple can keep more than one person.`;
  if (basis === 'single') return `${who} here means one earner, taxed as a single filer (household tax rules aren’t modeled here).`;
  if (basis === 'individual') return `${who} here means one earner; each person is taxed separately here.`;
  if (basis === 'partial') return `${who} here means one earner. ${note || ''}`.trim();
  return `${who} here means one earner.`;
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
  const term = postedTerm(job.salary);
  const place = b.cityName || b.locationName;
  const headNet = h('span', { class: 'juice-head-net' });
  const body = h('div', { class: 'juice-body' });
  const where = [
    'Juice: what’s left after tax, rent and living costs (approx US dollars).',
    term ? `This pay lasts ${termText(term.weeks)}, so Juice covers only that term. Tax is worked out as if the pay lasted a year, so it may be lower.` : null,
    isOte(job) ? 'The pay is on-target earnings, so this assumes commission at target.' : null,
    b.estimated ? 'Some costs here are estimates.' : null,
    noneHere ? `No Juice figure for ${noneHere}; this is the best place the posting lists.` : null,
  ].filter(Boolean).join(' ');
  // UX-5: one headline line; the waterfall sits in a disclosure so "Same role elsewhere" stays near the top.
  const sec = h('section', { class: 'd-juice', 'aria-labelledby': 'juiceTitle' },
    h('details', { class: 'juice-details' },
      h('summary', null,
        h('span', { id: 'juiceTitle', class: 'juice-title' }, '🍉 Juice'),
        h('span', { class: `juice-score juice--${grade}`, title: `${JUICE_TIP}. ${juiceScaleText()}` }, `${b.score} · ${b.grade}`),
        headNet,
        h('span', { class: 'fsec-caret', html: ICON.chevron })),
      h('p', { class: 'juice-where' }, where),
      body));
  const render = (focusPeriod) => {
    const period = term ? (juicePeriod === 'term' ? 'term' : 'month') : juicePeriod === 'month' ? 'month' : 'year';
    const div = period === 'month' ? 12 : period === 'term' ? 52 / term.weeks : 1;
    const per = period === 'month' ? '/mo' : period === 'term' ? ' total' : '/yr';
    const step = period === 'year' ? 100 : 10;
    const r = (n) => Math.round(n / div / step) * step; // the shown amount, so the rows add up
    const fmt = (n) => stepMoney(n, 1);
    const gv = r(b.gross), tv = r(b.tax), rv = r(b.rent), lv = r(b.living);
    const nv = gv - tv - rv - lv;
    const amt = (n, sign = '') => `${sign}${fmt(Math.abs(n))}${per}`;
    headNet.textContent = `${nv < 0 ? '−' : ''}${fmt(Math.abs(nv))}${per} left ${hhFor(hhKey)} in ${place}${term && period === 'month' ? ' while it lasts' : ''}`;
    const g = Math.max(1, b.gross);
    const seg = (lo, hi) => { const x = Math.max(0, Math.min(g, lo)), z = Math.max(0, Math.min(g, hi)); return `left:${(x / g) * 100}%;width:${Math.max(0, ((z - x) / g) * 100)}%`; };
    const afterTax = b.gross - b.tax, afterRent = afterTax - b.rent;
    const tp = b.taxParts;
    const rentWhere = b.rentBasis === 'override' ? 'your rent' : `${beds}-bedroom, ${b.rentBasis === 'outside' ? 'outside the centre' : 'city centre'}`;
    // How the tax model treated a couple or family here (server/juice.js TAX_HOUSEHOLD).
    const taxBasis = b.inputs?.tax?.basis || b.taxBasis, taxNote = b.inputs?.tax?.note || null;
    const taxHow = !(b.tax > 0) ? null : taxHowText(hhKey, taxBasis, taxNote);
    const taxParts = tp ? [['income tax', tp.income], ['state or local tax', tp.regional], ['social security', tp.social]]
      .filter(([, v]) => v > 0).map(([label, v]) => `${label} ${fmt(r(v))}`).join(' · ') : null;
    const rows = [
      ['Gross pay', amt(gv), seg(0, b.gross), 'gross', isOte(job) ? 'on-target earnings: assumes commission at target' : null],
      ['Tax', amt(tv, '−'), seg(afterTax, b.gross), 'tax', taxParts || null, taxHow],
      ['Rent', amt(rv, '−'), seg(afterRent, afterTax), 'rent', rentWhere],
      ['Living costs', amt(lv, '−'), seg(b.net, afterRent), 'living', `everyday costs for ${people}, excluding rent`],
      ['Juice left', `${nv < 0 ? '−' : ''}${fmt(Math.abs(nv))}${per}`, seg(0, b.net), nv < 0 ? 'net is-neg' : 'net', null],
    ];
    const periods = term ? [['month', 'Monthly'], ['term', 'Whole term']] : [['month', 'Monthly'], ['year', 'Yearly']];
    const toggle = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': 'Show amounts per' },
      ...periods.map(([v, label]) => h('button', {
        type: 'button', 'aria-pressed': String(period === v), dataset: { period: v },
        onclick: () => { juicePeriod = v; render(v); }, // V5: re-render this block only and keep focus here
      }, label)));
    const household = h('div', { class: 'seg seg--sm juice-household', role: 'group', 'aria-label': 'Household: who the rent and living costs are for' },
      ...HOUSEHOLDS.map(([k, label, tip]) => h('button', {
        type: 'button', 'aria-pressed': String(hhKey === k), dataset: { household: k }, title: tip,
        onclick: () => { setHousehold(k); },
      }, label)));
    body.replaceChildren(...nn(
      h('div', { class: 'juice-controls' }, household, toggle),
      h('div', { class: 'waterfall', role: 'table', 'aria-label': 'Juice breakdown' },
        ...rows.map(([label, value, style, kind, detail, extra]) => h('div', { class: `wf-row ${kind.split(' ').map((k, i) => (i ? k : `wf--${k}`)).join(' ')}`, role: 'row' },
          h('span', { class: 'wf-label', role: 'rowheader' }, label),
          h('span', { class: 'wf-track', role: 'cell', 'aria-hidden': 'true' }, h('span', { class: 'wf-bar', style })),
          h('span', { class: 'wf-value', role: 'cell' }, value),
          detail ? h('span', { class: 'wf-detail' }, detail) : null,
          extra ? h('span', { class: 'wf-detail wf-tax-basis', title: taxNote && extra !== taxNote ? taxNote : null }, extra) : null))),
      b.rentBurden != null ? h('p', { class: 'juice-facts' }, 'Rent takes ', h('strong', null, `${Math.round(b.rentBurden * 100)}%`), ' of take-home pay.') : null,
      b.currencyMismatch ? h('p', { class: 'fnote' }, 'The posted salary currency differs from the local one, so it is applied as posted.') : null,
      others.length ? h('details', { class: 'juice-compare' }, h('summary', null, `Compare locations (${others.length + 1})`),
        h('ul', null, ...[b, ...others].map((l) => h('li', null,
          h('span', { class: 'jc-name' }, l.locationName || l.cityName, l === b ? h('span', { class: 'muted' }, filtered && b !== jb.best ? ' · shown above' : ' · best') : null),
          h('span', { class: `juice-grade juice--${String(l.grade).toLowerCase()}` }, `${l.score} ${l.grade}`),
          h('span', { class: 'jc-net' }, `${l.net < 0 ? '−' : ''}${fmt(Math.abs(r(l.net)))}${per}`))))) : null,
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
/** "Pay by level: Level 2: $184K–287.5K · Level 3: $224K–356.5K" under the range in the pay block. */
function payLevelsLine(s) {
  const lv = payLevels(s);
  if (!lv) return null;
  const range = (a, b) => { const x = levelMoney(a, s.currency), y = levelMoney(b, s.currency); return x === y ? x : `${x}–${y.replace(/^[^\d]+/, '')}`; };
  return h('p', { class: 'd-sal-levels' }, h('span', { class: 'muted' }, 'Pay by level: '),
    lv.map((l) => `${String(l.label).trim()}: ${range(l.min, l.max ?? l.min)}`).join(' · '));
}

/** At most two muted honest-number labels (ROADMAP F2), in the roadmap's priority order. */
function payLabels(job) {
  const s = job.salary;
  if (!s) return null;
  const spread = s.spread ?? (s.min > 0 ? s.max / s.min : null);
  const labels = [
    // D-21: a range that covers several levels lists them (payLevelsLine) instead of a bare "Multiple pay zones".
    s.zones > 1 && !payLevels(s) ? ['Multiple pay zones', 'The posting lists different ranges for different locations or levels'] : null,
    spread != null && spread >= 2 ? [`Wide range (${spread.toFixed(1)}×)`, 'The top of the range is at least twice the bottom'] : null,
    s.min === s.max ? ['Single figure', 'The posting gives one number, not a range'] : null,
    job.extras?.equity ? ['+ equity mentioned', 'The description mentions equity; it isn\u2019t in this figure'] : null,
    // P-1: on-target earnings already include the commission at target, so a "bonus" note would be wrong.
    job.extras?.bonus && !isOte(job) ? ['+ bonus mentioned', 'The description mentions a bonus; it isn\u2019t in this figure'] : null,
  ].filter(Boolean).slice(0, 2);
  return labels.length ? h('div', { class: 'pay-labels' }, ...labels.map(([t, tip]) => h('span', { class: 'pay-label', title: tip }, t))) : null;
}

/** For postings without pay: an estimate from comparable roles, clearly labelled as such. */
/** Jobs passing every non-salary filter (Compstimate's auto title only; never its pool). Cached per state. */
let compVisCache = { key: null, list: null };
function compVisible() {
  const key = `${dataSeq}|${JSON.stringify(FILTER_KEYS.filter((k) => !['smin', 'smax', 'so'].includes(k)).map((k) => S[k]))}`;
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
  if (!v.ok) return v.reason ? h('p', { class: 'd-comp-note d-comp-none' }, v.reason) : null;
  return h('div', { class: 'd-comp', role: 'note' },
    h('div', { class: 'd-comp-top' },
      h('span', { class: 'd-comp-label', title: 'Estimated pay from similar roles at this company' }, 'Pay estimate'),
      h('span', { class: 'd-comp-amt' }, `about ${money(est.mid)}`),
      h('span', { class: 'muted' }, `(${money(est.low)}–${money(est.high).replace(/^\$/, '')}, ${v.confidence.toLowerCase()} confidence)`)),
    h('p', { class: 'd-comp-note' }, `${v.basis}. ${v.kind === 'ote' ? 'On-target earnings (base plus commission at target), like the roles it is based on. ' : ''}An estimate, not a figure from the posting (approx USD / year).`),
    v.accuracy || v.caution ? h('p', { class: 'd-comp-note' }, v.accuracy ? `${v.accuracy}.` : v.caution) : null,
    asOfNote('d-comp-note d-comp-asof', () => compstimateAsOfText({ fetchedAt: data.fetchedAt, meta: data.meta })));
}

function annualNote(sal) {
  // P-8: fixed-term pay is shown as posted, so it gets no "annualized" note, just the posted text.
  if (sal.termWeeks > 0) return h('div', { class: 'd-annual' }, `Fixed-term pay, not a yearly salary${sal.text ? ` (as posted: ${sal.text})` : ''}`);
  const orig = sal.originalInterval || (sal.interval && sal.interval !== 'year' ? sal.interval : null);
  if (!orig) return null;
  // CONTRACT v4 (fix-pay-data P-8): 'term' is pay for the whole programme; termWeeks is its length.
  const what = orig === 'term' && sal.termWeeks ? `pay for a ${sal.termWeeks}-week programme` : `${INTERVAL_ADJ[orig] || orig} pay`;
  const lasts = orig !== 'term' && sal.termWeeks ? `; the programme lasts about ${sal.termWeeks} weeks` : '';
  return h('div', { class: 'd-annual' }, `Annualized from ${what}${sal.text ? ` (${sal.text})` : ''}${lasts}`);
}

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

function drawerContent(job) {
  const company = data.company || {};
  const coName = company.name || job.companyName;
  const pct = percentile(job);
  const kwCat = KW_CATS.map(({ cat, key, title }) => (job.keywords[cat].length ? h('div', { class: 'kw-group' },
    h('h4', null, title),
    h('div', { class: 'cloud' }, ...job.keywords[cat].map((k) => h('button', {
      type: 'button', class: 'kw', 'aria-pressed': String(S[key].includes(k)), title: S[key].includes(k) ? 'Remove filter' : 'Filter roles by this keyword',
      onclick: (e) => { toggleIn(key, k); e.currentTarget.setAttribute('aria-pressed', String(S[key].includes(k))); toast(S[key].includes(k) ? `Filtering by “${k}”` : `Removed “${k}”`); },
    }, k)))) : null));
  const bullets = (title, arr) => (arr?.length ? h('div', { class: 'd-bullet-group' }, h('h4', null, title), h('ul', { class: 'bullets' }, ...arr.map((b) => h('li', null, b)))) : null);
  const bulletsHost = h('div', { class: 'd-bullets' });
  const bulletsFold = fold('d-about', 'About the role', bulletsHost);
  const renderBullets = () => {
    bulletsHost.replaceChildren(...[bullets('What you’ll do', job.sections.responsibilities), bullets('What they look for', job.sections.fit)].filter(Boolean));
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

  const head = h('div', { class: 'drawer-head' },
    h('div', { class: 'drawer-nav' },
      h('button', { type: 'button', class: 'icon-btn icon-btn--sm', id: 'drawerPrev', 'aria-label': 'Previous role', html: ICON.prev, onclick: () => stepDrawer(-1) }),
      h('span', { class: 'drawer-pos', id: 'drawerPos' }),
      h('button', { type: 'button', class: 'icon-btn icon-btn--sm', id: 'drawerNext', 'aria-label': 'Next role', html: ICON.next, onclick: () => stepDrawer(1) })),
    // Phones show this as "‹ Back" at the left of a full-screen page (styles.css); P-16: the word
    // keeps it apart from the "Previous role" arrow next to it.
    h('button', { type: 'button', class: 'icon-btn', id: 'drawerClose', 'aria-label': 'Close details, back to the list (Esc)', html: `<span class="ico-close">${ICON.close}</span><span class="ico-back">${ICON.prev}<span class="back-label">Back</span></span>`, onclick: () => closeDrawer() }));

  const sal = job.salary;
  const term = postedTerm(sal);
  const noun = poolNoun(job);
  // P-16: no "0% percentile" in big green type; one plain sentence, and none for fixed-term pay.
  const of = `${coName}’s ${noun}${isOte(job) ? '' : ' that show pay'}`;
  const pctText = pct == null ? null : pct >= 100 ? `The top pay of ${of}` : pct <= 0 ? `The lowest pay of ${of}` : `Pays more than ${pct}% of ${of}`;
  const caption = !sal ? null : isOte(job) ? `${OTE_LABEL}. Equity isn’t included.`
    : term ? 'Fixed-term pay as posted. Equity and bonus aren’t included.' : 'Posted base pay. Equity and bonus aren’t included.';
  const salaryBlock = h('section', { class: 'd-salary' },
    sal ? h('div', { class: 'd-sal-top' },
      h('div', null,
        h('div', { class: 'd-sal-amt' }, term ? `${term.amount}${term.per ? ` a ${term.per}` : ''}` : salaryRange(sal)),
        h('div', { class: 'muted' }, term ? `${sal.currency || 'USD'} · for ${termText(term.weeks)}` : `${sal.currency || 'USD'} · per year`),
        annualNote(sal),
        term ? null : payLevelsLine(sal)))
      : job.salaryFlag ? payUnclearBlock(job)
        : h('div', { class: 'd-sal-none' }, h('strong', null, 'Salary not listed'), h('span', { class: 'muted' }, ' — this posting doesn’t include a pay range.'), compstimateBlock(job)),
    sal ? salaryDistribution(job) : null,
    sal ? payLabels(job) : null,
    caption ? h('p', { class: 'd-pay-caption' }, caption) : null,
    sal && pctText ? h('p', { class: 'd-pct-text' }, pctText) : null);

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
    h('a', { class: 'btn btn--primary btn--lg apply', href: job.url, target: '_blank', rel: 'noopener noreferrer', title: `Opens ${applyHost(job.url) || 'the posting'} in a new tab` },
      // Demo jobs link to the real board index, not to a real posting — say so. I-3: name the company, not the job-board system.
      h('span', { class: 'apply-label' }, data.mode === 'demo' && !MOCK ? `Open ${coName}’s real job board` : `Apply on ${coName}’s careers site`, applyHost(job.url) ? h('span', { class: 'apply-host' }, applyHost(job.url)) : null), h('span', { html: ICON.ext })),
    h('button', { type: 'button', class: 'btn btn--ghost btn--lg', 'aria-label': 'Copy link to this role', html: ICON.link, onclick: copyLink }));

  const sen = senKey(job);
  return [head, h('div', { class: 'drawer-scroll', tabindex: '0', 'aria-label': 'Role details' },
    h('div', { class: 'd-company' }, h('span', { class: 'dot', style: `--dot:${companyColor(company)}` }), coName,
      data.mode === 'demo' ? h('span', { class: 'tag tag--demo' }, 'Demo') : null),
    h('h2', { class: 'd-title', id: 'drawerTitle' }, job.title),
    job._postedTitle && job._postedTitle.replace(/^\s*\[[^\]]{1,16}\]\s*/, '') !== job.title ? h('div', { class: 'd-posted muted' }, `Posted as “${job._postedTitle}”`) : null,
    isPool(job) ? h('p', { class: 'd-pool' }, h('strong', null, POOL_LABEL), h('span', { class: 'muted' }, `. ${POOL_TIP}.`)) : null,
    h('div', { class: 'd-meta' }, ...metaParts(job).map((t, i) => [i ? h('span', { class: 'sep' }, '·') : null, h('span', null, t)]),
      h('span', { class: `sen sen--${sen.toLowerCase().replace(/\W/g, '')}`, title: SEN_TIP[sen] || null }, senLabel(sen)),
      job._titleTag ? h('span', { class: 'tag', title: `The posting's title starts with “[${job._titleTag}]”, a tag the company adds (often a team or office code)` }, `Tag: ${job._titleTag}`) : null),
    job._ts ? h('div', { class: 'd-updated muted' }, `Updated ${ago(job._ts)}`) : null,
    // Fixed order (ROADMAP §8): pay block → Same role elsewhere → (Juice headline) → Listing → Locations → Keywords → Bullets → Description.
    salaryBlock,
    sameRoleSection(job), // UX-5: directly under the pay block
    juiceBlock(job), // compact headline; the waterfall is in a disclosure
    listingSection(job),
    locs,
    kwCat.some(Boolean) ? fold('d-kw', ['Keywords ', h('span', { class: 'muted small' }, 'click to filter')], ...kwCat) : null,
    bulletsFold,
    descWrap), foot];
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
    lines.push(job.ageIsMinimum
      ? `Open at least ${ago.replace(/ ago$/, '')} (it was already listed when melon-seek started tracking this board)`
      : d >= ALWAYS_OPEN_DAYS ? `Always-open posting: listed ${ago}${on}` : `Listed ${ago}${on}`);
  }
  if (job.firstSeenAt) lines.push(`First seen by melon-seek on ${new Date(job.firstSeenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`);
  if (job.repost?.count > 0) lines.push(`Reposted ${job.repost.count}×${job.repost.firstSeenAt ? ` since ${new Date(job.repost.firstSeenAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}`);
  if (job.freshness === 'evergreen' || (job._age != null && job._age >= 180 && 'ageDays' in job)) {
    lines.push('Open 180+ days. Some companies keep a posting open to collect applicants for a recurring role.');
  }
  if (!lines.length) return null;
  return fold('d-listing', 'Listing', h('ul', { class: 'listing-lines' }, ...lines.map((t) => h('li', null, t))));
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
    if (!rows.some((r) => !r.current)) { sec.hidden = true; applyDrawerBudget(); return; }
    const bySen = res.matchedOn === 'family+seniority';
    const filters = { family: res.family, seniority: bySen ? res.level : null };
    const chartHost = h('div', { class: 'comps-chart' });
    body.replaceChildren(
      // P-11: the note says what is really compared (compsNote reads res.fallback).
      h('p', { class: 'comps-note muted' }, compsNote(res)),
      chartHost,
      asOfNote('comps-asof', () => marketAsOfText(market, rows.map((r) => r.slug))));
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
    let gotSections = false;
    if (detail?.sections) for (const k of ['responsibilities', 'fit']) if (!job.sections[k]?.length && detail.sections[k]?.length) { job.sections[k] = detail.sections[k]; gotSections = true; }
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

/* The on-screen keyboard: iOS keeps the layout viewport, so fixed footers and bottom sheets sit
   under it. visualViewport tells us; body.kb-open lifts sheets to the top and hides the sticky footer. */
function bindKeyboardInsets() {
  const vv = window.visualViewport;
  if (!vv) return;
  const sync = rafThrottle(() => {
    const open = isMobile() && vv.height < innerHeight * 0.78 && !!document.activeElement?.matches?.('input, textarea, select');
    document.body.classList.toggle('kb-open', open);
    document.body.classList.toggle('kb-search', open && document.activeElement?.id === 'search'); // M-12: lift the peek row
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  });
  vv.addEventListener('resize', sync);
  document.addEventListener('focusin', (e) => {
    sync();
    if (isMobile() && e.target.matches?.('#filters input, #popover input')) setTimeout(() => revealField(e.target), 300);
  });
  document.addEventListener('focusout', () => setTimeout(sync, 50));
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
  const top = el.closest('.fsearch-wrap, label, .field') || el;
  const delta = top.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  if (Math.abs(delta) > 4) box.scrollTop += delta;
}

let filtersOpener = null; // the chip or Filters button that opened the overlay sheet (M-4, M-15)
function setFiltersOpen(open, { opener = null, focus = null } = {}) {
  if (open && filtersDirty) { filtersDirty = false; renderFilterPanel(); } // PERF-2: catch up the skipped sync
  if (isOverlayFilters()) {
    const was = document.body.classList.contains('filters-open');
    document.body.classList.toggle('filters-open', open);
    $('#filtersScrim').hidden = !open;
    setFiltersModal(open && isMobile());
    if (open) {
      if (!was || opener) filtersOpener = opener || filtersOpener;
      // M-26: the Filters button opens the sheet at its top, where focus goes (Salary); a chip passes its own section.
      if (!focus) $('#filterBody').scrollTop = 0;
      const target = focus || $('#filters summary');
      setTimeout(() => target?.focus({ preventScroll: true }), 50);
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

function bindEvents() {
  const search = $('#search');
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
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); set({ ...resetFiltersPatch(), job: null, m: 'chart' }); closeDrawer(); });

  const list = $('#resultsList');
  list.addEventListener('click', (e) => { const c = e.target.closest('.card[data-id]'); if (c) openDrawer(c.dataset.id); });
  list.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const c = e.target.closest('.card[data-id]');
    if (!c) {
      // M-20: focus handed to the list (its card scrolled out of the page) goes on from the first card in view.
      if (e.target === list && step) {
        e.preventDefault();
        const top = list.getBoundingClientRect().top;
        [...list.querySelectorAll('.card[data-id]')].find((x) => x.getBoundingClientRect().bottom > top + 4)?.focus();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(c.dataset.id); }
    if (step) {
      e.preventDefault();
      focusResult(visible.findIndex((j) => j.id === c.dataset.id) + step); // M-20: by result, not by card in the page
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
  render();
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
  if (!S.c) S.c = companies[0].slug;
  lastHash = serialize();
  history.replaceState(null, '', location.pathname + location.search + (lastHash ? `#${lastHash}` : ''));
  await loadJobs();
  if (restored && data.status === 'ready' && (activeFilterCount() || S.c !== companies[0]?.slug)) {
    toast(activeFilterCount() ? `Reopened where you left off: ${searchName()}` : `Reopened ${data.company?.name || 'your last company'}, where you left off`, 4000);
  }
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

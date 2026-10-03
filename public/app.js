// melon·seek — application shell.
// Owns state (mirrored in location.hash), data fetching, filters, the results
// list, the job drawer and the company switcher. Rendering of the salary
// chart and the map is delegated to ./viz/* (see docs/CONTRACT.md).

import { colorFor, formatMoney, resetColors, assignColors, otherColor, toUSD, SLOT_COUNT } from './viz/palette.js';
import { createChart, keyOf, VIEWS, DEFAULT_VIEW } from './viz/chart.js';
import { createMap } from './viz/map.js';
import * as api from './api.js';
import { createCompstimateWidget, compstimateForJob, accuracyLine, isLowAccuracy, displayConfidence, basisLine, MIN_COMPARABLES } from './features/compstimate.js';
import { compsForJob, createCompsCard } from './features/comps.js';
import { createCompsChart } from './viz/comps.js';
import { roleFamily, FAMILY_LABELS } from './features/roles.js';
// ./features/insights.js is imported on first use (Insights mode), see renderInsights.
// api.js: getCompanies, getJobs, getJobDetail (namespace import: tolerate a missing optional export)

// ?mock=1 swaps the data layer for a local generator. Development only: it is
// honoured on localhost only, and the UI always labels it "Mock data".
const MOCK = new URLSearchParams(location.search).has('mock') &&
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const dataApi = MOCK ? await import('./mock-api.js') : api;

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
const SENIORITY_ORDER = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+', 'Unspecified'];
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
  if (s.min === s.max || s.max == null) return money(s.min, s.currency);
  return `${money(s.min, s.currency)}–${money(s.max, s.currency).replace(/^[^\d]+/, '')}`;
}

/** "$137K"–"$338K" -> "$137–338K" when units match. */
function compactRange(a, b) {
  const x = money(a), y = money(b);
  const ux = x.slice(-1), uy = y.slice(-1);
  return ux === uy && /[KM]/.test(ux) ? `${x.slice(0, -1)}–${y.replace(/^[^\d]+/, '')}` : `${x}–${y.replace(/^[^\d]+/, '')}`;
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
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => (el.hidden = true), 200); }, 2400);
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
  v: DEFAULT_VIEW, g: 'department', sort: 'salary-desc', mc: 'pay', job: null,
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
    if (ARRAYS.includes(k)) st[k] = p.getAll(k).filter(Boolean);
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
const SORTS = ['salary-desc', 'salary-asc', 'newest', 'title', 'juice'];
/* D-11: "Newest" needs listing dates; with none loaded (every snapshot board today) it is hidden and
   a newest link sorts like the default, as the "Listed" filter hides itself. */
let agesFor = null, agesKnown = false;
function hasListingDates() {
  if (agesFor !== data.jobs) { agesFor = data.jobs; agesKnown = data.jobs.some((j) => j._age != null); }
  return agesKnown;
}
const effectiveSort = () => (S.sort === 'newest' && data.status === 'ready' && !hasListingDates() ? DEFAULTS.sort : S.sort);

function serialize(st = S) {
  const p = new URLSearchParams();
  for (const k of ORDER) {
    const v = st[k];
    if (ARRAYS.includes(k)) { for (const x of v) p.append(k, x); continue; }
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
    j._age = 'ageDays' in j ? (Number.isFinite(j.ageDays) ? j.ageDays : null)
      : j._ts ? Math.max(0, Math.floor((Date.now() - j._ts) / 864e5)) : null;
    j._family = j._family ?? roleFamily(j.title, j); // same ctx comps.js uses, so rf filters match its rows
    j.juice = j.juice && j.juice.best ? j.juice : null;
    j._grade = j.juice ? (j.juice.best.grade === 'Rind' ? 'Dry' : j.juice.best.grade) : null;
    j._locKeys = j.locations.map(locKey);
    j._hay = [j.title, j.department, j.team, j.employmentType, j.seniority,
      ...j.locations.map((l) => l.name), ...j.keywords.responsibilities, ...j.keywords.fit, ...j.keywords.skills]
      .filter(Boolean).join(' \u0001 ').toLowerCase();
  }
  return jobs;
}

function filterSpec(st = S) {
  return {
    q: st.q.toLowerCase().split(/\s+/).filter(Boolean),
    smin: st.smin, smax: st.smax, so: st.so,
    d: new Set(st.d), l: new Set(st.l), s: new Set(st.s), e: new Set(st.e),
    r: st.r, p: st.p, ho: st.ho, rf: st.rf,
    kw: { responsibilities: st.kr, fit: st.kf, skills: st.ks },
    jg: new Set(st.jg),
  };
}

/** Returns the list of facet names this job fails (empty = passes all). */
function failures(j, F, now) {
  const out = [];
  if (F.q.length && !F.q.every((t) => j._hay.includes(t))) out.push('q');
  const salActive = F.so || F.smin != null || F.smax != null;
  if (salActive && (!j._usd || (F.smin != null && j._usd.max < F.smin) || (F.smax != null && j._usd.min > F.smax))) out.push('sal');
  if (F.d.size && !F.d.has(deptKey(j))) out.push('d');
  if (F.l.size && !j._locKeys.some((k) => F.l.has(k)) && !j._locAlt?.some((k) => F.l.has(k))) out.push('l');
  if (F.s.size && !F.s.has(j.seniority || 'Unspecified')) out.push('s');
  if (F.e.size && !F.e.has(empKey(j))) out.push('e');
  if (F.r === 'remote' && !j.remote) out.push('r');
  if (F.r === 'onsite' && !j.locations.some((l) => !l.remote)) out.push('r');
  if ((F.p && !(j._age != null && j._age <= F.p)) || (F.ho && j._age != null && j._age >= 180)) out.push('p');
  if (F.rf && j._family !== F.rf) out.push('rf');
  if (F.jg.size && !(j._grade && F.jg.has(j._grade))) out.push('jg');
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
  const fc = { d: new Map(), l: new Map(), lGroup: new Map(), s: new Map(), e: new Map(), r: { any: 0, remote: 0, onsite: 0 },
    p: { 0: 0, 7: 0, 30: 0, 90: 0 }, jg: new Map(), kw: { responsibilities: new Map(), fit: new Map(), skills: new Map() }, salMids: [] };
  for (const j of jobs) {
    const fails = failures(j, F, now);
    if (fails.length > 1) continue;
    const only = fails[0];
    if (!only) filtered.push(j); // the chart/map draw the whole filtered set; a cluster/map area narrows the list in render()
    // D-2: with a cluster or map area active, the facet counts describe the roles in that area (the list).
    if (area && !area.ids.has(j.id)) continue;
    const counts = (facet) => !only || only === facet;
    if (!only) {
      for (const cat of ['responsibilities', 'fit', 'skills']) for (const k of j.keywords[cat]) bump(fc.kw[cat], k);
    }
    if (counts('d')) bump(fc.d, deptKey(j));
    if (counts('l')) {
      for (let i = 0; i < j.locations.length; i++) {
        const k = j._locKeys[i];
        if (j._locKeys.indexOf(k) !== i) continue;
        bump(fc.l, k);
        const l = j.locations[i];
        if (!fc.lGroup.has(k)) fc.lGroup.set(k, l.remote ? '~remote' : l.country || 'ZZ');
      }
    }
    if (counts('s')) bump(fc.s, j.seniority || 'Unspecified');
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
    if (counts('jg') && j._grade) bump(fc.jg, j._grade);
  }
  return { filtered, fc };
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
  switch (effectiveSort()) {
    case 'salary-asc': out.sort((a, b) => nullsLast(a._usd, b._usd, () => a._usd.mid - b._usd.mid || a.title.localeCompare(b.title))); break;
    case 'newest': out.sort((a, b) => nullsLast(a._age, b._age, () => a._age - b._age || a.title.localeCompare(b.title))); break;
    case 'title': out.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'juice': out.sort((a, b) => nullsLast(a.juice, b.juice, () => b.juice.best.score - a.juice.best.score || b.juice.best.net - a.juice.best.net || a.title.localeCompare(b.title))); break;
    default: out.sort((a, b) => nullsLast(a._usd, b._usd, () => b._usd.mid - a._usd.mid || b._usd.max - a._usd.max || a.title.localeCompare(b.title)));
  }
  // UX-2: with a search, roles whose title or team match come before keyword-tag-only matches.
  const tokens = S.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const strong = [], weak = [];
    for (const j of out) (titleMatch(j, tokens) ? strong : weak).push(j);
    return strong.concat(weak);
  }
  return out;
}
function titleMatch(j, tokens) {
  const t = `${j.title} ${j.team || ''}`.toLowerCase();
  return tokens.every((x) => t.includes(x));
}

function stats(list) {
  const mids = list.filter((j) => j._usd).map((j) => j._mid).sort((a, b) => a - b);
  const depts = new Map();
  for (const j of list) depts.set(deptKey(j), (depts.get(deptKey(j)) || 0) + 1);
  const top = [...depts].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    n: list.length, withSalary: mids.length,
    median: quantile(mids, 0.5), p25: quantile(mids, 0.25), p75: quantile(mids, 0.75), top,
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
  data = { status: 'loading', jobs: [], company: companyInfo(S.c), mode: null, fetchedAt: null, error: null };
  render();
  try {
    const res = await dataApi.getJobs(jobsQuery(S.c), { refresh, signal: abortCtl.signal });
    if (seq !== loadSeq) return;
    // Mobile perf (docs/process/perf-mobile.md): prepare() is per job, so big boards are
    // prepared in chunks that yield, instead of one 0.4 s task on a phone.
    const jobs = Array.isArray(res?.jobs) ? res.jobs : [];
    const source = res?.company?.source || companyInfo(S.c)?.source || null;
    for (let i = 0; i < jobs.length; i += PREPARE_CHUNK) {
      prepare(jobs.slice(i, i + PREPARE_CHUNK), { source });
      await yieldTask();
      if (seq !== loadSeq) return;
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
    };
    markVisit(S.c, data.jobs);
    if (refresh) toast(data.mode === 'live' ? 'Fetched fresh from the live board' : 'Live board unreachable — showing fallback data');
  } catch (err) {
    if (err?.name === 'AbortError' || seq !== loadSeq) return;
    data = { status: 'error', jobs: [], company: companyInfo(S.c), mode: null, fetchedAt: null, error: err?.message || String(err) };
  }
  settleCarry();
  render();
  if (S.job) openDrawer(S.job, { fromHash: true });
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
  return { slug: key, name: key, source: null, board: key, color: null };
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
  if (pageTitle) pageTitle.textContent = `${active?.name || 'Company'} jobs by salary — melon·seek`;
  const menuBtn = $('#companyMenuBtn');
  const sig = all.map((c) => c.slug + c.name).join('|') + '§' + S.c + '§' + data.status + data.jobs.length + '§' + recents.join(',');
  if (menuBtn.dataset.sig !== sig) {
    menuBtn.dataset.sig = sig;
    menuBtn.replaceChildren(...nn(h('span', { class: 'dot', style: `--dot:${companyColor(active)}` }), h('span', { class: 'company-name' }, active?.name || 'Choose company'),
      data.status === 'ready' ? h('span', { class: 'company-count' }, data.jobs.length) : null, h('span', { class: 'chip-caret', html: ICON.chevron })));
    menuBtn.setAttribute('aria-label', `Company: ${active?.name || 'none'}. Choose another company or add a board`);
    const recent = recents.filter((slug) => slug !== S.c).map((slug) => all.find((c) => c.slug === slug)).filter(Boolean).slice(0, 3);
    $('#companyPills').replaceChildren(...recent.map((c) => h('button', {
      type: 'button', class: 'company-pill', title: `${c.name} · ${SOURCE_LABEL[c.source] || c.source || ''} / ${c.board}`,
      onclick: () => switchCompany(c),
    }, h('span', { class: 'dot', style: `--dot:${companyColor(c)}` }), h('span', { class: 'company-name' }, c.name))));
  }

  for (const b of document.querySelectorAll('.seg [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === S.m));
  const search = $('#search');
  if (document.activeElement !== search && search.value !== S.q) search.value = S.q;

  // Data-mode badge (a button: details open in a popover; tip also exposed via aria-describedby)
  const badge = $('#dataBadge');
  const banner = $('#demoBanner');
  const info = badgeInfo();
  badge.className = `data-badge ${info ? info.cls : ''}`;
  badge.hidden = !info;
  if (info) {
    badge.replaceChildren(h('span', { class: 'badge-dot', 'aria-hidden': 'true' }), h('span', { class: 'badge-label', 'data-short': info.short || info.label, 'data-tiny': info.tiny || info.short || info.label, 'data-micro': info.micro || info.tiny || info.short || info.label }, info.label),
      h('span', { class: 'sr-only', id: 'dataBadgeTip' }, info.tip));
    badge.setAttribute('aria-describedby', 'dataBadgeTip');
    badge.title = info.tip;
  }
  banner.hidden = true;
  if (data.status === 'ready' && (MOCK || data.mode === 'demo')) {
    // One thin muted line; the full explanation and the raw error sit in a disclosure.
    banner.hidden = false;
    const wasOpen = banner.querySelector('details')?.open;
    const short = MOCK ? 'Mock data — not real postings' : `Demo data — the ${data.company?.name || ''} board couldn’t be reached`;
    const long = MOCK
      ? 'These roles come from the local development generator (?mock=1, localhost only), not from any job board.'
      : 'So you can still explore the interface, these roles are generated samples — not real postings, salaries or locations.';
    banner.replaceChildren(h('details', { open: !!wasOpen },
      h('summary', null, h('span', { class: 'demo-ico', html: ICON.info }), h('span', { class: 'banner-short' }, short), h('span', { class: 'banner-more' }, 'Details')),
      h('div', { class: 'banner-body' }, h('p', null, long),
        data.error ? h('code', null, data.error) : null,
        MOCK ? null : h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => loadJobs({ refresh: true }) }, 'Try the live board again'))));
  }
  $('#refreshBtn').disabled = data.status === 'loading';
  $('#refreshBtn').classList.toggle('is-spinning', data.status === 'loading');
}

function badgeInfo() {
  if (data.status === 'loading') return { label: 'Loading', cls: 'is-loading', tip: 'Fetching roles…' };
  if (data.status === 'error') return { label: 'Offline', cls: 'is-error', tip: `Couldn’t load this board: ${data.error}` };
  if (data.status !== 'ready') return null;
  const src = data.company?.source ? `${SOURCE_LABEL[data.company.source] || data.company.source} / ${data.company.board}` : '';
  const when = data.fetchedAt ? ago(data.fetchedAt) : null;
  // The server already says "Live fetch failed: …"; add that prefix only when it's missing.
  const failed = data.error ? (/^live fetch (failed|skipped)/i.test(data.error) ? data.error : `Live fetch failed: ${data.error}`) : '';
  if (MOCK) return { label: 'Mock data', short: 'Mock data', tiny: 'Mock', cls: 'is-demo', tip: `Synthetic development data from mock-api.js (?mock=1, localhost only) — not real postings. Simulated mode: ${data.mode}.` };
  switch (data.mode) {
    case 'live': return { label: 'Live', tiny: 'Live', cls: 'is-live', tip: `Fetched live from ${src}${when ? ` · ${when}` : ''}.` };
    case 'cache': return { label: when ? `Cached · ${when}` : 'Cached', tiny: 'Cached', micro: 'Cached', cls: 'is-cache', tip: `Served from a recent copy of ${src}${failed ? ` (${failed})` : ''}. Refresh to fetch live.` };
    case 'snapshot': return { label: data.fetchedAt ? `Snapshot · ${shortDate(data.fetchedAt)}` : 'Snapshot', micro: data.fetchedAt ? shortDate(data.fetchedAt) : 'Saved', cls: 'is-snapshot', tip: `Saved snapshot of ${src}${data.fetchedAt ? ` from ${shortDate(data.fetchedAt)}` : ''}${failed ? `. ${failed}` : ''}.` };
    case 'demo': return { label: 'Demo data — live board unreachable', short: 'Demo data', tiny: 'Demo', cls: 'is-demo', tip: `Generated sample data, not real postings.${data.error ? ` Error: ${data.error}` : ''}` };
    default: return { label: String(data.mode), cls: '', tip: src };
  }
}

/** F7: open-data CSV for the current built-in company (server: /api/export, static: data/<slug>.csv). */
function csvLink() {
  const c = data.company;
  if (MOCK || !c?.slug || isCustomKey(S.c) || data.status !== 'ready') return null;
  const href = api.isStatic?.() ? `data/${encodeURIComponent(c.slug)}.csv` : `api/export?company=${encodeURIComponent(c.slug)}`;
  return h('p', { class: 'badge-csv' }, h('a', { href, download: true }, 'Download CSV'), // the server's Content-Disposition names the file
    h('span', { class: 'muted' }, ' · titles, teams, locations and posted pay; links to the original postings'));
}

function makeBadgeDetails() {
  const el = h('div', { class: 'badge-details' });
  function sync() {
    const info = badgeInfo();
    const c = data.company || {};
    const rows = [
      ['Status', info?.label || '—'],
      ['Source', c.source ? `${SOURCE_LABEL[c.source] || c.source} / ${c.board}` : '—'],
      ['Fetched', data.fetchedAt ? `${new Date(data.fetchedAt).toLocaleString()} (${ago(data.fetchedAt)})` : '—'],
      ['Roles', data.jobs.length.toLocaleString()],
    ];
    el.replaceChildren(...nn(h('p', null, info?.tip || ''),
      h('dl', null, ...rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
      // M-14: the raw error only when the sentence above doesn't already carry it.
      data.error && !(info?.tip || '').includes(data.error) ? h('pre', { class: 'badge-error' }, data.error) : null,
      MOCK ? null : h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--block', onclick: () => { closePopover(false); loadJobs({ refresh: true }); } }, 'Refresh from the live board'),
      csvLink()));
  }
  return { el, sync };
}

function allCompanies() {
  const all = [...companies, ...boards.map((b) => ({ slug: `${b.source}:${b.board}`, name: b.name || b.board, source: b.source, board: b.board, color: null, custom: true }))];
  if (S.c && !all.some((c) => c.slug === S.c)) all.push(companyInfo(S.c));
  return all;
}

function switchCompany(c) {
  if (!c || c.slug === S.c) return;
  set({ c: c.slug, cn: c.custom ? c.name : '', job: null, ...resetFiltersPatch() });
}

const RECENT_KEY = 'melon-seek.recent.v1';
let recents = (() => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 4) : []; } catch { return []; } })();
function rememberCompany(slug) {
  recents = [slug, ...recents.filter((x) => x !== slug)].slice(0, 4);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); } catch { /* ignore */ }
}

/** Searchable company list grouped by ATS, plus the user's boards and "Add a board". */
function makeCompanyMenu() {
  const input = h('input', { type: 'search', class: 'fsearch', placeholder: 'Search companies…', 'aria-label': 'Search companies', autocomplete: 'off' });
  const list = h('div', { class: 'company-list' });
  const add = h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--block', onclick: () => togglePopover('board', $('#addBoardBtn')) },
    h('span', { html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>' }), 'Add a board…');
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
    const groups = [
      ['Your boards', all.filter((c) => c.custom)],
      ...SOURCES.map((src) => [SOURCE_LABEL[src], all.filter((c) => !c.custom && c.source === src)]),
      ['Other', all.filter((c) => !c.custom && !SOURCES.includes(c.source))],
    ].filter(([, items]) => items.length);
    const group = (label, kids) => {
      const id = `cm-${label.replace(/\W+/g, '-').toLowerCase()}`;
      return h('div', { role: 'group', 'aria-labelledby': id }, h('div', { class: 'check-group', id }, label), ...kids);
    };
    list.replaceChildren(...groups.map(([label, items]) => group(label, items.map((c) => h('button', {
      type: 'button', class: 'company-item', 'aria-current': c.slug === S.c ? 'true' : null,
      onclick: () => { closePopover(false); switchCompany(c); $('#companyMenuBtn').focus({ preventScroll: true }); },
    }, h('span', { class: 'dot', style: `--dot:${companyColor(c)}` }), h('span', { class: 'company-item-name' }, c.name),
    h('span', { class: 'company-item-board' }, c.board), c.slug === S.c ? h('span', { class: 'company-item-check', 'aria-hidden': 'true' }, '✓') : null)))));
    if (!groups.length) list.append(h('p', { class: 'fnote' }, 'No matching company — add it as a board below.'));
    const saved = loadSaved().filter((x) => !q || x.name.toLowerCase().includes(q));
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
  return { el, sync };
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
const isNewJob = (job) => visit.slug === S.c && isNewSince(job, visit.since, visit.seenIds);

function loadSaved() {
  const v = lsGet(SAVED_KEY, []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.hash === 'string' && typeof x.name === 'string' && x.id).slice(0, 50) : [];
}
const storeSaved = (list) => lsSet(SAVED_KEY, list);
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
  for (const k of ['s', 'd', 'l', 'ks', 'kr', 'kf', 'jg', 'e']) for (const v of st[k]) parts.push(v);
  if (st.r !== 'any') parts.push(st.r === 'remote' ? 'Remote' : 'On-site');
  if (st.p) parts.push(`listed ≤${st.p}d`);
  const name = companyInfo(st.c)?.name || st.c;
  return `${name} · ${parts.slice(0, 3).join(' · ')}${parts.length > 3 ? ` +${parts.length - 3}` : ''}`;
}
const currentSaved = () => { const hsh = searchHash(); return loadSaved().find((x) => x.hash === hsh) || null; };
function matchingIds(hash, jobs) {
  const F = filterSpec(parseHash(`#${hash}`)), now = Date.now();
  return jobs.filter((j) => !failures(j, F, now).length).map((j) => j.id);
}
function toggleSave() {
  const existing = currentSaved();
  if (existing) { removeSaved(existing.id); toast('Removed saved search'); renderQuickbar(); return; }
  const now = new Date().toISOString();
  const hash = searchHash();
  const entry = { id: Math.random().toString(36).slice(2, 10), name: searchName(), hash, createdAt: now, lastSeenAt: now, seen: matchingIds(hash, data.jobs).slice(0, 2000) };
  storeSaved([entry, ...loadSaved()].slice(0, 50));
  toast('Saved — find it in the company menu');
  renderQuickbar();
}
function removeSaved(id) { storeSaved(loadSaved().filter((x) => x.id !== id)); }
/** "N new" for a saved search, when that company's jobs are loaded this session. */
function savedNewCount(x) {
  const slug = parseHash(`#${x.hash}`).c;
  const jobs = jobCache.get(slug);
  if (!jobs) return 0;
  const seen = Array.isArray(x.seen) ? new Set(x.seen) : null;
  const ids = new Set(matchingIds(x.hash, jobs));
  return jobs.filter((j) => ids.has(j.id) && isNewSince(j, x.lastSeenAt, seen)).length;
}
/* D-10: "N new" needs the saved company's roles. The menu fetches the boards of saved searches
   that haven't loaded this session (one request each, at most once), then re-counts in place. */
const savedFetches = new Set();
function prefetchSaved() {
  if (MOCK) return;
  for (const slug of new Set(loadSaved().map((x) => parseHash(`#${x.hash}`).c).filter(Boolean))) {
    if (jobCache.has(slug) || savedFetches.has(slug)) continue;
    savedFetches.add(slug);
    (async () => {
      const res = await dataApi.getJobs(jobsQuery(slug));
      const jobs = Array.isArray(res?.jobs) ? res.jobs : [];
      const source = res?.company?.source || companyInfo(slug)?.source || null;
      for (let i = 0; i < jobs.length; i += PREPARE_CHUNK) { prepare(jobs.slice(i, i + PREPARE_CHUNK), { source }); await yieldTask(); }
      disambiguateLocations(jobs);
      if (!jobCache.has(slug)) jobCache.set(slug, jobs);
      if (popover.id === 'company') syncPopover();
    })().catch(() => { /* offline: the badge just stays off */ });
  }
}
function openSaved(x) {
  closePopover(false);
  const list = loadSaved();
  const slug = parseHash(`#${x.hash}`).c;
  const jobs = jobCache.get(slug);
  const entry = list.find((y) => y.id === x.id);
  if (entry) { entry.lastSeenAt = new Date().toISOString(); if (jobs) entry.seen = matchingIds(x.hash, jobs).slice(0, 2000); storeSaved(list); }
  // Through set(), not pushState + onHashChange: the menu's history entry may still be popping (M-3).
  const next = parseHash(`#${x.hash}`);
  if (!next.c) next.c = S.c;
  if (drawerJobId) closeDrawer();
  set({ ...next, job: null });
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
    case 'sen': return summarize(S.s, 'Seniority');
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
  for (const btn of wrap.children) {
    const q = QUICK.find((x) => x.id === btn.dataset.pop);
    const lbl = quickLabel(q.id);
    btn.classList.toggle('is-active', !!lbl);
    btn.querySelector('.chip-label').textContent = lbl || q.label;
    btn.disabled = data.status !== 'ready';
  }
  syncChipsExpanded();
  const n = activeFilterCount();
  const cnt = $('#filtersCount');
  cnt.hidden = !n;
  cnt.textContent = n;
  $('#clearAll').hidden = !n && !area;
  // F5: the one new main-view control — only when a filter is active.
  const save = $('#saveSearch');
  save.hidden = !n || data.status !== 'ready';
  if (!save.hidden) {
    const on = !!currentSaved();
    save.classList.toggle('is-saved', on); // V9: one pattern — the label changes (Save/Saved), no aria-pressed
    save.querySelector('span:last-child').textContent = on ? 'Saved' : 'Save';
    save.setAttribute('aria-label', on ? 'Saved search — remove it' : 'Save this search');
    save.title = on ? 'Saved — click to remove. Saved searches are in the company menu.' : 'Save this search; the company menu will show new matches next time';
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

function makeSalary({ compact = false } = {}) {
  const hist = h('div', { class: 'hist', 'aria-hidden': 'true' });
  const lo = h('input', { type: 'range', class: 'range range--lo', 'aria-label': 'Minimum salary', step: 5000 });
  const hi = h('input', { type: 'range', class: 'range range--hi', 'aria-label': 'Maximum salary', step: 5000 });
  const fill = h('div', { class: 'range-fill' });
  const track = h('div', { class: 'range-wrap' }, h('div', { class: 'range-track' }), fill, lo, hi);
  // D-13: the Min/Max boxes take a typed bound ("250k", "$300,000", "any"), committed on change/Enter.
  const valInput = (label) => h('input', { type: 'text', class: 'range-val', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', 'aria-label': label });
  const minOut = valInput('Minimum salary, approx USD per year');
  const maxOut = valInput('Maximum salary, approx USD per year');
  const vals = h('div', { class: 'range-vals' }, h('label', null, h('span', null, 'Min'), minOut), h('span', { class: 'range-dash' }, '–'), h('label', null, h('span', null, 'Max'), maxOut));
  const toggle = h('input', { type: 'checkbox', role: 'switch', class: 'switch' });
  const toggleRow = h('label', { class: 'switch-row' }, h('span', null, 'Only show jobs with salary'), toggle);
  const note = h('p', { class: 'fnote' });
  const empty = h('p', { class: 'fnote' }, 'No salary information on this board.');
  const el = h('div', { class: `salary-ctl${compact ? ' salary-ctl--compact' : ''}` }, hist, track, vals, toggleRow, note, empty);
  let dom = null;
  let bins = [];

  const onInput = (which) => () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { if (which === 'lo') { a = b; lo.value = a; } else { b = a; hi.value = b; } }
    set({ smin: a <= dom.lo ? null : a, smax: b >= dom.hi ? null : b }, { replace: true });
    paint(true);
  };
  lo.addEventListener('input', onInput('lo'));
  hi.addEventListener('input', onInput('hi'));
  // A drag produces many replaceState calls; push one history entry when it ends.
  const settle = () => { lastHash = '__dirty'; commit(); };
  lo.addEventListener('change', settle);
  hi.addEventListener('change', settle);
  /** "250k" / "$1.2M" / "300,000" -> 250000 / 1200000 / 300000; "" or "any" -> null; junk -> undefined. */
  const parseBound = (txt) => {
    const t = String(txt).trim().toLowerCase().replace(/[$,\s]|usd/g, '');
    if (!t || t === 'any') return null;
    const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
    if (!m) return undefined;
    return Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1));
  };
  const typed = (which) => () => {
    if (!dom) return;
    const v = parseBound((which === 'lo' ? minOut : maxOut).value);
    if (v === undefined) { paint(true); return; } // not a number: show the current bound again
    let a = S.smin, b = S.smax;
    const c = v == null ? null : Math.min(dom.hi, Math.max(dom.lo, v)); // clamped to the slider's domain
    if (which === 'lo') { a = c == null || c <= dom.lo ? null : c; if (a != null && b != null && a > b) b = a; }
    else { b = c == null || c >= dom.hi ? null : c; if (a != null && b != null && b < a) a = b; }
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
    if (!has) return;
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
    const withSal = data.jobs.filter((j) => j._usd).length;
    const foreign = data.jobs.filter((j) => j._usd && j.salary.currency && j.salary.currency !== 'USD').length;
    const unclear = data.jobs.filter((j) => j.salaryFlag).length;
    note.textContent = `A role matches if its range overlaps yours${foreign ? `; non-USD ranges are compared in approx USD` : ''}${unclear ? `. ${unclear} with unclear pay are left out` : ''}.`;
    paint();
  }
  return { el, sync };
}

function makeChecklist(facet, { searchable = 'auto', grouped = false, limit = 8, order = null, colorDim = null } = {}) {
  let query = '';
  let expanded = false;
  const input = h('input', { type: 'search', class: 'fsearch', placeholder: 'Search…', 'aria-label': 'Search options' });
  const searchWrap = h('div', { class: 'fsearch-wrap' }, h('span', { html: ICON.search }), input);
  const list = h('div', { class: 'checklist', role: 'group' });
  const more = h('button', { type: 'button', class: 'link-btn more-btn' });
  const el = h('div', { class: 'checklist-wrap' }, searchWrap, list, more);
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
    if (query) items = items.filter((it) => it.key.toLowerCase().includes(query));
    const hadFocus = list.contains(document.activeElement) ? document.activeElement.value : focusKey;
    focusKey = null;

    const row = (it) => {
      const id = `f-${facet}-${btoa(unescape(encodeURIComponent(it.key))).replace(/[^a-z0-9]/gi, '')}-${uid}`;
      return h('label', { class: `check${it.count === 0 ? ' is-zero' : ''}`, for: id },
        h('input', { type: 'checkbox', id, value: it.key, checked: selected.has(it.key) }),
        h('span', { class: 'check-box', 'aria-hidden': 'true' }),
        colorDim && colorBy() === colorDim && it.key !== 'Remote' && !/^Remote/.test(it.key) ? h('span', { class: 'dot dot--sm', style: `--dot:${vizColor(it.key)}`, 'aria-hidden': 'true' }) : null,
        h('span', { class: 'check-label' }, it.key), h('span', { class: 'check-count' }, it.count));
    };

    const nodes = [];
    let shown = 0;
    const cap = expanded || query ? Infinity : limit;
    if (grouped) {
      const groups = new Map();
      for (const it of items) {
        const g = derived.fc?.lGroup.get(it.key) || 'ZZ';
        if (!groups.has(g)) groups.set(g, { items: [], total: 0 });
        const grp = groups.get(g);
        grp.items.push(it);
        grp.total += it.count;
      }
      const ordered = [...groups].sort((a, b) => (a[0] === '~remote' ? -1 : b[0] === '~remote' ? 1 : b[1].total - a[1].total));
      for (const [g, grp] of ordered) {
        if (shown >= cap) break;
        nodes.push(h('div', { class: 'check-group' }, g === '~remote' ? 'Remote' : countryName(g)));
        for (const it of grp.items) { if (shown >= cap && !selected.has(it.key)) continue; nodes.push(row(it)); shown++; }
      }
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
      section('Location', makeChecklist('l', { grouped: true, limit: 10, searchable: 'auto', colorDim: 'location' }), { badge: sel('l') }),
      section('Seniority', makeChecklist('s', { order: SENIORITY_ORDER, limit: 10, colorDim: 'seniority' }), { badge: sel('s') }),
      section('Remote', makeRemote(), { badge: sel('r') }),
      ...KW_CATS.map((k) => section(k.title, makeCloud(k), { badge: sel(k.key) })),
      section('Employment type', makeChecklist('e', { limit: 6 }), { open: false, badge: sel('e') }),
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
    case 'loc': return [makeChecklist('l', { grouped: true, limit: 14 })];
    case 'sen': return [makeChecklist('s', { order: SENIORITY_ORDER, limit: 10 })];
    case 'remote': return [makeRemote()];
    case 'more': return [
      titled('Pay', makeSwitch('Only show jobs with salary', 'so')),
      titled('Juice', makeJuiceChips(), 'What’s left after tax, rent and living'),
      titled('Employment type', makeChecklist('e', { limit: 6 })),
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
  const title = { board: 'Add a job board', badge: 'Where this data comes from', company: 'Job boards' }[id] || QUICK.find((q) => q.id === id)?.label;
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
  const source = h('select', { id: 'abSource', required: true },
    h('option', { value: 'greenhouse' }, 'Greenhouse'), h('option', { value: 'ashby' }, 'Ashby'), h('option', { value: 'lever' }, 'Lever'));
  const board = h('input', { id: 'abBoard', required: true, placeholder: 'e.g. stripe', pattern: '[A-Za-z0-9][A-Za-z0-9._\\-]*', autocomplete: 'off', spellcheck: 'false' });
  const name = h('input', { id: 'abName', placeholder: 'e.g. Stripe', autocomplete: 'off' });
  const hint = h('p', { class: 'fnote' });
  const updateHint = () => {
    const slug = board.value.trim() || '<slug>';
    hint.textContent = { greenhouse: `boards.greenhouse.io/${slug}`, ashby: `jobs.ashbyhq.com/${slug}`, lever: `jobs.lever.co/${slug}` }[source.value];
  };
  source.addEventListener('change', updateHint);
  board.addEventListener('input', updateHint);
  updateHint();
  const saved = h('div', { class: 'saved-boards' });
  const form = h('form', { class: 'board-form', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'abSource' }, 'Source'), source),
    h('div', { class: 'field' }, h('label', { for: 'abBoard' }, 'Board slug'), board, hint),
    h('div', { class: 'field' }, h('label', { for: 'abName' }, 'Display name ', h('span', { class: 'muted' }, '(optional)')), name),
    h('button', { type: 'submit', class: 'btn btn--primary btn--block' }, 'Add & open board'),
    saved);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const slug = board.value.trim().replace(/^https?:\/\/[^/]+\//, '').replace(/\/.*$/, '');
    if (!slug || !SLUG_RE.test(slug) || /^\.+$/.test(slug)) { board.setAttribute('aria-invalid', 'true'); board.focus(); hint.textContent = 'Enter the board\u2019s slug (letters, numbers, dashes).'; return; }
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
        h('span', { class: 'saved-name' }, b.name, h('span', { class: 'muted' }, ` · ${SOURCE_LABEL[b.source]}/${b.board}`)),
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
  // One slim inline stats row: "111 roles · 86% list pay · median $341K · middle 50% $277–405K · mostly Engineering"
  const el = $('#statsLine');
  if (data.status === 'loading' || data.status === 'idle') {
    el.replaceChildren(h('span', { class: 'sk sk-line', style: 'width:340px;display:inline-block' }));
    return;
  }
  if (data.status === 'error') { el.replaceChildren(); return; }
  const listed = area ? derived.filtered.filter((j) => area.ids.has(j.id)) : derived.filtered;
  const st = stats(listed);
  const total = data.jobs.length;
  const pct = st.n ? Math.round((st.withSalary / st.n) * 100) : 0;
  const item = (strong, rest, title) => h('span', { class: 'stat', title }, h('strong', null, strong), rest ? ` ${rest}` : null);
  const parts = [
    item(st.n.toLocaleString(), st.n === total ? plural(st.n, 'role').replace(/^[\d,]+ /, '') : `of ${total.toLocaleString()} roles`),
    st.n ? item(`${pct}%`, 'list pay', `${st.withSalary} of ${st.n} postings include a salary range`) : null,
    st.median != null ? item(money(st.median), 'median', 'Median of range midpoints (approx USD)') : null,
    st.p25 != null ? h('span', { class: 'stat', title: '25th – 75th percentile of range midpoints' }, 'middle 50% ', h('strong', null, compactRange(st.p25, st.p75))) : null,
    st.top && st.n > 1 ? h('span', { class: 'stat stat--top', title: `${st.top[1]} roles (${Math.round((st.top[1] / st.n) * 100)}%)` }, 'mostly ', h('strong', null, st.top[0])) : null,
  ].filter(Boolean);
  el.replaceChildren(...parts.flatMap((p, i) => (i ? [h('span', { class: 'stat-sep', 'aria-hidden': 'true' }, '·'), p] : [p])));
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
  try {
    if (!comp) comp = createCompstimateWidget($('#compHost'), { onSelect: (job) => job && openDrawer(job.id) });
    if (!insights) { if (createInsights) insights = createInsights($('#insightsPanel'), { onFilter: onInsightFilter }); else loadInsights(); }
    // Compstimate task force spec (docs/process/compstimate-taskforce.md §3.2): the widget follows
    // the role-defining filters until the user edits a field; it re-estimates only when its own
    // signature changes, so salary/sort/drawer changes cost nothing (Rule 10).
    comp.setContext({ board: data.jobs, visible: compVisible(), company: data.company?.name || S.c, meta: data.meta,
      filters: { d: S.d, rf: S.rf, l: S.l, r: S.r, s: S.s } });
    ensureCompMeta();
    const sig = `${dataSeq}|${derived.filtered.length}|${derived.filtered.map((j) => j.id).join(',')}`;
    if (insights && featSig.ins !== sig) { featSig.ins = sig; insights.update(derived.filtered, data.jobs); }
  } catch (err) { console.error('insights failed', err); }
  // F1: "Compare companies" card (third Insights card), once product's comps module and market data exist.
  const cardHost = $('#compsCardHost');
  if (featSig.comps !== `${dataSeq}|${S.c}`) {
    featSig.comps = `${dataSeq}|${S.c}`;
    loadMarket().then((market) => {
      if (!market) { cardHost.hidden = true; return; }
      try {
        if (!compsCard) compsCard = createCompsCard(cardHost, { onPickCompany: (slug, filters) => pickCompany(slug, filters) });
        compsCard.update(market, { company: S.c, jobs: data.jobs });
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
  const jobs = derived.filtered;

  if (!data.jobs.length) {
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ title: 'No open roles on this board', body: 'The board returned zero postings. Check the slug or try another company.' }));
    return;
  }
  if (!jobs.length) {
    overlay.hidden = false;
    overlay.replaceChildren(stateCard({ title: 'No roles match', body: 'Try widening the salary range or removing a filter.', action: ['Clear filters', clearFilters] }));
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
  const sig = jobs.map((j) => j.id).join(',') + (S.m === 'chart' ? `|${S.v}|${S.g}` : `|${S.mc}`);
  if (vizSig[S.m] !== sig) {
    vizSig[S.m] = sig;
    try {
      if (S.m === 'chart') chart.update(jobs, { view: S.v, groupBy: S.g, colorBy: colorBy() });
      // Fit once per company load (map.js pads by half a pin, lowers minZoom as needed and
      // waits for a hidden container to be sized); plain updates keep the user's viewport.
      else if (mapFitPending) { mapFitPending = false; map.update(jobs, { fit: true, colorMode: S.mc }); }
      else map.update(jobs, { colorMode: S.mc });
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

function stateCard({ icon = null, title, body, action = null, tone = '' }) {
  return h('div', { class: `state-card ${tone ? `state-card--${tone}` : ''}` },
    icon ? h('div', { class: 'state-ico', html: icon }) : h('div', { class: 'state-ico state-ico--melon' }, h('img', { src: 'favicon.svg', alt: '' })),
    h('h3', null, title), body ? h('p', null, body) : null,
    action ? h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: action[1] }, action[0]) : null);
}

/* --------------------------------------------------------------- results */

let newestOpt = null;
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
  sortSel.value = effectiveSort();
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
  const st = stats(visible);
  const tokens = S.q.toLowerCase().split(/\s+/).filter(Boolean);
  // M-18: the "· N in title" suffix only when it says something (no "0 roles · 0 in title").
  const inTitle = tokens.length && visible.length ? visible.filter((j) => titleMatch(j, tokens)).length || null : null;
  title.replaceChildren(...nn(h('strong', null, plural(st.n, 'role')), inTitle != null ? h('span', { class: 'muted', title: 'Roles whose title or team matches come first; the rest match on skills or keywords' }, ` · ${inTitle.toLocaleString()} in title`) : null));
  if (!visible.length) {
    list.replaceChildren(h('li', { class: 'list-empty' }, stateCard({
      title: data.jobs.length ? 'No roles match' : 'No open roles',
      body: data.jobs.length ? 'Nothing fits every filter you\u2019ve set.' : 'This board has no postings right now.',
      action: data.jobs.length ? ['Clear filters', clearFilters] : null,
    })));
    return;
  }
  const items = visible.slice(0, resultsLimit).map(card);
  listIO?.disconnect();
  if (visible.length > resultsLimit) {
    const label = () => `Show ${Math.min(PAGE * 2, visible.length - resultsLimit)} more of ${visible.length - resultsLimit}`;
    const btn = h('button', { type: 'button', class: 'btn btn--ghost btn--block' }, label());
    const more = h('li', { class: 'list-more' }, btn);
    // Append the next page in place (no full list rebuild, the scroll position stays put).
    const loadMore = (n = PAGE * 2) => {
      const from = resultsLimit;
      resultsLimit += n;
      more.before(...visible.slice(from, resultsLimit).map(card));
      if (visible.length <= resultsLimit) { listIO?.disconnect(); more.remove(); } else btn.textContent = label();
    };
    btn.addEventListener('click', () => loadMore());
    items.push(more);
    // Phones: cards render lazily, the next page loads as the list nears its end.
    if (isMobile() && 'IntersectionObserver' in window) {
      // Append 4 cards per frame while the end is near (~500 px of runway per frame): each step
      // stays inside a frame budget at 4x CPU (a card costs 2-4 ms), so scrolling never stalls.
      const near = () => more.isConnected && more.getBoundingClientRect().top - list.getBoundingClientRect().bottom < 600;
      const step = () => { loadMore(4); if (near()) requestAnimationFrame(step); };
      listIO = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) requestAnimationFrame(step); }, { root: list, rootMargin: '0px 0px 600px 0px' });
      listIO.observe(more);
    }
  }
  list.replaceChildren(...items);
}
let listIO = null;

const JUICE_TIP = 'Juice Score: livability $, what’s left after tax, rent and living costs';
function juiceBadge(job) {
  const b = job.juice?.best;
  if (!b) return null;
  const est = b.estimated ? '≈' : '';
  return h('span', { class: `juice-badge juice--${String(b.grade).toLowerCase()}`, title: `${JUICE_TIP}${b.estimated ? ' (estimated)' : ''}. Best in ${b.locationName || b.cityName}: ${money(b.net)}/yr left.`,
    'aria-label': `Juice Score ${est ? 'about ' : ''}${b.score}, ${b.grade}` }, `🍉 ${est}${b.score} · ${b.grade}`);
}

function locSummary(job, max = 1) {
  const names = job.locations.map((l) => (l.remote ? l.name || 'Remote' : l.city && l.region ? `${l.city}, ${l.region}` : l.name));
  if (!names.length) return 'Location not listed';
  return names.slice(0, max).join(' · ') + (names.length > max ? ` +${names.length - max}` : '');
}

function topTags(job, n = 3) {
  const tags = [...job.keywords.skills, ...job.keywords.responsibilities, ...job.keywords.fit];
  return [...new Set(tags)].slice(0, n);
}

/** Card age slot (F4): "12d", "8mo", "2y+", "30d+" when the age is a lower bound; nothing when unknown. */
function ageText(job) {
  const d = job._age;
  if (d == null) return '';
  const t = d < 60 ? `${d}d` : d < 730 ? `${Math.round(d / 30.44)}mo` : `${Math.floor(d / 365)}y`;
  return job.ageIsMinimum || d >= 730 ? `${t}+` : t;
}
function ageTitle(job) {
  if (job._age == null) return '';
  return `${job.ageIsMinimum ? 'Open at least' : 'Listed'} ${plural(job._age, 'day')}${job.ageIsMinimum ? '' : ' ago'}`;
}

/** The card's single status tag, by priority: Pay changed > New > Reposted. */
function statusTag(job) {
  if (job.payChange?.dir) return h('span', { class: 'tag tag--status', title: `Pay range ${job.payChange.dir === 'up' ? 'raised' : 'lowered'} ${Math.abs(Math.round(job.payChange.pct))}%` }, `Pay ${job.payChange.dir === 'up' ? '↑' : '↓'}`);
  if (isNewJob(job)) return h('span', { class: 'tag tag--status tag--new', title: 'New since your last visit' }, 'New');
  if (job.repost?.count > 0) return h('span', { class: 'tag tag--status', title: `Reposted ${job.repost.count}×` }, 'Reposted');
  return null;
}

function card(job) {
  const status = statusTag(job);
  const color = vizColor(keyOf(job, colorBy()));
  const range = salaryRange(job.salary);
  const isOpen = job.id === drawerJobId;
  const el = h('li', null, h('article', {
    class: `card${isOpen ? ' is-open' : ''}`, dataset: { id: job.id }, tabindex: '0', role: 'button',
    'aria-label': `${job.title}, ${range || (job.salaryFlag ? 'pay unclear, see posting' : 'salary not listed')}, ${locSummary(job, 3)}`, style: `--stripe:${color}`,
  },
  h('div', { class: 'card-top' },
    h('h3', { class: 'card-title' }, job.title),
    range ? h('span', { class: 'sal-pill' }, range)
      : job.salaryFlag ? h('span', { class: 'sal-pill sal-pill--unclear', title: job.salaryFlag.reason || 'Pay unclear' }, 'Pay unclear')
        : h('span', { class: 'sal-pill sal-pill--none' }, 'No salary')),
  h('div', { class: 'card-meta' },
    h('span', { class: 'card-dot', style: `--dot:${color}`, 'aria-hidden': 'true' }),
    h('span', { class: 'card-dept' }, deptKey(job)), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
    h('span', { class: 'card-loc' }, locSummary(job, 1)), job.remote ? h('span', { class: 'tag tag--remote' }, 'Remote') : null),
  h('div', { class: 'card-foot' },
    h('span', { class: `sen sen--${(job.seniority || 'mid').toLowerCase().replace(/\W/g, '')}` }, job.seniority || '—'),
    juiceBadge(job),
    ...topTags(job, Math.max(0, 2 - (job.juice ? 1 : 0) - (status ? 1 : 0))).map((t) => h('span', { class: 'tag' }, t)),
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
  // The original trigger may have been re-rendered away (e.g. a keyword toggled in the drawer).
  const target = drawerReturnFocus?.isConnected ? drawerReturnFocus
    : $(`.card[data-id="${cssId(closedId)}"]`) || $('#resultsList');
  target?.focus({ preventScroll: true });
  drawerReturnFocus = null;
}

function renderDrawerNav() {
  const idx = visible.findIndex((j) => j.id === drawerJobId);
  const prev = $('#drawerPrev'), next = $('#drawerNext'), pos = $('#drawerPos');
  if (!prev) return;
  prev.disabled = idx <= 0;
  next.disabled = idx < 0 || idx >= visible.length - 1;
  pos.textContent = idx >= 0 ? `${idx + 1} of ${visible.length}` : '';
}
function stepDrawer(d) {
  const idx = visible.findIndex((j) => j.id === drawerJobId);
  const nxt = visible[idx + d];
  if (nxt) openDrawer(nxt.id, { step: true });
}

function percentile(job) {
  if (!job.salary) return null;
  if (!job._usd) return null;
  const mids = data.jobs.filter((j) => j._usd && j.id !== job.id).map((j) => j._mid);
  if (!mids.length) return null;
  return Math.round((mids.filter((m) => m < job._mid).length / mids.length) * 100);
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Company pay distribution (midpoints, approx USD) with this job's range marked. DOM-built, no HTML strings. */
function salaryDistribution(job) {
  const base = salaryDomain();
  const dom = base && job._usd ? { lo: Math.min(base.lo, job._usd.min), hi: Math.max(base.hi, job._usd.max) } : base;
  const mids = data.jobs.filter((j) => j._usd).map((j) => j._mid).sort((a, b) => a - b);
  if (!dom || !mids.length || !job._usd) return null;
  const W = 100, H = 40, N = 32;
  const counts = new Array(N).fill(0);
  for (const m of mids) counts[Math.min(N - 1, Math.max(0, Math.floor(((m - dom.lo) / (dom.hi - dom.lo)) * N)))]++;
  const max = Math.max(...counts);
  const x = (v) => ((v - dom.lo) / (dom.hi - dom.lo)) * W;
  const bw = W / N;
  const median = quantile(mids, 0.5);
  const svg = svgEl('svg', { class: 'dist', viewBox: `0 0 ${W} ${H + 12}`, preserveAspectRatio: 'none', role: 'img',
    'aria-label': `Pay distribution of ${mids.length} roles; this role spans ${money(job._usd.min)} to ${money(job._usd.max)}, median ${money(median)}` });
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
  const foreign = job.salary.currency && job.salary.currency !== 'USD';
  return h('div', { class: 'd-dist' }, svg,
    h('div', { class: 'dist-axis' }, h('span', null, money(dom.lo)), medLabel, h('span', null, money(dom.hi))),
    foreign ? h('p', { class: 'fnote' }, `≈ ${money(job._usd.min)}–${money(job._usd.max).replace(/^\$/, '')} in approx USD for comparison`) : null);
}

const INTERVAL_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly', year: 'annual' };

let juicePeriod = 'year'; // drawer waterfall: per year or per month (kept for the session)
const JUICE_DOC = 'methodology/#1-the-formula'; // site page rendered from docs/LIVABILITY.md (scripts/methodology.js); never off-site

/** Drawer: Juice Score waterfall for the best location, plus the other locations in a disclosure. */
function juiceBlock(job) {
  const jb = job.juice;
  if (!jb?.best) return null;
  const b = jb.best;
  const grade = String(b.grade).toLowerCase();
  const others = jb.byLocation.filter((l) => l !== b && !(l.locationName === b.locationName && l.city === b.city));
  const body = h('div', { class: 'juice-body' });
  // UX-5: one headline line; the waterfall sits in a disclosure so "Same role elsewhere" stays near the top.
  const sec = h('section', { class: 'd-juice', 'aria-labelledby': 'juiceTitle' },
    h('details', { class: 'juice-details' },
      h('summary', null,
        h('span', { id: 'juiceTitle', class: 'juice-title' }, '🍉 Juice'),
        h('span', { class: `juice-score juice--${grade}`, title: JUICE_TIP }, `${b.estimated ? '≈' : ''}${b.score} · ${b.grade}`),
        h('span', { class: 'juice-head-net' }, `${b.net < 0 ? '−' : ''}${money(Math.abs(b.net))}/yr left in ${b.cityName || b.locationName}`),
        h('span', { class: 'fsec-caret', html: ICON.chevron })),
      h('p', { class: 'juice-where' }, 'Juice: what’s left after tax, rent and living costs (approx USD).'),
      body));
  const render = (focusPeriod) => {
    const div = juicePeriod === 'month' ? 12 : 1;
    const per = juicePeriod === 'month' ? '/mo' : '/yr';
    const amt = (n, sign = '') => `${sign}${money(Math.abs(n) / div)}${per}`;
    const g = Math.max(1, b.gross);
    const seg = (lo, hi) => { const x = Math.max(0, Math.min(g, lo)), z = Math.max(0, Math.min(g, hi)); return `left:${(x / g) * 100}%;width:${Math.max(0, ((z - x) / g) * 100)}%`; };
    const afterTax = b.gross - b.tax, afterRent = afterTax - b.rent;
    const tp = b.taxParts;
    const rows = [
      ['Gross pay', amt(b.gross), seg(0, b.gross), 'gross', null],
      ['Tax', amt(b.tax, '−'), seg(afterTax, b.gross), 'tax', tp ? `income ${money(tp.income / div)} · regional ${money(tp.regional / div)} · social ${money(tp.social / div)}` : null],
      ['Rent', amt(b.rent, '−'), seg(afterRent, afterTax), 'rent', '1-bedroom, city centre'],
      ['Living costs', amt(b.living, '−'), seg(b.net, afterRent), 'living', 'everyday costs excluding rent'],
      ['Juice left', `${b.net < 0 ? '−' : ''}${money(Math.abs(b.net) / div)}${per}`, seg(0, b.net), 'net', null],
    ];
    const toggle = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': 'Show amounts per' },
      ...[['month', 'Monthly'], ['year', 'Yearly']].map(([v, label]) => h('button', {
        type: 'button', 'aria-pressed': String(juicePeriod === v), dataset: { period: v },
        onclick: () => { juicePeriod = v; render(v); }, // V5: re-render this block only and keep focus here
      }, label)));
    body.replaceChildren(...nn(
      toggle,
      h('div', { class: 'waterfall', role: 'table', 'aria-label': 'Juice breakdown' },
        ...rows.map(([label, value, style, kind, detail]) => h('div', { class: `wf-row wf--${kind}`, role: 'row' },
          h('span', { class: 'wf-label', role: 'rowheader' }, label),
          h('span', { class: 'wf-track', role: 'cell', 'aria-hidden': 'true' }, h('span', { class: 'wf-bar', style })),
          h('span', { class: 'wf-value', role: 'cell' }, value),
          detail ? h('span', { class: 'wf-detail' }, detail) : null))),
      b.rentBurden != null ? h('p', { class: 'juice-facts' }, 'Rent takes ', h('strong', null, `${Math.round(b.rentBurden * 100)}%`), ' of take-home pay.') : null,
      b.currencyMismatch ? h('p', { class: 'fnote' }, 'The posted salary currency differs from the local one, so it is applied as posted.') : null,
      others.length ? h('details', { class: 'juice-compare' }, h('summary', null, `Compare locations (${others.length + 1})`),
        h('ul', null, ...[b, ...others].map((l) => h('li', null,
          h('span', { class: 'jc-name' }, l.locationName || l.cityName, l === b ? h('span', { class: 'muted' }, ' · best') : null),
          h('span', { class: `juice-grade juice--${String(l.grade).toLowerCase()}` }, `${l.estimated ? '≈' : ''}${l.score} ${l.grade}`),
          h('span', { class: 'jc-net' }, `${l.net < 0 ? '−' : ''}${money(Math.abs(l.net) / div)}${per}`))))) : null,
      h('p', { class: 'juice-disclaimer' }, 'Estimate, not financial advice. ', h('a', { href: JUICE_DOC, target: '_blank', rel: 'noopener noreferrer' }, 'How it’s calculated')),
    ));
    if (focusPeriod) body.querySelector(`[data-period="${focusPeriod}"]`)?.focus({ preventScroll: true });
  };
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

/** At most two muted honest-number labels (ROADMAP F2), in the roadmap's priority order. */
function payLabels(job) {
  const s = job.salary;
  if (!s) return null;
  const spread = s.spread ?? (s.min > 0 ? s.max / s.min : null);
  const labels = [
    s.zones > 1 ? ['Multiple pay zones', 'The posting lists different ranges for different locations or levels'] : null,
    spread != null && spread >= 2 ? [`Wide range (${spread.toFixed(1)}×)`, 'The top of the range is at least twice the bottom'] : null,
    s.min === s.max ? ['Single figure', 'The posting gives one number, not a range'] : null,
    job.extras?.equity ? ['+ equity mentioned', 'The description mentions equity; it isn\u2019t in this figure'] : null,
    job.extras?.bonus ? ['+ bonus mentioned', 'The description mentions a bonus; it isn\u2019t in this figure'] : null,
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
 * Insights widget. Nothing is shown below MIN_COMPARABLES comparables (Rule 6).
 */
function compstimateBlock(job) {
  ensureCompMeta();
  let est = null;
  try { est = compstimateForJob(data.jobs, job); } catch (err) { console.warn('compstimate failed', err); }
  if (!est || est.mid == null || !isFinite(est.mid) || !(est.n >= MIN_COMPARABLES)) return null;
  const parts = [est.query?.seniority, est.query?.location].filter(Boolean);
  return h('div', { class: 'd-comp', role: 'note' },
    h('div', { class: 'd-comp-top' },
      h('span', { class: 'd-comp-label', title: 'Compstimate: estimated pay from similar roles' }, 'Compstimate'),
      h('span', { class: 'd-comp-amt' }, `≈ ${money(est.mid)}`),
      h('span', { class: 'muted' }, `(${money(est.low)}–${money(est.high).replace(/^\$/, '')}, ${String(displayConfidence(est, data.meta) || '').toLowerCase()} confidence)`)),
    h('p', { class: 'd-comp-note' }, `${basisLine(est.n, data.company?.name || 'this company', parts)}. An estimate, not a figure from the posting (approx USD / year).`),
    accuracyLine(data.meta) ? h('p', { class: 'd-comp-note' }, isLowAccuracy(data.meta) ? h('strong', null, 'Low confidence. ') : null, `${accuracyLine(data.meta)}.`) : null);
}

function annualNote(sal) {
  const orig = sal.originalInterval || (sal.interval && sal.interval !== 'year' ? sal.interval : null);
  return orig ? h('div', { class: 'd-annual' }, `Annualized from ${INTERVAL_ADJ[orig] || orig} pay${sal.text ? ` (${sal.text})` : ''}`) : null;
}

function drawerContent(job) {
  const company = data.company || {};
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
    bulletsHost.replaceChildren(...[bullets('What you\u2019ll do', job.sections.responsibilities), bullets('What they look for', job.sections.fit)].filter(Boolean));
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
    // Phones show this as a "Back" arrow at the left of a full-screen page (styles.css).
    h('button', { type: 'button', class: 'icon-btn', id: 'drawerClose', 'aria-label': 'Close details (Esc)', html: `<span class="ico-close">${ICON.close}</span><span class="ico-back">${ICON.prev}</span>`, onclick: () => closeDrawer() }));

  const sal = job.salary;
  const salaryBlock = h('section', { class: 'd-salary' },
    sal ? h('div', { class: 'd-sal-top' },
      h('div', null, h('div', { class: 'd-sal-amt' }, salaryRange(sal)), h('div', { class: 'muted' }, `${sal.currency || 'USD'} · per year`), annualNote(sal)),
      pct != null ? h('div', { class: 'd-pct' }, h('div', { class: 'd-pct-num' }, pct >= 100 ? 'Top' : `${pct}%`), h('div', { class: 'muted' }, pct >= 100 ? 'paid here' : 'percentile')) : null)
      : job.salaryFlag ? payUnclearBlock(job)
        : h('div', { class: 'd-sal-none' }, h('strong', null, 'Salary not listed'), h('span', { class: 'muted' }, ' — this posting doesn\u2019t include a pay range.'), compstimateBlock(job)),
    sal ? salaryDistribution(job) : null,
    sal ? payLabels(job) : null,
    sal ? h('p', { class: 'd-pay-caption' }, 'Posted base pay. Equity and bonus aren\u2019t included.') : null,
    sal && pct != null ? h('p', { class: 'd-pct-text' }, pct >= 100 ? `Top-paid role at ${company.name || job.companyName}` : `Pays more than ${pct}% of roles at ${company.name || job.companyName}`) : null);

  const locs = fold('d-locs', job.locations.length > 1 ? `Locations (${job.locations.length})` : 'Location',
    h('ul', { class: 'loc-list' }, ...(job.locations.length ? job.locations.map((l) => h('li', null,
      h('span', { class: 'loc-ico', html: l.remote ? ICON.globe : ICON.pin }),
      h('span', null, l.name || [l.city, l.region].filter(Boolean).join(', ')),
      l.country && !l.remote ? h('span', { class: 'muted' }, ` · ${countryName(l.country)}`) : null)) : [h('li', { class: 'muted' }, 'Not listed')])));

  const source = SOURCE_LABEL[company.source] || 'job board';
  const foot = h('div', { class: 'drawer-foot' },
    h('a', { class: 'btn btn--primary btn--lg apply', href: job.url, target: '_blank', rel: 'noopener noreferrer', title: `Opens ${applyHost(job.url) || 'the posting'} in a new tab` },
      // Demo jobs link to the real board index, not to a real posting — say so.
      h('span', { class: 'apply-label' }, data.mode === 'demo' && !MOCK ? `Open the real ${source} board` : `Apply on ${source}`, applyHost(job.url) ? h('span', { class: 'apply-host' }, applyHost(job.url)) : null), h('span', { html: ICON.ext })),
    h('button', { type: 'button', class: 'btn btn--ghost btn--lg', 'aria-label': 'Copy link to this role', html: ICON.link, onclick: copyLink }));

  return [head, h('div', { class: 'drawer-scroll', tabindex: '0', 'aria-label': 'Role details' },
    h('div', { class: 'd-company' }, h('span', { class: 'dot', style: `--dot:${companyColor(company)}` }), company.name || job.companyName,
      data.mode === 'demo' ? h('span', { class: 'tag tag--demo' }, 'Demo') : null),
    h('h2', { class: 'd-title', id: 'drawerTitle' }, job.title),
    h('div', { class: 'd-meta' }, ...[deptKey(job), job.team, job.employmentType].filter(Boolean).map((t, i) => [i ? h('span', { class: 'sep' }, '·') : null, h('span', null, t)]),
      h('span', { class: `sen sen--${(job.seniority || 'mid').toLowerCase().replace(/\W/g, '')}` }, job.seniority || '—'),
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
    lines.push(job.ageIsMinimum
      ? `Open at least ${plural(job._age, 'day')} (it was already listed when melon-seek started tracking this board)`
      : `Listed ${job._age === 0 ? 'today' : `${plural(job._age, 'day')} ago`}${posted ? ` (${new Date(posted).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}`);
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
  if (!job._usd || !job._family) return null;
  const body = h('div', { class: 'comps-body' }, h('div', { class: 'sk sk-line', style: 'width:80%' }), h('div', { class: 'sk sk-line', style: 'width:60%' }));
  const sec = fold('d-comps', 'Same role elsewhere', body);
  loadMarket().then((market) => {
    if (!sec.isConnected && drawerJobId !== job.id) return;
    let res = null;
    try { res = market ? compsForJob(market, job, { includeSelf: true }) : null; } catch (err) { console.warn('compsForJob failed', err); }
    const rows = res?.rows || [];
    if (!rows.some((r) => !r.current)) { sec.hidden = true; applyDrawerBudget(); return; }
    const family = FAMILY_LABEL[res.family] || res.family;
    const bySen = res.matchedOn === 'family+seniority';
    const filters = { family: res.family, seniority: bySen ? res.seniority : null };
    const chartHost = h('div', { class: 'comps-chart' });
    body.replaceChildren(
      h('p', { class: 'comps-note muted' }, bySen
        ? `${family} roles at ${res.seniority} level: median and middle 50% of posted base pay (approx USD).`
        : `No other company lists this level, so this compares all ${family} roles.`),
      chartHost);
    try {
      destroyDrawerComps();
      drawerComps = createCompsChart(chartHost, { onSelect: (slug) => { if (slug && slug !== job.company) pickCompany(slug, filters); } });
      drawerComps.update(rows, { current: job.company });
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
    if (isMobile() && e.target.matches?.('#filters input, #popover input')) setTimeout(() => e.target.scrollIntoView?.({ block: 'center' }), 300);
  });
  document.addEventListener('focusout', () => setTimeout(sync, 50));
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
    const c = e.target.closest('.card[data-id]');
    if (!c) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(c.dataset.id); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = [...list.querySelectorAll('.card[data-id]')];
      cards[cards.indexOf(c) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    }
  });
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

async function boot() {
  try {
    if (localStorage.getItem('melon-seek.filtersCollapsed') === '1') document.body.classList.add('filters-collapsed');
  } catch { /* ignore */ }
  if (isOverlayFilters()) $('#filtersToggle').setAttribute('aria-expanded', 'false');
  bindEvents();
  setSheet('peek');
  S = parseHash();
  render();
  try {
    const list = await dataApi.getCompanies();
    companies = Array.isArray(list) && list.length ? list : FALLBACK_COMPANIES;
  } catch (err) {
    console.warn('companies failed', err);
    companies = FALLBACK_COMPANIES;
  }
  if (!S.c) S.c = companies[0].slug;
  lastHash = serialize();
  history.replaceState(null, '', location.pathname + location.search + (lastHash ? `#${lastHash}` : ''));
  await loadJobs();
}

boot();

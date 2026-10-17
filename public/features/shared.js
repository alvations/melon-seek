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

/**
 * Pay for a fixed term (a 12-week internship, a 4-month fellowship): salary.termWeeks when the
 * posting states the length, or a stipend. Never a plain yearly salary.
 */
export function isFixedTerm(job) {
  const s = job?.salary;
  return !!s && (Number(s.termWeeks) > 0 || s.kind === 'stipend');
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

/** The location strings a salary was posted for (salary.places, else every range's places), or null. */
function postedPlaces(sal) {
  if (Array.isArray(sal?.places) && sal.places.length) return new Set(sal.places);
  const rs = Array.isArray(sal?.ranges) ? sal.ranges : [];
  if (rs.length && rs.every((r) => Array.isArray(r?.locations) && r.locations.length)) return new Set(rs.flatMap((r) => r.locations));
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
 * @returns {{ pct: number|null, n: number, country: string|null, others: number }|null}
 *   pct: the share of same-country roles paid less (0..100), null with fewer than minN of them;
 *   n: how many same-country roles; others: pool roles left out because their pay is for another
 *   country. null when the posting has no comparable pay.
 */
export function payRank(job, pool, { mid = (j) => j?._mid, minN = 5 } = {}) {
  const v = mid(job);
  if (!Number.isFinite(v)) return null;
  const country = payCountry(job);
  const usable = (pool || []).filter((j) => j && j !== job && (job?.id == null || j.id !== job.id) && Number.isFinite(mid(j)));
  const same = usable.filter((j) => payCountry(j) === country);
  const pct = same.length >= minN ? Math.round((same.filter((j) => mid(j) < v).length / same.length) * 100) : null;
  return { pct, n: same.length, country, others: usable.length - same.length };
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

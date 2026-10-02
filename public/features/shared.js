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

/** Static, approximate FX rates to USD (fallback when palette.js lacks a currency). */
export const FX_FALLBACK = Object.freeze({
  USD: 1, GBP: 1.27, EUR: 1.09, CAD: 0.73, AUD: 0.66, JPY: 0.0067, SGD: 0.74, CHF: 1.13,
  INR: 0.012, SEK: 0.095, NOK: 0.093, DKK: 0.146, PLN: 0.25, ILS: 0.27, KRW: 0.00073,
  HKD: 0.128, NZD: 0.6, MXN: 0.055, BRL: 0.18, CNY: 0.14,
});

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
// Stats
// ---------------------------------------------------------------------------

function finite(values) {
  const out = [];
  for (const v of values || []) { const n = typeof v === 'number' ? v : num(v); if (n != null) out.push(n); }
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

export function plural(n, word, many = word + 's') { return `${n} ${n === 1 ? word : many}`; }

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/** Display/filter key for a Location: city (or name); remote entries -> "Remote". */
export function locationKey(loc) {
  if (!loc) return null;
  if (loc.remote) return 'Remote';
  return loc.city || loc.name || null;
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
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v);
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
 * it on pointer hover and keyboard focus. Content is set with textContent only.
 */
export function createTooltip(root) {
  const tip = h('div', { class: 'ms-tip', role: 'tooltip', id: uid('tip'), hidden: true });
  root.appendChild(tip);
  let owner = null;

  function render(c) {
    tip.replaceChildren();
    if (c.value != null) tip.appendChild(h('div', { class: 'ms-tip__value' }, c.value));
    if (c.label != null) tip.appendChild(h('div', { class: 'ms-tip__label' }, c.label));
    if (c.rows && c.rows.length) {
      tip.appendChild(h('dl', { class: 'ms-tip__rows' },
        c.rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
    }
  }

  function place(x, y, below) {
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 14, top = below ? y + 8 : y + 16;
    if (left + r.width > vw - 8) left = Math.max(8, x - r.width - 14);
    if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 12);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function show(el, content, x, y, below) {
    owner = el;
    render(content);
    place(x, y, below);
  }

  function hide(el) { if (!el || el === owner) { tip.hidden = true; owner = null; } }

  function bind(el, getContent) {
    el.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') show(el, getContent(), e.clientX, e.clientY); });
    el.addEventListener('pointerleave', () => hide(el));
    el.addEventListener('focus', () => {
      if (!el.matches(':focus-visible')) return;
      const r = el.getBoundingClientRect();
      show(el, getContent(), r.left + Math.min(r.width / 2, 160), r.bottom, true);
    });
    el.addEventListener('blur', () => hide(el));
  }

  const onScroll = () => hide();
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  return { bind, hide: () => hide(), destroy() { window.removeEventListener('scroll', onScroll, { capture: true }); tip.remove(); } };
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

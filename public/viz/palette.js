// melon-seek viz palette: categorical identity colors, sequential salary scale,
// money formatting and a static approximate FX table.
//
// Categorical hues are the validated 8-slot reference palette (dataviz skill,
// run through validate_palette.js in light + dark). A 9th+ key is never given a
// generated hue: it folds into OTHER (neutral gray).

const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CAT_DARK  = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER_LIGHT = '#a8a69f';
const OTHER_DARK = '#6b6a65';

export const OTHER_KEY = 'Other';
export const SLOT_COUNT = CAT_LIGHT.length;

/** True when the page is in dark mode (explicit data-theme wins over the OS). */
export function isDark() {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Call fn whenever light/dark changes (OS setting or <html data-theme>). Returns an unsubscribe fn. */
export function onThemeChange(fn) {
  let last = isDark();
  const check = () => { const d = isDark(); if (d !== last) { last = d; fn(d); } };
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener?.('change', check);
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(check) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  return () => { mq?.removeEventListener?.('change', check); mo?.disconnect(); };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// key -> slot registry. assignColors() fills it so the keys currently on screen
// get distinct slots; colorFor() falls back to a stable hash slot otherwise.
const registry = new Map();

/**
 * Give up to 8 keys distinct slots. Each key prefers its own hash slot (so a key
 * keeps its color across datasets/filters whenever possible) and linear-probes
 * to the next free slot on collision. Keys are processed in the given order.
 * Returns Map(key -> slot). Keys beyond 8 are not registered (they are "Other").
 */
export function assignColors(keys) {
  const used = new Set();
  const out = new Map();
  for (const key of keys.slice(0, SLOT_COUNT)) {
    let s = hash(String(key)) % SLOT_COUNT;
    while (used.has(s)) s = (s + 1) % SLOT_COUNT;
    used.add(s); out.set(key, s); registry.set(key, s);
  }
  return out;
}

/** Categorical color for a key (hex string for the current light/dark mode). Deterministic. */
export function colorFor(key) {
  const dark = isDark();
  if (key == null || key === OTHER_KEY) return dark ? OTHER_DARK : OTHER_LIGHT;
  const k = String(key);
  const slot = registry.has(k) ? registry.get(k) : hash(k) % SLOT_COUNT;
  return (dark ? CAT_DARK : CAT_LIGHT)[slot];
}

/** Neutral color for "Other" / unencoded marks. */
export function otherColor() { return isDark() ? OTHER_DARK : OTHER_LIGHT; }

// ---------- money ----------

/** 352500 -> "$352K", 1234567 -> "$1.2M", 95000 -> "$95K", 950 -> "$950". */
export function formatMoney(n, { symbol = '$' } = {}) {
  if (n == null || !isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  let s;
  if (a >= 999500) {
    const m = a / 1e6;
    s = (m >= 10 ? Math.round(m) : +m.toFixed(1)) + 'M';
  } else if (a >= 1000) {
    s = Math.round(a / 1000 - 1e-9) + 'K'; // half-down: 352500 -> $352K
  } else {
    s = String(Math.round(a));
  }
  return sign + symbol + s;
}

const SYMBOLS = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', JPY: '¥', SGD: 'S$', CHF: 'CHF ' };

/** Format in the original currency, e.g. formatCurrency(95000,"GBP") -> "£95K". */
export function formatCurrency(n, currency = 'USD') {
  const c = (currency || 'USD').toUpperCase();
  return formatMoney(n, { symbol: SYMBOLS[c] ?? (c + ' ') });
}

/** Static, approximate FX rates to USD (labelled "approx USD" in the UI; no live FX). */
export const FX_TO_USD = Object.freeze({
  USD: 1, GBP: 1.27, EUR: 1.09, CAD: 0.73, AUD: 0.66, JPY: 0.0067, SGD: 0.74, CHF: 1.13,
});

/** Convert amount in currency to approximate USD. Unknown currency -> amount unchanged. */
export function toUSD(amount, currency = 'USD') {
  if (amount == null || !isFinite(amount)) return amount;
  const r = FX_TO_USD[(currency || 'USD').toUpperCase()];
  return r == null ? amount : amount * r;
}

/** True if the currency is something other than USD (so values are approximate). */
export function isForeign(currency) { return !!currency && currency.toUpperCase() !== 'USD'; }

/** Whether toUSD knows this currency. */
export function hasFx(currency) { return FX_TO_USD[(currency || 'USD').toUpperCase()] != null; }

// ---------- sequential salary scale (one hue: blue, light -> dark) ----------

const SEQ_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
// Dark mode: same ramp, stepped so the low end still clears the dark surface.
const SEQ_DARK  = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#6da7ec', '#9ec5f4'];

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }

/** Sequential salary color for t in [0,1] (0 = lowest median, 1 = highest). */
export function salaryColor(t) {
  const ramp = isDark() ? SEQ_DARK : SEQ_LIGHT;
  const x = Math.max(0, Math.min(1, +t || 0)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
  return rgbToHex(a.map((v, k) => v + (b[k] - v) * f));
}

/** Ink (near-black or white) that clears contrast on the given hex fill. */
export function inkOn(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contrast vs white = 1.05/(L+.05); vs ink(#0b0b0b ~ L .0034) = (L+.05)/.0534
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0534 ? '#ffffff' : '#0b0b0b';
}

// ---------- scales ----------

/** Nice tick values covering [lo, hi] with about `count` ticks. */
export function niceTicks(lo, hi, count = 6) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step * 1e-9; v += step) ticks.push(+v.toFixed(6));
  return { ticks, step, start, end };
}

export function median(values) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

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

/** True when the user asked for reduced motion (JS-driven scroll/fly animations must honor it). */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 * Give up to 8 keys distinct slots, keys ordered by priority (e.g. count desc).
 * Sticky: a key that already holds a slot keeps it (color follows the entity
 * across filters); new keys take the lowest free slot in the validated fixed
 * order, so the first dataset gets the CVD-checked adjacent ordering.
 * Returns Map(key -> slot). Keys beyond 8 are not registered (they are "Other").
 */
export function assignColors(keys) {
  const list = keys.slice(0, SLOT_COUNT).map(String);
  const used = new Set();
  const out = new Map();
  for (const k of list) {
    if (registry.has(k) && !used.has(registry.get(k))) { used.add(registry.get(k)); out.set(k, registry.get(k)); }
  }
  for (const k of list) {
    if (out.has(k)) continue;
    let s = 0;
    while (used.has(s)) s++;
    used.add(s); out.set(k, s); registry.set(k, s);
  }
  return out;
}

/** Forget sticky slot assignments (e.g. when switching company). */
export function resetColors() { registry.clear(); }

/** Categorical color for a key (hex string for the current light/dark mode). Deterministic. */
export function colorFor(key) {
  const dark = isDark();
  if (key == null || key === OTHER_KEY) return dark ? OTHER_DARK : OTHER_LIGHT;
  const k = String(key);
  const slot = registry.has(k) ? registry.get(k) : hash(k) % SLOT_COUNT;
  return (dark ? CAT_DARK : CAT_LIGHT)[slot];
}

/** Categorical slot color by index (0 = slot 1, the default single-series accent). */
export function slotColor(i = 0) { return (isDark() ? CAT_DARK : CAT_LIGHT)[((i % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT]; }

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

const SYMBOLS = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', JPY: '¥', SGD: 'S$', HKD: 'HK$', CHF: 'CHF ', INR: '₹', KRW: '₩', ILS: '₪' };

/** Format in the original currency, e.g. formatCurrency(95000,"GBP") -> "£95K". */
export function formatCurrency(n, currency = 'USD') {
  const c = (currency || 'USD').toUpperCase();
  return formatMoney(n, { symbol: SYMBOLS[c] ?? (c + ' ') });
}

/**
 * Static FX: local currency units per 1 USD, copied verbatim from data/cities.json
 * `fx.perUSD` so the chart, Compstimate and the Juice Score all use one table.
 * Source: The Economist Big Mac index source data v2, `dollar_ex` column
 * (Refinitiv/LSEG rates), release 2026-07-01; data CC BY 4.0.
 * https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/source-data/big-mac-source-data-v2.csv
 * Copied 2026-10-02. Refresh both together (scripts/update-col.js updates cities.json).
 * Labelled "approx USD" in the UI; there is no live FX.
 */
export const FX_AS_OF = '2026-07-01';
export const FX_PER_USD = Object.freeze({
  AED: 3.67285,
  AUD: 1.42867347667691,
  BRL: 5.07935,
  CAD: 1.40515,
  CHF: 0.80735,
  CZK: 21.1625,
  DKK: 6.5366,
  EUR: 0.87439,
  GBP: 0.74187,
  HKD: 7.83895,
  ILS: 2.9993,
  INR: 96.26375,
  JPY: 162.135,
  KRW: 1485.9,
  MXN: 17.386,
  NOK: 9.68565,
  NZD: 1.71335560695622,
  PLN: 3.77915,
  SAR: 3.755,
  SEK: 9.63495,
  SGD: 1.29005,
  TWD: 32.1875,
  USD: 1,
});

/** USD per one unit of each currency (1 / FX_PER_USD), e.g. GBP ≈ 1.348. */
export const FX_TO_USD = Object.freeze(Object.fromEntries(
  Object.entries(FX_PER_USD).map(([c, per]) => [c, c === 'USD' ? 1 : 1 / per])));

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

// ---------- Juice Score scale (see docs/LIVABILITY.md, server/juice.js) ----------
// Stepped ordinal ramp, one hue (watermelon red), breaks at the grade boundaries
// 45 (Dry→Ripe) and 70 (Ripe→Juicy). Validated with validate_palette.js --ordinal:
// light end 2.14:1 on the light surface, 2.22:1 on the dark surface. Dark mode is its
// own steps (brighter = juicier), like the salary ramp.
export const JUICE_BREAKS = Object.freeze([45, 70]);
const JUICE_LIGHT = ['#ee9893', '#d9534f', '#a51f35']; // Dry, Ripe, Juicy
const JUICE_DARK = ['#8a363c', '#c9505a', '#f59a95'];
const JUICE_ANCHORS = Object.freeze({ A: 10000, B: 250000 }); // = server/juice.js SCORE_ANCHORS

/** Grade label for a juice score (and net, so net <= 0 is "Rind"); mirrors server/juice.js gradeFor. */
export function juiceGrade(score, net = 1, breaks = JUICE_BREAKS) {
  if (!(net > 0)) return 'Rind';
  return score >= breaks[1] ? 'Juicy' : score >= breaks[0] ? 'Ripe' : 'Dry';
}

/** Fill color for a juice score: Dry / Ripe / Juicy step (Rind uses the Dry step). */
export function juiceColor(score, breaks = JUICE_BREAKS) {
  const ramp = isDark() ? JUICE_DARK : JUICE_LIGHT;
  return ramp[score >= breaks[1] ? 2 : score >= breaks[0] ? 1 : 0];
}

/**
 * Annual net juice (USD) needed for a score. Fallback mirror of server/juice.js
 * netForScore (A = $10K, B = $250K); map.js prefers the live juice.js module so the
 * legend follows re-tuned anchors automatically.
 */
export function juiceNetForScore(score) {
  const { A, B } = JUICE_ANCHORS;
  const s = Math.max(0, Math.min(100, score));
  return A * Math.expm1((s / 100) * Math.log1p(B / A));
}

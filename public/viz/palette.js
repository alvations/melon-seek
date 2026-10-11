// melon-seek viz palette: categorical identity colors, sequential salary scale,
// money formatting and a static approximate FX table.
//
// Categorical hues: 8 slots plus the neutral OTHER (fix4-viz, V-22 and V-25). Every slot, Other
// included, is a mark of at least 3:1 on its surface (light #ffffff; dark #161a21, and #1b2028 in
// the drawer), and every pair of the nine (not only neighbours: a legend shows them all at once)
// stays apart under deuteranopia, protanopia and tritanopia (Machado 2009 simulation, CIELAB
// delta E >= 12.6 light / 12.7 dark; >= 24.7 with normal vision). Found by a search over OKLCH
// around the old hue order (blue, orange, aqua, yellow, magenta, green, violet, red); the numbers
// and the script are in docs/process/fix4-viz.md. A 9th+ key is never given a generated hue: it
// folds into OTHER.
const CAT_LIGHT = ['#4a7de8', '#a33806', '#17a478', '#ba7f14', '#903081', '#296f16', '#7d44b2', '#e45d58'];
const CAT_DARK  = ['#698dfd', '#ef7926', '#00d097', '#efa30f', '#d765b6', '#47ab4f', '#9654c1', '#c44323'];
const OTHER_LIGHT = '#706f6c';
const OTHER_DARK = '#807f7c';

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
 * Static FX: local currency units per 1 USD, equal to data/cities.json `fx.perUSD` so the
 * chart, Compstimate and the Juice Score all use one table. The source and date are FX_SOURCE
 * and FX_AS_OF (equal to cities.json fx.source.name and fx.asOf). The monthly refresh
 * (scripts/refresh/fx.js: ECB monthly reference rates crossed through USD, TWD from the
 * Federal Reserve G.5, AED/SAR/QAR official pegs) rewrites cities.json, this table and
 * server/juice.js together; test/fx-consistency.test.js keeps the copies equal.
 * Labelled "approx USD" in the UI; there is no live FX.
 */
export const FX_AS_OF = '2026-07-01';
export const FX_SOURCE = 'The Economist Big Mac index source data v2, dollar_ex column (release 2026-07-01)';
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
  RON: 4.58165,
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

/**
 * Each country's currency (ISO codes). A browser copy of server/salary.js COUNTRY_CURRENCY;
 * test/pay-locations.test.js fails if the two drift.
 */
export const COUNTRY_CURRENCY = Object.freeze({
  US: 'USD', CA: 'CAD', GB: 'GBP', UK: 'GBP', CH: 'CHF', JP: 'JPY', KR: 'KRW', IN: 'INR', SG: 'SGD', AU: 'AUD',
  NZ: 'NZD', IL: 'ILS', AE: 'AED', SA: 'SAR', QA: 'QAR', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK', CZ: 'CZK',
  HK: 'HKD', TW: 'TWD', CN: 'CNY', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', RO: 'RON',
  ...Object.fromEntries('IE DE FR NL ES IT BE AT FI PT LU GR EE LV LT SK SI HR MT CY BG'.split(' ').map((c) => [c, 'EUR'])),
});

// ---------- pay scale for the map (one hue: rind green, stepped, fixed dollars) ----------

// V-16 (fix4-viz): one colour means one pay level everywhere. The map's Pay pins were coloured
// relative to the pins on screen (a lone $473K pin and a lone $75K pin were the same green); now
// a pin takes the step of its median on these fixed approx-USD breaks, and the map shows them in a
// Pay legend. V-22: every step is >= 3:1 on the map background (light #f8fafc: 3.33 to 13.6;
// dark #121820: 3.06 to 13.4) and its price text (inkOn) >= 5.5:1. Light runs light -> dark,
// dark runs dark -> light (more pay = more contrast with the map in both).
export const PAY_BREAKS = Object.freeze([100000, 150000, 200000, 300000]);
const PAY_LIGHT = ['#209c69', '#00784d', '#005c3a', '#00462a', '#00321d'];
const PAY_DARK  = ['#05744b', '#209c69', '#4abc87', '#69d9a2', '#86f5bd'];

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }

/** The pay step (0 .. PAY_BREAKS.length) of a yearly approx-USD amount. */
export function payStep(usd) {
  let i = 0;
  while (i < PAY_BREAKS.length && usd >= PAY_BREAKS[i]) i++;
  return i;
}
/** The fixed-scale fill for a yearly approx-USD pay (V-16). */
export function payColor(usd) { return (isDark() ? PAY_DARK : PAY_LIGHT)[payStep(+usd || 0)]; }
/** The steps for a legend: [{ color, lo, hi }] (lo/hi in USD, null at the open ends). */
export function paySteps() {
  const ramp = isDark() ? PAY_DARK : PAY_LIGHT;
  return ramp.map((color, i) => ({ color, lo: i ? PAY_BREAKS[i - 1] : null, hi: i < PAY_BREAKS.length ? PAY_BREAKS[i] : null }));
}
/** Sequential pay colour for t in [0,1] (kept for callers that scale by rank): the nearest step. */
export function salaryColor(t) {
  const ramp = isDark() ? PAY_DARK : PAY_LIGHT;
  return ramp[Math.round(Math.max(0, Math.min(1, +t || 0)) * (ramp.length - 1))];
}

const relLum = (hex) => { const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast of two hex colours. */
export function contrast(a, b) { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/**
 * V-23: `hex` moved toward white (on a dark background) or black (on a light one) just far enough
 * to be a mark of `min`:1 on `bg`; unchanged when it already is. For colours the viz does not pick
 * (companies.json brand colours: Anduril #1f2a37 on the dark drawer was 1.09:1).
 */
export function readableOn(hex, bg, min = 3) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '') || !/^#[0-9a-f]{6}$/i.test(bg || '')) return hex;
  if (contrast(hex, bg) >= min) return hex;
  const toward = relLum(bg) < 0.18 ? [255, 255, 255] : [0, 0, 0];
  const c = hexToRgb(hex);
  for (let f = 0.05; f <= 1.0001; f += 0.05) {
    const out = rgbToHex(c.map((v, k) => v + (toward[k] - v) * f));
    if (contrast(out, bg) >= min) return out;
  }
  return rgbToHex(toward);
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
// Fallback copy of server/juice.js SCORE_ANCHORS (exponential curve, re-tuned
// 2026-10-02): score = 100 * (1 - e^(-net / K)). map.js prefers the live module.
const JUICE_ANCHORS = Object.freeze({ K: 80000, fullGlassUSD: 423866 });

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
  const s = Number(score);
  if (!(s > 0)) return 0;
  if (s >= 99.5) return JUICE_ANCHORS.fullGlassUSD;
  return -JUICE_ANCHORS.K * Math.log1p(-s / 100);
}

// Salary text parsing.
//
// parseSalary(text) scans free text for money amounts / ranges and returns the
// most plausible pay range as { min, max, currency, interval, text } in the
// ORIGINAL interval (e.g. 60/80 "hour"), or null. Candidates whose annualized
// value falls outside [10,000, 5,000,000] are rejected.
// toJobSalary(s) annualizes a salary into the Job shape (adds mid).

export const MIN_ANNUAL = 10000;
export const MAX_ANNUAL = 5000000;

const FACTORS = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

export function annualize(value, interval = 'year') {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const f = FACTORS[normalizeInterval(interval)] ?? 1;
  return Math.round(Number(value) * f);
}

export function normalizeInterval(interval) {
  const s = String(interval || 'year').toLowerCase();
  if (/hour|hr/.test(s)) return 'hour';
  if (/day|daily/.test(s)) return 'day';
  if (/week/.test(s)) return 'week';
  if (/month/.test(s)) return 'month';
  return 'year';
}

const CUR_PRE = String.raw`(?:CA\$|C\$|CAD\s?\$?|US\$|USD\s?\$?|AU\$|A\$|AUD\s?\$?|GBP\s?£?|EUR\s?€?|\$|£|€)`;
const NUM = String.raw`\d{1,3}(?:[,.  ]\d{3})+(?:[.,]\d{1,2}(?!\d))?|\d+(?:[.,]\d{1,2}(?!\d))?`;
const MULT = String.raw`(?:\s?(?:thousand|million|billion|mil)\b|(?:k|mm|m|bn|b)(?![a-z]))`;
const CUR_SUF = String.raw`(?:\s?(?:USD|CAD|GBP|EUR|AUD|€|£)(?![a-z]))`;
const AMOUNT_RE = new RegExp(String.raw`(?<![A-Za-z0-9])(${CUR_PRE})?\s?(${NUM})(${MULT})?(${CUR_SUF})?`, 'gi');
const SEP_RE = /^\s*(?:[-–—‒―~]|to|and|through|until)\s*$/i;

const POSITIVE_RE = /\b(salary|salaries|compensation|pay|paid|base|wages?|rate|range|ote|earnings|remuneration|annual|hourly)\b/i;
const NEGATIVE_BEFORE_RE = /\b(raised|raising|funding|funded|series [a-f]|valuation|valued|revenue|backed|invest\w*|bonus|equity|stock|relocation|reimburse\w*|stipend|allowance|budget|grants?|arr|customers|users|401)\b/i;
const NEGATIVE_AFTER_RE = /^\W{0,3}(?:in\s+)?(raised|funding|in funding|series|valuation|revenue|arr|customers|users|budget|stipend|bonus|signing)\b/i;

function parseNumber(raw) {
  const s = raw.replace(/[  ]/g, ',');
  let m = s.match(/^(\d{1,3}(?:[,.]\d{3})+)(?:[.,](\d{1,2}))?$/);
  if (m) return Number(m[1].replace(/[,.]/g, '') + (m[2] ? `.${m[2]}` : ''));
  m = s.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  return m ? Number(m[1] + (m[2] ? `.${m[2]}` : '')) : NaN;
}

function multFactor(mult) {
  if (!mult) return 1;
  const s = mult.trim().toLowerCase();
  if (s === 'k' || s === 'thousand') return 1e3;
  if (s === 'b' || s === 'bn' || s === 'billion') return 1e9;
  return 1e6; // m, mm, mil, million
}

function currencyOf(token) {
  if (!token) return null;
  const t = token.trim().toUpperCase();
  if (/^(CA\$|C\$|CAD)/.test(t)) return 'CAD';
  if (/^(AU\$|A\$|AUD)/.test(t)) return 'AUD';
  if (/^(GBP|£)/.test(t)) return 'GBP';
  if (/^(EUR|€)/.test(t)) return 'EUR';
  if (/^(US\$|USD)/.test(t)) return 'USD';
  if (t === '$') return 'USD';
  return null;
}

function findAmounts(text) {
  const out = [];
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(text))) {
    const [full, pre, num, mult, suf] = m;
    if (!num) { AMOUNT_RE.lastIndex = m.index + 1; continue; }
    const base = parseNumber(num);
    if (!Number.isFinite(base)) continue;
    // Trim leading whitespace captured by \s? when no prefix.
    const lead = full.length - full.trimStart().length;
    const start = m.index + lead;
    // Suffix currency wins over plain "$" (e.g. "$150,000 CAD").
    const sufCur = currencyOf(suf);
    const preCur = currencyOf(pre);
    const currency = sufCur && (!preCur || pre.trim() === '$') ? sufCur : preCur;
    out.push({
      start, end: m.index + full.length, base, mult: mult || null,
      value: base * multFactor(mult), currency, hasCurrency: !!(pre || suf),
      weakCurrency: !suf && !!pre && pre.trim() === '$',
    });
  }
  return out;
}

const INTERVAL_PATTERNS = [
  ['hour', /(?:\/\s?(?:hour|hr|h)\b|\bper\s+hour\b|\ban\s+hour\b|\bhourly\b|\bp\/h\b)/i],
  ['day', /(?:\/\s?day\b|\bper\s+day\b|\ba\s+day\b|\bdaily\b)/i],
  ['week', /(?:\/\s?(?:week|wk)\b|\bper\s+week\b|\ba\s+week\b|\bweekly\b)/i],
  ['month', /(?:\/\s?(?:month|mo)\b|\bper\s+month\b|\ba\s+month\b|\bmonthly\b|\bpcm\b)/i],
  ['year', /(?:\/\s?(?:year|yr|annum)\b|\bper\s+(?:year|annum)\b|\ba\s+year\b|\bannual(?:ly)?\b|\byearly\b|\bp\.?a\.?(?![a-z])|\bOTE\b)/i],
];

function firstInterval(s, fromEnd = false) {
  let best = null;
  for (const [iv, re] of INTERVAL_PATTERNS) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(s))) {
      if (!best || (fromEnd ? m.index > best.idx : m.index < best.idx)) best = { iv, idx: m.index };
      if (!fromEnd) break;
    }
  }
  return best ? best.iv : null;
}

function buildCandidates(text, amounts) {
  const cands = [];
  const used = new Set();
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    const b = amounts[i + 1];
    if (b && SEP_RE.test(text.slice(a.end, b.start))) {
      cands.push({ a, b, range: true });
      used.add(i); used.add(i + 1);
      i++; // consume pair
      continue;
    }
    if (!used.has(i)) cands.push({ a, b: null, range: false });
  }
  return cands;
}

function evaluate(text, c) {
  let { a, b } = c;
  let lo = a.value;
  let hi = b ? b.value : a.value;
  // "$310–385K": inherit multiplier from the other side.
  if (b && !a.mult && b.mult && a.base < 1000) lo = a.base * multFactor(b.mult);
  if (b && a.mult && !b.mult && b.base < 1000) hi = b.base * multFactor(a.mult);
  const hasCurrency = a.hasCurrency || (b && b.hasCurrency);
  const currency = (a.weakCurrency && b && b.currency) ? b.currency : (a.currency || (b && b.currency) || null);
  const start = a.start;
  const end = (b || a).end;

  const before = text.slice(Math.max(0, start - 100), start);
  const after = text.slice(end, end + 40);

  let score = 0;
  if (c.range) score += 3;
  if (hasCurrency) score += 2;
  if (POSITIVE_RE.test(before)) score += 3;
  if (POSITIVE_RE.test(before.slice(-35))) score += 1;
  if (NEGATIVE_BEFORE_RE.test(before.slice(-60))) score -= 6;
  if (NEGATIVE_AFTER_RE.test(after)) score -= 6;
  if (a.mult || (b && b.mult)) score += 0.5;

  // Need either a currency marker or salary wording to consider bare numbers.
  if (!hasCurrency && !POSITIVE_RE.test(before)) return null;
  if (!c.range && !hasCurrency) return null;

  let interval = firstInterval(after.slice(0, 35)) || firstInterval(before.slice(-60), true);
  if (interval) score += 1;
  const maxv = Math.max(lo, hi);
  if (!interval) {
    if (maxv < 1000) interval = 'hour';
    else if (maxv < MIN_ANNUAL && c.range) interval = 'month';
    else interval = 'year';
  }
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo > 0 && hi / lo > 5) score -= 2;

  const annLo = annualize(lo, interval);
  const annHi = annualize(hi, interval);
  if (!(annLo >= MIN_ANNUAL && annHi <= MAX_ANNUAL)) return null;
  if (score < 2) return null;

  return {
    score, start,
    salary: {
      min: round2(lo), max: round2(hi), currency: currency || 'USD', interval,
      text: text.slice(start, end).replace(/\s+/g, ' ').trim(),
    },
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

export function parseSalary(text) {
  if (text == null) return null;
  const s = String(text).replace(/&nbsp;| /g, ' ');
  if (!/\d/.test(s)) return null;
  const amounts = findAmounts(s);
  if (!amounts.length) return null;
  let best = null;
  for (const c of buildCandidates(s, amounts)) {
    const r = evaluate(s, c);
    if (r && (!best || r.score > best.score)) best = r;
  }
  return best ? best.salary : null;
}

/** Convert a raw/structured salary into the Job salary shape (annualized, with mid). */
export function toJobSalary(sal) {
  if (!sal) return null;
  const interval = normalizeInterval(sal.interval);
  let min = sal.min != null ? Number(sal.min) : null;
  let max = sal.max != null ? Number(sal.max) : null;
  if (!Number.isFinite(min)) min = null;
  if (!Number.isFinite(max)) max = null;
  if (min == null && max == null) return null;
  if (min == null) min = max;
  if (max == null) max = min;
  if (min > max) [min, max] = [max, min];
  const aMin = annualize(min, interval);
  const aMax = annualize(max, interval);
  if (!(aMin >= MIN_ANNUAL && aMax <= MAX_ANNUAL)) return null;
  const out = {
    min: aMin, max: aMax, mid: Math.round((aMin + aMax) / 2),
    currency: (sal.currency || 'USD').toUpperCase(), interval: 'year',
    text: sal.text || null,
  };
  if (interval !== 'year') out.originalInterval = interval;
  return out;
}

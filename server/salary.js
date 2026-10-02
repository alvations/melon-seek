// Salary text parsing and Job salary shaping (browser-safe; bundled to dist/lib/).
//
// parseSalary(text, { countries }) finds the pay statement in free text and
// returns { min, max, currency, interval, text, kind } in the ORIGINAL interval
// (e.g. 60/80 "hour", 3850 "week"), or null. Rules (docs/VETTING.md):
//   - Pay must come from pay context: a pay keyword in the same sentence or
//     clause (or in the short heading line right above it, e.g. "Annual
//     Salary:"), a line that is nothing but the amount, or an hourly unit
//     attached to the amount. A bare "$4.6M" in prose is never pay, and
//     million/billion amounts are never pay.
//   - Benefits are not pay: "$500 home office stipend", "learning stipend",
//     "$75 lunch stipend", bonuses, relocation, funding, deal sizes, budgets.
//   - Intervals come from the amount itself ("/hr", "per week"), the text right
//     after it, or the same clause before it ("Weekly stipend of ...") — never
//     from a previous sentence ("5 days/week").
//   - Several currencies for one amount ("3,850 USD / 2,310 GBP / 4,300 CAD"):
//     the one matching the job's location countries, else USD.
//   - Tiered lists ("Level 1: $25 - $33/hour Level 2: $28 - $38/hour") are
//     spanned (overall min/max) when the span is at most 3x.
//   - A stated interval that makes the amount implausible while the numbers
//     are plausible as annual ("US Hourly Range $68,000 — $90,000") is read as
//     annual and marked intervalCorrected.
// toJobSalary(s, { source }) annualizes into the Job shape (adds mid, kind,
// source). annualize(value, interval). Bounds are compared in rough USD
// (USD_PER), so a ¥20M salary is not mistaken for $20M.

export const MIN_ANNUAL = 10000;            // annualized floor for any salary
export const MAX_ANNUAL = 1_200_000;        // text candidates above this are not pay (= vet.js bound)
export const HARD_MAX_ANNUAL = 5_000_000;   // toJobSalary refuses above this; between the two the vetting gate quarantines
const PLAUSIBLE_ANNUAL_MIN = 15000;
const TIER_GAP = 100;                       // max chars between tiers of one list
const TIER_MAX_RATIO = 3;

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

/* ------------------------------------------------------------ currencies */

// Rough USD per unit, for plausibility bounds and cross-currency comparison
// only (never shown to users); it only has to be right to within ~20%.
export const USD_PER = Object.freeze({
  USD: 1, CAD: 0.73, GBP: 1.27, EUR: 1.08, AUD: 0.66, NZD: 0.6, CHF: 1.12, JPY: 0.0068,
  KRW: 0.00073, INR: 0.012, SGD: 0.74, ILS: 0.27, AED: 0.27, SAR: 0.27, QAR: 0.27,
  PLN: 0.25, SEK: 0.095, NOK: 0.094, DKK: 0.145, CZK: 0.043, HKD: 0.128, TWD: 0.031,
  CNY: 0.14, BRL: 0.18, MXN: 0.055, ZAR: 0.055,
});

/** amount in `currency` -> rough USD (null for an unknown currency). */
export function toUSD(amount, currency) {
  const r = USD_PER[String(currency || 'USD').toUpperCase()];
  return r && Number.isFinite(amount) ? amount * r : null;
}
const usdOr = (n, cur) => toUSD(n, cur) ?? n;

export const COUNTRY_CURRENCY = Object.freeze({
  US: 'USD', CA: 'CAD', GB: 'GBP', UK: 'GBP', CH: 'CHF', JP: 'JPY', KR: 'KRW', IN: 'INR', SG: 'SGD', AU: 'AUD',
  NZ: 'NZD', IL: 'ILS', AE: 'AED', SA: 'SAR', QA: 'QAR', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK', CZ: 'CZK',
  HK: 'HKD', TW: 'TWD', CN: 'CNY', BR: 'BRL', MX: 'MXN', ZA: 'ZAR',
  ...Object.fromEntries('IE DE FR NL ES IT BE AT FI PT LU GR EE LV LT SK SI HR MT CY'.split(' ').map((c) => [c, 'EUR'])),
});

/** Currencies of the given ISO country codes, in order, deduped. */
export function currenciesFor(countries) {
  const out = [];
  for (const c of countries || []) {
    const cur = COUNTRY_CURRENCY[String(c || '').toUpperCase()];
    if (cur && !out.includes(cur)) out.push(cur);
  }
  return out;
}

/**
 * Pick among currencies offered for one amount: USD when the job has a US
 * location, else the first location's currency, else USD, else the first.
 */
export function pickCurrency(offered, countries) {
  const want = currenciesFor(countries);
  const hits = want.filter((c) => offered.includes(c));
  if (hits.includes('USD')) return 'USD';
  if (hits.length) return hits[0];
  if (offered.includes('USD')) return 'USD';
  return offered[0];
}

const CODES = 'USD|CAD|GBP|EUR|AUD|NZD|CHF|JPY|KRW|INR|SGD|ILS|AED|SAR|QAR|PLN|SEK|NOK|DKK|CZK|HKD|TWD|CNY|BRL|MXN|ZAR';
const SYMS = String.raw`US\$|CA\$|C\$|AU\$|A\$|SG\$|S\$|NZ\$|HK\$|R\$|\$|£|€|¥|₩|₹|₪`;
const SYM_CUR = { 'US$': 'USD', 'CA$': 'CAD', C$: 'CAD', 'AU$': 'AUD', A$: 'AUD', 'SG$': 'SGD', S$: 'SGD', 'NZ$': 'NZD', 'HK$': 'HKD', R$: 'BRL', $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₩': 'KRW', '₹': 'INR', '₪': 'ILS' };

function currencyOf(token) {
  if (!token) return null;
  const t = token.replace(/\s+/g, '').toUpperCase();
  const code = t.match(new RegExp(`^(${CODES})`));
  if (code) return code[1];
  return SYM_CUR[t] || SYM_CUR[token.trim()] || null;
}

/* ---------------------------------------------------------------- tokens */

const PRE = String.raw`(?:(?:${CODES})\s?(?:${SYMS})?|(?:${SYMS}))`;
const NUM = String.raw`\d{1,3}(?:[,.  ]\d{3})+(?:[.,]\d{1,2}(?!\d))?|\d+(?:[.,]\d{1,2}(?!\d))?`;
const MULT = String.raw`(?:\s?(?:thousand|million|billion|mil)\b|(?:k|K|mm|MM|m|M|bn|B)(?![A-Za-z]))`;
const SUF = String.raw`(?:\s?(?:${CODES}|€|£)(?![A-Za-z]))`;
const UNIT = String.raw`(?:\s?\/\s?(?:hr|hour|h|yr|year|annum|mo|month|wk|week|day)\b\.?|\s?per[\s-]+(?:hour|year|annum|month|week|day)\b|\s(?:an?\s+(?:hour|year)|hourly|annually|yearly|monthly|weekly)\b)`;
const TOKEN_RE = new RegExp(String.raw`(?<![A-Za-z0-9.,])(${PRE})?\s?(${NUM})(${MULT})?(${SUF})?(${UNIT})?(${SUF})?`, 'g');
const RANGE_SEP_RE = /^\s*(?:[-–—‒―~]|to|and|through|until)\s*$/i;
const ALT_SEP_RE = /^\s*(?:\/|or|\||,)\s*$/i;

function parseNumber(raw) {
  const s = raw.replace(/[  ]/g, ',');
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

function unitInterval(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (/hour|hr|\/\s?h\b/.test(u)) return 'hour';
  if (/week|wk/.test(u)) return 'week';
  if (/month|\/\s?mo\b/.test(u)) return 'month';
  if (/day/.test(u)) return 'day';
  return 'year';
}

function findTokens(text) {
  const out = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) {
    const [full, pre, num, mult, suf, unit, suf2] = m;
    if (!num) { TOKEN_RE.lastIndex = m.index + 1; continue; }
    const base = parseNumber(num);
    if (!Number.isFinite(base)) continue;
    const lead = full.length - full.trimStart().length;
    // A "k" on a full number ("250,000k") is redundant.
    const multEff = mult && !(base >= 1000 && /^\s?k$/i.test(mult)) ? mult : null;
    const sufCur = currencyOf(suf) || currencyOf(suf2);
    const preCur = currencyOf(pre);
    const weak = !!pre && pre.trim() === '$';
    // Suffix code wins over a bare "$" ("$150,000 CAD", "$8,500 SGD/month").
    const currency = sufCur && (!preCur || weak) ? sufCur : preCur;
    out.push({
      start: m.index + lead, end: m.index + full.length, base, mult: multEff,
      mag: !!multEff && multFactor(multEff) >= 1e6,
      value: base * multFactor(multEff), currency, explicit: !!(pre || suf || suf2), weak: weak && !sufCur,
      unit: unitInterval(unit),
    });
  }
  return out;
}

/* --------------------------------------------------------------- context */

function isBoundary(text, i) {
  const ch = text[i];
  if (ch === '\n' || ch === '•' || ch === ';') return true;
  return (ch === '.' || ch === '!' || ch === '?') && (i + 1 >= text.length || /\s/.test(text[i + 1]));
}

/** { start, end, heading } of the sentence/clause around [s, e). */
function clauseSpan(text, s, e) {
  let a = s;
  while (a > 0 && !isBoundary(text, a - 1)) a--;
  let b = e;
  while (b < text.length && !isBoundary(text, b)) b++;
  let heading = '';
  if (a > 0 && text[a - 1] === '\n') {
    let pe = a - 1;
    while (pe > 0 && /\s/.test(text[pe - 1])) pe--;
    let p = pe;
    while (p > 0 && text[p - 1] !== '\n') p--;
    const prev = text.slice(p, pe).trim();
    if (prev && prev.length <= 80) heading = prev;
  }
  return { start: a, end: b, heading };
}

const PAY_RE = /\b(salary|salaries|compensation|pay|paid|wages?|ote|on[- ]target earnings|remuneration|stipends?|(?:hourly|contract|day|daily|pay|base) rate|rate of pay|hourly (?:range|wage|pay)|brutto|gross)\b/i;
// "$500 home office stipend", "learning & development stipend": benefits, not pay.
const BENEFIT_STIPEND_RE = /\b(?:lunch|meals?|food|snacks?|home[- ]office|office|workspace|learning(?:\s*(?:&|and)\s*development)?|development|education(?:al)?|tuition|wellness|well-?being|fitness|gym|commuter|commuting|transit|transportation|phone|mobile|cell|internet|wi-?fi|co-?working|relocation|equipment|books?|conference|travel|childcare|remote(?:[- ]work)?|wfh|tech(?:nology)?|health|lifestyle|productivity|setup)\s+(?:stipends?|allowances?|budgets?)\b/gi;
const NEG_BEFORE_RE = /\b(raised|raising|funding|funded|series [a-f]|valuation|valued|revenue|arr|backed|invest\w*|budgets?|spend(?:ing)?|closing|closed|deals?|quotas?|bonus(?:es)?|signing|sign-on|relocation|reimburs\w*|allowances?|grants?|credits?|compute|expenses?|savings?|saved|worth|exploits?|prizes?|awards?|donat\w*|customers?|users|loans?|pric(?:e|es|ed|ing)|costs?|fees?|tuition|401)\b[^$£€¥\d]{0,40}$/i;
const NEG_AFTER_RE = /^\W{0,3}(?:in\s+|of\s+)?(?:[\w-]+\s+){0,3}?(deals?|funding|raised|revenue|arr|valuation|budgets?|spend|quotas?|exploits?|customers|users|grants?|credits?|allowances?|bonus(?:es)?|signing|sign-on|savings|prizes?|stipends?|reimbursements?|contracts? (?:value|won)|in (?:annual )?spend)\b/i;
const PAY_STIPEND_AFTER_RE = /^\W{0,3}(?:(?:weekly|monthly|bi-?weekly|living|base|research)\s+)stipend\b/i;
const FILLER_RE = new RegExp(String.raw`\b(?:${CODES}|per|an?|hour|hours|year|annum|month|week|day|hourly|annually|yearly|monthly|weekly|base|gross|brutto|net|ote|range|up|to|from|between|starting|at|approx|approximately|about|plus|offers|equity|multiple|ranges|and|usd)\b|[^A-Za-z]+`, 'gi');

const INTERVAL_PATTERNS = [
  ['hour', /(?:\/\s?(?:hour|hr|h)\b|\bper\s+hour\b|\ban\s+hour\b|\bhourly\b|\bp\/h\b)/i],
  ['day', /(?:\/\s?day\b|\bper\s+day\b|\ba\s+day\b|\bdaily\b)/i],
  ['week', /(?:\/\s?(?:week|wk)\b|\bper\s+week\b|\ba\s+week\b|\bweekly\b)/i],
  ['month', /(?:\/\s?(?:month|mo)\b|\bper\s+month\b|\ba\s+month\b|\bmonthly\b|\bpcm\b)/i],
  ['year', /(?:\/\s?(?:year|yr|annum)\b|\bper\s+(?:year|annum)\b|\ba\s+year\b|\bannual(?:ly)?\b|\byearly\b|\bp\.?a\.?(?![a-z])|\bOTE\b)/i],
];

/** Interval word nearest the end (fromEnd) or start of s. */
function intervalIn(s, fromEnd) {
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

/* ------------------------------------------------------------ candidates */

/** Ranges and singles, then multi-currency alternative groups collapsed to one member. */
function buildUnits(text, toks, countries) {
  const units = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i];
    const b = toks[i + 1];
    if (b && RANGE_SEP_RE.test(text.slice(a.end, b.start)) && (a.currency || b.currency) && !(a.currency && b.currency && a.currency !== b.currency && !a.weak && !b.weak)) {
      units.push({ a, b, start: a.start, end: b.end });
      i++;
    } else units.push({ a, b: null, start: a.start, end: a.end });
  }
  for (const u of units) {
    const { a, b } = u;
    u.currency = (a.weak && b && b.currency) ? b.currency : (a.currency || (b && b.currency) || null);
    u.explicit = a.explicit || !!(b && b.explicit);
  }
  // "3,850 USD / 2,310 GBP / 4,300 CAD": keep the location's currency.
  const out = [];
  for (let i = 0; i < units.length; i++) {
    const group = [units[i]];
    while (i + 1 < units.length && ALT_SEP_RE.test(text.slice(units[i].end, units[i + 1].start))
      && units[i + 1].currency && !group.some((g) => g.currency === units[i + 1].currency)) {
      group.push(units[++i]);
    }
    if (group.length === 1 || group.some((g) => !g.currency)) { out.push(...group); continue; }
    const cur = pickCurrency(group.map((g) => g.currency), countries);
    const pick = group.find((g) => g.currency === cur) || group[0];
    pick.groupStart = group[0].start;
    pick.groupEnd = group[group.length - 1].end;
    pick.groupUnit = group[group.length - 1].b ? group[group.length - 1].b.unit : group[group.length - 1].a.unit;
    pick.alternatives = group.map((g) => g.currency);
    out.push(pick);
  }
  return out;
}

function evaluate(text, u, countries) {
  const { a, b } = u;
  if (a.mag || (b && b.mag)) return null; // million/billion amounts are never pay
  let lo = a.value;
  let hi = b ? b.value : a.value;
  // "$310–385K": inherit the multiplier from the other side.
  if (b && !a.mult && b.mult && a.base < 1000) lo = a.base * multFactor(b.mult);
  if (b && a.mult && !b.mult && b.base < 1000) hi = b.base * multFactor(a.mult);
  if (!u.currency) return null;
  if (!b && !u.explicit) return null;

  const gs = u.groupStart ?? u.start;
  const ge = u.groupEnd ?? u.end;
  const cl = clauseSpan(text, gs, ge);
  const before = text.slice(cl.start, gs);
  const after = text.slice(ge, Math.min(text.length, ge + 60));
  const clause = text.slice(cl.start, cl.end);
  const kwClause = clause.replace(BENEFIT_STIPEND_RE, ' ');
  const kwHeading = cl.heading.replace(BENEFIT_STIPEND_RE, ' ');
  const kwInClause = PAY_RE.test(kwClause);
  const kwInHeading = PAY_RE.test(kwHeading);
  const unitIv = (b && b.unit) || a.unit || u.groupUnit || null;
  const standalone = !kwInClause && clause.length <= 90
    && (clause.slice(0, gs - cl.start) + clause.slice(ge - cl.start)).replace(FILLER_RE, '').length <= 3;

  // Benefits, funding, deals, bonuses ... right around the amount.
  if (NEG_BEFORE_RE.test(before.slice(-60))) return null;
  const payStipendAfter = PAY_STIPEND_AFTER_RE.test(after);
  if (!payStipendAfter && NEG_AFTER_RE.test(after)) return null;
  if (!(kwInClause || kwInHeading || standalone || unitIv === 'hour' || payStipendAfter)) return null;

  // Interval: on the amount, right after it (same line), else earlier in the same clause/heading.
  const afterLine = after.split('\n')[0];
  let interval = unitIv || intervalIn(afterLine.slice(0, 30), false) || intervalIn(before, true) || intervalIn(cl.heading, true);
  const stated = !!interval;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (!interval) {
    if (hi < 1000) interval = 'hour';
    else if (hi < MIN_ANNUAL && b) interval = 'month';
    else interval = 'year';
  }
  let intervalCorrected = false;
  let statedInterval = null;
  const cur = u.currency;
  if (interval !== 'year' && usdOr(hi * FACTORS[interval], cur) > MAX_ANNUAL && usdOr(lo, cur) >= PLAUSIBLE_ANNUAL_MIN && usdOr(hi, cur) <= MAX_ANNUAL) {
    statedInterval = interval;
    interval = 'year';
    intervalCorrected = true;
  }
  const annLo = usdOr(lo * FACTORS[interval], cur);
  const annHi = usdOr(hi * FACTORS[interval], cur);
  if (!(annLo >= MIN_ANNUAL && annHi <= MAX_ANNUAL)) return null;

  const stipend = /\bstipend/i.test(kwClause) || /\bstipend/i.test(kwHeading) || payStipendAfter;
  const kind = stipend ? 'stipend' : interval === 'hour' ? 'hourly' : 'salary';
  let score = 0;
  if (b) score += 3;
  if (u.explicit) score += 2;
  if (kwInClause) score += 4;
  else if (kwInHeading) score += 3;
  else if (standalone) score += 2;
  if (stated) score += 1;
  const want = currenciesFor(countries);
  if (want.includes(u.currency)) score += 2;
  if (lo > 0 && hi / lo > 3) score -= 2;
  return {
    score, start: u.start, end: u.end, lo, hi, currency: u.currency, interval, kind,
    ...(intervalCorrected ? { intervalCorrected, statedInterval } : {}),
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
const flat = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Parse the pay statement from text. `countries`: ISO codes of the job's
 * locations (currency choice). Returns { min, max, currency, interval, text,
 * kind[, intervalCorrected, statedInterval] } or null.
 */
export function parseSalary(text, { countries = [] } = {}) {
  if (text == null) return null;
  const s = String(text).replace(/&nbsp;| /g, ' ');
  if (!/\d/.test(s)) return null;
  const toks = findTokens(s);
  if (!toks.length) return null;
  const cands = [];
  for (const u of buildUnits(s, toks, countries)) {
    const r = evaluate(s, u, countries);
    if (r) cands.push(r);
  }
  if (!cands.length) return null;
  let best = cands[0];
  for (const c of cands) if (c.score > best.score) best = c;

  // Tiered list around the best candidate: same currency/interval/kind, adjacent.
  const same = (c) => c.currency === best.currency && c.interval === best.interval && c.kind === best.kind;
  let i0 = cands.indexOf(best);
  let i1 = i0;
  while (i0 > 0 && same(cands[i0 - 1]) && best.start - cands[i0 - 1].end <= TIER_GAP && cands[i0].start - cands[i0 - 1].end <= TIER_GAP) i0--;
  while (i1 + 1 < cands.length && same(cands[i1 + 1]) && cands[i1 + 1].start - cands[i1].end <= TIER_GAP) i1++;
  let lo = best.lo;
  let hi = best.hi;
  let start = best.start;
  let end = best.end;
  if (i1 > i0) {
    const tier = cands.slice(i0, i1 + 1);
    const tlo = Math.min(...tier.map((c) => c.lo));
    const thi = Math.max(...tier.map((c) => c.hi));
    if (tlo > 0 && thi / tlo <= TIER_MAX_RATIO) { lo = tlo; hi = thi; start = tier[0].start; end = tier[tier.length - 1].end; }
  }
  let t = flat(s.slice(start, end));
  if (t.length > 160) t = `${t.slice(0, 157)}...`;
  const out = { min: round2(lo), max: round2(hi), currency: best.currency, interval: best.interval, text: t, kind: best.kind };
  if (best.intervalCorrected) Object.assign(out, { intervalCorrected: true, statedInterval: best.statedInterval });
  return out;
}

/**
 * Convert a raw/structured or parsed salary into the Job salary shape:
 * { min, max, mid (annualized), currency, interval: "year", text, kind,
 *   source?, originalInterval?, intervalCorrected?, statedInterval?, ranges? }.
 * A stated interval that makes the pay implausible while the raw numbers are a
 * plausible annual salary (Lever "88,000–130,000 USD per-month-salary") is
 * read as annual and marked intervalCorrected. Returns null when annualized
 * pay is below MIN_ANNUAL or above HARD_MAX_ANNUAL; amounts between
 * MAX_ANNUAL and HARD_MAX_ANNUAL are returned for server/vet.js to quarantine.
 */
export function toJobSalary(sal, { source } = {}) {
  if (!sal) return null;
  let interval = normalizeInterval(sal.interval);
  let min = sal.min != null ? Number(sal.min) : null;
  let max = sal.max != null ? Number(sal.max) : null;
  if (!Number.isFinite(min)) min = null;
  if (!Number.isFinite(max)) max = null;
  if (min == null && max == null) return null;
  if (min == null) min = max;
  if (max == null) max = min;
  if (min > max) [min, max] = [max, min];
  let intervalCorrected = !!sal.intervalCorrected;
  let statedInterval = sal.statedInterval || null;
  const cur = (sal.currency || 'USD').toUpperCase();
  if (interval !== 'year' && usdOr(annualize(max, interval), cur) > MAX_ANNUAL && usdOr(min, cur) >= PLAUSIBLE_ANNUAL_MIN && usdOr(max, cur) <= MAX_ANNUAL) {
    statedInterval = interval;
    interval = 'year';
    intervalCorrected = true;
  }
  const aMin = annualize(min, interval);
  const aMax = annualize(max, interval);
  if (!(usdOr(aMin, cur) >= MIN_ANNUAL && usdOr(aMax, cur) <= HARD_MAX_ANNUAL)) return null;
  const kind = sal.kind || (interval === 'hour' ? 'hourly' : 'salary');
  const out = {
    min: aMin, max: aMax, mid: Math.round((aMin + aMax) / 2),
    currency: cur, interval: 'year',
    text: sal.text || null, kind,
  };
  const src = source || sal.source;
  if (src) out.source = src;
  if (interval !== 'year') out.originalInterval = interval;
  if (intervalCorrected) { out.intervalCorrected = true; out.statedInterval = statedInterval; }
  if (Array.isArray(sal.ranges) && sal.ranges.length > 1) out.ranges = sal.ranges;
  return out;
}

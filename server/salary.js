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
//
// Pay basis and term (persona review 2026-10-10, docs/VETTING.md §2):
//   - kind 'ote': the posting says the range is on-target earnings (base plus
//     commission at target), in the clause that holds the range ("OTE: $X–$Y",
//     "$X–$Y OTE") or in a sentence about the range ("The figure above represents
//     On-Target Earnings (OTE)"). A "For sales roles, the range provided is the
//     role's OTE range" sentence counts only for a sales title (`salesRole`).
//   - interval 'term': the amount covers a whole programme ("$100,000–$167,000 USD
//     for the four-month fellowship"); it is annualized over the term.
//   - programTerm(text): the stated length of an internship or fellowship, which
//     payTerms() stores as salary.termWeeks.
// No imports: this module is in the static site's startup graph and must not pull
// in keywords.js (test/perf-mobile.test.js); keywords.js imports from here instead.

// Conditional boilerplate: "For sales roles, the range ... OTE ... commissions".
// Also read by keywords.js (comp extras) for the same sentence.
export const SALES_CONDITIONAL_RE = /\b(?:for|in|on)\s+(?:sales|commissioned|quota[- ]carrying|commission[- ]eligible)\s+roles\b/i;

export const MIN_ANNUAL = 10000;            // annualized floor for any salary
export const MAX_ANNUAL = 1_200_000;        // text candidates above this are not pay (= vet.js bound)
export const HARD_MAX_ANNUAL = 5_000_000;   // toJobSalary refuses above this; between the two the vetting gate quarantines
const PLAUSIBLE_ANNUAL_MIN = 15000;
const TIER_GAP = 130;                       // max chars between tiers of one list
const TIER_MAX_RATIO = 3;

const FACTORS = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

export function annualize(value, interval = 'year') {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const f = FACTORS[normalizeInterval(interval)] ?? 1;
  return Math.round(Number(value) * f);
}

export function normalizeInterval(interval) {
  const s = String(interval || 'year').toLowerCase();
  if (s === 'term') return 'term'; // the whole programme (annualized with termFactor / termWeeks)
  if (/hour|hr/.test(s)) return 'hour';
  if (/day|daily/.test(s)) return 'day';
  if (/week/.test(s)) return 'week';
  if (/month/.test(s)) return 'month';
  return 'year';
}

/* ------------------------------------------------------------ currencies */

// FX for plausibility bounds and cross-currency comparison only (never shown
// to users). Keep in sync with public/viz/palette.js FX_PER_USD (as of
// 2026-07-01, from data/cities.json's FX); copied verbatim here because this
// module is bundled on its own. test/fx-consistency.test.js fails on drift.
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
// Currencies the palette table lacks (rough, per USD; bounds only).
const EXTRA_FX_PER_USD = Object.freeze({ QAR: 3.64, CNY: 7.14, ZAR: 18.2 });

/** USD per one unit of each currency (1 / FX_PER_USD), e.g. GBP ≈ 1.348. */
export const USD_PER = Object.freeze(Object.fromEntries(
  Object.entries({ ...EXTRA_FX_PER_USD, ...FX_PER_USD }).map(([c, per]) => [c, c === 'USD' ? 1 : 1 / per])));

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
  ...Object.fromEntries('IE DE FR NL ES IT BE AT FI PT LU GR EE LV LT SK SI HR MT CY BG'.split(' ').map((c) => [c, 'EUR'])),
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

const CODES = 'USD|CAD|GBP|EUR|AUD|NZD|CHF|JPY|KRW|INR|SGD|ILS|AED|SAR|QAR|PLN|SEK|NOK|DKK|CZK|HKD|TWD|CNY|BRL|MXN|ZAR|RON';
// DQ-6: Google writes Polish, Swedish, Danish and Romanian pay as "zł280000", "kr660000",
// "kr.600000" and "lei162000", each followed by its ISO code in parentheses.
const SYMS = String.raw`US\$|CA\$|C\$|AU\$|A\$|SG\$|S\$|NZ\$|HK\$|R\$|\$|£|€|¥|₩|₹|₪|Kč|zł|kr\.|kr|lei`;
const SYM_CUR = { 'US$': 'USD', 'CA$': 'CAD', C$: 'CAD', 'AU$': 'AUD', A$: 'AUD', 'SG$': 'SGD', S$: 'SGD', 'NZ$': 'NZD', 'HK$': 'HKD', R$: 'BRL', $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₩': 'KRW', '₹': 'INR', '₪': 'ILS', 'Kč': 'CZK', 'KČ': 'CZK', 'zł': 'PLN', 'kr.': 'DKK', kr: 'SEK', lei: 'RON' };
// Symbols shared by several currencies: a code next to the amount, or the job's country, decides.
const WEAK_SYMS = Object.freeze({ $: null, kr: { SE: 'SEK', NO: 'NOK', DK: 'DKK' }, 'kr.': { DK: 'DKK', NO: 'NOK', SE: 'SEK' } });

function currencyOf(token) {
  if (!token) return null;
  const t = token.replace(/[\s()]+/g, '').toUpperCase();
  const code = t.match(new RegExp(`^(${CODES})`));
  if (code) return code[1];
  return SYM_CUR[t] || SYM_CUR[token.trim()] || null;
}

/* ---------------------------------------------------------------- tokens */

const PRE = String.raw`(?:(?:${CODES})\s?(?:${SYMS})?|(?:${SYMS}))`;
const NUM = String.raw`\d{1,3}(?:[,.  ]\d{3})+(?:[.,]\d{1,2}(?!\d))?|\d+(?:[.,]\d{1,2}(?!\d))?`;
const MULT = String.raw`(?:\s?(?:thousand|million|billion|mil)\b|(?:k|K|mm|MM|m|M|bn|B)(?![A-Za-z]))`;
// A code after the amount, also in parentheses ("$99000 (CAD)", Google, DQ-15 / D-22).
const SUF = String.raw`(?:\s?\(\s?(?:${CODES})\s?\)|\s?(?:${CODES}|€|£|zł|lei)(?![A-Za-z]))`;
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
    const sym = pre ? pre.trim() : null;
    const weak = !!sym && Object.prototype.hasOwnProperty.call(WEAK_SYMS, sym);
    // Suffix code wins over a bare "$" ("$150,000 CAD", "$8,500 SGD/month").
    const currency = sufCur && (!preCur || weak) ? sufCur : preCur;
    out.push({
      start: m.index + lead, end: m.index + full.length, base, mult: multEff,
      mag: !!multEff && multFactor(multEff) >= 1e6,
      value: base * multFactor(multEff), currency, explicit: !!(pre || suf || suf2), weak: weak && !sufCur,
      sym: weak && !sufCur ? sym : null,
      unit: unitInterval(unit),
    });
  }
  return out;
}

// "The text says USD": the code, "US$" or "US dollars" anywhere in the posting, or a range
// it calls the US one ("The US base salary range ...", "across the U.S. is", "US: $X").
const USD_MENTION_RE = /\bUSD\b|\bUS\$|\bU\.?S\.?\s+dollars?\b|\bAmerican\s+dollars?\b/i;
const US_RANGE_RE = /\b(?:US|U\.S\.)\s+(?:base\s+)?(?:salary|pay|compensation|wage|hourly)|\bacross\s+the\s+U\.?S\.?(?!\w)|(?:^|\n)\s*(?:US|U\.S\.|United States)\s*:/;

/**
 * A symbol several currencies share, with no code next to it, takes the job's currency:
 *   - "$" in a posting whose locations are all in Canada is CAD unless the text says USD
 *     (D-22, DQ-14: Google "$150000 - $153000" in Waterloo, Netflix "$135,000.00 -
 *     185,000.00" in Toronto). Everywhere else a bare "$" stays USD.
 *   - "kr" / "kr." is SEK, NOK or DKK by the job's country ("kr" SEK and "kr." DKK when
 *     no Nordic country is listed).
 */
function resolveWeakCurrencies(toks, text, countries) {
  const cs = (countries || []).map((c) => String(c || '').toUpperCase()).filter(Boolean);
  const canadaOnly = cs.length > 0 && cs.every((c) => c === 'CA');
  for (const t of toks) {
    if (!t.sym) continue;
    if (t.sym === '$') {
      // "The text says USD" in the amount's own sentence or heading, or on a "US:" line
      // (a posting's "USD technology" or "Pixar's USD" elsewhere is not about pay).
      if (canadaOnly) {
        const cl = clauseSpan(text, t.start, t.end);
        const near = `${cl.heading}\n${text.slice(cl.start, cl.end)}`;
        if (!USD_MENTION_RE.test(near) && !US_RANGE_RE.test(near) && lineCountry(text, t.start) !== 'US') t.currency = 'CAD';
      }
      continue;
    }
    const byCountry = WEAK_SYMS[t.sym];
    const hit = byCountry && cs.find((c) => byCountry[c]);
    if (hit) t.currency = byCountry[hit];
  }
  return toks;
}

/* --------------------------------------------------------------- context */

function isBoundary(text, i) {
  const ch = text[i];
  if (ch === '\n' || ch === '•' || ch === ';') return true;
  if (!((ch === '.' || ch === '!' || ch === '?') && (i + 1 >= text.length || /\s/.test(text[i + 1])))) return false;
  // "across the U.S. is USD $85,400 - …" (Microsoft): an abbreviation's final
  // dot is not a sentence end, so the pay words before it stay in the clause.
  if (ch === '.' && ABBREV_END_RE.test(text.slice(Math.max(0, i - 5), i))) return false;
  return true;
}
const ABBREV_END_RE = /(?:^|[^A-Za-z.])(?:[A-Z]\.[A-Z]|e\.g|i\.e)$/;

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

const PAY_RE = /\b(salary|salaries|salaire|r[ée]mun[ée]ration|compensation|pay|paid|wages?|ote|on[- ]target[- ](?:earnings|compensation|comp|pay|income|cash)|commissions?\s+(?:at|on)\s+target|remuneration|stipends?|(?:hourly|contract|day|daily|pay|base) rate|rate of pay|hourly (?:range|wage|pay)|brutto|gross|range for (?:this|the|our) (?:role|position|job|interns?|internships?))\b/i;
// "$500 home office stipend", "learning & development stipend": benefits, not pay.
export const BENEFIT_STIPEND_RE = /\b(?:lunch|meals?|food|snacks?|home[- ]office|office|workspace|learning(?:\s*(?:&|and)\s*development)?|development|education(?:al)?|tuition|wellness|well-?being|fitness|gym|commuter|commuting|transit|transportation|phone|mobile|cell|internet|wi-?fi|co-?working|relocation|equipment|books?|conference|travel|childcare|remote(?:[- ]work)?|wfh|tech(?:nology)?|health|lifestyle|productivity|setup)\s+(?:stipends?|allowances?|budgets?)\b/gi;
const NEG_BEFORE_RE = /\b(raised|raising|funding|funded|series [a-f]|valuation|valued|revenue|arr|backed|invest\w*|budgets?|spend(?:ing)?|closing|closed|deals?|quotas?|bonus(?:es)?|signing|sign-on|relocation|reimburs\w*|allowances?|grants?|credits?|compute|expenses?|savings?|saved|worth|exploits?|prizes?|awards?|donat\w*|customers?|users|loans?|pric(?:e|es|ed|ing)|costs?|fees?|tuition|401)\b[^$£€¥\d]{0,40}$/i;
const NEG_AFTER_RE = /^\W{0,3}(?:in\s+|of\s+)?(?:[\w-]+\s+){0,3}?(deals?|funding|raised|revenue|arr|valuation|budgets?|spend|quotas?|exploits?|customers|users|grants?|credits?|allowances?|bonus(?:es)?|signing|sign-on|savings|prizes?|stipends?|reimbursements?|contracts? (?:value|won)|in (?:annual )?spend)\b/i;
// "Total Compensation Range: $550,000 – $1,100,000" (Google DeepMind) and NVIDIA's
// "The cash compensation range is …, with 85% paid through base salary and 15%
// variable": not base pay, so not a salary (docs/DATA_SOURCES.md §7 pay rules).
const TOTAL_COMP_RE = /\b(?:total\s+(?:(?:target|annual|cash|expected)\s+)*comp(?:ensation)?|(?:target\s+)?cash\s+comp(?:ensation)?)\b/i;
/** The clause names a total/cash compensation range before the amount, and no "base pay/salary" after that phrase. */
function totalCompBefore(before) {
  const i = before.search(TOTAL_COMP_RE);
  return i >= 0 && !/\bbase\s+(?:pay|salary)\b/i.test(before.slice(i));
}
// "$141,000-$202,000 + bonus + equity + benefits" (Google, Meta), "US: $300000 -
// $333000 (USD) + 25% bonus target + equity + benefits": a base range with the
// extras named after it. This is pay context, and the bonus is not the amount.
const PLUS_EXTRAS_AFTER_RE = /^\s*(?:\(?(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|INR|JPY|ILS|PLN|SEK|DKK|NOK|RON|CZK)\)?\s*)?(?:per\s+(?:year|annum|hour)\s*)?(?:\+|plus\b)\s*(?:an?\s+)?(?:\d{1,3}(?:\.\d{1,2})?%\s+)?(?:annual\s+|target\s+)?(?:bonus|equity|benefits|commission|stock|rsus?)\b/i;
const NATIONAL_RE = /\btypical\s+base\s+pay\s+range\s+for\s+this\s+role\s+across\s+(?:the\s+)?([A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,2})\s+is\b[^$£€¥\d]{0,12}$/;
const NATION_CODE = Object.freeze({
  'u.s': 'US', us: 'US', usa: 'US', 'united states': 'US', canada: 'CA', 'united kingdom': 'GB', uk: 'GB', 'u.k': 'GB',
  ireland: 'IE', germany: 'DE', france: 'FR', netherlands: 'NL', 'the netherlands': 'NL', spain: 'ES', portugal: 'PT', italy: 'IT',
  greece: 'GR', croatia: 'HR', czechia: 'CZ', 'czech republic': 'CZ', poland: 'PL', sweden: 'SE', norway: 'NO', denmark: 'DK',
  finland: 'FI', austria: 'AT', switzerland: 'CH', belgium: 'BE', luxembourg: 'LU', israel: 'IL', india: 'IN', japan: 'JP',
  singapore: 'SG', australia: 'AU', 'new zealand': 'NZ', brazil: 'BR', mexico: 'MX', china: 'CN', korea: 'KR', 'south korea': 'KR',
  taiwan: 'TW', romania: 'RO', hungary: 'HU', slovakia: 'SK', slovenia: 'SI', bulgaria: 'BG', serbia: 'RS', estonia: 'EE',
  latvia: 'LV', lithuania: 'LT', 'united arab emirates': 'AE', 'saudi arabia': 'SA', 'south africa': 'ZA', egypt: 'EG', turkey: 'TR',
});
// DQ-15: one pay line per country ("US: $171000 - $247000 (USD) + 20% bonus target ...",
// "Ireland: €142000 - €145000 (EUR) ...", "[Master's degree] Poland: zł159000 (PLN)"): the
// country name right before the amount on its line.
const LINE_LABEL_RE = /(?:^|[\]\s.])([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,2})\s*:\s*$/;
/** The country a unit's range is for: "across Germany is …" (Microsoft) or a "Germany:" line label. */
function unitCountry(text, u) {
  const gs = u.groupStart ?? u.start;
  const cl = clauseSpan(text, gs, u.groupEnd ?? u.end);
  const nat = NATIONAL_RE.exec(text.slice(cl.start, gs));
  if (nat) return NATION_CODE[nat[1].replace(/\s+/g, ' ').toLowerCase().replace(/\.$/, '')] || null;
  return lineCountry(text, gs);
}
/** { code, at } of the country label right before the amount on its line ("US: $X"), or null. */
function lineLabel(text, start) {
  const ls = text.lastIndexOf('\n', start - 1) + 1;
  const from = Math.max(ls, start - 120);
  const m = LINE_LABEL_RE.exec(text.slice(from, start));
  const code = m ? NATION_CODE[m[1].toLowerCase().replace(/\.$/, '')] || null : null;
  return code ? { code, at: from + m.index + m[0].indexOf(m[1]) } : null;
}
/** ISO code of the country that labels the amount's line, or null. */
function lineCountry(text, start) {
  const l = lineLabel(text, start);
  return l ? l.code : null;
}
// DQ-13: Microsoft prices the San Francisco Bay Area and the New York City metro apart
// from the national range: "There is a different range applicable to specific work
// locations, within the San Francisco Bay area and New York City metropolitan area, and the
// base pay range for this role in those locations is USD $160,200 - $261,000 per year."
const CITY_RANGE_RE = /\bwithin\s+(?:the\s+)?((?:San Francisco Bay|New York City)[\s\S]{0,120}?)\bin\s+those\s+locations\s+is\b[^$£€¥\d]{0,12}$/i;
/** Area keys a city-range sentence names ('sf-bay', 'nyc'), or null. */
function cityAreasOf(before) {
  const m = CITY_RANGE_RE.exec(before);
  if (!m) return null;
  const out = [];
  if (/San Francisco Bay/i.test(m[1])) out.push('sf-bay');
  if (/New York City/i.test(m[1])) out.push('nyc');
  return out.length ? out : null;
}
// DQ-14: a single amount stated as a floor ("pay ... will be no less than $62.74 an hour",
// Netflix's union-covered roles) is a minimum, not the role's posted pay.
const FLOOR_BEFORE_RE = /\b(?:(?:no|not)\s+less\s+than|at\s+least|a\s+minimum\s+of|minimum\s+(?:of|rate\s+of|wage\s+of))\s*$/i;
const AREA_BAND_RE = /\brange\s+for\s+roles\s+in\s+this\s+area\b/i;
// DQ-8: "184,000 USD - 287,500 USD for Level 4, and ...": the level label after a tier.
const LEVEL_AFTER_RE = /^\s*,?\s*(?:for|at)\s+(level|grade|band)\s*([\w.-]{1,4})\b/i;

/**
 * Pay areas with their own posted range (DQ-13): the SF Bay Area (75 km around the bay)
 * and the New York City metro (60 km around Manhattan). Returns 'sf-bay', 'nyc' or null
 * for a location { country, lat, lng, remote }.
 */
export const PAY_AREAS = Object.freeze({
  'sf-bay': Object.freeze({ lat: 37.6, lng: -122.2, km: 75 }),
  nyc: Object.freeze({ lat: 40.73, lng: -73.99, km: 60 }),
});
export function payAreaOf(loc) {
  if (!loc || loc.remote || String(loc.country || '').toUpperCase() !== 'US') return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (loc.lat == null || loc.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rad = (x) => (x * Math.PI) / 180;
  for (const [key, a] of Object.entries(PAY_AREAS)) {
    const dLat = rad(lat - a.lat);
    const dLng = rad(lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
    if (2 * 6371 * Math.asin(Math.sqrt(h)) <= a.km) return key;
  }
  return null;
}
/**
 * The pay areas a job is located in, when EVERY one of its US locations is in one of them
 * (['sf-bay'], ['sf-bay', 'nyc']); [] when any US location (a remote one included) is
 * elsewhere, or the job has none. parseSalary's `areas` option.
 */
export function payAreas(locations) {
  const us = (locations || []).filter((l) => l && String(l.country || '').toUpperCase() === 'US');
  if (!us.length) return [];
  const keys = us.map(payAreaOf);
  return keys.every(Boolean) ? [...new Set(keys)] : [];
}
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

/* ------------------------------------------- on-target earnings (OTE, P-1) */

// The posting's own words for base plus commission at target: "OTE" (capitals only),
// "On Target Earnings", "on-target earnings", "on target compensation", "base +
// commission at target".
const OTE_CAPS_RE = /\bOTE\b/;
const OTE_WORDS_RE = /\bon[- ]target[- ](?:earnings|compensation|comp|pay|income|cash)\b|\bbase(?:\s+(?:salary|pay))?\s*(?:\+|plus|and)\s*commissions?\s+(?:at|on)\s+target\b|\bcommissions?\s+at\s+target\b/i;
/** True when s names on-target earnings. */
export function hasOte(s) {
  const t = String(s || '');
  return OTE_CAPS_RE.test(t) || OTE_WORDS_RE.test(t);
}
// "OTE: $X", "On-target earnings for this role are $X": the phrase right before the amount.
const OTE_BEFORE_RE = /(?:\bOTE\b|\bon[- ]target[- ](?:earnings|compensation|comp|pay|income|cash)\b|\bcommissions?\s+at\s+target\b)[^\d$£€¥]{0,40}$/i;
// "$X–$Y OTE", "$X - $Y USD (on-target earnings)": the phrase right after it.
const OTE_AFTER_RE = new RegExp(String.raw`^\s*(?:\(?(?:${'USD|CAD|GBP|EUR|AUD|NZD|CHF|SGD|INR|JPY|ILS'})\)?\s*)?(?:per\s+(?:year|annum)\s*|annually\s*|a\s+year\s*)?[,(\-–—:]?\s*(?:\bOTE\b|on[- ]target[- ](?:earnings|compensation|comp|pay|income|cash)\b|base(?:\s+(?:salary|pay))?\s*(?:\+|plus|and)\s*commissions?\s+(?:at|on)\s+target\b)`, 'i');
// A sentence about the posted range ("the range provided", "The figure above").
const RANGE_REF_RE = /\b(?:range|figure|amount|number|salary|pay|compensation)s?\b[^.\n]{0,60}?\b(?:is|are|represents?|reflects?|provided|above|below|listed|shown|stated|posted|includes?|means?|meaning)\b|\b(?:above|below|listed|posted|provided|stated|following)\s+(?:\w+\s+){0,2}?(?:range|figure|amount|salary|pay|compensation)s?\b/i;
// Sentences about doing compensation work ("Design and administer OTE plans").
const OTE_DUTY_RE = /\b(?:design(?:ing)?|administer(?:ing)?|model(?:ing|ling)?|build(?:ing)?|calculat(?:e|ing)|plann?(?:ing)?|analy[sz](?:e|ing)|audit(?:ing)?|benchmark(?:ing)?)\b[^.\n]{0,40}\b(?:OTE|on[- ]target)\b/i;

function paySentences(text) {
  return String(text || '').split(/\n+|(?<=[.!?])\s+(?=[A-Z(“"])/).map((x) => x.trim()).filter(Boolean);
}

/**
 * The sentence in which the posting says its range is on-target earnings ("For sales
 * roles, the range provided is the role's On Target Earnings ("OTE") range, meaning
 * that the range includes both the sales commissions/sales bonuses target and annual
 * base salary"; "The figure above represents On-Target Earnings (OTE)"), or null. A
 * "for sales roles" sentence applies only when `salesRole` (keywords.js#isSalesTitle).
 */
export function oteStatement(text, { salesRole = false } = {}) {
  for (const seg of paySentences(text)) {
    if (!hasOte(seg) || !RANGE_REF_RE.test(seg) || OTE_DUTY_RE.test(seg)) continue;
    if (SALES_CONDITIONAL_RE.test(seg) && !salesRole) continue;
    return seg.length > 300 ? `${seg.slice(0, 297)}...` : seg;
  }
  return null;
}

/* ------------------------------------------- programme length (term, P-8) */

const TERM_NUM_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, 'twenty-four': 24,
});
const TN = String.raw`(?:\d{1,2}|${Object.keys(TERM_NUM_WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const TERM_SPAN = String.raw`(${TN})(?:\s*(?:-|–|—|to)\s*(${TN}))?`;
const PROGRAMME = String.raw`(?:internships?|co-?ops?|fellowships?|programs?|programmes?|residenc(?:y|ies)|apprenticeships?|placements?|work[- ]terms?|rotations?)`;
const TERM_MODS = String.raw`(?:(?:paid|unpaid|in-person|in person|full-time|full time|part-time|summer|winter|fall|autumn|spring|remote|hybrid|research|immersive|onsite|on-site|intensive),?\s+){0,3}`;
// "12-week internship", "Our 10-week paid internship program", "16 to 24-week internship",
// "a full-time 3-6 month internship", "the four-month fellowship", "12-month fellowship".
const TERM_BEFORE_RE = new RegExp(String.raw`\b${TERM_SPAN}[- ](week|month)s?(?:[- ]long)?[- ]${TERM_MODS}${PROGRAMME}\b`, 'i');
// "The program runs for 4 months", "an internship that lasts for 4-6 months",
// "The internship typically spans 3-4 months".
const TERM_AFTER_RE = new RegExp(String.raw`\b${PROGRAMME}\s+(?:that\s+|which\s+)?(?:typically\s+|usually\s+|generally\s+|will\s+)?(?:runs?|lasts?|spans?|is|takes place over|runs? over)\s+(?:for\s+|over\s+)?(?:about\s+|approximately\s+|around\s+|roughly\s+|up to\s+)?${TERM_SPAN}\s+(week|month)s?\b`, 'i');
// In a pay sentence: "3,850 USD ... per week, with an expectation of 40 hours per week for 4 months".
const TERM_PAY_RE = new RegExp(String.raw`\bfor\s+(?:a\s+(?:period|term)\s+of\s+)?(?:about\s+|approximately\s+)?${TERM_SPAN}[- ](week|month)s?\b`, 'i');
const TERM_PAY_WORD_RE = /\b(?:stipend|salary|pay|paid|compensation|wage|rate|per\s+(?:week|month|hour))\b/i;
// "$100,000–$167,000 USD for the four-month fellowship": the amount covers the whole term.
const TERM_AMOUNT_AFTER_RE = new RegExp(String.raw`^\s*(?:\(?(?:USD|CAD|GBP|EUR|AUD|NZD|CHF|SGD|INR|JPY|ILS)\)?\s*)?(?:in\s+total\s+)?(?:for|over)\s+(?:the|a|an|this|each|its|our)\s+(?:entire\s+|whole\s+|full\s+)?${TERM_SPAN}[- ](week|month)s?(?:[- ]long)?[- ]${TERM_MODS}(?:${PROGRAMME}|term|period|engagement)\b`, 'i');
const TERM_AMOUNT_ANYWHERE_RE = new RegExp(TERM_AMOUNT_AFTER_RE.source.replace(/^\^\\s\*/, '\\b'), 'i');
/**
 * Whether the text can hold pay that the norm-6 parser reads differently from older ones:
 * an amount for a whole term ("for the four-month fellowship") or on-target earnings
 * wording. A cheap pre-check for the stored-snapshot relabel (normalize.js#relabelJobs),
 * which re-parses a stored posting only when this is true.
 */
export function mayRelabelPay(text) {
  const t = String(text || '');
  return TERM_AMOUNT_ANYWHERE_RE.test(t) || hasOte(t);
}
// Fixed-term roles: internships, co-ops, fellowships, residencies, apprenticeships.
const FIXED_TERM_TITLE_RE = /\b(?:intern(?:ship)?s?|co-?ops?|fellows?|fellowships?|residen(?:t|cy|cies)|apprentice(?:ship)?s?|summer\s+(?:analyst|associate|student)s?)\b/i;
const SENIOR_FELLOW_TITLE_RE = /\b(?:distinguished|technical|senior|principal|corporate|chief)\s+fellows?\b/i;

const termNum = (s) => {
  const k = String(s || '').toLowerCase();
  return TERM_NUM_WORDS[k] ?? (Number.parseInt(k, 10) || null);
};
/** { weeks, weeksMax?, exact } from a matched span ("4", "month"); exact = unrounded weeks of the lower bound. */
function termOf(lo, hi, unit) {
  const a = termNum(lo);
  const b = hi ? termNum(hi) : null;
  if (!a) return null;
  const perUnit = /month/i.test(unit) ? 52 / 12 : 1;
  const exact = a * perUnit;
  const weeks = Math.round(exact);
  if (weeks < 1 || weeks > 104) return null;
  const out = { weeks, exact };
  if (b && b > a) out.weeksMax = Math.round(b * perUnit);
  return out;
}

/** True for an internship, co-op, fellowship, residency or apprenticeship (title or employment type). */
export function isFixedTermRole({ title = '', employmentType = '' } = {}) {
  const t = String(title || '');
  if (FIXED_TERM_TITLE_RE.test(t) && !SENIOR_FELLOW_TITLE_RE.test(t)) return true;
  return /\b(?:intern(?:ship)?|temporary|seasonal|co-?op)\b/i.test(String(employmentType || ''));
}

/**
 * The programme length the posting states, in weeks: { weeks, weeksMax? } or null.
 * "12-week internship" -> 12; "4 months" -> 17 (4 × 52 / 12, rounded); "16 to 24-week
 * internship" -> { weeks: 16, weeksMax: 24 }. Only phrases tied to the programme (or to
 * the pay sentence) count, never "within two weeks of your offer" or "6 weeks of vacation".
 */
export function programTerm(text) {
  const s = String(text || '').replace(/\s+/g, ' ');
  let best = null;
  for (const re of [TERM_BEFORE_RE, TERM_AFTER_RE]) {
    const m = re.exec(s);
    if (m && (!best || m.index < best.index)) best = { index: m.index, m };
  }
  if (best) {
    const { m } = best;
    const t = termOf(m[1], m[2], m[3]);
    if (t) return { weeks: t.weeks, ...(t.weeksMax ? { weeksMax: t.weeksMax } : {}) };
  }
  for (const seg of paySentences(text)) {
    if (!TERM_PAY_WORD_RE.test(seg)) continue;
    const m = TERM_PAY_RE.exec(seg);
    const t = m && termOf(m[1], m[2], m[3]);
    if (t) return { weeks: t.weeks, ...(t.weeksMax ? { weeksMax: t.weeksMax } : {}) };
  }
  return null;
}

// BP-9 (fix wave 3, shared decision 4): a part-time role, from its employment type or title.
// "Full-time or part-time" (Apple's seasonal Specialist postings) states no single type.
const PART_TIME_WORD_RE = /\bpart[- ]?time\b/i;
const FULL_TIME_WORD_RE = /\bfull[- ]?time\b/i;
/** True when the employment type, or else the title, says part-time and not also full-time. */
export function isPartTimeRole({ title = '', employmentType = '' } = {}) {
  const e = String(employmentType || '');
  if (PART_TIME_WORD_RE.test(e)) return !FULL_TIME_WORD_RE.test(e);
  const t = String(title || '');
  return PART_TIME_WORD_RE.test(t) && !FULL_TIME_WORD_RE.test(t) && !FULL_TIME_WORD_RE.test(e);
}

// Weekly hours a posting states for the role: "work 16 hours per week (8 hours per day)", "a
// part-time opportunity (20 hours per week)", "28 hrs pw", "20-25 hours a week". Never "8 hours
// per day" alone; 35 hours or more is full-time, so it is not read as part-time hours.
const WEEKLY_HOURS_RE = /\b(\d{1,2})(?:\s*(?:-|–|—|to)\s*(\d{1,2}))?\s*(?:hrs?|hours)\s*(?:pw|p\/w|per\s+week|a\s+week|\/\s*(?:wk|week)|weekly|each\s+week|every\s+week)\b/i;
/** { hours, hoursMax? } a posting states per week (1–34; a range's upper end up to 40), or null. */
export function statedWeeklyHours(text) {
  const m = WEEKLY_HOURS_RE.exec(String(text || '').replace(/\s+/g, ' '));
  if (!m) return null;
  const hours = Number(m[1]);
  const hoursMax = m[2] ? Number(m[2]) : null;
  if (!(hours >= 1 && hours <= 34)) return null;
  return hoursMax && hoursMax > hours && hoursMax <= 40 ? { hours, hoursMax } : { hours };
}

/**
 * Pay basis and programme length for a Job salary (P-1, P-8), from the posting text:
 * kind 'ote' when the posting says the range is on-target earnings (in the salary's own
 * text, e.g. a Greenhouse pay range titled "OTE", or in a sentence about the range), and
 * termWeeks (+ termWeeksMax) for a fixed-term role that states its length. Returns a new
 * salary object; the numbers are never changed.
 * Fix wave 3: a salary with termWeeks always says how the pay was stated (originalInterval
 * 'year' for a yearly rate, BP-1, shared decision 3: termWeeks is the programme's length for
 * information only), and part-time hourly pay is marked partTime, with the weekly hours the
 * posting states as hoursPerWeek (+ hoursPerWeekMax) (BP-9, shared decision 4).
 */
export function payTerms(salary, { text = '', title = '', employmentType = '', salesRole = false } = {}) {
  if (!salary || typeof salary !== 'object') return salary;
  const out = { ...salary };
  const fixedTerm = isFixedTermRole({ title, employmentType });
  // A stipend is never commission pay; an hourly sales range can be OTE (originalInterval
  // still says it was posted per hour).
  if (out.kind !== 'ote' && out.kind !== 'stipend'
    && (hasOte(out.text) || oteStatement(text, { salesRole: salesRole && !fixedTerm }))) out.kind = 'ote';
  if (fixedTerm && !out.termWeeks) {
    const t = programTerm(text);
    if (t) {
      out.termWeeks = t.weeks;
      if (t.weeksMax) out.termWeeksMax = t.weeksMax;
    }
  }
  // BP-1: a yearly rate for a 13-week internship ("Ireland: €72000 (EUR)", "CAD $43,800 - CAD
  // $50,000 per year") is a yearly rate; only week, month or term pay is pay for the term.
  if (out.termWeeks > 0 && !out.originalInterval) out.originalInterval = 'year';
  // BP-9: part-time hourly pay is never a full-time salary; min/max stay the 2,080-hour
  // equivalent (the shape is unchanged) and the flag says so.
  delete out.partTime;
  delete out.hoursPerWeek;
  delete out.hoursPerWeekMax;
  if (out.originalInterval === 'hour' && isPartTimeRole({ title, employmentType })) {
    out.partTime = true;
    const h = statedWeeklyHours(text);
    if (h) {
      out.hoursPerWeek = h.hours;
      if (h.hoursMax) out.hoursPerWeekMax = h.hoursMax;
    }
  }
  return out;
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

/**
 * The pay-context test for the amount at [gs, ge) (docs/VETTING.md §2): is it pay, and if
 * not, why. `unit`: the interval attached to the amount; `single`: one figure, not a range.
 * evaluate() and the vetting scan (scripts/vet-salaries.js, DQ-17) both use it, so they agree
 * on clause ends ("U.S." does not end one) and on pay context ("+ 15% bonus target + equity").
 */
function contextOf(text, gs, ge, { unit = null, single = false } = {}) {
  const cl = clauseSpan(text, gs, ge);
  // A country label starts a new pay line even without a line break ("... + equity +
  // benefits US: $147000 - $210000 (USD)", some Google pages): the words before it belong
  // to the previous line's range, not to this amount.
  const label = lineLabel(text, gs);
  const before = text.slice(label && label.at > cl.start ? label.at : cl.start, gs);
  const after = text.slice(ge, Math.min(text.length, ge + 60));
  const clause = text.slice(cl.start, cl.end);
  const kwClause = clause.replace(BENEFIT_STIPEND_RE, ' ');
  const kwHeading = cl.heading.replace(BENEFIT_STIPEND_RE, ' ');
  const kwInClause = PAY_RE.test(kwClause);
  const kwInHeading = PAY_RE.test(kwHeading);
  const standalone = !kwInClause && clause.length <= 90
    && (clause.slice(0, gs - cl.start) + clause.slice(ge - cl.start)).replace(FILLER_RE, '').length <= 3;
  const payStipendAfter = PAY_STIPEND_AFTER_RE.test(after);
  // "$141,000-$202,000 + bonus + equity + benefits": base pay, extras on top.
  const plusExtras = PLUS_EXTRAS_AFTER_RE.test(after);
  let reject = null;
  // Benefits, funding, deals, bonuses ... right around the amount.
  if (NEG_BEFORE_RE.test(before.slice(-60))) reject = 'not_pay_before';
  // DQ-14: "will be no less than $62.74 an hour" is a floor, not the posted pay.
  else if (single && FLOOR_BEFORE_RE.test(before)) reject = 'pay_floor';
  // Base pay only: a total-compensation range includes bonus/equity/sign-on.
  else if (totalCompBefore(before)) reject = 'total_compensation';
  // Netflix sales: "The overall market range for roles in this area of Netflix is typically
  // $X - $Y. A portion of this compensation is variable." A band for an area, not this role
  // (docs/DATA_SOURCES.md §7a).
  else if (AREA_BAND_RE.test(before)) reject = 'area_band';
  else if (!payStipendAfter && !plusExtras && NEG_AFTER_RE.test(after)) reject = 'not_pay_after';
  const pay = !reject && (kwInClause || kwInHeading || standalone || unit === 'hour' || payStipendAfter || plusExtras);
  return { cl, before, after, clause, kwClause, kwHeading, kwInClause, kwInHeading, standalone, payStipendAfter, plusExtras, reject, pay: !!pay };
}

/**
 * Pay context of the amount at [start, end) of `text`, by the parser's own rules:
 * { pay, reason, clause, heading }. `reason` names a rejection ('not_pay_before',
 * 'pay_floor', 'total_compensation', 'area_band', 'not_pay_after') or is null. For the vetting scan.
 */
export function payContextAt(text, start, end, { unit = null, single = false } = {}) {
  const s = String(text || '');
  const c = contextOf(s, start, end, { unit, single });
  return { pay: c.pay, reason: c.reject, clause: c.clause, heading: c.cl.heading, start: c.cl.start, end: c.cl.end };
}

/**
 * Money amounts in text, read like the parser reads them: [{ start, end, value, currency
 * (null when none), weak (a bare "$" or "kr"), mag (million/billion), unit, single? }].
 * "zł280000", "kr.600000", "$99000 (CAD)", "$35/hour" are each one token. For the scan.
 */
export function findMoneyTokens(text, { countries = [] } = {}) {
  const s = String(text || '');
  return resolveWeakCurrencies(findTokens(s), s, countries);
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
  // Pay in a currency the site has no exchange rate for (FX_PER_USD, shared with the
  // browser's palette.js) cannot be plotted or compared, so it is not read: Romanian "lei"
  // (RON) today. The vetting scan still sees it and flags the posting missed_salary.
  if (!FX_PER_USD[u.currency]) return null;
  if (!b && !u.explicit) return null;

  const gs = u.groupStart ?? u.start;
  const ge = u.groupEnd ?? u.end;
  const unitIv = (b && b.unit) || a.unit || u.groupUnit || null;
  const ctx = contextOf(text, gs, ge, { unit: unitIv, single: !b });
  if (!ctx.pay) return null;
  const { cl, before, after, kwClause, kwHeading, kwInClause, kwInHeading, standalone, payStipendAfter, plusExtras } = ctx;

  // Interval: on the amount, right after it (same line), else earlier in the same clause/heading.
  const afterLine = after.split('\n')[0];
  // P-8: "$100,000–$167,000 USD for the four-month fellowship" is pay for the whole term.
  const termAmount = !unitIv ? TERM_AMOUNT_AFTER_RE.exec(afterLine) : null;
  const term = termAmount ? termOf(termAmount[1], termAmount[2], termAmount[3]) : null;
  let interval = term ? 'term' : unitIv || intervalIn(afterLine.slice(0, 30), false) || intervalIn(before, true) || intervalIn(cl.heading, true);
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
  if (interval !== 'year' && interval !== 'term' && usdOr(hi * FACTORS[interval], cur) > MAX_ANNUAL && usdOr(lo, cur) >= PLAUSIBLE_ANNUAL_MIN && usdOr(hi, cur) <= MAX_ANNUAL) {
    statedInterval = interval;
    interval = 'year';
    intervalCorrected = true;
  }
  // A term amount is annualized over the term (4 months -> × 3).
  const factor = interval === 'term' ? 52 / term.exact : FACTORS[interval];
  const annLo = usdOr(lo * factor, cur);
  const annHi = usdOr(hi * factor, cur);
  // DQ-14: a posted range above the $1.2M bound, written out in full with a pay word in
  // its own clause ("The range for this role is $737,000.00 - $1,430,000.00", Netflix L7),
  // is read so that the vetting gate quarantines it visibly ("Pay unclear, see posting")
  // instead of the posting silently showing no pay. It never beats a plausible amount.
  const over = !(annHi <= MAX_ANNUAL) && !!b && u.explicit && kwInClause && !a.mult && !b.mult && annHi <= HARD_MAX_ANNUAL;
  if (!(annLo >= MIN_ANNUAL && (annHi <= MAX_ANNUAL || over))) return null;

  const stipend = /\bstipend/i.test(kwClause) || /\bstipend/i.test(kwHeading) || payStipendAfter;
  // P-1: "OTE: $X–$Y", "$X–$Y OTE" (no other amount in between).
  const ote = OTE_BEFORE_RE.test(before) || OTE_AFTER_RE.test(afterLine);
  const kind = stipend ? 'stipend' : ote ? 'ote' : interval === 'hour' ? 'hourly' : 'salary';
  let score = 0;
  if (b) score += 3;
  if (u.explicit) score += 2;
  if (kwInClause) score += 4;
  else if (kwInHeading || plusExtras) score += 3;
  else if (standalone) score += 2;
  if (stated) score += 1;
  const want = currenciesFor(countries);
  if (want.includes(u.currency)) score += 2;
  if (lo > 0 && hi / lo > 3) score -= 2;
  // Microsoft: "<Profession> IC4 - The typical base pay range for this role across
  // the U.S. is USD $X - $Y per year." One such national sentence per level; the
  // city ranges that follow ("…in those locations is…") are not national.
  const nat = NATIONAL_RE.exec(before);
  const national = nat ? nat[1].replace(/\s+/g, ' ').toLowerCase() : null;
  const level = national ? (/^\s*(.{2,60}?)\s+[-–—]\s+the typical\b/i.exec(before) || [])[1] || null : null;
  // One posting may list a national range per country ("across Ireland", "across
  // Germany"): the one for the job's own country scores highest.
  const natCode = national ? NATION_CODE[national.replace(/\.$/, '')] || null : null;
  const cs = (countries || []).map((c) => String(c).toUpperCase());
  // The job's own country scores highest; with several, the US one when the job has a US
  // location (as pickCurrency), else its first location's country (a small tie-break, so
  // scores between other amounts keep their order).
  const own = (code) => (code && cs.includes(code) ? 3 + 0.5 - 0.01 * (code === 'US' ? -1 : cs.indexOf(code)) : 0);
  score += own(natCode);
  // DQ-15: "US: $X - $Y (USD) ...", "Ireland: €X - €Y (EUR) ...": the line for the job's
  // country, and lines for different countries are never spanned together.
  const area = natCode || lineCountry(text, gs);
  if (!natCode) score += own(area);
  // DQ-13: the SF Bay Area / NYC range ("... in those locations is USD $X - $Y").
  const cityAreas = cityAreasOf(before);
  // DQ-8: "... for Level 4": the level a tier is for.
  const lab = LEVEL_AFTER_RE.exec(text.slice(ge, ge + 30));
  const levelLabel = lab ? `${lab[1][0].toUpperCase()}${lab[1].slice(1).toLowerCase()} ${lab[2]}` : null;
  if (over) score -= 20;
  return {
    // For "3,850 USD / 2,310 GBP / 4,300 CAD per week" the text is the whole statement;
    // a term amount keeps its "for the four-month fellowship".
    score, start: gs, end: term ? ge + termAmount[0].length : ge, lo, hi, currency: u.currency, interval, kind, national, level,
    area, cityAreas, levelLabel, single: !b, over,
    ...(term ? { termWeeks: term.weeks, termFactor: Math.round((52 / term.exact) * 10000) / 10000 } : {}),
    ...(intervalCorrected ? { intervalCorrected, statedInterval } : {}),
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
const flat = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Parse the pay statement from text. `countries`: ISO codes of the job's locations, in
 * location order (currency and country-line choice). `areas`: the pay areas every US
 * location of the job is in (payAreas(locations), DQ-13). Returns { min, max, currency,
 * interval, text, kind, zones[, levels, termWeeks, termFactor, intervalCorrected,
 * statedInterval] } or null. `levels` ([{ label, min, max }], source interval) is set when
 * the posting prices several levels (NVIDIA "for Level 4 ... for Level 5", Microsoft "IC4
 * - ...", "IC5 - ..."); min and max are then the span.
 */
export function parseSalary(text, { countries = [], areas = [] } = {}) {
  if (text == null) return null;
  const s = String(text).replace(/&nbsp;| /g, ' ');
  if (!/\d/.test(s)) return null;
  const toks = resolveWeakCurrencies(findTokens(s), s, countries);
  if (!toks.length) return null;
  const cands = [];
  const cs = (countries || []).map((c) => String(c || '').toUpperCase());
  let unreadableOwn = false;
  for (const u of buildUnits(s, toks, countries)) {
    // The job's own country's range in a currency the site cannot convert (Microsoft
    // "across Romania is lei …"): another country's range is then not the job's pay.
    if (u.currency && !FX_PER_USD[u.currency]) {
      const code = unitCountry(s, u);
      if (code && cs.includes(code)) unreadableOwn = true;
      continue;
    }
    const r = evaluate(s, u, countries);
    if (r) cands.push(r);
  }
  if (!cands.length) return null;
  // A city range (DQ-13) belongs to the national range before it: same country and level.
  let lastNational = null;
  for (const c of cands) {
    if (c.national) lastNational = c;
    else if (c.cityAreas && lastNational) { c.cityOf = lastNational; c.level = lastNational.level; }
  }
  let best = cands[0];
  for (const c of cands) if (c.score > best.score) best = c;
  if (unreadableOwn && best.area && !cs.includes(best.area)) return null;

  // A job whose US locations are all in the areas a city range names uses the city ranges
  // of the chosen country (Microsoft SF Bay Area / NYC, DQ-13).
  const want = (areas || []).filter(Boolean);
  const nationalPick = best;
  const local = (c) => !!c.cityOf && c.cityOf.national === nationalPick.national && c.currency === nationalPick.currency && want.every((a) => c.cityAreas.includes(a));
  let city = false;
  if (best.national && want.length && cands.some(local)) {
    const own = cands.filter(local);
    best = own.find((c) => c.cityOf === nationalPick) || own[0];
    city = true;
  }

  const same = (c) => c.currency === best.currency && c.interval === best.interval && c.kind === best.kind && (!c.over || best.over);
  let lo = best.lo;
  let hi = best.hi;
  let start = best.start;
  let end = best.end;
  let groupText = null;
  let levels = null;
  // Several ranges of one kind, kept together and spanned:
  //   - national ranges by level (Microsoft "IC4 - …", "IC5 - …"), at most 4x apart (the
  //     gate's ratio bound); city ranges are never part of that span;
  //   - the city ranges by level, for a job located only in those areas (DQ-13), at most 4x;
  //   - the lines for one country ("[Bachelor's degree] Poland: zł156000", "[Master's
  //     degree] Poland: zł159000"), at most 3x. Lines for other countries are never part of
  //     the span (DQ-15).
  let group = null;
  if (city) group = cands.filter((c) => local(c) && same(c));
  else if (best.national) group = cands.filter((c) => c.national === best.national && !c.cityOf && same(c));
  else if (best.area) group = cands.filter((c) => !c.national && !c.cityOf && c.area === best.area && same(c));
  if (group) {
    const glo = Math.min(...group.map((c) => c.lo));
    const ghi = Math.max(...group.map((c) => c.hi));
    const bound = best.national || city ? 4 : TIER_MAX_RATIO;
    if (group.length > 1 && glo > 0 && ghi / glo <= bound) {
      lo = glo; hi = ghi;
      groupText = group.map((c) => `${c.level ? `${c.level.replace(/\s+/g, ' ')}: ` : ''}${flat(s.slice(c.start, c.end))}`).join('; ');
      const names = group.map((c) => (c.level ? levelName(c.level) : null));
      if (names.every(Boolean) && new Set(names).size === names.length) levels = group.map((c, i) => ({ label: names[i], min: c.lo, max: c.hi }));
    }
  } else {
    // Tiered list around the best candidate: same currency/interval/kind, adjacent, and
    // never across country lines or city ranges.
    const tierOk = (c) => same(c) && !c.national && !c.cityAreas && !c.area;
    let i0 = cands.indexOf(best);
    let i1 = i0;
    while (i0 > 0 && tierOk(cands[i0 - 1]) && best.start - cands[i0 - 1].end <= TIER_GAP && cands[i0].start - cands[i0 - 1].end <= TIER_GAP) i0--;
    while (i1 + 1 < cands.length && tierOk(cands[i1 + 1]) && cands[i1 + 1].start - cands[i1].end <= TIER_GAP) i1++;
    if (i1 > i0) {
      const tier = cands.slice(i0, i1 + 1);
      const tlo = Math.min(...tier.map((c) => c.lo));
      const thi = Math.max(...tier.map((c) => c.hi));
      if (tlo > 0 && thi / tlo <= TIER_MAX_RATIO) {
        lo = tlo; hi = thi; start = tier[0].start; end = tier[tier.length - 1].end;
        // DQ-8: each range's own level ("… for Level 4, and … for Level 5").
        const ranged = tier.filter((c) => !c.single);
        if (ranged.length > 1 && ranged.every((c) => c.levelLabel) && new Set(ranged.map((c) => c.levelLabel)).size === ranged.length) {
          levels = ranged.map((c) => ({ label: c.levelLabel, min: c.lo, max: c.hi }));
        }
      }
    }
    // "… for Level 4, and 196,000 USD - 310,500 USD for Level 5": keep the last label.
    if (i1 > i0) {
      const lab = /^\s*(?:for|at)\s+(?:level|grade|band|ic|l)\s*[\w.-]{1,4}\b/i.exec(s.slice(end, end + 24));
      if (lab) end += lab[0].length;
    }
  }
  let t = groupText || flat(s.slice(start, end));
  if (t.length > 160) t = `${t.slice(0, 157)}...`;
  // zones: distinct pay ranges in the posting (tiers, locations, levels); one amount
  // offered in several currencies is one zone, and a single figure inside another range
  // ("$23.00 and $30.59/hr, and most new hires start at $23.00", D-30) is not a zone.
  const inside = (c) => c.single && cands.some((o) => !o.single && o.currency === c.currency && o.interval === c.interval && c.lo >= o.lo && c.hi <= o.hi);
  const zones = new Set(cands.filter((c) => !inside(c)).map((c) => `${c.lo}|${c.hi}|${c.currency}|${c.interval}`)).size;
  const out = { min: round2(lo), max: round2(hi), currency: best.currency, interval: best.interval, text: t, kind: best.kind, zones: Math.max(1, zones) };
  if (levels && levels.length > 1) out.levels = levels.map((l) => ({ label: l.label, min: round2(l.min), max: round2(l.max) }));
  if (best.termWeeks) Object.assign(out, { termWeeks: best.termWeeks, termFactor: best.termFactor });
  if (best.intervalCorrected) Object.assign(out, { intervalCorrected: true, statedInterval: best.statedInterval });
  return out;
}

/** "Software Engineering IC4" -> "IC4", "Critical Environment Ops ATR-C" -> "ATR-C"; "Level 4" stays; a long label is cut to 40 characters. */
function levelName(level) {
  const t = String(level || '').replace(/\s+/g, ' ').trim();
  const code = /\b((?:IC|M|L)\d{1,2}|ATR-?[A-Z0-9]{1,3})$/i.exec(t);
  if (code) return code[1].toUpperCase();
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/**
 * Convert a raw/structured or parsed salary into the Job salary shape:
 * { min, max, mid (annualized), currency, interval: "year", text, kind,
 *   spread (max ÷ min), zones (>= 1), source?, originalInterval?,
 *   termWeeks?, termWeeksMax?, intervalCorrected?, statedInterval?, ranges? }.
 * kind is 'salary' | 'hourly' | 'stipend' | 'ote' and is kept as given. A 'term'
 * interval (pay for the whole programme) is annualized with termFactor (or 52 ÷
 * termWeeks) and kept as originalInterval 'term'.
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
  // Term pay (P-8): annualized over the stated term; without a length it cannot be annualized.
  const termFactor = interval === 'term' ? (Number(sal.termFactor) > 0 ? Number(sal.termFactor) : Number(sal.termWeeks) > 0 ? 52 / Number(sal.termWeeks) : null) : null;
  if (interval === 'term' && !termFactor) return null;
  if (interval !== 'year' && interval !== 'term' && usdOr(annualize(max, interval), cur) > MAX_ANNUAL && usdOr(min, cur) >= PLAUSIBLE_ANNUAL_MIN && usdOr(max, cur) <= MAX_ANNUAL) {
    statedInterval = interval;
    interval = 'year';
    intervalCorrected = true;
  }
  const aMin = termFactor ? Math.round(min * termFactor) : annualize(min, interval);
  const aMax = termFactor ? Math.round(max * termFactor) : annualize(max, interval);
  if (!(usdOr(aMin, cur) >= MIN_ANNUAL && usdOr(aMax, cur) <= HARD_MAX_ANNUAL)) return null;
  const kind = sal.kind || (interval === 'hour' ? 'hourly' : 'salary');
  const out = {
    min: aMin, max: aMax, mid: Math.round((aMin + aMax) / 2),
    currency: cur, interval: 'year',
    text: sal.text || null, kind,
  };
  // F2 pay-clarity fields: spread = max ÷ min (2 decimals), zones = distinct pay ranges (>= 1).
  out.spread = Math.round((aMax / aMin) * 100) / 100;
  out.zones = Math.max(1, Math.round(Number(sal.zones) || 1));
  const src = source || sal.source;
  if (src) out.source = src;
  if (interval !== 'year') out.originalInterval = interval;
  // P-8: the programme length in weeks (termWeeksMax when a range such as "16 to 24 weeks").
  const tw = Math.round(Number(sal.termWeeks));
  if (tw >= 1 && tw <= 104) {
    out.termWeeks = tw;
    const twMax = Math.round(Number(sal.termWeeksMax));
    if (twMax > tw && twMax <= 104) out.termWeeksMax = twMax;
  }
  if (intervalCorrected) { out.intervalCorrected = true; out.statedInterval = statedInterval; }
  if (Array.isArray(sal.ranges) && sal.ranges.length > 1) out.ranges = sal.ranges;
  // DQ-8: pay by level, annualized like min/max, in the salary's currency.
  const toAnnual = (v) => (termFactor ? Math.round(v * termFactor) : annualize(v, interval));
  const levels = Array.isArray(sal.levels)
    ? sal.levels.filter((l) => l && l.label && Number.isFinite(Number(l.min)) && Number.isFinite(Number(l.max))).map((l) => {
      const a = toAnnual(Math.min(Number(l.min), Number(l.max)));
      const b = toAnnual(Math.max(Number(l.min), Number(l.max)));
      return { label: String(l.label), min: a, max: b };
    })
    : [];
  if (levels.length > 1) out.levels = levels;
  return out;
}

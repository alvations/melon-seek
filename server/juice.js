// Juice Score: "livability $: what's left after living costs".
//
// The salary is the melon; rent, taxes and living costs are the rind. The Juice is
// what's left after the rind is peeled off:
//
//   juice (net) = gross − tax − rent (1/2/3-bedroom by household, 12 months)
//                 − living (costIndex/100 × NYC single-person basket × household scale)
//   score       = 100 × (1 − e^(−net / $80K)): fixed, saturating, never clamps (stable across companies)
//
// Pure ES module, browser-safe (no node: imports, no process): the static GitHub Pages
// build ships it in dist/lib/ next to geo.js. Inputs come from data/cities.json (pass the
// parsed document or its `cities` array). Formula, tax model, anchors and sources:
// docs/LIVABILITY.md. An estimate, not financial advice.
//
//   computeJuice(salaryUSD, cityRecord, opts?) -> { gross, tax, rent, living, net, score,
//                    grade, household, rentBurden, bigMacs, taxParts, confidence, inputs }
//     opts.household: 'single' (default, 1-bedroom) | 'couple' (2-bedroom) | 'family'
//                     (3-bedroom, 2 adults + 2 children); living costs scale by LIVING_SCALE
//     opts.rentOverrideUSD: user-entered monthly rent (USD) replacing the dataset rent
//     inputs: rent / tax / costIndex / fx / bigMac values, each with source and as-of date
//     confidence: "high" | "medium" | "low" (lowest input; non-US is "low" unless rent and
//                 cost index are from official or open sources)
//   findCity(location, cities) -> city record | null
//   attachJuice(job, cities, opts?) -> job (sets job.juice = { best, byLocation } | null)
import { geocode, normKey } from './geo.js';

export const JUICE = Object.freeze({
  name: 'Juice Score',
  short: 'Juice',
  subtitle: "livability $: what's left after living costs",
  tagline: "What's left after the rind (rent, taxes, living costs) is peeled off.",
  disclaimer: 'An estimate, not financial advice.',
});

// ---------------------------------------------------------------------------
// FX. Copied from public/viz/palette.js (FX_TO_USD, viz workstream) so juice amounts
// are in the same "approx USD" unit the salary chart plots. Currencies the palette
// does not list fall back to the city's fxPerUSD (data/cities.json). The monthly refresh
// (scripts/refresh/fx.js) rewrites data/cities.json fx, this table, FX_AS_OF and FX_SOURCE
// together; docs/DATA_FRESHNESS.md "FX".
// ---------------------------------------------------------------------------
// FX date and source reported in computeJuice inputs.fx (equal to data/cities.json fx.asOf and
// fx.source.name; test/freshness.test.js checks both).
export const FX_AS_OF = '2026-07-01';
export const FX_SOURCE = 'The Economist Big Mac index source data v2, dollar_ex column (release 2026-07-01)';
// Keep in sync with public/viz/palette.js FX_PER_USD (as of 2026-07-01);
// test/fx-consistency.test.js fails if they drift.
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
export const FX_TO_USD = Object.freeze(Object.fromEntries(
  Object.entries(FX_PER_USD).map(([c, per]) => [c, c === 'USD' ? 1 : 1 / per])));

// Annual single-person living costs excluding rent in New York City: Numbeo's
// "estimated monthly costs for a single person, excluding rent" ($1,665.2, Sep 2026) × 12.
// Same value as data/cities.json baseline.nycBasketUSD (a test keeps them equal).
export const NYC_BASKET_USD = 19982;

// ---------------------------------------------------------------------------
// Households (docs/LIVABILITY.md §1). Rent scales with the number of bedrooms, living costs
// with an equivalence scale. 'single' is the default and reproduces the one-person model
// exactly (1-bedroom rent, scale 1).
// ---------------------------------------------------------------------------

/**
 * Equivalence scale for living costs EXCLUDING rent: the after-housing-costs version of the
 * modified OECD scale used by the UK DWP Households Below Average Income statistics (first
 * adult 0.58, each further adult 0.42, each child under 14 0.20), normalized so one adult = 1:
 * a couple is 1.72, two adults and two children 2.41. Chosen over the before-housing-costs
 * OECD-modified scale (1.5 / 2.1) because the basket excludes rent, and housing is where most
 * of a household's economies of scale sit. Checked against BLS Consumer Expenditure Survey 2024
 * spending excluding housing (two-person ÷ one-person 1.80, four-person 2.34) and the MIT Living
 * Wage budgets for San Francisco and New York (1.65-1.72, 2.38-2.40). See docs/LIVABILITY.md.
 */
export const LIVING_SCALE = Object.freeze({
  name: 'Modified OECD equivalence scale, after-housing-costs version (UK DWP Households Below Average Income): first adult 0.58, each further adult 0.42, each child under 14 0.20',
  url: 'https://www.gov.scot/publications/poverty-in-scotland-methodology/pages/income-equivalisation/',
  firstAdult: 0.58,
  extraAdult: 0.42,
  child: 0.2,
});

/** Household presets: who the rent and living costs are for. */
export const HOUSEHOLDS = Object.freeze({
  single: Object.freeze({ key: 'single', label: 'Just me', adults: 1, children: 0, bedrooms: 1 }),
  couple: Object.freeze({ key: 'couple', label: 'Couple', adults: 2, children: 0, bedrooms: 2 }),
  family: Object.freeze({ key: 'family', label: 'Family', adults: 2, children: 2, bedrooms: 3 }),
});
export const HOUSEHOLD_KEYS = Object.freeze(Object.keys(HOUSEHOLDS));
export const DEFAULT_HOUSEHOLD = 'single';

/** The household preset for a key ('single' | 'couple' | 'family'); anything else is 'single'. */
export function householdOf(key) {
  return HOUSEHOLDS[key] || HOUSEHOLDS[DEFAULT_HOUSEHOLD];
}

/** Living-cost multiplier for a household (1 for one adult; LIVING_SCALE weights ÷ first adult). */
export function livingScaleFor(household) {
  const h = typeof household === 'object' && household ? household : householdOf(household);
  const s = LIVING_SCALE;
  return (s.firstAdult + s.extraAdult * Math.max(0, h.adults - 1) + s.child * h.children) / s.firstAdult;
}

/** cities.json fields holding the quoted city-centre rent per bedroom count. */
export const RENT_FIELDS = Object.freeze({
  1: Object.freeze({ local: 'rent1brCenterLocal', usd: 'rent1brCenterUSD' }),
  2: Object.freeze({ local: 'rent2brCenterLocal', usd: 'rent2brCenterUSD' }),
  3: Object.freeze({ local: 'rent3brCenterLocal', usd: 'rent3brCenterUSD' }),
});

// Score curve: a saturating exponential, score = 100 × (1 − e^(−net / K)), K = $80,000.
// Every extra K of juice closes 63% of the remaining gap to a full glass, so the score keeps
// separating high-paying roles instead of clamping at 100. Tuned on the real snapshots
// (2026-10-02, 4,034 scored jobs): the 90th-percentile net ($172.6K) scores 88, the 99th
// ($277K) 97, and a rounded 100 needs ≥ $423,866 net (fullGlassUSD). See docs/LIVABILITY.md.
// (Replaced the clamped log curve A = $10K / B = $250K, which put 1.7% of jobs at 100.)
const K_USD = 80000;
export const SCORE_ANCHORS = Object.freeze({
  curve: 'exponential',
  K: K_USD,
  fullGlassUSD: Math.ceil(K_USD * Math.log(200)), // smallest whole-dollar net whose rounded score is 100
});

// Grades (by score; net <= 0 is always "Rind": the costs eat the whole melon).
export const GRADES = Object.freeze([
  { min: 70, label: 'Juicy', hint: 'plenty left after rent, tax and living costs' },
  { min: 45, label: 'Ripe', hint: 'comfortable margin' },
  { min: 0, label: 'Dry', hint: 'thin margin' },
]);
export const RIND = Object.freeze({ label: 'Rind', hint: 'costs exceed take-home pay' });

const pos = (x) => (x > 0 ? x : 0);
const min = Math.min;
const INF = Infinity;

/** Score 0..100 (unrounded, never quite 100) for annual net disposable income (USD). */
export function scoreFromNet(net) {
  if (!(net > 0)) return 0;
  return -100 * Math.expm1(-net / SCORE_ANCHORS.K);
}

/** Grade label for a score (and net, so a non-positive net is "Rind"). */
export function gradeFor(score, net = 1) {
  if (!(net > 0)) return RIND.label;
  return (GRADES.find((g) => score >= g.min) || GRADES[GRADES.length - 1]).label;
}

/**
 * Inverse of scoreFromNet: annual net (USD) needed for a score (legends, grade $ thresholds).
 * The curve never reaches 100, so netForScore(100) returns fullGlassUSD, the net at which the
 * rounded score first shows 100. netForScore(0) = 0.
 */
export function netForScore(score) {
  const s = Number(score);
  if (!(s > 0)) return 0;
  if (s >= 99.5) return SCORE_ANCHORS.fullGlassUSD;
  return -SCORE_ANCHORS.K * Math.log1p(-s / 100);
}

// ---------------------------------------------------------------------------
// Tax model (docs/LIVABILITY.md §3). Annual amounts in the local currency of the city.
// Salary only, one earner, standard deductions and allowances, employee-side contributions.
// Mandatory public social insurance counts as tax; funded individual retirement accounts
// (401k, CH 2nd pillar, SG CPF, IN EPF, AU super, HK MPF) do not.
// Each rule returns { income, regional, social } (national income tax incl. surtaxes,
// state/province/canton/city income tax, employee social contributions).
// Brackets: [[upTo, rate], ...] or [[upTo, rateFrom, rateTo]] for a linearly rising
// marginal rate (German tariff zones). Sources and verification status: TAX_SOURCES below;
// hand-computed vectors with the arithmetic: test/fixtures/tax-golden.json.
//
// Household (taxFor opts.household): 'single' (default) | 'couple' | 'family' (2 adults and
// 2 children under 17), always one earner. Filing-status effects (joint brackets, allowances,
// child credits) are applied only where they are implemented and sourced (TAX_HOUSEHOLD);
// the result's `basis` says how the household was taxed and `note` what was left out.
// ---------------------------------------------------------------------------

/** Progressive tax on x for brackets [[upTo, rate]] / [[upTo, r0, r1]]. */
export function progressive(x, brackets) {
  let tax = 0;
  let lo = 0;
  for (const [hi, r0, r1] of brackets) {
    if (!(x > lo)) break;
    const top = min(x, hi);
    const w = top - lo;
    if (r1 == null) tax += w * r0;
    else tax += (w * (r0 + (r0 + ((r1 - r0) * w) / (hi - lo)))) / 2;
    lo = hi;
  }
  return tax;
}

/** The filing household for a household key: one earner, married when 2 adults. */
function taxHousehold(key) {
  const h = householdOf(key);
  return { key: h.key, married: h.adults > 1, kids: h.children };
}

// ---- United States, federal (tax year 2026) ------------------------------------------------
// IRS Rev. Proc. 2025-32 §4.01 (tables 1 and 3), §4.05 (child tax credit), §4.14 (standard
// deduction); IRC §164(b)(6)-(7) as amended by P.L. 119-21 (SALT cap); IRS Topic 560 and
// Pub. 15 (2026) for FICA. mfj = married filing jointly.
const US_FED_2026 = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [INF, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [INF, 0.37]],
};
const US_STD_2026 = { single: 16100, mfj: 32200 };
const US_SS_BASE_2026 = 184500;
const US_ADDL_MEDICARE = { single: 200000, mfj: 250000 }; // 0.9% over (IRC §3101(b)(2), not indexed)
const US_CTC_2026 = 2200; // per child under 17; reduced $50 per $1,000 (or part) of MAGI over the threshold
const US_CTC_PHASE = { single: 200000, mfj: 400000 };
/** SALT deduction cap for 2026: $40,400, less 30% of MAGI over $505,000, never below $10,000. */
const usSaltCap = (magi) => Math.max(10000, 40400 - 0.3 * pos(magi - 505000));
const usFs = (hh) => (hh.married ? 'mfj' : 'single');
const usPersons = (hh) => (hh.married ? 2 : 1) + hh.kids;

function usFederalIncomeTax(g, hh, deduction) {
  const fs = usFs(hh);
  let tax = progressive(pos(g - deduction), US_FED_2026[fs]);
  if (hh.kids) {
    const steps = Math.ceil(pos(g - US_CTC_PHASE[fs]) / 1000);
    tax = pos(tax - pos(US_CTC_2026 * hh.kids - 50 * steps)); // non-refundable part only
  }
  return tax;
}

// ---- US states ------------------------------------------------------------------------------
// Each state rule: (g, { hh, fedTax, fedDeduction }) -> { regional, social, deductible, taxable }
//   regional:   state income tax; social: state payroll contributions (SDI, PFML, ...)
//   deductible: the part of `social` that federal Schedule A treats as a state income tax
//               (disability and family-leave funds, PA unemployment fund; Schedule A instructions)
//   taxable:    state taxable income (local taxes that piggyback on it use this)
const CA_X_2025 = [[11079, 0.01], [26264, 0.02], [41452, 0.04], [57542, 0.06], [72724, 0.08], [371479, 0.093], [445771, 0.103], [742953, 0.113], [INF, 0.123]];
const CA_Y_2025 = [[22158, 0.01], [52528, 0.02], [82904, 0.04], [115084, 0.06], [145448, 0.08], [742958, 0.093], [891542, 0.103], [1485906, 0.113], [INF, 0.123]];

const NYS_2026 = {
  single: [[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5e6, 0.0965], [25e6, 0.103], [INF, 0.109]],
  mfj: [[17150, 0.039], [23600, 0.044], [27900, 0.0515], [161550, 0.054], [323200, 0.059], [2155350, 0.0685], [5e6, 0.0965], [25e6, 0.103], [INF, 0.109]],
};
// IT-2105-I (2026) tax computation worksheets for NY AGI over $107,650 (the "recapture" that
// takes back the benefit of the lower brackets): [taxable income up to, recapture base,
// incremental benefit, NY AGI where the $50,000 phase-in starts].
const NYS_RECAPTURE_2026 = {
  single: { flat: 0.059, flatUpTo: 215400, ws: [[1077550, 567, 2047, 215400], [5e6, 2614, 30172, 1077550], [25e6, 32786, 32500, 5e6]] },
  mfj: { flat: 0.054, flatUpTo: 161550, ws: [[323200, 333, 807, 161550], [2155350, 1140, 3071, 323200], [5e6, 4211, 60350, 2155350], [25e6, 64561, 32500, 5e6]] },
};
const nyPhase = (x) => Math.round((min(pos(x), 50000) / 50000) * 1e4) / 1e4; // worksheets round to 4 decimals

/** New York State tax for 2026 on taxable income `ti` with NY AGI `agi` (IT-2105-I). */
export function nysTax(ti, agi, married = false) {
  const fs = married ? 'mfj' : 'single';
  const base = progressive(ti, NYS_2026[fs]);
  if (agi <= 107650) return base;
  if (agi > 25e6) return 0.109 * ti;
  const R = NYS_RECAPTURE_2026[fs];
  if (ti <= R.flatUpTo) {
    const flat = R.flat * ti;
    return agi >= 157650 ? flat : base + (flat - base) * nyPhase(agi - 107650);
  }
  for (const [upTo, recaptureBase, increment, start] of R.ws) {
    if (ti <= upTo) return base + recaptureBase + increment * nyPhase(agi - start);
  }
  return base;
}
const NYC_2026 = {
  single: [[12000, 0.03078], [25000, 0.03762], [50000, 0.03819], [INF, 0.03876]],
  mfj: [[21600, 0.03078], [45000, 0.03762], [90000, 0.03819], [INF, 0.03876]],
};

// Oregon 2026 (withholding formulas 150-206-436): brackets; federal tax subtraction capped at
// $8,750 and cut $1,750 per $5,000 ($10,000 joint) of income from $125,000 ($250,000 joint);
// exemption credit $263 per person, none above $100,000 ($200,000 joint).
const OR_2026 = {
  single: [[4550, 0.0475], [11400, 0.0675], [125000, 0.0875], [INF, 0.099]],
  mfj: [[9100, 0.0475], [22800, 0.0675], [250000, 0.0875], [INF, 0.099]],
};
function orFederalSubtraction(g, fedTax, hh) {
  const start = hh.married ? 250000 : 125000;
  const step = hh.married ? 10000 : 5000;
  const cap = g < start ? 8750 : pos(8750 - 1750 * (1 + Math.floor((g - start) / step)));
  return min(fedTax, cap);
}

// Alabama (Form 40, 2025): 2% / 4% / 5%; the federal income tax is deductible.
const AL_2025 = { single: [[500, 0.02], [3000, 0.04], [INF, 0.05]], mfj: [[1000, 0.02], [6000, 0.04], [INF, 0.05]] };
/** Alabama standard deduction chart (Form 40 booklet 2025): steps of $500 of AGI from $26,000. */
function alStd(g, married) {
  const [max, floor, cut] = married ? [8500, 5000, 175] : [3000, 2500, 25];
  if (g < 26000) return max;
  return Math.max(floor, max - cut * (1 + Math.floor((g - 26000) / 500)));
}

// Maryland 2025 (Budget Reconciliation and Financing Act 2025; Comptroller tax alert).
const MD_2025 = {
  single: [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [500000, 0.0575], [1e6, 0.0625], [INF, 0.065]],
  mfj: [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [600000, 0.0575], [1.2e6, 0.0625], [INF, 0.065]],
};
const mdTaxable = (g, hh) => pos(g - (hh.married ? 6700 : 3350));

/** North Carolina child deduction per qualifying child (D-401 table), married filing jointly. */
function ncChildDeduction(g) {
  return g <= 40000 ? 3000 : g <= 60000 ? 2500 : g <= 80000 ? 2000 : g <= 100000 ? 1500 : g <= 120000 ? 1000 : g <= 140000 ? 500 : 0;
}

const US_STATE = {
  CA(g, { hh }) {
    // FTB 2025 schedules X / Y (the 2026 schedules are not out; EDD's 2026 withholding uses the
    // same brackets); standard deduction $5,706 / $11,412; personal exemption credit $153 each,
    // cut $6 per $2,500 of AGI over $252,203 / $504,411 (dependent credits not modeled);
    // Behavioral Health Services Tax 1% of taxable income over $1M; SDI 1.3% of all wages (2026).
    const m = hh.married;
    const ti = pos(g - (m ? 11412 : 5706));
    const steps = Math.ceil(pos(g - (m ? 504411 : 252203)) / 2500);
    const credits = (m ? 2 : 1) * pos(153 - 6 * steps);
    const sdi = 0.013 * g;
    return { regional: pos(progressive(ti, m ? CA_Y_2025 : CA_X_2025) - credits) + 0.01 * pos(ti - 1e6), social: sdi, deductible: sdi, taxable: ti };
  },
  NY(g, { hh }) {
    // IT-2105-I (2026): standard deduction $8,000 / $16,050, $1,000 per dependent. Paid Family
    // Leave 0.432% up to $411.91; disability benefits 0.5% up to $0.60 a week.
    const m = hh.married;
    const ti = pos(g - (m ? 16050 : 8000) - 1000 * hh.kids);
    const payroll = min(0.00432 * g, 411.91) + min(0.005 * g, 0.6 * 52);
    return { regional: nysTax(ti, g, m), social: payroll, deductible: payroll, taxable: ti };
  },
  WA(g) {
    // No income tax on wages. WA Cares 0.58% of all wages; Paid Family and Medical Leave 2026:
    // 1.13% of wages up to the Social Security wage base, 71.43% of it paid by the employee.
    const pfml = 0.0113 * 0.7143 * min(g, US_SS_BASE_2026);
    return { regional: 0, social: 0.0058 * g + pfml, deductible: pfml };
  },
  TX: () => ({ regional: 0 }),
  FL: () => ({ regional: 0 }),
  TN: () => ({ regional: 0 }),
  NV: () => ({ regional: 0 }),
  MA(g, { hh }) {
    // Form 1 (2025): 5% of income after the personal exemption ($4,400 / $8,800), $1,000 per
    // dependent and up to $2,000 of Social Security and Medicare withheld; 4% surtax over
    // $1,107,750 (2026, Form 1-ES). PFML employee 0.46% up to the Social Security wage base.
    const fica = 0.062 * min(g, US_SS_BASE_2026) + 0.0145 * g;
    const ti = pos(g - (hh.married ? 8800 : 4400) - 1000 * hh.kids - min(2000, fica));
    const pfml = 0.0046 * min(g, US_SS_BASE_2026);
    return { regional: 0.05 * ti + 0.04 * pos(ti - 1107750), social: pfml, deductible: pfml, taxable: ti };
  },
  GA(g, { hh }) {
    // HB 463 (2025): 4.99% for 2026, standard deduction $15,000 / $30,000, $5,000 per dependent.
    const ti = pos(g - (hh.married ? 30000 : 15000) - 5000 * hh.kids);
    return { regional: 0.0499 * ti, taxable: ti };
  },
  DC(g, { hh }) {
    // OTR rates for tax years after 2021 (one schedule for every filing status); standard
    // deduction $15,000 / $30,000 (DC decoupled from the 2025 federal increase).
    const ti = pos(g - (hh.married ? 30000 : 15000));
    return { regional: progressive(ti, [[10000, 0.04], [40000, 0.06], [60000, 0.065], [250000, 0.085], [500000, 0.0925], [1e6, 0.0975], [INF, 0.1075]]), taxable: ti };
  },
  AL(g, { hh, fedTax }) {
    // Form 40 (2025): standard deduction chart, personal exemption $1,500 / $3,000, dependent
    // exemption $1,000 / $500 / $300 by AGI, and the federal income tax deduction.
    const m = hh.married;
    const dep = (g <= 50000 ? 1000 : g <= 100000 ? 500 : 300) * hh.kids;
    const ti = pos(g - fedTax - alStd(g, m) - (m ? 3000 : 1500) - dep);
    return { regional: progressive(ti, m ? AL_2025.mfj : AL_2025.single), taxable: ti };
  },
  OH(g, { hh }) {
    // ORC 5747.02(A)(3)(c) (2026 on): $332 plus 2.75% of income over $26,050; ORC 5747.025
    // personal exemptions $2,400 / $2,150 / $1,900 by income, none at $500,000 or more.
    const ex = g >= 500000 ? 0 : g > 80000 ? 1900 : g > 40000 ? 2150 : 2400;
    const ti = pos(g - ex * usPersons(hh));
    return { regional: ti > 26050 ? 332 + 0.0275 * (ti - 26050) : 0, taxable: ti };
  },
  VA(g, { hh }) {
    // Form 760 (2025 and 2026): standard deduction $8,750 / $17,500, $930 per exemption,
    // 2% / 3% / 5% / 5.75% over $3,000 / $5,000 / $17,000.
    const ti = pos(g - (hh.married ? 17500 : 8750) - 930 * usPersons(hh));
    return { regional: progressive(ti, [[3000, 0.02], [5000, 0.03], [17000, 0.05], [INF, 0.0575]]), taxable: ti };
  },
  IL(g, { hh }) {
    // 4.95%; exemption $2,925 per person for 2026 (IL-700-T), none above $250K / $500K AGI.
    const ti = pos(g - (g > (hh.married ? 500000 : 250000) ? 0 : 2925 * usPersons(hh)));
    return { regional: 0.0495 * ti, taxable: ti };
  },
  CO(g, { hh }) {
    // 4.4% (2025 rate, statutory) of federal taxable income. A federal itemizer adds back the
    // state income tax deducted, which leaves a salary-only filer at the standard deduction;
    // above $300,000 of AGI the deduction is capped at $1,000 / $2,000 from 2026 (Individual
    // Income Tax Guide, "Federal itemized or standard deductions").
    const std = US_STD_2026[usFs(hh)];
    const ti = pos(g - (g > 300000 ? min(std, hh.married ? 2000 : 1000) : std));
    return { regional: 0.044 * ti, taxable: ti };
  },
  PA(g) {
    // 3.07% of compensation; unemployment compensation employee withholding 0.07% of all wages.
    const uc = 0.0007 * g;
    return { regional: 0.0307 * g, social: uc, deductible: uc, taxable: g };
  },
  NC(g, { hh }) {
    // 3.99% from 2026; standard deduction $12,750 / $25,500; child deduction (D-401 table).
    const ti = pos(g - (hh.married ? 25500 : 12750) - hh.kids * ncChildDeduction(g));
    return { regional: 0.0399 * ti, taxable: ti };
  },
  OR(g, { hh, fedTax }) {
    // 2026 withholding formulas: standard deduction $2,910 / $5,820, federal tax subtraction,
    // exemption credit; statewide transit tax 0.1%; Paid Leave Oregon employee 60% of 1% up to
    // the Social Security wage base.
    const m = hh.married;
    const ti = pos(g - (m ? 5820 : 2910) - orFederalSubtraction(g, fedTax, hh));
    const exemption = g <= (m ? 200000 : 100000) ? 263 * usPersons(hh) : 0;
    const paidLeave = 0.006 * min(g, US_SS_BASE_2026);
    return { regional: pos(progressive(ti, m ? OR_2026.mfj : OR_2026.single) - exemption) + 0.001 * g, social: paidLeave, deductible: paidLeave, taxable: ti };
  },
  UT(g, { hh }) {
    // TC-40 (2025): 4.5% of income less the taxpayer tax credit, 6% of the federal standard
    // deduction plus $2,111 per dependent, reduced by 1.3% of income over $18,213 / $36,426.
    const credit = pos(0.06 * (US_STD_2026[usFs(hh)] + 2111 * hh.kids) - 0.013 * pos(g - (hh.married ? 36426 : 18213)));
    return { regional: pos(0.045 * g - credit), taxable: g };
  },
  AZ(g, { hh }) {
    // Form 140 (2025): 2.5% after the standard deduction $15,750 / $31,500; dependent credit
    // $100 per child under 17, reduced 5% per $1,000 of AGI over $200K / $400K.
    const ti = pos(g - (hh.married ? 31500 : 15750));
    const over = pos(g - (hh.married ? 400000 : 200000));
    const credit = 100 * hh.kids * pos(1 - 0.05 * Math.ceil(over / 1000));
    return { regional: pos(0.025 * ti - credit), taxable: ti };
  },
  MN(g, { hh }) {
    // Department of Revenue 2026: brackets, standard deduction $15,300 / $30,600, dependent
    // exemption $5,300 (the standard-deduction phase-out at high income is not modeled).
    // Paid Leave from 2026: 0.88% up to the Social Security wage base, half from the employee.
    const m = hh.married;
    const ti = pos(g - (m ? 30600 : 15300) - 5300 * hh.kids);
    const b = m ? [[48700, 0.0535], [193480, 0.068], [337930, 0.0785], [INF, 0.0985]] : [[33310, 0.0535], [109430, 0.068], [203150, 0.0785], [INF, 0.0985]];
    const paidLeave = 0.0044 * min(g, US_SS_BASE_2026);
    return { regional: progressive(ti, b), social: paidLeave, deductible: paidLeave, taxable: ti };
  },
  MI(g, { hh }) {
    // 4.25%, personal exemption $5,900 per person for 2026 (Treasury 2026 withholding data).
    const ti = pos(g - 5900 * usPersons(hh));
    return { regional: 0.0425 * ti, taxable: ti };
  },
  MD(g, { hh }) {
    // 2025 brackets, standard deduction $3,350 / $6,700 (personal exemptions not modeled).
    const ti = mdTaxable(g, hh);
    return { regional: progressive(ti, hh.married ? MD_2025.mfj : MD_2025.single), taxable: ti };
  },
};

// Local income taxes: (g, { hh, taxable }) -> amount (added to regional).
const US_LOCAL = {
  NYC(g, { hh, taxable }) {
    // NYC resident tax on NYS taxable income less the NYC school tax credit: fixed $63 / $125
    // up to $250K of income, rate reduction up to $500K (IT-2105-I 2026).
    const m = hh.married;
    let tax = progressive(taxable, m ? NYC_2026.mfj : NYC_2026.single);
    if (g <= 250000) tax -= m ? 125 : 63;
    if (g <= 500000) {
      const t0 = m ? 21600 : 12000;
      tax -= taxable <= t0 ? 0.00171 * taxable : (m ? 37 : 21) + 0.00228 * (taxable - t0);
    }
    return pos(tax);
  },
  COLUMBUS: (g) => 0.025 * g,
  // Wage tax 3.74% to 30 June 2026, 3.735% from 1 July 2026 (calendar-year average).
  PHILADELPHIA: (g) => ((0.0374 + 0.03735) / 2) * g,
  // Earned income tax 3% (city 1% + Pittsburgh Public Schools 2%) and the $52 Local Services Tax.
  PITTSBURGH: (g) => 0.03 * g + 52,
  DETROIT: (g, { hh }) => 0.024 * pos(g - 600 * usPersons(hh)),
  PORTLAND(g, { hh, taxable }) {
    // Metro supportive housing 1% over $128K / $205K (2026), Multnomah preschool 1.5% over
    // $125K / $200K plus 1.5% over $250K / $400K, all on Oregon taxable income; Portland arts
    // tax $50 / $100 once Oregon taxable income passes $20,000 / $40,000.
    const m = hh.married;
    return 0.01 * pos(taxable - (m ? 205000 : 128000)) + 0.015 * pos(taxable - (m ? 200000 : 125000)) + 0.015 * pos(taxable - (m ? 400000 : 250000)) + (taxable > (m ? 40000 : 20000) ? (m ? 100 : 50) : 0);
  },
  // Baltimore City local income tax 3.20% of Maryland taxable income.
  'MD-COUNTY': (g, { hh }) => 0.032 * mdTaxable(g, hh),
};

function usTax(g, j, hh) {
  const fs = usFs(hh);
  const fica = 0.062 * min(g, US_SS_BASE_2026) + 0.0145 * g + 0.009 * pos(g - US_ADDL_MEDICARE[fs]);
  if (j.region && !US_STATE[j.region]) throw new Error(`no US state tax rule for ${j.region}`);
  if (j.local && !US_LOCAL[j.local]) throw new Error(`no US local tax rule for ${j.local}`);
  const sub = (fedTax, fedDeduction) => {
    const st = j.region ? US_STATE[j.region](g, { hh, fedTax, fedDeduction }) : { regional: 0 };
    const local = j.local ? US_LOCAL[j.local](g, { hh, taxable: st.taxable ?? g }) : 0;
    const regional = (st.regional || 0) + local;
    return { regional, social: st.social || 0, salt: regional + (st.deductible || 0) };
  };
  // Federal deduction: the larger of the standard deduction and itemizing the state and local
  // income taxes (plus the state disability / paid-leave contributions Schedule A counts as
  // such) up to the SALT cap. Alabama and Oregon subtract the federal tax, so iterate to a
  // fixed point (two or three passes).
  let deduction = US_STD_2026[fs];
  let income = usFederalIncomeTax(g, hh, deduction);
  let s = sub(income, deduction);
  for (let i = 0; i < 5; i++) {
    const next = Math.max(US_STD_2026[fs], min(s.salt, usSaltCap(g)));
    if (Math.abs(next - deduction) < 0.005) break;
    deduction = next;
    income = usFederalIncomeTax(g, hh, deduction);
    s = sub(income, deduction);
  }
  return { income, regional: s.regional, social: fica + s.social };
}

// ---- Other countries ------------------------------------------------------------------------
// United Kingdom 2026/27: bands on income after the personal allowance (£12,570, withdrawn £1
// per £2 over £100,000). Scotland 2026/27: starter 19% to £16,537, basic 20% to £29,526,
// intermediate 21% to £43,662, higher 42% to £75,000, advanced 45% to £125,140, top 48%.
const GB_RUK = [[37700, 0.20], [125140, 0.40], [INF, 0.45]];
const GB_SCT = [[3967, 0.19], [16956, 0.20], [31092, 0.21], [62430, 0.42], [125140, 0.45], [INF, 0.48]];

// Switzerland, direct federal tax 2026 (ESTV, art. 36 DBG): [threshold, tax at threshold, rate
// on the excess]; from the last threshold the flat rate applies to the whole income.
const CH_FED_SINGLE = { steps: [[15200, 0, 0.0077], [33200, 138.6, 0.0088], [43500, 229.2, 0.0264], [58000, 612, 0.0297], [76200, 1152.5, 0.0594], [82100, 1502.95, 0.066], [108900, 3271.75, 0.088], [141500, 6140.55, 0.11], [185100, 10936.55, 0.132]], flatFrom: 794000, flat: 0.115 };
const CH_FED_MARRIED = { brackets: [[29700, 0], [53400, 0.01], [61300, 0.02], [79100, 0.03], [94900, 0.04], [108700, 0.05], [120600, 0.06], [130500, 0.07], [138400, 0.08], [144300, 0.09], [148300, 0.10], [150400, 0.11], [152400, 0.12], [INF, 0.13]], flatFrom: 941400, flat: 0.115 };
function chFederalTax(ti, married, kids) {
  if (!married) {
    if (ti >= CH_FED_SINGLE.flatFrom) return CH_FED_SINGLE.flat * ti;
    let tax = 0;
    for (const [from, base, rate] of CH_FED_SINGLE.steps) if (ti > from) tax = base + rate * (ti - from);
    return tax;
  }
  const tax = ti >= CH_FED_MARRIED.flatFrom ? CH_FED_MARRIED.flat * ti : progressive(ti, CH_FED_MARRIED.brackets);
  return pos(tax - 263 * kids); // art. 36 al. 2bis DBG: CHF 263 less per child
}
// Canton of Zurich 2026 (Kantonsblatt ZH, Stand Februar 2026): einfache Staatssteuer, Grundtarif
// and Verheiratetentarif (§ 35 StG, indexed 2026), times the cantonal Steuerfuss (95%, Kantonsrat
// 15 Dec 2025) plus the City of Zurich Steuerfuss (119%; church tax is optional and excluded).
const ZH_GRUND = [[7000, 0], [12000, 0.02], [16800, 0.03], [24800, 0.04], [34500, 0.05], [45700, 0.06], [58800, 0.07], [76400, 0.08], [110400, 0.09], [144100, 0.10], [197400, 0.11], [266700, 0.12], [INF, 0.13]];
const ZH_VERH = [[14100, 0], [20500, 0.02], [28600, 0.03], [38400, 0.04], [49600, 0.05], [64100, 0.06], [96300, 0.07], [128700, 0.08], [177200, 0.09], [235100, 0.10], [298000, 0.11], [370600, 0.12], [INF, 0.13]];
const ZH_STEUERFUSS = { canton: 0.95, city: 1.19 };
// Geneva: no cantonal schedule has been re-derived yet, so Geneva keeps the earlier combined
// federal + cantonal + communal marginal schedule calibrated to the cantonal calculator.
const CH_GE_COMBINED = [[17000, 0], [25000, 0.08], [40000, 0.14], [60000, 0.21], [90000, 0.27], [130000, 0.32], [200000, 0.37], [300000, 0.41], [INF, 0.445]];

// Germany 2026: § 32a EStG tariff (zones as linearly rising marginal rates).
const DE_2026 = [[12348, 0], [17799, 0.14, 0.2397], [69878, 0.2397, 0.42], [277825, 0.42], [INF, 0.45]];

// France: barème for 2025 income (loi de finances 2026, latest enacted), per part.
const FR_BAREME = [[11600, 0], [29579, 0.11], [84577, 0.30], [181917, 0.41], [INF, 0.45]];
const FR_PASS_2026 = 48060;

// Spain: state scale (art. 63 LIRPF) and the regional scales; each applies to the general base
// with the personal and family minimum taxed at 0 (cuota on the minimum is subtracted).
const ES_STATE = [[12450, 0.095], [20200, 0.12], [35200, 0.15], [60000, 0.185], [300000, 0.225], [INF, 0.245]];
const ES_REGIONAL = {
  MD: [[13362.22, 0.085], [19004.63, 0.107], [35425.68, 0.128], [57320.40, 0.174], [INF, 0.205]],
  CT: [[12500, 0.095], [22000, 0.125], [33000, 0.16], [53000, 0.19], [90000, 0.215], [120000, 0.235], [175000, 0.245], [INF, 0.255]],
};

// Canada 2026: federal (T4127, January 2026, Table 8.1) and provincial schedules.
const CA_FED_2026 = [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [INF, 0.33]];
/** Federal basic personal amount 2026: $16,452, falling to $14,829 between $181,440 and $258,482. */
function caBpaf(ni) {
  if (ni <= 181440) return 16452;
  if (ni >= 258482) return 14829;
  return 16452 - ((ni - 181440) * 1623) / 77042;
}
function caPayroll(g, qc) {
  const pens = qc ? 0.063 : 0.0595;
  const base = pens * pos(min(g, 74600) - 3500);
  const second = 0.04 * pos(min(g, 85000) - 74600);
  const ei = (qc ? 0.013 : 0.0163) * min(g, 68900);
  const qpip = qc ? 0.0043 * min(g, 103000) : 0;
  // Credit base: the base-rate part of CPP/QPP (4.95% / 5.3%) plus EI/QPIP; the enhanced part is
  // a deduction from income.
  const creditable = base * ((qc ? 0.053 : 0.0495) / pens) + ei + qpip;
  const deductible = base - base * ((qc ? 0.053 : 0.0495) / pens) + second;
  return { social: base + second + ei + qpip, creditable, deductible };
}
/** Ontario Health Premium (T4127 2026, factor V2) on taxable income. */
function onHealthPremium(a) {
  if (a <= 20000) return 0;
  if (a <= 36000) return min(300, 0.06 * (a - 20000));
  if (a <= 48000) return min(450, 300 + 0.06 * (a - 36000));
  if (a <= 72000) return min(600, 450 + 0.25 * (a - 48000));
  if (a <= 200000) return min(750, 600 + 0.25 * (a - 72000));
  return min(900, 750 + 0.25 * (a - 200000));
}
const CA_PROV = {
  ON: (ti, credit) => {
    const basic = pos(progressive(ti, [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [INF, 0.1316]]) - 0.0505 * (12989 + credit));
    const surtax = 0.2 * pos(basic - 5818) + 0.36 * pos(basic - 7446);
    return basic + surtax + onHealthPremium(ti);
  },
  // British Columbia 2026 (gov.bc.ca, updated April 2026): lowest rate 5.60% (Budget 2026), credits
  // at the lowest rate, basic personal amount $13,216.
  BC: (ti, credit) => pos(progressive(ti, [[50363, 0.056], [100728, 0.077], [115648, 0.105], [140430, 0.1229], [190405, 0.147], [265545, 0.168], [INF, 0.205]]) - 0.056 * (13216 + credit)),
  QC: (ti, credit) => pos(progressive(ti, [[53255, 0.14], [106495, 0.19], [129590, 0.24], [INF, 0.2575]]) - 0.14 * (18571 + credit)),
};

// Japan (NTA No. 1410 and No. 1199, 2026 law): employment income deduction and basic deduction.
function jpEmploymentDeduction(g) {
  if (g <= 2.2e6) return min(g, 740000);
  if (g <= 3.6e6) return g * 0.3 + 80000;
  if (g <= 6.6e6) return g * 0.2 + 440000;
  if (g <= 8.5e6) return g * 0.1 + 1100000;
  return 1950000;
}
function krEmploymentDeduction(g) {
  if (g <= 5e6) return 0.7 * g;
  if (g <= 15e6) return 3.5e6 + 0.4 * (g - 5e6);
  if (g <= 45e6) return 7.5e6 + 0.15 * (g - 15e6);
  if (g <= 100e6) return 12e6 + 0.05 * (g - 45e6);
  return min(20e6, 14.75e6 + 0.02 * (g - 100e6));
}
function auLito(g) {
  if (g <= 37500) return 700;
  if (g <= 45000) return 700 - 0.05 * (g - 37500);
  if (g <= 66667) return 325 - 0.015 * (g - 45000);
  return 0;
}
/** Netherlands 2026 arbeidskorting (labour tax credit), Belastingdienst table. */
function nlLabourCredit(g) {
  if (g <= 11965) return 0.08324 * g;
  if (g <= 25845) return 996 + 0.31009 * (g - 11965);
  if (g <= 45592) return 5300 + 0.0195 * (g - 25845);
  return pos(5685 - 0.0651 * (g - 45592));
}

/** Country rules: (grossLocal, jurisdiction, household) -> { income, regional, social }. */
const RULES = {
  US: usTax,
  GB(g, j) {
    const allowance = pos(12570 - pos(g - 100000) / 2);
    const income = progressive(pos(g - allowance), j.region === 'SCT' ? GB_SCT : GB_RUK);
    const social = 0.08 * pos(min(g, 50270) - 12570) + 0.02 * pos(g - 50270);
    return { income, social };
  },
  IE(g, j, hh) {
    // Revenue 2026: 20% band €44,000 (married, one income: €53,000), personal credit €2,000
    // (married €4,000) + employee credit €2,000; USC; PRSI Class A 4.2% to 30 Sep, 4.35% from 1 Oct.
    const band = hh.married ? 53000 : 44000;
    const paye = pos(0.2 * min(g, band) + 0.4 * pos(g - band) - (hh.married ? 4000 : 2000) - 2000);
    const usc = progressive(g, [[12012, 0.005], [28700, 0.02], [70044, 0.03], [INF, 0.08]]);
    return { income: paye + usc, social: ((0.042 * 9 + 0.0435 * 3) / 12) * g };
  },
  CH(g, j, hh) {
    // Employee AHV/IV/EO 5.3%, ALV 1.1% to CHF 148,200, non-occupational accident ~1% to 148,200
    // (insurer-specific); 2nd-pillar contributions are excluded and not deducted.
    const social = 0.053 * g + 0.011 * min(g, 148200) + 0.01 * min(g, 148200);
    if (j.region === 'GE') {
      const taxable = pos(g - social - min(4000, 0.03 * g) - 2900);
      return { income: progressive(taxable, CH_GE_COMBINED), social, singleOnly: true };
    }
    const net = g - social;
    const work = min(4000, Math.max(2000, 0.03 * net)); // Berufskosten flat rate (DBG and ZH)
    const m = hh.married;
    const fedTi = pos(net - work - (m ? 3700 : 1800) - 700 * hh.kids - 6800 * hh.kids - (m ? 2800 : 0));
    const zhTi = pos(net - work - (m ? 5800 : 2900) - 1300 * hh.kids - 9400 * hh.kids);
    const simple = progressive(zhTi, m ? ZH_VERH : ZH_GRUND);
    return { income: chFederalTax(fedTi, m, hh.kids), regional: simple * (ZH_STEUERFUSS.canton + ZH_STEUERFUSS.city), social };
  },
  DE(g, j, hh) {
    const pension = 0.093 * min(g, 101400);
    const unemployment = 0.013 * min(g, 101400);
    const health = 0.0875 * min(g, 69750); // 7.3% + half of the 2.9% average Zusatzbeitrag
    const care = (hh.kids ? 0.018 : 0.024) * min(g, 69750); // 0.6-point surcharge for the childless
    const zvE = pos(g - 1230 - pension - 0.96 * (health + care));
    const split = hh.married ? 2 : 1; // § 32a (5) EStG splitting
    const tariff = (x) => split * progressive(x / split, DE_2026);
    const est = tariff(zvE);
    // Children: Kinderfreibetrag €6,828 + BEA €2,928 per child, or Kindergeld €259/month,
    // whichever is worth more (Günstigerprüfung); counted net of the Kindergeld.
    const estFB = tariff(pos(zvE - 9756 * hh.kids));
    const income = hh.kids ? pos(est - Math.max(est - estFB, 12 * 259 * hh.kids)) : est;
    const free = 20350 * split; // SolZG § 3 Freigrenze; base is the tax after Kinderfreibeträge
    const soli = estFB > free ? min(0.055 * estFB, 0.119 * (estFB - free)) : 0;
    return { income: income + soli, social: pension + unemployment + health + care };
  },
  FR(g, j, hh) {
    // Employee contributions 2026 (URSSAF, AGIRC-ARRCO): old age 6.90% to the PASS + 0.40%;
    // AGIRC-ARRCO 3.15% (T1) / 8.64% (T2 to 8 PASS), CEG 0.86% / 1.08%, CET 0.14%; APEC 0.024%
    // to 4 PASS; CSG 9.2% + CRDS 0.5% on 98.25% of pay up to 4 PASS and 100% above.
    const P = FR_PASS_2026;
    const t1 = min(g, P);
    const t2 = pos(min(g, 8 * P) - P);
    const csgBase = 0.9825 * min(g, 4 * P) + pos(g - 4 * P);
    const social = 0.069 * t1 + 0.004 * g + 0.0315 * t1 + 0.0864 * t2 + 0.0086 * t1 + 0.0108 * t2
      + (g > P ? 0.0014 * (t1 + t2) : 0) + 0.00024 * min(g, 4 * P) + 0.097 * csgBase;
    // Taxable pay adds back the non-deductible CSG (2.4%) and CRDS (0.5%); 10% professional
    // deduction capped at €14,555.
    let taxable = g - social + 0.029 * csgBase;
    taxable = pos(taxable - min(0.1 * taxable, 14555));
    // Quotient familial: 1 part single, 2 married, +½ per child for the first two; the gain from
    // the children's half-parts is capped at €1,807 each.
    const baseParts = hh.married ? 2 : 1;
    const halfParts = min(hh.kids, 2);
    const ir = (parts) => parts * progressive(taxable / parts, FR_BAREME);
    const irBase = ir(baseParts);
    const income = halfParts ? Math.max(ir(baseParts + 0.5 * halfParts), irBase - 1807 * halfParts) : irBase;
    // Contribution exceptionnelle sur les hauts revenus: 3% / 4% over €250K / €500K (couples x2).
    const c = hh.married ? 2 : 1;
    const cehr = 0.03 * pos(min(taxable, 500000 * c) - 250000 * c) + 0.04 * pos(taxable - 500000 * c);
    return { income: income + cehr, social };
  },
  NL(g) {
    const box1 = progressive(g, [[38883, 0.3575], [78426, 0.3756], [INF, 0.495]]);
    const general = pos(3115 - 0.06398 * pos(g - 29736));
    return { income: pos(box1 - general - nlLabourCredit(g)) };
  },
  ES(g, j) {
    // Employee social security 2026: 4.70% + 1.55% + 0.10% + MEI 0.15% up to €61,214.40;
    // work income less contributions and the €2,000 general deduction; personal minimum €5,550.
    const social = 0.065 * min(g, 61214.4);
    const base = pos(g - social - 2000);
    const cuota = (sched) => pos(progressive(base, sched) - progressive(5550, sched));
    return { income: cuota(ES_STATE), regional: cuota(ES_REGIONAL[j.region] || ES_STATE), social };
  },
  PT(g) {
    const social = 0.11 * g;
    const taxable = pos(g - Math.max(4462.15, social));
    const irs = progressive(taxable, [[8342, 0.125], [12587, 0.157], [17838, 0.212], [23089, 0.241], [29397, 0.311], [43090, 0.349], [46566, 0.431], [86634, 0.446], [INF, 0.48]]);
    const solidarity = 0.025 * pos(min(taxable, 250000) - 80000) + 0.05 * pos(taxable - 250000);
    return { income: irs + solidarity, social };
  },
  IT(g) {
    const social = 0.0919 * min(g, 120607);
    const taxable = pos(g - social);
    const irpef = progressive(taxable, [[28000, 0.23], [50000, 0.33], [INF, 0.43]]);
    const regional = progressive(taxable, [[15000, 0.0123], [28000, 0.0158], [50000, 0.0172], [INF, 0.0173]]) + 0.008 * taxable;
    return { income: irpef, regional, social };
  },
  AT(g) {
    const social = 0.1807 * min(g, 90300);
    const net = pos(g - social);
    const regular = progressive((net * 12) / 14, [[13539, 0], [21992, 0.2], [36458, 0.3], [70365, 0.4], [104859, 0.48], [1e6, 0.5], [INF, 0.55]]);
    const bonus = 0.06 * pos((net * 2) / 14 - 620);
    return { income: regular + bonus, social };
  },
  BE(g) {
    const social = 0.1307 * g;
    const net = g - social;
    const taxable = pos(net - min(0.3 * net, 5930));
    const income = pos(progressive(taxable, [[16320, 0.25], [28800, 0.40], [49840, 0.45], [INF, 0.50]]) - 0.25 * 10910);
    return { income, regional: 0.07 * income, social };
  },
  SE(g) {
    const taxable = pos(g - 17400);
    const municipal = 0.3055 * taxable;
    const state = 0.2 * pos(taxable - 643000);
    const jobCredit = min(56000, 0.11 * g, municipal);
    return { income: state, regional: municipal - jobCredit };
  },
  DK(g) {
    const am = 0.08 * g;
    const base = g - am;
    const allowance = 54100;
    const employment = min(0.1275 * base, 63300);
    const municipal = 0.2339 * pos(base - allowance - employment);
    const state = 0.1201 * pos(base - allowance) + 0.075 * pos(base - 641200) + 0.075 * pos(base - 777900) + 0.05 * pos(base - 2592700);
    return { income: state, regional: municipal, social: am };
  },
  NO(g) {
    const ordinary = pos(g - min(0.46 * g, 92000) - 108550);
    const bracket = progressive(g, [[226100, 0], [318300, 0.017], [725050, 0.04], [980100, 0.137], [1467200, 0.168], [INF, 0.178]]);
    return { income: 0.22 * ordinary + bracket, social: 0.076 * g };
  },
  FI(g) {
    const social = 0.09 * g;
    const taxable = pos(g - social - 750);
    return { income: progressive(taxable, [[21200, 0.053], [31500, 0.179], [52100, 0.243], [88200, 0.356], [150000, 0.393], [INF, 0.443]]), social };
  },
  PL(g) {
    const zus = 0.1126 * min(g, 282600) + 0.0245 * g;
    const health = 0.09 * pos(g - zus);
    const taxable = pos(g - zus - 3000);
    return { income: pos(progressive(taxable, [[120000, 0.12], [INF, 0.32]]) - 3600), social: zus + health };
  },
  CZ(g) {
    const social = 0.071 * min(g, 2350416) + 0.045 * g;
    return { income: pos(progressive(g, [[1762812, 0.15], [INF, 0.23]]) - 30840), social };
  },
  EE(g) {
    const social = 0.016 * g;
    return { income: 0.22 * pos(g - social - 8400), social };
  },
  IL(g) {
    // Bituach Leumi + health 2026: 4.27% up to NIS 7,703 a month, 12.17% up to NIS 51,910.
    const social = 0.0427 * min(g, 92436) + 0.1217 * pos(min(g, 622920) - 92436);
    const income = pos(progressive(g, [[84120, 0.10], [120720, 0.14], [193800, 0.20], [269280, 0.31], [560280, 0.35], [721560, 0.47], [INF, 0.50]]) - 6534);
    return { income, social };
  },
  AE: () => ({}),
  SA: () => ({}),
  JP(g) {
    const total = g - jpEmploymentDeduction(g);
    const social = 0.04955 * min(g, 16680000) + 0.0915 * min(g, 7800000) + 0.0055 * g;
    const basic = total <= 23.5e6 ? 620000 : total <= 24e6 ? 480000 : total <= 24.5e6 ? 320000 : total <= 25e6 ? 160000 : 0;
    const residentBasic = total <= 24e6 ? 430000 : total <= 24.5e6 ? 290000 : total <= 25e6 ? 150000 : 0;
    const income = 1.021 * progressive(pos(total - social - basic), [[1950000, 0.05], [3300000, 0.10], [6950000, 0.20], [9000000, 0.23], [18000000, 0.33], [40000000, 0.40], [INF, 0.45]]);
    const regional = 0.1 * pos(total - social - residentBasic) + 5000;
    return { income, regional, social };
  },
  KR(g) {
    const nps = 0.0475 * min(g, 76440000);
    const nhi = 0.03595 * g;
    const ltc = nhi * 0.1314;
    const ei = 0.009 * g;
    const taxable = pos(g - krEmploymentDeduction(g) - 1.5e6 - nps - nhi - ltc - ei);
    const income = pos(progressive(taxable, [[14e6, 0.06], [50e6, 0.15], [88e6, 0.24], [150e6, 0.35], [300e6, 0.38], [500e6, 0.40], [1e9, 0.42], [INF, 0.45]]) - 500000);
    return { income, regional: 0.1 * income, social: nps + nhi + ltc + ei };
  },
  SG(g) {
    return { income: progressive(pos(g - 1000), [[20000, 0], [30000, 0.02], [40000, 0.035], [80000, 0.07], [120000, 0.115], [160000, 0.15], [200000, 0.18], [240000, 0.19], [280000, 0.195], [320000, 0.20], [500000, 0.22], [1e6, 0.23], [INF, 0.24]]) };
  },
  HK(g, j, hh) {
    // 2026/27 allowances (from the gov.hk standard-rate zone table): basic $145,000, married
    // $290,000, $140,000 per child. MPF (funded, 5% capped at $18,000) is deducted.
    const net = pos(g - min(18000, 0.05 * g));
    const allowances = (hh.married ? 290000 : 145000) + 140000 * hh.kids;
    const prog = progressive(pos(net - allowances), [[50000, 0.02], [100000, 0.06], [150000, 0.10], [200000, 0.14], [INF, 0.17]]);
    const standard = 0.15 * min(net, 5e6) + 0.16 * pos(net - 5e6);
    return { income: min(prog, standard) };
  },
  TW(g) {
    const social = 0.025 * min(g, 549600) + 0.0155 * min(g, 2634000);
    return { income: progressive(pos(g - 446000), [[590000, 0.05], [1330000, 0.12], [2660000, 0.20], [4980000, 0.30], [INF, 0.40]]), social };
  },
  IN(g, j) {
    const taxable = pos(g - 75000);
    let slab = taxable <= 1200000 ? 0 : progressive(taxable, [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [INF, 0.30]]);
    if (taxable > 1200000) slab = min(slab, taxable - 1200000); // marginal relief just above the rebate limit
    const surcharge = taxable > 2e7 ? 0.25 : taxable > 1e7 ? 0.15 : taxable > 5e6 ? 0.10 : 0;
    return { income: slab * (1 + surcharge) * 1.04, regional: j.local === 'PROF-TAX' ? 2500 : 0 };
  },
  AU(g) {
    const income = pos(progressive(g, [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [INF, 0.45]]) - auLito(g));
    return { income, social: 0.02 * g };
  },
  NZ(g) {
    return { income: progressive(g, [[15600, 0.105], [53500, 0.175], [78100, 0.30], [180000, 0.33], [INF, 0.39]]), social: 0.0167 * min(g, 152790) };
  },
  CA(g, j) {
    const qc = j.region === 'QC';
    const { social, creditable, deductible } = caPayroll(g, qc);
    const ti = pos(g - deductible); // enhanced CPP/QPP contributions are deducted from income
    let income = pos(progressive(ti, CA_FED_2026) - 0.14 * (caBpaf(ti) + 1501 + creditable));
    if (qc) income *= 1 - 0.165; // Quebec abatement
    const prov = CA_PROV[j.region];
    if (j.region && !prov) throw new Error(`no Canadian province tax rule for ${j.region}`);
    return { income, regional: prov ? prov(ti, creditable) : 0, social };
  },
  MX(g) {
    const income = progressive(g, [[8952.49, 0.0192], [75984.55, 0.064], [133536.07, 0.1088], [155229.80, 0.16], [185852.57, 0.1792], [374837.88, 0.2136], [590795.99, 0.2352], [1127926.84, 0.30], [1503902.46, 0.32], [4511707.37, 0.34], [INF, 0.35]]);
    return { income, social: 0.02775 * min(g, 1070454) };
  },
  BR(g, j, hh) {
    // 2026 monthly tables (Receita Federal, INSS) x 12 (13th salary not modeled): INSS 7.5% to
    // 14% up to R$8,475.55; IRPF after INSS and R$189.59 per dependent (spouse and children).
    const m = g / 12;
    const inss = progressive(min(m, 8475.55), [[1621, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]]);
    const dependents = (hh.married ? 1 : 0) + hh.kids;
    const irpf = progressive(pos(m - inss - 189.59 * dependents), [[2428.8, 0], [2826.65, 0.075], [3751.05, 0.15], [4664.68, 0.225], [INF, 0.275]]);
    return { income: irpf * 12, social: inss * 12 };
  },
};

/**
 * Where each rule comes from. verified: every value the rule uses was read from the official
 * source(s) in url / checkedVia by the 2026-10-10 review (docs/process/juice-tax.md);
 * unverified: values the rule uses that could not be read from an official source (kept as
 * they were); notModeled: known parts of the system the rule leaves out; approximate: a
 * simplified model; estimated: a calibrated schedule, not the statutory computation.
 */
const NYS = 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf';
const REVIEWED = '2026-10-10';
export const TAX_SOURCES = Object.freeze({
  US: { name: 'IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction $16,100 / $32,200, child tax credit $2,200); IRC §164(b)(7) SALT cap $40,400 phased down over $505,000 MAGI (floor $10,000); Pub. 15 (2026) Social Security 6.2% to $184,500, Medicare 1.45% + 0.9% over $200,000 / $250,000', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', checkedVia: ['https://www.irs.gov/pub/irs-pdf/p15.pdf', 'https://www.irs.gov/taxtopics/tc560', 'https://www.law.cornell.edu/uscode/text/26/164', 'https://www.irs.gov/pub/irs-pdf/i1040sca.pdf', 'https://www.irs.gov/pub/irs-pdf/i1040s8.pdf'], asOf: '2026', reviewed: REVIEWED, verified: true, notModeled: ['refundable part of the child tax credit', 'itemized deductions other than state and local income taxes', 'alternative minimum tax'] },
  'US-CA': { name: 'California FTB 2025 tax rate schedules X / Y (latest published; EDD 2026 withholding uses the same brackets), standard deduction $5,706 / $11,412, exemption credit $153 cut $6 per $2,500 over $252,203 / $504,411 AGI, Behavioral Health Services Tax 1% over $1M; SDI 1.3% of all wages (2026)', url: 'https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf', checkedVia: ['https://www.ftb.ca.gov/forms/2025/2025-540-booklet.pdf', 'https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf', 'https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/'], asOf: '2025 (brackets) / 2026 (SDI)', reviewed: REVIEWED, verified: false, unverified: ['personal exemption credit amount $153 (printed on Form 540, not in the booklet text)'], notModeled: ['dependent exemption credit (amount not verified)', 'alternative minimum tax'] },
  'US-NY': { name: 'New York State 2026 (IT-2105-I): rates, tax-benefit recapture worksheets, standard deduction $8,000 / $16,050, $1,000 per dependent; Paid Family Leave 0.432% to $411.91; disability benefits $0.60 a week', url: NYS, checkedVia: ['https://www.tax.ny.gov/pdf/2025/inc/it201i_2025.pdf'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['Paid Family Leave 0.432% / $411.91 (secondary source; DFS page blocked)', 'disability benefits 0.5% up to $0.60 a week'], notModeled: ['Empire State child credit'] },
  'US-WA': { name: 'No income tax on wages; WA Cares 0.58% of all wages; Paid Family and Medical Leave 1.13% (employee 71.43%)', url: 'https://wacaresfund.wa.gov/employers/', checkedVia: ['https://esd.wa.gov/node/1109', 'https://paidleave.wa.gov/employers/'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['PFML wage cap taken as the Social Security wage base'] },
  'US-TX': { name: 'No state income tax on wages (Texas Constitution art. 8 §24-a)', url: 'https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['constitution text did not render for the probe'] },
  'US-FL': { name: 'No state income tax on wages (Florida Constitution art. VII §5(a))', url: 'https://www.leg.state.fl.us/statutes/index.cfm?submenu=3', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-TN': { name: 'No state income tax on wages (Hall tax repealed from 2021; Tennessee Constitution art. II §28)', url: 'https://www.capitol.tn.gov/about/docs/TN-Constitution.pdf', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['tn.gov and the constitution PDF were not readable from the probe'] },
  'US-NV': { name: 'No state income tax on wages (Nevada Constitution art. 10 §1(9))', url: 'https://www.leg.state.nv.us/const/nvconst.html', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-MA': { name: 'Massachusetts Form 1 (2025): 5% after the personal exemption $4,400 / $8,800, $1,000 per dependent and up to $2,000 of FICA; 4% surtax over $1,107,750 (2026 Form 1-ES); PFML employee 0.46% to the Social Security wage base', url: 'https://www.mass.gov/doc/2025-form-1-instructions/download', checkedVia: ['https://www.mass.gov/doc/2026-form-1-es-estimated-tax-payment-vouchers-instructions-and-worksheets/download'], asOf: '2025 / 2026 (surtax)', reviewed: REVIEWED, verified: false, unverified: ['PFML employee share 0.46% (secondary source; mass.gov rate page blocked)'] },
  'US-GA': { name: 'Georgia HB 463: 4.99% for 2026, standard deduction $15,000 / $30,000, $5,000 per dependent', url: 'https://www.legis.ga.gov/api/legislation/document/20252026/249080', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-DC': { name: 'District of Columbia 4%-10.75% (tax years after 2021, all filing statuses); standard deduction $15,000 / $30,000', url: 'https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates', asOf: '2025', reviewed: REVIEWED, verified: false, unverified: ['standard deduction $15,000 / $30,000 (secondary source)'] },
  'US-AL': { name: 'Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax deduction, standard deduction chart ($2,500 / $5,000 from $35,500 AGI), personal exemption $1,500 / $3,000, dependents $1,000 / $500 / $300 (Huntsville: no occupational tax)', url: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf', asOf: '2025', reviewed: REVIEWED, verified: false, unverified: ['rate brackets ($500 / $3,000 single, $1,000 / $6,000 joint) not re-read'] },
  'US-OH': { name: 'Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 on); ORC 5747.025 personal exemptions, none from $500,000 MAGI in 2026', url: 'https://codes.ohio.gov/ohio-revised-code/section-5747.02', checkedVia: ['https://codes.ohio.gov/ohio-revised-code/section-5747.025', 'https://tax.ohio.gov/static/forms/ohio_individual/individual/2025/it1040-booklet.pdf'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['2026 indexed exemption amounts (2025 values $2,400 / $2,150 / $1,900 used)'] },
  'US-VA': { name: 'Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,750 / $17,500 (2025 and 2026), $930 per exemption', url: 'https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-IL': { name: 'Illinois 4.95%, exemption $2,925 per person for 2026 (IL-700-T), none above $250,000 / $500,000 AGI', url: 'https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf', checkedVia: ['https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/incometax/documents/currentyear/individual/il-1040-instr.pdf'], asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-CO': { name: 'Colorado 4.4% of federal taxable income (2025 rate); state income tax addback (an itemizer keeps the standard deduction); deduction capped at $1,000 / $2,000 above $300,000 AGI from 2026', url: 'https://tax.colorado.gov/individual-income-tax-guide', checkedVia: ['https://tax.colorado.gov/sites/tax/files/documents/ITT_State_Income_Tax_Addback_Nov_2025.pdf', 'https://tax.colorado.gov/sites/tax/files/documents/DR0104_2025.pdf'], asOf: '2025 (rate) / 2026 (addback)', reviewed: REVIEWED, verified: true, notModeled: ['FAMLI paid-leave premium (0.45% employee, page blocked)', 'Denver occupational privilege tax'] },
  'US-PA': { name: 'Pennsylvania 3.07% of compensation; unemployment compensation employee withholding 0.07%', url: 'https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['UC employee rate 0.07%'] },
  'US-NC': { name: 'North Carolina 3.99% (2026), standard deduction $12,750 / $25,500, child deduction table (D-401)', url: 'https://www.ncdor.gov/taxes-forms/individual-income-tax', checkedVia: ['https://www.ncdor.gov/2025-d-401-individual-income-tax-instructions/open'], asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-OR': { name: 'Oregon 2026 withholding formulas: 4.75%-9.9%, standard deduction $2,910 / $5,820, federal tax subtraction (max $8,750, phased out from $125,000 / $250,000), exemption credit $263; statewide transit tax 0.1%; Paid Leave Oregon 1% (employee 60%)', url: 'https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf', checkedVia: ['https://www.oregon.gov/dor/programs/businesses/Pages/Statewide-Transit-Tax.aspx', 'https://paidleave.oregon.gov/employers/'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['Paid Leave employee share 60% (secondary source)'] },
  'US-UT': { name: 'Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of the federal standard deduction + $2,111 per dependent, cut 1.3% over $18,213 / $36,426)', url: 'https://tax.utah.gov/forms/current/tc-40inst.pdf', asOf: '2025', reviewed: REVIEWED, verified: true, notModeled: ['any 2026 rate change'] },
  'US-AZ': { name: 'Arizona Form 140 (2025): 2.5%, standard deduction $15,750 / $31,500, $100 dependent credit', url: 'https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2025_140i.pdf', asOf: '2025', reviewed: REVIEWED, verified: true },
  'US-MN': { name: 'Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $30,600, dependent exemption $5,300; Paid Leave 0.88% (half from the employee)', url: 'https://www.revenue.state.mn.us/mndor-pp/21641', checkedVia: ['https://paidleave.mn.gov/employers/premiums'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['Paid Leave employee share 0.44%'], notModeled: ['standard deduction phase-out at high income'] },
  'US-MI': { name: 'Michigan 4.25%, personal exemption $5,900 per person (2026 withholding data)', url: 'https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Tax-Interest-Calculator/2026WithholdingtaxinfoJson.json', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-MD': { name: 'Maryland 2025 (Budget Reconciliation and Financing Act 2025): 2%-6.5% with 6.25% / 6.5% top brackets, standard deduction $3,350 / $6,700', url: 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php', asOf: '2025', reviewed: REVIEWED, verified: false, unverified: ['brackets below $500,000 / $600,000 (assumed unchanged)'], notModeled: ['personal exemptions ($3,200 phased out above $100,000, not verified)'] },
  'US-LOCAL-NYC': { name: 'New York City resident tax 3.078%-3.876% on NYS taxable income, NYC school tax credit (IT-2105-I 2026)', url: NYS, asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-LOCAL-COLUMBUS': { name: 'Columbus, OH city income tax 2.5% (IR-25 instructions)', url: 'https://www.columbus.gov/files/sharedassets/city/v/4/city-auditor/tax-forms/individuals/2024-ir-25-instructions.pdf', asOf: '2024', reviewed: REVIEWED, verified: true },
  'US-LOCAL-PHILADELPHIA': { name: 'Philadelphia resident wage tax 3.74% to 30 June 2026, 3.735% from 1 July 2026 (calendar-year average)', url: 'https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax-employers/', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-LOCAL-PITTSBURGH': { name: 'Pittsburgh earned income tax 3% (city 1% + school district 2%) and $52 Local Services Tax', url: 'https://www.pittsburghpa.gov/finance/tax-descriptions', asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-LOCAL-DETROIT': { name: 'Detroit resident city income tax 2.4%, $600 exemption per person', url: 'https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax', checkedVia: ['https://finance.umich.edu/sites/default/files/2026-01/2026%20Figuring%20Your%20Taxes.pdf'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['rate and exemption from a university payroll guide (detroitmi.gov blocked)'] },
  'US-LOCAL-PORTLAND': { name: 'Portland area 2026: Metro supportive housing 1% over $128,000 / $205,000, Multnomah preschool 1.5% over $125,000 / $200,000 + 1.5% over $250,000 / $400,000 (Oregon taxable income), arts tax $50', url: 'https://www.portland.gov/revenue/personal-tax', checkedVia: ['https://www.portland.gov/revenue/arts-tax'], asOf: '2026', reviewed: REVIEWED, verified: true },
  'US-LOCAL-MD-COUNTY': { name: 'Maryland local income tax, Baltimore City 3.2% of Maryland taxable income', url: 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php', asOf: '2025', reviewed: REVIEWED, verified: false, unverified: ['Baltimore City rate 3.20% (Comptroller page renders client-side)'] },
  GB: { name: 'HMRC 2026/27: personal allowance £12,570 (tapered over £100,000), 20% / 40% / 45% (£37,700 / £125,140); employee Class 1 NICs 8% from £12,570 to £50,270, 2% above', url: 'https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past', checkedVia: ['https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027'], asOf: '2026/27', reviewed: REVIEWED, verified: true },
  'GB-SCT': { name: 'Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / 48% (bands to £16,537 / £29,526 / £43,662 / £75,000 / £125,140)', url: 'https://www.gov.uk/scottish-income-tax', asOf: '2026/27', reviewed: REVIEWED, verified: true },
  IE: { name: 'Revenue 2026: 20% to €44,000 (married, one income: €53,000) then 40%, personal credit €2,000 (married €4,000) + employee credit €2,000; USC 0.5% / 2% / 3% / 8%; PRSI Class A 4.2% to 30 Sep 2026, 4.35% from 1 Oct', url: 'https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx', checkedVia: ['https://www.revenue.ie/en/jobs-and-pensions/usc/standard-rates-thresholds.aspx', 'https://www.citizensinformation.ie/en/social-welfare/irish-social-welfare-system/social-insurance-prsi/paying-social-insurance/'], asOf: '2026', reviewed: REVIEWED, verified: true },
  CH: { name: 'Direct federal tax 2026 (ESTV tariffs, single and married, CHF 263 per child), deductions: work expenses 3% (CHF 2,000-4,000), insurance CHF 1,800 / 3,700 + 700 per child, child CHF 6,800, married CHF 2,800; employee AHV/IV/EO 5.3%, ALV 1.1% to CHF 148,200, non-occupational accident ~1% (2nd pillar excluded and not deducted)', url: 'https://www.estv.admin.ch/dam/de/sd-web/vFK3ntWLQ4s4/2-215-D-2025-d.pdf', checkedVia: ['https://www.ahv-iv.ch/p/2.01.d'], asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['ALV 1.1% to CHF 148,200', 'non-occupational accident premium ~1% (insurer-specific)'], notModeled: ['deduction of 2nd-pillar contributions', 'commuting and meal deductions', 'church tax'] },
  'CH-ZH': { name: 'Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verheiratetentarif 0%-13%, insurance deduction CHF 2,900 / 5,800 + 1,300 per child, child deduction CHF 9,400; cantonal Steuerfuss 95% (Kantonsrat, 15 Dec 2025) + City of Zurich 119%', url: 'https://www.estv2.admin.ch/stp/kb/zh-de.pdf', checkedVia: ['https://www.notes.zh.ch/appl/zhlex_r.nsf/WebView/BA3B8CC78A88D4DEC1258D88003B2E23/$File/631.21_15.12.25_132.pdf'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['City of Zurich Steuerfuss 119% (city pages not reachable)'] },
  'CH-GE': { name: 'Geneva (canton GE): approximation, one combined federal + cantonal + communal marginal schedule calibrated to the cantonal calculator (not re-derived)', url: 'https://www.estv2.admin.ch/stp/kb/ge-fr.pdf', asOf: '2025', reviewed: REVIEWED, verified: false, approximate: true, estimated: true },
  DE: { name: '§ 32a EStG 2026 tariff (Grundfreibetrag €12,348) with splitting for married couples; Soli 5.5% with Freigrenze €20,350 / €40,700; children: Kinderfreibetrag €6,828 + €2,928 or Kindergeld €259/month; social: pension 9.3% + unemployment 1.3% to €101,400, health 7.3% + 1.45% (half the 2.9% average Zusatzbeitrag) + care 1.8% (+0.6% childless) to €69,750', url: 'https://dejure.org/gesetze/EStG/32a.html', checkedVia: ['https://dejure.org/gesetze/SolZG/3.html', 'https://www.finanzamt.nrw.de/en/node/31', 'https://www.bmas.de/DE/Service/Presse/Pressemitteilungen/2025/sozialversicherungsrechengroessen-2026.html', 'https://dejure.org/gesetze/SGB_XI/55.html'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['contribution rates 9.3% / 1.3% / 7.3% / care 1.8% (statutory rates not re-read)'], notModeled: ['care-insurance reduction of 0.25 points from the second child'] },
  FR: { name: 'Barème on 2025 income (latest enacted): 0/11/30/41/45%, quotient familial with the €1,807 cap per half-part, 10% deduction (cap €14,555), CEHR 3% / 4%; employee contributions 2026: old age 6.90% to the PASS (€48,060) + 0.40%, AGIRC-ARRCO 3.15% / 8.64%, CEG 0.86% / 1.08%, CET 0.14%, APEC 0.024%, CSG 9.2% + CRDS 0.5% on 98.25% to 4 PASS', url: 'https://www.service-public.fr/particuliers/vosdroits/F1419', checkedVia: ['https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/21-calcul_impot_369a382.pdf', 'https://www.service-public.fr/particuliers/vosdroits/F31130', 'https://www.service-public.fr/particuliers/vosdroits/F1989', 'https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/taux-cotisations-secteur-prive.html', 'https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/plafonds-securite-sociale.html', 'https://www.agirc-arrco.fr/storage/chiffrAA_2026_VF.pdf'], asOf: '2025 income (barème) / 2026 (contributions)', reviewed: REVIEWED, verified: false, unverified: ['AGIRC-ARRCO employee shares 3.15% / 8.64% (derived from the contractual rates)', 'APEC 0.024%'], notModeled: ['décote (low incomes only)', 'company health and provident plans'] },
  NL: { name: 'Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. national insurance); general credit €3,115 (cut 6.398% over €29,736); labour credit table 2026. 30% ruling not modeled', url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen', asOf: '2026', reviewed: REVIEWED, verified: true },
  ES: { name: 'IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minimum €5,550, €2,000 work deduction; employee social security 2026 6.50% (4.70 + 1.55 + 0.10 + MEI 0.15) to €61,214.40. Regional part: the region\'s scale (state scale where none is set)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764', checkedVia: ['https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores/36537'], asOf: '2026', reviewed: REVIEWED, verified: true, notModeled: ['solidarity contribution on pay above the maximum base'] },
  'ES-MD': { name: 'Comunidad de Madrid regional scale: five tranches 8.5% to 20.5% (to €13,362.22 / €19,004.63 / €35,425.68 / €57,320.40)', url: 'https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-i-tributacion-autonomica-2026.pdf', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['tranche thresholds (the 2026 summary confirms five tranches from 8.50% to 20.50%)'], notModeled: ['Madrid\'s higher regional minimums'] },
  'ES-CT': { name: 'Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / 33,000 / 53,000 / 90,000 / 120,000 / 175,000)', url: 'https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-ii-tributacion-autonomica-2025.pdf', asOf: '2025', reviewed: REVIEWED, verified: true, notModeled: ['Catalonia\'s own personal minimum'] },
  PT: { name: 'IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), solidarity surcharge 2.5% / 5% over €80,000 / €250,000; specific deduction €4,462.15 or contributions; social security 11%. IFICI regime not modeled', url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx', checkedVia: ['https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68a.aspx'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['specific deduction €4,462.15 (2026 IAS not read)', 'employee social security 11%'] },
  IT: { name: 'IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan municipal 0.8%; INPS 9.19% to €120,607', url: 'https://www.agenziaentrate.gov.it/', asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values (agenziaentrate page did not list the scale)'] },
  AT: { name: 'Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458 / 70,365 / 104,859 / 1M) on 12 regular salaries, 13th/14th at 6%; social insurance 18.07% to €90,300', url: 'https://www.usp.gv.at/steuern-finanzen/einkommensteuer-ueberblick/weitere-informationen-est/tarifstufen.html', asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['social insurance 18.07% and the 2025 cap €90,300 (2026 cap not read)', 'flat 6% on all special payments (higher rates above €25,000 not modeled)'] },
  BE: { name: 'Federal rates 25/40/45/50%, basic allowance €10,910, flat professional expenses (30%, cap €5,930), communal surcharge ~7%; social 13.07%', url: 'https://finance.belgium.be/en/private-individuals/tax-return/rates', asOf: '2025', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values (FPS Finance pages blocked)'] },
  SE: { name: 'State tax 20% above SEK 643,000 taxable (brytpunkt 660,400), basic allowance SEK 17,400 at high income; Stockholm municipal tax 30.55%; job tax credit approximated', url: 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['Stockholm municipal rate 30.55%', 'job tax credit formula'] },
  DK: { name: 'AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 2026 middle/top/top-top tax 7.5%/7.5%/5%, personal allowance DKK 54,100, employment deduction 12.75%', url: 'https://skat.dk/', asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values (skat.dk not readable)'] },
  NO: { name: 'Skatteetaten 2026: tax on general income 22%, bracket tax 1.7% / 4.0% / 13.7% / 16.8% / 17.8% from NOK 226,100 / 318,300 / 725,050 / 980,100 / 1,467,200, minimum standard deduction 46% (max NOK 92,000), personal allowance NOK 108,550; national insurance 7.6%', url: 'https://www.skatteetaten.no/en/rates/bracket-tax/', checkedVia: ['https://www.skatteetaten.no/en/rates/national-insurance-contributions/', 'https://www.skatteetaten.no/en/rates/minimum-standard-deduction/', 'https://www.skatteetaten.no/en/rates/personal-allowance/', 'https://www.skatteetaten.no/en/rates/general-income/'], asOf: '2026', reviewed: REVIEWED, verified: true },
  FI: { name: 'Approximation: state progressive tax + Helsinki municipal 5.3% as one schedule; employee contributions ~9% (pension, unemployment, health)', url: 'https://vero.fi/en/individuals/tax-cards-and-tax-returns/tax_card/tax-rate-and-income-ceiling/tax-bases/', asOf: '2025', reviewed: REVIEWED, verified: false, approximate: true, estimated: true },
  PL: { name: 'PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 costs; ZUS 11.26% to 30x cap + sickness 2.45%; health 9%', url: 'https://www.podatki.gov.pl/', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['all values'], notModeled: ['solidarity levy 4% on income over PLN 1M'] },
  CZ: { name: 'PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped), health 4.5%', url: 'https://www.financnisprava.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby', asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values'] },
  EE: { name: 'Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2nd pillar excluded)', url: 'https://www.emta.ee/en/private-client/taxes-and-payment/income-tax', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['all values (EMTA pages moved)'] },
  IL: { name: 'Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit points; Bituach Leumi + health 2026: 4.27% to NIS 7,703/month, 12.17% to NIS 51,910/month (pension fund excluded)', url: 'https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/forSalaried.aspx', asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['income tax brackets and credit point value'] },
  AE: { name: 'No personal income tax; no social security for expatriates', url: 'https://tax.gov.ae/', asOf: '2026', reviewed: REVIEWED, verified: false },
  SA: { name: 'No personal income tax on employment income; GOSI annuities apply to Saudi nationals only', url: 'https://zatca.gov.sa/', asOf: '2026', reviewed: REVIEWED, verified: false },
  JP: { name: 'NTA 2026: income tax 5%-45% x 1.021, employment income deduction (min ¥740,000, max ¥1.95M), basic deduction ¥620,000 (tapering above ¥23.5M); resident tax 10% + ¥5,000 (Tokyo, basic deduction ¥430,000); health ~4.96%, pension 9.15% (capped), employment insurance 0.55%', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm', checkedVia: ['https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm', 'https://www.tax.metro.tokyo.lg.jp/kazei/life/kojin_ju'], asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['social insurance rates and caps'] },
  KR: { name: 'Income tax 6%-45% + 10% local income tax, employment income deduction, ₩500,000 wage-earner credit (approx); NPS 4.75% (capped), NHI 3.595% + LTC, EI 0.9%', url: 'https://www.nts.go.kr/english/', asOf: '2026', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values'] },
  SG: { name: 'IRAS resident rates YA2024 onward 0%-24%, earned income relief S$1,000 (below 55); CPF not applied (Employment Pass holders do not contribute)', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates', checkedVia: ['https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs/earned-income-relief'], asOf: 'YA2026', reviewed: REVIEWED, verified: true },
  HK: { name: 'Salaries tax 2026/27: progressive 2%-17% after allowances (basic HK$145,000, married HK$290,000, HK$140,000 per child; derived from the gov.hk standard-rate zone table), capped at the standard rate 15% (16% over HK$5M); MPF 5% to HK$18,000 deducted (funded, not counted as tax)', url: 'https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm', asOf: '2026/27', reviewed: REVIEWED, verified: false, unverified: ['MPF cap HK$18,000'] },
  TW: { name: 'Income tax 5%-40%, exemption + standard + salary deductions NT$446,000; labour and health insurance (capped)', url: 'https://www.etax.nat.gov.tw/', asOf: '2025', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values'] },
  IN: { name: 'New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduction, section 87A rebate to ₹12 lakh, surcharge to 25%, 4% cess; professional tax ₹2,500 (KA/MH/TS). EPF (funded) excluded', url: 'https://incometaxindia.gov.in/', asOf: 'FY2026-27', reviewed: REVIEWED, verified: false, unverified: ['all values (secondary sources only)'] },
  AU: { name: 'Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 / $135,000 / $190,000), LITO, Medicare levy 2%. Super is employer-paid on top, excluded', url: 'https://treasury.gov.au/tax-cuts', asOf: '2026-27', reviewed: REVIEWED, verified: false, unverified: ['15% rate from 1 July 2026', 'LITO and Medicare levy (ATO blocks the probe)'] },
  NZ: { name: 'IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $53,500 / $78,100 / $180,000); ACC earners levy 1.67% (capped)', url: 'https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals', asOf: '2026/27', reviewed: REVIEWED, verified: false, unverified: ['ACC earners levy 1.67% to $152,790 (2025/26 values)'] },
  CA: { name: 'CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,523 / $117,045 / $181,440 / $258,482), basic personal amount $16,452 falling to $14,829, Canada employment amount $1,501; CPP 5.95% to $74,600 (enhanced part deducted) + CPP2 4% to $85,000; EI 1.63% to $68,900', url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html', checkedVia: ['https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html', 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html'], asOf: '2026', reviewed: REVIEWED, verified: false, unverified: ['CPP2 ceiling $85,000', 'deduction of the enhanced CPP contributions from income (not re-read in T4127)'] },
  'CA-ON': { name: 'Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16% ($53,891 / $107,785 / $150,000 / $220,000), basic personal amount $12,989, surtax 20% over $5,818 + 36% over $7,446, Ontario Health Premium', url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html', asOf: '2026', reviewed: REVIEWED, verified: true },
  'CA-BC': { name: 'British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20.50% ($50,363 / $100,728 / $115,648 / $140,430 / $190,405 / $265,545; lowest rate raised by Budget 2026), basic personal amount $13,216', url: 'https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates', checkedVia: ['https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic'], asOf: '2026', reviewed: REVIEWED, verified: true },
  'CA-QC': { name: 'Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6.3%, QPIP 0.43%, EI 1.30%', url: 'https://www.revenuquebec.ca/en/citizens/income-tax-return/', asOf: '2025', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['Quebec brackets, basic amount and QPP/QPIP (Revenu Québec blocks the probe); abatement 16.5% and EI 1.30% are from CRA'] },
  MX: { name: 'ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee ~2.775% (capped at 25 UMA)', url: 'https://www.sat.gob.mx/', asOf: '2025', reviewed: REVIEWED, verified: false, approximate: true, unverified: ['all values (2026 table update not read)'] },
  BR: { name: 'Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 per dependent; INSS 2026 7.5%-14% to R$8,475.55; x12 (13th salary not modeled)', url: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026', checkedVia: ['https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal'], asOf: '2026', reviewed: REVIEWED, verified: true, approximate: true },
});

/**
 * Every named tax figure, keyed by TAX_SOURCES key, for the monthly refresh
 * (scripts/refresh/tax.js reads these through the `params` locators in
 * scripts/refresh/tax-watch.js, so the watch list does not depend on constant names such as
 * US_FED_2026). Built from the same constants the rules use, so it can never disagree with
 * taxFor. When a tax year moves (US_FED_2026 -> US_FED_2027), update the reference here and
 * TAX_SOURCES[key].asOf; the watch list stays as it is. Read-only.
 */
export const TAX_PARAMS = Object.freeze({
  US: Object.freeze({ federal: US_FED_2026, standardDeduction: US_STD_2026, ssWageBase: US_SS_BASE_2026, addlMedicareThreshold: US_ADDL_MEDICARE, childTaxCredit: US_CTC_2026, childTaxCreditPhaseOut: US_CTC_PHASE }),
  'US-CA': Object.freeze({ single: CA_X_2025, mfj: CA_Y_2025 }),
  'US-NY': Object.freeze({ single: NYS_2026.single, mfj: NYS_2026.mfj, recapture: NYS_RECAPTURE_2026 }),
  'US-LOCAL-NYC': Object.freeze({ single: NYC_2026.single, mfj: NYC_2026.mfj }),
  'US-OR': Object.freeze({ single: OR_2026.single, mfj: OR_2026.mfj }),
  'US-AL': Object.freeze({ single: AL_2025.single, mfj: AL_2025.mfj }),
  'US-MD': Object.freeze({ single: MD_2025.single, mfj: MD_2025.mfj }),
  GB: Object.freeze({ bands: GB_RUK, scotlandBands: GB_SCT }),
  'GB-SCT': Object.freeze({ bands: GB_SCT }),
  CH: Object.freeze({ federalSingle: CH_FED_SINGLE, federalMarried: CH_FED_MARRIED }),
  'CH-ZH': Object.freeze({ grundtarif: ZH_GRUND, verheiratetentarif: ZH_VERH, steuerfuss: ZH_STEUERFUSS }),
  'CH-GE': Object.freeze({ combined: CH_GE_COMBINED }),
  DE: Object.freeze({ tariff: DE_2026 }),
  FR: Object.freeze({ bareme: FR_BAREME, pass: FR_PASS_2026 }),
  ES: Object.freeze({ state: ES_STATE }),
  'ES-MD': Object.freeze({ regional: ES_REGIONAL.MD }),
  'ES-CT': Object.freeze({ regional: ES_REGIONAL.CT }),
  CA: Object.freeze({ federal: CA_FED_2026 }),
});

/**
 * How each level taxes a one-earner couple or family (TAX_SOURCES keys):
 *   joint      household rules applied (joint brackets, allowances, child credits)
 *   individual the level taxes each person separately: the earner pays what a single person
 *              does, apart from the credits named in the note (not modeled)
 *   single     joint / family taxation exists but is not modeled: computed as a single filer
 *   neutral    no household effect (no income tax, or a flat tax without allowances)
 */
export const TAX_HOUSEHOLD = Object.freeze({
  US: { basis: 'joint', note: 'Federal: married filing jointly, $2,200 child tax credit per child (refundable part not modeled).' },
  'US-CA': { basis: 'joint', note: 'California dependent exemption credit not modeled.' },
  'US-NY': { basis: 'joint' },
  'US-WA': { basis: 'neutral' },
  'US-TX': { basis: 'neutral' },
  'US-FL': { basis: 'neutral' },
  'US-TN': { basis: 'neutral' },
  'US-NV': { basis: 'neutral' },
  'US-MA': { basis: 'joint' },
  'US-GA': { basis: 'joint' },
  'US-DC': { basis: 'joint' },
  'US-AL': { basis: 'joint' },
  'US-OH': { basis: 'joint' },
  'US-VA': { basis: 'joint' },
  'US-IL': { basis: 'joint' },
  'US-CO': { basis: 'joint' },
  'US-PA': { basis: 'neutral' },
  'US-NC': { basis: 'joint' },
  'US-OR': { basis: 'joint' },
  'US-UT': { basis: 'joint' },
  'US-AZ': { basis: 'joint' },
  'US-MN': { basis: 'joint' },
  'US-MI': { basis: 'joint' },
  'US-MD': { basis: 'joint', note: 'Maryland personal exemptions not modeled.' },
  'US-LOCAL-NYC': { basis: 'joint' },
  'US-LOCAL-COLUMBUS': { basis: 'neutral' },
  'US-LOCAL-PHILADELPHIA': { basis: 'neutral' },
  'US-LOCAL-PITTSBURGH': { basis: 'neutral' },
  'US-LOCAL-DETROIT': { basis: 'joint' },
  'US-LOCAL-PORTLAND': { basis: 'joint' },
  'US-LOCAL-MD-COUNTY': { basis: 'joint' },
  GB: { basis: 'individual', note: 'The UK taxes each person separately; the marriage allowance only helps basic-rate taxpayers.' },
  'GB-SCT': { basis: 'individual' },
  IE: { basis: 'joint', note: 'Ireland: married one-income band and credits; Home Carer Credit not modeled.' },
  CH: { basis: 'joint' },
  'CH-ZH': { basis: 'joint' },
  'CH-GE': { basis: 'single', note: 'Geneva: married and child rules not modeled.' },
  DE: { basis: 'joint', note: 'Germany: splitting; Kinderfreibetrag or Kindergeld, whichever is worth more, counted net of Kindergeld.' },
  FR: { basis: 'joint', note: 'France: quotient familial (2 parts, +½ per child, €1,807 cap per half-part).' },
  NL: { basis: 'individual', note: 'The Netherlands taxes each person separately.' },
  ES: { basis: 'single', note: 'Spain: joint return (€3,400 reduction) and child minimums not modeled.' },
  'ES-MD': { basis: 'single' },
  'ES-CT': { basis: 'single' },
  PT: { basis: 'single', note: 'Portugal: joint taxation and dependant deductions not modeled.' },
  IT: { basis: 'individual', note: 'Italy taxes each person separately; dependant deductions (tapering to zero near €80,000-95,000) not modeled.' },
  AT: { basis: 'individual', note: 'Austria taxes each person separately; Familienbonus Plus and sole-earner credit not modeled.' },
  BE: { basis: 'single', note: 'Belgium: marital quotient and child allowances not modeled.' },
  SE: { basis: 'individual', note: 'Sweden taxes each person separately.' },
  DK: { basis: 'individual', note: 'Denmark: transfer of a non-earning spouse\'s personal allowance not modeled.' },
  NO: { basis: 'individual', note: 'Norway taxes each person separately.' },
  FI: { basis: 'individual', note: 'Finland taxes each person separately.' },
  PL: { basis: 'single', note: 'Poland: joint filing with a spouse and the child relief not modeled.' },
  CZ: { basis: 'individual', note: 'Czechia: child tax credits not modeled.' },
  EE: { basis: 'individual', note: 'Estonia: using a spouse\'s basic exemption not modeled.' },
  IL: { basis: 'individual', note: 'Israel: credit points for children not modeled.' },
  AE: { basis: 'neutral' },
  SA: { basis: 'neutral' },
  JP: { basis: 'individual', note: 'Japan taxes each person separately; the spouse deduction ends at ¥10M of earnings and children under 16 have no deduction.' },
  KR: { basis: 'individual', note: 'Korea: dependant deductions and the child tax credit not modeled.' },
  SG: { basis: 'individual', note: 'Singapore: spouse and qualifying-child reliefs not modeled.' },
  HK: { basis: 'joint', note: 'Hong Kong: married person\'s and child allowances.' },
  TW: { basis: 'single', note: 'Taiwan: household filing exemptions for a spouse and children not modeled.' },
  IN: { basis: 'individual', note: 'India taxes each person separately (no dependant deductions in the new regime).' },
  AU: { basis: 'individual', note: 'Australia taxes each person separately.' },
  NZ: { basis: 'individual', note: 'New Zealand taxes each person separately.' },
  CA: { basis: 'individual', note: 'Canada taxes each person separately; the spouse amount credit is not modeled.' },
  'CA-ON': { basis: 'individual' },
  'CA-BC': { basis: 'individual' },
  'CA-QC': { basis: 'individual' },
  MX: { basis: 'individual', note: 'Mexico taxes each person separately.' },
  BR: { basis: 'joint', note: 'Brazil: spouse and children as dependants.' },
});

/** TAX_SOURCES keys that apply to a jurisdiction { country, region, local }. */
export function taxKeys(j) {
  const keys = [j.country];
  if (j.region && TAX_SOURCES[`${j.country}-${j.region}`]) keys.push(`${j.country}-${j.region}`);
  else if (j.country === 'US' && j.region) keys.push(`US-${j.region}`);
  if (j.local) keys.push(j.country === 'US' ? `US-LOCAL-${j.local}` : `${j.country}-LOCAL-${j.local}`);
  return keys.filter((k) => k !== `${j.country}-LOCAL-PROF-TAX`);
}

/**
 * How a household was taxed across a jurisdiction's levels: { basis, note? }. A rule that
 * computed everything as a single filer (one combined schedule) says so with `singleOnly`.
 */
function householdBasis(j, hh, singleOnly) {
  if (hh.key === 'single') return { basis: 'single' };
  const levels = taxKeys(j).map((k) => {
    const e = TAX_HOUSEHOLD[k] || { basis: 'single' };
    if (!singleOnly || e.basis === 'neutral' || e.basis === 'single') return { k, ...e };
    return { k, basis: 'single' }; // its household rules were not used by this rule
  });
  const live = levels.filter((l) => l.basis !== 'neutral');
  const notes = [...new Set(levels.map((l) => l.note).filter(Boolean))];
  let basis;
  if (!live.length) basis = 'individual';
  else if (live.every((l) => l.basis === 'single')) basis = 'single';
  else if (live.every((l) => l.basis === 'joint' || l.basis === 'individual')) basis = live.some((l) => l.basis === 'joint') ? 'joint' : 'individual';
  else basis = 'partial';
  if (basis === 'partial') notes.unshift(`Taxed as a single filer at: ${live.filter((l) => l.basis === 'single').map((l) => l.k).join(', ')}.`);
  if (basis === 'single' && !notes.length) notes.push('Household rules for this jurisdiction are not modeled; taxed as a single filer.');
  return notes.length ? { basis, note: notes.join(' ') } : { basis };
}

/**
 * Annual tax in local currency for one earner.
 *   opts.household: 'single' (default) | 'couple' | 'family' (2 adults + 2 children, one earner)
 * Returns { income, regional, social, total, household, basis, note? }:
 *   basis 'single'     computed as a single filer (for a couple/family: household rules not
 *                      modeled here, see note)
 *         'joint'      household rules applied (joint brackets, allowances, child credits)
 *         'individual' the jurisdiction taxes each earner separately (credits not modeled: note)
 *         'partial'    some levels applied household rules, others are single (note lists them)
 * Throws for an unknown country, US state / local, or Canadian province.
 */
export function taxFor(grossLocal, jurisdiction, opts = {}) {
  const j = jurisdiction || {};
  const rule = RULES[j.country];
  if (!rule) throw new Error(`no tax rule for country ${j.country}`);
  const g = pos(Number(grossLocal) || 0);
  const hh = taxHousehold(opts.household);
  const r = rule(g, j, hh);
  const income = r.income || 0;
  const regional = r.regional || 0;
  const social = r.social || 0;
  return { income, regional, social, total: income + regional + social, household: hh.key, ...householdBasis(j, hh, r.singleOnly) };
}

/** Countries with a tax rule. */
export const TAX_COUNTRIES = Object.freeze(Object.keys(RULES));

// ---------------------------------------------------------------------------
// FX helpers
// ---------------------------------------------------------------------------

/** USD per one unit of `currency`: palette FX first, then the city's / dataset's Big Mac FX. */
export function usdPerUnit(currency, city, cities) {
  const c = String(currency || 'USD').toUpperCase();
  if (FX_TO_USD[c] != null) return FX_TO_USD[c];
  if (city && city.currency === c && city.fxPerUSD > 0) return 1 / city.fxPerUSD;
  const doc = cities && !Array.isArray(cities) ? cities : null;
  const per = doc?.fx?.perUSD?.[c];
  if (per > 0) return 1 / per;
  const list = citiesOf(cities);
  const any = list.find((x) => x.currency === c && x.fxPerUSD > 0);
  return any ? 1 / any.fxPerUSD : null;
}

/** Convert an amount to approx USD (null when the currency is unknown). */
export function toUSD(amount, currency, cities) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const r = usdPerUnit(currency, null, cities);
  return r == null ? null : Number(amount) * r;
}

// ---------------------------------------------------------------------------
// Guardrails: inputs and confidence (ROADMAP F8)
// ---------------------------------------------------------------------------

/** Source classes, best first. official/open/user rank "high"; aggregator "medium"; estimate "low". */
export const SOURCE_CLASSES = Object.freeze(['official', 'open', 'user', 'aggregator', 'estimate']);
export const CONFIDENCE_LEVELS = Object.freeze(['low', 'medium', 'high']);
const CLASS_CONFIDENCE = { official: 'high', open: 'high', user: 'high', aggregator: 'medium', estimate: 'low' };

/** Class of a cities.json source entry: explicit `class`, else inferred (estimates, Numbeo = aggregator). */
export function sourceClass(source) {
  if (!source) return 'estimate';
  if (source.estimated) return 'estimate';
  if (SOURCE_CLASSES.includes(source.class)) return source.class;
  if (/numbeo\.com/i.test(source.url || '')) return 'aggregator';
  return 'aggregator'; // unknown provenance never counts as official
}

function lowest(levels) {
  return levels.reduce((a, b) => (CONFIDENCE_LEVELS.indexOf(b) < CONFIDENCE_LEVELS.indexOf(a) ? b : a), 'high');
}

/** Confidence of the tax inputs: estimated -> low; approximate or unverified -> medium; verified -> high. */
function taxConfidence(keys) {
  return lowest(keys.map((k) => {
    const s = TAX_SOURCES[k];
    if (!s || s.estimated) return 'low';
    if (s.approximate || !s.verified) return 'medium';
    return 'high';
  }));
}

const brief = (s) => (s ? { name: s.name, url: s.url, asOf: s.asOf } : null);

/**
 * Overall confidence: the lowest of the rent, cost-index and tax confidences; and outside the
 * US it is "low" unless both rent and cost index come from an official, open or user source.
 */
export function confidenceFor(inputs, country) {
  const level = lowest([inputs.rent.confidence, inputs.costIndex.confidence, inputs.tax.confidence]);
  const strong = (c) => ['official', 'open', 'user'].includes(c);
  if (country !== 'US' && !(strong(inputs.rent.class) && strong(inputs.costIndex.class))) return 'low';
  return level;
}

// ---------------------------------------------------------------------------
// computeJuice
// ---------------------------------------------------------------------------

/**
 * Juice for one salary (annual, approx USD) in one city record.
 * opts:
 *   household: 'single' | 'couple' | 'family'   who it is for (default 'single'): picks the
 *                                bedroom count (1 / 2 / 3) and scales living costs by LIVING_SCALE
 *   rent: 'center' | 'outside'   city-centre rent (default) or outside the centre
 *   rentOverrideUSD: number      user-entered monthly rent in USD; replaces the dataset rent
 *   baselineUSD: number          NYC single-person basket (default NYC_BASKET_USD)
 * All money values are annual USD, rounded to whole dollars. Every result carries `inputs`
 * (each value with its source and as-of date) and a `confidence` ("high" | "medium" | "low").
 * Throws (err.code = 'NO_RENT') when the city has no rent for the household and no override.
 */
export function computeJuice(salaryUSD, city, opts = {}) {
  if (!city) throw new Error('computeJuice: city record required');
  const hh = householdOf(opts.household);
  const gross = pos(Number(salaryUSD) || 0);
  const palette = FX_TO_USD[String(city.currency || 'USD').toUpperCase()] != null;
  const usdPer = usdPerUnit(city.currency, city) || (city.fxPerUSD > 0 ? 1 / city.fxPerUSD : null);
  if (!usdPer) throw new Error(`computeJuice: no FX for ${city.currency}`);
  const jur = city.tax || { country: city.country };
  // The tax model decides what the household changes (filing status, credits); with
  // 'single' it is the single-filer schedule. Older taxFor versions ignore the 3rd argument.
  const t = taxFor(gross / usdPer, jur, { household: hh.key });
  const tax = t.total * usdPer;

  const override = Number(opts.rentOverrideUSD);
  const hasOverride = opts.rentOverrideUSD != null && Number.isFinite(override) && override >= 0;
  const outside = opts.rent === 'outside';
  let rentMonthly;
  let rentInput;
  if (hasOverride) {
    rentMonthly = override;
    rentInput = { monthlyUSD: Math.round(override), basis: 'override', bedrooms: hh.bedrooms, class: 'user', confidence: 'high', source: { name: 'Rent entered by the user', url: null, asOf: null } };
  } else {
    const r = rentFor(city, hh.bedrooms, outside, usdPer);
    if (r.monthly == null) {
      const err = new Error(`computeJuice: ${city.key} has no ${hh.bedrooms}-bedroom rent; pass opts.rentOverrideUSD`);
      err.code = 'NO_RENT';
      throw err;
    }
    rentMonthly = r.monthly;
    rentInput = {
      monthlyUSD: Math.round(rentMonthly),
      basis: outside ? 'outside' : 'center',
      bedrooms: hh.bedrooms,
      ...(r.local != null ? { monthlyLocal: Math.round(r.local * 100) / 100, currency: city.currency } : {}),
      class: r.cls,
      confidence: CLASS_CONFIDENCE[r.cls],
      source: brief(r.src),
      ...(r.method ? { method: r.method } : {}),
      ...(r.base?.asOf ? { base: { asOf: r.base.asOf } } : {}), // the 1-bedroom rent's date (kept small: ~5k jobs carry it)
    };
  }
  const rent = rentMonthly * 12;

  const baseline = opts.baselineUSD > 0 ? opts.baselineUSD : NYC_BASKET_USD;
  const scale = livingScaleFor(hh);
  const living = ((Number(city.costIndex) || 0) / 100) * baseline * scale;
  // Round the parts first so the waterfall adds up exactly: net = gross - tax - rent - living.
  const parts = { gross: Math.round(gross), tax: Math.round(tax), rent: Math.round(rent), living: Math.round(living) };
  const net = parts.gross - parts.tax - parts.rent - parts.living;
  const score = Math.round(scoreFromNet(net)); // grade from the shown (rounded) score
  const afterTax = gross - tax;

  const keys = taxKeys(jur);
  const ciSrc = city.sources?.costIndex;
  const ciClass = sourceClass(ciSrc);
  const inputs = {
    household: {
      key: hh.key, label: hh.label, adults: hh.adults, children: hh.children, bedrooms: hh.bedrooms,
      livingScale: Math.round(scale * 1000) / 1000,
      source: { name: LIVING_SCALE.name, url: LIVING_SCALE.url, asOf: '2026' },
    },
    rent: rentInput,
    tax: {
      jurisdiction: keys,
      effectiveRate: gross > 0 ? Math.round((1000 * tax) / gross) / 1000 : 0,
      confidence: taxConfidence(keys),
      sources: keys.map((k) => ({ key: k, name: TAX_SOURCES[k]?.name, url: TAX_SOURCES[k]?.url, asOf: TAX_SOURCES[k]?.asOf, verified: !!TAX_SOURCES[k]?.verified })),
      // How the household was taxed (taxFor): 'single' | 'joint' | 'individual' | 'partial', and what was left out.
      basis: t.basis || 'single',
      ...(t.note ? { note: t.note } : {}),
    },
    costIndex: {
      value: city.costIndex,
      baselineUSD: baseline,
      class: ciClass,
      confidence: CLASS_CONFIDENCE[ciClass],
      source: brief(ciSrc),
      ...(ciSrc?.method ? { method: ciSrc.method } : {}),
    },
    fx: { currency: city.currency, usdPerUnit: usdPer, source: palette ? `FX_PER_USD (${FX_SOURCE}; shared with public/viz/palette.js)` : `city fxPerUSD (${city.sources?.fxPerUSD?.name || 'data/cities.json'})`, asOf: palette ? FX_AS_OF : city.sources?.fxPerUSD?.asOf || null },
    bigMac: { usd: city.bigMacUSD, source: brief(city.sources?.bigMacUSD) },
  };

  const out = {
    ...parts,
    net,
    score,
    grade: gradeFor(score, net),
    household: hh.key,
    taxBasis: t.basis || 'single', // kept when attachJuice strips `inputs` from non-best locations
    rentBurden: afterTax > 0 ? Math.round((1000 * rent) / afterTax) / 1000 : null,
    bigMacs: city.bigMacUSD > 0 ? Math.round(net / city.bigMacUSD) : null,
    taxParts: { income: Math.round(t.income * usdPer), regional: Math.round(t.regional * usdPer), social: Math.round(t.social * usdPer) },
    confidence: confidenceFor(inputs, city.country),
    inputs,
  };
  if (hasOverride) out.rentBasis = 'override';
  else if (outside) out.rentBasis = 'outside';
  const estimated = rentInput.class === 'estimate' || ciClass === 'estimate' || keys.some((k) => TAX_SOURCES[k]?.estimated);
  if (estimated) out.estimated = true;
  return out;
}

/**
 * Monthly rent (USD) for `bedrooms` in a city: { monthly, local, src, cls, method, base? }
 * (base: the 1-bedroom rent's source, for an estimated city-centre 2- or 3-bedroom rent).
 * City centre: the quoted field for that bedroom count (RENT_FIELDS). Outside the centre, only
 * the 1-bedroom figure is quoted, so 2 and 3 bedrooms apply the city's own centre bedroom
 * ratio to it (an estimate). monthly is null when the city has no figure.
 */
function rentFor(city, bedrooms, outside, usdPer) {
  const f = RENT_FIELDS[bedrooms] || RENT_FIELDS[1];
  if (!outside) {
    const local = city[f.local];
    const src = city.sources?.[f.local] || city.sources?.[f.usd];
    const monthly = local != null ? local * usdPer : city[f.usd] ?? null;
    // An estimated 2- or 3-bedroom rent scales the 1-bedroom rent: keep that rent's source too, so
    // the UI can date both (its own asOf is the bedroom ratio's; fix-viz P-13).
    const base = bedrooms > 1 && sourceClass(src) === 'estimate' ? (city.sources?.rent1brCenterLocal || city.sources?.rent1brCenterUSD || null) : null;
    return { monthly, local: local ?? null, src, cls: sourceClass(src), method: src?.method || null, base };
  }
  const local1 = city.rent1brOutsideLocal;
  const src1 = city.sources?.rent1brOutsideLocal || city.sources?.rent1brOutsideUSD;
  const out1 = local1 != null ? local1 * usdPer : city.rent1brOutsideUSD ?? null;
  if (bedrooms === 1 || out1 == null) return { monthly: out1, local: local1 ?? null, src: src1, cls: sourceClass(src1), method: null };
  const c1 = city.rent1brCenterLocal;
  const cn = city[f.local];
  if (!(c1 > 0) || !(cn > 0)) return { monthly: null, local: null, src: src1, cls: 'estimate', method: null };
  const ratio = cn / c1;
  return {
    monthly: out1 * ratio,
    local: local1 != null ? local1 * ratio : null,
    src: src1,
    cls: 'estimate',
    method: `outside-centre 1-bedroom × the city-centre ${bedrooms}-bedroom ÷ 1-bedroom ratio (${ratio.toFixed(2)})`,
  };
}

// ---------------------------------------------------------------------------
// City lookup
// ---------------------------------------------------------------------------

/** The cities array from a cities.json document, an array, or null. */
export function citiesOf(cities) {
  if (!cities) return [];
  if (Array.isArray(cities)) return cities;
  if (Array.isArray(cities.cities)) return cities.cities;
  return [];
}

const INDEX = new WeakMap();
const REGION_COUNTRIES = new Set(['US', 'CA', 'AU']);

function indexOf(cities) {
  const list = citiesOf(cities);
  let idx = INDEX.get(list);
  if (idx) return idx;
  idx = new Map();
  const add = (name, rec, via) => {
    const k = normKey(name);
    if (!k) return;
    const arr = idx.get(k) || [];
    if (!arr.some((x) => x.rec === rec)) arr.push({ rec, via });
    idx.set(k, arr);
  };
  for (const rec of list) {
    add(rec.city || rec.name, rec, 'city');
    add(rec.name, rec, 'city');
    for (const a of rec.aliases || []) add(a, rec, 'alias');
  }
  for (const rec of list) for (const n of rec.nearby || []) add(n, rec, 'nearby');
  INDEX.set(list, idx);
  return idx;
}

/**
 * Match a location (Job location object, or a raw string that is geocoded with
 * server/geo.js) to a city record. Returns { city, via: 'city'|'alias'|'nearby', location } or null.
 * Matching: city name (normalized, with aliases) + country; for US/CA/AU also the region
 * when both sides have one (Arlington, VA is not Arlington, TX).
 */
export function matchCity(location, cities) {
  if (!location) return null;
  let loc = location;
  if (typeof loc === 'string') {
    loc = geocode(loc)[0];
    if (!loc) return null;
  }
  if (!loc.city) return null;
  const cands = indexOf(cities).get(normKey(loc.city));
  if (!cands) return null;
  const country = loc.country ? String(loc.country).toUpperCase() : null;
  for (const via of ['city', 'alias', 'nearby']) {
    for (const c of cands) {
      if (c.via !== via) continue;
      if (country && c.rec.country !== country) continue;
      if (REGION_COUNTRIES.has(c.rec.country) && loc.region && c.rec.region && normKey(loc.region) !== normKey(c.rec.region)) continue;
      return { city: c.rec, via, location: loc };
    }
  }
  return null;
}

/** City record for a location (Job location object or string), or null. */
export function findCity(location, cities) {
  const m = matchCity(location, cities);
  return m ? m.city : null;
}

// ---------------------------------------------------------------------------
// attachJuice
// ---------------------------------------------------------------------------

// Fix wave 3 (BP-2, BP-9; shared decisions 1 and 4): why a salaried posting has no Juice.
const CURRENCY_WORDS = Object.freeze({
  USD: ['US dollars', 'the US'], CAD: ['Canadian dollars', 'Canada'], GBP: ['pounds', 'the UK'], EUR: ['euros', null],
  PLN: ['złoty', 'Poland'], CHF: ['Swiss francs', 'Switzerland'], JPY: ['yen', 'Japan'], INR: ['rupees', 'India'],
  ILS: ['shekels', 'Israel'], AUD: ['Australian dollars', 'Australia'], NZD: ['New Zealand dollars', 'New Zealand'],
  SGD: ['Singapore dollars', 'Singapore'], SEK: ['Swedish kronor', 'Sweden'], NOK: ['Norwegian kroner', 'Norway'],
  DKK: ['Danish kroner', 'Denmark'], CZK: ['Czech koruna', 'Czechia'], KRW: ['won', 'South Korea'],
  TWD: ['Taiwan dollars', 'Taiwan'], HKD: ['Hong Kong dollars', 'Hong Kong'], MXN: ['Mexican pesos', 'Mexico'],
  BRL: ['reais', 'Brazil'], AED: ['dirhams', 'the UAE'], SAR: ['riyals', 'Saudi Arabia'], RON: ['lei', 'Romania'],
});
const placeList = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`);

/**
 * The reason a posting with pay gets no Juice, or null: { code, text }.
 *   'pay-other-country': none of the places Juice knows uses the pay's currency, so the pay is
 *     another country's (BP-2: London Juice from Cohere's CA$ range, Munich Juice from NVIDIA's
 *     Polish range). Juice is never worked out from another country's pay.
 *   'part-time-hours': part-time hourly pay (salary.partTime) and the posting states no weekly
 *     hours, so a year's pay is unknown (BP-9).
 */
const COUNTRY_WORDS = Object.freeze({ US: 'the US', GB: 'the UK', AE: 'the UAE', NL: 'the Netherlands', CZ: 'Czechia' });
function countryWords(code) {
  if (COUNTRY_WORDS[code]) return COUNTRY_WORDS[code];
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
}
function noJuiceReason(code, { currency, country = null, places = [] } = {}) {
  if (code === 'part-time-hours') {
    return { code, text: 'No Juice figure: this is part-time hourly pay, and the posting doesn’t say how many hours a week.' };
  }
  const where = placeList(places) || 'the role’s places';
  if (country) {
    return { code, text: `No Juice figure: the pay is posted for ${countryWords(country)} only, and ${where} ${places.length === 1 ? 'is' : 'are'} in another country. Juice is never worked out from another country’s pay.` };
  }
  const [money, home] = CURRENCY_WORDS[currency] || [currency, null];
  return {
    code,
    text: `No Juice figure: the pay is posted in ${money}${home ? ` (for ${home})` : ''}, and ${where} ${places.length === 1 ? 'uses' : 'use'} another currency. Juice is never worked out from another country’s pay.`,
  };
}

/**
 * Sets job.juice = { best: { city, ...computeJuice }, byLocation: [{ locationName, city, ...computeJuice }],
 * salaryUSD } or null (no salary, quarantined salary, unknown currency, or no matching city).
 * Uses salary.mid (annualized). Only matched locations that use the salary's currency are
 * scored (a USD range posted for "SF | London" is not applied to London). When none does, the
 * pay is another country's: job.juice is null and job.juiceMissing = { code: 'pay-other-country',
 * text } says why (fix wave 3, shared decision 1; the old currencyMismatch fallback scored them
 * anyway). Part-time hourly pay (salary.partTime) is scored on the weekly hours the posting
 * states (salary.hoursPerWeek × 52 hours a year instead of 2,080), and with no stated hours
 * job.juiceMissing is { code: 'part-time-hours', text }. job.juiceMissing is absent otherwise.
 * Locations whose city has no rent are skipped unless opts.rentOverrides[cityKey] (monthly USD)
 * supplies one. opts.household ('single' | 'couple' | 'family') is passed to computeJuice and
 * recorded as job.juice.household. Returns the job.
 */
export function attachJuice(job, cities, opts = {}) {
  if (!job || typeof job !== 'object') return job;
  job.juice = null;
  delete job.juiceMissing;
  const s = job.salary;
  if (!s || !Number.isFinite(Number(s.mid))) return job;
  const cur = String(s.currency || 'USD').toUpperCase();
  // BP-9: part-time hourly pay covers the hours the posting states, not 2,080 a year.
  const hours = Number(s.hoursPerWeek);
  const partTime = s.partTime === true;
  if (partTime && !(hours > 0)) { job.juiceMissing = noJuiceReason('part-time-hours'); return job; }
  const annual = partTime ? (Number(s.mid) / 2080) * hours * 52 : Number(s.mid);
  const salaryUSD = toUSD(annual, cur, cities);
  if (salaryUSD == null || !(salaryUSD > 0)) return job;

  const seen = new Set();
  const matches = [];
  for (const loc of Array.isArray(job.locations) ? job.locations : []) {
    if (!loc || (loc.remote && !loc.city)) continue;
    const m = matchCity(loc, cities);
    if (!m || seen.has(m.city.key)) continue;
    seen.add(m.city.key);
    matches.push(m);
  }
  if (!matches.length) return job;
  // Fix wave 4 (DQ-27): only the places the pay was posted for, when the adapter knows them
  // (salary.places, or the places of salary.ranges): Apple's Cupertino range is not Austin pay.
  const posted = postedPlaceSet(s);
  if (posted) {
    const own = matches.filter((m) => posted.has(m.location.rawName || m.location.name));
    if (own.length) matches.splice(0, matches.length, ...own);
  }
  // The pay's own country: the one its pay line names (salary.country, "Ireland: €72000"),
  // else any country that uses its currency.
  const payCountry = typeof s.country === 'string' && /^[A-Z]{2}$/.test(s.country) ? s.country : null;
  const use = matches.filter((m) => m.city.currency === cur && (!payCountry || m.city.country === payCountry));
  if (!use.length) {
    const places = matches.map((m) => m.location.name || m.city.name);
    job.juiceMissing = noJuiceReason('pay-other-country', { currency: cur, country: matches.some((m) => m.city.currency === cur) ? payCountry : null, places });
    return job;
  }
  const doc = cities && !Array.isArray(cities) ? cities : null;
  const o = { ...opts };
  if (!(o.baselineUSD > 0) && doc?.baseline?.nycBasketUSD > 0) o.baselineUSD = doc.baseline.nycBasketUSD;

  const overrides = opts.rentOverrides || null; // { [cityKey]: monthly USD } from the user
  const byLocation = [];
  // DQ-28: a place with its own posted range (salary.ranges[].locations) is scored on that range's
  // midpoint, not the span's.
  const placeUSD = (m) => {
    const key = m.location.rawName || m.location.name;
    const r = Array.isArray(s.ranges) ? s.ranges.find((x) => x && Array.isArray(x.locations) && x.locations.includes(key) && Number.isFinite(Number(x.min)) && Number.isFinite(Number(x.max))) : null;
    if (!r || String(r.currency || cur).toUpperCase() !== cur) return salaryUSD;
    const mid = (Number(r.min) + Number(r.max)) / 2;
    const v = toUSD(partTime ? (mid / 2080) * hours * 52 : mid, cur, cities);
    return v != null && v > 0 ? v : salaryUSD;
  };
  for (const m of use) {
    let j;
    const ov = overrides && overrides[m.city.key];
    try { j = computeJuice(placeUSD(m), m.city, ov != null ? { ...o, rentOverrideUSD: ov } : o); } catch { continue; }
    const entry = { locationName: m.location.name || m.city.name, city: m.city.key, cityName: m.city.name, ...j };
    if (m.via === 'nearby') entry.proxy = true;
    byLocation.push(entry);
  }
  if (!byLocation.length) return job;
  const best = byLocation.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.net > a.net) ? b : a));
  const { locationName, ...bestRest } = best;
  // Payload guard: full `inputs` (~1.5 KB) stay on `best`; other locations keep confidence only
  // unless opts.inputs === 'all' ('none' drops them everywhere). computeJuice itself always
  // returns inputs, so a drawer can recompute any location in the browser.
  const mode = opts.inputs || 'best';
  const strip = (e) => { const { inputs, ...rest } = e; return rest; };
  job.juice = {
    best: mode === 'none' ? strip({ ...bestRest, locationName }) : { ...bestRest, locationName },
    byLocation: mode === 'all' ? byLocation : byLocation.map(strip),
    salaryUSD: Math.round(salaryUSD),
    household: householdOf(opts.household).key, // which household the scores are for
  };
  return job;
}

/** The location strings a salary was posted for (salary.places, else every range's places), or null. */
function postedPlaceSet(s) {
  if (Array.isArray(s.places) && s.places.length) return new Set(s.places);
  const rs = Array.isArray(s.ranges) ? s.ranges : [];
  if (rs.length && rs.every((r) => r && Array.isArray(r.locations) && r.locations.length)) return new Set(rs.flatMap((r) => r.locations));
  return null;
}

/** attachJuice over an array (mutates and returns it). */
export function attachJuiceAll(jobs, cities, opts) {
  for (const j of Array.isArray(jobs) ? jobs : []) attachJuice(j, cities, opts);
  return jobs;
}

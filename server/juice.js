// Juice Score: "livability $: what's left after living costs".
//
// The salary is the melon; rent, taxes and living costs are the rind. The Juice is
// what's left after the rind is peeled off:
//
//   juice (net) = gross − tax − rent (1BR, 12 months) − living (costIndex/100 × NYC basket)
//   score       = 100 × (1 − e^(−net / $80K)): fixed, saturating, never clamps (stable across companies)
//
// Pure ES module, browser-safe (no node: imports, no process): the static GitHub Pages
// build ships it in dist/lib/ next to geo.js. Inputs come from data/cities.json (pass the
// parsed document or its `cities` array). Formula, tax model, anchors and sources:
// docs/LIVABILITY.md. An estimate, not financial advice.
//
//   computeJuice(salaryUSD, cityRecord, opts?) -> { gross, tax, rent, living, net, score,
//                    grade, rentBurden, bigMacs, taxParts, confidence, inputs }
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
// does not list fall back to the city's fxPerUSD (Big Mac data dollar_ex, refreshed
// monthly by scripts/update-col.js).
// ---------------------------------------------------------------------------
// FX date reported in computeJuice inputs.fx (matches the Big Mac release in data/cities.json).
export const FX_AS_OF = '2026-07-01';
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
// Tax model. Annual amounts in the local currency of the city. Single filer, no
// dependants, salary only, standard deductions, employee-side contributions.
// Mandatory public social insurance counts as tax; funded individual retirement
// accounts (401k, CH 2nd pillar, SG CPF, IN EPF, AU super, HK MPF) do not.
// Each rule returns { income, regional, social } (national income tax incl. surtaxes,
// state/province/canton/city income tax, employee social contributions).
// Brackets: [[upTo, rate], ...] or [[upTo, rateFrom, rateTo]] for a linearly rising
// marginal rate (German tariff zones). Sources: TAX_SOURCES below and docs/LIVABILITY.md.
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

const US_FED_2026 = [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [INF, 0.37]];
const US_STD_2026 = 16100;
const US_SS_BASE_2026 = 184500;

const US_STATE = {
  CA: (g) => ({ regional: pos(progressive(pos(g - 5706), [[10756, 0.01], [25499, 0.02], [40245, 0.04], [55866, 0.06], [70612, 0.08], [360659, 0.093], [432787, 0.103], [721314, 0.113], [1e6, 0.123], [INF, 0.133]]) - 153), social: 0.013 * g }),
  NY: (g) => ({ regional: progressive(pos(g - 8000), [[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5e6, 0.0965], [25e6, 0.103], [INF, 0.109]]) }),
  WA: (g) => ({ social: 0.0058 * g }),
  TX: () => ({}), FL: () => ({}), TN: () => ({}), NV: () => ({}),
  MA: (g) => ({ regional: 0.05 * pos(g - 4400) + 0.04 * pos(g - 1083150) }),
  GA: (g) => ({ regional: 0.0519 * pos(g - 12000) }),
  DC: (g) => ({ regional: progressive(pos(g - 15000), [[10000, 0.04], [40000, 0.06], [60000, 0.065], [250000, 0.085], [500000, 0.0925], [1e6, 0.0975], [INF, 0.1075]]) }),
  AL: (g, fed) => ({ regional: progressive(pos(g - fed - 2500 - 1500), [[500, 0.02], [3000, 0.04], [INF, 0.05]]) }),
  OH: (g) => ({ regional: 0.0275 * pos(g - 26050) }),
  VA: (g) => ({ regional: progressive(pos(g - 8500 - 930), [[3000, 0.02], [5000, 0.03], [17000, 0.05], [INF, 0.0575]]) }),
  IL: (g) => ({ regional: 0.0495 * pos(g - 2850) }),
  CO: (g) => ({ regional: 0.044 * pos(g - US_STD_2026) }),
  PA: (g) => ({ regional: 0.0307 * g }),
  NC: (g) => ({ regional: 0.0399 * pos(g - 12750) }),
  OR: (g) => ({ regional: progressive(pos(g - 2835), [[4400, 0.0475], [11050, 0.0675], [125000, 0.0875], [INF, 0.099]]) }),
  UT: (g) => ({ regional: 0.045 * g }),
  AZ: (g) => ({ regional: 0.025 * pos(g - US_STD_2026) }),
  MN: (g) => ({ regional: progressive(pos(g - 14950), [[32570, 0.0535], [106990, 0.068], [198630, 0.0785], [INF, 0.0985]]) }),
  MI: (g) => ({ regional: 0.0425 * pos(g - 5800) }),
  MD: (g) => ({ regional: progressive(pos(g - 3350), [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [500000, 0.0575], [1e6, 0.0625], [INF, 0.065]]) }),
};

const US_LOCAL = {
  NYC: (g) => progressive(pos(g - 8000), [[12000, 0.03078], [25000, 0.03762], [50000, 0.03819], [INF, 0.03876]]),
  COLUMBUS: (g) => 0.025 * g,
  PHILADELPHIA: (g) => 0.0374 * g,
  PITTSBURGH: (g) => 0.03 * g,
  DETROIT: (g) => 0.024 * pos(g - 600),
  PORTLAND: (g) => 0.025 * pos(g - 125000) + 0.015 * pos(g - 250000),
  'MD-COUNTY': (g) => 0.032 * pos(g - 3350),
};

const GB_RUK = [[37700, 0.20], [125140, 0.40], [INF, 0.45]];
const GB_SCT = [[2827, 0.19], [14921, 0.20], [31092, 0.21], [62430, 0.42], [125140, 0.45], [INF, 0.48]];
const CH_ZH = [[7000, 0], [15000, 0.04], [30000, 0.09], [50000, 0.15], [80000, 0.21], [120000, 0.27], [200000, 0.32], [300000, 0.36], [INF, 0.40]];
const CH_GE = [[17000, 0], [25000, 0.08], [40000, 0.14], [60000, 0.21], [90000, 0.27], [130000, 0.32], [200000, 0.37], [300000, 0.41], [INF, 0.445]];
const ES_GEN = [[12450, 0.19], [20200, 0.24], [35200, 0.30], [60000, 0.37], [300000, 0.45], [INF, 0.47]];
const ES_MD = [[12450, 0.18], [20200, 0.23], [35200, 0.28], [60000, 0.355], [INF, 0.45]];
const ES_CT = [[12450, 0.215], [17707, 0.24], [21000, 0.26], [33007, 0.29], [53407, 0.335], [90000, 0.405], [120000, 0.44], [175000, 0.47], [INF, 0.50]];
const CA_FED_2026 = [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [INF, 0.33]];

function caPayroll(g, qc) {
  const pens = qc ? 0.063 : 0.0595;
  const base = pens * pos(min(g, 74600) - 3500);
  const second = 0.04 * pos(min(g, 85000) - 74600);
  const ei = (qc ? 0.013 : 0.0163) * min(g, 68900);
  const qpip = qc ? 0.0043 * min(g, 103000) : 0;
  // Credit base: the base-rate part of CPP/QPP (4.95% / 5.3%) plus EI/QPIP.
  const creditable = base * ((qc ? 0.053 : 0.0495) / pens) + ei + qpip;
  return { social: base + second + ei + qpip, creditable };
}

const CA_PROV = {
  ON: (g, credit) => {
    const basic = pos(progressive(g, [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [INF, 0.1316]]) - 0.0505 * (12989 + credit));
    const surtax = 0.2 * pos(basic - 5818) + 0.36 * pos(basic - 7446);
    const health = g > 200600 ? 900 : g > 72600 ? 750 : g > 48600 ? 600 : g > 36000 ? 450 : g > 20000 ? 300 : 0;
    return basic + surtax + health;
  },
  BC: (g, credit) => pos(progressive(g, [[49279, 0.0506], [98560, 0.077], [113158, 0.105], [137407, 0.1229], [186306, 0.147], [259829, 0.168], [INF, 0.205]]) - 0.0506 * (12932 + credit)),
  QC: (g, credit) => pos(progressive(g, [[53255, 0.14], [106495, 0.19], [129590, 0.24], [INF, 0.2575]]) - 0.14 * (18571 + credit)),
};

function jpEmploymentDeduction(g) {
  if (g <= 1.9e6) return min(g, 650000);
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

/** Country rules: (grossLocal, jurisdiction) -> { income, regional, social }. */
const RULES = {
  US(g, j) {
    const income = progressive(pos(g - US_STD_2026), US_FED_2026);
    let social = 0.062 * min(g, US_SS_BASE_2026) + 0.0145 * g + 0.009 * pos(g - 200000);
    const st = j.region && US_STATE[j.region] ? US_STATE[j.region](g, income) : null;
    if (j.region && !st) throw new Error(`no US state tax rule for ${j.region}`);
    let regional = st?.regional || 0;
    social += st?.social || 0;
    if (j.local) {
      if (!US_LOCAL[j.local]) throw new Error(`no US local tax rule for ${j.local}`);
      regional += US_LOCAL[j.local](g);
    }
    return { income, regional, social };
  },
  GB(g, j) {
    const allowance = pos(12570 - pos(g - 100000) / 2);
    const income = progressive(pos(g - allowance), j.region === 'SCT' ? GB_SCT : GB_RUK);
    const social = 0.08 * pos(min(g, 50270) - 12570) + 0.02 * pos(g - 50270);
    return { income, social };
  },
  IE(g) {
    const paye = pos(0.2 * min(g, 44000) + 0.4 * pos(g - 44000) - 4000);
    const usc = progressive(g, [[12012, 0.005], [28700, 0.02], [70044, 0.03], [INF, 0.08]]);
    return { income: paye + usc, social: 0.0435 * g };
  },
  CH(g, j) {
    const social = 0.053 * g + 0.011 * min(g, 148200) + 0.01 * min(g, 148200);
    const taxable = pos(g - social - min(4000, 0.03 * g) - 2900);
    return { income: progressive(taxable, j.region === 'GE' ? CH_GE : CH_ZH), social };
  },
  DE(g) {
    const pension = 0.093 * min(g, 101400);
    const unemployment = 0.013 * min(g, 101400);
    const health = 0.0875 * min(g, 69750);
    const care = 0.024 * min(g, 69750);
    const taxable = pos(g - 1230 - pension - 0.96 * (health + care));
    const est = progressive(taxable, [[12348, 0], [17799, 0.14, 0.2397], [69878, 0.2397, 0.42], [277825, 0.42], [INF, 0.45]]);
    const soli = est > 20350 ? min(0.055 * est, 0.119 * (est - 20350)) : 0;
    return { income: est + soli, social: pension + unemployment + health + care };
  },
  FR(g) {
    const social = 0.22 * min(g, 192240) + 0.097 * pos(g - 192240);
    let taxable = g - social + 0.029 * 0.9825 * g;
    taxable -= min(0.1 * taxable, 14426);
    return { income: progressive(pos(taxable), [[11497, 0], [29315, 0.11], [83823, 0.30], [180294, 0.41], [INF, 0.45]]), social };
  },
  NL(g) {
    const box1 = progressive(g, [[38883, 0.3575], [78426, 0.3756], [INF, 0.495]]);
    const general = pos(3115 - 0.06398 * pos(g - 29736));
    const labour = g >= 45592 ? pos(5685 - 0.0651 * (g - 45592)) : min(5685, 0.23 * g);
    return { income: pos(box1 - general - labour) };
  },
  ES(g, j) {
    const social = 0.0647 * min(g, 61214);
    const sched = j.region === 'MD' ? ES_MD : j.region === 'CT' ? ES_CT : ES_GEN;
    const taxable = pos(g - social - 2000);
    return { income: pos(progressive(taxable, sched) - progressive(5550, sched)), social };
  },
  PT(g) {
    const social = 0.11 * g;
    const taxable = pos(g - Math.max(4462.15, social));
    const irs = progressive(taxable, [[8059, 0.13], [12160, 0.165], [17233, 0.22], [22306, 0.25], [28400, 0.32], [41629, 0.355], [44987, 0.435], [83696, 0.45], [INF, 0.48]]);
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
    const regular = progressive((net * 12) / 14, [[13308, 0], [21617, 0.2], [35836, 0.3], [69166, 0.4], [103072, 0.48], [1e6, 0.5], [INF, 0.55]]);
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
    const taxable = pos(g - 17000);
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
    const bracket = progressive(g, [[217400, 0], [306050, 0.017], [697150, 0.04], [942400, 0.137], [1410750, 0.167], [INF, 0.177]]);
    return { income: 0.22 * ordinary + bracket, social: 0.077 * g };
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
    const social = 0.0427 * min(g, 90264) + 0.1217 * pos(min(g, 608340) - 90264);
    const income = pos(progressive(g, [[84120, 0.10], [120720, 0.14], [193800, 0.20], [269280, 0.31], [560280, 0.35], [721560, 0.47], [INF, 0.50]]) - 6534);
    return { income, social };
  },
  AE: () => ({}),
  SA: () => ({}),
  JP(g) {
    const total = g - jpEmploymentDeduction(g);
    const social = 0.04955 * min(g, 16680000) + 0.0915 * min(g, 7800000) + 0.0055 * g;
    const basic = total <= 23.5e6 ? 580000 : total <= 24e6 ? 480000 : total <= 24.5e6 ? 320000 : total <= 25e6 ? 160000 : 0;
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
  HK(g) {
    const net = pos(g - min(18000, 0.05 * g));
    const prog = progressive(pos(net - 132000), [[50000, 0.02], [100000, 0.06], [150000, 0.10], [200000, 0.14], [INF, 0.17]]);
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
    const { social, creditable } = caPayroll(g, qc);
    let income = pos(progressive(g, CA_FED_2026) - 0.14 * (16452 + 1501 + creditable));
    if (qc) income *= 1 - 0.165; // Quebec abatement
    const prov = CA_PROV[j.region];
    if (j.region && !prov) throw new Error(`no Canadian province tax rule for ${j.region}`);
    return { income, regional: prov ? prov(g, creditable) : 0, social };
  },
  MX(g) {
    const income = progressive(g, [[8952.49, 0.0192], [75984.55, 0.064], [133536.07, 0.1088], [155229.80, 0.16], [185852.57, 0.1792], [374837.88, 0.2136], [590795.99, 0.2352], [1127926.84, 0.30], [1503902.46, 0.32], [4511707.37, 0.34], [INF, 0.35]]);
    return { income, social: 0.02775 * min(g, 1070454) };
  },
  BR(g) {
    const m = g / 12;
    const inss = progressive(min(m, 8157.41), [[1518, 0.075], [2793.88, 0.09], [4190.83, 0.12], [8157.41, 0.14]]);
    const irpf = progressive(pos(m - inss), [[2428.8, 0], [2826.65, 0.075], [3751.05, 0.15], [4664.68, 0.225], [INF, 0.275]]);
    return { income: irpf * 12, social: inss * 12 };
  },
};

const NYS = 'https://www.tax.ny.gov/pit/file/tax-tables/';
/**
 * Where each rule comes from. verified: re-checked by web search on 2026-10-02 (see
 * docs/process/livability.md); approximate: a simplified model of a more complex system.
 */
export const TAX_SOURCES = Object.freeze({
  US: { checkedVia: ['https://kpmg.com/us/en/taxnewsflash/news/2025/10/tnf-rev-proc-2025-32-inflation-adjustments-for-2026-individual-taxpayers.html', 'https://www.journalofaccountancy.com/news/2025/oct/social-security-wage-base-and-cola-announced-for-2026/'], name: 'IRS Rev. Proc. 2025-32 (2026 brackets, $16,100 standard deduction); SSA 2026 wage base $184,500; Medicare 1.45% + 0.9% over $200K', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', alt: 'https://www.ssa.gov/oact/cola/cbb.html', asOf: '2026', verified: true },
  'US-CA': { checkedVia: ['https://www.efile.com/california-tax-forms-rates-and-brackets', 'https://hrwatchdog.calchamber.com/2025/12/2026-social-security-taxable-wage-base-california-sdi-withholding-rate-increase/'], name: 'California FTB 2025 tax rate schedule X (single), $5,706 standard deduction, personal credit; EDD SDI 1.3% (2026, no wage cap)', url: 'https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf', alt: 'https://edd.ca.gov/en/payroll_taxes/rates_and_withholding', asOf: '2025 (brackets) / 2026 (SDI)', verified: true },
  'US-NY': { checkedVia: ['https://ustax.tools/new-york-tax-brackets-2026/'], name: 'New York State 2026 rates (lowest five brackets cut 0.1 pt), $8,000 standard deduction; tax-benefit recapture not modeled', url: NYS, asOf: '2026', verified: true },
  'US-WA': { name: 'No wage income tax; WA Cares long-term care premium 0.58% (PFML premium not modeled)', url: 'https://wacaresfund.wa.gov/', asOf: '2026', verified: false },
  'US-TX': { name: 'No state income tax on wages', url: 'https://comptroller.texas.gov/taxes/', asOf: '2026', verified: false },
  'US-FL': { name: 'No state income tax on wages', url: 'https://floridarevenue.com/taxes/', asOf: '2026', verified: false },
  'US-TN': { name: 'No state income tax on wages', url: 'https://www.tn.gov/revenue.html', asOf: '2026', verified: false },
  'US-NV': { name: 'No state income tax on wages', url: 'https://tax.nv.gov/', asOf: '2026', verified: false },
  'US-MA': { name: 'Massachusetts 5% flat + 4% surtax over $1,083,150, $4,400 exemption', url: 'https://www.mass.gov/info-details/massachusetts-tax-rates', asOf: '2025', verified: false },
  'US-GA': { name: 'Georgia 5.19% flat (HB 111), $12,000 standard exemption', url: 'https://dor.georgia.gov/', asOf: '2025', verified: false },
  'US-DC': { name: 'District of Columbia 4%-10.75% brackets, federal-conforming standard deduction ($15,000)', url: 'https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates', asOf: '2025', verified: false },
  'US-AL': { name: 'Alabama 2%/4%/5% with federal income tax deduction, $2,500 standard deduction, $1,500 exemption (Huntsville: no occupational tax)', url: 'https://www.revenue.alabama.gov/', asOf: '2025', verified: false },
  'US-OH': { name: 'Ohio flat 2.75% above $26,050 (HB 96, from 2026)', url: 'https://tax.ohio.gov/', asOf: '2026', verified: false },
  'US-VA': { name: 'Virginia 2%-5.75%, $8,500 standard deduction, $930 exemption', url: 'https://www.tax.virginia.gov/', asOf: '2025', verified: false },
  'US-IL': { name: 'Illinois 4.95% flat, $2,850 exemption', url: 'https://tax.illinois.gov/', asOf: '2025', verified: false },
  'US-CO': { name: 'Colorado 4.4% of federal taxable income', url: 'https://tax.colorado.gov/', asOf: '2025', verified: false },
  'US-PA': { name: 'Pennsylvania 3.07% flat on compensation', url: 'https://www.revenue.pa.gov/', asOf: '2026', verified: false },
  'US-NC': { name: 'North Carolina 3.99% flat (scheduled 2026 rate), $12,750 standard deduction', url: 'https://www.ncdor.gov/', asOf: '2026', verified: false },
  'US-OR': { name: 'Oregon 4.75%-9.9%, standard deduction ~$2,835 (federal tax subtraction not modeled)', url: 'https://www.oregon.gov/dor/', asOf: '2025', verified: false },
  'US-UT': { name: 'Utah 4.5% flat (taxpayer credit not modeled)', url: 'https://tax.utah.gov/', asOf: '2025', verified: false },
  'US-AZ': { name: 'Arizona 2.5% flat of federal-conforming taxable income', url: 'https://azdor.gov/', asOf: '2025', verified: false },
  'US-MN': { name: 'Minnesota 5.35%-9.85%, $14,950 standard deduction', url: 'https://www.revenue.state.mn.us/minnesota-income-tax-rates-and-brackets', asOf: '2025', verified: false },
  'US-MI': { name: 'Michigan 4.25% flat, $5,800 exemption', url: 'https://www.michigan.gov/taxes', asOf: '2025', verified: false },
  'US-MD': { name: 'Maryland 2%-6.5% (2025 law adds 6.25%/6.5% top brackets), $3,350 standard deduction', url: 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php', asOf: '2025', verified: false },
  'US-LOCAL-NYC': { checkedVia: ['https://ustax.tools/new-york-tax-brackets-2026/'], name: 'New York City resident income tax 3.078%-3.876%', url: NYS, asOf: '2026', verified: true },
  'US-LOCAL-COLUMBUS': { name: 'Columbus, OH city income tax 2.5%', url: 'https://www.columbus.gov/Services/Income-Tax', asOf: '2025', verified: false },
  'US-LOCAL-PHILADELPHIA': { name: 'Philadelphia resident wage tax 3.74%', url: 'https://www.phila.gov/services/payments-assistance-taxes/taxes/income-taxes/', asOf: '2025', verified: false },
  'US-LOCAL-PITTSBURGH': { name: 'Pittsburgh earned income tax 3% (city 1% + school district 2%)', url: 'https://pittsburghpa.gov/finance/tax-descriptions', asOf: '2025', verified: false },
  'US-LOCAL-DETROIT': { name: 'Detroit resident city income tax 2.4%', url: 'https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax', asOf: '2025', verified: false },
  'US-LOCAL-PORTLAND': { name: 'Portland area: Metro supportive housing 1% + Multnomah preschool 1.5% over $125K, +1.5% over $250K', url: 'https://www.portland.gov/revenue/personal-tax', asOf: '2025', verified: false },
  'US-LOCAL-MD-COUNTY': { name: 'Maryland local income tax, Baltimore City 3.2%', url: 'https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php', asOf: '2025', verified: false },
  GB: { checkedVia: ['https://moneytothemasses.com/tax/uk-tax-allowances-and-rates-for-2026-27-and-useful-tax-calculators'], name: 'HMRC 2026/27: personal allowance £12,570 (tapered over £100K), 20/40/45%; employee NICs 8% to £50,270, 2% above', url: 'https://www.gov.uk/government/publications/rates-and-allowances-income-tax', alt: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027', asOf: '2026/27', verified: true },
  'GB-SCT': { name: 'Scottish income tax bands 19/20/21/42/45/48% (2025/26 band widths)', url: 'https://www.gov.scot/publications/scottish-income-tax-2025-2026-factsheet/', asOf: '2025/26', verified: false },
  IE: { checkedVia: ['https://www.zellis.com/wp-content/uploads/2026/01/Tax-Facts-Ireland-v1.0-Jan-2026_220126.pdf', 'https://vialtopartners.com/regional-alerts/ireland-employment-tax-budget-2026-key-measures-impacting-employers-and-employees'], name: 'Revenue 2026: 20% to €44,000 then 40%, €4,000 personal + employee credits; USC 0.5/2/3/8%; PRSI 4.35% from 1 Oct 2026', url: 'https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx', alt: 'https://www.revenue.ie/en/jobs-and-pensions/usc/standard-rates-thresholds.aspx', asOf: '2026', verified: true },
  CH: { name: 'Approximation: combined federal + cantonal + municipal marginal schedule for a single person in Zurich city (Geneva: separate schedule), calibrated to the cantonal tax calculators; AHV/IV/EO 5.3%, ALV 1.1%, NBU ~1% (2nd-pillar pension excluded)', url: 'https://www.zh.ch/de/steuern-finanzen/steuern/steuern-natuerliche-personen/steuerrechner.html', alt: 'https://www.estv.admin.ch/estv/en/home/direct-federal-tax.html', asOf: '2025', verified: false, approximate: true, estimated: true },
  'CH-ZH': { name: 'Zurich city (canton ZH, municipal multiplier ~119%), see CH', url: 'https://www.zh.ch/de/steuern-finanzen/steuern/steuern-natuerliche-personen/steuerrechner.html', asOf: '2025', verified: false, approximate: true, estimated: true },
  'CH-GE': { name: 'Geneva (canton GE), see CH', url: 'https://www.ge.ch/calculer-mes-impots', asOf: '2025', verified: false, approximate: true, estimated: true },
  DE: { checkedVia: ['https://www.taxmaro.com/post/grundfreibetrag-steuerfreibetrag-2026', 'https://www.steuerberater-berlin-schuermann.de/steuernews_mandanten/dezember_2025/steuertarif_2026/'], name: '§32a EStG 2026 tariff (Grundfreibetrag €12,348, 42% from €69,879, 45% from €277,826), Soli with Freigrenze; social: pension 9.3% + unemployment 1.3% to €101,400, health 7.3% + 1.45% (half of 2.9% avg Zusatzbeitrag) + care 2.4% (childless) to €69,750', url: 'https://www.bundesfinanzministerium.de/', asOf: '2026', verified: true },
  FR: { name: 'Barème 2025 (1 part): 0/11/30/41/45%, 10% professional deduction (cap €14,426); employee contributions ~22% (cadre) to 4 PASS, CSG/CRDS above', url: 'https://www.service-public.fr/particuliers/vosdroits/F1419', asOf: '2025', verified: false, approximate: true },
  NL: { checkedVia: ['https://www.kvk.nl/en/finance/dutch-tax-rates-in-2026/', 'https://www.leideninternationalcentre.nl/get-advice/blogs/2026-tax-changes-in-the-netherlands'], name: 'Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. national insurance); general credit €3,115, labour credit €5,685 with phase-outs. 30% ruling not modeled', url: 'https://www.belastingdienst.nl/', asOf: '2026', verified: true },
  ES: { name: 'IRPF state + regional scales (general; Madrid and Catalonia approximated), €5,550 personal minimum, €2,000 work deduction; social security 6.47% to €61,214', url: 'https://sede.agenciatributaria.gob.es/', asOf: '2025', verified: false, approximate: true },
  PT: { name: 'IRS 2025 scale 13%-48%, solidarity surcharge 2.5%/5%, specific deduction €4,462.15; social security 11%. IFICI regime not modeled', url: 'https://info.portaldasfinancas.gov.pt/', asOf: '2025', verified: false },
  IT: { name: 'IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan municipal 0.8%; INPS 9.19% to €120,607', url: 'https://www.agenziaentrate.gov.it/', asOf: '2026', verified: false, approximate: true },
  AT: { name: 'Einkommensteuertarif 2025 0-55% on 12 regular salaries, 13th/14th at 6%; social insurance 18.07% to €90,300', url: 'https://www.bmf.gv.at/themen/steuern/arbeitnehmerinnen/einkommensteuer/einkommensteuertarif.html', asOf: '2025', verified: false, approximate: true },
  BE: { name: 'Federal rates 25/40/45/50%, basic allowance €10,910, flat professional expenses (30%, cap €5,930), communal surcharge ~7%; social 13.07%', url: 'https://finance.belgium.be/en/private-individuals/tax-return/rates', asOf: '2025', verified: false, approximate: true },
  SE: { name: 'Stockholm municipal tax 30.55% + state tax 20% above SEK 643,000; job tax credit approximated (pension fee is credited, net zero)', url: 'https://www.skatteverket.se/', asOf: '2026', verified: false, approximate: true },
  DK: { name: 'AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 2026 middle/top/top-top tax 7.5%/7.5%/5%, personal allowance DKK 54,100, employment deduction 12.75%', url: 'https://skat.dk/', asOf: '2026', verified: false, approximate: true },
  NO: { name: 'Tax on ordinary income 22%, bracket tax 1.7%-17.7% (2025 thresholds), minimum standard deduction 46% (cap NOK 92,000), personal allowance NOK 108,550; national insurance 7.7%', url: 'https://www.skatteetaten.no/en/rates/', asOf: '2025', verified: false },
  FI: { name: 'Approximation: state progressive tax + Helsinki municipal 5.3% as one schedule; employee contributions ~9% (pension, unemployment, health)', url: 'https://www.vero.fi/en/individuals/', asOf: '2025', verified: false, approximate: true, estimated: true },
  PL: { name: 'PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 costs; ZUS 11.26% to 30x cap + sickness 2.45%; health 9%', url: 'https://www.podatki.gov.pl/', asOf: '2026', verified: false },
  CZ: { name: 'PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped), health 4.5%', url: 'https://www.financnisprava.cz/', asOf: '2026', verified: false, approximate: true },
  EE: { name: 'Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2nd pillar excluded)', url: 'https://www.emta.ee/en/private-client/taxes-and-payment/income-tax', asOf: '2026', verified: false },
  IL: { name: 'Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit points; Bituach Leumi + health 4.27% / 12.17% (pension fund excluded)', url: 'https://www.gov.il/en/departments/israel_tax_authority', asOf: '2025', verified: false },
  AE: { name: 'No personal income tax; no social security for expatriates', url: 'https://tax.gov.ae/', asOf: '2026', verified: false },
  SA: { name: 'No personal income tax on employment income; GOSI annuities apply to Saudi nationals only', url: 'https://zatca.gov.sa/', asOf: '2026', verified: false },
  JP: { checkedVia: ['https://kpmg.com/us/en/taxnewsflash/news/2025/03/japan-additional-2025-tax-reform-proposals-concern-basic-deduction.html'], name: 'Income tax 5%-45% x 1.021 reconstruction surtax, employment income deduction (min ¥650,000), basic deduction ¥580,000 (2025 reform); resident tax 10% + ¥5,000; health ~4.96%, pension 9.15% (capped), employment insurance 0.55%', url: 'https://www.nta.go.jp/english/taxes/individual/12012.htm', asOf: '2025/2026', verified: true, approximate: true },
  KR: { name: 'Income tax 6%-45% + 10% local income tax, employment income deduction, ₩500,000 wage-earner credit (approx); NPS 4.75% (capped), NHI 3.595% + LTC, EI 0.9%', url: 'https://www.nts.go.kr/english/', asOf: '2026', verified: false, approximate: true },
  SG: { name: 'IRAS resident rates YA2024 onward 0%-24%, S$1,000 earned income relief; CPF not applied (Employment Pass holders do not contribute)', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates', asOf: 'YA2026', verified: false },
  HK: { name: 'Salaries tax: progressive 2%-17% after HK$132,000 basic allowance, capped at the standard rate 15% (16% over HK$5M); MPF (funded) deducted, not counted as tax', url: 'https://www.ird.gov.hk/eng/tax/sal.htm', asOf: '2025/26', verified: false },
  TW: { name: 'Income tax 5%-40%, exemption + standard + salary deductions NT$446,000; labour and health insurance (capped)', url: 'https://www.etax.nat.gov.tw/', asOf: '2025', verified: false, approximate: true },
  IN: { checkedVia: ['https://bankbazaar.com/tax/income-tax-slabs.html'], name: 'New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduction, section 87A rebate to ₹12 lakh, surcharge to 25%, 4% cess; professional tax ₹2,500 (KA/MH/TS). EPF (funded) excluded', url: 'https://incometaxindia.gov.in/', asOf: 'FY2026-27', verified: true },
  AU: { checkedVia: ['https://www.superguide.com.au/how-super-works/income-tax-rates-brackets'], name: 'ATO resident rates 2026-27: 0/15/30/37/45% ($18,200/$45,000/$135,000/$190,000), LITO, Medicare levy 2%. Super is employer-paid on top, excluded', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents', asOf: '2026-27', verified: true },
  NZ: { name: 'IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39%; ACC earners levy 1.67% (capped). KiwiSaver excluded', url: 'https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals', asOf: '2025/26', verified: false },
  CA: { checkedVia: ['https://www.mun.ca/hr/media/production/memorial/administrative/human-resources/media-library/services/2026-tax-changes.pdf'], name: 'CRA 2026 federal 14/20.5/26/29/33%, BPA $16,452, Canada employment amount; CPP 5.95% to $74,600 + CPP2 4% to $85,000; EI 1.63% to $68,900', url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html', alt: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html', asOf: '2026', verified: true },
  'CA-ON': { checkedVia: ['https://globaltaxnews.ey.com/news/2026-0747-canada-ontario-budget-2026'], name: 'Ontario 2026 5.05/9.15/11.16/12.16/13.16%, surtax (thresholds indexed from 2025, approx), Ontario Health Premium', url: 'https://data.ontario.ca/dataset/personal-income-tax-rates-and-credits', asOf: '2026', verified: true, approximate: true },
  'CA-BC': { name: 'British Columbia 2025 brackets 5.06%-20.5%', url: 'https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates', asOf: '2025', verified: false },
  'CA-QC': { name: 'Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6.3%, QPIP 0.43%, EI 1.30%', url: 'https://www.revenuquebec.ca/en/citizens/income-tax-return/', asOf: '2025', verified: false, approximate: true },
  MX: { name: 'ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee ~2.775% (capped at 25 UMA)', url: 'https://www.sat.gob.mx/', asOf: '2025', verified: false, approximate: true },
  BR: { name: 'IRPF monthly table (2025) 0%-27.5% and INSS 7.5%-14% to the ceiling, x12 (13th salary not modeled; 2026 low-income exemption irrelevant at these salaries)', url: 'https://www.gov.br/receitafederal/', asOf: '2025', verified: false, approximate: true },
});

/** TAX_SOURCES keys that apply to a jurisdiction { country, region, local }. */
export function taxKeys(j) {
  const keys = [j.country];
  if (j.region && TAX_SOURCES[`${j.country}-${j.region}`]) keys.push(`${j.country}-${j.region}`);
  else if (j.country === 'US' && j.region) keys.push(`US-${j.region}`);
  if (j.local) keys.push(j.country === 'US' ? `US-LOCAL-${j.local}` : `${j.country}-LOCAL-${j.local}`);
  return keys.filter((k) => k !== `${j.country}-LOCAL-PROF-TAX`);
}

/** Annual tax in local currency: { income, regional, social, total }. Throws for an unknown country. */
export function taxFor(grossLocal, jurisdiction) {
  const j = jurisdiction || {};
  const rule = RULES[j.country];
  if (!rule) throw new Error(`no tax rule for country ${j.country}`);
  const g = pos(Number(grossLocal) || 0);
  const r = rule(g, j);
  const income = r.income || 0;
  const regional = r.regional || 0;
  const social = r.social || 0;
  return { income, regional, social, total: income + regional + social };
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
 *   rent: 'center' | 'outside'   which quoted 1BR rent to use (default 'center')
 *   rentOverrideUSD: number      user-entered monthly rent in USD; replaces the dataset rent
 *   baselineUSD: number          NYC basket (default NYC_BASKET_USD)
 * All money values are annual USD, rounded to whole dollars. Every result carries `inputs`
 * (each value with its source and as-of date) and a `confidence` ("high" | "medium" | "low").
 * Throws (err.code = 'NO_RENT') when the city has no rent and no override was given.
 */
export function computeJuice(salaryUSD, city, opts = {}) {
  if (!city) throw new Error('computeJuice: city record required');
  const gross = pos(Number(salaryUSD) || 0);
  const palette = FX_TO_USD[String(city.currency || 'USD').toUpperCase()] != null;
  const usdPer = usdPerUnit(city.currency, city) || (city.fxPerUSD > 0 ? 1 / city.fxPerUSD : null);
  if (!usdPer) throw new Error(`computeJuice: no FX for ${city.currency}`);
  const jur = city.tax || { country: city.country };
  const t = taxFor(gross / usdPer, jur);
  const tax = t.total * usdPer;

  const override = Number(opts.rentOverrideUSD);
  const hasOverride = opts.rentOverrideUSD != null && Number.isFinite(override) && override >= 0;
  const outside = opts.rent === 'outside';
  const localField = outside ? 'rent1brOutsideLocal' : 'rent1brCenterLocal';
  const usdField = outside ? 'rent1brOutsideUSD' : 'rent1brCenterUSD';
  let rentMonthly;
  let rentInput;
  if (hasOverride) {
    rentMonthly = override;
    rentInput = { monthlyUSD: Math.round(override), basis: 'override', class: 'user', confidence: 'high', source: { name: 'Rent entered by the user', url: null, asOf: null } };
  } else {
    const local = city[localField];
    rentMonthly = local != null ? local * usdPer : city[usdField];
    if (rentMonthly == null) {
      const err = new Error(`computeJuice: ${city.key} has no rent; pass opts.rentOverrideUSD`);
      err.code = 'NO_RENT';
      throw err;
    }
    const src = city.sources?.[localField] || city.sources?.[usdField];
    const cls = sourceClass(src);
    rentInput = {
      monthlyUSD: Math.round(rentMonthly),
      basis: outside ? 'outside' : 'center',
      ...(local != null ? { monthlyLocal: local, currency: city.currency } : {}),
      class: cls,
      confidence: CLASS_CONFIDENCE[cls],
      source: brief(src),
    };
  }
  const rent = rentMonthly * 12;

  const baseline = opts.baselineUSD > 0 ? opts.baselineUSD : NYC_BASKET_USD;
  const living = ((Number(city.costIndex) || 0) / 100) * baseline;
  // Round the parts first so the waterfall adds up exactly: net = gross - tax - rent - living.
  const parts = { gross: Math.round(gross), tax: Math.round(tax), rent: Math.round(rent), living: Math.round(living) };
  const net = parts.gross - parts.tax - parts.rent - parts.living;
  const score = Math.round(scoreFromNet(net)); // grade from the shown (rounded) score
  const afterTax = gross - tax;

  const keys = taxKeys(jur);
  const ciSrc = city.sources?.costIndex;
  const ciClass = sourceClass(ciSrc);
  const inputs = {
    rent: rentInput,
    tax: {
      jurisdiction: keys,
      effectiveRate: gross > 0 ? Math.round((1000 * tax) / gross) / 1000 : 0,
      confidence: taxConfidence(keys),
      sources: keys.map((k) => ({ key: k, name: TAX_SOURCES[k]?.name, url: TAX_SOURCES[k]?.url, asOf: TAX_SOURCES[k]?.asOf, verified: !!TAX_SOURCES[k]?.verified })),
    },
    costIndex: {
      value: city.costIndex,
      baselineUSD: baseline,
      class: ciClass,
      confidence: CLASS_CONFIDENCE[ciClass],
      source: brief(ciSrc),
      ...(ciSrc?.method ? { method: ciSrc.method } : {}),
    },
    fx: { currency: city.currency, usdPerUnit: usdPer, source: palette ? 'FX_PER_USD (Big Mac data dollar_ex, shared with public/viz/palette.js)' : 'city fxPerUSD (Big Mac data dollar_ex)', asOf: palette ? FX_AS_OF : city.sources?.fxPerUSD?.asOf || null },
    bigMac: { usd: city.bigMacUSD, source: brief(city.sources?.bigMacUSD) },
  };

  const out = {
    ...parts,
    net,
    score,
    grade: gradeFor(score, net),
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

/**
 * Sets job.juice = { best: { city, ...computeJuice }, byLocation: [{ locationName, city, ...computeJuice }],
 * salaryUSD } or null (no salary, quarantined salary, unknown currency, or no matching city).
 * Uses salary.mid (annualized). When some matched locations use the salary's currency, only
 * those are scored (a USD range posted for "SF | London" is not applied to London); otherwise
 * all matches are scored and flagged currencyMismatch. Locations whose city has no rent are
 * skipped unless opts.rentOverrides[cityKey] (monthly USD) supplies one. Returns the job.
 */
export function attachJuice(job, cities, opts = {}) {
  if (!job || typeof job !== 'object') return job;
  job.juice = null;
  const s = job.salary;
  if (!s || !Number.isFinite(Number(s.mid))) return job;
  const cur = String(s.currency || 'USD').toUpperCase();
  const salaryUSD = toUSD(Number(s.mid), cur, cities);
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
  const same = matches.filter((m) => m.city.currency === cur);
  const use = same.length ? same : matches;
  const doc = cities && !Array.isArray(cities) ? cities : null;
  const o = { ...opts };
  if (!(o.baselineUSD > 0) && doc?.baseline?.nycBasketUSD > 0) o.baselineUSD = doc.baseline.nycBasketUSD;

  const overrides = opts.rentOverrides || null; // { [cityKey]: monthly USD } from the user
  const byLocation = [];
  for (const m of use) {
    let j;
    const ov = overrides && overrides[m.city.key];
    try { j = computeJuice(salaryUSD, m.city, ov != null ? { ...o, rentOverrideUSD: ov } : o); } catch { continue; }
    const entry = { locationName: m.location.name || m.city.name, city: m.city.key, cityName: m.city.name, ...j };
    if (m.via === 'nearby') entry.proxy = true;
    if (!same.length) entry.currencyMismatch = true;
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
  };
  return job;
}

/** attachJuice over an array (mutates and returns it). */
export function attachJuiceAll(jobs, cities, opts) {
  for (const j of Array.isArray(jobs) ? jobs : []) attachJuice(j, cities, opts);
  return jobs;
}

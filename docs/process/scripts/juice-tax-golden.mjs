#!/usr/bin/env node
// Golden tax vectors for the Juice tax model (docs/process/juice-tax.md, docs/LIVABILITY.md §3).
//
// An independent re-computation of every tax rule: it does NOT import server/juice.js. Each case
// is worked out step by step from the published parameters, and the steps are written next to the
// expected numbers in test/fixtures/tax-golden.json, which test/juice-tax-golden.test.js compares
// with taxFor(). Where a parameter could not be read from an official source the vector says so
// (verified: false) and only pins the current model.
//
//   node docs/process/scripts/juice-tax-golden.mjs            # rewrite the fixture
//   node docs/process/scripts/juice-tax-golden.mjs --print    # print the cases instead
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FX_PER_USD } from '../../../public/viz/palette.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'tax-golden.json');
const INF = Infinity;
const pos = (x) => (x > 0 ? x : 0);
const min = Math.min;
const max = Math.max;
const r2 = (x) => Math.round(x * 100) / 100;
const f = (x) => (x === INF ? '∞' : r2(x).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const pct = (r) => `${r2(r * 100 * 1000) / 1000}%`;

/** Bracket tax with a narration: "label: 10% × 12,400 = 1,240 + ... = total". */
function br(label, x, brackets) {
  let lo = 0;
  let tax = 0;
  const parts = [];
  for (const [hi, rate] of brackets) {
    if (!(x > lo)) break;
    const w = min(x, hi) - lo;
    const t = w * rate;
    tax += t;
    if (rate) parts.push(`${pct(rate)} × ${f(w)} = ${f(t)}`);
    lo = hi;
  }
  return { tax, step: `${label} on ${f(x)}: ${parts.length ? parts.join(' + ') : '0'} = ${f(tax)}` };
}

const S = {
  irs: { url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', asOf: '2026' },
  pub15: { url: 'https://www.irs.gov/pub/irs-pdf/p15.pdf', asOf: '2026' },
  tc560: { url: 'https://www.irs.gov/taxtopics/tc560', asOf: '2026' },
  salt: { url: 'https://www.law.cornell.edu/uscode/text/26/164', asOf: '2026' },
  schA: { url: 'https://www.irs.gov/pub/irs-pdf/i1040sca.pdf', asOf: '2025' },
  s8812: { url: 'https://www.irs.gov/pub/irs-pdf/i1040s8.pdf', asOf: '2025' },
};

// ---------------------------------------------------------------- United States
const FED = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [INF, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [INF, 0.37]],
};
const STD = { single: 16100, mfj: 32200 };
const SS = 184500;
const saltCap = (g) => max(10000, 40400 - 0.3 * pos(g - 505000));

function fica(g, m, steps) {
  const ss = 0.062 * min(g, SS);
  const med = 0.0145 * g;
  const add = 0.009 * pos(g - (m ? 250000 : 200000));
  steps.push(`FICA: 6.2% × ${f(min(g, SS))} = ${f(ss)}; Medicare 1.45% × ${f(g)} = ${f(med)}; Additional Medicare 0.9% × ${f(pos(g - (m ? 250000 : 200000)))} = ${f(add)}`);
  return ss + med + add;
}
function fedTax(g, hh, ded, steps) {
  const fs = hh.married ? 'mfj' : 'single';
  const b = br(`Federal ${fs} schedule`, pos(g - ded), FED[fs]);
  steps.push(`Federal taxable income ${f(g)} - deduction ${f(ded)} = ${f(pos(g - ded))}`, b.step);
  let tax = b.tax;
  if (hh.kids) {
    const n = Math.ceil(pos(g - (hh.married ? 400000 : 200000)) / 1000);
    const ctc = pos(2200 * hh.kids - 50 * n);
    steps.push(`Child tax credit: $2,200 × ${hh.kids} - $50 × ${n} steps = ${f(ctc)}`);
    tax = pos(tax - ctc);
  }
  return tax;
}

const CA_X = [[11079, 0.01], [26264, 0.02], [41452, 0.04], [57542, 0.06], [72724, 0.08], [371479, 0.093], [445771, 0.103], [742953, 0.113], [INF, 0.123]];
const CA_Y = [[22158, 0.01], [52528, 0.02], [82904, 0.04], [115084, 0.06], [145448, 0.08], [742958, 0.093], [891542, 0.103], [1485906, 0.113], [INF, 0.123]];
const NYS = {
  single: [[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5e6, 0.0965], [25e6, 0.103], [INF, 0.109]],
  mfj: [[17150, 0.039], [23600, 0.044], [27900, 0.0515], [161550, 0.054], [323200, 0.059], [2155350, 0.0685], [5e6, 0.0965], [25e6, 0.103], [INF, 0.109]],
};
const NYC = { single: [[12000, 0.03078], [25000, 0.03762], [50000, 0.03819], [INF, 0.03876]], mfj: [[21600, 0.03078], [45000, 0.03762], [90000, 0.03819], [INF, 0.03876]] };
const frac4 = (x) => Math.round((min(pos(x), 50000) / 50000) * 1e4) / 1e4;

function nysTax(ti, agi, m, steps) {
  const b = br(`NYS ${m ? 'married' : 'single'} rates`, ti, NYS[m ? 'mfj' : 'single']);
  steps.push(b.step);
  if (agi <= 107650) return b.tax;
  // IT-2105-I tax computation worksheets
  const W = m ? { flat: 0.054, flatUpTo: 161550, ws: [[323200, 333, 807, 161550], [2155350, 1140, 3071, 323200], [5e6, 4211, 60350, 2155350], [25e6, 64561, 32500, 5e6]] }
    : { flat: 0.059, flatUpTo: 215400, ws: [[1077550, 567, 2047, 215400], [5e6, 2614, 30172, 1077550], [25e6, 32786, 32500, 5e6]] };
  if (ti <= W.flatUpTo) {
    const flat = W.flat * ti;
    if (agi >= 157650) { steps.push(`Worksheet 1: NYAGI ≥ 157,650, so ${pct(W.flat)} × ${f(ti)} = ${f(flat)}`); return flat; }
    const p = frac4(agi - 107650);
    const t = b.tax + (flat - b.tax) * p;
    steps.push(`Worksheet 1: ${f(b.tax)} + (${f(flat)} - ${f(b.tax)}) × ${p} = ${f(t)}`);
    return t;
  }
  for (const [upTo, base, inc, start] of W.ws) {
    if (ti <= upTo) {
      const p = frac4(agi - start);
      const t = b.tax + base + inc * p;
      steps.push(`Recapture worksheet (taxable ≤ ${f(upTo)}): ${f(b.tax)} + ${f(base)} + ${f(inc)} × ${p} = ${f(t)}`);
      return t;
    }
  }
  return b.tax;
}

const usPersons = (hh) => (hh.married ? 2 : 1) + hh.kids;
const STATE = {
  CA(g, hh, st) {
    const ti = pos(g - (hh.married ? 11412 : 5706));
    const b = br(`CA schedule ${hh.married ? 'Y' : 'X'} (2025)`, ti, hh.married ? CA_Y : CA_X);
    const n = Math.ceil(pos(g - (hh.married ? 504411 : 252203)) / 2500);
    const credit = (hh.married ? 2 : 1) * pos(153 - 6 * n);
    const bhst = 0.01 * pos(ti - 1e6);
    const sdi = 0.013 * g;
    st.push(`CA taxable ${f(g)} - standard deduction = ${f(ti)}`, b.step, `CA exemption credit ${hh.married ? '2 × ' : ''}max(0, 153 - 6 × ${n}) = ${f(credit)}; BHST 1% over $1M = ${f(bhst)}; SDI 1.3% × ${f(g)} = ${f(sdi)}`);
    return { regional: pos(b.tax - credit) + bhst, social: sdi, deductible: sdi, taxable: ti };
  },
  NY(g, hh, st) {
    const ti = pos(g - (hh.married ? 16050 : 8000) - 1000 * hh.kids);
    st.push(`NYS taxable ${f(g)} - standard deduction${hh.kids ? ' - $1,000 per dependent' : ''} = ${f(ti)}`);
    const tax = nysTax(ti, g, hh.married, st);
    const pay = min(0.00432 * g, 411.91) + min(0.005 * g, 31.2);
    st.push(`NY PFL min(0.432% × ${f(g)}, 411.91) + DBL min(0.5%, $0.60 × 52) = ${f(pay)}`);
    return { regional: tax, social: pay, deductible: pay, taxable: ti };
  },
  WA(g, hh, st) {
    const pfml = 0.0113 * 0.7143 * min(g, SS);
    const cares = 0.0058 * g;
    st.push(`WA Cares 0.58% × ${f(g)} = ${f(cares)}; PFML 1.13% × 71.43% × ${f(min(g, SS))} = ${f(pfml)}`);
    return { regional: 0, social: cares + pfml, deductible: pfml };
  },
  TX: () => ({ regional: 0 }),
  FL: () => ({ regional: 0 }),
  TN: () => ({ regional: 0 }),
  NV: () => ({ regional: 0 }),
  MA(g, hh, st) {
    const ficaWithheld = 0.062 * min(g, SS) + 0.0145 * g;
    const ti = pos(g - (hh.married ? 8800 : 4400) - 1000 * hh.kids - min(2000, ficaWithheld));
    const tax = 0.05 * ti + 0.04 * pos(ti - 1107750);
    const pfml = 0.0046 * min(g, SS);
    st.push(`MA taxable ${f(g)} - exemption - $2,000 FICA = ${f(ti)}; 5% = ${f(0.05 * ti)}; surtax 4% over 1,107,750 = ${f(0.04 * pos(ti - 1107750))}; PFML 0.46% × ${f(min(g, SS))} = ${f(pfml)}`);
    return { regional: tax, social: pfml, deductible: pfml, taxable: ti };
  },
  GA(g, hh, st) {
    const ti = pos(g - (hh.married ? 30000 : 15000) - 5000 * hh.kids);
    st.push(`GA 4.99% × (${f(g)} - standard deduction${hh.kids ? ' - $5,000 per dependent' : ''} = ${f(ti)}) = ${f(0.0499 * ti)}`);
    return { regional: 0.0499 * ti, taxable: ti };
  },
  DC(g, hh, st) {
    const ti = pos(g - (hh.married ? 30000 : 15000));
    const b = br('DC rates', ti, [[10000, 0.04], [40000, 0.06], [60000, 0.065], [250000, 0.085], [500000, 0.0925], [1e6, 0.0975], [INF, 0.1075]]);
    st.push(b.step);
    return { regional: b.tax, taxable: ti };
  },
  AL(g, hh, st, fed) {
    const m = hh.married;
    const [mx, fl, cut] = m ? [8500, 5000, 175] : [3000, 2500, 25];
    const std = g < 26000 ? mx : max(fl, mx - cut * (1 + Math.floor((g - 26000) / 500)));
    const dep = (g <= 50000 ? 1000 : g <= 100000 ? 500 : 300) * hh.kids;
    const ti = pos(g - fed - std - (m ? 3000 : 1500) - dep);
    const b = br('AL rates', ti, m ? [[1000, 0.02], [6000, 0.04], [INF, 0.05]] : [[500, 0.02], [3000, 0.04], [INF, 0.05]]);
    st.push(`AL taxable ${f(g)} - federal tax ${f(fed)} - standard ${f(std)} - exemption ${m ? 3000 : 1500}${dep ? ` - dependents ${dep}` : ''} = ${f(ti)}`, b.step);
    return { regional: b.tax, taxable: ti };
  },
  OH(g, hh, st) {
    const ex = g >= 500000 ? 0 : g > 80000 ? 1900 : g > 40000 ? 2150 : 2400;
    const ti = pos(g - ex * usPersons(hh));
    const tax = ti > 26050 ? 332 + 0.0275 * (ti - 26050) : 0;
    st.push(`OH taxable ${f(g)} - exemptions ${ex} × ${usPersons(hh)} = ${f(ti)}; $332 + 2.75% × ${f(pos(ti - 26050))} = ${f(tax)}`);
    return { regional: tax, taxable: ti };
  },
  VA(g, hh, st) {
    const ti = pos(g - (hh.married ? 17500 : 8750) - 930 * usPersons(hh));
    const b = br('VA rates', ti, [[3000, 0.02], [5000, 0.03], [17000, 0.05], [INF, 0.0575]]);
    st.push(`VA taxable = ${f(ti)}`, b.step);
    return { regional: b.tax, taxable: ti };
  },
  IL(g, hh, st) {
    const ti = pos(g - (g > (hh.married ? 500000 : 250000) ? 0 : 2925 * usPersons(hh)));
    st.push(`IL 4.95% × ${f(ti)} = ${f(0.0495 * ti)}`);
    return { regional: 0.0495 * ti, taxable: ti };
  },
  CO(g, hh, st) {
    const std = STD[hh.married ? 'mfj' : 'single'];
    const ded = g > 300000 ? min(std, hh.married ? 2000 : 1000) : std;
    const ti = pos(g - ded);
    st.push(`CO 4.4% × (${f(g)} - ${f(ded)}${g > 300000 ? ' (AGI over $300,000: deduction capped)' : ''}) = ${f(0.044 * ti)}`);
    return { regional: 0.044 * ti, taxable: ti };
  },
  PA(g, hh, st) {
    st.push(`PA 3.07% × ${f(g)} = ${f(0.0307 * g)}; UC 0.07% = ${f(0.0007 * g)}`);
    return { regional: 0.0307 * g, social: 0.0007 * g, deductible: 0.0007 * g, taxable: g };
  },
  NC(g, hh, st) {
    const cd = g <= 40000 ? 3000 : g <= 60000 ? 2500 : g <= 80000 ? 2000 : g <= 100000 ? 1500 : g <= 120000 ? 1000 : g <= 140000 ? 500 : 0;
    const ti = pos(g - (hh.married ? 25500 : 12750) - hh.kids * cd);
    st.push(`NC 3.99% × ${f(ti)} = ${f(0.0399 * ti)}`);
    return { regional: 0.0399 * ti, taxable: ti };
  },
  OR(g, hh, st, fed) {
    const m = hh.married;
    const start = m ? 250000 : 125000;
    const cap = g < start ? 8750 : pos(8750 - 1750 * (1 + Math.floor((g - start) / (m ? 10000 : 5000))));
    const sub = min(fed, cap);
    const ti = pos(g - (m ? 5820 : 2910) - sub);
    const b = br('OR rates', ti, m ? [[9100, 0.0475], [22800, 0.0675], [250000, 0.0875], [INF, 0.099]] : [[4550, 0.0475], [11400, 0.0675], [125000, 0.0875], [INF, 0.099]]);
    const ex = g <= (m ? 200000 : 100000) ? 263 * usPersons(hh) : 0;
    const transit = 0.001 * g;
    const pl = 0.006 * min(g, SS);
    st.push(`OR taxable ${f(g)} - standard - federal tax subtraction ${f(sub)} = ${f(ti)}`, b.step, `OR exemption credit ${f(ex)}; transit 0.1% = ${f(transit)}; Paid Leave 0.6% × ${f(min(g, SS))} = ${f(pl)}`);
    return { regional: pos(b.tax - ex) + transit, social: pl, deductible: pl, taxable: ti };
  },
  UT(g, hh, st) {
    const credit = pos(0.06 * (STD[hh.married ? 'mfj' : 'single'] + 2111 * hh.kids) - 0.013 * pos(g - (hh.married ? 36426 : 18213)));
    st.push(`UT 4.5% × ${f(g)} = ${f(0.045 * g)} less taxpayer credit ${f(credit)}`);
    return { regional: pos(0.045 * g - credit), taxable: g };
  },
  AZ(g, hh, st) {
    const ti = pos(g - (hh.married ? 31500 : 15750));
    const credit = 100 * hh.kids * pos(1 - 0.05 * Math.ceil(pos(g - (hh.married ? 400000 : 200000)) / 1000));
    st.push(`AZ 2.5% × ${f(ti)} = ${f(0.025 * ti)} less dependent credit ${f(credit)}`);
    return { regional: pos(0.025 * ti - credit), taxable: ti };
  },
  MN(g, hh, st) {
    const ti = pos(g - (hh.married ? 30600 : 15300) - 5300 * hh.kids);
    const b = br('MN rates', ti, hh.married ? [[48700, 0.0535], [193480, 0.068], [337930, 0.0785], [INF, 0.0985]] : [[33310, 0.0535], [109430, 0.068], [203150, 0.0785], [INF, 0.0985]]);
    const pl = 0.0044 * min(g, SS);
    st.push(b.step, `MN Paid Leave 0.44% × ${f(min(g, SS))} = ${f(pl)}`);
    return { regional: b.tax, social: pl, deductible: pl, taxable: ti };
  },
  MI(g, hh, st) {
    const ti = pos(g - 5900 * usPersons(hh));
    st.push(`MI 4.25% × ${f(ti)} = ${f(0.0425 * ti)}`);
    return { regional: 0.0425 * ti, taxable: ti };
  },
  MD(g, hh, st) {
    const ti = pos(g - (hh.married ? 6700 : 3350));
    const b = br('MD rates', ti, hh.married
      ? [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [600000, 0.0575], [1.2e6, 0.0625], [INF, 0.065]]
      : [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [500000, 0.0575], [1e6, 0.0625], [INF, 0.065]]);
    st.push(b.step);
    return { regional: b.tax, taxable: ti };
  },
};
const LOCAL = {
  NYC(g, hh, taxable, st) {
    const b = br(`NYC ${hh.married ? 'married' : 'single'} rates`, taxable, NYC[hh.married ? 'mfj' : 'single']);
    let tax = b.tax;
    const fixed = g <= 250000 ? (hh.married ? 125 : 63) : 0;
    const t0 = hh.married ? 21600 : 12000;
    const rr = g <= 500000 ? (taxable <= t0 ? 0.00171 * taxable : (hh.married ? 37 : 21) + 0.00228 * (taxable - t0)) : 0;
    tax = pos(tax - fixed - rr);
    st.push(b.step, `NYC school tax credit: fixed ${fixed}, rate reduction ${f(rr)}; NYC tax ${f(tax)}`);
    return tax;
  },
  COLUMBUS(g, hh, t, st) { st.push(`Columbus 2.5% × ${f(g)} = ${f(0.025 * g)}`); return 0.025 * g; },
  PHILADELPHIA(g, hh, t, st) { const r = (0.0374 + 0.03735) / 2; st.push(`Philadelphia ${pct(r)} × ${f(g)} = ${f(r * g)}`); return r * g; },
  PITTSBURGH(g, hh, t, st) { st.push(`Pittsburgh 3% × ${f(g)} + $52 LST = ${f(0.03 * g + 52)}`); return 0.03 * g + 52; },
  DETROIT(g, hh, t, st) { const v = 0.024 * pos(g - 600 * usPersons(hh)); st.push(`Detroit 2.4% × (${f(g)} - $600 × ${usPersons(hh)}) = ${f(v)}`); return v; },
  PORTLAND(g, hh, ti, st) {
    const m = hh.married;
    const shs = 0.01 * pos(ti - (m ? 205000 : 128000));
    const pfa = 0.015 * pos(ti - (m ? 200000 : 125000)) + 0.015 * pos(ti - (m ? 400000 : 250000));
    const arts = ti > (m ? 40000 : 20000) ? (m ? 100 : 50) : 0;
    st.push(`Portland: Metro SHS 1% = ${f(shs)}; Multnomah PFA = ${f(pfa)}; arts tax ${arts}`);
    return shs + pfa + arts;
  },
  'MD-COUNTY'(g, hh, ti, st) { const v = 0.032 * ti; st.push(`Baltimore City 3.2% × ${f(ti)} = ${f(v)}`); return v; },
};

function us(g, j, hh, steps) {
  const fs = hh.married ? 'mfj' : 'single';
  const social0 = fica(g, hh.married, steps);
  const run = (fed) => {
    const st = [];
    const s = j.region ? STATE[j.region](g, hh, st, fed) : { regional: 0 };
    const loc = j.local ? LOCAL[j.local](g, hh, s.taxable ?? g, st) : 0;
    return { st, regional: (s.regional || 0) + loc, social: s.social || 0, salt: (s.regional || 0) + loc + (s.deductible || 0) };
  };
  let ded = STD[fs];
  let fedSteps = [];
  let income = fedTax(g, hh, ded, fedSteps);
  let s = run(income);
  for (let i = 0; i < 6; i++) {
    const next = max(STD[fs], min(s.salt, saltCap(g)));
    if (Math.abs(next - ded) < 0.005) break;
    ded = next;
    fedSteps = [`Itemized state and local income taxes ${f(s.salt)} (SALT cap ${f(saltCap(g))}) beat the standard deduction ${f(STD[fs])}`];
    income = fedTax(g, hh, ded, fedSteps);
    s = run(income);
  }
  steps.push(...fedSteps, ...s.st);
  return { income, regional: s.regional, social: social0 + s.social };
}

// ---------------------------------------------------------------- other countries
const K = {
  GB(g, j, hh, st) {
    const pa = pos(12570 - pos(g - 100000) / 2);
    const bands = j.region === 'SCT' ? [[3967, 0.19], [16956, 0.20], [31092, 0.21], [62430, 0.42], [125140, 0.45], [INF, 0.48]] : [[37700, 0.20], [125140, 0.40], [INF, 0.45]];
    const b = br(j.region === 'SCT' ? 'Scottish bands' : 'UK bands', pos(g - pa), bands);
    const nic = 0.08 * pos(min(g, 50270) - 12570) + 0.02 * pos(g - 50270);
    st.push(`Personal allowance ${f(pa)}`, b.step, `NICs 8% × ${f(pos(min(g, 50270) - 12570))} + 2% × ${f(pos(g - 50270))} = ${f(nic)}`);
    return { income: b.tax, social: nic };
  },
  IE(g, j, hh, st) {
    const band = hh.married ? 53000 : 44000;
    const credits = (hh.married ? 4000 : 2000) + 2000;
    const paye = pos(0.2 * min(g, band) + 0.4 * pos(g - band) - credits);
    const usc = br('USC', g, [[12012, 0.005], [28700, 0.02], [70044, 0.03], [INF, 0.08]]);
    const prsi = ((0.042 * 9 + 0.0435 * 3) / 12) * g;
    st.push(`PAYE 20% × ${f(min(g, band))} + 40% × ${f(pos(g - band))} - credits ${credits} = ${f(paye)}`, usc.step, `PRSI (4.2% × 9 + 4.35% × 3) / 12 × ${f(g)} = ${f(prsi)}`);
    return { income: paye + usc.tax, social: prsi };
  },
  CH(g, j, hh, st) {
    const social = 0.053 * g + 0.011 * min(g, 148200) + 0.01 * min(g, 148200);
    st.push(`AHV/IV/EO 5.3% × ${f(g)} + ALV 1.1% + NBU 1% × ${f(min(g, 148200))} = ${f(social)}`);
    if (j.region === 'GE') {
      const ti = pos(g - social - min(4000, 0.03 * g) - 2900);
      const b = br('Geneva combined schedule (approximation)', ti, [[17000, 0], [25000, 0.08], [40000, 0.14], [60000, 0.21], [90000, 0.27], [130000, 0.32], [200000, 0.37], [300000, 0.41], [INF, 0.445]]);
      st.push(b.step);
      return { income: b.tax, social };
    }
    const m = hh.married;
    const net = g - social;
    const work = min(4000, max(2000, 0.03 * net));
    const fedTi = pos(net - work - (m ? 3700 : 1800) - 7500 * hh.kids - (m ? 2800 : 0));
    let fed;
    if (!m) {
      const steps = [[15200, 0, 0.0077], [33200, 138.6, 0.0088], [43500, 229.2, 0.0264], [58000, 612, 0.0297], [76200, 1152.5, 0.0594], [82100, 1502.95, 0.066], [108900, 3271.75, 0.088], [141500, 6140.55, 0.11], [185100, 10936.55, 0.132]];
      if (fedTi >= 794000) fed = 0.115 * fedTi;
      else { fed = 0; for (const [from, base, rate] of steps) if (fedTi > from) fed = base + rate * (fedTi - from); }
      st.push(`Federal taxable ${f(net)} - work ${f(work)} - insurance 1,800 = ${f(fedTi)}; ESTV single tariff ${fedTi >= 794000 ? '11.5% flat' : 'base + marginal'} = ${f(fed)}`);
    } else {
      const b = br('Federal married tariff', fedTi, [[29700, 0], [53400, 0.01], [61300, 0.02], [79100, 0.03], [94900, 0.04], [108700, 0.05], [120600, 0.06], [130500, 0.07], [138400, 0.08], [144300, 0.09], [148300, 0.10], [150400, 0.11], [152400, 0.12], [INF, 0.13]]);
      fed = pos((fedTi >= 941400 ? 0.115 * fedTi : b.tax) - 263 * hh.kids);
      st.push(`Federal taxable ${f(fedTi)}`, b.step, `less CHF 263 × ${hh.kids} children = ${f(fed)}`);
    }
    const zhTi = pos(net - work - (m ? 5800 : 2900) - 10700 * hh.kids);
    const zb = br(`ZH ${m ? 'Verheiratetentarif' : 'Grundtarif'} (einfache Staatssteuer)`, zhTi, m
      ? [[14100, 0], [20500, 0.02], [28600, 0.03], [38400, 0.04], [49600, 0.05], [64100, 0.06], [96300, 0.07], [128700, 0.08], [177200, 0.09], [235100, 0.10], [298000, 0.11], [370600, 0.12], [INF, 0.13]]
      : [[7000, 0], [12000, 0.02], [16800, 0.03], [24800, 0.04], [34500, 0.05], [45700, 0.06], [58800, 0.07], [76400, 0.08], [110400, 0.09], [144100, 0.10], [197400, 0.11], [266700, 0.12], [INF, 0.13]]);
    st.push(zb.step, `Canton 95% + City of Zurich 119% = 214% × ${f(zb.tax)} = ${f(zb.tax * 2.14)}`);
    return { income: fed, regional: zb.tax * 2.14, social };
  },
  DE(g, j, hh, st) {
    // § 32a EStG 2026 formula (not the linear-zone table the model uses).
    const T = (x) => {
      x = Math.floor(x);
      if (x <= 12348) return 0;
      if (x <= 17799) { const y = (x - 12348) / 1e4; return (914.51 * y + 1400) * y; }
      if (x <= 69878) { const z = (x - 17799) / 1e4; return (173.10 * z + 2397) * z + 1034.87; }
      if (x <= 277825) return 0.42 * x - 11135.63;
      return 0.45 * x - 19470.38;
    };
    const pension = 0.093 * min(g, 101400);
    const unemp = 0.013 * min(g, 101400);
    const health = 0.0875 * min(g, 69750);
    const care = (hh.kids ? 0.018 : 0.024) * min(g, 69750);
    const zvE = pos(g - 1230 - pension - 0.96 * (health + care));
    const split = hh.married ? 2 : 1;
    const tar = (x) => split * T(x / split);
    const est = tar(zvE);
    const estFB = tar(pos(zvE - 9756 * hh.kids));
    const kg = 12 * 259 * hh.kids;
    const income = hh.kids ? pos(est - max(est - estFB, kg)) : est;
    const free = 20350 * split;
    const soli = estFB > free ? min(0.055 * estFB, 0.119 * (estFB - free)) : 0;
    st.push(`Social: pension 9.3% + unemployment 1.3% × ${f(min(g, 101400))}, health 8.75% + care ${hh.kids ? '1.8' : '2.4'}% × ${f(min(g, 69750))} = ${f(pension + unemp + health + care)}`,
      `zvE ${f(g)} - 1,230 - pension ${f(pension)} - 96% × (health + care) = ${f(zvE)}`,
      `§ 32a formula${split > 1 ? ' with splitting (2 × T(zvE / 2))' : ''} = ${f(est)}${hh.kids ? `; with Kinderfreibeträge ${f(estFB)}, Kindergeld ${f(kg)} -> ${f(income)}` : ''}`,
      `Soli: min(5.5% × ${f(estFB)}, 11.9% × (${f(estFB)} - ${f(free)})) = ${f(soli)}`);
    return { income: income + soli, social: pension + unemp + health + care };
  },
  FR(g, j, hh, st) {
    const P = 48060;
    const t1 = min(g, P);
    const t2 = pos(min(g, 8 * P) - P);
    const csg = 0.9825 * min(g, 4 * P) + pos(g - 4 * P);
    const social = 0.069 * t1 + 0.004 * g + 0.0315 * t1 + 0.0864 * t2 + 0.0086 * t1 + 0.0108 * t2 + (g > P ? 0.0014 * (t1 + t2) : 0) + 0.00024 * min(g, 4 * P) + 0.097 * csg;
    let ti = g - social + 0.029 * csg;
    ti = pos(ti - min(0.1 * ti, 14555));
    const bareme = [[11600, 0], [29579, 0.11], [84577, 0.30], [181917, 0.41], [INF, 0.45]];
    const ir = (parts) => parts * br('', ti / parts, bareme).tax;
    const base = hh.married ? 2 : 1;
    const half = min(hh.kids, 2);
    const irBase = ir(base);
    const income = half ? max(ir(base + 0.5 * half), irBase - 1807 * half) : irBase;
    const c = hh.married ? 2 : 1;
    const cehr = 0.03 * pos(min(ti, 500000 * c) - 250000 * c) + 0.04 * pos(ti - 500000 * c);
    st.push(`Social (T1 ${f(t1)}, T2 ${f(t2)}, CSG/CRDS base ${f(csg)}) = ${f(social)}`, `Net taxable after 10% (cap 14,555) = ${f(ti)}`,
      `IR ${base} part(s) = ${f(irBase)}${half ? `; with ${base + 0.5 * half} parts ${f(ir(base + 0.5 * half))}, capped gain 1,807 × ${half} -> ${f(income)}` : ''}; CEHR ${f(cehr)}`);
    return { income: income + cehr, social };
  },
  NL(g, j, hh, st) {
    const b = br('Box 1', g, [[38883, 0.3575], [78426, 0.3756], [INF, 0.495]]);
    const gen = pos(3115 - 0.06398 * pos(g - 29736));
    const lab = g <= 11965 ? 0.08324 * g : g <= 25845 ? 996 + 0.31009 * (g - 11965) : g <= 45592 ? 5300 + 0.0195 * (g - 25845) : pos(5685 - 0.0651 * (g - 45592));
    st.push(b.step, `General credit ${f(gen)}, labour credit ${f(lab)}`);
    return { income: pos(b.tax - gen - lab) };
  },
  ES(g, j, hh, st) {
    const social = 0.065 * min(g, 61214.4);
    const base = pos(g - social - 2000);
    const state = [[12450, 0.095], [20200, 0.12], [35200, 0.15], [60000, 0.185], [300000, 0.225], [INF, 0.245]];
    const reg = j.region === 'MD' ? [[13362.22, 0.085], [19004.63, 0.107], [35425.68, 0.128], [57320.40, 0.174], [INF, 0.205]]
      : j.region === 'CT' ? [[12500, 0.095], [22000, 0.125], [33000, 0.16], [53000, 0.19], [90000, 0.215], [120000, 0.235], [175000, 0.245], [INF, 0.255]] : state;
    const sb = br('State scale', base, state);
    const rb = br(`Regional scale (${j.region || 'state'})`, base, reg);
    const sm = br('', 5550, state).tax;
    const rm = br('', 5550, reg).tax;
    st.push(`Social 6.5% × ${f(min(g, 61214.4))} = ${f(social)}; base ${f(g)} - social - 2,000 = ${f(base)}`, sb.step, `less state tax on the €5,550 minimum ${f(sm)}`, rb.step, `less regional tax on the minimum ${f(rm)}`);
    return { income: pos(sb.tax - sm), regional: pos(rb.tax - rm), social };
  },
  PT(g, j, hh, st) {
    const social = 0.11 * g;
    const ti = pos(g - max(4462.15, social));
    const b = br('IRS 2026', ti, [[8342, 0.125], [12587, 0.157], [17838, 0.212], [23089, 0.241], [29397, 0.311], [43090, 0.349], [46566, 0.431], [86634, 0.446], [INF, 0.48]]);
    const sol = 0.025 * pos(min(ti, 250000) - 80000) + 0.05 * pos(ti - 250000);
    st.push(b.step, `Solidarity ${f(sol)}`);
    return { income: b.tax + sol, social };
  },
  IT(g, j, hh, st) {
    const social = 0.0919 * min(g, 120607);
    const ti = pos(g - social);
    const b = br('IRPEF', ti, [[28000, 0.23], [50000, 0.33], [INF, 0.43]]);
    const reg = br('Lombardy', ti, [[15000, 0.0123], [28000, 0.0158], [50000, 0.0172], [INF, 0.0173]]).tax + 0.008 * ti;
    st.push(b.step, `Regional + municipal ${f(reg)}`);
    return { income: b.tax, regional: reg, social };
  },
  AT(g, j, hh, st) {
    const social = 0.1807 * min(g, 90300);
    const net = pos(g - social);
    const b = br('Tarif 2026 on 12/14', (net * 12) / 14, [[13539, 0], [21992, 0.2], [36458, 0.3], [70365, 0.4], [104859, 0.48], [1e6, 0.5], [INF, 0.55]]);
    const bonus = 0.06 * pos((net * 2) / 14 - 620);
    st.push(b.step, `13th/14th 6% = ${f(bonus)}`);
    return { income: b.tax + bonus, social };
  },
  BE(g, j, hh, st) {
    const social = 0.1307 * g;
    const net = g - social;
    const ti = pos(net - min(0.3 * net, 5930));
    const b = br('Federal rates', ti, [[16320, 0.25], [28800, 0.40], [49840, 0.45], [INF, 0.50]]);
    const inc = pos(b.tax - 0.25 * 10910);
    st.push(b.step, `less 25% × 10,910 -> ${f(inc)}; communal 7% = ${f(0.07 * inc)}`);
    return { income: inc, regional: 0.07 * inc, social };
  },
  SE(g, j, hh, st) {
    const ti = pos(g - 17400);
    const mun = 0.3055 * ti;
    const state = 0.2 * pos(ti - 643000);
    const job = min(56000, 0.11 * g, mun);
    st.push(`Municipal 30.55% × ${f(ti)} = ${f(mun)}; state 20% × ${f(pos(ti - 643000))} = ${f(state)}; job credit ${f(job)}`);
    return { income: state, regional: mun - job };
  },
  DK(g, j, hh, st) {
    const am = 0.08 * g;
    const base = g - am;
    const emp = min(0.1275 * base, 63300);
    const mun = 0.2339 * pos(base - 54100 - emp);
    const state = 0.1201 * pos(base - 54100) + 0.075 * pos(base - 641200) + 0.075 * pos(base - 777900) + 0.05 * pos(base - 2592700);
    st.push(`AM 8% = ${f(am)}; municipal ${f(mun)}; state ${f(state)}`);
    return { income: state, regional: mun, social: am };
  },
  NO(g, j, hh, st) {
    const ord = pos(g - min(0.46 * g, 92000) - 108550);
    const b = br('Bracket tax 2026', g, [[226100, 0], [318300, 0.017], [725050, 0.04], [980100, 0.137], [1467200, 0.168], [INF, 0.178]]);
    st.push(`General income ${f(ord)} × 22% = ${f(0.22 * ord)}`, b.step, `National insurance 7.6% = ${f(0.076 * g)}`);
    return { income: 0.22 * ord + b.tax, social: 0.076 * g };
  },
  FI(g, j, hh, st) {
    const social = 0.09 * g;
    const b = br('Combined schedule (approximation)', pos(g - social - 750), [[21200, 0.053], [31500, 0.179], [52100, 0.243], [88200, 0.356], [150000, 0.393], [INF, 0.443]]);
    st.push(b.step);
    return { income: b.tax, social };
  },
  PL(g, j, hh, st) {
    const zus = 0.1126 * min(g, 282600) + 0.0245 * g;
    const health = 0.09 * pos(g - zus);
    const b = br('PIT', pos(g - zus - 3000), [[120000, 0.12], [INF, 0.32]]);
    st.push(b.step, `less 3,600; ZUS ${f(zus)} + health ${f(health)}`);
    return { income: pos(b.tax - 3600), social: zus + health };
  },
  CZ(g, j, hh, st) {
    const social = 0.071 * min(g, 2350416) + 0.045 * g;
    const b = br('PIT', g, [[1762812, 0.15], [INF, 0.23]]);
    st.push(b.step, 'less 30,840');
    return { income: pos(b.tax - 30840), social };
  },
  EE(g, j, hh, st) {
    const social = 0.016 * g;
    st.push(`22% × (${f(g)} - 1.6% - 8,400) = ${f(0.22 * pos(g - social - 8400))}`);
    return { income: 0.22 * pos(g - social - 8400), social };
  },
  IL(g, j, hh, st) {
    const social = 0.0427 * min(g, 92436) + 0.1217 * pos(min(g, 622920) - 92436);
    const b = br('Income tax', g, [[84120, 0.10], [120720, 0.14], [193800, 0.20], [269280, 0.31], [560280, 0.35], [721560, 0.47], [INF, 0.50]]);
    st.push(`NII 4.27% × ${f(min(g, 92436))} + 12.17% × ${f(pos(min(g, 622920) - 92436))} = ${f(social)}`, b.step, 'less 2.25 credit points 6,534');
    return { income: pos(b.tax - 6534), social };
  },
  AE: (g, j, hh, st) => { st.push('No personal income tax; no social security for expatriates'); return {}; },
  SA: (g, j, hh, st) => { st.push('No personal income tax on employment income; GOSI applies to Saudi nationals only'); return {}; },
  JP(g, j, hh, st) {
    const ded = g <= 2.2e6 ? min(g, 740000) : g <= 3.6e6 ? g * 0.3 + 80000 : g <= 6.6e6 ? g * 0.2 + 440000 : g <= 8.5e6 ? g * 0.1 + 1100000 : 1950000;
    const total = g - ded;
    const social = 0.04955 * min(g, 16680000) + 0.0915 * min(g, 7800000) + 0.0055 * g;
    const basic = total <= 23.5e6 ? 620000 : total <= 24e6 ? 480000 : total <= 24.5e6 ? 320000 : total <= 25e6 ? 160000 : 0;
    const rb = total <= 24e6 ? 430000 : total <= 24.5e6 ? 290000 : total <= 25e6 ? 150000 : 0;
    const b = br('Income tax', pos(total - social - basic), [[1950000, 0.05], [3300000, 0.10], [6950000, 0.20], [9000000, 0.23], [18000000, 0.33], [40000000, 0.40], [INF, 0.45]]);
    const res = 0.1 * pos(total - social - rb) + 5000;
    st.push(`Employment income ${f(g)} - ${f(ded)} = ${f(total)}; social ${f(social)}; basic deduction ${f(basic)}`, b.step, `× 1.021 = ${f(1.021 * b.tax)}; resident tax 10% + 5,000 = ${f(res)}`);
    return { income: 1.021 * b.tax, regional: res, social };
  },
  KR(g, j, hh, st) {
    const nps = 0.0475 * min(g, 76440000);
    const nhi = 0.03595 * g;
    const ltc = nhi * 0.1314;
    const ei = 0.009 * g;
    const ed = g <= 5e6 ? 0.7 * g : g <= 15e6 ? 3.5e6 + 0.4 * (g - 5e6) : g <= 45e6 ? 7.5e6 + 0.15 * (g - 15e6) : g <= 100e6 ? 12e6 + 0.05 * (g - 45e6) : min(20e6, 14.75e6 + 0.02 * (g - 100e6));
    const b = br('Income tax', pos(g - ed - 1.5e6 - nps - nhi - ltc - ei), [[14e6, 0.06], [50e6, 0.15], [88e6, 0.24], [150e6, 0.35], [300e6, 0.38], [500e6, 0.40], [1e9, 0.42], [INF, 0.45]]);
    const inc = pos(b.tax - 500000);
    st.push(b.step, `less 500,000 -> ${f(inc)}; local 10%`);
    return { income: inc, regional: 0.1 * inc, social: nps + nhi + ltc + ei };
  },
  SG(g, j, hh, st) {
    const b = br('IRAS resident rates', pos(g - 1000), [[20000, 0], [30000, 0.02], [40000, 0.035], [80000, 0.07], [120000, 0.115], [160000, 0.15], [200000, 0.18], [240000, 0.19], [280000, 0.195], [320000, 0.20], [500000, 0.22], [1e6, 0.23], [INF, 0.24]]);
    st.push(b.step);
    return { income: b.tax };
  },
  HK(g, j, hh, st) {
    const net = pos(g - min(18000, 0.05 * g));
    const allow = (hh.married ? 290000 : 145000) + 140000 * hh.kids;
    const b = br('Progressive', pos(net - allow), [[50000, 0.02], [100000, 0.06], [150000, 0.10], [200000, 0.14], [INF, 0.17]]);
    const std = 0.15 * min(net, 5e6) + 0.16 * pos(net - 5e6);
    st.push(`Net ${f(net)} after MPF; allowances ${f(allow)}`, b.step, `standard rate ${f(std)}; tax = min`);
    return { income: min(b.tax, std) };
  },
  TW(g, j, hh, st) {
    const social = 0.025 * min(g, 549600) + 0.0155 * min(g, 2634000);
    const b = br('Income tax', pos(g - 446000), [[590000, 0.05], [1330000, 0.12], [2660000, 0.20], [4980000, 0.30], [INF, 0.40]]);
    st.push(b.step);
    return { income: b.tax, social };
  },
  IN(g, j, hh, st) {
    const ti = pos(g - 75000);
    let slab = ti <= 1200000 ? 0 : br('', ti, [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [INF, 0.30]]).tax;
    if (ti > 1200000) slab = min(slab, ti - 1200000);
    const sur = ti > 2e7 ? 0.25 : ti > 1e7 ? 0.15 : ti > 5e6 ? 0.10 : 0;
    st.push(`Slab tax ${f(slab)} × (1 + ${sur}) × 1.04`);
    return { income: slab * (1 + sur) * 1.04, regional: j.local === 'PROF-TAX' ? 2500 : 0 };
  },
  AU(g, j, hh, st) {
    const b = br('Resident rates', g, [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [INF, 0.45]]);
    const lito = g <= 37500 ? 700 : g <= 45000 ? 700 - 0.05 * (g - 37500) : g <= 66667 ? 325 - 0.015 * (g - 45000) : 0;
    st.push(b.step, `LITO ${f(lito)}; Medicare 2% = ${f(0.02 * g)}`);
    return { income: pos(b.tax - lito), social: 0.02 * g };
  },
  NZ(g, j, hh, st) {
    const b = br('IRD rates', g, [[15600, 0.105], [53500, 0.175], [78100, 0.30], [180000, 0.33], [INF, 0.39]]);
    st.push(b.step, `ACC 1.67% × ${f(min(g, 152790))}`);
    return { income: b.tax, social: 0.0167 * min(g, 152790) };
  },
  CA(g, j, hh, st) {
    const qc = j.region === 'QC';
    const pens = qc ? 0.063 : 0.0595;
    const baseC = pens * pos(min(g, 74600) - 3500);
    const second = 0.04 * pos(min(g, 85000) - 74600);
    const ei = (qc ? 0.013 : 0.0163) * min(g, 68900);
    const qpip = qc ? 0.0043 * min(g, 103000) : 0;
    const cred = baseC * ((qc ? 0.053 : 0.0495) / pens) + ei + qpip;
    const dedu = baseC - baseC * ((qc ? 0.053 : 0.0495) / pens) + second;
    const ti = pos(g - dedu);
    const bpaf = ti <= 181440 ? 16452 : ti >= 258482 ? 14829 : 16452 - ((ti - 181440) * 1623) / 77042;
    const fb = br('Federal', ti, [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [INF, 0.33]]);
    let fed = pos(fb.tax - 0.14 * (bpaf + 1501 + cred));
    if (qc) fed *= 0.835;
    st.push(`CPP/QPP ${f(baseC)} (enhanced part ${f(dedu - second)} deducted) + CPP2 ${f(second)} + EI ${f(ei)}${qc ? ` + QPIP ${f(qpip)}` : ''}; taxable ${f(ti)}`, fb.step, `less 14% × (BPA ${f(bpaf)} + 1,501 + ${f(cred)})${qc ? ', less 16.5% abatement' : ''} = ${f(fed)}`);
    let prov = 0;
    if (j.region === 'ON') {
      const b = br('Ontario', ti, [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [INF, 0.1316]]);
      const basic = pos(b.tax - 0.0505 * (12989 + cred));
      const sur = 0.2 * pos(basic - 5818) + 0.36 * pos(basic - 7446);
      const a = ti;
      const ohp = a <= 20000 ? 0 : a <= 36000 ? min(300, 0.06 * (a - 20000)) : a <= 48000 ? min(450, 300 + 0.06 * (a - 36000)) : a <= 72000 ? min(600, 450 + 0.25 * (a - 48000)) : a <= 200000 ? min(750, 600 + 0.25 * (a - 72000)) : min(900, 750 + 0.25 * (a - 200000));
      prov = basic + sur + ohp;
      st.push(b.step, `basic ${f(basic)} + surtax ${f(sur)} + health premium ${f(ohp)}`);
    } else if (j.region === 'BC') {
      const b = br('British Columbia 2026', ti, [[50363, 0.056], [100728, 0.077], [115648, 0.105], [140430, 0.1229], [190405, 0.147], [265545, 0.168], [INF, 0.205]]);
      prov = pos(b.tax - 0.056 * (13216 + cred));
      st.push(b.step, `less 5.60% × (13,216 + ${f(cred)})`);
    } else if (qc) {
      const b = br('Quebec', ti, [[53255, 0.14], [106495, 0.19], [129590, 0.24], [INF, 0.2575]]);
      prov = pos(b.tax - 0.14 * (18571 + cred));
      st.push(b.step);
    }
    return { income: fed, regional: prov, social: baseC + second + ei + qpip };
  },
  MX(g, j, hh, st) {
    const b = br('ISR', g, [[8952.49, 0.0192], [75984.55, 0.064], [133536.07, 0.1088], [155229.80, 0.16], [185852.57, 0.1792], [374837.88, 0.2136], [590795.99, 0.2352], [1127926.84, 0.30], [1503902.46, 0.32], [4511707.37, 0.34], [INF, 0.35]]);
    st.push(b.step);
    return { income: b.tax, social: 0.02775 * min(g, 1070454) };
  },
  BR(g, j, hh, st) {
    const m = g / 12;
    const inss = br('INSS monthly', min(m, 8475.55), [[1621, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]]);
    const dep = (hh.married ? 1 : 0) + hh.kids;
    const irpf = br('IRPF monthly', pos(m - inss.tax - 189.59 * dep), [[2428.8, 0], [2826.65, 0.075], [3751.05, 0.15], [4664.68, 0.225], [INF, 0.275]]);
    st.push(inss.step, irpf.step, '× 12');
    return { income: irpf.tax * 12, social: inss.tax * 12 };
  },
};

// ---------------------------------------------------------------- cases
const HH = { single: { key: 'single', married: false, kids: 0 }, couple: { key: 'couple', married: true, kids: 0 }, family: { key: 'family', married: true, kids: 2 } };
const VERIFIED = new Set(['US', 'US-FL', 'US-NV', 'US-GA', 'US-VA', 'US-IL', 'US-CO', 'US-NC', 'US-UT', 'US-AZ', 'US-MI', 'US-LOCAL-NYC', 'US-LOCAL-COLUMBUS', 'US-LOCAL-PHILADELPHIA', 'US-LOCAL-PITTSBURGH', 'US-LOCAL-PORTLAND', 'GB', 'GB-SCT', 'IE', 'NL', 'ES', 'ES-CT', 'NO', 'SG', 'CA-ON', 'CA-BC', 'BR']);
const SOURCES = {
  US: [S.irs, S.pub15, S.tc560, S.salt, S.schA, S.s8812],
  CA_US: [{ url: 'https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf', asOf: '2025' }, { url: 'https://www.ftb.ca.gov/forms/2025/2025-540-booklet.pdf', asOf: '2025' }, { url: 'https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/', asOf: '2026' }],
  NY: [{ url: 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf', asOf: '2026' }],
};
function keysOf(j) {
  const k = [j.country];
  if (j.country === 'US') { if (j.region) k.push(`US-${j.region}`); if (j.local) k.push(`US-LOCAL-${j.local}`); } else if (j.region) k.push(`${j.country}-${j.region}`);
  return k;
}
const JURS = [
  ...['CA', 'NY', 'WA', 'TX', 'FL', 'TN', 'NV', 'MA', 'GA', 'DC', 'AL', 'OH', 'VA', 'IL', 'CO', 'PA', 'NC', 'OR', 'UT', 'AZ', 'MN', 'MI', 'MD'].map((r) => ({ country: 'US', region: r, cur: 'USD' })),
  { country: 'US', region: 'NY', local: 'NYC', cur: 'USD' }, { country: 'US', region: 'OH', local: 'COLUMBUS', cur: 'USD' },
  { country: 'US', region: 'PA', local: 'PHILADELPHIA', cur: 'USD' }, { country: 'US', region: 'PA', local: 'PITTSBURGH', cur: 'USD' },
  { country: 'US', region: 'MI', local: 'DETROIT', cur: 'USD' }, { country: 'US', region: 'OR', local: 'PORTLAND', cur: 'USD' },
  { country: 'US', region: 'MD', local: 'MD-COUNTY', cur: 'USD' },
  { country: 'GB', cur: 'GBP' }, { country: 'GB', region: 'SCT', cur: 'GBP' }, { country: 'IE', cur: 'EUR' },
  { country: 'CH', region: 'ZH', cur: 'CHF' }, { country: 'CH', region: 'GE', cur: 'CHF' }, { country: 'DE', cur: 'EUR' },
  { country: 'FR', cur: 'EUR' }, { country: 'NL', cur: 'EUR' }, { country: 'ES', region: 'MD', cur: 'EUR' }, { country: 'ES', region: 'CT', cur: 'EUR' },
  { country: 'PT', cur: 'EUR' }, { country: 'IT', cur: 'EUR' }, { country: 'AT', cur: 'EUR' }, { country: 'BE', cur: 'EUR' },
  { country: 'SE', cur: 'SEK' }, { country: 'DK', cur: 'DKK' }, { country: 'NO', cur: 'NOK' }, { country: 'FI', cur: 'EUR' },
  { country: 'PL', cur: 'PLN' }, { country: 'CZ', cur: 'CZK' }, { country: 'EE', cur: 'EUR' }, { country: 'IL', cur: 'ILS' },
  { country: 'AE', cur: 'AED' }, { country: 'SA', cur: 'SAR' }, { country: 'JP', cur: 'JPY' }, { country: 'KR', cur: 'KRW' },
  { country: 'SG', cur: 'SGD' }, { country: 'HK', cur: 'HKD' }, { country: 'TW', cur: 'TWD' }, { country: 'IN', cur: 'INR' },
  { country: 'IN', local: 'PROF-TAX', cur: 'INR' }, { country: 'AU', cur: 'AUD' }, { country: 'NZ', cur: 'NZD' },
  { country: 'CA', region: 'ON', cur: 'CAD' }, { country: 'CA', region: 'BC', cur: 'CAD' }, { country: 'CA', region: 'QC', cur: 'CAD' },
  { country: 'MX', cur: 'MXN' }, { country: 'BR', cur: 'BRL' },
];
// Social-insurance cap boundaries (local currency): one vector just at each cap.
const CAPS = {
  US: [[184500, 'Social Security wage base $184,500'], [200000, 'Additional Medicare threshold $200,000 (single)'], [505000, 'SALT cap starts falling at $505,000 MAGI']],
  'US-NY': [[107650, 'NY recapture starts (NYAGI $107,650)'], [157650, 'NY flat-rate worksheet (NYAGI $157,650)']],
  'US-CA': [[252203, 'CA exemption credit phase-out starts'], [1005706, 'CA BHST: taxable income $1M']],
  GB: [[50270, 'NIC upper earnings limit £50,270'], [100000, 'personal allowance taper starts'], [125140, 'personal allowance fully withdrawn']],
  IE: [[44000, '20% band ends (€44,000)'], [70044, 'USC 8% starts']],
  CH: [[148200, 'ALV ceiling CHF 148,200']],
  DE: [[69750, 'health/care ceiling €69,750'], [101400, 'pension/unemployment ceiling €101,400']],
  FR: [[48060, 'PASS €48,060'], [192240, '4 PASS €192,240'], [384480, '8 PASS €384,480']],
  ES: [[61214.4, 'maximum contribution base €61,214.40']],
  NO: [[226100, 'bracket tax starts NOK 226,100']],
  IL: [[92436, 'NII reduced-rate ceiling NIS 92,436'], [622920, 'NII ceiling NIS 622,920']],
  JP: [[7800000, 'pension ceiling ¥7.8M'], [16680000, 'health ceiling ¥16.68M']],
  CA: [[68900, 'EI ceiling $68,900'], [74600, 'CPP YMPE $74,600'], [85000, 'CPP2 ceiling $85,000'], [181440, 'BPA phase-out starts']],
  BR: [[101706.6, 'INSS ceiling R$8,475.55 a month']],
};

function compute(j, g, hhKey) {
  const steps = [];
  const hh = HH[hhKey];
  const r = j.country === 'US' ? us(g, j, hh, steps) : K[j.country](g, j, hh, steps);
  return { income: r2(r.income || 0), regional: r2(r.regional || 0), social: r2(r.social || 0), steps };
}

const vectors = [];
for (const j of JURS) {
  const per = FX_PER_USD[j.cur];
  const incomes = [100000, 250000, 675000].map((usd) => (j.cur === 'USD' ? usd : Math.round((usd * per) / 1000) * 1000));
  // Federal caps once each for a no-income-tax state, California and New York City.
  const usCaps = j.country !== 'US' || (j.region === 'TX' || j.region === 'CA' || j.local === 'NYC');
  const caps = [...(usCaps ? CAPS[j.country] || [] : []), ...(CAPS[`${j.country}-${j.region}`] || [])];
  const keys = keysOf(j);
  const verified = keys.every((k) => VERIFIED.has(k));
  const src = j.country === 'US' ? [...SOURCES.US, ...(j.region === 'CA' ? SOURCES.CA_US : []), ...(j.region === 'NY' ? SOURCES.NY : [])] : [];
  const add = (g, hh, label) => {
    const c = compute(j, g, hh);
    vectors.push({
      id: `${keys.join('/')} ${hh} ${g}${label ? ` (${label})` : ''}`,
      jurisdiction: { country: j.country, ...(j.region ? { region: j.region } : {}), ...(j.local ? { local: j.local } : {}) },
      household: hh, gross: g, currency: j.cur, taxYear: '2026',
      expected: { income: c.income, regional: c.regional, social: c.social },
      tolerance: j.country === 'DE' ? 3 : 0.05,
      verified, keys, steps: c.steps, ...(src.length ? { sources: src } : {}),
    });
  };
  for (const g of incomes) add(g, 'single');
  for (const [g, label] of caps) add(g, 'single', label);
  for (const hh of ['couple', 'family']) add(incomes[1], hh);
}

const doc = {
  $comment: 'Golden tax vectors, generated by docs/process/scripts/juice-tax-golden.mjs (an independent re-computation that does not import server/juice.js). Each vector lists the arithmetic (steps). Sources and their verification status: TAX_SOURCES in server/juice.js and docs/process/juice-tax.md. verified=false vectors pin the current model where a parameter could not be read from an official source. DE uses the § 32a EStG formula, so it is compared within €3 of the model\'s linear-zone table.',
  generated: '2026-10-10',
  incomes: 'USD 100,000 / 250,000 / 675,000 converted with FX_PER_USD (public/viz/palette.js) and rounded to 1,000 local units, plus each social-insurance cap boundary; couple and family at the 250,000 point',
  vectors,
};
if (process.argv.includes('--print')) {
  for (const v of vectors) console.log(`${v.id}: ${JSON.stringify(v.expected)}\n  ${v.steps.join('\n  ')}`);
} else {
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`wrote ${vectors.length} vectors to ${path.relative(ROOT, OUT)}`);
}

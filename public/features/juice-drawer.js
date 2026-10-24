// melon-seek: the Juice section's words that depend on the place, and its Monthly / Yearly memory
// (fix-juice-6, docs/process/fix-juice-6.md). Pure functions (no DOM), used by public/app.js and
// test/fix-juice-6.test.js. The tax numbers come from server/juice.js (taxFor); nothing here changes one.
//
// Persona wave 2 (2026-10-23, docs/process/persona-beta-2-35-44.md, -25-34.md, -55-plus.md):
//   J-1  every country's tax rows read "income tax · state or local tax · social security", so Ontario's provincial
//        tax was "state or local tax" and UK National Insurance "social security". Each row is named as its country
//        names it (taxRowNames); a US row stays "state or local tax".
//   J-2  "Family here means one earner; each person is taxed separately here" read as a contradiction.
//        householdTaxLine says how that country taxes a one-earner household, in words that can't be misread.
//   J-3  Monthly / Yearly reset to Yearly on every visit, while the household was remembered. PERIOD_KEY is kept
//        the same way as the household (localStorage, read with the same fallback to the default).
//   J-4  "Rind", "Dry" and the other grades were not explained where they first appear (GRADE_MEANING).
//
// Each name or line is a list of variants, longest first: the app shows the first that fits on one line
// (public/viz/note.js fitLine), so every line is one line at every size of test/e2e/phone-sizes.mjs. A shorter
// variant abbreviates the way the country does ("NI", "CPP and EI", "FICA").

/** The country in a sentence ("the UK", "Germany"); start a sentence with cap(). */
const COUNTRY = Object.freeze({
  US: 'the US', GB: 'the UK', IE: 'Ireland', CH: 'Switzerland', DE: 'Germany', FR: 'France', NL: 'the Netherlands',
  ES: 'Spain', PT: 'Portugal', IT: 'Italy', AT: 'Austria', BE: 'Belgium', SE: 'Sweden', DK: 'Denmark', NO: 'Norway',
  FI: 'Finland', PL: 'Poland', CZ: 'Czechia', EE: 'Estonia', IL: 'Israel', AE: 'the UAE', SA: 'Saudi Arabia',
  JP: 'Japan', KR: 'South Korea', SG: 'Singapore', HK: 'Hong Kong', TW: 'Taiwan', IN: 'India', AU: 'Australia',
  NZ: 'New Zealand', CA: 'Canada', MX: 'Mexico', BR: 'Brazil',
});
export const countryWords = (code) => COUNTRY[code] || 'this country';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/*
 * J-1: the three parts of server/juice.js taxFor, named per country.
 *   income   national income tax, with any surtax on it
 *   regional state, province, canton, region or city income tax
 *   social   compulsory social insurance the employee pays
 * A country without a part (no regional tax in the UK) never shows that row (its amount is 0).
 */
const N = (...v) => Object.freeze(v);
const DEFAULT_NAMES = Object.freeze({ income: N('income tax'), regional: N('regional tax'), social: N('social insurance') });
const TAX_ROW_NAMES = Object.freeze({
  US: { income: N('federal income tax', 'federal tax'), regional: N('state or local tax', 'state/local tax', 'state/local'), social: N('Social Security and Medicare', 'FICA') },
  GB: { income: N('income tax'), social: N('National Insurance', 'NI') },
  IE: { income: N('income tax and Universal Social Charge', 'income tax and USC', 'tax and USC', 'tax + USC'), social: N('PRSI social insurance', 'PRSI') },
  CH: { income: N('federal income tax', 'federal tax'), regional: N('cantonal and communal tax', 'canton and city tax', 'local tax'), social: N('AHV, unemployment and accident insurance', 'AHV, ALV, accident', 'social insurance', 'social ins.') },
  DE: { income: N('income tax and solidarity surcharge', 'income tax and Soli', 'income tax'), social: N('social insurance (pension, health, care, unemployment)', 'social insurance', 'social ins.') },
  FR: { income: N('income tax'), social: N('social contributions, CSG and CRDS', 'social contributions', 'contributions', 'contrib.') },
  NL: { income: N('income tax and national insurance', 'wage tax') },
  ES: { income: N('state income tax', 'state tax'), regional: N('regional income tax', 'regional tax', 'reg. tax'), social: N('Social Security', 'Soc. Security', 'Soc. Sec.') },
  PT: { income: N('income tax (IRS)', 'income tax'), social: N('Social Security', 'Soc. Security', 'Soc. Sec.') },
  IT: { income: N('income tax (IRPEF)', 'IRPEF'), regional: N('regional and municipal surcharges', 'regional and city surcharges', 'local surcharges', 'surcharges'), social: N('INPS contributions', 'INPS') },
  AT: { income: N('income tax'), social: N('social insurance', 'social ins.') },
  BE: { income: N('income tax'), regional: N('municipal surcharge', 'city surcharge', 'surcharge'), social: N('social security', 'soc. sec.') },
  SE: { income: N('state income tax', 'state tax'), regional: N('municipal tax, after the job tax credit', 'municipal tax', 'city tax') },
  DK: { income: N('state income tax', 'state tax'), regional: N('municipal tax', 'city tax'), social: N('labour market contribution', 'AM contribution', 'AM contrib.') },
  NO: { income: N('income tax and bracket tax', 'income tax'), social: N('national insurance', 'nat. insurance', 'nat. ins.') },
  FI: { income: N('state and municipal income tax', 'income tax'), social: N('social insurance', 'social ins.') },
  PL: { income: N('income tax (PIT)', 'PIT'), social: N('ZUS and health insurance', 'ZUS and health', 'ZUS, health') },
  CZ: { income: N('income tax'), social: N('social and health insurance', 'social and health', 'soc. and health', 'soc. & health') },
  EE: { income: N('income tax'), social: N('unemployment insurance', 'unemployment ins.', 'unempl. ins.') },
  IL: { income: N('income tax'), social: N('National Insurance and health tax', 'Bituach Leumi', 'Nat. Ins.') },
  AE: {},
  SA: {},
  JP: { income: N('income tax'), regional: N('resident tax'), social: N('social insurance', 'social ins.') },
  KR: { income: N('income tax'), regional: N('local income tax', 'local tax'), social: N('social insurance', 'social ins.') },
  SG: { income: N('income tax') },
  HK: { income: N('salaries tax') },
  TW: { income: N('income tax'), social: N('labour and health insurance', 'labour and health', 'labour, health') },
  IN: { income: N('income tax and cess', 'income tax'), regional: N('professional tax', 'prof. tax') },
  AU: { income: N('income tax'), social: N('Medicare levy', 'Medicare') },
  NZ: { income: N('income tax'), social: N('ACC earners’ levy', 'ACC levy') },
  CA: { income: N('federal income tax', 'federal tax'), regional: N('provincial tax', 'prov. tax'), social: N('CPP and EI') },
  MX: { income: N('income tax (ISR)', 'ISR'), social: N('IMSS social security', 'IMSS') },
  BR: { income: N('income tax (IRPF)', 'IRPF'), social: N('INSS social security', 'INSS') },
});
/** Names that depend on the state, province or canton (server/juice.js: its own rule or payroll contributions). */
const REGION_NAMES = Object.freeze({
  'US-CA': { social: N('Social Security, Medicare and SDI', 'FICA and SDI', 'payroll tax') },
  'US-NY': { social: N('Social Security, Medicare, paid leave and disability', 'FICA, PFL and DBL', 'payroll tax') },
  'US-WA': { social: N('Social Security, Medicare, WA Cares and paid leave', 'FICA, WA Cares, PFML', 'payroll tax') },
  'US-MA': { social: N('Social Security, Medicare and paid leave', 'FICA and PFML', 'payroll tax') },
  'US-OR': { social: N('Social Security, Medicare and Paid Leave Oregon', 'FICA and paid leave', 'payroll tax') },
  'US-MN': { social: N('Social Security, Medicare and Paid Leave', 'FICA and paid leave', 'payroll tax') },
  'US-PA': { social: N('Social Security, Medicare and unemployment', 'FICA and UC', 'payroll tax') },
  'GB-SCT': { income: N('Scottish income tax', 'income tax') },
  // Geneva's rule is one combined federal, cantonal and communal schedule (server/juice.js CH_GE_COMBINED).
  'CH-GE': { income: N('federal, cantonal and communal tax', 'income taxes', 'income tax') },
  'CA-QC': { regional: N('Quebec income tax', 'Quebec tax'), social: N('QPP, QPIP and EI', 'QPP/QPIP/EI') },
});

/**
 * J-1: the names of the tax rows for a jurisdiction { country, region }: { income, regional, social }, each a list
 * of variants, longest first. Unknown countries get plain generic names.
 */
export function taxRowNames(jur) {
  const c = jur?.country || null;
  const base = TAX_ROW_NAMES[c] || {};
  const reg = (jur?.region && REGION_NAMES[`${c}-${jur.region}`]) || {};
  return {
    income: reg.income || base.income || DEFAULT_NAMES.income,
    regional: reg.regional || base.regional || DEFAULT_NAMES.regional,
    social: reg.social || base.social || DEFAULT_NAMES.social,
  };
}

/**
 * J-1: the tax rows to show: [{ part, value, variants }] for each part above 0, in the waterfall's order. `amount(n)`
 * formats a value ("$2,010"); each variant is "<name> <amount>" ("provincial tax $2,010", "prov. tax $2,010").
 */
export function taxRows(taxParts, jur, amount = String) {
  if (!taxParts) return [];
  const names = taxRowNames(jur);
  return ['income', 'regional', 'social']
    .filter((k) => taxParts[k] > 0)
    .map((k) => ({ part: k, value: taxParts[k], variants: names[k].map((n) => `${n} ${amount(taxParts[k])}`) }));
}

/**
 * Where a Juice entry is taxed: { country, region, local }. From its own `inputs.tax.jurisdiction` (the TAX_SOURCES
 * keys the best place keeps: ['CA', 'CA-ON']), else the city record (data/cities.json `tax`), else the city key's
 * last part ("toronto-on-ca": CA, ON; "milan-it": IT).
 */
export function jurisdictionOf(entry, city = null) {
  const keys = entry?.inputs?.tax?.jurisdiction;
  if (Array.isArray(keys) && keys.length && typeof keys[0] === 'string') {
    const country = keys[0];
    const region = keys.find((k) => k.startsWith(`${country}-`) && !k.startsWith(`${country}-LOCAL-`));
    const local = keys.find((k) => k.startsWith(`${country}-LOCAL-`));
    return { country, region: region ? region.slice(country.length + 1) : null, local: local ? local.slice(country.length + 7) : null };
  }
  if (city?.tax?.country) return { country: city.tax.country, region: city.tax.region || null, local: city.tax.local || null };
  const parts = String(entry?.city || '').split('-').filter(Boolean);
  if (!parts.length) return { country: null, region: null, local: null };
  const country = parts[parts.length - 1].toUpperCase();
  const region = (country === 'US' || country === 'CA') && parts.length > 2 ? parts[parts.length - 2].toUpperCase() : null;
  return { country, region, local: null };
}

/*
 * J-2: how a one-earner couple or family is taxed there (server/juice.js taxFor `basis`), one line under the Tax row.
 * The household line under the buttons (app.js HOUSEHOLDS) says who is in it ("2 adults, 1 earner (the other not working)").
 *   joint       the country taxes the household together and the model applies it: the tax goes down
 *   individual  the country taxes each person on their own pay: the earner pays what a single person does
 *   single      the country has joint or family rules the model leaves out: taxed as a single person
 *   partial     some levels apply household rules, others are taxed as single
 */
const JOINT = Object.freeze({
  US: { couple: N('The US taxes a married couple jointly, which lowers the tax', 'Filing jointly lowers the tax', 'Taxed jointly'),
    family: N('Joint filing and the child tax credit lower the US tax', 'Joint filing and child credit', 'Taxed jointly') },
  DE: { couple: N('Germany splits the pay between the couple, which lowers the tax', 'Income splitting lowers the tax', 'Taxed with splitting'),
    family: N('German splitting and child allowances lower the tax', 'Splitting and child allowance', 'Taxed with splitting') },
  FR: { couple: N('France’s family quotient (quotient familial) lowers the tax', 'Family quotient lowers the tax', 'Family quotient') },
  IE: { couple: N('Ireland’s married one-income tax band lowers the tax', 'Married tax band lowers the tax', 'Married tax band') },
  CH: { couple: N('Switzerland taxes a married couple together, at lower rates', 'Married rates lower the tax', 'Married rates'),
    family: N('Swiss married rates and child deductions lower the tax', 'Married rates and child deductions', 'Married rates') },
  HK: { couple: N('Hong Kong’s married person’s allowance lowers the tax', 'Married allowance lowers the tax', 'Married allowance'),
    family: N('Hong Kong’s married and child allowances lower the tax', 'Married and child allowances', 'Married allowances') },
  BR: { couple: N('Brazil counts the spouse as a dependant, which lowers the tax', 'Dependants lower the tax', 'Dependants counted'),
    family: N('Brazil counts the spouse and children as dependants', 'Dependants lower the tax', 'Dependants counted') },
});
/** The household rule the model leaves out, where it does (TAX_HOUSEHOLD basis 'single' in server/juice.js). */
const NOT_COUNTED = Object.freeze({
  PL: 'joint filing', ES: 'joint return', PT: 'joint taxation', BE: 'marital quotient', TW: 'household filing', CH: 'married rules',
});

/**
 * J-2: the line under the Tax row for a couple or family, as variants (longest first), or null (one person, or no tax).
 * Every variant can stand alone: the shortest says only how the tax was worked out ("Taxed as if single").
 */
export function householdTaxLine(hhKey, basis, jur) {
  if (!hhKey || hhKey === 'single') return null;
  const c = jur?.country || null;
  const where = countryWords(c);
  if (basis === 'joint') {
    const j = JOINT[c];
    if (j) return j[hhKey] || j.couple;
    return N(`${cap(where)} taxes the household together, which lowers the tax`, 'Taxed together, which lowers the tax', 'Taxed jointly');
  }
  if (basis === 'individual') {
    return N(`${cap(where)} taxes each person on their own pay, as if single`, `${cap(where)} taxes each person on their own pay`, 'Taxed on own pay, as if single', 'Taxed as if single');
  }
  if (basis === 'single') {
    const rule = NOT_COUNTED[c];
    if (rule) return N(`${cap(where)}’s ${rule} isn’t counted here, so taxed as if single`, `${cap(rule)} not counted: taxed as if single`, 'Taxed as if single');
    return N('Household tax rules aren’t counted here, so taxed as if single', 'Taxed as if single');
  }
  if (basis === 'partial') return N(`Some of ${where}’s household tax rules are counted`, 'Some household rules counted', 'Partly taxed jointly');
  return N('Taxed on the one earner’s pay');
}

/* J-3: Monthly / Yearly, remembered in this browser like the household (app.js HOUSEHOLD_KEY). */
export const PERIOD_KEY = 'melon-seek.juicePeriod.v1';
export const PERIODS = Object.freeze(['year', 'month', 'term']);
/** The stored period, or 'year' for anything else (nothing stored, storage blocked, an old or bad value). */
export const periodOf = (v) => (PERIODS.includes(v) ? v : 'year');
/**
 * The period a Juice block shows for the remembered `period`: fixed-term pay shows Monthly or Whole term (Monthly
 * only when the length is not stated), never a year; yearly pay shows Monthly or Yearly.
 */
export function shownPeriod(period, term = null) {
  const p = periodOf(period);
  if (term) return p === 'term' && !term.unstated ? 'term' : 'month';
  return p === 'month' ? 'month' : 'year';
}

/**
 * J-4: what each grade means, said where the grade first shows (the card's badge tip, the drawer's score tip and
 * its first line). `scale` is { ripe, juicy }, the yearly amounts of the breaks ("$43K", "$116K").
 */
export function gradeMeaning(grade, scale = null) {
  const r = scale?.ripe, j = scale?.juicy;
  switch (String(grade)) {
    case 'Juicy': return `plenty left after tax, rent and living costs${j ? ` (${j} or more a year)` : ''}`;
    case 'Ripe': return `a comfortable amount left${r && j ? ` (${r}–${j.replace(/^\$/, '')} a year)` : ''}`;
    case 'Dry': return `a thin margin left${r ? ` (under ${r} a year)` : ''}`;
    case 'Rind': return 'nothing left: tax, rent and living costs take all the pay or more';
    default: return '';
  }
}
/** J-4: the same in a few words, for the Juice text of the job page ("Rind means nothing is left"). */
export function gradeShort(grade) {
  return { Juicy: 'plenty is left', Ripe: 'a comfortable amount is left', Dry: 'a thin margin is left', Rind: 'nothing is left' }[String(grade)] || '';
}

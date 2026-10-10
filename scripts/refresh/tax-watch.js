// Tax watch list for scripts/refresh/tax.js: DATA ONLY, no logic.
//
// One entry per TAX_SOURCES key in server/juice.js (registry id `tax-<key in lower case>`),
// so every RULES jurisdiction, US state, US locality, Canadian province and regional scale is
// covered (test/refresh-tax.test.js fails when a new one is added without an entry here).
//
// Entry fields
//   id, key (TAX_SOURCES key), covers (other keys this entry also covers), jurisdiction,
//   taxYear (the year the encoded figures were for when this list was written; at run time the
//   module reads it from TAX_SOURCES[key].asOf), yearFrom ('first' | 'last' year in asOf),
//   yearStart ('MM-DD' the tax year starts), mode ('detect' | 'manual'), cadence, graceDays,
//   expectedPublication, manualReason, values, notes, licence
//   sources: { name: { name, url | urls[], forYear?, headers? } }  (urls may use placeholders)
//   figures: [{ key, unit, yearFrom?, encoded: locator | [locators], official: spec | 'manual', tolerance?, note? }]
//     locator: { params: 'US.ssWageBase' }                        TAX_PARAMS (after the export patch)
//              { const: 'US_FED_{year}', path?: 'single[5][0]', column?: 0|1, slice?: [a, b], scale?, add? }
//              { block: 'US_STATE.CA' | 'RULES.IE' | 'fn:caPayroll', match: '<regex, 1 group>', nth?, ... }
//              a list of locators = alternatives, the first that resolves wins
//     spec:    { src: '<source name>', section?: { start: regex | [regex...], end?: regex },
//                extract: '<regex, 1 group>', all?: true, nth?, sort?: 'asc', slice?, cumulative?,
//                parse: 'money' | 'percent' | 'number', scale? }
//              or { extract: 'manual', url?, note } (listed in the checklist, not machine-checked)
//   newYear: [{ src | url, signal: '<regex>', label, absentOk?, yearFrom?, value?: { parse }, compareTo?, expect?: 'rise', notice? }]
//     a match means the NEXT tax year's figures are published -> drift (notice: listed, no drift)
//   schedules: [locator]  encoded bracket lists validated (thresholds increasing, rates in [0, 0.7))
// Placeholders in urls / regexes: {year} {year1} {year2} {prev} {yy1} {yy2} {later} (year = encoded tax year).
// Regexes are applied to normalized text lines (one table cell or paragraph per line, edge pipes
// stripped, full-width % and dashes normalized), case-insensitive and multiline.
//
// Sources were read from a GitHub runner on 2026-10-10 with .github/workflows/freshness-probe.yml
// (runs 38036911378, 38036930704, 38037181487, 38037585519; docs/process/freshness-tax.md).
// Fixtures: test/fixtures/refresh/tax/. Hosts that refuse GitHub runners (ssa.gov, ato.gov.au,
// gesetze-im-internet.de, revenuquebec.ca, detroitmi.gov) are 'manual' or read through another
// official page.

export const TAX_FILE = 'server/juice.js';

const R_SCHED = String.raw`(\[\[[^;]*?\]\])`; // a bracket-list literal inside a rule block
const MARRIED_OR = String.raw`(?:hh\.married|m) \? \d+ : (\d+)\)`; // `(hh.married ? 30000 : 15000)` -> the single figure

/** Where tax figures surface (registry `consumers`). */
export const CONSUMERS = Object.freeze([
  { at: 'public/app.js:2155', surface: 'drawer Juice block' },
  { at: 'public/app.js:1870', surface: 'badge' },
  { at: 'public/api.js:697', surface: 'API' },
  { at: 'server/juice.js computeJuice inputs.tax.sources', surface: 'drawer Juice block' },
  { at: 'docs/LIVABILITY.md:265', surface: 'methodology page' },
  { at: 'docs/LIVABILITY.md:168', surface: 'docs' },
  { at: 'README.md:222', surface: 'README' },
  { at: 'test/juice.test.js:46', surface: 'tests' },
  { at: 'test/fixtures/tax-golden.json', surface: 'tests' },
]);

export const COMMON_VALIDATOR = 'scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.';

const ANNUAL_US = 'state revenue department, usually Oct-Jan for the next calendar year';
const RUNNER_403 = 'refuses GitHub-hosted runners (HTTP 403 or connection failure, checked 2026-10-10), so the monthly refresh cannot read it';
const NO_FEED = 'no official page with a stable machine-readable table was found; checked by hand against the official source';

// ---------------------------------------------------------------- detect entries

const US = {
  id: 'tax-us', key: 'US', jurisdiction: 'United States (federal income tax, FICA)', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 45,
  expectedPublication: 'IRS inflation-adjustment Rev. Proc. and newsroom release in Oct-Nov; SSA wage base with the COLA in mid-October (Federal Register notice in late Oct-Nov)',
  licence: 'US federal government work (public domain)',
  values: '7 brackets 10%..37% (single top threshold $640,600), standard deduction $16,100 single / $32,200 joint, Social Security 6.2% to $184,500, Medicare 1.45% + 0.9% over $200,000 single (tax year 2026)',
  sources: {
    irsNews: { name: 'IRS newsroom: tax inflation adjustments for tax year 2026 (Rev. Proc. 2025-32)', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill', forYear: 2026 },
    tc751: { name: 'IRS Topic no. 751, Social Security and Medicare withholding rates', url: 'https://www.irs.gov/taxtopics/tc751' },
    irsMonth: { name: 'IRS news releases for the current month', url: 'https://www.irs.gov/newsroom/news-releases-for-current-month' },
    fedreg: { name: 'Federal Register API: SSA Cost-of-Living Increase and Other Determinations', url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=5&order=newest&conditions%5Bagencies%5D%5B%5D=social-security-administration&conditions%5Bterm%5D=%22Cost-of-Living+Increase+and+Other+Determinations%22' },
  },
  figures: [
    { key: 'US_FED thresholds 10%..35% (single)', unit: 'USD', encoded: [{ params: 'US.federal.single', column: 0, slice: [0, 5] }, { const: 'US_FED_{year}', path: 'single', column: 0, slice: [0, 5] }], official: { src: 'irsNews', extract: String.raw`\d+% for incomes over \$([\d,]+)`, all: true, sort: 'asc' } },
    { key: 'US_FED top threshold, 37% (single)', unit: 'USD', encoded: [{ params: 'US.federal.single', path: '[5][0]' }, { const: 'US_FED_{year}', path: 'single[5][0]' }], official: { src: 'irsNews', extract: String.raw`single taxpayers with incomes greater than \$([\d,]+)` } },
    { key: 'US_FED thresholds 10%..35% (joint)', unit: 'USD', encoded: [{ params: 'US.federal.mfj', column: 0, slice: [0, 5] }, { const: 'US_FED_{year}', path: 'mfj', column: 0, slice: [0, 5] }], official: { src: 'irsNews', extract: String.raw`\d+% for incomes over \$[\d,]+ \(\$([\d,]+) for married couples filing jointly\)`, all: true, sort: 'asc' } },
    { key: 'US_FED top threshold, 37% (joint)', unit: 'USD', encoded: [{ params: 'US.federal.mfj', path: '[5][0]' }, { const: 'US_FED_{year}', path: 'mfj[5][0]' }], official: { src: 'irsNews', extract: String.raw`incomes greater than \$[\d,]+ \(\$([\d,]+) for married couples filing jointly\)` } },
    { key: 'US_FED rates 12%..35%', unit: 'rate', encoded: [{ params: 'US.federal.single', column: 1, slice: [1, 6] }, { const: 'US_FED_{year}', path: 'single', column: 1, slice: [1, 6] }], official: { src: 'irsNews', extract: String.raw`(\d+%) for incomes over \$`, all: true, sort: 'asc', parse: 'percent' } },
    { key: 'US_FED lowest rate', unit: 'rate', encoded: [{ params: 'US.federal.single', path: '[0][1]' }, { const: 'US_FED_{year}', path: 'single[0][1]' }], official: { src: 'irsNews', extract: String.raw`The lowest rate is (\d+%)`, parse: 'percent' } },
    { key: 'US_FED top rate', unit: 'rate', encoded: [{ params: 'US.federal.single', path: '[6][1]' }, { const: 'US_FED_{year}', path: 'single[6][1]' }], official: { src: 'irsNews', extract: String.raw`the top tax rate remains (\d+%)`, parse: 'percent' } },
    { key: 'US_STD standard deduction (single)', unit: 'USD', encoded: [{ params: 'US.standardDeduction.single' }, { const: 'US_STD_{year}', path: 'single' }], official: { src: 'irsNews', extract: String.raw`For single taxpayers and married individuals filing separately, the standard deduction rises to \$([\d,]+) for tax year {year}` } },
    { key: 'US_STD standard deduction (joint)', unit: 'USD', encoded: [{ params: 'US.standardDeduction.mfj' }, { const: 'US_STD_{year}', path: 'mfj' }], official: { src: 'irsNews', extract: String.raw`For tax year {year}, the standard deduction increases to \$([\d,]+) for married couples filing jointly` } },
    { key: 'US_SS_BASE Social Security wage base', unit: 'USD', encoded: [{ params: 'US.ssWageBase' }, { const: 'US_SS_BASE_{year}' }], official: { src: 'tc751', extract: String.raw`For earnings in {year}, this base limit is \$([\d,]+)` } },
    { key: 'Social Security employee rate', unit: 'rate', encoded: [{ params: 'US.ssRate' }, { block: 'fn:usTax', match: String.raw`([\d.]+)\s*\*\s*min\(g,\s*US_SS_BASE` }], official: { src: 'tc751', extract: String.raw`tax rate for Social Security is [\d.]+% for the employer and ([\d.]+%) for the employee`, parse: 'percent' } },
    { key: 'Medicare employee rate', unit: 'rate', encoded: [{ params: 'US.medicareRate' }, { block: 'fn:usTax', match: String.raw`\+\s*([\d.]+)\s*\*\s*g\s*\+` }], official: { src: 'tc751', extract: String.raw`rate for Medicare is [\d.]+% for the employer and ([\d.]+%) for the employee`, parse: 'percent' } },
    { key: 'Additional Medicare tax rate', unit: 'rate', encoded: [{ params: 'US.addlMedicareRate' }, { block: 'fn:usTax', match: String.raw`([\d.]+)\s*\*\s*pos\(g\s*-\s*US_ADDL_MEDICARE` }], official: { src: 'tc751', extract: String.raw`withholding the ([\d.]+%) Additional Medicare tax`, parse: 'percent' } },
    { key: 'Additional Medicare threshold (single; withholding)', unit: 'USD', encoded: [{ params: 'US.addlMedicareThreshold.single' }, { const: 'US_ADDL_MEDICARE', path: 'single' }], official: { src: 'tc751', extract: String.raw`wages paid in excess of \$([\d,]+) in a calendar year` } },
    { key: 'Child tax credit per child', unit: 'USD', encoded: [{ params: 'US.childTaxCredit' }, { const: 'US_CTC_{year}' }], official: { extract: 'manual', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', note: 'Rev. Proc. §4.05 child tax credit (the newsroom release does not state it)' } },
  ],
  newYear: [
    { src: 'irsMonth', signal: String.raw`inflation adjustments for tax year {year1}`, label: 'IRS released the tax year {year1} inflation adjustments (new Rev. Proc.: brackets, standard deduction)' },
    { src: 'tc751', signal: String.raw`For earnings in {year1}, this base limit is \$([\d,]+)`, label: 'Social Security wage base for {year1} published (IRS Topic 751)', value: { parse: 'money' }, compareTo: 'US_SS_BASE Social Security wage base', expect: 'rise', unit: 'USD' },
    { src: 'fedreg', signal: String.raw`Cost-of-Living Increase and Other Determinations for {year1}`, label: 'SSA {year1} determinations (contribution and benefit base) published in the Federal Register' },
  ],
  schedules: [[{ params: 'US.federal.single' }, { const: 'US_FED_{year}', path: 'single' }], [{ params: 'US.federal.mfj' }, { const: 'US_FED_{year}', path: 'mfj' }]],
  notes: 'ssa.gov (cbb.html, press releases) answers 403 to GitHub runners (2026-10-10): the wage base is read from IRS Topic 751 and the SSA notice is detected through the Federal Register API. The newsroom release URL is per tax year (forYear): point it at the new release when the encoded year moves. The SALT cap is a function (usSaltCap) and is checked by hand (IRC §164(b)(7)).',
};

const US_CA = {
  id: 'tax-us-ca', key: 'US-CA', jurisdiction: 'California (FTB income tax, EDD SDI)', taxYear: 2025, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'FTB indexed tax rate schedules with the Form 540 booklet (Dec-Jan); EDD SDI rate for the next year in Oct-Dec',
  licence: 'State of California public information',
  values: 'Schedule X 1%..12.3% (top threshold $742,953), +1% over $1M (Behavioral Health Services Tax), standard deduction $5,706, exemption credit $153; SDI 1.3% (2026)',
  sources: {
    ftbSched: { name: 'FTB California Tax Rate Schedules (Form 540)', url: 'https://www.ftb.ca.gov/forms/{year}/{year}-540-tax-rate-schedules.pdf' },
    edd: { name: 'EDD Rates and withholding (SDI)', url: 'https://edd.ca.gov/en/payroll_taxes/rates_and_withholding' },
    ftbRates: { name: 'FTB tax calculator, tables and rates', url: 'https://www.ftb.ca.gov/file/personal/tax-calculator-tables-rates.asp' },
  },
  figures: [
    { key: 'CA Schedule X thresholds (single)', unit: 'USD', encoded: [{ params: 'US-CA.single', column: 0 }, { const: 'CA_X_{year}', column: 0 }], official: { src: 'ftbSched', section: { start: 'Form 540, line 19 is', end: 'If the amount on Form 540, If the amount' }, extract: String.raw`([\d,]+)\s+\$?\s*[\d,]+\.\d\d\s*\+\s*[\d.]+%`, all: true } },
    { key: 'CA Schedule X rates (single)', unit: 'rate', encoded: [{ params: 'US-CA.single', column: 1 }, { const: 'CA_X_{year}', column: 1 }], official: { src: 'ftbSched', section: { start: 'Form 540, line 19 is', end: 'If the amount on Form 540, If the amount' }, extract: String.raw`\+\s*([\d.]+%)`, all: true, parse: 'percent' } },
    { key: 'CA Schedule Y thresholds (joint)', unit: 'USD', encoded: [{ params: 'US-CA.mfj', column: 0 }, { const: 'CA_Y_{year}', column: 0 }], official: { src: 'ftbSched', section: { start: ['Form 540, line 19 is', 'If the amount on Form 540, If the amount'], end: 'If the amount on Form 540, If the amount' }, extract: String.raw`([\d,]+)\s+\$?\s*[\d,]+\.\d\d\s*\+\s*[\d.]+%`, all: true } },
    { key: 'CA SDI withholding rate', unit: 'rate', yearFrom: 'last', encoded: [{ params: 'US-CA.sdiRate' }, { block: 'US_STATE.CA', match: String.raw`sdi = ([\d.]+) \* g` }], official: { src: 'edd', extract: String.raw`The SDI withholding rate for {year} is ([\d.]+ percent)`, parse: 'percent' } },
    { key: 'CA standard deduction (single)', unit: 'USD', encoded: { block: 'US_STATE.CA', match: String.raw`pos\(g - \(m \? \d+ : (\d+)\)\)` }, official: { extract: 'manual', url: 'https://www.ftb.ca.gov/forms/{year}/{year}-540-booklet.pdf', note: 'FTB standard deduction for the tax year (Form 540 booklet)' } },
    { key: 'CA personal exemption credit', unit: 'USD', encoded: { block: 'US_STATE.CA', match: String.raw`pos\((\d+) - \d+ \* steps\)` }, official: { extract: 'manual', note: 'FTB personal exemption credit (Form 540, line 32) and its AGI phase-out' } },
    { key: 'CA Behavioral Health Services Tax threshold (1% over)', unit: 'USD', encoded: { block: 'US_STATE.CA', match: String.raw`0\.01 \* pos\(ti - ([\d.e]+)\)` }, official: { extract: 'manual', note: 'R&TC §17043: 1% on taxable income over $1,000,000 (not indexed)' } },
  ],
  newYear: [
    { url: 'https://www.ftb.ca.gov/forms/{year1}/{year1}-540-tax-rate-schedules.pdf', absentOk: true, signal: 'California Tax Rate Schedules', label: 'FTB {year1} California tax rate schedules published' },
    { src: 'ftbRates', signal: String.raw`Calculate your {year1} tax`, label: 'FTB {year1} tax calculator and rate schedules published' },
    { src: 'edd', yearFrom: 'last', signal: String.raw`The SDI withholding rate for {year1} is ([\d.]+ percent)`, label: 'EDD SDI rate for {year1} published', value: { parse: 'percent' }, compareTo: 'CA SDI withholding rate', unit: 'rate' },
  ],
  schedules: [{ const: 'CA_X_{year}' }, { const: 'CA_Y_{year}' }],
  notes: 'TAX_SOURCES says "2025 (brackets) / 2026 (SDI)": the brackets are compared with the FTB schedules for the first year, SDI with the EDD rate for the last year.',
};

const NY_PREV = 'https://www.tax.ny.gov/forms/html-instructions/{prev}/it/it201i-{prev}.htm';
const NY_SINGLE = { start: [String.raw`^New York State tax rate schedule\nIf your New York adjusted gross income`, '^Single and married filing separately'], end: '^Head of household' };
const US_NY = {
  id: 'tax-us-ny', key: 'US-NY', jurisdiction: 'New York State income tax', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'IT-2105-I (estimated tax, rates for the year) in Dec-Jan; IT-201 instructions (HTML) in January; rate changes in the state budget (April)',
  licence: 'New York State public information',
  sources: { nyPrev: { name: 'NY DTF Form IT-201 instructions (latest published tax year), tax rate schedule', url: NY_PREV } },
  figures: [
    { key: 'NY thresholds (single)', unit: 'USD', note: 'NY brackets are not indexed: the latest published instructions apply', encoded: [{ params: 'US-NY.single', column: 0 }, { const: 'NYS_{year}', path: 'single', column: 0 }], official: { src: 'nyPrev', section: NY_SINGLE, extract: String.raw`^of the excess over\n\$?([\d,]+)$`, all: true } },
    { key: 'NY rates over $215,400 (single)', unit: 'rate', encoded: [{ params: 'US-NY.single', column: 1, slice: [5, 9] }, { const: 'NYS_{year}', path: 'single', column: 1, slice: [5, 9] }], official: { src: 'nyPrev', section: NY_SINGLE, extract: String.raw`^([\d.]+%)$`, all: true, slice: [5, 9], parse: 'percent' } },
    { key: 'NY rates to $215,400 (2026 cut, single)', unit: 'rate', encoded: { const: 'NYS_{year}', path: 'single', column: 1, slice: [0, 5] }, official: { extract: 'manual', url: 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf', note: 'FY2026 budget: the lowest five rates fall from tax year 2026 (IT-2105-I 2026); the 2025 IT-201 instructions still show the old rates' } },
    { key: 'NY standard deduction (single)', unit: 'USD', encoded: { block: 'US_STATE.NY', match: String.raw`pos\(g - \(${MARRIED_OR}` }, official: { src: 'nyPrev', section: { start: '^New York State standard deduction table' }, extract: String.raw`Single and you marked item C No\n\$([\d,]+)$` } },
  ],
  newYear: [
    { url: 'https://www.tax.ny.gov/forms/html-instructions/{year}/it/it201i-{year}.htm', absentOk: true, signal: 'tax rate schedule', label: 'NY IT-201 instructions for tax year {year} published: compare the encoded {year} rates with them and move the source to {year}' },
  ],
  schedules: [{ const: 'NYS_{year}', path: 'single' }, { const: 'NYS_{year}', path: 'mfj' }],
  notes: 'The recapture worksheets (NYS_RECAPTURE_*) and the PFL / disability caps are listed in TAX_SOURCES but are not compared automatically.',
};

const NYC_SINGLE = { start: [String.raw`^New York City tax rate schedule\nMarried filing jointly`, '^Single and married filing separately'], end: '^Head of household' };
const US_LOCAL_NYC = {
  id: 'tax-us-local-nyc', key: 'US-LOCAL-NYC', jurisdiction: 'New York City resident income tax', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'IT-201 instructions (NYC tax rate schedule) in Dec-Jan',
  licence: 'New York State public information',
  sources: { nyPrev: { name: 'NY DTF Form IT-201 instructions, New York City tax rate schedule', url: NY_PREV } },
  figures: [
    { key: 'NYC thresholds (single)', unit: 'USD', encoded: [{ params: 'US-LOCAL-NYC.single', column: 0 }, { const: 'NYC_{year}', path: 'single', column: 0 }], official: { src: 'nyPrev', section: NYC_SINGLE, extract: String.raw`^of the excess over\n\$?([\d,]+)$`, all: true } },
    { key: 'NYC rates (single)', unit: 'rate', encoded: [{ params: 'US-LOCAL-NYC.single', column: 1 }, { const: 'NYC_{year}', path: 'single', column: 1 }], official: { src: 'nyPrev', section: NYC_SINGLE, extract: String.raw`^([\d.]+%)$`, all: true, parse: 'percent' } },
    { key: 'NYC school tax credit (fixed, single)', unit: 'USD', encoded: { block: 'US_LOCAL.NYC', match: String.raw`tax -= m \? \d+ : (\d+);` }, official: { extract: 'manual', note: 'NYC school tax credit, fixed amount and rate reduction (IT-201 instructions)' } },
  ],
  newYear: [{ url: 'https://www.tax.ny.gov/forms/html-instructions/{year}/it/it201i-{year}.htm', absentOk: true, signal: 'New York City tax rate schedule', label: 'IT-201 instructions for tax year {year} published: move the NYC source to {year}' }],
  schedules: [{ const: 'NYC_{year}', path: 'single' }, { const: 'NYC_{year}', path: 'mfj' }],
};

const US_MA = {
  id: 'tax-us-ma', key: 'US-MA', jurisdiction: 'Massachusetts income tax and 4% surtax', taxYear: 2025, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'DOR posts the indexed surtax threshold for the next year in Dec-Jan',
  licence: 'Commonwealth of Massachusetts public information',
  sources: { mass: { name: 'Mass.gov DOR tax rates', url: 'https://www.mass.gov/info-details/tax-rates' } },
  figures: [
    { key: 'MA flat rate (Part B wages)', unit: 'rate', encoded: { block: 'US_STATE.MA', match: String.raw`regional: ([\d.]+) \* ti` }, official: { src: 'mass', extract: String.raw`^([\d.]+%)\nTax year \d{4} : For income exceeding`, parse: 'percent' } },
    { key: 'MA surtax threshold', unit: 'USD', yearFrom: 'last', encoded: { block: 'US_STATE.MA', match: String.raw`pos\(ti - (\d+)\)` }, official: { src: 'mass', extract: String.raw`Tax year {year} : For income exceeding \$([\d,]+), there is an additional surtax` } },
    { key: 'MA surtax rate', unit: 'rate', yearFrom: 'last', encoded: { block: 'US_STATE.MA', match: String.raw`\+ ([\d.]+) \* pos\(ti` }, official: { src: 'mass', extract: String.raw`Tax year {year} : For income exceeding \$[\d,]+, there is an additional surtax of ([\d.]+%)`, parse: 'percent' } },
    { key: 'MA personal exemption (single)', unit: 'USD', encoded: { block: 'US_STATE.MA', match: MARRIED_OR }, official: { extract: 'manual', url: 'https://www.mass.gov/doc/{year}-form-1-instructions/download', note: 'Form 1 instructions: personal exemption (single)' } },
  ],
  newYear: [{ src: 'mass', yearFrom: 'last', signal: String.raw`Tax year {year1} : For income exceeding \$([\d,]+)`, label: 'Massachusetts {year1} surtax threshold published', value: { parse: 'money' }, compareTo: 'MA surtax threshold', expect: 'rise', unit: 'USD' }],
  notes: 'TAX_SOURCES asOf "2025 / 2026 (surtax)": the rate and exemption are the first year, the surtax threshold the last.',
};

const MN_SINGLE = { start: ['^Income Tax Rates for {year}', '^Single$'], end: '^(Previous Years|Income Tax Rates for|Married|Head of Household)' };
const US_MN = {
  id: 'tax-us-mn', key: 'US-MN', jurisdiction: 'Minnesota income tax', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'Department of Revenue inflation adjustments in December',
  licence: 'State of Minnesota public information',
  sources: { mn: { name: 'Minnesota Department of Revenue, income tax rates and brackets', url: 'https://www.revenue.state.mn.us/minnesota-income-tax-rates-and-brackets' } },
  figures: [
    { key: 'MN thresholds (single)', unit: 'USD', encoded: [{ params: 'US-MN.single', column: 0 }, { block: 'US_STATE.MN', match: R_SCHED, nth: 1, column: 0 }], official: { src: 'mn', section: MN_SINGLE, extract: String.raw`^[\d.]+%\s*\|\s*\$\s*[\d,]+\s*\|\s*\$\s*([\d,]+)`, all: true } },
    { key: 'MN rates (single)', unit: 'rate', encoded: [{ params: 'US-MN.single', column: 1 }, { block: 'US_STATE.MN', match: R_SCHED, nth: 1, column: 1 }], official: { src: 'mn', section: MN_SINGLE, extract: String.raw`^([\d.]+%)\s*\|`, all: true, parse: 'percent' } },
    { key: 'MN thresholds (joint)', unit: 'USD', encoded: [{ params: 'US-MN.mfj', column: 0 }, { block: 'US_STATE.MN', match: R_SCHED, nth: 0, column: 0 }], official: { src: 'mn', section: { start: ['^Income Tax Rates for {year}', '^Married Filing Jointly$'], end: '^(Head of Household|Married Filing Separately|Single)$' }, extract: String.raw`^[\d.]+%\s*\|\s*\$\s*[\d,]+\s*\|\s*\$\s*([\d,]+)`, all: true } },
    { key: 'MN standard deduction (single)', unit: 'USD', encoded: { block: 'US_STATE.MN', match: String.raw`pos\(g - \(${MARRIED_OR}` }, official: { extract: 'manual', url: 'https://www.revenue.state.mn.us/', note: 'inflation-adjusted standard deduction (single) for the tax year' } },
  ],
  newYear: [{ src: 'mn', signal: '^Income Tax Rates for {year1}', label: 'Minnesota {year1} brackets published' }],
  schedules: [{ block: 'US_STATE.MN', match: R_SCHED, nth: 0 }, { block: 'US_STATE.MN', match: R_SCHED, nth: 1 }],
};

const DC_SEC = { start: 'The tax rates for tax years beginning after', end: '^Rates for Tax Year' };
const US_DC = {
  id: 'tax-us-dc', key: 'US-DC', jurisdiction: 'District of Columbia income tax', taxYear: 2025, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'the OTR rate table changes only with a new law (Budget Support Act)',
  licence: 'District of Columbia public information',
  sources: { dc: { name: 'DC OTR individual and fiduciary income tax rates', url: 'https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates' } },
  figures: [
    { key: 'DC thresholds', unit: 'USD', encoded: { block: 'US_STATE.DC', match: R_SCHED, column: 0 }, official: { src: 'dc', section: DC_SEC, extract: String.raw`not over \$([\d,]+)\s*$`, all: true } },
    { key: 'DC rates', unit: 'rate', encoded: { block: 'US_STATE.DC', match: R_SCHED, column: 1 }, official: { src: 'dc', section: DC_SEC, extract: String.raw`(?:^|plus )([\d.]+%) of the`, all: true, parse: 'percent' } },
    { key: 'DC standard deduction (single)', unit: 'USD', encoded: { block: 'US_STATE.DC', match: MARRIED_OR }, official: { extract: 'manual', note: 'D-40 instructions: DC standard deduction (decoupled from the 2025 federal increase)' } },
  ],
  newYear: [{ src: 'dc', signal: String.raw`tax years beginning after 12/31/20(?:2[2-9]|[3-9]\d)`, label: 'DC OTR published a newer rate table (after the 2022+ schedule)' }],
  schedules: [{ block: 'US_STATE.DC', match: R_SCHED }],
};

const US_LOCAL_PORTLAND = {
  id: 'tax-us-local-portland', key: 'US-LOCAL-PORTLAND', jurisdiction: 'Portland area: Metro SHS and Multnomah PFA personal income taxes', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'City of Portland Revenue Division posts the next year\'s indexed Metro SHS thresholds in the autumn',
  licence: 'City of Portland public information',
  sources: { pdx: { name: 'City of Portland Revenue Division: Metro SHS and Multnomah County PFA personal income taxes', url: 'https://www.portland.gov/revenue/personal-tax' } },
  figures: [
    { key: 'Metro SHS threshold (single)', unit: 'USD', encoded: { block: 'US_LOCAL.PORTLAND', match: String.raw`taxable - \(${MARRIED_OR}`, nth: 0 }, official: { src: 'pdx', extract: String.raw`^(?:\d{4}-)?{year} \| \$([\d,]+) \|` } },
    { key: 'Metro SHS rate', unit: 'rate', encoded: { block: 'US_LOCAL.PORTLAND', match: String.raw`return ([\d.]+) \* pos\(taxable` }, official: { src: 'pdx', extract: String.raw`personal income tax rate is (\d+%) on Metro taxable income`, parse: 'percent' } },
    { key: 'Multnomah PFA first threshold (single)', unit: 'USD', encoded: { block: 'US_LOCAL.PORTLAND', match: String.raw`taxable - \(${MARRIED_OR}`, nth: 1 }, official: { src: 'pdx', extract: String.raw`rate is 1\.5% on Multnomah County taxable income over \$([\d,]+) for individuals` } },
    { key: 'Multnomah PFA second threshold (single)', unit: 'USD', encoded: { block: 'US_LOCAL.PORTLAND', match: String.raw`taxable - \(${MARRIED_OR}`, nth: 2 }, official: { src: 'pdx', extract: String.raw`additional 1\.5% on Multnomah County taxable income over \$([\d,]+) for individuals` } },
    { key: 'Multnomah PFA rate', unit: 'rate', encoded: { block: 'US_LOCAL.PORTLAND', match: String.raw`\+ ([\d.]+) \* pos\(taxable`, nth: 0 }, official: { src: 'pdx', extract: String.raw`Preschool for All \(PFA\) personal income tax rate is ([\d.]+%)`, parse: 'percent' } },
  ],
  newYear: [{ src: 'pdx', signal: String.raw`^{year1} \| \$([\d,]+) \|`, label: 'Metro SHS threshold for {year1} published', value: { parse: 'money' }, compareTo: 'Metro SHS threshold (single)', expect: 'rise', unit: 'USD' }],
  notes: 'The Portland arts tax ($50) is listed in TAX_SOURCES but not compared. The PFA rate rises 0.8 pt in 2028 (stated on the page).',
};

const US_UT = {
  id: 'tax-us-ut', key: 'US-UT', jurisdiction: 'Utah flat income tax', taxYear: 2025, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'legislative session (Jan-Mar) sets the rate; the Tax Commission updates the page with the TC-40 for the year',
  licence: 'State of Utah public information',
  sources: { ut: { name: 'Utah State Tax Commission: income tax rates', url: 'https://incometax.utah.gov/file-pay/tax-rates/' } },
  figures: [
    { key: 'Utah flat rate (current)', unit: 'rate', encoded: { block: 'US_STATE.UT', match: String.raw`regional: (?:pos\()?([\d.]+) \* g` }, official: { src: 'ut', extract: String.raw`^January 1, \d{4} - current\n([\d.]+%)`, parse: 'percent' } },
    { key: 'Taxpayer tax credit phase-out start (single)', unit: 'USD', encoded: { block: 'US_STATE.UT', match: MARRIED_OR }, official: { extract: 'manual', url: 'https://tax.utah.gov/forms/current/tc-40inst.pdf', note: 'TC-40 instructions: taxpayer tax credit (6% of the federal standard deduction) phase-out base for the year' } },
  ],
  newYear: [
    { src: 'ut', signal: String.raw`^January 1, {later} - current`, label: 'Utah published a rate in force from a year after {year}' },
    { src: 'ut', signal: String.raw`^{year1} Utah Income Tax$`, label: 'Utah Tax Commission pages now cover tax year {year1}' },
  ],
};

const GOVUK_EMP = 'https://www.gov.uk/api/content/guidance/rates-and-thresholds-for-employers-{year}-to-{year1}';
const GOVUK_EMP_NEXT = 'https://www.gov.uk/api/content/guidance/rates-and-thresholds-for-employers-{year1}-to-{year2}';
const ENG = { start: '^England and Northern Ireland$', end: '^Scotland$' };
const GB = {
  id: 'tax-gb', key: 'GB', jurisdiction: 'United Kingdom (England, Wales, NI): income tax and employee NICs', taxYear: 2026, yearStart: '04-06', mode: 'detect', cadence: 'yearly', graceDays: 30,
  expectedPublication: 'HMRC "Rates and thresholds for employers" for the next tax year in Jan-Feb (after the Autumn Budget); Spring Statement in March',
  licence: 'Crown copyright, Open Government Licence v3.0',
  sources: {
    emp: { name: 'GOV.UK Content API: Rates and thresholds for employers (tax year)', url: GOVUK_EMP },
    itr: { name: 'GOV.UK Content API: Income Tax rates and Personal Allowances', url: 'https://www.gov.uk/api/content/income-tax-rates' },
  },
  figures: [
    { key: 'Personal Allowance', unit: 'GBP', encoded: [{ params: 'GB.personalAllowance' }, { block: 'RULES.GB', match: String.raw`pos\((\d+)\s*-\s*pos\(g - \d+\)\s*/\s*2\)` }], official: { src: 'emp', section: ENG, extract: String.raw`^£([\d,]+) per year$` } },
    { key: 'Personal Allowance taper starts', unit: 'GBP', encoded: [{ params: 'GB.taperFrom' }, { block: 'RULES.GB', match: String.raw`pos\(g - (\d+)\)\s*/\s*2` }], official: { src: 'itr', extract: String.raw`adjusted net income is above £([\d,]+)` } },
    { key: 'GB_RUK basic rate band (above the allowance)', unit: 'GBP', encoded: [{ params: 'GB.bands', path: '[0][0]' }, { const: 'GB_RUK', path: '[0][0]' }], official: { src: 'emp', section: ENG, extract: String.raw`^Up to £([\d,]+)$` } },
    { key: 'GB_RUK higher rate band top (above the allowance)', unit: 'GBP', encoded: [{ params: 'GB.bands', path: '[1][0]' }, { const: 'GB_RUK', path: '[1][0]' }], official: { src: 'emp', section: ENG, extract: String.raw`^From £[\d,]+ to £([\d,]+)$` } },
    { key: 'GB_RUK rates', unit: 'rate', encoded: [{ params: 'GB.bands', column: 1 }, { const: 'GB_RUK', column: 1 }], official: { src: 'emp', section: ENG, extract: String.raw`^(\d+%)$`, all: true, parse: 'percent' } },
    { key: 'NICs primary threshold', unit: 'GBP', encoded: [{ params: 'GB.nicPrimaryThreshold' }, { block: 'RULES.GB', match: String.raw`min\(g,\s*\d+\)\s*-\s*(\d+)\)` }], official: { src: 'emp', section: { start: '^Class 1 National Insurance thresholds$', end: '^Class 1 National Insurance rates$' }, extract: String.raw`^Primary threshold\n[^\n]*\n[^\n]*\n£([\d,]+) per year` } },
    { key: 'NICs upper earnings limit', unit: 'GBP', encoded: [{ params: 'GB.nicUpperEarningsLimit' }, { block: 'RULES.GB', match: String.raw`min\(g,\s*(\d+)\)` }], official: { src: 'emp', section: { start: '^Class 1 National Insurance thresholds$', end: '^Class 1 National Insurance rates$' }, extract: String.raw`^Upper earnings limit\n[^\n]*\n[^\n]*\n£([\d,]+) per year` } },
    { key: 'NICs main rate (category A)', unit: 'rate', encoded: [{ params: 'GB.nicMainRate' }, { block: 'RULES.GB', match: String.raw`social = ([\d.]+)\s*\*` }], official: { src: 'emp', section: { start: String.raw`^Employee \(primary\) contribution rates` }, extract: String.raw`^A\n[\d.]+%\n([\d.]+%)$`, parse: 'percent' } },
    { key: 'NICs rate above the UEL (category A)', unit: 'rate', encoded: [{ params: 'GB.nicUpperRate' }, { block: 'RULES.GB', match: String.raw`\+\s*([\d.]+)\s*\*\s*pos\(g - \d+\)` }], official: { src: 'emp', section: { start: String.raw`^Employee \(primary\) contribution rates` }, extract: String.raw`^A\n[\d.]+%\n[\d.]+%\n([\d.]+%)$`, parse: 'percent' } },
  ],
  newYear: [
    { url: GOVUK_EMP_NEXT, absentOk: true, signal: String.raw`apply from 6 April {year1}`, label: 'HMRC rates and thresholds for employers {year1} to {year2} published' },
    { src: 'itr', signal: String.raw`The current tax year is from 6 April {year1}`, label: 'GOV.UK income tax rates now describe the {year1} to {year2} tax year' },
  ],
  schedules: [{ const: 'GB_RUK' }],
};

const GB_SCT = {
  id: 'tax-gb-sct', key: 'GB-SCT', jurisdiction: 'Scotland: Scottish income tax bands', taxYear: 2026, yearStart: '04-06', mode: 'detect', cadence: 'yearly', graceDays: 30,
  expectedPublication: 'Scottish Budget in Dec-Jan; HMRC employers page for the next tax year in Jan-Feb',
  licence: 'Crown copyright, Open Government Licence v3.0',
  sources: { emp: { name: 'GOV.UK Content API: Rates and thresholds for employers (Scotland section)', url: GOVUK_EMP } },
  figures: [
    { key: 'GB_SCT band tops (above the allowance)', unit: 'GBP', encoded: [{ params: 'GB.scotlandBands', column: 0 }, { const: 'GB_SCT', column: 0 }], official: { src: 'emp', section: { start: '^Scotland$', end: '^Wales$' }, extract: String.raw`^(?:Up to|From £[\d,]+ to) £([\d,]+)$`, all: true } },
    { key: 'GB_SCT rates', unit: 'rate', encoded: [{ params: 'GB.scotlandBands', column: 1 }, { const: 'GB_SCT', column: 1 }], official: { src: 'emp', section: { start: '^Scotland$', end: '^Wales$' }, extract: String.raw`^(\d+%)$`, all: true, parse: 'percent' } },
  ],
  newYear: [{ url: GOVUK_EMP_NEXT, absentOk: true, signal: '^Scotland$', label: 'HMRC rates and thresholds for employers {year1} to {year2} published (Scottish bands)' }],
  schedules: [{ const: 'GB_SCT' }],
};

const IE = {
  id: 'tax-ie', key: 'IE', jurisdiction: 'Ireland: PAYE income tax, USC, PRSI', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 30,
  expectedPublication: 'Budget in early October for the next calendar year; Revenue updates the charts after the Finance Act (Dec-Jan)',
  licence: 'Revenue (Ireland) public sector information',
  sources: {
    charts: { name: 'Revenue: tax rates, bands and reliefs', url: 'https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx' },
    usc: { name: 'Revenue: USC standard rates and thresholds', url: 'https://www.revenue.ie/en/jobs-and-pensions/usc/standard-rates-thresholds.aspx' },
  },
  figures: [
    { key: 'Standard rate band (single)', unit: 'EUR', encoded: [{ params: 'IE.band.single' }, { block: 'RULES.IE', match: String.raw`band = hh\.married \? \d+ : (\d+);` }], official: { src: 'charts', section: { start: String.raw`^Rates and bands for the years \d{4} to {year}$` }, extract: String.raw`^€([\d,]+) @ \d+%, balance @ \d+%$` } },
    { key: 'Standard rate', unit: 'rate', encoded: { block: 'RULES.IE', match: String.raw`([\d.]+) \* min\(g, band\)` }, official: { src: 'charts', section: { start: String.raw`^Rates and bands for the years \d{4} to {year}$` }, extract: String.raw`^€[\d,]+ @ (\d+%), balance`, parse: 'percent' } },
    { key: 'Higher rate', unit: 'rate', encoded: { block: 'RULES.IE', match: String.raw`\+ ([\d.]+) \* pos\(g - band\)` }, official: { src: 'charts', section: { start: String.raw`^Rates and bands for the years \d{4} to {year}$` }, extract: String.raw`balance @ (\d+%)$`, parse: 'percent' } },
    { key: 'USC thresholds', unit: 'EUR', encoded: { block: 'RULES.IE', match: R_SCHED, column: 0 }, official: { src: 'usc', section: { start: '^Standard rates and thresholds of USC for {year}$', end: '^Standard rates and thresholds of USC for' }, extract: String.raw`^(?:First|Next) €([\d,]+)$`, all: true, cumulative: true } },
    { key: 'USC rates', unit: 'rate', encoded: { block: 'RULES.IE', match: R_SCHED, column: 1 }, official: { src: 'usc', section: { start: '^Standard rates and thresholds of USC for {year}$', end: '^Standard rates and thresholds of USC for' }, extract: String.raw`^([\d.]+%)$`, all: true, parse: 'percent' } },
    { key: 'Personal tax credit (single)', unit: 'EUR', encoded: { block: 'RULES.IE', match: String.raw`\(hh\.married \? \d+ : (\d+)\) - \d+\)` }, official: { extract: 'manual', note: 'Single Person Tax Credit for the year (credits table)' } },
    { key: 'Employee (PAYE) tax credit', unit: 'EUR', encoded: { block: 'RULES.IE', match: String.raw`\) - (\d+)\);` }, official: { extract: 'manual', note: 'Employee Tax Credit for the year (credits table)' } },
    { key: 'PRSI Class A employee rate from 1 October', unit: 'rate', encoded: { block: 'RULES.IE', match: String.raw`\+ ([\d.]+) \* 3\) / 12` }, official: { extract: 'manual', url: 'https://www.gov.ie/en/department-of-social-protection/', note: 'PRSI Class A1 employee rate (4.35% from 1 Oct 2026; scheduled rises each October)' } },
  ],
  newYear: [
    { src: 'usc', signal: '^Standard rates and thresholds of USC for {year1}$', label: 'Revenue published the {year1} USC rates and thresholds' },
    { src: 'charts', signal: String.raw`please see Budget {year1}`, label: 'Budget {year1} announced: income tax bands, credits and USC for {year1}' },
    { src: 'charts', signal: String.raw`^Rates and bands for the years \d{4} to {year1}$`, label: 'Revenue published the {year1} rates and bands' },
  ],
  schedules: [{ block: 'RULES.IE', match: R_SCHED }],
};

const CRA_YEAR = ['https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html', 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html'];
const CRA_INDEX = { name: 'CRA tax rates and income brackets (index)', url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets.html' };
const CA = {
  id: 'tax-ca', key: 'CA', jurisdiction: 'Canada (federal income tax, CPP, CPP2, EI)', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 30,
  expectedPublication: 'CRA indexation (brackets, BPA) in November; CPP YMPE / YAMPE in early November; EI maximum insurable earnings and rate in Sep-Oct',
  licence: 'Government of Canada (Crown copyright; reproduction for non-commercial use permitted)',
  sources: {
    cra: { name: 'CRA tax rates and income brackets (current / last year)', urls: CRA_YEAR },
    cpp: { name: 'CRA CPP contribution rates, maximums and exemptions', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html' },
    ei: { name: 'CRA EI premium rates and maximums', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html' },
    index: CRA_INDEX,
  },
  figures: [
    { key: 'CA_FED thresholds', unit: 'CAD', encoded: [{ params: 'CA.federal', column: 0 }, { const: 'CA_FED_{year}', column: 0 }], official: { src: 'cra', section: { start: '^Federal rate: {year}$', end: '^Provincial or territorial rates' }, extract: String.raw`^\$([\d,]+)$`, all: true, slice: [1] } },
    { key: 'CA_FED rates', unit: 'rate', encoded: [{ params: 'CA.federal', column: 1 }, { const: 'CA_FED_{year}', column: 1 }], official: { src: 'cra', section: { start: '^Federal rate: {year}$', end: '^Provincial or territorial rates' }, extract: String.raw`^([\d.]+%)$`, all: true, parse: 'percent' } },
    { key: 'CPP YMPE (maximum pensionable earnings)', unit: 'CAD', encoded: { block: 'fn:caPayroll', match: String.raw`min\(g,\s*(\d+)\)\s*-\s*\d+\)` }, official: { src: 'cpp', extract: String.raw`^(?:New )?{year}\n\$([\d,]+)\n\$[\d,]+\n` } },
    { key: 'CPP basic exemption', unit: 'CAD', encoded: { block: 'fn:caPayroll', match: String.raw`min\(g,\s*\d+\)\s*-\s*(\d+)\)` }, official: { src: 'cpp', extract: String.raw`^(?:New )?{year}\n\$[\d,]+\n\$([\d,]+)\n` } },
    { key: 'CPP employee rate', unit: 'rate', encoded: { block: 'fn:caPayroll', match: String.raw`qc \? [\d.]+ : ([\d.]+);` }, official: { src: 'cpp', extract: String.raw`^(?:New )?{year}\n\$[\d,]+\n\$[\d,]+\n\$[\d,]+\n([\d.]+)$`, parse: 'number', scale: 0.01 } },
    { key: 'EI maximum insurable earnings', unit: 'CAD', encoded: { block: 'fn:caPayroll', match: String.raw`\(qc \? [\d.]+ : [\d.]+\)\s*\*\s*min\(g,\s*(\d+)\)` }, official: { src: 'ei', section: { start: '^Federal EI premium rates and maximums$' }, extract: String.raw`^(?:New )?{year}\n\$([\d,]+)\n[\d.]+\n` } },
    { key: 'EI employee rate', unit: 'rate', encoded: { block: 'fn:caPayroll', match: String.raw`\(qc \? [\d.]+ : ([\d.]+)\)\s*\*\s*min` }, official: { src: 'ei', section: { start: '^Federal EI premium rates and maximums$' }, extract: String.raw`^(?:New )?{year}\n\$[\d,]+\n([\d.]+)\n`, parse: 'number', scale: 0.01 } },
    { key: 'CPP2 YAMPE (additional maximum)', unit: 'CAD', encoded: { block: 'fn:caPayroll', match: String.raw`0\.04 \* pos\(min\(g, (\d+)\)` }, official: { extract: 'manual', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html', note: 'second additional CPP (CPP2) table, YAMPE for the year (the full page timed out from the runner)' } },
    { key: 'Federal basic personal amount (maximum)', unit: 'CAD', encoded: { block: 'fn:caBpaf', match: String.raw`return (\d+);`, nth: 0 }, official: { extract: 'manual', url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html', note: 'CRA indexation: basic personal amount (maximum and minimum) for the year' } },
    { key: 'Canada employment amount', unit: 'CAD', encoded: { block: 'RULES.CA', match: String.raw`caBpaf\(ti\) \+ (\d+) \+ creditable` }, official: { extract: 'manual', note: 'CRA indexation: Canada employment amount for the year' } },
  ],
  newYear: [
    { src: 'ei', signal: String.raw`^New {year1}\n\$([\d,]+)`, label: 'EI {year1} maximum insurable earnings and rate published', value: { parse: 'money' }, compareTo: 'EI maximum insurable earnings', expect: 'rise', unit: 'CAD' },
    { src: 'cpp', signal: String.raw`^(?:New )?{year1}\n\$([\d,]+)`, label: 'CPP {year1} maximum pensionable earnings published', value: { parse: 'money' }, compareTo: 'CPP YMPE (maximum pensionable earnings)', expect: 'rise', unit: 'CAD' },
    { src: 'index', signal: String.raw`Tax rates and income brackets to be used on the {year1} tax return`, label: 'CRA {year1} federal and provincial brackets published' },
  ],
  schedules: [{ const: 'CA_FED_{year}' }],
};

const ON_SEC = { start: '^Ontario rate: {year}$', end: '^Prince Edward Island$' };
const CA_ON = {
  id: 'tax-ca-on', key: 'CA-ON', jurisdiction: 'Ontario provincial income tax, surtax, health premium', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 30,
  expectedPublication: 'CRA current-year page and T4127 in Nov-Jan (Ontario indexes its lower brackets; $150,000 and $220,000 are fixed)',
  licence: 'Government of Canada (Crown copyright; reproduction for non-commercial use permitted)',
  sources: { cra: { name: 'CRA tax rates and income brackets: Ontario', urls: CRA_YEAR }, index: CRA_INDEX },
  figures: [
    { key: 'ON thresholds', unit: 'CAD', encoded: { block: 'CA_PROV.ON', match: R_SCHED, column: 0 }, official: { src: 'cra', section: ON_SEC, extract: String.raw`^\$([\d,]+)$`, all: true, slice: [1] } },
    { key: 'ON rates', unit: 'rate', encoded: { block: 'CA_PROV.ON', match: R_SCHED, column: 1 }, official: { src: 'cra', section: ON_SEC, extract: String.raw`^([\d.]+%)$`, all: true, parse: 'percent' } },
    { key: 'ON surtax first threshold', unit: 'CAD', encoded: { block: 'CA_PROV.ON', match: String.raw`0\.2 \* pos\(basic - (\d+)\)` }, official: { extract: 'manual', url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas.html', note: 'Ontario surtax thresholds (20% over the first, 36% over the second) for the year (T4127 / ON428)' } },
    { key: 'ON basic personal amount', unit: 'CAD', encoded: { block: 'CA_PROV.ON', match: String.raw`\((\d+) \+ credit\)` }, official: { extract: 'manual', note: 'Ontario basic personal amount for the year (ON428 / TD1ON)' } },
  ],
  newYear: [{ src: 'index', signal: String.raw`Tax rates and income brackets to be used on the {year1} tax return`, label: 'CRA {year1} provincial brackets published' }],
  schedules: [{ block: 'CA_PROV.ON', match: R_SCHED }],
};

const BC_SEC = { start: '^{year} Personal income tax brackets and rates$', end: '^(See personal income tax brackets|Personal income tax brackets and rates - )' };
const CA_BC = {
  id: 'tax-ca-bc', key: 'CA-BC', jurisdiction: 'British Columbia provincial income tax', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 30,
  expectedPublication: 'BC Budget in February; brackets on gov.bc.ca and the CRA current-year page (Budget 2026 paused indexation for 2027-2030)',
  licence: 'Province of British Columbia (Crown copyright)',
  sources: { bc: { name: 'Government of BC: personal income tax brackets and rates', url: 'https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates' } },
  figures: [
    { key: 'BC thresholds', unit: 'CAD', encoded: { block: 'CA_PROV.BC', match: R_SCHED, column: 0 }, official: { src: 'bc', section: BC_SEC, extract: String.raw`to \$([\d,]+)$`, all: true } },
    { key: 'BC rates', unit: 'rate', encoded: { block: 'CA_PROV.BC', match: R_SCHED, column: 1 }, official: { src: 'bc', section: BC_SEC, extract: String.raw`^([\d.]+%)$`, all: true, parse: 'percent' } },
    { key: 'BC basic personal amount', unit: 'CAD', encoded: { block: 'CA_PROV.BC', match: String.raw`\((\d+) \+ credit\)` }, official: { extract: 'manual', url: 'https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic', note: 'BC basic personal amount for the year' } },
  ],
  newYear: [{ src: 'bc', signal: '^{year1} Personal income tax brackets and rates$', label: 'BC {year1} brackets and rates published' }],
  schedules: [{ block: 'CA_PROV.BC', match: R_SCHED }],
};

const NZ_SEC = { start: String.raw`^From 1 April \d{4}$`, end: String.raw`^From 1 April \d{4} to` };
const NZ = {
  id: 'tax-nz', key: 'NZ', jurisdiction: 'New Zealand income tax and ACC earners levy', taxYear: 2026, yearStart: '04-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'Budget in May for 1 April; the ACC levy for the next year is set in Dec-Mar',
  licence: 'Inland Revenue (NZ) public information (licence not reviewed)',
  sources: { ird: { name: 'IRD tax rates for individuals', url: 'https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals' } },
  figures: [
    { key: 'NZ thresholds', unit: 'NZD', encoded: { block: 'RULES.NZ', match: R_SCHED, column: 0 }, official: { src: 'ird', section: NZ_SEC, extract: String.raw`- \$([\d,]+)$`, all: true } },
    { key: 'NZ rates', unit: 'rate', encoded: { block: 'RULES.NZ', match: R_SCHED, column: 1 }, official: { src: 'ird', section: NZ_SEC, extract: String.raw`^([\d.]+%)$`, all: true, parse: 'percent' } },
    { key: 'ACC earners levy rate', unit: 'rate', encoded: { block: 'RULES.NZ', match: String.raw`social: ([\d.]+) \* min` }, official: { extract: 'manual', url: 'https://www.ird.govt.nz/', note: 'ACC earners levy rate for the year from 1 April' } },
    { key: 'ACC earners levy maximum liable earnings', unit: 'NZD', encoded: { block: 'RULES.NZ', match: String.raw`min\(g, (\d+)\)` }, official: { extract: 'manual', note: 'ACC maximum liable earnings for the year from 1 April' } },
  ],
  newYear: [{ src: 'ird', signal: String.raw`^From 1 April {later}$`, label: 'IRD published rates from a later 1 April' }],
  schedules: [{ block: 'RULES.NZ', match: R_SCHED }],
};

const SG = {
  id: 'tax-sg', key: 'SG', jurisdiction: 'Singapore resident income tax', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'Budget in February (changes apply from a stated Year of Assessment)',
  licence: 'IRAS (Singapore Government) public information',
  sources: { iras: { name: 'IRAS individual income tax rates', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates' } },
  figures: [
    { key: 'SG chargeable income thresholds', unit: 'SGD', encoded: { block: 'RULES.SG', match: R_SCHED, column: 0 }, official: { src: 'iras', section: { start: String.raw`^From YA \d{4} onwards$`, end: '^Personal Income Tax Rebate' }, extract: String.raw`^First \$([\d,]+)`, all: true } },
    { key: 'SG rates', unit: 'rate', encoded: { block: 'RULES.SG', match: R_SCHED, column: 1 }, official: { extract: 'manual', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates', note: 'rates 0%..24% (the table layout does not give one cell per rate)' } },
    { key: 'Earned income relief', unit: 'SGD', encoded: { block: 'RULES.SG', match: String.raw`pos\(g - (\d+)\)` }, official: { extract: 'manual', note: 'IRAS earned income relief (below age 55)' } },
  ],
  newYear: [{ src: 'iras', signal: String.raw`^From YA 20(?:2[5-9]|[3-9]\d) onwards$`, label: 'IRAS published a resident rate table for a later Year of Assessment (current table: from YA 2024)' }],
  schedules: [{ block: 'RULES.SG', match: R_SCHED }],
};

const HK_SEC = { start: String.raw`^Year of Assessment \d{4}/\d\d onwards`, end: '^Standard Rate$' };
const HK = {
  id: 'tax-hk', key: 'HK', jurisdiction: 'Hong Kong salaries tax', taxYear: 2026, yearStart: '04-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'Budget in Feb-Mar for the year of assessment starting 1 April',
  licence: 'GovHK public information',
  sources: { govhk: { name: 'GovHK salaries tax rates', url: 'https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm' } },
  figures: [
    { key: 'HK progressive band tops', unit: 'HKD', encoded: { block: 'RULES.HK', match: R_SCHED, column: 0 }, official: { src: 'govhk', section: HK_SEC, extract: String.raw`^On the (?:First|Next)\n([\d,]+)$`, all: true, cumulative: true } },
    { key: 'HK progressive rates', unit: 'rate', encoded: { block: 'RULES.HK', match: R_SCHED, column: 1 }, official: { src: 'govhk', section: HK_SEC, extract: String.raw`^(\d+%)$`, all: true, parse: 'percent' } },
    { key: 'HK standard rate', unit: 'rate', encoded: { block: 'RULES.HK', match: String.raw`standard = ([\d.]+) \*` }, official: { src: 'govhk', section: { start: '^Two-tiered Standard Rates$' }, extract: String.raw`^On the first \$[\d,]+ of net income\n(\d+%)$`, parse: 'percent' } },
    { key: 'HK standard rate threshold', unit: 'HKD', encoded: { block: 'RULES.HK', match: String.raw`min\(net, ([\d.e]+)\)` }, official: { src: 'govhk', section: { start: '^Two-tiered Standard Rates$' }, extract: String.raw`^On the first \$([\d,]+) of net income` } },
    { key: 'HK standard rate above the threshold', unit: 'rate', encoded: { block: 'RULES.HK', match: String.raw`\+ ([\d.]+) \* pos\(net - ` }, official: { src: 'govhk', section: { start: '^Two-tiered Standard Rates$' }, extract: String.raw`^Remainder\n(\d+%)$`, parse: 'percent' } },
    { key: 'HK basic allowance', unit: 'HKD', encoded: { block: 'RULES.HK', match: String.raw`\(hh\.married \? \d+ : (\d+)\)` }, official: { extract: 'manual', url: 'https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm', note: 'basic allowance for the year of assessment' } },
    { key: 'MPF mandatory contribution cap', unit: 'HKD', encoded: { block: 'RULES.HK', match: String.raw`min\((\d+), [\d.]+ \* g\)` }, official: { extract: 'manual', note: 'MPF: 5% of relevant income, deduction capped at HK$18,000' } },
  ],
  newYear: [{ src: 'govhk', signal: String.raw`^(?:Year of Assessment )?20(?:2[6-9]|[3-9]\d)/\d\d onwards`, label: 'GovHK published salaries tax rates for a later year of assessment (current tables: 2020/21 and 2024/25 onwards)' }],
  schedules: [{ block: 'RULES.HK', match: R_SCHED }],
};

const JP = {
  id: 'tax-jp', key: 'JP', jurisdiction: 'Japan national income tax (resident tax and social insurance listed)', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'tax reform outline in December, enacted in March for the year',
  licence: 'National Tax Agency (Japan) public information',
  sources: { nta: { name: 'NTA Tax Answer No.2260 (income tax rates)', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm' } },
  figures: [
    { key: 'JP income tax thresholds', unit: 'JPY', encoded: { block: 'RULES.JP', match: R_SCHED, column: 0 }, official: { src: 'nta', extract: String.raw`^([\d,]+)円 (?:から|以上)`, all: true, slice: [1] } },
    { key: 'JP income tax rates', unit: 'rate', encoded: { block: 'RULES.JP', match: R_SCHED, column: 1 }, official: { src: 'nta', extract: String.raw`^(\d+%)$`, all: true, parse: 'percent' } },
    { key: 'Reconstruction surtax', unit: 'rate', encoded: { block: 'RULES.JP', match: String.raw`income = ([\d.]+) \* progressive`, add: -1 }, official: { src: 'nta', extract: String.raw`基準所得税額の([\d.]+)パーセント`, parse: 'number', scale: 0.01 } },
    { key: 'Basic deduction (income tax)', unit: 'JPY', encoded: { block: 'RULES.JP', match: String.raw`total <= 23\.5e6 \? (\d+)` }, official: { extract: 'manual', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm', note: 'basic deduction by total income for the year' } },
    { key: 'Employment income deduction minimum', unit: 'JPY', encoded: { block: 'fn:jpEmploymentDeduction', match: String.raw`min\(g, (\d+)\)` }, official: { extract: 'manual', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm', note: 'employment income deduction table for the year' } },
  ],
  newYear: [{ src: 'nta', signal: String.raw`令和(\d+)年1月1日以後に生ずる所得については、復興特別所得税の税率が([\d.]+)パーセントに引き下げられ`, notice: true, label: 'NTA: from 1 Jan 2027 the reconstruction surtax falls to 1.1% and a 1% defence surtax is withheld (combined 2.1%, so the 1.021 multiplier is unchanged; check the next tax reform)' }],
  schedules: [{ block: 'RULES.JP', match: R_SCHED }],
};

const NO = {
  id: 'tax-no', key: 'NO', jurisdiction: 'Norway bracket tax (general income tax, allowances and national insurance listed)', taxYear: 2026, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'state budget proposal in early October, adopted in December',
  licence: 'Skatteetaten public information (licence not reviewed)',
  sources: {
    noYear: { name: 'Skatteetaten rates: bracket tax (selected year)', url: 'https://www.skatteetaten.no/en/rates/bracket-tax/?year={year}' },
    no: { name: 'Skatteetaten rates: bracket tax (latest year)', url: 'https://www.skatteetaten.no/en/rates/bracket-tax/' },
  },
  figures: [
    { key: 'NO bracket tax thresholds', unit: 'NOK', encoded: { block: 'RULES.NO', match: R_SCHED, column: 0, slice: [0, 5] }, official: { src: 'noYear', extract: String.raw`^Income between NOK [\d,]+ - ([\d,]+)$`, all: true } },
    { key: 'NO bracket tax rates', unit: 'rate', encoded: { block: 'RULES.NO', match: R_SCHED, column: 1, slice: [1, 6] }, official: { src: 'noYear', extract: String.raw`^([\d.]+%) bracket tax$`, all: true, parse: 'percent' } },
    { key: 'Personal allowance', unit: 'NOK', encoded: { block: 'RULES.NO', match: String.raw`\) - (\d+)\)` }, official: { extract: 'manual', url: 'https://www.skatteetaten.no/en/rates/personal-allowance/', note: 'personal allowance (class 1) for the year' } },
    { key: 'National insurance contribution (employees)', unit: 'rate', encoded: { block: 'RULES.NO', match: String.raw`social: ([\d.]+) \* g` }, official: { extract: 'manual', url: 'https://www.skatteetaten.no/en/rates/national-insurance-contributions/', note: 'trygdeavgift on wage income for the year' } },
  ],
  newYear: [{ src: 'no', signal: String.raw`^Select year\n{year1}$`, label: 'Skatteetaten shows {year1} bracket tax rates' }],
  schedules: [{ block: 'RULES.NO', match: R_SCHED }],
};

const FR_SEC = { start: '^Tableau - Barème progressif applicable aux revenus de {year}$', end: '^(Un célibataire|Revenu net imposable|Exemple)' };
const FR = {
  id: 'tax-fr', key: 'FR', jurisdiction: 'France impôt sur le revenu (barème per part) and employee contributions', taxYear: 2025, yearStart: '01-01', mode: 'detect', cadence: 'yearly', graceDays: 60,
  expectedPublication: 'loi de finances in Dec-Feb (the barème of year N applies to incomes of N-1); PASS in December',
  licence: 'Service-Public.fr (DILA) public information (licence not reviewed)',
  sources: { sp: { name: 'Service-Public.fr F1419: barème de l’impôt sur le revenu', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1419' } },
  figures: [
    { key: 'FR barème thresholds (incomes of the tax year)', unit: 'EUR', encoded: [{ params: 'FR.bareme', column: 0 }, { const: 'FR_BAREME', column: 0 }], official: { src: 'sp', section: FR_SEC, extract: String.raw`(?:^Jusqu'à|€ à) ([\d ]+) €$`, all: true } },
    { key: 'FR barème rates', unit: 'rate', encoded: [{ params: 'FR.bareme', column: 1 }, { const: 'FR_BAREME', column: 1 }], official: { src: 'sp', section: FR_SEC, extract: String.raw`^(\d+ ?%)$`, all: true, parse: 'percent' } },
    { key: '10% professional deduction cap', unit: 'EUR', encoded: { block: 'RULES.FR', match: String.raw`min\(0\.1 \* taxable, (\d+)\)` }, official: { extract: 'manual', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1989', note: 'abattement de 10% pour frais professionnels: plafond for the year' } },
    { key: 'PASS (plafond annuel de la sécurité sociale)', unit: 'EUR', yearFrom: 'last', encoded: { const: 'FR_PASS_{year}' }, official: { extract: 'manual', url: 'https://www.urssaf.fr/', note: 'PASS for the year (URSSAF)' } },
  ],
  newYear: [{ src: 'sp', signal: String.raw`^Tableau - Barème progressif applicable aux revenus de {year1}$`, label: 'Service-Public shows the barème for incomes of {year1}' }],
  schedules: [{ const: 'FR_BAREME' }],
  notes: 'TAX_SOURCES asOf "2025 income (barème) / 2026 (contributions)": {year} is the income year of the barème.',
};

// ---------------------------------------------------------------- manual entries

function manual(id, key, jurisdiction, taxYear, extra = {}) {
  return { id, key, jurisdiction, taxYear, yearStart: '01-01', mode: 'manual', cadence: 'yearly', graceDays: 60, manualReason: NO_FEED, figures: [], newYear: [], ...extra };
}
const fig = (key, unit, encoded, note, url) => ({ key, unit, encoded, official: { extract: 'manual', note, ...(url ? { url } : {}) } });
const flat = (block, what) => fig(what, 'rate', { block, match: String.raw`regional: (?:pos\()?([\d.]+) \* (?:ti|g)\b` }, `${what} for the tax year`);
const singleOf = (block, what, unit = 'USD') => fig(what, unit, { block, match: MARRIED_OR }, `${what} for the tax year`);
const sched = (block, what, unit, nth) => fig(what, unit, { block, match: R_SCHED, ...(nth != null ? { nth } : {}) }, `${what}: every threshold and rate`);
const schedConst = (name, what, unit, path) => fig(what, unit, { const: name, ...(path ? { path } : {}) }, `${what}: every threshold and rate`);

const MANUAL = [
  manual('tax-us-wa', 'US-WA', 'Washington (no wage income tax; WA Cares and PFML premiums)', 2026, { manualReason: 'wacaresfund.wa.gov renders its rate client-side; checked by hand', expectedPublication: 'WA Cares premium by statute (0.58%); PFML rate set each autumn', figures: [fig('WA Cares premium', 'rate', { block: 'US_STATE.WA', match: String.raw`social: ([\d.]+) \* g` }, 'WA Cares Fund premium rate', 'https://wacaresfund.wa.gov/employers/'), fig('PFML total premium rate', 'rate', { block: 'US_STATE.WA', match: String.raw`pfml = ([\d.]+) \*` }, 'Paid Family and Medical Leave premium and employee share for the year', 'https://paidleave.wa.gov/employers/')] }),
  manual('tax-us-tx', 'US-TX', 'Texas (no state income tax on wages)', 2026, { expectedPublication: 'constitutional ban on a personal income tax; review yearly' }),
  manual('tax-us-fl', 'US-FL', 'Florida (no state income tax on wages)', 2026, { expectedPublication: 'constitutional ban on a personal income tax; review yearly' }),
  manual('tax-us-tn', 'US-TN', 'Tennessee (no state income tax on wages)', 2026, { expectedPublication: 'Hall tax repealed from 2021; review yearly' }),
  manual('tax-us-nv', 'US-NV', 'Nevada (no state income tax on wages)', 2026, { expectedPublication: 'constitutional ban on a personal income tax; review yearly' }),
  manual('tax-us-ga', 'US-GA', 'Georgia flat income tax', 2026, { expectedPublication: 'rate cuts by statute (HB 111 / HB 463); DOR notice in Dec-Jan', figures: [flat('US_STATE.GA', 'Georgia flat rate'), singleOf('US_STATE.GA', 'Georgia standard deduction (single)')] }),
  manual('tax-us-al', 'US-AL', 'Alabama income tax', 2025, { expectedPublication: ANNUAL_US, figures: [schedConst('AL_{year}', 'Alabama brackets (single)', 'USD', 'single')], schedules: [{ const: 'AL_{year}', path: 'single' }, { const: 'AL_{year}', path: 'mfj' }] }),
  manual('tax-us-oh', 'US-OH', 'Ohio income tax', 2026, { expectedPublication: ANNUAL_US, figures: [fig('Ohio rate over the zero bracket', 'rate', { block: 'US_STATE.OH', match: String.raw`\+ ([\d.]+) \* \(ti - \d+\)` }, 'ORC 5747.02 rate'), fig('Ohio zero-bracket top', 'USD', { block: 'US_STATE.OH', match: String.raw`ti > (\d+) \?` }, 'ORC 5747.02 threshold')] }),
  manual('tax-us-va', 'US-VA', 'Virginia income tax', 2026, { expectedPublication: ANNUAL_US, figures: [sched('US_STATE.VA', 'Virginia brackets', 'USD'), singleOf('US_STATE.VA', 'Virginia standard deduction (single)')], schedules: [{ block: 'US_STATE.VA', match: R_SCHED }] }),
  manual('tax-us-il', 'US-IL', 'Illinois flat income tax', 2026, { expectedPublication: 'IL-700-T in Dec-Jan', figures: [flat('US_STATE.IL', 'Illinois flat rate'), fig('Illinois exemption per person', 'USD', { block: 'US_STATE.IL', match: String.raw`(\d+) \* usPersons` }, 'IL-700-T exemption allowance')] }),
  manual('tax-us-co', 'US-CO', 'Colorado flat income tax (of federal taxable income)', 2025, { expectedPublication: 'rate set each year by the TABOR revenue trigger (announced in the autumn)', figures: [flat('US_STATE.CO', 'Colorado flat rate')] }),
  manual('tax-us-pa', 'US-PA', 'Pennsylvania flat income tax and UC withholding', 2026, { expectedPublication: 'rate by statute; UC employee rate each January', figures: [flat('US_STATE.PA', 'Pennsylvania flat rate'), fig('PA UC employee withholding', 'rate', { block: 'US_STATE.PA', match: String.raw`uc = ([\d.]+) \* g` }, 'unemployment compensation employee rate')] }),
  manual('tax-us-nc', 'US-NC', 'North Carolina flat income tax', 2026, { expectedPublication: 'scheduled rate cuts in statute; DOR notice in December', figures: [flat('US_STATE.NC', 'North Carolina flat rate'), singleOf('US_STATE.NC', 'North Carolina standard deduction (single)')] }),
  manual('tax-us-or', 'US-OR', 'Oregon income tax, transit tax, Paid Leave Oregon', 2026, { expectedPublication: 'withholding formulas (150-206-436) in December', figures: [schedConst('OR_{year}', 'Oregon brackets (single)', 'USD', 'single'), singleOf('US_STATE.OR', 'Oregon standard deduction (single)')], schedules: [{ const: 'OR_{year}', path: 'single' }, { const: 'OR_{year}', path: 'mfj' }] }),
  manual('tax-us-az', 'US-AZ', 'Arizona flat income tax', 2025, { expectedPublication: ANNUAL_US, figures: [flat('US_STATE.AZ', 'Arizona flat rate'), singleOf('US_STATE.AZ', 'Arizona standard deduction (single)')] }),
  manual('tax-us-mi', 'US-MI', 'Michigan flat income tax', 2026, { expectedPublication: 'Treasury announces the rate (income-tax trigger) in May and the exemption in December', figures: [flat('US_STATE.MI', 'Michigan flat rate'), fig('Michigan exemption per person', 'USD', { block: 'US_STATE.MI', match: String.raw`(\d+) \* usPersons` }, 'personal exemption')] }),
  manual('tax-us-md', 'US-MD', 'Maryland state income tax', 2025, { manualReason: 'the Comptroller page (marylandtaxes.gov -> services.marylandcomptroller.gov) renders its rate tables client-side; checked by hand', expectedPublication: 'legislative session (Jan-Apr); Comptroller rate pages', figures: [schedConst('MD_{year}', 'Maryland brackets (single)', 'USD', 'single')], schedules: [{ const: 'MD_{year}', path: 'single' }, { const: 'MD_{year}', path: 'mfj' }] }),
  manual('tax-us-local-columbus', 'US-LOCAL-COLUMBUS', 'Columbus, OH city income tax', 2024, { expectedPublication: 'city council ordinance (rare)', figures: [fig('Columbus rate', 'rate', { block: 'US_LOCAL.COLUMBUS', match: String.raw`([\d.]+) \* g` }, 'Columbus income tax rate (IR-25 instructions)')] }),
  manual('tax-us-local-philadelphia', 'US-LOCAL-PHILADELPHIA', 'Philadelphia resident wage tax', 2026, { expectedPublication: 'city budget; the resident rate changes each 1 July', figures: [fig('Philadelphia resident wage tax (to 30 June)', 'rate', { block: 'US_LOCAL.PHILADELPHIA', match: String.raw`\(\(([\d.]+) \+` }, 'resident wage tax rate', 'https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax-employers/'), fig('Philadelphia resident wage tax (from 1 July)', 'rate', { block: 'US_LOCAL.PHILADELPHIA', match: String.raw`\+ ([\d.]+)\) / 2` }, 'resident wage tax rate from 1 July')] }),
  manual('tax-us-local-pittsburgh', 'US-LOCAL-PITTSBURGH', 'Pittsburgh earned income tax (city + school district) and LST', 2026, { figures: [fig('Pittsburgh EIT', 'rate', { block: 'US_LOCAL.PITTSBURGH', match: String.raw`([\d.]+) \* g` }, 'city 1% + Pittsburgh School District 2%')] }),
  manual('tax-us-local-detroit', 'US-LOCAL-DETROIT', 'Detroit resident city income tax', 2026, { manualReason: `detroitmi.gov ${RUNNER_403}`, figures: [fig('Detroit resident rate', 'rate', { block: 'US_LOCAL.DETROIT', match: String.raw`([\d.]+) \* pos` }, 'resident rate'), fig('Detroit exemption per person', 'USD', { block: 'US_LOCAL.DETROIT', match: String.raw`pos\(g - (\d+) \*` }, 'personal exemption')] }),
  manual('tax-us-local-md-county', 'US-LOCAL-MD-COUNTY', 'Maryland local income tax (Baltimore City)', 2025, { manualReason: 'the Comptroller local rate table renders client-side; checked by hand', figures: [fig('Baltimore City local rate', 'rate', { block: 'US_LOCAL.MD-COUNTY', match: String.raw`([\d.]+) \* mdTaxable` }, 'Baltimore City local income tax rate for the year')] }),
  manual('tax-ch', 'CH', 'Switzerland: direct federal tax and employee social insurance', 2026, { manualReason: 'ESTV publishes the federal tariffs as PDFs whose layout changes each year; checked by hand', expectedPublication: 'ESTV federal tariffs (cold-progression indexation) in the autumn; AHV / ALV rates in Sep-Oct', figures: [fig('Federal tax steps (single)', 'CHF', { const: 'CH_FED_SINGLE', path: 'steps' }, 'ESTV art. 36 DBG single tariff (thresholds, base tax, rates)'), fig('AHV/IV/EO employee rate', 'rate', { block: 'RULES.CH', match: String.raw`social = ([\d.]+) \* g` }, 'AHV/IV/EO employee share', 'https://www.ahv-iv.ch/'), fig('ALV / NBU salary cap', 'CHF', { block: 'RULES.CH', match: String.raw`min\(g, (\d+)\)` }, 'ALV / UVG maximum insured salary')] }),
  manual('tax-ch-zh', 'CH-ZH', 'Zurich (canton and city) income tax', 2026, { manualReason: 'the Kantonsblatt / ESTV tax booklet is a PDF; checked by hand', expectedPublication: 'Kantonsrat sets the Steuerfuss in December; indexed tariffs in the Kantonsblatt', figures: [schedConst('ZH_GRUND', 'Zurich Grundtarif (single)', 'CHF'), fig('Cantonal and city Steuerfuss', 'rate', { const: 'ZH_STEUERFUSS' }, 'cantonal (95%) and City of Zurich (119%) multipliers', 'https://www.zh.ch/de/steuern-finanzen/steuern.html')], schedules: [{ const: 'ZH_GRUND' }, { const: 'ZH_VERH' }] }),
  manual('tax-ch-ge', 'CH-GE', 'Geneva (canton GE) combined income tax schedule', 2025, { manualReason: 'approximation calibrated to the Geneva tax calculator; no published combined schedule', figures: [schedConst('CH_GE_COMBINED', 'Geneva combined schedule', 'CHF')], schedules: [{ const: 'CH_GE_COMBINED' }] }),
  manual('tax-de', 'DE', 'Germany: §32a EStG tariff, Soli, social insurance caps', 2026, { manualReason: `gesetze-im-internet.de ${RUNNER_403}`, expectedPublication: 'tariff law in Nov-Dec; Sozialversicherungs-Rechengrößen in Oct-Nov', figures: [schedConst('DE_{year}', '§32a tariff zones', 'EUR'), fig('Pension / unemployment contribution ceiling (BBG RV)', 'EUR', { block: 'RULES.DE', match: String.raw`min\(g, (\d+)\)` }, 'Beitragsbemessungsgrenze RV/AV for the year')], schedules: [{ const: 'DE_{year}' }] }),
  manual('tax-nl', 'NL', 'Netherlands box 1 and tax credits', 2026, { expectedPublication: 'Belastingplan (Prinsjesdag, third Tuesday of September); Belastingdienst tables in December', figures: [sched('RULES.NL', 'Box 1 brackets', 'EUR')], schedules: [{ block: 'RULES.NL', match: R_SCHED }] }),
  manual('tax-es', 'ES', 'Spain IRPF state scale, work deductions and social security', 2026, { expectedPublication: 'Presupuestos / BOE (Dec-Jan); social security bases in January', figures: [schedConst('ES_STATE', 'IRPF state scale', 'EUR'), fig('Social security employee rate', 'rate', { block: 'RULES.ES', match: String.raw`social = ([\d.]+) \*` }, 'employee contributions incl. MEI'), fig('Maximum contribution base (annual)', 'EUR', { block: 'RULES.ES', match: String.raw`min\(g, ([\d.]+)\)` }, 'base máxima de cotización x 12')], schedules: [{ const: 'ES_STATE' }] }),
  manual('tax-es-md', 'ES-MD', 'Comunidad de Madrid regional IRPF scale', 2026, { expectedPublication: 'regional budget law (Dec-Jan); Ministerio de Hacienda yearly summary', figures: [schedConst('ES_REGIONAL', 'Madrid regional scale', 'EUR', 'MD')], schedules: [{ const: 'ES_REGIONAL', path: 'MD' }] }),
  manual('tax-es-ct', 'ES-CT', 'Catalonia regional IRPF scale', 2025, { expectedPublication: 'regional budget law (Dec-Jan); Ministerio de Hacienda yearly summary', figures: [schedConst('ES_REGIONAL', 'Catalonia regional scale', 'EUR', 'CT')], schedules: [{ const: 'ES_REGIONAL', path: 'CT' }] }),
  manual('tax-pt', 'PT', 'Portugal IRS scale and solidarity surcharge', 2026, { expectedPublication: 'Orçamento do Estado (October proposal, December law)', figures: [sched('RULES.PT', 'IRS scale', 'EUR')], schedules: [{ block: 'RULES.PT', match: R_SCHED }] }),
  manual('tax-it', 'IT', 'Italy IRPEF, Lombardy surcharge, Milan municipal surcharge, INPS', 2026, { expectedPublication: 'Legge di Bilancio (December)', figures: [sched('RULES.IT', 'IRPEF brackets', 'EUR')], schedules: [{ block: 'RULES.IT', match: R_SCHED }] }),
  manual('tax-at', 'AT', 'Austria Einkommensteuertarif and social insurance', 2026, { manualReason: 'the BMF tariff page returned 404 from the runner (2026-10-10); checked by hand', expectedPublication: 'cold-progression indexation published in the autumn (Progressionsbericht)', figures: [sched('RULES.AT', 'Tariff brackets', 'EUR')], schedules: [{ block: 'RULES.AT', match: R_SCHED }] }),
  manual('tax-be', 'BE', 'Belgium federal rates, allowances and communal surcharge', 2025, { expectedPublication: 'indexed amounts in the Moniteur belge (autumn)', figures: [sched('RULES.BE', 'Federal brackets', 'EUR')], schedules: [{ block: 'RULES.BE', match: R_SCHED }] }),
  manual('tax-se', 'SE', 'Sweden municipal + state tax, job tax credit', 2026, { expectedPublication: 'budget bill in September; Skatteverket belopp och procent in Nov-Dec', figures: [fig('State tax threshold (skiktgräns)', 'SEK', { block: 'RULES.SE', match: String.raw`pos\(taxable - (\d+)\)` }, 'skiktgräns for the year', 'https://www.skatteverket.se/')] }),
  manual('tax-dk', 'DK', 'Denmark AM contribution, bottom / middle / top tax, Copenhagen municipal tax', 2026, { expectedPublication: 'Skatteministeriet indexed amounts in the autumn', figures: [fig('Personal allowance', 'DKK', { block: 'RULES.DK', match: String.raw`allowance = (\d+)` }, 'personfradrag for the year', 'https://skat.dk/')] }),
  manual('tax-fi', 'FI', 'Finland state tax + Helsinki municipal (combined approximation)', 2025, { manualReason: 'approximation (state + municipal as one schedule); checked by hand against vero.fi', expectedPublication: 'budget in Sep-Dec', figures: [sched('RULES.FI', 'Combined schedule', 'EUR')], schedules: [{ block: 'RULES.FI', match: R_SCHED }] }),
  manual('tax-pl', 'PL', 'Poland PIT and ZUS', 2026, { expectedPublication: 'ZUS 30x cap announced in Nov-Dec; PIT thresholds by statute', figures: [sched('RULES.PL', 'PIT scale', 'PLN'), fig('ZUS annual cap (30x)', 'PLN', { block: 'RULES.PL', match: String.raw`min\(g, (\d+)\)` }, 'roczna podstawa wymiaru (30x the forecast average wage)', 'https://www.zus.pl/')], schedules: [{ block: 'RULES.PL', match: R_SCHED }] }),
  manual('tax-cz', 'CZ', 'Czechia PIT and social / health insurance', 2026, { expectedPublication: 'average-wage decree in Sep-Oct sets the 36x threshold and the social cap', figures: [sched('RULES.CZ', 'PIT scale (36x average wage)', 'CZK'), fig('Social insurance cap', 'CZK', { block: 'RULES.CZ', match: String.raw`min\(g, (\d+)\)` }, 'maximální vyměřovací základ for the year', 'https://www.cssz.cz/')], schedules: [{ block: 'RULES.CZ', match: R_SCHED }] }),
  manual('tax-ee', 'EE', 'Estonia income tax and unemployment insurance', 2026, { manualReason: 'the EMTA income-tax pages returned 404 from the runner (2026-10-10); checked by hand', expectedPublication: 'Riigikogu budget in the autumn', figures: [fig('Income tax rate', 'rate', { block: 'RULES.EE', match: String.raw`income: ([\d.]+) \*` }, 'income tax rate for the year', 'https://www.emta.ee/en'), fig('Basic exemption', 'EUR', { block: 'RULES.EE', match: String.raw`social - (\d+)\)` }, 'basic exemption for the year')] }),
  manual('tax-il', 'IL', 'Israel income tax and Bituach Leumi', 2026, { expectedPublication: 'thresholds indexed each January (frozen 2025-2027 by law); Bituach Leumi in January', figures: [sched('RULES.IL', 'Income tax brackets', 'ILS'), fig('Bituach Leumi reduced-rate ceiling (annual)', 'ILS', { block: 'RULES.IL', match: String.raw`min\(g, (\d+)\)` }, 'reduced-rate ceiling x 12', 'https://www.btl.gov.il/')], schedules: [{ block: 'RULES.IL', match: R_SCHED }] }),
  manual('tax-ae', 'AE', 'United Arab Emirates (no personal income tax)', 2026, { expectedPublication: 'review yearly (no personal income tax)' }),
  manual('tax-sa', 'SA', 'Saudi Arabia (no personal income tax on employment income)', 2026, { expectedPublication: 'review yearly (GOSI applies to Saudi nationals only)' }),
  manual('tax-kr', 'KR', 'Korea income tax, local income tax, NPS / NHI / EI', 2026, { expectedPublication: 'tax law amendment in December; NPS cap each July; NHI rate in Aug-Sep', figures: [sched('RULES.KR', 'Income tax brackets', 'KRW'), fig('NPS monthly cap x 12', 'KRW', { block: 'RULES.KR', match: String.raw`min\(g, (\d+)\)` }, 'NPS standard monthly income ceiling x 12 (changes each July)', 'https://www.nps.or.kr/')], schedules: [{ block: 'RULES.KR', match: R_SCHED }] }),
  manual('tax-tw', 'TW', 'Taiwan income tax, exemptions and deductions', 2025, { expectedPublication: 'Ministry of Finance indexed amounts in Nov-Dec', figures: [sched('RULES.TW', 'Income tax brackets', 'TWD')], schedules: [{ block: 'RULES.TW', match: R_SCHED }] }),
  manual('tax-in', 'IN', 'India new tax regime slabs, rebate, surcharge, cess', 2026, { yearStart: '04-01', expectedPublication: 'Union Budget on 1 February for the fiscal year from 1 April', figures: [sched('RULES.IN', 'New-regime slabs', 'INR'), fig('Standard deduction', 'INR', { block: 'RULES.IN', match: String.raw`pos\(g - (\d+)\)` }, 'standard deduction (new regime)', 'https://incometaxindia.gov.in/')], schedules: [{ block: 'RULES.IN', match: R_SCHED }] }),
  manual('tax-au', 'AU', 'Australia resident rates, LITO, Medicare levy', 2026, { yearStart: '07-01', manualReason: `ato.gov.au ${RUNNER_403}`, expectedPublication: 'Federal Budget in May for 1 July; ATO rates page in June-July', figures: [sched('RULES.AU', 'Resident brackets', 'AUD'), fig('Medicare levy', 'rate', { block: 'RULES.AU', match: String.raw`social: ([\d.]+) \* g` }, 'Medicare levy rate', 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents')], schedules: [{ block: 'RULES.AU', match: R_SCHED }] }),
  manual('tax-ca-qc', 'CA-QC', 'Quebec provincial income tax, QPP, QPIP, EI (Quebec rate)', 2025, { manualReason: `revenuquebec.ca ${RUNNER_403}`, expectedPublication: 'Revenu Québec indexation in Nov-Dec; QPP / QPIP rates in the autumn', figures: [sched('CA_PROV.QC', 'Quebec brackets', 'CAD'), fig('QPP base rate', 'rate', { block: 'fn:caPayroll', match: String.raw`qc \? ([\d.]+) : [\d.]+;` }, 'QPP employee contribution rate for the year', 'https://www.retraitequebec.gouv.qc.ca/')], schedules: [{ block: 'CA_PROV.QC', match: R_SCHED }] }),
  manual('tax-mx', 'MX', 'Mexico ISR annual table and IMSS', 2025, { expectedPublication: 'SAT annual tables (Anexo 8 RMF) in Dec-Jan; UMA in January', figures: [sched('RULES.MX', 'ISR annual table', 'MXN')], schedules: [{ block: 'RULES.MX', match: R_SCHED }] }),
  manual('tax-br', 'BR', 'Brazil IRPF monthly table and INSS', 2026, { expectedPublication: 'Receita Federal / INSS portarias in January (minimum wage)', figures: [sched('RULES.BR', 'IRPF monthly table', 'BRL', 1), fig('INSS ceiling (monthly)', 'BRL', { block: 'RULES.BR', match: String.raw`min\(m, ([\d.]+)\)` }, 'teto do INSS for the year')], schedules: [{ block: 'RULES.BR', match: R_SCHED, nth: 1 }] }),
];

/** Every watch entry, in a stable order (detect entries first). */
export const WATCH = Object.freeze([US, US_CA, US_NY, US_LOCAL_NYC, US_MA, US_MN, US_DC, US_UT, US_LOCAL_PORTLAND, GB, GB_SCT, IE, CA, CA_ON, CA_BC, NZ, SG, HK, JP, NO, FR, ...MANUAL]);

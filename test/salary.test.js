import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSalary, annualize, toJobSalary } from '../server/salary.js';

function check(text, min, max, currency = 'USD', interval = 'year') {
  const s = parseSalary(text);
  assert.ok(s, `expected salary in: ${text}`);
  assert.equal(s.min, min, `min for: ${text}`);
  assert.equal(s.max, max, `max for: ${text}`);
  assert.equal(s.currency, currency, `currency for: ${text}`);
  assert.equal(s.interval, interval, `interval for: ${text}`);
  return s;
}

test('em dash range with USD suffix (Greenhouse style)', () => {
  const s = check('Annual Salary: $320,000—$405,000 USD', 320000, 405000);
  assert.equal(s.text, '$320,000—$405,000 USD');
});

test('en dash, hyphen, "to", "and"', () => {
  check('$150,000 – $200,000', 150000, 200000);
  check('$150,000-$200,000', 150000, 200000);
  check('Base pay: $150,000 to $200,000', 150000, 200000);
  check('Pay is between $150k and $200k', 150000, 200000);
});

test('K suffixes and inheritance', () => {
  check('$310K – $385K', 310000, 385000);
  check('$310-385K', 310000, 385000);
  check('salary $90k-$110k', 90000, 110000);
  check('US$ 90k–110k', 90000, 110000);
});

test('currencies', () => {
  check('£95k-£120k', 95000, 120000, 'GBP');
  check('€80.000 - €100.000', 80000, 100000, 'EUR');
  check('80.000 € - 100.000 € brutto', 80000, 100000, 'EUR');
  check('CA$120,000 - CA$150,000', 120000, 150000, 'CAD');
  check('$150,000 - $180,000 CAD', 150000, 180000, 'CAD');
  check('GBP 60,000 - GBP 75,000', 60000, 75000, 'GBP');
  check('EUR 70,000 – 85,000', 70000, 85000, 'EUR');
  check('Salary: 120,000 - 140,000 USD', 120000, 140000, 'USD');
});

test('hourly and monthly', () => {
  check('$60/hr', 60, 60, 'USD', 'hour');
  check('$45 - $60 per hour', 45, 60, 'USD', 'hour');
  check('Hourly: $45 - $60', 45, 60, 'USD', 'hour');
  check('Compensation $30–$40 hourly', 30, 40, 'USD', 'hour');
  check('Monthly salary: €3.500 - €4.500', 3500, 4500, 'EUR', 'month');
  check('$8,000 - $10,000 per month', 8000, 10000, 'USD', 'month');
});

test('decimals', () => {
  check('$150,000.00 - $175,000.00', 150000, 175000);
  check('$60.50/hour', 60.5, 60.5, 'USD', 'hour');
  check('€80.000,00 - €95.000,00', 80000, 95000, 'EUR');
});

test('ignores noise numbers and prefers salary context', () => {
  const text = 'We raised $1B in funding from top investors. We offer 401(k) matching and a $2,000 learning stipend. '
    + 'We have 100,000 customers. The base salary range for this role is $180,000 - $220,000 per year.';
  check(text, 180000, 220000);
  assert.equal(parseSalary('We have 100,000 customers across 40 countries'), null);
  assert.equal(parseSalary('$5M Series A led by investors'), null);
  assert.equal(parseSalary('401(k) matching'), null);
  assert.equal(parseSalary('Founded in 2015, 2,500 employees'), null);
  assert.equal(parseSalary('We raised $300 million'), null);
});

test('chooses the salary range near pay words over other ranges', () => {
  const text = 'Teams of 5-10 engineers manage $10M - $50M budgets. Compensation: $140,000 - $170,000.';
  check(text, 140000, 170000);
});

test('rejects implausible annual values', () => {
  assert.equal(parseSalary('$1,000 - $2,000 per year'), null);
  assert.equal(parseSalary('$6,000,000 - $8,000,000'), null);
  assert.equal(parseSalary('Signing bonus: $5,000'), null);
});

test('no numbers / empty input', () => {
  assert.equal(parseSalary(''), null);
  assert.equal(parseSalary(null), null);
  assert.equal(parseSalary('Competitive salary and benefits'), null);
});

test('single numbers', () => {
  check('Base salary: $150,000', 150000, 150000);
  check('Salary up to £80k', 80000, 80000, 'GBP');
});

test('handles nbsp and html-ish whitespace', () => {
  check('Annual Salary: $200,000 — $250,000 USD', 200000, 250000);
  check('Annual Salary: $200,000&nbsp;-&nbsp;$250,000', 200000, 250000);
});

test('annualize', () => {
  assert.equal(annualize(60, 'hour'), 124800);
  assert.equal(annualize(5000, 'month'), 60000);
  assert.equal(annualize(1000, 'week'), 52000);
  assert.equal(annualize(500, 'day'), 130000);
  assert.equal(annualize(100000, 'year'), 100000);
  assert.equal(annualize(100000), 100000);
  assert.equal(annualize(null, 'year'), null);
});

test('toJobSalary annualizes and adds mid', () => {
  assert.deepEqual(toJobSalary({ min: 300000, max: 405000, currency: 'usd', interval: 'year', text: 'x' }),
    { min: 300000, max: 405000, mid: 352500, currency: 'USD', interval: 'year', text: 'x', kind: 'salary' });
  const h = toJobSalary({ min: 60, max: 75, currency: 'USD', interval: 'hour', text: '$60 – $75' });
  assert.equal(h.min, 124800);
  assert.equal(h.max, 156000);
  assert.equal(h.mid, 140400);
  assert.equal(h.interval, 'year');
  assert.equal(h.originalInterval, 'hour');
  const one = toJobSalary({ min: 150000, max: null, currency: 'USD', interval: 'year' });
  assert.equal(one.max, 150000);
  assert.equal(toJobSalary(null), null);
  assert.equal(toJobSalary({ min: 5, max: 6, interval: 'year' }), null);
});

/* ---------------------------------------------------------------------------
 * Vetting (docs/VETTING.md): real regression cases + one test per bug class
 * found by the 2026-10-02 review (data/vetting/2026-10-02/verdicts.jsonl).
 * ------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveSalary } from '../server/normalize.js';
import { vetSalaries, salaryChecks, statOutliers, robustStats, VET } from '../server/vet.js';
import { payRangeSalary, payRanges } from '../server/sources/greenhouse.js';
import { checkFixtures, scanJob } from '../scripts/vet-salaries.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const loc = (...countries) => countries.map((country) => ({ country }));
const sal = (min, max, extra = {}) => ({ min, max, mid: Math.round((min + max) / 2), currency: 'USD', interval: 'year', text: 'x', ...extra });
const job = (id, title, salary, extra = {}) => ({ id, title, department: 'Eng', employmentType: 'Full-time', salary, locations: [], ...extra });

test('every reviewed real case (test/fixtures/real-salary-cases.json) parses as expected', async () => {
  const r = await checkFixtures();
  assert.ok(!r.missing, 'fixtures file present');
  assert.ok(r.total >= 400, `cases: ${r.total}`);
  assert.deepEqual(r.failures, []);
});

test('prose money is never pay: "$4.6M" in a blog sentence, deal sizes, funding', () => {
  assert.equal(parseSalary('AI agents find $4.6M in blockchain smart contract exploits: Winnie Xiao and Cole Killian'), null);
  assert.equal(parseSalary('A track record of personally shaping and closing $500K to $5M+ deals for public sector accounts'), null);
  assert.equal(parseSalary('Funding for compute (~$15k/month) and other research expenses'), null);
  assert.equal(parseSalary('Compensation: $1.2M OTE'), null, 'million amounts are never pay');
});

test('Fellows: weekly stipend, currency code after the number, location currency', () => {
  const text = 'On our blog: • AI agents find $4.6M in blockchain smart contract exploits\n\nCompensation\n\nThe expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week, with an expectation of 40 hours per week for 4 months.';
  const us = parseSalary(text, { countries: ['GB', 'CA', 'US'] });
  assert.deepEqual([us.min, us.max, us.currency, us.interval, us.kind], [3850, 3850, 'USD', 'week', 'stipend']);
  const uk = parseSalary(text, { countries: ['GB'] });
  assert.deepEqual([uk.min, uk.currency], [2310, 'GBP']);
  const ca = parseSalary(text, { countries: ['CA'] });
  assert.deepEqual([ca.min, ca.currency], [4300, 'CAD']);
  const none = parseSalary(text, { countries: ['DE'] });
  assert.equal(none.currency, 'USD', 'no location match -> USD');
  const j = toJobSalary(us, { source: 'text' });
  assert.deepEqual([j.min, j.max, j.kind, j.source, j.originalInterval], [200200, 200200, 'stipend', 'text', 'week']);
  const bullet = parseSalary('• Weekly stipend of 3,850 USD / 2,310 GBP / 4,300 CAD + benefits (these vary by country)', { countries: ['US'] });
  assert.deepEqual([bullet.min, bullet.interval, bullet.kind], [3850, 'week', 'stipend']);
});

test('benefit stipends and allowances are not pay', () => {
  assert.equal(parseSalary('• Everyone receives a $500 home office stipend to set up your workspace properly.'), null);
  assert.equal(parseSalary('A weekly lunch stipend of $75/£75 or equivalent in your local currency for lunch.'), null);
  assert.equal(parseSalary('• Annual learning & development stipend ($1,500 USD equivalent per year)'), null);
  assert.equal(parseSalary('We offer a $2,000 learning stipend and a $100/month phone allowance.'), null);
  const s = parseSalary('Base salary: $150,000 - $180,000. Everyone receives a $500 home office stipend.');
  assert.deepEqual([s.min, s.max, s.kind], [150000, 180000, 'salary']);
});

test('ranges with the unit on both ends, and redundant k', () => {
  check('COMPENSATION AND BENEFITS: US-based candidates: $35/hour - $45/hour depending on experience.', 35, 45, 'USD', 'hour');
  check('Salary: estimated to be $40/hour to $65/hour.', 40, 65, 'USD', 'hour');
  check('• T2 Starting Hourly Rate: $24.50/hr - $33/hr', 24.5, 33, 'USD', 'hour');
  check('US-based candidates: $32/hour - $52/hour USD depending on factors', 32, 52, 'USD', 'hour');
  check('COMPENSATION AND BENEFITS:\n\n$150,000 - 250,000k Base', 150000, 250000);
});

test('currency codes after the interval and more currencies', () => {
  check('The salary range for this position is estimated to be 110,000 - 200,000/year SGD.', 110000, 200000, 'SGD');
  check('The estimated salary range for this position is estimated to be $8,500 SGD/month.', 8500, 8500, 'SGD', 'month');
  check('at a 30 CAD/hour contract rate', 30, 30, 'CAD', 'hour');
  check('US Salary Range\n\n¥20,454,000 — ¥30,680,000 JPY', 20454000, 30680000, 'JPY');
  assert.equal(toJobSalary({ min: 20454000, max: 30680000, currency: 'JPY', interval: 'year' }).max, 30680000, 'bounds compared in USD');
});

test('intervals come from the amount or its own clause, never the previous sentence', () => {
  check('• Commitment to being in-office 5 days/week\n\nCOMPENSATION AND BENEFITS:\n\n$200,000 - $230,000 USD\n\nBase salary is just one part', 200000, 230000);
  check('• Passionate about building tools users rely on daily.\n\nCOMPENSATION AND BENEFITS:\n\n$180,000 - $440,000 USD', 180000, 440000);
  check('Salary: $129,600–$158,400. per year', 129600, 158400);
});

test('tiered lists are spanned (<= 3x), not truncated to the first tier', () => {
  check('HOURLY RATE\n• T1 Hourly Rate: $22 - $28/hr\n• T2 Hourly Rate: $24 - $33/hr\n• T3 Hourly Rate: $28 - $37/hr\n• Your job level will be tailored', 22, 37, 'USD', 'hour');
  check('US Hourly Range\nProduction Technician/Level 1: $25 - $33/hour Production Technician/Level 2: $28 - $38/hour Production Technician/Level 3: $33 - $43/hour', 25, 43, 'USD', 'hour');
  check('COMPENSATION AND BENEFITS: Level 1: $26 USD hourly Level 2: $28 USD hourly', 26, 28, 'USD', 'hour');
  const wide = parseSalary('Salary: Level 1: $50,000 - $60,000. Level 5: $250,000 - $300,000.');
  assert.ok(wide.max / wide.min <= 3, 'a > 3x span is not merged');
});

test('an implausible stated interval on annual-sized numbers is read as annual', () => {
  const s = parseSalary('US Hourly Range\n\n$68,000 — $90,000 USD\n\nThe salary range for this role is an estimate');
  assert.deepEqual([s.min, s.max, s.interval, s.intervalCorrected, s.statedInterval], [68000, 90000, 'year', true, 'hour']);
  const lever = toJobSalary({ min: 88000, max: 130000, currency: 'USD', interval: 'per-month-salary', text: '88,000–130,000 USD per-month-salary' }, { source: 'structured' });
  assert.deepEqual([lever.min, lever.max, lever.intervalCorrected, lever.statedInterval, lever.originalInterval], [88000, 130000, true, 'month', undefined]);
  // a real monthly salary is left alone
  assert.equal(toJobSalary({ min: 6700, max: 6700, currency: 'USD', interval: 'month' }).max, 80400);
});

test('greenhouse pay_input_ranges: zero-decimal currencies, 3x tier guard, per-range list', () => {
  const jpy = payRangeSalary([{ min_cents: 20454000, max_cents: 30680000, currency_type: 'JPY', title: 'US Salary Range' }]);
  assert.deepEqual([jpy.min, jpy.max, jpy.currency], [20454000, 30680000, 'JPY']);
  assert.equal(jpy.text, 'US Salary Range: 20,454,000–30,680,000 JPY');
  const odd = [
    { min_cents: 16600000, max_cents: 22000000, currency_type: 'USD', title: 'Tier 1' },
    { min_cents: 1260000, max_cents: 16700000, currency_type: 'USD', title: 'Tier 2' },
  ];
  const s = payRangeSalary(odd);
  assert.deepEqual([s.min, s.max], [166000, 220000], 'merge refused (> 3x): first range only');
  assert.equal(payRanges(odd).length, 2);
  assert.equal(payRangeSalary([{ min_cents: 22280000, max_cents: 29000000, currency_type: 'USD', title: 'Annual Salary:' }]).text, 'Annual Salary: 222,800–290,000 USD');
});

test('deriveSalary: structured first, location-currency tier, implausible structured falls back to text', () => {
  const raw = { title: 'Engineer', text: 'Salary: $150,000 - $180,000', salary: { min: 160000, max: 200000, currency: 'USD', interval: 'year', text: '$160K – $200K' } };
  const a = deriveSalary(raw, loc('US'));
  assert.deepEqual([a.min, a.max, a.source], [160000, 200000, 'structured']);
  const b = deriveSalary({ ...raw, salary: null }, loc('US'));
  assert.deepEqual([b.min, b.source, b.kind], [150000, 'text', 'salary']);
  const multi = {
    title: 'Engineer', text: '',
    salary: { min: 250000, max: 535000, currency: 'CAD', interval: 'year', text: 'CA$250K – CA$535K • Multiple Ranges' },
    payRanges: [{ min: 250000, max: 535000, currency: 'CAD', interval: 'year' }, { min: 190000, max: 400000, currency: 'USD', interval: 'year' }],
  };
  const c = deriveSalary(multi, loc('US'));
  assert.deepEqual([c.min, c.max, c.currency, c.ranges.length], [190000, 400000, 'USD', 2]);
  const jpy = deriveSalary({ title: 'Director', employmentType: 'Full-time', text: 'US Salary Range\n¥20,454,000 — ¥30,680,000 JPY', salary: { min: 204540, max: 306800, currency: 'JPY', interval: 'year', text: 'US Salary Range: 204,540–306,800 JPY' } }, loc('JP'));
  assert.deepEqual([jpy.min, jpy.max, jpy.currency, jpy.source], [20454000, 30680000, 'JPY', 'text'], 'structured ÷100 value is implausible; text wins');
  const typo = deriveSalary({ title: 'Engineer', employmentType: 'Full-time', text: 'Salary: $126,000 - $167,000', salary: { min: 12600, max: 167000, currency: 'USD', interval: 'year', text: 'x' } }, loc('US'));
  assert.deepEqual([typo.min, typo.source, typo.structuredRejected], [126000, 'text', ['below_min', 'range_ratio']]);
});

test('vetting gate: Fellows $4.6M and synthetic outliers quarantined, typical salaries untouched', () => {
  const typical = Array.from({ length: 30 }, (_, i) => job(`t${i}`, `Software Engineer ${i}`, sal(150000 + i * 4000, 210000 + i * 5000)));
  const bad = [
    job('fellows', 'Anthropic Fellows Program, AI Safety & Security', sal(4600000, 4600000, { text: '$4.6M' })),
    job('low', 'Senior Software Engineer', sal(12000, 14000)),
    job('ratio', 'Staff Software Engineer', sal(22000, 292000)),
    job('swap', 'Engineer', { ...sal(200000, 150000), min: 200000, max: 150000 }),
    job('intern', 'Software Engineer Intern', sal(400000, 420000)),
    job('vp', 'VP of Engineering', sal(30000, 45000)),
    job('hourly', 'Account Executive', sal(1040000, 1040000, { originalInterval: 'hour' })),
    job('stat', 'Software Engineer, Platform', sal(990000, 1100000)),
  ];
  const out = vetSalaries([...typical, ...bad]);
  const byId = new Map(out.map((j) => [j.id, j]));
  for (const b of bad) {
    const v = byId.get(b.id);
    assert.equal(v.salary, null, `${b.id} quarantined`);
    assert.deepEqual(v.salaryRaw, b.salary);
    assert.ok(v.salaryFlag.codes.length && /^Pay unclear/.test(v.salaryFlag.reason), `${b.id} flag`);
  }
  assert.deepEqual(byId.get('stat').salaryFlag.codes, ['stat_outlier']);
  for (const t of typical) assert.deepEqual(byId.get(t.id), t);
  // idempotent
  assert.deepEqual(vetSalaries(out), out);
});

test('vetting gate: legit low-paid and hourly roles are not statistical outliers', () => {
  const eng = Array.from({ length: 40 }, (_, i) => job(`e${i}`, `Software Engineer ${i}`, sal(250000 + i * 3000, 330000 + i * 3000)));
  const ok = [
    job('ops', 'Corporate Security GSOC Operator', sal(99000, 110000)),
    job('bdr', 'Business Development Representative', sal(68000, 85000)),
    job('annot', 'Data Annotation Specialist', sal(62400, 62400, { originalInterval: 'hour', currency: 'CAD' }), { employmentType: 'Contract' }),
    job('barista', 'Barista', sal(42640, 42640, { originalInterval: 'hour' })),
    job('stipend', 'Anthropic Fellows Program', sal(200200, 200200, { originalInterval: 'week', kind: 'stipend' }), { employmentType: null }),
  ];
  const out = vetSalaries([...eng, ...ok]);
  for (const o of ok) assert.ok(out.find((j) => j.id === o.id).salary, `${o.id} kept`);
  assert.equal(statOutliers([...eng, ...ok]).size, 0);
  const st = robustStats([1, 1, 1, 1]);
  assert.equal(st.sigma, VET.MIN_SIGMA, 'MAD floor');
});

test('salaryChecks: thresholds', () => {
  const codes = (title, s, extra) => salaryChecks(job('x', title, s, extra)).map((c) => c.code);
  assert.deepEqual(codes('Engineer', sal(150000, 200000)), []);
  assert.deepEqual(codes('Engineer', sal(1250000, 1300000)), ['above_max']);
  assert.deepEqual(codes('Engineer', sal(150000, 1300000)), ['above_max', 'range_ratio']);
  assert.deepEqual(codes('Engineer', sal(280000, 850000)), [], '3.04x real range is allowed');
  assert.ok(codes('Technical Fellow', sal(500000, 600000)).length === 0, 'Technical Fellow is senior');
  assert.deepEqual(codes('Engineer', sal(20000, 30000), { employmentType: 'Part-time' }), []);
  assert.deepEqual(codes('Engineer', sal(12000, 30000), { employmentType: 'Part-time' }), [], 'min floor is for full-time roles');
});

test('scan flags the original $4.6M bug with the expected codes', () => {
  const html = '<p>• AI agents find $4.6M in blockchain smart contract exploits: Winnie Xiao</p><p>Compensation</p><p>The expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week.</p>';
  const r = scanJob({ id: 'a:1', title: 'Anthropic Fellows Program', descriptionHtml: html, locations: [{ country: 'GB' }, { country: 'US' }], salary: sal(4600000, 4600000, { text: '$4.6M' }) });
  for (const f of ['max_over_1_2m', 'magnitude_suffix', 'no_pay_context', 'title_junior_high', 'multi_currency']) assert.ok(r.flags.includes(f), f);
  assert.ok(r.critical);
  assert.ok(r.excerpt.length <= 300 && r.excerpt.includes('$4.6M'));
  const missed = scanJob({ id: 'a:2', title: 'X', descriptionHtml: '<p>Salary: $150,000 - $180,000</p>', locations: [], salary: null });
  assert.deepEqual(missed.flags, ['missed_salary']);
});

test('vet.js and salary.js are browser-safe', () => {
  for (const f of ['vet.js', 'salary.js']) {
    const code = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bfrom\s+['"]node:|\bimport\s*\(\s*['"]node:|\brequire\s*\(/.test(code), `${f}: node import`);
    assert.ok(!/(?<![.?\w])(process\.|Buffer\b|__dirname)/.test(code), `${f}: node global`);
  }
});

// False-positive check on the real snapshots (local only: data/snapshots is gitignored).
const SNAP = path.join(ROOT, 'data', 'snapshots');
const VERDICTS = path.join(ROOT, 'data', 'vetting', '2026-10-02', 'verdicts.jsonl');
test('real snapshots: the gate quarantines no salary the reviewer marked correct (except documented policy cases)', { skip: !(fs.existsSync(SNAP) && fs.existsSync(VERDICTS)) && 'no local snapshots' }, async () => {
  const { renormalizeJobs } = await import('../scripts/vet-salaries.js');
  const verdicts = new Map(fs.readFileSync(VERDICTS, 'utf8').trim().split('\n').map((s) => JSON.parse(s)).map((v) => [v.id, v]));
  const POLICY = new Set(['scaleai:4695042005', 'scaleai:4693078005']); // $300/hr part-time contract, any-role $250/hr bound
  const fps = [];
  for (const f of fs.readdirSync(SNAP).filter((x) => x.endsWith('.json'))) {
    const jobs = await renormalizeJobs(JSON.parse(fs.readFileSync(path.join(SNAP, f), 'utf8')).jobs);
    for (const j of jobs) {
      const v = verdicts.get(j.id);
      if (j.salaryFlag && v && v.verdict === 'correct' && !POLICY.has(j.id)) fps.push(`${j.id} ${j.title}: ${j.salaryFlag.reason}`);
    }
  }
  assert.deepEqual(fps, []);
});

/* --------------------------------------------------- scripts/llm-vet.js (mocked fetch) */
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildRequest, headers as llmHeaders, run as llmRun, parseVerdict, VERDICT_SCHEMA, DEFAULT_MODEL, FALLBACK_BETA } from '../scripts/llm-vet.js';

const flagLine = (id, extra = {}) => ({ id, company: 'anthropic', title: 'Anthropic Fellows Program', url: `https://x/${id}`, employmentType: null, countries: ['GB', 'US'], source: 'text',
  parsed: { min: 4600000, max: 4600000, mid: 4600000, currency: 'USD', interval: 'year', text: '$4.6M' }, excerpt: 'AI agents find $4.6M in blockchain smart contract exploits', pay_snippets: ['The expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week'], flags: ['max_over_1_2m'], critical: true, quarantined: false, ...extra });

test('llm-vet request: Messages API shape with structured output and fallbacks', () => {
  const body = buildRequest(flagLine('a:1'));
  assert.equal(body.model, DEFAULT_MODEL);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.deepEqual(body.output_config.format.schema, VERDICT_SCHEMA);
  assert.equal(body.output_config.effort, 'medium');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.messages[0].role, 'user');
  assert.ok(body.messages[0].content.includes('$4.6M') && body.messages[0].content.includes('3,850 USD'));
  assert.ok(!('thinking' in body) && !('temperature' in body), 'no thinking/sampling params (400 on current models)');
  const h = llmHeaders('k');
  assert.deepEqual([h['x-api-key'], h['anthropic-version'], h['anthropic-beta']], ['k', '2023-06-01', FALLBACK_BETA]);
  assert.ok(!('anthropic-beta' in llmHeaders('k', { fallbacks: 'off' })));
  assert.ok(!('fallbacks' in buildRequest(flagLine('a:1'), { fallbacks: 'off' })));
  // every object in the schema is closed (structured-output requirement)
  const walk = (s) => { if (s && typeof s === 'object') { if (s.type === 'object') assert.equal(s.additionalProperties, false); Object.values(s).forEach(walk); } };
  walk(VERDICT_SCHEMA);
});

test('llm-vet run: retries 529, records refusals as errors, appends verdicts, resumes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmvet-'));
  const flagsFile = path.join(dir, 'flags.jsonl');
  const outFile = path.join(dir, 'llm-verdicts.jsonl');
  fs.writeFileSync(flagsFile, [flagLine('a:1'), flagLine('a:2'), flagLine('a:3', { critical: false })].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const calls = [];
  let n = 0;
  const ok = (verdict) => ({ ok: true, status: 200, json: async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 120 },
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(verdict) }] }) });
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const id = JSON.parse(JSON.parse(init.body).messages[0].content.split('\n\n')[1]).id;
    if (id === 'a:1' && n++ === 0) return { ok: false, status: 529, headers: { get: () => '0.001' }, json: async () => ({ error: { type: 'overloaded_error', message: 'busy' } }) };
    if (id === 'a:2') return { ok: true, status: 200, json: async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'refusal', stop_details: { category: null }, content: [] }) };
    return ok({ verdict: 'parser_bug', corrected: { min: 3850, max: 3850, currency: 'USD', interval: 'week' }, kind: 'stipend', evidence: '"base stipend ... 3,850 USD ... per week" — $4.6M is a project result.' });
  };
  const logs = [];
  const r = await llmRun({ flagsFile, outFile, apiKey: 'test-key', env: {}, fetchImpl, concurrency: 1, log: (m) => logs.push(m), sleepImpl: async () => {} });
  assert.deepEqual([r.reviewed, r.errors, r.verdicts.parser_bug], [2, 1, 2]);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'test-key');
  assert.ok(logs.some((m) => /a:2: model declined/.test(m)));
  const out = fs.readFileSync(outFile, 'utf8').trim().split('\n').map((s) => JSON.parse(s));
  assert.deepEqual(out.map((o) => o.id), ['a:1', 'a:3']);
  for (const o of out) {
    for (const k of ['id', 'url', 'company', 'parsed', 'corrected', 'verdict', 'kind', 'evidence', 'reviewer', 'reviewed_at', 'parser_version']) assert.ok(k in o, k);
    assert.equal(o.reviewer, 'claude-sonnet-5-5');
  }
  // resume: only the failed line is retried
  calls.length = 0;
  const r2 = await llmRun({ flagsFile, outFile, apiKey: 'test-key', env: { VET_LLM_MODEL: 'claude-opus-5-5' }, fetchImpl, log: () => {}, sleepImpl: async () => {} });
  assert.deepEqual([r2.reviewed, r2.skipped, calls.length], [0, 2, 1]);
  assert.equal(JSON.parse(calls[0].init.body).model, 'claude-opus-5-5');
  // non-retryable 400 is not retried
  calls.length = 0;
  const bad = async (url, init) => { calls.push(init); return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error: { type: 'invalid_request_error', message: 'nope' } }) }; };
  const r3 = await llmRun({ flagsFile, outFile, apiKey: 'k', env: {}, fetchImpl: bad, log: () => {}, sleepImpl: async () => {} });
  assert.deepEqual([r3.errors, calls.length], [1, 1]);
  assert.throws(() => parseVerdict({ stop_reason: 'max_tokens', content: [] }), /truncated/);
});

test('llm-vet without ANTHROPIC_API_KEY exits 0 with a message', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'llm-vet.js')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ANTHROPIC_API_KEY is not set/);
});

test('llm-vet --skip-reviewed: a job with the same parsed salary is not re-asked', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmvet2-'));
  const flagsFile = path.join(dir, 'flags.jsonl');
  const prior = path.join(dir, 'verdicts.jsonl');
  const changed = flagLine('a:2', { parsed: { min: 200200, max: 200200, mid: 200200, currency: 'USD', interval: 'year', text: '3,850 USD' } });
  fs.writeFileSync(flagsFile, [flagLine('a:1'), changed].map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(prior, [flagLine('a:1'), flagLine('a:2')].map((l) => JSON.stringify({ ...l, verdict: 'parser_bug' })).join('\n') + '\n');
  const asked = [];
  const fetchImpl = async (url, init) => { asked.push(JSON.parse(JSON.parse(init.body).messages[0].content.split('\n\n')[1]).id); return { ok: true, status: 200, json: async () => ({ model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"verdict":"correct","corrected":null,"kind":null,"evidence":"x"}' }] }) }; };
  await llmRun({ flagsFile, outFile: path.join(dir, 'out.jsonl'), apiKey: 'k', env: {}, fetchImpl, skipReviewed: [prior], log: () => {} });
  assert.deepEqual(asked, ['a:2'], 'only the job whose parsed salary changed');
});

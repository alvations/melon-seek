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
    { min: 300000, max: 405000, mid: 352500, currency: 'USD', interval: 'year', text: 'x' });
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

// Pay formats of the big-tech career sites (beta channel), as captured by the
// probe runs on 2026-10-10 (docs/DATA_SOURCES.md §7, docs/process/bigtech-data.md).
// Every sentence below is real posting text. Pay rules:
//   - base pay only: bonus, equity, sign-on, "total" and "cash" compensation never count;
//   - ranges by location: the first or national range (Microsoft: U.S. not SF/NYC);
//   - ranges by level: lowest min to highest max, levels named in the text;
//   - no range: salary null. Prose money is never pay (the $4.6M bug).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSalary, toJobSalary } from '../server/salary.js';
import { vetSalaries } from '../server/vet.js';

const US = { countries: ['US'] };
const got = (s) => (s ? [s.min, s.max, s.currency, s.interval] : null);

test('Microsoft: the national U.S. range wins over the SF Bay / NYC range (U.S. abbreviation keeps the clause)', () => {
  const t = 'Software Engineering IC2 - The typical base pay range for this role across the U.S. is USD $85,400 - $168,100 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $111,100 - $183,700 per year. \nCertain roles may be eligible for benefits and other compensation. Find additional benefits and pay information here: https://careers.microsoft.com/us/en/us-corporate-pay';
  const s = parseSalary(t, US);
  assert.deepEqual(got(s), [85400, 168100, 'USD', 'year']);
  assert.equal(s.zones, 2);
  assert.equal(s.kind, 'salary');
  // Hourly roles.
  const h = parseSalary('Administration IC3 - The typical base pay range for this role across the U.S. is USD $31.49 - $51.97 per hour. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $39.42 - $56.97 per hour.', US);
  assert.deepEqual(got(h), [31.49, 51.97, 'USD', 'hour']);
  assert.equal(h.kind, 'hourly');
  // Other countries state one national range in local currency.
  const de = parseSalary('Government Affairs IC5 - The typical base pay range for this role across Germany is € 130,200.00 - € 222,000.00 per year. Certain roles may be eligible for benefits and other compensation.', { countries: ['DE'] });
  assert.deepEqual(got(de), [130200, 222000, 'EUR', 'year']);
});

test('Microsoft: several levels -> lowest national min to highest national max, levels named', () => {
  const t = 'Technical Program Management IC5 - The typical base pay range for this role across the U.S. is USD $142,800 - $274,800 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $188,600 - $304,200 per year.\n\nTechnical Program Management IC6 - The typical base pay range for this role across the U.S. is USD $163,000 - $331,200 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $220,800 - $331,200 per year.';
  const s = parseSalary(t, US);
  assert.deepEqual(got(s), [142800, 331200, 'USD', 'year'], 'the SF/NYC 188,600 floor is not used');
  assert.match(s.text, /IC5: USD \$142,800 - \$274,800 per year; Technical Program Management IC6: USD \$163,000 - \$331,200/);
  assert.equal(s.zones, 4);
});

test('Microsoft: one level priced per country -> the job country\'s range only, never a cross-country span', () => {
  const t = 'Field Product Marketing IC5 - The typical base pay range for this role across Ireland is € 80,000.00 - € 151,700.00 per year.\nField Product Marketing IC5 - The typical base pay range for this role across Germany is € 102,100.00 - € 176,200.00 per year.\nField Product Marketing IC5 - The typical base pay range for this role across Portugal is € 59,000.00 - € 122,500.00 per year.\nField Product Marketing IC5 - The typical base pay range for this role across United Kingdom is £ 79,700.00 - £ 133,900.00 per year.';
  assert.deepEqual(got(parseSalary(t, { countries: ['IE'] })), [80000, 151700, 'EUR', 'year']);
  assert.deepEqual(got(parseSalary(t, { countries: ['DE'] })), [102100, 176200, 'EUR', 'year']);
  assert.deepEqual(got(parseSalary(t, { countries: ['PT'] })), [59000, 122500, 'EUR', 'year']);
  assert.deepEqual(got(parseSalary(t, { countries: ['GB'] })), [79700, 133900, 'GBP', 'year']);
  assert.deepEqual(got(parseSalary(t, { countries: [] })), [80000, 151700, 'EUR', 'year'], 'unknown location: the first stated');
  const cz = parseSalary('Software Engineering IC4 - The typical base pay range for this role across Czechia is Kč 1,338,000.00 - Kč 2,448,000.00 per year.', { countries: ['CZ'] });
  assert.deepEqual(got(cz), [1338000, 2448000, 'CZK', 'year']);
  const intern = parseSalary('The base pay range for this internship is USD $6,810 - $13,480 per month. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $8,050 - $14,580 per month.', US);
  assert.deepEqual(got(intern), [6810, 13480, 'USD', 'month']);
});

test('NVIDIA: one range, or levels spanned with the level labels kept', () => {
  const one = parseSalary('Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. The base salary range is 272,000 USD - 431,250 USD.\nYou will also be eligible for equity and benefits.', US);
  assert.deepEqual(got(one), [272000, 431250, 'USD', 'year']);
  const lv = parseSalary('Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. The base salary range is 168,000 USD - 264,500 USD for Level 4, and 196,000 USD - 310,500 USD for Level 5.\nYou will also be eligible for equity and benefits.', US);
  assert.deepEqual(got(lv), [168000, 310500, 'USD', 'year']);
  assert.equal(lv.text, '168,000 USD - 264,500 USD for Level 4, and 196,000 USD - 310,500 USD for Level 5');
  assert.equal(lv.zones, 2);
  const intern = parseSalary('Hourly rates are a standard pay based on the position, your location, year in school, degree, and experience. The hourly rate for our interns is 20 USD - 71 USD.', US);
  assert.deepEqual(got(intern), [20, 71, 'USD', 'hour']);
});

test('NVIDIA sales: a "cash compensation range" (85% base + 15% variable) is not base pay -> null', () => {
  const t = 'Your base salary will be determined based on your location, experience, and the pay of employees in similar positions with 85% paid through base salary and 15% variable compensation. For Poland: The cash compensation range is 435,000 PLN - 754,000 PLN for Level 4, and 547,500 PLN - 949,000 PLN for Level 5.';
  assert.equal(parseSalary(t, { countries: ['PL'] }), null);
});

test('Apple: "between $X and $Y" annual and hourly; a footer without a range is null', () => {
  const a = parseSalary('At Apple, base pay is one part of our total compensation package and is determined within a range. This provides the opportunity to progress as you grow and develop within a role. The base pay range for this role is between $150,400 and $277,600, and your base pay will depend on your skills, qualifications, experience, and location.\n\nApple employees also have the opportunity to become an Apple shareholder through participation in Apple’s discretionary employee stock programs.', US);
  assert.deepEqual(got(a), [150400, 277600, 'USD', 'year']);
  const h = parseSalary('The base pay range for this role is between $34.31 and $73.20/hr, and your base pay will depend on your skills, qualifications, experience, and location.', US);
  assert.deepEqual(got(h), [34.31, 73.2, 'USD', 'hour']);
  assert.equal(parseSalary('At Apple, base pay is one part of our total compensation package and is determined within a range. This provides the opportunity to progress as you grow and develop within a role. Your base pay will depend on your skills, qualifications, experience, and location.', US), null);
});

test('Netflix: "The range for this role is" is a posted range; the area-wide "market range" is not', () => {
  const t = 'Generally, our compensation structure consists solely of an annual salary; we do not have bonuses. You choose each year how much of your compensation you want in salary versus stock options. To determine your personal top of market compensation, we rely on market indicators and consider your specific job family, background, skills, and experience to determine your compensation in the market range. The range for this role is $210,000.00 - $360,000.00.\nNetflix provides comprehensive benefits including Health Plans, Mental Health support, a 401(k) Retirement Plan with employer match, Stock Option Program.';
  assert.deepEqual(got(parseSalary(t, US)), [210000, 360000, 'USD', 'year']);
  const hourly = parseSalary('The range for this role is $46.15 - $72.12.', US);
  assert.deepEqual(got(hourly), [46.15, 72.12, 'USD', 'hour']);
  // Sales roles: a band for "roles in this area", partly variable -> not this role's base pay.
  assert.equal(parseSalary('The overall market range for roles in this area of Netflix is typically $230,000.00 - $325,000.00. A portion of this compensation is variable. Netflix provides comprehensive benefits including Health Plans.', US), null);
});

test('Google: national base range sentence and the "US: … (USD) + N% bonus target + equity" line; total comp never', () => {
  const g = parseSalary('The US base salary range for this full-time position is $141,000-$202,000 + bonus + equity + benefits. Our salary ranges are determined by role, level, and location.', US);
  assert.deepEqual(got(g), [141000, 202000, 'USD', 'year']);
  const line = parseSalary('Individual pay is determined by factors including job-related skills, experience, and relevant education or training.\n\nUS: $300000 - $333000 (USD) + 25% bonus target + equity + benefits\n\nLearn more about benefits at Google.', US);
  assert.deepEqual(got(line), [300000, 333000, 'USD', 'year']);
  const dm = parseSalary('• Base Salary Range: $350,000 – $525,000\n• Total Compensation Range: $550,000 – $1,100,000 (includes additional sign-on bonus and 15% target annual bonus).', US);
  assert.deepEqual(got(dm), [350000, 525000, 'USD', 'year'], 'base, not total compensation');
  assert.equal(parseSalary('Total Compensation Range: $550,000 – $1,100,000 (includes additional sign-on bonus and 15% target annual bonus).', US), null);
});

test('Amazon: the national lowest-to-highest market sentence', () => {
  const s = parseSalary('Our compensation reflects the cost of labor across several US geographic markets. The base pay for this position ranges from $129,300/year in our lowest geographic market up to $223,600/year in our highest geographic market. Pay is based on a number of factors including market location. Amazon is a total compensation company. Dependent on the position offered, equity, sign-on payments, and other forms of compensation may be provided.', US);
  assert.deepEqual(got(s), [129300, 223600, 'USD', 'year']);
});

test('Meta: "$X/year to $Y/year + bonus + equity + benefits" reads as base pay', () => {
  assert.deepEqual(got(parseSalary('$173,000/year to $245,000/year + bonus + equity + benefits', US)), [173000, 245000, 'USD', 'year']);
  assert.deepEqual(got(parseSalary('$56.25/hour to $78.37/hour + bonus + equity + benefits', US)), [56.25, 78.37, 'USD', 'hour']);
});

test('prose money in big-tech descriptions is never pay (the $4.6M class)', () => {
  const prose = [
    'AWS customers saved more than $4.6M last year by moving to Graviton.',
    'NVIDIA has been transforming computer graphics; our data center business crossed $100 billion in revenue.',
    'Amazon Leo is launching satellite-based connectivity in 100+ countries with a $10B investment.',
    'Netflix provides comprehensive benefits including a 401(k) Retirement Plan with employer match and a $5,000 learning stipend.',
    'The team manages a $250,000 - $400,000 annual marketing budget across regions.',
    'You will own deals of $150,000 - $500,000 in annual recurring revenue.',
    'Apple employees are eligible for discretionary restricted stock unit awards worth up to $50,000.',
    'Your Amazon package will include sign-on payments of $20,000 - $40,000 and restricted stock units (RSUs).',
  ];
  for (const t of prose) assert.equal(parseSalary(t, US), null, t);
});

test('big-tech ranges pass the vetting gate; implausible ones are still quarantined', () => {
  const job = (title, s) => ({ id: `x:${title}`, company: 'x', title, employmentType: 'Full-time', department: null, salary: toJobSalary(s, { source: 'text' }) });
  const jobs = [
    job('Software Engineer', { min: 85400, max: 168100, currency: 'USD', interval: 'year' }),
    job('Principal TPM', { min: 142800, max: 331200, currency: 'USD', interval: 'year' }),
    job('Software Engineer (L6)', { min: 499000, max: 900000, currency: 'USD', interval: 'year' }), // Netflix, real
    job('Research Intern', { min: 20, max: 71, currency: 'USD', interval: 'hour', kind: 'hourly' }),
    job('Bad parse', { min: 4600000, max: 4600000, currency: 'USD', interval: 'year' }),
  ];
  const vetted = vetSalaries(jobs, { stats: false });
  assert.deepEqual(vetted.map((j) => !!j.salary), [true, true, true, true, false]);
  assert.deepEqual(vetted[4].salaryFlag.codes, ['above_max'], 'kept below $5M by toJobSalary so the gate quarantines it visibly');
  assert.equal(toJobSalary({ min: 6e6, max: 6e6, currency: 'USD', interval: 'year' }), null, 'refused outright above $5M');
});

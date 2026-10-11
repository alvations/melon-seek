// Methodology and sources review of the beta site (docs/process/methodology-review-beta.md).
// Findings MR-1 to MR-22, on the lead's build of 8259b1b with the 2026-10-11 crawl (every board
// observed 2026-10-11 between 06:38 and 08:00 UTC). Each test encodes a missing registry entry, a
// stale as-of date, a number shown without its source, or a line of docs that no longer matches the
// code. They run as to-dos (the project's convention, test/beta-data-check-2.test.js): a failing
// to-do is reported but does not turn CI red. The fix that makes one pass removes `todo` from it.
// Every test reads only the repo (code, docs, data/freshness.json); none needs the crawl data.
// Owner of this file: the methodology-review-beta agent. Product code is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as juice from '../server/juice.js';
import { listCompanies, COMPANIES } from '../server/companies.js';
import { FX_PER_USD as PALETTE_FX, juiceNetForScore } from '../public/viz/palette.js';
import { FAMILY_LABELS } from '../public/features/roles.js';
import { ECB_CURRENCIES } from '../scripts/refresh/fx.js';
import { netForShownScore } from '../scripts/refresh/examples.js';
import { staleness } from '../scripts/refresh/lib.js';
import { fitSnapshot } from '../scripts/snapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const REG = JSON.parse(read('data/freshness.json'));
const entryOf = (id) => REG.entries.find((e) => e.id === id);
const REG_TEXT = JSON.stringify(REG);
const REVIEW_DAY = new Date('2026-10-11T12:00:00Z'); // the day of the review and of the crawl
const todo = (id) => ({ todo: `${id}: docs/process/methodology-review-beta.md` });

/* ----------------------------------------------------------- MR-1 (High) */
// 16 Romania-only postings (Microsoft 12, Google 4) post their pay in lei ("Technical Support
// Engineering IC1 - The typical base pay range for this role across Romania is lei 90,500.00 -
// lei 135,700.00 per year", microsoft:1970393556864608), and the drawer says "Salary not listed —
// this posting doesn't include a pay range." The parser reads lei (server/salary.js:147) but drops
// it because no table has a RON rate (server/salary.js:735); the ECB, which the monthly FX refresh
// reads, publishes RON.
test('MR-1 RON: the monthly FX refresh asks the ECB for the Romanian leu', () => {
  assert.ok(ECB_CURRENCIES.includes('RON'), `scripts/refresh/fx.js ECB_CURRENCIES has no RON: ${ECB_CURRENCIES.join(',')}`);
});
test('MR-1 RON: the shared FX table (chart, Juice, comps) has a Romanian leu rate', () => {
  assert.ok(PALETTE_FX.RON > 0, 'public/viz/palette.js FX_PER_USD has no RON, so lei pay is shown as "Salary not listed"');
  assert.ok(juice.FX_PER_USD && juice.FX_PER_USD.RON > 0, 'server/juice.js FX_PER_USD has no RON');
  assert.match(JSON.stringify(entryOf('fx-per-usd')), /RON/, 'registry fx-per-usd does not list RON');
});
test('MR-1 RON: until a rate exists, the drawer says pay is posted in a currency it cannot convert, not "Salary not listed"', todo('MR-1'), () => {
  const app = read('public/app.js');
  assert.ok(/can[’']t convert|cannot convert|no exchange rate/i.test(app),
    'public/app.js has no wording for pay posted in an unconvertible currency');
});

/* ----------------------------------------------------------- MR-2 (High) */
// Pay converted to US dollars is shown with no exchange-rate date or source next to it: the
// drawer's "≈ $101K–103K in approx US dollars for comparison" (the date is only in the Juice
// block, which is absent when there is no Juice), the chart footnote "417 converted from another
// currency" (the date only in a hover title, unreachable by tap), the Market insights header
// "pay in approx. USD · postings as of 11 Oct 2026", and the map's Pay pins.
function lineWith(file, needle) {
  const lines = read(file).split('\n');
  const i = lines.findIndex((l) => l.includes(needle));
  assert.ok(i >= 0, `${file}: no line with "${needle}" (the code moved; update this test)`);
  return { at: `${file}:${i + 1}`, text: lines[i] };
}
const NAMES_FX_DATE = /fx-per-usd|FX_AS_OF|fxAsOf|exchange rates? (?:as of|from)|rates as of/;
test('MR-2 drawer: the "approx US dollars" line names the exchange-rate date', todo('MR-2'), () => {
  const { at, text } = lineWith('public/app.js', 'in approx US dollars for comparison');
  assert.match(text, NAMES_FX_DATE, `${at} prints the converted range without the rate's date`);
});
test('MR-2 chart: the footnote text (not only its hover title) gives the exchange-rate date', todo('MR-2'), () => {
  const { at, text } = lineWith('public/viz/chart.js', 'converted from another currency');
  assert.match(text, NAMES_FX_DATE, `${at}: the date is only in foot.title, which a phone cannot show`);
});
test('MR-2 Market insights: the header that says "pay in approx. USD" gives the exchange-rate date', todo('MR-2'), () => {
  const { at, text } = lineWith('public/features/insights.js', 'on this board · pay in approx. USD');
  assert.match(text, NAMES_FX_DATE, `${at} names the postings date but not the exchange rates'`);
});

/* --------------------------------------------------------- MR-3 (Medium) */
// The only methodology link in the whole app is the Juice disclaimer (public/app.js JUICE_DOC).
// The pay block, "Pay by level", the part-time and fixed-term captions, Compstimate, "Same role
// elsewhere", Market insights, Compare companies and the data badge link to no explanation, and
// the methodology pages explain Juice only.
test('MR-3 the app links to an explanation of pay, levels and estimates, not only of Juice', todo('MR-3'), () => {
  const files = ['public/app.js', 'public/features/compstimate.js', 'public/features/comps.js', 'public/features/insights.js'];
  const links = files.flatMap((f) => [...read(f).matchAll(/['"`](?:\.\.\/)?methodology\/[^'"`]*['"`]/g)].map((m) => `${f}: ${m[0]}`));
  assert.ok(links.length >= 2, `only ${links.length} methodology link(s): ${links.join('; ')}`);
});
test('MR-3 the methodology guide has a section on posted pay (ranges, levels, part-time, fixed-term, estimates)', todo('MR-3'), () => {
  const guide = read('docs/METHODOLOGY_GUIDE.md');
  assert.match(guide, /^#{2,3} .*\bposted pay\b/im, 'docs/METHODOLOGY_GUIDE.md has no heading about how posted pay is read');
  assert.match(guide, /Compstimate|pay estimate/i, 'the guide never explains the pay estimate ("Typically within ±12%")');
});

/* --------------------------------------------------------- MR-4 (Medium) */
// Exchange rates are as of 2026-07-01 on a monthly cadence (registry: STALE, 57 days past due);
// the guide says "Exchange rates are fetched automatically", and the first scheduled refresh is
// 2026-11-03. Every converted pay figure and every non-US Juice uses them.
test('MR-4 exchange rates are within their monthly cadence on the review day', todo('MR-4'), () => {
  const s = staleness(entryOf('fx-per-usd'), REVIEW_DAY);
  assert.ok(s.dueInDays >= 0, `fx-per-usd as of ${entryOf('fx-per-usd').asOf} is ${-s.dueInDays} days past due`);
});

/* --------------------------------------------------------- MR-5 (Medium) */
// Constants added since the freshness review (a9b5e7b, 2026-10-10) that decide numbers the beta
// site shows, with no registry entry naming them. The names are looked up in the code, so a test
// fails loudly (not silently) when a constant is renamed.
const MISSING = [
  // [file, constant, what it decides on screen]
  ['server/keywords.js', 'GENERIC_RUNG', 'level of a numbered title ("Engineer III")'],
  ['server/keywords.js', 'GOOGLE_RUNG', 'Google numeral ladder'],
  ['server/keywords.js', 'L_LADDER', 'L-level ladder (Netflix L5)'],
  ['server/keywords.js', 'MICROSOFT_IC', 'Microsoft IC level to Entry/Mid/Senior/Staff+'],
  ['server/keywords.js', 'MICROSOFT_M', 'Microsoft M level to Manager/Director+'],
  ['server/keywords.js', 'NVIDIA_LEVEL', 'NVIDIA "Level N" to a seniority'],
  ['server/salary.js', 'PAY_AREAS', 'Microsoft SF Bay Area (75 km) / NYC (60 km) range'],
  ['scripts/build-market.js', 'COUNTRY_MIN_N', 'comps cells outside the home country (10 roles)'],
  ['public/features/insights.js', 'MIN_SAMPLE', '"Skills need 5+ roles with pay"'],
  ['public/features/insights.js', 'TIE_SHARE', '"2 skills left out: most of their roles post the same range"'],
  ['server/sources/incremental.js', 'DETAIL_REFRESH_DAYS', 'how old a posting\'s details can be (2-4 days)'],
  ['server/sources/incremental.js', 'CLOSE_PROBE_LIMIT', 'closure probes per board per run (50)'],
  ['server/history.js', 'UNSEEN_OPEN_DAYS', 'a posting missing from a partial list stays open 14 days'],
  ['scripts/snapshot.js', 'CAP_RULE', 'which 5,000 Amazon postings are kept'],
  ['server/sources/meta.js', 'MAX_FAILED_IN_A_ROW', 'Meta crawl stop rule'],
  ['server/sources/meta.js', 'MAX_FAILED_SHARE', 'Meta crawl failure rule'],
  ['public/features/roles.js', 'LEVEL_NOT_STATED', '"Level not stated"'],
];
for (const [file, name, what] of MISSING) {
  test(`MR-5 registry names ${name} (${file}; ${what})`, todo('MR-5'), () => {
    const src = read(file);
    const i = src.split('\n').findIndex((l) => new RegExp(`\\bconst ${name}\\b`).test(l));
    assert.ok(i >= 0, `${file}: const ${name} not found (renamed? update this list)`);
    assert.ok(new RegExp(`\\b${name}\\b`).test(REG_TEXT), `${file}:${i + 1} ${name} has no data/freshness.json entry`);
  });
}
test('MR-5 registry names the Amazon 5,000-posting budget (server/companies.js maxPostings)', todo('MR-5'), () => {
  const amazon = COMPANIES.find((c) => c.slug === 'amazon');
  assert.equal(amazon && amazon.maxPostings, 5000, 'server/companies.js: Amazon maxPostings is no longer 5000 (update this test)');
  assert.match(REG_TEXT, /maxPostings/, 'no registry entry names maxPostings, the budget the page states as "5,000 roles · of 22,415 posted"');
});

/* --------------------------------------------------------- MR-6 (Medium) */
// job-postings and company-registry describe the stable boards of 2026-10-02 and "7 beta"; the
// beta boards' counts, their 6-hourly cadence and Amazon's budget are not recorded.
test('MR-6 job-postings: the registry records every beta board it serves, not only the stable 5,413', todo('MR-6'), () => {
  const e = entryOf('job-postings');
  const beta = listCompanies({ channel: 'beta' }).filter((c) => !listCompanies().some((s) => s.slug === c.slug)).map((c) => c.slug);
  const missing = beta.filter((slug) => !new RegExp(`\\b${slug}\\b`, 'i').test(String(e.values)));
  assert.deepEqual(missing, [], `job-postings values (${String(e.values).slice(0, 80)}…) miss ${missing.join(', ')}`);
  assert.ok(e.asOf >= '2026-10-11', `job-postings asOf ${e.asOf} predates the beta crawl it covers`);
});
test('MR-6 company-registry: values match server/companies.js (beta boards, the resumed Amazon and Meta, the budget)', todo('MR-6'), () => {
  const v = String(entryOf('company-registry').values);
  assert.match(v, /5,?000/, 'company-registry values do not mention Amazon\'s 5,000-posting budget');
  assert.match(v, /resum|first crawl/i, 'company-registry values do not say Amazon and Meta were resumed on 2026-10-11');
});

/* --------------------------------------------------------- MR-7 (Medium) */
test('MR-7 role-families: the registry\'s family count equals FAMILY_LABELS', todo('MR-7'), () => {
  const n = Object.keys(FAMILY_LABELS).length;
  const v = String(entryOf('role-families').values);
  assert.match(v, new RegExp(`\\b${n} families`), `registry says "${v.match(/\d+ families/)?.[0]}", the code has ${n} (BP-4 added chip and dc-tech)`);
});
test('MR-7 seniority-ladder: the registry says unlevelled titles read "Level not stated" (fix wave 3, BP-7)', todo('MR-7'), () => {
  const e = entryOf('seniority-ladder');
  assert.match(`${e.values} ${e.notes}`, /Level not stated/, 'seniority-ladder still describes "Mid" as what an unlevelled title shows');
});

/* --------------------------------------------------------- MR-8 (Medium) */
// The guide says "Every amount is for a full year" and "Pay quoted by the hour or the month is
// turned into a yearly figure"; the beta drawer shows internships per month and for the whole
// term ("Juice covers only that term"), and part-time hourly pay on the stated hours or not at all.
test('MR-8 the methodology guide explains fixed-term and part-time pay', todo('MR-8'), () => {
  const g = read('docs/METHODOLOGY_GUIDE.md');
  assert.match(g, /part-time/i, 'docs/METHODOLOGY_GUIDE.md never mentions part-time pay');
  assert.match(g, /internship|fixed-term/i, 'docs/METHODOLOGY_GUIDE.md never mentions internships or fixed-term pay');
});
test('MR-8 the technical reference documents salary.termWeeks (Juice for the term only)', todo('MR-8'), () => {
  assert.match(read('docs/LIVABILITY.md'), /termWeeks/, 'docs/LIVABILITY.md attachJuice rules have no fixed-term rule');
});
test('MR-8 the guide says a range posted for several places or levels is spanned', todo('MR-8'), () => {
  assert.match(read('docs/METHODOLOGY_GUIDE.md'), /several (?:places|locations|levels)|across levels|lowest .* highest/i,
    'the guide says gross pay is "the middle of the job\'s posted base-pay range"; for Apple requisitions and NVIDIA/Microsoft levels it is the middle of a span');
});

/* --------------------------------------------------------- MR-9 (Medium) */
// The list header, card and drawer tooltips say "Juicy: $96K or more a year · Ripe: $48K–96K";
// the methodology page says Ripe starts at $47,103 and Juicy at $94,996 (the rounded score).
test('MR-9 the app\'s grade cut-offs in dollars equal the methodology page\'s', todo('MR-9'), () => {
  const k = (x) => Math.round(x / 1000);
  for (const min of [45, 70]) {
    assert.equal(k(juiceNetForScore(min)), k(netForShownScore(juice, min)),
      `score ${min}: app tooltip $${k(juiceNetForScore(min))}K vs methodology $${netForShownScore(juice, min).toLocaleString()}`);
  }
});

/* -------------------------------------------------------- MR-14 (Medium) */
// Amazon's budget keeps postings with pay first: 14,123 of 22,415 have pay, so all 5,000 kept do,
// and the page's "X% show pay" and Insights' "Pay published" would read 100% (the board: 63%).
// The capped record carries no whole-board pay count the UI could show instead.
test('MR-14 a budgeted board records how many of the whole board post pay', todo('MR-14'), () => {
  const jobs = Array.from({ length: 2000 }, (_, i) => ({ id: `a:${i}`, postedAt: `2026-10-${String(1 + (i % 10)).padStart(2, '0')}`, salary: i % 100 < 63 ? { min: 1, max: 2 } : null }));
  const out = fitSnapshot(jobs, (list, n, capped) => ({ jobs: list, capped }), 1e12, { maxPostings: 450 });
  const kept = out.jobs.filter((j) => j.salary).length / out.jobs.length;
  assert.equal(kept, 1, 'precondition: the budget keeps salaried postings first');
  const c = out.capped || {};
  const whole = c.salaried ?? c.withPay ?? c.salariedTotal ?? null;
  assert.equal(whole, 1260, `jobsCapped ${JSON.stringify(c)} has no whole-board pay count, so the page would say 100% show pay`);
});

/* -------------------------------------------------------- MR-15 (Medium) */
test('MR-15 README: the beta list says Amazon and Meta appear after their first crawl', todo('MR-15'), () => {
  const r = read('README.md');
  const i = r.indexOf('### Beta site');
  const sec = r.slice(i, r.indexOf('\n### ', i + 5));
  assert.match(sec, /first crawl|resumed/i, 'README "Beta site" lists Meta and Amazon as present; neither is in the 2026-10-11 build');
  assert.doesNotMatch(sec, /methodology page all cover the beta companies/, 'README says the methodology page covers the beta companies; it explains Juice only');
  assert.doesNotMatch(sec, /there's no JavaScript and no new control/, 'README: app.js gives the Beta tag its link (D-27/D-28)');
});
test('MR-15 README and PLAYBOOK: Apple\'s crawl time matches the measured run (89 min, 2026-10-11)', todo('MR-15'), () => {
  assert.doesNotMatch(read('README.md'), /Apple alone takes about 2 hours/, 'README still says about 2 hours for about 6,100 postings');
  assert.doesNotMatch(read('docs/process/PLAYBOOK.md'), /Apple's full crawl takes about 2 h 10 min/, 'PLAYBOOK still says 2 h 10 min');
});

/* -------------------------------------------------------- MR-16 (Medium) */
test('MR-16 AMAZON_META.md: the brief does not contradict the Decision (paused, 8,485 kept)', todo('MR-16'), () => {
  const a = read('docs/AMAZON_META.md');
  const body = a.slice(0, a.indexOf('## Decision'));
  assert.ok(!/8,485/.test(body) || /superseded|before the decision/i.test(body), 'the brief says 8,485 postings are kept; the Decision and server/companies.js keep 5,000');
});

/* ---------------------------------------------------------- Low findings */
test('MR-19 LIVABILITY.md: "Currencies the palette lacks" lists only currencies the palette lacks', todo('MR-19'), () => {
  const m = read('docs/LIVABILITY.md').match(/Currencies the palette lacks \(([^)]*)\)/);
  if (!m) return; // the sentence was rewritten (the guide patch): nothing stale left to list
  const listed = m[1].split(/[,\s.]+/).filter((c) => /^[A-Z]{3}$/.test(c));
  const present = listed.filter((c) => c in PALETTE_FX);
  assert.deepEqual(present, [], `palette.js has ${present.join(', ')}`);
});
test('MR-20 DATA_SOURCES §7: the beta snapshot path is data/beta/snapshots', todo('MR-20'), () => {
  const d = read('docs/DATA_SOURCES.md');
  assert.doesNotMatch(d, /--channel beta`\s+writes\s+`data\/snapshots\/<slug>\.json`/, 'DATA_SOURCES §7 says the beta crawl writes data/snapshots/<slug>.json');
});
test('MR-21 registry.js: the usage header lists every mode (--docs)', todo('MR-21'), () => {
  const head = read('scripts/refresh/registry.js').split('\n').slice(0, 20).join('\n');
  assert.match(head, /--docs/, 'scripts/refresh/registry.js runs --docs but its header does not list it');
});
test('MR-22 market.json fx.source names the rate source, not a code path', todo('MR-22'), () => {
  const src = read('scripts/build-market.js');
  assert.doesNotMatch(src, /source:\s*['"]public\/viz\/palette\.js FX_PER_USD['"]/, 'beta/api/market.json says fx.source "public/viz/palette.js FX_PER_USD"');
});

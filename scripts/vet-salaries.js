#!/usr/bin/env node
// Deterministic salary anomaly scan over normalized job snapshots.
//
//   node scripts/vet-salaries.js [files...]        default: data/snapshots/*.json
//     --date YYYY-MM-DD   output folder data/vetting/<date>/ (default: today, UTC)
//     --out <file>        flags file (default <dir>/flags.jsonl, or
//                         <dir>/flags.renormalized.jsonl with --renormalize)
//     (default)           the jobs as the build serves them (DQ-43, fix wave 5:
//                         loadServedJobs = scripts/build-static.js#readSnapshot:
//                         an older snapshot is re-derived with relocateJobs, the
//                         big-tech adapter fixes are applied, then the vetting
//                         gate), so "blocking" means "would be published"
//     --no-gate           scan the snapshot salaries as stored (raw view)
//     --renormalize       re-derive every salary from descriptionHtml (+ the
//                         structured salary the snapshot kept) with the current
//                         parser and run the vetting gate before scanning
//     --write             with --renormalize: rewrite the snapshot files in place
//     --sample N          also write <dir>/sample.jsonl: N unflagged salaried jobs
//     --seed S            per company (all if fewer), seeded shuffle (default 20261002)
//     --summary <file>    append a Markdown report (e.g. "$GITHUB_STEP_SUMMARY")
//     --no-write-flags    scan only (print counts, write nothing)
//     --no-fixtures       skip the regression fixtures check
//     --force             overwrite a flags/sample file that already has verdicts
//     --build-fixtures <verdicts.jsonl...>
//                         rebuild test/fixtures/real-salary-cases.json from
//                         reviewed verdicts + snapshots (each excerpt verified)
//
// One JSON line per flagged job: { id, company, title, url, source, parsed,
// excerpt (<= 300 chars around the matched pay text), pay_snippets (other pay
// clauses, for the reviewer), flags: [codes], critical, quarantined }.
// Exit 1 when a job that reaches the output (salary not quarantined by the
// gate) has a critical flag (implausible amount), or a regression fixture fails.
// Flag definitions: docs/VETTING.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { htmlToText } from '../server/sources/util.js';
import * as salaryLib from '../server/salary.js';
import { salaryChecks, statOutliers, vetSalaries, VET, CRITICAL_CODES, toUSD } from '../server/vet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'real-salary-cases.json');

/* ------------------------------------------------------------ tokenizing */

// DQ-17 (beta data check): the scan reads amounts, clauses and pay context with the
// parser's own rules (server/salary.js findMoneyTokens, payContextAt), so it agrees with
// salary.js on "across the U.S. is USD $X" (an abbreviation does not end the clause),
// Google's "US: $X - $Y (USD) + 15% bonus target + equity" (pay context), and "zł280000 -
// zł287000 (PLN)" (an amount). Where the parser finds pay context but no salary was
// published, the job is missed_salary.
export const CODES = 'USD|CAD|GBP|EUR|AUD|NZD|CHF|JPY|KRW|INR|SGD|ILS|AED|SAR|QAR|PLN|SEK|NOK|DKK|CZK|HKD|TWD|CNY|BRL|MXN|ZAR|RON';
const SEP_RE = /^\s*(?:[-–—‒―~]|to|and|through)\s*$/i;
export const PAY_WORDS_RE = /\b(salary|salaries|salaire|compensation|pay|base|range|ote|on-target|annual(?:ly)?|hourly|stipends?|wages?|(?:contract|pay|day) rate)\b/i;
const MAG_RE = /\d\s?(?:m|mm|b|bn|million|billion|mil)\b/i;

export const COUNTRY_CURRENCY = {
  US: 'USD', CA: 'CAD', GB: 'GBP', UK: 'GBP', CH: 'CHF', JP: 'JPY', KR: 'KRW', IN: 'INR', SG: 'SGD', AU: 'AUD',
  NZ: 'NZD', IL: 'ILS', AE: 'AED', SA: 'SAR', QA: 'QAR', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK', CZ: 'CZK',
  HK: 'HKD', TW: 'TWD', CN: 'CNY', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', RO: 'RON',
  ...Object.fromEntries('IE DE FR NL ES IT BE AT FI PT LU GR EE LV LT SK SI HR MT CY BG'.split(' ').map((c) => [c, 'EUR'])),
};

/** Money-ish tokens: { start, end, value, currency|null, weak, mag (M/B suffix), unit }, read like salary.js reads them. */
export function moneyTokens(text, opts = {}) {
  return salaryLib.findMoneyTokens(text, opts).map((t) => ({ start: t.start, end: t.end, value: t.value, currency: t.currency || null, weak: !!t.weak, mag: !!t.mag, unit: t.unit || null }));
}

/** Ranges among tokens: { lo, hi, currency, start, end, unit }. */
export function moneyRanges(text, toks = moneyTokens(text)) {
  const out = [];
  for (let i = 0; i + 1 < toks.length; i++) {
    const a = toks[i];
    const b = toks[i + 1];
    if (!SEP_RE.test(text.slice(a.end, b.start))) continue;
    const cur = a.currency || b.currency;
    if (!cur) continue;
    out.push({ lo: Math.min(a.value, b.value), hi: Math.max(a.value, b.value), currency: cur, start: a.start, end: b.end, unit: b.unit || a.unit || null });
    i++;
  }
  return out;
}

/** The sentence/clause around [s, e) (salary.js clause rules), plus the previous line when it is a short heading. */
export function clauseAround(text, s, e) {
  const c = salaryLib.payContextAt(text, s, e);
  const clause = text.slice(c.start, Math.min(text.length, c.end + 1));
  return c.heading ? `${c.heading}\n${clause}` : clause;
}

/** Is the amount at [s, e) pay by the parser's rules (pay word, heading, "+ bonus + equity", hourly unit)? */
export function inPayContext(text, s, e, opts = {}) {
  return salaryLib.payContextAt(text, s, e, opts).pay;
}

const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** <= max chars of flattened text centred on [s, e). */
export function excerptAround(text, s, e, max = 300) {
  const len = e - s;
  const pad = Math.max(0, Math.floor((max - Math.min(len, max)) / 2));
  let out = flat(text.slice(Math.max(0, s - pad - 20), Math.min(text.length, e + pad + 20)));
  if (out.length > max) {
    const core = flat(text.slice(s, e));
    const at = out.indexOf(core);
    const from = Math.max(0, Math.min(at >= 0 ? at - Math.floor((max - core.length) / 2) : 0, out.length - max));
    out = out.slice(from, from + max);
  }
  return out.slice(0, max);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Index span of `needle` in text, whitespace-insensitive. */
function findLoose(text, needle) {
  if (!needle) return null;
  const re = new RegExp(escapeRe(flat(needle)).replace(/ /g, '\\s+'));
  const m = re.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

const FACT = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

/** Where in the text an (annualized) structured salary appears, if anywhere. */
function findStructuredInText(text, sal) {
  const f = FACT[sal.originalInterval || 'year'] || 1;
  for (const v of [sal.min / f, sal.max / f]) {
    const r = Math.round(v * 100) / 100;
    let pat;
    if (r >= 1000) {
      const s = String(Math.round(r));
      const head = s.slice(0, s.length - 3);
      pat = `${head}[,.  ]?${s.slice(-3)}|${head}(?:\\.\\d)?\\s?[kK]`;
    } else pat = escapeRe(String(r));
    const m = new RegExp(`(?<![\\d.,])(?:${pat})(?![\\d])`).exec(text);
    if (m) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/** Pay words in a clause, ignoring benefit stipends ("$500 home office stipend" is not pay). */
export function hasPayWords(clause) {
  const s = typeof salaryLib.BENEFIT_STIPEND_RE === 'object' ? clause.replace(salaryLib.BENEFIT_STIPEND_RE, ' ') : clause;
  return PAY_WORDS_RE.test(s);
}

/**
 * Pay clauses in the text: amounts with a currency (a range, or a single figure with its
 * currency) in pay context, as { start, end, clause }: the parser's pay context, or a pay
 * word in the parser's clause. A total or cash compensation range, a pay floor and prose
 * money are not pay clauses (the parser's rejections, salary.js payContextAt).
 */
export function payClauses(text, { countries = [] } = {}) {
  const out = [];
  const seen = new Set();
  const toks = moneyTokens(text, { countries });
  const ranges = moneyRanges(text, toks);
  const inRange = new Set(ranges.flatMap((r) => toks.filter((t) => t.start >= r.start && t.end <= r.end)));
  const units = [...ranges.map((r) => ({ ...r, single: false })), ...toks.filter((t) => !inRange.has(t)).map((t) => ({ ...t, lo: t.value, hi: t.value, single: true }))]
    .sort((x, y) => x.start - y.start);
  for (const u of units) {
    if (!u.currency || u.hi < 7 || u.mag) continue;
    // The parser's clause (an abbreviation does not end it) and its rejections (total or
    // cash compensation, a pay floor, funding or bonus words around the amount); within
    // that, either the parser's own pay context or a broader pay word ("the annual range
    // for our interns is ..."), so a range the parser misses still shows up as missed.
    const c = salaryLib.payContextAt(text, u.start, u.end, { unit: u.unit, single: u.single });
    if (!c.pay && (c.reason || !hasPayWords(`${c.heading}\n${c.clause}`))) continue;
    const key = flat(clauseAround(text, u.start, u.end));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ start: u.start, end: u.end, clause: key });
  }
  return out;
}

/* ----------------------------------------------------------------- scan */

/** Flags that mean an implausible amount: a job that would be published with one fails CI. */
export const CRITICAL_FLAGS = new Set(['max_over_1_2m', 'min_under_15k_fulltime', 'hourly_over_cap']);

/** "structured" | "text" for a snapshot salary (salary.source when present). */
export function salarySource(job, text, sal) {
  if (sal.source) return sal.source;
  return findLoose(text, sal.text) ? 'text' : 'structured';
}

function countriesOf(job) {
  return [...new Set((job.locations || []).map((l) => l && l.country).filter(Boolean))];
}

function relDiff(a, b) { return Math.abs(a - b) / Math.max(1, Math.abs(b)); }

/**
 * Flags for one job. `stat` = stat_outlier info (from statOutliers) or null.
 * Returns { flags, excerpt, pay_snippets, source, critical }.
 */
export function scanJob(job, { stat = null } = {}) {
  const text = job.descriptionHtml ? htmlToText(job.descriptionHtml) : '';
  const sal = job.salary || job.salaryRaw || null;
  const flags = new Set();
  let span = null;
  let source = null;
  const countries = countriesOf(job);
  const clauses = text ? payClauses(text, { countries }) : [];

  if (sal) {
    source = text ? salarySource(job, text, sal) : (sal.source || null);
    if (text) span = source === 'text' ? findLoose(text, sal.text) : findStructuredInText(text, sal);
    for (const c of salaryChecks(job, sal)) {
      if (c.code === 'above_max') flags.add('max_over_1_2m');
      else if (c.code === 'below_min') flags.add('min_under_15k_fulltime');
      else if (c.code === 'min_gt_max') flags.add('min_gt_max');
      else if (c.code === 'junior_high') flags.add('title_junior_high');
      else if (c.code === 'senior_low') flags.add('title_senior_low');
      else if (c.code === 'hourly_high') flags.add('hourly_over_cap');
    }
    if (sal.min > 0 && sal.max / sal.min > VET.RATIO_FLAG) flags.add('ratio_over_3');
    if (MAG_RE.test(sal.text || '')) flags.add('magnitude_suffix');
    if (sal.originalInterval && sal.originalInterval !== 'year') flags.add('non_year_interval');
    if (sal.intervalCorrected) flags.add('interval_corrected');
    if (sal.originalInterval && sal.originalInterval !== 'year') {
      // Term pay (P-8) was annualized over its term (× 52 ÷ termWeeks).
      const raw = sal.max / (sal.originalInterval === 'term' && sal.termWeeks > 0 ? 52 / sal.termWeeks : FACT[sal.originalInterval] || 1);
      if ((toUSD(sal.max, sal.currency) ?? sal.max) > VET.MAX_ANNUAL && raw >= 15000 && raw <= VET.MAX_ANNUAL) flags.add('interval_suspect');
    }
    const want = countries.map((c) => COUNTRY_CURRENCY[c]).filter(Boolean);
    if (want.length && !want.includes(String(sal.currency).toUpperCase())) flags.add('currency_country_mismatch');
    if (text && source === 'text' && span && !inPayContext(text, span.start, span.end, { unit: sal.originalInterval === 'hour' ? 'hour' : null, single: sal.min === sal.max })) flags.add('no_pay_context');
    if (text && source === 'structured' && typeof salaryLib.parseSalary === 'function') {
      const p = salaryLib.parseSalary(text, { countries });
      const pj = p && salaryLib.toJobSalary(p);
      // DQ-32: a merged Apple requisition spans its places' ranges (salary.ranges with their
      // places) by design; the text agrees when it states one of those ranges.
      const placed = Array.isArray(sal.ranges) ? sal.ranges.filter((r) => r && Array.isArray(r.locations) && r.locations.length) : [];
      const targets = placed.length ? placed : [sal];
      const differs = (r) => pj.currency !== String(r.currency || sal.currency).toUpperCase() || relDiff(pj.min, r.min) > 0.1 || relDiff(pj.max, r.max) > 0.1;
      if (pj && targets.every(differs)) flags.add('structured_text_disagree');
    }
  } else if (clauses.length) {
    flags.add('missed_salary');
    span = clauses[0];
  }

  if (text) {
    const pay = new Set();
    for (const r of moneyRanges(text, moneyTokens(text, { countries }))) {
      if (r.hi < 7 || r.hi > 5e6) continue; // prose like "$100K to $10M+ in annual spend"
      if (inPayContext(text, r.start, r.end, { unit: r.unit })) pay.add(`${r.lo}|${r.hi}|${r.currency}`);
    }
    // More pay ranges than the salary accounts for (its zones: the parser's own count of the
    // posting's ranges, so a level list or a national + city pair it read by rule is not a
    // flag; DQ-17). With no salary, any two.
    if (pay.size > 1 && pay.size > (sal ? Math.max(1, Number(sal.zones) || 1) : 1)) flags.add('multiple_ranges');
    for (const c of clauses) {
      const toks = moneyTokens(c.clause).filter((t) => t.currency);
      const dollarCode = toks.some((t) => !t.weak && /^(USD|CAD|AUD|SGD|NZD|HKD)$/.test(t.currency));
      // A bare "$" next to "$... CAD" is the same currency, not a second one.
      const curs = new Set(toks.filter((t) => !(t.weak && dollarCode)).map((t) => t.currency));
      if (curs.size > 1) { flags.add('multi_currency'); break; }
    }
  }
  if (stat) flags.add('stat_outlier');
  if (job.salaryFlag) flags.add('quarantined');

  const excerpt = text && span ? excerptAround(text, span.start, span.end) : (sal ? flat(sal.text).slice(0, 300) : '');
  const ex = flat(excerpt);
  const pay_snippets = clauses.map((c) => c.clause).filter((c) => !ex.includes(c.slice(0, 60))).slice(0, 3).map((c) => c.slice(0, 200));
  const critical = [...flags].some((f) => CRITICAL_FLAGS.has(f));
  return { flags: [...flags], excerpt, pay_snippets, source, critical };
}

/** Flag records for one company's jobs. */
export function scanCompany(jobs) {
  const outliers = statOutliers(jobs.map((j) => (j && j.salary ? j : { ...j, salary: null })));
  const recs = [];
  jobs.forEach((job, i) => {
    const r = scanJob(job, { stat: outliers.get(i) || null });
    recs.push({ job, ...r });
  });
  return recs;
}

/** Line written to flags.jsonl / sample.jsonl. */
export function flagLine(job, r, extra = {}) {
  const parsed = job.salary || job.salaryRaw || null;
  return {
    id: job.id, company: job.company, title: job.title, url: job.url || null,
    employmentType: job.employmentType || null,
    countries: countriesOf(job),
    source: r.source, parsed,
    excerpt: r.excerpt, pay_snippets: r.pay_snippets,
    flags: r.flags, critical: r.critical, quarantined: !!job.salaryFlag,
    ...(job.salaryFlag ? { salaryFlag: job.salaryFlag } : {}),
    ...extra,
  };
}

/* ----------------------------------------------------- renormalization */

const UNFACT = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

/**
 * The structured salary a snapshot job carried, back in its original interval
 * (snapshots keep only the annualized Job salary, not pay_input_ranges etc.).
 */
export function structuredFromSnapshot(job, text) {
  const sal = job.salaryRaw || job.salary;
  if (!sal || salarySource(job, text, sal) !== 'structured') return null;
  const iv = sal.statedInterval || sal.originalInterval || 'year';
  const f = sal.intervalCorrected ? 1 : UNFACT[iv] || 1;
  const r2 = (n) => Math.round((n / f) * 100) / 100;
  return { min: r2(sal.min), max: r2(sal.max), currency: sal.currency, interval: iv, text: sal.text, ...(sal.ranges ? { ranges: sal.ranges } : {}), ...(sal.kind ? { kind: sal.kind } : {}) };
}

/** Re-derive salaries of one company's snapshot jobs with the current parser + gate. */
export async function renormalizeJobs(jobs) {
  const norm = await import('../server/normalize.js');
  if (typeof norm.deriveSalary !== 'function') throw new Error('server/normalize.js has no deriveSalary(); --renormalize needs the vetted parser');
  const out = jobs.map((job) => {
    const text = htmlToText(job.descriptionHtml || '');
    const raw = { title: job.title, employmentType: job.employmentType, text, html: job.descriptionHtml || '', salary: structuredFromSnapshot(job, text) };
    const { salaryRaw, salaryFlag, ...rest } = job;
    return { ...rest, salary: norm.deriveSalary(raw, job.locations || []) };
  });
  return vetSalaries(out);
}

/**
 * DQ-43 (fix wave 5): a snapshot's jobs as the build serves them, the steps of
 * scripts/build-static.js#readSnapshot and server/pipeline.js: a snapshot written by an older
 * normalizer is upgraded (rekeyBoardJobs, relocateJobs: pay, labels and levels re-derived), the
 * big-tech adapter fixes are applied to the stored jobs (upgradeStoredJobs), and the vetting gate
 * runs. `parsed` is the snapshot document ({ normalizerVersion, jobs }) or a bare job array.
 */
export async function loadServedJobs(parsed) {
  const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
  if (!Array.isArray(jobs)) return null;
  const [{ relocateJobs, NORMALIZER_VERSION }, { rekeyBoardJobs }, { upgradeStoredJobs }] = await Promise.all([
    import('../server/normalize.js'), import('../server/keywords.js'), import('../server/sources/upgrade.js')]);
  const current = !Array.isArray(parsed) && parsed.normalizerVersion === NORMALIZER_VERSION;
  return vetSalaries(upgradeStoredJobs(current ? jobs : relocateJobs(rekeyBoardJobs(jobs).jobs)));
}

/* --------------------------------------------------------------- fixtures */

/** Run one regression case; returns null when it passes, else a message. */
export async function checkFixtureCase(c) {
  const norm = await import('../server/normalize.js');
  const locations = (c.countries || []).map((country) => ({ country }));
  const raw = { title: c.title || '', employmentType: c.employmentType || null, text: c.text, html: '', salary: c.structured || null };
  const job = { title: c.title || '', employmentType: c.employmentType || null, department: null, salary: norm.deriveSalary(raw, locations) };
  const [vetted] = vetSalaries([job], { stats: false });
  const got = vetted.salary;
  const e = c.expected;
  const where = `${c.ids ? c.ids[0] : c.id} (${c.note || ''})`;
  if (c.quarantine) {
    if (got) return `${where}: expected quarantine, got ${got.min}–${got.max} ${got.currency}`;
    return null;
  }
  if (e == null) return got ? `${where}: expected no salary, got ${got.min}–${got.max} ${got.currency} from "${got.text}"` : null;
  if (!got) return `${where}: expected ${e.min}–${e.max} ${e.currency}/${e.interval}, got none${vetted.salaryFlag ? ` (quarantined: ${vetted.salaryFlag.reason})` : ''}`;
  const f = UNFACT[e.interval] || 1;
  const wantMin = Math.round(e.min * f);
  const wantMax = Math.round(e.max * f);
  const bad = [];
  if (Math.abs(got.min - wantMin) > 1) bad.push(`min ${got.min} != ${wantMin}`);
  if (Math.abs(got.max - wantMax) > 1) bad.push(`max ${got.max} != ${wantMax}`);
  if (got.currency !== e.currency) bad.push(`currency ${got.currency} != ${e.currency}`);
  if ((got.originalInterval || 'year') !== e.interval) bad.push(`interval ${got.originalInterval || 'year'} != ${e.interval}`);
  if (e.kind && got.kind !== e.kind) bad.push(`kind ${got.kind} != ${e.kind}`);
  return bad.length ? `${where}: ${bad.join(', ')}` : null;
}

export async function checkFixtures(file = FIXTURES) {
  if (!fs.existsSync(file)) return { total: 0, failures: [], missing: true };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cases = Array.isArray(data) ? data : data.cases;
  const failures = [];
  for (const c of cases) {
    const msg = await checkFixtureCase(c);
    if (msg) failures.push(msg);
  }
  return { total: cases.length, failures, missing: false };
}

/* ------------------------------------------------------- fixture builder */

/** Text from the heading line above [s, e) to the end of e's line (<= max chars). */
function contextBlock(text, s, e, { before = 1, max = 420 } = {}) {
  let a = s;
  for (let k = 0; k <= before; k++) {
    while (a > 0 && text[a - 1] !== '\n') a--;
    if (k < before) { a--; while (a > 0 && /\s/.test(text[a - 1])) a--; }
  }
  a = Math.max(0, a);
  let b = e;
  while (b < text.length && text[b] !== '\n') b++;
  let out = text.slice(a, b).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (out.length > max) {
    // keep the end (the amount) and the heading start
    const tail = text.slice(s, b).replace(/[ \t]+/g, ' ').trim();
    const headLen = Math.max(0, max - tail.length - 5);
    out = `${text.slice(a, a + headLen).replace(/[ \t]+/g, ' ').trim()}\n...\n${tail}`.slice(0, max + 10);
  }
  return out;
}

/**
 * Build test/fixtures/real-salary-cases.json from reviewed verdicts and the
 * snapshots: one case per distinct (excerpt, structured input, countries,
 * expectation), listing every job id it covers. Each excerpt is verified to
 * reproduce the expected result on its own; cases that don't are reported.
 */
export async function buildFixtures(verdictFiles, { snapDir = path.join(ROOT, 'data', 'snapshots'), out = FIXTURES } = {}) {
  const norm = await import('../server/normalize.js');
  const verdicts = verdictFiles.flatMap((f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s)));
  const jobsBy = new Map();
  const companyJobs = new Map();
  for (const co of [...new Set(verdicts.map((v) => v.company))]) {
    const file = path.join(snapDir, `${co}.json`);
    if (!fs.existsSync(file)) continue;
    const jobs = JSON.parse(fs.readFileSync(file, 'utf8')).jobs;
    companyJobs.set(co, jobs);
    for (const j of jobs) jobsBy.set(j.id, j);
  }
  const cases = new Map();
  const problems = [];
  for (const v of verdicts) {
    const job = jobsBy.get(v.id);
    if (!job) { problems.push(`${v.id}: not in snapshots`); continue; }
    const text = htmlToText(job.descriptionHtml || '');
    const countries = countriesOf(job);
    const structured = structuredFromSnapshot(job, text);
    const [vetted] = vetSalaries([{ ...job, salary: norm.deriveSalary({ title: job.title, employmentType: job.employmentType, text, html: job.descriptionHtml || '', salary: structured }, job.locations || []) }], { stats: false });
    const got = vetted.salary || vetted.salaryRaw;
    const base = { company: v.company, title: job.title, employmentType: job.employmentType || null, countries, structured };
    const expected = v.corrected ? { ...v.corrected, ...(v.kind ? { kind: v.kind } : {}) } : null;
    // A quarantine case is one the full pipeline holds back: bad structured
    // source data, or (rarely) a policy bound overriding a "correct" verdict.
    const quarantine = !!vetted.salaryFlag;
    let note = `${v.verdict}: ${String(v.evidence).replace(/^"[^"]*" — /, '').slice(0, 160)}`;
    if (quarantine && v.corrected != null) note = `policy quarantine (${vetted.salaryFlag.codes.join(',')}) although the reviewer verdict is ${v.verdict}; ${note}`;
    // Excerpt: decoy clause the old parser matched (if not the real pay) + the pay context.
    const parts = [];
    const oldSpan = v.parsed && v.parsed.text ? findLoose(text, v.parsed.text) : null;
    const newSpan = got && got.source === 'text' && got.text ? findLoose(text, got.text.replace(/\.\.\.$/, '')) : (structured ? findStructuredInText(text, { ...structured, min: structured.min * (FACT[structured.interval] || 1), max: structured.max * (FACT[structured.interval] || 1), originalInterval: structured.interval }) : null);
    if (oldSpan && (!newSpan || Math.abs(oldSpan.start - newSpan.start) > 200)) parts.push(flat(clauseAround(text, oldSpan.start, oldSpan.end)).slice(0, 240));
    if (newSpan) parts.push(contextBlock(text, newSpan.start, newSpan.end));
    if (!parts.length) {
      const pc = payClauses(text)[0];
      if (pc) parts.push(flat(pc.clause).slice(0, 240));
    }
    let c = { ...base, text: parts.join('\n\n'), expected, quarantine, note };
    let msg = await checkFixtureCase({ ...c, id: v.id });
    if (msg && newSpan) { // widen once
      c = { ...c, text: [parts.length > 1 ? parts[0] : null, contextBlock(text, newSpan.start, newSpan.end, { before: 3, max: 700 })].filter(Boolean).join('\n\n') };
      msg = await checkFixtureCase({ ...c, id: v.id });
    }
    if (msg) { problems.push(msg); continue; }
    const key = JSON.stringify([c.text, c.structured, c.countries, c.employmentType, c.expected, c.quarantine, salaryChecks({ title: c.title }, { min: 1e5, max: 1e5, mid: 1e5, currency: 'USD' }).length]);
    if (cases.has(key)) cases.get(key).ids.push(v.id);
    else cases.set(key, { ids: [v.id], url: v.url, ...c });
  }
  const list = [...cases.values()].map(({ ids, url, company, title, employmentType, countries, structured, text, expected, quarantine, note }) => ({
    ids, url, company, title, employmentType, countries, ...(structured ? { structured } : {}), text, expected, ...(quarantine ? { quarantine } : {}), note,
  }));
  const payload = {
    about: 'Real salary cases reviewed in data/vetting/<date>/verdicts.jsonl (one entry per distinct excerpt; ids lists every job it covers). Built by `node scripts/vet-salaries.js --build-fixtures <verdicts.jsonl>`; run by test/salary.test.js and the CI scan. expected is in the source interval (null = no salary); quarantine = the vetting gate must hold it back.',
    built_from: verdictFiles.map((f) => path.relative(ROOT, f)),
    cases: list,
  };
  // One case per line: compact and diff-friendly.
  const head = JSON.stringify({ about: payload.about, built_from: payload.built_from }, null, 1).replace(/\n}$/, '');
  fs.writeFileSync(out, `${head},\n "cases": [\n${list.map((c) => `  ${JSON.stringify(c)}`).join(',\n')}\n ]\n}\n`);
  return { cases: list.length, jobs: list.reduce((n, c) => n + c.ids.length, 0), problems };
}

/* ------------------------------------------------------------------ CLI */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededSample(items, n, seed) {
  const rnd = mulberry32(seed);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function parseArgs(argv) {
  const o = { files: [], date: new Date().toISOString().slice(0, 10), seed: 20261002, fixtures: true, writeFlags: true, gate: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') o.date = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--renormalize') o.renormalize = true;
    else if (a === '--write') o.write = true;
    else if (a === '--sample') o.sample = Number(argv[++i]);
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--summary') o.summary = argv[++i];
    else if (a === '--no-fixtures') o.fixtures = false;
    else if (a === '--no-write-flags') o.writeFlags = false;
    else if (a === '--force') o.force = true;
    else if (a === '--no-gate') o.gate = false;
    else if (a === '--build-fixtures') { o.buildFixtures = []; while (argv[i + 1] && !argv[i + 1].startsWith('--')) o.buildFixtures.push(path.resolve(argv[++i])); }
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.files.push(a);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.buildFixtures) {
    const r = await buildFixtures(o.buildFixtures);
    console.log(`fixtures: ${r.cases} cases covering ${r.jobs} reviewed jobs -> ${path.relative(ROOT, FIXTURES)}`);
    for (const p of r.problems) console.error(`  not reproducible from a short excerpt: ${p}`);
    process.exitCode = r.problems.length ? 1 : 0;
    return;
  }
  const snapDir = path.join(ROOT, 'data', 'snapshots');
  if (!o.files.length && fs.existsSync(snapDir)) {
    o.files = fs.readdirSync(snapDir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(snapDir, f));
  }
  const dir = path.join(ROOT, 'data', 'vetting', o.date);
  const out = o.out ? path.resolve(o.out) : path.join(dir, o.renormalize ? 'flags.renormalized.jsonl' : 'flags.jsonl');

  const lines = [];
  const sampleLines = [];
  const counts = {};   // company -> { jobs, salaried, quarantined, flagged, critical, blocking, codes: {} }
  const blocking = [];
  for (const file of o.files) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { console.error(`! ${file}: ${err.message}`); continue; }
    let jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
    if (!Array.isArray(jobs)) { console.error(`! ${file}: no jobs array`); continue; }
    if (!o.renormalize && o.gate) jobs = await loadServedJobs(parsed); // what build-static / the server serve (DQ-43)
    if (o.renormalize) {
      jobs = await renormalizeJobs(jobs);
      if (o.write) {
        fs.writeFileSync(file, JSON.stringify(Array.isArray(parsed) ? jobs : { ...parsed, jobs }, null, 1) + '\n');
        console.log(`rewrote ${path.relative(ROOT, file)}`);
      }
    }
    const slug = (parsed.company && parsed.company.slug) || (jobs[0] && jobs[0].company) || path.basename(file, '.json');
    const c = counts[slug] = { jobs: jobs.length, salaried: 0, quarantined: 0, flagged: 0, critical: 0, blocking: 0, codes: {} };
    const recs = scanCompany(jobs);
    const unflagged = [];
    for (const r of recs) {
      if (r.job.salary) c.salaried++;
      if (r.job.salaryFlag) c.quarantined++;
      if (!r.flags.length) { if (r.job.salary) unflagged.push(r); continue; }
      c.flagged++;
      if (r.critical) c.critical++;
      if (r.critical && r.job.salary) { c.blocking++; blocking.push(`${r.job.id} ${r.job.title}: ${r.job.salary.text}`); }
      for (const f of r.flags) c.codes[f] = (c.codes[f] || 0) + 1;
      lines.push(flagLine(r.job, r));
    }
    if (o.sample > 0) {
      unflagged.sort((a, b) => String(a.job.id).localeCompare(String(b.job.id)));
      for (const r of seededSample(unflagged, o.sample, o.seed)) sampleLines.push(flagLine(r.job, r, { sample_seed: o.seed }));
    }
  }

  let fx = { total: 0, failures: [], missing: true };
  if (o.fixtures) fx = await checkFixtures();

  if (o.writeFlags && o.files.length) {
    // A reviewed scan is an audit record: never overwrite it silently.
    // flags.jsonl and sample.jsonl are the review inputs that verdicts.jsonl refers to.
    const reviewed = fs.existsSync(path.join(path.dirname(out), 'verdicts.jsonl'));
    const inputs = (path.basename(out) === 'flags.jsonl' && fs.existsSync(out)) || (o.sample > 0 && fs.existsSync(path.join(dir, 'sample.jsonl')));
    if (reviewed && !o.force && inputs) {
      throw new Error(`${path.relative(ROOT, out)} (or sample.jsonl) already has verdicts next to it; pass --out <file> for a new scan, or --force to overwrite`);
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
    fs.writeFileSync(out.replace(/\.jsonl$/, '') + '.counts.json', JSON.stringify(counts, null, 1) + '\n');
    if (o.sample > 0) fs.writeFileSync(path.join(dir, 'sample.jsonl'), sampleLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }

  const allCodes = [...new Set(Object.values(counts).flatMap((c) => Object.keys(c.codes)))].sort();
  const table = [
    `| company | jobs | salaried | quarantined | flagged | critical (blocking) | ${allCodes.join(' | ')} |`,
    `| --- | ---: | ---: | ---: | ---: | ---: |${allCodes.map(() => ' ---: |').join('')}`,
    ...Object.entries(counts).map(([slug, c]) => `| ${slug} | ${c.jobs} | ${c.salaried} | ${c.quarantined} | ${c.flagged} | ${c.critical} (${c.blocking}) | ${allCodes.map((k) => c.codes[k] || 0).join(' | ')} |`),
  ];
  if (!o.files.length) console.log('vet-salaries: no snapshot files found; nothing to scan');
  else {
    console.log(`vet-salaries: ${o.files.length} file(s)${o.renormalize ? ' (renormalized + gate)' : o.gate ? ' (as served: gate applied)' : ' (raw, no gate)'}`);
    for (const [slug, c] of Object.entries(counts)) {
      const codes = Object.entries(c.codes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`  ${slug.padEnd(10)} jobs ${String(c.jobs).padStart(4)}  salaried ${String(c.salaried).padStart(4)}  quarantined ${String(c.quarantined).padStart(3)}  flagged ${String(c.flagged).padStart(4)}  critical ${c.critical} (blocking ${c.blocking})  ${codes}`);
    }
    if (o.writeFlags) console.log(`  -> ${path.relative(ROOT, out)} (${lines.length} lines)${o.sample > 0 ? `, sample.jsonl (${sampleLines.length}, seed ${o.seed})` : ''}`);
  }
  if (fx.missing) console.log(o.fixtures ? 'fixtures: test/fixtures/real-salary-cases.json not found (skipped)' : 'fixtures: skipped');
  else console.log(`fixtures: ${fx.total - fx.failures.length}/${fx.total} regression cases pass`);
  for (const f of fx.failures) console.error(`  FIXTURE FAIL ${f}`);
  for (const b of blocking) console.error(`  CRITICAL (not quarantined) ${b}`);

  if (o.summary) {
    const md = ['### Salary vetting', '',
      o.files.length ? table.join('\n') : '_No snapshot files found; nothing scanned._', '',
      `Regression fixtures: ${fx.missing ? 'not run' : `${fx.total - fx.failures.length}/${fx.total} pass`}.`,
      blocking.length ? `\n**${blocking.length} job(s) with an unquarantined critical salary:**\n${blocking.slice(0, 50).map((b) => `- ${b}`).join('\n')}` : 'No unquarantined critical salaries.',
      fx.failures.length ? `\n**Fixture failures:**\n${fx.failures.slice(0, 50).map((f) => `- ${f}`).join('\n')}` : '', ''];
    fs.appendFileSync(o.summary, md.join('\n'));
  }
  process.exitCode = blocking.length || fx.failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(`vet-salaries failed: ${err.stack || err.message}`); process.exit(2); });
}

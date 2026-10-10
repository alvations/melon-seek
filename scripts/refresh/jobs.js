// Updater: job and company numbers, and the comparison models built on them
// (docs/DATA_FRESHNESS.md; process log docs/process/freshness-jobs.md).
//
// Job postings are refreshed DAILY by the job-board pipeline (snapshot.yml, pages.yml:
// fetch, vet, juice, ledger), so this module fetches no job data. Once a month it reads
// the newest local snapshots (data/snapshots/*.json; in CI the workflow restores the
// latest trusted `job-board-snapshots` artifact first) and checks that the models and
// constants built on top of them still fit the data:
//
//   market-comps          buildMarket() recomputed; live api/market.json age and agreement
//   jobs-aggregates       the monthly dated aggregate for the archive (Result.archive)
//   compstimate-backtest  backtest() re-run with the published options; vs the live
//                         "Typically within ±N%" figure, last month, the 25% Low-confidence
//                         threshold, and any hand-written "±N% (tested on N ...)" in the docs
//   compstimate-model     LEVEL_INDEX read as a geometric pay ladder vs the data's
//                         level/Mid median ratios (IQR band per level); never auto-written
//   salary-vetting-flags  quarantined / flagged pay per company and per tier vs last month
//   role-families, seniority-ladder, keyword-lexicons   lexicon coverage per company
//   history-ledger        last ledger date, run rate, gaps, row counts
//   job-postings, job-salary-parsed, job-salary-usd, company-registry,
//   company-aggregates, job-juice                        data health per company
//
// Every check is 'detect': the module never writes a file. A Result's `findings` use
// encoded = the claimed / previous / bound value and official = what the data shows now.
//
// "Last month" is the newest archived `jobs-aggregates` version older than this run's
// data, read from the archive checkout ($MELON_ARCHIVE_DIR, default tmp/archive,
// reference/jobs-aggregates/<date>.json; docs/DATA_ARCHIVE.md). Without it the
// month-over-month checks are skipped and only absolute bounds apply (the summary says so).
//
// Inputs (env, all optional): MELON_SNAPSHOT_DIR, MELON_BETA_SNAPSHOT_DIR, MELON_HISTORY_DIR,
// MELON_BETA_HISTORY_DIR, MELON_ARCHIVE_DIR, MELON_SITE_URL (default the GitHub Pages site).
import fs from 'node:fs';
import path from 'node:path';
import { result, errorResult, isoDate, parseDate, daysBetween, extractConst, jsonText, excerpt } from './lib.js';

export const MODULE = Object.freeze({
  name: 'jobs',
  ids: [
    'job-postings', 'job-salary-parsed', 'job-salary-usd', 'salary-vetting-flags',
    'company-registry', 'company-aggregates', 'market-comps', 'jobs-aggregates',
    'compstimate-model', 'compstimate-backtest',
    'seniority-ladder', 'role-families', 'keyword-lexicons', 'history-ledger', 'job-juice',
  ],
});

export const SITE_URL = 'https://alvations.github.io/melon-seek/';
export const AGGREGATES_DATASET = 'jobs-aggregates';
export const AGGREGATES_FORMAT = 'melon-jobs-aggregates-1';

/**
 * Bounds of the drift / flag checks. Each is justified in docs/process/freshness-jobs.md §3.
 * "pts" are percentage points of a share; shares are computed per company.
 */
export const BOUNDS = Object.freeze({
  minJobs: 50,                 // share-based checks need a company with at least this many postings
  minSalaried: 30,             // ... or this many salaried postings
  snapshotMaxAgeDays: 3,       // snapshot.yml + pages.yml run daily: 3 days = 2+ missed runs
  jobsDropShare: 0.5,          // job count halves month over month (= archive SUSPECT_DROP_SHARE)
  salariedDropPts: 15,         // share of postings with pay falls 15+ points (parser/adapter regression)
  quarantineJumpPts: 2,        // quarantined share up 2+ points AND at least doubled
  quarantineMaxShare: 0.10,    // more than 10% of a company's pay hidden by the gate
  reviewJumpPts: 10,           // review-only scan flags up 10+ points
  noFxMax: 0,                  // any salaried currency without an FX rate drops out of comps
  medianMovePct: 15,           // a company's median USD pay moving 15%+ in a month
  familyUnknownMaxShare: 0.02, // > 2% of postings with no role family (they vanish from comps)
  familyUnknownRisePts: 1,
  midDefaultRisePts: 10,       // one company's share of titles with no level word up 10+ points
  midDefaultPooledMax: 0.5,    // pooled: default-"Mid" postings outnumber every explicitly levelled posting combined
  midDefaultPooledRisePts: 5,  // pooled share up 5+ points month over month
  levelTokenMaxShare: 0.01,    // > 1% of postings carry a level token the lexicon does not read
  skillsNoneMaxShare: 0.15,    // > 15% of postings with no skill keyword
  skillsNoneRisePts: 5,
  juiceCoverageDropPts: 10,    // share of salaried postings with a Juice Score falls 10+ points
  juiceCoverageMin: 0.5,       // or under half of a company's salaried postings
  backtestMinPts: 3,           // backtest error moves at least 3 points ...
  backtestSeK: 3,              // ... or 3 standard errors of the median, whichever is larger
  backtestMaxPool: 6000,       // salaried postings above which a company's backtest is not re-run here
  liveMaxAgeDays: 3,           // the live site's generatedAt / computedAt older than this
  ledgerMaxAgeDays: 3,
  ledgerMinRunsPerDay: 0.5,
  ledgerMaxGapDays: 7,
  minGroups: 3,                // company x family pairs needed for a level's IQR band
  minBandHalfWidth: 0.05,      // a level's band is at least median +-5% (cell medians of 3-7 postings are noisy)
  timeBudgetMs: 4.5 * 60 * 1000, // run.js stops a module after 6 minutes
});

/** Review cadence of the product-policy groups this module checks (registry `reviewCadence` wins). */
export const REVIEW_DEFAULTS = Object.freeze({
  'compstimate-model': { lastReviewed: '2026-10-02', reviewCadence: 'yearly' },
  'seniority-ladder': { lastReviewed: '2026-10-02', reviewCadence: 'yearly' },
  'role-families': { lastReviewed: '2026-10-02', reviewCadence: 'yearly' },
  'keyword-lexicons': { lastReviewed: '2026-10-02', reviewCadence: 'yearly' },
});
const CADENCE_DAYS = { monthly: 31, quarterly: 92, semiannual: 184, yearly: 366 };
const REVIEW_GRACE = { monthly: 14, quarterly: 30, semiannual: 45, yearly: 60 };

const DAY = 86400000;
const SEVERITY = { ok: 0, skipped: 1, stale: 2, drift: 3, flag: 4, error: 5 };
const worst = (...s) => s.filter(Boolean).reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), 'ok');
const share = (a, b) => (b > 0 ? a / b : null);
const pts = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10);
const round1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const round3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const round100 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n / 100) * 100);
const dateOf = (iso) => (iso ? isoDate(iso) : null);
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };

/** Linear-interpolation quantile of an UNSORTED numeric list (same rule as build-market.js). */
export function quantile(values, p) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (s[Math.ceil(h)] - s[lo]) * (h - lo);
}
/** { n, p10, p25, p50, p75, p90 } rounded to $100. */
export function dist(values) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return { n: 0, p10: null, p25: null, p50: null, p75: null, p90: null };
  return { n: v.length, p10: round100(quantile(v, 0.1)), p25: round100(quantile(v, 0.25)), p50: round100(quantile(v, 0.5)), p75: round100(quantile(v, 0.75)), p90: round100(quantile(v, 0.9)) };
}

// ---------------------------------------------------------------- product modules (lazy)

let DEPS = null;
/** The product code the checks reuse (imported lazily so a broken module becomes an 'error' Result). */
export async function loadDeps() {
  if (DEPS) return DEPS;
  const [market, vet, normalize, keywords, comp, roles, palette, juice, history, companies, scan, shared] = await Promise.all([
    import('../build-market.js'), import('../../server/vet.js'), import('../../server/normalize.js'),
    import('../../server/keywords.js'), import('../../public/features/compstimate.js'), import('../../public/features/roles.js'),
    import('../../public/viz/palette.js'), import('../../server/juice.js'), import('../../server/history.js'),
    import('../../server/companies.js'), import('../vet-salaries.js'), import('../../public/features/shared.js'),
  ]);
  DEPS = {
    buildMarket: market.buildMarket, usdMid: market.usdMid, MIN_N: market.MIN_N, MARKET_FORMAT: market.MARKET_FORMAT,
    vetSalaries: vet.vetSalaries, CRITICAL_CODES: vet.CRITICAL_CODES,
    relocateJobs: normalize.relocateJobs, NORMALIZER_VERSION: normalize.NORMALIZER_VERSION,
    rekeyBoardJobs: keywords.rekeyBoardJobs, inferSeniority: keywords.inferSeniority,
    // 'title' | 'default' when server/keywords.js exports it (patch freshness-jobs-seniority-default.diff);
    // until then a level is a default exactly when inferSeniority falls through to 'Mid'.
    seniorityBasis: typeof keywords.seniorityBasis === 'function' ? keywords.seniorityBasis : (t) => (keywords.inferSeniority(t) === 'Mid' ? 'default' : 'title'),
    backtest: comp.backtest, ACCURACY_LOW_THRESHOLD: comp.ACCURACY_LOW_THRESHOLD, BACKTEST_SEED: comp.BACKTEST_SEED,
    roleFamily: comp.roleFamily || roles.roleFamily, FAMILY_LABELS: roles.FAMILY_LABELS, SENIORITY_LADDER: roles.SENIORITY_LADDER,
    FAMILY_TITLES: comp.FAMILY_TITLES,
    hasFx: palette.hasFx, FX_AS_OF: palette.FX_AS_OF,
    attachJuiceAll: juice.attachJuiceAll, GRADES: juice.GRADES,
    annotate: history.annotate, FRESHNESS: history.FRESHNESS, PRUNE_CLOSED_DAYS: history.PRUNE_CLOSED_DAYS, HISTORY_FORMAT: history.HISTORY_FORMAT,
    listCompanies: companies.listCompanies,
    scanCompany: scan.scanCompany,
    salaryUSD: shared.salaryUSD,
  };
  return DEPS;
}

// ---------------------------------------------------------------- inputs

/** Where the inputs live (absolute paths). */
export function dataDirs(ctx) {
  const env = (ctx && ctx.env) || process.env;
  const root = (ctx && ctx.root) || process.cwd();
  const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p));
  return {
    stable: abs(env.MELON_SNAPSHOT_DIR || path.join('data', 'snapshots')),
    beta: abs(env.MELON_BETA_SNAPSHOT_DIR || path.join('data', 'beta', 'snapshots')),
    history: abs(env.MELON_HISTORY_DIR || path.join('data', 'history')),
    betaHistory: abs(env.MELON_BETA_HISTORY_DIR || path.join('data', 'beta', 'history')),
    archive: abs(env.MELON_ARCHIVE_DIR || path.join('tmp', 'archive')),
    site: String(env.MELON_SITE_URL || SITE_URL).replace(/\/?$/, '/'),
  };
}

const jsonFiles = (dir) => {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f)); } catch { return []; }
};
const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');

/** Level words in a "Mid by default" title that the seniority lexicon does not read (L5, IC4, Level 3, E6). */
export const LEVEL_TOKEN_RE = /\b(?:L|IC|E|P|M|T|SDE|SWE)[- ]?\d{1,2}\b|\blevel\s+(?:\d{1,2}|[IVX]{1,4})\b|\bgrade\s+\d{1,2}\b|\bband\s+\d{1,2}\b/i;

/**
 * One board, upgraded and vetted exactly as scripts/build-static.js#readSnapshot does
 * (older snapshots get keywords re-derived and locations re-geocoded), then scanned with
 * scripts/vet-salaries.js#scanCompany (the CI gate's flags). Descriptions are dropped after
 * the scan. Pure apart from the deps.
 */
export function prepareBoard(snap, { file = null, channel = 'stable', D }) {
  const raw = Array.isArray(snap) ? snap : snap && snap.jobs;
  if (!Array.isArray(raw)) throw new Error('no jobs array');
  const company = (snap && !Array.isArray(snap) && snap.company) || null;
  const slug = (company && company.slug) || (raw[0] && raw[0].company) || (file ? path.basename(file, '.json') : 'unknown');
  const normalizerVersion = (snap && snap.normalizerVersion) || null;
  const upgraded = normalizerVersion !== D.NORMALIZER_VERSION;
  let jobs = raw.filter(Boolean);
  if (upgraded) jobs = D.relocateJobs(D.rekeyBoardJobs(jobs).jobs);
  jobs = D.vetSalaries(jobs);
  const recs = D.scanCompany(jobs);
  const scan = { payBearing: 0, flagged: 0, critical: 0, blocking: 0, quarantined: 0, statistical: 0, review: 0, codes: {}, gateCodes: {}, blockingIds: [] };
  for (const r of recs) {
    const j = r.job;
    if (j.salary || j.salaryRaw) scan.payBearing++;
    if (r.flags.length) scan.flagged++;
    if (r.critical) scan.critical++;
    if (r.critical && j.salary) { scan.blocking++; if (scan.blockingIds.length < 5) scan.blockingIds.push(`${j.id} ${j.title}`); }
    if (j.salaryFlag) {
      scan.quarantined++;
      for (const c of j.salaryFlag.codes || []) bump(scan.gateCodes, c);
      if ((j.salaryFlag.codes || []).includes('stat_outlier')) scan.statistical++;
    }
    if (r.flags.length && !r.critical && !j.salaryFlag) scan.review++;
    for (const f of r.flags) bump(scan.codes, f);
  }
  const slim = jobs.map((j) => { if (!j) return j; const { descriptionHtml, sections, ...rest } = j; return rest; });
  return {
    slug, name: (company && company.name) || slug, color: (company && company.color) || null, channel,
    mode: (snap && snap.mode) || 'snapshot', fetchedAt: (snap && snap.fetchedAt) || null, normalizerVersion, upgraded,
    file, jobs: slim, scan,
  };
}

/** Read a ledger file; null when absent or not a melon-history-1 ledger. */
export function readLedgerFile(file, format = 'melon-history-1') {
  try {
    const l = JSON.parse(fs.readFileSync(file, 'utf8'));
    return l && l.format === format && l.jobs && typeof l.jobs === 'object' ? l : null;
  } catch { return null; }
}

const CACHE = new Map();

/**
 * Load every board, ledger and the cities document once per run (shared with policy.js).
 * -> { dirs, boards, ledgers: { stable: {slug: ledger}, beta: {...} }, cities, problems, loadedAt }
 */
export async function loadJobData(ctx, { D } = {}) {
  const deps = D || await loadDeps();
  const dirs = dataDirs(ctx);
  const files = [...jsonFiles(dirs.stable).map((f) => [f, 'stable']), ...(dirs.beta !== dirs.stable ? jsonFiles(dirs.beta).map((f) => [f, 'beta']) : [])];
  const ledgerFiles = [...jsonFiles(dirs.history).map((f) => [f, 'stable']), ...jsonFiles(dirs.betaHistory).map((f) => [f, 'beta'])];
  const stat = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } };
  const citiesFile = path.join(ctx.root, 'data', 'cities.json');
  const key = JSON.stringify([files.map(([f]) => [f, stat(f)]), ledgerFiles.map(([f]) => [f, stat(f)]), stat(citiesFile)]);
  if (CACHE.has(key)) return CACHE.get(key);
  const p = (async () => {
    const problems = [];
    let cities = null;
    try { cities = ctx.readJson('data/cities.json'); } catch (err) { problems.push(`data/cities.json: ${err.message}`); }
    const ledgers = { stable: {}, beta: {} };
    const ledgerProblems = [];
    for (const [f, ch] of ledgerFiles) {
      const l = readLedgerFile(f, deps.HISTORY_FORMAT);
      if (l) ledgers[ch][path.basename(f, '.json')] = l;
      else ledgerProblems.push(`${rel(ctx.root, f)}: not a ${deps.HISTORY_FORMAT} ledger`);
    }
    const boards = [];
    for (const [f, channel] of files) {
      let snap;
      try { snap = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { problems.push(`${rel(ctx.root, f)}: unreadable (${err.message})`); continue; }
      try {
        const b = prepareBoard(snap, { file: rel(ctx.root, f), channel, D: deps });
        if (cities) deps.attachJuiceAll(b.jobs, cities, { inputs: 'none' });
        const ledger = ledgers[channel][b.slug] || null;
        b.freshness = { new: 0, active: 0, stale: 0, evergreen: 0, unknown: 0 };
        for (const j of deps.annotate(b.jobs, ledger, b.fetchedAt)) bump(b.freshness, (j && j.freshness) || 'unknown');
        b.hasLedger = !!ledger;
        boards.push(b);
      } catch (err) { problems.push(`${rel(ctx.root, f)}: ${err.message}`); }
    }
    problems.push(...ledgerProblems);
    return { dirs, boards, ledgers, cities, problems, loadedAt: Date.now() };
  })();
  CACHE.set(key, p);
  p.catch(() => CACHE.delete(key));
  return p;
}

// ---------------------------------------------------------------- per-company statistics

/** Everything the monthly checks and the archive aggregate need about one board (pure). */
export function companyStats(board, D) {
  const jobs = board.jobs.filter(Boolean);
  const s = {
    slug: board.slug, name: board.name, channel: board.channel, mode: board.mode, fetchedAt: board.fetchedAt,
    normalizerVersion: board.normalizerVersion, upgraded: !!board.upgraded,
    jobs: jobs.length, salaried: 0, quarantined: board.scan.quarantined, remote: 0,
    usd: null, currencies: {}, noFx: 0, noFxCurrencies: {}, converted: 0, intervals: {}, kinds: {}, sources: {},
    seniority: {}, midDefault: 0, levelTokens: 0, levelTokenExamples: [],
    families: {}, familyUnknown: 0, familyUnknownExamples: [],
    keywords: { noSkills: 0, noResponsibilities: 0, noFit: 0 },
    vet: { ...board.scan, blockingIds: undefined },
    juice: null, freshness: board.freshness || null,
  };
  delete s.vet.blockingIds;
  const mids = [];
  const scores = [];
  const nets = [];
  const grades = {};
  const unmatched = {};
  let scored = 0;
  for (const j of jobs) {
    if (j.remote) s.remote++;
    bump(s.seniority, j.seniority || 'Unspecified');
    const fam = (() => { try { return D.roleFamily(j.title || '', j); } catch { return null; } })();
    if (fam) bump(s.families, fam);
    else { s.familyUnknown++; if (s.familyUnknownExamples.length < 5) s.familyUnknownExamples.push(String(j.title || '').slice(0, 90)); }
    if ((j.seniority || 'Mid') === 'Mid' && D.seniorityBasis(j.title || '') === 'default') {
      s.midDefault++;
      if (LEVEL_TOKEN_RE.test(String(j.title || ''))) { s.levelTokens++; if (s.levelTokenExamples.length < 5) s.levelTokenExamples.push(String(j.title).slice(0, 90)); }
    }
    const kw = j.keywords || {};
    if (!(kw.skills && kw.skills.length)) s.keywords.noSkills++;
    if (!(kw.responsibilities && kw.responsibilities.length)) s.keywords.noResponsibilities++;
    if (!(kw.fit && kw.fit.length)) s.keywords.noFit++;
    const sal = j.salary;
    if (!sal) continue;
    s.salaried++;
    const cur = String(sal.currency || 'USD').toUpperCase();
    bump(s.currencies, cur);
    bump(s.intervals, sal.originalInterval || 'year');
    bump(s.kinds, sal.kind || 'salary');
    bump(s.sources, sal.source || 'unknown');
    if (!D.hasFx(cur)) { s.noFx++; bump(s.noFxCurrencies, cur); }
    else if (cur !== 'USD') s.converted++;
    const usd = D.usdMid(sal);
    if (usd != null) mids.push(usd);
    if (j.juice && j.juice.best) {
      scored++;
      scores.push(j.juice.best.score);
      nets.push(j.juice.best.net);
      bump(grades, j.juice.best.grade || '?');
    } else {
      const loc = (j.locations || []).find((l) => l && !l.remote);
      if (loc) bump(unmatched, [loc.city || loc.name, loc.country].filter(Boolean).join(', '));
      else bump(unmatched, '(remote only)');
    }
  }
  s.usd = dist(mids);
  s.juice = {
    scored, coverage: round3(share(scored, s.salaried)),
    score: { p10: round1(quantile(scores, 0.1)), p50: round1(quantile(scores, 0.5)), p90: round1(quantile(scores, 0.9)) },
    net: dist(nets), grades,
    unmatched: Object.entries(unmatched).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
  };
  s.payShare = round3(share(s.salaried, s.jobs));
  s.remoteShare = round3(share(s.remote, s.jobs));
  s.shares = {
    familyUnknown: round3(share(s.familyUnknown, s.jobs)),
    midDefault: round3(share(s.midDefault, s.jobs)),
    levelTokens: round3(share(s.levelTokens, s.jobs)),
    noSkills: round3(share(s.keywords.noSkills, s.jobs)),
    quarantined: round3(share(s.vet.quarantined, s.vet.payBearing)),
    critical: round3(share(s.vet.critical, s.vet.payBearing)),
    statistical: round3(share(s.vet.statistical, s.vet.payBearing)),
    review: round3(share(s.vet.review, s.vet.payBearing)),
  };
  return s;
}

// ---------------------------------------------------------------- market comps and levels

const cellObjects = (doc) => (doc && Array.isArray(doc.cells) ? doc.cells.map((c) => (Array.isArray(c) ? Object.fromEntries(doc.columns.map((k, i) => [k, c[i]])) : c)) : []);

/** Per-company and per-family summaries of a market doc (all-levels "*" cells). */
export function summarizeMarket(doc) {
  const cells = cellObjects(doc);
  const companies = {};
  const families = {};
  for (const c of cells) {
    const co = companies[c.company] || (companies[c.company] = { cells: 0, families: 0, n: 0 });
    co.cells++;
    if (c.seniority !== '*') continue;
    co.families++;
    co.n += c.n;
    const f = families[c.family] || (families[c.family] = { family: c.family, companies: 0, n: 0, medians: [] });
    f.companies++;
    f.n += c.n;
    f.medians.push(c.median);
  }
  const fam = Object.values(families).map((f) => ({ family: f.family, companies: f.companies, n: f.n, medianOfMedians: round100(quantile(f.medians, 0.5)), min: Math.min(...f.medians), max: Math.max(...f.medians) }))
    .sort((a, b) => b.companies - a.companies || b.n - a.n || a.family.localeCompare(b.family));
  return { cells: cells.length, companies, families: fam, compareFamilies: fam.filter((f) => f.companies >= 2).length };
}

/** Pooled per-family pay across companies (USD midpoints of vetted salaried postings), with level splits. */
export function familyDistributions(boards, D) {
  const by = new Map();
  for (const b of boards) {
    for (const j of b.jobs) {
      if (!j || !j.salary) continue;
      const usd = D.usdMid(j.salary);
      if (usd == null) continue;
      let fam = null;
      try { fam = D.roleFamily(j.title || '', j); } catch { fam = null; }
      if (!fam) continue;
      const e = by.get(fam) || { family: fam, all: [], companies: new Set(), levels: {} };
      e.all.push(usd);
      e.companies.add(b.slug);
      (e.levels[j.seniority || 'Mid'] ||= []).push(usd);
      by.set(fam, e);
    }
  }
  return [...by.values()].map((e) => ({
    family: e.family, companies: e.companies.size, ...dist(e.all),
    levels: Object.fromEntries(Object.entries(e.levels).map(([l, v]) => [l, dist(v)])),
  })).sort((a, b) => b.n - a.n || a.family.localeCompare(b.family));
}

/**
 * Level-to-reference pay ratios from a market doc: for every company x family that has a
 * cell (n >= minN) at both the level and the reference level, median(level) / median(ref).
 * Using within-company pairs removes each company's pay level from the comparison.
 * -> { reference, points: [{ level, group, r }], byLevel: { L: { groups, q25, median, q75 } } }
 */
export function levelRatios(doc, { reference = 'Mid' } = {}) {
  const cells = cellObjects(doc).filter((c) => c.seniority !== '*');
  const at = new Map(cells.map((c) => [`${c.company}|${c.family}|${c.seniority}`, c]));
  const points = [];
  for (const c of cells) {
    if (c.seniority === reference) continue;
    const ref = at.get(`${c.company}|${c.family}|${reference}`);
    if (!ref || !(ref.median > 0) || !(c.median > 0)) continue;
    points.push({ level: c.seniority, group: `${c.company}|${c.family}`, r: c.median / ref.median, n: c.n, nRef: ref.n });
  }
  const byLevel = {};
  for (const p of points) (byLevel[p.level] ||= []).push(p.r);
  for (const [l, rs] of Object.entries(byLevel)) byLevel[l] = { groups: rs.length, q25: round3(quantile(rs, 0.25)), median: round3(quantile(rs, 0.5)), q75: round3(quantile(rs, 0.75)) };
  return { reference, points, byLevel };
}

/**
 * LEVEL_INDEX holds ladder POSITIONS, not multipliers. senioritySim() weights comparables
 * by index distance, which is only right if equal index distances mean similar pay
 * distances, i.e. if the ladder is geometric in pay. So the check reads it as one: each
 * whole step multiplies pay by s, fitted as e^median(ln r / Δindex) over every point;
 * the implied multiplier of level L is s^(index(L) - index(ref)). 'drift' when that
 * multiplier is outside the data's interquartile band for L (>= minGroups pairs), or when
 * two levels' bands contradict the encoded order (the lower-index level's q25 above the
 * higher one's q75).
 */
export function ladderCheck(levelIndex, ratios, { minGroups = BOUNDS.minGroups } = {}) {
  const ref = ratios.reference;
  const out = { reference: ref, step: null, levels: [], contradictions: [], drift: false, checked: 0 };
  if (!levelIndex || levelIndex[ref] == null) return { ...out, error: `reference level ${ref} not in LEVEL_INDEX` };
  const slopes = [];
  for (const p of ratios.points) {
    const d = levelIndex[p.level] - levelIndex[ref];
    if (Number.isFinite(d) && d !== 0 && p.r > 0) slopes.push(Math.log(p.r) / d);
  }
  const beta = quantile(slopes, 0.5);
  if (!(beta > 0)) return { ...out, error: slopes.length ? `fitted step ratio ${beta == null ? '-' : Math.exp(beta).toFixed(3)} is not above 1` : 'no level pairs with n >= minN' };
  out.step = round3(Math.exp(beta));
  for (const [level, idx] of Object.entries(levelIndex)) {
    if (level === ref) continue;
    const band = ratios.byLevel[level];
    const implied = round3(Math.exp(beta * (idx - levelIndex[ref])));
    if (!band || band.groups < minGroups) { out.levels.push({ level, index: idx, implied, band: band || null, status: 'insufficient' }); continue; }
    out.checked++;
    const lo = Math.min(band.q25, band.median * (1 - BOUNDS.minBandHalfWidth));
    const hi = Math.max(band.q75, band.median * (1 + BOUNDS.minBandHalfWidth));
    const outside = implied < lo || implied > hi;
    const dataIndex = round1(levelIndex[ref] + Math.log(band.median) / beta);
    out.levels.push({ level, index: idx, implied, band: { ...band, lo: round3(lo), hi: round3(hi) }, dataIndex, status: outside ? 'outside' : 'inside' });
    if (outside) out.drift = true;
  }
  const lv = out.levels.filter((l) => l.status !== 'insufficient');
  for (const a of lv) for (const b of lv) {
    if (a.index < b.index && a.band.q25 > b.band.q75) { out.contradictions.push({ lower: a.level, higher: b.level, lowerQ25: a.band.q25, higherQ75: b.band.q75 }); out.drift = true; }
  }
  return out;
}

/** Encoded demo-data level multipliers, rebased to the reference level ([{ source, level, multiplier }]). */
export function demoMultipliers(demoDataLevels, icLevels, { reference = 'Mid' } = {}) {
  const out = [];
  if (Array.isArray(demoDataLevels)) {
    const ref = demoDataLevels.find((l) => l[0] === reference);
    if (ref && ref[1] > 0) for (const [level, mult] of demoDataLevels) if (level !== reference) out.push({ source: 'public/features/demo-data.js LEVELS', level, multiplier: round3(mult / ref[1]) });
  }
  if (Array.isArray(icLevels)) {
    const levelOf = (l) => (/^senior/i.test(l.prefix) ? 'Senior' : /^(staff|principal)/i.test(l.prefix) ? 'Staff+' : l.label === 'entry' ? 'Entry' : 'Mid');
    const ref = icLevels.find((l) => levelOf(l) === reference);
    if (ref && ref.mult > 0) for (const l of icLevels) { const lv = levelOf(l); if (lv !== reference) out.push({ source: `server/demo.js IC_LEVELS${l.prefix ? ` "${l.prefix.trim()}"` : ''}`, level: lv, multiplier: round3(l.mult / ref.mult) }); }
  }
  return out;
}

// ---------------------------------------------------------------- backtest

/**
 * Drift bound (percentage points) for a median absolute % error m measured on n jobs:
 * max(3, 3 x SE), SE of a sample median of |error| ~ 1.166 m / sqrt(n) (half-normal errors:
 * median 0.674 sigma, density 0.636 / sigma there, SE = 0.5 / (sqrt(n) f(m))).
 */
export function backtestBound(m, n) {
  if (!Number.isFinite(m) || !(n > 0)) return null;
  return Math.max(BOUNDS.backtestMinPts, round1(BOUNDS.backtestSeK * 1.166 * m / Math.sqrt(n)));
}

/**
 * "±14% (tested on 500 listed salaries)"-style hand-written claims in a text:
 * [{ line, pct, n, text, example }]. A line that says "e.g." / "for example" quotes the
 * format, not a figure, and is reported as an example only.
 */
export function findAccuracyClaims(text) {
  const out = [];
  String(text || '').split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/±\s?(\d+(?:\.\d+)?)\s?%\s*\(tested on ([\d,]+)/g)) {
      out.push({ line: i + 1, pct: Number(m[1]), n: Number(m[2].replace(/,/g, '')), text: l.trim().slice(0, 200), example: /\be\.g\.|\bfor example\b|\bsuch as\b/i.test(l) });
    }
  });
  return out;
}
/**
 * The company whose current backtest supports a claim, or null: the claimed ±N% is within the
 * drift bound of that company's current figure and the claimed n within max(5, 10%) of its n.
 */
export function matchClaim(claim, backtests) {
  for (const [slug, bt] of Object.entries(backtests || {})) {
    if (!bt || bt.medianAbsPctError == null) continue;
    const bound = backtestBound(bt.medianAbsPctError, bt.n) ?? 1;
    if (Math.abs(Math.max(1, bt.medianAbsPctError) - claim.pct) <= bound && Math.abs(bt.n - claim.n) <= Math.max(5, claim.n * 0.1)) return slug;
  }
  return null;
}

/** BACKTEST_OPTS from server/index.js (what the server and the static build publish), with a fallback. */
export function backtestOptions(readText, D) {
  try {
    const v = extractConst(readText('server/index.js'), 'BACKTEST_OPTS');
    if (v && Number.isFinite(v.seed)) return { opts: { ...v }, from: 'server/index.js BACKTEST_OPTS' };
  } catch { /* fall through */ }
  try {
    const v = extractConst(readText('scripts/build-static.js'), 'BACKTEST_FALLBACK');
    if (v && Number.isFinite(v.seed)) return { opts: { ...v }, from: 'scripts/build-static.js BACKTEST_FALLBACK' };
  } catch { /* fall through */ }
  return { opts: { seed: (D && D.BACKTEST_SEED) || 20261002, maxN: 500 }, from: 'default' };
}

// ---------------------------------------------------------------- ledger

/** Health of one ledger at `now`. */
export function ledgerHealth(ledger, now, { pruneDays = 400 } = {}) {
  const nowMs = parseDate(now).getTime();
  const entries = Object.values(ledger.jobs || {});
  const days = new Set();
  let open = 0, closed = 0, reposted = 0, posted = 0, pruneSoon = 0;
  for (const e of entries) {
    if (e.f) days.add(dateOf(e.f));
    if (e.c) { closed++; days.add(dateOf(e.c)); if (nowMs - Date.parse(e.c) > (pruneDays - 30) * DAY) pruneSoon++; } else open++;
    if (e.n) reposted++;
    if (e.p) posted++;
  }
  if (ledger.since) days.add(dateOf(ledger.since));
  if (ledger.lastRunAt) days.add(dateOf(ledger.lastRunAt));
  const obs = [...days].filter(Boolean).sort();
  const last = ledger.lastRunAt ? Date.parse(ledger.lastRunAt) : NaN;
  const spanDays = ledger.since && Number.isFinite(last) ? Math.max(0, (last - Date.parse(ledger.since)) / DAY) : null;
  return {
    since: ledger.since || null, lastRunAt: ledger.lastRunAt || null, runs: ledger.runs || 0,
    ageDays: Number.isFinite(last) ? round1((nowMs - last) / DAY) : null,
    spanDays: round1(spanDays), runsPerDay: spanDays >= 1 ? round1((ledger.runs || 0) / spanDays) : null,
    entries: entries.length, open, closed, reposted, withPostedAt: posted, pruneSoon,
    observationDays: obs, maxGapDays: maxGap(obs, ledger.lastRunAt),
  };
}
/** Largest gap in days between consecutive observation dates in the 60 days up to `until`. */
export function maxGap(dates, until) {
  const end = until ? Date.parse(until) : Date.now();
  const ts = [...new Set(dates)].map((d) => Date.parse(`${d}T00:00:00Z`)).filter((t) => Number.isFinite(t) && t >= end - 60 * DAY).sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < ts.length; i++) gap = Math.max(gap, Math.round((ts[i] - ts[i - 1]) / DAY));
  return gap;
}

// ---------------------------------------------------------------- previous month

/**
 * Newest archived jobs-aggregates version older than `beforeDate`, or null. Layout of the
 * archive (scripts/archive/reference.js): reference/<dataset>/<asOf>.json, a second version
 * with the same asOf as <asOf>~2.json; the file holds the recorded JSON itself.
 */
export function readPreviousAggregate(archiveDir, beforeDate, dataset = AGGREGATES_DATASET) {
  const dir = path.join(archiveDir, 'reference', dataset);
  let files;
  try { files = fs.readdirSync(dir); } catch { return null; }
  const rows = files.map((f) => /^(\d{4}-\d{2}-\d{2})(?:~(\d+))?\.json$/.exec(f)).filter(Boolean)
    .map((m) => ({ file: m[0], date: m[1], rev: Number(m[2] || 1) }))
    .filter((r) => !beforeDate || r.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rev - b.rev));
  for (let i = rows.length - 1; i >= 0; i--) {
    try {
      let doc = JSON.parse(fs.readFileSync(path.join(dir, rows[i].file), 'utf8'));
      for (const k of ['data', 'value', 'json']) if (doc && doc.format !== AGGREGATES_FORMAT && doc[k] != null) doc = typeof doc[k] === 'string' ? JSON.parse(doc[k]) : doc[k];
      if (doc && doc.format === AGGREGATES_FORMAT) return { ...doc, archivedAs: `reference/${dataset}/${rows[i].file}` };
    } catch { /* try the one before */ }
  }
  return null;
}
const prevOf = (prev, slug) => (prev && Array.isArray(prev.companies) ? prev.companies.find((c) => c.slug === slug) || null : null);

// ---------------------------------------------------------------- live site claims

async function fetchSiteJson(ctx, url) {
  try {
    const r = await ctx.fetchJson(url);
    return { ok: true, json: r.json, fetchedAt: r.fetchedAt || ctx.today, url };
  } catch (err) {
    return { ok: false, error: err && err.code === 'FIXTURE_MISSING' ? 'no offline fixture' : String((err && err.message) || err), url };
  }
}
const siteBase = (dirs, channel) => (channel === 'beta' ? `${dirs.site}beta/` : dirs.site);

// ---------------------------------------------------------------- review staleness (policy groups checked here)

/** { due, dueDate, lastReviewed, cadence } for a product-policy group's human review. */
export function reviewDue(entry, id, now) {
  const d = REVIEW_DEFAULTS[id] || {};
  const lastReviewed = (entry && (entry.lastReviewed || (entry.type === 'product-policy' && entry.mode === 'manual' ? entry.asOf : null))) || d.lastReviewed || null;
  const cadence = (entry && entry.reviewCadence) || d.reviewCadence || 'yearly';
  const days = CADENCE_DAYS[cadence];
  if (!lastReviewed || !days) return { due: false, dueDate: null, lastReviewed, cadence };
  const grace = (entry && entry.graceDays) ?? REVIEW_GRACE[cadence] ?? 0;
  const dueDate = isoDate(new Date(parseDate(lastReviewed).getTime() + (days + grace) * DAY));
  return { due: isoDate(now) > dueDate, dueDate, lastReviewed, cadence };
}

// ---------------------------------------------------------------- the check

const finding = (key, encoded, official, unit, note, url = null) => ({ key, encoded, official, unit, url, note });
const evidenceOf = (b, text) => ({ url: b.file || `data/snapshots/${b.slug}.json`, fetchedAt: dateOf(b.fetchedAt), excerpt: excerpt(text, 0, 400) });

/** Run every job-data check. Never throws: a failure becomes 'error' Results. */
export async function check(ctx) {
  const t0 = Date.now();
  let D;
  try { D = await loadDeps(); } catch (err) { return MODULE.ids.map((id) => errorResult(id, 'detect', new Error(`product modules failed to load: ${err.message}`))); }
  let data;
  try { data = await loadJobData(ctx, { D }); } catch (err) { return MODULE.ids.map((id) => errorResult(id, 'detect', err)); }
  const out = [];
  const safe = async (id, fn) => {
    try { const r = await fn(); if (r) out.push(...(Array.isArray(r) ? r : [r])); } catch (err) { out.push(errorResult(id, 'detect', err)); }
  };
  const now = ctx.now || new Date();
  const today = isoDate(now);
  const { boards, dirs } = data;
  const real = boards.filter((b) => b.mode !== 'demo');
  const asOf = real.length ? real.map((b) => dateOf(b.fetchedAt)).filter(Boolean).sort().pop() || null : null;
  const prev = readPreviousAggregate(dirs.archive, asOf || today);
  const prevNote = prev ? `vs ${prev.asOf} (${prev.archivedAs})` : 'no archived previous month (absolute bounds only)';
  const stats = new Map(real.map((b) => [b.slug, companyStats(b, D)]));
  const noData = (id, extra = {}) => result(id, 'detect', 'skipped', { summary: `no job snapshots in ${rel(ctx.root, dirs.stable)} (restore the job-board-snapshots artifact)${data.problems.length ? `; ${data.problems.slice(0, 2).join('; ')}` : ''}`, ...extra });
  const base = { sourceAsOf: asOf };
  const big = (s) => s.jobs >= BOUNDS.minJobs;

  // job-postings: snapshot age, job counts, demo fallbacks
  await safe('job-postings', () => {
    if (!boards.length) return noData('job-postings');
    const findings = [];
    const evidence = [];
    let status = 'ok';
    for (const b of boards) {
      const s = stats.get(b.slug);
      const age = b.fetchedAt ? daysBetween(b.fetchedAt, now) : null;
      const p = prevOf(prev, b.slug);
      if (b.mode === 'demo') { status = worst(status, 'flag'); findings.push(finding(`${b.slug} mode`, 'snapshot', 'demo', '', 'snapshot holds demo data')); continue; }
      if (age == null || age > BOUNDS.snapshotMaxAgeDays) { status = worst(status, 'flag'); findings.push(finding(`${b.slug} snapshot age`, BOUNDS.snapshotMaxAgeDays, age, 'days', `fetchedAt ${b.fetchedAt || '-'}; the daily pipeline should refresh it`)); evidence.push(evidenceOf(b, `fetchedAt ${b.fetchedAt}`)); }
      if (!s.jobs) { status = worst(status, 'flag'); findings.push(finding(`${b.slug} jobs`, p ? p.jobs : null, 0, 'postings', 'empty board')); }
      else if (p && p.jobs >= BOUNDS.minJobs && s.jobs < p.jobs * (1 - BOUNDS.jobsDropShare)) { status = worst(status, 'flag'); findings.push(finding(`${b.slug} jobs`, p.jobs, s.jobs, 'postings', `fell by more than ${BOUNDS.jobsDropShare * 100}% since ${prev.asOf}`)); }
      else findings.push(finding(`${b.slug} jobs`, p ? p.jobs : null, s.jobs, 'postings', p ? `previous ${prev.asOf}` : 'no previous month'));
    }
    const total = real.reduce((a, b) => a + stats.get(b.slug).jobs, 0);
    return result('job-postings', 'detect', status, { ...base, summary: `${boards.length} boards, ${total} postings, newest snapshot ${asOf || '-'}${status === 'ok' ? '' : '; see findings'}; ${prevNote}`, findings, evidence });
  });

  // job-salary-parsed: pay coverage, interval and source mix
  await safe('job-salary-parsed', () => {
    if (!real.length) return noData('job-salary-parsed');
    const findings = [];
    let status = 'ok';
    for (const s of stats.values()) {
      const p = prevOf(prev, s.slug);
      const nonYear = s.salaried - (s.intervals.year || 0);
      if (p && p.jobs >= BOUNDS.minJobs && s.jobs >= BOUNDS.minJobs && p.payShare != null && s.payShare != null && (p.payShare - s.payShare) * 100 > BOUNDS.salariedDropPts) {
        status = 'flag';
        findings.push(finding(`${s.slug} pay share`, pts(p.payShare), pts(s.payShare), '% of postings', `fell more than ${BOUNDS.salariedDropPts} points since ${prev.asOf}: parser or adapter regression?`));
      } else findings.push(finding(`${s.slug} pay share`, p ? pts(p.payShare) : null, pts(s.payShare), '% of postings', `${s.salaried}/${s.jobs} salaried; ${nonYear} non-annual (${Object.entries(s.intervals).map(([k, v]) => `${k} ${v}`).join(', ')}); sources ${Object.entries(s.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`));
    }
    const sal = [...stats.values()].reduce((a, s) => a + s.salaried, 0);
    return result('job-salary-parsed', 'detect', status, { ...base, summary: `${sal} salaried postings after the vetting gate across ${stats.size} companies${status === 'flag' ? '; a pay share fell sharply' : ''}; ${prevNote}`, findings });
  });

  // job-salary-usd: currencies without FX, conversion share, FX as-of used
  await safe('job-salary-usd', () => {
    if (!real.length) return noData('job-salary-usd');
    const findings = [];
    let status = 'ok';
    const fxAge = daysBetween(D.FX_AS_OF, now);
    for (const s of stats.values()) {
      if (s.noFx > BOUNDS.noFxMax) { status = 'flag'; findings.push(finding(`${s.slug} currencies without FX`, 0, s.noFx, 'salaried postings', `${Object.keys(s.noFxCurrencies).join(', ')} not in public/viz/palette.js FX_PER_USD: these postings drop out of market comps and Compstimate`)); }
      findings.push(finding(`${s.slug} converted to USD`, null, s.converted, 'salaried postings', `currencies ${Object.entries(s.currencies).map(([k, v]) => `${k} ${v}`).join(', ')}`));
    }
    findings.push(finding('FX as of (palette.js FX_AS_OF)', null, D.FX_AS_OF, 'date', `${fxAge} days old; refreshed by the fx module (fx-per-usd)`));
    return result('job-salary-usd', 'detect', status, { sourceAsOf: D.FX_AS_OF, summary: `USD midpoints at palette.js FX (as of ${D.FX_AS_OF}, ${fxAge} days)${status === 'flag' ? '; some salaried currencies have no FX rate' : '; every salaried currency has a rate'}`, findings });
  });

  // salary-vetting-flags: quarantine / flag shares per company and tier vs last month
  await safe('salary-vetting-flags', () => {
    if (!real.length) return noData('salary-vetting-flags');
    const findings = [];
    const evidence = [];
    let status = 'ok';
    const tiers = ['critical', 'quarantined', 'statistical', 'review'];
    const why = new Set();
    for (const b of real) {
      const s = stats.get(b.slug);
      const p = prevOf(prev, s.slug);
      if (b.scan.blocking) { status = 'flag'; why.add(`unquarantined critical pay at ${s.slug}`); findings.push(finding(`${s.slug} blocking`, 0, b.scan.blocking, 'postings', 'critical pay that the gate did NOT quarantine: the Pages vetting gate fails on this')); evidence.push(evidenceOf(b, b.scan.blockingIds.join('; '))); }
      if (s.vet.payBearing >= 20 && s.shares.quarantined > BOUNDS.quarantineMaxShare) { status = 'flag'; why.add(`${s.slug} ${pts(s.shares.quarantined)}% quarantined`); findings.push(finding(`${s.slug} quarantined share`, pts(BOUNDS.quarantineMaxShare), pts(s.shares.quarantined), '% of pay-bearing', `${s.vet.quarantined}/${s.vet.payBearing} hidden by the gate; codes ${Object.entries(s.vet.gateCodes).map(([k, v]) => `${k} ${v}`).join(', ')}`)); }
      for (const t of tiers) {
        const now1 = s.shares[t];
        const was = p && p.shares ? p.shares[t] : null;
        const jump = t === 'review' ? BOUNDS.reviewJumpPts : BOUNDS.quarantineJumpPts;
        if (was != null && now1 != null && s.vet.payBearing >= 20 && (now1 - was) * 100 > jump && now1 >= 2 * was) {
          status = 'flag';
          why.add(`${s.slug} ${t} share jumped`);
          findings.push(finding(`${s.slug} ${t} share`, pts(was), pts(now1), '% of pay-bearing', `up more than ${jump} points and at least doubled since ${prev.asOf}`));
        }
      }
      findings.push(finding(`${s.slug} tiers`, null, `critical ${s.vet.critical}, quarantined ${s.vet.quarantined}, statistical ${s.vet.statistical}, review ${s.vet.review} of ${s.vet.payBearing}`, 'postings', `scan codes ${Object.entries(s.vet.codes).sort((a, z) => z[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`));
    }
    const q = [...stats.values()].reduce((a, s) => a + s.vet.quarantined, 0);
    return result('salary-vetting-flags', 'detect', status, { ...base, summary: `${q} quarantined postings; tiers critical / quarantined / statistical / review per company${why.size ? `; ${[...why].join(', ')}` : ''}; ${prevNote}`, findings, evidence });
  });

  // company-registry: every built-in company has a snapshot; the live site lists the same companies
  await safe('company-registry', async () => {
    const findings = [];
    const evidence = [];
    let status = 'ok';
    const reg = D.listCompanies({ channel: 'beta' });
    const have = new Set(boards.map((b) => `${b.channel}|${b.slug}`));
    const betaLoaded = boards.some((b) => b.channel === 'beta');
    for (const c of reg) {
      const ch = c.channel || 'stable';
      if (have.has(`${ch}|${c.slug}`) || (ch === 'beta' && have.has(`stable|${c.slug}`))) continue;
      if (ch === 'stable' && boards.length) { status = worst(status, 'flag'); findings.push(finding(`${c.slug} snapshot`, 'present', 'missing', '', 'built-in stable company with no snapshot (the site shows demo data for it)')); }
      else if (ch === 'beta' && betaLoaded) findings.push(finding(`${c.slug} snapshot`, 'present', 'missing', '', 'beta company with no beta snapshot (dropped from /beta/)'));
    }
    const regSlugs = new Set(reg.map((c) => c.slug));
    for (const b of boards) if (!regSlugs.has(b.slug)) findings.push(finding(`${b.slug} registry`, 'listed', 'not listed', '', `snapshot ${b.file} for a company not in server/companies.js`));
    const live = await fetchSiteJson(ctx, `${dirs.site}api/companies.json`);
    if (live.ok && Array.isArray(live.json)) {
      const liveSlugs = live.json.map((c) => c.slug).sort();
      const stable = reg.filter((c) => (c.channel || 'stable') === 'stable').map((c) => c.slug).sort();
      if (liveSlugs.join() !== stable.join()) { status = worst(status, 'drift'); findings.push(finding('live api/companies.json', stable.join(', '), liveSlugs.join(', '), 'slugs', 'the live site lists other companies than server/companies.js (not rebuilt since the registry changed?)', live.url)); }
      evidence.push({ url: live.url, fetchedAt: live.fetchedAt, excerpt: excerpt(liveSlugs.join(', ')) });
    } else findings.push(finding('live api/companies.json', null, null, '', `not checked: ${live.error}`, live.url));
    if (!boards.length && status === 'ok') status = 'skipped';
    return result('company-registry', 'detect', status, { sourceAsOf: asOf, summary: `${reg.length} built-in companies (${reg.filter((c) => (c.channel || 'stable') === 'stable').length} stable), ${boards.length} snapshots loaded${betaLoaded ? '' : ' (no beta snapshots)'}${status === 'ok' ? '' : '; see findings'}`, findings, evidence });
  });

  // company-aggregates: counts and medians per company vs last month
  await safe('company-aggregates', () => {
    if (!real.length) return noData('company-aggregates');
    const findings = [];
    let status = 'ok';
    for (const s of stats.values()) {
      const p = prevOf(prev, s.slug);
      const was = p && p.usd ? p.usd.p50 : null;
      const move = was > 0 && s.usd.p50 > 0 ? (s.usd.p50 / was - 1) * 100 : null;
      const moved = move != null && Math.abs(move) > BOUNDS.medianMovePct && s.salaried >= BOUNDS.minSalaried;
      if (moved) status = 'flag';
      findings.push(finding(`${s.slug} median USD midpoint`, was, s.usd.p50, 'USD/yr', `${moved ? `moved ${round1(move)}% since ${prev.asOf} (check FX, the parser and the vetting gate before trusting it); ` : ''}n ${s.usd.n}, p25 ${s.usd.p25}, p75 ${s.usd.p75}; ${s.jobs} postings, ${s.salaried} salaried`));
    }
    return result('company-aggregates', 'detect', status, { ...base, summary: `per-company counts and USD medians for ${stats.size} companies${status === 'flag' ? '; a median moved more than ' + BOUNDS.medianMovePct + '%' : ''}; ${prevNote}`, findings });
  });

  // market comps (+ the archive aggregate)
  const stableBoards = real.filter((b) => b.channel === 'stable');
  const betaBoards = real.filter((b) => b.channel === 'beta');
  const payload = (b) => ({ company: { slug: b.slug, name: b.name, color: b.color }, mode: b.mode, fetchedAt: b.fetchedAt, jobs: b.jobs });
  let marketStable = null;
  let marketAll = null;
  try {
    marketStable = stableBoards.length ? D.buildMarket(stableBoards.map(payload), { generatedAt: `${asOf || today}T00:00:00.000Z` }) : null;
    marketAll = betaBoards.length ? D.buildMarket(real.map(payload), { generatedAt: `${asOf || today}T00:00:00.000Z` }) : marketStable;
  } catch (err) { out.push(errorResult('market-comps', 'detect', err)); }

  await safe('market-comps', async () => {
    if (out.some((r) => r.id === 'market-comps')) return null;
    if (!marketStable) return noData('market-comps');
    const findings = [];
    const evidence = [];
    let status = 'ok';
    const sum = summarizeMarket(marketStable);
    const p = prev && prev.market && prev.market.stable ? prev.market.stable.summary : null;
    findings.push(finding('cells (stable site)', p ? p.cells : null, sum.cells, 'cells', `company x family x seniority with n >= ${marketStable.minN}, plus family roll-ups; ${sum.compareFamilies} families comparable across 2+ companies`));
    for (const [channel, docUrl] of [['stable', `${dirs.site}api/market.json`], ...(betaBoards.length ? [['beta', `${dirs.site}beta/api/market.json`]] : [])]) {
      const live = await fetchSiteJson(ctx, docUrl);
      const mine = channel === 'stable' ? marketStable : marketAll;
      if (!live.ok || !live.json || !Array.isArray(live.json.cells)) { findings.push(finding(`live ${channel} market.json`, null, null, '', `not checked: ${live.ok ? 'not a market doc' : live.error}`, docUrl)); continue; }
      const age = daysBetween(live.json.generatedAt, now);
      if (age == null || age > BOUNDS.liveMaxAgeDays) { status = worst(status, 'flag'); findings.push(finding(`live ${channel} market.json generatedAt`, `<= ${BOUNDS.liveMaxAgeDays} days`, live.json.generatedAt || null, '', 'the deployed comps are older than the daily build should leave them', docUrl)); }
      const cmp = compareMarkets(mine, live.json);
      findings.push(finding(`live ${channel} market.json agreement`, live.json.cells.length, mine.cells.length, 'cells', `${cmp.shared} shared cells, ${cmp.within5} with medians within 5%; live minN ${live.json.minN}, FX as of ${live.json.fx && live.json.fx.asOf}`, docUrl));
      evidence.push({ url: docUrl, fetchedAt: live.fetchedAt, excerpt: excerpt(`generatedAt ${live.json.generatedAt}; ${live.json.cells.length} cells; companies ${(live.json.companies || []).map((c) => `${c.slug} ${c.fetchedAt || ''}`).join(', ')}`) });
    }
    return result('market-comps', 'detect', status, { ...base, summary: `buildMarket(): ${sum.cells} cells over ${Object.keys(sum.companies).length} companies and ${sum.families.length} families${status === 'flag' ? '; the live market.json is stale' : ''}`, findings, evidence });
  });

  // Compstimate backtest per company (needed by the aggregate too)
  const bt = {};
  const btSkipped = [];
  const { opts: btOpts, from: btFrom } = backtestOptions(ctx.readText, D);
  for (const b of real) {
    const salaried = stats.get(b.slug).salaried;
    if (salaried > BOUNDS.backtestMaxPool) { btSkipped.push(`${b.slug} (${salaried} salaried > ${BOUNDS.backtestMaxPool})`); continue; }
    if (Date.now() - t0 > BOUNDS.timeBudgetMs) { btSkipped.push(`${b.slug} (time budget)`); continue; }
    try { bt[b.slug] = D.backtest(b.jobs, btOpts); } catch (err) { btSkipped.push(`${b.slug} (${err.message})`); }
  }

  await safe('compstimate-backtest', async () => {
    if (!real.length) return noData('compstimate-backtest');
    const findings = [];
    const evidence = [];
    let status = 'ok';
    const low = D.ACCURACY_LOW_THRESHOLD;
    for (const b of real) {
      const r = bt[b.slug];
      if (!r) continue;
      const bound = backtestBound(r.medianAbsPctError, r.n);
      const live = await fetchSiteJson(ctx, `${siteBase(dirs, b.channel)}api/meta/${b.slug}.json`);
      const claim = live.ok && live.json && live.json.compstimate ? live.json.compstimate : null;
      const p = prevOf(prev, b.slug);
      const was = p && p.backtest ? p.backtest : null;
      const notes = [];
      if (r.medianAbsPctError != null && r.medianAbsPctError > low) { status = worst(status, 'drift'); notes.push(`above the ${low}% threshold: the UI labels this company's estimates "Low confidence"`); }
      if (claim && Number.isFinite(claim.medianAbsPctError) && r.medianAbsPctError != null) {
        const d = Math.abs(r.medianAbsPctError - claim.medianAbsPctError);
        if (d > bound) { status = worst(status, 'drift'); notes.push(`live site shows ±${Math.max(1, Math.round(claim.medianAbsPctError))}% (${claim.medianAbsPctError}, n ${claim.n}, computed ${dateOf(claim.computedAt)}); differs by ${round1(d)} > ${bound} points`); }
        const age = daysBetween(claim.computedAt, now);
        if (age != null && age > BOUNDS.liveMaxAgeDays) { status = worst(status, 'flag'); notes.push(`live figure computed ${age} days ago`); }
        evidence.push({ url: live.url, fetchedAt: live.fetchedAt, excerpt: excerpt(JSON.stringify(claim)) });
      } else notes.push(`live figure not checked (${live.ok ? 'no meta.compstimate' : live.error})`);
      if (was && was.medianAbsPctError != null && r.medianAbsPctError != null && Math.abs(r.medianAbsPctError - was.medianAbsPctError) > bound) {
        status = worst(status, 'drift');
        notes.push(`moved from ${was.medianAbsPctError}% (${prev.asOf}) by more than ${bound} points`);
      }
      findings.push(finding(`${b.slug} median abs % error`, claim ? claim.medianAbsPctError : was ? was.medianAbsPctError : null, r.medianAbsPctError, '%', `n ${r.n}, within ±10% ${r.within10Pct}%, skipped ${r.skipped}; bound ${bound} points; ${notes.join('; ')}`, live.url));
    }
    // Hand-written figures in product docs (process logs are dated history and are not checked).
    for (const f of docFiles(ctx.root)) {
      let text;
      try { text = ctx.readText(f); } catch { continue; }
      for (const c of findAccuracyClaims(text)) {
        const slug = matchClaim(c, bt);
        if (c.example) { findings.push(finding(`${f}:${c.line} example accuracy line`, `±${c.pct}% on ${c.n}`, slug ? `close to ${slug}` : 'illustrative', '', `"${c.text}" (an example of the format, not checked)`)); continue; }
        if (!slug) { status = worst(status, 'drift'); findings.push(finding(`${f}:${c.line} hand-written accuracy`, `±${c.pct}% on ${c.n}`, 'no company matches', '', `"${c.text}": regenerate or reword (current: ${Object.entries(bt).map(([k, v]) => `${k} ${v.medianAbsPctError}%/${v.n}`).join(', ')})`)); }
        else findings.push(finding(`${f}:${c.line} hand-written accuracy`, `±${c.pct}% on ${c.n}`, `matches ${slug}`, '', c.text));
      }
    }
    const done = Object.keys(bt).length;
    return result('compstimate-backtest', 'detect', done ? status : 'skipped', {
      ...base,
      summary: `backtest(${JSON.stringify(btOpts)} from ${btFrom}) on ${done} companies${btSkipped.length ? `; not re-run: ${btSkipped.join(', ')}` : ''}${status === 'drift' ? '; an accuracy figure moved or crossed the threshold' : ''}; ${prevNote}`,
      findings, evidence,
    });
  });

  // Compstimate model: LEVEL_INDEX vs the data's level ratios
  const ratios = marketAll ? levelRatios(marketAll) : null;
  let levelIndex;
  try { levelIndex = extractConst(ctx.readText('public/features/compstimate.js'), 'LEVEL_INDEX'); } catch { levelIndex = undefined; }
  await safe('compstimate-model', () => {
    const id = 'compstimate-model';
    const review = reviewDue(ctx.entry && ctx.entry(id), id, now);
    if (!levelIndex) return result(id, 'detect', 'error', { summary: 'LEVEL_INDEX not found as a literal in public/features/compstimate.js' });
    if (!ratios) return noData(id);
    const lc = ladderCheck(levelIndex, ratios);
    if (lc.error) return result(id, 'detect', 'skipped', { ...base, summary: `LEVEL_INDEX check not possible: ${lc.error}` });
    const findings = lc.levels.map((l) => finding(`LEVEL_INDEX ${l.level} (index ${l.index})`, l.implied, l.band ? `${l.band.lo ?? l.band.q25}..${l.band.hi ?? l.band.q75} (IQR ${l.band.q25}..${l.band.q75}, median ${l.band.median}, ${l.band.groups} pairs)` : null, `x ${lc.reference} pay`,
      l.status === 'insufficient' ? `fewer than ${BOUNDS.minGroups} company x family pairs with n >= minN` : l.status === 'outside' ? `implied multiplier ${l.implied} is outside the data's IQR band; data-implied index ${l.dataIndex}` : `inside the band; data-implied index ${l.dataIndex}`));
    for (const c of lc.contradictions) findings.push(finding(`order ${c.lower} < ${c.higher}`, 'lower pays less', `${c.lower} q25 ${c.lowerQ25} > ${c.higher} q75 ${c.higherQ75}`, '', 'the data contradicts the encoded ladder order'));
    const status = lc.drift ? 'drift' : review.due ? 'stale' : 'ok';
    return result(id, 'detect', status, {
      ...base,
      summary: `LEVEL_INDEX as a geometric ladder, step ${lc.step}x per index point (${ratios.points.length} level/${lc.reference} pairs, ${lc.checked} levels banded): ${lc.drift ? 'outside the data band, review senioritySim (never auto-written)' : 'every banded level inside the IQR band'}${review.due ? `; human review due since ${review.dueDate}` : ''}`,
      findings,
      checklist: [
        'Read the findings: implied multiplier vs the IQR band per level, and any order contradiction.',
        'If a level is outside its band for two months running, propose a new LEVEL_INDEX position (data-implied index in the findings) in public/features/compstimate.js and rerun `node --test test/features.test.js`.',
        'Re-run the backtest (`node scripts/refresh/run.js --only compstimate-backtest --dry-run`) before and after; keep the change only if the median abs error does not get worse on most companies.',
        'Review the other Compstimate thresholds (MIN_WEIGHT 0.02, REL_WEIGHT 0.12, LOW_P/HIGH_P 0.15/0.85, confidence cut-offs, ACCURACY_LOW_THRESHOLD 25, MIN_COMPARABLES 3) with docs/process/compstimate-taskforce.md, then set lastReviewed in data/freshness.json.',
      ],
    });
  });

  // seniority ladder: Mid-by-default share, unread level tokens, ladder order consistency, demo multipliers
  await safe('seniority-ladder', () => {
    const id = 'seniority-ladder';
    const review = reviewDue(ctx.entry && ctx.entry(id), id, now);
    const findings = [];
    let status = 'ok';
    const lists = [['public/features/roles.js SENIORITY_LADDER', D.SENIORITY_LADDER]];
    for (const [file, name] of [['public/app.js', 'SENIORITY_ORDER'], ['public/viz/chart.js', 'SENIORITY_ORDER']]) {
      try { const v = extractConst(ctx.readText(file), name); if (Array.isArray(v)) lists.push([`${file} ${name}`, v.filter((x) => x !== 'Unspecified')]); } catch { /* optional */ }
    }
    const ref = lists[0][1].join(' < ');
    for (const [where, v] of lists.slice(1)) if (v.join(' < ') !== ref) { status = 'drift'; findings.push(finding(`${where} order`, ref, v.join(' < '), '', 'display ladders disagree')); }
    if (levelIndex) {
      const byIndex = Object.entries(levelIndex).sort((a, b) => a[1] - b[1]).map(([k]) => k).join(' < ');
      if (byIndex !== ref) findings.push(finding('compstimate.js LEVEL_INDEX order', ref, byIndex, '', 'pay ladder vs display ladder (Manager placement): intentional per compstimate.js, informational'));
    }
    if (real.length) {
      const pooled = pooledMidDefault([...stats.values()]);
      const wasPooled = prev && prev.pooled ? prev.pooled.midDefaultShare : null;
      const overPooled = pooled.share != null && pooled.share > BOUNDS.midDefaultPooledMax;
      const rosePooled = wasPooled != null && pooled.share != null && (pooled.share - wasPooled) * 100 > BOUNDS.midDefaultPooledRisePts;
      if (overPooled || rosePooled) status = worst(status, 'drift');
      findings.push(finding('postings whose level is a default ("Mid", no level word in the title)', wasPooled != null ? pts(wasPooled) : `<= ${pts(BOUNDS.midDefaultPooledMax)}`, pts(pooled.share), '% of postings (stable boards)',
        `${pooled.midDefault}/${pooled.jobs}${overPooled ? `: default "Mid" now outnumbers every explicitly levelled posting combined, so market-comps Mid cells and Compstimate's Mid weighting are mostly defaults` : ''}${rosePooled ? `; up more than ${BOUNDS.midDefaultPooledRisePts} points since ${prev.asOf}` : ''}; see docs/process/freshness-jobs.md §3 (seniority default)`));
      for (const s of stats.values()) {
        const p = prevOf(prev, s.slug);
        const was = p && p.shares ? p.shares.midDefault : null;
        if (big(s) && was != null && (s.shares.midDefault - was) * 100 > BOUNDS.midDefaultRisePts) { status = worst(status, 'drift'); findings.push(finding(`${s.slug} Mid by default`, pts(was), pts(s.shares.midDefault), '% of postings', `titles with no level word up more than ${BOUNDS.midDefaultRisePts} points since ${prev.asOf}: a new title convention?`)); }
        if (big(s) && s.shares.levelTokens > BOUNDS.levelTokenMaxShare && s.levelTokens >= 3) { status = worst(status, 'drift'); findings.push(finding(`${s.slug} unread level tokens`, pts(BOUNDS.levelTokenMaxShare), pts(s.shares.levelTokens), '% of postings', `"Mid" by default although the title carries a level token, e.g. ${s.levelTokenExamples.map((t) => `"${t}"`).join(', ')}: extend server/keywords.js inferSeniority`)); }
        findings.push(finding(`${s.slug} seniority mix`, null, Object.entries(s.seniority).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '), 'postings', `${pts(s.shares.midDefault)}% Mid by default`));
      }
      if (ratios) {
        for (const d of demoMultipliers(safeConst(ctx, 'public/features/demo-data.js', 'LEVELS'), safeConst(ctx, 'server/demo.js', 'IC_LEVELS'))) {
          const band = ratios.byLevel[d.level];
          if (!band || band.groups < BOUNDS.minGroups) continue;
          const lo = round3(Math.min(band.q25, band.median * (1 - BOUNDS.minBandHalfWidth)));
          const hi = round3(Math.max(band.q75, band.median * (1 + BOUNDS.minBandHalfWidth)));
          const inside = d.multiplier >= lo && d.multiplier <= hi;
          findings.push(finding(`${d.source} ${d.level}`, d.multiplier, `${lo}..${hi}`, 'x Mid pay', `${inside ? 'inside' : 'OUTSIDE'} the real data's IQR band (demo data is synthetic and labelled; registry id demo-data); informational`));
        }
      }
    }
    if (!real.length && status === 'ok') status = 'skipped';
    if (status === 'ok' && review.due) status = 'stale';
    return result(id, 'detect', status, {
      ...base,
      summary: `seniority lexicon (server/keywords.js inferSeniority) and ladders${status === 'drift' ? ': drift, see findings' : status === 'skipped' ? ': no snapshots, data checks not run' : ': consistent'}${review.due ? `; human review due since ${review.dueDate}` : ''}; ${prevNote}`,
      findings,
      checklist: [
        'For an "unread level tokens" finding: add the notation (e.g. L5, IC4) to inferSeniority in server/keywords.js with a test in test/keywords.test.js; snapshots pick it up on the next daily run.',
        'For a "Mid by default" jump: sample 20 such titles of that company (data/snapshots/<slug>.json) and check whether a level word is being missed.',
        'Keep SENIORITY_LADDER (roles.js), SENIORITY_ORDER (app.js, chart.js) identical.',
        'Yearly: re-run the level-check replay of docs/process/ladder-brainstorm.md §4 and update docs/strategy/CORPORATE_LADDER_PLAN.md figures if the plan is still live; then set lastReviewed.',
      ],
    });
  });

  // role families: unknown share per company; label / title tables cover every family
  await safe('role-families', () => {
    const id = 'role-families';
    const review = reviewDue(ctx.entry && ctx.entry(id), id, now);
    const findings = [];
    let status = 'ok';
    const ids = new Set(Object.keys(D.FAMILY_LABELS || {}));
    const missingTitles = [...ids].filter((f) => !(D.FAMILY_TITLES && D.FAMILY_TITLES[f]));
    if (missingTitles.length) { status = 'drift'; findings.push(finding('compstimate.js FAMILY_TITLES', 'every FAMILY_LABELS id', `missing ${missingTitles.join(', ')}`, '', 'a family filter has no representative title')); }
    for (const s of stats.values()) {
      for (const f of Object.keys(s.families)) if (!ids.has(f)) { status = 'drift'; findings.push(finding(`family ${f}`, 'in FAMILY_LABELS', 'unlabelled', '', `roleFamily returned ${f} with no display label`)); }
      const p = prevOf(prev, s.slug);
      const was = p && p.shares ? p.shares.familyUnknown : null;
      const over = big(s) && s.shares.familyUnknown > BOUNDS.familyUnknownMaxShare;
      const rose = big(s) && was != null && (s.shares.familyUnknown - was) * 100 > BOUNDS.familyUnknownRisePts && s.familyUnknown >= 3;
      if (over || rose) status = 'drift';
      findings.push(finding(`${s.slug} no role family`, was != null ? pts(was) : pts(BOUNDS.familyUnknownMaxShare), pts(s.shares.familyUnknown), '% of postings',
        `${s.familyUnknown}/${s.jobs}${over ? ` above ${pts(BOUNDS.familyUnknownMaxShare)}%` : ''}${rose ? ` up more than ${BOUNDS.familyUnknownRisePts} point(s) since ${prev.asOf}` : ''}${s.familyUnknownExamples.length ? `; e.g. ${s.familyUnknownExamples.slice(0, 3).map((t) => `"${t}"`).join(', ')}` : ''}`));
    }
    if (!real.length && status === 'ok') status = 'skipped';
    if (status === 'ok' && review.due) status = 'stale';
    return result(id, 'detect', status, {
      ...base,
      summary: `role-family lexicon (public/features/roles.js) coverage${status === 'drift' ? ': drift, see findings' : status === 'skipped' ? ': no snapshots' : ': every company under the bound'}${review.due ? `; human review due since ${review.dueDate}` : ''}; ${prevNote}`,
      findings,
      checklist: [
        'For postings with no family: add the role words to FAMILIES / DEPT_HINTS in public/features/roles.js, most specific family first, with a test in test/features.test.js.',
        'Postings without a family are left out of market comps, "Same role elsewhere" and the Compare card.',
        'Yearly: repeat the 100-title hand check of docs/process/product.md ("Role-family hand check", fresh seed, >= 90% correct) with docs/process/scripts/product-family-check.mjs; then set lastReviewed.',
      ],
    });
  });

  // keyword lexicons: postings with no skill / responsibility / fit keyword
  await safe('keyword-lexicons', () => {
    const id = 'keyword-lexicons';
    const review = reviewDue(ctx.entry && ctx.entry(id), id, now);
    if (!real.length) return noData(id);
    const findings = [];
    let status = 'ok';
    for (const b of real) {
      const s = stats.get(b.slug);
      const p = prevOf(prev, s.slug);
      const was = p && p.shares ? p.shares.noSkills : null;
      const over = big(s) && s.shares.noSkills > BOUNDS.skillsNoneMaxShare;
      const rose = big(s) && was != null && (s.shares.noSkills - was) * 100 > BOUNDS.skillsNoneRisePts;
      if (over || rose) status = 'drift';
      findings.push(finding(`${s.slug} no skill keyword`, was != null ? pts(was) : pts(BOUNDS.skillsNoneMaxShare), pts(s.shares.noSkills), '% of postings',
        `${s.keywords.noSkills}/${s.jobs} no skill, ${s.keywords.noResponsibilities} no responsibility, ${s.keywords.noFit} no fit keyword${b.upgraded ? ' (keywords re-derived: older snapshot)' : ''}${over ? '; above the bound' : ''}${rose ? `; up since ${prev.asOf}` : ''}`));
    }
    if (status === 'ok' && review.due) status = 'stale';
    return result(id, 'detect', status, {
      ...base,
      summary: `skill / responsibility / fit lexicons (server/keywords.js) coverage${status === 'drift' ? ': drift, see findings' : ': under the bounds'}${review.due ? `; human review due since ${review.dueDate}` : ''}; ${prevNote}`,
      findings,
      checklist: [
        'For a drop in coverage: sample postings of that company with no skill keyword and add missing terms to SKILL_LEXICON in server/keywords.js (test/keywords.test.js).',
        'Yearly: re-run docs/process/scripts/lexicon-report.mjs and review the lexicon against current postings; then set lastReviewed.',
      ],
    });
  });

  // history ledger health
  await safe('history-ledger', () => {
    const all = [...Object.entries(data.ledgers.stable).map(([k, l]) => ['stable', k, l]), ...Object.entries(data.ledgers.beta).map(([k, l]) => ['beta', k, l])];
    if (!all.length) return result('history-ledger', 'detect', 'skipped', { summary: `no ledgers in ${rel(ctx.root, dirs.history)} (restore the history-ledger artifact or the data-history branch)` });
    const findings = [];
    let status = 'ok';
    const pooled = [];
    let newest = null;
    for (const [ch, slug, l] of all) {
      const h = ledgerHealth(l, now, { pruneDays: D.PRUNE_CLOSED_DAYS });
      pooled.push(...h.observationDays);
      if (h.lastRunAt && (!newest || h.lastRunAt > newest)) newest = h.lastRunAt;
      const notes = [];
      if (h.ageDays == null || h.ageDays > BOUNDS.ledgerMaxAgeDays) { status = 'flag'; notes.push(`last run ${h.lastRunAt || '-'} is ${h.ageDays} days old`); }
      if (h.spanDays >= 7 && h.runsPerDay != null && h.runsPerDay < BOUNDS.ledgerMinRunsPerDay) { status = 'flag'; notes.push(`${h.runsPerDay} runs/day since ${dateOf(h.since)}: daily runs are being missed`); }
      if (h.pruneSoon) notes.push(`${h.pruneSoon} closed entries reach PRUNE_CLOSED_DAYS within 30 days (the archive keeps them)`);
      findings.push(finding(`${ch}/${slug} ledger`, null, `${h.entries} entries (${h.open} open, ${h.closed} closed, ${h.reposted} reposts), ${h.runs} runs since ${dateOf(h.since)}`, '', `last run ${h.lastRunAt || '-'}; max gap ${h.maxGapDays} days; ${notes.join('; ') || 'healthy'}`));
    }
    const gap = maxGap(pooled, newest);
    if (gap > BOUNDS.ledgerMaxGapDays) { status = 'flag'; findings.unshift(finding('pipeline gap', `<= ${BOUNDS.ledgerMaxGapDays}`, gap, 'days', 'no ledger recorded anything new for this long across every company: the daily pipeline likely did not run')); }
    return result('history-ledger', 'detect', status, { sourceAsOf: dateOf(newest), summary: `${all.length} ledgers, newest run ${newest || '-'}, max pooled gap ${gap} days${status === 'flag' ? '; see findings' : ''}`, findings });
  });

  // job-juice: share of salaried postings with a Juice Score
  await safe('job-juice', () => {
    if (!real.length) return noData('job-juice');
    if (!data.cities) return result('job-juice', 'detect', 'error', { summary: `data/cities.json unreadable: ${data.problems.join('; ')}` });
    const findings = [];
    let status = 'ok';
    for (const s of stats.values()) {
      const p = prevOf(prev, s.slug);
      const was = p && p.juice ? p.juice.coverage : null;
      const drop = was != null && s.juice.coverage != null && (was - s.juice.coverage) * 100 > BOUNDS.juiceCoverageDropPts;
      const lowCov = s.salaried >= BOUNDS.minSalaried && s.juice.coverage != null && s.juice.coverage < BOUNDS.juiceCoverageMin;
      if ((drop && s.salaried >= BOUNDS.minSalaried) || lowCov) status = 'drift';
      findings.push(finding(`${s.slug} Juice coverage`, was != null ? pts(was) : null, pts(s.juice.coverage), '% of salaried',
        `${s.juice.scored}/${s.salaried} scored, median score ${s.juice.score.p50}; top unscored locations ${s.juice.unmatched.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}${drop ? `; fell more than ${BOUNDS.juiceCoverageDropPts} points since ${prev.asOf}` : ''}${lowCov ? '; under half: add these cities to data/cities.json' : ''}`));
    }
    return result('job-juice', 'detect', status, { ...base, summary: `Juice Score coverage of salaried postings per company${status === 'drift' ? ': coverage fell or is low, see findings' : ''}; ${prevNote}`, findings });
  });

  // jobs-aggregates: the monthly dated aggregate for the archive
  await safe('jobs-aggregates', () => {
    if (!real.length) return noData('jobs-aggregates');
    const agg = buildAggregate({ asOf, today, boards: real, stats, marketStable, marketAll, bt, btOpts, ratios, data, D, levelIndex });
    const json = jsonText(agg);
    return result('jobs-aggregates', 'detect', 'ok', {
      ...base,
      summary: `monthly aggregate as of ${asOf}: ${agg.companies.length} companies, ${agg.market.stable ? agg.market.stable.cells.length : 0} market cells, ${agg.families.length} families, ${Object.keys(agg.backtest).length} backtests (${Math.round(json.length / 1024)} KB) for the archive`,
      archive: { dataset: AGGREGATES_DATASET, asOf, json },
    });
  });

  // one Result per id, in MODULE order
  const byId = new Map(out.map((r) => [r.id, r]));
  return MODULE.ids.map((id) => byId.get(id) || result(id, 'detect', 'error', { summary: 'no result produced' }));
}

function safeConst(ctx, file, name) {
  try { return extractConst(ctx.readText(file), name); } catch { return undefined; }
}

/** Pooled share of postings whose level is the "Mid" default (stable boards; beta reported per company only). */
export function pooledMidDefault(statsList) {
  const st = statsList.filter((s) => s.channel !== 'beta');
  const jobs = st.reduce((a, s) => a + s.jobs, 0);
  const midDefault = st.reduce((a, s) => a + s.midDefault, 0);
  return { jobs, midDefault, share: jobs ? Math.round((midDefault / jobs) * 1000) / 1000 : null };
}

/**
 * Product docs scanned for hand-written accuracy figures. Dated process logs (docs/process/)
 * are history, not claims; docs/DATA_FRESHNESS.md is generated from the registry and only
 * quotes the others.
 */
export const DOC_SKIP = Object.freeze(['docs/DATA_FRESHNESS.md']);
export function docFiles(root) {
  const out = ['README.md'];
  try { for (const f of fs.readdirSync(path.join(root, 'docs')).sort()) if (f.endsWith('.md') && !DOC_SKIP.includes(`docs/${f}`)) out.push(`docs/${f}`); } catch { /* none */ }
  return out;
}

/** Cells of two market docs compared: { shared, within5 }. */
export function compareMarkets(a, b) {
  const key = (c) => `${c.company}|${c.family}|${c.seniority}`;
  const mb = new Map(cellObjects(b).map((c) => [key(c), c]));
  let shared = 0, within5 = 0;
  for (const c of cellObjects(a)) {
    const o = mb.get(key(c));
    if (!o) continue;
    shared++;
    if (o.median > 0 && Math.abs(c.median / o.median - 1) <= 0.05) within5++;
  }
  return { shared, within5 };
}

/** The archive document (format melon-jobs-aggregates-1; docs/process/freshness-jobs.md §3). */
export function buildAggregate({ asOf, today, boards, stats, marketStable, marketAll, bt, btOpts, ratios, data, D, levelIndex }) {
  const marketPart = (doc) => (doc ? { format: doc.format, minN: doc.minN, fx: doc.fx, columns: doc.columns, cells: doc.cells, companies: doc.companies, summary: summarizeMarket(doc) } : null);
  const strip = (s) => {
    const { familyUnknownExamples, levelTokenExamples, ...rest } = s;
    return rest;
  };
  const ledgers = {};
  for (const ch of ['stable', 'beta']) for (const [slug, l] of Object.entries(data.ledgers[ch] || {})) {
    const { observationDays, ...h } = ledgerHealth(l, `${asOf}T23:59:59Z`, { pruneDays: D.PRUNE_CLOSED_DAYS });
    ledgers[`${ch}/${slug}`] = h;
  }
  return {
    format: AGGREGATES_FORMAT,
    dataset: AGGREGATES_DATASET,
    asOf,
    generatedAt: today,
    basis: 'vetted posted base pay ranges; USD midpoints at public/viz/palette.js FX',
    inputs: {
      snapshots: boards.map((b) => ({ slug: b.slug, channel: b.channel, fetchedAt: b.fetchedAt, normalizerVersion: b.normalizerVersion, upgraded: !!b.upgraded, jobs: b.jobs.length, ledger: !!b.hasLedger })),
      fx: { asOf: D.FX_AS_OF },
      market: { minN: D.MIN_N },
      backtest: btOpts,
      levelIndex: levelIndex || null,
      cities: data.cities ? { cities: Array.isArray(data.cities.cities) ? data.cities.cities.length : null } : null,
    },
    companies: [...stats.values()].map(strip).map((s) => ({ ...s, backtest: bt[s.slug] || null })),
    families: familyDistributions(boards, D),
    market: { stable: marketPart(marketStable), all: marketAll && marketAll !== marketStable ? marketPart(marketAll) : null },
    levels: ratios ? { reference: ratios.reference, byLevel: ratios.byLevel, pairs: ratios.points.length } : null,
    pooled: (() => { const p = pooledMidDefault([...stats.values()]); return { jobs: p.jobs, midDefault: p.midDefault, midDefaultShare: p.share }; })(),
    backtest: bt,
    ledgers,
  };
}

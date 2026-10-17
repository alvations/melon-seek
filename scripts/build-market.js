#!/usr/bin/env node
// Market comps (F1, docs/strategy/ROADMAP.md §6.2 Top 1, §7.1 F1).
//
// buildMarket(payloads) -> marketDoc   (pure; used by the server's GET /api/market
// and by scripts/build-static.js for dist/api/market.json)
//
//   payloads: [{ company: {slug, name, color?}, mode, fetchedAt?, jobs }] whose jobs
//             already went through vetSalaries (quarantined pay has salary === null).
//
// marketDoc (format "melon-market-1", <= 150 KB for the built-ins):
//   {
//     format, basis: "posted base pay ranges", currency: "USD",
//     stat: "midpoint of each posted range, annualized, in USD",
//     fx: { asOf, source }, generatedAt, minN: 3, mode: "real"|"demo",
//     companies: [{ slug, name, color, mode, fetchedAt, jobs, salaried, used, ...,
//                   country: "US", countries: { US: 1180, IE: 52 } }],
//     families: ["ml", "swe", ...],
//     columns: ["company", "family", "seniority", "n", "p25", "median", "p75"],
//     cells: [["anthropic", "ml", "Senior", 41, 320000, 365000, 405000], ...],
//     oteCells: [...same columns, on-target earnings only...],
//     counts: [["xai", "design", "Senior", 2], ...],   // groups below minN: count only, no pay
//     countryMinN: 10,
//     countries: [{ code: "US", companies: 13, n: 11841 }, ...],          // most postings first
//     byCountry: { IE: { cells: [...], oteCells: [...], counts: [...] }, ... }
//   }
// A cell is one company x role family x seniority bucket with n >= minN; a
// family-only roll-up uses seniority "*" (the drawer's fallback). Amounts are
// rounded to $100. Demo payloads are only used when no company has real data,
// and the doc then says mode: "demo".
//
// One country per cell (fix wave 3, BP-3, shared decision 2: comparisons stay within one country).
// Every posting counts in the country its pay is for, payCountry(job) (public/features/shared.js).
// - `cells`, `oteCells` and `counts` hold each company's home country: companies[].country, the
//   country with most of its salaried postings (Cohere: Canada). Their columns are unchanged.
// - `byCountry[code]` holds the same three arrays for every other country where the company has
//   countryMinN (10) or more salaried postings (Google: Ireland, Canada, Poland, Germany, ...).
//   Fewer postings in a country add nothing: too few to compare, and market.json keeps its cap.
// - companies[].countries counts the salaried postings used per country it keeps; `countries`
//   sums them. A (company, country) pair's cells appear exactly once, so nothing is duplicated.
// Before this, a cell pooled every country a company posts in (Google's entry software median of
// $89K was mostly Warsaw and Malaga pay); readers now filter by country (public/features/comps.js).
//
// Like with like (persona review 2026-10-10, docs/process/fix-estimates.md, P-1 and P-10):
// - On-target earnings (salary.kind 'ote': base plus commission at target) never enter `cells`;
//   they get their own `oteCells`, compared only with each other.
// - Internships and fixed-term programmes (isInternLike) count only in the "Intern" bucket, never
//   in the "*" roll-up, which is therefore "all full-time levels".
// - "Mid" is the stored level: mostly the default for titles that state no level, plus the rungs
//   that mean mid level (Google "III", Netflix "L4"). Its cells stay (no data change), and readers
//   never treat them as a level match (public/features/comps.js).
// - "Mid-level" (MID_STATED, roles.js levelKey) is the stated mid level only: a full-time posting
//   whose displayLevel() is 'Mid' (seniorityBasis 'title' or 'pay'). It is a level match (fix wave 3,
//   BP-7: 554 postings with a "Mid" badge were told they "don't state a level").
// - `counts` lists the groups below minN (company, family, level, n) with no pay figures, so a
//   reader can say "fewer than 3 salaried postings" instead of leaving a company out silently.
// - MR-28 (fix-data-3, docs/process/methodology-review-beta-2.md): three kinds of posted figure are not a
//   posted base-pay range, so they enter no cell (base pay, on-target earnings or Intern) and are counted on
//   the company's entry instead: a stated minimum (salary.kind 'minimum', Amazon's "See below the minimum
//   gross base salary": `minimum`), an hourly figure that includes the highest shift differential
//   (salary.includesShiftDifferential: `shiftPay`), and part-time hourly pay annualized at 2,080 hours
//   (salary.partTime: `partTime`). The postings and their pay are untouched; only the comparison leaves
//   them out. A posting in more than one of these counts once, in that order (notBasePay).
//
// CLI: node scripts/build-market.js [--out file] [--snapshots dir]
//      (default: data/snapshots/*.json -> stdout)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { roleFamily } from '../public/features/compstimate.js';
import { displayLevel, levelKey } from '../public/features/roles.js';
import { isOTE, isInternLike, payCountry, notBasePay } from '../public/features/shared.js';
import { toUSD, FX_AS_OF, hasFx } from '../public/viz/palette.js';

export const MARKET_FORMAT = 'melon-market-1';
export const MIN_N = 3;
/** Salaried postings a company needs in a country, other than its home country, for cells there. */
export const COUNTRY_MIN_N = 10;
/** The seniority bucket of a stated mid level (levelKey('Mid')); 'Mid' stays the stored level. */
export const MID_STATED = levelKey('Mid');
export const BASIS = 'posted base pay ranges';
export const OTE_BASIS = 'posted on-target earnings ranges (base plus commission at target)';
export const COLUMNS = Object.freeze(['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75']);
const REAL_MODES = new Set(['live', 'cache', 'snapshot']);

/** Linear-interpolation percentile (p in 0..1) of a sorted array. */
export function percentileSorted(sorted, p) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

const round100 = (n) => Math.round(n / 100) * 100;

/** USD annual midpoint of a vetted job salary, or null. */
export function usdMid(salary) {
  if (!salary || typeof salary !== 'object') return null;
  const cur = String(salary.currency || 'USD').toUpperCase();
  if (!hasFx(cur)) return null;
  const mid = Number.isFinite(salary.mid) ? salary.mid : (Number(salary.min) + Number(salary.max)) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return null;
  const usd = toUSD(mid, cur);
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

/**
 * MR-28: why a posted figure is not a posted base-pay range, or null when it is one: 'minimum' (a stated
 * minimum, "from €46K"), 'shiftPay' (hourly pay including the highest shift differential) or 'partTime'
 * (part-time hourly pay at 2,080 hours). Pure; reads only job.salary.
 */
// fix-viz-5: one rule for the market cells and every median the browser draws (public/features/shared.js).
export { notBasePay };
export const NOT_BASE_KINDS = Object.freeze(['minimum', 'shiftPay', 'partTime']);

/** The home country: most salaried postings, then the US, then the alphabet. */
function homeCountry(byCountry) {
  return [...byCountry].sort((a, b) => b[1] - a[1] || (a[0] === 'US' ? -1 : b[0] === 'US' ? 1 : 0) || (a[0] < b[0] ? -1 : 1))[0]?.[0] || null;
}

/**
 * One company's part of the market doc: its companies[] entry, its home-country arrays and its
 * other countries' arrays. buildMarket and mergeMarkets both assemble these, so building the
 * companies one at a time (the server, PERF-1) gives the same doc as building them together.
 */
function companyPart(p, minN) {
  const slug = p.company.slug;
  let salaried = 0;
  let used = 0;
  let ote = 0, internLike = 0, fullTime = 0, levelled = 0;
  const notBase = { minimum: 0, shiftPay: 0, partTime: 0 }; // MR-28: posted, shown, compared with nothing
  const groups = new Map(); // "country|family|seniority" -> number[] (base pay)
  const oteGroups = new Map(); // the same for on-target earnings
  const perCountry = new Map(); // country -> salaried postings used
  const add = (map, key, v) => { let a = map.get(key); if (!a) map.set(key, (a = [])); a.push(v); };
  for (const job of p.jobs) {
    if (!job || !job.salary) continue; // quarantined or no pay: excluded
    salaried++;
    const usd = usdMid(job.salary);
    if (usd == null) continue;
    let family = null;
    try { family = roleFamily(job.title || '', job); } catch { family = null; } // job as ctx: department hints
    if (!family) continue;
    const country = payCountry(job);
    if (!country) continue; // pay for no known country is compared with nothing
    const nb = notBasePay(job);
    if (nb) { notBase[nb]++; continue; } // MR-28: a minimum, shift-inclusive or part-time hourly figure is not base pay
    const intern = isInternLike(job);
    const target = isOTE(job) ? oteGroups : groups;
    // Interns and fixed-term pay only in "Intern"; "*" = every full-time level.
    const seniority = intern ? 'Intern' : job.seniority || 'Mid';
    add(target, `${country}|${family}|${seniority}`, usd);
    if (!intern && displayLevel(job) === 'Mid') add(target, `${country}|${family}|${MID_STATED}`, usd);
    if (!intern) add(target, `${country}|${family}|*`, usd);
    perCountry.set(country, (perCountry.get(country) || 0) + 1);
    used++;
    if (target === oteGroups) ote++;
    else if (intern) internLike++;
    else { fullTime++; if (seniority !== 'Mid') levelled++; }
  }
  const home = homeCountry(perCountry);
  const kept = new Set([...perCountry].filter(([c, n]) => c === home || n >= COUNTRY_MIN_N).map(([c]) => c));
  const empty = () => ({ cells: [], oteCells: [], counts: [] });
  const byCountry = new Map();
  const at = (c) => { let o = byCountry.get(c); if (!o) byCountry.set(c, (o = empty())); return o; };
  const emit = (map, arr, withCounts) => {
    for (const [key, values] of map) {
      const [country, family, seniority] = key.split('|');
      if (!kept.has(country)) continue;
      if (values.length < minN) { if (withCounts) at(country).counts.push([slug, family, seniority, values.length]); continue; }
      values.sort((a, b) => a - b);
      at(country)[arr].push([slug, family, seniority, values.length,
        round100(percentileSorted(values, 0.25)), round100(percentileSorted(values, 0.5)), round100(percentileSorted(values, 0.75))]);
    }
  };
  emit(groups, 'cells', true);
  emit(oteGroups, 'oteCells', false);
  const countries = Object.fromEntries([...perCountry].filter(([c]) => kept.has(c)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  return {
    company: {
      slug, name: p.company.name || slug, color: p.company.color || null,
      mode: p.mode || null, fetchedAt: p.fetchedAt || null,
      jobs: p.jobs.length, salaried, used,
      // used = ote + internLike + fullTime; levelled = full-time base postings that state a level
      ote, internLike, fullTime, levelled,
      // MR-28: salaried postings left out of every cell because the figure is not a posted base-pay range
      ...notBase,
      country: home, countries,
    },
    home: byCountry.get(home) || empty(),
    others: [...byCountry].filter(([c]) => c !== home),
  };
}

/** The market doc from company parts (both buildMarket and mergeMarkets end here). */
function assemble(parts, { minN, generatedAt, mode }) {
  const cells = [], oteCells = [], counts = [];
  const by = new Map();
  for (const part of parts) {
    cells.push(...part.home.cells); oteCells.push(...part.home.oteCells); counts.push(...part.home.counts);
    for (const [c, arrs] of part.others) {
      let o = by.get(c);
      if (!o) by.set(c, (o = { cells: [], oteCells: [], counts: [] }));
      o.cells.push(...arrs.cells); o.oteCells.push(...arrs.oteCells); o.counts.push(...arrs.counts);
    }
  }
  for (const a of [cells, oteCells, counts]) a.sort(cellOrder);
  const byCountry = {};
  for (const c of [...by.keys()].sort()) { const o = by.get(c); for (const a of Object.values(o)) a.sort(cellOrder); byCountry[c] = o; }
  const companies = parts.map((p) => p.company);
  const tally = new Map();
  for (const co of companies) {
    for (const [c, n] of Object.entries(co.countries || {})) { const t = tally.get(c) || { code: c, companies: 0, n: 0 }; t.companies++; t.n += n; tally.set(c, t); }
  }
  const allCells = [...cells, ...Object.values(byCountry).flatMap((o) => o.cells)];
  return {
    format: MARKET_FORMAT,
    basis: BASIS,
    currency: 'USD',
    stat: 'midpoint of each posted range, annualized, in USD',
    fx: { asOf: FX_AS_OF, source: 'public/viz/palette.js FX_PER_USD' },
    generatedAt,
    minN,
    mode,
    companies,
    families: [...new Set(allCells.map((c) => c[1]))].sort(),
    columns: [...COLUMNS],
    cells,
    oteBasis: OTE_BASIS,
    oteCells,
    counts,
    countryMinN: COUNTRY_MIN_N,
    countries: [...tally.values()].sort((a, b) => b.n - a.n || (a.code < b.code ? -1 : 1)),
    byCountry,
  };
}

export function buildMarket(payloads, { minN = MIN_N, generatedAt = new Date().toISOString() } = {}) {
  const list = (payloads || []).filter((p) => p && p.company && p.company.slug && Array.isArray(p.jobs));
  const real = list.filter((p) => REAL_MODES.has(p.mode));
  const use = real.length ? real : list;
  return assemble(use.map((p) => companyPart(p, minN)), { minN, generatedAt, mode: real.length ? 'real' : 'demo' });
}

/** Cell order: family, then seniority, then company (deterministic output). */
function cellOrder(a, b) {
  return (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}

/**
 * Merge per-company docs (each from buildMarket([payload])) into the doc that
 * buildMarket(allPayloads) returns. Lets the server build one company per
 * event-loop turn (PERF-1 / review V15) and reuse unchanged companies.
 */
export function mergeMarkets(docs, { minN = MIN_N, generatedAt = new Date().toISOString() } = {}) {
  const list = (docs || []).filter((d) => d && d.format === MARKET_FORMAT);
  const real = list.filter((d) => d.mode === 'real');
  const use = real.length ? real : list;
  // Each doc's companies are parts again: its home arrays by company, its byCountry by country.
  const parts = [];
  for (const d of use) {
    for (const co of d.companies || []) {
      const mine = (a) => (a || []).filter((c) => c[0] === co.slug);
      const others = Object.entries(d.byCountry || {})
        .map(([c, o]) => [c, { cells: mine(o.cells), oteCells: mine(o.oteCells), counts: mine(o.counts) }])
        .filter(([, o]) => o.cells.length || o.oteCells.length || o.counts.length);
      parts.push({ company: co, home: { cells: mine(d.cells), oteCells: mine(d.oteCells), counts: mine(d.counts) }, others });
    }
  }
  return assemble(parts, { minN, generatedAt, mode: real.length ? 'real' : 'demo' });
}

/* ---------------------------------------------------------------- CLI */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const snapDir = arg('--snapshots') || process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');
  const out = arg('--out');
  const { vetSalaries } = await import('../server/vet.js');
  const files = (await fs.readdir(snapDir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
  const payloads = [];
  for (const f of files) {
    try {
      const snap = JSON.parse(await fs.readFile(path.join(snapDir, f), 'utf8'));
      const jobs = Array.isArray(snap) ? snap : snap.jobs;
      const company = (snap && snap.company) || { slug: f.slice(0, -5), name: f.slice(0, -5) };
      // Snapshots written before the vetting gate existed are vetted here (idempotent otherwise).
      payloads.push({ company, mode: (snap && snap.mode) || 'snapshot', fetchedAt: snap && snap.fetchedAt, jobs: vetSalaries(jobs) });
    } catch (err) {
      console.error(`✗ ${f}: ${err.message}`);
    }
  }
  const doc = buildMarket(payloads);
  const json = JSON.stringify(doc);
  if (out) {
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, json + '\n');
    const other = Object.values(doc.byCountry || {}).reduce((n, o) => n + o.cells.length, 0);
    console.error(`market: ${doc.cells.length} home-country cells + ${other} in ${Object.keys(doc.byCountry || {}).join(' ') || 'no other countries'}, ${doc.companies.length} companies, ${(json.length / 1024).toFixed(1)} KB -> ${out}`);
  } else {
    process.stdout.write(json + '\n');
  }
  return payloads.length ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

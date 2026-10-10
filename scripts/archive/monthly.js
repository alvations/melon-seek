#!/usr/bin/env node
// Monthly cross-company comparisons (docs/DATA_ARCHIVE.md "monthly"), frozen once a month
// is complete:
//
//   monthly/YYYY-MM/market.jsonl       every company x family x level cell, plus family x "*" and
//                                      the cross-company cells (company "*", scope stable / all):
//                                      n, p10/p25/p50/p75/p90 in USD and per native currency
//   monthly/YYYY-MM/market-doc.json    the published market-comps document (scripts/build-market.js
//                                      buildMarket) for the stable site; market-doc-beta.json with beta
//   monthly/YYYY-MM/compstimate.jsonl  the Compstimate backtest per company (server BACKTEST_OPTS)
//   monthly/YYYY-MM/juice.jsonl        Juice Score distributions per city and per company
//   monthly/YYYY-MM/inputs.json        what it was computed from: observation per company, code sha,
//                                      normalizer, FX table and cities.json versions, options
//
// Each company is read as of its LAST observation in the month (job versions valid at that
// time). The files are immutable: a month that has them is never recomputed.
//
//   node scripts/archive/monthly.js --archive DIR [--month YYYY-MM] [--now ISO] [--force-current]
//   (no --month: every complete month that has observations and no monthly/ files yet)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT, MONTH_RE, monthOf, monthEnd, monthsBetween, dist, round1, sha256, canonical, readState, readTable,
  writeIfChanged, jsonlText, writeManifest, parseArgs, archiveDir, iso, codeSha,
} from './lib.js';
import { allVersions, versionsAt, rowAsJob, view } from './jobs.js';
import { writeReadme } from './ingest.js';

const FILES = ['market.jsonl', 'market-doc.json', 'compstimate.jsonl', 'juice.jsonl', 'inputs.json'];

async function product() {
  const out = {};
  out.market = await import('../build-market.js');
  try { out.comp = await import('../../public/features/compstimate.js'); } catch { out.comp = null; }
  try { out.BACKTEST_OPTS = (await import('../../server/index.js')).BACKTEST_OPTS || null; } catch { out.BACKTEST_OPTS = null; }
  try { out.juice = await import('../../server/juice.js'); } catch { out.juice = null; }
  out.palette = await import('../../public/viz/palette.js');
  try { out.normalize = await import('../../server/normalize.js'); } catch { out.normalize = null; }
  return out;
}

/** Last folded observation of each company at or before `t`, within `month` if given. */
export function observationsAsOf(dir, t, month = null) {
  const last = {};
  for (const o of readTable(dir, 'observations')) {
    if (o.status !== 'folded' || o.observedAt > t) continue;
    if (month && monthOf(o.observedAt) !== month) continue;
    if (!last[o.company] || o.observedAt > last[o.company].observedAt) last[o.company] = o;
  }
  return last;
}

/** Version rows (as view()) of every company valid at its observation in `obsByCompany`. */
export function stateAt(dir, obsByCompany) {
  const companies = readState(dir, 'companies', {});
  const out = {};
  for (const [slug, o] of Object.entries(obsByCompany)) {
    const meta = companies[slug] || {};
    out[slug] = { meta: { ...meta, channel: o.channel || meta.channel || 'stable' }, observedAt: o.observedAt, rows: versionsAt(allVersions(dir, slug), o.observedAt, meta.lastObservedAt).map(view) };
  }
  return out;
}

const LEVEL_ALL = '*';

/** Market cells for a state (see header). */
export function marketCells(state, month, minN = 1) {
  const groups = new Map();
  const add = (scope, company, family, level, r) => {
    const k = `${scope}|${company}|${family}|${level}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { usd: [], native: {} }));
    g.usd.push(r.usd.mid);
    const cur = r.salary.currency || 'USD';
    (g.native[cur] || (g.native[cur] = [])).push(r.salary.mid != null ? r.salary.mid : (r.salary.min + r.salary.max) / 2);
  };
  for (const [slug, s] of Object.entries(state)) {
    const beta = s.meta.channel === 'beta';
    for (const r of s.rows) {
      if (!r.salary || !r.usd || !(r.usd.mid > 0)) continue;
      const level = r.seniority || 'Mid';
      const cells = [['*', level]]; // every family at one level (cross-level ladders)
      if (r.family) cells.push([r.family, level], [r.family, LEVEL_ALL]);
      for (const [family, lv] of cells) {
        add('company', slug, family, lv, r);
        add('all', '*', family, lv, r);
        if (!beta) add('stable', '*', family, lv, r);
      }
    }
  }
  const rows = [];
  for (const [k, g] of groups) {
    if (g.usd.length < minN) continue;
    const [scope, company, family, level] = k.split('|');
    const native = {};
    for (const [cur, vals] of Object.entries(g.native).sort()) native[cur] = dist(vals);
    rows.push({ month, scope, company, family, level, n: g.usd.length, usd: dist(g.usd), native });
  }
  const order = { company: 0, stable: 1, all: 2 };
  rows.sort((a, b) => order[a.scope] - order[b.scope] || (a.company < b.company ? -1 : a.company > b.company ? 1 : 0) || (a.family < b.family ? -1 : a.family > b.family ? 1 : 0) || (a.level < b.level ? -1 : a.level > b.level ? 1 : 0));
  return rows;
}

/** The published market-comps doc (build-market.js) from a state. */
export function marketDoc(P, state, { beta = false, generatedAt }) {
  const payloads = Object.entries(state)
    .filter(([, s]) => beta || s.meta.channel !== 'beta')
    .map(([slug, s]) => ({ company: { slug, name: s.meta.name || slug, color: s.meta.color || null }, mode: 'snapshot', fetchedAt: s.observedAt, jobs: s.rows.map(rowAsJob) }));
  return payloads.length ? P.market.buildMarket(payloads, { generatedAt }) : null;
}

export function compstimateRows(P, state, month) {
  if (!P.comp || typeof P.comp.backtest !== 'function') return [];
  const opts = { ...(P.BACKTEST_OPTS || { seed: P.comp.BACKTEST_SEED, maxN: 500 }) };
  const rows = [];
  for (const [slug, s] of Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1))) {
    let bt = null;
    let error = null;
    try { bt = P.comp.backtest(s.rows.map(rowAsJob), opts); } catch (err) { error = err.message; }
    rows.push({ month, company: slug, channel: s.meta.channel, asOf: s.observedAt, opts, ...(bt || {}), ...(error ? { error } : {}) });
  }
  return rows;
}

/** Juice Score distributions per city (best location) and per company, single household. */
export function juiceRows(P, state, month, cities) {
  if (!P.juice || typeof P.juice.attachJuiceAll !== 'function' || !cities) return [];
  const byCity = new Map();
  const byCompany = new Map();
  const push = (m, k, name, j) => { let g = m.get(k); if (!g) m.set(k, (g = { name, scores: [], nets: [], grades: {} })); g.scores.push(j.score); g.nets.push(j.net); const gr = j.grade || 'n/a'; g.grades[gr] = (g.grades[gr] || 0) + 1; };
  for (const [slug, s] of Object.entries(state)) {
    const jobs = s.rows.filter((r) => r.salary).map(rowAsJob);
    try { P.juice.attachJuiceAll(jobs, cities, { inputs: 'none' }); } catch { continue; }
    for (const j of jobs) {
      const b = j.juice && j.juice.best;
      if (!b || !Number.isFinite(b.score)) continue;
      push(byCity, b.city || b.cityName || 'unknown', b.cityName || b.city || null, b);
      push(byCompany, slug, s.meta.name || slug, b);
    }
  }
  const rows = [];
  const emit = (kind, m) => {
    for (const [key, g] of [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      rows.push({ month, kind, key, name: g.name, n: g.scores.length, score: dist(g.scores, round1), netUSD: dist(g.nets.filter(Number.isFinite)), grades: g.grades });
    }
  };
  emit('company', byCompany);
  emit('city', byCity);
  return rows;
}

function readCities() {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8');
    const doc = JSON.parse(text);
    return { doc, sha256: sha256(text), updated: doc.updated || null };
  } catch { return { doc: null, sha256: null, updated: null }; }
}

/**
 * Everything for one month, not written. `asOf` limits observations (default: end of month).
 */
export async function computeMonth(dir, month, { now = new Date().toISOString(), asOf = null } = {}) {
  const P = await product();
  const t = asOf || monthEnd(month);
  const obs = observationsAsOf(dir, t, month);
  const state = stateAt(dir, obs);
  const cities = readCities();
  const generatedAt = now;
  const market = marketCells(state, month);
  const doc = marketDoc(P, state, { beta: false, generatedAt });
  const hasBeta = Object.values(state).some((s) => s.meta.channel === 'beta');
  const docBeta = hasBeta ? marketDoc(P, state, { beta: true, generatedAt }) : null;
  const compstimate = compstimateRows(P, state, month);
  const juice = juiceRows(P, state, month, cities.doc);
  const sha = await codeSha();
  const inputs = {
    month, computedAt: now, asOfLimit: t, code: sha, normalizer: P.normalize ? P.normalize.NORMALIZER_VERSION : null,
    market: { format: P.market.MARKET_FORMAT, minN: P.market.MIN_N, basis: P.market.BASIS, note: 'market.jsonl keeps every cell (n >= 1); apply minN when publishing' },
    fx: { asOf: P.palette.FX_AS_OF, sha256: sha256(canonical(P.palette.FX_PER_USD)), source: 'public/viz/palette.js FX_PER_USD (each job version also stores the rate it was converted with)' },
    cities: { sha256: cities.sha256, updated: cities.updated, source: 'data/cities.json at computation time (archived as reference repo.cities)' },
    backtest: P.BACKTEST_OPTS || null,
    juice: { household: 'single', rent: 'centre', source: 'server/juice.js attachJuiceAll, best location per job' },
    companies: Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1)).map(([slug, s]) => ({
      slug, channel: s.meta.channel, observedAt: s.observedAt, postings: s.rows.length, salaried: s.rows.filter((r) => r.salary).length, quarantined: s.rows.filter((r) => r.vet === 'quarantined').length,
    })),
  };
  return { month, market, doc, docBeta, compstimate, juice, inputs, companies: Object.keys(state).length };
}

/** Write a month's files (immutable). Returns false when the month already has them. */
export async function writeMonth(dir, month, { now = new Date().toISOString() } = {}) {
  const mdir = path.join(dir, 'monthly', month);
  if (fs.existsSync(path.join(mdir, 'inputs.json'))) return { status: 'exists' };
  const m = await computeMonth(dir, month, { now });
  if (!m.companies) return { status: 'no-data' };
  fs.mkdirSync(mdir, { recursive: true });
  writeIfChanged(path.join(mdir, 'market.jsonl'), jsonlText(m.market));
  if (m.doc) writeIfChanged(path.join(mdir, 'market-doc.json'), JSON.stringify(m.doc) + '\n');
  if (m.docBeta) writeIfChanged(path.join(mdir, 'market-doc-beta.json'), JSON.stringify(m.docBeta) + '\n');
  writeIfChanged(path.join(mdir, 'compstimate.jsonl'), jsonlText(m.compstimate));
  writeIfChanged(path.join(mdir, 'juice.jsonl'), jsonlText(m.juice));
  writeIfChanged(path.join(mdir, 'inputs.json'), JSON.stringify(m.inputs, null, 1) + '\n'); // last: marks the month complete
  return { status: 'written', cells: m.market.length, companies: m.companies, compstimate: m.compstimate.length, juice: m.juice.length };
}

/** Complete months (before the month of `now`) with observations and no monthly/ files. */
export function pendingMonths(dir, now) {
  const obs = readTable(dir, 'observations').filter((o) => o.status === 'folded');
  if (!obs.length) return [];
  const first = obs.reduce((m, o) => (o.observedAt < m ? o.observedAt : m), obs[0].observedAt);
  const cur = monthOf(now);
  const have = new Set(obs.map((o) => monthOf(o.observedAt)));
  return monthsBetween(monthOf(first), cur).filter((m) => m < cur && have.has(m) && !fs.existsSync(path.join(dir, 'monthly', m, 'inputs.json')));
}

async function main(argv) {
  const a = parseArgs(argv);
  const dir = archiveDir(a.archive);
  const now = iso(a.now) || new Date().toISOString();
  let months;
  if (a.month) {
    if (!MONTH_RE.test(String(a.month))) { console.error('monthly: --month YYYY-MM'); return 2; }
    if (String(a.month) >= monthOf(now)) { console.error(`monthly: ${a.month} is not complete yet (use report.js for a provisional view)`); return 2; }
    months = [String(a.month)];
  } else {
    months = pendingMonths(dir, now);
  }
  for (const m of months) {
    const r = await writeMonth(dir, m, { now });
    console.log(`monthly: ${m}: ${r.status}${r.cells != null ? ` (${r.companies} companies, ${r.cells} cells, ${r.compstimate} backtests, ${r.juice} juice rows)` : ''}`);
  }
  if (!months.length) console.log('monthly: nothing to do');
  writeReadme(dir);
  writeManifest(dir, { now, generator: `scripts/archive@${(await codeSha()) || 'unknown'}` });
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

export { FILES };

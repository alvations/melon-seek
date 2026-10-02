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
//     companies: [{ slug, name, color, mode, fetchedAt, jobs, salaried, used }],
//     families: ["ml", "swe", ...],
//     columns: ["company", "family", "seniority", "n", "p25", "median", "p75"],
//     cells: [["anthropic", "ml", "Senior", 41, 320000, 365000, 405000], ...]
//   }
// A cell is one company x role family x seniority bucket with n >= minN; a
// family-only roll-up uses seniority "*" (the drawer's fallback). Amounts are
// rounded to $100. Demo payloads are only used when no company has real data,
// and the doc then says mode: "demo".
//
// CLI: node scripts/build-market.js [--out file] [--snapshots dir]
//      (default: data/snapshots/*.json -> stdout)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { roleFamily } from '../public/features/compstimate.js';
import { toUSD, FX_AS_OF, hasFx } from '../public/viz/palette.js';

export const MARKET_FORMAT = 'melon-market-1';
export const MIN_N = 3;
export const BASIS = 'posted base pay ranges';
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

export function buildMarket(payloads, { minN = MIN_N, generatedAt = new Date().toISOString() } = {}) {
  const list = (payloads || []).filter((p) => p && p.company && p.company.slug && Array.isArray(p.jobs));
  const real = list.filter((p) => REAL_MODES.has(p.mode));
  const use = real.length ? real : list;
  const docMode = real.length ? 'real' : 'demo';

  const companies = [];
  const groups = new Map(); // "slug|family|seniority" -> number[]
  const add = (key, v) => { let a = groups.get(key); if (!a) groups.set(key, (a = [])); a.push(v); };
  const families = new Set();

  for (const p of use) {
    const slug = p.company.slug;
    let salaried = 0;
    let used = 0;
    for (const job of p.jobs) {
      if (!job || !job.salary) continue; // quarantined or no pay: excluded
      salaried++;
      const usd = usdMid(job.salary);
      if (usd == null) continue;
      let family = null;
      try { family = roleFamily(job.title || '', job); } catch { family = null; } // job as ctx: department hints
      if (!family) continue;
      const seniority = job.seniority || 'Mid';
      add(`${slug}|${family}|${seniority}`, usd);
      add(`${slug}|${family}|*`, usd);
      families.add(family);
      used++;
    }
    companies.push({
      slug, name: p.company.name || slug, color: p.company.color || null,
      mode: p.mode || null, fetchedAt: p.fetchedAt || null,
      jobs: p.jobs.length, salaried, used,
    });
  }

  const cells = [];
  for (const [key, values] of groups) {
    if (values.length < minN) continue;
    const [company, family, seniority] = key.split('|');
    values.sort((a, b) => a - b);
    cells.push([company, family, seniority, values.length,
      round100(percentileSorted(values, 0.25)), round100(percentileSorted(values, 0.5)), round100(percentileSorted(values, 0.75))]);
  }
  cells.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return {
    format: MARKET_FORMAT,
    basis: BASIS,
    currency: 'USD',
    stat: 'midpoint of each posted range, annualized, in USD',
    fx: { asOf: FX_AS_OF, source: 'public/viz/palette.js FX_PER_USD' },
    generatedAt,
    minN,
    mode: docMode,
    companies,
    families: [...new Set(cells.map((c) => c[1]))].sort(),
    columns: [...COLUMNS],
    cells,
  };
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
    console.error(`market: ${doc.cells.length} cells, ${doc.companies.length} companies, ${(json.length / 1024).toFixed(1)} KB -> ${out}`);
  } else {
    process.stdout.write(json + '\n');
  }
  return payloads.length ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

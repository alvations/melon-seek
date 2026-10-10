// Reference data, the non-job numbers (docs/DATA_ARCHIVE.md "reference"): every version of
// every dataset (FX, Big Mac, rents by bedrooms, cost index, NYC baseline, tax tables by
// jurisdiction and tax year, score anchors, policy constants), stored as dated versions
// and never overwritten.
//
//   reference/<dataset>/<asOf>.json      one version (pretty JSON, immutable); a second, different
//                                        version with the same asOf is <asOf>~2.json, and so on
//   reference/index/<YYYY>.jsonl         one row per version (or confirmation) recorded in YYYY
//
// Identity is the canonical JSON of the content (key order ignored; a top-level
// `exportedAt`/`generatedAt` stamp ignored). Recording the same content again as the
// dataset's latest version is a no-op, so every caller may record on every run.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, DATASET_RE, DATE_RE, sha256, canonical, iso, yearOf, appendRows, readTable, readJson, writeIfChanged,
} from './lib.js';

const VOLATILE_TOP = ['exportedAt', 'generatedAt'];

/** JSON-safe copy: RegExp -> "/src/flags", Infinity -> "Infinity", Map/Set -> arrays, functions dropped. */
export function jsonSafe(v) {
  return JSON.parse(JSON.stringify(v, (k, x) => {
    if (x instanceof RegExp) return String(x);
    if (x === Infinity) return 'Infinity';
    if (x === -Infinity) return '-Infinity';
    if (typeof x === 'number' && Number.isNaN(x)) return 'NaN';
    if (x instanceof Map) return [...x.entries()];
    if (x instanceof Set) return [...x];
    if (typeof x === 'function' || typeof x === 'symbol') return undefined;
    if (typeof x === 'bigint') return String(x);
    return x;
  }) ?? null);
}

function identity(data) {
  let d = data;
  if (d && typeof d === 'object' && !Array.isArray(d)) d = Object.fromEntries(Object.entries(d).filter(([k]) => !VOLATILE_TOP.includes(k)));
  return sha256(canonical(d));
}

/** Index rows of one dataset (or all), in recording order. */
export function referenceIndex(dir, dataset = null) {
  const rows = readTable(dir, 'reference/index');
  return dataset ? rows.filter((r) => r.dataset === dataset) : rows;
}

/** Latest version row of a dataset, or null. */
export function latestVersion(dir, dataset) {
  const rows = referenceIndex(dir, dataset).filter((r) => r.kind === 'version');
  return rows.length ? rows[rows.length - 1] : null;
}

/** Content of a version row. */
export function readVersion(dir, row) {
  return readJson(path.join(dir, row.file));
}

/**
 * Record one dated version.
 * @returns {{ status: "recorded"|"unchanged"|"confirmed", row?, file? }}
 */
export function recordVersion(dir, { dataset, asOf, data, source = null, by = 'record.js', taxYear = null, confirm = false, now = new Date().toISOString(), note = null }) {
  if (typeof dataset !== 'string' || !DATASET_RE.test(dataset) || dataset.includes('..')) throw new Error(`invalid dataset id "${dataset}" (lowercase letters, digits, . _ -)`);
  if (typeof asOf !== 'string' || !DATE_RE.test(asOf) || iso(`${asOf}T00:00:00Z`) == null) throw new Error(`invalid --asof "${asOf}" (YYYY-MM-DD)`);
  if (data === undefined) throw new Error('no data');
  const safe = jsonSafe(data);
  const id = identity(safe);
  const rows = referenceIndex(dir, dataset);
  const versions = rows.filter((r) => r.kind === 'version');
  const latest = versions.length ? versions[versions.length - 1] : null;
  if (latest && latest.identity === id) {
    const seen = rows.some((r) => r.identity === id && r.asOf === asOf);
    if (!confirm || seen) return { status: 'unchanged', row: latest };
    const row = { dataset, asOf, kind: 'confirm', rev: latest.rev, sha256: latest.sha256, identity: id, bytes: latest.bytes, file: latest.file, source, by, recordedAt: now, ...(taxYear != null ? { taxYear } : {}), ...(note ? { note } : {}) };
    appendRows(dir, 'reference/index', yearOf(now), [row]);
    return { status: 'confirmed', row };
  }
  const text = JSON.stringify(safe, null, 1) + '\n';
  const fileSha = sha256(text);
  let rev = 1;
  let rel;
  for (;;) {
    rel = `reference/${dataset}/${asOf}${rev > 1 ? `~${rev}` : ''}.json`;
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) { writeIfChanged(abs, text); break; }
    if (sha256(fs.readFileSync(abs)) === fileSha) break; // the same content was stored before (a revert)
    rev++;
  }
  const row = { dataset, asOf, kind: 'version', rev, sha256: fileSha, identity: id, bytes: Buffer.byteLength(text), file: rel, source, by, recordedAt: now, ...(taxYear != null ? { taxYear } : {}), ...(note ? { note } : {}) };
  appendRows(dir, 'reference/index', yearOf(now), [row]);
  return { status: 'recorded', row, file: rel };
}

/* ------------------------------------------------------------ capture from the repo */

const today = (now) => String(now).slice(0, 10);

async function exportsOf(rel) {
  const mod = await import(path.join(ROOT, rel));
  const out = {};
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === 'function' || v === undefined) continue;
    out[k] = v;
  }
  return jsonSafe(out);
}

/** Effective tax by jurisdiction and household on an income grid (local currency). */
async function taxProbe() {
  const juice = await import(path.join(ROOT, 'server', 'juice.js'));
  const cities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
  const list = Array.isArray(cities) ? cities : cities.cities || [];
  const households = Array.isArray(juice.HOUSEHOLD_KEYS) && juice.HOUSEHOLD_KEYS.length ? juice.HOUSEHOLD_KEYS : ['single'];
  const gridUSD = [25000, 50000, 75000, 100000, 150000, 200000, 300000, 500000, 675000, 1000000];
  const seen = new Map();
  for (const c of list) {
    const jur = c.tax || { country: c.country };
    const key = [jur.country, jur.region || '', jur.local || ''].join('/');
    if (seen.has(key)) continue;
    const perUSD = Number(c.fxPerUSD) > 0 ? Number(c.fxPerUSD) : 1;
    const rows = {};
    for (const hh of households) {
      rows[hh] = gridUSD.map((g) => {
        const gross = Math.round(g * perUSD);
        try { const t = juice.taxFor(gross, jur, { household: hh }); return [gross, Math.round(t.income || 0), Math.round(t.regional || 0), Math.round(t.social || 0), Math.round(t.total || 0)]; } catch (err) { return [gross, null, null, null, null]; }
      });
    }
    seen.set(key, { jurisdiction: jur, currency: c.currency || null, example: c.key || c.name || null, columns: ['gross', 'income', 'regional', 'social', 'total'], households: rows });
  }
  return { note: 'taxFor() of server/juice.js on a fixed income grid (USD amounts converted with each city fxPerUSD); a change here means a tax rule changed', gridUSD, jurisdictions: Object.fromEntries([...seen.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) };
}

/**
 * Datasets the archive captures from the code branch itself on every run (ids prefixed
 * "repo." so they never collide with the freshness registry's ids). Each: id, asOf(value, now),
 * read(). A dataset whose module fails to load is skipped with a warning.
 */
export const REPO_DATASETS = Object.freeze([
  { id: 'repo.fx-palette', file: 'public/viz/palette.js', read: async () => { const m = await import(path.join(ROOT, 'public/viz/palette.js')); return { asOf: m.FX_AS_OF, perUSD: m.FX_PER_USD }; }, asOf: (v) => v.asOf },
  { id: 'repo.fx-juice', file: 'server/juice.js', read: async () => { const m = await import(path.join(ROOT, 'server/juice.js')); return { asOf: m.FX_AS_OF, perUSD: m.FX_PER_USD }; }, asOf: (v) => v.asOf },
  { id: 'repo.cities', file: 'data/cities.json', read: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8')), asOf: (v) => (v && typeof v.updated === 'string' && DATE_RE.test(v.updated.slice(0, 10)) ? v.updated.slice(0, 10) : null) },
  { id: 'repo.juice-model', file: 'server/juice.js', read: () => exportsOf('server/juice.js') },
  { id: 'repo.tax-probe', file: 'server/juice.js', read: taxProbe },
  { id: 'repo.salary-policy', file: 'server/salary.js', read: () => exportsOf('server/salary.js') },
  { id: 'repo.vet-policy', file: 'server/vet.js', read: () => exportsOf('server/vet.js') },
  { id: 'repo.market-policy', file: 'scripts/build-market.js', read: () => exportsOf('scripts/build-market.js') },
  { id: 'repo.compstimate-policy', file: 'public/features/compstimate.js', read: async () => {
    const c = await exportsOf('public/features/compstimate.js');
    let backtestOpts = null;
    try { backtestOpts = jsonSafe((await import(path.join(ROOT, 'server/index.js'))).BACKTEST_OPTS || null); } catch { backtestOpts = null; }
    return { ...c, BACKTEST_OPTS: backtestOpts };
  } },
  { id: 'repo.roles', file: 'public/features/roles.js', read: () => exportsOf('public/features/roles.js') },
  { id: 'repo.keywords-lexicons', file: 'server/keywords.js', read: () => exportsOf('server/keywords.js') },
  { id: 'repo.history-policy', file: 'server/history.js', read: () => exportsOf('server/history.js') },
  { id: 'repo.normalizer', file: 'server/normalize.js', read: () => exportsOf('server/normalize.js') },
  { id: 'repo.companies', file: 'server/companies.js', read: async () => { const m = await import(path.join(ROOT, 'server/companies.js')); return { companies: jsonSafe(m.listCompanies({ channel: 'all' })), sources: jsonSafe(m.SOURCES || null) }; } },
  { id: 'repo.freshness-registry', file: 'data/freshness.json', optional: true, read: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/freshness.json'), 'utf8')), asOf: (v) => (v && typeof v.updated === 'string' && DATE_RE.test(v.updated) ? v.updated : null) },
]);

/** Record every REPO_DATASETS entry (idempotent). Returns one result per dataset. */
export async function captureRepo(dir, { now = new Date().toISOString(), sha = null, log = () => {} } = {}) {
  const out = [];
  for (const d of REPO_DATASETS) {
    if (d.optional && !fs.existsSync(path.join(ROOT, d.file))) { out.push({ dataset: d.id, status: 'absent' }); continue; }
    let value;
    try { value = await d.read(); } catch (err) { log(`::warning::archive: could not read ${d.id} (${d.file}): ${err.message}`); out.push({ dataset: d.id, status: 'error', detail: err.message }); continue; }
    const asOf = (d.asOf && d.asOf(value)) || today(now);
    const r = recordVersion(dir, { dataset: d.id, asOf: DATE_RE.test(asOf) ? asOf : today(now), data: value, source: `repo:${d.file}${sha ? `@${sha.slice(0, 12)}` : ''}`, by: 'repo-capture', now });
    out.push({ dataset: d.id, status: r.status, asOf: r.row && r.row.asOf, file: r.row && r.row.file });
  }
  return out;
}

/* ------------------------------------------------------------ hand-off directories */

/**
 * Import reference versions handed over in a directory (an artifact):
 *   - a record.js spool (reference/index/*.jsonl + files), or
 *   - a freshness hand-off: manifest.json = [{ dataset, asOf, file, source }] at the root,
 *     in archive/ (scripts/refresh/run.js writeArchivePayloads) or in reference/
 *     (run.js --export-reference); plus report.json (melon-refresh-report-1), whose
 *     results are kept as audit rows (audit/refresh).
 * `ctx` is an ingest context (openArchive). Every file is untrusted: ids and dates are
 * checked, paths must stay inside the directory.
 */
export async function importSpool(ctx, dir, { artifact = null } = {}) {
  const results = [];
  const inside = (base, rel) => { const abs = path.resolve(base, rel); return abs.startsWith(path.resolve(base) + path.sep) ? abs : null; };
  const one = (dataset, asOf, abs, source, by) => {
    try {
      const st = fs.lstatSync(abs);
      if (!st.isFile() || st.size > 50 * 1024 * 1024) throw new Error('not a regular file under 50 MB');
      const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
      const r = recordVersion(ctx.dir, { dataset, asOf, data, source: source || null, by, now: ctx.now, note: artifact ? `artifact ${artifact.name} #${artifact.id}` : null });
      results.push({ dataset, asOf, status: r.status });
      if (r.status !== 'unchanged') ctx.dirty = true;
    } catch (err) {
      results.push({ dataset, asOf, status: 'error', detail: err.message });
    }
  };
  // record.js spool
  const spoolIndex = readTable(dir, 'reference/index');
  for (const row of spoolIndex) {
    if (row.kind !== 'version' || !DATASET_RE.test(String(row.dataset)) || !DATE_RE.test(String(row.asOf))) continue;
    const abs = inside(dir, String(row.file || ''));
    if (abs) one(row.dataset, row.asOf, abs, row.source, row.by || 'spool');
  }
  // freshness hand-offs
  for (const sub of ['.', 'archive', 'reference']) {
    const base = path.join(dir, sub);
    const mf = path.join(base, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    let list;
    try { list = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { results.push({ status: 'error', detail: `${sub}/manifest.json unreadable` }); continue; }
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || !DATASET_RE.test(String(m.dataset)) || !DATE_RE.test(String(m.asOf)) || typeof m.file !== 'string') continue;
      const abs = inside(base, path.isAbsolute(m.file) ? path.basename(m.file) : m.file) || inside(base, path.basename(m.file));
      if (abs) one(m.dataset, m.asOf, abs, typeof m.source === 'string' ? m.source : (m.source && m.source.url) || null, sub === 'reference' ? 'refresh-export' : 'refresh');
    }
  }
  // the monthly refresh report: one audit row per result
  const rep = path.join(dir, 'report.json');
  if (fs.existsSync(rep)) {
    try {
      const report = JSON.parse(fs.readFileSync(rep, 'utf8'));
      if (report && report.format === 'melon-refresh-report-1' && Array.isArray(report.results)) {
        const known = new Set(readTable(ctx.dir, 'audit/refresh').map((r) => r.key));
        const rows = [];
        for (const r of report.results) {
          if (!r || typeof r.id !== 'string') continue;
          const key = sha256(`${report.ranAt}|${r.id}`).slice(0, 16);
          if (known.has(key)) continue;
          rows.push({
            key, ranAt: iso(report.ranAt), today: report.today || null, dryRun: !!report.dryRun, offline: !!report.offline, id: r.id, mode: r.mode || null, status: r.status || null,
            module: r.module || null, summary: String(r.summary || '').slice(0, 1000), sourceAsOf: r.sourceAsOf || null,
            findings: Array.isArray(r.findings) ? r.findings.slice(0, 50) : [], evidence: Array.isArray(r.evidence) ? r.evidence.slice(0, 10).map((e) => ({ ...e, excerpt: String(e.excerpt || '').slice(0, 400) })) : [],
            writes: Array.isArray(r.writes) ? r.writes.map((w) => ({ file: w.file, bytes: w.bytes })) : [], recordedAt: ctx.now, artifact,
          });
        }
        if (rows.length) { appendRows(ctx.dir, 'audit/refresh', ctx.month, rows); ctx.dirty = true; }
        results.push({ status: 'report', results: rows.length });
      }
    } catch (err) {
      results.push({ status: 'error', detail: `report.json: ${err.message}` });
    }
  }
  return results;
}

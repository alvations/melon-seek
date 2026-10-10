// Historical data archive: shared storage layer (docs/DATA_ARCHIVE.md).
//
// The archive is a directory of plain-text files, kept on the orphan
// `data-archive` branch of this repo. This module owns its layout, the
// partition rules, JSONL I/O and the manifest. Everything else in
// scripts/archive/ goes through it.
//
// File kinds (MANIFEST.json `files[path].kind`):
//   append     JSONL, one partition per write month (`<table>/YYYY-MM.jsonl`); rows are only
//              ever appended. A partition whose month is before the current month is CLOSED:
//              its bytes never change again. A partition that would pass PART_MAX_BYTES rolls
//              over to `YYYY-MM.2.jsonl`, so closed partitions are never rewritten or gzipped.
//   immutable  written once, never changed (monthly comparisons, reference-data versions,
//              raw-rescue/ copies of artifacts).
//   mutable    current state, rewritten in place (open job versions, company state, ledger
//              mirror). Every older version stays in git history, and verify.js checks that no
//              row is ever dropped from them without landing in an append partition.
//              A mutable file over GZIP_OVER_BYTES is stored gzipped (`.gz`).
//   derived    regenerable output (reports/).
//   meta       MANIFEST.json, README.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Bump with a migration in scripts/archive/migrations/ (docs/DATA_ARCHIVE.md "Migrations"). */
export const SCHEMA_VERSION = 1;
export const ARCHIVE_FORMAT = 'melon-archive';
export const DATA_BRANCH = 'data-archive';
/** GitHub rejects files over 100 MB and warns over 50 MB. */
export const PART_MAX_BYTES = 40 * 1024 * 1024;
export const GZIP_OVER_BYTES = 40 * 1024 * 1024;
export const SLUG_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
export const DATASET_RE = /^[a-z0-9][a-z0-9_.-]{0,95}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Default archive directory: MELON_ARCHIVE_DIR, else tmp/archive (gitignored). */
export function archiveDir(dir) {
  return path.resolve(dir || process.env.MELON_ARCHIVE_DIR || path.join(ROOT, 'tmp', 'archive'));
}

/* ------------------------------------------------------------ small utils */

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Canonical JSON: object keys sorted at every level (stable hashes). */
export function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v === undefined ? null : v)).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export function hashOf(value, n = 16) {
  return sha256(canonical(value)).slice(0, n);
}

/** ISO timestamp (ms precision, Z) or null. */
export function iso(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export const monthOf = (isoStr) => String(isoStr).slice(0, 7);
export const dateOf = (isoStr) => String(isoStr).slice(0, 10);
export const yearOf = (isoStr) => String(isoStr).slice(0, 4);

/** "2026-10" -> "2026-11". */
export function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/** Last millisecond of month m, ISO. */
export function monthEnd(m) {
  return new Date(Date.parse(`${nextMonth(m)}-01T00:00:00Z`) - 1).toISOString();
}

/** Months from a to b inclusive. */
export function monthsBetween(a, b) {
  const out = [];
  for (let m = a; m <= b; m = nextMonth(m)) out.push(m);
  return out;
}

/** Linear-interpolation percentile of a sorted numeric array (same as build-market.js). */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

export const round100 = (n) => (n == null ? null : Math.round(n / 100) * 100);
export const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** { n, p10, p25, p50, p75, p90 } of numbers, rounded with `round`. */
export function dist(values, round = round100) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, p10: null, p25: null, p50: null, p75: null, p90: null };
  return { n: v.length, p10: round(percentile(v, 0.1)), p25: round(percentile(v, 0.25)), p50: round(percentile(v, 0.5)), p75: round(percentile(v, 0.75)), p90: round(percentile(v, 0.9)) };
}

export function assertSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) throw new Error(`invalid company slug "${slug}"`);
  return slug;
}

/* ------------------------------------------------------------ file I/O */

export function readMaybeGz(file) {
  const buf = fs.readFileSync(file);
  return file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf;
}

/** Rows of a JSONL file (plain or .gz); [] when missing. Throws on a bad line, with its number. */
export function readJsonl(file) {
  let text;
  try { text = readMaybeGz(file).toString('utf8'); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    try { out.push(JSON.parse(lines[i])); } catch (err) { throw new Error(`${file}:${i + 1}: bad JSON (${err.message})`); }
  }
  return out;
}

export function readJson(file, fallback = undefined) {
  try { return JSON.parse(readMaybeGz(file).toString('utf8')); } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

export const jsonlText = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

/** Atomic write (tmp + rename). Returns true when the content changed. */
export function writeIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try { if (fs.readFileSync(file).equals(buf)) return false; } catch { /* missing */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return true;
}

/**
 * Write a mutable file, gzipped when the plain text is over GZIP_OVER_BYTES
 * (removing the other variant). `rel` is the plain name, e.g. jobs/x/open.jsonl.
 */
export function writeMutable(dir, rel, text) {
  const plain = path.join(dir, rel);
  const gz = `${plain}.gz`;
  const buf = Buffer.from(text);
  if (buf.length > GZIP_OVER_BYTES) {
    let same = false;
    try { same = zlib.gunzipSync(fs.readFileSync(gz)).equals(buf); } catch { /* missing */ }
    const changed = same ? false : writeIfChanged(gz, zlib.gzipSync(buf, { level: 9 }));
    if (fs.existsSync(plain)) { fs.rmSync(plain); return true; }
    return changed;
  }
  const changed = writeIfChanged(plain, buf);
  if (fs.existsSync(gz)) { fs.rmSync(gz); return true; }
  return changed;
}

/** Path of a mutable file as stored (plain or .gz), or null. */
export function mutablePath(dir, rel) {
  const plain = path.join(dir, rel);
  if (fs.existsSync(plain)) return plain;
  if (fs.existsSync(`${plain}.gz`)) return `${plain}.gz`;
  return null;
}

/** Partition files of an append table directory for one month, in part order. */
export function partitionParts(tableDir, month) {
  let names = [];
  try { names = fs.readdirSync(tableDir); } catch { return []; }
  const re = new RegExp(`^${month}(?:\\.(\\d+))?\\.jsonl$`);
  return names.map((n) => [n, re.exec(n)]).filter(([, m]) => m)
    .sort((a, b) => Number(a[1][1] || 1) - Number(b[1][1] || 1)).map(([n]) => path.join(tableDir, n));
}

/** Every append partition of a table directory, oldest first. */
export function allPartitions(tableDir) {
  let names = [];
  try { names = fs.readdirSync(tableDir); } catch { return []; }
  const re = /^(\d{4}(?:-\d{2})?)(?:\.(\d+))?\.jsonl$/;
  return names.map((n) => [n, re.exec(n)]).filter(([, m]) => m)
    .sort((a, b) => (a[1][1] < b[1][1] ? -1 : a[1][1] > b[1][1] ? 1 : Number(a[1][2] || 1) - Number(b[1][2] || 1)))
    .map(([n]) => path.join(tableDir, n));
}

/** Rows of every partition of a table directory, oldest first. */
export function readTable(dir, table) {
  return allPartitions(path.join(dir, table)).flatMap((f) => readJsonl(f));
}

/**
 * Append rows to `<table>/<month>.jsonl` (rolling to `.2`, `.3`, ... past PART_MAX_BYTES).
 * Never rewrites existing bytes.
 */
export function appendRows(dir, table, month, rows) {
  if (!rows.length) return 0;
  if (!MONTH_RE.test(month) && !/^\d{4}$/.test(month)) throw new Error(`bad partition key "${month}" (YYYY-MM or YYYY)`);
  const tableDir = path.join(dir, table);
  fs.mkdirSync(tableDir, { recursive: true });
  const parts = partitionParts(tableDir, month);
  let file = parts.length ? parts[parts.length - 1] : path.join(tableDir, `${month}.jsonl`);
  let size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let n = parts.length || 1;
  let chunk = [];
  let chunkBytes = 0;
  const flush = () => { if (chunk.length) { fs.appendFileSync(file, chunk.join('')); size += chunkBytes; chunk = []; chunkBytes = 0; } };
  for (const r of rows) {
    const line = JSON.stringify(r) + '\n';
    const len = Buffer.byteLength(line);
    if (size + chunkBytes + len > PART_MAX_BYTES && size + chunkBytes > 0) {
      flush();
      n += 1;
      file = path.join(tableDir, `${month}.${n}.jsonl`);
      size = 0;
    }
    chunk.push(line);
    chunkBytes += len;
    if (chunkBytes > 8 * 1024 * 1024) flush();
  }
  flush();
  return rows.length;
}

/* ------------------------------------------------------------ manifest */

const APPEND_TABLES = ['observations', 'daily', 'ingests', 'blobs', 'late', 'reference/index', 'audit/flags', 'audit/verdicts', 'audit/runs', 'audit/refresh', 'ledger/entries'];

/** File kind by archive-relative path (posix separators). */
export function kindOf(rel) {
  if (rel === 'MANIFEST.json' || rel === 'README.md') return 'meta';
  if (/^jobs\/[^/]+\/\d{4}-\d{2}(?:\.\d+)?\.jsonl$/.test(rel)) return 'append';
  if (/^jobs\/[^/]+\/(open\.jsonl|ids\.json)(\.gz)?$/.test(rel)) return 'mutable';
  for (const t of APPEND_TABLES) if (new RegExp(`^${t}/\\d{4}(-\\d{2})?(?:\\.\\d+)?\\.jsonl$`).test(rel)) return 'append';
  if (/^monthly\/\d{4}-\d{2}\/[a-z0-9-]+\.(jsonl|json)$/.test(rel)) return 'immutable';
  if (/^reference\/[a-z0-9][a-z0-9_.-]*\/\d{4}-\d{2}-\d{2}(~\d+)?\.json$/.test(rel) && !rel.startsWith('reference/index/')) return 'immutable';
  if (/^raw-rescue\/[a-z0-9][a-z0-9_.-]*\/\d+-\d+\/.+$/.test(rel) && !rel.includes('..')) return 'immutable';
  if (/^state\/[a-z0-9-]+\.json$/.test(rel)) return 'mutable';
  if (/^(beta\/)?history\/[a-z0-9][a-z0-9_.-]*\.json$/.test(rel)) return 'mutable';
  if (/^reports\//.test(rel)) return 'derived';
  return null;
}

/** Month a partition belongs to ("2026-10"), or year for yearly partitions ("2026"), else null. */
export function partitionKey(rel) {
  const m = /\/(\d{4}(?:-\d{2})?)(?:\.\d+)?\.jsonl$/.exec(rel);
  return m ? m[1] : null;
}

/** True when an append partition can no longer change at time `now`. */
export function isClosedPartition(rel, now) {
  const key = partitionKey(rel);
  if (!key) return false;
  return key.length === 4 ? key < yearOf(now) : key < monthOf(now);
}

export function walkFiles(dir) {
  const out = [];
  const walk = (d, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git' || e.name.endsWith('.tmp')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

export function fileInfo(dir, rel) {
  const buf = fs.readFileSync(path.join(dir, rel));
  const info = { kind: kindOf(rel), bytes: buf.length, sha256: sha256(buf) };
  if (rel.endsWith('.jsonl') || rel.endsWith('.jsonl.gz')) {
    const text = (rel.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8');
    let rows = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) rows++;
    info.rows = rows;
  }
  return info;
}

/** Row counts per logical table, from a files map. */
export function tableTotals(files) {
  const t = {};
  const add = (k, n) => { t[k] = (t[k] || 0) + (n || 0); };
  for (const [rel, f] of Object.entries(files)) {
    if (rel.startsWith('jobs/')) {
      if (/\/open\.jsonl(\.gz)?$/.test(rel)) add('jobs.open', f.rows);
      else if (f.kind === 'append') add('jobs.closed', f.rows);
      continue;
    }
    if (f.kind === 'append') add(rel.replace(/\/[^/]+$/, ''), f.rows);
    else if (f.kind === 'immutable' && rel.startsWith('monthly/')) add(`monthly.${rel.split('/').pop().replace(/\.(jsonl|json)$/, '')}`, f.rows ?? 1);
    else if (f.kind === 'immutable' && rel.startsWith('reference/')) add('reference.files', 1);
  }
  t['jobs.versions'] = (t['jobs.open'] || 0) + (t['jobs.closed'] || 0);
  return Object.fromEntries(Object.entries(t).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Build the manifest object for the archive directory (does not write it). */
export function buildManifest(dir, { now = new Date().toISOString(), generator = null } = {}) {
  const files = {};
  for (const rel of walkFiles(dir)) {
    const kind = kindOf(rel);
    if (kind === 'meta' || kind == null) continue;
    files[rel] = fileInfo(dir, rel);
  }
  return { format: ARCHIVE_FORMAT, schemaVersion: SCHEMA_VERSION, updatedAt: now, generator, tables: tableTotals(files), files };
}

/** Write MANIFEST.json only when some file entry or table changed. Returns true when written. */
export function writeManifest(dir, opts = {}) {
  const next = buildManifest(dir, opts);
  const file = path.join(dir, 'MANIFEST.json');
  const prev = readJson(file, null);
  if (prev && Array.isArray(prev.migrations)) next.migrations = prev.migrations; // applied migrations stay listed
  if (prev && prev.schemaVersion === next.schemaVersion && canonical(prev.files) === canonical(next.files)) return false;
  writeIfChanged(file, JSON.stringify(next, null, 1) + '\n');
  return true;
}

export function readManifest(dir) {
  return readJson(path.join(dir, 'MANIFEST.json'), null);
}

/* ------------------------------------------------------------ state */

export function readState(dir, name, fallback) {
  return readJson(path.join(dir, 'state', `${name}.json`), fallback);
}

export function writeState(dir, name, value) {
  return writeIfChanged(path.join(dir, 'state', `${name}.json`), JSON.stringify(value, null, 1) + '\n');
}

/** Git sha of the code that runs (GITHUB_SHA, else `git rev-parse HEAD`, else null). */
export async function codeSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

/** Parse `--flag value` / `--flag=value` / `--switch` arguments. */
export function parseArgs(argv, { booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2));
    if (eq > 0) out[key] = a.slice(eq + 1);
    else if (booleans.includes(key)) out[key] = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

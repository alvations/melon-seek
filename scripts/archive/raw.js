#!/usr/bin/env node
// Raw rescue (docs/DATA_ARCHIVE.md "Raw rescue"): copy trusted workflow artifacts AS-IS,
// gzipped, onto the data branch under raw-rescue/, outside the append-only tables, so nothing
// is lost if an artifact would expire before it can be ingested. The archive's normal sweep
// later ingests these copies losslessly (from the branch, so after the artifact expired too).
//
//   node scripts/archive/raw.js --archive DIR [--names a,b] [--expiring-before ISO] [--dry-run] [--run-cache FILE]
//
//   raw-rescue/<artifact name>/<run id>-<artifact id>/meta.json        artifact + run + trust, file list
//   raw-rescue/<artifact name>/<run id>-<artifact id>/<path>.gz        each file, gzipped (split into
//                                                                     <path>.gz.000, .001, ... past 40 MB)
// Files are immutable once written; an artifact already copied or already ingested is skipped.
// Same trust rules as scripts/archive/sweep.js. Env: GITHUB_REPOSITORY, GH_TOKEN, TRUSTED_BRANCHES.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { sha256, parseArgs, archiveDir, iso, readTable, writeManifest, SLUG_RE } from './lib.js';

export const RAW_DIR = 'raw-rescue';
export const RAW_PART_BYTES = 40 * 1024 * 1024;

/** Every raw copy on the branch, as sweep entries (oldest first). */
export function rawEntries(dir) {
  const base = path.join(dir, RAW_DIR);
  const out = [];
  let names = [];
  try { names = fs.readdirSync(base); } catch { return out; }
  for (const name of names.sort()) {
    let ids = [];
    try { ids = fs.readdirSync(path.join(base, name)); } catch { continue; }
    for (const d of ids.sort()) {
      const m = /^(\d+)-(\d+)$/.exec(d);
      if (!m) continue;
      let meta;
      try { meta = JSON.parse(fs.readFileSync(path.join(base, name, d, 'meta.json'), 'utf8')); } catch { continue; }
      if (meta.name !== name || String(meta.id) !== m[2]) continue;
      out.push({ id: meta.id, name, size_in_bytes: meta.bytes ?? null, created_at: meta.createdAt, via: 'raw-rescue', trust: meta.trust, run: meta.run || null,
        workflow_run: { id: meta.runId, head_branch: meta.run && meta.run.head_branch, head_sha: meta.run && meta.run.head_sha }, rawDir: path.join(base, name, d), files: meta.files || [] });
    }
  }
  return out.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/** Write a raw copy's files (gunzipped, parts joined) into dest; checks every sha256. */
export function extractRaw(dir, entry, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of entry.files) {
    if (typeof f.path !== 'string' || f.path.split('/').some((p) => p === '..' || p === '') || path.isAbsolute(f.path)) throw new Error(`bad path ${f.path}`);
    const parts = (f.parts || [`${f.path}.gz`]).map((p) => fs.readFileSync(path.join(entry.rawDir, p)));
    const buf = zlib.gunzipSync(Buffer.concat(parts));
    if (sha256(buf) !== f.sha256) throw new Error(`${f.path}: sha256 mismatch in the raw copy`);
    fs.mkdirSync(path.dirname(path.join(dest, f.path)), { recursive: true });
    fs.writeFileSync(path.join(dest, f.path), buf);
  }
}

/** Copy one downloaded artifact directory into raw-rescue/ (immutable). */
export function saveRaw(dir, src, meta) {
  if (!SLUG_RE.test(meta.name)) throw new Error(`bad artifact name ${meta.name}`);
  const rel = `${RAW_DIR}/${meta.name}/${meta.runId}-${meta.id}`;
  const out = path.join(dir, rel);
  if (fs.existsSync(path.join(out, 'meta.json'))) return { status: 'exists', rel };
  const files = [];
  const walk = (d, r) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = r ? `${r}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), p);
      else if (e.isFile()) files.push(p);
    }
  };
  walk(src, '');
  const list = [];
  let total = 0;
  for (const p of files) {
    const buf = fs.readFileSync(path.join(src, p));
    const gz = zlib.gzipSync(buf, { level: 9 });
    fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true });
    const entry = { path: p, bytes: buf.length, sha256: sha256(buf), gzBytes: gz.length };
    if (gz.length <= RAW_PART_BYTES) fs.writeFileSync(path.join(out, `${p}.gz`), gz);
    else {
      entry.parts = [];
      for (let i = 0, k = 0; i < gz.length; i += RAW_PART_BYTES, k++) {
        const part = `${p}.gz.${String(k).padStart(3, '0')}`;
        fs.writeFileSync(path.join(out, part), gz.subarray(i, i + RAW_PART_BYTES));
        entry.parts.push(part);
      }
    }
    total += buf.length;
    list.push(entry);
  }
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ ...meta, bytes: total, files: list }, null, 1) + '\n');
  return { status: 'saved', rel, files: list.length, bytes: total, gzBytes: list.reduce((s, f) => s + f.gzBytes, 0) };
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['dry-run'] });
  const dir = archiveDir(a.archive);
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) { console.error('raw: GITHUB_REPOSITORY is required'); return 2; }
  const { listArtifacts, getRun, runTrust, download, DEFAULT_NAMES, DEFAULT_PREFIXES } = await import('./sweep.js');
  const names = a.names ? String(a.names).split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_NAMES;
  const before = a['expiring-before'] ? iso(a['expiring-before']) : null;
  let defaultBranch = null;
  try { const { gh } = await import('./sweep.js'); defaultBranch = JSON.parse(gh(['api', `repos/${repo}`, '--jq', '{d: .default_branch}'])).d; } catch { defaultBranch = null; }
  const trusted = [defaultBranch, ...String(process.env.TRUSTED_BRANCHES || '').split(/\s+/)].filter(Boolean);
  const done = new Set(readTable(dir, 'ingests').filter((r) => r.status === 'ingested').map((r) => r.key));
  const have = new Set(rawEntries(dir).map((r) => r.id));
  const runs = new Map();
  if (a['run-cache']) { try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(a['run-cache'], 'utf8')))) runs.set(Number(k), v); } catch { /* none */ } }
  const list = listArtifacts(repo, { names, prefixes: a.names ? [] : DEFAULT_PREFIXES }).filter((x) => !done.has(`artifact:${x.id}`) && !have.has(x.id) && (!before || (x.expires_at && x.expires_at < before)));
  console.log(`raw: ${list.length} artifact(s) to copy${before ? ` (expiring before ${before})` : ''}`);
  const tmp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'melon-raw-'));
  let saved = 0;
  try {
    for (const x of list) {
      const run = getRun(repo, x.workflow_run.id, runs);
      const trust = runTrust(run, repo, trusted);
      if (trust !== 'trusted') { console.log(`  skip ${x.name} #${x.id} (untrusted: ${trust})`); continue; }
      if (a['dry-run']) { console.log(`  would copy ${x.name} #${x.id} run ${x.workflow_run.id} ${x.created_at} (expires ${x.expires_at})`); continue; }
      const dest = path.join(tmp, String(x.id));
      try { download(repo, x, dest); } catch (err) { console.log(`::warning::raw: could not download ${x.name} #${x.id}: ${err.message}`); continue; }
      const r = saveRaw(dir, dest, { id: x.id, name: x.name, runId: x.workflow_run.id, createdAt: iso(x.created_at), expiresAt: iso(x.expires_at), savedAt: new Date().toISOString(), trust, run });
      fs.rmSync(dest, { recursive: true, force: true });
      saved++;
      console.log(`  ${x.name} #${x.id}: ${r.status} ${r.rel} (${r.files} files, ${((r.bytes || 0) / 1e6).toFixed(1)} MB -> ${((r.gzBytes || 0) / 1e6).toFixed(1)} MB gzipped)`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (a['run-cache']) { try { fs.writeFileSync(a['run-cache'], JSON.stringify(Object.fromEntries(runs))); } catch { /* best effort */ } }
  }
  if (saved) writeManifest(dir, {});
  console.log(`raw: copied ${saved}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

#!/usr/bin/env node
// Rebuild an observed snapshot from the archive (docs/DATA_ARCHIVE.md "Reconstruction").
//
//   node scripts/archive/reconstruct.js --company C --date YYYY-MM-DD [--archive DIR] [--out FILE]
//   node scripts/archive/reconstruct.js --company C --at ISO           (one exact observation)
//   node scripts/archive/reconstruct.js --check FILE --company C       (rebuild FILE's observation and compare)
//   node scripts/archive/reconstruct.js --check-all [--archive DIR]    (every observation rebuilds; sizes only)
//
// --date picks the company's last observation of that UTC date. The result deep-equals the
// snapshot file that was ingested (every top-level field and every field of every posting,
// description HTML included), with one documented exception: `jobs` comes back sorted by id
// (the board's own listing order is not kept; it carries no data). The ingest runs the same
// comparison on every snapshot before anything is committed.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, readTable, readState, readJsonl, parseArgs, archiveDir, iso, allPartitions } from './lib.js';
import { BlobStore } from './blobs.js';
import { allVersions, versionsAt, restoreSrc } from './jobs.js';

const byId = (a, b) => {
  const x = String(a && a.id);
  const y = String(b && b.id);
  if (x !== y) return x < y ? -1 : 1;
  const p = canonical(a);
  const q = canonical(b);
  return p < q ? -1 : p > q ? 1 : 0;
};

/** The comparable form of a snapshot payload: jobs sorted by id (the one documented difference). */
export function comparable(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const jobs = Array.isArray(payload.jobs) ? payload.jobs.slice().sort(byId) : payload.jobs;
  return { ...payload, jobs };
}

/** First differences between two values, as "path: a != b" strings (empty = deep-equal). */
export function differences(a, b, at = '', out = [], max = 10) {
  if (out.length >= max) return out;
  if (canonical(a) === canonical(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && a.length !== b.length) { out.push(`${at || '(root)'}: length ${a.length} != ${b.length}`); }
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      differences(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k, out, max);
      if (out.length >= max) break;
    }
    return out;
  }
  out.push(`${at || '(root)'}: ${JSON.stringify(a)?.slice(0, 120)} != ${JSON.stringify(b)?.slice(0, 120)}`);
  return out;
}

/** Compare an ingested payload with its reconstruction. */
export function compareSnapshots(original, rebuilt) {
  return differences(comparable(original), comparable(rebuilt));
}

/** A stored job entry outside the version table: { src } for an object, { value } for anything else. */
export const restoreEntry = (e, blobs) => (e && e.src ? restoreSrc(e.src, blobs) : e ? e.value : null);

/** Payload for one observation row and the version rows valid at it. */
export function assemble(obs, rows, blobs) {
  const jobs = rows.map((r) => restoreSrc(r.src, blobs));
  for (const extra of obs.extraJobs || []) jobs.push(restoreEntry(extra, blobs));
  return { ...(obs.payload || {}), jobs: jobs.sort(byId) };
}

/** Find the observation: exact `at`, or the last of `date` (YYYY-MM-DD), folded or late. */
export function findObservation(dir, company, { at = null, date = null } = {}) {
  const rows = readTable(dir, 'observations').filter((o) => o.company === company && (o.status === 'folded' || o.status === 'late') && o.observedAt);
  const hit = rows.filter((o) => (at ? o.observedAt === at : o.observedAt.slice(0, 10) === date)).sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
  return hit.length ? hit[hit.length - 1] : null;
}

/** Rebuild one observation from the archive. */
export function reconstruct(dir, { company, at = null, date = null, blobs = null } = {}) {
  const obs = findObservation(dir, company, { at, date });
  if (!obs) throw new Error(`no observation of ${company} ${at || date}`);
  const store = blobs || new BlobStore(dir, '0000-00');
  if (obs.status === 'late') {
    const late = allPartitions(path.join(dir, 'late')).flatMap((f) => readJsonl(f)).find((r) => r.company === company && r.observedAt === obs.observedAt);
    if (!late) throw new Error(`late observation ${company} ${obs.observedAt} has no stored copy`);
    return { observation: obs, payload: { ...(late.payload || {}), jobs: late.jobs.map((j) => restoreEntry(j, store)).sort(byId) } };
  }
  const meta = readState(dir, 'companies', {})[company] || {};
  const rows = versionsAt(allVersions(dir, company), obs.observedAt, meta.lastObservedAt);
  return { observation: obs, payload: assemble(obs, rows, store) };
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['check-all'] });
  const dir = archiveDir(a.archive);
  if (a['check-all']) {
    const blobs = new BlobStore(dir, '0000-00');
    let n = 0;
    for (const o of readTable(dir, 'observations').filter((x) => x.status === 'folded' || x.status === 'late')) {
      const { payload } = reconstruct(dir, { company: o.company, at: o.observedAt, blobs });
      const expect = o.jobs - (o.invalid || 0) + (o.extraJobs ? o.extraJobs.length : 0);
      if (o.status === 'folded' && payload.jobs.length !== o.postings + (o.extraJobs ? o.extraJobs.length : 0)) {
        console.error(`::error::reconstruct: ${o.company} ${o.observedAt}: ${payload.jobs.length} postings, the observation had ${o.postings} (+${(o.extraJobs || []).length} extra)`);
        return 1;
      }
      if (o.jobs != null && payload.jobs.length !== o.jobs) console.error(`::warning::reconstruct: ${o.company} ${o.observedAt}: ${payload.jobs.length} of ${o.jobs} jobs (expected ${expect})`);
      n++;
    }
    console.log(`reconstruct: ${n} observation(s) rebuild with the recorded posting counts`);
    return 0;
  }
  if (!a.company || (!a.date && !a.at && !a.check)) {
    console.error('usage: node scripts/archive/reconstruct.js --company C (--date YYYY-MM-DD | --at ISO | --check FILE) [--archive DIR] [--out FILE]');
    return 2;
  }
  if (a.check) {
    const original = JSON.parse(fs.readFileSync(path.resolve(String(a.check)), 'utf8'));
    const { payload } = reconstruct(dir, { company: String(a.company), at: iso(original.fetchedAt) });
    const diff = compareSnapshots(original, payload);
    if (diff.length) { for (const d of diff) console.error(`::error::reconstruct: ${d}`); return 1; }
    console.log(`reconstruct: ${a.company} ${original.fetchedAt}: deep-equal (${payload.jobs.length} postings)`);
    return 0;
  }
  const { observation, payload } = reconstruct(dir, { company: String(a.company), at: a.at ? iso(a.at) : null, date: a.date ? String(a.date) : null });
  const text = JSON.stringify(payload, null, 1) + '\n';
  if (a.out) { fs.writeFileSync(path.resolve(String(a.out)), text); console.error(`reconstruct: ${a.company} ${observation.observedAt}: ${payload.jobs.length} postings -> ${a.out}`); }
  else process.stdout.write(text);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

// Content-addressed blob store (docs/DATA_ARCHIVE.md "blobs"): large values (posting
// description HTML, extracted sections, whole artifact files such as vetting reports)
// stored once per distinct content, however many versions or runs refer to them.
//
//   blobs/YYYY-MM.jsonl     append-only, one row per distinct value: { h, bytes, v } where
//                           h = sha256(canonical JSON of v), first 32 hex chars; rolls over to
//                           YYYY-MM.2.jsonl past 40 MB (lib.appendRows)
//   state/blob-index.json   { h: "blobs/YYYY-MM[.n].jsonl" } for every blob (rebuilt by verify)
//
// A reference to a blob is the object { "$blob": h } in place of the value. Raw values are
// never objects with a "$blob" key, so a reference is unambiguous.
import fs from 'node:fs';
import path from 'node:path';
import { sha256, canonical, readJsonl, readJson, writeIfChanged, appendRows, partitionParts } from './lib.js';

export const BLOB_HASH_LEN = 32;
/** Top-level job fields at least this long (JSON) go to the blob store. */
export const BLOB_MIN_BYTES = 1024;

export const blobHash = (v) => sha256(canonical(v)).slice(0, BLOB_HASH_LEN);
export const isRef = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && typeof v.$blob === 'string' && Object.keys(v).length === 1;

export class BlobStore {
  constructor(dir, month) {
    this.dir = dir;
    this.month = month;
    this.file = path.join(dir, 'state', 'blob-index.json');
    this.index = readJson(this.file, {});
    this.pending = new Map(); // h -> value, written by flush()
    this.cache = new Map();   // h -> value, read from partitions
    this.loaded = new Set();  // partition files already parsed into cache
    this.added = 0;
  }

  /** Store a value (deduplicated); returns its reference. */
  put(value) {
    const h = blobHash(value);
    if (!this.index[h] && !this.pending.has(h)) { this.pending.set(h, value); this.added++; }
    return { $blob: h };
  }

  has(h) { return !!this.index[h] || this.pending.has(h); }

  /** The value of a reference or hash; throws when it is missing. */
  get(ref) {
    const h = typeof ref === 'string' ? ref : ref && ref.$blob;
    if (this.pending.has(h)) return this.pending.get(h);
    if (this.cache.has(h)) return this.cache.get(h);
    const rel = this.index[h];
    if (!rel) throw new Error(`blob ${h} is not in the archive`);
    const file = path.join(this.dir, rel);
    if (!this.loaded.has(file)) {
      for (const row of readJsonl(file)) this.cache.set(row.h, row.v);
      this.loaded.add(file);
    }
    if (!this.cache.has(h)) throw new Error(`blob ${h} missing from ${rel}`);
    return this.cache.get(h);
  }

  /** Append pending blobs to blobs/<month>.jsonl and update the index. */
  flush() {
    if (!this.pending.size) return 0;
    const rows = [...this.pending.entries()].map(([h, v]) => ({ h, bytes: Buffer.byteLength(JSON.stringify(v)), v }));
    appendRows(this.dir, 'blobs', this.month, rows);
    // Which part each row landed in: re-read the parts of this month (only the new hashes are looked up).
    const want = new Set(rows.map((r) => r.h));
    for (const f of partitionParts(path.join(this.dir, 'blobs'), this.month)) {
      const rel = path.relative(this.dir, f).split(path.sep).join('/');
      for (const r of readJsonl(f)) if (want.has(r.h)) { this.index[r.h] = rel; want.delete(r.h); }
    }
    if (want.size) throw new Error(`blob flush lost ${want.size} row(s)`);
    for (const [h, v] of this.pending) this.cache.set(h, v);
    const n = this.pending.size;
    this.pending.clear();
    this.save();
    return n;
  }

  save() {
    const keys = Object.keys(this.index).sort();
    writeIfChanged(this.file, keys.length ? `{\n${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(this.index[k])}`).join(',\n')}\n}\n` : '{}\n');
  }
}

/** Every blob row of the archive (for verify): Map h -> { rel, row }. Throws on a duplicate. */
export function scanBlobs(dir) {
  const out = new Map();
  const bdir = path.join(dir, 'blobs');
  let names = [];
  try { names = fs.readdirSync(bdir).filter((n) => n.endsWith('.jsonl')).sort(); } catch { return out; }
  for (const n of names) {
    const rel = `blobs/${n}`;
    for (const row of readJsonl(path.join(bdir, n))) {
      if (out.has(row.h)) throw new Error(`blob ${row.h} stored twice (${out.get(row.h).rel}, ${rel})`);
      out.set(row.h, { rel, row });
    }
  }
  return out;
}

/** References inside a value (one level of nesting, the way jobs store them). */
export function refsOf(obj) {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  for (const v of Object.values(obj)) if (isRef(v)) out.push(v.$blob);
  return out;
}

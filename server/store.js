// Job-list stores (PERF-1): a normalized job list split into
//   <name>.list.json   { format, fetchedAt, normalizerVersion, sourceKey, count, desc: [[offset, length]...], jobs }
//                      jobs WITHOUT descriptionHtml (what the API lists), desc[i] belongs to jobs[i]
//   <name>.desc.ndjson one JSON string (descriptionHtml) per line
// The heavy work (parse 38 MB snapshots, normalize, rekey) happens in the
// pipeline worker, which writes stores; the main thread only parses the small
// list file and reads one description at a time by byte offset.
// Node-only (not in server/lib-modules.js).
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCacheDir } from './cache.js';

export const STORE_FORMAT = 'melon-store-1';

const SAFE = /[^a-z0-9-_.]/gi;
export function storeDir({ custom = false } = {}) {
  return path.join(getCacheDir(), 'store', custom ? 'custom' : '');
}
function base(name, opts) {
  return path.join(storeDir(opts), String(name).replace(SAFE, '_'));
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

/**
 * Write a store. Returns the list document (as written).
 * @param {string} name
 * @param {{ fetchedAt, normalizerVersion, sourceKey, jobs, custom? }} input  jobs may carry descriptionHtml
 */
export async function writeStore(name, { fetchedAt = null, normalizerVersion = null, sourceKey = null, jobs = [], custom = false } = {}) {
  const b = base(name, { custom });
  await fs.mkdir(path.dirname(b), { recursive: true });
  const parts = [];
  const desc = [];
  const list = [];
  let off = 0;
  for (const j of jobs) {
    if (!j || typeof j !== 'object') { list.push(j); desc.push(null); continue; }
    const { descriptionHtml, ...rest } = j;
    const line = JSON.stringify(typeof descriptionHtml === 'string' ? descriptionHtml : '');
    const len = Buffer.byteLength(line);
    parts.push(line, '\n');
    desc.push([off, len]);
    off += len + 1;
    list.push(rest);
  }
  const doc = { format: STORE_FORMAT, fetchedAt, normalizerVersion, sourceKey, count: list.length, desc, jobs: list };
  await writeAtomic(`${b}.desc.ndjson`, parts.join(''));
  await writeAtomic(`${b}.list.json`, JSON.stringify(doc));
  if (custom) await pruneCustom();
  return doc;
}

/** The list document, or null when missing or not a store. */
export async function readStoreList(name, { custom = false } = {}) {
  let text;
  try { text = await fs.readFile(`${base(name, { custom })}.list.json`, 'utf8'); } catch { return null; }
  try {
    const doc = JSON.parse(text);
    return doc && doc.format === STORE_FORMAT && Array.isArray(doc.jobs) ? doc : null;
  } catch {
    return null;
  }
}

/** One description by its [offset, length]. */
export async function readDescription(name, loc, { custom = false } = {}) {
  if (!Array.isArray(loc)) return '';
  const fh = await fs.open(`${base(name, { custom })}.desc.ndjson`, 'r');
  try {
    const buf = Buffer.alloc(loc[1]);
    await fh.read(buf, 0, loc[1], loc[0]);
    const v = JSON.parse(buf.toString('utf8'));
    return typeof v === 'string' ? v : '';
  } finally {
    await fh.close();
  }
}

/** Delete stores whose name starts with `prefix`, except the names in `keep`. */
export async function pruneStores(prefix, keep = [], { custom = false } = {}) {
  const dir = storeDir({ custom });
  const safePrefix = String(prefix).replace(SAFE, '_');
  const keepSet = new Set(keep.map((k) => String(k).replace(SAFE, '_')));
  let names;
  try { names = await fs.readdir(dir); } catch { return; }
  for (const f of names) {
    const m = /^(.*)\.(list\.json|desc\.ndjson)$/.exec(f);
    if (!m || !m[1].startsWith(safePrefix) || keepSet.has(m[1])) continue;
    await fs.rm(path.join(dir, f), { force: true });
  }
}

const MAX_CUSTOM_STORES = Number(process.env.MELON_DISK_CACHE_MAX) || 100;
/** Keep the newest MAX_CUSTOM_STORES custom-board stores (review H1: bounded disk). */
async function pruneCustom() {
  const dir = storeDir({ custom: true });
  let names;
  try { names = (await fs.readdir(dir)).filter((f) => f.endsWith('.list.json')); } catch { return; }
  if (names.length <= MAX_CUSTOM_STORES) return;
  const items = [];
  for (const f of names) {
    try { items.push({ f, t: (await fs.stat(path.join(dir, f))).mtimeMs }); } catch {}
  }
  items.sort((a, b) => b.t - a.t);
  for (const { f } of items.slice(MAX_CUSTOM_STORES)) {
    const stem = f.slice(0, -'.list.json'.length);
    await fs.rm(path.join(dir, f), { force: true });
    await fs.rm(path.join(dir, `${stem}.desc.ndjson`), { force: true });
  }
}

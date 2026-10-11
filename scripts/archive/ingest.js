#!/usr/bin/env node
// Fold one downloaded workflow artifact into the archive (docs/DATA_ARCHIVE.md "Ingestion").
//
//   node scripts/archive/ingest.js --archive DIR --name <artifact name> --dir <downloaded dir>
//        [--artifact-id N] [--run-id N] [--workflow NAME] [--event E] [--branch B]
//        [--head-sha SHA] [--created-at ISO] [--now ISO]
//
// Artifact names and what each contributes:
//   job-board-snapshots, job-board-snapshots-pages   <slug>.json snapshots (stable channel)
//   job-board-snapshots-beta                         snapshots/<slug>.json (beta) + history/<slug>.json (beta ledger)
//   beta-crawl-<slug>                                <slug>.json, one fresh beta crawl (snapshot.yml matrix job)
//   history-ledger                                   <slug>.json, the F4 ledger (stable)
//   salary-vetting                                   flags.jsonl, flags.counts.json, llm-verdicts.jsonl
//   archive-reference                                a record.js spool (reference-data versions)
//   monthly-refresh-report                           scripts/refresh/run.js output: archive/ and reference/
//                                                    manifests (dated versions) + report.json (audit/refresh)
//
// Lossless: every file of every artifact is either archived structurally (snapshots as job
// versions that reconstruct.js rebuilds deep-equal, checked here before anything is
// written for good; ledgers as entry rows plus the mirror) or stored whole in the blob store
// (deduplicated by content). The ingest log lists every file with its sha256 and where it went.
// Idempotent: an artifact already in the ingest log (by artifact id, else by content hash)
// changes nothing; an observation already folded (same company + fetchedAt) is skipped.
// Every file is treated as untrusted data: JSON only, names checked, sizes capped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import {
  SLUG_RE, sha256, hashOf, canonical, iso, monthOf, dateOf, appendRows, readTable, readState, writeState,
  writeManifest, readJson, writeIfChanged, codeSha, parseArgs, archiveDir, dist,
} from './lib.js';
import { BlobStore } from './blobs.js';
import { loadHelpers, deriveRow, storedSrc, loadCompany, saveCompany, foldObservation, suspectDrop, payStats } from './jobs.js';
import { assemble, compareSnapshots } from './reconstruct.js';

export const SNAPSHOT_ARTIFACTS = Object.freeze({
  'job-board-snapshots': { channel: 'stable', snapshots: '.', history: null },
  'job-board-snapshots-pages': { channel: 'stable', snapshots: '.', history: null },
  'job-board-snapshots-beta': { channel: 'beta', snapshots: 'snapshots', history: 'history' },
});
/** Per-company beta crawl artifacts of snapshot.yml's matrix job: beta-crawl-<slug>. */
export const BETA_CRAWL_PREFIX = 'beta-crawl-';
/** Reference-data hand-offs: a record.js spool, or the monthly refresh's report artifact. */
export const REFERENCE_ARTIFACTS = Object.freeze(['archive-reference', 'monthly-refresh-report']);
export const KNOWN_ARTIFACTS = Object.freeze([...Object.keys(SNAPSHOT_ARTIFACTS), 'history-ledger', 'salary-vetting', ...REFERENCE_ARTIFACTS]);
export const isKnownArtifact = (name) => KNOWN_ARTIFACTS.includes(name) || (name.startsWith(BETA_CRAWL_PREFIX) && SLUG_RE.test(name.slice(BETA_CRAWL_PREFIX.length)));
/** Largest artifact file read (the biggest real snapshot is ~40 MB). */
export const MAX_FILE_BYTES = 300 * 1024 * 1024;
/** A whole file kept as a blob is gzipped (base64) only above this size, to stay under 40 MB per partition. */
export const FILE_BLOB_GZIP_OVER = 16 * 1024 * 1024;
const FUTURE_SLACK_MS = 60 * 60 * 1000;
const DONE_STATUSES = Object.freeze(['ingested', 'empty', 'untrusted']);

let product = null;
async function loadProduct() {
  if (product) return product;
  const [normalize, keywords, vet, history] = await Promise.all([
    import('../../server/normalize.js'),
    import('../../server/keywords.js'),
    import('../../server/vet.js'),
    import('../../server/history.js'),
  ]);
  product = {
    NORMALIZER_VERSION: normalize.NORMALIZER_VERSION,
    relocateJobs: normalize.relocateJobs,
    rekeyBoardJobs: keywords.rekeyBoardJobs,
    vetSalaries: vet.vetSalaries,
    HISTORY_FORMAT: history.HISTORY_FORMAT,
  };
  return product;
}

function readFileChecked(file) {
  const st = fs.lstatSync(file);
  if (!st.isFile()) throw new Error('not a regular file');
  if (st.size > MAX_FILE_BYTES) throw new Error(`too large (${st.size} bytes)`);
  return fs.readFileSync(file);
}

function readJsonFile(file) {
  const buf = readFileChecked(file);
  return { buf, json: JSON.parse(buf.toString('utf8')) };
}

/** <slug>.json files directly in dir (no symlinks, valid slugs), sorted. */
function slugFiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => n.endsWith('.json') && SLUG_RE.test(n.slice(0, -5)) && !n.includes('..')).sort().map((n) => ({ slug: n.slice(0, -5), file: path.join(dir, n) }));
}

/** Every regular file under dir, as posix relative paths. */
function listFiles(dir) {
  const out = [];
  const walk = (d, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** A whole artifact file as a blob value: text as is, binary as base64, gzip only for very large files. */
export function fileBlobValue(buf) {
  const text = buf.toString('utf8');
  const isText = Buffer.from(text, 'utf8').equals(buf);
  if (isText && buf.length <= FILE_BLOB_GZIP_OVER) return { encoding: 'utf8', bytes: buf.length, sha256: sha256(buf), data: text };
  if (buf.length <= FILE_BLOB_GZIP_OVER) return { encoding: 'base64', bytes: buf.length, sha256: sha256(buf), data: buf.toString('base64') };
  return { encoding: 'gzip+base64', bytes: buf.length, sha256: sha256(buf), data: zlib.gzipSync(buf, { level: 9 }).toString('base64') };
}

/** Bytes of a file blob value. */
export function fileBlobBytes(v) {
  if (v.encoding === 'utf8') return Buffer.from(v.data, 'utf8');
  if (v.encoding === 'base64') return Buffer.from(v.data, 'base64');
  return zlib.gunzipSync(Buffer.from(v.data, 'base64'));
}

/* ------------------------------------------------------------ context */

/** Load what an ingest needs once (state, known keys) and flush it at the end. */
export async function openArchive(dir, { now = new Date().toISOString() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const month = monthOf(now);
  const companies = readState(dir, 'companies', {});
  const observations = readTable(dir, 'observations');
  const obsKeys = new Set(observations.map((o) => `${o.company}|${o.observedAt}|${o.status}`));
  const ingests = readTable(dir, 'ingests');
  const done = new Set(ingests.filter((r) => DONE_STATUSES.includes(r.status)).map((r) => r.key));
  return { dir, now, month, companies, obsKeys, done, blobs: new BlobStore(dir, month), dirty: false, generator: await codeSha(), checks: { reconstructed: 0 } };
}

export function closeArchive(ctx) {
  ctx.blobs.flush();
  writeState(ctx.dir, 'companies', sortObj(ctx.companies));
  writeReadme(ctx.dir);
  writeManifest(ctx.dir, { now: ctx.now, generator: ctx.generator ? `scripts/archive@${ctx.generator}` : 'scripts/archive' });
}

const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

/* ------------------------------------------------------------ snapshots */

/**
 * Fold one snapshot payload (already parsed) into the archive and prove it reconstructs.
 * @returns observation row (also appended), or null when it was already archived.
 */
export async function ingestSnapshot(ctx, { slug, payload, fileSha, bytes, channel, artifact }) {
  const P = await loadProduct();
  const h = await loadHelpers();
  const base = { company: slug, channel, artifact: artifact || null, file: fileSha ? { sha256: fileSha, bytes } : null, ingestedAt: ctx.now };
  const reject = (why) => {
    const row = { ...base, observedAt: iso(payload && payload.fetchedAt), status: 'rejected', detail: why };
    const k = `${slug}|${row.observedAt}|rejected|${fileSha}`;
    if (!ctx.obsKeys.has(k)) { ctx.obsKeys.add(k); appendRows(ctx.dir, 'observations', ctx.month, [row]); ctx.dirty = true; }
    return row;
  };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reject('not a snapshot object');
  const pc = payload.company && typeof payload.company === 'object' ? payload.company : {};
  if (pc.slug && pc.slug !== slug) return reject(`company.slug "${pc.slug}" does not match file name`);
  if (payload.mode && payload.mode !== 'snapshot' && payload.mode !== 'live') return reject(`mode "${payload.mode}" is not real data`);
  const observedAt = iso(payload.fetchedAt);
  if (!observedAt) return reject('no valid fetchedAt');
  if (Date.parse(observedAt) > Date.parse(ctx.now) + FUTURE_SLACK_MS) return reject('fetchedAt is in the future');
  const jobsIn = Array.isArray(payload.jobs) ? payload.jobs : [];
  if (!jobsIn.length) return reject('no jobs');
  // Already archived (a restored file carried forward by a later artifact): nothing to do.
  if (ctx.obsKeys.has(`${slug}|${observedAt}|folded`) || ctx.obsKeys.has(`${slug}|${observedAt}|late`)) return null;

  const { jobs: _jobs, ...payloadMeta } = payload;
  const meta = ctx.companies[slug] || (ctx.companies[slug] = { slug });
  // Postings the version table holds: first occurrence of each well-formed id. Anything else
  // (malformed entries, repeated ids) is kept verbatim in the observation row.
  const seenIds = new Set();
  const valid = [];
  const extras = [];
  for (const j of jobsIn) {
    if (j && typeof j === 'object' && !Array.isArray(j) && typeof j.id === 'string' && j.id.startsWith(`${slug}:`) && !seenIds.has(j.id)) { seenIds.add(j.id); valid.push(j); } else extras.push(j);
  }
  const entry = (j) => (j && typeof j === 'object' && !Array.isArray(j) ? { src: storedSrc(j, ctx.blobs) } : { value: j === undefined ? null : j });
  const extraJobs = extras.length ? extras.map(entry) : null;

  if (meta.lastObservedAt && observedAt < meta.lastObservedAt) {
    // Older than the latest observation and never seen: kept whole (lossless), not folded.
    ctx.obsKeys.add(`${slug}|${observedAt}|late`);
    appendRows(ctx.dir, 'late', ctx.month, [{ company: slug, channel, observedAt, payload: payloadMeta, jobs: jobsIn.map(entry), recordedAt: ctx.now }]);
    const row = { ...base, observedAt, status: 'late', detail: `older than the latest observation ${meta.lastObservedAt}; stored whole in late/, not folded`, payload: payloadMeta, jobs: jobsIn.length };
    appendRows(ctx.dir, 'observations', ctx.month, [row]);
    ctx.dirty = true;
    return row;
  }
  if (!valid.length) return reject('no job has an id for this company');

  // Same upgrade + gate as the build (scripts/build-static.js readSnapshot), for the analytic fields.
  const current = payload.normalizerVersion === P.NORMALIZER_VERSION;
  const upgraded = current ? valid : P.relocateJobs(P.rekeyBoardJobs(valid).jobs);
  const vetted = P.vetSalaries(upgraded);
  const trimmedTo = Number(payload.descriptionsTrimmedTo) || null;
  const rctx = { helpers: h, norm: P.NORMALIZER_VERSION, blobs: ctx.blobs };
  const rows = valid.map((j, i) => ({ id: j.id, data: deriveRow(j, vetted[i], rctx) }));
  const state = loadCompany(ctx.dir, slug);
  const capped = payload.jobsCapped && typeof payload.jobsCapped === 'object' ? payload.jobsCapped : null;
  const suspect = !capped && suspectDrop([...state.open.values()].filter((r) => r.validTo == null).length, rows.length);
  // A crawl whose list came back short (crawl.list.complete === false, scripts/snapshot.js)
  // is partial like a capped one: what it did not list is not closed (docs/DATA_ARCHIVE.md §9).
  const shortList = !!(payload.crawl && payload.crawl.list && payload.crawl.list.complete === false);
  const partial = !!capped || suspect || shortList;
  const { status, closedRows, stats } = foldObservation(state, meta, { observedAt, rows, partial }, { company: slug });
  if (status !== 'folded') return null;

  const openRows = [...state.open.values()].filter((r) => r.validTo == null);
  const ps = payStats(openRows);
  const row = {
    ...base, observedAt, status: 'folded', payload: payloadMeta, ...(extraJobs ? { extraJobs } : {}),
    norm: P.NORMALIZER_VERSION, upgraded: !current, partial, ...(suspect ? { suspectDrop: true } : {}),
    jobs: jobsIn.length, invalid: extras.length, postings: stats.postings, salaried: ps.salaried, quarantined: ps.quarantined,
    opened: stats.opened, reopened: stats.reopened, resumed: stats.resumed, closed: stats.closed, unseen: stats.unseen,
    changed: stats.changed, payChanged: stats.payChanged, sourceChanged: stats.sourceChanged,
  };

  // Lossless check BEFORE anything of this observation is written: the archive's view of this
  // observation must rebuild the snapshot deep-equal (jobs order aside, see reconstruct.js).
  const diff = compareSnapshots(payload, assemble(row, openRows, ctx.blobs));
  if (diff.length) throw new Error(`reconstruction of ${slug} ${observedAt} differs from the snapshot: ${diff.slice(0, 3).join('; ')}`);
  ctx.checks.reconstructed++;

  appendRows(ctx.dir, `jobs/${slug}`, ctx.month, closedRows);
  saveCompany(ctx.dir, slug, state);
  Object.assign(meta, {
    name: pc.name || meta.name || slug, channel, source: pc.source || meta.source || null, board: pc.board || meta.board || null,
    color: pc.color || meta.color || null, open: state.open.size, ids: state.ids.size,
  });
  appendRows(ctx.dir, 'observations', ctx.month, [row]);
  ctx.obsKeys.add(`${slug}|${observedAt}|folded`);

  // Daily aggregate: one row per company per UTC date (the first observation of the date);
  // its counts cover every fold since the previous daily row, so nothing is dropped.
  const zero = () => ({ opened: 0, reopened: 0, resumed: 0, closed: 0, unseen: 0, changed: 0, payChanged: 0, sourceChanged: 0, observations: 0 });
  const pend = meta.pending || (meta.pending = zero());
  for (const k of Object.keys(zero())) if (k !== 'observations') pend[k] = (pend[k] || 0) + (stats[k] || 0);
  pend.observations = (pend.observations || 0) + 1;
  const day = dateOf(observedAt);
  if (!meta.lastDailyDate || day > meta.lastDailyDate) {
    appendRows(ctx.dir, 'daily', ctx.month, [{
      date: day, company: slug, channel, observedAt, since: meta.lastDailyAt || null,
      postings: openRows.length, salaried: ps.salaried, quarantined: ps.quarantined, ...pend,
      usd: ps.usd, cells: ps.cells,
    }]);
    meta.lastDailyDate = day;
    meta.lastDailyAt = observedAt;
    meta.pending = zero();
  }
  ctx.dirty = true;
  return { ...row, reconstructed: true };
}

/** Every <slug>.json snapshot of a directory, oldest fetchedAt first. */
export async function ingestSnapshotDir(ctx, dir, { channel, artifact, rel = '.' }) {
  const loaded = [];
  const results = [];
  for (const { slug, file } of slugFiles(dir)) {
    const p = rel === '.' ? `${slug}.json` : `${rel}/${slug}.json`;
    try {
      const { buf, json } = readJsonFile(file);
      loaded.push({ slug, path: p, payload: json, fileSha: sha256(buf), bytes: buf.length });
    } catch (err) {
      results.push({ slug, path: p, status: 'unreadable', detail: err.message });
    }
  }
  loaded.sort((a, b) => String(iso(a.payload && a.payload.fetchedAt)).localeCompare(String(iso(b.payload && b.payload.fetchedAt))) || (a.slug < b.slug ? -1 : 1));
  for (const item of loaded) {
    const r = await ingestSnapshot(ctx, { ...item, channel, artifact });
    results.push(r ? { slug: item.slug, path: item.path, status: r.status, observedAt: r.observedAt, postings: r.postings, opened: r.opened, closed: r.closed, changed: r.changed, reconstructed: !!r.reconstructed } : { slug: item.slug, path: item.path, status: 'duplicate' });
    item.payload = null; // free memory between big boards
  }
  return results;
}

/* ------------------------------------------------------------ ledger (F4) */

const withoutL = ({ l, ...rest }) => rest;

/**
 * Mirror the newest F4 ledgers (history/<slug>.json or beta/history/<slug>.json) and append
 * every new or changed ledger entry (any field but lastSeen `l`) to ledger/entries, so every
 * entry is in the archive long before the ledger's 400-day prune can drop it. A ledger that
 * is not newer than the mirror is ignored.
 */
export async function ingestLedgerDir(ctx, dir, { channel, artifact, rel = '.' }) {
  const P = await loadProduct();
  const { serializeLedger } = await import('../history.js');
  const prefix = channel === 'beta' ? 'beta/history' : 'history';
  const results = [];
  for (const { slug, file } of slugFiles(dir)) {
    const p = rel === '.' ? `${slug}.json` : `${rel}/${slug}.json`;
    let ledger;
    try { ledger = readJsonFile(file).json; } catch (err) { results.push({ slug, path: p, status: 'unreadable', detail: err.message }); continue; }
    if (!ledger || ledger.format !== P.HISTORY_FORMAT || !ledger.jobs || typeof ledger.jobs !== 'object' || !iso(ledger.lastRunAt)) { results.push({ slug, path: p, status: 'invalid' }); continue; }
    const target = path.join(ctx.dir, prefix, `${slug}.json`);
    const prev = readJson(target, null);
    if (prev && iso(prev.lastRunAt) >= iso(ledger.lastRunAt)) { results.push({ slug, path: p, status: 'not-newer' }); continue; }
    const entryRows = [];
    for (const id of Object.keys(ledger.jobs).sort()) {
      const e = ledger.jobs[id];
      if (!e || typeof e !== 'object') continue;
      const was = prev && prev.jobs && prev.jobs[id];
      if (was && canonical(withoutL(was)) === canonical(withoutL(e))) continue;
      entryRows.push({ company: slug, channel, id, ...e, ledgerRunAt: iso(ledger.lastRunAt), ledgerRuns: ledger.runs ?? null, recordedAt: ctx.now, artifact: artifact || null });
    }
    appendRows(ctx.dir, 'ledger/entries', ctx.month, entryRows);
    writeIfChanged(target, serializeLedger(ledger));
    ctx.dirty = true;
    results.push({ slug, path: p, status: 'mirrored', lastRunAt: ledger.lastRunAt, entries: Object.keys(ledger.jobs).length, changedEntries: entryRows.length });
  }
  return results;
}

/* ------------------------------------------------------------ vetting audit */

const flagKey = (f) => hashOf([f.id, f.parsed || null, (f.flags || []).slice().sort(), !!f.quarantined, f.salaryFlag ? f.salaryFlag.codes : null]);
const verdictKey = (v) => hashOf(v, 16);

function readJsonlFile(file) {
  const buf = readFileChecked(file);
  const out = [];
  for (const line of buf.toString('utf8').split('\n')) { if (!line.trim()) continue; try { const o = JSON.parse(line); if (o && typeof o === 'object' && !Array.isArray(o)) out.push(o); } catch { /* the whole file is kept as a blob anyway */ } }
  return out;
}

/**
 * Salary-vetting report: per run counts and membership (audit/runs: which flag and verdict
 * records the run had), every distinct flag record (audit/flags) and every distinct verdict
 * (audit/verdicts: LLM verdicts from llm-verdicts.jsonl, reviewed ones from the repo's
 * data/vetting/<date>/verdicts.jsonl), each stored complete. The files themselves are kept
 * as blobs by ingestArtifact.
 */
export function ingestVetting(ctx, dir, { artifact, source = 'artifact' }) {
  const knownFlags = new Set(readTable(ctx.dir, 'audit/flags').map((r) => r.key));
  const knownVerdicts = new Set(readTable(ctx.dir, 'audit/verdicts').map((r) => r.key));
  const at = (artifact && artifact.createdAt) || ctx.now;
  const out = { flags: 0, newFlags: 0, verdicts: 0, newVerdicts: 0 };
  const flagRows = [];
  const flagKeys = [];
  const flagsFile = path.join(dir, 'flags.jsonl');
  for (const f of fs.existsSync(flagsFile) ? readJsonlFile(flagsFile) : []) {
    if (typeof f.id !== 'string') continue;
    out.flags++;
    const key = flagKey(f);
    flagKeys.push(key);
    if (knownFlags.has(key)) continue;
    knownFlags.add(key);
    flagRows.push({ key, firstSeenAt: at, artifact: artifact || null, ...f });
  }
  out.newFlags = flagRows.length;
  const verdictRows = [];
  const verdictKeys = [];
  for (const name of ['llm-verdicts.jsonl', 'verdicts.jsonl']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    for (const v of readJsonlFile(file)) {
      if (typeof v.id !== 'string') continue;
      out.verdicts++;
      const key = verdictKey(v);
      verdictKeys.push(key);
      if (knownVerdicts.has(key)) continue;
      knownVerdicts.add(key);
      verdictRows.push({ key, recordedAt: ctx.now, source: name === 'verdicts.jsonl' && source === 'repo' ? 'repo' : source, file: name, artifact: artifact || null, ...v });
    }
  }
  out.newVerdicts = verdictRows.length;
  let counts = null;
  try { counts = readJsonFile(path.join(dir, 'flags.counts.json')).json; } catch { counts = null; }
  appendRows(ctx.dir, 'audit/flags', ctx.month, flagRows);
  appendRows(ctx.dir, 'audit/verdicts', ctx.month, verdictRows);
  if (source === 'artifact') {
    const blocking = counts && typeof counts === 'object' ? Object.values(counts).reduce((s, c) => s + (Number(c && c.blocking) || 0), 0) : null;
    appendRows(ctx.dir, 'audit/runs', ctx.month, [{ at, artifact: artifact || null, recordedAt: ctx.now, blocking, counts, ...out, flagKeys, verdictKeys }]);
  }
  if (flagRows.length || verdictRows.length || source === 'artifact') ctx.dirty = true;
  return out;
}

/* ------------------------------------------------------------ artifacts */

/** Ingest-log key of an artifact: its id, else a hash of its file list and contents. */
export function artifactKey(artifact, dir) {
  if (artifact && artifact.id) return `artifact:${artifact.id}`;
  const files = listFiles(dir).map((r) => [r, sha256(fs.readFileSync(path.join(dir, r)))]);
  return `content:${hashOf(files, 32)}`;
}

/** Record an artifact in the ingest log without reading it (e.g. an untrusted run). */
export function logArtifact(ctx, artifact, status, detail = null, key = `artifact:${artifact.id}`, extra = {}) {
  if (ctx.done.has(key)) return false;
  appendRows(ctx.dir, 'ingests', ctx.month, [{ key, status, ...artifact, ingestedAt: ctx.now, detail, ...extra }]);
  if (DONE_STATUSES.includes(status)) ctx.done.add(key);
  ctx.dirty = true;
  return true;
}

/**
 * Ingest one downloaded artifact directory by name.
 * @returns { status: "ingested"|"skipped", detail, results, files }
 */
export async function ingestArtifact(ctx, { name, dir, artifact = null }) {
  if (!isKnownArtifact(name)) throw new Error(`unknown artifact name "${name}"`);
  const key = artifactKey(artifact, dir);
  if (ctx.done.has(key)) return { status: 'skipped', detail: 'already ingested', results: [], files: [] };
  const meta = artifact ? { id: artifact.id || null, name, runId: artifact.runId || null, workflow: artifact.workflow || null, event: artifact.event || null, branch: artifact.branch || null, headSha: artifact.headSha || null, createdAt: artifact.createdAt || null, ...(artifact.via ? { via: artifact.via } : {}) } : { name };
  const ref = { id: meta.id || null, name, runId: meta.runId || null };
  let results = [];
  const structured = new Map(); // relative path -> how it is archived
  if (SNAPSHOT_ARTIFACTS[name] || name.startsWith(BETA_CRAWL_PREFIX)) {
    const spec = SNAPSHOT_ARTIFACTS[name] || { channel: 'beta', snapshots: '.', history: null };
    results = await ingestSnapshotDir(ctx, path.join(dir, spec.snapshots), { channel: spec.channel, artifact: ref, rel: spec.snapshots });
    if (spec.history) results.push(...(await ingestLedgerDir(ctx, path.join(dir, spec.history), { channel: spec.channel, artifact: ref, rel: spec.history })).map((r) => ({ ...r, ledger: true })));
  } else if (name === 'history-ledger') {
    results = await ingestLedgerDir(ctx, dir, { channel: 'stable', artifact: ref });
  } else if (name === 'salary-vetting') {
    results = [{ status: 'audit', ...ingestVetting(ctx, dir, { artifact: ref }) }];
  } else if (REFERENCE_ARTIFACTS.includes(name)) {
    const { importSpool } = await import('./reference.js');
    results = await importSpool(ctx, dir, { artifact: ref });
  }
  for (const r of results) {
    if (!r.path) continue;
    if (['folded', 'duplicate', 'late'].includes(r.status)) structured.set(r.path, r.status === 'late' ? 'late' : 'snapshot');
    else if (['mirrored', 'not-newer'].includes(r.status)) structured.set(r.path, r.status === 'mirrored' ? 'ledger' : 'ledger (older than the mirror)');
  }
  // Every other file is kept whole, deduplicated by content.
  const files = [];
  for (const rel of listFiles(dir)) {
    let buf;
    try { buf = readFileChecked(path.join(dir, rel)); } catch (err) { files.push({ path: rel, stored: `unreadable: ${err.message}` }); continue; }
    const info = { path: rel, bytes: buf.length, sha256: sha256(buf) };
    if (structured.has(rel) && structured.get(rel) !== 'ledger (older than the mirror)') { files.push({ ...info, stored: structured.get(rel) }); continue; }
    const refBlob = ctx.blobs.put(fileBlobValue(buf));
    files.push({ ...info, stored: 'blob', blob: refBlob.$blob });
    ctx.dirty = true;
  }
  const summary = results.reduce((s, r) => { s[r.status || 'done'] = (s[r.status || 'done'] || 0) + 1; return s; }, {});
  const detail = Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(', ') || (files.length ? `${files.length} file(s) kept as blobs` : 'nothing to ingest');
  logArtifact(ctx, meta, files.length || results.length ? 'ingested' : 'empty', detail, key, { files });
  return { status: 'ingested', detail, results, files };
}

/* ------------------------------------------------------------ README on the data branch */

const README = `# melon-seek data archive (machine-maintained)

Permanent, append-only and lossless history of every job posting version (full text
included, deduplicated by content), company aggregate, cross-company comparison,
reference dataset (FX, rents, cost index, tax tables, policy constants), salary-vetting
audit record and F4 ledger entry that melon-seek has seen. This branch, not any workflow
artifact and not the F4 ledger, is the system of record.

- Written only by \`.github/workflows/archive.yml\` and \`archive-backfill.yml\`
  (scripts/archive/ on the code branch). Never edited by hand, never force-pushed,
  never merged into the code branch.
- Layout, schema (MANIFEST.json \`schemaVersion\`), migrations, restore and size
  projections: docs/DATA_ARCHIVE.md on the code branch.
- Integrity: \`node scripts/archive/verify.js --archive <this checkout>\`.
- Any observed snapshot: \`node scripts/archive/reconstruct.js --archive <this checkout> --company <slug> --date <YYYY-MM-DD>\`.
- F4 listing ledger: \`history/<slug>.json\` (stable) and \`beta/history/<slug>.json\`, the
  same layout .github/scripts/ledger.sh reads in branch mode; or
  \`node scripts/archive/restore.js --archive <this checkout> --out data/history\`.
`;

export function writeReadme(dir) {
  writeIfChanged(path.join(dir, 'README.md'), README);
}

/* ------------------------------------------------------------ CLI */

async function main(argv) {
  const a = parseArgs(argv);
  if (!a.name || !a.dir) {
    console.error('usage: node scripts/archive/ingest.js --archive DIR --name <artifact name> --dir <downloaded dir> [--artifact-id N --run-id N --workflow W --event E --branch B --head-sha S --created-at ISO] [--now ISO]');
    return 2;
  }
  const dir = archiveDir(a.archive);
  const now = iso(a.now) || new Date().toISOString();
  const ctx = await openArchive(dir, { now });
  const artifact = a['artifact-id'] ? {
    id: Number(a['artifact-id']), runId: a['run-id'] ? Number(a['run-id']) : null, workflow: a.workflow || null, event: a.event || null,
    branch: a.branch || null, headSha: a['head-sha'] || null, createdAt: iso(a['created-at']),
  } : null;
  const r = await ingestArtifact(ctx, { name: a.name, dir: path.resolve(a.dir), artifact });
  closeArchive(ctx);
  console.log(`archive: ${a.name}${artifact ? ` #${artifact.id}` : ''}: ${r.status} (${r.detail || ''}); reconstruct deep-equal checks passed: ${ctx.checks.reconstructed}`);
  for (const x of r.results) console.log(`  ${JSON.stringify(x)}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

export { dist };

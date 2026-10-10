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
//   history-ledger                                   <slug>.json, the F4 ledger (stable)
//   salary-vetting                                   flags.jsonl, flags.counts.json, llm-verdicts.jsonl
//   archive-reference                                a record.js spool (reference-data versions)
//
// Idempotent: an artifact already in the ingest log (by artifact id, else by content
// hash) changes nothing; an observation already folded (same company + fetchedAt) is skipped.
// Every file is treated as untrusted data: JSON only, names checked, sizes capped.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  SLUG_RE, sha256, hashOf, iso, monthOf, dateOf, appendRows, readTable, readState, writeState,
  writeManifest, readJson, writeIfChanged, codeSha, parseArgs, archiveDir, dist,
} from './lib.js';
import { loadHelpers, deriveRow, loadCompany, saveCompany, foldObservation, suspectDrop, payStats } from './jobs.js';

export const SNAPSHOT_ARTIFACTS = Object.freeze({
  'job-board-snapshots': { channel: 'stable', snapshots: '.', history: null },
  'job-board-snapshots-pages': { channel: 'stable', snapshots: '.', history: null },
  'job-board-snapshots-beta': { channel: 'beta', snapshots: 'snapshots', history: 'history' },
});
export const KNOWN_ARTIFACTS = Object.freeze([...Object.keys(SNAPSHOT_ARTIFACTS), 'history-ledger', 'salary-vetting', 'archive-reference']);
/** Largest artifact file read (the biggest real snapshot is ~40 MB). */
export const MAX_FILE_BYTES = 300 * 1024 * 1024;
const FUTURE_SLACK_MS = 60 * 60 * 1000;

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

function readJsonFile(file) {
  const st = fs.lstatSync(file);
  if (!st.isFile()) throw new Error('not a regular file');
  if (st.size > MAX_FILE_BYTES) throw new Error(`too large (${st.size} bytes)`);
  const buf = fs.readFileSync(file);
  return { buf, json: JSON.parse(buf.toString('utf8')) };
}

/** <slug>.json files directly in dir (no symlinks, valid slugs), sorted. */
function slugFiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => n.endsWith('.json') && SLUG_RE.test(n.slice(0, -5)) && !n.includes('..')).sort().map((n) => ({ slug: n.slice(0, -5), file: path.join(dir, n) }));
}

/* ------------------------------------------------------------ context */

/** Load what an ingest needs once (state, known keys) and flush it at the end. */
export async function openArchive(dir, { now = new Date().toISOString() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const companies = readState(dir, 'companies', {});
  const observations = readTable(dir, 'observations');
  const obsKeys = new Set(observations.map((o) => `${o.company}|${o.observedAt}|${o.status}`));
  const ingests = readTable(dir, 'ingests');
  const done = new Set(ingests.filter((r) => ['ingested', 'superseded', 'empty', 'untrusted'].includes(r.status)).map((r) => r.key));
  return { dir, now, month: monthOf(now), companies, obsKeys, done, dirty: false, generator: await codeSha() };
}

export function closeArchive(ctx) {
  writeState(ctx.dir, 'companies', sortObj(ctx.companies));
  writeReadme(ctx.dir);
  writeManifest(ctx.dir, { now: ctx.now, generator: ctx.generator ? `scripts/archive@${ctx.generator}` : 'scripts/archive' });
}

const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

/* ------------------------------------------------------------ snapshots */

/**
 * Fold one snapshot payload (already parsed) into the archive.
 * @returns observation row (also appended), or null when it was already folded.
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

  const meta = ctx.companies[slug] || (ctx.companies[slug] = { slug });
  if (meta.lastObservedAt && observedAt <= meta.lastObservedAt) {
    if (observedAt === meta.lastObservedAt) return null; // already folded
    const k = `${slug}|${observedAt}|late`;
    if (ctx.obsKeys.has(k)) return null;
    ctx.obsKeys.add(k);
    const row = { ...base, observedAt, status: 'late', detail: `older than the latest observation ${meta.lastObservedAt}; not folded`, jobs: jobsIn.length };
    appendRows(ctx.dir, 'observations', ctx.month, [row]);
    ctx.dirty = true;
    return row;
  }

  // Same upgrade + gate as the build (scripts/build-static.js readSnapshot).
  const current = payload.normalizerVersion === P.NORMALIZER_VERSION;
  let jobs = jobsIn.filter((j) => j && typeof j === 'object' && typeof j.id === 'string' && j.id.startsWith(`${slug}:`));
  const invalid = jobsIn.length - jobs.length;
  if (!jobs.length) return reject('no job has an id for this company');
  if (!current) jobs = P.relocateJobs(P.rekeyBoardJobs(jobs).jobs);
  jobs = P.vetSalaries(jobs);

  const trimmedTo = Number(payload.descriptionsTrimmedTo) || null;
  const rctx = { helpers: h, norm: P.NORMALIZER_VERSION, trimmedTo };
  const rows = jobs.map((j) => ({ id: j.id, data: deriveRow(j, rctx) }));
  const state = loadCompany(ctx.dir, slug);
  const capped = payload.jobsCapped && typeof payload.jobsCapped === 'object' ? payload.jobsCapped : null;
  const suspect = !capped && suspectDrop(state.open.size, rows.length);
  const partial = !!capped || suspect;
  const { status, closedRows, stats } = foldObservation(state, meta, { observedAt, rows, partial }, { company: slug });
  if (status !== 'folded') return null;

  appendRows(ctx.dir, `jobs/${slug}`, ctx.month, closedRows);
  saveCompany(ctx.dir, slug, state);
  Object.assign(meta, {
    name: pc.name || meta.name || slug, channel, source: pc.source || meta.source || null, board: pc.board || meta.board || null,
    color: pc.color || meta.color || null, open: state.open.size, ids: state.ids.size,
  });

  const openRows = [...state.open.values()].filter((r) => r.validTo == null);
  const ps = payStats(openRows);
  const row = {
    ...base, observedAt, status: 'folded',
    mode: payload.mode || null, normalizerVersion: payload.normalizerVersion || null, norm: P.NORMALIZER_VERSION,
    upgraded: !current, partial, ...(suspect ? { suspectDrop: true } : {}), ...(capped ? { jobsCapped: capped } : {}),
    ...(trimmedTo ? { descriptionsTrimmedTo: trimmedTo } : {}),
    jobs: jobsIn.length, invalid, postings: stats.postings, salaried: ps.salaried, quarantined: ps.quarantined,
    opened: stats.opened, reopened: stats.reopened, closed: stats.closed, unseen: stats.unseen,
    changed: stats.changed, payChanged: stats.payChanged, sourceChanged: stats.sourceChanged,
  };
  appendRows(ctx.dir, 'observations', ctx.month, [row]);
  ctx.obsKeys.add(`${slug}|${observedAt}|folded`);

  // Daily aggregate: one row per company per UTC date (the first observation of the date);
  // its counts cover every fold since the previous daily row, so nothing is dropped.
  const pend = meta.pending || (meta.pending = { opened: 0, reopened: 0, closed: 0, unseen: 0, changed: 0, payChanged: 0, sourceChanged: 0, observations: 0 });
  for (const k of Object.keys(pend)) if (k !== 'observations') pend[k] += stats[k] || 0;
  pend.observations += 1;
  const day = dateOf(observedAt);
  if (!meta.lastDailyDate || day > meta.lastDailyDate) {
    appendRows(ctx.dir, 'daily', ctx.month, [{
      date: day, company: slug, channel, observedAt, since: meta.lastDailyAt || null,
      postings: openRows.length, salaried: ps.salaried, quarantined: ps.quarantined, ...pend,
      usd: ps.usd, cells: ps.cells,
    }]);
    meta.lastDailyDate = day;
    meta.lastDailyAt = observedAt;
    meta.pending = { opened: 0, reopened: 0, closed: 0, unseen: 0, changed: 0, payChanged: 0, sourceChanged: 0, observations: 0 };
  }
  ctx.dirty = true;
  return row;
}

/** Every <slug>.json snapshot of a directory, oldest fetchedAt first. */
export async function ingestSnapshotDir(ctx, dir, { channel, artifact }) {
  const loaded = [];
  const results = [];
  for (const { slug, file } of slugFiles(dir)) {
    try {
      const { buf, json } = readJsonFile(file);
      loaded.push({ slug, payload: json, fileSha: sha256(buf), bytes: buf.length });
    } catch (err) {
      results.push({ slug, status: 'unreadable', detail: err.message });
    }
  }
  loaded.sort((a, b) => String(iso(a.payload && a.payload.fetchedAt)).localeCompare(String(iso(b.payload && b.payload.fetchedAt))) || (a.slug < b.slug ? -1 : 1));
  for (const item of loaded) {
    const r = await ingestSnapshot(ctx, { ...item, channel, artifact });
    results.push(r ? { slug: item.slug, status: r.status, observedAt: r.observedAt, postings: r.postings, opened: r.opened, closed: r.closed, changed: r.changed } : { slug: item.slug, status: 'duplicate' });
    item.payload = null; // free memory between big boards
  }
  return results;
}

/* ------------------------------------------------------------ ledger (F4) */

/**
 * Mirror the newest F4 ledgers (history/<slug>.json or beta/history/<slug>.json) and
 * append every newly closed ledger entry to ledger/closed/ (kept after the ledger's
 * 400-day prune). A ledger older than the mirror is ignored.
 */
export async function ingestLedgerDir(ctx, dir, { channel, artifact }) {
  const P = await loadProduct();
  const prefix = channel === 'beta' ? 'beta/history' : 'history';
  const results = [];
  for (const { slug, file } of slugFiles(dir)) {
    let ledger;
    try { ledger = readJsonFile(file).json; } catch (err) { results.push({ slug, status: 'unreadable', detail: err.message }); continue; }
    if (!ledger || ledger.format !== P.HISTORY_FORMAT || !ledger.jobs || typeof ledger.jobs !== 'object' || !iso(ledger.lastRunAt)) { results.push({ slug, status: 'invalid' }); continue; }
    const target = path.join(ctx.dir, prefix, `${slug}.json`);
    const prev = readJson(target, null);
    if (prev && iso(prev.lastRunAt) >= iso(ledger.lastRunAt)) { results.push({ slug, status: 'not-newer' }); continue; }
    const closedRows = [];
    for (const id of Object.keys(ledger.jobs).sort()) {
      const e = ledger.jobs[id];
      if (!e || typeof e !== 'object' || !e.c) continue;
      if (!id.startsWith(`${slug}:`)) continue;
      const was = prev && prev.jobs && prev.jobs[id];
      if (was && was.c === e.c && was.s === e.s) continue;
      closedRows.push({ company: slug, channel, id, ...e, recordedAt: ctx.now, ledgerRunAt: iso(ledger.lastRunAt), artifact: artifact || null });
    }
    appendRows(ctx.dir, 'ledger/closed', ctx.month, closedRows);
    const { serializeLedger } = await import('../history.js');
    writeIfChanged(target, serializeLedger(ledger));
    ctx.dirty = true;
    results.push({ slug, status: 'mirrored', lastRunAt: ledger.lastRunAt, entries: Object.keys(ledger.jobs).length, newlyClosed: closedRows.length });
  }
  return results;
}

/* ------------------------------------------------------------ vetting audit */

const flagKey = (f) => hashOf([f.id, f.parsed || null, (f.flags || []).slice().sort(), !!f.quarantined, f.salaryFlag ? f.salaryFlag.codes : null]);
const verdictKey = (v) => hashOf([v.id, v.parsed || null, v.reviewer || null, v.verdict || null, v.corrected || null, v.reviewed_at || null]);

function readJsonlFile(file) {
  const { buf } = (() => { const st = fs.lstatSync(file); if (!st.isFile() || st.size > MAX_FILE_BYTES) throw new Error('bad file'); return { buf: fs.readFileSync(file) }; })();
  const out = [];
  for (const line of buf.toString('utf8').split('\n')) { if (!line.trim()) continue; try { const o = JSON.parse(line); if (o && typeof o === 'object' && !Array.isArray(o)) out.push(o); } catch { /* skip */ } }
  return out;
}

/**
 * Salary-vetting report: per run counts (audit/runs), every distinct flag record
 * (audit/flags, one row per job id + parsed pay + flag set, first time seen) and every
 * distinct verdict (audit/verdicts: LLM verdicts from llm-verdicts.jsonl, reviewed ones
 * from the repo's data/vetting/<date>/verdicts.jsonl).
 */
export function ingestVetting(ctx, dir, { artifact, source = 'artifact' }) {
  const knownFlags = new Set(readTable(ctx.dir, 'audit/flags').map((r) => r.key));
  const knownVerdicts = new Set(readTable(ctx.dir, 'audit/verdicts').map((r) => r.key));
  const at = (artifact && artifact.createdAt) || ctx.now;
  const out = { flags: 0, newFlags: 0, verdicts: 0, newVerdicts: 0 };
  const flagRows = [];
  const flagsFile = path.join(dir, 'flags.jsonl');
  const flags = fs.existsSync(flagsFile) ? readJsonlFile(flagsFile) : [];
  for (const f of flags) {
    if (typeof f.id !== 'string') continue;
    out.flags++;
    const key = flagKey(f);
    if (knownFlags.has(key)) continue;
    knownFlags.add(key);
    const { excerpt, pay_snippets: snippets, ...rest } = f;
    flagRows.push({ key, firstSeenAt: at, artifact: artifact || null, ...rest, excerpt: typeof excerpt === 'string' ? excerpt.slice(0, 400) : null, pay_snippets: Array.isArray(snippets) ? snippets.slice(0, 3).map((s) => String(s).slice(0, 250)) : [] });
  }
  out.newFlags = flagRows.length;
  const verdictRows = [];
  for (const name of ['llm-verdicts.jsonl', 'verdicts.jsonl']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    for (const v of readJsonlFile(file)) {
      if (typeof v.id !== 'string') continue;
      out.verdicts++;
      const key = verdictKey(v);
      if (knownVerdicts.has(key)) continue;
      knownVerdicts.add(key);
      verdictRows.push({ key, recordedAt: ctx.now, source: name === 'verdicts.jsonl' && source === 'repo' ? 'repo' : source, artifact: artifact || null, ...v });
    }
  }
  out.newVerdicts = verdictRows.length;
  let counts = null;
  try { counts = readJsonFile(path.join(dir, 'flags.counts.json')).json; } catch { counts = null; }
  appendRows(ctx.dir, 'audit/flags', ctx.month, flagRows);
  appendRows(ctx.dir, 'audit/verdicts', ctx.month, verdictRows);
  if (source === 'artifact' && (flags.length || counts)) {
    const blocking = counts && typeof counts === 'object' ? Object.values(counts).reduce((s, c) => s + (Number(c && c.blocking) || 0), 0) : null;
    appendRows(ctx.dir, 'audit/runs', ctx.month, [{ at, artifact: artifact || null, recordedAt: ctx.now, blocking, counts, ...out }]);
  }
  if (flagRows.length || verdictRows.length || source === 'artifact') ctx.dirty = true;
  return out;
}

/* ------------------------------------------------------------ artifacts */

/** Ingest-log key of an artifact: its id, else a hash of its file list and sizes. */
export function artifactKey(artifact, dir) {
  if (artifact && artifact.id) return `artifact:${artifact.id}`;
  const files = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile()) files.push([r, sha256(fs.readFileSync(path.join(d, e.name)))]); } };
  walk(dir, '');
  return `content:${hashOf(files.sort(), 32)}`;
}

/** Record an artifact in the ingest log without reading it (e.g. a superseded ledger). */
export function logArtifact(ctx, artifact, status, detail = null, key = `artifact:${artifact.id}`) {
  if (ctx.done.has(key)) return false;
  appendRows(ctx.dir, 'ingests', ctx.month, [{ key, status, ...artifact, ingestedAt: ctx.now, detail }]);
  if (['ingested', 'superseded', 'empty', 'untrusted'].includes(status)) ctx.done.add(key);
  ctx.dirty = true;
  return true;
}

/**
 * Ingest one downloaded artifact directory by name.
 * @returns { status: "ingested"|"skipped"|..., results }
 */
export async function ingestArtifact(ctx, { name, dir, artifact = null }) {
  if (!KNOWN_ARTIFACTS.includes(name)) throw new Error(`unknown artifact name "${name}"`);
  const key = artifactKey(artifact, dir);
  if (ctx.done.has(key)) return { status: 'skipped', detail: 'already ingested', results: [] };
  const meta = artifact ? { id: artifact.id || null, name, runId: artifact.runId || null, workflow: artifact.workflow || null, event: artifact.event || null, branch: artifact.branch || null, headSha: artifact.headSha || null, createdAt: artifact.createdAt || null } : { name };
  const ref = { id: meta.id || null, name, runId: meta.runId || null };
  let results = [];
  let detail = null;
  if (SNAPSHOT_ARTIFACTS[name]) {
    const spec = SNAPSHOT_ARTIFACTS[name];
    results = await ingestSnapshotDir(ctx, path.join(dir, spec.snapshots), { channel: spec.channel, artifact: ref });
    if (spec.history) results.push(...(await ingestLedgerDir(ctx, path.join(dir, spec.history), { channel: spec.channel, artifact: ref })).map((r) => ({ ...r, ledger: true })));
  } else if (name === 'history-ledger') {
    results = await ingestLedgerDir(ctx, dir, { channel: 'stable', artifact: ref });
  } else if (name === 'salary-vetting') {
    results = [ingestVetting(ctx, dir, { artifact: ref })];
  } else if (name === 'archive-reference') {
    const { importSpool } = await import('./reference.js');
    results = await importSpool(ctx, dir, { artifact: ref });
  }
  const summary = results.reduce((s, r) => { s[r.status || 'done'] = (s[r.status || 'done'] || 0) + 1; return s; }, {});
  detail = Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing to ingest';
  logArtifact(ctx, meta, results.length ? 'ingested' : 'empty', detail, key);
  return { status: 'ingested', detail, results };
}

/* ------------------------------------------------------------ README on the data branch */

const README = `# melon-seek data archive (machine-maintained)

Permanent, append-only history of every job posting version, company aggregate,
cross-company comparison, reference dataset (FX, rents, cost index, tax tables,
policy constants) and salary-vetting audit record that melon-seek has seen.

- Written only by \`.github/workflows/archive.yml\` and \`archive-backfill.yml\`
  (scripts/archive/ on the code branch). Never edited by hand, never force-pushed,
  never merged into the code branch.
- Layout, schema (MANIFEST.json \`schemaVersion\`), migrations, restore and size
  projections: docs/DATA_ARCHIVE.md on the code branch.
- Integrity: \`node scripts/archive/verify.js --archive <this checkout>\`.
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
  console.log(`archive: ${a.name}${artifact ? ` #${artifact.id}` : ''}: ${r.status} (${r.detail || ''})`);
  for (const x of r.results) console.log(`  ${JSON.stringify(x)}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

export { dist };

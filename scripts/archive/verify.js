#!/usr/bin/env node
// Archive integrity validator (docs/DATA_ARCHIVE.md "Integrity").
//
//   node scripts/archive/verify.js --archive DIR                  this tree on its own
//   node scripts/archive/verify.js --archive DIR --prev-rev REV   also against an earlier commit of it
//   node scripts/archive/verify.js --archive DIR --prev-dir D2    also against an earlier copy
//   node scripts/archive/verify.js --archive DIR --history N      every one of the last N commits vs its parent
//   [--now ISO] [--quiet]
//
// On its own: MANIFEST.json lists every data file with the right sha256, bytes and
// row count, and nothing else is on disk; every row of every table matches its schema;
// job versions have validFrom <= validTo, contiguous sequence numbers per id, at most
// one open version per id, and closed versions carry end + endAt.
// Against an earlier state: closed append partitions and immutable files are byte for
// byte unchanged, every open append partition only grew (the old bytes are a prefix
// of the new file), no table's row count went down, no listed file disappeared, and
// every open job version of the earlier state is still open or was closed into an
// append partition (nothing is ever dropped).
// Exit 0 when valid, 1 with the list of problems otherwise.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  SCHEMA_VERSION, ARCHIVE_FORMAT, MONTH_RE, DATE_RE, SLUG_RE, DATASET_RE, kindOf, isClosedPartition, walkFiles,
  fileInfo, readJsonl, readJson, readManifest, tableTotals, parseArgs, archiveDir, iso, mutablePath, canonical,
} from './lib.js';
import { scanBlobs, blobHash, refsOf } from './blobs.js';

/* ------------------------------------------------------------ row schemas */

const isIso = (v) => typeof v === 'string' && iso(v) === v;
const isIsoish = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const opt = (f) => (v) => v == null || f(v);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isArr = (f) => (v) => Array.isArray(v) && v.every(f);

function check(row, spec, where, errs) {
  if (!isObj(row)) { errs.push(`${where}: not an object`); return; }
  for (const [k, f] of Object.entries(spec)) {
    if (!f(row[k])) errs.push(`${where}: field "${k}" invalid (${JSON.stringify(row[k])?.slice(0, 80)})`);
  }
}

const SALARY = (v) => v == null || (isObj(v) && opt(isNum)(v.min) && opt(isNum)(v.max) && opt(isStr)(v.currency));
const DIST = (v) => isObj(v) && isNum(v.n) && ['p10', 'p25', 'p50', 'p75', 'p90'].every((k) => opt(isNum)(v[k]));

const HASH32 = (v) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

export const SCHEMAS = {
  job: {
    id: isStr, company: (v) => isStr(v) && SLUG_RE.test(v), seq: (v) => Number.isInteger(v) && v >= 1,
    validFrom: isIso, validTo: opt(isIso), end: (v) => v == null || ['changed', 'closed', 'unseen', 'gap'].includes(v), endAt: opt(isIso),
    cause: (v) => ['new', 'reopened', 'resumed', 'source', 'derived', 'touched'].includes(v), changed: opt(isArr(isStr)),
    family: opt(isStr), titleReadable: opt((v) => typeof v === 'string'), vet: (v) => ['ok', 'quarantined', 'none'].includes(v),
    vetCodes: opt(isArr(isStr)), usd: (v) => v == null || (isObj(v) && opt(isNum)(v.mid) && isNum(v.fxPerUSD) && isStr(v.fxAsOf)),
    descHash: opt(isStr), descLen: isNum, src: isObj, up: opt(isObj), key: HASH32,
  },
  observations: { company: isStr, channel: isStr, observedAt: opt(isIso), status: (v) => ['folded', 'late', 'rejected'].includes(v), ingestedAt: isIso, payload: opt(isObj), extraJobs: opt(Array.isArray) },
  daily: { date: (v) => DATE_RE.test(v), company: isStr, channel: isStr, observedAt: isIso, postings: isNum, salaried: isNum, opened: isNum, closed: isNum, changed: isNum, payChanged: isNum, usd: DIST, cells: isArr(Array.isArray) },
  ingests: { key: isStr, status: (v) => ['ingested', 'superseded', 'empty', 'untrusted', 'failed'].includes(v), name: isStr, ingestedAt: isIso, files: opt(isArr(isObj)) },
  blobs: { h: HASH32, bytes: isNum },
  late: { company: isStr, observedAt: isIso, payload: isObj, jobs: Array.isArray, recordedAt: isIso },
  'reference/index': { dataset: (v) => DATASET_RE.test(v), asOf: (v) => DATE_RE.test(v), kind: (v) => ['version', 'confirm'].includes(v), sha256: (v) => /^[0-9a-f]{64}$/.test(v), file: isStr, recordedAt: isIso },
  'audit/flags': { key: isStr, firstSeenAt: isIsoish, id: isStr, flags: isArr(isStr) },
  'audit/verdicts': { key: isStr, recordedAt: isIso, id: isStr },
  'audit/runs': { at: isIsoish, recordedAt: isIso },
  'audit/refresh': { key: isStr, id: isStr, recordedAt: isIso },
  'ledger/entries': { company: isStr, id: isStr, f: isIsoish, recordedAt: isIso },
  'monthly/market': { month: (v) => MONTH_RE.test(v), scope: isStr, company: isStr, family: isStr, level: isStr, n: isNum, usd: DIST },
  'monthly/compstimate': { month: (v) => MONTH_RE.test(v), company: isStr, asOf: isIso },
  'monthly/juice': { month: (v) => MONTH_RE.test(v), kind: (v) => ['city', 'company'].includes(v), key: isStr, n: isNum },
};

function tableOf(rel) {
  if (/^jobs\//.test(rel)) return 'job';
  const m = /^monthly\/\d{4}-\d{2}\/([a-z0-9-]+)\.jsonl$/.exec(rel);
  if (m) return SCHEMAS[`monthly/${m[1]}`] ? `monthly/${m[1]}` : null;
  const t = rel.replace(/\/[^/]+$/, '');
  return SCHEMAS[t] ? t : null;
}

/* ------------------------------------------------------------ checks */

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/** Verify one archive tree. Returns { errors, warnings, stats }. */
export function verifyTree(dir, { now = new Date().toISOString() } = {}) {
  const errors = [];
  const warnings = [];
  const manifest = readManifest(dir);
  const files = walkFiles(dir);
  if (!files.length) return { errors, warnings, stats: { files: 0, empty: true } };
  if (!manifest) { errors.push('MANIFEST.json missing'); return { errors, warnings, stats: {} }; }
  if (manifest.format !== ARCHIVE_FORMAT) errors.push(`MANIFEST.json format "${manifest.format}" is not ${ARCHIVE_FORMAT}`);
  if (manifest.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion ${manifest.schemaVersion} is not ${SCHEMA_VERSION} (run scripts/archive/migrate.js)`);
  const listed = manifest.files || {};
  for (const rel of files) {
    const kind = kindOf(rel);
    if (kind === 'meta') continue;
    if (kind == null) { errors.push(`${rel}: file outside the archive layout`); continue; }
    if (!listed[rel]) { errors.push(`${rel}: not in MANIFEST.json`); continue; }
    const info = fileInfo(dir, rel);
    const m = listed[rel];
    if (m.sha256 !== info.sha256 || m.bytes !== info.bytes) errors.push(`${rel}: sha256/bytes differ from MANIFEST.json`);
    if (m.rows != null && m.rows !== info.rows) errors.push(`${rel}: ${info.rows} rows, MANIFEST.json says ${m.rows}`);
    if (m.kind !== kind) errors.push(`${rel}: kind ${m.kind} in MANIFEST.json, expected ${kind}`);
  }
  for (const rel of Object.keys(listed)) if (!fs.existsSync(path.join(dir, rel))) errors.push(`${rel}: in MANIFEST.json but missing`);
  const totals = tableTotals(listed);
  for (const [t, n] of Object.entries(manifest.tables || {})) if (totals[t] !== n) errors.push(`MANIFEST.json tables.${t} = ${n}, files add up to ${totals[t]}`);

  // Row schemas.
  let rowsChecked = 0;
  for (const rel of files) {
    if (!/\.jsonl(\.gz)?$/.test(rel)) continue;
    const t = tableOf(rel);
    if (!t) continue;
    let rows;
    try { rows = readJsonl(path.join(dir, rel)); } catch (err) { errors.push(err.message); continue; }
    rows.forEach((r, i) => { if (errors.length < 500) check(r, SCHEMAS[t], `${rel}:${i + 1}`, errors); });
    rowsChecked += rows.length;
  }

  // Job version invariants, per company.
  const companies = readJson(path.join(dir, 'state', 'companies.json'), {});
  const refs = new Set();
  let versions = 0;
  for (const slug of fs.existsSync(path.join(dir, 'jobs')) ? fs.readdirSync(path.join(dir, 'jobs')).sort() : []) {
    const cdir = path.join(dir, 'jobs', slug);
    const last = companies[slug] && companies[slug].lastObservedAt;
    if (!last) errors.push(`jobs/${slug}: no lastObservedAt in state/companies.json`);
    const openFile = mutablePath(cdir, 'open.jsonl');
    const open = openFile ? readJsonl(openFile) : [];
    const closed = walkFiles(cdir).filter((f) => kindOf(`jobs/${slug}/${f}`) === 'append').flatMap((f) => readJsonl(path.join(cdir, f)));
    const seqs = new Map();
    const openIds = new Set();
    for (const r of closed) {
      if (r.company !== slug) errors.push(`jobs/${slug}: closed row ${r.id} has company ${r.company}`);
      if (r.validTo == null || r.end == null || r.endAt == null) errors.push(`jobs/${slug}: closed row ${r.id}#${r.seq} lacks validTo/end/endAt`);
      else if (!(r.validTo < r.endAt)) errors.push(`jobs/${slug}: ${r.id}#${r.seq} endAt ${r.endAt} is not after validTo ${r.validTo}`);
      if (r.validTo != null && r.validFrom > r.validTo) errors.push(`jobs/${slug}: ${r.id}#${r.seq} validFrom ${r.validFrom} > validTo ${r.validTo}`);
      const s = seqs.get(r.id) || []; s.push(r.seq); seqs.set(r.id, s);
    }
    for (const r of open) {
      if (r.company !== slug) errors.push(`jobs/${slug}: open row ${r.id} has company ${r.company}`);
      if (openIds.has(r.id)) errors.push(`jobs/${slug}: two open versions of ${r.id}`);
      openIds.add(r.id);
      if (r.end != null || r.endAt != null) errors.push(`jobs/${slug}: open row ${r.id}#${r.seq} has end/endAt`);
      const to = r.validTo || last;
      if (to && r.validFrom > to) errors.push(`jobs/${slug}: ${r.id}#${r.seq} validFrom ${r.validFrom} > validTo ${to}`);
      if (last && r.validTo && r.validTo > last) errors.push(`jobs/${slug}: ${r.id}#${r.seq} validTo after the last observation`);
      const s = seqs.get(r.id) || []; s.push(r.seq); seqs.set(r.id, s);
    }
    const idsFile = mutablePath(cdir, 'ids.json');
    const ids = idsFile ? readJson(idsFile) : {};
    for (const [id, s] of seqs) {
      s.sort((a, b) => a - b);
      for (let i = 0; i < s.length; i++) if (s[i] !== i + 1) { errors.push(`jobs/${slug}: ${id} versions are ${s.join(',')} (not 1..n)`); break; }
      if (ids[id] !== s[s.length - 1]) errors.push(`jobs/${slug}: ids.json says ${id} -> ${ids[id]}, last version is ${s[s.length - 1]}`);
      if (openIds.has(id) && open.find((r) => r.id === id).seq !== s[s.length - 1]) errors.push(`jobs/${slug}: open version of ${id} is not its latest`);
    }
    for (const id of Object.keys(ids)) if (!seqs.has(id)) errors.push(`jobs/${slug}: ids.json lists ${id} with no version`);
    for (const r of [...closed, ...open]) {
      if (r.src && r.src.id !== r.id) errors.push(`jobs/${slug}: ${r.id}#${r.seq} src.id is ${r.src.id}`);
      for (const h of refsOf(r.src).concat(refsOf(r.up))) refs.add(h);
    }
    versions += closed.length + open.length;
  }

  // Blobs: each stored once, hash matches content, the index is exact, every reference resolves.
  let blobs = new Map();
  try { blobs = scanBlobs(dir); } catch (err) { errors.push(err.message); }
  for (const [h, { rel, row }] of blobs) {
    if (blobHash(row.v) !== h) errors.push(`${rel}: blob ${h} content does not match its hash`);
  }
  const index = readJson(path.join(dir, 'state', 'blob-index.json'), {});
  for (const [h, rel] of Object.entries(index)) if (!blobs.has(h) || blobs.get(h).rel !== rel) errors.push(`state/blob-index.json: ${h} -> ${rel} is wrong`);
  for (const [h] of blobs) if (!index[h]) errors.push(`state/blob-index.json: blob ${h} not indexed`);
  const entryRefs = (e) => (e && e.src ? refsOf(e.src) : []);
  for (const f of files.filter((x) => /^observations\//.test(x))) for (const o of readJsonl(path.join(dir, f))) for (const e of o.extraJobs || []) for (const h of entryRefs(e)) refs.add(h);
  for (const f of files.filter((x) => /^late\//.test(x))) for (const o of readJsonl(path.join(dir, f))) for (const e of o.jobs || []) for (const h of entryRefs(e)) refs.add(h);
  for (const f of files.filter((x) => /^ingests\//.test(x))) for (const o of readJsonl(path.join(dir, f))) for (const x of o.files || []) if (x.blob) refs.add(x.blob);
  for (const f of files.filter((x) => /^audit\/refresh\//.test(x))) for (const o of readJsonl(path.join(dir, f))) if (o.report && o.report.$blob) refs.add(o.report.$blob);
  for (const h of refs) if (!blobs.has(h)) errors.push(`blob ${h} is referenced but not stored`);
  return { errors, warnings, stats: { files: files.length, rowsChecked, versions, blobs: blobs.size, blobRefs: refs.size } };
}

function openRowsByKey(dir) {
  const out = new Map();
  if (!fs.existsSync(path.join(dir, 'jobs'))) return out;
  for (const slug of fs.readdirSync(path.join(dir, 'jobs'))) {
    const f = mutablePath(path.join(dir, 'jobs', slug), 'open.jsonl');
    for (const r of f ? readJsonl(f) : []) out.set(`${r.id}#${r.seq}`, r);
  }
  return out;
}

function closedRowsByKey(dir, onlyNewerThan = null) {
  const out = new Map();
  if (!fs.existsSync(path.join(dir, 'jobs'))) return out;
  for (const slug of fs.readdirSync(path.join(dir, 'jobs'))) {
    const cdir = path.join(dir, 'jobs', slug);
    for (const f of walkFiles(cdir)) {
      if (kindOf(`jobs/${slug}/${f}`) !== 'append') continue;
      if (onlyNewerThan && onlyNewerThan.has(`jobs/${slug}/${f}`)) continue;
      for (const r of readJsonl(path.join(cdir, f))) out.set(`${r.id}#${r.seq}`, r);
    }
  }
  return out;
}

const sameExceptClose = (a, b) => {
  const strip = ({ validTo, end, endAt, missedAt, ...rest }) => canonical(rest);
  return strip(a) === strip(b);
};

/**
 * Append-only checks of `dir` against an earlier state `prevDir` (both verified trees).
 * `now`: the clock that decides which partitions are closed.
 */
export function verifyAgainst(dir, prevDir, { now = new Date().toISOString() } = {}) {
  const errors = [];
  const prev = readManifest(prevDir);
  const next = readManifest(dir);
  if (!prev) return { errors };
  if (!next) return { errors: ['MANIFEST.json missing'] };
  for (const [rel, p] of Object.entries(prev.files || {})) {
    const n = next.files[rel];
    if (p.kind === 'append' || p.kind === 'immutable') {
      if (!n) { errors.push(`${rel}: ${p.kind} file was removed`); continue; }
      if (p.kind === 'immutable' || isClosedPartition(rel, now)) {
        if (n.sha256 !== p.sha256) errors.push(`${rel}: ${p.kind === 'immutable' ? 'immutable file' : 'closed partition'} changed`);
        continue;
      }
      if (n.bytes < p.bytes) { errors.push(`${rel}: append partition shrank (${p.bytes} -> ${n.bytes} bytes)`); continue; }
      const fd = fs.openSync(path.join(dir, rel), 'r');
      const head = Buffer.alloc(p.bytes);
      fs.readSync(fd, head, 0, p.bytes, 0);
      fs.closeSync(fd);
      if (sha256(head) !== p.sha256) errors.push(`${rel}: append partition was rewritten (old bytes are not a prefix)`);
      if ((n.rows ?? 0) < (p.rows ?? 0)) errors.push(`${rel}: row count went down`);
    } else if (p.kind === 'mutable' && !n) {
      const alt = rel.endsWith('.gz') ? rel.slice(0, -3) : `${rel}.gz`;
      if (!next.files[alt]) errors.push(`${rel}: mutable file was removed`);
    }
  }
  for (const [t, v] of Object.entries(prev.tables || {})) {
    if (t === 'jobs.open') continue; // open versions move to closed partitions
    if ((next.tables[t] ?? 0) < v) errors.push(`table ${t}: ${v} rows before, ${next.tables[t] ?? 0} now`);
  }
  // No job version is ever dropped: each earlier open version is still open (only its
  // validTo may change) or now sits in an append partition, unchanged apart from the close.
  const before = openRowsByKey(prevDir);
  const after = openRowsByKey(dir);
  let closedNow = null;
  for (const [k, r] of before) {
    const a = after.get(k);
    if (a) {
      if (!sameExceptClose(a, r)) errors.push(`job version ${k} changed while open`);
      continue;
    }
    if (!closedNow) closedNow = closedRowsByKey(dir);
    const c = closedNow.get(k);
    if (!c) errors.push(`job version ${k} disappeared (neither open nor closed)`);
    else if (!sameExceptClose(c, r)) errors.push(`job version ${k} changed when it was closed`);
  }
  return { errors };
}

/* ------------------------------------------------------------ git helpers */

function git(dir, args, opts = {}) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: opts.encoding || 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Extract commit `rev` of the git checkout `dir` into a new temporary directory. */
export function extractRev(dir, rev) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-archive-rev-'));
  const tar = execFileSync('git', ['-C', dir, 'archive', '--format=tar', rev], { maxBuffer: 4 * 1024 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', out], { input: tar, maxBuffer: 4 * 1024 * 1024 * 1024 });
  return out;
}

export function verifyAll({ dir, prevDir = null, prevRev = null, now }) {
  const r = verifyTree(dir, { now });
  let errors = [...r.errors];
  let tmp = null;
  try {
    if (prevRev) {
      let ok = true;
      try { git(dir, ['rev-parse', '--verify', `${prevRev}^{commit}`]); } catch { ok = false; }
      if (ok) { tmp = extractRev(dir, prevRev); prevDir = tmp; }
    }
    if (prevDir) errors = errors.concat(verifyAgainst(dir, prevDir, { now }).errors);
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { errors, stats: r.stats };
}

/** Check each of the last n commits of the checkout against its parent. */
export function verifyHistory(dir, n) {
  const revs = git(dir, ['rev-list', '--first-parent', `--max-count=${n + 1}`, 'HEAD']).trim().split('\n').filter(Boolean);
  const errors = [];
  for (let i = 0; i < revs.length; i++) {
    const cur = extractRev(dir, revs[i]);
    const parent = revs[i + 1] ? extractRev(dir, revs[i + 1]) : null;
    try {
      const when = git(dir, ['show', '-s', '--format=%cI', revs[i]]).trim();
      const now = new Date(Date.parse(when)).toISOString();
      const t = verifyTree(cur, { now });
      errors.push(...t.errors.map((e) => `${revs[i].slice(0, 9)}: ${e}`));
      if (parent) errors.push(...verifyAgainst(cur, parent, { now }).errors.map((e) => `${revs[i].slice(0, 9)} vs parent: ${e}`));
    } finally {
      fs.rmSync(cur, { recursive: true, force: true });
      if (parent) fs.rmSync(parent, { recursive: true, force: true });
    }
  }
  return { errors, commits: revs.length };
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['quiet'] });
  const dir = archiveDir(a.archive);
  const now = iso(a.now) || new Date().toISOString();
  let res;
  if (a.history) {
    res = verifyHistory(dir, Number(a.history) || 30);
    if (!a.quiet) console.log(`verify: ${res.commits} commit(s) checked`);
  } else {
    res = verifyAll({ dir, prevDir: a['prev-dir'] ? path.resolve(a['prev-dir']) : null, prevRev: a['prev-rev'] || null, now });
    if (!a.quiet) console.log(`verify: ${dir}: ${JSON.stringify(res.stats)}`);
  }
  if (res.errors.length) {
    for (const e of res.errors.slice(0, 200)) console.error(`::error::archive verify: ${e}`);
    if (res.errors.length > 200) console.error(`... and ${res.errors.length - 200} more`);
    return 1;
  }
  if (!a.quiet) console.log('verify: OK');
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

// Job postings as versioned rows (slowly-changing dimension, docs/DATA_ARCHIVE.md "jobs").
//
// LOSSLESS: each row keeps the posting exactly as the snapshot had it (`src`, every field;
// large fields such as descriptionHtml and sections as content-addressed blob references,
// scripts/archive/blobs.js), so scripts/archive/reconstruct.js rebuilds any observed
// snapshot. A new version starts when ANY field of the posting changes, or when the vetting
// gate's verdict on its pay changes. Next to `src` the row carries analytic fields derived
// at ingest (vetted pay, USD conversion with the FX used, role family, readable title,
// description hash) and, for snapshots written by an older normalizer, the fields the
// upgrade changed (`up`). Readers use view(row).
//
// Company state on disk (all under jobs/<slug>/):
//   open.jsonl      the open version of every posting seen in the latest observation
//                   (validTo null = "seen in the company's latest observation"), plus postings
//                   missing from a partial observation (explicit validTo, missedAt)
//   ids.json        { id: lastSeq } for every id ever seen (a returning id continues its sequence)
//   YYYY-MM.jsonl   closed versions, appended in the month they were closed (append-only)
import fs from 'node:fs';
import path from 'node:path';
import { hashOf, iso, dist, round100, canonical, readJsonl, readJson, jsonlText, writeMutable, mutablePath, allPartitions, assertSlug, monthOf } from './lib.js';
import { BLOB_MIN_BYTES, isRef } from './blobs.js';

/** Postings unseen this long on a partial board are closed with end "unseen". */
export const UNSEEN_CLOSE_DAYS = 30;
/** A full observation with fewer than this share of the open postings is treated as partial. */
export const SUSPECT_DROP_SHARE = 0.5;
export const SUSPECT_DROP_MIN_OPEN = 40;
const DAY = 86400000;

/** Fields a normalizer upgrade (relocateJobs, rekeyBoardJobs) may change; kept in `up` when it did. */
export const UPGRADE_FIELDS = Object.freeze(['locations', 'remote', 'sections', 'keywords']);
/** Posting fields whose change means the company edited the posting (cause "source"). */
export const SOURCE_FIELDS = Object.freeze(['title', 'department', 'team', 'employmentType', 'url', 'postedAt', 'reqId', 'descriptionHtml']);

let helpers = null;
/** Lazily import the product modules the row needs (readable titles, role families, FX). */
export async function loadHelpers() {
  if (helpers) return helpers;
  const [roles, palette, comp] = await Promise.all([
    import('../../public/features/roles.js'),
    import('../../public/viz/palette.js'),
    import('../../public/features/compstimate.js'),
  ]);
  helpers = {
    readableTitle: roles.readableTitle,
    roleFamily: comp.roleFamily || roles.roleFamily,
    FX_PER_USD: palette.FX_PER_USD,
    FX_AS_OF: palette.FX_AS_OF,
  };
  return helpers;
}

const str = (v) => (v == null || v === '' ? null : String(v));

/** USD view of a vetted salary with the FX used, or null. */
export function usdOf(salary, h) {
  if (!salary || typeof salary !== 'object') return null;
  const cur = String(salary.currency || 'USD').toUpperCase();
  const rate = cur === 'USD' ? 1 : h.FX_PER_USD[cur];
  if (!(rate > 0)) return null;
  const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const min = n(salary.min);
  const max = n(salary.max);
  const mid = n(salary.mid) != null ? n(salary.mid) : (min != null && max != null ? (min + max) / 2 : null);
  const conv = (v) => (v == null ? null : Math.round(v / rate));
  return { min: conv(min), max: conv(max), mid: conv(mid), fxPerUSD: rate, fxAsOf: h.FX_AS_OF };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * Plain text of a description for hashing: tags removed, the common entities decoded,
 * whitespace collapsed. Owned by the archive and frozen (descHash "v1"): it must never
 * follow changes in the product's own HTML handling. descHash tells a text edit from a
 * markup-only edit; the exact HTML is in the blob store.
 */
export function descriptionPlainText(html) {
  return String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (ENTITIES[k] != null) return ENTITIES[k];
      const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : k.startsWith('#') ? parseInt(k.slice(1), 10) : NaN;
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function descriptionFingerprint(html) {
  const text = descriptionPlainText(typeof html === 'string' ? html : '');
  return { descHash: text ? hashOf(text) : null, descLen: text.length };
}

/** Large values go to the blob store; the rest stay inline. */
function storeValue(k, v, blobs) {
  if (v == null) return v;
  if (isRef(v)) return blobs.put(v); // a raw value shaped like a reference is stored as a blob, so it round-trips
  if (k === 'descriptionHtml') return typeof v === 'string' && v.length ? blobs.put(v) : v;
  return JSON.stringify(v).length >= BLOB_MIN_BYTES ? blobs.put(v) : v;
}

/** The posting as stored: every field, large ones as blob references. */
export function storedSrc(job, blobs) {
  const out = {};
  for (const [k, v] of Object.entries(job)) if (v !== undefined) out[k] = storeValue(k, v, blobs);
  return out;
}

/** The posting exactly as observed (blob references resolved). */
export function restoreSrc(src, blobs) {
  const out = {};
  for (const [k, v] of Object.entries(src || {})) out[k] = isRef(v) ? blobs.get(v) : v;
  return out;
}

/**
 * One version's fields (no validity dates yet).
 * @param original  the job exactly as in the snapshot
 * @param vetted    the same job after the normalizer upgrade (old snapshots) and the vetting gate
 * @param ctx       { helpers, norm, blobs }
 */
export function deriveRow(original, vetted, ctx) {
  const h = ctx.helpers;
  const src = storedSrc(original, ctx.blobs);
  const up = {};
  for (const k of UPGRADE_FIELDS) {
    if (vetted[k] === undefined || canonical(vetted[k]) === canonical(original[k])) continue;
    up[k] = storeValue(k, vetted[k], ctx.blobs);
  }
  const flag = vetted.salaryFlag && typeof vetted.salaryFlag === 'object' ? vetted.salaryFlag : null;
  const vet = vetted.salary ? 'ok' : (vetted.salaryRaw || flag ? 'quarantined' : 'none');
  const title = str(original.title) || 'Untitled role';
  let family = null;
  try { family = h.roleFamily(title, vetted) || null; } catch { family = null; }
  let titleReadable = title;
  try { titleReadable = h.readableTitle(title) || title; } catch { /* keep */ }
  const row = {
    titleReadable,
    family,
    vet,
    vetCodes: flag && Array.isArray(flag.codes) ? flag.codes.map(String) : null,
    vetReason: flag && flag.reason ? String(flag.reason) : null,
    usd: usdOf(vetted.salary, h),
    ...descriptionFingerprint(original.descriptionHtml),
    norm: ctx.norm || null,
  };
  if (Object.keys(up).length) row.up = up;
  row.src = src;
  row.key = hashOf([src, vet, row.vetCodes], 32);
  return row;
}

const rawNames = (locs) => (Array.isArray(locs) ? locs.map((l) => (l && (l.rawName || l.name)) || null) : []);

/** Top-level posting fields that differ between two rows, and why. */
export function changedFields(a, b) {
  const keys = new Set([...Object.keys(a.src || {}), ...Object.keys(b.src || {})]);
  const changed = [...keys].filter((k) => canonical(a.src[k]) !== canonical(b.src[k])).sort();
  if (a.vet !== b.vet || canonical(a.vetCodes) !== canonical(b.vetCodes)) changed.push('vet');
  let cause = 'derived';
  const edited = changed.some((k) => SOURCE_FIELDS.includes(k))
    || (changed.includes('locations') && canonical(rawNames(a.src.locations)) !== canonical(rawNames(b.src.locations)))
    || (changed.includes('salary') && ((a.src.salary || {}).text || null) !== ((b.src.salary || {}).text || null));
  if (edited) cause = 'source';
  else if (changed.length === 1 && changed[0] === 'updatedAt') cause = 'touched';
  return { changed, cause };
}

/** The flat, analysis-friendly view of a stored row (no blob reads). */
export function view(row) {
  const s = { ...(row.src || {}), ...(row.up || {}) };
  const salary = row.vet === 'ok' ? s.salary || null : null;
  const salaryRaw = row.vet === 'quarantined' ? (s.salary || s.salaryRaw || null) : null;
  return {
    id: row.id, company: row.company, seq: row.seq, validFrom: row.validFrom, validTo: row.validTo, end: row.end, endAt: row.endAt,
    cause: row.cause, changed: row.changed,
    title: s.title || 'Untitled role', titleReadable: row.titleReadable, department: s.department ?? null, team: s.team ?? null,
    employmentType: s.employmentType ?? null, family: row.family, seniority: s.seniority || 'Mid',
    locations: Array.isArray(s.locations) ? s.locations : [], rawLocations: rawNames(s.locations), remote: s.remote === true,
    salary, salaryRaw, vet: row.vet, vetCodes: row.vetCodes, vetReason: row.vetReason, usd: row.usd,
    url: s.url ?? null, postedAt: s.postedAt ?? null, updatedAt: s.updatedAt ?? null, reqId: s.reqId ?? null,
    descHash: row.descHash, descLen: row.descLen, keywords: isRef(s.keywords) ? null : s.keywords || null, extras: s.extras || null, norm: row.norm,
  };
}

/** Assemble a stored version row in the documented field order. */
function versionRow(id, company, seq, from, data, extra) {
  return { id, company, seq, validFrom: from, validTo: null, end: null, endAt: null, cause: extra.cause, changed: extra.changed || null, ...data };
}

/* ------------------------------------------------------------ company state */

export function companyDir(dir, slug) {
  return path.join(dir, 'jobs', assertSlug(slug));
}

/** { open: Map(id -> row), ids: Map(id -> lastSeq) } for a company. */
export function loadCompany(dir, slug) {
  const cdir = companyDir(dir, slug);
  const openFile = mutablePath(cdir, 'open.jsonl');
  const open = new Map();
  for (const r of openFile ? readJsonl(openFile) : []) open.set(r.id, r);
  const idsFile = mutablePath(cdir, 'ids.json');
  const ids = new Map(Object.entries(idsFile ? readJson(idsFile) : {}));
  return { open, ids };
}

export function saveCompany(dir, slug, { open, ids }) {
  const cdir = companyDir(dir, slug);
  fs.mkdirSync(cdir, { recursive: true });
  const rows = [...open.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let changed = writeMutable(cdir, 'open.jsonl', jsonlText(rows));
  const idObj = Object.fromEntries([...ids.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  const lines = Object.entries(idObj).map(([k, v]) => `${JSON.stringify(k)}:${v}`);
  changed = writeMutable(cdir, 'ids.json', `{\n${lines.join(',\n')}\n}\n`) || changed;
  return changed;
}

/** Every closed version of a company, oldest partition first. */
export function closedVersions(dir, slug) {
  return allPartitions(companyDir(dir, slug)).flatMap((f) => readJsonl(f));
}

/** Every version (closed + open) of a company. */
export function allVersions(dir, slug) {
  const { open } = loadCompany(dir, slug);
  return [...closedVersions(dir, slug), ...open.values()];
}

/* ------------------------------------------------------------ fold */

/**
 * Fold one observation of a company into its state (mutates `state` and `meta`).
 * @param {{open, ids}} state
 * @param {object} meta   company meta from state/companies.json ({ lastObservedAt, ... })
 * @param {object} obs    { observedAt, rows: [{ id, data }], partial: boolean }
 * @returns {{ status, closedRows, stats }}  status: "folded" | "duplicate" | "late"
 */
export function foldObservation(state, meta, obs, { company }) {
  const at = obs.observedAt;
  if (meta.lastObservedAt && at === meta.lastObservedAt) return { status: 'duplicate', closedRows: [], stats: null };
  if (meta.lastObservedAt && at < meta.lastObservedAt) return { status: 'late', closedRows: [], stats: null };
  const prevAt = meta.lastObservedAt || null;
  const stats = { postings: 0, opened: 0, reopened: 0, resumed: 0, closed: 0, unseen: 0, changed: 0, payChanged: 0, sourceChanged: 0, partial: !!obs.partial };
  const closedRows = [];
  const seen = new Set();
  const close = (row, end, endAt = at) => {
    const { missedAt, ...rest } = row;
    closedRows.push({ ...rest, validTo: row.validTo || prevAt, end, endAt: missedAt || endAt });
    state.open.delete(row.id);
  };
  const nextSeq = (id, cur) => Math.max(Number(state.ids.get(id)) || 0, cur ? cur.seq : 0) + 1;

  for (const { id, data } of obs.rows) {
    if (seen.has(id)) continue;
    seen.add(id);
    stats.postings++;
    const cur = state.open.get(id);
    if (cur && cur.key === data.key) {
      if (!cur.validTo) continue; // seen in every observation since it started
      // Missing from a partial observation, back now unchanged: the gap ends this version.
      close(cur, 'gap');
      stats.resumed++;
      const seq = nextSeq(id, cur);
      state.open.set(id, versionRow(id, company, seq, at, data, { cause: 'resumed' }));
      state.ids.set(id, seq);
      continue;
    }
    const lastSeq = Number(state.ids.get(id)) || 0;
    if (cur) {
      const { changed, cause } = changedFields(cur, data);
      close(cur, 'changed');
      stats.changed++;
      if (changed.includes('salary') || changed.includes('salaryRaw') || changed.includes('vet')) stats.payChanged++;
      if (cause === 'source') stats.sourceChanged++;
      const seq = nextSeq(id, cur);
      state.open.set(id, versionRow(id, company, seq, at, data, { cause, changed }));
      state.ids.set(id, seq);
    } else {
      if (lastSeq) stats.reopened++; else stats.opened++;
      state.open.set(id, versionRow(id, company, lastSeq + 1, at, data, { cause: lastSeq ? 'reopened' : 'new' }));
      state.ids.set(id, lastSeq + 1);
    }
  }

  // Close (full observation) or mark missing (partial) what was not seen.
  const notSeen = [...state.open.values()].filter((r) => !seen.has(r.id));
  for (const row of notSeen) {
    if (!obs.partial) { close(row, 'closed'); stats.closed++; continue; }
    const lastSeen = row.validTo || prevAt;
    const marked = row.validTo ? row : { ...row, validTo: lastSeen, missedAt: at };
    if (lastSeen && Date.parse(at) - Date.parse(lastSeen) > UNSEEN_CLOSE_DAYS * DAY) { close(marked, 'unseen'); stats.unseen++; continue; }
    if (marked !== row) state.open.set(row.id, marked);
  }
  closedRows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.seq - b.seq));
  meta.lastObservedAt = at;
  if (!meta.firstObservedAt) meta.firstObservedAt = at;
  meta.observations = (meta.observations || 0) + 1;
  return { status: 'folded', closedRows, stats };
}

/** Decide whether a "full" observation looks truncated (see SUSPECT_DROP_*). */
export function suspectDrop(openCount, postings) {
  return openCount >= SUSPECT_DROP_MIN_OPEN && postings < openCount * SUSPECT_DROP_SHARE;
}

/* ------------------------------------------------------------ reading at a point in time */

/** validTo of a stored row, resolving null (open, seen in latest) to the company's last observation. */
export function resolvedValidTo(row, lastObservedAt) {
  return row.validTo || lastObservedAt || row.validFrom;
}

/** Versions valid at observation time t (validFrom <= t <= validTo). */
export function versionsAt(versions, t, lastObservedAt) {
  return versions.filter((r) => r.validFrom <= t && resolvedValidTo(r, lastObservedAt) >= t);
}

/** A stored row as a Job-like object for product code (buildMarket, backtest, juice). */
export function rowAsJob(r) {
  const v = r.src ? view(r) : r;
  return {
    id: v.id, company: v.company, title: v.title, department: v.department, team: v.team,
    employmentType: v.employmentType, seniority: v.seniority || 'Mid', locations: v.locations || [],
    remote: !!v.remote, salary: v.salary ? { ...v.salary } : null, url: v.url, postedAt: v.postedAt, reqId: v.reqId,
  };
}

/* ------------------------------------------------------------ aggregates */

/**
 * Pay statistics of a set of rows (stored or viewed): overall USD midpoint distribution and
 * one cell per family x level, plus family x "*" (all levels) and "*" x level (all families),
 * each [family, level, n, p10, p25, p50, p75, p90] in USD.
 */
export function payStats(rows) {
  const mids = [];
  const groups = new Map();
  const add = (k, v) => { let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(v); };
  let salaried = 0;
  let quarantined = 0;
  for (const raw of rows) {
    const r = raw.src ? view(raw) : raw;
    if (r.vet === 'quarantined') quarantined++;
    if (!r.salary) continue;
    salaried++;
    const v = r.usd && r.usd.mid;
    if (!(v > 0)) continue;
    mids.push(v);
    const level = r.seniority || 'Mid';
    add(`*|${level}`, v); // every family at one level (cross-level ladders)
    if (!r.family) continue;
    add(`${r.family}|${level}`, v);
    add(`${r.family}|*`, v);
  }
  const cells = [];
  for (const [k, vals] of groups) {
    const [family, level] = k.split('|');
    const d = dist(vals);
    cells.push([family, level, d.n, d.p10, d.p25, d.p50, d.p75, d.p90]);
  }
  cells.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return { salaried, quarantined, usd: dist(mids), cells };
}

export const CELL_COLUMNS = Object.freeze(['family', 'level', 'n', 'p10', 'p25', 'p50', 'p75', 'p90']);

export { round100, monthOf, iso };

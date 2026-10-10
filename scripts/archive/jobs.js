// Job postings as versioned rows (slowly-changing dimension, docs/DATA_ARCHIVE.md "jobs").
//
// One row per distinct version of a posting. A new version starts only when a
// KEY field changes (KEY_FIELDS); disappearance from a full observation closes the
// open version. Rows are built from normalized, vetted Jobs (docs/CONTRACT.md),
// never from raw HTML: the description is kept as a hash and a length only.
//
// Company state on disk (all under jobs/<slug>/):
//   open.jsonl      the open version of every posting seen in the latest observation
//                   (validTo null = "seen in the company's latest observation"),
//                   plus postings missing from a partial observation (explicit validTo)
//   ids.json        { id: lastSeq } for every id ever seen (so a returning id continues its sequence)
//   YYYY-MM.jsonl   closed versions, appended in the month they were closed (append-only)
import fs from 'node:fs';
import path from 'node:path';
import { hashOf, iso, dist, round100, readJsonl, readJson, jsonlText, writeMutable, writeIfChanged, mutablePath, allPartitions, assertSlug, monthOf } from './lib.js';

/** Postings unseen this long on a partial board are closed with end "unseen". */
export const UNSEEN_CLOSE_DAYS = 30;
/** A full observation with fewer than this share of the open postings is treated as partial. */
export const SUSPECT_DROP_SHARE = 0.5;
export const SUSPECT_DROP_MIN_OPEN = 40;
const DAY = 86400000;

/** Fields whose change starts a new version (see deriveRow for each). */
export const KEY_FIELDS = Object.freeze(['title', 'department', 'team', 'employmentType', 'rawLocations', 'remote', 'salary', 'salaryRaw', 'vet', 'vetCodes', 'url', 'postedAt', 'reqId', 'descHash']);
/** Key fields that come from the posting itself; a change in any other key field is "derived". */
export const SOURCE_FIELDS = Object.freeze(['title', 'department', 'team', 'employmentType', 'rawLocations', 'remote', 'url', 'postedAt', 'reqId', 'descHash', 'salaryText']);

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
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

function cleanSalary(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  for (const k of ['min', 'max', 'mid']) out[k] = num(s[k]);
  out.currency = str(s.currency) ? String(s.currency).toUpperCase() : null;
  out.interval = str(s.interval);
  out.text = str(s.text);
  for (const k of ['originalInterval', 'kind', 'source', 'statedInterval']) if (s[k] != null) out[k] = s[k];
  for (const k of ['spread', 'zones']) if (s[k] != null && Number.isFinite(Number(s[k]))) out[k] = Number(s[k]);
  if (s.intervalCorrected) out.intervalCorrected = true;
  if (Array.isArray(s.ranges) && s.ranges.length) out.ranges = s.ranges.slice(0, 12).map((r) => ({ min: num(r.min), max: num(r.max), currency: str(r.currency), interval: str(r.interval), ...(r.label ? { label: String(r.label) } : {}) }));
  if (Array.isArray(s.structuredRejected) && s.structuredRejected.length) out.structuredRejected = s.structuredRejected.map(String);
  return out;
}

function cleanLocation(l) {
  if (!l || typeof l !== 'object') return null;
  return {
    name: str(l.name), rawName: str(l.rawName) || str(l.name),
    city: str(l.city), region: str(l.region), country: str(l.country),
    lat: num(l.lat), lng: num(l.lng), remote: l.remote === true,
  };
}

const strList = (a) => (Array.isArray(a) ? a.filter((x) => x != null && x !== '').map(String) : []);

/** USD view of a vetted salary with the FX used, or null. */
export function usdOf(salary, h) {
  if (!salary) return null;
  const cur = salary.currency || 'USD';
  const rate = cur === 'USD' ? 1 : h.FX_PER_USD[cur];
  if (!(rate > 0)) return null;
  const conv = (v) => (v == null ? null : Math.round(v / rate));
  const mid = salary.mid != null ? salary.mid : (salary.min != null && salary.max != null ? (salary.min + salary.max) / 2 : null);
  return { min: conv(salary.min), max: conv(salary.max), mid: conv(mid), fxPerUSD: rate, fxAsOf: h.FX_AS_OF };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * Plain text of a description for hashing: tags removed, the common entities decoded,
 * whitespace collapsed. Owned by the archive and frozen (descHash "v1"): it must never
 * follow changes in the product's own HTML handling, or every posting would look edited.
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

export function descriptionFingerprint(job) {
  const text = descriptionPlainText(typeof job.descriptionHtml === 'string' ? job.descriptionHtml : '');
  return { descHash: text ? hashOf(text) : null, descLen: text.length };
}

/**
 * The archived fields of one vetted, normalized Job (no validity dates yet).
 * `ctx`: { helpers, norm (normalizer version), trimmedTo }.
 */
export function deriveRow(job, ctx) {
  const h = ctx.helpers;
  const title = str(job.title) || 'Untitled role';
  const locations = (Array.isArray(job.locations) ? job.locations : []).map(cleanLocation).filter(Boolean);
  const salary = cleanSalary(job.salary);
  const salaryRaw = job.salary ? null : cleanSalary(job.salaryRaw);
  const flag = job.salaryFlag && typeof job.salaryFlag === 'object' ? job.salaryFlag : null;
  const vet = salary ? 'ok' : (salaryRaw || flag ? 'quarantined' : 'none');
  let family = null;
  try { family = h.roleFamily(title, job) || null; } catch { family = null; }
  let titleReadable = title;
  try { titleReadable = h.readableTitle(title) || title; } catch { /* keep */ }
  const kw = job.keywords && typeof job.keywords === 'object' ? job.keywords : {};
  const extras = job.extras && typeof job.extras === 'object' ? { equity: !!job.extras.equity, bonus: !!job.extras.bonus } : null;
  const { descHash, descLen } = descriptionFingerprint(job);
  const row = {
    title,
    titleReadable,
    department: str(job.department),
    team: str(job.team),
    employmentType: str(job.employmentType),
    family,
    seniority: str(job.seniority),
    locations,
    rawLocations: locations.map((l) => l.rawName),
    remote: job.remote === true,
    salary,
    salaryRaw,
    vet,
    vetCodes: flag && Array.isArray(flag.codes) ? flag.codes.map(String) : null,
    vetReason: flag && flag.reason ? String(flag.reason).slice(0, 500) : null,
    usd: usdOf(salary, h),
    url: str(job.url),
    postedAt: iso(job.postedAt),
    updatedAt: str(job.updatedAt),
    reqId: str(job.reqId),
    descHash,
    descLen,
    keywords: { responsibilities: strList(kw.responsibilities), fit: strList(kw.fit), skills: strList(kw.skills) },
    extras,
    norm: ctx.norm || null,
  };
  if (ctx.trimmedTo) row.descTrimmedTo = ctx.trimmedTo;
  row.key = hashOf(KEY_FIELDS.map((k) => row[k]));
  return row;
}

const sourceView = (r) => ({ ...Object.fromEntries(SOURCE_FIELDS.map((k) => [k, r[k]])), salaryText: (r.salary || r.salaryRaw || {}).text || null });

/** Key fields that differ between two rows, and whether any came from the posting itself. */
export function changedFields(a, b) {
  const changed = KEY_FIELDS.filter((k) => hashOf(a[k]) !== hashOf(b[k]));
  const sa = sourceView(a);
  const sb = sourceView(b);
  const source = SOURCE_FIELDS.some((k) => hashOf(sa[k]) !== hashOf(sb[k]));
  return { changed, cause: source ? 'source' : 'derived' };
}

/** Assemble a stored version row in the documented field order. */
function versionRow(id, company, seq, from, data, extra) {
  const { key, ...fields } = data;
  return { id, company, seq, validFrom: from, validTo: null, end: null, endAt: null, cause: extra.cause, changed: extra.changed || null, ...fields, key };
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
 * Fold one observation of a company into its state (mutates `state`).
 * @param {{open, ids}} state
 * @param {object} meta       company meta from state/companies.json ({ lastObservedAt, ... }), mutated
 * @param {object} obs        { observedAt, rows: [{ id, data }], partial: boolean }
 * @returns {{ status, closedRows, stats }}  status: "folded" | "duplicate" | "late"
 */
export function foldObservation(state, meta, obs, { company }) {
  const at = obs.observedAt;
  if (meta.lastObservedAt && at === meta.lastObservedAt) return { status: 'duplicate', closedRows: [], stats: null };
  if (meta.lastObservedAt && at < meta.lastObservedAt) return { status: 'late', closedRows: [], stats: null };
  const prevAt = meta.lastObservedAt || null;
  const stats = { postings: 0, opened: 0, reopened: 0, closed: 0, unseen: 0, changed: 0, payChanged: 0, sourceChanged: 0, partial: !!obs.partial };
  const closedRows = [];
  const seen = new Set();
  const close = (row, end) => {
    const lastSeen = row.validTo || prevAt;
    const done = { ...row, validTo: lastSeen, end, endAt: at };
    closedRows.push(done);
    state.open.delete(row.id);
  };

  for (const { id, data } of obs.rows) {
    if (seen.has(id)) continue;
    seen.add(id);
    stats.postings++;
    const cur = state.open.get(id);
    if (cur && cur.key === data.key) {
      if (cur.validTo) state.open.set(id, { ...cur, validTo: null }); // seen again after a partial miss
      continue;
    }
    const lastSeq = Number(state.ids.get(id)) || 0;
    if (cur) {
      const { changed, cause } = changedFields(cur, data);
      close(cur, 'changed');
      stats.changed++;
      if (changed.includes('salary') || changed.includes('salaryRaw') || changed.includes('vet')) stats.payChanged++;
      if (cause === 'source') stats.sourceChanged++;
      state.open.set(id, versionRow(id, company, Math.max(lastSeq, cur.seq) + 1, at, data, { cause, changed }));
      state.ids.set(id, Math.max(lastSeq, cur.seq) + 1);
    } else {
      if (lastSeq) stats.reopened++; else stats.opened++;
      state.open.set(id, versionRow(id, company, lastSeq + 1, at, data, { cause: lastSeq ? 'reopened' : 'new' }));
      state.ids.set(id, lastSeq + 1);
    }
  }

  // Close (full observation) or age out (partial) what was not seen.
  const openBefore = [...state.open.values()].filter((r) => !seen.has(r.id));
  for (const row of openBefore) {
    if (!obs.partial) { close(row, 'closed'); stats.closed++; continue; }
    const lastSeen = row.validTo || prevAt;
    if (lastSeen && Date.parse(at) - Date.parse(lastSeen) > UNSEEN_CLOSE_DAYS * DAY) { close(row, 'unseen'); stats.unseen++; continue; }
    if (!row.validTo) state.open.set(row.id, { ...row, validTo: lastSeen });
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

/** A version row as a Job-like object for product code (buildMarket, backtest, juice). */
export function rowAsJob(r) {
  return {
    id: r.id, company: r.company, title: r.title, department: r.department, team: r.team,
    employmentType: r.employmentType, seniority: r.seniority || 'Mid', locations: r.locations || [],
    remote: !!r.remote, salary: r.salary ? { ...r.salary } : null, url: r.url, postedAt: r.postedAt, reqId: r.reqId,
  };
}

/* ------------------------------------------------------------ aggregates */

/**
 * Pay statistics of a set of version rows: overall USD midpoint distribution and one cell
 * per family x level, plus family x "*" (all levels) and "*" x level (all families), each
 * [family, level, n, p10, p25, p50, p75, p90] in USD.
 */
export function payStats(rows) {
  const mids = [];
  const groups = new Map();
  const add = (k, v) => { let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(v); };
  let salaried = 0;
  let quarantined = 0;
  for (const r of rows) {
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
  const d = dist(mids);
  return { salaried, quarantined, usd: d, cells };
}

export const CELL_COLUMNS = Object.freeze(['family', 'level', 'n', 'p10', 'p25', 'p50', 'p75', 'p90']);

export { round100, monthOf };

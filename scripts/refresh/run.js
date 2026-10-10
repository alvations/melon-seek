#!/usr/bin/env node
// Monthly reference-data refresh: the orchestrator (docs/DATA_FRESHNESS.md).
//
//   node scripts/refresh/run.js                     check every registry entry, write validated updates
//   node scripts/refresh/run.js --dry-run           check and report, write nothing
//   node scripts/refresh/run.js --offline           use test/fixtures/refresh/<module>/ instead of the network
//   node scripts/refresh/run.js --only fx,tax-us-federal   only these modules or registry ids
//   node scripts/refresh/run.js --now 2026-11-03    pretend today is this date (staleness, tests)
//   node scripts/refresh/run.js --out tmp/refresh   where report.json / report.md / pr-body.md / issue-body.md go
//   node scripts/refresh/run.js --staleness         only the staleness table (CI / Pages step); never fails
//   node scripts/refresh/run.js --export-reference <dir>   write the current value of every dataset to <dir>/<id>.json
//   node scripts/refresh/run.js --archive [--export-reference <dir>]   ...and record each in the archive (scripts/archive/record.js)
//   node scripts/refresh/run.js --list              list registry entries and their updaters
//   node scripts/refresh/run.js --offline --fixtures <dir>   offline against another fixture tree
//                                                   (e.g. real responses captured by freshness-probe.yml)
//   --strict  exit 1 when any result is drift / flag / error / stale (default: always exit 0 unless the run itself breaks)
//
// What it does, in order:
//   1. loads data/freshness.json and checks the registry is well formed;
//   2. imports every updater module in scripts/refresh/ (a module exports MODULE + check());
//   3. runs them in MODULE_ORDER, each against an in-memory overlay of the repo, so a later
//      module sees an earlier module's writes (bigmac -> fx -> rents -> ... -> derived);
//   4. handles registry entries no module covers (mode manual, or job data refreshed by the
//      daily pipeline) with a staleness check and their checklist;
//   5. validates every file a module wants to write (data/cities.json through
//      scripts/update-col.js validateDoc, JS files through `node --check`); a file that fails
//      turns every result writing it into 'flag' and nothing is written;
//   6. updates lastChecked / asOf in the registry for what it confirmed or changed;
//   7. writes the files (unless --dry-run) and the reports. The workflow
//      (.github/workflows/monthly-refresh.yml) turns writes into a bot branch + review PR and
//      drift / flag / stale / error into one GitHub issue. Nothing here pushes anywhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ROOT, CADENCES, CADENCE_DAYS, MODES, STATUSES, TYPES, isoDate, parseDate, staleness, makeContext, jsonText, extractConst,
} from './lib.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Modules run in this order; unknown modules run after these, alphabetically. derived is last on purpose. */
export const MODULE_ORDER = Object.freeze(['bigmac', 'fx', 'rents', 'living', 'tax', 'jobs', 'policy', 'derived']);
/** Files in scripts/refresh/ that are not updater modules. */
const NOT_MODULES = new Set(['lib.js', 'run.js', 'registry.js', 'tax-watch.js', 'examples.js']);
/** Updaters that mean "no monthly module; the daily job-board pipeline refreshes it". */
const PIPELINE_UPDATERS = /^(pipeline|daily pipeline|snapshot\.yml|pages\.yml)/i;
const ALERT_STATUSES = new Set(['drift', 'flag', 'stale', 'error']);
const MODULE_TIMEOUT_MS = 6 * 60 * 1000;

// ---------------------------------------------------------------- registry

/** Problems with a registry document (empty when valid). Used by test/freshness.test.js too. */
export function validateRegistry(reg, { root = ROOT } = {}) {
  const problems = [];
  if (!reg || typeof reg !== 'object') return ['registry is not an object'];
  if (reg.format !== 'melon-freshness-1') problems.push(`format ${reg.format}`);
  if (!Array.isArray(reg.entries) || !reg.entries.length) return [...problems, 'no entries'];
  const ids = new Set();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  for (const e of reg.entries) {
    const id = e && e.id;
    const at = `entry ${id || '(no id)'}`;
    if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) problems.push(`${at}: id must be kebab-case`);
    if (ids.has(id)) problems.push(`${at}: duplicate id`);
    ids.add(id);
    if (!e.description || e.description.length < 10) problems.push(`${at}: description`);
    if (!TYPES.includes(e.type)) problems.push(`${at}: type ${e.type}`);
    if (!CADENCES.includes(e.cadence)) problems.push(`${at}: cadence ${e.cadence}`);
    if (!MODES.includes(e.mode)) problems.push(`${at}: mode ${e.mode}`);
    if (!Array.isArray(e.owners) || !e.owners.length) problems.push(`${at}: owners`);
    if (!Array.isArray(e.consumers) || !e.consumers.length) problems.push(`${at}: consumers`);
    else for (const c of e.consumers) if (!c || !c.at || !c.surface) problems.push(`${at}: consumer needs at + surface`);
    if (!e.source || !e.source.name) problems.push(`${at}: source.name`);
    if (e.type !== 'product-policy' && e.type !== 'derived-at-build' && e.source && e.source.url && !/^https:\/\//.test(e.source.url)) problems.push(`${at}: source.url must be https`);
    if (e.asOf != null && !DATE.test(e.asOf)) problems.push(`${at}: asOf ${e.asOf}`);
    if (e.lastChecked != null && !DATE.test(e.lastChecked)) problems.push(`${at}: lastChecked ${e.lastChecked}`);
    if (e.graceDays != null && !(Number.isInteger(e.graceDays) && e.graceDays >= 0)) problems.push(`${at}: graceDays`);
    if (!e.updater) problems.push(`${at}: updater`);
    else if (/^scripts\/refresh\/[\w-]+\.js$/.test(e.updater) && !fs.existsSync(path.join(root, e.updater))) problems.push(`${at}: updater ${e.updater} does not exist`);
    if ((e.mode === 'manual' || e.mode === 'detect') && !(Array.isArray(e.checklist) && e.checklist.length)) problems.push(`${at}: ${e.mode} entries need a checklist`);
    if (!e.validator) problems.push(`${at}: validator`);
    if (e.before == null) problems.push(`${at}: before (the mechanism before this work, or 'none')`);
    if (e.extract != null && !Array.isArray(e.extract)) problems.push(`${at}: extract must be a list`);
  }
  return problems;
}

export function readRegistryFile(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data', 'freshness.json'), 'utf8'));
}

// ---------------------------------------------------------------- overlay

/** In-memory view of the repo: reads see pending writes; nothing touches disk until flush(). */
export function makeOverlay(root = ROOT) {
  const pending = new Map(); // rel -> { content, by: Set(ids) }
  return {
    read(rel) { return pending.has(rel) ? pending.get(rel).content : fs.readFileSync(path.join(root, rel), 'utf8'); },
    exists(rel) { return pending.has(rel) || fs.existsSync(path.join(root, rel)); },
    stage(rel, content, id) {
      const p = pending.get(rel) || { content, by: new Set() };
      p.content = content;
      p.by.add(id);
      pending.set(rel, p);
    },
    drop(rel) { pending.delete(rel); },
    pending,
    changedFiles() {
      return [...pending.entries()].filter(([rel, p]) => {
        try { return fs.readFileSync(path.join(root, rel), 'utf8') !== p.content; } catch { return true; }
      }).map(([rel]) => rel);
    },
    flush() {
      const written = [];
      for (const rel of this.changedFiles()) {
        const f = path.join(root, rel);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, pending.get(rel).content);
        written.push(rel);
      }
      return written;
    },
  };
}

// ---------------------------------------------------------------- modules

export async function loadModules(dir = HERE) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !NOT_MODULES.has(f));
  const mods = [];
  for (const f of files) {
    let m;
    try { m = await import(pathToFileURL(path.join(dir, f)).href); } catch (err) {
      mods.push({ name: f.replace(/\.js$/, ''), file: f, loadError: err.message });
      continue;
    }
    if (!m.MODULE || typeof m.check !== 'function') continue;
    mods.push({ name: m.MODULE.name || f.replace(/\.js$/, ''), file: f, ids: [...(m.MODULE.ids || [])], check: m.check, validateFile: m.validateFile });
  }
  const rank = (n) => { const i = MODULE_ORDER.indexOf(n); return i < 0 ? MODULE_ORDER.length : i; };
  return mods.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

function withTimeout(promise, ms, what) {
  let t;
  return Promise.race([promise, new Promise((_, no) => { t = setTimeout(() => no(new Error(`${what} timed out after ${ms} ms`)), ms); })]).finally(() => clearTimeout(t));
}

/** Normalize one Result from a module (defensive: modules are written by different people). */
export function normalizeResult(r, mod) {
  const out = {
    id: r && r.id, mode: r && MODES.includes(r.mode) ? r.mode : 'detect', status: r && STATUSES.includes(r.status) ? r.status : 'error',
    summary: String((r && r.summary) || ''), sourceAsOf: (r && r.sourceAsOf) || null,
    findings: Array.isArray(r && r.findings) ? r.findings : [], evidence: Array.isArray(r && r.evidence) ? r.evidence.map((e) => ({ ...e, excerpt: String(e.excerpt || '').slice(0, 400) })) : [],
    writes: Array.isArray(r && r.writes) ? r.writes.filter((w) => w && typeof w.file === 'string' && typeof w.content === 'string') : [],
    checklist: Array.isArray(r && r.checklist) ? r.checklist : [], module: mod,
  };
  if (r && r.archive) out.archive = r.archive;
  if (r && !STATUSES.includes(r.status)) out.summary = `bad status ${r.status}; ${out.summary}`;
  if (out.writes.length && out.status !== 'changed') out.writes = []; // only 'changed' may write
  if (out.writes.some((w) => path.isAbsolute(w.file) || w.file.includes('..'))) { out.status = 'error'; out.summary = `write outside the repo refused; ${out.summary}`; out.writes = []; }
  return out;
}

// ---------------------------------------------------------------- generic entries

/** Result for a registry entry no module covered: staleness + checklist. */
export function genericResult(entry, now) {
  const s = staleness(entry, now);
  const pipeline = PIPELINE_UPDATERS.test(entry.updater || '');
  const base = { id: entry.id, mode: entry.mode, module: pipeline ? 'pipeline' : 'registry', findings: [], evidence: [], writes: [], checklist: entry.checklist || [], sourceAsOf: entry.asOf || null };
  if (pipeline || entry.cadence === 'daily') {
    return { ...base, status: 'ok', summary: `refreshed by the daily job-board pipeline (${entry.updater})` };
  }
  if (s.overdue) {
    return { ...base, status: 'stale', summary: `past due by ${-s.dueInDays} day(s): asOf ${entry.asOf || '-'}, last checked ${entry.lastChecked || '-'}, cadence ${entry.cadence} + ${s.graceDays ?? 0} days grace` };
  }
  const due = s.dueInDays == null ? 'no fixed cadence' : `next review due in ${s.dueInDays} day(s)`;
  return { ...base, status: 'ok', summary: `${entry.mode === 'manual' ? 'manual' : 'no updater ran'}; ${due}` };
}

// ---------------------------------------------------------------- file validation

async function validateStagedFile(rel, content, root) {
  if (rel === 'data/cities.json') {
    let doc;
    try { doc = JSON.parse(content); } catch (err) { return [`not JSON: ${err.message}`]; }
    try {
      const { validateDoc } = await import(pathToFileURL(path.join(root, 'scripts', 'update-col.js')).href);
      return validateDoc(doc);
    } catch (err) { return [`validateDoc unavailable: ${err.message}`]; }
  }
  if (rel.endsWith('.json')) {
    try { JSON.parse(content); return []; } catch (err) { return [`not JSON: ${err.message}`]; }
  }
  if (/\.(m?js)$/.test(rel)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-check-'));
    const f = path.join(dir, path.basename(rel).replace(/\.js$/, '.mjs'));
    try {
      fs.writeFileSync(f, content);
      execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] });
      return [];
    } catch (err) {
      return [`syntax: ${String(err.stderr || err.message).split('\n').filter(Boolean).slice(0, 3).join(' ')}`];
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  return [];
}

// ---------------------------------------------------------------- registry update

/** New registry after a run: lastChecked for confirmed entries, asOf for changed ones. Pure. */
export function applyResultsToRegistry(reg, results, today) {
  const out = structuredClone(reg);
  const byId = new Map(results.map((r) => [r.id, r]));
  let touched = false;
  for (const e of out.entries) {
    const r = byId.get(e.id);
    if (!r || r.module === 'registry' || r.module === 'pipeline') continue; // generic results confirm nothing
    // A 'manual' result is a reminder, not a check: only a person sets lastChecked / lastReviewed.
    if (r.mode === 'manual') continue;
    if (r.status === 'ok' || r.status === 'changed') {
      if (e.lastChecked !== today) { e.lastChecked = today; touched = true; }
      const valid = r.sourceAsOf && /^\d{4}-\d{2}-\d{2}$/.test(r.sourceAsOf) && r.sourceAsOf <= today;
      // 'changed': the data now has the source's as-of. 'ok' on fetched/derived data: the data the
      // module saw is current as of sourceAsOf (e.g. the newest snapshot), so the date moves forward.
      const moveOnOk = r.status === 'ok' && (e.type === 'fetched' || e.type === 'derived-at-build') && (!e.asOf || r.sourceAsOf > e.asOf);
      if (valid && r.sourceAsOf !== e.asOf && (r.status === 'changed' || moveOnOk)) { e.asOf = r.sourceAsOf; touched = true; }
    }
  }
  if (touched) out.updated = today;
  return out;
}

// ---------------------------------------------------------------- the run

/**
 * Run the refresh. Returns the report; writes files only when !dryRun.
 * opts: { root, offline, dryRun, now, only: [names or ids], modules (preloaded, tests), registry, fetchImpl, log, timeoutMs, fixturesDir }
 */
export async function runRefresh(opts = {}) {
  const root = opts.root || ROOT;
  const now = opts.now ? parseDate(opts.now) : new Date();
  const today = isoDate(now);
  const log = opts.log || ((...a) => process.stderr.write(`[refresh] ${a.join(' ')}\n`));
  const registry = opts.registry || readRegistryFile(root);
  const regProblems = validateRegistry(registry, { root });
  const overlay = makeOverlay(root);
  const modules = opts.modules || await loadModules(opts.modulesDir || HERE);
  const only = opts.only && opts.only.length ? new Set(opts.only) : null;
  const regIds = new Set(registry.entries.map((e) => e.id));
  const results = [];
  const problems = regProblems.map((p) => `registry: ${p}`);

  for (const mod of modules) {
    if (mod.loadError) { problems.push(`module ${mod.name} failed to load: ${mod.loadError}`); continue; }
    if (only && !only.has(mod.name) && !mod.ids.some((id) => only.has(id))) continue;
    const ctx = makeContext({ moduleName: mod.name, offline: opts.offline, dryRun: opts.dryRun, now, root, registry, fetchImpl: opts.fetchImpl, fixturesDir: opts.fixturesDir, log: (...a) => log(`${mod.name}:`, ...a) });
    // reads go through the overlay so modules build on earlier modules' writes
    ctx.readText = (rel) => overlay.read(rel);
    ctx.readJson = (rel) => JSON.parse(overlay.read(rel));
    ctx.exists = (rel) => overlay.exists(rel);
    let raw;
    const t0 = Date.now();
    try {
      raw = await withTimeout(Promise.resolve(mod.check(ctx)), opts.timeoutMs || MODULE_TIMEOUT_MS, `module ${mod.name}`);
    } catch (err) {
      raw = mod.ids.map((id) => ({ id, mode: 'detect', status: 'error', summary: `module threw: ${err && err.message}` }));
    }
    const list = (Array.isArray(raw) ? raw : []).map((r) => normalizeResult(r, mod.name)).filter((r) => !only || only.has(mod.name) || only.has(r.id));
    for (const id of mod.ids) if ((!only || only.has(mod.name) || only.has(id)) && !list.some((r) => r.id === id)) list.push(normalizeResult({ id, mode: 'detect', status: 'error', summary: 'module returned no result for this id' }, mod.name));
    for (const r of list) {
      if (!regIds.has(r.id)) problems.push(`module ${mod.name} reported unregistered id ${r.id}`);
      if (r.status === 'changed') for (const w of r.writes) overlay.stage(w.file, w.content, r.id);
    }
    log(`${mod.name}: ${list.length} result(s) in ${Date.now() - t0} ms: ${summarize(list)}`);
    results.push(...list);
  }

  // Validate staged files; a bad file flags every result that wrote it.
  for (const [rel, p] of [...overlay.pending.entries()]) {
    const errs = await validateStagedFile(rel, p.content, root);
    if (errs.length) {
      overlay.drop(rel);
      for (const r of results) {
        if (!p.by.has(r.id)) continue;
        r.status = 'flag';
        r.summary = `${rel} failed validation, nothing written: ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (+${errs.length - 3})` : ''}. ${r.summary}`;
        r.writes = [];
      }
    }
  }

  // Registry entries no module covered.
  const covered = new Set(results.map((r) => r.id));
  for (const e of registry.entries) {
    if (covered.has(e.id) || e.retired) continue;
    if (only && !only.has(e.id)) continue;
    results.push(genericResult(e, now));
  }

  // Registry bookkeeping (lastChecked / asOf) staged like any other write.
  const nextReg = applyResultsToRegistry(registry, results, today);
  const changedFiles = overlay.changedFiles();
  if (JSON.stringify(nextReg) !== JSON.stringify(registry)) {
    overlay.stage('data/freshness.json', jsonText(nextReg), '(registry)');
    // The inventory in docs/DATA_FRESHNESS.md is generated from the registry: keep them equal
    // (test/refresh-registry.test.js checks it).
    try {
      const { renderInventory, spliceInventory } = await import('./registry.js');
      const docRel = 'docs/DATA_FRESHNESS.md';
      if (overlay.exists(docRel)) overlay.stage(docRel, spliceInventory(overlay.read(docRel), renderInventory(nextReg)), '(registry)');
    } catch (err) { problems.push(`could not regenerate the DATA_FRESHNESS.md inventory: ${err.message}`); }
  }

  const report = {
    format: 'melon-refresh-report-1',
    ranAt: new Date().toISOString(),
    today,
    offline: !!opts.offline,
    dryRun: !!opts.dryRun,
    counts: countBy(results, 'status'),
    dataFiles: changedFiles,
    files: overlay.changedFiles(),
    problems,
    results: results.map((r) => ({ ...r, writes: r.writes.map((w) => ({ file: w.file, bytes: Buffer.byteLength(w.content) })) })),
    staleness: stalenessRows(nextReg, now),
  };
  report.alerts = results.filter((r) => ALERT_STATUSES.has(r.status)).length;
  if (!opts.dryRun) report.written = overlay.flush();
  return report;
}

function countBy(list, key) {
  const out = {};
  for (const x of list) out[x[key]] = (out[x[key]] || 0) + 1;
  return out;
}
function summarize(list) { return Object.entries(countBy(list, 'status')).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'; }

// ---------------------------------------------------------------- staleness

/** One row per entry: id, type, cadence, asOf, lastChecked, age, due, status. */
export function stalenessRows(reg, now = new Date()) {
  return reg.entries.filter((e) => !e.retired).map((e) => {
    const s = staleness(e, now);
    // Job data refreshed every day by snapshot.yml / pages.yml: its age is the deploy's
    // business (site-watchdog, the snapshot badge), not the monthly refresh's.
    const pipeline = e.cadence === 'daily';
    const status = pipeline ? 'pipeline' : e.cadence === 'ad-hoc' ? 'ad-hoc' : s.dueInDays == null ? 'unknown' : s.overdue ? 'STALE' : s.dueInDays <= 14 ? 'due soon' : 'fresh';
    return { id: e.id, type: e.type, mode: e.mode, cadence: e.cadence, asOf: e.asOf || null, lastChecked: e.lastChecked || null, ageDays: s.ageDays, dueInDays: s.dueInDays, status };
  });
}

export function stalenessMarkdown(rows) {
  const n = (s) => rows.filter((r) => r.status === s).length;
  const head = `**Data freshness:** ${rows.length} datasets: ${n('fresh')} fresh, ${n('due soon')} due soon, ${n('STALE')} stale, ${n('pipeline')} refreshed daily by the job pipeline, ${n('ad-hoc')} ad-hoc, ${n('unknown')} unknown.\n\n`;
  const order = { STALE: 0, 'due soon': 1, unknown: 2, fresh: 3, pipeline: 4, 'ad-hoc': 5 };
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status] || (a.dueInDays ?? 1e9) - (b.dueInDays ?? 1e9) || a.id.localeCompare(b.id));
  const lines = ['| Dataset | Type | Cadence | As of | Last checked | Age (days) | Due in (days) | Status |', '|---|---|---|---|---|---:|---:|---|'];
  for (const r of sorted) lines.push(`| \`${r.id}\` | ${r.type} | ${r.cadence} | ${r.asOf || '-'} | ${r.lastChecked || '-'} | ${r.ageDays ?? '-'} | ${r.dueInDays ?? '-'} | ${r.status === 'STALE' ? '**STALE**' : r.status} |`);
  return `${head}${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- reports

const ICON = { ok: 'ok', changed: 'CHANGED', drift: 'DRIFT', flag: 'FLAG', stale: 'STALE', error: 'ERROR', skipped: 'skipped' };
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Markdown report. compact: true keeps it inside GitHub's 65,536-character body limit for the
 * PR / issue (12 findings and 2 excerpts per result, no "up to date" list); the full report is
 * report.md in the monthly-refresh-report artifact.
 */
export function renderReport(report, { title = 'Monthly data refresh', compact = false, maxChars = 60000, runUrl = null } = {}) {
  const maxFindings = compact ? 12 : 40;
  const maxEvidence = compact ? 2 : 5;
  const c = report.counts;
  const out = [`## ${title} (${report.today})`, '',
    `${report.results.length} checks: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}.${report.offline ? ' **Offline (fixtures).**' : ''}${report.dryRun ? ' Dry run.' : ''}`, ''];
  if (report.problems.length) { out.push('### Problems', ''); for (const p of report.problems) out.push(`- ${p}`); out.push(''); }
  const sections = [
    ['changed', 'Updated (validated; review the diff)'],
    ['drift', 'Drift: the official source differs from the encoded value, or a newer year is out'],
    ['flag', 'Flagged: new data failed a sanity check and was NOT written'],
    ['error', 'Could not check'],
    ['stale', 'Past due (manual review)'],
  ];
  for (const [status, heading] of sections) {
    const rs = report.results.filter((r) => r.status === status);
    if (!rs.length) continue;
    out.push(`### ${heading}`, '');
    for (const r of rs) {
      out.push(`- **\`${r.id}\`** (${r.module}, ${r.mode}): ${r.summary}${r.sourceAsOf ? ` (source as of ${r.sourceAsOf})` : ''}`);
      if (r.findings.length) {
        out.push('', '  | Figure | Encoded | Official / new | Note |', '  |---|---|---|---|');
        for (const f of r.findings.slice(0, maxFindings)) out.push(`  | ${cell(f.key)} | ${cell(fmt(f.encoded))} ${cell(f.unit)} | ${cell(fmt(f.official))} | ${cell(f.note)}${f.url ? ` [source](${f.url})` : ''} |`);
        if (r.findings.length > maxFindings) out.push(`  | … ${r.findings.length - maxFindings} more (full report: report.md in the artifact) | | | |`);
        out.push('');
      }
      for (const e of r.evidence.slice(0, maxEvidence)) out.push(`  > ${cell(compact ? String(e.excerpt).slice(0, 240) : e.excerpt)} ([source](${e.url}), fetched ${e.fetchedAt})`);
      if ((status === 'stale' || status === 'drift') && r.checklist.length) {
        out.push('', '  Checklist:');
        for (const step of r.checklist) out.push(`  - [ ] ${step}`);
      }
      out.push('');
    }
  }
  const ok = report.results.filter((r) => r.status === 'ok' || r.status === 'skipped');
  if (ok.length && compact) out.push(`${ok.length} dataset(s) up to date or skipped (listed in the full report).`, '');
  if (ok.length && !compact) {
    out.push('<details><summary>Up to date or skipped (' + ok.length + ')</summary>', '');
    for (const r of ok) out.push(`- \`${r.id}\` ${ICON[r.status]}: ${r.summary}`);
    out.push('', '</details>', '');
  }
  if (report.files && report.files.length) { out.push('### Files changed', ''); for (const f of report.files) out.push(`- \`${f}\``); out.push(''); }
  if (!compact) out.push('<details><summary>Staleness of every dataset</summary>', '', stalenessMarkdown(report.staleness), '</details>', '');
  else {
    const stale = report.staleness.filter((r) => r.status === 'STALE' || r.status === 'due soon');
    if (stale.length) out.push(`**Stale or due soon:** ${stale.map((r) => `\`${r.id}\`${r.status === 'STALE' ? ' (stale)' : ''}`).join(', ')}`, '');
  }
  out.push(`Generated by \`scripts/refresh/run.js\` (docs/DATA_FRESHNESS.md).${runUrl ? ` Run and full report: ${runUrl}` : ''}`);
  let text = out.join('\n');
  if (compact && text.length > maxChars) {
    const cut = text.lastIndexOf('\n- **', maxChars - 400);
    text = `${text.slice(0, cut > 0 ? cut : maxChars - 400)}\n\n… truncated to fit a GitHub body; the full report is report.md in the monthly-refresh-report artifact${runUrl ? ` (${runUrl})` : ''}.`;
  }
  return text;
}
function fmt(v) {
  if (v == null) return '-';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : String(v);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  return String(v);
}

// ---------------------------------------------------------------- reference export (archive)

/** Read one `extract` spec: { file, const } (a JS constant), { file, path } (a JSON path), or { file } (whole file). */
export function readExtract(spec, root = ROOT) {
  const text = fs.readFileSync(path.join(root, spec.file), 'utf8');
  if (spec.const) {
    const v = extractConst(text, spec.const);
    return v === undefined ? { error: `constant ${spec.const} not found or not a literal in ${spec.file}` } : { value: v };
  }
  if (spec.file.endsWith('.json')) {
    let v = JSON.parse(text);
    // path: 'a.b' or ['a', 'key.with.dots']; keyPrefix keeps only the object keys starting with it
    const keys = Array.isArray(spec.path) ? spec.path : spec.path ? spec.path.split('.') : [];
    for (const k of keys) v = v == null ? undefined : v[k];
    if (spec.keyPrefix && v && typeof v === 'object' && !Array.isArray(v)) v = Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith(spec.keyPrefix)));
    if (spec.pick && v && Array.isArray(v)) v = v.map((x) => Object.fromEntries(spec.pick.filter((k) => k in x).map((k) => [k, x[k]])));
    return v === undefined ? { error: `path ${spec.path} not in ${spec.file}` } : { value: v };
  }
  return { value: text };
}
const jsonSafe = (v) => JSON.parse(JSON.stringify(v, (k, x) => {
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (Object.prototype.toString.call(x) === '[object RegExp]') return String(x); // lexicons keep their patterns
  if (typeof x === 'function') return `[function ${x.name || 'anonymous'}]`;
  return x;
}));

/**
 * readExtract, falling back to importing the module for an exported constant the text reader
 * can't evaluate (e.g. lexicons with regex literals). Only for files the app itself imports.
 */
export async function readExtractAsync(spec, root = ROOT) {
  const r = readExtract(spec, root);
  if (!r.error || !spec.const || !/\.m?js$/.test(spec.file)) return r;
  try {
    const mod = await import(pathToFileURL(path.join(root, spec.file)).href);
    return spec.const in mod ? { value: mod[spec.const] } : r;
  } catch { return r; }
}

/** Write <dir>/<id>.json for every entry with `extract`; returns the manifest. */
export async function exportReference(dir, { root = ROOT, registry = readRegistryFile(root), today = isoDate() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = [];
  for (const e of registry.entries) {
    if (!Array.isArray(e.extract) || !e.extract.length || e.archive === false || e.retired) continue;
    const parts = {};
    const errors = [];
    for (const spec of e.extract) {
      const key = spec.as || (spec.const ? `${spec.file}#${spec.const}` : `${spec.file}${spec.path ? `#${[].concat(spec.path).join('.')}` : ''}${spec.keyPrefix ? `[${spec.keyPrefix}*]` : ''}`);
      try { const r = await readExtractAsync(spec, root); if (r.error) errors.push(r.error); else parts[key] = jsonSafe(r.value); } catch (err) { errors.push(`${spec.file}: ${err.message}`); }
    }
    const doc = { dataset: e.id, asOf: e.asOf || today, taxYear: e.taxYear ?? null, source: e.source || null, exportedAt: today, values: parts, ...(errors.length ? { errors } : {}) };
    const file = path.join(dir, `${e.id}.json`);
    fs.writeFileSync(file, jsonText(doc));
    manifest.push({ dataset: e.id, asOf: doc.asOf, file: path.basename(file), source: e.source && e.source.url, errors: errors.length });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), jsonText(manifest));
  return manifest;
}

/**
 * Measurements a module asks to archive (Result.archive = { dataset, asOf, json }, json the JSON
 * text): <dir>/<dataset>/<asOf>.json + <dir>/manifest.json [{ dataset, asOf, file, source }].
 * The archive workflow records them with scripts/archive/record.js (docs/DATA_ARCHIVE.md).
 */
export function writeArchivePayloads(report, dir) {
  const items = report.results.filter((r) => r.archive && r.archive.dataset && r.archive.asOf && r.archive.json != null);
  if (!items.length) return [];
  const manifest = [];
  for (const r of items) {
    const { dataset, asOf } = r.archive;
    if (!/^[a-z0-9-]+$/.test(dataset) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) continue;
    const text = typeof r.archive.json === 'string' ? r.archive.json : jsonText(r.archive.json);
    try { JSON.parse(text); } catch { continue; }
    const file = path.join(dir, dataset, `${asOf}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
    manifest.push({ dataset, asOf, file: path.relative(dir, file), source: r.archive.source || null, from: r.id });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), jsonText(manifest));
  return manifest;
}

/** The archive CLI, if the archive agent's scripts are present. */
export function archiveCli(root = ROOT) {
  const f = path.join(root, 'scripts', 'archive', 'record.js');
  return fs.existsSync(f) ? f : null;
}

/** Record every exported dataset in the archive (idempotent there). -> [{ dataset, ok, out }] */
export function recordInArchive(manifest, { root = ROOT, log = console.error } = {}) {
  const cli = archiveCli(root);
  if (!cli) { log('archive: scripts/archive/record.js not found; exported files kept, nothing recorded'); return manifest.map((m) => ({ dataset: m.dataset, ok: false, out: 'no archive CLI' })); }
  return manifest.map((m) => {
    const args = [cli, '--dataset', m.dataset, '--asof', m.asOf, '--file', path.resolve(m.dir || '.', m.file)];
    if (m.source) args.push('--source', m.source);
    try {
      const out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { dataset: m.dataset, ok: true, out: out.trim().split('\n').pop() };
    } catch (err) {
      return { dataset: m.dataset, ok: false, out: String(err.stderr || err.message).trim().split('\n').pop() };
    }
  });
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const a = { only: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--offline') a.offline = true;
    else if (k === '--strict') a.strict = true;
    else if (k === '--staleness') a.staleness = true;
    else if (k === '--list') a.list = true;
    else if (k === '--archive') a.archive = true;
    else if (k === '--only') a.only.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (k === '--now') a.now = next();
    else if (k === '--out') a.out = next();
    else if (k === '--fixtures') a.fixtures = next();
    else if (k === '--export-reference') a.exportDir = next();
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

function appendSummary(md) {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) { try { fs.appendFileSync(f, `${md}\n`); } catch { /* not in Actions */ } }
}

async function main(argv) {
  const a = parseArgs(argv);
  if (a.help) {
    const head = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
    console.log(head.slice(0, head.findIndex((l) => /^\/\/ What it does/.test(l))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  const now = a.now ? parseDate(a.now) : new Date();
  if (a.staleness) {
    // Warn-only gate for CI and the Pages deploy: prints the table, annotates stale entries, exits 0.
    let reg;
    try { reg = readRegistryFile(); } catch (err) { console.log(`::warning::data/freshness.json unreadable: ${err.message}`); return 0; }
    const rows = stalenessRows(reg, now);
    const md = stalenessMarkdown(rows);
    console.log(md);
    appendSummary(md);
    for (const r of rows.filter((x) => x.status === 'STALE')) console.log(`::warning title=Stale data::${r.id} is past due (as of ${r.asOf || '-'}, last checked ${r.lastChecked || '-'}, cadence ${r.cadence}). See docs/DATA_FRESHNESS.md.`);
    return 0;
  }
  if (a.list) {
    const reg = readRegistryFile();
    for (const e of reg.entries) console.log(`${e.id.padEnd(34)} ${e.type.padEnd(30)} ${e.cadence.padEnd(9)} ${e.mode.padEnd(6)} ${e.updater}`);
    console.log(`${reg.entries.length} entries`);
    return 0;
  }
  if (a.exportDir || a.archive) {
    const dir = path.resolve(a.exportDir || path.join(ROOT, 'tmp', 'refresh', 'reference'));
    const manifest = (await exportReference(dir, { today: isoDate(now) })).map((m) => ({ ...m, dir }));
    console.log(`exported ${manifest.length} dataset(s) to ${path.relative(process.cwd(), dir) || dir}`);
    for (const m of manifest.filter((x) => x.errors)) console.log(`::warning::${m.dataset}: ${m.errors} extract error(s), see ${m.file}`);
    if (a.archive) {
      const rec = recordInArchive(manifest);
      const ok = rec.filter((r) => r.ok).length;
      console.log(`archive: recorded ${ok}/${rec.length}`);
      for (const r of rec.filter((x) => !x.ok)) console.log(`  ${r.dataset}: ${r.out}`);
    }
    return 0;
  }
  const outDir = path.resolve(a.out || path.join(ROOT, 'tmp', 'refresh'));
  const report = await runRefresh({ offline: a.offline, dryRun: a.dryRun, now, only: a.only, fixturesDir: a.fixtures ? path.resolve(a.fixtures) : undefined });
  fs.mkdirSync(outDir, { recursive: true });
  const slim = { ...report, results: report.results.map((r) => (r.archive ? { ...r, archive: { ...r.archive, json: `(${Buffer.byteLength(String(typeof r.archive.json === 'string' ? r.archive.json : JSON.stringify(r.archive.json)))} bytes, see archive/)` } } : r)) };
  fs.writeFileSync(path.join(outDir, 'report.json'), jsonText(slim));
  const md = renderReport(report);
  fs.writeFileSync(path.join(outDir, 'report.md'), `${md}\n`);
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  fs.writeFileSync(path.join(outDir, 'summary.md'), `${renderReport(report, { compact: true, runUrl })}\n`);
  const archived = writeArchivePayloads(report, path.join(outDir, 'archive'));
  fs.writeFileSync(path.join(outDir, 'outcome.json'), jsonText({ today: report.today, files: report.files, dataFiles: report.dataFiles, alerts: report.alerts, counts: report.counts, problems: report.problems.length, archive: archived.length }));
  appendSummary(renderReport(report, { compact: true, runUrl }));
  console.log(renderReport(report, { compact: true, runUrl }));
  if (a.strict && (report.alerts || report.problems.length)) return 1;
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(`refresh failed: ${err && err.stack ? err.stack : err}`);
    process.exit(2);
  });
}

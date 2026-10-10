#!/usr/bin/env node
// List every non-expired workflow artifact the archive ingests, keep those from TRUSTED
// runs, download them oldest first and fold each into the archive. Used by
// .github/workflows/archive.yml (daily) and archive-backfill.yml (rescue).
//
//   node scripts/archive/sweep.js --archive DIR [--names a,b] [--max N] [--budget-minutes M]
//        [--dry-run] [--since ISO] [--now ISO] [--run-cache FILE]
//   --max N counts snapshot artifacts only (the heavy ones); the small vetting, ledger and
//   reference artifacts in between are always taken. --run-cache keeps run lookups between
//   calls (the backfill calls this once per batch; GITHUB_TOKEN allows ~1000 requests/hour).
//
// Artifacts: job-board-snapshots(-pages|-beta), beta-crawl-<slug>, history-ledger,
// salary-vetting, archive-reference, monthly-refresh-report (scripts/archive/ingest.js), and
// raw copies kept under raw-rescue/ on the data branch (scripts/archive/raw.js): a raw copy
// is ingested from the branch itself, so it works after the artifact has expired.
//
// Trust rules: the same as .github/scripts/ledger.sh (REVIEW.md V2). An artifact is used only
// when its run (a) is of this repository (head repository == repo, so never a fork), (b) was
// triggered by push, schedule or workflow_dispatch (never pull_request, pull_request_target
// or workflow_run), and (c) ran on the default branch or a branch in TRUSTED_BRANCHES
// (space-separated). test/archive-sweep.test.js checks that ledger.sh decides the same way.
//
// Idempotent: artifacts already in the archive's ingest log are not downloaded again.
// Exit 0 when the sweep finished, 10 when --max or --budget-minutes stopped it with snapshot
// artifacts left (the workflow commits and calls it again), 1 on error. An ingest error
// (including a failed reconstruction check) stops the sweep before the archive is saved,
// so the workflow commits nothing from that batch.
// Env: GITHUB_REPOSITORY, GH_TOKEN, TRUSTED_BRANCHES, GH_BIN (default gh).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs, archiveDir, iso } from './lib.js';
import { openArchive, closeArchive, ingestArtifact, logArtifact, isKnownArtifact, BETA_CRAWL_PREFIX } from './ingest.js';
import { rawEntries, extractRaw } from './raw.js';

export const DEFAULT_NAMES = Object.freeze(['job-board-snapshots', 'job-board-snapshots-pages', 'job-board-snapshots-beta', 'history-ledger', 'salary-vetting', 'archive-reference', 'monthly-refresh-report']);
export const DEFAULT_PREFIXES = Object.freeze([BETA_CRAWL_PREFIX]);
export const TRUSTED_EVENTS = Object.freeze(['push', 'schedule', 'workflow_dispatch']);
export const MORE_EXIT = 10;
/** Snapshot artifacts are the heavy ones: --max counts only these. */
export const isHeavy = (name) => name.startsWith('job-board-snapshots') || name.startsWith(BETA_CRAWL_PREFIX);

export function gh(args) {
  const bin = process.env.GH_BIN || 'gh';
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${bin} ${args.slice(0, 3).join(' ')}: ${(r.stderr || r.stdout || '').trim().split('\n')[0].slice(0, 300)}`);
  return r.stdout;
}

/** JSON lines printed by `gh api --paginate --jq '... | tojson'` calls. */
function lines(out) {
  return out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/**
 * Trust decision for one run, the same rules as ledger.sh run_trust.
 * @param {{event, head_repository: {full_name}, head_branch}} run
 * @returns "trusted" or a reason
 */
export function runTrust(run, repo, trustedBranches) {
  if (!run) return 'run lookup failed';
  if (!TRUSTED_EVENTS.includes(run.event)) return `event '${run.event}'`;
  const head = run.head_repository && run.head_repository.full_name;
  if (head !== repo) return `head repository '${head}'`;
  if (!trustedBranches.includes(run.head_branch)) return `branch '${run.head_branch}'`;
  return 'trusted';
}

export const wanted = (name, names = DEFAULT_NAMES, prefixes = DEFAULT_PREFIXES) => (names.includes(name) || prefixes.some((p) => name.startsWith(p))) && isKnownArtifact(name);

/** Non-expired, same-repo artifacts the archive ingests, oldest first (one paginated listing). */
export function listArtifacts(repo, { names = DEFAULT_NAMES, prefixes = DEFAULT_PREFIXES } = {}) {
  const raw = gh(['api', '--paginate', `repos/${repo}/actions/artifacts?per_page=100`,
    '--jq', '.artifacts[] | {id, name, size_in_bytes, created_at, expires_at, expired, workflow_run: {id: .workflow_run.id, repository_id: .workflow_run.repository_id, head_repository_id: .workflow_run.head_repository_id, head_branch: .workflow_run.head_branch, head_sha: .workflow_run.head_sha}} | tojson']);
  const out = [];
  const seen = new Set();
  for (const a of lines(raw)) {
    if (a.expired || seen.has(a.id) || !wanted(a.name, names, prefixes)) continue;
    if (!a.workflow_run || a.workflow_run.head_repository_id !== a.workflow_run.repository_id) continue; // fork run
    seen.add(a.id);
    out.push(a);
  }
  return out.sort(byCreated);
}

const byCreated = (x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id - y.id);

export function getRun(repo, id, cache) {
  if (cache.has(id)) return cache.get(id);
  let run = null;
  try {
    run = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${id}`, '--jq', '{id, name, event, head_branch, head_sha, path, created_at, conclusion, head_repository: {full_name: .head_repository.full_name}}']));
  } catch { run = null; }
  cache.set(id, run);
  return run;
}

export function download(repo, a, dest) {
  fs.mkdirSync(dest, { recursive: true });
  gh(['run', 'download', String(a.workflow_run.id), '--repo', repo, '--name', a.name, '--dir', dest]);
}

/**
 * Plan a sweep (pure, for tests): live artifacts and raw-rescue copies not yet in the ingest
 * log, one entry per artifact id (a raw copy wins: no download needed), oldest first.
 * Every history-ledger artifact is read: each one's changed entries go to ledger/entries.
 */
export function planSweep(artifacts, done, raws = []) {
  const byId = new Map();
  for (const a of artifacts) if (!done.has(`artifact:${a.id}`)) byId.set(a.id, a);
  for (const r of raws) if (!done.has(`artifact:${r.id}`)) byId.set(r.id, r);
  return { todo: [...byId.values()].sort(byCreated) };
}

function loadRunCache(file) {
  const m = new Map();
  if (!file) return m;
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) m.set(Number(k), v); } catch { /* none yet */ }
  return m;
}

function saveRunCache(file, m) {
  if (!file) return;
  try { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(m))); } catch { /* best effort */ }
}

export async function sweep(opts) {
  const repo = opts.repo || process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');
  const log = opts.log || console.log;
  const names = opts.names || DEFAULT_NAMES;
  const prefixes = opts.names ? [] : DEFAULT_PREFIXES;
  let defaultBranch = null;
  try { defaultBranch = JSON.parse(gh(['api', `repos/${repo}`, '--jq', '{d: .default_branch}'])).d; } catch { defaultBranch = null; }
  const trusted = [defaultBranch, ...String(process.env.TRUSTED_BRANCHES || '').split(/\s+/)].filter(Boolean);
  const live = listArtifacts(repo, { names, prefixes }).filter((a) => !opts.since || a.created_at >= opts.since);
  const raws = rawEntries(opts.archive).filter((r) => wanted(r.name, names, prefixes));
  const ctx = await openArchive(opts.archive, { now: opts.now || new Date().toISOString() });
  const runs = loadRunCache(opts.runCache);
  const trustOf = (a) => (a.via === 'raw-rescue' ? a.trust : runTrust(getRun(repo, a.workflow_run.id, runs), repo, trusted));
  const { todo } = planSweep(live, ctx.done, raws);
  const meta = (a) => {
    const run = runs.get(a.workflow_run.id) || a.run || {};
    return { id: a.id, runId: a.workflow_run.id, workflow: run.name || null, event: run.event || null, branch: run.head_branch || a.workflow_run.head_branch || null, headSha: run.head_sha || a.workflow_run.head_sha || null, createdAt: iso(a.created_at), bytes: a.size_in_bytes ?? null, ...(a.via ? { via: a.via } : {}) };
  };
  const heavy = todo.filter((a) => isHeavy(a.name)).length;
  log(`sweep: ${live.length} non-expired artifact(s) and ${raws.length} raw-rescue cop(ies); ${todo.length} pending (${heavy} snapshot); trusted branches: ${trusted.join(' ')}`);
  const untrusted = (a, why) => {
    log(`  skip ${a.name} #${a.id} from run ${a.workflow_run.id} (untrusted: ${why})`);
    if (!opts.dryRun) logArtifact(ctx, { ...meta(a), name: a.name }, 'untrusted', why);
  };
  if (opts.dryRun) {
    for (const a of todo) {
      const why = trustOf(a);
      if (why !== 'trusted') { untrusted(a, why); continue; }
      log(`  would ingest ${a.name} #${a.id} run ${a.workflow_run.id} ${a.created_at} ${((a.size_in_bytes || 0) / 1e6).toFixed(1)} MB${a.via ? ` (${a.via})` : ''}`);
    }
    saveRunCache(opts.runCache, runs);
    return { status: 0, todo };
  }

  const started = Date.now();
  let n = 0;
  let heavyDone = 0;
  let failed = 0;
  let left = 0;
  const tmpRoot = fs.mkdtempSync(path.join(opts.tmp || os.tmpdir(), 'melon-archive-'));
  let ok = false;
  try {
    for (let i = 0; i < todo.length; i++) {
      const a = todo[i];
      const big = isHeavy(a.name);
      if (big && ((opts.max && heavyDone >= opts.max) || (opts.budgetMinutes && Date.now() - started > opts.budgetMinutes * 60000))) {
        left = todo.slice(i).filter((x) => isHeavy(x.name)).length;
        break;
      }
      const why = trustOf(a);
      if (why !== 'trusted') { untrusted(a, why); continue; }
      const dest = path.join(tmpRoot, String(a.id));
      const t0 = Date.now();
      try {
        if (a.via === 'raw-rescue') extractRaw(opts.archive, a, dest);
        else download(repo, a, dest);
      } catch (err) {
        failed++;
        log(`::warning::archive: could not fetch ${a.name} #${a.id} from run ${a.workflow_run.id}: ${err.message}`);
        fs.rmSync(dest, { recursive: true, force: true });
        continue;
      }
      // An ingest error is fatal for the batch: nothing of it is saved or committed.
      const r = await ingestArtifact(ctx, { name: a.name, dir: dest, artifact: meta(a) });
      fs.rmSync(dest, { recursive: true, force: true });
      n++;
      if (big) heavyDone++;
      log(`  ${a.name} #${a.id} (run ${a.workflow_run.id}, ${a.created_at}${a.via ? `, ${a.via}` : ''}): ${r.status}: ${r.detail} [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
      for (const x of r.results) if (x.status && !['duplicate', 'not-newer'].includes(x.status)) log(`    ${JSON.stringify(x)}`);
    }
    ok = true;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    saveRunCache(opts.runCache, runs);
    if (ok) closeArchive(ctx);
  }
  log(`sweep: ingested ${n} (${heavyDone} snapshot), could not fetch ${failed}, snapshot artifacts left for the next batch ${left}; reconstruct deep-equal checks passed: ${ctx.checks.reconstructed}`);
  return { status: left > 0 ? MORE_EXIT : 0, ingested: n, failed, left, reconstructed: ctx.checks.reconstructed };
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['dry-run'] });
  const r = await sweep({
    archive: archiveDir(a.archive),
    names: a.names ? String(a.names).split(',').map((s) => s.trim()).filter(Boolean) : null,
    max: a.max ? Number(a.max) : 0,
    budgetMinutes: a['budget-minutes'] ? Number(a['budget-minutes']) : 0,
    dryRun: !!a['dry-run'],
    since: a.since ? iso(a.since) : null,
    now: a.now ? iso(a.now) : null,
    tmp: a.tmp || process.env.RUNNER_TEMP || undefined,
    runCache: a['run-cache'] || null,
  });
  return r.status;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try { process.exit(await main(process.argv.slice(2))); } catch (err) { console.error(`::error::sweep: ${err.message}`); process.exit(1); }
}

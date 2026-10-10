#!/usr/bin/env node
// List every non-expired workflow artifact the archive ingests, keep those from
// TRUSTED runs, download them oldest first and fold each into the archive.
// Used by .github/workflows/archive.yml (daily) and archive-backfill.yml (rescue).
//
//   node scripts/archive/sweep.js --archive DIR [--names a,b] [--max N] [--budget-minutes M]
//        [--dry-run] [--since ISO] [--now ISO] [--run-cache FILE]
//   --max N counts snapshot artifacts only (the heavy ones); the small vetting, ledger and
//   reference artifacts in between are always taken. --run-cache keeps run lookups between
//   calls (the backfill calls this once per batch; GITHUB_TOKEN allows ~1000 requests/hour).
//
// Trust rules: the same as .github/scripts/ledger.sh (REVIEW.md V2). An artifact
// is used only when its run (a) is of this repository (head repository == repo, so
// never a fork), (b) was triggered by push, schedule or workflow_dispatch (never
// pull_request, pull_request_target or workflow_run), and (c) ran on the default
// branch or a branch in TRUSTED_BRANCHES (space-separated). test/archive-sweep.test.js
// checks that ledger.sh and this file decide the same way.
//
// Idempotent: artifacts already in the archive's ingest log are not downloaded again.
// Only the newest trusted history-ledger artifact is read; older ones are logged as
// "superseded" (each ledger is a full copy). Exit 0 when the sweep finished, 10 when
// --max or --budget-minutes stopped it with artifacts left (the workflow commits and
// calls it again), 1 on error.
// Env: GITHUB_REPOSITORY, GH_TOKEN, TRUSTED_BRANCHES, GH_BIN (default gh).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs, archiveDir, iso } from './lib.js';
import { openArchive, closeArchive, ingestArtifact, logArtifact, KNOWN_ARTIFACTS } from './ingest.js';

export const DEFAULT_NAMES = Object.freeze(['job-board-snapshots', 'job-board-snapshots-pages', 'job-board-snapshots-beta', 'history-ledger', 'salary-vetting', 'archive-reference']);
export const TRUSTED_EVENTS = Object.freeze(['push', 'schedule', 'workflow_dispatch']);
export const MORE_EXIT = 10;

function gh(args, { json = true } = {}) {
  const bin = process.env.GH_BIN || 'gh';
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${bin} ${args.slice(0, 3).join(' ')}: ${(r.stderr || r.stdout || '').trim().split('\n')[0].slice(0, 300)}`);
  return json ? r.stdout : r.stdout;
}

/** JSON lines printed by `gh api --paginate --jq '... | tojson'`-style calls. */
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

/** Non-expired, same-repo artifacts of the given names, oldest first. */
export function listArtifacts(repo, names) {
  const out = [];
  for (const name of names) {
    const raw = gh(['api', '--paginate', `repos/${repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
      '--jq', '.artifacts[] | {id, name, size_in_bytes, created_at, expired, workflow_run: {id: .workflow_run.id, repository_id: .workflow_run.repository_id, head_repository_id: .workflow_run.head_repository_id, head_branch: .workflow_run.head_branch, head_sha: .workflow_run.head_sha}} | tojson']);
    for (const a of lines(raw)) {
      if (a.name !== name || a.expired) continue;
      if (!a.workflow_run || a.workflow_run.head_repository_id !== a.workflow_run.repository_id) continue; // fork run
      out.push(a);
    }
  }
  return out.sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id - y.id));
}

export function getRun(repo, id, cache) {
  if (cache.has(id)) return cache.get(id);
  let run = null;
  try {
    run = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${id}`, '--jq', '{id, name, event, head_branch, head_sha, path, created_at, conclusion, head_repository: {full_name: .head_repository.full_name}}']));
  } catch { run = null; }
  cache.set(id, run);
  return run;
}

function download(repo, a, dest) {
  fs.mkdirSync(dest, { recursive: true });
  gh(['run', 'download', String(a.workflow_run.id), '--repo', repo, '--name', a.name, '--dir', dest], { json: false });
}

/** Snapshot artifacts are the heavy ones: --max counts only these. */
export const HEAVY = Object.freeze(['job-board-snapshots', 'job-board-snapshots-pages', 'job-board-snapshots-beta']);

/**
 * Plan a sweep (pure, for tests): the artifacts not yet in the ingest log, oldest
 * first. Each history-ledger artifact is a full ledger, so only the newest TRUSTED
 * one is read and the older ones are logged as superseded without being opened.
 * Trust of everything else is checked lazily, just before each download.
 * @param {object[]} artifacts  listArtifacts() output, oldest first
 * @param {Set<string>} done    ingest-log keys already final
 * @param {(a) => string} trustOf
 */
export function planSweep(artifacts, done, trustOf) {
  const pending = artifacts.filter((a) => !done.has(`artifact:${a.id}`));
  const ledgers = pending.filter((a) => a.name === 'history-ledger');
  const untrusted = [];
  let newest = null;
  for (let i = ledgers.length - 1; i >= 0; i--) {
    const why = trustOf(ledgers[i]);
    if (why === 'trusted') { newest = ledgers[i]; break; }
    untrusted.push({ a: ledgers[i], why });
  }
  const skip = new Set(untrusted.map(({ a }) => a.id));
  const superseded = newest ? ledgers.filter((a) => a.created_at < newest.created_at && !skip.has(a.id)) : [];
  for (const a of superseded) skip.add(a.id);
  return { todo: pending.filter((a) => !skip.has(a.id)), untrusted, superseded };
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
  for (const n of names) if (!KNOWN_ARTIFACTS.includes(n)) throw new Error(`unknown artifact name ${n}`);
  let defaultBranch = null;
  try { defaultBranch = JSON.parse(gh(['api', `repos/${repo}`, '--jq', '{d: .default_branch}'])).d; } catch { defaultBranch = null; }
  const trusted = [defaultBranch, ...String(process.env.TRUSTED_BRANCHES || '').split(/\s+/)].filter(Boolean);
  const all = listArtifacts(repo, names).filter((a) => !opts.since || a.created_at >= opts.since);
  const ctx = await openArchive(opts.archive, { now: opts.now || new Date().toISOString() });
  const runs = loadRunCache(opts.runCache);
  const trustOf = (a) => runTrust(getRun(repo, a.workflow_run.id, runs), repo, trusted);
  const plan = planSweep(all, ctx.done, trustOf);
  const meta = (a) => {
    const run = runs.get(a.workflow_run.id) || {};
    return { id: a.id, runId: a.workflow_run.id, workflow: run.name || null, event: run.event || null, branch: run.head_branch || a.workflow_run.head_branch || null, headSha: run.head_sha || a.workflow_run.head_sha || null, createdAt: iso(a.created_at), bytes: a.size_in_bytes };
  };
  const heavy = plan.todo.filter((a) => HEAVY.includes(a.name)).length;
  log(`sweep: ${all.length} non-expired artifact(s) of ${names.join(', ')}; ${plan.todo.length} pending (${heavy} snapshot), ${plan.superseded.length} superseded ledger(s); trusted branches: ${trusted.join(' ')}`);
  const untrusted = (a, why) => {
    log(`  skip ${a.name} #${a.id} from run ${a.workflow_run.id} (untrusted: ${why})`);
    if (!opts.dryRun) logArtifact(ctx, { ...meta(a), name: a.name }, 'untrusted', why);
  };
  for (const { a, why } of plan.untrusted) untrusted(a, why);
  if (opts.dryRun) {
    for (const a of plan.todo) {
      const why = trustOf(a);
      if (why !== 'trusted') { untrusted(a, why); continue; }
      log(`  would ingest ${a.name} #${a.id} run ${a.workflow_run.id} ${a.created_at} ${(a.size_in_bytes / 1e6).toFixed(1)} MB`);
    }
    saveRunCache(opts.runCache, runs);
    return { status: 0, plan };
  }
  for (const a of plan.superseded) logArtifact(ctx, { ...meta(a), name: a.name }, 'superseded', 'a newer trusted history-ledger artifact exists');

  const started = Date.now();
  let n = 0;
  let heavyDone = 0;
  let failed = 0;
  let left = 0;
  const tmpRoot = fs.mkdtempSync(path.join(opts.tmp || os.tmpdir(), 'melon-archive-'));
  try {
    for (let i = 0; i < plan.todo.length; i++) {
      const a = plan.todo[i];
      const isHeavy = HEAVY.includes(a.name);
      if (isHeavy && ((opts.max && heavyDone >= opts.max) || (opts.budgetMinutes && Date.now() - started > opts.budgetMinutes * 60000))) {
        left = plan.todo.slice(i).filter((x) => HEAVY.includes(x.name)).length;
        break;
      }
      const why = trustOf(a);
      if (why !== 'trusted') { untrusted(a, why); continue; }
      const dest = path.join(tmpRoot, String(a.id));
      const t0 = Date.now();
      try {
        download(repo, a, dest);
        const r = await ingestArtifact(ctx, { name: a.name, dir: dest, artifact: meta(a) });
        n++;
        if (isHeavy) heavyDone++;
        log(`  ${a.name} #${a.id} (run ${a.workflow_run.id}, ${a.created_at}): ${r.status}: ${r.detail} [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
        for (const x of r.results) if (x.status && x.status !== 'duplicate' && x.status !== 'not-newer') log(`    ${JSON.stringify(x)}`);
      } catch (err) {
        failed++;
        log(`::warning::archive: ${a.name} #${a.id} from run ${a.workflow_run.id} failed: ${err.message}`);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    saveRunCache(opts.runCache, runs);
    closeArchive(ctx);
  }
  log(`sweep: ingested ${n} (${heavyDone} snapshot), failed ${failed}, snapshot artifacts left for the next batch ${left}`);
  return { status: left > 0 ? MORE_EXIT : 0, ingested: n, failed, left };
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
  try { process.exit(await main(process.argv.slice(2))); } catch (err) { console.error(`sweep: ${err.message}`); process.exit(1); }
}

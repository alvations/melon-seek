// CI hygiene for .github/ (REVIEW.md V2, V12). Owner: devops.
// No YAML parser (zero deps): line-based checks on the workflow files, plus
// the artifact trust filter in .github/scripts/ledger.sh run against a stub gh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(ROOT, '.github', 'workflows');
const files = fs.readdirSync(WF).filter((f) => f.endsWith('.yml'));
const read = (f) => fs.readFileSync(path.join(WF, f), 'utf8');

/** The top-level `permissions:` block (lines until the next top-level key). */
function topPermissions(text) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^permissions:/.test(l));
  if (i < 0) return '';
  const out = [];
  for (const l of lines.slice(i + 1)) { if (/^\S/.test(l)) break; out.push(l); }
  return out.join('\n');
}

test('every action is pinned by a full commit SHA with a version comment', () => {
  for (const f of files) {
    for (const [n, line] of read(f).split('\n').entries()) {
      const m = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/.exec(line);
      if (!m || m[1].startsWith('./')) continue;
      assert.match(m[1], /@[0-9a-f]{40}$/, `${f}:${n + 1} not pinned by SHA: ${m[1]}`);
      assert.match(m[2], /#\s*v\d+\.\d+\.\d+/, `${f}:${n + 1} missing "# vX.Y.Z" comment`);
    }
  }
});

test('pages.yml: pages/id-token only on the deploy job; build is read-only', () => {
  const t = read('pages.yml');
  const top = topPermissions(t);
  assert.doesNotMatch(top, /pages:|id-token:|contents:\s*write/, 'workflow-level permissions must be read-only');
  const deploy = t.slice(t.indexOf('\n  deploy:'));
  assert.match(deploy, /permissions:\s*\n\s+pages: write\s*\n\s+id-token: write/, 'deploy job grants pages + id-token');
});

// Jobs allowed contents: write, by workflow. persist-ledger pushes the history ledger branch;
// archive-ingest pushes only the orphan data-archive branch (scripts/archive/branch.sh refuses
// main and claude/*, and never force-pushes).
const WRITE_JOBS = { 'archive.yml': ['archive-ingest'], 'archive-backfill.yml': ['archive-ingest'] };

// Workflows that may write, but only to their own bot review branch (a human merges the PR).
const REVIEW_BRANCH_WORKFLOWS = Object.freeze({ 'col-refresh.yml': 'bot/col-refresh' });
// monthly-refresh.yml commits tested reference data straight to its own trusted branch (the user's decision,
// 2026-10-16: "Commit straight make a GitHub action for it"); its pr mode still uses bot/monthly-refresh.
const COMMIT_AFTER_TESTS_WORKFLOWS = Object.freeze({ 'monthly-refresh.yml': 'bot/monthly-refresh' });

test('contents: write only where needed (gated ledger job, archive job, review-branch refresh workflows)', () => {
  for (const f of files) {
    const t = read(f);
    if (COMMIT_AFTER_TESTS_WORKFLOWS[f]) {
      const pushes = t.split('\n').filter((l) => /\bgit(w)? push\b/.test(l) && !/^\s*#/.test(l));
      const target = pushes.filter((l) => l.includes('origin "HEAD:refs/heads/$target"'));
      const review = pushes.filter((l) => l.includes('origin "$branch"'));
      assert.equal(target.length + review.length, pushes.length, `${f} pushes only its target or its review branch: ${pushes.join(' | ')}`);
      assert.equal(target.length, 1, `${f} has one push to its target branch`);
      assert.doesNotMatch(target[0], /--force|-f\b|\+refs/, `${f} never force-pushes the target branch`);
      assert.doesNotMatch(t, /git push[^\n]*\b(main|master|claude\/)/, `${f} names no branch in a push`);
      // The target push sits in the one step gated on tests passing and no problems, in commit mode.
      const step = t.slice(t.lastIndexOf('\n      - name:', t.indexOf('HEAD:refs/heads/$target')), t.indexOf('HEAD:refs/heads/$target'));
      assert.match(step, /if: env\.REFRESH_PUBLISH == 'commit' && needs\.refresh\.result == 'success' && needs\.refresh\.outputs\.datafiles != '0' && needs\.refresh\.outputs\.tests == 'success' && needs\.refresh\.outputs\.problems == '0'/, `${f}: the commit is gated on tests and problems`);
      assert.match(step, /target="\$GITHUB_REF_NAME"/, `${f} commits to the run's own branch`);
      assert.match(step, /case " \$\{DEFAULT_BRANCH:-\} \$TRUSTED_BRANCHES " in \*" \$target "\*\) ;; \*\) echo "::error::refusing/, `${f} refuses a branch that is not the default or trusted`);
      assert.doesNotMatch(step, /git add -A|git add \.|git commit -a/, `${f} commits only the files the refresh reported`);
      assert.match(t, /tests: \$\{\{ steps\.tests\.outcome \}\}/, `${f}: the refresh job reports the test outcome`);
      assert.match(t, /\n  REVIEW_BRANCH: bot\/monthly-refresh\n/, `${f}: pr mode keeps its bot review branch`);
      continue;
    }
    if (REVIEW_BRANCH_WORKFLOWS[f]) {
      const b = REVIEW_BRANCH_WORKFLOWS[f];
      const esc = b.replace(/[/]/g, '\\/');
      assert.ok(new RegExp(`branch="${esc}"`).test(t) || (new RegExp(`REVIEW_BRANCH:\\s*${esc}\\s*$`, 'm').test(t) && /branch="\$REVIEW_BRANCH"/.test(t)), `${f} works on its review branch ${b}`);
      const pushes = t.split('\n').filter((l) => /\bgit push\b/.test(l) && !/^\s*#/.test(l));
      assert.ok(pushes.length > 0 && pushes.every((l) => l.includes('origin "$branch"')), `${f} pushes only its branch: ${pushes.join(' | ')}`);
      assert.doesNotMatch(t, /git push[^\n]*\b(main|master|HEAD:|claude\/)/, `${f} never pushes to the default or deploy branch`);
      continue;
    }
    assert.doesNotMatch(topPermissions(t), /contents:\s*write/, `${f}: no workflow-level contents: write`);
    let job = null;
    for (const line of t.split('\n')) {
      const j = /^  ([a-z][a-z0-9-]*):\s*$/.exec(line);
      if (j) job = j[1];
      if (/^\s+contents:\s*write/.test(line)) {
        const allowed = ['persist-ledger', ...(WRITE_JOBS[f] || [])];
        assert.ok(allowed.includes(job), `${f}: contents: write outside ${allowed.join('/')} (job ${job})`);
      }
    }
  }
});

test('the archive branch helper refuses code and deploy branches and never force-pushes', () => {
  const sh = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'archive', 'branch.sh'), 'utf8');
  assert.match(sh, /claude\/\*\|main\|master\|gh-pages\) .*refusing/);
  assert.doesNotMatch(sh.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), /push[^\n]*(--force|-f\b|\+refs\/heads)/);
});

test('workflows that publish or persist data never run on pull_request', () => {
  for (const f of ['pages.yml', 'snapshot.yml', 'col-refresh.yml', 'monthly-refresh.yml']) {
    assert.doesNotMatch(read(f), /^\s*pull_request(_target)?\s*:/m, `${f} must not trigger on PRs`);
  }
});

test('ledger.sh restores artifacts only from trusted runs (V2)', { skip: process.platform === 'win32' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-ledger-'));
  try {
    const fix = path.join(tmp, 'fix.json');
    fs.writeFileSync(fix, JSON.stringify({
      artifacts: [
        { expired: false, created_at: '2026-10-02T09:00:00Z', workflow_run: { id: 5, repository_id: 1, head_repository_id: 99 } }, // fork
        { expired: false, created_at: '2026-10-02T08:00:00Z', workflow_run: { id: 4, repository_id: 1, head_repository_id: 1 } }, // pull_request
        { expired: false, created_at: '2026-10-02T07:00:00Z', workflow_run: { id: 3, repository_id: 1, head_repository_id: 1 } }, // other branch
        { expired: true, created_at: '2026-10-02T06:30:00Z', workflow_run: { id: 2, repository_id: 1, head_repository_id: 1 } },
        { expired: false, created_at: '2026-10-02T06:00:00Z', workflow_run: { id: 1, repository_id: 1, head_repository_id: 1 } }, // trusted
      ],
      runs: {
        4: { event: 'pull_request', head: 'o/r', branch: 'main' },
        3: { event: 'push', head: 'o/r', branch: 'feature-x' },
        1: { event: 'schedule', head: 'o/r', branch: 'main' },
      },
    }));
    // Stub gh: emulates the three API calls (with node doing the jq work) and run download.
    const stub = path.join(tmp, 'gh');
    fs.writeFileSync(stub, `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const fx = JSON.parse(fs.readFileSync(${JSON.stringify(fix)}, 'utf8'));
if (a[0] === 'api' && a[1] === 'repos/o/r') { console.log('main'); process.exit(0); }
if (a[0] === 'api' && a[1].startsWith('repos/o/r/actions/artifacts')) {
  const ids = fx.artifacts.filter((x) => !x.expired && x.workflow_run.head_repository_id === x.workflow_run.repository_id)
    .sort((x, y) => y.created_at.localeCompare(x.created_at)).map((x) => x.workflow_run.id);
  console.log(ids.join('\\n')); process.exit(0);
}
if (a[0] === 'api' && a[1].startsWith('repos/o/r/actions/runs/')) {
  const r = fx.runs[a[1].split('/').pop()]; if (!r) process.exit(1); console.log([r.event, r.head, r.branch].join('\\t')); process.exit(0);
}
if (a[0] === 'run' && a[1] === 'download') { const d = a[a.indexOf('--dir') + 1]; fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(d + '/x.json', JSON.stringify({ from: Number(a[2]) })); process.exit(0); }
process.exit(1);
`);
    fs.chmodSync(stub, 0o755);
    const out = path.join(tmp, 'out');
    const r = spawnSync('bash', [path.join(ROOT, '.github', 'scripts', 'ledger.sh'), 'restore-artifact'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${tmp}${path.delimiter}${process.env.PATH}`, GITHUB_REPOSITORY: 'o/r', TRUSTED_BRANCHES: 'deploy-branch', LEDGER_DIR: out },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /run 4 \(untrusted: event 'pull_request'\)/);
    assert.match(r.stdout, /run 3 \(untrusted: branch 'feature-x'\)/);
    assert.doesNotMatch(r.stdout, /run 5|run 2/, 'fork and expired artifacts are not even considered');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'x.json'), 'utf8')), { from: 1 }, 'restored from the trusted run');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

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

test('contents: write only where needed (gated ledger job, col-refresh branch)', () => {
  for (const f of files) {
    const t = read(f);
    if (f === 'col-refresh.yml') {
      assert.match(t, /branch="bot\/col-refresh"/, 'col-refresh works on its review branch');
      const pushes = t.split('\n').filter((l) => /\bgit push\b/.test(l) && !/^\s*#/.test(l));
      assert.ok(pushes.length > 0 && pushes.every((l) => l.includes('origin "$branch"')), `col-refresh pushes only its branch: ${pushes.join(' | ')}`);
      continue;
    }
    assert.doesNotMatch(topPermissions(t), /contents:\s*write/, `${f}: no workflow-level contents: write`);
    let job = null;
    for (const line of t.split('\n')) {
      const j = /^  ([a-z][a-z0-9-]*):\s*$/.exec(line);
      if (j) job = j[1];
      if (/^\s+contents:\s*write/.test(line)) assert.equal(job, 'persist-ledger', `${f}: contents: write outside persist-ledger (job ${job})`);
    }
  }
});

test('workflows that publish or persist data never run on pull_request', () => {
  for (const f of ['pages.yml', 'snapshot.yml', 'col-refresh.yml']) {
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

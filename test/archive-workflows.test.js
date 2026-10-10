// Hygiene of the archive workflows (archive.yml, archive-backfill.yml) and
// scripts/archive/branch.sh. Owner: archive. (test/workflows.test.js covers all
// workflows generically; these are the archive-specific guarantees.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(ROOT, '.github', 'workflows');
const FILES = ['archive.yml', 'archive-backfill.yml'];
const read = (f) => fs.readFileSync(path.join(WF, f), 'utf8');
const branchSh = fs.readFileSync(path.join(ROOT, 'scripts', 'archive', 'branch.sh'), 'utf8');

test('archive workflows: pinned actions, no PR triggers, trusted branches, shared concurrency group', () => {
  for (const f of FILES) {
    const t = read(f);
    for (const line of t.split('\n')) {
      const m = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
      if (m) assert.match(m[1], /@[0-9a-f]{40}$/, `${f}: ${m[1]} not pinned`);
    }
    assert.doesNotMatch(t, /^\s*pull_request(_target)?\s*:/m, `${f} must not run on pull requests`);
    assert.match(t, /TRUSTED_BRANCHES: claude\/stoic-ride-54ddxp/, `${f}: trusted branches`);
    assert.match(t, /concurrency:\s*\n\s+group: archive\s*\n\s+cancel-in-progress: false/, `${f}: group archive, never cancelled`);
    assert.match(t, /^permissions:\s*\n\s+contents: read\s*$/m, `${f}: read-only at the workflow level`);
    const job = t.slice(t.indexOf('\njobs:'));
    assert.match(job, /permissions:\s*\n\s+contents: write[^\n]*\n\s+actions: read/, `${f}: the job needs only contents: write + actions: read`);
    assert.doesNotMatch(t, /pages: write|id-token: write|pull-requests: write|issues: write/, `${f}: nothing else`);
    assert.doesNotMatch(t, /git push/, `${f}: pushes only through scripts/archive/branch.sh`);
    assert.match(t, /verify\.js --archive "\$ARCHIVE" --prev-rev HEAD/, `${f}: verifies against the previous commit before each commit`);
    assert.doesNotMatch(t, /\$\{\{\s*github\.event\.(workflow_run|head_commit|pull_request)/, `${f}: no untrusted event fields in scripts`);
  }
  const daily = read('archive.yml');
  assert.match(daily, /workflow_run:\s*\n\s+workflows: \["Snapshot job boards", "Deploy to GitHub Pages"\]/);
  for (const name of ['Snapshot job boards', 'Deploy to GitHub Pages']) {
    const owner = name === 'Snapshot job boards' ? 'snapshot.yml' : 'pages.yml';
    assert.match(read(owner), new RegExp(`^name: ${name}$`, 'm'), `${owner} is still named "${name}" (archive.yml listens for it)`);
  }
  assert.match(read('archive-backfill.yml'), /workflow_dispatch:/);
});

test('branch.sh writes only the data branch, never force-pushes, and refuses code branches', () => {
  const pushes = branchSh.split('\n').filter((l) => /\bgit\b.*\bpush\b/.test(l) && !/^\s*#/.test(l));
  assert.equal(pushes.length, 1);
  assert.match(pushes[0], /"HEAD:refs\/heads\/\$BRANCH"/);
  assert.doesNotMatch(pushes[0], /--force|\s-f\b|\+HEAD|--mirror|--delete/, 'no force push');
  assert.match(branchSh, /BRANCH="\$\{ARCHIVE_BRANCH:-data-archive\}"/);
  assert.match(branchSh, /claude\/\*\|main\|master\|gh-pages\) echo "archive-branch: refusing/);
});

test('branch.sh: creates the orphan data branch, appends commits on top, no-op when unchanged', { skip: process.platform === 'win32' }, async () => {
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-branch-test-'));
  const sh = (cmd, cwd = t, env = {}) => {
    const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: t, ...env } });
    assert.equal(r.status, 0, `${cmd}\n${r.stdout}\n${r.stderr}`);
    return r.stdout.trim();
  };
  try {
    const script = path.join(ROOT, 'scripts', 'archive', 'branch.sh');
    sh('git init -q --bare remote.git && git init -q -b code work && cd work && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m code && git remote add origin ../remote.git && git push -q origin code');
    const work = path.join(t, 'work');
    sh(`bash ${script} open "${t}/a1"`, work);
    assert.deepEqual(fs.readdirSync(path.join(t, 'a1')).filter((n) => n !== '.git'), [], 'empty orphan tree');
    fs.writeFileSync(path.join(t, 'a1', 'MANIFEST.json'), '{}\n');
    sh(`bash ${script} commit "${t}/a1" "archive: first"`, work);
    sh(`bash ${script} close "${t}/a1"`, work);
    sh(`bash ${script} open "${t}/a2"`, work);
    assert.equal(fs.readFileSync(path.join(t, 'a2', 'MANIFEST.json'), 'utf8'), '{}\n');
    assert.match(sh(`bash ${script} commit "${t}/a2" "archive: nothing"`, work), /no changes/);
    fs.mkdirSync(path.join(t, 'a2', 'daily'));
    fs.writeFileSync(path.join(t, 'a2', 'daily', '2026-10.jsonl'), '{"a":1}\n');
    sh(`bash ${script} commit "${t}/a2" "archive: second"`, work);
    const log = sh('git --git-dir=remote.git log --format=%s data-archive');
    assert.deepEqual(log.split('\n'), ['archive: second', 'archive: first']);
    assert.equal(sh('git --git-dir=remote.git rev-list --max-parents=0 data-archive').split('\n').length, 1, 'one root: an orphan history');
    assert.equal(sh('git --git-dir=remote.git log --format=%s code'), 'code', 'the code branch is untouched');
    assert.match(sh('git --git-dir=remote.git log -1 --format=%an data-archive'), /github-actions\[bot\]/);
    const r = spawnSync('bash', [script, 'open', `${t}/a3`], { cwd: work, encoding: 'utf8', env: { ...process.env, ARCHIVE_BRANCH: 'claude/x' } });
    assert.equal(r.status, 2, 'refuses a code branch');
    sh(`bash ${script} close "${t}/a2"`, work);
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

// scripts/cycle/checkpoint.sh and restore-wip.sh: an agent's unfinished work (commits, uncommitted
// edits, new files) survives a stop. The user, 2026-10-16: "Make sure that if we get stop again due to
// limits, we're able to resume without losing much progress. So push and compile often".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = 'claude/stoic-ride-54ddxp';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
const sh = (cwd, script, args) => execFileSync('bash', [path.join(ROOT, 'scripts/cycle', script), ...args], { cwd, encoding: 'utf8', env: { ...process.env, MELON_BRANCH: BRANCH, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-ckpt-'));
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', origin);
  const repo = path.join(dir, 'repo');
  git(dir, 'clone', '-q', origin, repo);
  git(repo, 'checkout', '-q', '-b', BRANCH);
  fs.writeFileSync(path.join(repo, 'app.js'), 'export const a = 1;\n');
  git(repo, 'add', 'app.js'); git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'push', '-q', 'origin', BRANCH);
  // An agent worktree: one commit, one uncommitted edit, one new file, a data symlink and a big file.
  const wt = path.join(dir, 'agent');
  git(repo, 'worktree', 'add', '-q', '--detach', wt, BRANCH);
  fs.writeFileSync(path.join(wt, 'lib.js'), 'export const b = 2;\n');
  git(wt, 'add', 'lib.js'); git(wt, 'commit', '-q', '-m', 'lane: lib');
  fs.writeFileSync(path.join(wt, 'app.js'), 'export const a = 3; // edited, not committed\n');
  fs.mkdirSync(path.join(wt, 'docs'));
  fs.writeFileSync(path.join(wt, 'docs', 'log.md'), '# log\n- next: finish the test\n');
  fs.mkdirSync(path.join(wt, 'data'));
  fs.symlinkSync(dir, path.join(wt, 'data', 'snapshots'));
  fs.writeFileSync(path.join(wt, 'big.bin'), Buffer.alloc(6 * 1024 * 1024));
  fs.mkdirSync(path.join(wt, 'docs', 'screenshots', 'lane-a'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'docs', 'screenshots', 'lane-a', 'shot.png'), 'png');
  return { dir, origin, repo, wt };
}

test('checkpoint pushes a lane\'s commits, edits and new files to wip/<lane>/, and restore-wip brings them back', () => {
  const { dir, origin, repo, wt } = setup();
  const ckpt = path.join(dir, 'ckpt');
  const out = sh(repo, 'checkpoint.sh', ['--push', '--ckpt', ckpt, `lane-a=${wt}`]);
  assert.match(out, /committed [0-9a-f]+ \(lane-a\)/);
  const files = git(origin, 'ls-tree', '-r', '--name-only', BRANCH).trim().split('\n');
  for (const f of ['wip/lane-a/STATUS.md', 'wip/lane-a/uncommitted.diff', 'wip/lane-a/untracked.tgz']) assert.ok(files.includes(f), `${f} pushed`);
  assert.ok(files.some((f) => /^wip\/lane-a\/commits\/0001-lane-lib\.patch$/.test(f)), 'the commit as a patch');
  const status = git(origin, 'show', `${BRANCH}:wip/lane-a/STATUS.md`);
  assert.match(status, /data\/snapshots \(symlink\)/, 'the data link is left out and listed');
  assert.match(status, /big\.bin \(\d+ bytes\)/, 'a file over 5 MB is left out and listed');
  assert.match(status, /docs\/screenshots\/lane-a\/shot\.png \(screenshot/, 'new screenshots are listed, not copied');

  // Unchanged work is not recommitted.
  assert.match(sh(repo, 'checkpoint.sh', ['--push', '--ckpt', ckpt, `lane-a=${wt}`]), /nothing changed/);

  const back = path.join(dir, 'restored');
  sh(repo, 'restore-wip.sh', ['lane-a', back]);
  assert.equal(fs.readFileSync(path.join(back, 'lib.js'), 'utf8'), 'export const b = 2;\n', 'committed work');
  assert.equal(fs.readFileSync(path.join(back, 'app.js'), 'utf8'), 'export const a = 3; // edited, not committed\n', 'uncommitted edit');
  assert.equal(fs.readFileSync(path.join(back, 'docs', 'log.md'), 'utf8'), '# log\n- next: finish the test\n', 'new file');
  assert.match(git(back, 'log', '--format=%s', '-1'), /lane: lib/, 'the commit is replayed, not squashed');
  assert.ok(!fs.existsSync(path.join(back, 'data', 'snapshots')), 'no data link restored');
  assert.ok(!fs.existsSync(path.join(back, 'wip')), 'restored at the base, before any checkpoint');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CI and Pages ignore pushes of only wip/**, so a checkpoint never redeploys the site', () => {
  for (const f of ['ci.yml', 'pages.yml']) {
    const y = fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8');
    const push = y.slice(y.indexOf('\non:\n'), y.indexOf('\n', y.indexOf('paths-ignore')) + 1);
    assert.match(push, /\n {2}push:\n(?: {4}.*\n)*? {4}paths-ignore: \['wip\/\*\*'\]\n/, `${f}: push ignores wip/**`);
  }
});

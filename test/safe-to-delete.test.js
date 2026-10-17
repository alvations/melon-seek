// scripts/cycle/safe-to-delete.sh: a lane's worktree is deleted only once its code, its uncommitted work, its
// checkpoint and its log are on the branch. The user, 2026-10-17: "Make sure the data and code is pushed and
// the audit trail before you delete stuff".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = 'claude/stoic-ride-54ddxp';
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV });
const check = (cwd, ...lanes) => spawnSync('bash', [path.join(ROOT, 'scripts/cycle/safe-to-delete.sh'), ...lanes], { cwd, encoding: 'utf8', env: ENV });
const write = (dir, f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-safe-'));
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', origin);
  const repo = path.join(dir, 'repo');
  git(dir, 'clone', '-q', origin, repo);
  git(repo, 'checkout', '-q', '-b', BRANCH);
  write(repo, 'app.js', 'export const a = 1;\n');
  write(repo, 'scripts/e2e.js', "import './base.e2e.js';\n");
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'push', '-q', 'origin', BRANCH);
  const wt = path.join(dir, 'lane');
  git(repo, 'worktree', 'add', '-q', '--detach', wt, BRANCH);
  write(wt, 'lib.js', 'export const b = 2;\n');
  write(wt, 'docs/process/lane-a.md', '# log\n');
  write(wt, 'docs/process/prompts/lane-a.md', 'prompt\n');
  write(wt, 'scripts/e2e.js', "import './base.e2e.js';\nimport './lane-a.e2e.js';\n");
  git(wt, 'add', '.'); git(wt, 'commit', '-q', '-m', 'lane-a: lib, log and prompt');
  fs.mkdirSync(path.join(wt, 'data'));
  fs.symlinkSync(dir, path.join(wt, 'data', 'snapshots')); // a data link is not lost work
  return { dir, repo, wt };
}

// The lead's integration: the lane's commit cherry-picked (or squashed) onto a branch that has moved on, with
// another lane's registration beside it, and the lane's last checkpoint naming its HEAD.
function integrate(repo, wt, { squash = false, checkpoint = true } = {}) {
  write(repo, 'other.js', 'export const c = 3;\n');
  write(repo, 'scripts/e2e.js', "import './base.e2e.js';\nimport './other.e2e.js';\n");
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'other lane');
  const head = git(wt, 'rev-parse', 'HEAD').trim();
  for (const f of ['lib.js', 'docs/process/lane-a.md', 'docs/process/prompts/lane-a.md']) write(repo, f, git(wt, 'show', `HEAD:${f}`));
  write(repo, 'scripts/e2e.js', "import './base.e2e.js';\nimport './other.e2e.js';\nimport './lane-a.e2e.js';\n");
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', squash ? 'lane-a, squashed' : 'lane-a: lib, log and prompt');
  if (checkpoint) { write(repo, 'wip/lane-a/STATUS.md', `- Head: \`${head}\`\n`); git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'WIP checkpoint: lane-a'); }
  git(repo, 'push', '-q', 'origin', BRANCH);
}

test('a lane whose commits are not on the branch is not safe to delete', () => {
  const { repo, wt } = setup();
  const r = check(repo, `lane-a=${wt}`);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /lane-a: NOT SAFE: code: 1 commit\(s\) not on/);
  assert.match(r.stdout, /NOT SAFE: checkpoint: no wip\/lane-a/);
  assert.match(r.stdout, /NOT SAFE: audit: docs\/process\/lane-a\.md is not on/);
});

test('once cherry-picked, checkpointed and logged on the branch, a lane is safe to delete', () => {
  const { repo, wt } = setup();
  integrate(repo, wt);
  const r = check(repo, `lane-a=${wt}`);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /lane-a: safe to delete/);
});

test('a squashed lane is safe when its files are on the branch as it left them, the e2e registry included', () => {
  const { repo, wt } = setup();
  integrate(repo, wt, { squash: true });
  const r = check(repo, `lane-a=${wt}`);
  assert.equal(r.status, 0, r.stdout);
});

test('uncommitted edits, new files and a checkpoint behind HEAD each make a lane unsafe', () => {
  const { repo, wt } = setup();
  integrate(repo, wt);
  write(wt, 'app.js', 'export const a = 9;\n');
  write(wt, 'notes.txt', 'a finding not yet written up\n');
  let r = check(repo, `lane-a=${wt}`);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /NOT SAFE: changes: uncommitted: +M app\.js/);
  assert.match(r.stdout, /NOT SAFE: changes: untracked: notes\.txt/);
  git(wt, 'checkout', '-q', '--', 'app.js'); fs.rmSync(path.join(wt, 'notes.txt'));
  write(wt, 'lib.js', 'export const b = 4;\n'); git(wt, 'add', 'lib.js'); git(wt, 'commit', '-q', '-m', 'lane-a: one more');
  r = check(repo, `lane-a=${wt}`);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /NOT SAFE: checkpoint: the last wip\/lane-a \([0-9a-f]+\) is not at HEAD/);
});

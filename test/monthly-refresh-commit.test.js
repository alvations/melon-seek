// monthly-refresh.yml's commit step (the user's decision, 2026-10-16: "Commit straight make a GitHub action for
// it"), run for real: the step's own shell, cut out of the workflow, against scratch git repos, with `gh` stubbed.
// It must commit only the tested files, only the allowed paths, only to its own branch, never over a tip that
// changed a refreshed file since the tested commit (S-8), and deploy at once only when the tree is the tested one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = 'claude/stoic-ride-54ddxp';
const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...ID } }).trim();

/** The `run: |` body of the workflow step whose name starts with `name`. */
function stepScript(name) {
  const lines = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'monthly-refresh.yml'), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(`      - name: ${name}`));
  assert.ok(start >= 0, `step "${name}"`);
  const run = lines.findIndex((l, i) => i > start && /^ {8}run: \|$/.test(l));
  const out = [];
  for (let i = run + 1; i < lines.length && (lines[i] === '' || lines[i].startsWith('          ')); i++) out.push(lines[i].slice(10));
  return out.join('\n');
}

function setup({ files = ['data/cities.json'], moveTip = null, ref = `refs/heads/${BRANCH}` } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-refresh-commit-'));
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', origin);
  const seed = path.join(dir, 'seed');
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', BRANCH);
  for (const f of ['data/cities.json', 'data/freshness.json', 'server/app.js', 'wip/lane/STATUS.md']) {
    fs.mkdirSync(path.join(seed, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(seed, f), `old ${f}\n`);
  }
  git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'tested commit');
  git(seed, 'push', '-q', 'origin', BRANCH);
  const tested = git(seed, 'rev-parse', 'HEAD');
  if (moveTip) {
    fs.writeFileSync(path.join(seed, moveTip), `newer ${moveTip}\n`);
    git(seed, 'commit', '-q', '-am', `tip moves ${moveTip}`);
    git(seed, 'push', '-q', 'origin', BRANCH);
  }
  // The publish job's checkout: the tested commit, with the refresh job's artifacts in tmp/.
  const work = path.join(dir, 'work');
  git(dir, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '--detach', tested);
  fs.mkdirSync(path.join(work, 'tmp', 'refresh'), { recursive: true });
  fs.writeFileSync(path.join(work, 'tmp', 'refresh', 'outcome.json'), JSON.stringify({ files }));
  for (const f of files) {
    fs.mkdirSync(path.join(work, 'tmp', 'changes', path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(work, 'tmp', 'changes', f), `refreshed ${f}\n`);
  }
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const ghLog = path.join(dir, 'gh.log');
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$*" >> "${ghLog}"\n`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  const r = spawnSync('bash', ['-c', stepScript('Commit the tested data')], {
    cwd: work, encoding: 'utf8',
    env: {
      ...process.env, ...ID, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GH_TOKEN: 'test-token',
      GITHUB_REF_NAME: BRANCH, GITHUB_REF: ref, GITHUB_SHA: tested, DEFAULT_BRANCH: BRANCH, TRUSTED_BRANCHES: BRANCH,
      GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1', GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
    },
  });
  const show = (f) => { try { return git(origin, 'show', `${BRANCH}:${f}`); } catch { return null; } };
  const gh = fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8') : '';
  return { dir, r, show, gh, tipMessage: git(origin, 'log', '-1', '--format=%s', BRANCH) };
}

const done = (t) => fs.rmSync(t.dir, { recursive: true, force: true });

test('tip is the tested commit: commits the refreshed file, dispatches CI and the deploy', () => {
  const t = setup();
  assert.equal(t.r.status, 0, t.r.stderr);
  assert.equal(t.show('data/cities.json'), 'refreshed data/cities.json');
  assert.match(t.tipMessage, /^chore\(data\): monthly refresh of reference data/);
  assert.match(t.gh, /workflow run ci\.yml --ref claude\/stoic-ride-54ddxp/);
  assert.match(t.gh, /workflow run pages\.yml --ref claude\/stoic-ride-54ddxp/);
  done(t);
});

test('tip moved only in wip/ (checkpoints): commits on top of it and still deploys', () => {
  const t = setup({ moveTip: 'wip/lane/STATUS.md' });
  assert.equal(t.r.status, 0, t.r.stderr);
  assert.equal(t.show('data/cities.json'), 'refreshed data/cities.json');
  assert.equal(t.show('wip/lane/STATUS.md'), 'newer wip/lane/STATUS.md', 'the newer commit is kept');
  assert.match(t.gh, /pages\.yml/);
  done(t);
});

test('S-8: tip changed a refreshed file since the tested commit: refuses, pushes nothing', () => {
  const t = setup({ files: ['data/cities.json', 'data/freshness.json'], moveTip: 'data/freshness.json' });
  assert.notEqual(t.r.status, 0);
  assert.match(t.r.stdout + t.r.stderr, /changed a refreshed file after the tested commit/);
  assert.equal(t.show('data/freshness.json'), 'newer data/freshness.json', 'the newer change is not reverted');
  assert.equal(t.show('data/cities.json'), 'old data/cities.json');
  assert.equal(t.gh, '');
  done(t);
});

test('S-8: tip changed other code: commits the data, runs CI, but does not deploy an untested tree', () => {
  const t = setup({ moveTip: 'server/app.js' });
  assert.equal(t.r.status, 0, t.r.stderr);
  assert.equal(t.show('data/cities.json'), 'refreshed data/cities.json');
  assert.equal(t.show('server/app.js'), 'newer server/app.js');
  assert.match(t.gh, /ci\.yml/);
  assert.doesNotMatch(t.gh, /pages\.yml/);
  done(t);
});

test('S-9: a file the refresh does not write is refused (allow-list), nothing is pushed', () => {
  const t = setup({ files: ['data/cities.json', 'server/app.js'] });
  assert.notEqual(t.r.status, 0);
  assert.match(t.r.stdout + t.r.stderr, /refusing to publish 'server\/app\.js'/);
  assert.equal(t.show('data/cities.json'), 'old data/cities.json');
  done(t);
});

test('S-9 hygiene: a tag named like the branch is refused', () => {
  const t = setup({ ref: `refs/tags/${BRANCH}` });
  assert.notEqual(t.r.status, 0);
  assert.match(t.r.stdout + t.r.stderr, /is not a branch/);
  assert.equal(t.show('data/cities.json'), 'old data/cities.json');
  done(t);
});

test('S-9: the allow-list equals the files the refresh writers write', async () => {
  const lib = (m) => import(path.join(ROOT, 'scripts', 'refresh', m));
  const { FX_CODE_COPIES, SHARED_FALLBACK_FILE } = await lib('fx.js');
  const { LIVABILITY } = await lib('derived.js');
  const { TAX_FILE } = await lib('tax-watch.js');
  const literal = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'refresh')).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'refresh', f), 'utf8');
    for (const m of src.matchAll(/\bfile: '([^']+\.(?:json|md|js))'/g)) literal.add(m[1]);
  }
  const writers = new Set(['data/freshness.json', 'docs/DATA_FRESHNESS.md', ...literal, ...FX_CODE_COPIES.map((c) => c.file), SHARED_FALLBACK_FILE, LIVABILITY, TAX_FILE]);
  const step = stepScript('Commit the tested data');
  const allow = /\n {4}([^\n]*\|test\/juice\.test\.js)\) ;;/.exec(`\n${step}`)?.[1].trim().split('|') || [];
  assert.deepEqual(new Set(allow), writers, `allow-list ${allow.join(', ')}`);
});

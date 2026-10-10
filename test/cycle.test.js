// The improvement cycle's playbook, templates and helper scripts (docs/process/PLAYBOOK.md).
// User, 2026-10-10: "make sure we remember those flows / steps so that we can replicate and
// continue to improve them while we do the same for the beta page."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latestObservations } from '../scripts/cycle/local-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TEMPLATES = ['desktop-qa', 'mobile-qa', 'mobile-perf', 'data-check', 'persona-review', 'fix-lane'];

test('the playbook links every template, script and the skill, and each exists', () => {
  const book = read('docs/process/PLAYBOOK.md');
  for (const t of TEMPLATES) {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/process/prompts/cycle', `${t}.md`)), `${t}.md exists`);
    assert.ok(book.includes(`prompts/cycle/${t}.md`), `PLAYBOOK links ${t}.md`);
  }
  for (const s of ['scripts/cycle/local-data.js', 'scripts/cycle/serve.mjs', 'scripts/cycle/sync-shared.sh', 'scripts/cycle/shrink-screenshots.sh']) {
    assert.ok(fs.existsSync(path.join(ROOT, s)), `${s} exists`);
    assert.ok(book.includes(s), `PLAYBOOK names ${s}`);
  }
  const skill = read('.claude/skills/improvement-cycle/SKILL.md');
  assert.match(skill, /^---\nname: improvement-cycle\ndescription: .+\n---\n/);
  assert.ok(skill.includes('docs/process/PLAYBOOK.md'));
});

test('every placeholder a template uses is documented in the templates README', () => {
  const readme = read('docs/process/prompts/cycle/README.md');
  for (const t of TEMPLATES) {
    const body = read(`docs/process/prompts/cycle/${t}.md`);
    for (const [ph] of body.matchAll(/<[A-Z][A-Z_]+>/g)) assert.ok(readme.includes('`' + ph + '`'), `${t}.md uses ${ph}, which README.md must explain`);
    assert.ok(/never push/i.test(body), `${t}.md tells the agent never to push`);
    assert.ok(/prompts\/<ROLE>\.md/.test(body), `${t}.md asks the agent to save its prompt verbatim`);
  }
});

test('local-data picks each company\'s last folded or late observation on or before the date', () => {
  const rows = [
    { company: 'a', observedAt: '2026-10-09T10:00:00.000Z', status: 'folded' },
    { company: 'a', observedAt: '2026-10-10T09:00:00.000Z', status: 'folded' },
    { company: 'a', observedAt: '2026-10-10T11:00:00.000Z', status: 'rejected' },
    { company: 'b', observedAt: '2026-10-08T10:00:00.000Z', status: 'late' },
    { company: 'b', observedAt: '2026-10-11T10:00:00.000Z', status: 'folded' },
  ];
  const all = latestObservations(rows);
  assert.equal(all.get('a').observedAt, '2026-10-10T09:00:00.000Z');
  assert.equal(all.get('b').observedAt, '2026-10-11T10:00:00.000Z');
  const upTo = latestObservations(rows, '2026-10-10');
  assert.equal(upTo.get('b').observedAt, '2026-10-08T10:00:00.000Z');
  assert.equal(latestObservations(rows, '2026-10-01').size, 0);
});

test('local beta data is gitignored', () => {
  // The folders themselves, not files inside: a lane or integration worktree symlinks them, and
  // git refuses to look "beyond a symbolic link".
  const out = execFileSync('git', ['-C', ROOT, 'check-ignore', 'data/beta/snapshots', 'data/snapshots']).toString();
  assert.match(out, /^data\/beta\/snapshots$/m);
  assert.match(out, /^data\/snapshots$/m);
});

test('serve.mjs serves a build under /melon-seek/ (beta included), writes and removes its pid file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-serve-'));
  fs.mkdirSync(path.join(dir, 'dist', 'beta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<p>stable</p>');
  fs.writeFileSync(path.join(dir, 'dist', 'beta', 'index.html'), '<p>beta</p>');
  const pid = path.join(dir, 'serve.pid');
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/cycle/serve.mjs'), '--dist', path.join(dir, 'dist'), '--pid', pid], { env: { ...process.env, PORT: '0' } });
  try {
    const url = await new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', (d) => { buf += d; const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/melon-seek\//); if (m) resolve(m[0]); });
      child.on('exit', (c) => reject(new Error(`serve exited ${c}`)));
      setTimeout(() => reject(new Error('serve did not start')), 5000);
    });
    assert.equal(fs.readFileSync(pid, 'utf8'), String(child.pid));
    assert.equal(await (await fetch(url)).text(), '<p>stable</p>');
    assert.equal(await (await fetch(url + 'beta/')).text(), '<p>beta</p>');
    assert.equal((await fetch(url + '..%2f..%2fetc%2fpasswd')).status, 403, 'an encoded path outside dist/ is refused');
    assert.equal((await fetch(url.replace('/melon-seek/', '/'), { redirect: 'manual' })).status, 302);
  } finally {
    const exited = new Promise((r) => child.on('exit', r));
    child.kill('SIGTERM');
    await exited;
  }
  assert.ok(!fs.existsSync(pid), 'the pid file is removed on SIGTERM');
});

test('sync-shared.sh takes untouched files, merges edited text, keeps conflicts and binaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-sync-'));
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  const w = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  const r = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  w('merge.txt', 'a\nb\nc\nd\ne\n'); w('plain.txt', 'old\n'); w('conf.txt', 'old\n'); w('del.txt', 'x\n'); w('bin.dat', Buffer.from([0, 1]));
  git('add', '-A'); git('commit', '-qm', 'old'); const oldSha = git('rev-parse', 'HEAD');
  w('merge.txt', 'a\nB\nc\nd\ne\n'); w('plain.txt', 'new\n'); w('conf.txt', 'theirs\n'); fs.rmSync(path.join(dir, 'del.txt')); w('bin.dat', Buffer.from([0, 2])); w('added.txt', 'added\n');
  git('add', '-A'); git('commit', '-qm', 'new'); const newSha = git('rev-parse', 'HEAD');
  git('reset', '-q', '--hard', oldSha);
  w('merge.txt', 'a\nb\nc\nd\nE\n'); w('conf.txt', 'mine\n'); w('bin.dat', Buffer.from([0, 3])); w('agent.txt', 'agent\n');
  const out = execFileSync('bash', [path.join(ROOT, 'scripts/cycle/sync-shared.sh'), oldSha, newSha], { cwd: dir }).toString();
  assert.equal(git('rev-parse', 'HEAD'), newSha);
  assert.equal(r('merge.txt'), 'a\nB\nc\nd\nE\n');
  assert.equal(r('plain.txt'), 'new\n');
  assert.equal(r('added.txt'), 'added\n');
  assert.equal(r('conf.txt'), 'mine\n');
  assert.deepEqual([...fs.readFileSync(path.join(dir, 'bin.dat'))], [0, 3]);
  assert.equal(r('agent.txt'), 'agent\n');
  assert.ok(!fs.existsSync(path.join(dir, 'del.txt')));
  assert.match(out, /kept: bin\.dat \(binary/);
  assert.match(out, /kept: conf\.txt \(merge conflict/);
});

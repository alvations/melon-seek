// Site link policy (scripts/links-policy.js): users are never sent to GitHub,
// and never off the site except to allowlisted hosts; every relative link and
// #anchor in the built site resolves. Owner: devops. The build also enforces it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = await import(pathToFileURL(path.join(ROOT, 'scripts', 'links-policy.js')).href);
let TMP, DIST;

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-links-'));
  DIST = path.join(TMP, 'dist');
  for (const d of ['snaps', 'hist']) fs.mkdirSync(path.join(TMP, d));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, MELON_SNAPSHOT_DIR: path.join(TMP, 'snaps'), MELON_HISTORY_DIR: path.join(TMP, 'hist') },
  });
  assert.equal(r.status, 0, `build failed (it enforces the link policy):\n${r.stdout}\n${r.stderr}`);
});
after(() => { if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); });

test('public/**/*.{js,html}: no GitHub links, only allowlisted hosts', () => {
  const v = policy.policyFiles(path.join(ROOT, 'public'))
    .flatMap((f) => policy.checkText(path.relative(ROOT, f), fs.readFileSync(f, 'utf8')));
  assert.deepEqual(v, []);
});

test('built dist: no GitHub links, only allowlisted hosts, every relative link and #anchor resolves', () => {
  assert.deepEqual(policy.checkDist(DIST), []);
});

test('the Juice "How it\'s calculated" link is on-site and lands on the formula section', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const m = /const JUICE_DOC = '([^']+)'/.exec(app);
  assert.ok(m, 'JUICE_DOC constant');
  assert.doesNotMatch(m[1], /^https?:|github/i, 'relative, not GitHub');
  const [p, hash] = m[1].split('#');
  const page = fs.readFileSync(path.join(DIST, p, 'index.html'), 'utf8');
  assert.match(page, new RegExp(`id="${hash}"`), `methodology page has #${hash}`);
  assert.match(page, /<a href="\.\.\/">← Back to the jobs<\/a>/, 'link back to the app');
  assert.match(page, /href="\.\.\/styles\.css"/, 'uses the site stylesheet');
  assert.doesNotMatch(page, /href="[^"]*github/i, 'no link to GitHub (source citations are shown as text)');
});

test('the policy catches violations (negative cases)', () => {
  const t = (file, text) => policy.checkText(file, text);
  assert.equal(t('a.js', "h('a', { href: 'https://github.com/alvations/melon-seek/blob/main/docs/X.md' })").length >= 1, true);
  assert.equal(t('a.js', "el.href = 'https://evil.example.org.attacker.net/x';").length, 1);
  assert.equal(t('a.html', '<a href="https://raw.githubusercontent.com/x/y">x</a>').length, 1);
  assert.equal(t('a.html', '<a href="https://tracker.io/">x</a>').length, 1);
  assert.equal(t('a.js', "// see https://github.com/foo (a comment, not a link)").length, 0);
  assert.equal(t('a.html', '<a href="https://jobs.lever.co/acme/1">apply</a><link href="https://fonts.googleapis.com/css2">').length, 0);
  // Relative links that don't resolve, or anchors that don't exist, fail in dist.
  const bad = path.join(TMP, 'bad');
  fs.mkdirSync(path.join(bad, 'methodology'), { recursive: true });
  fs.writeFileSync(path.join(bad, 'methodology', 'index.html'), '<h2 id="ok">x</h2>');
  fs.writeFileSync(path.join(bad, 'index.html'), '<a href="missing.html">a</a><a href="methodology/#nope">b</a><a href="methodology/#ok">c</a>');
  fs.writeFileSync(path.join(bad, 'app.js'), "const DOC = 'methodology/#gone';");
  const v = policy.checkDist(bad);
  assert.equal(v.length, 3, v.join('\n'));
});

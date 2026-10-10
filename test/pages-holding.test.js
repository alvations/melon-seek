// The repo-root index.html / 404.html are the holding page GitHub's branch-based Pages build
// ("pages build and deployment") publishes on every push while Settings -> Pages -> Source is
// "Deploy from a branch". Without them that build publishes the README (user, 2026-10-10:
// "Why is https://alvations.github.io/melon-seek/ going to the github readme again?! … Never let
// that happen again!"). The app itself is dist/ (scripts/build-static.js), deployed by pages.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

for (const file of ['index.html', '404.html']) {
  test(`repo-root ${file} is the self-refreshing holding page, never the README`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} must exist at the repo root (else GitHub's branch build publishes README.md)`);
    const html = read(file);
    assert.match(html, /<meta name="melon-seek-holding" content="branch-build/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /<meta http-equiv="refresh" content="\d+">/, 'reloads itself until the app deploy lands');
    assert.ok(!/<script/i.test(html), 'no scripts');
    assert.ok(!/(?:href|src)="https?:\/\//i.test(html), 'no off-site links');
    assert.ok(!/melon-seek-build/.test(html), 'must never look like an app build to check-site.sh');
  });
}

test('the app never ships the holding page (build source is public/, not the repo root)', () => {
  assert.ok(!/melon-seek-holding/.test(read('public/index.html')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'public', '404.html')) || !/melon-seek-holding/.test(read('public/404.html')));
});

test('check-site.sh reports the holding page as "holding" (not ok), so pages.yml re-deploys', async (t) => {
  const html = read('index.html');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'holding-')), 'out');
  fs.writeFileSync(out, '');
  const url = `http://127.0.0.1:${server.address().port}/`;
  const code = await new Promise((resolve) => {
    execFile('bash', [path.join(ROOT, '.github/scripts/check-site.sh'), url, 'abc123'],
      { env: { ...process.env, CHECK_TIMEOUT: '0', CHECK_INTERVAL: '1', GITHUB_OUTPUT: out } },
      (err) => resolve(err ? err.code : 0));
  });
  assert.equal(code, 1);
  assert.match(fs.readFileSync(out, 'utf8'), /result=holding/);
});

// MELON_OFFLINE=1 (server/index.js): the server never fetches upstream. test/perf.test.js relies on it to time the
// snapshot path; without it, on a runner with network, the suite crawled the real Anduril and Cohere boards
// (monthly-refresh run 38972598049). Each case runs in its own process, since the switch is read at import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json');

// Pipeline inline (so the mocked fetch is the one the adapters call), every upstream URL recorded, the Greenhouse
// fixture served for any request, then one /api/jobs request for a built-in board.
const CHILD = `
const mod = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href)});
mod.setPipelineInline(true);
const calls = [];
const body = ${JSON.stringify(fs.readFileSync(FIXTURE, 'utf8'))};
globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }); };
const server = mod.createServer({ log: false });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const real = (await import('node:http')).default;
const res = await new Promise((resolve) => real.get({ host: '127.0.0.1', port: server.address().port, path: '/api/jobs?company=anduril' }, (r) => { let s = ''; r.on('data', (d) => { s += d; }); r.on('end', () => resolve(JSON.parse(s))); }));
server.close();
console.log(JSON.stringify({ calls, mode: res.mode }));
process.exit(0);
`;

function run(extra) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-offline-'));
  const empty = path.join(tmp, 'empty');
  fs.mkdirSync(empty);
  const env = {
    ...process.env, MELON_CACHE_DIR: path.join(tmp, 'cache'), MELON_SNAPSHOT_DIR: empty, MELON_HISTORY_DIR: empty,
    MELON_BETA_SNAPSHOT_DIR: empty, MELON_BETA_HISTORY_DIR: empty, MELON_WARM: '0', MELON_OFFLINE: '', ...extra,
  };
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('MELON_OFFLINE=1: a built-in board is served without any upstream request', () => {
  const off = run({ MELON_OFFLINE: '1' });
  assert.deepEqual(off.calls, [], 'no upstream request');
  assert.notEqual(off.mode, 'live');
});

test('without MELON_OFFLINE the same request goes upstream (the check above can fail)', () => {
  const on = run({});
  assert.ok(on.calls.length > 0, 'a live fetch was attempted');
  assert.ok(on.calls.every((u) => u.startsWith('https://boards-api.greenhouse.io/')), on.calls.join(', '));
  assert.equal(on.mode, 'live');
});

// ci.yml's "Static build" step checks the built lists with .github/scripts/check-lists.mjs. That step is not
// part of `npm test`, and on 2026-10-16 a list-format change (melon-packed-3) passed every local test and turned
// CI red (run 38930131882: jq could not read packed rows). This runs the same check on a no-data build, as CI has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ci.yml list check passes on a no-data build (the lists unpack to job objects, no HTML, no stored Juice)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-ci-lists-'));
  const empty = path.join(tmp, 'empty');
  fs.mkdirSync(empty);
  const dist = path.join(tmp, 'dist');
  const env = { ...process.env, MELON_SNAPSHOT_DIR: empty, MELON_HISTORY_DIR: empty, MELON_BETA_SNAPSHOT_DIR: empty, MELON_BETA_HISTORY_DIR: empty };
  const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', dist], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000 });
  assert.equal(build.status, 0, `build failed:\n${build.stdout}\n${build.stderr}`);
  const check = spawnSync(process.execPath, [path.join(ROOT, '.github', 'scripts', 'check-lists.mjs'), dist], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, `check-lists failed:\n${check.stdout}\n${check.stderr}`);
  assert.match(check.stdout, /check-lists: \d+ lists read through unpackJobs, 0 problems/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('ci.yml runs the list check and no longer reads packed rows with raw jq', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(y, /node \.github\/scripts\/check-lists\.mjs dist/);
  assert.doesNotMatch(y, /\.jobs\[\] \| select\(has\(/, 'no jq on raw .jobs[] rows');
  assert.doesNotMatch(y, /\.format == "melon-packed-2"/, 'the format is checked by check-lists.mjs');
});

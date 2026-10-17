// Integration hygiene: no merge-conflict marker left in a tracked source file. A lone "=======" in
// public/styles.css (from an integration merge, 2026-10-17) silently dropped the CSS rule after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = /\.(?:m?js|css|html|ya?ml|json|sh|py)$/;
const MARKER = /^(?:<{7}(?: |$)|={7}$|>{7}(?: |$))/m;

test('no merge-conflict markers in tracked source files', () => {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0');
  } catch {
    return; // not a git checkout (a packed copy): nothing to check
  }
  const bad = [];
  for (const f of files) {
    if (!SOURCE.test(f) || f.startsWith('data/') || f.startsWith('docs/screenshots/')) continue;
    let text;
    try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const m = text.match(MARKER);
    if (m) bad.push(`${f}:${text.slice(0, m.index).split('\n').length}: ${m[0]}`);
  }
  assert.deepEqual(bad, [], `conflict markers left by a merge:\n${bad.join('\n')}`);
});

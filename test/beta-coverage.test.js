// Test-suite QA for the beta site (docs/process/qa-suite-beta.md, 2026-10-23): checks that the suites cover what they
// say they cover. Tests named [T-n] encode a gap in the suites themselves; each is a `todo` until the owning test file
// or scripts/e2e.js is fixed (docs/process/patches/qa-suite-beta-*.diff), so it shows in `npm test` without turning CI
// red. The rest are guards that pass today. Nothing here needs data or a browser; the one data check skips without
// both the beta snapshots and a beta build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const E2E = path.join(ROOT, 'test', 'e2e');
const e2eFiles = () => fs.readdirSync(E2E).filter((f) => f.endsWith('.e2e.js')).sort();
// Fixed by qa-suite-beta-e2e-runner.diff (T-4, T-5, T-9, T-10) and qa-suite-beta-t1-board-list.diff (T-1): every
// test of these IDs passes, so they are real tests now. T-17 waits on fix-mr-3 (norm-13).
const FIXED = new Set(['T-1', 'T-4', 'T-5', 'T-9', 'T-10']);
const todo = (id) => (FIXED.has(id) ? {} : { todo: `${id}: docs/process/qa-suite-beta.md` });

const { listCompanies } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
/** The boards the beta site shows: the registry's non-paused beta companies. */
const BETA = listCompanies({ channel: 'beta' }).filter((c) => c.channel === 'beta').map((c) => c.slug).sort();

/** Files run on their own (a CLI, a WebKit job), never through scripts/e2e.js. Each needs its reason. */
const STANDALONE = {
  // (none today: links.e2e.js says "Register from scripts/e2e.js", and is not; see [T-4])
};

test('beta-coverage: the registry has the seven big-tech boards the brief names, none paused', () => {
  assert.deepEqual(BETA, ['amazon', 'apple', 'google', 'meta', 'microsoft', 'netflix', 'nvidia']);
});

test('beta-coverage: every registered e2e group is imported from a file that exists (scripts/e2e.js)', () => {
  const src = read('scripts', 'e2e.js');
  const imports = [...src.matchAll(/import \{ (\w+) \} from '\.\.\/test\/e2e\/([\w.-]+\.js)';/g)];
  assert.ok(imports.length > 30, `only ${imports.length} imports found: the pattern no longer matches scripts/e2e.js`);
  for (const [, fn, file] of imports) {
    assert.ok(fs.existsSync(path.join(E2E, file)), `${file} is imported but missing`);
    if (fn === 'createSuite') continue;
    assert.match(read('test', 'e2e', file), new RegExp(`export function ${fn}\\b`), `${file} exports no ${fn}`);
    if (/^register/.test(fn)) assert.match(src, new RegExp(`\\b${fn}\\(suite\\)`), `${fn} is imported but never called`);
  }
});

test('[T-4] every e2e file with a register function runs in the full suite (links.e2e.js never does)', todo('T-4'), () => {
  const src = read('scripts', 'e2e.js');
  const missing = [];
  for (const f of e2eFiles()) {
    const fns = [...read('test', 'e2e', f).matchAll(/export function (register\w+)\(/g)].map((m) => m[1]);
    if (!fns.length || STANDALONE[f]) continue;
    for (const fn of fns) if (!new RegExp(`\\b${fn}\\(suite\\)`).test(src)) missing.push(`${f} ${fn}`);
  }
  assert.deepEqual(missing, [], `never run by node scripts/e2e.js: ${missing.join(', ')}`);
});

/**
 * Arrays and objects in the e2e files that list big-tech boards: `const NAME = [...]` / `{ slug: ... }` holding at least
 * four of the seven slugs. A list that holds four or more means "the big-tech boards"; it must hold all seven, or a
 * board added later (Amazon and Meta, 2026-10-11) is never tested by it.
 */
function boardLists() {
  const out = [];
  for (const f of e2eFiles()) {
    const src = read('test', 'e2e', f);
    for (const m of src.matchAll(/const (\w+) = (\[[^\]\n]*\]|\{[^}\n]*\})/g)) {
      const slugs = [...new Set([...m[2].matchAll(/['"]?\b(amazon|apple|google|meta|microsoft|netflix|nvidia)\b['"]?\s*[:,\]}'"]/g)].map((x) => x[1]))];
      if (slugs.length >= 4) out.push({ file: f, name: m[1], slugs });
    }
  }
  return out;
}

test('beta-coverage: the e2e files still declare their board lists the way this check reads them', () => {
  // Hand-written lists, plus files that take the list from the registry (test/e2e/beta-boards.mjs, the T-1 patch).
  const lists = boardLists();
  const fromRegistry = e2eFiles().filter((f) => /from '\.\/beta-boards\.mjs'/.test(read('test', 'e2e', f)));
  assert.ok(lists.length + fromRegistry.length >= 6, `found ${lists.length} board lists and ${fromRegistry.length} files reading beta-boards.mjs`);
  assert.ok(lists.some((l) => l.file === 'fix-phone-text.e2e.js' && l.slugs.length === 7), 'fix-phone-text.e2e.js BOARDS (all seven) not found');
});

test('[T-1] every e2e list of "the big-tech boards" names all seven (Amazon and Meta are missing from three)', todo('T-1'), () => {
  const short = boardLists().filter((l) => BETA.some((s) => !l.slugs.includes(s)))
    .map((l) => `${l.file} ${l.name} lacks ${BETA.filter((s) => !l.slugs.includes(s)).join(', ')}`);
  assert.deepEqual(short, [], short.join('; '));
});

test('beta-coverage: the WebKit phone smoke and the Chromium phone matrix name every beta board or read the registry', () => {
  const wf = read('.github', 'workflows', 'webkit-phone.yml');
  const m = /phone-smoke\.mjs[^\n]*--boards ([\w,]+)/.exec(wf);
  assert.ok(m, 'webkit-phone.yml runs phone-smoke.mjs with --boards');
  assert.deepEqual(m[1].split(',').sort(), BETA, 'the WebKit phone smoke boards');
});

test('beta-coverage: phone-sizes.mjs lists 21 distinct sizes, each a touch phone with a viewport, DPR and user agent', async () => {
  const { ALL_SIZES, contextFor } = await import(pathToFileURL(path.join(E2E, 'phone-sizes.mjs')).href);
  assert.ok(ALL_SIZES.length >= 19, `${ALL_SIZES.length} sizes`);
  const keys = ALL_SIZES.map((d) => `${d.name} ${d.width}x${d.height}`);
  assert.equal(new Set(keys).size, keys.length, 'sizes are distinct');
  assert.equal(new Set(ALL_SIZES.map((d) => d.name)).size, ALL_SIZES.length, 'names are distinct (tests are named by them)');
  for (const d of ALL_SIZES) {
    const o = contextFor(d);
    assert.ok(o.viewport.width >= 280 && o.viewport.height >= 300 && o.deviceScaleFactor >= 1 && o.hasTouch && o.isMobile, d.name);
    assert.match(o.userAgent, /iPhone|Android/, d.name);
  }
  assert.ok(ALL_SIZES.some((d) => d.width === 280), 'the folded Fold (280 px)');
  assert.ok(ALL_SIZES.some((d) => d.width === 352 && d.height === 355), 'the Razr cover screen');
  assert.ok(ALL_SIZES.some((d) => d.width > d.height), 'a landscape posture');
});

/** e2e files whose tests loop over every phone size (ALL_SIZES, or PHONES with POSTURES). */
function sizeLoopFiles() {
  return e2eFiles().filter((f) => /for \(const \w+ of (\[\.\.\.)?(ALL_SIZES|PHONES)\b|\b(ALL_SIZES|PHONES)\.(forEach|map)\(/.test(read('test', 'e2e', f)));
}
test('beta-coverage: the phone checks that run at every size are the ones this suite\'s phone map lists', () => {
  const files = sizeLoopFiles();
  for (const f of ['phone-matrix.e2e.js', 'fix-phone-text.e2e.js', 'fix-phone-controls.e2e.js', 'beta-coverage.e2e.js']) {
    assert.ok(files.includes(f), `${f} no longer loops over every phone size (found: ${files.join(', ')})`);
  }
});

test('beta-coverage: the harness keeps its per-test timeout and context cleanup', () => {
  const h = read('test', 'e2e', 'harness.js');
  assert.match(h, /E2E_TEST_TIMEOUT/, 'per-test timeout');
  assert.match(h, /ctx\.cleanup/, 'contexts a failed test left open are closed');
});

test('[T-9] a failed e2e test prints how long it ran (only passing tests print a time today)', todo('T-9'), () => {
  const h = read('test', 'e2e', 'harness.js');
  // The pass line prints `(${Date.now() - start}ms)`; the fail line must too, or a run's time cannot be split by group.
  const failLine = /console\.log\(`  \\u2717 \$\{t\.name\}[^\n]*/.exec(h);
  assert.ok(failLine, 'the fail line is printed');
  assert.match(failLine[0], /\\u2717 \$\{t\.name\} \(\$\{[^}]*start\}ms/, `the fail line prints no duration: ${failLine[0]}`);
});

test('[T-10] scripts/e2e.js can split a run (--shard=i/n) and list tests without running them (--list)', todo('T-10'), () => {
  const src = read('scripts', 'e2e.js');
  assert.match(src, /--shard/, 'no --shard option');
  assert.match(src, /--list/, 'no --list option');
});

test('[T-5] the e2e run fails when a board\'s tests all skip because the build lacks that board', todo('T-5'), () => {
  // Every beta group skips its tests when a board's list is missing from the build ("no <slug> list in this build").
  // A beta gate that drops Amazon turns dozens of Amazon tests into skips and the run stays green. scripts/e2e.js should
  // fail (or the coverage group's build check should) when a board the registry lists has no list in the build.
  const src = read('scripts', 'e2e.js');
  assert.match(src, /E2E_ALLOW_SKIPS|maxSkips|skipped.*exit|exit.*skipped/, 'skips never fail the run');
});

/* -------------------------------------------------------------------------------------------- real data (local) */

const SNAP = process.env.MELON_BETA_SNAPSHOT_DIR === '' ? null : path.resolve(process.env.MELON_BETA_SNAPSHOT_DIR || path.join(ROOT, 'data', 'beta', 'snapshots'));
const DIST = path.resolve(process.env.E2E_DIST || process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));
const haveData = SNAP && BETA.every((s) => fs.existsSync(path.join(SNAP, `${s}.json`)));
const haveBuild = fs.existsSync(path.join(DIST, 'beta', 'api', 'jobs'));

test('beta-coverage: the build publishes every beta board with every posting of its snapshot (none dropped, none added)',
  { skip: !(haveData && haveBuild) && 'needs data/beta/snapshots and a beta build (dist/, E2E_DIST or BETA_QA_DIST)' }, async () => {
    const { unpackJobs } = await import(pathToFileURL(path.join(ROOT, 'public', 'api.js')).href);
    const bad = [];
    for (const slug of BETA) {
      const snap = JSON.parse(fs.readFileSync(path.join(SNAP, `${slug}.json`), 'utf8'));
      const want = (snap.jobs || []).length;
      const f = path.join(DIST, 'beta', 'api', 'jobs', `${slug}.json`);
      if (!fs.existsSync(f)) { bad.push(`${slug}: not in the build (${want} postings in the snapshot)`); continue; }
      const got = unpackJobs(JSON.parse(fs.readFileSync(f, 'utf8'))).length;
      if (got !== want) bad.push(`${slug}: ${got} in the build, ${want} in the snapshot`);
      const pv = path.join(DIST, 'beta', 'api', 'preview', `${slug}.json`);
      if (fs.existsSync(pv)) {
        const total = JSON.parse(fs.readFileSync(pv, 'utf8')).preview?.total;
        if (total !== got) bad.push(`${slug}: the preview says ${total}, the list has ${got}`);
      }
    }
    assert.deepEqual(bad, [], bad.join('; '));
  });

test('[T-17] no posting title holds a line break (Meta 1, Amazon 2 on the 2026-10-16 crawl: "Partner Development Manager\\n, Benelux …")',
  { ...todo('T-17'), skip: !haveData && 'needs data/beta/snapshots' }, () => {
    // The card shows "Manager , Benelux" (the break collapses to a space before the comma), and a CSV reader that splits
    // on lines (beta-mobile-qa's CSV check did) counts an extra row. server/normalize.js keeps the title's raw whitespace.
    const bad = [];
    for (const slug of BETA) {
      const snap = JSON.parse(fs.readFileSync(path.join(SNAP, `${slug}.json`), 'utf8'));
      for (const j of snap.jobs || []) if (/[\r\n]/.test(j.title || '')) bad.push(`${j.id} ${JSON.stringify(j.title)}`);
    }
    assert.deepEqual(bad, [], `${bad.length} titles with a line break: ${bad.slice(0, 5).join('; ')}`);
  });

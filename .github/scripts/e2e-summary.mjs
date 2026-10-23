// Merge the e2e shard logs (scripts/e2e.js --shard=i/n) into one result, for .github/workflows/e2e.yml.
//
//   node .github/scripts/e2e-summary.mjs [--expected <file>] [--summary <file>] <shard log> [...]
//
// --expected: one entry per line, `<ID> <owner or decision>` (e.g. `V-33 fix-viz-5`); a test whose name holds `[<ID>]`
// (or `[<ID>,` / `, <ID>]` in a list of IDs), or starts with it after the group (`Compstimate: T21 cold server`), is
// red by design until its lane lands. An entry whose reason starts with `flaky` is a known flake: it may pass or fail.
// Lines starting with # are notes.
// Exit 1 when a test fails that no entry expects, when a shard log has no final "e2e: N/M passed" line (it timed out or
// crashed), or when an expected-red test passes (the entry is stale: remove it). Exit 0 otherwise.
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const expectedFile = opt('--expected');
const summaryFile = opt('--summary');
const logs = args;

const expected = new Map();
if (expectedFile && fs.existsSync(expectedFile)) {
  for (const line of fs.readFileSync(expectedFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [id, ...why] = t.split(/\s+/);
    expected.set(id, why.join(' '));
  }
}
const idsOf = (name) => {
  const ids = [...name.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/,\s*/)).map((x) => x.trim());
  const lead = /^[^:\[]+: ([A-Z][A-Z0-9]*-?\d+[a-z]?)\b/.exec(name); // the older names: "Compstimate: T21 cold server"
  return lead ? [...ids, lead[1]] : ids;
};
const flaky = (id) => /^flaky\b/i.test(expected.get(id) || '');
const expectedFor = (name) => idsOf(name).find((id) => expected.has(id)) || null;

const tests = [];
const unfinished = [];
for (const f of logs) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  if (!/^e2e: \d+\/\d+ passed/m.test(text)) unfinished.push(f);
  lines.forEach((l, i) => {
    let m = /^ {2}✓ (.*?) \((\d+)ms\)$/.exec(l);
    if (m) return void tests.push({ log: f, name: m[1], ok: true, ms: Number(m[2]) });
    m = /^ {2}✗ (.*?)(?: \((\d+)ms\))?$/.exec(l);
    if (m) return void tests.push({ log: f, name: m[1], ok: false, ms: m[2] ? Number(m[2]) : null, err: (lines[i + 1] || '').trim() });
    m = /^ {2}- (.*) \(skipped: (.*)\)$/.exec(l);
    if (m) tests.push({ log: f, name: m[1], ok: true, skipped: m[2] });
  });
}
const failed = tests.filter((t) => !t.ok);
const unexpected = failed.filter((t) => !expectedFor(t.name));
const known = failed.filter((t) => expectedFor(t.name));
const stale = tests.filter((t) => t.ok && !t.skipped && expectedFor(t.name) && !flaky(expectedFor(t.name)));
const skipped = tests.filter((t) => t.skipped);
const minutes = tests.reduce((a, t) => a + (t.ms || 0), 0) / 60000;

const out = [];
out.push(`### E2E: ${tests.length} tests in ${logs.length} shard(s), ${tests.length - failed.length - skipped.length} passed, ${failed.length} failed (${known.length} expected), ${skipped.length} skipped; ${minutes.toFixed(0)} min of test time`);
if (unfinished.length) out.push(`\n**Shards that did not finish:** ${unfinished.join(', ')}`);
if (unexpected.length) { out.push('\n**Unexpected failures**'); for (const t of unexpected) out.push(`- ${t.name}\n  \`${String(t.err || '').slice(0, 200)}\``); }
if (stale.length) { out.push('\n**Expected red but passing (take the entry off docs/process/e2e-expected-red.txt)**'); for (const t of stale) out.push(`- [${expectedFor(t.name)}] ${t.name}`); }
if (known.length) { out.push('\n<details><summary>Expected: red by design or a known flake</summary>\n'); for (const t of known) out.push(`- [${expectedFor(t.name)}: ${expected.get(expectedFor(t.name))}] ${t.name}`); out.push('\n</details>'); }
const text = out.join('\n');
console.log(text);
if (summaryFile) fs.appendFileSync(summaryFile, text + '\n');
process.exit(unexpected.length || unfinished.length || stale.length ? 1 : 0);

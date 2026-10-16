// Merge interleaved single-round runs (perf-<prefix>-1.json, -2, -3 from perf-mobile-beta-2.mjs) into one
// perf-<prefix>.json, so perf-mobile-beta-coldtable.mjs gives medians per cell; every run keeps its load.
// usage: node perf-mobile-beta-2-merge.mjs <dir> <prefix> [<prefix> ...]
import fs from 'node:fs';
import path from 'node:path';
const [dir, ...prefixes] = process.argv.slice(2);
for (const p of prefixes) {
  const files = fs.readdirSync(dir).filter((f) => new RegExp(`^perf-${p}-\\d+\\.json$`).test(f)).sort();
  const parts = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (!parts.length) { console.log(`${p}: no runs`); continue; }
  const out = { label: p, base: parts[0].base, at: parts[0].at, loadavgStart: parts[0].loadavgStart, loadavgEnd: parts.at(-1).loadavgEnd, runs: parts.flatMap((x, i) => x.runs.map((r) => ({ ...r, run: i + 1 }))), leak: [] };
  fs.writeFileSync(path.join(dir, `perf-${p}.json`), JSON.stringify(out, null, 1));
  console.log(`${p}: ${files.length} rounds, ${out.runs.length} runs; loads ${out.runs.map((r) => r.loadavg.split(' ')[0]).join(' ')}`);
}

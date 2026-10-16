// Medians of interleaved cold loads, several builds side by side (perf-mobile-beta-2.md 5.6).
// usage: node perf-mobile-beta-2-table.mjs <label>=<merged perf json> ...   (perf-mobile-beta-2-merge.mjs output)
// "First cards" is the first frame with result cards: the preview's (data-preview-id) when it shows, else the list's.
import fs from 'node:fs';
const cols = process.argv.slice(2).map((a) => { const [label, file] = a.split('='); return { label, R: JSON.parse(fs.readFileSync(file, 'utf8')) }; });
const s = (ms) => (ms == null || !Number.isFinite(ms) ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const med = (a) => { const x = a.filter((v) => v != null && Number.isFinite(v)).sort((p, q) => p - q); return x.length ? x[x.length >> 1] : null; };
const runsOf = (R, net, co) => R.runs.filter((r) => r.net === net && r.company === co && r.cold);
const first = (r) => (r.cold.preview ? Math.min(r.cold.preview, r.cold.cards || Infinity) : r.cold.cards);
const cells = [];
for (const { R } of cols) for (const r of R.runs) if (!cells.some(([n, c]) => n === r.net && c === r.company)) cells.push([r.net, r.company]);
const metrics = [['First cards', first], ['List in', (r) => r.cold.cards], ['First chart', (r) => r.cold.chart], ['TTI', (r) => r.cold.tti], ['Longest task', (r) => r.cold.maxTask], ['TBT', (r) => r.cold.tbt]];
console.log(`| Network · board | ${metrics.map(([m]) => m).join(' | ')} |`);
console.log(`|---|${metrics.map(() => '---').join('|')}|`);
for (const [net, co] of cells) {
  const row = metrics.map(([, f]) => cols.map(({ R }) => s(med(runsOf(R, net, co).map(f)))).join(' → '));
  console.log(`| ${net === 'fast4g' ? 'Fast 4G' : 'Slow 4G'} · ${co} | ${row.join(' | ')} |`);
}
console.log(`\nColumns: ${cols.map((c) => c.label).join(' → ')}.`);
for (const { label, R } of cols) {
  const loads = R.runs.map((r) => Number(r.loadavg.split(' ')[0]));
  console.log(`${label}: ${R.runs.length} runs, 1-min load ${Math.min(...loads).toFixed(2)}-${Math.max(...loads).toFixed(2)}; first cards per cell (min-max): ${cells.map(([n, c]) => { const v = runsOf(R, n, c).map(first); return v.length ? `${n} ${c} ${s(Math.min(...v))}-${s(Math.max(...v))}` : null; }).filter(Boolean).join(', ')}`);
  const pm = R.runs.filter((r) => r.cold && r.cold.previewMatch != null);
  if (pm.length) console.log(`  preview's first cards = the list's: ${pm.filter((r) => r.cold.previewMatch).length} of ${pm.length} runs`);
  const bad = R.runs.filter((r) => r.fail || (r.errors && r.errors.length));
  if (bad.length) console.log(`  failures/errors: ${bad.map((r) => `${r.net} ${r.company}: ${r.fail || r.errors.join(' | ')}`).join('; ')}`);
}

// Before -> after markdown tables from perf-<label>.json (perf-mobile-beta.mjs output).
import fs from 'node:fs';
const [bf, af] = process.argv.slice(2);
const B = JSON.parse(fs.readFileSync(bf, 'utf8')), A = af ? JSON.parse(fs.readFileSync(af, 'utf8')) : null;
const s = (ms) => (ms == null ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const pair = (b, a, f = s) => (A ? `${f(b)} → ${f(a)}` : f(b));
const find = (R, net, co) => R.runs.find((r) => r.net === net && r.company === co);
const NAME = { apple: 'Apple', google: 'Google', nvidia: 'NVIDIA', microsoft: 'Microsoft', netflix: 'Netflix', anduril: 'Anduril' };
const nets = [...new Set(B.runs.map((r) => r.net))];
const cos = [...new Set(B.runs.map((r) => r.company))];
const list = (r, co) => r?.cold?.api?.[`api/jobs/${co}.json`];
console.log('| Network · company | FCP | First card | First chart | TTI | Max task | TBT | Heap | Warm first chart | Switch away / back |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const net of nets) for (const co of cos) {
  const b = find(B, net, co), a = A && find(A, net, co);
  const g = (k, sub) => [b?.[k]?.[sub], a?.[k]?.[sub]];
  const row = [
    `${net === 'fast4g' ? 'Fast 4G' : 'Slow 4G'} · ${NAME[co] || co}`,
    pair(...g('cold', 'fcp')), pair(...g('cold', 'cards')), pair(...g('cold', 'chart')), pair(...g('cold', 'tti')),
    pair(...g('cold', 'maxTask')), pair(...g('cold', 'tbt')), pair(...g('cold', 'heapMB'), (x) => (x == null ? '-' : `${x} MB`)),
    pair(...g('warm', 'chart')),
    `${pair(...g('switch', 'ms'))} / ${pair(...g('switchBack', 'ms'))}`,
  ];
  console.log(`| ${row.join(' | ')} |`);
}
console.log();
console.log('| Fast 4G · company | List (gzip) | Drawer | Filter change (+ Show N) | Sort | Insights | Map | Idle 10 s | Heap end |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const co of cos) {
  const b = find(B, 'fast4g', co), a = A && find(A, 'fast4g', co);
  const ix = (k) => (A ? `${s(b?.[k]?.ms)} / ${s(b?.[k]?.maxTask)} → ${s(a?.[k]?.ms)} / ${s(a?.[k]?.maxTask)}` : `${s(b?.[k]?.ms)} / ${s(b?.[k]?.maxTask)}`);
  const kb = (r) => (list(r, co) == null ? '-' : `${Math.round(list(r, co))} kB`);
  console.log(`| ${NAME[co] || co} | ${A ? `${kb(b)} → ${kb(a)}` : kb(b)} | ${ix('drawer')} | ${ix('filter')} | ${ix('sort-salary-asc')} | ${ix('insights')} | ${ix('map')} | ${b?.idle?.taskMs} ms${A ? ` → ${a?.idle?.taskMs} ms` : ''} | ${b?.heapEndMB}${A ? ` → ${a?.heapEndMB}` : ''} MB |`);
}
console.log();
for (const R of [B, A].filter(Boolean)) {
  console.log(`${R.label}: load ${R.loadavgStart} -> ${R.loadavgEnd}`);
  for (const l of R.leak) console.log(`  leak ${l.net}: heap ${l.heap.join(', ')} | dom ${l.dom.join(', ')} | listeners ${l.listeners}`);
  for (const r of R.runs) if (r.errors?.length || r.fail) console.log(`  ${r.net} ${r.company}: ${r.fail || ''} ${r.errors.join(' | ')}`);
  const reqs = R.runs.filter((r) => r.net === 'fast4g').map((r) => `${r.company} ${Object.entries(r.cold.req).map(([k, v]) => `${k} ${v.n}/${v.kB}kB`).join(' ')}`);
  console.log('  requests (cold, fast4g):\n   ' + reqs.join('\n   '));
}

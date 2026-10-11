// Medians of repeated cold loads, before -> after (perf-mobile-beta.mjs --cold-only --runs=N output).
import fs from 'node:fs';
const [bf, af] = process.argv.slice(2);
const B = JSON.parse(fs.readFileSync(bf, 'utf8')), A = JSON.parse(fs.readFileSync(af, 'utf8'));
const s = (ms) => (ms == null ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const med = (a) => { const x = a.filter((v) => v != null).sort((p, q) => p - q); return x.length ? x[x.length >> 1] : null; };
const NAME = { apple: 'Apple', google: 'Google', nvidia: 'NVIDIA', microsoft: 'Microsoft', netflix: 'Netflix', anduril: 'Anduril' };
const get = (R, net, co, k) => med(R.runs.filter((r) => r.net === net && r.company === co).map((r) => r.cold?.[k]));
const nets = [...new Set(B.runs.map((r) => r.net))], cos = [...new Set(B.runs.map((r) => r.company))];
const n = B.runs.filter((r) => r.net === nets[0] && r.company === cos[0]).length;
console.log(`Medians of ${n} cold loads per cell.\n`);
console.log('| Network · company | FCP | First card | First chart | TTI | Max task | TBT |');
console.log('|---|---|---|---|---|---|---|');
for (const net of nets) for (const co of cos) {
  const c = (k) => `${s(get(B, net, co, k))} → **${s(get(A, net, co, k))}**`;
  console.log(`| ${net === 'fast4g' ? 'Fast 4G' : 'Slow 4G'} · ${NAME[co] || co} | ${c('fcp')} | ${c('cards')} | ${c('chart')} | ${c('tti')} | ${c('maxTask')} | ${c('tbt')} |`);
}
for (const R of [B, A]) {
  console.log(`\n${R.label}: load ${R.loadavgStart} -> ${R.loadavgEnd}; spread of first card per cell (min-max):`);
  for (const net of nets) console.log(`  ${net}: ` + cos.map((co) => { const v = R.runs.filter((r) => r.net === net && r.company === co).map((r) => r.cold?.cards); return `${co} ${s(Math.min(...v))}-${s(Math.max(...v))}`; }).join(', '));
  const bad = R.runs.filter((r) => r.fail || r.errors?.length);
  if (bad.length) console.log('  failures:', bad.map((r) => `${r.net} ${r.company}: ${r.fail || r.errors.join(' | ')}`).join('; '));
}

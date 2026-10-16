// Small SVG histograms of range width ÷ midpoint, from stats.json (question 1).
//
//   node data/vetting/2026-10-11-salary-audit/hist.mjs [--in <dir>] [--out <dir>]
//
// hist-boards.svg: one panel per board. Bars (slot 1, blue): the ranges beta SHOWS (salary.min/max).
// Line (slot 2, orange): the ranges the board POSTS, each level's and each place's own range, so a gap
// between the two is a span our code made. hist-levels-<board>.svg: shown ranges, one panel per level.
// Colours: the dataviz skill's reference palette (slots 1 and 2), light and dark.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const inDir = opt('--in', L.HERE);
const outDir = opt('--out', L.HERE);
const stats = L.readJson(path.join(inDir, 'stats.json'));
const NAMES = { amazon: 'Amazon', apple: 'Apple', google: 'Google', meta: 'Meta', microsoft: 'Microsoft', nvidia: 'NVIDIA', netflix: 'Netflix', anduril: 'Anduril (main site)', anthropic: 'Anthropic (main site)', openai: 'OpenAI (main site)' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const STYLE = `<style>
svg{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e4e3df;--s1:#2a78d6;--s2:#eb6834;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme: dark){svg{--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--grid:#3a3936;--s1:#3987e5;--s2:#d95926}}
.bg{fill:var(--surface)}.t{fill:var(--ink);font-size:13px;font-weight:600}.l{fill:var(--ink2);font-size:11px}
.ax{stroke:var(--grid);stroke-width:1}.bar{fill:var(--s1)}.post{fill:none;stroke:var(--s2);stroke-width:2;stroke-linejoin:round}
</style>`;

/** One panel at (x, y): bars of `shown`, optional step line of `posted` (both normalised to share). */
function panel(x, y, w, h, title, sub, shown, posted) {
  const nb = shown.bins.length;
  const tot = (hh) => hh.bins.reduce((a, b) => a + b.n, 0) + hh.under + hh.over || 1;
  const sh = shown.bins.map((b) => b.n / tot(shown));
  const po = posted ? posted.bins.map((b) => b.n / tot(posted)) : null;
  const top = Math.max(0.05, ...sh, ...(po || []));
  const px = 8, py = 34, pw = w - 2 * px, ph = h - py - 22;
  const bw = pw / nb;
  const yv = (v) => y + py + ph - (v / top) * ph;
  let g = `<g><text class="t" x="${x + px}" y="${y + 15}">${esc(title)}</text><text class="l" x="${x + px}" y="${y + 28}">${esc(sub)}</text>`;
  g += `<line class="ax" x1="${x + px}" x2="${x + px + pw}" y1="${y + py + ph}" y2="${y + py + ph}"/>`;
  sh.forEach((v, i) => {
    if (!v) return;
    const bh = Math.max(1, (v / top) * ph);
    const b = shown.bins[i];
    g += `<rect class="bar" x="${(x + px + i * bw + 1).toFixed(1)}" y="${(y + py + ph - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1"><title>width ÷ midpoint ${b.from.toFixed(2)}–${(b.from + shown.step).toFixed(2)}: ${b.n} shown ranges (${(v * 100).toFixed(1)}%)</title></rect>`;
  });
  if (po) {
    let d = '';
    po.forEach((v, i) => { const X0 = x + px + i * bw, X1 = X0 + bw, Y = yv(v); d += `${i ? 'L' : 'M'}${X0.toFixed(1)},${Y.toFixed(1)}L${X1.toFixed(1)},${Y.toFixed(1)}`; });
    g += `<path class="post" d="${d}"><title>posted ranges (each level's and place's own)</title></path>`;
  }
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const X = x + px + (t / (shown.step * nb)) * pw;
    g += `<text class="l" x="${X.toFixed(1)}" y="${y + py + ph + 14}" text-anchor="middle">${t}</text>`;
  }
  return `${g}</g>`;
}

function svg(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">${STYLE}<rect class="bg" width="${w}" height="${h}"/>${body}</svg>\n`;
}

const boards = Object.keys(stats);
const cols = 2, pw = 360, ph = 150, head = 58;
const rows = Math.ceil(boards.length / cols);
let body = `<text class="t" x="16" y="22">Salary range width ÷ midpoint, per board (share of USD ranges)</text>`;
body += `<rect class="bar" x="16" y="34" width="12" height="10" rx="1"/><text class="l" x="34" y="43">shown on beta (salary.min–max)</text>`;
body += `<path class="post" d="M220,39L240,39"/><text class="l" x="246" y="43">as posted (each level's / place's own range)</text>`;
boards.forEach((b, i) => {
  const s = stats[b];
  const sub = `n=${s.usdRanges.n.toLocaleString('en-US')} · median ${s.usdRanges.widthOverMid.p50} shown, ${s.postedUSD.widthOverMid.p50} posted · ${s.oursVsPosted.spans} spans`;
  body += panel(8 + (i % cols) * (pw + 8), head + Math.floor(i / cols) * (ph + 8), pw, ph, NAMES[b] || b, sub, s.usdRanges.widthOverMidHist, s.postedUSD.widthOverMidHist);
});
fs.writeFileSync(path.join(outDir, 'hist-boards.svg'), svg(cols * (pw + 8) + 8, head + rows * (ph + 8), 'Salary range width over midpoint per board', body));

for (const b of boards.filter((x) => L.BIG_TECH.includes(x))) {
  const lv = Object.entries(stats[b].byLevel).filter(([, v]) => v.n >= 3);
  const c = 3, w = 250, h = 120;
  let bd = `<text class="t" x="16" y="22">${esc(NAMES[b])}: shown range width ÷ midpoint, by level</text>`;
  lv.forEach(([name, v], i) => {
    const hh = { step: 0.05, bins: v.hist.map((n, k) => ({ from: k * 0.05, n })), under: 0, over: 0 };
    bd += panel(8 + (i % c) * (w + 8), 34 + Math.floor(i / c) * (h + 8), w, h, name, `n=${v.n}, median ${v.widthOverMid.p50}, spans ${v.spans}`, hh, null);
  });
  fs.writeFileSync(path.join(outDir, `hist-levels-${b}.svg`), svg(c * (w + 8) + 8, 34 + Math.ceil(lv.length / c) * (h + 8), `${NAMES[b]} range width by level`, bd));
}
console.log(`wrote hist-boards.svg and ${boards.filter((x) => L.BIG_TECH.includes(x)).length} hist-levels-*.svg to ${outDir}`);

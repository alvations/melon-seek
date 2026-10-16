// Seeded sample of shown salaries against each posting's own pay text (question 3).
//
//   node data/vetting/2026-10-11-salary-audit/sample.mjs <dist> [--seed 20261011] [--n 15] [--out <dir>]
//
// Per big-tech board: --n random paid postings (seeded, mulberry32) plus one posting for each of the 10
// most common shown (min, max) pairs. For each, the shown range (served list of the build) is compared
// with the pay sentence(s) in the stored description, quoted exactly (whitespace collapsed). Writes
// <out>/sample.jsonl (default: this folder) and prints a verdict count per board.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dist = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const SEED = Number(opt('--seed', 20261011));
const N = Number(opt('--n', 15));
const outDir = opt('--out', L.HERE);
if (!dist) { console.error('usage: sample.mjs <dist> [--seed N] [--n 15] [--out dir]'); process.exit(2); }

const flat = (s) => String(s).replace(/\s+/g, ' ').trim();
const lines = [];
const summary = {};
for (const slug of L.BIG_TECH) {
  const served = await L.servedJobs(dist, slug);
  const snap = L.readJson(L.snapshotPath(slug));
  const stored = new Map(snap.jobs.map((j) => [j.id, j]));
  const paid = served.jobs.filter((j) => j.salary).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rand = L.rng(SEED + L.BIG_TECH.indexOf(slug));
  const picks = new Map();
  while (picks.size < Math.min(N, paid.length)) { const j = paid[Math.floor(rand() * paid.length)]; if (!picks.has(j.id)) picks.set(j.id, { j, pick: 'random' }); }
  const byPair = new Map();
  for (const j of paid) { const k = `${j.salary.currency} ${j.salary.min}-${j.salary.max}`; if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(j); }
  const top = [...byPair.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  top.forEach(([k, js], i) => { const j = js[Math.floor(rand() * js.length)]; picks.set(`${j.id}#top`, { j, pick: `top-${i + 1} (${js.length} postings share ${k})` }); });
  const counts = {};
  for (const { j, pick } of picks.values()) {
    const st = stored.get(j.id) || {};
    const text = L.plain(st.descriptionHtml || '');
    const ftext = flat(text);
    const s = j.salary;
    const u = L.postedUnits(s);
    const prov = L.textProvenance(s, text);
    const quotes = [];
    let verdict;
    let quoteSource = 'description';
    const q = (at, end) => { const t = L.sentenceAt(text, at, end); if (t && !quotes.includes(t)) quotes.push(t); };
    if (prov.kind === 'one-posted-range') { q(prov.pair.at, prov.pair.end); verdict = 'shown = one posted range'; }
    else if (prov.kind === 'one-posted-figure') { const a = L.amounts(text).find((x) => Math.abs(x.v - u.min) < 0.02); if (a) q(a.at, a.end); verdict = 'shown = one posted figure'; }
    else if (prov.kind === 'span-of-ranges') {
      // The ranges the span is made of: each level's (salary.levels), each place's (salary.ranges), else
      // every posted pair inside the span.
      const f = u.f || 1;
      const members = Array.isArray(s.levels) && s.levels.length > 1 ? s.levels : Array.isArray(s.ranges) && s.ranges.length > 1 ? s.ranges : null;
      const near = (a, b) => Math.abs(a - b) <= Math.max(0.011, b * 0.0005);
      const parts = members
        ? members.map((m) => (prov.pairs || []).find((p) => near(p.lo, m.min / f) && near(p.hi, m.max / f))).filter(Boolean)
        : (prov.pairs || []).filter((p) => p.lo >= u.min - 0.01 && p.hi <= u.max + 0.01);
      for (const p of parts) q(p.at, p.end);
      verdict = `shown = span of ${Math.max(2, parts.length)} posted ranges (min of one, max of another)`;
    } else {
      // Structured pay not in the description (Meta public_compensation; Amazon rows cut by trimming).
      quoteSource = 'salary.text (structured field, as stored)';
      quotes.push(flat(s.text || ''));
      verdict = 'shown = structured field (not in the stored text)';
    }
    for (const t of quotes) if (quoteSource === 'description' && !ftext.includes(t)) throw new Error(`${j.id}: quote not found: ${t}`);
    const levels = Array.isArray(s.levels) ? s.levels.map((l) => `${l.label} ${l.min}-${l.max}`) : null;
    const ranges = Array.isArray(s.ranges) ? s.ranges.map((r) => `${r.label || (r.locations || []).join('/')} ${r.min}-${r.max}`) : null;
    counts[verdict] = (counts[verdict] || 0) + 1;
    lines.push({
      board: slug, seed: SEED, pick, id: j.id, title: j.title, level: j.seniority, url: j.url,
      shown: { min: s.min, max: s.max, currency: s.currency, kind: s.kind, originalInterval: s.originalInterval || 'year', zones: s.zones, text: s.text },
      postedUnits: u, verdict, quote_source: quoteSource, quotes, levels, ranges,
    });
  }
  summary[slug] = counts;
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sample.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
console.log(JSON.stringify(summary, null, 1));
console.log(`${lines.length} lines -> ${path.join(outDir, 'sample.jsonl')} (seed ${SEED})`);

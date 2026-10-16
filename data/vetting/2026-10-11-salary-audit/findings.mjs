// Counts behind each SA finding (docs/process/salary-audit-data.md), on the served lists of a build.
//
//   node data/vetting/2026-10-11-salary-audit/findings.mjs <dist> [--out <dir>]
//
// Writes <out>/findings.json (default: this folder): per finding, the count per board and up to 5
// example ids with the shown and the posted values. Read-only.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--'));
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : L.HERE;
const { attachJuice } = await L.imp('server', 'juice.js');
const cities = L.readJson(path.join(L.ROOT, 'data', 'cities.json'));

const out = {};
const add = (id, board, ex) => {
  const f = (out[id] ||= { byBoard: {}, examples: [] });
  f.byBoard[board] = (f.byBoard[board] || 0) + 1;
  if (ex && f.examples.filter((e) => e.board === board).length < 5) f.examples.push({ board, ...ex });
};
const span = (rs) => [Math.min(...rs.map((r) => r.min)), Math.max(...rs.map((r) => r.max))];
const totals = {};
for (const slug of L.BIG_TECH) {
  const served = await L.servedJobs(dist, slug);
  const snap = L.readJson(L.snapshotPath(slug));
  const stored = new Map(snap.jobs.map((j) => [j.id, j]));
  const paid = served.jobs.filter((j) => j.salary);
  totals[slug] = { jobs: served.jobs.length, paid: paid.length };
  // Every range a single level is posted at on this board (to tell a level span from a posted range).
  const levelPairs = new Set();
  for (const j of paid) for (const l of j.salary.levels || []) levelPairs.add(`${l.min}-${l.max}`);
  for (const j of paid) {
    const s = j.salary;
    const text = L.plain((stored.get(j.id) || {}).descriptionHtml || '');
    const prov = L.textProvenance(s, text);
    // SA-1: several levels shown as one range (lowest level's min to the highest level's max).
    if (Array.isArray(s.levels) && s.levels.length > 1) {
      const posted = levelPairs.has(`${s.min}-${s.max}`) && s.levels.some((l) => l.min === s.min && l.max === s.max);
      const j2 = attachJuice(JSON.parse(JSON.stringify(j)), cities);
      add('SA-1', slug, { id: j.id, title: j.title, level: j.seniority, shown: [s.min, s.max], mid: s.mid, levels: s.levels.map((l) => `${l.label} ${l.min}-${l.max}`), shownIsAPostedLevelRange: posted, juiceGross: j2.juice ? j2.juice.best.gross : null, text: s.text });
      if (!levelPairs.has(`${s.min}-${s.max}`)) add('SA-1 shown pair is no single level range posted anywhere on the board', slug);
    } else if (prov.kind === 'span-of-ranges' && !(Array.isArray(s.ranges) && s.ranges.length > 1)) {
      // SA-4: a span of several posted figures or ranges with no per-member breakdown kept.
      add('SA-4', slug, { id: j.id, title: j.title, shown: [s.min, s.max], text: s.text, pairs: prov.pairs.map((p) => `${p.lo}-${p.hi}`) });
    }
    // SA-2: a card that reads "$X–Y · N places … runs from the lowest to the highest of N ranges" while
    // X–Y is one place's row (Amazon's primary city), not the span of the rows.
    const rs = Array.isArray(s.ranges) ? s.ranges.filter((r) => r && Number.isFinite(Number(r.min)) && (r.label || (r.locations || []).length) && String(r.currency || s.currency).toUpperCase() === s.currency) : [];
    if (rs.length > 1) {
      const [lo, hi] = span(rs);
      add('ranges>1 (card reads "· N places")', slug);
      if (lo !== s.min || hi !== s.max) add('SA-2', slug, { id: j.id, title: j.title, shown: [s.min, s.max], spanOfRanges: [lo, hi], ranges: rs.map((r) => `${r.label} ${r.min}-${r.max}`).slice(0, 6), text: s.text });
      // SA-5: under a Location filter the card shows the picked place's range, the chart plots salary.mid.
      const mids = new Set(rs.map((r) => (r.min + r.max) / 2));
      if (mids.size > 1) add('SA-5', slug, { id: j.id, chartMid: s.mid, placeMids: [...mids].slice(0, 6) });
    }
    // SA-3: pay rows cut at 12 (salary.ranges is at most 12 long).
    if (Array.isArray(s.ranges) && s.ranges.length >= 12) {
      const st = (stored.get(j.id) || {}).salary || {};
      const storedLabels = (st.ranges || []).map((r) => String(r.label || '').toLowerCase());
      const primary = String(st.text || '').split(' - ')[0].toLowerCase();
      add('SA-3', slug, { id: j.id, url: j.url, places: (j.locations || []).length, servedRanges: s.ranges.length, storedRanges: (st.ranges || []).length, zones: s.zones, primaryRowInStoredRanges: storedLabels.includes(primary), text: s.text });
    }
  }
}
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(70), JSON.stringify(v.byBoard));
fs.writeFileSync(path.join(outDir, 'findings.json'), `${JSON.stringify({ totals, findings: out }, null, 1)}\n`);
console.log(`wrote ${path.join(outDir, 'findings.json')}`);

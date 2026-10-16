// Salary-range shape audit, per board (docs/process/salary-audit-data.md, question 1, 2 and 6).
//
//   node data/vetting/2026-10-11-salary-audit/stats.mjs <dist> [--out <dir>]
//
// Reads the served lists of a build (scripts/build-static.js --out <dist>, with data/beta/snapshots
// and data/snapshots linked) and the stored snapshots (for the posting text and the stored salary).
// Writes <out>/stats.json (default: this folder) and <out>/served-diff.json, and prints a summary.
// Nothing is fetched; nothing in the repo but <out> is written.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--'));
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : L.HERE;
if (!dist) { console.error('usage: stats.mjs <dist> [--out <dir>]'); process.exit(2); }
const { toUSD } = await L.imp('server', 'salary.js');

const Q = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const qs = (xs) => { const s = [...xs].sort((a, b) => a - b); return Object.fromEntries(Q.map((q) => [`p${q * 100}`, s.length ? Math.round(L.quantile(s, q) * 1000) / 1000 : null])); };
const qsInt = (xs) => { const s = [...xs].sort((a, b) => a - b); return Object.fromEntries(Q.map((q) => [`p${q * 100}`, s.length ? Math.round(L.quantile(s, q)) : null])); };
const hist = (xs, lo, hi, step) => {
  const n = Math.round((hi - lo) / step);
  const bins = Array.from({ length: n }, (_, i) => ({ from: Math.round((lo + i * step) * 1000) / 1000, n: 0 }));
  let over = 0, under = 0;
  for (const x of xs) { if (x < lo) under++; else if (x >= hi) over++; else bins[Math.min(n - 1, Math.floor((x - lo) / step))].n++; }
  return { step, bins, under, over };
};
const count = (arr, key) => { const m = {}; for (const a of arr) { const k = key(a); m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };

/** Where the shown salary came from, from the job's fields and the posting text. */
function provenance(j, text) {
  const s = j.salary;
  const p = L.textProvenance(s, text);
  const parts = [];
  if (s.source === 'structured') parts.push('structured');
  else parts.push('text');
  if (Array.isArray(s.levels) && s.levels.length > 1) parts.push('span-of-levels');
  else if (Array.isArray(s.ranges) && s.ranges.length > 1) {
    const lo = Math.min(...s.ranges.map((r) => r.min)), hi = Math.max(...s.ranges.map((r) => r.max));
    parts.push(lo === s.min && hi === s.max && s.ranges.some((r) => r.min !== s.min || r.max !== s.max) ? 'span-of-places' : 'one-place-of-several');
  } else if (p.kind === 'span-of-ranges') parts.push('span-of-ranges');
  else if (p.kind === 'one-posted-figure') parts.push('one-figure');
  else parts.push('one-range');
  if (s.originalInterval) parts.push(`×${s.originalInterval}`);
  if (s.intervalCorrected) parts.push('interval-corrected');
  if (s.statedAnnual) parts.push('stated-annual');
  return { key: parts.join('|'), text: p.kind };
}

const stats = {};
const diff = {};
for (const slug of [...L.BIG_TECH, ...L.COMPARE]) {
  const served = await L.servedJobs(dist, slug);
  if (!served) { console.warn(`${slug}: no served list in ${dist}`); continue; }
  const snap = L.readJson(L.snapshotPath(slug));
  const stored = new Map(snap.jobs.map((j) => [j.id, j]));
  const jobs = served.jobs;
  const paid = jobs.filter((j) => j.salary);
  const rows = [];
  const d = { servedJobs: jobs.length, storedJobs: snap.jobs.length, storedNormalizer: snap.normalizerVersion, notInStored: 0, salaryAdded: 0, salaryRemoved: 0, minMaxChanged: 0, quarantined: jobs.filter((j) => j.salaryFlag).length, changedByKind: {}, examples: [] };
  for (const j of jobs) {
    const st = stored.get(j.id);
    if (!st) { d.notInStored++; continue; }
    const a = st.salary, b = j.salary;
    if (!a && b) d.salaryAdded++;
    else if (a && !b) d.salaryRemoved++;
    else if (a && b && (a.min !== b.min || a.max !== b.max || a.currency !== b.currency)) {
      d.minMaxChanged++;
      const k = `${a.source}->${b.source}${b.levels ? ' levels' : ''}${b.ranges ? ' ranges' : ''}`;
      d.changedByKind[k] = (d.changedByKind[k] || 0) + 1;
      if (d.examples.length < 8) d.examples.push({ id: j.id, stored: [a.min, a.max, a.currency, a.text], served: [b.min, b.max, b.currency, b.text] });
    }
  }
  for (const j of paid) {
    const st = stored.get(j.id);
    const text = L.plain((st && st.descriptionHtml) || '');
    const s = j.salary;
    const pv = provenance(j, text);
    const usdMin = toUSD(s.min, s.currency), usdMax = toUSD(s.max, s.currency);
    rows.push({
      id: j.id, level: j.seniority || 'Mid', basis: j.seniorityBasis, cur: s.currency, kind: s.kind, prov: pv.key, textProv: pv.text,
      min: s.min, max: s.max, mid: (s.min + s.max) / 2, usdMid: (usdMin + usdMax) / 2, width: s.max - s.min,
      wm: (s.max - s.min) / ((s.max + s.min) / 2), spread: s.max / s.min, zones: s.zones || 1,
      levels: Array.isArray(s.levels) ? s.levels : null,
    });
  }
  // The shape of what the board POSTS, without the spans our code makes: each level's own range,
  // each place's own range, else the shown range.
  const posted = [];
  for (const r of rows) {
    const j = paid.find((x) => x.id === r.id);
    const s = j.salary;
    if (r.levels) for (const l of r.levels) posted.push({ cur: s.currency, min: l.min, max: l.max });
    else if (Array.isArray(s.ranges) && s.ranges.length > 1) for (const g of s.ranges) posted.push({ cur: g.currency || s.currency, min: g.min, max: g.max });
    else posted.push({ cur: s.currency, min: s.min, max: s.max });
  }
  const annual = rows.filter((r) => r.cur === 'USD' && r.min !== r.max);
  const pairs = count(annual, (r) => `${r.min}-${r.max}`);
  const top = Object.entries(pairs).slice(0, 10).map(([k, n]) => ({ range: k, n, share: Math.round((n / annual.length) * 1000) / 1000 }));
  const spreads = count(annual, (r) => r.spread.toFixed(2));
  const modeSpread = Number(Object.keys(spreads)[0]);
  const nearMode = annual.filter((r) => Math.abs(r.spread - modeSpread) <= 0.02).length;
  const postedUSD = posted.filter((p) => p.cur === 'USD' && p.min !== p.max);
  const postedWm = postedUSD.map((p) => (p.max - p.min) / ((p.max + p.min) / 2));
  const byLevel = {};
  for (const r of annual) (byLevel[r.level] ||= []).push(r);
  stats[slug] = {
    jobs: jobs.length, paid: paid.length, paidShare: Math.round((paid.length / jobs.length) * 1000) / 1000,
    quarantined: d.quarantined,
    currencies: count(rows, (r) => r.cur),
    kinds: count(rows, (r) => r.kind),
    provenance: count(rows, (r) => r.prov),
    textCheck: count(rows, (r) => r.textProv),
    usdRanges: {
      n: annual.length,
      min: qsInt(annual.map((r) => r.min)), max: qsInt(annual.map((r) => r.max)), mid: qsInt(annual.map((r) => r.mid)),
      width: qsInt(annual.map((r) => r.width)), widthOverMid: qs(annual.map((r) => r.wm)), spread: qs(annual.map((r) => r.spread)),
      modeSpread, nearModeShare: Math.round((nearMode / annual.length) * 1000) / 1000,
      distinctPairs: Object.keys(pairs).length, topPairs: top, top10Share: Math.round((top.reduce((a, t) => a + t.n, 0) / annual.length) * 1000) / 1000,
      widthOverMidHist: hist(annual.map((r) => r.wm), 0, 1.2, 0.05),
    },
    postedUSD: { n: postedUSD.length, widthOverMid: qs(postedWm), spread: qs(postedUSD.map((p) => p.max / p.min)), widthOverMidHist: hist(postedWm, 0, 1.2, 0.05) },
    oursVsPosted: {
      spans: rows.filter((r) => /span-of/.test(r.prov)).length,
      spanShare: Math.round((rows.filter((r) => /span-of/.test(r.prov)).length / rows.length) * 1000) / 1000,
      medianWmShown: qs(annual.map((r) => r.wm)).p50, medianWmPosted: qs(postedWm).p50,
    },
    byLevel: Object.fromEntries(Object.entries(byLevel).sort((a, b) => b[1].length - a[1].length).map(([lv, rs]) => [lv, {
      n: rs.length, mid: qsInt(rs.map((r) => r.mid)), widthOverMid: qs(rs.map((r) => r.wm)), spans: rs.filter((r) => /span-of/.test(r.prov)).length,
      hist: hist(rs.map((r) => r.wm), 0, 1.2, 0.05).bins.map((b) => b.n),
    }])),
  };
  diff[slug] = d;
  const u = stats[slug].usdRanges;
  console.log(`${slug.padEnd(10)} paid ${String(paid.length).padStart(5)}/${String(jobs.length).padEnd(5)} usd ${String(u.n).padStart(5)} distinct ${String(u.distinctPairs).padStart(4)} top10 ${u.top10Share} w/mid p10/50/90 ${u.widthOverMid.p10}/${u.widthOverMid.p50}/${u.widthOverMid.p90} mode spread ${u.modeSpread} (${u.nearModeShare} within ±0.02) spans ${stats[slug].oursVsPosted.spans} posted-w/mid p50 ${stats[slug].postedUSD.widthOverMid.p50} | served≠stored ${d.minMaxChanged} added ${d.salaryAdded} removed ${d.salaryRemoved} q ${d.quarantined}`);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'stats.json'), `${JSON.stringify(stats, null, 1)}\n`);
fs.writeFileSync(path.join(outDir, 'served-diff.json'), `${JSON.stringify(diff, null, 1)}\n`);
console.log(`wrote ${path.join(outDir, 'stats.json')} and served-diff.json`);

// Lexicon before/after report on the real snapshots (features §6a, norm-4).
//
//   node docs/process/scripts/lexicon-report.mjs dump <out.json>
//       keywords of every job in data/snapshots/*.json via normalizeJobs (per board)
//   node docs/process/scripts/lexicon-report.mjs compare <before.json> <after.json>
//       chip assignments per company, top-10 chips per company, >=95% check, label deltas (markdown)
//   node docs/process/scripts/lexicon-report.mjs ctx <before.json> <after.json> <old-keywords.mjs> <s|r> <label> [kept|lost] [every=7] [newLabel]
//       precision spot check: every Nth job that has (kept) or lost (lost) the label,
//       with a ±50-char window around the pattern that fired. For r, the haystack
//       is the title + responsibility bullets when the job has them (as in
//       extractKeywords); otherwise the plain description (approximate: boilerplate
//       removal is not replayed). old-keywords.mjs: `git show <rev>:server/keywords.js > old-keywords.mjs`.
//
// Replay for norm-4: dump before.json on norm-3, apply the change, dump after.json, compare, ctx.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [cmd, ...args] = process.argv.slice(2);
const F = ['skills', 'responsibilities', 'fit'];
const P = { skills: 's', responsibilities: 'r', fit: 'f' };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const counts = (d) => {
  const c = new Map();
  for (const j of d.jobs) for (const f of F) for (const l of new Set(j.k[f])) { const k = `${P[f]}:${l}`; c.set(k, (c.get(k) || 0) + 1); }
  return [...c].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
};
const total = (d) => d.jobs.reduce((a, j) => a + F.reduce((b, f) => b + j.k[f].length, 0), 0);
const snapshots = () => fs.readdirSync(path.join(ROOT, 'data/snapshots')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => [f.replace(/\.json$/, ''), readJson(path.join(ROOT, 'data/snapshots', f))]);

if (cmd === 'dump') {
  const { htmlToText } = await import(pathToFileURL(path.join(ROOT, 'server/keywords.js')).href);
  const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server/normalize.js')).href);
  const out = {};
  for (const [slug, snap] of snapshots()) {
    const raws = snap.jobs.map((j, i) => ({ sourceId: String(i), title: j.title, department: j.department, html: j.descriptionHtml || '', text: htmlToText(j.descriptionHtml || ''), locationText: '', extraLocations: [] }));
    const jobs = normalizeJobs(raws, { slug, name: slug });
    out[slug] = { fetchedAt: snap.fetchedAt, dropped: jobs.droppedKeywords, jobs: jobs.map((j) => ({ t: j.title, k: j.keywords })) };
  }
  fs.writeFileSync(args[0], JSON.stringify(out));
} else if (cmd === 'compare') {
  const [A, B] = args.map(readJson);
  const fmt = (n) => n.toLocaleString('en-US');
  console.log('| company | jobs | chip assignments before → after | Δ | most common chip after (share) |\n|---|---:|---:|---:|---|');
  let ta = 0, tb = 0, n = 0;
  for (const s of Object.keys(A)) {
    const a = total(A[s]), b = total(B[s]); ta += a; tb += b; n += A[s].jobs.length;
    const c = counts(B[s])[0];
    console.log(`| ${s} | ${A[s].jobs.length} | ${fmt(a)} → ${fmt(b)} | ${((b - a) / a * 100).toFixed(1)}% | ${c[0]} (${(100 * c[1] / A[s].jobs.length).toFixed(0)}%) |`);
  }
  console.log(`| **all** | ${fmt(n)} | ${fmt(ta)} → ${fmt(tb)} | ${((tb - ta) / ta * 100).toFixed(1)}% | per job ${(ta / n).toFixed(2)} → ${(tb / n).toFixed(2)} |`);
  console.log('\nTop-10 chips per company (s = skill, r = responsibility, f = fit):\n');
  for (const s of Object.keys(A)) {
    console.log(`- **${s}** before: ${counts(A[s]).slice(0, 10).map(([l, c]) => `${l} ${c}`).join(', ')}`);
    console.log(`  - after: ${counts(B[s]).slice(0, 10).map(([l, c]) => `${l} ${c}`).join(', ')}`);
  }
  const over = [];
  for (const s of Object.keys(B)) for (const [l, c] of counts(B[s])) if (c / B[s].jobs.length >= 0.95) over.push(`${s} ${l}`);
  console.log(`\nLabels on >=95% of a board's jobs after: ${over.length ? over.join(', ') : 'none'}.`);
  const sum = (D) => { const m = new Map(); for (const s of Object.keys(D)) for (const [k, v] of counts(D[s])) m.set(k, (m.get(k) || 0) + v); return m; };
  const ga = sum(A), gb = sum(B);
  console.log('\nLabel changes (corpus):');
  for (const [k, x, y] of [...new Set([...ga.keys(), ...gb.keys()])].map((k) => [k, ga.get(k) || 0, gb.get(k) || 0]).filter(([, x, y]) => x !== y).sort((p, q) => (p[2] - p[1]) - (q[2] - q[1]))) console.log(`- ${k}: ${x} → ${y}`);
} else if (cmd === 'ctx') {
  const [beforeF, afterF, oldF, facet, label, mode = 'kept', every = '7', newLabel] = args;
  const NEW = await import(pathToFileURL(path.join(ROOT, 'server/keywords.js')).href);
  const OLD = await import(pathToFileURL(path.resolve(oldF)).href);
  const LEX = { s: 'SKILL_LEXICON', r: 'RESPONSIBILITY_LEXICON' }[facet];
  const FAC = { s: 'skills', r: 'responsibilities' }[facet];
  const Bre = (src) => new RegExp(`(?<![A-Za-z0-9])(?:${src})(?![A-Za-z0-9])`, 'i');
  const comp = (lex, l) => { const e = lex.find((x) => x[0] === l); return e ? e.slice(1).map((p) => (p instanceof RegExp ? p : Bre(p))) : []; };
  const oldRes = comp(OLD[LEX], label), newRes = comp(NEW[LEX], newLabel || label);
  const before = readJson(beforeF), after = readJson(afterF);
  let i = 0, shown = 0, n = 0;
  for (const [slug, snap] of snapshots()) {
    snap.jobs.forEach((j, k) => {
      const had = before[slug].jobs[k].k[FAC].includes(label), has = after[slug].jobs[k].k[FAC].includes(newLabel || label);
      if (mode === 'kept' ? !has : !(had && !has)) return;
      n++;
      if (i++ % Number(every)) return;
      let hay = `${j.title} | ${NEW.htmlToText(j.descriptionHtml || '').replace(/\s+/g, ' ')}`;
      if (facet === 'r') { const sec = NEW.extractSections(j.descriptionHtml || ''); if (sec.responsibilities.length) hay = [j.title, ...sec.responsibilities].join(' | '); }
      const res = mode === 'kept' ? newRes : oldRes.filter((o) => !newRes.some((x) => x.source === o.source));
      let m = null;
      for (const re of res) { m = hay.match(new RegExp(re.source, re.flags.replace('g', ''))); if (m) break; }
      shown++;
      console.log(`[${slug}] ${j.title} :: …${m ? hay.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50) : '(match in a section variant)'}…`);
    });
  }
  console.log(`-- ${mode} ${facet}:${newLabel || label}: ${n} jobs, ${shown} shown (1/${every})`);
} else {
  console.error('usage: lexicon-report.mjs dump <out> | compare <before> <after> | ctx <before> <after> <old-keywords.mjs> <s|r> <label> [kept|lost] [every] [newLabel]');
  process.exit(2);
}

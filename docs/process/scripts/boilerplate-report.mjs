// BUG-5 before/after report on the real snapshots (features workstream).
//
//   node docs/process/scripts/boilerplate-report.mjs [slug ...]   # default: anthropic anduril openai
//
// "before" = the old per-job path (sections + keywords from the full description).
// "after"  = normalizeJobs (board boilerplate removed + >90% facet guard).
// Needs data/snapshots/<slug>.json (local, gitignored). Prints markdown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText, extractSections, extractKeywords, boilerplateParagraphs } from '../../../server/keywords.js';
import { normalizeJobs } from '../../../server/normalize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['anthropic', 'anduril', 'openai'];
const FACETS = ['skills', 'responsibilities', 'fit'];

function top(jobs, facet, n = 10) {
  const c = new Map();
  for (const j of jobs) for (const l of new Set(j.keywords[facet] || [])) c.set(l, (c.get(l) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
const fmt = (rows) => rows.map(([l, n]) => `${l} ${n}`).join(', ');

for (const slug of slugs) {
  const file = path.join(ROOT, 'data/snapshots', `${slug}.json`);
  if (!fs.existsSync(file)) { console.log(`## ${slug}: no snapshot`); continue; }
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raws = snap.jobs.map((j, i) => ({
    sourceId: String(i), title: j.title, department: j.department,
    html: j.descriptionHtml || '', text: htmlToText(j.descriptionHtml || ''), locationText: '', extraLocations: [],
  }));
  const before = raws.map((r) => ({ keywords: extractKeywords({ title: r.title, department: r.department, sections: extractSections(r.html), text: r.text }) }));
  const t0 = Date.now();
  const after = normalizeJobs(raws, { slug, name: slug });
  const ms = Date.now() - t0;
  const n = raws.length;
  const bp = boilerplateParagraphs(raws.map((r) => r.html));
  const ubiq = (jobs) => FACETS.reduce((a, f) => a + top(jobs, f, 999).filter(([, c]) => c / n >= 0.95).length, 0);
  console.log(`## ${slug} (n=${n}, snapshot ${snap.fetchedAt})`);
  console.log(`boilerplate blocks: ${bp.size}; labels on >=95% of jobs: before ${ubiq(before)}, after ${ubiq(after)}; guard dropped: ${JSON.stringify(after.droppedKeywords)}; normalizeJobs ${ms} ms`);
  for (const f of FACETS) {
    console.log(`- ${f} before: ${fmt(top(before, f))}`);
    console.log(`- ${f} after:  ${fmt(top(after, f))}`);
  }
  console.log('');
}

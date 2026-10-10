#!/usr/bin/env node
// Stage 0 of the improvement cycle (docs/process/PLAYBOOK.md): put the latest real data in a
// sandbox that cannot reach the job boards. Every company's last archived observation (on or
// before --date) is rebuilt from the data-archive branch with scripts/archive/reconstruct.js:
// stable boards go to data/snapshots/<slug>.json, beta boards to data/beta/snapshots/<slug>.json
// (both gitignored).
//
//   node scripts/cycle/local-data.js [--archive DIR] [--date YYYY-MM-DD] [--channel stable|beta|all]
//
// Without --archive (or MELON_ARCHIVE_DIR) it fetches origin/data-archive into a temporary
// worktree and removes it at the end. Paused companies (`paused` in server/companies.js) are
// skipped. A company with no observation keeps whatever file it already has, and is listed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, readTable } from '../archive/lib.js';
import { BlobStore } from '../archive/blobs.js';
import { reconstruct } from '../archive/reconstruct.js';
import { listCompanies } from '../../server/companies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = { stable: path.join(ROOT, 'data', 'snapshots'), beta: path.join(ROOT, 'data', 'beta', 'snapshots') };

/** The latest folded or late observation of each company on or before `date` (YYYY-MM-DD). */
export function latestObservations(rows, date = null) {
  const best = new Map();
  for (const o of rows) {
    if (!o.observedAt || (o.status !== 'folded' && o.status !== 'late')) continue;
    if (date && o.observedAt.slice(0, 10) > date) continue;
    const prev = best.get(o.company);
    if (!prev || o.observedAt > prev.observedAt) best.set(o.company, o);
  }
  return best;
}

function openArchive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-archive-'));
  fs.rmdirSync(dir);
  execFileSync('git', ['-C', ROOT, 'fetch', '--quiet', '--depth', '1', 'origin', '+refs/heads/data-archive:refs/remotes/origin/data-archive'], { stdio: 'inherit' });
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--quiet', '--detach', dir, 'refs/remotes/origin/data-archive'], { stdio: 'inherit' });
  return dir;
}

function closeArchive(dir) {
  try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', dir], { stdio: 'inherit' }); } catch { /* already gone */ }
}

async function main(argv) {
  const a = parseArgs(argv);
  const channel = String(a.channel || 'all');
  if (!['stable', 'beta', 'all'].includes(channel)) { console.error('local-data: --channel is stable, beta or all'); return 2; }
  const given = a.archive || process.env.MELON_ARCHIVE_DIR;
  const dir = given ? path.resolve(String(given)) : openArchive();
  try {
    const companies = listCompanies({ channel: 'all' }).map((c) => ({ slug: c.slug, channel: c.channel || 'stable' }))
      .filter((c) => channel === 'all' || c.channel === channel);
    const latest = latestObservations(readTable(dir, 'observations'), a.date ? String(a.date) : null);
    const blobs = new BlobStore(dir, '0000-00');
    const missing = [];
    for (const c of companies) {
      const obs = latest.get(c.slug);
      if (!obs) { missing.push(c.slug); continue; }
      const { payload } = reconstruct(dir, { company: c.slug, at: obs.observedAt, blobs });
      fs.mkdirSync(OUT[c.channel], { recursive: true });
      const file = path.join(OUT[c.channel], `${c.slug}.json`);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(payload, null, 1) + '\n');
      fs.renameSync(`${file}.tmp`, file);
      console.log(`local-data: ${c.channel.padEnd(6)} ${c.slug.padEnd(10)} ${obs.observedAt}  ${String(payload.jobs.length).padStart(5)} postings -> ${path.relative(ROOT, file)}`);
    }
    if (missing.length) console.log(`local-data: no archived observation yet for ${missing.join(', ')} (existing files, if any, left as they are)`);
    return 0;
  } finally {
    if (!given) closeArchive(dir);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));

#!/usr/bin/env node
// Restore working data from the archive (docs/DATA_ARCHIVE.md "Restore").
//
//   node scripts/archive/restore.js --archive DIR [--out data/history] [--channel stable|beta]
//        [--from auto|mirror|replay] [--company X]
//      Rebuild the F4 listing ledgers (data/history/<slug>.json). "mirror" copies the newest
//      ledger the archive holds (history/ or beta/history/); "replay" rebuilds it with
//      server/history.js updateLedger over every archived observation (first/last seen at
//      the archive's observation times; repost chains re-derived); "auto" (default) uses
//      the mirror and replays companies that have none.
//   node scripts/archive/restore.js --archive DIR --snapshots-out DIR [--at ISO] [--channel ...]
//      Write the snapshot files exactly as ingested (descriptions included; reconstruct.js) as of
//      --at (default: each company's latest observation), e.g. to rebuild the site after the
//      snapshot artifacts expired.
//
// Usable from a workflow when artifacts have expired: check out the data-archive branch
// (or `git worktree add`), then run this with --out data/history.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTable, readState, readJson, parseArgs, archiveDir, iso, assertSlug } from './lib.js';
import { allVersions, versionsAt, view } from './jobs.js';
import { reconstruct } from './reconstruct.js';
import { BlobStore } from './blobs.js';

function jobForLedger(r) {
  return { id: r.id, title: r.title, department: r.department, locations: (r.locations || []).map((l) => ({ name: l.name, rawName: l.rawName })), postedAt: r.postedAt, reqId: r.reqId };
}

/** Rebuild one company's ledger by replaying its archived observations. */
export async function replayLedger(dir, slug) {
  const { updateLedger } = await import('../../server/history.js');
  const companies = readState(dir, 'companies', {});
  const meta = companies[slug] || {};
  const obs = readTable(dir, 'observations').filter((o) => o.company === slug && o.status === 'folded').map((o) => o.observedAt).sort();
  const versions = allVersions(dir, slug).map(view);
  let ledger = null;
  for (const t of obs) {
    const jobs = versionsAt(versions, t, meta.lastObservedAt).map(jobForLedger);
    if (jobs.length) ledger = updateLedger(ledger, jobs, t);
  }
  return ledger;
}

export async function restoreLedgers(dir, { out, channel = 'stable', from = 'auto', company = null, log = console.log } = {}) {
  const { writeLedger } = await import('../history.js');
  const companies = readState(dir, 'companies', {});
  const mirrorDir = path.join(dir, channel === 'beta' ? 'beta/history' : 'history');
  const mirrored = fs.existsSync(mirrorDir) ? fs.readdirSync(mirrorDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  const known = Object.values(companies).filter((c) => (c.channel || 'stable') === channel).map((c) => c.slug);
  const slugs = [...new Set([...mirrored, ...known])].filter((s) => !company || s === company).sort();
  const results = [];
  fs.mkdirSync(out, { recursive: true });
  for (const slug of slugs) {
    assertSlug(slug);
    let ledger = null;
    let how = null;
    if (from !== 'replay' && mirrored.includes(slug)) { ledger = readJson(path.join(mirrorDir, `${slug}.json`)); how = 'mirror'; }
    if (!ledger && from !== 'mirror' && known.includes(slug)) { ledger = await replayLedger(dir, slug); how = 'replay'; }
    if (!ledger) { results.push({ slug, status: 'none' }); continue; }
    await writeLedger(slug, ledger, { dir: out });
    results.push({ slug, status: how, runs: ledger.runs, since: ledger.since, lastRunAt: ledger.lastRunAt, entries: Object.keys(ledger.jobs).length });
    log(`restore: ${slug}: ${how}, ${Object.keys(ledger.jobs).length} entries, ${ledger.runs} runs since ${ledger.since}`);
  }
  return results;
}

/**
 * The snapshot files as ingested (lossless, scripts/archive/reconstruct.js), as of the latest
 * observation at or before `at` (default: each company's latest), into `out`/<slug>.json.
 */
export async function restoreSnapshots(dir, { out, at = null, channel = null, company = null, log = console.log } = {}) {
  const companies = readState(dir, 'companies', {});
  const blobs = new BlobStore(dir, '0000-00');
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  for (const meta of Object.values(companies).sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    if (company && meta.slug !== company) continue;
    if (channel && (meta.channel || 'stable') !== channel) continue;
    const obs = readTable(dir, 'observations').filter((o) => o.company === meta.slug && o.status === 'folded' && (!at || o.observedAt <= at)).map((o) => o.observedAt).sort();
    const t = obs[obs.length - 1];
    if (!t) continue;
    const { payload } = reconstruct(dir, { company: meta.slug, at: t, blobs });
    fs.writeFileSync(path.join(out, `${meta.slug}.json`), JSON.stringify(payload, null, 1) + '\n');
    results.push({ slug: meta.slug, at: t, jobs: payload.jobs.length });
    log(`restore: snapshot ${meta.slug} as of ${t}: ${payload.jobs.length} postings`);
  }
  return results;
}

async function main(argv) {
  const a = parseArgs(argv);
  const dir = archiveDir(a.archive);
  const channel = a.channel ? String(a.channel) : null;
  if (channel && !['stable', 'beta'].includes(channel)) { console.error('restore: --channel stable|beta'); return 2; }
  if (a['snapshots-out']) {
    await restoreSnapshots(dir, { out: path.resolve(String(a['snapshots-out'])), at: a.at ? iso(a.at) : null, channel, company: a.company || null });
    return 0;
  }
  const from = String(a.from || 'auto');
  if (!['auto', 'mirror', 'replay'].includes(from)) { console.error('restore: --from auto|mirror|replay'); return 2; }
  const out = path.resolve(String(a.out || path.join('data', channel === 'beta' ? 'beta/history' : 'history')));
  const r = await restoreLedgers(dir, { out, channel: channel || 'stable', from, company: a.company || null });
  return r.some((x) => x.status !== 'none') ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

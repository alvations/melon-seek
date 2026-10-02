#!/usr/bin/env node
// Listing history ledgers: data/history/<slug>.json (format in server/history.js).
//
// Library (used by scripts/snapshot.js after each successful live fetch):
//   recordRun(slug, jobs, fetchedAt, { dir }) -> { file, changed, stats, ledger }
//   readLedger(slug, { dir }) / writeLedger(slug, ledger, { dir }) / historyDir()
//
// CLI:
//   node scripts/history.js                    summary of every ledger
//   node scripts/history.js stats [slug...]    same, for some slugs
//   node scripts/history.js record [slug...]   record data/snapshots/<slug>.json into the
//                                              ledger (backfill or seed from a downloaded
//                                              snapshot artifact; older runs are ignored)
// Env: MELON_HISTORY_DIR overrides data/history.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { updateLedger, diffLedger, HISTORY_FORMAT } from '../server/history.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function historyDir() {
  return process.env.MELON_HISTORY_DIR || path.join(ROOT, 'data', 'history');
}

function fileFor(slug, dir) {
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(slug) || slug.includes('..')) throw new Error(`invalid slug "${slug}"`);
  return path.join(dir, `${slug}.json`);
}

/** Read a ledger; null when missing. Throws on a corrupt file (never overwrite it silently). */
export async function readLedger(slug, { dir = historyDir() } = {}) {
  let text;
  try {
    text = await fs.readFile(fileFor(slug, dir), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const parsed = JSON.parse(text);
  if (!parsed || parsed.format !== HISTORY_FORMAT || typeof parsed.jobs !== 'object') {
    throw new Error(`${slug}: not a ${HISTORY_FORMAT} ledger`);
  }
  return parsed;
}

/**
 * Stable, diff-friendly JSON: header fields, then one job entry per line,
 * ids sorted. Plain JSON, so any tool can read it.
 */
export function serializeLedger(ledger) {
  const { jobs, ...head } = ledger;
  const ids = Object.keys(jobs).sort();
  const lines = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(jobs[id])}`);
  const headJson = JSON.stringify(head).slice(0, -1); // drop closing brace
  return `${headJson},"jobs":{\n${lines.join(',\n')}\n}}\n`;
}

export async function writeLedger(slug, ledger, { dir = historyDir() } = {}) {
  const file = fileFor(slug, dir);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, serializeLedger(ledger));
  await fs.rename(tmp, file);
  return file;
}

/**
 * Record one successful run into data/history/<slug>.json.
 * Empty `jobs` (failed or empty fetch) leaves the file untouched.
 */
export async function recordRun(slug, jobs, fetchedAt, { dir = historyDir() } = {}) {
  const file = fileFor(slug, dir);
  if (!Array.isArray(jobs) || !jobs.length) return { file, changed: false, stats: null, ledger: null };
  const prev = await readLedger(slug, { dir });
  const next = updateLedger(prev, jobs, fetchedAt);
  if (next === prev) return { file, changed: false, stats: null, ledger: prev };
  await writeLedger(slug, next, { dir });
  return { file, changed: true, stats: diffLedger(prev, next), ledger: next };
}

function summary(slug, ledger) {
  const entries = Object.values(ledger.jobs);
  const open = entries.filter((e) => !e.c).length;
  const reposts = entries.filter((e) => !e.c && e.n).length;
  return `${slug}: ${ledger.runs} runs since ${ledger.since}, last ${ledger.lastRunAt}; ${open} open, ${entries.length - open} closed, ${reposts} open reposts`;
}

async function main(argv) {
  const [cmd = 'stats', ...rest] = argv;
  const dir = historyDir();
  if (cmd === 'record') {
    const snapDir = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');
    const slugs = rest.length ? rest : (await fs.readdir(snapDir).catch(() => [])).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    let failed = 0;
    for (const slug of slugs) {
      try {
        const snap = JSON.parse(await fs.readFile(path.join(snapDir, `${slug}.json`), 'utf8'));
        const jobs = Array.isArray(snap) ? snap : snap.jobs;
        const r = await recordRun(slug, jobs, snap.fetchedAt, { dir });
        console.log(r.changed ? `✓ ${slug}: ${JSON.stringify(r.stats)}` : `- ${slug}: unchanged (empty or not newer than the ledger)`);
      } catch (err) {
        failed++;
        console.error(`✗ ${slug}: ${err.message}`);
      }
    }
    return failed && failed === slugs.length ? 1 : 0;
  }
  if (cmd === 'stats') {
    const slugs = rest.length ? rest : (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    if (!slugs.length) console.log(`no ledgers in ${path.relative(ROOT, dir) || dir}`);
    for (const slug of slugs) {
      const ledger = await readLedger(slug, { dir });
      console.log(ledger ? summary(slug, ledger) : `${slug}: no ledger`);
    }
    return 0;
  }
  console.error('usage: node scripts/history.js [stats [slug...] | record [slug...]]');
  return 2;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

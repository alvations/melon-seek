#!/usr/bin/env node
// npm run snapshot [-- slug...]   e.g. npm run snapshot -- anthropic anduril openai
// No args = all built-ins.
// Fetch live jobs and write data/snapshots/<slug>.json (normalized API response),
// then record the run in the listing-history ledger data/history/<slug>.json (F4).
// Slugs: built-in company slugs, or "<source>:<board>" for a custom board.
// A failed or empty fetch writes nothing: no snapshot, no ledger change.
// Exit code is non-zero only when every slug failed.
// Env: MELON_SNAPSHOT_DIR (default data/snapshots), MELON_HISTORY_DIR (default data/history).
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listCompanies, resolveCompany } from '../server/companies.js';
import { fetchLive as defaultFetchLive } from '../server/index.js';
import { ROOT } from '../server/cache.js';
import { recordRun, historyDir } from './history.js';

/**
 * @param {string[]} targets  slugs or "source:board"
 * @param {object} opts       { fetchLive, outDir, historyDir, now: () => ISO, log, error }
 * @returns {Promise<{ ok: number, failed: number, results: object[] }>}
 */
export async function runSnapshot(targets, opts = {}) {
  const {
    fetchLive = defaultFetchLive,
    outDir = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots'),
    historyDir: hDir = historyDir(),
    now = () => new Date().toISOString(),
    log = console.log,
    error = console.error,
  } = opts;
  const results = [];
  let failed = 0;
  await fs.mkdir(outDir, { recursive: true });
  for (const arg of targets) {
    try {
      const [a, b] = arg.split(':');
      const company = b ? resolveCompany({ source: a, board: b }) : resolveCompany({ company: a });
      const t0 = Date.now();
      // Live only: fallback/demo data is never written to data/snapshots/ or the ledger.
      const jobs = await fetchLive(company);
      if (!jobs.length) throw new Error('live fetch returned 0 jobs; keeping any existing snapshot and ledger');
      const fetchedAt = now();
      const { slug, name, source, board, color } = company;
      const payload = { company: { slug, name, source, board, color }, mode: 'snapshot', fetchedAt, error: null, jobs };
      const file = path.join(outDir, `${company.slug}.json`);
      await fs.writeFile(file, JSON.stringify(payload, null, 1) + '\n');
      const withSalary = jobs.filter((j) => j.salary).length;
      log(`✓ ${company.slug}: ${jobs.length} jobs (${withSalary} with salary) -> ${path.relative(ROOT, file)} [${Date.now() - t0}ms]`);
      const result = { slug: company.slug, ok: true, jobs: jobs.length, file };
      try {
        const h = await recordRun(company.slug, jobs, fetchedAt, { dir: hDir });
        result.history = h.stats;
        if (h.changed) log(`  history ${company.slug}: ${h.stats.open} open, +${h.stats.added} new, ${h.stats.closed} closed, ${h.stats.reopened} reopened, ${h.stats.reposts} reposts -> ${path.relative(ROOT, h.file)}`);
      } catch (err) {
        result.historyError = err.message;
        error(`✗ history ${company.slug}: ${err.message} (snapshot written, ledger unchanged)`);
      }
      results.push(result);
    } catch (err) {
      failed++;
      results.push({ slug: arg, ok: false, error: err.message });
      error(`✗ ${arg}: ${err.message}`);
    }
  }
  if (failed) error(`${failed}/${targets.length} snapshot(s) failed`);
  return { ok: targets.length - failed, failed, results };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const targets = args.length ? args : listCompanies().map((c) => c.slug);
  const { failed } = await runSnapshot(targets);
  process.exit(failed && failed === targets.length ? 1 : 0);
}

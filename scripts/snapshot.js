#!/usr/bin/env node
// npm run snapshot [-- slug...]   e.g. npm run snapshot -- anthropic anduril openai
// No args = all built-ins.
// Fetch live jobs and write data/snapshots/<slug>.json (normalized API response).
// Slugs: built-in company slugs, or "<source>:<board>" for a custom board.
import fs from 'node:fs/promises';
import path from 'node:path';
import { listCompanies, resolveCompany } from '../server/companies.js';
import { fetchLive } from '../server/index.js';
import { ROOT } from '../server/cache.js';

const outDir = path.join(ROOT, 'data', 'snapshots');
const args = process.argv.slice(2);
const targets = args.length ? args : listCompanies().map((c) => c.slug);

let failed = 0;
await fs.mkdir(outDir, { recursive: true });
for (const arg of targets) {
  try {
    const [a, b] = arg.split(':');
    const company = b ? resolveCompany({ source: a, board: b }) : resolveCompany({ company: a });
    const t0 = Date.now();
    // Live only: fallback/demo data is never written to data/snapshots/.
    const jobs = await fetchLive(company);
    if (!jobs.length) throw new Error('live fetch returned 0 jobs; keeping any existing snapshot');
    const { slug, name, source, board, color } = company;
    const payload = { company: { slug, name, source, board, color }, mode: 'snapshot', fetchedAt: new Date().toISOString(), error: null, jobs };
    const file = path.join(outDir, `${company.slug}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 1) + '\n');
    const withSalary = jobs.filter((j) => j.salary).length;
    console.log(`✓ ${company.slug}: ${jobs.length} jobs (${withSalary} with salary) -> ${path.relative(ROOT, file)} [${Date.now() - t0}ms]`);
  } catch (err) {
    failed++;
    console.error(`✗ ${arg}: ${err.message}`);
  }
}
if (failed) console.error(`${failed}/${targets.length} snapshot(s) failed`);
// Exit non-zero only when every slug failed.
process.exit(failed && failed === targets.length ? 1 : 0);

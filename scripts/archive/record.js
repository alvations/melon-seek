#!/usr/bin/env node
// Record dated versions of reference data in the archive (docs/DATA_ARCHIVE.md "reference").
//
//   node scripts/archive/record.js --dataset <id> --asof <YYYY-MM-DD> --file <json> [--source <url>]
//        [--tax-year YYYY] [--confirm] [--by NAME] [--archive DIR] [--now ISO]
//      One version. Idempotent: the same content as the dataset's latest version changes
//      nothing (with --confirm, a new asOf for unchanged content is noted once as a
//      "confirm" row). Different content is a new version; nothing is ever overwritten.
//   node scripts/archive/record.js --from-repo [--archive DIR]
//      Capture every dataset the code branch defines (FX tables, cities.json, the Juice
//      model and a tax probe, vetting/market/Compstimate/role/lexicon policy, the company
//      registry, data/freshness.json) plus reviewed verdicts in data/vetting/*/verdicts.jsonl.
//   node scripts/archive/record.js --import <dir> [--archive DIR]
//      A hand-off directory: a record.js spool, or the monthly refresh's manifest.json + files.
//   node scripts/archive/record.js --list [--dataset <id>] [--archive DIR]
//
// --archive defaults to MELON_ARCHIVE_DIR, else tmp/archive. Run from a workflow with
// --archive pointing at a spool directory and upload it as the `archive-reference`
// artifact; archive.yml imports it into the data branch. Dataset ids: lowercase letters,
// digits, ".", "_" and "-" (the freshness registry ids; "repo." is reserved for --from-repo).
// Exit 0 on success (including "unchanged"), 1 on a bad file, 2 on bad arguments.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, archiveDir, iso, writeManifest, codeSha, ROOT } from './lib.js';
import { recordVersion, captureRepo, importSpool, referenceIndex } from './reference.js';
import { openArchive, closeArchive, ingestVetting, writeReadme } from './ingest.js';

function finish(dir, now, generator) {
  writeReadme(dir);
  writeManifest(dir, { now, generator: generator ? `scripts/archive@${generator}` : 'scripts/archive' });
}

/** Reviewed verdicts committed to the repo (data/vetting/<date>/verdicts.jsonl) as audit rows. */
export function captureRepoVerdicts(ctx) {
  const base = path.join(ROOT, 'data', 'vetting');
  const out = [];
  let days = [];
  try { days = fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort(); } catch { return out; }
  for (const d of days) {
    if (!fs.existsSync(path.join(base, d, 'verdicts.jsonl'))) continue;
    const r = ingestVetting(ctx, path.join(base, d), { artifact: { name: `repo:data/vetting/${d}` }, source: 'repo' });
    out.push({ day: d, ...r });
  }
  return out;
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['confirm', 'from-repo', 'list'] });
  const dir = archiveDir(a.archive);
  const now = iso(a.now) || new Date().toISOString();
  if (a.list) {
    for (const r of referenceIndex(dir, a.dataset || null)) console.log(`${r.dataset}\t${r.asOf}\t${r.kind}\trev ${r.rev}\t${r.file}\t${r.source || ''}`);
    return 0;
  }
  const sha = await codeSha();
  if (a['from-repo']) {
    fs.mkdirSync(dir, { recursive: true });
    const res = await captureRepo(dir, { now, sha, log: console.error });
    for (const r of res) console.log(`record: ${r.dataset}: ${r.status}${r.asOf ? ` (asOf ${r.asOf})` : ''}${r.detail ? ` ${r.detail}` : ''}`);
    const ctx = await openArchive(dir, { now });
    for (const v of captureRepoVerdicts(ctx)) console.log(`record: verdicts ${v.day}: ${v.newVerdicts} new of ${v.verdicts}`);
    closeArchive(ctx);
    return res.some((r) => r.status === 'error') ? 0 : 0; // a module that fails to load is a warning, not a failed run
  }
  if (a.import) {
    const ctx = await openArchive(dir, { now });
    const res = await importSpool(ctx, path.resolve(a.import), { artifact: null });
    closeArchive(ctx);
    for (const r of res) console.log(`record: ${JSON.stringify(r)}`);
    return res.some((r) => r.status === 'error') ? 1 : 0;
  }
  if (!a.dataset || !a.asof || !a.file) {
    console.error('usage: node scripts/archive/record.js --dataset <id> --asof <YYYY-MM-DD> --file <json> [--source <url>] [--tax-year YYYY] [--confirm] [--archive DIR]\n       node scripts/archive/record.js --from-repo | --import <dir> | --list [--dataset <id>]');
    return 2;
  }
  let data;
  try { data = JSON.parse(fs.readFileSync(path.resolve(String(a.file)), 'utf8')); } catch (err) { console.error(`record: cannot read ${a.file}: ${err.message}`); return 1; }
  let r;
  try {
    fs.mkdirSync(dir, { recursive: true });
    r = recordVersion(dir, {
      dataset: String(a.dataset), asOf: String(a.asof), data, source: a.source ? String(a.source) : null, by: a.by ? String(a.by) : 'record.js',
      taxYear: a['tax-year'] ? Number(a['tax-year']) : null, confirm: !!a.confirm, now,
    });
  } catch (err) { console.error(`record: ${err.message}`); return 2; }
  finish(dir, now, sha);
  console.log(`record: ${a.dataset} ${a.asof}: ${r.status}${r.row ? ` -> ${r.row.file}` : ''}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

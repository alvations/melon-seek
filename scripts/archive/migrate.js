#!/usr/bin/env node
// Schema migrations for the archive (docs/DATA_ARCHIVE.md "Schema versions and migrations").
//
//   node scripts/archive/migrate.js --archive DIR [--migrations DIR] [--dry-run]
//
// A migration is scripts/archive/migrations/NNN-<name>.js exporting
//   export const from = 1, to = 2, description = '...';
//   export async function migrate(dir, ctx) { ... }   // ctx: { now, log, lib }
// Migrations run in order from MANIFEST.json schemaVersion up to SCHEMA_VERSION (lib.js),
// each once; the manifest records the new version and the applied migration.
//
// Rules (verify.js enforces the first two on the commit that follows):
//   1. Never rewrite a closed append partition or an immutable file. To change the shape of
//      old rows, write converted copies as NEW files/tables (e.g. jobs-v2/...) and keep the
//      originals; readers pick the newest table they understand.
//   2. Never drop rows. Mutable files (open versions, state) may be rewritten with new fields.
//   3. Be idempotent: re-running a half-applied migration must give the same result.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as lib from './lib.js';

const { SCHEMA_VERSION, readManifest, writeIfChanged, buildManifest, parseArgs, archiveDir, iso } = lib;

export async function loadMigrations(mdir) {
  let names = [];
  try { names = fs.readdirSync(mdir).filter((n) => /^\d{3}-[a-z0-9-]+\.js$/.test(n)).sort(); } catch { return []; }
  const out = [];
  for (const n of names) {
    const m = await import(pathToFileURL(path.join(mdir, n)).href);
    if (!Number.isInteger(m.from) || m.to !== m.from + 1 || typeof m.migrate !== 'function') throw new Error(`${n}: needs integer from, to = from + 1 and migrate()`);
    out.push({ name: n, from: m.from, to: m.to, description: m.description || '', migrate: m.migrate });
  }
  return out;
}

export async function migrateArchive(dir, { migrationsDir = path.join(lib.ROOT, 'scripts', 'archive', 'migrations'), target = SCHEMA_VERSION, dryRun = false, now = new Date().toISOString(), log = console.log } = {}) {
  const manifest = readManifest(dir);
  if (!manifest) { log('migrate: empty archive; nothing to migrate'); return { from: null, to: null, applied: [] }; }
  let v = manifest.schemaVersion || 1;
  if (v > target) throw new Error(`archive schema ${v} is newer than this code (${target}); update the code branch`);
  const migrations = await loadMigrations(migrationsDir);
  const applied = [];
  while (v < target) {
    const m = migrations.find((x) => x.from === v);
    if (!m) throw new Error(`no migration from schema ${v} (looked in ${migrationsDir})`);
    log(`migrate: ${m.name}: ${v} -> ${m.to}${m.description ? ` (${m.description})` : ''}${dryRun ? ' [dry run]' : ''}`);
    if (!dryRun) {
      await m.migrate(dir, { now, log, lib });
      const next = buildManifest(dir, { now, generator: manifest.generator });
      next.schemaVersion = m.to;
      next.migrations = [...(manifest.migrations || []), { name: m.name, from: m.from, to: m.to, at: now }];
      writeIfChanged(path.join(dir, 'MANIFEST.json'), JSON.stringify(next, null, 1) + '\n');
      manifest.migrations = next.migrations;
    }
    applied.push(m.name);
    v = m.to;
  }
  if (!applied.length) log(`migrate: schema ${v} is current`);
  return { from: manifest.schemaVersion || 1, to: v, applied };
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['dry-run'] });
  try {
    await migrateArchive(archiveDir(a.archive), { migrationsDir: a.migrations ? path.resolve(String(a.migrations)) : undefined, dryRun: !!a['dry-run'], now: iso(a.now) || new Date().toISOString(), target: a.to ? Number(a.to) : SCHEMA_VERSION });
    return 0;
  } catch (err) {
    console.error(`::error::archive migrate: ${err.message}`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

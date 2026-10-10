#!/usr/bin/env node
// What the archive holds: table row counts, observation date range per company,
// reference datasets. For workflow logs and step summaries.
//
//   node scripts/archive/status.js --archive DIR [--markdown] [--oneline]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readManifest, readState, readTable, parseArgs, archiveDir } from './lib.js';

export function status(dir) {
  const manifest = readManifest(dir) || { tables: {}, files: {} };
  const companies = readState(dir, 'companies', {});
  const obs = readTable(dir, 'observations').filter((o) => o.status === 'folded');
  const range = obs.length ? [obs.reduce((m, o) => (o.observedAt < m ? o.observedAt : m), obs[0].observedAt), obs.reduce((m, o) => (o.observedAt > m ? o.observedAt : m), obs[0].observedAt)] : [null, null];
  const ingests = readTable(dir, 'ingests');
  const byName = {};
  for (const r of ingests) { const k = `${r.name}:${r.status}`; byName[k] = (byName[k] || 0) + 1; }
  const bytes = Object.values(manifest.files || {}).reduce((s, f) => s + (f.bytes || 0), 0);
  return {
    schemaVersion: manifest.schemaVersion ?? null, updatedAt: manifest.updatedAt ?? null, bytes, files: Object.keys(manifest.files || {}).length,
    tables: manifest.tables || {}, observedFrom: range[0], observedTo: range[1], artifacts: byName,
    companies: Object.values(companies).map((c) => ({ slug: c.slug, channel: c.channel || null, observations: c.observations || 0, first: c.firstObservedAt || null, last: c.lastObservedAt || null, open: c.open ?? null, ids: c.ids ?? null })),
  };
}

export function markdown(s) {
  const out = ['### Data archive', '', `Observations from **${s.observedFrom || '-'}** to **${s.observedTo || '-'}**; ${s.files} files, ${(s.bytes / 1e6).toFixed(1)} MB; schema v${s.schemaVersion ?? '-'}.`, '', '| table | rows |', '| --- | ---: |'];
  for (const [t, n] of Object.entries(s.tables)) out.push(`| ${t} | ${n} |`);
  out.push('', '| company | channel | observations | first seen | last seen | open versions | ids |', '| --- | --- | ---: | --- | --- | ---: | ---: |');
  for (const c of s.companies) out.push(`| ${c.slug} | ${c.channel || '-'} | ${c.observations} | ${c.first || '-'} | ${c.last || '-'} | ${c.open ?? '-'} | ${c.ids ?? '-'} |`);
  out.push('', '| artifact:status | count |', '| --- | ---: |');
  for (const [k, n] of Object.entries(s.artifacts).sort()) out.push(`| ${k} | ${n} |`);
  return out.join('\n') + '\n';
}

export function oneline(s) {
  const t = s.tables;
  return `${s.observedFrom ? s.observedFrom.slice(0, 10) : '-'}..${s.observedTo ? s.observedTo.slice(0, 10) : '-'}; ${s.companies.length} companies, ${t['jobs.versions'] || 0} job versions, ${t.observations || 0} observations, ${t.daily || 0} daily rows`;
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['markdown', 'oneline'] });
  const s = status(archiveDir(a.archive));
  if (a.oneline) console.log(oneline(s));
  else if (a.markdown) process.stdout.write(markdown(s));
  else console.log(JSON.stringify(s, null, 1));
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

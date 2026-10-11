#!/usr/bin/env node
// Beta snapshot plumbing for snapshot.yml's per-company crawl (docs/process/beta-deploy.md).
//
//   node .github/scripts/beta-snapshots.mjs slugs
//       Prints the beta-channel slugs as a JSON array (the crawl matrix; [] = none),
//       from server/companies.js via scripts/build-static.js#channelCompanies.
//   node .github/scripts/beta-snapshots.mjs merge <fresh-dir> <data-dir> [<crawl-state-dir>]
//       <data-dir> (data/beta) holds the restored job-board-snapshots-beta artifact:
//       snapshots/<slug>.json and history/<slug>.json. <fresh-dir> holds this run's
//       crawl results, one <slug>.json per company that fetched AND passed the beta gate.
//       Each fresh snapshot replaces the previous one and is recorded in that company's
//       ledger (scripts/history.js#recordRun, as scripts/snapshot.js does); a company with
//       no fresh file keeps its previous snapshot and ledger untouched. Files of slugs that
//       are not beta companies are removed. Writes a Markdown table to $GITHUB_STEP_SUMMARY
//       and `fresh=<n>` / `kept=<n>` to $GITHUB_OUTPUT (when set).
//       Closures follow server/history.js#closureOptions: the snapshot's `crawl` field (a short
//       list closes nothing for being absent; probe-confirmed `gone` ids close) and, from
//       <crawl-state-dir>/<slug>.json.gz of the SAME crawl (same fetchedAt), every id the crawl
//       listed, so postings a cap left out stay open while they are on the board.
//
// Env: MELON_BETA_COMPANIES (test-only extra beta companies, as for scripts/build-static.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);

async function betaCompanies() {
  const { listCompanies } = await imp('server', 'companies.js');
  const { channelCompanies } = await imp('scripts', 'build-static.js');
  const f = process.env.MELON_BETA_COMPANIES;
  const extra = f ? JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) : [];
  return channelCompanies(listCompanies, Array.isArray(extra) ? extra : []).beta;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const append = (file, text) => { if (file) fs.appendFileSync(file, text); };

async function merge(freshDir, dataDir, stateDir = null) {
  // A capped or partial snapshot records its left-out postings as unseen, not closed.
  const { recordPublished, readCrawlState } = await imp('scripts', 'snapshot.js');
  const snaps = path.join(dataDir, 'snapshots');
  const hist = path.join(dataDir, 'history');
  fs.mkdirSync(snaps, { recursive: true });
  fs.mkdirSync(hist, { recursive: true });
  const beta = await betaCompanies();
  const slugs = new Set(beta.map((c) => c.slug));
  const rows = [];
  let fresh = 0;
  let kept = 0;
  for (const c of beta) {
    const src = path.join(freshDir, `${c.slug}.json`);
    const body = fs.existsSync(src) ? readJson(src) : null;
    const jobs = body && (Array.isArray(body) ? body : body.jobs);
    if (Array.isArray(jobs) && jobs.length) {
      const fetchedAt = (body && body.fetchedAt) || new Date().toISOString();
      fs.copyFileSync(src, path.join(snaps, `${c.slug}.json`));
      let ledger = '';
      try {
        const capped = body && body.jobsCapped && typeof body.jobsCapped === 'object' ? body.jobsCapped : null;
        const crawl = body && body.crawl && typeof body.crawl === 'object' ? body.crawl : null;
        const state = stateDir ? await readCrawlState(stateDir, c.slug) : null;
        const listed = state && state.fetchedAt === fetchedAt && Array.isArray(state.listed) ? state.listed : null;
        const h = await recordPublished(c.slug, jobs, fetchedAt, { dir: hist, capped, crawl, listed });
        ledger = h && h.stats ? `ledger: ${h.stats.open} open, +${h.stats.added} new, ${h.stats.closed} closed${Object.keys(h.stats.closedBy || {}).length ? ` (${Object.entries(h.stats.closedBy).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}${h.stats.unseen ? `, ${h.stats.unseen} ${capped ? "left out by the cap" : "missing from a partial list"} kept open` : ''}${crawl ? `; crawl ${crawl.mode}, list ${crawl.list && crawl.list.complete === false ? 'partial' : 'complete'}` : ''}` : '';
      } catch (err) {
        ledger = `ledger unchanged (${err.message})`;
      }
      fresh++;
      const cap = body && body.jobsCapped ? ` (${body.jobsCapped.kept} of ${body.jobsCapped.total}: ${body.jobsCapped.rule || 'capped'})` : '';
      rows.push(`| ${c.slug} | **fresh** | ${jobs.length}${cap} | ${fetchedAt} | ${ledger} |`);
      continue;
    }
    const prev = readJson(path.join(snaps, `${c.slug}.json`));
    const why = fs.existsSync(src) ? 'this run\'s file was unreadable or empty' : 'no fresh snapshot this run (crawl failed, timed out or left out by the beta gate)';
    if (prev) {
      kept++;
      rows.push(`| ${c.slug} | kept previous | ${(prev.jobs || []).length} | ${prev.fetchedAt || '-'} | ${why} |`);
    } else {
      rows.push(`| ${c.slug} | none | - | - | ${why}; not on the beta site until a crawl succeeds |`);
    }
  }
  const removed = [];
  for (const dir of [snaps, hist]) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || slugs.has(f.slice(0, -5))) continue;
      fs.rmSync(path.join(dir, f), { force: true });
      removed.push(`${path.basename(dir)}/${f}`);
    }
  }
  const md = ['### Beta snapshots (job-board-snapshots-beta)', '',
    `${fresh} fresh, ${kept} kept from the previous artifact, ${beta.length - fresh - kept} with no data.${removed.length ? ` Removed non-beta files: ${removed.join(', ')}.` : ''}`, '',
    ...(rows.length ? ['| company | snapshot | jobs | fetchedAt | note |', '| --- | --- | ---: | --- | --- |', ...rows] : ['_No beta companies in the registry._']), '', ''].join('\n');
  append(process.env.GITHUB_STEP_SUMMARY, md);
  append(process.env.GITHUB_OUTPUT, `fresh=${fresh}\nkept=${kept}\n`);
  console.log(md);
  console.log(`beta-snapshots: ${fresh} fresh, ${kept} kept`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'slugs') {
  console.log(JSON.stringify((await betaCompanies()).map((c) => c.slug)));
} else if (cmd === 'merge' && (rest.length === 2 || rest.length === 3)) {
  await merge(path.resolve(rest[0]), path.resolve(rest[1]), rest[2] ? path.resolve(rest[2]) : null);
} else {
  console.error('usage: beta-snapshots.mjs slugs | merge <fresh-dir> <data-dir> [<crawl-state-dir>]');
  process.exit(2);
}

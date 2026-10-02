#!/usr/bin/env node
// npm run build -> dist/: a static, server-less build of melon-seek (GitHub Pages).
//
//   dist/                     copy of public/ (absolute "/x" URLs in HTML made relative,
//                             config.js injected before the first script)
//   dist/config.js            window.MELON_STATIC = true (+ build info, live sources)
//   dist/vendor/leaflet/      node_modules/leaflet/dist
//   dist/lib/                 browser copies of server modules used by public/api.js
//   dist/api/companies.json   built-in companies
//   dist/api/jobs/<slug>.json data/snapshots/<slug>.json if present (mode "snapshot"),
//                             else build-time demo (mode "demo"). Jobs are written
//                             WITHOUT descriptionHtml (see "Lazy descriptions").
//   dist/api/demo/<slug>.json build-time demo (mode "demo"), last bundled fallback;
//                             only written when jobs/<slug>.json is a real snapshot
//   dist/api/desc/<slug>/<id>.json  { id, descriptionHtml, sections? } per job
//   dist/.nojekyll
//
// Lazy descriptions: descriptionHtml is ~90% of a job's bytes, so each one goes
// in its own file, fetched by public/api.js#getJobDetail when the job drawer
// opens (the file path comes from api.js#descPath, shared with this script).
// sections + keywords stay in the list. If a list is still over LIST_BUDGET,
// that company's sections move into the desc files too (list keeps empty
// arrays; getJobDetail returns them) and the build says so.
//
// Options: --out <dir> (default dist), --strict (fail on warnings).
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = path.resolve(ROOT, outArg >= 0 ? args[outArg + 1] : 'dist');
const STRICT = args.includes('--strict');
const SNAPSHOT_DIR = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');

// Server modules the browser needs (paths relative to server/). companies.js is
// included for custom-board validation; demo.js is optional.
const LIB_MODULES = ['companies.js', 'normalize.js', 'salary.js', 'geo.js', 'keywords.js', 'demo.js'];
const OPTIONAL_LIB = new Set(['demo.js']);
// Sources that public/api.js may fetch live from the browser, and those whose
// CORS failures fall back to the bundled snapshot without an error (see the
// CORS notes in public/api.js).
const LIVE_SOURCES = ['greenhouse', 'ashby', 'lever'];
const QUIET_CORS_SOURCES = ['lever'];
// Per-company list file target (bytes).
const LIST_BUDGET = 1_500_000;

const warnings = [];
const warn = (msg) => { warnings.push(msg); console.warn(`! ${msg}`); };
const rel = (p) => path.relative(ROOT, p) || '.';

async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj) + '\n');
  return (await fs.stat(file)).size;
}

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** "/x" -> "./x" or "../x" so the site works under a sub-path (/melon-seek/). */
function relativizeHtml(html, depth) {
  const prefix = depth ? '../'.repeat(depth) : './';
  return html.replace(/\b(href|src)=(["'])\/(?!\/)/g, (_, attr, q) => `${attr}=${q}${prefix}`);
}

function size(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

const emptySections = () => ({ responsibilities: [], fit: [] });
const hasSections = (s) => !!s && ((s.responsibilities || []).length > 0 || (s.fit || []).length > 0);

/**
 * Split a payload into a small list and per-job detail records.
 * Returns { list, details: Map(descPath -> record), sectionsMoved }.
 */
function splitPayload(payload, descPath) {
  const build = (moveSections) => {
    const details = new Map();
    const jobs = payload.jobs.map((job) => {
      const { descriptionHtml, ...rest } = job;
      const html = typeof descriptionHtml === 'string' ? descriptionHtml : '';
      const rec = { id: job.id };
      if (html) rec.descriptionHtml = html;
      if (moveSections && hasSections(job.sections)) { rec.sections = job.sections; rest.sections = emptySections(); }
      if (!rec.descriptionHtml && !rec.sections) return { ...rest, descriptionHtml: '' }; // nothing to fetch
      if (!rec.descriptionHtml) rec.descriptionHtml = '';
      const p = descPath(job);
      if (details.has(p)) throw new Error(`desc path collision for ${job.id} (${p})`);
      details.set(p, rec);
      return rest; // no descriptionHtml key -> api.js#getJobDetail fetches it
    });
    return { list: { ...payload, jobs }, details, sectionsMoved: moveSections };
  };
  let out = build(false);
  if (Buffer.byteLength(JSON.stringify(out.list)) > LIST_BUDGET) out = build(true);
  return out;
}

async function writeSplit(payload, file, descPath, slug) {
  const { list, details, sectionsMoved } = splitPayload(payload, descPath);
  const listBytes = await writeJson(file, list);
  let descBytes = 0;
  for (const [p, rec] of details) descBytes += await writeJson(path.join(OUT, p), rec);
  if (listBytes > LIST_BUDGET) warn(`${slug}: list is ${size(listBytes)} even without descriptions/sections (budget ${size(LIST_BUDGET)})`);
  return { listBytes, descBytes, descFiles: details.size, sectionsMoved };
}

async function main() {
  const t0 = Date.now();
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // 1. public/ -> dist/
  await fs.cp(path.join(ROOT, 'public'), OUT, { recursive: true });
  for (const file of await walk(OUT)) {
    if (!file.endsWith('.html')) continue;
    const depth = path.relative(OUT, path.dirname(file)).split(path.sep).filter(Boolean).length;
    let html = relativizeHtml(await fs.readFile(file, 'utf8'), depth);
    if (file === path.join(OUT, 'index.html')) {
      const tag = '<script src="config.js"></script>';
      html = /<script\b/i.test(html) ? html.replace(/<script\b/i, `${tag}\n  <script`) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
    }
    await fs.writeFile(file, html);
  }
  // Sub-path hazards in JS that the build can't fix (owned by app code).
  for (const file of (await walk(OUT)).filter((f) => f.endsWith('.js') && !/(^|\/)(mock-api|api)\.js$/.test(f))) {
    const src = await fs.readFile(file, 'utf8');
    if (/['"`]\/api\//.test(src) && !/from\s+['"]\.\/api\.js['"]/.test(src)) warn(`${path.relative(OUT, file)} uses absolute "/api/..." URLs; route them through api.js (apiFetch/getJobs) or the static site can't load data`);
    const abs = src.match(/['"`]\/(favicon\.svg|vendor\/|viz\/|styles\.css|app\.js)/);
    if (abs) warn(`${path.relative(OUT, file)} references absolute "/${abs[1]}"; use a relative URL for sub-path hosting`);
  }

  // 2. Leaflet
  const leaflet = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
  if (!existsSync(leaflet)) throw new Error('node_modules/leaflet/dist not found — run `npm ci` first');
  await fs.cp(leaflet, path.join(OUT, 'vendor', 'leaflet'), { recursive: true });

  // 3. Browser-safe server modules -> dist/lib/
  const libFiles = [
    ...LIB_MODULES.map((f) => path.join(ROOT, 'server', f)),
    ...(await fs.readdir(path.join(ROOT, 'server', 'sources'))).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'server', 'sources', f)),
  ];
  const nodeOnly = [];
  let libCount = 0;
  for (const src of libFiles) {
    const name = path.relative(path.join(ROOT, 'server'), src);
    if (!existsSync(src)) {
      if (OPTIONAL_LIB.has(name)) { warn(`server/${name} missing; in-browser demo fallback disabled`); continue; }
      throw new Error(`server/${name} missing`);
    }
    const code = await fs.readFile(src, 'utf8');
    if (/\bfrom\s+['"]node:|\bimport\s*\(\s*['"]node:|\brequire\s*\(/.test(code)) { nodeOnly.push(`server/${name}`); continue; }
    // Warning-level check ignores comments ("no Buffer" in a comment is fine);
    // the hard node:/require check above deliberately scans the raw source.
    const codeOnly = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    if (/\b(process\.|Buffer\b|__dirname)/.test(codeOnly)) warn(`server/${name} references a Node global (process/Buffer/__dirname); api.js stubs process.env, check anything else`);
    const dest = path.join(OUT, 'lib', name);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, code);
    libCount++;
  }
  if (nodeOnly.length) throw new Error(`Node-only imports in browser modules (fix in the owning module, not here): ${nodeOnly.join(', ')}`);

  // 4. API data
  const { listCompanies } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
  const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
  let demoJobs = null;
  if (existsSync(path.join(ROOT, 'server', 'demo.js'))) {
    ({ demoJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'demo.js')).href));
  }
  const { descPath } = await import(pathToFileURL(path.join(ROOT, 'public', 'api.js')).href);
  const companies = listCompanies().map(({ slug, name, source, board, color }) => ({ slug, name, source, board, color }));
  await writeJson(path.join(OUT, 'api', 'companies.json'), companies);

  const builtAt = new Date().toISOString();
  const summary = [];
  for (const c of companies) {
    let demo = null;
    if (demoJobs) {
      const jobs = normalizeJobs(demoJobs(c.slug, c.name), c);
      demo = { company: c, mode: 'demo', fetchedAt: builtAt, error: 'Synthetic demo data (no real snapshot was bundled for this company).', jobs };
    }

    let payload = null;
    const snapFile = path.join(SNAPSHOT_DIR, `${c.slug}.json`);
    if (existsSync(snapFile)) {
      try {
        const parsed = JSON.parse(await fs.readFile(snapFile, 'utf8'));
        const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
        if (Array.isArray(jobs) && jobs.length) payload = { company: c, mode: 'snapshot', fetchedAt: parsed.fetchedAt || null, error: null, jobs };
        else warn(`${rel(snapFile)} has no jobs; using demo`);
      } catch (err) {
        warn(`${rel(snapFile)} unreadable (${err.message}); using demo`);
      }
    }
    if (!payload && demo) payload = demo;
    if (!payload) {
      warn(`${c.slug}: no snapshot and no demo generator; bundling an empty demo`);
      payload = { company: c, mode: 'demo', fetchedAt: builtAt, error: 'No data bundled.', jobs: [] };
    }
    const r = await writeSplit(payload, path.join(OUT, 'api', 'jobs', `${c.slug}.json`), descPath, c.slug);
    let line = `${c.slug.padEnd(10)} ${payload.mode.padEnd(8)} ${String(payload.jobs.length).padStart(4)} jobs  list ${size(r.listBytes).padStart(9)}  desc ${String(r.descFiles).padStart(4)} files ${size(r.descBytes).padStart(9)}`;
    if (r.sectionsMoved) line += '  (sections moved to desc: list was over budget)';
    if (payload.fetchedAt) line += `  fetchedAt ${payload.fetchedAt}`;
    // The bundled demo is only a separate fallback when the main list is real.
    if (payload.mode === 'snapshot' && demo) {
      const d = await writeSplit(demo, path.join(OUT, 'api', 'demo', `${c.slug}.json`), descPath, `${c.slug} (demo)`);
      line += `  + demo list ${size(d.listBytes)}`;
    }
    summary.push(line);
  }

  // 5. config.js + .nojekyll
  const build = { builtAt, commit: process.env.GITHUB_SHA || null, ref: process.env.GITHUB_REF_NAME || null };
  await fs.writeFile(path.join(OUT, 'config.js'),
    '// Generated by scripts/build-static.js — marks this as the static (server-less) build.\n' +
    'window.MELON_STATIC = true;\n' +
    `window.MELON_LIVE_SOURCES = ${JSON.stringify(LIVE_SOURCES)};\n` +
    `window.MELON_QUIET_CORS_SOURCES = ${JSON.stringify(QUIET_CORS_SOURCES)};\n` +
    `window.MELON_BUILD = ${JSON.stringify(build)};\n`);
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  console.log(`Built ${rel(OUT)}/ in ${Date.now() - t0}ms: ${libCount} lib modules, leaflet, ${companies.length} companies`);
  for (const line of summary) console.log(`  ${line}`);
  if (warnings.length) {
    console.warn(`${warnings.length} warning(s)`);
    if (STRICT) process.exit(1);
  }
}

main().catch((err) => {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
});

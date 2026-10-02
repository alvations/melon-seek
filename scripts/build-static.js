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
//                             else build-time demo (mode "demo")
//   dist/api/demo/<slug>.json build-time demo (mode "demo"), last bundled fallback
//   dist/.nojekyll
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
// Sources that public/api.js may fetch live from the browser (see CORS notes there).
const LIVE_SOURCES = ['greenhouse', 'ashby'];

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

function kb(n) {
  return `${(n / 1024).toFixed(0)} KB`;
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
    if (/\b(process\.|Buffer\b|__dirname)/.test(code)) warn(`server/${name} references a Node global (process/Buffer/__dirname); api.js stubs process.env, check anything else`);
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
  const companies = listCompanies().map(({ slug, name, source, board, color }) => ({ slug, name, source, board, color }));
  await writeJson(path.join(OUT, 'api', 'companies.json'), companies);

  const builtAt = new Date().toISOString();
  const summary = [];
  for (const c of companies) {
    let demo = null;
    if (demoJobs) {
      const jobs = normalizeJobs(demoJobs(c.slug, c.name), c);
      demo = { company: c, mode: 'demo', fetchedAt: builtAt, error: 'Synthetic demo data (no real snapshot was bundled for this company).', jobs };
      await writeJson(path.join(OUT, 'api', 'demo', `${c.slug}.json`), demo);
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
    const size = await writeJson(path.join(OUT, 'api', 'jobs', `${c.slug}.json`), payload);
    summary.push(`${c.slug}: ${payload.mode}, ${payload.jobs.length} jobs${payload.fetchedAt ? ` (${payload.fetchedAt})` : ''}, ${kb(size)}`);
  }

  // 5. config.js + .nojekyll
  const build = { builtAt, commit: process.env.GITHUB_SHA || null, ref: process.env.GITHUB_REF_NAME || null };
  await fs.writeFile(path.join(OUT, 'config.js'),
    '// Generated by scripts/build-static.js — marks this as the static (server-less) build.\n' +
    'window.MELON_STATIC = true;\n' +
    `window.MELON_LIVE_SOURCES = ${JSON.stringify(LIVE_SOURCES)};\n` +
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

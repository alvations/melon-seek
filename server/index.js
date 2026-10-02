// melon-seek HTTP server: static files + JSON API. No frameworks.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { listCompanies, resolveCompany } from './companies.js';
import { fetchGreenhouse } from './sources/greenhouse.js';
import { fetchAshby } from './sources/ashby.js';
import { fetchLever } from './sources/lever.js';
import { normalizeJobs } from './normalize.js';
import { getCached, setCached, ROOT } from './cache.js';
import { demoJobs } from './demo.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const LEAFLET_DIR = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
const SNAPSHOT_DIR = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');

export const ADAPTERS = { greenhouse: fetchGreenhouse, ashby: fetchAshby, lever: fetchLever };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;

/** Fetch live jobs for a company and normalize them. */
export async function fetchLive(company) {
  const adapter = ADAPTERS[company.source];
  if (!adapter) throw new Error(`No adapter for source "${company.source}"`);
  const raws = await adapter(company.board);
  return normalizeJobs(raws, company);
}

async function readSnapshot(slug) {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(SNAPSHOT_DIR, `${slug}.json`), 'utf8'));
    const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
    if (!Array.isArray(jobs) || !jobs.length) return null;
    return { jobs, fetchedAt: parsed.fetchedAt || null };
  } catch {
    return null;
  }
}

const inflight = new Map();

/**
 * Resolve jobs with fallbacks:
 * fresh cache -> live -> stale cache -> snapshot -> demo.
 */
export async function getJobs(company, { refresh = false } = {}) {
  const pub = { slug: company.slug, name: company.name, source: company.source, board: company.board, color: company.color };
  const cached = await getCached(company.slug);
  if (cached && cached.fresh && !refresh) {
    return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error: null, jobs: cached.data };
  }

  let error = null;
  try {
    let p = inflight.get(company.slug);
    if (!p) {
      p = fetchLive(company).finally(() => inflight.delete(company.slug));
      inflight.set(company.slug, p);
    }
    const jobs = await p;
    const entry = await setCached(company.slug, jobs);
    return { company: pub, mode: 'live', fetchedAt: entry.fetchedAt, error: null, jobs };
  } catch (err) {
    error = `Live fetch failed: ${err && err.message ? err.message : String(err)}`;
  }

  if (cached) return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error, jobs: cached.data };

  const snap = await readSnapshot(company.slug);
  if (snap) return { company: pub, mode: 'snapshot', fetchedAt: snap.fetchedAt, error, jobs: snap.jobs };

  let jobs = [];
  try {
    jobs = normalizeJobs(demoJobs(company.slug, company.name), company);
  } catch (err) {
    error = `${error}; demo generation failed: ${err.message}`;
  }
  return { company: pub, mode: 'demo', fetchedAt: new Date().toISOString(), error, jobs };
}

function send(req, res, status, body, type) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf);
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function sendJson(req, res, status, obj) {
  send(req, res, status, JSON.stringify(obj), MIME['.json']);
}

/** Map a URL path under a base dir; returns null on traversal. */
function safeJoin(base, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(base, '.' + path.posix.normalize('/' + decoded.replace(/\\/g, '/')));
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

async function serveFile(req, res, file) {
  let st;
  try { st = await fs.stat(file); } catch { st = null; }
  if (st && st.isDirectory()) {
    file = path.join(file, 'index.html');
    try { st = await fs.stat(file); } catch { st = null; }
  }
  if (!st || !st.isFile()) return sendJson(req, res, 404, { error: 'Not found' });
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (COMPRESSIBLE.test(type) && st.size < 5 * 1024 * 1024) {
    return send(req, res, 200, await fs.readFile(file), type);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'Method not allowed' });
    if (p === '/api/companies') return sendJson(req, res, 200, listCompanies().map(({ slug, name, source, board, color }) => ({ slug, name, source, board, color })));
    if (p === '/api/jobs') {
      let company;
      try {
        company = resolveCompany(url.searchParams);
      } catch (err) {
        return sendJson(req, res, err.status || 400, { error: err.message });
      }
      const refresh = ['1', 'true', 'yes'].includes(url.searchParams.get('refresh') || '');
      return sendJson(req, res, 200, await getJobs(company, { refresh }));
    }
    if (p === '/api/health') return sendJson(req, res, 200, { ok: true });
    return sendJson(req, res, 404, { error: `Unknown API route ${p}` });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'Method not allowed' });

  if (p.startsWith('/vendor/leaflet/')) {
    const file = safeJoin(LEAFLET_DIR, p.slice('/vendor/leaflet/'.length));
    if (!file) return sendJson(req, res, 403, { error: 'Forbidden' });
    return serveFile(req, res, file);
  }
  const file = safeJoin(PUBLIC_DIR, p === '/' ? 'index.html' : p.slice(1));
  if (!file) return sendJson(req, res, 403, { error: 'Forbidden' });
  return serveFile(req, res, file);
}

export function createServer({ log = true } = {}) {
  return http.createServer(async (req, res) => {
    const t0 = Date.now();
    if (log) res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0}ms`));
    try {
      await handle(req, res);
    } catch (err) {
      console.error('[server]', err);
      if (!res.headersSent) sendJson(req, res, 500, { error: err.message || 'Internal error' });
      else res.end();
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const port = Number(process.env.PORT) || 5173;
  createServer().listen(port, () => console.log(`melon-seek listening on http://localhost:${port}`));
}

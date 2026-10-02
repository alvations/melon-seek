// PERF-1: the first load of a company must not block the event loop.
// Runs the real pipeline worker (not inline) on real snapshots and probes
// event-loop lag while the first requests are served.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = path.join(ROOT, 'data', 'snapshots');
const have = (s) => fs.existsSync(path.join(SNAP, `${s}.json`));
const skip = !(have('anduril') && have('cohere')) && 'needs committed anduril + cohere snapshots';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-perf-'));
process.env.MELON_CACHE_DIR = path.join(tmp, 'cache');
process.env.MELON_SNAPSHOT_DIR = path.join(tmp, 'snapshots');
process.env.MELON_HISTORY_DIR = path.join(tmp, 'history');
process.env.MELON_BACKTEST_WAIT_MS = '1';
fs.mkdirSync(process.env.MELON_SNAPSHOT_DIR, { recursive: true });

let mod, server, port;
before(async () => {
  if (skip) return;
  const { NORMALIZER_VERSION } = await import('../server/normalize.js');
  // anduril: as scripts/snapshot.js now writes it (current normalizerVersion, no rekey).
  const a = JSON.parse(fs.readFileSync(path.join(SNAP, 'anduril.json'), 'utf8'));
  fs.writeFileSync(path.join(process.env.MELON_SNAPSHOT_DIR, 'anduril.json'), JSON.stringify({ ...a, normalizerVersion: NORMALIZER_VERSION }));
  // cohere: an old snapshot without normalizerVersion (upgraded once, in the worker).
  const c = JSON.parse(fs.readFileSync(path.join(SNAP, 'cohere.json'), 'utf8'));
  delete c.normalizerVersion;
  fs.writeFileSync(path.join(process.env.MELON_SNAPSHOT_DIR, 'cohere.json'), JSON.stringify(c));
  mod = await import('../server/index.js');
  mod.setCompstimateModule(null);
  server = mod.createServer({ log: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

function get(p) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    http.get({ host: '127.0.0.1', port, path: p, headers: { 'accept-encoding': 'gzip' } }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, bytes: Buffer.concat(chunks).length, ms: performance.now() - t0 }));
    }).on('error', reject);
  });
}

/** Max event-loop delay while fn runs (10 ms probe). */
async function withLagProbe(fn) {
  let max = 0;
  let last = performance.now();
  const iv = setInterval(() => { const now = performance.now(); max = Math.max(max, now - last - 10); last = now; }, 10);
  try {
    const result = await fn();
    return { result, maxLag: max };
  } finally {
    clearInterval(iv);
  }
}

test('first company loads do not block the event loop (PERF-1)', { skip, timeout: 180000 }, async () => {
  const { result, maxLag } = await withLagProbe(async () => {
    // Health checks keep arriving while the two boards load for the first time.
    const health = [];
    let stop = false;
    const pinger = (async () => { while (!stop) { health.push((await get('/api/health')).ms); await new Promise((r) => setTimeout(r, 20)); } })();
    const [a, c] = await Promise.all([get('/api/jobs?company=anduril'), get('/api/jobs?company=cohere')]);
    stop = true;
    await pinger;
    return { a, c, health };
  });
  const worstHealth = Math.max(...result.health);
  console.log(`# first loads: anduril ${result.a.ms.toFixed(0)} ms, cohere (rekey) ${result.c.ms.toFixed(0)} ms; max event-loop lag ${maxLag.toFixed(0)} ms; worst /api/health ${worstHealth.toFixed(0)} ms over ${result.health.length} pings`);
  assert.equal(result.a.status, 200);
  assert.equal(result.c.status, 200);
  assert.ok(maxLag < 150, `event loop blocked for ${maxLag.toFixed(0)} ms (goal < 100 ms)`);
  assert.ok(worstHealth < 250, `/api/health took ${worstHealth.toFixed(0)} ms during first loads`);
});

test('stores persist: a restart reuses them (no re-parse, no rekey)', { skip, timeout: 120000 }, async () => {
  const dir = path.join(process.env.MELON_CACHE_DIR, 'store');
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.list.json'));
  assert.ok(names.some((n) => n.startsWith('snap-anduril-')) && names.some((n) => n.startsWith('snap-cohere-')), names.join(', '));
  mod.resetState(); // forget everything in memory, like a restart
  const { result, maxLag } = await withLagProbe(() => get('/api/jobs?company=cohere'));
  console.log(`# cohere after reset: ${result.ms.toFixed(0)} ms, max lag ${maxLag.toFixed(0)} ms`);
  assert.equal(result.status, 200);
  assert.ok(result.ms < 1000, `reload from store took ${result.ms.toFixed(0)} ms`);
  // Details come from the store's description file.
  const list = await new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: '/api/jobs?company=cohere' }, (r) => { let s = ''; r.on('data', (d) => { s += d; }); r.on('end', () => resolve(JSON.parse(s))); }));
  const id = list.jobs[0].id;
  const d = await new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: `/api/job?id=${encodeURIComponent(id)}` }, (r) => { let s = ''; r.on('data', (x) => { s += x; }); r.on('end', () => resolve(JSON.parse(s))); }));
  assert.ok(d.descriptionHtml.length > 100);
});

test('review V15: cold /api/market does not block the event loop', { skip, timeout: 180000 }, async () => {
  mod.resetState();
  const { result, maxLag } = await withLagProbe(() => get('/api/market'));
  console.log(`# cold /api/market ${result.ms.toFixed(0)} ms, max lag ${maxLag.toFixed(0)} ms`);
  assert.equal(result.status, 200);
  assert.ok(maxLag < 150, `event loop blocked for ${maxLag.toFixed(0)} ms`);
  const warm = await get('/api/market');
  assert.ok(warm.ms < 200, `warm /api/market took ${warm.ms.toFixed(0)} ms`);
});

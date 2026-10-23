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
// The snapshot path, never a live fetch: with network (a GitHub runner), a live crawl of Anduril and Cohere
// replaced the snapshots these tests time, and "stores persist" found no snap- store (monthly-refresh run 38972598049).
process.env.MELON_OFFLINE = '1';
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

/**
 * Max event-loop block while fn runs (10 ms probe). A late tick is a block only for the CPU this thread spent in it:
 * on a loaded machine the OS deschedules the process, and the tick comes late with no work done here (171-557 ms of
 * "lag" at load 4-28 that was not this code; qa-suite-beta T-13). process.threadCpuUsage (Node 22.19+, 23.9+) counts
 * this thread only (the pipeline worker is another thread). Without it the probe falls back to wall time.
 * maxWallLag is reported for the log.
 */
async function withLagProbe(fn) {
  const thread = typeof process.threadCpuUsage === 'function';
  const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
  let max = 0;
  let maxWall = 0;
  let last = performance.now();
  let lastCpu = thread ? cpu() : 0;
  const iv = setInterval(() => {
    const now = performance.now();
    const wall = now - last - 10;
    const c = thread ? cpu() : 0;
    const blocked = thread ? Math.min(wall, c - lastCpu) : wall;
    max = Math.max(max, blocked);
    maxWall = Math.max(maxWall, wall);
    last = now;
    lastCpu = c;
  }, 10);
  try {
    const result = await fn();
    return { result, maxLag: max, maxWallLag: maxWall, measure: thread ? 'thread CPU' : 'wall' };
  } finally {
    clearInterval(iv);
  }
}

test('first company loads do not block the event loop (PERF-1)', { skip, timeout: 180000 }, async () => {
  const { result: r0, maxLag, maxWallLag, measure } = await withLagProbe(async () => {
    // Health checks keep arriving while the two boards load for the first time.
    const health = [];
    let stop = false;
    const pinger = (async () => { while (!stop) { health.push((await get('/api/health')).ms); await new Promise((r) => setTimeout(r, 20)); } })();
    const [a, c] = await Promise.all([get('/api/jobs?company=anduril'), get('/api/jobs?company=cohere')]);
    stop = true;
    await pinger;
    return { a, c, health };
  });
  const result = { ...r0, maxWallLag };
  console.log(`# probe: ${measure}; max wall lag ${maxWallLag.toFixed(0)} ms`);
  const worstHealth = Math.max(...result.health);
  console.log(`# first loads: anduril ${result.a.ms.toFixed(0)} ms, cohere (rekey) ${result.c.ms.toFixed(0)} ms; max event-loop block ${maxLag.toFixed(0)} ms; worst /api/health ${worstHealth.toFixed(0)} ms over ${result.health.length} pings`);
  assert.equal(result.a.status, 200);
  assert.equal(result.c.status, 200);
  assert.ok(maxLag < 150, `event loop blocked for ${maxLag.toFixed(0)} ms (goal < 100 ms)`);
  // A health reply waits for the OS as much as for this server: allow the scheduling delay the probe saw.
  const sched = Math.max(0, result.maxWallLag - maxLag);
  assert.ok(worstHealth < 250 + sched, `/api/health took ${worstHealth.toFixed(0)} ms during first loads (allowed 250 ms + ${sched.toFixed(0)} ms of scheduling delay)`);
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
  // A warm reply is served from memory: this thread's CPU for it, not its wall time (201 ms at load 20, 2026-10-23).
  const c0 = typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : null;
  const warm = await get('/api/market');
  const cpuMs = c0 ? (() => { const u = process.threadCpuUsage(c0); return (u.user + u.system) / 1000; })() : warm.ms;
  assert.ok(cpuMs < 200, `warm /api/market took ${cpuMs.toFixed(0)} ms of ${c0 ? 'CPU' : 'wall time'} (${warm.ms.toFixed(0)} ms wall)`);
  assert.ok(warm.ms < 2000, `warm /api/market took ${warm.ms.toFixed(0)} ms`);
});

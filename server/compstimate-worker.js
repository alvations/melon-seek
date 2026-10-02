// Worker thread for product's Compstimate backtest (F3). Node-only; NOT in
// server/lib-modules.js. The backtest is O(n * N) and takes ~5 s for
// Anduril's 2.4k jobs, so it runs off the event loop.
// workerData: { jobs: SlimJob[], opts: { seed, maxN } } -> postMessage({ ok, result | error })
import { parentPort, workerData } from 'node:worker_threads';

try {
  const mod = await import('../public/features/compstimate.js');
  if (typeof mod.backtest !== 'function') {
    parentPort.postMessage({ ok: true, result: null });
  } else {
    parentPort.postMessage({ ok: true, result: mod.backtest(workerData.jobs, workerData.opts) });
  }
} catch (err) {
  parentPort.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
}

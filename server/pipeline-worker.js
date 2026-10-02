// Pipeline worker thread (PERF-1): runs server/pipeline.js#runTask off the
// HTTP event loop. Node-only; not in server/lib-modules.js.
import { parentPort } from 'node:worker_threads';
import { runTask } from './pipeline.js';

parentPort.on('message', async ({ id, task }) => {
  try {
    parentPort.postMessage({ id, ok: true, result: await runTask(task) });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: { message: err && err.message, code: err && err.code, status: err && err.status, name: err && err.name } });
  }
});

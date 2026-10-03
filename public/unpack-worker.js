// melon·seek — parse and normalize a live job-board response off the main thread.
// Used by public/api.js#fetchLiveInBrowser (static mode): a big board (Anduril, ~33 MB
// of JSON) takes seconds of normalizeJobs on a phone. The main thread keeps the
// fetch, the timeout and the error messages; this worker gets the response bytes
// and answers with the same jobs normalizeJobs returns there, or `jobs: null`, in
// which case api.js redoes the work itself (so errors read exactly as before).
// Same-origin module worker: allowed by the CSP (worker-src falls back to script-src 'self').
// Messages: in { id, source, company, buf: ArrayBuffer } -> out { id, jobs|null, droppedKeywords? };
// { ready: true } once the modules below have loaded.
import { BOARD_LISTS } from './api.js';
import { normalizeJobs } from './lib/normalize.js';
import { mapGreenhouseJob } from './lib/sources/greenhouse.js';
import { mapAshbyJob } from './lib/sources/ashby.js';
import { mapLeverJob } from './lib/sources/lever.js';

// normalize.js reads process.env.DEBUG on its error path (as in api.js).
if (typeof globalThis.process === 'undefined') globalThis.process = { env: {} };

const MAPPERS = { greenhouse: mapGreenhouseJob, ashby: mapAshbyJob, lever: mapLeverJob };

/** Board response bytes -> normalized jobs, or null when anything is off. */
export function normalizeBoard(source, company, buf) {
  try {
    const list = BOARD_LISTS[source] && BOARD_LISTS[source](JSON.parse(new TextDecoder().decode(buf)));
    if (!Array.isArray(list) || !MAPPERS[source]) return null;
    return normalizeJobs(list.map(MAPPERS[source]), company);
  } catch {
    return null;
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = ({ data }) => {
    const jobs = data && normalizeBoard(data.source, data.company, data.buf);
    try {
      globalThis.postMessage({ id: data && data.id, jobs, droppedKeywords: jobs && jobs.droppedKeywords || null });
    } catch {
      globalThis.postMessage({ id: data && data.id, jobs: null }); // not cloneable: main thread does it
    }
  };
  globalThis.postMessage({ ready: true });
}

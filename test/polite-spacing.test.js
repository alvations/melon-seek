// Per-host spacing must hold between the requests' actual starts, not only between their booked
// slots. Found by the lead on 2026-10-11: a full `npm test` on a loaded machine sent two requests
// to one host 27 ms apart under a 40 ms minimum ("gaps 27,40" in bigtech-polite.test.js). A timer
// that fires late pushes one request towards the next one's slot; in a real crawl (1 s apart) that
// means two requests to a careers site well under a second apart.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { politeJson, setMinInterval, resetRateLimits } from '../server/sources/polite.js';

const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = realFetch; globalThis.setTimeout = realSetTimeout; setMinInterval(null); resetRateLimits(); });

test('a late timer never brings two requests to one host closer than the minimum interval', async () => {
  setMinInterval(40);
  resetRateLimits();
  const starts = [];
  globalThis.fetch = async () => { starts.push(Date.now()); return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  // The first wait in the run fires 30 ms late, as a timer can on a busy machine.
  let late = true;
  globalThis.setTimeout = (fn, ms, ...rest) => {
    const extra = late && ms > 0 ? 30 : 0;
    if (extra) late = false;
    return realSetTimeout(fn, ms + extra, ...rest);
  };
  await Promise.all([1, 2, 3].map((i) => politeJson(`https://spacing.test/p${i}`)));
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  assert.equal(starts.length, 3);
  assert.ok(gaps.every((g) => g >= 39), `gaps ${gaps}`);
});

// The shared incremental module (server/sources/incremental.js): change signals, the delta
// plan, conditional requests (ETag / Last-Modified, 304), the failed-detail fallback limit,
// per-posting accounting, and that the politeness settings are untouched.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  rowKey, stableStringify, refreshAgeMs, deltaPlan, runDetails, accountPostings, CRAWL_STATE_FORMAT, DETAIL_REFRESH_DAYS,
} from '../server/sources/incremental.js';
import { setMinInterval, resetRateLimits, resetRobots, MIN_INTERVAL_MS, BOT_USER_AGENT } from '../server/sources/polite.js';
import { eightfoldRowKey, EIGHTFOLD_BOARDS } from '../server/sources/eightfold.js';
import { appleRowKey } from '../server/sources/apple.js';
import { BOARDS, serve, crawlOnce } from './incremental-boards.js';

afterEach(() => { setMinInterval(null); resetRateLimits(); resetRobots(); });
const T0 = Date.parse('2026-10-11T06:00:00Z');
const at = (h) => new Date(T0 + h * 3600e3).toISOString();
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-unit-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

test('politeness is unchanged: 1 request/s per host, the same honest User-Agent', () => {
  assert.equal(MIN_INTERVAL_MS, 1000);
  assert.match(BOT_USER_AGENT, /^melon-seek\/0\.2 \(\+https:\/\/alvations\.github\.io\/melon-seek\/; .*about 1 request\/s\)$/);
});

test('rowKey: key order does not matter, any value change does; signals ignore volatile row fields', () => {
  assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"d":3}],"b":1}');
  assert.equal(rowKey({ a: 1, b: 2 }), rowKey({ b: 2, a: 1 }));
  assert.notEqual(rowKey({ a: 1 }), rowKey({ a: 2 }));
  const t = EIGHTFOLD_BOARDS.microsoft;
  const row = { id: 1, name: 'SWE', postedTs: 10, locations: ['Redmond'], solrScore: 0.3, stars: 0 };
  assert.equal(eightfoldRowKey({ ...row, solrScore: 0.9, stars: 4 }, t), eightfoldRowKey(row, t), 'a search score is not an edit');
  assert.notEqual(eightfoldRowKey({ ...row, postedTs: 11 }, t), eightfoldRowKey(row, t), 'postedTs moves on edits');
  const pipe = { id: 'PIPE-1', postingTitle: 'Specialist', postingDate: 'Oct 10, 2026', managedPipelineRole: true };
  assert.equal(appleRowKey({ ...pipe, postingDate: 'Oct 11, 2026' }), appleRowKey(pipe), 'retail pipeline rows are re-stamped every request');
});

test('refreshAgeMs: spread over [days/2, days]; 0 days = never by age', () => {
  const ages = Array.from({ length: 500 }, (_, i) => refreshAgeMs(`id${i}`, 4) / 864e5);
  assert.ok(Math.min(...ages) >= 2 && Math.max(...ages) <= 4);
  assert.ok(Math.max(...ages) - Math.min(...ages) > 1.5, 'spread, not one expiry day');
  assert.equal(refreshAgeMs('x', 0), Infinity);
  assert.equal(DETAIL_REFRESH_DAYS, 4);
});

test('deltaPlan + runDetails: reasons, and a failed detail falls back to the cache only within the refresh limit', async () => {
  const now = T0;
  const prev = { format: CRAWL_STATE_FORMAT, version: 'v1', rows: {
    a: { k: 'ka', d: { x: 'A' }, at: at(-1) },
    b: { k: 'kb', d: { x: 'B' }, at: at(-1) },
    c: { k: 'kc', d: { x: 'C' }, at: at(-1) },
    old: { k: 'ko', d: { x: 'OLD' }, at: at(-24 * 30) },
  } };
  const plan = deltaPlan(prev, { version: 'v1', now });
  const items = [{ id: 'a', key: 'ka' }, { id: 'b', key: 'kb2' }, { id: 'c', key: 'kc' }, { id: 'old', key: 'ko' }, { id: 'n', key: 'kn' }];
  const asked = [];
  const { details, failed } = await runDetails(plan, items, {
    now, failMin: 10,
    request: async (x) => { asked.push(x.id); if (x.id === 'b' || x.id === 'old') throw new Error('HTTP 500'); return { detail: { x: x.id.toUpperCase() } }; },
  });
  assert.deepEqual(asked.sort(), ['b', 'n', 'old'], 'a and c reused; b changed; old past its age; n new');
  assert.deepEqual(details.get('b'), { x: 'B' }, 'b failed: its 1-hour-old cache stands in');
  assert.equal(details.get('old'), null, 'old failed: its 30-day-old cache is beyond the limit, so no detail');
  assert.deepEqual(failed, ['old']);
  assert.deepEqual(plan.counts, { full: 0, new: 1, changed: 1, refresh: 1, reused: 2, notModified: 0, fallback: 1 });
  const st = plan.state();
  assert.equal(st.rows.b.at, at(-1), 'a fallback keeps its old verification time (retried next run)');
  assert.equal(st.rows.n.at, new Date(now).toISOString());
  assert.equal(deltaPlan(prev, { version: 'v2', now }).incremental, false, 'another adapter version: full');
});

test('accountPostings: new, changed, unchanged, absent', () => {
  const a = accountPostings(null, [{ sourceId: '1', t: 1 }, { sourceId: '2', t: 2 }]);
  assert.deepEqual(a.counts, { new: 2, changed: 0, unchanged: 0, absent: 0 });
  const b = accountPostings(a.postings, [{ sourceId: '1', t: 1 }, { sourceId: '3', t: 3 }, { sourceId: '2', t: 9, _raw: { big: true } }].slice(0, 2));
  assert.deepEqual(b.counts, { new: 1, changed: 0, unchanged: 1, absent: 1 });
  assert.deepEqual(b.absent, ['2']);
});

test('conditional requests: a refresh sends If-None-Match, a 304 reuses the cached detail; a 304 sitemap reuses its entries', async () => {
  setMinInterval(0);
  const board = BOARDS.microsoft(8);
  const sent = [];
  const handler = board.handler;
  board.handler = (url, init) => {
    if (!/position_details/.test(url)) return handler(url, init);
    const id = new URL(url).searchParams.get('position_id');
    const etag = `"v-${id}"`;
    if (init.headers['If-None-Match']) { sent.push(init.headers['If-None-Match']); if (init.headers['If-None-Match'] === etag) return new Response(null, { status: 304, headers: { etag } }); }
    const r = handler(url, init);
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', etag } });
  };
  const g = BOARDS.google(5);
  const gh = g.handler;
  let sitemapAsked = 0;
  g.handler = (url, init) => {
    if (!/sitemap\.xml/.test(url)) return gh(url, init);
    sitemapAsked++;
    if (init.headers['If-None-Match'] === '"sm-1"') return new Response(null, { status: 304, headers: { etag: '"sm-1"' } });
    const r = gh(url, init);
    return new Response(r.body, { status: 200, headers: { 'content-type': 'text/xml', etag: '"sm-1"' } });
  };
  const net = serve(board, g);
  try {
    const dir = tmp();
    const state = path.join(dir, 'state');
    const one = await crawlOnce('microsoft', { dir, stateDir: state, when: at(0) });
    const two = await crawlOnce('microsoft', { dir, stateDir: state, when: at(24 * 5) }); // every detail past its age
    assert.equal(sent.length, 8, 'every refresh was conditional');
    assert.equal(two.snap.crawl.notModified, 8);
    assert.deepEqual(two.snap.jobs, one.snap.jobs);
    const g1 = await crawlOnce('google', { dir, stateDir: state, when: at(0) });
    const g2 = await crawlOnce('google', { dir, stateDir: state, when: at(6) });
    assert.equal(sitemapAsked, 2);
    assert.deepEqual(g2.snap.jobs, g1.snap.jobs, 'a 304 sitemap: the previous entries');
  } finally { net.restore(); }
});

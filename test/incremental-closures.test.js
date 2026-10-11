// Closure rules (server/history.js, server/sources/incremental.js, docs/DATA_ARCHIVE.md §9):
//   - a posting is closed when it is absent from a COMPLETE list (x: absent);
//   - a partial list (shorter than the board's own count, or capped) closes nothing for being
//     absent; such postings stay open while seen within UNSEEN_OPEN_DAYS, then close (x: unseen);
//   - a failed list writes nothing: no snapshot change, no ledger change, no state change;
//   - a closure probe (one request to the posting's own detail) closes on 404/410/redirect
//     only (x: gone); a 200 keeps it open;
//   - a posting listed but not published (a failed detail, the cap) stays open.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runSnapshot } from '../scripts/snapshot.js';
import { updateLedger, closureOptions, compactLedger, UNSEEN_OPEN_DAYS } from '../server/history.js';
import { classifyProbe } from '../server/sources/incremental.js';
import { setMinInterval, resetRateLimits, resetRobots } from '../server/sources/polite.js';
import { BOARDS, serve, crawlOnce } from './incremental-boards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
afterEach(() => { setMinInterval(null); resetRateLimits(); resetRobots(); });
const T0 = Date.parse('2026-10-11T06:00:00Z');
const at = (h) => new Date(T0 + h * 3600e3).toISOString();
const day = (d) => at(d * 24);
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-close-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const job = (id) => ({ id: `acme:${id}`, title: `Role ${id}`, department: 'Eng', locations: [{ name: 'Paris' }], postedAt: null, reqId: null });

test('updateLedger: absent from a complete list closes (absent); from a partial list stays open, then unseen; gone closes; listed stays open', () => {
  const all = [1, 2, 3, 4, 5].map(job);
  let l = updateLedger(null, all, day(0));
  // Partial: 4 and 5 missing, nothing closes.
  l = updateLedger(l, all.slice(0, 3), day(1), { complete: false });
  assert.ok(!l.jobs['acme:4'].c && !l.jobs['acme:5'].c, 'a partial list closes nothing');
  // Partial, 5 confirmed gone by a probe; 4 listed but not published (a failed detail).
  l = updateLedger(l, all.slice(0, 3), day(2), { complete: false, gone: ['acme:5'], listed: ['acme:4'] });
  assert.equal(l.jobs['acme:5'].x, 'gone');
  assert.equal(l.jobs['acme:5'].c, day(2));
  assert.ok(!l.jobs['acme:4'].c);
  assert.equal(l.jobs['acme:4'].l, day(2), 'listed: seen now');
  // Partial for longer than UNSEEN_OPEN_DAYS: 4 closes as unseen.
  l = updateLedger(l, all.slice(0, 3), day(3 + UNSEEN_OPEN_DAYS), { complete: false });
  assert.equal(l.jobs['acme:4'].x, 'unseen');
  // Complete list without 3: closed as absent. A reopen clears the reason.
  l = updateLedger(l, all.slice(0, 2), day(20));
  assert.equal(l.jobs['acme:3'].x, 'absent');
  l = updateLedger(l, all.slice(0, 3), day(21));
  assert.equal(l.jobs['acme:3'].c, undefined);
  assert.equal(l.jobs['acme:3'].x, undefined, 'reopened: no close reason');
  // closureOptions from a snapshot.
  assert.deepEqual(closureOptions({ capped: { kept: 1, total: 2 } }).complete, false);
  assert.deepEqual(closureOptions({ crawl: { list: { complete: false } } }).complete, false);
  assert.deepEqual(closureOptions({ crawl: { list: { complete: true }, gone: ['a:1'], unpublished: ['a:2'] }, listed: ['a:3'] }), { complete: true, listed: ['a:2', 'a:3'], gone: ['a:1'] });
});

test('classifyProbe: 404/410/redirect away = gone; 2xx = alive; anything else unknown', () => {
  const u = 'https://jobs.example.com/careers/job/12';
  assert.equal(classifyProbe(404, null, u), 'gone');
  assert.equal(classifyProbe(410, null, u), 'gone');
  assert.equal(classifyProbe(302, '/careers?error=closed', u), 'gone');
  assert.equal(classifyProbe(301, '/careers/job/12/', u), 'unknown', 'a redirect to the same posting');
  assert.equal(classifyProbe(200, null, u), 'alive');
  for (const s of [403, 429, 500, 503]) assert.equal(classifyProbe(s, null, u), 'unknown');
});

test('a short list (Microsoft lists fewer than it counts) closes nothing for being absent; probes close only confirmed ones', async () => {
  setMinInterval(0);
  const board = BOARDS.microsoft(20);
  const net = serve(board);
  try {
    const dir = tmp();
    const state = path.join(dir, 'state');
    await crawlOnce('microsoft', { dir, stateDir: state, when: at(0) });
    const ids = board.ids();
    // Two postings drop out of the list but still exist; one more is really closed.
    board.absentButOpen.add(ids[4]);
    board.absentButOpen.add(ids[6]);
    board.close(ids[9]);
    const two = await crawlOnce('microsoft', { dir, stateDir: state, when: at(6) });
    assert.equal(two.snap.crawl.list.complete, false, 'listed 17 of the 19 counted');
    assert.deepEqual(two.snap.crawl.gone, [`microsoft:${ids[9]}`], 'the closed one: its detail is a 404');
    const e = (id) => two.ledger.jobs[`microsoft:${id}`];
    assert.ok(!e(ids[4]).c && !e(ids[6]).c, 'still open (probe 200), missing from a short list');
    assert.equal(e(ids[9]).x, 'gone');
    assert.equal(two.result.history.unseen, 2);
    // Probes off: nothing closes even when gone, until UNSEEN_OPEN_DAYS.
    board.close(ids[4]);
    const three = await crawlOnce('microsoft', { dir, stateDir: state, when: at(12), probeLimit: 0 });
    assert.ok(!three.ledger.jobs[`microsoft:${ids[4]}`].c, 'no probe, partial list: kept open');
    const late = await crawlOnce('microsoft', { dir, stateDir: state, when: day(UNSEEN_OPEN_DAYS + 1), probeLimit: 0 });
    assert.equal(late.ledger.jobs[`microsoft:${ids[4]}`].x, 'unseen');
  } finally { net.restore(); }
});

test('a failed list (a 403 mid-board) writes nothing: the snapshot, the ledger and the crawl state stay as they were', async () => {
  setMinInterval(0);
  const board = BOARDS.nvidia(30);
  const net = serve(board);
  try {
    const dir = tmp();
    const state = path.join(dir, 'state');
    await crawlOnce('nvidia', { dir, stateDir: state, when: at(0) });
    const files = ['snap/nvidia.json', 'hist/nvidia.json', 'state/nvidia.json.gz'].map((f) => path.join(dir, f));
    const before = files.map((f) => fs.readFileSync(f));
    const handler = board.handler;
    board.handler = (url, init) => (/\/api\/pcsx\/search/.test(url) && /start=10\b/.test(url) ? new Response('blocked', { status: 403 }) : handler(url, init));
    const r = await runSnapshot(['nvidia'], { outDir: path.join(dir, 'snap'), historyDir: path.join(dir, 'hist'), crawlStateDir: state, now: () => at(6), log: () => {}, error: () => {}, parallelBeta: false });
    assert.equal(r.failed, 1);
    files.forEach((f, i) => assert.ok(fs.readFileSync(f).equals(before[i]), `${path.basename(f)} unchanged`));
  } finally { net.restore(); }
});

test('Google: a record request that fails is listed but unpublished, and stays open in the ledger', async () => {
  setMinInterval(0);
  const board = BOARDS.google(12);
  const net = serve(board);
  try {
    const dir = tmp();
    const r1 = await crawlOnce('google', { dir, stateDir: null, when: at(0) });
    assert.equal(r1.snap.jobs.length, 12);
    const bad = board.ids()[3];
    const handler = board.handler;
    board.handler = (url, init) => (/batchexecute/.test(url) && String(init && init.body).includes(bad) ? new Response('no', { status: 403 }) : handler(url, init));
    const r2 = await crawlOnce('google', { dir, stateDir: null, when: at(6) });
    assert.equal(r2.snap.jobs.length, 11);
    assert.deepEqual(r2.snap.crawl.unpublished, [`google:${bad}`]);
    const e = r2.ledger.jobs[`google:${bad}`];
    assert.ok(!e.c, 'not closed: it is in the sitemap');
    assert.equal(e.l, at(6));
  } finally { net.restore(); }
});

test('Amazon uncapped: every listed posting is published and in the ledger, through the beta merge too', async () => {
  // 2026-10-11, the user: "Why are you capping the no of posting we must present them as they are and not cut anything".
  setMinInterval(0);
  const board = BOARDS.amazon(40);
  const net = serve(board);
  try {
    const dir = tmp();
    const state = path.join(dir, 'state');
    const one = await crawlOnce('amazon', { dir, stateDir: state, when: day(0) });
    assert.equal(one.snap.jobs.length, 40, 'the whole board');
    assert.equal(one.snap.jobsCapped, undefined, 'no cap record');
    const late = await crawlOnce('amazon', { dir, stateDir: state, when: day(UNSEEN_OPEN_DAYS + 6) });
    assert.equal(late.snap.jobs.length, 40);
    const open = Object.entries(late.ledger.jobs).filter(([, e]) => !e.c).map(([id]) => id);
    assert.equal(open.length, 40, 'every posting has an open entry');
    // DQ-38 (fix wave 5): only published postings are served; with no cap, that is all of them.
    assert.equal(Object.values(late.ledger.jobs).filter((e) => e.u).length, 0, 'none marked unpublished');
    // The beta merge reads the same crawl's listed ids from the crawl state.
    const data = path.join(dir, 'beta');
    const fresh = path.join(dir, 'snap');
    fs.mkdirSync(path.join(data, 'history'), { recursive: true });
    fs.copyFileSync(path.join(dir, 'hist', 'amazon.json'), path.join(data, 'history', 'amazon.json'));
    const out = execFileSync(process.execPath, [path.join(ROOT, '.github/scripts/beta-snapshots.mjs'), 'merge', fresh, data, state], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
    assert.match(out, /amazon \| \*\*fresh\*\* \| 40 \|/);
    const merged = read(path.join(data, 'history', 'amazon.json'));
    assert.equal(Object.values(merged.jobs).filter((e) => !e.c).length, 40);
    assert.equal(Object.keys(compactLedger(merged)).length, 40);
  } finally { net.restore(); }
});

test('Apple: a listing absent from a short search is probed through jobDetails; a 404 closes it', async () => {
  setMinInterval(0);
  const board = BOARDS.apple(15);
  const net = serve(board);
  try {
    const dir = tmp();
    const state = path.join(dir, 'state');
    await crawlOnce('apple', { dir, stateDir: state, when: at(0) });
    const ids = board.ids();
    board.close(ids[2]);
    board.absentButOpen.add(ids[7]); // totalRecords 14, 13 listed: a short list
    const two = await crawlOnce('apple', { dir, stateDir: state, when: at(6) });
    assert.equal(two.snap.crawl.list.complete, false);
    assert.equal(two.ledger.jobs[`apple:${ids[2]}`].x, 'gone');
    assert.ok(!two.ledger.jobs[`apple:${ids[7]}`].c);
  } finally { net.restore(); }
});

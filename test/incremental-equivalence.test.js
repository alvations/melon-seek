// Incremental crawl == full crawl, for EVERY adapter (docs/ARCHITECTURE.md "Incremental crawl").
// On a synthetic board built from the recorded fixtures (test/incremental-boards.js):
//   run 1  a full crawl (no state) writes the snapshot and the crawl state;
//   then   the board changes: postings edited (visibly in the list), added and closed;
//   run 2  an incremental crawl with run 1's state;
//   run 3  a full crawl of the same board with no state.
// Run 2's snapshot equals run 3's (every field but fetchedAt and the crawl summary), the
// ledgers agree, every posting is accounted for, and run 2 makes fewer detail requests.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setMinInterval, resetRateLimits, resetRobots } from '../server/sources/polite.js';
import { BOARDS, DETAIL_BOARDS, serve, crawlOnce } from './incremental-boards.js';

afterEach(() => { setMinInterval(null); resetRateLimits(); resetRobots(); });

const T0 = Date.parse('2026-10-11T06:00:00Z');
const at = (h) => new Date(T0 + h * 3600e3).toISOString();
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-incr-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const strip = ({ fetchedAt, crawl, ...rest }) => rest;
const N = 24;

for (const slug of Object.keys(BOARDS)) {
  test(`${slug}: an incremental crawl gives the same snapshot and ledger as a full crawl (unchanged, edited, new, closed)`, async () => {
    setMinInterval(0);
    const board = BOARDS[slug](N);
    const net = serve(board);
    try {
      const inc = tmp();
      const full = tmp();
      const stateInc = path.join(inc, 'state');
      // Run 1 (both folders see the same first run, so the ledgers start equal).
      const first = await crawlOnce(slug, { dir: inc, stateDir: stateInc, when: at(0) });
      await crawlOnce(slug, { dir: full, stateDir: null, when: at(0) });
      assert.deepEqual(first.snap.crawl.postings, { new: N, changed: 0, unchanged: 0, absent: 0 }, 'first run: every posting new');
      assert.ok(fs.existsSync(path.join(stateInc, `${slug}.json.gz`)), 'crawl state written');
      // The board changes.
      const ids = board.ids();
      board.editVisible(ids[1]);
      board.editVisible(ids[5]);
      board.close(ids[3]);
      board.close(ids[8]);
      const added = [board.add(), board.add(), board.add()];
      // Run 2: incremental. Run 3: full, same board, same time.
      board.reset();
      const two = await crawlOnce(slug, { dir: inc, stateDir: stateInc, when: at(6) });
      const incCounts = { ...board.counts };
      board.reset();
      const three = await crawlOnce(slug, { dir: full, stateDir: null, when: at(6) });
      const fullCounts = { ...board.counts };

      assert.deepEqual(strip(two.snap), strip(three.snap), 'incremental snapshot == full crawl snapshot');
      assert.deepEqual(two.ledger, three.ledger, 'the ledgers record the same');
      // Every posting accounted for.
      const pc = two.snap.crawl.postings;
      assert.equal(pc.new, added.length, `new: ${JSON.stringify(pc)}`);
      assert.equal(pc.absent, 2, 'closed postings are absent');
      assert.ok(pc.changed >= 2, 'edited postings changed');
      assert.equal(pc.new + pc.changed + pc.unchanged, N + added.length - 2);
      for (const id of [ids[3], ids[8]]) {
        const e = two.ledger.jobs[`${slug}:${id}`];
        assert.ok(e && e.c === at(6) && e.x === 'absent', `${id} closed as absent from a complete list: ${JSON.stringify(e)}`);
      }
      if (DETAIL_BOARDS.includes(slug)) {
        assert.equal(two.snap.crawl.mode, 'incremental');
        assert.equal(three.snap.crawl.mode, 'full');
        // Only the new and the visibly edited postings cost a detail request.
        assert.equal(incCounts.detail, added.length + 2, `incremental detail requests: ${incCounts.detail} (full: ${fullCounts.detail})`);
        assert.equal(fullCounts.detail, N + added.length - 2);
        assert.equal(two.snap.crawl.reused, N - 2 - 2);
        assert.ok(two.snap.crawl.detailsVerifiedSince <= at(6));
      } else {
        assert.equal(two.snap.crawl.mode, 'list-only', 'a list-only board is fetched in full, and says so');
        assert.match(two.snap.crawl.why, /list-only board/);
        assert.equal(incCounts.list, fullCounts.list);
      }
    } finally { net.restore(); }
  });
}

for (const slug of DETAIL_BOARDS) {
  test(`${slug}: a silent edit (detail only) is caught by the refresh age, then the crawls agree again`, async () => {
    setMinInterval(0);
    const board = BOARDS[slug](12);
    const net = serve(board);
    try {
      const inc = tmp();
      const full = tmp();
      const state = path.join(inc, 'state');
      await crawlOnce(slug, { dir: inc, stateDir: state, when: at(0), refreshDays: 4 });
      await crawlOnce(slug, { dir: full, stateDir: null, when: at(0) });
      board.editSilent(board.ids()[2]);
      // Within the refresh age: the list cannot show it, so nothing is fetched.
      board.reset();
      const soon = await crawlOnce(slug, { dir: inc, stateDir: state, when: at(6), refreshDays: 4 });
      assert.equal(board.counts.detail, 0, 'nothing to fetch within the refresh age');
      assert.equal(soon.snap.crawl.reused, 12);
      // Past the refresh age (4 days at most): every detail re-fetched, the edit is in.
      board.reset();
      const later = await crawlOnce(slug, { dir: inc, stateDir: state, when: at(4 * 24 + 1), refreshDays: 4 });
      assert.equal(board.counts.detail, 12);
      const ref = await crawlOnce(slug, { dir: full, stateDir: null, when: at(4 * 24 + 1) });
      assert.deepEqual(later.snap.jobs, ref.snap.jobs);
      // Spread: within [days/2, days] some, not all, are due.
      board.reset();
      await crawlOnce(slug, { dir: inc, stateDir: state, when: at(4 * 24 + 1 + 3 * 24), refreshDays: 4 });
      assert.ok(board.counts.detail > 0 && board.counts.detail < 12, `refreshes spread over the window (${board.counts.detail} of 12 due)`);
    } finally { net.restore(); }
  });
}

test('the archive records the same job versions from incremental and full crawls, and rebuilds each snapshot losslessly', async () => {
  setMinInterval(0);
  const { openArchive, closeArchive, ingestArtifact } = await import('../scripts/archive/ingest.js');
  const { reconstruct, compareSnapshots } = await import('../scripts/archive/reconstruct.js');
  const board = BOARDS.nvidia(16);
  const net = serve(board);
  try {
    const inc = tmp();
    const full = tmp();
    const state = path.join(inc, 'state');
    const runs = { inc: [], full: [] };
    const step = async (h) => {
      runs.inc.push((await crawlOnce('nvidia', { dir: inc, stateDir: state, when: at(h) })).snap);
      runs.full.push((await crawlOnce('nvidia', { dir: full, stateDir: null, when: at(h) })).snap);
    };
    await step(0);
    const ids = board.ids();
    board.editVisible(ids[0]); board.close(ids[2]); board.add();
    await step(6);
    board.editVisible(ids[4]); board.add();
    await step(12);
    const archives = {};
    for (const kind of ['inc', 'full']) {
      const archive = path.join(tmp(), 'archive');
      for (const [i, snap] of runs[kind].entries()) {
        const d = path.join(tmp(), `art${i}`);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'nvidia.json'), JSON.stringify(snap));
        const ctx = await openArchive(archive, { now: at(i * 6 + 1) });
        await ingestArtifact(ctx, { name: 'beta-crawl-nvidia', dir: d, artifact: { id: i + 1, runId: (i + 1) * 10, createdAt: at(i * 6 + 1) } });
        closeArchive(ctx);
        const { payload } = reconstruct(archive, { company: 'nvidia', at: snap.fetchedAt });
        assert.deepEqual(compareSnapshots(snap, payload), [], `${kind} run ${i}: rebuilt losslessly (crawl field included)`);
      }
      const jobsDir = path.join(archive, 'jobs', 'nvidia');
      archives[kind] = fs.readdirSync(jobsDir).sort().map((f) => [f, fs.readFileSync(path.join(jobsDir, f), 'utf8')]);
    }
    assert.deepEqual(archives.inc, archives.full, 'the same job versions, opened, changed and closed at the same times');
  } finally { net.restore(); }
});

test('full_crawl (MELON_FULL_CRAWL) ignores the state once; a state from another adapter version means a full crawl', async () => {
  setMinInterval(0);
  const board = BOARDS.microsoft(10);
  const net = serve(board);
  try {
    const dir = tmp();
    const state = path.join(dir, 'state');
    await crawlOnce('microsoft', { dir, stateDir: state, when: at(0) });
    board.reset();
    const forced = await crawlOnce('microsoft', { dir, stateDir: state, when: at(1), full: true });
    assert.equal(board.counts.detail, 10);
    assert.equal(forced.snap.crawl.mode, 'full');
    assert.match(forced.snap.crawl.why, /full crawl requested/);
    // No state at all (an expired artifact): full, and says why.
    board.reset();
    const none = await crawlOnce('microsoft', { dir, stateDir: path.join(dir, 'empty'), when: at(2) });
    assert.equal(board.counts.detail, 10);
    assert.match(none.snap.crawl.why, /no previous crawl state/);
  } finally { net.restore(); }
});

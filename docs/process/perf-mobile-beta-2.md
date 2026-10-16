# Process log: perf-mobile-beta-2

## State

Updated 2026-10-16 19:00. Worktree `.claude/worktrees/agent-a7425c5dcd4e39cbe`, detached, rebased on f254143
(the lead's head with part 1 integrated). **Finished.** Code head 7bb9e5c; log commits after it.

- **Part 1 (integrated by the lead):** no posting dropped; melon-packed-3; Juice slices; trim fixes (VT-22,
  SA-7); tests; 22,179 record in 5.3.
- **Part 2, done and tested (commits a9cb193 … 7bb9e5c, see 7):** first-page preview for boards of 10,000+
  (Amazon), config.js asks for it first, `getPreview`, app.js shows it; shorter tasks after the list
  (sliced unpack, lazy keyword facets, first render in three tasks); check-lists.mjs reads previews.
  Identity: getJobs on f254143 vs head identical for all 23 lists; the previews equal getJobs' postings.
  CI's steps on a no-data build: 0 problems, npm test 1,110 / 1,064 pass / 0 fail; full e2e 358/362, 0
  failed.
- **Record (5.6):** Amazon's first cards 7.5 → **2.0 s** on Fast 4G and 18.5 → **5.0 s** on Slow 4G, longest
  task 1.0-1.1 s → 0.49 s; Apple 3.0 → 2.9 s / 8.1 → 7.4 s; main site (Anduril) the same within noise
  (paired +0.10 s over 10 swapped rounds) with TBT 1.29 → 0.94 s; Google 8.6 → 8.5 s Slow 4G.
- Scratch builds deleted; nothing left running.

## 1. Brief

Prompt: [prompts/perf-mobile-beta-2.md](prompts/perf-mobile-beta-2.md), verbatim, with the lead's note of 2026-10-11.

Goal: measure the beta site (`/melon-seek/beta/`) on a mid-range phone with all 7 big-tech boards, Amazon
first, and fix the biggest costs, keeping the app simple and what `getJobs` returns exactly the same.
Mid-task the lead relayed the user: **"Why are you capping the no of posting we must present them as
they are and not cut anything"**. So: no posting is ever dropped, and the target became Amazon's whole
board (about 22,415 postings) plus every other board uncut. Part 2 (2026-10-16, the lead): on Amazon's
22,179 postings at 390×844, 4x CPU, Fast 4G, the first cards visible and scrollable within about 3 s, the
chart following without blocking input, Apple and the main site not regressing.

Files owned:
- `public/api.js`, `public/unpack-worker.js` (unchanged), `scripts/build-static.js`;
- since the lead's message: Amazon's entry in `server/companies.js`, `scripts/snapshot.js#fitSnapshot`,
  and the tests and docs that described the posting budget;
- `test/perf-mobile-beta-2.test.js`, `test/fixtures/packed-2-reference.js` (new);
- `docs/process/scripts/perf-mobile-beta-2*.mjs` (harness copy, identity checks);
- `docs/process/patches/perf-mobile-beta-2-*.diff` (for files QA agents are testing; not applied);
- part 2: `public/app.js` (the prepare and first-render path only), `server/juice.js` / `lib/juice.js`
  (Juice computation; not changed in the end), `.github/scripts/check-lists.mjs` (the preview checks);
- this log and the prompt (the lead's follow-ups are appended to it).

Worktree `/home/user/melon-seek/.claude/worktrees/agent-a7425c5dcd4e39cbe`, detached at 31ad25b, rebased
onto e48fd32, 2474fc4 and f254143 as the lead integrated.

## 2. Inputs and sources

- `docs/process/perf-mobile-beta.md` (first beta pass: early list fetch, `shared.vetted`, deferred role
  families, its harness and identity checks), `docs/process/perf-mobile.md`, `docs/process/mobile.md`,
  `docs/process/amazon-meta-backend.md` (the 22,415-posting synthetic board and its measurements: first card
  10.5 s on Fast 4G at 4x CPU), `docs/CONTRACT.md` (packed lists, lazy descriptions), PLAYBOOK, TEMPLATE.
- Code read: `scripts/build-static.js` (`packList`, `splitPayload`, `betaLeaks`), `public/api.js`
  (`unpackJobs`, `bundled`, `getJobs`, `withJuice`), `public/unpack-worker.js`, `server/juice.js`
  (`attachJuice`, what it reads), `public/app.js` (`prepare`, `derive`, `paintWindow`, load path),
  `public/features/roles.js`, `scripts/snapshot.js`, `server/companies.js`, `server/history.js`,
  `.github/scripts/beta-snapshots.mjs`, `scripts/external-links.js`, `test/amazon-meta-synth.js`.
- Data: today's crawl (Amazon 5,000, Apple 4,874, Google 3,415, NVIDIA 2,662, Microsoft 2,285, Meta 1,139,
  Netflix 457) and, for the whole Amazon board, `node test/amazon-meta-synth.js --meta 0` (22,415
  synthetic postings through the real adapter, normalizer and `runSnapshot`, as amazon-meta-backend.md did).
- Tooling: Playwright from the scratchpad, Chromium 141 (`/opt/pw-browsers/chromium-1194`), DevTools network
  presets (Fast 4G 165 ms / 1.01 MB/s; Slow 4G 562.5 ms / 180 kB/s).

## 3. Findings and decisions

### Findings

Items 1-6: baseline at 31ad25b on the 2026-10-11 crawl (Amazon capped at 5,000), Fast 4G, quiet machine.
Item 7: the 2026-10-16 crawl with Amazon whole (22,179), baseline 2474fc4.

1. **Amazon (5,000) was the heaviest board**: first card 6.9 s, TBT 4.1 s, list 471 kB gzip / 3.05 MB raw.
   Apple 7.2 s. From the trace (Amazon, one run): list arrives at 1.8 s; `JSON.parse` 0.26 s; `unpackJobs`
   0.31 s; **Juice 1.3 s** in 400-job chunks of 100-290 ms each; app.js `prepare` 0.7 s (chunked;
   `readableTitle` 0.17 s of it); first render one 1.2 s task (`derive` 0.44 s, `paintWindow` 0.33 s,
   sort 0.09 s); chart 0.35 + 0.2 s; role families after paint in 30 ms slices.
2. **What makes Amazon's list big** (field shares, `tools/fields.mjs`): salary 1.14 MB raw / 164 kB gzip
   (2,281 salaries carry extra keys, so they were not tuples, and 1,226 carry `ranges`, 4,346 range
   objects with all their key names), keywords 373 kB / 93 kB, url 325 kB / 87 kB (`<id>/<title slug>`,
   lower case, which gzip cannot match against the title), title 299 kB / 80 kB, and the key names of
   every job (about 0.5 MB raw).
3. **The whole Amazon board** (synthetic 22,415, built as amazon-meta-backend.md did): list 10.87 MB raw /
   740 kB gzip; first card 9.0 s on Fast 4G (one run; the backend's busier-machine median was 10.5 s);
   parse 0.55 s, unpack 0.62 s, Juice 2.1 s, prepare 1.5 s, first render 1.5 s, chart 0.7 + 0.6 s; heap
   78 MB after load.
4. **Interactions** (Fast 4G, Amazon 5,000): drawer 1.1 s (longest task 0.6 s), filter 1.4 s / 0.5 s,
   sort 0.5 s / 0.45 s, **Insights 4.2 s / 3.8 s**, map 2.2 s / 1.5 s.
5. **No idle CPU** (7-12 ms of tasks in 10 s), **no leak**: 10 switches cycling Amazon, Google, NVIDIA,
   Microsoft and Apple, heap after GC 15 → 46.7 MB (the 3-list LRU filling), then flat; DOM 821-896 nodes;
   97 listeners.
6. **Startup bytes**: 24 JS requests 377 kB, 4 CSS 40 kB, 1 font 48 kB, companies + cities 30 kB.
7. **Amazon whole (22,179, 2026-10-16 crawl)**: snapshot 97.8 MB (descriptions at 800 characters, every
   posting kept), list 10.90 MB raw / **1.68 MB gzip** (Slow 4G: about 9.5 s of transfer alone); first card
   7.8 s on Fast 4G and **18.4 s on Slow 4G** (medians of 3, load 2-2.5); heap after load 68-82 MB.
   Apple (4,851) 3.5 s / 8.1 s. On Fast 4G Amazon is CPU-bound: after the list lands, parse and unpack
   about 1.1 s, Juice about 2 s, app.js `prepare` about 1.5 s, the first render about 1.4 s and the chart
   about 1.4 s, all at 4x CPU (synthetic-board trace; the real board's shape is the same).

### Decisions

1. **No posting is ever dropped** (the user's words, above). `server/companies.js` has no `maxPostings`
   (the quote is recorded next to Amazon's entry); `scripts/snapshot.js#fitSnapshot` trims descriptions
   toward the 40 MB target as before and, when a board is still over at the shortest trim, writes it over
   the target with every posting (Amazon synthetic: 86 MB at 800 characters). It never caps; `capped` is
   always null, and the ledger's partial-list rules stay (a short list closes nothing). Older archived
   snapshots with `jobsCapped` are still read as partial. Tests rewritten: `amazon-meta-fit`,
   `bigtech-polite`, `beta-methodology` (MR-5, MR-14), `incremental-closures` (Amazon now uncapped).
   Docs: DATA_SOURCES, AMAZON_META, README, lead.md, CONTRACT, ARCHITECTURE, the freshness registry
   (and DATA_FRESHNESS.md regenerated). Description trimming stays: it keeps every posting and the
   posting page has the full text (a question for the user, section 6). Two trim fixes from other lanes
   are applied here, since this lane owns snapshot.js: fix5-data's VT-22 (every pay-table row and the
   sentence above it survive trimming; the VT-22 test is no longer a to-do) and salary-audit-data's SA-7
   (pay paragraphs in £, € and zł, and "pay rate" / "per hour" lines survive). Trimming now never drops a
   posting, a pay row or a pay paragraph.
2. **melon-packed-3 lists** (`build-static.js#packList`, `api.js#unpackJobs`), lossless, each encoding
   used only where the build checked it reverses exactly:
   - a job whose keys are the list's usual keys in order is a value array (`shared.rowKeys`);
   - a salary with extra keys after the usual ones is the tuple plus an object of the extras;
     `salary.text` is a dictionary index; a pay range with the usual keys is a tuple with its currency,
     interval and label as indexes (`shared.rangeKeys`);
   - a url equal to the list's template filled in is `0` (`shared.urlTemplate`, e.g.
     `https://www.amazon.jobs/en/jobs/{id}/{slug}`, with `{slug}` only for ASCII titles, so the browser's
     lower-casing cannot differ from Node's). Found per list, not per board: Amazon, Apple, NVIDIA,
     Microsoft, Meta, Netflix, Anduril get one; Google's urls keep their own form.
   Decoding is as fast as the old format's despite the extra steps: rows are filled into a copy of a
   blank object that already has every key the job gets (one fixed layout), salary tuples likewise, and
   the ISO strings of `ts` columns are made once per distinct value. **The build packs every list both
   ways and fails unless melon-packed-3 unpacks to exactly what melon-packed-2 did, key order included.**
   The 1.5 MB list budget is still measured in melon-packed-2 bytes, so the same lists move their
   sections to the description files (getJobs returns the same). `betaLeaks` and
   `scripts/external-links.js#jobUrls` decode the new format.
   google-grouping's `google-grouping-pack.diff` (brand and departmentBasis as dict columns) is not
   applied: under melon-packed-3 the row arrays already drop those key names (most of its 150 kB), and as
   columns both fields would move in the unpacked job's key order (columns are appended after the row
   keys). The build's both-ways check covers any field, and the test board carries both.
3. **Juice in time slices** (`api.js#withJuice`): `attachJuice` per job, yielding every 40 ms, instead of
   400-job chunks (100-290 ms each on Amazon). Same per-job calls, so the same result.
4. **Tried and dropped:**
   - *Juice once per distinct (salary, locations)*: 77% of Amazon's 22,415 repeat one, but copying a
     3.4 kB juice object (`structuredClone`) cost more than working it out again, and keying by the JSON
     of the two values cost as much as the saved work (withJuice 2.2 s against 2.1 s in the browser).
     Sharing the objects instead would make postings alias one juice object; not worth that for ~0.3 s.
   - *Unpack and Juice in the worker*: handing 22,415 juiced jobs back is a 60 MB structured clone,
     0.66 s to deserialize in Node (one task), about the main-thread work it would save.
   - *A first-paint list with the rest streamed*: the cards, chart, counts and filters need every job,
     so the page would show partial counts first; not behaviour-identical.
5. **Patch for another owner** (not applied; QA agents are testing `public/features/*`):
   `docs/process/patches/perf-mobile-beta-2-readable-title-memo.diff` memoizes `roles.js#readableTitle`
   (pure; once per posting in `prepare`, before the first card), like `expandTitle`'s memo. Checked
   identical on 96,422 titles (`perf-mobile-beta-2-title-check.mjs`). Measured on the 22,179 board
   (5.3): no difference above noise (first card 6.7 → 6.9 s Fast 4G, 15.7 → 15.6 s Slow 4G), so it is
   optional; its gain is under 0.1 s.
6. **Part 2: a first-page preview** (`build-static.js#previewList`, `api.js#getPreview`, app.js
   `showPreview`). On Fast 4G the whole Amazon list lands at about 2.5 s (1.14 MB sharing 1 MB/s with
   the app's own files) and the work after it (parse, unpack, Juice, prepare, first render) takes about
   4 s at 4x CPU, so no change to that path alone gets the first cards near 3 s. The first screen of the
   default view needs only about 100 postings, so the build writes them:
   - `api/preview/<slug>.json` for boards of 1,000+ postings whose list is `shared.vetted`: every posting
     whose pay mid (app.js#prepare's `_usd.mid`, `previewPay`) is at least the 100th highest, ties
     included, so it is exactly a prefix of the Highest-pay order whatever the tie-breaks (app.js sorts
     by mid, then max, then title); a board with fewer paid postings adds its first unpaid ones in board
     order. Same packed format (40-96 kB raw, about 10-15 kB gzip), plus `preview.total` and the whole
     board's postings with pay per department (`colorCounts`, what computeColorKeys counts). The build
     checks they unpack to the list's own postings.
   - config.js requests it before the list (`previewPreloadJs`, `window.MELON_PREVIEWS` lists the boards
     that have one, so others are never asked for: no 404s);
   - `getPreview` returns those postings juiced as getJobs juices them (full-scale check: the 8 previews of
     the 2026-10-16 crawl equal getJobs' postings, JSON and key order);
   - app.js, only for the default view (Highest pay, no filter, search, area or saved search, colour by
     department), prepares and sorts them with the same code, takes the colour keys from the counts and
     the "New" marks from the last visit (read, not recorded), and draws them as the list: "Loading
     22,179 roles…", cards with `data-preview-id` (so code and tests that wait for `.card[data-id]` still
     wait for the list), `aria-setsize` the board's size. A tapped card opens when the list is in. The
     list then replaces them; when its first cards are the preview's (always, in every run), it keeps
     the place (`win.keep`). Nothing is hidden or cut: the whole list still loads and replaces it.
7. **Part 2: shorter tasks after the list lands**, same results: the bundled unpack runs in 40 ms slices
   (`unpackJobsSliced`, the same per-job decoder); derive counts the keyword facets (the filter panel's
   keyword lists only) on first read, the same jobs in the same order; the first render after a load is
   three tasks (derive, sort, draw; `renderInTwo`, a render in between wins); a yield after
   disambiguateLocations. Amazon's longest task 1.0-1.1 s → about 0.5 s (derive itself).
8. **Part 2, measured and not done:** Juice on the visible cards first (a lazy Juice): the cards, the
   Juice filter's counts and the chart colours need every posting's Juice at the first render, so it
   would change what the first render shows; the preview covers the wait instead. Chart time (two tasks
   of about 0.4 s and 0.3 s on Amazon at 4x) is viz-even's (numbers sent).
9. **Method**: `docs/process/scripts/perf-mobile-beta-2.mjs` is perf-mobile-beta.mjs with Amazon and Meta
   (switch Amazon ↔ Apple, Meta → Google, Netflix and Anduril → Amazon; the leak cycle adds Amazon),
   (and, for part 2, a `preview` mark: the frame after the first `.card[data-preview-id]`, and
   `previewMatch`: the preview's first 30 cards are the list's first 30),
   otherwise unchanged: 390×844, isMobile, touch, DPR 3, 4x CPU, CDP network presets, `serve.mjs`,
   trace-based long tasks with CPU-profile attribution. Every timing records the load average. The
   2026-10-11 baseline matrix ran alone (load 0.3-2); from 21:08 that day and through 2026-10-16 other
   lanes kept the load at 4-12, so the 22,179 record is **interleaved**: three rounds of base, head and
   head + patch, each run started at a 1-minute load under 2.5 and recorded with its load
   (`tools/timed3.sh`, merged by `perf-mobile-beta-2-merge.mjs`). Base and head saw the same load.

## 4. Replayable steps

```sh
SP=<scratch>/perf-mobile-beta-2; export NODE_PATH=<scratch>/pw/node_modules   # never `playwright install`
git checkout --detach 31ad25b
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
node scripts/build-static.js --out $SP/dist-before           # before any edit: 175 s
# the whole Amazon board, synthetic (no network), with the uncapped snapshot.js:
node test/amazon-meta-synth.js --out $SP/synth --meta 0       # 22,415 postings, 86 MB, every one kept
mkdir $SP/snap-full; ln -s data/beta/snapshots/{apple,google,meta,microsoft,netflix,nvidia}.json $SP/snap-full/; ln -s $SP/synth/amazon.json $SP/snap-full/
git archive 31ad25b | tar -x -C $SP/old-tree                  # + node_modules and data/snapshots links
# pinned builds (MELON_BUILT_AT=2026-10-11T12:00:00.000Z GITHUB_SHA=pinned MELON_BETA_SNAPSHOT_DIR=$SP/snap-full):
(cd $SP/old-tree && node scripts/build-static.js --out $SP/dist-before-full)    # 201 s
node scripts/build-static.js --out $SP/dist-after-full                           # 209 s
node scripts/build-static.js --out $SP/dist-after                                # real data, 185 s
PORT=549x node scripts/cycle/serve.mjs --dist <dist> --pid $SP/serve-549x.pid &  # one per build
H=docs/process/scripts/perf-mobile-beta-2.mjs
node $H http://127.0.0.1:5491/melon-seek/beta/ before --net=fast4g,slow4g --timeline   # 20:07-20:27
node $H http://127.0.0.1:5492/melon-seek/beta/ after --net=fast4g,slow4g --timeline
node $H <url>/melon-seek/beta/ <label> --co=amazon,apple --net=fast4g,slow4g --cold-only --runs=3 --no-leak
# (tools/timed.sh in the scratchpad: each step waits for a quiet machine and logs uptime)
S=docs/process/scripts
git show 31ad25b:public/api.js > $SP/api-31ad25b.js
node --max-old-space-size=8000 $S/perf-mobile-beta-2-equal-check.mjs $SP/dist-before-full $SP/dist-after-full $SP/api-31ad25b.js
node $S/perf-mobile-beta-2-title-check.mjs public/features/roles.js <patched roles.js> $SP/dist-after-full
node $S/perf-mobile-beta-table.mjs $SP/perf-before.json $SP/perf-after.json
node $S/perf-mobile-beta-coldtable.mjs $SP/perf-<a>-cold3.json $SP/perf-<b>-cold3.json
MELON_BETA_SNAPSHOT_DIR=$SP/empty npm test
ln -s $SP/dist-after dist && node scripts/e2e.js     # then remove the link; revert docs/screenshots
# part 2, on the 2026-10-16 crawl (links re-pointed; MELON_BUILT_AT=2026-10-16T13:00:00.000Z):
git archive f254143 | tar -x -C $SP/base2-tree; (cd $SP/base2-tree && node scripts/build-static.js --out $SP/dist-B)
node scripts/build-static.js --out $SP/dist-H                 # also writes beta/api/preview/amazon.json
git show f254143:public/api.js > $SP/api-B.js
node --max-old-space-size=8000 $S/perf-mobile-beta-2-equal-check.mjs $SP/dist-B $SP/dist-H $SP/api-B.js  # lists and previews
node $H <url>/melon-seek/beta/ r-H-1 --co=amazon,apple,anduril --net=fast4g,slow4g --cold-only --no-leak  # one round of timed5
node $S/perf-mobile-beta-2-merge.mjs $SP r-B r-H && node $S/perf-mobile-beta-2-table.mjs part1=$SP/perf-r-B.json head=$SP/perf-r-H.json
# CI's list step, as CI has it (data links moved out of data/, MELON_BETA_SNAPSHOT_DIR=):
node scripts/build-static.js --out $SP/ci && node .github/scripts/check-lists.mjs $SP/ci
```

One-off probes stayed in the scratchpad `tools/`: field shares (`fields.mjs`, `salary.mjs`, `dupes.mjs`),
format sizes and identity (`packprobe.mjs`, `variants*.mjs`), unpack and parse timing (`unpackbench.mjs`,
`filebench.mjs`, `v3loop.mjs`, `lineticks.mjs`, `profsum.mjs`), Juice (`juicebench.mjs`, `juiceloop.mjs`),
worker hand-off cost (`clonebench.mjs`).

## 5. Verification

### 5.1 Tests

- `npm test` with no data links and `MELON_BETA_SNAPSHOT_DIR=` (what CI has), head c673b9c: **1,056 tests,
  1,010 pass, 7 skipped, 38 to-do, 0 fail** (one failure in that run, refresh-run's "offline dry run",
  was caused by this lane's own moved-aside link `data/snapshots.off`; with it out of `data/` that file
  passes 15/15). With the data links (2026-10-16 crawl): 1,062 tests, 2 fails, both event-loop timing
  tests (PERF-1, V15) at load 12; `test/perf.test.js` alone passes 3/3.
- Part 2, CI's own steps on a no-data build (data links out of `data/`, `MELON_BETA_SNAPSHOT_DIR=`), head
  b63652f: `build-static.js` OK, `check-lists.mjs` 0 problems, `npm test` **1,110 tests, 1,064 pass, 0
  fail**, 8 skipped, 38 to-do. The same on the final head (9bda4c1, code as 7bb9e5c): no-data build OK,
  16 lists 0 problems, npm test 1,110 / 1,064 pass / **0 fail**.
- Full e2e on the head's build (`dist` → 7bb9e5c on the 2026-10-16 crawl, 18:23-18:51): **358/362
  passed, 0 failed**, 4 skipped (D-11, methodology screenshots, P-2, BP-2: no such data). Screenshots the
  run rewrote were reverted.
- `test/perf-mobile-beta-2.test.js` (new, 9 tests; builds a temp site; passes with and without data):
  - melon-packed-3 unpacks to exactly what the **verbatim 31ad25b** packer and decoder
    (`test/fixtures/packed-2-reference.js`) give, deep-equal and in key order, for the site's Anthropic
    list and a 600-posting Amazon-like board that uses every encoding and every fallback (non-ASCII
    titles, urls the template does not give, null urls, a range with a number label, a range and a
    salary in another key order, salary extras, `pool`, `sections`, `descriptionHtml: ''`, brand and
    departmentBasis); the new decoder still reads melon-packed-2 the same way;
  - the built site's lists are melon-packed-3 and unpack like melon-packed-2;
  - `getJobs` on the Amazon-like board equals unpack → vetSalaries → attachJuiceAll (both kinds of
    juiceMissing present), and on the real list;
  - `jobUrls` and `betaLeaks` read templated urls;
  - a list over 1.5 MB in melon-packed-2 bytes but under it in melon-packed-3 still moves its sections;
  - part 2: `previewSet` is a prefix of the Highest-pay order whatever the ties; a 10,300-posting board's
    preview holds getJobs' own postings, juice and all, and `getPreview` asks only for boards in
    `MELON_PREVIEWS` (no 404s); config.js requests the preview before the list; `check-lists.mjs` reads
    previews and fails on one that differs from its list.
- Updated for the no-cut rule: `amazon-meta-fit` (4), `bigtech-polite`, `beta-methodology` (MR-5, MR-14),
  `incremental-closures` (Amazon uncapped), `static-build` (format name). VT-22 in `beta-vetting-2`
  passes and is no longer a to-do.
- e2e (`node scripts/e2e.js`, `dist` → this lane's 2026-10-11 build): **299/304 passed, 1 failed, 4
  skipped**. The failure, fix-beta-app D-19/M-22 ("a company this site does not list"), expected Meta
  and Amazon to be absent from /beta/; it fails the same on the baseline build, and the lead's 2474fc4
  updated that check. Screenshots the run rewrote were reverted.

### 5.2 Same output

- **Full scale, 2026-10-16 crawl** (`perf-mobile-beta-2-equal-check.mjs dist-b dist-a`, both builds pinned
  to the same MELON_BUILT_AT): 2474fc4's api.js on 2474fc4's build against this lane's api.js on its
  build, `getJobs` for all 23 lists of both sites (Amazon 22,179) and switch-back from the LRU:
  identical JSON (key order) and deep-equal. The same check on the 2026-10-11 data with the synthetic
  22,415 Amazon, against 31ad25b: identical.
- **At build time**, every list is packed both ways and the build fails unless the melon-packed-3 jobs
  equal the melon-packed-2 jobs in JSON (key order).
- The roles.js patch: `readableTitle` identical on 96,422 titles, twice (memo read).

### 5.3 Before → after on the whole Amazon board (2026-10-16 crawl, 4x CPU, 390×844)

Medians of 3 cold loads per cell, base 2474fc4 and head interleaved round by round, load 1.5-3.9 (median
2.4) for both. First card spread: base Fast 4G Amazon 7.1-7.9 s, head 6.7-7.0 s; Slow 4G 18.3-18.9 s vs
15.5-16.3 s (no overlap); Apple 3.2-3.8 vs 2.9-3.4 s, 8.1-8.3 vs 7.4-7.6 s.

| Network · board | FCP | First card | First chart | TTI | Max task | TBT | Heap after load |
|---|---|---|---|---|---|---|---|
| Fast 4G · Amazon 22,179 | 724 → 776 ms | **7.8 → 6.7 s** | 8.2 → 7.4 s | 8.7 → 7.9 s | 1.0 → 1.1 s | 2.6 → 2.6 s | 68-77 → 66-78 MB |
| Fast 4G · Apple 4,851 | 744 → 680 ms | **3.5 → 3.2 s** | 3.8 → 3.4 s | 3.9 → 3.7 s | 587 → 548 ms | 985 ms → 1.1 s | 18-21 → 20-22 MB |
| Slow 4G · Amazon 22,179 | 1.7 → 1.7 s | **18.4 → 15.7 s** | 18.9 → 16.3 s | 19.2 → 16.7 s | 1.2 → 1.0 s | 2.5 → 2.5 s | 78-82 → 62-72 MB |
| Slow 4G · Apple 4,851 | 1.7 → 1.7 s | **8.1 → 7.6 s** | 8.4 → 7.8 s | 8.7 → 8.0 s | 463 → 467 ms | 887 → 802 ms | 29-30 → 19-22 MB |

Head + the roles.js patch (Amazon, same rounds): Fast 4G 6.9 s, Slow 4G 15.6 s: no gain above noise.

List sizes, 2026-10-16 crawl (raw / gzip, base → head):

| Board | Postings | Raw | Gzip |
|---|---|---|---|
| amazon | 22,179 | 10.90 MB → **6.74 MB** | 1.68 MB → **1.14 MB** |
| apple | 4,851 | 2.19 MB → **1.28 MB** | 342 kB → **241 kB** |
| google | 3,821 | 1.60 MB → **1.17 MB** | 303 kB → **279 kB** |
| nvidia | 2,711 | 1.24 MB → **876 kB** | 182 kB → **155 kB** |
| anduril | 2,537 | 1.19 MB → **778 kB** | 169 kB → **133 kB** |
| microsoft | 2,435 | 1.05 MB → **729 kB** | 176 kB → **150 kB** |
| meta | 1,208 | 536 kB → **358 kB** | 101 kB → **87 kB** |
| netflix | 414 | 1.01 MB → **958 kB** | 288 kB → **283 kB** |
| openai, anthropic, shieldai, palantir, cohere, scaleai, xai | 118-801 | 4-33% smaller | 1-12% smaller |

In Node (unthrottled), getJobs for the whole Amazon list: 799 → 596 ms; Apple 166 → 91 ms; Google
186 → 91 ms (`equal-check` timings; parse is faster, unpack makes each ISO date once).

### 5.4 Every board, one run each (2026-10-16 crawl)

One cold load per cell, so a single number moves by about ±0.3 s; 5.3 and 5.6 hold the interleaved
medians. Columns 2474fc4 → part 1 (this lane's head before f254143) → head (7bb9e5c). 2474fc4 and part 1
ran back to back at 15:45-16:40, load 2.2-7.2 (other lanes); the head ran at 17:28-18:00, load 1.1-2.2,
so its column reads a little low against the other two. "First cards" is the preview's on Amazon at the
head and the list's otherwise ("List in").

| Network · board | First cards | List in | First chart | Longest task | TBT |
|---|---|---|---|---|---|
| Fast 4G · Amazon | 7.1 → 7.0 → **1.9 s** | 7.1 → 7.0 → 7.4 s | 7.6 → 7.5 → 7.9 s | 933 ms → 1.3 s → 520 ms | 2.6 → 2.5 → 2.1 s |
| Fast 4G · Apple | 3.2 → 2.9 → 3.0 s | 3.2 → 2.9 → 3.0 s | 3.6 → 3.2 → 3.3 s | 482 → 438 → 215 ms | 900 → 834 → 520 ms |
| Fast 4G · Google | 3.1 → 2.7 → 3.0 s | 3.1 → 2.7 → 3.0 s | 3.5 → 2.9 → 3.3 s | 567 → 417 → 223 ms | 990 → 656 → 553 ms |
| Fast 4G · NVIDIA | 2.2 → 2.7 → 2.4 s | 2.2 → 2.7 → 2.4 s | 2.4 → 3.0 → 2.6 s | 278 → 455 → 176 ms | 488 → 709 → 352 ms |
| Fast 4G · Microsoft | 2.3 → 2.8 → 2.4 s | 2.3 → 2.8 → 2.4 s | 2.4 → 3.1 → 2.7 s | 276 → 442 → 178 ms | 574 → 802 → 370 ms |
| Fast 4G · Meta | 2.3 → 2.1 → 2.2 s | 2.3 → 2.1 → 2.2 s | 2.5 → 2.3 → 2.5 s | 251 → 261 → 164 ms | 502 → 281 → 339 ms |
| Fast 4G · Netflix | 2.0 → 2.1 → 2.0 s | 2.0 → 2.1 → 2.0 s | 2.1 → 2.3 → 2.2 s | 261 → 215 → 190 ms | 441 → 375 → 383 ms |
| Fast 4G · Anduril | 2.6 → 2.7 → 2.4 s | 2.6 → 2.7 → 2.4 s | 2.9 → 3.0 → 2.7 s | 377 → 391 → 207 ms | 638 → 623 → 381 ms |
| Slow 4G · Amazon | 18.6 → 15.4 → **5.0 s** | 18.6 → 15.4 → 15.1 s | 19.1 → 15.9 → 15.7 s | 1.1 → 1.1 s → 482 ms | 2.5 → 2.4 → 2.1 s |
| Slow 4G · Apple | 8.2 → 8.0 → 7.4 s | 8.2 → 8.0 → 7.4 s | 8.5 → 8.2 → 7.6 s | 499 → 529 → 198 ms | 818 ms → 1.0 s → 655 ms |
| Slow 4G · Google | 7.6 → 7.6 → 8.7 s | 7.6 → 7.6 → 8.7 s | 7.8 → 7.8 → 9.6 s | 447 → 470 → 352 ms | 661 ms → 683 ms → 1.6 s |
| Slow 4G · NVIDIA | 6.7 → 6.5 → 6.8 s | 6.7 → 6.5 → 6.8 s | 6.9 → 6.7 → 7.1 s | 337 → 313 → 274 ms | 535 → 463 → 722 ms |
| Slow 4G · Microsoft | 7.4 → 6.8 → 7.0 s | 7.4 → 6.8 → 7.0 s | 7.8 → 7.0 → 7.5 s | 656 → 508 → 382 ms | 1.4 s → 701 → 999 ms |
| Slow 4G · Meta | 6.1 → 6.1 → 6.2 s | 6.1 → 6.1 → 6.2 s | 6.3 → 6.2 → 6.5 s | 260 → 324 → 401 ms | 790 → 449 → 990 ms |
| Slow 4G · Netflix | 6.8 → 6.9 → 6.9 s | 6.8 → 6.9 → 6.9 s | 6.9 → 7.0 → 7.1 s | 184 → 249 → 255 ms | 282 → 600 → 791 ms |
| Slow 4G · Anduril | 7.0 → 6.6 → 6.7 s | 7.0 → 6.6 → 6.7 s | 7.2 → 7.0 → 6.9 s | 398 → 368 → 244 ms | 882 → 574 → 715 ms |

Google's Slow 4G 8.7 s at the head is one run: 3 interleaved rounds of the three builds (scratchpad
`tools/timed8.sh`, load 1.7-2.5) give Slow 4G 8.6 → 8.3 → 8.5 s (spread 8.2-8.7 s in all three) and Fast
4G 3.9 → 3.8 → 4.0 s (3.3-4.1 s), longest task 611 → 609 → 331 ms, TBT 1.6 → 1.4 → 1.1 s. (Single-board
runs read higher than the matrix's, in every column.)

Interactions on Amazon, Fast 4G (time to the next frame / longest task), same runs: drawer 694 / 431 →
714 / 484 → 690 / 483 ms; a filter change 1.1 s / 365 ms → 892 / 483 ms → 1.0 s / 409 ms; sort 521 / 469 →
600 / 568 → 478 / 452 ms; **Insights 4.2 s / 3.8 s → 4.9 / 4.5 s → 4.6 / 4.3 s** (one task:
`renderInsights` 2.7 s and `roleFamily` 0.7 s of it; features code, not this lane's); map 2.3 / 1.6 → 2.9 /
2.1 → 2.3 / 1.5 s; idle 4 → 5 → 4 ms of tasks in 10 s. The other boards' interactions are within noise of
2474fc4 (Insights 0.6-1.7 s, drawer 0.4-0.6 s). Leak cycle (10 switches, heap after GC): 15.2 → a 70-75 MB
plateau in all three (the 3-list LRU holding Amazon whole), DOM 801-912 nodes, listeners 97 → 97 → 99 and
constant through the cycle. Requests (cold, Fast 4G, Amazon): JS 24 files / 380 kB → 24 / 382 kB → 25 /
393 kB (the 25th is fix-density's `viz/note.js`; part 2 adds 1.8 kB gzip to app.js, 0.8 kB to api.js,
0.2 kB to config.js), JSON 1,713 → 1,173 → 1,184 kB (the head's 4th request is the 10.4 kB preview).

### 5.5 Build time

2026-10-16 crawl, pinned: base 188 s, head 195 s (+4%: every list is packed twice for the check).
2026-10-11: 175 → 185 s; with the synthetic 22,415 Amazon 201 → 209 s.

### 5.6 Part 2 record: first cards on the whole Amazon board (2026-10-16 crawl, 4x CPU, 390×844)

Interleaved round by round, each run started at a 1-minute load under 2.5 and recorded with its load
(scratchpad `tools/timed4.sh`, `timed5.sh`; merged by `perf-mobile-beta-2-merge.mjs`, tabulated by
`perf-mobile-beta-2-table.mjs`). Medians of 3 cold loads. 2474fc4 from timed4 (load 1.9-4.5); part 1
(f254143) and head (7bb9e5c, preview for 10,000+ postings) from timed5 (load 1.4-3.1 and 1.35-2.3).
"First cards" is the first frame with result cards (the preview's when there is one); "List in" is the
list's own first cards.

| Network · board | First cards | List in | First chart | TTI | Longest task | TBT |
|---|---|---|---|---|---|---|
| Fast 4G · Amazon 22,179 | 7.5 → 7.1 → **2.0 s** | 7.5 → 7.1 → 7.2 s | 7.9 → 7.7 → 7.8 s | 8.2 → 8.1 → 8.2 s | 993 ms → 1.1 s → **488 ms** | 2.4 → 2.5 → 2.1 s |
| Fast 4G · Apple 4,851 | 3.0 → 3.0 → 2.9 s | 3.0 → 3.0 → 2.9 s | 3.2 → 3.3 → 3.2 s | 3.6 → 3.4 → 3.5 s | 406 → 492 → 219 ms | 872 → 748 → 607 ms |
| Fast 4G · Anduril 2,537 | 2.7 → 2.6 → 2.6 s | 2.7 → 2.6 → 2.6 s | 2.9 → 2.9 → 2.9 s | 3.1 → 3.0 → 3.0 s | 386 → 325 → 220 ms | 744 → 597 → 465 ms |
| Slow 4G · Amazon 22,179 | 18.5 → 15.3 → **5.0 s** | 18.5 → 15.3 → 15.4 s | 18.9 → 15.9 → 16.0 s | 19.3 → 16.3 → 16.4 s | 1.1 s → 998 ms → **485 ms** | 2.8 → 2.6 → 2.0 s |
| Slow 4G · Apple 4,851 | 8.1 → 7.5 → 7.4 s | 8.1 → 7.5 → 7.4 s | 8.3 → 7.9 → 7.7 s | 8.5 → 8.4 → 7.9 s | 464 → 536 → 274 ms | 837 → 971 → 650 ms |
| Slow 4G · Anduril 2,537 | 6.8 → 6.5 → 6.5 s | 6.8 → 6.5 → 6.5 s | 7.0 → 6.8 → 6.7 s | 7.2 → 7.0 → 6.9 s | 299 → 361 → 219 ms | 566 → 667 → 415 ms |
| Fast 4G · main site, Anduril | 2.4 → 2.7 → 2.6 s | 2.4 → 2.7 → 2.6 s | 2.6 → 2.9 → 2.8 s | 2.8 → 3.1 → 3.0 s | 350 → 361 → 215 ms | 597 → 577 → 480 ms |
| Slow 4G · main site, Anduril | 7.0 → 6.7 → 6.6 s | 7.0 → 6.7 → 6.6 s | 7.3 → 7.0 → 6.8 s | 7.4 → 7.3 → 7.0 s | 373 → 411 → 198 ms | 640 → 751 → 429 ms |

- **Amazon's first cards at the head: 1.8-2.1 s on Fast 4G, 4.9-5.0 s on Slow 4G** (all runs), the
  preview's 100 postings (10.4 kB gzip) drawn as the list; the whole list follows at 7.2 s / 15.4 s and
  keeps the place. The preview's first 30 cards were the list's first 30 in every run (32 of 32 across
  timed4, timed5 and the full run). While the list loads behind them, a scroll or tap waits at most
  about 0.5 s (the longest task, `derive` of the first render), against 1.0-1.1 s before.
- **With the threshold at 1,000** (timed4, same rounds), Apple and Anduril also showed preview cards at
  1.8-2.0 s (5.0 s on Slow 4G), but their list and chart came 0.3 s later (Apple list 2.8 → 3.1 s, chart
  3.0 → 3.3 s; main-site Anduril list 2.6 → 2.9 s, chart 2.9 → 3.1 s), so the threshold went to 10,000:
  only Amazon gets a preview, and the other boards take only the shorter tasks.
- **Main site.** The medians above read 2.4 → 2.7 → 2.6 s, so the main site's Anduril on Fast 4G was
  checked in three more batches (single-network runs, which read higher than timed5's):
  - 5 rounds 2474fc4 / f254143 / head (timed6, load 1.1-2.0): 3.24 / 3.47 / 3.50 s;
  - 5 rounds 2474fc4 / **f254143 with this lane's part 1 files taken back** (other lanes' work only) /
    f254143 / head (timed7, load 0.8-2.4): 3.12 / 3.02 / 3.33 / 3.15 s;
  - 10 rounds 2474fc4 against head, the order swapped every round (timed9, load 0.2-1.8): 3.28 → 3.44 s;
    paired difference median +0.10 s, mean +0.13 s, range −0.49 to +0.83 s; TBT 1.29 → 0.94 s, longest
    task 501 → 321 ms, chart 3.71 → 3.82 s.
  So the main site's first cards are the same within noise (at most about 0.1 s later), with shorter
  tasks. The cold heap reading (no GC) is 14 → 20 MB from f254143 on; with GC it is the same (end of the
  full runs: Anduril 56.5 → 55.0 MB; leak plateau unchanged), and in Node the unpacked, juiced Anduril
  list holds 7.8 MB as melon-packed-2 and 7.6 MB as melon-packed-3 (`tools/heapprobe.mjs`), so that is
  garbage collected later, not memory kept.
- **The head's full run** (one run per cell, load 1.6-1.9) is 5.4's third column; its Amazon chart tasks
  are about 0.40 s and 0.25 s at 4x (sent to viz-even through the lead).

## 6. Known gaps and follow-ups

1. **Amazon's first cards come from the preview; the whole list is still slow on a phone.** First cards
   2.0 s on Fast 4G and 5.0 s on Slow 4G, but the list itself (counts, filters, chart, every card past
   the first 100) lands at 7.2 s / 15.4 s. On Slow 4G that is the 1.14 MB list (about 6.5 s of transfer);
   on Fast 4G it is main-thread work that scales with the posting count, now in tasks of at most about
   0.5 s:
   - Juice for every posting before the list's first render (about 2 s at 4x for 22K, `server/juice.js`;
     only 23% of Amazon's (pay, places) pairs are distinct, but copying a result costs as much as
     computing it, so a memo needs juice.js to return results that are safe to share, or a cheaper key;
     Juice on the visible cards first would change what the first render shows, 3, decision 8);
   - app.js `prepare` (about 1.5 s), `derive` (about 0.4 s, the longest task left) and `paintWindow`,
     and the chart (two tasks of about 0.40 and 0.25 s; viz-even's);
   - **Insights is one 4.3 s task on Amazon** (`renderInsights` 2.7 s, `roleFamily` 0.7 s; features
     code, outside this lane): opening it blocks input that long.
2. **The preview covers only the default view of boards of 10,000+ postings** (today Amazon alone):
   Highest pay, no filter, search, area or saved search, colour by department. A shared link with a
   filter, another sort, or a saved view waits for the whole list as before. Below 10,000 a preview
   would show cards about 1 s sooner but push the list and chart 0.3 s later (5.6).
3. **Description trimming** keeps every posting and, with VT-22 and SA-7, every pay row and pay paragraph,
   but it still shortens the stored description of a board over 40 MB (Amazon: 800 characters, the rest on
   the posting page). If the user's no-cut rule covers description text too, the 40 MB target has to go
   (Amazon's snapshot would be about 140 MB; GitHub's file limit is 100 MB, so it would need splitting).
4. **Measurement**: the records ran at load 0.2-4.5 (other lanes), interleaved so the builds compared saw
   the same load; on a quiet machine every column would be lower. Single runs move by about ±0.3 s and
   main-site Anduril runs by up to ±0.5 s (5.6). Not measured: WebKit, a real phone.
5. The full e2e ran on the head's build (5.1, 0 failed); the earlier 2026-10-11 run was on this lane's
   build before the rebases.

Patches for other owners:
- `docs/process/patches/perf-mobile-beta-2-readable-title-memo.diff` (`public/features/roles.js`): identical,
  optional (no measurable gain).

## 7. Change log

- 2026-10-11 19:58 Worktree at 31ad25b, links, prompt saved. 20:00 baseline build (175 s). 20:07-20:27
  baseline matrix, all 8 boards, both networks (load 0.3-2).
- 20:1x The lead relayed the user's no-cut rule: maxPostings removed, fitSnapshot never caps, tests and docs
  (9d6e203, pushed by the lead as 0b8413d).
- 20:3x melon-packed-3 and a Juice memo (088d4f0); synthetic 22,415 Amazon (no posting dropped, 86 MB).
- 20:45 The memo measured slower in the browser (clone and key costs); dropped. Unpack made faster
  (fixed layouts, ISO date cache); sections budget kept on melon-packed-2 bytes (96e3a8b).
- 20:58-21:17 After matrix, Fast 4G clean; from 21:08 other lanes loaded the machine (lead informed).
  npm test, e2e. Rebased onto e48fd32.
- 22:4x fix5-data's VT-22 trim patch applied, test un-todo'd.
- 2026-10-16 13:2x Resumed after a container restart. Rebased onto 2474fc4; data links to the 2026-10-16
  crawl (Amazon 22,179). Pinned builds base/head (188/195 s); full-scale identity check: identical.
- 14:4x No-data CI fix of the new tests (c673b9c); brand/departmentBasis in the test (d25d42c);
  google-grouping-pack.diff judged moot; SA-7 trim hunk applied (25efed6).
- 15:35-15:45 Interleaved cold-load record on the 22,179 board (load 1.5-3.9). 15:45- matrix.
- 16:0x Part 2 (the lead: Amazon's first cards in about 3 s on Fast 4G): first-page preview (a9cb193,
  tests a851337); sliced unpack and keyword facets on first read (8de8c28); the first render in three
  tasks (707be3b); the equal-check covers previews (0719869). Rebased onto f254143 (the lead's CI fix for
  packed rows).
- 16:42 `window.MELON_PREVIEWS`, so boards without a preview make no request (ad89647). 17:01
  `check-lists.mjs` reads previews (b63652f); CI's steps on a no-data build: 0 problems, npm test 0 fail.
- 17:11-17:28 timed4 (2474fc4, f254143, head with a 1,000 threshold): smaller boards' list and chart
  0.3 s later; 17:29 threshold 10,000 (7bb9e5c). 17:33-18:00 timed5 and the head's full run (5.4, 5.6).
- 18:00-18:25 Main-site checks (timed6; an attribution build of f254143 without part 1, timed7; 10
  swapped rounds, timed9) and Google (timed8). Then the full e2e on the head's build.

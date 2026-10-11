# Process log: perf-mobile-beta-2

## 1. Brief

Prompt: [prompts/perf-mobile-beta-2.md](prompts/perf-mobile-beta-2.md), verbatim, with the lead's note of 2026-10-11.

Goal: measure the beta site (`/melon-seek/beta/`) on a mid-range phone with all 7 big-tech boards, Amazon
first, and fix the biggest costs, keeping the app simple and what `getJobs` returns exactly the same.
Mid-task the lead relayed the user: **"Why are you capping the no of posting we must present them as
they are and not cut anything"**. So: no posting is ever dropped, and the target became Amazon's whole
board (about 22,415 postings) plus every other board uncut.

Files owned:
- `public/api.js`, `public/unpack-worker.js` (unchanged), `scripts/build-static.js`;
- since the lead's message: Amazon's entry in `server/companies.js`, `scripts/snapshot.js#fitSnapshot`,
  and the tests and docs that described the posting budget;
- `test/perf-mobile-beta-2.test.js`, `test/fixtures/packed-2-reference.js` (new);
- `docs/process/scripts/perf-mobile-beta-2*.mjs` (harness copy, identity checks);
- `docs/process/patches/perf-mobile-beta-2-*.diff` (for files QA agents are testing; not applied);
- this log and the prompt.

Worktree `/home/user/melon-seek/.claude/worktrees/agent-a7425c5dcd4e39cbe`, detached at 31ad25b.

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

### Findings (baseline at 31ad25b, today's crawl, Fast 4G, quiet machine; numbers in 5.3)

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
   posting page has the full text (a question for the user, section 6).
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
   identical on 96,422 titles (`perf-mobile-beta-2-title-check.mjs`), measured in 5.4.
6. **Method**: `docs/process/scripts/perf-mobile-beta-2.mjs` is perf-mobile-beta.mjs with Amazon and Meta
   (switch Amazon ↔ Apple, Meta → Google, Netflix and Anduril → Amazon; the leak cycle adds Amazon),
   otherwise unchanged: 390×844, isMobile, touch, DPR 3, 4x CPU, CDP network presets, `serve.mjs`,
   trace-based long tasks with CPU-profile attribution. Every timing records the load average; runs
   after 21:08 waited for a 1-minute load under 1.5 (other agents started then).

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
```

One-off probes stayed in the scratchpad `tools/`: field shares (`fields.mjs`, `salary.mjs`, `dupes.mjs`),
format sizes and identity (`packprobe.mjs`, `variants*.mjs`), unpack and parse timing (`unpackbench.mjs`,
`filebench.mjs`, `v3loop.mjs`, `lineticks.mjs`, `profsum.mjs`), Juice (`juicebench.mjs`, `juiceloop.mjs`),
worker hand-off cost (`clonebench.mjs`).

## 5. Verification

## 6. Known gaps and follow-ups

## 7. Change log

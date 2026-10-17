# Improvement cycle playbook

This is the repeatable cycle used to QA, measure and improve melon-seek. It was run on the main
site on 2026-10-03 and again on 2026-10-10, and on the beta site (`/beta/`, the big-tech boards)
from 2026-10-10. Run it after any large change, after new data sources land, or on a regular
cadence. Every stage has a prompt template in [prompts/cycle/](prompts/cycle/). The lead fills in
the target and launches the agents. The project skill `.claude/skills/improvement-cycle/` is the
short version of this page.

The user's instruction that created this playbook (2026-10-10): "After the beta page with big tech
jobs is ready, make sure we run the optimization on the beta page with the big tech jobs afterwards
like how we did it for the original site, go through the same flow and make sure we remember those
flows / steps so that we can replicate and continue to improve them while we do the same for the
beta page."

## Targets

| Target | URL path in a local build | Data | Notes |
|---|---|---|---|
| `stable` | `/melon-seek/` | `data/snapshots/*.json` (8 boards) | Browser-live for Greenhouse, Ashby and Lever |
| `beta` | `/melon-seek/beta/` | `data/beta/snapshots/*.json` plus the stable ones | Big-tech boards are `live: false`. About 20k postings, so it is the heavy case for performance |

## Stage 0. Data readiness (lead, about 10 min)

1. Get the latest real data into the sandbox. The sandbox cannot reach the job boards or github.io,
   so the data comes from the permanent archive branch:
   `node scripts/cycle/local-data.js` fetches `data-archive` into a temporary worktree and rebuilds
   each company's latest observation with `scripts/archive/reconstruct.js`. Stable boards go to
   `data/snapshots/` and beta boards to `data/beta/snapshots/`; both are gitignored. Pass
   `--archive DIR` to reuse an archive worktree, `--date` for an earlier day, and `--channel` for
   one site. A board crawled only after the archive's last ingest is listed as missing; wait for
   archive.yml, which runs after every snapshot run.
2. `npm run build` makes the shared `dist/`, which the e2e suite reads. Agents never write it:
   each builds into its own folder with `node scripts/build-static.js --out <dir>`, or serves a
   build the lead made for them. `node scripts/cycle/serve.mjs --dist <dir> --pid <file>` serves a
   build under `/melon-seek/` on a free port (or `PORT`); stop it with `kill "$(cat <file>)"`.
3. Gate: the build log's `beta:` line lists the expected companies, and `npm test` is green.

## Stage 1. Find problems (agents in parallel; none of them edits product code)

| Agent | Template | Output |
|---|---|---|
| Desktop QA | [cycle/desktop-qa.md](prompts/cycle/desktop-qa.md) | `docs/QA.md` section, bugs D-n, `test/e2e/<target>-desktop-qa.e2e.js` tests that encode each bug |
| Mobile QA | [cycle/mobile-qa.md](prompts/cycle/mobile-qa.md) | bugs M-n, `test/e2e/<target>-mobile-qa.e2e.js` |
| Mobile performance and resources | [cycle/mobile-perf.md](prompts/cycle/mobile-perf.md) | timings table before and after (4x CPU, Fast and Slow 4G), heap, long tasks from a Chrome trace; may fix its own files |
| Data quality (beta, or after any new source) | [cycle/data-check.md](prompts/cycle/data-check.md) | pay parsing, levels, locations, comps cells, vetting flags per company |
| Persona review: 5 age groups × 5 career levels | [cycle/persona-review.md](prompts/cycle/persona-review.md) | one agent per age group (18–24, 25–34, 35–44, 45–54, 55 and over). Each plays 5 levels, from student to executive: what is good, what to improve, what is broken and must be fixed now |
| UX and frontend design review | [cycle/ux-review.md](prompts/cycle/ux-review.md) | findings UX-n: hierarchy, consistency, words, states, the simplicity budget, responsive and themes; `test/e2e/<target>-ux-review.e2e.js` for objective layout and contrast bugs |
| Data-visualisation review | [cycle/viz-review.md](prompts/cycle/viz-review.md) | findings V-n: chart, map, Juice waterfall, comps and Insights charts checked against the data, colour-blind safety, drawing speed; `test/e2e/<target>-viz-review.e2e.js` |
| Security and accessibility review | [cycle/security-a11y-review.md](prompts/cycle/security-a11y-review.md) | a "<target> review <date>" section in `docs/REVIEW.md` (S-n, A-n), re-check of open findings; `test/<target>-security-review.test.js`, `test/e2e/<target>-a11y.e2e.js` |
| Salary vetting | [cycle/vetting-qc.md](prompts/cycle/vetting-qc.md) | `data/vetting/<date>-<target>/` (flags, seeded sample, verdicts, summary), the gate's error rates, findings VT-n; `test/<target>-vetting.test.js` |
| Test-suite QA | [cycle/qa-suite.md](prompts/cycle/qa-suite.md) | coverage map, gaps, flakes from 3 runs of each suite, slowest tests, CI parity (T-n); `test/e2e/<target>-coverage.e2e.js`, `test/<target>-coverage.test.js` |
| Methodology and sources review | [cycle/methodology-review.md](prompts/cycle/methodology-review.md) | findings MR-n: a source and as-of for every number on screen, freshness registry coverage, docs drift; `test/<target>-methodology.test.js` |

These are the check roles the main site was built and reviewed with (docs/process/README.md lists
the original agents: qa, ux, viz, review, vetting, methodology and freshness), turned into
repeatable templates on 2026-10-11 when the user asked: "Did the big tech jobs run through the QA
and QC and UI/UX front end agents? Deploy all the agents that we use in the original melon seek
checks and then run through the rigorous checks and tests and revisions." A full cycle runs all
eleven. The reviewers that only read a build (UX, viz, persona, methodology, security and
accessibility) serve one build the lead makes for them (`<DIST>`) instead of each building their own.

Rules for every stage 1 agent:
- Save its prompt verbatim to `docs/process/prompts/<role>.md` and write its log
  (`docs/process/<role>.md`, following [TEMPLATE.md](TEMPLATE.md)).
- Encode every bug it finds as a failing test where it can.
- Never push.

## Stage 2. Fix (agents by file ownership)

- The lead triages every finding into lanes by owning file. Use [cycle/fix-lane.md](prompts/cycle/fix-lane.md).
- Decide shared rules before the lanes start, and land any helper several lanes need in the base
  commit first. On 2026-10-10 these were `levelLabel` and `payLocations`, and the
  `salary.kind: 'ote'` and `salary.termWeeks` fields one lane produces and the others consume.
  Write the rules into every lane's prompt.
- Run each fix lane in its own git worktree (Agent `isolation: "worktree"`). Its `dist/`, builds
  and e2e runs are its own, and stage 1 agents can keep testing the shared checkout. The lane
  symlinks `node_modules` and `data/snapshots`, commits locally, never pushes, and reports its
  worktree path and commit SHAs. A long lane prompt can live in a file the agent reads and saves
  verbatim.
- One agent per lane. Shared files go to a single owner; any other agent that needs a change there
  writes a patch to `docs/process/patches/<role>-<name>.diff` instead.
- Keep the UI simple (docs/strategy/ROADMAP.md §8). Use no unexplained abbreviations.
- Gate per lane:
  - `npm test` green;
  - the lane's red tests are now green;
  - the full e2e suite has no new failures;
  - screenshots taken before and after.

## Stage 3. Integrate and ship (lead only)

These are the rules learned the hard way on 2026-10-10.

1. **Agents never push.** Every push to the deploy branch starts GitHub's branch build, which
   briefly serves the holding page (repo-root `index.html`). The lead batches pushes.
2. **Check for agents' local commits** first: `git log origin/claude/stoic-ride-54ddxp..HEAD`,
   plus each worktree lane's reported SHAs. Cherry-pick them into the batch, then apply the
   lanes' patches (`docs/process/patches/`) in order.
3. **Build each batch in a clean worktree:**
   - create it with `git worktree add --detach <scratch>/wt-<name> HEAD` and symlink `node_modules`;
   - copy only the lane's files, apply its patches in order, and run
     `node scripts/refresh/registry.js --lines --write && node scripts/refresh/registry.js --docs --write`;
   - run `npm test`, `npm run build` (symlink the snapshot folders only for this local check), the
     full e2e suite and a YAML parse of the workflows. Remove the snapshot links again before the
     last `npm test`: with local data present, the data-dependent timing tests (PERF-1, V15) also
     run, and they can fail under load although CI never runs them (2026-10-11: 171 and 182 ms of
     event-loop lag at load 4, then 3 of 3 passes alone).
   - Timing tests (PERF-1, V15, Compstimate T21) can fail under load. Re-run them alone before
     calling them failures, and compare against an unchanged baseline worktree.
4. **Shrink finished screenshot folders** with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/<role>`
   before committing them: 8-bit PNG at most 1440 px wide, about 4x smaller, with the same file names.
   A persona folder is about 15 MB before.
5. **Commit inside that worktree:**
   - stage explicit paths only; never `git add -A data` (a snapshot symlink once leaked that way);
   - check that `git diff --cached --name-only` has no `snapshots`, `node_modules` or `dist` entries;
   - push from the worktree with `git push origin HEAD:claude/stoic-ride-54ddxp`.
6. **Sync the shared checkout** with `bash scripts/cycle/sync-shared.sh <old-head> <new-head>`:
   - a file no one touched takes the new version;
   - a file that already equals the new version is left alone;
   - any other text file gets a 3-way merge, and a conflict keeps the agent's copy;
   - binary files are never merged;
   - then `git reset <new-head>` (mixed) moves HEAD without touching any agent's work.
7. **Watch the deploy.** pages.yml's post-deploy check must pass for `/` and, warning only, for
   `/beta/`. CI must be green; fix it before the next batch.

### Checkpoints: a stop must cost minutes, not hours

On 2026-10-11 every agent stopped at once on an API usage limit, and the work in their worktrees
sat unsaved for five days. The user, 2026-10-16: "Make sure that if we get stop again due to
limits, we're able to resume without losing much progress. So push and compile often so that we
don't lose that much." So:

1. **Checkpoint every 15 minutes while agents work.** The lead keeps one `LANE=WORKTREE` line
   per running agent in a lanes file, and runs
   `bash scripts/cycle/checkpoint-loop.sh <lanes file> 900` in the background. Each round runs
   `scripts/cycle/checkpoint.sh --push`, which writes `wip/<lane>/` on the deploy branch with
   these files (data links, new screenshots and files over 5 MB are left out and listed):
   - `commits/*.patch`
   - `uncommitted.diff`
   - `untracked.tgz`
   - `STATUS.md`
   
   CI and Pages ignore `wip/**`, so a checkpoint never rebuilds or redeploys the site, and agents
   still never push. A background command stops after 2 hours (the loop did, 2026-10-16 15:41), so
   for a longer session the lead schedules the checkpoint as a session cron job every 15 minutes
   (it fires while the lead is idle) and also checkpoints at every integration. Remove a lane's line when it is integrated, and its `wip/<lane>/` with the
   integration commit.
2. **Agents commit small and often** in their worktrees ("WIP: …" is fine), and keep a
   `## State` section at the top of their log: what is done, what is in progress, the next step.
   That section is what a resumed or replacement agent reads first.
3. **Integrate in increments.** An agent sends the lead each finished, tested piece by
   SendMessage as soon as it is ready (a finding with its fix and test, or one patch), and keeps
   working. The lead integrates and pushes those pieces with the full Stage 3 gate, rather than
   waiting for one large final report.
4. **Resume.**
   - After a stop, resume each agent by SendMessage (its transcript survives while the container
     does).
   - If the container was reclaimed, restore the lane with
     `bash scripts/cycle/restore-wip.sh <lane> <scratch>/wt-<lane>`, re-link the data, and start a
     new agent on it with its saved prompt (`docs/process/prompts/<lane>.md`) plus the restored
     log's `## State`.
5. **Lead state is pushed too.** Every decision and integration goes into [lead.md](lead.md) in
   the same push, so a new lead session can continue from the repo alone.

## Stage 4. Record and repeat

- Append a section to [lead.md](lead.md): the request, agents, findings, fixes, verification
  numbers and any process lesson.
- Add new lessons to this playbook, in Stage 3 or under "Known traps" below.
- Re-run stage 1 on the same target after stage 3. A cycle is done when stage 1 finds no
  "broken, fix now" items.

## Known traps

- **E2e tests that pin converted pay break after an FX refresh.** The monthly refresh commits once `npm test`
  passes; it does not run the browser suite. Fix app [P-5] pinned "£80,000 ≈ $108K", and the September rates made it
  $107K. In e2e tests, build expected figures from `toUSD` (public/viz/palette.js), as the test's own `want` value
  already did, never from a literal (docs/DATA_FRESHNESS.md "Pinned values").
- **Phones come in more sizes than 360, 390 and 430.** On 2026-10-16 the phone matrix (test/e2e/phone-sizes.mjs,
  run by test/e2e/webkit/phone-smoke.mjs and webkit-phone.yml) found the Razr cover screen (352x355) broken: the
  landscape rule `(max-width: 860px) and (max-height: 500px)` caught a square screen, the top bar laid out at
  476 px and the phone zoomed the page out. It also found the company name gone at 280 px. Every phone check runs the
  whole matrix, and "page wider than the screen" is checked against the screen's width, not `innerWidth` (which
  grows when a phone zooms out).
- **A quoted accuracy line in a product doc is checked as a claim.** `scripts/refresh/jobs.js` reads every
  "±N% (tested on N …)" in product docs (docs/*.md, not docs/process/) and calls it drift unless a company's
  backtest matches it or the line marks it as an example ("e.g."). A QA section copied into docs/QA.md on
  2026-10-16 quoted the Pay estimate card's line plainly, and test/refresh-jobs.test.js failed. Quote it with
  "e.g." when copying a reviewer's section.
- **ci.yml has checks that `npm test` does not run.** On 2026-10-16 a list-format change (melon-packed-3)
  passed the whole local gate and turned CI red: ci.yml's "Static build" step read `.jobs[]` with raw jq,
  and packed rows are arrays (run 38930131882). Those checks are now `.github/scripts/check-lists.mjs`
  (it reads lists through `unpackJobs`), and `test/ci-lists.test.js` runs it on a no-data build. After any
  push, read CI's result; a red head is work now.

- The sandbox has no route to the job boards, github.io or artifact downloads. Use the archive
  for data, GitHub Actions probe workflows for live checks (`workflow_dispatch` plus
  `get_job_logs`), and the post-deploy check for the live site.
- `pkill -f` or `pgrep -f` with a pattern your own shell contains kills that shell. Use pid files.
- The sandbox has tools the CI runner lacks (for example `pdftotext`, which the tax refresh
  tests need; ci.yml installs it). A green local run is not a green CI run, so check CI on every
  push before the next batch. 15ed02b went red this way.
- The sandbox has 4 CPUs. Each browser agent adds about 1 to 2 to the load, and 4 fix lanes alone
  reached load 7, so stagger: run QA and the data check alongside fix lanes, but run mobile perf
  on a quiet machine (its timings are the deliverable). Run the persona review on the fixed
  build, so it finds new problems instead of known ones. Beta on 2026-10-10: desktop QA, mobile
  QA and the data check first; perf and personas after the main-site fixes were integrated.
  The full roster on 4 CPUs (beta, 2026-10-11) runs in three batches: (1) desktop QA, mobile QA,
  the data check, salary vetting and the security and accessibility review; (2) UX, viz and
  methodology reviews; (3) mobile perf, the optimisation pass, alone, on the fixed build (the user,
  2026-10-11: "Make sure we run the optimizations improvements too!"); (4) test-suite QA, which
  runs both suites three times, alone.
- Run the whole `npm test` before every push, docs-only commits included. Tests read the docs:
  scripts/refresh/jobs.js flags a hand-written accuracy figure ("Typically within ±12% …") in
  docs/QA.md unless it reads as an example ("e.g."). be5691c, a QA-docs commit checked with the
  markdown tests only, turned CI red that way.
- GitHub fires our scheduled crawls hours late. On 2026-10-10 the 06:17 stable crawl ran at
  12:41, and the 12:47 and 18:47 beta slots ran at 17:28 and 22:00. Don't promise users fixed
  times; check the snapshot.yml runs before saying a crawl was missed.
- A container restart stops every running agent and loses its unreported work. The files survive
  (the shared checkout, `.claude/worktrees/`, the scratchpad). On 2026-10-10 the beta platform
  lane was cut off after editing 9 files without committing. The lead saved them as a WIP commit
  and a new agent resumed from it. Ask long lanes to commit locally at milestones.
- A wall-clock time limit inside a helper is a timing test too. `extractConst` (scripts/refresh/lib.js)
  evaluated each constant with a 50 ms vm limit, so a full `npm test` on a loaded machine sometimes
  reported real constants as "not found" (MIN_BIN_PX in the registry test, the Juice anchors in the
  policy test). The limit is 2 s since 2026-10-11. Look for such limits before calling a failure a flake.
- The disk fills up. Each lane's scratch build is 0.6 to 1.4 GB, and on 2026-10-11 a full `npm test`
  failed 59 tests with ENOSPC when the disk reached 100%. Delete a lane's scratch folder and remove its
  worktree once it is integrated, and check `df -h /` before a long run.
- Emulated phones have no browser toolbars. A "390x844" Chromium phone shows 844 px, where Safari on the
  same phone shows about 664 and an iPhone SE about 548. Test short heights (Safari toolbars, the
  keyboard, landscape), and judge scrolling by how much of the last item is visible, never by the
  scroll offset alone. On 2026-10-11 a portrait-only check passed while the user could not reach the
  last companies (M-28).
- A review that only lists findings can still miss what a user sees first. On 2026-10-11 the UX, viz and
  mobile reviews all passed a chart notes line of six facts that wrapped to four lines on a phone; the
  user caught it. The UX and mobile templates now make text density a measured check (words and wrapped
  lines per secondary line, per board and viewport), and fix-density added tests that fail on any such line.
- Never run `playwright install`. Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  with Playwright in `<scratchpad>/pw/node_modules`.
- The Long Tasks API misses work after `fetch()` resolves. Read long tasks from a Chrome trace.
- Beta-specific: a company with `paused` in server/companies.js is never crawled or tested (its adapter
  refuses to start). No board is capped: Amazon's 5,000-posting budget (`maxPostings`) was removed on
  2026-10-11, and its whole board (22,179 postings on 2026-10-16) is the heavy case. Apple's full
  crawl took 89 minutes on 2026-10-11 (4,704 requests); an incremental run takes about 13.

## Adding a board to the incremental crawl

Every board goes through `server/sources/incremental.js` (docs/ARCHITECTURE.md "Incremental crawl
and closures"). A new adapter in `server/sources/` plugs in like this:

1. **List-only board** (the list returns whole postings, like Greenhouse or Amazon): return the
   RawJob array, or `{ jobs, listing: { complete, listed, expected } }` when the list is paged
   and can come back short. Nothing else: `scripts/snapshot.js` accounts for every posting and
   the crawl summary says `list-only`.
2. **Detail board** (a request per posting): write a change-signal function,
   `rowKey(pick(row, [the fields an edit moves: title, places, dates, lastmod]))`, and a
   `*_CRAWL_VERSION` constant. In the fetch function: `const plan = deltaPlan(opts.previous,
   { version, ...crawlOptions(opts) })`, then `runDetails(plan, items, { request })` with one
   polite request per item (`conditionalGet` for a GET, so 304s work), map each row with
   `details.get(id)`, and return `{ jobs, stats, listing, state: plan.state() }`. A sitemap is
   `conditionalList`.
3. **Completeness.** Set `listing.complete` only when the list is provably the whole board
   (rows >= the board's own count; a sitemap). A short list closes nothing. If the board has a
   cheap per-posting URL, add `probeAbsent` with a probe that tells a 404/410/redirect.
4. **Test it**: add the board to `test/incremental-boards.js` (`BOARDS`); the equivalence test
   then checks it against a full crawl. Keep the mapping functions unchanged, and do not change
   the request rate (`server/sources/polite.js`).

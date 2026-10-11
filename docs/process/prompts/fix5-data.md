You are fix lane **fix5-data** for melon-seek (/home/user/melon-seek, "the Zillow of job postings"). Save this prompt verbatim to docs/process/prompts/fix5-data.md, and write your log to docs/process/fix5-data.md following docs/process/TEMPLATE.md. Follow docs/process/prompts/cycle/fix-lane.md and docs/process/PLAYBOOK.md.

**Base.** In your worktree run `git checkout --detach 3f9385c` (pushed). Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek (today's crawl, all 7 big-tech boards; Amazon at 5,000 of 22,352). Commit at milestones, never push, report your SHAs.

**The user's rule for this wave (2026-10-11):** "we must present them as they are and not cut anything". The lead's decisions under it are in docs/process/lead.md, "Beta round 3"; follow them exactly.

**Findings.** Read each in its source; the failing to-do tests are your gate. A fixed to-do becomes a plain passing test.
- docs/process/data-check-beta-3.md, with tests in test/beta-data-check-3.test.js:
  - **DQ-38, first and urgent.** The history ledger knows only the 5,000 postings the old cap kept, so the first uncapped crawl would mark about 17,350 old postings "New". Fix it in server/history.js `updateLedger` and .github/scripts/beta-snapshots.mjs `recordPublished`, so a board whose coverage grows doesn't flood "New". For example, postings first seen when the board's coverage grew take their `postedAt` (or the run is a baseline) rather than counting as new. Prove it with a test. The uncapped crawl waits for this.
  - DQ-33 together with DQ-41: Amazon's per-city pay rows must carry their places (map each row to the job's location strings, as Apple's mapCopies does; keep `locations` in deriveSalary), drop "Virtual Location" rows for states the job doesn't list, and stop counting identical rows as zones.
  - DQ-35: a bare "$" on a posting whose places are all in Mexico is MXN, like Canada's CAD rule; also AUD, NZD, SGD and HKD as the vetting says, but not xAI's Dublin "$".
  - DQ-36 and DQ-37 levels.
  - DQ-34: add Juice city records or `nearby` proxies in data/cities.json for the listed towns, with sources, the same way existing cities have them (follow docs/LIVABILITY.md). If a city lacks sourced data, use a `nearby` proxy to a sourced city and say so. Never invent figures.
  - DQ-40 (3-letter country codes), DQ-42 (Meta `salary.country`), DQ-43 (vet-salaries scans what the build serves: export a loader and use it), and the DQ-6 residue.
- data/vetting/2026-10-11-beta-2/summary.md and docs/process/vetting-beta-2.md, with tests in test/beta-vetting-2.test.js:
  - VT-14 (= DQ-35);
  - VT-15 (= DQ-33);
  - VT-16 (add a `cur:<code>` comparison group to statOutliers, used when it has at least MIN_GROUP members);
  - VT-17 (a stated minimum is kept as `kind: 'minimum'`, never hidden; the display reads "from €X");
  - VT-18 (keep the posted figure, plus a flag that it includes the highest shift differential, and `salary.statedBase` when the posting states a lower base);
  - VT-19 (use the annual figure when the posting states one);
  - VT-20 (= DQ-42);
  - VT-21 (= DQ-36);
  - VT-23 (weekly hours "20h");
  - VT-25 (`REVIEW_DIR_RE` accepts `-beta-2`);
  - the gate: raise `VET.MAX_ANNUAL` to $1.5M (VT-10);
  - VT-7: NVIDIA's sales "cash compensation range" becomes `kind: 'ote'`, shown, not hidden;
  - VT-8: Microsoft's own IC/M level beats the title.
  Update the regression fixtures for every verdict these change, and say which.
- VT-22 (trimDescription keeps the published pay row) is in scripts/snapshot.js, owned by the performance lane: write a patch, docs/process/patches/fix5-data-trim.diff.

**Display:** these add fields (`kind: 'minimum'`, the shift-differential flag, `statedBase`, per-place `locations`). The app shows them through public/app.js, owned by the fix-density lane, which is rewriting secondary text right now. Write one patch, docs/process/patches/fix5-data-display.diff, with short labels that respect the new density rule: one short line, details behind the existing disclosure. Make the data correct even without that patch.

**You own:** server/** (except server/index.js), public/features/shared.js (`payLocations`), scripts/vet-salaries.js, scripts/llm-vet.js, data/cities.json, .github/scripts/beta-snapshots.mjs, the test files above, test/fixtures/**, and docs (CONTRACT "Fix wave 5", VETTING, DATA_SOURCES, LIVABILITY). Bump `NORMALIZER_VERSION`. Keep test/incremental-equivalence.test.js green. Keep the request rate and the incremental crawl as they are.
**Not yours:** public/app.js, public/styles.css, public/viz/* (fix-density), and scripts/snapshot.js, scripts/build-static.js, public/api.js (performance). Send patches for those.

**Gate:**
- the listed tests pass;
- `npm test` passes with MELON_BETA_SNAPSHOT_DIR set to an empty folder and no data links;
- vet-salaries on the beta snapshots exits 0 and its fixtures pass;
- a build with today's data succeeds;
- before/after numbers per finding.
Check `df -h /`; delete scratch builds. Use pid files; never `pkill -f`; never `playwright install`. Report each finding fixed or not with numbers, your patches, and your SHAs. Report DQ-38 first, as soon as it's done, with a SendMessage-style note in your log, so the lead can start the uncapped crawl.

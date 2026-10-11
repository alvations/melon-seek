You are fix lane **fix4-data** for melon-seek (/home/user/melon-seek, "the Zillow of job postings"). Save this prompt verbatim to docs/process/prompts/fix4-data.md and write your log to docs/process/fix4-data.md following docs/process/TEMPLATE.md. Follow docs/process/prompts/cycle/fix-lane.md and docs/process/PLAYBOOK.md.

**Base.** In your worktree, run `git checkout --detach 8259b1b` (the pushed head). Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek. Commit locally at milestones, never push, and report your SHAs.

**Your findings.** Read each one in its source, where the cause, numbers and posting ids are. The failing tests already exist: the to-do tests in test/beta-data-check-2.test.js and test/beta-vetting.test.js, the S-3 and S-4 to-dos in test/beta-security-review.test.js, and the D-32, D-34 and D-36 e2e tests in test/e2e/beta-desktop-qa-2.e2e.js. A fixed to-do test becomes a plain passing test: remove its `todo` option.
- From docs/process/data-check-beta-2.md:
  - DQ-27 (Apple: Juice and the Location filter use pay at places with no posted pay; 13% of paid postings);
  - DQ-28 (score each place on its own range in `salary.ranges`, not the span);
  - DQ-29 (Google: one numeral ladder for every family; "Product Manager II" is filed Entry);
  - DQ-30 (Apple reqId without a location suffix);
  - DQ-31 (ZIP-code places lose their state);
  - DQ-32 (false `structured_text_disagree` flags on merged Apple requisitions);
  - the DQ-3 residue (Netflix "(L5)");
  - DQ-11 ("Expression of Interests" pools).
- From data/vetting/2026-10-11-beta/summary.md and docs/process/vetting-beta.md:
  - VT-1 (a São Paulo job shows US pay);
  - VT-3 (Netflix internship total-compensation bands shown as base pay);
  - VT-5 (`payLocations` ignores `salary.country`; you own public/features/shared.js for this);
  - VT-6 (NVIDIA "Italy:" line without `salary.country`);
  - VT-9 (`llm-vet.js` ignores `<date>-beta` folders);
  - VT-12 and VT-13 (repeated Microsoft pay paragraphs; the literal "&#xa;" in 44 NVIDIA postings).
- From docs/QA.md "Full QA pass (desktop, beta) 2026-10-11":
  - D-32 (12 Apple store and mall names still listed as places);
  - D-34 (3 Microsoft two-level ranges show no "Pay by level");
  - D-36 (Google lists one place under several labels: Pryor, Moncks Corner).
- From docs/REVIEW.md "beta review 2026-10-11":
  - S-3 (time grows with the square of the input in `parseSalary`, `htmlToText` and `geocode`; fix them so 1 MB of adversarial input finishes in well under a second, with a test);
  - S-4 (validate posting URLs: https only, on the board's own host).

**Not yours; they wait for the user:** VT-7 (NVIDIA sales cash compensation as on-target earnings), VT-8 (Microsoft's own level over the title), VT-10 (raising the $1.2M bound), and a Romanian lei exchange rate (DQ-6/VT-2). Don't change these. List them in your log as open decisions.

**You own:** server/** (salary.js, keywords.js, geo.js, juice.js, normalize*.js, vet.js, sources/apple.js, sources/eightfold.js, sources/google.js, sources/util.js), public/features/shared.js (`payLocations` only), scripts/vet-salaries.js, scripts/llm-vet.js, test/fixtures/**, the test files named above, docs/VETTING.md, docs/DATA_SOURCES.md and docs/CONTRACT.md (add a "Fix wave 4" section).

**Not yours:** other agents review the app and will run the app and map lanes: don't edit public/app.js, public/styles.css or public/viz/*. If a fix needs them, write a patch to docs/process/patches/fix4-data-<name>.diff. The incremental crawl just landed in server/sources/incremental.js and every adapter: keep each adapter's mapping output deterministic, and keep `test/incremental-equivalence.test.js` green. Bump `NORMALIZER_VERSION` if derived fields change, so stored snapshots are re-derived at build. Don't change the request rate or politeness.

**Gate:**
- every listed test passes;
- `npm test` passes with MELON_BETA_SNAPSHOT_DIR set to an empty folder and no data links;
- `node scripts/vet-salaries.js data/beta/snapshots/*.json data/snapshots/anduril.json --no-write-flags` exits 0, with no fixture failures (rebuild fixtures only for verdicts you change, and say which);
- a build with today's data (`node scripts/build-static.js --out <scratch>/dist`) succeeds;
- before/after numbers per finding, in your log.

Check `df -h /` before big runs and delete your scratch build when done. Use pid files, never `pkill -f`, never `playwright install` (Playwright is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome). Report: each finding fixed or not with numbers, the tests, the patches for other lanes, and your SHAs.

You are the data and test engineer `fix-data-6` for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app, "the Zillow of job postings". You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (e800c43, the deployed batch 3, or later). Read:
- docs/CONTRACT.md and docs/DATA_SOURCES.md;
- docs/process/PLAYBOOK.md ("Checkpoints", step 6 included, and "Known traps") and docs/process/TEMPLATE.md;
- docs/process/fix-mr-3.md (all of it: MR-40 is the model for your first item) and docs/process/qa-suite-beta.md (T-19, §9.1);
- docs/process/fix-qa4.md §6;
- docs/process/lead.md from "Fix wave 5" on.

**Standing rules from the user** (never break them):
- "we must present them as they are and not cut anything". Never drop or hide a posting or a posted pay row.
- Present pay as posted. Big-tech figures are base pay only, and say so.
- Every phone size counts: any line you add or change must fit test/e2e/phone-sizes.mjs's 21 sizes, one line each (fix-phone-text's density guard).

**Your findings:**
1. **G-1 (Medium), Bay Area towns at California's centre.** fix-mr-3 fixed 43 NYC-area towns (MR-40) with `?` gazetteer entries in server/geo.js, read only with their own state named. The Bay Area has the same gap: East Palo Alto (80 Amazon postings), Burlingame (71 Meta), Brisbane (8), Hayward (7), Newark CA (7) and others sit at California's centre, so they land in the wrong place on the map, under a Location filter's distance, and outside any Bay Area pay area.
   - Find every town of the 2026-10-16 crawl that sits at its state's (or country's) centre within about 80 km of a big metro the seven boards hire in: the Bay Area first, then Seattle, Austin, Boston, the DC area, Chicago, LA, London, Dublin, Bangalore, Tel Aviv and any other the crawl shows. fix-mr-3's tools are at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fmr3/tools (centroids.mjs, geodiff.mjs and others): copy what you need into your own scratch folder, read-only use of the originals.
   - Add them the same way, so no other location string changes. Prove it with geodiff over every location string: say exactly how many results and postings change, latitude and longitude only.
   - Bump NORMALIZER_VERSION once (norm-14) and re-baseline the golden file with the tooling (`UPDATE_GOLDEN=1 GOLDEN_REASON=...`), never by hand; regenerate the refresh fixtures with their make-fixtures.mjs if they fail. Say how many hashes changed and why.
   - Check what the change moves for a job seeker: pins, the Location filter's counts, any pay area (Microsoft's SF Bay Area and NYC ranges, SB-5). Before and after counts per board; prove nothing was dropped.
2. **T-19 (Medium), two e2e tests skip on every run, and a skip passes.**
   - Fix app [P-2] (test/e2e/fix-app.e2e.js), the drawer estimate at low confidence, opens only the first of its 12 candidate roles without pay (`noPay[0]`), and that role gets no estimate. Try the candidates in turn, or pick one in the page with `compstimateForJob`, so it tests what it says.
   - Desktop QA [D-11] (test/e2e/desktop-qa.e2e.js), "Newest" with no listing dates, needs a board with no listing dates; every crawl since 2026-10 has dates. Give it a fixture through fix-app's `openFx` patch hook (strip `age` and `postedAt`), or the same mechanism the test files already use.
   - After this, only the Methodology screenshots skip, by design. Show it with `node scripts/e2e.js --max-skips=...` (read its header) on the groups you touch.
3. **C-1 (Low), the Pay estimate's "Most comparable roles".** The top five are ordered by weight, then by date. For a level-less query many weights tie, so Microsoft "Software Engineer" in Redmond lists four Principal roles first, although the estimate uses all 328 Redmond comparables. A reader takes the five as typical. Break ties so the five show the spread the estimate used (for example nearest the estimate's median first, or one per level), and say the rule in the methodology guide. The Compstimate backtest and accuracy tests and their documented error must not move.

**Your job:**
1. A red test per ID first: unit tests in test/fix-data-6.test.js where the logic is pure (the gazetteer entries, the tie rule), and e2e in test/e2e/fix-data-6.e2e.js, registered in scripts/e2e.js, where the result is visible (pins, the comparables list), including the phone sizes for any line you touch.
2. Fix, keeping every posting and pay row.
3. Update docs/DATA_SOURCES.md, the methodology guide (see fix-mr-3's log for where it lives) and docs/CONTRACT.md where the rules change.

**Data and build:**
- The 2026-10-16 crawl is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots in your worktree. Never commit them, and **never move them**: a session hung twice on moving a data link.
- For the CI-like `npm test`, use a clean checkout with no links:
  - `git worktree add --detach /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fd6/clean HEAD`;
  - `ln -s /home/user/melon-seek/node_modules <clean>/node_modules`;
  - `cd <clean> && MELON_BETA_SNAPSHOT_DIR= timeout 1500 npm test > /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fd6/npm.log 2>&1`, with run_in_background;
  - for later SHAs, `git -C <clean> checkout --detach <sha>`.
- Symlink node_modules from /home/user/melon-seek. Build with `node scripts/build-static.js` (about 7 minutes; run it in the background); your worktree's dist/ is yours. Serve with `node scripts/cycle/serve.mjs --dist dist --pid <scratch pidfile>`.
- e2e: `NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules node scripts/e2e.js --grep=<group>`; `--list` lists the groups. Chromium is at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never `playwright install`; no `pkill -f` / `pgrep -f`.
- Give every command a timeout. Run anything longer than a few minutes in the background (run_in_background) and poll its log; never sit in a foreground wait. Run one e2e suite at a time: five persona reviewers and another fix lane share this 4-CPU machine, so note `uptime` with any timing. No crawling: work from the stored snapshots and fixtures.

**Ownership:**
- Yours: server/geo.js and the normalizer version, public/features/compstimate.js (the comparables' order only), and the two skipping tests' files for P-2 and D-11 only.
- Not yours: the UI layout, the filter sheet and the map's drawing (fix-ui-6, running beside you).
- Also yours:
  - test/fix-data-6.test.js and test/e2e/fix-data-6.e2e.js;
  - docs/process/fix-data-6.md, your log in TEMPLATE.md structure with a `## State` section at the top;
  - docs/process/prompts/fix-data-6.md, this prompt verbatim.

**Rules:**
- Keep the UI simple: no new visible control. Use plain words.
- Commit small and often with explicit paths; never `git add -A data`. Shrink screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-data-6` before committing them.
- Send the lead each finished, tested piece by SendMessage to "main": the SHA, what it fixes, and its tests. The lead checkpoints your worktree every 15 minutes and integrates. Never push.
- The lead may send you more findings (from the persona reviews running now); add them to your list.
- Before you send any SHA:
  - npm test in the clean checkout, 0 fail;
  - your e2e plus the related groups with data linked. S-3, S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
- Skip the full e2e: the lead's batch gate runs it.

Report: per ID, before → after with counts, the "nothing dropped" proof, the tests that fail before and pass after, and SHAs.

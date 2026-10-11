You are fix lane **fix4-app** for melon-seek (/home/user/melon-seek, "the Zillow of job postings"). Save this prompt verbatim to docs/process/prompts/fix4-app.md and write your log to docs/process/fix4-app.md following docs/process/TEMPLATE.md. Follow docs/process/prompts/cycle/fix-lane.md, docs/process/PLAYBOOK.md and docs/strategy/ROADMAP.md §8 (keep the UI simple; no unexplained abbreviations; no new visible control unless a finding can't be fixed otherwise, and say so if you add one).

**Base.** In your worktree run `git checkout --detach b4d4c0f`. Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek. Commit locally at milestones (a container restart loses uncommitted work), never push, and report your SHAs.

**Your findings.** Read each one in its source; the cause, numbers and suggested fix are there. Most already have failing tests, which are your gate.
- docs/REVIEW.md "beta review 2026-10-11":
  - A-1 card names; A-2 badge popover focus; A-3 200% zoom; A-4 Snapshot badge contrast (the same as UX-18); A-5 list roles; A-6 Juice rows in cells; A-7 duplicate region names; V8 slider size;
  - S-6 (server/index.js rebuilding /methodology/ per request; you own that function only).
  The tests are test/e2e/beta-a11y.e2e.js and the to-dos in test/beta-security-review.test.js.
- docs/QA.md "Full QA pass (desktop, beta) 2026-10-11": D-33 (two ages in one drawer), D-35 (a beta board linked on the main site gets no link to /beta/), D-37 (beta methodology and share pages don't say beta; you own scripts/methodology.js and the share-page and methodology parts of scripts/build-static.js). Tests: test/e2e/beta-desktop-qa-2.e2e.js.
- docs/process/ux-review-beta.md: UX-15, 16, 18, 19 (non-map targets), 20 and 21 (tests in test/e2e/beta-ux-review.e2e.js); UX-22 (a "Pay by place" line in the drawer and an honest card label for postings with several place ranges, read from `salary.ranges`; the data lane fixes which place gets which range); UX-23, 25, 26, 27, 28, 29, 30, 31, 32 (display side), 33, 34 and 35.
- docs/process/methodology-review-beta.md:
  - MR-2 (the drawer's converted-pay line shows the rate's date and source);
  - MR-3 (methodology links where pay, "Pay by level", part-time and fixed-term pay, the Compstimate accuracy line, comps, Insights and the badge are explained);
  - MR-9 (grade tooltips must match the thresholds the grade uses);
  - MR-10 (badge popover: source link, the 6-hour cadence, time zone);
  - MR-11 (why Apple shows fewer roles than its site);
  - MR-12 (say when Juice uses a nearby city);
  - MR-14 (a capped board's pay share is for the kept postings: say so, and show the whole-board figure if the snapshot has it);
  - MR-17 (terms explained where they appear);
  - MR-18.
  Tests: the to-dos in test/beta-methodology.test.js that need product code.
- docs/process/viz-review-beta.md: V-30 (two Juice figures for one place in the drawer) and V-32 (waterfall bar contrast, styles.css).

A fixed to-do test becomes a plain passing test: remove its `todo`. Don't weaken any test. If a test is wrong, say why in your log and fix the test, with the reviewer's intent kept.

**You own:** public/app.js, public/index.html, public/styles.css, public/features/* (except `payLocations` in shared.js, which the data lane owns), scripts/methodology.js, the methodology and share-page parts of scripts/build-static.js, the /methodology/ handler in server/index.js, and the test files named above.
**Not yours:**
- public/viz/* belongs to the fix4-viz lane, which runs now;
- server/** (except that one handler), the FX tables in public/viz/palette.js, and docs/DATA_SOURCES.md belong to the fix4-data lane, which runs now.
If you need a change there, write a patch to docs/process/patches/fix4-app-<name>.diff.
Shared data fields (from the data lane, landing in the same wave): `salary.ranges` entries carry their places, and a place without posted pay is no longer in the pay's places. Read them defensively, so your code works before and after.

**Gate:**
- every test named above passes;
- `npm test` passes with MELON_BETA_SNAPSHOT_DIR set to an empty folder and no data links;
- the full e2e suite has no new failures (build with `node scripts/build-static.js --out <scratch>/dist` and run with BETA_QA_DIST pointing at it; see how test/e2e/beta-desktop-qa-2.e2e.js reads it);
- before/after screenshots at 1440x900 and 390x844, shrunk with scripts/cycle/shrink-screenshots.sh.
Check `df -h /` before big runs and delete your scratch build at the end. Use pid files; never `pkill -f`; never `playwright install` (Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium /opt/pw-browsers/chromium-1194/chrome-linux/chrome). Report: each finding fixed or not, the before/after test counts, the patches, and your SHAs.

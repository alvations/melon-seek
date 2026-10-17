# Process log: fix-phone-controls

## State

Updated 2026-10-17 01:50. Worktree `.claude/worktrees/agent-a5fba4b5fed0699e2`, detached, rebased on b6250b3.
**Finished, gate passed; sent to the lead.** Commits: 5cb37f0 (the fixes and the test file), 43ca959 (the tests on
phone-sizes.mjs, the WebKit step, fix-density's guard, M-47 on wide touch screens, scripts, log), 0c145e0 (56
screenshots), and the log commit after them.

- **Done:** M-43, A-11, M-40, A-10, M-47, UX-56, UX-57 in public/app.js and public/styles.css, plus the small
  `setNotes` hook in public/viz/chart.js (approved by the lead). test/e2e/fix-phone-controls.e2e.js (98 tests on the
  19 sizes of test/e2e/phone-sizes.mjs, the review's landscapes and desktop widths) is registered in scripts/e2e.js;
  a WebKit step in .github/workflows/webkit-phone.yml runs it with `--browser=webkit`. fix-density's stats-line
  guard now expects UX-57's single Details.
- **Not run here:** WebKit (not installed; the step runs on the runner).
- **Next for whoever resumes:** nothing in this lane. Watch the WebKit step's first result.

## 1. Brief

Prompt: [prompts/fix-phone-controls.md](prompts/fix-phone-controls.md), verbatim. The user, 2026-10-16: "The mobile
page on the beta site is totally broken". The round-3 reviewers found phone controls that give no feedback (M-43),
that a keyboard covers (M-47) or that can't be told apart (M-40), plus four keyboard and screen-reader findings
(A-10, A-11, UX-56) and one control over the simplicity budget (UX-57). Mid-task the lead added the user's "check for
all phone sizes from iPhone mini to razr to duo": every change is tested on test/e2e/phone-sizes.mjs.

Files owned: public/app.js (preview cards and the old `pendingOpenId`, list keys, the checklists' markup and names,
the filter sheet's `inert`, the stats line's Details, the Pay estimate field's focus scrolling), public/styles.css for
those rules, the new test file, the webkit-phone.yml step, this log and the prompt. With the lead's approval: the
`setNotes(items)` hook in public/viz/chart.js (kept away from the tip code fix-touch-tips edits).

## 2. Inputs and sources

- docs/process/qa-mobile-beta-3.md (M-40, M-43, M-47 with repros and causes), docs/REVIEW.md "beta review
  2026-10-16" and test/e2e/beta-a11y-2.e2e.js (A-10, A-11), the ux-review-beta-2 worktree's log and
  test/e2e/beta-ux-review-2.e2e.js (UX-56, UX-57, and UX-38 for the same department labels), docs/strategy/ROADMAP.md
  §8, docs/process/perf-mobile-beta-2.md (the first-page preview), test/e2e/fix-company-scroll.e2e.js (the
  standalone `--browser=webkit` runner), PLAYBOOK "Checkpoints" and "Known traps".
- Data: the 2026-10-16 crawl (scratchpad `wt-data2`), linked as data/snapshots and data/beta/snapshots.
- Department names measured on the snapshots: Amazon 37 departments (longest 45 characters, the two
  "Project/Program/Product Management--…" 1,215 and 1,174 postings); Anduril 467 (median 65 characters, 259 over 60,
  longest 122, hierarchies "A : B : C" that often share their start and their end).

## 3. Decisions and rationale

1. **M-43: the job page opens at the tap.** A preview card's tap (or Enter) calls `openDrawer` as any card does.
   While the whole list loads, `openDrawer` finds the posting in the preview (`previewJob`) and shows
   `drawerLoading(job)`: the drawer's own head (Back / close, previous and next, "2 of 22,179"), the company, the
   title, the department and level, the card's pay pill, "Loading this role's details…" (role=status) and grey
   lines (aria-busy). It sets `S.job`, so the job page has its own history entry: hardware Back closes it and stays on
   the page. When the list lands, loadJobs' existing `if (S.job) openDrawer(S.job)` replaces it with the whole page
   for the same posting (focus on Back). Closed while loading, it stays closed. `pendingOpenId` is gone.
   - Not chosen: the whole job page from the preview's data. The percentile, "Same role elsewhere", Juice's
     comparisons and the Pay estimate read the whole board (`data.jobs`), so they would be wrong or empty, then
     change under the reader.
   - Measured, Slow 4G at 4x CPU, 390x844: the job page is open 400 ms after the tap (before: nothing for 10 s);
     the whole page 10.2 s after the tap.
2. **A-11: preview cards are cards.** One selector for both (`CARD_SEL`, `cardId`) in the list's click and key
   handlers, so ArrowUp/Down, Enter and Space work on preview cards; buildWindow keeps focus on the same posting's
   card when the whole list replaces the preview. closeDrawer finds a preview card too.
3. **M-40: a long name's start and end, each one line.** `splitName` cuts a name of 19+ characters at its last
   separator (" : ", "--", " - ", "/", ", ", else the last space) into two inline-block parts that each keep one line
   (`.check-part`, max-width 100%, ellipsis). The end wraps under the start instead of being cut ("Project/Program/
   Product Manageme…" / "Technical"), and only a start longer than a line is cut. The label's text is unchanged
   (the whole name), so the checkbox's accessible name and the row's `title` are the whole name; a checked or
   keyboard-focused row shows it whole.
   - Anduril's hierarchies share both ends ("Maritime & Maneuver Dominance : … - Engineering & Operations"), so a
     two-part cut still left 5 to 21 look-alike rows. `labelLayouts` looks at the whole list: rows whose first 15
     characters of both parts match another row's (15 always show, down to the 280 px Fold) wrap whole instead
     (`.is-wrap`): 127 of Anduril's 467, none of Amazon's.
   - Not chosen: a measured middle ellipsis (a canvas measure per row and per width, redone on resize), or wrapping
     every name (Anduril's rows would be 3 to 5 lines at 280 px).
4. **A-10:** makeChecklist takes `label` or `labelledBy`; the Company and Department lists are labelled by their
   headings (ids per Department filter), so Amazon's list is still "Department" with its heading hidden; Location,
   Seniority and Employment type are named too.
5. **M-47:** `revealField` also runs for Insights' text fields, on phones and on any touch screen (`hover: none` and
   `pointer: coarse`: the Razr's inner screen in landscape is 1005 px wide, past the phone layout), takes the visual
   viewport's top into account (iOS pans it), and scrolls the field's label into view. On a short screen the field
   can still be under the keyboard below the top bars (568x320 leaves 163 px, 108 of them bars), so then
   `body.kb-lift` hides the top bar and quick filters while it is typed in; they come back on blur or as soon as the
   visual viewport is no longer short (the keyboard closed), whatever the layout.
6. **UX-56:** `syncFiltersInert` makes `#filters` inert and aria-hidden whenever it is a closed sheet (below 1200 px,
   phones included), from boot, on open and close, and on resize across 1200 px. The docked column is never inert.
7. **UX-57:** in Chart view the stats line renders its one line without Details, and its facts go first in the chart
   notes' Details through `chart.setNotes(items)` (chart.js redoes only its notes, so a picked cluster or filter
   updates them without a redraw). The map has no chart notes, so its stats line keeps Details; so does Insights.
   If chart.js lacks the hook, app.js keeps the old Details. The words are fix-phone-text's and unchanged.
8. **Tests on the matrix:** every ID runs on all 19 sizes of phone-sizes.mjs where it applies, plus the review's
   landscapes (844x390, 568x320, 653x280, 720x540) and desktop widths. Taps are CDP touch events, first checked on
   the sheet handle; WebKit uses page.touchscreen. Only the throttled M-43 case needs CDP.

## 4. Replayable steps

```sh
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp
ln -s <scratch>/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s <scratch>/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js --out <scratch>/fpc/dist-base        # 3.5 min; the build copies public/ verbatim
cp -al <scratch>/fpc/dist-base dist                              # then overlay changed public/ files (break the links)
NODE_PATH=<scratch>/pw/node_modules node test/e2e/fix-phone-controls.e2e.js            # Chromium
node test/e2e/fix-phone-controls.e2e.js --browser=webkit                               # on the runner (webkit-phone.yml)
NODE_PATH=<scratch>/pw/node_modules node docs/process/scripts/fix-phone-controls-shots.mjs --dist <dir> --state before|after
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-phone-controls
```

## 5. Verification

- Red run on the base build (5a847e4): 56 of 64 tests fail, each for its bug; the 8 that pass are guards (M-47 on
  tall portrait phones, the map's Details, desktop keys on the whole list).
- Green run, the same file on the fix: **98 / 98 pass** (Chromium 141, all 19 sizes; it found two gaps that were then
  fixed: the Insights field on the Razr's inner screen in landscape, 1005x412, wider than the phone layout, and a
  layout that shows neither the stats line nor the chart notes).
- `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved out of data/ (as CI): 1,180 tests, 1,116 pass,
  **0 fail**, 8 skipped, 56 to-do (machine load 13 to 19).
- Full e2e with data linked (load 12 to 35): **476 / 504 pass, 24 fail, 4 skip.** All 98 of this lane's pass, and
  the reviewers' tests for my IDs turn green: Beta mobile QA 3 [M-40] [M-43] [M-47], beta a11y 2 [A-10] [A-11]. The
  24 failures:
  - by design, the reviewers' red tests for other lanes: Beta mobile QA 3 [M-33] to [M-39], [M-41], [M-42], [M-44],
    [M-45], [M-46] (12); Beta desktop QA 3 [D-38] to [D-45] (8); beta a11y 2 [A-8], [A-9] (2);
  - Compstimate T21 (cold server, "app not ready after 30 s") and Fix app [P-5] ("£80,000 ≈ $107K", the test wants
    $108K): both fail alone, and both fail the same way with the base's public/ files, so they are not from this lane.
- Then on the rebased tree, the two newly integrated review groups (Beta UX review 2, Beta viz review 2): 2 / 31 pass,
  [UX-56] (this lane) and [UX-44] (no lone Details now that Chart view's stats line has none; the line's words are
  fix-phone-text's M-46, still red). [UX-38]'s filter-list half passes; its phone chart rows are chart.js (viz).
- Preview timing (Fast 4G, 4x CPU, 390x844, base and fix interleaved, load about 15): first preview card base 2.20,
  2.12, 2.12 s; fix 2.17, 2.12, 2.24 s. Unchanged.
- Screenshots: docs/screenshots/fix-phone-controls/<ID>-<phone|desktop>-<light|dark>-<before|after>.png, 56 files,
  shrunk 11.7 → 3.1 MB. A-10's shots print each list's group name on the page and UX-56's say where Tab put the focus.

## 6. Known gaps and follow-ups

- WebKit is not installed here; the webkit-phone.yml step runs the file under WebKit on the runner.
- Found on the matrix, owned by fix-phone-sizes (sent to the lead): the Razr cover screen (352x355) matches the
  landscape media query and lays out 495 px wide (zoomed out); at 280 px the Group select and the tagline run past
  the edge. My tests do not depend on that layout.

## 7. Change log

- 2026-10-16 23:30: started; prompt saved; data linked; base build.
- 23:50: red run (56 failing for their bugs, 8 guards).
- 2026-10-17 00:00: fixes; M-40 made list-aware for Anduril; switched the tests to phone-sizes.mjs; rebased on 255b25b.
- 00:20: the matrix found M-47 at 1005x412 (wider than the phone layout: the field reveal now runs on any touch
  screen) and the Razr cover's layout with neither stats line nor chart notes (the test allows it).
- 00:30 to 01:40: npm test (0 fail), full e2e (no new failures), timing, screenshots; rebased on b6250b3.

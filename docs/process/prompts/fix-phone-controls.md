You are the front-end and UI/UX engineer `fix-phone-controls` for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app, "the Zillow of job postings". You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (head 5a847e4 or later). Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (UI simplicity budget), docs/process/PLAYBOOK.md (including "Checkpoints" and "Known traps"), docs/process/TEMPLATE.md, docs/process/ux.md and docs/process/perf-mobile-beta-2.md (the first-page preview).

**The user, 2026-10-16 (verbatim):**

> "Whatever was done with the ui/UX it needs to go through the mobile and desktop QC QA again. The mobile page on the beta site is totally broken"

The lead could not reproduce a page that fails to load: Chromium's and WebKit's iPhone profiles load every big-tech board with cards and no page error (webkit-phone.yml run 38979700118). The round-3 reviewers found controls on phones that give no feedback, that a keyboard covers, or that can't be told apart. Your lane fixes those. Other lanes: fix-phone-text (captions, cut text), fix-touch-tips (floating tips), fix-pay-at-place (per-place pay).

**Your findings.** Evidence and screenshots are in docs/process/qa-mobile-beta-3.md, docs/QA.md (last section), docs/screenshots/qa-mobile-beta-3/, docs/REVIEW.md ("beta review 2026-10-16"), test/e2e/beta-a11y-2.e2e.js, and in the not-yet-integrated worktree /home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19 (ux-review-beta-2).
- M-43: a tap on an Amazon preview card gives no feedback; the job opens 5–10 s later on Slow 4G when the whole list lands (`pendingOpenId`). Show at once that the tap registered (the card's pressed state and the drawer opening with the card's own fields, details "loading"), or open the drawer from the preview's data straight away.
- A-11: focus on an Amazon preview card drops to `<body>` when the full list replaces the preview, and ArrowDown does nothing on preview cards (app.js:4925-4933). Keep focus on the same posting's card, and make the preview cards keyboard-navigable like the list.
- M-40: Amazon's Department filter shows "Project/Program/Product Management--Technical" and "--Non-Tech" both as "Project/Program/Product Manageme…" at 390 px; Anduril's "Hardware Operations : Supply Chain : …" rows have the same problem. Make rows that share a cut prefix distinguishable (keep the distinguishing end visible, e.g. a middle ellipsis or wrapping to two lines in the checklist only), with the full name reachable by touch and screen reader.
- A-10: the Company and Department checklists are role=group with no name; the "Company" and "Department" headers are plain divs (app.js:2253, 2339-2342). Name them with aria-labelledby.
- M-47: in landscape (844x390) with the keyboard up, the Pay estimate field sits under the keyboard (simulated keyboard, as earlier passes). Scroll it into the visual viewport on focus, as the company sheet does (fix-company-scroll).
- UX-56: at 1024 px the closed filter side sheet is translated off screen but not inert: Tab lands on "Reset", "Close filters" and "Show roles" off screen and focus disappears. Set `inert` on #filters when it is closed at side-sheet widths (setFiltersModal handles only the phone).
- UX-57: the stats line's "Details" is a new always-visible main-view control (toolbar count 3 → 4, against ROADMAP §8). Fold the stats line's facts into the chart notes' Details, so the count is back to 3. (fix-phone-text owns the stats line's words; agree the split by SendMessage to "main" if you both touch it: you own the control, it owns the text.)

**Your job:**
1. A red e2e test per ID first: test/e2e/fix-phone-controls.e2e.js, registered in scripts/e2e.js, failing before and passing after. Use real touch (CDP `Input.dispatchTouchEvent`) for taps and swipes, validated on a control element first (PLAYBOOK, Known traps). For M-43 use 4x CPU and Slow 4G throttling as qa-mobile-beta-3 did.
2. Make the test file runnable with `--browser=webkit` the way test/e2e/fix-company-scroll.e2e.js is (skip only what needs CDP, and say so), and add one step to .github/workflows/webkit-phone.yml (the "Playwright WebKit, iPhone profile" job) that runs it, after the "Company sheet geometry on WebKit" step. fix-touch-tips and fix-phone-text add steps there too; keep yours separate.
3. Don't regress: desktop keyboard navigation, aria (aria-activedescendant, roles), focus rings, Escape, the drawer's close, the company sheet scroll (test/e2e/fix-company-scroll.e2e.js), the preview's same-cards-same-order replacement (perf-mobile-beta-2 tests), and its timings (first cards about 2 s on Fast 4G at 4x CPU).
4. Screenshots: before and after for each ID, phone and desktop, light and dark, in docs/screenshots/fix-phone-controls/, shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-phone-controls`.

**Data and build:**
- Today's crawl is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots in your worktree, and never commit them.
- Build with `node scripts/build-static.js` (your worktree's dist/ is yours) and serve with `node scripts/cycle/serve.mjs --dist dist --pid <scratch pidfile>`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. WebKit is not installed here; the lead runs webkit-phone.yml on GitHub. Never `playwright install`; no `pkill -f` / `pgrep -f`.
- Give every server, browser or test command a timeout, so nothing can hang.

**Ownership** (other lanes are editing the same files, so stay inside these parts):
- public/app.js: the preview cards and `pendingOpenId`, list keyboard navigation, the Company/Department checklists' markup and labels, the filter sheet's open/close and `inert`, the stats line's Details control, the Pay estimate field's focus scrolling;
- public/styles.css for those rules only; public/features/compstimate.js only for the field's focus handling;
- NOT yours: caption and note text (fix-phone-text), tooltip open-close (fix-touch-tips), `payPill` and the drawer's pay (fix-pay-at-place), chart and map drawing (the viz lane).
Also yours: the NEW test/e2e/fix-phone-controls.e2e.js (registered in scripts/e2e.js), the webkit-phone.yml step, docs/process/fix-phone-controls.md (your log in TEMPLATE.md structure, with a `## State` section at the top), docs/process/prompts/fix-phone-controls.md (this prompt pasted verbatim).

**Rules:**
- Keep the UI simple: no new visible control. Use plain words.
- Commit small and often in your worktree with explicit paths ("WIP: …" is fine). Send the lead each finished, tested piece by SendMessage to "main" (SHA, what it fixes, tests), then keep going. The lead checkpoints your worktree every 15 minutes and integrates. Never push.
- Before you send any SHA:
  - run `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved OUT of data/, as CI runs it. S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
  - run your e2e plus the full e2e suite with data linked: no new failures (the reviewers' red groups fail by design until their lanes land; say which). Then `git checkout -- docs/screenshots` for any screenshots the suite rewrote outside yours.

Report: per ID, before → after, tests that fail before and pass after, SHAs and screenshots.

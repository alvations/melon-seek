You are the front-end and UI/UX engineer `fix-phone-text` for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app, "the Zillow of job postings". You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (head 5a847e4 or later). Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (UI simplicity budget), docs/process/PLAYBOOK.md (including "Checkpoints" and "Known traps"), docs/process/TEMPLATE.md, docs/process/ux.md and docs/process/fix-density.md (the earlier density lane and its one-line rule).

**The user, 2026-10-16 (verbatim):**

> "Whatever was done with the ui/UX it needs to go through the mobile and desktop QC QA again. The mobile page on the beta site is totally broken"

The lead could not reproduce a page that fails to load: Chromium's and WebKit's iPhone profiles load every big-tech board with cards and no page error (webkit-phone.yml run 38979700118). What the round-3 reviewers did find on phones is text that runs to 3–5 lines, text cut mid-word, and numbers ellipsized. Together these make the phone page read as broken. Your lane fixes the text. Another lane, fix-phone-controls, fixes the controls; fix-touch-tips fixes the floating tips; fix-pay-at-place fixes the per-place pay.

**Your findings.** IDs, evidence and screenshots are in docs/process/qa-mobile-beta-3.md, docs/QA.md (last section) and docs/screenshots/qa-mobile-beta-3/. Two reviewers' logs aren't integrated yet; their worktrees are /home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19 (ux-review-beta-2: docs/process/ux-review-beta-2.md, test/e2e/beta-ux-review-2.e2e.js) and /home/user/melon-seek/.claude/worktrees/agent-a68824246cf4a2774 (qa-desktop-beta-3).
- M-33: drawer "Same role elsewhere": 4 captions of 2–4 lines, up to 33 words (app.js `sameRoleSection`, viz/comps.js `NOTE_BASE`; the tooltip code in viz/comps.js belongs to fix-touch-tips, so touch only the caption text there).
- M-34: Insights Pay estimate card explainer is 5 lines and 30 words, plus `__auto` 3 lines, `__accuracy` 2 and `__asof` 2 (features/compstimate.js).
- M-35 / UX-35: the Juice explainer above the list is 3 lines and 30 words (`juiceScaleNote`).
- M-36 / UX-60: the filter sheet's notes run 2–4 lines: salary (30 words, 4 facts), seniority (`SEN_NOTE`), location (`LOC_NOTE`), and Google's "Grouped by job title" label at 360 px.
- M-37: drawer lines that wrap to 2–3 lines: Juice head-net ("…(using San Jose's rent and living costs…)"), the no-Juice line, "Open 180+ days…", and Netflix's general-application line.
- M-38: the drawer percentile line `d-pct-text` is cut off ("Pays more than 72% of Amazon's roles in the …") on 6 boards. This breaks fix-density's own rule.
- M-39: badge popover lines run 3–4 lines (6 on the main site when a live fetch fails); the More sheet note runs 2.
- M-41: Insights row names are cut to 6–9 letters ("Network…", "Datacen…", "Mountain…"). On touch the full name appears only by applying the filter.
- M-45: "Microsoft" shows as "Micros…" in the beta top bar at 380–392 px (74.4 px of text in a 74.2 px box; M-27's whole-pixel scrollWidth check passes while the name is cut).
- M-46: when no role in view has pay (Google l=Buenos Aires), the stats line is a bare "Details" button.
- UX-53: at 360x740 the Insights tile note is cut ("of 2,781 salaried ro…").
- UX-54: at 360x740 the search placeholder reads "Search rol" (needs 95 px, gets 93).
- UX-55 (desktop too, and the main site): at 1440 the Insights "Middle half" tile cuts its number ("$188K–$25…"). A number is never ellipsized (UX-15). Write ranges like the cards ("$188K–252K"), or let the value shrink.
- UX-58: the drawer's "No Juice" box text touches its border (`.d-juice { padding: 0 }` at styles.css:1014 overrides `.d-juice--none` at 876).
- UX-61 (words): badge "(GitHub often starts it hours late)" → "(sometimes a few hours late)"; "Download CSV" → "Download a spreadsheet (CSV)"; "Incl. top shift pay" → "Includes top shift pay"; Compstimate "Estimated base salary" → "Estimated base pay"; Insights "salaried roles" / "listed salaries" → "with pay" / "posted pay ranges"; one currency name instead of "USD", "US$" and "US dollars"; chart rows "no published salary" → "no pay listed"; curly apostrophes in the Same role notes.
- UX-62: the "/" key cap in the search box is 11 px, the only text under 12 px.
- A-9: every disclosure is named just "Details ▾" (8 in Insights, 2 on the first screen), none described, 16.8–19.6 px tall on desktop. Give each an accessible description (aria-describedby to its line or card heading); `content: " ▾" / ""` for the arrow; desktop min-height 24 px with negative margins so the layout does not move.

**The rule (from fix-density, now enforced):** on a phone at 390x844 and 360x740, every caption, note or explainer is ONE line, with any further facts behind its Details; no text is cut mid-word except a long proper name inside a list row that also shows the full name on tap and keyboard; numbers are never cut. Never remove a fact: move it behind Details. Pay stays exactly as posted (the user: "present pay as posted, we must not misrepresent the companies and roles"; big-tech figures are base pay only and stay labelled that way).

**Your job:**
1. Turn on the red tests for your IDs: cherry-pick test/e2e/beta-ux-review-2.e2e.js's commits only if you need them, or write your own test file test/e2e/fix-phone-text.e2e.js (registered in scripts/e2e.js) with one test per ID that fails before and passes after. The qa-mobile-beta-3 group (`^Beta mobile QA 3`) is already on the branch: your IDs there must pass after your fix.
2. Add a density guard that would have caught these: on every big-tech board at 390x844 and 360x740, light and dark, measure every visible caption/note/explainer (line count from its height and line-height) and every text box whose scrollWidth > clientWidth + 0.5 (sub-pixel, unlike M-27). Fail on any multi-line caption or cut text outside an allow-list you document.
3. Make the test file runnable with `--browser=webkit` the way test/e2e/fix-company-scroll.e2e.js is, and add one step to .github/workflows/webkit-phone.yml (the "Playwright WebKit, iPhone profile" job) that runs it. fix-touch-tips is adding its own step to that file: put yours right after the "Company sheet geometry on WebKit" step.
4. Screenshots: before and after for each ID, phone and desktop, light and dark, in docs/screenshots/fix-phone-text/, shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-phone-text`.

**Data and build:**
- Today's crawl is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots in your worktree, and never commit them.
- Build with `node scripts/build-static.js` (your worktree's dist/ is yours) and serve with `node scripts/cycle/serve.mjs --dist dist --pid <scratch pidfile>`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. WebKit is not installed here; the lead runs webkit-phone.yml on GitHub. Never `playwright install`; no `pkill -f` / `pgrep -f`.
- Give every server, browser or test command a timeout, so nothing can hang.

**Ownership** (other lanes are editing the same files, so stay inside these parts):
- the caption, note, explainer and label TEXT and its CSS in public/app.js (`sameRoleSection` captions, `juiceScaleNote`, the drawer Juice/listing/percentile lines, the stats line, the badge popover and More sheet notes, the filter-sheet notes), public/features/compstimate.js, public/features/insights.js (row names, tile notes, the middle-half value), public/features/note.js (the Details disclosure), public/viz/comps.js `NOTE_BASE` only, public/styles.css and public/features/features.css for those rules only;
- NOT yours: tooltip/popover open-close code (fix-touch-tips), `payPill` and the drawer's pay headline and Pay by place (fix-pay-at-place), the preview, filter controls, focus and keyboard handling (fix-phone-controls), and the chart and map drawing (the viz lane).
Also yours: the NEW test/e2e/fix-phone-text.e2e.js (registered in scripts/e2e.js), the webkit-phone.yml step, docs/process/fix-phone-text.md (your log in TEMPLATE.md structure, with a `## State` section at the top), docs/process/prompts/fix-phone-text.md (this prompt pasted verbatim).

**Rules:**
- Keep the UI simple: no new visible control. Use plain words.
- Commit small and often in your worktree with explicit paths ("WIP: …" is fine). Send the lead each finished, tested piece by SendMessage to "main" (SHA, what it fixes, tests), then keep going. The lead checkpoints your worktree every 15 minutes and integrates. Never push.
- Before you send any SHA:
  - run `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved OUT of data/, as CI runs it. S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
  - run your e2e plus the full e2e suite with data linked: no new failures (the reviewers' red groups fail by design until their lanes land; say which). Then `git checkout -- docs/screenshots` for any screenshots the suite rewrote outside yours.

Report: per ID, before → after (with the measured lines or widths), the guard's result on every board, tests that fail before and pass after, SHAs and screenshots.

You are the fix lane for one bug on melon-seek (/home/user/melon-seek, "the Zillow of job postings", a zero-build vanilla-JS static site). Role name: fix-company-scroll. Save this prompt verbatim to docs/process/prompts/fix-company-scroll.md and write your log to docs/process/fix-company-scroll.md (follow docs/process/TEMPLATE.md).

The user, on their own phone, 2026-10-11: "I'm seeing that the list of companies don't scroll properly when we're in the beta mode" and then "I'm still not able to scroll down from the list of company drop down!! Launch an agent to fix it!!!" This is the live site, https://alvations.github.io/melon-seek/beta/. The user's phone and browser are not known; assume iPhone Safari is likely, but the fix must work on every phone browser.

What the lead found:
- On a phone, the company menu opens as a bottom sheet: `#popover.popover--company`, built by `makeCompanyMenu()` and `togglePopover()` in public/app.js, styled in public/styles.css. The phone rules are around lines 660-672 and 1185-1194: max-height 82dvh, `body.kb-open` keyboard rules, `.pop-body, .company-list { overscroll-behavior: contain; -webkit-overflow-scrolling: touch }`.
- Inside the sheet, `.company-list` is a SECOND scroll box with `max-height: 340px` (styles.css, around line 841), nested inside `.pop-body`, which is also `overflow: auto`. Beta has 13 companies under "Big tech" and "More companies" headings, plus saved searches above them when present: about 615 px of content in a 340 px window. The search box above it gets focused when the sheet opens.
- In headless Chromium with real CDP touch events (`Input.dispatchTouchEvent`), the list does scroll. So the bug is likely in WebKit (iPhone Safari): nested scroll boxes inside a position:fixed sheet, a flex child without `min-height: 0`, keyboard and visual-viewport rules, or the body scroll lock while the sheet is open. `Input.synthesizeScrollGesture` does not work headless here; don't use it.

Fix it robustly, not ad hoc. Recommended direction, unless you find a better root cause: on phones, the company sheet has ONE scroll container. The search box is pinned at the top, and the list fills the rest of the sheet (flex: 1; min-height: 0; overflow-y: auto; touch-action: pan-y), with no fixed 340 px inner box. The sheet's height works with the keyboard open (`--vvh`), in landscape and on small phones (320x568). The last company is always reachable and fully visible. Swipes that start on a row, a heading or a gap all scroll the list, and never the page behind. Check that no ancestor's `touch-action`, and no JS touch or pointer handler (including the results-sheet drag in app.js around line 4142), interferes. Apply the same single-scroller rule to the other bottom-sheet popovers (data badge, More) if they share the pattern. Desktop must not change.

Gate:
1. Write the failing tests first, in a NEW file test/e2e/fix-company-scroll.e2e.js, registered in scripts/e2e.js the way the others are:
   - 320x568, 390x844, 430x932 and 844x390 landscape, with isMobile, hasTouch and an iPhone user agent;
   - beta and main site; with saved searches; with a search typed; with a small visual viewport for the keyboard;
   - geometry assertions that work in any engine: the list is the only scroll container, the sheet bottom is within the viewport, the last item scrolls fully into view, and computed styles show no nested max-height box;
   - plus a real touch-swipe test in Chromium.
2. Put the tests' cases that need only standard Playwright APIs where they also run under WebKit.
3. Write a GitHub Actions workflow, .github/workflows/mobile-webkit.yml (workflow_dispatch). It installs Playwright WebKit on the runner (`npx playwright install --with-deps webkit`; allowed on a runner, never in this sandbox), builds the site, and runs the new test file under WebKit with an iPhone profile.
4. Run `npm test` with MELON_BETA_SNAPSHOT_DIR set to an empty folder, and the full e2e suite.

Setup:
- Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek.
- Build with `node scripts/build-static.js --out <your scratch dir>/dist` and serve with `node scripts/cycle/serve.mjs --dist <dir> --pid <file>`; stop it with `kill "$(cat <file>)"`. Never `pkill -f` or `pgrep -f`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install` here.
- Take before and after screenshots into docs/screenshots/fix-company-scroll/ and shrink them with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-company-scroll`.

You own public/styles.css, the company-menu and popover code in public/app.js, your new test file, the workflow and your log. A mobile QA agent is testing the shared checkout and other agents are editing elsewhere, so don't touch other files. If you must, write a patch to docs/process/patches/fix-company-scroll-<name>.diff. Commit locally in your worktree at milestones, never push, and report your commit SHAs, the root cause, the before and after test results, and anything you could not verify in WebKit. Be quick: the user is waiting. Aim to finish within about 45 minutes.

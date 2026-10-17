# Prompt: fix-phone-sizes (verbatim, 2026-10-16)

You are the front-end and UI/UX engineer `fix-phone-sizes` for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app, "the Zillow of job postings". You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (head a92a3c8 or later). Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (UI simplicity budget), docs/process/PLAYBOOK.md (including "Checkpoints" and "Known traps", especially the new "Phones come in more sizes" trap), docs/process/TEMPLATE.md and docs/process/ux.md.

**The user, 2026-10-16 (verbatim):**

> "Whatever was done with the ui/UX it needs to go through the mobile and desktop QC QA again. The mobile page on the beta site is totally broken"

> "Make sure we check for all phone sizes from iPhone mini to razr to duo or something"

**The phone size matrix** is test/e2e/phone-sizes.mjs: 19 sizes and postures, from the folded Galaxy Fold (280x653) and the iPhone SE 1st gen (320x568) to the Surface Duo spanned (1114x720), plus the Razr cover screen (352x355) and landscape. test/e2e/webkit/phone-smoke.mjs runs it:

    NODE_PATH=<scratch>/pw/node_modules node test/e2e/webkit/phone-smoke.mjs --dist dist --out <scratch>/m --engines chromium --sizes all --boards apple,amazon,google,meta,microsoft,netflix,nvidia

It fails on page errors, a page wider than the screen (checked against the screen; a phone zooms out a wider page and `innerWidth` grows), and main controls off screen or covered. It also lists controls cut at the sides and cut text. The lead's first run on the deployed build found:
1. **Razr cover screen (352x355) broken.** The landscape rule `@media (max-width: 860px) and (max-height: 500px)` (public/styles.css:1239, 1300, 1404) catches a square, short screen. The top bar lays out in one row at 476–495 px, so the phone zooms the page out. The search box covers the Chart tab, and the bottom half is blank (no results sheet). Fix the rules so landscape means landscape (orientation or aspect ratio), and give short screens (height ≤ 400) a layout where the top bar fits the width, the view switch is reachable, and the results sheet shows.
2. **Company name cut at 320 px ("Appl…") and gone at 280 px** (the folded Fold shows only the dot and the chevron). Look at the `@media (max-width: 379px)` and `(max-width: 400px)` rules. The board's name must always be readable; drop or shrink something else first (the Beta tag, the badge's text, the theme button go behind More, as fits ROADMAP §8). This includes M-45: "Microsoft" shows as "Micros…" at 380–392 px (74.4 px of text in a 74.2 px box), from docs/process/qa-mobile-beta-3.md.
3. **The Group select runs off the right edge at 280 px** ([189, 301] on a 280 px screen).
4. **Surface Duo spanned (1114x720)** gets the desktop layout, and the 34 px hinge (at x 540–574) runs through the chart and the search box. Support dual screens with `@media (horizontal-viewport-segments: 2)` and `env(viewport-segment-*)`: chart and filters on the left screen, the list and the job page on the right, nothing straddling the hinge. Chromium can emulate it (CDP `Emulation.setDisplayFeaturesOverride` with a vertical fold), so a test can check it. Also check the Fold open (690x829) and the Duo single screen (540x720) look intended, not stretched phone UI.
5. Also listed, but owned by other lanes; don't fix them, just make sure your layout doesn't make them worse:
   - Amazon's long department names cut in chart rows and filters (fix-phone-controls M-40, the viz lane);
   - the off-screen, focusable filter-sheet buttons at 1005–1114 px (fix-phone-controls UX-56).

**Your job:**
1. **Guard first:** test/e2e/phone-matrix.e2e.js, registered in scripts/e2e.js, that runs the matrix's hard checks on every size in phone-sizes.mjs and on 3 boards (apple, amazon, google). It is red now on the Razr cover screen and the 280/320 name. Add your own checks:
   - the company name's full text is visible (scrollWidth ≤ clientWidth + 0.5) at every size;
   - every main control (company menu, search, Filters, view switch, Clusters/Ranges, Group, results sheet handle on phone layouts, Sort) is on screen and not covered;
   - the first card, the drawer (open one job) and the filter sheet each fit the width with no horizontal scroll;
   - the Duo spanned posture with the fold emulated.
   The test must be runnable with `--browser=webkit` the way test/e2e/fix-company-scroll.e2e.js is (skip only what needs CDP, and say so).
2. **Fix** in public/styles.css (and the top bar's markup in public/index.html / public/app.js only if CSS alone can't).
3. **Don't regress** the earlier phone fixes:
   - `^Beta mobile QA` and `^Beta mobile QA 2` groups;
   - test/e2e/fix-company-scroll.e2e.js;
   - fix-density's one-line rule;
   - desktop at 1440x900, 1280x800 and 1024x768;
   - the tablet 768x1024.
4. **Screenshots:** before and after for every size in the matrix (Apple board, light; plus dark for the three smallest and the Duo spanned) in docs/screenshots/fix-phone-sizes/, shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-phone-sizes`.

**Other lanes running now, on the same files:**
- fix-phone-text: caption text and one-line rule. It owns M-45's wording only if it's a text change; the layout part is yours. Tell the lead if you two collide.
- fix-phone-controls: preview feedback, filter-sheet `inert`, department name labels, keyboard.
- fix-touch-tips: floating tips.
- fix-pay-at-place: per-place pay.
Stay in layout: breakpoints, the top bar, the sheet's sizing, and dual-screen support. Don't touch their code paths. Keep each CSS change in its own rule block so cherry-picks don't collide.

**Data and build:**
- Today's crawl is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots in your worktree, and never commit them.
- Build with `node scripts/build-static.js` (your worktree's dist/ is yours) and serve with `node scripts/cycle/serve.mjs --dist dist --pid <scratch pidfile>`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. WebKit is not installed here; the lead runs webkit-phone.yml on GitHub, which runs phone-smoke on every size in WebKit and opens every board in real iPhone 13 mini, 16 and SE Simulator Safari. Never `playwright install`; no `pkill -f` / `pgrep -f`.
- Give every server, browser or test command a timeout, so nothing can hang.

Also yours:
- the NEW test/e2e/phone-matrix.e2e.js;
- docs/process/fix-phone-sizes.md, your log in TEMPLATE.md structure, with a `## State` section at the top;
- docs/process/prompts/fix-phone-sizes.md, with this prompt pasted verbatim.

**Rules:**
- Keep the UI simple: no new visible control. Use plain words.
- Commit small and often in your worktree with explicit paths ("WIP: …" is fine). Send the lead each finished, tested piece by SendMessage to "main" (SHA, what it fixes, tests), then keep going. The lead checkpoints your worktree every 15 minutes and integrates. Never push.
- Before you send any SHA:
  - run `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved OUT of data/, as CI runs it. S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
  - run your e2e plus the full e2e suite with data linked: no new failures (the reviewers' red groups fail by design until their lanes land; say which). Then `git checkout -- docs/screenshots` for any screenshots the suite rewrote outside yours.

Report: a size-by-size table (before → after: page width, name visible, controls, sheet, Duo hinge), the tests that fail before and pass after, SHAs and screenshots.

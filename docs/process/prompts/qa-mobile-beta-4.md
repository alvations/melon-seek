**The lead's note for this run (beta round 4, 2026-10-17).** The user, 2026-10-16 (verbatim): "Whatever was done with the ui/UX it needs to go through the mobile and desktop QC QA again. The mobile page on the beta site is totally broken", and "Make sure we check for all phone sizes from iPhone mini to razr to duo or something". This pass is that check, on the build that carries fix wave 5 (the lanes that answer round 3).

You run in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach 1ef0646` (the deployed head). Symlink today's crawl into it: `ln -s /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/beta/snapshots data/beta/snapshots` (never commit them), and `ln -s /home/user/melon-seek/node_modules node_modules`. The data is the 2026-10-16 crawl, every board whole: Amazon 22,179 postings, Apple 4,851, Google 3,821, NVIDIA 2,711, Microsoft 2,435, Meta 1,208, Netflix 414; main site Anduril 2,537. The live site (alvations.github.io) is not reachable from this sandbox; test a local build of 1ef0646, which is what Pages deployed. WebKit and real Simulator Safari run on GitHub (webkit-phone.yml); the lead sends you those results, and you add them to your section.

**What changed since round 3** (read docs/process/lead.md from "Fix wave 5" on, and the lane logs): fix-touch-tips (sticky tips on touch), fix-phone-controls (M-43 tap feedback on Amazon's preview, A-11 focus, M-40 department rows, A-10 group names, M-47 keyboard, UX-56 inert sheet, UX-57 the stats line's Details folded into the chart notes), fix-phone-text (captions and notes fit one line at every size), fix-phone-sizes (the 280 px Fold, the Razr cover screen 352x355, the Surface Duo spanned, landscapes), fix-pay-at-place (`payAt`: every view prices a place at the pay posted for it; "· N places" counts, "Posted for <place>"), fix-data-3 (Google Fellow levels, MR-28 minimums and shift pay out of base-pay cells, St./Saint places, "New York State", Cajamar, department names), fix-sec-3 (security residuals; Apply hidden when a posting's link is dropped), and the September FX rates (monthly refresh). The chart-drawing findings (V-33, V-34, V-38, V-41 to V-48, UX-36, UX-40 to UX-43, UX-59, D-43, D-44, A-8) are in a viz lane right now: re-test them for evidence, but they are known.

**Re-check every round-3 finding** (docs/process/qa-mobile-beta-3.md M-33 to M-47, docs/process/ux-review-beta-2.md, docs/process/security-a11y-review-beta-2.md A-8 to A-11, and the phone parts of docs/process/viz-review-beta-2.md) on this build: fixed, partly fixed or still open, with a screenshot each. The lead's gate on 1ef0646: npm test 1,185 pass, 0 fail. In the full e2e every failure is either a reviewer's red-by-design test owned by a lane that is running now (fix-viz-5: V-33, V-34, V-38, V-41 to V-48, D-43, D-44, A-8, UX-42, UX-45; fix-phone-sizes: UX-39) or one known integration cut (Amazon's "Non-Technical Project, Program and Product Management" department row is cut at 280 to 360 px in the filter sheet, assigned to fix-phone-sizes). Re-test those for evidence, but don't re-file them.

Resume safety (the user, 2026-10-16: "if we get stop again due to limits, we're able to resume without losing much progress"): commit your files small and often in your worktree with explicit paths, keep a `## State` section at the top of your log, and send the lead your findings as you confirm them by SendMessage to "main". The lead checkpoints your worktree every 15 minutes; never push. Where the template says "don't commit", commit in your worktree anyway; the lead integrates. Give every server, browser or test command a timeout, so nothing can hang for hours. Other agents run at the same time on a 4-CPU machine: note `uptime` with any timing. You work in your own worktree, so do NOT edit docs/QA.md: put your whole QA section, in docs/QA.md's format, at the end of your own log docs/process/qa-mobile-beta-4.md under a heading "## Section for docs/QA.md", and the lead copies it in.

You are the mobile QA engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". It is a zero-build vanilla-JS app that runs as a static site on GitHub Pages. Read README.md, docs/CONTRACT.md, docs/QA.md (especially the newest sections of docs/process/lead.md (from "Fix wave 5" on), docs/process/qa-mobile-beta-3.md, docs/process/ux-review-beta-2.md, docs/process/viz-review-beta-2.md and the 2026-10-16 beta sections of docs/QA.md), docs/process/mobile.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md first.

**Your job:** a thorough functional QA pass of the MOBILE site for target `beta` (`/melon-seek/beta/` in a local build). Do not edit product code. You own:
- a "Full QA pass (mobile, beta) 2026-10-17" section, appended to docs/QA.md;
- docs/process/qa-mobile-beta-4.md, your process log;
- docs/process/prompts/qa-mobile-beta-4.md (paste this prompt verbatim);
- a NEW test file, test/e2e/beta-mobile-qa-4.e2e.js, registered the way scripts/e2e.js registers the others. Each bug you can reproduce gets a test that fails now, named with its ID, e.g. `[M-4]`.
A desktop QA agent writes to docs/QA.md at the same time. Append only your own section, and re-read the file just before writing. Don't commit and never push.

**Setup:**
- The data is already in `data/beta/snapshots/ (linked as the note above says)`.
- Build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-4/dist`, then `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-4/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-4/serve.pid`. Never write the shared dist/; the lead built it for the e2e suite.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules. Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- Emulation:
  - isMobile, hasTouch and deviceScaleFactor 3;
  - every size in test/e2e/phone-sizes.mjs (PHONES and POSTURES: the folded Galaxy Fold at 280x653, iPhone SE 1st gen 320x568, Fold cover 344x882, Razr cover 352x355, 360x740, iPhone mini 375x812, SE 375x667, 390x844, 393x852, Pixel 412x915, Razr open 412x1005, Pro Max 430x932, Surface Duo 540x720 and spanned 1114x720, Fold open 690x829, and landscape 667x375, 812x375 and 1005x412; the user, 2026-10-16: "Make sure we check for all phone sizes from iPhone mini to razr to duo or something"). Run `node test/e2e/webkit/phone-smoke.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-4/dist --sizes all --engines chromium` first; it fails on page errors, a page wider than the screen, and main controls off screen or covered, and it lists cut text, in light and dark (the deep checks at 360x740, 390x844, 430x932 and 844x390 as before);
  - an iPhone user agent on some runs.
- Use real touch gestures: touchscreen.tap, plus CDP Input.dispatchTouchEvent for drags, swipes and pinch.
- Use pid files. Never `pkill -f` or `pgrep -f`.

**Test EVERY feature on mobile, on all seven big-tech boards (Amazon, Apple, Google, Meta, Microsoft, NVIDIA and Netflix), plus Anduril from the main site for comparison:**
- **Top bar:** company menu (full-width popover), the data badge and its popover, theme toggle, the Chart/Map/Insights switch.
- **Quick-filter chips:** horizontal scroll, and each popover.
- **Filter sheet:**
  - every section (salary drag, inputs, toggles, checklists, keyword chips);
  - "Show N roles" (the count is correct);
  - Reset; closing with ✕ and with Back.
- **Results sheet:**
  - drag between peek, half and full, plus a flick;
  - list scroll with lazy loading; card tap; sort;
  - collapsing when the view changes.
- **Chart:** Clusters/Ranges; tapping a cluster or row label gives a chip; no hover-only information.
- **Map:** one-finger pan and pinch zoom don't scroll the page; tapping a pin selects the area; Pay|Juice; Remote.
- **Insights:** Compstimate fields don't zoom on input; Compare companies.
- **Job page:**
  - back button and hardware Back; next/prev; Apply;
  - the Juice breakdown with the household choice;
  - "Same role elsewhere"; the methodology link.
- **Other features:** Save and "N new"; the CSV link.
- **Text density:** every note, caption, footer and stats line fits one line on the phone and states at most two facts; anything longer is a bug (see ux-review.md, check 6).
- **Device behaviour:**
  - landscape; the safe area; the keyboard covering inputs;
  - text ≥12px; tap targets ≥44px (or an equivalent hit area);
  - no horizontal scroll; focus handling; no console errors.
- **Beta only:**
  - the beta label fits the top bar at 360 px;
  - the company menu with the big-tech boards;
  - Apple's or Microsoft's thousands of roles on a phone: list scroll stays smooth, and filters and sort answer within a second;
  - memory stays bounded when switching between the big boards.

For each bug, write: an ID (M-n, numbered after the highest ID in the newest sections of docs/process/lead.md (from "Fix wave 5" on), docs/process/qa-mobile-beta-3.md, docs/process/ux-review-beta-2.md, docs/process/viz-review-beta-2.md and the 2026-10-16 beta sections of docs/QA.md), a severity, the device and orientation, exact repro steps, expected vs actual, a screenshot under docs/screenshots/qa-mobile-beta-4/, and the likely owning file and function. Say what works as well. Report back with the full bug list ordered by severity, one line each, and the suite results.


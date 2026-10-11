**The lead's note for this run (2026-10-11).** Work in the shared checkout /home/user/melon-seek, which is at the pushed head with fix wave 3 (the beta persona findings BP-1 to BP-17; see "Fix wave 3" in docs/process/lead.md). The data in data/snapshots/ and data/beta/snapshots/ is today's crawl (every board observed 2026-10-11 between 06:38 and 08:00 UTC: Apple 4,875 postings, Google 3,417, NVIDIA 2,663, Microsoft 2,279, Netflix 457, Anduril 2,491). The lead built it for the reviewers into /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/cycle-beta4/dist; serve that build (`node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/cycle-beta4/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-2/serve.pid`) instead of building your own (this replaces the build step under Setup below), unless you need a server-mode check. Other review agents run at the same time on a 4-CPU machine, so run heavy steps one at a time. This is the second mobile pass on beta: the first, qa-mobile-beta (M-19 to M-27), and its tests in test/e2e/beta-mobile-qa.e2e.js are not yours to edit. Re-check each of its bugs and say fixed or open, check every fix wave 3 change on the phone, then number new bugs from M-28.

You are the mobile QA engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". It is a zero-build vanilla-JS app that runs as a static site on GitHub Pages. Read README.md, docs/CONTRACT.md, docs/QA.md (especially the beta sections of docs/process/lead.md (beta stage 1, beta fix batches 1 and 2, beta perf, beta persona review and fix wave 3), and "Full QA pass (desktop, beta) 2026-10-10" and "Full QA pass (mobile, beta) 2026-10-10" in docs/QA.md), docs/process/mobile.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md first.

**Your job:** a thorough functional QA pass of the MOBILE site for target `beta` (`/melon-seek/beta/` in a local build). Do not edit product code. You own:
- a "Full QA pass (mobile, beta) 2026-10-11" section, appended to docs/QA.md;
- docs/process/qa-mobile-beta-2.md, your process log;
- docs/process/prompts/qa-mobile-beta-2.md (paste this prompt verbatim);
- a NEW test file, test/e2e/beta-mobile-qa-2.e2e.js, registered the way scripts/e2e.js registers the others. Each bug you can reproduce gets a test that fails now, named with its ID, e.g. `[M-4]`.
A desktop QA agent writes to docs/QA.md at the same time. Append only your own section, and re-read the file just before writing. Don't commit and never push.

**Setup:**
- The data is already in `data/beta/snapshots/`.
- Build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-2/dist`, then `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-2/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-2/serve.pid`. Never write the shared dist/; the lead built it for the e2e suite.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules. Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- Emulation:
  - isMobile, hasTouch and deviceScaleFactor 3;
  - 360x740, 390x844, 430x932 and 844x390 landscape, in light and dark;
  - an iPhone user agent on some runs.
- Use real touch gestures: touchscreen.tap, plus CDP Input.dispatchTouchEvent for drags, swipes and pinch.
- Use pid files. Never `pkill -f` or `pgrep -f`.

**Test EVERY feature on mobile, on Apple, Microsoft, Google, NVIDIA and Netflix, plus Anduril from the main site for comparison:**
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
- **Device behaviour:**
  - landscape; the safe area; the keyboard covering inputs;
  - text ≥12px; tap targets ≥44px (or an equivalent hit area);
  - no horizontal scroll; focus handling; no console errors.
- **Beta only:**
  - the beta label fits the top bar at 360 px;
  - the company menu with the big-tech boards;
  - Apple's or Microsoft's thousands of roles on a phone: list scroll stays smooth, and filters and sort answer within a second;
  - memory stays bounded when switching between the big boards.

For each bug, write: an ID (M-n, numbered after the highest ID in the beta sections of docs/process/lead.md (beta stage 1, beta fix batches 1 and 2, beta perf, beta persona review and fix wave 3), and "Full QA pass (desktop, beta) 2026-10-10" and "Full QA pass (mobile, beta) 2026-10-10" in docs/QA.md), a severity, the device and orientation, exact repro steps, expected vs actual, a screenshot under docs/screenshots/qa-mobile-beta-2/, and the likely owning file and function. Say what works as well. Report back with the full bug list ordered by severity, one line each, and the suite results.

**The user's report, and how to handle it (the lead, 2026-10-11).** The user wrote: "Make sure you check the mobile version properly. I'm seeing that the list of companies don't scroll properly when we're in the beta mode. Don't just fix it adhoc. Do the QA and QC of the sites properly". Treat this as the top item of your pass, and use it to find the whole class of bug, not one instance.
- What the lead found so far. On the beta site the company menu opens as a bottom sheet (`#popover.popover--company`, about 534 px tall on a 390x844 phone). Its `.company-list` is a second scroll box inside the sheet's `.pop-body`, with `max-height: 340px` (public/styles.css), holding 13 companies under "Big tech" and "More companies" headings: 615 px of content in a 340 px window, so about 6 rows show at a time. The main site's list is 373 px in the same window and barely scrolls. In Chromium with real touch input (CDP `Input.dispatchTouchEvent`, as test/e2e/beta-mobile-qa.e2e.js does; note that `Input.synthesizeScrollGesture` does not scroll anything in this headless setup, not even a plain test box, so don't use it), one swipe on the list scrolls it 265 of 275 px. So the bug does not reproduce in Chromium; it is likely in iPhone Safari (WebKit) or in how the nested scroll boxes feel. The user's phone and browser are not known yet.
- Reproduce it before you judge it, and say exactly how you tested. Check every way the list can fail on a phone: a swipe that starts on a company row, on a heading, on the search box or on the gaps; a swipe at the top or bottom of the list (does the gesture move the sheet or the page behind it instead?); a fast fling; with saved searches present (they are added above the companies); with a search typed; in landscape (844x390) and on small phones (320x568, 360x640), where the sheet and the 340 px box compete for height; after the on-screen keyboard opens for the search box (`body.kb-open` sets the sheet's max-height from `--vvh`; emulate a small visual viewport if you can't open a real keyboard); and whether the last company is reachable and fully visible every time.
- Then audit every scrolling area on the phone, on both sites, the same way: the results sheet at each stop (peek, half, full), the filter sheet, the job drawer, every bottom-sheet popover (company menu, data badge, More), Insights, Compstimate, and the drawer's comps chart. Look for nested scroll boxes, `touch-action` rules that block a pan, scroll chaining to the page behind, `overscroll-behavior`, the body scroll lock while a sheet is open, and `-webkit-overflow-scrolling`. Give each one a row in a table: area, how it scrolls, what you tested, result.
- WebKit. Chromium is the only browser engine in this sandbox, and `playwright install` is not allowed here. For iPhone Safari:
  - review the CSS and JS above against known WebKit behaviours: nested scrollers in fixed sheets; dvh and `--vvh` with the keyboard; body `overflow: hidden` not locking the page on iOS; `overscroll-behavior` support by iOS version; programmatic focus and the keyboard;
  - write a GitHub Actions workflow as a patch for the lead (docs/process/patches/qa-mobile-beta-2-webkit.diff). It runs your phone tests on Playwright WebKit with an iPhone profile on a runner, where installing the browser is fine. If you can, add a job on a macOS runner that opens the beta site in the iOS Simulator's Safari, swipes the company list (for example with `idb ui swipe`), and saves screenshots before and after. The lead will push it and run it.
  - Make your new test file able to run under WebKit (no CDP-only calls without a fallback), and say which tests can't.
- Encode each confirmed problem as a failing test (in Chromium where it reproduces there, and in the WebKit workflow where only WebKit shows it). Report the cause with file:line and a recommended fix, but don't fix it: the lead will run a fix lane with your tests as its gate, and you will re-check the fix afterwards.

A container restart can stop you and lose unwritten work: write your log and findings to their files as you go.

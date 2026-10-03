You are the mobile QA engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". It is a zero-build vanilla-JS app that runs as a static site on GitHub Pages. Read README.md, docs/CONTRACT.md, docs/QA.md, docs/process/mobile.md and docs/process/TEMPLATE.md first.

**Your job:** a thorough functional QA pass of the MOBILE site. Do not edit product code. You own:
- a "Full QA pass (mobile) 2026-10-03" section, appended to docs/QA.md;
- docs/process/qa-mobile.md, your process log;
- docs/process/prompts/qa-mobile.md (paste this prompt verbatim);
- optionally, new tests in a NEW file test/e2e/mobile-qa.e2e.js, registered the way scripts/e2e.js registers the others.
Don't commit. A desktop QA agent is writing to docs/QA.md at the same time, so append only to your own section and re-read the file just before you write.

**Setup:**
- **Static build:** run `npm run build`, then serve dist under /melon-seek/ with `PORT=<free port> node docs/process/scripts/qa-audit-static-server.mjs`. That's what users get.
- **Server mode:** spot-check it with `PORT=<free port> node server/index.js`.
- **Playwright:** use the copy in /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules. Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- **Emulation:** isMobile, hasTouch and deviceScaleFactor 3, at 360x740, 390x844, 430x932 and 844x390 landscape, in light and dark, with an iPhone user agent on some runs. Use real touch gestures (touchscreen.tap, plus CDP Input.dispatchTouchEvent for drags, swipes and pinch).
- **Processes:** use pid files. Never `pkill -f` or `pgrep -f` with a pattern your shell contains.

Test EVERY feature on mobile:
- **Top bar:** company menu (full-width popover) search and switch; the data badge and its popover; theme toggle; Chart/Map/Insights switch.
- **Quick-filter chips:** horizontal scroll, and each popover.
- **Filter sheet:**
  - every section (Salary slider with touch drag, inputs, toggles, checklists, keyword chips);
  - "Show N roles" (the count is correct);
  - Reset; closing with ✕ and with the browser Back button.
- **Results sheet:**
  - drag between peek, half and full, plus a flick;
  - list scroll with lazy loading;
  - card tap opens the job page;
  - sort select;
  - the sheet collapses when the view changes.
- **Chart:** Clusters/Ranges; tapping a cluster or row label gives a chip; no hover-only information.
- **Map:** one-finger pan and pinch zoom don't scroll the page; tapping a pin selects the area; Pay|Juice; Remote.
- **Insights:** Compstimate fields with no input zoom; Compare companies.
- **Job page:**
  - back button and hardware Back;
  - next/prev; the Apply link;
  - Juice breakdown, "Same role elsewhere", methodology link.
- **Other features:** Save and "N new"; CSV link.
- **Device behaviour:**
  - landscape;
  - the safe area (simulate env insets if you can);
  - the keyboard covering inputs (simulate with visualViewport if possible);
  - text size ≥12px; tap targets ≥44px (or an equivalent hit area);
  - no horizontal scroll;
  - focus handling; no console errors.

For each bug, write: an ID (M-n), severity, device and orientation, exact repro steps, expected vs actual, a screenshot path under docs/screenshots/qa-mobile/, and the likely owning file and function. Report back with the full bug list ordered by severity (concise, one line each, with IDs).

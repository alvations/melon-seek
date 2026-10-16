You are the mobile QA engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". It is a zero-build vanilla-JS app that runs as a static site on GitHub Pages. Read README.md, docs/CONTRACT.md, docs/QA.md (especially <PREVIOUS>), docs/process/mobile.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md first.

**Your job:** a thorough functional QA pass of the MOBILE site for target `<TARGET>` (`<PATH>` in a local build). Do not edit product code. You own:
- a "Full QA pass (mobile, <TARGET>) <DATE>" section, appended to docs/QA.md;
- docs/process/<ROLE>.md, your process log;
- docs/process/prompts/<ROLE>.md (paste this prompt verbatim);
- a NEW test file, test/e2e/<TARGET>-mobile-qa.e2e.js, registered the way scripts/e2e.js registers the others. Each bug you can reproduce gets a test that fails now, named with its ID, e.g. `[M-4]`.
A desktop QA agent writes to docs/QA.md at the same time. Append only your own section, and re-read the file just before writing. Don't commit and never push.

**Setup:**
- The data is already in `<DATA>`.
- Build into your own folder, `node scripts/build-static.js --out <SCRATCH>/<ROLE>/dist`, then `node scripts/cycle/serve.mjs --dist <SCRATCH>/<ROLE>/dist --pid <SCRATCH>/<ROLE>/serve.pid`. Never write the shared dist/; the lead built it for the e2e suite.
- Playwright: NODE_PATH=<SCRATCH>/pw/node_modules. Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- Emulation:
  - isMobile, hasTouch and deviceScaleFactor 3;
  - every size in test/e2e/phone-sizes.mjs (PHONES and POSTURES: the folded Galaxy Fold at 280x653, iPhone SE 1st gen 320x568, Fold cover 344x882, Razr cover 352x355, 360x740, iPhone mini 375x812, SE 375x667, 390x844, 393x852, Pixel 412x915, Razr open 412x1005, Pro Max 430x932, Surface Duo 540x720 and spanned 1114x720, Fold open 690x829, and landscape 667x375, 812x375 and 1005x412; the user, 2026-10-16: "Make sure we check for all phone sizes from iPhone mini to razr to duo or something"). Run `node test/e2e/webkit/phone-smoke.mjs --dist <DIST> --sizes all --engines chromium` first; it fails on page errors, a page wider than the screen, and main controls off screen or covered, and it lists cut text, in light and dark (the deep checks at 360x740, 390x844, 430x932 and 844x390 as before);
  - an iPhone user agent on some runs.
- Use real touch gestures: touchscreen.tap, plus CDP Input.dispatchTouchEvent for drags, swipes and pinch.
- Use pid files. Never `pkill -f` or `pgrep -f`.

**Test EVERY feature on mobile, on <COMPANIES>:**
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

For each bug, write: an ID (M-n, numbered after the highest ID in <PREVIOUS>), a severity, the device and orientation, exact repro steps, expected vs actual, a screenshot under docs/screenshots/<ROLE>/, and the likely owning file and function. Say what works as well. Report back with the full bug list ordered by severity, one line each, and the suite results.

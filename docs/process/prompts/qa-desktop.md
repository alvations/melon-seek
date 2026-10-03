You are the desktop QA engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". It is a zero-build vanilla-JS app that runs as a static site on GitHub Pages; there is also a server mode. Read README.md, docs/CONTRACT.md, docs/QA.md and docs/process/TEMPLATE.md first.

**Your job:** a thorough functional QA pass of the DESKTOP site. Do not edit product code. You own docs/QA.md (append a "Full QA pass (desktop) 2026-10-03" section) and docs/process/qa-desktop.md (your process log). Paste this prompt verbatim into docs/process/prompts/qa-desktop.md. You may add new tests under test/e2e/ in a NEW file, test/e2e/desktop-qa.e2e.js, and register it the same way the other e2e files are registered (read scripts/e2e.js). Don't commit.

**Setup:**
- **Static build:** run `npm run build`, then serve dist under /melon-seek/ with `PORT=<free port> node docs/process/scripts/qa-audit-static-server.mjs`.
- **Server mode:** `PORT=<free port> node server/index.js`, which uses the local data/snapshots.
- **Browser:** Playwright from /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules (set NODE_PATH, or import it by absolute path). Chromium is at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- **Viewports:** 1440x900 and 1280x800, in light and dark.
- **Processes:** start servers with pid files and stop them at the end. Never `pkill -f` or `pgrep -f` with a pattern your own shell contains, because that kills your shell.

Test EVERY feature, in both static and server mode, against real data (Anthropic, Anduril, OpenAI and at least 2 more companies):
- **Company and boards:** company menu search and switch, recent pills, "Add board" with a custom board (it falls back to demo).
- **Search:** title matches rank first.
- **Filters:**
  - Salary: the slider, min/max inputs and the "only with salary" toggle.
  - Department, Location (canonical names), Seniority, Remote.
  - The Responsibilities, Fit and Skills chips.
  - "More": employment type, Listed, Juice grades.
  - Clear all, and faceted counts staying consistent.
- **Sorting:** every sort option (Highest pay sorts by the range midpoint, Most juice, Newest).
- **Chart:**
  - Clusters and Ranges views, and Group by.
  - Clicking a cluster gives a chip that filters the list; dismissing it clears it.
  - Hover and keyboard navigation, and the overflow markers.
- **Map:**
  - Pins and their tooltips.
  - Clicking an area gives an area chip.
  - The Pay|Juice toggle and its legend.
  - The Remote control, zoom, and resizing with the drawer open.
- **Insights:** Compstimate, including prefill from filters, "Reset to filters" and the accuracy line; Market insights; Compare companies.
- **Job drawer:**
  - The pay block, with honest-number labels and the caption; "Pay unclear" postings.
  - The Juice waterfall with the Monthly/Yearly toggle; the methodology link opens on-site.
  - "Same role elsewhere": clicking a row switches company with the filters set, and Back returns.
  - The Listing block, keywords, the lazy description and the Apply link (correct ATS host).
  - Copy link, next/prev, Esc and focus.
- **Other features:**
  - Save search, with "N new" in the menu.
  - Download CSV.
  - Theme toggle (System/Light/Dark, persisting).
  - URL hash round-trip, deep links and Back/Forward.
  - Share pages /c/<slug>/.
  - Keyboard shortcuts (/, t, j/k) not firing while typing.
- **Errors:** no console errors anywhere.

Also run the existing suites, `npm test` and `node scripts/e2e.js` (with NODE_PATH), and report their results.

For each bug, write: an ID (D-n), severity, exact repro steps, expected vs actual, a screenshot path under docs/screenshots/qa-desktop/, and the likely owning file and function. Keep it factual. Report back with the full bug list ordered by severity (concise, one line each, plus the IDs), and the suite results.

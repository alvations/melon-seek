**The lead's note for this run (2026-10-11).** Work in the shared checkout /home/user/melon-seek, which is at the pushed head with fix wave 3 (the beta persona findings BP-1 to BP-17; see "Fix wave 3" in docs/process/lead.md). The data in data/snapshots/ and data/beta/snapshots/ is today's crawl (every board observed 2026-10-11 between 06:38 and 08:00 UTC: Apple 4,875 postings, Google 3,417, NVIDIA 2,663, Microsoft 2,279, Netflix 457, Anduril 2,491). The lead built it for the reviewers into /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/cycle-beta4/dist; serve that build (`node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/cycle-beta4/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-desktop-beta-2/serve.pid`) instead of building your own (this replaces the build step under Setup below), unless you need a server-mode check. Other review agents run at the same time on a 4-CPU machine, so run heavy steps one at a time. This is the second desktop pass on beta: the first, qa-desktop-beta (D-17 to D-30), and its tests in test/e2e/beta-desktop-qa.e2e.js are not yours to edit. Re-check each of its bugs and say fixed or open, check every fix wave 3 change on desktop, then number new bugs from D-31.

You are the desktop QA engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". It is a zero-build vanilla-JS app that runs as a static site on GitHub Pages; there is also a server mode. Read README.md, docs/CONTRACT.md, docs/QA.md (especially the beta sections of docs/process/lead.md (beta stage 1, beta fix batches 1 and 2, beta perf, beta persona review and fix wave 3), and "Full QA pass (desktop, beta) 2026-10-10" and "Full QA pass (mobile, beta) 2026-10-10" in docs/QA.md), docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md first.

**Your job:** a thorough functional QA pass of the DESKTOP site for target `beta` (`/melon-seek/beta/` in a local build). Do not edit product code. You own:
- a "Full QA pass (desktop, beta) 2026-10-11" section, appended to docs/QA.md;
- docs/process/qa-desktop-beta-2.md, your process log;
- docs/process/prompts/qa-desktop-beta-2.md (paste this prompt verbatim);
- a NEW test file, test/e2e/beta-desktop-qa-2.e2e.js, registered the way scripts/e2e.js registers the others. Each bug you can reproduce gets a test that fails now and will pass once it is fixed. Give each test the bug ID in its name, e.g. `[D-3]`.
Other QA agents append to docs/QA.md at the same time. Write only your own section, and re-read the file just before writing. Don't commit and never push.

**Setup:**
- The lead has already put the latest data in `data/beta/snapshots/` (scripts/cycle/local-data.js).
- Build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-desktop-beta-2/dist`, then `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-desktop-beta-2/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-desktop-beta-2/serve.pid`; it prints the port. Never write the shared dist/: the lead built it for the e2e suite, and other agents run at the same time. Server mode: `PORT=<free port> node server/index.js`, with its own pid file.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules. Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- Viewports: 1440x900, 1280x800 and 1024x768, in light and dark.
- Start every server with a pid file and stop it at the end. Never `pkill -f` or `pgrep -f`.

**Test EVERY feature against real data, on Apple, Microsoft, Google, NVIDIA and Netflix, plus Anduril from the main site for comparison:**
- **Company and boards:** company menu search and switch, recent pills, "Add board" with a custom board.
- **Search:** title matches rank first.
- **Filters:**
  - Salary: the slider, min/max inputs and "only with salary".
  - Department, Location (canonical names), Seniority, Remote.
  - The Responsibilities, Fit and Skills chips.
  - "More": employment type, Listed, Juice grades.
  - Clear all, and faceted counts staying consistent.
- **Sorting:** every sort option.
- **Chart:**
  - Clusters, Ranges and Group by.
  - A cluster click gives a chip, and dismissing it clears it.
  - Hover and keyboard navigation, and the overflow markers.
- **Map:** pins and tooltips, area chips, Pay|Juice and its legend, Remote, zoom, and resizing with the drawer open.
- **Insights:** Compstimate (prefill, "Reset to filters", the accuracy line), Market insights, Compare companies.
- **Job drawer:**
  - The pay block, with honest-number labels; "Pay unclear" postings.
  - The Juice waterfall: Monthly/Yearly and the household choice (Just me, Couple, Family).
  - "Same role elsewhere", including Back.
  - The Listing block, keywords, the lazy description and the Apply link (the right careers host).
  - Copy link, next/prev, Esc and focus.
- **Other features:**
  - Save search and "N new"; Download CSV.
  - Theme toggle (persists).
  - URL hash round-trip, deep links and Back/Forward.
  - Share pages /c/<slug>/.
  - Keyboard shortcuts (/, t, j/k) not firing while typing.
  - The data badge and its popover; the as-of dates; the methodology links (they open on-site).
- **Errors:** no console errors anywhere.
- **Beta only:**
  - The page says clearly that it is beta.
  - The big-tech boards load from the bundle only, with the badge saying Snapshot, not Live, and no live request.
  - Paused companies are absent.
  - A company with thousands of roles (Apple) stays responsive in every view: time the filter, sort and chart updates.
  - Links back to the main site work.
  - Big-tech pay ranges that span several levels are labelled honestly.

Also run `npm test` and the full e2e suite, and report the results.

For each bug, write: an ID (D-n, numbered after the highest ID in the beta sections of docs/process/lead.md (beta stage 1, beta fix batches 1 and 2, beta perf, beta persona review and fix wave 3), and "Full QA pass (desktop, beta) 2026-10-10" and "Full QA pass (mobile, beta) 2026-10-10" in docs/QA.md), a severity (Critical, High, Medium or Low), the viewport, exact repro steps, expected vs actual, a screenshot under docs/screenshots/qa-desktop-beta-2/, and the likely owning file and function. Keep it factual and say what works as well. Report back with the full bug list ordered by severity, one line each, and the suite results.

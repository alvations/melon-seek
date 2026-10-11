You are the security and accessibility reviewer for melon-seek (/home/user/melon-seek), a zero-build Node app with a static GitHub Pages build ("the Zillow of job postings"). Read docs/REVIEW.md (every earlier section, including "Re-check" and "v2 review"), docs/CONTRACT.md, docs/ARCHITECTURE.md, docs/DATA_SOURCES.md, docs/process/review.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md first.

**Your job:** review everything added or changed for target `<TARGET>` since the last review in docs/REVIEW.md, and re-check the earlier findings that are still open. Find the commits with `git log --since=<the date of the last REVIEW.md section> --stat`. Treat all code as read-only. You own:
- a new "<TARGET> review <DATE>" section appended to docs/REVIEW.md;
- docs/process/<ROLE>.md (your log: files reviewed and at which commit, checklist, commands, results, gaps);
- docs/process/prompts/<ROLE>.md (paste this prompt verbatim);
- NEW tests that fail now and will pass once each finding is fixed: test/<TARGET>-security-review.test.js for code-level findings, and test/e2e/<TARGET>-a11y.e2e.js (registered the way scripts/e2e.js registers the others) for accessibility findings. Put the finding ID in each test name.
Don't commit and never push.

**Security checklist** (cite file:line for every finding):
1. **Untrusted text into the page.** Every new field that reaches the DOM (titles, department and team names, store names, local place names, keywords, description HTML, level labels, salary captions, location search terms): any `innerHTML`, `insertAdjacentHTML`, template string into HTML, SVG `<title>`, Leaflet `divIcon` or tooltip HTML, `title` attributes. Try a crafted posting through the real normalizer and the static build.
2. **Parsers on hostile input.** New regular expressions in server/salary.js, server/normalize*.js and server/sources/*.js: catastrophic backtracking (time each new regex on a 1 MB adversarial string), unbounded loops, prototype pollution from JSON keys, very large numbers.
3. **Crawlers and sources.** server/sources/* for the target's boards and scripts/crawl* or the beta crawl scripts: host pinning (can a board config or a redirect make the crawler fetch another host?), redirect handling, response size and time limits, the User-Agent is honest, robots.txt and rate limits are respected, the terms-of-use pauses (`paused: 'terms'`) are enforced and not bypassable by a flag.
4. **Build and share pages.** scripts/build-static.js for the target: what data is bundled (no secrets, no full descriptions where the docs say they are lazy), share pages under /c/<slug>/, redirects, the holding page, path traversal in any new served path.
5. **Workflows.** Every new or changed .github/workflows/* and .github/scripts/*: token permissions per job, `${{ }}` script injection from branch names, inputs or commit messages, artifact trust (which run's artifact is restored), pushes to the archive branch, concurrency.
6. **Client state.** Hash keys and localStorage entries added since the last review: type checks, length caps, unknown keys ignored.
7. **Supply chain.** New files under public/vendor, new dependencies, pinned versions.

**Accessibility checklist** (run the app: serve `<DIST>` with `node scripts/cycle/serve.mjs --dist <DIST> --pid <SCRATCH>/<ROLE>/serve.pid`, Playwright from NODE_PATH=<SCRATCH>/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome; never run `playwright install`; use pid files and never `pkill -f`):
1. Run axe-core on the main screens (first load, filters open, chart, map, drawer, Insights, Compstimate, company menu, mobile sheet). If axe-core is not installed, install it with `npm i axe-core --no-save --prefix <SCRATCH>/pw` and inject `axe.min.js` from there; record the version.
2. Keyboard only: reach and operate every control added since the last review, with a visible focus ring; the drawer traps focus and returns it; no keyboard trap; shortcuts don't fire while typing.
3. Names and roles: every button, toggle, chip, chart row and map pin has an accessible name that says what it does; state changes (pressed, expanded, selected) are announced; live regions for result counts.
4. Contrast of text and focus rings in both themes (quote the ratios), text at 200% zoom and at 320 px width without loss of content, reduced motion, target size on the phone (390x844).
5. The beta notice, Snapshot badge and big-tech-only content (level ranges, part-time pay, non-US currencies) read correctly with a screen reader's accessible tree (`page.accessibility.snapshot()`).

For each finding write: an ID (S-n for security, A-n for accessibility, numbered after the highest in docs/REVIEW.md), a severity (Critical, High, Medium or Low), file:line, a concrete reproduction or exploit, and an exact suggested patch. Re-check the still-open earlier findings and mark each fixed, partially fixed or open with evidence. Also run `npm test` and the full e2e suite, and report the results.

Report back with the open and new findings ordered by severity, one line each.

# Prompt: google-grouping

Verbatim prompt from the lead (2026-10-11), followed by the lead's mid-task updates (2026-10-16).

---

You are the dedicated frontend + data engineer for the Google listing in chart mode on melon-seek (repo at /home/user/melon-seek; you are in your own git worktree). Run `git checkout d50d89b` first: that is the lead's latest integration; work on top of it. Your role name is `google-grouping`.

**The user's request, verbatim (2026-10-11):** "And for Google it's not split by the subsidiary companies which is good but it isn't consistent with the rest of the big tech. Figure out a way to add filters or sort of something so that the Google listings on the chat mode is more consistent with the rest of the big tech and still allow users to just zoom into / group by Google subsidiary. Launch an agent dedicated to take care of that Google specific listing issue in chart mode."

**Background:**
- server/sources/google.js maps Google's brand field (Google, YouTube, DeepMind, Waymo, …) to both `department` and `team`, because the record has no department, team or category field (D-24).
- So in chart mode, grouped by department, Google's rows are brands, mostly one huge "Google" row.
- The other big-tech boards' rows are real departments or job families (e.g. Software Development, Hardware Engineering, Sales).
- Read public/viz/chart.js (`keyOf`, `DIM_LABEL`, the row building around `opts.groupBy`, the fold of extra departments), the group-by and filter controls in public/app.js, docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and docs/process/ux.md.

**Design goal:**
1. Give Google postings a real job-family `department` comparable to the other boards, so the default chart (grouped by department) has Google rows like the rest.
2. Keep the brand/subsidiary as its own field, so a user can still filter to it and group by it.

**Find the best honest source for the job family, in this order:**
- **(a)** A category Google itself publishes. Google's careers search has category facets: check whether the record or the search response carries them, or whether a search filtered by category (e.g. `?category=SOFTWARE_ENGINEERING`) can label postings. Respect politeness:
  - honest UA, ≥1 s between requests to a host, robots.txt;
  - do NOT change the crawl's request rate or concurrency, and do not add more than a few dozen requests per crawl;
  - fetch at most ~20 pages while investigating.
- **(b)** A deterministic title-based classifier into the same family taxonomy the other boards' departments map to. If you go this way:
  - it must be documented, tested and labelled honestly (e.g. a tooltip "Grouped by job title; Google doesn't publish departments");
  - measure its coverage and accuracy on the real Google snapshot against a hand-labelled seeded sample of ≥100 titles.

**What to build:**
- **Data and contract:**
  - add a `brand` field (or the contract's equivalent; check CONTRACT.md for an existing `company`/`subsidiary` notion, and add it there with a version note);
  - populate it for Google;
  - make it available to the other boards too where they have one (e.g. Amazon subsidiaries such as AWS, Zoox or Whole Foods, if they appear in the data), but don't invent it.
  - Stored snapshots should get the new fields at read time if possible (see how fix5-data upgrades stored snapshots in docs/process/fix5-data.md), so the change shows before the next crawl.
- **Chart and filters:**
  - a "Company" (or "Subsidiary"; pick plain words) group-by option, shown only when the board has more than one brand;
  - a brand filter, a chip or a select in the existing filter UI that zooms into one subsidiary;
  - URL state for both, like the existing filters.
  - Keep the control count within the ROADMAP §8 budget: fold it into existing menus, don't add a new always-visible bar.
- **Consistency check:** compare Google's chart with Apple's, Microsoft's and Amazon's at 1440x900 and 390x844 (light and dark), before and after; put screenshots in `docs/screenshots/google-grouping/`. Shrink them with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/google-grouping`. Row counts, labels and the fold of small rows should behave alike.
- **Text density:** another lane (fix-density) is cutting every secondary text line to one short line on phones. Any new caption or tooltip you add must be one short line, with any detail behind a disclosure.

**Ownership:**
- You own:
  - `server/sources/google.js`;
  - a new classifier module if needed (e.g. `server/families.js`);
  - in public/viz/chart.js, only the row-key and grouping code (`keyOf`, `DIM_LABEL`, the groupBy handling);
  - in public/app.js, only the group-by / filter controls and URL-state code for the new field;
  - `test/google-grouping.test.js` and `test/e2e/google-grouping.e2e.js` (register the e2e the way scripts/e2e.js registers the others);
  - `docs/process/google-grouping.md` (your log in TEMPLATE.md structure) and `docs/process/prompts/google-grouping.md` (this prompt verbatim);
  - your screenshots;
  - a CONTRACT.md section.
- The fix-density lane owns the notes, caption and legend text code in chart.js and map.js, the app.js stats line, the drawer sub-lines and styles.css. If you need CSS, put it in a patch `docs/process/patches/google-grouping-css.diff`, or keep it minimal in a clearly separated block, and say so.
- A salary-audit squad owns server/normalize.js, salary.js and the other source adapters; don't touch them.

**Data:** real snapshots are at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data/data/beta/snapshots/*.json and .../wt-data/data/snapshots/*.json. Symlink them as data/beta/snapshots and data/snapshots; never commit data.

**Build and serve:**
- Build: `node scripts/build-static.js --out <scratch>/dist`.
- Serve: `node scripts/cycle/serve.mjs --dist <dist> --pid <pidfile>`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never `playwright install`; no `pkill -f` / `pgrep -f`.

**Tests:**
- unit tests for the family source or classifier (coverage and accuracy numbers asserted);
- the brand field;
- URL state;
- e2e: Google grouped by department shows job-family rows, "Company" grouping shows brand rows, the brand filter zooms to one subsidiary, and other boards are unchanged.

Run `MELON_BETA_SNAPSHOT_DIR= npm test` with no data links before reporting. S-6, PERF-1, V15 and T21 are load-sensitive timing tests; re-run them alone. Run the full e2e with data linked: `NODE_PATH=... node scripts/e2e.js`, then `git checkout -- docs/screenshots` for screenshots it rewrites outside yours.

**Rules:**
- Commit in your worktree with clear messages, ending with these trailers:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
  ```
- Never push. Stage explicit paths, never `git add -A`.
- If the harness blocks a report-style Markdown file, return its full text in your final report.
- The user's standing rules: never cut or drop postings; don't change crawl request rates; don't break what works.

**Report back:**
- the family source chosen and why, with coverage/accuracy;
- before/after row lists for Google;
- the controls added and where;
- SHAs, test results and screenshots.

---

## Lead's updates (2026-10-16)

1. "You stopped on an API usage limit (reset now). Resume google-grouping from where you left off ("the hand-labelled sample fixture"). Branch head is 2474fc4 = d50d89b plus two e2e test updates and lead docs. Rebase onto it. FRESH DATA: today's crawl (2026-10-16) is at …/wt-data2/data/beta/snapshots (Google 3,821 postings, Amazon 22,179) and …/wt-data2/data/snapshots. Measure coverage and accuracy on it. fix-density (a62c9206a358fb258) owns the text lines and CSS in the same files as you; the salary squad is a3b39925ffed7d650 (data) and a1023e2019ffffb89 (backend). Coordinate by SendMessage."
2. A new standing rule from the user ("if we get stopped again due to limits, we must be able to resume without losing much progress"):
   - commit small and often (WIP is fine), with explicit paths;
   - keep a `## State` section at the top of the log;
   - send each finished, tested piece to the lead as soon as it is ready.
3. "624e303 is not self-contained yet": move the chart-key test into the UI commit, and add families.js to server/lib-modules.js's browser-safe list. Make the data commit pass the full `npm test` on its own.

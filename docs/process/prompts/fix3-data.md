You are the pay and data parsing (wave 3) fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `beta (and the main site: both builds share the code)`:** BP-1 (data), BP-2 (Juice side), BP-5, BP-8, BP-9 (data), BP-11, BP-14, BP-15, and keyword-tag noise. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/lead.md "Beta, stage 1c" (BP-1 to BP-17, consolidated) and the five reviews docs/process/persona-beta-18-24.md, -25-34.md, -35-44.md, -45-54.md, -55-plus.md (screenshots in docs/screenshots/persona-beta-*/; each item names the persona, screen, screenshot and owning file).

- **BP-1:** `payTerms` in server/salary.js sets `termWeeks` whatever the interval, so 27 yearly-rate internships are labelled as whole-term pay. Examples: Google "Ireland: €72000" in a 13-week internship; Microsoft "CAD $43,800 - CAD $50,000 per year". Keep `termWeeks` as information, and make sure `originalInterval` says how the pay was stated (shared decision 3).
- **BP-2 (Juice side):** server/juice.js `attachJuice` falls back to another country's pay when the place's currency differs (`currencyMismatch`).
  - Examples: London Juice from Cohere CA$375–465K "78 Juicy"; Munich Juice from NVIDIA Polish pay.
  - Stop computing Juice from another country's pay; return the reason instead (shared decision 1).
  - Report how many postings change.
- **BP-5:** the "CAD" skill tag still appears on 109 Canadian-dollar postings (Google "(CAD)" 64, Microsoft 43, Cohere 2), in cards, the Skills filter and Insights' Skill premium. Fix it for every currency-code format; server/keywords.js, near line 536.
- **BP-8: NVIDIA and Microsoft department names are abbreviations:** "Mgmt, Sys SW", "Program Mgr, Technical", "Mgmt, SW Eng", "Engineer, Sys SW", "Mgmt, Test Eng", "Customer Success Account Mgmt". That is 69 of NVIDIA's 146 departments (1,198 postings) and 5 Microsoft departments.
  - Expand them in plain words in server/sources/eightfold.js (or normalize.js): Mgmt → Management, SW → Software, Sys → Systems, Eng → Engineering, Mgr → Manager.
  - Use a tested word list and keep the board's own wording only where it is not an abbreviation.
- **BP-9:** part-time hourly pay is annualised as full-time (FACTORS.hour = 2080): Apple's part-time Technical Specialist at $22–28.88/h shows "$46K–60K a year", and Juice uses $4,410/mo. That is 52 of Apple's 123 part-time postings. Add `salary.partTime: true` (shared decision 4), and record stated hours where the posting gives them.
- **BP-11:** Art Director, Creative Director and Technical Director are filed as Director+ (26 postings, e.g. Art Director $143K–215K). Same kind of fix as Account Director (NON_EXEC_DIRECTOR_RE, server/keywords.js near line 998). Use evidence: these are senior individual-contributor titles in design and engineering.
- **BP-14:** "What they look for" merges minimum and preferred qualifications ("3 years…", then "4 years…"). 3,282 of 3,417 Google postings have both lists, and Apple and Microsoft post preferred lists too.
  - Split `sections.fit` into required and preferred: add `sections.preferred`, documented in CONTRACT.
  - The app lane will show "Required" and "Nice to have".
- **BP-15: places that aren't places.**
  - Apple store names: "Piazza Liberty", "Via del Corso", "Shinsaibashi", "Umeda", "Rosny 2", "Campania".
  - "Dublinas, Ireland", which is pinned at the middle of Ireland.

  Resolve each to its real city.
- **Keyword-tag noise:**
  - "Evals" on 91 Microsoft and 157 Apple postings, including a field-repair project manager;
  - "Agents" on a UX designer;
  - "Mission / defense" on a nonprofit sales role;
  - "iOS" from Google boilerplate;
  - "TPUs/GCP/Transformers" on technician cards.

  Measure precision on a labelled sample before and after, as the earlier P-17 work did.


**You own these files:** server/salary.js, server/keywords.js, server/normalize.js, server/juice.js, server/geo.js, server/sources/** (eightfold.js, apple.js, google.js and the rest), scripts/vet-salaries.js, docs/CONTRACT.md, docs/VETTING.md, docs/DATA_SOURCES.md, test fixtures your changes re-baseline, and your own new tests.
**Do NOT edit:** public/** (the app, compare and viz lanes), scripts/build-market.js (the compare lane). Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix3-data-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-data/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Worktree lanes** (the usual case): you run in your own git worktree. Symlink `node_modules` and `data/snapshots` from /home/user/melon-seek. Its `dist/`, builds and e2e runs are yours. Commit locally with explicit paths and never push; report the worktree path and commit SHAs. The rest of this paragraph applies only to a lane that shares the main checkout.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-data/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-data/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-data/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix3-data/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix3-data.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix3-data.md.

Never push; the lead integrates and pushes. In a worktree lane, commit locally; in the shared checkout, don't commit. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-11, fix wave 3):**
- You run in your OWN git worktree, created by the harness from 790fa13. Its `dist/` is yours. First run:
  - `ln -s /home/user/melon-seek/node_modules node_modules`;
  - `mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots`.

  These are gitignored; never commit them. Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-data/` for pid files and scratch.
- Three other lanes work in parallel on other files. Shared decisions:
  1. **Pay covers its own country, everywhere a place is involved.** `payLocations(job)` (public/features/shared.js) is the rule.
     - Under a location filter, a job whose pay doesn't cover the filtered place stays listed, but its card says "Pay posted for <country> only".
     - It is left out of that place's pay filter, pay sort, chart, stats line and Juice.
     - Juice is never computed for a place from another country's pay. That retires the `currencyMismatch` fallback in server/juice.js; say why there is no Juice instead.
  2. **Comparisons stay within one country.**
     - "Same role elsewhere", Compare companies, the market cells and the "Pays more than N% of …" line compare a job only with pay for the same country: `payCountry(job)`, the ISO country of `payLocations(job)[0]`.
     - The compare lane adds `payCountry` to shared.js and a country dimension to scripts/build-market.js.
     - When there are too few same-country roles, say so; never fall back to another country silently.
  3. **How the pay was stated decides the label.**
     - `salary.termWeeks` is the programme's length, for information only.
     - The fixed-term "Fixed-term pay, not a yearly salary" wording applies only when the pay was stated per week, per month or for the whole term: `salary.originalInterval` in week, month or term, or `kind: 'stipend'`.
     - A yearly-rate internship reads as a yearly rate, e.g. "€72,000 a year (13-week internship)".
     - The data lane fixes `payTerms`; the app lane fixes `postedTerm` and the pay block.
  4. **Part-time hourly pay is never shown as a full-time salary.**
     - When a posting is part-time and paid hourly, cards and the drawer show the hourly rate as posted. Any yearly figure is labelled "if full-time (2,080 hours)".
     - Juice is not computed unless the posting states the hours; say why.
     - The data lane marks such postings `salary.partTime: true`; the app lane renders it.
  5. **British and American spellings match the same roles** in search (centre/center, defence/defense, programme/program, organisation/organization, -ise/-ize, labour/labor, and so on). The app lane implements it in queryMatchers.
  6. Keep every existing export's signature and return shape; adding fields is fine. If you change normalized output, bump NORMALIZER_VERSION to norm-8, re-baseline the fixtures it affects, and say so.
- **Commits.** Commit locally in your worktree at milestones, so a container restart loses nothing, with explicit paths and the message ending in the two lines below. Never push.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
  ```
  Report your worktree path and SHAs. Shrink screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix3-data`.
- **Tests first.** Encode each finding as a failing test (unit, or e2e in a NEW file test/e2e/fix3-data.e2e.js registered in scripts/e2e.js), then fix it. Before you report, run the whole `npm test` (with MELON_BETA_SNAPSHOT_DIR pointed at an empty folder, as CI) and the full e2e suite after `npm run build`.

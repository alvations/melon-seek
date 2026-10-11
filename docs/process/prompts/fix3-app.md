You are the app shell (wave 3) fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `beta (and the main site: both builds share the code)`:** BP-1 (display), BP-2 (cards, pay filter, sort, stats), BP-6, BP-9 (display), BP-10, BP-12, BP-13 (stats side), BP-14 (display), BP-16, BP-17, and the beta landing. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/lead.md "Beta, stage 1c" (BP-1 to BP-17, consolidated) and the five reviews docs/process/persona-beta-18-24.md, -25-34.md, -35-44.md, -45-54.md, -55-plus.md (screenshots in docs/screenshots/persona-beta-*/; each item names the persona, screen, screenshot and owning file).

- **BP-1 (display):** `postedTerm()` (app.js line 134, no originalInterval → factor 1), the pay block (~line 3380) and the card tip (~2875). Apply shared decision 3: a yearly-rate internship reads "€72,000 a year (13-week internship)". The Juice block must agree with the pay block.
- **BP-2 (cards, pay filter, sort, stats):** apply shared decision 1 under a location filter (`payLocations`). Today, under Zurich, the stats say "0% show pay for Zurich", but cards print "$174K–252K · Zurich +3" (US pay) and "€106K–108K · Zurich +1" (Munich pay), and "Highest pay" sorts by them. With NVIDIA, Munich and a €110K+ filter, 12 of 13 cards show PLN ranges that passed the € minimum. Also show on each card the place its pay is for.
- **BP-6:** a Location search for a country or a local name hides its cities.
  - "Ireland" gives "No matches" at Google (Dublin has 137).
  - "Israel" shows only "Haifa District 13".
  - "Canada", "India", "Germany", "Belgium" and "München" behave the same way.

  Match the country group, and common local names such as München, Köln, Zürich and Wien (makeChecklist, ~line 1799).
- **BP-9 (display):** part-time hourly postings (`salary.partTime`) show the hourly rate as posted on the card and in the drawer. Any yearly figure says "if full-time (2,080 hours)", and Juice says why it is missing (shared decision 4).
- **BP-10:**
  - Going from Apple to Google says "Dropped Columbus, OH (not at Google)", but Google has 15 Columbus roles: Apple's place key is "Columbus, OH", Google's "Columbus". Normalize the keys used to carry a filter across boards.
  - A filter dropped at one board is never put back. Keep it pending, re-apply it at the next board that has it, and say so in the toast.
  - settleKeep is around line 1196; also locKey.
- **BP-12:** shared decision 5 in queryMatchers (~line 541) and titleMatch. Test "data centre", "defence", "programme manager" and "organisation" on real boards.
- **BP-13:** two medians on one screen: the stats line says "$347K median", the chart "Median $352K". The stats line leaves out on-target earnings, and the chart doesn't. Make both use the same set and say which ("base pay median"). The viz lane changes the chart side to match; agree on: exclude `kind === 'ote'` from base-pay medians.
- **BP-14 (display):** when `sections.preferred` exists (the data lane adds it), "What they look for" shows "Required" and "Nice to have" (~line 3416).
- **BP-16:** one drawer gives two ages ("Updated 2 d ago" and "Listed 1 day ago"; one rounds, one floors; line 188 vs ~2849). Use one rule.
- **BP-17:** the Remote filter's "On-site" count equals "Any" (Microsoft 2,298/2,298; line ~1854).
- **Beta landing (5/5 groups):** /beta/ opens on Anthropic ("Anthro…" on phones), although the site is about big tech. On a first visit with no saved view, open on the first Big tech board. The main site is unchanged.
- **If the compare lane's percentile patch arrives, the lead applies it; don't duplicate its logic.**


**You own these files:** public/app.js, public/index.html, public/styles.css, and your own new tests.
**Do NOT edit:** public/features/** (the compare lane), public/viz/** (the viz lane), server/** (the data lane). If you need a change there, write a patch. Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix3-app-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-app/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Worktree lanes** (the usual case): you run in your own git worktree. Symlink `node_modules` and `data/snapshots` from /home/user/melon-seek. Its `dist/`, builds and e2e runs are yours. Commit locally with explicit paths and never push; report the worktree path and commit SHAs. The rest of this paragraph applies only to a lane that shares the main checkout.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-app/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-app/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-app/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix3-app/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix3-app.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix3-app.md.

Never push; the lead integrates and pushes. In a worktree lane, commit locally; in the shared checkout, don't commit. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-11, fix wave 3):**
- You run in your OWN git worktree, created by the harness from 790fa13. Its `dist/` is yours. First run:
  - `ln -s /home/user/melon-seek/node_modules node_modules`;
  - `mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots`.

  These are gitignored; never commit them. Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix3-app/` for pid files and scratch.
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
  Report your worktree path and SHAs. Shrink screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix3-app`.
- **Tests first.** Encode each finding as a failing test (unit, or e2e in a NEW file test/e2e/fix3-app.e2e.js registered in scripts/e2e.js), then fix it. Before you report, run the whole `npm test` (with MELON_BETA_SNAPSHOT_DIR pointed at an empty folder, as CI) and the full e2e suite after `npm run build`.

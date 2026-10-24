# Process log: fix-salary-6

## State
- **Done:**
  - Prompt saved ([prompts/fix-salary-6.md](prompts/fix-salary-6.md), 545e28b). Base 37f54e4 (later than e800c43).
  - Links: data/snapshots, data/beta/snapshots (wt-data2, the 2026-10-16 crawl), node_modules.
  - Base copy of the code in `<scratch>/fs6/base` (git archive 37f54e4); served salaries of every stored posting at the
    base in `<scratch>/fs6/served-before.json` (`tools/served.mjs`, the build's readSnapshot path).
  - Census before (`tools/census.mjs`, `tools/breakdown.mjs`, `<scratch>/fs6/census-before.json`), see §5.
  - The lead approved the plan (00:3x): rows per country line, kr by line country, main-site rows tied, and
    `salary.unlisted` shown in the drawer's pay Details, not only the CSV.
  - Fix committed: 015d801 (parser, normalize, Juice, app, CSV, 18 red tests), 93b8979 (norm-14, golden 0/300 changed,
    refresh fixtures), 6926984 (bulleted degree lines, e2e file registered).
- **In progress:** census after, backtest before/after, docs (DATA_SOURCES §7a, CONTRACT), build, e2e.
- **Next step:** build (`node scripts/build-static.js`), `--grep=fix-salary-6` and the related e2e groups, clean-checkout
  npm test, then send the SHA to the lead.

## 1. Brief
- Prompt: [prompts/fix-salary-6.md](prompts/fix-salary-6.md). S-1 (persona-beta-2-45-54): pay posted for two or more
  countries keeps one country's line and drops the rest, so a Location filter says the pay isn't posted for a place
  the posting prices.
- Owned: server/salary.js, the salary parts of server/normalize.js, the CSV's salary_ranges column, my tests and log.

## 2. Inputs and sources
- docs/CONTRACT.md (Job `salary`, `payAt`, the CSV), docs/DATA_SOURCES.md §7a (DQ-15, SA-4, VT-17 to VT-19),
  PLAYBOOK (Checkpoints, Known traps), TEMPLATE, fix-pay-at-place.md, fix-mr-3.md (norm-13 re-baseline), lead.md
  from Fix wave 5.

## 3. Decisions and rationale
(in progress)

## 4. Replayable steps
(in progress)

## 5. Verification
Census before, base 37f54e4 on the 2026-10-16 crawl (lines found by patterns of their own, then looked up in the
served salary):
- Google: 35 postings with lines for 2+ countries, 97 lines, 63 not stored (62 for a country the posting lists).
- Microsoft: 35 postings with national ranges for 2+ countries, 97 lines, 62 not stored (58 listed); 1,232 US
  postings with a national and an SF Bay Area / NYC range, 993 lines not stored (the other area's range when the
  job's places are all on one side).
- Main site: Cohere 55 postings (183 rows), OpenAI 8 (18 rows), Scale AI 16 (42 rows): every row stored, none tied
  to a place, so no place is priced on them under a Location filter.
- Amazon 2,260 postings / 5,111 rows (19 untied, the lead decision), Apple 391 / 807 (1 untied): unchanged rule.
- Meta, Netflix, NVIDIA, Anduril, Anthropic, Palantir, Shield AI, xAI: no posting with pay for 2+ places.

## 6. Known gaps and follow-ups
(in progress)

## 7. Change log
- 2026-10-23 21:52: start; links, base copy, served dump, census before.
- 2026-10-24 00:30: resumed after the container restart; nothing was lost.

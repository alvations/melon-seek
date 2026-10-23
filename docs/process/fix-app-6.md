# Process log: fix-app-6 (front-end engineer, fix wave 6)

## State
- 2026-10-23 22:00 UTC: **fixes committed, verifying.** Base origin/claude/stoic-ride-54ddxp at db38a30 (detached; later than e800c43).
- Findings (from the persona reviews, wave 2, on e800c43's build; BN-3 to BN-7 from the lead by message):
  - BN-1 (High) false Location counts with a pay minimum and one place picked. Fixed (27bb06c).
  - BN-2 (Medium) a bare "$" median over a view in one foreign currency. Fixed (27bb06c).
  - BN-3 (Medium) the stats line shows the count twice in de-DE / fr-FR / de-CH / pl-PL. Fixed (27bb06c).
  - BN-4 (Medium) part-time hourly pay led with a full-time year called "posted pay". Fixed (27bb06c).
  - BN-5 (Medium) settleKeep(): a place set aside "for now" lost once a Location tick changed. Fixed (27bb06c).
  - BN-6 (High) the pay filter hid posted minimums; the Salary note and the empty state didn't count them. Fixed (27bb06c).
  - BN-7 (Medium) Seniority words, the level chip and two-level postings (Microsoft M5–M6). Fixed (27bb06c).
- Commits: 7ea8be8 prompt, 4ebe24f log, 9de575d red unit tests (16 of 18 fail on 4ebe24f), 27bb06c fixes, 30fc159 e2e + test updates
  + CONTRACT + methodology guide.
- In progress: the rebuilt dist (build1.log), CI-like npm test at 30fc159 in `scratchpad/fa6/clean`, then my e2e on the base build
  (`scratchpad/fa6/dist-base`, red) and on the rebuilt dist, then the related groups.
- Next: counts before/after per ID, screenshots, send the SHA to the lead.
- Not committed: the data links data/snapshots and data/beta/snapshots, and the node_modules link.

## 1. Brief
- **Prompt:** [prompts/fix-app-6.md](prompts/fix-app-6.md), verbatim. BN-3 to BN-6 came from the lead by message.
- **Owned:** public/app.js derive() and the facet counts, the stats line's median and its basis, settleKeep() (BN-5), the pay
  filter (BN-6); public/features/insights.js' tiles' basis; the label text of the map pins and the chart caption;
  test/fix-app-6.test.js, test/e2e/fix-app-6.e2e.js, this log and the prompt file.
- **Not owned:** the map's fit and the layout over 860 px (fix-ui-6); server/geo.js, keywords.js, Compstimate's comparables
  and payPlaceText (fix-data-6).

## 2. Inputs and sources

## 3. Decisions and rationale

## 4. Replayable steps

## 5. Verification

## 6. Known gaps and follow-ups

## 7. Change log
- 2026-10-23 21:28: checked out db38a30, saved the brief, linked the 2026-10-16 crawl, built the base (7 min at load 10-13).
- 21:40: BN-1 reproduced on the base build.

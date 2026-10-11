# Process log: vetting-beta-2

(Written to disk by the lead from the vetting agent's final report, verbatim, because the harness blocks
subagents from writing report-style Markdown.)

## 1. Brief
Prompt: [`docs/process/prompts/vetting-beta-2.md`](prompts/vetting-beta-2.md), verbatim; there were no follow-ups.

Goal: vet every salary beta publishes. Amazon and Meta first (their first check), then the other five big-tech boards, plus Anduril, with the first vetting's method.

Files owned:
- `data/vetting/2026-10-11-beta-2/**`
- this log and its prompt
- `test/beta-vetting-2.test.js`
- `docs/process/patches/vetting-beta-2-{docs,fixtures}.diff`

No product code was edited.

## 2. Inputs and sources
- Worktree wt-s3 at 94cb54c (norm-9). Snapshots (norm-8, 2026-10-11 15:04–17:27 UTC) are linked from `scratchpad/wt-data`.
- Docs read:
  - VETTING.md, vetting.md (with its prompt), the 2026-10-02 summary;
  - the first beta pass (`vetting-beta.md` and its summary);
  - data-check-beta-2.md and fix4-data.md;
  - CONTRACT.md, DATA_SOURCES.md (§7a, §7e, §7g), PLAYBOOK.md and TEMPLATE.md.
- Code read:
  - `server/sources/amazon.js` (`amazonPayTable`, `amazonSalary`, `mapAmazonJob`) and `server/sources/meta.js` (`metaPayRanges`, `mapMetaJob`);
  - `server/normalize.js#deriveSalary`, `server/salary.js` (`payTerms`, `statedWeeklyHours`), `server/vet.js`;
  - `server/juice.js#attachJuice`, `public/features/shared.js#payLocations`, `public/app.js` (`payLabels`, `payPlacesLine`, `annualNote`);
  - `scripts/snapshot.js` (`trimDescription`, `fitSnapshot`), `scripts/vet-salaries.js`, `scripts/llm-vet.js` (`REVIEW_DIR_RE`), `scripts/build-static.js` (`readSnapshot`, `betaGate`);
  - `.github/workflows/{pages,snapshot}.yml` and `.github/scripts/beta-gate.sh`.
- The data-check-3 agent worked in the same worktree; its overlaps are cross-referenced in the summary.

## 3. Decisions and rationale
1. **Published view as the review input.** The snapshots are norm-8 and the code norm-9, and 19 salaries differ. The documented command was also run on the stored files; its counts are in `flags.stored.counts.json`.
2. **Seed 2026101102.**
3. **Method.**
   - Flagged jobs were grouped by company × flags × masked pay text.
   - Amazon's full pay sections were read, including the sentence above the table. Rules: the floor sentence, the shift-differential sentence, the Austrian annual statement, the "Pay starts at" and Washington "up to" text.
   - Whole-set checks:
     - pay-table rows against places, and Juice re-run with `attachJuice`;
     - currency against country on every board;
     - trimmed text against `salary.text`;
     - level tokens against median pay;
     - `payLocations` country spans;
     - re-checks of VT-1 to VT-13.
4. **Verdict conventions:** summary §7.
5. **Quotes.**
   - Each quote is an exact substring of the excerpt, a snippet, the posting text, or (Meta and trimmed Amazon rows) the structured field, recorded as `quote_source`.
   - The script refuses quotes it cannot find.
   - A separate pass checked all quotes and corrected numbers: 0 problems.
6. **Severity.** Basis and place errors on plausible amounts are High; Critical is kept for the peso case. Levels are Medium.
7. **Tests.** Each VT has a to-do test except VT-18 and VT-24, which are decisions, plus 4 pinned tests (an Amazon table row, the labour-certification annual line, Meta monthly ×12, an Amazon hourly row).
8. **Fixtures patch.** 36 cases from correct verdicts, at most 2 per company × verdict × masked pattern: Amazon text and structured rows, Meta, lei. Parser bugs and the 2 statistical lei cases are excluded, so CI stays green.
9. **Gate study.** It runs on a temporary copy of `vet.js` with a currency group and a currency/country check as options, over all 15 boards. A verdict counts as "wrong" only when its corrected value differs from the parse.
10. **Report files.** The harness blocked `summary.md` and this log; their text was returned to the lead.

## 4. Replayable steps
```bash
WT=<worktree>; S=<scratch>; cd $WT
node data/vetting/2026-10-11-beta/published-view.mjs $S/pv data/beta/snapshots/*.json data/snapshots/anduril.json --ungated
node scripts/vet-salaries.js data/beta/snapshots/{amazon,meta,apple,google,nvidia,microsoft,netflix}.json data/snapshots/anduril.json --out $S/stored/flags.jsonl   # exit 0, 1,629
node scripts/vet-salaries.js <same> --no-gate --no-fixtures --out $S/stored-nogate/flags.jsonl                                      # same counts
node scripts/vet-salaries.js $S/pv/{amazon,meta,apple,google,nvidia,microsoft,netflix,anduril}.json --date 2026-10-11-beta-2 --sample 25 --seed 2026101102   # exit 0, 1,610 + 200
node scripts/vet-salaries.js $S/pv/ungated/*.json --no-gate --no-fixtures --out $S/ungated/flags.jsonl                           # exit 1 (netflix 1, anduril 3)
node data/vetting/2026-10-11-beta-2/review-rules.mjs all --pv $S/pv        # 1,810 verdicts; a replay appends 0
node data/vetting/2026-10-11-beta/published-view.mjs $S/pvs data/snapshots/{anthropic,cohere,openai,palantir,scaleai,shieldai,xai}.json --ungated
node data/vetting/2026-10-11-beta-2/gate-study.mjs <dir with all 15 ungated lists> --ids
node --test test/beta-vetting-2.test.js     # 4 pass, 11 to-do
npm test
git apply --check docs/process/patches/vetting-beta-2-docs.diff docs/process/patches/vetting-beta-2-fixtures.diff
```

## 5. Verification
- `npm test`: 1,046 tests, 983 pass, 61 to-do, 2 fail. The 2 failures are PERF-1 and V15, the timing tests the playbook lists as failing under load (load was 9–11 during the run); they were not re-run alone.
- `test/beta-vetting-2.test.js`: 11 to-dos fail as intended; 4 pinned tests pass.
- Verdicts: 1,810 lines with 1,810 unique ids. Quotes and corrected numbers were all found in the postings. A replay appends 0.
- The fixtures patch, merged, passes `checkFixtureCase` for 563 of 563 cases. Both patches pass `git apply --check`.

## 6. Known gaps and follow-ups
- Amazon's whole-board missed pay cannot be measured: the snapshot is capped with salaried postings first, and has no `salaried` count.
- VT-22: 58 Amazon verdicts quote the structured row, because the stored text lost it.
- `--skip-reviewed` cannot see this folder until VT-25 is fixed.
- VT-18 and VT-19 counts rely on Amazon's own wording.
- Order of fixes: VT-14, VT-15, VT-20 (plain fixes); VT-17, VT-18, VT-19 (need decisions); VT-16 (gate).

## 7. Change log
- 21:10 Worktree, docs, prompt saved.
- 21:12 Published view built; stored scan, no-gate scan, published scan (seed 2026101102) and ungated scan.
- 21:15–21:24 Amazon and Meta whole-set analysis: per-place rows, Juice, floors, shift differential, Austria, Mexico, levels, trimming.
- 21:25 `review-rules.mjs`, dry run, then 1,810 verdicts written company by company.
- 21:28 Gate study (15 boards); fixtures patch (36 cases); VETTING.md patch.
- 21:30 Tests written (VT-25 added after finding the folder-pattern gap).
- 21:40 Corrected VT-14's overstatement factor in the rule, the verdict and the test: 17x, not 210x.
- 21:45 `npm test`.

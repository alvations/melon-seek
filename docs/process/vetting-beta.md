# Process log: vetting-beta

(Written to disk by the lead from the vetting agent's final report, verbatim, because the harness blocks
subagents from writing report-style Markdown; the same happened in the first vetting.)

## 1. Brief
Prompt: [`docs/process/prompts/vetting-beta.md`](prompts/vetting-beta.md) (verbatim; no follow-ups).
Goal: vet every salary the beta site publishes (Apple, Google, Microsoft, NVIDIA, Netflix) plus Anduril
from the main site, with the method of the first vetting ([vetting.md](vetting.md)), and keep the
audit trail. The work covers the scan, a review of every flagged job plus a seeded sample, the
big-tech checks, the runtime gate's thresholds, CI and a summary. No product code was edited.

Files owned:
- `data/vetting/2026-10-11-beta/**`: flags.jsonl, flags.counts.json, flags.ungated.counts.json,
  sample.jsonl, verdicts.jsonl, review-rules.mjs, published-view.mjs, gate-study.mjs, summary.md;
- this log and its prompt;
- `test/beta-vetting.test.js`;
- `docs/process/patches/vetting-beta-docs.diff` (docs/VETTING.md) and
  `docs/process/patches/vetting-beta-fixtures.diff` (test/fixtures/real-salary-cases.json).

## 2. Inputs and sources
- The worktree `wt-s1` at 6f69079 (fix wave 3; `NORMALIZER_VERSION` norm-8). Snapshots:
  `data/beta/snapshots/` (5 boards) and `data/snapshots/` (8 boards), rebuilt from the data-archive
  branch, observed 2026-10-11 06:38–08:00 UTC, stored as norm-7.
- Docs: docs/VETTING.md, docs/process/vetting.md and its prompt, data/vetting/2026-10-02/ (summary,
  review-rules.mjs, verdicts.jsonl), docs/CONTRACT.md (v3 to fix wave 3), docs/DATA_SOURCES.md §7,
  PLAYBOOK.md, TEMPLATE.md.
- Code read:
  - `server/salary.js`: `parseSalary`, `contextOf`, `evaluate`, `payTerms`, `lineLabel`;
  - `server/vet.js`;
  - `server/normalize.js`: `deriveSalary`, `relabelJobs`, `relocateJobs`;
  - `server/sources/apple.js`: `mapCopies`, `mergeStored`;
  - `server/juice.js#attachJuice`;
  - `public/features/shared.js#payLocations`;
  - `server/keywords.js`: `jobSeniority`, `seniorityFromPay`;
  - `scripts/vet-salaries.js`, `scripts/llm-vet.js`;
  - `scripts/build-static.js`: `readSnapshot`, `betaGate`;
  - `.github/workflows/pages.yml`, `.github/workflows/snapshot.yml`, `.github/scripts/beta-gate.sh`.
- The data-check-beta-2 agent worked in the same worktree. Overlaps are cross-referenced, not
  duplicated: DQ-27/DQ-28 is VT-4, DQ-32 is the Apple scan noise, and "DQ-6 residue" is VT-2.

## 3. Decisions and rationale
1. **Review what is published.** The build re-derives norm-7 snapshots with norm-8
   (`readSnapshot`: relocateJobs(rekeyBoardJobs) → upgradeStoredJobs → vetSalaries).
   `published-view.mjs` repeats it. For all 16,182 jobs the published salaries equal the stored ones
   in min, max, currency and kind, and the scan of the published lists has identical flags, so the
   documented step-1 output is the review input. Only norm-8 labels differ (`salary.country`,
   `partTime`), and they were checked on the published lists.
2. **Sample.** Seed 20261011 (the lead's), drawn by the scan's own sampler: mulberry32 Fisher–Yates
   over unflagged salaried jobs sorted by id, 25 per company.
3. **Review method.**
   - Flagged jobs were grouped by company × flags × pay template (numbers masked). Every group was
     read, with full pay sections opened where the excerpt was cut: Anduril tier lists, Microsoft
     level and country lines, Google country lines, Apple footers.
   - The same templates were checked over the whole published set: Microsoft national/city/level
     lines (1,475 postings), NVIDIA level pairs (880), and numbers against `salary.text` against the
     posting (10,556).
   - Missed pay: every unsalaried posting's money tokens in a pay clause, classified by the parser's
     rejection reason.
   - Places: `payLocations` against `salary.country`, plus Apple's pay states.
   - Levels: title against pay-sentence level.
4. **Verdict conventions** (summary §7):
   - Apple's per-place span is `correct`.
   - The job's own country line is `correct`; another country's line on a job with none is
     `parser_bug`, corrected null.
   - RON is `parser_bug`, with the posted range as corrected.
   - The Netflix internship band is `parser_bug`, corrected null.
   - Netflix L7 is `correct` (a policy quarantine).
   - Anduril keeps its 2026-10-02 verdicts for the same ids.
5. **Quotes.** Each verdict's `quote` is an exact substring of the line's excerpt or pay snippets,
   and `evidence` starts with it. `review-rules.mjs` refuses to write a verdict otherwise. When the
   scan could not locate a level group's joined text, the excerpt is the salary's own text, so it is
   not used as a quote source. A separate check confirmed every quote in the posting's full flattened
   text, and every corrected min and max in that text.
6. **Severity.** The scale is about pay. VT-8 (a level label) is rated Medium: it changes the level
   bucket the pay is compared in, not the pay. VT-10 (a real range hidden by policy) is Medium as
   missed pay.
7. **Tests** follow the data-check convention: each VT test is a to-do (red, reported, not counted)
   until fixed. Four "pinned" green tests fix today's correct gate behaviour on real big-tech cases:
   the Netflix 6.5x and L7 quarantines, NVIDIA's 3.55x intern rate published, and Microsoft's IC4+IC5
   span with levels. No VT-4 test, because data-check-beta-2's DQ-27 tests cover it; no VT-7 test,
   because it is a decision.
8. **Fixtures patch.** Not all 407 deduplicated cases (341 KB): it adds 92 cases (202 jobs, 76 KB),
   at most 3 per company × verdict pattern × interval × source × country shape. Anduril ids already in
   the fixtures are skipped. The 69 jobs a short excerpt cannot reproduce are left to the tests: the
   Microsoft SF/NYC choice needs coordinates, long NVIDIA lines lose their pay words when cut, and the
   parser bugs.
9. **Gate study** on a copy: `gate-study.mjs` copies `server/vet.js` and `salary.js` to a temp dir
   and swaps the constants there. It runs over un-quarantined published lists of all 13 boards and
   scores quarantines against both reviews' verdicts.
10. **CI.** The exact step is in summary §6 and the VETTING.md patch. Patches are limited to
    VETTING.md and the fixtures, so pages.yml is not patched.
11. **Report files.** summary.md and this log were returned in the final report for the lead to
    write. The harness blocks report-style Markdown from subagents, as on 2026-10-02.

## 4. Replayable steps
```bash
WT=<worktree>; cd $WT
# 1. Scan (exit 0; 578 flagged, 150 sampled)
node scripts/vet-salaries.js data/beta/snapshots/{apple,google,microsoft,netflix,nvidia}.json data/snapshots/anduril.json \
  --date 2026-10-11-beta --sample 25 --seed 20261011
# 1b. What beta publishes, and the same with quarantines undone (outside the repo)
node data/vetting/2026-10-11-beta/published-view.mjs /tmp/pv data/beta/snapshots/*.json data/snapshots/*.json --ungated
node scripts/vet-salaries.js /tmp/pv/{apple,google,microsoft,netflix,nvidia,anduril}.json --no-fixtures --out /tmp/pv-scan/flags.jsonl          # = flags.counts.json
node scripts/vet-salaries.js /tmp/pv/ungated/{apple,google,microsoft,netflix,nvidia,anduril}.json --no-gate --no-fixtures --out /tmp/raw/flags.jsonl   # exit 1: netflix 1, anduril 3 blocking (flags.ungated.counts.json)
# 2. Verdicts (append-only; a replay of the complete file appends 0)
node data/vetting/2026-10-11-beta/review-rules.mjs all      # 728: correct 701, parser_bug 19, source_ambiguous 8
# 4. Gate thresholds on a copy
node data/vetting/2026-10-11-beta/gate-study.mjs /tmp/pv/ungated --ids
# Tests
node --test test/beta-vetting.test.js                        # 8 to-dos fail as expected, 5 pass
npm test
git apply --check docs/process/patches/vetting-beta-docs.diff docs/process/patches/vetting-beta-fixtures.diff
```

## 5. Verification
- `npm test`: 881 tests, 862 pass, 0 fail, 19 to-do (8 from `test/beta-vetting.test.js`, the rest
  from other agents' files).
- `test/beta-vetting.test.js`: 8 VT to-dos fail today (VT-1, 2, 3, 5, 6, 8 ×2, 9); 5 green (the
  VT-1 reference and 4 pinned).
- Verdicts:
  - 728 lines, 728 unique ids;
  - every quote is a substring of the posting's flattened text, and every corrected min and max
    appears in it;
  - a replay appends 0.
- Fixtures patch: with it applied, `checkFixtures` passes 527 of 527 cases. Both patches pass
  `git apply --check`.
- Published view: 0 salary-number, currency or kind changes between stored and published for 16,182
  jobs; the flags are identical (578 lines, same codes).
- Machine checks over all 10,556 published salaries: 0 number mismatches between min/max and
  `salary.text`, and 0 text-sourced salaries whose text is missing from the posting.

## 6. Known gaps and follow-ups
- Snapshots keep normalized Jobs only, so Apple's per-listing footers and their `postLocationId` are
  not stored. VT-4 counts places in states where Apple posts no pay; it is not a per-listing check.
- `vet-salaries.js` scans stored salaries. It matches what is published only while the normalizer
  that wrote the snapshot gives the same salaries; an `--as-published` option (the `readSnapshot`
  steps) would remove the gap.
- NVIDIA cash compensation (VT-7) is outside the reviewed set (the scan does not flag rule
  rejections); it was checked separately: 45 postings.
- The fixture builder cannot reproduce Microsoft's SF/NYC choice from a short excerpt, because cases
  carry countries without coordinates.
- Fix order: VT-1, VT-3 and VT-5 change what job seekers see. VT-2 needs an FX source. VT-7, VT-8 and
  VT-10 need the lead's decisions.

## 7. Change log
- 2026-10-11 11:32 Scan (seed 20261011), exit 0; `--no-gate` run.
- 11:40 Published view (norm-8) built and compared: identical numbers and flags.
- 11:40–11:55 Review by groups; whole-set checks (levels, places, missed pay, currencies, levels against seniority).
- 11:56 `verdicts.jsonl`, 728 lines, written company by company via `review-rules.mjs`.
- 11:58 `test/beta-vetting.test.js` (8 to-dos, 5 pinned).
- 12:00 Fixtures patch (92 cases); 12:05 gate study and published-view tools; VETTING.md patch.
- 12:13 `npm test` green (19 to-dos).

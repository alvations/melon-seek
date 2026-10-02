# Process log: vetting

## 1. Brief
Prompt: [`docs/process/prompts/vetting.md`](prompts/vetting.md) (verbatim, plus ten coordinator follow-ups).
Goal: vet the real salary data after the $4.6M Fellows bug. Steps: a deterministic anomaly scan; an LLM
review of every flagged job plus a seeded sample, with an audit trail; parser fixes driven by the verdicts; a
runtime quarantine gate with statistical outlier detection; a CI gate; optional automated LLM review; docs. Then
the F2 pay-clarity fields `salary.spread` / `salary.zones`.

Files owned: `server/salary.js`, `server/vet.js`, `server/normalize.js` (salary code: `deriveSalary`),
`server/sources/{greenhouse,ashby}.js` (salary extraction only), `scripts/vet-salaries.js`, `scripts/llm-vet.js`,
`test/salary.test.js`, `test/fixtures/real-salary-cases.json`, `data/vetting/**`, `docs/VETTING.md`, this log and
its prompt. The lead wired the gate into `normalizeJobs`, `server/index.js`, `scripts/build-static.js`,
`public/api.js` and `pages.yml`, and wrote `test/vet-gate.test.js`.

## 2. Inputs and sources
- `data/snapshots/*.json` (8 companies, 5,413 jobs, 4,602 salaried; fetched 2026-10-02T05:54Z by GitHub Actions).
  They hold normalized Jobs only, with no raw `pay_input_ranges` or Ashby tiers. The board APIs are blocked from the
  sandbox (`boards-api.greenhouse.io`, `api.ashbyhq.com`: proxy 403), so all review came from `descriptionHtml`
  and the stored `salary`. A structured salary is recognized by its `salary.text` not occurring in the
  description.
- `docs/CONTRACT.md` (Job shape, v2 additions), `docs/process/TEMPLATE.md`, `docs/strategy/ROADMAP.md` §7 F2,
  the existing `server/salary.js`, `normalize.js`, the adapters and their tests.
- Skill `claude-api`: the raw-HTTP Messages API shape (`x-api-key`, `anthropic-version: 2023-06-01`), structured
  outputs (`output_config.format` `json_schema`, every object `additionalProperties: false`), `effort`,
  `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` (Claude API only), `stop_reason` refusal
  handling, retryable statuses (408/409/429/5xx/529) and `retry-after`, current model ids.
- `public/viz/palette.js` `FX_PER_USD` (single FX source, copied into `salary.js`).

## 3. Decisions and rationale
1. **Scan independent of the parser.** `scripts/vet-salaries.js` has its own money tokenizer and clause finder,
   so it can catch parser bugs. A clause is the text between newline, bullet, `;` or sentence end, plus the
   previous non-blank line when it is at most 80 characters (a heading such as "COMPENSATION AND BENEFITS:"; the first
   version missed the blank line between heading and amount and mis-flagged 122 xAI jobs). The pay-word list is
   the prompt's, plus "contract/pay rate". Benefit stipends ("home office stipend") are excluded, because
   they made every Cohere job look multi-currency.
2. **Review grouped by identical evidence.** 505 flagged and 176 sampled jobs, grouped by (flags, parsed
   text, excerpt). I read every group, opened full pay sections where the excerpt was cut (tier lists), and
   wrote the decisions as per-id and per-pattern rules (`data/vetting/2026-10-02/review-rules.mjs`, with
   `tier-spans.json`). The rules append one verdict line per job, by company batch, skipping ids already
   present. Replaying is a no-op. `parser_version` for the reviewed data is `salary.js@b9cc2fb (sha256:e0fcf273fb5b)`.
3. **Sample.** 25 unflagged salaried jobs per company (all of them when fewer: Cohere 1), using a seeded Fisher–Yates
   shuffle (mulberry32, seed 20261002) over ids in sorted order. All 176 were correct.
4. **Verdict conventions.** A tiered list's corrected value spans all tiers (Anduril's own structured
   ranges do this: "Level 2 $25–38, Level 3 $29–43" becomes "$25 — $43"). One amount in several currencies takes
   USD when a US location exists, else the first location's currency, else USD. A source typo (13× range)
   gets `source_ambiguous` and `corrected: null` (quarantine), with the probable intended value noted in the evidence.
5. **Parser rewrite** (`server/salary.js`), from the verdict classes:
   - Pay context is required: a keyword in the clause or heading, a standalone amount line, or an attached
     hourly unit. M/B amounts are never pay.
   - Benefit stipends are removed before the keyword test. Negative words right before or after an amount reject it.
   - Unit-aware tokens (`$35/hour`, `110,000/year SGD`, `$8,500 SGD/month`) and alternative groups (`3,850 USD / 2,310 GBP`).
   - Intervals come only from the amount, the rest of its line, or its own clause. This fixed "5 days/week" and "daily"
     leaking into the next paragraph.
   - Tier spanning: same currency, interval and kind, gaps ≤ 130 characters, span ≤ 3×. 100 characters missed Scale AI's
     105-character gaps; 130 changed no verdict.
   - Implausible interval labels are read as annual, with `intervalCorrected`.
   - Bounds are compared in USD, which fixed ¥20M being treated as $20M.
   - `kind`, `source`, `zones` and `spread` are added; `toJobSalary` keeps $1.2M–$5M values so the gate quarantines them visibly.
6. **Adapters.** Greenhouse: zero-decimal currencies are not divided by 100 (the JPY case); a merge spanning more than 3×
   falls back to the first range; titles are cleaned ("Annual Salary::" became "Annual Salary:"); week/day intervals are
   read from titles; per-range `payRanges` are kept. Ashby: `payRanges` covers every tier. The adapters' `salary` object
   shapes are unchanged, because `test/sources.test.js` deep-equals them; the tier count reaches the Job through
   `payRanges`, not a raw `salary.zones`.
7. **`deriveSalary`** (normalize):
   - Structured first. If the structured currency isn't a location currency and a tier in one is, that tier is used.
   - If the structured value fails a hard check and the text value passes, the text value is used, with
     `structuredRejected`.
   - Text fallback otherwise.
   - `zones` = max(text zones, adapter tiers).
8. **Gate** (`server/vet.js`): hard checks plus per-company statistics, with quarantine into
   `salaryRaw`/`salaryFlag`. Tuning, measured against my verdicts (a quarantine of a `correct` job is a false positive):
   - σ floor 0.25 → 0.4. Low side changed from z < −3.5 or fence to z < −4.5 and fence, and limited to full-time salaried
     roles. Agreement is required in every group (department, role family, pay kind) with n ≥ 8. This took the draft's
     false positives from 10 to 0, excluding the policy cases. The draft had quarantined a $59K maintenance engineer,
     CA$30/hr annotators, a $99K security operator, a Lithuanian monthly role and a $68K BDR.
   - Range-ratio quarantine at 4×, not 3×: 3× hides 10 stated ranges (Anthropic $280K–$850K and others). 3× stays a scan flag.
   - Hourly caps: $250/hr on any role (lead hotfix, folded in as `VET.MAX_HOURLY_USD`) and $200/hr on explicit full-time
     roles. They catch the 39 Cohere "$500 home office stipend" postings. Those sit under the $1.2M cap and make up 30%
     of Cohere's salaried jobs, which breaks robust statistics (Q3 falls inside the bad cluster).
   - Known false positives: Scale AI's two $300/hr part-time Research Advisor postings (verdict correct). They are
     caught by the $250 bound, which was kept on the lead's call; $350 would give 0.
9. **CI semantics.** The scan applies the gate by default (as the build does), so "blocking" means "would be
   published". This matters because CI restores old-code snapshot artifacts for boards whose fetch fails. `--no-gate` gives the raw view.
   Exit 1 on any blocking job or failed fixture. The reviewed `flags.jsonl` and `sample.jsonl` are protected from overwrite.
10. **Regression fixtures.** `--build-fixtures` turns every verdict into a short excerpt: the decoy clause the old
    parser matched, plus the pay block. It verifies that the excerpt alone reproduces the verdict, widening once if
    needed, then dedupes. The result is 435 cases covering all 681 jobs, one per line (273 KB).
11. **LLM vetting** (`scripts/llm-vet.js`): plain fetch, no dependency. Default model `claude-sonnet-5-5`: the brief
    asked for a cost-effective default, and the skill names the current Sonnet for bulk judges. `VET_LLM_MODEL=claude-opus-5-5`
    gives the most careful review. Effort defaults to medium. Thinking is left at the model default (sending it
    disabled is a 400 on current models). `--skip-reviewed` keys on (id, parsed salary), so CI only pays for new
    or changed salaries.
12. **FX.** `USD_PER` = 1 / `FX_PER_USD` copied verbatim from `palette.js`, plus QAR/CNY/ZAR extras
    (`test/fx-consistency.test.js`). `vet.js` re-exports it.
13. **F2.** `spread` = max ÷ min (2 decimals), always set by `toJobSalary`. `zones` = distinct pay-context
    ranges in the text (one multi-currency amount counts once) merged with the adapter tier count.
    `vettedSalaried(jobs)` applies the gate per company and keeps plotted salaries only, for market
    and backtest code that loads snapshots directly. Compstimate already reads only `job.salary`. Only `app.js` reads
    `salaryRaw`, and only for the "Pay unclear" display.

## 4. Replayable steps
```bash
node scripts/vet-salaries.js --date 2026-10-02 --no-fixtures --sample 25 --seed 20261002   # flags.jsonl + sample.jsonl (raw, pre-gate code)
node data/vetting/2026-10-02/review-rules.mjs all          # verdicts.jsonl (append-only; no-op when complete)
node scripts/vet-salaries.js --build-fixtures data/vetting/2026-10-02/verdicts.jsonl   # 435 cases / 681 jobs
node scripts/vet-salaries.js --no-gate --out /tmp/before/flags.jsonl                    # before (raw)
node scripts/vet-salaries.js --out /tmp/served/flags.jsonl                              # served now (gate on old snapshots)
node scripts/vet-salaries.js --renormalize                                              # after -> flags.renormalized.jsonl
npm test
ANTHROPIC_API_KEY=... node scripts/llm-vet.js --flags data/vetting/2026-10-02/flags.jsonl --skip-reviewed
```
Note: the original `flags.jsonl` came from the first version of the scan, before the scan refinements in decision 1
and the `hourly_over_cap` flag. Rerunning the first command today gives the refined flags, and it refuses to
overwrite the reviewed file (use `--out`).

## 5. Verification
- `npm test`: 189 pass, 0 fail (`test/salary.test.js` 39 tests: every bug class, the fixtures, the gate, thresholds,
  the real-snapshot false-positive check (skipped without local snapshots), browser safety, `llm-vet` with mocked
  fetch, spread/zones, `vettedSalaried`). `test/vet-gate.test.js` (lead) passes.
- Re-derived salaries match the verdicts for 679 of 681 reviewed jobs. The other 2 are the policy cases, and no unreviewed job's
  salary changed.
- Scan: raw snapshots have 49 blocking; with the gate on the old snapshots, 0 blocking (51 quarantined); re-derived plus gate,
  0 blocking (7 quarantined: 5 source typos and 2 policy). Fixtures 435/435.
- Job 5183044008: 3,850 USD/week, $200,200/yr annualized, `kind: "stipend"`.
- Spread median per company 1.25–1.81×, p90 1.37–2.45× (matches ROADMAP F2). Zones > 1: Anduril 27, Scale AI 16, xAI 1.
- Counts and tables: `data/vetting/2026-10-02/summary.md`.

## 6. Known gaps and follow-ups
- Snapshots lack raw tiers. The zero-decimal fix, the 3× tier guard and the location-currency tier apply fully on the
  next live fetch. The local snapshots were not rewritten (`--renormalize --write` would do it).
- `zones` undercounts when per-level ranges have no pay keyword (Shield AI's "Engineer 2: $120,000-$180,000 …"),
  which is the conservative direction.
- Statistics are tuned on 8 companies. Re-check `stat_outlier` when adding boards.
- Not run against the live API (blocked in the sandbox). The request shape is tested with a mocked fetch.
- Backend: a future `scripts/build-market.js` must use `vettedSalaried()` or the gated job lists.

## 7. Change log
- 2026-10-02 06:05 Scan v1, before-scan, sample (seed 20261002).
- 06:10 Gate v1 (`server/vet.js`). Tuned after the first false-positive check: σ floor 0.4, hourly cap.
- 06:40 Review: 681 verdicts appended in 8 company batches.
- 06:45 Parser rewrite, `deriveSalary`, adapter fixes. Lead hotfix: gate wired in, any-role $250/hr bound.
- 06:55 USD-based bounds, structured-to-text fallback. Low-side statistics tightened (z −4.5, full-time salaried only).
- 07:00 Regression fixtures (435 cases), `llm-vet.js` with mocked-fetch tests, scan gate-by-default, `--skip-reviewed`.
- 07:10 FX unified with `palette.js`. `hourly_over_cap` critical flag. `docs/VETTING.md`. Exact CI YAML to the lead (installed in 9bdf5d8).
- 07:20 F2 `salary.spread` / `salary.zones`, `vettedSalaried()`.

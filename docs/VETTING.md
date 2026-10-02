# Salary vetting

melon-seek plots job postings by pay, so a wrong salary is a wrong map. On
2026-10-02 the Anthropic Fellows posting was plotted at **$4.6M/yr**. Its pay is
a weekly stipend; "$4.6M" came from a sentence about a past project ("AI agents
find $4.6M in blockchain smart contract exploits"). This document describes the
layered checks that stop that class of error from reaching the site, and how
the review that found the bugs is recorded.

| Layer | Where | What it does |
|---|---|---|
| 1. Parser | `server/salary.js` | Only reads pay from pay context; handles stipends, intervals, currencies, tiers |
| 2. Derivation | `server/normalize.js#deriveSalary` | Structured pay first, location currency, falls back to text when the structured value is implausible |
| 3. Runtime gate | `server/vet.js#vetSalaries` | Quarantines implausible and outlier salaries for each company: in `normalizeJobs`, at serve time, in the static build and in the browser |
| 4. CI gate | `scripts/vet-salaries.js` | Deterministic scan; fails the Pages deploy if a critical salary would be published or a regression fixture fails |
| 5. Review | `data/vetting/<date>/verdicts.jsonl` (+ optional `scripts/llm-vet.js`) | Every flagged job and a seeded random sample, reviewed by an LLM, with quoted evidence |

## 1. Job salary fields

`salary` keeps every contract field (`min`, `max`, `mid` annualized, `currency`,
`interval: "year"`, `text`, `originalInterval`) and adds:

| Field | Meaning |
|---|---|
| `kind` | `"salary"`, `"hourly"` (source interval is hourly) or `"stipend"` |
| `source` | `"structured"` (Greenhouse `pay_input_ranges`, Ashby `compensation`, Lever `salaryRange`) or `"text"` (parsed from the description) |
| `intervalCorrected`, `statedInterval` | The source's interval label made the pay implausible while the numbers are a plausible annual salary, so it was read as annual. Example: "88,000–130,000 USD per-month-salary" |
| `ranges` | The per-tier list `[{min, max, currency, interval, label?}]` (source units) when the board gave several structured ranges |
| `structuredRejected` | Codes of the hard check that rejected the structured value when the text value was used instead |
| `spread` | max ÷ min, 2 decimals (F2 pay-clarity labels; "Wide range" when ≥ 2.0) |
| `zones` | Number of distinct pay ranges in the posting, at least 1: the distinct pay-context ranges the text parser finds (one amount in several currencies counts once), merged (max) with the adapter's tier count (`payRanges.length`, or a raw `salary.zones`) |

A quarantined job has `salary: null`. It keeps what was parsed in `salaryRaw` and
gets `salaryFlag: { codes, reason }`, where `reason` starts with "Pay unclear:". Such
a job is never plotted or used in medians, Compstimate or Juice. The UI shows
"Pay unclear, see posting".

## 2. Parser rules (`server/salary.js`)

`parseSalary(text, { countries })` returns `{ min, max, currency, interval, text, kind }` in the
source interval, or `null`.

- **Pay context only.** An amount counts as pay when one of these holds: a
  pay keyword (salary, compensation, pay, wage, OTE, remuneration, stipend,
  hourly/contract/base rate, gross/brutto) is in the same sentence or clause,
  or in the short heading line right above it ("Annual Salary:",
  "COMPENSATION AND BENEFITS:"); the line holds nothing but the amount; or an
  hourly unit is attached to the amount ("$60/hr"). Million and billion
  amounts are never pay.
- **Benefits are not pay.** Perk stipends and allowances (home office, lunch,
  learning & development, wellness, phone, relocation, ...) are removed before
  the keyword test. Funding, deals, budgets, spend, bonuses, grants, credits and
  prizes right around an amount reject it.
- **Intervals** come from the amount ("/hr", "per week", "/year SGD"), the
  text right after it on the same line, or earlier in the *same clause*
  ("Weekly stipend of ..."). They never come from a previous sentence: before
  this fix, "in-office 5 days/week" made "$200,000 - $230,000" weekly. With no
  interval, amounts under 1,000 are hourly, and a range under 10,000 is monthly.
- **Currency** is a prefix or suffix symbol or ISO code, including a code after
  the interval ("110,000 - 200,000/year SGD", "$8,500 SGD/month"). When one
  amount is offered in several currencies ("3,850 USD / 2,310 GBP / 4,300 CAD"),
  the parser picks the one matching the job's location countries. If several
  match it picks USD, and if none match, USD.
- **Ranges** accept a unit on each side ("$35/hour - $45/hour") and a redundant
  "k" ("$150,000 - 250,000k").
- **Tiered lists** in one block, with the same currency, interval and kind and
  at most 130 characters apart, are spanned to overall min–max when the span is
  at most 3× ("Level 1: $25 - $33/hour … Level 3: $33 - $43/hour" → 25–43).
- **Implausible interval labels**: when the stated interval puts annual pay
  above $1.2M but the numbers are $15K–$1.2M, they are read as annual, with
  `intervalCorrected`.
- **Bounds** are checked in rough USD (`USD_PER`, derived from
  `public/viz/palette.js` `FX_PER_USD`): a text candidate must be $10K–$1.2M per
  year. `toJobSalary` refuses values outside $10K–$5M. Values between $1.2M and $5M are
  kept so that the gate quarantines them visibly.

Adapters: Greenhouse divides `*_cents` by 100 except for zero-decimal currencies
(JPY, KRW, ...). A real JPY range had been shrunk 100×. Greenhouse refuses to merge tiers whose
span is over 3× (it keeps the first range), and it exposes `payRanges`. Ashby
exposes every tier's salary component as `payRanges`. `deriveSalary` then
prefers a tier in the location's currency. Lever interval labels pass through
`toJobSalary`'s interval correction.

## 3. Runtime gate (`server/vet.js`)

`vetSalaries(jobs, { stats = true })` runs over one company's full job list. It
is pure and browser-safe, and it is idempotent. It returns a new array.

### Hard checks (per job)

| Code | Rule | Why this threshold |
|---|---|---|
| `above_max` (critical) | annual max > **$1.2M** (USD) | The highest real posted base in the data is $850K (Anthropic); $4.6M, $5M and $1.56M were all errors |
| `below_min` (critical) | annual min < **$15K** on a full-time role | Below US federal minimum wage × 2080. All 4 real hits were source typos (12,600 for 126,000) or the JPY ÷100 bug |
| `hourly_high` (critical) | hourly rate > **$250/hr** on any role, or > **$200/hr** on a role the source marks Full-time | Catches "$500 home office stipend" read as $500/hr ($1.04M/yr, 39 postings). That cluster is under the $1.2M cap and too common for the statistics to see |
| `range_ratio` | max/min > **4×** | Real stated ranges reach 3.4× (Anthropic $280K–$850K, xAI $180K–$600K, OpenAI $125K–$400K). A 3× cutoff would hide 10 legitimate postings. The Anduril typos are 13.3× |
| `min_gt_max` | min > max | |
| `junior_high` | Intern/Fellow/Resident/Apprentice/Co-op title with mid > **$300K/yr** ("Technical/Distinguished/Senior Fellow" excluded) | The Fellows stipend is $200K annualized |
| `senior_low` | Director/VP title with max < **$60K/yr** | |

### Statistical outliers (per company)

For each salaried job not caught by a hard check, the gate computes
`x = ln(mid in USD)` and compares it with the company and with every
comparison group that has **at least 8** members: department, role family
(from the title) and pay kind. A job is a `stat_outlier` only if it is an
outlier company-wide **and** in each such group, in the same direction:

- robust z = (x − median) / σ, with σ = max(1.4826 · MAD, **0.4**);
- Tukey fences on log pay: Q1 − 3·IQR and Q3 + 3·IQR (IQR floored at 0.4);
- **high side**: z > **3.5** or above the upper fence (at least about 4× the median);
- **low side**: z < **−4.5** and below the lower fence (at least about 6× under the median),
  and only for full-time salaried roles. Hourly, stipend, contract and intern
  pay is legitimately low.

Tuning on the real snapshots (5,413 jobs) is in
`data/vetting/2026-10-02/summary.md`. The first draft (σ floor 0.25, symmetric z,
low side for all roles) quarantined legitimate low-paid roles: a $59K–$78K
maintenance engineer, CA$30/hr contract annotators, a $99K–$110K security
operator, a €2,400–€5,600/month Lithuanian role and a $68K–$85K BDR. The shipped
settings quarantine none of them. On today's data the statistical layer adds no
quarantines beyond the hard checks. It is there for errors under the $1.2M cap,
such as a $1M posting at a company whose median is $250K (tested synthetically).

**Known false positives (deliberate):** the two Scale AI "Research Advisor,
Human Frontier Collective" postings state $300/hr for a part-time expert
contract. The reviewer verdict is `correct`, but the any-role $250/hr bound
(lead decision) quarantines them. An annualized $624K for 10–20 hours a week
would mislead the chart anyway.

### Aggregates read vetted salaries only

Every data path runs the gate: `normalizeJobs`, server responses, the static
build and the browser (`public/api.js`). So `job.salary` is always the vetted
value, and quarantined jobs have `salary: null`. Aggregates (market comps,
the Compstimate backtest, medians) must read `job.salary` and never
`salaryRaw`. Code that loads snapshot files directly (for example a market
build script) should call `vettedSalaried(jobs)` from `server/vet.js`, which
applies the gate per company and returns only jobs with a plotted salary.

## 4. Scan flags (`scripts/vet-salaries.js`)

The scan applies the gate first, as the build does. Flags are computed on
`salary`, or on `salaryRaw` for quarantined jobs. **Critical** flags mean an
implausible amount. A job that would be *published* with one (not quarantined)
is **blocking** and makes the scan exit 1.

| Flag | Definition |
|---|---|
| `max_over_1_2m` **critical** | annual max > $1.2M (USD) |
| `min_under_15k_fulltime` **critical** | annual min < $15K on a full-time role (employment type and title not part-time/intern/contract) |
| `hourly_over_cap` **critical** | the gate's `hourly_high` |
| `ratio_over_3` | max/min > 3 (review flag; the gate quarantines above 4) |
| `no_pay_context` | text-sourced salary whose clause or heading has no pay word (salary, compensation, pay, base, range, OTE, annual, hourly, stipend, wage, contract/pay rate; benefit stipends excluded) |
| `magnitude_suffix` | the matched text has an M/B/million/billion suffix |
| `currency_country_mismatch` | currency is none of the location countries' currencies (only when countries are known) |
| `non_year_interval` | source interval is hour/day/week/month |
| `interval_suspect` | non-year interval whose annualized pay is over $1.2M while the raw numbers are plausible as annual |
| `interval_corrected` | the parser or derivation already read the stated interval as annual |
| `multiple_ranges` | more than one distinct money range in pay context (prose ranges over $5M excluded) |
| `multi_currency` | a pay clause lists more than one currency (a bare "$" next to "$… CAD" counts once) |
| `structured_text_disagree` | structured salary and the text parse differ by > 10% in min or max, or in currency |
| `missed_salary` | no salary, but a clause has a pay word and a currency amount |
| `title_junior_high`, `title_senior_low` | the gate's title checks |
| `stat_outlier` | the gate's statistical test |
| `quarantined` | the gate quarantined the job (`salaryFlag`) |

Each `flags.jsonl` line has: `id, company, title, url, employmentType,
countries, source, parsed` (the Job salary), `excerpt` (at most 300 characters
around the matched pay text, or around the pay clause for structured or missed
salaries), `pay_snippets` (up to 3 other pay clauses for the reviewer, at most 200 characters
each), `flags`, `critical`, `quarantined`, and `salaryFlag` when quarantined.
`<name>.counts.json` holds per-company counts per flag.

## 5. Review rubric

For every flagged job, and for a seeded random sample of unflagged salaried
jobs (25 per company, or all of them if fewer), the reviewer reads the excerpt and
pay snippets, opening the full posting when they are not enough, and records:

| Verdict | Use when |
|---|---|
| `correct` | The parsed salary matches what the posting states (amount, currency, interval), even if unusual: a wide stated range, USD for a non-US office, an hourly contract rate |
| `parser_bug` | The posting is clear and we got it wrong: a non-pay amount taken as pay, a pay statement missed, one tier or end of a range only, a wrong currency or interval, an interval from another sentence, an adapter unit error |
| `source_ambiguous` | The posting itself is inconsistent: a 13× range that is a dropped digit, annual numbers labelled hourly or monthly, a currency contradicting the location, structured and text ranges that disagree |

`corrected` is what should be shown: `{min, max, currency, interval}` in the
source interval, or `null` (no pay stated, or the stated pay can't be trusted,
so it is quarantined). Tiers are spanned (min of mins to max of maxes, at most 3×).
Multi-currency statements use the location currency. Structured wins unless
it is implausible. `kind` is salary, stipend or hourly. `evidence` quotes the
source words verbatim and then says why.

The Fellows decision: **show the stipend** (3,850 USD/week, about $200K/yr
annualized, `kind: "stipend"`), not "no salary". The posting states it plainly as
the role's pay ("The expected base stipend for this role is 3,850 USD / 2,310
GBP / 4,300 CAD per week, with an expectation of 40 hours per week"). That is
full-time-equivalent pay, and the ×52 annualization is the same convention as
hourly ×2080. `kind` lets the UI label it as a stipend. Note that the program
lasts 4 months, so the annualized figure is not what a fellow earns in total.

## 6. Running it

```bash
# Deterministic scan of the snapshots as served (gate applied). Writes
# data/vetting/<today>/flags.jsonl + flags.counts.json. Exit 1 = blocking.
node scripts/vet-salaries.js
node scripts/vet-salaries.js --no-write-flags --summary report.md   # CI-style
node scripts/vet-salaries.js --no-gate --out /tmp/raw.jsonl         # raw view

# Review set: also write sample.jsonl (25 unflagged salaried jobs per company).
node scripts/vet-salaries.js --sample 25 --seed 20261002

# Re-derive every salary from descriptionHtml + the structured salary the
# snapshot kept, with the current parser + gate, then scan (before/after).
node scripts/vet-salaries.js --renormalize            # -> flags.renormalized.jsonl
node scripts/vet-salaries.js --renormalize --write    # also rewrite the local snapshots

# Rebuild the regression fixtures from reviewed verdicts (each excerpt verified).
node scripts/vet-salaries.js --build-fixtures data/vetting/2026-10-02/verdicts.jsonl

# Optional LLM review of flagged jobs (no-op without a key).
ANTHROPIC_API_KEY=... node scripts/llm-vet.js --flags data/vetting/<date>/flags.jsonl
#   VET_LLM_MODEL (default claude-sonnet-5-5; claude-opus-5-5 for the most careful review),
#   VET_LLM_EFFORT (default medium), VET_LLM_FALLBACKS=off outside the Claude API,
#   --only-blocking, --skip-reviewed, --limit N, --concurrency N

npm test   # includes every real case in test/fixtures/real-salary-cases.json
```

A scan never overwrites a `flags.jsonl` or `sample.jsonl` that has a
`verdicts.jsonl` next to it (they are review inputs). Use `--out` or `--force`.

`llm-vet.js` calls `POST /v1/messages` (`anthropic-version: 2023-06-01`) with plain
`fetch`. It requests structured output (`output_config.format`, `json_schema`
with the verdict schema), `effort`, and server-side refusal fallback
(`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). It checks
`stop_reason` (refusal, max_tokens) before reading the JSON. It retries
408/409/429/5xx/529 and network errors with backoff (honoring `retry-after`), and
stops on 401/403. The posting text is sent inside `<untrusted_posting_text>` tags, which
the model is told are data, never instructions. Every verdict is verified: its `quote` must be an exact
substring of the excerpt, and its corrected min/max must appear in the text (plain, comma or K forms). Otherwise it is
stored as `verdict: "unverified"` (with `model_verdict` and `verification_errors`). `ANTHROPIC_BASE_URL`
must be https (http only for localhost). Each verdict is appended as soon as it arrives, so a rerun
resumes.

### CI (`.github/workflows/pages.yml`, after the snapshot steps, before the build)

```yaml
      - name: Salary vetting gate (fails on critical anomalies)
        run: |
          mkdir -p "$RUNNER_TEMP/vetting"
          node scripts/vet-salaries.js --out "$RUNNER_TEMP/vetting/flags.jsonl" --summary "$GITHUB_STEP_SUMMARY"

      - name: LLM salary review (advisory; no-op without ANTHROPIC_API_KEY)
        if: always()
        continue-on-error: true
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          VET_LLM_MODEL: ${{ vars.VET_LLM_MODEL || 'claude-sonnet-5-5' }}
        run: node scripts/llm-vet.js --flags "$RUNNER_TEMP/vetting/flags.jsonl" --out "$RUNNER_TEMP/vetting/llm-verdicts.jsonl" --skip-reviewed --limit 100

      - name: Upload salary vetting report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: salary-vetting
          path: ${{ runner.temp }}/vetting
          retention-days: 30
```

The gate step fails the deploy when a job would be published with a critical
salary, or when a regression fixture fails. With no snapshot files it scans
nothing and exits 0 (the build then bundles demo data). `--skip-reviewed` only
pays for flagged jobs whose parsed salary has no verdict yet in a committed
`verdicts.jsonl` or `llm-verdicts.jsonl`.

## 7. Reading the audit files (`data/vetting/<date>/`)

| File | Contents |
|---|---|
| `flags.jsonl`, `flags.counts.json` | The scan that was reviewed (input of the review) |
| `sample.jsonl` | The seeded random sample of unflagged salaried jobs (`sample_seed`) |
| `verdicts.jsonl` | One line per reviewed job: `id, url, company, title, review_set (flagged/sample), flags, parsed, corrected, verdict, kind, evidence, reviewer, reviewed_at, parser_version` |
| `review-rules.mjs`, `tier-spans.json` | The reviewer's per-job and per-pattern decisions that produced `verdicts.jsonl` (replayable, append-only) |
| `flags.renormalized.jsonl`, `.counts.json` | The scan after re-deriving salaries with the fixed parser + gate |
| `llm-verdicts.jsonl` | Automated reviews (same schema; `reviewer` is the model id; adds `llm.usage`) |
| `summary.md` | Before/after counts, bug classes, false-positive analysis, decisions |

`parser_version` identifies the code that produced `parsed` (git sha plus the
sha256 of `salary.js`). To check a verdict, open `url`, find the `evidence`
quote, and compare with `corrected`. Every reviewed case is also a regression
fixture: `test/fixtures/real-salary-cases.json` lists the job `ids` each excerpt
covers.

## 8. Limits

- Snapshots keep only the normalized Job, not raw `pay_input_ranges` or Ashby
  tiers. Renormalization reuses the structured salary as the snapshot stored it,
  so fixes that need the raw tiers (the zero-decimal division, the 3× tier
  guard, the location-currency tier) take effect on the next live fetch.
  `salary.ranges` keeps the per-tier list from now on.
- The statistical layer is tuned on 8 companies. A new board with very
  different pay structure should be re-checked with the scan
  (`stat_outlier` count) before trusting it.
- FX is approximate (palette table). Bounds have wide margins, so a ±20% FX error
  does not change any decision.

# Salary vetting, 2026-10-02

Reviewer: claude via Claude Code (data-vetting workstream; see
`docs/process/vetting.md`). Method and definitions: `docs/VETTING.md`.
(Written to disk by the lead from the vetting agent's final report, because the
harness blocks subagents from writing report-style Markdown.)

## Input

- `data/snapshots/*.json`, fetched by GitHub Actions at 2026-10-02T05:54Z: 8
  companies, **5,413 jobs, 4,602 with a salary**.
- Parser that produced the snapshot salaries: `salary.js@b9cc2fb`
  (sha256 `e0fcf273fb5b`), with the adapters at the same commit.
- Fixed parser: `salary.js` sha256 `826ec86ea195` at `7f36b8b`.

## Review

| | flagged | sampled (seed 20261002) | total |
|---|---:|---:|---:|
| jobs reviewed | 505 | 176 | **681** |
| `correct` | 375 | 176 | 551 |
| `parser_bug` | 111 | 0 | 111 |
| `source_ambiguous` | 19 | 0 | 19 |

Sample: 25 unflagged salaried jobs per company, or all of them if fewer (Cohere 1,
because 131 of its 132 salaried jobs were flagged). Seeded Fisher–Yates
(mulberry32) over the unflagged jobs sorted by id. **All 176 sampled jobs were
correct**, so the errors are concentrated in what the scan flags.

### Bug classes (from `verdicts.jsonl`)

| # | Class | Jobs | Companies | Fix |
|---|---|---:|---|---|
| A | Non-pay money taken as pay: a past project's result ("$4.6M"), a deal size ("$500K to $5M+ deals"), a perk ("$500 home office stipend" read as $500/hr = $1.04M/yr) | 42 | anthropic 2, scaleai 1, cohere 39 | Pay context required; benefit stipends excluded; M/B amounts never pay |
| B | Tiered list or range with units on both ends cut to one tier or endpoint ("$35/hour - $45/hour" → $35; "Level 1 … Level 3" → Level 1 only) | 60 | xai 35, anduril 24, palantir 1 | Unit-aware ranges; tier spanning (≤ 3×) |
| C | Pay statement missed: an interval word from the previous sentence ("5 days/week", "daily") made the range weekly or daily and implausible; a redundant "k" ("250,000k") | 5 | xai 5 | Intervals only from the amount's own clause; "k" ignored on full numbers |
| D | Currency code after the number or interval ignored ("110,000 - 200,000/year SGD", "$8,500 SGD/month"); weekly stipend with codes after the numbers missed | 3 | palantir 2, anthropic 1 | Code-after-unit tokens; more currencies |
| E | Greenhouse JPY `pay_input_ranges` divided by 100 (¥20,454,000 became 204,540) | 1 | anduril 1 | Zero-decimal currencies; implausible structured value falls back to text |
| S1 | Source typo: a 13× range from a dropped zero (12,600–167,000) | 5 | anduril 5 | Quarantined (`below_min` / `range_ratio`) |
| S2 | Source interval label on annual numbers ("US Hourly Range $68,000 — $90,000", "88,000–130,000 USD per-month-salary") | 2 | anduril 1, shieldai 1 | Read as annual, `intervalCorrected` |
| S3 | Ashby "Multiple Ranges" summary in a currency that doesn't match the location | 5 | cohere 5 | Adapter exposes all tiers (`payRanges`); location-currency tier preferred on the next fetch |
| S4 | Structured and text ranges disagree | 3 | openai 2, shieldai 1 | Structured kept (policy); flagged for review |
| S5 | Other: UK role in EUR hourly; $10/hr floor out of line with sibling postings; Dublin role with a bare "$" | 4 | anduril 1, shieldai 1, xai 2 | Parsed literally; flagged |

The four bug classes the lead's quick scan named map as follows: prose money is
class A; "merged tier ranges with a bad min" is S1, a typo in the source itself (the
text says the same, and the posting has a single range, not a merge; the merge
guard was added anyway); the wrong interval label is S2; missed salaries are C
and D (+5 xAI, +1 Anthropic, +1 Anduril after the fix).

## Job 5183044008 (Anthropic Fellows Program, AI Safety & Security)

Before: `$4.6M`, 4,600,000 USD/yr. After: **3,850 USD/week, annualized
$200,200/yr, `kind: "stipend"`, `source: "text"`, `spread` 1, `zones` 1**, from
"The expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per
week, with an expectation of 40 hours per week". The job lists London,
Ontario/BC and US locations; USD is chosen because a US location is present. Its
siblings 5183051008 (ML Systems & RL) and 5183053008 (The Anthropic Institute,
Economics & Policy; it had no salary before) get the same result.

**Choice: show the stipend rather than no salary.** It is the posting's own,
explicit statement of the role's pay, it is full-time (40 h/week), and
annualizing ×52 is the same convention as hourly ×2080. Showing nothing would
throw away true information; `kind` lets the UI label it as a stipend. Caveat:
the program lasts 4 months, so ~$200K is a full-time-equivalent rate, not
total earnings.

## Before / after (scan counts per flag)

- **reviewed scan**: the 06:06 scan that was reviewed (raw, early scan code).
- **before**: the same raw snapshot salaries, scanned with the final scan code
  and no gate (what the site plotted before the gate existed).
- **served now**: the old snapshots with the gate applied (what is served until
  the next fetch).
- **after**: every salary re-derived from `descriptionHtml` + the snapshot's
  structured salary with the fixed parser, then the gate
  (`flags.renormalized.jsonl`).

| flag | reviewed scan | before | served now | after |
| --- | ---: | ---: | ---: | ---: |
| currency_country_mismatch | 52 | 52 | 52 | 13 |
| hourly_over_cap | – | 41 | 41 | 2 |
| interval_corrected | – | 0 | 0 | 2 |
| interval_suspect | 1 | 1 | 1 | 0 |
| magnitude_suffix | 3 | 3 | 3 | 0 |
| max_over_1_2m | 4 | 4 | 4 | 0 |
| min_under_15k_fulltime | 4 | 4 | 4 | 3 |
| missed_salary | 10 | 10 | 10 | 3 |
| multi_currency | 132 | 3 | 3 | 3 |
| multiple_ranges | 5 | 2 | 2 | 2 |
| no_pay_context | 6 | 42 | 42 | 0 |
| non_year_interval | 352 | 352 | 352 | 315 |
| quarantined | – | 0 | 51 | 7 |
| ratio_over_3 | 15 | 15 | 15 | 14 |
| stat_outlier | 11 | 5 | 0 | 0 |
| structured_text_disagree | 112 | 7 | 7 | 6 |
| title_junior_high | 5 | 5 | 5 | 0 |
| title_senior_low | 1 | 1 | 1 | 0 |
| **salaried (plotted)** | 4602 | 4602 | 4551 | 4562 |
| **flagged** | 505 | 397 | 397 | 350 |
| **critical** | 8 | 49 | 49 | 5 |
| **blocking** (critical and published) | 8 | **49** | **0** | **0** |

The reviewed scan predates three scan refinements: benefit stipends no longer
count as pay words (the drop in `multi_currency` and `structured_text_disagree`
comes from Cohere's "$75/£75 lunch stipend" clause and "$500 home office stipend"),
there is a new `hourly_over_cap` critical flag, and prose ranges over $5M are excluded from
`multiple_ranges`. The remaining `non_year_interval` flags are real hourly,
weekly and monthly pay (reviewed `correct`). The 5 remaining critical flags
are all quarantined: the 3 Anduril typos, plus the 2 Scale AI $300/hr postings
held back by policy (below).

| company | jobs | salaried before | salaried after | quarantined (served now / after) | flagged before / after | blocking before / served / after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| anduril | 2418 | 2277 | 2273 | 6 / 5 | 202 / 201 | 4 / 0 / 0 |
| anthropic | 638 | 558 | 559 | 2 / 0 | 7 / 7 | 2 / 0 / 0 |
| cohere | 132 | 132 | 93 | 39 / 0 | 49 / 10 | 39 / 0 / 0 |
| openai | 833 | 674 | 674 | 0 / 0 | 12 / 12 | 0 / 0 / 0 |
| palantir | 320 | 240 | 240 | 0 / 0 | 42 / 41 | 0 / 0 / 0 |
| scaleai | 194 | 131 | 128 | 3 / 2 | 8 / 7 | 3 / 0 / 0 |
| shieldai | 581 | 456 | 456 | 1 / 0 | 26 / 26 | 1 / 0 / 0 |
| xai | 297 | 134 | 139 | 0 / 0 | 51 / 46 | 0 / 0 / 0 |

Agreement with the review: after re-deriving, **679 of 681** reviewed jobs
match their verdict's `corrected` value (amount within $2/yr, currency, and kind),
and no unreviewed job's salary changed. The 2 exceptions are the Scale AI
policy cases. All 435 regression cases (`test/fixtures/real-salary-cases.json`,
covering the 681 jobs) pass.

F2 fields on the re-derived data: median spread per company is 1.25–1.81×, and
p90 is 1.37–2.45×. `zones` > 1: Anduril 27 (tier lists), Scale AI 16 (location
tiers), xAI 1.

## Gate false-positive analysis and tuning

A quarantine counts as a false positive when the reviewer verdict for that job is
`correct`. Every job the gate quarantined in any configuration below had been
reviewed (unreviewed = 0).

| configuration | data | quarantined | bad | false positives |
|---|---|---:|---:|---:|
| **shipped** | raw snapshots | 51 | 49 | 2 (policy) |
| **shipped** | re-derived | 7 | 5 | 2 (policy) |
| first draft: σ floor 0.25, symmetric z = 3.5, low side all roles | raw | 59 | 49 | 10 |
| first draft | re-derived | 15 | 5 | 10 |
| σ floor 0.25 (other settings shipped) | raw / re-derived | 51 / 7 | 49 / 5 | 2 / 2 |
| σ floor 0.3 | raw / re-derived | 51 / 7 | 49 / 5 | 2 / 2 |
| low side z = 3.5 | raw / re-derived | 51 / 7 | 49 / 5 | 2 / 2 |
| range ratio quarantine at 3× | raw / re-derived | 60 / 16 | 50 / 6 | 10 / 10 |
| any-role hourly cap $350 | raw / re-derived | 49 / 5 | 49 / 5 | **0 / 0** |
| no statistical layer | raw / re-derived | 51 / 7 | 49 / 5 | 2 / 2 |

- **First draft** quarantined legitimate low-paid roles as `stat_outlier`:
  Anduril's Lead Maintenance Engineer ($59K–$78K), Cohere's three Data Annotation
  Specialists (CA$30–40/hr contract), OpenAI's GSOC Operator ($99K–$110K),
  Palantir's Lithuanian Deployment Strategist (€2,400–€5,600/month) and Scale AI's
  Partnerships BDR ($68K–$85K). Fixes: σ floor 0.4; a stricter low side
  (z < −4.5 *and* below the Tukey fence); low-side flags only for full-time salaried
  roles; agreement required in every comparison group of size ≥ 8.
- **Ratio 3×** would hide Anthropic's $280K–$850K postings (4), xAI's
  $180K–$600K and $125K–$400K, OpenAI's $125K–$400K and others. These are stated ranges.
  Quarantine is therefore at 4×, and 3× stays a review flag.
- **The 2 remaining false positives** are Scale AI's "Research Advisor - Human
  Frontier Collective" (US and UK): "$300/hr USD" for a part-time expert
  contract. They are caught by the lead's any-role $250/hr bound (hotfix
  9947fe8). A $350 cap would make the false positives zero; the bound was kept
  at $250 on the lead's call, because a $624K annualized bar for a 10–20 h/week
  contract would mislead the chart anyway.
- On this data the statistical layer adds nothing beyond the hard checks: every bad
  salary is caught by bounds, ratio, title or hourly checks. It is defense in
  depth for errors under the $1.2M cap. In the unit tests it catches a synthetic
  $990K–$1.1M posting among $150K–$360K engineers.

## Known gaps

- Snapshots don't keep raw `pay_input_ranges` or Ashby tiers. Class E, the 3× tier
  guard and the S3 location-currency tier take full effect on the next live
  fetch (the JPY case is already fixed here by the text fallback).
- The local snapshots were not rewritten (`--renormalize --write` would do it).
  Until the next fetch, the server and the static build serve the old salaries
  through the gate ("served now" column).

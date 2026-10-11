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
| `kind` | `"salary"`, `"hourly"` (source interval is hourly), `"stipend"`, or `"ote"`: the posting says the range is on-target earnings, base pay plus commission at target (norm-6, §2) |
| `termWeeks`, `termWeeksMax` | The programme length in weeks that an internship, co-op or fellowship posting states ("12-week internship" → 12, "4 months" → 17, "16 to 24-week" → 16 and 24). Absent otherwise (norm-6, §2) |
| `originalInterval: "term"` | The amount is for the whole programme ("$100,000–$167,000 USD for the four-month fellowship"); `min`/`max` are annualized over the term (norm-6) |
| `originalInterval: "year"` | On a salary with `termWeeks` only: the pay was stated per year or with no interval (Google "Ireland: €72000 (EUR)" for a 13-week internship, Microsoft "CAD $43,800 - CAD $50,000 per year" for a 6-month one). It is a yearly rate, not pay for the term; only week, month or term pay is (norm-8, fix wave 3 BP-1, shared decision 3) |
| `partTime`, `hoursPerWeek`, `hoursPerWeekMax` | `partTime: true` when the role is part-time (employment type, or else title) and the pay was posted per hour. `min`/`max` stay the 2,080-hour (full-time) equivalent; the weekly hours the posting states ("work 16 hours per week") are kept, and Juice uses them or is not computed (norm-8, fix wave 3 BP-9, shared decision 4) |
| `country` | The ISO code of the country the pay line names: Google "Ireland: €72000", Microsoft "across the U.S. is USD …". Juice applies the pay only there (norm-8, fix wave 3 BP-2) |
| `source` | `"structured"` (Greenhouse `pay_input_ranges`, Ashby `compensation`, Lever `salaryRange`) or `"text"` (parsed from the description) |
| `intervalCorrected`, `statedInterval` | The source's interval label made the pay implausible while the numbers are a plausible annual salary, so it was read as annual. Example: "88,000–130,000 USD per-month-salary" |
| `ranges` | The per-tier list `[{min, max, currency, interval, label?}]` (source units) when the board gave several structured ranges |
| `levels` | `[{label, min, max}]` (annual, in the salary's currency) when one posting prices several levels: NVIDIA "184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level 5" → `Level 4`, `Level 5`; Microsoft "IC4 - …", "IC5 - …" → `IC4`, `IC5`. `min`/`max` stay the overall span (norm-7, beta fix wave DQ-8) |
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
- **Currency symbols shared by several currencies** (norm-7, beta fix wave): `zł` is PLN,
  `kr` and `kr.` are SEK, NOK or DKK by the job's country (SEK and DKK when none is Nordic),
  `lei` is RON, and a code in parentheses after the amount wins ("$99000 (CAD)", Google). A bare
  "$" in a posting whose locations are all in Canada is CAD unless the amount's own sentence,
  its heading or a "US:" line says USD (Google's Canada-only roles, Netflix Toronto and
  Vancouver). Pay in a currency with no rate in `FX_PER_USD` is not used (the site would plot it
  as dollars), and the job then gets no other country's range either. RON has a rate since fix
  wave 4 (MR-1), so lei pay is read: "across Romania is lei 199,400.00 - lei 347,800.00 per year"
  (Microsoft), "Romania: lei400000 - lei410000 (RON)" (Google).
- **Fix wave 4 (norm-9, [fix4-data log](process/fix4-data.md)):**
  - a pay line for another country than every one the job is in is not the job's pay ("across
    the U.S. is USD …" on a São Paulo job is `null`, VT-1);
  - "<Country>: The base salary range is …" (NVIDIA "Italy:", "For Poland:") names the pay's
    `salary.country` (VT-6);
  - "The overall market range for Netflix Internships …" is a band for every internship, and a
    range the next sentence calls total compensation ("This market range is based on total
    compensation") is not base pay: `null` (VT-3);
  - a repeated level paragraph is one level, and a level priced twice keeps its widest range,
    so `salary.levels` survives (VT-12, D-34);
  - the parser reads at most `MAX_PAY_TEXT` (40,000) characters (the first 20,000, then 600
    characters each side of later pay words) and `MAX_PAY_AMOUNTS` (1,000) amounts, clause ends
    are found once per text, and the pay-context patterns read at most 600 characters each side
    of the amount (S-3). The longest real description is 26,628 characters and the most amounts
    in one is 65: the S-3 limits alone change none of the 19,173 stored postings' re-derived salaries.
- **One line per country** ("US: $171000 - $247000 (USD) + 20% bonus target …", "Ireland:
  €142000 - €145000 (EUR) …"): the line for the job's country (the US one when the job has a US
  location, else its first location's country). Lines for different countries are never
  spanned; lines for one country are ("[Bachelor's degree] Poland: zł156000", "[Master's
  degree] Poland: zł159000" → 156,000–159,000). A country label starts a new line even when the
  page has no line break between them.
- **SF Bay Area / NYC** (Microsoft, decided by the lead for DQ-13): "There is a different range
  applicable to … the San Francisco Bay area and New York City metropolitan area, and the base
  pay range for this role in those locations is …" is used for a job whose US locations are all
  within 75 km of the bay or 60 km of Manhattan (`payAreas`), by level like the national ranges.
- **Floors and area bands are not pay**: a single figure after "no less than", "not less than",
  "at least" or "a minimum of" (Netflix's union-covered roles: "will be no less than $62.74 an
  hour"), and Netflix's sales "range for roles in this area".
- **Tiered lists** in one block, with the same currency, interval and kind and
  at most 130 characters apart, are spanned to overall min–max when the span is
  at most 3× ("Level 1: $25 - $33/hour … Level 3: $33 - $43/hour" → 25–43).
- **Implausible interval labels**: when the stated interval puts annual pay
  above $1.5M but the numbers are $15K–$1.5M, they are read as annual, with
  `intervalCorrected`.
- **On-target earnings** (norm-6, persona review P-1). `kind: "ote"` when the posting's
  own words say the range includes commission at target: "OTE", "On Target Earnings",
  "on-target earnings", "on target compensation", "base + commission at target".
  - In the clause that holds the range, right before or after the amount with no other
    amount in between ("OTE: $200,000 - $250,000", "$200K–$250K OTE"). "Base salary:
    $150,000 – $180,000. OTE: $300,000" keeps the base range as `"salary"`.
  - In the structured range's own label (a Greenhouse pay range titled "OTE").
  - In a sentence about the range (`oteStatement`: "The figure above represents On-Target
    Earnings (OTE)"). Sentences about compensation work ("Design and administer OTE plans")
    do not count.
  - "For sales roles, the range provided is the role's On Target Earnings ("OTE") range"
    (Anthropic, on every posting) applies only to a sales title (`keywords.js#isSalesTitle`,
    the same rule as the bonus extras). On the 2026-10-10 snapshots that is 46 Anthropic
    postings plus 1 at Cohere; Customer Success, partnerships, enablement and GTM strategy
    titles in Anthropic's Sales department stay `"salary"` (see the fix-pay-data log).
- **Term pay** (norm-6, P-8). "$100,000–$167,000 USD for the four-month fellowship" is
  `interval: "term"`: annualized over the term (× 52 ÷ weeks; 4 months = 52/3 weeks, so × 3),
  with `termWeeks` 17. Before norm-6 it was read as $100K–$167K a year.
- **Programme length** (`programTerm`, P-8). For internships, co-ops, fellowships,
  residencies and apprenticeships only: "N-week/N-month <internship|co-op|fellowship|
  program|residency|placement|work term>", "<programme> runs/lasts/spans N weeks|months",
  or "for N months" in the pay sentence. Stored as `termWeeks` (and `termWeeksMax` for a
  range). The annualized figure stays the full-time-equivalent rate; surfaces show the pay
  as posted and say the term ("$3,850 a week for about 17 weeks").
- **Above the bound**: a posted range above $1.5M, written out in full with a pay word in its
  own clause, is read and then quarantined by the gate (`above_max`), so the posting shows "Pay
  unclear, see posting" rather than nothing. It never beats a plausible amount. Fix wave 5 (VT-10,
  the lead's decision under the user's rule "we must present them as they are and not cut
  anything"): the bound was $1.2M until 2026-10-11; Netflix's real L7 range "$737,000.00 -
  $1,430,000.00" (Netflix pays all cash) is now shown. The gate study
  (`data/vetting/2026-10-11-beta-2/gate-study.mjs`) shows $1.5M still catches the three real
  errors ($4.6M, $5M, $1.56M).
- **Bounds** are checked in rough USD (`USD_PER`, derived from
  `public/viz/palette.js` `FX_PER_USD`): a text candidate must be $10K–$1.5M per
  year. `toJobSalary` refuses values outside $10K–$5M. Values between $1.5M and $5M are
  kept so that the gate quarantines them visibly. **Legal minimum** (fix wave 5, VT-14): a
  currency whose national minimum wage is under $10K a year has its own floor
  (`salary.js#LEGAL_MIN_ANNUAL`, in local currency): Mexico MXN 114,990 (2026 general-zone minimum
  wage MXN 315.04 a day × 365, CONASAMI resolution of 2025-12-03). The gate's `below_min` uses it
  too, so a real Mexican salary ("Monthly Salary: $12,569", MXN) is shown, not quarantined.
- **A bare "$"** takes the job's currency when every location is in one dollar or peso country
  (`salary.js#DOLLAR_COUNTRY`): Canada CAD (D-22, DQ-14) and, since fix wave 5 (DQ-35, VT-14),
  Mexico MXN, Australia AUD, New Zealand NZD, Singapore SGD and Hong Kong HKD, unless the text
  says USD. Elsewhere it stays USD (xAI's "$" in Dublin was reviewed as USD).
- **Cash compensation split into base and variable** (fix wave 5, VT-7, lead decision): NVIDIA's
  sales postings ("… with 85% paid through base salary and 15% variable compensation. The cash
  compensation range is 200,000 USD - 300,000 USD") are read as on-target earnings
  (`kind: "ote"`), shown and labelled, no longer null. A "total compensation" range (bonus,
  equity) is still not pay.
- **Amazon's pay table** (fix wave 5, `server/sources/amazon.js#amazonSalary`): each row is tied
  to the posting's location strings it names (`salary.ranges[].locations`, yearly), identical
  rows are one range (one zone), and a "Virtual Location" row for a state the posting lists no
  place in is dropped. The sentence above the table decides what the figure is:
  - "The minimum gross base pay salary for this position is listed below" / "See below the
    minimum gross base salary" (EU, Poland): `kind: "minimum"`, shown as "from €X", never hidden
    (VT-17). A posting that also says "The base pay for this position is PLN 6000 monthly" states
    the pay itself and keeps `"salary"`.
  - "including the base pay rate plus the highest available shift differential" (US hourly):
    the posted figure stays, with `includesShiftDifferential: true`, and `statedBase` when the
    posting states a lower base ("Pay starts at $18.35 per hour") (VT-18).
  - "The minimum basic salary for this position is EUR 47'000 gross annually" (Austria, 14
    payments a year): that annual figure is the salary (`statedAnnual`), not 12 × the monthly
    row (VT-19).

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
| `above_max` (critical) | annual max > **$1.5M** (USD) | $4.6M, $5M and $1.56M were all errors; the highest real posted range is Netflix L7 ($737K–$1.43M, all cash), shown since fix wave 5 (VT-10; $1.2M until then) |
| `below_min` (critical) | annual min < **$15K** on a full-time role, unless at or above the country's legal minimum (`LEGAL_MIN_ANNUAL`: Mexico MXN 114,990) | Below US federal minimum wage × 2080. All 4 real hits were source typos (12,600 for 126,000) or the JPY ÷100 bug |
| `hourly_high` (critical) | hourly rate > **$250/hr** on any role, or > **$200/hr** on a role the source marks Full-time | Catches "$500 home office stipend" read as $500/hr ($1.04M/yr, 39 postings). That cluster is under the $1.5M cap and too common for the statistics to see |
| `range_ratio` | max/min > **4×** | Real stated ranges reach 3.4× (Anthropic $280K–$850K, xAI $180K–$600K, OpenAI $125K–$400K). A 3× cutoff would hide 10 legitimate postings. The Anduril typos are 13.3× |
| `min_gt_max` | min > max | |
| `junior_high` | Intern/Fellow/Resident/Apprentice/Co-op title with mid > **$300K/yr** ("Technical/Distinguished/Senior Fellow" excluded; not term pay, `originalInterval: "term"`) | The Fellows stipend is $200K annualized. Term pay is the posting's own amount for a stated term: Anthropic's Conceptual Reasoning Fellow states "$100,000–$167,000 USD for the four-month fellowship (equivalent to $300,000–$500,000 USD annualized)" |
| `senior_low` | Director/VP title with max < **$60K/yr** | |

### Statistical outliers (per company)

For each salaried job not caught by a hard check, the gate computes
`x = ln(mid in USD)` and compares it with the company and with every
comparison group that has **at least 8** members: department, role family
(from the title), pay kind and, since fix wave 5 (VT-16), the pay's currency (`cur:<code>`).
A job is a `stat_outlier` only if it is an outlier company-wide **and** in each such group, in
the same direction. A low-side flag on pay in another currency than the company's main one
needs its own `cur:<code>` group of 8 or more: Microsoft's correct lei IC1 ranges in Romania
(lei 83,000–107,800) are not low against US pay (DQ-6 residue; 2 quarantined before, 0 now).
Pay kind `"minimum"` (a stated minimum, VT-17) is never flagged on the low side.

- robust z = (x − median) / σ, with σ = max(1.4826 · MAD, **0.4**);
- Tukey fences on log pay: Q1 − 3·IQR and Q3 + 3·IQR (IQR floored at 0.4);
- **high side**: z > **3.5** or above the upper fence (at least about 4× the median);
- **low side**: z < **−4.5** and below the lower fence (at least about 6× under the median),
  and only for full-time salaried roles (`kind` "salary" or "ote"). Hourly, stipend,
  contract and intern pay is legitimately low. "ote" is its own pay-kind group, so OTE
  ranges are compared with each other; on the 2026-10-10 snapshots this changes no
  quarantine.

Tuning on the real snapshots (5,413 jobs) is in
`data/vetting/2026-10-02/summary.md`. The first draft (σ floor 0.25, symmetric z,
low side for all roles) quarantined legitimate low-paid roles: a $59K–$78K
maintenance engineer, CA$30/hr contract annotators, a $99K–$110K security
operator, a €2,400–€5,600/month Lithuanian role and a $68K–$85K BDR. The shipped
settings quarantine none of them. On today's data the statistical layer adds no
quarantines beyond the hard checks. It is there for errors under the $1.5M cap,
such as a $1M posting at a company whose median is $250K (tested synthetically).

**Known false positives (deliberate):** the two Scale AI "Research Advisor,
Human Frontier Collective" postings state $300/hr for a part-time expert
contract. The reviewer verdict is `correct`, but the any-role $250/hr bound
(lead decision) quarantines them. An annualized $624K for 10–20 hours a week
would mislead the chart anyway. Netflix's L7 range "$737,000.00 - $1,430,000.00" (all cash) is the
`above_max` false positive on the beta boards (2026-10-11 review, VT-10): raising `MAX_ANNUAL` to
$1.5M would publish it and still catch every real error that set the bound ($1.56M, $4.6M, $5M).

**Big-tech margins (2026-10-11 beta review):** highest hourly rate $116.83 (Microsoft), highest intern
mid $156K (Netflix), lowest director maximum $128K, widest stated range 3.55x (NVIDIA's intern rate
"20 USD - 71 USD"; a 3.5x quarantine would hide 18 correct postings). The statistical layer flags
nothing there: Netflix's σ is 0.52 around a $427K median. Amazon and Meta (second beta review, the
same day): highest hourly $85.86, intern mid $156K (Amazon), lowest director maximum $144K (Meta),
widest range 2.0x (Amazon), highest annual maximum $527K (Meta).

**Known false positives of the statistics (second beta review, VT-16):** the comparison groups
(department, role family, pay kind) mix countries, so a correct Romanian range is a low outlier
against U.S. pay: Microsoft "Cloud Solution Architecture IC1 … across Romania is lei 83,000.00 - lei
107,800.00 per year" ($20.8K against a $166K median) and "Technical Support Engineering IC1 … lei
90,500.00 - lei 135,700.00" are quarantined. A `cur:<currency>` comparison group (used, like every
group, only with at least 8 members) keeps both and changes no other quarantine on the 15 boards
(`data/vetting/2026-10-11-beta-2/gate-study.mjs`).

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
| `max_over_1_2m` **critical** | annual max > $1.5M (USD; the gate's `above_max`, $1.2M until fix wave 5: the code keeps its name so earlier verdicts still match) |
| `min_under_15k_fulltime` **critical** | annual min < $15K on a full-time role (employment type and title not part-time/intern/contract) |
| `hourly_over_cap` **critical** | the gate's `hourly_high` |
| `ratio_over_3` | max/min > 3 (review flag; the gate quarantines above 4) |
| `no_pay_context` | text-sourced salary whose amount is not pay by the parser's own rules (`server/salary.js#payContextAt`: the same clause ends, so "across the U.S. is USD $X" keeps its pay words, and the same pay context, so "US: $X - $Y (USD) + 15% bonus target + equity" is pay) |
| `magnitude_suffix` | the matched text has an M/B/million/billion suffix |
| `currency_country_mismatch` | currency is none of the location countries' currencies (only when countries are known) |
| `non_year_interval` | source interval is hour/day/week/month |
| `interval_suspect` | non-year interval whose annualized pay is over $1.5M while the raw numbers are plausible as annual |
| `interval_corrected` | the parser or derivation already read the stated interval as annual |
| `multiple_ranges` | more distinct money ranges in pay context than the salary's `zones` (the parser's own count: level tiers and national + city ranges it read by rule are not flagged); with no salary, two or more. Prose ranges over $5M excluded |
| `multi_currency` | a pay clause lists more than one currency (a bare "$" next to "$… CAD" counts once) |
| `structured_text_disagree` | structured salary and the text parse differ by > 10% in min or max, or in currency. A merged Apple requisition (per-place `salary.ranges` with their places) agrees when the text states any one of its ranges (fix wave 4, DQ-32: 63 false flags on 2026-10-11, 0 after) |
| `missed_salary` | no salary, but an amount with a currency is in the parser's pay context, or has a pay word (salary, compensation, pay, base, range, OTE, annual, hourly, stipend, wage, contract/pay rate) in the parser's clause, and no parser rule rejects it (total or cash compensation, a pay floor, an area band, funding or bonus words). Amounts are read with the parser's tokens (`findMoneyTokens`: "zł280000", "kr 577,000.00", "$99000 (CAD)") |
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

Big-tech conventions (2026-10-11 beta review, `data/vetting/2026-10-11-beta/summary.md` §7):

- An Apple requisition's per-place ranges (`salary.ranges`) spanned into one salary is `correct`
  (the places' own ranges, at most about 2.3x); where that span is shown is a separate finding.
- On a multi-country posting the job's own country line is `correct` (the US one when the job has
  a US location). Another country's line on a job with none of its own ("across the U.S. is USD …"
  on a São Paulo job) is `parser_bug` with `corrected: null`.
- A posted range in a currency the site has no rate for is `parser_bug`, corrected to the
  posted range: the posting is clear and nothing is shown. (RON was the case until fix wave 4.)
- A band for all roles of a kind ("The overall market range for Netflix Internships …") or a range
  the posting calls total compensation is `parser_bug`, corrected null (base pay only).

Amazon and Meta conventions (second beta review, `data/vetting/2026-10-11-beta-2/summary.md` §7):

- Amazon's per-location pay table: the primary location's row is `correct` (DATA_SOURCES §7a). Where
  the other places are shown and Juiced on it is a separate finding (VT-15).
- A single figure under "See below the minimum gross base salary for this position" (Amazon's EU and
  Poland tables) is a floor, `parser_bug` with `corrected: null` by the floor rule (§2), unless the
  posting also states that figure as the pay ("The base pay for this position is PLN 6000 monthly").
- An Amazon hourly row "including the base pay rate plus the highest available shift differential" is
  `correct`; when the text also states a lower starting rate ("Pay starts at $18.35 per hour") the
  verdict is `source_ambiguous` with the structured row as corrected (structured wins).
- A bare "$" on a posting whose places are all in Mexico is pesos (`parser_bug`, corrected MXN).
- Meta's only pay source is the structured `public_compensation` field (the description states none),
  so its quotes are that field's own strings ("$7,313/month to $12,667/month (US)").

A verdict may carry `quote_source`: `excerpt`, `pay_snippets`, `posting_text` (the posting's
flattened description, when the pay table or the sentence above it is outside the 300-character
excerpt) or `structured_field`.

Each verdict also carries `quote`, the exact substring of the excerpt or pay snippets that its
`evidence` starts with, so it can be checked by machine (as `llm-vet.js` does).

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

# Beta boards (first run 2026-10-11): the scan takes the files, and the review folder is <date>-beta.
node scripts/vet-salaries.js data/beta/snapshots/*.json data/snapshots/anduril.json \
  --date 2026-10-11-beta --sample 25 --seed 20261011
# What the beta site publishes (build-static's readSnapshot steps), and the same with every
# quarantine undone for a no-gate view; then the threshold study on a copy of the gate.
node data/vetting/2026-10-11-beta/published-view.mjs /tmp/pv data/beta/snapshots/*.json data/snapshots/*.json --ungated
node data/vetting/2026-10-11-beta/gate-study.mjs /tmp/pv/ungated
```

A stored snapshot keeps the crawl's quarantines (`salaryFlag`), so `--no-gate` on it shows the same
counts as the gate; scan `published-view.mjs --ungated` output for the raw view. The scan reads the
stored salaries; the build re-derives a snapshot from an older normalizer first. On 2026-10-11 the
two agreed for all 16,182 beta and Anduril postings.

Second beta review, same day (Amazon and Meta first): scan the published view, so the review input is
what the build serves (the snapshots were norm-8, the code norm-9; 19 salaries differ, all from fix
wave 4), and keep the stored scan's counts beside it.

```bash
node data/vetting/2026-10-11-beta/published-view.mjs /tmp/pv data/beta/snapshots/*.json data/snapshots/anduril.json --ungated
node scripts/vet-salaries.js /tmp/pv/{amazon,meta,apple,google,nvidia,microsoft,netflix,anduril}.json \
  --date 2026-10-11-beta-2 --sample 25 --seed 2026101102
node data/vetting/2026-10-11-beta-2/review-rules.mjs all --pv /tmp/pv
node data/vetting/2026-10-11-beta-2/gate-study.mjs <ungated published lists of all 15 boards>
```

`scripts/llm-vet.js` does not see a `<date>-<channel>-2` folder yet (VT-25).

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
          retention-days: 90 # GitHub maximum; the permanent copy is the data-archive branch
```

The beta boards are gated three times: `snapshot.yml` "Beta salary vetting gate" at crawl time,
`pages.yml` "Beta salary vetting gate (per company; …)" (`.github/scripts/beta-gate.sh`, the scan
per snapshot with `--no-write-flags`), and `build-static.js --beta-only` (`betaGate()` on the
published lists). None of them keeps a flags report or runs the LLM review; this advisory step after
the beta gate does both (2026-10-11 review, VT-11):

```yaml
      - name: Beta salary vetting report (advisory; flags + LLM review)
        if: always()
        continue-on-error: true
        timeout-minutes: 10
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          VET_LLM_MODEL: ${{ vars.VET_LLM_MODEL || 'claude-sonnet-5-5' }}
        run: |
          shopt -s nullglob
          files=(data/beta/snapshots/*.json)
          [ "${#files[@]}" -gt 0 ] || { echo "no beta snapshots to report on"; exit 0; }
          mkdir -p "$RUNNER_TEMP/vetting-beta"
          node scripts/vet-salaries.js "${files[@]}" --no-fixtures --out "$RUNNER_TEMP/vetting-beta/flags.jsonl" --summary "$GITHUB_STEP_SUMMARY" || true
          node scripts/llm-vet.js --flags "$RUNNER_TEMP/vetting-beta/flags.jsonl" --out "$RUNNER_TEMP/vetting-beta/llm-verdicts.jsonl" --skip-reviewed --limit 100

      - name: Upload beta salary vetting report
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: salary-vetting-beta
          path: ${{ runner.temp }}/vetting-beta
          retention-days: 90
          if-no-files-found: ignore
```

`--skip-reviewed` sees `data/vetting/<date>/` and `data/vetting/<date>-beta/` reviews
(`llm-vet.js#reviewedFiles`, fix wave 4, VT-9). Without `--flags`, `--channel beta` picks the latest
`<date>-beta/flags.jsonl` (the default stays the latest dated main-site folder).

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
| `published-view.mjs`, `gate-study.mjs`, `flags.ungated.counts.json` | (beta, 2026-10-11) the published lists as the build makes them, the threshold study on a copy of the gate, and the no-gate scan counts |

A review of the beta boards lives in `data/vetting/<date>-beta/` (first: `2026-10-11-beta`; the
second, the same day, with Amazon and Meta: `2026-10-11-beta-2`, whose `flags.stored.counts.json`
is the scan of the stored snapshots and `flags.jsonl` the scan of the published view).

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
- Beta snapshots over the 40 MB budget keep 4,000 characters of each description plus at most 4 pay
  paragraphs (`scripts/snapshot.js#trimDescription`). An Amazon pay table with more rows loses the
  rest: in 292 of 5,000 Amazon postings on 2026-10-11 the published row is not in the stored text
  (VT-22). The structured salary is kept, so the published pay is unchanged, but a review must quote
  the structured row.

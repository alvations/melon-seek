# Salary vetting of the beta boards, 2026-10-11

Reviewer: claude via Claude Code (log: `docs/process/vetting-beta.md`; prompt:
`docs/process/prompts/vetting-beta.md`). Method and definitions: `docs/VETTING.md`. This is the
first vetting of the beta boards; the main site's is `data/vetting/2026-10-02/`.
(Written to disk by the lead from the vetting agent's final report, because the harness blocks
subagents from writing report-style Markdown.)

## Input

- `data/beta/snapshots/{apple,google,microsoft,netflix,nvidia}.json` and, for comparison,
  `data/snapshots/anduril.json`: today's rebuild from the data-archive branch, every board observed
  2026-10-11 between 06:38 and 08:00 UTC. **16,182 postings, 10,556 with a published salary.**
- The snapshots were written by norm-7 crawls. The build (`scripts/build-static.js#readSnapshot`)
  re-derives them with the worktree's norm-8 code (git 6f69079, `salary.js` sha256 `bea9f3bd206d`),
  then applies the big-tech adapter fixes and the gate. `published-view.mjs` (this folder) repeats
  those steps. For all 16,182 postings the published salary has the same numbers, currency and kind
  as the stored one. Only norm-8 labels are added: `salary.country` (Google 2,207, Microsoft 1,468)
  and `partTime` (Apple 52). The scan of the published lists gives exactly the counts below.

## 1. Scan

`node scripts/vet-salaries.js data/beta/snapshots/{apple,google,microsoft,netflix,nvidia}.json data/snapshots/anduril.json --date 2026-10-11-beta --sample 25 --seed 20261011`
**Exit 0**: 0 blocking, and 435/435 regression fixtures pass. Result files: `flags.jsonl` (578 lines),
`flags.counts.json`, `sample.jsonl` (150 lines, seed 20261011).

| company | jobs | salaried | quarantined | flagged | critical | blocking | flags |
|---|---:|---:|---:|---:|---:|---:|---|
| apple | 4,875 | 2,818 | 0 | 208 | 0 | 0 | non_year_interval 145, structured_text_disagree 63 |
| google | 3,417 | 2,217 | 0 | 20 | 0 | 0 | multi_currency 16, missed_salary 4 |
| microsoft | 2,279 | 1,490 | 0 | 95 | 0 | 0 | non_year_interval 79, missed_salary 12, multiple_ranges 5, currency_country_mismatch 1 |
| netflix | 457 | 290 | 2 | 8 | 1 | 0 | non_year_interval 6, quarantined 2, ratio_over_3 1, max_over_1_2m 1 |
| nvidia | 2,663 | 1,396 | 0 | 44 | 0 | 0 | non_year_interval 44, ratio_over_3 21 |
| anduril | 2,491 | 2,345 | 5 | 203 | 3 | 0 | non_year_interval 196, ratio_over_3 5, quarantined 5, min_under_15k_fulltime 3, currency_country_mismatch 2, interval_corrected 1 |
| **total** | **16,182** | **10,556** | **7** | **578** | **4** | **0** | |

**`--no-gate`** on the same files gives the same table, because the stored snapshots already carry
the crawl's quarantines (`salaryFlag`). On copies with every quarantine undone (`published-view.mjs
--ungated`; counts in `flags.ungated.counts.json`) the no-gate scan **exits 1**: Netflix has 292
salaried and 1 blocking, Anduril 2,350 salaried and 3 blocking.

**The gate quarantines 7 salaries:**

| company | quarantined | codes | postings |
|---|---:|---|---|
| Apple, Google, Microsoft, NVIDIA | 0 | | |
| Netflix | 2 | range_ratio 1, above_max 1 | L4 "$71,040.00 - $464,000.00" (6.5x); L7 "$737,000.00 - $1,430,000.00" |
| Anduril | 5 | below_min + range_ratio 3, range_ratio 2 | the 13x source typos also found on 2026-10-02 |

## 2. Review

Every flagged job (578) and the seeded sample (25 unflagged salaried jobs per company, 150) was read
against its excerpt and, where the excerpt was not enough, the posting's full pay section. The
decisions are in `review-rules.mjs` (per id and per pattern, append-only, replayable) and its
output is `verdicts.jsonl`, one line per job. Each verdict carries a `quote`: an exact substring of
the review input. All 728 quotes were also checked against the posting's full flattened text, and
every corrected min and max appears in that text.

| | flagged | sampled (seed 20261011) | total |
|---|---:|---:|---:|
| jobs reviewed | 578 | 150 | **728** |
| `correct` | 551 | 150 | 701 |
| `parser_bug` | 19 | 0 | 19 |
| `source_ambiguous` | 8 | 0 | 8 |

| company | reviewed | correct | parser_bug | source_ambiguous |
|---|---:|---:|---:|---:|
| apple | 233 | 233 | 0 | 0 |
| google | 45 | 41 | 4 (RON) | 0 |
| microsoft | 120 | 107 | 13 (12 RON, 1 Brazil) | 0 |
| netflix | 33 | 30 | 2 (intern market band) | 1 (L4 6.5x) |
| nvidia | 69 | 69 | 0 | 0 |
| anduril | 228 | 221 | 0 | 7 (5 typos, 2 labels) |

**All 150 sampled jobs were correct.** Beyond the review set, every one of the 10,556 published
salaries was checked by machine. Its min and max (in the source interval) appear as numbers in its
`salary.text`, and for text-sourced salaries that text appears in the posting: 0 mismatches. The
errors found are about which range is shown, for which place, and on which pay basis. None of them
is a misread number.

### Counts before and after review

"After" is what the posting supports, applying the corrected values.

| company | published now | wrong and published | stated but not shown | after review |
|---|---:|---:|---:|---:|
| apple | 2,818 | 0 | 0 | 2,818 |
| google | 2,217 | 0 | 4 (VT-2) | 2,221 |
| microsoft | 1,490 | 1 (VT-1) | 12 (VT-2) | 1,501 |
| netflix | 290 | 2 (VT-3) | 1 (VT-10, policy) | 288, or 289 if the bound is raised |
| nvidia | 1,396 | 0 | 45 by policy (VT-7, not in the review set) | 1,396, or 1,441 as OTE |
| anduril | 2,345 | 0 | 0 | 2,345 |

## 3. Bug classes

| # | Class | Severity | Postings | Companies | Example | Owner |
|---|---|---|---:|---|---|---|
| VT-1 | Another country's pay line used as the job's pay | High | 1 | microsoft | 1970393556980229: a São Paulo job with only "across the U.S. is USD $75,400 - $167,900" | `server/salary.js#parseSalary` |
| VT-2 | Romanian pay (lei, RON) not read: no FX rate | Medium (missed) | 16 | google 4, microsoft 12 | "Romania: lei400000 - lei410000 (RON)" | `public/viz/palette.js` FX_PER_USD (+ copies) |
| VT-3 | A total-compensation market band for all internships published as base hourly pay | High | 2 | netflix | "The overall market range for Netflix Internships is typically $40/hour - $110/hour. This market range is based on total compensation (vs. only base salary)" | `server/salary.js#contextOf` |
| VT-4 | Pay shown for places Apple posted no pay for (= DQ-27/28 of data-check-beta-2) | High | 376 | apple | 200578781-0157 Thermal Engineer: the Cupertino range shown for Austin; Juice headline at Austin | `server/sources/apple.js#mapCopies`, `server/juice.js#attachJuice`, `public/features/shared.js#payLocations` |
| VT-5 | `payLocations` ignores `salary.country`: one euro-zone country's pay shown at the posting's other euro-zone places | High | 35 | google 12, microsoft 22, nvidia 1 | 1970393556979216: Ireland's €49,200-€71,400 shown for Barcelona; the posting gives Spain €38,000-€59,700 | `public/features/shared.js#payLocations` |
| VT-6 | NVIDIA's "Italy: The base salary range is …" leaves `salary.country` unset | High | 1 | nvidia | 893395799578: Italy's range shown for Germany and France | `server/salary.js#lineLabel` / `unitCountry` |
| VT-7 | NVIDIA sales "cash compensation range" (85% base, 15% variable) not shown | Medium (decision) | 45 | nvidia | 893395123425: "The cash compensation range is 224,000 USD - 356,500 USD for Level 5, and …" | `server/salary.js` (`TOTAL_COMP_RE`), kind 'ote' |
| VT-8 | Title level beats the board's own IC/M level | Medium (level label) | 286 + 79 | microsoft, nvidia | "Director, MAVS Technology & Product" at IC5 is Director+ | `server/keywords.js#jobSeniority` |
| VT-9 | `llm-vet --skip-reviewed` ignores `<date>-beta` folders | Low | 728 verdicts | tooling | `reviewedFiles()` matches `^\d{4}-\d{2}-\d{2}$` only | `scripts/llm-vet.js#reviewedFiles`, `latestFlags` |
| VT-10 | A real posted range above $1.2M hidden ("Pay unclear") by policy | Medium (missed, policy) | 1 | netflix | L7 "$737,000.00 - $1,430,000.00" | `server/vet.js` VET.MAX_ANNUAL |
| VT-11 | CI: the beta gate keeps no flags report and gets no LLM review | Low | all beta | CI | `beta-gate.sh` runs the scan with `--no-write-flags` | `.github/workflows/pages.yml` |
| VT-12 | Level list lost or one range repeated when Microsoft repeats a pay paragraph or puts a level after a paragraph break | Low (wording) | 12 | microsoft | 1970393556657727: "IC5 …; IC6 …; IC5 …; IC6 …", shown as "Multiple pay zones" | `server/salary.js#parseSalary` (group levels) |
| VT-13 | A double-escaped newline "&#xa;" shown inside NVIDIA's pay sentence | Low (wording) | 44 | nvidia | "The hourly rate for our interns is 20 USD - 71 USD.&#xa;" | `server/sources/eightfold.js` (description decode) |
| S | Source problems handled correctly | — | 8 | netflix 1, anduril 7 | 6.5x L4 range and 13x typos (quarantined), "UK Salary Range €14,41 — €18,82 EUR", "US Hourly Range $220,000 — $292,000" (read as annual) | — |

Scan noise (no new ID): the 63 Apple `structured_text_disagree` flags are all false alarms. A merged
requisition spans its places' ranges by design, and the scan compares that span with one footer.
data-check-beta-2 filed this as DQ-32.

### Findings in detail

**VT-1 High.** Microsoft, `microsoft:1970393556980229` "Data Center Critical Environment Technician
Manager", https://apply.careers.microsoft.com/careers/job/1970393556980229. Source: "Critical
Environment Ops M3 - The typical base pay range for this role across the U.S. is USD $75,400 -
$167,900 per year." (plus the SF Bay Area / NYC range). The only location is "São Paulo State,
Brazil". Expected: no salary, because no pay is stated for Brazil. Actual: USD $75,400-$167,900 with
`salary.country` "US", plotted under Brazil. No place on the posting uses USD, so `payLocations`
keeps the Brazilian place. Affects 1 of 1,490 Microsoft salaries (0.07%). Owner:
`server/salary.js#parseSalary`. When the best candidate's pay line names a country (`area`) that none
of the job's known countries is, return null, as the parser already does for an unreadable
own-country line (`unreadableOwn`). Test: `test/beta-vetting.test.js` VT-1.

**VT-2 Medium.** Google and Microsoft. `google:121961208335999686`
(https://www.google.com/about/careers/applications/jobs/results/121961208335999686) says "Romania:
lei400000 - lei410000 (RON) + 15% bonus target + equity + benefits"; `microsoft:1970393557006510`
says "… across Romania is lei 199,400.00 - lei 347,800.00 per year". Expected: RON pay. Actual: none,
because RON has no rate in FX_PER_USD (a documented gap, VETTING.md §2). Affects Google 4 of 3,417
postings (0.12%) and Microsoft 12 of 2,279 (0.53%): every Romania posting that states pay. This is
the same root cause as data-check-beta-2's "DQ-6 residue" (its test covers the Microsoft format,
VT-2's the Google one). Owner: `public/viz/palette.js` FX_PER_USD and its copies in
`server/salary.js` and `server/juice.js`. The Big Mac FX source in `data/cities.json` has no
Romania, so the rate needs another source.

**VT-3 High.** Netflix, `netflix:790315673635` "Video Algorithms Intern, Video Coding (Gaussian
Splatting), Fall 2026" (https://explore.jobs.netflix.net/careers/job/790315673635) and
`netflix:790317917022` "Machine Learning/AI Infrastructure Engineering Intern (AI Platform) PhD,
Winter 2027" (https://explore.jobs.netflix.net/careers/job/790317917022). Source: "The overall market
range for Netflix Internships is typically $40/hour - $110/hour. This market range is based on total
compensation (vs. only base salary)". Expected: no salary. It is a band for every internship, like
the sales "range for roles in this area" the parser already rejects, and it is total compensation,
not base pay (DATA_SOURCES.md §7a "Base pay only"). Actual: published as base hourly pay $40-$110/hr
($83K-$229K a year) and $40-$85/hr. Affects 2 of 290 Netflix salaries (0.7%). Owner:
`server/salary.js#contextOf`: AREA_BAND_RE should cover "market range for … Internships", or a
following "based on total compensation (vs. only base salary)" sentence about the range should
reject it. Test: VT-3.

**VT-4 High (same finding as data-check-beta-2 DQ-27/DQ-28, confirmed independently).** Apple. Apple
posts pay only in pay-transparency states. In this crawl those are CA, CO, CT, DC, IL, MA, MD, ME,
MN, NJ, NY, OH, VA and WA; 0 of 299 Texas-only postings and 0 of 474 US postings without a footer
show any pay. A requisition listed in Austin and Cupertino gets Cupertino's range on every place.
**376 of 2,818 Apple salaries (13.3%) are shown at a US place in a state where Apple posted no pay,
and 365 of them (13.0%) have their headline Juice computed at such a place** (almost always Austin,
TX, from California pay; data-check-beta-2 counts 367 with its method). Where the listings' ranges
differ (395 postings), 137 still list a place with no range of its own. Example:
`apple:200578781-0157` "Thermal Engineer",
https://jobs.apple.com/en-us/details/200578781-0157/thermal-engineer. Owners:
`server/sources/apple.js#mapCopies` (a single footer group drops the places it is for),
`server/juice.js#attachJuice` and `public/features/shared.js#payLocations`. No new test, because
data-check-beta-2's DQ-27 tests cover it.

**VT-5 High.** Google, Microsoft, NVIDIA. `payLocations(job)`, which drives the map, the Location
filter, Compare and Compstimate, keeps every place whose country uses the pay's currency. It ignores
`salary.country`, which fix wave 3 added for exactly this purpose: the country the pay line names.
Example: `microsoft:1970393556979216` "Digital Enterprise Solution Sales Specialist - AI Workforce-
Hebrew speaking" (Dublin, Barcelona, Spain;
https://apply.careers.microsoft.com/careers/job/1970393556979216). Source: "… across Ireland is €
49,200.00 - € 71,400.00 per year … across Spain is € 38,000.00 - € 59,700.00 per year". Expected:
Ireland's range applies to Dublin only. Actual: it is shown for the Spanish places too. Affects
Google 12 of 2,217 salaries (0.54%), Microsoft 22 of 1,490 (1.5%; plus VT-1) and NVIDIA 1 (via VT-6).
In 30 of these postings the other country has its own line, so the right figure exists and a wrong
one is shown. Juice is correct here, because `attachJuice` honours `salary.country`. Owner:
`public/features/shared.js#payLocations`. Test: VT-5.

**VT-6 High.** NVIDIA, `nvidia:893395799578` "Senior AI Compute Engineer" (Italy, Germany,
Switzerland, France; https://jobs.nvidia.com/careers/job/893395799578). Source: "We are considering
the following: Italy: The base salary range is 66,000 EUR – 114,000 EUR for level 4, and 86,250 EUR –
149,500 EUR for level 5." Expected: `salary.country` "IT". Actual: unset, so the euro range is
applied to Germany and France as well. Affects 1 posting. The other 35 non-US NVIDIA salaries ("For
Poland: …", CAD, one Italy-only) also lack the country, but no other listed country uses their
currency, so nothing else is affected today. Owner: `server/salary.js#lineLabel` / `unitCountry`
(a "Country:" label that starts the sentence, not only one right before the amount). Test: VT-6.

**VT-7 Medium (a decision for the lead).** NVIDIA's sales roles state "Your cash compensation will be
determined … with 85% paid through base salary and 15% variable compensation. The cash compensation
range is 224,000 USD - 356,500 USD for Level 5, and 248,000 USD - 396,750 USD for Level 6"
(`nvidia:893395123425`, https://jobs.nvidia.com/careers/job/893395123425). By rule (DATA_SOURCES.md
§7a) this gets `salary: null`. That is on-target cash pay, base plus variable at target, in all but
the word "OTE". Affects 45 of 2,663 NVIDIA postings (1.7%; 42 US), which show no pay.
Recommendation: `kind: 'ote'`, which the app already labels and keeps out of base-pay medians. This
is the open question already raised in the fix-pay-data log. No test, because the rule change is a
decision.

**VT-8 Medium (a level label, not pay, but the pay is compared in that level's bucket).** Microsoft
and NVIDIA. Microsoft's pay sentence names the board's own level: IC for an individual contributor,
M for a manager. `jobSeniority` lets the title win. **286 of the 998 Microsoft postings (28.7%) whose
title and pay sentence both state a level disagree.** 36 "Director …" titles at an IC level become
Director+ (e.g. `microsoft:1970393556851185` "Director, MAVS Technology & Product", IC5,
https://apply.careers.microsoft.com/careers/job/1970393556851185). 55 "… Manager" titles at IC4
become Manager (e.g. `microsoft:1970393556874976` "Senior Finance Manager, Cloud Accounting", IC4).
NVIDIA: 79 of 741 (10.7%), mostly "Manager" titles posted at Level 3/4 (56) and "New College Grad"
at Level 2 (11). For the Microsoft IC/M cases the board's level should win. The NVIDIA NCG cases are
better on the title. Owner: `server/keywords.js#jobSeniority`. Tests: VT-8.

**VT-9 Low.** `scripts/llm-vet.js#reviewedFiles` and `latestFlags` only see folders named
`YYYY-MM-DD`. This review's 728 verdicts are therefore invisible to `--skip-reviewed`, and a CI LLM
review of the beta flags would pay for all of them again. Test: VT-9.

**VT-10 Medium (missed by policy).** Netflix, `netflix:790312403200` "Software Engineer (L7) -
Application Networking", https://explore.jobs.netflix.net/careers/job/790312403200, "The range for
this role is $737,000.00 - $1,430,000.00". The range is real (Netflix pays all cash) and above the
gate's $1.2M bound, so it shows "Pay unclear, see posting". Verdict `correct`: this is the gate's
only false positive on the beta boards. See §5 for the bound.

**VT-11 Low.** CI, see §6.

**VT-12 Low.** Microsoft, 12 postings (0.8%). In 4, the posting repeats its pay paragraph (Finland
"IC5 …; IC6 …; IC5 …; IC6 …", `microsoft:1970393556657727`), lists two different IC3 ranges
(`microsoft:1970393556637088`), or puts a second level after a paragraph break
(`microsoft:1970393556984110`, IC5 unlabelled). The level names are then not unique or missing, so
the salary loses `levels` and shows "Multiple pay zones" instead of the level list. The other 8
repeat one identical range, so `salary.text` names it twice. The spans themselves are right. Owner:
`server/salary.js#parseSalary` (dedupe identical group candidates before naming levels).

**VT-13 Low.** NVIDIA. 44 postings carry "&amp;#xa;" in `descriptionHtml`, shown as "&#xa;" right
after the pay sentence. Owner: `server/sources/eightfold.js` (description decode).

## 4. Big-tech specifics (whole published set, not only the review set)

**Ranges over several levels.** NVIDIA publishes 867 two-level postings ("… for Level 4, and … for
Level 5") with `levels`, at max/min ≤ 1.95, and every span matches the text. 13 more two-level
postings are sales cash compensation (VT-7), and one PERM-style posting has 5 unlabelled ranges
spanned to 2.89x (`nvidia:893397830858`). Microsoft has 169 postings with several distinct level
ranges. 164 are published with `levels` (137 at spread ≥ 2, labelled "Wide range" plus the level
list), 4 lose the list (VT-12) and 1 is in lei (VT-2). Microsoft's national, SF Bay Area / NYC and
country lines were checked against the text for all 1,475 postings that state them: 1,463 match and
the 12 mismatches are the RON ones. **No multi-level span exceeds 3x.** The only ranges above 3x are
21 NVIDIA intern hourly rates ("20 USD - 71 USD", 3.55x; "30 USD - 94 USD", 3.13x). Each is one
stated range, not a span. They are flagged `ratio_over_3`, not quarantined (under 4x), and labelled
as wide ranges. One Netflix 6.5x range is quarantined.

**Several places or countries.** Multi-country salaried postings: Google 57, Microsoft 41, NVIDIA
21, Netflix 3, Anduril 5. Apple has none, but 690 Apple postings list more than one place. The pay
line's country is not one of the job's countries in 1 case (VT-1). One country's pay is shown at
another country's places in 35 postings (VT-5, VT-6). Pay is shown at Apple places without posted
pay in 376 postings (VT-4). Google's and Microsoft's country lines are otherwise always the job's
own: the US line when the job has a US location, else the first location's country with a line,
and countries are never mixed.

**On-target earnings, bonus and equity.** No beta posting is `kind: 'ote'`, and none uses OTE
words. "+ X% bonus target + equity + benefits" (Google, 2,215 salaried), Apple's "discretionary
bonuses or commission payments" boilerplate (2,818) and NVIDIA's "eligible for equity and benefits"
all follow a base range and stay base pay (correct). Excluded by rule: NVIDIA cash compensation (45,
VT-7), Google DeepMind "Total Compensation Range" (1 posting, whose base range is used: correct),
Netflix "range for roles in this area" (4) and union pay floors (5). Netflix's "This reflects total
compensation; we do not have bonuses / stock options" (25 postings) is kept as salary (Netflix pays
salary only). The internship band "based on total compensation (vs. only base salary)" is VT-3.

**Hourly, monthly, fixed-term, part-time.**
- Hourly: Apple 145 (52 part-time, all with `partTime: true`; 1 states weekly hours, so Juice is
  computed for 1), Microsoft 57, Netflix 6, NVIDIA 44 (interns), Anduril 196.
- Monthly: Microsoft 22 (interns and postdocs, ×12).
- Programme length (`termWeeks`): Google 23 (all yearly rates, `originalInterval: 'year'`),
  Microsoft 11 (4 yearly, 7 monthly), NVIDIA 14 (hourly), Netflix 1, Anduril 19.
- None is mis-annualized.

**Currency after the number, non-US currencies.** Formats read correctly:
- NVIDIA "184,000 USD - 287,500 USD" and "375,000 PLN - 650,000 PLN";
- Google "(USD)", "zł280000 (PLN)", "kr1040000 (SEK)", "kr.1000000 (DKK)";
- Microsoft "€ 32,600.00", "kr 622,000.00", "Kč 1,338,000.00", "CAD $106,100 - CAD $169,300";
- Netflix "$70K - $140K CAD", "$32,69- $40,38 an hour" (decimal commas).

Non-USD salaries: Google 417 (EUR 265, CAD 68, PLN 65, SEK 13, DKK 6), Microsoft 320 (EUR 156,
GBP 77, CAD 46, SEK 13, CZK 11, DKK 8, PLN 4, NOK 4, CHF 1), NVIDIA 36 (PLN 26, CAD 8, EUR 2),
Netflix 23 (CAD 22, EUR 1) and Anduril 5 (GBP 2, EUR 2, JPY 1). A bare "$" on a Canada-only posting
is CAD (Netflix 3, Google). Conversion uses palette.js FX_PER_USD (2026-07-01) for bounds and
comparisons only. RON has no rate (VT-2).

**Missed pay and gate false positives, per company:**

| company | postings | missed pay (stated, not shown) | excluded by rule | gate false positives |
|---|---:|---|---|---|
| apple | 4,875 | 0 (0%); 474 US postings have no pay footer at all | 0 | 0 of 2,818 (0%) |
| google | 3,417 | 4 (0.12%, RON) | 0 | 0 of 2,217 (0%) |
| microsoft | 2,279 | 12 (0.53%, RON) | 0 | 0 of 1,490 (0%) |
| netflix | 457 | 0 | 9 (2.0%: 4 area bands, 5 union floors) | 1 of 292 (0.34%, L7, VT-10) |
| nvidia | 2,663 | 0 | 45 (1.7%, cash compensation, VT-7) | 0 of 1,396 (0%) |
| anduril | 2,491 | 0 | 0 | 0 of 2,350 (0%) |

**Board levels against our seniority.** No board sends a level field. Microsoft and NVIDIA name the
level in the pay sentence (IC/M/ATR, "Level N"), and Google and Netflix in the title (Google "III",
Netflix "(L5)", "Engineer 5"). Apple and Anduril give none. "Level not stated" (basis `default`):
Apple 3,625 of 4,875 (74.4%), Google 43.4%, Anduril 41.1%, Netflix 23.9%, Microsoft 19.7%, NVIDIA
16.2%. Where title and board level both exist they disagree in 286 of 998 Microsoft postings and 79
of 741 NVIDIA ones (VT-8).

## 5. Runtime gate (`server/vet.js`)

**On the reviewed set (728 jobs):**
- The gate quarantines 7: 6 are wrong (Netflix L4 and the 5 Anduril typos) and 1 is a false
  positive (Netflix L7, `correct`).
- **False-positive rate: 1 of 701 correct salaries (0.14%), or 1 of 7 quarantines (14%).**
- **False-negative rate: 3 of the 9 wrong salaries are published (33%):** VT-1 (1) and VT-3 (2).
- All three are plausible amounts on the wrong basis or for the wrong country. No bound can see
  them; a `pay_other_country` check would catch VT-1 (FN 2 of 9, 22%), and VT-3 needs the parser
  fix.
- On the 150-job sample: 0 quarantined, 0 wrong.

**Margins on big-tech pay:**

| Check | Bound | Beta's closest value | Headroom |
|---|---|---|---|
| Hourly cap | $250 (any role) / $200 (full time) | $116.83 (Microsoft Senior Director) | about 2x |
| Intern mid (`junior_high`) | $300K | $156K (Netflix) | about 2x |
| Director max (`senior_low`) | $60K floor | $128K | about 2x |
| Range ratio | 4x | 3.55x (NVIDIA interns) | 1.13x |
| Annual max (`above_max`) | $1.2M | $1.195M (Netflix Senior Engineering Manager) | none: Netflix L7 at $1.43M is above it |

The statistical layer quarantines nothing on beta. Netflix's σ is 0.52 around a $427K median, so
there it only fires above about $2.6M. For big tech it is inert, and the hard bounds do the work.

**Threshold study** (`gate-study.mjs`). It runs the gate on a copy with changed constants, over
un-quarantined published lists of all 13 boards (19,173 postings), and scores each quarantine
against the verdicts of this review and 2026-10-02's.

| configuration | quarantined | wrong | false positives | notes |
|---|---:|---:|---:|---|
| **shipped** | 10 | 7 | 3 | Netflix L7; Scale AI 2 ($300/hr, policy). The 1 not in a verdict file is Anthropic 5440475008 "$32,000 — $485,000" (15x typo), read here: wrong |
| **MAX_ANNUAL $1.5M** | 9 | 7 | **2** | publishes Netflix L7; still catches every real error that set the bound ($4.6M, $5M, $1.56M) |
| RATIO_QUARANTINE 3.5x | 28 | 7 | 21 | +18 NVIDIA intern ranges, all correct |
| RATIO_QUARANTINE 3x | 40 | 7 | 32 | as in 2026-10-02: hides stated ranges |
| MAX_HOURLY_USD $350 | 8 | 7 | 1 | the Scale AI policy pair (the lead kept $250) |
| + `pay_other_country` check | 11 | **8** | 3 | catches VT-1 |
| **proposed: $1.5M + `pay_other_country`** | 10 | 8 | 2 | |

**Recommendation:**
- **Raise `VET.MAX_ANNUAL` from $1.2M to $1.5M**: false positives drop from 3 to 2 with no new
  error published. Rename the scan flag `max_over_1_2m`, or note that it follows the bound.
- **Keep RATIO_QUARANTINE at 4x** (3.5x would hide 18 correct NVIDIA intern ranges).
- **Add a `pay_other_country` hard check** (salary.country set and not among the job's countries),
  or better, fix it in the parser (VT-1).
- The other thresholds are fine for big-tech pay.

## 6. CI: does the beta deploy run the gate?

Yes, at three points:
1. **`snapshot.yml`, "Beta salary vetting gate"**, when each board is crawled (`beta-gate.sh
   data/beta-fresh …`): a snapshot with an unquarantined critical salary is moved aside.
2. **`pages.yml`, "Beta salary vetting gate (per company; a failure only drops that company from
   /beta/)"** runs `.github/scripts/beta-gate.sh data/beta/snapshots data/beta/rejected`, which
   calls `node scripts/vet-salaries.js --no-fixtures --no-write-flags <snapshot>` for each company.
   It scans the stored salaries, which equal today's published ones.
3. **`pages.yml`, "Build beta site"**: `build-static.js --beta-only` runs `betaGate()` (the same
   blocking rule) on the published, re-derived and gated lists, and drops a failing company from
   /beta/.

Gaps:
- No beta flags report is kept: the gate runs with `--no-write-flags`.
- The LLM review sees only the stable flags.
- `--skip-reviewed` would miss this folder (VT-9).

Step to add in `pages.yml`, right after "Beta salary vetting gate":

```yaml
      # Beta salary vetting report (advisory, docs/VETTING.md §6): the beta boards' flags (gate
      # applied) and the LLM review of new flags, kept as an artifact. Never blocks the deploy.
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

`--skip-reviewed` needs the VT-9 fix to see this review. The same step and the folder convention
are in `docs/process/patches/vetting-beta-docs.diff`.

## 7. Decisions

1. **Review the published view.** The worktree builds norm-8 salaries from norm-7 snapshots, so
   the review needed what is published, not what is stored. The two are equal in number, currency
   and kind for all 16,182 jobs, and the flags are identical. `flags.jsonl` is the documented
   command's output, and `parsed` in each verdict is that line's salary.
2. **Apple multi-place spans are `correct`.** The salary spans the listings' own ranges (≤ 2.32x),
   with each range in `salary.ranges`, as tier spans are in the rubric. Where the pay is shown is
   VT-4.
3. **One country's line on a multi-country posting is `correct`**: the job's own country, the US
   one when a US location exists. Another country's line on a job with none of its own is
   `parser_bug`, corrected null (VT-1). Anduril's "US Salary Range" on a UAE role keeps its
   2026-10-02 verdict, `correct` (rubric: USD for a non-US office), because no other country is
   named.
4. **RON pay is `parser_bug`** with the posted lei range as corrected: the posting is clear, and we
   show nothing.
5. **The Netflix internship band is `parser_bug`, corrected null**, by the existing area-band and
   base-pay-only rules.
6. **Netflix L7 is `correct`**, a policy quarantine (as Scale AI's $300/hr was on 2026-10-02).

## 8. Open questions

- VT-7: should NVIDIA's sales cash compensation range be `kind: 'ote'` (45 postings)?
- VT-10: raise the gate's annual bound to $1.5M? If so, the Netflix L7 fixture case added by
  `vetting-beta-fixtures.diff` (a policy quarantine) must be rebuilt.
- VT-2: where should a RON rate come from? `data/cities.json` has no Romania.
- VT-8: should Microsoft's IC/M code beat the title in `jobSeniority`?
- Netflix "This reflects total compensation; we do not have stock options" (13 NAS/Ink postings):
  the range may include a bonus. They are kept as salary, because Netflix's general statement is
  salary only.
- Microsoft `1970393556637088` lists two different IC3 ranges ($100,600-$199,000 and
  $102,100-$202,200) plus IC4. They are spanned by rule. The source is inconsistent, but the span
  is still within the posting's own ranges.

## 9. Per company (salaries)

| company | verdict | why |
|---|---|---|
| **Apple** | usable with caveats | Every number matches the posting (233 reviewed, 2,818 checked by machine). 13.3% are shown at, and Juiced for, places Apple posted no pay for (VT-4) |
| **Google** | trustworthy | 0 wrong salaries. Caveats: 4 Romania postings miss pay (VT-2); 12 euro-zone postings show one country's pay at another's places (VT-5) |
| **Microsoft** | usable with caveats | 1 wrong-country salary (VT-1), 12 missed (RON), 22 euro-zone attributions (VT-5), level labels conflict with the board's IC/M level in 29% of stated cases (VT-8) |
| **NVIDIA** | trustworthy | 0 wrong base salaries. Caveats: sales roles' cash compensation (45) not shown (VT-7); 1 Italy range at German and French places (VT-6) |
| **Netflix** | usable with caveats | 2 internship total-compensation bands shown as base hourly pay (VT-3); L7 hidden by policy (VT-10); L4 typo correctly quarantined |
| **Anduril** (main site) | trustworthy | Same as 2026-10-02: 5 source typos quarantined, 0 wrong salaries published |

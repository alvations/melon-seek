# Salary vetting of the beta boards, second pass, 2026-10-11

Reviewer: claude via Claude Code. Log: `docs/process/vetting-beta-2.md`; prompt: `docs/process/prompts/vetting-beta-2.md`. Method: `docs/VETTING.md`. This is the first check of **Amazon and Meta**, and a re-check of Apple, Google, NVIDIA, Microsoft and Netflix after fix wave 4. Anduril (main site) is included for comparison. The first pass is `data/vetting/2026-10-11-beta/`. New findings are numbered from VT-14.

(Written to disk by the lead from the vetting agent's final report, verbatim, because the harness blocks subagents from writing report-style Markdown.)

The data-check-3 agent worked in the same worktree; where it found the same problem, its ID is given in brackets: VT-14 = DQ-35, VT-15 ≈ DQ-33, VT-16 = DQ-6 residue, VT-20 = DQ-42, VT-21 ≈ DQ-36. Places without a country are DQ-40.

## Input

- Today's crawl of all 7 big-tech boards (`data/beta/snapshots/`), observed 2026-10-11 between 15:04 and 16:27 UTC:

| board | postings |
|---|---:|
| Amazon | 5,000 (capped: 5,000 of 22,352, "salaried, then newest") |
| Apple | 4,874 |
| Google | 3,415 |
| NVIDIA | 2,662 |
| Microsoft | 2,285 |
| Meta | 1,139 |
| Netflix | 457 |
| `data/snapshots/anduril.json` (17:27 UTC) | 2,491 |

  **22,323 postings, 16,467 with a published salary.**
- The snapshots were written by norm-8 crawls, and the worktree is norm-9 (git 94cb54c). The build (`scripts/build-static.js#readSnapshot`) re-derives them first, and `../2026-10-11-beta/published-view.mjs` repeats those steps.
- **19 salaries differ** between stored and published, all of them fix-wave-4 changes:
  - 16 lei (RON) ranges are now read (Google 4, Microsoft 12);
  - the Brazil job no longer takes the U.S. line (VT-1);
  - 2 Netflix internship bands are dropped (VT-3).
- Labels added in the published view: `salary.places` (Apple 240), `salary.country` (NVIDIA 25, Google/Microsoft 17).
- **The review input is the published view.** The stored scan's counts are kept in `flags.stored.counts.json`.

## 1. Scan

Seed **2026101102**.

`node scripts/vet-salaries.js <published view>/{amazon,meta,apple,google,nvidia,microsoft,netflix,anduril}.json --date 2026-10-11-beta-2 --sample 25 --seed 2026101102`

**Exit 0**: 0 blocking, 527 of 527 regression fixtures pass. Files: `flags.jsonl` (1,610 lines) and `sample.jsonl` (200 lines). The documented command on the stored snapshots also exits 0 (1,629 flagged), with or without `--no-gate`.

| company | jobs | salaried | quarantined | flagged | critical | blocking | flags |
|---|---:|---:|---:|---:|---:|---:|---|
| amazon | 5,000 | 5,000 | 0 | 1,089 | 0 | 0 | non_year_interval 1,055, interval_corrected 33, structured_text_disagree 19, currency_country_mismatch 1 |
| meta | 1,139 | 903 | 0 | 25 | 0 | 0 | non_year_interval 25 |
| apple | 4,874 | 2,818 | 0 | 145 | 0 | 0 | non_year_interval 145 (structured_text_disagree 63 → 0, DQ-32 fixed) |
| google | 3,415 | 2,221 | 0 | 16 | 0 | 0 | multi_currency 16 (missed_salary 4 → 0) |
| nvidia | 2,662 | 1,395 | 0 | 44 | 0 | 0 | non_year_interval 44, ratio_over_3 21 |
| microsoft | 2,285 | 1,497 | 2 | 82 | 0 | 0 | non_year_interval 79, quarantined 2, missed_salary 1, multiple_ranges 1 |
| netflix | 457 | 288 | 2 | 6 | 1 | 0 | non_year_interval 4, quarantined 2, ratio_over_3 1, max_over_1_2m 1 |
| anduril | 2,491 | 2,345 | 5 | 203 | 3 | 0 | non_year_interval 196, ratio_over_3 5, quarantined 5, min_under_15k_fulltime 3, currency_country_mismatch 2, interval_corrected 1 |
| **total** | **22,323** | **16,467** | **9** | **1,610** | **4** | **0** | |

`--no-gate` on the stored files gives the same table, because the stored snapshots already carry the crawl's quarantines. With every quarantine undone (`flags.ungated.counts.json`), the no-gate scan **exits 1**: Netflix 1 blocking, Anduril 3.

**The gate quarantines 9 salaries:**

| company | quarantined | why |
|---|---:|---|
| Amazon, Meta, Apple, Google, NVIDIA | 0 | |
| Microsoft | 2 | `stat_outlier`: lei IC1 ranges in Romania (VT-16, false positives) |
| Netflix | 2 | `range_ratio`: L4 "$71,040.00 - $464,000.00" (right); `above_max`: L7 "$737,000.00 - $1,430,000.00" (VT-10, policy) |
| Anduril | 5 | the 13x source typos |

## 2. Review

How it was done:
- Every flagged job (1,610) and the seeded sample (25 per company, 200) was read.
- For Amazon, the whole pay section was read. The sentence above the table says whether the figures are a range, a minimum, or include a shift differential.
- Decisions are in `review-rules.mjs` (per id and per pattern; append-only; replay with `--pv <published view>`). Its output is `verdicts.jsonl`.
- Each verdict has a `quote` (an exact substring of the source) and a `quote_source`: `excerpt`, `pay_snippets`, `posting_text`, or `structured_field` (Meta, and Amazon rows that trimming cut from the text).
- A separate pass checked all 1,810 quotes, and every corrected min and max, against the posting text.

| | flagged | sampled | total |
|---|---:|---:|---:|
| reviewed | 1,610 | 200 | **1,810** |
| correct | 1,497 | 200 | 1,697 |
| parser_bug | 68 | 0 | 68 |
| source_ambiguous | 45 | 0 | 45 |

| company | reviewed | correct | parser_bug | source_ambiguous |
|---|---:|---:|---:|---:|
| amazon | 1,114 | 1,009 | 68 (67 minimum floors, VT-17; 1 Mexico, VT-14) | 37 (34 shift-differential pairs, VT-18; 3 Austria, VT-19) |
| meta | 50 | 50 | 0 | 0 |
| apple | 170 | 170 | 0 | 0 |
| google | 41 | 41 | 0 | 0 |
| nvidia | 69 | 69 | 0 | 0 |
| microsoft | 107 | 107 (2 wrongly quarantined, VT-16) | 0 | 0 |
| netflix | 31 | 30 | 0 | 1 (L4, quarantined) |
| anduril | 228 | 221 | 0 | 7 |

**All 200 sampled jobs are correct.** 74 verdicts change what should be shown. The other 39 non-correct ones keep the parsed figure: the 34 shift-differential pairs and 5 label cases.

### Counts before and after review (whole published set)

| company | published now | wrong and published | stated but not shown | after review |
|---|---:|---|---|---:|
| amazon | 5,000 | 112 (111 floors VT-17, 1 Mexico VT-14). Also: 3 shown 14% low (VT-19), 243 including a shift differential (VT-18) | not measurable in the capped snapshot | 4,889 (floors null), or 5,000 with floors labelled as minimums |
| meta | 903 | 0 (1 shown at other countries' places, VT-20) | 0 | 903 |
| apple | 2,818 | 0 | 0 | 2,818 |
| google | 2,221 | 0 | 0 | 2,221 |
| nvidia | 1,395 | 0 | 45 by policy (VT-7) | 1,395, or 1,440 as OTE |
| microsoft | 1,497 | 0 | 2 (VT-16) | 1,499 |
| netflix | 288 | 0 | 1 by policy (VT-10) | 288, or 289 |
| anduril | 2,345 | 0 | 0 | 2,345 |

## 3. Bug classes

### Re-check of the first pass

| ID | Status | Now |
|---|---|---|
| VT-1 | Fixed | 0 salaries for a country the job is not in. The Brazil job has none, which is right |
| VT-2 | Fixed | 16 of 16 lei postings read. 2 are then hidden by the gate (VT-16) |
| VT-3 | Fixed | Netflix 290 → 288 |
| VT-4 | Fixed | 0 Apple salaries or headline Juice at places in states where Apple posts no pay (was 376 / 365) |
| VT-5 | Fixed | 0 Google/Microsoft/NVIDIA postings whose pay places span two countries. New Meta case: VT-20. Netflix 790318298442 is right |
| VT-6 | Fixed | 25 NVIDIA salaries carry `salary.country` |
| VT-7 | Open (decision) | 45 NVIDIA cash-compensation postings, all without salary |
| VT-8 | Open (decision) | Microsoft IC/M track against the title level: 155 of 998 disagree (IC5 → Director+ 29, IC4 → Manager 56) |
| VT-9 | Partly fixed | Works for `-beta`; not for `-beta-2` (VT-25) |
| VT-10 | Open (policy) | Netflix L7 still quarantined |
| VT-11 | Open | No beta flags report and no LLM review in CI |
| VT-12 | Fixed | 0 Microsoft salaries lose their level list |
| VT-13 | Fixed | 0 "&amp;#xa;" left |
| DQ-32 | Fixed | 63 → 0 false flags |

### New findings

| # | Class | Severity | Postings | Company | Example | Owner |
|---|---|---|---:|---|---|---|
| VT-14 | A Mexico-only "$" (pesos) published as US dollars | Critical | 1 (0.02%) | amazon | SF260124856 "Monthly Salary: $12,569" → US$150,828/yr | `server/salary.js` |
| VT-15 | Per-place table: every place shown and Juiced on the primary row | High | 720 (14.4%); 269 headline Juice (5.4%) | amazon | 10535213: Juice at Dallas on New York's $201,000-$272,000 (Dallas row $182,800-$247,300) | `amazon.js#amazonSalary`, `normalize.js#deriveSalary` |
| VT-16 | The statistics quarantine correct Romanian pay | Medium | 2 (0.13%) | microsoft | 1970393557014754 "lei 83,000.00 - lei 107,800.00 per year" | `vet.js#statOutliers` |
| VT-17 | EU/Poland "minimum gross base salary" published as the pay | High | 111 (2.2%; 82% of Amazon's non-North-American pay) | amazon | 10555052 "See below the minimum gross base salary for this position: Bratislava, SVK - 1,675.00 EUR Monthly" | `amazon.js#amazonSalary` |
| VT-18 | Hourly rows include the highest shift differential, shown as base pay | High (label) | 243 (4.9%); 34 also state a lower base | amazon | 10536978 "Pay starts at $18.35 per hour" against 19.95 | `amazon.js`, `app.js` |
| VT-19 | Austrian monthly pay ×12 while the posting states the annual figure (paid 14 times) | High (basis) | 3 | amazon | 10551812 "EUR 47'000 gross annually", shown as 40,300 | `amazon.js` / `toJobSalary` |
| VT-20 | Meta's one-country range shown at other countries' places | High | 1 | meta | 902109179409028: Italy's €89K-114K at Madrid and Paris | `meta.js#mapMetaJob` |
| VT-21 | Amazon "III" read as Mid; "Chief Engineer" or "CEO" in a team name read as Director+ | Medium (level) | 80 + 12 | amazon | "Software Dev Engineer III, Prime Air" ($198K) is Mid | `keywords.js#jobSeniority` |
| VT-22 | Trimmed descriptions lose the published pay row | Low | 292 (5.8%) | amazon | 10566737: the Wink row is cut after 3 rows | `scripts/snapshot.js#trimDescription` |
| VT-23 | "20h per week" not read as weekly hours | Low | 2 | amazon | 10535932, €16.72/hr | `salary.js#statedWeeklyHours` |
| VT-24 | Text density: "Pay by place" line | Low | 132 over 200 characters | amazon | up to 10 entries, 517 characters | `app.js#payPlacesLine`, Amazon labels |
| VT-25 | `llm-vet` misses `<date>-<channel>-2` folders | Low (tooling) | 1,810 verdicts | tooling | `REVIEW_DIR_RE` | `scripts/llm-vet.js` |
| S | Source problems handled correctly | — | 8 | netflix 1, anduril 7 | as in the first pass | — |

### Findings in detail

**VT-14 (Critical).** amazon:SF260124856 "Asociado de Servicio al Cliente Bilingüe Español-Inglés Remoto", https://www.amazon.jobs/en/jobs/SF260124856/asociado-de-servicio-al-cliente-bilingue-espanol-ingles-remoto.
- Source: "Location: Work from home in Mexico ONLY for Yucatán and Puebla Monthly Salary: $12,569". The only place is "Remote, Mexico".
- Expected: MXN 12,569 a month, about US$723 (17.386 MXN per USD).
- Actual: USD 12,569 a month, published as US$150,828 a year, 17 times the real pay, for a customer-service job.
- The gate cannot see it. The scan flags it only as `currency_country_mismatch`, which is not critical.
- Share: 1 of 5,000 Amazon salaries, and the only currency/country mismatch on the 7 beta boards.
- Fix: a bare "$" on a posting whose places are all in Mexico is MXN, as Canada-only postings already get CAD. The same applies to AUD, NZD, SGD and HKD, but not to xAI's bare "$" in Dublin (reviewed as USD). Test: VT-14.

**VT-15 (High).** Amazon prices each place in its table. The salary is the primary location's row, which is right (DATA_SOURCES §7a).
- Fix wave 4 reads per-place ranges from `salary.ranges[].locations`. Amazon's ranges carry only a label, and `deriveSalary` keeps only min, max, currency, interval and label.
- So every place is shown and scored on the primary row: 720 of 5,000 postings list places with different ranges.
- In 269 the headline Juice is computed at a place on another place's range; 247 of those are overstated (median +10%, up to +28%).
- Example: amazon:10535213 "Principal Technical Account Manager, AWS Enterprise Support, NAMER-Sp", https://www.amazon.jobs/en/jobs/10535213. Its Juice is at Dallas on New York's range.
- Fix: in `amazonSalary`, map each row to the job's location strings, as Apple's `mapCopies` does; in `deriveSalary`, keep `locations`. Test: VT-15.

**VT-16 (Medium, missed pay).** microsoft:1970393557014754 "Cloud Solution Architect", https://apply.careers.microsoft.com/careers/job/1970393557014754.
- Source: "Cloud Solution Architecture IC1 - The typical base pay range for this role across Romania is lei 83,000.00 - lei 107,800.00 per year". Same problem for microsoft:1970393556864608 (lei 90,500.00 - 135,700.00).
- Expected: shown. Actual: "Pay unclear", because the low-side statistics compare them with U.S. pay ($20.8K and $24.7K against a $166K median; every comparison group mixes countries).
- Share: 2 of Microsoft's 12 lei salaries. See §5 for the fix. Test: VT-16.

**VT-17 (High).** amazon:10555052 "Tax Analyst in Amazon's Tax Exemption Program, Tax Engine Operations", https://www.amazon.jobs/en/jobs/10555052.
- Source: "The minimum gross base pay salary for this position is listed below. … Amazon reserves the right to offer a higher base salary … See below the minimum gross base salary for this position: Bratislava, SVK - 1,675.00 EUR Monthly".
- Expected: null by the floor rule (VETTING.md §2), or a value labelled as a minimum.
- Actual: a fixed €20,100 a year, labelled "One number, not a range". It also affects senior roles (Senior Tax Analyst 2,350 a month; a Chief Engineer in Milan at €37,000).
- Share: 111 of 5,000 Amazon salaries (2.2%); 67 of them are in the review set.
- Exception: 4 Polish internships also state the figure as the pay ("The base pay for this position is PLN 6000 monthly"); those are correct.
- Owner: `amazonSalary`, which reads the table without the sentence above it. Test: VT-17.

**VT-18 (High, label).** Amazon's hourly tables say "The starting pay for this position is listed below, including the base pay rate plus the highest available shift differential". 243 postings (4.9%) have this.
- 34 also state a lower base. Example: amazon:10536978 "Retail Lead Associate (Full-Time), Customer Experience Operations", https://www.amazon.jobs/en/jobs/10536978: "Pay starts at $18.35 per hour" against the table's 19.95 (+8.7%).
- Washington roles say "up to $32/hour" against a 32-36 table; amazon:10562484 says "up to $33.50 / hour" against 41.25-45.25.
- Verdict: source_ambiguous; the structured figure wins. Expected: a label "includes the highest shift differential". Owners: `amazon.js` and `app.js`.

**VT-19 (High, basis).** amazon:10551812 "Junior Logistik Manager - Linz", https://www.amazon.jobs/en/jobs/10551812; also 10557624 and 10559069.
- Source: "The minimum basic salary for this position is EUR 47'000 gross annually", and the table "Enns, AUT - 3,358.33 EUR Monthly".
- Austria pays salaries 14 times a year: 14 × 3,358 = 47,016.
- Expected: about €47,000 a year. Actual: €40,300 (×12), 14% low. Test: VT-19.

**VT-20 (High).** meta:902109179409028 "Privacy and Data Policy Manager", https://www.metacareers.com/profile/job_details/902109179409028/.
- Meta posts one range for IT: "€89,000/year to €114,000/year".
- `salary.country` is not set, so `payLocations` and Juice also apply it to Madrid and Paris.
- Fix: set the country from the comp's `country_code`, as VT-6 did for NVIDIA. Test: VT-20.

**VT-21 (Medium, level).** Amazon's "III" is its senior rung: SDE III median $197K, against $178K for "Sr." titles.
- 80 "III" titles are Mid, e.g. "Software Dev Engineer III, Prime Air" and "Cloud Hardware Dev Engr III".
- "II" (281 Mid) and "I" (53 Entry) are right.
- Wrongly Director+: "Data Center Chief Engineer" (9 postings, $131K) and "Communications Specialist, CEO & Financial Comms".
- Meta has no levels in its titles: 75% of its postings show "Level not stated". Tests: VT-21.

**VT-22 (Low).** `trimDescription` keeps 4,000 characters plus 4 pay paragraphs.
- In 292 of 5,000 Amazon postings the published row is cut from the stored text (some row is lost in 416). Example: amazon:10566737, https://www.amazon.jobs/en/jobs/10566737.
- No published number changes, because the structured salary is kept. But the drawer text does not contain the shown pay, and 58 Amazon verdicts had to quote the structured row. Test: VT-22.

**VT-23 (Low).** amazon:10535932 and 10535933 "Working Student — Knowledge Management & AI Content Operations", https://www.amazon.jobs/en/jobs/10535932.
- Source: "Student position for 20h per week • Compensation of €16.72 per hour".
- `partTime` is set, but the hours are not read (`WEEKLY_HOURS_RE` needs "hrs" or "hours"), so there is no Juice. Test: VT-23.

**VT-24 (Low, text density).** "Pay by place" lists the raw row labels ("USA, MA, Virtual Location - Massachuset"; Amazon itself truncates the name), one entry per row even when ranges are equal.
- Length: median 102 characters (3 entries), 90th percentile 205 (6), maximum 517 (10 entries, amazon:10543765). 132 postings are over 200 characters; 267 have 5 or more places.
- Expected: places with equal ranges grouped, labelled by city.
- Other dense lines: "Annualized from hourly pay (USA, TN, Nashville - 19.95 - 19.95 USD hourly)" names the place and the number twice; Meta's text "+ bonus + equity (US)" repeats the bonus and equity chips.
- No test: it is a display decision.

**VT-25 (Low, tooling).** `REVIEW_DIR_RE` `/^(\d{4}-\d{2}-\d{2})(?:-([a-z][a-z0-9]*))?$/` does not match `2026-10-11-beta-2`.
- `reviewedFiles()` lists only `2026-10-02` and `2026-10-11-beta`, and `latestFlags('beta')` returns the old folder. Test: VT-25.

**Not filed as VT (data-check lane, DQ-40):** 14 Amazon salaried postings in SVK and AUT have places without a country, and 3 Meta salaried postings have no location.

## 4. Big-tech specifics (whole published set)

**Ranges over several levels.**
- No beta salary spans more than 3x across levels.
- NVIDIA: 867 two-level postings, up to 2.35x. Microsoft: 168, up to 2.53x.
- Amazon (2.0x), Meta (1.8x), Apple, Google and Netflix publish one range per posting.
- The only ranges above 3x are 21 NVIDIA intern rates (3.55x). They are flagged and labelled, not quarantined.

**Several places or countries.**
- Multi-country salaried postings: Google 57, Microsoft 41, NVIDIA 21, Netflix 3, Anduril 5, Meta 1, Amazon 0.
- Pay places span two countries in 2 postings: Netflix (right) and Meta (VT-20).
- Within one country: Amazon's 720 postings (VT-15). Apple is fixed.

**On-target earnings, bonus and equity.**
- No beta salary is OTE.
- Amazon's RSU and sign-on wording (4,280 postings) and Meta's "+ bonus + equity" (876) are named, never added to the numbers.
- 14 Amazon postings use commission or OTE words, none about the range. VT-7 (45) is still excluded.

**Hourly, monthly, fixed-term, part-time.**

| | Amazon | Apple | Microsoft | NVIDIA | Netflix | Anduril | Meta | Google |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| hourly | 978 (243 VT-18) | 145 | 57 | 44 | 4 | 196 | | |
| monthly | 77 | | 22 | | | | 25 | |
| `termWeeks` | 44 | | 11 | 14 | | 19 | 8 | 24 |
| part-time | 32 (26 with hours) | 52 (1 with hours) | | | | | | |

- Amazon's "(40 hours / week, … Salary Range $137488 - $178400)" lines are read as annual (33 postings), which is correct.

**Currencies.**
- Formats read correctly: Amazon "1,800.00 EUR Monthly", "20,508.33 PLN Monthly", "32.93 - 42.16 CAD hourly", "Salary Range - AUD 81,800 - AUD 136,600"; Meta "CA$140,000/year", "PLN214,000/year", "€89,000/year"; plus "lei 83,000.00" and "lei400000 (RON)".
- Non-USD salaries: Amazon 329 (CAD 192, EUR 102, PLN 33, AUD 2), Meta 11, Google 421, Microsoft 329, NVIDIA 36, Netflix 23, Anduril 5.
- Conversion uses `FX_PER_USD` (MXN 17.386, RON 4.58165). One wrong currency: VT-14.

**Missed pay and gate false positives, per company.**

| company | postings | missed pay | excluded by rule | gate false positives |
|---|---:|---|---|---|
| amazon | 5,000 | not measurable (all 5,000 kept postings are salaried) | 111 (VT-17) | 0 |
| meta | 1,139 | 0 (none of the 236 without pay mention it) | 0 | 0 of 903 |
| apple | 4,874 | 0 | 0 | 0 of 2,818 |
| google | 3,415 | 0 | 0 | 0 of 2,221 |
| nvidia | 2,662 | 0 | 45 (1.7%) | 0 of 1,395 |
| microsoft | 2,285 | 2 (0.09%, VT-16) | 0 | 2 of 1,499 (0.13%) |
| netflix | 457 | 0 | 9 + L7 | 1 of 290 (0.34%) |
| anduril | 2,491 | 0 | 0 | 0 of 2,350 |

**Levels.**
- No board sends a level field we keep.
- Amazon's ladder is in the title; "Level not stated" for 2,306 of 5,000 (46%). Meta: 855 of 1,139 (75%).
- VT-21 is new; VT-8 is unchanged.

## 5. Runtime gate

**On the reviewed set:**
- 1,735 right salaries and 74 wrong ones (plus the Brazil job, rightly without a salary).
- 9 quarantines: 6 wrong salaries caught, 3 right ones hidden (Netflix L7, 2 lei ranges).
- **False positives: 3 of 1,735 right salaries (0.17%), or 3 of 9 quarantines (33%).**
- **False negatives: 68 of 74 wrong salaries are published (92%).** Without the 67 floors, which are a basis problem no bound can see, it is **1 of 7 (14%)**: VT-14.
- The 200-job sample: 0 quarantined, 0 wrong.

**Margins.**
- Amazon: highest hourly $85.86, intern mid $156K, lowest director maximum $191K, widest range 2.0x, highest maximum $350K.
- Meta: intern mid $122K, director maximum $144K, widest range 1.8x, highest maximum $527K.
- At least 2x headroom on every hard bound. The statistics fire only on Romania.

**Threshold study** (`gate-study.mjs`, a copy of the gate; un-quarantined published lists of 15 boards, 25,314 postings):

| configuration | quarantined | wrong | false positives | notes |
|---|---:|---:|---:|---|
| shipped | 12 | 6 | 5 | lei 2, Netflix L7, Scale AI 2 (policy). Plus 1 unreviewed: Anthropic 5440475008, a 15x typo |
| MAX_ANNUAL $1.5M | 11 | 6 | 4 | still catches $4.6M, $5M, $1.56M |
| RATIO_QUARANTINE 3.5x | 30 | 6 | 23 | hides 18 correct NVIDIA intern ranges |
| + `cur:<currency>` comparison group | 10 | 6 | 3 | no other change on any board |
| + currency/country hard check on text pay | 17 | 7 | 9 | holds Cohere's USD-for-Germany and xAI's Dublin "$" (both reviewed right): not proposed |
| **$1.5M + currency group** | 9 | 6 | **2** | the 2 left are the Scale AI policy pair |

**Recommendation:**
- Add a `cur:<code>` group to `statOutliers`, used only when it has at least `MIN_GROUP` (8) members.
- Raise `VET.MAX_ANNUAL` to $1.5M.
- Keep the range ratio at 4x and the hourly bounds.
- Fix VT-14 in the parser, not the gate.

## 6. CI

Yes, the gate runs at three points:
1. `snapshot.yml` "Beta salary vetting gate", when each board is crawled.
2. `pages.yml` "Beta salary vetting gate (per company; …)": `beta-gate.sh` runs `vet-salaries.js --no-fixtures --no-write-flags` per snapshot, with a 120 s limit; Amazon takes about 3 s.
3. `build-static.js --beta-only` `betaGate()`, on the re-derived lists.

Gaps:
- VT-11 is still open: there is no flags report and no LLM review. The step to add is unchanged (`docs/VETTING.md` §6), and VT-25 has to be fixed first for `--skip-reviewed` to see this folder.
- Gates 1 and 2 scan stored salaries. Today these differ from the published ones in 19 postings, all of them fixes; gate 3 covers the published lists.
- VT-14, VT-15 and VT-17 are plausible amounts on the wrong basis, which no CI gate can see.

## 7. Decisions

1. Review the published view (norm-9 code on norm-8 snapshots).
2. Amazon's primary-location row is `correct`; where it is shown is VT-15.
3. EU minimums are `parser_bug`, corrected null, by the existing floor rule; postings that also state the figure as the pay are correct.
4. Shift-differential pairs are `source_ambiguous`; the structured figure wins.
5. Austria is `source_ambiguous`, with the figure as posted per month.
6. Meta quotes come from the structured field (`quote_source`).
7. The Microsoft lei quarantines are `correct` (gate false positives).
8. Seed 2026101102: the first pass's seed with a run suffix.

## 8. Open questions

- VT-17: hide the 111 minimums, or show them as "from €X" (a new `kind: 'minimum'`)?
- VT-18: label the top-shift rate, or use the stated base?
- VT-19: apply 14 payments always, or only when the annual figure is stated?
- Adopt the currency group and the $1.5M bound?
- Carried over: VT-7, VT-8, VT-11.
- Amazon's whole-board pay coverage: this crawl's `jobsCapped` has no `salaried` count (MR-14 added it after this crawl).

## 9. Per company

| company | verdict |
|---|---|
| Amazon | **not ready** (VT-14, 15, 17, 18, 19) |
| Meta | trustworthy (caveat VT-20) |
| Apple | trustworthy |
| Google | trustworthy |
| NVIDIA | trustworthy (VT-7 is a decision) |
| Microsoft | usable with caveats (VT-16, VT-8) |
| Netflix | trustworthy (VT-10 is policy) |
| Anduril | trustworthy |

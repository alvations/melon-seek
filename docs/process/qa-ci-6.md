# Process log: qa-ci-6 (test-suite engineer: the first sharded CI run of the e2e suite, 2026-10-24)

## State
- **Done; on the lead's f13ebd6** (rebased 06:30; fix-salary-6, fix-ui-6, fix-juice-6, fix-app-6). Head: see the
  change log. One rebase conflict, BP-10: kept fix-app-6's BN-5 rule (a place picked in between joins what was set
  aside, and Munich still comes back) with this lane's boards chosen by property.
- **The 12 failures and 22 extra skips** are classified with evidence in section 3.1: 8 (a) with tests fixed, 2 (b)
  sent (b-1, b-2: fix-data-6 G-2 and G-3, tests left red), 4 (c) fixed in the harness and the workflow. Three more
  in the touched groups came with f13ebd6: D-41 and V-43 fixed here (a5bdbc9), BP-2 Zurich routed by the lead to
  fix-data-6 as P-4.
- **Step 4:** each shard job gets a verdict step (e2e-summary.mjs on its own log); the summary also fails on a stopped
  run and on a shard over `--max-skips`. CI pins Playwright 1.56.1 (Chromium 141, the local gate's browser).
- **Verification on the rebased head** (section 5): newest 366/374 (the 4 red: b-1, b-2, BP-2 P-4, and D-41, which
  passes on a5bdbc9), 10-16 371/374 with the 3 known skips, npm test 0 fail.
- **Waiting on others:** G-2 and G-3 (fix-data-6) turn fix-pay-data [static beta] and D-32 green; P-4 turns BP-2
  Zurich green. If they do not, the cause is in section 3.1.
- **Next:** nothing in this lane, unless the next CI run on the pin still shows 7, 9 or 12 (then the 2-CPU timing
  is next, section 6).
- **Scratch:** `<scratch>/qci6/`, where `<scratch>` is
  `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`:
  - `ci/shard<n>.job.log`: the CI shard logs; `runs/`: my runs; `tools/`: the probes and the runner wrapper;
  - `wt16/`: the second worktree, with the 2026-10-16 crawl linked from `<scratch>/wt-data2` (read-only use);
    `wt16/dist -> dist-16` (its build). The CI-data builds and snapshots are deleted (disk; rebuild with
    tools/rebuild-ci.sh and tools/build-ci-stable.sh);
  - `clean/`: the CI-like checkout for `npm test`.
  - `tools/e2e-run.sh <checkout> <log> <s> <args>`, `tools/e2e-run-ci.sh`, `tools/rebuild-ci.sh` (reconstruct.js
    `--at` for each CI observation), `tools/pwprobe.mjs` (a page probe), `tools/probe*.mjs` (bundle queries).
  - Heavy jobs go through `<scratch>/heavy.sh` (the lead, 01:00).

## 1. Brief
- Prompt (verbatim): [prompts/qa-ci-6.md](prompts/qa-ci-6.md).
- Goal: GitHub Actions run 40024210372 (e2e.yml on e800c43, data of about 2026-10-23) had 12 unexpected failures and
  25 skips where the local gate on the 2026-10-16 crawl had 1 and 3. Reproduce each, classify it (a: the test pins
  the 10-16 crawl; b: a real bug on new data, to the lead; c: CI-only), fix the tests and the workflow, and make the
  shard jobs fail visibly.
- Files owned: the failing and skipping e2e tests (case selection only), test/e2e/harness.js, scripts/e2e.js,
  .github/workflows/e2e.yml, .github/scripts/e2e-summary.mjs, docs/process/e2e-expected-red.txt, this log and the
  prompt.

## 2. Inputs and sources
- Read: docs/process/qa-suite-beta.md (T-1 to T-20, the shards, `--max-skips`, the expected-red list), e2e.yml,
  e2e-summary.mjs, scripts/cycle/local-data.js, pages.yml, PLAYBOOK.md ("Checkpoints", "Known traps"), TEMPLATE.md,
  scripts/e2e.js and test/e2e/harness.js.
- The CI run: jobs 120656161917 (build), 120658168308/139/266/284 (shards 1-4), 120671702851 (summary).
- Data (observation time, postings). The live site deploys from fresh crawls (pages.yml), so it serves data newer
  than the 2026-10-16 crawl every reviewer used:

  | Board | CI run (its build job's local-data lines) | newest here (`--date 2026-10-23`, archive at 22:13) | 2026-10-16 crawl |
  |---|---|---|---|
  | Amazon | 2026-10-23T17:36 21,721 | 2026-10-23T21:49 21,687 | 10-16T12:03 22,179 |
  | Apple | 17:38 4,944 | 22:07 4,952 | 12:14 4,851 |
  | Google | 17:32 3,672 | 21:48 3,596 | 12:04 3,821 |
  | Meta | 17:53 1,279 | 22:07 1,282 | 12:16 1,208 |
  | Microsoft | 17:37 2,461 | 21:52 2,467 | 12:06 2,435 |
  | Netflix | 17:30 386 | 21:44 387 | 11:58 414 |
  | NVIDIA | 17:38 2,690 | 21:49 2,627 | 12:07 2,711 |
  | Anthropic | 17:54 680 | 22:09 678 | (wt-data2) |
  | Anduril | 17:54 2,502 | 22:09 2,505 | 2,537 |
  | OpenAI, Scale AI, xAI, Cohere, Palantir, Shield AI | 17:54-17:55: 800, 171, 296, 114, 309, 654 | 22:09: 797, 171, 297, 116, 309, 663 | (wt-data2) |

- Environments: the local gate ran Playwright core 1.56.1 driving Chromium 141.0.7390.37 (/opt/pw-browsers
  chromium-1194); CI installs playwright@1.63.0 and its Chromium 153.0.8010.12 (`e2e: chromium 153.0.8010.12
  (playwright default)` in every shard log), on 2-CPU runners with network access.

## 3. Decisions and rationale
### 3.1 The 12 failures and the 22 extra skips
"Newest" = my run on the newest data (runs/new-repro1.log); "CI data" = the original tests on the CI run's exact
data, here (runs/ci-repro1.log); "10-16" = the lead's gate (passed).

| # | Test | Class | Cause and evidence | What I did |
|---|---|---|---|---|
| 1 | UI: loads with no console errors | c | CI's server fetched Anthropic's board live (a runner has network; the sandbox does not), so the API said "live" next to a "Cached" badge. Passes here on the newest and the CI data. The suite was crawling real boards in CI | harness.js: startServer sets MELON_OFFLINE=1 unless the environment sets it (WIP, to run) |
| 2 | Badge: [static] the swap keeps the user in place | a | The test clicks the 3rd Clusters bubble and focuses the 3rd card. On both 10-23 Anthropic lists that bubble holds 1 role ("1 role, midpoint $235K"; probe: 1 card after the click). The original test fails on the CI data at load 3.8 too (runs/ci-badge-orig.log, 32 s), so it is the data, not timing; it passed on the newest list only through what the live swap did to the selection | test: the bubble with the most roles, and its first card from the 3rd on that the simulated live board keeps. 10/10 Badge tests and the UI test pass on the CI data (runs/ci-badge.log) |
| 3 | fix-pay-data [static beta] | b | microsoft:1970393557021098 lists HR, RS, SI, AL; "AL" (Albania) is filed as Alabama, US. server/geo.js: a bare code is a country only when the gazetteer has the country; Albania is missing, and the fallback skips codes that are US states | b-1 sent; fix-data-6 G-2. Test left red (lead) |
| 4 | fix3-data [static beta] | a | apple:200691069-3956 "Creative Director, Head of Emerging Experiences" ($267,800-$401,700) is Director+ by "Head of" (keywords.js EXEC_WORD_RE), not by the BP-11 phrase; its pay sits at Apple's Director median ($404K), not its IC creative directors' ($222K). The newest data adds amazon:10507605 (CAD pay, "CAD" skill): its description is trimmed to 800 characters by snapshot.js, so the stored text cannot show where the crawl read "CAD"; the current extractor on the stored text gives no "CAD" | test: BP-11 counts only titles with no other executive word; a trimmed description is judged by re-running the extractor on what is stored (WIP) |
| 5 | Beta desktop QA 2 [D-32] | b | apple:200678227-2709 "CA-Technical Specialist" at "Bayshore Shopping Centre, Canada" (Apple Bayshore, Ottawa), new since 10-16; not an alias in geo.js, so a place of its own at Canada's centre | b-2 sent; fix-data-6 G-3. Test left red (lead) |
| 6 | Fix touch tips: Surface Duo spanned 1114x720 | a | The test taps the 7th strip bar. On Google's 10-23 list it holds 5 postings and is 2 px tall; a CDP touch at its middle lands on `.ms-chart__axis` (probe: pointerdown on the axis; bars of 7 px and 5 px get their tip). Fails on the newest and the CI data | fix-touch-tips: the strip checks tap the tallest bars first (all five uses of the 7th bar) (WIP) |
| 7 | Fix touch tips: razr inner landscape 1005x412 | c | Passes here on the newest and the CI data; failed only in CI. Same symptom as 6, so the short-bar choice is the likely trigger with CI's Chromium | covered by 6's change and the Playwright pin; re-check in CI |
| 8 | fix-data-3 [D-41] | a | The newest Google data has one St. George (SC, "Saint George, SC", 1 posting); D-16 (app.js disambiguateLocations) adds a state only when two places share the name, so "St. George" is right. 10-16 had SC (both spellings) and UT | test: the state check applies when the board names two towns; the SC check takes the one label (WIP) |
| 9 | Fix phone text [guard, size] amazon 280x653 | c | Passes here on the newest and the CI data (the same "Non-Technical Project, Program and Product Management" department is in all three crawls): the CI-only difference is the browser (fitCheckLabels measures the text) | e2e.yml: Playwright 1.56.1, the local gate's Chromium 141 |
| 10 | fix-pay-at-place [MR-34] | a | Pins microsoft:1970393556619327, gone from the 10-23 crawls (in 10-16: "USD $119,800 - $234,700 per year", 2 zones). Fails on both | test: picks Microsoft postings with zones > 1 whose pay line states one range, opens up to 5 (WIP) |
| 11 | fix-viz-5 [UX-59] | a | Google's 10-23 list has five $550K postings (a Distinguished Engineer, a Fellow, three VPs) in three rows, plus a $364K-$505K one; the axis ends at $500K (P99 of range tops $432K, padded and snapped). 4 rows, 2 posted ranges. 10-16: two $550K postings in one row | test: counts posted ranges among the first 10 rows past the axis, not rows (WIP) |
| 12 | fix-viz-5 [cuts] map Pay scale at 390 and 540 | c | Passes here on the newest and on the CI data (50 s): the CI-only difference is the browser, as 9 | e2e.yml: Playwright 1.56.1, as 9 |
| S1 | fix-qa4 [D-50] × 21 sizes | a | Pins netflix:790298021069 ($71,040-$464,000, "Pay unclear"), gone; on the 10-23 crawls no beta board has a "Pay unclear" posting with stated pay (Anduril has 4, Anthropic 1, on the main site) | test: picks a "Pay unclear" posting whose estimate is capped at its stated maximum, beta boards first, then the main site; skips with a reason if none (WIP) |
| S2 | Fix3 app [BP-10] set aside | a | Microsoft lists 1 Munich posting on 10-23 (0 on 10-16) | test: picks the boards by property (Munich at the first and last, not the middle) (WIP) |
| S3-S5 | D-11, Methodology screenshots, P-2 | known | the local gate's 3 skips (qa-suite-beta T-19) | none (P-2 and D-11 are T-19's open items) |

After the rebase onto f13ebd6 (fix-salary-6, fix-ui-6, fix-juice-6, fix-app-6), three more in the touched groups:

| Test | Class | Cause | What I did |
|---|---|---|---|
| fix-data-3 [D-41] | interaction | fix-app-6 BN-1: a place shows its own count with its state-wide roles beside it ("1 +11"), and a pick lists both; the test compared the list with the own count | the options helper reads `.check-wide`; the pick must list count + wide (a5bdbc9) |
| fix-viz-5 [V-43] (new skip) | interaction | fix-salary-6: pins outside the US are priced in their own currency ("median A$106K from 4 with pay for here"); the test's `\$`-only label match found no low-share pin and skipped | the match takes any currency (a5bdbc9). The case exists: Sydney "A$106K 4 of 404", London "€36K 31 of 2.9K" |
| Fix3 app [BP-2] Zurich "Pay posted for … only" | not this lane's | fix-salary-6's rows per country give google:108135834237969094 a German and a US row; payPlaceText names the priced places ("San Jose, Munich and 2 more"), and features/shared.js payLocations, the test's reference, still gives only the US places | reported to the lead: payLocations or the test, a product decision |

### 3.2 Step 4: the shard jobs
- In run 40024210372 every shard job was green: the runner step had `continue-on-error: true`, and only the summary
  job read the logs. Shard 4's runner also exited 1 for 21 skips over `--max-skips=20`, and nothing failed on it:
  the summary did not read the skip limit.
- Change (WIP): the runner step records its exit code and never fails; a new "Shard verdict" step runs
  e2e-summary.mjs on the shard's own log, with the same rules as the summary job. A known red-by-design failure
  keeps the shard green; an unexpected one turns that shard red. e2e-summary.mjs now also fails on a log that says
  "e2e: stopped by <signal>", and on "more than --max-skips"; its error excerpt keeps the first 4 lines.

### 3.3 Decisions
1. **Reproduce on three data sets, not two.** The brief's newest data (`--date 2026-10-23`) is the archive at 22:13,
   four hours after the CI run's (17:30-17:55). A failure that does not reproduce on the newest data can still be
   a data case on the CI's. reconstruct.js `--at <the CI build log's observedAt>` rebuilt the CI's exact snapshots,
   which split the failures cleanly: what passes here on the CI data is CI-only (1, 7, 9, 12); what fails here on
   it is data (2, and the rest).
2. **A case by its property, never a weaker check.** Each (a) fix keeps the assertion and changes only how the case
   is chosen (the largest cluster, the tallest strip bar, a Microsoft posting with several ranges and one stated,
   a capped "Pay unclear" posting, boards with and without Munich), or counts in the unit the rule is about (posted
   ranges for UX-59, towns for D-41). Two follow the code's documented rules rather than a pinned shape: D-16
   (a state only when two places share the name) and BP-11 (the IC director phrase alone; "Head of" is
   Director+ in keywords.js).
3. **fix3-data's trimmed-description case** (Amazon's descriptions are cut at 800 characters by snapshot.js): the old
   check read the cut text and called a "CAD" skill the currency's. Re-running the extractor (server/keywords.js) on
   the stored title, sections and text keeps the BP-5 question (does the currency text give the skill?) answerable.
4. **The (b) tests stay red** with no expected-red entry (the lead, 2026-10-24): fix-pay-data [static beta] (G-2) and
   D-32 (G-3). Their names hold no ID the summary could match (`[static beta]`), so an entry could not cover them anyway.
5. **CI's browser is pinned to the local gate's** (Playwright 1.56.1, Chromium 141): three layout and touch checks
   pass on the same code and data with 141 and failed with 153. Moving the browser is its own change, with a run of
   the phone and layout groups on it. The alternative (loosen the checks for 153) would test a browser no reviewer
   has looked at.
6. **The e2e server is offline by default** (MELON_OFFLINE=1 in harness.js, overridable): the suite must not crawl
   real boards from CI, and the sandbox never could, so offline is what the local gate always tested.
7. **Shard verdicts** rather than the summary alone: a red shard names where to look, and the same script with the
   same rules keeps the two in step. The summary job stays: it is the one place with all four shards, and it is still
   red when a shard job dies before its verdict.

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad; Q=$S/qci6; W=<this worktree>
cd $W && ln -s /home/user/melon-seek/node_modules node_modules
node scripts/cycle/local-data.js --date 2026-10-23                 # 1 min; the dates in section 2
bash $S/heavy.sh node scripts/build-static.js                       # 3 min at load 7-13
# the 2026-10-16 crawl in a second worktree, linked read-only:
git worktree add --detach $Q/wt16 HEAD && cd $Q/wt16 && ln -s /home/user/melon-seek/node_modules node_modules
ln -s $S/wt-data2/data/snapshots data/snapshots && mkdir -p data/beta && ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
bash $S/heavy.sh node scripts/build-static.js --out dist-16 && ln -s dist-16 dist
# the CI run's exact data: the archive in a worktree, reconstruct.js --at, then remove the archive
git worktree add --detach $Q/archive refs/remotes/origin/data-archive
bash $Q/tools/rebuild-ci.sh $W $Q/archive $Q/data-ci && git worktree remove --force $Q/archive
bash $Q/tools/build-ci-stable.sh                                    # main site only, 36 s (for the Badge check)
# a group: e2e-run.sh <checkout> <log> <timeout s> <e2e.js args>; e2e-run-ci.sh <log> <s> <args> for the CI data
bash $S/heavy.sh bash $Q/tools/e2e-run.sh $W $Q/runs/<name>.log 5400 '--grep=^(fix3-data|...):'
# the CI logs: GitHub job logs of run 40024210372 (mcp get_job_logs), converted by tools/joblogs.py
bash $Q/tools/test-summary.sh $W --expected $W/docs/process/e2e-expected-red.txt $Q/ci/shard*.job.log
# npm test, CI-like
cd $Q/clean && bash $S/heavy.sh env MELON_BETA_SNAPSHOT_DIR= timeout 1500 npm test
```

## 5. Verification
| Run | Tree, data | Load | Result |
|---|---|---|---|
| runs/new-repro1.log | 5e20d9e (= e800c43's code), newest | 9 | the 36 failing and skipping tests: 7 pass, 5 fail (D-32, Duo strip, D-41, MR-34, UX-59), 24 skip; UI, Badge swap, razr landscape, 280 guard and [cuts] pass |
| runs/ci-repro1.log | 5e20d9e, the CI run's exact data | 8-24 | 17 tests: 8 fail (Badge swap, fix-pay-data, fix3-data, D-32, Duo strip, D-41, MR-34, UX-59), 3 skip; UI, razr landscape, 280 guard and [cuts] pass |
| runs/ci-badge-orig.log | 5e20d9e's badge test, CI data | 3.8 | the swap test fails (32 s): data, not load |
| runs/ci-badge.log | 78a6117, CI data | 4.6 | Badge 9/9 and UI's first test pass |
| runs/new-touched.log | 78a6117, newest | 6-9 | the 8 groups whose tests changed (fix3-data, fix-data-3, fix-pay-at-place, fix-viz-5, Fix touch tips, fix-qa4, Fix3 app, Badge): **192/192 pass, 0 skipped**, 29 min |
| runs/npm-test-1.log | 78a6117, clean checkout, no data | 6-9 | 1,308 tests: 1,298 pass, **0 fail**, 10 skipped; 95 s |
| e2e-summary on the 4 CI logs | 2c5eecd's script | - | 953 tests, 916 passed, 12 failed, 25 skipped; exit 1; shard 4 over --max-skips; the error excerpt carries the problems under "2 problem(s):" |
| runs/w16-touched.log | 8d6dcc3, 2026-10-16 crawl | 5-6 | the changed groups and every server-mode group (harness.js): **361/364 pass, 0 fail, 3 skipped** (D-11, screenshots, P-2), 42 min. The new selections pick the old cases on the old crawl: MR-34 microsoft:1970393556619327 (of 918 candidates), D-50 netflix:790298021069 (of 6) |
| (after the rebase onto f13ebd6: product code changed, so both builds and the runs are repeated) | | | |
| builds | b9baf8d | 2-5 | newest 260 s, 10-16 361 s, 7/7 beta boards each |
| runs/npm-test-2.log | b9baf8d, clean checkout | 3-5 | 1,359 tests: 1,349 pass, **0 fail**, 10 skipped; 100 s |
| runs/r-new.log | b9baf8d, newest | 4-8 | 374 tests (touched groups, server-mode groups, Beta desktop QA 2), 38 min: 366 pass, 4 fail, 4 skip. The cases picked: D-50 anduril:5078772007 (main site, "Pay unclear", states up to $167,000; no beta board has one), MR-34 microsoft:1970393556627708 (of 960). fix-pay-data and D-32 are b-1 and b-2 (G-2 and G-3 not landed yet). D-41 broke on BN-1 (own count + state-wide) and V-43 newly skipped on fix-salary-6's local-currency pins: both fixed in a5bdbc9. Fix3 app [BP-2] Zurich broke on fix-salary-6's rows per country (not this lane's: reported) |
| runs/r-16.log | a5bdbc9, 2026-10-16 crawl | 4-8 | the same 374 tests: **371/374 pass, 0 fail, 3 skipped** (D-11, screenshots, P-2), 50 min (it overlapped r-new.log's last minutes). BP-2 Zurich, D-32 and fix-pay-data pass on this crawl (none of their postings exists in it). The cases picked: MR-34 microsoft:1970393556619327 (of 890), D-50 netflix:790298021069 (of 6), the old tests' own |
| runs/r-new2.log | a5bdbc9, newest | 6.5 | D-41 and V-43: 2/2 pass |

Timings taken at a load over 8 are noise (the lead, 01:00).

## 6. Known gaps and follow-ups
- No Chromium 153 here (never `playwright install`), so the CI-only failures 7, 9 and 12 are attributed to the
  browser by elimination: the same code and the same data pass with Chromium 141. The next CI run on the pin is the
  test of that. If one still fails there, the 2-CPU runner's timing is next (the guard measures after fixed waits).
- Moving CI to a newer Chromium needs its own pass over the phone and layout groups (Fix phone text, fix-viz-5
  [cuts], Fix touch tips), with the sandbox's browser moved too, so CI and the local gate stay one browser.
- The (b) tests stay red until fix-data-6's G-2 and G-3 land: fix-pay-data [static beta] and Beta desktop QA 2
  [D-32]; and Fix3 app [BP-2] Zurich until P-4 (payLocations follows the rows per country, the lead's decision).
  CI's e2e summary is red until then.
- Seen while probing, not in any failing test: a 2-px strip bar cannot be tapped (a touch at its middle lands on
  `.ms-chart__axis`). A bar of 5 postings on Google is that short; a hit area taller than the bar would fix it
  (layout lane, if wanted).
- D-11 and P-2 still skip on every run (qa-suite-beta T-19).

## 7. Change log
- 00:30 Resumed after the container restart (no local-data run had started, so nothing to clean up).
- 00:31 Data restored; builds of both data sets (2 min 53 s and 3 min 52 s at load 7-13).
- 00:37 b-1 confirmed and sent.
- 00:4x-01:00 The CI run's exact data rebuilt from the archive (reconstruct.js --at), built, and the original tests run
  on it; b-2 sent; test fixes written; step 4 written and run on the CI logs.
- 01:05 Paused by the lead (usage limit); log State and the table so far (5f24b37).
- 01:39 Resumed. Badge swap settled as (a) at low load (the original fails on the CI data at load 3.8); its fix and the
  Playwright pin (78a6117). Newest 192/192, npm test 0 fail; 10-16 361/364 (8d6dcc3).
- 02:45 Stopped by the usage limit; the container restarted at 04:33.
- 06:30 Resumed; rebased onto f13ebd6 (one conflict, BP-10 with BN-5). Both builds redone; npm test 0 fail.
- 07:05 Three new reds in the touched groups on f13ebd6: D-41 (BN-1) and V-43 (local-currency pins) fixed (a5bdbc9);
  BP-2 Zurich reported, routed to fix-data-6 as P-4.
- 08:13 10-16 371/374 (3 known skips); newest: D-41 and V-43 pass.

# WIP checkpoint: fix-mr-3

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a2e3d85e328fdbc3e`
- Base (on claude/stoic-ride-54ddxp): `889856638f73689512dcf7845d71de2eaaa62cb0`
- Head: `905ef0022a9613d8824fd36d29e5749a3cba8321`
- Restore: `bash scripts/cycle/restore-wip.sh fix-mr-3 <new worktree dir>`

## Commits since the base
```
905ef00 fix-mr-3: T-20 the to-dos that already passed are plain tests (beta-methodology MR-4 to MR-20, beta-methodology-2 MR-23 and MR-34, beta-data-check-3 DQ-6)
8877c10 fix-mr-3: MR-39 the Ranges view's label column fits the strip's caption with its basis ("Median base pay $239K US" was cut by 0.05 px at 1280)
c41e9c1 fix-mr-3: MR-39 e2e counts base pay as the integrated build does (MR-28's notBasePay out), and the numbers on it ($149K → $152K US)
d196dd5 fix-mr-3: MR-39 the chart caption's median on the same basis ("Median base pay $149K US"), applied in chart.js (was the patch for fix-viz-5)
01913d5 fix-mr-3: log State: done, sent to the lead; next: rebase when told
60078f6 fix-mr-3: MR-39 the stats line says its median's country short ("base pay median (US)"), within fix-density's 12 words when filtered
eb27a65 fix-mr-3: the BP-13 e2e takes the stats line's median on the MR-39 rule (the main currency's, with pay in several)
c7788c6 fix-mr-3: log: T-17, npm test, before/after e2e, phone lines
8d02948 fix-mr-3: T-17 job titles on one line (line breaks and runs of whitespace are one space), in the norm-13 bump
1c0ebd6 fix-mr-3: the Juice headline's "while it lasts" moves to the text below when it would wrap (one line from 344 px up)
ff8e407 fix-mr-3: review logs mark MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41 fixed; process log
047c5be fix-mr-3: e2e on the built site (every ID, and every phone size), docs, and the chart caption patch for fix-viz-5
6f40364 fix-mr-3: refresh fixtures regenerated at norm-13 (make-fixtures.mjs)
7c6f0d8 fix-mr-3: MR-38/MR-33 fixed-term pay of unstated length, MR-37 stated annual figure, MR-29 departments note, MR-39 headline median basis
c3ad5cd fix-mr-3: MR-40 43 NYC-area towns in the gazetteer, so the NYC pay area sees them; norm-13
63caf68 fix-mr-3: MR-41 the Mid chip's tip gives each board's own example of a mid level
b9b835a fix-mr-3: MR-26 build-day data is never "update due"
6418891 fix-mr-3: MR-21 registry.js usage lists --docs; MR-22 market.json fx.source is FX_SOURCE
9bf2303 fix-mr-3: red tests for MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41
a7c757f fix-mr-3: log skeleton with State
056b16b fix-mr-3: brief, verbatim
433aa59 fix-phone-sizes: log, mobile QA 4 State, decision 14 and results (matrix, smoke 147/147, job-page tests, phone-text 104/104, npm test 1185/0 in a clean checkout)
281e71e fix-phone-sizes: the matrix waits for the filter sheet's slide to end before measuring it (it started after the fixed 450 ms on a busy machine: 932 and 1005 px failed 2 runs of 3)
03ff282 fix-qa4: log State after UX-51, MR-35 and UX-50 (gated, sent to the lead)
10f57e1 fix-qa4: UX-51 and UX-50 screenshots before and after (shrunk); the phone shot opens the sheet first; log the e2e results
4d917a8 WIP fix-qa4: log the UX-51, MR-35 and UX-50 numbers and State
1185fda fix-qa4: salary-audit's lifted card helpers include UX-51's shift pay (payPill asks shiftRange of every posting)
52ae20d fix-qa4: MR-35 marked fixed (6185ba3) in the methodology review; log
f2f701f fix-qa4: UX-51 shift pay labelled on the card, its tip, the drawer heading and the CSV; MR-35 the base keeps its cents; UX-50 the company beside its dot
```

## Uncommitted and new files
```
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png
 M docs/screenshots/fix-pay-at-place/e2e-card-280x653.png
 M docs/screenshots/fix-pay-at-place/e2e-card-352x355.png
 M docs/screenshots/fix-pay-at-place/e2e-card-375x812.png
?? docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)

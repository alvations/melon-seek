# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `9979e589405ecffff9c454108b63b2e96a392ad7`
- Head: `fc8980e94f932e471e17cfbb6603b0040540f451`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
fc8980e fix-viz-5 [MR-28] e2e: the reference median is the main currency's (MR-39, fix-mr-3), as the caption and the stats line now are
72cfbf6 iOS Simulator probe: each message names its page, only the visible tab acts, the driver waits for its own page
d0e6095 fix-mr-3: T-20 the to-dos that already passed are plain tests (beta-methodology MR-4 to MR-20, beta-methodology-2 MR-23 and MR-34, beta-data-check-3 DQ-6)
5027260 fix-mr-3: MR-39 the Ranges view's label column fits the strip's caption with its basis ("Median base pay $239K US" was cut by 0.05 px at 1280)
e91cba2 fix-mr-3: MR-39 e2e counts base pay as the integrated build does (MR-28's notBasePay out), and the numbers on it ($149K → $152K US)
03e4491 fix-mr-3: MR-39 the chart caption's median on the same basis ("Median base pay $149K US"), applied in chart.js (was the patch for fix-viz-5)
4d05ecf fix-mr-3: log State: done, sent to the lead; next: rebase when told
867085e fix-mr-3: MR-39 the stats line says its median's country short ("base pay median (US)"), within fix-density's 12 words when filtered
bf46e1f fix-mr-3: the BP-13 e2e takes the stats line's median on the MR-39 rule (the main currency's, with pay in several)
a132dcc fix-mr-3: log: T-17, npm test, before/after e2e, phone lines
b563440 fix-mr-3: T-17 job titles on one line (line breaks and runs of whitespace are one space), in the norm-13 bump
7336e13 fix-mr-3: the Juice headline's "while it lasts" moves to the text below when it would wrap (one line from 344 px up)
29dec35 fix-mr-3: review logs mark MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41 fixed; process log
3e37809 fix-mr-3: e2e on the built site (every ID, and every phone size), docs, and the chart caption patch for fix-viz-5
428e5d4 fix-mr-3: refresh fixtures regenerated at norm-13 (make-fixtures.mjs)
337dfcc fix-mr-3: MR-38/MR-33 fixed-term pay of unstated length, MR-37 stated annual figure, MR-29 departments note, MR-39 headline median basis
b650562 fix-mr-3: MR-40 43 NYC-area towns in the gazetteer, so the NYC pay area sees them; norm-13
124f84f fix-mr-3: MR-41 the Mid chip's tip gives each board's own example of a mid level
d67136b fix-mr-3: MR-26 build-day data is never "update due"
8c2a42a fix-mr-3: MR-21 registry.js usage lists --docs; MR-22 market.json fx.source is FX_SOURCE
73e2922 fix-mr-3: red tests for MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41
db0f593 fix-mr-3: log skeleton with State
bb21d8a fix-mr-3: brief, verbatim
9676fbe e2e harness: bound each cleanup step (30 s, E2E_CLEANUP_TIMEOUT), so a hung context.close() can't stall a run
da73008 qa-suite-beta: log final: State, T-18/T-19/T-20, E1 is the lead's batch-3 gate, E4 and U4 results, the patch apply order
853cd5b Integration: qa-suite-beta's patches (runner stops cleanly on signals, --shard; T-1 board list; T-4 links; T-11 state waits; T-19 skips; CPU-time flake fixes; the sharded E2E workflow)
ac1ba07 qa-suite-beta: on 433aa59 (batch 3): this lane's files from c4f7909, the patches regenerated, the expected-red list
21bb1a5 fix-phone-sizes: log, mobile QA 4 State, decision 14 and results (matrix, smoke 147/147, job-page tests, phone-text 104/104, npm test 1185/0 in a clean checkout)
5351f9d fix-phone-sizes: the matrix waits for the filter sheet's slide to end before measuring it (it started after the fixed 450 ms on a busy machine: 932 and 1005 px failed 2 runs of 3)
2fbf5db fix-qa4: log State after UX-51, MR-35 and UX-50 (gated, sent to the lead)
c1c2e2b fix-qa4: UX-51 and UX-50 screenshots before and after (shrunk); the phone shot opens the sheet first; log the e2e results
2eef514 WIP fix-qa4: log the UX-51, MR-35 and UX-50 numbers and State
9aa9bb4 fix-qa4: salary-audit's lifted card helpers include UX-51's shift pay (payPill asks shiftRange of every posting)
768f857 fix-qa4: MR-35 marked fixed (6185ba3) in the methodology review; log
42fcdd1 fix-qa4: UX-51 shift pay labelled on the card, its tip, the drawer heading and the CSV; MR-35 the base keeps its cents; UX-50 the company beside its dot
```

## Uncommitted and new files
```
?? docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)

# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `9979e589405ecffff9c454108b63b2e96a392ad7`
- Head: `da73008b6e41f5071697eba0200289361d17b4c3`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
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

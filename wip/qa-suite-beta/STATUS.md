# WIP checkpoint: qa-suite-beta

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-aa166069d49bf488a`
- Base (on claude/stoic-ride-54ddxp): `889856638f73689512dcf7845d71de2eaaa62cb0`
- Head: `444101a296135a012dd0d1c79c9e72f9aeceb517`
- Restore: `bash scripts/cycle/restore-wip.sh qa-suite-beta <new worktree dir>`

## Commits since the base
```
444101a qa-suite-beta: log final: State, T-18/T-19/T-20, E1 is the lead's batch-3 gate, E4 and U4 results, the patch apply order
a9342a3 qa-suite-beta: on 433aa59 (batch 3): this lane's files from c4f7909, the patches regenerated, the expected-red list
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
?? dist
```

## Left out (not in untracked.tgz)
- dist (symlink)
- node_modules (symlink)

# WIP checkpoint: qa-suite-beta

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-aa166069d49bf488a`
- Base (on claude/stoic-ride-54ddxp): `889856638f73689512dcf7845d71de2eaaa62cb0`
- Head: `433aa59e8b21028255d3956f7c74c30ae3a74af1`
- Restore: `bash scripts/cycle/restore-wip.sh qa-suite-beta <new worktree dir>`

## Commits since the base
```
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
A  docs/process/patches/qa-suite-beta-ci-e2e.diff
A  docs/process/patches/qa-suite-beta-e2e-runner.diff
A  docs/process/patches/qa-suite-beta-flake-perf1-v15-cpu.diff
A  docs/process/patches/qa-suite-beta-flake-polite-clock.diff
A  docs/process/patches/qa-suite-beta-flake-s3-cpu.diff
A  docs/process/patches/qa-suite-beta-flake-s6-cpu.diff
A  docs/process/patches/qa-suite-beta-flake-t21-cpu.diff
A  docs/process/patches/qa-suite-beta-flake-ui-map-order.diff
A  docs/process/patches/qa-suite-beta-t1-board-list.diff
A  docs/process/patches/qa-suite-beta-t11-state-waits.diff
A  docs/process/patches/qa-suite-beta-t4-link-check.diff
A  docs/process/prompts/qa-suite-beta.md
A  docs/process/qa-suite-beta.md
A  test/beta-coverage.test.js
A  test/e2e/beta-coverage.e2e.js
?? dist
?? docs/process/patches/qa-suite-beta-t19-v18-fold.diff
```

## Left out (not in untracked.tgz)
- dist (symlink)
- node_modules (symlink)

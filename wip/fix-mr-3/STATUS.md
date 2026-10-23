# WIP checkpoint: fix-mr-3

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a2e3d85e328fdbc3e`
- Base (on claude/stoic-ride-54ddxp): `05263e8c010758f51cca4bcbcfb2871eac1defd3`
- Head: `ebc00e0ea27762ad147d16b50e4f333b60355fb2`
- Restore: `bash scripts/cycle/restore-wip.sh fix-mr-3 <new worktree dir>`

## Commits since the base
```
ebc00e0 fix-mr-3: MR-39 the stats line says its median's country short ("base pay median (US)"), within fix-density's 12 words when filtered
3a109a0 fix-mr-3: the BP-13 e2e takes the stats line's median on the MR-39 rule (the main currency's, with pay in several)
23f8f21 fix-mr-3: log: T-17, npm test, before/after e2e, phone lines
ee08a5a fix-mr-3: T-17 job titles on one line (line breaks and runs of whitespace are one space), in the norm-13 bump
2f51186 fix-mr-3: the Juice headline's "while it lasts" moves to the text below when it would wrap (one line from 344 px up)
89c88b1 fix-mr-3: review logs mark MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41 fixed; process log
9054eae fix-mr-3: e2e on the built site (every ID, and every phone size), docs, and the chart caption patch for fix-viz-5
e598d8a fix-mr-3: refresh fixtures regenerated at norm-13 (make-fixtures.mjs)
99d5640 fix-mr-3: MR-38/MR-33 fixed-term pay of unstated length, MR-37 stated annual figure, MR-29 departments note, MR-39 headline median basis
ff2b272 fix-mr-3: MR-40 43 NYC-area towns in the gazetteer, so the NYC pay area sees them; norm-13
c59177f fix-mr-3: MR-41 the Mid chip's tip gives each board's own example of a mid level
055fa0f fix-mr-3: MR-26 build-day data is never "update due"
62899e8 fix-mr-3: MR-21 registry.js usage lists --docs; MR-22 market.json fx.source is FX_SOURCE
7297ce7 fix-mr-3: red tests for MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41
7bded6c fix-mr-3: log skeleton with State
d8818ca fix-mr-3: brief, verbatim
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
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

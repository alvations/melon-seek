# WIP checkpoint: fix-mr-3

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a2e3d85e328fdbc3e`
- Base (on claude/stoic-ride-54ddxp): `05263e8c010758f51cca4bcbcfb2871eac1defd3`
- Head: `c59177f1f96facaa7b77bc0221b3a046236b09e9`
- Restore: `bash scripts/cycle/restore-wip.sh fix-mr-3 <new worktree dir>`

## Commits since the base
```
c59177f fix-mr-3: MR-41 the Mid chip's tip gives each board's own example of a mid level
055fa0f fix-mr-3: MR-26 build-day data is never "update due"
62899e8 fix-mr-3: MR-21 registry.js usage lists --docs; MR-22 market.json fx.source is FX_SOURCE
7297ce7 fix-mr-3: red tests for MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41
7bded6c fix-mr-3: log skeleton with State
d8818ca fix-mr-3: brief, verbatim
```

## Uncommitted and new files
```
 M data/freshness.json
 M docs/DATA_FRESHNESS.md
 M public/features/shared.js
 M server/geo.js
 M server/normalize.js
 M test/fix-beta-pay.test.js
 M test/fix-pay-data.test.js
 M test/fixtures/golden-normalize.json
 M test/golden-normalize.test.js
 M test/salary-pipeline.test.js
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

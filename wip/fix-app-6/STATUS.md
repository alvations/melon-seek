# WIP checkpoint: fix-app-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af65001c61c5e8b4f`
- Base (on claude/stoic-ride-54ddxp): `db38a3042a057155ac8f7ef45a65d54552046662`
- Head: `27bb06c6bebecb4e6bdae05fc8fbdb6ca763f520`
- Restore: `bash scripts/cycle/restore-wip.sh fix-app-6 <new worktree dir>`

## Commits since the base
```
27bb06c fix-app-6: BN-1 place counts judged per place, BN-2/BN-4 medians in the pay's currency and per hour, BN-3 count once, BN-5 held values kept, BN-6 minimums under a floor, BN-7 posted levels
9de575d fix-app-6: red unit tests for BN-1 to BN-7 (16 of 18 fail on 4ebe24f)
4ebe24f fix-app-6: log with State
7ea8be8 fix-app-6: prompt verbatim
```

## Uncommitted and new files
```
 M test/fix-mr-3.test.js
 M test/fix3-app.test.js
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

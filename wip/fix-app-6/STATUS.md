# WIP checkpoint: fix-app-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af65001c61c5e8b4f`
- Base (on claude/stoic-ride-54ddxp): `db38a3042a057155ac8f7ef45a65d54552046662`
- Head: `4a0265d2431ba3b281e3cd9363b500df94a01b52`
- Restore: `bash scripts/cycle/restore-wip.sh fix-app-6 <new worktree dir>`

## Commits since the base
```
4a0265d fix-app-6: e2e fixes (empty results, locale counts, Location row counts at every phone size); log decisions
80a676b fix-app-6: BN-1 a town's own count beside its country- or state-wide postings (list and map pins); BN-7 the chip reads the level from the loaded posting
d9d050e fix-app-6: log State
30fc159 fix-app-6: e2e group (42 tests), BP-10/MR-39/shared-decision tests on the new rules, CONTRACT and methodology guide
27bb06c fix-app-6: BN-1 place counts judged per place, BN-2/BN-4 medians in the pay's currency and per hour, BN-3 count once, BN-5 held values kept, BN-6 minimums under a floor, BN-7 posted levels
9de575d fix-app-6: red unit tests for BN-1 to BN-7 (16 of 18 fail on 4ebe24f)
4ebe24f fix-app-6: log with State
7ea8be8 fix-app-6: prompt verbatim
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

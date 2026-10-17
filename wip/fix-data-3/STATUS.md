# WIP checkpoint: fix-data-3

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a31d67e4799da9dcf`
- Base (on claude/stoic-ride-54ddxp): `f53a2700e30e7c2d1a2adf3e2b484bcbeb098323`
- Head: `e0f828a5668d3a9c91ec218b1b461475b8ce67f4`
- Restore: `bash scripts/cycle/restore-wip.sh fix-data-3 <new worktree dir>`

## Commits since the base
```
e0f828a fix-data-3: places (D-41, D-42, V-45, Town and Country, old location links) and department names (UX-32); norm-12
0ae184e fix-data-3: no Juice at a place the posting gives no pay row of its own (lead decision 2026-10-16)
79871b0 fix-data-3: MR-28 minimums, shift-inclusive and part-time hourly figures leave the base-pay cells; one Juice line
8a443a0 fix-data-3: D-38 a Fellow rank is Staff+ and its posted pay is shown; Data Residency is not a residency
d9450ed WIP fix-data-3: prompt and log skeleton
```

## Uncommitted and new files
```
 M docs/CONTRACT.md
 M docs/DATA_SOURCES.md
 M docs/process/fix-data-3.md
 M docs/process/methodology-review-beta-2.md
 M scripts/e2e.js
 M server/sources/upgrade.js
?? docs/process/patches/fix-data-3-comps-left-out.diff
?? test/e2e/fix-data-3.e2e.js
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

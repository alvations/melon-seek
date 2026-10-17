# WIP checkpoint: fix-sec-3

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-ab8feec32a367855e`
- Base (on claude/stoic-ride-54ddxp): `f53a2700e30e7c2d1a2adf3e2b484bcbeb098323`
- Head: `94797717fcba1955371bad26112d77df9d9f8516`
- Restore: `bash scripts/cycle/restore-wip.sh fix-sec-3 <new worktree dir>`

## Commits since the base
```
9479771 fix-sec-3: V12 residual: read-only checkouts keep no token; idb pinned in the iOS Simulator job
1a9870d fix-sec-3: V14 residual: a custom board never shows a built-in company's name
d05d6db fix-sec-3: S-10: bounded Meta, job-family and DOL parsers (linear on hostile text, same output on real data)
fe41715 fix-sec-3: S-4 residual: Amazon links on-host, beta links only on their company's hosts, no dead Apply button
a220eb1 fix-sec-3: S-2 residual: one pause guard for every crawl (fetchLive, snapshot.js one(), probe full mode)
```

## Uncommitted and new files
```
 M .github/workflows/monthly-refresh.yml
 M docs/DATA_FRESHNESS.md
 M test/monthly-refresh-commit.test.js
?? .github/scripts/fx-values-only.mjs
?? test/fixtures/refresh/fx-refresh-9de373f.json
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

# WIP checkpoint: qa-suite-beta

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-aa166069d49bf488a`
- Base (on claude/stoic-ride-54ddxp): `05263e8c010758f51cca4bcbcfb2871eac1defd3`
- Head: `29aea442babd477da06c4e5da20b96cfa11ef027`
- Restore: `bash scripts/cycle/restore-wip.sh qa-suite-beta <new worktree dir>`

## Commits since the base
```
29aea44 qa-suite-beta: runner patch (SIGTERM/SIGHUP/SIGINT stop the run, relaunch only on a real disconnect, --shard, --list, --max-skips, links registered), T-1 board list, T-4 link checker, T21 patch
e09fe53 qa-suite-beta: WIP T-17 title line breaks (todo), Juice grades in the More popover, phone filter rows; flake patches one per test
aae31c4 qa-suite-beta: WIP per-board filter and sort checks, Listed and Juice grades; the e2e shard patch
8e08770 qa-suite-beta: WIP the coverage groups (unit and e2e), registered in scripts/e2e.js
6038890 qa-suite-beta: log with its State section
f06c2f8 qa-suite-beta: the brief, verbatim
```

## Uncommitted and new files
```
?? dist
```

## Left out (not in untracked.tgz)
- dist (symlink)
- node_modules (symlink)

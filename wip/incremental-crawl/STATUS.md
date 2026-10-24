# WIP checkpoint: incremental-crawl

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-abd2997ebc0ac9c23`
- Base (on claude/stoic-ride-54ddxp): `859c8e0485f9b452ea7d450f5fa52516e1e97536`
- Head: `077f4c6bc02eeca40b5429a9d85042f30a2271ff`
- Restore: `bash scripts/cycle/restore-wip.sh incremental-crawl <new worktree dir>`

## Commits since the base
```
077f4c6 Process log: final test counts
bcc87f6 Process log: incremental-crawl
a7453ee Docs: the incremental crawl and closure rules (ARCHITECTURE), how each board updates with expected crawl times (DATA_SOURCES §8), closures in the archive (DATA_ARCHIVE §9, §13 patch), adding a board (PLAYBOOK)
10b5dfb Tests: the archive records the same versions from incremental and full crawls; patch for the archive to treat a short list as partial
4346889 beta merge: keep the cap wording in the ledger line
ed271c0 Tests: closure rules (complete lists only, probes, failed and capped lists) and the shared module (304s, fallback limit, accounting)
8755373 Tests: an incremental crawl equals a full crawl for every adapter
b566c9e snapshot.yml: carry the crawl state between runs (trusted artifacts only), full_crawl input
c5adb95 Closures need a complete list; crawl state and per-posting accounting for every board
892e162 Incremental crawl: one shared delta module; big-tech adapters fetch details only for new, changed and aged postings
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

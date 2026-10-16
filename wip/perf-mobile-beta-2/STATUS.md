# WIP checkpoint: perf-mobile-beta-2

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a7425c5dcd4e39cbe`
- Base (on claude/stoic-ride-54ddxp): `f254143f9171ca620fb4c58c0f5ff2687e6de040`
- Head: `d89c3fb1b2dcc42d557fe7211a16fcbc04f841a1`
- Restore: `bash scripts/cycle/restore-wip.sh perf-mobile-beta-2 <new worktree dir>`

## Commits since the base
```
d89c3fb WIP perf-mobile-beta-2 log: part 2 decisions; the lead's follow-ups in the prompt file
b63652f CI list check reads first-page previews too (the list's own postings, no HTML, no stored Juice); test
ad89647 perf-mobile-beta-2: getPreview asks only for boards config.js lists (window.MELON_PREVIEWS), so small boards make no 404 request
1995634 WIP perf-mobile-beta-2: State for part 2
0719869 perf-mobile-beta-2 equal-check: every first-page preview holds getJobs' own postings (all 8 previews of the 2026-10-16 crawl identical)
707be3b WIP perf-mobile-beta-2: the first render after a load runs as separate tasks (derive, sort, draw); a yield after disambiguateLocations
8de8c28 WIP perf-mobile-beta-2: bundled lists unpack in 40 ms slices; derive counts keyword facets on first read
a851337 perf-mobile-beta-2: tests for the first-page preview (prefix set, same postings and juice as getJobs, config.js asks for it first)
a9cb193 WIP perf-mobile-beta-2: first-page preview (build writes api/preview/<slug>.json for big boards; config.js fetches it first; api.js#getPreview; app.js shows it while the list loads)
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

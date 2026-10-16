# WIP checkpoint: perf-mobile-beta-2

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a7425c5dcd4e39cbe`
- Base (on claude/stoic-ride-54ddxp): `2474fc4fd41051bba264426562e3e0d37f24bc9c`
- Head: `a5c02c54be9b120da2e4f4b292646f599ae15297`
- Restore: `bash scripts/cycle/restore-wip.sh perf-mobile-beta-2 <new worktree dir>`

## Commits since the base
```
a5c02c5 WIP perf-mobile-beta-2: State for part 2
1452f37 perf-mobile-beta-2 equal-check: every first-page preview holds getJobs' own postings (all 8 previews of the 2026-10-16 crawl identical)
d7af385 WIP perf-mobile-beta-2: the first render after a load runs as separate tasks (derive, sort, draw); a yield after disambiguateLocations
704dde1 WIP perf-mobile-beta-2: bundled lists unpack in 40 ms slices; derive counts keyword facets on first read
7385334 perf-mobile-beta-2: tests for the first-page preview (prefix set, same postings and juice as getJobs, config.js asks for it first)
4a3726d WIP perf-mobile-beta-2: first-page preview (build writes api/preview/<slug>.json for big boards; config.js fetches it first; api.js#getPreview; app.js shows it while the list loads)
8c97797 WIP perf-mobile-beta-2 log: verification, 22K record, follow-ups
25efed6 SA-7: trimming keeps pay paragraphs in pounds, euros and zloty and 'pay rate' / 'per hour' lines (salary-audit-data's snapshot.js hunk)
de03075 WIP perf-mobile-beta-2: State; merge script for interleaved runs
d25d42c perf-mobile-beta-2 test: brand and departmentBasis (google-grouping) round-trip through melon-packed-3 exactly
c673b9c perf-mobile-beta-2 test: the Amazon-like board brings its own pay and places, so CI (no data links, 3-posting fixture) exercises every melon-packed-3 encoding
68a0748 WIP perf-mobile-beta-2: State section in the log
161a472 VT-22: trimming keeps every pay-table row and the sentence above it (fix5-data's patch, applied); VT-22 test un-todo'd
b2e59c9 Registry: line numbers after melon-packed-3
6b133c1 perf-mobile-beta-2 log: findings, decisions, steps (WIP)
abac18a perf-mobile-beta-2: test that the sections budget decision is unchanged; log skeleton
fdff79f Juice in time slices (the per-pay memo measured no faster: copying or keying cost as much); sections budget on melon-packed-2 bytes; readableTitle memo patch
fc084ee melon-packed-3 lists and Juice once per distinct pay and places (behaviour-identical)
```

## Uncommitted and new files
```
 M docs/screenshots/chart.png
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/insights.png
 M docs/screenshots/map-juice.png
 M docs/screenshots/map.png
 M docs/screenshots/mobile.png
 M docs/screenshots/qa-mobile/e2e-landscape-map.png
?? dist
```

## Left out (not in untracked.tgz)
- dist (symlink)
- node_modules (symlink)

# WIP checkpoint: fix-density

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a62c9206a358fb258`
- Base (on claude/stoic-ride-54ddxp): `2474fc4fd41051bba264426562e3e0d37f24bc9c`
- Head: `a72e1da58c9d7ce0c26537330ce96e8089f41eaf`
- Restore: `bash scripts/cycle/restore-wip.sh fix-density <new worktree dir>`

## Commits since the base
```
a72e1da fix-density: before/after screenshots on the fresh crawl (phone and desktop, light and dark), log table with the drawer rows
3d3b461 fix-density: the drawer's converted-pay line and the part-time/annualized note are one line each (detail under the pay block's Details); median label clear of the strip's ends on a phone
8ea3179 WIP fix-density: before/after inventory on the fresh crawl in the log
28ccb13 WIP fix-density: process log with State (table and screenshots pending)
5f8b599 fix-density: e2e waits for Insights on Amazon's 22,179 postings; Amazon minimum and shift-pay drawers keep one caption line (fix5-data VT-17/VT-18)
e3c745a fix-density: fold in fix5-data's display patch (VT-17 minimum, VT-18 shift differential): one caption line, the detail in Details
430f000 fix-density: Details is a 44px tap target on phones without growing the line; tests read the estimate's and the compare card's Details
8df4f2f fix-density: tests that pinned the old long lines read the line and its Details (same facts)
fddcdd3 fix-density: e2e test (one line, 12 words, Details with aria-expanded on every board at 390, 360 and 1440); tagline and compare caption fit a phone
417aa18 fix-density: one-line notes with one Details disclosure (chart, stats line, map legend, Insights, Pay estimate, drawer pay block, empty states, tagline)
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
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

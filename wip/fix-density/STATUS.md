# WIP checkpoint: fix-density

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a62c9206a358fb258`
- Base (on claude/stoic-ride-54ddxp): `2474fc4fd41051bba264426562e3e0d37f24bc9c`
- Head: `8ea3179cfb1b51396aaf4941eef3afcd67c6c7c2`
- Restore: `bash scripts/cycle/restore-wip.sh fix-density <new worktree dir>`

## Commits since the base
```
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
?? docs/screenshots/fix-density/
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-density/before-amazon-1440x900-light-drawer.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-1440x900-light-empty.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-1440x900-light-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-1440x900-light-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-1440x900-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-1440x900-light-ranges-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-1440x900-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-drawer.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-empty.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-ranges-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-360x740-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-drawer.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-empty.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-ranges-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-amazon-390x844-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-1440x900-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-1440x900-light-ranges-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-1440x900-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-360x740-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-360x740-light-ranges-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-360x740-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-390x844-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-390x844-light-ranges-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-anduril-390x844-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-apple-1440x900-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-apple-1440x900-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-apple-360x740-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-apple-360x740-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-apple-390x844-light-notes.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-apple-390x844-light-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-drawer-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-drawer-nopay-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-drawer-nopay-g-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-empty-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-insights-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-map-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-map-juice-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-notes-1440x900-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-notes-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-nvidia-1440x900-light-drawer.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-nvidia-360x740-light-drawer.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-nvidia-390x844-light-drawer.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-nvidia-drawer-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-ranges-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-top-1440x900-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-density/before-top-390x844-light.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)

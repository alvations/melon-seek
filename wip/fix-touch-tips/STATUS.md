# WIP checkpoint: fix-touch-tips

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-ab71eae8dc63a1104`
- Base (on claude/stoic-ride-54ddxp): `a7c4198ae594e3366e8be477c74a55aff5acf58f`
- Head: `bdca659e44ae5be12d3c78240a8b056db1927c3b`
- Restore: `bash scripts/cycle/restore-wip.sh fix-touch-tips <new worktree dir>`

## Commits since the base
```
bdca659 fix-touch-tips: log (sizes checked, gate results), the lead's phone-size message in the prompt
fc67365 fix-touch-tips: tips stay inside the visual viewport and the map's visible part (Razr cover, Razr landscape); size matrix taps in screen px, lowers the sheet, says what covers an unreachable item
7d26b47 WIP fix-touch-tips: tip checks on every phone size (phone-sizes.mjs); map tooltip no bigger than a small map
ce06980 WIP fix-touch-tips: household lines fit 320 px phones, drop unused inputKind, before/after shots at 390 and 360 in both themes
abca128 WIP fix-touch-tips: log, after screenshots, ui.e2e patch for the Keywords words, e2e size switch and drawer/map shots
7088bb3 WIP fix-touch-tips: one touch rule for every floating tip (comps, chart, strip, Insights, Compare, map), input-worded hints, touch-reachable words
bc4755d WIP fix-touch-tips: failing e2e for every sticky tip on touch (iPhone sequence), prompt, before screenshots
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

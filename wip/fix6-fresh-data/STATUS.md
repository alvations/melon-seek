# WIP checkpoint: fix6-fresh-data

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a162ae991ad707e77`
- Base (on claude/stoic-ride-54ddxp): `53a03ec0cc2b4240df78b2766027f6a14dc60cad`
- Head: `40519099e7e58fa922f6e4e392123b7854e7242d`
- Restore: `bash scripts/cycle/restore-wip.sh fix6-fresh-data <new worktree dir>`

## Commits since the base
```
4051909 WIP fix6-fresh-data: log sections 1-7
60624f1 fix6-fresh-data: drop the norm-11 patch (the lead takes salary-audit-backend's one bump, 193205a/8262aa3)
a36defd fix6-fresh-data: D-23 checks all seven big-tech boards (Google, Meta and Amazon too)
72c4ef7 WIP fix6-fresh-data: norm-11 patch (normalize.js is salary-audit-backend's), log state
df1b6be fix6-fresh-data: T20 picks a US Senior SWE at Anthropic (the first is now a Dublin posting, compared only within Ireland)
cda76cb fix6-fresh-data: golden fixture unchanged after all (0 of the 300 hashes move with the 10-role rule)
2cbb977 fix6-fresh-data: near copies of widely repeated team paragraphs leave the skills (Google technician no longer TPUs/GCP/Networking); golden re-baselined (1 of 300)
fa79727 fix6-fresh-data: BP-10 and BP-14 e2e pick their cases from the data (Apple no longer lists Columbus, GA; most xAI roles now have a preferred list)
210c34e fix6-fresh-data: D-23 Microsoft's bare "JO" is Jordan; Bahrain, Puerto Rico's PRI, and any unknown bare country code named
a68e62d WIP: fix6-fresh-data prompt and log skeleton
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
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-360x640-with-the-keyboard-up-300-px-.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-iPhone-SE-Safari-375x548.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-landscape-844x390-with-5-saved-searches.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-landscape-844x390.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-29-company-menu-focus.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-30-saved-searches-loaded.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-31-empty-message-half-sheet.png
 M docs/screenshots/qa-mobile-beta/e2e-M-19-sort-while-scrolled.png
 M docs/screenshots/qa-mobile-beta/e2e-M-21-company-menu.png
 M docs/screenshots/qa-mobile-beta/e2e-M-22-paused-board.png
 M docs/screenshots/qa-mobile-beta/e2e-M-24-keyboard-location-search.png
 M docs/screenshots/qa-mobile-beta/e2e-M-27-topbar-360.png
 M docs/screenshots/qa-mobile/e2e-landscape-map.png
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

# WIP checkpoint: fix-phone-sizes

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a3ec7679b4d2dd1a0`
- Base (on claude/stoic-ride-54ddxp): `a92a3c83eb4890db11b724667e469ec99655e95c`
- Head: `f8057c7e71b8b1bebf01e3c94c8a8e098db34eed`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-sizes <new worktree dir>`

## Commits since the base
```
f8057c7 WIP fix-phone-sizes: State after the container restart
d896658 fix-phone-sizes: the Razr cover screen's map before and after; log for the lead's two Razr findings
26cfd82 fix-phone-sizes: the Razr cover screen's map shows its pins (no empty toolbar band, no zoom buttons, the Pay | Juice switch only); the matrix checks the sheet's peek row, the screen's own size, a zoomed or panned page and covered pins
eaaaf72 fix-phone-sizes: final npm test and suite-runner numbers in the log
1e3dbd8 fix-phone-sizes: log with the e2e results and State
d4794c5 fix-phone-sizes: before and after screenshots for every size in the matrix (shrunk), verification table
f5098ce WIP fix-phone-sizes: one name-sweep test per board; dual-screen rules only from 861 px
a6c3e2b WIP fix-phone-sizes: the matrix measures the placeholder in the field's font; log decisions
2754e9d WIP fix-phone-sizes: landscape means landscape, short screens, the name whole at every width, the 280 px toolbar and tagline, cards and Apply fit, map scale, dual screens
fdc9779 WIP fix-phone-sizes: phone matrix guard (every size in phone-sizes.mjs, 3 boards), prompt and log
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

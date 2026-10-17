# WIP checkpoint: fix-phone-text

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a165a45cab5a49415`
- Base (on claude/stoic-ride-54ddxp): `a92a3c83eb4890db11b724667e469ec99655e95c`
- Head: `311bc84237f3b9bf81ecf333681a8af17a162f2a`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-text <new worktree dir>`

## Commits since the base
```
311bc84 fix-phone-text: before and after screenshots (phone and desktop, light and dark), shrunk
7c5be54 WIP fix-phone-text: fitLine touches only lines that don't fit; shorter always-open line; compare tests read the note's Details
c5312d1 WIP fix-phone-text: the basis line is the Pay estimate's explainer; badge line spacing; a popover test reads its Details
50043ac WIP fix-phone-text: fitLine shared in viz/note.js; the comps line, the estimate's basis and accuracy keep their full words where they fit
6781d31 WIP fix-phone-text: the tagline fits its box at every width (fitTagline); desktop guard at 1024, 1280, 1440; empty-state Details described
58f5169 WIP fix-phone-text: log, WebKit step, narrow-screen rule, viz-lane allow-list, tagline and search hint under 360 px
2bbb3b7 WIP fix-phone-text: drawer lines, badge popover, Insights tiles and rows, stats line, search placeholder; guard on every phone size
64dddff WIP fix-phone-text: one-line captions (Same role elsewhere, Pay estimate, Juice explainer, filter notes, More), Details described (A-9)
296a453 WIP fix-phone-text: prompt, red tests (one per ID) and the density guard
```

## Uncommitted and new files
```
 M docs/process/fix-phone-text.md
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

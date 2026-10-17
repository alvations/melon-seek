# WIP checkpoint: fix-phone-controls

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a5fba4b5fed0699e2`
- Base (on claude/stoic-ride-54ddxp): `255b25be0a50762c76587c66cc017f7b8f49db3f`
- Head: `053fd9c2f7ed3253d5fbc190c60db1cd75c5cdd2`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-controls <new worktree dir>`

## Commits since the base
```
053fd9c WIP fix-phone-controls: preview cards open at once and take the keys (M-43, A-11), checklist names told apart and named (M-40, A-10), Insights field above the keyboard (M-47), closed side sheet inert (UX-56), stats Details folded into the chart notes (UX-57); e2e on the phone-size matrix
```

## Uncommitted and new files
```
 M .github/workflows/webkit-phone.yml
 M test/e2e/fix-density.e2e.js
 M test/e2e/fix-phone-controls.e2e.js
?? docs/process/fix-phone-controls.md
?? docs/process/scripts/fix-phone-controls-shots.mjs
?? docs/screenshots/fix-phone-controls/
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-phone-controls/A-10-desktop-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-desktop-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-phone-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-10-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-desktop-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-desktop-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-phone-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/A-11-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-desktop-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-desktop-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-phone-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-40-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-desktop-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-desktop-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-phone-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-43-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-desktop-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-desktop-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-phone-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/M-47-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-desktop-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-desktop-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-phone-dark-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-56-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-57-desktop-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-57-desktop-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-57-phone-dark-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-57-phone-light-after.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/UX-57-phone-light-before.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/e2e-M-40-desktop-1440x900-amazon.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/e2e-M-40-desktop-1440x900-anduril.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/e2e-M-40-fold-folded-280x653-amazon.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/e2e-M-40-fold-folded-280x653-anduril.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/e2e-M-40-iphone-390x844-amazon.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-controls/e2e-M-40-iphone-390x844-anduril.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)

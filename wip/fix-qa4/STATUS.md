# WIP checkpoint: fix-qa4

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a7dfe0f9055abab4e`
- Base (on claude/stoic-ride-54ddxp): `2c9f42514d3c0d321d24d2e206d123fdf5285854`
- Head: `7d79dc4c3f95da0d4c451d21cec924c19fa614a3`
- Restore: `bash scripts/cycle/restore-wip.sh fix-qa4 <new worktree dir>`

## Commits since the base
```
7d79dc4 WIP fix-qa4: log the UX-51, MR-35 and UX-50 numbers and State
15edb5c fix-qa4: salary-audit's lifted card helpers include UX-51's shift pay (payPill asks shiftRange of every posting)
40a11f2 fix-qa4: MR-35 marked fixed (6185ba3) in the methodology review; log
6185ba3 fix-qa4: UX-51 shift pay labelled on the card, its tip, the drawer heading and the CSV; MR-35 the base keeps its cents; UX-50 the company beside its dot
dcebc6a fix-qa4: screenshots before and after (shrunk), log State: integration by the lead pending
6a9ddc0 WIP fix-qa4: log the numbers (before and after, backtests) and the test results so far
c43ff33 fix-qa4: D-50 a third, shorter form of the capped line (280 px took two lines)
bb14c7e WIP fix-qa4: log decisions and steps; e2e: D-47 chart case, New York by option value
196922d fix-qa4: the careers-site names live in the build script, not in lib/export.js (the main site ships no beta host)
03860dc WIP fix-qa4: CONTRACT section, log with State
1a04bf5 WIP fix-qa4: unit tests (12 of 14 red on the base), the e2e group, the README's per-file sources
463c5c9 WIP fix-qa4: D-52 local comparables by payAt, D-48 rank words, D-47 hide the old chart, D-50 cap at the stated maximum, D-49 CSV kind and ranges
eccdca9 fix-qa4: copy QA round 4's desktop tests (beta-desktop-qa-4.e2e.js) and register them
11a107a fix-qa4: the brief verbatim
```

## Uncommitted and new files
```
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/fix-qa4/after-D-47-tesla-after-netflix-chart.png
 M docs/screenshots/fix-qa4/after-D-47-tesla-after-netflix-map.png
 M docs/screenshots/fix-qa4/after-D-48-1114x720-top.png
 M docs/screenshots/fix-qa4/after-D-48-280x653-top.png
 M docs/screenshots/fix-qa4/after-D-50-1114x720.png
 M docs/screenshots/fix-qa4/after-D-50-280x653.png
 M docs/screenshots/fix-qa4/after-D-50-390x844.png
 M docs/screenshots/fix-qa4/after-D-52-microsoft-new-york-comparables.png
 M test/e2e/fix-qa4.e2e.js
?? docs/screenshots/fix-qa4/after-UX-50-google-company-cards.png
?? docs/screenshots/fix-qa4/after-UX-51-280x653.png
?? docs/screenshots/fix-qa4/after-UX-51-390x844.png
?? docs/screenshots/fix-qa4/after-UX-51-amazon-shift-base-card.png
?? docs/screenshots/fix-qa4/before-UX-50-google-company-cards.png
?? docs/screenshots/fix-qa4/before-UX-51-280x653.png
?? docs/screenshots/fix-qa4/before-UX-51-390x844.png
?? docs/screenshots/fix-qa4/before-UX-51-amazon-shift-base-card.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-qa4/after-UX-50-google-company-cards.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/after-UX-51-280x653.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/after-UX-51-390x844.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/after-UX-51-amazon-shift-base-card.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/before-UX-50-google-company-cards.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/before-UX-51-280x653.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/before-UX-51-390x844.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-qa4/before-UX-51-amazon-shift-base-card.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)

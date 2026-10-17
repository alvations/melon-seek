# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `b6250b3ca783529311ec25dbf6eac82c1b1cc29a`
- Head: `e97aa8aff468c0b0e379dfb165376073d5be92d8`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
e97aa8a Fix app [P-5]: expected converted figures follow the current FX rates (the refresh moved £80,000 from $108K to $107K); trap noted
d52341d fix-touch-tips: log (sizes checked, gate results), the lead's phone-size message in the prompt
5e1c457 fix-phone-controls: log with the gate's results (npm test 0 fail, full e2e no new failures, 98/98 on the phone-size matrix)
b756042 fix-phone-controls: before / after screenshots per finding, phone and desktop, light and dark (shrunk, 3.1 MB)
3035c1c WIP fix-phone-controls: tests on the shared phone-size matrix, the WebKit step, fix-density's stats-line guard for UX-57, the Insights field on wide touch screens, log and shot scripts
dad860f WIP fix-phone-controls: preview cards open at once and take the keys (M-43, A-11), checklist names told apart and named (M-40, A-10), Insights field above the keyboard (M-47), closed side sheet inert (UX-56), stats Details folded into the chart notes (UX-57); e2e on the phone-size matrix
4e7fd29 fix-touch-tips: tips stay inside the visual viewport and the map's visible part (Razr cover, Razr landscape); size matrix taps in screen px, lowers the sheet, says what covers an unreachable item
766ae7c ui.e2e: the drawer section-order test strips the new input-neutral keyword words (fix-touch-tips patch)
26436d1 WIP fix-touch-tips: tip checks on every phone size (phone-sizes.mjs); map tooltip no bigger than a small map
8d647de WIP fix-touch-tips: household lines fit 320 px phones, drop unused inputKind, before/after shots at 390 and 360 in both themes
129d990 WIP fix-touch-tips: log, after screenshots, ui.e2e patch for the Keywords words, e2e size switch and drawer/map shots
afba2d1 WIP fix-touch-tips: one touch rule for every floating tip (comps, chart, strip, Insights, Compare, map), input-worded hints, touch-reachable words
dafefd8 WIP fix-touch-tips: failing e2e for every sticky tip on touch (iPhone sequence), prompt, before screenshots
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

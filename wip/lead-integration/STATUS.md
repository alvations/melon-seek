# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `1ef0646b6f16aca8f215cf21e368185bddcf7b89`
- Head: `c4a5ee495391b7ba7a077d586671a8fb21106ebf`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
c4a5ee4 fix-phone-sizes: UX-39 before and after (Amazon's preview at 390x844 and on the Razr cover screen)
6d47af6 WIP fix-phone-sizes: log for the department rows and UX-39
66dd598 WIP fix-phone-sizes: UX-39, the peeking sheet rises to show the preview's first card while Amazon's list loads; a matrix test per phone size
e6184db fix-phone-sizes: a long department name that fits whole in two lines flows as one text (13 px, then 12 px, on the narrowest phones), so Amazon's 'Non-Technical Project, Program and Product Management' is never cut (M-40 with fix-data-3's names)
a81444a WIP fix-phone-sizes: log State on fbdad58, the stacked Duo, the conflict line
f2e5497 fix-phone-sizes: the Surface Duo stacked (720x1114, hinge across): chart and filters on the top screen, the list, job page and sheets on the bottom one; in phone-sizes.mjs and the matrix. Drop a stray conflict marker in styles.css
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

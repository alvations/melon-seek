# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `0e6f21abb1304c3b871382a9d59179a27a1ca9e8`
- Head: `1e412f6ef2e75100305035e20601ac5db017db12`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
1e412f6 fix-phone-sizes: UX-39 before and after (Amazon's preview at 390x844 and on the Razr cover screen)
24b1151 WIP fix-phone-sizes: log for the department rows and UX-39
3a4356f WIP fix-phone-sizes: UX-39, the peeking sheet rises to show the preview's first card while Amazon's list loads; a matrix test per phone size
246f772 fix-phone-sizes: a long department name that fits whole in two lines flows as one text (13 px, then 12 px, on the narrowest phones), so Amazon's 'Non-Technical Project, Program and Product Management' is never cut (M-40 with fix-data-3's names)
4c0e9e9 WIP fix-phone-sizes: log State on fbdad58, the stacked Duo, the conflict line
45ef550 fix-phone-sizes: the Surface Duo stacked (720x1114, hinge across): chart and filters on the top screen, the list, job page and sheets on the bottom one; in phone-sizes.mjs and the matrix. Drop a stray conflict marker in styles.css
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

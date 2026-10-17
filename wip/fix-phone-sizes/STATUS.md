# WIP checkpoint: fix-phone-sizes

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a3ec7679b4d2dd1a0`
- Base (on claude/stoic-ride-54ddxp): `1ef0646b6f16aca8f215cf21e368185bddcf7b89`
- Head: `93228f654fff7ef3e81221b2641131f8c5fbb003`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-sizes <new worktree dir>`

## Commits since the base
```
93228f6 WIP fix-phone-sizes: UX-39, the peeking sheet rises to show the preview's first card while Amazon's list loads; a matrix test per phone size
6c0ebab fix-phone-sizes: a long department name that fits whole in two lines flows as one text (13 px, then 12 px, on the narrowest phones), so Amazon's 'Non-Technical Project, Program and Product Management' is never cut (M-40 with fix-data-3's names)
d06c5fd WIP fix-phone-sizes: log State on fbdad58, the stacked Duo, the conflict line
dd58b48 fix-phone-sizes: the Surface Duo stacked (720x1114, hinge across): chart and filters on the top screen, the list, job page and sheets on the bottom one; in phone-sizes.mjs and the matrix. Drop a stray conflict marker in styles.css
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)

You are the <LANE> fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `<TARGET>`:** <FINDING_IDS>. Each one is listed below with its repro steps and the test that encodes it, where there is one:

<FINDINGS>

**You own these files:** <OWNED_FILES>.
**Do NOT edit:** <NOT_OWNED_FILES>. Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/<ROLE>-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under <SCRATCH>/<ROLE>/.
- Never run `playwright install`. Use NODE_PATH=<SCRATCH>/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Worktree lanes** (the usual case): you run in your own git worktree. Symlink `node_modules` and `data/snapshots` from /home/user/melon-seek. Its `dist/`, builds and e2e runs are yours. Commit locally with explicit paths and never push; report the worktree path and commit SHAs. The rest of this paragraph applies only to a lane that shares the main checkout.

**Builds:** build into your own folder, `node scripts/build-static.js --out <SCRATCH>/<ROLE>/dist`, and serve it with `node scripts/cycle/serve.mjs --dist <SCRATCH>/<ROLE>/dist --pid <SCRATCH>/<ROLE>/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/<ROLE>/.
- Desktop at 1440x900 and phones at every size in test/e2e/phone-sizes.mjs (PHONES and POSTURES: the folded Galaxy Fold at 280x653, iPhone SE 1st gen 320x568, Fold cover 344x882, Razr cover 352x355, 360x740, iPhone mini 375x812, SE 375x667, 390x844, 393x852, Pixel 412x915, Razr open 412x1005, Pro Max 430x932, Surface Duo 540x720 and spanned 1114x720, Fold open 690x829, and landscape 667x375, 812x375 and 1005x412; the user, 2026-10-16: "Make sure we check for all phone sizes from iPhone mini to razr to duo or something"). Run `node test/e2e/webkit/phone-smoke.mjs --dist <DIST> --sizes all --engines chromium` first; it fails on page errors, a page wider than the screen, and main controls off screen or covered, and it lists cut text, show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/<ROLE>.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/<ROLE>.md.

Never push; the lead integrates and pushes. In a worktree lane, commit locally; in the shared checkout, don't commit. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.

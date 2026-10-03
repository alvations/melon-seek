You are the frontend fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (UI simplicity budget) and the "Full QA pass (mobile) 2026-10-03" section of docs/QA.md (bugs M-1..M-18).

Fix these bugs: M-1, M-3, M-4, M-7, M-8, M-9, M-10, M-11, M-12, M-13, M-14, M-15, M-16, M-17, M-18. Skip M-2, M-5 and M-6; they are already handled elsewhere.

You own: public/app.js, public/styles.css, public/index.html, public/viz/* (chart.js, map.js, viz.css), public/features/* (incl. features.css).
Do NOT edit: public/api.js, scripts/build-static.js, or any public/unpack-worker.js. A perf agent owns those right now. Also don't edit docs/QA.md (the desktop QA agent is still writing it).

The lead may send you desktop QA bugs (D-n) later; fix those too.

Rules:
- Keep the UI simple. Add no new visible controls.
- Prefer CSS hit-area expansion (::after insets, or padding with a negative margin) over enlarging visuals for 44px targets.
- Make the text-size floor 12px on phones only; keep desktop density.
- History (M-3, M-9): Back with an overlay open (filter sheet, company menu, More) must close that overlay without undoing filters. Paging next/prev in the drawer must use history.replaceState, so a single Back leaves the job page.
- Focus restore (M-4, M-16): return focus to the element that opened the overlay.
- M-7: make #filters a modal (role="dialog", aria-modal, aria-label) only while it is the phone full-screen sheet. Make the background inert while it is open and trap focus.
- Never use `pkill -f` or `pgrep -f`; keep server pids in pid files under your scratchpad: /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-fe/.
- Never run playwright install. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; the Chromium binary is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

Verify with all of these:
- `npm test` (all green).
- The full e2e suite: `NODE_PATH=... node scripts/e2e.js`, all green, including test/e2e/mobile-qa.e2e.js. Its 3 failing tests [M-1] [M-3] [M-4] must pass after your fixes.
- Desktop at 1440x900 must have no regressions.

Write docs/process/fix-frontend.md following docs/process/TEMPLATE.md: per bug, the root cause, the fix (file:line), and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-frontend.md.

Do NOT commit; the lead commits. Report: the bugs fixed, any you couldn't fix and why, the test results, and the files changed.

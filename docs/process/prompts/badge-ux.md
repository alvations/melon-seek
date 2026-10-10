# Prompt: badge-ux (data-badge live/snapshot UX engineer)

Verbatim task prompt given to the badge-ux agent:

---

You are the frontend/UX engineer for melon-seek, a "Zillow of job postings": a salary chart and map of job postings.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, no new dependencies.
- Read docs/strategy/ROADMAP.md §8 (UI simplicity budget), docs/CONTRACT.md and docs/process/TEMPLATE.md.

The user's message, verbatim: "The live and snapshot button now, is it behaving differently from before? I see the green dot blinking now even though the data looks to be fully there, launch an agent to check that and maybe check the UI/UX there too"

CONTEXT (verify everything; don't assume)
- The data badge (#dataBadge in public/app.js; render around line 704, badgeInfo() around 735, makeBadgeDetails() around 763; CSS in public/styles.css around 250–256) shows where the data came from: Live, Snapshot, Cached or Demo.
- `.data-badge.is-live .badge-dot` has `animation: pulse 2s infinite`, and `.is-loading .badge-dot` pulses at 1s.
- Recent change (2026-10-03, commit 2666ae1, "fetch both at once"):
  - In static mode (GitHub Pages), public/api.js staticJobs fetches the live board and the bundled snapshot in parallel. Whichever lands first is shown, and a live result arriving after the bundle is swapped in via getJobs(…, { onUpdate }) and app.js applyJobs(…, { upgrade: true }).
  - So users now see "Snapshot" first, then a switch to "Live" with a dot that pulses forever, which reads as "still loading" although the data is complete.
  - Also check whether the badge, its popover, the counts or the chart flash or reflow on the swap, and whether a stale state can stick: the dot pulsing while nothing is pending, or "Snapshot" while live is still pending with no hint.
- Newer: public/api.js serves `live: false` companies (the big-tech boards on the /beta/ copy) from the bundle with no browser fetch.

YOUR JOB
1. Reproduce and diagnose, with evidence (Playwright). Use the static build: `npm run build`, then serve dist/ under /melon-seek/ with a tiny static server.
   - Use routes to simulate a live Greenhouse/Ashby board that arrives after the bundle (delay 2–3 s), one that arrives first, one that fails, and a `live: false` company.
   - Record the badge class, label and dot animation over time, and whether anything is actually pending.
   - Server mode: `node server/index.js` with a PORT env var.
   - Compare with the behaviour before 2666ae1, either by reasoning from `git show 2666ae1` or by checking out that version's public/ into a scratchpad copy. Never switch branches in the repo; use `git worktree add` under the scratchpad.
2. Fix the behaviour and the UX, keeping it simple:
   - A pulse means "work in progress" only. A completed Live state gets a steady dot; one brief, subtle pulse on arrival is optional and must respect prefers-reduced-motion.
   - While the live board is still being fetched in the background after the snapshot appeared, the badge should say so briefly and honestly, e.g. "Snapshot · checking live…". When live lands it becomes "Live", or stays "Snapshot" quietly if the live fetch fails.
   - The swap must not jump the user: keep filters, scroll, open drawer, selection and hover; no chart flash. Announce the swap once to screen readers via a polite live region, not on every render.
   - Check the popover text for every state, the labels at 360px (the data-short, data-tiny and data-micro variants), dark mode, focus and keyboard behaviour, and that the dot's meaning doesn't rely on colour alone.
3. Add tests. In test/e2e/ (e.g. a new test/e2e/badge.e2e.js registered in scripts/e2e.js), cover each state transition and assert no infinite animation in a settled state. Add unit tests if api.js changes.

OWNERSHIP AND CAUTION
- You own the badge code in public/app.js (render, badgeInfo, makeBadgeDetails, the onUpdate/applyJobs swap path), the badge rules in public/styles.css, a minimal public/api.js change only if it's needed for a "pending" signal (keep the `live: false` behaviour), and your test files.
- public/app.js and public/styles.css contain UNCOMMITTED work from another agent: the Juice household feature (juiceBlock, household state, `.juice-controls`). Do NOT revert, reformat or touch those parts.
- Re-read each file right before each edit; other agents may edit nearby code, e.g. freshness "as of" plumbing via public/features/freshness.js.
- Never use `pkill -f` or `pgrep -f`; keep pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/badge/.
- Never run playwright install. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, or import from that path; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
- GIT: do NOT commit or push. Pushes deploy the live site, and the lead batches them.

VERIFY
- `npm test` is green, except failures you can show are caused by other agents' in-progress files; name them.
- The full e2e suite passes (`NODE_PATH=… node scripts/e2e.js`) plus your new badge tests.
- Before and after screenshots of each state at 1440 and 390 px, light and dark, in docs/screenshots/badge/.

Write docs/process/badge-ux.md (your log, per TEMPLATE.md) and save this prompt verbatim to docs/process/prompts/badge-ux.md first.

FINAL REPORT
- The root cause, with evidence.
- What changed, file:line.
- A state table (state → label, dot, popover text).
- Test results, the files changed, and anything the lead must check.

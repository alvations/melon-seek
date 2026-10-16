# Improvement-cycle prompt templates

These are the agent prompts for [PLAYBOOK.md](../../PLAYBOOK.md). Copy a template, replace the
placeholders, and send it as the agent's prompt. The agent saves the filled-in prompt verbatim to
`docs/process/prompts/<role>.md`, so the audit trail keeps what was actually sent.

| Placeholder | Meaning | Stable | Beta |
|---|---|---|---|
| `<TARGET>` | which site | `stable` | `beta` |
| `<PATH>` | URL path in a local build | `/melon-seek/` | `/melon-seek/beta/` |
| `<DATA>` | where its snapshots live | `data/snapshots/` | `data/beta/snapshots/` (plus the stable ones) |
| `<COMPANIES>` | boards to test, largest first | Anduril, Anthropic, OpenAI, Shield AI, Palantir | Apple, Microsoft, Google, NVIDIA, Netflix, plus Anduril for comparison |
| `<DATE>` | today, YYYY-MM-DD | | |
| `<ROLE>` | the agent's file name, e.g. `qa-desktop-beta` | | |
| `<SCRATCH>` | the lead's scratchpad folder | | |
| `<DIST>` | persona, UX, viz, methodology and security/accessibility reviews: the build the lead made for the reviewers (`node scripts/build-static.js --out <DIST>`) | | |
| `<AGE_GROUP>` | persona review only: one agent per group, `18–24`, `25–34`, `35–44`, `45–54` and `55 and over` | | |
| `<LANE>`, `<FINDING_IDS>`, `<FINDINGS>`, `<OWNED_FILES>`, `<NOT_OWNED_FILES>` | fix lanes only: the lane name, its findings pasted in full, and the file ownership the lead decided | | |
| `<PREVIOUS>` | the last cycle's sections to compare against | e.g. "Full QA pass (desktop) 2026-10-03" in docs/QA.md | the same, plus the stable cycle of `<DATE>` if it ran |

| Stage | Template |
|---|---|
| 1 | [desktop-qa.md](desktop-qa.md), [mobile-qa.md](mobile-qa.md), [mobile-perf.md](mobile-perf.md), [data-check.md](data-check.md), [persona-review.md](persona-review.md), [ux-review.md](ux-review.md), [viz-review.md](viz-review.md), [security-a11y-review.md](security-a11y-review.md), [vetting-qc.md](vetting-qc.md), [qa-suite.md](qa-suite.md), [methodology-review.md](methodology-review.md) |
| 2 | [fix-lane.md](fix-lane.md) |

Facts every template relies on. Update them here and in PLAYBOOK.md when they change:
- Playwright is in `<SCRATCH>/pw/node_modules` (`NODE_PATH`), and Chromium is
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Never run `playwright install`.
- Each agent builds into its own folder (`node scripts/build-static.js --out <dir>`) and serves it with
  `node scripts/cycle/serve.mjs --dist <dir> --pid <file>` under `/melon-seek/`; the shared `dist/` is
  the lead's, for the e2e suite. Stop it with
  `kill "$(cat <file>)"`; never use `pkill -f` or `pgrep -f`.
- `node scripts/e2e.js` (with `NODE_PATH`) is the full e2e suite. Register a new file the way
  the existing ones are registered.
- Beta boards are `live: false`: the browser never calls them, and the bundled snapshot is all
  there is. Tesla is blocked by its bot protection, so it does not appear on /beta/. Every board is
  shown whole: no posting is ever capped or cut (the user, 2026-10-11; Amazon has about 22,000).
- Stops happen (usage limits, reclaimed containers). Every agent commits small and often in its own
  worktree ("WIP: …" is fine), keeps a `## State` section at the top of its log (done, in progress,
  next step), and sends the lead each finished, tested piece by SendMessage as soon as it is ready.
  The lead checkpoints all worktrees to `wip/<lane>/` every 15 minutes (PLAYBOOK.md, "Checkpoints").
- Re-running a role on the same target: give it a new `<ROLE>` with a pass number (for example
  `qa-desktop-beta-2`) and the same suffix on any test file whose name already exists
  (`test/e2e/beta-desktop-qa-2.e2e.js`). A later pass never edits an earlier pass's tests, log or
  prompt; it lists the earlier IDs that are now fixed and numbers its new findings after them.

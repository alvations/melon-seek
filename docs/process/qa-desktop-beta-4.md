# Process log: qa-desktop-beta-4

The fourth desktop QA pass of the beta site (`/melon-seek/beta/`), beta round 4 (2026-10-17), on 1ef0646, the
build that carries fix wave 5.

## State
- **Done (13:20 UTC):** worktree at 1ef0646 (detached), data and `node_modules` linked, brief saved (d7acc88);
  own build `<scratch>/qa-desktop-beta-4/dist` (7/7 beta companies), served on port 34433 (pid file
  `<scratch>/qa-desktop-beta-4/serve.pid`); round-3 red tests re-run (30/46 pass; the 15 failures are all on the
  lead's known list; sent to the lead 13:00); landing, badges, absent boards, Amazon preview, company menu, recent
  pills, Add board, search, sorts, salary filter, facets (1,281 checks, 0 wrong), Location lists, chart, map,
  Insights; card pay text of every paid big-tech posting (`cards4.mjs`).
- **In progress:** drawers (`s16.mjs`, 53 postings).
- **Candidates so far:** (a) pay rows tied to no listed place widen the card/drawer span and count ("$60K–129K ·
  4 places" on a Bellevue + Arlington posting; 17 Amazon, 1 Apple); (b) after an in-page switch to an absent
  board (`#c=tesla`), the previous board's chart stays drawn, faded, behind "This board isn't on this site".
- **Next step:** other features (s20, s21, s23), timings (s25), layout and contrast (s26), screenshots of the
  round-3 re-checks, then the tests for new bugs, `npm test`, the full e2e.

## 1. Brief
- **Prompt:** [prompts/qa-desktop-beta-4.md](prompts/qa-desktop-beta-4.md), saved verbatim.

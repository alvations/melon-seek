# Process log: qa-mobile-beta-4 (fourth mobile QA pass on beta)

## State
- **In progress (2026-10-17 12:58 UTC):** setup done (worktree on 1ef0646, data and node_modules links, own build in
  `<scratch>/qa-mobile-beta-4/dist`, server on port 5471 with a pid file). The phone smoke (all 19 sizes, 7 boards,
  Chromium) is running in the background.
- **Next:** re-check M-33 to M-47 and the phone parts of the round-3 reviews; then every feature on every board and
  size; then the test file, the screenshots and the QA section.
- **If resumed:** the probes are in `<scratch>/qa-mobile-beta-4/probes/` (`<scratch>` =
  `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`); the server is
  `PORT=5471 node scripts/cycle/serve.mjs --dist <scratch>/qa-mobile-beta-4/dist --pid <scratch>/qa-mobile-beta-4/serve.pid`.

## 1. Brief
Prompt: [prompts/qa-mobile-beta-4.md](prompts/qa-mobile-beta-4.md).

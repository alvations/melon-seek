# Process log: qa-mobile-beta-4 (fourth mobile QA pass on beta)

## State
- **In progress (2026-10-17 12:58 UTC):** setup done (worktree on 1ef0646, data and node_modules links, own build in
  `<scratch>/qa-mobile-beta-4/dist`, server on port 5471 with a pid file). The phone smoke (all 19 sizes, 7 boards,
  Chromium) is running in the background.
- **Done so far (13:25):**
  - The phone smoke: 133/133 ok (19 sizes x 7 boards, Chromium, exit 0).
  - Round 3 re-checked:
    - fixed: M-33 to M-39, M-41 to M-47;
    - still open (known): M-40's integration cut at ≤360 px, and UX-39.
    - Sent to the lead.
  - e2e re-run of the round-3 and lane groups (in progress): only the known red-by-design tests fail.
- **Candidates being confirmed:**
  - M-48: `.sal-sub` ("5 places", "2 levels") is 11.5 px on every card;
  - map pins under the map legend at 320x568 (Apple's London pin; `p35-pincover.mjs` running);
  - the Apply label wraps at ≤360 px.
- **Next:** the feature walk at every size (p6 streams A and B running, p32-sizes), dark mode, then the test file,
  the screenshots and the QA section.
- **If resumed:** the probes are in `<scratch>/qa-mobile-beta-4/probes/` (`<scratch>` =
  `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`); the server is
  `PORT=5471 node scripts/cycle/serve.mjs --dist <scratch>/qa-mobile-beta-4/dist --pid <scratch>/qa-mobile-beta-4/serve.pid`.

## 1. Brief
Prompt: [prompts/qa-mobile-beta-4.md](prompts/qa-mobile-beta-4.md).

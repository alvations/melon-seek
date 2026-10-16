# Process log: security and accessibility review, beta round 3 (2026-10-16)

## State
- 2026-10-16 21:35 UTC: started. Worktree detached at `d98a9f0` (origin/claude/stoic-ride-54ddxp). Data links in place
  (not committed). Prompt pasted.
- 21:37: `npm test` with today's data: 1,168 tests, 1,116 pass, 0 fail, 52 to-dos (3 min 36 s, load 0.4 -> 5.6).
- 21:55: rebased onto `32f556f` (monthly-refresh commit mode, which the lead asked to have reviewed). Sent the lead S-8 (Medium:
  the commit is not the tested tree, and copying whole files over a moved tip reverts newer commits) and S-9 (Low: the path
  filter is a deny-list, so code and test paths pass).
- Confirmed so far: S-2 is only partly fixed (a `paused` flag stops only the Amazon and Meta adapters; probe `probes/pause.mjs`:
  Apple, Google, Microsoft, Netflix, NVIDIA and Greenhouse still make requests when paused). S-1 is fixed in the workflow
  (per-folder download, rejected folders skipped), but the old S-1 test still checks the glob and stays a to-do.
- Next: parser timing harness (new regexes), crafted postings through Amazon/Google/Meta mappers and the build, axe and
  keyboard probes on the lead's build, tests, full e2e.

## 1. Brief
Prompt: [prompts/security-a11y-review-beta-2.md](prompts/security-a11y-review-beta-2.md).

## 2. Inputs and sources

## 3. Decisions and rationale

## 4. Replayable steps

## 5. Verification and results

## 6. Known gaps and follow-ups

## 7. Change log
- 2026-10-16 21:35 UTC: started at `d98a9f0`.

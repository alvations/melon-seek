---
name: improvement-cycle
description: Run melon-seek's QA, performance and usability improvement cycle on the main site or the beta site. Covers desktop and mobile QA, mobile performance, a data-quality check, a persona review by 5 age groups × 5 career levels, and the original check roles (UX design, data-viz, security and accessibility, salary vetting, test-suite QA, methodology and sources), then fix lanes, integration and recording. Use when asked to QA, optimize or review the site, or to repeat "the same flow" on /beta/.
---

# melon-seek improvement cycle

The full procedure is in `docs/process/PLAYBOOK.md`. Read it first and follow it stage by
stage. This skill is the short version.

1. **Pick the target.** `stable` is `/melon-seek/` and `beta` is `/melon-seek/beta/`. Fill in the
   placeholders from `docs/process/prompts/cycle/README.md`.
2. **Stage 0, data.**
   - Run `node scripts/cycle/local-data.js`; it rebuilds today's snapshots from the data-archive branch.
   - Run `npm run build`, then `node scripts/cycle/serve.mjs --pid <file>`.
   - Gate: the build log's `beta:` line lists the expected companies, and `npm test` is green.
3. **Stage 1, find problems.** Launch these agents in parallel, each from its template in
   `docs/process/prompts/cycle/`:
   - desktop QA, mobile QA, mobile perf and the data check;
   - 5 persona reviewers, one per age group;
   - the UX, viz, security and accessibility, salary vetting, test-suite QA and methodology
     reviewers.

   On 4 CPUs, run them in batches (PLAYBOOK "Known traps"): mobile perf and test-suite QA alone.

   They encode bugs as failing tests and never push.
4. **Stage 2, fix.** Triage the findings into lanes by owning file and use `fix-lane.md`, one
   owner per file. Other agents send patches.
5. **Stage 3, ship (lead only).**
   - Check `git log origin/claude/stoic-ride-54ddxp..HEAD` for agents' local commits.
   - Build the batch in a clean `git worktree`, then run `npm test`, the build, e2e and a YAML parse.
   - Commit explicit paths and push from the worktree.
   - Run `bash scripts/cycle/sync-shared.sh <old> <new>` in the shared checkout.
   - Watch the post-deploy check.
6. **Stage 4, record.** Append the cycle to `docs/process/lead.md` and add any new lesson to
   the playbook. Repeat stage 1 until it finds no "broken, fix now" items.

Hard rules:
- Agents never push.
- Only push to `claude/stoic-ride-54ddxp`.
- Never `git add -A data`.
- Never `pkill -f`.
- Never `playwright install`.
- Never crawl Amazon or Meta (paused for their terms of use).

# Process log: perf-mobile-beta-2

## 1. Brief

Prompt: [prompts/perf-mobile-beta-2.md](prompts/perf-mobile-beta-2.md), verbatim, with the lead's note of 2026-10-11.

Goal: measure the beta site (`/melon-seek/beta/`) on a mid-range phone with all 7 big-tech boards, Amazon
first, and fix the biggest costs, keeping the app simple and what `getJobs` returns exactly the same.
Mid-task the lead relayed the user: **"Why are you capping the no of posting we must present them as
they are and not cut anything"**. So: no posting is ever dropped, and the target became Amazon's whole
board (about 22,415 postings) plus every other board uncut.

Files owned:
- `public/api.js`, `public/unpack-worker.js` (unchanged), `scripts/build-static.js`;
- since the lead's message: Amazon's entry in `server/companies.js`, `scripts/snapshot.js#fitSnapshot`,
  and the tests and docs that described the posting budget;
- `test/perf-mobile-beta-2.test.js`, `test/fixtures/packed-2-reference.js` (new);
- `docs/process/scripts/perf-mobile-beta-2*.mjs` (harness copy, identity checks);
- `docs/process/patches/perf-mobile-beta-2-*.diff` (for files QA agents are testing; not applied);
- this log and the prompt.

Worktree `/home/user/melon-seek/.claude/worktrees/agent-a7425c5dcd4e39cbe`, detached at 31ad25b.

## 2. Inputs and sources

- `docs/process/perf-mobile-beta.md` (first beta pass: early list fetch, `shared.vetted`, deferred role
  families, its harness and identity checks), `docs/process/perf-mobile.md`, `docs/process/mobile.md`,
  `docs/process/amazon-meta-backend.md` (the 22,415-posting synthetic board and its measurements: first card
  10.5 s on Fast 4G at 4x CPU), `docs/CONTRACT.md` (packed lists, lazy descriptions), PLAYBOOK, TEMPLATE.
- Code read: `scripts/build-static.js` (`packList`, `splitPayload`, `betaLeaks`), `public/api.js`
  (`unpackJobs`, `bundled`, `getJobs`, `withJuice`), `public/unpack-worker.js`, `server/juice.js`
  (`attachJuice`, what it reads), `public/app.js` (`prepare`, `derive`, `paintWindow`, load path),
  `public/features/roles.js`, `scripts/snapshot.js`, `server/companies.js`, `server/history.js`,
  `.github/scripts/beta-snapshots.mjs`, `scripts/external-links.js`, `test/amazon-meta-synth.js`.
- Data: today's crawl (Amazon 5,000, Apple 4,874, Google 3,415, NVIDIA 2,662, Microsoft 2,285, Meta 1,139,
  Netflix 457) and, for the whole Amazon board, `node test/amazon-meta-synth.js --meta 0` (22,415
  synthetic postings through the real adapter, normalizer and `runSnapshot`, as amazon-meta-backend.md did).
- Tooling: Playwright from the scratchpad, Chromium 141 (`/opt/pw-browsers/chromium-1194`), DevTools network
  presets (Fast 4G 165 ms / 1.01 MB/s; Slow 4G 562.5 ms / 180 kB/s).

## 3. Findings and decisions

(see sections 5.x for the numbers)

## 4. Replayable steps

## 5. Verification

## 6. Known gaps and follow-ups

## 7. Change log

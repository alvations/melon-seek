You are the mobile performance engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": a zero-build vanilla-JS static site on GitHub Pages. Read docs/process/perf-mobile.md (the last measurements and what was already done), docs/process/mobile.md, docs/CONTRACT.md, scripts/build-static.js, public/api.js, public/unpack-worker.js, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** measure timing and resource use on mobile for target `beta` (`/melon-seek/beta/` in a local build), then optimize the biggest wins, keeping the app simple and the output identical.

**You own:**
- public/api.js, public/unpack-worker.js and scripts/build-static.js;
- docs/process/perf-mobile-beta.md (your log, with the before/after table) and docs/process/prompts/perf-mobile-beta.md (paste this prompt verbatim).
If a change is needed in public/app.js, public/viz/*, public/features/* or public/styles.css, write it as a patch to docs/process/patches/perf-mobile-beta-<name>.diff instead of editing those files: QA agents are testing them right now. Don't commit and never push.

**Measure first.**
- **Serving:** the data is in `data/beta/snapshots/ (plus the stable boards in data/snapshots/)`. Build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/perf-mobile-beta/dist`, then `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/perf-mobile-beta/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/perf-mobile-beta/serve.pid`. Rebuild there after each change. Never write the shared dist/.
- **Browser:** Playwright from NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- **Device:** emulate a mid-range phone: 390x844, isMobile, 4x CPU throttle, and "Fast 4G" and "Slow 4G" through CDP Network.emulateNetworkConditions.
- **Loads:** Apple (4,882 postings after the requisition merge), Google (3,417), NVIDIA (2,664), Microsoft (2,320) and Netflix (456), plus Anduril (2,491) for comparison with the main site, cold and warm, plus a switch between companies.

Record:
- first contentful paint, first chart paint, time to interactive and total blocking time;
- long tasks, with their attribution, from a Chrome trace (Tracing.start). The Long Tasks API misses work that runs after fetch() resolves.
- JS heap, DOM node count, and requests by type and size (JS/CSS/JSON/fonts/tiles), including the bundle size per company;
- CPU during a 10 s idle period;
- heap after 10 company switches (any leak?);
- the cost of opening the drawer, Insights and the map, and of a filter change and a sort on the largest board.
Reuse docs/process/scripts/mobile-*.mjs where useful.

**Then optimize the biggest wins.** Beta's big boards (thousands of roles each, about 20k in all) are the heavy case. Look at:
- payload size per company (packing, dropping fields not used at first paint, a lazy description);
- the work at first paint (unpack, vet, Juice and comps; move to the worker, chunk, or defer until the drawer opens);
- list virtualization and chart or map aggregation for large boards;
- caching on switch-back.
Every change must be simple and behaviour-identical. Prove it:
- `npm test` and the full e2e suite stay green;
- the unpacked jobs equal the old output exactly (add a test).

Report back briefly with the before/after table per company and network, what you changed, and the patches you wrote for other files.

Notes from the lead (2026-10-11):
- You run in your OWN git worktree, created by the harness from the current head (it includes both beta fix batches). First run:
  - `ln -s /home/user/melon-seek/node_modules node_modules`;
  - `mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots` (gitignored; never commit them).

  Commit locally with explicit paths, ending the message with the two lines below; never push.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
  ```
  Report your worktree path and SHAs. Commit at milestones (after measuring, and after each optimization): a container restart loses uncommitted work.
- In your worktree, you own public/api.js, public/unpack-worker.js and scripts/build-static.js. You may edit public/app.js and public/viz/* too, if the measurements show the cost is there: no other lane is running. Keep changes minimal and behaviour-identical.
- The machine is quiet now (no other agents), so your timings are the record. Note the load average with every measurement.
- Known so far:
  - beta mobile QA measured Apple's first card at 3.75 s at 4x CPU (before the merge: 6,105 postings, list 2.55 MB) against 2.3 s for Microsoft and 2.8 s for Anduril, at twice the memory;
  - the build warns that Apple's list is 2.19 MB (budget 1.50 MB);
  - the app lane's windowed list (M-20) cut DOM nodes from 30,585 to about 3,500.
- The build now re-derives stored snapshots, NORMALIZER_VERSION norm-7, and takes about 2 minutes. Time a build as well, and note whether the re-derivation is worth caching in the build (the next crawl writes norm-7, and then it is a no-op).
- Run the whole `npm test` (with MELON_BETA_SNAPSHOT_DIR pointed at an empty folder, as CI) and the full e2e suite before you report.

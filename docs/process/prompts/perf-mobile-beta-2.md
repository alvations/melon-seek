**The lead's note for this run (2026-10-11).** In your worktree, run `git checkout --detach 31ad25b`: the pushed head, with fix wave 4 and Amazon and Meta resumed. Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek, which hold today's crawl of all 7 big-tech boards: Amazon 5,000 (its posting budget), Apple 4,874, Google 3,415, NVIDIA 2,662, Microsoft 2,285, Meta 1,139 and Netflix 457. The lead's build of it (`cycle-beta6`) warns: "beta: amazon: list is 3.05 MB even without descriptions/sections (budget 1.50 MB)" and apple 2.20 MB. Amazon is now the heaviest board; start there. The earlier pass is docs/process/perf-mobile-beta.md, so compare with its numbers. You run alone on the machine on purpose: your timings are the record, so note `uptime` with each. Commit locally in your worktree at milestones (that replaces "don't commit" below), never push, and report your SHAs. Keep the 5,000-posting budget and the request rate as they are; the user decided both. Check `df -h /` and delete your scratch builds at the end.

You are the mobile performance engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": a zero-build vanilla-JS static site on GitHub Pages. Read docs/process/perf-mobile.md (the last measurements and what was already done), docs/process/mobile.md, docs/CONTRACT.md, scripts/build-static.js, public/api.js, public/unpack-worker.js, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** measure timing and resource use on mobile for target `beta` (`/melon-seek/beta/` in a local build), then optimize the biggest wins, keeping the app simple and the output identical.

**You own:**
- public/api.js, public/unpack-worker.js and scripts/build-static.js;
- docs/process/perf-mobile-beta-2.md (your log, with the before/after table) and docs/process/prompts/perf-mobile-beta-2.md (paste this prompt verbatim).
If a change is needed in public/app.js, public/viz/*, public/features/* or public/styles.css, write it as a patch to docs/process/patches/perf-mobile-beta-2-<name>.diff instead of editing those files: QA agents are testing them right now. Don't commit and never push.

**Measure first.**
- **Serving:** the data is in `data/beta/snapshots/`. Build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/perf-mobile-beta-2/dist`, then `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/perf-mobile-beta-2/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/perf-mobile-beta-2/serve.pid`. Rebuild there after each change. Never write the shared dist/.
- **Browser:** Playwright from NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never run `playwright install`.
- **Device:** emulate a mid-range phone: 390x844, isMobile, 4x CPU throttle, and "Fast 4G" and "Slow 4G" through CDP Network.emulateNetworkConditions.
- **Loads:** Amazon, Apple, Google, NVIDIA, Microsoft, Meta and Netflix, plus Anduril from the main site for comparison, cold and warm, plus a switch between companies.

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

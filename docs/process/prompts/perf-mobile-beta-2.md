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

---

## Follow-ups from the lead during the run (verbatim)

2026-10-11, relaying the user: "Why are you capping the no of posting we must present them as they are and not cut anything".

> New requirements, with an expanded scope for you:
> 1. **No posting is ever dropped.**
>    - Remove Amazon's `maxPostings: 5000` (server/companies.js; you own that entry now). Record the user's quote next to it.
>    - Make `fitSnapshot` (scripts/snapshot.js; you own it now) never cap postings, on any board. It may still move descriptions and sections out of the list into the lazy per-posting description files, which keeps everything and loads it when a posting is opened. If the snapshot file's byte budget would otherwise force a cut, raise or remove that budget, or split the stored snapshot. Nothing may be dropped.
>    - Update every test that asserted capping, including test/amazon-meta-fit.test.js, the jobsCapped/MR-14 display and ledger tests, and the capped-board closure rules in test/incremental-closures.test.js. A capped board can no longer happen; keep the partial-list rules. Also update the docs that describe the budget: DATA_SOURCES, AMAZON_META, README, lead.md, CONTRACT.
> 2. **Your optimization target is now all ~22,415 Amazon postings**, the whole board, plus every other board uncut. The backend's synthetic measurement had the first card at 10.5 s on a 4x-throttled phone (Fast 4G), against Apple at 4.6 s. Make the full board fast without cutting data. Candidates: a small first-paint list (id, title, place, pay, a few fields) with the rest streamed or chunked in the background; paged or virtualized list, chart and map work; moving unpack, vetting and Juice to the worker; caching on switch-back. Measure Amazon at its full size. The local snapshot has only 5,000; build a full-size one from the adapter fixtures, as docs/process/amazon-meta-backend.md did, until the next real crawl lands.
> 3. The other rules stand: behaviour-identical (a test that unpacked jobs equal the old output), `npm test` and the full e2e green, patches for files you don't own, commit at milestones, report your SHAs.

2026-10-16:

> 1. Branch head is 2474fc4. … Rebase your commits … onto 2474fc4.
> 2. FRESH DATA: today's crawl (2026-10-16) … Amazon is now uncapped at 22,179 postings, so this is the real size your work must make fast. Re-point your data links there.
> 3. Apply docs/process/patches/fix5-data-trim.diff (VT-22, scripts/snapshot.js …) in your lane, reconciled with your snapshot.js changes, and un-todo the VT-22 test in test/beta-vetting-2.test.js once it passes.
> 4. The rule is still that no posting or pay row is ever cut.

> 6.7 s to the first card on Fast 4G (15.7 s on Slow 4G) on a phone is still too slow for a job seeker, so your lane continues, with wider ownership …
> - Target: on Amazon's 22,179 postings at 390x844, 4x CPU, Fast 4G, the first cards are visible and scrollable within about 3 s, and the chart follows without blocking input. Apple and the main site must not regress.
> - You now also own: public/app.js: the prepare and first-render path only. … server/juice.js and lib/juice.js: Juice computation only. …
> - Ideas, measure before choosing: render the first windowed page of cards before Juice and prepare finish, then fill in; compute Juice lazily: visible cards first, the rest in idle slices or in the existing worker; stream or split the list so the first screen doesn't wait for 1.14 MB.
> - Don't touch public/viz/chart.js … If chart time (~1.4 s) matters, send it numbers.
> - Same rules: nothing cut or hidden; behaviour identical (your equality check); commit small and often; State in the log; send me each finished, tested piece.

> Extend check-lists.mjs to cover `api/preview/<slug>.json` too … Before you send me the SHA, run the CI step itself locally on a no-data build, not just npm test.

Standing rule (the user): "if we get stopped again due to limits, we must be able to resume without losing much progress": commit small and often, keep a `## State` section at the top of the log, send each finished piece to the lead.

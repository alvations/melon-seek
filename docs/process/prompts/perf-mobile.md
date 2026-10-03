You are the mobile performance engineer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": a zero-build vanilla-JS static site on GitHub Pages. Read docs/process/mobile.md (especially the 2026-10-03 lead pass), docs/CONTRACT.md, scripts/build-static.js, public/api.js and docs/process/TEMPLATE.md.

**Your job:** measure timing and resource use on mobile, then optimize, keeping the app simple and the output identical.

**You own:**
- public/api.js (data loading and unpacking);
- scripts/build-static.js (the packing and bundle layout);
- a new public/unpack-worker.js if you need one;
- docs/process/perf-mobile.md (your log), plus docs/process/prompts/perf-mobile.md (paste this prompt verbatim).
If a change is needed in public/app.js, public/viz/* or public/styles.css, send me the exact diff in your report instead of editing those files: two QA agents are testing them right now and fixes will be coordinated. Don't commit.

**Measure first.** Serve the static build under /melon-seek/ (`npm run build`, then `PORT=<free port> node docs/process/scripts/qa-audit-static-server.mjs`). Use Playwright from /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, with Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome (never run `playwright install`). Emulate a mid-range phone: 390x844, isMobile, 4x CPU throttle, and network "Fast 3G"/"Slow 4G" through CDP Network.emulateNetworkConditions. Do this for Anthropic, Anduril (the largest board, 2,418 jobs) and OpenAI, on cold and warm loads, and on a company switch. Record:
- first contentful paint, first chart paint, time to interactive, total blocking time, long tasks with their attribution (CDP Profiler or Performance timeline: which functions);
- JS heap (Performance.getMetrics / performance.memory), DOM node count, and the number and size of requests split into JS/CSS/JSON/fonts/tiles;
- CPU during a 10 s idle period (anything polling or animating?);
- memory after switching companies 10 times (is it leaking?);
- the cost of opening the drawer, Insights and the map.
Reuse docs/process/scripts/mobile-audit.mjs and the other mobile-*.mjs scripts where useful.

**Then optimize the biggest wins.** The known one: Anduril's load has a 0.4–0.55 s long task at 4x CPU, from parsing and unpacking the list (plus vetting and Juice). Options:
- unpack and vet in a Web Worker (it must work under the site's CSP, script-src 'self', which a same-origin module worker satisfies);
- split the work into chunks that yield between them;
- trim the packed payload;
- defer work that isn't needed for the first paint (e.g. Juice or comps until the drawer opens);
- preconnect and preload hints;
- cache-friendly asset names;
- avoid re-downloading on company switch-back (an in-memory LRU).
Keep every change simple and behaviour-identical. Prove it: `npm test` and `node scripts/e2e.js` (with NODE_PATH) must stay fully green (currently 294/294 and 56/56), and the unpacked jobs must equal the old output exactly (add a test).

Put a before/after table per company and device in docs/process/perf-mobile.md. Report back briefly with the table, what you changed, and any diffs you need me to apply in other files.

---

Mid-task message from the coordinator (verbatim):

Extra bug for you, since you own scripts/build-static.js (QA M-2, High). In the static build's snapshot branch (around line 630), relocateJobs() is never called. As a result, the Pages Location filter lists raw variants such as "Remote-Friendly US (Travel Required)", while server mode shows "Remote (US)". Please make the static path apply the same location normalization server mode does (check server/index.js readSnapshot / stamp for the exact order). Add an assertion to test/static-build.test.js, and include it in your report. Don't touch app.js, styles.css or viz; send diffs for those instead, as agreed.

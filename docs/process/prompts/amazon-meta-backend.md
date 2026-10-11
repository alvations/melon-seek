You are the dedicated backend engineer for getting Amazon and Meta onto melon-seek's big-tech list (/home/user/melon-seek, "the Zillow of job postings"; the big-tech boards are on the beta site, /melon-seek/beta/). A data engineer works on the same goal at the same time (role amazon-meta-data); they own the terms question, the alternative data routes and docs/AMAZON_META.md, and you own the crawler, pipeline and build.

The user's words, 2026-10-11: "Why are the Meta and Amazon ones missing?! Launch a dedicated agents data and backend engineer to figure it out and get the data!!! We must have these in the big tech list!"

What the lead knows: both adapters exist (server/sources/amazon.js, server/sources/meta.js), with tests in test/bigtech-*.test.js. On 2026-10-10 both were set to `paused: 'terms'` in server/companies.js, so they are not crawled, built or listed. The reason was that their sites' terms appeared to bar automated collection, and resuming was left for the user to decide. Amazon is large: the probe counted 22,415 postings, about 4.6 times Apple's 4,875, and roughly 200 MB normalised (docs/process/bigtech-data.md). Meta has about 1,143 job pages from its sitemap.

Read first: docs/DATA_SOURCES.md §7, docs/process/bigtech-data.md, docs/process/beta-deploy.md, docs/process/perf-mobile-beta.md (the beta performance budget), docs/ARCHITECTURE.md, server/companies.js, server/sources/{amazon,meta,polite}.js, scripts/snapshot.js, .github/workflows/snapshot.yml, .github/scripts/beta-snapshots.mjs, scripts/build-static.js (the beta channel), docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Where you work:** your own git worktree (you start in it). Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek. Commit locally at milestones (a container restart loses uncommitted work), never push, and report your commit SHAs. You own:
- server/sources/amazon.js and server/sources/meta.js;
- in server/companies.js, the amazon and meta entries and the `paused` mechanics only;
- .github/scripts/beta-snapshots.mjs, the beta size-fitting in scripts/snapshot.js, and scripts/probe-bigtech.js;
- test/bigtech-*.test.js and new test/amazon-meta-*.test.js;
- docs/process/amazon-meta-backend.md (your log, following docs/process/TEMPLATE.md) and docs/process/prompts/amazon-meta-backend.md (paste this prompt verbatim).
Changes to any other file (.github/workflows/*, scripts/build-static.js, public/*, docs/DATA_SOURCES.md) go as patches in docs/process/patches/amazon-meta-backend-<name>.diff. Other lanes are editing public/app.js and public/viz/* right now.

**The rule while the user decides:** don't request any Amazon or Meta job listing, search endpoint or job page, from the sandbox or from a GitHub runner. That includes the probe's recon and full modes for amazon and meta. Work from the recorded formats in docs/DATA_SOURCES.md §7e and §7g, and from the fixtures. Whether to collect against a site's terms is the user's decision. Your job is to make sure that once it is allowed, both go live in one step and work the first time.

**Do:**
1. **Trace why they're missing, end to end.** Follow the registry (`listCompanies`, `includePaused`), the crawl matrix (beta-snapshots.mjs slugs), the crawl, merge and gate jobs in snapshot.yml, the archive ingest, the build's beta channel and the beta company list. Confirm `paused: 'terms'` is the only cause, and list every place that would need to change to resume.
2. **Make resuming one documented switch.** For example, removing `paused` (or a `resume` decision recorded next to it) turns on the crawl, archive, build and list together. A test should prove that a paused company is never requested, and that an unpaused one flows through every stage with fixtures.
3. **Make the adapters ready.**
   - Check them against the recorded formats and the fixtures. Cover the edge cases in §7e and §7g: Amazon's per-location pay table and the older national sentence, hourly pay, CAD and other currencies, the 10,000-hit cap per query and the partitioning by country and business category; Meta's `public_compensation`, intern monthly pay, and the JSON-LD fallback.
   - Error handling, retries and the politeness rules in polite.js: honest User-Agent, about 1 request per second, robots.txt.
   - Estimate the crawl time per run for each (Amazon about 225 list requests at 100 a page; Meta about 1,143 page requests at 1/s, about 20 minutes) and check it fits snapshot.yml's job timeout and the 6-hour schedule. Propose incremental crawling if not (for example, only fetching Meta pages whose sitemap entry is new or changed).
4. **Amazon at scale.** 22,415 postings would make Amazon the largest board by far. Build a synthetic Amazon snapshot by scaling up the adapter's fixtures to the real count and the real country and category mix (from §7e), and measure what it does:
   - the beta build: size, time, and the 800-character description fit (`fitSnapshot`, `jobsCapped`);
   - the browser, with the method in docs/process/perf-mobile-beta.md (Playwright from NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome, never `playwright install`; serve your build with `node scripts/cycle/serve.mjs --dist <dir> --pid <file>` and stop it with `kill "$(cat <file>)"`, never `pkill -f`): first card on a 4x-throttled phone, memory, and filter and chart times.
   Then design the fit and recommend one option with the numbers, for example: split Amazon into business units (AWS, Stores and so on) as separate boards, split by country, or cap the postings and say so on screen. Implement the parts in your files, and send patches for the rest.
5. **Synthetic Meta snapshot:** the same, at about 1,143 postings, to prove the pipeline end to end.

Machine: 4 CPUs, shared with other agents. Run builds and browser timings one at a time, and note `uptime` with every timing. Run `npm test` before you report. Report back with: why they're missing (every place, file:line), what resuming takes (the one switch), the adapter checks, crawl-time estimates, the Amazon scale numbers and your recommendation, the patches for the lead, and your commit SHAs.

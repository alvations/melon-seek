You are the data-pipeline engineer for melon-seek (/home/user/melon-seek, "the Zillow of job postings"). Role name: incremental-crawl. Save this prompt verbatim to docs/process/prompts/incremental-crawl.md, and write your log to docs/process/incremental-crawl.md following docs/process/TEMPLATE.md.

The user, 2026-10-11: "Do we have the auto updates of the positions and delta code and backend setup? Also to check for posting that are already closed or no longer there? Launch an agent to make sure the mechanism is there so that we update the backend data in the most optimal way!! Don't just recrawl everything and check the diffs".

**First, get the right base.** In your worktree run `git checkout --detach 3f47ddc`. That commit has Amazon and Meta resumed, and it will be pushed shortly. Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek. Commit locally at milestones (a container restart loses uncommitted work), never push, and report your commit SHAs.

**What exists today. Read it and confirm.**
- .github/workflows/snapshot.yml crawls stable boards daily (Greenhouse, Ashby and Lever APIs, one list call each) and beta big-tech boards every 6 hours, each board in full. Apple's crawl is about 2 h 10 min, mostly 4,400 detail pages; NVIDIA, Microsoft and Google take 45–60 min; Meta about 20 min of 1,143 job pages; Amazon about 5 min of list pages.
- The history ledger (server/history.js, scripts/history.js, .github/scripts/ledger.sh, and `recordPublished` in .github/scripts/beta-snapshots.mjs) opens and closes postings by diffing each run's list.
- The archive (scripts/archive/*, docs/DATA_ARCHIVE.md) stores job versions and blobs by content.
- The politeness rules are in server/sources/polite.js: honest User-Agent, about 1 request per second per host, robots.txt. The user said not to change the request rate. Don't change it, and don't break what works.

**Build the most efficient correct update, per source:**
1. **Delta detail fetching.** The list or search request is cheap; detail pages are the cost. Each crawl lists everything, then fetches details only for postings that are new, or whose list row shows a change: a title, location or updated or posted date different from the previous snapshot, or a content hash of the list row. Reuse the previous snapshot's normalized job for the rest. Do it per adapter, and only where the list row carries enough to detect a change: Apple (search rows vs jobDetails), Meta (sitemap `<lastmod>` where present, otherwise the URL set), Google (sitemap lastmod), and the Eightfold PCSX boards (Microsoft, NVIDIA; Netflix uses the classic Eightfold API). Use conditional requests (ETag / If-None-Match, If-Modified-Since) wherever a host supports them; check what the recorded responses show in docs/DATA_SOURCES.md §7. A periodic full refresh (for example every Nth run, or details older than N days) catches silent edits; choose it with numbers and make it configurable. Where the previous snapshot comes from in CI (the beta artifact, and the archive as fallback) must be robust: no previous snapshot means a full crawl.
2. **Closed postings.** Today a posting missing from one list is closed. Make it right:
   - a posting is closed when it is absent from a complete list;
   - a partial or failed list never closes anything (the Amazon 95% rule is an example; generalize it);
   - a capped board keeps its left-out postings open (already done for Amazon: check it);
   - optionally confirm a closure with one cheap request to the posting URL (404, 410 or a redirect to search) when the list is ambiguous, within the same politeness budget.
   Record closedAt and the reason in the ledger. Check that the site's "New" and listing-age badges and the archive stay correct.
3. **Stable boards.** Greenhouse, Ashby and Lever already return everything in one call, so check whether any of them supports conditional requests or an updated-since field, and use it if it is safe.
4. **Prove it.** Use synthetic boards and the recorded fixtures (no network in the sandbox):
   - an incremental run gives a snapshot identical to a full crawl's, for unchanged, edited, new and closed postings;
   - a failed partial list closes nothing;
   - request counts drop. Estimate the real saving per board from the archive's day-to-day churn: `node scripts/archive/reconstruct.js` and the data-archive branch (`git fetch origin data-archive`) give per-day observations, so count how many postings are new or changed between consecutive runs.
   Report the expected crawl time per board before and after.
5. **Docs.** docs/DATA_SOURCES.md (how each board updates), docs/DATA_ARCHIVE.md (closures), docs/ARCHITECTURE.md, and the workflow, if it needs the previous snapshot passed in.

You own server/sources/*.js (the incremental logic; keep each adapter's mapping output identical), scripts/snapshot.js, server/history.js, scripts/history.js, .github/scripts/beta-snapshots.mjs, .github/scripts/ledger.sh, .github/workflows/snapshot.yml, the docs above, your log and prompt, and new tests test/incremental-*.test.js. Other agents are editing public/styles.css and public/app.js, so don't touch public/*. Run `npm test` with MELON_BETA_SNAPSHOT_DIR set to an empty folder before you report. Machine: 4 CPUs and limited disk; check `df -h /`, and delete your own large scratch outputs when you're done. Use pid files; never `pkill -f`; never `playwright install`. Report: what existed, what you built, the per-board saving, the closure rules, the tests, and your SHAs.

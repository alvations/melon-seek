You are the deploy engineer for melon-seek, a "Zillow of job postings" that plots salary ranges on a chart and a map.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, Node >= 18, no new npm dependencies.
- Deploys: GitHub Pages via .github/workflows/pages.yml to https://alvations.github.io/melon-seek/. The workflow fetches snapshots, runs the salary-vetting gate, runs `npm run build` (scripts/build-static.js → dist/), deploys, then does a post-deploy live check. .github/workflows/site-watchdog.yml checks the live site every 30 min.
- Read before starting:
  - docs/CONTRACT.md, especially "v3 additions (2026-10-10): big-tech boards on a beta channel";
  - docs/process/TEMPLATE.md, docs/process/devops.md and docs/process/perf-mobile.md;
  - scripts/build-static.js, the workflows, public/api.js, scripts/links-policy.js and docs/strategy/ROADMAP.md §8 (UI simplicity budget).

The user's request, verbatim: "Take a look at the big tech companies, Google, Microsoft, Meta, Apple, Netflix, Amazon, Nvidia, Tesla, Launch the data engineer agent to figure out to how to pull the job posts from those companies job posts and then add them to melon-seek, but for now, don't put them directly in the same branch https://alvations.github.io/melon-seek page , put them under https://alvations.github.io/melon-seek/beta"

A data engineer agent is working in parallel. It is adding the big-tech adapters and the registry entries in server/companies.js: slugs google, microsoft, meta, apple, netflix, amazon, nvidia, tesla, each with `channel: 'beta'` and `live: false`. It is also adding `listCompanies({ channel })` and `node scripts/snapshot.js --channel beta`. Some companies may end up blocked and absent; build for any subset, including none.

YOUR JOB: implement the contract's deploy side, so https://alvations.github.io/melon-seek/beta/ is a full copy of the app with the stable companies plus the beta ones, while /melon-seek/ stays byte-for-byte what it would be without this work.

YOU OWN
- scripts/build-static.js.
- .github/workflows/pages.yml, snapshot.yml and site-watchdog.yml. Not bigtech-probe.yml, which belongs to the data engineer.
- .github/scripts/*.
- public/api.js: `live: false` means serve the bundle quietly, with `error: null` and a "Snapshot · date" badge.
- server/index.js: `/api/companies` channel filter via MELON_CHANNEL=beta.
- scripts/links-policy.js: allow the big-tech posting hosts once the data engineer reports them. Start with the likely ones and adjust: www.google.com/about/careers, careers.google.com, careers.microsoft.com, jobs.careers.microsoft.com, apply.careers.microsoft.com, www.metacareers.com, jobs.apple.com, jobs.netflix.com, explore.jobs.netflix.net, www.amazon.jobs, nvidia.wd5.myworkdayjobs.com, www.tesla.com.
- The beta tag:
  - add it with no JavaScript and no new controls: e.g. build-static writes `<html … data-channel="beta">` and `<meta name="melon-channel" content="beta">` into dist/beta/index.html;
  - add one small CSS rule in public/styles.css that shows a "Beta" pill by the logo only when `html[data-channel="beta"]` is set;
  - it must pass the CSP (no inline script) and dark mode, and work at 360px.
- Tests: test/static-build.test.js additions or a new test/beta-build.test.js; test/links-policy.test.js and test/server.test.js as needed.
- Docs: a README section "Beta site", docs/process/beta-deploy.md (your log, following TEMPLATE.md), and docs/process/prompts/beta-deploy.md (save this prompt verbatim first).

Do NOT edit server/companies.js, server/sources/*, server/pipeline.js, server/salary.js, server/vet.js or scripts/snapshot.js; they belong to the data engineer. Until its registry change lands, code against the contract and guard for its absence: treat `listCompanies({ channel: 'beta' })` returning the same list as "no beta companies". For tests, find a way to inject a fake beta company and snapshot without touching companies.js, e.g. a build option, an env var or a test-only registry override. Document it.

REQUIREMENTS
1. Stable `dist/` contains NO beta slug anywhere: api/companies.json, api/jobs, api/demo, api/meta, api/history, api/desc, market comps, the c/<slug>/ share pages, the OG summaries and sitemap, if any. Add a test that fails if any beta slug or beta posting host appears anywhere under dist/ outside dist/beta/.
2. `dist/beta/`:
   - a full working copy at relative paths, served under /melon-seek/beta/;
   - its methodology page, share pages and CSP meta work;
   - market comps ("Same role elsewhere", Insights) include the beta companies;
   - preload hints are correct;
   - `<meta name="melon-seek-build">` carries a marker, so the post-deploy check can verify /beta/ is the fresh build.
3. Salary vetting stays a hard gate for stable data, exactly as today.
   - Beta data gets its own gate, run per beta company.
   - A beta company with a critical anomaly, or no snapshot, is dropped from dist/beta/ and listed in the step summary.
   - It never fails or delays the stable deploy beyond a bounded timeout. Implausible pay is never published anywhere.
4. pages.yml:
   - Fetch beta snapshots with `node scripts/snapshot.js --channel beta`. Make the step best effort: continue-on-error, a timeout-minutes cap, and a failed board keeps the restored file.
   - Restore and upload a separate `job-board-snapshots-beta` artifact, so the stable artifact stays small. Trusted runs only, same as ledger.sh's rules.
   - Run the beta gate, then build both sites.
   - Extend the post-deploy live check and site-watchdog.yml to /beta/. A beta outage is a warning annotation, not a stable failure.
   - snapshot.yml may also fetch beta (best effort) and upload the beta artifact.
   - Pin actions by the SHAs already used in the repo, and keep least-privilege permissions.
5. If any beta pages exist, they must not be indexed as the main site: add `<meta name="robots" content="noindex">` on beta pages only.
6. Keep the UI simple: the Beta pill is the only visible difference on the beta site. The stable site must not link to /beta/.

VERIFY
- `npm test` is green.
- The full e2e suite: `NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules node scripts/e2e.js`, all green. Chromium is at /opt/pw-browsers/chromium-1194/chrome-linux/chrome; never run playwright install.
- Build both sites with a fake beta company. Serve dist/ under /melon-seek/ with a tiny static server, then check with Playwright at 1440x900 and 390x844:
  - /melon-seek/ shows no beta company and no Beta pill;
  - /melon-seek/beta/ shows the Beta pill and the beta company, and its chart, map, drawer, Insights and methodology link all work;
  - there are no console or CSP errors.
- Validate the workflow YAML; parse it with node, or check it if actionlint is unavailable.
- Never use `pkill -f` or `pgrep -f`; keep pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/beta-deploy/.

GIT: do NOT commit, push, stash, pull or checkout. The lead commits your work, and the data engineer pushes its own files from this same checkout. Don't touch its files or run any git command that changes the index or working tree beyond your own edits.

FINAL REPORT: what you changed (file:line), test and e2e results, what the lead must check once the data engineer's registry lands, and open risks.

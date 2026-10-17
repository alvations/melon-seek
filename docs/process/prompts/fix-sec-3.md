You are the security engineer `fix-sec-3` for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app, "the Zillow of job postings". You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (head f53a270 or later). Read docs/CONTRACT.md, docs/REVIEW.md (the "beta review 2026-10-11" and "beta review 2026-10-16" sections), docs/process/security-a11y-review-beta-2.md, docs/process/PLAYBOOK.md (including "Checkpoints" and "Known traps") and docs/process/TEMPLATE.md.

**Your findings.** All are open and Low; the tests are to-dos in test/beta-security-review.test.js and test/beta-security-review-2.test.js. Fix each one, and turn its to-do into a plain passing test that fails on the old code.
1. **S-2 residual.** `crawlBlock` (the `paused` guard) is called only by amazon.js and meta.js. With `paused:'terms'` set on Apple, Google, Microsoft, Netflix, NVIDIA or Anthropic, `fetchLive` still requests robots.txt and the search API (2 requests each; error code http, not paused). Put one guard at the top of server/pipeline.js `fetchLive` and in scripts/snapshot.js `one()`. The big-tech probe must never target a paused company or its careers host by default.
2. **S-4 residual.**
   - amazon.js:324 builds `${AMAZON_ORIGIN}${j.job_path}` with no check. A job_path of "@evil.example/x" gives https://www.amazon.jobs@evil.example/x, which passes `postingUrl` (a scheme check only) and lands in beta/data/amazon.csv and the list.
   - Add an on-host check like eightfold.js `onHost`, and make the normalizer require BETA_POSTING_HOSTS for beta built-ins.
   - When a posting's URL is dropped, the drawer still renders the Apply button with the site's own host and no href (app.js:4552). Hide the button, and say "No link to the posting" in one line. Keep that edit tiny: other lanes own the drawer.
3. **S-10.** New quadratic parsers, reached only by upstream text. The fitted exponent is about 2; projected times on 1 MB:
   | Parser | Where | 1 MB |
   |---|---|---|
   | `parseMetaAmount` | meta.js:134, double `\s*` | 59 min |
   | `familyOfTitle` | families.js:122, `[（(][^）)]*[）)]` | 19 min |
   | `parseMetaSitemap` without `<url>` | meta.js:36 | 13 min |
   | `extractMetaPage` jsonLd | meta.js:83 | 2.3 min |

   Fix:
   - trim and slice amounts to 100 chars;
   - slice titles to 500 and use `[（(][^（(）)]{0,200}[）)]`;
   - bounded `<loc>[^<]{0,2048}</loc>` and `<script[^>]{0,500}…`.

   Also bound the local DOL tools (xlsx.js:157/220, employers.js:23). Each fix has a test that times a 64–256 KB hostile input under 2 s, and a check that the output on the real fixtures is unchanged.
4. **S-9 residual** (.github/workflows/monthly-refresh.yml commit step).
   - Four of the 11 allow-listed files are code that reaches browsers: server/juice.js, server/salary.js, public/viz/palette.js and public/features/shared.js. Accept a change to them only in the line shapes the FX writer produces: a diff confined to the FX table's lines, of the form `CODE: number,`. Commit 9de373f (the first real refresh) must pass the check, and test/monthly-refresh-commit.test.js must get a case where a code line outside the table is refused.
   - Move the pinned FX examples out of test/juice.test.js into a data fixture the refresh writes (e.g. test/fixtures/fx-examples.json), so the refresh never edits test code. Update the allow-list, test/monthly-refresh-commit.test.js's "allow-list equals the writers' targets" case, and docs/DATA_FRESHNESS.md.
5. **V12 residual.**
   - Read-only jobs check out without `persist-credentials: false`. Add it to every checkout that doesn't push, including the 3 in webkit-phone.yml.
   - Pin webkit-phone.yml's unpinned `brew tap facebook/fb` + `brew install idb-companion` and `pip install fb-idb` to exact versions. fb-idb 1.7.6 and its dependencies were installed in run 38979700118; pin the tap to a commit, or install a pinned idb-companion release.
   - The test is test/beta-security-review.test.js "V12 residual".
6. **V14 residual.** A custom board cannot take a built-in company name, including the beta names (Amazon, Apple, Google, Meta, Microsoft, Netflix, NVIDIA).

**Rules for workflow edits:** keep every existing guard in place, and don't change triggers or permissions beyond what a finding needs. test/workflows.test.js must stay green. Pushes go only to claude/stoic-ride-54ddxp; you never push, the lead does.

**Data and build:**
- Today's crawl is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots in your worktree, and never commit them.
- No crawling: tests use fixtures and stubbed fetch.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never `playwright install`; no `pkill -f` / `pgrep -f`. Give every command a timeout.

**Ownership:**
- Yours: server/pipeline.js `fetchLive`'s guard, scripts/snapshot.js `one()`, scripts/probe-bigtech.js, server/sources/amazon.js (URL building only), server/sources/meta.js and server/families.js (the bounded regexes only), server/normalize.js (the posting-host rule), the DOL tools, the custom-board name rule in server/index.js, .github/workflows/*.yml (the residuals above), test/juice.test.js and the new FX fixture, and the Apply-button line in public/app.js.
- Not yours: UI layout and text (the phone lanes), place labels and departments (fix-data-3), per-place pay (fix-pay-at-place).
- Also yours:
  - test/fix-sec-3.test.js, if you need new tests beyond the to-dos you un-todo;
  - docs/REVIEW.md: mark each finding fixed, with its commit;
  - docs/process/fix-sec-3.md, your log in TEMPLATE.md structure, with a `## State` section at the top;
  - docs/process/prompts/fix-sec-3.md, with this prompt pasted verbatim.

**Rules:**
- Commit small and often in your worktree with explicit paths.
- Send the lead each finished, tested piece by SendMessage to "main" (SHA, what it fixes, tests). The lead checkpoints your worktree every 15 minutes and integrates. Never push.
- Before you send any SHA:
  - run `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved OUT of data/, as CI runs it. S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
  - run the full e2e suite with data linked for anything touching the app or the build: no new failures.

Report: per finding, before → after, the tests that fail before and pass after, and SHAs.

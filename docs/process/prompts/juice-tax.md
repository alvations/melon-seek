# Prompt: juice-tax (Juice Score tax engineer)

Verbatim task prompt given to the juice-tax agent:

---

You are the tax engineer for melon-seek's Juice Score: take-home pay after tax, rent and living costs.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, Node >= 18, no new npm dependencies.
- Read first:
  - docs/LIVABILITY.md (especially §3 Tax model);
  - server/juice.js: progressive, US_STATE, US_LOCAL, the GB/CH/ES brackets, caPayroll, CA_PROV, the JP/KR/AU helpers, RULES, TAX_SOURCES, taxKeys and taxFor;
  - the existing juice tests (test/juice*.test.js);
  - docs/process/TEMPLATE.md and docs/process/livability.md.

The user's request, verbatim:
"Launch another agent to look at the Juicy score, check that under what we had e.g. 🍉 Juice 98 · Juicy $315K/yr left in San Francisco … Gross pay $675K/yr Tax −$298K/yr income $200K · regional $64K · social $34K … make sure the taxes paid are correctly pulled. Assign the approrpiate agents for this. Don't just assume, verify with some data or something."

YOUR JOB: verify, and fix where wrong, the tax computed for every jurisdiction in RULES, against official sources. A separate household agent is adding a household choice (single, couple, family with 2 children) that scales rent and living costs.

1. Build golden test vectors per jurisdiction, cited to official sources:
   - Cover every country and region in RULES, plus the US states and localities in US_STATE and US_LOCAL (NYC especially), and the Canadian provinces.
   - Gross incomes of about 100k, 250k and 675k in local-currency equivalents, plus each social-insurance cap boundary.
   - Single filer, tax year matching what the code claims.
   - Compute each expected value by hand from the official schedule: brackets, standard deduction or personal allowance, social-security wage bases and caps, Additional Medicare Tax, CA SDI (uncapped since 2024), NY/NYC, UK National Insurance, the CH cantonal plus federal plus communal multiplier, and so on. Show the arithmetic in a fixture or the test comments.
   - Cross-check with an official calculator where one exists (e.g. HMRC, the CRA payroll deductions calculator, the ATO simple tax calculator, Japan NTA). Use one or two reputable public calculators only as a sanity check, never as the source.
   - Record each source URL and as-of date.
2. Start with the user's example: San Francisco, $675K gross, single, which the app shows as income $200K, regional $64K, social $34K.
   - Verify US federal under the current-year IRS brackets and standard deduction (check the latest IRS Revenue Procedure for the year), and California under FTB rates, including the Mental Health Services Tax over $1M.
   - Verify FICA: the Social Security wage base for the year, Medicare 1.45%, and Additional Medicare 0.9% over $200K. Check CA SDI's rate for the year.
   - Check whether SF has a local income tax (it doesn't for wages, but verify).
   - Explain any difference.
3. Fix every discrepancy in the tax code and TAX_SOURCES (name, url, asOf, `verified: true` only when you verified it).
   - Keep the output shape `{ total, income, regional, social }` and the default single-filer behaviour.
   - Changing numbers to be correct is the point. Update existing tests whose expectations encoded wrong numbers, and explain each change in your log.
4. Household (for the household agent):
   - Extend `taxFor(grossLocal, jurisdiction, opts = {})` with `opts.household` set to 'single' (the default, unchanged output), 'couple' or 'family' (2 adults, 2 children). Assume one earner with the stated gross salary.
   - Implement filing-status effects only where the rules are clear and you can verify them from official schedules: e.g. US federal married filing jointly brackets and standard deduction plus the Child Tax Credit, and state MFJ brackets where they differ.
   - Where you can't implement and verify a jurisdiction's household rules, it stays as a single filer, and the result says so (e.g. `t.basis = 'single'` or a `note`), so the UI can label "taxed as a single filer". Tell the household agent the exact field.
   - Note which countries tax individually regardless of household: the UK, Australia, Canada, mostly Japan and Korea, with the main credits that do exist.
5. Docs: rewrite docs/LIVABILITY.md §3 Tax model with the verified rules, a verification table (jurisdiction, test incomes, expected vs computed, source) and the household support matrix. Write docs/process/juice-tax.md (your log, per TEMPLATE.md) and docs/process/prompts/juice-tax.md (save this prompt verbatim first).

NETWORK
- The sandbox cannot reach most hosts (curl returns 000).
- Use WebSearch and WebFetch (load them with ToolSearch: "select:WebSearch,WebFetch") to read irs.gov, ftb.ca.gov, tax.ny.gov, gov.uk, canada.ca, ato.gov.au, nta.go.jp, estv.admin.ch and the like.
- If you need a document WebFetch can't read, you may add a workflow_dispatch-only workflow, .github/workflows/juice-tax-probe.yml, that downloads it and prints the needed values to the job log, with `permissions: contents: read` and actions pinned by the repo's existing SHAs. Trigger it with the GitHub MCP tools (ToolSearch "select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__github__get_job_logs"; repo alvations/melon-seek, ref claude/stoic-ride-54ddxp). Artifact download is blocked.
- Never invent a rate or threshold. If something can't be verified, keep it, mark it unverified, and list it in your report.

OWNERSHIP
You own:
- the tax section of server/juice.js: progressive through taxFor, TAX_SOURCES, taxKeys and TAX_COUNTRIES, plus confidence for tax;
- new test files, e.g. test/juice-tax-golden.test.js with test/fixtures/tax-golden.json, and the tax assertions in existing juice tests;
- docs/LIVABILITY.md §3.
Shared with others:
- The household agent owns computeJuice's rent, living and household parts, data/cities.json, the UI and the rest of LIVABILITY.md. It edits server/juice.js at the same time, so re-read the file right before each edit and touch only your section.
- Don't edit public/* or data/cities.json, except a city's `tax` jurisdiction key if it is wrong; tell the lead if so.
- The FX table is shared with public/viz/palette.js; don't change it.

GIT
- Do NOT commit or push product code. Every push deploys the live site, and the lead commits your work after review.
- You may commit and push ONLY your probe workflow and helper, if you need them: `git add <explicit paths>`, end the message with the two lines below, push with `git push -u origin claude/stoic-ride-54ddxp`, and never pull, rebase, stash or force-push.
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
- Never use `pkill -f` or `pgrep -f`.

VERIFY
- `npm test` is green.
- The full e2e suite: `NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules node scripts/e2e.js`. Juice numbers in e2e expectations may change, but only because of verified corrections; explain each.

FINAL REPORT
- The SF $675K example: before vs after, line by line, with sources.
- The verification table summary: which jurisdictions were right, which were fixed (and by how much at 250k), and which are unverified.
- The household support matrix and the exact field telling the UI the basis.
- Files changed and test results.

---

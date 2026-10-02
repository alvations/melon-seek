# Prompt: finish (lexicon fixes + external link check in CI) (verbatim)

Logs: [../features.md](../features.md) §6c and [../devops.md](../devops.md) decisions 66–67.

You're finishing the last two open items on melon-seek (/home/user/melon-seek), "the Zillow of job postings": a zero-build Node app that runs as a static site on GitHub Pages. No other agents are running right now. Read docs/process/README.md, docs/CONTRACT.md and docs/process/TEMPLATE.md first. Keep it simple: no new UI.

**1. Keyword lexicon fixes in server/keywords.js.** The proposals are in docs/process/features.md §6a: 14 noisy patterns plus about 9 near-duplicate drops or renames. Apply exactly those proposals; the user's rule is to keep the UI simple, and fewer, cleaner chips serve that.
   - The performance work they waited for is done.
   - test/golden-normalize.test.js pins normalized output. After you've applied the changes and checked them, re-baseline it once with `UPDATE_GOLDEN=1 node --test test/golden-normalize.test.js`, and record why in features.md.
   - Measure before and after on the real local snapshots in data/snapshots/*.json, using docs/process/scripts/boilerplate-report.mjs or your own script: top-10 chips per company, total chip assignments, and a 1-in-7 precision spot check of the fixed patterns. Paste the results into features.md.
   - Make sure no keyword appears on ≥95% of a board's jobs, and that the existing keyword tests still pass.
   - If server/demo.js still uses a Node-only global (the build warns about `process`/`Buffer`/`__dirname`), make it browser-safe.

**2. External link check in CI.** docs/process/scripts/link-check.mjs exists (UX wrote it), and test/e2e/links.e2e.js covers internal links. Add a CI step to .github/workflows/ci.yml that runs the external part on GitHub's runners, which can reach the internet:
   - HEAD (falling back to GET) a seeded random sample of 20 job Apply URLs per built-in company, from the built dist or the snapshot;
   - check the URLs in README.md and docs/**/*.md;
   - check https://alvations.github.io/melon-seek/ and /melon-seek/methodology/.
   It should report broken links in the step summary. Make it advisory (`continue-on-error: true`) for job URLs, since postings close daily, but failing for the site's own URLs. Pin actions by SHA, as the other workflows do (copy the SHAs already used in ci.yml). Validate the YAML with python3 yaml.

**Verify:** run `npm test`, and run `node scripts/e2e.js` with `NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules` (Chromium is in /opt/pw-browsers; never run `playwright install`). Both must be fully green. Currently they're 290/290 and 56/56, so fix any test expectation your keyword change legitimately alters, and explain each one.
   - When you start servers, use pid files. Never `pkill -f` or `pgrep -f` with a pattern your own shell contains; that kills the shell.

**Log it:** in docs/process/features.md and docs/process/devops.md (decisions, commands, results, change log), and paste this prompt verbatim into docs/process/prompts/finish.md. Don't commit; report back briefly with the numbers.

# Prompt: QA engineer (e2e suite)

Verbatim task prompt given to the QA agent:

```
You are the QA engineer on "melon-seek" at /home/user/melon-seek — a "Zillow for job postings" web app. Read docs/CONTRACT.md. Other engineers are concurrently writing server/ (backend, keywords, geo, demo), public/index.html+styles.css+app.js (UX), public/viz/* (chart+map). Do NOT edit their files. You own only: test/e2e/*, scripts/e2e.js, and a QA report at docs/QA.md. Don't commit/push git.

Goal: an end-to-end test suite runnable via `node scripts/e2e.js` (NOT part of `npm test`, since it needs a browser) that: starts the real server (import createServer from server/index.js or spawn `node server/index.js` with PORT=0/random port), and uses Playwright Chromium (preinstalled at /opt/pw-browsers — `ls` it to find the executable; the e2e script should resolve the `playwright` package if installed and otherwise print how to install it; for running here, install `playwright` (matching nothing in particular; `npm i playwright --no-save` into a scratchpad dir and set NODE_PATH, or dynamic import from that path) — do NOT add it to the repo package.json and never run `playwright install`). Checks:
 - /api/companies returns anthropic, anduril, openai; /api/jobs?company=X returns jobs conforming to the Job shape (validate fields/types), mode present; custom board ?source=greenhouse&board=foo works (demo fallback).
 - UI: page loads with no console errors; chart mode default shows bars; switching to map mode shows pins; switching company to Anduril and OpenAI updates the results count; salary filter narrows the list; clicking a Skills keyword chip narrows the list and every remaining card job has that skill (verify via API data); department filter; location filter; clicking a result opens the drawer with Apply link; URL hash round-trip (reload preserves filters); mobile viewport 390x844 renders without horizontal scroll; dark mode screenshot.
 - Save screenshots to docs/screenshots/ (chart.png, map.png, drawer.png, mobile.png, dark.png) at 1440x900.
Use resilient selectors: prefer roles/text; where impossible, read public/index.html & app.js (read-only) to find ids/classes once they exist. The other engineers may take ~20-40 minutes; poll by checking files exist (use the Monitor tool or short `sleep`-free loops via `until [ -f ... ]; do sleep 20; done` in Bash with run_in_background if needed — or just build the harness first and run it at the end). Run the suite, and write docs/QA.md listing every failure/bug found with repro steps and which file likely owns it. Map tiles and external job boards are blocked in this sandbox (expected; demo data mode). Report back concisely with pass/fail summary and the bug list.
```

Follow-up from the coordinator (mid-task):

```
New requirement from the user: document how you produced your work so another agent can replicate it. Before you finish: (1) copy your original task prompt verbatim into docs/process/prompts/qa.md; (2) write docs/process/qa.md following docs/process/TEMPLATE.md (brief, inputs, test strategy + rationale, exact replayable commands incl. how Playwright was installed/resolved, results, known gaps, change log). You own those two files. Don't commit; the lead does.
```

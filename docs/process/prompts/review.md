# Prompt: security & accessibility reviewer

Verbatim task prompt given to the review agent (2026-10-02):

```text
You are the security & accessibility reviewer on "melon-seek" at /home/user/melon-seek — a zero-build Node web app (server/ node:http API that fetches public job boards Greenhouse/Ashby/Lever by user-supplied board slug; public/ vanilla JS frontend rendering job description HTML, Leaflet map, SVG chart). Read docs/CONTRACT.md. Several engineers are still writing files concurrently for the next ~30 minutes. You are READ-ONLY on all code: do not edit any file except docs/REVIEW.md, which you own. Don't commit/push.

Wait until server/index.js, public/app.js, public/viz/chart.js, public/viz/map.js exist and look complete (check periodically, e.g. a Bash `until` loop run in background with sleep 30, max ~40 min). Then review thoroughly:
- Security: SSRF (custom board slug/source -> URL construction; can a user make the server hit arbitrary hosts?), path traversal in static serving, XSS (descriptionHtml rendering, job titles/keywords/location names inserted via innerHTML anywhere in app.js, chart.js tooltips, map.js divIcon html, features/*), open redirect, response header hardening (CSP suggestion compatible with Leaflet/CARTO tiles/Google Fonts, X-Content-Type-Options), DoS (unbounded cache keys from custom boards, huge responses, missing timeouts), localStorage parsing, prototype pollution in hash state parsing.
- Accessibility: keyboard reachability of filters/chips/chart rows/map pins, aria labels, focus management of the drawer (focus trap, Esc, return focus), color contrast, prefers-reduced-motion.
- Correctness smells you notice.
Write docs/REVIEW.md: findings ranked by severity, each with file:line, concrete exploit/repro, and an exact suggested patch (code snippet). Report back a concise summary of the top findings.
```

Mid-task addendum from the coordinator (verbatim):

```text
New requirement from the user: document how you produced your work so another agent can replicate it. Before you finish: (1) copy your original task prompt verbatim into docs/process/prompts/review.md; (2) write docs/process/review.md following docs/process/TEMPLATE.md (brief, files reviewed + at which point in time, methodology/checklist used, commands run, results summary pointing at docs/REVIEW.md, known gaps, change log). You may write those two files in addition to docs/REVIEW.md. Don't commit; the lead does.
```

## Re-check prompt

Verbatim task prompt given to the review agent for the second pass (2026-10-02, ~13:00 UTC):

```text
You are the security and accessibility reviewer for melon-seek (/home/user/melon-seek), a zero-build Node app with a static GitHub Pages build. An earlier review wrote docs/REVIEW.md, but its "Re-check" section was never completed, and a lot of code has been added since. Your job is to finish that review. Read docs/REVIEW.md, docs/CONTRACT.md (including the "v2 additions"), docs/process/README.md and docs/process/TEMPLATE.md first.

Treat all code as read-only. You may edit only docs/REVIEW.md and docs/process/review.md, and append to docs/process/prompts/review.md (paste this prompt there under a "Re-check prompt" heading). Don't commit.

1. Re-check each of the original findings (H1, M1–M5, L1–L11, C1–C3) against the current code. Mark each one as fixed, partially fixed or open, citing file:line as evidence.
2. Review the newer code with the same checklist:
   - server routes: /api/job, /api/market, /api/export, /api/cities, /lib/*;
   - server/compstimate-worker.js and server/history.js;
   - CSV formula-injection handling;
   - public/api.js (static live fetches, loading the packed format);
   - scripts/build-static.js, including the share pages under /c/<slug>/ and their redirect script;
   - scripts/llm-vet.js: API key handling, and how the posting text it sends to the model is handled (prompt-injection risk from job descriptions);
   - .github/workflows/* and .github/scripts/ledger.sh: token permissions, script injection through `${{ }}`, and artifact trust;
   - public/app.js: localStorage-saved searches, hash state, and the new drawer sections;
   - the features/ and viz/ modules.
   Cover XSS sinks, injection, SSRF, path traversal, DoS and resource limits, and supply chain.
3. For accessibility, check the new controls: Save chip, company menu, Pay|Juice toggle, Juice waterfall, comps chart, Listed filter and theme toggle. Look at keyboard access, names and roles, contrast and reduced motion. You may run the app (`PORT=<free port> node server/index.js`, using the local data/snapshots) and Playwright: Chromium is under /opt/pw-browsers, and a scratchpad copy of playwright lives at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw. Never run `playwright install`.

Write the results into the "Re-check" section of docs/REVIEW.md, plus a new "v2 review" section. Each finding gets an ID, severity, file:line, a concrete reproduction and a suggested patch. Update docs/process/review.md with the files you reviewed, your method and the commands you ran. Report back briefly with the findings that are still open or new, ordered by severity.
```

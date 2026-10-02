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

# Process log: security + accessibility review

Written by the lead from the review's own output, because the review agent
stopped on an API error before writing this file.

## 1. Brief
Prompt: [prompts/review.md](prompts/review.md). Read-only review of the server
and frontend for security, accessibility and correctness issues. Output:
[../REVIEW.md](../REVIEW.md). Code was not edited.

## 2. Inputs and sources
- Working tree at about 05:30 UTC on 2026-10-02 (commit `1d23290` plus
  uncommitted work in progress).
- Files in scope: `server/**`, `public/app.js`, `public/index.html`,
  `public/viz/{chart,map,palette}.js`, `public/viz/viz.css`,
  `public/features/shared.js`.
- `node_modules/leaflet/dist/leaflet-src.js` (checked how `divIcon` and
  tooltips insert content).
- [../CONTRACT.md](../CONTRACT.md).

## 3. Checklist applied
From the prompt:
- **Security:** SSRF through the custom board source/slug; static-file path
  traversal; XSS sinks (description HTML, innerHTML in app/chart/map/features);
  open redirect; response headers (CSP, nosniff, Referrer-Policy); DoS
  (cache keys, response size, timeouts); localStorage parsing; prototype
  pollution in hash parsing.
- **Accessibility:** keyboard reachability of filters, chips, chart rows and
  map pins; ARIA labels; drawer focus handling; contrast; reduced motion.
- **Correctness:** anything else noticed along the way.

## 4. Replayable steps
1. Wait for `server/index.js`, `public/app.js`, `public/viz/chart.js` and
   `public/viz/map.js` to exist.
2. Read every in-scope file and trace each user-controlled input (query
   params, hash, localStorage, upstream job data) to where it is used.
3. Probe `safeJoin` in `server/index.js` with traversal inputs: `../`,
   `%2e%2e/`, `..%2f`, `..\`, `%5c..`, `%00`, invalid percent-encoding, `//`.
4. Compute contrast ratios for the viz tokens.
5. Write each finding with file:line, a reproduction and a suggested patch.

## 5. Results
- 1 high, 5 medium, 11 low and 3 correctness findings, summarized in the table
  at the top of REVIEW.md.
- Checked and fine: static path traversal, upstream host pinning, the
  description sanitizer, hash parsing, chart/map DOM sinks, and the apply-link
  URL check.

## 6. Known gaps and follow-ups
- The "Re-check" pass at the end of REVIEW.md was not done because the agent
  stopped early. The lead re-checks after the fixes land.
- `public/features/compstimate.js` and `insights.js`, and `public/api.js`,
  did not exist at review time and were not reviewed.
- Fixes go to the owning workstreams (see lead.md change log).

## 7. Change log
- 2026-10-02 ~05:35 UTC: REVIEW.md written by the review agent.
- 2026-10-02: agent stopped on an API error; lead wrote this log from
  REVIEW.md.

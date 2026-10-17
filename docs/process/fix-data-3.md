# Process log: fix-data-3

## State
- **Done:** prompt saved; baseline build of f53a270 on the 2026-10-16 crawl (scratch `fd3/dist-base`).
- **In progress:** failing tests for D-38, MR-28, the no-row places, D-41, D-42, V-45, Town and Country, the
  Columbus alias and UX-32.
- **Next:** fixes in that order, one commit each, then the census before/after.

## 1. Brief
Prompt: [prompts/fix-data-3.md](prompts/fix-data-3.md). Data and backend fixes from beta round 3: the Google
Fellow levelled Intern and quarantined (D-38), minimums and shift-inclusive pay pooled as base pay (MR-28), Juice
at a place the posting gives no pay row (lead decision 2026-10-16), place names (D-41, D-42, V-45, Town and
Country, old "Columbus, OH" links) and raw department names (UX-32). Files: server/vet.js, server/geo.js,
server/sources/*.js (labels and departments), scripts/build-market.js, server/families.js (display names), the
location-key alias in public/app.js and one Juice line in the drawer.

## 7. Change log
- 2026-10-17 00:38 started on f53a270.

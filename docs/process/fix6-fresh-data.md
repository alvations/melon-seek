# Process log: fix6-fresh-data

## State
- Done: worktree on 53a03ec (branch head), data linked, prompt saved.
- In progress: building dist/ with today's crawl; reproducing the 5 red checks.
- Next: investigate D-23 (Microsoft "JO"), BP-10, BP-14, fix3-data TPUs tag, T20.

## 1. Brief
Prompt: [prompts/fix6-fresh-data.md](prompts/fix6-fresh-data.md). Five e2e checks went red on the
2026-10-16 crawl, and each is red on the unchanged head too. For each, decide from the data whether
the product or the test's assumption is wrong, and fix that one without weakening the check.
Files owned: server/keywords.js, server/geo.js, data/cities.json, public/features/comps.js, the
five checks' code in their e2e files, test/fix6-fresh-data.test.js, this log and the prompt.

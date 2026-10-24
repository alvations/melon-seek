# melon-seek beta: the to-do list

The user, 2026-10-24: "Every task gets pushed and resolved and documented and make sure every deployment is working
properly and keep track of ALL the todos and check them off the list." The lead updates this file at every push, as
docs/process/TODO.md, and at every checkpoint, as wip/TODO.md. Done items keep their SHA; open items say what's next.

## Fix wave 6 (persona wave 2, the round-4 backlog, CI)
- [x] Persona wave 2: five age groups reviewed on e800c43; logs pushed (5502155).
- [x] fix-salary-6: pay for 2+ countries keeps every line (S-1), plus the attachJuice follow-up. Pushed 3ff4cfa.
- [x] fix-juice-6: J-1..J-5 (tax row names, household wording, Monthly/Yearly kept, grade tips, graded place). Pushed 3ff4cfa.
- [x] fix-app-6: BN-1..BN-8 and V-44 (Location counts, currency medians, locale counts, hourly medians, set-aside places, minimums under a floor, two-level postings, typed currencies). Pushed 3ff4cfa.
- [x] fix-data-6: G-1..G-4, K-1, P-1..P-4, R-1..R-3, T-19, C-1. Pushed 3ff4cfa.
- [x] qa-ci-6: CI's 12 failures classified; tests pick cases from the data; offline e2e server; Playwright pinned; per-shard verdicts. Pushed 3ff4cfa.
- [x] fix-ui-6 B-1..B-12 (first card on the first screen, cover screen, Duo hinge, keyboard, map fit, tagline). Pushed 3ff4cfa.
- [x] ux-density-6: size matrix and density spec. Pushed a0763ec.
- [x] Gate 2 on 5de0efc; drift fixes d2c0fc6 (UX-17) and 36d8d81 (card vs job-page range after P-2); targeted re-run 68/68; npm 1,382/0. Pushed 3ff4cfa.
- [x] Deploy of 3ff4cfa: CI success; Pages deploy success (run 40108080735).
- [ ] WebKit phone checks on 3ff4cfa (run 40108087648): check the result.
- [ ] Sharded e2e CI on 3ff4cfa (run 40108089225): check the result. It should be green now that the CI-only causes are fixed.
- [ ] fix-ui-6 D-1..D-15, the density work for the user's iPhone mini request: picked by the lead into 8db98e3; gate 3 running. Then push, deploy, verify.
- [ ] Site watchdog after the deploy: the next scheduled run passes on the new deploy.

## Final checks (task #25)
- [ ] Mobile and desktop QA re-check on the wave-6 deploy, at every size in test/e2e/phone-sizes.mjs (VISIBLE and TABLETS too).
- [ ] Lead log entry for batch 2 (the density work) and the final QA.

## Housekeeping
- [x] Resume after any stop: three scheduled checks an hour (:12, :32, :52) read wip/LEAD-STATE.md; checkpoints run as a shell loop; lead scripts saved in wip/lead-tools.
- [x] Machine: heavy jobs queued through heavy.sh (3 slots); stale test temp folders cleared each tick.
- [ ] Retire the finished lanes' worktrees and wip/ folders after the final push (safe-to-delete.sh): fix-salary-6, fix-juice-6, fix-app-6, fix-data-6, qa-ci-6, fix-ui-6, lead-fix.
- [ ] Delete the three resume checks when the cycle is finished.

## Backlog: features the personas asked for (the user decides)
- [ ] Juice in the reader's own currency and terms (own rent, a nearby city's costs for suburbs).
- [ ] More households: a second earner, a single parent, a room in a shared flat.
- [ ] Search across all companies at once, or say where else a search matches.
- [ ] "Within N km", and states, provinces and counties as places ("IL" no longer matching Israel).
- [ ] Amazon's speed on phones (2.3–7 s for a switch or the full list).
- [ ] Part-time and four-day-week filters.

## Backlog: smaller fixes found along the way
- [ ] "Buenos Aires City", "Ho Chi Minh" and "Cracow" sit at their country's centre.
- [ ] "Yokohama-shi" and "Chiba-shi" listed beside "Yokohama" and "Chiba".
- [ ] Apple "US-Lead" titles still Senior; Japanese Amazon titles get no job family.
- [ ] Monroe Twp and Hamilton Twp, NJ at New Jersey's centre (two townships of each name).
- [ ] Keyword tags that don't fit the job (FP&A on an account executive, GPUs on an ITIM lead).
- [ ] Tests should remove their own temp folders (2,783 left in /tmp by 2026-10-24).
- [ ] One-level Microsoft chips name the posted level only after the posting's text loads.

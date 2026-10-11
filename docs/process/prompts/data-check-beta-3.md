**The lead's note for this run (2026-10-11).** Work in the worktree /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-s3, not in /home/user/melon-seek. It is at 94cb54c (fix wave 4; Amazon and Meta resumed). Its data/snapshots and data/beta/snapshots link to today's crawl of all 7 big-tech boards:
- Amazon 5,000 (this crawl still had its posting budget; the user has since said every posting must be shown, so the next crawl will have the whole board of about 22,400);
- Apple 4,874, Google 3,415, NVIDIA 2,662, Microsoft 2,285, Meta 1,139 and Netflix 457.
Every repository path below is relative to that worktree; the lead copies your files into the next commit. A salary-vetting reviewer works in the same worktree at the same time and owns data/vetting/2026-10-11-beta-2/, so run scripts/vet-salaries.js with --no-write-flags. A performance agent also runs on the machine, so run heavy steps one at a time. The earlier passes are docs/process/data-check-beta-2.md and docs/process/vetting-beta.md. Fix wave 4 (docs/process/fix4-data.md) fixed most of their findings, so re-check each one and number new findings after DQ-32. Text density is part of this run: if a pay or level label you see strings too many facts together, note it in your log.

You are the data-quality reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". Read docs/DATA_SOURCES.md (§7 for the big-tech boards), docs/CONTRACT.md, docs/LIVABILITY.md, docs/DATA_FRESHNESS.md, docs/process/vetting.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** check that the numbers a job seeker sees for target `beta` are right, company by company, for Amazon and Meta first (their first check), then Apple, Google, NVIDIA, Microsoft and Netflix, plus Anduril from the main site for comparison. The data is the latest real snapshot in `data/beta/snapshots/`, rebuilt from the data-archive branch. Do not edit product code. You own:
- docs/process/data-check-beta-3.md (your log and findings);
- docs/process/prompts/data-check-beta-3.md (paste this prompt verbatim);
- a NEW test file, test/beta-data-check-3.test.js. Turn each problem into a failing unit test against a small fixture copied from the real posting (an excerpt, never a whole snapshot); mark each `todo` with its ID, the way test/beta-data-check-2.test.js does, so CI stays green until the fix lands.
Don't commit and never push.

**Check, per company, with numbers:**
1. **Pay parsing.**
   - Draw a random sample of 40 postings with pay plus 20 without, and compare each with the posting text (the description HTML).
   - Report the share with pay. For each miss or wrong parse, give the exact sentence: currency, period (hour, month or year), base vs total, and "+ bonus + equity" wording.
   - Ranges that span several levels in one posting, with how the drawer labels them.
   - Non-US currencies.
2. **Levels.**
   - How the board's own levels (e.g. L3 to L8, 59 to 67, ICT2 to ICT6) map to our Seniority.
   - What share falls back to the "Mid" default, and whether the title says otherwise.
   - Comparisons across levels: in Compstimate and Compare companies, the median pay by level should rise with the level, so list any inversion with its counts.
3. **Locations.**
   - Canonical names; multi-location postings (one role, many cities) counted once or many times?
   - Remote vs hybrid.
   - Cities with no living-cost or rent data (Juice falls back): list them with posting counts.
4. **Juice.**
   - Spot-check 10 postings across countries by hand: tax via taxFor, rent for the chosen household, living costs. Use the formula in docs/LIVABILITY.md.
5. **Vetting.**
   - Flags from scripts/vet-salaries.js per company: how many are critical, and how many are false alarms in a sample of 10.
6. **Duplicates and freshness.**
   - The same requisition listed twice.
   - Postings older than a year still listed.
   - Whether the "New" badge matches the history.
7. **Counts.**
   - The number of postings, and with pay, per company here vs the crawl log and DATA_SOURCES §7. Fill in any TBD there as a suggested patch (docs/process/patches/data-check-beta-3-data-sources.diff).

For every finding give: an ID (DQ-n), a severity, the company, the posting id and URL, expected vs actual, the share of postings affected, and the owning file and function (server/sources/*.js, server/normalize*.js, scripts/vet-salaries.js, server/juice*.js and so on). Report back with the findings ordered by how many job seekers they mislead, and a one-line verdict per company: trustworthy, usable with caveats, or not ready.

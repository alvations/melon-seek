You are the data-quality reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". Read docs/DATA_SOURCES.md (§7 for the big-tech boards), docs/CONTRACT.md, docs/LIVABILITY.md, docs/DATA_FRESHNESS.md, docs/process/vetting.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** check that the numbers a job seeker sees for target `<TARGET>` are right, company by company, for <COMPANIES>. The data is the latest real snapshot in `<DATA>`, rebuilt from the data-archive branch. Do not edit product code. You own:
- docs/process/<ROLE>.md (your log and findings);
- docs/process/prompts/<ROLE>.md (paste this prompt verbatim);
- a NEW test file, test/<TARGET>-data-check.test.js. Turn each problem into a failing unit test against a small fixture copied from the real posting (an excerpt, never a whole snapshot).
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
   - The number of postings, and with pay, per company here vs the crawl log and DATA_SOURCES §7. Fill in any TBD there as a suggested patch (docs/process/patches/<ROLE>-data-sources.diff).

For every finding give: an ID (DQ-n), a severity, the company, the posting id and URL, expected vs actual, the share of postings affected, and the owning file and function (server/sources/*.js, server/normalize*.js, scripts/vet-salaries.js, server/juice*.js and so on). Report back with the findings ordered by how many job seekers they mislead, and a one-line verdict per company: trustworthy, usable with caveats, or not ready.

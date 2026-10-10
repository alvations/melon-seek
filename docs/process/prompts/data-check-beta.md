You are the data-quality reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". Read docs/DATA_SOURCES.md (§7 for the big-tech boards), docs/CONTRACT.md, docs/LIVABILITY.md, docs/DATA_FRESHNESS.md, docs/process/vetting.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** check that the numbers a job seeker sees for target `beta` are right, company by company, for Apple (6,105 postings), Google (3,417), NVIDIA (2,664), Microsoft (2,320) and Netflix (456), plus Anduril (2,491) for comparison. The data is the latest real snapshot in `data/beta/snapshots/ (plus the stable boards in data/snapshots/)`, rebuilt from the data-archive branch. Do not edit product code. You own:
- docs/process/data-check-beta.md (your log and findings);
- docs/process/prompts/data-check-beta.md (paste this prompt verbatim);
- a NEW test file, test/beta-data-check.test.js. Turn each problem into a failing unit test against a small fixture copied from the real posting (an excerpt, never a whole snapshot).
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
   - The number of postings, and with pay, per company here vs the crawl log and DATA_SOURCES §7. Fill in any TBD there as a suggested patch (docs/process/patches/data-check-beta-data-sources.diff).

For every finding give: an ID (DQ-n), a severity, the company, the posting id and URL, expected vs actual, the share of postings affected, and the owning file and function (server/sources/*.js, server/normalize*.js, scripts/vet-salaries.js, server/juice*.js and so on). Report back with the findings ordered by how many job seekers they mislead, and a one-line verdict per company: trustworthy, usable with caveats, or not ready.

Notes from the lead (2026-10-10):
- Beta data is today's first full big-tech crawl (snapshot.yml run 38044091555), rebuilt from the archive into data/beta/snapshots/. The stable boards are from 11:42 UTC.
- This sandbox cannot reach the job boards or the map tile server. A badge falling back to the bundled snapshot and grey map tiles are expected; don't report them. The big-tech boards are `live: false`, so for them the badge should say Snapshot and no live request should be made. Do check that.
- A persona review of the main site has already found these, and fix lanes are fixing them right now in separate worktrees:
  - sales on-target earnings shown as base pay;
  - Compstimate naming a city or level its comparables don't have;
  - "Mid" for titles that name no level (being relabelled "Level not stated");
  - the "intern" substring search, the salary box dropping "£80,000" and "80k", and Juice using the best city instead of the filtered one;
  - the map cluster label, and US pay on Sydney pins;
  - Victoria BC as Australia;
  - Compare companies mixing internships;
  - "Same role elsewhere" families;
  - rent dates and "(update due)";
  - the text bugs ("≈ $44K–44K", "0% percentile", repeated departments);
  - company switch wiping filters, jargon, and saved searches being hard to find.

  The list is in docs/process/lead.md ("Persona review of the main site"). Don't re-file those; reference them as "known (P-n)" if you see them. Spend your time on what is new or specific to the beta boards and their size.
- The build warns that Apple's list is 2.55 MB (budget 1.50 MB). Note what that costs a user, but a performance agent will measure it later.
- Make your folder /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/data-check-beta/ for pid files and builds. Other agents run at the same time (the machine has 4 CPUs), so keep at most one browser open at a time and close it when idle.
- Fill DATA_SOURCES §7's TBD columns from this crawl, as a patch. The postings per company are in data/beta/snapshots, and the crawl log is snapshot.yml run 38044091555. Take the numbers from the files, not from memory.
- Check scripts/vet-salaries.js's clause splitting on the big-tech pay sentences: a "U.S." abbreviation ending a clause, and "+ bonus + equity" after a range. Earlier work changed server/salary.js for both, so check that the vetting script agrees.
- Every build (stable and beta) ships 79 `demo-scaleai-*.json` description files under api/desc/scaleai/, next to 183 real ones. Find out why, and whether a user can ever see a demo posting for a real company.

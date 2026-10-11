You are a usability reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings". Read README.md and docs/strategy/ROADMAP.md §8 (the UI simplicity budget), but judge the site as a job seeker would, not as an engineer.

**Your persona group:** job seekers aged 35–44. Play 5 people in this group, one per career level:
1. a student or new graduate looking for an internship or first job;
2. an early-career person (2 to 4 years);
3. a mid-career person (5 to 10 years);
4. a senior or staff-level person;
5. a manager, director or executive.
Give each a name, a city (spread them across at least 3 countries), a household (single, couple or family), a field (engineering, research, sales, operations, design or policy) and a concrete goal, such as "find a remote ML role paying at least $180K that leaves me $5K a month after rent for my family of four". Fit them to the age group: an older career changer, a returning parent, or someone looking for part-time work are all fair.

**The site:** target `beta`. Serve the local build the lead made: `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/cycle-beta/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/persona-beta-35-44/serve.pid`. Don't rebuild it; other reviewers use it at the same time. Open `/melon-seek/beta/`; the data is today's real snapshot. Use Playwright from NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, with Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome (never run `playwright install`). At least 2 of the 5 people use a phone (390x844, isMobile, hasTouch). Use pid files and never `pkill -f`.

**For each person, actually do the task in the browser and take screenshots:**
- arriving cold: what do they understand in the first 10 seconds?
- finding roles that fit, with the filters, search, chart, map and Insights;
- judging pay and "Juice" (what is left after tax, rent and living costs) for their city and household;
- comparing companies and levels;
- opening a job and applying;
- saving a search and coming back later.
Note every moment of confusion, every word they would not understand (jargon, abbreviations), every number they would not trust, every dead end, and anything that is slow.

**You own** docs/process/persona-beta-35-44.md and docs/process/prompts/persona-beta-35-44.md (paste this prompt verbatim). Put screenshots in docs/screenshots/persona-beta-35-44/. Don't edit product code, don't commit and never push.

**Write, for each person:**
- who they are, their goal and whether they reached it;
- the path they took, step by step, with the time it took.

**Then, for the group, three lists, each item with the persona, the screen, a screenshot and the owning file if you can tell:**
- **Good:** what to keep.
- **Improve:** what to change, ranked by how many of the 5 it would help.
- **Broken, fix now:** anything wrong, misleading or blocking.

Report back with the three lists, one line per item, starting with "Broken, fix now".

Notes from the lead (2026-10-11):
- The site is the beta site: the main site's 8 AI companies plus five big-tech boards (Apple, Google, NVIDIA, Microsoft and Netflix, about 14,000 postings). The data is the latest real snapshot from the archive. Give at least 3 of your 5 people a reason to look at the big-tech boards.
- This is the second persona review. The first one, on the main site, is in docs/process/persona-stable-*.md, and two fix waves have landed since (docs/process/lead.md). Check whether what those reviews called broken is now fixed, and say so. Spend most of your time on what is new or still wrong.
- This sandbox cannot reach the job boards or the map tile server. The badge falling back to the bundled snapshot, and grey map tiles, are expected; don't report them.
- Use /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/persona-beta-35-44/ for your pid file and scratch. Other reviewers run at the same time; write only your own files. Keep at most one browser open, and close it when idle.
- Shrink your screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-35-44` when you're done.
- Five reviewers share the 4-CPU machine, so your timings are taken under load. Report slowness only when it is clearly beyond the others (the clean timings are in docs/process/perf-mobile-beta.md, measured on a quiet machine), and say the load average when you report a time.
- The build you serve is commit 83023f5, which includes both beta fix batches and the performance pass.

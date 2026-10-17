You are the fix-pay-at-place fixer for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app. You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (head df35a46 or later).

Read:
- docs/CONTRACT.md (salary, salary.ranges[].locations, payLocations)
- docs/DATA_SOURCES.md §7a ("Several ranges by location" and "Every posted row is kept", including the lead decision about places with no row of their own)
- docs/process/PLAYBOOK.md ("Checkpoints", "Known traps")
- docs/process/TEMPLATE.md
- docs/process/salary-audit-backend.md and docs/process/salary-audit-data.md (SA-5)
- the newest sections of docs/process/lead.md

**The problem.** Since the salary audit, Amazon and Microsoft postings carry one posted range per place (`salary.ranges[]` with `locations`). Only some views use it. The cards, Juice and the chart under a Location filter (SA-5) pick the place's own row. Every other view prices a place at the posting's headline range (`salary.min/max/mid`), which is often another city's row. Round-3 reviewers confirmed all of these on the 2026-10-16 crawl:
- **V-36 (High), chart.js renderClusters, Group by Location.** A place's row uses the headline range. 896 Amazon postings are drawn at another city's range: Nashville reads "352 roles · median $129K" against its own $116.4K, and Jersey City $180.7K against $198.7K. Microsoft Mountain View reads $209K against its own $246.1K; New York $191K against $219K.
- **V-37 (High), chart.js groups() in Ranges with Group by Location.** Rows are keyed by primaryLocation with no check that the pay covers the row. Google London reads "median $253K" from US ranges posted for Mountain View/NY; Zurich "median $84K" is EUR ranges; NVIDIA Munich "median $96K" is a Warsaw PLN range. V-18 (pay for another country) was fixed in Clusters only.
- **V-39 (High), app.js stats line and map.js summarize()/midUSD().** Under `#c=microsoft&l=Mountain%20View` the chart caption reads $197K, the stats line $177K and the map pin $177K. Unfiltered map pins are also priced at headline ranges: Microsoft Mountain View $191K against $219K, New York $191K against $219K, SF $180K against $211K; Amazon SF $181K against $191K, Cupertino $194K against $208K.
- **V-40 (High), features/compstimate.js buildIndex (salaryUSD) and features/insights.js hotLocations (midOf).** Compstimate prices Microsoft "Software Engineer" in New York at $120K–235K (mid $177K) from Redmond-range comparables; their own NY ranges give $211K. Amazon SDE in NY: mid $169K against NY's own $186K. Insights hot locations show the same gaps.
- **UX-37 (High), app.js drawerContent `.d-sal-amt`.** For a posting with a range per place, the drawer headline shows one place's row with no place named, and it disagrees with the card. amazon:10371179: the card reads "$60K–129K · 4 places", the drawer "$83K–117K" (Bellevue's row). The percentile and the strip also use Bellevue's midpoint. Microsoft microsoft:1970393556650765: the card reads "$102K–261K · 2 places", the drawer "$102K–235K". Fix: show the card's span with "· N places", or name the row ("Bellevue $83K–117K"); the Details says which place the percentile and strip use.
- **V-35 (Medium), chart.js buildRow.** 2,201 Amazon and 236 Microsoft bars are striped as "several levels or places", but each is one place's posted range: buildRow stripes any truthy p.span, including span === false. The tooltip never says which place a bar is for.
- **MR-34 (Medium), app.js:4120 payLabels "Several pay ranges" chip.** It says "this is the span of all of them" while the figure is one range: Microsoft 923, Amazon 63, Google 32.
- **Lead decision (DATA_SOURCES §7a, 2026-10-16).** A place the posting lists but prices with no row of its own has no posted pay there: no Juice for that place, and it is never scored on another place's row. The card still shows the posting's range. This affects 7 Amazon postings on the 2026-10-16 crawl. Apply it everywhere the helper is used.

**Fix.**
1. Add ONE shared helper in public/features/shared.js, e.g. `payAt(job, place)`. It returns the posted range for that place: the row whose `locations` include the place, or the posting's range when it is a single range that covers the place. It returns null when the posting prices other places but not this one, or when the pay is another country's (payLocations / payCoversRow rules). Include the basis, so captions can say "pay posted for <place>".
2. Use it everywhere a view prices a place: chart.js (Clusters and Ranges, Group by Location and under a Location filter, keeping SA-5), map.js pins, the app.js stats line under a Location filter, Compstimate's index, Insights' hot locations and the drawer's percentile/strip. All views must then agree on the same numbers under the same filter.
3. Fix V-35's striping (only real level spans and true multi-place spans are striped) and MR-34's chip wording.
4. Fix UX-37's drawer headline as described, following the one-line rule (fix-density: one short line, the rest under the existing "Details" from public/viz/note.js).

**Ownership and coordination.** Another lane, fix-touch-tips (agent ab71eae8dc63a1104), is editing the tooltip open/close/position code in comps.js, chart.js, map.js, app.js, features/shared.js and styles.css. You own the PAY computation in those files: chart.js row building, grouping and pay picking; map.js summarize/midUSD; the app.js stats line, drawer headline, percentile/strip and payLabels; compstimate.js; insights.js. Don't touch tooltip open/close/position code; send fix-touch-tips a SendMessage if you must edit near theirs. You may add the helper to features/shared.js (keep createTooltip untouched). Also yours:
- tests: a NEW test/fix-pay-at-place.test.js (helper unit tests on synthetic postings) and a NEW test/e2e/fix-pay-at-place.e2e.js, registered in scripts/e2e.js. Encode V-36, V-37, V-39, V-40, UX-37, V-35 and MR-34 as tests that fail before and pass after, and add an agreement test: chart caption = stats line = map pin under one Location filter.
- docs/process/fix-pay-at-place.md (log in TEMPLATE.md structure, `## State` at the top)
- docs/process/prompts/fix-pay-at-place.md (this prompt pasted verbatim)
- screenshots in docs/screenshots/fix-pay-at-place/ (shrunk with scripts/cycle/shrink-screenshots.sh)
- a CONTRACT note on payAt

**Data and tools.**
- Today's crawl: /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots; never commit them.
- Build: `node scripts/build-static.js`. Serve: `node scripts/cycle/serve.mjs --dist dist --pid <pidfile>`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never `playwright install`; no `pkill -f` / `pgrep -f`.
- Give every server, browser or test command a timeout; an earlier lane stalled for hours.

**Rules.**
- Never cut or hide postings. Show pay as posted. Plain words.
- Keep perf: no extra full passes over Amazon's 22,179 postings on the main thread beyond what's needed. Measure the chart and stats time on Amazon before and after.
- Commit small and often with explicit paths. Send the lead each finished, tested piece by SendMessage to "main". The lead checkpoints your worktree every 15 minutes. Never push.
- Before you send any SHA:
  - `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved OUT of data/ (CI has none) passes. S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
  - The full e2e with data linked shows no new failures; then `git checkout -- docs/screenshots` for any it rewrote outside yours.

Report:
- before/after numbers for each finding;
- the helper's API;
- SHAs, tests and screenshots.

---

Follow-ups from the lead during the lane (verbatim):

1. "Lead to fix-pay-at-place: three QA findings from round 3 are in your scope. Fold them into your lane if they fit, and add a red test for each first.
1. qa-desktop-beta-3: Amazon "· N places" counts ranges, not places. 28 Amazon postings show "· 2 places", and up to "· 4 places", when the rows are one place or all Remote. Example: amazon:10568868 "$56K–94K · 4 places". Its drawer reads "Pay by place: Remote $70K–94K · Remote $56K–94K · Remote $62K–94K · Remote $80K–94K", but the posting gives CA, IL, NJ, NY, VA, WA. Two causes:
   - server/sources/amazon.js amazonSalary label() turns virtual rows with remote locations into "Remote", so the state is lost, and it gives one place's two rows the same label;
   - app.js payPill counts rs.length as places.
   Rule: never drop a row. Each posted row stays, labelled with its own place (e.g. "Remote (CA)"). The pill counts distinct places.
2. qa-mobile-beta-3: a "· N places" card opens a job page headed with another figure, and no place is named. Amazon 10371179: card "$60K–129K · 4 places", page "$83K–117K" (Bellevue's row). Also Amazon 10371388 (card $148K–220K, page $148K–200K) and Microsoft 1970393556650765 (card $102K–261K, page $102K–235K). The page heading should match the card's span, or name the place it shows.
3. qa-desktop-beta-3: a term (internship) or part-time hourly posting never shows Pay by place. amazon:10502807 "Loss Prevention Specialist Intern 2027" reads "$44,115 a year" for 8 places, while Mt Juliet's own posted pay is $39,695. Causes: the app.js payPill term branch runs before payRanges, and drawerContent has `term || partHourly ? null : payPlacesLine`.
If any of these is outside what you can finish, say so in your log and I'll put it in the fix wave. Don't push; I integrate."

2. "Lead to fix-pay-at-place: two updates.
1. The user, 2026-10-16: "Make sure we check for all phone sizes from iPhone mini to razr to duo or something". Check your card and drawer pay changes on every size in test/e2e/phone-sizes.mjs (on the branch at a92a3c8), from 280x653 to the Duo spanned at 1114x720, plus the Razr cover at 352x355. At 280 px the pill and title must still fit.
2. Also yours, since you're changing payPill: UX-52 (ux-review-beta-2). The "· 2 levels" and "· N places" suffixes take 154–179 of 366 px on a phone, so titles wrap to 4–5 lines, and the suffix is in pay green, so it reads as part of the money. Put the range alone in the pill and "2 places" or "2 levels" as a muted line under it. Screenshot: /home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19/docs/screenshots/ux-review-beta-2/card-microsoft-places-p390-light.png.
D-45 / M-42 (the drawer headline must match the card's span or name its place) and D-39 / D-40 are already with you. Please also send a short status: what's done, what's left."

3. "Lead to fix-pay-at-place: good progress. One check before you gate. The "Remote (CA)" labels are made in server/sources/amazon.js, which runs at crawl time, but the beta site is built from today's stored snapshots. Make sure the fix shows on a build from the existing data/beta/snapshots (through upgradeStoredJobs, or at build/normalize time) and doesn't wait for the next crawl. Your e2e should assert it on the built site: amazon:10568868 shows one label per state, and its "· N places" equals the number of distinct places. As always, no posted row may be dropped or merged away: the count of rows per posting must equal the posting's own. Then gate and send the SHA."

4. "Lead to fix-pay-at-place: (a). Keep DQ-33: identical posted figures are one range that lists every place it was posted for. Assert that the places listed equal the posting's rows' places (6) and that the ranges equal its distinct posted rows (4). Every row's place and figure must stay visible, and that is what "never cut" means here. Also yes: remove the 60-character cut on labels, so no place name is hidden. Where a long list must stay compact, wrap it or put the rest behind Details, never an ellipsis. Gate and send the SHA."

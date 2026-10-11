You are the data-visualisation reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": a company's job board plotted on a salary-range chart (default) or a map, with a Juice Score (pay left after tax, rent and living costs), a comps chart in the job drawer, Compstimate and Insights. Read docs/CONTRACT.md (the chart and map sections), docs/process/viz.md and docs/process/fix-viz.md (how the charts were built and last fixed), docs/LIVABILITY.md, docs/METHODOLOGY_GUIDE.md, docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and <PREVIOUS>. The code is public/viz/chart.js, public/viz/map.js, public/viz/palette.js, public/viz/viz.css and the chart helpers in public/features/.

**Your job:** check that every chart and map in target `<TARGET>` (`<PATH>`) encodes the data honestly and readably, with real data for <COMPANIES>. Do not edit product code. You own:
- docs/process/<ROLE>.md (your log and findings);
- docs/process/prompts/<ROLE>.md (paste this prompt verbatim);
- screenshots in docs/screenshots/<ROLE>/ (run `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/<ROLE>` before you report);
- a NEW test file, test/e2e/<TARGET>-viz-review.e2e.js, registered the way scripts/e2e.js registers the others. Every reproducible problem gets a test that fails now and will pass once it is fixed, with the finding ID in its name, e.g. `[V-3]`.
Don't commit and never push.

**Setup:** serve the build the lead made: `node scripts/cycle/serve.mjs --dist <DIST> --pid <SCRATCH>/<ROLE>/serve.pid`. Don't rebuild it. Playwright: NODE_PATH=<SCRATCH>/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome; never run `playwright install`. Desktop 1440x900 and 1024x768, phone 390x844 (isMobile, hasTouch), light and dark. Use pid files; never `pkill -f` or `pgrep -f`. Read the same numbers from the data (the bundled snapshot files under <DIST>, or `<DATA>`) so you can compare what is drawn with what is true.

**Check, with numbers and a screenshot for each finding:**
1. **Salary chart.**
   - Axis: scale, ticks, currency, units (a year, an hour), and whether hourly, monthly, fixed-term and part-time pay are put on the same yearly footing as the label says.
   - Bars: a range bar's ends match the posting's min and max (check 10 postings by hand per company). Ranges that span several levels, estimates and on-target earnings are drawn differently from a posted base range, and the legend says how.
   - Clusters, Ranges and Group by: cluster sizes add up to the result count; group medians match a hand calculation (use base pay only, not on-target earnings).
   - Overflow markers, very long lists (Apple, about 4,880 roles): scrolling, virtualisation, labels that collide.
   - Postings with pay posted for other countries only: are they plotted, and with which currency?
2. **Map.**
   - Pins at the right place for 15 sampled locations (including non-US cities and local names). Pin counts per place add up to the filtered count; a multi-location posting is counted as the docs say.
   - Pay|Juice colour scale: legend matches the colours; the scale is perceptually ordered; it works for red-green colour blindness (simulate deuteranopia and protanopia, e.g. with a CSS filter, and screenshot).
   - Tooltips, area chips, Remote, clustering at each zoom level, the map after resizing with the drawer open.
3. **Juice waterfall and comps chart in the drawer.** The bars add up to the total shown; Monthly/Yearly and household switch the numbers consistently; the comps chart's cells match docs/LIVABILITY.md and the market data.
4. **Compstimate and Insights charts.** Percentile bands, the "same country" comparison, level ordering (median should rise with level), small-sample warnings.
5. **Colour and contrast.** Measure contrast of marks against the background in both themes (3:1 for graphics, 4.5:1 for text labels). Company colours that clash or are too close.
6. **Performance of drawing.** Time a filter change, a sort, Group by and a zoom on the largest board; anything over 200 ms on desktop is a finding.

For each finding write: an ID (V-n, numbered after the highest V ID in docs/process/viz.md, docs/process/fix-viz.md and <PREVIOUS>), a severity (High: a wrong or misleading number; Medium: hard to read or inconsistent; Low: polish), the view, exact repro, expected vs actual with the numbers, a screenshot, and the owning file and function. Say what works too. Also run `npm test` and the full e2e suite, and report the results.

Report back with the findings ordered by how many job seekers they would mislead, one line each, and the suite results.

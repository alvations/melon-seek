# Prompt: Compstimate task force (investigator)

Verbatim task prompt given to the investigator agent:

```
You lead investigation and specification for the Compstimate task force on melon-seek (/home/user/melon-seek), "the Zillow of job postings". Compstimate is the app's Zestimate-style pay estimate:
- logic in public/features/compstimate.js (estimateComp, compstimateForJob, queryFromState, backtest, accuracy helpers, createCompstimateWidget);
- wiring in public/app.js: the Insights tab widget, plus the drawer estimate shown for postings with no salary.

The user reports: "the comp estimate feature looks incoherent when the user clicks and selects the filters."

Your job is to find out exactly what's incoherent, and to define the correct behaviour. Don't fix product code. You own only docs/process/compstimate-taskforce.md (the investigation, spec and test matrix; follow the docs/process/TEMPLATE.md structure) and docs/process/prompts/compstimate-taskforce.md (paste this prompt verbatim). Don't commit. The product agent fixes the code and QA writes the tests, both using your spec.

1. **Reproduce** on the real server: `PORT=<free port> node server/index.js` with the local data/snapshots. Use Playwright: Chromium is in /opt/pw-browsers, and a scratchpad copy of playwright is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw. Never run `playwright install`. Click through these combinations, in Insights and in the drawer:
   - company switches;
   - department, location, seniority and remote filters;
   - skill, responsibility and fit chips;
   - the salary slider;
   - search text;
   - "Same role elsewhere" switches;
   - opening a job, then changing filters;
   - typing in the widget's own fields after filters are set;
   - Back/Forward;
   - clearing filters.
   For each step, record the widget's inputs (title, level, location), its output (estimate, range, confidence, n, comparables, accuracy line) and what a user would expect. Look for:
   - stale values;
   - widget fields fighting the filters (overwritten on every render, or never updated);
   - estimates computed from all jobs vs the filtered set, applied inconsistently;
   - comparables that don't match the filters;
   - confidence or n that contradicts what's shown;
   - an estimate that changes when unrelated filters (salary) change;
   - a drawer estimate that differs from the Insights estimate for the same role;
   - FX/currency mixing;
   - flicker or double renders;
   - the accuracy line unchanged after a company switch;
   - copy or labels that contradict the behaviour.
   Read compstimate.js and the relevant app.js code to explain the root cause of each problem.
2. **Spec** (keep it simple, per docs/strategy/ROADMAP.md §8). Write a short, unambiguous behaviour spec covering:
   - which pool of jobs the estimate uses: the whole board, or the board narrowed only by "role-defining" filters such as location, seniority and department, but never by the salary filter;
   - how filters prefill the widget's fields, and what happens once the user edits a field (a field the user edited sticks until they reset it; show one "Reset to filters" link);
   - what the drawer shows, and that it always matches Insights for the same query;
   - when to show "not enough comparable roles";
   - which text explains the basis ("Based on N similar roles at <company>, <filters>").
   Include a state table: filter change → widget fields → pool → output.
3. **Test matrix:** a list of concrete Playwright scenarios with expected outcomes, for QA to automate.

Report back briefly: each incoherence, with its root cause and file:line, and the spec's key rules.
```

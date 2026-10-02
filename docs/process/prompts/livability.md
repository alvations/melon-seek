# Prompt: livability (cost-of-living and Juice Score engineer)

Verbatim task prompt given to the livability agent:

---

You are the livability and cost-of-living engineer on melon-seek (/home/user/melon-seek), "the Zillow of job postings": company job boards plotted by salary on a chart and a map. Read docs/CONTRACT.md, server/geo.js (the city gazetteer: names, countries, coordinates) and server/normalize.js first. Other engineers are editing server/ (backend), public/app.js etc. (UX) and public/viz/* (viz) concurrently, so don't edit their files. You own: data/cities.json, server/juice.js, scripts/update-col.js, test/juice.test.js, docs/LIVABILITY.md, .github/workflows/col-refresh.yml, plus your process log docs/process/livability.md (follow docs/process/TEMPLATE.md) and docs/process/prompts/livability.md (paste this prompt there verbatim). Don't commit; the lead does.

User's request: "an up to date database of cities and cost of living and rent, Big Mac index etc., something that we can compare how much it costs to live there vs how much the salary is paying, and calculate a 'live-ability' score, named with some melon pun but still evidently livability $$$ related."

1. Name. Default: "Juice Score": what's left after the rind (rent, taxes, living costs) is peeled off. Always show it with a clear subtitle like "livability $: what's left after living costs". If you have a clearly better melon pun that is still obviously about money and livability, use it and record why in your log.

2. City dataset, data/cities.json. Cover every city in the server/geo.js gazetteer that appears in the demo data or is a major tech/defense hub (at least the ~60 most relevant; more if you can source them). Per city: key matching geo.js city plus country, name, country (ISO alpha-2), currency, rent1brCenterUSD (monthly), rent1brOutsideUSD, costIndex (NYC = 100, excluding rent), bigMacUSD (the country's Big Mac price in USD), plus whatever simple tax inputs the formula needs (see 3), and a per-field `sources` object with source name, URL and as-of date. Data rules:
   - Use public, citable sources found with WebSearch / WebFetch (load them via ToolSearch "select:WebSearch,WebFetch"). Many hosts are blocked by the sandbox egress policy; don't try to bypass that.
   - The Economist publishes its Big Mac index data openly on GitHub (TheEconomist/big-mac-data). Check its license and use the latest release.
   - For rent and cost indexes, prefer open or official data: national statistics offices, Zillow ZORI for US metros, government housing reports, etc. Where only commercial aggregators exist, use figures quoted in public reporting with attribution. Don't copy a whole proprietary dataset.
   - Every number must have a source and an as-of date. If you have to estimate, mark `estimated: true` and explain the method in LIVABILITY.md. Never present an estimate as sourced.
3. server/juice.js. Pure ES module, browser-safe (no node: imports, no process): it is also loaded in the browser by the GitHub Pages build.
   - Export `computeJuice(salaryUSD, cityRecord)`. It returns { gross, tax, rent, living, net, score (0–100), rentBurden (rent ÷ after-tax pay), bigMacs (net ÷ bigMacUSD, i.e. how many Big Macs the leftover buys), grade e.g. "Juicy" / "Ripe" / "Dry" }.
   - Tax: a simple, documented effective-rate model per country (and US state where it matters, e.g. CA, NY, WA, TX). Approximate is fine, but document the brackets and sources.
   - Living cost: costIndex × a documented single-person annual baseline basket for NYC.
   - Score: map net disposable income to 0–100 on a documented scale (e.g. log-scaled between fixed anchors) so it is stable across companies.
   - Also export `attachJuice(job, cities)`. It adds `job.juice = { best: {...computeJuice, city}, byLocation: [{ locationName, ...computeJuice }] }`, or null when there's no salary or no matching city. Use salary.mid; for non-USD salaries use the FX table in public/viz/palette.js (import it or copy it with attribution). Also export `findCity(location, cities)`, matching by city + country with aliases.
4. scripts/update-col.js (`node scripts/update-col.js`): refreshes the fields that have machine-readable open sources (at least the Big Mac CSV from GitHub raw) into data/cities.json, keeps the other fields, and updates the as-of dates. .github/workflows/col-refresh.yml runs it monthly plus workflow_dispatch and commits changes, modeled on .github/workflows/snapshot.yml.
5. test/juice.test.js: cover the formula, findCity matching for every city the demo data uses (import server/demo.js), and data integrity (every numeric field has a source and date).
6. docs/LIVABILITY.md: the formula, tax model, anchors, data sources table, limitations ("an estimate, not financial advice") and how to refresh.
7. Report back the exact integration points so the lead can hand them to the other engineers:
   - the backend calls attachJuice in normalize, and /api/cities serves data/cities.json;
   - the static build copies juice.js and cities.json;
   - UX: juice badge on cards, sort by Juice, a Juice filter, a drawer waterfall (gross → tax → rent → living → juice);
   - viz: map pins colored by Juice.
Keep the report brief. Run `node --test test/juice.test.js`.

---

Mid-task message from the coordinator (also verbatim), sent after a session-limit interruption:

> You were interrupted by a session limit; it has reset. Resume where you left off (you were checking tax systems for Germany, the Netherlands, Japan and India after confirming Canada, UK, Ireland and Australia). Keep the sources and as-of dates for everything. Note: a vetting agent is adding `salary.kind` and `salary.source` and quarantining outlier salaries (`salary: null` plus a `salaryFlag`), so attachJuice must skip jobs whose salary is null and use salary.mid as before. Finish the dataset, juice.js, the tests, LIVABILITY.md and the process log, then report the integration points.

Second mid-task message from the coordinator (verbatim):

> Follow-up on the Juice Score, from the strategy review (docs/strategy/ROADMAP.md §7.1 F8 and §9 D6):
> 1. Guardrails: every computeJuice result carries its inputs (rent, tax and cost-index values, each with source and as-of date) and a `confidence` of "high", "medium" or "low". Non-US cities are "low" unless the figure comes from an official or open source. Support an optional user-edited rent override: `computeJuice(salary, city, { rentOverrideUSD })`.
> 2. IMPORTANT: the strategy research says Numbeo's terms of use forbid reuse of its data (ROADMAP source S67). Please check Numbeo's terms yourself (WebSearch) and record what you find. If reuse isn't allowed, prepare a plan that replaces every Numbeo figure with open or official sources: HUD Fair Market Rents and BEA Regional Price Parities for the US, ONS/Eurostat/national stats elsewhere, and The Economist Big Mac data as a fallback price index. Where no open source exists, mark the city "low confidence" or drop it. Don't delete data yet; I'll put the decision to the user. Report what the terms say and the size of the replacement work.
> Log it in docs/process/livability.md.

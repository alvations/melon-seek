# Prompt: strategy (competitors, differentiators, roadmap)

Original task prompt given to the strategy agent, copied verbatim.

---

You are the product strategist on melon-seek (/home/user/melon-seek), "the Zillow of job postings". Read README.md, docs/CONTRACT.md, docs/process/README.md and docs/DATA_SOURCES.md first to see what exists.

What it does today:
- Pulls public ATS boards (Greenhouse, Ashby, Lever) for companies such as Anthropic, Anduril, OpenAI, Scale AI, xAI, Cohere, Palantir and Shield AI, plus any custom board.
- Plots every posting by salary in a clustered salary chart and on a map with price-tag pins.
- Filters by salary, department, location, seniority, remote, and keyword chips (responsibilities, fit, skills).
- Compstimate (a Zestimate-style pay estimate) and market insights (skill premiums, department salary boxes).
- In progress: a "Juice Score" (cost-of-living-adjusted take-home, with rent and the Big Mac index), salary-parse vetting with outlier quarantine, dark mode, and social share cards.
- Deployed as a static site on GitHub Pages, with a daily refresh by GitHub Actions.

The user asked: "competitor analysis and what makes us unique, what makes Zillow and posting job boards unique, and how and what features can we 1-up them."

Research with WebSearch (load it with ToolSearch "select:WebSearch,WebFetch"; many hosts are blocked by the sandbox's egress policy, so rely on search results and on any pages you can fetch, and don't try to bypass the block). Cite sources with URLs and access dates. Cover:
1. Zillow's signature features and why they work: Zestimate, map-first search with draw-your-own boundary, saved searches and alerts, price history and price cuts, days on market, affordability calculator, neighborhood and school data, commute time, 3D tours, the agent marketplace business model, and anything else notable.
2. Job platforms:
   - big boards: LinkedIn Jobs, Indeed, Glassdoor, Google for Jobs;
   - pay-data sites: Levels.fyi, Glassdoor salaries, Blind;
   - curated or startup boards: Wellfound, Welcome to the Jungle/Otta, Built In, Hiring Cafe, Jobright, Simplify, Teal, Y Combinator's Work at a Startup;
   - anything with a map or salary-visualization angle.
   For each, note its key differentiator, its salary transparency, its weaknesses and user complaints, its business model, and whether it has map or salary visualization.
3. A comparison matrix (features × competitors, including melon-seek today).
4. What makes melon-seek unique today, said honestly, with gaps and risks: data coverage, ATS-only sources, legal and terms-of-service considerations for scraping versus public APIs, and the accuracy of parsed salaries.
5. 1-up features: Zillow concepts translated to jobs, plus gaps competitors leave. Examples to evaluate, not to accept blindly:
   - "days on market" and repost detection;
   - salary-range "price cuts" and raises over time (needs history snapshots);
   - commute time to office;
   - draw-a-boundary search;
   - saved searches with alerts when a matching role or pay band appears;
   - company "neighborhood" stats (hiring velocity, team growth by department);
   - "Juice Score" affordability;
   - an offer comparator;
   - comparing a role across companies;
   - flagging ghost or evergreen postings.
   For each: user value, data needed and whether we have it, effort (S/M/L) within our zero-backend static architecture, and risks.
6. A prioritized roadmap: Now (fits the current static architecture), Next, Later. Name the top 3 to build first, with crisp acceptance criteria.

Write docs/strategy/COMPETITIVE_ANALYSIS.md (sections 1–4) and docs/strategy/ROADMAP.md (sections 5–6). Keep a process log at docs/process/strategy.md following docs/process/TEMPLATE.md: the queries you ran, the sources and what each told you, the scoring method for prioritization, and what you could not verify. Paste this prompt verbatim into docs/process/prompts/strategy.md. Don't edit any other files and don't commit. Report back briefly: our top differentiators, the 3 features you recommend building first, and anything that needs the user's decision.

---

## Mid-task message from the coordinator (verbatim)

Addition from the user: after the research, every recommended 1-up feature will be implemented by the existing workstreams, and the frontend must stay intuitive and simple. In ROADMAP.md, add an "Implementation plan" section. For each feature you recommend building:
- (a) the owner workstream: backend/data (server/*, scripts, workflows), features (server/keywords.js, geo.js, demo.js), viz (public/viz/*), UX (public/index.html, styles.css, app.js), product (public/features/*), livability (server/juice.js, data/cities.json) or vetting (salary.js, vet.js);
- (b) the files and interfaces involved, i.e. new Job fields or API endpoints, consistent with docs/CONTRACT.md;
- (c) dependencies and order;
- (d) a UI simplicity rule. Each feature gets at most one new visible control in the main view; the rest goes in the drawer or a "More" menu. Use progressive disclosure, avoid new top-level modes unless essential, and write a one-line description of how the feature appears in the UI.
Also add a short "UI simplicity budget" section listing what's already on screen and what new features may add, so the whole UI stays calm. Report back with the plan summarized per owner.

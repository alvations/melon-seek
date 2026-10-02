# Prompt: research (data sources)

Original task prompt given to the data-research agent, copied verbatim.

---

You are the data researcher on "melon-seek" (/home/user/melon-seek), a web app that pulls company job boards and plots postings by salary/location. Direct HTTP to job-board hosts is BLOCKED in this sandbox (boards-api.greenhouse.io, job-boards.greenhouse.io, api.ashbyhq.com are denied by egress policy — do not try to bypass). Use the WebSearch tool (load it via ToolSearch "select:WebSearch,WebFetch") and WebFetch on hosts that may be allowed (e.g. github.com, developers.greenhouse.io, developers.ashbyhq.com, docs, blog posts) to VERIFY, with sources:
1. Greenhouse Job Board API: list endpoint, `content=true` behavior (is content HTML-entity-escaped?), fields, `pay_input_ranges` availability (and whether it requires `?pay_transparency=true` on the single-job endpoint), departments/offices endpoints.
2. Anthropic's Greenhouse board token (believed "anthropic") and how Anthropic formats salary in posting content (e.g. "Annual Salary: $XXX—$YYY USD"), and section headings ("Responsibilities:", "You may be a good fit if you:", "Strong candidates may also:").
3. Anduril's board: Greenhouse token (believed "andurilindustries") — confirm; how they show salary ranges.
4. OpenAI careers (openai.com/careers/search): which ATS backs it (believed Ashby, board "openai") — confirm; Ashby posting API endpoint https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true response schema (compensation fields: compensationTierSummary, summaryComponents with compensationType/interval/currencyCode/minValue/maxValue; location, secondaryLocations, isRemote, workplaceType, descriptionHtml, jobUrl, publishedAt, isListed).
5. Lever postings API schema (salaryRange, categories, lists) and 3–5 other notable AI/defense companies with their ATS + board slug (e.g. Scale AI, Mistral, Cohere, Palantir (Lever "palantir"), Shield AI, Perplexity, xAI, Databricks) — only include ones you can confirm with a source.
Write findings to /home/user/melon-seek/docs/DATA_SOURCES.md (you own only this file; don't edit anything else; don't commit). Include source URLs. Then report back concisely: any discrepancies vs. the assumptions above (these matter — the adapters were written against them), and the list of extra confirmed boards (company, ATS, slug) suitable to add as built-ins.

---

Mid-task addendum from the coordinator (also verbatim):

New requirement from the user: document how you produced your work so another agent can replicate it. Before you finish: (1) copy your original task prompt verbatim into docs/process/prompts/research.md; (2) write docs/process/research.md following docs/process/TEMPLATE.md (brief, every search query and URL consulted with what it confirmed, decisions, what could not be verified and why, change log). You own those two files in addition to docs/DATA_SOURCES.md. Don't commit; the lead does.

---

## Restart prompt

Given to a fresh data-research agent after the first attempt stopped early (also verbatim):

You are the data researcher on melon-seek (/home/user/melon-seek), a web app that plots public job-board postings by salary and location. A previous research attempt stopped early; start fresh. The sandbox blocks direct requests to the job-board hosts, so use WebSearch (load via ToolSearch "select:WebSearch,WebFetch"), plus WebFetch on documentation sites that are reachable.

Confirm, with source URLs:
1. Greenhouse Job Board API: list-jobs endpoint, what `content=true` returns (is the HTML entity-escaped?), and whether pay ranges (`pay_input_ranges`) are available and how.
2. The Greenhouse board slugs for Anthropic ("anthropic") and Anduril ("andurilindustries").
3. Which ATS backs openai.com/careers/search (expected: Ashby, board "openai"), and the fields of the Ashby posting API with `includeCompensation=true`.
4. The fields of the Lever postings API (salaryRange, categories, lists).
5. Whether these three public APIs allow cross-origin browser requests (CORS), since a static GitHub Pages build will call them from the browser.
6. 3–5 other well-known AI or defense companies with their ATS and board slug, only where a source confirms it.

Write the findings to docs/DATA_SOURCES.md, with a short table per question and the source URL next to each fact. Keep a research log at docs/process/research.md following docs/process/TEMPLATE.md: the search queries you ran, the URLs you read and what each confirmed, what you could not confirm, and a change log. Then append this prompt verbatim under a "Restart prompt" heading at the end of docs/process/prompts/research.md (keep its existing content). Edit only those three files and don't commit. Report back briefly: anything that differs from the expected values above, the CORS answer, and the extra confirmed boards.

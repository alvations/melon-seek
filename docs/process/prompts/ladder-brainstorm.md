# Prompt: corporate-ladder reuse brainstorm (verbatim)

You are a product engineer brainstorming reuse between two of the user's repos.
- /home/user/melon-corporate-ladder (just cloned). Explore it; it is READ-ONLY for you, so don't edit anything there.
- /home/user/melon-seek, "the Zillow of job postings". It pulls public ATS job boards (Greenhouse, Ashby, Lever) for Anthropic, Anduril, OpenAI, Scale AI, xAI, Cohere, Palantir and Shield AI, and plots postings on a clustered salary chart and a map with salary price-tag pins. It has filters (salary, department, location, seniority, keyword chips for responsibilities, fit and skills), a Compstimate pay estimator, market insights, a cost-of-living "Juice Score" (in progress) and salary vetting. It is a zero-build vanilla-JS static site on GitHub Pages. Read its README.md, docs/CONTRACT.md and docs/strategy/ (if present) for context.

The user's request, verbatim: "take a look at the melon-corporate-ladder and brainstorm what we can use there to put into the job posting application, is there something that we can do with it but make sure we don't overcomplicate the application, the feature must be something simple, don't just implement, tell me your plan".

Do this:
1. Understand melon-corporate-ladder: its purpose, its data (look in data/, knowledge-base/, server/ and src/), its features, its stack, and any reusable datasets, models, logic or UI patterns. Note licenses or terms if any data is third-party.
2. Brainstorm 5–8 candidate ideas for bringing value from corporate-ladder into melon-seek. For each: the user value in one sentence, what exactly is reused (files and datasets), effort (S/M/L), how it appears in the UI (it must fit melon-seek's simplicity rule: at most one new visible control in the main view, otherwise it lives in the job drawer or a "More" menu), and risks.
3. Recommend at most 1–2 ideas, the simplest with the highest value, with a concrete step-by-step plan: the data flow, which melon-seek files and workstreams would change, new Job fields if any, how to keep the shared data in sync between the repos (copy a dataset vs. fetch it vs. a build step), tests, and acceptance criteria.
4. List the open questions the user must answer before implementation.

DO NOT implement anything and DO NOT edit either repo, except for writing your plan to /home/user/melon-seek/docs/strategy/CORPORATE_LADDER_PLAN.md and a short process log to /home/user/melon-seek/docs/process/ladder-brainstorm.md (following docs/process/TEMPLATE.md: what you read, how you scored the ideas), with this prompt pasted verbatim into /home/user/melon-seek/docs/process/prompts/ladder-brainstorm.md. Don't commit.

Report back concisely: a one-paragraph summary of what corporate-ladder is, the idea list (one line each), your top 1–2 recommendations with their plans in brief, and the open questions.

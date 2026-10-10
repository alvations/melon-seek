# Build process and audit trail

melon-seek was built by one lead agent orchestrating parallel specialist
agents. This folder records how, so the build can be replayed on another
Claude account or another machine.

## How to read this folder

| File | What it is |
|---|---|
| [lead.md](lead.md) | Orchestration log: user requests, plan, environment constraints, agent roster, integration steps, timeline |
| [TEMPLATE.md](TEMPLATE.md) | Structure every workstream log follows |
| `prompts/<role>.md` | The exact prompt each agent was given (verbatim) |
| `<role>.md` | Each agent's own log: sources, decisions + rationale, replayable commands, verification, gaps |
| `scripts/` | Helper scripts agents used (screenshot harnesses, etc.) |

Related docs outside this folder: [../CONTRACT.md](../CONTRACT.md) (the shared
interface every agent built against), [../ARCHITECTURE.md](../ARCHITECTURE.md),
[../DATA_SOURCES.md](../DATA_SOURCES.md), [../QA.md](../QA.md),
[../REVIEW.md](../REVIEW.md).

## Workstreams

| Role | Prompt | Log | Owns |
|---|---|---|---|
| Lead / integrator | [prompts/lead.md](prompts/lead.md) | [lead.md](lead.md) | `docs/CONTRACT.md`, integration, commits |
| Backend / data | [prompts/backend.md](prompts/backend.md) | [backend.md](backend.md) | `server/index.js`, `companies.js`, `sources/*`, `salary.js`, `normalize.js`, `cache.js`, `scripts/snapshot.js` |
| Features (keywords, geo, demo) | [prompts/features.md](prompts/features.md) | [features.md](features.md) | `server/keywords.js`, `geo.js`, `demo.js` |
| Data viz (chart + map) | [prompts/viz.md](prompts/viz.md) | [viz.md](viz.md) | `public/viz/*` |
| UX / frontend | [prompts/ux.md](prompts/ux.md) | [ux.md](ux.md) | `public/index.html`, `styles.css`, `app.js` |
| Product features | [prompts/product.md](prompts/product.md) | [product.md](product.md) | `public/features/*` |
| DevOps + docs | [prompts/devops.md](prompts/devops.md) | [devops.md](devops.md) | `README.md`, `Dockerfile`, `.github/workflows/*` |
| QA | [prompts/qa.md](prompts/qa.md) | [qa.md](qa.md) | `test/e2e/*`, `scripts/e2e.js`, `docs/QA.md` |
| Security + a11y review | [prompts/review.md](prompts/review.md) | [review.md](review.md) | `docs/REVIEW.md` |
| Data research | [prompts/research.md](prompts/research.md) | [research.md](research.md) | `docs/DATA_SOURCES.md` |
| Livability (Juice Score) | [prompts/livability.md](prompts/livability.md) | [livability.md](livability.md) | `data/cities.json`, `server/juice.js`, `scripts/update-col.js`, `docs/LIVABILITY.md` |
| Salary vetting | [prompts/vetting.md](prompts/vetting.md) | [vetting.md](vetting.md) | `server/salary.js`, `server/vet.js`, `scripts/vet-salaries.js`, `scripts/llm-vet.js`, `data/vetting/**`, `docs/VETTING.md` |
| Social share previews | [prompts/social.md](prompts/social.md) | [social.md](social.md) | OG tags in `public/index.html`, `public/og/*`, `scripts/build-og.mjs` |
| Strategy (competitors, roadmap) | [prompts/strategy.md](prompts/strategy.md) | [strategy.md](strategy.md) | `docs/strategy/COMPETITIVE_ANALYSIS.md`, `docs/strategy/ROADMAP.md` |
| Corporate-ladder brainstorm (plan only) | [prompts/ladder-brainstorm.md](prompts/ladder-brainstorm.md) | [ladder-brainstorm.md](ladder-brainstorm.md) | `docs/strategy/CORPORATE_LADDER_PLAN.md` |
| Finish (lexicon fixes, external link CI) | [prompts/finish.md](prompts/finish.md) | [features.md](features.md) §6c, [devops.md](devops.md) decisions 66–67 | `server/keywords.js` lexicons, `scripts/external-links.js`, ci.yml `links` job |
| Big-tech boards (beta) | [prompts/bigtech-data.md](prompts/bigtech-data.md) | [bigtech-data.md](bigtech-data.md) | `server/sources/*` (big-tech adapters), `server/companies.js` beta entries, `scripts/snapshot.js --channel beta`, `docs/DATA_SOURCES.md` §7 |
| Beta site deploy | [prompts/beta-deploy.md](prompts/beta-deploy.md) | [beta-deploy.md](beta-deploy.md) | `scripts/build-static.js` (dist/beta), `pages.yml`, `snapshot.yml` beta crawl, `public/api.js` live:false |
| Juice household + rent | [prompts/juice-household.md](prompts/juice-household.md) | [juice-household.md](juice-household.md) | `data/cities.json` rents by bedrooms, households in `server/juice.js`, drawer Juice block |
| Juice tax verification | [prompts/juice-tax.md](prompts/juice-tax.md) | [juice-tax.md](juice-tax.md) | tax section of `server/juice.js`, `test/juice-tax-golden.test.js` |
| Data freshness (lead + 7 helpers) | [prompts/freshness-lead.md](prompts/freshness-lead.md) and `prompts/freshness-*.md` | [freshness-lead.md](freshness-lead.md) and `freshness-*.md` | `data/freshness.json`, `docs/DATA_FRESHNESS.md`, `scripts/refresh/**`, `monthly-refresh.yml` |
| Historical archive | [prompts/archive.md](prompts/archive.md) | [archive.md](archive.md) | `scripts/archive/**`, `archive*.yml`, `docs/DATA_ARCHIVE.md`, the `data-archive` branch |
| Data badge (Live / Snapshot) | [prompts/badge-ux.md](prompts/badge-ux.md) | [badge-ux.md](badge-ux.md) | badge code in `public/app.js`, `pending` in `public/api.js`, `test/e2e/badge.e2e.js` |
| Methodology copy | [prompts/methodology-copy.md](prompts/methodology-copy.md) | [methodology-copy.md](methodology-copy.md) | `docs/METHODOLOGY_GUIDE.md` |
| Methodology UX + infographics | [prompts/methodology-ux.md](prompts/methodology-ux.md) | [methodology-ux.md](methodology-ux.md) | `scripts/methodology.js`, `scripts/methodology-figures.js`, `scripts/md.js` |
| Improvement cycle (playbook) | [prompts/cycle/](prompts/cycle/) (templates) | [PLAYBOOK.md](PLAYBOOK.md) | `scripts/cycle/*`, `.claude/skills/improvement-cycle/`, `test/cycle.test.js` |
| Persona review 18–24 (main site) | [prompts/persona-stable-18-24.md](prompts/persona-stable-18-24.md) | [persona-stable-18-24.md](persona-stable-18-24.md) | none (review only); screenshots in `docs/screenshots/persona-stable-18-24/` |
| Persona review 25–34 (main site) | [prompts/persona-stable-25-34.md](prompts/persona-stable-25-34.md) | [persona-stable-25-34.md](persona-stable-25-34.md) | none (review only); screenshots in `docs/screenshots/persona-stable-25-34/` |
| Persona review 35–44 (main site) | [prompts/persona-stable-35-44.md](prompts/persona-stable-35-44.md) | [persona-stable-35-44.md](persona-stable-35-44.md) | none (review only); screenshots in `docs/screenshots/persona-stable-35-44/` |
| Persona review 45–54 (main site) | [prompts/persona-stable-45-54.md](prompts/persona-stable-45-54.md) | [persona-stable-45-54.md](persona-stable-45-54.md) | none (review only); screenshots in `docs/screenshots/persona-stable-45-54/` |
| Persona review 55 and over (main site) | [prompts/persona-stable-55-plus.md](prompts/persona-stable-55-plus.md) | [persona-stable-55-plus.md](persona-stable-55-plus.md) | none (review only); screenshots in `docs/screenshots/persona-stable-55-plus/` |
| Desktop / mobile QA, mobile perf, fixes | [prompts/qa-desktop.md](prompts/qa-desktop.md), [qa-mobile.md](prompts/qa-mobile.md), [perf-mobile.md](prompts/perf-mobile.md), [fix-frontend.md](prompts/fix-frontend.md) | [qa-desktop.md](qa-desktop.md), [qa-mobile.md](qa-mobile.md), [perf-mobile.md](perf-mobile.md), [fix-frontend.md](fix-frontend.md) | `docs/QA.md`, `test/e2e/*-qa.e2e.js`, `public/unpack-worker.js` |

## Replaying the build from scratch

1. Start from an empty repo with Node >= 18. `npm init -y && npm i leaflet@1.9.4`.
2. Write `docs/CONTRACT.md` (copy it from this repo). It is the single source of
   truth that lets the agents work in parallel without colliding.
3. Launch the agents in `prompts/` in parallel (each prompt lists the files the
   agent owns and forbids touching others). Order does not matter except that
   QA and review wait for the code to exist (their prompts say how).
4. As agents finish, follow the integration steps in [lead.md](lead.md):
   wire modules together, run `npm test`, run `node scripts/e2e.js`, fix
   findings from QA and review by routing each to the owning workstream.
5. Commit with the attribution lines described in lead.md.

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

# Prompt: devops (DevOps + technical writer)

Verbatim task prompt given to the DevOps/docs agent by the coordinator.

---

You are the DevOps + technical writer on "melon-seek" at /home/user/melon-seek — a "Zillow for job postings" web app (Node >=18, zero-build, only dep leaflet; see docs/CONTRACT.md for architecture). Other engineers are concurrently writing server/, public/, and test/*.test.js — do NOT edit those. You own only: README.md, Dockerfile, .dockerignore, .github/workflows/ci.yml, .github/workflows/snapshot.yml, .editorconfig, LICENSE is NOT needed (skip), docs/ARCHITECTURE.md, docs/ADDING_A_BOARD.md. Don't commit/push git.

1. README.md: what it is (chart mode default, map mode, Zillow-like filters on salary / responsibilities / fit / skills keywords / department / location / seniority; company switcher Anthropic, Anduril, OpenAI; custom Greenhouse/Ashby/Lever boards), quick start (`npm install && npm start` → http://localhost:5173), data modes (live/cache/snapshot/demo — demo is synthetic data clearly labeled, used when boards are unreachable), `npm run snapshot` to save real data into data/snapshots/, `npm test`, API reference (copy from contract), project layout, and data sources: Greenhouse boards-api (https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true), Ashby posting API (https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true; openai.com/careers/search is backed by Ashby board "openai"), Lever (https://api.lever.co/v0/postings/{board}?mode=json). Note responsible use: public endpoints, cached 30 min. Leave a placeholder section "## Screenshots" referencing docs/screenshots/chart.png and docs/screenshots/map.png (the lead will add the images).
2. Dockerfile (node:22-alpine, npm ci --omit=dev, non-root, EXPOSE 5173, CMD npm start, HEALTHCHECK hitting /api/companies via wget) + .dockerignore.
3. .github/workflows/ci.yml: on push/PR, Node 20 & 22 matrix, npm ci, npm test, and a smoke step that starts the server and curls /api/companies and /api/jobs?company=anthropic and checks JSON has a jobs array (use jq).
4. .github/workflows/snapshot.yml: scheduled daily + workflow_dispatch: npm ci, npm run snapshot (anthropic anduril openai), commit data/snapshots/*.json if changed using github-actions bot with permissions contents: write. (GitHub runners can reach the job boards, so this is how real data gets into the repo.)
5. docs/ARCHITECTURE.md (data flow diagram in mermaid: adapters → normalize (salary/geo/keywords) → cache → API → app.js → chart/map), docs/ADDING_A_BOARD.md (how to add a company to server/companies.js or via the UI "Add board", and how to write a new adapter).
6. .editorconfig.
Validate YAML syntax (e.g. `python3 -c "import yaml..."` if pyyaml exists, otherwise careful review). Report back concisely.

---

Follow-up (from the user, relayed by the coordinator):

Follow-up task from the user: document how you produced your work so another agent can replicate it. (1) Copy your original task prompt verbatim into docs/process/prompts/devops.md; (2) write docs/process/devops.md following docs/process/TEMPLATE.md (brief, inputs, decisions + rationale for Dockerfile/CI/snapshot workflow choices, exact commands you ran incl. YAML validation, known gaps, change log).

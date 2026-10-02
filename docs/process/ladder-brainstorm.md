# Process log: corporate-ladder reuse brainstorm

## 1. Brief
Prompt: [prompts/ladder-brainstorm.md](prompts/ladder-brainstorm.md)
(verbatim). The task was to explore `melon-corporate-ladder` (read-only),
brainstorm 5–8 ways to reuse it in melon-seek, recommend at most 1–2 simple
ones with a concrete plan, and list the open questions. Nothing was to be
implemented.

Files owned (all new; nothing else in either repo was touched):
- `docs/strategy/CORPORATE_LADDER_PLAN.md` (the plan);
- this log;
- the prompt file.

## 2. Inputs and sources

**melon-corporate-ladder** (commit `4a7ab3a`, shallow clone):

- `README.md`, `BUSINESS.md`, `ROADMAP.md`, `SETUP.md`, `SITEMAP.md`:
  purpose, stack, Free/Pro tiers. BUSINESS.md's launch blocker 1 (the
  knowledge base paraphrases CareerClimb) drove the decision not to reuse any
  knowledge-base text.
- `data/provenance.md`, `data/sitemap.json`: the only "data". It's a URL
  inventory of CareerClimb pages collected by web search. There are no jobs,
  pay or level datasets.
- `knowledge-base/*.md` (all 7 files). The company guides cover 12 companies,
  none of them ours.
- `src/lib/rubricTemplates.ts`: the generic SWE L3–L6 and PM ladders. This is
  the main reusable asset.
- `src/db/schema.ts`: the five impact categories and the `VaultSnapshot`
  export shape.
- `src/lib/scoring.ts`, `knowledge.ts`, `ai.ts`, `export.ts`, `dates.ts`,
  `github.ts`.
- `src/views/Rubric.tsx`, `Readiness.tsx`, `Library.tsx`, `ReviewPrep.tsx`,
  `Onboarding.tsx`.
- `prototype/index.html` (skimmed), `server/README.md`,
  `.github/workflows/ci.yml`, `package.json`.
- There is no LICENSE file.

**melon-seek:**

- `README.md`, `docs/CONTRACT.md`, `docs/ARCHITECTURE.md` (head),
  `docs/process/README.md`, `TEMPLATE.md`, `lead.md` (for the UI simplicity
  budget: at most one new main-view control per feature).
- `docs/process/prompts/product.md`, `product.md` (for format).
- `docs/strategy/COMPETITIVE_ANALYSIS.md` (it appeared mid-task; I read the
  Levels.fyi and differentiator sections). `docs/LIVABILITY.md` (grep only,
  for the drawer waterfall).
- `public/index.html`. In `public/app.js`: the drawer, the `compstimateBlock`
  pattern, the quickbar's "More" chip and `SENIORITY_ORDER`.
- `public/features/*` exports, `server/keywords.js#inferSeniority`, and the
  CSP in `server/index.js`.
- `data/snapshots/*.json`: 8 boards, 5,413 postings, read only.

No skills or external URLs were used.

## 3. Decisions and rationale

1. **Ground the ideas in the real snapshots before scoring.** The first scan
   showed that 41% of postings are "Mid" by default, which made level clarity
   the obvious gap. The pay-by-level scan killed idea 5, because the labs'
   ladders come out inverted.
2. **Scoring formula.** Total = value×2 + simplicity×2 + effort×1 +
   low-risk×1.5 + reuse×1, out of 37.5. Value and simplicity are doubled
   because the user asked for "something simple" that adds value. Risk is
   weighted ×1.5 because of the licence issue and because the copy is
   presented as fact.
   - Simplicity scale: 5 = drawer only, 4 = drawer or More menu with light
     UI, 3 = More-menu entry plus new UI, 2 = a new main-view control.
   - Effort scale: S=5, M=3, L=1.
   - The per-idea scores are in the plan, §3.
3. **Unlevelled-title test.** A posting counts as unlevelled when its title
   doesn't match `\b(intern|internship|fellow|fellowship|junior|jr|associate|new grad|graduate|entry|senior|sr|staff|principal|distinguished|lead|head|director|vp|vice president|chief|manager|i|ii|iii|iv|1|2|3|4)\b`,
   or when it contains "member of (the) technical staff".
4. **Years windows, not a table of percentages.** The pooled years-to-level
   table is dominated by Anduril (2,418 of 5,413 postings). Without Anduril,
   "5+ yrs" splits Senior 42% / Staff+ 35%. So I chose two-rung windows that
   keep 77–91% coverage both with and without Anduril: 1+ → Entry–Mid; 3+ →
   Mid–Senior; 5+, 8+ and 10+ → Senior–Staff+.
5. **Copy the ladder rather than fetch it or add a build step.** It's about
   3 KB, rarely changes, is TypeScript at the source, and melon-seek is
   zero-build in both modes. A fetch would also need a CSP `connect-src`
   change.
6. **General ladder = 2 verbatim dimensions.** I re-read the SWE text cell by
   cell. Only Leadership & influence and Cross-team collaboration are
   role-agnostic; Mentorship mentions "code review" and "engineers", and
   Impact mentions "features". This avoids writing new content.
7. **Hide the section for Intern, Manager and Director+.** Both rubrics are IC
   ladders, and writing a manager track would be new content (an open
   question).
8. **Impact-category lexicon for idea 3** (rough, to measure feasibility, not
   to ship):
   - technical: design, architect, build, implement, code, scale, performance,
     reliab*, debug, systems, infrastructure, models, research, experiment,
     pipeline, tooling;
   - leadership: lead, own, ownership, drive, strategy, roadmap, vision,
     direction, influence, stakeholders, decision;
   - mentorship: mentor, coach, grow the team, hire, hiring, interview,
     onboard;
   - crossteam: cross-functional, partner with, collaborat*, across teams,
     coordinate;
   - business: revenue, customers, clients, growth, launch, adoption,
     go-to-market, GTM, sales, market, users, business.

## 4. Replayable steps

1. Clone both repos side by side. Don't edit `melon-corporate-ladder`.
2. Get real snapshots, either with `npm run snapshot` on a networked machine
   or with `gh run download --repo alvations/melon-seek --name
   job-board-snapshots --dir data/snapshots`.
3. Save the script below to a scratch directory (not the repo) and run
   `node ladder-replay.mjs /path/to/melon-seek/data/snapshots`. It reproduces
   every number in plan §2 except the pay-by-level row. That row is the same
   loop over engineering titles (excluding manager, director, head and VP),
   taking the median of `salaryUSD(job).mid` from
   `public/features/shared.js`, grouped by seniority and by
   unlevelled-vs-titled.

```js
import fs from 'node:fs';
const dir = process.argv[2] || 'data/snapshots';
const LVL = /\b(intern|internship|fellow|fellowship|junior|jr|associate|new grad|graduate|entry|senior|sr|staff|principal|distinguished|lead|head|director|vp|vice president|chief|manager|i|ii|iii|iv|1|2|3|4)\b/i;
const MTS = /member of (the )?technical staff/i;
const CAT = {
  technical: /\b(design|architect|build|implement|code|scal(e|able|ing)|performance|reliab|debug|systems?|infrastructure|models?|research|experiment|pipeline|tooling)\b/i,
  leadership: /\b(lead|leading|own|ownership|drive|driving|strategy|strategic|roadmap|vision|direction|influence|stakeholders?|decision)\b/i,
  mentorship: /\b(mentor|mentoring|coach|grow (the |our )?team|hire|hiring|interview|onboard|develop (others|engineers|talent))\b/i,
  crossteam: /\b(cross[- ]functional(ly)?|partner(ing)? with|collaborat\w*|across (teams|the company|orgs?)|coordinate)\b/i,
  business: /\b(revenue|customers?|clients?|growth|launch|adoption|go-to-market|gtm|sales|market|users?|business)\b/i,
};
const T = { n: 0, midDefault: 0, midDefaultYrs: 0, mts: 0, ic: { title: 0, years: 0, none: 0 }, ge3: 0 }, yt = {}, per = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const c = f.slice(0, -5), p = per[c] = { n: 0, midDefault: 0 };
  for (const j of JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).jobs) {
    T.n++; p.n++;
    const titled = LVL.test(j.title) && !MTS.test(j.title), yrs = (j.keywords?.fit || []).find((x) => /yrs$/.test(x));
    if (MTS.test(j.title)) T.mts++;
    if (j.seniority === 'Mid' && !LVL.test(j.title)) { T.midDefault++; p.midDefault++; if (yrs) T.midDefaultYrs++; }
    if (!['Intern', 'Manager', 'Director+'].includes(j.seniority)) T.ic[titled ? 'title' : yrs ? 'years' : 'none']++;
    if (titled && yrs && ['Entry', 'Mid', 'Senior', 'Staff+'].includes(j.seniority)) ((yt[yrs] ||= {})[j.seniority] = (yt[yrs][j.seniority] || 0) + 1);
    const hit = new Set(); for (const b of j.sections?.responsibilities || []) for (const [k, re] of Object.entries(CAT)) if (re.test(b)) hit.add(k);
    if (hit.size >= 3) T.ge3++;
  }
}
const pc = (a, b) => (a / b * 100).toFixed(0) + '%';
console.log(`postings ${T.n}; Mid by default ${T.midDefault} (${pc(T.midDefault, T.n)}), with a years ask ${T.midDefaultYrs}; MTS ${T.mts}`);
console.log(Object.entries(per).map(([c, p]) => `${c} ${pc(p.midDefault, p.n)}`).join(', '));
const ic = T.ic.title + T.ic.years + T.ic.none; console.log(`IC ${ic}: title ${pc(T.ic.title, ic)}, years ${pc(T.ic.years, ic)}, none ${pc(T.ic.none, ic)}`);
for (const y of ['1+ yrs', '3+ yrs', '5+ yrs', '8+ yrs', '10+ yrs']) { const r = yt[y], n = Object.values(r).reduce((a, b) => a + b, 0); console.log(y, 'n=' + n, Object.entries(r).map(([k, v]) => `${k} ${pc(v, n)}`).join(' ')); }
console.log(`>=3 impact categories: ${T.ge3} (${pc(T.ge3, T.n)})`);
```

For the Anduril-excluded years table, skip `anduril.json` in the loop.

## 5. Verification

- The replay script was run on 2026-10-02. Output: 5,413 postings; 2,234
  (41%) Mid by default; 1,507 of those with a years ask; 33 MTS titles; IC
  4,661 = title 51% / years 33% / none 16%; 3,882 (72%) span ≥ 3 categories.
  This matches plan §2.
- `git status` in melon-seek showed only my three new files plus other
  agents' concurrent work. I committed nothing. `git status` in
  melon-corporate-ladder is clean.
- No tests were run, because no code changed.

## 6. Known gaps and follow-ups

- The years-to-level windows are calibrated on one day of data, and Anduril
  dominates it. Re-check them when boards are added.
- The family regexes and the impact lexicon are feasibility-grade. The product
  workstream should tune them against fixtures when implementing.
- The raw snapshots predate the salary vetting gate. Only the pay-by-level row
  uses salaries.
- I didn't check how the Juice Score drawer section will look next to Level
  check (open question 8 in the plan).
- The open questions in plan §8 must be answered before implementation.

## 7. Change log

- 2026-10-02: read both repos, ran the snapshot scans, scored 8 ideas, and
  wrote the plan, this log and the prompt file.

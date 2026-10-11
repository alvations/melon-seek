# Process log: fix3-data (fix wave 3, pay and data parsing)

## 1. Brief
- Prompt: [prompts/fix3-data.md](prompts/fix3-data.md) (verbatim).
- Goal: fix the data side of the beta persona review's broken items ([lead.md](lead.md) "Beta, stage 1c"):
  BP-1 (yearly-rate internship pay), BP-2 (Juice from another country's pay), BP-5 ("CAD" tag), BP-8
  (department abbreviations), BP-9 (part-time hourly pay), BP-11 (creative and technical directors),
  BP-14 (required and preferred qualifications), BP-15 (store names as places) and keyword-tag noise, for
  both sites (`/melon-seek/` and `/melon-seek/beta/` share the code).
- Files owned: server/salary.js, keywords.js, normalize.js, juice.js, geo.js, server/sources/**,
  scripts/vet-salaries.js, docs/CONTRACT.md, VETTING.md, DATA_SOURCES.md, re-baselined fixtures, own tests.
- Worktree `/home/user/melon-seek/.claude/worktrees/agent-ad97897937473d0a0`, from 790fa13.

## 2. Inputs and sources
- docs/CONTRACT.md (v2 to v5 and the beta fix wave sections), ROADMAP §8 (UI budget), PLAYBOOK, TEMPLATE.
- The five beta persona reviews (persona-beta-*.md): BF-2/B1 (internship pay), B2 (part-time pay),
  I18 (iOS from Chrome boilerplate), item 7 in 45-54 (Evals, Agents, Mission / defense, Transformers),
  the 55-plus tags on technician cards, BP-15's place names.
- The P-17 method (docs/process/fix-pay-data.md §3 and test/fixtures/keyword-labels.json): a labelled
  sample per label, stratified into removed and kept, precision estimated per stratum.
- Data: the 22:00 crawl's 13 snapshots (8 stable at norm-7, 5 beta at norm-6), symlinked from the shared
  checkout, and data/cities.json.

## 3. Decisions and rationale

### BP-1: yearly-rate internship pay
- **Root cause:** `payTerms` (server/salary.js) sets `termWeeks` on any fixed-term role, whatever the posted
  interval, and a yearly salary carries no `originalInterval`, so a reader cannot tell "€72,000 a year for
  a 13-week internship" from "€72,000 for the term". 27 postings: Google 23 ("Ireland: €72000 (EUR)",
  "$118000 - $157000 (USD)" with "a minimum 13 week full-time internship"), Microsoft 4 ("CAD $43,800 -
  CAD $50,000 per year", "6-month internship").
- **Fix:** server/salary.js:609. A salary with `termWeeks` always says how it was stated:
  `originalInterval: 'year'` when it was yearly (or had no interval). `termWeeks` stays as information
  (shared decision 3). Week, month and term pay keep `'week'`, `'month'`, `'term'`. Every reader of
  `originalInterval` was checked: vet.js, apple.js, vet-salaries.js, refresh/jobs.js and policy.js treat a
  missing value as `'year'`, chart.js tests `orig !== 'year'`, app.js `postedTerm` maps 'year' to no unit.
- **Display:** the app lane's `postedTerm` and pay block (shared decision 3).

### BP-2 (Juice side): another country's pay
- **Root cause:** `attachJuice` (server/juice.js) scored every matched place when none used the pay's
  currency (`currencyMismatch`), so Cohere's CA$375K–465K became "78 Juicy" in London and NVIDIA's Polish
  range Juice in Munich and Zurich. Within one currency it applied an Irish euro line to Munich or Madrid.
- **Fix:** server/juice.js:1486. Only places whose city uses the pay's currency are scored, and when the pay
  line names its country only that country's places (`salary.country`, new: server/salary.js:951, the
  country of Google's "Ireland: €…" line or Microsoft's "across the U.S." range; copied by `toJobSalary`,
  :1024). With none left, `job.juice = null` and `job.juiceMissing = { code: 'pay-other-country', text }`
  (`noJuiceReason`, :1457), e.g. "No Juice figure: the pay is posted in Canadian dollars (for Canada), and
  London, UK uses another currency. Juice is never worked out from another country’s pay." The
  `currencyMismatch` flag is never set again. `juiceMissing` is reset on every call, so a household
  switch clears it.
- **Alternatives:** a reason inside `job.juice` (`{ best: null, reason }`) was rejected: every reader tests
  `job.juice` for truth and then reads `.best`. A sibling field keeps the shape.
- **Postings that change (beta bundle, all 13 companies):** 22 lose their Juice and get the reason (16 that
  the currencyMismatch fallback scored: Cohere 6, Microsoft 3, Anduril 2, NVIDIA 2, xAI 2, Google 1; and 6
  more whose euro or other line names another country: Microsoft 4, Google 2). 22 more keep Juice but lose
  the places in another country (Microsoft 14, Google 8). 3,687 salaries now carry `salary.country`.

### BP-5: the "CAD" tag
- **Root cause:** the P-17 pattern (server/keywords.js) excluded "4,300 CAD" and "CAD 150,000" but not the
  big-tech formats: Google "$120000 (CAD)", Cohere "$160,000 – $245,000 [CAD]", Microsoft's French "112,000
  $ CAD à 165,000 $ CAD", Google's French "+ 0% bonus target CAD" and "+ équité + avantages sociaux CAD".
- **Fix:** server/keywords.js:682. "CAD" is not the skill after an amount or "$" (also in brackets or
  parentheses), after "dollars (", after "% bonus target" or a benefits list, before "$", an amount or a
  rate. "Experience designing mechanical parts (CAD)" and "Physical Design Methodology CAD Engineer" stay.
- **Count:** 125 postings lose a currency "CAD" tag (the persona review counted 109 on beta boards).

### BP-8: department abbreviations
- **Root cause:** NVIDIA's `department` is its internal job-family code; five Microsoft disciplines abbreviate.
- **Fix:** server/sources/eightfold.js:76 and :91 (`departmentName`): phrases first, from the titles filed
  under them ("Dev Tech SW" holds "Developer Technology Engineer" roles, "Prod Planner" "Production
  Planner"), then a word list: Mgmt Management, Mgr Manager, SW Software, HW Hardware, Sys Systems, Eng and
  Engng Engineering, Engr Engineer, Bus Business, Dev Development, Ops Operations, Apps Applications, Comp
  Compensation, Mfg Manufacturing, Phys Physical, Prod Production, Mktg Marketing, Admin Administrator,
  Corp Corporate, Rep Representative, QA Quality Assurance, PR Public Relations, MarComm Marketing
  Communications, Doc Ctrl Document Control, HRBP HR Business Partner, (IC) (Individual Contributor), RMA
  Returns (RMA), SMB Small and Medium Business. A bracket that repeats the name is dropped ("Mgmt, Sales
  (Sales)" → "Management, Sales"). ASIC, CAD, IT, HR and UX are the fields' own names and stay. Applied in
  `mapEightfoldJob` and, for stored jobs, `upgradeEightfoldJobs` (:112), to `department` and `team`.
- **Count:** NVIDIA 86 of 146 names (1,287 postings), Microsoft 6 (120 postings). Nothing in public/ or
  scripts/ keys on the old names (grep).

### BP-9: part-time hourly pay
- **Root cause:** hourly pay is annualized at 2,080 hours whatever the role, so Apple's part-time
  Technical Specialist at $22–28.88/h reads "$46K–60K a year" and Juice used $4,410 a month.
- **Fix:** server/salary.js:560 (`isPartTimeRole`), :572 (`statedWeeklyHours`) and `payTerms`:
  `salary.partTime: true` when the employment type (or else the title) says part-time and not also
  full-time, and the pay was posted per hour (shared decision 4). `min`/`max` stay the 2,080-hour figure
  (shape unchanged). The weekly hours the posting states go to `hoursPerWeek` (+ `hoursPerWeekMax`):
  "work 16 hours per week (8 hours per day)", "28 hrs pw", 1–34 hours. Juice (server/juice.js:1496) scores
  `mid ÷ 2080 × hoursPerWeek × 52`, or gives `juiceMissing: { code: 'part-time-hours', text }`.
- **Count:** 52 Apple postings (the persona review's 52 of 123 part-time); 1 states its hours (Seasonal
  Advisor, 16 h); 16 lose a full-time Juice figure.

### BP-11: Art, Creative and Technical Director
- **Evidence** (2026-10-11 crawl): Apple's 14 such postings pay a median $222K, against $404K for its other
  Director titles and $255K for its senior designers; Netflix Animation's pipeline, lighting and effects TDs
  pay CA$120K–180K; the postings ask for 5 to 10+ years; none of Apple's or Netflix's mentions managing a
  team (3 of Microsoft's 6 do).
- **Fix:** server/keywords.js:1190 (`IC_DIRECTOR_RE`): never Director+; `'Senior'` with basis `'title'`
  (Associate, Senior, Group and Lead forms too); Principal stays Staff+; "Executive Creative Director",
  "Director, Creative …" and "Product Design Director" stay Director+. "Technical Directors" (plural, a
  talent pool) is unchanged.
- **Count:** 26 postings, Director+ → Senior (Apple 14, Microsoft 6, Netflix 6).

### BP-14: required and preferred qualifications
- **Root cause:** `extractSections` classifies "Minimum qualifications" and "Preferred qualifications"
  alike as `fit`, so one list holds both ("3 years…", then "4 years…").
- **Fix:** server/keywords.js:212 (`fitHeadingKind`) and :229. Each fit heading is preferred, required, soft
  or neutral (a neutral one, "Skills", continues the list before it). When a posting has required and
  preferred items and no soft heading, `sections.fit` keeps the required ones and `sections.preferred`
  the rest. A soft heading ("You may be a good fit if you", "You might thrive…", "About you") means the
  posting does not call its list required, so nothing is split: the app's "Required" label stays true.
  `preferred` is present only when non-empty, and only with a non-empty `fit`, so the build's
  `hasSections` check and the pack round trip are unchanged.
- **Apple:** its lists are line-broken paragraphs (`<h3>Minimum Qualifications</h3><p>line<br>line</p>`)
  wrapped mid-sentence, so ~92% of Apple postings had no bullet lists at all. Lines under a heading that
  is just "Responsibilities" / "Minimum|Preferred|Key Qualifications" / "Requirements" are items now, and a
  wrapped line (lower-case start, or the line before ends in "to", "and", "the", a comma…) joins the item
  before it (`LIST_HEADING_RE`, `LINE_CONTINUES_RE`, :208). An Apple posting whose duties are prose keeps
  its "You will …" sentences as responsibilities (:277), as before.
- **Keywords:** the "N+ yrs" tag is the required minimum when `preferred` exists; skills named only in the
  preferred list sort last (`orderSkills`).
- **Counts:** `sections.preferred` on Google 3,295 of 3,417, Apple 2,633, Anduril 2,168, Microsoft 1,654, Shield
  AI 501, Anthropic 289, xAI 261, Netflix 63, OpenAI 48, Scale 18, Cohere 12.
- **Display:** the app lane ("Required" / "Nice to have"). Every big board's sections live in the
  description files (lists over budget), and app.js copies only `responsibilities` and `fit` from a
  detail record, so the patch [patches/fix3-data-preferred-detail.diff](patches/fix3-data-preferred-detail.diff)
  adds `preferred` to that loop. **Until the app lane shows `preferred`, the drawer lists only the
  required items** (screenshot beta-google-qualifications-after); the full description still has both.

### BP-15: places that aren't places
- **Fix:** server/geo.js:186 and the gazetteer: Apple store names and Google's Lithuanian "Dublinas" are
  aliases of their city: Piazza Liberty (Milan), Via del Corso (Rome), Shinsaibashi and Umeda (Osaka),
  Rosny 2 (Paris), "Campania, Italy" (Naples; the Centro Campania mall in Marcianise), and also Polo Park
  (Winnipeg), Coquitlam Centre and Guildford Town Centre (Vancouver), Place Ste-Foy (Québec City), Dubai
  Mall, Morumbi (São Paulo), Jungfernstieg (Hamburg), Eldon Square (Newcastle upon Tyne), Akasya
  (Istanbul), "Emporia, Sweden" (Malmö). A name that is a place elsewhere is aliased with its country only
  ("Campania, Italy", "Emporia, Sweden"), so "Salerno, Campania" and "Emporia, KS" do not move. New cities:
  Naples, Malmö, Newcastle upon Tyne. `rawName` keeps the posting's words.
- **Count:** 26 postings (Apple 25, Google 1).

### Keyword-tag noise (P-17 method)
- **Root causes:** words in another sense (benchmark industry practices, commissioning agents, electrical
  transformers, a company's mission, "Google Cloud customers"), and team or company paragraphs that a
  board repeats on many roles (Google's "Google's software engineers develop the next-generation
  technologies… information retrieval… networking… security… natural language processing…" on 536
  postings, "Google Cloud accelerates…" 565, the ML, Systems & Cloud AI team's "…our TPUs, Vertex AI for
  Google Cloud…" 341, Chrome's "available across all major platforms — iOS, Android…" 10).
- **Fixes (server/keywords.js):**
  - Evals (:584): a benchmark of models ("model benchmarks", "public/offline benchmarks", "benchmark the
    models", "evaluation suites"), not any "benchmark"; not "business model evaluations".
  - Agents (:595, :867): "AI agents", "agentic", "tool use"; bare "agents" only in a posting about AI and
    not after another kind of agent (commissioning, change, support, routing, frontline, biological…).
  - Transformers (:572): not in a sentence with power equipment (feeders, switchgear, UPS, voltage…).
  - GCP (:613): "Google Cloud" not as the organization ("customers", "partners", "accelerates", "region").
  - Mission / defense (:775, :862): military forms always ("military missions", "mission systems",
    "warfighter", "Department of Defense"); a bare "mission" only in a defence posting (Anduril, Shield AI,
    a cleared role), never "mission-critical"; not "fraud defense" or "defense in depth".
  - Team paragraphs (:367 `teamParagraphs`, used by `rekeyBoardJobs` and `normalizeJobs`): a paragraph
    outside the lists repeated on 3 or more postings of 3 or more different roles (a role is a posting's
    own bullet lists, so a posting copied per city counts once) is left out of the skills of a posting
    that has both lists. Thresholds were compared on the labelled sample (3/3, 5/5, 10/5, 20/10, 50/20):
    3/3 removed the most false positives (iOS 20 of 21, TPUs 19 of 19, GCP 20 of 22) and lost one true
    positive outside Agents; larger thresholds kept the Chrome and Siri paragraphs.
- **Labelled sample** (test/fixtures/keyword-labels-fix3.json; 30 postings judged per label, 20 removed +
  10 kept; 15 removed for the team rule's side-effect labels):

| Label | Postings before → after | Removed sample TP/n | Kept sample TP/n | Est. precision before → after | True positives removed (est.) |
|---|---|---|---|---|---|
| Evals | 980 → 567 (−458, +45) | 3/20 | 10/10 | 60% → 100% | ~69 (12%) |
| Agents | 2,476 → 2,365 | 6/20 | 10/10 | 97% → 100% | ~33 (1%) |
| iOS | 459 → 434 | 0/20 | 10/10 | 95% → 100% | 0 |
| TPUs | 582 → 181 | 1/20 | 10/10 | 35% → 100% | ~20 |
| GCP | 1,904 → 1,374 | 2/20 | 7/10 | 53% → 70% | ~53 (5%) |
| Transformers | 284 → 220 | 0/20 | 9/10 | 70% → 90% | 0 |
| CAD | 1,078 → 953 | 2/20 | 9/10 | 81% → 90% | ~12 (1%) |
| Mission / defense | 1,938 → 1,239 (−718, +19) | 2/20 | 8/10 | 54% → 80% | ~72 (7%) |
| Security (team rule) | 5,277 → 4,253 | 1/15 | – | removed: 93% false | |
| Networking (team rule) | 3,306 → 2,467 | 0/15 | – | removed: 100% false | |
| NLP (team rule) | 949 → 297 | 1/15 | – | removed: 93% false | |
| Information retrieval (team rule) | 1,373 → 773 | 0/15 | – | removed: 100% false | |

  Counts are from the beta bundle (all 13 companies, Apple merged). 4,128 postings change their first two
  card tags. Judging rule: "tp" when the role itself involves the skill (or, for Mission / defense,
  military or defence work), "fp" otherwise.

### Delivery
- `NORMALIZER_VERSION` is `norm-8` (server/normalize.js:31): every stored snapshot (the norm-7 stable ones
  too) is re-derived once by `relocateJobs(rekeyBoardJobs(jobs).jobs)`, then `upgradeStoredJobs` (departments).
  The build takes about 2 min 45 s instead of 2 min 10 s until the next crawl writes norm-8.
- The browser's live path (dist/lib/normalize.js, keywords.js, juice.js) has every rule; the e2e checks it.
- No change to scripts/build-static.js or public/**. One patch for app.js (above).

## 4. Replayable steps
1. `ln -s /home/user/melon-seek/node_modules node_modules`; `mkdir -p data/beta && ln -s
   /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots
   data/beta/snapshots`.
2. Measurements (scripts in the lane's scratchpad, fix3-data/scripts/): `dump.mjs <root> <out>` runs every
   snapshot through the build's read path (forced full re-derive) and attaches Juice; `compare.mjs
   before after` per finding; `sample.mjs` draws the labelled sample; `variants.mjs` compares team-paragraph
   thresholds; `fixture.mjs` writes test/fixtures/keyword-labels-fix3.json from the hand judgments;
   `compare-dist.mjs` compares two builds' beta bundles with each build's own juice.js.
3. `UPDATE_GOLDEN=1 GOLDEN_REASON="norm-8 fix wave 3 …" node --test test/golden-normalize.test.js`;
   `node test/fixtures/refresh/jobs/make-fixtures.mjs` (norm-8 fixtures).
4. `MELON_BETA_SNAPSHOT_DIR=<empty dir> npm test`; `npm run build`; `NODE_PATH=<pw>/node_modules node
   scripts/e2e.js`.
5. Before build: `git worktree add --detach <scratch>/wt-base 790fa13`, symlinks, `node
   scripts/build-static.js --out <scratch>/fix3-data/dist-before`; served with `node scripts/cycle/serve.mjs
   --dist … --pid <scratch>/fix3-data/serve-before.pid`; the after build likewise; `shots.mjs before after
   docs/screenshots/fix3-data`; `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix3-data`.

## 5. Verification
- Red first: test/fix3-data.test.js on the base commit: 18 of its 19 first tests failed (the 19th guards
  week/month/term pay, which already worked); test/e2e/fix3-data.e2e.js on the before build: 0 of 4 passed.
  After: 22 of 22 unit tests and 4 of 4 e2e tests pass.
- `npm test` (MELON_BETA_SNAPSHOT_DIR empty, as CI): 786 tests, 785 pass in the full run; the one failure was
  V15 (timing, load 6 from other lanes), which passes alone.
- Full e2e: see the report (section 7).
- Re-baselined: test/fixtures/golden-normalize.json (norm-8), test/fixtures/refresh/jobs/snapshots (norm-8
  version), and the version assertions in test/fix-beta-pay.test.js and test/fix-pay-data.test.js;
  test/juice.test.js now expects no Juice for a USD London-only role; test/demo.test.js accepts that the
  team-paragraph rule keeps the demo's repeated "autonomous systems" intro off the skills (the 90% guard
  no longer needs to drop it).
- Screenshots (docs/screenshots/fix3-data/, desktop 1440×900 and phone 390×844, before and after):
  NVIDIA departments (list, phone, filter), Microsoft departments, Apple Art Director level, Apple store
  place (Milan), Apple part-time Juice (gone), Google technician tags (desktop and phone), Google CAD tag,
  Google qualifications (desktop and phone), Cohere London Juice (gone, main site), Anduril list (main
  site). No layout change: long department names truncate as before.

## 6. Known gaps and follow-ups
- App lane: render `sections.preferred` as "Nice to have" (and apply the patch), `job.juiceMissing.text`
  where Juice is missing, `originalInterval: 'year'` as a yearly rate, and `salary.partTime`.
- Compare lane: `salary.country` is a better pay country than the currency for Google and Microsoft lines
  (`payCountry` could prefer it).
- Recall: Evals loses about 12% of its true positives ("benchmarking and integration of state-of-the-art
  models", "benchmark creation"), Mission / defense about 7% (defence roles at non-defence companies whose
  only cue is a bare "mission"), and the team rule some team-specific skills (Anthropic's Applied AI
  "develop evals" paragraph, Apple's foundation-model "agentic settings").
- GCP precision stays at 70%: Google titles end in ", Google Cloud" (the organization) and that suffix
  still tags GCP.
- Not changed: Australian suburbs Apple lists without a city (Booragoon, Robina, Waurn Ponds…) are real
  places and still sit at the country centre; "Hanam-Si" and "Longtan" likewise.
- Part-time hours: Apple's own `standardWeeklyHours` would give hours for most part-time roles, but stored
  jobs do not keep it; the adapter could map it on the next crawl.

## 7. Change log
- 2026-10-11 04:10 lane start from 790fa13; baseline npm test 765/765.
- 04:30 BP-1, BP-2, BP-9 (salary.js, juice.js); BP-5 and tag rules, BP-11, BP-14 (keywords.js); BP-8
  (eightfold.js); BP-15 (geo.js); norm-8. Commit b36171f.
- 04:50 Apple line-broken lists; first labelled sample; team-paragraph roles by bullet lists; Evals
  patterns; defence-gated mission; `salary.country`; golden re-baselined. Commit 15ae8e2.
- 05:30 last CAD formats ("[CAD]", French "bonus target CAD"), GCP "region"; e2e file; docs; screenshots.

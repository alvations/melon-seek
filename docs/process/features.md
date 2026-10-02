# Process log: features (keywords, geo, demo)

## 1. Brief
Prompt: [prompts/features.md](prompts/features.md). Goal: turn raw job
descriptions into filterable facets (bullet sections, skill / responsibility /
fit keyword chips, seniority), turn location strings into map coordinates
without any network geocoder, and generate offline demo jobs so the whole
pipeline works when job boards cannot be reached.

Files owned: `server/keywords.js`, `server/geo.js`, `server/demo.js`,
`test/keywords.test.js`, `test/geo.test.js`, `test/demo.test.js` (plus this log
and the prompt copy).

## 2. Inputs and sources
- `docs/CONTRACT.md`: the Raw job / Job / Location shapes and the module
  signatures (`extractSections`, `extractKeywords`, `inferSeniority`,
  `splitLocations`, `geocode`, `demoJobs`).
- `server/companies.js` (read only): built-in slugs and the custom-board slug
  format `<source>-<board>`, which `demo.js` uses to build a board root URL.
- The task prompt: heading regexes, the facet label lists, seniority rules,
  location examples and the demo salary ranges.
- No external URLs were fetched (job-board hosts are blocked in the sandbox)
  and no skills were loaded.

## 3. Decisions and rationale
1. **HTML tokenizer, no DOM library.** One regex,
   `<(\/?)(tag)…>|text|<`, produces a flat list of blocks
   `{type: h|li|p, text, bold}`. Block tags flush the text buffer. `<br>`
   splits paragraphs but not list items. The `bold` flag is set when at least 80% of the
   block's non-space characters are inside `<strong>`/`<b>`. This handles the
   `<h2>`, `<p><strong>`, bare `<b>`, `<p>Heading:</p>` and `<li><p>…</p></li>`
   styles without building a tree.
2. **Heading detection.** A block counts as a heading if it is an `h*` (140
   characters or fewer), or a `p` of 110 characters or fewer that is bold,
   ends with `:`, or is ALL CAPS and 60 characters or fewer (Anduril's style). A
   paragraph that starts with a bullet glyph (`•`, `-`, `*`, and so on) counts
   as a list item.
3. **Heading classification.** The prompt's regexes, extended with `duties`,
   `the job`, `the opportunity`, `thrive`, `you'll need/bring`, `must have`,
   `who you are`, `skills`, `experience` and `you might` (to cover OpenAI/Ashby
   phrasings like "You might thrive in this role if you:"). When both match,
   explicit fit phrases (`good fit|qualifications|requirements|you will
   need/have/bring|nice to have|bonus|thrive|…`) win. Otherwise the earliest
   match wins. Lists under unclassified headings ("Benefits", "About X") are
   dropped.
4. **Fallback.** If there are no bullets, sentences starting "You will"/"You'll"
   go to `responsibilities`, and sentences starting "You have/are/bring" go to
   `fit` (a small addition to the prompt).
5. **Lexicons.** Each lexicon is a hand-curated array of
   `[label, ...patterns]`, written from general knowledge of tech, ML,
   defense and GTM job postings, with no external dataset. String patterns are
   wrapped as `(?<![A-Za-z0-9])(?:…)(?![A-Za-z0-9])` and are case-insensitive.
   RegExp literals are used as-is, so acronyms that collide with ordinary
   words stay case-sensitive: `\bRust\b`, `\bSpark\b`, `\bExcel\b`, `\bML\b`,
   `\bRL\b`, `\bRF\b`, `\bROS\b`, `\bCAD\b`, `\bGTM\b`, `\bAWS\b`. Sizes:
   **172 skills, 48 responsibility themes, 28 fit facets + 4 "global" fit
   facets** (clearance, US citizenship, travel, visa sponsorship). The global
   facets scan the whole description because those statements usually sit
   outside the bullet lists.
6. **Language edge cases.** **Go** matches only as `Golang`, next to another
   language in a list (`Python, Go, or Rust`), after
   `in|using|with|like|including|written in`, or before
   `programming|services|backend…`. It never matches when followed by `-`
   (go-to-market). **C++** and **C#** use custom boundaries. **R** is
   omitted. `Java` does not match JavaScript, and `SQL` does not match PostgreSQL.
   `Security` excludes "security clearance".
7. **Haystacks.** Skills are matched against title + all bullets + full text.
   Responsibility themes use title + responsibility bullets, falling back to
   text + department. Fit facets use the fit bullets, falling back to text.
   Results are deduped and ordered by lexicon position, not by where they
   appear in the posting.
8. **Years bucket.** A regex catches `N+ years`, `N-M years`, `at least N
   years`, `N or more years` and number words up to "twenty". It ignores
   `years old/ago` and any value above 30. "a decade" counts as 10. The bucket
   comes from the **largest** stated minimum (the headline requirement), using
   thresholds 1/3/5/8/10. The bucket label is always the first fit facet.
9. **Seniority.** Rules are checked in this order: Director+ → Intern → Staff+ →
   Manager → Senior → Entry → Mid. "Manager" means a people manager only, so a
   list of non-people manager titles (product, program, account, marketing,
   supply…) is excluded. Those titles fall through to Senior or Mid. "Fellowship" and "Fellows
   program" map to Intern, while a bare "Fellow" maps to Staff+. `Lead` maps to
   Senior, `III` to Senior, and a trailing roman `I` to Entry.
9a. **"Member of Technical Staff" is not a level.** The labs (Cohere, xAI,
    OpenAI and others) use "Member of Technical Staff" / "MTS" as a generic IC
    title, so the bare word `staff` had been sending 33 real postings to
    Staff+. Before any rule runs, `inferSeniority` now removes the generic
    phrase in all its forms: `Member(s) of (the) Technical Staff`,
    `Technical Staff (Member)`, `Member of (the) Staff` and a standalone
    `MTS`. Any other level word in the title still decides the bucket. The
    Salesforce-style ladder abbreviations are expanded first:
    `SMTS`→Senior, and `LMTS`/`PMTS`→Staff+ (LMTS sits above SMTS and is
    usually treated as Staff-level). So "Member of Technical Staff,
    Pretraining" is Mid, "Senior MTS" is Senior and "Principal Member of
    Technical Staff" is Staff+. A real "Staff Software Engineer" is
    unchanged.
10. **Gazetteer.** Data is embedded as pipe-separated text blocks:
    **246 cities** (tech, AI and defense hubs, plus Bay Area, DC-area and
    SoCal suburbs and international hubs), **52 US states/DC/PR** and **60
    countries**. City coordinates are approximate city-centre values written
    from general geographic knowledge to about 4 decimal places. State and country
    values are approximate geographic centroids to about 2 decimals. None were
    fetched from a service, so treat them as display-grade (±a few km). A `!`
    prefix marks the default for ambiguous names (Cambridge→UK, Melbourne→AU,
    Rome→IT). An explicit region or country picks the alternative (Cambridge, MA).
11. **Splitting.** Top-level separators are `| ; newline • / or & and(+Capital)`,
    never inside parentheses. Comma lists are then grouped: region and country
    tokens attach to the current group, and a known city or a "Remote" token
    starts a new group once the current group has a region (or is itself a city).
    This yields `Costa Mesa, California, United States` → 1 location and
    `San Francisco, CA, New York, NY` → 2.
12. **Geocode resolution.** Strings matching
    `remote|anywhere|wfh|distributed|virtual` become `remote:true`. The country
    comes from any state, country or city token, and lat/lng is that country's
    centroid. With no country, lat/lng is null. Other strings are resolved
    in this order: (a) a whole-string alias (`Washington, D.C.`, `Bay Area`),
    (b) the first comma token as a city, filtered by the remaining
    region/country tokens, (c) a state or country centroid, (d) an unknown city
    in a known state (`Paris, Texas`), which gets the state centroid and keeps
    the city name, (e) a scan of the string for any known city name, longest
    first (`Anduril HQ - Costa Mesa`), (f) unknown, with lat/lng null.
    Two-letter capitals resolve to US states before country codes, so `CA` is
    California and `IN` is Indiana. Countries use ISO-3166 alpha-2 codes.
13. **Demo generator.** It uses mulberry32 seeded with FNV-1a of
    `melon-seek:<slug>`, so output is fully deterministic, and dates count back
    from a fixed 2026-09-30. Catalogs for Anthropic, Anduril, OpenAI and a
    generic company were written by hand from general knowledge of how these
    companies structure their boards (department names, typical teams,
    location formats such as Greenhouse's "City, State, United States" for
    Anduril, and public salary bands in the prompt's ranges). No real
    postings were copied. Titles are generic ("Software Engineer, Inference").
    Bullets are sampled from 20 domain pools plus common fit lines, so keyword
    facets vary from job to job.
14. **Demo realism and honesty.** Every posting starts with "Demo posting
    generated offline by melon-seek. This is not a real job listing." `url` is
    the board root (Greenhouse, Ashby or Lever) and never a fake job id.
    `sourceId` is `demo-<slug>-NNN`. About 6% of postings drop the salary at
    random. London postings use GBP (×0.78), Dublin postings use EUR (×0.9), and
    Zürich, Tokyo, Singapore, Sydney and Toronto postings have no salary
    (overall 9–17% have none). Salary text formats differ by company:
    Anthropic `Annual Salary: $X—$Y USD`, Anduril `US Salary Range $X—$Y
    USD`, OpenAI `$310K – $385K + Offers Equity` plus a structured `salary`
    object (mimicking Ashby), and interns `$58/hr`. The visa-sponsorship
    sentence appears in about 30% of postings, and never for Anduril
    (clearance roles).

15. **Comp extras (F2): definitions first.** I wrote the labelling guidelines
    (stored in `test/fixtures/extras-labels.json` → `guidelines`) before
    writing any rules. `equity` is true only when the text says this hire's pay
    includes, or may include, employer equity. `bonus` is true only when it
    says the same for a bonus or variable pay (commission, OTE, incentive
    compensation). Judgment calls, chosen for honest numbers over coverage:
    - Anthropic's "optional equity donation matching" is a donation benefit,
      not a statement about the offer, so it is `false`.
    - Hedges such as "this estimate excludes the value of any potential
      sign-on bonus … long-term incentives" are `false`.
    - Anduril's "equity grants … in the majority of full time offers" is
      `false` on intern, co-op and contract postings.
    - Anthropic's "For sales roles, the range … OTE … commissions" is `true`
      only on quota-carrying sales titles, not on sales enablement, sales
      strategy or pre-sales roles.
16. **Input = description text + salary summary.** Ashby puts "• Offers
    Equity • Offers Commission" only in the compensation summary, so the
    labels and the evaluation use `htmlToText(descriptionHtml) + "\n" +
    salary.text`, with `opts.title`. `server/normalize.js` `compExtras()`
    already passes the description plus `compensationSummary` and
    `salary.text`, and the title. The signature is
    `extractCompExtras(text, { title }?)`, so the contract's one-argument
    form still works.
17. **How the classifier works.** It works sentence by sentence:
    1. Strip the non-compensation senses: DEI (pay/health/racial equity;
       diversity, equity and inclusion; DEI), finance subject matter
       (private/growth equity, equity research/instruments/teams/events,
       stockholders' equity), "equity donation", and nice-to-have bonus
       ("It's a bonus if", "Bonus:", "Bonus points", "is a bonus").
    2. Skip sentences that are negations or hedges ("not eligible", "excludes").
       A negation that names interns or part-timers vetoes the facet when the
       title is one of those roles.
    3. Skip sentences that describe compensation *work* (payroll, accounting,
       ASC 718, administration, governance, "experience with", "knowledge",
       valuation, counteroffers).
    4. Skip "For sales roles" sentences unless the title is a quota-carrying
       sales role.
    5. Skip full-time-scoped sentences on intern, co-op or contract titles.
    6. Then require either a strong phrase (RSUs, restricted stock, stock
       options, equity grants/participation/options, "Offers Equity",
       "+ Equity", sign-on/annual/performance bonus, "+ Bonus",
       bonus-eligible, OTE, commission structure, "earn commissions",
       "salary + commission", incentive/variable compensation, Ashby
       "Offers Commission" / "$X Commission"), or a bare equity/bonus word
       next to a compensation cue (salary, compensation, pay, benefits,
       package, total rewards, 401k).

    `compExtrasEvidence()` returns the deciding sentences, for audits.
18. **Labelling protocol.** All labels are mine (the features agent, Claude),
    made by reading every candidate sentence of each posting in context
    (windows of ±110 characters around equity, stock, RSU, options, shares,
    bonus, commission, OTE, incentive and similar words). They were not
    labelled by a human.
    - **Dev set, 147 postings.** 13 per company were drawn at random with
      seed 20261002, plus 43 targeted hard cases: DEI, nice-to-have bonus,
      "commission" as a verb, equity as a duty, Anthropic sales roles, Shield
      AI interns, Palantir hedge-only text, Ashby commission, and multi-range
      pay. I labelled these before writing the rules, then developed the
      rules on them.
    - **Held-out set, 72 postings.** 4 per company plus 40 uniformly at
      random (seed 777001, dev excluded). I labelled these blind, with the
      rules frozen, and only then compared.
    - **Corpus audit.** After that, I reviewed every distinct evidence
      sentence template across all 5,413 snapshot postings (48 equity
      templates and 16 bonus templates), plus the negative-side sentences
      that mention candidate words.

    Excerpts in the fixture are the candidate sentences (8 at most, each 320
    characters or fewer). Each excerpt reproduces the full-text prediction
    for its posting, so the test can run without the gitignored snapshots.
19. **Demo data for F4 and F2.**
    - **Dates.** `postedAt` comes from weighted freshness bands: 1–7 days
      (15%), 8–59 (45%), 60–179 (27%) and 180–400 (13%). Four role templates
      are flagged `evergreen` (for example "Research Engineer, Pretraining"
      and "Production Technician") and draw 180–400 days 60% of the time.
      `updatedAt` falls between `postedAt` and the fixed base date
      2026-09-30.
    - **`reqId`.** Greenhouse-like catalogs get `DEMO-<SLUG>-<n>`. Ashby
      (OpenAI) gets `null`.
    - **Extras phrasing per catalog.** These mirror the real patterns seen
      while labelling, paraphrased rather than copied:
      - Anthropic: an equity line in 35% of postings, an OTE sentence that
        counts only for sales titles, and an occasional performance bonus.
      - Anduril: an equity line scoped to "most full-time offers", so it is
        not credited to interns, plus an occasional signing bonus.
      - OpenAI: an Ashby-style `compensationSummary` with "Offers Equity",
        "Offers Commission" on sales roles, and "Multiple Ranges".
      - Generic: "base salary + bonus + benefits + equity".
    - **Negatives in the demo text.** About 25% of postings carry the line
      "pay equity … diversity, equity and inclusion", and one common fit
      bullet reads "It's a bonus if you have contributed to open source".
    - **Multi-zone pay.** About 15% of US salaried roles list two
      location-based ranges, in the per-location wording `salary.js`
      recognises (2 zones). OpenAI's version is structured instead:
      `salary.zones: 2` plus a two-tier `payRanges`.

20. **BUG-5: board boilerplate is not a keyword (2 layers).**
    1. **`boilerplateParagraphs(htmlList, {minShare 0.5, minJobs 5})`.**
       It uses the same block tokenizer as `extractSections`. A block is a
       paragraph or list item; its key is the lower-cased text with
       whitespace collapsed, curly quotes made straight, and trailing
       punctuation removed. Keys are hashed with cyrb53 (53-bit, pure JS,
       browser-safe). A hash goes in the set when the block appears on at
       least `ceil(0.5 n)` postings (and at least 2). Headings and blocks
       under 20 characters are never included, so "Responsibilities:" and
       "Benefits" keep structuring sections.
       - `normalizeJobs` computes the set once per board.
         `normalizeJob(raw, company, {boilerplate})` gets keyword text from
         `descriptionText(html, {skip})`.
       - Two things keep reading the full text: `descriptionHtml` (for
         display) and `extras`, because the equity line is boilerplate
         *and* the signal.
       - **Refinement beyond the brief:** bullets under a
         responsibilities or fit heading are always kept as role content,
         even when shared. So `sections` never depend on the set, and the
         guard handles a truly ubiquitous bullet. On real data this
         changes nothing: at 0.5, 0 of 95,394 section bullets (Anthropic, Anduril, OpenAI, Shield AI, Scale AI) were
         boilerplate.
       - **Real-data check:** the share distribution is bimodal. Block
         shares are about 100% or below 30%, and no block falls in the
         30–50% band on any board. The boilerplate set holds 13 blocks
         for Anthropic, 13 for Anduril, 8 for OpenAI, 5 for Shield AI and
         7 for Scale AI.
    2. **`dropUbiquitousKeywords(jobs, {maxShare 0.9, minJobs 20})`.** It
       runs after extraction in `normalizeJobs`. The dropped labels and
       their counts are attached to the returned array as a
       *non-enumerable* `jobs.droppedKeywords` (JSON and deepEqual ignore
       it), so the server and build can copy it into
       `meta.droppedKeywords`. On real snapshots the guard drops nothing,
       because layer 1 already fixes every board. In demo data it fires
       once: Anduril's per-role intro says "autonomous systems" on every
       posting, so "Autonomy" is dropped.
    3. **`rekeyBoardJobs(jobs)`.** It re-derives sections and keywords of
       *already normalized* jobs (snapshot or cache files written by older
       code) with both layers, for the server and build to apply.
    4. **Performance.** A bounded memo (3,000 entries) shares one
       tokenization per description across the boilerplate, sections and
       text passes. On Anduril's 2,418 postings, `normalizeJobs` takes about
       12–15 s versus about 14 s before. Keyword regexes (about 5 ms per
       job) were already the cost.
    5. **Demo.** Every posting now has an "About <company>" blurb and a
       recruiting-scam or EEO notice, both written to contain keyword
       triggers (interpretability, multimodal, autonomy, computer vision,
       security, recruiters, visa). Without the fix these become chips on
       100% of jobs. The generic intro no longer says "go-to-market".

21. **UX-3: canonical location names (`geo.js`).** `geocode()` now
    returns `name` as a canonical display name. The source string is kept
    as the new field `rawName`, so the Location shape gains one field.
    The rules, in `canonicalName(loc)`:
    - Remote → `Remote`, or `Remote (CC)` when a country is known. The
      region is dropped, so "Ontario - Remote" becomes `Remote (CA)`.
    - A US city → `City, ST`.
    - A non-US city → `City, Country`, using `UK` for GB. City-states drop
      the duplicate country (`Singapore`, `Hong Kong`).
    - A region only → `Region, Country` (`Ontario, Canada`, `Texas, US`).
    - A country only → the country name.
    - Anything unknown → the raw string, trimmed.

    Supporting changes:
    - `prefecture`, `metropolis` and `province` were added to the noise
      words, so "Tokyo Prefecture" resolves to Tokyo.
    - ISO-3 country codes were added (CAN, AUS, IND, JPN, GBR and others),
      because "Ontario, CAN" had not resolved to Canada.
    - `normalizeLocations` already dedupes by `name`, so variants within
      one job now merge.

## 4. Replayable steps
```sh
cd /home/user/melon-seek
cat docs/CONTRACT.md server/companies.js         # read the contract
# write server/geo.js, server/keywords.js, server/demo.js, then:
node --test test/keywords.test.js test/geo.test.js test/demo.test.js
# ad-hoc pipeline check over all demo catalogs (prints facet counts):
node -e 'import("./server/demo.js").then(async d=>{const k=await import("./server/keywords.js");
  for(const s of ["anthropic","anduril","openai","greenhouse-x"]){const j=d.demoJobs(s,s);
  console.log(s,j.length,k.inferSeniority(j[0].title),k.extractKeywords({title:j[0].title,sections:k.extractSections(j[0].html),text:j[0].text}))}})'
```
Node v22.22.0. There are no dependencies and no build step.

F2 comp-extras labelling and evaluation (needs the local, gitignored
`data/snapshots/*.json`; `eval` falls back to the fixture excerpts):
```sh
node docs/process/scripts/extras-eval.mjs sample dev       # re-draws the 147-posting dev sample (seed 20261002) for labelling
node docs/process/scripts/extras-eval.mjs sample holdout   # re-draws the 72-posting held-out sample (seed 777001)
node docs/process/scripts/extras-eval.mjs eval             # precision/recall of extractCompExtras vs test/fixtures/extras-labels.json
node docs/process/scripts/extras-eval.mjs audit equity     # every distinct evidence template over all snapshot postings
node docs/process/scripts/extras-eval.mjs audit bonus
node --test test/keywords.test.js test/geo.test.js test/demo.test.js
node docs/process/scripts/boilerplate-report.mjs anthropic anduril openai   # BUG-5 before/after chip counts on real snapshots
```

## 5. Verification
- `node --test test/keywords.test.js test/geo.test.js test/demo.test.js` →
  **32 tests, 32 pass, 0 fail** (~1.1 s).
- The tests cover the Anthropic h2 format, `<p><strong>`, `<b>`, ALL-CAPS and
  colon headings, `<br>` bullets, the prose fallback, malformed HTML, heading
  classification, the Go/C++/C#/R/Java/SQL edge cases, global fit facets,
  year buckets, 22 seniority titles, the prompt's split examples,
  disambiguation, remote, centroids and unknowns, and demo shape, determinism,
  count, URL roots, salary ranges, GBP, missing-salary ratio, and that every
  demo location geocodes and every demo job yields at least 4 responsibility
  bullets and 3 fit bullets.
- A manual run over the demo data gave Anthropic 111 jobs (89 distinct skills),
  Anduril 120 (66), OpenAI 120 (87) and a generic board 75 (78), with 0
  unresolved locations.

- After the MTS fix (2026-10-02): `node --test test/keywords.test.js` →
  14/14 pass, and all three of my test files → 33/33. The new test has 25 MTS / Technical Staff titles in the formats
  Cohere and xAI use, plus controls. `npm test` (whole repo) → 155 tests, 151
  pass, 4 fail. All 4 failures are FX-table assertions in
  `test/features.test.js` (2 subtests) and `test/juice.test.js` (1). They
  compare `public/viz/palette.js` and `public/features/shared.js` rates and
  do not involve `server/keywords.js`, `geo.js` or `demo.js`.

- **F2 comp extras (2026-10-02).** 219 hand-labelled real postings
  (anduril 45, anthropic 29, openai 35, shieldai 26, cohere 21, palantir 22,
  scaleai 23, xai 18). 143 are equity-positive and 48 bonus-positive.

  | Set | Facet | TP / FP / FN | Precision | Recall |
  |---|---|---|---|---|
  | Held-out, blind, frozen rules v1 (72) | equity | 52 / 2 / 0 | **0.963** | 1.000 |
  | Held-out, blind, frozen rules v1 (72) | bonus | 8 / 0 / 1 | **1.000** | 0.889 |
  | Dev (147), rules developed here | equity | 91 / 0 / 0 | 1.000 | 1.000 |
  | Dev (147), rules developed here | bonus | 39 / 0 / 0 | 1.000 | 1.000 |
  | All 219, final rules | equity | 143 / 0 / 0 | 1.000 | 1.000 |
  | All 219, final rules | bonus | 48 / 0 / 0 | 1.000 | 1.000 |

  - **v1 held-out errors.** Two equity false positives (Anduril's
    full-time-only grant line on a "(Contract)" recruiter and a co-op) and
    one bonus false negative (Ashby "$189K – $220.5K Commission"). Both are
    general patterns and were fixed. After the fixes the held-out set is no
    longer blind, so **the honest out-of-sample estimate is the v1 row:
    equity precision 96.3%, bonus precision 100%.**
  - **Corpus audit (5,413 postings).** This found 12 bonus false positives
    ("install and commission systems" as a verb), 8 equity false positives
    (equity as HR or finance work, e.g. "employees understand their equity
    compensation", "Equity teams", "equity instruments") and 3 non-quota
    sales-org titles. All were fixed with general patterns. After the fixes
    no evidence template is a false positive.
  - **Final corpus rates.** Equity 4,004/5,413 and bonus 737/5,413.
    By company:
    - Anduril: equity 2,368/2,418, bonus 0.
    - Shield AI: equity 461/581, bonus 460.
    - Palantir: equity 200/320, bonus 200.
    - OpenAI: equity 663/833, bonus 22.
    - Scale AI: equity 125/194, bonus 2.
    - xAI: equity 97/297, bonus 1.
    - Cohere: equity 79/132, bonus 2.
    - Anthropic: equity 11/638, bonus 50, because its boilerplate only
      mentions equity donation matching.
- **Tests after F2/F4.** `node --test test/keywords.test.js test/geo.test.js
  test/demo.test.js` → **40/40 pass**. The keywords tests now include
  extractCompExtras unit cases (DEI, nice-to-have, verb, duty, hedge,
  full-time scope, sales OTE, HTML input) and the fixture gate (precision
  ≥ 0.95 and recall ≥ 0.9 per facet and split). The demo tests now cover
  postedAt bands, reqId, extras and zones. `npm test` → 213 tests, 212 pass.
  The one failure is `test/features.test.js` "role families"
  (`roleFamily('Policy Analyst')` returns `'policy'`, expected `'legal'`),
  which belongs to the product workstream (`public/features`) and does not
  import my modules.

- **BUG-5 (2026-10-02),** measured with
  `docs/process/scripts/boilerplate-report.mjs` on the real snapshots.
  "Before" is the old per-job path and "after" is `normalizeJobs`.
  - **Labels on ≥95% of a board's jobs, before → after:** Anthropic 4 → 0,
    Anduril 6 → 0, OpenAI 1 → 0, Cohere 3 → 0, Scale AI 2 → 0,
    Shield AI 2 → 0, Palantir 0 → 0, xAI 0 → 0.
  - **Highest remaining share:** Anduril fit "Security clearance" at 81%.
    This is real: most of its roles need a clearance. On every board, all
    section bullets are kept.
  - **Anthropic (n = 638), top-10 skills:**
    - Before: Interpretability 638, Multimodal 638, Recruiting 638,
      Machine learning 270, LLMs 252, Python 186, Security 183, GTM 174,
      Alignment 128, Enterprise sales 121.
    - After: Machine learning 270, LLMs 252, Python 186, Security 183,
      GTM 174, Alignment 128, Enterprise sales 121, Marketing 120,
      Agents 115, Observability 98.
    - Fit: "Visa sponsorship" goes from 638 to 0. The rest of the top 10
      is unchanged.
  - **Anduril (n = 2,418), top-10 skills:**
    - Before: Autonomy, Computer vision, Networking, Recruiting, Security
      and Sensor fusion at 2,418 each, then Python 691, Robotics 628,
      Simulation 603, Prototyping 551.
    - After: Autonomy 730, Python 691, Robotics 628, Simulation 603,
      Prototyping 551, Security 505, Analytics 495, Mechanical design 476,
      C++ 459, Controls 438.
    - Fit is essentially unchanged: Security clearance 1,947,
      Bachelor's 1,534 and so on.
  - **OpenAI (n = 833), top-10 skills:**
    - Before: Security 833, GTM 249, Python 230, Observability 206,
      Agents 200, LLMs 184, Prototyping 176, Marketing 165,
      Machine learning 160, Alignment 139.
    - After: the same, except Security 833 → 263.
    - Fit and responsibilities are unchanged except Research 367 → 360.
  - **Tests:** `node --test test/keywords.test.js test/geo.test.js
    test/demo.test.js` → **45/45 pass**. The new tests cover
    boilerplate thresholds and normalization, protected in-section
    bullets, guard bounds, `rekeyBoardJobs`, a sampled real-snapshot check
    (skipped when the snapshots are absent), and demo boilerplate in
    `normalizeJobs`. `npm test` → **254/254 pass**.

- **UX-3 (2026-10-02): distinct Location-filter entries per company.**
  The key is the UI's `locKey`: `name` for remote entries, else `city`.
  "Before" is the stored snapshots. "After" re-geocodes each stored
  location string.

  | Company | Before | After |
  |---|---|---|
  | anthropic | 31 | 27 |
  | anduril | 52 | 51 |
  | openai | 26 | 25 |
  | cohere | 53 | 53 |
  | palantir | 30 | 30 |
  | scaleai | 31 | 31 |
  | shieldai | 36 | 36 |
  | xai | 21 | 21 |

  - **Distinct `name` strings:** Anthropic 38 → 27 and Scale AI 35 → 31.
  - **Anthropic's merges:**
    - Four "Remote-Friendly…" variants become `Remote (US)` (53 jobs)
      and `Remote` (28).
    - "Tokyo" and "Tokyo Prefecture" become `Tokyo, Japan`.
    - "Ontario, CAN" and "Ontario, Canada" become `Ontario, Canada`.
  - **Tests:** `node --test test/keywords.test.js test/geo.test.js
    test/demo.test.js` → 46/46 pass. A new UX-3 test covers the remote,
    prefecture, format, region and country variants and `rawName`.
  - **`npm test`:** 259/260. The one failure is backend's
    `test/golden-normalize.test.js`, which is expected: location `name`
    changed and `rawName` was added. I did not re-baseline it
    (`UPDATE_GOLDEN=1 node --test test/golden-normalize.test.js`), because
    it is backend's perf reference. The coordinator should sequence that.

## 6. Known gaps and follow-ups
- Coordinates are approximate and come from general knowledge, not a
  surveyed dataset. Small towns that are not in the gazetteer fall back to the
  state centroid, or to null.
- Lexicon matching is keyword-based, so false positives are possible.
  It was tuned against the real snapshots in §6a/§6c (norm-4). Follow-ups
  from the §6c spot check, none proposed in §6a so none applied:
  - resp Security: bare `security` fires on "national security" and on
    lists of partner teams (69% precision).
  - resp Design: `prototyp\w*` fires on "prototype to production".
  - resp Analytics: `insights` fires on "share insights with Product".
  - Cohere's about-us sentence ("value they drive for our customers")
    sets Customer-facing for jobs where it isn't removed as boilerplate.
    Not investigated.
- Extra feature: `demoJobs(slug, name, opts)` takes an optional third argument
  `{source, board, url}`. A demo for an unknown slug with no `<source>-<board>`
  pattern and no opts gets `url: null`, rather than an invented URL.
- Country codes are ISO alpha-2 (`GB` for the UK). The contract only shows `US`.
- `staff` is still a Staff+ marker everywhere outside the MTS phrase, so
  non-engineering titles where "Staff" means junior ("Staff Accountant",
  "Staff Auditor", "Staff Nurse") would be misclassified. None have been seen
  yet. If they appear, add an exception list next to `MTS_PHRASE_RE`.
- Comp extras: the labels are agent-made and from one snapshot date (8
  companies, mostly boilerplate). Other boards will phrase things
  differently. Run `extras-eval.mjs audit` on new snapshots and add labels
  to the fixture.
- Comp extras: Anthropic jobs show `equity:false` because the text never
  states equity compensation. The only mention is "equity donation
  matching". This is deliberate, per the guidelines. Flip it in
  `EQUITY_NOISE_RE` if the product prefers inference.
- Comp extras: sales-ness for the "For sales roles … OTE" boilerplate comes
  from the title (`SALES_TITLE_RE`), so unusual sales titles can be missed.
- For the salary.js owner: a second tier written as `Label: $X—$Y USD` on its
  own line ("All other US locations: $335,000—$445,000 USD") is not counted
  as a zone. The phrase "The … salary range … in <locations> is:" followed
  by a range line is. The demo uses the second form.
- **BUG-5 wiring outside my files (lead or backend).** The server serves
  snapshot and cache jobs as stored (`server/index.js` `readSnapshot` and
  the cache path), and `scripts/build-static.js` does the same. Their
  keywords were computed by the old code, so QA's API check stays FAIL in
  snapshot or cache mode until either:
  - the snapshots are regenerated (`npm run snapshot`), or
  - those paths call `rekeyBoardJobs(jobs).jobs` once per board, with
    `meta.droppedKeywords` coming from its `dropped`.

  Live and demo paths, including the browser's `public/api.js`
  normalization, already get the fix through `normalizeJobs`.
- `jobs.droppedKeywords` is attached by `normalizeJobs` but is not yet in
  any response `meta`, because that is the server and build's code.
- UX-3:
  - Stored snapshots and caches keep the old names until they are
    re-normalized (the same wiring as BUG-5).
  - Anything that matched on the old raw `name` should use `rawName`
    instead. That covers `history.js`'s first-location key and the CSV
    export, which now gets canonical names.
  - The contract's Location shape should list `rawName` (lead).
  - Non-geographic regions ("Europe", "APAC", "Middle East") still show
    as their raw strings.
- The " and " separator splits multi-word country names such as "Trinidad and
  Tobago". This is rare in job boards.

## 6a. Lexicon review: proposals (applied 2026-10-02 as norm-4; results in §6c)

**Method.** All 5,413 snapshot postings, normalized with the BUG-5 fix.
Label counts come from the whole corpus. Precision was eyeballed from
matched contexts in a 1/7 sample, using a ±50-character window around the
pattern that fired. Co-occurrence was measured with Jaccard and P(b|a).
Scratch scripts were used; replay them with the `ctx` and `pairs` logic
described here.

**A. Low-precision patterns** (the noisy pattern → the proposed change):
1. **Skill "Alignment"** (736 jobs). The bare `alignment` pattern mostly
   matches business language ("ensuring alignment between business
   objectives", "driving alignment"). Drop the bare pattern and keep
   `ai alignment`, `alignment research`, `alignment science` and
   `superalignment`. Expect it to fall to roughly a fifth.
2. **Skill "Docker"** (293). `containers?` matches ISO shipping containers
   (data-center designs). Keep `docker`, `containeriz\w*` and
   `container (orchestration|images?|runtime|security|hardening)`.
3. **Skill "GPUs"**. `accelerators?` matches startup and "delivery
   accelerators". Require hardware context (`accelerator (chips?|families|
   hardware|clusters?)`) or co-occurrence with GPU, TPU or chip.
4. **Skill "Inference"** collides with "causal inference" (Statistics).
   Add a negative lookbehind: `(?<!causal |statistical |bayesian )inference`.
5. **Skill "Speech / audio"**. `speech` matches "free speech" and
   "protected speech" (xAI and trust & safety). Keep only `speech
   recognition`, `text-to-speech`, `speech models?` and `audio models?`.
6. **Skill "Excel"**. The case-sensitive `\bExcel\b` still fires on
   sentence-initial "Excel at debugging…". Require `Excel(?! at\b|s\b)`,
   or `(in|with|and) Excel`, or `Excel/`.
7. **Skill "Observability"**. `monitoring` matches financial and control
   monitoring. Keep `observability`, `prometheus`, `grafana`, `datadog`,
   `opentelemetry` and `(system|infrastructure|production) monitoring`.
8. **Skill "Composites"**. `composite` matches "composite tracking"
   (radar). Keep only `composites` and `composite (materials|structures|
   layup|manufacturing)`.
9. **Skill "Power electronics"**. `batter(y|ies)` and `power systems` match
   logistics ("hazmat rules for lithium batteries") and site generators.
   Move them to a new "Batteries" label or drop them, and keep `power
   electronics`.
10. **Skill "Contract negotiation"**. `negotiat\w*` fires on any
    negotiation (supplier, hiring). It is fine for sales, legal and
    procurement, but it is noisy on engineering roles. Proposed:
    `negotiat\w* (contracts?|agreements?|deals?|terms)` or `contract
    negotiation`.
11. **Responsibility "Security"** (1,238). `secure` ("secure executive
    alignment", "secure deals"), `protect\w*` ("fire protection",
    "lightning protection") and `threats?` fire on non-security roles.
    Drop the bare `secure` and `protect\w*`, and keep `security` plus
    `threat (model|detection|intel)\w*`.
12. **Responsibility "Writing / docs"** (very high count).
    `writ(e|ing)|document\w*` fires on "write code" and "construction
    documents". Restrict it to `documentation`, `technical writing`,
    `write (specs|docs|documentation|reports|policies|content)`,
    `whitepapers?` and `blog`.
13. **Responsibility "Design"**. `interfaces?` fires on "utility
    interfaces" and "the interface between X and Y". Drop the bare
    `interfaces?`, and keep `user interfaces?`, UI/UX, mockups,
    wireframes and prototypes.
14. **Responsibility "Customer-facing"**. `clients?` and `customers?`
    match "internal clients" and "existing customers" in infra roles.
    Proposed: `(external|enterprise)?\s?customers?` only in
    customer-verb phrases (`work with|support|engage|partner with|for`),
    or add an `internal clients?` exclusion.

**B. Near-duplicates and overlapping chips** (corpus co-occurrence):

| Pair | Counts | Jaccard | Proposal |
|---|---|---|---|
| skill "Simulation" / resp "Simulation" | 828 / 641 | 0.73 | Same signal in two facets. Keep the skill, drop the resp theme. |
| skill "GTM" / resp "Go-to-market" | 528 / 794 | 0.54 (P(resp\|skill) 0.88) | Drop skill "GTM". "Go-to-market" is a responsibility, not a skill. |
| skill "Marketing" / resp "Marketing" | 670 / 804 | 0.54 | Drop the skill (keep the resp theme). |
| skill "Security" / resp "Security" | 1,266 / 1,238 | 0.51 | Keep both after fix A11 (skill = security engineering, resp = security work). Revisit. |
| skill "Interpretability" / resp "Interpretability" | 18 / 10 | 0.56 | Drop the resp theme (the skill covers it). |
| skill "Autonomy" / resp "Autonomy" | 1,202 / 656 | 0.39 | Drop the resp theme. |
| skill "Program management" / resp "Program management" | 752 / 1,924 | 0.29 | Drop the skill (it's a responsibility). |
| skill "Analytics" / resp "Analytics" | 850 / 2,665 | 0.22 | Drop the skill, and tighten the resp theme (bare `analy[sz]\w*` is very broad). |
| skill "Evals" / resp "Evaluation" | 312 / 1,149 | 0.22 | Rename the resp theme "Model evaluation" and require model/eval context. `evaluat\w*` alone fires on "evaluate vendors". |
| skill "Systems engineering" / resp "Systems engineering" | 434 / 220 | 0.29 | Drop the resp theme. |
| skill "Data pipelines" / resp "Data pipelines" | 268 / 431 | 0.33 | Drop the skill. |
| skill "Recruiting" / resp "Hiring" | 249 / 650 | 0.24 | Keep both. Skill = recruiting as a profession, resp = hiring for one's own team. |
| fit "Bachelor's" / "Degree or equivalent" | 2,249 / 1,233 | 0.32 | Keep both (distinct meanings). |
| fit "Leadership" / "Management experience" | 918 / 210 | 0.09 | Keep both. |
| skill "Alignment" / fit "AI safety interest" | 736 / 420 | 0.30 | Revisit after fix A1. |

"LLMs" vs "Large language models" is **already one label**. `LLMs`
covers `llms?|large language models?|language models?|foundation
models?|frontier models?`. LLMs and Transformers (Jaccard 0.05), and
Machine learning and Deep learning (0.06), are distinct enough to keep.
Kubernetes and Docker (0.45) stay separate (different tools).

**C. Low-value labels.**
- **No hits in 5,413 postings:** Objective-C, PHP, Elixir and Spring.
  These are harmless, since a chip only shows when present. Keep them for
  other boards.
- **Fewer than 10 hits:** OCaml 3, scikit-learn 2, Ruby 2, Rails 2,
  Django 3, Flask 4, HubSpot 6, SEO 6, Redis 6, Hugging Face 6,
  Recommender systems 6, Triton 8. Keep them. The UI should show chips
  for counts of 2 or more anyway.

**Expected effect if all are applied.** Roughly −10 to −15% of chip
assignments, concentrated in Alignment, Writing / docs, Security (resp),
Design, Customer-facing and Analytics. Every change alters output, so it
should land after the perf golden test, with that golden file
re-baselined in the same change.

## 6b. Perf coordination (keywords.js)
**Status (2026-10-02):** the perf wave is done (the golden test landed and
the chart work shipped), so §6a went in as norm-4 (§6c). The notes below
are kept as history.

I own `server/keywords.js`. I am not editing it until the backend's perf
proposals arrive. I will then either implement the agreed changes myself
or grant backend written, function-scoped permission (likely
`compileLexicon`, `matchLexicon`, `extractKeywords` and
`yearsOfExperience`). Output must stay byte-identical against backend's
300-job golden test.

Candidate ideas to review with backend:
- One combined alternation pre-filter per label (`re.test` on a lowercased
  haystack once).
- Avoid re-joining haystacks.
- Skip a label's patterns when a cheap literal pre-check (`includes`)
  fails.

Lexicon changes (§6a) come after that.

## 6c. Lexicon fixes applied (norm-4)
Brief: [prompts/finish.md](prompts/finish.md). This applies the §6a
proposals as written: 14 noisy patterns (A1–A14), plus near-duplicate drops
and one rename (B). Rule: keep the UI simple, so fewer and cleaner chips.
Files changed: `server/keywords.js` (lexicons only, no matching-code
changes), `server/normalize.js` (`NORMALIZER_VERSION` norm-3 → norm-4),
`test/keywords.test.js`, and `test/fixtures/golden-normalize.json`.

**What changed** (each line has a `// §6a` comment in keywords.js):

| § | Label | Change |
|---|---|---|
| A1 | skill Alignment | Bare `alignment` dropped. Kept `alignment research`, `ai alignment`, `alignment science`, `superalignment`. |
| A2 | skill Docker | `containers?` dropped. Kept `docker` and `containeriz\w*`, added `container (orchestration\|images?\|runtime\|security\|hardening)`. |
| A3 | skill GPUs | `accelerators?` now needs hardware context: `accelerator (chips?\|families\|hardware\|clusters?)`, or co-occurrence with TPU(s) or chip(s) in the same text. (Co-occurrence with GPU already gives the chip.) |
| A4 | skill Inference | `(?<!causal \|statistical \|bayesian )inference` |
| A5 | skill Speech / audio | Bare `speech` dropped. Kept `speech recognition`, `text-to-speech`, `speech models?`, `audio models?`. |
| A6 | skill Excel | `\bExcel\b(?! (?:at\|in)\b)`. The proposal's form only excluded "Excel at". The 1-in-7 check found 3/41 false hits, all sentence-initial "Excel in …" (the same verb case), so `in` was added. |
| A7 | skill Observability | Bare `monitoring` dropped. Added `(system\|infrastructure\|production) monitoring`. |
| A8 | skill Composites | `composites` or `composite (materials\|structures\|layup\|manufacturing)`, not "composite tracking". |
| A9 | skill Power electronics | `batter(y\|ies)` and `power systems` dropped. No "Batteries" label was added (fewer chips). |
| A10 | skill Contract negotiation | `negotiat\w* (contracts?\|agreements?\|deals?\|terms)` and `contract negotiations?`. The existing `contract (review\|drafting\|management)` stays. |
| A11 | resp Security | Bare `secure`, `protect\w*` and `threats?` dropped. Kept `security(?! clearance)` and `vulnerabilit\w*` (not named as noisy), added `threat (model\|detection\|intel)\w*`. |
| A12 | resp Writing / docs | Now only `documentation`, `technical writing`, `write (specs\|docs\|documentation\|reports\|policies\|content)`, `whitepapers?`, `blogs?`. |
| A13 | resp Design | Bare `interfaces?` → `user interfaces?`. The rest stays. |
| A14 | resp Customer-facing | Customers or clients only after a customer verb: work (closely/directly) with, support, engage (with), partner with, for, serve, help, meet with, liaise with, interface with. An optional `our/the/key/strategic/prospective` and `external/enterprise` may come between. Also `(customer\|client) (relationships?\|acquisition\|engagements?)`, `customer-facing`, `client-facing`, `end users`. "Internal clients" and "existing customers" no longer fire. The verb list is my implementation of "customer-verb phrases". `liaise/interface with` and the relationship/acquisition phrases were added after a recall check (below). |
| B | skills GTM, Marketing, Program management, Analytics, Data pipelines | Dropped (the same-name or matching responsibility covers each one). |
| B | resps Simulation, Interpretability, Autonomy, Systems engineering | Dropped (the skill covers each one). |
| B | resp Evaluation → **Model evaluation** | Renamed. Needs model/eval context: `evals?`, `(model\|ai\|llm) evaluations?`, `evaluat\w* (the\|our)? (ai\|ml\|language\|frontier)? models?`, `(model\|llm) benchmarks?`, `benchmark(s\|ing)? (the\|our)? models?`, `measur(e\|ing) model (performance\|capabilities)`. "Evaluate vendors" no longer fires. |
| B | resp Analytics | Bare `analy[sz]\w*` → `analytics`, `(data\|quantitative\|statistical) analys[ie]s`, `analy[sz](e\|es\|ing) (the)? (data\|metrics\|results\|trends\|usage\|performance)`. The rest stays. |
| B | kept as proposed | skill+resp Security, Recruiting/Hiring, Bachelor's/Degree or equivalent, Leadership/Management experience, and Alignment/AI safety interest are all unchanged. |

**Method.** All 5,413 postings in `data/snapshots/*.json` (8 boards,
snapshot of 2026-10-02) were normalized with `normalizeJobs` per board. That
includes boilerplate removal and the >90% guard, the same path the server and
build use. Keywords were dumped before the change (norm-3) and after (norm-4)
and compared. Replay with `docs/process/scripts/lexicon-report.mjs`
(`dump`, `compare`, `ctx`).

**Results.**

| company | jobs | chip assignments before → after | Δ | most common chip after (share) |
|---|---:|---:|---:|---|
| anduril | 2418 | 59,447 → 53,795 | -9.5% | f:Security clearance (81%) |
| anthropic | 638 | 14,768 → 13,447 | -8.9% | r:Cross-functional (69%) |
| cohere | 132 | 2,957 → 2,691 | -9.0% | r:Cross-functional (79%) |
| openai | 833 | 18,343 → 16,660 | -9.2% | r:Cross-functional (76%) |
| palantir | 320 | 7,136 → 6,752 | -5.4% | f:Collaboration (72%) |
| scaleai | 194 | 4,817 → 4,392 | -8.8% | r:Cross-functional (82%) |
| shieldai | 581 | 16,287 → 14,632 | -10.2% | r:Cross-functional (78%) |
| xai | 297 | 5,550 → 5,093 | -8.2% | r:Operations (56%) |
| **all** | 5,413 | 129,305 → 117,462 | -9.2% | per job 23.89 → 21.70 |

Top-10 chips per company (s = skill, r = responsibility, f = fit):

- **anduril** before: f:Security clearance 1947, r:Operations 1537, f:Bachelor's 1534, r:Cross-functional 1501, f:Strong communication 1371, r:Analytics 1335, f:Defense / aerospace 1237, f:Technical depth 1152, r:Hardware integration 1088, r:Manufacturing 1025
  - after: f:Security clearance 1947, r:Operations 1537, f:Bachelor's 1534, r:Cross-functional 1501, f:Strong communication 1371, f:Defense / aerospace 1237, f:Technical depth 1152, r:Hardware integration 1088, r:Manufacturing 1025, r:Communications 986
- **anthropic** before: r:Cross-functional 441, f:Strong communication 409, r:Strategy 371, r:Operations 367, r:Infrastructure 291, r:Analytics 287, f:Technical depth 279, r:Scaling systems 271, s:Machine learning 270, r:Communications 260
  - after: r:Cross-functional 441, f:Strong communication 409, r:Strategy 371, r:Operations 367, r:Infrastructure 291, f:Technical depth 279, r:Scaling systems 271, s:Machine learning 270, r:Communications 260, s:LLMs 252
- **cohere** before: r:Cross-functional 104, r:Strategy 85, r:Customer-facing 72, f:Technical depth 70, r:Infrastructure 68, f:Strong communication 66, r:Scaling systems 60, s:Machine learning 58, s:LLMs 57, r:Operations 56
  - after: r:Cross-functional 104, r:Strategy 85, f:Technical depth 70, r:Infrastructure 68, f:Strong communication 66, r:Scaling systems 60, s:Machine learning 58, s:LLMs 57, r:Operations 56, r:Go-to-market 52
- **openai** before: r:Cross-functional 637, r:Operations 519, f:Strong communication 503, f:Ambiguity 477, r:Strategy 477, r:Scaling systems 422, r:Analytics 387, r:Infrastructure 365, r:Research 360, r:Customer-facing 338
  - after: r:Cross-functional 637, r:Operations 519, f:Strong communication 503, f:Ambiguity 477, r:Strategy 477, r:Scaling systems 422, r:Infrastructure 365, r:Research 360, r:On-call / reliability 326, r:Communications 305
- **palantir** before: f:Collaboration 230, f:Self-directed 194, s:Python 194, f:Security clearance 191, r:Operations 188, f:Technical depth 183, r:Customer-facing 182, f:Mission-driven 178, f:Strong communication 175, s:Java 159
  - after: f:Collaboration 230, f:Self-directed 194, s:Python 194, f:Security clearance 191, r:Operations 188, f:Technical depth 183, f:Mission-driven 178, f:Strong communication 175, s:Java 159, r:Cross-functional 156
- **scaleai** before: r:Cross-functional 159, r:Scaling systems 144, r:Customer-facing 128, r:Strategy 115, s:Machine learning 114, r:Operations 106, r:Communications 90, r:Infrastructure 90, s:Agents 90, s:LLMs 89
  - after: r:Cross-functional 159, r:Scaling systems 144, r:Strategy 115, s:Machine learning 114, r:Operations 106, r:Communications 90, r:Infrastructure 90, s:Agents 90, s:LLMs 89, f:Technical depth 79
- **shieldai** before: r:Cross-functional 456, f:Defense / aerospace 406, r:Operations 401, f:Bachelor's 385, f:Strong communication 341, r:Analytics 340, f:Technical depth 316, s:Autonomy 301, r:Program management 274, r:Hardware integration 273
  - after: r:Cross-functional 456, f:Defense / aerospace 406, r:Operations 401, f:Bachelor's 385, f:Strong communication 341, f:Technical depth 316, s:Autonomy 301, r:Program management 274, r:Hardware integration 273, r:Mission / defense 265
- **xai** before: r:Operations 166, f:Technical depth 159, f:Strong communication 151, r:Cross-functional 151, r:Performance optimization 140, f:Bachelor's 123, r:Infrastructure 123, s:Datacenters 123, r:Program management 118, r:On-call / reliability 112
  - after: r:Operations 166, f:Technical depth 159, f:Strong communication 151, r:Cross-functional 151, r:Performance optimization 140, f:Bachelor's 123, r:Infrastructure 123, s:Datacenters 123, r:Program management 118, r:On-call / reliability 112

Labels on ≥95% of a board's jobs after: none. The >90% guard
(`dropUbiquitousKeywords`) dropped nothing on any board: {"anduril":0,"anthropic":0,"cohere":0,"openai":0,"palantir":0,"scaleai":0,"shieldai":0,"xai":0}

The drop is 9.2%, just below §6a's predicted 10–15%. Alignment fell further
than expected (736 → 12, not "about a fifth"). A 1-in-25 sample of the 724
lost jobs was 27/29 business "alignment" ("ensure alignment with …",
"cross-functional alignment"). The 2 borderline cases were a safety
post-training role ("alignment properties") and "team alignment" at a
Safety data-science job. The 12 kept are all AI alignment.

**Precision spot check (1 in 7 of the jobs that still carry the label,
±50-char context, judged by hand).** For responsibilities, the context
comes from the title plus responsibility bullets, as `extractKeywords` sees
them.

| Fixed label | Jobs after | Sample | Correct | Main remaining noise |
|---|---:|---:|---:|---|
| s Alignment | 12 | 12 (all) | 12 | none |
| s Docker | 250 | 36 | 35 | "containerized command centers" (physical) |
| s GPUs | 257 | 37 | 35 | "GPU racks can catch fire" (fire tech), co-designing chips (DevOps) |
| s Inference | 207 | 30 | 30 | none |
| s Speech / audio | 27 | 4 | 4 | none |
| s Excel | 273 | 39 | 39 | none (3/41 "Excel in …" before the `in` fix) |
| s Observability | 390 | 56 | 55 | control-theory "observability-aware maneuvering" |
| s Composites | 185 | 27 | 27 | none |
| s Power electronics | 67 | 10 | 10 | none |
| s Contract negotiation | 79 | 12 | 12 | none |
| r Security | 795 | 114 | 79 | bare `security` (kept per A11) in "national security" and in lists of partner teams ("partner with Legal, Security, …") |
| r Writing / docs | 921 | 132 | 123 | paperwork ("carrier documentation", "provide the documentation requested") |
| r Design | 911 | 131 | 113 | `prototyp\w*` (kept per A13) in "from prototype to production" (manufacturing) |
| r Customer-facing | 745 | 107 | 94 | "support customer returns", Cohere's about-us "value they drive for our customers", "work with customer-facing teams" |
| r Analytics | 1,459 | 209 | 172 | `insights` (unchanged) in "share customer insights with Product" |
| r Model evaluation | 118 | 17 | 17 | none |

Skills: 259/263 (98%). Responsibilities: 598/710 (84%). The remaining
responsibility noise comes from patterns §6a did not propose changing.

**Recall check (what the fixes removed).**
- Security: in a 1-in-25 sample of the 443 lost jobs, 17/18 were noise
  (the recruitment-scam notice "Protecting Yourself…", "the threats they
  face", "protect the team's ability"). The exception was "a secure,
  scalable system" (sandbox service).
- Customer-facing: in a 1-in-60 sample of the 1,594 lost jobs, about 21/27
  were plain mentions of customers ("customer requirements", "deployed to
  customers"). The other 6 were real customer work ("liaise with …
  customers", "manage customer relationships", "net-new customer
  acquisition"), so the verb list was widened and 145 jobs came back
  (600 → 745).

**Golden test re-baseline (once).** Command:
`UPDATE_GOLDEN=1 GOLDEN_REASON="norm-4 features §6a lexicon fixes: 14 noisy patterns, near-duplicate chips dropped/renamed (keywords only)" node --test test/golden-normalize.test.js`.
- Why: §6a deliberately changes keyword output, and §6a always said the
  golden file would be re-baselined in the same change.
- Before the re-baseline, 250 of the 300 golden jobs differed.
- A field-by-field diff against HEAD (`git archive HEAD` into the scratchpad,
  same 300 raw jobs) found that only `keywords` differs: 250 jobs, 0 changes
  in any other field.
- `NORMALIZER_VERSION` is now norm-4, so the server re-derives stored
  snapshots and caches once (`server/pipeline.js`).

**Test expectations changed.**
- `test/keywords.test.js` "Go / C++ / C# / R handling" asserted the skill
  "GTM" for "Own our go-to-market motion". That skill is dropped (§6a B), so
  the test now asserts no GTM skill and the responsibility "Go-to-market"
  instead.
- New test "§6a lexicon fixes (norm-4)": a negative and positive pair for
  each fixed pattern, plus a check that the dropped labels are gone.
- No other expectations moved. `test/demo.test.js` still finds the skill
  Autonomy in Anduril's guard drops (that skill is kept).

**demo.js and the build warning.** `npm run build` warned "server/demo.js
references a Node global". demo.js uses none. The build's check
(`/\b(process\.|…)/`) matched the prose "…talent acquisition process. Our
recruiting team…" in a string literal (demo.js line 507). The check in
`scripts/build-static.js` now needs an identifier after `process.`
(`process\.[A-Za-z_$]`), so the warning is gone and demo text is
unchanged. Build: 0 warnings. (Logged in devops.md too.)

## 7. Change log
- 2026-10-02: geo.js written (gazetteer, split, geocode). Removed the
  `Tokyo-to` pseudo-region so Tokyo's region is null.
- 2026-10-02: keywords.js written. Seniority fixes: "architect" no longer maps
  to Staff+, and a stray "Fellow → Intern" clause was removed.
- 2026-10-02: demo.js written. The intern title became "AI Safety Fellowship"
  (so it maps to Intern). The visa sentence is now probabilistic (it had
  flagged every job) and off for Anduril.
- 2026-10-02: geo whole-string alias now checked before noise stripping
  ("Bay Area" had become "Bay"). Tests reached 32/32 passing.
- 2026-10-02: Process docs added at the coordinator's request.
- 2026-10-02: Fix from real data. "Member of Technical Staff" / "MTS" titles
  (33 postings at Cohere and xAI) were classed Staff+ and are now Mid unless
  another level word is present. SMTS→Senior, LMTS/PMTS→Staff+. Added 25
  title tests.
- 2026-10-02: F2 `extractCompExtras(text, {title}?)` and `compExtrasEvidence`
  added to keywords.js. 219 postings hand-labelled into
  `test/fixtures/extras-labels.json`. Blind v1 held-out score: equity
  P 0.963 / R 1.0, bonus P 1.0 / R 0.889. Then fixed: full-time scope,
  Ashby "$X Commission", "commission" as a verb, HR/finance-duty equity, and
  non-quota sales titles. Final score on all 219: P 1.0 / R 1.0 for both.
- 2026-10-02: demo.js F4/F2. Added `postedAt` (1–400 days, freshness bands,
  evergreen roles), `reqId`, an Ashby-style `compensationSummary`, equity
  and bonus phrasing per catalog with DEI and nice-to-have negatives, and
  multi-zone pay (text, plus `salary.zones` and `payRanges` for OpenAI).
  Added `docs/process/scripts/extras-eval.mjs`.
- 2026-10-02: BUG-5 fixed in two layers. keywords.js gained
  `boilerplateParagraphs`, `descriptionText`, `dropUbiquitousKeywords`,
  `rekeyBoardJobs`, a tokenizer memo and `extractSections(html, {skip})`.
  `normalizeJobs` and `normalizeJob` take the per-board set and run the
  guard (`jobs.droppedKeywords`). demo.js gained realistic shared
  boilerplate. Added `docs/process/scripts/boilerplate-report.mjs`.
- 2026-10-02: Lexicon review against real snapshots: 14 low-precision
  pattern fixes and 15 near-duplicate or overlap decisions proposed in §6a.
  **None applied** (they change output and are sequenced after the perf
  wave). keywords.js is frozen pending backend perf proposals (§6b).
- 2026-10-02: UX-3. geo.js now gives canonical location `name` plus
  `rawName`, with prefecture/province noise words and ISO-3 country codes.
  Anthropic filter entries went from 31 to 27. Backend's golden test needs
  a re-baseline.
- 2026-10-02: §6a applied as norm-4 (§6c). 14 pattern fixes, 5 skills and
  4 responsibilities dropped as near-duplicates, and the resp Evaluation
  renamed to Model evaluation. On the 5,413 real postings, chip assignments
  went 129,305 → 117,462 (−9.2%) and no label is on ≥95% of any board.
  Spot-check precision for the fixed patterns: skills 98%, responsibilities
  84%. The golden test was re-baselined once (only keywords changed, 250/300
  jobs). One test expectation changed (GTM skill → Go-to-market
  responsibility), and a §6a regression test was added. The build's false
  "Node global" warning on demo.js is fixed. Added
  `docs/process/scripts/lexicon-report.mjs`.

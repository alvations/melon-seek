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

## 6. Known gaps and follow-ups
- Coordinates are approximate and come from general knowledge, not a
  surveyed dataset. Small towns that are not in the gazetteer fall back to the
  state centroid, or to null.
- Lexicon matching is keyword-based, so false positives are possible
  ("Research" fires on titles, "Customer-facing" on any mention of
  customers). Tune it against real snapshots once `data/snapshots/` has data.
- Extra feature: `demoJobs(slug, name, opts)` takes an optional third argument
  `{source, board, url}`. A demo for an unknown slug with no `<source>-<board>`
  pattern and no opts gets `url: null`, rather than an invented URL.
- Country codes are ISO alpha-2 (`GB` for the UK). The contract only shows `US`.
- The " and " separator splits multi-word country names such as "Trinidad and
  Tobago". This is rare in job boards.

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

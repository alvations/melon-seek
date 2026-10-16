# Process log: fix6-fresh-data

## State
- Base 53a03ec (branch head). All 5 checks reproduced red (0/5) on the unchanged head with the
  2026-10-16 crawl.
- Done, committed and sent to the lead:
  - D-23 (product, server/geo.js): 210c34e; the e2e now covers all 7 big-tech boards, a36defd.
  - BP-10 and BP-14 (test assumptions, test/e2e/fix3-app.e2e.js): fa79727.
  - fix3-data tag (product, server/keywords.js nearCopyOf): 2cbb977 and cda76cb.
  - T20 (test assumption, test/e2e/ui.e2e.js): df1b6be.
  - The norm-11 patch (72c4ef7) was dropped in 60624f1: the lead takes salary-audit-backend's one
    bump (193205a, 8262aa3), and these changes re-derive under it.
- Verified:
  - the 5 checks pass on the rebuilt bundle (5/5);
  - `MELON_BETA_SNAPSHOT_DIR= npm test` with no data links: 1,059 tests, 1,013 pass, 0 fail.
- In progress: the full e2e suite (see section 5).
- Next: compare the full e2e run with the lead's 2026-10-16 gate, then send the final SHA list.

## 1. Brief
Prompt: [prompts/fix6-fresh-data.md](prompts/fix6-fresh-data.md). Five e2e checks went red on the
2026-10-16 crawl, and each is also red on the unchanged head. For each one, decide from the data
whether the product or the test's assumption is wrong. Fix that one without weakening the check.
Files owned:
- server/keywords.js, server/geo.js, data/cities.json, public/features/comps.js;
- the five checks' code in their e2e files;
- test/fix6-fresh-data.test.js;
- this log and the prompt.

## 2. Inputs and sources
- docs/CONTRACT.md (Job shape, geo and keywords interfaces); ROADMAP.md §8 (no new control is
  added); PLAYBOOK.md including "Checkpoints"; TEMPLATE.md; lead.md "fix-density integrated".
- Data: the 2026-10-16 crawl, linked as data/snapshots (8 boards) and data/beta/snapshots
  (7 boards). The snapshots are norm-9, so the build re-geocodes them (relocateJobs) and
  re-derives their keywords (rekeyBoardJobs) with the current code.
- server/geo.js (COUNTRIES_RAW, ISO3_TO_ISO2, resolvePlaceTokens, canonicalName),
  server/keywords.js (teamParagraphs, descriptionText, extractKeywords), public/app.js
  (disambiguateLocations, settleKeep and keyOnBoard for BP-10, sameRoleSection),
  public/features/comps.js (compsForJob: one country at a time).
- Country centroids: Google's canonical countries.csv
  (developers.google.com/public-data/docs/canonical/countries_csv). The existing rows match it
  (Kuwait 29.31, 47.48; Costa Rica 9.75, -83.75). The sandbox cannot reach it, so the two new
  rows come from that table as known, rounded the same way.

## 3. Decisions and rationale (per finding)

### 3.1 D-23: `raw location names: microsoft: "JO" (1)`. Verdict: the product was wrong
- **Evidence.** microsoft:1970393556978275, "Customer Success Account Manager", has one place,
  rawName "JO", with city, region and country all null. Its description names no city.
- **Root cause.** COUNTRIES_RAW had no Jordan. The bare-code rule (DQ-1: Eightfold lists "DE",
  "IN" and "SG" for country-only postings) only reads codes in the table. "JO" fell through to
  `unknown()`, and the Location filter showed it as written.
- **Same class elsewhere.** A scan of every board through normalizeLocations found Amazon's
  "PRI" (3 postings: Puerto Rico's alpha-3 code next to "San Juan, Puerto Rico") and
  "Manama, BHR" (Bahrain).
- **Fix (server/geo.js):**
  - :163-164 add `BH|Bahrain` and `JO|Jordan` (centroids, see section 2), and :578 the alpha-3 codes BHR and JOR.
  - :588 and :659: `PRI` is the US region PR, in capitals only, like the other alpha-3 codes.
  - :594-608 `countryName(code)`: the gazetteer's name, else the runtime's (`Intl.DisplayNames`,
    as public/app.js already names countries). User-assigned and grouping codes are not countries:
    ZZ ("Unknown Region"), EU, EZ, UN, QM to QZ, XA to XZ except XK (Kosovo), and UK.
  - :950: a whole place that is just an unknown two-letter code, and not a US state or a known
    region ("GA", "MD" and "ON" keep their region reading), is that country by name, with no
    invented coordinates.
  - :1054 and :1076: labels use countryName, so such a place reads "Kosovo", never "XK".
- **The e2e check, made stronger.** test/e2e/beta-desktop-qa.e2e.js:279 now walks all seven
  big-tech boards, not four. Google, Meta and Amazon joined beta after D-23 was written, and
  Amazon was the board with the raw codes today.
- **Left as they are.** Amazon's "Town" | "Country, Missouri, USA" (Town and Country, MO) and
  "Valladolid, Castilla" | "Leon, ESP" (Castilla y León) are names split in two. The first is split
  by splitLocations' " and " rule. The second was stored already split. Neither is a bare code;
  see section 6.

### 3.2 BP-10: `Google's own key for Columbus, OH: expected "Columbus", got ""`. Verdict: the test's assumption no longer held
- **Evidence.** Google lists Columbus, OH on 6 postings, and its key for it is "Columbus", as the
  test expects. But Apple lists only Columbus, OH (2 postings) and no longer Columbus, GA.
  disambiguateLocations adds the region only when a board lists two places of one name, so Apple
  now keys the place as "Columbus" too. The test's starting link, `#c=apple&l=Columbus, OH`, had
  0 Apple roles. With nothing to carry, the switch dropped the filter.
- **The place key is not broken.** keyOnBoard and placeOf work: the rewritten case passes.
- **Fix (test/e2e/fix3-app.e2e.js:310-357).** The case is taken from the data: a city that Apple
  lists in two or more regions and Google in exactly one of them (so Apple's key is "City, Region"
  and Google's is "City"). It prefers Columbus when it qualifies, then the most-listed. Today that
  is Cambridge, MA: Apple also lists Cambridge, England. The test still checks Apple to Google to
  Apple, Google's own key, the "Kept" toast, and Google's role count. It now also checks that
  Apple's own label lists roles. Title unchanged.

### 3.3 BP-14: `no sub-headings without a preferred list: expected 0, got 2`. Verdict: the test's assumption no longer held
- **Evidence.** The test's "plain" posting is the first other xAI posting with fit bullets:
  xai:4559147007, "Application Security Engineer". It now has 9 preferred bullets of its own, so
  "Required" and "Nice to have" are correct. On this crawl 261 of xAI's 303 postings with fit
  bullets have a preferred list.
- **Fix (test/e2e/fix3-app.e2e.js:437).** The plain posting must have no preferred list
  (42 qualify). The injected-preferred and Google description-file halves are unchanged.

### 3.4 fix3-data `[static beta]`: a Google data-centre technician tagged TPUs and GCP. Verdict: the product was wrong
- **Evidence.** google:121673751543587526, "Data Center Facilities Technician, Mechanical". Its
  skills were TPUs, GCP, Networking, Datacenters and Mechanical design. TPUs, GCP and Networking
  come from Google's AI and Infrastructure paragraph ("…key teams working on the development of
  our TPUs, Vertex AI for Google Cloud, Google Global Networking, Data Center operations…").
- **Root cause.** teamParagraphs leaves a paragraph out of the skills when it is repeated word for
  word on 3 or more postings with 3 or more roles. On this crawl the paragraph has these wordings:

  | Wording | Postings | Different titles | Team paragraph? |
  |---|---|---|---|
  | "We're the driving force behind…" | 357, plus 20 with the pay sentence in the same block | 308 and 19 | yes |
  | "the driving team" | 68 | 52 and 12, in two wordings | yes |
  | "the driving channel" | 2, plus 1 with the pay sentence | 2 and 1 | no: under the minimum of 3 |

  This technician carries the "driving channel" wording, so its sentence reached the skills.
- **Alternatives tried, with their effect measured on all 43,141 postings:**
  1. **Sentence-level team prose** (drop any sentence repeated on 3+ postings and 3+ roles):
     589 postings lose skills. Too broad. Anthropic's "Staff + Senior Software Engineer, Inference
     Infrastructure" would lose GPUs and Networking from its own role text. Rejected.
  2. **Near copy of any team paragraph, 90% shared words:** 197 postings.
  3. **Near copy, 95% shared words:** 144 postings. This still caught one role's text copied
     across its levels ("As an Senior Electrical Engineer in the Manufacturing organization…").
  4. **Near copy, 95%, of a team paragraph repeated by at least 10 roles:** 55 postings lose
     skills, none gain any, and fit and responsibilities are unchanged. Chosen.
- **Fix (server/keywords.js):**
  - :397 and :411: teamParagraphs keeps each block's text.
  - :424: the team paragraphs repeated by at least 10 roles (`NEAR_COPY_MIN_ROLES`, :447) go to
    `nearCopyOf` (:449).
  - nearCopyOf adds any block that shares a sentence of 60+ characters with one of them, is within
    5% of its length in words, and shares at least 95% of its words (`NEAR_COPY_SHARE`, :446).
  - The block hashes flow through the existing Set. normalize.js's
    `new Set([...boilerplate, ...teamOnly])` keeps them, so the crawl, the build, server mode and
    the browser's live path all apply the rule unchanged.
- **Effects to know about.** On this crawl the rule removes skills from 55 postings:
  - Microsoft: 18, "Azure" and "Cloud infrastructure" from Cloud Operations + Innovation (CO+I)
    paragraphs that have the title inserted;
  - Anduril: 17;
  - Google: 16;
  - Apple: 3;
  - xAI: 1, "AI Tutor - Italian" loses "Speech / audio", as its 12 sibling audio-tutor postings
    (Finnish, French, …) already had.

  Golden normalize: 0 of the 300 hashes change. 2cbb977 re-baselined the golden fixture by
  mistake, from an earlier threshold; cda76cb restores it. No NORMALIZER_VERSION bump of our own;
  see 3.6.

### 3.5 T20: a timeout waiting for an OpenAI row in "Same role elsewhere". Verdict: the test's assumption no longer held
- **Evidence.** The test picked the first salaried Senior software engineer at Anthropic. On this
  crawl that is anthropic:4641822008, "Senior Software Engineer, Inference", in Dublin, Ireland,
  with pay of 235,000 to 295,000 EUR.
- **Why no row.** compsForJob compares within the posting's pay country (fix3-compare, BP-3:
  never with another country's pay). It returned no rows ("no-peers"), and the drawer rightly
  says "No other company lists pay for Software engineering roles in Ireland…".
- **Not a closed Details.** fix-density's change does not hide the row. "Same role elsewhere" is
  an open fold right under the pay block (public/app.js sameRoleSection), and its rows render in
  the chart.
- 6 of Anthropic's 7 salaried Senior software engineers have an OpenAI row: the US market has an
  OpenAI Senior row with 4 postings.
- **Fix (test/e2e/ui.e2e.js:1495).** Pick a US posting (`payCountry(j) === 'US'`). The rest of
  the check is unchanged.

### 3.6 The normalizer version
A deliberate output change normally bumps NORMALIZER_VERSION, so stored snapshots are re-derived.
salary-audit-backend owns server/normalize.js, so this lane wrote a patch (72c4ef7). The lead takes
that lane's own norm-11 bump instead (193205a, 8262aa3, in the same batch), so the patch was dropped
(60624f1). Until that lands, a stored norm-10 snapshot keeps its old places and tags until the next
crawl. The crawl re-normalizes every posting from raw (scripts/snapshot.js fetchBoard), so a crawl
after deploy applies both fixes.

## 4. Replayable steps
```
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp   # 53a03ec
S=<scratch>/wt-data2/data
ln -s $S/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js                       # about 4 minutes; beta: 7/7
NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js --grep='\[D-23\]|\[BP-10\] a place carries|\[BP-14\]|fix3-data: \[static beta\]|Compstimate: T20'
# before: 0/5 passed; after: 5/5
node --test test/fix6-fresh-data.test.js          # 6/6
# CI-like: move both data links out of data/, then
MELON_BETA_SNAPSHOT_DIR= npm test
```
The investigation scripts are throwaway files in `<scratch>/fix6/`:
- unres.mjs: places with no country, per board;
- col.mjs and pairs.mjs: BP-10 candidate places;
- plain.mjs: BP-14;
- tpu.mjs, tpu2.mjs, blast.mjs and dropped.mjs: tag variants, and the old-versus-new keyword diff
  over every posting;
- t20.mjs: compsForJob in server mode.

## 5. Verification
- **The five checks** (one run, rebuilt dist): 5/5 passed. Before the fix: 0/5 on the same data.
  - The D-23 check with all 7 boards passes in 10 s.
  - Offline scan of the bundle: 0 raw location labels on any of the 7 boards (Microsoft had 1
    before, and Amazon 3).
- **Unit tests.** test/fix6-fresh-data.test.js has 6 tests, and 6 pass. With the old
  keywords.js, the near-copy tag test fails (checked against a copy of the old file).
- **CI-like run.** `MELON_BETA_SNAPSHOT_DIR= npm test` with both data links moved aside:
  1,059 tests, 1,013 pass, 0 fail, 7 skipped, 39 to-dos. The lead's gate had 1,053 and 1,007; the 6
  more are this lane's file.
- **Keyword impact** (all 43,141 postings, old against new): 55 postings lose skills, none gain any,
  and fit and responsibilities are unchanged.
- **Full e2e:** see the change log.

## 6. Known gaps and follow-ups
- **Amazon names split in two** (geo.js and the Amazon adapter): "Town and Country, Missouri,
  USA" is split by splitLocations' " and " rule into "Town" | "Country, MO". "Valladolid, Castilla y
  Leon, ESP" was stored as "Valladolid, Castilla" | "Leon, ESP". Neither is a bare code, and D-23
  does not flag them. A fix would add Town and Country, MO to the gazetteer, keep a known city
  name whole before the " and " split, and fix the stored split in server/sources/amazon.js, which
  salary-audit-backend owns.
- **Stale links.** A link to "Columbus, OH" on a board that now keys the place as "Columbus" finds
  no roles. The Location filter matches the board's own keys, and `_locAlt` only covers the
  opposite case (an old bare-city link on a board that now adds the region). This is in public/app.js
  filter code, which google-grouping owns. A possible fix: give non-clashing cities the tagged key as
  `_locAlt` too.
- **Jordan and Bahrain** have no Juice city records (data/cities.json). No posting needs one today:
  the Jordan posting is country-only, and Bahrain has no pay.

## 7. Change log
- 2026-10-16 14:28 Worktree on 53a03ec, data linked; prompt and log skeleton (a68e62d).
- 14:36 The 5 checks reproduced: 0/5.
- 14:55 D-23 geo fix and unit tests (210c34e).
- 15:05 BP-10 and BP-14 test rewrites, both pass (fa79727).
- 15:30 Keyword near-copy rule after measuring four variants (2cbb977). The golden fixture was
  restored (cda76cb): 0 of 300 hashes change.
- 15:40 T20 test rewrite, passes (df1b6be). norm-11 patch written (72c4ef7).
- 15:48 5/5 on the rebuilt bundle. D-23 extended to all 7 boards (a36defd).
- 15:52 `npm test` CI-like: 1,059 tests, 0 fail. The norm-11 patch dropped on the lead's call (60624f1).

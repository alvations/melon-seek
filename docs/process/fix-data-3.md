# Process log: fix-data-3

## State
- **Done:** D-38, MR-28, the no-row Juice rule, D-41, D-42, V-45, Town and Country, old location and
  department links, UX-32; norm-12 with the golden file re-baselined (0 of 300 hashes changed); unit tests
  (test/fix-data-3.test.js) and e2e (test/e2e/fix-data-3.e2e.js); DATA_SOURCES, CONTRACT and
  methodology-review-beta-2 (MR-28 fixed) updated; two patches for other lanes.
- **In progress:** the after build, census and e2e runs (§5).
- **Next:** send the SHAs to the lead; then nothing in this lane.

## 1. Brief
Prompt: [prompts/fix-data-3.md](prompts/fix-data-3.md). Data and backend fixes from beta round 3: the Google
Fellow levelled Intern and quarantined (D-38), minimums and shift-inclusive pay pooled as base pay (MR-28), Juice
at a place the posting gives no pay row (lead decision 2026-10-16), place names (D-41, D-42, V-45, Town and
Country, old "Columbus, OH" links) and raw department names (UX-32). Files: server/vet.js, server/geo.js,
server/sources/upgrade.js, server/families.js, scripts/build-market.js, the location-key alias and the one Juice
line in public/app.js. Outside the list, small and named to the lead: server/salary.js (the shared Fellow-rank
predicate), server/keywords.js (the level rule), server/juice.js (one function), server/normalize.js (the
version), public/features/roles.js (one regex), the version pins in three tests, and app.js's search haystack.

## 2. Inputs and sources
- docs/CONTRACT.md (all sections), docs/DATA_SOURCES.md §7 and §7a, docs/process/PLAYBOOK.md ("Checkpoints",
  "Known traps"), docs/process/TEMPLATE.md.
- Findings: docs/QA.md "Full QA pass (desktop, beta) 2026-10-16" (D-38, D-41, D-42), docs/process/viz-review-beta-2.md
  (V-45), docs/process/methodology-review-beta-2.md (MR-28), docs/process/ux-review-beta.md and -beta-2.md (UX-32,
  UX-38), docs/process/lead.md (the no-row decision, Town and Country, the Columbus link), docs/process/salary-audit-backend.md
  §5 and §6 (the 7 postings).
- The reviewers' red tests: test/e2e/beta-desktop-qa-3.e2e.js `[D-38]`, `[D-41]`, `[D-42]`; test/e2e/beta-viz-review-2.e2e.js
  `[V-45]`; test/beta-methodology-2.test.js MR-28.
- fix-pay-at-place's checkpoint (wip/fix-pay-at-place on the branch at 7afbfd6): its `payAt` already prices a place
  with no row as no pay, so the client side of the no-row rule is there; this lane did Juice.
- Data: the 2026-10-16 crawl (all snapshots norm-9, so every build re-derives them with relocateJobs).
- No skills loaded (no chart or artifact).

## 3. Decisions and rationale
1. **A Fellow rank is not a fellowship (D-38).** One predicate, `isFellowRank` in server/salary.js (the module with no
   imports, which vet.js and keywords.js already import), used by the level rule, the gate's junior class and role
   family, and `isFixedTermRole`. A rank: "Fellow" as the title's own role noun ("Fellow", "Fellow, <team>",
   "Fellow - <team>"), a distinguished-type fellow, or "<Company> Fellow". Any programme word keeps it a programme
   (fellowship, Fellows Program, program, residency, student, graduate, PhD, postdoc, intern). Anthropic's
   "Conceptual Reasoning Fellow" and Scale's "SWE Fellow - Human Frontier Collective" stay fellowships: the role noun is
   not first. Alternatives: a Google-only rule (rejected: IBM, Intel and AMD Fellows are the same rank), or dropping
   "fellow" from JUNIOR_RE (rejected: real fellowships would lose the gate).
2. **Audit of the junior rule (every board).** On the base build the only `junior_high` quarantine is the Google Fellow.
   Titles levelled Intern or junior without a plain programme word: Anthropic's 4-month fellows, Scale's 14 Human
   Frontier Collective fellows, Microsoft's "Research Fellow" (employment type Internship) and Google's 4 French
   "Étudiant-chercheur" roles, all real programmes, and **Google's "Engineering Manager, Data Residency and Fast
   Compliance"** ($207K–300K), levelled Intern because of "Residency". "Data/tax/cloud/digital/sovereign residency"
   is now left out before the programme words are read (`programmeText`).
3. **MR-28: leave the three kinds out of the cells, and count them.** The methodology review offered own groups or
   leaving them out. Own groups would add three more cell arrays to market.json for figures nobody compares with
   anything; leaving them out keeps the doc's basis true ("posted base pay ranges") and the counts say what was left
   out. A posting counts once (minimum, then shift pay, then part-time). The postings and their pay are unchanged.
4. **One Juice line, in the Juice body above the waterfall** (`.fnote.juice-gross`), not in the `where` sentence that
   fix-phone-text owns. "…includes the highest shift differential" and "…includes the top shift differential" both
   wrap to two lines on the Galaxy Fold (280 px), so the line reads "Gross pay includes top shift pay.", the pay
   block chip's own words ("Incl. top shift pay").
5. **No-row places: "some rows tied", not "every row tied".** The 7 postings all have one row tied to no listed
   place (Amazon's "San Francisco" row on a posting that lists Austin), so `postedPlaceSet` returned null and every
   place was scored on the headline. With the rule, the places of the tied rows are the posted places. The same
   change for `payLocations` is a patch (shared.js is fix-pay-at-place's).
6. **One "St." spelling, US and Canada only.** USPS and AP write "St."; UK towns are written "St Helens"; a spelled-out
   "Saint John, NB" is not St. John's. Done where an unknown town's token becomes the city.
7. **State labels.** Only states whose name is also a city's change ("New York State", "Washington State"); "California
   State" reads like the university, so other states keep "<State>, US". The District of Columbia is "Washington, DC",
   the label of the city's own postings.
8. **V-45: gazetteer entries, not a new rule.** Restricting the "district, City, Country" rule moved 300 Tokyo-ward,
   Mexico City-borough, Taguig, Ho Chi Minh and Taipei district postings off their city (checked with tools/geodiff), so
   it was reverted. The towns Amazon writes "<town>, Sao Paulo, BRA" / "<town>, Rio de Janeiro, BRA" are gazetteer
   cities now, and Amazon's ISO-3 "City, State, CCC" is one place. Luxembourg City carries the name "Luxembourg", so the
   label is unchanged and the pin moves from the country's centre to the city.
9. **Town and Country.** `splitLocations` keeps " and " names whole (a short list), and `geocodeMany` joins a stored
   pair cut at one, because the stored snapshot already holds "Town" and "Country, Missouri, USA".
10. **UX-32 at read time; the board's name stays in the snapshot.** The department itself is renamed in
    `upgradeStoredJobs` (like google-grouping's brand), so every view shows one name, and the app maps an old link's
    board name with the same function. Alternatives: display-only names in chart.js and app.js (rejected: about ten call
    sites in other lanes' files); renaming in the adapters (rejected: the snapshot would lose the board's name and
    fingerprints would change); and a `departmentPosted` field on each renamed job, tried first and dropped: the packed
    lists keep a job with an extra key as an object, so Amazon's list grew 6.75 → 7.15 MB (gzip +3.2%) and NVIDIA's
    876 → 954 kB (gzip +6.2%); on every job of the board it was still +1.3% and +4.8%.
    The names follow Microsoft's ("Software Engineering", "Technical Program Management"). 122 of NVIDIA's 142
    names change, one to one. Six NVIDIA postings' role families change, each from no family or the generic engineer
    fallback to the department's own (3 in Technical and Non-Technical Program Management: program; 2 in Accounting:
    finance; 1 "OEM Field Enablement Manager": program); a roles.js regex keeps "Verification Engineering" as chip
    design, as "Engineer, Verification" was.
11. **Old links.** Resolved once a board has loaded (`resolveOldFilterKeys`, after `settleKeep`): an `l=` value no posting
    uses is replaced when exactly one current label names the same place; a `d=` value the board no longer uses becomes
    `departmentDisplayName(value)` when the board has that department (lib/families.js, imported only then).
    Ambiguous values stay.
12. **norm-12.** The geo, level and gate rules change normalizeJob output, and a norm-11 snapshot would otherwise skip
    relocateJobs. 0 of the 300 golden hashes changed (the stable sample has none of these cases); re-baselined with
    `UPDATE_GOLDEN=1`.

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp   # f53a270
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js --out $S/fd3/dist-base          # the base build (12 min at load 25)
git archive f53a270 | tar -x -C $S/fd3/base                   # the base tree, for the before runs of the new tests
node $S/fd3/tools/census.mjs $S/fd3/dist-base $S/fd3/census-base.json
node $S/fd3/tools/junior.mjs $S/fd3/dist-base $S/fd3/old/server/vet.js   # D-38 audit
node $S/fd3/tools/norow.mjs $S/fd3/dist-base                  # the 7 no-row postings
node $S/fd3/tools/geodiff.mjs $S/fd3/dist-base                # every place the new geo.js reads differently
node $S/fd3/tools/deptmap.mjs $S/fd3/dist-base nvidia         # department names, collisions, role-family changes
UPDATE_GOLDEN=1 GOLDEN_REASON="norm-12 fix-data-3 …" node --test test/golden-normalize.test.js
node scripts/build-static.js                                  # the after build (dist/)
node $S/fd3/tools/census.mjs dist $S/fd3/census-after.json
NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep='fix-data-3|\[D-38\]|\[D-41\]|\[D-42\]|\[V-45\]'
```

## 5. Verification
(Filled in with the after build.)

## 6. Known gaps and follow-ups
- Client medians (stats line, chart, Insights) still pool minimums, shift pay and part-time hourly figures; the
  Compare companies footnote does not list them as left out: patch `docs/process/patches/fix-data-3-comps-left-out.diff`.
- `payLocations` keeps the "every row tied" rule until `docs/process/patches/fix-data-3-shared-posted-places.diff` is
  applied (fix-pay-at-place's `payAt` already applies the lead's rule).
- map.js `isApprox` still flags only 'centroid' (V-45's second half is the viz lane's); Luxembourg is a city now, so it
  is not affected.
- Apple 200679317-3337 has a footer range with no place ("" label, stored at crawl time). It prices nothing now; the
  next crawl may tie it.

## 7. Change log
- 2026-10-17 00:38 started on f53a270; baseline build of the 2026-10-16 crawl.
- 01:00 D-38 (8a443a0), MR-28 (79871b0), no-row Juice (0ae184e).
- 01:16 places, departments, old links, norm-12 (e0f828a).

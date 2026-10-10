# Process log: fix-beta-sources

## 1. Brief
Prompt: [`docs/process/prompts/fix-beta-sources.md`](prompts/fix-beta-sources.md) (verbatim). Target: `beta`
(`/melon-seek/beta/`), the big-tech boards. Fix the sources and locations findings DQ-2, DQ-4, DQ-9, DQ-10, DQ-11,
DQ-12, DQ-16 of [data-check-beta.md](data-check-beta.md) and D-23 (data side), D-24 of [docs/QA.md](../QA.md)
"Full QA pass (desktop, beta) 2026-10-10".

Files owned: `server/sources/{apple,google,eightfold,polite}.js`, `server/geo.js`, `data/cities.json` (nearby and city
records), `docs/DATA_SOURCES.md` §7 (adapter facts), new tests. New files of this lane: `server/sources/pool.js`,
`server/sources/upgrade.js`, `test/fix-beta-sources.test.js`. Worktree lane, base `8c598c2`.

## 2. Inputs and sources
- docs/CONTRACT.md (v2-v4), docs/strategy/ROADMAP.md §8, PLAYBOOK.md, TEMPLATE.md.
- data-check-beta.md (DQ-n, counts, ids, causes) and test/beta-data-check.test.js (the red to-do tests);
  docs/QA.md D-17 to D-30 and test/e2e/beta-desktop-qa.e2e.js ([D-23], [D-24]); the mobile section (no M-n of this lane).
- Code: the adapters, `server/geo.js`, `server/normalize.js` (`normalizeLocations`, `deriveSalary`, `relocateJobs`),
  `server/juice.js` (`matchCity`), `server/salary.js` (`parseSalary`, `toJobSalary`, `annualize`), `server/history.js`
  (fingerprints), `scripts/build-static.js` (`readSnapshot`), `server/pipeline.js`, `scripts/archive/ingest.js`
  (pairs stored and upgraded jobs by index), `scripts/vet-salaries.js` (scan of structured salaries),
  `public/api.js` (packed format keeps unknown job fields), `public/app.js` (Location filter groups, `metaParts`).
- Data: `data/beta/snapshots/*.json` (crawl run 38044091555, norm-5) and the stable snapshots; the real Apple and
  Google records in `test/fixtures/bigtech-{apple,google,nvidia}.json`.
- GitHub code search (hint only) for Google's job categories: the careers site filters by `category=PROGRAM_MANAGEMENT`
  and similar, but no source maps the record's slots to them; the third-party repos are not readable from here.
- No skills were needed.

## 3. Decisions and rationale
1. **Stored snapshots are upgraded when read (`server/sources/upgrade.js#upgradeStoredJobs`).** Snapshots hold
   normalized Jobs, not raw records, so an adapter fix shows only after the next crawl (Apple's takes 2 h 10 min).
   The build and the server already upgrade stored jobs with `relocateJobs`; this runs right after it, every time,
   and is idempotent (a snapshot crawled with the fixed adapters passes through). It is called from
   `scripts/build-static.js` and `server/pipeline.js`, which this lane does not own: patches
   [`fix-beta-sources-build-static.diff`](patches/fix-beta-sources-build-static.diff) and
   [`fix-beta-sources-pipeline.diff`](patches/fix-beta-sources-pipeline.diff). Not in `relocateJobs` (pay lane, and
   it must stay one job in, one job out: the archive ingest pairs stored and upgraded jobs by index), and not in the
   archive (it keeps what the board listed). Without the build patch, location fixes (geo.js, cities.json) still show;
   the Apple merge, pools, NVIDIA hybrid and Google titles and departments wait for the next crawl.
2. **DQ-2: one posting per requisition, in the adapter.** `fetchApple` groups listings by requisition
   (`appleRequisition`: `200680778-0836` and a bare `200680778` are requisition 200680778; `PIPE-…` never merge) and
   maps each group with `mapAppleRequisition`:
   - the lowest listing id is the posting (id, link, text). It is one of the existing ids, so its history entry and
     fingerprint (first location = its own place) carry on, and no posting shows as "new";
   - locations: each listing's own place first (`selectedLocation`), then the rest;
   - pay: every "Pay & Benefits" footer of every listing, with the place its `postLocationId` names (a detail can
     carry several). One distinct range: the plain text salary as before. Two or more in one currency and interval: a
     structured salary over the span (`min`/`max`, like the levels rule), `zones` = number of ranges, and
     `salary.ranges: [{ label, min, max, currency, interval: 'year', locations }]` (annual; `label` "Antioch, Cupertino"
     in the posting's words; `locations` the places' raw names, which every Job location keeps as `rawName`). The
     description gets one "Pay & Benefits (places)" section per range, so the drawer shows each place's sentence.
     The existing "Multiple pay zones" chip ("different ranges for different locations or levels") is then true.
   - `mapAppleJob(row, detail)` maps one listing and lists only the place its pay is for, so a single listing never
     prices other cities. This is what the DQ-2 to-do test checks (it normalizes two listings separately).
   - Rejected: keeping copies but trimming each to its own place (still 1,223 extra cards); one copy's pay for all
     places (Amazon's rule; prices Alturas at Cupertino pay).
   - `reqId` stays the representative listing's `jobNumber`, so the archive sees no "edited" source change.
   - Stored snapshots: `upgradeAppleJobs` does the same from the stored copies: a copy's pay is its first location's,
     and its footer is cut from the end of its description (the adapter writes it last).
3. **DQ-4: `nearby` proxies only within the same state and metro, within about 15 miles** (the existing entries:
   Long Beach for Los Angeles, Fort Meade for Baltimore). `matchCity` also checks the region, so Springfield, IL never
   matches Arlington, VA, and a cross-state proxy (Bethesda, MD for Washington, DC) cannot work. Added: Los Gatos and
   Fremont (San Jose), San Bruno and South San Francisco (San Francisco), Culver City (Los Angeles), Waltham (Boston),
   Beaverton and Hillsboro (Portland), Cary and Morrisville (Raleigh), Thornton (Denver), Addison and Irving (Dallas),
   Springfield (Arlington, VA). Not added: Westford, MA (28 miles from Boston), data-center towns (Council Bluffs,
   Haskell, Hamina, Eemshaven, Saint-Ghislain) and cities without a record (Frankfurt, Hamburg, Richmond): those need
   their own city records with sourced rents. "San Francisco Bay Area" already resolved to San Francisco after batch 2
   (alias "San Francisco Bay"); it keeps that existing convention.
4. **DQ-9 stores:** a "<name>, <country>" place that the gazetteer can only pin at the country's centre, on a posting
   that names a city or state in that country, is a store and is dropped (`isAppleStoreLocation`). Known cities written
   the same way ("Seattle, United States of America", "Denver, …") are kept; they are real places for 4 postings
   whose detail lists no full form. Checked on all of Apple: only US store entries match (118), no city.
5. **DQ-9 Part-time:** Apple's `standardWeeklyHours` < 35 is kept as Part-time only when the posting backs it: its
   title or text ("part-time", "28 hrs pw"), retail or managed-pipeline roles, students, interns, seasonal roles,
   hourly pay. Otherwise the type is not stated (`null`) rather than asserting Full-time. The raw field was never
   stored, so this cannot be checked against Apple's value; of 42 non-retail Part-time postings, 14 stay (students in
   Israel, "28 Hours PW" in France, seasonal advisers, the hourly Caffe Macs cook, "(Part-time)" titles).
6. **DQ-9 links:** each path segment is decoded once, then encoded (`encodeOnce`); stored links have `%25XX` folded
   back to `%XX`.
7. **DQ-10 / D-23, in `server/geo.js`:** generic rules, each checked against all 13 snapshots (no stable-board location
   changes: `geo-diff.mjs`, section 4):
   - an inverted country-name tail ("Korea, Republic of"; also Islamic/United/… Republic of, Province of) stays with
     its country, and a dangling stored "Republic of" part is dropped;
   - "City-CC" drops a final "-CC" that is a country code and agrees with the stated country ("Winston-Salem" and
     "Foo-CA, United States" are untouched);
   - local-script names with a sure English name are mapped (ב"ש = Be'er Sheva, the standard abbreviation; Tel Aviv,
     Haifa, Jerusalem, Yokneam, Ra'anana, Herzliya and Bangkok in their own scripts). An abbreviation that cannot be
     read with certainty (ק"א in Haifa District) is filed under the district the posting names, not guessed as a
     city;
   - a city's subdivision code before its country uses the region table ("BG, RS" Belgrade);
   - gazetteer additions for places that had no country: Macao, Maldives, Ghana (Accra), Palestine (Rawabi); "BKC"
     (Bandra Kurla Complex) is Mumbai.
   Bare country codes ("ES", "NO", "KW", "PT") already resolved after batch 2 (DQ-1); a test pins them.
8. **DQ-11 pools (`server/sources/pool.js`).** The posting's own words decide: title "Expression(s) of Interest",
   "Open … Career Opportunities" (Google's Alphabet-company and CapitalG redirects), "Join Our Talent
   Network/Community/Pool", or ending in "General Interest/Application"; description "This posting is not for a
   specific job opening". Rejected signals: "talent pool" in a description (a recruiter's or producer's duties: 7
   false hits on NVIDIA, Microsoft, Netflix, Anduril, OpenAI), "Talent …" in titles (Talent Acquisition Partner,
   Talent Sourcer), "Internship Opportunities" (Microsoft's real intern requisitions), "Manufacturing Design
   Opportunities" (no statement that it is not an opening), and age (old postings are real, per the data check).
   False-positive check: every match on all 13 boards was read; all are pools. The mark applies to every board when a
   snapshot is read, so 4 stable postings get it too (Anthropic's 2 "[Expression of Interest]", Scale AI's 2 "General
   Interest"); on the stable site a live refresh normalizes in the browser without it, until normalize.js sets it
   (follow-up).
9. **DQ-12:** NVIDIA's own LinkedIn work-mode tag (`#LI-Hybrid`, `#LI-Onsite`, and the misspellings "#LI-Hybid",
   "#LI-Hybrind") wins over `workLocationOption: 'remote_local'`; a location that says "Remote" still makes the
   posting remote (8 of the 60 list "Remote, OR, US", so they stay remote). Hybrid itself is not modelled.
10. **DQ-16:** Google titles are entity-decoded once (`googleTitle`); no other board had an encoded title.
11. **D-24: Google exposes no department.** The sf9Qmf record's 20 slots were read on the real fixtures: no
    department, team or category field. Slot 11 is a list of small integers ([2] on both Technical Program Manager
    fixtures, null on a general application), probably a job-category code, but with one observed value it cannot be
    mapped honestly; the sitemap has only id, slug and lastmod. So `department` = the brand (slot 7), the only
    grouping Google publishes: Google 3,174, YouTube 144, DeepMind 95, and 1 each for Waymo, Wing, GFiber and Verily.
    The default chart gets 7 rows instead of one; a useful split for Google needs the app lane's default grouping
    (role family) or a probe run that maps slot 11.

## 4. Replayable steps
```bash
W=<worktree>; S=<scratch>/fix-beta-sources
ln -s /home/user/melon-seek/node_modules $W/node_modules
mkdir -p $W/data/beta && ln -s /home/user/melon-seek/data/snapshots $W/data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots $W/data/beta/snapshots
git worktree add --detach $S/base-wt 8c598c2            # unchanged baseline, same symlinks
# Measurements (scripts in $S/scripts, all read-only):
ROOT=$S/base-wt UPGRADE=0 node $S/scripts/counts.mjs data/beta/snapshots   # before
ROOT=$W node $S/scripts/counts.mjs data/beta/snapshots                     # after (with upgradeStoredJobs)
ROOT=$S/base-wt node $S/scripts/juicecov.mjs data/beta/snapshots/*.json    # DQ-4 before
ROOT=$W UPGRADE=1 node $S/scripts/juicecov.mjs data/beta/snapshots/*.json  # DQ-4 after
ROOT=$W node $S/scripts/filter-labels.mjs data/beta/snapshots/*.json data/snapshots/*.json   # D-23 labels
ROOT=$W node $S/scripts/geo-diff.mjs $S/base/geo.js data/snapshots/*.json data/beta/snapshots/*.json  # location changes
node $S/scripts/pools.mjs data/beta/snapshots/*.json data/snapshots/*.json  # DQ-11 signals and false positives
# Builds (the two patches applied in the worktree for the check, reverted before commit):
git apply docs/process/patches/fix-beta-sources-build-static.diff docs/process/patches/fix-beta-sources-pipeline.diff
node scripts/build-static.js --out $S/dist ; (cd $S/base-wt && node scripts/build-static.js --out $S/base-dist)
node scripts/cycle/serve.mjs --dist $S/dist --pid $S/serve.pid        # and base-dist with base.pid
NODE_PATH=$S/../pw/node_modules node $S/scripts/shots.cjs http://127.0.0.1:<port> docs/screenshots/fix-beta-sources after
npm test ; NODE_PATH=$S/../pw/node_modules node scripts/e2e.js        # with dist/ = the patched build
git checkout -- scripts/build-static.js server/pipeline.js
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-sources
```

## 5. Verification

**Before and after, on the stored crawl** (run 38044091555, the build's read path; before = base `8c598c2`, after =
this lane with the build patch; `counts.mjs`, `juicecov.mjs`):

| Finding | Measure | Before | After |
|---|---|---:|---:|
| DQ-2 | Apple postings (listings) | 6,105 | 4,882 (one per requisition) |
| DQ-2 | extra copies of a requisition | 1,223 | 0 |
| DQ-2 | requisitions where one city shows 2+ pay ranges | 393 | 0 |
| DQ-2 | postings with per-place `salary.ranges` | 0 | 393 |
| DQ-2 | Apple posting-city pins | 9,559 | 6,118 |
| DQ-2 | Apple list file (`api/jobs/apple.json`) | 2.52 MB | 2.18 MB |
| DQ-4 | paid postings with no Juice for want of a city record (base already has batch 2's geo fixes; 670 at norm-5) | 565 | 370 |
| DQ-4 | Netflix paid postings with Juice | 159 / 294 (54.1%) | 190 / 294 (64.6%), none left for want of a city |
| DQ-9 | US store names pinned at the US centre | 118 | 0 |
| DQ-9 | Apple Part-time (not retail) | 153 (42) | 123 (14) |
| DQ-9 | double-encoded Apple links | 19 | 0 |
| DQ-10 | phantom "Republic of" locations (Apple, Netflix) | 24 + 18 | 0 |
| DQ-10 / D-23 | bad Location-filter labels on the 5 boards (codes, local script, City-CC, no country) | 135 entries | 0 |
| DQ-11 | postings marked `pool` (Apple, Google, Netflix) | 0 | 46 + 7 + 9 = 62 |
| DQ-12 | NVIDIA remote postings / with "#LI-Hybrid" | 585 / 60 | 533 / 8 (each lists "Remote, OR, US") |
| DQ-16 | Google titles with "&amp;" | 4 | 0 |
| D-24 | Google departments | 1 ("No department") | 7 (brand) |

DQ-11 counts postings, after the Apple merge: 54 Apple listings (48 "not for a specific job opening" + 6 "Join Our
Talent Network") are 46 postings. The data check's 61 was 49 + 9 + 3; Google has 7 such postings ("Open … Career
Opportunities" for Waymo, Wing, GFiber, Verily and three CapitalG ones). Stable boards: 4 (Anthropic 2, Scale AI 2).

**Location changes on every board** (`geo-diff.mjs`, old vs new geo.js over each job's stored location strings): 0
postings change on the 8 stable boards; on beta Apple 66, Netflix 18, NVIDIA 38, Microsoft 5, Google 2, all of them
the intended renames above.

**Tests:**
- `node --test test/fix-beta-sources.test.js`: 14/14 (new).
- `test/beta-data-check.test.js`: TODO removed from DQ-2, DQ-4, DQ-9 (store), DQ-9 (link), DQ-10 and DQ-16; all six
  pass, with the 4 DQ-1 tests; the other 16 to-dos belong to other lanes.
- `test/fix-pay-data.test.js`: 19/19. One expected string changed on purpose: "BG, RS" is now "Belgrade, Serbia"
  (the assertion's own message says "BG is Belgrade here"); it was "BG, Serbia".
- e2e `[D-23]` and `[D-24]` pass against this lane's build (and `[D-17]` still passes).
- **Full e2e suite** (`node scripts/e2e.js`, dist/ = the build with the patch applied): **162/184 passed, 19 failed,
  3 skipped**. Baseline (`8c598c2`, its own build, same data, same machine): 160/184, 21 failed, the same 3 skipped.
  The difference is exactly `[D-23]` and `[D-24]`; no new failure. The 19 are T21 (timing; passes alone, 26 s) and
  the other lanes' red tests `[D-18]`, `[D-20]`, `[D-21]`, `[D-22]`, `[D-26]`…`[D-30]`, `[M-19]`…`[M-27]`.
- **`npm test`** (patches applied, load 6-8): 723 tests, 706 pass, 16 to-do, 1 fail: PERF-1, a timing test, which
  passes alone (3/3). This run set `MELON_BETA_SNAPSHOT_DIR` to an empty folder: the tests that spawn a small build
  (`links-policy`, `static-build`) otherwise also bundle the real beta snapshots (`data/beta/snapshots`, symlinked
  here), which takes about 2 minutes against their 120 s timeout. The baseline has the same trap (its links-policy run
  took 2 min 0.8 s and passed just in time); with the symlink in place they pass when the machine is quiet (1 min 55 s
  here). CI has no beta snapshots, so it is unaffected. In the committed state (patches reverted), the same run: 706 pass,
16 to-do, 1 fail: V15, a timing test, which passes alone with PERF-1 (`test/perf.test.js` 3/3).

**Screenshots** (`docs/screenshots/fix-beta-sources/`, before = base build, after = this lane's build, 1440x900 unless
"phone", 390x844): `{before,after}-DQ-2-apple-list.png`, `-DQ-2-apple-requisition-drawer.png` ($150K–278K becomes
$120K–278K with "Multiple pay zones", 8 places), `-DQ-2-apple-requisition-drawer-pay.png` (the description's
"Pay & Benefits (Antioch, Cupertino)" section), `-DQ-9-apple-store-drawer.png` (Bellevue Square gone),
`-DQ-10-netflix-location-rep.png` ("Unknown Region: Republic of" gone), `-D-23-microsoft-location-all.png`,
`-D-23-nvidia-location-israel.png`, `-D-24-google-chart.png` (7 rows), `-DQ-4-netflix-los-gatos-drawer.png` (Juice
appears), `-DQ-16-google-title-drawer.png`, `-DQ-12-nvidia-remote-filter.png` (Remote only + "Compression": 2 hybrid-tagged
roles before, 0 after; 585 remote roles become 533), `-phone-D-24-google-chart.png`,
`-phone-DQ-2-apple-requisition-drawer.png`, `-phone-DQ-2-apple-list.png`, `-stable-anduril.png` (main site: 0 pixels
differ). Shrunk with `scripts/cycle/shrink-screenshots.sh` (5.7 MB to 1.5 MB).

## 6. Known gaps and follow-ups
- **Patches to apply** (lead): the build and pipeline hooks above. Without them, the Apple merge, pools, the NVIDIA
  hybrid rule and the Google titles and departments reach the site only with the next crawl.
- **Juice per place (app/Juice lanes):** a merged Apple posting's Juice uses the span's midpoint in its best city;
  `salary.ranges[].locations` lets Juice, the Ranges chart, the map and payLocations use each place's own range.
- **Pool label (app lane)** reads `job.pool`. For stable live refreshes, `normalizeJob` should set it too
  (`isTalentPool` has no imports, so normalize.js can import it).
- **Google categories:** a probe run (bigtech-probe.yml) can print slot 11 for postings of known categories; mapping
  it would give Google real departments.
- **Hybrid** is not modelled (only `remote`); 336 NVIDIA postings carry "#LI-Hybrid".
- **DQ-4 remainder** (370 paid postings): data-center towns and cities without a Juice record; each needs a sourced
  city record, not an alias.
- `scripts/refresh/jobs.js#prepareBoard` (refresh report) does not run the upgrade, so its Apple count stays 6,105
  until the next crawl.

## 7. Change log
- 2026-10-10 15:00 Prompt saved; docs, findings and tests read; worktree and baseline set up.
- 15:05 geo.js rules and gazetteer entries; cities.json nearby; label audit 135 -> 0 bad entries on the beta boards.
- 15:10 Apple adapter rewrite (listings, requisitions, stores, Part-time, links); Eightfold hybrid tag; Google titles
  and brand; pool.js; upgrade.js; build and pipeline patches; tests.
- 15:15 Bare requisition ids ("200667449") join their located siblings: 393 clashing requisitions, as in the data check.
- 15:20 Builds (this lane and baseline), screenshots before and after, desktop and phone.
- 15:35 Pool detection pre-filtered (the upgrade of all 5 boards takes about 0.2 s).
- 16:20 Full e2e on both builds; npm test; patches reverted in the worktree; commit.

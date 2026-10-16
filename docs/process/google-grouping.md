# Process log: google-grouping

## State
- **Done:**
  - 8842826, data: `server/families.js`, Google `department` and `brand`, the read-time upgrade, the labelled sample, unit tests, and `families.js` in LIB_MODULES. The full `npm test` passes on it alone. Sent to the lead.
  - 61234d8, UI: the Company grouping, the Company list in the Department filter, URL state.
  - fdc2357, e2e (7/7).
  - 1d0c848: screenshots, row lists, and the pack patch.
  - 5963f2a: this log, the prompt, and the CONTRACT section. All SHAs were sent to the lead.
  - The full `npm test` and the full e2e on the head (§5).
- **In progress:** nothing.
- **Next step:** none for this lane. Open items are in §6: the pack patch waits for the static-build owner, and Amazon brands need a decision.

## 1. Brief
- **Prompt:** [`prompts/google-grouping.md`](prompts/google-grouping.md) (verbatim, with the lead's updates).
- **Goal:** in chart mode, Google's rows become job families like the other big-tech boards' departments, instead of one huge "Google" row. A user can still zoom into one subsidiary (YouTube, DeepMind, …) or group by subsidiary.
- **Owned:**
  - `server/sources/google.js` and `server/families.js`;
  - the row-key and grouping code in `public/viz/chart.js`;
  - the group-by and filter controls and their URL state in `public/app.js`;
  - `test/google-grouping.test.js`, `test/e2e/google-grouping.e2e.js` and `test/fixtures/google-families-sample.json`;
  - this log, its prompt, `docs/screenshots/google-grouping/`, and the CONTRACT section.
- **Outside my files** (each one necessary):
  - one D-24 test in `test/fix-beta-sources.test.js`, which asserted the old mapping;
  - one line in `server/lib-modules.js`, which the lead asked for;
  - the e2e registration in `scripts/e2e.js`.

## 2. Inputs and sources
- **Code read:**
  - `server/sources/google.js`: the record's slot list. No slot holds a department or category. Slot 11 is a list of small integers ([2] on both TPM fixtures, null on a general application) that cannot be decoded from 3 records.
  - `server/sources/upgrade.js` (the read-time hook), `server/normalize.js` (which RawJob fields reach a Job), `server/history.js#fingerprint`, `server/lib-modules.js`.
  - `scripts/build-static.js#packList` (list size).
  - `public/viz/chart.js`: `keyOf`, `DIM_LABEL`, `renderClusters`, the UX-24 fold, V-21 `mainBasis`, `groups()`.
  - `public/app.js`: state and URL (`ARRAYS`, `DEFAULTS`, `FILTER_KEYS`, `ORDER`, `parseHash`, `serialize`), `filterSpec`/`failures`/`derive`, `makeChecklist`, the filter panel, `popoverParts`, `settleKeep`, `FACET_OFF`, `renderViz`, `colorBy`/`computeColorKeys`.
- **Docs read:** `docs/CONTRACT.md` (no existing company or subsidiary notion; D-24 in the beta fix-wave section), `docs/strategy/ROADMAP.md` §8 (filters: no new top-level sections; main view: no new controls), `docs/process/fix5-data.md` (the read-time upgrade pattern), TEMPLATE.md.
- **Data:**
  - Beta snapshots of 2026-10-11 (`wt-data`) and 2026-10-16 (`wt-data2`).
  - Google 3,415 → 3,821 postings. Brands on 2026-10-16: Google 3,546, YouTube 162, DeepMind 111, Waymo 1, Wing 1.
  - The other boards' departments: Apple 11, Amazon 37, Microsoft 142, Meta 45.
- **Probe records:** `test/fixtures/bigtech-google.json` and `<scratch>/bigtech/run5.txt`, `run6.txt` (probe-bigtech output from 2026-10-10). They hold Google's sf9Qmf records and Amazon's raw search rows: `business_category` facets, `company_name` legal entities.
- **External:** none fetched. `www.google.com` is denied by this session's egress proxy (CONNECT 403, recorded in the proxy status), so no category facet or search page could be probed (option a).

## 3. Decisions and rationale
1. **Job family source: a title classifier (option b), not Google's category facet (option a).**
   - The record carries no category field.
   - The search can label postings only one results page at a time. robots.txt disallows paging, and the first page of each category (about 20 postings) cannot label 3,800 postings within "a few dozen requests per crawl".
   - Slot 11 might be a category code, but 3 records cannot decode it, and live probing was blocked.
   - A deterministic classifier labels every snapshot now, stored ones included, and changes no crawl.
2. **Taxonomy:** 27 families named after the job categories Google's careers site shows (Software Engineering, Hardware Engineering, Technical Program Management, Program Management, Product Management, User Experience and Design, Data Center Operations, Network Engineering, Technical Solutions, Developer Relations, Technical Writing, Information Technology, Sales, Partnerships and Business Development, Marketing and Communications, Public Policy and Government Affairs, Business Strategy and Operations, Manufacturing and Supply Chain, Real Estate and Workplace Services, Finance, Legal, People Operations, Administrative).
   - Four more are families the other boards name as departments of their own: Research, Data Science and Analytics, Security and Privacy, Trust and Safety.
   - Their granularity matches Microsoft's ("Software Engineering", "Technical Program Management", "Product Management") and Amazon's job families.
3. **Rule order** (`server/families.js`):
   1. The role part (before the first comma): "Account Manager" in "Account Manager, Retail".
   2. Team-only families in the team part: Trust and Safety, Data Center, Government Affairs ("Engineering Analyst, YouTube Trust and Safety").
   3. The role rules on the team part ("Manager, Government Affairs …", "Director, Engineering, …").
   4. Generic role words ("Analyst" is Data Science and Analytics, "Engineer" is Software Engineering, "Architect" is Technical Solutions).
   - Within each step the first match wins. The specific roles (TPM, Data Center, Technical Solutions, Sales) come before the broad ones (Security, Software, Hardware, Program Management), so "Security Sales Specialist" is Sales and "Technical Program Manager" is not Program Management.
4. **No guess.** A title the rules can't read has no department: null, shown as "No department". "Open Career Opportunities, Wing" is a general application, not a role.
5. **Other languages:** a small table reads the Japanese, Chinese, Vietnamese and French role words Google posts in ("カスタマー エンジニア", "客户工程师", "Kỹ sư", "chercheur", "ventes"). The 2026-10-16 crawl has 144 such titles.
6. **Brand:**
   - `Job.brand` is Google's own brand slot.
   - It is not invented elsewhere. Amazon's `business_category` ("aws", "fulfillment-ops", "subsidiaries") is a business line, not a brand, and isn't stored on Jobs. Mapping it would need `amazon.js`, which is the salary squad's file.
   - No other board publishes a brand.
   - `team` stays the brand, so search ("YouTube") and the CSV are unchanged.
7. **Read time, not crawl time only.** `normalizeJob` drops unknown RawJob fields, and `normalize.js` isn't mine. So `upgradeGoogleJobs` sets `brand` (from `team`), `department` and `departmentBasis` whenever a snapshot is read, whether it is a stored or a fresh crawl. It is idempotent and returns the same object once upgraded. No posting is dropped.
8. **UI within ROADMAP §8:**
   - The Group select gets a "Company" option; this is an existing select.
   - The Company list goes inside the existing Department section, at its top, in the filter panel and in the Department chip's menu. This adds no new section, chip or bar.
   - Both show only when the board names more than one brand.
   - URL state: `b=` (repeatable, like `d=`) and `g=brand`. A `g=brand` link on a board without brands groups by the default.
9. **Honest label:** one short line (fix-density), "Grouped by job title: Google doesn’t publish departments". It appears as the Department option's tooltip, the Group select's tooltip while grouped by Department, and a note under the department list.
10. **Chart consistency:**
    - Company rows fold ("N more companies") and use the one-country median basis, as department rows do.
    - The row tooltip says "show each company" on a Company fold. This is the one text edit in the row-label code; fix-density was told.
11. **List size:** two inline fields would grow the packed Google list from 1.60 MB to 1.77 MB.
    - `docs/process/patches/google-grouping-pack.diff` makes them dict columns, like `seniorityBasis`: 1.62 MB, lossless.
    - It is a patch because `scripts/build-static.js` is not mine.
12. **History ledger:** the fingerprint hashes the department, so a Google repost of a posting closed before this change may go unlinked for up to 30 days. It is one-time and hides nothing. `server/history.js` was left alone.

## 4. Replayable steps
1. `git checkout -b google-grouping 2474fc4`. Then symlink:
   - `data/beta/snapshots` → `<scratch>/wt-data2/data/beta/snapshots`;
   - `data/snapshots` → `<scratch>/wt-data2/data/snapshots`;
   - `node_modules` → `/home/user/melon-seek/node_modules`.
2. **Samples** (`<scratch>/gg/`), mulberry32 over the sorted ids:
   - `sample.tsv`: seed 20261011, 120 postings of the 2026-10-11 snapshot.
   - `sample2.tsv`: seed 7, 100 more postings of that snapshot, excluding the first sample.
   - `sample3.tsv`: seed 1016, 100 postings of the 2026-10-16 crawl whose id and title are not in the 2026-10-11 snapshot. There are 683 such titles.
   - Each was labelled by hand from the title alone (`labels*.txt`), then written to the fixture by `bin/mkfixture.cjs`.
   - The rules were tuned with the first sample in view, then frozen before samples 2 and 3 were drawn.
3. Measure: `node <scratch>/gg/bin/measure.mjs <worktree> [miss]` reports coverage on the linked snapshot, accuracy per set, and the titles left unlabelled.
4. **Before build:** `git archive 2474fc4` into `<scratch>/gg/before-tree`, with the same links. Then `node scripts/build-static.js --out <scratch>/gg/dist-before`. After build: the same from the worktree, into `<scratch>/gg/dist-after`.
5. **Serve and shoot:**
   - `PORT=0 node scripts/cycle/serve.mjs --dist <dist> --pid <pid>`.
   - `node <scratch>/gg/bin/shots.mjs <url>/melon-seek/beta <scratch>/gg/shots before|after [extra]`. It covers 4 boards × {1440x900, 390x844} × {light, dark}, plus, with `extra`, Google by Company, b=YouTube, b=DeepMind&g=brand, the Department menu and the phone sheet. Each run also writes `<tag>-rows.json` with every chart row's name and subtitle.
   - `bash <scratch>/gg/bin/cmp.sh <shots>` compares pixels (ImageMagick AE) between the before and after shots of Apple, Microsoft and Amazon.
   - Copy into `docs/screenshots/google-grouping/`, then `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/google-grouping` (8,344 KB → 2,260 KB).
6. **Pack patch:**
   1. Edit `scripts/build-static.js`.
   2. `git diff scripts/build-static.js > docs/process/patches/google-grouping-pack.diff`.
   3. Rebuild into `<scratch>/gg/dist-pack` (Google list 1.62 MB).
   4. `git checkout scripts/build-static.js`.
7. **Tests:**
   - `MELON_BETA_SNAPSHOT_DIR= npm test` with no data links, on the data commit alone and on the head.
   - `BETA_QA_DIST=<dist> NODE_PATH=<pw>/node_modules node scripts/e2e.js --grep=google-grouping`.
   - The full e2e with data linked and `dist/` built.

## 5. Verification

### Family source and accuracy
| Measure | Result |
|---|---|
| Coverage, 2026-10-16 crawl | **3,700 / 3,821 (96.8%)** |
| Coverage, 2026-10-11 snapshot | 3,320 / 3,415 (97.2%) |
| Tuning sample (120, in view while tuning) | 117 right, 120 answered |
| Held-out sample (100, 2026-10-11, after freezing) | **92 right**, 96 answered, 4 wrong |
| Fresh sample (100 new titles, 2026-10-16) | **88 right**, 92 answered, 4 wrong |
| Precision on held-out + fresh | **180 / 188 (95.7%)** when it answers |

- **Wrong answers on held-out + fresh (8):**
  - "Product Engineering Manager, Compute and Storage" and "RTL Design Technical Lead": Software, not Hardware;
  - "Global Logistics Security and Visibility Program Lead": Security, not Supply Chain;
  - "Cloud Data and Analytics Consultant, Professional Services": Data, not Technical Solutions;
  - "Technical Operations Manager, Third-Party Data Centers": Business Strategy, not Data Center;
  - "Finance Expert Lead, Gemini Data, DeepMind": Finance, not Research;
  - "Strategic Cloud Engineer": Software, not Technical Solutions;
  - "People Analytics Intern": Data, not People Operations.
- **Unanswered (12):** mostly generic roles: "Business Intern", "Media Account Specialist … Intern", "Fellow, Core AI Foundations", "Director, Video and Programmatic".

### Google's chart rows, Department grouping (1440x900, 2026-10-16 crawl)
| Before | After |
|---|---|
| DeepMind: 111 roles, median $229K in the US | Product Management: 129 roles, median $235K in the US |
| YouTube: 162 roles, median $213K | Software Engineering: 946 roles, median $222K |
| Google: 3,546, $199K | Hardware Engineering: 210 roles, median $199K |
| Wing: 1 role, no published salary | Technical Program Management: 209 roles, median $199K |
| Waymo: 1 role, no published salary | Technical Solutions: 441 roles, median $186K |
| | Sales: 461 roles, median $148K |
| | Data Center Operations: 221 roles, median $135K |
| | 20 more departments ▾: 1,204, $194K |

- Like Apple (7 rows + "4 more departments"), Microsoft (7 + "135 more") and Amazon (7 + "30 more").
- Grouped by **Company**, Google shows the old brand rows: DeepMind 111, YouTube 162, Google 3,546, Wing 1, Waymo 1.
- With **b=YouTube**: 162 roles in YouTube's own families: Software Engineering 55, User Experience and Design 10, Product Management 13, …, "11 more departments".
- Apple, Microsoft and Amazon: identical row lists before and after (`before-rows.json`, `after-rows.json`). Their screenshots differ by at most 46 antialiasing pixels.

### Screenshots (`docs/screenshots/google-grouping/`)
- Google, before and after: `before-google-*.png`, `after-google-*.png`, at {1440, 390} × {light, dark}.
- `after-apple-*`, `after-microsoft-*`, `after-amazon-*`: unchanged from before (the pixel diff above).
- `after-google-company-*`, `after-google-youtube-*`, `after-google-deepmind-company-*`.
- `after-google-dept-menu-1440-light.png` (the Department chip's menu with the Company list) and `after-google-dept-sheet-390-dark.png` (the phone sheet).
- `before-rows.json`, `after-rows.json`.

### Tests
- `test/google-grouping.test.js`: 11/11, on families, accuracy and coverage asserted, brand, the read-time upgrade, chart keys and URL state.
- `test/e2e/google-grouping.e2e.js`: 7/7 against the after build:
  - Department rows are families and folded, with the honest tooltip;
  - the Company grouping shows brand rows, with g=brand in the URL;
  - the Company list zooms to YouTube (b=YouTube, 162 roles);
  - the phone sheet lists Company and Department;
  - Apple, Microsoft and Amazon are unchanged.
- `MELON_BETA_SNAPSHOT_DIR= npm test` with no data links:
  - on 8842826 alone (data): 1,059 tests, 1,012 pass, **0 fail**, 8 skipped, 39 todo;
  - on the head: 1,062 tests, 1,015 pass, **0 fail**, 8 skipped, 39 todo.
- Full e2e, data linked (2026-10-16 crawl), `dist/` built from the head: **302/311 pass, 5 fail, 4 skipped**.
  - The 5 failures are T20 (the OpenAI comps row), D-23 (Microsoft "JO"), BP-10 (Google has no Columbus, OH), BP-14 and fix3-data static beta (a data-centre technician tagged TPUs).
  - All 5 fail the same way on the base, 2474fc4, with the same data (`<scratch>/gg/before-tree`, `--grep` for the five). They come from the fresh crawl, not from this lane.
  - D-24 ("Google's default chart has more than one row") passes.
  - `git checkout -- docs/screenshots` was run afterwards.

## 6. Known gaps and follow-ups
- **Google's own category:** if a later probe from a host that can reach `www.google.com` decodes slot 11, or the category facet, use it as the department and keep the classifier as a fallback.
- **Amazon brands:** `business_category` lives in the raw rows only. If the user wants AWS and others as Companies, the Amazon adapter (the salary squad's) would have to keep it, and someone would have to decide which values are brands (aws, annapurna, …) and which are business lines.
- **The pack patch** waits for the static-build owner.
- **The repost-link gap** (decision 12) closes by itself 30 days after this lands.
- **Classifier misses:** 3.2% of postings have no department, and about 4% of the answers are wrong. A future lane could add rules for the misses listed above, with a new held-out sample.

## 7. Change log
- 2026-10-11: started on d50d89b. Investigated option (a): `www.google.com` was blocked by egress. Wrote the classifier and labelled the tuning sample.
- 2026-10-16: resumed on 2474fc4 after the usage-limit stop. Measured on the fresh crawl, labelled the held-out and fresh samples, then built the UI, screenshots and e2e.
- 2026-10-16: data commit 624e303 replaced by 8842826, which is self-contained: the chart-key test moved to the UI commit, and families.js was added to LIB_MODULES.
- 2026-10-16: ran the full `npm test` (0 fail, on the data commit and on the head) and the full e2e (302/311). The 5 e2e failures predate this lane: they fail the same way on 2474fc4 with the same data.

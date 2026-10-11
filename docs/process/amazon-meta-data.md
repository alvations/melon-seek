# Process log: Amazon and Meta data engineer (amazon-meta-data)

## 1. Brief
Prompt: [`docs/process/prompts/amazon-meta-data.md`](prompts/amazon-meta-data.md) (verbatim).
The user asked, on 2026-10-11, why Amazon and Meta are missing from the big-tech list, and to
get their data. This lane owns the terms, the data routes and the data. The backend engineer
(amazon-meta-backend) owns the crawler, pipeline and build. Rule while the user decides: no
request to any Amazon or Meta job listing, search endpoint or job page; robots.txt and legal
pages may be read.

Files owned and written:
- [`docs/AMAZON_META.md`](../AMAZON_META.md): the brief for the user;
- this log and the prompt file;
- `scripts/alt-data/xlsx.js` (streaming xlsx reader and a small writer), `employers.js` (entity
  allow-list), `dol-disclosure.js` (the DOL route), `sample.js` (a made-up sample in the FY2026
  layout);
- `data/alt/terms-2026-10-11.json` (the terms evidence). `data/alt/dol-amazon-meta.json` will be
  written by the workflow;
- `test/alt-data-dol.test.js`, `test/fixtures/alt-data/` (two small cuts of the real FY2026 Q3
  LCA workbook);
- patches: `docs/process/patches/amazon-meta-data-workflow.diff` (new
  `.github/workflows/alt-data-dol.yml`), `amazon-meta-data-data-sources.diff` (the terms note
  and the 7g robots.txt row of `docs/DATA_SOURCES.md`), and `amazon-meta-data-process-readme.diff`
  (a row in `docs/process/README.md`).

## 2. Inputs and sources
- Repo: `docs/DATA_SOURCES.md` §7 and the terms note, `docs/process/bigtech-data.md` (decision
  12), `beta-deploy.md`, `PLAYBOOK.md`, `TEMPLATE.md`, `server/companies.js`,
  `server/sources/{polite,amazon,meta}.js`, `scripts/probe-bigtech.js`,
  `.github/workflows/bigtech-probe.yml`, `freshness-probe.yml` and
  `.github/scripts/freshness-probe.mjs` (the capture probe and its decoder),
  `.github/scripts/beta-snapshots.mjs` (the crawl matrix), `public/features/roles.js`
  (`roleFamily`, `readableTitle`, `displayLevel`), `server/keywords.js` (`jobSeniority`),
  `server/geo.js` (`geocode`), `server/salary.js` (annual factors), `test/workflows.test.js`,
  `scripts/refresh/jobs.js` (`docFiles`: product docs are scanned for "±N% (tested on N" claims).
- GitHub Actions logs (GitHub MCP `get_job_logs`):
  - bigtech-probe run 7, **38035822525** (2026-10-10, whole boards, all 7 companies): Amazon
    22,415 postings in 308 s, 302 requests, all 200, 14,123 with pay (63.0%), 0 critical vet
    flags, snapshot capped to 8,485 under 40 MB; Meta 1,143 in 1,267 s, 1,146 requests, 906 with
    pay (79.3%), 0 critical.
  - bigtech-probe run 9, **38036154904** (2026-10-10 10:02 UTC; queued behind run 7 for two
    hours, then 4 s). `mode=full`, `companies=none`, so no adapter ran; raw requests only. It
    found:
    - the amazon.jobs footer link "Legal disclosures and notices", and amazon.com's "data
      mining, robots" clause (`nodeId=508088` 301s to `GLSBYFE9MGKKQXXM`);
    - Meta's Automated Data Collection Terms ("Effective October 7, 2024"; §1 and the start of §2);
    - Apple's site-terms anti-robot sentence and Netflix's "(iv) use any robot, spider, scraper".
    - The `href` grep needed "terms"/"legal" in the address, so it missed amazon.jobs'
      "Conditions of use" link, and metacareers.com's client-rendered footer.
  - freshness-probe **38136448486**, **38136777427**, **38137141996** (2026-10-11, this lane):
    see decision 2.
- Web search (secondary, cited in the brief): court-case summaries (hiQ v. LinkedIn, Meta v.
  Bright Data, X Corp. v. Bright Data, Nguyen v. Barnes & Noble), NLx Research Hub access terms,
  Meta's office address. No official feed or permission-request address was found for either
  company.

## 3. Decisions and rationale
1. **The pause is the only cause.** `git log -S"paused: 'terms'"` gives `3361c90` (the pause),
   then `063f5c2`, `4bd17f0` and `08e39cc`, which only mention it. The adapters' last change is
   `dcea1db`, before the pause. Run 7 shows both adapters working on the whole boards, and
   `node .github/scripts/beta-snapshots.mjs slugs` prints `["google","microsoft","apple","netflix","nvidia"]`.
2. **Primary sources through the freshness capture probe, not the big-tech probe.**
   - The sandbox proxy refuses amazon.jobs, amazon.com, metacareers.com, facebook.com, dol.gov
     and commoncrawl.org (CONNECT 403), and WebFetch cannot resolve them.
   - `bigtech-probe.yml` with only `raw` would also run **recon for all 8 companies**, because
     `mode` defaults to `recon` and an empty `companies` means all. That would request Amazon's
     and Meta's search and job pages, against the rule. Run 9 avoided this with
     `companies=none`, which matches no slug. Its raw output is grep snippets of at most 2,000
     characters, and its host list excludes dol.gov and commoncrawl.org.
   - `freshness-probe.yml` returns exact bytes (gzip+base64 chunks, sha256, fetch time). It has
     its own concurrency group, so it never queues behind or blocks the backend engineer's
     big-tech probes, and it accepts a per-request User-Agent. Every request used
     `melon-seek/0.2 (+https://alvations.github.io/melon-seek/; open-source job-postings salary chart; terms and robots.txt check)`
     with 1.2 to 1.5 s between requests. It fetched only robots.txt, footer and legal pages,
     DOL pages and file byte ranges, and Common Crawl index counts.
   - The facebook.com pages render their text on the server only for `Accept: text/html`
     (round 1 sent `*/*` and got empty shells; round 2 repeated them with the header).
3. **Which terms govern.**
   - **amazon.jobs:** the site's own footer links "Conditions of use" to amazon.com's Conditions
     of Use, and there is no amazon.jobs terms page.
   - **metacareers.com:** its robots.txt notice points to the Automated Data Collection Terms.
     Those take "Meta Company Products" from the Terms of Service, which cover "the other
     products, websites [...] we offer". No careers-specific terms were found.
   - Quotes and hashes: `data/alt/terms-2026-10-11.json`.
4. **The inconsistency is reported, not fixed.** Apple's site terms carry the same kind of
   anti-robot clause as Amazon's, and Netflix's consumer terms one aimed at "the Netflix
   service". DATA_SOURCES says the other boards' terms were not found to bar collection. The
   patch corrects that text. Pausing or keeping Apple is the user's decision (brief, decision 6).
5. **Common Crawl: counts only.** The CDX index was queried with `fl=timestamp,status,mime`, so
   no URLs and no page content. In `CC-MAIN-2026-39` (captures 2026-09-04 to 09-15): amazon.jobs
   job pages 1,614 captures (634 status 200); metacareers.com job pages 1,093 (730 status 200).
   The pages themselves were not read; whether to use them is part of the user's decision.
6. **The DOL employer allow-list.**
   - A name is normalized (upper case, punctuation to spaces, "U S" to "US", trailing INC,
     LLC, CORP, CO, LTD and the like removed) and then matched against explicit patterns per
     entity (`ENTITIES` in `employers.js`).
   - Amazon: Amazon.com Services LLC, Amazon.com, Inc., Amazon Web Services, Amazon Development
     Center U.S., Amazon Data Services, Amazon Fulfillment Services, Amazon Technologies,
     Amazon Capital Services, Amazon Logistics, Amazon Advertising, Amazon Payments, Amazon
     Retail, Amazon Media Group, Amazon Content Services, Amazon Studios, Amazon Robotics,
     Amazon Lab126, Amazon Kuiper / Kuiper Systems / Kuiper Government Solutions, Amazon
     Digital Services, Amazon Corporate, Amazon Prime Air, and A9.com.
   - Meta: Meta Platforms, Meta Platforms Technologies, Facebook (old name), Facebook
     Technologies, Meta or Facebook Payments, Instagram, WhatsApp, and Siculus.
   - Brands with their own careers sites (Audible, Twitch, Zoox, Whole Foods, Ring, Zappos,
     IMDb, One Medical) are left out, because the beta boards would be amazon.jobs and
     metacareers.com.
   - Any other employer name with a keyword (AMAZON, KUIPER, A9, META as a word, FACEBOOK,
     INSTAGRAM, WHATSAPP, SICULUS) is a **near miss**: never counted, but listed with its count
     in the summary, so the first real run shows what to add or exclude.
7. **The DOL columns kept** (`FIELDS`, by header name, so a reordered file still works):
   - LCA: case number, status, dates, visa class, job title, SOC code and title, full time,
     workers, employer, worksite city and state, wage from, to and unit, prevailing wage and
     unit, and prevailing-wage level;
   - PERM: the same idea, from `EMP_BUSINESS_NAME`, `JOB_OPP_WAGE_*`, `PRIMARY_WORKSITE_*` and
     `OTHER_REQ_IS_FULLTIME_EMP`.
   - The point-of-contact, attorney and preparer columns (names, e-mails, phones), the FEIN and
     the addresses are **never read**. Tests plant marker values there and check that none
     reaches the output.
8. **Pay rules.**
   - Annual factors are those of `server/salary.js` (hour 2080, week 52, month 12), plus
     bi-weekly 26.
   - `wage` is the midpoint of the stated range, or its lower end when there is one figure;
     `wageFrom` is reported too.
   - A filing is priced when it is certified (LCA `Certified`; PERM `Certified` or
     `Certified-Expired`), not part-time, and between $20,000 and $1,500,000 a year.
   - Quartiles are linear between ranks and rounded to $100. Title and city groups need 3 or
     more filings and are capped at the top 40 and 30.
   - Family is `roleFamily(title, { department: socTitle })`, so the SOC title helps only
     generic titles. Level is `displayLevel(jobSeniority({ title, company }))`, so a title with
     no level reads "Not stated", as on the site.
   - The DOL "prevailing wage level" (I to IV) is reported apart and never mapped to company
     levels.
9. **Streaming.** The real files (from round 2 and 3 byte ranges):
   - **LCA FY2026 Q3:** 240.2 MB, one sheet `A1:CT1032736` (98 columns, 1.53 GB of XML),
     `sharedStrings.xml` stored last (11.9 MB compressed, 40 MB inflated). Every text cell is
     a shared string, dates are serial numbers and wages are numbers.
   - **PERM FY2026 Q3:** 149 MB, 137 columns, 1.13 GB of XML.
   - So the reader streams: the header row first, then the shared strings once (header names,
     plus the indices that could be an employer of interest), then the sheet (it parses only
     rows whose employer cell, found with one `indexOf`, is a candidate), then the shared
     strings again for just the strings those rows use.
   - A synthetic 150,000-row sheet of the same shape (511 MB of XML) took 5.1 s and 438 MB of
     memory, so the real file needs well under a minute.
10. **Getting the real numbers needs a workflow.** dol.gov is unreachable from the sandbox. A
    240 MB file cannot come in through a job log. A deflate stream cannot be started in the
    middle, so ranged pieces don't help. No official filtered API was found. A workflow can
    only run pushed code.
    - The patch adds `.github/workflows/alt-data-dol.yml`: `workflow_dispatch` only, top-level
      `contents: read`, pinned SHAs, inputs through `env`, 60-minute cap, 3 requests to
      www.dol.gov.
    - It uploads the summary and the kept rows as an artifact (90 days), and prints the
      summary as freshness-probe chunks (`--emit-chunks`), so it can be rebuilt here with the
      existing decoder.
    - The lead commits `data/alt/dol-amazon-meta.json`. Pushing from a workflow would start a
      branch build (PLAYBOOK stage 3), so the workflow doesn't push.
11. **No UI.** How the DOL pay could appear is described in the brief (§4) for the user to decide.

## 4. Replayable steps
```bash
# Why they're missing
git log -S"paused: 'terms'" --format='%h %ad %s' --date=iso
node .github/scripts/beta-snapshots.mjs slugs            # ["google","microsoft","apple","netflix","nvidia"]
node --test test/bigtech-sources.test.js test/bigtech-polite.test.js test/bigtech-salary.test.js   # 36/36
# Probe logs: mcp__github__get_job_logs job 114165907201 (run 7) and 114188278743 (run 38036154904)

# Terms pages on a runner (freshness-probe.yml, input `requests` = JSON list). Round 1, e.g.:
#  [{"name":"amazonjobs-robots.txt","url":"https://www.amazon.jobs/robots.txt","ua":"melon-seek/0.2 (+https://alvations.github.io/melon-seek/; open-source job-postings salary chart; terms and robots.txt check)","sleep":1200}, ...]
# Facebook-hosted pages need "headers":{"accept":"text/html,application/xhtml+xml"}.
# Save the get_job_logs result, take its logs_content, then:
node .github/scripts/freshness-probe.mjs --decode <job.log> <dir>    # exact bytes, sha256 checked

# DOL route: tests, a dry run on the made-up sample, and the real run (on a runner)
node --test test/alt-data-dol.test.js                                  # 15/15
node scripts/alt-data/dol-disclosure.js --lca LCA.xlsx --perm PERM.xlsx --out /tmp/s.json --rows /tmp/r.csv
git apply docs/process/patches/amazon-meta-data-workflow.diff          # lead: add the workflow, push, then:
gh workflow run alt-data-dol.yml --repo alvations/melon-seek --ref claude/stoic-ride-54ddxp
# get_job_logs -> freshness-probe.mjs --decode -> data/alt/dol-amazon-meta.json (review the near
# misses in it and in the step summary, extend employers.js if needed, commit)
```

## 5. Verification
- `node --test test/alt-data-dol.test.js`: 15 pass, 0 fail. The tests cover:
  - entity matching and near misses;
  - the real LCA central directory, and the real header and first row (98 columns,
    employer in T, wage in BV/BW, serial dates);
  - XML escapes and splitting across chunks;
  - a workbook round trip with shared and inline strings, and ranged tails;
  - DOL link discovery and periods;
  - annual factors;
  - the whole CLI on the sample: counts, medians by family, level, prevailing-wage level, title
    and city, and that no personal value appears in the summary or the CSV;
  - reordered columns;
  - log-chunk transport through the freshness-probe decoder.
- `node --test test/workflows.test.js` with the workflow file in place: 6 of 6 pass. PyYAML
  parses it. The patch applies cleanly with `git apply --check`.
- The DATA_SOURCES patch: the tests that mention DATA_SOURCES pass with it applied (54 of 54),
  and it applies cleanly.
- `npm test` (2026-10-11, worktree on `c5f91d2` plus this log): 777 tests, 770 pass, 0 fail,
  7 skipped, 72.5 s.

## 6. Known gaps and follow-ups
- **The real DOL numbers are not in yet.** They wait for the lead to add and run the workflow.
  After the first run:
  - read the near misses and extend or confirm `ENTITIES`;
  - check the share of filings priced and the families marked "other";
  - consider adding the previous full year (FY2025 Q4) for larger groups.
- **Contacts.** Neither company publishes an address for permission requests. The brief gives
  the best channels found: Amazon's postal address from its Conditions of Use; Meta's
  principal office from search results, not checked against the 10-K.
- **The legal summaries are from secondary sources** (law-firm notes and news). Register.com v.
  Verio was not re-checked. None of it is legal advice.
- **NLx:** whether Amazon or Meta postings are in it is unconfirmed. A question to
  nlxresearchhub@naswa.org (the contact search results give) would settle it.
- **Common Crawl copies were counted, not read.** Using them is a user decision.
- **Amazon's file limit.** If the user unpauses Amazon, run 7 shows 8,485 of 22,415 postings
  fit under 40 MB; that is for the backend engineer.

## 7. Change log
- 2026-10-11 11:30 Read the brief's files; worktree at `790fa13`; node_modules linked.
- 11:35 History and adapters checked; run 38036154904 read (no crawl; footers and terms
  snippets).
- 11:41 freshness-probe round 1 (38136448486): 11 documents, all 200.
- 11:46 Round 2 (38136777427): Meta pages with `Accept: text/html`; DOL copyright, layouts and
  workbook tails; Common Crawl counts.
- 11:52 Round 3 (38137141996): first 512 KB of both workbooks (real header and cell encoding).
- 11:58 Commit `4f54691`: prompt and xlsx reader.
- 12:05 Commit `498b4d7`: DOL route, employers, sample, tests and fixtures.
- 12:20 Run 7 (38035822525) read: both adapters crawled the whole boards cleanly.
- 12:25 Commit `c5f91d2`: brief, terms evidence, workflow patch, log transport.
- 12:35 DATA_SOURCES and process README patches; this log; `npm test`.

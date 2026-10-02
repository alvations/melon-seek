# Process log: strategy (competitors, differentiators, roadmap)

## 1. Brief
Prompt: [prompts/strategy.md](prompts/strategy.md), verbatim, including the
coordinator's mid-task message. The user asked for:

- a competitor analysis;
- what makes melon-seek, Zillow and the job boards unique;
- which features would let us beat them ("1-up").

The coordinator later added a per-owner implementation plan and a UI
simplicity budget.

Files owned:
- `docs/strategy/COMPETITIVE_ANALYSIS.md`: sections 1–4 (Zillow, job
  platforms, matrix, honest self-assessment)
- `docs/strategy/ROADMAP.md`: sections 5–6, plus §7 implementation plan, §8 UI
  simplicity budget, §9 decisions
- `docs/process/strategy.md`: this file
- `docs/process/prompts/strategy.md`

No code was changed and nothing was committed.

## 2. Inputs and sources

### 2.1 Repo files read
- `README.md`: features, data modes, the static build (packed lists, lazy
  descriptions), snapshot artifacts kept 14 days, and responsible use (30-min
  cache, identifying User-Agent).
- `docs/CONTRACT.md`: the RawJob and Job shapes, module interfaces and
  endpoints. All new fields in ROADMAP §7.0 extend these shapes without
  renaming anything.
- `docs/process/README.md`, `TEMPLATE.md` and `lead.md`: the workstream
  roster and owners, the known salary bugs ($4.6M from prose, Scale AI
  "$500K to $5M", Anduril merged tiers, Shield AI per-month mislabel), and the
  in-progress livability, vetting and social workstreams. `README.md` changed
  during the run: it now lists livability, vetting, social, strategy and a
  corporate-ladder brainstorm (`docs/strategy/CORPORATE_LADDER_PLAN.md`).
  That plan appeared late in the run and was skimmed: it adds a generic
  "Level check" drawer section, with no new Job fields and no cross-company
  level mapping. ROADMAP F1 and the §8 drawer order account for it.
- `docs/DATA_SOURCES.md`: ATS fields (Greenhouse `first_published`, Ashby
  `publishedAt`, Lever `createdAt`), CORS behaviour, Lever's no-CORS
  statement.
- `server/companies.js`: the 8 built-ins. `server/sources/*.js` (grep): what
  `updatedAt` maps to per ATS. `server/vet.js` (header): vetting thresholds.
- `public/index.html` and `public/app.js`: an inventory of every visible
  control (top bar, quickbar, viz toolbar, sort, card fields, filter sections,
  drawer sections) for the UI simplicity budget. Cards already have an age
  slot (`card-age`), and the filter panel already has a collapsed "Updated"
  section (`makePosted`).
- `data/snapshots/*.json` (real data, fetched by the snapshot workflow on
  2026-10-02 at 05:54 UTC) and `data/vetting/2026-10-02/flags.counts.json`.
  These are the source of every [L] number.
- `.github/workflows/snapshot.yml` and `pages.yml`: artifact retention of 14
  days, cron times.

No skills were loaded. The output is Markdown documentation; no artifact or
chart was produced.

### 2.2 Web research
Tools: `WebSearch` (standard mode) and `WebFetch`, loaded via ToolSearch.
All research ran on **2026-10-02**.

**Fetch attempts:**

| URL | Result |
|---|---|
| zillow.com/z/zestimate/ | EGRESS_BLOCKED |
| sec.gov (Zillow EX-99.1) | EGRESS_BLOCKED |
| geekwire.com (2011 draw-search article) | EGRESS_BLOCKED |
| glassdoor.com/blog/pay-range-accuracy/ | EGRESS_BLOCKED |
| en.wikipedia.org/wiki/Zillow | EGRESS_BLOCKED |
| github.com/lever/postings-api README | **Read.** Quote: "all job postings in the `published` state are publicly viewable. These jobs may be scraped by third parties." Also: no cross-origin requests from outside company domains, and a limit of 2 application POSTs per second |
| github.com/grnhse/greenhouse-api-docs `_introduction.md` | **Read.** No auth for GETs, JSONP supported, nothing about caching, rate limits or third-party use |

The proxy status (`$HTTPS_PROXY/__agentproxy/status`) showed a non-selective
policy with recent `connect_rejected` entries. The block was not bypassed.

**Search queries and what each established.** Source IDs refer to the
COMPETITIVE_ANALYSIS references.

| # | Query (abridged) | Sources | What it told us |
|---|---|---|---|
| 1 | Zestimate accuracy median error 2026 | S1 | 1.78% on-market and 7.20% off-market median error (2026-08-08 refresh) |
| 2 | Zillow draw your own boundary | S5, S6 | Draw tool, several boundaries allowed. iOS draw search in 2011 |
| 3 | Zillow saved searches, instant alerts, price cuts | S8, S9 | Instant or daily alerts for new listings and price cuts. Cap of 15 instant emails per 24 h |
| 4 | Zillow Premier Agent revenue 2025 | S17 | Residential $417M in Q1 2025 (+6%). 2024 total $2.2B (+15%) |
| 5 | Zillow price history, days on Zillow | S10 | Price history, delist/relist on the detail page |
| 6 | Zillow BuyAbility | S12 | Income, credit, down payment → price and payment. Tags homes in budget |
| 7 | Zillow commute time filter | S13 | 10–60 min, 4 modes, rush hour. 53% of buyers prioritise commute |
| 8 | Zillow GreatSchools | S14 | Sub-scores shown, no school filter. Data-quality concerns |
| 9 | Zillow 3D tours study | S16 | Zillow-sourced claim: 10% faster, 22% more likely to sell within 30 days |
| 10 | Zestimate history 2006 | S2 | Launched 2006-02-08. Drove engagement before listings |
| 11 | Zestimate lawsuits | S3, S4 | 2017 suit. Courts: an estimate, not an appraisal. 53.9% within 5% (2017) |
| 12 | Zillow monthly unique users 2025 | S18 | 221M average monthly unique users and 2.1B visits in Q4 2025. Over 50% of US portal visits |
| 13 | Zillow climate risk removed | S15 | First Street scores added September 2024, removed late 2025 after CRMLS accuracy complaints |
| 14 | Zillow AI search, ChatGPT | S19 | Zillow app in ChatGPT on 2025-10-06. Natural-language search |
| 15 | LinkedIn salary insights | S21, S22 | Expected or estimated salary on posts. 91% want ranges |
| 16 | LinkedIn Premium Job Match | S23 | Job Match (January 2025), Top Applicant, $39.99/month |
| 17 | Indeed Hiring Lab pay transparency | S27 | 50.4% in July 2026. Gains narrowing. A conflicting "59% May 2025" figure |
| 18 | Indeed business model, complaints | S28, S29 | Sponsored Jobs priced per click or per application. Clutter and billing complaints |
| 19 | Glassdoor merged into Indeed | S32 | 1,300 layoffs announced July 2025. Legal merger 2026-07-01 |
| 20 | hiringlab.org July 2026 | S27 | Confirms 50.4% and 48.5% the year before |
| 21 | Google for Jobs changes | S37 | Paid jobs-ads pilot ended in 2024 |
| 22 | LinkedIn ghost and reposted jobs | S56 | About 27% ghost estimate. LinkedIn and Greenhouse "verified" labels |
| 23 | Ghost jobs survey 2025–2026 | S56 | Estimates from 1 in 7 to 1 in 3 |
| 24 | Greenhouse and LinkedIn verified | S56 | Greenhouse: 18–22% of 2024 jobs never filled |
| 25 | Levels.fyi features and model | S39 | Verified offers, leveling by scope, benchmarking, API/MCP |
| 26 | Levels.fyi jobs board | S40 | April 2023. Filter by total pay and level |
| 27 | Blind | S43 | 5M+ verified users. "TC:" offer threads |
| 28 | Levels.fyi criticism | S42 | Self-selection, thin top bands, stale level maps |
| 29 | Wellfound | S45 | Salary and equity upfront. No third-party recruiters. Recruit Pro at $499/month |
| 30 | Otta / WTTJ | S46 | Merged January 2024. "Salary Transparency Champions" |
| 31 | Built In | S47 | City editions. Contracts of $15K–$150K+ |
| 32 | Hiring Cafe | S48 | Crawls 46 ATSs (2.9M postings). Ad-free, bans agencies |
| 33 | Jobright | S49 | Match score. Trustpilot 2.9. Billing complaints, expired postings |
| 34 | Simplify | S50 | Free autofill on 100+ portals. Simplify+ at $39.99 |
| 35 | Teal | S51 | Tracker and resume tool. Teal+ at $29/month |
| 36 | YC Work at a Startup | S52 | Equity filter |
| 37 | Job map salary heatmap | S36, S55 | Glassdoor Job Explorer, Totaljobs pins, Banadana |
| 38 | Levels.fyi heatmap | S41 | Media-market heatmap. Cost-of-living adjustment "being worked on" |
| 39 | Comprehensive.io | S44 | 700 companies, daily AI extraction of ranges, compliance rates |
| 40 | Indeed/Glassdoor map view | none usable | Only low-quality pages. Marked **unverified** |
| 41 | hiQ v. LinkedIn outcome | S65 | 2022 consent judgment, $500K. Stipulated liability over fake accounts |
| 42 | Meta v. Bright Data | S66 | 2024-01-23: logged-off public scraping did not breach Meta's terms |
| 43 | Greenhouse API terms for aggregators | S63 | Built for careers pages. No aggregator terms found |
| 44 | EU Pay Transparency Directive | S59 | Transposition due 2026-06-07. Article 5 pay before interview. Few states on time |
| 45 | US state pay transparency 2026 | S58 | MA, IL, NJ, VT dates. 16 states plus DC |
| 46 | Glassdoor estimates and real names | S33, S34 | 67% of posted ranges contain real pay (22% below, 11% above). 2024 names controversy |
| 47 | LinkedIn applicant counts | S24 | Counts clicks. Capped at "Over 100" since late 2023 |
| 48 | LinkedIn revenue | S26 | Talent Solutions is the largest line. About $17.8B in FY2025 (blog-grade) |
| 49 | Google for Jobs in 2026 | S38 | Filters include date posted and commute. 2026 status not confirmed |
| 50 | Ashby API terms | S64 | Lightweight API for company sites |
| 51 | Greenhouse `first_published` | S74 | Field exists alongside `updated_at` |
| 52 | Big Mac data licence | S68 | MIT |
| 53 | Numbeo terms | S67 | Scraping prohibited. Paid licence needed |
| 54 | HUD FMR, ZORI | S69 | HUD data is public with a free token API. ZORI's terms are unclear |
| 55 | openrouteservice isochrones | S70 | Free key, 500 isochrones per day |
| 56 | TrueUp | S53 | About 9K companies. Open-jobs trends |
| 57 | Offer comparison tools | S75 | Levels.fyi side-by-side, Climb, others |
| 58 | Hiring Cafe review | S48 | Saved-search digests. Conflicting reports on promoted listings |
| 59 | LinkUp job duration | S54 | Open and closed durations, indexed daily from employer sites |
| 60 | Wellfound complaints | S45 | Unresponsive startups, bans, fake-looking jobs |
| 61 | Otta after rebrand | S46 | No complaint data found |
| 62 | Glassdoor business model | S35 | Employer branding, job ads, job slots |
| 63 | Zillow Research data | S20 | Free ZHVI and ZORI CSVs |
| 64 | LinkedIn "Reposted" label | S25 | No count, no original date. Reposting resets the date |
| 65 | Wide pay ranges | S44 | Netflix $90K–$900K, Tesla $83K–$418K. CA 49% and NYC 69% compliance (2023) |
| 66 | Indeed Career Scout, salary estimate | S30, S31 | 2025-09-10 launch. Estimate added when no pay is posted |
| 67 | AI-lab equity vs posted range | S60 | Base about $300K vs total pay about $870K. Base-only comparison undervalues by 30–80% (blog-grade) |
| 68 | DOL LCA disclosure data | S71 | Free quarterly H-1B wage files. Noted as a possible later calibration source |
| 69 | Greenhouse Real Talent / CLEAR | S57 | June 2025 identity verification |
| 70 | Built In salary on cards | S47 | Range, seniority and remote shown on cards |
| 71 | Greenhouse API/developer terms | none usable | Only technical docs. No legal terms found |
| 72 | Zillow card "price cut" and days on Zillow | S11 | Price-cut shares for 2025. Fields on cards |
| 73 | GitHub artifact retention | S72 | Default 90 days. Public repos 1–90, private up to 400 |
| 74 | GitHub Pages limits | S73 | 1 GB site, 100 GB/month soft bandwidth |

## 3. Decisions and rationale

1. **Evidence tags [F], [S], [L] and [K] on every claim.** Almost every page
   was blocked, so most facts come from search snippets. The tags let a
   reader weigh each one. Vendor-sourced claims (Zillow's 3D-tour study) and
   blog-grade numbers (LinkedIn revenue, AI-lab total pay) are marked as such.
2. **Local real data over assumptions.** Coverage, spread, age, duplicate and
   remote counts were computed from the real snapshots (§4). This changed two
   conclusions:
   - Greenhouse `updated_at` ages are useless (whole boards are bulk-edited),
     so "days on market" must use `first_published` plus our own ledger.
   - Lever and Ashby ages are real, and Palantir's median of 462 days, with a
     posting from 2009, makes the evergreen case concrete.
3. **Scoring method.** `Score = Value(1–5) × Differentiation(1–5) ×
   Readiness(0.25–1) ÷ Effort(S=1, M=2, L=4)`.
   - Value and Differentiation are judged against the §2 evidence.
     Readiness and Effort are judged against the repo's actual data and the
     zero-backend architecture.
   - **Flags, applied after scoring:**
     - **Clock:** value depends on history that's lost if we start late.
     - **Foundation:** unblocks other features.
     - **Risk:** legal or reputational exposure.
   - **Rules:**
     1. Order by score.
     2. A Clock feature scoring ≥ 5 joins the Top 3 even if a non-Clock
        feature scores higher. This is why F4, at 7.5, outranks F6, at 8.
     3. Risk can veto any feature (F16, at 4.5, is held for legal review).
     4. Two S-sized features that share a UI surface and score the same can
        be bundled into one Top-3 item (F2 + F3, "Honest numbers").
   - Scores are judgement calls. The point is to make the trade-offs explicit
     and repeatable, not precise.
4. **Commute time and draw-a-boundary are deprioritized despite being
   signature Zillow features.**
   - Our locations are city-level (a gazetteer of about 246 cities), and each
     company spans 19–53 cities [L].
   - Many roles are remote: 562 of OpenAI's 833 [L].
   - Routing APIs need keys that a static site would expose (S70).
   - A "within N km of a city" option in the existing Location filter covers
     most of the need for a fraction of the effort.
5. **Ghost-job flagging is folded into freshness, with factual wording
   only.** Labels about named companies get challenged (Zillow's climate-score
   reversal, S15), and "ghost" implies intent we can't prove. So labels state
   facts: "Open 180+ days", "Reposted 2×".
6. **Freshness thresholds: new ≤ 7 days, active 8–59, stale 60–179,
   evergreen ≥ 180.** These are a first guess:
   - 7 days matches the existing "Past week" filter;
   - 180 days sits above the OpenAI and Shield AI medians (49–51 days) and
     well below Palantir's median of 462 [L].

   Recalibrate after 60 days of ledger data, using its closed-duration
   distribution (LinkUp's concept, S54).
7. **Repost fingerprint = normalized title + department + primary location,
   within 30 days of a disappearance, or the same Greenhouse
   `internal_job_id`.** Using title alone would merge Anduril's 162 postings
   that share a title and location with another posting [L].
8. **The market comps aggregate is built at build time** (`api/market.json`,
   150 KB or less) instead of loading 8 company lists in the browser. The lists
   are up to 1.3 MB each, which would be too heavy on mobile.
9. **A minimum of n ≥ 3 per comps cell.** Below that, a "median" is one or two
   postings and misleads.
10. **Compstimate accuracy is computed at build time with a seeded
    leave-one-out backtest.** It's O(n²): Anduril has 2,277 salaried jobs.
    Seeding makes the published number reproducible. The 25% "Low confidence"
    cut-off is a judgement call, set well above the spread of a typical
    posted range (median max/min of 1.25–1.50 [L]).
11. **Wide-range label at spread ≥ 2.0×.** The p90 spread is 1.35–2.45×
    depending on company [L], so 2.0× flags roughly the top decile on the
    widest boards without labelling typical ranges.
12. **Ledger storage: recommend an orphan `data-history` branch**, left for
    the user to decide.
    - Artifacts last at most 90 days on public repos (S72), and a missed run
      breaks the chain.
    - The ledger is about 0.8 MB today [L], so daily commits stay small.
13. **UI budget:**
    - one new main-view control across Now and Next ("Save", only shown when
      filters are active);
    - one status tag per card, in an existing slot;
    - no new modes.

    This follows the user's "intuitive and simple" instruction. Every feature
    is placed in an existing surface: the drawer, Insights, the Sort select,
    or a filter section.
14. **Owner names follow the coordinator's list.** `public/api.js` is noted as
    a coordination point, because devops wrote it and the coordinator's list
    doesn't name it.

## 4. Replayable steps

```sh
cd /home/user/melon-seek
cat README.md docs/CONTRACT.md docs/process/README.md docs/DATA_SOURCES.md
grep -n "updatedAt\|first_published\|publishedAt\|createdAt" server/sources/*.js
grep -n "QUICK = \|section('\|function makePosted\|card-age" public/app.js
cat data/vetting/2026-10-02/flags.counts.json
```

Local statistics. These produced every [L] number in both strategy docs.
They need the real snapshots in `data/snapshots/`; to fetch them, run
`gh run download --repo alvations/melon-seek --name job-board-snapshots --dir data/snapshots`.

```sh
node -e '
const fs=require("fs");
const at=new Date("2026-10-02T05:54:00Z"), day=864e5;
let tot=0,sal=0,ledger=0;
for (const f of fs.readdirSync("data/snapshots").sort()) {
  const d=JSON.parse(fs.readFileSync("data/snapshots/"+f)); const js=d.jobs; tot+=js.length;
  const s=js.filter(j=>j.salary&&j.salary.min>0); sal+=s.length;
  const r=s.map(j=>j.salary.max/j.salary.min).sort((a,b)=>a-b), q=(a,p)=>a.length?a[Math.floor(p*(a.length-1))]:NaN;
  const ages=js.map(j=>(at-new Date(j.updatedAt))/day).filter(Number.isFinite).sort((a,b)=>a-b);
  const key=j=>j.title+"|"+(j.locations||[]).map(l=>l.name).join("/"); const m={}; js.forEach(j=>m[key(j)]=(m[key(j)]||0)+1);
  const dup=Object.values(m).filter(c=>c>1).reduce((a,c)=>a+c,0);
  const cities=new Set(); js.forEach(j=>(j.locations||[]).forEach(l=>{if(!l.remote)cities.add(l.city||l.name)}));
  js.forEach(j=>{ledger+=JSON.stringify(j.id).length+JSON.stringify({f:"2026-10-02",l:"2026-10-02",p:j.updatedAt,h:"a1b2c3d4",s:j.salary?[["2026-10-02",j.salary.min,j.salary.max,j.salary.currency]]:[]}).length+2;});
  console.log([f.replace(".json","").padEnd(9),"n="+js.length,"salaried="+s.length,"remote="+js.filter(j=>j.remote).length,
   "spread p50/p90="+q(r,.5).toFixed(2)+"/"+q(r,.9).toFixed(2),"age p50/p90="+q(ages,.5).toFixed(0)+"/"+q(ages,.9).toFixed(0),
   ">180d="+ages.filter(a=>a>=180).length,"oldest="+js.map(j=>j.updatedAt).sort()[0].slice(0,10),"dupTitleLoc="+dup,"cities="+cities.size].join("  "));
}
console.log("TOTAL n="+tot,"salaried="+sal,(100*sal/tot).toFixed(1)+"%","ledger~"+(ledger/1024).toFixed(0)+"KB");
'
du -sh dist
```

Output (2026-10-02):

```
anduril    n=2418  salaried=2277  remote=31  spread p50/p90=1.33/1.35  age p50/p90=7/7  >180d=0  oldest=2026-09-24  dupTitleLoc=162  cities=51
anthropic  n=638  salaried=558  remote=71  spread p50/p90=1.26/1.52  age p50/p90=32/42  >180d=0  oldest=2026-08-21  dupTitleLoc=0  cities=25
cohere     n=132  salaried=132  remote=120  spread p50/p90=1.48/2.14  age p50/p90=49/305  >180d=25  oldest=2024-11-01  dupTitleLoc=0  cities=53
openai     n=833  salaried=674  remote=562  spread p50/p90=1.32/1.76  age p50/p90=49/262  >180d=134  oldest=2023-05-25  dupTitleLoc=2  cities=21
palantir   n=320  salaried=240  remote=0  spread p50/p90=1.48/1.72  age p50/p90=462/1973  >180d=224  oldest=2009-12-05  dupTitleLoc=0  cities=30
scaleai    n=194  salaried=131  remote=19  spread p50/p90=1.25/1.73  age p50/p90=0/0  >180d=0  oldest=2026-10-01  dupTitleLoc=0  cities=30
shieldai   n=581  salaried=456  remote=26  spread p50/p90=1.50/1.69  age p50/p90=51/198  >180d=72  oldest=2023-02-22  dupTitleLoc=0  cities=35
xai        n=297  salaried=134  remote=38  spread p50/p90=1.50/2.45  age p50/p90=0/1  >180d=0  oldest=2026-09-30  dupTitleLoc=0  cities=19
TOTAL n=5413 salaried=4602 85.0% ledger~789KB
85M	dist
```

How to read it: `age` comes from `Job.updatedAt`, which is Greenhouse
`updated_at` (anduril, anthropic, scaleai, xai), Ashby `publishedAt` (openai,
cohere) and Lever `createdAt` (palantir, shieldai). That's why the Greenhouse
rows look "fresh". "salaried" counts postings with a parsed salary, before
vetting quarantine.

The web research was 74 `WebSearch` calls (§2.2) and 7 `WebFetch` attempts.

## 5. Verification

- Every [L] number in COMPETITIVE_ANALYSIS.md and ROADMAP.md was checked
  against a rerun of the §4 command.
- Each competitor claim carries a source ID. Matrix cells without a §2 source
  are labelled [K] (general knowledge, unverified) in the legend.
- Proposed Job fields and endpoints were checked against `docs/CONTRACT.md`.
  They only add fields; `updatedAt` keeps its meaning.
- The UI inventory in ROADMAP §8 was checked against `public/index.html` and
  the `renderCard`, `drawerContent`, `QUICK` and filter-section code in
  `public/app.js`.
- No tests were run, because no code changed.

## 6. Known gaps and follow-ups

**Could not verify:**
- Any primary Zillow, LinkedIn, Glassdoor, Indeed, SEC or Wikipedia page
  (blocked). All figures from them are search-snippet-level [S].
- Whether **Indeed or Glassdoor currently have a map view** (only low-quality
  pages found).
- Google for Jobs' **2026 status and features** beyond the 2024 ads-pilot end.
- **Hiring Cafe's business model.** One source mentions promoted listings and
  another says there are none.
- **Comprehensive.io's** current status.
- Otta/WTTJ complaints after the merger (none found).
- **Terms of service** for the Greenhouse, Ashby and Lever public APIs beyond
  their docs. No aggregator-specific terms were found, which doesn't mean
  none exist.
- **SmartRecruiters, Workable and Workday** public APIs (F12). Not researched.
  This is for the research workstream.
- **AI-lab total-pay figures** (S60) are from blogs that cite visa filings and
  Levels.fyi. They are directional, not authoritative.
- **Indeed's pay-transparency share:** 50.4% (July 2026) conflicts with a "59%
  (May 2025)" snippet. The tracker figure is used.

**Follow-ups:**
- After 60 days of ledger data, recalibrate the freshness thresholds and the
  wide-range threshold, and re-score F10 and F11.
- If the corporate-ladder "Level check" ships, check the drawer against the
  shared order in ROADMAP §8.
- The lead needs to fold ROADMAP §7.0 into `docs/CONTRACT.md` before fan-out.

## 7. Change log
- 2026-10-02 ~06:45 UTC: read the repo docs, computed local snapshot
  statistics, started web research.
- 2026-10-02 ~06:55: coordinator added the implementation plan and UI budget
  requirement. Inventoried `index.html` and `app.js`.
- 2026-10-02 ~07:00: wrote COMPETITIVE_ANALYSIS.md.
- 2026-10-02 ~07:10: wrote ROADMAP.md (scoring, Now/Next/Later, Top 3
  acceptance criteria, implementation plan, UI budget, decisions), the
  verbatim prompt, and this log.
- 2026-10-02 ~07:15: the corporate-ladder plan appeared. Aligned ROADMAP F1
  and the §8 drawer order with its "Level check" section.

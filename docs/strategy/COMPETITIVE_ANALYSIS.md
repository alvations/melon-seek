# Competitive analysis

Researched on 2026-10-02 by the strategy workstream. The roadmap built on this
analysis is in [ROADMAP.md](ROADMAP.md), and the research log (queries, sources,
scoring, gaps) is in [../process/strategy.md](../process/strategy.md).

**How to read the evidence.** The sandbox blocks most websites, including
zillow.com, linkedin.com, glassdoor.com, sec.gov and Wikipedia. Each claim is
tagged with how it was checked:

| Tag | Meaning |
|---|---|
| **[F]** | The page was fetched and read (only GitHub-hosted docs were reachable). |
| **[S]** | The fact comes from a web-search result snippet or summary. The page itself was not opened. |
| **[L]** | Computed locally from melon-seek's real snapshots (8 boards, fetched 2026-10-02 05:54 UTC, 5,413 postings). |
| **[K]** | General product knowledge, not checked in this research. Treat it as unverified. |

Source IDs such as S12 point to the [References](#references) at the end. All
sources were accessed on 2026-10-02.

## Summary

- **Zillow won by answering the money question first, for every home, on a
  map.** The Zestimate came before the listings business and drew engagement
  before Zillow was a major listings source (S2). Zillow publishes the
  Zestimate's error rate: a 1.78% median error on-market and 7.20% off-market as
  of August 2026 (S1). Time signals (days on Zillow, price cuts) and alerts
  bring people back (S8–S11). Consumers pay nothing, and agents pay for leads
  (S17).
- **The job market's version of "the money question" is half-answered.** About
  50.4% of US Indeed postings showed pay in July 2026, and annual gains have
  shrunk three years in a row (S27). Posted ranges are base pay, which can
  understate total pay at AI labs by 30–80% (S60, blog-grade). Glassdoor
  reports that only about 67% of posted ranges contain the salaries employees
  actually report (S33).
- **Big boards optimise for volume and paid placement, not clarity.**
  Complaints repeat across sources: sponsored clutter (S29), applicant counts
  that count clicks (S24), "Reposted" labels that hide the original date (S25),
  and ghost jobs. Greenhouse says 18–22% of its 2024 postings never led to a
  hire (S56).
- **Nobody plots a whole company's board by pay.** Levels.fyi has a pay
  heatmap and charts, but they are built from self-reported compensation (S41).
  Big boards are list-first. Hiring Cafe and Comprehensive.io read employer ATS
  pages directly, but neither visualizes a whole board (S44, S48).
- **melon-seek's real edge:** every posting on one salary axis and one map,
  direct from the employer's ATS, with no account, no ads and no tracking.
- **melon-seek's real weaknesses:** 8 companies, base pay only, posting ages
  that are wrong for Greenhouse boards, and a salary parser that only recently
  stopped reading "$4.6M" in prose as pay.

## 1. Zillow: signature features and why they work

| Feature | What it does | Why it works | Evidence | Job-market translation |
|---|---|---|---|---|
| **Zestimate** | An automated value for every home, listed or not. Launched with the site on 2006-02-08, which crashed on launch day under the traffic | Gives a number to anchor on before anyone talks to an agent, and drew engagement before Zillow had listings (S2). Publishing its own error rate builds trust: median error 1.78% for on-market homes and 7.20% for off-market homes (2026-08-08 refresh) (S1). Courts accepted it because it is labelled an estimate, not an appraisal (S3, S4) | [S] | **Compstimate** exists. What's missing is a **published error rate** and the "estimate, not an offer" framing |
| **Map-first search, draw your own boundary** | Map is the primary browse. A Draw tool filters to a hand-drawn polygon, and several polygons can be drawn (S5). The draw tool reached iOS in 2011 (S6). Since 2022 a search can cover up to five areas at once (S7) | Home value depends on micro-location (blocks, school lines, streets) | [S] | Weak fit. Jobs cluster in about 20–50 cities per company [L], and our geocodes are city-level, so a city or radius filter does the job |
| **Saved searches + alerts** | Instant or daily emails for new listings or price reductions that match a saved search (S8), capped at 15 instant emails per 24 hours (S9) | Habit loop. Being first matters in a fast market | [S] | **Strong fit.** New roles at a target company, or a new role above a pay band |
| **Price history and price cuts** | The detail page lists past prices, sales and delist/relist events (S10). A record 26.6–27.4% of listings had a price cut in mid-2025 (S11) | Negotiating leverage and urgency. Delists and relists reveal a seller's real situation | [S] | Pay-range changes over time. "Reposted" and relisted detection |
| **Days on market** | Shown on listing cards and detail pages (S10, S11) | Stale listings mean leverage. Fresh ones mean urgency | [S] | **Strong fit.** Days listed and freshness. Big boards hide or reset this (S25) |
| **Affordability (BuyAbility)** | Income, credit, down payment and debt give a personal price ceiling and monthly payment. Homes within your BuyAbility are tagged while you browse (S12) | Turns a generic listing into "can I afford this?" | [S] | **Juice Score** (take-home after cost of living) and tagging roles within your target |
| **Neighbourhood and school data** | GreatSchools sub-scores on listings, with no school filter (S14). Climate-risk scores were added in September 2024 and **removed in late 2025** after MLS complaints about accuracy (S15) | Context sells, until the data is wrong and those being rated push back | [S] | Company "neighbourhood" stats (hiring velocity, team growth). **Lesson:** third-party scores attached to named entities will be challenged, so show inputs and keep it factual |
| **Commute time** | Mobile filter for 10–60 minutes by car, bike, foot or transit, at rush hour or off-peak. 53% of buyers rank commute as a top priority (S13) | Commute is a daily cost | [S] | Weak fit for us: office street addresses are unknown and many roles are remote or hybrid (§4.2) |
| **3D home tours** | Immersive tours. Zillow's own study: listings with tours sold 10% faster and were 22% more likely to sell within 30 days (S16; vendor-sourced claim) | Lets buyers qualify a home without visiting | [S] | Rough analogue: the team, interview loop and day-to-day. We have no data source for it |
| **Agent marketplace (Premier Agent)** | Free for consumers. Agents pay for buyer leads. Residential revenue (mostly Premier Agent) was $417M in Q1 2025, up 6% (S17), and about 64% of Q4 2025 revenue ($418M of $654M; S17, S18). Zillow reached 221M average monthly unique users in Q4 2025 and more than 50% of US portal visits (S18) | Traffic built on free data is sold to the supply side | [S] | The job equivalent is employers paying (sponsored jobs, employer branding). That is the source of the clutter users complain about. See §4 for whether we want it |
| **Open research data** | ZHVI and ZORI as free CSVs, updated monthly (S20) | Press citations and backlinks make Zillow the reference number | [S] | **Cheap fit:** a CSV per company plus market aggregates |
| **AI search** | Natural-language search, and a Zillow app inside ChatGPT since 2025-10-06 (S19) | Meets users where they search | [S] | Later: plain-language queries parsed into our existing filters |

**What Zillow teaches us**

1. **Estimate everything, publish the error, and call it an estimate.** That
   combination survived a lawsuit (S3).
2. **Time signals are cheap and powerful** (days on market, price cuts), but
   only with your own history. Zillow has MLS history. We have to start
   recording ours.
3. **Personalize money**, as BuyAbility does: "what this means for *me*".
4. **Third-party scores about named entities get challenged.** The climate-risk
   reversal (S15) is a warning for the Juice Score and any ghost-job label.
5. **Free for consumers, paid by supply** builds traffic, but it is also what
   degraded job boards.

## 2. Job platforms

### 2.0 Market context (2025–2026)

- **Pay transparency is rising but slowing.** Indeed Hiring Lab: 50.4% of US
  postings showed pay in July 2026, up from 48.5% a year earlier. Annual gains
  fell from 6.4 to 2.6 to 1.9 points (S27). One search summary also gives "59%
  as of May 2025", which conflicts and is probably a different measure.
- **Laws:** 16 states plus DC had statewide posting-disclosure laws in effect as
  of 2026-08-01, including Illinois (2025-01-01), New Jersey (2025-06-01),
  Vermont (2025-07-01) and Massachusetts (2025-10-29) (S58). EU Directive
  2023/970 had to be transposed by 2026-06-07. It requires the starting pay or a
  range in the vacancy notice or before the first interview, but only a few
  member states met the deadline (S59).
- **Ghost jobs** are now mainstream. Greenhouse: 18–22% of 2024 postings never
  filled (S56). Estimates elsewhere range from 1 in 7 to about 1 in 3 (S56).
  LinkedIn and Greenhouse added "verified" labels (S56), and Greenhouse added
  identity checks with CLEAR in June 2025 (S57).
- **Consolidation and AI agents:** Glassdoor was folded into Indeed, with
  1,300 layoffs announced in July 2025 and a legal merger on 2026-07-01 (S32).
  Indeed launched Career Scout, an AI agent for job seekers, on 2025-09-10
  (S30), and LinkedIn launched Job Match in January 2025 (S23).

### 2.1 Big boards

**LinkedIn Jobs**
- *Differentiator:* the professional graph (1.3B members), so it knows who you
  know at a company (S26 [S]). Easy Apply. AI Job Match, which scores your
  profile against a posting (S23).
- *Salary transparency:* shows the employer's "expected salary" when given and
  LinkedIn's own "estimated salary" otherwise (S21). 91% of US respondents say
  a posted range affects whether they apply (S22).
- *Weaknesses and complaints:* the applicant count tallies clicks on Apply, and
  since late 2023 it caps at "Over 100" (S24). "Reposted" gives no count and no
  original date, and a repost resets the date (S25). Ghost jobs are a common
  complaint (S56). Easy Apply produces spam applications, so recruiters filter
  with AI (S24).
- *Business model:* Talent Solutions (recruiter seats, job slots, promoted
  jobs) is the largest line. Premium Career costs about $39.99 a month (S23).
  LinkedIn revenue was about $17.8B in Microsoft's FY2025 (S26, blog-grade).
- *Map / salary visualization:* none found [K].

**Indeed** (now including Glassdoor)
- *Differentiator:* the largest volume aggregator, plus Hiring Lab research
  (S27) and the Career Scout agent (S30).
- *Salary transparency:* 50.4% of US postings in July 2026 (S27). When an
  employer gives no pay, Indeed adds its own estimate, built from employer and
  job-seeker data and updated weekly (S31).
- *Weaknesses and complaints:* sponsored posts clutter results and push down
  unsponsored ones. Employers complain about surprise charges (S28, S29). Scams
  exist (S29 [S]).
- *Business model:* Sponsored Jobs, priced per click or per application, with
  daily budget minimums (S28).
- *Map / salary visualization:* a map view is reported, but only by low-quality
  sources. **Unverified.**

**Glassdoor**
- *Differentiator:* anonymous company reviews, interview reports and salaries
  that sit next to job listings.
- *Salary transparency:* labels each salary "Employer provided" or "Glassdoor
  est." Its own research found about 67% of posted ranges contain what
  employees report, 22% sit below and 11% above (S33).
- *Weaknesses and complaints:* in 2024 it added real names to accounts without
  clear consent, which hurt trust in anonymity (S34). Users say its pay
  estimates run low (Blind threads, [S]). Its future as a separate brand is
  uncertain after the merger (S32).
- *Business model:* employer branding, paid job ads and job slots (S35).
- *Map / salary visualization:* "Job Explorer", a US map of job opportunities
  (S36). Its current status is unverified.

**Google for Jobs**
- *Differentiator:* sits inside Google Search. It aggregates `JobPosting`
  structured data from boards and career sites (S37, S38).
- *Salary transparency:* shows pay when the source provides it [K]. Filters
  include date posted, commute distance and full-time vs part-time (S38).
- *Weaknesses and complaints:* it depends on what sources mark up, duplicates
  come through syndication [K], and Google ended the paid Jobs ads pilot in 2024
  (S37).
- *Business model:* indirect (search engagement). There are no paid listings
  since the pilot ended (S37).
- *Map / salary visualization:* commute and location filters (S38). No pay
  chart [K].

### 2.2 Pay-data sites

**Levels.fyi**
- *Differentiator:* level-normalized total compensation (base, stock, bonus).
  Levels are mapped across companies by scope and by employee transfers, not by
  pay. A growing share of entries is verified with offer letters or W-2s (S39).
- *Salary transparency:* the most detailed source for tech total compensation.
  Its job board (2023) filters by total pay and level (S40).
- *Weaknesses and complaints:* self-reported and self-selected. Samples are
  thin at the top end (fewer than 100 NYC entries above $400K). Level mappings
  go stale (S42).
- *Business model:* employer benchmarking data, interactive offer letters, a
  paid negotiation service, promoted jobs, and API/MCP access sold through
  sales (S39).
- *Map / salary visualization:* **yes.** A US pay heatmap by media market, plus
  India and Europe views. Cost-of-living adjustment was "being worked on"
  (S41).

**Glassdoor salaries:** see Glassdoor above. Its distinctive asset is the
employer-provided vs estimated split and its range-accuracy research (S33).

**Blind**
- *Differentiator:* anonymous, verified by work email. More than 5M
  professionals at 125K+ companies. "TC: …" offer-evaluation threads are its
  signature format (S43).
- *Salary transparency:* informal and anecdotal, but candid about total pay.
- *Weaknesses and complaints:* noisy and unstructured. Verification shows where
  someone works, not that their pay claim is true [K].
- *Business model:* employer and recruiting products, plus ads [K].
- *Map / salary visualization:* none known [K].

**Comprehensive.io** (posted-range tracker)
- Visited about 700 tech companies' careers pages daily (more than 53K
  postings), extracted ranges with AI, and published California and NYC
  compliance rates. It showed absurd ranges, for example Netflix SWE
  $90K–$900K and Tesla $83K–$418K (S44, from 2023). This is the closest
  precedent to melon-seek's data approach. Its current status is unverified.

### 2.3 Curated and startup boards

| Platform | Key differentiator | Salary transparency | Weaknesses and complaints | Business model | Map / salary viz |
|---|---|---|---|---|---|
| **Wellfound** (ex-AngelList Talent) | Startups only. Candidates talk to founders. No third-party recruiters (S45) | **Salary and equity on every job** (S45) | Startups don't respond, accounts get banned, some fake-looking jobs (Trustpilot, S45) | Free posting. Recruit Pro at $499/month for sourcing. AI sourcing agents (S45) | No [K] |
| **Welcome to the Jungle / Otta** | Curated tech and startup roles with company profiles. Otta (2019) merged into WTTJ in January 2024 (S46) | Partial. Publishes "Salary Transparency Champions" (companies with 100% of roles salaried) (S46) | No complaint data found. A review describes it as a bigger employer-branded catalogue after the merger (S46 [S]) | Employer branding subscriptions [K] | No [K] |
| **Built In** | US city editions for tech hubs, plus editorial content (S47) | Shows ranges on cards when employers disclose them (S47 [S]) | Employer-branding focus. Expensive for employers (S47) | Annual contracts of about $15K–$150K+ (S47) | No [K] |
| **Hiring Cafe** | Crawls employer career pages and ATSs (about 2.9M postings from 46 ATSs) several times a day. Bans agencies. Ad-free (S48) | Salary filter where data exists (S48) | Little public review data (S48). Sources conflict on whether promoted listings exist: one says it has them, another says it has none (S48) | Unclear. Reported as promoted listings plus a talent network (S48) | No map or pay chart found |
| **Jobright** | AI copilot: match score, resume tailoring, auto-apply (S49) | Inherits from its sources | Trustpilot 2.9/5. Billing complaints in 72% of 1-star reviews. Fake or expired postings. US only. Resume AI invents skills (S49) | Subscription, about $29–$59/month (S49) | No |
| **Simplify** | Free autofill extension for 100+ portals including Greenhouse, Lever and Workday, plus a tracker (S50) | Shows posted pay [K] | Mostly an application tool, not a discovery tool | Freemium. Simplify+ at $39.99/month (S50) | No |
| **Teal** | Job tracker and resume builder. Chrome extension that bookmarks from 50+ boards (S51) | n/a (saves other boards' posts) | Not a source of jobs | Teal+ at $29/month or $9/week (S51) | No |
| **YC Work at a Startup** | Only YC companies. Direct to founders | Salary and equity shown. **Filter by equity** (S52) | Narrow (YC only) [K] | Part of YC's portfolio support [K] | No |

### 2.4 Map and salary-visualization angle

| Product | What it visualizes | Data | Evidence |
|---|---|---|---|
| Levels.fyi heatmap and bubble plots | Total pay percentiles by US media market, India district or European city | Self-reported | S41 |
| Glassdoor Job Explorer | A US map of job opportunities by area | Its own listings | S36 |
| Totaljobs (UK) | A pin per job on a map, with title, salary and date | Recruiter-placed | S55 |
| Banadana | Pay ranges and benefits on a map, plus commute mapping | Unknown | S55 |
| TrueUp | Open tech jobs over time for about 9K companies, big-tech hiring, layoffs | Crawled postings | S53 |
| LinkUp (data vendor) | **Job duration**: how long postings stay open and how long they took to close, by company, industry and region | Daily crawl of employer sites | S54 |
| Comprehensive.io | Posted ranges by company, compliance rates | Daily crawl of careers pages | S44 |

None of these plots **one company's entire live board** on a pay axis and a
map at once. TrueUp and LinkUp show that **time-series job data** (open
counts, duration) is valuable enough to sell.

## 3. Comparison matrix

Legend: ● yes · ◐ partial · ○ minimal · – no or not found. Cells without a source in §2
are general product knowledge [K] and unverified. The melon-seek column is
verified against the repo and real snapshots [L].

### 3a. melon-seek vs big boards and pay-data sites

| Capability | melon-seek (today) | LinkedIn | Indeed | Glassdoor | Google for Jobs | Levels.fyi | Blind |
|---|---|---|---|---|---|---|---|
| Posted pay shown when the employer gives it | ● 85% of postings carry a range [L] | ● | ● (≈50% of US postings) | ● "Employer provided" | ◐ | ● | – |
| Estimate when no pay is posted | ● Compstimate | ● estimated salary | ● Indeed estimate | ● "Glassdoor est." | – | ◐ | – |
| Published accuracy of that estimate | – | – | – | ◐ (studies posted ranges, not its estimate) | – | – | – |
| Whole-board pay chart (every posting on one axis) | ● clusters and ranges | – | – | – | – | ◐ (self-reported, not postings) | – |
| Map view | ● price-tag pins | – | ◐ (unverified) | ◐ Job Explorer | ◐ location/commute filter | ● heatmap | – |
| Same role compared across companies | – (one company at a time) | – | – | ◐ (salary pages) | – | ● | ◐ (threads) |
| Honest posting age (posted date, not last edit) | ◐ right for Ashby and Lever, wrong for Greenhouse [L] | ◐ (reposts reset date) | ◐ | ◐ | ● date-posted filter | – | – |
| Repost / ghost / evergreen signals | – | ◐ "Reposted", verified badge | – | – | – | – | – |
| Pay changes over time for a posting | – | – | – | – | – | ◐ (market trends) | – |
| Saved searches and alerts | – (shareable URL only) | ● | ● | ● | ● | ◐ | – |
| Cost-of-living adjustment | ◐ Juice Score in progress | – | – | – | – | ◐ (planned) | – |
| Total compensation incl. equity | – base only | – | – | ◐ | – | ● | ◐ |
| Direct from employer ATS, no sponsored ranking | ● | – | – | – | ◐ | ◐ | n/a |
| No account needed | ● | ◐ (browse only) | ◐ | – (give-to-get) | ● | ◐ | – |
| Coverage | ○ 8 companies, 3 ATSs | ● | ● | ● | ● | ● (tech) | ● (tech) |

### 3b. melon-seek vs curated, startup and tooling products

| Capability | melon-seek (today) | Wellfound | WTTJ/Otta | Built In | Hiring Cafe | Jobright | Simplify | Teal | YC WaaS | TrueUp |
|---|---|---|---|---|---|---|---|---|---|---|
| Pay on (almost) every listing | ◐ 85% [L] | ● (+ equity) | ◐ | ◐ | ◐ | ◐ | ◐ | n/a | ● (+ equity) | ◐ |
| Whole-board pay chart / map | ● | – | – | – | – | – | – | – | – | ◐ (open-job counts) |
| Direct from ATS / no agencies | ● | ● | ◐ | – | ● | – | – | n/a | ● | ◐ |
| Ghost / staleness focus | – | – | – | – | ● (stated focus) | – (complaints) | – | – | – | – |
| Saved searches and alerts | – | ● [K] | ● [K] | ● [K] | ● daily digest | ● | ◐ | – | ◐ [K] | ◐ [K] |
| Company hiring trends over time | – | – | – | – | – | – | – | – | – | ● |
| Apply tooling (autofill, tracker) | – | ◐ | ◐ | – | ◐ tracker | ● | ● | ● | ◐ | – |
| No account, no ads | ● | – | – | – | ◐ | – | ◐ | ◐ | – | ◐ |
| Coverage | ○ 8 companies | ● startups | ● | ● US hubs | ● 2.9M postings | ● US | ● | n/a | ◐ YC only | ● 9K companies |

## 4. melon-seek today: what's unique, honestly

### 4.1 Real differentiators

1. **The whole board at a glance, by pay.** Every posting from a company's
   live ATS board sits on one salary axis (clusters or ranges), grouped by
   department, location or seniority. The same postings appear on a map with
   price-tag pins. No competitor found in this research does this for live
   postings (§2.4).
2. **Straight from the employer's ATS.** No sponsored ranking, no agency
   reposts, no paywall, and the apply link goes to the employer. Hiring Cafe
   shares this principle (S48) but has no pay visualization.
3. **No account, no tracking, free, and the URL is the state.** Every view can
   be shared. The static architecture has almost no running cost (GitHub
   Pages).
4. **Posted-range statistics, not self-reports.** Compstimate and in-company
   percentiles ("pays more than 72% of roles at X") use what employers publish,
   which complements Levels.fyi's self-reported total pay rather than copying
   it.
5. **A focused niche.** AI labs and defence tech are high-pay, high-interest
   employers that generic boards don't specialize in.
6. **Auditable data quality.** The vetting workstream (in progress) adds an
   outlier quarantine and a verdict audit trail. No competitor found publishes
   anything like it.

### 4.2 Gaps

| Gap | Evidence | Why it matters |
|---|---|---|
| **Coverage** | 8 built-in companies and 5,413 postings across 3 ATSs (Greenhouse, Ashby, Lever) [L]. Custom boards work only for those 3 ATSs. Workday, iCIMS, SmartRecruiters and others aren't supported | We can't answer "where should I work?", only "what does X pay?" |
| **Base pay only** | Postings publish base ranges. At AI labs equity can exceed base: a reported median base of about $300–310K vs about $870K median total pay at OpenAI (S60, blog-grade). Base-only comparison undervalues these roles by 30–80% (S60) | Cross-company comparisons of base pay can mislead. They need a visible "base only" label |
| **Posted ≠ paid** | About 67% of posted ranges contain actual reported pay (S33). Some ranges are huge, for example Netflix $90K–$900K (S44) | Range width needs its own label |
| **Posting dates are wrong for Greenhouse** | Greenhouse's `updated_at` is the last edit. Median "age" is 0 days for xAI and Scale AI and 7 days for Anduril, with p90 at 7 days, so these boards get bulk-edited [L]. Lever's `createdAt` and Ashby's `publishedAt` give real ages: Palantir's median is 462 days and its oldest posting dates from 2009-12-05. 224 of Palantir's 320 postings are older than 180 days [L] | The current "Updated" filter and "Newest" sort are misleading on 4 of 8 boards. Greenhouse's `first_published` exists (S74, and DATA_SOURCES.md) but isn't stored |
| **No history** | Snapshots are artifacts kept 14 days (README). The workflow could keep them up to 90 days on a public repo (S72) | Days on market, repost detection, pay changes and hiring velocity all need history. **Every day without it is lost for good** |
| **Salary-parse accuracy** | Real bugs: "$4.6M" read from prose, a Scale AI "$500K to $5M" prose match, Anduril merged tiers ("12,600–167,000"), and a Shield AI per-month mislabel making $1.56M/yr (lead log). The vetting scan flagged 203 Anduril and 131 Cohere postings, mostly interval and multi-currency flags [L]. Only 134/297 xAI and 131/194 Scale AI postings have a salary, so some may be missed (lead log) | One wrong headline number destroys trust (Zillow lesson 1) |
| **Duplicates** | 162 Anduril postings share title and location with another posting (multi-req or multi-site posts) [L] | Inflates counts and clusters |
| **Geography is city-level** | Gazetteer of about 246 cities. Offices have no street addresses | Rules out real commute time and makes draw-a-boundary of little use |
| **Freshness** | Daily rebuild. Closed roles stay visible until the next build | Acceptable. Show the "as of" time |

### 4.3 Legal and terms-of-service considerations

*Not legal advice. This is a summary of public sources for the user to weigh.*

- **We call documented public APIs. We don't scrape HTML.** Greenhouse:
  "authentication is not required for any GET endpoints", and JSONP is
  supported (S62 [F]). Greenhouse frames the API as a way to build custom
  careers pages (S63). Ashby's lightweight posting API is for listing openings
  on a company's site (S64). **Lever's README says outright: "all job postings
  in the `published` state are publicly viewable. These jobs may be scraped by
  third parties"** (S61 [F]). None of the three docs states any terms aimed
  specifically at aggregators (S61–S63). Terms beyond the docs couldn't be read
  here.
- **CORS:** Lever's docs say cross-origin requests from other domains are not
  supported (S61 [F]). The static site's live browser fetch of Lever works today
  only because headers allow it (DATA_SOURCES.md §5). It can break without
  notice, and the snapshot fallback covers that.
- **Case law trend (US):** in *Meta v. Bright Data* (N.D. Cal., 2024-01-23),
  logged-off scraping of public data did not breach Meta's terms (S66).
  *hiQ v. LinkedIn* ended in a 2022 consent judgment ($500K and an injunction).
  The CFAA liability there was stipulated, not found by the court, and it
  turned on **fake accounts and password-protected pages** (S65). melon-seek
  uses no accounts, no logins and no evasion, and sends an identifying
  User-Agent with a 30-minute cache (README).
- **Copyright is the bigger exposure.** Facts (title, location, pay) are low
  risk. The full description HTML is copyrighted text, and the static build
  republishes it as `api/desc/<slug>/<id>.json` on Pages (README). A
  lower-risk option is to keep the extracted bullets and keywords and link to
  the original posting for the full text. **User decision** (see ROADMAP §9).
- **Trademarks.** "Zillow of job postings" is fair comparative description.
  "Compstimate" is a play on Zillow's "Zestimate". A quick trademark check
  before marketing is worth doing. **User decision**, low priority.
- **Labels about named companies.** Words like "ghost job" imply intent. Use
  factual wording ("open 400+ days", "reposted 2×") and cite the data. The
  climate-score reversal shows the backlash risk (S15).
- **Third-party datasets for the Juice Score.** Numbeo forbids automated
  collection without permission and needs a paid licence to republish (S67).
  The Economist's Big Mac data is MIT-licensed (S68). HUD Fair Market Rents are
  public US data (S69).

### 4.4 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A wrong salary goes viral | Medium | High | Vetting quarantine (in progress), clarity labels, published Compstimate error |
| An ATS blocks or rate-limits us | Low | High | One fetch per board per day, cache, identifying User-Agent, snapshot fallback |
| Lever turns off CORS | Medium | Low | Snapshot fallback already silent for Lever |
| A copyright complaint about descriptions | Low–Medium | Medium | Excerpts and a link out (user decision) |
| A company objects to an "evergreen" or "reposted" label | Low | Medium | Factual wording, posting dates shown, no "ghost" or "fake" |
| A Pages limit is reached | Low | Medium | Site is 85 MB today, against a 1 GB limit and 100 GB/month soft bandwidth (S73) [L] |
| Base-only comparisons mislead | High | Medium | "Base pay only" caption and equity-mentioned labels (ROADMAP Top 3 #3) |

## References

All accessed 2026-10-02. [F] = fetched and read. Everything else [S] = search
result snippet or summary, page not opened.

**Zillow**
- S1 The Close, "How accurate is the Zestimate": <https://theclose.com/how-accurate-is-zillow-zestimate/>
- S2 RealTrends, "Lasting impact: Rich Barton and the Zestimate" (2022-08-03): <https://www.realtrends.com/blog/2022/08/03/lasting-impact-zillows-rich-barton-for-creation-of-the-zestimate/>
- S3 GeekWire, "Appeals court sides with Zillow" (2019): <https://www.geekwire.com/2019/appeals-court-sides-zillow-lawsuit-zestimate-accuracy/>
- S4 Houston Agent Magazine, "Zestimate facing class-action lawsuit" (2017-05-22): <https://houstonagentmagazine.com/2017/05/22/zillows-zestimate-facing-class-action-lawsuit>; Techdirt (2017): <https://archive.techdirt.com/articles/20170829/11593938106/court-dumps-lawsuit-against-zillow-over-inaccurate-zestimates.shtml>
- S5 Zillow, "Home search tips": <https://www.zillow.com/pro/zillow-home-search-tips/>
- S6 GeekWire, "Zillow app lets users draw boundaries" (2011): <https://www.geekwire.com/2011/zillow-app-draw-search-map/>
- S7 Zillow press release (2022-07-21), up to five areas at once: <https://zillow.mediaroom.com/2022-07-21-Zillows-new-tool-powers-home-searches-in-up-to-five-areas-at-once,-letting-shoppers-move-as-fast-as-the-market>
- S8 Inman, "Alerts let agents mine Zillow" (2013-08-26): <https://inman.com/2013/08/26/alerts-let-agents-mine-zillow-for-potential-listings>
- S9 PageCrawl, "Zillow and Redfin monitoring": <https://pagecrawl.io/blog/zillow-redfin-monitoring-home-prices-new-listings>
- S10 Bushe, "Zillow house hunting hack": <https://bushe.co/blog/zillow-house-hunting-hack-that-shows-hidden-value-metrics/>
- S11 NowBam, "Zillow reports record price cuts" (2025): <https://nowbam.com/zillow-reports-5-year-inventory-high-and-record-price-cuts/>
- S12 Zillow Group, BuyAbility: <https://www.zillowgroup.com/news/our-new-tool-addresses-home-buyers-biggest-concern-affordability>; Inman (2024-11-19): <https://www.inman.com/2024/11/19/with-focus-on-mortgage-business-zillow-launches-buyability-tool/>
- S13 Zillow Group, commute-time filter: <https://zillowgroup.com/news/zillows-commute-time-filter>; Inman (2024-06-13): <https://inman.com/2024/06/13/time-is-of-the-essence-with-zillows-latest-search-filter>
- S14 Inman, "Homebuyers demand school data" (2023-11-22): <https://inman.com/2023/11/22/homebuyers-demand-school-data-portals-are-grappling-with-the-risks>
- S15 RISMedia, "Zillow removes climate risk scores" (2025-12-02): <https://www.rismedia.com/2025/12/02/zillow-removes-climate-risk-scores/>; Claims Journal (2025-12-09): <https://www.claimsjournal.com/news/national/2025/12/09/334470.htm>
- S16 Apartment Therapy, Zillow 3D Home tours: <https://www.apartmenttherapy.com/zillow-3d-home-app-36880946>
- S17 HousingWire, Zillow Q1 2025 earnings: <https://www.housingwire.com/articles/zillow-earnings-q1-2025-jeremy-wacksman-listing-transparency-app-traffic/>; SEC EX-99.1 Q1 2025 (fetch blocked): <https://www.sec.gov/Archives/edgar/data/1617640/000161764025000062/q12025991.htm>
- S18 Inman, "How Zillow kept growing in 2025" (2026-02-10): <https://www.inman.com/2026/02/10/heres-how-zillow-continued-growing-and-touching-more-transactions-in-2025/>; GeekWire Q4 2025: <https://www.geekwire.com/2026/zillow-tops-estimates-with-654m-in-q4-revenue-up-18/>
- S19 HousingWire, Zillow in ChatGPT: <https://www.housingwire.com/articles/zillow-chatgpt-launch-app-integration/>
- S20 Zillow Research data: <https://www.zillow.com/research/data/>

**Big boards**
- S21 HR Dive, "LinkedIn to show salary insights on each job posting": <https://www.hrdive.com/news/linkedin-to-show-salary-insights-on-each-job-posting/517478/>
- S22 Search Engine Journal, "91% of applicants want salary range": <https://www.searchenginejournal.com/linkedin-data-91-of-applicants-want-salary-range-in-job-posting/479267/>
- S23 LoopCV, "LinkedIn Premium in 2026": <https://blog.loopcv.pro/linkedin-premium-is-it-worth-paying-for-in-2026/>
- S24 Hiration, "What 'Over 100 applicants' means": <https://www.hiration.com/blog/over-100-applicants/>
- S25 JobMentis, "Ghost jobs on LinkedIn": <https://www.jobmentis.com/en/guide/ghost-jobs-linkedin>
- S26 Staffing Industry Analysts, LinkedIn revenue: <https://www.staffingindustry.com/news/global-daily-news/linkedin-revenue-rises-9-with-growth-in-marketing-solutions>; Fueler (blog-grade): <https://fueler.io/blog/linkedin-in-usage-revenue-valuation-growth-statistics>
- S27 Indeed Hiring Lab pay-transparency tracker, via Recruiting News Network: <https://www.recruitingnewsnetwork.com/posts/salary-transparency-is-trending-up-but-at-a-slower-pace-indeeds-hiring-lab-finds>; summary page: <https://www.makerstations.io/?p=12418>; tracker category: <https://www.hiringlab.org/post_mwm_category/pay-and-benefits/page/2>
- S28 HireTruffle, Indeed pricing: <https://hiretruffle.com/blog/indeed-pricing>
- S29 Capterra, Indeed reviews: <https://www.capterra.com/p/161381/Indeed/reviews>
- S30 Business Wire, Indeed Career Scout (2025-09-10): <https://www.businesswire.com/news/home/20250910809034/en/Indeed-Introduces-New-Suite-of-Hiring-Products-Career-Scout-Talent-Scout-Premium-Sponsored-Jobs-and-Indeed-Connect>
- S31 IdealTraits, Indeed salary transparency guidelines: <https://idealtraits.com/blog/important-updates-to-indeeds-salary-transparency-guidelines/>
- S32 Fortune (2025-07-11): <https://www.fortune.com/2025/07/11/indeed-glassdoor-layoffs-jobs-recruit-holdings-hisayuki-deko-idekoba-ai>; Reworked: <https://reworked.co/employee-experience/glassdoor-folds-into-indeed/>
- S33 Glassdoor, "Pay range accuracy" (fetch blocked): <https://www.glassdoor.com/blog/pay-range-accuracy/>
- S34 AlternativeTo, Glassdoor real names (2024-03): <https://alternativeto.net/news/2024/3/glassdoor-accused-of-exposing-users-real-names-without-consent-raising-privacy-concerns/>
- S35 ProductMint, Glassdoor business model: <https://productmint.com/the-glassdoor-business-model-how-does-glassdoor-make-money/>
- S36 eWeek, Glassdoor Job Explorer: <https://www.eweek.com/de/it-management/glassdoor-job-explorer-designed-to-help-users-find-work/>
- S37 Radancy, "Google for Jobs paid ads discontinued" (2024-04-11): <https://blog.radancy.com/2024/04/11/google-for-jobs-paid-ads-to-be-discontinued>
- S38 HR Reporter, Google for Jobs: <https://www.hrreporter.com/focus-areas/recruitment-and-staffing/google-for-jobs-to-be-introduced-over-next-few-weeks/282535>

**Pay data**
- S39 Fast Company on Levels.fyi: <https://www.fastcompany.com/90604436/levels-fyi-leveling-tech-salaries-leveling-negotiation>; Levels.fyi About: <https://levels.fyi/about/>
- S40 Product Hunt, Levels.fyi Jobs: <https://www.producthunt.com/products/levels-fyi/launches/levels-fyi-jobs>
- S41 Levels.fyi heatmap: <https://levels.fyi/heatmap>; community thread: <https://www.levels.fyi/community/thread/GnnMRk/levels-fyi-salary-heatmap-of-the-united-states>
- S42 Blind, "How accurate is levels.fyi": <https://www.teamblind.com/post/how-accurate-is-levelsfyi-for-your-company-smetk7xe>
- S43 Blind on the App Store: <https://apps.apple.com/us/app/blind-professional-community/id737534965>; The Globe and Mail: <https://arc-dev.theglobeandmail.com/investing/personal-finance/young-money/article-networking-platform-team-blind-helps-fill-the-gap-in-salary>
- S44 HR Dive, pay-transparency tracker: <https://www.hrdive.com/news/pay-transparency-tracker-California-NYC/640103/>; HR Dive, wide ranges: <https://www.hrdive.com/news/some-california-tech-firms-post-wide-pay-ranges/640218/>; The Pragmatic Engineer: <https://blog.pragmaticengineer.com/the-scoop-salary-transparency/>

**Curated and startup boards**
- S45 Wellfound About: <https://wellfound.com/about>; Trustpilot: <https://uk.trustpilot.com/review/wellfound.com>
- S46 WTTJ press release on Otta: <https://press.welcometothejungle.com/news/uk-recruitment-platform-otta-acquired-by-welcome-to-the-jungle>; Salary Transparency Champions: <https://us.welcometothejungle.com/blog/salary-transparency-champions>
- S47 Vendr, Built In pricing: <https://www.vendr.com/marketplace/built-in>; Built In sites: <https://builtin.com/our-sites>; Apify Built In scraper (card fields): <https://apify.com/scrapesage/builtin-jobs-scraper>
- S48 University of Miami careers, Hiring Cafe: <https://customcareer.miami.edu/resources/hiring-cafe/>; Scoutify review: <https://scoutify.com/blog/hiringcafe-review>; Jobright blog review: <https://jobright.ai/blog/hiringcafe-review-2026-features-pros-cons-and-alternatives/>; Apify (46 ATSs): <https://apify.com/blackfalcondata/hiringcafe-scraper>
- S49 LoopCV, Jobright review: <https://www.loopcv.pro/directory/jobright/>; ResumeHog: <https://resumehog.com/blog/posts/jobright-ai-review-2026-features-pricing-and-best-tips.html>
- S50 Simplify Copilot: <https://simplify.jobs/copilot>; TechCrunch (2024-02-07): <https://techcrunch.com/2024/02/07/simplify-looks-to-ai-to-help-with-job-searches-and-applications>
- S51 LoopCV, Teal review: <https://www.loopcv.pro/directory/teal/>
- S52 Y Combinator, "Filter by equity": <https://www.ycombinator.com/blog/filter-by-equity-at-yc-startups>

**Visualization and time-series**
- S53 TrueUp: <https://trueup.io/job-trend>, <https://trueup.io/big-tech-hiring>
- S54 LinkUp, closed duration of job listings: <https://linkup.com/use-cases/closed-duration-of-job-listings>
- S55 Esri WhereNext, "Job hunting with a map": <https://www.esri.com/about/newsroom/publications/wherenext/job-hunting-with-a-map>; Onrec, Totaljobs map: <https://onrec.com/news/launch/totaljobscom-helps-recruiters-put-their-jobs-the-map>

**Market context**
- S56 CPA Practice Advisor (2025-11-12): <https://www.cpapracticeadvisor.com/2025/11/12/ghost-jobs-up-to-1-in-3-job-listings-dont-result-in-hires/173044/>; Business Insider NL (Greenhouse 18–22%): <https://www.businessinsider.nl/ghost-job-ads-are-one-reason-finding-a-new-role-can-be-soul-crushing-says-greenhouse-exec/>; Daily Hive (LinkedIn and Greenhouse verified): <https://dailyhive.com/canada/linkedin-ghost-job>
- S57 Greenhouse and CLEAR partnership (2025-06): <https://greenhouse.com/newsroom/greenhouse-and-clear-announce-partnership-to-enable-candidate-verification>
- S58 Jackson Lewis, 2026 pay transparency: <https://jacksonlewis.com/insights/navigating-2026-pay-transparency-laws-and-employer-obligations>; Hunton: <https://www.hunton.com/hunton-retail-law-resource/several-states-enact-pay-transparency-laws-what-employers-need-to-know-in-2026>; LOIO: <https://loio.com/guides/pay-transparency-laws-by-state/>
- S59 Lewis Silkin (2026-07-01): <https://www.lewissilkin.com/insights/2026/07/01/eu-pay-transparency-directive-2026-employer-compliance>; Littler: <https://www.littler.com/news-analysis/asap/eu-pay-transparency-directive-early-transposition-trends-watch>
- S60 HeroHunt, "What OpenAI and Anthropic pay engineers 2026" (blog-grade): <https://www.herohunt.ai/blog/what-openai-and-anthropic-pay-engineers-2026/>; techinterview.org (blog-grade): <https://www.techinterview.org/post/3233474671/compensation-by-company-tier-2026/>

**Legal, terms and data licences**
- S61 [F] Lever postings API README: <https://github.com/lever/postings-api/blob/master/README.md>
- S62 [F] Greenhouse Job Board API introduction: <https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_introduction.md>
- S63 Greenhouse support, careers page integration: <https://support.greenhouse.io/hc/en-us/articles/200721644-Integrate-a-job-board-with-your-careers-page>
- S64 Ashby docs, lightweight job posting API: <https://docs.ashbyhq.com/using-the-lightweight-job-posting-api-to-list-openings-on-your-site>
- S65 Proskauer, hiQ–LinkedIn settlement (2022-12-08): <https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/>; ZwillGen: <https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/>
- S66 Farella Braun + Martel, *Meta v. Bright Data*: <https://www.fbm.com/business-litigation/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/>; Quinn Emanuel: <https://www.quinnemanuel.com/the-firm/news-events/client-alert-what-does-the-meta-v-bright-data-summary-judgment-ruling-mean-for-web-scraping/>
- S67 Numbeo terms of use: <https://www.numbeo.com/common/terms_of_use.jsp>
- S68 R-bloggers on the Economist's Big Mac index code (MIT licence): <https://www.r-bloggers.com/the-economists-big-mac-index-is-calculated-with-r/>
- S69 HUD Fair Market Rents: <https://www.huduser.gov/PORTAL/datasets/fmr.html>
- S70 openrouteservice plans: <https://openrouteservice.org/plans/>
- S71 US DOL OFLC performance and disclosure data: <https://dol.gov/agencies/eta/foreign-labor/performance>
- S72 GitHub Docs, artifact and log retention: <https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization>
- S73 GitHub Docs, GitHub Pages limits: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
- S74 Apify, Greenhouse job feeds (`first_published` and `updated_at`): <https://apify.com/sourcesauce/greenhouse-job-feeds>
- S75 Dice, compare job offers tool: <https://dice.com/career-advice/compare-job-offers-new-tool>; Climb on Product Hunt: <https://www.producthunt.com/@climb>

**Local data [L]:** `data/snapshots/*.json` (fetched by the snapshot workflow
on 2026-10-02 at 05:54 UTC) and `data/vetting/2026-10-02/flags.counts.json`.
The commands that produced each number are in
[../process/strategy.md](../process/strategy.md) §4.

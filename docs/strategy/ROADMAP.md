# Roadmap: features that beat Zillow and the job boards

Written on 2026-10-02 by the strategy workstream. Evidence and source IDs (S1…)
are in [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md#references). [L] marks
numbers computed from melon-seek's real snapshots (5,413 postings, 8 boards,
2026-10-02). The scoring method and research log are in
[../process/strategy.md](../process/strategy.md).

**In one paragraph.** Build three things first:

1. **Market comps.** The same role compared across every tracked company.
   Nobody does this from posted ranges, and all the data needed is already in
   our snapshots.
2. **Honest numbers.** Labels for pay clarity and range width, a note that
   pay is base only, and Compstimate's measured error rate, the way Zillow
   publishes the Zestimate's.
3. **Listing history.** Start recording a daily ledger now, so we can show
   true days listed, freshness and reposts. Every day without it is history
   we can never get back, and pay changes and hiring velocity depend on it
   too.

Then add saved searches with "new since your last visit". Don't build commute
time or draw-a-boundary search yet. With our city-level data, both cost much
more than they give.

## 5. 1-up features, evaluated

### 5.0 How features were scored

`Score = Value × Differentiation × Readiness ÷ Effort`

| Factor | Scale | Meaning |
|---|---|---|
| Value (V) | 1–5 | How much it changes a job seeker's decision, times how often they'd use it |
| Differentiation (D) | 1–5 | 5 = no competitor in §2 of the analysis offers it. 1 = every board has it |
| Readiness (R) | 0.25 / 0.5 / 0.75 / 1 | 1 = data already in our snapshots. 0.75 = in the ATS API but not stored yet. 0.5 = needs an external dataset with licence questions. 0.25 = needs weeks of history, or data we can't get |
| Effort (E) | S = 1, M = 2, L = 4 | S is about 2 days in one workstream. M is 1–2 weeks across 2–3 workstreams. L needs new infrastructure or a backend, which the static architecture doesn't have |

Two flags are not part of the score but can change the order:

- **Clock.** The feature's value depends on history that is lost for good if
  we start later.
- **Foundation.** Other features can't be built without it.

A feature with **Risk** (legal or reputational exposure) can be vetoed or held
back whatever its score. The decision rule is in
[strategy.md](../process/strategy.md) §3.

### 5.1 Feature evaluations

Each card gives the Zillow analogue or the competitor gap it answers, the user
value, the data needed and whether we have it, the effort, the risks, and a
verdict.

#### F1. Market comps: the same role across companies (from the prompt's "comparing a role across companies")
- **Analogue or gap:** Zillow's "comparable homes". Levels.fyi compares
  companies using self-reported pay (S39). No competitor in §2 compares
  **posted** ranges role by role across employers. LinkedIn and Indeed show one
  posting at a time.
- **User value:** "Research Engineer at Anthropic posts $X. What do OpenAI,
  xAI and Cohere post for the same family and level?" This is the question
  people bring to a site that calls itself the Zillow of jobs.
- **Data:** **Have it.** Titles, seniority (`inferSeniority`), departments and
  vetted salaries are in every snapshot. Role families already exist in
  `public/features/compstimate.js` (`normalizeTitle`, role-family regexes).
  The new piece is a build-time aggregate, `api/market.json` (under 150 KB),
  so the browser doesn't download 8 company lists.
- **Effort:** M (aggregation script, pure module, small chart, drawer wiring).
- **Risks:** Role families can be wrong for odd titles. Base pay only: equity
  at AI labs is large (S60), so label it. Currency conversion uses a static FX
  table.
- **Score:** V5 × D5 × R1 ÷ 2 = **12.5** (Foundation for F9).
- **Verdict:** **Now, Top 3.**

#### F2. Honest numbers, part 1: pay clarity labels (new: gap left by every competitor)
- **Analogue or gap:** Zillow shows price per square foot and price cuts on
  the card. Here, the gap is that posted ranges can be meaningless:
  - Netflix SWE was posted at $90K–$900K (S44);
  - about 1 in 3 posted ranges don't contain real pay (S33);
  - AI-lab equity isn't in the posted range at all (S60).
- **User value:** know whether a number is tight, wide or base-only before
  anchoring on it.
- **Data:** **Have it.** Spread (max/min) is computable now. In our data the
  median spread is 1.25–1.50×, and the p90 is 1.35–2.45× depending on company
  [L]. The vetting scan already detects multiple ranges and multi-currency
  posts. Equity and bonus mentions are a lexicon match on the description
  text.
- **Effort:** S.
- **Risks:** A false "equity mentioned" label. Mitigate with a small hand-checked
  sample and conservative patterns.
- **Score:** V3 × D4 × R1 ÷ 1 = **12**.
- **Verdict:** **Now, Top 3** (bundled with F3 as "Honest numbers").

#### F3. Honest numbers, part 2: Compstimate's published accuracy (new: Zillow's trust move)
- **Analogue or gap:** Zillow publishes the Zestimate's median error (1.78%
  on-market, 7.20% off-market) (S1). The estimates from LinkedIn, Indeed and
  Glassdoor come with no published error (S21, S31, S33).
- **User value:** know how far to trust a Compstimate.
- **Data:** **Have it.** Leave-one-out backtest over salaried jobs: estimate
  each job from the others, then report the median absolute % error.
- **Effort:** S. Compute it at build time, because doing it in the browser is
  O(n²) for Anduril's 2,277 salaried jobs.
- **Risks:** An embarrassing number. That is the point: publish it anyway, and
  label low-confidence estimates.
- **Score:** V3 × D4 × R1 ÷ 1 = **12**.
- **Verdict:** **Now, Top 3** (bundled with F2).

#### F4. Listing age, freshness and repost detection: "days on market", including ghost and evergreen flags (prompt items: days on market and repost detection, ghost or evergreen postings)
- **Analogue or gap:** Zillow shows days on market and delist/relist history
  (S10). LinkedIn's "Reposted" label hides the count and the original date
  (S25). Ghost jobs are a top complaint: 18–22% of Greenhouse postings never
  fill (S56). LinkUp sells job-duration data (S54).
- **User value:** apply where hiring is live, and spot evergreen requisitions.
  Palantir's median posting age is 462 days, and 224 of its 320 postings are
  more than 180 days old [L].
- **Data:**
  - Lever's `createdAt` and Ashby's `publishedAt` already give true ages,
    but the code calls them `updatedAt`.
  - Greenhouse's `first_published` exists in the API (S74,
    DATA_SOURCES.md) but isn't stored. Today, Greenhouse ages come from
    `updated_at`, which reports 0–7 days for whole boards [L].
  - Repost detection needs a **history ledger**, which we don't have.
    Snapshot artifacts are deleted after 14 days.
- **Effort:** M (adapter fields, ledger script, persistence, UI text).
- **Risks:**
  - Reputational: saying "ghost" implies intent. Use factual wording only:
    "Open 400+ days", "Reposted 2×".
  - Bulk edits on Greenhouse distort `updated_at`, so never use it for age.
- **Score:** V5 × D4 × R0.75 ÷ 2 = **7.5**, flagged **Clock** and
  **Foundation** (needed for F10, F11, the feeds in F5, and accurate "New"
  badges).
- **Verdict:** **Now, Top 3.** Promoted above F6 by the Clock rule.
  Ghost/evergreen flagging is not a separate feature; it's the "evergreen"
  freshness level here.

#### F5. Saved searches with alerts
- **Analogue or gap:** Zillow's instant or daily alerts for new listings and
  price cuts (S8, S9). Every big board has alerts, but all of them need an
  account. Hiring Cafe sends daily digests (S48).
- **User value:** come back when a matching role or pay band appears.
- **Data:** **Have it** for local use. The URL hash already encodes the full
  filter state. "New since your last visit" needs either the ledger's
  `firstSeenAt` or a per-browser set of job ids seen.
  - Email or push alerts need a server, which we don't have.
  - A static **Atom feed** per company, of postings first seen in the last 14
    days, works on Pages once the ledger exists.
- **Effort:** S for the local part. Feeds are S after F4.
- **Risks:** A localStorage-only list is lost if the browser data is cleared.
  Say so in the UI.
- **Score:** V4 × D3 × R1 ÷ 2 = **6**. D is 3, not 2, because no account is
  needed.
- **Verdict:** **Now** for local saved searches and "New" badges. **Next** for
  feeds, after F4. **Later** for email (user decision).

#### F6. More companies on the three ATSs we support (new: the biggest gap)
- **Analogue or gap:** Zillow's value grows with coverage. We have 8 companies
  [L], against Hiring Cafe's 2.9M postings (S48) and TrueUp's 9K companies
  (S53).
- **User value:** high. Market comps (F1) get better with every company added.
- **Data:** each slug must be confirmed (the research workstream does this, as
  in DATA_SOURCES.md §6). The Pages size budget is fine: 85 MB today against
  a 1 GB limit (S73) [L].
- **Effort:** S per batch.
- **Risks:** Stale slugs (the Mistral case). Per-board body caps.
- **Score:** V4 × D2 × R1 ÷ 1 = **8**.
- **Verdict:** **Now.** Needs the user to say which companies, and whether to
  stay AI/defence or widen (§9).

#### F7. Open data downloads (new: Zillow Research analogue)
- **Analogue or gap:** Zillow publishes ZHVI and ZORI as free CSVs (S20), and
  becomes the number the press cites.
- **User value:** analysts and journalists can cite us. Users can import the
  data into spreadsheets.
- **Data:** **Have it.** Export facts only (title, team, location, pay, dates,
  URL), not description text.
- **Effort:** S.
- **Risks:** Low. These are facts, with attribution and links to the original
  postings.
- **Score:** V2 × D3 × R1 ÷ 1 = **6**.
- **Verdict:** **Now.**

#### F8. Juice Score affordability (in progress, livability workstream)
- **Analogue or gap:** Zillow's BuyAbility tags homes that fit your budget and
  shows the monthly payment (S12). Levels.fyi's cost-of-living adjustment was
  still "being worked on" (S41).
- **User value:** "$300K in SF vs $220K in Austin: which leaves more?"
- **Data:**
  - Rent: HUD Fair Market Rents are public, US only (S69).
  - Big Mac index: MIT-licensed (S68).
  - Numbeo is ruled out, because its terms forbid scraping and republishing
    (S67).
  - Tax tables are needed for take-home pay.
  - Non-US coverage is weak.
- **Effort:** M. It's already underway.
- **Risks:** Zillow removed its climate-risk scores after accuracy complaints
  (S15). A single opaque score about a city invites the same.
  - Show the inputs.
  - Let users edit rent.
  - Label non-US results "low confidence".
  - Call it an estimate.
- **Score:** V4 × D4 × R0.5 ÷ 2 = **4**.
- **Verdict:** **Now.** Finish it with these guardrails. No new top-level
  control.

#### F9. Offer comparator
- **Analogue or gap:** Levels.fyi shows companies side by side (S39), and many
  calculators model vesting (S75). Ours can combine an offer with **posted
  market comps (F1)** and **Juice (F8)**, which they don't.
- **User value:** high at the offer stage, but few sessions reach it.
- **Data:** the user types it in, and it stays local. Market percentiles come
  from F1 and cost of living from F8.
- **Effort:** M.
- **Risks:** People take it as financial advice. Keep it descriptive.
- **Score:** V3 × D2 × R1 ÷ 2 = **3**.
- **Verdict:** **Next** (after F1 and F8).

#### F10. Pay-range "price cuts" and raises over time (prompt item)
- **Analogue or gap:** Zillow's price history and price-cut labels. In
  mid-2025, a record 26–27% of listings had a cut (S11). No job board tracks
  how a posting's range changes.
- **User value:** "This role's range went up 8% after 3 weeks": a signal of
  urgency, or room to negotiate.
- **Data:** **Don't have it.** It needs the F4 ledger with a pay entry per
  run. It also needs a parser-version stamp, so a parser fix doesn't look
  like a pay change.
- **Effort:** M.
- **Risks:** False changes from parser fixes or currency rounding. Compare only
  vetted values, and only changes of 3% or more.
- **Score:** V4 × D5 × R0.25 ÷ 2 = **2.5** now. That becomes about 10 once
  the ledger has 30–60 days of data.
- **Verdict:** **Next.** Start recording in Now (part of F4).

#### F11. Company "neighbourhood" stats: hiring velocity and team growth by department (prompt item)
- **Analogue or gap:** Zillow's neighbourhood data. TrueUp tracks open-job
  counts per company (S53), but not by department next to pay.
- **User value:** "Is this team growing? Are postings closing (being filled)
  or lingering?"
- **Data:** **Don't have it.** It needs the F4 ledger (opened and closed per
  week, per department). Current counts exist now.
- **Effort:** M.
- **Risks:** Reading closed postings as hires. Closed only means "taken down".
- **Score:** V3 × D4 × R0.25 ÷ 2 = **1.5** now, about 6 once history exists.
- **Verdict:** **Next.**

#### F12. More ATS adapters: SmartRecruiters, Workable and others (new)
- **Analogue or gap:** coverage beyond Greenhouse, Ashby and Lever. Hiring Cafe
  covers 46 ATSs (S48).
- **Data:** public APIs and CORS behaviour are **unverified** (not researched
  here). Workday has no documented public posting API, so reaching it would
  mean scraping internal endpoints, which carries terms-of-service risk.
- **Effort:** L for a set of adapters.
- **Score:** V4 × D2 × R0.5 ÷ 4 = **1**.
- **Verdict:** **Next:** the research workstream verifies first. Workday
  stays **Later**, or never.

#### F13. Draw-a-boundary search (prompt item)
- **Analogue or gap:** Zillow's Draw tool (S5–S7).
- **User value:** low for jobs. Postings fall into about 20–50 cities per
  company [L], at city-level coordinates, and clicking a map cluster already
  selects an area (`onAreaSelect`).
- **Data:** have it, but too coarse for a polygon to mean much.
- **Effort:** M. Hand-rolled polygon drawing, because the project allows no
  dependency besides Leaflet.
- **Risks:** UI clutter for little gain.
- **Score:** V2 × D2 × R1 ÷ 2 = **2**.
- **Verdict:** **Later.** Instead, add "within N km of a city" to the existing
  Location filter (S, features plus UX).

#### F14. Commute time to office (prompt item)
- **Analogue or gap:** Zillow's commute filter (S13). Google for Jobs filters
  by commute distance (S38).
- **User value:** moderate for on-site roles, none for remote roles. 562 of
  OpenAI's 833 postings and 120 of Cohere's 132 are flagged remote [L].
- **Data:** **Don't have it.**
  - We have no office street addresses; locations are city-level.
  - Routing needs an API key, and in a static site the key is public. The
    free openrouteservice tier allows 500 isochrones a day (S70), which a
    public site would exhaust.
- **Effort:** L.
- **Risks:** Times that look precise but are wrong.
- **Score:** V2 × D2 × R0.25 ÷ 4 = **0.25**.
- **Verdict:** **Later or never.** The radius option in F13 covers most of the
  need.

#### F15. Plain-language search (new)
- **Analogue or gap:** Zillow's natural-language search and its ChatGPT app
  (S19), and Indeed's Career Scout (S30).
- **Data:** have it. Parse queries like "remote ML roles over 300k" into our
  existing filters with a small grammar. No LLM and no backend.
- **Effort:** M.
- **Score:** V3 × D2 × R1 ÷ 2 = **3**.
- **Verdict:** **Later.** Reuse the existing search box, with no new control.

#### F16. Pay-transparency "range missing where required" hint (new)
- **Analogue or gap:** Comprehensive.io's compliance rates (S44). There are 16
  states plus DC with disclosure laws (S58), and the EU directive (S59).
- **Data:** posting location plus whether a range is present. The legal rules
  are hard: employer-size thresholds, remote-work rules, effective dates.
- **Effort:** S to show, but a legal review is needed.
- **Risks:** **Legal.** Implying a named company broke the law. This is
  vetoed until a lawyer has reviewed it.
- **Score:** V2 × D3 × R0.75 ÷ 1 = **4.5**, vetoed by Risk.
- **Verdict:** **Later**, behind legal review.

#### F17. Email and push alerts (new)
- **Data and effort:** needs a backend, or a third-party RSS-to-email service.
  L.
- **Score:** V4 × D2 × R0.5 ÷ 4 = **1**.
- **Verdict:** **Later.** User decision (§9).

### 5.2 Score summary

| ID | Feature | V | D | R | E | Score | Flags | Verdict |
|---|---|---|---|---|---|---|---|---|
| F1 | Market comps across companies | 5 | 5 | 1 | M | **12.5** | Foundation | **Now · Top 3** |
| F2 | Pay clarity labels | 3 | 4 | 1 | S | **12** | | **Now · Top 3** (with F3) |
| F3 | Compstimate published accuracy | 3 | 4 | 1 | S | **12** | | **Now · Top 3** (with F2) |
| F6 | More companies, current ATSs | 4 | 2 | 1 | S | 8 | needs decision | Now |
| F4 | Listing age, freshness, reposts (history ledger) | 5 | 4 | 0.75 | M | 7.5 | **Clock, Foundation** | **Now · Top 3** |
| F5 | Saved searches + "new since last visit" | 4 | 3 | 1 | M | 6 | | Now (feeds: Next) |
| F7 | Open data CSV | 2 | 3 | 1 | S | 6 | | Now |
| F16 | Missing-range compliance hint | 2 | 3 | 0.75 | S | 4.5 | **Risk (veto)** | Later |
| F8 | Juice Score | 4 | 4 | 0.5 | M | 4 | Risk (accuracy) | Now (finish, guardrails) |
| F9 | Offer comparator | 3 | 2 | 1 | M | 3 | depends on F1, F8 | Next |
| F15 | Plain-language search | 3 | 2 | 1 | M | 3 | | Later |
| F10 | Pay changes over time | 4 | 5 | 0.25 | M | 2.5 (about 10 once history exists) | depends on F4 | Next |
| F13 | Draw-a-boundary | 2 | 2 | 1 | M | 2 | | Later (radius instead) |
| F11 | Hiring velocity by department | 3 | 4 | 0.25 | M | 1.5 (about 6 once history exists) | depends on F4 | Next |
| F12 | More ATS adapters | 4 | 2 | 0.5 | L | 1 | research first | Next |
| F17 | Email or push alerts | 4 | 2 | 0.5 | L | 1 | needs backend | Later |
| F14 | Commute time | 2 | 2 | 0.25 | L | 0.25 | | Later or never |

## 6. Prioritized roadmap

### 6.1 Now, Next, Later

| Horizon | What | Why it fits |
|---|---|---|
| **Now** (fits the static architecture today) | **F4** history ledger and listing age (start immediately). **F2 + F3** Honest numbers. **F1** Market comps. **F5** local saved searches and "New" badges. **F7** CSV. **F6** more companies (after the user decides). **F8** finish the Juice Score with guardrails | Everything is computed at build time in GitHub Actions, or in the browser. No server |
| **Next** (needs 30–60 days of ledger, or research) | **F10** pay changes. **F11** hiring momentum. **F5** Atom feeds. **F9** offer comparator. **F12** new ATS adapters once their APIs are verified. Radius option in the Location filter (the F13 substitute) | The ledger has to collect history first, or another workstream has to verify sources first |
| **Later** | **F15** plain-language search. **F17** email alerts (needs a backend or a third party). **F16** compliance hint (needs legal review). **F13** draw-a-boundary and **F14** commute time, only if the data gets street-level | Needs new infrastructure or a legal decision, or the value is low with city-level data |

### 6.2 The top 3 to build first, with acceptance criteria

#### Top 1: Market comps, "Same role elsewhere" (F1)
1. `npm run build` writes `dist/api/market.json` of **150 KB or less**,
   covering every built-in company. Server mode serves the same JSON at
   `GET /api/market`.
2. Every cell is built only from **vetted** salaries: quarantined ones, with
   `salary === null`, are excluded. Each cell has **n ≥ 3**, amounts are in
   USD using the shared FX table, and the file states
   `basis: "posted base pay ranges"`.
3. In the drawer of any salaried job with a known role family, a **"Same role
   elsewhere"** section lists every other company that has n ≥ 3 for the same
   family and seniority, showing the median and P25–P75.
   - If no company has a match at that seniority, the section falls back to
     family only and says so.
   - It renders within 50 ms of the drawer opening, from cached data.
4. Clicking a company row switches to that company with the matching family
   and seniority filters applied **through the URL hash**. Browser Back
   returns to the previous view.
5. Insights mode shows a **"Compare companies"** card with a role-family
   picker inside the card. It is keyboard-operable, has text alternatives, and
   works in light and dark themes.
6. Role-family accuracy: a hand check of 100 random real titles across at
   least 3 companies finds **90% or more** assigned to the correct family. The
   results are logged in `docs/process/product.md`.
7. Tests cover:
   - unit: percentiles, the n threshold, FX conversion, and family mapping of
     20 fixed real titles;
   - e2e: the drawer section appears for a demo-data job.
8. No new control is added to the top bar, quickbar or viz toolbar.

#### Top 2: Honest numbers, pay clarity and Compstimate accuracy (F2 + F3)
1. Every salaried job gets `salary.spread` (max ÷ min, 2 decimals) and
   `salary.zones` (the number of distinct pay ranges in the posting, at least
   1).
2. Every job gets `extras: { equity: boolean, bonus: boolean }`, from a tested
   lexicon over the description text. On a hand-labelled sample of 100 real
   postings, precision is **95% or more**.
3. The drawer's salary block shows **at most two** muted labels, chosen by
   this priority:
   - "Multiple pay zones" if `zones > 1`;
   - "Wide range (2.4×)" if `spread ≥ 2.0`;
   - "Single figure" if min equals max;
   - "+ equity mentioned";
   - "+ bonus mentioned".

   It always shows the caption "Posted base pay. Equity and bonus aren't
   included."
4. The build runs a seeded leave-one-out backtest of Compstimate per company,
   over all salaried jobs or a seeded sample of 500, whichever is smaller. It
   writes the response field
   `meta.compstimate = { medianAbsPctError, within10Pct, n, seed, computedAt }`.
5. The Compstimate card and the drawer estimate show **"Typically within ±X%
   (tested on N listed salaries)"**. If the company's median error is above
   25%, the estimate is labelled "Low confidence".
6. Tests cover determinism (same seed, same result), every label threshold,
   and that the lexicon rejects "equity" used in the DEI sense ("pay equity",
   "health equity").
7. No new controls.

#### Top 3: Listing history and freshness (F4)
1. Adapters emit `postedAt`: Greenhouse `first_published`, Ashby `publishedAt`,
   Lever `createdAt`. Each has a fixture test. `updatedAt` keeps its current
   meaning, so nothing that uses it breaks.
2. Each snapshot run updates a per-company ledger, `data/history/<slug>.json`,
   and keeps it across runs (where it's stored is a user decision, §9).
   - A board whose fetch fails or returns 0 jobs leaves its ledger unchanged.
   - A test asserts this.
   - The ledger stays under 5 MB in total for the built-ins. It is about
     0.8 MB at today's 5,413 postings [L].
3. Jobs gain these fields:
   - `postedAt`, `firstSeenAt`, `ageDays` and `ageIsMinimum`;
   - `freshness`: `new` ≤ 7 days, `active` 8–59, `stale` 60–179,
     `evergreen` ≥ 180;
   - `repost`: `{ count, firstSeenAt }` or `null`. A repost is a new id that
     shares a fingerprint (normalized title + department + primary location)
     with a posting that disappeared at most 30 days earlier, or that shares a
     Greenhouse `internal_job_id`.
4. Cards keep their existing age slot but take it from `ageDays`: "12d",
   "8mo", or "30d+" when `ageIsMinimum`. Greenhouse jobs with no
   `postedAt` and no history show **no age**, rather than an age derived from
   `updatedAt`.
5. The "Newest" sort uses `ageDays`. The existing "Updated" filter section
   becomes **"Listed"** (Past week, Past month, Past 3 months) with one
   checkbox, "Hide roles open 180+ days".
6. The drawer shows "Listed 34 days ago", "First seen by melon-seek on Oct 2,
   2026" and "Reposted 2×" when they apply.
   - Evergreen roles get one neutral line: "Open 180+ days. Some companies
     keep a posting open to collect applicants for a recurring role."
   - The words "ghost" and "fake" never appear.
7. Tests cover the ledger (new, unchanged, closed, reopened, repost,
   failed fetch), freshness thresholds, and missing dates.

## 7. Implementation plan

The user asked for every recommended feature to be built by the existing
workstreams. The owners use the coordinator's names:

| Owner | Files |
|---|---|
| backend/data | `server/*` except the files listed below, plus `scripts/*` and `.github/workflows/*` |
| features | `server/keywords.js`, `server/geo.js`, `server/demo.js` |
| viz | `public/viz/*` |
| UX | `public/index.html`, `styles.css`, `app.js` |
| product | `public/features/*` |
| livability | `server/juice.js`, `data/cities.json` |
| vetting | `server/salary.js`, `server/vet.js` |

**The lead adds every new field and endpoint below to `docs/CONTRACT.md`
before fanning out**, so all workstreams build against the same shapes.

### 7.0 Contract changes (all features)

**RawJob** (adapter output, and also the output of `demo.js`):

- `postedAt: ISO | null`: Greenhouse `first_published`, Ashby `publishedAt`,
  Lever `createdAt`. *(F4)*
- `reqId: string | null`: Greenhouse `internal_job_id`, `null` elsewhere. *(F4)*
- `salary.zones?: number`: the number of structured pay tiers the adapter saw,
  from Greenhouse `pay_input_ranges.length` or Ashby `compensationTiers.length`.
  *(F2)*

**Job** (normalized):

```js
{
  // ...existing fields unchanged...
  postedAt: ISO | null,                       // F4
  firstSeenAt: ISO | null,                    // F4 (from ledger)
  ageDays: number | null, ageIsMinimum: boolean, // F4
  freshness: "new"|"active"|"stale"|"evergreen"|null, // F4
  repost: { count: number, firstSeenAt: ISO } | null,  // F4
  salary: { ...existing, spread: number, zones: number } | null, // F2
  extras: { equity: boolean, bonus: boolean },          // F2
  // Next:
  payHistory: [{ at: ISO, min, max, currency }],        // F10 (only on change)
  payChange: { dir: "up"|"down", pct: number, at: ISO } | null // F10
}
```

**`/api/jobs` response** gains
`meta: { compstimate: {medianAbsPctError, within10Pct, n, seed, computedAt} | null, history: { since: ISO | null, runs: number } }`
*(F3, F4)*.

**New endpoints and static files:**

| Path | Server mode | Static (Pages) | Feature |
|---|---|---|---|
| Market comps | `GET /api/market` | `api/market.json` | F1 |
| History merge for live browser fetches | (merged on the server) | `api/history/<slug>.json`, a compact `id → [firstSeenAt, postedAt, repostCount]` | F4 |
| Open data | `GET /api/export?company=` (CSV) | `data/<slug>.csv` | F7 |
| Feeds (Next) | none | `feeds/<slug>.xml` (Atom) | F5 |
| Hiring trends (Next) | `GET /api/trends?company=` | `api/trends/<slug>.json` | F11 |

**Packed list format:** `melon-packed-1` becomes `melon-packed-2` with the new
fields, and the build's round-trip check covers them.

### 7.1 Per feature

#### F4. History ledger, listing age, freshness, reposts (start first: Clock)
- **(a) Owners:** backend/data (primary owner). UX. features (demo data).
  The lead (contract).
- **(b) Files and interfaces:**
  - backend/data:
    - `server/sources/greenhouse.js`, `ashby.js` and `lever.js`: `postedAt`
      and `reqId`.
    - New `server/history.js` (pure, browser-safe):
      `updateLedger(prev, jobs, fetchedAt) -> ledger` and
      `annotate(jobs, ledger, fetchedAt) -> jobs`.
    - New `scripts/history.js`, run by `scripts/snapshot.js` after each
      successful fetch.
    - Persistence of `data/history/*.json` in `snapshot.yml` and
      `pages.yml`. For the storage options see §9 D1.
    - `scripts/build-static.js` writes `api/history/<slug>.json` and bumps
      the packed format.
    - `public/api.js` merges history into live-fetched jobs. It's owned by
      UX/devops, so coordinate.
  - features: `server/demo.js` emits plausible `postedAt` values, so demo mode
    exercises the code.
  - UX (`public/app.js`): the card age slot uses `ageDays`. `makePosted()`
    becomes "Listed", plus the 180+ checkbox. The drawer gets a "Listing" line
    block. The "Newest" sort uses `ageDays`.
- **(c) Order:**
  1. The lead updates the contract.
  2. Backend adds adapter fields and **ledger capture (ship this alone,
     immediately)**.
  3. Backend adds `annotate` and the static history files.
  4. features updates demo data.
  5. UX wires it in.

  UX can start against demo data once step 1 is done.
- **(d) UI rule:** zero new main-view controls. The age reuses the card's
  existing age slot. The filter option goes in the existing collapsed
  section under More. Details go in the drawer.
- **One line:** *every card's age becomes the real "listed" age, and the drawer
  explains when it was posted, when we first saw it, and any reposts.*

#### F2 + F3. Honest numbers
- **(a) Owners:** vetting (spread and zones). features (extras lexicon).
  product (backtest). backend/data (runs the backtest at build). UX
  (labels).
- **(b) Files and interfaces:**
  - vetting: `server/vet.js` and `server/salary.js` set `salary.spread` and
    `salary.zones`. The text parser counts the distinct ranges it finds and
    merges in the adapter's `salary.zones`.
  - features: `server/keywords.js` gets a new
    `extractCompExtras(text) -> { equity, bonus }`, with a lexicon that
    ignores "pay equity", "health equity" and "equity and inclusion".
    `server/normalize.js` (backend) calls it.
  - product: `public/features/compstimate.js` gets a new
    `backtest(jobs, { seed, maxN }) -> { medianAbsPctError, within10Pct, n, seed }`
    (pure). The widget shows the accuracy line.
  - backend/data: `scripts/build-static.js` and the server call
    `backtest` once per company and put the result in `meta.compstimate`.
  - UX: `public/app.js` adds the labels and caption to the drawer salary
    block and the accuracy line to `compstimateBlock`.
- **(c) Order:** vetting, features and product work in parallel. Then backend
  wires up the build. Then UX. No dependency on other features.
- **(d) UI rule:** zero new controls. Text labels only, at most two in the
  drawer. Nothing new on cards, because card space is saved for F4 and F10.
- **One line:** *the drawer's pay block says how tight the range is and that
  it's base pay, and every estimate says how accurate it has been.*

#### F1. Market comps, "Same role elsewhere"
- **(a) Owners:** backend/data (aggregation). product (comps logic). viz
  (chart). UX (wiring). vetting (input gate).
- **(b) Files and interfaces:**
  - backend/data: new `scripts/build-market.js` (called from
    `build-static.js`, plus a server route for `GET /api/market`). It reads
    all snapshots after vetting and uses product's pure
    `normalizeTitle`/role-family helpers and shared FX.
  - product: new `public/features/comps.js` with:
    - `marketComps(market, { family, seniority, country? }) -> rows[]`;
    - `compsForJob(market, job) -> { rows, matchedOn: "family+seniority"|"family" }`;
    - `createCompsCard(container, { onPickCompany(slug, filters) })` for
      Insights.

    The corporate-ladder plan (`docs/strategy/CORPORATE_LADDER_PLAN.md`,
    another workstream) adds a generic "Level check" drawer section built on
    the same seniority buckets. It doesn't map levels across companies, so F1
    keeps `inferSeniority` buckets. If a cross-company level mapping ever
    exists, `compsForJob` can switch to it without changing its interface.
  - viz: new `public/viz/comps.js`,
    `createCompsChart(container, { onSelect(slug) }) -> { update(rows), destroy() }`.
    It draws one row per company: a P25–P75 bar with a median tick, styled
    like the "ranges" view.
  - UX: `public/app.js` adds the drawer section and the Insights card slot.
    Selecting a company sets the hash: company, family and seniority filters.
- **(c) Order:**
  1. The lead updates the contract.
  2. product's helpers. These exist in part, and must be importable from
     Node.
  3. backend's `build-market.js` and the endpoint.
  4. viz chart and UX wiring, in parallel against a fixture `market.json`.

  It depends on vetting's quarantine being in the build (already in
  progress).
- **(d) UI rule:** zero new main-view controls. It appears in the drawer, as a
  collapsed-by-default section once the drawer has more than 3 sections, and
  in the existing Insights mode. No new top-level mode.
- **One line:** *open any job and see what the same kind of role at the same
  level posts at every other tracked company.*

#### F5. Saved searches and "new since your last visit" (feeds are Next)
- **(a) Owners:** UX (all local parts). backend/data (feeds, Next).
- **(b) Files and interfaces:**
  - UX (`public/app.js`):
    - `localStorage["melon.saved"] = [{ id, name, hash, createdAt, lastSeenAt }]`
      and `localStorage["melon.seen.<slug>"] = lastVisitISO`, both wrapped in
      try/catch.
    - "New" means `firstSeenAt > lastVisit`, falling back to ids not seen
      before when there's no ledger.
    - Saved searches are listed in the company menu dialog with "N new"
      counts.
  - backend/data (Next): `scripts/build-feeds.js` writes `feeds/<slug>.xml`
    (Atom) from the ledger, covering postings first seen in the last 14 days.
    `<link rel="alternate">` goes in the page head.
- **(c) Order:** the local part can ship now on its own. It gets more accurate
  once F4's `firstSeenAt` exists. Feeds need F4.
- **(d) UI rule:** **one** new main-view control: a "Save" button in the
  quickbar, **shown only when at least one filter is active**. The saved list
  goes in the existing company menu. The "New" tag uses the card's single
  status-tag slot (§8).
- **One line:** *with filters set, press Save; next time, the company menu
  shows how many new roles match.*

#### F7. Open data CSV
- **(a) Owners:** backend/data (export). UX (link).
- **(b) Files and interfaces:** `scripts/build-static.js` writes
  `data/<slug>.csv` with: id, title, department, team, seniority, locations,
  remote, salary min, max and currency, postedAt, firstSeenAt, url. No
  descriptions. It also adds a `data/README.txt` with attribution and a link
  to the original postings. The server serves `GET /api/export?company=`.
  UX adds a link in the existing data-badge popover.
- **(c) Order:** independent. Add the F4 columns when they exist.
- **(d) UI rule:** zero main-view controls. It's a link inside an existing
  popover.
- **One line:** *the data-source popover gets a "Download CSV" link.*

#### F6. More companies on the current ATSs
- **(a) Owners:** research (confirms slugs, as in DATA_SOURCES.md §6).
  backend/data (registry, caps).
- **(b) Files:** `server/companies.js` registry entries, and per-board
  `maxBytes` where needed. No interface changes.
- **(c) Order:** user decision (§9 D3), then research, then backend. Each
  addition improves F1.
- **(d) UI rule:** zero new controls. More entries in the existing company
  menu. The pills keep showing recent companies only.
- **One line:** *more companies in the company menu.*

#### F8. Juice Score, finishing with guardrails
- **(a) Owners:** livability (score and data). UX (wiring). product (if it
  appears in Insights).
- **(b) Files and interfaces:** as defined by the livability workstream
  (`server/juice.js`, `data/cities.json`, `docs/LIVABILITY.md`). This roadmap
  adds only these requirements:
  - every score carries its inputs (rent, tax and price-index values, with
    their sources and dates) and a `confidence`;
  - no Numbeo data (S67);
  - non-US cities are "low confidence" unless sourced.
- **(c) Order:** independent. F9 depends on it.
- **(d) UI rule:** zero new main-view controls.
  - Add one "Juice" option to the existing Sort select.
  - Show a breakdown (inputs plus an editable rent field) in the drawer.
  - No Juice toggle in the toolbar.
- **One line:** *sort by Juice to see which roles leave the most after rent
  and taxes; the drawer shows how it was worked out.*

#### Next: F10 pay changes, F11 hiring momentum, F9 offer comparator, F12 new ATS adapters
- **F10.**
  - (a) backend/data (ledger pay entries and a parser-version stamp), vetting
    (compare only vetted values), viz (`public/viz/payHistory.js`, a small
    step chart), UX.
  - (b) `payHistory` and `payChange` on Job.
  - (c) after F4 has 30 or more days of data.
  - (d) zero new controls: a "Pay +8%" status tag (the card's one status
    slot), a step chart in the drawer, and a "Recently changed pay" option in
    the existing Sort select.
  - *One line: roles whose range moved get a small up or down tag, and the
    drawer shows the history.*
- **F11.**
  - (a) backend/data (`scripts/build-trends.js` writes
    `api/trends/<slug>.json` with
    `{ weeks:[{weekStart, opened, closed, open}], byDept:[{dept, open, opened30d, closed30d, medianAgeDays}] }`),
    product (`public/features/momentum.js`), viz (sparklines), UX
    (Insights slot).
  - (c) after F4 has 30 or more days.
  - (d) zero new controls: one Insights card.
  - *One line: Insights shows which teams are opening and closing roles
    fastest.*
- **F9.**
  - (a) product (`public/features/offers.js`:
    `compareOffers(offers, { market, juice })`, a local-only modal), UX
    (drawer-footer button).
  - (c) after F1 and F8.
  - (d) zero main-view controls: one "Compare with my offer" button in the
    drawer footer opens a dialog.
  - *One line: from any job, enter up to three offers and see each against
    market comps and cost of living.*
- **F12.**
  - (a) research (verify APIs, CORS and terms), backend/data (adapters).
  - (d) zero new controls. The existing "Add board" source list gets more
    options.

### 7.2 Sequencing at a glance

```
Day 0      lead: CONTRACT.md additions (7.0)
           backend/data: adapters postedAt/reqId + ledger CAPTURE (persisted)  <- start the clock
Week 1     vetting: spread/zones · features: extras + demo postedAt · product: backtest()
           backend/data: annotate() + api/history + market.json + meta.compstimate + CSV
Week 2     product: comps.js · viz: comps chart · UX: drawer sections, Listed filter,
           card age, labels, Save + New, CSV link · livability: Juice guardrails · QA: e2e
Day 30-60  backend/data: payHistory, trends, feeds · viz: pay-history, sparklines
           product: momentum, offers · UX: status tags, Insights cards
```

### 7.3 Plan per owner

| Owner | Now | Next |
|---|---|---|
| **backend/data** | Adapter `postedAt` and `reqId`. `server/history.js` and `scripts/history.js`, with ledger persistence in workflows. `annotate()`. `api/history/*`. `scripts/build-market.js` and `GET /api/market`. Run `backtest` and fill `meta.compstimate`. `data/<slug>.csv` and `/api/export`. `melon-packed-2`. Registry additions (F6) | `payHistory`/`payChange` with a parser-version stamp. `build-trends.js` and `/api/trends`. `build-feeds.js` (Atom). New ATS adapters after research |
| **features** | `extractCompExtras()` lexicon (equity and bonus, DEI-safe). Demo data emits `postedAt`, equity and bonus text, multi-zone pay | Radius helper in `geo.js` (`withinKm(loc, center, km)`) for the "within N km" Location option |
| **vetting** | `salary.spread`, `salary.zones`. Make sure the market aggregate and the backtest read only vetted salaries | Pay-change gate: compare vetted values only, ignore changes under 3% and changes across parser versions |
| **product** | `backtest()` and the accuracy line in the Compstimate widget. `comps.js` (`marketComps`, `compsForJob`, `createCompsCard`). Role-family hand check (100 titles) | `momentum.js` (hiring velocity). `offers.js` (offer comparator) |
| **viz** | `comps.js` range chart (P25–P75 and median per company) | `payHistory.js` step chart. Department sparklines for momentum |
| **UX** | Card age from `ageDays`. "Listed" filter with the 180+ option. Drawer sections: listing info, honest-number labels, "Same role elsewhere". Insights "Compare companies" slot. Conditional "Save" button, saved list in the company menu, "New" tags. CSV link. Juice sort option and drawer breakdown | Status tags (pay change). Sort options. Offer-comparator button. Momentum card slot. Radius option in Location |
| **livability** | Guardrails: inputs and sources on every score, a confidence level, no Numbeo, editable rent | Feed Juice into the offer comparator |

## 8. UI simplicity budget

**On screen today** (from `public/index.html` and `public/app.js`):

| Area | Controls today |
|---|---|
| Top bar | Company menu, recent-company pills, Add board, search box, Chart/Map/Insights switch, data badge, theme, refresh (8 kinds) |
| Quickbar | Filters toggle, 6 chips (Salary, Department, Location, Seniority, Remote, More), area chip (conditional), Clear all (conditional) |
| Viz toolbar | Stats line, Clusters/Ranges switch, Group select |
| Results header | Title, Sort select (Highest pay, Lowest pay, Newest, Title A–Z) |
| Card | Title, pay pill, department dot and name, location, Remote tag, seniority badge, up to 2 keyword tags, age |
| Filter panel | Salary, Department, Location, Seniority, Remote, Responsibilities, Fit, Skills, then Employment type and Updated (both collapsed) |
| Drawer | Prev/next, close, company, title, meta, updated, pay block (percentile, distribution, Compstimate when there's no pay), locations, keywords, bullets, description, Apply, copy link |
| Insights | Compstimate card, Market insights panel |

**What the roadmap may add:**

| Rule | Budget |
|---|---|
| **Main view** (top bar, quickbar, viz toolbar, results header) | **At most 1 new control across all of Now and Next**: the conditional "Save" button (F5). Anything else goes in the drawer, an existing popover, an existing select, or the "More" filters |
| **Top-level modes** | Stay at 3 (Chart, Map, Insights). No new modes |
| **Sort select** | At most 3 new options in total: "Juice" (F8), "Recently changed pay" (F10), and "Newest", which keeps its name but switches to `ageDays` |
| **Cards** | No new rows. The age reuses the existing age slot. **At most 1 status tag** per card, which takes the second keyword-tag slot. Priority: Pay changed > New > Reposted. "Evergreen" shows through the age ("2y+") only, never as a tag |
| **Drawer** | New sections in this fixed order: pay block (with honest-number labels) → Same role elsewhere → Level check (corporate-ladder plan) → Listing → Locations → Keywords → Bullets → Description. If there are more than 3 sections below the pay block, the rest start collapsed. At most 2 labels in the pay block. This budget is shared with the corporate-ladder plan |
| **Insights** | At most 4 cards shown: Compstimate, Market insights, Compare companies, Hiring momentum (Next). Anything more goes under "More insights" |
| **Filters** | New options go inside existing sections ("Listed", "Location → within N km"). No new top-level sections |
| **Colour and motion** | Labels and tags are monochrome (muted text or outlined). No new palette colours. Respect reduced motion |

## 9. Decisions needed from the user

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Where to keep the history ledger** (it blocks F4, and the clock is running) | (a) an orphan `data-history` branch, committed daily: about 0.8 MB of JSON today, small daily diffs; (b) a chain of workflow artifacts with 90-day retention (S72), which breaks if a run is missed for 90 days; (c) release assets | **(a)**. It's durable and auditable, and it keeps `main` history clean |
| D2 | **Keep republishing full job descriptions on Pages?** | Keep as is, or show extracted bullets and keywords plus a "Read on the company's site" link | Weigh the copyright exposure (analysis §4.3). Excerpts plus a link out is lower risk |
| D3 | **Which companies to add next, and whether to stay AI/defence** | A list for the research workstream to confirm | Widen to more AI labs and defence tech first. That keeps the niche and strengthens F1 |
| D4 | **Email alerts** | None (feeds plus local only), a third-party RSS-to-email service, or a small backend | None for now. Revisit after the feeds ship |
| D5 | **Naming: "Compstimate" and the "Zillow of …" tagline** | Keep, or rename after a trademark check | Keep for now. Check before any marketing push |
| D6 | **Juice Score data and scope** | US only with HUD data, or global with lower-confidence sources | US first, with non-US marked "low confidence" |
| D7 | **Factual age and repost labels on named companies** | Show them, or keep them in the drawer only | Show the age on cards and repost details in the drawer, with neutral wording |
| D8 | **Drop commute time and draw-a-boundary for now** | Confirm | Confirm. Add the radius option instead |

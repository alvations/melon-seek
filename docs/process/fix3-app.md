# Process log: fix3-app

The app shell lane of fix wave 3 (2026-10-11). It fixes, for target `beta` and the main site (both builds share
the code), the app-side parts of the beta persona review's findings, under the wave's shared decisions 1, 3, 4
and 5, and the beta landing.

## 1. Brief
- **Prompt:** [prompts/fix3-app.md](prompts/fix3-app.md), saved verbatim.
- **Goal:** BP-1 (display), BP-2 (cards, pay filter, sort, stats), BP-6, BP-9 (display), BP-10, BP-12, BP-13
  (stats side), BP-14 (display), BP-16, BP-17 and the beta landing, from docs/process/lead.md "Beta, stage 1c" and
  the five reviews docs/process/persona-beta-*.md.
- **Files owned:** `public/app.js`, `public/index.html`, `public/styles.css`, and this lane's new tests
  (`test/e2e/fix3-app.e2e.js`, registered in `scripts/e2e.js`, and `test/fix3-app.test.js`). `index.html` needed
  no change.
- **Worktree:** `/home/user/melon-seek/.claude/worktrees/agent-aec391dcdac4454e9`, from `790fa13`.

## 2. Inputs and sources
- `docs/CONTRACT.md` (v2 Juice fields, v4 `kind: 'ote'` and `termWeeks` / `originalInterval: 'term'`, the beta
  channel and `live: false`), `docs/strategy/ROADMAP.md` §8 (UI simplicity budget), `docs/process/PLAYBOOK.md`,
  `docs/process/TEMPLATE.md`.
- `docs/process/lead.md` "Beta, stage 1c" (BP-1 to BP-17) and the five persona reviews, for the repro steps
  (Zurich and Munich lists, the Columbus switch, the Ireland and München searches, the 1.6-day-old drawer).
- Code read before changing it: all of `public/app.js`; `public/features/shared.js` (`payLocations`,
  `countryInSentence`); `public/features/compstimate.js` (its own On-site test); `server/juice.js`
  (`attachJuice`, `matchCity`, where `currencyMismatch` comes from); `server/salary.js` (`payTerms`);
  `server/history.js` (`annotate`: `ageDays` is floored); `public/api.js` (`unpackJobs`, `sanitizeJobId`,
  `getJobDetail`); `scripts/build-static.js` (`listPreloadJs`, how `sections` move to the description files).
- The other wave-3 lanes' prompts (data, compare, viz), so the app reads the fields they add and leaves their
  parts alone: the data lane adds `salary.partTime`, stated hours and `sections.preferred` and retires
  `currencyMismatch`; the compare lane owns the "Pays more than N%" line and "Same role elsewhere"; the viz
  lane owns the chart's median and its location rule.
- A data survey of the 83023f5-era snapshots in this sandbox (19,198 beta postings, unpacked from a build with
  `unpackJobs`), for the counts below.

## 3. Decisions and rationale
1. **BP-1, how the pay was stated decides the label (shared decision 3).** `postedTerm()` (`app.js:163`) treated a
   posting with `termWeeks` and no `originalInterval` as if the yearly figure were the whole term's pay (factor
   1). It now returns `{ amount, per, weeks, weeksMax, fixed, toTerm }`:
   - `isFixedPay()` (`app.js:135`): pay stated per week, per month or for the whole term, or a stipend, is
     fixed-term pay. Only that gets "Fixed-term pay, not a yearly salary (as posted: …)" (`annualNote`,
     `app.js:3721`) and "$3,850 a week · for about 17 weeks".
   - Any other pay with a programme length is a rate: "€47,000 a year" over "EUR · 13-week internship" in the
     drawer, the compact range "€47K" on the card with the tooltip "€47,000 a year (13-week internship)", and
     "$40–55 an hour · 12-week internship · Paid by the hour (as posted: …)" for hourly interns. The programme's
     name comes from the title (`programNoun`, `app.js:175`: internship, fellowship, co-op, residency,
     apprenticeship, else programme). `originalInterval: 'year'`, which the data lane may now set, reads the same
     as no interval.
   - Pay for the whole term (`originalInterval: 'term'`) was shown at its annualized size: the Conceptual Reasoning
     Fellow read "$300,000–501,000 · for about 17 weeks" for a posted $100,000–$167,000. `termFactor()`
     (`app.js:141`) divides by the factor the parser used: a whole number of months (four months is × 3) when the
     length is one, else 52 ÷ weeks. It now reads "$100,000–167,000 for the whole term", and "$100K–167K total" on
     the card.
   - **Juice agrees with the pay block.** The Juice block keeps Monthly and Whole term for every posting with a
     programme length, and says it the same way: "The internship lasts about 13 weeks, so Juice covers only that
     term" for a rate, "This pay lasts about 17 weeks" for fixed-term pay. The whole term divides the yearly figures
     by `toTerm`, the same divisor as the pay block (so the fellowship's whole-term gross is the posted $100,000,
     not 17/52 of $300,000).
   - 27 postings change from fixed-term pay to a yearly rate (Google 23, Microsoft 4) and 38 hourly internships
     lose the fixed-term label (Anduril 19, NVIDIA 14, Shield AI 4, Netflix 1). Monthly (Microsoft 7, Palantir 1)
     and weekly (Anthropic Fellows 3) stay fixed-term pay; the one whole-term posting now shows its posted amount.
2. **BP-2, pay covers its own country (shared decision 1).** One rule, `payHere(job, F)` (`app.js:526`): the
   posting has pay and, under a Location filter, one of `payLocations(job)` (computed once in `prepare`,
   `j._payLocs`) matches a picked place, by `locMatches`, so a country-only "Germany" posting covers Munich as the
   Location filter already does. It is used by:
   - the card (`payPill`, `app.js:3164`): "Pay posted for the US only" (`payPlaceText`: one country, two, or
     "other countries"), muted and outlined (`styles.css` `.sal-pill--elsewhere`, no new colour), with the range
     in the tooltip ("$174K–252K is the pay posted for the US, not for Zurich");
   - the pay filter (`failures`, `app.js:804`) and its note: "12 roles whose pay is posted for another country are
     hidden too: that pay isn't for Munich" (the salary box and the empty state);
   - the pay sort (`sortJobs`, `app.js:932`): such pay sorts like no pay;
   - the stats line (`stats`, `app.js:979`), which already used the rule, and the salary histogram (`salMids`);
   - Juice (`shownJuice`, `app.js:495`): under a filter, only places the pay is for. A Juice figure that
     `attachJuice` computed from another country's pay (`currencyMismatch`, a Polish range applied to Munich "as
     posted") is never shown (`usableJuice`, `app.js:519`), and the "applied as posted" line is gone. The data
     lane retires the fallback in `server/juice.js`; the app drops such entries too, so either order of
     integration is right.
   - **Why there is no Juice.** `juiceMissing()` (`app.js:3598`) puts one line where the Juice section would be:
     "No Juice: there is no rent and living-cost data yet for Poland, where this pay is posted. Pay posted for one
     country isn't used for another." (also "the posting names no city" for a remote-only posting, and the
     part-time case in 4). Under a filter the Juice block names the reason too: "This posting's pay is for the US
     only, so there is no Juice for Zurich. This is Mountain View, the best place its pay covers." (I15's wording
     complaint about "No Juice figure for Zurich" is answered here.)
   - **The place its pay is for, on every card** (`locSummary`, `app.js:3087`): a place the pay is for is listed
     first ("Cambridge, MA +4" for US pay, not "Montreal, QC +4"); under a filter the picked place still comes
     first, and then the card says "Pay posted for … only". The drawer's pay caption adds "This pay is posted for
     the US, not for Zurich." when it applies.
   - 180 paid beta postings list a country their pay doesn't cover (Cohere 55, Google 54, Microsoft 23, NVIDIA 21,
     OpenAI 11, Anthropic 7, Anduril 5, Netflix 2, xAI 2). The chart (viz lane) is not changed here.
3. **BP-6, a Location search for a country or a local name** (`makeChecklist`, `app.js:2045`, and the pure
   `placeMatcher`, `app.js:714`). The search matched only the place's label. For the grouped Location list it now
   also matches:
   - every place in a country whose name starts with the query or has a word that does (Intl's English name:
     "Ireland", "Israel", "Germany", "ire" as it is typed; never inside a word, so "land" finds no Irish city), a
     two-letter code ("US", "DE"), and a short list of names people type that Intl doesn't give (USA, UK, England,
     Holland, Deutschland, Schweiz, Österreich, España, …: `COUNTRY_NAMES`);
   - a city by its local or older name (`PLACE_NAMES`: München, Köln, Wien, Zürich, Genève, Praha, Warszawa,
     Bruxelles, Bengaluru/Bangalore, Tel Aviv-Yafo, …), both ways, with accents folded (`foldText`, `app.js:638`:
     NFD plus ß, ø, æ, œ, ł, đ, which NFD does not split).
   - "Ireland" at Google now lists Dublin 137 (was "No matches"); "Israel" at NVIDIA lists Yokneam 313, Tel Aviv
     234, Ra'anana 103, Beersheba 28 and Haifa District 13 (was Haifa District only).
4. **BP-9, part-time hourly pay (shared decision 4).** Read from `salary.partTime === true` (the data lane adds
   it); stated hours from `salary.hoursPerWeek` (or `weeklyHours`), 1–80. The card shows "$23.00–30.59/hour"
   (`postedPair`: both ends with cents when either has them); the drawer "$23.00–30.59 an hour · USD · part-time,
   paid by the hour" and "If full-time (2,080 hours): $47,840–63,627 a year." (plus "At the posted 20 hours a week:
   about … a year" when the hours are stated); the caption "Posted hourly pay for a part-time role"; the
   approx-dollars line and the distribution's name say "a year if full-time". Juice is not shown unless the
   posting states its hours (`usableJuice`), and the drawer says why: "this part-time posting gives an hourly
   rate but not the hours a week, so a year's take-home pay can't be worked out." 52 Apple postings.
5. **BP-10, carrying filters across boards** (`switchCompany`, `settleKeep`, `placeKeys`, `keyOnBoard`,
   `app.js:1359–1485`).
   - A place is carried by what it is, not by each board's label. `disambiguateLocations` keys Columbus, OH as
     "Columbus, OH" on Apple (which also lists Columbus, GA) and "Columbus" on Google, so the label never matched.
     The switch records each picked key's place (city, region, country; remote and country-only places by name),
     and the next board uses its own key for the same place: the same id, else the same city and country when the
     regions don't disagree (one side may have none: Cheltenham is "" on Apple and "England" on Microsoft). A known
     place never jumps to another place with the same name; a key with no place behind it (an old link) is kept
     where it still matches, as before. In the sandbox's data only one city has regions written differently for
     one place (Cheltenham); the other 13 multi-region cities are different places (Durham NC and NH, …).
   - A dropped value is set aside (`held`), not lost, and put back at the next board that has it; the toast says
     so: "Dropped Munich (not at Microsoft) for now", then "Put back Munich". This covers every carried filter
     (department, place, level, employment type, keywords, Juice grade, role family, Remote, listing date). A
     value set aside is dropped when the person changes that filter themselves (its value differs from when it was
     set aside), or on Clear all, a popover's Reset (for its filters), the logo, a saved search, Add board, and a
     Compare companies pick, which sets its own filters. A switch with no filter on but something set aside still
     settles, so Munich comes back even when it was the only filter.
   - The toast keeps "Kept …" first and "dropped X (not at Y)" (test/e2e/fix-app.e2e.js I-1 reads it), with "for
     now" after.
6. **BP-12, British and American spellings (shared decision 5)** (`queryMatchers`, `app.js:621`; pure
   `spellingVariants`, `app.js:663`). Each search word also matches its other spellings, both ways:
   - word pairs: programme/program, defence/defense, offence, licence, practise, catalogue, dialogue, analogue,
     grey, aluminium, jewellery, mould, ageing, judgement, enrol(ment), fulfil(ment), instalment, skilful,
     paediatric, orthopaedic, anaesthesia, haematology, manoeuvre, speciality, maths, … (plural -s and -es too);
   - -re/-er for a word list (centre, theatre, metre, litre, fibre, …), -our/-or for a stem list with known endings
     (colour, labour, behaviour(al), favourite, neighbourhood, …), -ll-/-l- for a stem list (modelling, travellers,
     counsellor, labelled, …), -ise/-ize with -isation/-ization (words of 6 letters or more), and -yse/-yze.
   - The other spelling matches only as a whole word with the usual endings, never as a word start, so "labour"
     never finds "laboratory", and lists keep real words apart ("honorary", "Colorado", "filing" are untouched).
     The typed word keeps its old prefix behaviour.
   - Google "data centre" 0 → 281 (= "data center"), "programme manager" 0 → 412, "organisation" 0 → 7; Anduril
     "defence" 0 → 1,571; Apple "colour" 0 → 2; Microsoft "centre" 3 → 128.
7. **BP-13, the stats side.** The stats line's median already left out on-target earnings; it now says so:
   "$347K base pay median", with the tooltip "the middle of each posted range, base pay, approx US dollars; 46
   postings with on-target earnings (base plus commission) left out" (`renderKpis`, `app.js:2444`). With only
   on-target earnings it still reads "median on-target earnings". The agreed set with the viz lane: `kind ===
   'ote'` is left out of base-pay medians. At 1440 px "mostly Google" now ends in an ellipsis on Google, the
   stats line's designed overflow (its tooltip keeps the number); on phones the line fits.
8. **BP-14, required and preferred qualifications** (`drawerContent`, `app.js:3756`). When `sections.preferred`
   has bullets, "What they look for" has "Required" (`sections.fit`) and "Nice to have" (`sections.preferred`)
   sub-headings (`styles.css` `.d-bullet-group h5`). Without it, nothing changes. Bullets that arrive with the
   description file (big boards keep their sections there) bring `preferred` along (`fillDescription`).
9. **BP-16, one age rule** (`ago`, `app.js:238`). "Updated" rounded ("2 d ago" for 1.6 days) and the listing age
   floors (`server/history.js#annotate`). `ago()` now floors too and says it in words: "Updated 1 day ago" next to
   "Listed 1 day ago"; "5 minutes ago", "3 hours ago" in the badge popover. The listing age is still the data's
   own (`ageDays`, at the snapshot's fetch time), so a snapshot several days old can still differ from "Updated"
   by its age; recomputing `_age` would change the "Listed" filter counts other tests pin to the API's `ageDays`.
10. **BP-17, the Remote filter.** "On-site" counted every role with an office, so on the big-tech boards, where
    every role has one, it equalled "Any" (Microsoft 2,298 of 2,298). On-site is now a role that isn't open to
    remote work, so Any = Remote + On-site (Microsoft 312 + 1,986, Google 61 + 3,356, NVIDIA 534 + 2,131), in the
    filter, its counts, `settleKeep` and the button's tooltip. The Pay estimate filters On-site the same way only
    with the compstimate patch (§6). The segmented control's buttons have 3 px side padding and may shrink, so four-digit counts no longer run
    past the filter column (they did before, at 1440 px).
11. **Beta landing** (`defaultCompany`, `app.js:4499`). A visit with no link and no last view opens the first Big
    tech board on /beta/ (the company menu's first group, `live: false`: Google today), and the first company on
    the main site, as before. A return visit still reopens the last view, and "Reopened …" compares with this
    default. `config.js`'s early list fetch must open the same company, which is the build-static patch (§6).
12. **No new control.** Everything above is text, a tooltip or a sub-heading in existing places; the card has no
    new row (the pay slot and the location slot carry the place).

## 4. Replayable steps
1. Worktree setup: `ln -s /home/user/melon-seek/node_modules node_modules`; `mkdir -p data/beta && ln -s
   /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots
   data/beta/snapshots`; prompt copied to `docs/process/prompts/fix3-app.md`.
2. Baseline build: `node scripts/build-static.js --out <scratch>/fix3-app/dist-before` (1 min 51 s).
3. Data survey: `<scratch>/fix3-app/scripts/dump.mjs` unpacks every list of a build with `public/api.js#unpackJobs`;
   `survey.mjs`, `survey2.mjs` and `counts.mjs` print the counts in §3.
4. Tests first: `test/e2e/fix3-app.e2e.js` (16 tests) and `test/fix3-app.test.js` (5), run against the baseline
   with `BETA_QA_DIST=<scratch>/fix3-app/dist-before NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js
   --grep="Fix3 app"`: 15 failed, 1 skipped (its fixture board had no inline sections; rewritten to use xAI's
   list and a Google description file).
5. Fixes in `public/app.js` and `public/styles.css`; then `node scripts/build-static.js --out <scratch>/fix3-app/dist`
   and the same e2e run against it: 16 of 16 pass.
6. Patches for files other lanes own, written as `diff -u` from copies in `<scratch>/fix3-app/patchwork`, checked
   with `git apply --check`, and tested applied (then reverted): `node --test test/perf-mobile-beta.test.js
   test/features.test.js test/fix-estimates.test.js test/fix-beta-app.test.js` 140 of 140.
7. `npm test` with `MELON_BETA_SNAPSHOT_DIR` pointing at an empty folder (`<scratch>/fix3-app/run-unit.sh`).
8. `npm run build` (worktree `dist/`, with both patches applied), then the full suite
   `NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js` (`<scratch>/fix3-app/run-e2e.sh`).
9. Screenshots: `PORT=5381 node scripts/cycle/serve.mjs --dist <scratch>/fix3-app/dist-before --pid …` and
   `PORT=5382 … --dist <worktree>/dist`, then `node <scratch>/fix3-app/scripts/shots.mjs before|after <origin>
   docs/screenshots/fix3-app <dist>`; servers stopped with `kill "$(cat <pid file>)"`;
   `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix3-app`.

## 5. Verification
- **Red first.** On the 790fa13 build, `--grep="Fix3 app"`: 15 of 16 failed (the 16th, BP-14, skipped on a board
  whose sections live in description files; rewritten), e.g. `card pay tooltip: expected "€47,000 a year (13-week
  internship)", got "€47,000 for about 13 weeks (fixed-term pay, not a yearly salary)"`, `"Ireland" lists Dublin:`
  (empty), `google: "data centre" and "data center" find the same roles: expected 281, got 0`, `On-site is every
  role that is not remote: expected 1986, got 2298`, `beta opens on the first Big tech board: expected "google",
  got "anthropic"`.
- **Green after.** `test/e2e/fix3-app.e2e.js` 16 of 16 on the final build; `test/fix3-app.test.js` 5 of 5.
- **`npm test`** (`MELON_BETA_SNAPSHOT_DIR` empty, as CI): 770 of 770 with this lane's files alone; 771 of 771
  with both patches applied (the build-static patch adds one test).
- **Full e2e** (`npm run build`, then `node scripts/e2e.js`, both patches applied): 208 of 211 passed, 0 failed, 3
  skipped, twice (the second on the final build). The skips are data-dependent and skip on the baseline too
  (D-11 needs a board without listing dates, the methodology screenshots need `E2E_SHOTS=1`, P-2 needs a role
  with an estimate). No timing test failed, so none needed a re-run. The suite rewrites some committed
  screenshots (`docs/screenshots/*.png`, `qa-mobile*/`); those were restored, not committed.
- **Screenshots**, before (790fa13) and after, in `docs/screenshots/fix3-app/` (shrunk, 13.2 MB → 3.4 MB):
  `01`–`03` landings (beta desktop and phone, main site unchanged); `04` yearly-rate internship; `05` whole-term
  fellowship; `06`, `07` Google under Zurich (desktop, phone list); `08` NVIDIA, Munich, $126K+; `09` a card led by
  its pay's place; `10` no Juice from Polish pay; `11`–`13` Location search (Ireland, München, Israel on the
  phone); `14`, `15` part-time hourly (fixture); `16`–`18` Columbus carried, Munich set aside and put back; `19`
  "data centre"; `20` base pay median; `21` Remote counts; `22` Required / Nice to have (fixture); `23` "Updated 1
  day ago" (fixture); `24-regress-*` desktop 1440×900 and phone 390×844 on both sites (main site and London,
  phone drawer, Dublin drawer, phone Remote filter): no page errors and no horizontal scroll, and the main site
  differs only in "base pay median".
- **Layout check** (`<scratch>/fix3-app/scripts/segfit.mjs`): the Remote control's buttons don't overflow at 1440
  and 1280 px on Microsoft, Apple and Anthropic, or on a 390 px phone.

## 6. Known gaps and follow-ups
- **Patches for the lead** (other lanes own these files):
  - `docs/process/patches/fix3-app-build-first-list.diff`: `scripts/build-static.js#listPreloadJs(slugs, lastKey,
    first = slugs[0])` and `firstCompany(companies, beta)`, so `config.js`'s early list fetch (perf-mobile-beta)
    downloads the board the beta landing opens (Google) instead of Anthropic's list, which would be fetched and
    never used. Signature kept; the third argument is new. Adds a test to `test/perf-mobile-beta.test.js`, which
    also checks app.js's `defaultCompany` uses the same rule. Without it /beta/ still opens on Google, only
    without the early fetch.
  - `docs/process/patches/fix3-app-compstimate-onsite.diff`: `public/features/compstimate.js` `passLoc` filters
    On-site as "not remote", the app's BP-17 meaning, so the Pay estimate follows the same On-site filter.
- **For the data lane:** the app reads `salary.partTime === true` and stated hours from `salary.hoursPerWeek` (or
  `salary.weeklyHours`); with neither, a part-time posting shows no Juice. It reads `sections.preferred` (an array
  of strings) next to `sections.fit`. `originalInterval: 'year'` and a missing `originalInterval` read the same.
- **For the viz lane:** the chart under a Location filter still plots pay posted for another country, and its
  median includes on-target earnings until the viz lane's change lands; the stats line now says "base pay median".
- **For the compare lane:** "Pays more than N% …", the distribution and "Same role elsewhere" still use the
  company-wide pool; the app's pay-block lines around them changed (caption, amount, sub-line), so its app.js
  patch may need its context refreshed.
- Not tested: Insights with a part-time filter; screen readers (the new text is in the cards' and drawer's
  existing names and live regions).

## 7. Change log
- 2026-10-11 04:00 UTC: worktree set up; docs, findings and code read; baseline build and data survey.
- 2026-10-11 04:20 UTC: red tests written and run (15 red, 1 skipped); fixes; 16/16 green; `npm test` 770/770;
  commit `bd9e621`.
- 2026-10-11 04:40 UTC: patches written and tested; full build; full e2e 208/211 (0 failed); before/after
  screenshots; commit `54d5e18`.
- 2026-10-11 05:05 UTC: the yearly-rate note dropped (the amount line already says "a year"); the pay caption says
  when pay is for another country; the Remote control fits four-digit counts; final build, full e2e 208/211 (0
  failed), `npm test` 770/770 (771/771 with the patches); screenshots retaken and shrunk; this log.

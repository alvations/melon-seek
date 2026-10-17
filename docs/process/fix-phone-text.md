# Process log: fix-phone-text

## State

- **Done:** every ID in the brief except M-45: M-33 to M-39, M-41, M-46, UX-35, UX-53 to UX-55, UX-58, UX-60 to UX-62
  and A-9. Also the lead's desktop tagline item (from fix-phone-sizes).
  - `test/e2e/fix-phone-text.e2e.js`, registered in `scripts/e2e.js`, has 100 tests:
    - one per ID, plus the tagline;
    - the guard on 7 boards at 390x844 and 360x740, in light and dark;
    - the desktop guard at 1024, 1280 and 1440;
    - every other size in phone-sizes.mjs (Amazon and Google).
  - The file runs with `--browser=webkit`, and webkit-phone.yml has a step for it right after "Company sheet
    geometry on WebKit".
  - The screenshots are in docs/screenshots/fix-phone-text/: 148 files, shrunk.
  - The gate is clean (section 5):
    - this file 100/100;
    - `npm test` without data: only the load-sensitive S-6 fails, and it passes 3/3 alone;
    - the full e2e has no new failures.
- **Dropped:** M-45, which moved to the fix-phone-sizes lane (lead, 2026-10-16). The guard allow-lists it.
- **In progress:** nothing.
- **Next step:** the lead integrates the gated SHA. The viz fix lane takes the four chart items in section 6.

## 1. Brief

Prompt: [prompts/fix-phone-text.md](prompts/fix-phone-text.md), saved word for word. The lead sent two updates
later (2026-10-16):
1. Run the guard on every size in `test/e2e/phone-sizes.mjs`. The user: "Make sure we check for all phone sizes
   from iPhone mini to razr to duo or something".
2. M-45 now belongs to fix-phone-sizes.

The user, 2026-10-16: "The mobile page on the beta site is totally broken". The lead could not reproduce a page
that fails to load. What the round-3 reviewers found on phones is text that wraps to 3–5 lines, text cut mid-word,
and numbers ellipsized. This lane fixes the text. The rule (fix-density's, now enforced):
- every caption, note or explainer is one line, and its other facts are behind its Details;
- nothing is cut, except a long proper name in a list row whose tap and keyboard give the whole name;
- a number is never cut;
- no fact is removed;
- pay stays as posted.

**Files owned:**
- the caption, note and explainer text in `public/app.js`, with its CSS;
- `public/features/compstimate.js` and `public/features/insights.js`;
- `public/viz/note.js` (the Details disclosure; the prompt says `features/note.js`, which does not exist);
- `public/viz/comps.js` (`NOTE_BASE` and `NOTE_OTE` only);
- one rule block each at the end of `public/styles.css`, `public/features/features.css` and `public/viz/viz.css`
  (A-9 and the note line). These are separate blocks, so cherry-picks don't collide;
- the new test file, its line in `scripts/e2e.js`, the WebKit step, this log and the prompt.

**Also touched**, text only:
- `public/features/comps.js` `compsNote`: curly apostrophes and "US dollars" (UX-61). Its sentence is now the
  first fact in the Details of "Same role elsewhere".
- `public/viz/chart.js:882`: "no published salary" → "no pay listed" (UX-61).
- Tests that pinned the old text (section 5).

**Not touched:**
- the tooltips (fix-touch-tips);
- `payPill`, the drawer's pay headline and Pay by place (fix-pay-at-place);
- the preview, the filter controls, focus and the keyboard (fix-phone-controls);
- the chart and map drawing (viz);
- the top bar's layout (fix-phone-sizes).

## 2. Inputs and sources

- docs/CONTRACT.md; ROADMAP §8, which allows no new visible control and requires the Compstimate accuracy line
  on the card (§6.2 Top 2, item 5); PLAYBOOK "Checkpoints" and "Known traps"; TEMPLATE.md; ux.md; fix-density.md
  (the rule and `viz/note.js`).
- Findings:
  - docs/process/qa-mobile-beta-3.md (M-33 to M-47) and its tests, test/e2e/beta-mobile-qa-3.e2e.js;
  - the ux-review-beta-2 worktree (docs/process/ux-review-beta-2.md, UX-35 to UX-62, and test/e2e/beta-ux-review-2.e2e.js);
  - docs/REVIEW.md A-9.
- The size matrix: test/e2e/phone-sizes.mjs (a92a3c8, 19 sizes: the folded Fold at 280x653 to the Surface Duo
  spanned at 1114x720, the Razr cover at 352x355, and landscape).
- Data: today's crawl (`wt-data2`), linked as data/snapshots and data/beta/snapshots and never committed. Amazon
  has 22,179 postings, Apple 4,851, Google 3,821, NVIDIA 2,711, Microsoft 2,435, Meta 1,208 and Netflix 414.

## 3. Decisions and rationale

1. **One pattern.** Every line that broke the rule now uses `viz/note.js`: one visible line plus a Details list.
   No new kind of control. Where a disclosure already existed (the Juice fold), the extra facts moved into it.
2. **What stays on each line** (it is under 50 characters and fits at 360 px):

   | Where | Line now | Behind its Details |
   |---|---|---|
   | Same role elsewhere | "Senior level in the US" / "Every full-time level in the US" / "Internships and fixed-term roles in the US" / "Nothing to compare yet in Ireland" | compsNote's sentence, MR-18's level caveat, "Posted base pay a year, in US dollars (converted at approximate rates)", the as-of line, How pay is read |
   | …its chart note (NOTE_BASE) | "Bar: middle half of base pay · Tick: median" | (the pay basis is in the section's Details) |
   | Pay estimate card | "Based on 500 similar roles" [Details], then "Typically within ±13%" | the full basis, the accuracy test ("tested on 499 posted pay ranges, Oct 2026"), the weighting, the 15% trim, the conversions, the dates |
   | …its auto line | "Most common role · type any title" | which role, and that any title works |
   | Juice explainer above the list | "🍉 Juice: what’s left after tax and rent" | the definition, for whom, and the dollar scale |
   | Filter sheet: pay | "Matches roles whose range overlaps yours" | other currencies, the comparison in US dollars, unclear pay left out |
   | …seniority / location / Google | "What the levels mean" / "Also finds roles listed for its country" / "Grouped by job title" | the three level meanings / the full rule / why |
   | …the pay filter's hidden roles | "8,200 roles hidden by the pay filter" | the two reasons |
   | Job page Juice headline | "$198,500/yr left for one person in Cupertino" | "Cupertino uses San Jose’s rent and living costs, the nearest city with cost data" is the fold's first line (MR-12 keeps the job's own place in the headline) |
   | No Juice | "🍉 No Juice: no cost data here yet" (or "the posting names no city", "no hours a week posted") | the full reason |
   | Listing | "Open 180+ days", "Always-open posting, listed 3 years ago", "Open at least 2 years" | why, and the date |
   | General application | "General application (no specific opening)" | what it means |
   | Percentile | "Pays more than 72% of Amazon’s roles in the US" (fitted, decision 4) | what it ranks among |
   | Strip caption | "This one among 39 roles at NVIDIA" | "roles with on-target earnings" (the title, and the pay block's Details) |
   | Badge popover | "A saved snapshot, not a live read" / "Saved snapshot: the live fetch failed" (and the error, still shown) | the whole sentence, when it was fetched, the cadence and How we collect this, Apple's count note, what the beta adds |
   | …its rows | Fetched "Oct 16, 2026, 07:59 UTC", Updates "About every 6 hours", Roles "4,851" | (as above) |
   | …CSV | "Download a spreadsheet (CSV)" | what the file holds |
   | …beta | "This is the beta site. Go to the main site" | (what the beta adds is in the popover's Details) |
   | More sheet | "9,819 of 22,179 have a Juice Score" | what a score needs |
   | Stats line, phone, no pay in view | "No pay listed" (or "Too few with pay for a median") | (unchanged) |

3. **The accuracy line stays on the card.** ROADMAP §6.2 Top 2 asks the Compstimate card to show its accuracy. The
   card keeps "Typically within ±13%", one line, and the test it comes from is in the Details. At low confidence
   it reads "Treat this as a rough guide", and the reason is in the Details.
4. **Longer words where they fit: `fitLine(el, variants)`** (viz/note.js, shared by app.js and compstimate.js).
   - It shows the first variant that fits one line, measured to the sub-pixel: a second line box, or text past
     its box. If none fits, it shows the last one wrapping, never cut. A ResizeObserver re-fits it when its line's
     width changes. Every variant says the same thing; a shorter one leaves a fact to its Details.
   - **Percentile:** "Pays more than 72% of Amazon’s roles in the US", or "…of Amazon’s roles" where that doesn't
     fit. BP-3 put the country in the line, and pctNote has it.
   - **Same role elsewhere:** "Hardware & systems engineering, Director+ level in the US" on a desktop, "Director+
     level in the US" on a phone.
   - **Pay estimate basis:** "Based on 38 similar roles at Anthropic, Sales" where it fits, "Based on 38 similar
     roles" on a phone.
   - **Accuracy:** "Typically within ±13% (tested on 499 posted pay ranges, Oct 2026)", as ROADMAP §6.2 asks, or
     "Typically within ±13%" on a phone.
   - **Tagline** (`fitTagline`, app.js), the lead's item from fix-phone-sizes. At 1280x800 the desktop line was
     cut ("…", 295 px of text in 273 px), and it was cut at 861 and 1200 px too. It now shows its longest line that
     fits: "Beta: adds 7 big-tech companies’ own careers sites", "Beta: adds 7 big-tech careers sites" or "Beta:
     7 big-tech sites". On a phone the short line, else the shortest. The full line stays its title.
5. **A note's line wraps, never "…".** Before, `.ms-note__line` was `nowrap` with an ellipsis, so a line that was too
   long was cut silently. It now wraps: the tests fail on a second line at 360 px and up, and nothing is hidden on
   a 280 px Fold.
6. **Narrow screens: the rule.** The one-line rule holds from 360 px up, which covers every phone in common use,
   the iPhone mini included. Under 360 px (Fold 280, SE 320, Fold cover 344, Razr cover 352) a caption may take
   two lines, but nothing is cut at any width. The lead approved this on 2026-10-16. The tagline gets a shorter line under 360 px ("melon·seek · Beta:
   7 big-tech sites").
7. **Insights.**
   - Row names, the comparables' titles and their meta lines wrap instead of being cut, so the end that tells two
     long names apart stays visible (M-41).
   - The tiles say "of 2,781 with pay" (UX-53, UX-61).
   - The middle half reads "$188K–252K", like the cards, and the tile's number shrinks rather than being cut
     (container units, UX-55).
8. **Words (UX-61).** One currency name: "US dollars".
   - "Download a spreadsheet (CSV)", "Includes top shift pay", "Estimated base pay".
   - "posted pay ranges" for "listed salaries", "with pay" for "salaried".
   - "sometimes a few hours late" for the GitHub line, and curly apostrophes in the Same role notes.
   - Chart rows say "no pay listed".
9. **A-9.**
   - Every Details is described (`aria-describedby`) by its line, and on Insights by its card's heading too
     (`about`).
   - The arrow is `content: " ▾" / ""`, so the button's name is "Details".
   - On a desktop the button is 24 px tall, with -4 px margins, so the line keeps its height.
10. **CSS goes in one block per file**, at the end and marked "fix-phone-text", as the lead asked. Two exceptions
    are edits in place: the note arrow's `content` in viz.css, and the UX-21 hint function in app.js.

## 4. Replayable steps

`<S>` = `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fpt`.

1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (5a847e4).
   Later, rebase onto a92a3c8. Link data/snapshots, data/beta/snapshots and node_modules.
2. `node scripts/build-static.js` → dist/ (about 4 min, 410 MB). `cp -al dist <S>/dist-before` keeps the base build.
   The app's JS and CSS are copied into dist/ verbatim, so `bash <S>/sync.sh` copies the changed public files into
   dist/ and dist/beta/ with `cp --remove-destination`, which leaves the before build untouched.
3. Tests: `bash <S>/run.sh <before|after> <log> [--grep=…]` runs `node test/e2e/fix-phone-text.e2e.js` with
   NODE_PATH, the browsers path and `FIX_PHONE_TEXT_DIST` = dist-before or dist.
   - The phone grid: `--grep='\[guard\]'`. Desktop: `'\[guard, desktop\]'`. Every size in phone-sizes.mjs:
     `'\[guard, size\]'`, with `FIX_PHONE_TEXT_ALL=1` for all 7 boards. The findings: `'\[(M|UX|A)-'`.
   - On WebKit: `node test/e2e/fix-phone-text.e2e.js --browser=webkit` (the new step in webkit-phone.yml).
   - The reviewer's group: `node <S>/run-group.mjs <ux-review-beta-2 worktree>/test/e2e/beta-ux-review-2.e2e.js
     registerBetaUxReview2Tests`.
   - The full suite: `bash <S>/full.sh after <log> '^(?!Fix phone text)'`, which runs scripts/e2e.js with
     BETA_QA_DIST, BETA_QA2_DIST and BETA_QA3_DIST set to the build.
4. Screenshots: `node <S>/shots.mjs <before|after> <origin> docs/screenshots/fix-phone-text`, against
   `scripts/cycle/serve.mjs --dist <dir> --pid <S>/<phase>.pid`. `node <S>/shot-tagline.mjs` takes the desktop
   tagline at 1280x800. Then `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-phone-text`: 148 files,
   29.7 MB → 8.2 MB.
   - Names: `<before|after>-<ID>-<phone|desktop>-<light|dark>.png`. The phone is 390x844, or 360x740 for M-36,
     UX-53 and UX-54, where those bugs show.
   - Both phases use the same posting per ID, chosen from the build's lists.
5. The lead's phone smoke, before and after: `bash <S>/smoke.sh <before|after>`
   (`test/e2e/webkit/phone-smoke.mjs --sizes all --engines chromium`).

## 5. Verification

### Per finding, before → after

Before is the base build (5a847e4, `dist-before`). After is this lane. Both use today's crawl. The phone widths
are 390x844 and 360x740 unless a row says otherwise. Lines are counted from the text's line boxes. Widths are
the text width over its box, measured to the sub-pixel.

| ID | Before (measured) | After (measured) |
|---|---|---|
| M-33 Same role elsewhere | 4 captions. `comps-note` 3 lines / 20 words (Amazon), 4 lines / 33 (NVIDIA 360). `comps-caveat` 2 lines / 21. `ms-comps__note` 2 lines / 18. `comps-asof` 2 lines. 30 over budget in the test | 2 lines in all. "Director+ level in the US" [Details]: 1 line, 142 px in 336 at 360. "Bar: middle half of base pay · Tick: median": 1 line, 241 px in 336 |
| M-34 Pay estimate card | `__explain` 5 lines / 30 words, `__auto` 2–3 lines / 14, `__accuracy` 2 lines, `__asof` 2 lines, comparables' meta cut by 19–72 px. 16 over budget | "Most common role · type any title" [Details] (188 px in 276). "Based on 500 similar roles" [Details] (157 in 246; the full basis where it fits). "Typically within ±10%" (126 in 246; the full test line on a desktop). Comparables wrap, nothing cut |
| M-35 / UX-35 Juice explainer | 3 lines / 30 words at 390, 360 and 1440 | "🍉 Juice: what’s left after tax and rent" [Details]: 1 line, 222 px in 336; the scale is in the Details |
| M-36 / UX-60 filter notes | pay 3–4 lines / 23–30 words, seniority 3 / 23, location 2 / 18, Google's "Grouped by job title…" 2 at 360. 13 over budget | 1 line each: "Matches roles whose range overlaps yours", "What the levels mean", "Also finds roles listed for its country", "Grouped by job title", each [Details] |
| M-37 drawer lines | Juice headline 3 lines / 20–21 words. No Juice 2 lines / 13. "Open 180+ days…" 2–3 / 16. "Always-open posting: listed 3 years ago (Oct 27, 2022)" 2. General application 3 / 22. 20 over budget | "$198,500/yr left for one person in Cupertino" (1 line, 274 px; the San Jose stand-in is the fold's first line). "🍉 No Juice: no cost data here yet". "Open 180+ days". "Always open: listed 3 years ago". "General application (no specific opening)". Each 1 line [Details] |
| M-38 percentile and strip | "Pays more than 25% of Amazon’s roles in the US" cut by 5 px at 360. Google's internships in Canada cut by 14 px at 390. Microsoft Czechia cut by 23. NVIDIA strip caption 2 lines | Never cut: the country stays where it fits (277 px in 302 at 360 on Amazon) and moves to Details where it doesn't. "This one among 39 roles at NVIDIA", 1 line |
| M-39 badge and More | tip 3 lines / 23 words. Updates 3 / 19. Roles 4 / 30. CSV 3 / 13. Beta note 2 / 17. More note 2 / 15. Main site with a failed fetch: 6 lines. 30 over budget | "A saved snapshot, not a live read" [Details]. Rows 1 line each ("About every 6 hours", "4,851"). "Download a spreadsheet (CSV)" [Details]. "This is the beta site. Go to the main site". "9,819 of 22,179 have a Juice Score" [Details]. A failed fetch: "Saved snapshot: the live fetch failed", with its error still shown |
| M-41 Insights row names | 36 cut at 390/360 ("Machine learning" by 27 px, "Networking" 4.7, "Cloud infrastructure" 54, "Mountain View", "San Francisco") | Names wrap, nothing cut. "…--Technical" and "…--Non-Tech" both show their end |
| M-45 | "Microsoft" 74.41 px in 74.20 (390) and 64.20 (380) | **Dropped**: the fix-phone-sizes lane's (allow-listed) |
| M-46 stats line | a lone "Details" (Google, Buenos Aires, 12 roles, none with pay) | "No pay listed" [Details], 80 px in 366 |
| UX-53 tile notes | "of 2,781 salaried roles" cut by 3 px at 360 (Amazon by 11) | "of 13,980 with pay", 108 px in 125 at 360 |
| UX-54 placeholder | "Search roles" needs 94.6 px, gets 93.0 at 360 | "Search roles", then "Search", then none: whole from 320 to 430 px. The Razr cover's 352x355 box had kept the 209 px-wide long hint |
| UX-55 middle half | "$188K–$252K" cut by 4.4 px at 1440 | "$188K–252K", 114 px in 135 at 1440 (the tile's number shrinks rather than being cut) |
| UX-58 No Juice box | text 1 px from the box's left edge and top | 14 px and 10 px (the padding kept) |
| UX-61 words | GitHub, "Download CSV", "Incl.", "Estimated base salary", "salaried", "listed salaries", "approx USD", "US$" (Insights), "no published salary", straight apostrophes in the Same role notes | all replaced (test `[UX-61]`). The chart's axis caption "US$ a year" is the viz lane's chart drawing, not changed |
| UX-62 key cap | "/" at 11 px | 12 px |
| A-9 Details | 44 problems: no description, " ▾" in the name, 16.8–19.6 px on a desktop | Described by their line (and their card heading), the arrow has empty alt text, 24 px on a desktop (reviewer's own `[A-9] beta a11y 2` passes) |
| Tagline (lead, from fix-phone-sizes) | cut at 280 (45 px), 320 (5), 861 (130), 1200 (103) and 1280 (23 px: 295 in 273) | the longest line that fits, at every width from 280 to 1920 |

### The guard

On every big-tech board, per board and size. Problem counts are the guard's own: lines over budget and cut text.

| Board | 390 light / dark before | 360 light / dark before | Phone after (4 runs) | Desktop 1024 / 1280 / 1440 before → after |
|---|---|---|---|---|
| amazon | 44 / 44 | 49 / 49 | 0 | 26 / 26 / 23 → 0 |
| apple | 40 / 40 | 46 / 46 | 0 | 24 / 24 / 21 → 0 |
| google | 39 / 39 | 46 / 46 | 0 | (not run before) → 0 |
| meta | 31 / 31 | 36 / 36 | 0 | → 0 |
| microsoft | 41 / 41 | 46 / 46 | 0 | → 0 |
| netflix | 44 / 44 | 50 / 50 | 0 | → 0 |
| nvidia | 50 / 50 | 61 / 61 | 0 | → 0 |

The size matrix covers every other entry of phone-sizes.mjs (17 sizes), on Amazon and Google. After: 34 of 34 pass
(see "Runs"). That includes:
- the Fold folded at 280x653, the first SE at 320x568, the Fold cover at 344x882 and the Razr cover at 352x355, each
  at two lines at most;
- 375x812, 375x667, 393x852, 412x915, 412x1005, 430x932, 540x720 and 690x829, at one line;
- the Duo spanned at 1114x720;
- landscape at 812x375, 667x375 and 1005x412.

**The allow-list** (`ALLOW` and `ALLOW_LINES` in the test file, each with its reason):
- the cards' department and place names, and chart row names (list rows; a tap or Enter gives the whole name);
- the company menu's names, and "Same role elsewhere" company names;
- M-40's filter labels (fix-phone-controls) and M-45's top-bar name (fix-phone-sizes);
- the viz lane's three, as the lead decided: the Ranges legend keys, cut at 220 px; `.ms-crow__fold` at 280 px; the
  map's "Median pay" legend, 3 lines at 280 px. Also the Ranges axis caption "Yearly pay, US$ (converted)", cut at
  540 px (the Duo, one screen).

An amount is never allowed, even in an allowed row.

### The lead's phone smoke

`node test/e2e/webkit/phone-smoke.mjs --dist <dir> --sizes all --engines chromium`, 19 sizes × 5 boards:
- before: 30 pages list cut text, and 5 FAIL pages (the Razr cover, 352x355);
- after: 28 pages, and the same 5 FAIL pages.

The smoke reads the first screen only. What it lists as cut is the chart's row names (allowed list rows, and the
viz lane's), the company name in the top bar (M-45, fix-phone-sizes) and the Razr cover's layout
(fix-phone-sizes). Nothing in that list is this lane's text.

### Runs

- **`test/e2e/fix-phone-text.e2e.js`** has 100 tests: 28 phone guards, 21 desktop guards, 34 size guards, 16 ID
  tests and the tagline test.
  - **Before** (the base build): all 45 then in the file fail, the 28 guards and 17 ID tests (`<S>/before-all.log`).
    The desktop guard and the tagline test were added later; on the base build they fail too
    (`before-desk-1.log`: 6 of 6; `before-tag.log`: cut at 5 widths).
  - **After**: **100 of 100 pass** on the final code. The first 59 ran in `final-mine.log`; a container restart
    at 02:10 UTC stopped that run, so the other 41 ran again in `final-mine-2.log`.
- **`^Beta mobile QA 3`** (qa-mobile-beta-3): my IDs pass after (M-33 to M-39, M-41 and M-46). M-40 and M-42 to M-47
  fail by design until their lanes land. M-45 is now fix-phone-sizes'.
- **`beta-ux-review-2.e2e.js`**, run from the reviewer's worktree against this build: **0/16 before, 10/16 after**.
  - Every one of mine passes: UX-35, UX-44 (= M-46), UX-46 (= M-38), UX-47/48, UX-49/53, UX-54, UX-55, UX-58,
    UX-60 and UX-62.
  - The 6 that fail belong to other lanes: UX-37 (pay at place), UX-38 (M-40), UX-39 (preview), UX-42 (circles),
    UX-45 (the map legend's Juice cut-offs) and UX-56 (focus).
- **`[A-9] beta a11y 2`** (the security and accessibility reviewer's test) passes.
- **Tests that pinned the old text**, updated with their intent kept (each reads the fact where it is now, usually
  the closed Details' textContent):
  - unit tests: features.test.js (accuracy line, "roles with pay"), fix-estimates.test.js ("Estimated base pay", curly
    apostrophe), fix3-compare.test.js (compsNote's apostrophes and "in US dollars");
  - e2e tests: ui.e2e.js (the CSV link's name, "US dollars"), fix-app.e2e.js (the Juice scale, the no-pay note),
    fix3-app.e2e.js (the no-pay note), fix-beta-app.e2e.js (the general-application line), desktop-qa.e2e.js D-5
    (the weighting sentence), fix-estimates.e2e.js P-11 (the family), beta-mobile-qa.e2e.js (crawler-only),
    fix3-compare.e2e.js (the note's sentence, apostrophes).
- **`MELON_BETA_SNAPSHOT_DIR= npm test`**, with the data links out of data/ (CI's way): 1,180 tests, 1,115 pass,
  1 fails, 56 to-do, 8 skipped. The failure is S-6, the load-sensitive server timing check (the load average was
  10 to 21). Alone it passes 3 of 3. S-3 alone: 6/6. PERF-1 and V15 alone, with data linked: V15 passes; PERF-1
  failed once at load 15 and passed when re-run (88 ms lag).
- **Full e2e** (`node scripts/e2e.js`, data linked, the other groups; this file ran on its own above): **381/395 pass, 10 fail, 4 skip.** None of the 10 is this lane's,
  and none is new:
  - qa-mobile-beta-3's red tests for other lanes: M-40, M-42, M-43, M-44, M-45 and M-47;
  - beta-a11y-2's red tests: A-8, A-10 and A-11;
  - `Fix app: [P-5]`, which pins the old pound rate (section 6).

  The first full run (`full-after.log`, before the last fixes) found the tests that pinned the old text, and the
  Compstimate tests that read the basis and the accuracy line. They are fixed above, and they pass in this run.
  The runner then restores the screenshots the suite rewrote (`git checkout -- docs/screenshots`), which leaves
  this lane's untracked folder alone.

## 6. Known gaps and follow-ups

- **Found by the guard in other lanes' code**, allow-listed with the lane as the reason. The lead sent the chart
  items to the viz fix lane:
  - the Ranges colour legend caps each key at 220 px (viz.css `.ms-legend__item`), which cuts "Operations, IT, &
    Support Engineering";
  - the chart row's fold arrow (`.ms-crow__fold`) is cut at 280 px;
  - the map's "Median pay" legend takes 3 lines at 280 px;
  - the Ranges axis caption "Yearly pay, US$ (converted)" is cut at 540 px. "US$" is UX-61's wording too, so the viz
    lane can change both at once;
  - M-40's filter labels (fix-phone-controls);
  - M-45's company name (fix-phone-sizes).
- **WebKit** is not installed here. The new step in webkit-phone.yml runs the file on WebKit, whose text metrics
  differ slightly from Chromium's: a line that fits by a pixel or two here could wrap there. The step does not fail
  the job (continue-on-error), and its log goes into the Summary and the artifact.
- **The pinned string tests:**
  - **`Fix app: [P-5]`** fails before and after. It pins "£80,000 ≈ $108K", but palette.js now converts £80,000 to
    $107,334. That is a file this lane didn't touch; the test needs the new rate.
  - **UX-45** (the map legend's Juice cut-offs against the list's scale) is not this lane's: it is the map
    legend's numbers.
- **The size matrix** runs on Amazon and Google only by default, to keep the file near 45 minutes. With
  `FIX_PHONE_TEXT_ALL=1` it covers all 7 boards (about 70 more minutes).
- **On a phone, `fitLine` picks the shorter line.** The Pay estimate's basis then drops its company and filters
  ("Based on 38 similar roles"), and the full basis is the first fact in its Details. A person who changes filters
  sees the count change, and the Details says which filters.

## 7. Change log

- 2026-10-16 23:30: started; base build and the before copy.
- 2026-10-16 23:37: test file and guard; before run: 45 of 45 fail.
- 2026-10-17 00:00: rebased onto a92a3c8 (the size matrix). M-45 dropped. Fixes for all IDs. The guard covers every
  phone size.
- 2026-10-17 00:40: the lead approved the two-line allowance under 360 px and the viz-lane allow-list.
- 2026-10-17 01:00: the desktop tagline (fix-phone-sizes' report at 1280x800), fitTagline, and the desktop guard at
  1024, 1280 and 1440.
- 2026-10-17 01:20: `fitLine` moved to viz/note.js. The full words stay where they fit: the Same role family, the
  estimate's basis and the accuracy test (ROADMAP §6.2).
- 2026-10-17 01:45: the full e2e. Updated the tests that pinned the old text. `fitLine` now replaces text only
  while trying a variant (T19 counts DOM changes as renders).
- 2026-10-17 02:10: a container restart stopped the final runs. Re-ran the rest of the file (41/41), npm test and
  the full e2e.

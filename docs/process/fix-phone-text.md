# Process log: fix-phone-text

## State

- **Done:** the fixes for M-33 to M-39, M-41, M-46, UX-35, UX-53 to UX-55, UX-58, UX-60 to UX-62 and A-9. The new
  test file `test/e2e/fix-phone-text.e2e.js` has one test per ID, the density guard and the size matrix. The
  WebKit step is in `.github/workflows/webkit-phone.yml`. The tests that pinned the old text are updated.
- **Dropped:** M-45, which moved to the fix-phone-sizes lane (lead, 2026-10-16). The guard allow-lists it.
- **In progress:** the verification runs (section 5), the screenshots, and this log's numbers.
- **Next step:** finish section 5, then send the SHAs to the lead.

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
4. **The percentile line keeps its country where it fits** (BP-3 put it there). `fitOneLine(el, variants)` (app.js)
   shows the first variant that fits one line, measured to the sub-pixel. Otherwise it shows the shorter one
   ("Pays more than 72% of Amazon’s roles"; the country is in pctNote). If even that doesn't fit, it wraps and is
   never cut. A ResizeObserver re-fits the line when its width changes.
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
4. Screenshots: `node <S>/shots.mjs <before|after> <origin> docs/screenshots/fix-phone-text`, against
   `scripts/cycle/serve.mjs --dist <dir> --pid <S>/<phase>.pid`. Then
   `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-phone-text`.

## 5. Verification

(in progress)

## 6. Known gaps and follow-ups

- Found by the guard in other lanes' code, allow-listed and reported to the lead:
  - the Ranges colour legend caps each key at 220 px (viz.css `.ms-legend__item`), which cuts "Operations, IT, &
    Support Engineering";
  - M-40's filter labels (fix-phone-controls);
  - M-45's company name (fix-phone-sizes).
- WebKit is not installed here. The new step in webkit-phone.yml runs the file on WebKit, whose text metrics differ
  slightly from Chromium's.

## 7. Change log

- 2026-10-16 23:30: started; base build and the before copy.
- 2026-10-16 23:37: test file and guard; before run: 45 of 45 fail.
- 2026-10-17 00:00: rebased onto a92a3c8 (the size matrix). M-45 dropped. Fixes for all IDs. The guard covers every
  phone size.

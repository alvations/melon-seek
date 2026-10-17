# Process log: fix-touch-tips

## State

- **Done (2026-10-17, head fc67365 on a7c4198):**
  - one touch rule for every floating box, in one shared helper (`public/features/shared.js`, "Floating tips and touch");
  - applied to the drawer's "Same role elsewhere" tip (the user's report), the chart's circle, Ranges and pay-strip tips, the Insights and Compare companies tips (`createTooltip`, same API plus an optional `{ action }`), and the map's pin tooltips;
  - the lead's ux-review-beta-2 items 1 to 7 and qa-mobile-beta-3 items 1 to 3 are fixed;
  - `test/e2e/fix-touch-tips.e2e.js` has 33 tests: 14 behaviour tests and one tip test for each of the 19 sizes in `test/e2e/phone-sizes.mjs`. On Chromium, 13 of the 14 behaviour tests fail before and all 33 pass after. The file also runs alone on WebKit, with a step in `.github/workflows/webkit-phone.yml`;
  - `test/fix-touch-tips.test.js` (7 unit tests) passes;
  - screenshots before and after, light and dark, at 390 and 360 px, are in `docs/screenshots/fix-touch-tips/`.
- **In progress:** none.
- **Next:**
  - the lead dispatches webkit-phone.yml (WebKit, plus the iOS Simulator job) and reads the "Floating tips on touch on WebKit" summary;
  - the remaining title-only texts in section 6 go to the fix wave if they are wanted on touch.

## 1. Brief

Prompt: [prompts/fix-touch-tips.md](prompts/fix-touch-tips.md), verbatim, with the lead's three mid-task messages that changed the scope.

The user, on an iPhone (2026-10-16): "There seems to be a UI/UX bug where the floating box don't go away on a mobile."
A tap on "Same role elsewhere" left "$281K median … Click to see these roles" on screen. The job was to find every floating box, reproduce each one with real touch input, fix them all with one rule, keep desktop as it was, and take screenshots.

Files owned:
- the tip open, close and position code in `public/viz/comps.js`, `public/viz/chart.js`, `public/viz/map.js`, `public/features/shared.js` (`createTooltip` and the new helper), `public/features/comps.js` and `public/features/insights.js` (no change was needed there);
- `public/app.js` (tip handling and the words the lead listed);
- `public/styles.css` (two tip rules);
- `test/e2e/fix-touch-tips.e2e.js`, `test/fix-touch-tips.test.js`, the registration in `scripts/e2e.js`, and one step in `.github/workflows/webkit-phone.yml` (the lead allowed it);
- this log and the prompt.

## 2. Inputs and sources

- `docs/CONTRACT.md`: chart, map and comps interfaces (hover tooltip, click selects). None changed.
- `docs/strategy/ROADMAP.md` §8: no new visible control. The fix adds none. It adds a line inside existing tips, one muted line under the Juice household buttons, and items inside existing "Details" lists.
- `docs/process/PLAYBOOK.md`: checkpoints, known traps (headless Chromium vs a phone; `pkill -f`; timeouts on every command), the Stage 3 gate.
- `docs/process/ux.md`: the components and tokens; D-8 in `docs/QA.md` (Esc in "Same role elsewhere").
- The user's screenshot, and the reviewers' screenshots: `ux-review-beta-2/touch-*.png` and `qa-mobile-beta-3/` with its probes.
- Leaflet 1.9.4 source (`node_modules/leaflet/dist/leaflet-src.js`): `Layer.openTooltip`, `_openTooltip`, `_addFocusListenersOnLayer`, `Tooltip._setPosition`. Every way Leaflet opens a tooltip (mouseover, click, focus) goes through the marker's `openTooltip`. The fade-out keeps a closing tooltip in the DOM for 200 ms.
- No skills loaded; no external code.

## 3. Decisions and rationale

1. **The touch rule.** The lead's two suggestions combined, so that every box follows one rule:
   - **A hover tip needs a real mouse.** A touch never opens one. Neither do the mouse and pointer events a phone emulates within `TOUCH_GRACE_MS` (1 s) of a touch: iOS sends them after a tap, Chromium marks its own with `sourceCapabilities.firesTouchEvents`.
   - **A tap does what a click does, at once, with no tip.** This covers chart circles, row names and Ranges rows, the Insights filter rows, map pins, and Compare companies' own-company row. The action shows what the tip said: the list of those roles with its area chip, or the role's drawer.
   - **A preview tip where the tap would leave the page, or where the item has no action.**
     - "Same role elsewhere" rows and Compare companies rows switch to another company's board. There, the first tap shows the tip ("Tap again to see these roles"), and a second tap on the same row does it. The tip carries the middle-half figures, which are not on screen, so the tap explains the jump before it happens. This is the Zillow pin-then-card pattern.
     - The chart's pay strip has no action, so a tap shows a bar's tip and a second tap closes it.
     - This company's row in "Same role elsewhere" opens nothing either: tap, then tap again to close.
   - **An open tip closes without waiting for a `pointerleave`.** iOS sends none after a tap. It closes on a press anywhere outside its item, a scroll that moves its item (or removes it), a resize, the page hiding, Esc, blur, or the action itself.
   - **A tip never stays in viewport pixels while its item scrolls away.** A pointer tip closes. A keyboard tip follows its item and closes once less than half of the item is visible (`inView`).
   - **Words follow the input.** `actionHint(kind, action)` gives "Click to see these roles" with a mouse, "Tap again to see these roles" on touch, and "Press Enter to see these roles" from the keyboard.
   - Alternatives considered:
     - a preview on every item, which would make every filter and every circle take two taps;
     - no tip on touch at all, which would hide the comps' middle-half figures from phones and make the one-tap company switch a surprise;
     - closing on any scroll, which would close a keyboard tip on the chart's own `scrollIntoView`, and a tip whose row did not move.
2. **One helper, `features/shared.js`.** It is already imported by chart.js and map.js, and comps.js now imports it too. It exports:
   - `isTouchInput(e)`, backed by one capture listener each for touchstart, touchend and touch pointerdown, installed at module load (each component already knows whether its tip came from a mouse, a tap or the keyboard, so no general input classifier is needed);
   - `actionHint`;
   - `inView`;
   - `placeNearTap`: above the tapped item, clear of the finger, else below it, centred on the tap and kept 8 px inside the screen;
   - `tipCloser(close)` → `{ arm({ inside, anchor, follow }), disarm(), armed }`.

   Each component keeps its own content and placement and calls these helpers. That gives one rule in about 150 lines, not five copies.
3. **`createTooltip` keeps its API.**
   - `bind(el, getContent)` behaves as before for a mouse and the keyboard, except that a keyboard tip now follows its item where it used to hide on any scroll.
   - An optional third argument `{ action }` adds the input-worded line and makes the first tap a preview. A capture-phase click listener on the root stops the item's own `onclick` from seeing that first tap.
   - It also corrects the tip's position when a containing block (a `container-type` box) offsets `position: fixed`.
4. **Compare companies takes the drawer's rule.** It is the same chart idea with the same action (switch company with the role family), so it gets the same preview. Its rows now also say "Click to see these roles" to a mouse, the only new words on desktop.
5. **The map: no tooltip on a tap, and a tooltip that stays inside the map.**
   - Each marker's `openTooltip` is wrapped, so a touch never opens one. Closing a tooltip after it opens is not enough, because Leaflet's 200 ms fade leaves it in the DOM. iOS would count that as new hover content and cancel the tap.
   - `fitTooltip` places the tooltip from its measured size:
     - beside the pin near a side, when it fits there;
     - else above the pin;
     - else below it, slid to stay 8 px inside the map, both sideways and up.
   - A slid tooltip hides its arrow (`.ms-map-tip--slid`, styles.css). The fit runs again on `moveend` and `zoomend` while a tooltip is open.
   - Before: on a 390 px phone, 3 of 3 focused Google pins and 3 of 4 Apple pins ran off the map (Bengaluru at −107 px, Auckland at −30 px). On a 1440 px desktop, London ran above it. After: 0.
6. **Words a tap can reach (the lead's list).**
   - Keywords heading: "pick one to filter".
   - Save button title: "Saved in this browser. Press again to remove. …".
   - Chart row names: "Tap or click to …". A row's own caveat (`r.why`) is now in its accessible name. The chart's Details explains rows of several countries' pay ("mixed"), next to the existing basis and other-place lines.
   - Ranges legend striped key: "Each bar's tip, and its role's details, list them".
   - Pay-label chips: their meanings are items in the pay block's Details. They are read from the chips `payLabels()` drew, so `payLabels` is untouched (fix-pay-at-place owns it), and the chip wording (MR-34) is unchanged.
   - Juice household: one muted line under the buttons, for example "2 adults, 1 earner, 2 bedrooms". Each of the three lines fits a 320 px phone (the longest, the family's, is 254 px wide where the drawer gives it 306 px at 360, so about 266 px at 320). The `nowrap` and ellipsis CSS keeps it to one line (fix-density). The long title stays for a mouse.
7. **A tip stays on the screen, not just on the page.**
   - `placeNearTap` keeps a tapped tip inside the visual viewport. The Razr cover screen (352x355) shows a page 487 px wide, panned 12 px left and 59 px down, and a pinch zoom pans the screen the same way. Placed against the layout viewport, the tips there sat 4 px off the screen.
   - The map's `fitTooltip` fits the part of the map on screen: a short landscape screen (Razr inner, 1005x412) scrolls part of the map away. It also caps the tooltip's width and height to that part, so on a 280 px Fold or the Razr cover the tooltip is no bigger than the map. Lines that do not fit are cut at the bottom; the figures come first.
8. **How the tests reproduce an iPhone in any engine.** Headless Chromium never showed the bug. It fires `pointerleave` after a touch lifts, moves focus to a tapped `tabindex` list (so `blur` hid the tip), and re-runs hover after a scroll. The e2e init script plays the iPhone's sequence instead:
   - a real tap (CDP `Input.dispatchTouchEvent` in Chromium, `page.touchscreen.tap` in WebKit);
   - at its `touchend`, before the click, iOS's emulated `pointerover`, `pointermove`, `mouseover` and `mousemove` (pointerType "mouse") on the element under the finger;
   - no click when those events showed a tip, as WebKit's content-change observer does;
   - no focus moved to a tapped element that is not a form field;
   - nothing for a drag.

   On the unchanged build, this sequence reproduces the user's screenshot exactly: the first tap shows the tip and opens nothing, and a tap on the section's text leaves the tip in place (`before-comps-tap-elsewhere-p390-dark.png`). The control check: a CDP tap on the drawer's "Details" button toggled `aria-expanded` (false → true).

## 4. Replayable steps

```bash
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp   # 32f556f
ln -s /home/user/melon-seek/node_modules node_modules
ln -s <scratch>/wt-data2/data/snapshots data/snapshots
mkdir -p data/beta && ln -s <scratch>/wt-data2/data/beta/snapshots data/beta/snapshots
timeout 600 node scripts/build-static.js                     # dist/ and dist/beta/ (7/7 beta companies)
# Edited public/ files are copied verbatim by the build, so for iteration copy them into dist/ and dist/beta/.
NODE_PATH=<scratch>/pw/node_modules timeout 1200 node test/e2e/fix-touch-tips.e2e.js            # Chromium
NODE_PATH=... node test/e2e/fix-touch-tips.e2e.js --browser=webkit                            # WebKit (CI)
FTT_SHOTS=before|after [FTT_DARK=1] node test/e2e/fix-touch-tips.e2e.js                       # screenshots
FTT_PHONE=360x740 node test/e2e/fix-touch-tips.e2e.js                                         # every phone check at 360x740
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-touch-tips
mv data/snapshots data/beta/snapshots <out of data/>; MELON_BETA_SNAPSHOT_DIR= timeout 1500 npm test   # CI-like
NODE_PATH=... timeout 7000 node scripts/e2e.js                                                # full suite, data linked
git checkout -- docs/screenshots                                                              # other lanes' shots the suite rewrote
```

## 5. Verification

- **Inventory** (390x844 and 360x740 phone, both themes; 1440x900 desktop). The "after" column is for touch unless it says otherwise.

| Box | Mouse | Keyboard | Touch before | Touch after |
|---|---|---|---|---|
| Same role elsewhere row tip (viz/comps.js) | Hover shows ("Click to see these roles"), leave hides, click opens: unchanged | Arrows show it under the row. Before it said "Click …"; now "Press Enter …". It follows the row on scroll. Esc clears, the next Esc closes the drawer (D-8) | iPhone: the tap's emulated mouse showed it and the tap opened nothing. No tap elsewhere, scroll or second tap hid it, and it stayed in viewport px while the drawer scrolled. A 2 px finger move showed it. It said "Click" | The first tap shows it above the row, "Tap again to see these roles". The second tap opens the company (this company's row: the tip closes). A tap elsewhere, a scroll that moves the row, Esc or the action closes it |
| Chart circle tip (Clusters) | Unchanged | Arrows show it. Before it hid on the chart's own scroll; now it follows | The emulated mouse showed it, the tap selected nothing, and it stuck | A tap selects the circle at once (area chip). No tip |
| Chart row name (Clusters) | Title "Click to show all N roles" + caveat → "Tap or click …" | The caveat is now in the accessible name | Title unreachable | Tap shows all N roles. The "mixed" caveat is in the chart's Details |
| Ranges row tip | Unchanged | As for circles | The emulated mouse showed it and it stuck | A tap opens the role (or lists the row) at once. No tip |
| Chart pay strip tip | Unchanged | Not focusable (unchanged) | The emulated mouse showed it, and it stayed after a tap elsewhere | A tap shows the nearest bar's tip above the strip. A second tap, a tap elsewhere or a scroll that moves it closes it |
| Ranges legend, striped key | Title "hover a bar for each" → "Each bar's tip, and its role's details, list them" | — | — | — |
| Insights filter rows (`createTooltip`) | Unchanged | Focus-visible tip; it follows on scroll (before: hid on any scroll) | The emulated mouse left the tip on screen after the filter applied | A tap filters at once. No tip |
| Compare companies rows (`createTooltip` with `{ action }`) | Adds "Click to see these roles" | Adds "Press Enter to see these roles" | The tap switched company at once, and the emulated mouse left a tip over the next board | The first tap shows the tip, "Tap again to see these roles". The second switches. This company's row acts at once |
| Map pin tooltip (Leaflet) | Hover opens and closes. Now kept inside the map (slid, arrow hidden, below when there is no room above) | Focus opens, blur closes. Now kept inside the map | A tap opened it (click, focus or emulated mouseover), off screen (Buenos Aires at −67 px) and under the sheet. It stayed through pans | A tap selects the place at once. It never opens |
| Drawer pay strip (distribution) | No tip. The caption's title repeats "counts each posted range at its middle", which is in Details | — | — | Unchanged |
| Drawer pay-label chips | Title on a span | Unreachable | Unreachable | Meanings are items in the pay block's Details |
| Drawer Juice household buttons | Title | Title | Unreachable | One muted line under the buttons for the picked household |
| Drawer "Keywords · click to filter" | — | — | Mouse words | "pick one to filter" |
| Save search button | Title "click to remove" | — | — | "Press again to remove" |
| Popovers: quick-filter chips, company menu, data badge, add board; the filters panel | Open on click, close on Close, Done, Esc or a press outside, follow their anchor on scroll | Same | Bottom sheets: open on tap, close on a tap outside or Esc (probed at 360 dark and 390 light) | Unchanged |
| Toasts | Auto-dismiss | — | — | Unchanged |

- **Sizes** (`test/e2e/phone-sizes.mjs`, the user's "all phone sizes from iPhone mini to razr to duo"). Every entry has its own e2e test: the strip's tip, a circle tap, Same role elsewhere and Compare companies taps ("Tap again", fully on screen, closed by a tap elsewhere), a pin tap (no tooltip), and every focused pin's tooltip inside the part of the map on screen. All 19 pass:
  - portrait: Galaxy Fold folded 280x653, iPhone SE (1st gen) 320x568, Z Fold 5 cover 344x882, Galaxy S8 360x740, Z Flip 5 360x880, iPhone 13 mini 375x812, iPhone SE (3rd gen) 375x667, iPhone 15/16 393x852, iPhone 13/14 390x844, Pixel 8 412x915, razr inner 412x1005, iPhone 15 Pro Max 430x932, Surface Duo single 540x720, Z Fold 5 open 690x829;
  - other postures: razr cover 352x355, Surface Duo spanned 1114x720, iPhone 13 mini landscape 812x375, iPhone SE (3rd gen) landscape 667x375, razr inner landscape 1005x412.

  What no finger can reach is noted, not failed. The pay strip is hidden on purpose on the three short landscapes and the razr cover. On the razr cover, the map's Remote button and legend cover its three pins; that is a layout bug for fix-phone-sizes, and the keyboard check of those pins passes.
- **Tests.**
  - `test/e2e/fix-touch-tips.e2e.js` on Chromium: before the fix (base 32f556f + the tests), 1 of 14 passed (the desktop chart-hover guard). After, 14 of 14 pass. The logs are in the scratchpad (`ftt/before-light.log`, `before-dark.log`).
  - Each failure before named the bug: "the first tap opens nothing yet", "a tap on the section's text closes the tip", "the tip closed or stayed by its row", "a moving finger opened a tip" (4 boxes), "the keyboard tip says Press Enter, never Click", "a tap elsewhere closes it" (strip), "the first tap switches nothing yet" (Compare), "no tip after the iPhone tap" (Insights), "the tap selected the pin's place", and the seven word checks.
  - `test/fix-touch-tips.test.js`: 7 of 7 (words, `isTouchInput`, `placeNearTap`, `tipCloser` with a fake document).
  - `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved out:
    - at 0102980: 1162 tests, 1102 pass, 0 fail, 8 skipped (the rest are TODO markers);
    - at fc67365 (after the rebase): 1187 tests, 1120 pass, 3 fail, 8 skipped. The 3 are the timing tests S-3 (two) and S-6, run at load 23; alone, 7 of 7 pass.
  - Full e2e with data linked (at 0102980): 377 of 383 pass, 2 fail, 4 skipped.
    - T21 is load-sensitive and passes alone.
    - The UI drawer section-order test strips the old "click to filter" words. It passes with `docs/process/patches/fix-touch-tips-ui-e2e.diff`.
    - The suite's rewrites of other lanes' screenshots were reverted (`git checkout -- docs/screenshots`).
- **Screenshots** (`docs/screenshots/fix-touch-tips/`, 8-bit). Each is `before-*` and `after-*`, in `-light` and `-dark`:
  - `comps-tap-p390`, `comps-tap-p360`, `comps-current-tap-p390`, `comps-current-tap-p360`, `comps-tap-elsewhere-p390`, `comps-tap-elsewhere-p360`, `comps-scroll-p390`;
  - `comps-hover-desktop`, `comps-keyboard-desktop`;
  - `chart-circle-tap-p390`, `chart-hover-desktop`, `strip-tap-p390`;
  - `compare-tap-p390`, `map-pin-tap-p390`, `map-pin-keyboard-p390` (Bengaluru at −107 px before), `map-pin-keyboard-desktop` (London above the map before);
  - `drawer-pay-details-p390` (the label meanings in Details), `drawer-juice-household-p390` (the household line).
  - The e2e takes them with `FTT_SHOTS=before|after` (and `FTT_DARK=1`). The "before" set comes from a symlinked copy of dist/ with the base commit's eight files (scratchpad `ftt/make-dist-before.sh`). The two map-keyboard and two drawer shots were first taken with scratch probes (p7, p8) and are now also in the e2e.

## 6. Known gaps and follow-ups

- **A test outside my files needed the new words.** `test/e2e/ui.e2e.js` strips "click to filter" from the drawer's section names. Its one-line change is the patch `docs/process/patches/fix-touch-tips-ui-e2e.diff`, which strips "pick one to filter" as well.
- **Layout seen during the size matrix (fix-phone-sizes' files, not mine).** At 352x355 the page is 487 px wide, and the results sheet's peek sits below the screen (top 427 of 355). On the razr cover, the map's Remote button and legend cover its pins.
- **WebKit has not run here.** The sandbox has only Chromium, so the WebKit step in webkit-phone.yml has `continue-on-error` for its first run. Its summary shows each result. The iOS Simulator job in the same workflow is the real-tap check.
- **Title-only texts left as they are.** None is a floating box, and none was in the lead's list:
  - on cards: the pay pill tip, the "Pay unclear" reason (the drawer has "Why?"), seniority meanings (the Seniority filter's note says them), the pool, OTE and term tags, the age, and the status tags;
  - in the results header: "· N in title" and "of N posted";
  - in the chart: the median caption and the FX link (its date is in the text, MR-2);
  - on the map: the legend swatches;
  - the Group select's department note (MR-29, the fix wave).

  A phone reaches most of them in the drawer or a filter note. The results header's two explanations are the ones a phone cannot reach at all.
- The pay strip is not keyboard-focusable (as before).
- `TOUCH_GRACE_MS` is 1 s. A touchscreen laptop whose user taps and then moves the mouse within a second gets no hover tip for that second.

## 7. Change log

- 2026-10-16 21:44: worktree at 32f556f, data linked, build (7/7 beta companies).
- 22:05: probes: Chromium hides the tip by `pointerleave`, `blur` and hover-after-scroll; the iPhone sequence written as an init script reproduces the user's screenshot.
- 22:12: e00c2c0, the failing e2e (13 of 14 fail) with before screenshots.
- 22:30: 0102980, the fix: the shared helper and every box; 14 of 14 pass; `npm test` 0 fail; after screenshots.
- 23:30 to 01:50: the lead's phone-size matrix. Rebased onto a7c4198 (one conflict in `scripts/e2e.js`'s registrations) and rebuilt. 7d26b47: one tip test per size. fc67365: tips kept in the visual viewport and the map's visible part, and the matrix taps in screen px and lowers the sheet: 33 of 33.
- Coordinated with fix-pay-at-place (af40fcca54b57983d) on the shared files: my edits stay in the tip code, my notes item goes before "How pay is read", and `payLabels` itself is untouched.

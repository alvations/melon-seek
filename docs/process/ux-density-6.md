# Process log: ux-density-6

## State

- **Done:** brief saved verbatim (f52d08c); e800c43's site built (no product file differs between e800c43 and the
  branch tip 0c6990e) and served; the user's two screenshots measured (375x625 page, Chrome on iOS); the size matrix
  (section 3.1) and its patch for test/e2e/phone-sizes.mjs (section 3.2); the audit script, checked against the
  user's screenshot.
- **In progress:** the before audit (35 sizes x 4 boards x 4 states, scratch `ux6/before/`), run through the shared
  heavy-job queue.
- **Next:** the density spec table (section 3.3) with its checks, sent to the lead; then the mockups (section 5).

## 1. Brief

Prompt: [prompts/ux-density-6.md](prompts/ux-density-6.md) (verbatim).

The user, 2026-10-24: "the charts and view is way too noisy on an iPhone mini". Make the amount of information
scale with the screen, from the iPhone mini to the largest iPhones, the folds, the Surface Duo and the iPads.
Density means fewer things on the first screen and more behind one tap, never less data: no posting or posted pay
row is hidden, and pay is shown as posted. This lane designs and measures; fix-ui-6 implements.

Files owned: this log, the prompt, docs/screenshots/ux-density-6/.

## 2. Inputs and sources

- The user's two screenshots (scratch `ux6/user-iphone-mini-*.png`, 1125x2436, an iPhone 13 mini at 3x). Measured
  down the left edge with ImageMagick (`convert … -crop 1x2436+8+0 txt:-`): the page starts at device row 326 and
  ends at row 2202, so the page is **375 x 625.3** CSS px. The browser is **Chrome on iOS**: its location bar
  ends at 108.7 px (the status bar's 50 plus a 58.7 px location bar) and its bottom toolbar is 78 px (44 plus the
  34 px home indicator). My emulation at 375x625 reproduces the Apple screenshot row for row
  (`ux6/trial/shots/iphone-13-mini-chrome-bars-shown-apple-first.png`).
- docs/process/PLAYBOOK.md (checkpoints, "Known traps": emulated phones have no toolbars; Safari on a 390x844 phone
  shows about 664, an iPhone SE about 548); docs/QA.md's mobile QA (the Safari heights 390x664, 375x548, 430x740,
  375x635; no source given there); TEMPLATE.md.
- docs/strategy/ROADMAP.md §8 (the simplicity budget: no new control in the main view, except through an existing
  popover or select).
- The reviews: ux-review-beta-2 (density inventory, UX-35, UX-39, UX-43, UX-57), viz-review-beta-2 (V-39, V-46),
  fix-density (the one-line rule and `viz/note.js`), fix-phone-text (the guard; one line from 360 px up, two lines
  allowed below), fix-phone-sizes (the top bar's give-way ladder, the short-screen block at max-height 500, the Duo
  layouts, decision 9: the Fold open and the Duo on one screen keep the phone layout, as the 768x1024 tablet does).
- The persona wave-2 logs: 35–44 (#6: "show a role in the first screen"; a filtered chart leaves half the screen
  blank), 55-plus (#4, 3 of 5: "the phone's first screen shows no job", on Google, the Pixel 8, the mini and the
  razr cover screen, even after 15 s), 18–24 and 25–34 (the Duo's hinge, the razr cover screen).
- fix-ui-6's log and its live worktree (`/home/user/melon-seek/.claude/worktrees/agent-add67b9453342f4ba`, read
  as files; its last checkpoint on the branch is `wip/fix-ui-6/`, head 0e2a32a). This spec builds on its
  B-12/B-10 (the peek rises to 156 px, 84 on the map, 104 on the razr cover; `fitSheetToChart` raises it further
  into the room a short chart leaves) and B-11 (the beta tagline says what the site is for).
- test/e2e/phone-sizes.mjs (21 sizes, all full screens) and its unit test (test/beta-coverage.test.js: at least 19
  distinct sizes, each `isMobile`, a UA matching `/iPhone|Android/`).
- Device sizes: Apple's published pixel resolutions divided by the scale factor (3 for iPhones, 2 for iPads), which
  gives the CSS px every browser reports. Safe-area insets are the Xcode simulators' (status bar areas: SE 20,
  13 mini 50, 13/14 47, 15/16 59, 16 Pro/17/Pro Max 62; home indicator 34), as tabulated by developer references
  such as useyourloaf.com. The sandbox cannot reach those pages (proxy refusal), so they are quoted, not re-measured.
- The browsers' bars: Chrome on iOS is measured (above). Safari's bottom tab bar (iOS 15–18) is 99 px plus the home
  indicator: that model gives the three Safari heights already in docs/QA.md (390x664, 375x548, 430x740) exactly.
  The collapsed heights and Chrome on Android are estimates, marked "est.".

## 3. Decisions and rationale

### 3.1 The size matrix

**What the page gets.** On a phone the page itself never scrolls (`body { height: 100dvh }`, the sheet drags,
the audit measures `scrollHeight == innerHeight` at every phone size). Safari and Chrome collapse their bars only
when the document scrolls, so **on this site the bars stay shown**: the "bars shown" height is the one people see,
and it is the one the tests must use. Collapsed heights are listed for completeness (a rotation, a browser that
hides its bars by itself).

iPhones (portrait, CSS px):

| Phone | Screen | Status / home bar | Safari, bars shown | Safari, collapsed | Chrome iOS, bars shown | Chrome iOS, collapsed | Test size |
|---|---|---|---|---|---|---|---|
| iPhone SE (1st gen, iOS 15 at most) | 320x568 | 20 / 0 | 320x449 | ~320x498 est. | 320x445 | ~320x528 est. | **320x445** |
| iPhone SE (2nd, 3rd gen) | 375x667 | 20 / 0 | 375x548 (docs/QA.md) | ~375x597 est. | 375x544 | ~375x627 est. | **375x544** |
| iPhone 12/13 mini | 375x812 | 50 / 34 | 375x629 | ~375x712 est. | **375x625 (measured, the user's)** | ~375x742 est. | **375x625**, 375x629 |
| iPhone 13 / 14 / 16e | 390x844 | 47 / 34 | 390x664 (docs/QA.md, PLAYBOOK) | ~390x747 est. | 390x660 | ~390x777 est. | **390x660** |
| iPhone 15 / 16 | 393x852 | 59 / 34 | 393x660 | ~393x743 est. | 393x656 | ~393x773 est. | **393x656** |
| iPhone 16 Pro / 17 / 17 Pro | 402x874 | 62 / 34 | 402x679 | ~402x762 est. | 402x675 | ~402x792 est. | **402x675** |
| iPhone 15 Pro Max / 16 Plus | 430x932 | 59 / 34 | 430x740 (docs/QA.md) | ~430x823 est. | 430x736 | ~430x853 est. | **430x736** |
| iPhone 16 / 17 Pro Max | 440x956 | 62 / 34 | 440x761 | ~440x844 est. | 440x757 | ~440x874 est. | **440x757**, 440x844 |
| iPhone 18 Pro Max | assumed 440x956 | assumed 62 / 34 | as the 17 Pro Max | | | | as the 17 Pro Max |

- Safari, bars shown: screen − status bar − 99 − home bar (iOS 15–18, the bottom tab bar, the default since
  iOS 15). Collapsed: screen − status bar − ~50 (the minimised address bar), est.
- Chrome on iOS, bars shown: screen − status bar − 58.7 − 44 − home bar (measured). Collapsed: screen − status
  bar − ~20 (the slim address strip; the bottom toolbar slides away), est.
- Chrome's bars are 4 px taller than Safari's, so **Chrome bars shown is the smallest page on every iPhone** and is
  the test size; the mini also gets Safari's 375x629 (the other browser people use there).
- iOS 26's Safari "Compact" layout floats its bar over the page; it takes no more height than iOS 18's bottom bar,
  so iOS 18's numbers are the conservative ones. Not measured: no device here.
- **The iPhone 18 Pro Max** is assumed the same as the 17 Pro Max (440x956, 62 / 34) until Apple publishes its
  numbers; when it does, add a line here and to VISIBLE. The iPhone Air (420x912) sits between the 17 and the Pro Max
  and needs no class of its own.

Android, folds, Razr and the Surface Duo (Chrome on Android: a 56 px toolbar at the top; a 24 px status bar; a 24 px
gesture bar, or 48 px of buttons on the S8). All estimates: there is no Android device here and no published table.

| Device | Screen (phone-sizes.mjs) | Bars shown | Collapsed | Test size |
|---|---|---|---|---|
| Galaxy Fold (folded) | 280x653 | 280x549 est. | 280x605 est. | **280x549** |
| Galaxy Z Fold 5 (cover) | 344x882 | 344x778 est. | 344x834 est. | **344x778** |
| Motorola razr (cover screen) | 352x355 | 352x275 est. (status bar and toolbar only) | 352x331 est. | **352x275** |
| Galaxy S8 / small Android | 360x740 | 360x612 est. (3 buttons) | 360x668 est. | **360x612** |
| Galaxy Z Flip 5 | 360x880 | 360x776 est. | 360x832 est. | **360x776** |
| Pixel 8 | 412x915 | 412x811 est. | 412x867 est. | **412x811** |
| Motorola razr (inner, open) | 412x1005 | 412x901 est. | 412x957 est. | **412x901** |
| Surface Duo (one screen) | 540x720 | 540x616 est. | 540x672 est. | **540x616** |
| Galaxy Z Fold 5 (open) | 690x829 | 690x725 est. (taskbar as a gesture bar) | 690x781 est. | **690x725** |
| Surface Duo (spanned, two screens) | 1114x720 | 1114x616 est. | 1114x672 est. | **1114x616** |
| Surface Duo (stacked) | 720x1114 | 720x1010 est.: the top screen keeps 460 px under the bars, the hinge is at y 460–494, the bottom screen 516 px | 720x1066 est. | **720x1010** |

iPads (Safari on iPadOS 18; its status bar 24 px, toolbar 50 px and, in the default "Separate" layout, a 36 px tab
bar; nothing at the bottom. "Compact" tabs: 36 px more). Sizes from Apple's pixel resolutions at 2x. iPadOS Safari
asks for the desktop site by default, so it sends a Mac user agent and has touch.

| iPad | Screen | Portrait, bars shown | Landscape, bars shown | Layout today |
|---|---|---|---|---|
| iPad mini (6th gen, A17 Pro) | 744x1133 | **744x1023** (Compact tabs 744x1059) | **1133x634** (1133x670) | portrait: the phone layout (≤ 860 px); landscape: desktop |
| iPad (10th gen, A16), iPad Air 11" (M2, M3) | 820x1180 | **820x1070** | **1180x710** | portrait: phone; landscape: desktop |
| iPad Pro 11" (1st–4th gen; the M4 is 834x1210) | 834x1194 | **834x1084** | **1194x724** | portrait: phone; landscape: desktop |
| iPad Pro 12.9", iPad Air 13" | 1024x1366 | **1024x1256** | **1366x914** | desktop |
| iPad Pro 13" (M4) | 1032x1376 | **1032x1266** | **1376x922** | desktop |

**Size classes** (the phone layout is everything ≤ 860 px wide, as today; the class is set by the *visible* height):

| Class | Rule | Members (test sizes) |
|---|---|---|
| **Short** | phone layout, visible height ≤ 500 | razr cover 352x275, SE 1st gen 320x445, every phone in landscape (today's `max-height: 500px` blocks) |
| **Compact** | phone layout, 501–699 | Fold folded 280x549, S8 360x612, SE 375x544, mini 375x625/629, 13/14 390x660, 15/16 393x656, 16 Pro/17 402x675, Duo one screen 540x616 |
| **Tall** | phone layout, 700–959 | 15 Pro Max 430x736, 17 Pro Max 440x757 (and 440x844), Flip 5 360x776, Fold 5 cover 344x778, Pixel 8 412x811, razr inner 412x901, Fold 5 open 690x725 |
| **Tablet portrait** | phone layout, ≥ 960 tall | iPad mini 744x1023, iPad / Air 11" 820x1070, iPad Pro 11" 834x1084, Duo stacked 720x1010 (two screens) |
| **Wide** | over 860 px: the desktop layout, as today | Duo spanned 1114x616, every iPad in landscape, iPad Pro 12.9"/13" portrait, desktops |

Width still decides what it decides today (the top bar's give-way ladder, the narrow chart rows under 520 px). The
class adds only the vertical budget.

**How to set the class.** By the visible height, read once the page has laid out and again on a width change or a
rotation, never on a height change alone (the keyboard: bindKeyboardInsets already tells it apart), as a root
attribute, e.g. `<html data-fit="compact">`. A `max-height` media query gives the same answer in Chromium and in the
tests; the attribute is the safer choice for iOS, whose browsers report the large viewport to some CSS and the small
one to `innerHeight`. Either way the e2e tests set the viewport to the sizes above.

### 3.2 The patch for test/e2e/phone-sizes.mjs

[patches/ux-density-6-phone-sizes.diff](patches/ux-density-6-phone-sizes.diff) (`git apply` checks clean on
0c6990e). For fix-ui-6 to apply:
- `VISIBLE` (21 entries): every phone above under its bars, the test sizes of 3.1. iPhones carry Chrome on iOS's
  user agent (`CriOS`), except the mini's Safari size and the Pro Max with Safari's bars collapsed (440x844).
- `TABLETS` (10 entries): the five iPads, portrait and landscape, with iPadOS Safari's Mac user agent, touch and 2x.
- `ALL_SIZES` = PHONES + POSTURES + VISIBLE + TABLETS: 52 entries (21 today).
- test/beta-coverage.test.js: the size test now wants at least 52 sizes, a height of 260 or more (the razr cover
  screen under its bars is 275), a user agent matching `iPhone|Android|Macintosh`, and names the mini under Chrome's
  bars (375x625), the largest iPhone (440x757) and iPads in both orientations. It passes on the patched files
  (`node --test --test-name-pattern=phone-sizes test/beta-coverage.test.js`: 1 pass).
- **Cost:** every e2e file that loops over ALL_SIZES (phone-matrix, fix-phone-text, fix-phone-controls,
  beta-coverage and seven more) runs about 2.5 times as many cases. If that is too slow for the gate, keep the new
  lists out of ALL_SIZES and loop the density tests (3.3) over `[...VISIBLE, ...TABLETS]`; the lead decides.

### 3.3 The density spec

The rule in one line: **the first screen of every phone shows the first card's title and pay, and at least two or
three whole chart rows; everything else is one tap away (the caption's Details, the sheet, the row's tap), and
nothing is dropped.** Bigger classes add back, in this order: the circles, the strip, the notes line, the one-row top
bar, three cards, then the desktop's side-by-side list.

| Element (top to bottom) | Short ≤ 500 | Compact 501–699 | Tall 700–959 | Tablet portrait ≥ 960 | Wide > 860 | Check |
|---|---|---|---|---|---|---|
| Header pills: Beta, company, freshness, theme | as today (fix-phone-sizes' give-way ladder) | as today: one row, name whole | as today | **one row with the search and the views** (from 640 px wide, so the Fold open too) | as today | D-11 |
| Search, Chart / Map / Insights, quick bar | as today | as today | as today | (in the top bar's one row) | as today | D-13 |
| Tagline | gone (today) | **first visit only** | **first visit only** | **first visit only** | as today, beside the controls | D-3 |
| Stats line | gone (today) | **Chart view: gone** (the caption has the median); Map view: as today | same as compact | Chart view: **count · share** (+ Details), beside Clusters / Ranges; Map: as today | Chart view: **count · share**; Map: as today | D-2 |
| Clusters / Ranges and Group | as today | **as today, one row, two controls** (not merged, see 3.4) | as today | as today | as today | D-13 |
| Chart caption | unit + median | **unit + median + the chart's one Details** | unit + median | unit + median (as today) | "Median base pay $214K" over the strip (today) | D-2, D-8 |
| Histogram strip | folded | **folded: opens with the caption's Details** | shown | shown | shown | D-4 |
| Ranges' legend line ("Striped … · Colour: department") | folded | **folded into Details** | shown | shown | shown | D-4 |
| Chart rows | as compact | **52 px rows: the label line (name · N roles · median) and the band, the median tick and a thin line from the lowest to the highest pay on the axis; no circles** | today's rows: circles with their counts | today's (wide) rows | today's | D-5 |
| Whole rows on the first screen (Apple) | 0 is allowed (cover screen: a glance at the header and one card) | **≥ 3 from 600 px tall, ≥ 2 below** | **≥ 3** | **≥ 6** | ≥ 5 | D-6 |
| "›N" edge chips | kept | **kept**, at the line's end | kept | kept | kept | D-13 |
| With / without pay line | folded | **folded: the first line of the caption's Details** | shown | shown | shown | D-7 |
| Sheet peek | fix-ui-6's 104 (cover), 64 (landscape) | **grip 20 + count row 48 + the first card down to its pay + 8 (measured, ~130 px)**; the Juice line shows from half up; Map view too | same rule (~130–150 px) | **three whole cards** (~40 % of the height) | no sheet: the list column | D-1 |
| Few roles (a filter leaves ≤ 20) | | fix-ui-6's B-10: the peek rises into the room the rows leave | same | same | | D-1, D-6 |

**The checks**, each a test fix-ui-6 can write (sizes from 3.1, the four boards of the audit, dark and light):

- **D-1 A card on the first screen.** At every phone-layout size in VISIBLE and TABLETS (portrait), in Chart and Map
  view, on load and after a filter that leaves few roles: the first card's `.card-title` (all its lines) and its
  `.card-pay .sal-pill` are inside the viewport and not covered (`elementFromPoint` at their centres lands in them).
  Short sizes: Chart view only. Tablet portrait: the third card is whole too.
- **D-2 The median once.** In Chart view, exactly one visible element on the first screen states the view's median
  figure (text matching /median/i with a money figure); it is the chart's caption at every size. In Map view it is the
  stats line.
- **D-3 Tagline.** With the site's "visited" flag in localStorage before load, `#tagline` is not visible at any
  phone-layout size; without it, it is visible and one line (fix-phone-text's guard). Desktop: unchanged. Storage that
  throws counts as a first visit.
- **D-4 Strip and Ranges legend.** Compact and short: `.ms-chart__hist` and the Ranges legend line are not visible
  until the caption's Details is opened, then visible. Tall and up: visible on load.
- **D-5 Compact rows.** Compact and short: no `.ms-bin` other than the edge chips is visible; every row with pay has a
  visible band, median tick and range line; a row is at most 52 px tall. Tall and up: circles as today.
- **D-6 Rows on the first screen.** Whole `.ms-crow` between the axis and the sheet's top, on Apple: the minimums in the
  table (375x625: ≥ 3; 375x544: ≥ 2; 440x757: ≥ 3; 744x1023: ≥ 6).
- **D-7 The notes line.** Compact: `.ms-chart__foot` is not visible, and the first item of the caption's Details has
  both numbers ("2,781 … with pay", "2,070 without"). Tall and up: visible, one line.
- **D-8 One Details.** Compact, Chart view: exactly one visible "Details" control in the toolbar and the chart.
- **D-9 Lines above the first card.** Compact: at most 7 text lines outside the chart's rows sit above the first
  card's title (top bar 2, quick bar 1, Clusters / Ranges 1, caption 1, axis 1, the sheet's count 1). 375x625 on Apple
  today: 10.
- **D-11 Tablet portrait and the Fold open.** `.topbar` is one row (≤ 64 px tall) from 640 px wide in the phone layout.
- **D-12 The Duo stacked under its bars** (720x1010, hinge at y 460–494, CDP `displayFeature`): nothing on the hinge,
  at least two whole cards on the bottom screen and two whole rows on the top screen.
- **D-13 Nothing lost.** At every size: the sheet's count equals the board's; each row's accessible name (its count and
  median) and each edge chip's count are the same as on today's build; the toolbar, quick bar and top bar show no
  control that today's build does not, and the count of visible controls there is never higher.
- **D-14 Nothing cut.** fix-phone-text's guard (one line from 360 px up, two below) passes at every new size.

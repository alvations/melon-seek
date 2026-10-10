# Process log: badge-ux (data badge: Live / Snapshot / Cached / Demo)

## 1. Brief

Prompt: [prompts/badge-ux.md](prompts/badge-ux.md). The user asked whether the Live/Snapshot
badge behaves differently from before, because "the green dot [is] blinking now even though the
data looks to be fully there".

Goal: find the cause with evidence, then make the badge honest and calm. The dot pulses only
while something is in progress. While the live board is still loading behind the snapshot, the
label says "checking live…". The swap to live must not move the user, and a screen reader hears
it once.

Files owned: the badge code in `public/app.js` (`loadJobs`/`settleLive`/`applyJobs` swap path,
`renderTopbar` badge block, `badgeInfo`, `makeBadgeDetails`), the badge rules in
`public/styles.css`, a minimal `public/api.js` change (the `pending` signal),
`test/e2e/badge.e2e.js`, its registration in `scripts/e2e.js`, the race tests in
`test/static-build.test.js`, `docs/process/scripts/badge-ux-probe.mjs`, and
`docs/screenshots/badge/`.

## 2. Inputs and sources

- `docs/strategy/ROADMAP.md` §8 (UI simplicity budget): no new controls in the main view, labels
  monochrome, no new palette colours, respect reduced motion. This change adds no control: it
  changes the existing badge's text, motion and popover, and adds an invisible live region.
- `docs/CONTRACT.md` "Frontend interfaces" and "v3 additions": `live: false` companies are served
  from the bundle with `error: null`, and the badge reads "Snapshot · <date>". That is kept.
- `git show 2666ae1` ("Fetch live board and bundled list in parallel"): the parallel fetch, with
  `onUpgrade`/`onUpdate` and `applyJobs(…, { upgrade: true })`.
- `git log -S"pulse 2s ease-in-out infinite" -- public/styles.css`: the infinite Live pulse dates
  from `93ec6dc` (the first viz commit). It is older than 2666ae1.
- A worktree at `2666ae1^` (`0ecb9d5`) under the scratchpad, built with
  `scripts/build-static.js --out`, so the old behaviour could be measured, not guessed.
- `test/e2e/desktop-qa.e2e.js#serveDist` (the Pages layout under `/melon-seek/`), and
  `test/e2e/harness.js`.
- No skills loaded. No external sources were needed.

## 3. Decisions and rationale

### Root cause (evidence in §5)

1. **The infinite pulse is old; what 2666ae1 changed is when you see it.** `.data-badge.is-live
   .badge-dot { animation: pulse 2s ease-in-out infinite }` has been there since `93ec6dc`.
   Before 2666ae1, static mode waited for the live board. The badge pulsed as "Loading" (1 s)
   with skeletons, then showed "Live" (2 s pulse) together with the data, so the pulse read as
   "live". Since 2666ae1, the snapshot appears first ("Snapshot · Oct 2", steady, no hint that
   anything is still loading). 2–3 s later the list silently swaps (638 → 633 roles) and the
   badge turns green and pulses forever. The pulse now appears after the data is visibly done,
   so it reads as "still loading". Measured: the timelines in §5.1.
2. **Stale or missing states the swap introduced.**
   - While live was pending, the badge said "Snapshot · Oct 2" with no hint (§5.1, `late`).
   - A live board that failed after the bundle lost its reason. Before 2666ae1 the popover said
     "Live fetch failed: greenhouse/anthropic: HTTP 500". After it, nothing (`fail`). `onUpdate`
     was only called on success, so the UI could not know the check had ended.
   - On the swap, keyboard focus on a results card was lost to `<body>`, and the results list
     scrolled back to the top (224 → 2 px). An open badge popover was rebuilt and lost focus too
     (§5.2). The list scroll reset also happens before 2666ae1 whenever the list is rebuilt
     under a focused card. The swap made it happen without user action.
   - The badge button's accessible name was garbled and duplicated: "Snapshot · Oct 2Snapshot ·
     Oct 2 Saved snapshot of …". The name came from the `::before` label, the font-size-0 text
     and the sr-only tip, and the same tip was also the description. At ≤400 px it started
     "Oct 2Snapshot · Oct 2 …".
   - The count's live region (`#resultsTitle`, `aria-live=polite`) announced "633 roles" on the
     swap with no context.

### Fix

3. **One signal from the data layer: `pending`.** In static mode, a bundle shown first (with
   `onUpdate` given) now carries `pending: true`. `onUpdate` is called exactly once to settle
   it, and never after an abort. On success it gets the live result. On failure it gets the
   same result (the same `jobs` array) with `pending: false` and the reason in `error`
   (`null` for quiet sources such as Lever CORS). The reason is computed by re-running
   `fromBundle` after setting `error`/`quiet`, so it is exactly what the pre-2666ae1 sequential
   code returned. Alternatives: a second `onSettle` callback (more API for one consumer) or
   timers in the UI (guessing). Rejected. Without `onUpdate`, nothing is marked pending, so other
   callers (`apiFetch`, tests, `appJobs` helpers) see the same shape as before. `live: false`
   companies are untouched: no fetch, no pending.
4. **Ordering in app.js.** `onUpdate` waits until the first list is on screen
   (`shown`/`onScreen` in `loadJobs`). A quick live answer or failure that lands while the bundle
   is still being prepared in yielding chunks is never dropped. Without this, the new failure
   settle would leave "checking live…" stuck. `settleLive` clears `pending` even if the swap
   throws.
5. **Motion means work in progress.** Pulse (1 s, infinite) only for `is-loading` and
   `is-pending`. A settled Live dot is steady and keeps its halo. One 1.2 s single pulse
   (`is-arrived`) marks the moment the live board replaced the list, and only then (not when
   live wins the race, not in server mode). `prefers-reduced-motion: reduce` removes every badge
   dot animation (`animation: none !important`, on top of the global rule). The badge is rebuilt
   only when its content changes (signature in `dataset.sig`), so unrelated renders no longer
   restart the dot's animation.
6. **Labels: honest, short, never cut.** The pending tiers are:

   | Width | Label |
   |---|---|
   | ≥1600 px | Snapshot · Oct 2 · checking live… |
   | 1021–1599 px | Snapshot · checking live… |
   | 401–1020 px | Checking live… |
   | ≤400 px | Checking… |

   The 861–1020 px top bar is already full: it overflows by 28 px at 861 px with the settled
   "Snapshot · Oct 2", a pre-existing problem. So pending there must not be wider than the
   snapshot label: "Checking live…" is 132 px against 139 px. Measured at 18 widths
   (§5.3): no label is cut, and pending adds no new horizontal scroll. Demo bundles that are
   pending (builds without snapshots) read "Demo data · checking live…", and the demo banner
   says "Demo data for now — checking the <Company> live board…" instead of claiming the board
   "couldn't be reached" while it is still being tried.
7. **Not colour alone.** Every state names itself in text: Loading, Checking…, Live, Oct 2 /
   Snapshot · Oct 2, Cached, Demo, Offline. The pulse is backed by "checking" text, so reduced
   motion loses nothing. The button gets an explicit spoken name, `aria-label="Data source:
   <state>"` (for example "Data source: saved snapshot from Oct 2, checking the live board").
   The tip is its description (`aria-describedby`). The visible label is `aria-hidden`, because
   its narrow-width `::before` variants were polluting the name.
8. **One announcement.** A body-level `#dataLive` (`role=status`, `aria-live=polite`, sr-only) is
   created on the first render and says "Updated from the live board: 633 roles." once, when
   the swap lands. It is cleared after 8 s. `#resultsTitle`'s live region is muted for that one
   render and restored after 1 s, so the count isn't announced a second time. A failed live
   board is not announced ("stays Snapshot quietly"), and there is no toast or banner. The
   reason is in the popover.
9. **The swap doesn't move the user.** Filters, the hash, the chart selection, hover and an open
   drawer were already kept (verified). Now:
   - a focused card keeps focus (re-focused by id with `preventScroll`);
   - the results list's `scrollTop` is restored after the rebuild;
   - the badge popover is built once and updated in place, so focus on its button survives.

   The chart updates in place: no skeleton or overlay frame, rows go from 16 to 15 when a
   department empties. The only layout shift is the top bar's search box resizing with the badge
   width (CLS 0.0026, against 0.0015 before; "good" is < 0.1).
10. **Popover text per state** (see the state table in §5.4). Snapshot-only boards (static
    `live: false`) say "This board is collected by the site's crawler; your browser can't fetch
    it live." and hide "Refresh from the live board", which could only fail. The refresh toast
    for them says "This board is only available as a saved snapshot" instead of "Live board
    unreachable". Sources without an adapter label (the big-tech beta: google, eightfold, …)
    read "<Name> careers site" instead of "google / google".

## 4. Replayable steps

```sh
SP=<scratchpad>/badge; PWNM=<dir>/node_modules   # playwright (not a repo dependency)
# Builds: current tree, and the version before 2666ae1 in a worktree (never switch branches).
node scripts/build-static.js --out $SP/dist-now                    # before the fix
git worktree add --detach $SP/wt-pre 2666ae1^
ln -s $PWD/node_modules $SP/wt-pre/node_modules; ln -s $PWD/data/snapshots $SP/wt-pre/data/snapshots
(cd $SP/wt-pre && node scripts/build-static.js --out $SP/dist-pre)
# Timelines (badge class, shown label, dot animation, count, live request in flight):
for s in late early fail netfail bundleonly ashby lever; do
  NODE_PATH=$PWNM node docs/process/scripts/badge-ux-probe.mjs $SP/dist-now $s; done
NODE_PATH=$PWNM node docs/process/scripts/badge-ux-probe.mjs $SP/dist-pre late    # 2666ae1^
# Race sweep (4x CPU, Family household, live just after the bundle):
for d in 600 900 1200 1500 1800 2100; do
  NODE_PATH=$PWNM node docs/process/scripts/badge-ux-probe.mjs $SP/dist-now near --delay=$d --household=family --cpu=4 --ms=9000; done
# Screenshots (before = dist-now, after = the fixed build), 1440/390, light/dark:
for s in loading late fail bundleonly; do
  NODE_PATH=$PWNM node docs/process/scripts/badge-ux-probe.mjs $SP/dist-after $s --widths=1440,390 \
    --schemes=light,dark --shots=docs/screenshots/badge --tag=after; done
# (late once more with --pendpop=1 for the popover-while-checking shots)
# Server mode:
PORT=5391 node server/index.js &   # pid in $SP/server.pid; the sandbox cannot reach the boards
# Tests:
npm test
npm run build && NODE_PATH=$PWNM node scripts/e2e.js            # full suite, includes "Badge:"
NODE_PATH=$PWNM node scripts/e2e.js --grep=Badge:               # the badge tests only
```

The swap probe (filters, cluster selection, list scroll, hover, focused card, drawer, open
popovers, layout shifts per frame) and the width/accessible-name measurements were scratchpad
scripts. Their checks now live in `test/e2e/badge.e2e.js`.

## 5. Verification

### 5.1 Timelines (1440 px, anthropic, Greenhouse simulated)

The bundle lands at about 0.8 s and live at +2.5 s. "pending" means the live request is in
flight.

| Build | Scenario | Timeline |
|---|---|---|
| 2666ae1^ | late | Loading (1 s pulse) for 5.5 s, then **Live, `pulse 2s infinite`** with 633 roles |
| 2666ae1^ | fail | Loading, then Snapshot · Oct 2, tip "… Live fetch failed: greenhouse/anthropic: HTTP 500." |
| before fix | late | Loading, then **Snapshot · Oct 2 (steady, no hint) while pending**, then 638 → 633 roles and **Live, `pulse 2s infinite`** forever |
| before fix | early | Loading, then Live, `pulse 2s infinite` |
| before fix | fail / netfail | Loading, then Snapshot · Oct 2 while pending, then the same badge, **tip without the reason** |
| before fix | bundleonly | Loading, then Snapshot · Oct 2, no live request (correct) |
| after fix | late | Loading, then **Snapshot · checking live… (1 s pulse)**, then **Live, `pulse 1.2s x1`, then steady**, 633 roles |
| after fix | early | Loading, then Live, steady (or briefly "checking live…" when the live board's processing is slower than the bundle) |
| after fix | fail | checking live…, then **Snapshot · Oct 2, steady**, tip "… Live fetch failed: greenhouse/anthropic: HTTP 500." |
| after fix | netfail | the same, with "… could not reach the board (blocked by CORS or the network)" |
| after fix | lever (quiet) | checking live…, then Snapshot · Oct 2, tip with no error |
| after fix | bundleonly | Loading, then Snapshot · Oct 2, steady, no request, crawler sentence, no Refresh button |

Race sweep, before the fix (4x CPU, Family): six delays all ended Live. The live response
sometimes finished before the snapshot was even drawn, and then still took about 2.5 s of
processing to appear. Ordering is now guaranteed by design rather than by timing (decision 4).

### 5.2 Swap (before the fix, then after)

| Case | Before | After |
|---|---|---|
| Search filter + cluster + list scroll + hover | kept | kept |
| Drawer open, scrolled, focus on Next | kept, "3 of 633" | kept |
| Location popover or sidebar checkbox focused | kept | kept |
| Focused results card | **focus → BODY, list scroll 224 → 2** | focus kept, scroll kept |
| Badge popover open, focus on its button | content updated, **focus → BODY** | updated in place, focus kept |
| Chart overlay or skeleton frame during the swap | none | none |
| Layout shift at the swap | 0.0015 (top bar) | 0.0026 (top bar) |

### 5.3 Widths, dark mode, keyboard, accessible name

- Pending label at 18 widths from 320 to 1600 px: never cut. Pending adds no horizontal scroll;
  the overflow at 861 px is pre-existing and happens with the settled label too. At 320 px,
  "Checking…" (112 px) trims "Anthropic" for the 2–3 s it shows (gap 6).
- Accessible name, before: "Snapshot · Oct 2Snapshot · Oct 2 Saved snapshot of …"
  (1440 px) and "Oct 2Snapshot · Oct 2 …" (≤400 px). After: "Data source: saved snapshot from
  Oct 2" at every width. The description is the tip.
- Keyboard (e2e, server mode): Tab from the view switch reaches the badge, which has a visible
  outline. Enter opens the details (`aria-expanded=true`), and Escape closes them and returns
  focus to the badge.
- Dark mode: screenshots at 1440 and 390. Tokens are unchanged (`--ms-live`, `--ms-blue`).

### 5.4 State table

| State | Class | Label (≥1600 / 1021–1599 / 401–1020 / ≤400) | Dot | Popover sentence |
|---|---|---|---|---|
| Loading | is-loading | Loading | pulse 1 s, infinite | Fetching roles… |
| Snapshot, checking live | is-snapshot is-pending | Snapshot · Oct 2 · checking live… / Snapshot · checking live… / Checking live… / Checking… | pulse 1 s, infinite | Saved snapshot of Greenhouse / anthropic from Oct 2. Checking the live board now; the list updates by itself if it answers. |
| Live (settled) | is-live (+is-arrived for 1.5 s after a swap) | Live | steady, halo; one 1.2 s pulse on arrival | Fetched live from Greenhouse / anthropic · just now. |
| Snapshot, live failed | is-snapshot | Snapshot · Oct 2 (≤400: Oct 2) | steady | Saved snapshot of … from Oct 2. Live fetch failed: greenhouse/anthropic: HTTP 500. |
| Snapshot, quiet source (Lever CORS) | is-snapshot | Snapshot · Oct 2 | steady | Saved snapshot of Lever / palantir from Oct 2. |
| Snapshot, `live: false` (beta big tech) | is-snapshot | Snapshot · Oct 2 | steady | Saved snapshot of <Name> careers site from Oct 2. This board is collected by the site's crawler; your browser can't fetch it live. (no Refresh button) |
| Cached | is-cache | Cached · 5 min ago / … / Cached | steady | Served from a recent copy of …. Refresh to fetch live. |
| Demo, checking live | is-demo is-pending | Demo data · checking live… / Demo · checking live… / Checking live… / Checking… | pulse 1 s, infinite | Generated sample data, not real postings. Checking the live board now; … |
| Demo | is-demo | Demo data — live board unreachable / Demo data / Demo | steady | Generated sample data, not real postings. Error: … |
| Offline | is-error | Offline | steady | Couldn't load this board: … |
| Mock (localhost ?mock=1) | is-demo | Mock data / Mock | steady | Synthetic development data … |

### 5.5 Tests

- `test/e2e/badge.e2e.js`, 9 tests registered in `scripts/e2e.js`: live after the bundle, live
  first, HTTP 500 after the bundle, a quiet Lever failure, `live: false`, the swap keeping the
  user in place (3 loads), widths and dark mode, reduced motion, and server-mode Live with
  keyboard and name. Every settled state asserts no infinite and no running dot animation.
  - Against the fixed `dist/`: 9/9 pass.
  - Against the pre-fix build (a scratch copy pointed at `dist-now`): 0/8 static tests pass. The
    live-first test fails with "settled badge dot animates forever (pulse xinfinite)".
- `test/static-build.test.js`: `pending: true` on a bundle shown first; the failed live board
  settles the list through exactly one `onUpdate` (same `jobs`, `pending: false`, the HTTP 503
  reason); no `pending` without `onUpdate`; a quiet CORS failure settles with `error: null`; an
  abort never calls `onUpdate`. 14/14 pass.
- `npm test`: 578/579. The one failure is `test/perf.test.js` "review V15: cold /api/market does
  not block the event loop", which measured 156 ms of lag at load average ~6 from parallel
  agents. Rerun alone, it passes twice (81 and 91 ms). It does not touch these files.
- Full e2e (`npm run build`, then `node scripts/e2e.js`): **103/104 passed, 0 failed, 1
  skipped**. The skip is the opt-in "Methodology: screenshots" test (`E2E_SHOTS=1`, another
  workstream). All 9 "Badge:" tests are included.

Screenshots in `docs/screenshots/badge/`, named `<before|after>-<scenario>-<state>-<width>-<scheme>.png`:

- `loading`: the first paint;
- `late-pending` and `late-pending-popover`: snapshot shown, live still loading;
- `late-settled` and `late-popover`: Live;
- `fail-settled` and `fail-popover`: live board failed;
- `bundleonly-settled` and `bundleonly-popover`: `live: false`.

## 6. Known gaps and follow-ups

- **Contract (lead):** `docs/CONTRACT.md` should list the new static-mode result field: "`pending:
  true` when a bundled list is returned while the live board still loads (only with
  `onUpdate`); `onUpdate` is then called exactly once with the live result, or with the same
  list, `pending: false` and the failure in `error`." It is documented in the `public/api.js`
  header and the `getJobs` JSDoc.
- The 861 px top bar overflows by about 28 px in every state. This is pre-existing, and the
  search box is at its 100 px minimum.
- "New since your last visit" stores the snapshot's ids at the first apply (`markVisit` returns
  early on the upgrade). A role that only exists on the live board can show "New" again on the
  next visit if it has no `firstSeenAt`. Not changed here (markVisit's semantics are shared).
- Server mode is never pending: the server answers once. In this sandbox the server can't reach
  the boards, so the server-mode e2e test relabels its answer as live.
- The `#resultsTitle` mute relies on Chrome reading `aria-live` when it serializes the change
  (restored after 1 s). It was not tested with a real screen reader.

## 7. Change log

- 2026-10-10 08:3x: reproduced with the probe on the current build and on 2666ae1^; root cause
  confirmed (the old infinite Live pulse is now shown after a silent snapshot → live swap).
- 2026-10-10 08:5x: `pending` in api.js, with a single settling `onUpdate`; badge states, CSS
  motion rules, aria name and description, polite region, popover built in place.
- 2026-10-10 09:0x: pending label tiers for 861–1020 and ≤400 px after the width sweep. List
  scroll and card focus kept across the swap (also a pre-existing scroll reset under a focused
  card).
- 2026-10-10 09:2x: e2e badge suite (9) and unit tests (2 new, 1 updated); screenshots.
- 2026-10-10 09:5x: full e2e 103/104 (0 failed, 1 opt-in skip); `npm test` 578/579 (load-only
  perf flake, passes alone). Scratch worktree removed.

# Prompt: fix-touch-tips (verbatim, 2026-10-16)

You are the front-end and UI/UX engineer `fix-touch-tips` for melon-seek (repo /home/user/melon-seek, branch claude/stoic-ride-54ddxp), a zero-build vanilla ES-module app, "the Zillow of job postings". You are in your own git worktree. First run `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (head 32f556f or later). Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (UI simplicity budget), docs/process/PLAYBOOK.md (including "Checkpoints" and "Known traps"), docs/process/TEMPLATE.md and docs/process/ux.md.

**The user's bug report (2026-10-16), with a phone screenshot at /root/.claude/uploads/b6b764de-866b-5af7-92f3-f582ebca24d9/61bcad00-image.png (open it):**

> "There seems to be a UI/UX bug where the floating box don't go away on a mobile. Launch the agent to do a proper front end and ui/UX check and fix it."

**What the screenshot shows:**
- The page is the beta site on an iPhone (Safari, dark theme): an Amazon posting's drawer, "Same role elsewhere" section, with rows for NVIDIA, Apple, Google and Amazon.
- After a tap on the Apple row, a floating tooltip ("$281K median / middle half: $261K–$293K · approx USD / Apple / 15 postings / Click to see these roles") stays on screen over the section's text and the NVIDIA row, and does not go away.
- It says "Click" on a phone.

**The lead's first look at the cause:**
- public/viz/comps.js has its own tooltip. `pointermove` shows it, `pointerleave` and `blur` hide it, and `click` selects. With touch, a tap shows it and nothing reliably hides it: no tap outside, no scroll, no second tap, and no dismissal after the selection.
- The tooltip is positioned in viewport pixels (`translate(clientX, clientY)`), so it also floats in place when the drawer scrolls.
- The same hover-first pattern probably exists elsewhere. That is the "proper check" the user asks for, so cover all of them:
  - `createTooltip` in public/features/shared.js, used by public/features/comps.js (Compare companies) and public/features/insights.js;
  - the chart's tips in public/viz/chart.js (clusters, Ranges rows, strip);
  - the map's tips in public/viz/map.js;
  - the drawer's percentile strip;
  - any `title`-only or hover-only information in public/app.js.

**Your job:**
1. **Inventory.** List every floating box in the app: tooltip, popover or tip. For each one, record what opens it and what closes it with a mouse, a keyboard and touch. Check it at 390x844 and 360x740 (isMobile, hasTouch) in both themes, and at 1440x900.
2. **Reproduce with real touch input.**
   - Use CDP `Input.dispatchTouchEvent` (touchStart/touchEnd) through Playwright's CDP session. `page.tap()` and `synthesizeScrollGesture` don't behave like a phone in headless Chromium (PLAYBOOK, Known traps); validate your method on a control element first.
   - For scrolls, use touch drags or wheel at the same point.
   - Write a failing e2e test for each sticky box before you fix anything.
3. **Fix with one consistent touch rule for every floating box.** A suggested rule (refine it, then say what you chose and why):
   - A tap shows the tip, a second tap on the same item does its action, and a tap anywhere else, a scroll of the page or drawer, or the action itself closes it.
   - Or, where the tip only repeats what is on screen, a tap does the action directly and no tip is shown.
   - Wording follows the input: "Tap to see these roles" on touch, "Click to see these roles" with a mouse, nothing about clicking when the tip came from the keyboard.
   - A tip never stays in viewport pixels while its anchor scrolls away: it follows its anchor or closes.
   - Esc and blur keep working as now (D-8).
   - Prefer one small shared helper over five copies. If you change `createTooltip`, keep its API.
4. **Don't regress desktop:** hover tips, keyboard navigation, aria (aria-activedescendant, roles), focus rings, the Escape behaviour, and the drawer's own close.
5. **Screenshots:** before and after for each fixed box, phone and desktop, light and dark, in docs/screenshots/fix-touch-tips/, shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-touch-tips`.

**Data and build:**
- Today's crawl is at /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-data2/data/snapshots and .../wt-data2/data/beta/snapshots. Symlink them as data/snapshots and data/beta/snapshots in your worktree, and never commit them.
- Build with `node scripts/build-static.js` (your worktree's dist/ is yours) and serve with `node scripts/cycle/serve.mjs --dist dist --pid <scratch pidfile>`.
- Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules, Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never `playwright install`; no `pkill -f` / `pgrep -f`.
- Give every server, browser or test command a timeout, so nothing can hang. An earlier lane stalled for hours.

**Ownership:** you own only the tooltip, popover and tip open/close/position code and its CSS:
- public/viz/comps.js;
- public/features/shared.js (`createTooltip` and a new helper if needed);
- public/features/comps.js and public/features/insights.js;
- public/viz/chart.js and public/viz/map.js;
- public/app.js, tip handling only;
- public/styles.css, tip rules only.

Also yours:
- the NEW test/e2e/fix-touch-tips.e2e.js, registered in scripts/e2e.js like the others;
- a NEW test/fix-touch-tips.test.js if unit-testable;
- docs/process/fix-touch-tips.md, your log in TEMPLATE.md structure, with a `## State` section at the top;
- docs/process/prompts/fix-touch-tips.md, with this prompt pasted verbatim.

Five round-3 reviewers are reading the site right now and are not editing code.

**Rules:**
- Keep the UI simple: no new visible control. Use plain words.
- Commit small and often in your worktree with explicit paths ("WIP: …" is fine). Send the lead each finished, tested piece by SendMessage to "main" (SHA, what it fixes, tests), then keep going. The lead checkpoints your worktree every 15 minutes and integrates. Never push.
- Before you send any SHA:
  - run `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved OUT of data/, as CI runs it. S-6, PERF-1, V15 and T21 are load-sensitive; re-run them alone.
  - Run your e2e plus the full e2e suite with data linked: no new failures. Then `git checkout -- docs/screenshots` for any screenshots the suite rewrote outside yours.

Report:
- the inventory table: box, open/close before → after for mouse, keyboard and touch;
- the touch rule you chose;
- the tests, which fail before and pass after;
- SHAs and screenshots.

## Mid-task message from the lead (verbatim)

Lead: ux-review-beta-2 confirmed more hover-only and mouse-worded spots. They're in your scope (touch and mouse behaviour of floating info), so add them to your inventory and fix them under the same rule:
1. Drawer: "Keywords · click to filter" (app.js:4376). Use input-neutral wording, e.g. "Filter by a keyword".
2. Drawer Juice household buttons: the meaning ("Two adults, one earner, 2-bedroom home") is only in a `title`, which touch can't reach. Show one muted line under the buttons for the picked household. Keep it to one line (fix-density rule).
3. Drawer pay-label chips (app.js:4128 payLabels): each chip's meaning is in a `title` on a non-focusable span, so neither touch nor keyboard can reach it. Make the meaning reachable, e.g. the chip opens the caption's Details or the sentence is in that Details list. Keep MR-34's wording problem out; the fix wave does it.
4. Chart row labels (chart.js:1046-1049): the `title` says "Click to show all N roles" and holds the row's own basis caveat (`r.why`), which touch can't reach. Use "tap or click" wording and make the caveat reachable on touch.
5. Ranges legend item (chart.js:1553) `title` "hover a bar for each": change the wording.
6. Save-search `title` (app.js:2036) "click to remove": change it to "Press again to remove".
7. Map pin tooltip on a phone: a tap on a pin (Google, first pin) leaves a Leaflet tooltip at x 326–606 on a 390 px screen, 216 px off the right edge, and then the sheet rises over it. It must stay on screen and close by the same rule.
Screenshots are in the reviewer's worktree: /home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19/docs/screenshots/ux-review-beta-2/ (touch-*.png). Item 8 (Google's "grouped by job title" hover note) is MR-29; leave it to the fix wave.

## Second mid-task message from the lead (verbatim)

Lead: two more inputs from qa-mobile-beta-3, plus one testing requirement.
1. Map pin tooltip (map.js:851 `bindTooltip`): Leaflet opens it on a tap, it stays through a map pan, and it sits off screen. Google's Buenos Aires pin is at left −67 px (−147 px after a pan, 280 px wide); Apple's Cupertino pin spans 204–456 px on a 390 px screen; Apple's Auckland starts at −25 px. Most of it is under the half sheet the tap opens.
2. comps.js:207 and chart.js:1716/1719 listen to `pointermove` without filtering `pointerType === 'touch'`. Only features/shared.js:440 `createTooltip` filters it. A finger moving 2 px shows the tip while it is down.
3. IMPORTANT: in headless Chromium, `pointerleave` (touch) fires after the lift and hides the tip, so Chromium does NOT reproduce the iPhone stickiness the user saw in Safari. iOS Safari also sends emulated mouse events (mouseover/mousemove) after a tap, which leaves hover state "sticky". So your fix must not depend on pointerleave arriving, and it must ignore emulated mouse events right after a touch. Your e2e must also run on WebKit:
   - make your test file runnable with `--browser=webkit`, the way test/e2e/fix-company-scroll.e2e.js is;
   - add a step to .github/workflows/webkit-phone.yml (the "Playwright WebKit, iPhone profile" job) that runs it.
   You may edit that workflow for this one step. After I integrate, I dispatch webkit-phone.yml, which also has the iOS Simulator job with real taps, and report back.
Screenshots and probes are in /home/user/melon-seek/.claude/worktrees/agent-af67aa71fe3cb195d/docs/screenshots/qa-mobile-beta-3/ and /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/qa-mobile-beta-3/probes/.

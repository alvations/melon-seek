# Lead state (published to wip/LEAD-STATE.md on claude/stoic-ride-54ddxp at every checkpoint tick)

The user, 2026-10-24: "Make sure you autonomously resume if you got killed and is able to not keep redoing
work". Read this first after any stop (usage limit, killed session, restarted or new container). Update it
whenever a lane starts, reports, is integrated or is retired.

## Resume procedure (idempotent: every step skips what is already done)
1. `git fetch origin claude/stoic-ride-54ddxp`; read `wip/LEAD-STATE.md` (this file) and `docs/process/lead.md`'s last entry.
2. In-session checkpoint timer: if CronList shows none, recreate it (7,22,37,52 * * * *, the "Checkpoint tick" prompt that runs `bash $S/tick.sh`).
3. Same container (the worktrees below exist): for each lane with status `running`, check its transcript age
   (`bash $S/tick.sh --agents`). A lane stale for 20+ minutes and not reported done is resumed with
   SendMessage to its agent id ("resume from your log's State; your background processes died"). Never start a new
   agent for a lane whose agent id still resumes: SendMessage continues its own transcript, so nothing is redone.
4. New container (worktrees gone): `bash scripts/cycle/restore-wip.sh LANE DIR` restores each lane's wip/<lane>/ (commits,
   uncommitted diff, new files) into a fresh worktree. Relaunch the lane's agent with its saved prompt
   (docs/process/prompts/<lane>.md in its patches) plus: "You are resuming. Your work so far is restored in this
   worktree; read your log's `## State` and don't redo anything it lists as done."
5. Integration: `$S/pick.sh <worktree> <range>` skips commits already picked (it checks "cherry picked from commit").
   `scripts/cycle/safe-to-delete.sh` is read-only. Retire a lane only after it exits 0.
6. Then continue "Next steps" below.

## Wakers
- Durable: scheduled task trig_01V9kyxPXVY6unE6Y6eE3D4Q fires the "Resume tick" prompt into this session at :32 every hour; it survives container restarts and fires again once a usage limit resets. Delete it with delete_trigger when the cycle is finished.
- In-session: the 15-minute "Checkpoint tick" cron (7,22,37,52) runs `bash $S/tick.sh`; it dies with the session, and the resume tick recreates it.

## Usage pacing (the user, 2026-10-24: "Make sure you don't get interrupted by session or token limit")
- At most 3 agents run at once. Six or seven in parallel used up the 5-hour usage allowance in about 2 hours on 2026-10-23, and five did in about 2 h 15 min on 2026-10-24 (limit 02:45, reset 04:20).
- No lanes are paused (qa-ci-6 resumed 06:3x).
- After a usage-limit stop, resume only the `running` lanes. The paused ones stay paused.
- The lead keeps its own turns short: no polling loops, small outputs.
- The hourly resume task is the backstop if a limit still lands: it fires after the reset and resumes from this file.

## Machine rules (tell every new or relaunched agent)
- Economy: read files in parts, filter long output, don't re-run suites already run, poll every few minutes, skip the full e2e.
- Heavy jobs (build-static.js, npm test, e2e, perf probes) go through `bash $S/heavy.sh <cmd>` (flock, 3 slots machine-wide); timeouts inside it. Load 28 on 4 CPUs at 00:58 without it.
- Keep disk above 2 GB: agents drop stale builds; the lead retires lanes with safe-to-delete.sh.

## Paths
- S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad (scratch; lost if the container is reclaimed)
- Integration worktree $S/wt-int (lane lead-integration); checkpoint checkout $S/wt-ckpt; clean npm-test checkout $S/lead-clean
- Gate: `setsid nohup bash $S/gate.sh $S/wt-int > /dev/null 2>&1 & disown`, SHARDS=2; result in $S/gate/result
- Data: the 2026-10-16 crawl in $S/wt-data2 (archived on data-archive); `node scripts/cycle/local-data.js` rebuilds any date
- Lead notes for the next lead.md entry: $S/lead-notes-wave6.md (copied below under "Notes" at each tick)

## Lanes (fix wave 6; prompts in $S/prompts6/ and in each lane's docs/process/prompts/)
| Lane | Agent id | Worktree | Items | Status |
|---|---|---|---|---|
| fix-ui-6 | add67b9453342f4ba | .claude/worktrees/agent-add67b9453342f4ba | B-1..B-12 (layout, phone sizes, map fit); phase 2: implement ux-density-6's density spec and size matrix | running |
| fix-data-6 | a08f9659d62990db4 | .claude/worktrees/agent-a08f9659d62990db4 | G-1 (norm-14), G-2 bare country codes, G-3 Bayshore store and Monterrey N.L., T-19 P-2/D-11, C-1, K-1, P-1, P-2, P-3, R-1, R-2, R-3 | running |
| fix-app-6 | af65001c61c5e8b4f | .claude/worktrees/agent-af65001c61c5e8b4f | BN-1..BN-8 | done (42b2a59, integrated f13ebd6) |
| fix-salary-6 | a29d354058b1f01b7 | .claude/worktrees/agent-a29d354058b1f01b7 | S-1 multi-country pay (done 49e86ee, integrated); follow-up now: attachJuice reason regression, on 942db8a | done (b0795a2, integrated 94d65d0) |
| fix-juice-6 | aab76ab3a12b3f957 | .claude/worktrees/agent-aab76ab3a12b3f957 | J-1..J-5 | done (c3fc219, picked into wt-int 942db8a) |
| ux-density-6 | a8d30680c4dcc21d7 | .claude/worktrees/agent-a8d30680c4dcc21d7 | the user's 2026-10-24 iPhone mini request: size matrix (visible viewports, Pro Max, iPads, Duo) and a per-size density spec for fix-ui-6; no product code | done (61747f8; picked into wt-int) |
| qa-ci-6 | a6d5736b954b39411 | .claude/worktrees/agent-a6d5736b954b39411 | the 12 CI e2e failures and 25 skips (run 40024210372) | done (1dde1eb, integrated 505a4df) |

Done and retired (do not relaunch): fix-phone-sizes, fix-qa4, fix-mr-3, qa-suite-beta, fix-viz-5 (batch 3, e800c43);
persona-beta-2-18-24, -25-34, -35-44, -45-54, -55-plus (logs on the branch, 5502155).

## Next steps
0. Integration branch $S/wt-int is at 505a4df (fix-salary-6, fix-ui-6 B-1..B-12, fix-juice-6, fix-app-6, qa-ci-6). Gate started 08:16 (SHARDS=2, detached; result in $S/gate/result). If it passes: push, check CI/Pages/WebKit/e2e.yml. Still to come: fix-data-6 (incl. P-4), fix-ui-6 D-1..D-14, then a second gate. (fix-salary-6, the UX docs, fix-ui-6 B-1..B-12, fix-juice-6; one app.js conflict resolved in locSummary: J-5 order then B-1's coloured key), not pushed: it waits for the gate. fix-ui-6 is on phase 2 (D-1..D-14). fix-data-6, fix-app-6, fix-ui-6 and fix-juice-6 were told to rebase onto it.
1. Integrate each lane's SHAs as they report (pick.sh into $S/wt-int); after fix-data-6 and fix-salary-6 are both in,
   re-baseline the golden file once for norm-14 with the tooling.
2. Gate (SHARDS=2) on the integrated head; fix what it finds; npm test; push; check CI, Pages, WebKit (dispatch
   webkit-phone.yml) and e2e.yml (dispatch) on the pushed head.
3. Final mobile and desktop QA re-check on the wave-6 deploy, every size in test/e2e/phone-sizes.mjs (task #25).
4. Lead log entry for fix wave 6 in docs/process/lead.md from the notes.
5. Backlog for the user (features): own-currency Juice, more households, all-company search, "within N km", Amazon speed.

## Notes
(see $S/lead-notes-wave6.md; appended at each tick)

### Lead notes so far ($S/lead-notes-wave6.md)
# Lead notes for the fix wave 6 entry in lead.md
- 21:10 safe-to-delete.sh: fix-phone-sizes c938f0a, fix-qa4 67ef8e4, qa-suite-beta 444101a safe; fix-mr-3 had one untracked e2e screenshot (fix-pay-at-place e2e-card-720x1114.png, identical md5 in wt-int) -> committed 60b5925.
- 00bd52c: wip/ of the four retired; npm test 1,308 / 1,298 pass / 0 fail / 10 skipped on 00bd52c (clean checkout). Pushed 21:11.
- e800c43: CI success, Pages deploy 40024199871 success (21:10). Branch builds (pages-build-deployment) fail at Jekyll as before, no effect.
- Launched fix-ui-6 (B-1..B-7) and fix-data-6 (G-1, T-19 P-2/D-11, C-1) at 21:11; prompts in $S/prompts6.
- Disk 90% (4.0 GB free): removed build folders only: dist/ of the retired fix-mr-3 and fix-qa4 worktrees, qa-suite-beta's scratch dist and dist433, fqa4's dist-before. 5.4 GB free after.
- 21:2x persona-beta-2-45-54 fix-now #1 (0% bonus target shown as bonus, 50 Google postings) -> fix-data-6 as K-1.
- persona-beta-2-25-34 PB2-1 (US filter: 'Pay posted for the US only' for a one-place salary.places posting; 537 postings) -> fix-data-6 as P-1.
- persona-beta-2-18-24 BN-1 (Location counts with a pay minimum and a place) and BN-2 (bare $ median over one foreign currency) -> new lane fix-app-6 (launched 21:3x, prompts6/fix-app-6.txt).
- 21:3x WebKit run 40024207616: build ok, phone smoke WebKit+Chromium ok, phone tests ok, company sheet ok; iOS Simulator in progress. e2e.yml run 40024210372 (first sharded CI run): build ok, 4 shards running.
- persona-beta-2-45-54 fix-now #2 (de-DE stats line '3.821 3.821 roles') -> fix-app-6 as BN-3, with a locale sweep.
- persona-beta-2-25-34 PB2-2 (part-time view's median annualised as 'posted pay') -> fix-app-6 as BN-4; PB2-3 (Amazon warehouse associates in Customer support with TAMs) -> fix-data-6 as R-1.
- persona-beta-2-55-plus fix-now #1 (places set aside on a company switch lost on the next tick; settleKeep) -> fix-app-6 as BN-5.
- persona-beta-2-35-44 PB-1 (pay floor hides 'from €X' minimum postings, note undercounts) -> fix-app-6 as BN-6; PB-2 (drawer rounds posted yearly pay; 16,174 of 20,261 not whole thousands) -> fix-data-6 as P-2. No 4th lane: disk 3.5 GB free.
- BN-3 confirmed by persona-beta-2-18-24 (de-CH, pl-PL) -> fix-app-6. P-1 confirmed by persona-beta-2-45-54 (apple:200609322-0157 Austin, amazon:10373614) -> fix-data-6.
- 21:4x disk 91% (3.5 GB): safe-to-delete over 16 inactive worktrees (/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/safe-old-lanes.txt). Removed 7 that passed every check (fix-phone-sizes, fix-viz-5, qa-desktop-beta-4, fix-qa4, qa-mobile-beta-4, qa-suite-beta, fix-mr-3; fix-mr-3's stray e2e screenshot was the same blob as on the branch, e862bc3). 6.0 GB free after. Nine older lanes fail only the checkpoint check (they predate it): amazon-meta-backend, fix4-viz, amazon-meta-data, fix5-data, qa-desktop-beta-3, methodology-review-beta-2, incremental-crawl, fix-company-scroll, qa-mobile-beta-3. Kept for now.
- persona-beta-2-55-plus fix-now #2 (Microsoft 'Director' titles filed Staff+/Manager by VT-8 with no word; M5/M6 span takes the lower level) -> fix-app-6 as BN-7 (wording, posted level on the chip, span matches either level). VT-8 itself stands.
- persona-beta-2-25-34 PB2-4 (Amazon hourly 'Lead Associate' filed Senior; 126 US Senior under $60K) -> fix-data-6 as R-2.
- persona-beta-2-25-34 done 22:0x (picked, ba2f1ca); persona-beta-2-35-44 done 21:5x (picked, 2b3eb10). Improve lists in $S/persona2-improve.md.
- To fix-ui-6: B-8 Duo spanned hinge (search box, chart), B-9 Razr cover (saved searches off screen, toast over pay), B-10 few roles half-empty screen / blank chart, B-11 arrival line. To fix-data-6: '+ 100% bonus target' folded into K-1.
- persona-beta-2-45-54 fix-now #4 (High: Google multi-country pay lines, one kept, others dropped; 13/13) -> new lane fix-salary-6 (S-1), launched 21:5x; shares norm-14 with fix-data-6; lead re-baselines golden after both.
- persona-beta-2-18-24 BN-4 (Meta data-centre SMEs filed AI tutors; Asset Mgmt Ops Mgr filed IT; 2,332 Amazon ops postings with no family) -> fix-data-6 as R-3, with R-1.
- 21:56 persona-beta-2-35-44 and -25-34: safe-to-delete passed (checkpoint fd9da2f); dropped from ckpt-lanes; worktrees removed. Logs pushed in dbf4349 (npm test 1,308/1,298/0 fail).
- persona-beta-2-55-plus done 22:0x; picked 50d58c9. Improve #10 (place counts include country-wide postings, Palmetto 297 from 3) -> fix-app-6 with BN-1.
- 22:0x launched fix-juice-6 (J-1 tax row names outside the US, 3 of 5 groups; J-2 one-earner wording; J-3 Monthly resets to Yearly, 5/5 and wave-1 I7; J-4 jargon tips). Prompt prompts6/fix-juice-6.txt.
- 22:1x all five persona wave-2 reviewers done; logs picked onto wt-int (35-44 2b3eb10.., 25-34 ba2f1ca.., 55-plus 50d58c9.., 18-24 2d44256.., 45-54 f8bb453..); only persona files.
- e2e.yml first CI run 40024210372 on e800c43: shards green (exit ignored), summary red: 953 tests, 916 pass, 12 fail (0 expected), 25 skip, 94 min test time, ~33 min wall. CI data = newest data-archive state (~10-23), local gate = 10-16 crawl. Pages deploys crawl fresh, so live data ~ CI's. Launched qa-ci-6 to classify (a) pinned to 10-16 / (b) new data shape bug / (c) CI-only.
- Archive workflow healthy (runs 182-186 success on every push); the local origin/data-archive was stale because a fetch timed out.
- Disk 91% (3.7 GB): saved qa-suite-beta/patchwt's diff (patchwt-final-8e08770.diff, 1,060 lines), then removed retired lanes' scratch worktrees (fmr3/clean, fqa4/clean, fv5/clean, qa-suite-beta/clean and patchwt, wt-base, wt-push, wt-pushchk; each clean or saved, heads on the branch or in their lanes' branches) and copies (fqa4 base/base2 and tars, qa-suite-beta src-433aa59 and applycheck). 7.7 GB free.
- Cross-group Improve items routed (misrepresentation or size bugs): P-3 hourly posted first on full-time hourly cards (fix-data-6); BN-8 keep the typed currency in chip/link/saved name, read "zł" and spaced thousands (fix-app-6); B-12 phone first screen shows no job card (fix-ui-6); J-5 card Juice grade names its place (fix-juice-6).
- Backlog for the user (features, not fixes; raised across groups): Juice in the person's own currency and terms (5/5 in 3 groups); more households (second earner, single parent, room in a shared flat); search all companies at once / say where else a search matches; "within N km" and states/provinces/counties as places ("IL" matches Israel); Juice proxies for suburbs; Amazon board speed on phones (2.3-7 s); rank against the same level; keyword tags that don't fit (FP&A on an AE); separate title from description matches; Compare companies at Manager+/Director+ shows one company; Pay estimates from very weak matches; part-time / 4-day week filter; saved searches across devices.
- 00:3x container restart (~00:23 UTC) after all six agents stopped on the session limit (reset 23:00). Checkpoint 7c96219 saved them; persona logs pushed 5502155 (npm test 1,308/1,298/0 fail on 6097ebf); cron recreated (4dc7b5e5); six agents resumed by message. Persona worktrees 18-24, 45-54, 55-plus (checkpoint 7c96219) and 25-34 (stale lock from the dead pid 133, unlocked) removed after safe-to-delete.
- fix-salary-6 census (10-16 crawl): Google 35 postings 2+ countries, 63 lines not stored; Microsoft 35 national multi-country (62 lines) + 976 US postings whose other area's range isn't stored; main-site Cohere/OpenAI/Scale rows stored but tied to no place; Nordic weak 'kr' read as the first country's (DKK as SEK). Lead decision: unlisted lines go in salary.unlisted (CSV, not card/payAt/Juice) AND the drawer shows them as posted ('also posted for ...'). WebKit run 12 on e800c43: success.
- 00:4x resume safety: lead state file $S/lead-state.md published to wip/LEAD-STATE.md by $S/tick.sh at every tick; durable hourly resume task trig_01V9kyxPXVY6unE6Y6eE3D4Q (:32); in-session cron d821b313 runs tick.sh; PLAYBOOK Checkpoints step 7 added.
- qa-ci-6 b-1 (CI failure 3): bare ISO codes from Eightfold boards filed as US states (microsoft:1970393557021098 AL=Albania -> Alabama; also ME, MD, MT, PA, GA, MA, MN, SC, VA, NE; LA -> Los Angeles) -> fix-data-6 as G-2. Test stays red, no expected-red entry.
- 00:4x the user (iPhone mini screenshots): 'charts and view way too noisy ... information scales per phone/iPad size from iPhone mini to iPhone 18 Pro Max or Duo'. Launched ux-density-6 (size matrix with visible viewports + iPads + Pro Max; per-size density spec with checks; mockups); fix-ui-6 phase 2 implements it. User's mini: 375x812, page gets ~375x625 with browser bars; first screen shows no job. qa-ci-6 b-2 (Bayshore Shopping Centre store as a place) and Monterrey N.L. -> fix-data-6 G-3.
- 01:0x load 28 on 4 CPUs (5-6 builds + npm tests + e2e at once): added $S/heavy.sh (flock queue, 3 heavy slots) and told all seven agents to wrap builds, npm test, e2e and probes in it, and to drop their stale builds. Disk 91% (3.6 GB): checkpointed the nine pre-checkpoint lanes (40608b6), safe-to-delete passed for all nine, worktrees removed (amazon-meta-backend, fix4-viz, amazon-meta-data, fix5-data, qa-desktop-beta-3, methodology-review-beta-2, incremental-crawl, fix-company-scroll, qa-mobile-beta-3).
- 01:0x the user: 'Make sure you don't get interrupted by session or token limit'. Paced: at most 5 agents at once; fix-juice-6 and qa-ci-6 paused at a safe point (resume order qa-ci-6, fix-juice-6, one per finished lane); economy rules sent to the five running. Hourly resume task stays as the backstop.
- 01:1x fix-juice-6 paused at c4c84ab: J-1..J-5 fixed with red tests (unit 4/9, e2e 16/16 red on base); Juice/tax unit tests unchanged; next: rebuild via heavy.sh, e2e green, related groups, screenshots, send SHA.
- 01:1x qa-ci-6 paused at 5f24b37 (2c5eecd WIP test fixes not yet run: don't integrate). Classified: (a) pinned to 10-16, tests fixed WIP: fix3-data, D-41, MR-34, UX-59, Duo strip, 21 D-50 skips, BP-10 skip; (b) b-1, b-2 (+Monterrey) sent; (c) CI-only: UI badge (CI server fetched live boards -> MELON_OFFLINE default in harness), [cuts], 280 phone-text guard, razr landscape pass on CI's data here, suspect CI Chromium 153 vs 141 here -> pin Playwright 1.56.1 in e2e.yml; open: Badge swap. Step 4 WIP: per-shard verdict, summary fails on stopped runs and over --max-skips.
- 01:2x ux-density-6 spec (43ddac0): before, 0 of 104 (26 phone sizes x 4 boards) show a job on the first screen; at 375x625 first title 45 px below. Visible viewports: Chrome iOS smallest (SE 375x544, mini 375x625, 17 Pro Max 440x757; iPads with Mac UA). Lead decision: ALL_SIZES = PHONES+POSTURES+TABLETS (31); VISIBLE (21) for first-screen/density checks and phone-smoke. Forwarded D-1..D-14 to fix-ui-6 phase 2.
- 01:3x ux-density-6 done (61747f8): mockups 375x625/440x757/1114x616/820x1070; after on Apple: card's title+pay everywhere, median once, rows mini 2->4, 13/14 2->5, SE 0->2; Duo spanned chart screen compact. Picked into wt-int. qa-ci-6 resumed.
- ux-density-6 final: the user's screenshot is Chrome iOS (page 375x625; bars never collapse since the page doesn't scroll on phones). Ownership: fix-ui-6 owns chart.js row drawing for D-4/D-5; fix-app-6 keeps the caption/stats wording (one shared function), fix-ui-6 decides placement. Caveats: Android/Duo/iPad heights estimated; WebKit/iOS 26 untested (webkit-phone.yml covers WebKit after integration).
- 01:5x UX docs pushed a0763ec (npm test 1,308/1,298/0 fail); ux-density-6 safe-to-delete passed (checkpoint da4790c), dropped from ckpt-lanes, worktree removed.
- 02:0x fix-salary-6 done (49e86ee): S-1 every country/area line a salary.ranges row; unlisted in salary.unlisted (drawer Details + CSV); kr/$ by line's country (15 MS rows); main-site rows tied to places (Cohere 122/183, OpenAI 11/18, Scale 38/42); Google 62 dropped lines -> 0, MS 58 -> 0, 1,083 unlisted-area lines kept; nothing dropped (paid 28,176 -> 28,176; rows 6,673 -> 6,843, 0 lost); norm-14 golden 0/300 changed; npm test 1,328/0 fail; MS list 158 -> 174 KB gz. Picked into wt-int e77cd41 clean. Others told to rebase onto it; fix-juice-6 resumed.
- fix-salary-6 final ad2cb71 (log State only) picked. Notes: cards round €41,500 to '€42K' (drawer keeps hundreds) - UI choice; OpenAI Zone A/B rows stay untied; lead re-baselines norm-14 after fix-data-6 lands.
- 02:45 all five agents stopped on the usage limit (reset 04:20); container restarted ~04:33. 04:35 checkpoint 6582da0; cron recreated; pacing cut to 3 at once: resumed fix-data-6, fix-juice-6 (both near done) and fix-ui-6; fix-app-6 then qa-ci-6 wait.
- 05:0x disk 90% (4.2 GB): removed 2,783 test temp dirs in /tmp older than 60 min (melon-refresh-apply 920, melon-beta-sec 703, melon-incr, melon-sync, melon-serve, melon-safe, ... ; ~3.8 GB; none a git worktree; kept /tmp/melon-ckpt).
- tick.sh now clears /tmp/melon-* older than 120 min. Backlog: tests should remove their own mkdtemp folders (t.after cleanup).
- 05:1x fix-ui-6 B-1..B-12 green (rebased onto e77cd41, tip f6fa155): fix-ui-6 129/129; related 589/593 then 75/76 after follow-ups (7e19e64: B-9 only saved searches with new roles stay in view on the cover screen; B-11 beta line 12 words 'Job postings, their posted pay, and what's left after tax and rent'; B-12 scroll-padding-top = sticky axis); npm test 1,328/0 fail; matrix 60/60, smoke 147/147; first visible card on throttled Pixel 8 median 2.44 s (load 7). Picked 13 commits into wt-int -> b68f237 clean. Open for fix-app-6: Razr cover map V-44 'N postings list no place' line covers Meta's pins.
- 05:2x fix-juice-6 done (c3fc219; npm test 1,337/0 fail; Juice/tax units 84/84 unchanged; J-5 reversed: the card names the graded place first, accepted). Picked into wt-int -> 942db8a with one app.js conflict in locSummary resolved (J-5 ordering, then B-1's coloured key first). Regression from S-1 (fix3-data browser lib/juice.js: Cohere London, attachJuice gives no reason) sent back to fix-salary-6 (resumed, on 942db8a).
- 05:2x fix-salary-6 follow-up b0795a2 (attachJuice gives 'pay-other-country' again when tied rows have no city and every listed city is another country; Cohere 67 with Juice, 2 CA$ London give the reason; npm test 1,338/0 fail) picked -> 94d65d0. fix-app-6 resumed on 94d65d0 (plus V-44 Razr cover map line).
- 06:3x fix-app-6 done (42b2a59, 28 commits on 94d65d0): BN-1 counts per place (Dublin 2->137; Vancouver 22->178, Seattle 3,668; 'Palmetto 3 +294'); BN-2 median in the pay's currency, one wording function chart.js medianWording; BN-3 once in every locale; BN-4 hourly median; BN-5 set-aside places survive; BN-6 minimums survive a floor (Milan 54->84, EU 185->313); BN-7 two-level postings count under both (MS 102, NVIDIA 51), chip 'Manager · Microsoft M5–M6'; BN-8 typed currency kept (smin+sc), zł and grouped thousands; V-44 short maps '9 with no place'. npm test 1,359/0 fail. Picked clean -> f13ebd6. qa-ci-6 resumed on f13ebd6.
- fix-app-6 final report: known gaps: chart row medians still US$ with a country label (sent to fix-ui-6 for D-5); one-level Microsoft chips name the posted level only after the posting text loads. Pre-rebase states kept as branches fix-app-6-pre-rebase(2).
- 07:2x qa-ci-6 on f13ebd6: BP-2 fails (google:108135834237969094 under Zurich: card 'Pay posted for San Jose, Munich and 2 more only' is right with rows per country; features/shared.js payLocations still returns only US places). Decision: payLocations follows the rows -> fix-data-6 P-4 (updates BP-2's expectation). qa-ci-6 a5bdbc9: D-41 counts state-wide roles (BN-1), V-43 reads pins in any currency.
- 07:5x fix-ui-6: the iPad Pro 11" portrait touch-tips strip failure is the 2 px bar case (half-pixel offset after the one-row top bar moved the strip up 86 px; the touch lands on the axis); qa-ci-6's a5bdbc9 tallest-bar pick fixes it. Not a D-4 regression.
- 08:1x qa-ci-6 done (1dde1eb; 9 commits on f13ebd6): (a) case fixes from the data (Badge swap biggest cluster, fix3-data Head of, D-41, MR-34, D-50 x21, BP-10+BN-5, UX-59, touch-tip tallest bars, V-43 any currency); (c) harness MELON_OFFLINE=1, e2e.yml pins Playwright 1.56.1 (Chromium 141); step 4 per-shard verdict, summary fails on stopped runs and over --max-skips. npm test 1,359/0 fail; 10-16 data 371/374 0 fail; newest 3 red awaiting fix-data-6 (fix-pay-data, D-32, BP-2/P-4). Picked clean -> 505a4df. Gate started 08:16 on 505a4df, SHARDS=2.

### Agents at 2026-10-24T08:43:53Z
agent fix-ui-6 add67b9453342f4ba transcript-age=54min head=5e2c252 STALE
agent fix-data-6 a08f9659d62990db4 transcript-age=9min head=6963435

# Prompt: salary vetting of the beta boards

The prompt below was given verbatim to the salary-vetting agent on 2026-10-11 (stage 1 of the
improvement cycle on the beta site, docs/process/PLAYBOOK.md). There were no follow-up messages.

---

**Where to work (the lead's note for this run, 2026-10-11).** Work in the worktree /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-s1, not in /home/user/melon-seek. It is checked out at 6f69079: fix wave 3 integrated (the data, compare and app lanes; the chart and map lane lands later). Its data/snapshots and data/beta/snapshots link to today's rebuild from the data-archive branch (every board observed 2026-10-11 between 06:38 and 08:00 UTC: Apple 4,875 postings, Google 3,417, NVIDIA 2,663, Microsoft 2,279, Netflix 457, Anduril 2,491). Every repository path below is relative to that worktree, and your files go there; the lead copies them into the next commit. Don't touch the shared checkout. Other agents run at the same time on a 4-CPU machine, so run heavy steps one at a time.

This is the first salary vetting of the beta boards (the main site's is data/vetting/2026-10-02/). Use seed 20261011 for the sample.

You are the salary data-vetting reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": it plots company job-board postings by salary, so one wrong salary misleads every job seeker who sees it. Read docs/VETTING.md (all of it: fields, parser rules, the runtime gate in server/vet.js, scan flags, the review rubric, running it, the audit files and limits), docs/process/vetting.md (how the first vetting was done, with its prompt in docs/process/prompts/vetting.md), data/vetting/2026-10-02/summary.md, docs/CONTRACT.md, docs/DATA_SOURCES.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** vet every salary that target `beta` publishes, for Apple, Microsoft, Google, NVIDIA and Netflix, plus Anduril from the main site for comparison, with the same method as the first vetting, and keep the audit trail. You are the LLM reviewer: you read each source excerpt and decide. The data is the latest real snapshot in `data/beta/snapshots/` (the main-site boards are in `data/snapshots/`); don't commit snapshots. Do not edit product code. You own:
- data/vetting/2026-10-11-beta/** (flags, sample, verdicts, review rules, summary; commit-sized excerpts only);
- docs/process/vetting-beta.md (your log) and docs/process/prompts/vetting-beta.md (paste this prompt verbatim);
- a NEW test file, test/beta-vetting.test.js: each parser or gate bug you find becomes a failing test against a short excerpt copied from the real posting (never a whole snapshot);
- suggested changes to docs/VETTING.md or test/fixtures/real-salary-cases.json as patches in docs/process/patches/vetting-beta-<name>.diff.
Don't commit and never push.

**Steps:**
1. **Scan.** `node scripts/vet-salaries.js <the target's snapshot files> --date 2026-10-11-beta --sample 25 --seed <a seed you record>`. Record per-company counts of each flag, blocking count and the exit code. Run it with `--no-gate` too, and report how many salaries the gate quarantines per company.
2. **Review every flagged job and the seeded sample.** For each, read the excerpt and the posting's description text, and record a verdict line in `verdicts.jsonl` with the schema in docs/VETTING.md §7 (verdict correct, parser_bug or source_ambiguous; the corrected salary or null; kind; a short evidence quote that is an exact substring of the source; reviewer "claude via Claude Code"; reviewed_at; parser_version). Write as you go so the trail survives an interruption. Group repeated patterns in `review-rules.mjs` as the first vetting did.
3. **Big-tech specifics.** Check these by hand and count them:
   - ranges that span several levels in one posting (is max/min > 3 flagged, quarantined, or shown with an honest label?);
   - pay listed for several places or countries (does the parsed salary belong to the posting's place?);
   - on-target earnings, bonus and equity wording; hourly, monthly, fixed-term and part-time pay; currency after the number; non-US currencies and their conversion;
   - postings with pay words but no parsed salary (missed pay), and postings the gate quarantined wrongly (false positives): give the rate per company;
   - the "level" fields the boards provide versus our seniority.
4. **Runtime gate.** Are the thresholds in server/vet.js right for big-tech pay? Compute the false-positive and false-negative rates on your reviewed set, and if a threshold should change, say which, to what, and show the before/after counts (run on a copy; don't edit server/vet.js).
5. **CI.** Does the deploy that publishes `beta` run the vetting gate over its snapshots? Read .github/workflows/* and say which step does, or give the exact step to add.
6. **Summary.** data/vetting/2026-10-11-beta/summary.md: counts before and after review, bug classes with counts and examples, the gate's error rates, decisions and open questions.

For every finding give an ID (VT-n), a severity (Critical: an implausible or wrong salary is published; High: a misleading label or a wrong currency; Medium: missed pay; Low: wording), the company, posting id and URL, the source words, expected vs actual, the share of postings affected and the owning file and function. Run `npm test`. Report back with the bug classes and counts, the gate's error rates, and a one-line verdict per company: trustworthy, usable with caveats, or not ready.

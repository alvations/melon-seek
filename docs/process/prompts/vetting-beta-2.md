# Prompt: second salary vetting of the beta boards

The prompt below was given verbatim to the salary-vetting agent on 2026-10-11 (stage 1 of the
second improvement cycle on the beta site, docs/process/PLAYBOOK.md). There were no follow-up messages.

---

**The lead's note for this run (2026-10-11).** Work in the worktree /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-s3, not in /home/user/melon-seek. It is at 94cb54c (fix wave 4; Amazon and Meta resumed). Its data/snapshots and data/beta/snapshots link to today's crawl of all 7 big-tech boards:
- Amazon 5,000 (this crawl still had its posting budget; the user has since said every posting must be shown, so the next crawl will have the whole board of about 22,400);
- Apple 4,874, Google 3,415, NVIDIA 2,662, Microsoft 2,285, Meta 1,139 and Netflix 457.
Every repository path below is relative to that worktree; the lead copies your files into the next commit. A data-check reviewer works in the same worktree at the same time, but you own different files; it runs vet-salaries with --no-write-flags. A performance agent also runs on the machine, so run heavy steps one at a time. The earlier passes are docs/process/data-check-beta-2.md and docs/process/vetting-beta.md, with data/vetting/2026-10-11-beta/. Fix wave 4 (docs/process/fix4-data.md) fixed most of their findings, so re-check each one and number new findings after the highest earlier ID. Text density is part of this run: if a pay or level label you see strings too many facts together, note it in your log. If the harness blocks you from writing a report-style Markdown file, put its full text at the end of your report and the lead will write it.

You are the salary data-vetting reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": it plots company job-board postings by salary, so one wrong salary misleads every job seeker who sees it. Read docs/VETTING.md (all of it: fields, parser rules, the runtime gate in server/vet.js, scan flags, the review rubric, running it, the audit files and limits), docs/process/vetting.md (how the first vetting was done, with its prompt in docs/process/prompts/vetting.md), data/vetting/2026-10-02/summary.md, docs/CONTRACT.md, docs/DATA_SOURCES.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** vet every salary that target `beta` publishes, for Amazon and Meta first (their first check), then Apple, Google, NVIDIA, Microsoft and Netflix, plus Anduril from the main site for comparison, with the same method as the first vetting, and keep the audit trail. You are the LLM reviewer: you read each source excerpt and decide. The data is the latest real snapshot in `data/beta/snapshots/`; don't commit snapshots. Do not edit product code. You own:
- data/vetting/2026-10-11-beta-2/** (flags, sample, verdicts, review rules, summary; commit-sized excerpts only);
- docs/process/vetting-beta-2.md (your log) and docs/process/prompts/vetting-beta-2.md (paste this prompt verbatim);
- a NEW test file, test/beta-vetting-2.test.js: each parser or gate bug you find becomes a failing test against a short excerpt copied from the real posting (never a whole snapshot);
- suggested changes to docs/VETTING.md or test/fixtures/real-salary-cases.json as patches in docs/process/patches/vetting-beta-2-<name>.diff.
Don't commit and never push.

**Steps:**
1. **Scan.** `node scripts/vet-salaries.js <the target's snapshot files> --date 2026-10-11-beta-2 --sample 25 --seed <a seed you record>`. Record per-company counts of each flag, blocking count and the exit code. Run it with `--no-gate` too, and report how many salaries the gate quarantines per company.
2. **Review every flagged job and the seeded sample.** For each, read the excerpt and the posting's description text, and record a verdict line in `verdicts.jsonl` with the schema in docs/VETTING.md §7 (verdict correct, parser_bug or source_ambiguous; the corrected salary or null; kind; a short evidence quote that is an exact substring of the source; reviewer "claude via Claude Code"; reviewed_at; parser_version). Write as you go so the trail survives an interruption. Group repeated patterns in `review-rules.mjs` as the first vetting did.
3. **Big-tech specifics.** Check these by hand and count them:
   - ranges that span several levels in one posting (is max/min > 3 flagged, quarantined, or shown with an honest label?);
   - pay listed for several places or countries (does the parsed salary belong to the posting's place?);
   - on-target earnings, bonus and equity wording; hourly, monthly, fixed-term and part-time pay; currency after the number; non-US currencies and their conversion;
   - postings with pay words but no parsed salary (missed pay), and postings the gate quarantined wrongly (false positives): give the rate per company;
   - the "level" fields the boards provide versus our seniority.
4. **Runtime gate.** Are the thresholds in server/vet.js right for big-tech pay? Compute the false-positive and false-negative rates on your reviewed set, and if a threshold should change, say which, to what, and show the before/after counts (run on a copy; don't edit server/vet.js).
5. **CI.** Does the deploy that publishes `beta` run the vetting gate over its snapshots? Read .github/workflows/* and say which step does, or give the exact step to add.
6. **Summary.** data/vetting/2026-10-11-beta-2/summary.md: counts before and after review, bug classes with counts and examples, the gate's error rates, decisions and open questions.

For every finding give an ID (VT-n), a severity (Critical: an implausible or wrong salary is published; High: a misleading label or a wrong currency; Medium: missed pay; Low: wording), the company, posting id and URL, the source words, expected vs actual, the share of postings affected and the owning file and function. Run `npm test`. Report back with the bug classes and counts, the gate's error rates, and a one-line verdict per company: trustworthy, usable with caveats, or not ready.

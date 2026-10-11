You are the salary data-vetting reviewer for melon-seek (/home/user/melon-seek), "the Zillow of job postings": it plots company job-board postings by salary, so one wrong salary misleads every job seeker who sees it. Read docs/VETTING.md (all of it: fields, parser rules, the runtime gate in server/vet.js, scan flags, the review rubric, running it, the audit files and limits), docs/process/vetting.md (how the first vetting was done, with its prompt in docs/process/prompts/vetting.md), data/vetting/2026-10-02/summary.md, docs/CONTRACT.md, docs/DATA_SOURCES.md, docs/process/PLAYBOOK.md and docs/process/TEMPLATE.md.

**Your job:** vet every salary that target `<TARGET>` publishes, for <COMPANIES>, with the same method as the first vetting, and keep the audit trail. You are the LLM reviewer: you read each source excerpt and decide. The data is the latest real snapshot in `<DATA>`; don't commit snapshots. Do not edit product code. You own:
- data/vetting/<DATE>-<TARGET>/** (flags, sample, verdicts, review rules, summary; commit-sized excerpts only);
- docs/process/<ROLE>.md (your log) and docs/process/prompts/<ROLE>.md (paste this prompt verbatim);
- a NEW test file, test/<TARGET>-vetting.test.js: each parser or gate bug you find becomes a failing test against a short excerpt copied from the real posting (never a whole snapshot);
- suggested changes to docs/VETTING.md or test/fixtures/real-salary-cases.json as patches in docs/process/patches/<ROLE>-<name>.diff.
Don't commit and never push.

**Steps:**
1. **Scan.** `node scripts/vet-salaries.js <the target's snapshot files> --date <DATE>-<TARGET> --sample 25 --seed <a seed you record>`. Record per-company counts of each flag, blocking count and the exit code. Run it with `--no-gate` too, and report how many salaries the gate quarantines per company.
2. **Review every flagged job and the seeded sample.** For each, read the excerpt and the posting's description text, and record a verdict line in `verdicts.jsonl` with the schema in docs/VETTING.md §7 (verdict correct, parser_bug or source_ambiguous; the corrected salary or null; kind; a short evidence quote that is an exact substring of the source; reviewer "claude via Claude Code"; reviewed_at; parser_version). Write as you go so the trail survives an interruption. Group repeated patterns in `review-rules.mjs` as the first vetting did.
3. **Big-tech specifics.** Check these by hand and count them:
   - ranges that span several levels in one posting (is max/min > 3 flagged, quarantined, or shown with an honest label?);
   - pay listed for several places or countries (does the parsed salary belong to the posting's place?);
   - on-target earnings, bonus and equity wording; hourly, monthly, fixed-term and part-time pay; currency after the number; non-US currencies and their conversion;
   - postings with pay words but no parsed salary (missed pay), and postings the gate quarantined wrongly (false positives): give the rate per company;
   - the "level" fields the boards provide versus our seniority.
4. **Runtime gate.** Are the thresholds in server/vet.js right for big-tech pay? Compute the false-positive and false-negative rates on your reviewed set, and if a threshold should change, say which, to what, and show the before/after counts (run on a copy; don't edit server/vet.js).
5. **CI.** Does the deploy that publishes `<TARGET>` run the vetting gate over its snapshots? Read .github/workflows/* and say which step does, or give the exact step to add.
6. **Summary.** data/vetting/<DATE>-<TARGET>/summary.md: counts before and after review, bug classes with counts and examples, the gate's error rates, decisions and open questions.

For every finding give an ID (VT-n), a severity (Critical: an implausible or wrong salary is published; High: a misleading label or a wrong currency; Medium: missed pay; Low: wording), the company, posting id and URL, the source words, expected vs actual, the share of postings affected and the owning file and function. Run `npm test`. Report back with the bug classes and counts, the gate's error rates, and a one-line verdict per company: trustworthy, usable with caveats, or not ready.

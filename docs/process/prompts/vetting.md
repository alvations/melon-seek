# Prompt: data vetting (salary)

The prompt below was given verbatim to the data-vetting agent. The coordinator's
follow-up messages, also verbatim, come after it in the order they arrived.

---

You are the data-vetting engineer on melon-seek (/home/user/melon-seek), "the Zillow of job postings": it plots company job-board postings by salary. Real board data has just been fetched by GitHub Actions into data/snapshots/*.json, which you have locally: anthropic, anduril, openai, scaleai, xai, cohere, palantir, shieldai. Each file holds normalized Jobs with salary, descriptionHtml and url (see docs/CONTRACT.md). These files are gitignored because of their size; don't commit them.

The user found a bad salary. https://job-boards.greenhouse.io/anthropic/jobs/5183044008 ("Anthropic Fellows Program, AI Safety & Security") was plotted at $4.6M. Root cause, found by the lead: the posting has no salary, only "Weekly stipend of 3,850 USD / 2,310 GBP / 4,300 CAD", but the description mentions a past project, "AI agents find $4.6M in blockchain smart contract exploits", and server/salary.js parseSalary picked that up as pay. The user asked that the data be carefully vetted with an LLM (you are that LLM reviewer) and that the vetting process be kept as an audit trail.

You own: server/salary.js, server/normalize.js (salary-related code only), server/sources/*.js (salary extraction only), scripts/vet-salaries.js, scripts/llm-vet.js, test/salary.test.js, test/fixtures/real-salary-cases.json, data/vetting/**, docs/VETTING.md, docs/process/vetting.md (follow docs/process/TEMPLATE.md) and docs/process/prompts/vetting.md (paste this prompt there verbatim). The backend agent that wrote these files has finished, so you may edit them; keep the existing tests passing. Don't edit public/ or other server files. Don't commit; the lead does.

Steps:
1. Deterministic anomaly scan: scripts/vet-salaries.js [files...] reads the snapshots and writes data/vetting/<YYYY-MM-DD>/flags.jsonl, one line per flagged job: id, company, title, url, parsed salary, the source excerpt around the matched pay text (at most 300 chars), and flag codes. Include at least these flags:
   - max > $1.2M or min < $15K annual for full-time roles;
   - max/min > 3;
   - parsed number not near pay words (salary, compensation, pay, base, range, OTE, annual, hourly, stipend, wage);
   - matched text containing M/B suffixes;
   - currency inconsistent with the location's country;
   - a non-year interval;
   - multiple distinct ranges in the text;
   - structured pay_input_ranges disagreeing with the text;
   - "no salary parsed, but the text contains pay words" (missed salaries).
   It also prints per-company counts and exits non-zero when any job has a critical flag (an implausible amount).
2. LLM review, done by you and recorded. Review EVERY flagged job, plus a stratified random sample of unflagged salaried jobs (at least 25 per company, or all if fewer; seed the sampler and record the seed). For each one, read the source excerpt and decide:
   - the verdict: correct, parser_bug, or source_ambiguous;
   - the correct salary {min, max, currency, interval} or null, and kind: salary, stipend or hourly;
   - a one- or two-sentence evidence note quoting the relevant source words.
   Append one JSON line per job to data/vetting/<date>/verdicts.jsonl with: job id, url, company, parsed, corrected, verdict, kind, evidence quote, reviewer ("claude via Claude Code"), reviewed_at, and parser_version (git short sha or a hash of salary.js). Work in batches, writing as you go so the trail survives interruption.
3. Fix the parser from what the verdicts show:
   - Pay must come from pay context: a pay keyword in the same sentence or clause, or a structured field. A bare "$4.6M" in prose is never pay.
   - Support stipends and weekly/daily intervals ("Weekly stipend of 3,850 USD": kind "stipend", interval week, annualized ×52), and amounts with the currency code after the number.
   - With multiple currencies listed, pick the one matching the job's location, else USD.
   - Prefer structured ranges (Greenhouse pay_input_ranges, Ashby compensation, Lever salaryRange) over text.
   - Add `salary.kind` and `salary.source` ("structured" or "text") to the Job salary; keep the contract's other fields.
   - Add every real case you reviewed, as a short excerpt with the expected result, to test/fixtures/real-salary-cases.json, and a test that runs them all.
4. Re-run normalization over the snapshot raw text (re-derive from descriptionHtml) and the scan. Record before/after counts per flag in data/vetting/<date>/summary.md, and confirm job 5183044008 now shows a weekly stipend (≈ $200K/yr annualized, kind "stipend") or no salary — choose and justify which.
5. Optional automated LLM vetting for CI: scripts/llm-vet.js reads flags.jsonl and, when ANTHROPIC_API_KEY is set, asks the Claude API for a structured verdict per flagged job (same schema as verdicts.jsonl, reviewer = model id), writes data/vetting/<date>/llm-verdicts.jsonl, and does nothing (exit 0 with a message) when there is no key. Load the claude-api skill (Skill tool, "claude-api") first, for the current SDK usage and model ids. Default to a cost-effective current model, configurable via env. Use plain fetch to the Messages API if you prefer no new dependency; don't add npm dependencies without telling the lead. You can't call the API from this sandbox, so verify the request shape against the skill docs and test it with a mocked fetch.
6. docs/VETTING.md: the flag definitions, the review rubric (what makes each verdict), how to run the scan, LLM review and CI step, and how to read the audit files. Commit-sized outputs only: flags and verdicts JSONL with short excerpts are fine; no full snapshots.
Run `npm test`. Report back briefly: the bug classes found (with counts), the fixes, before/after flag counts, and the integration step for CI (the exact commands).

---

## Follow-up 1 (coordinator)

Additional requirement from the user: "make sure those mistakes NEVER happen again" and "you can easily find that with some outlier detection". Build defense in depth, not only a parser fix:
1. Statistical outlier detection as a runtime gate. Export a pure, browser-safe `vetSalaries(jobs)` (e.g. in server/vet.js, which you own) that normalize's pipeline runs over each company's full job list after per-job normalization.
   - Robust z-score on log(salary.mid) using median and MAD, both company-wide and within department or role family when n ≥ 8. Flag |z| > 3.5. Also apply Tukey fences on log salary (k = 3) and the absolute bounds from the scan.
   - Title-aware checks: Intern, Fellow, Resident or Apprentice above about $300K/yr; a Director or VP below about $60K.
   - Min/max sanity: max/min > 3, or min > max.
   - Flagged salaries are quarantined: the job keeps `salaryRaw` (what was parsed) and gets `salary: null` and `salaryFlag: { codes, reason }`, so it is never plotted on the chart or map or used in medians, Compstimate or Juice. The lead will have UX show "Pay unclear, see posting".
   Because the gate is shared, it works in both server and static (GitHub Pages) mode.
2. Make this a test: a unit test proves the $4.6M Fellows case and synthetic outliers are quarantined, and real typical salaries are not (check false positives on the real snapshots: report how many legitimate jobs got quarantined, and tune thresholds so it is near zero; record the tuning in your log).
3. CI gate: `node scripts/vet-salaries.js` runs in the Pages workflow after the snapshot and before the build. It writes the flags report to the job summary, and fails the deploy if any job reaches the output with an unquarantined critical anomaly, or if the regression fixtures fail. Give the lead the exact YAML step; devops will add it.
4. Put the outlier method, thresholds and their justification in docs/VETTING.md, and the false-positive analysis in data/vetting/<date>/summary.md.

## Follow-up 2 (coordinator)

Lead quick scan of the real snapshots (max > $1.2M, min < $15K, M/B text) found four bug classes. Start with these, and include them in the regression fixtures:
1. Prose money as pay: anthropic "Anthropic Fellows Program, AI Safety & Security" and "... ML Systems & Reinforcement Learning" → "$4.6M" (blog-post sentence); scaleai "Strategist, Qatar" → "$500K to $5M" (probably a deal-size sentence, not pay).
2. Merged tier ranges with a bad min: anduril "Robotics Software Engineer" "US Salary Range: 12,600–167,000 USD", "Senior Manufacturing Engineer" 14,600–194,000, "Technical Writer, Advanced Effects Missiles" 11,200–149,000. The overall-min/max merge across pay_input_ranges is combining a range with a different unit, a tier error, or a cents mistake. Inspect the raw ranges. The normalized snapshots may not keep raw pay_input_ranges, so check whether descriptionHtml or salary.text shows the tiers. If not, record that the raw field is needed, add `salary.ranges` (the per-tier list) to the Job going forward, and make the merge refuse to span ranges whose bounds differ by more than about 3×.
3. Wrong interval label: shieldai "Senior Sourcing Specialist (R5489)" "88,000–130,000 USD per-month-salary", annualized ×12 to $1.56M. When the stated interval yields an implausible annual amount but the raw numbers are plausible as annual, treat them as annual and flag `intervalCorrected`.
4. Also check the opposite: postings with pay words where nothing was parsed (missed salaries). Anduril has 2277 of 2418 salaried, but anthropic only 558/638, xai 134/297 and scaleai 131/194.
Counts here are from a simple scan over the full data, not a verdict.

## Follow-up 3 (coordinator)

You were interrupted by a session limit; it has reset. Resume where you left off (you were making clauseAround skip blank lines between a pay heading and the amount). Make sure the verdicts already written to data/vetting/<date>/ are kept and appended to, not overwritten. Remaining: the parser fixes, the runtime outlier quarantine (vetSalaries), regression fixtures, the before/after summary, scripts/llm-vet.js, docs/VETTING.md, the process log, and the exact CI YAML step for me. Then report back.

## Follow-up 4 (coordinator)

The user is (rightly) angry that the $4.6M outlier is still live. I, the lead, am wiring your server/vet.js `vetSalaries` into the runtime right now:
- `normalizeJobs` in normalize.js;
- server/index.js, at serve time for every mode;
- scripts/build-static.js, before writing each company;
- public/api.js, after a live fetch or a static load.
Don't edit those four call sites. Keep working on the parser fixes in salary.js, the regression fixtures, verdicts, docs and llm-vet. When you're done, tell me if `vetSalaries` changes its signature.

## Follow-up 5 (coordinator)

Lead hotfix is committed and pushed:
- vetSalaries now runs in normalizeJobs, in server/index.js getJobs stamp() (every response, including cache and snapshot data) and in build-static on loaded snapshots. vet.js is bundled into dist/lib.
- In vet.js I added a second hourly_high check (line ~139) that applies to ANY role, not only full-time: a text-parsed hourly rate above $250/hr is quarantined. It caught Cohere's "$500 home office stipend" read as $500/hr ($1.04M/yr, 39 postings, under the cap and too common for the stat test) and Scale AI's "$300/hr" part-time contract annualized to $624K. My VET.MAX_HOURLY_USD constant got lost in a concurrent edit, so the line now uses `(VET.MAX_HOURLY_USD ?? 250)`. Please fold that into your constants properly. You can merge it with your full-time check, but keep the any-role bound.
- test/vet-gate.test.js pins the 5 real cases. Keep it passing.
- Parser-side, please fix the root causes: perk/stipend/benefit clauses are not pay, and "$35/hour - $45/hour" is a range (xAI AI Tutor parses as $35 only). Record these in verdicts.jsonl.

## Follow-up 6 (coordinator)

`npm test` currently fails 3 tests in your files:
- #89 "deriveSalary: structured first, location-currency tier, implausible structured falls back to text": Cannot read properties of undefined (reading 'includes');
- #91 "vetting gate: legit low-paid and hourly roles are not statistical outliers": 'bdr kept';
- #92 "salaryChecks: thresholds".
#92, and maybe #91, could be from my any-role hourly_high line (~139 in vet.js). If so, fold it into your constants and update the expectations. Keep the rule's intent: a text-parsed hourly rate above about $250/hr must never be plotted, whatever the role. Please get the suite green and tell me when.

## Follow-up 7 (coordinator)

FX unification: public/viz/palette.js FX_PER_USD (as of 2026-07-01, from cities.json's Big Mac FX) is now the single source of truth. server/juice.js has a verbatim copy, and a new test/fx-consistency.test.js fails if any copy drifts by more than 1%. It currently fails on server/salary.js USD_PER, which still has the old rates (GBP 1.27, etc.). Please replace USD_PER with values derived from the same per-USD table, as juice.js does: copy FX_PER_USD verbatim and invert it, keeping any extra currencies the palette lacks. Then confirm `npm test` is green. Also: when will docs/VETTING.md and the final vet-salaries CI semantics be ready? Devops is wiring the CI step from the script header.

## Follow-up 8 (coordinator)

After the FX sync and your remaining vetting deliverables, one more part of the 1-up features (docs/strategy/ROADMAP.md §7.1 F2, docs/CONTRACT.md "v2 additions"):
- Set `salary.spread` (max ÷ min, 2 decimals) and `salary.zones` (the number of distinct pay ranges: the text parser counts the ranges it finds, merged with the adapter's structured `salary.zones`) on every salaried job.
- Make sure the market aggregate (scripts/build-market.js) and Compstimate's backtest read only vetted salaries; expose a helper if that's useful.
Tests; log it in docs/process/vetting.md.

## Follow-up 9 (coordinator)

Thanks. Your exact three steps are installed in pages.yml, in place of the old gate step, and pushed in 9bdf5d8. I verified `node scripts/vet-salaries.js --no-write-flags` locally: exit 0, 0 blocking, fixtures 435/435. Please finish docs/VETTING.md, summary.md and the process log. Then do salary.spread and salary.zones from the 1-up message.

## Follow-up 10 (coordinator)

Option (a). Don't work around the guard. Put the full text of summary.md, and of docs/process/vetting.md if that write is blocked too, in your final report, each in a fenced block, and I'll create both files.

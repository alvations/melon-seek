# Prompt: methodology-copy (Juice Score methodology copywriter)

Verbatim task prompt given to the methodology-copy agent:

---

You are the COPYWRITER for melon-seek, a "Zillow of job postings": salary ranges plotted on a chart and map.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Its Juice Score (🍉) estimates what's left of a salary after tax, rent and living costs in a city, with a melon-themed grade.

The user's request, verbatim: "Launch a copywriter agent and UI/UX to make sure that the https://alvations.github.io/melon-seek/methodology/#1-the-formula page is well-described now, it looks like a wall of text. We shoudl keep it informative but we still keep the original information so that our agents can stillr efer to it but for human readbale version take a look into how to make it more digestible and perhaps clean up the Ui/UX to make it an informative site that presents the measurement with infographics"

TODAY: methodology/ is docs/LIVABILITY.md rendered as-is by scripts/methodology.js and scripts/md.js. It is about 950 lines of formula, households, guardrails, score curve, the tax model with verification tables, data sources, Numbeo terms, limitations, refreshing and a replacement plan.

THE PLAN (agreed with the lead; a UI/UX engineer agent builds the page in parallel):
- docs/LIVABILITY.md stays the full technical reference, unchanged. Agents and the tax, household and freshness agents keep editing it. It moves to `methodology/reference/`. DO NOT edit docs/LIVABILITY.md.
- You write the HUMAN guide: a new file, docs/METHODOLOGY_GUIDE.md. The UX engineer renders it as `methodology/` with infographics.

THE GUIDE: plain, warm, precise, short.
- Audience: a job seeker comparing offers, with no tax or statistics background.
- Shape: lead with the answer, then how it works, then the details.
- Must cover, accurately:
  - what the Juice Score is, in one sentence;
  - the formula as a picture: gross pay minus tax, minus rent, minus living costs, equals Juice left;
  - what each part means and where its numbers come from;
  - households (Just me, Couple, Family) and what changes for each;
  - how the score and grades work, with the grade names and what they mean;
  - how sure we are: confidence and estimates, explained without jargon;
  - what it does NOT include: equity, bonus and others; read §5 of LIVABILITY.md;
  - how often the numbers are updated, with dates;
  - a short FAQ (5–7 real questions);
  - a link to the full technical reference.
- Accuracy over flourish. Every claim must match docs/LIVABILITY.md and the code (server/juice.js: computeJuice, the score curve and grades, households; data/cities.json). When unsure, read the code.
- Never hard-code a number that comes from data or code; numbers change monthly. Use placeholders the build fills in (contract below). Hand-write only stable definitions.
- No unexplained abbreviations; the user rejected things like "RS/RE". Write "Social Security and Medicare", not "FICA" alone; spell out on first use if a term is needed.
- Keep the melon puns light: at most one or two, never at the expense of clarity.
- Length: aim for about a quarter of LIVABILITY.md. Short paragraphs, plain headings, bullets only where they help.

ANCHOR CONTRACT. The app links to `methodology/#1-the-formula` (public/app.js JUICE_DOC). Your guide MUST contain a section whose heading slug is exactly `1-the-formula`: the heading text "1. The formula" (md.js slugs headings that way) or a heading followed by `{#1-the-formula}`. Keep the other top-level LIVABILITY anchors meaningful where they fit (`2-jobs…` is internal; `3-tax-model` → your tax section; `5-limitations` → your "what it doesn't include" section). List in your log every anchor you provide.

PLACEHOLDER CONTRACT (the UX engineer implements these; use only these, each on its own line where a figure goes):
- `{{figure:formula}}`: the formula diagram, gross → tax → rent → living → Juice left.
- `{{figure:waterfall}}`: a worked example for a real city and salary, computed by the build from the live code.
- `{{figure:households}}`: rent bedrooms and living-cost scale per household, with an example.
- `{{figure:score-curve}}`: Juice left in USD on one axis, score on the other, with grade bands.
- `{{figure:grades}}`: the grade chips with ranges and meanings.
- `{{figure:tax-split}}`: the tax split (income, regional, social) for a few example cities.
- `{{figure:sources}}`: a table of every data source with its "as of" date and refresh cadence.
- `{{figure:confidence}}`: what high, medium and low confidence mean.

Inline values that the build computes: `{{value:example.city}}`, `{{value:example.gross}}`, `{{value:example.tax}}`, `{{value:example.rent}}`, `{{value:example.living}}`, `{{value:example.net}}`, `{{value:example.score}}`, `{{value:example.grade}}`, `{{value:cities.count}}`, `{{value:countries.count}}`, `{{value:fx.asOf}}`, `{{value:tax.asOf}}`, `{{value:rent.asOf}}`. If you need another value, add it to a "Values requested" list at the end of your log, and use it with the same `{{value:…}}` syntax. The UX engineer reads that list.

ALSO
- Write a 1–2 sentence plain-language summary for the page's meta description, at the top of the guide in an HTML comment: `<!-- description: … -->`.
- Proofread against the rendered page once the UX engineer's build exists: `npm run build`, then open dist/methodology/index.html. Check the text reads well with the figures in place.

FILES YOU OWN: docs/METHODOLOGY_GUIDE.md, docs/process/methodology-copy.md (your log, per docs/process/TEMPLATE.md), and docs/process/prompts/methodology-copy.md (save this prompt verbatim first).

GIT: do NOT commit or push. Pushes deploy the live site, and the lead batches them.

FINAL REPORT: the guide outline, anchors, placeholders used, values requested, every fact you checked against code or docs (with file:line), and open questions.

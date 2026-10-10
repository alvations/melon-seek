# Prompt: methodology-ux (UI/UX engineer for the methodology page)

Verbatim task prompt given to the methodology-ux agent:

---

You are the UI/UX ENGINEER for melon-seek's methodology page.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, Node >= 18, no new dependencies.
- The site is static on GitHub Pages under /melon-seek/, built by scripts/build-static.js, with a strict CSP: script-src 'self', no inline scripts, styles from 'self' only, style-src-attr 'unsafe-inline' allowed.
- Read docs/strategy/ROADMAP.md §8 (simplicity budget), docs/CONTRACT.md, scripts/methodology.js, scripts/md.js and docs/process/TEMPLATE.md.
- If a "dataviz" skill is available to you, load it before designing the charts.

The user's request, verbatim: "Launch a copywriter agent and UI/UX to make sure that the https://alvations.github.io/melon-seek/methodology/#1-the-formula page is well-described now, it looks like a wall of text. We shoudl keep it informative but we still keep the original information so that our agents can stillr efer to it but for human readbale version take a look into how to make it more digestible and perhaps clean up the Ui/UX to make it an informative site that presents the measurement with infographics"

THE PLAN (agreed with the lead):
1. `methodology/` becomes a designed, human-readable guide rendered from docs/METHODOLOGY_GUIDE.md. A copywriter agent writes that file in parallel. Until it exists, build against a stub with every placeholder below, and never overwrite the copywriter's file.
2. `methodology/reference/` is the full technical reference: docs/LIVABILITY.md rendered exactly as today, with its TOC and every anchor. DO NOT edit docs/LIVABILITY.md; other agents own it. Agents keep reading it.
   - Old deep links: the app links to `methodology/#1-the-formula`. The guide provides that anchor (the copywriter's heading "1. The formula").
   - Any OTHER old anchor linked anywhere (grep the repo, docs and app) must still work. Either the guide has the same id, or the guide page includes a small anchor index pointing to `reference/#<id>`.
   - scripts/links-policy.js checks anchors in dist/. Extend it to cover methodology/reference/.
3. Infographics: inline SVG generated at BUILD time from the live code and data, so they never go stale (monthly refreshes change the numbers).
   - Import server/juice.js (computeJuice, the score curve, grades, households, TAX_SOURCES) and data/cities.json.
   - Implement every placeholder in the copywriter's contract:
     - `{{figure:formula}}`: the formula as a flow, gross → minus tax → minus rent → minus living → Juice left.
     - `{{figure:waterfall}}`: a worked example (a default city and salary, e.g. San Francisco at a typical senior salary, or the median salaried posting) as a waterfall bar chart with labelled amounts.
     - `{{figure:households}}`: Just me, Couple and Family side by side: bedrooms, rent, living scale and Juice left.
     - `{{figure:score-curve}}`: Juice left → score, with grade bands shaded and labelled.
     - `{{figure:grades}}`: grade chips with their ranges and meanings.
     - `{{figure:tax-split}}`: income, regional and social tax for 4–6 example cities as stacked bars.
     - `{{figure:sources}}`: an HTML table of every data source with its as-of date and refresh cadence. Read the asOf fields in data/cities.json, TAX_SOURCES and FX_AS_OF; if data/freshness.json exists, use its cadence.
     - `{{figure:confidence}}`: what high, medium and low confidence mean.
   - Implement every `{{value:...}}` placeholder: example.city/gross/tax/rent/living/net/score/grade, cities.count, countries.count, fx.asOf, tax.asOf, rent.asOf, plus any in the "Values requested" list of docs/process/methodology-copy.md.
   - An unknown placeholder fails the build loudly. Never print a literal "{{".
   - Charts must:
     - be accessible: role="img", a <title> and <desc> summarizing the data, and a visually-hidden data table or figcaption with the numbers;
     - follow dark mode via the site tokens, var(--ms-*) in public/styles.css;
     - be responsive down to 360 px with no horizontal page scroll; wide charts reflow or scroll inside their own box;
     - not rely on colour alone, and use readable font sizes (12 px minimum on phones);
     - use no JavaScript (static SVG plus CSS), so they stay CSP-safe.
4. Page design: an informative, scannable explainer, not a wall of text.
   - A hero with a one-line definition and the formula figure; a sticky or compact section nav (TOC) on desktop, collapsing on phones; generous spacing and a readable measure (about 65–75 characters).
   - Callouts for "what it doesn't include" and the confidence notes.
   - A clear link to the full technical reference, and a "Back to the jobs" link.
   - The same header and brand as today's doc page. Dark-mode toggle parity (theme-init.js).
   - Performance: no new web fonts beyond the self-hosted Inter in public/fonts; keep the page small.
5. Server mode: server/index.js already serves /methodology/ through renderMethodologyPage. Add /methodology/reference/, plus any new CSS asset, so it matches the static build.

OWNERSHIP
- You own scripts/methodology.js and scripts/md.js (add placeholder and directive support; md.js tests must still pass), a new scripts/methodology-figures.js, the methodology CSS (METHODOLOGY_CSS or a new file), and the methodology routes in server/index.js.
- In scripts/build-static.js, only the methodology wiring; re-read it before editing, since other agents may patch other parts.
- scripts/links-policy.js: the methodology/reference coverage only.
- Tests: test/md.test.js, new test/methodology*.test.js, and a new e2e test file registered in scripts/e2e.js. The e2e tests check:
  - desktop and 390 px both have no horizontal overflow;
  - every figure renders, with SVG title and desc present;
  - no literal "{{";
  - #1-the-formula lands on the formula section;
  - the reference page has every LIVABILITY heading;
  - the drawer's "How it's calculated" link works;
  - dark mode works;
  - no console or CSP errors.
- Do NOT touch docs/LIVABILITY.md or docs/METHODOLOGY_GUIDE.md (the copywriter's file; use a stub under the scratchpad until it exists). Avoid public/app.js except the JUICE_DOC constant if truly needed; other agents have uncommitted work in it.
- Never use `pkill -f` or `pgrep -f`; keep pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/methodology-ux/.
- Never run playwright install. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
- GIT: do NOT commit or push. The lead batches pushes, because every push deploys.

VERIFY
- `npm test` is green, apart from failures you show are caused by other agents' in-progress files.
- `npm run build` succeeds.
- The full e2e suite passes, plus your new methodology tests.
- Screenshots in docs/screenshots/methodology/: guide and reference, at 1440 and 390, light and dark.

Write docs/process/methodology-ux.md (your log, per TEMPLATE.md) and save this prompt verbatim first to docs/process/prompts/methodology-ux.md.

FINAL REPORT
- Page structure, and every figure with its data source.
- The anchor map (old to new).
- Test results and files changed.
- Anything the lead must check: e.g. a figure that depends on the tax agent's in-progress juice.js.

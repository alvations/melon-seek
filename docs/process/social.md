# Process log: social (link previews)

Written by the social-sharing agent so this work can be redone on another
account or machine.

## 1. Brief

- Prompt (verbatim): [`prompts/social.md`](prompts/social.md).
- Goal: sharing https://alvations.github.io/melon-seek/ on LinkedIn (and
  Facebook, Slack, X and others) showed no preview image. Add complete Open
  Graph and Twitter card tags, a designed 1200×630 share card, absolute URLs
  in the static build, and per-company share pages.
- Files owned: the social `<meta>` tags in the `<head>` of `public/index.html`;
  the social parts of `scripts/build-static.js` and `.github/workflows/pages.yml`;
  `public/og/card.html`, `public/og/melon-seek-og.png`, `scripts/build-og.mjs`,
  `test/og.test.js`, this log and its prompt. The README section "Link
  previews" was added at the prompt's request. No commits (the lead commits).

### Diagnosis (root cause)

`public/index.html`, which the build copies to `dist/index.html`, had a
`<title>` and `<meta name="description">` and **no Open Graph or Twitter
tags**. The only image was `favicon.svg`. Crawlers don't run JavaScript and
LinkedIn doesn't use SVG, so LinkedIn had nothing to show.

| Needed by LinkedIn / X | Before | Now (`dist/index.html`) |
| --- | --- | --- |
| `og:title` | missing | `melon·seek — the Zillow of job postings` |
| `og:description` | missing (only `meta description`) | same sentence as `meta description` |
| `og:type` | missing | `website` |
| `og:url` | missing | `https://alvations.github.io/melon-seek/` |
| `og:image` (absolute https, PNG/JPG, < 5 MB) | missing; no raster image at all | `https://alvations.github.io/melon-seek/og/melon-seek-og.png` (1200×630 PNG, 164 KiB) |
| `og:image:width` / `:height` / `:alt` | missing | `1200` / `630` / description of the card |
| `twitter:card` | missing | `summary_large_image` |
| `twitter:title` / `:description` / `:image` | missing | same as the OG values |
| extras | none | `og:site_name`, `og:image:type`, `og:locale`, `twitter:image:alt` |

There was a second, hidden problem: even with tags, a relative `og:image`
(the natural thing to write in `public/`) is ignored by LinkedIn. The static
build now makes the URL tags absolute (decision 3).

## 2. Inputs and sources

| Input | What it contributed |
| --- | --- |
| `public/index.html` (head) | Existing title/description; confirmed no OG/Twitter tags and only an SVG icon. |
| `scripts/build-static.js` | `relativizeHtml` only rewrites `href`/`src`, so `content=` URLs need their own pass; the per-company loop has each payload, used for share-page numbers; `walk()` reused. |
| `.github/workflows/pages.yml` | Where to set `SITE_URL`; `deploy-pages` exposes `page_url` for a post-deploy check. |
| `docs/process/TEMPLATE.md` | Structure of this log. |
| `server/index.js` (read only) | `MIME['.png'] = 'image/png'`; `serveFile` serves `public/og/*`, so server mode needs no change. `createServer` is exported, so the test can check the content type. |
| `server/salary.js#annualize`, `server/vet.js#toUSD` (read only) | Share-page median: annualized and converted the same way as the vetting gate. Snapshot jobs are already vetted by the build (`vetSalaries`), so quarantined pay is null and never counted. |
| `public/app.js` (read only: `parseHash`, `stats`, `quantile`), `public/features/shared.js#formatMoney` | The hash key is `c`; the app's median is the median of range midpoints in approx USD; `$352K` formatting. |
| `public/styles.css` `:root`, `public/viz/palette.js` (read only) | Card colours: ink `#151821`, muted `#5c6474`, melon `#ec4c6c`, borders; `CAT_LIGHT` slots 1–4 for the cluster rows, `SEQ_LIGHT` steps for the map pins. |
| `public/favicon.svg` | The melon mark, copied into the card. |
| `docs/screenshots/chart.png`, `map.png` | The look of the Clusters view and the price-tag pins the card stylizes. |
| `docs/process/scripts/ux-screenshots.mjs` | The pattern for loading `playwright-core` from outside the repo and finding `/opt/pw-browsers/chromium-*/chrome-linux/chrome`. |
| Skill: `dataviz` | Ran its palette validator on the four cluster colours (below). The card is a picture, not an interactive chart, so the hover and table rules don't apply. |
| `/root/.ccr/README.md` | Chromium in this sandbox rejected the TLS-inspecting proxy's CA (`ERR_CERT_AUTHORITY_INVALID`) when loading Google Fonts. Node trusts `NODE_EXTRA_CA_CERTS`, so the script fetches fonts on the Node side instead (decision 8). |
| Platform behaviour (general knowledge, not fetched) | LinkedIn: 1.91:1, ≥1200×627 recommended, 5 MB cap, about 7-day cache, Post Inspector refreshes it. Facebook: 1200×630, Sharing Debugger, re-scrapes `og:url`. X: `summary_large_image` is 2:1, and the Card Validator preview was retired in 2022. Telegram: @WebpageBot. The live site could not be fetched from the sandbox (egress policy 403 on `alvations.github.io`), so nothing was checked against production. |

## 3. Decisions and rationale

1. **1200×630 PNG.** This is Facebook's recommended size, and it is within
   LinkedIn's 1.91:1 tolerance (1200×627 is LinkedIn's own figure; 630 is
   1.905:1). X's `summary_large_image` crops to 2:1, about 15 px off the top
   and bottom, so all content sits at least 44 px from the edges. PNG was
   chosen over JPG because the card is flat colours and text: PNG stays sharp
   at 164 KiB, far below 5 MB.
2. **Tags stay in the static `<head>`, early.** They come right after
   `meta description` and before any script, because crawlers parse only the
   static HTML. Each key appears once, so no crawler can pick a stale duplicate.
3. **Relative in `public/`, absolute in `dist/`.** `public/index.html` has
   `og:url="./"` and `og:image="og/melon-seek-og.png"`. In server mode these
   follow whatever host serves the page. `build-static.js#absolutizeSocial`
   rewrites `og:url`, `og:image`, `og:image:url`, `og:image:secure_url`,
   `twitter:image` and `twitter:url` in **every** built HTML page, resolving
   each against that page's own URL under `SITE_URL`. A leading `/` means
   site-root-relative, so `/og/x.png` becomes `SITE_URL + og/x.png`, not the
   bare domain root. `SITE_URL` defaults to
   `https://alvations.github.io/melon-seek/` and always gets a trailing `/`.
   Anything other than http(s) fails the build, and http only warns.
4. **`SITE_URL` in pages.yml uses `vars.SITE_URL || default`.** A fork or a
   custom domain can set a repository variable without editing the workflow.
   An alternative was moving `configure-pages` before the build to use its
   `base_url`. That would reorder non-OG steps, so it was not done.
5. **Share pages at `c/<slug>/index.html`, with no meta refresh.** Each page
   carries company-specific `og:title` / `og:description` and the shared card.
   A `location.replace("../../#c=<slug>" + extra hash)` script sends people on
   (`c/openai/#m=map` becomes `#c=openai&m=map`). A plain link covers no-JS
   visitors. Meta refresh was rejected because some crawlers follow it and
   would read the app's generic tags instead. `og:url` points at the share
   page itself, not the app, because Facebook re-scrapes `og:url` and would
   otherwise show the generic preview.
6. **Share-page numbers.** The page shows the role count and the median of
   salary-range midpoints, annualized (`salary.js#annualize`) and in
   approximate USD (`vet.js#toUSD`). It uses vetted salaries only, the same
   definition as the app's header. Checked in a browser: `c/anthropic/` says
   "638 roles · median $352K" and the app shows "638 roles · median $352K".
   **Demo data gets no numbers** ("Anduril jobs by salary"), so a preview
   never quotes fake pay. The description adds "N of M roles list pay" and
   the snapshot date.
7. **The card stays general.** It has the wordmark (the favicon melon plus
   `melon·seek` with a melon-coloured dot) and the tagline "The Zillow of
   job postings" (70 px, 800 weight; about 32 px in a LinkedIn feed). A
   one-line explainer and three chips (Salary, Map, Skills) sit under it. On
   the right are a Clusters-style chart (department rows, bubbles with counts,
   a middle-50% band, a median tick) and a map with price-tag pins that step
   up the blue ramp with pay. Departments are generic and the numbers are
   illustrative. There are no company names or logos.
8. **Rendering (`scripts/build-og.mjs`).** It loads `playwright-core` from
   `PW_DIR` (never a repo dependency) and uses Chromium from `CHROMIUM_PATH`
   or `/opt/pw-browsers/chromium-*/`. It never runs `playwright install`.
   Viewport is 1200×630 at DPR 1 with an exact clip. Google Fonts requests go
   through `page.route` and `route.fetch()`, which run in Node, so this works
   behind TLS-inspecting proxies without turning off certificate checks. The
   script warns if Inter didn't load (fallback font) or if the page
   overflows, and fails if the PNG isn't 1200×630 or is over 5 MB.
9. **`card.html` is a build input, not a page.** It has `noindex`, and
   `build-static.js` deletes `dist/og/card.html` right after copying
   `public/`.
10. **Build guards (warnings, or failures under `--strict`).** The build
    warns if `og:image` or another key tag is missing from `index.html`, if an
    `og:image`/`twitter:image` under `SITE_URL` isn't in `dist/`, or if one is
    over 5 MB.
11. **Workflow checks.** In the build job, after the build, a check fails the
    job if `og:image` isn't absolute under `SITE_URL`, if `og:url` /
    `twitter:image` aren't https, if `twitter:card` is wrong, or if the PNG
    isn't 1200×630. It writes the image URL and every share-page title to the
    step summary. In the deploy job, after deploy, a **warn-only** step
    (`continue-on-error`) fetches the live page with a fresh query string,
    reads `og:image` and checks that it is served as `image/png`. It retries
    6 times, 20 s apart, because Pages' CDN caches HTML for about 10 minutes.
12. **Palette.** The card uses `CAT_LIGHT[0..3]` (`#2a78d6, #eb6834, #1baf7a,
    #eda100`). The `dataviz` validator in light mode: lightness, chroma, CVD
    (worst adjacent ΔE 9.1) and normal-vision checks PASS. Contrast WARNs for
    green and amber are covered by direct text labels: every row is named in
    ink, and bubble counts are ink on a tinted fill.

## 4. Replayable steps

```sh
# Render the card (only when public/og/card.html changes; commit both files)
mkdir -p "$SCRATCH/pw" && (cd "$SCRATCH/pw" && npm init -y && npm i playwright-core)   # outside the repo
PW_DIR="$SCRATCH/pw" node scripts/build-og.mjs
#  -> Wrote public/og/melon-seek-og.png: 1200x630, 164 KiB
#  (--out <png> to render elsewhere for a look first)

# Build and inspect
SITE_URL=https://alvations.github.io/melon-seek/ npm run build
#  -> social: og:image https://alvations.github.io/melon-seek/og/melon-seek-og.png; 8 share pages at .../c/<slug>/
grep -E 'og:|twitter:' dist/index.html
cat dist/c/anthropic/index.html

npm test                          # includes test/og.test.js
node --test test/og.test.js       # 6 tests, ~2.5 s (two builds into a temp dir)
```

### After a deploy: verify, then refresh caches

1. In the Actions run, the build job's step summary has a **Link previews**
   section with the absolute `og:image` and each `c/<slug>/` title. The deploy
   job's **Check live link preview** step should say
   `og:image https://alvations.github.io/melon-seek/og/melon-seek-og.png is live (image/png)`.
2. By hand:
   ```sh
   curl -s https://alvations.github.io/melon-seek/ | grep -E 'og:|twitter:'
   curl -sI https://alvations.github.io/melon-seek/og/melon-seek-og.png | grep -i content-type   # image/png
   curl -s https://alvations.github.io/melon-seek/c/anthropic/ | grep og:title
   ```
3. Wait about 10 minutes after the deploy before re-scraping. GitHub Pages'
   CDN can serve the old HTML until then.
4. Re-scrape each platform that has already cached the bare preview:

| Platform | How it caches | How to refresh |
| --- | --- | --- |
| **LinkedIn** | Caches per URL for about 7 days. A post keeps the preview it was made with. | [Post Inspector](https://www.linkedin.com/post-inspector/): sign in, paste the URL, click **Inspect**. That re-scrapes immediately and updates the cache for new posts. Inspect the root and any `c/<slug>/` page you plan to share. Then delete and re-post, or start a new post. Old posts don't update. |
| **Facebook / Messenger / Threads** (Meta) | Caches for about 30 days. Treats `og:url` as canonical and scrapes that URL. | [Sharing Debugger](https://developers.facebook.com/tools/debug/) and click **Scrape Again**. A query string doesn't bust the cache, because Meta follows `og:url`. `og:image:width/height` let the image show on the first share. |
| **X (Twitter)** | Caches cards for about 7 days. The Card Validator preview was retired. | Compose a post with the URL: the composer fetches the card. To force a new fetch, share it with a harmless query string (`?v=2`). |
| **Slack** | Unfurls per URL and caches them for a while. There is no public re-scrape tool. | Post the URL with a query string (`?v=2`). Slack's unfurler reads `og:*` and `twitter:*`. |
| **Discord** | Caches embeds per URL. | Use a query string (`?v=2`). |
| **Telegram** | Caches previews server-side. | Send the link to [@WebpageBot](https://t.me/WebpageBot) to refresh it. |
| **WhatsApp, iMessage, Signal** | The sender's device fetches the preview when the message is sent. | Nothing to clear; send the link again. WhatsApp's small thumbnail is a centre square crop, which cuts the wordmark. |
| **Mastodon / fediverse** | Each server fetches and caches on its own. | No global refresh. New posts on a server that hasn't cached the URL pick it up. |
| **Google / search previews** | Use the HTML title and description, not the card. | Search Console → URL Inspection → Request indexing (optional). |

Third-party previewers such as opengraph.xyz render all of these at once.
They're handy as a final look, but they aren't authoritative.

## 5. Verification

- `node --test test/og.test.js`: **6/6 pass** (about 2.5 s).
  - Every required tag is in `public/index.html`'s static `<head>`, exactly
    once, with `og:type=website`, `twitter:card=summary_large_image`,
    1200/630, matching og/twitter images, relative URLs, and the image file
    present.
  - The PNG header (signature + IHDR) is 1200×630, the ratio is 1.905, the
    file is under 5 MB, and the dimensions match the meta tags.
  - Server mode: `GET /og/melon-seek-og.png` returns 200 `image/png` with
    bytes identical to the file, and `GET /` has every tag.
  - Build with the default `SITE_URL`: `og:url`, `og:image` and
    `twitter:image` are absolute; every built page's social URLs are https;
    the card is copied byte for byte; `card.html` is not published.
  - Share pages: a fixture snapshot gives "Anthropic jobs by salary · 4 roles
    · median $250K", "3 of 4 roles list pay", and the date. `og:url` is the
    share page; the redirect target is `../../#c=anthropic`; there is no meta
    refresh; a demo company has no numbers.
  - `SITE_URL=https://example.org/jobs` gives `https://example.org/jobs/...`
    everywhere.
- `npm test` overall: 133/135. The 2 failures are in `test/juice.test.js`,
  another agent's in-progress work, and are unrelated.
- Full build on real snapshots (8 companies): share titles were Anduril
  2,418 roles · $170K, Anthropic 638 · $352K, Cohere 132 · $245K, OpenAI
  833 · $307K, Palantir 320 · $140K, Scale AI 194 · $220K, Shield AI 581 ·
  $190K, xAI 297 · $144K.
- Browser check (Playwright, `dist/` served under `/melon-seek/`):
  `/melon-seek/c/anthropic/` → `/melon-seek/#c=anthropic` showed "638 roles ·
  median $352K"; `/melon-seek/c/openai/#m=map` → `#c=openai&m=map`.
- The workflow's build-time check script was run locally against the built
  `dist/` and passed; it wrote the expected step summary.
- I looked at the rendered card at full size: no overlaps, and the map panel
  clears the chart's last row.
- **Not verified:** the live site. `alvations.github.io` is blocked by the
  sandbox's egress policy. The post-deploy workflow step and the curl
  commands above cover it.

## 6. Known gaps and follow-ups

- **Server mode keeps relative `og:url`/`og:image`.** Facebook and Slack
  resolve them; LinkedIn doesn't. If the Node server is ever the public host,
  `server/index.js` (backend-owned) could absolutize them from a `PUBLIC_URL`
  env when serving `index.html`.
- **Nothing links to the share pages yet.** A "Copy link" or "Share" action
  in `public/app.js` (UX-owned) could hand out
  `SITE_URL + "c/<slug>/#<rest of hash>"`. The share page already forwards
  the extra hash.
- All share pages use the one generic card. Per-company cards (logo-free,
  with that company's own clusters) would need either a browser in the
  deploy or committed per-company PNGs that go stale.
- Custom boards (Add board) are client-side only, so they get no share page.
- Share-page numbers are fixed at build time (daily). LinkedIn's 7-day cache
  can show numbers up to a week old.
- `docs/process/README.md`'s workstream table has no row for this log (not
  in this agent's files). The lead should add one.
- The card's text is baked into the PNG. If the tagline changes, edit
  `card.html` and re-run `build-og.mjs`.

## 7. Change log

- 2026-10-02T06:45Z: Diagnosis. No OG/Twitter tags and no raster image in
  `public/index.html`.
- 2026-10-02T06:49Z: `public/og/card.html` + `scripts/build-og.mjs`. First
  render had the map panel overlapping the last chart row and a bottom stripe
  that read as a progress bar; fixed both. Fonts are now fetched in Node
  because Chromium didn't trust the sandbox proxy CA.
- 2026-10-02T06:50Z: Social tags added to the `<head>` of `public/index.html`
  (re-read first; the UX agent's head was unchanged).
- 2026-10-02T06:52Z: `build-static.js`: `SITE_URL`, absolutize pass, share
  pages, guards; `card.html` dropped from `dist/`. Other agents edited the
  same file at the same time (vetting); my edits were kept to one helper
  block plus four small in-`main()` hooks.
- 2026-10-02T06:54Z: `pages.yml`: `SITE_URL` on the build, a build-time tag
  check, and a warn-only live check after deploy.
- 2026-10-02T06:56Z: `test/og.test.js` (6 tests), this log, the README
  section.

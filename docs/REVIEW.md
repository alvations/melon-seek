# melon-seek: security, accessibility and correctness review

Reviewer: security & accessibility workstream (read-only on code).
Snapshot reviewed: working tree at 2026-10-02 ~05:30 UTC (commit `1d23290` + uncommitted WIP), re-checked at the end (see "Re-check" at the bottom).
Scope: `server/**`, `public/app.js`, `public/index.html`, `public/viz/{chart,map,palette}.js`, `public/viz/viz.css`, `public/features/shared.js`.
Method and commands: `docs/process/review.md`.

Line numbers refer to the snapshot above. Patches are suggestions for the owning workstream. This review did not edit any code.

## Summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| H1 | High | DoS | Unbounded memory/disk cache per custom board, `refresh=1` always bypasses the cache, and unknown boards are re-fetched and re-generated (demo) on every request |
| M1 | Medium | Integrity | `?mock=1` works in production and labels made-up jobs as "Live" |
| M2 | Medium | Hardening | No CSP, `frame-ancestors` or `Referrer-Policy`. `nosniff` is missing on streamed files |
| M3 | Medium | A11y | Map pins can be focused but not activated by keyboard. Pins are rebuilt on every zoom, so focus is lost |
| M4 | Medium | A11y | Drawer modal: trap does not pull focus in, deep-link open leaves focus outside, background not inert, return focus is lost after a re-render |
| M5 | Medium | Correctness | Salary bounds and filters ignore currency: JPY/INR/KRW salaries are dropped, and the slider compares native amounts with USD |
| L1 | Low | SSRF (same host) | Board slugs `.` / `..` pass validation and move the upstream path on the fixed vendor host |
| L2 | Low | DoS / SSRF hardening | Upstream fetch follows redirects and has no body-size cap. No limit on concurrent upstream fetches |
| L3 | Low | Integrity | The custom-board `name` param is baked into cached jobs (`companyName`) and shared with every later caller |
| L4 | Low | A11y | Chart listbox: invalid children, stale `activeIdx`, salary hidden from the option name, 2.0:1 active-row indicator |
| L5 | Low | A11y | Data-source badge details (incl. errors) only in `title`. Focusable `div` with no role |
| L6 | Low | A11y | `prefers-reduced-motion` ignored by map `flyTo` and chart smooth scroll |
| L7 | Low | Info leak | Raw `err.message` and upstream body snippets returned to clients |
| L8 | Low | DoS | `zlib.gzipSync` on multi-MB JSON blocks the event loop |
| L9 | Low | Hardening | One dynamic `innerHTML` sink (`salaryDistributionSvg`). `on*` string attrs fall through to `setAttribute` in both `h()` helpers |
| L10 | Low | Hardening | `localStorage` boards are not shape-validated |
| L11 | Low | UX/phishing | "Apply on Greenhouse" button does not show the real destination host. Relative description links resolve to the app origin |
| C1 | Correctness | Salary | "Annualized from ..." note never shows (`interval` is always `year`). `${interval}ly` gives "dayly" |
| C2 | Correctness | Server | `GET //x` request targets are parsed as an authority. `HEAD /api/jobs` triggers a live fetch |
| C3 | Correctness | Server | `server/index.js` imports `./demo.js`, which did not exist at review time, so the server cannot boot |

Verified OK (no finding): static path traversal, upstream host pinning, the description sanitizer, hash-state parsing (no prototype pollution), the chart/map/tooltip DOM sinks, and the apply-link scheme check. Details are in the last section.

---

## High

### H1. Unbounded cache growth and upstream amplification via custom boards

**Where**
- `server/cache.js:10` (`const memory = new Map()`) and `:42` (`memory.set(slug, entry)`): entries are never evicted, and each one is also written to `data/cache/<slug>.json`.
- `server/index.js:57-73`: `refresh=1` (`:150`) skips the fresh cache unconditionally.
- `server/index.js:83-89`: for boards that do not exist upstream, every request makes a live fetch (404), then generates and normalizes ~60-150 demo jobs. Nothing is cached.

**Repro (local)**: request `/api/jobs?source=greenhouse&board=<slug>` for many real, distinct board slugs. RSS and `data/cache/` grow with no bound, because each board's normalized jobs (often several MB with `descriptionHtml`) are kept for the life of the process. Repeating any request with `&refresh=1` makes one full upstream download per request. A request for a board that does not exist costs one upstream round-trip plus a demo normalize per call. This is unauthenticated and needs no special tooling. It is the most realistic way to degrade a public deployment, or to get its IP rate-limited by Greenhouse/Ashby/Lever.

**Patch** (bounded LRU, refresh throttle, negative cache):

```js
// server/cache.js
const MAX_MEMORY_ENTRIES = Number(process.env.MELON_CACHE_MAX || 50);
function remember(slug, entry) {
  memory.delete(slug);            // re-insert = most recently used
  memory.set(slug, entry);
  while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value);
}
// use remember(...) instead of memory.set(...) at lines 29 and 42
```

```js
// server/index.js
const MIN_REFRESH_MS = 60_000;
const NEG_TTL_MS = 10 * 60_000;
const lastLive = new Map();      // slug -> ms of last live attempt (bounded the same way)
const negative = new Map();      // slug -> { at, payload } for boards that 404/failed and fell to demo

export async function getJobs(company, { refresh = false } = {}) {
  const pub = { /* unchanged */ };
  const cached = await getCached(company.slug);
  const recentlyLive = Date.now() - (lastLive.get(company.slug) || 0) < MIN_REFRESH_MS;
  if (cached && (cached.fresh && !refresh || recentlyLive)) {
    return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error: null, jobs: cached.data };
  }
  const neg = negative.get(company.slug);
  if (neg && Date.now() - neg.at < NEG_TTL_MS && !(refresh && !recentlyLive)) return { ...neg.payload, company: pub };
  lastLive.set(company.slug, Date.now());
  if (lastLive.size > 1000) lastLive.delete(lastLive.keys().next().value);
  // ... existing live / stale / snapshot logic ...
  // before returning the demo payload:
  const payload = { company: pub, mode: 'demo', fetchedAt: new Date().toISOString(), error, jobs };
  if (company.custom) {
    negative.set(company.slug, { at: Date.now(), payload });
    if (negative.size > 200) negative.delete(negative.keys().next().value);
  }
  return payload;
}
```

Optional: cap disk usage by keeping disk cache only for built-ins (`if (!company.custom) await setCached(...)`), or prune `data/cache` to the N newest files on write.

---

## Medium

### M1. `?mock=1` serves made-up jobs labelled "Live" in production

**Where**: `public/app.js:10` (`const MOCK = new URLSearchParams(location.search).has('mock')`) and `public/app.js:134-140`. `public/mock-api.js:11` sets `MODES = { anthropic: 'live', ... }`.

**Repro**: open `/?mock=1#c=anthropic` on any deployment. The badge reads "Live · Fetched live from Greenhouse / anthropic" over synthetic salaries. A shared link can show convincing fake pay data under a real company's name. This breaks the contract rule that demo data is "never presented as real".

**Patch**: allow mock only on localhost, and always label it.

```js
// public/app.js:10
const MOCK = new URLSearchParams(location.search).has('mock') &&
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
// in loadJobs(), after building `data`:
if (MOCK) { data.mode = 'demo'; data.error = 'Mock API (?mock=1): synthetic development data'; }
```

### M2. Missing response hardening headers

**Where**: `server/index.js:94` sets only `Content-Type`, `Cache-Control` and `X-Content-Type-Options`. The streamed branch `server/index.js:131` omits `nosniff`. There is no CSP, no clickjacking protection and no referrer policy. The description sanitizer (`public/app.js:1353`) is the only defence for third-party HTML, so a CSP is cheap defence in depth.

**Compatibility notes** (checked against the code):
- Leaflet 1.9.4 positions everything through CSSOM (`el.style.x = ...`). CSP allows that, and `leaflet.css` has no `data:` URLs.
- CARTO tiles load from `https://{a-d}.basemaps.cartocdn.com` with `crossOrigin: true` (`public/viz/map.js:16-17,92-94`).
- Google Fonts: CSS from `fonts.googleapis.com`, font files from `fonts.gstatic.com` (`public/index.html:12-14`).
- `public/app.js` `h()` sets `style="..."` **attributes** via `setAttribute` (`:467, :831, :982, :1000, :1069, :1140, :1183, :1276, :1327`). These need `style-src-attr 'unsafe-inline'` until they are converted to `el.style.setProperty(...)`. `features/shared.js` `h()` already uses CSSOM.
- `mock-api.js` is a same-origin dynamic import, so `script-src 'self'` covers it.

**Patch**:

```js
// server/index.js
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-elem 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",          // drop once app.js h() uses el.style.setProperty
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://*.basemaps.cartocdn.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};
// send():      const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' };
// serveFile(): res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
```

To remove `'unsafe-inline'` later, change `public/app.js:24` so that `style` strings become CSSOM:

```js
else if (k === 'style') { for (const decl of String(v).split(';')) { const i = decl.indexOf(':'); if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim()); } }
```

### M3. Map pins cannot be activated by keyboard, and focus is lost on every zoom

**Where**: `public/viz/map.js:209` creates markers with `keyboard: true`. Leaflet then gives the icon `tabindex=0 role=button`, but Leaflet maps Enter to an action **only for bound popups** (`leaflet-src.js` `_onKeyPress`). The handler is `m.on('click', ...)` only (`:214`), so Enter and Space do nothing. Also, `draw()` (`:197`) runs on every `zoomend` (`:253`) and rebuilds every marker, so a keyboard user who zooms (+/-) or activates a pin (which calls `flyTo`, `:218/:221`) loses focus to `<body>`. The pin's accessible name is its concatenated text (for example "$352K12San Francisco, CA"). The `alt` option has no effect on a `divIcon`.

**Repro**: Map view, Tab into the map, Tab to a pin, press Enter. Nothing happens, and the results list is not filtered (WCAG 2.1.1).

**Patch** (inside `draw()`):

```js
// before markerLayer.clearLayers():
const focusedKey = clusters.find((c) => c.marker?.getElement() === document.activeElement)?.lead.key;

// per cluster, replace the click handler body with a named function:
const activate = () => { /* existing click body from :214-223 */ };
m.on('click', activate);
m.on('keydown', (e) => {
  const k = e.originalEvent.key;
  if (k === 'Enter' || k === ' ') { e.originalEvent.preventDefault(); activate(); }
});
m.addTo(markerLayer);
const iconEl = m.getElement();
iconEl?.setAttribute('aria-label',
  `${c.label}: ${plural(c.n, 'posting')}${c.median != null ? `, median ${formatMoney(c.median)}` : ', no published salary'}`);
if (focusedKey && c.members.some((p) => p.key === focusedKey)) iconEl?.focus({ preventScroll: true });
```

### M4. Drawer (modal dialog) focus management gaps

**Where**: `public/app.js:1205-1236` (open/close) and `:1485-1491` (`trapFocus`). `index.html:142` declares `role="dialog" aria-modal="true"`.

1. `trapFocus` only wraps at the first and last elements. If focus is outside the drawer (after a deep link `#...&job=<id>`, or after clicking the backdrop area on desktop), Tab moves through the page behind the modal.
2. `openDrawer(..., { fromHash: true })` (`:1222`) does not move focus into the dialog. Deep links and Back/Forward open a modal with focus still in the page.
3. The page behind is not `inert`, so screen-reader browse mode can leave the "modal".
4. The return-focus target is often detached. Toggling a keyword chip in the drawer (`:1286`) calls `set()`, which re-renders and replaces every results card (`:1163`). `drawerReturnFocus.isConnected` is then false (`:1235`) and focus falls to `<body>`.

**Patch**:

```js
const BEHIND = () => [document.querySelector('.topbar'), $('.quickbar'), $('#layout')];

function openDrawer(id, { fromHash = false } = {}) {
  // ...existing...
  if (!drawerJobId || !drawerReturnFocus) drawerReturnFocus = document.activeElement !== document.body ? document.activeElement : null;
  for (const n of BEHIND()) if (n) n.inert = true;
  // ...existing render...
  $('#drawerClose')?.focus({ preventScroll: true });            // always, including fromHash
}

function closeDrawer({ fromHash = false } = {}) {
  if (!drawerJobId) return;
  const closedId = drawerJobId;
  // ...existing...
  for (const n of BEHIND()) if (n) n.inert = false;
  const target = drawerReturnFocus?.isConnected ? drawerReturnFocus
    : $(`.card[data-id="${cssId(closedId)}"]`) || $('#resultsList');
  target?.focus({ preventScroll: true });
  drawerReturnFocus = null;
}

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])')]
    .filter((x) => x.offsetParent !== null);
  if (!f.length) { e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (!root.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
```

Also consider `tabindex="0"` on `.drawer-scroll` so keyboard users can scroll a long description without tabbing through every link. Esc handling (`:1461-1466`) is correct: popover first, then drawer, then filters, then sheet.

### M5. Salary bounds and filters are currency-blind

**Where**
- `server/salary.js:9-10,172,214`: `MIN_ANNUAL`/`MAX_ANNUAL` are applied to the **native** amount. A typical Tokyo posting (¥8,000,000-¥12,000,000) or Bangalore posting (₹3,000,000-₹6,000,000 is fine, but ₹60L+ is not) exceeds 5,000,000 and is dropped (`salary: null`), so it shows as "No salary".
- `public/app.js:291` and `:354-362`: the salary filter, slider domain and histogram compare native `salary.min/max` against a USD-labelled slider, while the chart (`chart.js:111`) and `features/shared.js:46` convert to approximate USD. A £95K job filtered at "$100K+" is excluded even though the chart plots it at about $121K.

**Patch** (server): bound in approximate USD.

```js
// server/salary.js
const FX_TO_USD = { USD: 1, GBP: 1.27, EUR: 1.09, CAD: 0.73, AUD: 0.66, JPY: 0.0067, SGD: 0.74, CHF: 1.13, INR: 0.012, KRW: 0.00073 };
const approxUSD = (v, cur) => v * (FX_TO_USD[String(cur || 'USD').toUpperCase()] ?? 1);
// toJobSalary(), replace line 214:
if (!(approxUSD(aMin, sal.currency) >= MIN_ANNUAL && approxUSD(aMax, sal.currency) <= MAX_ANNUAL)) return null;
// evaluate(), line 172: same check using `currency || 'USD'`
```

**Patch** (client): filter on USD.

```js
// public/app.js prepare():
import { salaryUSD } from './features/shared.js';
j._usd = j.salary ? salaryUSD(j) : null;          // { min, mid, max } in approx USD, or null
j._mid = j._usd ? j._usd.mid : null;
// failures():
if (salActive && (!j._usd || (F.smin != null && j._usd.max < F.smin) || (F.smax != null && j._usd.min > F.smax))) out.push('sal');
// salaryDomain(): use j._usd.min / j._usd.max
```

---

## Low

### L1. Dot-only board slugs move the upstream path (same host only)

**Where**: `server/companies.js:4` (`SLUG_RE = /^[a-z0-9-_.]+$/i`) accepts `.` and `..`. `encodeURIComponent` leaves dots alone, and WHATWG URL parsing then collapses the segment (`greenhouse.js:9`, `ashby.js:6`, `lever.js:6`):

| board | resulting upstream URL |
|---|---|
| `..` | `https://boards-api.greenhouse.io/v1/jobs?...`, `https://api.ashbyhq.com/posting-api/?...`, `https://api.lever.co/v0/?...` |
| `.`  | `https://boards-api.greenhouse.io/v1/boards/jobs?...` |

The host is a fixed literal, so this is **not** an SSRF to arbitrary hosts (verified: no source/board value changes the hostname, and `source` is allow-listed). It does let a caller reach other unauthenticated paths on the vendor API through the server, and it creates cache files such as `greenhouse-...json`.

**Patch**:

```js
// server/companies.js
const SLUG_RE = /^[a-z0-9](?:[a-z0-9_.-]{0,98}[a-z0-9])?$/i;   // must start and end alphanumeric
export function isValidSlug(s) {
  return typeof s === 'string' && SLUG_RE.test(s) && !s.includes('..');
}
```

This matches the client-side pattern in `public/app.js:948,968`.

### L2. Upstream fetch: redirects, body size and concurrency

**Where**: `server/sources/util.js:11-14` (`fetch` with default `redirect: 'follow'`) and `:29` (`res.json()` with no size limit). There is no global limit on concurrent upstream fetches.

**Patch**:

```js
// util.js fetchJson()
const MAX_BYTES = 25 * 1024 * 1024;
res = await fetch(url, { headers: {...}, signal: ctrl.signal, redirect: 'error' });
// ...
const len = Number(res.headers.get('content-length') || 0);
if (len > MAX_BYTES) throw new Error(`${label}: response too large (${len} bytes)`);
const reader = res.body.getReader(); const chunks = []; let n = 0;
for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length;
  if (n > MAX_BYTES) { ctrl.abort(); throw new Error(`${label}: response exceeded ${MAX_BYTES} bytes`); } chunks.push(value); }
return JSON.parse(Buffer.concat(chunks).toString('utf8'));
```

```js
// index.js: simple global semaphore around fetchLive
let active = 0; const MAX_ACTIVE = 4; const waiters = [];
async function withSlot(fn) {
  if (active >= MAX_ACTIVE) await new Promise((r) => waiters.push(r));
  active++; try { return await fn(); } finally { active--; waiters.shift()?.(); }
}
// p = withSlot(() => fetchLive(company)).finally(...)
```

The 15 s `AbortController` timeout (`util.js:4,7-8`) also covers the body read, which is good. Node's default `headersTimeout` (60 s) and `requestTimeout` (300 s) are acceptable.

### L3. Display name from one caller is cached for everyone

**Where**: `server/index.js:68` passes the per-request `company` (including the user-supplied `name`, `companies.js:60-63`) into `fetchLive`. `normalize.js:59` stores `companyName: company.name` in every job, and `setCached` (`index.js:72`) persists those jobs for every later caller of that board, in memory and on disk. The current UI prefers `data.company.name` (`app.js:1313,1327`), so there is no visible effect today, and every render path uses text nodes, so there is no XSS. Other API consumers would still see the first caller's name.

**Patch**: normalize with a name-independent identity and stamp the name on the way out.

```js
// index.js getJobs()
const canonical = { ...company, name: company.custom ? titleCase(company.board) : company.name };
p = fetchLive(canonical) ...
const stamp = (jobs) => jobs.map((j) => (j.companyName === pub.name ? j : { ...j, companyName: pub.name }));
return { company: pub, mode: 'live', fetchedAt: entry.fetchedAt, error: null, jobs: stamp(jobs) };   // same for cache/snapshot/demo
```

### L4. Salary chart listbox semantics

**Where**: `public/viz/chart.js`
- `:72-77, :205-226`: `role="listbox"` contains group header `div`s that are neither `option` nor `group` (invalid ARIA children).
- `:97, :431-438, :497-502`: `activeIdx` and `aria-activedescendant` are not reset in `update()`/`render()`. After a filter change, Enter (`:448-450`) opens whichever job now sits at the old index, with no visible active marker.
- `:243` plus `viz.css:234-243`: `.ms-row__val` (the salary text) is `visibility:hidden` unless hovered, so it is excluded from each option's accessible name. Screen readers hear only the title.
- `viz.css:203`: the keyboard-active row is shown by a 1px `--_axis` ring at **2.0:1** (light) / **2.5:1** (dark) against the surface, which is below the 3:1 non-text contrast minimum (WCAG 1.4.11 / 2.4.7).
- `:62`: `aria-label` on a generic `div` (legend) is not exposed.

**Patch**:

```js
// render(): before rebuilding rows
const activeJobId = itemByRow[activeIdx]?.job.id ?? null;
activeIdx = -1; body.removeAttribute('aria-activedescendant');
// per group: wrap rows
const grp = el('div'); grp.setAttribute('role', 'group');
name.id = `${uid}-g${gi}`; grp.setAttribute('aria-labelledby', name.id);   // header stays outside or gets role="presentation"
// per row:
r.setAttribute('aria-label', `${p.job.title || 'Untitled'}, ${rangeText(p)}`);
r.setAttribute('aria-selected', 'false');
// after rows are built:
if (activeJobId) { const i = itemByRow.findIndex((p) => p.job.id === activeJobId); if (i >= 0) setActive(i, false); }
// setActive(): previous?.setAttribute('aria-selected','false'); r.setAttribute('aria-selected','true');
legend.setAttribute('role', 'group');
```

```css
/* viz.css:203 */
.ms-row.is-active::before { box-shadow: inset 0 0 0 2px var(--_accent); }   /* accent is 4.3:1 / 4.8:1 */
```

Also consider Home/End/PageUp/PageDown in `onKey` (`:441`).

### L5. Data-source badge is only explained by `title`

**Where**: `public/index.html:55` (`<div class="data-badge" tabindex="0">`) and `public/app.js:496-517`. Mode details and live-fetch error text are only in `title` (not shown on focus or touch). `aria-label` on a role-less `div` is not reliably announced, and a focusable element with no role is confusing.

**Patch**: make it a `<button type="button" class="data-badge" aria-describedby="dataBadgeTip">` that toggles a small popover whose `textContent` is `tip`, or put the tip in a visually-hidden `<span id="dataBadgeTip">`. Mark the `banner` (`#demoBanner`, already `role=status`) as the primary place for error text.

### L6. Reduced-motion preference not honored in JS-driven motion

**Where**: `public/viz/map.js:218,221` (`flyToBounds`/`flyTo`, `duration: 0.6`) and `public/viz/chart.js:467,474` (`behavior: 'smooth'` from `highlight()`, `:506`). CSS only disables the pin pulse (`viz.css:395`). `public/styles.css` (drawer and toast transitions) did not exist at review time. See the re-check.

**Patch**:

```js
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// map.js
map.flyToBounds(bounds, { maxZoom: 12, duration: 0.6, animate: !reduceMotion() });
if (z > map.getZoom()) reduceMotion() ? map.setView([c.lat, c.lng], z) : map.flyTo([c.lat, c.lng], z, { duration: 0.6 });
// chart.js scrollToRow
const behavior = smooth && !reduceMotion() ? 'smooth' : 'auto';
```

```css
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; scroll-behavior: auto !important; } }
```

### L7. Internal error details returned to clients

**Where**: `server/index.js:177` returns `err.message` on 500. `server/sources/util.js:24-26` includes up to 200 chars of the upstream body and the full upstream URL in the error, which `index.js:75` forwards in `error`. The UI shows it (`app.js:505`, `:1075`) as text, so this is not XSS.

**Patch**: log details server-side and return generic text.

```js
// index.js:177
if (!res.headersSent) sendJson(req, res, 500, { error: 'Internal error' });
// index.js:75
console.warn('[live]', company.slug, err); error = `Live fetch failed (${err?.status || err?.code || 'upstream error'})`;
```

### L8. `gzipSync` on large JSON blocks the event loop

**Where**: `server/index.js:96`. A 6.7 MB jobs payload took about 41 ms of synchronous CPU in a local measurement (repetitive text, so real descriptions will take longer), and every concurrent request waits on it.

**Patch**: `buf = await promisify(zlib.gzip)(buf)` (make `send` async), or cache the gzipped buffer next to the cache entry so each board compresses once per fetch.

### L9. Remaining HTML-string sinks

- `public/app.js:1259-1277,1312`: `salaryDistributionSvg()` builds markup with template strings and assigns it via `innerHTML`. Today it only interpolates numbers and `formatMoney()` output, so it is safe. It is still the only non-static `innerHTML` in the frontend, and a future edit that adds a label (for example the company name) would become an XSS sink. Build it with `document.createElementNS` (or `features/shared.js` `h('svg:rect', ...)`) instead.
- `public/app.js:23-24` and `public/features/shared.js:204-211`: an `on*` key with a non-function value falls through to `setAttribute`, which creates an inline handler. Add `else if (/^on/i.test(k)) continue;` before the `setAttribute` branch. The same applies to `href`/`src`: route them through `safeUrl()` inside `h()`.

### L10. Saved boards are not shape-validated

**Where**: `public/app.js:122-127` only checks truthiness. `source` is used as a key into `SOURCE_LABEL` (`:983`), and `board` is joined with `:` to form the state key (`:457`), which breaks for values containing `:`. This is same-origin storage, so the impact is limited to self-inflicted breakage. It is still cheap to harden.

```js
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
return Array.isArray(v) ? v.filter((b) => b && ['greenhouse', 'ashby', 'lever'].includes(b.source) && typeof b.board === 'string' && SLUG.test(b.board))
  .map((b) => ({ source: b.source, board: b.board, name: typeof b.name === 'string' ? b.name.slice(0, 80) : b.board })) : [];
```

### L11. Link destinations

- `public/app.js:1323`: "Apply on {Greenhouse|Ashby|Lever}" links to `job.url`. For custom boards that is whatever the board owner configured (often a third-party careers site). `safeUrl` correctly restricts it to http/https. Show the host so users know where they are going: ``Apply on ${new URL(safeUrl(job.url), location.href).hostname}``.
- `public/app.js:1345-1347,1369`: `safeUrl` resolves relative `href`s in third-party descriptions against the app's own origin (for example `href="/api/jobs?..."` or `href="#c=..."`), turning them into same-origin links that open in a new tab. Resolve description links against the posting's own URL instead (`new URL(href, job.url)`), or drop relative ones.

---

## Correctness

### C1. Annualization note never shows

`server/salary.js:217` always sets `interval: 'year'` and stores the source interval in `originalInterval` (`:220`). `public/viz/chart.js:382` and `public/app.js:1309` test `s.interval !== 'year'`, which is never true, so hourly or monthly postings look like they were quoted annually. `${s.interval}ly` would also produce "dayly".

```js
const ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly' };
const orig = s.originalInterval || (s.interval && s.interval !== 'year' ? s.interval : null);
if (orig) tip.append(el('div', 'ms-tip__sub', `Annualized from ${ADJ[orig] || orig} pay`));
```

### C2. Request-target parsing and HEAD

- `server/index.js:137`: `new URL(req.url, 'http://localhost')` treats a request target starting with `//` as an authority (`GET //api/jobs` turns into host `api`, path `/jobs`). This is harmless today but surprising. Use `new URL(req.url.replace(/^\/{2,}/, '/'), 'http://localhost')`.
- `server/index.js:141-151`: `HEAD /api/jobs` runs the whole live-fetch pipeline (the Dockerfile healthcheck uses `GET /api/companies`, which is fine). Answer HEAD for `/api/jobs` from cache only, or with 405.

### C3. Server cannot start without `server/demo.js`

`server/index.js:15` statically imports `./demo.js`. At review time the file did not exist, so `node server/index.js` (and the CI smoke test) fail at import. If demo stays optional, use `const { demoJobs } = await import('./demo.js').catch(() => ({ demoJobs: () => [] }))`.

---

## Verified OK

- **Static path traversal**: `safeJoin` (`server/index.js:110-117`) was tested against `../`, `%2e%2e/`, `..%2f`, `..\`, `%5c..`, `%00`, invalid percent-encoding and `//`. Every case resolves inside `public/` (or `node_modules/leaflet/dist`) or is rejected. Directory requests serve `index.html` only.
- **SSRF to arbitrary hosts**: `source` is allow-listed (`companies.js:3,51`). The hostname is a literal in each adapter, the board is `encodeURIComponent`-ed, and no user value changes the host or scheme. Only the same-host path issue L1 remains.
- **Description HTML**: `sanitizeHtml` (`public/app.js:1353-1378`) parses with `DOMParser` (inert), rebuilds only allow-listed elements with **no attributes** except `href` checked by `safeUrl` (http/https), drops script/style/svg/math/template/noscript/iframe/img/form and so on, and appends text with text nodes. Nothing is re-serialized, so mXSS does not apply. The mock fixture's `<script>`, `onclick` and `onerror` payloads are neutralized by design.
- **Other DOM sinks**: `chart.js` and `map.js` use `textContent` throughout. Leaflet `divIcon` gets an `Element` (`map.js:208`), and `bindTooltip` returns an `Element`, which Leaflet appends instead of using `innerHTML` (`leaflet-src.js` `_updateContent`). `features/shared.js` `h()` and `createTooltip` use text nodes only. Every `html:` in `app.js` except L9 is a static `ICON` constant. Error and keyword strings render as text.
- **Hash state**: `parseHash` (`app.js:182-196`) only reads keys from the fixed `ORDER` list into a `structuredClone` of `DEFAULTS`, so there is no prototype pollution. Numeric keys are coerced, and `m`/`r` are allow-listed. `sort` falls back to the default. Unknown `g`/`cb` values degrade to "All". CSS selectors built from ids go through `CSS.escape` (`cssId`).
- **Apply link**: `safeUrl` blocks `javascript:` and other schemes. `target=_blank` links carry `rel="noopener noreferrer"`.
- **No open redirect**: the server issues no redirects, and client navigation is same-document `pushState`.
- **Keyboard reachability (positive)**: quick chips, company pills, segmented controls, keyword chips (`aria-pressed`), checklists (native checkboxes with labels), range sliders (`aria-valuetext`), `details/summary` sections and result cards (`role=button`, Enter/Space, arrow keys) are all keyboard-operable. The popover moves focus in and restores it on Esc. `#resultsTitle` is a polite live region, and the toast uses `role=status`.
- **Contrast (viz tokens)**: muted text is 6.3:1 (light) / 7.3:1 (dark) on the surface, and pin text uses `inkOn()`, which picks the higher-contrast ink. Accent `#2a78d6` on `#fcfcfb` is 4.30:1, which is fine for UI strokes but **below 4.5:1 for small text**. Check `styles.css` if the accent is used for body-size link text.

## Re-check

_(filled in at the end of the review window, see below)_

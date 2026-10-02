# Adding a board

There are three ways to get a company into melon-seek, from least to most work.

## 1. In the UI: "Add board" (no code)

Open the company switcher and choose **Add board**. Pick the source
(Greenhouse, Ashby or Lever), enter the board slug and an optional display name.
This calls:

```
GET /api/jobs?source=<greenhouse|ashby|lever>&board=<slug>&name=<Display>
```

Custom boards get the slug `<source>-<board>`, a deterministic colour, and the
same cache → snapshot → demo fallbacks as built-ins. They're kept in the URL
hash, so you can share the link.

### Finding the slug

| Source | Careers page looks like | Slug | Check it with |
| --- | --- | --- | --- |
| Greenhouse | `job-boards.greenhouse.io/acme`, `boards.greenhouse.io/acme` | `acme` | `https://boards-api.greenhouse.io/v1/boards/acme/jobs` |
| Ashby | `jobs.ashbyhq.com/acme` | `acme` | `https://api.ashbyhq.com/posting-api/job-board/acme` |
| Lever | `jobs.lever.co/acme` | `acme` | `https://api.lever.co/v0/postings/acme?mode=json` |

Company-branded careers pages often embed one of these; look for the domain in
the page source or network tab. Slugs may only contain letters, digits, `-`,
`_` and `.`. A wrong slug returns an error (`board not found`) and falls back to
demo data, labelled as such.

## 2. As a built-in company (`server/companies.js`)

Add an entry to `COMPANIES`:

```js
export const COMPANIES = [
  // ...
  { slug: 'acme', name: 'Acme', source: 'lever', board: 'acme', color: '#7c3aed' },
];
```

- `slug` — stable id used in `?company=`, job ids (`acme:<sourceId>`), cache
  files and `data/snapshots/acme.json`. Lowercase, URL-safe.
- `source` — one of `SOURCES` (`greenhouse`, `ashby`, `lever`).
- `board` — the slug at that source (may differ from `slug`, e.g. Anduril is
  `andurilindustries`).
- `color` — brand-ish accent for the switcher.

Then:

```sh
npm test
npm run snapshot -- acme    # optional: local data/snapshots/acme.json (gitignored)
```

Nothing else needs to change. The `snapshot` and `pages` workflows run
`npm run snapshot` with no arguments, which covers every built-in. The static
build (`npm run build`) also bundles `api/jobs/<slug>.json` for every company
that `server/companies.js` returns.

## 3. A new source adapter

If the company uses another ATS with a public JSON API (e.g. Workable,
SmartRecruiters), write an adapter.

1. **Create `server/sources/<source>.js`** exporting
   `fetch<Source>(board) -> Promise<RawJob[]>`. Use the helpers in
   `server/sources/util.js`: `fetchJson(url, { label })` (timeout, `User-Agent`,
   readable errors), `decodeHtmlContent`, `htmlToText`, `str`.

   ```js
   import { fetchJson, htmlToText, str } from './util.js';

   export function acmeAtsUrl(board) {
     return `https://api.example-ats.com/v1/${encodeURIComponent(board)}/jobs`;
   }

   export async function fetchAcmeAts(board) {
     const data = await fetchJson(acmeAtsUrl(board), { label: `acmeats/${board}` });
     if (!Array.isArray(data?.jobs)) throw new Error(`acmeats/${board}: no jobs array`);
     return data.jobs.map(mapAcmeAtsJob);
   }

   export function mapAcmeAtsJob(j) {
     const html = j.description_html || '';
     return {
       sourceId: String(j.id),
       title: str(j.title) || 'Untitled role',
       department: str(j.department),
       team: str(j.team),
       employmentType: str(j.employment_type),
       locationText: str(j.location) || '',
       extraLocations: [],
       remote: typeof j.remote === 'boolean' ? j.remote : null,
       html,
       text: htmlToText(html),
       url: j.url,
       updatedAt: j.updated_at || null,
       salary: null, // or { min, max, currency, interval, text } if structured
     };
   }
   ```

   The output must match the **RawJob** shape in [CONTRACT.md](CONTRACT.md).
   Return decoded HTML (not entity-escaped). Leave `salary: null` if the source
   has no structured pay; `normalize.js` will parse it from the text.

2. **Register the source**: add it to `SOURCES` in `server/companies.js` and to
   the adapter dispatch in the server (where `fetchGreenhouse` / `fetchAshby` /
   `fetchLever` are selected by `company.source`).

3. **Expose it in the UI**: add the option to the "Add board" source picker in
   `public/app.js`.

4. **Test it** with a recorded fixture: add `test/<source>.test.js` that feeds a
   saved JSON response through `map<Source>Job` and asserts the RawJob fields
   (no network in tests).

5. **Document it**: add the endpoint to "Data sources" in the README.

Keep the responsible-use rules: public endpoints only, no auth scraping, and
rely on the 30-minute cache rather than adding polling.

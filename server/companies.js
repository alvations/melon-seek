// Company registry: built-in boards + validation for custom boards.

export const SOURCES = ['greenhouse', 'ashby', 'lever'];
// Must start and end alphanumeric and contain no "..", so "." / ".." can never
// move the upstream URL path (review L1). Same rule as the client (public/app.js).
const SLUG_RE = /^[a-z0-9](?:[a-z0-9_.-]{0,98}[a-z0-9])?$/i;

export const COMPANIES = [
  { slug: 'anthropic', name: 'Anthropic', source: 'greenhouse', board: 'anthropic', color: '#d97757' },
  { slug: 'anduril', name: 'Anduril', source: 'greenhouse', board: 'andurilindustries', color: '#1f2a37' },
  { slug: 'openai', name: 'OpenAI', source: 'ashby', board: 'openai', color: '#10a37f' },
  // Confirmed boards from docs/DATA_SOURCES.md §6 (Mistral AI removed: lever/mistral
  // returned 0 jobs on the first real-data run, 2026-10-02).
  // A company may set maxBytes to override the upstream body cap (see server/index.js maxBytesFor).
  { slug: 'scaleai', name: 'Scale AI', source: 'greenhouse', board: 'scaleai', color: '#6e3cf2' },
  { slug: 'xai', name: 'xAI', source: 'greenhouse', board: 'xai', color: '#3b3b3b' },
  { slug: 'cohere', name: 'Cohere', source: 'ashby', board: 'cohere', color: '#39594d' },
  { slug: 'palantir', name: 'Palantir', source: 'lever', board: 'palantir', color: '#101113' },
  { slug: 'shieldai', name: 'Shield AI', source: 'lever', board: 'shieldai', color: '#1c6dd0' },
  // v3 beta channel (docs/CONTRACT.md "v3 additions", docs/DATA_SOURCES.md §7):
  // big-tech career sites, shown only at /melon-seek/beta/. They send no CORS
  // headers, so `live: false`: the browser never fetches them; static mode
  // serves the bundled snapshot (`node scripts/snapshot.js --channel beta`).
  // Each source is built-in only (not in SOURCES, never a custom board), and
  // `board` is a key into that adapter's fixed host table.
  { slug: 'google', name: 'Google', source: 'google', board: 'google', color: '#4285f4', channel: 'beta', live: false },
  { slug: 'microsoft', name: 'Microsoft', source: 'eightfold', board: 'microsoft', color: '#00a4ef', channel: 'beta', live: false },
  // PAUSED (2026-10-10, lead): Meta's Automated Data Collection Terms bar automated collection
  // "without ... express written permission", even though robots.txt and the sitemap expose the
  // job pages. Not crawled until the user decides (docs/DATA_SOURCES.md §7 "Terms of use").
  // RESUMED (2026-10-11, by the user: "Resume both now", choosing to accept the legal risk after the verified terms were put to them (docs/AMAZON_META.md, "Decision")). See PAUSING.
  { slug: 'meta', name: 'Meta', source: 'meta', board: 'meta', color: '#0866ff', channel: 'beta', live: false },
  { slug: 'apple', name: 'Apple', source: 'apple', board: 'apple', color: '#6e6e73', channel: 'beta', live: false },
  { slug: 'netflix', name: 'Netflix', source: 'eightfold', board: 'netflix', color: '#e50914', channel: 'beta', live: false },
  // PAUSED (2026-10-10, lead): Amazon's Conditions of Use exclude "data mining, robots, or similar
  // data gathering and extraction tools". Not crawled until the user decides (DATA_SOURCES §7).
  // RESUMED (2026-10-11, by the user: "Resume both now", choosing to accept the legal risk after the verified terms were put to them (docs/AMAZON_META.md, "Decision")). See PAUSING.
  // No posting budget (2026-10-11). The 5,000-posting maxPostings was removed at the user's word: "Why
  // are you capping the no of posting we must present them as they are and not cut anything". Every
  // posting of every board is published (scripts/snapshot.js#fitSnapshot never drops one); the
  // whole board's phone cost is handled in the browser (docs/process/perf-mobile-beta-2.md).
  { slug: 'amazon', name: 'Amazon', source: 'amazon', board: 'amazon', color: '#ff9900', channel: 'beta', live: false },
  // NVIDIA's own careers site (jobs.nvidia.com) is an Eightfold tenant; its Workday
  // CXS API was in a maintenance redirect during the first probe.
  { slug: 'nvidia', name: 'NVIDIA', source: 'eightfold', board: 'nvidia', color: '#76b900', channel: 'beta', live: false },
  // Tesla is left out: tesla.com answers every plain request (robots.txt, the careers
  // API, the careers page) with an Akamai "Access Denied" 403 (probe 2026-10-10), and
  // getting around bot protection is out of bounds. See docs/DATA_SOURCES.md §7.
];

/** Channels: 'stable' (no `channel` field) and 'beta'. */
export const CHANNELS = Object.freeze(['stable', 'beta']);
const channelOf = (c) => c.channel || 'stable';

/**
 * Built-in companies for a channel (docs/CONTRACT.md v3):
 * 'stable' (default) -> stable companies only, exactly the pre-v3 list;
 * 'beta' or 'all'    -> stable companies plus the beta ones.
 */
export function listCompanies({ channel = 'stable', includePaused = false } = {}) {
  const ch = String(channel || 'stable').toLowerCase();
  if (ch !== 'stable' && ch !== 'beta' && ch !== 'all') throw new Error(`Unknown channel "${channel}" (expected stable, beta or all)`);
  // A `paused` built-in (e.g. paused: 'terms', its site's terms bar automated collection) is
  // never crawled, built or listed unless asked for explicitly; getCompany() still resolves it.
  const list = (ch === 'stable' ? COMPANIES.filter((c) => channelOf(c) === 'stable') : COMPANIES)
    .filter((c) => includePaused || !c.paused);
  return list.map((c) => ({ ...c }));
}

/**
 * PAUSING. `paused: '<reason>'` on a built-in is the one switch that keeps a company out of
 * every stage (docs/process/amazon-meta-backend.md "The resume switch"):
 *   - listCompanies() leaves it out unless `includePaused`, so it is not in snapshot.yml's crawl
 *     matrix (.github/scripts/beta-snapshots.mjs slugs), not merged into the beta artifact (the
 *     merge removes a paused company's old files), not built into /beta/ and not on its company
 *     list, the market comps or the share pages; the archive only ever sees what a crawl uploads;
 *   - its adapter refuses to start before its first request (crawlBlock, UpstreamError code
 *     'paused'), whoever calls it: scripts/snapshot.js <slug>, server/pipeline.js#fetchLive or the
 *     probe's full mode; scripts/probe-bigtech.js also skips it in recon and refuses its career
 *     hosts in raw mode;
 *   - getCompany() still resolves it, so links to it get a plain "paused" message (server/index.js).
 * To RESUME: delete the `paused` field and record the decision in the comment above the entry.
 * Nothing else changes: the next 6-hourly snapshot.yml run crawls it, the merge, archive and
 * pages.yml pick up its file, and /beta/ lists it (test/amazon-meta-resume.test.js runs every
 * stage on a copy of the tree with the field removed).
 */
export const PAUSE_REASONS = Object.freeze({ terms: 'its careers site’s terms don’t allow automated collection' });

/**
 * The paused built-in behind an adapter's (source, board), or null when it may be crawled:
 * { slug, name, paused, reason }. Read at call time, so a test that edits COMPANIES sees it.
 */
export function crawlBlock(source, board) {
  const c = COMPANIES.find((x) => x.source === source && String(x.board).toLowerCase() === String(board || '').toLowerCase());
  if (!c || !c.paused) return null;
  return { slug: c.slug, name: c.name, paused: c.paused, reason: PAUSE_REASONS[c.paused] || String(c.paused) };
}

/** Any built-in on any channel; the result carries `channel` ('stable' or 'beta'). */
export function getCompany(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase();
  const c = COMPANIES.find((x) => x.slug === s);
  return c ? { ...c, channel: channelOf(c) } : null;
}

export function isValidSlug(s) {
  return typeof s === 'string' && SLUG_RE.test(s) && !s.includes('..');
}

function colorFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 45%)`;
}

/** Name-independent display name for a custom board (used for cached data). */
export function defaultName(board) {
  return titleCase(String(board || ''));
}

function titleCase(s) {
  return s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}

/**
 * Resolve a company from query params.
 * - { company: "anthropic" } -> built-in
 * - { source, board, name? } -> custom board
 * Throws Error with .status = 400/404 on invalid input.
 */
export function resolveCompany(query = {}) {
  const get = (k) => (typeof query.get === 'function' ? query.get(k) : query[k]);
  const companyParam = get('company');
  const source = get('source');
  const board = get('board');

  if (source || board) {
    const src = String(source || '').toLowerCase();
    if (!SOURCES.includes(src)) {
      throw httpError(400, `Invalid source. Expected one of: ${SOURCES.join(', ')}`);
    }
    if (!isValidSlug(board)) {
      throw httpError(400, 'Invalid board slug. Use letters, digits, - _ . (must start and end with a letter or digit)');
    }
    // A built-in with the same source/board keeps its identity.
    const builtin = COMPANIES.find((c) => c.source === src && c.board.toLowerCase() === board.toLowerCase());
    if (builtin) return { ...builtin, channel: channelOf(builtin) };
    let name = get('name');
    name = typeof name === 'string' ? name.trim().slice(0, 80) : '';
    const slug = `${src}-${board.toLowerCase()}`;
    return { slug, name: name || titleCase(board), source: src, board, color: colorFromString(slug), custom: true };
  }

  if (companyParam) {
    const c = getCompany(companyParam);
    if (!c) throw httpError(404, `Unknown company "${companyParam}"`);
    return c;
  }
  throw httpError(400, 'Missing ?company= or ?source=&board=');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

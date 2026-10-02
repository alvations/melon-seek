// Company registry: built-in boards + validation for custom boards.

export const SOURCES = ['greenhouse', 'ashby', 'lever'];
// Must start and end alphanumeric and contain no "..", so "." / ".." can never
// move the upstream URL path (review L1). Same rule as the client (public/app.js).
const SLUG_RE = /^[a-z0-9](?:[a-z0-9_.-]{0,98}[a-z0-9])?$/i;

export const COMPANIES = [
  { slug: 'anthropic', name: 'Anthropic', source: 'greenhouse', board: 'anthropic', color: '#d97757' },
  { slug: 'anduril', name: 'Anduril', source: 'greenhouse', board: 'andurilindustries', color: '#1f2a37' },
  { slug: 'openai', name: 'OpenAI', source: 'ashby', board: 'openai', color: '#10a37f' },
  // Confirmed boards from docs/DATA_SOURCES.md §4.
  { slug: 'scaleai', name: 'Scale AI', source: 'greenhouse', board: 'scaleai', color: '#6e3cf2' },
  { slug: 'xai', name: 'xAI', source: 'greenhouse', board: 'xai', color: '#3b3b3b' },
  { slug: 'cohere', name: 'Cohere', source: 'ashby', board: 'cohere', color: '#39594d' },
  { slug: 'palantir', name: 'Palantir', source: 'lever', board: 'palantir', color: '#101113' },
  { slug: 'shieldai', name: 'Shield AI', source: 'lever', board: 'shieldai', color: '#1c6dd0' },
  { slug: 'mistral', name: 'Mistral AI', source: 'lever', board: 'mistral', color: '#fa520f' },
];

export function listCompanies() {
  return COMPANIES.map((c) => ({ ...c }));
}

export function getCompany(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase();
  const c = COMPANIES.find((x) => x.slug === s);
  return c ? { ...c } : null;
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
    if (builtin) return { ...builtin };
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

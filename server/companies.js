// Company registry: built-in boards + validation for custom boards.

export const SOURCES = ['greenhouse', 'ashby', 'lever'];
const SLUG_RE = /^[a-z0-9-_.]+$/i;

export const COMPANIES = [
  { slug: 'anthropic', name: 'Anthropic', source: 'greenhouse', board: 'anthropic', color: '#d97757' },
  { slug: 'anduril', name: 'Anduril', source: 'greenhouse', board: 'andurilindustries', color: '#1f2a37' },
  { slug: 'openai', name: 'OpenAI', source: 'ashby', board: 'openai', color: '#10a37f' },
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
  return typeof s === 'string' && s.length > 0 && s.length <= 100 && SLUG_RE.test(s);
}

function colorFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 45%)`;
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
      throw httpError(400, `Invalid source "${source}". Expected one of: ${SOURCES.join(', ')}`);
    }
    if (!isValidSlug(board)) {
      throw httpError(400, `Invalid board slug "${board ?? ''}". Use letters, digits, - _ .`);
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

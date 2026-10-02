// Shared helpers for board adapters.

export const USER_AGENT = 'melon-seek/0.1 (+https://github.com/; job board visualizer)';
export const TIMEOUT_MS = 15000;

export async function fetchJson(url, { timeoutMs = TIMEOUT_MS, label = 'source' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw new Error(`${label}: request timed out after ${timeoutMs / 1000}s (${url})`);
    const cause = err && err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    throw new Error(`${label}: network error fetching ${url}: ${err && err.message}${cause}`);
  }
  try {
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 200).replace(/\s+/g, ' '); } catch {}
      const hint = res.status === 404 ? ' — board not found (check the slug)' : '';
      throw new Error(`${label}: HTTP ${res.status} ${res.statusText || ''} from ${url}${hint}${body ? `: ${body}` : ''}`.replace(/\s+:/, ':'));
    }
    try {
      return await res.json();
    } catch (err) {
      throw new Error(`${label}: invalid JSON from ${url}: ${err.message}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•',
  middot: '·', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™', times: '×' };

/** Decode HTML entities once. */
export function decodeEntitiesOnce(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const v = NAMED[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

/**
 * Decode entity-escaped HTML (Greenhouse `content`), handling double escaping
 * like "&amp;lt;p&amp;gt;". Repeats while the string still looks escaped
 * (contains &lt;tag or &amp;entity;) up to 3 passes.
 */
export function decodeHtmlContent(s) {
  if (s == null) return '';
  let out = String(s);
  for (let i = 0; i < 3; i++) {
    const looksEscaped = /&lt;\/?[a-z!]/i.test(out) || /&amp;(#?\w+);/i.test(out) || (i === 0 && /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(out));
    if (!looksEscaped) break;
    const next = decodeEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** HTML -> readable plain text. */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntitiesOnce(s).replace(/ /g, ' ');
  return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

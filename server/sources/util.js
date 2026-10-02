// Shared helpers for board adapters.

export const USER_AGENT = 'melon-seek/0.1 (+https://github.com/; job board visualizer)';
export const TIMEOUT_MS = 15000;

/** Default body cap: custom (user-supplied) boards. */
export const MAX_BYTES = 25 * 1024 * 1024;
/** Body cap for built-in boards (Anduril's list with content is > 25 MB). */
export const MAX_BYTES_BUILTIN = 120 * 1024 * 1024;

/**
 * Upstream error. `message` is detailed (URL, status, body excerpt) for the
 * server log and the snapshot CLI; `code`/`status` let the API build a
 * generic client-facing message (review L7).
 */
export class UpstreamError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code || 'upstream';
    if (status != null) this.status = status;
  }
}

async function readCapped(res, maxBytes, ctrl, label) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new UpstreamError(`${label}: response too large (${len} bytes > ${maxBytes})`, { code: 'too_large' });
  if (!res.body) return '';
  // Web-standard APIs only (no Buffer): this module is also bundled for the browser.
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) {
      ctrl.abort();
      try { await reader.cancel(); } catch {}
      throw new UpstreamError(`${label}: response exceeded ${maxBytes} bytes`, { code: 'too_large' });
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/**
 * GET JSON with a timeout (covers headers and body), a User-Agent, no
 * redirects (review L2: the host stays the fixed vendor host) and a body cap.
 */
export async function fetchJson(url, { timeoutMs, label = 'source', maxBytes } = {}) {
  if (!(maxBytes > 0)) maxBytes = MAX_BYTES;
  if (!(timeoutMs > 0)) timeoutMs = TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const timedOut = () => new UpstreamError(`${label}: request timed out after ${timeoutMs / 1000}s (${url})`, { code: 'timeout' });
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal,
      redirect: 'error',
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw timedOut();
    const cause = err && err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    throw new UpstreamError(`${label}: network error fetching ${url}: ${err && err.message}${cause}`, { code: 'network' });
  }
  try {
    if (!res.ok) {
      let body = '';
      try { body = (await readCapped(res, 64 * 1024, ctrl, label)).slice(0, 200).replace(/\s+/g, ' '); } catch {}
      const hint = res.status === 404 ? ' — board not found (check the slug)' : '';
      throw new UpstreamError(
        `${label}: HTTP ${res.status} ${res.statusText || ''} from ${url}${hint}${body ? `: ${body}` : ''}`.replace(/\s+:/, ':'),
        { code: 'http', status: res.status },
      );
    }
    let raw;
    try {
      raw = await readCapped(res, maxBytes, ctrl, label);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      if (err && err.name === 'AbortError') throw timedOut();
      throw new UpstreamError(`${label}: error reading response from ${url}: ${err && err.message}`, { code: 'network' });
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new UpstreamError(`${label}: invalid JSON from ${url}: ${err.message}`, { code: 'invalid_json' });
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

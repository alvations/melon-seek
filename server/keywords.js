// Job description parsing: bullet sections, keyword facets and seniority.
// No DOM library: a small regex tokenizer walks the HTML.
import { SALES_CONDITIONAL_RE } from './salary.js';

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', bull: '•', middot: '·',
  trade: '™', reg: '®', copy: '©', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä',
  ntilde: 'ñ', ccedil: 'ç', pound: '£', euro: '€', yen: '¥', cent: '¢', times: '×', shy: '',
  zwj: '', zwnj: '', ensp: ' ', emsp: ' ', thinsp: ' ',
};

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function cleanText(s) {
  return decodeEntities(s)
    .replace(/[​ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanBullet(s) {
  return cleanText(s)
    .replace(/^[\s•·▪●◦‣∙*\-–—]+/, '')
    .replace(/[\s;,]+$/, '')
    .trim();
}

/**
 * `html` without <script>/<style> blocks and comments, in one pass (S-3, docs/REVIEW.md "beta
 * review 2026-10-11"). An opening "<script" or "<!--" with no end keeps the rest of the text,
 * where the lazy patterns rescanned to the end of the string from every such opening.
 */
function dropHidden(html) {
  const s = String(html || '');
  if (!/<(?:script|style|!--)/i.test(s)) return s;
  const open = /<(?:(script|style)[^<>]*>|!--)/gi;
  let out = '';
  let at = 0;
  let m;
  const ended = new Set(); // kinds with no closing tag left: later openings of that kind are text
  while ((m = open.exec(s))) {
    const kind = m[1] ? m[1].toLowerCase() : '!--';
    if (ended.has(kind)) continue;
    const close = m[1] ? new RegExp(`</${kind}>`, 'gi') : /-->/g;
    close.lastIndex = open.lastIndex;
    const c = close.exec(s);
    if (!c) { ended.add(kind); continue; }
    out += `${s.slice(at, m.index)} `;
    at = close.lastIndex;
    open.lastIndex = at;
  }
  return at ? out + s.slice(at) : s;
}

/** Plain text from HTML (block tags become newlines). Linear in the input (S-3). */
export function htmlToText(html) {
  return decodeEntities(
    dropHidden(html)
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|br|tr|section|article|header|blockquote|table)\b[^<>]*>/gi, '\n')
      .replace(/<[^<>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'td', 'th',
  'section', 'article', 'header', 'footer', 'blockquote', 'table', 'hr', 'dl', 'dt', 'dd',
]);
const BOLD_TAGS = new Set(['strong', 'b']);

// Bounded memo: normalizeJobs tokenizes each description for boilerplate
// detection, sections and keyword text; blocks are read-only to callers.
const BLOCK_MEMO = new Map();
const BLOCK_MEMO_MAX = 3000;

/** Tokenize HTML into a flat list of text blocks: {type:'h'|'li'|'p', text, bold}. */
function htmlToBlocks(html) {
  const key = String(html || '');
  const hit = BLOCK_MEMO.get(key);
  if (hit) return hit;
  const blocks = tokenizeBlocks(key);
  if (BLOCK_MEMO.size >= BLOCK_MEMO_MAX) BLOCK_MEMO.delete(BLOCK_MEMO.keys().next().value);
  BLOCK_MEMO.set(key, blocks);
  return blocks;
}

function tokenizeBlocks(html) {
  const src = dropHidden(html);
  const blocks = [];
  let buf = '';
  let boldChars = 0;
  let liDepth = 0;
  let headingDepth = 0;
  let boldDepth = 0;

  // A paragraph block next to a <br> is one line of a line-broken list (Apple writes its
  // "Responsibilities" and "Minimum Qualifications" as <p>line<br>line</p>): `line: true`.
  let afterBr = false;
  const flush = (byBr = false) => {
    const text = cleanText(buf);
    if (text) {
      const nonSpace = text.replace(/\s|[:：]/g, '').length || 1;
      const type = headingDepth > 0 ? 'h' : liDepth > 0 ? 'li' : 'p';
      const b = { type, text, bold: boldChars / nonSpace >= 0.8 };
      if (type === 'p' && (byBr || afterBr)) b.line = true;
      blocks.push(b);
      afterBr = byBr;
    } else if (!byBr) afterBr = false;
    buf = '';
    boldChars = 0;
  };

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*?(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined || m[5] !== undefined) {
      const t = m[4] !== undefined ? m[4] : m[5];
      buf += t;
      if (boldDepth > 0) boldChars += decodeEntities(t).replace(/\s|[:：]/g, '').length;
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (BOLD_TAGS.has(tag)) {
      boldDepth = Math.max(0, boldDepth + (closing ? -1 : 1));
      continue;
    }
    if (!BLOCK_TAGS.has(tag)) {
      buf += ' ';
      continue;
    }
    if (tag === 'br' && liDepth > 0) {
      buf += ' ';
      continue;
    }
    flush(tag === 'br');
    if (/^h[1-6]$/.test(tag)) headingDepth = Math.max(0, headingDepth + (closing ? -1 : 1));
    else if (tag === 'li') liDepth = Math.max(0, liDepth + (closing ? -1 : 1));
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Section classification
// ---------------------------------------------------------------------------

const RESP_HEADING_RE = /responsib|what you(?:'|’)?ll do|what you will do|you will|in this role|the role|day[- ]to[- ]day|what you(?:'|’)?ll be doing|your impact|key duties|duties|the job|what you(?:'|’)?ll work on|the opportunity|your mission/i;
const FIT_HEADING_RE = /good fit|qualifications|requirements|you have|you may be|about you|strong candidates|we(?:'|’)?re looking|we are looking|ideal candidate|preferred|bonus|nice to have|what we look for|minimum|basic|thrive|you(?:'|’)?ll need|you will need|you(?:'|’)?ll bring|you will bring|you will have|must have|who you are|skills|experience|what you bring|you might/i;
const FIT_STRONG_RE = /good fit|qualifications|requirements|you(?:'|’)?ll need|you will (?:need|bring|have)|you(?:'|’)?ll bring|must have|strong candidates|ideal candidate|thrive|nice to have|bonus/i;

/** Classify a heading text: "responsibilities" | "fit" | null. */
export function classifyHeading(text) {
  const t = String(text || '');
  const r = RESP_HEADING_RE.exec(t);
  const f = FIT_HEADING_RE.exec(t);
  if (r && f) {
    if (FIT_STRONG_RE.test(t)) return 'fit';
    return r.index <= f.index ? 'responsibilities' : 'fit';
  }
  if (r) return 'responsibilities';
  if (f) return 'fit';
  return null;
}

function isHeadingBlock(b) {
  if (b.type === 'h') return b.text.length <= 140;
  if (b.type !== 'p') return false;
  if (b.text.length > 110) return false;
  if (b.bold) return true;
  if (/[:：]\s*$/.test(b.text)) return true;
  // ALL-CAPS short line: "WHAT YOU'LL DO"
  if (b.text.length <= 60 && /[A-Z]/.test(b.text) && b.text === b.text.toUpperCase()) return true;
  return false;
}

const BULLET_P_RE = /^[•·▪●◦‣∙*\-–—]\s+/;

function dedupeList(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z“"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// BP-14 (fix wave 3): which list a "fit" heading starts. Checked in this order:
//   preferred: "Preferred qualifications", "Additional or preferred qualifications", "Nice to
//     have(s)", "Bonus points", "It's a bonus if you have", "Strong candidates may also have",
//     "Desired qualifications", "Qualifications souhaitées";
//   required: "Minimum qualifications", "Required/Minimum Qualifications", "Basic
//     qualifications", "Must haves", "Requirements", "Other requirements", "What you'll need",
//     and a plain "Qualifications" (Netflix "Qualifications" + "Nice to have");
//   soft: "You may be a good fit if you", "You might thrive in this role if you", "About you",
//     "Who you are", "What we're looking for": the posting does not say these are required, so a
//     posting with one of these lists is not split;
//   neutral: anything else ("Skills", "Experience", "Education"): the kind of the list before it.
const PREFERRED_HEADING_RE = /\b(?:preferred|prefer|nice[- ]to[- ]haves?|bonus(?:\s+points?)?|pluses|(?:a|big)\s+plus|desired|desirable|ideally|(?:may|might)\s+(?:also\s+)?have|also\s+(?:great|nice|good)|would\s+be\s+(?:great|nice|a\s+plus)|(?:great|good)\s+to\s+have|extra\s+credit|souhait[ée]e?s?)\b/i;
const REQUIRED_HEADING_RE = /\b(?:minimum|minimales?|basic|required|requirements?|must[- ]haves?|must\s+have|essential|qualifications?|what\s+you(?:'|’)?ll\s+need|you\s+will\s+need|you(?:'|’)?ll\s+need|what\s+we\s+need)\b/i;
const SOFT_HEADING_RE = /\b(?:good\s+fit|great\s+fit|strong\s+fit|thrive|about\s+you|who\s+you\s+are|you\s+might|you\s+may|looking\s+for|look\s+for|ideal\s+candidate|you\s+have|you\s+bring|you(?:'|’)?ll\s+bring|you\s+will\s+bring|you\s+are|you(?:'|’)?re|need\s+not)\b/i;
// A heading that names a list outright: Apple writes these lists as line-broken paragraphs
// (<h3>Minimum Qualifications</h3><p>line<br>line</p>), so each line under one is an item.
const LIST_HEADING_RE = /^(?:(?:key|basic|minimum|preferred|required|additional|desired)\s+)?(?:responsibilities|qualifications|requirements)\s*:?$/i;
// A wrapped line: the line before it ends mid-phrase ("… to<br>create design prototypes").
const LINE_CONTINUES_RE = /(?:\b(?:the|a|an|and|or|of|to|with|for|in|on|at|by|from|as|our|your|their|its|into|across|including|such|via|per|than|that|which|who|is|are|be|both|either|between)|[,;(/&–-])$/i;
/** 'preferred' | 'required' | 'soft' | 'neutral' for a heading that classifyHeading calls 'fit'. */
export function fitHeadingKind(text) {
  const t = String(text || '');
  if (/\bneed\s+not\b/i.test(t)) return 'soft';
  if (PREFERRED_HEADING_RE.test(t)) return 'preferred';
  if (REQUIRED_HEADING_RE.test(t)) return 'required';
  if (SOFT_HEADING_RE.test(t)) return 'soft';
  return 'neutral';
}

/**
 * Parse job description HTML into bullet lists grouped under headings.
 * Returns { responsibilities: string[], fit: string[], preferred?: string[] }. BP-14: when the
 * posting itself separates its required list from its preferred one ("Minimum qualifications" /
 * "Preferred qualifications": Google, Apple, Microsoft, Anduril, xAI), `fit` holds the required
 * items and `preferred` the preferred ones; otherwise `fit` holds every item and `preferred` is
 * absent (fitHeadingKind).
 */
export function extractSections(html, { skip = null } = {}) {
  const out = { responsibilities: [], fit: [] };
  if (!html) return out;
  const blocks = htmlToBlocks(html);
  let current = null;
  let listHeading = false;
  let fitKind = null;
  const respItems = [];
  const fitItems = [];
  let lastLine = null; // the item the previous line of a line-broken list went into
  for (const b of blocks) {
    const bulletPara = b.type === 'p' && BULLET_P_RE.test(b.text);
    if (!bulletPara && isHeadingBlock(b)) {
      current = classifyHeading(b.text);
      listHeading = LIST_HEADING_RE.test(b.text.trim());
      lastLine = null;
      if (current === 'fit') {
        const k = fitHeadingKind(b.text);
        fitKind = k === 'neutral' ? fitKind || 'required' : k;
      }
      continue;
    }
    // Bullets under a responsibilities/fit heading are role content and are
    // never treated as boilerplate (the facet guard handles ubiquitous ones).
    const lineItem = !!b.line && listHeading && current;
    if (!(b.type === 'li' || bulletPara || lineItem)) { lastLine = null; continue; }
    if (!current) continue;
    const t = cleanBullet(b.text);
    // BP-14: a wrapped line of Apple's line-broken lists continues the item before it.
    if (lineItem && lastLine && (/^[a-z(]/.test(t) || LINE_CONTINUES_RE.test(lastLine.t))) { lastLine.t = `${lastLine.t} ${t}`; continue; }
    if (t.length < 3) continue;
    const item = { t, kind: fitKind, line: lineItem };
    (current === 'fit' ? fitItems : respItems).push(item);
    lastLine = lineItem ? item : null;
  }
  out.responsibilities = dedupeList(respItems.map((x) => x.t));
  const kinds = new Set(fitItems.map((x) => x.kind));
  if (kinds.has('preferred') && kinds.has('required') && !kinds.has('soft')) {
    out.fit = dedupeList(fitItems.filter((x) => x.kind !== 'preferred').map((x) => x.t));
    const req = new Set(out.fit.map((x) => x.toLowerCase()));
    const pref = dedupeList(fitItems.filter((x) => x.kind === 'preferred').map((x) => x.t)).filter((x) => !req.has(x.toLowerCase()));
    if (pref.length) out.preferred = pref;
  } else {
    out.fit = dedupeList(fitItems.map((x) => x.t));
  }

  // An Apple posting whose duties are prose under "Description" and whose qualifications are
  // line-broken lists keeps its "You will …" sentences as responsibilities, as before BP-14.
  const respFromProse = !out.responsibilities.length && fitItems.length > 0 && fitItems.every((x) => x.line);
  if ((!out.responsibilities.length && !out.fit.length) || respFromProse) {
    // Fallback: prose descriptions — sentences starting "You will"/"You'll".
    const text = skip && skip.size ? descriptionText(html, { skip }) : htmlToText(html);
    for (const s of sentences(text)) {
      if (/^you(?:'|’)?ll\b|^you will\b/i.test(s) && !/^you will (?:need|have)\b/i.test(s)) {
        out.responsibilities.push(cleanBullet(s));
      } else if (!respFromProse && /^(?:you have|you are|you bring|you(?:'|’)?re|you will (?:need|have))\b/i.test(s)) {
        out.fit.push(cleanBullet(s));
      }
    }
    out.responsibilities = dedupeList(out.responsibilities);
    out.fit = dedupeList(out.fit);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Board boilerplate (BUG-5): paragraphs and list items repeated on most of a
// board's postings ("About <company>", scam notices, EEO and visa policy) are
// excluded from section and keyword extraction. descriptionHtml is untouched.
// ---------------------------------------------------------------------------

/** Normalized block text used for boilerplate matching. */
function boilerplateKey(text) {
  // Block text is already entity-decoded and whitespace-collapsed by htmlToBlocks.
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!]+$/, '')
    .trim();
}

// cyrb53: small, browser-safe 53-bit string hash (collisions ~1e-6 at 1e5 blocks).
function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const blockHash = (text) => cyrb53(boilerplateKey(text));
const BOILERPLATE_MIN_CHARS = 20; // shorter blocks (headings, "Benefits") are never boilerplate

/**
 * Hashes of paragraphs / list items that appear on at least `minShare` of a
 * board's postings. Headings are never included (they structure sections).
 * Pure and browser-safe. Returns an empty set for boards with < minJobs postings.
 * @param {string[]} htmlList  one description HTML per posting
 * @returns {Set<string>}
 */
export function boilerplateParagraphs(htmlList, { minShare = 0.5, minJobs = 5 } = {}) {
  const list = (Array.isArray(htmlList) ? htmlList : []).filter((h) => typeof h === 'string' && h);
  const out = new Set();
  if (list.length < minJobs) return out;
  const counts = new Map();
  for (const html of list) {
    const seen = new Set();
    for (const b of htmlToBlocks(html)) {
      if (isHeadingBlock(b) && !(b.type === 'p' && BULLET_P_RE.test(b.text))) continue;
      const key = boilerplateKey(b.text);
      if (key.length < BOILERPLATE_MIN_CHARS) continue;
      seen.add(cyrb53(key));
    }
    for (const h of seen) counts.set(h, (counts.get(h) || 0) + 1);
  }
  const need = Math.max(2, Math.ceil(minShare * list.length));
  for (const [h, c] of counts) if (c >= need) out.add(h);
  return out;
}

/**
 * Fix wave 3 (beta persona review, keyword-tag noise): hashes of prose paragraphs that describe a
 * team or the company, not the role. A paragraph outside the responsibilities and fit lists (at
 * least `minChars` long) that a board repeats word for word on `minPostings` or more postings
 * with `minTitles` or more different titles: Google's "Google's software engineers develop the
 * next-generation technologies… information retrieval… natural language processing…" (536
 * postings), "Google Cloud accelerates every organization's ability…" (565), the ML, Systems &
 * Cloud AI team's "…development of our TPUs, Vertex AI for Google Cloud…" (341), and Chrome's
 * "Chrome is available across all major platforms — iOS, Android…" (10). One posting copied per
 * country or city is one role, so its own prose is never counted. Pure; items: [{ html, title }].
 */
export function teamParagraphs(items, { minPostings = 3, minTitles = 3, minChars = 60 } = {}) {
  const list = (Array.isArray(items) ? items : []).filter((x) => x && typeof x.html === 'string' && x.html);
  const out = new Set();
  if (list.length < minPostings) return out;
  const posts = new Map();
  const roles = new Map();
  for (const { html, title } of list) {
    const seen = new Set();
    const bullets = [];
    let current = null;
    let listHeading = false;
    for (const b of htmlToBlocks(html)) {
      const bulletPara = b.type === 'p' && BULLET_P_RE.test(b.text);
      if (!bulletPara && isHeadingBlock(b)) { current = classifyHeading(b.text); listHeading = LIST_HEADING_RE.test(b.text.trim()); continue; }
      if (current && (b.type === 'li' || bulletPara || (b.line && listHeading))) { bullets.push(boilerplateKey(b.text)); continue; } // the role's own bullets
      const key = boilerplateKey(b.text);
      if (key.length < minChars) continue;
      const h = cyrb53(key);
      if (!seen.has(h)) seen.add(h);
    }
    // One role: its own lists, else its title. A posting copied per city ("Forward Deployed
    // Engineer - Munich", "- Paris") has the same lists under different titles: still one role.
    const role = bullets.length ? cyrb53(bullets.join('\n')) : String(title || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    for (const h of seen) {
      posts.set(h, (posts.get(h) || 0) + 1);
      let r = roles.get(h);
      if (!r) roles.set(h, (r = new Set()));
      if (r.size < minTitles) r.add(role);
    }
  }
  for (const [h, c] of posts) if (c >= minPostings && roles.get(h).size >= minTitles) out.add(h);
  return out;
}

/** The union of two hash sets (either may be null). */
export function unionSets(a, b) {
  if (!a || !a.size) return b || new Set();
  if (!b || !b.size) return a;
  return new Set([...a, ...b]);
}

/** Plain text of a description without the blocks in `skip` (boilerplate hashes). */
export function descriptionText(html, { skip = null } = {}) {
  if (!skip || !skip.size) return htmlToText(html);
  const out = [];
  let current = null;
  let listHeading = false;
  for (const b of htmlToBlocks(html)) {
    const bulletPara = b.type === 'p' && BULLET_P_RE.test(b.text);
    if (!bulletPara && isHeadingBlock(b)) {
      current = classifyHeading(b.text);
      listHeading = LIST_HEADING_RE.test(b.text.trim());
      out.push(b.text);
      continue;
    }
    const inSection = current && (b.type === 'li' || bulletPara || (b.line && listHeading));
    if (inSection || !skip.has(blockHash(b.text))) out.push(b.text);
  }
  return out.join('\n');
}

/**
 * Facet guard: drop keyword labels present on more than `maxShare` of a
 * board's jobs (only when the board has >= minJobs jobs); such a chip cannot
 * filter anything. Returns new job objects plus what was dropped.
 * @returns {{ jobs: object[], dropped: { responsibilities: {label,count}[], fit: {label,count}[], skills: {label,count}[] } }}
 */
export function dropUbiquitousKeywords(jobs, { maxShare = 0.9, minJobs = 20 } = {}) {
  const facets = ['responsibilities', 'fit', 'skills'];
  const dropped = { responsibilities: [], fit: [], skills: [] };
  const list = Array.isArray(jobs) ? jobs : [];
  if (list.length < minJobs) return { jobs: list, dropped };
  const kill = {};
  for (const f of facets) {
    const counts = new Map();
    for (const j of list) for (const l of new Set((j && j.keywords && j.keywords[f]) || [])) counts.set(l, (counts.get(l) || 0) + 1);
    kill[f] = new Set();
    for (const [label, count] of counts) {
      if (count / list.length > maxShare) { kill[f].add(label); dropped[f].push({ label, count }); }
    }
    dropped[f].sort((a, b) => b.count - a.count);
  }
  if (!facets.some((f) => kill[f].size)) return { jobs: list, dropped };
  const out = list.map((j) => {
    if (!j || !j.keywords) return j;
    const kw = { ...j.keywords };
    for (const f of facets) if (kill[f].size && Array.isArray(kw[f])) kw[f] = kw[f].filter((l) => !kill[f].has(l));
    return { ...j, keywords: kw };
  });
  return { jobs: out, dropped };
}

/**
 * Re-derive sections + keywords for already-normalized jobs of ONE board
 * (e.g. snapshot or cache data written by older code) with boilerplate removed
 * and the facet guard applied. descriptionHtml is not modified.
 */
export function rekeyBoardJobs(jobs, opts = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const skip = boilerplateParagraphs(list.map((j) => (j && j.descriptionHtml) || ''), opts);
  // Fix wave 3: team and company paragraphs are left out of the skills of a posting with lists.
  const team = unionSets(skip, teamParagraphs(list.map((j) => ({ html: (j && j.descriptionHtml) || '', title: j && j.title })), opts.team || {}));
  const rekeyed = list.map((j) => {
    // sections never depend on the boilerplate set (in-section bullets are protected)
    if (!j || typeof j.descriptionHtml !== 'string' || !j.descriptionHtml) return j;
    const sections = extractSections(j.descriptionHtml);
    const keywords = extractKeywords({
      title: j.title || '', department: j.department || '', sections,
      text: descriptionText(j.descriptionHtml, { skip }), skillText: descriptionText(j.descriptionHtml, { skip: team }),
    });
    return { ...j, sections, keywords };
  });
  return dropUbiquitousKeywords(rekeyed, opts.guard || {});
}

// ---------------------------------------------------------------------------
// Lexicons
// Each entry: [label, ...patterns]. A string pattern is matched
// case-insensitively with alphanumeric boundaries; a RegExp is used as-is
// (so case-sensitive matches like /\bGTM\b/ stay case-sensitive).
// ---------------------------------------------------------------------------

const B = (src, flags = 'i') => new RegExp(`(?<![A-Za-z0-9])(?:${src})(?![A-Za-z0-9])`, flags);

const LANGS_FOR_GO = 'Python|Rust|Java|C\\+\\+|C#|TypeScript|JavaScript|Scala|Kotlin|Ruby|Node(?:\\.js)?|Elixir|Haskell|Swift|C';
const GO_PATTERNS = [
  /\bGolang\b/i,
  new RegExp(`(?:${LANGS_FOR_GO})(?:\\s*,\\s*(?:and\\s+|or\\s+)?|\\s*\\/\\s*|\\s+(?:and|or)\\s+)Go\\b(?![-'’])`),
  new RegExp(`(?<![\\w-])Go(?:\\s*,\\s*(?:and\\s+|or\\s+)?|\\s*\\/\\s*|\\s+(?:and|or)\\s+)(?:${LANGS_FOR_GO})\\b`),
  /\b(?:in|using|with|like|e\.g\.,?|including|written in|experience in)\s+Go\b(?![-'’])/,
  /\bGo\s+(?:programming|language|services|microservices|backend|codebase)\b/,
];

// P-17 (persona review 2026-10-10): technical contexts for three words that are mostly
// ordinary English in postings ("embedded in the business", "high autonomy").
const EMBEDDED_NOUNS = 'systems?|software|firmware|linux|c\\+\\+|c|rust|development|developers?|engineer(?:s|ing)?|devices?|hardware|electronics|processors?|processing|platforms?|targets?|programming|rtos|controllers?|microcontrollers?|computing|compute|code|coder|applications?|security|gpus?|boards?|os|environments?|products?|domain|dsp|hw|sw|ml|ai|vision|real-time|protocols?|interfaces?|communications?|mission systems?|deployments?';
const AUTONOMY_AFTER = 'software|stacks?|systems?|engineer(?:s|ing)?|algorithms?|capabilit(?:y|ies)|behaviou?rs?|pipelines?|development|research|architectures?|applications?|products?|platforms?|frameworks?|integration|solutions?|features?|modules?|simulations?|testing|code|engines?|kits?|services|missions?|c2|middleware|teams?|programs?|computers?|researchers?';
const DISCIPLINES = 'aerospace|aeronautical|electrical|electronics|computer|software|systems|manufacturing|industrial|civil|chemical|materials|physics|robotics|mechatronics|controls?|mathematics|math|computer science|engineering physics|related|biomedical|nuclear|ocean|marine';
const AUTONOMY_BEFORE = 'mission|vehicle|robot(?:ic)?|robotics|drone|aircraft|air|airborne|maritime|undersea|subsea|ground|edge|flight|uas|uav|hivemind|lattice|multi-?agent|multi-?vehicle|collaborative|full[- ]stack|onboard|end-to-end|swarm|weapons?|multi-asset|multi-domain|unsupervised|layered';
// Fix wave 3 (beta persona review, keyword-tag noise): data-centre power equipment, the context of
// an electrical "transformer" (Google's technician postings: "Feeders, Transformers, Generators,
// Switchgear, UPS systems, ATS/STS units, PDU/PMM").
const POWER_WORDS = String.raw`feeders?|generators?|switchgears?|switchboards?|breakers?|substations?|ups|ats|sts|pdus?|pmms?|rpps?|busways?|panelboards?|voltage|kv|mva|kva|electrical|power (?:distribution|systems?|equipment|generation)|motors?|cables?|chillers?|crahs?|cracs?|step-?(?:up|down)|pad-?mount\w*|dry-?type|oil-?filled|utility|utilities`;
// Kinds of agent that are not AI agents ("commissioning agents", "change agents", "select agents",
// "routing agents", "frontline agents").
const NON_AI_AGENTS = String.raw`commissioning|change|select|collection|routing|frontline|front-line|support|service|customer|call cent(?:er|re)|contact cent(?:er|re)|travel|real estate|leasing|insurance|booking|shipping|freight|customs|forwarding|purchasing|registered|patent|transfer|sports|secret|federal|special|chemical|biological|cleaning|bonding|curing|contrast|therapeutic|execution|monitoring|human|live|field|claims|escrow|listing|runners\s?\/`;
// A posting about AI at all: bare "agents" is an AI skill only there.
const AI_CONTEXT_RE = /\b(?:AI|GenAI|LLMs?|large language models?|generative|machine learning|ML|agentic|Copilot|GPT|ChatGPT|Claude|Gemini|Codex|foundation models?|language models?)\b/;

export const SKILL_LEXICON = [
  // Languages
  ['Python', 'python'],
  ['Rust', /\bRust\b/],
  ['Go', ...GO_PATTERNS],
  ['TypeScript', 'typescript'], // P-17: kept; a nice-to-have mention sorts last (orderSkills)
  ['JavaScript', 'javascript', /\bJS\b/],
  ['Java', /\bJava\b/],
  ['C++', /(?<![\w+])C\+\+(?![\w+])/, /\bCpp\b/],
  ['C#', /(?<![\w#])C#(?![\w#])/],
  ['Scala', 'scala'],
  ['Kotlin', 'kotlin'],
  ['Swift', /\bSwift(?:UI)?\b/],
  ['Objective-C', 'objective-c'],
  ['Ruby', /\bRuby\b/],
  ['PHP', /\bPHP\b/],
  ['Elixir', /\bElixir\b/],
  ['Haskell', 'haskell'],
  ['OCaml', 'ocaml'],
  ['MATLAB', 'matlab', /\bSimulink\b/],
  ['Bash', 'bash', 'shell scripting'],
  ['SQL', 'sql'],
  ['GraphQL', 'graphql'],
  ['Verilog', 'verilog', 'systemverilog'],
  ['VHDL', 'vhdl'],
  // Web / app frameworks
  ['React', /\bReact(?:\.js|JS)?\b/, 'react native'],
  ['Node.js', /\bNode(?:\.js|JS)\b/i],
  ['Next.js', /\bNext\.js\b/i],
  ['Vue', /\bVue(?:\.js)?\b/],
  ['Angular', /\bAngular\b/],
  ['Django', /\bDjango\b/i],
  ['Flask', /\bFlask\b/],
  ['FastAPI', 'fastapi'],
  ['Rails', /\bRails\b/, 'ruby on rails'],
  ['Spring', /\bSpring Boot\b/i],
  ['gRPC', 'grpc', 'protobuf', 'protocol buffers'],
  ['REST APIs', 'rest(?:ful)? apis?'],
  ['iOS', /\biOS\b/],
  ['Android', /\bAndroid\b/],
  // ML / AI
  ['PyTorch', 'pytorch', 'torch'],
  ['JAX', /\bJAX\b/],
  ['TensorFlow', 'tensorflow'],
  ['CUDA', 'cuda'],
  ['Triton', /\bTriton\b/],
  ['NumPy', 'numpy'],
  ['pandas', /\bpandas\b/i],
  ['scikit-learn', 'scikit-learn', 'sklearn'],
  ['Hugging Face', 'hugging ?face'],
  // P-17: "AI/ML" ("articulate AI/ML concepts", "AI/ML companies") names the industry, not the skill
  ['Machine learning', 'machine learning', /(?<!\bAI\s?\/\s?)\bML\b(?!\s?\/\s?AI\b)/],
  ['Deep learning', 'deep learning', 'neural networks?'],
  ['LLMs', 'llms?', 'large language models?', 'language models?', 'foundation models?', 'frontier models?'],
  // Fix wave 3: not an electrical transformer ("Feeders, Transformers, Generators, Switchgear, UPS
  // systems" on data-centre technician cards): no power-equipment word in the same sentence.
  ['Transformers', 'transformer[- ](?:models?|architectures?|based|networks?|blocks?|layers?|encoders?|decoders?)', 'vision transformers?',
    new RegExp(String.raw`(?<!\b(?:${POWER_WORDS})\b[^.\n]{0,80})\btransformers?\b(?![^.\n]{0,80}\b(?:${POWER_WORDS})\b)`, 'i')],
  ['RL', 'reinforcement learning', /\bRL\b/],
  ['RLHF', 'rlhf', 'rlaif', 'reinforcement learning from human feedback'],
  ['NLP', 'nlp', 'natural language processing'],
  ['Computer vision', 'computer vision', /\bCV\b(?= (?:models|systems|pipelines|research))/],
  ['Distributed training', 'distributed training', 'model parallel(?:ism)?', 'data parallel(?:ism)?', 'pipeline parallel(?:ism)?', 'fsdp'],
  ['Pretraining', 'pre-?training'],
  ['Fine-tuning', 'fine-?tun(?:e|es|ed|ing)', 'post-?training'],
  ['Inference', '(?<!causal |statistical |bayesian )inference', 'model serving'], // §6a A4
  // Fix wave 3: a benchmark of models, not "Benchmark industry best practices" (a field-repair
  // programme manager), "common performance benchmarks" (CPU verification) or pay benchmarks.
  ['Evals', 'evals?', '(?<!\\b(?:business|financial|risk|credit|pricing|cost) )model evaluations?', 'evaluation (?:suites?|harness(?:es)?)',
    '(?:model|llm|ai|ml|agentic|agent|reasoning|coding|evaluation|eval|public|offline|academic) benchmarks?', 'benchmark(?:s|ing)? (?:of |for )?(?:the |our )?(?:models?|llms?)', 'benchmark (?:design|leakage|contamination)'],
  ['Interpretability', 'interpretability', 'mechanistic'],
  ['Alignment', 'alignment research', 'ai alignment', 'alignment science', 'superalignment'], // §6a A1: bare 'alignment' was business language
  ['Multimodal', 'multi-?modal', 'vision-language'],
  ['Speech / audio', 'speech recognition', 'text-to-speech', 'speech models?', 'audio models?'], // §6a A5: not 'free speech'
  ['Recommender systems', 'recommend(?:er|ation) systems?', 'ranking systems?'],
  ['Information retrieval', 'information retrieval', 'search ranking', 'retrieval', 'rag', 'retrieval-augmented'],
  // Fix wave 3: bare "agents" is AI agents only after no other kind of agent ("commissioning
  // agents", "change agents", "support agents", "routing agents") and only in a posting about AI
  // (AI_GATED_SKILLS); "tool use" not after "power" or "hand".
  ['Agents', 'ai agents?', 'agentic', '(?<!\\b(?:power|hand|safe)\\s)tool use'],
  ['Prompt engineering', 'prompt(?:ing| engineering)'],
  ['MLOps', 'mlops', 'ml ops', 'ml infrastructure'],
  // §6a A3: 'accelerators' only with hardware context (not startup/delivery accelerators)
  ['GPUs', 'gpus?', 'accelerator (?:chips?|families|hardware|clusters?)', /\baccelerators?\b(?=[\s\S]*\b(?:TPUs?|chips?)\b)/i, /\b(?:TPUs?|chips?)\b(?=[\s\S]*\baccelerators?\b)/i],
  ['TPUs', 'tpus?', 'trainium'],
  ['Kernels', 'gpu kernels?', 'cuda kernels?', 'kernel (?:development|optimization|engineering)'],
  ['Compilers', 'compilers?', 'mlir', 'llvm', 'xla'],
  ['Performance tuning', 'performance (?:optimization|engineering|tuning)', 'profiling'],
  ['Statistics', 'statistics', 'statistical', 'causal inference', 'econometrics'],
  ['A/B testing', 'a/b test(?:s|ing)?', 'experimentation'],
  // Infrastructure / data
  ['Kubernetes', 'kubernetes', 'k8s'],
  ['Docker', 'docker', 'containeriz\\w*', 'container (?:orchestration|images?|runtime|security|hardening)'], // §6a A2: not shipping containers
  ['Terraform', 'terraform', 'infrastructure as code', 'pulumi'],
  ['AWS', /\bAWS\b/, 'amazon web services'],
  // Fix wave 3: "Google Cloud" the platform, not the organization ("Google Cloud customers",
  // "Google Cloud accelerates every organization’s ability…").
  ['GCP', /\bGCP\b/, 'google cloud platform', 'google cloud(?!(?:[’\']s\\b| (?:customers?|partners?|teams?|organi[sz]ations?|sales|accelerates|is|as|regions?)\\b))'],
  ['Azure', 'azure'],
  ['Spark', /\bSpark\b/, /\bPySpark\b/i],
  ['Kafka', 'kafka'],
  ['Airflow', 'airflow'],
  ['dbt', /\bdbt\b/],
  ['Snowflake', /\bSnowflake\b/],
  ['BigQuery', 'bigquery'],
  ['Databricks', 'databricks'],
  ['Postgres', 'postgres(?:ql)?'],
  ['MySQL', 'mysql'],
  ['Redis', 'redis'],
  ['Elasticsearch', 'elasticsearch', 'opensearch'],
  ['Linux', 'linux', 'unix'],
  ['Networking', 'networking', 'tcp/ip', 'bgp', 'network (?:engineering|protocols)'],
  ['Distributed systems', 'distributed systems?'],
  ['Microservices', 'microservices?', 'service-oriented'],
  ['CI/CD', 'ci/cd', 'continuous (?:integration|delivery|deployment)', 'github actions', 'jenkins'],
  ['Observability', 'observability', 'prometheus', 'grafana', 'datadog', 'opentelemetry', '(?:system|infrastructure|production) monitoring'], // §6a A7
  ['SRE', 'site reliability', /\bSRE\b/],
  ['Storage systems', 'storage systems?', 'distributed storage', 'object storage', 'file systems?'],
  ['Datacenters', 'data ?cent(?:er|re)s?'],
  ['HPC', /\bHPC\b/, 'high[- ]performance computing', 'supercomput\\w*', 'slurm'],
  // §6a B: skill 'Data pipelines' dropped (resp 'Data pipelines' covers it)
  ['Cloud infrastructure', 'cloud infrastructure', 'cloud platforms?', 'cloud computing'],
  // Security
  ['Security', 'security(?! clearance)', 'cyber ?security', 'infosec'],
  ['Cryptography', 'cryptograph\\w*', 'encryption', /\bPKI\b/],
  ['Pen testing', 'penetration test(?:s|ing)?', 'pen-?test(?:s|ing)?', 'red team(?:ing|s)?', 'offensive security'],
  ['Threat modeling', 'threat model(?:s|ing|ling)?'],
  ['Incident response', 'incident response', 'forensics'],
  ['Detection engineering', 'detection engineering', /\bSIEM\b/, 'threat detection'],
  ['IAM', /\bIAM\b/, 'identity and access management', 'access control'],
  ['AppSec', 'application security', 'appsec', 'secure code review'],
  ['Vulnerability research', 'vulnerability research', 'exploit development', 'fuzzing', 'reverse engineering'],
  // Hardware / defense
  // P-17: a technical noun after "embedded"; not "embedded within our legal operations"
  ['Embedded', `embedded (?:(?:and|or|and/or) (?:[\\w+#-]+ ){0,2})?(?:${EMBEDDED_NOUNS})`, '(?:edge|firmware|real-time|rtos|bare-metal)\\s*(?:/|or|and)\\s*embedded'],
  ['Firmware', 'firmware'],
  ['RTOS', /\bRTOS\b/, 'real-time operating systems?', 'freertos', 'zephyr'],
  ['FPGA', 'fpgas?'],
  ['RF', /\bRF\b/, 'radio[- ]frequency', 'antennas?'],
  ['Signal processing', 'signal processing', /\bDSP\b/],
  ['Radar', 'radar'],
  ['Electronic warfare', 'electronic warfare', /\bEW\b/],
  ['PCB design', /\bPCBA?s?\b/, 'schematic capture', 'altium', 'board design'],
  ['Analog design', 'analog (?:circuit|design)', 'mixed-signal'],
  ['Power electronics', 'power electronics'], // §6a A9: batteries / power systems dropped (logistics, site generators)
  ['Robotics', 'robotics?', 'robots?'],
  ['Controls', 'control systems?', 'controls engineering', 'controls', 'feedback control'],
  ['ROS', /\bROS ?2?\b/],
  // P-17: robot/vehicle autonomy only; not "operate with a high degree of ownership and autonomy"
  ['Autonomy', /\bAutonomy\b/, `autonomy (?:${AUTONOMY_AFTER})`, `(?:${AUTONOMY_BEFORE}) autonomy`, 'autonomous systems?', 'autonomous vehicles?'],
  ['GNC', /\bGNC\b/, 'guidance,? navigation,? (?:and|&) control'],
  ['Sensor fusion', 'sensor fusion', 'kalman filter\\w*', 'state estimation'],
  ['SLAM', /\bSLAM\b/],
  ['Avionics', 'avionics'],
  ['Propulsion', 'propulsion', 'rocket engines?'],
  ['Aerodynamics', 'aerodynamic\\w*', /\bCFD\b/, 'computational fluid dynamics'],
  // P-17: not bare "mechanisms" ("VAT mechanisms", "escalation mechanisms"), and not one
  // discipline in a degree list ("BS in Computer Science, Electrical Engineering, Mechanical
  // Engineering, or a related field") or "mechanical engineering teams"
  ['Mechanical design', 'mechanical design', new RegExp(String.raw`(?<!\b(?:${DISCIPLINES})(?: engineering)?\s*(?:,|\/|\bor\b|\band\b)\s*)\bmechanical engineering\b(?!\s*(?:,|\/|\bor\b|\band\b)\s*(?:${DISCIPLINES})\b|\s+teams\b)`, 'i')],
  // P-17: not the currency ("4,300 CAD per week", "$495,000 CAD", "CAD 150,000", "30 CAD/hour").
  // BP-5 (fix wave 3): in any currency-code format: after an amount or a "$" ("$120000 (CAD)",
  // "$160,000 – $245,000 [CAD]", Microsoft's French "112 000 $ CAD à 165 000 $ CAD", Google's
  // French "+ 0% bonus target CAD" and "+ équité + avantages sociaux CAD", "Canadian dollars
  // (CAD)"), before one
  // ("CAD $43,800", "CAD$", "CAD 150,000"), or in a currency list ("USD/CAD").
  ['CAD', /(?<![\d$€£¥](?:[\d,.  ]*\d)?\s?[kKmM]?\s?\$?\s?[([]?\s?|\b(?:USD|GBP|EUR|AUD)\s?\/\s?|\bdollars?\s?\(\s?|%\s?(?:bonus\s+)?(?:target\s+)?|\b(?:avantages\s+sociaux|benefits|équité|equity)\s)\bCAD\b(?!\s?[)\]]?\s?(?:\$|\d|\/\s?(?:hour|hr|h|year|yr|annum|month|mo|week|wk|day)\b|per\s|par\s|an?\s+(?:hour|year|week|month)\b|annually|hourly|weekly|monthly))/],
  ['SolidWorks', 'solidworks'],
  ['Siemens NX', /\bSiemens NX\b/i, /\bNX\b/],
  ['GD&T', /\bGD&T\b/i, 'geometric dimensioning'],
  ['FEA', /\bFEA\b/, 'finite element'],
  ['Composites', 'composites', 'composite (?:materials|structures|layup|manufacturing)'], // §6a A8: not 'composite tracking'
  ['Machining', 'machining', /\bCNC\b/, 'injection molding'],
  ['DFM', /\bDF[MA]\b/, 'design for manufactur\\w*'],
  ['Lean / Six Sigma', 'lean manufacturing', 'six sigma', 'kaizen'],
  ['Systems engineering', 'systems engineering', 'model-based systems', /\bMBSE\b/],
  ['Test automation', 'test automation', 'hardware-in-the-loop', /\bHIL\b/],
  ['Simulation', 'simulations?', 'digital twins?'],
  // Business
  ['Salesforce', 'salesforce', /\bSFDC\b/],
  ['HubSpot', 'hubspot'],
  ['Excel', /\bExcel\b(?! (?:at|in)\b)/, 'spreadsheets?'], // §6a A6: not the verb ('Excel at …', 'Excel in …')
  ['Tableau', 'tableau'],
  ['Looker', /\bLooker\b/],
  ['Financial modeling', 'financial model(?:s|ing|ling)?', /\bDCF\b/],
  ['FP&A', /\bFP&A\b/i, 'financial planning'],
  ['Accounting', 'accounting', /\bGAAP\b/, 'revenue recognition'],
  // §6a B: skill 'GTM' dropped (resp 'Go-to-market' covers it)
  ['Enterprise sales', 'enterprise sales', 'enterprise (?:accounts|customers|deals|software sales)', 'b2b sales', 'complex sales'],
  ['Contract negotiation', 'negotiat\\w* (?:contracts?|agreements?|deals?|terms)', 'contract negotiations?', 'contract (?:review|drafting|management)'], // §6a A10
  ['Gov contracting', 'government contract\\w*', /\bDFARS\b/, /\bFAR\b/, 'federal acquisition', 'proposal writing'],
  ['Recruiting', 'recruiting', 'talent acquisition', 'sourcing candidates'],
  ['Product management', 'product management', 'product requirements', /\bPRDs?\b/],
  // §6a B: skill 'Program management' dropped (it is a responsibility)
  // §6a B: skill 'Marketing' dropped (resp 'Marketing' covers it)
  ['SEO', /\bSEO\b/],
  ['Public policy', 'public policy', 'policy analysis', 'legislat\\w*'],
  // §6a B: skill 'Analytics' dropped (resp 'Analytics' covers it)
  // Design
  ['Figma', 'figma'],
  ['UX research', 'ux research', 'user research', 'usability (?:testing|studies)'],
  ['Prototyping', 'prototyp\\w*'],
  ['Design systems', 'design systems?'],
  ['Interaction design', 'interaction design', 'ux design', 'user experience design'],
  ['Visual design', 'visual design', 'typography', 'brand design'],
];

export const RESPONSIBILITY_LEXICON = [
  ['Model training', 'train(?:ing)? (?:large |frontier |new |our )?(?:language |ml |machine learning )?models?', 'pre-?training', 'post-?training', 'fine-?tun\\w*', 'training runs?'],
  ['Research', 'research(?:ing)?', 'novel (?:methods|approaches|techniques)', 'run experiments', 'experiments?', 'publish\\w*'],
  // §6a B: resp 'Interpretability' dropped (the skill covers it)
  ['Infrastructure', 'infrastructure', 'platforms?', 'clusters?', 'compute'],
  ['Inference / serving', 'inference', 'serving', 'deploy(?:ing)? models', 'model deployment'],
  ['Performance optimization', 'optimi[sz]\\w*', 'latency', 'throughput', 'efficien\\w*', 'profil\\w*'],
  ['Scaling systems', 'scal(?:e|es|ing|able|ability)', 'high[- ]throughput', 'large[- ]scale'],
  ['Architecture', 'architect\\w*', 'system design', 'design and (?:build|implement)'],
  ['Data pipelines', 'data pipelines?', /\bETL\b/, 'datasets?', 'data (?:collection|processing|infrastructure|quality|ingestion)'],
  // §6a B: renamed from 'Evaluation'; needs model/eval context ('evaluate vendors' no longer fires)
  ['Model evaluation', 'evals?', '(?:model|ai|llm) evaluations?', 'evaluat\\w* (?:the |our )?(?:ai |ml |language |frontier )?models?', '(?:model|llm) benchmarks?', 'benchmark(?:s|ing)? (?:the |our )?models?', 'measur(?:e|ing) model (?:performance|capabilities)'],
  ['Safety', 'safety', 'alignment', 'misuse', 'harmful', 'responsible (?:ai|scaling)', 'trust (?:and|&) safety', 'safeguards'],
  ['Security', 'security(?! clearance)', 'threat (?:model|detection|intel)\\w*', 'vulnerabilit\\w*'], // §6a A11: no bare secure / protect / threats
  ['On-call / reliability', 'on-?call', 'reliab\\w*', 'uptime', 'incidents?', 'availability', /\bSRE\b/, 'outages?'],
  ['Tooling / dev experience', 'tooling', 'developer (?:experience|productivity|tools)', 'internal tools', 'ci/cd', 'build systems?'],
  ['Product development', 'build (?:new )?(?:products?|features?)', 'product development', 'ship(?:ping)? (?:new )?(?:features|products)', 'end-to-end', 'full[- ]stack', 'user-facing', 'product surfaces?'],
  ['Applied ML', 'appl(?:y|ied) (?:ml|machine learning|ai|models)', 'ml-powered', 'ai-powered'],
  ['Design', 'user experiences?', 'user interfaces?', /\bUX\b/, /\bUI\b/, 'mockups', 'wireframes', 'prototyp\\w*', 'design (?:the )?(?:user|product|visual)'],
  // §6a A14: customers/clients only after a customer verb, never 'internal clients' or 'existing customers'
  ['Customer-facing', '(?:work(?:s|ing)?(?: closely| directly)? with|support(?:s|ing)?|engag(?:e|es|ing)(?: with)?|partner(?:s|ing)?(?: closely| directly)? with|for|serv(?:e|es|ing)|help(?:s|ing)?|meet(?:s|ing)? with|liais(?:e|es|ing) with|interfac(?:e|es|ing) with) (?:our |the |key |strategic |prospective )?(?:external |enterprise )?(?:customers?|clients?)', '(?:customer|client) (?:relationships?|acquisition|engagements?)', 'customer-facing', 'client-facing', 'end users'],
  ['Customer support', 'customer success', 'onboard(?:ing)? (?:customers|users)', 'technical support', 'troubleshoot\\w*', 'support tickets'],
  ['Cross-functional', 'cross-?functional\\w*', 'partner (?:closely )?with', 'collaborat\\w* (?:closely )?with', 'work closely with', 'across teams'],
  ['Technical leadership', 'technical (?:leadership|direction|vision|lead)', 'tech lead', 'set (?:the )?technical', 'own (?:the )?(?:architecture|technical)'],
  ['Mentoring', 'mentor\\w*', 'coach\\w*', 'grow (?:the )?(?:team|engineers)'],
  ['People management', 'manag(?:e|ing) (?:a |the )?team', 'direct reports', 'people manag\\w*', 'lead (?:a|the) team of', 'performance reviews', 'career development'],
  ['Hiring', 'hir(?:e|ing)', 'recruit\\w*', 'interview\\w*', 'build (?:out )?(?:the|a) team'],
  ['Strategy', 'strateg\\w*', 'roadmaps?', 'vision', 'prioritiz\\w*'],
  ['Program management', 'program manag\\w*', 'coordinat\\w*', 'timelines?', 'milestones?', 'schedules?', 'track progress'],
  ['Operations', 'operations', 'operational', 'processes', 'workflows?', 'logistics'],
  ['Process improvement', 'process improvement', 'continuous improvement', 'streamlin\\w*', 'automat(?:e|ing) (?:manual )?(?:processes|workflows)'],
  ['Policy', 'polic(?:y|ies)', 'regulat\\w*', 'government', 'legislat\\w*', 'lawmakers', 'policymakers'],
  ['Compliance', 'complian\\w*', 'audits?', 'certif\\w*', /\bITAR\b/, /\bSOC ?2\b/, 'fedramp', /\bCMMC\b/],
  ['Legal', 'legal', 'contracts?', 'counsel', 'litigation', 'intellectual property'],
  ['Finance', 'financ\\w*', 'budgets?', 'forecast\\w*', 'accounting', /\bP&L\b/],
  ['Go-to-market', 'go[- ]to[- ]market', /\bGTM\b/, 'pipeline generation', 'sales cycles?', 'quota', 'close (?:deals|new business)', 'revenue', 'sales'],
  ['Partnerships', 'partnerships?', 'alliances', 'ecosystem', 'channel partners'],
  ['Business development', 'business development', 'capture', 'new business', 'proposals?', /\bRFPs?\b/],
  ['Marketing', 'marketing', 'campaigns?', 'brand', 'demand gen\\w*', 'messaging', 'launch(?:es)?'],
  ['Communications', 'communicat\\w*', 'stakeholders?', 'present(?:ing|ations?)', 'executive (?:updates|briefings)'],
  ['Writing / docs', 'documentation', 'technical writing', 'write (?:specs|docs|documentation|reports|policies|content)', 'whitepapers?', 'blogs?'], // §6a A12: not 'write code' / 'construction documents'
  // §6a B: bare 'analy[sz]\\w*' tightened
  ['Analytics', 'analytics', '(?:data|quantitative|statistical) analys[ie]s', 'analy[sz](?:e|es|ing) (?:the )?(?:data|metrics|results|trends|usage|performance)', 'metrics', 'dashboards?', 'insights', 'sql'],
  ['Enablement / training', 'enablement', 'workshops?', 'educat\\w*', 'train (?:users|customers|teams|operators)'],
  ['Hardware integration', 'hardware', 'bring-?up', 'subsystems?', 'sensors?', 'payloads?', 'integrat\\w* (?:with )?(?:hardware|sensors|systems|vehicles)'],
  // §6a B: resp 'Systems engineering' dropped (the skill covers it)
  // §6a B: resp 'Simulation' and 'Autonomy' dropped (the skills cover them)
  ['Field testing', 'field (?:test\\w*|operations|deploy\\w*|work)', 'flight test\\w*', 'test ranges?', 'in the field', 'test events?'],
  ['Manufacturing', 'manufactur\\w*', 'production lines?', 'assembly', 'factory', 'factories', 'production (?:ramp|scale|floor)'],
  ['Supply chain', 'supply chain', 'suppliers?', 'vendors?', 'procure\\w*', 'sourcing'],
  // Fix wave 3: a military mission or defence, not a company's mission ("Anthropic's mission is
  // to create reliable…" on a nonprofit sales manager) or "fraud defense", "defense in depth".
  ['Mission / defense', '(?:defen[cs]e|military|national[- ]security|combat|warfight(?:ing|er)|tactical|isr|strike) missions?', 'mission (?:systems?|planning|autonomy|payloads?|computers?|software|operations)',
    'warfighters?', '(?<!\\b(?:cyber|network|fraud|abuse|spam|malware|endpoint|threat|legal|litigation|patent|thesis|dissertation|tax|audit|security|ddos|bot|account|email|data|self)[- ])defen[cs]e(?![- ]in[- ]depth)', 'military', /\bDoD\b/, 'national security', 'armed forces'],
];

export const FIT_LEXICON = [
  // Years-of-experience buckets are computed separately and come first.
  ['PhD', /\bPh\.?\s?D\.?(?![a-z])/i, 'doctorate', 'doctoral'],
  ["Master's", 'master(?:\'|’)?s', /\bM\.?S\.?(?= (?:degree|in)\b)/, 'msc'],
  ['MBA', /\bMBA\b/],
  ["Bachelor's", 'bachelor(?:\'|’)?s', /\bB\.?[SA]\.?(?= (?:degree|in)\b)/, 'bsc', 'undergraduate degree', 'degree in'],
  ['Degree or equivalent', 'equivalent (?:practical |professional )?experience', 'or equivalent', 'no degree required'],
  ['Publications', 'publications?', 'published', 'first-author', 'neurips', 'icml', 'iclr', 'peer-reviewed'],
  ['Research experience', 'research experience', 'research background', 'conducting research', 'research (?:engineering|scientist) experience'],
  ['Production experience', 'production (?:systems|environments?|code|ml|services)', 'shipped', 'deployed (?:to|in) production'],
  ['Large-scale systems', 'large-?scale', 'at scale', 'distributed systems', 'high-?scale'],
  ['Technical depth', 'deep (?:technical|expertise|understanding|knowledge)', 'strong (?:technical|engineering|programming|coding|software engineering) (?:background|skills|foundation)', 'expert(?:ise)? in', 'proficien\\w*'],
  ['Hands-on', 'hands-?on', 'build things', 'tinker\\w*'],
  ['Startup experience', 'start-?ups?', 'early-stage', '0 to 1', 'zero to one', 'zero-to-one', '0-1', 'founding'],
  ['Leadership', 'leadership', 'led (?:teams|projects|initiatives|efforts)', 'leading (?:teams|projects|cross-functional|initiatives)', 'track record of leading'],
  ['Management experience', 'management experience', 'managed (?:a )?teams?', 'people manag\\w*', 'managing (?:engineers|teams|people)', 'direct reports'],
  ['Strong communication', 'communicat\\w*', 'written and verbal', 'verbal and written', 'articulate', 'explain complex'],
  ['Collaboration', 'collaborat\\w*', 'team player', 'low ego', 'work well with'],
  ['Ambiguity', 'ambigu\\w*', 'unstructured', 'undefined problems', 'uncertainty', 'open-ended'],
  ['Fast-paced', 'fast-?paced', 'move quickly', 'rapid(?:ly)? (?:changing|evolving|iterat\\w*)', 'high-velocity', 'quick(?:ly)? iterat\\w*'],
  ['Self-directed', 'self-?(?:directed|starter|motivated)', 'independently', 'ownership', 'take initiative', 'proactive'],
  ['Learning mindset', 'learn quickly', 'eager to learn', 'curiosity', 'curious', 'growth mindset', 'pick up new'],
  ['Pragmatic', 'pragmatic', 'bias (?:for|toward|towards) action', 'get things done', 'results-oriented', 'scrappy'],
  ['Detail-oriented', 'detail-?oriented', 'attention to detail', 'meticulous', 'rigor(?:ous)?'],
  ['Analytical', 'analytical', 'data-driven', 'quantitative', 'problem[- ]solv\\w*'],
  ['Customer empathy', 'customer (?:empathy|obsess\\w*|focus\\w*)', 'empath\\w*', 'user needs', 'customer-centric'],
  ['Open source', 'open[- ]source'],
  ['Mission-driven', 'mission', 'passion(?:ate)? (?:about|for)', 'care (?:deeply )?about (?:the )?(?:impact|mission)'],
  ['AI safety interest', 'ai safety', 'safe and beneficial', 'beneficial ai', 'alignment', 'responsible ai', 'societal impacts?'],
  ['Defense / aerospace', 'defen[cs]e (?:industry|sector|tech\\w*|programs?)', /\bDoD\b/, 'aerospace', 'military', 'government (?:customers|programs)'],
];

// Fit facets that are worth scanning in the whole description (often stated
// outside the bullet lists, e.g. legal boilerplate).
export const FIT_GLOBAL_LEXICON = [
  ['Security clearance', 'security clearance', 'secret clearance', 'ts/sci', 'top secret', 'clearances?', 'clearable'],
  ['US citizenship', 'u\\.?s\\.? (?:citizen(?:ship)?s?|persons?)', 'citizenship', /\bITAR\b/],
  ['Travel', 'travel\\w*'],
  ['Visa sponsorship', 'visa sponsorship', 'sponsor (?:visas|work authorization)', 'we do sponsor visas'],
];

function compileLexicon(lex) {
  return lex.map(([label, ...pats]) => ({
    label,
    res: pats.map((p) => (p instanceof RegExp ? p : B(p))),
  }));
}

const SKILLS = compileLexicon(SKILL_LEXICON);
const RESP = compileLexicon(RESPONSIBILITY_LEXICON);
const FIT = compileLexicon(FIT_LEXICON);
const FIT_GLOBAL = compileLexicon(FIT_GLOBAL_LEXICON);

function matchLexicon(compiled, hay) {
  const out = [];
  if (!hay) return out;
  for (const { label, res } of compiled) {
    if (res.some((re) => re.test(hay))) out.push(label);
  }
  return out;
}

// P-17: domain words that are a skill only in a technical role. An engineer's "Experience
// with UAVs, robotics, autonomy, embedded systems" or "Skilled in Statistics, AI/ML" is a
// skill; a sourcer's "recruiting within aerospace, robotics, autonomy" and a customer
// success manager's "articulate AI/ML concepts" are not.
const TECH_TITLE_WORDS_RE = /\b(?:engineers?|engineering|scientists?|science|research(?:ers?)?|developers?|architects?|technical|technicians?|data|machine learning|devops|programmers?|software|hardware|firmware|systems|security|infrastructure|robotics|simulation|modeling|modelling)\b/i;
const TECH_TITLE_CAPS_RE = /\b(?:ML|SRE|TPM|FDE|GNC|SWE|MTS)\b/;
/** A technical role from its title (engineer, scientist, technical program manager, ...). */
export function isTechnicalTitle(title) {
  const t = String(title || '');
  return TECH_TITLE_WORDS_RE.test(t) || TECH_TITLE_CAPS_RE.test(t);
}
const AUTONOMY_LIST_TERMS = 'networking|robotics|uavs?|uas|gnc|perception|sensor fusion|sensors?|simulation|systems integration|embedded systems|munitions|isr|mission systems|avionics|radar|ew|acoustics|machine learning|computer vision|navigation|c2|command and control|missiles|cyber|flight controls|propulsion|payloads?|ground systems|unmanned systems|aircraft';
const AIML_NOT_SKILL = 'compan(?:y|ies)|industr(?:y|ies)|space|sectors?|markets?|landscape|products?|teams?|engineers|researchers|experts|ecosystems?|startups?|businesses|firms|vendors|customers|concepts|dynamics|organi[sz]ations|leaders';
const GATED_SKILLS = compileLexicon([
  ['Machine learning', new RegExp(String.raw`(?<!\b[Ii]nterest(?:ed)?\s+in\s+|\b[Pp]assion(?:ate)?\s+(?:for|about)\s+)\b(?:AI\s?\/\s?ML|ML\s?\/\s?AI)\b(?![\s-]+(?:${AIML_NOT_SKILL})\b)`)],
  ['Autonomy', `(?:${AUTONOMY_LIST_TERMS})\\s*(?:,|and|or|&)\\s*(?:the\\s+)?autonomy`, `autonomy\\s*(?:,|and|or|&)\\s*(?:${AUTONOMY_LIST_TERMS})`],
]);
// Fix wave 3: in a defence posting (DEFENSE_CONTEXT_RE: Anduril, Shield AI, a cleared government
// role) a bare "mission" is the military mission, as before; elsewhere it is the company's
// ("Anthropic's mission is to…", "Microsoft's mission is to empower…"). Never "mission-critical".
const DEFENSE_CONTEXT_RE = /\b(?:defen[cs]e[- ](?:technology|tech|company|industry|sector|programs?|systems|customers|contractors?|agencies)|military|warfight\w*|DoD|DoW|national security|armed forces|Department of (?:Defen[cs]e|War)|intelligence community|security clearances?|clearance|ITAR)\b/i;
const DEFENSE_GATED_RESP = compileLexicon([
  ['Mission / defense', 'missions?(?![- ](?:critical|driven|statement))'],
]);
// Fix wave 3: bare "agents" counts only in a posting about AI (AI_CONTEXT_RE), and not after
// another kind of agent (NON_AI_AGENTS).
const AI_GATED_SKILLS = compileLexicon([
  ['Agents', new RegExp(String.raw`(?<!\b(?:${NON_AI_AGENTS})\s?)(?<![A-Za-z0-9])agents(?![A-Za-z0-9])`, 'i')],
]);
// The title alone names the skill ("Senior Mechanical Engineer: Mechanisms, Space").
const TITLE_SKILLS = compileLexicon([
  ['Mechanical design', /\b(?:mechanical|electro-?mechanical|mechatronics?|mechanisms?)\b/i],
  ['Embedded', /\bembedded\b/i],
  ['Autonomy', /\bautonom(?:y|ous)\b/i],
]);
const LEXICON_ORDER = new Map(SKILL_LEXICON.map(([label], i) => [label, i]));

const SKILL_RES = new Map(SKILLS.map(({ label, res }) => [label, res]));
for (const { label, res } of [...TITLE_SKILLS, ...GATED_SKILLS, ...AI_GATED_SKILLS]) SKILL_RES.set(label, [...(SKILL_RES.get(label) || []), ...res]);

/**
 * Skill labels for a job: the lexicon, plus the title-only and technical-role-only patterns
 * (P-17) and the AI-posting-only ones (fix wave 3; `context` is the whole posting), in lexicon order.
 */
function matchSkills(title, all, context = all) {
  const out = new Set(matchLexicon(SKILLS, all));
  for (const { label, res } of TITLE_SKILLS) if (!out.has(label) && res.some((re) => re.test(title))) out.add(label);
  if (isTechnicalTitle(title)) for (const { label, res } of GATED_SKILLS) if (!out.has(label) && res.some((re) => re.test(all))) out.add(label);
  if (AI_CONTEXT_RE.test(context)) for (const { label, res } of AI_GATED_SKILLS) if (!out.has(label) && res.some((re) => re.test(all))) out.add(label);
  return [...out].sort((a, b) => LEXICON_ORDER.get(a) - LEXICON_ORDER.get(b));
}
// "Familiarity with HTML, CSS, Javascript, and Typescript is appreciated" (Palantir designers),
// "Experience with Rust is a plus": the skill is real but not what the role is about.
const NICE_TO_HAVE_RE = /\b(?:a (?:big |huge |strong |nice )?plus|nice[- ]to[- ]haves?|(?:is|are|would be) (?:also |very |highly )?(?:appreciated|a bonus|helpful|desirable|welcome|beneficial)|bonus points?|(?:is |are )?not (?:required|necessary)|don['’]t need to be an expert)\b/i;
const splitSentences = (s) => String(s || '').split(/\n+|(?<=[.!?])\s+(?=[A-Z(“"])/);
/** A bullet or sentence compared loosely: lower case, single spaces, no bullet mark or end punctuation. */
const bulletKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/^[\s•·▪●◦‣∙*\-–—]+|[\s.;,:!?]+$/g, '').trim();

/**
 * Skills in lexicon order, except that skills the posting names only in nice-to-have
 * sentences ("Familiarity with ... Typescript is appreciated", "Rust is a plus") come
 * last (P-17: a card shows the first two, and a designer's card should not lead with
 * TypeScript). The set is unchanged; only the order moves.
 */
function orderSkills(skills, { title, resp, fit, body, preferred = [] }) {
  if (skills.length < 2) return skills;
  const core = [String(title || '')];
  // BP-14: a "Preferred qualifications" list is nice-to-have too, wherever its bullets appear.
  const pref = preferred.length ? `\n${preferred.map(bulletKey).join('\n')}\n` : '';
  const inPreferred = (s) => { const k = bulletKey(s); return k.length >= 12 && pref.includes(k); };
  let nice = !!pref;
  for (const p of [...resp, ...fit, body]) {
    for (const s of splitSentences(p)) {
      if (NICE_TO_HAVE_RE.test(s) || (pref && inPreferred(s))) nice = true;
      else core.push(s);
    }
  }
  if (!nice) return skills;
  const coreText = core.join('\n');
  const late = new Set(skills.filter((label) => !(SKILL_RES.get(label) || []).some((re) => re.test(coreText))));
  return late.size ? [...skills.filter((l) => !late.has(l)), ...skills.filter((l) => late.has(l))] : skills;
}

// ---------------------------------------------------------------------------
// Years of experience
// ---------------------------------------------------------------------------

const WORD_NUMS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const NUM = `(\\d{1,2}|${Object.keys(WORD_NUMS).join('|')})`;
const YEARS_RE = new RegExp(
  `\\b${NUM}(?:\\s*(?:\\+|plus)|-plus)?(?:\\s*(?:-|–|—|to)\\s*\\d{1,2})?\\s*\\+?\\s*(?:or more\\s+)?(?:full[- ]time\\s+)?years?(?:['’])?(?!\\s+(?:old|ago))`,
  'gi',
);

/** Minimum years of experience mentioned (largest stated minimum), or null. */
export function yearsOfExperience(text) {
  if (!text) return null;
  let best = null;
  for (const m of String(text).matchAll(YEARS_RE)) {
    const raw = m[1].toLowerCase();
    const n = WORD_NUMS[raw] ?? parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 30) continue;
    best = best == null ? n : Math.max(best, n);
  }
  if (best == null && /\ba decade\b/i.test(text)) best = 10;
  return best;
}

export function yearsBucket(n) {
  if (n == null) return null;
  if (n >= 10) return '10+ yrs';
  if (n >= 8) return '8+ yrs';
  if (n >= 5) return '5+ yrs';
  if (n >= 3) return '3+ yrs';
  if (n >= 1) return '1+ yrs';
  return null;
}

// ---------------------------------------------------------------------------
// extractKeywords
// ---------------------------------------------------------------------------

/**
 * Keyword facets for a job: { responsibilities, fit, skills } (display labels,
 * deduped; responsibilities and fit in lexicon order, skills in salience order,
 * see orderSkills).
 */
export function extractKeywords({ title = '', department = '', sections = null, text = '', skillText = null } = {}) {
  const resp = (sections && sections.responsibilities) || [];
  const fit = (sections && sections.fit) || [];
  const preferred = (sections && sections.preferred) || [];
  const fitAll = preferred.length ? [...fit, ...preferred] : fit;
  const body = String(text || '');
  const all = [title, ...resp, ...fitAll, body].filter(Boolean).join('\n');
  // Fix wave 3: with both bullet lists, skills come from the title, the lists and the prose that
  // is the posting's own (skillText: the text without paragraphs repeated across a board's
  // different roles, teamParagraphs), not from team or company descriptions ("Chrome is
  // available across all major platforms — iOS, Android…", "development of our TPUs, Vertex AI
  // for Google Cloud" on a data-centre technician).
  const sectioned = resp.length > 0 && fitAll.length > 0 && typeof skillText === 'string';
  const skillBody = sectioned ? skillText : body;
  const skillHay = sectioned ? [title, ...resp, ...fitAll, skillBody].filter(Boolean).join('\n') : all;

  const skills = orderSkills(matchSkills(String(title || ''), skillHay, all), { title, resp, fit, body: skillBody, preferred });

  const respHay = [title, ...(resp.length ? resp : [body, department])].filter(Boolean).join('\n');
  const responsibilities = matchLexicon(RESP, respHay);
  if (!responsibilities.includes('Mission / defense') && DEFENSE_CONTEXT_RE.test(all)
    && DEFENSE_GATED_RESP[0].res.some((re) => re.test(respHay))) responsibilities.push('Mission / defense'); // the lexicon's last label

  const fitHay = (fitAll.length ? fitAll : [body]).join('\n');
  const fitOut = [];
  // BP-14: the years a posting requires, not its preferred ones ("3 years…" minimum, "5 years…"
  // preferred is "3+ yrs").
  const bucket = yearsBucket(yearsOfExperience(preferred.length ? fit.join('\n') : fitHay));
  if (bucket) fitOut.push(bucket);
  fitOut.push(...matchLexicon(FIT, fitHay));
  fitOut.push(...matchLexicon(FIT_GLOBAL, [fitHay, all].join('\n')));

  return {
    responsibilities: [...new Set(responsibilities)],
    fit: [...new Set(fitOut)],
    skills: [...new Set(skills)],
  };
}

// ---------------------------------------------------------------------------
// Seniority
// ---------------------------------------------------------------------------

const NON_PEOPLE_MANAGER = /\b(?:product|program|project|account|accounts|partner|partnerships?|success|relationship|community|case|territory|channel|marketing|campaign|solutions|deal|operations|events?|office|facilities|supply|procurement|contracts?|portfolio|category|release|brand|content|sales|business|capture|test|configuration|quality|logistics|risk|vendor|asset|property|benefits|payroll|lifecycle|growth)\s+(?:\w+\s+)?manager\b/i;

/**
 * Seniority bucket from a job title:
 * "Intern"|"Entry"|"Mid"|"Senior"|"Staff+"|"Manager"|"Director+".
 */
// "Member of Technical Staff" / "MTS" is the AI labs' generic IC title
// (Cohere, xAI, OpenAI, Salesforce...), not a Staff-level marker. Ladder
// abbreviations keep their level: SMTS = Senior, LMTS/PMTS = Staff+.
const MTS_ABBREV = [
  [/\bSMTS\b/gi, ' Senior '],
  [/\bLMTS\b/gi, ' Staff '],
  [/\bPMTS\b/gi, ' Principal '],
];
const MTS_PHRASE_RE = /\b(?:(?:a\s+)?members?\s+of\s+(?:the\s+)?technical\s+staff|technical\s+staff(?:\s+members?)?|members?\s+of\s+(?:the\s+)?staff|MTS)\b/gi;

function stripGenericStaff(title) {
  let t = title;
  for (const [re, rep] of MTS_ABBREV) t = t.replace(re, rep);
  return t.replace(MTS_PHRASE_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Seniority from a job title. `company` (a slug) picks that board's own ladder for
 * numbered rungs (Google "III", Netflix "Engineer 5"); without it the generic ladder is
 * used (docs/process/fix-beta-pay.md, DQ-3).
 */
export function inferSeniority(title, { company = null } = {}) {
  return seniorityOf(title, company).level;
}

/**
 * Where a title's seniority came from: 'title' when a level word or a ladder rung decided
 * it, 'default' when the title has none and the job is "Mid" by convention. On the 2026-10
 * boards about half the postings are 'default' (most of them at the labs, whose titles
 * carry no level), so market-comps "Mid" cells and Compstimate's Mid weighting are mostly
 * defaults. scripts/refresh/jobs.js reports the share monthly (seniority-ladder). A rung
 * that means mid-level (Google "III", Netflix "L4", "Engineer II") is 'Mid' with basis
 * 'title' (beta fix wave, shared decision 1).
 */
export function seniorityBasis(title, { company = null } = {}) {
  return seniorityOf(title, company).basis;
}

/**
 * A job's level and where it came from: { level, basis: 'title' | 'pay' | 'default' }.
 * The title decides when it states a level; otherwise a level named in the pay sentence
 * (Microsoft "Software Engineering IC6 - The typical base pay range ...", NVIDIA "... for
 * Level 4, and ... for Level 5") decides, read on that company's ladder; otherwise it is
 * the 'Mid' default. normalize.js stores this as job.seniority and job.seniorityBasis.
 */
export function jobSeniority({ title = '', text = '', company = null } = {}) {
  const byTitleLevel = seniorityOf(title, company);
  // VT-8 (fix wave 5, lead decision): Microsoft's own level in the pay sentence ("Technical
  // Program Management IC5 - The typical base pay range …") beats the title: a "Director, …" at
  // IC5 is an individual contributor (Staff+), a "Senior Finance Manager" at IC4 is Senior. On
  // the 2026-10-11 crawl 155 of 998 postings that state both disagree.
  if (String(company || '').toLowerCase() === 'microsoft' && byTitleLevel.level !== 'Intern') {
    const own = seniorityFromPay(text, { company });
    if (own) return { level: own.level, basis: 'pay' };
  }
  if (byTitleLevel.basis !== 'default') return byTitleLevel;
  const pay = seniorityFromPay(text, { company });
  return pay ? { level: pay.level, basis: 'pay' } : byTitleLevel;
}

const byTitle = (level) => ({ level, basis: 'title' });
const BY_DEFAULT = Object.freeze({ level: 'Mid', basis: 'default' });

// ---------------------------------------------------------------- board ladders (DQ-3)
// Numbered rungs, mapped to our levels with evidence from the boards' own titles and pay
// (2026-10-10 crawl; tables in docs/process/fix-beta-pay.md):
//   generic  I Entry, II Mid, III Mid, IV Senior, V+ Staff+ ("Engineer I" ... "Engineer V";
//            III is below a separate "Senior" on the Google and Microsoft ladders).
//   google   I and II Entry (II is Google's university-graduate band: TPM II $138K-$197K =
//            "Silicon Engineer, PhD, University Graduate" $138K-$197K), III Mid (L4, one
//            step below Senior: SWE III $179K vs Senior $213K), IV Senior (L5), V+ Staff+.
//   L-levels (Netflix, Google numbering) L3 Entry, L4 Mid, L5 Senior, L6+ Staff+.
//   netflix  "Engineer 5" is L5; a two-level title ("4/5", "L5/L6") is priced at its upper
//            level (4/5 postings post the L5 band, $466K-$750K), so it takes that one.
const GENERIC_RUNG = [null, 'Entry', 'Mid', 'Mid', 'Senior', 'Staff+', 'Staff+', 'Staff+', 'Staff+', 'Staff+'];
const GOOGLE_RUNG = [null, 'Entry', 'Entry', 'Mid', 'Senior', 'Staff+', 'Staff+', 'Staff+', 'Staff+', 'Staff+'];
//   amazon   (fix wave 5, DQ-36 / VT-21) I = L4 Entry, II = L5 Mid, III = L6 Senior, IV+ Senior:
//            US base medians on 2026-10-11, SDE III $198K = "Sr." SDE $198K, Program Manager III
//            $175K = Sr. Program Manager $175K, Scientist III $216K vs Sr. $197K; II $169K =
//            unlevelled SDE $169K.
const AMAZON_RUNG = [null, 'Entry', 'Mid', 'Senior', 'Senior', 'Staff+', 'Staff+', 'Staff+', 'Staff+', 'Staff+'];
const L_LADDER = [null, 'Entry', 'Entry', 'Entry', 'Mid', 'Senior', 'Staff+', 'Staff+', 'Staff+', 'Staff+', 'Staff+'];
const ROMAN = Object.freeze({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 });
const ROLE_NOUN = String.raw`(?:engineer(?:ing)?|scientist|developer|researcher|analyst|designer|architect|manager|technician|specialist|consultant|administrator|accountant|planner|inspector|representative|executive|programmer|writer|artist|producer|editor|recruiter|coordinator|advisor|partner|lead)`;
// "Engineer II", "Technician IV, Maintenance", "Customer Engineer I, Platform"; never
// "III-V Photonics", "V-BAT", "V&V", "A/V", "UK&I", "I/O".
const ROMAN_RE = /(?<![-/&\w.])(II|III|IV|VI|V)(?![-/&'’\w])|\s(I)(?=\s*(?:[,()\-–—]|$))/;
// "(L5)", "Software Engineer L4/5", "Product Manager L6, Data Platform", "Software Engineer
// L5/L6"; not "Senior Software Engineer, L4 - Autonomous Vehicles" (autonomy level 4) or a
// support tier ("Support Engineer L2").
// Fix wave 4 (DQ-3 residue): "(L5+L6)" names two levels like "(L5/L6)".
const L_LEVEL_RE = new RegExp(String.raw`\(L(\d{1,2})(?:\s*[\/+]\s*L?(\d{1,2}))?\)|\b${ROLE_NOUN}\s+L(\d{1,2})(?:\s*\/\s*L?(\d{1,2}))?\b`, 'i');
const L_TIER_RE = /\b(?:support|tier|soc|helpdesk|help desk|service desk)\b/i;
// "Software Engineer 6 - Ads", "Data Scientist 4- Interactive", "Software Engineer 4/5 –
// Model Serving", "Site Reliability Engineer 2", "Technician 3, Quality".
const TRAIL_NUM_RE = new RegExp(String.raw`\b${ROLE_NOUN}\s+(\d)(?:\s*\/\s*(\d))?(?=\s*(?:[-–—,:(|]|$))`, 'i');

function rungLevel(n, table) {
  if (!Number.isFinite(n) || n < 1) return null;
  return table[Math.min(n, table.length - 1)] || null;
}

/** The ladder rung a title names, read on the company's ladder, or null. */
function ladderRung(t, company) {
  const slug = String(company || '').toLowerCase();
  const pick = (a, b) => (b && Number.isFinite(b) ? (slug === 'netflix' ? Math.max(a, b) : Math.min(a, b)) : a);
  // A support tier ("Support Engineer L2") is not a level, except on Netflix's L-ladder, whose
  // support roles state their level too ("Support Solutions Engineer (L5)", DQ-3 residue).
  const l = L_TIER_RE.test(t) && slug !== 'netflix' ? null : L_LEVEL_RE.exec(t);
  if (l) {
    const a = Number(l[1] || l[3]);
    const b = Number(l[2] || l[4]);
    const lv = rungLevel(pick(a, b), L_LADDER);
    if (lv) return lv;
  }
  const n = TRAIL_NUM_RE.exec(t);
  if (n) {
    const a = Number(n[1]);
    const b = n[2] ? Number(n[2]) : null;
    const lv = rungLevel(pick(a, b), slug === 'netflix' ? L_LADDER : GENERIC_RUNG);
    if (lv) return lv;
  }
  const r = ROMAN_RE.exec(t);
  if (r) return rungLevel(ROMAN[r[1] || r[2]], slug === 'google' ? GOOGLE_RUNG : slug === 'amazon' ? AMAZON_RUNG : GENERIC_RUNG);
  return null;
}

// ------------------------------------------------- levels named in the pay text (DQ-3)
// Microsoft: "<Profession> IC5 - The typical base pay range for this role across ...".
// Evidence (median US base and the level Microsoft's own titles carry at each band):
// IC2 $127K (Entry), IC3 $152K ("Software Engineer II": Mid), IC4 $177K (305 "Senior"
// titles), IC5 $209K (216 "Principal"), IC6 $231K (42 "Principal"/"Partner"); M3/M4/M5 are
// people managers, M6+ directors (28 of 47 M6 titles say Director).
const MICROSOFT_IC = [null, 'Entry', 'Entry', 'Mid', 'Senior', 'Staff+', 'Staff+', 'Staff+', 'Staff+'];
const MICROSOFT_M = [null, 'Manager', 'Manager', 'Manager', 'Manager', 'Manager', 'Director+', 'Director+', 'Director+'];
const MICROSOFT_LEVEL_RE = /\b(IC|M)(\d{1,2})\s+[-–—]\s+the typical base pay range\b/gi;
// NVIDIA: "... 184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level
// 5." The posting hires at either level; its lower level decides. Evidence (NVIDIA's own
// titles at each pair): 1/2 "New College Grad" (Entry), 2/3 no level word ($167K: Mid), 3/4
// 193 "Senior", 4/5 381 "Senior", 5/6 64 "Senior" (1 "Principal"), 6/7 "Principal" (Staff+).
const NVIDIA_LEVEL = [null, 'Entry', 'Mid', 'Senior', 'Senior', 'Senior', 'Staff+', 'Staff+', 'Staff+'];
const NVIDIA_LEVEL_RE = /\bfor\s+Level\s+(\d{1,2})\b/gi;

/**
 * The level a posting's pay sentence names, on that company's ladder: { level, label } or
 * null (Microsoft "IC6" -> Staff+, NVIDIA "Level 4 ... Level 5" -> Senior). Only for the
 * boards whose pay text names their ladder (microsoft, nvidia).
 */
export function seniorityFromPay(text, { company = null } = {}) {
  const slug = String(company || '').toLowerCase();
  const s = String(text || '');
  if (slug === 'microsoft') {
    let best = null;
    for (const m of s.matchAll(MICROSOFT_LEVEL_RE)) {
      const kind = m[1].toUpperCase();
      const n = Number(m[2]);
      const level = rungLevel(n, kind === 'IC' ? MICROSOFT_IC : MICROSOFT_M);
      // Several levels: the lowest one the posting hires at (IC rungs before M rungs).
      const rank = (kind === 'IC' ? 0 : 100) + n;
      if (level && (!best || rank < best.rank)) best = { level, label: `${kind}${n}`, rank };
    }
    return best ? { level: best.level, label: best.label } : null;
  }
  if (slug === 'nvidia') {
    const ns = [...s.matchAll(NVIDIA_LEVEL_RE)].map((m) => Number(m[1])).filter((n) => n >= 1);
    if (!ns.length) return null;
    const n = Math.min(...ns);
    const level = rungLevel(n, NVIDIA_LEVEL);
    return level ? { level, label: `Level ${n}` } : null;
  }
  return null;
}

// P-3 (persona review 2026-10-10). "Account Director" / "Partner Director" are sales and
// partner titles (OpenAI's ~40 Account Directors, "Federal Account Director") and a "Test
// Director" runs test events ("Senior Staff Engineer, Test Director"): none is an
// executive, so these phrases never make a title Director+.
// ("People Business Partner Director" is an HR director, so "business partner" is left out.)
const NON_EXEC_DIRECTOR_RE = /\b(?:accounts?|(?<!\bbusiness\s)partner|client|test)\s+director\b/gi;
// VT-21 (fix wave 5): Amazon's "Data Center Chief Engineer" is a facilities rung ($131K median, 9
// postings), not an executive.
const NON_EXEC_CHIEF_RE = /\b(?:data\s+cent(?:er|re)|facilit(?:y|ies)|site|plant|building)\s+chief\s+engineers?\b/gi;
// VT-21: an executive word inside the team name after the role ("Communications Specialist, CEO &
// Financial Comms") describes the team, not the job: the role before the comma decides when it
// names its own role noun and no executive word.
const EXEC_WORD_RE = /\b(?:director|vp|svp|evp|vice[- ]president|head of|chief|cto|cfo|ceo|coo|ciso|cmo|cpo|president|general manager|partner,)\b/i;
const ROLE_HEAD_RE = /\b(?:specialist|engineer|analyst|associate|coordinator|manager|scientist|developer|designer|technician|writer|representative|consultant|accountant|recruiter|partner|advisor|administrator|architect|planner|strategist|counsel|attorney|lead)s?\b/i;
function execTail(t) {
  const i = t.search(/,|\s[-–—|]\s/);
  if (i <= 0) return false;
  const head = t.slice(0, i);
  return ROLE_HEAD_RE.test(head) && !EXEC_WORD_RE.test(head) && !/^head\b/i.test(head);
}
// DQ-37 (fix wave 5): Meta's "(Technical Leadership)" and "(Leadership)" titles are its senior-most
// hiring bands: 43 postings, median US base $260K, above Meta's Senior ($206K) and Staff+ ($238K).
const META_LEADERSHIP_RE = /\((?:technical\s+)?leadership\)/i;
// BP-11 (fix wave 3): "Art Director", "Creative Director" and "Technical Director" are senior
// individual-contributor titles in design, animation and engineering, not executives. Evidence
// (2026-10-11 beta crawl, docs/process/fix3-data.md): Apple's 14 pay a median of $222K, against
// $404K for Apple's other Director titles and $255K for its senior designers; Netflix Animation's
// pipeline, lighting and effects TDs pay CA$120K–180K; the postings ask for 5 to 10+ years,
// like Senior roles, and 0 of Apple's and Netflix's mention managing a team. They are 'Senior'
// (a "Principal" or "Staff" one is Staff+); an "Executive Creative Director" stays Director+.
const IC_DIRECTOR_RE = /\b(?<!\bexecutive\s)(?:(?:associate|assoc\.?|senior|sr\.?|group|lead)\s+)?(?:art|creative|technical)\s+director\b/gi;
// A distinguished-type fellow is a senior individual-contributor rank. Any other "Fellow"
// ("Conceptual Reasoning Fellow", "SWE Fellow - Human Frontier Collective") is a
// fixed-term fellowship, filed with internships like "Anthropic Fellows Program".
const SENIOR_FELLOW_RE = /\b(?:distinguished|technical|senior|principal|corporate|chief)\s+fellows?\b/i;
const FELLOW_RE = /\bfellows?\b/i;

// A student role is filed with internships ("Hardware Engineering Student", "Student
// Researcher", "Student Worker Opportunities", French "Stagiaire", "Étudiant-chercheur"),
// but not a role that serves students ("Student Success Manager").
const STUDENT_RE = /\bstudents?\b(?!\s+(?:success|affairs|loans?|services?|experience|engagement|recruit\w*|outreach|programs?|community|support|marketing))|\bstagiaires?\b|(?:^|[\s,(])[ÉéEe]tudiante?s?[- ]chercheu(?:r|se)s?\b/i;
// "Associate General Counsel", "Associate Product Counsel": a lawyer's title, not entry level.
const ASSOCIATE_COUNSEL_RE = /\bassociate\s+(?:[\w&-]+\s+){0,3}?counsel\b/gi;

// Fix wave 4 (DQ-29): Google numbers each job family on its own band, so one numeral ladder
// does not fit every "… Manager <numeral>" title (2026-10-11 crawl, US base medians):
//   - Product Manager I $168K (7) and II $200K (16) sit one rung above Technical Program
//     Manager I $141K, II $168K and III $200K, so a Product Manager rung reads one step up
//     (II is Mid, like TPM III);
//   - Leadership Technical Program Manager I and II are $235K, between Senior ($213K) and
//     Staff+ ($254K): Senior, never Entry;
//   - every other numbered manager family is a people manager, as "Software Engineering Manager
//     II" ($254K) already is: Facilities Manager I $169K and II $201K, Land Development Manager
//     II and III, Customer Engineering Manager II, Government Affairs and Public Policy Manager II;
//   - Program, Technical Program and Account Manager titles keep the ladder (TPM II $168K is
//     the university-graduate band).
const GOOGLE_NUMBERED_MANAGER_RE = /\bmanager\s+(VI|IV|V|I{1,3})(?=\s*(?:[,()\-–—:|]|$))/i;
function googleNumberedManager(t, company) {
  if (String(company || '').toLowerCase() !== 'google') return null;
  const m = GOOGLE_NUMBERED_MANAGER_RE.exec(t);
  if (!m) return null;
  const n = ROMAN[m[1].toUpperCase()];
  if (/\bleadership\b/i.test(t)) return n >= 3 ? 'Staff+' : 'Senior';
  if (/\bproduct manager\s+[IVX]/i.test(t)) return rungLevel(n + 1, GOOGLE_RUNG);
  if (/\b(?:program|account|accounts)\s+manager\s+[IVX]/i.test(t)) return null;
  return 'Manager';
}

function seniorityOf(title, company = null) {
  const t = stripGenericStaff(String(title || ''));
  if (!t.trim()) return BY_DEFAULT;
  const icDirector = IC_DIRECTOR_RE.test(t);
  IC_DIRECTOR_RE.lastIndex = 0;
  const exec = t.replace(NON_EXEC_DIRECTOR_RE, ' ').replace(IC_DIRECTOR_RE, ' ').replace(NON_EXEC_CHIEF_RE, ' engineer ');
  if ((EXEC_WORD_RE.test(exec) && !execTail(exec)) || /^head\b/i.test(t)) return byTitle('Director+');
  if (String(company || '').toLowerCase() === 'meta' && META_LEADERSHIP_RE.test(t)) return byTitle('Staff+');
  if (/\b(?:intern(?:ship)?s?|fellowships?|fellows program|co-?op|apprentice(?:ship)?|summer (?:analyst|associate|student)|residency|resident)\b/i.test(t)
    || (FELLOW_RE.test(t) && !SENIOR_FELLOW_RE.test(t)) || STUDENT_RE.test(t)) return byTitle('Intern');
  if (/\b(?:staff|principal|distinguished)\b/i.test(t) || SENIOR_FELLOW_RE.test(t)) return byTitle('Staff+');
  const google = googleNumberedManager(t, company);
  if (google) return byTitle(google);
  const isManager = /\bmanager\b/i.test(t) && !NON_PEOPLE_MANAGER.test(t);
  if (isManager || /\b(?:team lead|people lead|supervisor|engineering lead|lead,? (?:people|team))\b/i.test(t)
    || /\bmanager,\s/i.test(t) && !NON_PEOPLE_MANAGER.test(t)) return byTitle('Manager');
  if (/\b(?:senior|sr\.?|lead)\b/i.test(t) || icDirector) return byTitle('Senior');
  if (/\b(?:junior|jr\.?|associate|new (?:college |university )?grad(?:uate)?|(?:college|university) grad(?:uate)?|graduate|entry[- ]level|early careers?)\b/i.test(t.replace(ASSOCIATE_COUNSEL_RE, ' counsel'))) return byTitle('Entry');
  // A numbered rung on the board's ladder (Google "III", Netflix "(L5)", "Engineer II").
  const rung = ladderRung(t, company);
  if (rung) return byTitle(rung);
  return BY_DEFAULT;
}

// ---------------------------------------------------------------------------
// Compensation extras (F2): does the posting say the offer includes equity
// and/or a bonus / commission? Evaluated against hand-labelled real postings
// in test/fixtures/extras-labels.json (see docs/process/features.md).
// ---------------------------------------------------------------------------

// "equity" senses that are not employee equity: DEI, finance subject matter,
// donation programmes. Removed before matching.
const EQUITY_NOISE_RE = new RegExp([
  String.raw`\b(?:pay|health|healthcare|racial|gender|social|educational|digital|internal|external|compensation|salary|wage|income|housing|economic|brand|home|private|growth|public|sweat|negative|positive|shareholders?['’]?|stockholders?['’]?)\s+equity\b`,
  String.raw`\bdiversity,?\s+(?:and\s+)?equity\b`,
  String.raw`\bequity,?\s+(?:and|&)\s+(?:inclusion|belonging|diversity|access|justice)\b`,
  String.raw`\bequity,\s*(?:inclusion|belonging)\b`,
  String.raw`\bDE&?I&?B?\b`,
  String.raw`\bequity[- ](?:research|markets?|investments?|investing|investors?|financing|capital|analysts?|analysis|deals?|transactions?|method|accounting|roll-?forwards?|administration|teams?|donations?|minded|lens|events?|instruments?|considerations?|planning|programs? managers?)\b`,
  String.raw`\b(?:their|employees['’]?)\s+equity\b`,
  String.raw`\b(?:optional\s+)?equity donation(?: matching)?\b`,
  String.raw`\bequitabl[ey]\b`,
].join('|'), 'gi');

// Nice-to-have senses of "bonus": "It's a bonus if you have", "Bonus:", "Bonus points".
const BONUS_NOISE_RE = /\[bonus\]|\bbonus\s*points?\b|\b(?:it(?:['’]s| is)|is|as|would be|a (?:big|huge|real))\s+an?\s+(?:big\s+|huge\s+|nice\s+|major\s+|real\s+)?bonus\b|\bas a bonus\b|\bbonus\s+(?:if|for|to have)\b|\bbonus\s*[:–—-]\s*(?=\S)|^\s*bonus\b(?!\s*(?:\+|,|and|eligib|plan|program|potential|structure|target))/gim;

// The sentence is about doing compensation work, not about this offer.
const COMP_DUTY_RE = /\b(?:payroll|accounting|accruals?|ASC\s?\d{3}|GAAP|SOX|audits?|tax(?:es)?|administ\w*|roll-?forwards?|footnotes?|reconcil\w*|benchmark\w*|governance|oversee|design(?:ing)?,? (?:and|&) (?:oversee|manage|run)|compensation (?:programs?|programmes?|planning|methodolog\w*|strategy|philosophy|practices|professionals?|experience|expertise|principles|governance)|incentive (?:plan )?design|experience (?:with|in|designing|managing|building)|knowledge of|familiarity with|matters|counsel|securities|negotiat\w*|structures|cap tables?|tender offers?|process stock options|equity team|equity programmes|knowledge|prior experience|valuation|dilution|financial statements?|earnings[- ]per[- ]share|counteroffers?|closing strateg\w*)\b/i;

// The sentence denies or merely hedges ("This estimate excludes ... bonus").
const COMP_NEGATION_RE = /\bnot\s+(?:be\s+)?eligible\b|\bineligible\b|\b(?:are|is|will be)\s+not\s+(?:offered|included|provided)\b|\bdoes(?:n['’]t| not) (?:include|offer)\b|\bno (?:equity|bonus|commission)\b|\bexclud(?:es?|ing)\b/i;

// Conditional boilerplate: "For sales roles, the range ... OTE ... commissions"
// (SALES_CONDITIONAL_RE, defined in server/salary.js, which uses it for on-target earnings).
const SALES_TITLE_RE = /\b(?:account executive|account director|account manager|ae\b|business development (?:rep\w*|manager|executive|director)|bdr|sdr|partner sales|sales(?!\s+(?:strategy|operations|ops|enablement|engineer\w*|compensation|analytics|systems|planning|finance|recruit\w*))\b|seller)/i;
// Sales-org roles that are not quota-carrying.
const SALES_TITLE_EXCLUDE_RE = /\b(?:enablement|pre-?sales|presales|operations|strategy|analyst|developer|recruit\w*)\b/i;

/**
 * A quota-carrying sales title ("Enterprise Account Executive", "Sales Lead", "Business
 * Development Representative"; not "Sales Enablement Lead" or "Customer Success Manager").
 * A "for sales roles" sentence applies only to these (extras here, OTE in server/salary.js).
 */
export function isSalesTitle(title) {
  const t = String(title || '');
  return SALES_TITLE_RE.test(t) && !SALES_TITLE_EXCLUDE_RE.test(t);
}
const NON_FULLTIME_TITLE_RE = /\b(?:intern(?:ship)?s?|co-?op|part[- ]time|temporary|seasonal|fellow(?:ship)?s?|contractor)\b|\((?:contract|temp|contract-to-hire)\)|,\s*contract\s*$/i;
// "... included in the majority of full time offers" does not apply to interns/contractors.
const FULLTIME_SCOPE_RE = /\bfull[- ]time\b/i;
const NON_FULLTIME_MENTION_RE = /\b(?:intern(?:ship)?s?|co-?ops?|part[- ]time|temporary|fellows?|contractors?)\b/i;

const COMP_CUE_RE = /\b(?:compensation|salary|salaries|base pay|pay\b|total rewards|offer package|package|benefits|401\s?\(?k\)?|remuneration|perks)\b/i;

const EQUITY_STRONG = [
  /\boffers?\s+equity\b/i,
  /\bRSUs?\b/,
  /\brestricted stock(?: units?)?\b/i,
  /\bstock[- ]options?\b/i,
  /\bstock (?:grants?|awards?|compensation|units?|purchase plan|plan)\b/i,
  /\bstock-based\b/i,
  /\bemployee stock\b/i,
  /\bESPP\b/,
  /\bequity(?:[- ]based)?\s+(?:grants?|awards?|packages?|compensation|participation|options?|refresh(?:ers?)?|stakes?|incentives?|upside)\b/i,
  /\b(?:meaningful|significant|generous|competitive|attractive)\s+(?:equity|ownership stake)\b/i,
  /\bownership stake\b/i,
  /\b(?:granted|receive|eligible for|includes?|including|plus|and|with)\s+(?:an?\s+)?(?:annual\s+|initial\s+)?equity\b/i,
  /\+\s*equity\b/i,
];

const BONUS_STRONG = [
  /\b(?:sign[- ]?on|signing|joining|hiring|annual|performance(?:[- ]based)?|year[- ]end|retention|relocation|quarterly|target|discretionary|cash|spot|completion|incentive|variable)\s+bonus(?:es)?\b/i,
  /\bbonus(?:es)?\s+(?:eligib\w*|plan|program(?:me)?s?|potential|opportunit\w*|structure|target|pool|payments?|scheme)\b/i,
  /\b(?:eligible for|eligibility for|qualify for)\s+(?:an?\s+|our\s+)?(?:annual\s+|discretionary\s+|performance\s+)?bonus/i,
  /\bbonus[- ]eligible\b/i,
  /\+\s*bonus\b/i,
  /\boffers?\s+(?:a\s+)?(?:bonus|commission)\b/i,
  /\bOTE\b/,
  /\bon[- ]target earnings\b/i,
  /\bcommission(?:s)?\s+(?:structure|plan|opportunit\w*|eligib\w*|scheme|rate|target)\b/i,
  /\bcommission-based\b/i,
  /\b(?:earn|uncapped|plus|sales)\s+commissions?\b/i,
  /\b(?:salary|base|pay|compensation)\s+(?:and|plus|with|\+)\s+commissions?\b/i,
  /\+\s*commissions?\b/i,
  /(?:•|\d[KkMm]?)\s*(?:Commission|Bonus)\b/, // Ashby summary: "$189K – $220.5K Commission
  /\beligible (?:for|to earn) (?:sales )?commissions?\b/i,
  /\b(?:incentive|variable) (?:compensation|pay|plan|comp)\b/i,
  /\bshort[- ]term incentives?\b/i,
  /\bprofit[- ]sharing\b/i,
];

function compSegments(text) {
  return String(text || '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z(“"])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Like extractCompExtras but also returns the sentences that decided each facet.
 * @returns {{equity:boolean, bonus:boolean, evidence:{equity:string[], bonus:string[]}}}
 */
export function compExtrasEvidence(text, { title = '' } = {}) {
  let src = String(text || '');
  if (/<(?:p|li|ul|div|br|h[1-6])\b/i.test(src)) src = htmlToText(src);
  const salesTitle = isSalesTitle(title);
  const nonFullTime = NON_FULLTIME_TITLE_RE.test(title);
  const evidence = { equity: [], bonus: [] };
  const vetoed = { equity: false, bonus: false };

  for (const seg of compSegments(src)) {
    const eqText = seg.replace(EQUITY_NOISE_RE, ' ');
    const bnText = seg.replace(BONUS_NOISE_RE, ' ');
    const hasEq = /\bequity\b|\bstock\b|\bRSUs?\b|\bESPP\b|\bownership stake\b/i.test(eqText);
    const hasBn = /\bbonus(?:es)?\b|\bcommissions?\b|\bOTE\b|on[- ]target|incentive|variable|profit[- ]sharing/i.test(bnText);
    if (!hasEq && !hasBn) continue;

    if (COMP_NEGATION_RE.test(seg)) {
      // "Interns/Part-time not eligible for bonus, benefits or equity" applies to this posting.
      if (nonFullTime && NON_FULLTIME_MENTION_RE.test(seg)) {
        if (hasEq) vetoed.equity = true;
        if (hasBn) vetoed.bonus = true;
      }
      continue;
    }
    if (COMP_DUTY_RE.test(seg)) continue;
    if (SALES_CONDITIONAL_RE.test(seg) && !salesTitle) continue;
    if (nonFullTime && FULLTIME_SCOPE_RE.test(seg)) continue;

    if (hasEq && (EQUITY_STRONG.some((re) => re.test(eqText)) || (/\bequity\b/i.test(eqText) && COMP_CUE_RE.test(eqText)))) {
      evidence.equity.push(seg);
    }
    if (hasBn && (BONUS_STRONG.some((re) => re.test(bnText)) || (/\bbonus(?:es)?\b/i.test(bnText) && COMP_CUE_RE.test(bnText)))) {
      evidence.bonus.push(seg);
    }
  }
  return {
    equity: evidence.equity.length > 0 && !vetoed.equity,
    bonus: evidence.bonus.length > 0 && !vetoed.bonus,
    evidence,
  };
}

/**
 * Compensation extras stated in a posting (F2).
 * equity: RSUs, stock options, equity grants, "Offers Equity", "+ Equity"...
 * bonus: signing/annual/performance bonus, commission, OTE, incentive comp...
 * Rejects DEI senses ("pay equity", "diversity, equity and inclusion"),
 * nice-to-have "bonus" ("It's a bonus if you have"), compensation *work*
 * (payroll, equity accounting), negations and hedges, and "For sales roles"
 * boilerplate unless `title` looks like a sales role.
 * @param {string} text  description text (HTML is accepted) plus any salary summary text
 * @param {{title?: string}} [opts]
 * @returns {{equity: boolean, bonus: boolean}}
 */
export function extractCompExtras(text, opts = {}) {
  const { equity, bonus } = compExtrasEvidence(text, opts);
  return { equity, bonus };
}

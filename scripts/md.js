// Tiny dependency-free Markdown -> HTML for the site's own docs pages
// (docs/METHODOLOGY_GUIDE.md -> methodology/index.html, docs/LIVABILITY.md ->
// methodology/reference/index.html). Covers what our docs use: ATX headings
// (GitHub-style ids, so #1-the-formula anchors keep working; `## Title {#id}`
// sets an id explicitly), paragraphs, nested ul/ol, GFM tables, fenced and
// inline code, bold, italic, links, blockquotes (GitHub alerts `> [!NOTE]`
// become callouts) and rules. Everything is HTML-escaped; raw HTML in the
// Markdown is shown as text, never interpreted. HTML comments that start a
// line (one line or several, e.g. the generated-table markers the monthly
// refresh puts around tables, docs/DATA_FRESHNESS.md) are dropped, as GitHub
// drops them; read one on purpose with commentField().
//
// Links (site link policy, test/links-policy.test.js): `#anchor` links stay
// links; anything else goes through `opts.link(href)`, which returns a
// site-relative href to keep, or null to render the link as plain text with
// its target shown (so off-site references stay readable but never navigate).
//
// Placeholders (only when opts.figure or opts.value is given; the guide page):
//   {{figure:name}}  alone on a line -> opts.figure(name) (trusted HTML block)
//   {{value:key}}    anywhere        -> opts.value(key)  (plain text)
// Anything else that looks like a placeholder, a figure inside a paragraph, or
// a value with Markdown syntax in it throws (err.code 'MD_PLACEHOLDER'), so a
// page never ships a literal "{{".

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GitHub's heading slug: lower-case, drop punctuation except - and _, spaces -> -. */
export function slugify(text) {
  return String(text).trim().toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The value of a `<!-- key: value -->` comment (first one; may span lines), or null. */
export function commentField(md, key) {
  const re = new RegExp(`<!--\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([\\s\\S]*?)\\s*-->`);
  const m = re.exec(String(md));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/** Heading text without Markdown markup (for ids and the TOC). */
function plain(s) {
  return s.replace(/`([^`]*)`/g, '$1').replace(/\*\*|__/g, '').replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function inline(src, opts) {
  // Protect code spans first, then escape, then apply emphasis and links.
  const codes = [];
  const raw = [];
  let s = src.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${esc(c)}</code>`); raw.push(m); return `\u0000${codes.length - 1}\u0000`; });
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    // The label is rendered by a recursive call with its own code table, so
    // put its code spans back as source text first.
    links.push({ label: label.replace(/\u0000(\d+)\u0000/g, (_m, i) => raw[Number(i)]), href });
    return `\u0001${links.length - 1}\u0001`;
  });
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?=[^\w*]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => {
    const { label, href } = links[Number(i)];
    const text = inline(label, opts);
    if (href.startsWith('#')) return `<a href="${esc(href)}">${text}</a>`;
    const keep = opts.link ? opts.link(href) : null;
    if (keep) return `<a href="${esc(keep)}">${text}</a>`;
    return /^https?:\/\//i.test(href)
      ? `<span class="ref">${text} <span class="ref-url">(${esc(href)})</span></span>`
      : `<span class="ref">${text}</span>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

const FIGURE_LINE = /^\s*\{\{\s*figure:([a-z0-9][a-z0-9-]*)\s*\}\}\s*$/;
const VALUE_TOKEN = /\{\{\s*value:([A-Za-z0-9][\w.-]*)\s*\}\}/g;
const ALERTS = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

function placeholderError(msg, lineNo) {
  return Object.assign(new Error(`${msg} (Markdown line ${lineNo})`), { code: 'MD_PLACEHOLDER', line: lineNo });
}

/**
 * @param {string} md
 * @param {{ link?: (href: string) => string|null,
 *           figure?: (name: string) => string,
 *           value?: (key: string) => string|number }} [opts]
 * @returns {{ html: string, headings: Array<{ level: number, id: string, text: string }>,
 *             blocks: Array<{ html: string, heading: { level: number, id: string, text: string }|null }> }}
 */
export function mdToHtml(md, opts = {}) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const headings = [];
  const seen = new Map();
  const placeholders = typeof opts.figure === 'function' || typeof opts.value === 'function';
  let i = 0;

  const push = (html, heading = null) => blocks.push({ html, heading });
  const flushPara = (buf) => { if (buf.length) push(`<p>${inline(buf.join(' '), opts)}</p>`); buf.length = 0; };
  const para = [];

  // Placeholder mode: {{value:…}} is replaced in every line up front, so values work in
  // headings, tables, lists and code alike; whatever "{{" is left is an error.
  if (placeholders) {
    for (let k = 0; k < lines.length; k++) {
      if (FIGURE_LINE.test(lines[k])) continue;
      lines[k] = lines[k].replace(VALUE_TOKEN, (_, key) => {
        if (typeof opts.value !== 'function') throw placeholderError(`{{value:${key}}} but no values are available`, k + 1);
        const v = String(opts.value(key));
        if (/[`*_[\]|\\{}]/.test(v) || v.includes('\n')) throw placeholderError(`value ${key} = ${JSON.stringify(v)} contains Markdown syntax`, k + 1);
        return v;
      });
      const left = /\{\{[^}]*\}?\}?/.exec(lines[k]);
      if (left) {
        throw placeholderError(/figure:/.test(left[0])
          ? `${left[0]} must be on a line of its own`
          : `unknown placeholder ${left[0]}`, k + 1);
      }
    }
  }

  function list() {
    // Consecutive list lines (and their indented continuations) -> nested lists.
    const items = [];
    while (i < lines.length) {
      const l = lines[i];
      const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
      if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); i++; continue; }
      if (/^\s+\S/.test(l) && items.length) { items[items.length - 1].text += ' ' + l.trim(); i++; continue; }
      break;
    }
    const render = (from, indent) => {
      let html = '';
      const ordered = items[from].ordered;
      let k = from;
      html += ordered ? '<ol>' : '<ul>';
      while (k < items.length && items[k].indent >= indent) {
        if (items[k].indent > indent) { const [sub, next] = render(k, items[k].indent); html = html.replace(/<\/li>$/, `${sub}</li>`); k = next; continue; }
        html += `<li>${inline(items[k].text, opts)}</li>`;
        k++;
      }
      html += ordered ? '</ol>' : '</ul>';
      return [html, k];
    };
    let k = 0;
    while (k < items.length) { const [html, next] = render(k, items[k].indent); push(html); k = next; }
  }

  while (i < lines.length) {
    const line = lines[i];
    const fence = /^(\s*)(```+|~~~+)\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      flushPara(para);
      const close = fence[2];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(close)) body.push(lines[i++]);
      i++;
      push(`<pre><code${fence[3] ? ` class="language-${esc(fence[3])}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      // An HTML comment (one line or several): not content. Text after "-->" on the
      // closing line is kept.
      flushPara(para);
      const start = line.indexOf('<!--') + 4;
      let k = i;
      let end = line.indexOf('-->', start);
      while (end < 0 && ++k < lines.length) end = lines[k].indexOf('-->');
      if (end < 0) { i = lines.length; continue; }
      const rest = lines[k].slice(end + 3);
      if (rest.trim()) { lines[k] = rest; i = k; } else i = k + 1;
      continue;
    }
    if (placeholders) {
      const fig = FIGURE_LINE.exec(line);
      if (fig) {
        flushPara(para);
        if (typeof opts.figure !== 'function') throw placeholderError(`{{figure:${fig[1]}}} but no figures are available`, i + 1);
        push(String(opts.figure(fig[1])));
        i++;
        continue;
      }
    }
    const h = /^(#{1,6})\s+(.*?)\s*(?:\{#([A-Za-z0-9][\w-]*)\})?\s*#*\s*$/.exec(line);
    if (h) {
      flushPara(para);
      const level = h[1].length;
      const text = plain(h[2]);
      let id = h[3] || slugify(text);
      const n = seen.get(id) || 0;
      if (h[3] && n) throw Object.assign(new Error(`duplicate heading id {#${id}} (Markdown line ${i + 1})`), { code: 'MD_DUPLICATE_ID' });
      seen.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      const heading = { level, id, text };
      headings.push(heading);
      push(`<h${level} id="${esc(id)}">${inline(h[2], opts)} <a class="anchor" href="#${esc(id)}" aria-label="Link to this section">#</a></h${level}>`, heading);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(para); push('<hr>'); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara(para);
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c, opts)}</${tag}>`;
      push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${head.map((_, k) => td('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) { flushPara(para); list(); continue; }
    if (/^\s*>/.test(line)) {
      flushPara(para);
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      const alert = /^\s*\[!(\w+)\]\s*$/.exec(body[0] || '');
      const kind = alert && ALERTS[alert[1].toLowerCase()] ? alert[1].toLowerCase() : null;
      if (kind) {
        const inner = mdToHtml(body.slice(1).join('\n'), { ...opts, figure: undefined, value: undefined }).html;
        push(`<aside class="callout callout--${kind}" role="note"><p class="callout-title">${ALERTS[kind]}</p>${inner}</aside>`);
      } else {
        push(`<blockquote>${mdToHtml(body.join('\n'), { ...opts, figure: undefined, value: undefined }).html}</blockquote>`);
      }
      continue;
    }
    if (!line.trim()) { flushPara(para); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flushPara(para);
  return { html: blocks.map((b) => b.html).join('\n'), headings, blocks };
}

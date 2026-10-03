// Tiny dependency-free Markdown -> HTML for the site's own docs pages
// (docs/LIVABILITY.md -> methodology/index.html). Covers what our docs use:
// ATX headings (GitHub-style ids, so #1-the-formula anchors keep working),
// paragraphs, nested ul/ol, GFM tables, fenced and inline code, bold, italic,
// links, blockquotes and rules. Everything is HTML-escaped; raw HTML in the
// Markdown is shown as text, never interpreted.
//
// Links (site link policy, test/links-policy.test.js): `#anchor` links stay
// links; anything else goes through `opts.link(href)`, which returns a
// site-relative href to keep, or null to render the link as plain text with
// its target shown (so off-site references stay readable but never navigate).

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GitHub's heading slug: lower-case, drop punctuation except - and _, spaces -> -. */
export function slugify(text) {
  return String(text).trim().toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
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

/**
 * @param {string} md
 * @param {{ link?: (href: string) => string|null }} [opts]
 * @returns {{ html: string, headings: Array<{ level: number, id: string, text: string }> }}
 */
export function mdToHtml(md, opts = {}) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const seen = new Map();
  let i = 0;

  const flushPara = (buf) => { if (buf.length) out.push(`<p>${inline(buf.join(' '), opts)}</p>`); buf.length = 0; };
  const para = [];

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
    while (k < items.length) { const [html, next] = render(k, items[k].indent); out.push(html); k = next; }
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
      out.push(`<pre><code${fence[3] ? ` class="language-${esc(fence[3])}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara(para);
      const level = h[1].length;
      const text = plain(h[2]);
      let id = slugify(text);
      const n = seen.get(id) || 0;
      seen.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      headings.push({ level, id, text });
      out.push(`<h${level} id="${esc(id)}">${inline(h[2], opts)} <a class="anchor" href="#${esc(id)}" aria-label="Link to this section">#</a></h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(para); out.push('<hr>'); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara(para);
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c, opts)}</${tag}>`;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${head.map((_, k) => td('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) { flushPara(para); list(); continue; }
    if (/^\s*>/.test(line)) {
      flushPara(para);
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${mdToHtml(body.join('\n'), opts).html}</blockquote>`);
      continue;
    }
    if (!line.trim()) { flushPara(para); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flushPara(para);
  return { html: out.join('\n'), headings };
}

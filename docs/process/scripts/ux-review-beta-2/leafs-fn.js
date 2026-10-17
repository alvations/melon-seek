// leafBlocks(rootSel, {minWords, exclude}) -> visible text "leaf blocks" under the root, with words and line count.
((rootSel, opts = {}) => {
  const minWords = opts.minWords ?? 1;
  const exclude = opts.exclude || '';
  const roots = [...document.querySelectorAll(rootSel)];
  const out = [];
  const inlineish = (d) => d === 'inline' || d === 'inline-block' || d === 'contents' || d === 'inline-flex';
  const visible = (e) => { const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false; if (e.closest('[hidden]')) return false; return true; };
  const path = (e) => { const p = []; for (let x = e; x && p.length < 3 && x !== document.body; x = x.parentElement) { p.unshift(x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); } return p.join(' > '); };
  for (const root of roots) {
    for (const e of root.querySelectorAll('*')) {
      if (!visible(e)) continue;
      if (exclude && e.closest(exclude)) continue;
      const cs = getComputedStyle(e);
      if (inlineish(cs.display)) continue;
      if (e.closest('svg') || e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || e.tagName === 'BUTTON' || e.tagName === 'SELECT' || e.tagName === 'INPUT' || e.tagName === 'OPTION' || e.tagName === 'LABEL') continue;
      // a leaf block: no visible non-inline descendant with text
      let hasBlockChild = false;
      for (const c of e.querySelectorAll('*')) { if (!visible(c)) continue; const d = getComputedStyle(c).display; if (!inlineish(d) && c.innerText && c.innerText.trim()) { hasBlockChild = true; break; } }
      if (hasBlockChild) continue;
      const text = (e.innerText || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const words = text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (words < minWords) continue;
      const range = document.createRange(); range.selectNodeContents(e);
      const mids = [];
      for (const x of range.getClientRects()) { if (x.width < 0.5 || x.height < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m); }
      const b = e.getBoundingClientRect();
      const facts = text.split(/ · |; |\. (?=[A-Z])/).filter((s) => s.trim()).length;
      out.push({ path: path(e), text, words, lines: mids.length, facts, fs: parseFloat(cs.fontSize), top: Math.round(b.top), cut: e.scrollWidth > e.clientWidth + 1 && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') });
    }
  }
  return out;
})
